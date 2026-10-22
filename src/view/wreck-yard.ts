import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Wreck } from '../game/grafts';
import type { Planet } from '../world/planets';
import { PALETTE } from '../sim/factions';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { cloneEnemy } from './enemy-model';
import { Stage } from './stage';
import { clamp, noise2, rng } from '../util';

interface Hulk {
  obj: THREE.Object3D;
  x: number;
  z: number;
  /** How big it lies, across. */
  r: number;
  fire: THREE.PointLight;
  column: THREE.Mesh;
  glow: THREE.MeshBasicMaterial;
  color: number;
  /** Seconds since it was stripped, or -1. */
  stripped: number;
  mats: THREE.MeshToonMaterial[];
}

interface Mote {
  m: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  smoke: boolean;
}

/**
 * The salvage screen's yard: the wrecks you took down, lying scorched where they fell on the
 * planet's ground, smoking, embers going up off them. The one whose graft is in focus has its
 * faction's light thrown up over it; the one stripped flares and goes dark.
 */
export class WreckYard {
  readonly stage: Stage;
  private hulks: Hulk[] = [];
  private insts: Instance[] = [];
  private motes: Mote[] = [];
  private owned: { dispose(): void }[] = [];
  private focus = -1;
  private t = 0;

  constructor(planet: Planet, wrecks: Wreck[], w: number, h: number) {
    this.stage = new Stage(w, h, 9, 52, new THREE.Vector3(0, 0, 0));
    const s = this.stage;
    const b = planet.biomes[0];
    s.scene.background = new THREE.Color(b.ground[0]).multiplyScalar(0.25);
    s.sun.color.setHex(b.sun).lerp(new THREE.Color(0xff9a6a), 0.4);
    s.sun.intensity = 1.5;
    s.hemi.color.setHex(b.sky).multiplyScalar(0.6);
    s.hemi.groundColor.setHex(b.bounce);
    s.hemi.intensity = 0.8;
    this.ground(b.ground, planet.id);
    const n = wrecks.length;
    // laid out down the yard, side to side, the Warden's in the middle
    const r = rng(wrecks.reduce((a, wk) => a + wk.title.length * 31, 7));
    wrecks.forEach((wk, k) => {
      const z = n === 1 ? 0 : -8 + (16 * k) / (n - 1);
      const x = n === 1 ? 0 : (k % 2 ? 2.6 : -2.6) + (r() - 0.5);
      this.hulk(wk, planet, x, z, r);
    });
  }

  private ground(cols: number[], seed: string) {
    const geo = new THREE.PlaneGeometry(40, 50, 26, 32);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    const out: number[] = [];
    const col = new THREE.Color();
    const sd = seed.length * 13.7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = noise2(x * 0.15 + sd, z * 0.15) * 0.7 + noise2(x * 0.5, z * 0.5 + sd) * 0.3;
      pos.setY(i, n * 0.9 - 0.4);
      col.setHex(cols[clamp(Math.floor((n + 0.9) * 2), 0, cols.length - 1)]).multiplyScalar(0.5);
      out.push(col.r, col.g, col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
    geo.computeVertexNormals();
    this.owned.push(geo);
    this.stage.scene.add(new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true })));
  }

  private hulk(wk: Wreck, planet: Planet, x: number, z: number, r: () => number) {
    const boss = !!wk.boss;
    let inst: Instance | null = null;
    if (boss) inst = library.clone(`boss_${planet.id}`, 0, planet.boss.colors, true);
    else if (wk.skin) inst = cloneEnemy(wk.skin, wk.model ?? wk.kind);
    const obj = inst?.obj ?? part(GEO.dodeca, toon(0x5a4a4a), [0, 0, 0], 2);
    if (inst) this.insts.push(inst);
    // fitted to the yard: a Warden big, an elite smaller
    const box = new THREE.Box3().setFromObject(obj);
    const size = Math.max(box.max.x - box.min.x, box.max.z - box.min.z, 0.01);
    const want = boss ? 12 : 6.4;
    obj.scale.multiplyScalar(want / size);
    // fallen: canted, half sunk, burnt
    const root = new THREE.Group();
    root.add(obj);
    root.position.set(x, boss ? -0.8 : -0.35, z);
    root.rotation.set((r() - 0.5) * 0.5, r() * Math.PI * 2, (r() - 0.5) * 0.6);
    this.stage.scene.add(root);
    const mats = inst?.mats ?? [];
    for (const m of mats) m.color.multiplyScalar(0.62);
    // the scorch under it
    const scorch = part(GEO.disc, flat(0x0a0608, { opacity: 0.7 }), [x, 0.02, z], want * 1.1, [-Math.PI / 2, 0, 0]);
    this.stage.scene.add(scorch);
    const fire = new THREE.PointLight(0xff7a2a, 30, want * 2.2, 1.6);
    fire.position.set(x, 1.4, z);
    this.stage.scene.add(fire);
    const color = PALETTE[wk.faction][2];
    const glow = flat(color, { own: true, additive: true, opacity: 0 });
    glow.depthWrite = false;
    const geo = new THREE.CylinderGeometry(want * 0.32, want * 0.42, 26, 16, 1, true);
    geo.translate(0, 13, 0);
    this.owned.push(geo, glow);
    const column = new THREE.Mesh(geo, glow);
    column.position.set(x, 0, z);
    this.stage.scene.add(column);
    this.hulks.push({ obj: root, x, z, r: want / 2, fire, column, glow, color, stripped: -1, mats });
  }

  /** Which wreck the graft in focus comes off (-1: none). */
  setFocus(k: number) {
    this.focus = k;
  }

  /** A wreck stripped of its graft: its light flares and its fires go out. */
  strip(k: number) {
    const h = this.hulks[k];
    if (!h) return;
    h.stripped = 0;
    for (let n = 0; n < 40; n++) this.mote(h, h.color, false, 1.6);
  }

  private mote(h: Hulk, color: number, smoke: boolean, kick = 1) {
    const mat = smoke ? flat(0x2a2028, { own: true, opacity: 0.5 }) : flat(color, { additive: true });
    const m = part(smoke ? GEO.sphere : GEO.box, mat, [h.x + (Math.random() - 0.5) * h.r, 0.6 + Math.random(), h.z + (Math.random() - 0.5) * h.r]);
    const a = Math.random() * Math.PI * 2;
    const out = smoke ? 0.3 : (0.4 + Math.random()) * kick;
    const life = smoke ? 2.5 + Math.random() * 1.5 : 0.8 + Math.random() * 1.2;
    const size = smoke ? 0.8 + Math.random() * 0.8 : 0.12 + Math.random() * 0.1;
    m.scale.setScalar(size);
    this.stage.scene.add(m);
    this.motes.push({ m, vx: Math.cos(a) * out, vy: smoke ? 1 : (2 + Math.random() * 2.5) * kick, vz: Math.sin(a) * out, life, max: life, size, grow: smoke ? 1.2 : 0, smoke });
  }

  update(dt: number) {
    this.t += dt;
    for (const i of this.insts) i.update(dt);
    this.hulks.forEach((h, k) => {
      const on = k === this.focus && h.stripped < 0;
      if (h.stripped >= 0) h.stripped += dt;
      // the column: up over the one in focus, a flare when stripped
      const flare = h.stripped >= 0 ? Math.max(0, 1 - h.stripped * 1.2) : 0;
      const want = on ? 0.22 + 0.08 * Math.sin(this.t * 5) : 0;
      h.glow.opacity += (Math.max(want, flare * 0.8) - h.glow.opacity) * Math.min(1, dt * (flare ? 30 : 8));
      h.column.visible = h.glow.opacity > 0.01;
      h.column.scale.set(1 + flare * 0.6, 1, 1 + flare * 0.6);
      // fire flickers; a stripped wreck's dies down
      const out = h.stripped >= 0 ? Math.max(0.15, 1 - h.stripped * 0.6) : 1;
      h.fire.intensity = (24 + Math.sin(this.t * 13 + k) * 6 + Math.sin(this.t * 31 + k * 3) * 4) * out + flare * 80;
      h.fire.color.setHex(flare > 0.2 ? h.color : 0xff7a2a);
      if (h.stripped >= 0 && h.stripped < 1) for (const m of h.mats) m.color.multiplyScalar(1 - dt * 0.4);
      // embers and smoke off it, the one in focus a little more
      if (Math.random() < dt * (on ? 16 : 7) * out) this.mote(h, Math.random() < 0.7 ? 0xff8a3a : 0xffd060, false);
      if (on && Math.random() < dt * 10) this.mote(h, h.color, false);
      if (Math.random() < dt * 2.2) this.mote(h, 0, true);
    });
    for (const m of this.motes) {
      m.life -= dt;
      m.m.position.x += (m.vx + Math.sin(this.t * 2 + m.max * 9) * 0.3) * dt;
      m.m.position.y += m.vy * dt;
      m.m.position.z += m.vz * dt;
      const f = m.life / m.max;
      if (m.smoke) {
        m.m.scale.setScalar(m.size * (1 + (1 - f) * m.grow * 2));
        (m.m.material as THREE.MeshBasicMaterial).opacity = 0.45 * Math.min(1, f * 2) * Math.min(1, (1 - f) * 6);
      } else m.m.scale.setScalar(m.size * f);
      if (m.life <= 0) {
        this.stage.scene.remove(m.m);
        if (m.smoke) (m.m.material as THREE.Material).dispose();
      }
    }
    this.motes = this.motes.filter((m) => m.life > 0);
  }

  /** Where over a wreck its name goes, in the yard's texels. */
  labelAt(k: number) {
    const h = this.hulks[k];
    return this.stage.project(new THREE.Vector3(h.x, h.r * 0.9 + 1.2, h.z - h.r * 0.35));
  }

  get count() {
    return this.hulks.length;
  }

  render(game: Game, x: number, y: number) {
    this.stage.render(game, x, y);
  }

  dispose() {
    for (const i of this.insts) i.dispose();
    for (const o of this.owned) o.dispose();
    for (const m of this.motes) if (m.smoke) (m.m.material as THREE.Material).dispose();
  }
}
