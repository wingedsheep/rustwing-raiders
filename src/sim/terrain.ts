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
import { Course, type Shortcut } from './course';

export { type Shortcut } from './course';

export const CHUNK = 16;
/** Props are scattered this far either side (the tilted camera on a wide screen sees ~±46, and a margin). */
export const SPREAD = 60;
/** A race's (the world is bent round its course: more of it shows at the sides). */
const RACE_SPREAD = 84;
/** A race's edges start this far down the course (the grid's own gantry marks the start). */
const GRID_EDGE = 10;
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

/** A pillar of rock standing on a canyon's floor (an ellipse, `len` along z over `r` across). */
export interface Pillar {
  x: number;
  z: number;
  r: number;
  len: number;
  /** Stands in the middle, so the way round it is to one side. */
  split: boolean;
}
/** Canyon floor per pillar (at most one each). */
const PILLAR_STEP = 46;

export interface Chunk {
  index: number;
  props: Placed[];
  wildlife: Wildlife[];
}

/** How often a chunk has a landmark, and how wide one grows to (world units, about). */
const LANDMARK_CHANCE = 0.32;
const LANDMARK_SIZE = 26;
/**
 * Each place's set pieces: what a landmark there is made of. Anything not listed makes do with its
 * own scenery, blown up.
 */
const LANDMARKS: Record<string, [string, number][]> = {
  fernwood: [['statue_head', 2], ['giant_fern', 2], ['skeleton_ribs', 1], ['ziggurat', 1]],
  basalt: [['basalt_columns', 3], ['lava_vent', 2], ['obsidian_rock', 1]],
  prism: [['crystal_cluster', 3], ['glass_shard', 1]],
  jade: [['wreck_hull', 2], ['statue_head', 1], ['tide_rock', 2]],
  kelp: [['wreck_hull', 2], ['coral_brain', 1], ['skull_isle', 1]],
  stiltport: [['wreck_hull', 2], ['container_stack', 1]],
  arkbones: [['skeleton_ribs', 3], ['skull_isle', 1], ['wreck_hull', 1]],
  stormwall: [['wreck_hull', 2], ['tide_rock', 2]],
  saltpans: [['skeleton_ribs', 2], ['salt_pillar', 2], ['nomad_tent', 1]],
  mesarun: [['boulder', 2], ['skeleton_ribs', 1]],
  monoliths: [['statue_head', 2], ['ziggurat', 2], ['skeleton_ribs', 1]],
  oasis: [['nomad_tent', 2], ['ziggurat', 1], ['statue_head', 1]],
  glowcap: [['glowcap', 3], ['fungus_coral', 2]],
  peat: [['fungus_coral', 2], ['dead_tree', 1], ['spore_vent', 1]],
  temple: [['ziggurat', 3], ['statue_head', 2]],
  sporevents: [['spore_vent', 3], ['fungus_coral', 2]],
  shelf: [['ice_block', 3], ['snow_rock', 2], ['mech_wreck', 1]],
  springs: [['steam_vent', 2], ['ice_block', 2]],
  tundra: [['mech_wreck', 2], ['snow_rock', 2], ['skeleton_ribs', 1]],
  enginecity: [['machine_dome', 3], ['mech_arm', 1]],
  titans: [['mech_wreck', 3], ['mech_arm', 2], ['skeleton_ribs', 1]],
  glass: [['glass_shard', 3], ['mech_wreck', 1]],
  scavcamp: [['scrap_pile', 3], ['mech_wreck', 2], ['scav_tent', 1]],
  whitewood: [['mech_wreck', 1], ['white_tree', 2], ['statue_head', 1]],
  coralflats: [['coral_brain', 3], ['coral_fan', 2], ['wreck_hull', 1]],
  whalelagoon: [['skull_isle', 1], ['skeleton_ribs', 2], ['coral_brain', 2]],
  bonearch: [['skeleton_ribs', 3], ['skull_isle', 1]],
  tidecaves: [['coral_brain', 2], ['tide_rock', 2]],
  orchards: [['greenhouse', 2], ['silo', 1], ['copper_tree', 2]],
  refinery: [['refinery_tank', 3], ['pipe_run', 1], ['scrap_pile', 1]],
  pipeline: [['refinery_tank', 1], ['scrap_pile', 2]],
  chemlake: [['refinery_tank', 2], ['wreck_hull', 1]],
};

/** Props that belong in the water (or right at its edge). */
const WATERBORNE = new Set([
  'kelp_tower', 'glow_bulb', 'buoy', 'lily_pad', 'sea_stack', 'wreck_hull', 'wreck_mast', 'stilt_house',
  'tide_rock', 'mangrove', 'giant_rib', 'skull_isle', 'reed_clump', 'container_stack', 'crane', 'neon_sign',
]);
const SWIMMERS = new Set(['plesiosaur', 'jellyfish']);
const FLYERS = new Set(['pterosaur_flock', 'sky_whale', 'moth_swarm', 'jellyfish']);
/** What grows or stands of itself (not what's built, nor what lives): a race's edges are lined with these. */
const NATURAL = new Set(['boulder', 'tide_rock', 'snow_rock', 'sea_stack', 'tree_fern', 'mangrove', 'fungus_coral', 'dead_tree', 'cycad', 'coral_tube', 'coral_fan', 'conifer', 'white_tree', 'vine_pillar', 'salt_pillar', 'obsidian_rock', 'mesa', 'kelp_tower', 'ice_spire', 'ice_block', 'glowcap_tall', 'glowcap', 'giant_fern', 'crystal_spire', 'crystal_cluster', 'coral_brain', 'copper_tree', 'charred_cycad', 'blue_palm', 'basalt_columns', 'reed_clump', 'glass_shard', 'dune_grass']);

/** Known obstacles, for when the models haven't been measured yet. */
const TALL = new Set(['crystal_spire', 'sea_stack', 'crane', 'mesa', 'arch', 'monolith', 'glowcap_tall', 'ice_spire', 'alien_pylon', 'giant_rib', 'smokestack']);

/** How far a kind reaches from where it stands (about). */
function reach(kind: string) {
  const m = metaOf(kind);
  return m ? Math.max(Math.abs(m.min[0]), Math.abs(m.max[0]), Math.abs(m.min[2]), Math.abs(m.max[2])) : 2;
}

export function isObstacle(kind: string) {
  const m = metaOf(kind);
  return m ? m.max[1] >= FLIGHT_Y + 1 : TALL.has(kind);
}

export class Terrain {
  readonly segments: Segment[];
  /** Where the level ends (the last segment's far end). */
  readonly end: number;
  /** Races: the road (see course.ts), and its shortcuts in order down it. */
  readonly course: Course | null = null;
  shortcuts: Shortcut[] = [];
  private chunks = new Map<number, Chunk>();
  private pillarCache = new Map<number, Pillar | null>();

  constructor(
    readonly seed: number,
    biomes: { biome: Biome; length: number }[],
    /** Race levels: a course across it (see course.ts). */
    readonly race = false,
    difficulty = 0,
  ) {
    let z = 60; // a little run-up behind the start
    this.segments = biomes.map(({ biome, length }, i) => {
      const s = { biome, z0: z, z1: z - length - (i === 0 ? 60 : 0) };
      z = s.z1;
      return s;
    });
    this.end = z;
    if (race) {
      this.course = new Course(seed, this.segments[0].z0, this.end, (z) => ({ canyon: this.segments[this.segIndex(z)].biome.shape === 'canyon' }), difficulty);
      this.shortcuts = this.course.shortcuts;
    }
  }

  /** The segment z falls in (no blending). */
  private segIndex(z: number) {
    const i = this.segments.findIndex((s) => z <= s.z0 && z > s.z1);
    return i < 0 ? (z > this.segments[0].z0 ? 0 : this.segments.length - 1) : i;
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

  /** How much of a canyon z is in: 1 down one, 0 out of one, between where the land blends. */
  canyonAt(z: number) {
    const { a, b, t } = this.blend(z);
    const c = (i: number) => (this.segments[i].biome.shape === 'canyon' ? 1 : 0);
    return c(a) * (1 - t) + c(b) * t;
  }

  /**
   * Keeps a flier's x on a canyon's floor at z: left alone down the middle, eased in short of the
   * walls the further out it asks to be (so a spot picked across the screen, or a hover the canyon
   * winds under, ends up between the walls, not in them). Out past the screen's sides (coming in,
   * going away) it's let be.
   */
  intoCanyon(x: number, z: number, r: number) {
    const w = this.course ? 0 : this.canyonAt(z) * (1 - smoothstep(HALF_W - 4, HALF_W + 4, Math.abs(x)));
    if (w <= 0) return x;
    const m = this.pathX(z);
    const room = Math.max(4, this.pathHalf(z) - 5 - r);
    const u = Math.abs(x - m) / room;
    const soft = u <= 0.6 ? u : 0.6 + 0.4 * Math.tanh((u - 0.6) / 0.4);
    return lerp(x, m + Math.sign(x - m) * soft * room, w);
  }

  /** Middle of a canyon's winding path at z. */
  pathX(z: number) {
    if (this.course) return this.course.x(z);
    const k = this.seed % 1000;
    return 11 * Math.sin(z * 0.015 + k) + 5 * Math.sin(z * 0.037 + k * 1.7);
  }

  /** Half-width of the canyon's floor at z: room to race and to fight, narrowing now and then. */
  pathHalf(z: number) {
    // (a race: the course runs down the canyon, its walls well clear of the line)
    if (this.course) return this.course.corridor(z) + 9;
    return 22 + 6 * Math.sin(z * 0.027 + this.seed * 0.37);
  }

  /**
   * The rock left standing on a canyon's floor near z: pillars of the wall's own stone, to slip
   * round. Each stretch of PILLAR_STEP has at most one: off to one side (the middle stays open),
   * or now and then right in the middle, splitting the canyon in two (then the racing line, see
   * lineX, swings round it).
   */
  pillars(z: number): Pillar[] {
    const out: Pillar[] = [];
    const c0 = Math.floor(-z / PILLAR_STEP);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      const p = this.pillar(c);
      if (p) out.push(p);
    }
    return out;
  }

  private pillar(cell: number): Pillar | null {
    if (cell < 4 || this.course) return null; // a clear run-up; and a race's road has its own
    let p = this.pillarCache.get(cell);
    if (p !== undefined) return p;
    const r = rng(this.seed * 4513 + cell * 7349);
    p = null;
    const z = -(cell + 0.3 + r() * 0.4) * PILLAR_STEP;
    if (this.biome(z).shape === 'canyon' && this.blend(z).t === 0 && r() < 0.8) {
      const half = this.pathHalf(z);
      const roll = r();
      const rad = 3 + r() * 3;
      if (roll < 0.3 && half - rad > 13) {
        // in the middle: the canyon splits round it
        p = { x: this.pathX(z) + (r() - 0.5) * 3, z, r: rad + 1, split: true, len: rad * (1.3 + r() * 0.8) };
      } else {
        // off to one side, leaving the middle clear
        const side = r() < 0.5 ? -1 : 1;
        const room = half - rad - 9;
        if (room > 0) p = { x: this.pathX(z) + side * (rad + 5 + r() * room), z, r: rad, split: false, len: rad * (1 + r() * 1.2) };
      }
    }
    this.pillarCache.set(cell, p);
    return p;
  }

  /**
   * The line to fly down a canyon at z: its middle, swinging out round a pillar standing in it.
   * (What the director lays rings on and the autopilot follows.)
   */
  lineX(z: number) {
    let x = this.pathX(z);
    for (const p of this.pillars(z)) {
      if (!p.split) continue;
      // which way round: the side with more room
      const side = p.x <= this.pathX(p.z) ? 1 : -1;
      const reach = p.len + 14;
      const k = smooth(clamp((1 - Math.abs(z - p.z) / reach) * 1.6, 0, 1));
      x += side * (p.r + (this.pathHalf(p.z) - p.r) * 0.5) * k;
    }
    return x;
  }

  /** Off a canyon's rock at (x, z), which way is out: away from a pillar, else towards the middle. */
  outOfRock(x: number, z: number): { x: number; z: number } {
    for (const p of this.pillars(z)) {
      const dz = (z - p.z) / Math.max(1, p.len / p.r);
      if (Math.hypot(x - p.x, dz) < p.r + 3) {
        const dx = x - p.x;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l || 1, z: dz / l };
      }
    }
    return { x: Math.sign(this.pathX(z) - x) || 1, z: 0 };
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
        // the walls wander in and out a little (buttresses, bays), so they aren't a ruled line
        const d = Math.abs(x - this.pathX(z)) - this.pathHalf(z) + (fbm(x * 0.05, z * 0.05, s + 8) - 0.5) * 7;
        const floor = 0.5 + fbm(x * 0.07, z * 0.07, s) * 2.2;
        let rock = smoothstep(-0.5, 3.5, d);
        for (const p of this.pillars(z)) {
          // a pillar: steep sides, a craggy edge
          const e = Math.hypot(x - p.x, (z - p.z) * (p.r / p.len)) - p.r + (noise2(x * 0.4, z * 0.4, s + 2) - 0.5) * 1.6;
          rock = Math.max(rock, 1 - smoothstep(-1, 1.2, e));
        }
        const wall = rock * relief * (0.9 + ridged(x * 0.06, z * 0.06, s + 5) * 0.35);
        // and where it's already past the flight line, on up in a sheer cliff, so no one thinks it
        // can be cleared (only above the line: where it turns solid doesn't move)
        const cliff = smoothstep(FLIGHT_Y, FLIGHT_Y + 3, floor + wall) * relief;
        return floor + wall + cliff;
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
    return a === b || t === 0 ? this.biomeHeight(a, x, z) : lerp(this.biomeHeight(a, x, z), this.biomeHeight(b, x, z), t);
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
    const spread = this.course ? RACE_SPREAD : SPREAD;

    // a landmark now and then: something big for the place, under the flight line, with room round it
    const scenery = biome.props.filter(([k]) => !isObstacle(k));
    const marks: { x: number; z: number; r: number }[] = [];
    if (!start && r() < LANDMARK_CHANCE) {
      const p = this.landmark(biome, zNear, r, bi);
      // (not on a race's track: it would hide the way on)
      if (p && !this.onTrack(p.x, p.z, (p.cols[0]?.r ?? 6) + 2)) {
        props.push(p);
        marks.push({ x: p.x, z: p.z, r: p.cols[0]?.r ?? 6 });
        p.cols = [];
      }
    }
    const inMark = (x: number, z: number, pad: number) => marks.some((m) => (m.x - x) ** 2 + (m.z - z) ** 2 < (m.r + pad) ** 2);

    // scenery: everything not tall enough to hit. Not sprinkled evenly: in groves and thickets with
    // clearings between, each patch mostly of one kind, the biggest specimens in the thick of it
    const n = Math.round(((biome.density * CHUNK * spread * 2) / 100) * (0.8 + r() * 0.4));
    const s0 = this.seed + bi * 13;
    for (let i = 0; i < n * 1.6 && scenery.length; i++) {
      const x = (r() * 2 - 1) * spread;
      const z = zNear - r() * CHUNK;
      const thick = fbm(x * 0.028, z * 0.028, s0 + 21);
      if (r() > clamp((thick - 0.3) * 3.2, 0.1, 1)) continue;
      if (inMark(x, z, 1)) continue;
      // the patch's own kind, or (less often) whatever grows here
      const patch = scenery[Math.floor(noise2(x * 0.017, z * 0.017, s0 + 4) * scenery.length * 0.999)];
      const kind = r() < 0.6 ? patch[0] : weighted(r, scenery);
      const p = this.place(kind, x, z, r, this.biomeIndex(z));
      if (!p) continue;
      // (a race's track is kept clear but for what grows low: nothing on it to read as in the way)
      if (this.course && this.onTrack(x, z, 1.5) && metaHeight(metaOf(kind, p.variant)) * p.s > 1.2) continue;
      // in the thick of a grove they grow big; here and there, an old giant
      const big = smoothstep(0.55, 0.8, thick) * 0.35 + (r() < 0.05 ? 0.5 + r() * 0.4 : 0);
      if (big > 0.02) this.grow(p, 1 + big);
      props.push(p);
    }

    // obstacles: rows across the field that always leave gaps to fly through, a few of them, so
    // there's more than one line to take (and the tight ones are quicker)
    const tall = biome.props.filter(([k]) => isObstacle(k));
    if (this.course) {
      if (!start) this.raceObstacles(this.course, zNear, tall, r, props, inMark);
    } else if (tall.length && !start) {
      const rows = this.race ? 2 : r() < 0.6 ? 1 : 0;
      for (let row = 0; row < rows; row++) {
        const z = zNear - (row + 0.3 + r() * 0.4) * (CHUNK / rows);
        const canyon = biome.shape === 'canyon';
        // (not across a pillar: that's this stretch's obstacle)
        if (canyon && this.pillars(z).some((p) => Math.abs(p.z - z) < p.len + 10)) continue;
        const lo = canyon ? this.pathX(z) - this.pathHalf(z) : -HALF_W + 2;
        const hi = canyon ? this.pathX(z) + this.pathHalf(z) : HALF_W - 2;
        // one gap in each stretch of the row: wide ones and (on a race) a narrow racing line; and
        // never across a shortcut's lane or its mouth
        const stretches = canyon ? 1 + (r() < 0.5 ? 1 : 0) : this.race ? 3 : 2 + (r() < 0.4 ? 1 : 0);
        const gaps: { x: number; half: number }[] = [];
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
          if (clear && r() < fill && !inMark(x, z, reach)) {
            const p = this.place(kind, x, z + (r() - 0.5) * 2, r, this.biomeIndex(z), true);
            if (p) props.push(p);
          }
          x += reach * 2 + 1 + r() * 6;
        }
      }
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

    // (on a race, nothing past the middle of a bend's circle: drawn bent round it, it would fold over)
    const c = this.course;
    if (c) for (let i = props.length - 1; i >= 0; i--) if (c.folds(props[i].x, props[i].z)) props.splice(i, 1);
    return { index, props, wildlife };
  }

  /** On a race's track or a lane of it (within `pad`)? Always false off a race. */
  onTrack(x: number, z: number, pad = 0) {
    const c = this.course;
    return !!c && Math.abs(x - c.x(z)) < c.corridor(z) + pad;
  }

  /**
   * A race's obstacles within this chunk. The ones the course stands on its line (at an apex, out
   * on an exit: see course.ts); and the land's own, in clumps, kept out of the clear way either
   * side of the line and thickening the further from it you stray, so the course reads from the
   * land itself. Never on a gate or a pad.
   */
  private raceObstacles(c: Course, zNear: number, tall: [string, number][], r: Rng, props: Placed[], inMark: (x: number, z: number, pad: number) => boolean) {
    const zFar = zNear - CHUNK;
    // (the slimmest few: something to go round, not a wall)
    const thin = [...tall].filter(([k]) => reach(k) <= 3.6).sort((a, b) => reach(a[0]) - reach(b[0]));
    const slim = (thin.some(([k]) => NATURAL.has(k)) ? thin.filter(([k]) => NATURAL.has(k)) : thin).slice(0, 2);
    for (const h of c.hazards) {
      if (h.z > zNear || h.z <= zFar || !slim.length) continue;
      // (in a shortcut's lane, only the very slimmest: it's narrow already)
      const p = this.place(c.shortcutAt(h.z) && Math.abs(h.x - c.x(h.z)) > c.half(h.z) ? slim[0][0] : weighted(r, slim), h.x, h.z, r, this.biomeIndex(h.z), true);
      if (p) props.push(p);
    }
    // the edges: no fences, nothing in rows. The land's own rock and growth (never what's built:
    // no cranes, no tents) in ragged clumps just off the track, set back by more or less, big and
    // small together: close and thick where it matters (the corners, the tight bits), here and
    // there out in the open. The worn ground between says where the track runs.
    const here = this.biome(zNear - CHUNK / 2).props;
    const wild = (kinds: [string, number][]) => kinds.filter(([k]) => NATURAL.has(k));
    const tallWild = wild(tall).filter(([k]) => reach(k) <= 5);
    const lowWild = wild(here.filter(([k]) => !isObstacle(k)));
    const clump = (x: number, z: number, side: number, size: number) => {
      for (let i = 0; i < size; i++) {
        const t = tallWild.length > 0 && r() < 0.45;
        const kinds: [string, number][] = t ? tallWild : lowWild.length ? lowWild : [['boulder', 1]];
        const kind = weighted(r, kinds);
        const far = Math.min(reach(kind), 5);
        const out = (t ? far * 0.9 : 0.3) + r() * r() * 7;
        const p = this.place(kind, x + side * out, z + (r() - 0.5) * 9, r, this.biomeIndex(z), t);
        if (!p) continue;
        if (!t) this.grow(p, 1.2 + r() * 0.9);
        props.push(p);
      }
    };
    for (const side of [-1, 1]) {
      let z = zNear - r() * 10;
      while (z > zFar) {
        const h = c.half(z);
        // how much the edge matters here: a bend (the outside most), a narrow way
        const bend = clamp((Math.abs(c.k(z)) * 95) * (Math.sign(c.k(z)) === -side ? 1.4 : 0.7), 0, 1.4);
        const need = clamp(bend + (h < 16 ? 0.8 : 0) - (h > 27 ? 0.4 : 0), 0, 1.5);
        const gap = lerp(30, 7, need / 1.5) * (0.6 + r() * 0.8);
        if (!c.tunnelAt(z) && !c.open(side, z) && z < GRID_EDGE && r() < 0.5 + need * 0.4) clump(c.x(z) + side * h, z, side, 1 + Math.floor(r() * (2 + need * 2)));
        z -= gap;
      }
    }
    // a shortcut's lane: rock both sides, close (its walls are hard: this is what they look like)
    for (const sc of c.shortcuts) {
      for (let z = Math.min(zNear, sc.z0); z > Math.max(zFar, sc.z1); z -= 5 + r() * 5) {
        const [o, i] = c.laneWalls(sc, z);
        clump(o, z, sc.side, 1 + Math.floor(r() * 2));
        if (!Number.isNaN(i) && Math.abs(i - c.x(z)) - c.half(z) > 4) clump(i, z, -sc.side, 1);
      }
    }
    // the islands' rock: whatever's tallest here, crowding them (only to look at: their walls keep you off)
    for (const d of c.decor) {
      if (d.z > zNear || d.z <= zFar) continue;
      const il = c.islandAt(d.z);
      const room = il ? c.islandHalf(il, d.z) - Math.abs(d.x - c.x(d.z) - il.off) - 0.6 : 0;
      const fits = tall.filter(([k]) => reach(k) * 1.42 <= room);
      if (!fits.length) continue;
      const p = this.place(weighted(r, fits), d.x, d.z, r, this.biomeIndex(d.z), true);
      if (p) props.push(p);
    }
    const canyon = this.biome(zNear - CHUNK / 2).shape === 'canyon';
    const s0 = this.seed * 3 + 77;
    for (let k = 0; k < (canyon || !tall.length ? 0 : 16); k++) {
      const z = zNear - r() * CHUNK;
      const x = (r() * 2 - 1) * (RACE_SPREAD - 6);
      const kind = weighted(r, tall);
      const far = reach(kind) * 1.42;
      // how far out past the walls (past the thing's own reach): they crowd close, rushing past
      const out = Math.abs(x - c.x(z)) - c.corridor(z) - far;
      if (out < 0) continue;
      // (what's built stands back from the track: right up against it, only the land's own)
      if (out < 12 && !NATURAL.has(kind)) continue;
      const clump = fbm(x * 0.05, z * 0.05, s0);
      if (r() > (0.4 + smoothstep(0, 26, out) * 0.4) * smoothstep(0.25, 0.6, clump) + 0.08) continue;
      if (inMark(x, z, reach(kind))) continue;
      const p = this.place(kind, x, z, r, this.biomeIndex(z), true);
      if (p) props.push(p);
    }
  }

  /** Scales scenery up by `k`, as far as it fits under the flight line. */
  private grow(p: Placed, k: number) {
    const h = metaHeight(metaOf(p.kind, p.variant));
    p.s = Math.max(p.s, Math.min(p.s * k, (FLIGHT_Y - 1.5 - p.y) / Math.max(h, 0.3)));
  }

  /**
   * A landmark: one of the place's set pieces (or its biggest scenery), blown up as large as will
   * pass under the flight line. Its collider column holds its footprint, to keep the scenery off it.
   */
  private landmark(biome: Biome, zNear: number, r: Rng, bi: number): Placed | null {
    const pool = LANDMARKS[biome.id] ?? biome.props.filter(([k]) => !isObstacle(k));
    if (!pool.length) return null;
    for (let tries = 0; tries < 4; tries++) {
      const kind = weighted(r, pool);
      // off to one side or the other more often than straight down the middle
      const x = (r() < 0.75 ? (r() < 0.5 ? -1 : 1) * (14 + r() * 30) : (r() - 0.5) * 20);
      const z = zNear - CHUNK * (0.2 + r() * 0.6);
      const p = this.place(kind, x, z, r, bi);
      if (!p) continue;
      const m = metaOf(kind, p.variant);
      if (!m) continue;
      const h = Math.max(metaHeight(m), 0.3);
      const fit = (FLIGHT_Y - 1.5 - p.y) / h;
      const s = Math.min(fit, (LANDMARK_SIZE / Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2], 1)) * (0.8 + r() * 0.4));
      if (s < 1.3) continue;
      p.s = s;
      const foot = Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]) * s * 0.55;
      p.cols = [{ x: p.x, z: p.z, r: foot }];
      return p;
    }
    return null;
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
