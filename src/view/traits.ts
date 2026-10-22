import * as THREE from 'three';
import type { Level, LevelEvent, Sentinel } from '../sim/level';
import { CELL, partById } from '../game/parts';
import { FLIGHT_Y, HALF_W } from '../sim/types';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { LIVERY } from './ship-model';
import { MARK_HEX } from '../ui/mark-icons';
import { audio } from '../audio';
import type { Fx } from './fx';

/**
 * The legendary traits that play in flight, drawn:
 *
 *  - SENTINEL: the gun itself, in the ship's livery, on a little hover pad with a ring of lamps
 *    that go out one by one as its time runs down. It drops in with a clank, turns to what it
 *    shoots at, kicks back with each shot and blinks out at the end.
 *  - BOOMERANG: a shot on its way home trails the ship's colour, so you see it coming back.
 *  - FRENZIED: the guns spit embers, hotter with every kill in a row.
 *  - THUNDEROUS: the clap: lightning thrown out round the ship and a ring of air.
 *  - VENGEFUL: the nova: a ring of fire off the hull, the bullets round it gone in a flash.
 *  - RAVENOUS: every kill gives up a spark that flies to its killer's ship and is drunk.
 */

/** What the trait view needs of the level view: the pops, the bolts and the juice. */
export interface TraitHost {
  pop(text: string, x: number, z: number, color: string, big?: boolean): void;
  /** Takes back the pops that start with this (a count that's gone up says so in one place). */
  unpop(prefix: string): void;
  bolt(points: number[], color: number): void;
  juice(o: { trauma?: number; hitstop?: number; flash?: number; flashColor?: number; dx?: number; dz?: number; shove?: number }): void;
}

interface TurretView {
  root: THREE.Group;
  /** Turns to aim; the gun sits in it, kicked back along its aim on each shot. */
  aim: THREE.Group;
  gun: THREE.Object3D;
  inst: Instance | null;
  lamps: THREE.Mesh[];
  shots: number;
  kick: number;
  x: number;
  z: number;
}

interface Mote {
  owner: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
}

const LAMPS = 10;
const THUNDER = new THREE.Color(MARK_HEX.shock);
const WHITE = new THREE.Color(0xffffff);
const EMBER = new THREE.Color(0xff8a3a);
const EMBER_HOT = new THREE.Color(0xffe08a);
const EMBER_END = new THREE.Color(0x8a1a0a);
const FEED = new THREE.Color(0xffe08a).multiplyScalar(1.4);
const FEED_END = new THREE.Color(0xff9a3a);
const NOVA_HOT = new THREE.Color(0xfff0c0).multiplyScalar(1.5);
const NOVA_END = new THREE.Color(0xc0301a);

export class TraitsView {
  private turrets = new Map<Sentinel, TurretView>();
  private motes: Mote[] = [];
  private c = new THREE.Color();
  private time = 0;
  /** Kills in a row per player (FRENZIED), as the view last heard. */
  private frenzy = [0, 0];

  constructor(
    private readonly lv: Level,
    private readonly scene: THREE.Scene,
    private readonly fx: Fx,
    private readonly host: TraitHost,
  ) {}

  /** The events that are this view's to make a fuss of. Returns true if it took it. */
  handle(e: LevelEvent): boolean {
    const lv = this.lv;
    switch (e.type) {
      case 'sentinel': {
        const col = LIVERY[e.id][2];
        this.fx.ring(e.x, FLIGHT_Y - 0.2, e.z, 3.2, 0.25, true, col);
        this.fx.sparks(e.x, FLIGHT_Y, e.z, 10, col, 12, 0.3, 0.2);
        this.fx.add({ x: e.x, y: FLIGHT_Y + 0.8, z: e.z, size: 3, grow: 0.3, life: 0.1, color: WHITE, carried: true });
        audio.play('sentinel', { pan: e.x / HALF_W });
        return true;
      }
      case 'turn':
        this.fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 3, 0xfff0c0, 7, 0.16, 0.16);
        audio.play('boomerang', { pan: e.x / HALF_W, vol: 0.5 });
        return true;
      case 'frenzy': {
        const p = lv.players[e.id];
        const was = this.frenzy[e.id] ?? 0;
        this.frenzy[e.id] = e.stacks;
        if (!p) return true;
        if (e.stacks === 0) {
          if (was >= 2) {
            this.host.pop('FRENZY COOLS', p.x, p.z + 3, '#a08070');
            audio.play('frenzy_off', { pan: p.x / HALF_W });
          }
        } else if (e.stacks > was) {
          const max = e.stacks >= 6;
          if (max && was < 6) {
            this.host.pop('FRENZY!', p.x, p.z - 4, '#ff7a3a', true);
            this.fx.ring(p.x, FLIGHT_Y, p.z, 5, 0.3, true, 0xff7a3a);
            this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 18, 0xff9a4a, 18, 0.35, 0.22);
            audio.play('frenzy_max', { pan: p.x / HALF_W });
          } else if (!max) {
            this.host.unpop('FRENZY');
            this.host.pop(`FRENZY ${e.stacks}`, p.x, p.z + 3, FRENZY_COLOR[e.stacks] ?? '#ff7a3a');
            audio.play('frenzy', { pan: p.x / HALF_W, pitch: 1 + e.stacks * 0.09 });
          }
        }
        return true;
      }
      case 'thunder': {
        // the air cracks: lightning out to the clap's edge, a ring of air, the bullets blown off
        const n = e.perfect ? 10 : 7;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
          const pts = [e.x, e.z];
          let r = 0;
          while (r < e.r) {
            r += 1.4 + Math.random() * 1.2;
            const w = a + (Math.random() - 0.5) * 0.7;
            pts.push(e.x + Math.cos(w) * r, e.z + Math.sin(w) * r * 0.85);
          }
          this.host.bolt(pts, k % 3 ? MARK_HEX.shock : 0xffffff);
        }
        this.fx.ring(e.x, FLIGHT_Y, e.z, e.r * 2, 0.32, true, MARK_HEX.shock);
        this.fx.ring(e.x, FLIGHT_Y, e.z, e.r * 1.1, 0.16, true, 0xffffff);
        this.fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: e.r * 1.4, grow: 1.4, life: 0.12, color: this.c.copy(THUNDER).multiplyScalar(0.8), carried: true });
        this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, e.perfect ? 26 : 14, MARK_HEX.shock, 26, 0.3, 0.2);
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x: e.x, y: FLIGHT_Y, z: e.z, vx: Math.cos(a) * 22, vz: Math.sin(a) * 22, size: 0.8, grow: 2.6, life: 0.32, drag: 6, color: this.c.setHex(0xe8eef8), glow: false, carried: true });
        }
        if (e.perfect) this.host.pop('THUNDERCLAP!', e.x, e.z - 4, '#c8b0ff', true);
        this.host.juice({ trauma: e.perfect ? 0.35 : 0.18, hitstop: e.hit ? (e.perfect ? 4 : 2) : 0, flash: e.perfect ? 0.3 : 0.12, flashColor: MARK_HEX.shock });
        audio.play('thunder', { pan: e.x / HALF_W, pitch: e.perfect ? 0.85 : 1, vol: e.perfect ? 1 : 0.75 });
        return true;
      }
      case 'nova': {
        const col = LIVERY[e.id][2];
        this.fx.ring(e.x, FLIGHT_Y, e.z, 18, 0.4, true, 0xffc070);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 10, 0.22, true, 0xffffff);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.3, true, col);
        this.fx.add({ x: e.x, y: FLIGHT_Y + 1.2, z: e.z, size: 7, grow: 1.8, life: 0.14, color: NOVA_HOT, carried: true });
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, vx: Math.cos(a) * 26, vz: Math.sin(a) * 26, size: 0.9, grow: 1.6, life: 0.3, drag: 4, color: EMBER_HOT, to: NOVA_END, carried: true });
        }
        this.host.pop(e.power >= 2 ? 'VENGEANCE!' : 'NOVA', e.x, e.z - 4, e.power >= 2 ? '#ff7a4a' : '#ffc070', e.power >= 2);
        this.host.juice({ trauma: 0.3 + 0.1 * e.power, hitstop: 3, flash: 0.35, flashColor: 0xffb060 });
        audio.play('nova', { pan: e.x / HALF_W, pitch: 1.15 - e.power * 0.1 });
        return true;
      }
      case 'feed': {
        // the kill gives up a spark, thrown out a little before it turns for home
        const a = Math.random() * Math.PI * 2;
        this.motes.push({ owner: e.id, x: e.x, z: e.z, vx: Math.cos(a) * 16, vz: Math.sin(a) * 16, t: 0 });
        this.fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: 1.6, grow: 0.3, life: 0.12, color: FEED, carried: true });
        return true;
      }
    }
    return false;
  }

  update(dt: number, scrollDz: number) {
    this.time += dt;
    this.updateTurrets(dt, scrollDz);
    this.updateMotes(dt, scrollDz);
    const lv = this.lv;
    // homeward shots trail their ship's colour
    for (const s of lv.shots) {
      if (!s.back || s.dead) continue;
      this.fx.add({ x: s.x, y: FLIGHT_Y + 0.6, z: s.z, size: 0.55, grow: 0.2, life: 0.12, color: this.c.setHex(LIVERY[s.owner]?.[2] ?? 0xffffff), carried: true });
    }
    // a frenzy: embers off the guns, more and hotter with every kill in a row
    for (const p of lv.players) {
      if (p.down || p.frenzy <= 0) continue;
      const k = p.frenzy / 6;
      p.stats.guns.forEach((g) => {
        if (!g.frenzied || Math.random() > 0.15 + k * 0.6) return;
        this.fx.add({
          x: p.x + g.x + (Math.random() - 0.5) * 0.4, y: FLIGHT_Y + 0.7, z: p.z + g.z,
          vx: (Math.random() - 0.5) * 4, vz: 4 + Math.random() * 6, vy: 2,
          size: 0.2 + k * 0.25, grow: 0.3, life: 0.25 + k * 0.2, color: k > 0.8 ? EMBER_HOT : EMBER, to: EMBER_END, carried: true,
        });
      });
      // as it's about to cool off, the embers gutter
      if (p.frenzyT < 0.6 && Math.random() < 0.3) this.fx.add({ x: p.x, y: FLIGHT_Y + 0.5, z: p.z + 0.8, vy: 2, vz: 3, size: 0.5, grow: 2, life: 0.4, color: this.c.setHex(0x5a4848), glow: false, carried: true });
    }
  }

  private updateTurrets(dt: number, scrollDz: number) {
    const seen = new Set<Sentinel>();
    for (const t of this.lv.sentinels) {
      if (t.dead) continue;
      seen.add(t);
      let v = this.turrets.get(t);
      if (!v) {
        v = this.make(t);
        this.turrets.set(t, v);
      }
      v.x = t.x;
      v.z = t.z;
      // it drops in big and settles, bobs on its pad, and blinks as its time runs out
      const pop = t.t < 0.25 ? 1 + 0.35 * Math.sin((t.t / 0.25) * Math.PI) : 1;
      const left = t.life - t.t;
      v.root.visible = left > 0.7 || Math.floor(this.time * (left < 0.35 ? 22 : 12)) % 2 === 0;
      v.root.position.set(t.x, FLIGHT_Y - 0.3 + Math.sin(this.time * 3 + t.x) * 0.1, t.z);
      v.root.scale.setScalar(Math.min(1, t.t / 0.08) * pop * 1.5);
      v.aim.rotation.y = -t.dir;
      if (t.shots !== v.shots) {
        v.shots = t.shots;
        v.kick = 1;
      }
      v.kick = Math.max(0, v.kick - dt * 9);
      v.gun.position.z = v.kick * 0.28;
      v.inst?.update(dt);
      // the lamps go out one by one, the last blinking
      const lit = Math.ceil((left / t.life) * LAMPS);
      v.lamps.forEach((l, k) => (l.visible = k < lit - 1 || (k === lit - 1 && Math.floor(this.time * 8) % 2 === 0)));
      // the pad's light on what's below
      if (Math.random() < 0.3) this.fx.add({ x: t.x, y: FLIGHT_Y - 0.5, z: t.z, size: 1.6, grow: 0.6, life: 0.1, color: this.c.setHex(LIVERY[t.owner]?.[2] ?? 0xffffff).multiplyScalar(0.35), carried: true });
    }
    for (const [t, v] of this.turrets)
      if (!seen.has(t)) {
        // winked out: a puff and a spit of sparks where it was
        this.fx.sparks(v.x, FLIGHT_Y, v.z, 8, LIVERY[t.owner]?.[2] ?? 0xffffff, 10, 0.25, 0.18);
        this.fx.add({ x: v.x, y: FLIGHT_Y, z: v.z, vy: 1.5, size: 1, grow: 2.4, life: 0.45, color: this.c.setHex(0x8a8290), glow: false, carried: true });
        this.fx.ring(v.x, FLIGHT_Y - 0.2, v.z, 2.4, 0.18, true, LIVERY[t.owner]?.[2] ?? 0xffffff);
        if (this.lv.state !== 'clear') audio.play('sentinel_out', { pan: v.x / HALF_W, vol: 0.6 });
        this.scene.remove(v.root);
        v.inst?.dispose();
        this.turrets.delete(t);
      }
    void scrollDz;
  }

  /** A turret: the gun, in the livery, on a hex pad with a ring of lamps. */
  private make(t: Sentinel): TurretView {
    const livery = LIVERY[t.owner] ?? LIVERY[0];
    const g = this.lv.players[t.owner]?.stats.guns[t.gun];
    const id = g?.part.id ?? 'rivet';
    const root = new THREE.Group();
    // the pad: dark plate, a lit rim, three stubby legs underneath
    root.add(part(new THREE.CylinderGeometry(1.05, 0.85, 0.22, 6), toon(0x2a2630), [0, -0.1, 0], 1));
    root.add(part(new THREE.CylinderGeometry(0.75, 0.75, 0.24, 6), toon(livery[0]), [0, -0.02, 0], 1));
    root.add(part(new THREE.TorusGeometry(1.08, 0.06, 4, 6), flat(livery[2], { additive: true }), [0, -0.08, 0], 1, [Math.PI / 2, 0, Math.PI / 6]));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      root.add(part(GEO.box, toon(0x3a3440), [Math.cos(a) * 0.7, -0.35, Math.sin(a) * 0.7], [0.18, 0.4, 0.18], [0, -a, 0.35]));
    }
    const lamps: THREE.Mesh[] = [];
    for (let k = 0; k < LAMPS; k++) {
      const a = -Math.PI / 2 + (k / LAMPS) * Math.PI * 2;
      const l = part(GEO.box, flat(livery[2], { additive: true }), [Math.cos(a) * 1.18, 0.08, Math.sin(a) * 1.18], [0.2, 0.12, 0.2]);
      lamps.push(l);
      root.add(l);
    }
    // the gun, turned round the middle of its cells
    const aim = new THREE.Group();
    aim.position.y = 0.1;
    root.add(aim);
    const inst = library.clone(`part_${id}`, 0, livery, true);
    const gun = new THREE.Group();
    const model = inst?.obj ?? part(GEO.box, toon(0x6a6a72), [0, 0.25, 0], [0.5, 0.5, 0.9]);
    const shape = partById(id).shape;
    const mc = shape.reduce((s, [c]) => s + c, 0) / shape.length;
    const mr = shape.reduce((s, [, r]) => s + r, 0) / shape.length;
    model.position.set(-mc * CELL, 0, -mr * CELL);
    gun.add(model);
    gun.scale.setScalar(1.25);
    aim.add(gun);
    root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
    this.scene.add(root);
    return { root, aim, gun, inst, lamps, shots: 0, kick: 0, x: t.x, z: t.z };
  }

  private updateMotes(dt: number, scrollDz: number) {
    const lv = this.lv;
    for (const m of this.motes) {
      m.t += dt;
      m.z += scrollDz;
      const p = lv.players[m.owner];
      if (!p) {
        m.t = 99;
        continue;
      }
      // a little drift out, then pulled home harder and harder
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const d = Math.hypot(dx, dz) || 1;
      const pull = 60 + m.t * 260;
      m.vx += (dx / d) * pull * dt;
      m.vz += (dz / d) * pull * dt;
      m.vx *= 1 - Math.min(1, dt * 4);
      m.vz *= 1 - Math.min(1, dt * 4);
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      this.fx.add({ x: m.x, y: FLIGHT_Y + 1, z: m.z, size: 0.55, grow: 0.2, life: 0.16, color: FEED, to: FEED_END, carried: true });
      if (d < 1.4 || m.t > 1.6) {
        m.t = 99;
        if (!p.down) {
          this.fx.sparks(p.x, FLIGHT_Y + 0.8, p.z, 5, 0xffe08a, 8, 0.2, 0.18);
          this.fx.add({ x: p.x, y: FLIGHT_Y + 1, z: p.z, size: 2.2, grow: 0.4, life: 0.1, color: FEED, carried: true });
          audio.play('feed', { pan: p.x / HALF_W, pitch: 0.9 + p.charge * 0.5 });
        }
      }
    }
    this.motes = this.motes.filter((m) => m.t < 99);
  }

  dispose() {
    for (const v of this.turrets.values()) {
      this.scene.remove(v.root);
      v.inst?.dispose();
    }
    this.turrets.clear();
  }
}

const FRENZY_COLOR: Record<number, string> = { 1: '#ffc08a', 2: '#ffb070', 3: '#ff9a5a', 4: '#ff8a4a', 5: '#ff7a3a' };
