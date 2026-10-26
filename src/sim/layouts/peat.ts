/**
 * The Peat Marsh: Morang's lowland bog (docs/level-design.md, its layout row). A raised mire of
 * rust-red and ochre moss over black water, fog lying in its hollows, under the violet giant's grey
 * daylight. Three hands on it, and every line here is one of theirs:
 * - the mire's own curves: its pools and strings laid across the slope like contour lines, its moss
 *   heaped in hummocks, the slough winding through it, and the wood that drowned standing when the
 *   water came back, silver snags in black water;
 * - the Compact's straight lines, from the two years (169–171 L) its settlers drained this ground to
 *   farm it: a main drain dead straight, side drains square off it, dikes, the poplars they planted
 *   along the drains drowned in their rows, the pump-house at the outfall, the cabins of the farm;
 * - the Rang's, who come out from the temple to cut peat for its hearth-lamps: the banks they cut
 *   back in steps, the old cuts flooded in rows, turves stacked to dry, plank trackways out to the
 *   banks with a way-pole and its lamp at every turn, their turf huts and punts.
 *
 * A level is a crossing, in out of the fog over the open mere between the sentinels (the drowned
 * wood's two eldest, taller than you fly) and out along the cutters' trackway, its poles leading
 * off to the temple; through three grounds of six (two if the stretch is short), each formed its
 * own way, so no two crossings fly alike:
 * - the strings: the patterned bog, ridges of moss bowed across the way one after another with
 *   long dark pools between them, the way crossing them like the lines of a map;
 * - the stand: the drowned wood, grey trunks standing in black water on their root mounds, fog
 *   among them, the trunks the wind threw down all lying the one way, an aisle wandering through;
 * - the slough: a black river meandering through the moss, its cut banks of peat on the outsides of
 *   the bends and pale point bars on the insides, an oxbow left behind, the way down its water;
 * - the cuttings: the Rang's peat banks either side of their canal, cut back in steps, the old cuts
 *   flooded in rows, turves drying on the floor, huts and poles up on the uncut bog;
 * - the polder: the Compact's farm gone back to bog: the main drain the way runs down, its dikes,
 *   side drains square off it, fields of sedge, bloom and flood, the rows of drowned poplars, the
 *   pump-house and its wind-pump, the farmstead;
 * - the hags: where the bog dried and the rain cut into it: a maze of peat islands, sheer dark
 *   sides and heather on their caps, the gullies between them branching down to the way's own,
 *   the bog oaks the erosion has uncovered lying bare on their floors.
 * And the year for the whole crossing: dry (the pools shrunk, the moss high, the hags likely), wet,
 * or flood (the strings awash, the cuts and the fields under). Open mere between the grounds, rafts
 * of moss and lone snags on it: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Year = 'dry' | 'wet' | 'flood';

/** The mire's water (the biome's own, see world/planets.ts). */
const WATER = 0.3;
/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  mouth: [30, 36],
  breather: [16, 24],
  strings: [58, 90],
  stand: [64, 100],
  slough: [68, 106],
  cuttings: [58, 88],
  polder: [66, 100],
  hags: [52, 80],
  out: [26, 32],
};
/** How far the moss stands over the water, by the year. */
const LAWN: Record<Year, number> = { dry: 0.45, wet: 0.3, flood: 0.08 };
/** How much of the gaps between the strings is pool, by the year. */
const POOLS: Record<Year, number> = { dry: 0.35, wet: 0.6, flood: 0.9 };
/** Half the way kept open (over three ship widths across). */
const LANE = 7.5;
/** The uncut bog behind the Rang's banks, over the water; the cut-over floor in front of them. */
const BANK = 1.5;
const FLOOR = 0.12;
/** The polder: the main drain's half width, its dikes' crest, how far out they reach. */
const DRAIN = 2.0;
const DIKE = 1.0;
const DIKE_OUT = 5.4;

// the colours painted into the ground
/** The moss: ochre, olive, rust; its hummocks red; the strings' tops rust-red. */
const OCHRE = 0x9a8856;
const OLIVE = 0x72764a;
const RUSTMOSS = 0x7c5640;
const RED = 0x7c5038;
const STRING_TOP = 0x986a46;
const WETMUD = 0x2c2a22;
const SILT = 0x948a6c;
const SEDGE = 0x77704a;
/** Peat: its cut faces dark, banded where the years lie; the floor where it's been cut; turves. */
const PEAT = 0x3a2a22;
const PEAT_BAND = 0x4c382a;
const CUTFLOOR = 0x66503c;
const TURF = 0x553e2e;
/** The uncut bog's lip along the top of a bank: its moss dried pale. */
const LIP = 0xa8956a;
/** The polder: the dikes' grass, the track worn along their crest, the fields. */
const DIKE_GRASS = 0x66683e;
const DIKE_TRACK = 0x857660;
const FURROW = [0x5c5636, 0x6a6640] as const;
const BLOOM = 0x6e5a58;
const BLOOM_EDGE = 0x7c6a5c;
const YARD = 0x6e6252;
/** The hags: their gullies' bare peat floors, wet and dry. */
const GULLY = 0x8a7258;
const GULLY_WET = 0x6a5644;
/** Heather on the high dry moss and the hags' tops. */
const HEATHER = 0x5e4450;

interface Tree {
  x: number;
  z: number;
  s: number;
  /** An elder (taller than you fly, see the sentinels), or a snag of one of its builds. */
  elder: boolean;
}
interface Stand {
  z0: number;
  z1: number;
  trees: Tree[];
  /** Which way the wind threw the fallen ones (radians, along which their tops lie). */
  wind: number;
}
interface Strings {
  z0: number;
  z1: number;
  /** The strings' pitch (along z), half width, bow (how far the middle sags downstream), tilt, origin. */
  pitch: number;
  width: number;
  bow: number;
  tilt: number;
  x: number;
  zc: number;
}
interface Slough {
  z0: number;
  z1: number;
  x(z: number): number;
  half(z: number): number;
  /** The oxbows the river left behind: middle, radius, the way its open side faces. */
  bows: { x: number; z: number; r: number; open: number }[];
}
interface Cuttings {
  z0: number;
  z1: number;
  x: number;
  /** The canal's half width. */
  canal: number;
  /** Each side's banks: from z0 to z1, its face this far out from the canal's middle. */
  banks: Record<'-1' | '1', { z0: number; z1: number; at: number }[]>;
  /** The old cuts on the floor: pitch along z, the first. */
  pitch: number;
  gz: number;
}
interface Polder {
  z0: number;
  z1: number;
  /** The main drain: through (x0, zc), leaning θ off the way. */
  x0: number;
  zc: number;
  th: number;
  /** The side drains' pitch along the main, and the first. */
  pitch: number;
  off: number;
  /** The farmstead's side, and its yard in the drain's frame (across u0..u1, along v0..v1). */
  farm: { side: -1 | 1; u0: number; u1: number; v0: number; v1: number };
  /** The pump-house: its side, how far along. */
  pump: { side: -1 | 1; v: number };
  /** The side drains with a shelterbelt along them (by index), and which bank. */
  belts: Map<number, -1 | 1>;
}
interface Hags {
  z0: number;
  z1: number;
  seed: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Mire extends Bones {
  year: Year;
  lawn: number;
  lane(z: number): number;
  /** The open mere's shore: how far out from the way the water reaches at z (0 where there's none). */
  shore(z: number): number;
  stands: Stand[];
  strings: Strings[];
  sloughs: Slough[];
  cuttings: Cuttings[];
  polders: Polder[];
  hags: Hags[];
  /** Where on the strings (x, z) is: how far from the nearest string's line, which string, the pool there. */
  stringAt(s: Strings, x: number, z: number): { d: number; row: number; f: number };
  /** Is there a pool between strings `row` and `row + 1` at x? */
  pool(s: Strings, row: number, x: number): boolean;
  /** The polder's frame at (x, z): across the main drain (u), along it (v). */
  frame(p: Polder, x: number, z: number): { u: number; v: number };
  /** A polder field's state, by its side and row. */
  field(p: Polder, side: -1 | 1, row: number): 'sedge' | 'bloom' | 'flood' | 'furrow';
  /** A cuttings bank's face at z on a side: how far out from the canal. */
  face(c: Cuttings, side: -1 | 1, z: number): number;
  /** An old cut on the cuttings' floor: flooded, or cut dry. */
  cut(c: Cuttings, side: -1 | 1, row: number): 'flooded' | 'dry';
  /** How far into a hag (x, z) is: under 1 in a gully (0 its middle), over 1 on a hag's cap. */
  gully(g: Hags, x: number, z: number): number;
}

/** Two colours mixed, t of the way from a to b. */
const mix = (a: number, b: number, t: number) => {
  const ch = (c: number, k: number) => (c >> k) & 255;
  const m = (k: number) => Math.round(lerp(ch(a, k), ch(b, k), t)) << k;
  return m(16) | m(8) | m(0);
};
/** A cheap hash of a point (0..1). */
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** The turn that lays a model's local direction (lx, lz) along (dx, dz) (three's rotation about y). */
const turnTo = (lx: number, lz: number, dx: number, dz: number) => Math.atan2(-dz, dx) - Math.atan2(-lz, lx);

export const peat: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 6271 + Math.round(-z0) * 17 + 5, 0x9e3779b1) ^ 0x6c8e9cf5);
    const s = seed % 997;

    const year = weighted(r, [['dry', 3], ['wet', 4], ['flood', 3]] as const) as Year;
    const lawn = WATER + LAWN[year];

    // the grounds: three of six, the hags only in a dry year (and likely then)
    const pool: [string, number][] = [['strings', 3], ['stand', 3], ['slough', 3], ['cuttings', 3], ['polder', 3]];
    if (year === 'dry') pool.push(['hags', 4]);
    const picked: string[] = [];
    while (picked.length < 3) {
      const k = weighted(r, pool.filter(([g]) => !picked.includes(g)));
      picked.push(k);
    }
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.mouth[0], first) - LEN.out[0];
    const want = (ks: string[]) => ks.reduce((a, k) => a + LEN[k][0], 0) + (ks.length - 1) * LEN.breather[0];
    let grounds = picked;
    if (want(grounds) > total) grounds = picked.slice(0, 2);
    if (want(grounds) > total) grounds = picked.slice(0, 1);
    grounds = shuffle(r, grounds);

    // the beats: each ground its least, and what's left shared out
    const seq = ['mouth'];
    grounds.forEach((g, i) => {
      if (i) seq.push('breather');
      seq.push(g);
    });
    seq.push('out');
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
    // (what won't fit goes to the grounds, never the breathers)
    if (spare > 0.5) {
      const into = seq.map((k, i) => (k in LEN && !['mouth', 'out', 'breather'].includes(k) ? i : -1)).filter((i) => i >= 0);
      for (const i of into.length ? into : [0, seq.length - 1]) lens[i] += spare / Math.max(1, into.length);
    }
    const beats: Beat[] = [];
    let z = z0;
    seq.forEach((kind, i) => {
      const end = i === seq.length - 1 ? z1 : z - lens[i];
      beats.push({ kind, z0: z, z1: end, side: r() < 0.5 ? -1 : 1 });
      z = end;
    });
    const beatAt = (z: number) => beats.find((b) => z <= b.z0 && z > b.z1) ?? (z > z0 ? beats[0] : beats[beats.length - 1]);
    /** How far into beat b z is, eased in over `m` at its ends (0 outside). */
    const inside = (b: Beat, z: number, m: number) => smoothstep(0, m, Math.min(b.z0 - z, z - b.z1));

    // the way through, wandering gently; each ground holds it to its own line
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 8;
    const wander = (z: number) => clamp(x0 + 9 * Math.sin(z * 0.015 + k1) + 3 * Math.sin(z * 0.043 + k2), -12, 12);

    const stands: Stand[] = [];
    const strings: Strings[] = [];
    const sloughs: Slough[] = [];
    const cuttings: Cuttings[] = [];
    const polders: Polder[] = [];
    const hagss: Hags[] = [];
    const holds: { b: Beat; x: (z: number) => number }[] = [];
    for (const b of beats) {
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'strings': {
          // bowed downstream (the water creeps down the slope and holds back behind each string)
          strings.push({ z0: b.z0, z1: b.z1, pitch: range(r, 6, 7.5), width: range(r, 1.0, 1.35), bow: (r() < 0.5 ? -1 : 1) * range(r, 5, 9), tilt: (r() - 0.5) * 0.35, x: wander(zc) + (r() - 0.5) * 10, zc });
          break;
        }
        case 'stand': {
          stands.push({ z0: b.z0, z1: b.z1, trees: [], wind: (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.9 });
          break;
        }
        case 'slough': {
          // a meander: its bends wider than the way swings, its reach a little narrower at the bends
          const a = range(r, 11, 15);
          const k = (Math.PI * 2) / range(r, 64, 84);
          const ph = r() * 6;
          const ph2 = r() * 6;
          const cx = clamp(wander(zc), -4, 4);
          const rx = (z: number) => clamp(cx + a * Math.sin(z * k + ph) + a * 0.25 * Math.sin(z * k * 2.1 + ph2), -18, 18);
          const half = (z: number) => 4.8 + 0.9 * Math.cos(2 * (z * k + ph));
          const bows: Slough['bows'] = [];
          // an oxbow off a bend's outside, out at the side of the field
          for (let zz = b.z0 - 14; zz > b.z1 + 14; zz -= 6) {
            if (bows.length >= 2) break;
            const c = rx(zz + 1) + rx(zz - 1) - 2 * rx(zz);
            if (Math.abs(c) < 0.02 || r() < 0.6) continue;
            const side = -Math.sign(c);
            const ox = rx(zz) + side * range(r, 16, 22);
            if (Math.abs(ox) > HALF_W + 4) continue;
            bows.push({ x: ox, z: zz, r: range(r, 6, 8), open: side > 0 ? Math.PI : 0 });
            zz -= 24;
          }
          sloughs.push({ z0: b.z0 + 4, z1: b.z1 - 4, x: rx, half, bows });
          holds.push({ b, x: rx });
          break;
        }
        case 'cuttings': {
          const x = clamp(wander(zc), -5, 5);
          // each side cut back in banks, a family to a bank: the face stepped in plan
          const banks: Cuttings['banks'] = { '-1': [], '1': [] };
          for (const side of ['-1', '1'] as const) {
            for (let zz = b.z0 + 2; zz > b.z1 - 2; ) {
              const len = range(r, 9, 15);
              banks[side].push({ z0: zz, z1: zz - len, at: range(r, LANE + 4, LANE + 11) });
              zz -= len;
            }
          }
          cuttings.push({ z0: b.z0, z1: b.z1, x, canal: 2.2, banks, pitch: range(r, 4.2, 5), gz: b.z0 - 3 });
          holds.push({ b, x: () => x });
          break;
        }
        case 'polder': {
          const x = clamp(wander(zc), -5, 5);
          const th = (r() - 0.5) * 0.24;
          const side = (r() < 0.5 ? -1 : 1) as -1 | 1;
          const len = b.z0 - b.z1;
          const belts = new Map<number, -1 | 1>();
          for (let k = -8; k <= 8; k++) if (r() < 0.45) belts.set(k, r() < 0.5 ? -1 : 1);
          const fv = range(r, -0.2, 0.2) * len;
          polders.push({
            z0: b.z0,
            z1: b.z1,
            x0: x,
            zc,
            th,
            pitch: range(r, 14, 17),
            off: r() * 10,
            farm: { side, u0: 13, u1: range(r, 25, 29), v0: fv - 8, v1: fv + 8 },
            pump: { side: -side as -1 | 1, v: -len / 2 + range(r, 14, 20) },
            belts,
          });
          holds.push({ b, x: (z) => x + (z - zc) * Math.tan(th) });
          break;
        }
        case 'hags':
          hagss.push({ z0: b.z0, z1: b.z1, seed: r() * 100 });
          break;
      }
    }

    const lane = (z: number) => {
      let x = wander(z);
      for (const h of holds) {
        const k = inside(h.b, z, 14);
        if (k > 0) x = lerp(x, h.x(z), k);
      }
      return x;
    };

    // ── the mere: open water about the way between the grounds, its shore ragged ──────────────
    const merey = (k: string) => k === 'mouth' || k === 'breather' || k === 'out';
    const meres = beats.filter((b) => merey(b.kind));
    const shore = (z: number) => {
      // (each reach of open water rounded off where it meets a ground, running a little way into it)
      let w = 0;
      for (const b of meres) {
        const e = Math.min(b.z0 - z, z - b.z1);
        if (e < -12) continue;
        const k = smoothstep(-12, 8, e);
        w = Math.max(w, (17 + 7 * noise2(z * 0.05, 3.3, s) + (b.kind === 'out' ? -3 : 0)) * Math.sqrt(k));
      }
      return w;
    };
    /** The moss: lawn with hollows of standing water, heaped a little where it's driest. */
    const moss = (x: number, z: number) => {
      const n = fbm(x * 0.045, z * 0.045, s + 1);
      let h = lawn + (noise2(x * 0.3, z * 0.3, s + 2) - 0.5) * 0.08 + smoothstep(0.6, 0.8, n) * 0.16;
      // (its pools out at the sides, where nothing else is going on)
      const hollow = POOLS[year] * 0.45 - (1 - smoothstep(LANE + 4, LANE + 16, Math.abs(x - wander(z)))) * 0.3;
      if (n < hollow) h = lerp(h, WATER - 0.4, smoothstep(hollow, hollow - 0.06, n));
      return h;
    };
    const mere = (x: number, z: number, h: number) => {
      const w = shore(z);
      if (w <= 0) return h;
      const d = Math.abs(x - lane(z)) + (noise2(x * 0.12, z * 0.12, s + 3) - 0.5) * 6;
      return lerp(WATER - 0.4, h, smoothstep(w - 2, w + 1.5, d));
    };

    // ── the strings ─────────────────────────────────────────────────────────────────────────
    const stringAt = (st: Strings, x: number, z: number) => {
      const dx = (x - st.x) / 36;
      const u = z - st.zc - st.bow * dx * dx - st.tilt * (x - st.x) + (fbm(x * 0.035, z * 0.035, s + 4) - 0.5) * 5;
      const p = u / st.pitch;
      const row = Math.floor(p);
      const f = p - row;
      return { d: Math.min(f, 1 - f) * st.pitch, row, f };
    };
    const poolAt = (row: number, x: number) => noise2(x * 0.075 + row * 3.7, row * 1.31, s + 5);
    const stringPool = (_st: Strings, row: number, x: number) => poolAt(row, x) > 1 - POOLS[year];
    const stringHeight = (st: Strings, x: number, z: number) => {
      const { d, row, f } = stringAt(st, x, z);
      const w = st.width * (0.75 + 0.5 * noise2(x * 0.1, row * 2.3, s + 6));
      let h = lawn + 0.42 * (1 - smoothstep(w * 0.5, w * 1.3, d));
      // a pool in the gap after the string: long along it, broken by the bridges of moss between
      const gap = (0.5 - Math.abs(f - 0.5)) * st.pitch;
      const pm = poolAt(row, x) - (1 - POOLS[year]);
      if (pm > 0 && d > w * 1.2) {
        const into = Math.min(gap - w * 1.2, pm * 30);
        h = lerp(h, WATER - 0.35, smoothstep(0, 0.9, into));
      }
      return h;
    };

    // ── the stand: trees spaced as old trees space themselves, off the aisle ─────────────────
    for (const st of stands) {
      const tries = Math.round(((st.z0 - st.z1) * 90) / 4);
      for (let k = 0; k < tries; k++) {
        const zt = lerp(st.z0 - 3, st.z1 + 3, r());
        const x = (r() * 2 - 1) * (HALF_W + 8);
        const off = Math.abs(x - lane(zt));
        if (off < LANE + 1.5) continue;
        // groves and glades: the gap between trunks wider in the glades
        const thick = fbm(x * 0.05, zt * 0.05, s + 7);
        if (thick < 0.32) continue;
        const gap = lerp(7.5, 4.2, smoothstep(0.35, 0.7, thick));
        const sc = range(r, 0.85, 1.15);
        if (st.trees.some((t) => Math.hypot(t.x - x, t.z - zt) < gap * (t.elder ? 1.6 : 1))) continue;
        st.trees.push({ x, z: zt, s: sc, elder: false });
      }
      // the eldest, taller than you fly, a few, well off the aisle where the wood is thick
      let n = 0;
      for (const t of shuffle(r, [...st.trees])) {
        if (n >= 4) break;
        const off = Math.abs(t.x - lane(t.z));
        if (off < LANE + 5 || Math.abs(t.x) > HALF_W - 2) continue;
        if (st.trees.some((u) => u.elder && Math.abs(u.z - t.z) < 22)) continue;
        // (room round it: its limbs reach far)
        st.trees = st.trees.filter((u) => u === t || Math.hypot(u.x - t.x, u.z - t.z) > 6.5);
        t.elder = true;
        t.s = range(r, 0.95, 1.05);
        n++;
      }
    }
    const treeBy = new Map<number, Tree[]>();
    for (const st of stands)
      for (const t of st.trees)
        for (let k = Math.floor((t.z - 4) / 8); k <= Math.floor((t.z + 4) / 8); k++) {
          if (!treeBy.has(k)) treeBy.set(k, []);
          treeBy.get(k)!.push(t);
        }
    /** The stand's floor: black water, shallows of mud where it shoals, each trunk on its root mound. */
    const standHeight = (x: number, z: number) => {
      const n = fbm(x * 0.06, z * 0.06, s + 8);
      let h = WATER - 0.6 + smoothstep(0.64, 0.74, n) * (LAWN[year] + 0.65);
      for (const t of treeBy.get(Math.floor(z / 8)) ?? []) {
        const rad = (t.elder ? 4 : 2.2) * t.s;
        const d = Math.hypot(x - t.x, z - t.z);
        if (d < rad) h = Math.max(h, lerp(WATER + 0.35, h, smoothstep(rad * 0.35, rad, d)));
      }
      return h;
    };

    // ── the slough ──────────────────────────────────────────────────────────────────────────
    /** Which way the slough's bend at z swings: the outside of it (-1 or 1). */
    const outside = (sl: Slough, z: number) => {
      const c = sl.x(z + 2) + sl.x(z - 2) - 2 * sl.x(z);
      return Math.abs(c) < 0.01 ? 0 : -Math.sign(c);
    };
    const sloughHeight = (sl: Slough, x: number, z: number, under: number) => {
      const rx = sl.x(z);
      const slope = (sl.x(z - 1) - sl.x(z + 1)) / 2;
      const d = Math.abs(x - rx) / Math.sqrt(1 + slope * slope);
      const hw = sl.half(z);
      const side = Math.sign(x - rx);
      const out = outside(sl, z);
      // the raised moss either side, higher toward the river (its levees of peat)
      const top = Math.max(under, lawn + 0.25);
      let h: number;
      if (side === out) {
        // the cut bank: sheer peat, a hag overhanging the water
        const hag = lawn + 0.85 + 0.25 * noise2(z * 0.2, x * 0.2, s + 9);
        h = lerp(WATER - 0.45, hag, smoothstep(hw - 0.2, hw + 0.5, d));
        h = lerp(h, top, smoothstep(hw + 2.5, hw + 6, d));
      } else {
        // the point bar: silt shelving out of the water, then sedge, then the moss
        h = lerp(WATER - 0.45, WATER - 0.1, smoothstep(hw - 2.5, hw - 0.5, d));
        h = lerp(h, WATER + 0.12, smoothstep(hw - 0.5, hw + 2.5, d));
        h = lerp(h, top, smoothstep(hw + 3, hw + 8, d));
      }
      for (const bw of sl.bows) {
        const dd = Math.hypot(x - bw.x, z - bw.z);
        const a = Math.atan2(z - bw.z, x - bw.x) - bw.open;
        const open = Math.cos(a) > 0.55;
        if (!open && Math.abs(dd - bw.r) < 2.4) h = Math.min(h, lerp(WATER - 0.35, h, smoothstep(1.2, 2.4, Math.abs(dd - bw.r))));
      }
      return h;
    };

    // ── the cuttings ────────────────────────────────────────────────────────────────────────
    const face = (c: Cuttings, side: -1 | 1, z: number) => {
      const bs = c.banks[side > 0 ? '1' : '-1'];
      const bk = bs.find((k) => z <= k.z0 && z > k.z1) ?? bs[bs.length - 1];
      return bk.at;
    };
    const cut = (c: Cuttings, side: -1 | 1, row: number): 'flooded' | 'dry' => {
      const q = hash(row * 3.3 + side * 11.1 + s, 2.7);
      return q < (year === 'dry' ? 0.3 : year === 'wet' ? 0.55 : 0.9) ? 'flooded' : 'dry';
    };
    const cuttingsHeight = (c: Cuttings, x: number, z: number) => {
      const u = x - c.x;
      const side = (u < 0 ? -1 : 1) as -1 | 1;
      const a = Math.abs(u);
      const F = face(c, side, z);
      // the canal, sheer-sided; the floor; the face in two steps up to the uncut bog
      if (a < c.canal + 0.3) return lerp(WATER - 0.45, WATER + FLOOR, smoothstep(c.canal - 0.2, c.canal + 0.3, a));
      const top = WATER + BANK + (noise2(x * 0.2, z * 0.2, s + 10) - 0.5) * 0.1;
      if (a > F) {
        const up = a - F;
        const h = WATER + FLOOR + smoothstep(0, 0.3, up) * 0.7 + smoothstep(1.1, 1.4, up) * (BANK - FLOOR - 0.7);
        return Math.min(h, top);
      }
      let h = WATER + FLOOR + (noise2(x * 0.4, z * 0.4, s + 11) - 0.5) * 0.04;
      // the old cuts: strips across the floor, sunk, flooded or dry
      const row = Math.floor((c.gz - z) / c.pitch);
      const v = c.gz - z - row * c.pitch;
      if (a > c.canal + 1.6 && a < F - 1.4 && v > 0.9 && v < 2.6) {
        const edge = Math.min(v - 0.9, 2.6 - v, a - c.canal - 1.6, F - 1.4 - a);
        h -= smoothstep(0, 0.35, edge) * (cut(c, side, row) === 'flooded' ? 0.6 : 0.28);
      }
      return h;
    };

    // ── the polder ──────────────────────────────────────────────────────────────────────────
    const frame = (p: Polder, x: number, z: number) => {
      const c = Math.cos(p.th);
      const sn = Math.sin(p.th);
      const dx = x - p.x0;
      const dz = z - p.zc;
      return { u: dx * c - dz * sn, v: dx * sn + dz * c };
    };
    const field = (p: Polder, side: -1 | 1, row: number) => {
      const q = hash(row * 5.3 + side * 7.9 + s, 4.1);
      const wet = year === 'flood' ? 0.5 : year === 'wet' ? 0.25 : 0.1;
      if (q < wet) return 'flood';
      if (q < wet + 0.25) return 'bloom';
      if (q < wet + 0.5) return 'furrow';
      return 'sedge';
    };
    const sideDrain = (p: Polder, v: number) => {
      const k = Math.round((v - p.off) / p.pitch);
      return { k, d: Math.abs(v - p.off - k * p.pitch) };
    };
    const polderHeight = (p: Polder, x: number, z: number, under: number) => {
      const { u, v } = frame(p, x, z);
      const a = Math.abs(u);
      const fieldLvl = WATER + (year === 'dry' ? 0.24 : year === 'wet' ? 0.12 : -0.12);
      let h: number;
      if (a < DRAIN) h = WATER - 0.45;
      else if (a < DIKE_OUT) {
        // the dikes: banked up out of the drain, a flat crest, down to the fields
        const up = smoothstep(DRAIN, DRAIN + 0.8, a);
        const down = smoothstep(DIKE_OUT - 0.8, DIKE_OUT, a);
        h = lerp(lerp(WATER - 0.45, WATER + DIKE, up), fieldLvl, down);
      } else {
        h = fieldLvl + (noise2(x * 0.3, z * 0.3, s + 12) - 0.5) * 0.06;
        const sd = sideDrain(p, v);
        if (sd.d < 1.2) h = lerp(WATER - 0.35, h, smoothstep(0.6, 1.2, sd.d));
        // the farmstead's yard, raised
        const f = p.farm;
        const fu = u * f.side;
        if (fu > f.u0 - 2 && fu < f.u1 + 2 && v > f.v0 - 2 && v < f.v1 + 2) {
          const e = Math.min(fu - f.u0 + 2, f.u1 + 2 - fu, v - f.v0 + 2, f.v1 + 2 - v);
          h = lerp(h, WATER + 0.65, smoothstep(0, 1.5, e));
        }
        // the pump-house's pad
        const pu = u * p.pump.side;
        const dp = Math.hypot(pu - 10, v - p.pump.v);
        if (dp < 7) h = lerp(WATER + 0.9, h, smoothstep(4.5, 7, dp));
      }
      // out at the field's edge the fields fray back into the moss
      return lerp(h, under, smoothstep(HALF_W + 6, HALF_W + 14, a));
    };

    // ── the hags ────────────────────────────────────────────────────────────────────────────
    const gully = (g: Hags, x: number, z: number) => {
      // gullies branching as rain cuts them: two webs of them, broad and fine, and the way's own,
      // broadest of all, that they all drain into
      // (warped, and turned off the grid, so they wander like water does)
      const wx = x + (fbm(x * 0.06, z * 0.06, g.seed + 7) - 0.5) * 14;
      const wz = z + (fbm(x * 0.06, z * 0.06, g.seed + 8) - 0.5) * 14;
      const u = wx * 0.8 + wz * 0.6, v = wz * 0.8 - wx * 0.6;
      const w1 = Math.abs(noise2(u * 0.045, v * 0.045, g.seed) - 0.5) / 0.08;
      const w2 = Math.abs(noise2(v * 0.09, u * 0.09, g.seed + 1) - 0.5) / 0.045;
      const main = Math.abs(x - lane(z) - (noise2(z * 0.07, 0.5, g.seed + 9) - 0.5) * 5) / (LANE + 1 + 4 * noise2(z * 0.09, x * 0.02, g.seed + 10));
      // and at the ends the bog still whole: the gullies close up into the moss
      const e = Math.min(g.z0 - z, z - g.z1);
      return Math.min(Math.min(w1, w2 + 0.3) + 1.4 * (1 - smoothstep(2, 16, e)), main);
    };
    const hagHeight = (g: Hags, x: number, z: number) => {
      const d = gully(g, x, z);
      const cap = lawn + 1.0 + (fbm(x * 0.08, z * 0.08, g.seed + 2) - 0.5) * 0.35;
      // the floor: bare peat, puddled where it's lowest
      let floor = WATER + 0.12 + (noise2(x * 0.25, z * 0.25, g.seed + 3) - 0.5) * 0.12;
      const pud = smoothstep(0.58, 0.72, fbm(x * 0.07, z * 0.07, g.seed + 4)) * (1 - smoothstep(0.4, 0.7, d));
      floor = lerp(floor, WATER - 0.3, pud);
      // the sides sheer, the cap's moss overhanging them
      return lerp(floor, cap, smoothstep(0.88, 1.05, d));
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      let h = mere(x, z, moss(x, z));
      const e = inside(b, z, 10);
      if (e <= 0) return h;
      let g = h;
      switch (b.kind) {
        case 'strings':
          for (const st of strings) if (z <= st.z0 + 1 && z > st.z1 - 1) g = stringHeight(st, x, z);
          break;
        case 'stand':
          g = standHeight(x, z);
          break;
        case 'slough':
          for (const sl of sloughs) if (z <= sl.z0 && z > sl.z1) g = sloughHeight(sl, x, z, h);
          break;
        case 'cuttings':
          for (const c of cuttings) if (z <= c.z0 + 2 && z > c.z1 - 2) g = cuttingsHeight(c, x, z);
          break;
        case 'polder':
          for (const p of polders) if (z <= p.z0 + 2 && z > p.z1 - 2) g = polderHeight(p, x, z, h);
          break;
        case 'hags':
          for (const hg of hagss) if (z <= hg.z0 + 2 && z > hg.z1 - 2) g = hagHeight(hg, x, z);
          break;
      }
      h = lerp(h, g, e);
      return h;
    };

    // ── the colours ─────────────────────────────────────────────────────────────────────────
    /** The moss's own colours: patches of ochre, olive and rust, red where it heaps up, heather on the driest. */
    const mossStain = (x: number, z: number, h: number): [number, number] | null => {
      const up = h - WATER;
      if (up < -0.05) return null;
      if (up < 0.08) return [WETMUD, 0.8];
      // the moss in soft drifts of olive and ochre, browning toward rust out at the sides (the
      // richest colour away from the way, and never the fire's pink)
      const m = smoothstep(0.3, 0.7, fbm(x * 0.03, z * 0.03, s + 14));
      const n = smoothstep(0.35, 0.75, noise2(x * 0.09, z * 0.09, s + 13));
      const out = smoothstep(LANE + 2, LANE + 16, Math.abs(x - lane(z)));
      let c = mix(OLIVE, OCHRE, m);
      c = mix(c, RUSTMOSS, n * out * 0.7);
      if (up > lawn - WATER + 0.12) c = mix(c, HEATHER, 0.35 * out);
      return [c, 0.72];
    };
    const stain = (x: number, z: number): [number, number] | null => {
      const h = height(x, z);
      const b = beatAt(z);
      const own = (): [number, number] | null => {
        switch (b.kind) {
          case 'strings': {
            for (const st of strings) {
              if (z > st.z0 || z <= st.z1) continue;
              if (h < WATER - 0.05) return null;
              const { d } = stringAt(st, x, z);
              // (the strings' red quieter over the way: the richest colour out at the sides)
              const k = lerp(0.4, 1, smoothstep(LANE, LANE + 10, Math.abs(x - lane(z))));
              if (h > lawn + 0.25 && d < st.width) return [STRING_TOP, 0.8 * k];
              if (h > lawn + 0.1) return [RED, 0.75 * k];
              if (h < WATER + 0.1) return [WETMUD, 0.8];
              return noise2(x * 0.2, z * 0.6, s + 15) > 0.55 ? [SEDGE, 0.7] : [OCHRE, 0.7];
            }
            return null;
          }
          case 'stand': {
            if (h < WATER - 0.05) return null;
            if (h < WATER + 0.15) return [WETMUD, 0.85];
            return noise2(x * 0.3, z * 0.3, s + 16) > 0.5 ? [OLIVE, 0.8] : [SEDGE, 0.75];
          }
          case 'slough': {
            for (const sl of sloughs) {
              if (z > sl.z0 || z <= sl.z1) continue;
              if (h < WATER - 0.05) return null;
              const rx = sl.x(z);
              const d = Math.abs(x - rx);
              const out = outside(sl, z) === Math.sign(x - rx);
              if (d < sl.half(z) + 1.4) return out ? (Math.floor(h * 5) % 2 ? [PEAT, 0.9] : [PEAT_BAND, 0.9]) : [SILT, 0.8];
              if (!out && d < sl.half(z) + 4) return h < WATER + 0.2 ? [SILT, 0.7] : [SEDGE, 0.75];
              if (out && d < sl.half(z) + 2.6) return [HEATHER, 0.75];
            }
            return null;
          }
          case 'cuttings': {
            for (const c of cuttings) {
              if (z > c.z0 || z <= c.z1) continue;
              if (h < WATER - 0.05) return null;
              const u = x - c.x;
              const side = (u < 0 ? -1 : 1) as -1 | 1;
              const a = Math.abs(u);
              const F = face(c, side, z);
              // the face: the peat's banding where the years lie, darker down to the floor
              if (a > F - 0.1 && a < F + 1.4) return Math.floor((h - WATER) * 6) % 2 ? [PEAT, 0.92] : [PEAT_BAND, 0.92];
              // the lip of the uncut bog along the top of the face, its moss pale where it's dried out
              if (a >= F + 1.4 && a < F + 2.4) return [LIP, 0.85];
              if (a >= F + 2.4) return null;
              if (a < c.canal + 0.4) return [PEAT, 0.85];
              const row = Math.floor((c.gz - z) / c.pitch);
              const v = c.gz - z - row * c.pitch;
              // the dry cuts dark; the baulks between them with turves spread, in rows
              if (v > 0.9 && v < 2.6 && a > c.canal + 1.6 && a < F - 1.4) return [PEAT, 0.88];
              if (Math.floor((a - c.canal) / 0.8) % 2 && v > 3) return [TURF, 0.8];
              return [CUTFLOOR, 0.85];
            }
            return null;
          }
          case 'polder': {
            for (const p of polders) {
              if (z > p.z0 + 2 || z <= p.z1 - 2) continue;
              if (h < WATER - 0.05) return null;
              const { u, v } = frame(p, x, z);
              const a = Math.abs(u);
              if (a > HALF_W + 10) return null;
              if (a < DIKE_OUT) {
                // the crest's worn track, the grass of its flanks
                if (a > 3.2 && a < 4.0) return [DIKE_TRACK, 0.8];
                return [DIKE_GRASS, 0.8];
              }
              const f = p.farm;
              const fu = u * f.side;
              if (fu > f.u0 - 0.5 && fu < f.u1 + 0.5 && v > f.v0 - 0.5 && v < f.v1 + 0.5) return h > WATER + 0.5 ? [YARD, 0.85] : [DIKE_GRASS, 0.8];
              if (Math.hypot(u * p.pump.side - 10, v - p.pump.v) < 4.8) return [YARD, 0.8];
              const sd = sideDrain(p, v);
              if (sd.d < 1.7) return [DIKE_GRASS, 0.75];
              const side = (u < 0 ? -1 : 1) as -1 | 1;
              const row = Math.floor((v - p.off) / p.pitch + 0.5);
              switch (field(p, side, row)) {
                case 'bloom': {
                  const edge = fbm(x * 0.12, z * 0.12, s + 17);
                  return edge > 0.35 ? [BLOOM, 0.8] : [BLOOM_EDGE, 0.7];
                }
                case 'furrow':
                  return [FURROW[Math.floor(a / 1.1) % 2], 0.8];
                case 'flood':
                  return [WETMUD, 0.75];
                default:
                  return noise2(x * 0.25, z * 0.25, s + 18) > 0.5 ? [SEDGE, 0.8] : [OCHRE, 0.75];
              }
            }
            return null;
          }
          case 'hags': {
            for (const hg of hagss) {
              if (z > hg.z0 || z <= hg.z1) continue;
              if (h < WATER - 0.05) return null;
              const d = gully(hg, x, z);
              // the floor bare peat; the sides banded where the years lie; the cap's lip of moss
              // dried pale along the edge, heather and moss on the cap
              if (d < 0.86) return [mix(GULLY_WET, GULLY, smoothstep(WATER - 0.05, WATER + 0.18, h)), 0.85];
              if (d < 1.06) return Math.floor((h - WATER) * 6) % 2 ? [PEAT, 0.92] : [PEAT_BAND, 0.92];
              if (d < 1.2) return [LIP, 0.85];
              // (the cap's moss green and gold, the way's richest ground after the bare peat)
              const m = mix(OLIVE, OCHRE, smoothstep(0.3, 0.7, fbm(x * 0.04, z * 0.04, hg.seed + 5)));
              return [mix(m, HEATHER, 0.3 * smoothstep(0.6, 0.8, noise2(x * 0.14, z * 0.14, hg.seed + 6))), 0.8];
            }
            return null;
          }
        }
        return null;
      };
      return own() ?? mossStain(x, z, h);
    };

    // the water an eel swims (sim/foes.ts): the mere about the way, the stand's aisle, the slough,
    // the polder's main drain, the cutters' canal; never the strings' pools or the hags' gullies
    const routes: Route[] = [];
    for (const b of beats) {
      if (b.kind === 'strings' || b.kind === 'hags') continue;
      const pts: Route['pts'] = [];
      for (let z = b.z0; z > b.z1; z -= 4) pts.push({ x: lane(z), z });
      pts.push({ x: lane(b.z1), z: b.z1 });
      routes.push({ kind: 'water', pts });
    }

    const bones: Mire = {
      height,
      stain,
      routes,
      beats,
      year,
      lawn,
      lane,
      shore,
      stands,
      strings,
      sloughs,
      cuttings,
      polders,
      hags: hagss,
      stringAt,
      pool: stringPool,
      frame,
      field,
      face,
      cut,
      gully,
    };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Mire);
  },
};

function plan(kit: Kit, b: Mire) {
  const r = kit.r;
  const g = kit.ground;
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;
  const wet = (x: number, z: number) => g.height(x, z) < WATER - 0.05;
  const dry = (x: number, z: number) => g.height(x, z) > WATER + 0.05;

  /** A drowned snag of one of its builds (0–3 trees, 4 a broken trunk, 5 a stump). */
  const snag = (x: number, z: number, v = Math.floor(r() * 4), s = range(r, 0.85, 1.15)) =>
    kit.put('mirefall_peat_snag', x, z, { s, variant: v, rot: r() * Math.PI * 2, pad: 0.6 });
  /** A trunk the wind threw down, its top lying toward `a` (radians, as turnTo's direction). */
  const log = (x: number, z: number, a: number) =>
    kit.put('mirefall_peat_log', x, z, { s: range(r, 0.85, 1.1), rot: turnTo(1, 0, Math.cos(a), Math.sin(a)), variant: Math.floor(r() * 3), pad: 0.2 });
  /** Hummocks of moss in a chain or a cluster round (x, z). */
  const cushions = (x: number, z: number, n: number, spread = 2.5, keep = (xx: number, zz: number) => clear(xx, zz, LANE - 2) && dry(xx, zz), red = true) => {
    // (a family of one moss, the biggest in the middle: the red only out at the sides)
    const out = !red || !clear(x, z, LANE + 12) ? 0 : 1;
    const v = out && r() < 0.35 ? 0 : 1 + Math.floor(r() * 3);
    let made = 0;
    for (let k = 0, tries = 0; k < n && tries < n * 4; tries++) {
      const a = r() * Math.PI * 2;
      const d = k ? spread * Math.sqrt(r()) : 0;
      const xx = x + Math.cos(a) * d;
      const zz = z + Math.sin(a) * d;
      if (!keep(xx, zz)) continue;
      if (kit.put('mirefall_peat_cushion', xx, zz, { s: lerp(1.35, 0.75, k / Math.max(1, n - 1)) * range(r, 0.9, 1.1), variant: v, pad: -0.3 })) made++;
      k++;
    }
    return made;
  };
  /** Cotton-grass in a drift on the wet ground. */
  const cotton = (x: number, z: number, n: number) => {
    const h = g.height(x, z);
    if (h < WATER - 0.05 || h > WATER + 0.5) return;
    kit.group(x, z, { kinds: [['mirefall_peat_cotton', 1]], n, spread: 1.8 + n * 0.3, big: 1.2, small: 0.8, keep: (xx, zz) => clear(xx, zz, LANE - 1) && dry(xx, zz) && g.height(xx, zz) < WATER + 0.5 });
  };
  /** Reeds and lilies in the shallows round (x, z), if it's shallow there. */
  const reeds = (x: number, z: number, n: number) => {
    const h = g.height(x, z);
    if (h > WATER + 0.2 || h < WATER - 0.45 || !clear(x, z, LANE + 1)) return;
    kit.group(x, z, { kinds: [['reed_clump', 3], ['lily_pad', 1]], n, spread: 2.2 + n * 0.35, big: 1.25, small: 0.7, keep: (xx, zz) => clear(xx, zz, LANE) && g.height(xx, zz) < WATER + 0.25 });
  };
  const lilies = (x: number, z: number, n: number) => {
    if (!wet(x, z)) return;
    kit.group(x, z, { kinds: [['lily_pad', 1]], n, spread: 2.5 + n * 0.4, big: 1.15, small: 0.7, keep: (xx, zz) => wet(xx, zz) && clear(xx, zz, LANE - 3) });
  };
  /** A way-pole at (x, z): lit, or dark and leaning. */
  const pole = (x: number, z: number, lit = r() < 0.6) => kit.put('mirefall_peat_pole', x, z, { s: range(r, 0.95, 1.05), variant: lit ? 0 : 1, rot: r() * 0.6 - 0.3, overlap: true });
  /** A run of plank trackway from (xa, za) to (xb, zb), a section every 6, broken now and then. */
  const track = (xa: number, za: number, xb: number, zb: number, broken = 0.15) => {
    const len = Math.hypot(xb - xa, zb - za);
    const n = Math.max(1, Math.round(len / 5.8));
    const rot = turnTo(0, -1, xb - xa, zb - za);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      kit.put('mirefall_peat_track', lerp(xa, xb, t), lerp(za, zb, t), { s: 1, rot, variant: r() < broken ? 1 : 0, overlap: true });
    }
  };
  /** A Rang punt at (x, z), lying along (dx, dz). */
  const punt = (x: number, z: number, dx: number, dz: number) => {
    if (!wet(x, z)) return null;
    return kit.put('mirefall_punt', x, z, { s: 1, rot: turnTo(0, -1, dx, dz), pad: 0.3 });
  };
  /** A turf hut, its door to (dx, dz); smoke from its fire. */
  const hut = (x: number, z: number, dx: number, dz: number) => {
    const p = kit.put('mirefall_peat_turf_hut', x, z, { s: range(r, 0.95, 1.1), rot: turnTo(0, -1, dx, dz), variant: Math.floor(r() * 2), pad: 0.5 });
    if (p) kit.emit('smoke', x, z);
    return p;
  };
  /** Fog lying low at the sides: a bank either side, or one. */
  const fog = (bt: Beat, chance = 0.6, near = 26) => {
    for (const side of [-1, 1])
      for (let k = 0; k < 2; k++) if (r() < chance) kit.emit('fog', b.lane((bt.z0 + bt.z1) / 2) + side * range(r, near, near + 12), lerp(bt.z0, bt.z1, range(r, 0.15, 0.85)));
  };
  /** The open mere: moss rafts, a lone snag on its root mound off the shore, reeds round the shore, lilies in the lee. */
  const mere = (bt: Beat, rich: number) => {
    for (let z = bt.z0 - range(r, 3, 7); z > bt.z1 + 3; z -= range(r, 7, 11))
      for (const side of [-1, 1]) {
        const w = b.shore(z);
        if (w <= 0) continue;
        const lx = b.lane(z);
        // the shore: reeds along it, the moss heaped behind them
        const sx = lx + side * (w + range(r, -1, 1.5));
        reeds(sx, z, 3 + Math.floor(r() * 4));
        if (r() < rich) cushions(sx + side * range(r, 3, 6), z + range(r, -2, 2), 3 + Math.floor(r() * 3), 2.2, (xx, zz) => dry(xx, zz) && clear(xx, zz, LANE + 2));
        // out on the water, now and then, a lone snag the mere drowned, or a log afloat
        if (r() < rich * 0.6) {
          const x = lx + side * range(r, LANE + 3, Math.max(LANE + 4, w - 2));
          if (wet(x, z)) {
            if (r() < 0.7) snag(x, z, Math.floor(r() * 5));
            else log(x, z, r() * Math.PI * 2);
            lilies(x + side * 3, z + range(r, -2, 2), 3 + Math.floor(r() * 3));
          }
        }
      }
    fog(bt, 0.7);
    for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= range(r, 10, 16)) if (r() < 0.5) kit.emit('bubble', b.lane(z) + (r() - 0.5) * 12, z);
  };

  for (const bt of kit.beats) {
    switch (bt.kind) {
      case 'mouth': {
        mere(bt, 0.6);
        // in out of the fog between the sentinels: the drowned wood's two eldest either side of the way
        const z = bt.z1 + 9;
        const lx = b.lane(z);
        for (const side of [-1, 1]) {
          const x = lx + side * (LANE + 6.5);
          kit.solid('mirefall_peat_elder', x, z, 1, r() * Math.PI * 2);
          kit.post(x + side * 4, z + 2, 0, 'sentinel');
          reeds(x + side * 3, z - 3, 6);
          // their fallen kin lying off into the fog, and the stumps of the rest
          for (let k = 1; k <= 3; k++) {
            const xs = x + side * k * range(r, 7, 10);
            if (Math.abs(xs) < HALF_W + 8) snag(xs, z + range(r, -5, 5), k === 1 ? Math.floor(r() * 4) : 4 + Math.floor(r() * 2));
          }
        }
        // fog thick at the way in
        for (let k = 0; k < 4; k++) kit.emit('fog', lx + (k < 2 ? -1 : 1) * range(r, 14, 30), bt.z0 - range(r, 4, 14));
        break;
      }
      case 'breather':
        mere(bt, 0.45);
        if (r() < 0.5) punt(b.lane((bt.z0 + bt.z1) / 2) + (r() < 0.5 ? -1 : 1) * range(r, 9, 13), (bt.z0 + bt.z1) / 2, r() - 0.5, -1);
        break;
      case 'out': {
        mere(bt, 0.5);
        // out along the cutters' trackway, its poles leading off toward the temple, lit
        const side = bt.side;
        const xa = b.lane(bt.z0 - 2) + side * (LANE + 3);
        const xb = b.lane(bt.z1 + 2) + side * (LANE + 2);
        track(xa, bt.z0 - 2, xb, bt.z1 + 2, 0.1);
        for (let z = bt.z0 - 5; z > bt.z1 + 2; z -= 9) pole(b.lane(z) + side * (LANE + 4.6), z, true);
        break;
      }
      case 'strings':
        stringsPlan(kit, b, bt, { snag, cushions, cotton, reeds, pole, track, fog, clear, dry, wet });
        break;
      case 'stand':
        standPlan(kit, b, bt, { snag, log, reeds, lilies, fog, clear, wet });
        break;
      case 'slough':
        sloughPlan(kit, b, bt, { snag, log, cushions, cotton, reeds, lilies, punt, hut, pole, fog, clear, dry, wet });
        break;
      case 'cuttings':
        cuttingsPlan(kit, b, bt, { snag, cushions, cotton, reeds, punt, hut, pole, track, fog, clear, dry, wet });
        break;
      case 'polder':
        polderPlan(kit, b, bt, { snag, cushions, reeds, lilies, fog, clear, dry, wet });
        break;
      case 'hags':
        hagsPlan(kit, b, bt, { snag, log, cushions, cotton, fog, clear, dry });
        break;
    }
  }
}

interface Hands {
  snag(x: number, z: number, v?: number, s?: number): unknown;
  log(x: number, z: number, a: number): unknown;
  cushions(x: number, z: number, n: number, spread?: number, keep?: (x: number, z: number) => boolean, red?: boolean): unknown;
  cotton(x: number, z: number, n: number): void;
  reeds(x: number, z: number, n: number): void;
  lilies(x: number, z: number, n: number): void;
  punt(x: number, z: number, dx: number, dz: number): unknown;
  hut(x: number, z: number, dx: number, dz: number): unknown;
  pole(x: number, z: number, lit?: boolean): unknown;
  track(xa: number, za: number, xb: number, zb: number, broken?: number): void;
  fog(bt: Beat, chance?: number, near?: number): void;
  clear(x: number, z: number, m?: number): boolean;
  dry(x: number, z: number): boolean;
  wet(x: number, z: number): boolean;
}

/**
 * The strings: hummocks of moss strung along each string's crest, a lone pine-like snag on the
 * broadest, cotton-grass drifting at the pools' margins; guns rooted on the strings either side of
 * the way, every other string; marsh gas in the pools, fog lying over the far ones.
 */
function stringsPlan(kit: Kit, b: Mire, bt: Beat, h: Pick<Hands, 'snag' | 'cushions' | 'cotton' | 'reeds' | 'pole' | 'track' | 'fog' | 'clear' | 'dry' | 'wet'>) {
  const r = kit.r;
  const g = kit.ground;
  for (const st of b.strings) {
    if (st.z0 !== bt.z0) continue;
    // walk across the field along each string: find its crest at each x by stepping z
    const crests = new Map<number, { x: number; z: number }[]>();
    for (let x = -HALF_W - 8; x <= HALF_W + 8; x += 1.6)
      for (let z = bt.z0 - 2; z > bt.z1 + 2; z -= 0.8) {
        const at = b.stringAt(st, x, z);
        if (at.d > 0.4) continue;
        const row = Math.round((at.row + at.f));
        const list = crests.get(row) ?? [];
        if (!list.some((p) => Math.abs(p.x - x) < 0.8)) list.push({ x, z });
        crests.set(row, list);
      }
    for (const [row, pts] of crests) {
      pts.sort((p, q) => p.x - q.x);
      // hummocks along it, in runs with gaps (a string is a chain, not a wall)
      let run = 0;
      let v = 1;
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        if (!h.clear(p.x, p.z, LANE - 1)) continue;
        // (fewer over the way, thicker out at the sides; a run all of one moss, the red out at the sides)
        const side = smoothstep(LANE, LANE + 14, Math.abs(p.x - b.lane(p.z)));
        if (run === 0 && r() < 0.12 + 0.3 * side) {
          run = 2 + Math.floor(r() * 3);
          v = side > 0.7 && r() < 0.25 ? 0 : 1 + Math.floor(r() * 3);
        }
        if (run > 0) {
          run--;
          kit.put('mirefall_peat_cushion', p.x + (r() - 0.5), p.z + (r() - 0.5) * 0.6, { s: range(r, 0.9, 1.3), variant: v });
        }
      }
      // a lone snag on the string, now and then, well out at the side
      if (r() < 0.35) {
        const p = pts[Math.floor(r() * pts.length)];
        if (p && h.clear(p.x, p.z, LANE + 6)) h.snag(p.x, p.z, Math.floor(r() * 4), range(r, 0.8, 1.05));
      }
      // guns on every other string, either side of the way
      if (row % 2 === 0) {
        for (const side of [-1, 1]) {
          const lx = b.lane(pts[0]?.z ?? bt.z0);
          const p = pts.filter((q) => Math.sign(q.x - lx) === side && Math.abs(q.x - lx) > LANE + 2 && Math.abs(q.x - lx) < LANE + 10)[0];
          if (p && r() < 0.6) kit.post(p.x, p.z, 0, 'string');
        }
      }
    }
    // the pools' margins: cotton-grass in drifts; marsh gas rising; reeds in the deepest
    for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 3, 5)) {
      const x = (r() * 2 - 1) * (HALF_W + 6);
      if (!h.clear(x, z, LANE)) continue;
      if (h.wet(x, z)) {
        if (r() < 0.3) kit.emit('bubble', x, z);
        else if (r() < 0.3) h.reeds(x, z, 3);
      } else if (g.height(x, z) < b.lawn + 0.1 && r() < 0.5) h.cotton(x, z, 3 + Math.floor(r() * 4));
    }
    h.fog(bt, 0.55, 30);
  }
}

/**
 * The stand: every tree on its root mound (the eldest taller than you fly), the fallen all thrown
 * down the one way with their root plates torn up, reeds where the mud shoals, lilies in the
 * glades, fog lying among the trunks; guns on the root mounds by the aisle and at an elder's foot.
 */
function standPlan(kit: Kit, b: Mire, bt: Beat, h: Pick<Hands, 'snag' | 'log' | 'reeds' | 'lilies' | 'fog' | 'clear' | 'wet'>) {
  const r = kit.r;
  for (const st of b.stands) {
    if (st.z0 !== bt.z0) continue;
    const wx = Math.cos(st.wind);
    const wz = Math.sin(st.wind);
    for (const t of st.trees) {
      if (t.elder) {
        if (!kit.solid('mirefall_peat_elder', t.x, t.z, t.s, r() * Math.PI * 2)) continue;
        const side = Math.sign(b.lane(t.z) - t.x);
        kit.post(t.x + side * 3.4, t.z + 1.5, 0, 'elder');
        continue;
      }
      // (most standing, of every build; a broken one, a stump here and there)
      const q = r();
      const v = q < 0.72 ? Math.floor(r() * 4) : q < 0.88 ? 4 : 5;
      h.snag(t.x, t.z, v, t.s);
    }
    // the windthrow: in the gaps, trunks lying the one way, a little scatter in it
    for (let z = bt.z0 - 6; z > bt.z1 + 6; z -= range(r, 6, 10)) {
      const x = (r() * 2 - 1) * (HALF_W + 4);
      if (!h.clear(x, z, LANE + 5)) continue;
      const a = st.wind + (r() - 0.5) * 0.35;
      const p = h.log(x, z, a);
      if (p && r() < 0.4) kit.post(x - wx * 4, z - wz * 4, 0, 'roots');
    }
    // the glades' lilies, reeds on the shoals, marsh gas
    for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 4, 7)) {
      const x = (r() * 2 - 1) * (HALF_W + 4);
      if (!h.clear(x, z, LANE - 1)) continue;
      if (h.wet(x, z)) {
        const q = r();
        if (q < 0.35) h.lilies(x, z, 3 + Math.floor(r() * 4));
        else if (q < 0.55) kit.emit('bubble', x, z);
      } else h.reeds(x, z, 4);
    }
    // fog among the trunks, the length of the stand, both sides
    for (let z = bt.z0 - 6; z > bt.z1 + 6; z -= range(r, 12, 18))
      for (const side of [-1, 1]) if (r() < 0.75) kit.emit('fog', b.lane(z) + side * range(r, 16, 32), z);
  }
}

/**
 * The slough: reeds and sedge along the point bars, snags and heather on the cut banks, the oxbows
 * ringed with reeds and lilies, a punt on the water and a hut up on a bend; guns on the cut banks
 * at the bends' outsides.
 */
function sloughPlan(
  kit: Kit,
  b: Mire,
  bt: Beat,
  h: Pick<Hands, 'snag' | 'log' | 'cushions' | 'cotton' | 'reeds' | 'lilies' | 'punt' | 'hut' | 'pole' | 'fog' | 'clear' | 'dry' | 'wet'>,
) {
  const r = kit.r;
  for (const sl of b.sloughs) {
    if (sl.z0 < bt.z1 || sl.z1 > bt.z0) continue;
    let lastPost = Infinity;
    for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 3.5, 5.5)) {
      const rx = sl.x(z);
      const c = sl.x(z + 2) + sl.x(z - 2) - 2 * sl.x(z);
      const out = Math.abs(c) < 0.01 ? 0 : -Math.sign(c);
      for (const side of [-1, 1]) {
        const hw = sl.half(z);
        if (side === out) {
          // the cut bank: heather and moss heaped on its lip, a snag leaning over the water
          const x = rx + side * (hw + range(r, 1.5, 3.5));
          if (r() < 0.45) h.cushions(x + side * 1.5, z, 2 + Math.floor(r() * 3), 2, (xx, zz) => h.dry(xx, zz) && h.clear(xx, zz, hw + 1));
          if (r() < 0.22) h.snag(x + side * 2, z, Math.floor(r() * 4));
          if (lastPost - z > 16 && Math.abs(c) > 0.04 && r() < 0.7) {
            kit.post(rx + side * (hw + 3.2), z, 0, 'bank');
            lastPost = z;
          }
        } else {
          // the point bar: reeds at the water, sedge and cotton-grass above
          h.reeds(rx + side * (hw - range(r, 0.2, 1.2)), z, 3 + Math.floor(r() * 3));
          if (r() < 0.35) h.cotton(rx + side * (hw + range(r, 2.5, 5)), z, 3 + Math.floor(r() * 3));
        }
      }
    }
    for (const bw of sl.bows) {
      // an oxbow: reeds round its ring, lilies on its still water, a snag at its tip
      for (let k = 0; k < 8; k++) {
        const a = bw.open + Math.PI * 0.35 + (k / 7) * Math.PI * 1.3;
        const x = bw.x + Math.cos(a) * bw.r;
        const z = bw.z + Math.sin(a) * bw.r;
        if (r() < 0.5) h.lilies(x, z, 3 + Math.floor(r() * 3));
        else h.reeds(x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6, 3);
      }
      if (r() < 0.6) h.snag(bw.x, bw.z, Math.floor(r() * 4));
    }
    // a punt poling up the slough, another tied under the bank; a turf hut up on a bend, a pole by it
    const zp = lerp(bt.z0, bt.z1, range(r, 0.3, 0.7));
    h.punt(sl.x(zp) + (r() - 0.5) * 2, zp, sl.x(zp - 2) - sl.x(zp + 2), -4);
    const zh = lerp(bt.z0, bt.z1, range(r, 0.2, 0.8));
    const hs = r() < 0.5 ? -1 : 1;
    const hx = sl.x(zh) + hs * (sl.half(zh) + range(r, 7, 10));
    if (Math.abs(hx) < HALF_W + 2 && h.dry(hx, zh)) {
      h.hut(hx, zh, -hs, 0);
      h.pole(hx - hs * 3.2, zh - 2.4);
      kit.post(hx, zh + 4, 0, 'hut');
    }
    // the moss out beyond the banks: hummocks in families, now and then a snag, fog at the sides
    for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= range(r, 6, 10))
      for (const side of [-1, 1]) {
        const x = sl.x(z) + side * range(r, 13, HALF_W + 8);
        if (!h.dry(x, z) || !h.clear(x, z, sl.half(z) + 4)) continue;
        if (r() < 0.6) h.cushions(x, z, 3 + Math.floor(r() * 4), 2.6, (xx, zz) => h.dry(xx, zz) && h.clear(xx, zz, sl.half(zz) + 4));
        else if (r() < 0.4) h.snag(x, z, Math.floor(r() * 6));
      }
    h.fog(bt, 0.6, 28);
  }
}

/**
 * The cuttings: the uncut bog behind each bank with the cutters' huts and their stacked turves; on
 * the floor, turves spread to dry on the baulks between the old cuts, stooks and clamps; barrows
 * and spades at the face; the trackway along the canal, a pole at every bank's corner; punts in the
 * canal laden with peat; guns up on the banks' tops.
 */
function cuttingsPlan(kit: Kit, b: Mire, bt: Beat, h: Pick<Hands, 'snag' | 'cushions' | 'cotton' | 'reeds' | 'punt' | 'hut' | 'pole' | 'track' | 'fog' | 'clear' | 'dry' | 'wet'>) {
  const r = kit.r;
  for (const c of b.cuttings) {
    if (c.z0 !== bt.z0) continue;
    const tside = r() < 0.5 ? -1 : 1;
    // the trackway along the canal's bank, the way the cutters come and go
    h.track(c.x + tside * (c.canal + 1.4), bt.z0 - 1, c.x + tside * (c.canal + 1.4), bt.z1 + 1, 0.12);
    for (const side of [-1, 1] as const) {
      const banks = c.banks[side > 0 ? '1' : '-1'];
      for (const bk of banks) {
        const z0 = Math.min(bk.z0, bt.z0);
        const z1 = Math.max(bk.z1, bt.z1);
        if (z0 - z1 < 3) continue;
        const zm = (z0 + z1) / 2;
        // a pole at the bank's near corner on the floor, where its family's turves are laid
        h.pole(c.x + side * (bk.at - 1.2), z0 - 1, r() < 0.5);
        // the turves: stooks on the baulks, a clamp near the face, a fresh spread by the cut
        for (let z = z0 - 2; z > z1 + 1; z -= range(r, 2.8, 4)) {
          const x = c.x + side * range(r, c.canal + 3, bk.at - 1.6);
          const q = r();
          if (q < 0.45) kit.put('mirefall_peat_turves', x, z, { s: range(r, 0.85, 1.05), variant: 0, rot: turnTo(1, 0, 1, 0) + (r() - 0.5) * 0.2 });
          else if (q < 0.65) kit.put('mirefall_peat_turves', x, z, { s: 1, variant: 2, rot: (r() - 0.5) * 0.1 });
        }
        if (r() < 0.6) kit.put('mirefall_peat_turves', c.x + side * (bk.at - 1.2), zm, { s: 1, variant: 1, rot: Math.PI / 2 + (r() - 0.5) * 0.15, pad: 0.2 });
        // at the face, the cutting going on: a barrow, a spade in the bank, a sledge
        if (r() < 0.7) kit.put('mirefall_peat_tools', c.x + side * (bk.at - 0.9), lerp(z0, z1, range(r, 0.25, 0.75)), { s: 1, variant: Math.floor(r() * 3), rot: turnTo(0, -1, -side, 0) });
        // up on the uncut bog: the moss, a guns' post on the lip, a hut now and then
        const top = c.x + side * (bk.at + range(r, 3.5, 6));
        if (r() < 0.55) kit.post(c.x + side * (bk.at + 2.2), zm, 0, 'bank');
        if (r() < 0.3 && Math.abs(top) < HALF_W + 4) h.hut(top + side * 2, zm, -side, 0);
        else h.cushions(top + side * 3, zm, 3 + Math.floor(r() * 3), 2.4, (xx, zz) => h.dry(xx, zz) && h.clear(xx, zz, bk.at + 2));
      }
    }
    // the canal: punts laden with peat, moored along it or poling
    for (let z = bt.z0 - 8; z > bt.z1 + 6; z -= range(r, 18, 28)) h.punt(c.x + (r() - 0.5) * 1.2, z, (r() - 0.5) * 0.2, -1);
    // smoke from the cutters' fires out on the bog; fog out past the banks
    h.fog(bt, 0.5, 32);
  }
}

/**
 * The polder: the poplars in their rows along the shelterbelts' drains; the farmstead on its yard
 * (cabins, the silo, the tractor, fence lines walking off into the water); the pump-house at its
 * outfall; the fields dressed by their state (the bloom's sacs, sedge, open water); guns on the dike
 * at the pump-house and at the side drains, and in the yard.
 */
function polderPlan(kit: Kit, b: Mire, bt: Beat, h: Pick<Hands, 'snag' | 'cushions' | 'reeds' | 'lilies' | 'fog' | 'clear' | 'dry' | 'wet'>) {
  const r = kit.r;
  for (const p of b.polders) {
    if (p.z0 !== bt.z0) continue;
    const c = Math.cos(p.th);
    const sn = Math.sin(p.th);
    /** The world point at (u, v) in the drain's frame. */
    const at = (u: number, v: number) => ({ x: p.x0 + u * c + v * sn, z: p.zc - u * sn + v * c });
    const v0 = bt.z1 - p.zc + 2;
    const v1 = bt.z0 - p.zc - 2;
    const along = turnTo(0, -1, sn, c);
    // the side drains: a shelterbelt of poplars along the chosen ones, a gun at the dike's corner
    for (let k = Math.ceil((v0 - p.off) / p.pitch); p.off + k * p.pitch < v1; k++) {
      const v = p.off + k * p.pitch;
      const bank = p.belts.get(k);
      for (const side of [-1, 1]) {
        if (bank !== undefined) {
          for (let u = DIKE_OUT + 2; u < HALF_W + 12; u += range(r, 3.2, 3.8)) {
            const q = at(side * u, v + bank * 1.9);
            const fate = r();
            const variant = fate < 0.65 ? 0 : fate < 0.8 ? 2 : fate < 0.92 ? 1 : 3;
            kit.put('mirefall_peat_poplar', q.x, q.z, { s: range(r, 0.92, 1.08), variant, rot: r() * Math.PI * 2, overlap: true });
          }
        } else if (r() < 0.4) {
          // reeds grown up in the drain where nobody keeps it
          const q = at(side * range(r, 10, 26), v);
          h.reeds(q.x, q.z, 4);
        }
        if (r() < 0.3) {
          const q = at(side * 4, v);
          kit.post(q.x, q.z, 0, 'dike');
        }
      }
    }
    // the fields: the bloom swelling in its fields, a fence line along a field's edge
    for (let k = Math.ceil((v0 - p.off) / p.pitch); p.off + k * p.pitch < v1 + p.pitch; k++) {
      const vm = p.off + (k - 0.5) * p.pitch;
      for (const side of [-1, 1] as const) {
        const st = b.field(p, side, k);
        if (st === 'bloom') {
          for (let n = 0; n < 2; n++) {
            const q = at(side * range(r, 10, 30), vm + range(r, -4, 4));
            if (h.clear(q.x, q.z, LANE + 2)) kit.group(q.x, q.z, { kinds: [['mirefall_bloom_mat', 3], ['mirefall_brood_sac', 1]], n: 3, spread: 3.5, big: 1.1, small: 0.6, keep: (xx, zz) => h.dry(xx, zz) && h.clear(xx, zz, LANE + 1) });
          }
        } else if (st === 'flood') {
          const q = at(side * range(r, 12, 28), vm);
          h.lilies(q.x, q.z, 4 + Math.floor(r() * 4));
          if (r() < 0.4) kit.emit('bubble', q.x, q.z);
        } else if (st === 'sedge' && r() < 0.5) {
          const q = at(side * range(r, 10, 30), vm);
          h.cushions(q.x, q.z, 2 + Math.floor(r() * 3), 2, (xx, zz) => h.dry(xx, zz) && h.clear(xx, zz, LANE + 2));
        }
        if (r() < 0.3) {
          // a fence line along the field's edge, its posts walking off into the wet
          for (let u = DIKE_OUT + 3; u < HALF_W + 6; u += 7) {
            const q = at(side * (u + 3.5), vm + p.pitch * 0.32);
            kit.put('mirefall_peat_fence', q.x, q.z, { s: 1, variant: r() < 0.5 ? 0 : 1, rot: along + Math.PI / 2, overlap: true });
          }
        }
      }
    }
    // the farmstead on its yard: cabins round it facing in, the silo, the tank, the tractor
    const f = p.farm;
    const um = (f.u0 + f.u1) / 2;
    const vm = (f.v0 + f.v1) / 2;
    const yard: [number, number, string, number][] = [
      [f.u0 + 3, f.v1 - 2.5, 'mirefall_peat_cabin', 0],
      [f.u1 - 3, f.v1 - 2.5, 'mirefall_peat_cabin', 1],
      [f.u1 - 2.5, f.v0 + 3, 'mirefall_peat_silo', 0],
      [f.u0 + 3.5, f.v0 + 2.5, 'mirefall_peat_cabin', 2],
      [um, vm - 1, 'mirefall_peat_tractor', 0],
    ];
    for (const [u, v, kind, variant] of yard) {
      const q = at(f.side * u, v);
      if (!h.clear(q.x, q.z, LANE + 3)) continue;
      kit.put(kind, q.x, q.z, { s: 1, variant, rot: along + (v > vm ? Math.PI : 0) + (r() - 0.5) * 0.15, pad: 0.3 });
    }
    const fallen = at(f.side * (f.u1 + 4), vm + range(r, -4, 4));
    kit.put('mirefall_peat_silo', fallen.x, fallen.z, { s: 1, variant: 1, rot: along + Math.PI / 2 + (r() - 0.5) * 0.4 });
    for (const [u, v] of [[um, vm], [f.u0 + 1, vm]] as const) {
      const q = at(f.side * u, v);
      kit.post(q.x, q.z, 0, 'farm');
    }
    // the fences round the yard, broken
    for (let v = f.v0; v < f.v1; v += 7) {
      const q = at(f.side * (f.u1 + 1.5), v + 3.5);
      kit.put('mirefall_peat_fence', q.x, q.z, { s: 1, variant: r() < 0.6 ? 1 : 0, rot: along, overlap: true });
    }
    // the pump-house on its pad off the dike, its outfall to the drain; guns either side of it
    const pm = at(p.pump.side * 10, p.pump.v);
    kit.put('mirefall_peat_pumphouse', pm.x, pm.z, { s: 1, rot: turnTo(0, -1, -p.pump.side * c, p.pump.side * sn), overlap: true, pad: 0.5 });
    kit.claim(pm.x, pm.z, 6);
    kit.emit('spill', at(p.pump.side * 2.4, p.pump.v).x, pm.z, 0, (-p.pump.side) as -1 | 1);
    for (const dv of [-6, 6]) {
      const q = at(p.pump.side * 5.5, p.pump.v + dv);
      kit.post(q.x, q.z, 0, 'pump');
    }
    // reeds along the main drain's margin, lilies on it
    for (let v = v0 + 3; v < v1 - 3; v += range(r, 7, 12)) {
      const side = r() < 0.5 ? -1 : 1;
      const q = at(side * (DRAIN - 0.4), v);
      if (r() < 0.5) kit.group(q.x, q.z, { kinds: [['reed_clump', 1]], n: 3, spread: 1.6, big: 1.0, small: 0.7 });
    }
    h.fog(bt, 0.45, 34);
  }
}

/**
 * The hags: on the caps, heather and moss heaped, a hut now and then where the cutters shelter; on
 * the gully floors, the bog oaks the erosion has uncovered (stumps on their roots, trunks lying
 * where they fell four thousand years ago), cotton-grass in the wet; guns on the caps at the
 * gullies' mouths, looking down the way's own.
 */
function hagsPlan(kit: Kit, b: Mire, bt: Beat, h: Pick<Hands, 'snag' | 'log' | 'cushions' | 'cotton' | 'fog' | 'clear' | 'dry'>) {
  const r = kit.r;
  const g = kit.ground;
  for (const hg of b.hags) {
    if (hg.z0 !== bt.z0) continue;
    let lastPost = Infinity;
    for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 1.6, 2.6)) {
      const x = (r() * 2 - 1) * (HALF_W + 6);
      const d = b.gully(hg, x, z);
      if (d > 1.35) {
        // a cap: heather and moss heaped on it, the cutters' turves drying on the broad ones
        if (d > 2.2 && r() < 0.05 && h.clear(x, z, LANE + 4)) kit.put('mirefall_peat_turves', x, z, { rot: r() * Math.PI, variant: Math.floor(r() * 2) });
        else if (r() < 0.7) h.cushions(x, z, 2 + Math.floor(r() * 3), 1.8, (xx, zz) => b.gully(hg, xx, zz) > 1.3 && h.clear(xx, zz, LANE + 2), false);
      } else if (d < 0.7 && h.clear(x, z, LANE - 2)) {
        // a gully's floor: the bog oaks, bare; cotton-grass where it's wet
        const q = r();
        if (q < 0.12) h.snag(x, z, 5, range(r, 0.8, 1.1));
        else if (q < 0.18) h.log(x, z, r() * Math.PI * 2);
        else if (q < 0.4 && g.height(x, z) < WATER + 0.2) h.cotton(x, z, 3 + Math.floor(r() * 3));
      }
    }
    // the way's own gully: the oaks lying along its floor at its edges, guns on the caps over it
    for (let z = bt.z0 - 6; z > bt.z1 + 6; z -= range(r, 5, 8)) {
      const side = r() < 0.5 ? -1 : 1;
      const x = b.lane(z) + side * range(r, LANE - 3, LANE);
      if (r() < 0.35) kit.put('mirefall_peat_log', x, z, { s: range(r, 0.7, 0.9), rot: turnTo(1, 0, 0.2 * side, 1) + (r() - 0.5) * 0.6, variant: Math.floor(r() * 3) });
      const px = b.lane(z) + side * (LANE + 3);
      if (lastPost - z > 14 && b.gully(hg, px, z) > 1.25 && r() < 0.6) {
        kit.post(px, z, 0, 'hag');
        lastPost = z;
      }
    }
    h.fog(bt, 0.5, 30);
  }
}
