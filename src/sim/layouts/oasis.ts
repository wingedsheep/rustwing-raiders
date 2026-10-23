/**
 * Bluepalm Oasis: water brought to the desert, and everything gathered round it (docs/level-design.md,
 * its layout row). The one place on Kessra where the iron sand turns blue and green, and every line
 * of it follows the water: the qanats bring it under the erg, the springs well it up, the main
 * channel carries it down the palmery and the side channels share it out plot by plot, and the
 * market sits where the caravan road meets it.
 *
 * A level is a caravan's arrival, in over the erg and out over the dunes on the far side, through
 * three grounds (or two, if the stretch is short) in the order the water runs through them, each
 * with bones of its own, so no two arrivals fly alike:
 * - the qanats: open erg, its dunes all combed the one way, the shafts' spoil mounds in dotted
 *   lines converging on the oasis, sand fences in rows against the dunes;
 * - the springs: a chain of turquoise pools, one mother pool among them, reeds on the sheltered
 *   banks, salt-white beaches, the bluecrowns in twos and threes on the banks, a noria lifting the
 *   water out of the mother pool into its trough;
 * - the palmery: the main channel down the middle, the road beside it, side channels branching off
 *   in a herringbone, bunded plots between them (walled orchards of bluecrowns in rows, crop
 *   strips, flooded basins, fallow), dovecotes at the corners;
 * - the market: Bluepalm itself, a street between rows of stalls, alleys off it, the square with
 *   the windcatcher cistern, mud houses behind, the caravanserai near the far gate;
 * - the camp: the caravans drawn up in rings round their fires, striders in lines, cargo set
 *   down, a crawler parked, the cartel's tax tent on the road;
 * - the dry garden: a palmery whose qanat failed, its dead crowns still in their rows, its
 *   channels dry, the dunes coming in over the bunds from one side.
 * And the water for the whole level: a low year (the pools shrunk inside white rings, the side
 * channels dry), a full one, or a flood (the basins under water, the pools brimming). Open dunes
 * between the desert grounds, open watered ground (the commons) between the green ones.
 */

import { routeX, type Beat, type Bones, type Kit, type Layout, type Route } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep, weighted } from '../../util';

/** The water's level (the biome's own, see world/planets.ts). */
const WATER = 0.9;
/** The erg's floor between the dunes. */
const SAND = 1.7;
/** Watered ground: the oasis's floor. */
const FLOOR = 1.55;
/** How high a plot's bund stands over its floor. */
const BUND = 0.34;
/** Half the main channel, and a side channel. */
const CHANNEL = 1.15;
const SIDE = 0.8;
/** The road beside the palmery's main channel: how far off it, and half its width. */
const ROAD_OFF = 4.4;
const ROAD = 2.3;
/** Half the market street. */
const STREET = 6;

type Year = 'low' | 'full' | 'flood';
type Ground = 'qanats' | 'springs' | 'gardens' | 'market' | 'camp' | 'dry';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  erg: [30, 38],
  dunes: [16, 24],
  commons: [14, 22],
  qanats: [54, 68],
  springs: [62, 78],
  gardens: [70, 88],
  market: [70, 84],
  camp: [52, 64],
  dry: [54, 66],
};
/** The order the water runs through them (the dry garden and the camp at the edges). */
const RANK: Record<Ground, number> = { qanats: 0, springs: 1, gardens: 2, camp: 3, market: 4, dry: 5 };
/** Grounds of the oasis itself (watered), between which there are no dunes. */
const GREEN = new Set(['springs', 'gardens', 'market', 'camp', 'commons']);

interface Pool {
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Its ragged outline's seed. */
  k: number;
  mother: boolean;
}
type PlotKind = 'orchard' | 'crops' | 'basin' | 'fallow' | 'drift';
interface Plot {
  side: -1 | 1;
  row: number;
  u0: number;
  u1: number;
  z0: number;
  z1: number;
  kind: PlotKind;
  /** Crop rows across (along x) or down (along z). */
  across: boolean;
  /** One cultivar a plot: the same tree all through it. */
  variant: number;
}
interface Garden {
  z0: number;
  z1: number;
  x0: number;
  amp: number;
  ph: number;
  /** Which side of the channel the road runs. */
  rs: -1 | 1;
  dead: boolean;
  /** Which side the dunes come in from (the dry garden). */
  drift: -1 | 1;
  /** The rows' edges, near to far (the first is z0, the last z1). */
  rows: number[];
  plots: Plot[];
}
interface Market {
  z0: number;
  z1: number;
  cx: number;
  ph: number;
  /** The square. */
  q0: number;
  q1: number;
  /** The alleys off the street (their middles). */
  alleys: number[];
  /** Which side the caravanserai stands (the windcatcher on the other). */
  side: -1 | 1;
}
interface Laager {
  x: number;
  z: number;
  r: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Oasis extends Bones {
  year: Year;
  road: Route;
  /** The qanats' lines, each from the erg (pts[0] end) towards the oasis. */
  qanats: { pts: { x: number; z: number }[]; toward: 1 | -1 }[];
  pools: Pool[];
  /** Where a pool is (0 dry … 1 deep in), and its shore band (1 on the beach). */
  pool(x: number, z: number): [number, number, Pool | null];
  gardens: Garden[];
  spine(g: Garden, z: number): number;
  plotAt(g: Garden, x: number, z: number): Plot | null;
  markets: Market[];
  street(mk: Market, z: number): number;
  laagers: Laager[];
  /** How much (x, z) is dune country (0 the oasis's floor … 1 the open erg). */
  dune(x: number, z: number): number;
  /** The noria's spot, if the springs have one: on the mother pool's lip, the trough leading off. */
  noria: { x: number; z: number; face: -1 | 1 } | null;
}

export const oasis: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 7349 + Math.round(-z0) * 31 + 5, 0x9e3779b1) ^ 0x2c1b3c6d);
    const s = seed % 997;

    // the year: low, full, or a flood
    const year = weighted(r, [['low', 3], ['full', 4], ['flood', 2.5]] as const) as Year;

    // the grounds: one the oasis can't be without (its market, its gardens or its springs), two more
    // of any kind, in the order the water runs through them, from either side
    const sig: Ground = weighted(r, [['market', 3.5], ['gardens', 3.5], ['springs', 3]] as const);
    const rest = shuffle(r, ['qanats', 'springs', 'gardens', 'market', 'camp', 'dry'] as Ground[]).filter((g) => g !== sig);
    const picks = [sig, ...rest];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.erg[0], first) - LEN.erg[0];
    const want = (n: number) => picks.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.dunes[0];
    const n = want(3) <= total ? 3 : 2;
    // (the camp sits either side of the market; the dry garden at either edge)
    const rank = (g: Ground) => RANK[g] + (g === 'camp' && r() < 0.5 ? 1.5 : 0) + (g === 'dry' && r() < 0.5 ? -6 : 0);
    let grounds = picks.slice(0, n).map((g) => [g, rank(g)] as const).sort((a, b) => a[1] - b[1]).map(([g]) => g);
    if (r() < 0.5) grounds = grounds.reverse();
    // (the qanats always run into the oasis: never between two of its grounds)
    const qi = grounds.indexOf('qanats');
    if (qi > 0 && qi < grounds.length - 1) grounds = ['qanats', ...grounds.filter((g) => g !== 'qanats')];

    // between two green grounds the commons, else open dunes
    const seq: string[] = ['erg'];
    grounds.forEach((g, i) => {
      if (i) seq.push(GREEN.has(grounds[i - 1]) && GREEN.has(g) ? 'commons' : 'dunes');
      seq.push(g);
    });
    seq.push('erg');

    // their lengths: each its least, and what's left shared out
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
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'dunes' || k === 'commons' ? i : -1)).filter((i) => i >= 0);
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
    // (the dry garden too: the dunes come into it from one side only)
    const greens = beats.filter((b) => GREEN.has(b.kind) || b.kind === 'dry');
    /** Which way along z the oasis lies from beat b: -1 further on, 1 back, 0 if neither. */
    const towards = (b: Beat): -1 | 1 | 0 => {
      const i = beats.indexOf(b);
      const ahead = beats.slice(i + 1).some((q) => GREEN.has(q.kind));
      const behind = beats.slice(0, i).some((q) => GREEN.has(q.kind));
      return ahead && !behind ? -1 : behind && !ahead ? 1 : ahead ? -1 : 0;
    };

    // the dunes: long transverse ridges all combed by the one wind, a gentle windward slope and a
    // steep lee, bigger in patches; one wind per level
    const phi = (r() - 0.5) * 0.9;
    const cph = Math.cos(phi);
    const sph = Math.sin(phi);
    const wave = range(r, 16, 22);
    const tall = range(r, 2.6, 3.4);
    /** Where (x, z) is on its dune: 0 the trough, up the windward slope to the crest at 0.72, down the lee. */
    const phase = (x: number, z: number) => {
      const p = (z * cph + x * sph) / wave + (fbm(x * 0.02, z * 0.02, s + 1) - 0.5) * 1.6;
      return p - Math.floor(p);
    };
    const crest = (x: number, z: number) => {
      const f = phase(x, z);
      const prof = f < 0.72 ? smooth(f / 0.72) : 1 - smooth((f - 0.72) / 0.28);
      return prof * tall * (0.5 + 0.7 * fbm(x * 0.03, z * 0.03, s + 2));
    };

    // each ground's own bones
    const qanats: Oasis['qanats'] = [];
    const pools: Pool[] = [];
    const gardens: Garden[] = [];
    const markets: Market[] = [];
    const laagers: Laager[] = [];
    let noria: Oasis['noria'] = null;
    const scale = year === 'low' ? 0.78 : year === 'full' ? 1 : 1.14;
    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'qanats':
        case 'erg': {
          // the qanats: lines of shafts from out in the erg, converging on the oasis's edge;
          // across the whole of their own ground, a few in an erg that leads in
          const to = towards(b);
          if (!to || (b.kind === 'erg' && (b !== beats[0] || beats[1]?.kind === 'qanats'))) break;
          const k = b.kind === 'qanats' ? 2 + Math.floor(r() * 2) : 1 + (r() < 0.6 ? 1 : 0);
          // (they meet where the water comes out: a mouth near the oasis's edge)
          const mouth = (r() - 0.5) * 16;
          const far = to < 0 ? b.z0 + 2 : b.z1 - 2;
          const near = to < 0 ? b.z1 + (b.kind === 'erg' ? 4 : 2) : b.z0 - (b.kind === 'erg' ? 4 : 2);
          for (let i = 0; i < k; i++) {
            const x0 = (k === 1 ? (r() < 0.5 ? -1 : 1) : lerp(-1, 1, i / (k - 1))) * range(r, 18, HALF_W + 6) + (r() - 0.5) * 6;
            const x1 = mouth + (i - (k - 1) / 2) * range(r, 3, 6);
            const bow = (r() - 0.5) * 10;
            const pts: { x: number; z: number }[] = [];
            for (let t = 0; t <= 1.0001; t += 0.05) pts.push({ x: lerp(x0, x1, t) + Math.sin(t * Math.PI) * bow, z: lerp(far, near, t) });
            qanats.push({ pts, toward: to < 0 ? -1 : 1 });
          }
          break;
        }
        case 'springs': {
          // a chain of pools, the mother pool off to one side, the rest strung down the ground,
          // side to side, so the road weaves between them
          const ms = b.side;
          const mz = b.z0 - len * range(r, 0.35, 0.6);
          const mother: Pool = { x: ms * range(r, 11, 17), z: mz, rx: range(r, 8.5, 10.5) * scale, rz: range(r, 6.5, 8) * scale, k: r() * 100, mother: true };
          pools.push(mother);
          let side = -ms;
          for (let zz = b.z0 - 8; zz > b.z1 + 6; zz -= range(r, 11, 16), side = -side) {
            if (Math.abs(zz - mz) < mother.rz + 7) continue;
            const rr = range(r, 3.2, 5.5) * scale;
            const p: Pool = { x: side * range(r, 9, 24), z: zz, rx: rr * range(r, 1, 1.35), rz: rr, k: r() * 100, mother: false };
            if (pools.some((q) => Math.hypot((q.x - p.x) / (q.rx + p.rx + 4), (q.z - p.z) / (q.rz + p.rz + 4)) < 1)) continue;
            pools.push(p);
            // (and a little one weeping out beside it)
            if (r() < 0.45) {
              const q: Pool = { x: p.x + side * (p.rx + range(r, 3, 5)), z: zz + (r() - 0.5) * 5, rx: range(r, 1.6, 2.4) * scale, rz: range(r, 1.4, 2) * scale, k: r() * 100, mother: false };
              pools.push(q);
            }
          }
          noria = { x: mother.x - ms * (mother.rx + 0.6), z: mother.z + mother.rz * 0.15, face: (-ms) as -1 | 1 };
          break;
        }
        case 'gardens':
        case 'dry': {
          const g: Garden = { z0: b.z0 - 2, z1: b.z1 + 2, x0: (r() - 0.5) * 14, amp: range(r, 1.5, 4), ph: r() * 100, rs: r() < 0.5 ? -1 : 1, dead: b.kind === 'dry', drift: b.side, rows: [], plots: [] };
          // rows across, each its own depth; plots along each row, each its own width, so the
          // bunds don't line up row to row (they were laid out a plot at a time)
          g.rows.push(g.z0);
          while (g.rows[g.rows.length - 1] - g.z1 > 19) g.rows.push(g.rows[g.rows.length - 1] - range(r, 11.5, 14.5));
          g.rows.push(g.z1);
          for (let row = 0; row < g.rows.length - 1; row++)
            for (const sd of [-1, 1] as const) {
              let u = sd === g.rs ? ROAD_OFF + ROAD + 0.4 : CHANNEL + 0.9;
              for (let col = 0; u < HALF_W + 16; col++) {
                const w = range(r, 10, 14.5);
                // nearer the water, more of the orchards; out at the edge, fallow; the year floods
                // the basins (in a dry garden, the dead orchards and the sand)
                const out = clamp((u - 6) / 30, 0, 1);
                const kind: PlotKind = g.dead
                  ? weighted(r, [['orchard', 1.4 - out * 0.6], ['fallow', 0.6], ['drift', 0.3 + out]] as const)
                  : weighted(r, [['orchard', 0.35 + out * 1.6], ['crops', 1.2 - out * 0.5], ['basin', (year === 'flood' ? 0.9 : year === 'full' ? 0.35 : 0.04) * (1.2 - out)], ['fallow', 0.1 + out * 0.3]] as const);
                g.plots.push({ side: sd, row, u0: u, u1: u + w, z0: g.rows[row], z1: g.rows[row + 1], kind, across: r() < 0.5, variant: Math.floor(r() * 3) });
                u += w;
              }
            }
          gardens.push(g);
          break;
        }
        case 'market': {
          const q0 = b.z0 - len * range(r, 0.22, 0.32);
          const mk: Market = { z0: b.z0 - 3, z1: b.z1 + 3, cx: (r() - 0.5) * 10, ph: r() * 100, q0, q1: q0 - range(r, 16, 20), alleys: [], side: r() < 0.5 ? -1 : 1 };
          for (let zz = mk.q1 - range(r, 10, 14); zz > mk.z1 + 10; zz -= range(r, 14, 19)) mk.alleys.push(zz);
          markets.push(mk);
          break;
        }
        case 'camp': {
          // the caravans drawn up in rings, either side of the road, down the ground
          let side = b.side;
          for (let zz = b.z0 - 12; zz > b.z1 + 10; zz -= range(r, 17, 22), side = -side as -1 | 1) laagers.push({ x: side * range(r, 13, 21), z: zz, r: range(r, 5.5, 6.8) });
          break;
        }
      }
      void zc;
    }

    const spine = (g: Garden, z: number) => g.x0 + g.amp * Math.sin(z * 0.022 + g.ph);
    const street = (mk: Market, z: number) => mk.cx + 1.5 * Math.sin(z * 0.03 + mk.ph);
    const gardenIn = (z: number, m = 0) => gardens.find((g) => z <= g.z0 + m && z > g.z1 - m);
    const marketIn = (z: number, m = 0) => markets.find((mk) => z <= mk.z0 + m && z > mk.z1 - m);

    // the road: the caravans' way through, wandering gently over the erg, down the market's street,
    // beside the palmery's channel, between the camp's rings, round the pools
    const k1 = r() * 100;
    const k2 = r() * 100;
    const rx0 = (r() - 0.5) * 12;
    const wander = (z: number) => clamp(rx0 + 7 * Math.sin(z * 0.011 + k1) + 3 * Math.sin(z * 0.029 + k2), -15, 15);
    const pts: { x: number; z: number }[] = [];
    for (let zz = z0 + 4; zz >= z1 - 4; zz -= 2) {
      let x = wander(zz);
      const g = gardenIn(zz, 14);
      if (g) x = lerp(x, spine(g, zz) + g.rs * ROAD_OFF, smoothstep(0, 14, Math.min(g.z0 + 14 - zz, zz - g.z1 + 14)));
      const mk = marketIn(zz, 14);
      if (mk) x = lerp(x, street(mk, zz), smoothstep(0, 14, Math.min(mk.z0 + 14 - zz, zz - mk.z1 + 14)));
      // round the pools, on the side with more room
      for (const p of pools) {
        const d = Math.abs(zz - p.z);
        if (d > p.rz + 12) continue;
        const sd = p.x > 0 ? -1 : 1;
        const away = p.x + sd * (p.rx + 5.5);
        x = lerp(x, sd > 0 ? Math.max(x, away) : Math.min(x, away), smooth(1 - smoothstep(p.rz * 0.5, p.rz + 12, d)));
      }
      pts.push({ x: clamp(x, -HALF_W + 8, HALF_W - 8), z: zz });
    }
    const road: Route = { kind: 'road', pts };

    /** How much (x, z) is dune country: the erg's, fading out over the oasis's edge. */
    const dune = (x: number, z: number) => {
      let d = Infinity;
      for (const gb of greens) d = Math.min(d, z > gb.z0 ? z - gb.z0 : z < gb.z1 ? gb.z1 - z : 0);
      let m = smoothstep(0, 16, d + (fbm(x * 0.04, z * 0.03, s + 3) - 0.5) * 10);
      // the dry garden: the dunes coming in from its drift side
      const b = beatAt(z);
      if (b.kind === 'dry') {
        const g = gardenIn(z);
        const u = g ? (x - spine(g, z)) * g.drift : x;
        m = Math.max(m, inside(b, z, 10) * smoothstep(-6, 26, u + (fbm(x * 0.05, z * 0.05, s + 4) - 0.5) * 16) * 0.85);
      }
      if (b.kind === 'camp') m = Math.max(m, 0.25);
      return m;
    };

    /** A pool's pull at (x, z): how far in (1 at its middle, 0 at its lip, < 0 outside), and the pool. */
    const pool = (x: number, z: number): [number, number, Pool | null] => {
      let best: Pool | null = null;
      let bd = Infinity;
      for (const p of pools) {
        if (Math.abs(z - p.z) > p.rz * 1.8 + 2) continue;
        const a = Math.atan2((z - p.z) / p.rz, (x - p.x) / p.rx);
        // (a ragged outline: each pool its own)
        const rr = 1 + 0.16 * (noise2(Math.cos(a) * 1.3 + p.k, Math.sin(a) * 1.3, 5) - 0.5) * 2;
        const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz) / rr;
        if (d < bd) [bd, best] = [d, p];
      }
      if (!best) return [-1, 0, null];
      return [1 - bd, bd, best];
    };

    /** The plot at (x, z) in garden g. */
    const plotAt = (g: Garden, x: number, z: number): Plot | null => {
      const u = x - spine(g, z);
      const sd = u >= 0 ? 1 : -1;
      const au = Math.abs(u);
      for (const p of g.plots) if (p.side === sd && z <= p.z0 && z > p.z1 && au >= p.u0 && au < p.u1) return p;
      return null;
    };

    const ruts = (x: number, z: number) => {
      const d = Math.abs(Math.abs(x - routeX(road, z)) - 1.0);
      return 1 - smoothstep(0.2, 0.5, d);
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      const m = dune(x, z);
      // the oasis's floor, rolling a little; the erg's dunes
      let h = FLOOR + (fbm(x * 0.05, z * 0.05, s + 5) - 0.5) * 0.3;
      if (m > 0) h = lerp(h, SAND + crest(x, z), m);
      switch (b.kind) {
        case 'springs': {
          // low rises between the pools
          h += inside(b, z, 12) * smoothstep(0.45, 0.8, fbm(x * 0.035, z * 0.035, s + 6)) * 1.1;
          break;
        }
        case 'gardens':
        case 'dry': {
          const g = gardenIn(z);
          if (!g) break;
          const k = smoothstep(g.z1 - 1, g.z1 + 3, z) * (1 - smoothstep(g.z0 - 3, g.z0 + 1, z));
          const sp = spine(g, z);
          const u = x - sp;
          const au = Math.abs(u);
          const onRoad = Math.abs(u - g.rs * ROAD_OFF) < ROAD + 0.6;
          // the plots: a floor, bunds round each, a basin flooded
          const p = plotAt(g, x, z);
          let t = FLOOR + (h - FLOOR) * (g.dead ? 1 : 0.15);
          if (p) {
            const e = Math.min(au - p.u0, p.u1 - au, p.z0 - z, z - p.z1);
            const bund = 1 - smoothstep(0.3, 0.95, e);
            if (p.kind === 'basin' && e > 0.95) t = WATER - 0.24;
            t += BUND * bund * (g.dead ? 0.55 + 0.45 * noise2(x * 0.3, z * 0.3, s + 7) : 1);
          }
          // the side channels, along the rows' edges (the road crosses them on a culvert)
          if (!onRoad && au > CHANNEL)
            for (let i = 1; i < g.rows.length - 1; i++) {
              const d = Math.abs(z - g.rows[i]);
              if (d < SIDE + 0.5) {
                const bed = g.dead || year === 'low' ? FLOOR - 0.3 : WATER - 0.42;
                t = lerp(t, bed, 1 - smoothstep(SIDE - 0.2, SIDE + 0.5, d));
              }
            }
          // the main channel
          if (au < CHANNEL + 0.6) t = lerp(t, g.dead ? FLOOR - 0.35 : WATER - 0.55, 1 - smoothstep(CHANNEL - 0.25, CHANNEL + 0.6, au));
          if (onRoad) t = FLOOR + 0.05;
          h = lerp(h, t, k * (1 - (g.dead ? m * 0.9 : 0)));
          break;
        }
        case 'market': {
          const mk = marketIn(z);
          if (mk) h = lerp(h, FLOOR + 0.12, smoothstep(mk.z1 - 4, mk.z1 + 2, z) * (1 - smoothstep(mk.z0 - 2, mk.z0 + 4, z)));
          break;
        }
        case 'camp':
        case 'commons':
          break;
      }
      // the pools: a bowl, a beach round it
      const [pin, pd, pp] = pool(x, z);
      if (pp) {
        if (pin > 0) h = lerp(WATER - 0.35 - 1.3 * pin * (2 - pin), h, smoothstep(0.12, 0, pin) * 0.5);
        else if (pd < 1.45) h = lerp(WATER + 0.12, h, smoothstep(1.0, 1.45, pd));
      }
      // the road: worn flat through it all, its ruts pressed in
      const dr = Math.abs(x - routeX(road, z));
      if (dr < 4) {
        const flat = 1 - smoothstep(2.4, 4, dr);
        const grade = lerp(FLOOR + 0.05, SAND + 0.35, m);
        h = lerp(h, Math.max(grade, pin > 0 ? grade : Math.min(h, grade + 0.4)), flat * 0.9);
        h -= ruts(x, z) * 0.05;
      }
      return h;
    };

    const wash = (x: number, z: number) => {
      let v = ruts(x, z) * 0.5;
      // the dry channels: a pale bed
      const g = gardenIn(z);
      if (g && (g.dead || year === 'low')) {
        const au = Math.abs(x - spine(g, z));
        for (let i = 1; i < g.rows.length - 1; i++) if (Math.abs(z - g.rows[i]) < SIDE) v = Math.max(v, 0.7);
        if (g.dead && au < CHANNEL) v = Math.max(v, 0.8);
      }
      return v;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      const b = beatAt(z);
      const m = dune(x, z);
      // the pools' shores: wet dark sand at the water, the salt-white beach; in a low year the old
      // shore stands far out round the shrunk pool, a white ring
      const [pin, pd, pp] = pool(x, z);
      if (pp && pin <= 0) {
        const old = year === 'low' ? 1.32 : 1.14;
        if (pd < old) return [0xf0ece0, 0.78 * (1 - smoothstep(old - 0.06, old, pd))];
        if (pd < old + 0.35) return [0x8a7050, 0.4 * (1 - smoothstep(old, old + 0.35, pd))];
      }
      switch (b.kind) {
        case 'gardens':
        case 'dry': {
          const g = gardenIn(z);
          if (!g) break;
          const u = x - spine(g, z);
          if (Math.abs(u - g.rs * ROAD_OFF) < ROAD + 0.4) return [0xe2c89c, 0.55 * (1 - m)];
          const p = plotAt(g, x, z);
          if (!p) break;
          const au = Math.abs(u);
          const e = Math.min(au - p.u0, p.u1 - au, p.z0 - z, z - p.z1);
          const k = (1 - m) * smoothstep(g.z1 - 2, g.z1 + 2, z) * (1 - smoothstep(g.z0 - 2, g.z0 + 2, z));
          if (e < 0.7) return [g.dead ? 0xc8a478 : 0xd2b285, 0.5 * k];
          switch (p.kind) {
            case 'orchard':
              return g.dead ? [0xb08a62, 0.4 * k] : [0x7a5a3c, 0.55 * k];
            case 'crops': {
              // strips: green rows (the grass grows on them) on dark earth
              const w = p.across ? z : au;
              const row = Math.sin(w * 2.1) > -0.15;
              return row ? [year === 'low' ? 0x8a9a5a : 0x5e9a66, 0.85 * k] : [0x6e5034, 0.6 * k];
            }
            case 'fallow':
              return [0xa88660, 0.35 * k];
            case 'drift':
              return [0xe0c090, 0.35 * k];
            default:
              return [0x6a5a40, 0.4 * k];
          }
        }
        case 'market': {
          const mk = marketIn(z);
          if (!mk) break;
          const u = x - street(mk, z);
          const sq = z <= mk.q0 && z > mk.q1;
          const half = sq ? STREET + 7 : STREET;
          if (Math.abs(u) < half) {
            // the square paved in a pattern of pale and blue-grey tiles; the street beaten pale
            if (sq) {
              const t = (Math.floor(x / 2.4) + Math.floor(z / 2.4)) & 1;
              const ring = Math.abs(Math.abs(u) - half + 1.2) < 0.6 || Math.abs(Math.min(mk.q0 - z, z - mk.q1) - 1.2) < 0.6;
              return ring ? [0x5a8aa8, 0.55] : [t ? 0xe8dcc0 : 0xdac8a8, 0.65];
            }
            return [0xe6d2a8, 0.6];
          }
          return [0xc49a6c, 0.35];
        }
        case 'camp': {
          // trampled round the rings
          for (const l of laagers) {
            const d = Math.hypot(x - l.x, z - l.z) / l.r;
            if (d < 1.6) return [0xa47a54, 0.45 * (1 - smoothstep(1.1, 1.6, d))];
          }
          break;
        }
        case 'commons':
        case 'springs': {
          // brine-grass in patches where the water's near the surface (the grass grows on them)
          const g = noise2(x * 0.07, z * 0.07, 41) + (pp ? 0.25 * smoothstep(1.9, 1.2, pd) : 0);
          if (g > 0.6) return [0x8a9a5e, (0.4 + 0.2 * smoothstep(0.6, 0.75, g)) * (1 - m)];
          return [0xb89268, 0.28 * (1 - m)];
        }
      }
      // the dunes painted: the crest's lip a pale line, the lee in shade, the windward combed
      if (m > 0.05) {
        const f = phase(x, z);
        if (f > 0.66 && f < 0.75) return [0xf0d8a6, 0.42 * m * smoothstep(0.66, 0.7, f)];
        if (f >= 0.75) return [0x9a6440, 0.42 * m * (1 - smoothstep(0.9, 1, f))];
        if (f < 0.12) return [0xb07c52, 0.22 * m * (1 - f / 0.12)];
      }
      // the qanats' trace across the erg: a faint line of spoil between the shafts
      for (const q of qanats) {
        if (z > Math.max(q.pts[0].z, q.pts[q.pts.length - 1].z) || z < Math.min(q.pts[0].z, q.pts[q.pts.length - 1].z)) continue;
        const qr: Route = { kind: 'crack', pts: q.toward < 0 ? q.pts : [...q.pts].reverse() };
        const d = Math.abs(x - routeX(qr, z));
        if (d < 1) return [0xb0704c, 0.22 * (1 - smoothstep(0.3, 1, d))];
      }
      return null;
    };

    const lines: Route[] = qanats.map((q) => ({ kind: 'crack', pts: q.toward < 0 ? q.pts : [...q.pts].reverse() }));
    const bones: Oasis = { height, wash, stain, routes: [road], lines, beats, year, road, qanats, pools, pool, gardens, spine, plotAt, markets, street, laagers, dune, noria };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Oasis);
  },
};

/** What grows round the water, and what's set down in the market. */
const BANK = [['kessra_brine_mat', 3], ['kessra_cistern_rosette', 1.4], ['kessra_bladder_bush', 1]] as const;
const SCRUB = [['kessra_brush', 3], ['kessra_ironscrub', 1.2], ['kessra_deadwood', 0.5]] as const;

function plan(kit: Kit, b: Oasis) {
  const r = kit.r;
  const road = b.road;
  /** Off the road (nothing stands where the caravans drive). */
  const clear = (m: number) => (x: number, z: number) => Math.abs(x - routeX(road, z)) > m && Math.abs(x) < HALF_W + 8;
  const offRoad = clear(4);
  const dry = (x: number, z: number) => b.pool(x, z)[0] < -0.12 && offRoad(x, z);
  /** A bluecrown's spot is on dry ground, off the road, with its crown clear of the water. */
  const crown = (x: number, z: number, s: number, variant?: number, rot?: number) =>
    dry(x, z) ? kit.put('kessra_bluecrown', x, z, { s, variant, rot, pad: -0.6 }) : null;

  // the landmarks first, the big forms, then the groups round them, then the details
  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    switch (bt.kind) {
      case 'market': {
        for (const mk of b.markets) {
          if (mk.z0 > bt.z0 || mk.z1 < bt.z1) continue;
          const sx = (z: number) => b.street(mk, z);
          // the windcatcher on the square, standing back off the street, its portal to it
          const zq = (mk.q0 + mk.q1) / 2;
          const wx = sx(zq) - mk.side * (STREET + 7 + 5);
          kit.solid('kessra_windcatcher', wx, zq, 1, (mk.side * Math.PI) / 2);
          kit.post(wx + mk.side * 5, zq - 6, 0, 'cistern');
          // a well in the square, the sun-sails over it
          kit.put('kessra_market_stall', sx(zq) + mk.side * 4, zq + 2, { s: 1.1, variant: 2, overlap: true });
          // (the one with its masts out at the edges: the street stays open)
          kit.set('kessra_sunsails', 'span', 0, zq + (r() - 0.5) * 4, (r() - 0.5) * 0.08, 0);
          // the caravanserai out past the alleys, near the far gate, its portal to the street
          const zc = mk.z1 + 18 + r() * 8;
          kit.put('kessra_caravanserai', sx(zc) + mk.side * (STREET + 16.5), zc, { s: 1, rot: (-mk.side * Math.PI) / 2, overlap: true });
          // the stalls in rows along the street, facing it, gaps at the alleys and the square;
          // the town behind them (both sides at once, so a full screen cuts both alike)
          for (let z = mk.z0 - 3; z > mk.z1 + 2; z -= range(r, 4.6, 5.6))
            for (const sd of [-1, 1] as const) {
              const sq = z <= mk.q0 + 2 && z > mk.q1 - 2;
              const al = mk.alleys.some((a) => Math.abs(z - a) < 3.2);
              // (the caravanserai's gateway kept open to the street)
              const gate = sd === mk.side && Math.abs(z - zc) < 4;
              const face = (-sd * Math.PI) / 2;
              if (!sq && !al && !gate && kit.put('kessra_market_stall', sx(z) + sd * (STREET + 2.4), z, { s: range(r, 0.85, 1), variant: weighted(r, [[0, 3], [1, 1.2]] as const), rot: face + (r() - 0.5) * 0.15, overlap: true }) && r() < 0.35)
                kit.put('kessra_bales', sx(z) + sd * (STREET + 4.6), z + 2, { s: range(r, 0.5, 0.65), overlap: true });
            }
          // blocks of houses wall to wall in rows, lanes between, out to the edge; a house on its
          // own at an alley's mouth
          for (let row = 0; row < 3; row++)
            for (let z = mk.z0 - 5 - row * 2; z > mk.z1 + 4; z -= range(r, 10.8, 12))
              for (const sd of [-1, 1] as const) {
                const u = STREET + 10.2 + row * 11.2;
                const face = (-sd * Math.PI) / 2;
                const nearCaravanserai = sd === mk.side && Math.abs(z - zc) < 14;
                const al = mk.alleys.some((a) => Math.abs(z - a) < 6.5);
                const sq = sd !== mk.side && z <= mk.q0 + 8 && z > mk.q1 - 8 && row < 2;
                if (nearCaravanserai || sq || (row === 2 && r() < 0.4)) continue;
                if (al) {
                  if (row === 0) kit.put('kessra_mud_house', sx(z) + sd * (STREET + 8), z + 4.5, { s: 0.9, rot: face, overlap: true });
                  continue;
                }
                const turn = Math.floor(r() * 4) * (Math.PI / 2);
                kit.put('kessra_house_block', sx(z) + sd * (u + (r() - 0.5) * 0.8), z, { s: range(r, 0.95, 1.05), rot: row === 0 ? face : turn, overlap: true });
              }
          // the alleys: stalls down one side of each
          for (const a of mk.alleys)
            for (const sd of [-1, 1] as const)
              for (let u = STREET + 6; u < STREET + 18; u += range(r, 4.2, 5)) kit.put('kessra_market_stall', sx(a) + sd * u, a - 1.8, { s: 0.8, variant: 0, rot: 0, overlap: true });
          // cargo by the stalls; cook fires
          for (let k = 0; k < 6; k++) {
            const z = range(r, mk.z1 + 4, mk.z0 - 4);
            const sd = r() < 0.5 ? -1 : 1;
            kit.put('kessra_bales', sx(z) + sd * (STREET + 0.4), z, { s: range(r, 0.7, 0.9), pad: 0.2 });
          }
          for (let k = 0; k < 3; k++) {
            const z = range(r, mk.z1 + 6, mk.z0 - 6);
            kit.emit('smoke', sx(z) + (r() < 0.5 ? -1 : 1) * (STREET + 5), z);
          }
          // the gates: guns either side of the street at each end, the toll hut by the near one
          for (const [gz, inward] of [[mk.z0, -1], [mk.z1, 1]] as const) {
            for (const sd of [-1, 1]) kit.post(sx(gz) + sd * (STREET + 1.2), gz + inward * 1.5, 0, 'gate');
            if (inward < 0) kit.put('kessra_toll_hut', sx(gz) + mk.side * (STREET + 3.5), gz - 2, { s: 1, rot: 0, overlap: true });
          }
          // striders at the caravanserai's gate, in a line
          for (let k = 0; k < 4; k++) kit.put('camel_strider', sx(zc) + mk.side * (STREET + 4.5), zc + 9 + k * 2.6, { s: 0.9, rot: (r() - 0.5) * 0.4, overlap: true });
        }
        break;
      }
      case 'springs': {
        // the noria at the mother pool's lip, its trough off away from the water
        if (b.noria) {
          const nr = b.noria;
          kit.put('kessra_noria', nr.x, nr.z, { s: 1, rot: nr.face > 0 ? 0 : Math.PI, overlap: true });
          kit.post(nr.x + nr.face * 6, nr.z + 5, 0, 'wheel');
          kit.emit('bubble', nr.x - nr.face * 1.5, nr.z);
        }
        for (const p of b.pools) {
          if (p.z > bt.z0 || p.z < bt.z1) continue;
          // reeds in an arc on the sheltered (far) side, mat on the beach, crowns back off the
          // bank in twos and threes; the mother pool the most of all
          const n = p.mother ? 4 : p.rx > 3 ? 2 : 1;
          const a0 = -Math.PI / 2 + (r() - 0.5) * 1.2;
          for (let k = 0; k < n * 3; k++) {
            const a = a0 + (k / (n * 3) - 0.5) * (p.mother ? 2.6 : 2);
            const x = p.x + Math.cos(a) * (p.rx * 1.02);
            const z = p.z + Math.sin(a) * (p.rz * 1.02);
            kit.put('kessra_brine_reed', x, z, { s: range(r, 0.8, 1.1), pad: -0.4, overlap: k % 2 === 1 });
          }
          for (let k = 0; k < n; k++) {
            const a = a0 + Math.PI + (r() - 0.5) * 2.2;
            const x = p.x + Math.cos(a) * (p.rx + 4.2);
            const z = p.z + Math.sin(a) * (p.rz + 4.2);
            if (crown(x, z, range(r, 1, 1.25))) {
              kit.group(x + Math.cos(a) * 3, z + Math.sin(a) * 3, { kinds: [['kessra_bluecrown', 1]], n: 1 + Math.floor(r() * 2), spread: 4, big: 0.95, small: 0.75, keep: dry });
            }
          }
          for (let k = 0; k < n + 1; k++) {
            const a = r() * Math.PI * 2;
            kit.group(p.x + Math.cos(a) * (p.rx + 2.2), p.z + Math.sin(a) * (p.rz + 2.2), { kinds: BANK, n: 2 + Math.floor(r() * 3), spread: 2.4, big: 1.1, small: 0.6, keep: dry });
          }
          kit.emit('bubble', p.x + (r() - 0.5) * p.rx * 0.4, p.z + (r() - 0.5) * p.rz * 0.4);
          if (p.mother) kit.emit('bubble', p.x + p.rx * 0.3, p.z - p.rz * 0.2);
        }
        // a seep or two in the rises
        for (let k = 0; k < 2; k++) {
          const z = range(r, bt.z1 + 8, bt.z0 - 8);
          const x = (r() < 0.5 ? -1 : 1) * range(r, 22, HALF_W + 4);
          if (dry(x, z)) kit.put('kessra_seep', x, z, { s: range(r, 0.9, 1.1) });
        }
        // and the aqueduct off over the road, now and then, carrying the noria's water away
        if (r() < 0.45) kit.set('kessra_aqueduct', 'span', 0, bt.z1 + 10, (r() - 0.5) * 0.06, 0);
        break;
      }
      case 'gardens':
      case 'dry': {
        for (const g of b.gardens) {
          if (g.z0 > bt.z0 || g.z1 < bt.z1) continue;
          const sp = (z: number) => b.spine(g, z);
          // the dovecotes at the plots' corners by the road, a gun on each
          for (let i = 1; i < g.rows.length - 1; i++) {
            if (r() < 0.45) continue;
            const z = g.rows[i] + (r() < 0.5 ? 1.8 : -1.8);
            const x = sp(z) + g.rs * (ROAD_OFF + ROAD + 2.2);
            if (kit.put('kessra_garden_tower', x, z, { s: g.dead ? 0.85 : 1, variant: g.dead || r() < 0.65 ? 0 : 1, rot: 0, overlap: true })) kit.post(x - g.rs * 1.6, z + 2.5, 0, 'garden');
          }
          for (const p of g.plots) {
            const side = p.side;
            const at = (u: number, z: number) => sp(z) + side * u;
            const W = p.u1 - p.u0;
            const D = p.z0 - p.z1;
            if (Math.abs(at(p.u0, p.z0)) > HALF_W + 10 && Math.abs(at(p.u1, p.z0)) > HALF_W + 10) continue;
            switch (p.kind) {
              case 'orchard': {
                // the walls on the road side (the orchards are walled), a gate in the middle
                const roadSide = side === g.rs && p.u0 < ROAD_OFF + ROAD + 1;
                if (roadSide) {
                  const nW = Math.max(1, Math.round(D / 8));
                  const sc = (D - 0.4) / (nW * 8);
                  for (let k = 0; k < nW; k++) {
                    const z = p.z0 - 0.2 - (k + 0.5) * 8 * sc;
                    const v = g.dead ? 2 : nW > 1 && k === nW - 1 ? 1 : nW === 1 && r() < 0.5 ? 1 : 0;
                    kit.put('kessra_garden_wall', at(p.u0 + 0.6, z), z, { s: sc, variant: v, rot: side > 0 ? 0 : Math.PI, overlap: true });
                  }
                }
                // the trees in rows, one cultivar to a plot, a quincunx or a square
                // (the grove closes over the plot; the bunds between plots stay open)
                const step = range(r, 4.4, 5);
                const nu = Math.max(1, Math.floor((W - 3.2) / step) + 1);
                const nz = Math.max(1, Math.floor((D - 3.2) / step) + 1);
                const cu = (p.u0 + p.u1) / 2;
                const cz = (p.z0 + p.z1) / 2;
                const quin = r() < 0.4;
                for (let i = 0; i < nu; i++)
                  for (let j = 0; j < nz; j++) {
                    const u = cu + (i - (nu - 1) / 2) * step + (quin && j % 2 ? step / 4 : 0);
                    const z = cz - (j - (nz - 1) / 2) * step;
                    const x = at(u, z);
                    if (g.dead) {
                      if (r() < 0.3) continue;
                      if (dry(x, z)) kit.put('kessra_dead_crown', x, z, { s: range(r, 0.9, 1.1), variant: r() < 0.8 ? 0 : 1, pad: -1 });
                    } else if (crown(x, z, range(r, 0.85, 0.95), p.variant) && r() < 0.7) {
                      // (what grows in their shade, at their feet)
                      const a = r() * Math.PI * 2;
                      kit.put(r() < 0.6 ? 'kessra_bladder_bush' : 'kessra_cistern_rosette', x + Math.cos(a) * 2.2, z + Math.sin(a) * 2.2, { s: range(r, 0.55, 0.7), overlap: true });
                    }
                  }
                break;
              }
              case 'crops': {
                // a row of bladder bushes along one bund, now and then; a rosette at a corner
                if (r() < 0.4) {
                  const z = p.z0 - 0.8;
                  for (let u = p.u0 + 1.5; u < p.u1 - 1; u += range(r, 2.4, 3)) kit.put('kessra_bladder_bush', at(u, z), z, { s: range(r, 0.6, 0.75), pad: -0.5 });
                }
                break;
              }
              case 'basin': {
                // flooded: rosettes on the bunds round it
                for (let k = 0; k < 2; k++) {
                  const z = r() < 0.5 ? p.z0 - 0.4 : p.z1 + 0.4;
                  kit.put('kessra_cistern_rosette', at(range(r, p.u0 + 1, p.u1 - 1), z), z, { s: 0.7, pad: -0.3 });
                }
                break;
              }
              case 'fallow':
              case 'drift': {
                if (r() < 0.4) {
                  const u = range(r, p.u0 + 2, p.u1 - 2);
                  const z = range(r, p.z1 + 2, p.z0 - 2);
                  kit.group(at(u, z), z, { kinds: g.dead ? SCRUB : BANK, n: 2 + Math.floor(r() * 2), spread: 2.2, big: 0.9, small: 0.55, keep: offRoad });
                }
                break;
              }
            }
          }
          // the channel's banks: reeds where it meets each side channel; in the dry garden, the
          // sand fences they gave up on
          for (let i = 1; i < g.rows.length - 1; i++) {
            const z = g.rows[i];
            if (!g.dead && r() < 0.6) kit.put('kessra_brine_reed', sp(z) - g.rs * (CHANNEL + 1.2), z + (r() - 0.5) * 2, { s: 0.75, pad: -0.4 });
          }
          if (g.dead) {
            for (let k = 0; k < 4; k++) {
              const z = range(r, g.z1 + 4, g.z0 - 4);
              const x = sp(z) + g.drift * range(r, 16, 30);
              kit.put('kessra_sand_fence', x, z, { s: 1, rot: Math.PI / 2 + (r() - 0.5) * 0.3, pad: -0.5 });
            }
            for (let k = 0; k < 2; k++) kit.emit('dust', sp(g.z0) + g.drift * range(r, 18, 30), range(r, g.z1 + 6, g.z0 - 6), 8, g.drift);
          }
        }
        break;
      }
      case 'camp': {
        for (const l of b.laagers) {
          if (l.z > bt.z0 || l.z < bt.z1) continue;
          // a ring: haulers and tents round the fire, facing in, cargo between, the striders
          // hobbled in a line outside
          const n = 6 + Math.floor(r() * 2);
          const a0 = r() * Math.PI * 2;
          for (let k = 0; k < n; k++) {
            const a = a0 + (k / n) * Math.PI * 2;
            const x = l.x + Math.cos(a) * l.r;
            const z = l.z + Math.sin(a) * l.r;
            if (!offRoad(x, z)) continue;
            // (the wagons drawn up end to end round the ring, the tents between them facing in)
            if (k % 3 === 0) kit.put('kessra_wagon', x, z, { s: 1, rot: -a + Math.PI / 2, overlap: true });
            else if (kit.put('nomad_tent', x, z, { s: range(r, 0.9, 1.1), rot: -a + Math.PI / 2, overlap: true }) && r() < 0.6)
              kit.put('kessra_bales', l.x + Math.cos(a + 0.35) * (l.r - 1.6), l.z + Math.sin(a + 0.35) * (l.r - 1.6), { s: range(r, 0.55, 0.7), overlap: true });
          }
          kit.put('kessra_bales', l.x + (r() - 0.5) * 2, l.z + (r() - 0.5) * 2, { s: 0.8, overlap: true });
          kit.emit('smoke', l.x, l.z);
          const out = l.x > 0 ? 1 : -1;
          for (let k = 0; k < 4; k++) kit.put('camel_strider', l.x + out * (l.r + 4), l.z - 4 + k * 2.6, { s: 0.9, rot: Math.PI / 2 * out + (r() - 0.5) * 0.4, overlap: true });
        }
        // the tax tent on the road, guns either side of it; a crawler parked out at the edge
        const z = bt.z0 - len * range(r, 0.3, 0.6);
        const x = routeX(road, z);
        const sd = x > 0 ? -1 : 1;
        kit.put('kessra_toll_hut', x + sd * 5.5, z, { s: 1, rot: 0 });
        kit.emit('smoke', x + sd * 5.5, z);
        for (const k of [-1, 1]) kit.post(x + k * 4.5, z - 3, 0, 'toll');
        // (the crawler out past the rings, where none of them is)
        const cz = [0.2, 0.4, 0.6, 0.8].map((t) => bt.z1 + len * t).find((zz) => !b.laagers.some((l) => Math.abs(l.z - zz) < l.r + 12 && l.x * -sd > 0));
        if (cz !== undefined) kit.set('kessra_sandcrawler', 'giant', -sd * (HALF_W + 2), cz, (r() - 0.5) * 0.4);
        break;
      }
      case 'qanats':
      case 'erg': {
        // the shafts, every few metres down each line; old ones out at the far end, a windlass
        // where they're working, the mother well at the head of the longest
        const lines = b.qanats.filter((q) => {
          const zs = q.pts.map((p) => p.z);
          return Math.max(...zs) <= bt.z0 + 3 && Math.min(...zs) >= bt.z1 - 3;
        });
        lines.forEach((q, qi) => {
          let walked = 0;
          let next = 0;
          const total = q.pts.reduce((a, p, i) => a + (i ? Math.hypot(p.x - q.pts[i - 1].x, p.z - q.pts[i - 1].z) : 0), 0);
          const working = range(r, 0.3, 0.7);
          for (let i = 1; i < q.pts.length; i++) {
            const a = q.pts[i - 1];
            const c = q.pts[i];
            const seg = Math.hypot(c.x - a.x, c.z - a.z);
            while (next <= walked + seg) {
              const t = (next - walked) / seg;
              const x = lerp(a.x, c.x, t);
              const z = lerp(a.z, c.z, t);
              const f = next / total;
              const variant = qi === 0 && next === 0 && bt.kind === 'qanats' ? 3 : Math.abs(f - working) < 0.04 ? 1 : f < 0.3 && r() < 0.5 ? 2 : 0;
              if (offRoad(x, z) || Math.abs(x - routeX(road, z)) > 2.8) kit.put('kessra_qanat_shaft', x, z, { s: range(r, 0.9, 1.05), variant, overlap: true });
              if (variant === 3) kit.post(x + 3, z + 2, 0, 'well');
              else if (r() < 0.3) kit.put('kessra_brush', x + (r() - 0.5) * 5, z + (r() - 0.5) * 3, { s: range(r, 0.6, 0.8), overlap: true });
              next += range(r, 3.7, 4.5);
            }
            walked += seg;
          }
        });
        // the sand fences on the way out, where the dunes walk in on the oasis: short runs in
        // double rows (the second a little behind the first, covering its gaps)
        if (bt.kind === 'erg' && kit.beats.indexOf(bt) > 0) {
          const edge = bt.z0 - 7;
          for (let x = -HALF_W - 2 + r() * 6; x < HALF_W + 4; ) {
            const run = 2 + Math.floor(r() * 2);
            const z = edge - r() * 4;
            if (Math.abs(x + run * 3 - routeX(road, z)) > run * 3 + 5) {
              for (let k = 0; k < run; k++)
                for (const back of [0, 1]) kit.put('kessra_sand_fence', x + k * 6 + back * 3, z - back * 2.6, { s: 1, variant: back || r() < 0.3 ? 1 : 0, rot: Math.PI / 2 + (r() - 0.5) * 0.12, overlap: true });
            }
            x += run * 6 + range(r, 7, 13);
          }
        }
        // a few clumps of scrub in the dunes' hollows; a dust devil; dust off the crests
        for (let k = 0; k < 3; k++) {
          const z = range(r, bt.z1 + 4, bt.z0 - 4);
          const x = (r() < 0.5 ? -1 : 1) * range(r, 8, HALF_W + 4);
          kit.group(x, z, { kinds: SCRUB, n: 2 + Math.floor(r() * 3), spread: 3, big: 1.1, small: 0.6, keep: offRoad });
        }
        if (len > 40 || r() < 0.5) kit.emit('devil', (r() - 0.5) * 40, bt.z0 - len * range(r, 0.3, 0.7));
        for (let k = 0; k < 2; k++) kit.emit('dust', (r() - 0.5) * 60, range(r, bt.z1 + 6, bt.z0 - 6), 6, r() < 0.5 ? -1 : 1);
        break;
      }
      case 'dunes': {
        for (let k = 0; k < 2; k++) {
          const z = range(r, bt.z1 + 3, bt.z0 - 3);
          const x = (r() < 0.5 ? -1 : 1) * range(r, 10, HALF_W + 4);
          kit.group(x, z, { kinds: SCRUB, n: 2 + Math.floor(r() * 2), spread: 2.5, big: 1, small: 0.6, keep: offRoad });
        }
        kit.emit('dust', (r() - 0.5) * 50, (bt.z0 + bt.z1) / 2, 6, r() < 0.5 ? -1 : 1);
        break;
      }
      case 'commons': {
        // open watered ground: a few crowns in pairs, mat in the low spots
        for (let k = 0; k < 3; k++) {
          const z = range(r, bt.z1 + 4, bt.z0 - 4);
          const x = (r() < 0.5 ? -1 : 1) * range(r, 12, HALF_W + 4);
          if (crown(x, z, range(r, 0.9, 1.1))) kit.group(x + (r() - 0.5) * 3, z + 2.5, { kinds: BANK, n: 2, spread: 2, big: 0.9, small: 0.6, keep: dry });
        }
        break;
      }
    }
  }
}
