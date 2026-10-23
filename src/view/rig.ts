import * as THREE from 'three';
import { library, type Instance, type Skin } from '../render/assets';
import { outlined } from '../render/pixel';
import { damp, clamp } from '../util';

/**
 * A body on foot, posed every frame in code: the model is rigid parts hung at their joints
 * (`<kind>__hips`, `__torso`, `__head`, `__arm_l`, `__fore_l`, `__thigh_l`, `__shin_l`, the
 * same on the right, `__gun` in the right hand, sometimes `__shield`), built in
 * tools/models/boarding.py. Here they walk at the pace they're really going (the stride matches
 * the ground), the legs follow the way you move while the chest turns to aim, the gun kicks,
 * a blow rocks the whole body, and the dead fall the way they were hit, bounce once and lie still.
 *
 * Angles: `face` and the rest are world angles atan2(z, x) (0 = +x, along the ship).
 */

export interface Pose {
  x: number;
  z: number;
  /** Where the body faces (the chest, the gun). */
  face: number;
  /** World velocity: the legs go the way it's going. */
  vx: number;
  vz: number;
  /** 0 the gun hangs; 1 it's up and aimed (both hands). */
  aim: number;
  /** Something being worked with both hands at waist height (a crate, a lever). */
  work: boolean;
  /** Down on one knee (OPEN, plating cracked) or reeling (a bruiser in the wall). */
  kneel: boolean;
  /** Sliding: low and long, the way it's going. */
  slide: boolean;
  /** A melee swing: 0 rest, rising to 1 as it winds up (arm up and back), then `strike` runs it through. */
  windup: number;
  strike: number;
  /** Lying asleep. */
  asleep: boolean;
  /** Thrown flat on the deck (hooked and collected, knocked over). */
  floored: boolean;
  dead: boolean;
  /** Seconds since it died, and which way it was hit. */
  deathT: number;
  fallA: number;
  /** Braced to charge (a bruiser): low, shield first. */
  brace: number;
  /** Hauling on a line (a kelter reeling). */
  haul: boolean;
}

export const POSE = (): Pose => ({
  x: 0, z: 0, face: 0, vx: 0, vz: 0, aim: 0, work: false, kneel: false, slide: false, windup: 0, strike: 0, asleep: false, floored: false, dead: false,
  deathT: 0, fallA: 0, brace: 0, haul: false,
});

const SIDES = ['l', 'r'] as const;

export class Rig {
  readonly root = new THREE.Group();
  readonly inst: Instance | null;
  private model: THREE.Object3D;
  private p: Record<string, THREE.Object3D | undefined> = {};
  private rest = new Map<THREE.Object3D, THREE.Euler>();
  private restPos = new Map<THREE.Object3D, THREE.Vector3>();
  /** Where the muzzle is, for flashes and lasers (world space, after update). */
  readonly muzzle = new THREE.Vector3();
  private muzzleObj: THREE.Object3D | undefined;
  private phase = Math.random() * 6;
  private hipYaw = 0;
  private lean = 0;
  private side = 0;
  private speed = 0;
  private aimK = 0;
  private recoil = 0;
  private flinch = 0;
  private flinchA = 0;
  private breath = Math.random() * 6;
  private kneelK = 0;
  private slideK = 0;
  private workK = 0;
  private yaw = 0;
  private t = 0;
  /** The blob of shadow under it. */
  private shadow: THREE.Mesh;
  /** Something picked up, in the gun hand in place of its own (and its muzzle). */
  private held: THREE.Object3D | null = null;
  private heldKind: string | null = null;
  private heldMuzzle: THREE.Object3D | undefined;

  constructor(
    readonly kind: string,
    skin?: Skin,
    readonly scale = 1,
  ) {
    this.inst = library.clone(kind, 0, skin, true);
    this.model = this.inst?.obj ?? fallback();
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.model.traverse((o) => {
      const m = /__([a-z_]+)$/.exec(o.name);
      if (m) this.p[m[1]] = o;
    });
    this.muzzleObj = this.p.muzzle;
    for (const o of Object.values(this.p)) {
      if (!o) continue;
      this.rest.set(o, o.rotation.clone());
      this.restPos.set(o, o.position.clone());
    }
    outlined(this.model);
    this.shadow = new THREE.Mesh(BLOB, SHADOW_MAT);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.shadow.scale.setScalar(scale * 1.1);
    this.shadow.renderOrder = 1;
    this.root.add(this.shadow);
  }

  /**
   * Puts a model (an `arm_*` prop, built in the gun part's frame: grip at the origin, barrel down
   * -z) in the gun hand in place of its own gun; null gives it its own back.
   */
  hold(kind: string | null) {
    if (kind === this.heldKind) return;
    this.heldKind = kind;
    const gun = this.p.gun;
    if (!gun) return;
    if (this.held) {
      this.held.removeFromParent();
      this.held = null;
      this.heldMuzzle = undefined;
    }
    gun.scale.setScalar(1);
    if (!kind) return;
    const inst = library.clone(kind, 0);
    if (!inst) return;
    this.held = inst.obj;
    this.held.traverse((o) => {
      if (/__muzzle$/.test(o.name)) this.heldMuzzle = o;
      o.castShadow = true;
    });
    outlined(this.held);
    gun.parent?.add(this.held);
    // its own gun shrinks away (it's still there, posed, for the new one to follow)
    gun.scale.setScalar(0.001);
  }

  /** The gun just went off (`k` 1 for the pistol, ~2.5 for the breacher). */
  kick(k = 1) {
    this.recoil = Math.min(3, this.recoil + k);
  }

  /** Hit from direction `a` (the way the blow travelled). */
  hit(a: number, k = 1) {
    this.flinch = Math.min(1.5, this.flinch + k);
    this.flinchA = a;
  }

  flash(k: number) {
    this.inst?.flash(k);
  }

  /** Sets a part's rotation as an offset from its rest pose. */
  private rot(name: string, x: number, y = 0, z = 0) {
    const o = this.p[name];
    if (!o) return;
    const r = this.rest.get(o)!;
    o.rotation.set(r.x + x, r.y + y, r.z + z);
  }

  private pos(name: string, x: number, y: number, z: number) {
    const o = this.p[name];
    if (!o) return;
    const r = this.restPos.get(o)!;
    o.position.set(r.x + x, r.y + y, r.z + z);
  }

  update(dt: number, s: Pose) {
    this.t += dt;
    this.inst?.update(dt);
    const root = this.root;
    root.position.set(s.x, 0, s.z);
    // three's model looks down -z; a world angle a looks along (cos a, sin a)
    const wantYaw = -s.face - Math.PI / 2;
    this.yaw = s.dead ? this.yaw : wantYaw;
    this.model.rotation.set(0, this.yaw, 0);
    this.model.position.set(0, 0, 0);
    this.shadow.visible = !s.dead || s.deathT < 0.5;
    // how fast, and which way relative to the chest
    const sp = Math.hypot(s.vx, s.vz);
    this.speed = damp(this.speed, sp, 14, dt);
    const moveA = Math.atan2(s.vz, s.vx);
    let rel = wrap(moveA - s.face);
    // going backwards: the legs face the chest and walk backwards
    const back = Math.abs(rel) > 1.9;
    if (back) rel = wrap(rel + Math.PI);
    const wantHip = sp > 0.6 && !s.slide ? clamp(rel, -1.1, 1.1) : 0;
    this.hipYaw = damp(this.hipYaw, wantHip, 10, dt);
    const run = clamp(this.speed / 6, 0, 1.2) * (s.dead || s.asleep ? 0 : 1);
    // a stride of about 1.5 units: the feet keep pace with the ground
    this.phase += ((this.speed * dt) / 1.5) * Math.PI * 2 * (back ? -1 : 1);
    this.breath += dt * 1.8;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.flinch = Math.max(0, this.flinch - dt * 5);
    this.aimK = damp(this.aimK, s.aim, 18, dt);
    this.kneelK = damp(this.kneelK, s.kneel || s.floored ? 1 : 0, 12, dt);
    this.slideK = damp(this.slideK, s.slide ? 1 : 0, 22, dt);
    this.workK = damp(this.workK, s.work ? 1 : 0, 10, dt);
    // lean into the run (forward, and into the turn)
    const fwd = Math.cos(rel) * run * (back ? -1 : 1);
    this.lean = damp(this.lean, fwd * 0.22, 8, dt);
    this.side = damp(this.side, Math.sin(rel) * run * 0.12, 8, dt);

    if (s.dead) return this.fall(dt, s);
    if (s.asleep) return this.sleep(s);

    const ph = this.phase;
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);
    // the body bobs twice a stride; breathing when still
    const bob = Math.abs(cs) * 0.07 * run - (run > 0.1 ? 0.03 : 0) + Math.sin(this.breath) * 0.012 * (1 - run);
    const low = this.kneelK * 0.42 + this.slideK * 0.48 + this.workK * 0.18 + s.brace * 0.16;
    this.pos('hips', 0, bob - low, 0);
    // the hips turn to the legs' way; the chest turns back to the aim
    const fl = this.flinch;
    const fa = wrap(this.flinchA - s.face);
    // hit: rocked back away from the blow, a twist
    const rockX = -Math.cos(fa) * fl * 0.35; // >0: rocked back
    const rockZ = Math.sin(fa) * fl * 0.3;
    this.rot('hips', 0, -this.hipYaw, 0);
    const kneel = this.kneelK;
    const slide = this.slideK;
    // (an upright part leans back for a positive x: forward is negative)
    const F = this.lean - rockX + kneel * 0.35 - slide * 0.55 + this.workK * 0.45 + s.brace * 0.5 - s.windup * 0.25 + s.strike * 0.5 - this.recoil * 0.06;
    this.rot('torso', -F, this.hipYaw + Math.sin(ph) * 0.12 * run * (1 - this.aimK) + s.windup * 0.5 - s.strike * 0.7, this.side + rockZ);
    this.rot('head', -(-this.lean * 0.6 - kneel * 0.2 + slide * 0.4 + this.workK * 0.3 - fl * 0.2), 0, 0);
    // legs: swing with the stride, the knee folds as the leg comes through
    for (const [k, side] of SIDES.map((sd, i) => [i ? -1 : 1, sd] as const)) {
      const s1 = sn * k;
      const c1 = cs * k;
      let thigh = s1 * 0.8 * run;
      let shin = -(0.08 + Math.max(0, c1) * 1.25 * run);
      // on one knee: the left leg kneels, the right foot planted
      thigh = thigh * (1 - kneel) + (side === 'l' ? 0.15 : 1.35) * kneel;
      shin = shin * (1 - kneel) + (side === 'l' ? -1.55 : -1.45) * kneel;
      // sliding: the lead leg out long, the other folded under
      thigh = thigh * (1 - slide) + (side === 'l' ? 1.25 : 0.2) * slide;
      shin = shin * (1 - slide) + (side === 'l' ? -0.1 : -1.7) * slide;
      // braced: knees bent
      thigh += s.brace * 0.5 + this.workK * 0.5;
      shin -= s.brace * 0.7 + this.workK * 0.8;
      this.rot(`thigh_${side}`, thigh, 0, side === 'l' ? -0.04 - slide * 0.2 : 0.04);
      this.rot(`shin_${side}`, shin, 0, 0);
    }
    // arms: swinging with the run, or up with the gun (both hands), or working, or a swing
    const aim = this.aimK * (1 - this.workK);
    const swing = run * 0.7 * (1 - aim);
    const rec = this.recoil;
    // right arm (the gun hand)
    let ax = -sn * swing + 0.25 * (1 - aim) * Math.min(1, run + 0.4);
    let fx = 0.35 * (1 - aim) + run * 0.5 * (1 - aim);
    ax = ax * (1 - aim) + (Math.PI / 2 - 0.05 + rec * 0.25) * aim;
    fx = fx * (1 - aim) + (-rec * 0.2) * aim;
    // a melee swing: up and back over the shoulder, then down through
    if (s.windup > 0 || s.strike > 0) {
      ax = ax * (1 - s.windup) + -2.6 * s.windup;
      fx = fx * (1 - s.windup) + 0.9 * s.windup;
      ax = ax * (1 - s.strike) + 1.3 * s.strike;
      fx = fx * (1 - s.strike) + 0.1 * s.strike;
    }
    ax = ax * (1 - this.workK) + 1.05 * this.workK + Math.sin(this.t * 22) * 0.06 * this.workK;
    fx = fx * (1 - this.workK) + 0.7 * this.workK;
    if (s.haul) {
      ax = 0.9;
      fx = 0.9;
    }
    this.rot('arm_r', ax - kneel * 0.4 + slide * 0.6, 0, 0.06 - aim * 0.1);
    this.rot('fore_r', fx + kneel * 0.3, 0, 0);
    // left arm: the off hand comes over to steady the gun
    let bx = sn * swing + 0.15 * (1 - aim);
    let bfx = 0.3 * (1 - aim) + run * 0.5 * (1 - aim);
    bx = bx * (1 - aim) + 1.25 * aim;
    bfx = bfx * (1 - aim) + 0.55 * aim;
    bx = bx * (1 - this.workK) + 1.0 * this.workK - Math.sin(this.t * 22 + 1) * 0.06 * this.workK;
    bfx = bfx * (1 - this.workK) + 0.8 * this.workK;
    if (s.haul) {
      bx = 0.8;
      bfx = 1.1;
    }
    this.rot('arm_l', bx - slide * 0.9 - kneel * 0.2 + s.brace * 0.8, 0, aim * 0.5 - 0.06 - slide * 0.5);
    this.rot('fore_l', bfx + s.brace * 0.6, 0, -aim * 0.2);
    // a shield is held up front, higher when braced
    this.rot('shield', -s.brace * 0.2 - s.strike * 0.3, 0, 0);
    this.pos('shield', 0, s.brace * 0.05, -s.strike * 0.25);
    // knocked flat: the whole body over on its back
    if (s.floored) {
      this.model.rotation.set(-Math.PI / 2 * 0.85, this.yaw, 0, 'YXZ');
      this.model.position.y = 0.25;
    }
    this.root.updateMatrixWorld(true);
    const gun = this.p.gun;
    if (this.held && gun) {
      this.held.position.copy(gun.position);
      this.held.quaternion.copy(gun.quaternion);
    }
    if (this.heldMuzzle) this.heldMuzzle.getWorldPosition(this.muzzle);
    else if (this.muzzleObj) this.muzzleObj.getWorldPosition(this.muzzle);
    else this.muzzle.set(s.x + Math.cos(s.face) * 0.6, 1.2, s.z + Math.sin(s.face) * 0.6);
  }

  /** Lying in a bunk. */
  private sleep(s: Pose) {
    this.model.rotation.set(-Math.PI / 2, this.yaw, 0, 'YXZ');
    this.model.position.set(0, 0.55 + Math.sin(this.breath * 0.6) * 0.02, 0);
    this.rot('hips', 0, 0, 0);
    this.rot('torso', 0, 0, 0);
    this.rot('head', 0.2, 0, 0.3);
    for (const sd of SIDES) {
      this.rot(`thigh_${sd}`, 0.1, 0, 0);
      this.rot(`shin_${sd}`, -0.2, 0, 0);
      this.rot(`arm_${sd}`, 0.3, 0, sd === 'l' ? -0.3 : 0.3);
      this.rot(`fore_${sd}`, 0.6, 0, 0);
    }
    this.root.updateMatrixWorld(true);
    void s;
  }

  /**
   * Dead: falls the way it was hit (pitched over the hips, with a twist), bounces once, the limbs
   * flung out, and stays where it fell.
   */
  private fall(dt: number, s: Pose) {
    const t = s.deathT;
    // ease out with one bounce
    const k = t < 0.32 ? easeIn(t / 0.32) : t < 0.5 ? 1 - Math.sin(((t - 0.32) / 0.18) * Math.PI) * 0.12 : 1;
    // which way it goes over: back, away from the blow
    const rel = wrap(s.fallA - s.face);
    const backward = Math.cos(rel) < 0.2;
    const pitch = (backward ? 1 : -1) * (Math.PI / 2) * k;
    const roll = -Math.sin(rel) * 0.5 * k;
    this.model.rotation.set(pitch * -1, this.yaw + roll * 0.4, roll, 'YXZ');
    this.model.position.set(0, 0.18 * k, 0);
    this.rot('hips', 0, 0, 0);
    this.rot('torso', -0.2 * k, 0.3 * k, 0);
    this.rot('head', 0.4 * k * (backward ? -1 : 1), 0.5 * k, 0);
    this.rot('arm_l', -1.2 * k, 0, -1.1 * k);
    this.rot('fore_l', 0.5 * k, 0, 0);
    this.rot('arm_r', -0.6 * k, 0, 1.3 * k);
    this.rot('fore_r', 0.9 * k, 0, 0);
    this.rot('thigh_l', 0.35 * k, 0, -0.25 * k);
    this.rot('shin_l', -0.6 * k, 0, 0);
    this.rot('thigh_r', -0.1 * k, 0, 0.2 * k);
    this.rot('shin_r', -0.2 * k, 0, 0);
    // long dead: sinks a touch into the shadow and dims
    if (t > 10) this.model.position.y -= Math.min(0.6, (t - 10) * 0.15);
    this.root.updateMatrixWorld(true);
    void dt;
  }

  dispose() {
    this.inst?.dispose();
  }
}

const easeIn = (x: number) => x * x;
const wrap = (a: number) => {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const BLOB = new THREE.CircleGeometry(0.42, 14);
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });

/** A stand-in body for when the models haven't been built: a capsule. */
function fallback() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 3, 8), new THREE.MeshToonMaterial({ color: 0xc8642a }));
  m.position.y = 0.85;
  g.add(m);
  return g;
}
