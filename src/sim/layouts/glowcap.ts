/**
 * The Glowcap Forest: night on Mirefall under the violet giant (docs/level-design.md, its layout
 * row). The one place that wasn't formed but grown: it's all one organism, the bloom, the Tonkva's
 * mould a thousand years without instructions, and it's laid out the way mould grows. From where a
 * spore fell, outwards in rings; towards the wet; up into tower-caps, which fall and rot where they
 * lie; and now, since the Waking, here and there in straight lines and hexagons again. It's lit
 * from within: the caps are the lamps, the lane the dark between them.
 *
 * A level is a night's flight, in over the mire's edge and out through the mother ring, through
 * three grounds (or two, if the stretch is short), each grown by a rule of its own, so no two
 * nights fly alike:
 * - rings: fairy rings spreading out over the moss, small and whole where they're young, wide and
 *   broken into arcs where they're old, cut off where two meet (the mould won't grow into its own
 *   spent ground); dead moss inside, lush on the band; the lane threads one's middle;
 * - the hollows: a chain of dark pools the lane runs over, rises between, the caps fruiting thick
 *   on their margins at the sides;
 * - the stand: old growth, tower-caps you'd hit, an aisle wandering between them, young caps round
 *   their feet; one fallen across the aisle;
 * - the windfall: a stand the wind felled, its stalks rotted to lines of young caps all lying the
 *   one way, a stump at one end, puffballs where the cap lay; the newest still whole, across;
 * - the straightening: the Waking, the bloom planting itself in an exact hex lattice, the same
 *   cap over and over, turned the same way, fraying back to the wild at its edges;
 * - the wreck: the Tamsin Lowe's furrow, straight through the forest, earth heaped either side,
 *   her hull at its end, where the Choir speaks from.
 * And the mire for the whole night: a dry spell (the hollows dark beds of moss), wet, or flooded
 * (the moss under black water, the rings and stalks standing out of it). Clearings between.
 */

import type { Beat, Bones, Kit, Layout } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep, weighted } from '../../util';

/** The mire's level (the biome's own water, see world/planets.ts). */
const WATER = 0.5;
/** Half the dark aisle the forest leaves you (over three ship widths across). */
const AISLE = 6.5;

type Mire = 'dry' | 'wet' | 'flooded';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  edge: [30, 36],
  clearing: [18, 26],
  rings: [62, 76],
  hollows: [58, 72],
  stand: [56, 68],
  windfall: [54, 66],
  straight: [50, 62],
  wreck: [66, 78],
  mother: [46, 54],
};

/**
 * The moss's height, and a hollow's floor, by the mire. Water's always well under the moss or well
 * over it, never a film on it: a still mire, black to its edges, its banks steep.
 */
const MOSS: Record<Mire, number> = { dry: 1.6, wet: 1.45, flooded: 1.35 };
const HOLLOW: Record<Mire, number> = { dry: 0.95, wet: -0.7, flooded: -0.9 };
/** Drowned ground's floor, a flooded night. */
const DROWNED = WATER - 0.85;

/** A fairy ring: its middle, its radius, how its arcs break (old ones), and whether the lane goes through. */
interface Ring {
  x: number;
  z: number;
  r: number;
  /** 0 whole … 1 mostly gone: how broken its band is. */
  broken: number;
  seed: number;
  thru: boolean;
  /** Tower-caps on its band (the mother ring). */
  tall: boolean;
}
interface Pool {
  x: number;
  z: number;
  rx: number;
  rz: number;
  side: boolean;
}
interface Tower {
  x: number;
  z: number;
  s: number;
}
/** A rotted stalk: from its stump (x, z) along (ux, uz) for len. */
interface Log {
  x: number;
  z: number;
  ux: number;
  uz: number;
  len: number;
}
interface Net {
  z0: number;
  z1: number;
  /** Where its exact middle runs, and the hexes' size (middle to corner). */
  x: number;
  c: number;
  b: Beat;
}
interface Furrow {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  side: -1 | 1;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Forest extends Bones {
  mire: Mire;
  aisle(z: number): number;
  rings: Ring[];
  /** Is a ring's band there at (x, z) (not broken, not in another ring's spent ground)? */
  band(g: Ring, x: number, z: number): boolean;
  pools: Pool[];
  towers: Tower[];
  logs: Log[];
  /** The newest fall, still whole: across the field at z, turned rot. */
  falls: { z: number; rot: number }[];
  nets: Net[];
  /** A net's cell middles between z0 and z1, with how exact the net is there (0..1). */
  cells(n: Net): { x: number; z: number; e: number }[];
  furrows: Furrow[];
}

/** Distance from (x, z) to a segment, and how far along it (0..1). */
function seg(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return [Math.hypot(x - ax - dx * t, z - az - dz * t), t];
}

const SQ3 = Math.sqrt(3);

export const glowcap: Layout = {
  bones(seed, z0, z1) {
    const r = rng(Math.imul(seed * 7741 + Math.round(-z0) * 29 + 5, 0x9e3779b1) ^ 0x27d4eb2f);
    const s = seed % 983;

    const mire = weighted(r, [['dry', 3], ['wet', 4], ['flooded', 3]] as const) as Mire;
    const moss = MOSS[mire];
    const floor = HOLLOW[mire];

    // the grounds: one with a shape all its own (the stand's towers, the wreck, the net) and two
    // more of any kind; two if there's not room. A flooded night has more hollows
    // (the others are the forest's everyday grounds; only now and then a second one of the three)
    const signature = weighted(r, [['stand', 1], ['wreck', 1], ['straight', 1]] as const);
    const odd = r() < 0.2 ? [weighted(r, [['stand', 1], ['wreck', 1], ['straight', 1]] as const)] : [];
    const rest = shuffle(r, ['rings', 'rings', 'hollows', 'windfall', 'windfall', ...odd, ...(mire === 'flooded' ? ['hollows', 'hollows'] : mire === 'dry' ? ['rings'] : ['hollows'])].filter((g) => g !== signature));
    const pool = [signature, ...rest.filter((g, i) => rest.indexOf(g) === i)];
    // (the level's start keeps clear: an edge it starts on reaches back past it)
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.edge[0], first) - LEN.mother[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.clearing[0];
    const n = want(3) <= total ? 3 : 2;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['edge', ...grounds.flatMap((g, i) => (i ? ['clearing', g] : [g])), 'mother'];
    const least = seq.map((k) => LEN[k][0]);
    const most = seq.map((k) => LEN[k][1]);
    least[0] = Math.max(least[0], first);
    most[0] = Math.max(most[0], least[0]);
    let spare = z0 - z1 - least.reduce((a, b) => a + b, 0);
    const lens = least.map((l) => (spare < 0 ? (l * (z0 - z1)) / (z0 - z1 - spare) : l));
    for (let pass = 0; pass < 4 && spare > 0.5; pass++)
      for (let i = 0; i < seq.length && spare > 0.5; i++) {
        const add = Math.min(spare, (most[i] - lens[i]) * range(r, 0.4, 1));
        lens[i] += add;
        spare -= add;
      }
    // (whatever won't fit goes to the clearings, else the edge and the mother ring)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'clearing' ? i : -1)).filter((i) => i >= 0);
      const into = soak.length ? soak : [0, seq.length - 1];
      for (const i of into) lens[i] += spare / into.length;
    }
    const beats: Beat[] = [];
    let z = z0;
    seq.forEach((kind, i) => {
      const end = i === seq.length - 1 ? z1 : z - lens[i];
      beats.push({ kind, z0: z, z1: end, side: r() < 0.5 ? -1 : 1 });
      z = end;
    });
    const beatAt = (z: number) => beats.find((b) => z <= b.z0 && z > b.z1) ?? (z > z0 ? beats[0] : beats[beats.length - 1]);
    /** How far into beat b z is, eased in and out over `m` at its ends (0 outside). */
    const inside = (b: Beat, z: number, m: number) => smoothstep(0, m, Math.min(b.z0 - z, z - b.z1));

    // the aisle: the dark way the forest leaves, wandering; held to what each ground lays down
    // (through a ring's middle, down the furrow, straight down the net), and wandering wider
    // between the stand's towers
    const k1 = r() * 100;
    const k2 = r() * 100;
    const ax0 = (r() - 0.5) * 10;
    const wander = (z: number) => {
      const b = beatAt(z);
      const wide = b.kind === 'stand' ? inside(b, z, 14) : 0;
      return clamp(ax0 + (8 + wide * 5) * Math.sin(z * 0.014 + k1) + (3.5 + wide * 4) * Math.sin(z * 0.043 + k2), -16, 16);
    };
    /** Points the aisle's held to: `lin` pairs run straight between. */
    const anchors: { x: number; z: number; lin?: boolean }[] = [];

    const rings: Ring[] = [];
    const pools: Pool[] = [];
    const towers: Tower[] = [];
    const logs: Log[] = [];
    const falls: { z: number; rot: number }[] = [];
    const nets: Net[] = [];
    const furrows: Furrow[] = [];

    // first what holds the aisle
    for (const b of beats) {
      const len = b.z0 - b.z1;
      switch (b.kind) {
        case 'rings': {
          // the lane threads one old ring's middle
          const R = range(r, 12, 16);
          const x = b.side * range(r, 0, 8);
          const zr = b.z0 - len * range(r, 0.35, 0.6);
          rings.push({ x, z: zr, r: R, broken: range(r, 0.15, 0.35), seed: r() * 100, thru: true, tall: false });
          anchors.push({ x, z: zr });
          break;
        }
        case 'straight': {
          const x = b.side * range(r, 0, 6);
          const c = range(r, 6.5, 8);
          nets.push({ z0: b.z0 - 4, z1: b.z1 + 4, x, c, b });
          // (straight down it: the net's own line)
          anchors.push({ x, z: b.z0 - 6, lin: true }, { x, z: b.z1 + 6, lin: true });
          break;
        }
        case 'wreck': {
          // she came down along the forest, slewing to one side at the end
          const side = b.side;
          const xa = -side * range(r, 2, 9);
          const xb = xa + side * range(r, 8, 15);
          const fa = b.z0 - range(r, 6, 10);
          const fb = b.z1 + range(r, 14, 18);
          furrows.push({ x0: xa, z0: fa, x1: xb, z1: fb, side });
          anchors.push({ x: xa, z: fa, lin: true }, { x: xb, z: fb, lin: true });
          break;
        }
        case 'mother': {
          // the forest's oldest ring, where it all spread from: the way out is across its floor
          const R = range(r, 19, 23);
          const zr = b.z1 + R + range(r, 4, 10);
          const x = (r() - 0.5) * 6;
          rings.push({ x, z: Math.min(zr, b.z0 - R * 0.6), r: R, broken: 0, seed: r() * 100, thru: true, tall: true });
          anchors.push({ x, z: Math.min(zr, b.z0 - R * 0.6) });
          break;
        }
      }
    }
    anchors.sort((a, b) => b.z - a.z);
    const aisle = (z: number) => {
      const w = wander(z);
      const i = anchors.findIndex((a) => a.z < z);
      const a = i > 0 ? anchors[i - 1] : i < 0 ? anchors[anchors.length - 1] : null;
      const c = i >= 0 ? anchors[i] : null;
      if (a && c && a.z - c.z < 70) {
        const t = (a.z - z) / Math.max(1e-6, a.z - c.z);
        const x = lerp(a.x, c.x, a.lin && c.lin ? t : smooth(t));
        // (two anchors far apart wander a little between)
        const loose = a.lin && c.lin ? 0 : Math.sin(Math.PI * t) * smoothstep(30, 70, a.z - c.z);
        return lerp(x, w, loose);
      }
      // past the last (or before the first): held near it, loose further off
      const near = c && (!a || c.z - z > z - a.z) ? c : a ? a : c;
      if (!near) return w;
      return lerp(near.x, w, smoothstep(6, 30, Math.abs(near.z - z)));
    };
    const off = (x: number, z: number, m = AISLE) => Math.abs(x - aisle(z)) > m;

    // then each ground's own bones, round the aisle
    for (const b of beats) {
      const len = b.z0 - b.z1;
      switch (b.kind) {
        case 'rings':
        case 'clearing':
        case 'edge': {
          // spores fall and rings spread from them: wider the older, most of them young; a
          // clearing has a young one or none, the edge the first few
          const want = b.kind === 'rings' ? Math.round(len / 7) : b.kind === 'edge' ? 2 : r() < 0.6 ? 1 : 0;
          for (let k = 0, tries = 0; k < want && tries < want * 12; tries++) {
            const age = b.kind === 'rings' ? r() : r() * 0.35;
            const R = age < 0.4 ? range(r, 3, 5.5) : age < 0.75 ? range(r, 6.5, 10) : range(r, 11, 17);
            // (the old ones mostly out past the sides, arcing in: they frame the ground)
            const x = (r() < 0.5 ? -1 : 1) * (R > 10 ? range(r, HALF_W - 4, HALF_W + R * 0.6) : range(r, 6, HALF_W + R * 0.5));
            const zr = range(r, b.z1 + R * 0.4 + 4, b.z0 - R * 0.4 - 4);
            if (b.kind === 'edge' && zr > b.z0 - len * 0.5) continue;
            // (a young ring keeps off the aisle whole; an old one is broken where the lane crosses)
            if (R < 6 && Math.abs(x - aisle(zr)) < AISLE + R + 1) continue;
            // (two rings can meet, but not one inside another)
            if (rings.some((g) => Math.hypot(g.x - x, g.z - zr) < Math.max(g.r, R) * 0.85)) continue;
            rings.push({ x, z: zr, r: R, broken: R > 10 ? range(r, 0.25, 0.5) : R > 6 ? range(r, 0, 0.2) : 0, seed: r() * 100, thru: false, tall: false });
            k++;
          }
          break;
        }
        case 'hollows': {
          // a chain of pools the lane runs over, rises between; and pools out at the sides
          for (let zz = b.z0 - range(r, 6, 10); zz > b.z1 + 8; ) {
            const rz = range(r, 6, 10);
            const rx = range(r, 7, 11);
            pools.push({ x: aisle(zz - rz) + (r() - 0.5) * 6, z: zz - rz, rx, rz, side: false });
            zz -= rz * 2 + range(r, 3, 7);
          }
          for (const side of [-1, 1] as const)
            for (let zz = b.z0 - range(r, 4, 14); zz > b.z1 + 6; zz -= range(r, 16, 26)) {
              const x = side * range(r, 20, HALF_W + 4);
              if (!off(x, zz, AISLE + 10)) continue;
              pools.push({ x, z: zz, rx: range(r, 5, 9), rz: range(r, 4, 7), side: true });
            }
          break;
        }
        case 'stand': {
          // tower-caps spaced as old trees space themselves (each keeps its own ground), off the aisle
          // (a column either side of the aisle, the old ones it was cut between; more out at the field's
          // edges, half out of sight: few enough that each is a form, not a wall)
          const gap = range(r, 16, 18);
          for (let tries = 0; tries < 420; tries++) {
            const zt = range(r, b.z1 + 5, b.z0 - 5);
            const sc = range(r, 0.9, 1.2);
            const side = r() < 0.5 ? -1 : 1;
            const x = r() < 0.6 ? aisle(zt) + side * (AISLE + 6.5 * sc + range(r, 0, 3)) : side * range(r, HALF_W - 2, HALF_W + 10);
            if (!off(x, zt, AISLE + 6.5 * sc)) continue;
            // (the mother ring's towers are the last screen's; none of the stand's on it)
            if (rings.some((g) => g.tall && Math.abs(zt - g.z) < g.r + 24)) continue;
            if (towers.some((t) => Math.hypot(t.x - x, t.z - zt) < gap * (0.8 + 0.2 * (t.s + sc) * 0.5))) continue;
            towers.push({ x, z: zt, s: sc });
          }
          // one fallen across the aisle
          const fz = b.z0 - len * range(r, 0.4, 0.65);
          if (len > 50 && !rings.some((g) => g.tall && Math.abs(fz - g.z) < g.r + 28)) falls.push({ z: fz, rot: (r() - 0.5) * 0.35 });
          break;
        }
        case 'windfall': {
          // the wind came from one side: every stalk lies the same way, crossing the field
          const ang = b.side * range(r, 0.15, 0.55);
          const ux = Math.cos(ang) * -b.side;
          const uz = Math.sin(ang) * b.side;
          for (let zz = b.z0 - range(r, 4, 7); zz > b.z1 + 4; zz -= range(r, 7, 10)) {
            // (most long enough to lie across the lane: it's flown over the stalks, not between them)
            const L = range(r, 32, 54);
            // (the stumps anywhere from the windward edge to past the middle, all lying downwind)
            const x = b.side * range(r, -14, HALF_W + 8);
            logs.push({ x, z: zz, ux, uz, len: L });
          }
          if (len > 50) falls.push({ z: b.z0 - len * range(r, 0.3, 0.7), rot: ang * 0.8 });
          break;
        }
      }
    }

    /** A ring's band at (x, z): there unless broken here or in another ring's spent ground. */
    const band = (g: Ring, x: number, z: number) => {
      if (g.broken > 0) {
        const a = Math.atan2(z - g.z, x - g.x);
        if (noise2(Math.cos(a) * 1.6 + g.seed, Math.sin(a) * 1.6, 7) < g.broken) return false;
      }
      for (const o of rings) if (o !== g && !o.tall && Math.hypot(x - o.x, z - o.z) < o.r - 0.6) return false;
      return true;
    };

    const shoreAt = (x: number, z: number) => {
      const b = beats[0];
      if (z < b.z1 || b.kind !== 'edge') return 1;
      const len = b.z0 - b.z1;
      // (ahead of the start, so the level opens over the mire with the forest rising out of it)
      const line = b.z0 > 0 ? Math.min(b.z0 - len * 0.42, -14) : b.z0 - len * 0.42;
      return smoothstep(-1.2, 1.2, line - z + (fbm(x * 0.05, z * 0.03, s + 5) - 0.5) * 14 + Math.sin(x * 0.11 + k1) * 3);
    };

    const exact = (n: Net, x: number, z: number) => {
      const raw = inside(n.b, z, 14) * (1 - smoothstep(12, 34, Math.abs(x - n.x)));
      return smoothstep(0.3, 0.65, raw + (noise2(x * 0.09, z * 0.09, s + 31) - 0.5) * 0.6);
    };
    const netAt = (z: number) => nets.find((n) => z <= n.b.z0 && z > n.b.z1);

    const height = (x: number, z: number) => {
      // the moss: soft, rolling a little
      let h = moss + (fbm(x * 0.045, z * 0.045, s) - 0.5) * 0.6;
      // a flooded night: the low ground drowned, black water winding between banks of moss
      if (mire === 'flooded') h = lerp(h, DROWNED, 1 - smoothstep(0.43, 0.47, fbm(x * 0.028, z * 0.028, s + 17)));
      // the mire at the forest's edge
      const sh = shoreAt(x, z);
      if (sh < 1) h = lerp(DROWNED + fbm(x * 0.08, z * 0.08, s + 3) * 0.2, h, sh);
      /** Stood up out of the water (a flooded night's islands) where k is: a bank, not a slope. */
      const dry = (k: number) => {
        if (k > 0) h = lerp(h, Math.max(h, MOSS.wet), smoothstep(0.25, 0.55, k));
      };
      // the rings' bands: lush and a little heaped; the spent ground inside a shade lower
      for (const g of rings) {
        if (Math.abs(z - g.z) > g.r + 3) continue;
        const d = Math.hypot(x - g.x, z - g.z);
        if (d > g.r + 3) continue;
        const k = (1 - smoothstep(0.6, 2.4, Math.abs(d - g.r))) * (band(g, x, z) ? 1 : 0.25);
        h += 0.28 * k;
        dry(k);
        if (d < g.r - 1) h -= 0.1;
      }
      // the pools
      for (const p of pools) {
        if (Math.abs(z - p.z) > p.rz * 2) continue;
        // (ragged: a hollow's edge wanders, in lobes and inlets)
        const w = (fbm(x * 0.06, z * 0.06, s + 13) - 0.5) * 1.1 + (noise2(x * 0.22, z * 0.22, s + 14) - 0.5) * 0.25;
        const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) + w;
        if (d > 1.4) continue;
        // (a lip of moss round the edge, then down)
        h = d < 1 ? lerp(floor, h, smoothstep(0.8, 1, d)) : h + 0.22 * (1 - smoothstep(1.05, 1.4, d));
      }
      // the towers' feet: roots heaped round each
      for (const t of towers) {
        if (Math.abs(z - t.z) > 5) continue;
        const d = Math.hypot(x - t.x, z - t.z);
        if (d > 5) continue;
        const k = 1 - smoothstep(1.2, 5, d);
        h += 0.5 * k;
        dry(k);
      }
      // the rotted stalks: a low welt along each, the stump heaped
      for (const lg of logs) {
        const [d, t] = seg(x, z, lg.x, lg.z, lg.x + lg.ux * lg.len, lg.z + lg.uz * lg.len);
        if (d > 4) continue;
        const k = (1 - smoothstep(0.6, 2.2, d)) * (1 - t * 0.4);
        h += 0.25 * k + 0.9 * (1 - smoothstep(0.8, 3.6, Math.hypot(x - lg.x, z - lg.z)));
        dry(k);
      }
      // the lattice keeps its ground dry
      const n = netAt(z);
      if (n) {
        const e = exact(n, x, z);
        if (e > 0) dry(e);
      }
      // the furrow: gouged down the middle, the earth heaped either side, deeper as she slowed
      for (const f of furrows) {
        if (z > f.z0 + 6 || z < f.z1 - 8) continue;
        const [d, t] = seg(x, z, f.x0, f.z0, f.x1, f.z1);
        if (d > 9) continue;
        const deep = 0.4 + t * 0.6;
        h -= 0.45 * deep * (1 - smoothstep(2.5, 4.2, d));
        h += 0.85 * deep * Math.exp(-((d - 5.4) ** 2) * 0.7);
        dry(1 - smoothstep(3, 7, d));
      }
      return h;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      const sh = shoreAt(x, z);
      if (sh < 0.7) return [0x26302e, 0.4 * (1 - sh)];
      // the furrow's bare earth, the heaps either side
      for (const f of furrows) {
        if (z > f.z0 + 6 || z < f.z1 - 8) continue;
        const [d] = seg(x, z, f.x0, f.z0, f.x1, f.z1);
        if (d < 4.2) return [0x110d14, 0.85 * (1 - smoothstep(3, 4.2, d))];
        // (the earth she turned up, pale clay over the moss)
        if (d < 7.5) return [0x6a5684, 0.65 * (1 - smoothstep(6, 7.5, d)) * smoothstep(3.8, 4.6, d)];
      }
      // the rings: the band lush, the spent ground inside dark
      for (const g of rings) {
        if (Math.abs(z - g.z) > g.r + 2.5) continue;
        const d = Math.hypot(x - g.x, z - g.z);
        if (d > g.r + 2.5) continue;
        if (Math.abs(d - g.r) < 2.2 && band(g, x, z)) return [0x3a7a72, 0.75 * (1 - smoothstep(1.2, 2.2, Math.abs(d - g.r)))];
        if (d < g.r - 1.5) return [0x1e1a2c, 0.4 * smoothstep(0, 2, g.r - 1.5 - d)];
      }
      // a dry hollow's bed: dark damp moss
      if (mire === 'dry')
        for (const p of pools) {
          if (Math.abs(z - p.z) > p.rz * 1.2) continue;
          const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
          if (d < 1.1) return [0x1a2030, 0.6 * (1 - smoothstep(0.7, 1.1, d))];
        }
      // the rotted stalks: a soft dark rot under each row of caps, fading towards the cap end
      // where it's longest gone (the caps draw the line, not the ground)
      for (const lg of logs) {
        const [d, t] = seg(x, z, lg.x, lg.z, lg.x + lg.ux * lg.len, lg.z + lg.uz * lg.len);
        if (d < 2.2) return [0x2e2634, 0.45 * (1 - smoothstep(0.8, 2.2, d)) * (1 - 0.4 * t)];
      }
      // under the towers' caps: their shade
      for (const t of towers) {
        if (Math.abs(z - t.z) > 6.5) continue;
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < 6.5) return [0x16141f, 0.45 * (1 - smoothstep(3.5, 6.5, d))];
      }
      return null;
    };

    const cells = (nt: Net) => {
      const out: { x: number; z: number; e: number }[] = [];
      const c = nt.c;
      for (let rz = Math.floor(nt.z1 / (1.5 * c)) - 1; rz <= Math.ceil(nt.z0 / (1.5 * c)) + 1; rz++)
        for (let rx = -12; rx <= 12; rx++) {
          const x = nt.x + c * SQ3 * (rx + rz / 2);
          const z = c * 1.5 * rz;
          if (z > nt.z0 || z < nt.z1 || Math.abs(x) > HALF_W + 8) continue;
          const e = exact(nt, x, z);
          if (e > 0.1) out.push({ x, z, e });
        }
      return out;
    };

    const bones: Forest = { height, stain, beats, mire, aisle, rings, band, pools, towers, logs, falls, nets, cells, furrows };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Forest);
  },
};

/** The Tamsin Lowe: her aft, her bay, her bow, and a plate she shed. */
const HULL = 'mirefall_tamsin_lowe';
/** The caps the bloom fruits in, the young and the small, and what grows on the rot. */
const CAPS = [['glowcap', 4], ['mirefall_inkcap', 1.2]] as const;
const YOUNG = [['mirefall_inkcap', 2], ['glowcap', 1.2], ['mirefall_puffball', 1]] as const;
const ROT = [['mirefall_puffball', 3], ['mirefall_moss_bed', 1.2], ['mirefall_inkcap', 1]] as const;
const MARGIN = [['glowcap', 3], ['fungus_coral', 1], ['mirefall_moss_bed', 1.5], ['mirefall_inkcap', 1]] as const;

function plan(kit: Kit, b: Forest) {
  const r = kit.r;
  const off = (m: number) => (x: number, z: number) => Math.abs(x - b.aisle(z)) > m && Math.abs(x) < HALF_W + 10;
  const clear = off(AISLE);

  /** Caps round a ring's band, the lane's gap left open, guns either side of the gap where it's the lane's. */
  const ring = (g: Ring) => {
    const young = g.r < 6;
    // (close enough that the caps touch: it reads as a ring, not a few caps)
    const step = g.tall ? range(r, 12, 13.5) : young ? range(r, 2, 2.4) : g.r > 9 ? range(r, 4.8, 5.6) : range(r, 3.8, 4.4);
    const n = Math.max(6, Math.round((Math.PI * 2 * g.r) / step));
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.08;
      const x = g.x + Math.cos(a) * g.r;
      const z = g.z + Math.sin(a) * g.r;
      if (!b.band(g, x, z) || !clear(x, z) || Math.abs(x) > HALF_W + 12) continue;
      if (g.tall) {
        kit.solid('glowcap_tall', x, z, range(r, 0.95, 1.15), r() * Math.PI * 2);
        continue;
      }
      // (the old rings' fruit bigger, a tower-cap here and there on the widest)
      if (g.r > 11 && r() < 0.12 && off(AISLE + 7)(x, z)) {
        kit.solid('glowcap_tall', x, z, range(r, 0.85, 1), r() * Math.PI * 2);
        continue;
      }
      const kind = young ? weighted(r, YOUNG) : weighted(r, CAPS);
      kit.put(kind, x, z, { s: young ? range(r, 0.5, 0.7) : g.r > 9 ? 'fit' : range(r, 0.75, 0.9), overlap: true });
    }
    // between the big ones on the mother ring, caps; and a puff of spores off a few
    if (g.tall)
      for (let k = 0; k < n; k++) {
        const a = a0 + ((k + 0.5) / n) * Math.PI * 2;
        const x = g.x + Math.cos(a) * g.r;
        const z = g.z + Math.sin(a) * g.r;
        if (clear(x, z)) kit.group(x, z, { kinds: CAPS, n: 3, spread: 3, big: 'fit', small: 0.55, keep: clear });
      }
    for (let k = 0; k < Math.round(g.r / 5); k++) {
      const a = r() * Math.PI * 2;
      const x = g.x + Math.cos(a) * g.r;
      const z = g.z + Math.sin(a) * g.r;
      if (b.band(g, x, z)) kit.emit('spores', x, z);
    }
    // where the lane crosses its band: guns rooted either side of the gap
    if (g.thru)
      for (const zz of g.tall ? [g.z - g.r] : [g.z + g.r, g.z - g.r]) {
        const m = b.aisle(zz);
        for (const side of [-1, 1]) if (r() < (g.tall ? 1 : 0.6)) kit.post(m + side * (AISLE + 2.5), zz, 0, 'ring');
      }
  };

  /**
   * The forest massed at the field's sides, framing whatever the ground is doing in the middle:
   * families of caps, the big ones out at the edge, every few units down the beat.
   */
  const sides = (bt: Beat, from = 0, to = 1) => {
    for (const side of [-1, 1])
      for (let z = bt.z0 - (bt.z0 - bt.z1) * from - range(r, 2, 6); z > bt.z0 - (bt.z0 - bt.z1) * to; z -= range(r, 8, 12)) {
        const x = side * range(r, HALF_W - 6, HALF_W + 6);
        kit.group(x, z, { kinds: CAPS, n: 3 + Math.floor(r() * 4), spread: 4.5, big: 'fit', small: 0.55, keep: off(AISLE + 4) });
      }
  };

  // the rings first (the big forms of the ground): the forest's own spreading, wherever they fell: the forest's own spreading, wherever they fell
  for (const g of b.rings) ring(g);

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    // (only the way in: everywhere else the ground frames itself, so each reads as its own place)
    if (bt.kind === 'edge') sides(bt, 0.55);
    switch (bt.kind) {
      case 'edge': {
        // the forest's edge over the mire: moss at the waterline, the first young caps, a ring starting
        for (let k = 0, n = 4 + Math.floor(r() * 3); k < n; k++) {
          const z = bt.z0 - len * (0.5 + (k / n) * 0.5) + (r() - 0.5) * 4;
          const x = (r() < 0.5 ? -1 : 1) * range(r, 14, HALF_W + 4);
          kit.group(x, z, { kinds: k % 2 ? YOUNG : MARGIN, n: 3 + Math.floor(r() * 3), spread: 3.5, big: k % 2 ? 0.8 : 'fit', small: 0.45, keep: clear });
        }
        break;
      }
      case 'clearing': {
        // a breather: a family of caps far out to each side, little else
        for (const side of [-1, 1])
          if (r() < 0.7) kit.group(side * range(r, 26, HALF_W + 6), bt.z0 - len * range(r, 0.3, 0.7), { kinds: CAPS, n: 3 + Math.floor(r() * 3), spread: 4, big: 'fit', small: 0.5, keep: clear });
        break;
      }
      case 'hollows': {
        // the caps fruit thick on the pools' margins, on the side away from the lane; moss and
        // brood sacs down at the water; out at the sides, pools ringed with them
        for (const p of b.pools) {
          if (p.z > bt.z0 || p.z < bt.z1) continue;
          const away = p.side ? 0 : Math.sign(p.x - b.aisle(p.z)) || 1;
          for (let k = 0, n = p.side ? 4 : 3; k < n; k++) {
            const a = p.side ? r() * Math.PI * 2 : (away > 0 ? 0 : Math.PI) + (r() - 0.5) * 2.2;
            const x = p.x + Math.cos(a) * (p.rx + 2.2);
            const z = p.z + Math.sin(a) * (p.rz + 2.2);
            if (!off(AISLE + 2)(x, z)) continue;
            kit.group(x, z, { kinds: MARGIN, n: 3 + Math.floor(r() * 4), spread: 3.5, big: 'fit', small: 0.5, keep: off(AISLE + 1) });
          }
          if (b.mire !== 'dry') {
            kit.emit('bubble', p.x + (r() - 0.5) * p.rx, p.z);
            if (p.side && r() < 0.5) kit.put('mirefall_brood_sac', p.x + p.rx + 1, p.z, { s: 0.9 });
          }
          if (!p.side && r() < 0.55) {
            const side = r() < 0.5 ? -1 : 1;
            const x = p.x + side * (p.rx + 1.5);
            if (off(AISLE + 1)(x, p.z)) kit.post(x, p.z, 0, 'pool');
          }
        }
        // the rises between: a cap or two standing alone
        for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= range(r, 8, 14)) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 12, HALF_W);
          if (off(AISLE + 3)(x, z)) kit.put('glowcap', x, z, { s: 'fit' });
        }
        break;
      }
      case 'stand': {
        for (const t of b.towers) {
          if (t.z > bt.z0 || t.z < bt.z1) continue;
          if (!kit.solid('glowcap_tall', t.x, t.z, t.s, r() * Math.PI * 2)) continue;
          // young caps round the old one's feet, the side towards the lane thinner
          if (r() < 0.75) {
            const a = r() * Math.PI * 2;
            kit.group(t.x + Math.cos(a) * 4, t.z + Math.sin(a) * 3.5, { kinds: YOUNG, n: 2 + Math.floor(r() * 4), spread: 2.8, big: 0.8, small: 0.4, keep: clear });
          }
          if (r() < 0.3) kit.emit('spores', t.x, t.z);
        }
        // the aisle's guns at the towers' feet beside it
        const near = b.towers.filter((t) => t.z <= bt.z0 && t.z > bt.z1 && Math.abs(t.x - b.aisle(t.z)) < AISLE + 12);
        for (const t of shuffle(r, near).slice(0, 3)) {
          const side = Math.sign(b.aisle(t.z) - t.x);
          kit.post(t.x + side * 3.2, t.z + 2, 0, 'stand');
        }
        break;
      }
      case 'windfall': {
        for (const lg of b.logs) {
          if (lg.z > bt.z0 + 4 || lg.z < bt.z1 - 4) continue;
          // the stump, heaped with rot
          kit.group(lg.x, lg.z, { kinds: ROT, n: 3 + Math.floor(r() * 3), spread: 2.5, big: 1.1, small: 0.5, keep: clear });
          // caps in a line down each flank of the rotted stalk, oldest by the stump and younger
          // towards the cap end, broken where the lane's gone through
          let flank = r() < 0.5 ? 1 : -1;
          for (let t = 3; t < lg.len; t += range(r, 2.4, 3.2)) {
            flank = -flank;
            const x = lg.x + lg.ux * t - lg.uz * flank * 1.5;
            const z = lg.z + lg.uz * t + lg.ux * flank * 1.5;
            if (!clear(x, z)) continue;
            const age = 1 - t / lg.len;
            const big = age > 0.6 && r() < 0.5;
            kit.put(big ? 'glowcap' : weighted(r, YOUNG), x, z, { s: big ? range(r, 0.7, 0.9) : 0.4 + 0.3 * age + r() * 0.1, rot: r() * Math.PI * 2, overlap: true });
          }
          // where the cap came down: puffballs in a round, spores off them
          const cx = lg.x + lg.ux * (lg.len + 3);
          const cz = lg.z + lg.uz * (lg.len + 3);
          if (clear(cx, cz) && r() < 0.6) {
            kit.group(cx, cz, { kinds: [['mirefall_puffball', 1]], n: 4 + Math.floor(r() * 3), spread: 3.2, big: 0.9, small: 0.45, keep: clear });
            kit.emit('spores', cx, cz);
          }
          if (r() < 0.35 && off(AISLE + 1)(lg.x, lg.z)) kit.post(lg.x + Math.sign(-lg.x) * 2, lg.z - 2, 0, 'stump');
        }
        break;
      }
      case 'straight': {
        for (const n of b.nets) {
          if (n.b !== bt) continue;
          // the same cap over and over, the same size, turned the same way, one to a cell: it copies
          // what it touches; where the lattice frays they wander off the mark and go wild again
          const rot = r() * Math.PI * 2;
          const v = Math.floor(r() * 5);
          const cs = b.cells(n);
          for (const c of cs) {
            const j = (1 - c.e) * n.c * 0.45;
            const x = c.x + (r() - 0.5) * 2 * j;
            const z = c.z + (r() - 0.5) * 2 * j;
            if (!clear(x, z)) continue;
            if (c.e > 0.6) kit.put('glowcap', x, z, { s: 1.1, rot, variant: v, overlap: true });
            else if (r() < c.e + 0.25) kit.put(weighted(r, CAPS), x, z, { s: range(r, 0.5, 0.9), overlap: true });
          }
          // the guns in pairs, either side of the lane, the same distance out
          const zs = cs.filter((c) => c.e > 0.7).map((c) => c.z);
          for (let k = 0; k < 2 && zs.length; k++) {
            const z = zs[Math.floor(r() * zs.length)];
            const m = b.aisle(z);
            for (const side of [-1, 1]) kit.post(m + side * (AISLE + n.c * 0.6), z, 0, 'net');
          }
          // fraying back to the wild at its edges: caps in their own groups again
          for (let k = 0; k < 6; k++) {
            const x = (r() < 0.5 ? -1 : 1) * range(r, 22, HALF_W + 6);
            const z = range(r, bt.z1 + 4, bt.z0 - 4);
            kit.group(x, z, { kinds: CAPS, n: 3 + Math.floor(r() * 3), spread: 3.5, big: 'fit', small: 0.5, keep: clear });
          }
        }
        break;
      }
      case 'wreck': {
        for (const f of b.furrows) {
          if (f.z0 > bt.z0 + 1 || f.z1 < bt.z1 - 1) continue;
          const dx = f.x1 - f.x0;
          const dz = f.z1 - f.z0;
          const l = Math.hypot(dx, dz);
          const nx = -dz / l;
          const nz = dx / l;
          // the forest standing thick either side of the heaps, as it stood when she came through
          for (let t = 0.05; t < 1; t += range(r, 0.09, 0.14))
            for (const side of [-1, 1]) {
              const d = range(r, 9, 13);
              kit.group(f.x0 + dx * t + nx * side * d, f.z0 + dz * t + nz * side * d, { kinds: CAPS, n: 3 + Math.floor(r() * 3), spread: 3.5, big: 'fit', small: 0.5, keep: off(AISLE + 2) });
            }
          // the plates she shed on the way, on the heaps
          for (let k = 0; k < 5; k++) {
            const t = range(r, 0.15, 0.9);
            const side = r() < 0.5 ? -1 : 1;
            kit.put(HULL, f.x0 + dx * t + nx * side * 5.8, f.z0 + dz * t + nz * side * 5.8, { s: range(r, 0.8, 1.1), variant: 2, overlap: true });
          }
          // regrowth down the furrow: moss, and young caps keeping low
          for (let t = 0.1; t < 0.95; t += range(r, 0.12, 0.2)) {
            const side = r() < 0.5 ? -1 : 1;
            const x = f.x0 + dx * t + nx * side * 3.4;
            const z = f.z0 + dz * t + nz * side * 3.4;
            kit.put(r() < 0.6 ? 'mirefall_moss_bed' : 'mirefall_puffball', x, z, { s: range(r, 0.5, 0.8), overlap: true });
          }
          // her hull at the end, broken in three where she stopped, each section slewed further off
          // the line than the last, the way she slewed (one model: the variant bends to her side);
          // her engines to the furrow (she lies along +x in the model; turned th, +x points
          // (cos th, -sin th) here)
          const th0 = Math.atan2(-dz / l, dx / l) + f.side * 0.12;
          const a0x = Math.cos(th0);
          const a0z = -Math.sin(th0);
          const hx = f.x1 + a0x * 11;
          const hz = f.z1 + a0z * 11;
          kit.set(HULL, 'giant', hx, hz, th0, f.side > 0 ? 0 : 1);
          // (where her bay lies, roughly: the spores rise out of it)
          const mx = hx + a0x * 15 - a0z * f.side * 3;
          const mz = hz + a0z * 15 + a0x * f.side * 3;
          kit.group(hx - a0z * f.side * 8, hz + a0x * f.side * 8, { kinds: CAPS, n: 4, spread: 4, big: 0.9, small: 0.5, keep: off(AISLE + 1) });
          kit.emit('spores', mx, mz);
          kit.emit('breath', hx + a0x * 7, hz + a0z * 7);
          // (the Choir's guns either side of her, where you come up the furrow at her)
          kit.post(hx - a0z * 8, hz + a0x * 8, 0, 'wreck');
          kit.post(hx + a0z * 8, hz - a0x * 8, 0, 'wreck');
        }
        break;
      }
    }
  }

  // the newest falls, still whole: right across the field, you fly under them
  for (const f of b.falls) kit.set('mirefall_fallen_stalk', 'span', 0, f.z, f.rot, 0);
}
