import * as THREE from 'three';
import type { Enemy } from '../sim/level';
import type { Fx } from './fx';
import { clamp } from '../util';
import { audio } from '../audio';
import { HALF_W } from '../sim/types';
import { EEL } from '../sim/foes';

const FOAM = new THREE.Color(0xd8ece6);
const FOAM_END = new THREE.Color(0x5a7a76);
const DROP = new THREE.Color(0xbfe0da);
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A Mire Eel drawn from what it's doing, not from clips: its head and ten ring segments laid back
 * down its channel (where the sim says its body lies, see `eelAt` in sim/foes.ts). Under, it's a
 * wake: a V of foam off its head and its back plates rolling just under the surface. Through the
 * windup it surfaces, its back arching out of the water in humps and the sacs on it swelling; it
 * fires ring by ring, head to tail, each sac kicking as it goes; out, it lies on the water, rolling a
 * little; then it sinks in a swirl. The root sits at the head; everything is placed in world space.
 */
export class EelRig {
  /** How far up out of the water (0 under, 1 lying on it). */
  private u = 0;
  private head: THREE.Object3D;
  private headScale: number;
  private segs: THREE.Object3D[];
  /** A sac's segment number, and the sac. */
  private sacs: { k: number; o: THREE.Object3D }[];
  private state = '';
  private t = Math.random() * 10;
  private wake = 0;
  private m = new THREE.Matrix4();
  private pts = Array.from({ length: EEL.segs + 1 }, () => new THREE.Vector3());

  private constructor(head: THREE.Object3D, segs: THREE.Object3D[], sacs: THREE.Object3D[]) {
    this.head = head;
    this.headScale = head.scale.x;
    this.segs = segs.sort((a, b) => num(a) - num(b));
    this.sacs = sacs.map((o) => ({ k: num(o), o }));
  }

  /** A rig for a model with a `…_head` and `…_seg_<n>`s (and `…_sac_<n>`s), else null. */
  static of(obj: THREE.Object3D): EelRig | null {
    let head: THREE.Object3D | null = null;
    const segs: THREE.Object3D[] = [];
    const sacs: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if (/_seg_\d+$/.test(o.name)) segs.push(o);
      else if (/_sac_\d+$/.test(o.name)) sacs.push(o);
      else if (!head && o.name.endsWith('_head')) head = o;
    });
    return head && segs.length >= 4 ? new EelRig(head, segs, sacs) : null;
  }

  /**
   * Lays it out for this frame. `at(k)`: where segment k of the body lies (x, ground z; -1 the
   * head), `water`: the water's height there.
   */
  update(e: Enemy, obj: THREE.Object3D, scale: number, punch: number, at: (k: number) => [number, number], fx: Fx, shake: (k: number) => void, dt: number): boolean {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const st = e.state;
    const k = e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0;
    const water = e.y;
    const pan = clamp(e.x / HALF_W, -1, 1);
    const [hx, hz] = at(-1);

    if (st !== this.state) {
      if (st === 'windup') this.surface(at, water, fx, shake, pan);
      else if (st === 'hidden' && this.u > 0.3) this.sink(at, water, fx, pan);
      this.state = st;
    }
    // up through the windup's first half, down fast when it sinks
    const want = st === 'hidden' || st === 'idle' ? 0 : st === 'windup' ? clamp(k * 2.2, 0, 1) : 1;
    this.u += clamp(want - this.u, -dt / 0.35, dt / 0.45);

    // the spine: under, just below the surface; up, its back humped out of the water (high in the
    // tell, a ripple of humps running tail-ward as it fires, flat as it lies out)
    const hump = st === 'windup' ? 0.4 + 1.0 * k : st === 'attack' ? 1.0 : st === 'recover' ? 0.25 * (1 - k) + 0.1 : 0.1;
    const wave = st === 'hidden' || st === 'idle' ? 5 : 3.2;
    const sway = st === 'recover' ? 0.25 : 0.4;
    for (let i = 0; i <= EEL.segs; i++) {
      const [x, z] = at(i - 1);
      const h = Math.max(0, Math.sin(i * 0.95 - this.t * wave)) * hump * this.u;
      const lat = Math.sin(i * 0.7 - this.t * 3.4) * sway * (i / EEL.segs + 0.3);
      this.pts[i].set(x + lat, water + lerpN(-0.75, 0.05, this.u) + h, z);
    }

    obj.position.set(hx, water, hz);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(scale);
    const inv = 1 / scale;
    const fwd = new THREE.Vector3();
    // the body: each ring faces the one ahead of it
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const p = this.pts[Math.min(i + 1, EEL.segs)];
      fwd.copy(this.pts[i]).sub(p);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      orient(s, fwd, UP, this.m);
      s.position.copy(p).sub(obj.position).multiplyScalar(inv);
      // (a ring kicks as it fires; hits shake the front of it)
      const fired = st === 'attack' && i % 2 === 0 && (e.d.k ?? 0) > i && (e.d.k ?? 0) <= i + 2;
      s.scale.setScalar(1 + (fired ? 0.18 : 0) + (i < 3 ? punch * 0.08 * (3 - i) : 0));
    }
    // the sacs on its back: swelling through the tell, spent once fired
    for (const { k: n, o } of this.sacs) {
      const spent = (st === 'attack' && (e.d.k ?? 0) > n) || st === 'recover';
      const swell = st === 'windup' ? 1 + 0.75 * k + 0.12 * Math.sin(this.t * 30) * k : st === 'attack' && !spent ? 1.75 : spent ? 0.7 : 1;
      o.scale.setScalar(swell);
    }
    // the head: up its channel, raised a touch in the tell, flinching from hits
    fwd.copy(this.pts[0]).sub(this.pts[1]);
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    if (st === 'windup' || st === 'attack') fwd.addScaledVector(UP, 0.25 * this.u).normalize();
    orient(this.head, fwd, UP, this.m);
    this.head.position.copy(this.pts[0]).addScaledVector(fwd, -punch * 0.6).sub(obj.position).multiplyScalar(inv);
    this.head.position.y += 0.15 * this.u * inv;
    this.head.scale.setScalar(this.headScale * (1 + punch * 0.2));

    // its wake: a V of foam off its head while it swims, a trail of rings where its back breaks
    this.wake -= dt;
    if (this.wake <= 0 && (st === 'hidden' || st === 'recover' || st === 'idle') && e.d.away === undefined) {
      this.wake = st === 'hidden' ? 0.04 : 0.12;
      const head = this.pts[0];
      for (const sd of [-1, 1])
        fx.add({ x: head.x + sd * 0.9, y: water + 0.05, z: head.z + 0.6, vx: sd * (2 + Math.random()), vz: 3 + Math.random() * 2, size: 0.6 + Math.random() * 0.3, grow: 2.2, life: 1.0, color: FOAM, to: FOAM_END, drag: 1.5, glow: false });
      if (Math.random() < 0.25) {
        const p = this.pts[2 + Math.floor(Math.random() * (EEL.segs - 3))];
        fx.ring(p.x, water + 0.05, p.z, 1.6, 0.7, false, 0xa8ccc6);
      }
    }
    // the tell: water streaming off its back as it rises
    if (st === 'windup' && Math.random() < 0.7) {
      const p = this.pts[1 + Math.floor(Math.random() * (EEL.segs - 1))];
      fx.add({ x: p.x + (Math.random() - 0.5) * 1.6, y: p.y + 0.3, z: p.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, size: 0.18, life: 0.6, color: DROP, gravity: 14, glow: false });
    }
    return true;
  }

  /** Up out of the water: a burst of spray all down its length, a heave. */
  private surface(at: (k: number) => [number, number], water: number, fx: Fx, shake: (k: number) => void, pan: number) {
    shake(0.12);
    audio.play('whale_breach', { pan, pitch: 1.3, vol: 0.45 });
    for (let i = -1; i < EEL.segs; i += 2) {
      const [x, z] = at(i);
      fx.ring(x, water + 0.05, z, 2.6, 0.6, false, 0xcfe6e0);
      for (let n = 0; n < 4; n++) fx.add({ x: x + (Math.random() - 0.5) * 2, y: water + 0.2, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 4, vz: (Math.random() - 0.5) * 3, size: 0.22, life: 0.9, color: DROP, gravity: 16, glow: false });
    }
  }

  /** Back under: a swirl and a gulp. */
  private sink(at: (k: number) => [number, number], water: number, fx: Fx, pan: number) {
    audio.play('whale_dive', { pan, pitch: 1.4, vol: 0.4 });
    for (let i = -1; i < EEL.segs; i += 3) {
      const [x, z] = at(i);
      fx.ring(x, water + 0.05, z, 2.2, 0.8, false, 0xa8ccc6);
      fx.add({ x, y: water + 0.1, z, size: 1.4, grow: 2, life: 0.9, color: FOAM, to: FOAM_END, glow: false });
    }
  }

  /** Killed: it bursts all down its length. */
  burst(fx: Fx, accent: number) {
    const p = new THREE.Vector3();
    for (const [i, s] of this.segs.entries()) {
      if (i % 2) continue;
      s.getWorldPosition(p);
      fx.explode(p.x, p.y, p.z, 0.45, accent, false);
    }
  }
}

const num = (o: THREE.Object3D) => Number(/_(\d+)$/.exec(o.name)?.[1] ?? 0);
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Turns a part (modelled nose to -z, back to +y) to face `fwd`, its back toward `up`. */
function orient(o: THREE.Object3D, fwd: THREE.Vector3, up: THREE.Vector3, m: THREE.Matrix4) {
  const z = new THREE.Vector3().copy(fwd).negate();
  const y = new THREE.Vector3().copy(up).addScaledVector(z, -up.dot(z));
  if (y.lengthSq() < 1e-6) y.set(0, 0, 1).addScaledVector(z, -z.z);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  m.makeBasis(x, y, z);
  o.quaternion.setFromRotationMatrix(m);
}
