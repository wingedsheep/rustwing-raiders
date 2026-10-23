import * as THREE from 'three';
import type { Enemy } from '../sim/level';
import type { Terrain } from '../sim/terrain';
import type { Fx } from './fx';
import { clamp, damp } from '../util';
import { audio } from '../audio';
import { HALF_W } from '../sim/types';

const DUST = new THREE.Color(0xc8a878);
const DUST_END = new THREE.Color(0x8a7a6a);
const GRIT = new THREE.Color(0x5a4a3a);
const MARK = new THREE.Color(0x3a3028);
const EXHAUST = new THREE.Color(0x3a3436);
const EXHAUST_END = new THREE.Color(0x6a6466);

/** A damped spring about a target: the body on its springs. */
class Spring {
  x = 0;
  v = 0;
  step(to: number, k: number, zeta: number, dt: number) {
    this.v += ((to - this.x) * k - this.v * 2 * zeta * Math.sqrt(k)) * dt;
    this.x += this.v * dt;
  }
}

/**
 * A wheeled ground foe driven from how it actually moves, not a looping clip: the wheels roll
 * with the ground it covers and the front ones steer, the truck sits on the slope under it, the
 * body pitches and rolls on its springs (dives under the brakes, squats as it pulls away, leans
 * out of a turn), it slews its tail out to skid to a stop, bucks with each burst from the bed,
 * and tears off in a spray of grit and exhaust. Dust from the wheels; tyre marks in a skid. A
 * scrape for the skid, a roar for the getaway, and its revs for the motor's hum (`rpm`).
 */
export class CarRig {
  /** The hull's heading as drawn (the sim's, swung out through a skid). */
  yaw = 0;
  /** How hard its motor's working (0 ticking over, 1 flat out), for the sound. */
  rpm = 0;
  private yawV = 0;
  private wheels: THREE.Object3D[];
  private body: THREE.Object3D;
  private rest: THREE.Vector3;
  private head: THREE.Object3D | null;
  private x = 0;
  private z = 0;
  private vx = 0;
  private vz = 0;
  private ax = 0;
  private az = 0;
  private gy = 0;
  private gvy = 0;
  private slope = { pitch: 0, roll: 0 };
  private pitch = new Spring();
  private roll = new Spring();
  private heave = new Spring();
  private spin = 0;
  private steer = 0;
  private state = '';
  /** Pulling away: the wheels spin up faster than the ground goes (seconds left). */
  private tear = 0;
  /** The gun's kick, and the time till the next. */
  private kick = 0;
  private burst = 0;
  private t = Math.random() * 10;
  private fresh = true;

  private constructor(obj: THREE.Object3D, wheels: THREE.Object3D[], body: THREE.Object3D, head: THREE.Object3D | null) {
    this.wheels = wheels.sort((a, b) => a.name.localeCompare(b.name));
    this.body = body;
    this.rest = body.position.clone();
    this.head = head;
    obj.rotation.order = 'YXZ';
    for (const w of this.wheels) w.rotation.order = 'YXZ';
    if (head) head.rotation.order = 'YXZ';
  }

  /** A rig for a model with wheels (`…_wheel_<n>`) under a `…_body`, else null. */
  static of(obj: THREE.Object3D, head: THREE.Object3D | null): CarRig | null {
    const wheels: THREE.Object3D[] = [];
    let body: THREE.Object3D | null = null;
    obj.traverse((o) => {
      if (/_wheel_\d+$/.test(o.name)) wheels.push(o);
      else if (!body && o.name.endsWith('_body')) body = o;
    });
    return wheels.length >= 4 && body ? new CarRig(obj, wheels, body, head) : null;
  }

  /** Front wheels are the first two (toward -z, the nose). */
  private front(w: THREE.Object3D) {
    return w.position.z < 0;
  }

  update(e: Enemy, obj: THREE.Object3D, groundZ: number, scale: number, terrain: Terrain, fx: Fx, dt: number) {
    dt = Math.min(dt, 1 / 30);
    if (dt <= 0) return;
    this.t += dt;
    const ground = (x: number, z: number) => Math.max(terrain.height(x, z), terrain.water(z));
    if (this.fresh) {
      this.fresh = false;
      this.x = e.x;
      this.z = groundZ;
      this.yaw = e.heading;
      this.gy = ground(e.x, groundZ);
      this.state = e.state;
    }
    // how it's really moving over the land (smoothed: the sim steps in its own time)
    const rvx = (e.x - this.x) / dt;
    const rvz = (groundZ - this.z) / dt;
    this.x = e.x;
    this.z = groundZ;
    const pvx = this.vx;
    const pvz = this.vz;
    this.vx = damp(this.vx, rvx, 14, dt);
    this.vz = damp(this.vz, rvz, 14, dt);
    this.ax = damp(this.ax, (this.vx - pvx) / dt, 10, dt);
    this.az = damp(this.az, (this.vz - pvz) / dt, 10, dt);

    // the hull: the sim's heading, but a skid slews the tail out and the nose round toward you
    const dir = e.d.dir ?? (Math.sin(e.heading) < 0 ? -1 : 1);
    const skid = e.state === 'windup' || e.state === 'attack';
    let want = e.heading - (skid ? dir * 0.95 : 0);
    want = this.yaw + Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    const yk = skid ? 70 : 45;
    this.yawV += ((want - this.yaw) * yk - this.yawV * 2 * 0.5 * Math.sqrt(yk)) * dt;
    this.yaw += this.yawV * dt;

    const fx0 = Math.sin(this.yaw);
    const fz0 = Math.cos(this.yaw);
    // (its right, the model's +x)
    const rx = -fz0;
    const rz = fx0;
    const speed = this.vx * fx0 + this.vz * fz0;
    const slide = this.vx * rx + this.vz * rz;
    const aFwd = this.ax * fx0 + this.az * fz0;
    const aSide = this.ax * rx + this.az * rz;
    const moving = Math.hypot(this.vx, this.vz);

    // changes of heart: a brake dive into the skid, a squat as it tears away
    if (e.state !== this.state) {
      if (e.state === 'windup') {
        if (moving > 3) audio.play('skid', { pan: e.x / HALF_W, vol: 0.5, pitch: 0.9 + Math.random() * 0.2 });
        this.pitch.v -= 1.4;
        this.roll.v += dir * 1.2;
      } else if (e.state === 'recover' || (e.state === 'idle' && this.state === 'attack')) {
        this.tear = 0.55;
        audio.play('truck_rev', { pan: e.x / HALF_W, vol: 0.45, pitch: 0.9 + Math.random() * 0.2 });
        this.pitch.v += 1.6;
        this.exhaust(fx, e.x, groundZ, scale, 6);
      } else if (e.state === 'attack') this.burst = 0;
      this.state = e.state;
    }

    // sitting on the land: pitched and rolled to the slope under its wheels
    const L = 1.2 * scale;
    const Wd = 0.9 * scale;
    const hF = ground(e.x + fx0 * L, groundZ + fz0 * L);
    const hB = ground(e.x - fx0 * L, groundZ - fz0 * L);
    const hR = ground(e.x + rx * Wd, groundZ + rz * Wd);
    const hL = ground(e.x - rx * Wd, groundZ - rz * Wd);
    this.slope.pitch = damp(this.slope.pitch, Math.atan2(hF - hB, 2 * L), 16, dt);
    this.slope.roll = damp(this.slope.roll, Math.atan2(hR - hL, 2 * Wd), 16, dt);
    const gy = (hF + hB + hR + hL) / 4;
    const gvy = (gy - this.gy) / dt;
    // a jolt through the springs where the ground changes pitch under it
    this.heave.v -= clamp(gvy - this.gvy, -20, 20) * 0.05;
    this.gy = gy;
    this.gvy = gvy;

    // the body on its springs: thrown about by how it speeds, slows and turns
    const kickBack = this.kick;
    let pitchTo = clamp(aFwd * 0.014, -0.16, 0.16);
    let rollTo = clamp(aSide * 0.016 + slide * 0.006, -0.18, 0.18);
    let heaveTo = 0;
    if (e.state === 'windup' && e.stateDur > 0) heaveTo = -0.14 * clamp(e.stateT / e.stateDur, 0, 1);
    // road noise: little knocks, more the faster it goes; and the engine's shiver when it's still
    if (Math.random() < moving * dt * 0.9) this.heave.v += (Math.random() - 0.5) * (0.6 + moving * 0.06);
    if (Math.random() < moving * dt * 0.5) this.roll.v += (Math.random() - 0.5) * 0.5;
    const idle = moving < 2 ? 1 : 0;
    heaveTo += idle * Math.sin(this.t * 42) * 0.012;
    rollTo += idle * Math.sin(this.t * 27) * 0.006;
    // firing: each burst bucks the truck away from where the gun points
    if (e.state === 'attack') {
      this.burst -= dt;
      if (this.burst <= 0) {
        this.burst = 0.12;
        const rel = e.aim - this.yaw;
        this.pitch.v -= Math.cos(rel) * 0.9;
        this.roll.v += Math.sin(rel) * 0.9;
        this.heave.v -= 0.4;
        this.kick = 1;
      }
    }
    this.kick = Math.max(0, this.kick - dt * 9);
    pitchTo += this.tear * 0.12;
    this.pitch.step(pitchTo, 160, 0.35, dt);
    this.roll.step(rollTo, 140, 0.32, dt);
    this.heave.step(heaveTo, 220, 0.4, dt);

    obj.position.y = gy;
    obj.rotation.set(this.slope.pitch, this.yaw + Math.PI, this.slope.roll);
    this.body.position.set(this.rest.x, this.rest.y + this.heave.x, this.rest.z);
    this.body.rotation.set(this.pitch.x, 0, this.roll.x);
    if (this.head) {
      this.head.rotation.y = e.aim - this.yaw;
      this.head.rotation.x = kickBack * 0.18;
    }

    // the wheels roll with the ground they cover (and spin up, pulling away); the front ones steer,
    // into a turn, or against the slide in a skid
    this.tear = Math.max(0, this.tear - dt);
    // revs: with the road speed, flat out pulling away, blipped while it fires
    const rev = clamp(Math.abs(speed) / 16, 0, 0.75) + (this.tear > 0 ? 0.45 : 0) + (e.state === 'attack' ? 0.15 : 0);
    this.rpm = damp(this.rpm, clamp(rev, 0, 1), rev > this.rpm ? 8 : 3, dt);
    const R = 0.5 * scale;
    this.spin -= (speed / R + (this.tear > 0 ? 30 * (this.tear / 0.55) : 0)) * dt;
    const steerTo = clamp((skid ? -0.3 : 0.35) * this.yawV, -0.6, 0.6);
    this.steer = damp(this.steer, steerTo, 12, dt);
    for (const w of this.wheels) w.rotation.set(this.spin, this.front(w) ? this.steer : 0, 0);

    // dust: a plume off the back wheels as it drives, a sideways fan off all four in a skid,
    // grit and smoke as it tears away, and tyre marks laid down while it slides
    const wheelAt = (w: THREE.Object3D) => {
      const lx = w.position.x * scale;
      const lz = -w.position.z * scale;
      return { x: e.x + rx * lx + fx0 * lz, z: groundZ + rz * lx + fz0 * lz };
    };
    for (const w of this.wheels) {
      const p = wheelAt(w);
      const rear = !this.front(w);
      if (rear && Math.random() < moving * dt * 1.4)
        fx.add({ x: p.x + (Math.random() - 0.5) * 0.4, y: gy + 0.25, z: p.z, vx: -fx0 * moving * 0.15 + (Math.random() - 0.5) * 1.5, vy: 0.8 + Math.random(), vz: -fz0 * moving * 0.15 + (Math.random() - 0.5) * 1.5, size: 0.45, grow: 2.4, life: 0.5 + Math.random() * 0.4, drag: 2.5, color: DUST, to: DUST_END, glow: false });
      if (skid && moving > 2.5) {
        if (Math.random() < dt * 40)
          fx.add({ x: p.x, y: gy + 0.3, z: p.z, vx: this.vx * 0.7 + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: this.vz * 0.7 + (Math.random() - 0.5) * 3, size: 0.6, grow: 2.8, life: 0.7 + Math.random() * 0.5, drag: 2.2, color: DUST, to: DUST_END, glow: false });
        if (Math.random() < dt * 30) fx.add({ x: p.x, y: gy + 0.04, z: p.z, size: 0.32, grow: 0.7, life: 1.6, color: MARK, glow: false });
        if (Math.random() < dt * 14) this.grit(fx, p.x, gy, p.z, this.vx * 0.8, this.vz * 0.8);
      }
      if (rear && this.tear > 0) {
        if (Math.random() < dt * 50)
          fx.add({ x: p.x, y: gy + 0.3, z: p.z, vx: -fx0 * 8 + (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2.5, vz: -fz0 * 8 + (Math.random() - 0.5) * 3, size: 0.55, grow: 2.6, life: 0.6 + Math.random() * 0.5, drag: 3, color: DUST, to: DUST_END, glow: false });
        if (Math.random() < dt * 20) this.grit(fx, p.x, gy, p.z, -fx0 * 10, -fz0 * 10);
      }
    }
    if (idle && Math.random() < dt * 3) this.exhaust(fx, e.x, groundZ, scale, 1);
  }

  private grit(fx: Fx, x: number, y: number, z: number, vx: number, vz: number) {
    fx.add({ x, y: y + 0.3, z, vx: vx + (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 4, vz: vz + (Math.random() - 0.5) * 4, size: 0.12 + Math.random() * 0.12, life: 0.9, color: GRIT, solid: true, gravity: 22, spin: 10, drag: 1 });
  }

  /** Puffs from the twin exhausts under the tailgate. */
  private exhaust(fx: Fx, x: number, z: number, scale: number, n: number) {
    const fx0 = Math.sin(this.yaw);
    const fz0 = Math.cos(this.yaw);
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? 1 : -1;
      const px = x - fx0 * 1.7 * scale - fz0 * s * 0.55 * scale;
      const pz = z - fz0 * 1.7 * scale + fx0 * s * 0.55 * scale;
      fx.add({ x: px, y: this.gy + 0.6 * scale, z: pz, vx: -fx0 * (2 + Math.random() * 2), vy: 1.2 + Math.random(), vz: -fz0 * (2 + Math.random() * 2), size: 0.35, grow: 2.6, life: 0.6 + Math.random() * 0.4, drag: 2, color: EXHAUST, to: EXHAUST_END, glow: false });
    }
  }
}
