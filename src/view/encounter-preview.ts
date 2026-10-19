import * as THREE from 'three';
import type { Game } from '../game/game';
import type { ChartNode } from '../sim/chart';
import type { Run } from '../sim/run';
import { levelSpec } from '../sim/run';
import type { Biome, EnemySkin, Planet } from '../world/planets';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { HAULER_SKINS, LIVERY, ShipModel } from './ship-model';
import { Stage } from './stage';
import { RUNNER } from '../sim/heist';
import { clamp, noise2, pick, rng, type Rng } from '../util';

/**
 * A little diorama of what's waiting at a site, for the star chart's card: the ground you'll fly
 * over first, your ship, and what you'll meet there (a raid's wing of the planet's own fliers, a
 * hunt's elite and its escort, the Warden itself). Built once per site, shown
 * while it's picked.
 */
export class EncounterPreview {
  readonly stage: Stage;
  private ship: ShipModel;
  private insts: Instance[] = [];
  private bob: { obj: THREE.Object3D; y: number; k: number }[] = [];
  private spin: THREE.Object3D[] = [];
  private owned: THREE.BufferGeometry[] = [];
  private t = 0;

  constructor(run: Run, node: ChartNode, w: number, h: number) {
    const c = run.chart;
    const gate = node.kind === 'gate';
    const planet = gate ? c.bossPlanet : node.planet!;
    const mode = gate ? 'boss' : node.kind === 'hunt' || node.kind === 'escort' || node.kind === 'heist' ? node.kind : 'raid';
    const escort = node.kind === 'escort';
    const heist = node.kind === 'heist';
    // the ground you'll fly over first
    const biome = levelSpec(planet, mode, node.seed, 0).biomes[0];
    this.stage = new Stage(w, h, gate ? 6.5 : 11, 50, new THREE.Vector3(0, 3, gate ? -2 : -0.6));
    const s = this.stage;
    s.scene.background = new THREE.Color(biome.ground[1]).multiplyScalar(0.4);
    s.sun.color.setHex(biome.sun);
    s.hemi.color.setHex(biome.sky);
    s.hemi.groundColor.setHex(biome.bounce);
    const r = rng(node.seed ^ 0x9e3);
    this.ground(biome, r);
    this.props(biome, r);

    this.ship = new ShipModel(run.crew[0].build, LIVERY[0]);
    this.ship.root.position.set(0, 3, gate ? 3.4 : escort || heist ? 3.6 : 2.4);
    this.ship.root.scale.setScalar(gate ? 1 : escort || heist ? 0.7 : 0.85);
    s.scene.add(this.ship.root);

    if (gate) this.warden(planet);
    else if (escort) this.convoy(planet, node, r);
    else if (heist) this.runner(planet, r);
    else this.wing(planet, node, r);
  }

  /** Rolling ground in the biome's colours, and its sea (or lava) in the low parts. */
  private ground(b: Biome, r: Rng) {
    const geo = new THREE.PlaneGeometry(44, 30, 30, 20);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const cols: number[] = [];
    const col = new THREE.Color();
    const seed = r() * 100;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let n = noise2(x * 0.12 + seed, z * 0.12) * 0.7 + noise2(x * 0.4, z * 0.4 + seed) * 0.3;
      pos.setY(i, n * 1.2);
      const k = clamp(Math.floor((n + 0.9) * 2), 0, 3);
      col.setHex(b.ground[k]);
      cols.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    this.owned.push(geo);
    this.stage.scene.add(new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })));
    if (b.water !== null) {
      const mat = b.waterGlow ? flat(b.waterColor, { opacity: 0.9 }) : toon(b.waterColor, { opacity: 0.85, transparent: true });
      this.stage.scene.add(part(GEO.plane, mat, [0, -0.15, 0], [44, 30, 1], [-Math.PI / 2, 0, 0]));
    }
  }

  /** A few of the biome's own props, off to the sides where they won't hide the fight. */
  private props(b: Biome, r: Rng) {
    const kinds = b.props.filter(([k]) => library.has(k));
    if (!kinds.length) return;
    for (let k = 0; k < 9; k++) {
      const [kind] = pick(r, kinds);
      const inst = library.clone(kind, Math.floor(r() * library.variants(kind)));
      if (!inst) continue;
      const side = k % 2 ? 1 : -1;
      inst.obj.position.set(side * (6.5 + r() * 5), 0, -8 + r() * 14);
      inst.obj.rotation.y = r() * Math.PI * 2;
      inst.obj.scale.setScalar(0.7 + r() * 0.4);
      this.stage.scene.add(inst.obj);
      this.insts.push(inst);
    }
  }

  private enemy(skin: EnemySkin, x: number, y: number, z: number, scale: number, elite: boolean) {
    const inst = library.clone(`enemy_${skin.archetype}_${skin.kind}`, 0, skin.colors, true) ?? library.clone(`enemy_${skin.archetype}_mech`, 0, skin.colors, true);
    const obj = inst?.obj ?? part(GEO.oct, toon(skin.colors[0]), [0, 0, 0], [1.6, 0.7, 1.6]);
    if (inst) this.insts.push(inst);
    obj.position.set(x, y, z);
    obj.rotation.y = Math.PI;
    obj.scale.setScalar(scale);
    this.stage.scene.add(obj);
    this.bob.push({ obj, y, k: this.bob.length * 1.7 });
    if (elite) {
      const ring = part(new THREE.RingGeometry(1.5 * scale, 1.75 * scale, 6), flat(0xffd04a), [x, y - 0.5, z], 1, [-Math.PI / 2, 0, 0]);
      this.owned.push(ring.geometry);
      this.stage.scene.add(ring);
      this.spin.push(ring);
    }
  }

  /** A raid's wing, or a hunt's elite with its escort: the planet's own fliers. */
  private wing(planet: Planet, node: ChartNode, r: Rng) {
    const fliers = planet.enemies.filter((e) => e.archetype !== 'turret' && e.archetype !== 'serpent');
    const pool = fliers.length ? fliers : planet.enemies;
    const small = pool.filter((e) => e.archetype === 'dart' || e.archetype === 'swarm');
    const big = pool.filter((e) => ['gunship', 'brute', 'carrier', 'bomber'].includes(e.archetype));
    const escort = pick(r, small.length ? small : pool);
    if (node.kind === 'hunt' || node.elite) {
      const lead = pick(r, big.length ? big : pool);
      this.enemy(lead, 0, 3.2, -2.6, node.elite ? 1.5 : 1.3, true);
      this.enemy(escort, -4.6, 3, -1.4, 1.1, false);
      this.enemy(escort, 4.6, 3, -1.4, 1.1, false);
    } else {
      const mid = pick(r, pool);
      this.enemy(escort, -4.2, 3, -1.4, 1.1, false);
      this.enemy(mid, 0, 3.2, -2.6, 1.2, false);
      this.enemy(escort, 4.2, 3, -1.4, 1.1, false);
    }
  }

  /** An escort: three haulers in their column, and boarders closing in from one side. */
  private convoy(planet: Planet, node: ChartNode, r: Rng) {
    const side = r() < 0.5 ? -1 : 1;
    // the lead up front, two behind it, the boarders' side left clear
    const at = [
      [-side * 1.4, -2.2],
      [-side * 5, 0.4],
      [side * 2.2, 0.8],
    ];
    at.forEach(([x, z], i) => {
      const inst = library.clone('hauler', (i + node.seed) % 3, HAULER_SKINS[i], true);
      if (!inst) return;
      this.insts.push(inst);
      inst.obj.position.set(x, 1.6, z);
      inst.obj.scale.setScalar(0.62);
      this.stage.scene.add(inst.obj);
      this.bob.push({ obj: inst.obj, y: 1.6, k: i * 2.1 });
    });
    const skin = planet.enemies.find((e) => e.archetype === 'dart') ?? planet.enemies.find((e) => e.archetype === 'swarm') ?? planet.enemies[0];
    for (let k = 0; k < 2; k++) {
      this.enemy({ ...skin, archetype: 'dart' }, side * (5.4 + k * 1.2), 3.2, -2.8 + k * 1.8, 0.9, false);
      // diving in on the haulers
      this.bob[this.bob.length - 1].obj.rotation.y = -side * Math.PI * 0.6;
    }
  }

  /**
   * A heist: the runner making off up the frame in its owner's colours, engines blazing, two
   * strongboxes still clamped on and the third already tumbling loose on its drogue.
   */
  private runner(planet: Planet, r: Rng) {
    const skin = (planet.enemies.find((e) => e.archetype === 'carrier') ?? planet.enemies[0]).colors;
    const rig = new THREE.Group();
    const add = (kind: string, x: number, y: number, z: number, own = skin as [number, number, number] | undefined) => {
      const inst = library.clone(kind, 0, own, true);
      if (!inst) return null;
      this.insts.push(inst);
      inst.obj.position.set(x, y, z);
      rig.add(inst.obj);
      return inst.obj;
    };
    add('runner', 0, 0, 0);
    const loose = r() < 0.5 ? 0 : 1;
    RUNNER.pods.forEach((p, k) => {
      if (k === loose) return;
      const o = add('runner_pod', p.x, p.y, p.z);
      const chute = o?.getObjectByName('runner_pod_chute');
      if (chute) chute.visible = false;
    });
    RUNNER.engines.forEach((p) => add('runner_engine', p.x, -0.1, p.z));
    RUNNER.turrets.forEach((p) => {
      const o = add('runner_turret', p.x, 0.6, p.z);
      if (o) o.rotation.y = Math.PI + Math.sign(p.x) * 0.5;
    });
    rig.position.set(0, 1.6, -3.4);
    rig.scale.setScalar(0.5);
    rig.rotation.z = 0.08;
    this.stage.scene.add(rig);
    this.bob.push({ obj: rig, y: 1.6, k: 0 });
    // the loose one, dropping back on its drogue
    const box = library.clone('runner_pod', 0, undefined, true);
    if (box) {
      this.insts.push(box);
      const sx = RUNNER.pods[loose].x < 0 ? -1 : 1;
      box.obj.position.set(sx * 4.6, 2.6, 0.6);
      box.obj.rotation.set(0.2, sx * 0.5, sx * 0.3);
      box.obj.scale.setScalar(0.6);
      this.stage.scene.add(box.obj);
      this.bob.push({ obj: box.obj, y: 2.6, k: 2.3 });
    }
  }

  /** The Warden, filling the frame, lit red from below. */
  private warden(planet: Planet) {
    const b = planet.boss;
    const inst = library.clone(`boss_${planet.id}`, 0, b.colors, true);
    const obj = inst?.obj ?? part(GEO.dodeca, toon(b.colors[0]), [0, 0, 0], 4);
    if (inst) this.insts.push(inst);
    obj.position.set(0, 2.5, -4);
    this.stage.scene.add(obj);
    this.bob.push({ obj, y: 2.5, k: 0 });
    const glow = new THREE.PointLight(0xff3a3a, 60, 18, 1.4);
    glow.position.set(0, 0.5, -1);
    this.stage.scene.add(glow);
  }

  update(dt: number) {
    this.t += dt;
    for (const i of this.insts) i.update(dt);
    for (const b of this.bob) b.obj.position.y = b.y + Math.sin(this.t * 2.2 + b.k) * 0.18;
    for (const s of this.spin) s.rotation.z += dt * 1.6;
    this.ship.update(dt);
    // the ship weaves a little, as if lining up
    this.ship.root.position.x = Math.sin(this.t * 0.9) * 0.6;
    this.ship.body.rotation.z = -Math.cos(this.t * 0.9) * 0.18;
  }

  render(game: Game, x: number, y: number) {
    this.stage.render(game, x, y);
  }

  dispose() {
    for (const i of this.insts) i.dispose();
    for (const g of this.owned) g.dispose();
    this.ship.dispose();
  }
}
