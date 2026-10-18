import * as THREE from 'three';
import type { Game } from '../game/game';
import type { ChartNode } from '../sim/chart';
import type { Run } from '../sim/run';
import { levelSpec } from '../sim/run';
import type { Biome, EnemySkin, Planet } from '../world/planets';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { LIVERY, ShipModel } from './ship-model';
import { Stage } from './stage';
import { clamp, noise2, pick, rng, type Rng } from '../util';

/**
 * A little diorama of what's waiting at a site, for the star chart's card: the ground you'll fly
 * over first, your ship, and what you'll meet there (a raid's wing of the planet's own fliers, a
 * hunt's elite and its escort, a race's rings, the Warden itself). Built once per site, shown
 * while it's picked.
 */
export class EncounterPreview {
  readonly stage: Stage;
  private ship: ShipModel;
  private insts: Instance[] = [];
  private bob: { obj: THREE.Object3D; y: number; k: number }[] = [];
  private rings: THREE.Object3D[] = [];
  private streaks: THREE.Mesh[] = [];
  private spin: THREE.Object3D[] = [];
  private owned: THREE.BufferGeometry[] = [];
  private t = 0;

  constructor(run: Run, node: ChartNode, w: number, h: number) {
    const c = run.chart;
    const gate = node.kind === 'gate';
    const planet = gate ? c.bossPlanet : node.planet!;
    const mode = gate ? 'boss' : node.kind === 'run' ? 'run' : node.kind === 'hunt' ? 'hunt' : 'raid';
    // the ground you'll fly over first
    const biome = levelSpec(planet, mode, node.seed, 0).biomes[0];
    this.stage = new Stage(w, h, gate ? 6.5 : 11, 50, new THREE.Vector3(0, 3, gate ? -2 : -0.6));
    const s = this.stage;
    s.scene.background = new THREE.Color(biome.ground[1]).multiplyScalar(0.4);
    s.sun.color.setHex(biome.sun);
    s.hemi.color.setHex(biome.sky);
    s.hemi.groundColor.setHex(biome.bounce);
    const r = rng(node.seed ^ 0x9e3);
    this.ground(biome, r, node.kind === 'run');
    this.props(biome, r, node.kind === 'run');

    this.ship = new ShipModel(run.crew[0].build, LIVERY[0]);
    this.ship.root.position.set(0, 3, gate ? 3.4 : 2.4);
    this.ship.root.scale.setScalar(gate ? 1 : 0.85);
    s.scene.add(this.ship.root);

    if (gate) this.warden(planet);
    else if (node.kind === 'run') this.race();
    else this.wing(planet, node, r);
  }

  /** Rolling ground in the biome's colours, and its sea (or lava) in the low parts. */
  private ground(b: Biome, r: Rng, canyon: boolean) {
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
      // a race's gorge: walls up either side of a channel
      if (canyon) n = n * 0.3 + clamp((Math.abs(x - Math.sin(z * 0.2) * 2) - 5) * 0.35, -0.6, 1.6);
      pos.setY(i, n * (canyon ? 3 : 1.2));
      const k = clamp(Math.floor((n + 0.9) * 2), 0, 3);
      col.setHex(k === 3 && canyon ? b.cliff : b.ground[k]);
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
  private props(b: Biome, r: Rng, canyon: boolean) {
    const kinds = b.props.filter(([k]) => library.has(k));
    if (!kinds.length) return;
    for (let k = 0; k < 9; k++) {
      const [kind] = pick(r, kinds);
      const inst = library.clone(kind, Math.floor(r() * library.variants(kind)));
      if (!inst) continue;
      const side = k % 2 ? 1 : -1;
      inst.obj.position.set(side * ((canyon ? 7.5 : 6.5) + r() * 5), 0, -8 + r() * 14);
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

  /** A race: rings to thread, rushing at you. */
  private race() {
    for (let k = 0; k < 4; k++) {
      const ring = part(GEO.torus, toon(0xffc24a, { glow: 0.35 }), [0, 3, 0], [2.6, 2.6, 1.4]);
      this.rings.push(ring);
      this.stage.scene.add(ring);
    }
    for (let k = 0; k < 14; k++) {
      const m = part(GEO.box, flat(0xc8f0ff, { additive: true, opacity: 0.5 }), [0, 0, 0], [0.08, 0.08, 2.4]);
      m.userData.x = (k % 2 ? 1 : -1) * (2 + ((k * 37) % 9));
      m.userData.y = 1.5 + ((k * 13) % 5) * 0.6;
      m.userData.z = -14 + ((k * 23) % 22);
      this.streaks.push(m);
      this.stage.scene.add(m);
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
    this.ship.root.position.x = Math.sin(this.t * 0.9) * (this.rings.length ? 1.6 : 0.6);
    this.ship.body.rotation.z = -Math.cos(this.t * 0.9) * (this.rings.length ? 0.35 : 0.18);
    // rings and streaks coming on at speed, round again when they're past
    this.rings.forEach((ring, k) => {
      const z = -12 + ((this.t * 7 + k * 4.5) % 18);
      ring.position.set(Math.sin((z - this.t * 7) * 0.18) * 2.2, 3, z);
      ring.scale.set(2.6, 2.6, 1.4).multiplyScalar(clamp((z + 12) / 3, 0, 1) * clamp((6 - z) / 2, 0, 1));
    });
    for (const m of this.streaks) {
      const z = ((m.userData.z + this.t * 34 + 14) % 24) - 14;
      m.position.set(m.userData.x, m.userData.y, z);
    }
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
