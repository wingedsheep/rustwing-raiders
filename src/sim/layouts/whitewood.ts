/**
 * The Bone-White Woods: the woods at the edge of the Glassing (docs/level-design.md, its layout
 * row). In 244 L the Compact's fire plan burst its last salvos over them to deny the Uukhvar the
 * cover, and the firestorm killed every tree where it stood. Nothing rots on Ashgrave, so 166 years
 * have bleached them bone-white; ash falls on them like snow, under a blue moon, and the moon fungus
 * glowing in the dark hollows is all that lives here, that and the crows. The woods are a record of
 * what happened to them, and every line in them is one of those things: where a shell burst, which
 * way the blast threw the trees, where a titan walked, where the wind laid the ash, where the Sankvi
 * come to cut the bone-wood for the forge's charcoal.
 *
 * A level is a night's crossing, in over the burn line (the fire's last edge, where it went out:
 * black snags on the open ash, then the first white trees) and out between two hollow elders, the
 * fungus glowing out of their feet, through three grounds (two, if the stretch is short), so no two
 * nights fly alike:
 * - the flash: an airburst over the woods. Under it the trees still stand, stripped to poles, burnt
 *   black on the side that faced it; round them every tree lies where the blast threw it, root plate
 *   torn up toward the burst and crown flung away, a starburst out past the field's edges; the way
 *   runs through the poles at its heart;
 * - the stride: a titan walked through the woods in the war, and its footprints are still there, a
 *   line of deep pits holding black water, the trees thrown down either side of its path; at the
 *   end of the line, the titan, fallen on the trees it crushed;
 * - the colliers: the Sankvi's charcoal burners. A wide clearing the way runs straight across,
 *   trodden pale, its stumps in the rows they were felled in; down one side the clamps on their black
 *   pitsteads, the burning one breathing heavy pale smoke, the drag road the charcoal goes out on
 *   behind them, the colliers' huts; across the way the woodyard, the cordwood ricked in rows; past
 *   the clearing, the next cut, felled and waiting;
 * - the nave: the oldest stand, the elders too broad to fly through in two loose ranks, their
 *   crowns meeting over the way; at its heart a hollow giant, the fungus glowing up out of it;
 * - the drifts: the ash the wind has laid in long dunes across the woods, the trees buried to their
 *   crowns, the troughs between scoured dark, ash smoking off every crest.
 * And the ash for the whole night: thin (the ground dark, every tree stark), fallen, or deep (the
 * drifts high, ash heaped in every lee). Glades between the grounds: a lone snag, its crows.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { inField } from '../layout';
import { colsAt, variants } from '../meta';
import type { Placed } from '../terrain';
import { FLIGHT_Y, HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep, weighted } from '../../util';
import { layTitan, at, type Titan } from './titans';

type Ash = 'thin' | 'fallen' | 'deep';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  edge: [34, 42],
  glade: [16, 24],
  flash: [64, 76],
  stride: [80, 96],
  colliers: [62, 76],
  nave: [60, 74],
  drifts: [56, 70],
  gate: [40, 48],
};

/** The ash floor's level. */
const PLAIN = 0.5;
/** The black water standing in the titan's footprints. */
const WATER = PLAIN - 0.8;
/** Half the way kept open (over three ship widths across). */
const AISLE = 7;
/** How high the drifts' dunes heap, and how often a tree has ash heaped in its lee, by the night. */
const DUNE: Record<Ash, number> = { thin: 1.4, fallen: 2.1, deep: 2.9 };
const LEE: Record<Ash, number> = { thin: 0.2, fallen: 0.45, deep: 0.8 };
/** A titan's stride, how far its feet are either side of its line, and a print's half length. */
const STEP = 12.5;
const GAIT = 4.2;
const FOOT = 4.2;

/** The kinds. */
const POLE = 'ashgrave_woods_pole';
const FELLED = 'ashgrave_woods_felled';
const BURNT = 'ashgrave_woods_burnt';
const STUMP = 'ashgrave_woods_stump';
const RICK = 'ashgrave_woods_cordwood';
const CLAMP = 'ashgrave_woods_clamp';
const HUT = 'ashgrave_woods_hut';
const SLED = 'ashgrave_woods_sled';
const CROWN = 'ashgrave_woods_crown';
const ELDER = 'ashgrave_woods_elder';
const TREE = 'white_tree';
const SPIRE = 'ashgrave_pale_spire';
const DRIFT = 'ashgrave_ash_drift';
const LOG = 'ashgrave_fallen_log';
const FUNGUS = 'ashgrave_moon_fungus';
const HOLLOW = 'ashgrave_hollow_giant';
/** A felled tree's length from its root plate to its crown, by variant (set_ashgrave_woods.py). */
const FELL_LEN = [9.6, 11.5, 14.5];

/** An airburst: where it was over the ground, the poles' reach, and the starburst's. */
interface Flash {
  x: number;
  z: number;
  r0: number;
  r1: number;
}

/** A footprint: its middle, the way the titan was walking (radians, world), and which foot. */
interface Print {
  x: number;
  z: number;
  ang: number;
  size: number;
}

/** A titan's walk: its line, its prints, and where it fell. */
interface Stride {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  ang: number;
  prints: Print[];
  titan: Titan;
}

/** A clearing the colliers cut. */
interface Clearing {
  x: number;
  z: number;
  rx: number;
  rz: number;
  seed: number;
  /** The burners' (the clamps, the ricks, the huts), or the next cut, felled and waiting. */
  main: boolean;
  /** Which side of the way the clamps burn on (the woodyard's across it). */
  side: -1 | 1;
}

/** A pitstead: the black ring a clamp burns on, burning (0), opened (1), being built (2) or long cold (3). */
interface Pit {
  x: number;
  z: number;
  r: number;
  v: number;
}

/** An elder's place. */
interface Elder {
  x: number;
  z: number;
  v: number;
  s: number;
  rot: number;
}

/** The dunes of a drifted ground. */
interface Dunes {
  z0: number;
  z1: number;
  /** Their spacing and phase. */
  lam: number;
  ph: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Woods extends Bones {
  ash: Ash;
  /** Which way the wind lays the ash (radians, world). */
  wa: number;
  aisle(z: number): number;
  height(x: number, z: number): number;
  /** The ash floor at (x, z), without the prints dug in it: what a titan lies on. */
  plain(x: number, z: number): number;
  flashes: Flash[];
  strides: Stride[];
  clearings: Clearing[];
  pits: Pit[];
  /** Is (x, z) inside a clearing (0 out .. 1 well in)? */
  cleared(x: number, z: number): number;
  road: Route | null;
  elders: Elder[];
  dunes: Dunes[];
  /** How far up a dune (x, z) is (0 trough .. 1 crest), 0 off the drifts. */
  dune(x: number, z: number): number;
  /** The burn line's z at x, if the level starts on one. */
  burn: ((x: number) => number) | null;
  gate: { x: number; z: number } | null;
}

/** Distance from (x, z) to a segment, and how far along it (0..1). */
function seg(x: number, z: number, ax: number, az: number, bx: number, bz: number): [number, number] {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
  return [Math.hypot(x - ax - dx * t, z - az - dz * t), t];
}

const dirOf = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];

export const whitewood: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 6271 + Math.round(-z0) * 17 + 3, 0x9e3779b1) ^ 0x51ed270b);
    const s = seed % 991;
    const ash = weighted(r, [['thin', 3], ['fallen', 4], ['deep', 3]] as const) as Ash;
    // the wind comes down the field or up it, never quite straight: the drifts lie across the way
    const wa = (r() < 0.5 ? Math.PI / 2 : -Math.PI / 2) + (r() - 0.5) * 0.9;

    // the grounds: one of the war's two marks (the flash, the stride), and two more of any kind;
    // the other mark only now and then; the drifts only where the ash is more than thin, and first
    // in line when it's deep
    const mark = weighted(r, [['flash', 1], ['stride', 1]] as const);
    const other = mark === 'flash' ? 'stride' : 'flash';
    const rest = shuffle(r, ['colliers', 'nave', ...(ash === 'thin' ? [] : ['drifts']), ...(r() < 0.25 ? [other] : [])]);
    if (ash === 'deep' && rest.includes('drifts')) rest.unshift(...rest.splice(rest.indexOf('drifts'), 1));
    const pool = [mark, ...rest];
    // (the level's start keeps clear: an edge it starts on reaches back past it)
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.edge[0], first) - LEN.gate[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.glade[0];
    const n = want(3) <= total ? 3 : 2;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['edge', ...grounds.flatMap((g, i) => (i ? ['glade', g] : [g])), 'gate'];
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
    // (whatever won't fit goes to the glades, else the edge and the gate)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'glade' ? i : -1)).filter((i) => i >= 0);
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

    // the way: wandering between the trees, held to what each ground lays down (through the
    // flash's heart, up the titan's line, between the gate's elders), wider in the nave
    const k1 = r() * 100;
    const k2 = r() * 100;
    const ax0 = (r() - 0.5) * 10;
    const wander = (z: number) => {
      const b = beatAt(z);
      const wide = b.kind === 'nave' ? inside(b, z, 14) : 0;
      return clamp(ax0 + (7 + wide * 4) * Math.sin(z * 0.013 + k1) + (3 + wide * 3) * Math.sin(z * 0.041 + k2), -15, 15);
    };
    const anchors: { x: number; z: number; lin?: boolean }[] = [];
    const flashes: Flash[] = [];
    const strides: Stride[] = [];
    const clearings: Clearing[] = [];
    const pits: Pit[] = [];
    const elders: Elder[] = [];
    const dunes: Dunes[] = [];
    let gate: { x: number; z: number } | null = null;
    let burn: ((x: number) => number) | null = null;

    // first what holds the way
    for (const b of beats) {
      const len = b.z0 - b.z1;
      switch (b.kind) {
        case 'flash': {
          const x = b.side * range(r, 0, 7);
          const zc = b.z0 - len * range(r, 0.44, 0.56);
          flashes.push({ x, z: zc, r0: range(r, 9, 11), r1: Math.min(range(r, 25, 29), len * 0.5 + 2) });
          anchors.push({ x, z: zc });
          break;
        }
        case 'stride': {
          // it came up the field toward the far end, a little across, and fell at the end of its
          // walk, face down along it with its legs back over its last prints
          const xa = -b.side * range(r, 0, 7);
          const xb = xa + b.side * range(r, 4, 11);
          const za = b.z0 - range(r, 4, 7);
          const sc = range(r, 0.78, 0.86);
          // (its last prints well up the ground: the body lies on past it, into the stretch beyond)
          const zb = b.z1 + range(r, 20, 26);
          const ang = Math.atan2(zb - za, xb - xa);
          const prints: Print[] = [];
          const L = Math.hypot(xb - xa, zb - za);
          const [dx, dz] = dirOf(ang);
          for (let k = 0, d = range(r, 1, 4); d < L - 3; k++, d += STEP * range(r, 0.94, 1.06)) {
            const w = (k % 2 ? 1 : -1) * GAIT;
            prints.push({ x: xa + dx * d + dz * w, z: za + dz * d - dx * w, ang: ang + (k % 2 ? -0.12 : 0.12) + (r() - 0.5) * 0.1, size: range(r, 0.92, 1.06) });
          }
          // the body: its middle 11.5 + 24 + a foot past the line's end, along the walk
          const u = (11.5 + 24 + 2.4) * sc;
          const tx = xb + dx * u;
          const tz = zb + dz * u;
          const titan: Titan = {
            side: r() < 0.5 ? 0 : 1,
            pose: r() < 0.4 ? 1 : 0,
            s: sc,
            x: tx,
            z: tz,
            ang,
            head: (r() - 0.5) * 0.9,
            lit: r() < 0.5,
            // the arms flung out ahead as it went down, the legs trailing back over its prints
            arms: [
              { a1: ang + range(r, 0.5, 0.9), a2: ang + range(r, 0.1, 0.4), end: r() < 0.3 ? 'fist' : 'hand' },
              { a1: ang - range(r, 0.5, 0.9), a2: ang - range(r, 0.1, 0.4), end: r() < 0.3 ? 'fist' : 'hand' },
            ],
            legs: [
              { a1: ang + Math.PI - range(r, 0.05, 0.2), a2: ang + Math.PI - range(r, 0, 0.12), end: 'foot' },
              { a1: ang + Math.PI + range(r, 0.05, 0.2), a2: ang + Math.PI + range(r, 0, 0.12), end: 'foot' },
            ],
            job: 'stride',
          };
          strides.push({ x0: xa, z0: za, x1: xb, z1: zb, ang, prints, titan });
          // (up its line, straight; past it, along the body)
          anchors.push({ x: xa, z: za, lin: true }, { x: xb, z: zb, lin: true }, { x: tx, z: tz - 6 });
          break;
        }
        case 'gate': {
          const zg = b.z0 - (b.z0 - b.z1) * range(r, 0.4, 0.5);
          const x = (r() - 0.5) * 8;
          gate = { x, z: zg };
          anchors.push({ x, z: zg });
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
      const near = c && (!a || c.z - z > z - a.z) ? c : a ? a : c;
      if (!near) return w;
      return lerp(near.x, w, smoothstep(6, 30, Math.abs(near.z - z)));
    };
    const off = (x: number, z: number, m = AISLE) => Math.abs(x - aisle(z)) > m;

    // then each ground's own bones, round the way
    let road: Route | null = null;
    for (const b of beats) {
      const len = b.z0 - b.z1;
      switch (b.kind) {
        case 'edge': {
          // the fire's last edge: a ragged line across, past the open ash the level starts on
          const line = b.z0 > 0 ? Math.min(b.z0 - len * 0.55, -12) : b.z0 - len * range(r, 0.4, 0.55);
          const ph = r() * 100;
          burn = (x: number) => line + (fbm(x * 0.05, ph, s + 2) - 0.5) * 12 + Math.sin(x * 0.11 + ph) * 2.5;
          break;
        }
        case 'colliers': {
          // a wide clearing the way runs straight across: the clamps burning in a row on their
          // black pitsteads down one side of it, the drag road behind them, the huts at its back;
          // the woodyard across the way, the cordwood ricked in rows; past its end, the next cut
          const side = b.side;
          const zc = b.z0 - len * range(r, 0.45, 0.55);
          const rz = Math.min(range(r, 22, 26), len * 0.42);
          const rx = range(r, 20, 23);
          clearings.push({ x: aisle(zc) + side * 3, z: zc, rx, rz, seed: r() * 100, main: true, side });
          // the pitsteads, a row down the clamp side; the old cold ones among them
          const nP = rz > 24.5 ? 4 : 3;
          const burning = Math.floor(r() * nP);
          for (let k = 0; k < nP; k++) {
            const z = zc + (k - (nP - 1) / 2) * ((rz * 1.65) / nP) + range(r, -1, 1);
            const v = k === burning ? 0 : r() < 0.3 ? 3 : r() < 0.55 ? 1 : 2;
            pits.push({ x: aisle(z) + side * (AISLE + range(r, 3.8, 4.6)), z, r: range(r, 3.9, 4.3), v });
          }
          // the drag road behind them, the length of the ground, bending out into the woods past it
          const pts: { x: number; z: number }[] = [];
          const off0 = range(r, 13.5, 15);
          for (let zz = b.z0 + 2; zz >= b.z1 - 2; zz -= 3) {
            const bend = smoothstep(rz * 0.7, rz + 12, Math.abs(zz - zc)) * 5;
            pts.push({ x: clamp(aisle(zz) + side * (AISLE + off0 + bend + 1.2 * Math.sin(zz * 0.05 + k1)), -HALF_W + 3, HALF_W - 3), z: zz });
          }
          road = { kind: 'track', pts };
          // the next cut, past the clearing's far end on the woodyard side
          const zc2 = zc + (r() < 0.5 ? -1 : 1) * (rz + range(r, 7, 10));
          if (zc2 < b.z0 - 6 && zc2 > b.z1 + 6) clearings.push({ x: aisle(zc2) - side * range(r, 17, 21), z: zc2, rx: range(r, 7.5, 9), rz: range(r, 6, 8), seed: r() * 100, main: false, side });
          break;
        }
        case 'nave': {
          // the old stand: the elders in two loose ranks either side of the way (old trees space
          // themselves), a few more out at the field's edges, fewer than a screen can hold
          for (const side of [-1, 1])
            for (let zz = b.z0 - range(r, 6, 14); zz > b.z1 + 6; zz -= range(r, 17, 21)) {
              const sc = range(r, 0.95, 1.1);
              const x = aisle(zz) + side * (AISLE + 5.5 + range(r, 0, 3));
              const v = r() < 0.45 ? 0 : r() < 0.6 ? 2 : 1;
              elders.push({ x, z: zz, v, s: sc, rot: v === 0 ? (r() - 0.5) * 0.7 : r() * Math.PI * 2 });
            }
          for (let zz = b.z0 - range(r, 10, 20); zz > b.z1 + 8; zz -= range(r, 26, 34)) {
            const side = r() < 0.5 ? -1 : 1;
            const x = side * range(r, HALF_W - 2, HALF_W + 6);
            if (elders.some((e) => Math.hypot(e.x - x, e.z - zz) < 16) || !off(x, zz, AISLE + 14)) continue;
            elders.push({ x, z: zz, v: 2, s: range(r, 0.9, 1.05), rot: r() * Math.PI * 2 });
          }
          break;
        }
        case 'drifts': {
          dunes.push({ z0: b.z0, z1: b.z1, lam: range(r, 15, 19), ph: r() * 10 });
          break;
        }
      }
    }
    // the gate's elders, either side of the way out
    if (gate) {
      const g = gate as { x: number; z: number };
      for (const side of [-1, 1]) elders.push({ x: aisle(g.z) + side * (AISLE + 5), z: g.z + range(r, -2, 2), v: 0, s: range(r, 1.02, 1.1), rot: side * range(r, 0.05, 0.3) });
    }

    const [wx, wz] = dirOf(wa);
    /** How far up a dune (x, z) is: long ridges across the way, gentle to windward, steep in the lee. */
    const dune = (x: number, z: number) => {
      for (const d of dunes) {
        if (z > d.z0 + 2 || z < d.z1 - 2) continue;
        const ease = smoothstep(0, 10, Math.min(d.z0 - z, z - d.z1));
        const u = (x * wx + z * wz) / d.lam + d.ph + (fbm(x * 0.03, z * 0.03, s + 23) - 0.5) * 1.6;
        const f = u - Math.floor(u);
        const p = f < 0.78 ? smooth(f / 0.78) : smooth((1 - f) / 0.22);
        return p * ease * (0.75 + 0.5 * fbm(x * 0.05, z * 0.05, s + 27));
      }
      return 0;
    };
    const cleared = (x: number, z: number) => {
      let k = 0;
      for (const c of clearings) {
        if (Math.abs(z - c.z) > c.rz + 3) continue;
        const w = (fbm(x * 0.08, z * 0.08, s + c.seed) - 0.5) * 0.5;
        const d = Math.hypot((x - c.x) / c.rx, (z - c.z) / c.rz) + w;
        k = Math.max(k, 1 - smoothstep(0.85, 1.05, d));
      }
      return k;
    };
    const plain = (x: number, z: number) => {
      let h = PLAIN + (fbm(x * 0.04, z * 0.04, s) - 0.5) * 0.8;
      const du = dune(x, z);
      if (du > 0) h += du * DUNE[ash];
      // the clearings levelled by the feet that work them
      const c = cleared(x, z);
      if (c > 0) h = lerp(h, PLAIN + 0.1, c * 0.7);
      return h;
    };

    // the prints: each a deep oval, the heel deepest, three toes gouged ahead, the ash it pushed
    // out heaped round its rim
    const allPrints = strides.flatMap((st) => st.prints);
    const print = (x: number, z: number) => {
      let dig = 0;
      let rim = 0;
      for (const p of allPrints) {
        if (Math.abs(z - p.z) > 9 || Math.abs(x - p.x) > 9) continue;
        const [dx, dz] = dirOf(p.ang);
        const u = ((x - p.x) * dx + (z - p.z) * dz) / p.size;
        const w = (-(x - p.x) * dz + (z - p.z) * dx) / p.size;
        const e = Math.hypot(u / FOOT, w / 3);
        // (the toes: three gouges ahead of the pad, splayed)
        let toe = 9;
        for (const k of [-1, 0, 1]) {
          const [d] = seg(u, w, FOOT * 0.7, k * 1.5, FOOT + 2.8, k * 2.2);
          toe = Math.min(toe, d / 0.7);
        }
        const m = Math.min(e, toe);
        dig = Math.max(dig, 1 - smoothstep(0.75, 1.05, m));
        rim = Math.max(rim, Math.exp(-((m - 1.35) ** 2) * 6));
      }
      return { dig, rim };
    };
    const height = (x: number, z: number) => {
      let h = plain(x, z);
      if (allPrints.length) {
        const p = print(x, z);
        if (p.dig > 0) h = lerp(h, WATER - 0.7, p.dig);
        h += p.rim * 0.45 * (1 - p.dig);
      }
      // the elders' buttresses: the ground heaped round their feet
      for (const e of elders) {
        if (Math.abs(z - e.z) > 6 || Math.abs(x - e.x) > 6) continue;
        h += 0.6 * (1 - smoothstep(2, 6, Math.hypot(x - e.x, z - e.z)));
      }
      return h;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      // the burn line: the ground black where the fire went out, fading into the woods
      if (burn) {
        const d = z - (burn as (x: number) => number)(x);
        if (d < 10 && d > -14) {
          const k = d > 0 ? 1 - smoothstep(2, 10, d) : 1 - smoothstep(0, 14, -d);
          if (k > 0.05) return [0x15151a, 0.7 * k];
        }
      }
      // the flash's heart: the ash bleached pale under it, fading out
      for (const f of flashes) {
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r0 + 8) return [0xb8b4bc, 0.55 * (1 - smoothstep(f.r0 * 0.6, f.r0 + 8, d))];
      }
      // the drag road's ruts, and the clearings' trodden ground, each clamp's black ring
      if (road) {
        const rt = road as Route;
        const p = rt.pts;
        if (z <= p[0].z && z >= p[p.length - 1].z) {
          const i = Math.min(p.length - 2, Math.max(0, Math.floor((p[0].z - z) / 3)));
          const t = (p[i].z - z) / Math.max(1e-6, p[i].z - p[i + 1].z);
          const d = Math.abs(x - lerp(p[i].x, p[i + 1].x, t));
          if (d < 2.4) return [0x24211f, d > 0.8 && d < 1.8 ? 0.5 : 0.25];
        }
      }
      // each pitstead black with the charcoal of a hundred burns, its edge ragged; the soot
      // trodden out round it
      for (const pt of pits) {
        const d = Math.hypot(x - pt.x, z - pt.z) + (fbm(x * 0.3, z * 0.3, s + 41) - 0.5) * 1.2;
        if (d < pt.r + 2.5) return [0x111114, d < pt.r ? (pt.v === 3 ? 0.7 : 0.88) : 0.55 * (1 - smoothstep(pt.r, pt.r + 2.5, d))];
      }
      // the clearing trodden pale, scuffed with charcoal between the pits and the road
      const c = cleared(x, z);
      if (c > 0.05) {
        const scuff = fbm(x * 0.12, z * 0.12, s + 43);
        return scuff > 0.6 ? [0x2e2c2c, 0.4 * c] : [0x9a958e, 0.5 * c];
      }
      // the prints: the ash round them wet and dark
      if (allPrints.length) {
        const p = print(x, z);
        if (p.rim > 0.2) return [0xb8b4b8, 0.55 * p.rim];
      }
      // the drifts: crests pale, troughs scoured dark
      const du = dune(x, z);
      if (dunes.length && (du > 0.6 || (du < 0.15 && dunes.some((d) => z <= d.z0 && z >= d.z1)))) return du > 0.6 ? [0xb4b0b0, 0.45 * smoothstep(0.6, 0.95, du)] : [0x1e1e24, 0.4];
      // and ash laid in long streaks downwind, more of it the deeper the night's ash
      const streak = fbm((x * wx + z * wz) * 0.02, (-x * wz + z * wx) * 0.12, s + 31);
      const amt = { thin: 0.06, fallen: 0.12, deep: 0.2 }[ash];
      if (streak > 0.62) return [0x9c98a0, amt * smoothstep(0.62, 0.72, streak)];
      return null;
    };

    const bones: Woods = {
      height,
      stain,
      beats,
      water: strides.length ? WATER : undefined,
      routes: road ? [road] : [],
      ash,
      wa,
      aisle,
      plain,
      flashes,
      strides,
      clearings,
      pits,
      cleared,
      road,
      elders,
      dunes,
      dune,
      burn,
      gate,
    };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Woods);
  },
};

/** A grove's makeup: mostly the candelabras, or mostly the spires. */
const GROVE_A = [[TREE, 4], [SPIRE, 1]] as const;
const GROVE_B = [[SPIRE, 4], [TREE, 1]] as const;

function plan(kit: Kit, b: Woods) {
  const r = kit.r;
  const [wx, wz] = dirOf(b.wa);
  const off = (m: number) => (x: number, z: number) => Math.abs(x - b.aisle(z)) > m;
  const clear = off(AISLE);
  const inBeat = (bt: Beat, z: number) => z <= bt.z0 && z > bt.z1;

  /**
   * A kind laid down as asked (turned rot, scale s, a variant), kept under the flight line, not
   * in the black water; no room claimed but what `room` says, along its length if it's long.
   */
  const lay = (kind: string, x: number, z: number, rot: number, s: number, variant?: number, room = 0, len = 0): Placed | null => {
    if (z > kit.z0 || z <= kit.z1) return null;
    const vs = variants(kind);
    if (!vs.length) return null;
    const m = vs[Math.min(variant ?? Math.floor(r() * vs.length), vs.length - 1)];
    const y = b.height(x, z);
    if (b.water !== undefined && y < b.water + 0.1) return null;
    const fit = (FLIGHT_Y - 1.5 - y) / Math.max(m.max[1], 0.3);
    s = Math.min(s, fit);
    if (s < 0.35) return null;
    const p: Placed = { kind, variant: m.variant, x, z, y, rot, s, obstacle: false, cols: [], biome: kit.biome };
    kit.props.push(p);
    if (room > 0) {
      const [dx, dz] = [Math.cos(-rot), Math.sin(-rot)];
      const n = Math.max(1, Math.ceil(len / (room * 1.5)));
      for (let k = 0; k <= n; k++) kit.claim(x + dx * len * (k / n), z + dz * len * (k / n), room);
    }
    return p;
  };
  /** A standing tree, if there's room for it. */
  const tree = (kind: string, x: number, z: number, s: number, rot = r() * Math.PI * 2, variant?: number) => {
    const rad = kind === TREE ? 2.2 * s : kind === SPIRE ? 1.5 * s : 1.3 * s;
    if (!kit.free(x, z, rad)) return null;
    const p = lay(kind, x, z, rot, s, variant);
    if (p) kit.claim(x, z, rad);
    return p;
  };
  /** A tree the blast or the titan threw down, rooted at (x, z) and lying along heading `a`, as long as fits `want`. */
  const fell = (x: number, z: number, a: number, want: number) => {
    const v = want > 13 ? 2 : want > 10.5 ? 1 : 0;
    const s = range(r, 0.9, 1.08);
    return lay(FELLED, x, z, -a, s, v, 1.1, FELL_LEN[v] * s * 0.9);
  };
  /** One of the woods' elders, solid at its trunk. */
  const elder = (e: Elder) => {
    const vs = variants(ELDER);
    if (!vs.length || e.z > kit.z0 || e.z <= kit.z1) return null;
    const m = vs[Math.min(e.v, vs.length - 1)];
    const y = b.height(e.x, e.z) - 0.4;
    const cols = colsAt(m, e.x, e.z, y, e.rot, e.s);
    const p: Placed = { kind: ELDER, variant: m.variant, x: e.x, z: e.z, y, rot: e.rot, s: e.s, obstacle: cols.length > 0, cols, biome: kit.biome };
    kit.claim(e.x, e.z, 5 * e.s);
    kit.props.push(p);
    return p;
  };
  /** Ash heaped in a thing's lee, downwind of it. */
  const lee = (x: number, z: number, d: number, s = 1) => {
    if (r() < LEE[b.ash]) lay(DRIFT, x + wx * d, z + wz * d, -b.wa + (r() - 0.5) * 0.4, s * range(r, 0.8, 1.1), r() < 0.7 ? 0 : 1);
  };
  /** Moon fungus in a clump: in the dark and the wet, never strewn. */
  const fungus = (x: number, z: number, n = 2) => {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const d = k ? range(r, 1.2, 2.4) : 0;
      lay(FUNGUS, x + Math.cos(a) * d, z + Math.sin(a) * d, r() * Math.PI * 2, k ? range(r, 0.55, 0.75) : range(r, 0.8, 1), k ? 1 : Math.floor(r() * 3));
    }
  };

  /**
   * The standing dead: the woods as the fire left them, wherever the ground's own rule doesn't say
   * otherwise. Thick out at the field's sides and thinning toward the way, in groves of one kind
   * with gaps between, nothing on the verge but the odd drift or fungus clump; the windfall of 166
   * years lying all one way, downwind; ash in the lees.
   */
  const stand = (z0: number, z1: number, keep: (x: number, z: number) => boolean, dens = 1, verge = AISLE + 3) => {
    // the big forms first: now and then a hollow giant, far older than the rest, out toward the sides
    // in the thick of a grove
    for (let z = z0 - range(r, 8, 24); z > z1 + 4; z -= range(r, 34, 50)) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * range(r, HALF_W - 14, HALF_W + 2);
      if (!keep(x, z) || Math.abs(x - b.aisle(z)) < verge + 8 || !kit.free(x, z, 5)) continue;
      if (lay(HOLLOW, x, z, r() * Math.PI * 2, range(r, 1.2, 1.4))) kit.claim(x, z, 6);
    }
    // then the groves: their middles spaced as old stands leave room, more of them out toward the
    // sides; each a big tree in its middle and smaller ones round it, mostly of one kind
    const mids: { x: number; z: number; edge: number }[] = [];
    for (let k = 0; k < 600; k++) {
      const x = range(r, -HALF_W - 10, HALF_W + 10);
      const z = range(r, z1 + 2, z0 - 2);
      if (!keep(x, z)) continue;
      const d = Math.abs(x - b.aisle(z));
      if (d < verge + 3) continue;
      const edge = smoothstep(verge, verge + 18, d);
      if (r() > (0.3 + 0.7 * edge) * dens) continue;
      if (mids.some((m) => Math.hypot(m.x - x, m.z - z) < 15)) continue;
      mids.push({ x, z, edge });
    }
    const near = (x: number, z: number) => keep(x, z) && Math.abs(x - b.aisle(z)) > verge;
    for (const m of mids) {
      const kinds = noise2(m.x * 0.035, m.z * 0.035, 43) < 0.5 ? GROVE_A : GROVE_B;
      const ps = kit.group(m.x, m.z, { kinds, n: 5 + Math.floor(r() * 3 + m.edge * 4), spread: 5 + m.edge * 2, big: lerp(1.2, 1.55, m.edge), small: 0.6, keep: near });
      for (const p of ps) {
        // (the fungus-lit ones only now and then: the glow belongs to the hollows, not strewn)
        if (p.kind === TREE && p.variant === 3 && r() < 0.85) p.variant = Math.floor(r() * 3);
        if (p.kind === SPIRE && p.variant === 2 && r() < 0.85) p.variant = Math.floor(r() * 2);
      }
      if (ps.length) lee(ps[0].x, ps[0].z, 3.2, ps[0].s);
    }
    // between them, the falls of 166 years lying downwind, now and then
    for (let k = 0; k < (z0 - z1) / 12; k++) {
      const x = range(r, -HALF_W, HALF_W);
      const z = range(r, z1 + 2, z0 - 2);
      if (keep(x, z) && Math.abs(x - b.aisle(z)) > verge && kit.free(x, z, 3)) lay(LOG, x, z, -b.wa + (r() - 0.5) * 0.5, range(r, 0.95, 1.2), undefined, 1.2, 3);
    }
    // the verge: now and then a drift or a stump with fungus, so the way's edge is felt, not walled
    for (let z = z0 - range(r, 2, 8); z > z1; z -= range(r, 10, 16)) {
      const side = r() < 0.5 ? -1 : 1;
      const x = b.aisle(z) + side * range(r, AISLE + 0.5, verge + 1);
      if (!keep(x, z) || !kit.free(x, z, 1.5)) continue;
      if (r() < 0.85) lay(DRIFT, x, z, -b.wa + (r() - 0.5) * 0.4, range(r, 0.7, 0.95), r() < 0.5 ? 0 : 1);
      else lay(STUMP, x, z, r() * Math.PI * 2, range(r, 0.8, 1));
    }
  };

  /** A tree with crows in it: they lift as you come over (see view/life.ts). */
  const roost = (x: number, z: number) => kit.emit('roost', x, z);

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    switch (bt.kind) {
      case 'edge': {
        const burn = b.burn;
        if (!burn) {
          stand(bt.z0, bt.z1, () => true, 0.8);
          break;
        }
        // the open ash the level starts on, then the line where the fire went out: black snags
        // thick along it, a few out in front where it jumped; the first white trees behind
        for (let x = -HALF_W - 8; x < HALF_W + 8; x += range(r, 2.6, 4)) {
          const zl = burn(x) - range(r, -1, 5);
          if (!inBeat(bt, zl)) continue;
          const d = Math.abs(x - b.aisle(zl));
          if (d < AISLE - 2 && r() < 0.7) continue;
          const p = lay(BURNT, x, zl, r() * Math.PI * 2, range(r, 1.0, 1.3) * (d < AISLE + 4 ? 0.8 : 1), d < AISLE + 4 ? 0 : r() < 0.55 ? 1 : 2);
          if (p) kit.claim(x, zl, 1.5);
        }
        for (let k = 0; k < 5; k++) {
          const x = range(r, -HALF_W, HALF_W);
          const zl = burn(x) + range(r, 4, 12);
          if (inBeat(bt, zl) && off(AISLE)(x, zl)) lay(BURNT, x, zl, r() * Math.PI * 2, range(r, 0.6, 0.85), 0);
        }
        stand(bt.z0, bt.z1, (x, z) => z < burn(x) - 6, 1);
        // the first guns, either side of the way where it goes into the trees
        const zp = burn(b.aisle(burn(0))) - 4;
        for (const side of [-1, 1]) if (inBeat(bt, zp)) kit.post(b.aisle(zp) + side * (AISLE + 3), zp, 0, 'edge');
        // crows on a snag at the line
        const sx = b.aisle(burn(0)) + (r() < 0.5 ? -1 : 1) * range(r, 10, 16);
        roost(sx, burn(sx) - 2);
        break;
      }
      case 'glade': {
        // a breather: open ash, the woods held back to the field's edges, a lone snag in the open
        // with crows in it, a fungus stump, a drift
        stand(bt.z0, bt.z1, (x) => Math.abs(x) > HALF_W - 8, 0.7, AISLE + 14);
        const zc = bt.z0 - len * range(r, 0.35, 0.65);
        const side = r() < 0.5 ? -1 : 1;
        const x = b.aisle(zc) + side * range(r, 11, 17);
        if (tree(r() < 0.5 ? TREE : SPIRE, x, zc, 1.2, r() * Math.PI * 2, r() < 0.5 ? 0 : 1)) {
          roost(x, zc);
          lee(x, zc, 3, 1.2);
        }
        fungus(b.aisle(zc) - side * range(r, 14, 22), zc + range(r, -6, 6), 2);
        break;
      }
      case 'flash': {
        for (const f of b.flashes) {
          if (!inBeat(bt, f.z)) continue;
          // the poles first: stood where the burst was straight over them, stripped, the burnt
          // side to it; none in the way itself
          for (let k = 0; k < 500; k++) {
            const a = r() * Math.PI * 2;
            const d = Math.sqrt(r()) * f.r0;
            const x = f.x + Math.cos(a) * d;
            const z = f.z + Math.sin(a) * d;
            if (!off(2.5)(x, z) || !kit.free(x, z, 1.25)) continue;
            const away = Math.atan2(z - f.z, x - f.x);
            // (the heart's poles the tallest; the broken ones out toward the ring's edge)
            const v = d > f.r0 * 0.7 && r() < 0.5 ? 2 : r() < 0.5 ? 0 : 1;
            if (lay(POLE, x, z, -away, range(r, 0.95, 1.12), v)) kit.claim(x, z, 1.25);
          }
          // then the starburst: every tree out to its reach thrown down, root plate toward the
          // burst, the crown flung away, in rays (a few gaps where the trees stood thinner)
          const rays = Math.round(range(r, 30, 36));
          for (let k = 0; k < rays; k++) {
            const a0 = (k / rays) * Math.PI * 2 + (r() - 0.5) * 0.06;
            // (staggered, so the nearest root plates don't close into a wall round the poles)
            for (let d = f.r0 + 2 + (k % 3) * 3.5 + range(r, 0, 2); d < f.r1 + 6; ) {
              const a = a0 + (r() - 0.5) * 0.08;
              const x = f.x + Math.cos(a) * d;
              const z = f.z + Math.sin(a) * d;
              const left = f.r1 + 6 - d;
              // (in the way, fewer: it's flown over, but the way should read calm)
              const inWay = !off(AISLE)(x, z);
              if (inField(x, -14) && r() > (inWay ? 0.8 : 0.15)) fell(x, z, a, Math.min(left, range(r, 9, 15)));
              d += range(r, 13, 18);
            }
          }
          // beyond the reach, the woods stand again, their crowns stripped on the burst's side
          stand(bt.z0, bt.z1, (x, z) => Math.hypot(x - f.x, z - f.z) > f.r1 + 3, 0.9);
          // guns either side of the way where it goes in among the poles, and where it comes out
          for (const zz of [f.z + f.r0 + 1, f.z - f.r0 - 1]) {
            const m = b.aisle(zz);
            for (const side of [-1, 1]) if (r() < 0.75) kit.post(m + side * (AISLE + 1.5), zz, 0, 'flash');
          }
          // crows in the tallest pole by the heart; a pale haze of ash lifting off the bleached ground
          roost(f.x + (r() < 0.5 ? -1 : 1) * range(r, 4, 7), f.z + range(r, -4, 4));
          for (let k = 0; k < 3; k++) {
            const a = r() * Math.PI * 2;
            kit.emit('dust', f.x + Math.cos(a) * f.r0 * 0.8, f.z + Math.sin(a) * f.r0 * 0.8, 0, Math.cos(a) > 0 ? -1 : 1);
          }
        }
        break;
      }
      case 'stride': {
        for (const st of b.strides) {
          if (!inBeat(bt, (st.z0 + st.z1) / 2)) continue;
          const [dx, dz] = dirOf(st.ang);
          // the titan first, fallen at the end of its walk (posed as the graveyard's are)
          const t = st.titan;
          layTitan(kit, t, b.plain, 0.45);
          // the trees it went down on, thrown out from under it either side, and the ash it pushed up
          for (const u of [-14, -6, 2, 10]) {
            for (const side of [-1, 1]) {
              const p = at(t, u + range(r, -2, 2), side * 8.5);
              const c = at(t, u, 0);
              // (out from its flank, away from the body's line)
              if (r() < 0.75) fell(p.x, p.z, Math.atan2(p.z - c.z, p.x - c.x) + (r() - 0.5) * 0.4, range(r, 9, 13));
            }
          }
          // the prints: fungus round the rims where the water stands, a mist lying in them
          st.prints.forEach((p, i) => {
            if (!inBeat(bt, p.z)) return;
            const [px, pz] = dirOf(p.ang);
            if (r() < 0.6) fungus(p.x - px * (FOOT + 1.6) + pz * range(r, -1.5, 1.5), p.z - pz * (FOOT + 1.6) - px * range(r, -1.5, 1.5), 1 + Math.floor(r() * 2));
            if (i % 2 === 0) kit.emit('fog', p.x, p.z);
          });
          // the swath: every tree along its line thrown down and out to either side, as it shoved
          // through, crowns forward a little the way it walked
          const L = Math.hypot(st.x1 - st.x0, st.z1 - st.z0);
          for (const side of [-1, 1])
            for (let d = range(r, 0, 3); d < L + 4; d += range(r, 3.2, 4.6)) {
              const w = side * range(r, GAIT + 3.5, GAIT + 7);
              const x = st.x0 + dx * d + dz * w;
              const z = st.z0 + dz * d - dx * w;
              if (!inBeat(bt, z)) continue;
              // (out to its side: a perpendicular, swung forward the way it walked)
              const a = st.ang - side * (Math.PI / 2) + side * range(r, 0.2, 0.6);
              if (r() < 0.8) fell(x, z, a, range(r, 9, 14));
              else if (kit.free(x, z, 1.5)) lay(POLE, x, z, -a, range(r, 0.9, 1.05), 2);
            }
          // the woods standing either side of its path, untouched past arm's reach
          stand(bt.z0, bt.z1, (x, z) => {
            const [d] = seg(x, z, st.x0 - dx * 20, st.z0 - dz * 20, st.x1, st.z1);
            const [dt] = seg(x, z, t.x - dx * 40 * t.s, t.z - dz * 40 * t.s, t.x + dx * 20 * t.s, t.z + dz * 20 * t.s);
            return d > GAIT + 10 && dt > 13;
          }, 1);
          // guns on the root plates of the trees it threw down, beside its line, and by its shoulders
          for (let k = 0; k < 3; k++) {
            const d = L * (0.2 + 0.3 * k) + range(r, -3, 3);
            const side = k % 2 ? 1 : -1;
            const w = side * (GAIT + 5);
            const z = st.z0 + dz * d - dx * w;
            if (inBeat(bt, z)) kit.post(st.x0 + dx * d + dz * w, z, 0, 'stride');
          }
          for (const side of [-1, 1]) {
            const p = at(t, 6, side * 9.5);
            if (inField(p.x, 4)) kit.post(p.x, p.z, 0, 'stride');
          }
          roost(at(t, 4, 0).x, at(t, 4, 0).z);
        }
        break;
      }
      case 'colliers': {
        const rd = b.road;
        const roadX = (z: number) => {
          if (!rd) return 0;
          const p = rd.pts;
          const i = Math.min(p.length - 2, Math.max(0, Math.floor((p[0].z - z) / 3)));
          const t = (p[i].z - z) / Math.max(1e-6, p[i].z - p[i + 1].z);
          return lerp(p[i].x, p[i + 1].x, clamp(t, 0, 1));
        };
        const onRoad = (x: number, z: number, m = 3) => !!rd && Math.abs(x - roadX(z)) < m;
        /** The heading along a line x = f(z), running down the field. */
        const along = (f: (z: number) => number, z: number) => Math.atan2(-3, f(z - 1.5) - f(z + 1.5));
        // the clamps on their pitsteads, the burning one smoking heavy and pale; a gun between
        // every other one and the road
        for (const [k, pt] of b.pits.entries()) {
          if (!inBeat(bt, pt.z)) continue;
          kit.claim(pt.x, pt.z, pt.r + 0.5);
          if (pt.v < 3) lay(CLAMP, pt.x, pt.z, r() * Math.PI * 2, (pt.r / 3.2) * range(r, 0.92, 0.98), pt.v);
          if (pt.v === 0) {
            kit.emit('clamp', pt.x, pt.z);
            kit.emit('clamp', pt.x + range(r, -1.5, 1.5), pt.z + range(r, -1.5, 1.5));
          }
          const side = Math.sign(pt.x - b.aisle(pt.z)) || 1;
          if (k % 2 === 0) kit.post(pt.x + side * (pt.r + 2), pt.z + range(r, -2, 2), 0, 'clamp');
        }
        for (const c of b.clearings) {
          if (!inBeat(bt, c.z)) continue;
          const side = c.side;
          if (c.main) {
            // the woodyard across the way: the cordwood ricked in rows down the field, gaps to
            // walk through, the near row shortest; the trunks dragged in at its end, waiting
            // to be sawn, a stump to saw them on
            for (let j = 0; j < 3; j++) {
              const o = AISLE + 3.6 + j * 2.9;
              const f = (z: number) => b.aisle(z) - side * o;
              const half = c.rz * (0.45 + j * 0.1);
              for (let z = c.z + half - range(r, 0, 2); z > c.z - half; ) {
                const v = r() < 0.6 ? 1 : r() < 0.5 ? 0 : 2;
                const l = v === 0 ? 5 : 8;
                const zm = z - l / 2;
                if (zm - l / 2 < c.z - half - 1) break;
                if (lay(RICK, f(zm), zm, -along(f, zm), 1, v)) kit.claim(f(zm), zm, l * 0.42);
                z -= l + range(r, 1.4, 2.6);
              }
            }
            const zIn = c.z + c.rz * 0.82;
            for (let k = 0; k < 3; k++) {
              const x = b.aisle(zIn) - side * (AISLE + 4 + k * 2.2);
              fell(x, zIn + range(r, -0.6, 0.6), Math.PI / 2 + (r() - 0.5) * 0.12, range(r, 9, 11));
            }
            lay(STUMP, b.aisle(zIn) - side * (AISLE + 1.5), zIn - 2, r() * Math.PI * 2, 1.1, 2);
            for (const z of [c.z + c.rz * 0.6, c.z - c.rz * 0.6]) kit.post(b.aisle(z) - side * (AISLE + 2), z, 0, 'rick');
            // the colliers' huts behind the road, facing the clamps, smoke from the hearth
            for (let k = 0; k < 2; k++) {
              const z = c.z + (k ? 1 : -1) * c.rz * range(r, 0.25, 0.5);
              const x = roadX(z) + side * 4.5;
              if (lay(HUT, x, z, (r() - 0.5) * 0.4, 1, k % 2)) {
                kit.claim(x, z, 3);
                kit.emit('smoke', x, z + 3);
              }
            }
            // sleds of sacks drawn up on the road by the clamps, ready to go out
            for (let k = 0; k < 2; k++) {
              const z = c.z + range(r, -c.rz * 0.5, c.rz * 0.5);
              const x = roadX(z) - side * 2.4;
              if (kit.free(x, z, 2) && lay(SLED, x, z, -along(roadX, z), 1, k === 0 ? 0 : Math.floor(r() * 2))) kit.claim(x, z, 2);
            }
          }
          // the stumps in the rows they were felled in, a strip at a time, the odd strip not yet
          // cut; in the next cut, the trees still lying where they fell, all one way, toward the way
          const fallA = Math.atan2(-0.15, b.aisle(c.z) > c.x ? 1 : -1);
          for (let z = c.z + c.rz; z > c.z - c.rz; z -= range(r, 3.6, 4.4)) {
            if (c.main && r() < 0.2) continue;
            const row = range(r, -0.6, 0.6);
            for (let x = c.x - c.rx; x < c.x + c.rx; x += range(r, 3.0, 3.8)) {
              const jx = x + (r() - 0.5) * 0.8;
              const jz = z + row + (r() - 0.5) * 0.6;
              if (b.cleared(jx, jz) < 0.5 || onRoad(jx, jz) || !kit.free(jx, jz, 1.3)) continue;
              if (!c.main && r() < 0.45 && clear(jx, jz)) {
                fell(jx, jz, fallA + (r() - 0.5) * 0.12, range(r, 9, 12));
                continue;
              }
              if (r() < (c.main ? 0.6 : 0.8) && lay(STUMP, jx, jz, r() * Math.PI * 2, range(r, 0.95, 1.15), r() < 0.85 ? 0 : 1)) kit.claim(jx, jz, 1.3);
            }
          }
          if (!c.main) kit.post(c.x + (b.aisle(c.z) > c.x ? 1 : -1) * c.rx * 0.5, c.z, 0, 'cut');
        }
        // the road's verges cut back to stumps; the woods standing round the clearings
        if (rd)
          for (const p of rd.pts) {
            if (!inBeat(bt, p.z) || r() > 0.3) continue;
            const side = r() < 0.5 ? -1 : 1;
            const x = p.x + side * range(r, 3, 5);
            if (clear(x, p.z) && kit.free(x, p.z, 1.3) && b.cleared(x, p.z) < 0.3) lay(STUMP, x, p.z, r() * Math.PI * 2, range(r, 0.8, 1));
          }
        stand(bt.z0, bt.z1, (x, z) => b.cleared(x, z) < 0.05 && !onRoad(x, z, 5), 1);
        break;
      }
      case 'nave': {
        // the elders, then what grows small at their feet: pale spires, fungus in the dark
        // between their roots, the boughs they've shed lying under them
        const own = b.elders.filter((e) => inBeat(bt, e.z));
        for (const e of own) {
          if (!elder(e)) continue;
          for (let k = 0; k < 2; k++) {
            const a = r() * Math.PI * 2;
            const x = e.x + Math.cos(a) * range(r, 5.5, 7.5);
            const z = e.z + Math.sin(a) * range(r, 5.5, 7.5);
            if (off(AISLE)(x, z)) tree(SPIRE, x, z, range(r, 0.8, 1), r() * Math.PI * 2, r() < 0.5 ? 0 : 1);
          }
          if (r() < 0.5) {
            const a = r() * Math.PI * 2;
            fungus(e.x + Math.cos(a) * 4.5, e.z + Math.sin(a) * 4.5, 2);
          }
          if (r() < 0.4) {
            const a = r() * Math.PI * 2;
            const x = e.x + Math.cos(a) * 7;
            const z = e.z + Math.sin(a) * 7;
            if (clear(x, z)) lay(LOG, x, z, r() * Math.PI * 2, range(r, 1, 1.2), undefined, 1.2, 3);
          }
          // a gun at the foot of an elder beside the way
          if (Math.abs(e.x - b.aisle(e.z)) < AISLE + 10 && r() < 0.45) kit.post(e.x + Math.sign(b.aisle(e.z) - e.x) * 4.5, e.z + 2, 0, 'nave');
        }
        // the heart: where the way widens most, a hollow giant off to one side, the fungus
        // glowing up out of it, a ring of fungus round its roots; crows over it
        let hz = bt.z0 - len * 0.5;
        let best = 0;
        for (let z = bt.z0 - 12; z > bt.z1 + 12; z -= 2) {
          const gap = Math.min(...own.filter((e) => Math.abs(e.z - z) < 10).map((e) => Math.abs(e.x - b.aisle(e.z))), 30);
          if (gap > best) {
            best = gap;
            hz = z;
          }
        }
        const hs = bt.side;
        const hx = b.aisle(hz) + hs * (AISLE + 5);
        if (kit.free(hx, hz, 4) && lay(HOLLOW, hx, hz, r() * Math.PI * 2, range(r, 1.25, 1.4))) {
          kit.claim(hx, hz, 5.5);
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + r() * 0.5;
            const x = hx + Math.cos(a) * 6.5;
            const z = hz + Math.sin(a) * 6.5;
            if (off(AISLE - 1)(x, z)) fungus(x, z, 1);
          }
          roost(hx, hz);
        }
        stand(bt.z0, bt.z1, (x, z) => b.elders.every((e) => Math.hypot(x - e.x, z - e.z) > 7), 0.75, AISLE + 5);
        break;
      }
      case 'drifts': {
        // the trees buried to their crowns on the dunes' windward slopes and along their crests,
        // the drift trailing off each downwind; the troughs scoured dark between, stumps and
        // fungus in them; ash smoking off the crests
        for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 3.6, 4.6))
          for (let x = -HALF_W - 6; x < HALF_W + 6; x += range(r, 4.5, 6.5)) {
            const jx = x + (r() - 0.5) * 2;
            const jz = z + (r() - 0.5) * 2;
            const du = b.dune(jx, jz);
            const d = Math.abs(jx - b.aisle(jz));
            if (du > 0.45 && du < 0.95 && r() < 0.42 * smoothstep(AISLE - 2, AISLE + 8, d) + 0.06) {
              if (kit.free(jx, jz, 2.4) && lay(CROWN, jx, jz, -b.wa + (r() - 0.5) * 0.3, range(r, 0.9, 1.15))) kit.claim(jx, jz, 2.4);
            } else if (du < 0.12 && d > AISLE + 2 && r() < 0.1) {
              if (r() < 0.5) fungus(jx, jz, 2);
              else if (kit.free(jx, jz, 1.4)) lay(BURNT, jx, jz, r() * Math.PI * 2, range(r, 0.6, 0.8), 0);
            }
          }
        // the dust off the crests: a run at a time, where the ash stands highest
        for (let z = bt.z0 - 6; z > bt.z1 + 6; z -= range(r, 6, 10)) {
          let bx = 0;
          let bh = 0;
          for (let x = -HALF_W + 4; x < HALF_W - 4; x += 3) {
            const du = b.dune(x, z);
            if (du > bh) {
              bh = du;
              bx = x;
            }
          }
          if (bh > 0.8) kit.emit('dust', bx, z, 3, wx > 0 ? -1 : 1);
        }
        // the tall ones the ash never buried, out at the sides
        stand(bt.z0, bt.z1, (x, z) => Math.abs(x) > HALF_W - 10 && b.dune(x, z) < 0.5, 0.6, AISLE + 12);
        // guns on the crests at the way's sides, with a view down it
        for (let z = bt.z0 - 10; z > bt.z1 + 10; z -= range(r, 14, 20)) {
          const side = r() < 0.5 ? -1 : 1;
          const x = b.aisle(z) + side * (AISLE + range(r, 2, 6));
          if (b.dune(x, z) > 0.5) kit.post(x, z, 0, 'drift');
        }
        break;
      }
      case 'gate': {
        // the way out between two hollow elders, the woods thick round them and thinning after
        const g = b.gate;
        for (const e of b.elders) {
          if (!inBeat(bt, e.z) || !g || Math.abs(e.z - g.z) > 4) continue;
          // (further on, if a titan's lying into the gate)
          while (!kit.free(e.x, e.z, 4) && e.z > bt.z1 + 6) e.z -= 3;
          elder(e);
        }
        if (g) {
          for (const side of [-1, 1]) {
            kit.post(b.aisle(g.z) + side * (AISLE + 1), g.z + 6, 0, 'gate');
            fungus(b.aisle(g.z) + side * (AISLE + 2.5), g.z + 3.5, 2);
          }
          roost(b.aisle(g.z) + (r() < 0.5 ? -1 : 1) * (AISLE + 5), g.z);
        }
        stand(bt.z0, bt.z1, (_x, z) => !g || z > g.z - 14, 1.15);
        break;
      }
    }
  }
}
