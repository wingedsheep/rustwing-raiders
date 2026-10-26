import * as THREE from 'three';
import { uploadInstances } from '../render/instances';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Shot } from '../sim/level';
import { graftShotColor } from './grafts-view';
import { GunLooks } from './gun-looks';
import { FLIGHT_Y, TILT, fromFlight } from '../sim/types';
import { FINS, FLAME, FLAME_CORE, HULL, NOZZLE, OCTA, SOFT, SPHERE, STREAK, instanced, lathe, material, place, type Stuff } from './bullets';

/**
 * The players' fire, made of the same stuff as the enemies' (see bullets.ts) but in the ships'
 * own warm light: rounds that are hot metal, not coloured bars. What burns is unlit and brighter
 * than white so it blooms; round it, soft light that adds (a glow, a tracer streak, a wake).
 *
 *  - slug:    a white-hot round in a brass-coloured glow, a long tracer streak behind it.
 *  - pellet:  a hot spark of shot, a short streak.
 *  - rail:    a needle of white light in a sheath, a long ionised wake twisting behind it.
 *  - missile: a little rocket, gunmetal and the livery's colour, its motor lit.
 *  - flak:    a brass shell turning end over end, its fuze band glowing.
 *  - mine:    a squat iron limpet, its lamp blinking faster as it ripens.
 *
 * Sizes are in world units, +z the way it flies.
 */

const MAX = 1500;
const MAX_GLOW = 4500;

interface Ctx {
  col: THREE.Color;
  age: number;
  life: number;
  seed: number;
  time: number;
}

interface PartDef {
  geo: THREE.BufferGeometry;
  stuff: Stuff;
  at?: THREE.Matrix4;
  color: (x: Ctx, out: THREE.Color) => THREE.Color;
  size?: (x: Ctx) => number;
}

interface ShapeDef {
  parts: PartDef[];
  spin?: [number, 'roll' | 'tumble' | 'yaw'];
  /** A soft light about it: diameter, strength. */
  halo?: [number, number];
  /** Tracer streaks behind it: [length, width, strength, how white] each. */
  trails?: [number, number, number, number][];
  /** A wake that twists behind it (rails): length, beads. */
  helix?: [number, number];
}

const WHITE = new THREE.Color(1, 1, 1);
const HOT = new THREE.Color(1, 0.86, 0.55);
const BRASS = new THREE.Color(0.62, 0.42, 0.16);
const GUNMETAL = new THREE.Color(0.2, 0.2, 0.22);
const IRON = new THREE.Color(0.08, 0.07, 0.07);
const tint = (k: number, white = 0) => (x: Ctx, o: THREE.Color) => o.copy(x.col).lerp(WHITE, white).multiplyScalar(k);
const hot = (k: number) => (_: Ctx, o: THREE.Color) => o.copy(HOT).lerp(WHITE, 0.65).multiplyScalar(k);

// a flak shell: a squat brass case with a rounded nose, along +z
const SHELL = lathe([[0.001, -0.5], [0.3, -0.5], [0.32, -0.42], [0.32, 0.15], [0.26, 0.35], [0.14, 0.5], [0.001, 0.56]]);
const FUZE = new THREE.CylinderGeometry(0.335, 0.335, 0.14, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.02);
// a limpet mine: a flattened dome on a skirt
const LIMPET = lathe([[0.001, -0.16], [0.62, -0.16], [0.6, -0.05], [0.5, 0.12], [0.3, 0.28], [0.001, 0.32]], 10).rotateX(-Math.PI / 2);
const PRONGS = mergeGeometries(
  Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2;
    return new THREE.CylinderGeometry(0.04, 0.06, 0.3, 5).translate(Math.cos(a) * 0.36, 0.3, Math.sin(a) * 0.36);
  }),
);

const KINDS = ['slug', 'pellet', 'rail', 'missile', 'flak', 'mine'] as const;
type Kind = (typeof KINDS)[number];

const SHAPES: Record<Kind, ShapeDef> = {
  slug: {
    parts: [
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0.15, 0.1, 0.1, 0.55), color: hot(3.5) },
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0, 0.17, 0.17, 0.75), color: (x, o) => o.copy(x.col).lerp(HOT, 0.3).multiplyScalar(1.6) },
    ],
    halo: [1.3, 0.3],
    trails: [
      [4.2, 0.36, 0.6, 0],
      [2.6, 0.12, 0.8, 0.75],
    ],
  },
  pellet: {
    parts: [
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0, 0.13, 0.13, 0.22), color: hot(3) },
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0, 0.2, 0.2, 0.32), color: tint(1.8, 0.2) },
    ],
    halo: [1.0, 0.35],
    trails: [[1.6, 0.3, 0.8, 0.2]],
  },
  rail: {
    parts: [
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0, 0.12, 0.12, 2.2), color: hot(4) },
      { geo: OCTA, stuff: 'haze', at: place(0, 0, 0, 0.38, 0.38, 3), color: tint(1.1, 0.1) },
    ],
    spin: [9, 'roll'],
    halo: [3, 0.5],
    trails: [
      [14, 0.9, 0.55, 0],
      [9, 0.25, 0.8, 0.8],
    ],
    helix: [12, 10],
  },
  missile: {
    parts: [
      { geo: HULL, stuff: 'metal', at: place(0, 0, 0, 0.5), color: (_, o) => o.copy(GUNMETAL) },
      { geo: FINS, stuff: 'metal', at: place(0, 0, 0, 0.5), color: (x, o) => o.copy(x.col).multiplyScalar(0.55) },
      { geo: NOZZLE, stuff: 'metal', at: place(0, 0, 0, 0.5), color: (_, o) => o.copy(IRON) },
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0.62, 0.11), color: (x, o) => o.copy(x.col).lerp(WHITE, 0.4).multiplyScalar(2.5) },
      { geo: FLAME_CORE, stuff: 'haze', at: place(0, 0, 0, 0.5), color: hot(2.6), size: (x) => 0.9 + 0.2 * Math.sin(x.time * 61 + x.seed * 11) },
      { geo: FLAME, stuff: 'haze', at: place(0, 0, 0, 0.5), color: (x, o) => o.copy(HOT).lerp(x.col, 0.3).multiplyScalar(1.2), size: (x) => 0.8 + 0.35 * Math.sin(x.time * 47 + x.seed * 7) },
    ],
    spin: [5, 'roll'],
    halo: [1.4, 0.25],
    trails: [[2.4, 0.5, 0.6, 0.3]],
  },
  flak: {
    parts: [
      { geo: SHELL, stuff: 'metal', at: place(0, 0, 0, 1.1), color: (_, o) => o.copy(BRASS) },
      { geo: FUZE, stuff: 'light', at: place(0, 0, 0, 1.1), color: (x, o) => o.copy(x.col).lerp(HOT, 0.4).multiplyScalar(1.6 + 1.6 * x.life * x.life) },
    ],
    spin: [11, 'tumble'],
    halo: [1.8, 0.3],
    trails: [[2, 0.5, 0.45, 0.2]],
  },
  mine: {
    parts: [
      { geo: LIMPET, stuff: 'metal', at: place(0, 0, 0, 1.1), color: (x, o) => o.copy(IRON).lerp(x.col, 0.15) },
      { geo: PRONGS, stuff: 'metal', at: place(0, 0, 0, 1.1), color: (_, o) => o.copy(GUNMETAL) },
      { geo: SPHERE, stuff: 'light', at: place(0, 0.4, 0, 0.22), color: (x, o) => ((x.age * (2 + 10 * x.life * x.life)) % 1 < 0.5 ? o.copy(x.col).lerp(WHITE, 0.4).multiplyScalar(3.2) : o.copy(x.col).multiplyScalar(0.3)) },
    ],
    spin: [1.2, 'yaw'],
    halo: [2.4, 0.3],
  },
};

const COLORS: Record<Kind, number> = {
  slug: 0xffc24a,
  pellet: 0xff9a40,
  // (white-hot cream, not the lattice's cyan)
  rail: 0xfff0d4,
  missile: 0xff7a3a,
  flak: 0xffa040,
  // (rust, not the scrappers' flare red)
  mine: 0xff8a3a,
};

export class ShotArt {
  readonly group = new THREE.Group();
  private meshes = new Map<Kind, THREE.InstancedMesh[]>();
  private glow: THREE.InstancedMesh;
  /** Tracers and exhaust: soft light that tapers to a tail. */
  private streaks: THREE.InstancedMesh;
  private seeds = new WeakMap<Shot, number>();
  private m = new THREE.Matrix4();
  private base = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private c = new THREE.Color();
  private x: Ctx = { col: new THREE.Color(), age: 0, life: 0, seed: 0, time: 0 };

  constructor() {
    const mats = new Map<Stuff, THREE.Material>();
    for (const k of KINDS)
      this.meshes.set(
        k,
        SHAPES[k].parts.map((def) => {
          if (!mats.has(def.stuff)) {
            // light leaves no depth, so the paint doesn't ink a rim round it (that's for what's solid)
            const m = material(def.stuff);
            if (def.stuff === 'light') m.depthWrite = false;
            mats.set(def.stuff, m);
          }
          const mesh = instanced(def.geo, mats.get(def.stuff)!, MAX, def.stuff === 'haze' || def.stuff === 'glass' ? 25 : 24);
          this.group.add(mesh);
          return mesh;
        }),
      );
    const soft = new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.glow = instanced(new THREE.PlaneGeometry(1, 1), soft, MAX_GLOW, 26);
    this.streaks = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: STREAK, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), MAX_GLOW, 26);
    this.group.add(this.glow, this.streaks);
  }

  /** The kinds drawn here; the rest (flame, beams, arcs) are drawn elsewhere. */
  static draws(kind: string): kind is Kind {
    return (KINDS as readonly string[]).includes(kind);
  }

  /** The colour a shot burns, by kind and whose it is (each ship's guns in its own light). */
  static color(s: Shot, accent: number): number {
    if (s.kind === 'slug' || s.kind === 'pellet') return s.owner === 0 ? COLORS[s.kind] : accent;
    return ShotArt.draws(s.kind) ? COLORS[s.kind] : 0xffffff;
  }

  update(time: number, shots: Shot[], cam: THREE.Quaternion, accents: number[]) {
    for (const ms of this.meshes.values()) for (const m of ms) m.count = 0;
    this.glow.count = this.streaks.count = 0;
    const x = this.x;
    x.time = time;
    for (const s of shots) {
      if (s.dead || !ShotArt.draws(s.kind) || GunLooks.owns(s)) continue;
      const sh = SHAPES[s.kind];
      const meshes = this.meshes.get(s.kind)!;
      if (meshes[0].count >= MAX) continue;
      let seed = this.seeds.get(s);
      if (seed === undefined) this.seeds.set(s, (seed = Math.random()));
      x.col.setHex(ShotArt.color(s, accents[s.owner] ?? 0xffffff));
      if (s.tag === 'reflect' || s.tag === 'mirror') x.col.lerp(WHITE, 0.4);
      // a VENGEFUL nova's shrapnel burns orange; a dash-strike's rounds run white-hot
      else if (s.tag === 'nova') x.col.setHex(0xff8a4a);
      // a graft's shots are still yours, with a touch of its faction's light
      else if (s.graft) x.col.lerp(this.c.setHex(graftShotColor(s.graft)!), 0.3);
      // a forge gun's own colour
      if (s.ax?.tint !== undefined && !s.tag && !s.graft) x.col.setHex(s.ax.tint);
      if (s.strike) x.col.lerp(WHITE, 0.5).multiplyScalar(1.3);
      x.age = s.t;
      x.life = Math.min(1, s.t / Math.max(s.life, 0.01));
      x.seed = seed;
      // out of the muzzle it swells, white, and settles
      const punch = Math.max(0, 1 - s.t / 0.06);
      const moving = Math.abs(s.vx) + Math.abs(s.vz) > 0.01;
      const heading = moving ? Math.atan2(s.vx, s.vz) : seed * 6.28;
      // at the end of its life a round fades down rather than winking out
      const fade = s.kind === 'mine' ? 1 : Math.min(1, (s.life - s.t) / 0.06 + 0.25);
      this.q.setFromAxisAngle(Y, heading);
      if (sh.spin) {
        const [rate, how] = sh.spin;
        const a = seed * 6.28 + s.t * rate;
        const axis = how === 'roll' ? Z : how === 'yaw' ? Y : this.axis.set(1, Math.sin(seed * 40) * 0.3, 0).normalize();
        this.q.multiply(this.q2.setFromAxisAngle(axis, a));
      }
      const swell = (1 + 0.6 * punch) * (s.ax?.size ?? 1);
      this.base.compose(this.v.set(s.x, SHOT_Y, fromFlight(s.z, SHOT_Y)), this.q, this.s.set(swell, swell, swell));
      sh.parts.forEach((def, j) => {
        const sz = def.size ? def.size(x) : 1;
        if (sz <= 0) return;
        const mesh = meshes[j];
        this.m.copy(this.base);
        if (def.at) this.m.multiply(def.at);
        if (sz !== 1) this.m.scale(this.s.setScalar(sz));
        mesh.setMatrixAt(mesh.count, this.m);
        mesh.setColorAt(mesh.count, def.color(x, this.c).lerp(WHITE, punch * 0.6).multiplyScalar(def.stuff === 'light' || def.stuff === 'haze' ? fade : 1));
        mesh.count++;
      });

      const dx = Math.sin(heading);
      const dz = Math.cos(heading);
      if (sh.halo) {
        const d = sh.halo[0] * (1 + punch);
        this.sprite(s.x, s.z, d, d, this.c.copy(x.col).multiplyScalar((sh.halo[1] + punch * 0.9) * fade), cam, heading);
      }
      if (moving && sh.trails) {
        // a streak only as long as the way it has come (no tracer reaching back into the gun)
        const came = Math.hypot(s.vx, s.vz) * s.t;
        for (const [len0, wid, str, white] of sh.trails) {
          const len = Math.min(len0, came + 0.4);
          const f = str * fade * (0.85 + 0.15 * Math.sin(time * 43 + seed * 17));
          this.sprite(s.x - dx * len * 0.45, s.z - dz * len * 0.45, wid, len, this.c.copy(x.col).lerp(HOT, 0.3).lerp(WHITE, white).multiplyScalar(f * 1.3), cam, heading, this.streaks);
        }
      }
      if (moving && sh.helix) {
        const [len0, n] = sh.helix;
        const len = Math.min(len0, Math.hypot(s.vx, s.vz) * s.t);
        for (let k = 1; k <= n; k++) {
          const back = (k / n) * len;
          const a = back * 1.3 - time * 30 + seed * 6;
          const w = 0.35 * Math.sin(a);
          const fall = 1 - k / (n + 1);
          this.sprite(s.x - dx * back + dz * w, s.z - dz * back - dx * w, 0.45 * fall + 0.15, 0.6, this.c.copy(x.col).lerp(WHITE, 0.3).multiplyScalar(0.7 * fall * fade), cam, heading);
        }
      }
      if (s.kind === 'missile') {
        // the motor lights the air behind it
        this.sprite(s.x - dx * 1.1, s.z - dz * 1.1, 0.45, 1.9, this.c.copy(HOT).multiplyScalar(1.1), cam, heading, this.streaks);
      }
    }
    for (const ms of this.meshes.values())
      for (const m of ms) uploadInstances(m);
    for (const g of [this.glow, this.streaks]) uploadInstances(g);
  }

  /** A soft light facing the camera, `len` long along the heading as the camera sees it, `wid` across. */
  private sprite(x: number, z: number, wid: number, len: number, color: THREE.Color, cam: THREE.Quaternion, heading: number, into = this.glow) {
    const n = into.count;
    if (n >= MAX_GLOW) return;
    this.q2.copy(cam).multiply(this.q.setFromAxisAngle(Z, Math.atan2(-Math.sin(heading), -Math.cos(heading) * COS_TILT)));
    this.m.compose(this.v.set(x, SHOT_Y, fromFlight(z, SHOT_Y)), this.q2, this.s.set(wid, len, 1));
    into.setMatrixAt(n, this.m);
    into.setColorAt(n, color);
    into.count++;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const COS_TILT = Math.cos(TILT);
/** Shots ride a little over the ships, pushed back so they show where they are on the flight plane. */
const SHOT_Y = FLIGHT_Y + 0.6;
