import * as THREE from 'three';
import type { Enemy } from '../sim/level';
import type { Fx } from './fx';
import { clamp } from '../util';
import { audio } from '../audio';
import { HALF_W } from '../sim/types';

/** Glass ground off the runners: pale, low, soft (never a speck that could pass for a shot). */
const SHAVE = new THREE.Color(0x9ab4a6);
const SHAVE_END = new THREE.Color(0x5e7a6c);
const SPARK = 0xfff0c8;
/** What the sail's made of, for its rags as it tears (tools/models/enemies_ashgrave.py BANNER). */
const UP = new THREE.Vector3(0, 1, 0);
const AFT = new THREE.Vector3(0, 0, 1);
const SPILL = new THREE.Quaternion();
const HEEL = new THREE.Quaternion();
const RAGS = [0x8f979c, 0x8e2a1e, 0x6e6a5c, 0xe6dcc8, 0xf0c030].map((c) => new THREE.Color(c));

/**
 * A Glass Skater drawn from what it's doing: its rig (mast and sail, heeled out over its lee
 * outrigger) sheeted in and drawing while it skates; through the tell the sail luffs, the leech
 * flogging, and the runners shriek and spark; slewed, the sled heels onto its outrigger and the
 * sail's let fly, spilled and slack, while it slides; then it's sheeted in again. Glass shavings
 * spray off the runners all the while it runs. The idle clip only shivers the cloth.
 */
export class SkaterRig {
  private rig: THREE.Object3D;
  private leech: THREE.Object3D | null;
  private rest: THREE.Quaternion;
  private leechRest: THREE.Euler | null;
  private state = '';
  private t = Math.random() * 10;
  private spray = 0;
  /** How far slewed it's drawn (0 running, 1 broadside), and how far the sail's let fly. */
  private heel = 0;
  private spill = 0;

  private constructor(rig: THREE.Object3D, leech: THREE.Object3D | null) {
    this.rig = rig;
    this.leech = leech;
    this.rest = rig.quaternion.clone();
    this.leechRest = leech ? leech.rotation.clone() : null;
  }

  /** A rig for a model with a `…_rig` (and a `…_sail_leech` on it), else null. */
  static of(obj: THREE.Object3D): SkaterRig | null {
    let rig: THREE.Object3D | null = null;
    let leech: THREE.Object3D | null = null;
    obj.traverse((o) => {
      if (!rig && o.name.endsWith('_rig')) rig = o;
      else if (!leech && o.name.endsWith('_sail_leech')) leech = o;
    });
    return rig ? new SkaterRig(rig, leech) : null;
  }

  /** Poses it for this frame (after its clip), and throws its spray. `gz`: its ground z. */
  update(e: Enemy, obj: THREE.Object3D, gz: number, fx: Fx, shake: (k: number) => void, dt: number) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const st = e.state;
    const k = e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0;
    const pan = clamp(e.x / HALF_W, -1, 1);
    if (st !== this.state) {
      if (st === 'windup') audio.play('skate_luff', { pan });
      else if (st === 'attack') this.slew(e, gz, fx, shake, pan);
      this.state = st;
    }
    const slewed = st === 'attack' || (st === 'recover' && k < 0.65);
    this.heel += ((slewed ? 1 : 0) - this.heel) * Math.min(1, dt * (slewed ? 9 : 3));
    const spilt = st === 'windup' ? k * 0.6 : slewed ? 1 : 0;
    this.spill += (spilt - this.spill) * Math.min(1, dt * 6);

    // the sled heels onto the outrigger it's sliding towards; it digs its bow in as it slews
    obj.rotation.order = 'YXZ';
    obj.rotation.z = -(e.d.turn ?? 1) * 0.16 * this.heel;
    obj.rotation.x = 0.06 * this.heel;
    // the rig: sheeted in it lies heeled out and draws; let fly, it flops out flatter and swings off the wind
    // (turned about the hull's own axes: up, and fore and aft, where the heel is)
    SPILL.setFromAxisAngle(UP, 0.45 * this.spill).multiply(HEEL.setFromAxisAngle(AFT, 0.35 * this.spill));
    this.rig.quaternion.copy(SPILL).multiply(this.rest);
    // the leech: shivering at a run, flogging in the luff, slack and lifting when it's let fly
    if (this.leech && this.leechRest) {
      const flog = st === 'windup' ? 0.35 * Math.sin(this.t * 38) * (0.4 + k) : this.spill * 0.18 * Math.sin(this.t * 9) + 0.06 * Math.sin(this.t * 16);
      this.leech.rotation.x = this.leechRest.x - 0.35 * this.spill + flog;
    }

    // shavings off the runners while it runs; a shriek of sparks in the tell
    const sin = Math.sin(e.heading);
    const cos = Math.cos(e.heading);
    const at = (fwd: number, side: number) => ({ x: e.x + sin * fwd + cos * side, z: gz + cos * fwd - sin * side });
    this.spray -= dt;
    if (this.spray <= 0 && (st === 'idle' || st === 'windup')) {
      this.spray = 0.05;
      for (const [f, s] of [[-1.3, -2.05], [-1.3, 2.3], [2.4, 0]] as const) {
        const p = at(f, s);
        fx.add({ x: p.x, y: e.y + 0.1, z: p.z, vx: -sin * 3 + (Math.random() - 0.5) * 2.5, vy: 0.6 + Math.random(), vz: -cos * 3 + (Math.random() - 0.5) * 2.5, size: 0.55 + Math.random() * 0.25, grow: 2.2, life: 0.5, color: SHAVE, to: SHAVE_END, drag: 3, glow: false });
      }
    }
    if (st === 'windup' && Math.random() < 0.5 + k * 0.5) {
      const p = at(-1.3, Math.random() < 0.5 ? -2.05 : 2.3);
      fx.sparks(p.x, e.y + 0.15, p.z, 2, SPARK, 7, 0.18, 0.16, false);
    }
  }

  /** The slew: it throws its tail round with a scream off the runners and a wave of glass ground across the gutter. */
  private slew(e: Enemy, gz: number, fx: Fx, shake: (k: number) => void, pan: number) {
    audio.play('skate_slew', { pan });
    shake(0.06);
    const turn = e.d.turn ?? 1;
    const side = e.heading + Math.PI / 2;
    for (let n = 0; n < 14; n++) {
      const a = side + (Math.random() - 0.5) * 1.2;
      const v = 4 + Math.random() * 5;
      fx.add({ x: e.x - Math.sin(side) * turn * 1.5, y: e.y + 0.15, z: gz - Math.cos(side) * turn * 1.5, vx: -Math.sin(a) * turn * v, vy: 1 + Math.random() * 2, vz: -Math.cos(a) * turn * v, size: 0.4 + Math.random() * 0.3, grow: 2, life: 0.6, color: SHAVE, to: SHAVE_END, drag: 3.5, glow: false });
    }
    fx.sparks(e.x, e.y + 0.2, gz, 14, SPARK, 12, 0.3, 0.18, false);
  }

  /** Killed: the sail tears away in rags, the clan's hand and its banners tumbling off down the wind. */
  burst(e: Enemy, gz: number, fx: Fx) {
    const p = new THREE.Vector3();
    this.rig.getWorldPosition(p);
    for (let n = 0; n < 9; n++) {
      const c = RAGS[n % RAGS.length];
      fx.add({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + 1 + Math.random() * 1.5, z: p.z + (Math.random() - 0.5) * 2, vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: 2 + Math.random() * 4, size: 0.5 + Math.random() * 0.4, life: 1.6 + Math.random(), color: c, solid: true, gravity: 6, spin: 4 + Math.random() * 6, drag: 1.5, glow: false, carried: false });
    }
    fx.sparks(e.x, e.y + 0.3, gz, 10, SPARK, 10, 0.3, 0.18, false);
  }
}
