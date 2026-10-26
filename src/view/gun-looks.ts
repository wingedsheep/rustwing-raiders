/**
 * The forge's guns, each in its own look, sound and feel (see game/lab-parts.ts). A gun is more
 * than its numbers: you should know which one fired with your eyes shut, and love or hate it on
 * the first squeeze.
 *
 *  - Frost Sprayer: no fire in it at all. A cold, pale mist with ice glinting in it, and a hiss.
 *  - Wave Emitter:  a crescent of teal light that swells as it rolls, and a push you feel in the floor.
 *  - Saw Launcher:  a spinning steel blade shedding sparks; it tings off the screen's edge and grinds in.
 *  - Hive Darts:    little amber darts weaving like bees, a buzz, a sting.
 *  - Phase Needle:  a thin pink needle with ghosts of itself behind; it goes in and out the far side.
 *  - Charge Cannon: a violet ball gathering at the muzzle, humming higher; let go, it's thunder.
 *  - Anchor Spike:  an iron spike on a chain that pays out behind it, and holds what it bites to the ground.
 *  - Bumper Charge: a fat rubber ball, squashing as it goes; what it hits is sent tumbling.
 *
 * And what they leave on what they hit: ice that grows over it and freezes it still, the chain
 * holding it, the tumble of the flung. Everything here is view: the sim says what happened.
 */

import * as THREE from 'three';
import type { Enemy, Level, LevelEvent, Player, Shot } from '../sim/level';
import type { Gun } from '../sim/build';
import { ripened } from '../sim/arsenal';
import { FLIGHT_Y, HALF_W, TILT, fromFlight } from '../sim/types';
import { OCTA, SOFT, SPHERE, STREAK, instanced, material } from './bullets';
import type { Instance } from '../render/assets';
import type { Fx } from './fx';
import type { Strokes } from './strokes';
import { audio } from '../audio';

/** What the level view lends us. */
export interface LookHooks {
  fx: Fx;
  strokes: Strokes;
  zap(x: number, z: number, r: number, col: number): void;
  bolt(points: number[], col: number): void;
  punch(k: number): void;
  shove(dx: number, dz: number, k: number): void;
  shake(k: number): void;
  shiver(id: number, k: number): void;
  impact(col: number, time: number): void;
}

/** How a hit was taken care of: `own` (drawn and sounded here), `quiet` (the usual sparks, our sound), or not at all. */
export type HitLook = 'own' | 'quiet' | undefined;

const OWNED = new Set(['frost', 'wave', 'saw', 'hive', 'needle', 'charge', 'anchor', 'bumper']);

const SHOT_Y = FLIGHT_Y + 0.6;
const COS_TILT = Math.cos(TILT);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color(1, 1, 1);

// the guns' colours (linear-ish: past 1 blooms)
const ICE = new THREE.Color(0xd8f8ff);
const ICE_MIST = new THREE.Color(0xcfe8f4);
const ICE_DEEP = new THREE.Color(0x5ab8e8);
const ICE_END = new THREE.Color(0x6a8ca8);
const TEAL = new THREE.Color(0x5af0d0);
const STEEL = new THREE.Color(0xc8d0d8);
const SPARK = new THREE.Color(0xfff0b0);
const EMBER = new THREE.Color(0xff8a30);
const AMBER = new THREE.Color(0xffc040);
const PINK = new THREE.Color(0xff6ad0);
const CYAN = new THREE.Color(0x6ae8ff);
const VIOLET = new THREE.Color(0xb080ff);
const VIOLET_HOT = new THREE.Color(0xf0e0ff);
const IRON = new THREE.Color(0x3a3634);
const RUST = new THREE.Color(0x7a5038);
const HEAT = new THREE.Color(0xff9a40);
const RUBBER = new THREE.Color(0xff7a2a);
const RUBBER_BAND = new THREE.Color(0x2a1a14);
const DUST = new THREE.Color(0xd8c8a8);
const DUST_END = new THREE.Color(0x5a4a3a);
const FLAME_HOT = new THREE.Color(0xfff6d8);
const FLAME = new THREE.Color(0xffa838);
const FLAME_RED = new THREE.Color(0xa82010);
const FLAME_SMOKE = new THREE.Color(0x5a2c1c);
const FLAME_SMOKE_END = new THREE.Color(0x26201e);

// ── geometry ─────────────────────────────────────────────────────────────────────────────────

/** A saw blade lying flat: a disc with hooked teeth round it, radius 1. */
const BLADE = (() => {
  const sh = new THREE.Shape();
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2;
    const a1 = ((k + 0.7) / n) * Math.PI * 2;
    const a2 = ((k + 1) / n) * Math.PI * 2;
    const p = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
    if (k === 0) sh.moveTo(...p(a0, 0.78));
    sh.lineTo(...p(a1, 1));
    sh.lineTo(...p(a1 + 0.02, 0.78));
    sh.lineTo(...p(a2, 0.78));
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.18, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04).rotateX(Math.PI / 2);
})();
/** The hub over it. */
const HUB = new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12);
/** A dart: a short cone, point forward. */
const DART = new THREE.ConeGeometry(0.13, 0.62, 6).rotateX(Math.PI / 2);
/** Its wings: two flat blades either side (they blur). */
const WINGS = (() => {
  const g = new THREE.PlaneGeometry(0.7, 0.22).rotateX(-Math.PI / 2);
  return g.translate(0, 0, -0.08);
})();
/** An anchor spike: a long barbed iron head, point forward. */
const SPIKE = (() => {
  const pts: [number, number][] = [[0.001, 1.1], [0.16, 0.5], [0.34, 0.15], [0.12, 0.2], [0.12, -0.7], [0.2, -0.75], [0.2, -0.85], [0.001, -0.85]];
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 8).rotateX(Math.PI / 2);
})();
/** A link of chain, lying along +z. */
const LINK = new THREE.TorusGeometry(0.2, 0.06, 5, 10).scale(1, 1.6, 1).rotateX(Math.PI / 2);
/** The stake a pinned thing is chained to, point down. */
const STAKE = new THREE.ConeGeometry(0.35, 1.6, 6).rotateX(Math.PI);
/** A band round the bumper's middle. */
const BAND = new THREE.TorusGeometry(1, 0.16, 6, 20).rotateX(Math.PI / 2);
/** An ice crystal: a six-sided prism with a point on top, along +y from its foot. */
export const CRYSTAL = (() => {
  const g = new THREE.CylinderGeometry(0.22, 0.28, 0.7, 6).translate(0, 0.35, 0);
  const tip = new THREE.ConeGeometry(0.22, 0.45, 6).translate(0, 0.925, 0);
  const pos = [...(g.toNonIndexed().attributes.position.array as Float32Array), ...(tip.toNonIndexed().attributes.position.array as Float32Array)];
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
})();

/**
 * A crescent of light, bowed forward (+z), its front edge at z = 0: brightest at the leading rim,
 * fading in behind and out at its tips. `width` how far round it goes (radians).
 */
export function crescent(width: number, thick: number) {
  const seg = 40;
  const rings = 6;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const f = j / rings; // 0 inner .. 1 rim
    const r = 1 - thick + thick * f;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const a = Math.PI / 2 + (u - 0.5) * width;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r - 1);
      const tips = Math.pow(Math.sin(u * Math.PI), 0.7);
      const k = Math.pow(f, 2.2) * tips * (f === 1 ? 0.6 : 1);
      col.push(k, k, k);
    }
  }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const MAX = 400;
const MAX_LINKS = 900;
const MAX_ICE = 400;
const MAX_GLOW = 2500;

type MeshKey = 'blade' | 'hub' | 'needle' | 'sheath' | 'dart' | 'wings' | 'orb' | 'orbShell' | 'spike' | 'spikeTip' | 'ball' | 'band' | 'wave' | 'waveRim';

export class GunLooks {
  readonly group = new THREE.Group();
  private m: Record<MeshKey, THREE.InstancedMesh>;
  private links: THREE.InstancedMesh;
  private stakes: THREE.InstancedMesh;
  private ice: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh;
  private streaks: THREE.InstancedMesh;
  private seeds = new WeakMap<Shot, number>();
  /** When each enemy froze, and when it was pinned. */
  private frozeAt = new Map<number, number>();
  private pinned = new Map<number, number>();
  /** How far round each flung thing has tumbled. */
  private tumble = new Map<number, number>();
  /** Each charge cannon full the last frame (to ping once when it fills). */
  private full = new WeakMap<Gun, boolean>();
  private time = 0;
  private mm = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private cam = new THREE.Quaternion();

  constructor(private h: LookHooks) {
    // lit but not metallic (with no sky to reflect, metal reads black at this size)
    const solid = new THREE.MeshLambertMaterial();
    const steel = new THREE.MeshBasicMaterial();
    const light = material('light');
    light.depthWrite = false;
    const haze = material('haze');
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, order = 24) => {
      const mesh = instanced(geo, mat, MAX, order);
      this.group.add(mesh);
      return mesh;
    };
    this.m = {
      wave: mk(crescent(1.9, 0.75), glow, 25),
      waveRim: mk(crescent(1.7, 0.18), glow, 25),
      blade: mk(BLADE, steel),
      hub: mk(HUB, light),
      needle: mk(SPHERE, light),
      sheath: mk(OCTA, haze, 25),
      dart: mk(DART, light),
      wings: mk(WINGS, haze, 25),
      orb: mk(SPHERE, light),
      orbShell: mk(SPHERE, haze, 25),
      spike: mk(SPIKE, solid),
      spikeTip: mk(SPHERE, light),
      ball: mk(SPHERE, solid),
      band: mk(BAND, solid),
    };
    // the chain and the stake are in the world (things in front cover them), unlike the rounds
    const iron = new THREE.MeshLambertMaterial();
    this.links = instanced(LINK, iron, MAX_LINKS, 23);
    this.stakes = instanced(STAKE, iron, 40, 23);
    iron.depthTest = true;
    const iceMat = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0xffffff, shininess: 120, emissive: 0x3a7aa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.82, flatShading: true });
    this.ice = instanced(CRYSTAL, iceMat, MAX_ICE, 22);
    iceMat.depthTest = true;
    const soft = new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = instanced(new THREE.PlaneGeometry(1, 1), soft, MAX_GLOW, 26);
    this.streaks = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: STREAK, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX_GLOW, 26);
    this.group.add(this.links, this.stakes, this.ice, this.glow, this.streaks);
  }

  /** Shots this draws itself (the shot art and the plain bolts leave them be). */
  static owns(s: Shot) {
    return !!s.src && OWNED.has(s.src);
  }

  // ── events ─────────────────────────────────────────────────────────────────────────────────

  /** A gun fired. Returns how hard it kicks the ship back, or -1 if it isn't one of ours. */
  shot(e: Extract<LevelEvent, { type: 'shot' }>): number {
    if (!e.src || !OWNED.has(e.src)) return -1;
    const { fx, strokes } = this.h;
    const pan = e.x / HALF_W;
    const x = e.x;
    const z = e.z - 0.4;
    const y = SHOT_Y;
    const dx = Math.sin(e.dir);
    const dz = -Math.cos(e.dir);
    switch (e.src) {
      case 'frost':
        // a cold breath out of the nozzle, no flash
        if (Math.random() < 0.3) fx.add({ x, y, z, vx: dx * 8, vz: dz * 8, size: 0.5, grow: 1.6, life: 0.18, color: ICE_MIST, to: ICE_END, glow: false, carried: true });
        return 0.01;
      case 'wave':
        // the air pushed out of the dish: a ring, a teal bloom, and the view leaning back
        fx.ring(x, y, z - 0.6, 2.2, 0.22, true, 0x5af0d0);
        fx.ring(x, y, z - 0.6, 1.2, 0.14, true, 0xd8fff4);
        fx.add({ x, y: y + 0.2, z, size: 2.6, grow: 0.6, life: 0.1, color: TEAL, carried: true });
        this.h.shove(0, 1, 0.25);
        audio.play('shot_wave', { pan, pitch: 0.95 + Math.random() * 0.1 });
        return 0.2;
      case 'saw':
        // a glint off the steel, and sparks off the rack as it spins out
        fx.add({ x, y, z, size: 1.1, grow: 0.3, life: 0.05, color: WHITE, carried: true });
        for (let k = 0; k < 5; k++) {
          const a = e.dir + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6);
          const v = 12 + Math.random() * 12;
          fx.add({ x, y, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, vy: 1 + Math.random() * 2, gravity: 10, size: 0.12, grow: 0.3, life: 0.14 + Math.random() * 0.1, drag: 4, color: SPARK, to: EMBER, carried: true });
        }
        audio.play('shot_saw', { pan, vol: 0.55, pitch: 0.92 + Math.random() * 0.16 });
        return 0.08;
      case 'hive':
        // a little puff of amber where each lets go
        fx.add({ x, y, z, size: 0.6, grow: 0.6, life: 0.06, color: AMBER, carried: true });
        audio.play('shot_hive', { pan, vol: 0.4, pitch: 0.85 + Math.random() * 0.35 });
        return 0.03;
      case 'needle':
        // a hairline of pink off the muzzle, and the air ringing round it
        strokes.slash(x, z, x + dx * 5, z + dz * 5, 0xff8ae0, 0.25, 0.08);
        fx.ring(x, y, z - 0.3, 0.9, 0.1, true, 0xff9ae8);
        fx.add({ x, y, z, size: 0.8, grow: 0.2, life: 0.04, color: WHITE, carried: true });
        audio.play('shot_needle', { pan, vol: 0.45, pitch: 0.95 + Math.random() * 0.1 });
        return 0.05;
      case 'charge': {
        // how full it was: a tap is a crack, a full round is thunder
        const r = Math.min(1, ((e.ripe ?? 1) - 1) / 2);
        fx.add({ x, y, z, size: 2 + 4 * r, grow: 0.4, life: 0.08, color: VIOLET_HOT, carried: true });
        fx.add({ x, y, z: z - 0.6, size: 3 + 5 * r, grow: 1.2, life: 0.16, color: VIOLET, carried: true });
        fx.ring(x, y, z - 1, 2 + 4 * r, 0.2 + 0.1 * r, true, 0xd0b0ff);
        strokes.burst(x, z - 0.5, 4 + Math.round(8 * r), 0xe8d8ff, 3 + 5 * r, 0.14, 0.35 + 0.3 * r, -Math.PI / 2);
        for (let k = 0; k < 2 + 4 * r; k++) this.h.zap(x, z - 1.5 - Math.random() * 2, 0.8 + r * 1.5, 0xc8a8ff);
        this.h.shove(0, 1, 0.3 + 0.9 * r);
        this.h.punch(0.1 + 0.35 * r);
        this.h.shake(0.05 + 0.2 * r);
        audio.play('shot_charge', { pan, vol: 0.45 + 0.55 * r, pitch: 1.3 - 0.45 * r });
        return 0.25 + 0.3 * r;
      }
      case 'anchor':
        // the spike goes with a chunk and a cough of smoke
        fx.add({ x, y, z, size: 1.4, grow: 0.3, life: 0.05, color: HEAT, carried: true });
        fx.add({ x, y, z: z - 0.4, vz: 3, vy: 1, size: 0.8, grow: 2.4, life: 0.45, color: new THREE.Color(0x6a6058), to: new THREE.Color(0x2a2624), glow: false, carried: true });
        this.h.shove(0, 1, 0.5);
        audio.play('shot_anchor', { pan, vol: 0.7 });
        return 0.35;
      case 'bumper':
        // a fat thoomp: a soft orange ring and the ship bucking back
        fx.add({ x, y, z, size: 2.4, grow: 0.5, life: 0.07, color: RUBBER, carried: true });
        fx.ring(x, y, z - 0.8, 1.8, 0.16, true, 0xffb070);
        this.h.shove(0, 1, 0.45);
        audio.play('shot_bumper', { pan, vol: 0.7, pitch: 0.95 + Math.random() * 0.1 });
        return 0.3;
    }
    return -1;
  }

  /** A hit by one of ours: what it looks like going in. */
  hit(e: Extract<LevelEvent, { type: 'hit' }>, en: Enemy | undefined): HitLook {
    if (e.src === 'torch' && !e.dot && !e.kill) return this.licked(e, en);
    if (!e.src || !OWNED.has(e.src) || e.dot) return undefined;
    const { fx, strokes } = this.h;
    const pan = e.x / HALF_W;
    const r = en?.r ?? 1;
    const x = e.x;
    const z = e.z + r * 0.3;
    const y = FLIGHT_Y + 0.8;
    switch (e.src) {
      case 'frost':
        // soaking in: a puff of cold and a glint of ice; it barely hurts, so it barely shows
        if (Math.random() < 0.5) fx.add({ x: x + (Math.random() - 0.5) * r, y, z, vy: 0.5, size: 0.8 + r * 0.3, grow: 1.8, life: 0.3, color: ICE_MIST, to: ICE_END, glow: false, carried: true });
        if (Math.random() < 0.4) fx.add({ x: x + (Math.random() - 0.5) * r * 1.4, y: y + 0.3, z: z + (Math.random() - 0.5) * r, size: 0.3, grow: 0.2, life: 0.12, color: ICE, carried: true });
        if (Math.random() < 0.3) audio.play('frost_hit', { pan, vol: 0.5, pitch: 0.9 + Math.random() * 0.3 });
        return e.kill ? undefined : 'own';
      case 'wave':
        // it rolls through them: a ripple round each, thrown on up the screen
        fx.ring(x, y, z, 2.2 + r, 0.2, true, 0x7af0d8);
        strokes.burst(x, z, 3, 0x9afff0, 2 + r, 0.14, 0.3, -Math.PI / 2);
        this.h.shiver(e.enemy, 0.5);
        audio.play('wave_hit', { pan, vol: 0.5 });
        return e.kill ? undefined : 'own';
      case 'saw': {
        // the teeth biting: a fan of sparks thrown off sideways, chips of hull
        const side = Math.random() < 0.5 ? -1 : 1;
        for (let k = 0; k < 10; k++) {
          const a = (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2;
          const v = 14 + Math.random() * 16;
          fx.add({ x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.6 - 3, vy: 1 + Math.random() * 4, gravity: 18, size: 0.12 + Math.random() * 0.06, grow: 0.3, life: 0.2 + Math.random() * 0.2, drag: 2.5, color: SPARK, to: EMBER, carried: true });
        }
        audio.play('saw_grind', { pan, vol: 0.5, pitch: 0.9 + Math.random() * 0.2 });
        return 'quiet';
      }
      case 'hive':
        // a sting: a tiny amber splash
        fx.add({ x, y, z, size: 0.8, grow: 0.4, life: 0.06, color: AMBER, carried: true });
        fx.sparks(x, y, z, 3, 0xffd060, 8, 0.12, 0.12);
        audio.play('hive_hit', { pan, vol: 0.4, pitch: 0.9 + Math.random() * 0.3 });
        return e.kill ? undefined : 'own';
      case 'needle':
        // in and out the far side: a pink line through it, a star where it went in, a puff out the back
        strokes.slash(x, z + r * 0.4, x, z - r - 4.5, 0xff7ad8, 0.3, 0.14);
        strokes.star(x, z, 1.4 + r * 0.4, 0xffc0f0, 0.14);
        fx.add({ x, y, z: z - r - 0.5, vz: -10, size: 0.6, grow: 1.5, life: 0.16, color: PINK, carried: true });
        fx.add({ x, y, z, size: 1, grow: 0.3, life: 0.04, color: WHITE, carried: true });
        audio.play('needle_hit', { pan, vol: 0.55 });
        return e.kill ? undefined : 'own';
      case 'charge': {
        // it draws the air in, then lets go: violet sucked to a point, a ring and a burst
        const big = Math.min(1, e.dmg / 60);
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2;
          const d = 2.5 + big * 2;
          fx.add({ x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d, vx: -Math.cos(a) * d * 9, vz: -Math.sin(a) * d * 9, size: 0.3, grow: 0.2, life: 0.1, color: VIOLET_HOT, carried: true });
        }
        fx.add({ x, y, z, size: 3 + 4 * big, grow: 1.4, life: 0.14, color: VIOLET, carried: true });
        fx.ring(x, y, z, 3 + 4 * big, 0.28, true, 0xc8a8ff);
        strokes.burst(x, z, 8 + Math.round(6 * big), 0xe0d0ff, 4 + 4 * big, 0.2, 0.4);
        for (let k = 0; k < 3; k++) this.h.zap(x, z, r + 1.5 * big, 0xc8a8ff);
        this.h.punch(0.15 + 0.25 * big);
        if (big > 0.6) this.h.impact(0xe8d8ff, 0.04);
        audio.play('charge_hit', { pan, vol: 0.6 + 0.4 * big, pitch: 1.15 - 0.3 * big });
        return 'quiet';
      }
      case 'anchor':
        // iron into it: a clank, sparks, a ring of grit
        fx.sparks(x, y, z, 10, 0xffc080, 16, 0.2, 0.16);
        strokes.star(x, z, 2 + r * 0.5, 0xffe0b0, 0.16);
        audio.play('anchor_pin', { pan, vol: 0.7 });
        return 'quiet';
      case 'bumper':
        // a bonk: a squashed ring, speed lines up the screen
        fx.add({ x, y, z, size: 2.6, grow: 0.3, life: 0.06, color: RUBBER, carried: true });
        fx.ring(x, y, z, 2.6 + r, 0.18, true, 0xffa060);
        strokes.burst(x, z, 6, 0xffd0a0, 3 + r * 1.5, 0.18, 0.35, -Math.PI / 2);
        this.h.punch(0.12);
        audio.play('bonk', { pan, vol: 0.7, pitch: 0.9 + Math.random() * 0.2 });
        return 'quiet';
    }
    return undefined;
  }

  /** The rest of what happens to our rounds and to what they leave (true: taken care of). */
  event(e: LevelEvent): boolean {
    const { fx, strokes } = this.h;
    switch (e.type) {
      case 'shotLand':
        if (e.src !== 'saw' || !e.bounce) return false;
        // a blade off the screen's edge: a ting and a shower of sparks back into the field
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 10 + Math.random() * 14;
          fx.add({ x: e.x, y: SHOT_Y, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 3, gravity: 16, size: 0.13, grow: 0.3, life: 0.2 + Math.random() * 0.2, drag: 3, color: SPARK, to: EMBER, carried: true });
        }
        fx.add({ x: e.x, y: SHOT_Y, z: e.z, size: 1.6, grow: 0.3, life: 0.05, color: WHITE, carried: true });
        strokes.star(e.x, e.z, 1.8, 0xffffff, 0.12);
        audio.play('saw_ting', { pan: e.x / HALF_W, vol: 0.5, pitch: 0.9 + Math.random() * 0.25 });
        return true;
      case 'freeze':
        this.frozeAt.set(e.enemy, this.time);
        return false;
      case 'thaw': {
        // the ice falls off it in pieces
        this.frozeAt.delete(e.enemy);
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 3 + Math.random() * 5;
          fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.6, vy: 2 + Math.random() * 3, size: 0.16 + Math.random() * 0.16, life: 1 + Math.random() * 0.5, color: Math.random() < 0.5 ? ICE : ICE_DEEP, solid: true, gravity: 24, spin: 10 });
        }
        return false;
      }
      case 'pin': {
        // the chain goes taut down to a stake driven into the ground below it
        this.pinned.set(e.enemy, this.time);
        const gy = fx.ground(e.x, e.z);
        for (let k = 0; k < 8; k++) {
          const a = Math.random() * Math.PI * 2;
          fx.add({ x: e.x, y: gy + 0.3, z: e.z, vx: Math.cos(a) * 4, vz: Math.sin(a) * 3, vy: 1.5, size: 0.8, grow: 2.2, life: 0.6, color: DUST, to: DUST_END, glow: false });
        }
        this.h.shiver(e.enemy, 1);
        return false;
      }
      case 'thud':
        // flung into something: a starburst, and a bonk on top of the crash
        strokes.star(e.x, e.z, 3.2, 0xffe0b0, 0.2);
        strokes.burst(e.x, e.z, 10, 0xffd0a0, 5, 0.2, 0.4);
        this.h.shake(0.15);
        audio.play('bonk', { pan: e.x / HALF_W, vol: 0.8, pitch: 0.7 });
        return false;
    }
    return false;
  }

  // ── every frame ────────────────────────────────────────────────────────────────────────────

  /**
   * A plasma torch at work: a roaring cone, white-hot at the nozzle, gold through its body and red
   * at its ragged tips, with sooty smoke rolling off the end and embers thrown on past it. It's
   * drawn as far as it reaches.
   */
  flame(p: Player, g: Gun) {
    const { fx } = this.h;
    const x = p.x + g.x;
    const z = p.z + g.z;
    const sp = g.spec;
    const reach = sp.speed * sp.life;
    // (with drag 1 a particle goes v·(1 − e^−life); this speed carries it to the flame's reach)
    const v0 = reach / (1 - Math.exp(-sp.life));
    const red = sp.tint !== undefined ? new THREE.Color(sp.tint) : FLAME_RED;
    // the core: narrow, white-hot, burning down to gold
    {
      const a = g.dir + (Math.random() - 0.5) * sp.spread * 0.35;
      const v = v0 * (0.8 + Math.random() * 0.25);
      fx.add({ x, y: FLIGHT_Y + 0.6, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, size: 0.35, grow: 2.6, life: sp.life * 0.5, drag: 1, color: FLAME_HOT, to: FLAME, carried: true });
    }
    // the body: wide licks of gold burning out red, swelling as they go
    for (let n = 0; n < 3; n++) {
      const a = g.dir + (Math.random() - 0.5) * sp.spread * 1.1;
      const v = v0 * (0.75 + Math.random() * 0.35);
      fx.add({ x, y: FLIGHT_Y + 0.5, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, vy: Math.random() * 1.5, size: 0.5, grow: 5, life: sp.life * (0.85 + Math.random() * 0.2), drag: 1, color: FLAME, to: red, carried: true });
    }
    // the nozzle: a white flicker
    fx.add({ x, y: FLIGHT_Y + 0.7, z: z - 0.5, size: 0.9 + Math.random() * 0.5, grow: 0.6, life: 0.04, color: FLAME_HOT, carried: true });
    // soot rolling off the tips
    if (Math.random() < 0.45) {
      const a = g.dir + (Math.random() - 0.5) * sp.spread;
      const d = reach * (0.7 + Math.random() * 0.2);
      fx.add({ x: x + Math.sin(a) * d, y: FLIGHT_Y + 0.9, z: z - Math.cos(a) * d, vx: Math.sin(a) * 6, vz: -Math.cos(a) * 6, vy: 2.5, size: 0.9, grow: 2.6, life: 0.5, drag: 2, color: FLAME_SMOKE, to: FLAME_SMOKE_END, glow: false, carried: true });
    }
    // embers thrown on past the flame
    if (Math.random() < 0.6) {
      const a = g.dir + (Math.random() - 0.5) * sp.spread * 1.4;
      const v = v0 * (1 + Math.random() * 0.4);
      fx.add({ x, y: FLIGHT_Y + 0.8, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, vy: 1 + Math.random() * 2, size: 0.14, grow: 0.3, life: sp.life * 1.3, drag: 1.2, color: SPARK, to: EMBER, carried: true });
    }
  }

  /** The torch on a hull: the flame splashes over it and licks on round its sides, the plating glowing. */
  private licked(e: Extract<LevelEvent, { type: 'hit' }>, en: Enemy | undefined): HitLook {
    const { fx } = this.h;
    const r = en?.r ?? 1;
    const y = FLIGHT_Y + 0.8;
    // a hot spot where it plays on the plating
    fx.add({ x: e.x + (Math.random() - 0.5) * r * 0.8, y: y + 0.2, z: e.z + r * 0.4, size: 0.6 + r * 0.4, grow: 0.8, life: 0.06, color: FLAME_HOT, carried: true });
    // the flame parting round it, on up past both its sides
    if (Math.random() < 0.6) {
      const side = Math.random() < 0.5 ? -1 : 1;
      fx.add({ x: e.x + side * r * 0.6, y, z: e.z + r * 0.2, vx: side * (4 + Math.random() * 5), vz: -8 - Math.random() * 6, vy: 1.5, size: 0.5 + r * 0.2, grow: 3, life: 0.22, drag: 3, color: FLAME, to: FLAME_RED, carried: true });
    }
    if (Math.random() < 0.15) audio.play('mark_burn', { pan: e.x / HALF_W, vol: 0.14, pitch: 1.3 + Math.random() * 0.4 });
    return 'own';
  }

  /** A frost sprayer at work: pale cold mist, ice glinting in it. */
  spray(p: Player, g: Gun) {
    const { fx } = this.h;
    const x = p.x + g.x;
    const z = p.z + g.z;
    for (let n = 0; n < 3; n++) {
      const a = g.dir + (Math.random() - 0.5) * (g.spec.spread + 0.1);
      const v = (g.spec.speed ?? 28) * (0.75 + Math.random() * 0.4);
      // the mist: it covers (it's not fire, it's weather), swelling and slowing
      fx.add({ x, y: FLIGHT_Y + 0.5, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, vy: (Math.random() - 0.5) * 2, size: 0.35, grow: 4.5, life: 0.5, drag: 3.2, color: ICE_MIST, to: ICE_END, glow: false, carried: true });
    }
    // a bright cold core out of the nozzle
    fx.add({ x, y: FLIGHT_Y + 0.6, z: z - 0.4, size: 0.8, grow: 0.6, life: 0.05, color: ICE, carried: true });
    // glints of ice in it, twinkling as they go
    if (Math.random() < 0.8) {
      const a = g.dir + (Math.random() - 0.5) * g.spec.spread;
      const v = 18 + Math.random() * 16;
      fx.add({ x, y: FLIGHT_Y + 0.8, z, vx: Math.sin(a) * v, vz: -Math.cos(a) * v, size: 0.16 + Math.random() * 0.1, grow: 0.4, life: 0.45, drag: 2.5, color: WHITE, carried: true });
    }
  }

  update(time: number, lv: Level, cam: THREE.Quaternion) {
    this.time = time;
    this.cam.copy(cam);
    for (const k in this.m) this.m[k as MeshKey].count = 0;
    this.links.count = this.stakes.count = this.ice.count = this.glow.count = this.streaks.count = 0;
    for (const s of lv.shots) {
      if (s.dead) continue;
      if (GunLooks.owns(s)) this.drawShot(s, lv, time);
      // a round fed coolant (a Cryo Feed touching its gun): frost smoking off it
      else if (s.ax?.chill && Math.random() < 0.35) this.h.fx.add({ x: s.x, y: SHOT_Y, z: s.z, vy: 0.3, size: 0.3, grow: 1.6, life: 0.22, color: ICE_MIST, to: ICE_END, glow: false, carried: true });
    }
    lv.players.forEach((p, i) => this.charges(p, i, lv));
    this.states(lv);
    for (const mesh of [...Object.values(this.m), this.links, this.stakes, this.ice, this.glow, this.streaks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** The body of an enemy under the arsenal: icy as it chills, frozen still, tumbling when flung. */
  body(inst: Instance | null, obj: THREE.Object3D, e: Enemy, dt: number, flashing: boolean) {
    const a = e.ax;
    if (!a) return;
    if (inst && !flashing) {
      if (a.frozen > 0) {
        // ice over all of it, glinting harder as it's about to crack off
        const flick = a.frozen < 0.4 ? 0.25 * (Math.floor(this.time * 20) % 2) : 0;
        for (const m of inst.mats) {
          m.emissive.setHex(0x9adcff);
          m.emissiveIntensity = 0.5 + flick;
        }
      } else if (a.chill > 0)
        for (const m of inst.mats) {
          m.emissive.setHex(0x5ab0f0);
          m.emissiveIntensity = 0.07 * a.chill;
        }
    }
    if (a.flung > 0) {
      // sent tumbling, end over end
      const t = (this.tumble.get(e.id) ?? 0) + dt * 22;
      this.tumble.set(e.id, t);
      obj.rotation.y += t;
      obj.rotation.x = Math.sin(t * 0.5) * 0.5;
      const sp = Math.hypot(e.kx ?? 0, e.kz ?? 0);
      if (sp > 6 && Math.random() < 0.5) {
        const ux = (e.kx ?? 0) / sp;
        const uz = (e.kz ?? 0) / sp;
        const off = (Math.random() - 0.5) * e.r * 1.6;
        const bx = e.x - ux * e.r + uz * off;
        const bz = e.z - uz * e.r - ux * off;
        this.h.strokes.slash(bx - ux * 4, bz - uz * 4, bx, bz, 0xfff0d8, 0.18, 0.12);
      }
    } else if (this.tumble.has(e.id)) this.tumble.delete(e.id);
    if (a.pin > 0) {
      // straining against the chain
      obj.position.x += Math.sin(this.time * 47) * 0.06;
      obj.rotation.z += Math.sin(this.time * 31) * 0.05;
    }
  }

  // ── drawing ────────────────────────────────────────────────────────────────────────────────

  private put(mesh: THREE.InstancedMesh, x: number, y: number, z: number, q: THREE.Quaternion, sx: number, sy: number, sz: number, col: THREE.Color, max = MAX) {
    const n = mesh.count;
    if (n >= max) return;
    this.mm.compose(this.v.set(x, y, z), q, this.s.set(sx, sy, sz));
    mesh.setMatrixAt(n, this.mm);
    mesh.setColorAt(n, col);
    mesh.count++;
  }

  /** A soft light facing the camera at a flight-plane point, `len` along the heading, `wid` across. */
  private sprite(x: number, z: number, wid: number, len: number, col: THREE.Color, heading: number, into = this.glow, y = SHOT_Y) {
    if (into.count >= MAX_GLOW) return;
    this.q2.copy(this.cam).multiply(this.q.setFromAxisAngle(Z, Math.atan2(-Math.sin(heading), -Math.cos(heading) * COS_TILT)));
    this.mm.compose(this.v.set(x, y, fromFlight(z, y)), this.q2, this.s.set(wid, len, 1));
    into.setMatrixAt(into.count, this.mm);
    into.setColorAt(into.count, col);
    into.count++;
  }

  private drawShot(s: Shot, lv: Level, time: number) {
    let seed = this.seeds.get(s);
    if (seed === undefined) this.seeds.set(s, (seed = Math.random()));
    const sp = Math.hypot(s.vx, s.vz);
    const heading = sp > 0.01 ? Math.atan2(s.vx, s.vz) : seed * 6.28;
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    const y = SHOT_Y;
    const wz = fromFlight(s.z, y);
    const size = s.ax?.size ?? 1;
    const fade = Math.min(1, (s.life - s.t) / 0.08 + 0.2);
    const punch = Math.max(0, 1 - s.t / 0.06);
    const came = sp * s.t;
    const c = this.c;
    const q = new THREE.Quaternion().setFromAxisAngle(Y, heading);
    switch (s.src) {
      case 'wave': {
        // the crescent swells as it rolls out, and ripples
        const grow = (0.75 + 0.5 * Math.min(1, s.t / s.life)) * size * 0.62;
        const wob = 1 + 0.06 * Math.sin(time * 30 + seed * 9);
        this.put(this.m.wave, s.x, y, wz, q, grow * wob, 1, grow, c.copy(TEAL).multiplyScalar(1.1 * fade));
        this.put(this.m.waveRim, s.x, y, wz, q, grow * 1.02, 1, grow, c.copy(TEAL).lerp(WHITE, 0.6).multiplyScalar(2.2 * fade));
        // a fainter echo behind
        for (let k = 1; k <= 2; k++) {
          const back = k * 1.3;
          if (came < back) break;
          this.put(this.m.waveRim, s.x - dx * back, y, fromFlight(s.z - dz * back, y), q, grow * (1 - 0.12 * k), 1, grow * (1 - 0.12 * k), c.copy(TEAL).multiplyScalar((0.9 - 0.35 * k) * fade));
        }
        if (Math.random() < 0.3) this.h.fx.add({ x: s.x + (Math.random() - 0.5) * grow * 2.4, y, z: s.z, size: 0.25, grow: 0.3, life: 0.2, color: c.copy(TEAL).lerp(WHITE, 0.5), carried: true });
        break;
      }
      case 'saw': {
        // spinning flat, a blur of its rim, a hot hub; sparks shed off the teeth
        const r = 0.8 * size;
        const spin = new THREE.Quaternion().setFromAxisAngle(Y, seed * 6 + s.t * 40);
        this.put(this.m.blade, s.x, y, wz, spin, r, r, r, c.copy(STEEL).multiplyScalar(0.55));
        this.put(this.m.hub, s.x, y + 0.05, wz, spin, r, r, r, c.copy(SPARK).multiplyScalar(1.6));
        this.sprite(s.x, s.z, r * 3, r * 3, c.copy(STEEL).multiplyScalar(0.18 * fade), heading);
        if (came > 0.5) this.sprite(s.x - dx * 1.2, s.z - dz * 1.2, r * 1.2, Math.min(3, came), c.copy(STEEL).multiplyScalar(0.4 * fade), heading, this.streaks);
        if (Math.random() < 0.25) {
          const a = Math.random() * Math.PI * 2;
          this.h.fx.add({ x: s.x + Math.cos(a) * r, y, z: s.z + Math.sin(a) * r, vx: -Math.sin(a) * 12, vz: Math.cos(a) * 12, size: 0.1, grow: 0.3, life: 0.12, drag: 4, color: SPARK, carried: true });
        }
        break;
      }
      case 'hive': {
        // a dart weaving on its way (drawn off its line a little, side to side), wings blurring
        const w = Math.sin(time * 26 + seed * 40) * 0.28;
        const x = s.x + dz * w;
        const z = s.z - dx * w;
        const roll = new THREE.Quaternion().copy(q).multiply(this.q2.setFromAxisAngle(Z, Math.sin(time * 26 + seed * 40) * 0.6));
        this.put(this.m.dart, x, y, fromFlight(z, y), roll, 1.5, 1.5, 1.5, c.copy(AMBER).multiplyScalar(1.6));
        const flap = 0.6 + 0.4 * Math.abs(Math.sin(time * 90 + seed * 30));
        this.put(this.m.wings, x, y + 0.08, fromFlight(z, y), roll, flap * 1.5, 1.5, 1.5, c.copy(AMBER).lerp(WHITE, 0.4).multiplyScalar(0.9 * fade));
        this.sprite(x, z, 1.6, 1.6, c.copy(AMBER).multiplyScalar(0.55 * fade), heading);
        // a dotted trail of where it's been
        if (Math.random() < 0.4) this.h.fx.add({ x, y, z, size: 0.14, grow: 0.2, life: 0.25, color: c.copy(AMBER).multiplyScalar(0.8), carried: true });
        break;
      }
      case 'needle': {
        // a hairline of pink light, ghosts of it trailing, and a shimmer split cyan and pink
        this.put(this.m.needle, s.x, y, wz, q, 0.06, 0.06, 1.3, c.copy(WHITE).lerp(PINK, 0.25).multiplyScalar(4 * fade));
        this.put(this.m.sheath, s.x, y, wz, q, 0.16, 0.16, 1.7, c.copy(PINK).multiplyScalar(0.8 * fade));
        this.sprite(s.x, s.z, 1.1, 1.1, c.copy(PINK).multiplyScalar((0.4 + punch) * fade), heading);
        for (let k = 1; k <= 5; k++) {
          const back = k * 1.6;
          if (came < back) break;
          const f = 1 - k / 6;
          const jit = Math.sin(time * 70 + k * 2.1 + seed * 9) * 0.12;
          this.sprite(s.x - dx * back + dz * jit, s.z - dz * back - dx * jit, 0.22 * f + 0.06, 1.4, c.copy(PINK).multiplyScalar(0.7 * f * fade), heading, this.streaks);
        }
        // the split: a cyan ghost one side, pink the other
        if (came > 1) {
          this.sprite(s.x + dz * 0.12, s.z - dx * 0.12 - dz * 1.2, 0.14, 2.4, c.copy(CYAN).multiplyScalar(0.6 * fade), heading, this.streaks);
          this.sprite(s.x - dz * 0.12, s.z + dx * 0.12 - dz * 1.2, 0.14, 2.4, c.copy(PINK).multiplyScalar(0.6 * fade), heading, this.streaks);
        }
        break;
      }
      case 'charge': {
        // a ball of violet, as big as it was ripe, lightning crawling on it
        const r = 0.45 * size;
        const pulse = 1 + 0.12 * Math.sin(time * 50 + seed * 7);
        this.put(this.m.orb, s.x, y, wz, q, r * 0.55, r * 0.55, r * 0.7, c.copy(VIOLET_HOT).multiplyScalar(3.2 * fade));
        this.put(this.m.orbShell, s.x, y, wz, q, r * pulse, r * pulse, r * 1.2 * pulse, c.copy(VIOLET).multiplyScalar(0.9 * fade));
        this.sprite(s.x, s.z, r * 5, r * 5, c.copy(VIOLET).multiplyScalar(0.5 * fade), heading);
        this.sprite(s.x - dx * r * 3, s.z - dz * r * 3, r * 2, Math.min(r * 14, came + 0.5), c.copy(VIOLET).lerp(WHITE, 0.3).multiplyScalar(0.9 * fade), heading, this.streaks);
        if (Math.random() < 0.15 + 0.2 * (size - 1)) this.h.zap(s.x, s.z, r * 1.6, 0xd0b8ff);
        break;
      }
      case 'anchor': {
        // the spike, its tip glowing with the heat of the throw, and its chain back to the gun
        this.put(this.m.spike, s.x, y, wz, q, 1.3, 1.3, 1.3, c.copy(IRON).lerp(RUST, 0.5).multiplyScalar(2));
        this.put(this.m.spikeTip, s.x + dx * 1.3, y, fromFlight(s.z + dz * 1.3, y), q, 0.2, 0.2, 0.4, c.copy(HEAT).multiplyScalar(2.6 * fade));
        this.sprite(s.x - dx * 1.5, s.z - dz * 1.5, 0.5, Math.min(5, came), c.copy(HEAT).multiplyScalar(0.35 * fade), heading, this.streaks);
        const p = lv.players[s.owner];
        const g = p?.stats.guns.find((o) => o.part.id === 'anchor');
        if (p && g) this.chain(p.x + g.x, SHOT_Y, p.z + g.z, s.x - dx * 0.8, y, s.z - dz * 0.8, 0, true);
        break;
      }
      case 'bumper': {
        // a fat rubber ball, squashing along the way it's going and wobbling back
        const r = 0.42 * size;
        const sq = 1 + 0.18 * Math.sin(s.t * 26 + seed * 5) + 0.35 * punch;
        const roll = new THREE.Quaternion().copy(q).multiply(this.q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.t * 12));
        this.put(this.m.ball, s.x, y, wz, q, r * sq, r / Math.sqrt(sq), r / sq, c.copy(RUBBER).multiplyScalar(1.4));
        this.put(this.m.band, s.x, y, wz, roll, r * sq * 1.01, r * 1.01, r * 1.01, c.copy(RUBBER_BAND));
        this.sprite(s.x, s.z, r * 3.4, r * 3.4, c.copy(RUBBER).multiplyScalar(0.35 * fade), heading);
        if (came > 0.6) this.sprite(s.x - dx * r * 2, s.z - dz * r * 2, r * 1.6, Math.min(4, came), c.copy(RUBBER).multiplyScalar(0.45 * fade), heading, this.streaks);
        break;
      }
    }
  }

  /** A chain of links from one point to another, `jitter` for a strained shake, sagging if slack. */
  private chain(x0: number, y0: number, z0f: number, x1: number, y1: number, z1f: number, jitter: number, flight: boolean) {
    const z0 = flight ? fromFlight(z0f, y0) : z0f;
    const z1 = flight ? fromFlight(z1f, y1) : z1f;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.3) return;
    const n = Math.min(80, Math.floor(len / 0.42));
    this.v2.set(dx, dy, dz).normalize();
    const along = new THREE.Quaternion().setFromUnitVectors(Z, this.v2);
    const twist = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2);
    const qa = along.clone();
    const qb = along.clone().multiply(twist);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const j = jitter * Math.sin(this.time * 60 + k * 1.7);
      this.put(this.links, x0 + dx * f + j, y0 + dy * f, z0 + dz * f, k % 2 ? qb : qa, 1, 1, 1, this.c.copy(IRON).lerp(RUST, (k * 0.37) % 1 * 0.6).multiplyScalar(2.4), MAX_LINKS);
    }
  }

  /** The charge cannons ripening at their muzzles: a ball of violet growing, motes drawn into it, a hum. */
  private charges(p: Player, i: number, lv: Level) {
    let most = 0;
    for (const g of p.stats.guns) {
      if (!g.spec.ripen) continue;
      const r = p.down ? 0 : ripened(lv, g, g.spec);
      most = Math.max(most, r);
      const x = p.x + g.x;
      const z = p.z + g.z - 0.6;
      const full = r >= 1;
      if (full && !this.full.get(g)) {
        this.h.fx.ring(x, SHOT_Y, z, 2.4, 0.2, true, 0xe0d0ff);
        audio.play('charge_ready', { pan: x / HALF_W, vol: 0.5 });
      }
      this.full.set(g, full);
      if (r <= 0.05) continue;
      const pulse = full ? 1 + 0.2 * Math.sin(this.time * 18) : 1;
      this.sprite(x, z, (0.5 + 1.6 * r) * pulse, (0.5 + 1.6 * r) * pulse, this.c.copy(VIOLET).multiplyScalar(0.25 + 0.6 * r), 0);
      this.sprite(x, z, 0.3 + 0.5 * r, 0.3 + 0.5 * r, this.c.copy(VIOLET_HOT).multiplyScalar(0.5 + 1.2 * r), 0);
      // the air drawn in to it
      if (Math.random() < 0.2 + 0.6 * r) {
        const a = Math.random() * Math.PI * 2;
        const d = 1.8 + Math.random() * 1.4;
        const life = 0.22;
        this.h.fx.add({ x: x + Math.cos(a) * d, y: SHOT_Y, z: z + Math.sin(a) * d, vx: (-Math.cos(a) * d) / life, vz: (-Math.sin(a) * d) / life, size: 0.12 + 0.1 * r, grow: 0.4, life, color: this.c.copy(VIOLET).lerp(WHITE, 0.4), carried: true });
      }
      if (full && Math.random() < 0.08) this.h.zap(x, z, 0.9, 0xd0b8ff);
    }
    audio.loop('charge', `p${i}`, most > 0.05 && !p.down, most);
  }

  /** The ice on the frozen, the chains on the pinned. */
  private states(lv: Level) {
    const alive = new Set<number>();
    for (const e of lv.enemies) {
      const a = e.ax;
      if (!a || e.dead || e.t < 0) continue;
      alive.add(e.id);
      const gz = e.ground ? fromFlight(e.z, e.y) : e.z;
      if (a.frozen > 0) {
        // crystals grown out of it, all ways, shooting out the moment it freezes
        const since = this.time - (this.frozeAt.get(e.id) ?? this.time - 1);
        const grow = Math.min(1, since / 0.12);
        const n = Math.min(14, 6 + Math.round(e.r * 3));
        for (let k = 0; k < n; k++) {
          const h1 = Math.sin(e.id * 12.9898 + k * 78.233) * 43758.5453;
          const h2 = Math.sin(e.id * 39.346 + k * 11.135) * 24634.6345;
          const u = h1 - Math.floor(h1);
          const w = h2 - Math.floor(h2);
          const az = (k / n) * Math.PI * 2 + u * 0.8;
          const el = 0.15 + w * 1.1;
          this.v2.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
          this.q.setFromUnitVectors(Y, this.v2);
          const len = e.r * (0.55 + u * 0.7) * grow;
          const at = e.r * 0.35;
          this.put(this.ice, e.x + this.v2.x * at, e.y + 0.3 + this.v2.y * at * 0.6, gz + this.v2.z * at, this.q, len * 0.9, len, len * 0.9, this.c.setHex(k % 3 ? 0xe8faff : 0xa8dcff), MAX_ICE);
        }
        // the cold light under it
        if (this.glow.count < MAX_GLOW) this.sprite(e.x, gz, e.r * 3.2, e.r * 3.2, this.c.copy(ICE_DEEP).multiplyScalar(0.35), 0, this.glow, e.y + 0.3);
      }
      const pinned = this.pinned.has(e.id);
      if (a.pin > 0 && pinned) {
        // the chain from it straight down to its stake in the ground, taut and shaking
        const gy = this.h.fx.ground(e.x, gz);
        this.put(this.stakes, e.x, gy + 0.5, gz, this.q.identity(), 1, 1, 1, this.c.copy(IRON), 40);
        this.chain(e.x, e.y + 0.1, gz, e.x, gy + 1.2, gz, 0.05, false);
      } else if (pinned) {
        // it's let go: the chain snaps, links everywhere
        this.pinned.delete(e.id);
        this.snap(e, gz);
      }
    }
    for (const id of [...this.pinned.keys()]) if (!alive.has(id)) this.pinned.delete(id);
    for (const id of [...this.frozeAt.keys()]) if (!alive.has(id)) this.frozeAt.delete(id);
  }

  private snap(e: Enemy, gz: number) {
    const { fx } = this.h;
    const gy = fx.ground(e.x, gz);
    for (let k = 0; k < 10; k++) {
      const f = k / 10;
      const a = Math.random() * Math.PI * 2;
      const v = 4 + Math.random() * 6;
      fx.add({ x: e.x, y: e.y + (gy - e.y) * f, z: gz, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 4, size: 0.16, life: 1.2, color: IRON, solid: true, gravity: 24, spin: 14 });
    }
    audio.play('chain_snap', { pan: e.x / HALF_W, vol: 0.6 });
  }
}
