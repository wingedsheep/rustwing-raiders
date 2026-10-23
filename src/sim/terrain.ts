/**
 * The land a level flies over: a run of biomes laid end to end along -z, each with its own shape,
 * blended where they meet, and the props scattered over it. All of it is worked out from the seed,
 * on demand, a chunk at a time, so the sim (for what you can hit) and the view (for what you see)
 * agree without either keeping the other's copy.
 */

import type { Biome, TerrainShape } from '../world/planets';
import { lookOf, type SetRole } from '../world/looks';
import { FLIGHT_Y, HALF_W } from './types';
import { fbm, noise2, ridged, rng, smooth, smoothstep, weighted, clamp, lerp, type Rng } from '../util';
import { metaOf, variants, height as metaHeight } from './meta';
import { Kit, type Bones, type Plan, type Post, type Route } from './layout';
import { LAYOUTS } from './layouts';

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
  /** A set piece (see world/looks.ts): placed as built, never leant or tinted. */
  role?: SetRole;
  /** How far round it the ground is its own (a set piece or a landmark: see `occupied`). */
  foot?: number;
  /** Stands on a wall's top, over the flight line: drawn with depth like the rock, never thinned. */
  rim?: boolean;
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

/** Set pieces come one to a slot of this many chunks at most, so two never crowd each other. */
const SET_SLOT = 4;

/** How often a chunk has a landmark, and how wide one grows to (world units, about). */
const LANDMARK_CHANCE = 0.32;
const LANDMARK_SIZE = 26;
/**
 * Each place's set pieces: what a landmark there is made of. Anything not listed makes do with its
 * own scenery, blown up.
 */
const LANDMARKS: Record<string, [string, number][]> = {
  fernwood: [['statue_head', 2], ['orutal_mossy_log', 2], ['ziggurat', 1]],
  basalt: [['basalt_columns', 3], ['obsidian_rock', 1]],
  prism: [['crystal_cluster', 3], ['glass_shard', 1]],
  jade: [['wreck_hull', 2], ['statue_head', 1], ['tide_rock', 2]],
  kelp: [['wreck_hull', 2], ['coral_brain', 1], ['skull_isle', 1]],
  stiltport: [['wreck_hull', 2], ['container_stack', 1]],
  arkbones: [['wreck_hull', 3], ['skull_isle', 1]],
  stormwall: [['wreck_hull', 2], ['tide_rock', 2]],
  saltpans: [['salt_pillar', 2], ['nomad_tent', 1]],
  mesarun: [['boulder', 2]],
  monoliths: [['statue_head', 2], ['ziggurat', 2]],
  oasis: [['kessra_oasis_grove', 3], ['nomad_tent', 1]],
  glowcap: [['glowcap', 3], ['mirefall_lattice', 1]],
  peat: [['mirefall_drowned_trunk', 2], ['mirefall_pitcher', 1]],
  temple: [['mirefall_idol_head', 3], ['mirefall_courtyard', 2]],
  sporevents: [['mirefall_vent_mound', 3], ['mirefall_brood_sac', 1]],
  shelf: [['ice_block', 3], ['glacis_relic', 2], ['glacis_hum_crystal', 1], ['mech_wreck', 1]],
  springs: [['steam_vent', 2], ['glacis_rimpool', 2], ['ice_block', 1]],
  tundra: [['mech_wreck', 2], ['glacis_tusk_bones', 2], ['snow_rock', 1]],
  enginecity: [['machine_dome', 2], ['glacis_hexcells', 2], ['glacis_radiator', 1], ['mech_arm', 1]],
  titans: [['mech_wreck', 3], ['mech_arm', 2]],
  glass: [['glass_shard', 3], ['mech_wreck', 1]],
  scavcamp: [['scrap_pile', 3], ['mech_wreck', 2], ['scav_tent', 1]],
  whitewood: [['mech_wreck', 1], ['white_tree', 2], ['statue_head', 1]],
  coralflats: [['coral_brain', 3], ['coral_fan', 2], ['wreck_hull', 1]],
  whalelagoon: [['coral_brain', 2], ['tide_rock', 1]],
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
  'halcyon_lantern_kelp', 'halcyon_sampan', 'kessra_brine_reed', 'halcyon_storm_stack',
  'vesh_reef_head', 'vesh_kelp_mat', 'vesh_bone_tip', 'vesh_skiff', 'cinder_slick_boom', 'cinder_sludge_raft',
  // (the drowned temple's columns and stones stand in the shallows as well as on land)
  'mirefall_colonnade', 'vine_pillar', 'mirefall_stele',
]);
/** How far up the shore a waterborne kind may stand (above the water line; 1.5 if not said): kelp stays in the sea. */
const SHORE: Record<string, number> = {
  kelp_tower: 0.15, glow_bulb: 0.05, halcyon_lantern_kelp: 0.15,
  vesh_reef_head: 0.2, vesh_kelp_mat: 0.05, vesh_bone_tip: 0.3, vesh_skiff: 0.4,
  cinder_slick_boom: 0.05, cinder_sludge_raft: 0.05,
  mirefall_colonnade: Infinity, vine_pillar: Infinity, mirefall_stele: Infinity,
};
/**
 * Farmland, by biome: these kinds aren't scattered but laid in a grid of plots (cell w × d), all
 * one way (rows running up the field), with tracks between and now and then a plot left fallow;
 * the biome's other scenery fills the tracks.
 */
const FIELDS: Record<string, { kinds: Set<string>; cell: [number, number]; fallow: number }> = {
  orchards: { kinds: new Set(['cinder_orchard_row', 'cinder_crop_bed']), cell: [13, 14], fallow: 0.1 },
};
const SWIMMERS = new Set(['plesiosaur', 'jellyfish']);
const FLYERS = new Set(['pterosaur_flock', 'sky_whale', 'moth_swarm', 'jellyfish']);
/** Known obstacles, for when the models haven't been measured yet. */
const TALL = new Set(['crystal_spire', 'sea_stack', 'crane', 'mesa', 'arch', 'monolith', 'glowcap_tall', 'ice_spire', 'alien_pylon', 'giant_rib', 'smokestack']);

/** The weighted pick at u (0..1): like weighted(), but from a number in hand (a patch's noise). */
function weightedAt<T>(u: number, xs: readonly (readonly [T, number])[]): readonly [T, number] {
  const total = xs.reduce((a, x) => a + x[1], 0);
  let k = clamp(u, 0, 0.999) * total;
  for (const x of xs) if ((k -= x[1]) < 0) return x;
  return xs[xs.length - 1];
}

export function isObstacle(kind: string) {
  const m = metaOf(kind);
  return m ? m.max[1] >= FLIGHT_Y + 1 : TALL.has(kind);
}

export class Terrain {
  readonly segments: Segment[];
  /** Where the level ends (the last segment's far end). */
  readonly end: number;
  private chunks = new Map<number, Chunk>();
  private pillarCache = new Map<number, Pillar | null>();
  /** Each segment's bones and plan, if its biome has a layout (see sim/layout.ts); worked out when first asked. */
  private boneCache = new Map<number, Bones | null>();
  private planCache = new Map<number, Plan | null>();

  constructor(
    readonly seed: number,
    biomes: { biome: Biome; length: number }[],
  ) {
    let z = 60; // a little run-up behind the start
    this.segments = biomes.map(({ biome, length }, i) => {
      const s = { biome, z0: z, z1: z - length - (i === 0 ? 60 : 0) };
      z = s.z1;
      return s;
    });
    this.end = z;
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
    const w = this.canyonAt(z) * (1 - smoothstep(HALF_W - 4, HALF_W + 4, Math.abs(x)));
    if (w <= 0) return x;
    const m = this.pathX(z);
    const room = Math.max(4, this.pathHalf(z) - 5 - r);
    const u = Math.abs(x - m) / room;
    const soft = u <= 0.6 ? u : 0.6 + 0.4 * Math.tanh((u - 0.6) / 0.4);
    return lerp(x, m + Math.sign(x - m) * soft * room, w);
  }

  /** Middle of a canyon's winding path at z. */
  pathX(z: number) {
    const w = this.bonesAt(z)?.walls?.(z);
    return w ? (w[0] + w[1]) / 2 : this.basePathX(z);
  }

  /** Half-width of the canyon's floor at z: room to fight in, narrowing now and then. */
  pathHalf(z: number) {
    const w = this.bonesAt(z)?.walls?.(z);
    return w ? (w[1] - w[0]) / 2 : this.baseHalf(z);
  }

  private basePathX(z: number) {
    const k = this.seed % 1000;
    return 11 * Math.sin(z * 0.015 + k) + 5 * Math.sin(z * 0.037 + k * 1.7);
  }

  private baseHalf(z: number) {
    return 22 + 6 * Math.sin(z * 0.027 + this.seed * 0.37);
  }

  /** The segment z is in (the first or last past the ends). */
  private segmentAt(z: number) {
    const i = this.segments.findIndex((s) => z <= s.z0 && z > s.z1);
    return i >= 0 ? i : z > this.segments[0].z0 ? 0 : this.segments.length - 1;
  }

  /** A segment's bones, if its biome has a layout. */
  bones(i: number): Bones | null {
    let b = this.boneCache.get(i);
    if (b === undefined) {
      const s = this.segments[i];
      const layout = LAYOUTS[s.biome.id];
      b = layout ? layout.bones(this.seed + i * 101, s.z0, s.z1, { x: (z) => this.basePathX(z), half: (z) => this.baseHalf(z) }) : null;
      this.boneCache.set(i, b);
    }
    return b;
  }

  private bonesAt(z: number) {
    return this.bones(this.segmentAt(z));
  }

  /** A segment's plan, if its biome has a layout: worked out whole, the first time it's asked for. */
  plan(i: number): Plan | null {
    let p = this.planCache.get(i);
    if (p === undefined) {
      const s = this.segments[i];
      const layout = LAYOUTS[s.biome.id];
      const bones = this.bones(i);
      p = null;
      if (layout && bones) {
        const kit = new Kit(this, s.z0, s.z1, i, rng(this.seed * 3301 + i * 7717), bones.beats ?? []);
        // (set aside first, so the plan's own puts see the ground without it)
        this.planCache.set(i, null);
        layout.plan(kit, bones);
        kit.props.sort((a, b) => b.z - a.z);
        p = { beats: kit.beats, props: kit.props, posts: kit.posts, routes: [...(bones.routes ?? []), ...kit.routes] };
      }
      this.planCache.set(i, p);
    }
    return p;
  }

  /** How much (x, z) is a dry bed or a worn track, 0..1 (for the ground's colour). */
  wash(x: number, z: number) {
    return this.bonesAt(z)?.wash?.(x, z) ?? 0;
  }

  /** The spots worth guarding between z0 and z1 (z1 < z0), from the plans. */
  posts(z0: number, z1: number): Post[] {
    const out: Post[] = [];
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (s.z1 > z0 || s.z0 < z1) continue;
      for (const p of this.plan(i)?.posts ?? []) if (p.z <= z0 && p.z > z1) out.push(p);
    }
    return out;
  }

  /** The routes through z, from the plans. */
  routes(z: number): Route[] {
    return this.plan(this.segmentAt(z))?.routes ?? [];
  }

  /**
   * The rock left standing on a canyon's floor near z: pillars of the wall's own stone, to slip
   * round. Each stretch of PILLAR_STEP has at most one: off to one side (the middle stays open),
   * or now and then right in the middle, splitting the canyon in two (then the racing line, see
   * lineX, swings round it).
   */
  pillars(z: number): Pillar[] {
    const planned = this.bonesAt(z)?.pillars;
    if (planned) return planned.filter((p) => Math.abs(p.z - z) < PILLAR_STEP * 1.5);
    const out: Pillar[] = [];
    const c0 = Math.floor(-z / PILLAR_STEP);
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      const p = this.pillar(c);
      if (p) out.push(p);
    }
    return out;
  }

  private pillar(cell: number): Pillar | null {
    if (cell < 4) return null; // a clear run-up
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
    const own = this.bones(i)?.height;
    if (own) return own(x, z);
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

  /**
   * Is the ground at (x, z) taken: inside an obstacle's columns, or under a set piece, a landmark
   * or a big tree or rock? (`pad`: the room the thing being put down needs.) For setting things on
   * the land, so a turret never stands in a pillar.
   */
  occupied(x: number, z: number, pad = 0) {
    for (const c of this.chunksBetween(z - 30, z + 30))
      for (const p of c.props) {
        for (const k of p.cols) if ((k.x - x) ** 2 + (k.z - z) ** 2 < (k.r + pad) ** 2) return true;
        if (p.obstacle || p.role === 'span') continue;
        let foot = p.foot;
        if (foot === undefined) {
          const m = metaOf(p.kind, p.variant);
          foot = m ? Math.min(m.max[0] - m.min[0], m.max[2] - m.min[2]) * p.s * 0.4 : 0;
        }
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < (foot + pad) ** 2) return true;
      }
    return false;
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
    const spread = SPREAD;

    // a laid-out biome: the chunk's share of its plan (and of any laid-out neighbour reaching in)
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      if (s.z1 > zNear || s.z0 <= zNear - CHUNK) continue;
      for (const p of this.plan(i)?.props ?? []) if (p.z <= zNear && p.z > zNear - CHUNK) props.push(p);
    }
    if (LAYOUTS[biome.id]) return { index, props, wildlife };

    // a landmark now and then: something big for the place, under the flight line, with room round it
    const field = FIELDS[biome.id];
    const scenery = biome.props.filter(([k]) => !isObstacle(k) && !field?.kinds.has(k));
    const marks: { x: number; z: number; r: number }[] = [];
    // a set piece: this chunk's, or a gate's next door (whose columns stand in for this one's obstacles)
    const set = start ? null : this.setPiece(index, bi, zNear);
    const crowded = !!set || this.setRole(index - 1) === 'gate' || this.setRole(index + 1) === 'gate';
    if (set) {
      props.push(set.p);
      if (set.p.role !== 'span') {
        marks.push({ x: set.p.x, z: set.p.z, r: set.foot });
        set.p.foot = set.foot;
      }
    }
    if (!start && !set && r() < LANDMARK_CHANCE) {
      const p = this.landmark(biome, zNear, r, bi);
      if (p) {
        props.push(p);
        p.foot = p.cols[0]?.r ?? 6;
        marks.push({ x: p.x, z: p.z, r: p.foot });
        p.cols = [];
      }
    }
    const inMark = (x: number, z: number, pad: number) => marks.some((m) => (m.x - x) ** 2 + (m.z - z) ** 2 < (m.r + pad) ** 2);

    // farmland: plots on a grid across the field, square to it, the scatter below left the tracks
    if (field) {
      const plots = biome.props.filter(([k]) => field.kinds.has(k));
      const [cw, cd] = field.cell;
      for (let gz = Math.ceil((zNear - CHUNK) / cd); gz * cd <= zNear; gz++) {
        const z = gz * cd;
        if (z <= zNear - CHUNK || this.segments[this.biomeIndex(z)].biome !== biome) continue;
        for (let gx = -Math.floor(spread / cw); gx * cw <= spread; gx++) {
          const x = gx * cw;
          if (r() < field.fallow || inMark(x, z, 4)) continue;
          const p = this.place(weighted(r, plots), x, z, r, this.biomeIndex(z));
          if (!p) continue;
          p.rot = r() < 0.5 ? 0 : Math.PI;
          p.s = 1;
          props.push(p);
          marks.push({ x, z, r: Math.min(cw, cd) * 0.42 });
        }
      }
    }

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
      // the patch's own kind (as often as its weight says; the noise is about even over 0.15 … 0.85), or
      // (less often) whatever grows here
      const patch = weightedAt((noise2(x * 0.017, z * 0.017, s0 + 4) - 0.15) / 0.7, scenery);
      const kind = r() < 0.6 ? patch[0] : weighted(r, scenery);
      const p = this.place(kind, x, z, r, this.biomeIndex(z));
      if (!p) continue;
      // in the thick of a grove they grow big; here and there, an old giant
      const big = smoothstep(0.55, 0.8, thick) * 0.35 + (r() < 0.05 ? 0.5 + r() * 0.4 : 0);
      if (big > 0.02) this.grow(p, 1 + big);
      props.push(p);
    }

    // obstacles: rows across the field that always leave gaps to fly through, a few of them, so
    // there's more than one line to take (and the tight ones are quicker)
    const tall = biome.props.filter(([k]) => isObstacle(k));
    if (tall.length && !start && !crowded) {
      const rows = r() < 0.6 ? 1 : 0;
      for (let row = 0; row < rows; row++) {
        const z = zNear - (row + 0.3 + r() * 0.4) * (CHUNK / rows);
        const canyon = biome.shape === 'canyon';
        // (not across a pillar: that's this stretch's obstacle)
        if (canyon && this.pillars(z).some((p) => Math.abs(p.z - z) < p.len + 10)) continue;
        const lo = canyon ? this.pathX(z) - this.pathHalf(z) : -HALF_W + 2;
        const hi = canyon ? this.pathX(z) + this.pathHalf(z) : HALF_W - 2;
        // one wide gap in each stretch of the row
        const stretches = canyon ? 1 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.4 ? 1 : 0);
        const gaps: { x: number; half: number }[] = [];
        for (let g = 0; g < stretches; g++) {
          const half = 5.5;
          const a = lerp(lo, hi, g / stretches) + half;
          const b = lerp(lo, hi, (g + 1) / stretches) - half;
          gaps.push({ x: lerp(a, Math.max(a, b), r()), half });
        }
        // walk along the row, filling in between the gaps
        const fill = 0.45;
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

    return { index, props, wildlife };
  }

  /** Scales scenery up by `k`, as far as it fits under the flight line. */
  private grow(p: Placed, k: number) {
    const h = metaHeight(metaOf(p.kind, p.variant));
    p.s = Math.max(p.s, Math.min(p.s * k, (FLIGHT_Y - 1.5 - p.y) / Math.max(h, 0.3)));
  }

  /** Which chunk of its slot has the slot's set piece, if any (-1: none), and its roll. */
  private setSlot(slot: number): { at: number; r: Rng } {
    const r = rng(this.seed * 6007 + slot * 92821);
    const at = slot * SET_SLOT + 1 + Math.floor(r() * (SET_SLOT - 2));
    const bi = this.biomeIndex(-at * CHUNK - CHUNK / 2);
    const look = lookOf(this.segments[bi].biome.id);
    const odds = Math.min(0.9, (look.setChance ?? 0.18) * SET_SLOT);
    return { at: look.sets.length && r() < odds ? at : -1, r };
  }

  /** The role of the set piece in chunk `index`, if it has one. */
  private setRole(index: number): SetRole | null {
    const { at, r } = this.setSlot(Math.floor(index / SET_SLOT));
    if (at !== index || index < 3) return null;
    return this.pickSet(this.biomeIndex(-index * CHUNK - CHUNK / 2), r)?.role ?? null;
  }

  private pickSet(bi: number, r: Rng) {
    const b = this.segments[bi].biome;
    let sets = lookOf(b.id).sets;
    // (a canyon is gate enough)
    if (b.shape === 'canyon') sets = sets.filter((s) => s.role !== 'gate');
    if (!sets.length) return null;
    return weighted(r, sets.map((s) => [s, s.w] as [typeof s, number]));
  }

  /**
   * The chunk's set piece, if its slot gave it one. Spans go right across, roughly centred; a gate
   * stands off to one side, half off the field, leaving the other side open; a giant lies
   * anywhere, as big as it was built (shrunk only to pass under you).
   */
  private setPiece(index: number, bi: number, zNear: number): { p: Placed; foot: number } | null {
    const { at, r } = this.setSlot(Math.floor(index / SET_SLOT));
    if (at !== index || index < 3) return null;
    const piece = this.pickSet(bi, r);
    if (!piece) return null;
    const vs = variants(piece.kind);
    if (!vs.length) return null;
    const variant = Math.floor(r() * vs.length);
    const m = vs[variant];
    const wide = m.max[0] - m.min[0];
    const deep = m.max[2] - m.min[2];
    const z = zNear - CHUNK * (0.35 + r() * 0.3);
    const canyon = this.segments[bi].biome.shape === 'canyon';
    let x = 0;
    let rot = 0;
    let s = 1;
    if (piece.role === 'span') {
      x = (canyon ? this.pathX(z) : 0) + (r() - 0.5) * 6;
      rot = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.08;
    } else if (piece.role === 'gate') {
      // its far edge a little past the field's, so the open side is the rest
      const side = r() < 0.5 ? -1 : 1;
      rot = side < 0 ? 0 : Math.PI;
      // (its bounds' middle there, however far off its origin it was built)
      x = side * (HALF_W + 5 - wide / 2) + (r() - 0.5) * 4 - ((m.min[0] + m.max[0]) / 2) * Math.cos(rot);
    } else {
      x = (r() - 0.5) * 44;
      rot = r() * Math.PI * 2;
    }
    const ground = this.height(x, z);
    const water = this.water(z);
    let y = piece.role === 'giant' ? Math.max(ground, water) - 0.2 : 0;
    if (piece.role === 'giant' && !m.colliders.length) {
      // under the flight line, whatever the ground's doing
      s = Math.min(1, (FLIGHT_Y - 1.5 - y) / Math.max(m.max[1], 0.3));
      if (s < 0.5) return null;
    }
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    // a gate's columns hit a little inside what you see of them: threading one should feel tight, not cheat you
    const give = piece.role === 'gate' ? 0.85 : 1;
    const cols = m.colliders.map((k) => ({ x: x + (k.x * c + k.z * sn) * s, z: z + (-k.x * sn + k.z * c) * s, r: k.r * s * give }));
    const p: Placed = { kind: piece.kind, variant, x, z, y, rot, s, obstacle: cols.length > 0, cols, biome: bi, role: piece.role };
    return { p, foot: Math.max(wide, deep) * s * 0.5 };
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

  place(kind: string, x: number, z: number, r: Rng, biome: number, obstacle = false): Placed | null {
    const ground = this.height(x, z);
    const water = this.water(z);
    const wet = ground < water - 0.1;
    if (WATERBORNE.has(kind)) {
      if (!wet && ground > water + (SHORE[kind] ?? 1.5)) return null; // too far up the shore
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
