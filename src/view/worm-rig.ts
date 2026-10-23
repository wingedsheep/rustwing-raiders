import * as THREE from 'three';
import type { Enemy } from '../sim/level';
import type { Fx } from './fx';
import { clamp } from '../util';
import { audio } from '../audio';
import { FLIGHT_Y, HALF_W, fromFlight } from '../sim/types';
import { BURROW_SINK as WORM_SINK } from '../sim/foes';

const DUST = new THREE.Color(0xb89a70);
const DUST_END = new THREE.Color(0x7a6a5a);
const CLOD = new THREE.Color(0x5a4636);
const ROCK = new THREE.Color(0x8a7a64);
const FURROW = new THREE.Color(0x3a2e24);
const UP = new THREE.Vector3(0, 1, 0);
const STEPS = 48;

/**
 * A burrower drawn from what it's doing, not from clips: a head and a string of ring segments laid
 * along an arch out of its hole. Under the ground it's a furrow of dust coming for you; through the
 * windup the ground boils and the head pokes up, maw to the sky; it breaches in a spray of rock, the
 * body heaving up behind it in a hook and the head curling over to face you, mandibles flung wide;
 * out, it writhes, the jaws working and flinching from hits; then it pours itself back down the
 * hole. The root sits at the hole; everything else is placed in world space under it.
 */
export class WormRig {
  /** How far out of the ground (0 under, 1 reared up at the flight line). */
  u = 0;
  private uv = 0;
  private open = 0;
  private openV = 0;
  private head: THREE.Object3D;
  private segs: THREE.Object3D[];
  private jaws: { o: THREE.Object3D; rest: THREE.Quaternion }[];
  /** The hole, as an offset from the head's spot on the flight plane (it moves with it). */
  private hole = new THREE.Vector3();
  private back = new THREE.Vector3(0, 0, -1);
  private crater: THREE.Group;
  private state = '';
  private t = Math.random() * 10;
  private furrow = 0;
  private rumble = 0;
  private pts = Array.from({ length: STEPS + 1 }, () => new THREE.Vector3());
  private lens = new Float32Array(STEPS + 1);
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  /** Which way the hook swings (its side), picked fresh each time it comes up. */
  private lean = 1;
  private headScale: number;
  /** Where it's swum, under the ground (newest last), for its back to break the surface along. */
  private trail: { x: number; z: number }[] = [];

  private constructor(obj: THREE.Object3D, head: THREE.Object3D, segs: THREE.Object3D[], jaws: THREE.Object3D[]) {
    this.head = head;
    this.headScale = head.scale.x;
    this.segs = segs.sort((a, b) => num(a) - num(b));
    this.jaws = jaws.map((o) => ({ o, rest: o.quaternion.clone() }));
    // a crater of turned earth round the hole, and the rubble flung out of it
    this.crater = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a221c });
    const rim = new THREE.MeshLambertMaterial({ color: 0x6a5644, flatShading: true });
    const pit = new THREE.Mesh(new THREE.CircleGeometry(1.5, 9), dark);
    pit.rotation.x = -Math.PI / 2;
    this.crater.add(pit);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      const r = 1.5 + Math.random() * 0.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.25, 0), rim);
      rock.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      rock.scale.y = 0.6;
      rock.castShadow = true;
      this.crater.add(rock);
    }
    obj.add(this.crater);
  }

  /** A rig for a model with a `…_head` and `…_seg_<n>`s (and `…_jaw_<n>`s), else null. */
  static of(obj: THREE.Object3D): WormRig | null {
    let head: THREE.Object3D | null = null;
    const segs: THREE.Object3D[] = [];
    const jaws: THREE.Object3D[] = [];
    obj.traverse((o) => {
      if (/_seg_\d+$/.test(o.name)) segs.push(o);
      else if (/_jaw_\d+$/.test(o.name)) jaws.push(o);
      else if (!head && o.name.endsWith('_head')) head = o;
    });
    return head && segs.length >= 4 ? new WormRig(obj, head, segs, jaws) : null;
  }

  /** Lays it out for this frame; false while it's all under the ground. */
  update(e: Enemy, obj: THREE.Object3D, scale: number, punch: number, you: { x: number; z: number } | null | undefined, fx: Fx, ground: (x: number, z: number) => number, shake: (k: number) => void, dt: number): boolean {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const st = e.state;
    const k = e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0;
    const under = st === 'hidden' || (e.shielded && st !== 'windup');
    const changed = st !== this.state;
    const pan = clamp(e.x / HALF_W, -1, 1);

    // where it is under the ground: the spot that shows where it'll come up
    const gz = fromFlight(e.z, 0);
    const g = ground(e.x, gz);
    const markZ = fromFlight(e.z, g);
    if (this.u < 0.01) {
      // the hole goes where the furrow is, and the body will heave up away from you
      this.hole.set(0, g, markZ - e.z);
      if (you) this.back.set(e.x - you.x, 0, e.z - you.z);
      this.back.z -= 0.6; // (and a little up the screen, so the hook shows)
      if (this.back.lengthSq() < 1e-4) this.back.set(0, 0, -1);
      this.back.normalize();
    }

    if (changed) {
      if (st === 'windup') {
        this.lean = Math.random() < 0.5 ? -1 : 1;
        shake(0.12);
        audio.play('heavy', { pan, pitch: 0.45, vol: 0.6 });
      } else if (st === 'attack') this.breach(e.x, g, e.z + this.hole.z, fx, shake, pan);
      else if (under && this.u > 0.3) this.dive(e.x, g, e.z + this.hole.z, fx, pan);
      this.state = st;
    }

    // how far out it wants to be, and how fast it gets there
    const want = st === 'windup' ? 0.1 + 0.12 * k : under ? 0 : 1;
    if (want < this.u) {
      this.uv = 0;
      this.u = Math.max(want, this.u - dt / WORM_SINK);
    } else {
      const kk = st === 'windup' ? 30 : 140;
      this.uv += ((want - this.u) * kk - this.uv * 2 * 0.55 * Math.sqrt(kk)) * dt;
      this.u = clamp(this.u + this.uv * dt, 0, 1.08);
    }

    // jaws: shut under, prised open as it breaches, flung wide in the roar, working while it's out
    const jawWant = under ? 0 : st === 'windup' ? 0.25 + 0.4 * k : st === 'attack' ? 1.1 : 0.35 + 0.18 * Math.sin(this.t * 2.6) + Math.min(0.5, punch * 1.5);
    this.openV += ((jawWant - this.open) * 180 - this.openV * 2 * 0.4 * Math.sqrt(180)) * dt;
    this.open += this.openV * dt;

    // under: a furrow of dust and clods coming for you
    if (this.u < 0.02 && st === 'hidden' && e.stateT > WORM_SINK && e.d.away === undefined) {
      this.furrow -= dt;
      if (this.furrow <= 0) {
        this.furrow = 0.05;
        const side = Math.random() < 0.5 ? -1 : 1;
        fx.add({ x: e.x + side * (0.6 + Math.random() * 0.5), y: g + 0.05, z: markZ + (Math.random() - 0.5), size: 1.0 + Math.random() * 0.5, grow: 1.2, life: 1.6, color: FURROW, glow: false });
        fx.add({ x: e.x + (Math.random() - 0.5) * 1.6, y: g + 0.3, z: markZ + (Math.random() - 0.5) * 1.6, vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, size: 0.9, grow: 2, life: 0.7, color: DUST, to: DUST_END, drag: 2, glow: false });
        if (Math.random() < 0.35) fx.add({ x: e.x + (Math.random() - 0.5), y: g + 0.2, z: markZ, vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 3, vz: (Math.random() - 0.5) * 5, size: 0.2 + Math.random() * 0.15, color: CLOD, solid: true, gravity: 22, spin: 8, life: 1.2 });
      }
    }
    // the windup: the ground boils and heaves, and it rumbles up
    if (st === 'windup') {
      const hx = e.x;
      const hz = e.z + this.hole.z;
      if (Math.random() < 0.6 + k) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.8;
        fx.add({ x: hx + Math.cos(a) * r, y: g + 0.2, z: hz + Math.sin(a) * r, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 2 + Math.random() * 3 * (1 + k), size: 1 + k, grow: 2, life: 0.8, color: DUST, to: DUST_END, drag: 2, glow: false });
      }
      if (Math.random() < 0.25 + k * 0.5) fx.add({ x: hx + (Math.random() - 0.5) * 2.5, y: g + 0.2, z: hz + (Math.random() - 0.5) * 2.5, vx: (Math.random() - 0.5) * 4, vy: 5 + Math.random() * 5 * k, vz: (Math.random() - 0.5) * 4, size: 0.22 + Math.random() * 0.2, color: Math.random() < 0.5 ? CLOD : ROCK, solid: true, gravity: 22, spin: 10, life: 1.5 });
      this.rumble -= dt;
      if (this.rumble <= 0) {
        this.rumble = 0.22 - 0.1 * k;
        shake(0.05 + 0.08 * k);
        audio.play('heavy', { pan, pitch: 0.35 + 0.2 * k, vol: 0.3 + 0.3 * k });
      }
    }

    this.crater.visible = this.u >= 0.01;
    if (this.u < 0.01) {
      // under, swimming: its back breaks the surface along the furrow, like a fin
      if (st !== 'hidden' && !e.shielded) return false;
      this.swim(e, obj, scale, g, markZ);
      return true;
    }
    this.trail.length = 0;

    // the path out of the hole: up and away from you in a hook, then curling over to the head
    const H = this.w.set(e.x, g - 0.6, e.z + this.hole.z);
    const top = new THREE.Vector3(e.x, e.y > 3 ? e.y : FLIGHT_Y - 1, e.z);
    const side = this.v.set(this.back.z, 0, -this.back.x);
    // (a question mark from above: out to one side and back over)
    const p1 = H.clone().addScaledVector(UP, 8).addScaledVector(this.back, 3.5).addScaledVector(side, this.lean * 5);
    const p2 = top.clone().addScaledVector(UP, 3).addScaledVector(this.back, 3).addScaledVector(side, -this.lean * 1.5);
    const uu = clamp(this.u, 0, 1.08);
    // (the head rides the curve from the hole to the top as it comes out; past 1, it lunges a touch)
    let len = 0;
    for (let i = 0; i <= STEPS; i++) {
      bez(this.pts[i], H, p1, p2, top, (i / STEPS) * Math.min(uu, 1));
      if (uu > 1) this.pts[i].addScaledVector(this.back, -(uu - 1) * 6 * (i / STEPS) ** 2);
      if (i) len += this.pts[i].distanceTo(this.pts[i - 1]);
      this.lens[i] = len;
    }
    // out, it writhes: a wave down the body; in the windup, it shudders
    const writhe = under ? 0.15 : st === 'windup' ? 0.25 : 0.8;
    const sway = (d: number) => Math.sin(d * 0.5 - this.t * 3.4) * writhe * Math.sin(Math.PI * clamp(d / Math.max(len, 1), 0, 1));

    obj.position.copy(H);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(scale);
    const inv = 1 / scale;
    const head = this.pts[STEPS];
    const at = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const hint = new THREE.Vector3();

    // the body, from just behind the head back down the hole (spaced so it always reaches it)
    let d = 1.0 * scale;
    const gap = Math.max(0.62 * scale, (len - d) / this.segs.length);
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const along = len - d; // (from the hole)
      if (along < -0.8) s.visible = false;
      else {
        s.visible = true;
        this.pointAt(along, at, fwd);
        at.addScaledVector(side, sway(d));
        hint.copy(UP).addScaledVector(this.back, 1.2);
        orient(s, fwd, hint, this.m, this.q);
        s.position.copy(at).sub(H).multiplyScalar(inv);
        const pulse = 1 + 0.05 * Math.sin(this.t * 6 - i * 0.7) + (i < 3 ? punch * 0.1 * (3 - i) : 0);
        s.scale.setScalar(pulse);
      }
      d += gap;
    }

    // the head: maw to the sky as it breaches, curling over to face you as it rears up
    this.pointAt(len, at, fwd);
    at.copy(head).addScaledVector(side, Math.sin(this.t * 1.7) * 0.35 * writhe);
    const face = new THREE.Vector3().copy(this.back).negate().addScaledVector(UP, -0.25).normalize();
    const turn = clamp((uu - 0.45) / 0.5, 0, 1);
    fwd.lerp(face, turn * turn * (3 - 2 * turn)).normalize();
    at.addScaledVector(fwd, -punch * 0.8);
    orient(this.head, fwd, UP, this.m, this.q);
    this.head.position.copy(at).sub(H).multiplyScalar(inv);
    this.head.scale.setScalar(this.headScale * (1 + punch * 0.25));
    for (const [n, j] of this.jaws.entries()) {
      const flinch = punch * (n === 0 ? 0.3 : -0.2);
      j.o.quaternion.copy(j.rest).multiply(this.q.setFromAxisAngle(XAXIS, clamp(this.open + flinch, -0.2, 1.3) * 0.85));
    }

    this.crater.visible = true;
    this.crater.position.set(0, (g + 0.06 - H.y) * inv, 0);
    this.crater.scale.setScalar(clamp(this.u * 3, 0, 1) * inv * 1.2);
    return true;
  }

  /** Swimming under the ground: the brow and a run of back plates showing along where it's been. */
  private swim(e: Enemy, obj: THREE.Object3D, scale: number, g: number, markZ: number) {
    const tr = this.trail;
    const last = tr[tr.length - 1];
    if (!last || Math.hypot(e.x - last.x, markZ - last.z) > 0.25) {
      tr.push({ x: e.x, z: markZ });
      if (tr.length > 120) tr.shift();
    }
    obj.position.set(e.x, g, markZ);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(scale);
    const inv = 1 / scale;
    // (walks back along the trail; past its start, straight on behind)
    const behind = (dist: number, out: THREE.Vector3, fwd: THREE.Vector3) => {
      let px = e.x;
      let pz = markZ;
      for (let i = tr.length - 1; i >= 0; i--) {
        const step = Math.hypot(tr[i].x - px, tr[i].z - pz);
        if (step >= dist && step > 1e-4) {
          const f = dist / step;
          out.set(px + (tr[i].x - px) * f, g, pz + (tr[i].z - pz) * f);
          fwd.set(px - tr[i].x, 0, pz - tr[i].z).normalize();
          return;
        }
        dist -= step;
        px = tr[i].x;
        pz = tr[i].z;
      }
      fwd.copy(this.back).negate();
      out.set(px, g, pz).addScaledVector(fwd, -dist);
    };
    const at = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    behind(0.01, at, fwd);
    const headFwd = fwd.clone();
    this.head.position.set(0, -0.5 * inv, 0);
    orient(this.head, headFwd, UP, this.m, this.q);
    this.head.scale.setScalar(this.headScale);
    for (const j of this.jaws) j.o.quaternion.copy(j.rest);
    const n = this.segs.length;
    for (let i = 0; i < n; i++) {
      const s = this.segs[i];
      s.visible = i < 6;
      if (!s.visible) continue;
      const r = (0.82 - (0.4 * i) / (n - 1)) * scale;
      behind((1.4 + i * 0.75) * scale, at, fwd);
      // the plates roll up through the ground and back, one after another
      at.y = g - r * (0.55 + 0.25 * Math.sin(this.t * 6 - i * 0.9));
      orient(s, fwd, UP, this.m, this.q);
      s.position.copy(at).sub(obj.position).multiplyScalar(inv);
      s.scale.setScalar(1);
    }
  }

  /** The point `along` the laid-out path from the hole, and the way on toward the head. */
  private pointAt(along: number, at: THREE.Vector3, fwd: THREE.Vector3) {
    const L = this.lens[STEPS];
    if (along <= 0) {
      at.copy(this.pts[0]).addScaledVector(UP, along);
      fwd.copy(UP);
      return;
    }
    let i = 1;
    while (i < STEPS && this.lens[i] < along) i++;
    const a = this.pts[i - 1];
    const b = this.pts[i];
    const seg = this.lens[i] - this.lens[i - 1] || 1;
    at.copy(a).lerp(b, clamp((Math.min(along, L) - this.lens[i - 1]) / seg, 0, 1));
    fwd.copy(b).sub(a).normalize();
  }

  /** Up through the ground: rock and earth flung skyward, a ring of dust, a roar. */
  private breach(x: number, g: number, z: number, fx: Fx, shake: (k: number) => void, pan: number) {
    shake(0.45);
    audio.play('whale_breach', { pan, pitch: 0.7, vol: 0.9 });
    audio.play('shriek', { pan, pitch: 0.42, vol: 0.5 });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 7;
      fx.add({ x: x + Math.cos(a) * 0.8, y: g + 0.5, z: z + Math.sin(a) * 0.8, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 8 + Math.random() * 12, size: 0.25 + Math.random() * 0.35, color: Math.random() < 0.5 ? CLOD : ROCK, solid: true, gravity: 24, spin: 10 + Math.random() * 8, life: 2.5 });
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      fx.add({ x: x + Math.cos(a) * 1.2, y: g + 0.4, z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, vy: 1 + Math.random() * 2, size: 1.6, grow: 2.2, life: 0.9 + Math.random() * 0.4, color: DUST, to: DUST_END, drag: 3, glow: false });
    }
    for (let i = 0; i < 8; i++) fx.add({ x: x + (Math.random() - 0.5) * 2, y: g + 1, z: z + (Math.random() - 0.5) * 2, vy: 8 + Math.random() * 6, size: 1.4, grow: 2.5, life: 1.0, color: DUST, to: DUST_END, drag: 2.5, glow: false });
    fx.ring(x, g + 0.3, z, 7, 0.4, false, 0xd8c09a);
  }

  /** Back down the hole: a gulp of dust and a few clods. */
  private dive(x: number, g: number, z: number, fx: Fx, pan: number) {
    audio.play('whale_dive', { pan, pitch: 0.75, vol: 0.6 });
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.add({ x: x + Math.cos(a) * 1.2, y: g + 0.3, z: z + Math.sin(a) * 1.2, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 2 + Math.random() * 3, size: 1.2, grow: 2, life: 0.9, color: DUST, to: DUST_END, drag: 2, glow: false });
    }
  }

  /** Killed while out: it bursts all down its length. */
  burst(fx: Fx, accent: number) {
    const p = new THREE.Vector3();
    for (const [i, s] of this.segs.entries()) {
      if (!s.visible || i % 2) continue;
      s.getWorldPosition(p);
      fx.explode(p.x, p.y, p.z, 0.45, accent, false);
    }
  }
}

const XAXIS = new THREE.Vector3(1, 0, 0);

const num = (o: THREE.Object3D) => Number(/_(\d+)$/.exec(o.name)?.[1] ?? 0);

function bez(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) {
  const s = 1 - t;
  out.set(0, 0, 0).addScaledVector(a, s * s * s).addScaledVector(b, 3 * s * s * t).addScaledVector(c, 3 * s * t * t).addScaledVector(d, t * t * t);
}

/** Turns a part (modelled nose to -z, back to +y) to face `fwd`, its back toward `up`. */
function orient(o: THREE.Object3D, fwd: THREE.Vector3, up: THREE.Vector3, m: THREE.Matrix4, q: THREE.Quaternion) {
  const z = new THREE.Vector3().copy(fwd).negate();
  const y = new THREE.Vector3().copy(up).addScaledVector(z, -up.dot(z));
  if (y.lengthSq() < 1e-6) y.set(0, 0, 1).addScaledVector(z, -z.z);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  m.makeBasis(x, y, z);
  o.quaternion.setFromRotationMatrix(m);
  q.identity();
}
