/**
 * The Salt Pans: white to the horizon (docs/level-design.md, its layout row). The one place with no
 * relief at all, so its shapes are drawn on the ground: the crust's polygon net, the brine in its
 * eyes, the colours of the spice-salt works. What stands up is salt, grown where the brine wells
 * up; what moves is the caravans on the track, and the cartel come to tax them.
 *
 * A level is a crossing, in off one shore and out on the other, through three grounds (or two, if
 * the stretch is short), each with bones of its own, so no two crossings fly alike:
 * - plates: the open net, its pressure ridges, stands of salt at its junctions;
 * - the buckle: the crust shoved up into ridges across the pan, stacks in rows on them, a break in
 *   each where the track goes through, the cartel's toll on one of them;
 * - eyes: a fault wandering down the pan, brine wells strung along it, salt grown round the big ones;
 * - the works: spice-salt ponds of uneven shape, dykes heaped between them, the brine going from blue to saffron
 *   to rose to white, raked into cones; the track down its causeway, guns at its gate;
 * - the sheet (a flooded year only): the low pan under brine, the net's ridges standing out of it
 *   in white lines, islands of crust, the track across on a causeway;
 * - the hall: a Kehx counting-house under the salt, its vents in ranks, breathing.
 * And a season for the whole crossing: dry (the eyes small, the ponds dried to colour), wet, or
 * flooded. On the track, a story or two: a caravan the cartel raided, burning; a hauler stranded;
 * the leviathan's bones. Bare plates between the grounds: the long bright breathers.
 */

import { routeX, type Beat, type Bones, type Kit, type Layout, type Route } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep, weighted } from '../../util';

/** The brine's level: what dips under it is wet. */
const BRINE = 0;
/** The crust, a hand over the brine. */
const CRUST = 0.42;
/** How high the net's pressure ridges stand. */
const RIDGE = 0.3;

type Season = 'dry' | 'wet' | 'flooded';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  shore: [30, 36],
  breather: [18, 26],
  plates: [58, 74],
  buckle: [64, 78],
  eyes: [58, 72],
  works: [70, 82],
  sheet: [64, 78],
  hall: [54, 64],
};

// the spice-salt's stages, from the brine let in to the salt raked up
const STAGE = { brine: 0, saffron: 1, rose: 2, white: 3 } as const;
const STAIN = [0x9ac8c0, 0xeab868, 0xe6a8a2, 0xfaf6ee];
/** A dyke's width, between two ponds. */
const DYKE = 1.5;

interface Eye {
  x: number;
  z: number;
  r: number;
}
/** A buckle's ridge: across the pan at z (where it crosses x = 0), leaning `lean` (dz per dx), its break at gx. */
interface Shove {
  z: number;
  lean: number;
  gx: number;
  gap: number;
  toll: boolean;
}
interface Works {
  /** Which side (or 0, both). */
  side: -1 | 0 | 1;
  z0: number;
  z1: number;
  /** The causeway's middle, and how far out the ponds start from it. */
  cx: number;
  inner: number;
  /** How wide the ponds are across, and how deep along. */
  cw: number;
  rd: number;
  /** Each column's stage, from the causeway out. */
  stages: number[];
  /** The ponds: each one's middle and its stage (-1 off the works, round its edge). */
  ponds: { x: number; z: number; stage: number; side: -1 | 1 }[];
}
interface Hall {
  x: number;
  z: number;
  rot: number;
  ranks: number;
  files: number;
  step: number;
}
interface Story {
  kind: 'caravan' | 'hauler' | 'bones';
  z: number;
  side: -1 | 1;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Salt extends Bones {
  season: Season;
  track: Route;
  eyes: Eye[];
  shoves: Shove[];
  works: Works[];
  pond(x: number, z: number, wk: Works): [number, number] | 'dyke' | null;
  halls: Hall[];
  stories: Story[];
  /** The net's junctions near (x, z) (where three plates meet), for the stands. */
  junctions(z0: number, z1: number): { x: number; z: number }[];
  /** Is (x, z) on an island of crust or the net's ridges, out of the sheet's brine? */
  dry(x: number, z: number): boolean;
}

/** A hash of two cells, 0..1. */
const hash = (i: number, j: number, s: number) => noise2(i + 0.5, j + 0.5, s);

export const saltpans: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 6271 + Math.round(-z0) * 17 + 3, 0x9e3779b1) ^ 0x5bd1e995);
    const s = seed % 991;

    // the year: dry, wet or flooded
    const season = weighted(r, [['dry', 3.5], ['wet', 3.5], ['flooded', 3]] as const) as Season;

    // the grounds: one with a shape all its own (the buckle's rows, the works' ponds, a flooded
    // year's sheet), and two more of any kind, so no two crossings fly alike; two if there's not
    // room. The works by a shore (the brine's pumped in from the edge), the sheet out in the middle
    const signature = season === 'flooded' && r() < 0.75 ? 'sheet' : r() < 0.5 ? 'works' : 'buckle';
    const rest = shuffle(r, ['plates', 'plates', 'eyes', 'eyes', 'hall', 'buckle', 'works', ...(season === 'flooded' ? ['sheet'] : [])].filter((g) => g !== signature));
    const pool = [signature, ...rest.filter((g, i) => rest.indexOf(g) === i)];
    // (the level's start keeps clear: a shore it starts on reaches back past it)
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.shore[0], first) - LEN.shore[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.breather[0];
    const n = want(3) <= total ? 3 : 2;
    let grounds = shuffle(r, pool.slice(0, n));
    const w = grounds.indexOf('works');
    if (w > 0 && w < n - 1) grounds = r() < 0.5 ? ['works', ...grounds.filter((g) => g !== 'works')] : [...grounds.filter((g) => g !== 'works'), 'works'];
    const sh = grounds.indexOf('sheet');
    if (sh === 0 && n > 2) [grounds[0], grounds[1]] = [grounds[1], grounds[0]];

    // their lengths: each its least, and what's left shared out
    const seq = ['shore', ...grounds.flatMap((g, i) => (i ? ['breather', g] : [g])), 'shore'];
    const least = seq.map((k) => LEN[k][0]);
    const most = seq.map((k) => LEN[k][1]);
    least[0] = Math.max(least[0], first);
    most[0] = Math.max(most[0], least[0]);
    let spare = z0 - z1 - least.reduce((a, b) => a + b, 0);
    // (too short even for its least: all of it shrunk alike)
    const lens = least.map((l) => (spare < 0 ? (l * (z0 - z1)) / (z0 - z1 - spare) : l));
    for (let pass = 0; pass < 4 && spare > 0.5; pass++)
      for (let i = 0; i < seq.length && spare > 0.5; i++) {
        const add = Math.min(spare, (most[i] - lens[i]) * range(r, 0.4, 1));
        lens[i] += add;
        spare -= add;
      }
    // (whatever won't fit in their most goes to the breathers, then the shores)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'breather' ? i : -1)).filter((i) => i >= 0);
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

    // the net: plates of crust, their pressure ridges along the joins; one size and stretch per year
    const cell = range(r, 9.5, 14);
    const phi = r() * Math.PI;
    const aniso = range(r, 1, 1.4);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const sites: [number, number][] = [];
    /** The net at (x, z): how far to the nearest join (world units, about), and the plate's own number. */
    let plate = 0;
    const net = (x0: number, z0: number) => {
      // (warped a little, so the plates grow and shrink across the pan instead of tiling it)
      const x = x0 + (fbm(x0 * 0.02, z0 * 0.02, s + 11) - 0.5) * cell * 1.2;
      const z = z0 + (fbm(x0 * 0.02, z0 * 0.02, s + 12) - 0.5) * cell * 1.2;
      const u = (x * cp + z * sp) / (cell * aniso);
      const v = (-x * sp + z * cp) / cell;
      const iu = Math.floor(u);
      const iv = Math.floor(v);
      sites.length = 0;
      let best = 0;
      let bd = Infinity;
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const a = iu + i;
          const b = iv + j;
          // (every other row shifted half a plate: the plates come out six-sided, as salt cracks)
          const px = a + 0.5 * (b & 1) + 0.25 + hash(a, b, s + 1) * 0.5;
          const pz = b + 0.25 + hash(a, b, s + 2) * 0.5;
          const d = (px - u) ** 2 + (pz - v) ** 2;
          sites.push([px, pz]);
          if (d < bd) {
            bd = d;
            best = sites.length - 1;
            plate = hash(a, b, s + 3);
          }
        }
      // the distance to the join with each other plate: along the line between their middles
      const [ax, az] = sites[best];
      let edge = Infinity;
      for (let k = 0; k < sites.length; k++) {
        if (k === best) continue;
        const [bx, bz] = sites[k];
        const dx = bx - ax;
        const dz = bz - az;
        const l = Math.hypot(dx, dz);
        edge = Math.min(edge, ((u - (ax + bx) / 2) * dx + (v - (az + bz) / 2) * dz) / -l);
      }
      return edge * cell;
    };

    // the track: the caravans' way across, wandering gently, through the buckle's breaks, down
    // the works' causeway, round the eyes
    const k1 = r() * 100;
    const k2 = r() * 100;
    const tx0 = (r() - 0.5) * 14;
    const wander = (z: number) => clamp(tx0 + 9 * Math.sin(z * 0.012 + k1) + 4 * Math.sin(z * 0.031 + k2), -18, 18);

    // each ground's own bones
    const eyes: Eye[] = [];
    const shoves: Shove[] = [];
    const works: Works[] = [];
    const halls: Hall[] = [];
    const faults: Route[] = [];
    const big = season === 'dry' ? 0.75 : season === 'wet' ? 1 : 1.15;
    /** How many of the plates stand out of the sheet as islands. */
    const isles = range(r, 0.18, 0.32);
    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'buckle': {
          // ridges across the pan, all leaning the one way, a break in each: the breaks swing
          // from side to side, so the way through weaves
          const lean = (r() < 0.5 ? -1 : 1) * range(r, 0.2, 0.42);
          const step = range(r, 15, 18.5);
          const k = Math.max(2, Math.floor((len - 16) / step) + 1);
          let side = b.side;
          for (let i = 0; i < k; i++, side = -side as -1 | 1) {
            const zr = b.z0 - 8 - (len - 16) * (k === 1 ? 0.5 : i / (k - 1));
            shoves.push({ z: zr, lean, gx: side * range(r, 7, 15), gap: range(r, 11, 13.5), toll: false });
          }
          // the cartel's toll on the middle one
          shoves[shoves.length - 1 - Math.floor(k / 2)].toll = true;
          break;
        }
        case 'eyes': {
          // a fault down the pan, off to a side, the eyes strung along it, one of them big
          const cx = b.side * range(r, 6, 16);
          const ph = r() * 100;
          const pts: { x: number; z: number }[] = [];
          for (let zz = b.z0 + 4; zz >= b.z1 - 4; zz -= 3) pts.push({ x: cx + 7 * Math.sin(zz * 0.035 + ph) + (fbm(zz * 0.06, 3, s) - 0.5) * 6, z: zz });
          const fault: Route = { kind: 'crack', pts };
          faults.push(fault);
          const mother = b.z0 - len * range(r, 0.35, 0.65);
          for (let zz = b.z0 - 6 - r() * 4; zz > b.z1 + 5; zz -= range(r, 5, 9)) {
            const m = Math.abs(zz - mother) < 5;
            const rad = (m ? range(r, 6.5, 8.5) : range(r, 2, 4.8)) * big;
            const x = routeX(fault, zz) + (m ? 0 : (r() - 0.5) * 3);
            eyes.push({ x, z: m ? mother : zz, r: rad });
            // (and little ones weeping out beside it, off the fault)
            if (r() < 0.5) eyes.push({ x: x + (r() < 0.5 ? -1 : 1) * (rad + range(r, 2.5, 6)), z: zz + (r() - 0.5) * 4, r: range(r, 1.2, 2.4) * big });
            if (m) zz = mother - rad;
          }
          break;
        }
        case 'works': {
          // the ponds on one side of the causeway (or both), from the brine let in at the far
          // edge to the white raked up by the road
          const side = r() < 0.65 ? b.side : 0;
          const cx = side === 0 ? (r() - 0.5) * 4 : side * range(r, -2, 5);
          const stages = season === 'dry' ? [STAGE.white, STAGE.rose, STAGE.saffron, STAGE.saffron] : [STAGE.white, STAGE.rose, STAGE.saffron, STAGE.brine];
          if (r() < 0.4) stages.splice(1, 0, STAGE.white);
          const wk: Works = { side, z0: b.z0 - 5, z1: b.z1 + 5, cx, inner: 3.6, cw: range(r, 9.5, 12), rd: range(r, 9, 11.5), stages, ponds: [] };
          // the ponds laid out by hand to the lie of the pan, not on a grid: rows slanting, each
          // row shifted on from the last, no two ponds the same shape; ragged round the edge
          const slant = (r() - 0.5) * 0.5;
          for (const sd of side === 0 ? ([-1, 1] as const) : ([side] as const)) {
            for (let row = -1; ; row++) {
              const lz = (row + 0.5) * wk.rd;
              const last = wk.z0 - lz < wk.z1;
              const shift = (row & 1 ? 0.5 : 0) * wk.cw * range(r, 0.6, 1);
              for (let col = 0; col <= stages.length; col++) {
                const lx = (col + 0.5) * wk.cw - shift + (r() - 0.5) * wk.cw * 0.45;
                const off = row < 0 || last || col === stages.length || (col === stages.length - 1 && r() < 0.3);
                // (now and then a pond a stage on from its neighbours: they're let in at different times)
                const stage = off ? -1 : r() < 0.25 ? Math.max(0, stages[col] - 1) : stages[col];
                wk.ponds.push({ x: cx + sd * (wk.inner + lx), z: wk.z0 - lz - lx * slant + (r() - 0.5) * wk.rd * 0.4, stage, side: sd });
              }
              if (last) break;
            }
          }
          works.push(wk);
          break;
        }
        case 'hall': {
          const files = 3 + Math.floor(r() * 2);
          const ranks = 4 + Math.floor(r() * 3);
          const step = range(r, 6, 7.2);
          halls.push({ x: b.side * range(r, 0, 9), z: zc, rot: (r() - 0.5) * 0.7, ranks, files, step });
          break;
        }
      }
    }

    // the stories on the track, one or two, where there's room for them
    const stories: Story[] = [];
    const open = beats.filter((b) => b.kind === 'plates' || b.kind === 'breather' || b.kind === 'eyes' || b.kind === 'sheet');
    for (const kind of shuffle(r, ['caravan', 'hauler', 'bones'] as const).slice(0, 1 + (r() < 0.5 ? 1 : 0))) {
      const b = open.find((q) => !stories.some((t) => t.z <= q.z0 && t.z > q.z1));
      if (!b) break;
      stories.push({ kind, z: (b.z0 + b.z1) / 2 + (r() - 0.5) * (b.z0 - b.z1) * 0.3, side: r() < 0.5 ? -1 : 1 });
    }

    // the track's line, now the bones it keeps to are down
    const worksAt = (z: number) => works.find((w) => z <= w.z0 + 10 && z > w.z1 - 10);
    /** Where the track crosses each of the buckle's ridges: through its break. */
    const crosses = shoves.map((q) => ({ z: q.z - q.lean * q.gx, x: q.gx })).sort((a, b) => b.z - a.z);
    /** x through the breaks at z, and how much the track keeps to it (0 away from a buckle). */
    const thru = (zz: number): [number, number] => {
      if (!crosses.length) return [0, 0];
      const i = crosses.findIndex((c) => c.z < zz);
      const hold = (c: { x: number; z: number }) => [c.x, 1 - smoothstep(6, 20, Math.abs(c.z - zz))] as [number, number];
      if (i === 0) return hold(crosses[0]);
      if (i < 0) return hold(crosses[crosses.length - 1]);
      const a = crosses[i - 1];
      const c = crosses[i];
      // (two buckles' ridges: keep to whichever's nearer)
      if (a.z - c.z > 30) return a.z - zz < zz - c.z ? hold(a) : hold(c);
      return [lerp(a.x, c.x, smooth((a.z - zz) / (a.z - c.z))), 1];
    };
    const pts: { x: number; z: number }[] = [];
    for (let zz = z0 + 4; zz >= z1 - 4; zz -= 2) {
      let x = wander(zz);
      // through the buckle: from break to break
      const [bx, bk] = thru(zz);
      x = lerp(x, bx, bk);
      // down the works' causeway
      const wk = worksAt(zz);
      if (wk) x = lerp(x, wk.cx, smoothstep(0, 10, Math.min(wk.z0 + 10 - zz, zz - wk.z1 + 10)));
      // round the eyes, on the side with more room
      for (const e of eyes) {
        const d = Math.abs(zz - e.z);
        if (d > e.r + 10) continue;
        const side = e.x > 0 ? -1 : 1;
        const away = e.x + side * (e.r + 5);
        x = lerp(x, side > 0 ? Math.max(x, away) : Math.min(x, away), smooth(1 - smoothstep(e.r * 0.4, e.r + 10, d)));
      }
      pts.push({ x: clamp(x, -HALF_W + 7, HALF_W - 7), z: zz });
    }
    const track: Route = { kind: 'track', pts };

    /** The sheet's brine over (x, z): 1 under it, 0 out of it, a ragged edge between. */
    const sheetAt = (x: number, z: number) => {
      const b = beatAt(z);
      if (b.kind !== 'sheet') return 0;
      return inside(b, z + (fbm(x * 0.05, z * 0.05, s + 9) - 0.5) * 14, 16);
    };
    const shoreAt = (x: number, z: number) => {
      const b = beatAt(z);
      if (b.kind !== 'shore') return 0;
      const first = b === beats[0];
      // the shore line wanders across the field; sand landward of it
      const len = b.z0 - b.z1;
      const line = first ? b.z1 + len * 0.45 : b.z0 - len * 0.45;
      const d = (first ? z - line : line - z) + (fbm(x * 0.04, z * 0.02, s + 5) - 0.5) * 16 + Math.sin(x * 0.09 + k1) * 4;
      return smoothstep(-2, 6, d);
    };

    /** Is (x, z) in a works' pond (its stage, how far in from its edge), on a dyke, or off the works (null)? */
    const pond = (x: number, z: number, wk: Works): [number, number] | 'dyke' | null => {
      const sd = wk.side === 0 ? (x >= wk.cx ? 1 : -1) : wk.side;
      const out = (x - wk.cx) * sd;
      if (out < wk.inner - 1.5) return null;
      if (out < wk.inner) return 'dyke';
      // the nearest pond's middle, then how far in from its nearest dyke
      const near = wk.ponds.filter((p) => p.side === sd && Math.abs(p.z - z) < wk.rd * 2.5);
      let a = near[0];
      let da = Infinity;
      for (const p of near) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < da) [a, da] = [p, d];
      }
      if (!a) return null;
      // (a soft nearest, so the ponds' corners are rounded where the dykes meet; off the works,
      // only the dyke round its edge)
      const es: number[] = [];
      for (const p of near) {
        if (p === a || (a.stage < 0 && p.stage < 0)) continue;
        const nx = p.x - a.x;
        const nz = p.z - a.z;
        es.push((((a.x + p.x) / 2 - x) * nx + ((a.z + p.z) / 2 - z) * nz) / Math.hypot(nx, nz));
      }
      const lo = Math.min(...es);
      const edge = es.length ? lo - 0.6 * Math.log(es.reduce((sum, e) => sum + Math.exp(-(e - lo) / 0.6), 0)) : Infinity;
      // (the dykes raked up by hand: their edges wander a little)
      const half = DYKE / 2 + (noise2(x * 0.45, z * 0.45, s + 21) - 0.5) * 0.6;
      if (edge < half) return 'dyke';
      return a.stage < 0 ? null : [a.stage, edge - half];
    };
    const worksIn = (z: number) => works.find((w) => z <= w.z0 + 2 && z > w.z1 - 2);

    const ruts = (x: number, z: number) => {
      const d = Math.abs(Math.abs(x - routeX(track, z)) - 1.1);
      return 1 - smoothstep(0.2, 0.5, d);
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      let h = CRUST + (fbm(x * 0.07, z * 0.07, s) - 0.5) * 0.07;
      // the net's ridges, everywhere the crust's whole
      const e = net(x, z);
      let ridge = 1 - smoothstep(0.15, 1.1, e);
      // (broken here and there, as old ridges are)
      ridge *= 0.55 + 0.45 * smoothstep(0.3, 0.6, noise2(x * 0.08, z * 0.08, s + 4));
      const sand = shoreAt(x, z);
      h += RIDGE * ridge * (1 - sand);
      // the shore: low dunes of sand, the crust breaking up into it
      if (sand > 0) h = lerp(h, 0.55 + fbm(x * 0.05, z * 0.09, s + 6) * 1.1, sand);
      switch (b.kind) {
        case 'buckle': {
          const w = inside(b, z, 6);
          for (const q of shoves) {
            const d = Math.abs(z - q.z + q.lean * x) / Math.hypot(1, q.lean);
            if (d > 4) continue;
            // a welt shoved up, broken at the break
            const open = smoothstep(q.gap * 0.35, q.gap * 0.6, Math.abs(x - q.gx));
            const rough = 0.7 + 0.5 * noise2(x * 0.25, q.z, s + 8);
            h += 0.75 * (1 - smoothstep(0.5, 3.2, d)) * open * rough * w;
          }
          break;
        }
        case 'sheet': {
          // the low pan under the brine; the net's ridges and its islands (whole plates) out of it
          const k = sheetAt(x, z);
          if (k > 0 && plate > isles) h = lerp(h, BRINE - 0.16 + RIDGE * 1.1 * (1 - smoothstep(0.1, 0.9, e)), k);
          break;
        }
        case 'works': {
          const wk = worksIn(z);
          if (!wk) break;
          const p = pond(x, z, wk);
          const k = smoothstep(wk.z1 - 2, wk.z1 + 1, z) * (1 - smoothstep(wk.z0 - 1, wk.z0 + 2, z));
          if (p === 'dyke') {
            // a dyke: heaped up by hand between the ponds, lumpy
            h = lerp(h, CRUST + 0.3 + noise2(x * 0.7, z * 0.7, s + 24) * 0.16, k);
          } else if (p) {
            // a pond: a step down into it, brine standing in the first ones
            const floor = p[0] === STAGE.brine ? BRINE - 0.22 : CRUST - 0.14;
            h = lerp(h, lerp(CRUST + 0.2, floor, smoothstep(0, 0.6, p[1])), k);
          }
          // the causeway: a raised road down the works
          h = lerp(h, CRUST + 0.28, (1 - smoothstep(1.6, 2.4, Math.abs(x - wk.cx))) * k);
          break;
        }
        case 'hall': {
          // the crust swelling a little over the hall, its outline in the salt
          for (const hl of halls) {
            const c = Math.cos(hl.rot);
            const sn = Math.sin(hl.rot);
            const u = (x - hl.x) * c - (z - hl.z) * sn;
            const v = (x - hl.x) * sn + (z - hl.z) * c;
            const hw = (hl.files * hl.step) / 2 + 2;
            const hd = (hl.ranks * hl.step) / 2 + 2;
            const sdf = Math.max(Math.abs(u) - hw, Math.abs(v) - hd);
            h += 0.22 * (1 - smoothstep(-6, 2, sdf));
          }
          break;
        }
      }
      // the eyes: brine wells, a crusted lip round each
      for (const ey of eyes) {
        if (Math.abs(z - ey.z) > ey.r * 1.6) continue;
        const d = Math.hypot(x - ey.x, z - ey.z) / ey.r;
        if (d > 1.6) continue;
        const lip = Math.exp(-((d - 1.05) ** 2) * 30) * 0.32;
        const bowl = d < 1 ? (season === 'dry' && ey.r < 3 ? BRINE + 0.08 : BRINE - 0.3 - 1.1 * (1 - d * d)) : h;
        h = d < 1 ? lerp(bowl, h, smoothstep(0.75, 1, d) * 0.4) : h + lip;
      }
      // the track: worn flat, its ruts pressed in; dry across the sheet on its causeway
      const dt = Math.abs(x - routeX(track, z));
      if (dt < 3.5) {
        const flat = 1 - smoothstep(2, 3.5, dt);
        h = lerp(h, Math.max(CRUST - 0.02, b.kind === 'works' ? h : CRUST), flat * (1 - sand) * 0.9);
        h -= ruts(x, z) * 0.06;
      }
      return h;
    };

    const wash = (x: number, z: number) => {
      let v = ruts(x, z) * 0.55 * (1 - shoreAt(x, z) * 0.5);
      for (const f of faults) {
        if (z > f.pts[0].z || z < f.pts[f.pts.length - 1].z) continue;
        v = Math.max(v, (1 - smoothstep(0.25, 0.7, Math.abs(x - routeX(f, z)))) * 0.8);
      }
      return v;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      const sand = shoreAt(x, z);
      if (sand > 0.02) {
        // (combed into ripples by the wind off the pan)
        const rip = smoothstep(0.55, 0.95, Math.sin(z * 0.9 + x * 0.25 + fbm(x * 0.08, z * 0.08, 77) * 6));
        return [rip > 0.5 ? 0xc49a70 : 0xd6b88e, sand * (0.75 + rip * 0.1)];
      }
      const b = beatAt(z);
      if (b.kind === 'works') {
        const wk = worksIn(z);
        const p = wk && pond(x, z, wk);
        if (p === 'dyke') return [0xfffcf4, 0.8];
        if (p) {
          // (mottled: the salt crusting over the colour in patches)
          const mottle = 0.7 + 0.45 * noise2(x * 0.25, z * 0.25, s + 23);
          return [STAIN[p[0]], (p[0] === STAGE.white ? 0.5 : 0.78 * smoothstep(0, 0.8, p[1])) * mottle];
        }
      }
      // damp round the eyes in a wet year: the crust a shade greyer
      if (season !== 'dry')
        for (const ey of eyes) {
          const d = Math.hypot(x - ey.x, z - ey.z) / ey.r;
          if (d < 2.4 && d > 1) return [0xb8c0bc, 0.35 * (1 - smoothstep(1.1, 2.4, d))];
        }
      // the buckle's ridges: fresh white where the crust's been shoved up
      if (b.kind === 'buckle')
        for (const q of shoves) {
          const d = Math.abs(z - q.z + q.lean * x) / Math.hypot(1, q.lean);
          if (d < 3.4) return [0xfffcf4, 0.85 * (1 - smoothstep(1, 3.4, d)) * smoothstep(q.gap * 0.35, q.gap * 0.6, Math.abs(x - q.gx))];
        }
      // the net: its ridges a crest of fresh white, the plates between a shade older and greyer
      const e = net(x, z);
      const crest = 1 - smoothstep(0.2, 0.9, e);
      if (crest > 0.05) return [0xfffcf4, crest * 0.85];
      return [0xd8d0c4, 0.25 * smoothstep(1.2, 4, e) * (0.6 + 0.4 * plate)];
    };

    const junctions = (za: number, zb: number) => {
      const out: { x: number; z: number }[] = [];
      for (let zz = za; zz > zb; zz -= 1)
        for (let xx = -HALF_W - 6; xx <= HALF_W + 6; xx += 1) {
          // a junction: near a join, and the plate next door's join near too (three plates meet)
          if (net(xx, zz) > 0.7) continue;
          let joins = 0;
          for (const [dx, dz] of [[1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]] as const) if (net(xx + dx, zz + dz) < 0.8) joins++;
          if (joins < 3) continue;
          if (out.some((p) => Math.abs(p.x - xx) < cell * 0.45 && Math.abs(p.z - zz) < cell * 0.45)) continue;
          out.push({ x: xx, z: zz });
        }
      return out;
    };
    const dry = (x: number, z: number) => height(x, z) > BRINE + 0.08;

    const bones: Salt = { height, wash, stain, water: BRINE, routes: [track], lines: faults, beats, season, track, eyes, shoves, works, halls, stories, junctions, dry, pond };
    return bones;
  },

  plan(kit, bones) {
    const b0 = bones as Salt;
    plan(kit, b0);
  },
};

/** What the salt grows into, and the salt raked and cut. */
const STACKS = [['kessra_salt_stack', 3], ['kessra_salt_crystal', 1]] as const;
const CRUMBS = [['kessra_salt_crystal', 1]] as const;
const SHORE = [['kessra_brush', 3], ['kessra_ironscrub', 1.4], ['kessra_boulder', 0.6], ['kessra_deadwood', 0.4]] as const;

function plan(kit: Kit, b: Salt) {
  const r = kit.r;
  const track = b.track;
  /** Off the track (nothing stands where the caravans drive). */
  const clear = (m: number) => (x: number, z: number) => Math.abs(x - routeX(track, z)) > m && Math.abs(x) < HALF_W + 8;
  const offTrack = clear(4.2);
  /** A stand of salt: a stack the size of `big` (or a tower you'd hit), its smaller ones round it, crystals at its foot. */
  const stand = (x: number, z: number, n: number, big: number | 'fit', tower = false) => {
    if (!offTrack(x, z)) return;
    if (tower && kit.solid('kessra_salt_tower', x, z, range(r, 0.9, 1.1), r() * Math.PI * 2)) n = Math.max(2, n - 2);
    kit.group(x + (tower ? (r() - 0.5) * 4 : 0), z + (tower ? 3.5 : 0), { kinds: STACKS, n, spread: 2.4 + n * 0.35, big, small: 0.45, keep: offTrack });
  };

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    const zc = (bt.z0 + bt.z1) / 2;
    switch (bt.kind) {
      case 'shore': {
        // the land the pan's edge runs up to: scrub in clumps, a boulder or two, the first crystals
        // where the crust starts
        for (let k = 0, n = 5 + Math.floor(r() * 3); k < n; k++) {
          const z = bt.z0 - len * ((k + 0.2 + r() * 0.6) / n);
          const x = (r() < 0.5 ? -1 : 1) * range(r, 10, HALF_W + 4);
          kit.group(x, z, { kinds: SHORE, n: 4 + Math.floor(r() * 4), spread: 4, big: 1.4, small: 0.7, keep: offTrack });
        }
        break;
      }
      case 'plates':
      case 'breather': {
        // stands at the net's junctions, where the brine's wept up through the joins: more out
        // to the sides than in the middle, now and then a tower; in a breather, hardly any
        const js = b.junctions(bt.z0 - 3, bt.z1 + 3);
        for (const j of shuffle(r, js)) {
          const out = Math.abs(j.x) / HALF_W;
          // (in patches, where the brine's near the surface: a few rich junctions together, bare plates between)
          const seep = smoothstep(0.45, 0.7, noise2(j.x * 0.045, j.z * 0.045, 31));
          const chance = bt.kind === 'breather' ? 0.04 + out * 0.06 : (0.08 + out * 0.3) * 0.25 + seep * 0.75;
          if (r() > chance) continue;
          const tower = bt.kind === 'plates' && out > 0.25 && r() < 0.3;
          stand(j.x, j.z, 3 + Math.floor(r() * 4), tower ? 1.2 : 'fit', tower);
        }
        // and crumbs along the ridges, in twos and threes
        for (const j of js) if (r() < 0.08) kit.group(j.x + (r() - 0.5) * 4, j.z + (r() - 0.5) * 4, { kinds: CRUMBS, n: 2 + Math.floor(r() * 2), spread: 1.6, big: 0.8, small: 0.5, keep: offTrack });
        // flakes blowing off the ridges, more in a dry year
        for (const j of js) if (r() < (b.season === 'dry' ? 0.1 : 0.05)) kit.emit('flakes', j.x, j.z);
        break;
      }
      case 'buckle': {
        // stacks in rows on each ridge, thick in places, a tower here and there, the break left
        // open; the cartel's toll at one of the breaks, guns either side of the track
        for (const q of b.shoves) {
          if (q.z > bt.z0 || q.z < bt.z1) continue;
          const thick = r() * 100;
          for (let x = -HALF_W - 6; x <= HALF_W + 6; x += range(r, 1.8, 2.6)) {
            if (Math.abs(x - q.gx) < q.gap * 0.55) continue;
            const z = q.z - q.lean * x + (r() - 0.5) * 1.2;
            const dense = noise2(x * 0.09, thick, 3);
            if (dense < 0.28) continue;
            if (dense > 0.55 && r() < 0.5) {
              if (offTrack(x, z) && kit.solid('kessra_salt_tower', x, z, range(r, 0.85, 1.05), r() * Math.PI * 2)) x += 2.5;
            } else if (offTrack(x, z)) kit.put(dense > 0.5 ? 'kessra_salt_stack' : 'kessra_salt_crystal', x, z, { s: dense > 0.5 ? 'fit' : 0.9 + r() * 0.3 });
          }
          // (the wind taking flakes off the crests)
          for (let k = 0; k < 3; k++) {
            const x = (r() - 0.5) * HALF_W * 1.8;
            if (Math.abs(x - q.gx) > q.gap * 0.6) kit.emit('flakes', x, q.z - q.lean * x);
          }
          if (q.toll) {
            const z = q.z - q.lean * q.gx;
            for (const side of [-1, 1]) {
              const x = q.gx + side * (q.gap * 0.5 + 1);
              kit.post(x, z + side * q.lean * 0.5 * q.gap, 0, 'toll');
            }
            kit.put('kessra_toll_hut', q.gx + (q.gap * 0.5 + 3.5) * (q.gx > 0 ? 1 : -1), z + 4, { s: 1, rot: 0 });
            kit.emit('smoke', q.gx + (q.gap * 0.5 + 3.5) * (q.gx > 0 ? 1 : -1), z + 4);
          }
        }
        break;
      }
      case 'eyes': {
        // salt grown round the eyes, thickest round the big one; crystals by the small ones;
        // brine bubbling up in them
        for (const e of b.eyes) {
          if (e.z > bt.z0 || e.z < bt.z1) continue;
          if (e.r > 4.5) {
            for (let a = r() * 6, k = 0; k < 5; a += range(r, 0.9, 1.6), k++) {
              const x = e.x + Math.cos(a) * (e.r + 2.2);
              const z = e.z + Math.sin(a) * (e.r + 2.2);
              stand(x, z, 3 + Math.floor(r() * 3), k === 0 ? 'fit' : 1.3, k === 0 && r() < 0.5);
            }
            kit.post(e.x + (e.x > 0 ? -1 : 1) * (e.r + 1.6), e.z + e.r * 0.6, 0, 'well');
            kit.put('kessra_brine_pump', e.x + (e.x > 0 ? 1 : -1) * (e.r + 2), e.z - e.r * 0.3, { s: 1, rot: e.x > 0 ? -Math.PI / 2 : Math.PI / 2 });
          } else if (r() < 0.7) {
            const a = r() * Math.PI * 2;
            kit.group(e.x + Math.cos(a) * (e.r + 1.2), e.z + Math.sin(a) * (e.r + 1.2), { kinds: CRUMBS, n: 2 + Math.floor(r() * 3), spread: 1.6, big: 1, small: 0.5, keep: offTrack });
          }
          if (b.season !== 'dry' || e.r > 3) kit.emit('bubble', e.x, e.z, 0, 1);
        }
        break;
      }
      case 'works': {
        for (const wk of b.works) {
          if (wk.z0 > bt.z0 + 1 || wk.z1 < bt.z1 - 1) continue;
          const sides = wk.side === 0 ? ([-1, 1] as const) : ([wk.side] as const);
          for (const side of sides) {
            // cones raked up in rows on the white ponds, a few half raked; not every pond's cut yet
            for (const p of wk.ponds) {
              if (p.side !== side || p.stage !== STAGE.white || r() < 0.25) continue;
              const step = range(r, 3, 3.6);
              for (let i = -2; i <= 2; i++)
                for (let j = -2; j <= 2; j++) {
                  const x = p.x + i * step + (r() - 0.5) * 0.4;
                  const z = p.z + j * step + (r() - 0.5) * 0.4;
                  const q = b.pond(x, z, wk);
                  if (!q || q === 'dyke' || q[0] !== STAGE.white || q[1] < 1.3 || r() < 0.12) continue;
                  kit.put('kessra_salt_cone', x, z, { s: range(r, 1.6, 2), rot: r() * Math.PI * 2, overlap: true });
                }
            }
            // sluices in the dykes, from each pond on to the next
            const ps = wk.ponds.filter((p) => p.side === side && p.stage >= 0);
            for (const p of ps)
              for (const q of ps) {
                if (q === p || q.stage < p.stage || Math.hypot(q.x - p.x, q.z - p.z) > wk.cw * 1.25 || r() < 0.85) continue;
                if (b.pond((p.x + q.x) / 2, (p.z + q.z) / 2, wk) !== 'dyke') continue;
                kit.put('kessra_sluice', (p.x + q.x) / 2, (p.z + q.z) / 2, { s: 1.35, rot: Math.atan2(q.x - p.x, q.z - p.z), overlap: true });
              }
            // the pump at the head, letting the brine in; sheds, stacks of cut salt, a truck by the gate
            const xo = wk.cx + side * (wk.inner + wk.stages.length * wk.cw - 2);
            kit.put('kessra_brine_pump', clamp(xo, -HALF_W - 4, HALF_W + 4), wk.z0 + 1.5, { s: 1.1, rot: Math.PI, overlap: true });
          }
          // the gate at the works' near end, its guns either side of the causeway, a shed
          const gz = wk.z0 + 2;
          for (const side of [-1, 1]) kit.post(wk.cx + side * 3.4, gz - 1, 0, 'works');
          const yard = wk.side === 0 ? (r() < 0.5 ? -1 : 1) : -wk.side;
          kit.put('kessra_works_shed', wk.cx + yard * 6.5, wk.z1 + 6, { s: 1, rot: yard > 0 ? -Math.PI / 2 : Math.PI / 2 });
          kit.group(wk.cx + yard * 6, wk.z1 + 13, { kinds: [['kessra_salt_blocks', 1]], n: 3, spread: 3, big: 1.1, small: 0.8 });
          kit.post(wk.cx + yard * 4.5, wk.z1 + 2, 0, 'works');
        }
        break;
      }
      case 'sheet': {
        // salt on the islands, the net's lines across the brine; little else
        const js = b.junctions(bt.z0 - 3, bt.z1 + 3).filter((j) => b.dry(j.x, j.z));
        for (const j of shuffle(r, js)) if (r() < 0.35) stand(j.x, j.z, 2 + Math.floor(r() * 3), 'fit', r() < 0.2);
        break;
      }
      case 'hall': {
        // the counting-house's vents in ranks and files over it, one or two fallen in; breathing
        for (const hl of b.halls) {
          const c = Math.cos(hl.rot);
          const sn = Math.sin(hl.rot);
          for (let i = 0; i < hl.files; i++)
            for (let j = 0; j < hl.ranks; j++) {
              if (r() < 0.08) continue;
              const u = (i - (hl.files - 1) / 2) * hl.step;
              const v = (j - (hl.ranks - 1) / 2) * hl.step;
              const x = hl.x + u * c + v * sn;
              const z = hl.z - u * sn + v * c;
              const p = offTrack(x, z) ? kit.put('kessra_kehx_vent', x, z, { s: 1, rot: hl.rot, overlap: true }) : null;
              if (p && r() < 0.35) kit.emit('breath', x, z);
            }
          // its door: a stele at the end, the ledger's marks on it
          const x = hl.x + ((hl.ranks + 1) / 2) * hl.step * sn;
          const z = hl.z + ((hl.ranks + 1) / 2) * hl.step * c;
          kit.put('kessra_stele', x, z, { s: 1, rot: hl.rot });
        }
        break;
      }
    }
    void zc;
  }

  // the stories on the track
  for (const st of b.stories) {
    const x = routeX(track, st.z);
    switch (st.kind) {
      case 'caravan': {
        // a free caravan the cartel caught: its wagons run off the track, burning, salt spilt
        for (let k = 0; k < 3; k++) {
          const z = st.z + 7 - k * 7 + (r() - 0.5) * 2;
          const wx = routeX(track, z) + st.side * (3 + r() * 3 + k * 1.2);
          const p = kit.put('kessra_caravan_wreck', wx, z, { s: 1, rot: (r() - 0.5) * 1.4 + st.side * 0.4, overlap: true });
          if (p && k !== 1) kit.emit('smoke', wx, z);
          kit.group(wx + st.side * 3, z - 2, { kinds: [['kessra_salt_blocks', 2], ['kessra_salt_crystal', 1]], n: 3, spread: 2.5, big: 0.9, small: 0.6, keep: offTrack });
        }
        break;
      }
      case 'hauler': {
        // a hauler left where it broke down, its cargo off-loaded and abandoned
        const hx = x + st.side * 8;
        kit.put('kessra_land_yacht', hx, st.z, { s: 1.3, rot: (r() - 0.5) * 0.6 });
        kit.group(hx + st.side * 4.5, st.z + 6, { kinds: [['kessra_salt_blocks', 1]], n: 3, spread: 3, big: 1, small: 0.7, keep: offTrack });
        break;
      }
      case 'bones': {
        // something huge died out here, long ago: its bones half sunk in the salt
        kit.set('kessra_leviathan', 'giant', st.side * 24, st.z, (r() - 0.5) * 0.5);
        break;
      }
    }
  }
}
