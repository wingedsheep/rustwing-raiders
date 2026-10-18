/**
 * The land a level flies over: a run of biomes laid end to end along -z, each with its own shape,
 * blended where they meet, and the props scattered over it. All of it is worked out from the seed,
 * on demand, a chunk at a time, so the sim (for what you can hit) and the view (for what you see)
 * agree without either keeping the other's copy.
 */

import type { Biome, TerrainShape } from '../world/planets';
import { FLIGHT_Y, HALF_W } from './types';
import { fbm, noise2, ridged, rng, smooth, smoothstep, weighted, clamp, lerp, type Rng } from '../util';
import { metaOf, variants, height as metaHeight } from './meta';

export const CHUNK = 16;
/** Props are scattered this far either side (the tilted camera on a wide screen sees ~±46, and a margin). */
export const SPREAD = 60;
const BLEND = 36;
/** Scenery keeps under this, so only what's meant to be in the way is. */
const SCENERY_MAX = FLIGHT_Y - 2.5;

export interface Segment {
  biome: Biome;
  /** From z0 (nearer the start) down to z1 (z1 < z0). */
  z0: number;
  z1: number;
}

export interface Placed {
  kind: string;
  variant: number;
  x: number;
  z: number;
  /** Ground (or water) height it stands on. */
  y: number;
  rot: number;
  s: number;
  /** Tall enough to hit. */
  obstacle: boolean;
  /** Collider columns in world space (only for obstacles). */
  cols: { x: number; z: number; r: number }[];
  /** Index of the biome it belongs to. */
  biome: number;
}

export interface Wildlife {
  kind: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  biome: number;
}

/**
 * A race's shortcut: a narrow walled lane off the open field, with a slipstream inside (see
 * Level), so it's quicker if you can thread it. `slot` runs nearly straight and tight; `weave`
 * zigzags through gates. The lane's middle is straight between `pts`; the ship has `half` either
 * side of it before the walls.
 */
export interface Shortcut {
  id: number;
  kind: 'slot' | 'weave';
  /** From the mouth (z0, nearer the start) to the far end (z1 < z0). */
  z0: number;
  z1: number;
  pts: { z: number; x: number }[];
  half: number;
  /** Seconds it's worth at cruising speed (filled in by the level, which knows the speed). */
  saved: number;
}

/** The middle of a shortcut's lane at z. */
export function laneX(sc: Shortcut, z: number) {
  const pts = sc.pts;
  if (z >= pts[0].z) return pts[0].x;
  for (let i = 1; i < pts.length; i++)
    if (z >= pts[i].z) return lerp(pts[i - 1].x, pts[i].x, (z - pts[i - 1].z) / (pts[i].z - pts[i - 1].z));
  return pts[pts.length - 1].x;
}

export interface Chunk {
  index: number;
  props: Placed[];
  wildlife: Wildlife[];
}

/** Props that belong in the water (or right at its edge). */
const WATERBORNE = new Set([
  'kelp_tower', 'glow_bulb', 'buoy', 'lily_pad', 'sea_stack', 'wreck_hull', 'wreck_mast', 'stilt_house',
  'tide_rock', 'mangrove', 'giant_rib', 'skull_isle', 'reed_clump', 'container_stack', 'crane', 'neon_sign',
]);
const SWIMMERS = new Set(['plesiosaur', 'jellyfish']);
const FLYERS = new Set(['pterosaur_flock', 'sky_whale', 'moth_swarm', 'jellyfish']);
/** Known obstacles, for when the models haven't been measured yet. */
const TALL = new Set(['crystal_spire', 'sea_stack', 'crane', 'mesa', 'arch', 'monolith', 'glowcap_tall', 'ice_spire', 'alien_pylon', 'giant_rib', 'smokestack']);

export function isObstacle(kind: string) {
  const m = metaOf(kind);
  return m ? m.max[1] >= FLIGHT_Y + 1 : TALL.has(kind);
}

export class Terrain {
  readonly segments: Segment[];
  /** Where the level ends (the last segment's far end). */
  readonly end: number;
  /** Races: the shortcuts, in order down the course. */
  readonly shortcuts: Shortcut[] = [];
  private chunks = new Map<number, Chunk>();

  constructor(
    readonly seed: number,
    biomes: { biome: Biome; length: number }[],
    /** Race levels: more obstacles. */
    readonly race = false,
  ) {
    let z = 60; // a little run-up behind the start
    this.segments = biomes.map(({ biome, length }, i) => {
      const s = { biome, z0: z, z1: z - length - (i === 0 ? 60 : 0) };
      z = s.z1;
      return s;
    });
    this.end = z;
    if (race) this.layShortcuts();
  }

  /** Every so often down a race, a shortcut: where the biome has obstacles to build its walls from. */
  private layShortcuts() {
    const r = rng(this.seed * 613 + 29);
    for (let z0 = -150 - r() * 50; z0 > this.end + 140; ) {
      const kind = r() < 0.5 ? 'slot' : 'weave';
      const len = kind === 'slot' ? 70 + r() * 40 : 84 + r() * 28;
      const z1 = z0 - len;
      const bi = this.biomeIndex(z0);
      const ok = bi === this.biomeIndex(z1) && this.biome(z0).shape !== 'canyon' && this.biome(z0).props.some(([k]) => isObstacle(k));
      // not here (a canyon, nothing to build walls of, a biome changing): a little further on
      if (!ok) {
        z0 -= 30;
        continue;
      }
      const x0 = (r() * 2 - 1) * (HALF_W - 14);
      const pts: Shortcut['pts'] = [];
      if (kind === 'slot') for (let z = z0, k = 0; z >= z1 - 0.01; z -= len / 6, k++) pts.push({ z, x: x0 + Math.sin(k * 1.1 + r()) * 2.5 });
      else for (let z = z0, k = 0; z >= z1 - 0.01; z -= 16, k++) pts.push({ z, x: x0 + (k % 2 ? 1 : -1) * (3 + r() * 1.5) * (k ? 1 : 0) });
      this.shortcuts.push({ id: this.shortcuts.length, kind, z0, z1: pts[pts.length - 1].z, pts, half: kind === 'slot' ? 2.2 : 2.6, saved: 0 });
      z0 = pts[pts.length - 1].z - 90 - r() * 80;
    }
  }

  /** The shortcut whose lane runs past z (with `margin` beyond its ends), if any. */
  shortcutAt(z: number, margin = 0) {
    return this.shortcuts.find((sc) => z <= sc.z0 + margin && z >= sc.z1 - margin);
  }

  /** The biomes at z and how far between them: `t` 0 is all `a`, 1 all `b`. */
  blend(z: number): { a: number; b: number; t: number } {
    const segs = this.segments;
    let i = segs.findIndex((s) => z <= s.z0 && z > s.z1);
    if (i < 0) i = z > segs[0].z0 ? 0 : segs.length - 1;
    const s = segs[i];
    // blend into the next one over the last BLEND units, and from the previous over the first
    // (u runs 0 → 1 over the 2 × BLEND either side of the boundary; 0.5 right on it)
    if (i + 1 < segs.length && z - s.z1 < BLEND) {
      return { a: i, b: i + 1, t: smooth((BLEND - (z - s.z1)) / (2 * BLEND)) };
    }
    if (i > 0 && s.z0 - z < BLEND) {
      return { a: i - 1, b: i, t: smooth(0.5 + (s.z0 - z) / (2 * BLEND)) };
    }
    return { a: i, b: i, t: 0 };
  }

  biomeIndex(z: number) {
    const b = this.blend(z);
    return b.t < 0.5 ? b.a : b.b;
  }

  biome(z: number) {
    return this.segments[this.biomeIndex(z)].biome;
  }

  /** Middle of a canyon's winding path at z. */
  pathX(z: number) {
    const k = this.seed % 1000;
    return 13 * Math.sin(z * 0.017 + k) + 6 * Math.sin(z * 0.041 + k * 1.7);
  }

  /** Half-width of the canyon's floor at z: room to race, narrowing now and then to thread. */
  pathHalf(z: number) {
    return 14 + 5 * Math.sin(z * 0.031 + this.seed * 0.37);
  }

  private shape(shape: TerrainShape, relief: number, water: number | null, x: number, z: number): number {
    const s = this.seed;
    switch (shape) {
      case 'rolling':
        return Math.min(SCENERY_MAX, fbm(x * 0.045, z * 0.045, s) ** 1.4 * relief * 2.2);
      case 'terraces': {
        const h = fbm(x * 0.035, z * 0.035, s) * relief * 2;
        const step = Math.max(1, relief / 3);
        const f = h / step;
        const fl = Math.floor(f);
        return Math.min(SCENERY_MAX, (fl + smoothstep(0.82, 1, f - fl)) * step);
      }
      case 'ridges': {
        const r = ridged(x * 0.035, z * 0.035, s);
        return Math.min(SCENERY_MAX, r ** 3 * relief * 1.6);
      }
      case 'islands': {
        const w = water ?? 0;
        const n = fbm(x * 0.04, z * 0.04, s);
        return Math.min(SCENERY_MAX, Math.max(0, (n - 0.42) * relief * 2.4 + w * 0.6));
      }
      case 'dunes': {
        const warp = fbm(x * 0.03, z * 0.03, s) * 4;
        const d = Math.sin(z * 0.16 + x * 0.06 + warp) * 0.5 + 0.5;
        return Math.min(SCENERY_MAX, (d ** 1.6 * 0.8 + fbm(x * 0.08, z * 0.08, s + 3) * 0.6) * relief);
      }
      case 'flats':
        return 0.3 + fbm(x * 0.05, z * 0.05, s) * relief * 0.6;
      case 'marsh': {
        const n = fbm(x * 0.06, z * 0.06, s);
        return Math.max(0, (n - 0.3) * relief * 2.4);
      }
      case 'craters': {
        let h = 0.6 + fbm(x * 0.05, z * 0.05, s) * relief * 0.5;
        const cell = 26;
        const cx = Math.floor(x / cell);
        const cz = Math.floor(z / cell);
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++) {
            const r0 = noise2((cx + i) * 7.1, (cz + j) * 3.3, s + 9);
            const px = (cx + i + 0.2 + noise2((cx + i) * 1.3, (cz + j) * 2.9, s + 1) * 0.6) * cell;
            const pz = (cz + j + 0.2 + noise2((cx + i) * 4.1, (cz + j) * 1.7, s + 2) * 0.6) * cell;
            const rad = 5 + r0 * 8;
            const d = Math.hypot(x - px, z - pz) / rad;
            if (d < 1.6) {
              const bowl = d < 1 ? -(1 - d * d) * relief * 0.9 : 0;
              const rim = Math.exp(-((d - 1) ** 2) * 18) * relief * 0.55;
              h += bowl + rim;
            }
          }
        return clamp(h, 0, SCENERY_MAX);
      }
      case 'canyon': {
        const d = Math.abs(x - this.pathX(z)) - this.pathHalf(z);
        const floor = 0.5 + fbm(x * 0.07, z * 0.07, s) * 2.2;
        const wall = smoothstep(-0.5, 3.5, d) * relief * (0.9 + ridged(x * 0.06, z * 0.06, s + 5) * 0.35);
        return floor + wall;
      }
    }
  }

  private biomeHeight(i: number, x: number, z: number) {
    const b = this.segments[i].biome;
    return this.shape(b.shape, b.relief, b.water, x, z);
  }

  /** Height of the ground at (x, z). */
  height(x: number, z: number): number {
    const { a, b, t } = this.blend(z);
    if (a === b || t === 0) return this.biomeHeight(a, x, z);
    return lerp(this.biomeHeight(a, x, z), this.biomeHeight(b, x, z), t);
  }

  /** Height of the water at z, or -Infinity. */
  water(z: number): number {
    const { a, b, t } = this.blend(z);
    const wa = this.segments[a].biome.water;
    const wb = this.segments[b].biome.water;
    if (wa === null && wb === null) return -Infinity;
    if (wa === null) return t > 0.5 ? wb! : -Infinity;
    if (wb === null) return t < 0.5 ? wa : -Infinity;
    return lerp(wa, wb, t);
  }

  /** Is the ground at (x, z) higher than you fly? (With a margin for the ship's body.) */
  solid(x: number, z: number, margin = 0.6) {
    return this.height(x, z) > FLIGHT_Y - margin;
  }

  chunk(index: number): Chunk {
    let c = this.chunks.get(index);
    if (!c) {
      c = this.makeChunk(index);
      this.chunks.set(index, c);
      if (this.chunks.size > 64) {
        // forget the ones far behind
        for (const k of this.chunks.keys()) if (k < index - 8 || k > index + 40) this.chunks.delete(k);
      }
    }
    return c;
  }

  /** Chunks covering z from `zFar` (smaller) to `zNear`. */
  chunksBetween(zFar: number, zNear: number): Chunk[] {
    const out: Chunk[] = [];
    for (let i = Math.floor(-zNear / CHUNK); i <= Math.floor(-zFar / CHUNK); i++) out.push(this.chunk(i));
    return out;
  }

  /** Every obstacle collider near (x, z). */
  *colliders(x: number, z: number, reach = 6): Generator<{ x: number; z: number; r: number }> {
    for (const c of this.chunksBetween(z - reach - 12, z + reach + 12))
      for (const p of c.props) {
        if (!p.obstacle) continue;
        for (const col of p.cols) if (Math.abs(col.x - x) < reach + col.r && Math.abs(col.z - z) < reach + col.r) yield col;
      }
  }

  private makeChunk(index: number): Chunk {
    const r = rng(this.seed * 7919 + index * 104729);
    const zNear = -index * CHUNK;
    const props: Placed[] = [];
    const wildlife: Wildlife[] = [];
    const bi = this.biomeIndex(zNear - CHUNK / 2);
    const biome = this.segments[bi].biome;
    const start = zNear > -40; // keep the start clear

    // scenery: everything not tall enough to hit
    const scenery = biome.props.filter(([k]) => !isObstacle(k));
    const n = Math.round(((biome.density * CHUNK * SPREAD * 2) / 100) * (0.8 + r() * 0.4));
    for (let i = 0; i < n && scenery.length; i++) {
      const kind = weighted(r, scenery);
      const x = (r() * 2 - 1) * SPREAD;
      const z = zNear - r() * CHUNK;
      const p = this.place(kind, x, z, r, this.biomeIndex(z));
      if (p) props.push(p);
    }

    // obstacles: rows across the field that always leave gaps to fly through, a few of them, so
    // there's more than one line to take (and the tight ones are quicker)
    const tall = biome.props.filter(([k]) => isObstacle(k));
    if (tall.length && !start) {
      const rows = this.race ? 2 : r() < 0.6 ? 1 : 0;
      for (let row = 0; row < rows; row++) {
        const z = zNear - (row + 0.3 + r() * 0.4) * (CHUNK / rows);
        const canyon = biome.shape === 'canyon';
        const lo = canyon ? this.pathX(z) - this.pathHalf(z) : -HALF_W + 2;
        const hi = canyon ? this.pathX(z) + this.pathHalf(z) : HALF_W - 2;
        // one gap in each stretch of the row: wide ones and (on a race) a narrow racing line; and
        // never across a shortcut's lane or its mouth
        const stretches = canyon ? 1 + (r() < 0.5 ? 1 : 0) : this.race ? 3 : 2 + (r() < 0.4 ? 1 : 0);
        const gaps: { x: number; half: number }[] = [];
        const sc = this.shortcutAt(z, 14);
        if (sc) gaps.push({ x: laneX(sc, z), half: sc.half + 4 });
        for (let g = 0; g < stretches; g++) {
          const half = this.race && g === 1 ? 2.6 : this.race ? 4 : 5.5;
          const a = lerp(lo, hi, g / stretches) + half;
          const b = lerp(lo, hi, (g + 1) / stretches) - half;
          gaps.push({ x: lerp(a, Math.max(a, b), r()), half });
        }
        // walk along the row, filling in between the gaps
        const fill = this.race ? 0.62 : 0.45;
        for (let x = lo - 4 + r() * 4; x < hi + 4; ) {
          const kind = weighted(r, tall);
          const m = metaOf(kind);
          const reach = m ? Math.max(Math.abs(m.min[0]), Math.abs(m.max[0]), Math.abs(m.min[2]), Math.abs(m.max[2])) : 2;
          const clear = gaps.every((g) => Math.abs(x - g.x) > g.half + reach);
          if (clear && r() < fill) {
            const p = this.place(kind, x, z + (r() - 0.5) * 2, r, this.biomeIndex(z), true);
            if (p) props.push(p);
          }
          x += reach * 2 + 1 + r() * 6;
        }
      }
      // a shortcut's walls, either side of its lane
      for (const sc of this.shortcuts) if (sc.z0 >= zNear - CHUNK && sc.z1 <= zNear) this.wallLane(sc, zNear, tall, r, props);
      // and further out, where they frame the view without blocking
      for (let k = 0; k < 3; k++) {
        const kind = weighted(r, tall);
        const x = (r() < 0.5 ? -1 : 1) * (HALF_W + 2 + r() * 12);
        const p = this.place(kind, x, zNear - r() * CHUNK, r, bi, true);
        if (p) props.push(p);
      }
    }

    // wildlife
    for (const [kind, w] of biome.creatures) {
      if (r() > w * 0.18) continue;
      const x = (r() * 2 - 1) * (HALF_W + 12);
      const z = zNear - r() * CHUNK;
      const ground = this.height(x, z);
      const wet = ground < this.water(z);
      if (SWIMMERS.has(kind) && !wet && !FLYERS.has(kind)) continue;
      if (!SWIMMERS.has(kind) && !FLYERS.has(kind) && wet) continue;
      if (!FLYERS.has(kind) && ground > 7) continue;
      const herd = kind === 'mammoth' || kind === 'sauropod' ? 1 + Math.floor(r() * 3) : 1;
      const heading = r() * Math.PI * 2;
      for (let h = 0; h < herd; h++)
        wildlife.push({ kind, x: x + h * 3.5 * Math.cos(heading + 1.4), z: z + h * 3.5 * Math.sin(heading + 1.4), heading, speed: 0.6 + r() * 1.2, biome: bi });
    }

    return { index, props, wildlife };
  }

  /** The walls of a shortcut's lane within this chunk: the slimmest obstacle there is, close set. */
  private wallLane(sc: Shortcut, zNear: number, tall: [string, number][], r: Rng, props: Placed[]) {
    const reachOf = (k: string) => {
      const m = metaOf(k);
      return m ? Math.max(Math.abs(m.min[0]), Math.abs(m.max[0]), Math.abs(m.min[2]), Math.abs(m.max[2])) : 2;
    };
    const kind = tall.map(([k]) => k).sort((a, b) => reachOf(a) - reachOf(b))[0];
    const step = Math.max(2.6, Math.min(5, reachOf(kind) * 1.4));
    // stepped from the mouth, so chunks meet without a seam
    const first = Math.ceil((sc.z0 - zNear) / step);
    for (let k = Math.max(0, first); sc.z0 - k * step >= Math.max(sc.z1, zNear - CHUNK); k++) {
      const z = sc.z0 - k * step;
      // the lane's furthest either way over the wall piece's length (it may be swinging past)
      const reach = reachOf(kind) + 1;
      const xs = [-reach, -reach / 2, 0, reach / 2, reach].map((dz) => laneX(sc, z + dz));
      for (const side of [-1, 1]) {
        const edge = side > 0 ? Math.max(...xs) : Math.min(...xs);
        const p = this.place(kind, edge + side * (sc.half + 0.7 + reachOf(kind)), z, r, this.biomeIndex(z), true);
        if (!p) continue;
        // slide it so its inner edge is exactly the lane's wall
        const inner = side > 0 ? Math.min(...p.cols.map((c) => c.x - c.r)) : Math.max(...p.cols.map((c) => c.x + c.r));
        const dx = edge + side * (sc.half + 0.7) - inner;
        p.x += dx;
        for (const c of p.cols) c.x += dx;
        props.push(p);
      }
    }
  }

  private place(kind: string, x: number, z: number, r: Rng, biome: number, obstacle = false): Placed | null {
    const ground = this.height(x, z);
    const water = this.water(z);
    const wet = ground < water - 0.1;
    if (WATERBORNE.has(kind)) {
      if (!wet && ground > water + 1.5) return null; // too far up the shore
    } else if (wet) return null;
    const vs = variants(kind);
    const variant = vs.length ? Math.floor(r() * vs.length) : 0;
    const s = obstacle ? 0.9 + r() * 0.3 : 0.75 + r() * 0.5;
    const rot = obstacle && kind === 'arch' ? (r() - 0.5) * 0.3 : r() * Math.PI * 2;
    const y = WATERBORNE.has(kind) && wet ? water : ground;
    // scenery that would poke up into the flight plane (on a high terrace) is left out
    const m = metaOf(kind, variant);
    if (!obstacle && y + metaHeight(m) * s > FLIGHT_Y - 1) return null;
    const cols: Placed['cols'] = [];
    if (obstacle) {
      const c = Math.cos(rot);
      const sn = Math.sin(rot);
      const src = m?.colliders.length ? m.colliders : [{ x: 0, z: 0, r: m ? Math.min(m.max[0] - m.min[0], m.max[2] - m.min[2]) * 0.4 : 1.5 }];
      // (three turns (x, z) by θ about y to (x cos θ + z sin θ, -x sin θ + z cos θ))
      for (const k of src) cols.push({ x: x + (k.x * c + k.z * sn) * s, z: z + (-k.x * sn + k.z * c) * s, r: k.r * s });
    }
    return { kind, variant, x, z, y, rot, s, obstacle, cols, biome };
  }
}
