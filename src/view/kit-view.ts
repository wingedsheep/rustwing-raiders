/**
 * How the new kit looks and sounds (see sim/kit.ts). Each its own thing, read at a glance:
 *
 *  - Bulwark:      a curved wall of gold light ahead of the ship, its cells glowing hotter as it fills;
 *                  let go, it's thrown up the screen as a wave of fire.
 *  - Swap Beacon:  a spinning diamond on a dotted line from the ship, blinking faster as it runs out;
 *                  the swap folds you through in a streak, and the beacon left behind swallows
 *                  what was meant for you and bursts.
 *  - Ablative:     thin shells round the hull, one per layer; a hit shatters the outer one.
 *  - Static:       blue sparks crawling over the hull, more each graze; let go, a crack of lightning.
 *  - Carpet Bomb:  little bombs tumbling down behind you, red lamps blinking, going off on the ground.
 *  - Cryo Bomb:    a white flash, every bullet cased in ice and hanging still; then snow.
 *  - Gravity Well: a black knot ahead with light spiralling into it; then it bursts.
 *  - Drone Wing:   four little drones off the wings, engines lit, firing with you.
 */

import * as THREE from 'three';
import type { Level, LevelEvent, Player } from '../sim/level';
import { BULWARK, DRONES, WELL, shipKit, worldKit } from '../sim/kit';
import { FLIGHT_Y, HALF_W, TILT, fromFlight } from '../sim/types';
import { SOFT, instanced } from './bullets';
import { CRYSTAL, crescent } from './gun-looks';
import type { Fx } from './fx';
import type { Strokes } from './strokes';
import { audio } from '../audio';

/** What the level view lends us. */
export interface KitHooks {
  fx: Fx;
  strokes: Strokes;
  zap(x: number, z: number, r: number, col: number): void;
  bolt(points: number[], col: number): void;
  punch(k: number): void;
  shake(k: number): void;
  flash(k: number, col: number): void;
  impact(col: number, time: number): void;
  pop(text: string, x: number, z: number, color: string, big?: boolean): void;
}

const Y = FLIGHT_Y + 0.6;
const COS_TILT = Math.cos(TILT);
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(0xffc860);
const GOLD_HOT = new THREE.Color(0xfff0c0);
const BEACON = new THREE.Color(0x7affc8);
const PLATE = new THREE.Color(0xd8c8a8);
const SPARKY = new THREE.Color(0x9ad8ff);
const ICE = new THREE.Color(0xd8f8ff);
const ICE_MIST = new THREE.Color(0xcfe8f4);
const ICE_END = new THREE.Color(0x6a8ca8);
const VOID = new THREE.Color(0xb080ff);
const DRONE = new THREE.Color(0xc8ccd4);
const BOMB = new THREE.Color(0x2a2624);
const LAMP = new THREE.Color(0xff3a2a);

const MAX = 300;
const MAX_GLOW = 1500;

/** A little drone: a flat arrowhead hull with two stub wings, nose +z. */
const DRONE_HULL = (() => {
  const g = new THREE.ConeGeometry(0.45, 1.3, 4).rotateX(Math.PI / 2).scale(1, 0.4, 1);
  return g;
})();
const WING = new THREE.BoxGeometry(1.6, 0.08, 0.35);
/** A bomblet: a stubby bomb with a tail ring. */
const BOMBLET = new THREE.CapsuleGeometry(0.22, 0.4, 3, 8).rotateX(Math.PI / 2);
/** The beacon: a diamond. */
const DIAMOND = new THREE.OctahedronGeometry(0.5, 0).scale(1, 1.4, 1);
/** A shell round the hull (a thin ring lying flat). */
const SHELL = new THREE.RingGeometry(0.93, 1, 6, 1).rotateX(-Math.PI / 2);

export class KitArt {
  readonly group = new THREE.Group();
  private wall: THREE.InstancedMesh;
  private wallRim: THREE.InstancedMesh;
  private shells: THREE.InstancedMesh;
  private solid: Record<'drone' | 'wing' | 'bomb' | 'diamond', THREE.InstancedMesh>;
  private ice: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private dark: THREE.InstancedMesh;
  private mm = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private cam = new THREE.Quaternion();
  private time = 0;
  /** The last flash of each wall's block (it flickers when hit). */
  private hitT = new Map<number, number>();

  constructor(private h: KitHooks) {
    const add = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.wall = instanced(crescent(1.5, 0.6), add, 8, 25);
    this.wallRim = instanced(crescent(1.4, 0.12), add, 8, 25);
    this.shells = instanced(SHELL, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 16, 25);
    const lit = new THREE.MeshLambertMaterial();
    const glowy = new THREE.MeshBasicMaterial();
    this.solid = {
      drone: instanced(DRONE_HULL, lit, 16, 24),
      wing: instanced(WING, lit, 16, 24),
      bomb: instanced(BOMBLET, lit, MAX, 23),
      diamond: instanced(DIAMOND, glowy, 8, 24),
    };
    lit.depthTest = true;
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 120, emissive: 0x3a7aa8, emissiveIntensity: 0.7, transparent: true, opacity: 0.85, flatShading: true });
    this.ice = instanced(CRYSTAL, iceMat, 1200, 27);
    this.glow = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX_GLOW, 26);
    // the well's black middle: it takes light away
    this.dark = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.85 }), 8, 25);
    this.group.add(this.wall, this.wallRim, this.shells, ...Object.values(this.solid), this.ice, this.glow, this.dark);
  }

  // ── events ─────────────────────────────────────────────────────────────────────────────────

  /** A special went off: true if it's one of ours (the level view leaves it be). */
  special(e: Extract<LevelEvent, { type: 'special' }>, lv: Level): boolean {
    const { fx, strokes } = this.h;
    switch (e.kind) {
      case 'carpet':
        // the bay doors open: a puff behind, and it starts to rain
        fx.ring(e.x, Y, e.z + 1, 4, 0.3, true, 0xffa040);
        this.h.flash(0.2, 0xffd8a0);
        this.h.pop('CARPET BOMB', e.x, e.z - 4, '#ffb060', true);
        audio.play('special_carpet');
        return true;
      case 'cryo': {
        // the world stops: white, a ring of frost the width of the screen, the air full of ice
        this.h.flash(0.35, 0xd8f8ff);
        fx.ring(e.x, Y, e.z, 60, 0.7, true, 0xbff4ff);
        fx.ring(e.x, Y, e.z, 30, 0.4, true, 0xffffff);
        for (let k = 0; k < 60; k++)
          fx.add({ x: (Math.random() - 0.5) * HALF_W * 2, y: Y + Math.random() * 3, z: lv.scroll + (Math.random() - 0.5) * 50, vy: -0.6, size: 0.2 + Math.random() * 0.25, grow: 0.3, life: 1.2 + Math.random(), color: ICE, carried: true });
        this.h.shake(0.4);
        this.h.pop('CRYO BOMB', e.x, e.z - 4, '#bff4ff', true);
        audio.play('special_cryo');
        return true;
      }
      case 'gravity':
        // a point ahead tears open
        fx.ring(e.x, Y, e.z - WELL.ahead, 8, 0.4, true, 0xb080ff);
        strokes.star(e.x, e.z - WELL.ahead, 4, 0xe0d0ff, 0.3);
        this.h.flash(0.1, 0xc8a0ff);
        this.h.pop('GRAVITY WELL', e.x, e.z - WELL.ahead - 4, '#c8a8ff', true);
        audio.play('special_gravity');
        return true;
      case 'drones':
        // four peel off the rack in a rush of sparks
        for (const [ox, oz] of DRONES.at) {
          fx.ring(e.x + ox, Y, e.z + oz, 2, 0.2, true, 0xc8e0ff);
          fx.sparks(e.x + ox, Y, e.z + oz, 6, 0xc8e0ff, 10, 0.2, 0.16);
        }
        this.h.flash(0.15, 0xd8e8ff);
        this.h.pop('DRONE WING', e.x, e.z - 4, '#c8e0ff', true);
        audio.play('special_drones');
        return true;
    }
    return false;
  }

  /** The kit's own events. */
  event(e: Extract<LevelEvent, { type: 'kit' }>, lv: Level) {
    const { fx, strokes } = this.h;
    const pan = e.x / HALF_W;
    switch (e.what) {
      case 'wallUp':
        fx.ring(e.x, Y, e.z - 2.5, 3.5, 0.18, true, 0xffd880);
        strokes.burst(e.x, e.z - BULWARK.reach, 6, 0xffe0a0, 4, 0.14, 0.3, -Math.PI / 2);
        this.h.punch(0.1);
        audio.play('wall_up', { pan });
        break;
      case 'wallBlock': {
        // the bullet flattens on it: a gold splash, the wall flickers
        this.hitT.set(e.id, this.time);
        fx.add({ x: e.x, y: Y, z: e.z, size: 1.4, grow: 0.3, life: 0.07, color: GOLD_HOT, carried: true });
        fx.sparks(e.x, Y, e.z, 4, 0xffd070, 10, 0.16, 0.14);
        const full = (e.n ?? 0) / BULWARK.full;
        audio.play('wall_block', { pan, vol: 0.45, pitch: 0.8 + full * 0.8 });
        break;
      }
      case 'wallThrow': {
        // everything it took, up the screen as a wave of fire
        const n = e.n ?? 0;
        const k = 0.4 + Math.min(1, n / BULWARK.full);
        for (let j = 0; j < 30; j++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
          const v = 30 + Math.random() * 30;
          fx.add({ x: e.x + (Math.random() - 0.5) * 6, y: Y, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, size: 0.8 + Math.random() * 0.6 * k, grow: 2, life: 0.4 + Math.random() * 0.3, drag: 1.5, color: GOLD_HOT, to: new THREE.Color(0xc04010), carried: true });
        }
        strokes.burst(e.x, e.z, 14, 0xffe0a0, 14 + 12 * k, 0.24, 0.6, -Math.PI / 2);
        fx.ring(e.x, Y, e.z - 3, 8 * k, 0.3, true, 0xffc860);
        this.h.punch(0.3 * k);
        this.h.shake(0.25 * k);
        this.h.impact(0xfff0c0, 0.05);
        audio.play('wall_throw', { pan, vol: 0.6 + 0.4 * k, pitch: 1.15 - 0.3 * k });
        break;
      }
      case 'beacon':
        // thrown: a streak from the ship to where it lands
        strokes.slash(e.x, e.z, e.x2!, e.z2!, 0x7affc8, 0.25, 0.18);
        fx.ring(e.x2!, Y, e.z2!, 2.4, 0.2, true, 0x7affc8);
        audio.play('beacon_throw', { pan });
        break;
      case 'swap': {
        // you're folded through: two flashes, a streak of you between them, a ring where you went
        fx.add({ x: e.x, y: Y, z: e.z, size: 3, grow: 0.3, life: 0.08, color: WHITE, carried: true });
        fx.add({ x: e.x2!, y: Y, z: e.z2!, size: 3.5, grow: 0.3, life: 0.1, color: WHITE, carried: true });
        strokes.slash(e.x, e.z, e.x2!, e.z2!, 0xc8fff0, 1.2, 0.2);
        fx.ring(e.x2!, Y, e.z2!, 4, 0.22, true, 0x7affc8);
        fx.ring(e.x, Y, e.z, 3, 0.4, true, 0xffc860);
        for (let k = 0; k < 10; k++) {
          const f = k / 10;
          fx.add({ x: e.x + (e.x2! - e.x) * f, y: Y, z: e.z + (e.z2! - e.z) * f, size: 0.8, grow: 0.2, life: 0.15 + f * 0.1, color: BEACON, carried: true });
        }
        this.h.punch(0.15);
        audio.play('beacon_swap', { pan: e.x2! / HALF_W });
        break;
      }
      case 'beaconBurst': {
        const k = Math.min(1, (e.n ?? 0) / 8);
        fx.explode(e.x, FLIGHT_Y, e.z, 1 + 1.5 * k, 0x7affc8, true);
        fx.ring(e.x, Y, e.z, 6 + 4 * k, 0.3, true, 0x7affc8);
        strokes.burst(e.x, e.z, 10, 0xc8fff0, 6 + 4 * k, 0.2, 0.4);
        this.h.punch(0.15 + 0.2 * k);
        audio.play('beacon_burst', { pan });
        break;
      }
      case 'beaconFizzle':
        fx.sparks(e.x, Y, e.z, 8, 0x7affc8, 6, 0.3, 0.16);
        audio.play('beacon_fizzle', { pan });
        break;
      case 'layerBreak':
        // the outer shell goes: plates flung out, a ring, the hull flashes
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 8 + Math.random() * 10;
          fx.add({ x: e.x, y: Y, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 4, size: 0.18 + Math.random() * 0.15, life: 1.2, color: Math.random() < 0.5 ? PLATE : WHITE, solid: true, gravity: 24, spin: 14 });
        }
        fx.ring(e.x, Y, e.z, 4.5, 0.25, true, 0xfff0d0);
        strokes.burst(e.x, e.z, 10, 0xfff0d0, 5, 0.18, 0.35);
        this.h.shake(0.25);
        audio.play('layer_break', { pan });
        break;
      case 'layerGrow': {
        const p = lv.players[e.id];
        if (p) fx.ring(p.x, Y, p.z, 3, 0.3, true, 0xfff0d0);
        audio.play('layer_grow', { pan });
        break;
      }
      case 'charge':
        fx.sparks(e.x, Y, e.z, 3, 0x9ad8ff, 8, 0.15, 0.14);
        audio.play('static_charge', { pan, vol: 0.35, pitch: 0.8 + (e.n ?? 0) * 0.08 });
        break;
      case 'zap': {
        // all of it at once: bolts off the hull every way, a flash of blue
        const n = e.n ?? 1;
        for (let k = 0; k < 3 + n; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = 3 + Math.random() * 3;
          this.h.bolt([e.x, e.z, e.x + Math.cos(a) * d * 0.5, e.z + Math.sin(a) * d * 0.5, e.x + Math.cos(a) * d, e.z + Math.sin(a) * d], 0x9ad8ff);
        }
        fx.add({ x: e.x, y: Y, z: e.z, size: 3 + n * 0.5, grow: 0.5, life: 0.1, color: SPARKY, carried: true });
        fx.ring(e.x, Y, e.z, 3 + n * 0.6, 0.2, true, 0x9ad8ff);
        this.h.punch(0.1 + 0.03 * n);
        audio.play('static_zap', { pan, vol: 0.5 + 0.06 * n });
        break;
      }
      case 'drop':
        break;
      case 'bomblet': {
        // it goes off on the ground under where it fell
        const gy = this.h.fx.ground(e.x, fromFlight(e.z, 0));
        const gz = fromFlight(e.z, gy);
        fx.explode(e.x, gy + 0.3, gz, 0.9, 0xffa040, false);
        fx.ring(e.x, gy + 0.3, gz, 3.4, 0.2, false, 0xffd8a0);
        fx.add({ x: e.x, y: gy + 0.2, z: gz, size: 2.2, grow: 1, life: 3, color: new THREE.Color(0x2a2220), to: new THREE.Color(0x4a3a30), glow: false });
        this.h.shake(0.05);
        audio.play('bomblet', { pan, vol: 0.55 });
        break;
      }
      case 'snow':
        // a frozen bullet lets go: flakes drifting down
        for (let k = 0; k < 3; k++) fx.add({ x: e.x + (Math.random() - 0.5), y: Y, z: e.z, vx: (Math.random() - 0.5) * 2, vy: -2, vz: 1.5, size: 0.22, grow: 0.6, life: 1.4, color: ICE, carried: true });
        if (Math.random() < 0.05) audio.play('snow', { pan, vol: 0.6 });
        break;
      case 'wellBurst':
        // it lets go: a flash, a black ring blown out, the view rocked
        this.h.flash(0.15, 0xd0b8ff);
        this.h.impact(0xd0b8ff, 0.05);
        fx.ring(e.x, Y, e.z, WELL.r * 1.4, 0.4, true, 0xd0b8ff);
        fx.ring(e.x, Y, e.z, WELL.r * 0.8, 0.25, true, 0xffffff);
        strokes.burst(e.x, e.z, 10, 0xe0d0ff, WELL.r * 0.8, 0.22, 0.35);
        for (let k = 0; k < 40; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 20 + Math.random() * 30;
          fx.add({ x: e.x, y: Y, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, size: 0.3, grow: 0.3, life: 0.4, drag: 2, color: VOID, carried: true });
        }
        this.h.punch(0.5);
        this.h.shake(0.45);
        audio.play('well_burst', { pan });
        break;
      case 'dronesGone': {
        const p = lv.players[e.id];
        if (p) for (const [ox, oz] of DRONES.at) fx.sparks(p.x + ox, Y, p.z + oz, 6, 0xc8e0ff, 8, 0.25, 0.14);
        audio.play('drones_gone', { pan });
        break;
      }
    }
  }

  // ── every frame ────────────────────────────────────────────────────────────────────────────

  update(time: number, lv: Level, cam: THREE.Quaternion, livery: number[]) {
    this.time = time;
    this.cam.copy(cam);
    for (const m of [this.wall, this.wallRim, this.shells, ...Object.values(this.solid), this.ice, this.glow, this.dark]) m.count = 0;
    lv.players.forEach((p) => this.ship(p, lv, livery[p.id] ?? 0xffffff));
    this.world(lv);
    for (const m of [this.wall, this.wallRim, this.shells, ...Object.values(this.solid), this.ice, this.glow, this.dark]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private ship(p: Player, lv: Level, livery: number) {
    if (p.down) return;
    const k = shipKit(p);
    const { fx } = this.h;
    // the Bulwark: a bowed wall of gold, hotter the fuller, flickering where it's struck
    if (k.wall) {
      const full = Math.min(1, k.wall.n / BULWARK.full);
      const hit = Math.max(0, 1 - (this.time - (this.hitT.get(p.id) ?? -9)) / 0.08);
      const z = p.z - 1;
      const sc = BULWARK.width * 1.05;
      const wob = 1 + 0.03 * Math.sin(this.time * 40);
      this.q.identity();
      this.put(this.wall, p.x, Y, fromFlight(z, Y), this.q, sc * wob, 1, sc * 0.9, this.c.copy(GOLD).lerp(GOLD_HOT, full).multiplyScalar(0.7 + 0.8 * full + 0.8 * hit));
      this.put(this.wallRim, p.x, Y, fromFlight(z, Y), this.q, sc * 1.02, 1, sc * 0.92, this.c.copy(GOLD_HOT).multiplyScalar(1.6 + 1.2 * hit));
      // its cells: little motes over the face, more and brighter as it fills
      if (Math.random() < 0.4 + full) {
        const a = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        fx.add({ x: p.x + Math.cos(a) * sc, y: Y, z: z - Math.sin(a) * sc * 0.9 + sc * 0.9, size: 0.25 + full * 0.3, grow: 0.3, life: 0.15, color: GOLD_HOT, carried: true });
      }
      if (full > 0.6 && Math.random() < full * 0.2) this.h.zap(p.x, z - BULWARK.reach * 0.6, 2.5, 0xffd880);
    }
    // the beacon: a spinning diamond on a dotted line, blinking faster as it runs out
    if (k.beacon) {
      const b = k.beacon;
      const left = Math.max(0, 1 - b.t / 6);
      const blink = (this.time * (2 + 10 * (1 - left))) % 1 < 0.5;
      this.q.setFromAxisAngle(UP, this.time * 4);
      const bob = Math.sin(this.time * 6) * 0.15;
      this.put(this.solid.diamond, b.x, Y + 0.4 + bob, fromFlight(b.z, Y + 0.4), this.q, 1, 1, 1, this.c.copy(BEACON).multiplyScalar(blink ? 2 : 1.1));
      this.sprite(b.x, b.z, 3, 3, this.c.copy(BEACON).multiplyScalar(blink ? 0.6 : 0.3));
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const n = Math.max(2, Math.floor(Math.hypot(dx, dz) / 1.4));
      for (let j = 1; j < n; j++) {
        const f = (j + ((this.time * 3) % 1)) / n;
        if (f >= 1) continue;
        this.sprite(p.x + dx * f, p.z + dz * f, 0.35, 0.35, this.c.copy(BEACON).multiplyScalar(0.5));
      }
    }
    // the Ablative Skin: a thin shell per layer round the hull
    if (p.stats.skin === 'ablative')
      for (let j = 0; j < k.layers; j++) {
        const r = 2.2 + j * 0.45;
        this.q.setFromAxisAngle(UP, this.time * (j % 2 ? -0.6 : 0.6) + j);
        this.put(this.shells, p.x, Y - 0.2, fromFlight(p.z, Y - 0.2), this.q, r, 1, r * 0.9, this.c.copy(PLATE).multiplyScalar(0.35 + 0.1 * j));
      }
    // the Static Skin: blue sparks crawling on the hull, more for every charge
    if (p.stats.skin === 'static' && k.charge > 0) {
      const c = k.charge / 8;
      if (Math.random() < 0.15 + c * 0.6) this.h.zap(p.x, p.z, 1.2 + c, 0x9ad8ff);
      this.sprite(p.x, p.z, 2 + c * 3, 2 + c * 3, this.c.copy(SPARKY).multiplyScalar(0.15 + 0.35 * c));
    }
    // the Drone Wing: little ships off the wings, engines lit, a flash when each fires
    k.drones.forEach((d) => {
      const tilt = Math.sin(this.time * 3 + d.x) * 0.15;
      this.q.setFromAxisAngle(UP, Math.PI).multiply(this.q2.setFromAxisAngle(Z, tilt));
      const wz = fromFlight(d.z, Y);
      this.put(this.solid.drone, d.x, Y, wz, this.q, 1, 1, 1, this.c.copy(DRONE));
      this.put(this.solid.wing, d.x, Y, wz + 0.2, this.q, 1, 1, 1, this.c.setHex(livery).multiplyScalar(0.8));
      this.sprite(d.x, d.z + 0.8, 0.9, 0.9, this.c.setHex(0x9ad8ff).multiplyScalar(0.8 + 0.3 * Math.sin(this.time * 50 + d.x)));
      if (lv.time - d.fired < 0.04) this.sprite(d.x, d.z - 0.9, 1.4, 1.4, this.c.setHex(0xfff0c0).multiplyScalar(1.2));
      if (Math.random() < 0.3) fx.add({ x: d.x, y: Y, z: d.z + 0.9, vz: 6, size: 0.2, grow: 0.3, life: 0.15, color: SPARKY, carried: true });
    });
  }

  private world(lv: Level) {
    const w = worldKit(lv);
    const { fx } = this.h;
    // bomblets tumbling down to the land, their lamps blinking
    for (const b of w.bomblets) {
      const f = Math.min(1, b.t / 0.45);
      const y = Y - f * f * (FLIGHT_Y - 0.5);
      const z = fromFlight(b.z, y);
      this.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4 + f * 1.2).multiply(this.q2.setFromAxisAngle(Z, b.x * 3));
      const s = 1.4 - 0.4 * f;
      this.put(this.solid.bomb, b.x, y, z, this.q, s, s, s, this.c.copy(BOMB));
      if ((b.t * 14) % 1 < 0.5) this.put(this.solid.diamond, b.x, y + 0.2, z, this.q, 0.25, 0.25, 0.25, this.c.copy(LAMP).multiplyScalar(2.5));
    }
    // the frozen: each bullet cased in ice, a cold light
    if (w.frozenT > 0) {
      let n = 0;
      for (const b of w.frozen.keys()) {
        if (b.dead || n++ > 380) continue;
        const r = Math.max(0.5, b.r * 1.6);
        for (let j = 0; j < 3; j++) {
          const a = (j / 3) * Math.PI * 2 + b.x;
          this.v.set(Math.cos(a), 0.9, Math.sin(a)).normalize();
          this.q.setFromUnitVectors(UP, this.v);
          this.put(this.ice, b.x, Y, fromFlight(b.z, Y), this.q, r * 0.6, r, r * 0.6, this.c.copy(ICE), 1200);
        }
        if (w.frozenT < 0.4 && Math.random() < 0.05) fx.add({ x: b.x, y: Y, z: b.z, vy: -1, size: 0.2, grow: 0.5, life: 0.5, color: ICE_MIST, to: ICE_END, glow: false, carried: true });
      }
    }
    // the well: a black knot with light spiralling into it
    if (w.well) {
      const g = w.well;
      const k = Math.min(1, g.t / 0.3);
      const d = (4 + 3 * Math.sin(this.time * 9)) * k;
      this.dark.count = 0;
      this.put(this.dark, g.x, Y, fromFlight(g.z, Y), this.camQ(), d, d, 1, this.c.setRGB(1, 1, 1));
      this.sprite(g.x, g.z, d * 1.4, d * 1.4, this.c.copy(VOID).multiplyScalar(0.3));
      for (let j = 0; j < 2; j++) {
        const a = Math.random() * Math.PI * 2;
        const r = WELL.r * (0.4 + Math.random() * 0.4);
        const life = 0.7;
        // in on a spiral: aimed a little off the middle
        const ta = a + 0.9;
        const vx = (g.x + Math.cos(ta) * 1.5 - (g.x + Math.cos(a) * r)) / life;
        const vz = (g.z + Math.sin(ta) * 1.5 - (g.z + Math.sin(a) * r)) / life;
        fx.add({ x: g.x + Math.cos(a) * r, y: Y, z: g.z + Math.sin(a) * r, vx, vz, size: 0.16, grow: 0, life, color: j % 2 ? VOID : WHITE, glow: j % 2 === 0, carried: true });
      }
      if (Math.random() < 0.12) this.h.zap(g.x, g.z, 2, 0xc8a8ff);
    }
    // beacons left behind: they pulse as they catch, bigger with what they've caught
    for (const h of w.husks) {
      const s = 1.5 + h.n * 0.25 + 0.3 * Math.sin(this.time * 30);
      this.q.setFromAxisAngle(UP, this.time * 12);
      this.put(this.solid.diamond, h.x, Y + 0.4, fromFlight(h.z, Y + 0.4), this.q, 1 + h.n * 0.05, 1 + h.n * 0.05, 1 + h.n * 0.05, this.c.copy(BEACON).lerp(GOLD_HOT, 0.4).multiplyScalar(2.2));
      this.sprite(h.x, h.z, s * 2, s * 2, this.c.copy(BEACON).multiplyScalar(0.6));
    }
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────────

  private put(mesh: THREE.InstancedMesh, x: number, y: number, z: number, q: THREE.Quaternion, sx: number, sy: number, sz: number, col: THREE.Color, max = MAX) {
    if (mesh.count >= max) return;
    this.mm.compose(this.v.set(x, y, z), q, this.s.set(sx, sy, sz));
    mesh.setMatrixAt(mesh.count, this.mm);
    mesh.setColorAt(mesh.count, col);
    mesh.count++;
  }

  private camQ() {
    return this.q2.copy(this.cam);
  }

  private sprite(x: number, z: number, wid: number, len: number, col: THREE.Color) {
    if (this.glow.count >= MAX_GLOW) return;
    this.q2.copy(this.cam).multiply(this.q.setFromAxisAngle(Z, Math.atan2(0, -COS_TILT)));
    this.mm.compose(this.v.set(x, Y, fromFlight(z, Y)), this.q2, this.s.set(wid, len, 1));
    this.glow.setMatrixAt(this.glow.count, this.mm);
    this.glow.setColorAt(this.glow.count, col);
    this.glow.count++;
  }
}

