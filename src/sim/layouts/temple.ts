/**
 * The Drowned Temple: the Tonkva's grow-house on Morang (docs/level-design.md, its layout row).
 * Here the Tonkva raised their white mould and taught it, in ziggurats of the ceramic it lays down,
 * with grow-beds stepped down round them, cloisters of hexagonal courts, a processional way across
 * the water, every station of it lit by a hearth-lamp (they were moth-like, and gathered round
 * warmth). Then the Engine stopped. The swamp rose over the lower halls, the mould went wild and
 * violet, and the grow-heart tore herself out of the temple's crown and floated off. The Rang live
 * on its steps now, in reed huts on stilts, and pole their punts between the drowned columns.
 *
 * So everything here is one of three hands: the Tonkva's pale ceramic, square and true and level;
 * the swamp's black water over it, and the bloom's violet curves taking it back; and the Rang's
 * warm little lights in among it.
 *
 * A level is a pilgrimage to the temple, in through the water-gate (two great lamps either side of
 * the way) and out over the far water past the last lamps, through three grounds (two if the
 * stretch is short), one of them always the temple itself, so no two crossings fly alike:
 * - the causeway: the processional way, dead straight over the water, a lamp each side at every
 *   station, its deck broken where it's sunk; it always leads to the temple, if both are flown;
 * - the grow-beds: terraces stepping up either side of a feed channel the way runs down, the beds
 *   on each in an exact grid of lips: some still holding water, some grown over with the mould in
 *   the rows it was taught, some dry; sluices letting the water down, tier to tier;
 * - the temple: the ziggurat, its tiers climbing out of the water, the great stair up its face and
 *   down its back, shrines at its corners, lamps along its foot; the Rang's huts on its lower tiers
 *   on one side, the bloom pouring down the other; at its crown the socket the grow-heart tore
 *   herself out of, her roots still hanging over its lip;
 * - the cloister: hexagonal courts, a column at every corner, doors between them; some drowned to
 *   pools, some grown over, a few planted by the Rang;
 * - the sunk hall: the lowest precinct, under the water: a hall of columns standing in rows out of
 *   it, roof slabs awash, and the temple's bell lying in the shallows, still tolling now and then.
 * And the water for the whole crossing: low (the beds dry, the mud banks out), high, or drowned (the
 * lowest tiers and courts under, only their walls showing). Open water between the grounds, reed
 * islands and lily drifts on it: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Tide = 'low' | 'high' | 'drowned';

/** The swamp's level (the biome's own water, see world/planets.ts). */
const WATER = 0.5;
/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  mouth: [30, 36],
  breather: [16, 22],
  causeway: [72, 120],
  beds: [62, 86],
  temple: [88, 100],
  cloister: [60, 90],
  hall: [58, 84],
  out: [26, 32],
};
/** How far the built ground stands above the water, by the tide: the floors of the courts, the beds' lowest tier. */
const BASE: Record<Tide, number> = { low: 1.3, high: 0.95, drowned: 0.3 };
/** The swamp's floor, by the tide: how much of it is mud bank. */
const MUD: Record<Tide, number> = { low: 0.2, high: 0.05, drowned: -0.08 };
/** Half the way kept open (over three ship widths across). */
const LANE = 7.5;
/** The causeway's deck, half its width, and how high it stands over the built ground. */
const DECK = 5.5;
const DECK_UP = 0.35;
/** A temple's tier: its rise. */
const RISE = 1.25;
/** A grow-bed tier: its width across, its rise. */
const BED_W = 7.5;
const BED_UP = 0.55;
/** The cloister's hexes: middle to corner; the walls' rise. */
const HEX = 8.5;
const WALL_UP = 0.75;

// the colours painted into the ground: ceramic paving, its joints, the glaze, the beds, the bloom
const PAVE = [0xcbc2b8, 0xc4bbb2, 0xd2c9be];
const JOINT = 0x8c8290;
const KERB = 0xe6ded2;
const GLAZE = 0x6e9a8e;
const BED_WET = 0x24403e;
const BED_MUD = 0x5e5040;
const BLOOM = 0x4c3466;
const MOSS = 0x667a4a;
const SOOT = 0x2e2830;
/** A temple's tiers' paving, from the water up to the crown. */
const TIER = [0x948a98, 0xa69ca8, 0xb8afb8, 0xcbc3c6, 0xdfd8d4];

const SQ3 = Math.sqrt(3);

interface Causeway {
  x: number;
  z0: number;
  z1: number;
  /** Where the deck has sunk: along z, from z0 to z1. */
  gaps: { z0: number; z1: number }[];
  /** The stations (each a lamp either side), at z. */
  stations: number[];
}
interface Beds {
  x: number;
  z0: number;
  z1: number;
  tiers: number;
  /** The grid of cross-lips: the first, and the spacing. */
  gz: number;
  pitch: number;
}
interface Temple {
  x: number;
  z: number;
  /** Half its width and depth at the foot; how much each tier steps in; how many tiers. */
  w: number;
  d: number;
  ix: number;
  iz: number;
  n: number;
  /** The socket in the crown: its radius. */
  pit: number;
  /** The Rang's side, and the bloom's. */
  rang: -1 | 1;
}
interface Cloister {
  z0: number;
  z1: number;
  /** The lattice's offset. */
  ox: number;
  oz: number;
}
interface Hall {
  x: number;
  z0: number;
  z1: number;
  /** The columns' pitch, across and along; the hall's half width. */
  px: number;
  pz: number;
  half: number;
  /** Roof slabs lying awash: their middles, half sizes. */
  slabs: { x: number; z: number; hw: number; hd: number; rot: number }[];
  bell: { x: number; z: number };
}

/**
 * An island in the swamp, one of five kinds, so the water between the grounds isn't a field of
 * ovals: a mound (lobed, mossed, a hummock on its back), a bar (a long low spit of silt the slow
 * water has drawn out along its flow), tussocks (a cluster of little sedge tufts), a lagoon (a ring
 * of silt round a pool of still water, open on one side) or a ruin (a block of the temple's ceramic
 * the swamp has heaped silt round).
 */
type IsleKind = 'mound' | 'bar' | 'tussocks' | 'lagoon' | 'ruin';
interface Island {
  kind: IsleKind;
  /** Its middle and its reach (all its lobes lie within r of it). */
  x: number;
  z: number;
  r: number;
  /** Which way it lies (a bar's flow, a lagoon's open side, a ruin's square). */
  ang: number;
  seed: number;
  /** The lobes it's heaped from: middle, radius, how high (over the water) its back stands. */
  lobes: { x: number; z: number; r: number; h: number }[];
  /** A ruin's block: its half size. */
  block?: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Site extends Bones {
  islands: Island[];
  tide: Tide;
  base: number;
  lane(z: number): number;
  /** The swamp's own floor at (x, z), before anything was built on it. */
  swamp(x: number, z: number): number;
  causeways: Causeway[];
  beds: Beds[];
  temples: Temple[];
  cloisters: Cloister[];
  halls: Hall[];
  /** A grow-bed's state at its cell: water, grown or dry. */
  bed(b: Beds, side: -1 | 1, tier: number, row: number): 'water' | 'grown' | 'dry';
  /** A court's state, by its hex. */
  court(i: number, j: number): 'pool' | 'paved' | 'grown' | 'garden';
  /** The hex nearest (x, z): its index, middle, and how far in from its walls (the inradius at the middle, 0 at a wall). */
  hex(c: Cloister, x: number, z: number): { i: number; j: number; x: number; z: number; d: number };
  /** Is the door on the wall between two hexes open? (by the wall's middle) */
  door(x: number, z: number): boolean;
  /** A temple's tier at (x, z): the highest whose footprint holds it (-1 outside). */
  tier(t: Temple, x: number, z: number): number;
  /** The bloom's tongue down a temple's flank: how much of (x, z) it covers (0..1). */
  tongue(t: Temple, x: number, z: number): number;
}

/** A cheap hash of a point (0..1). */
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** The turn that lays a model's local direction (lx, lz) along (dx, dz) (three's rotation about y). */
const turnTo = (lx: number, lz: number, dx: number, dz: number) => Math.atan2(-dz, dx) - Math.atan2(-lz, lx);

export const temple: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 7919 + Math.round(-z0) * 13 + 11, 0x9e3779b1) ^ 0x2545f491);
    const s = seed % 997;

    const tide = weighted(r, [['low', 3], ['high', 4], ['drowned', 3]] as const) as Tide;
    const base = BASE[tide];

    // the grounds: the temple always, and one or two more; a causeway always leads to it
    const others = shuffle(r, ['causeway', 'beds', 'cloister', 'hall']);
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.mouth[0], first) - LEN.out[0];
    const want = (ks: string[]) => ks.reduce((a, k) => a + LEN[k][0], 0) + (ks.length - 1) * LEN.breather[0];
    let grounds = ['temple', ...others.slice(0, 2)];
    if (want(grounds) > total) grounds = ['temple', others[0]];
    if (want(grounds) > total) grounds = ['temple'];
    grounds = shuffle(r, grounds);
    const ci = grounds.indexOf('causeway');
    if (ci >= 0) {
      // (the way leads to the temple: the causeway straight before it, no breather between)
      grounds.splice(ci, 1);
      grounds.splice(grounds.indexOf('temple'), 0, 'causeway');
    }

    // the beats: each ground its least, and what's left shared out
    const seq = ['mouth'];
    grounds.forEach((g, i) => {
      if (i && !(g === 'temple' && grounds[i - 1] === 'causeway')) seq.push('breather');
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
    // (what won't fit goes to the grounds that grow with their length: a longer causeway, more
    // courts, a longer hall; never the temple or the breathers)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'causeway' || k === 'cloister' || k === 'hall' || k === 'beds' ? i : -1)).filter((i) => i >= 0);
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

    // the way through, wandering gently over the open water; each ground holds it to its own line
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 8;
    const wander = (z: number) => clamp(x0 + 8 * Math.sin(z * 0.016 + k1) + 3 * Math.sin(z * 0.041 + k2), -12, 12);

    const causeways: Causeway[] = [];
    const beds: Beds[] = [];
    const temples: Temple[] = [];
    const cloisters: Cloister[] = [];
    const halls: Hall[] = [];
    const holds: { b: Beat; x: (z: number) => number }[] = [];
    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'temple': {
          const n = 5;
          const d = len / 2 - 5;
          // (its crown about 10 deep and 20 wide, the socket in it)
          const iz = (d - 10) / (n - 1);
          const w = range(r, 26, 30);
          const tx = clamp(wander(zc), -6, 6);
          temples.push({ x: tx, z: zc, w, d, ix: (w - 11) / (n - 1), iz, n, pit: range(r, 4.2, 5), rang: r() < 0.5 ? -1 : 1 });
          holds.push({ b, x: () => tx });
          break;
        }
        case 'causeway': {
          // dead straight, square to the temple it leads to (the Tonkva set it to a bearing)
          const next = beats[beats.indexOf(b) + 1];
          const cx = next?.kind === 'temple' ? clamp(wander((next.z0 + next.z1) / 2), -6, 6) : clamp(wander(zc), -8, 8);
          const stations: number[] = [];
          const pitch = range(r, 13, 16);
          for (let zz = b.z0 - 8; zz > b.z1 + 4; zz -= pitch) stations.push(zz);
          // where the deck has sunk: one or two gaps, more on a drowned year, never at a station
          const gaps: { z0: number; z1: number }[] = [];
          const ng = tide === 'drowned' ? 2 + (r() < 0.5 ? 1 : 0) : tide === 'high' ? 1 + (r() < 0.4 ? 1 : 0) : r() < 0.6 ? 1 : 0;
          for (let k = 0; k < ng && stations.length > 2; k++) {
            const i = 1 + Math.floor(r() * (stations.length - 2));
            const zm = stations[i] - pitch / 2;
            const half = range(r, 2.5, 4);
            if (gaps.some((g) => Math.abs((g.z0 + g.z1) / 2 - zm) < 4)) continue;
            gaps.push({ z0: zm + half, z1: zm - half });
          }
          causeways.push({ x: cx, z0: b.z0 + 2, z1: b.z1 - (next?.kind === 'temple' ? 6 : 0), gaps, stations });
          holds.push({ b, x: () => cx });
          break;
        }
        case 'beds': {
          const x = clamp(wander(zc), -5, 5);
          beds.push({ x, z0: b.z0 - 4, z1: b.z1 + 4, tiers: 4, gz: b.z0 - 4, pitch: range(r, 9, 11) });
          holds.push({ b, x: () => x });
          break;
        }
        case 'cloister': {
          cloisters.push({ z0: b.z0 - 3, z1: b.z1 + 3, ox: wander(zc) + (r() - 0.5) * 4, oz: zc + r() * 10 });
          break;
        }
        case 'hall': {
          const x = clamp(wander(zc), -6, 6);
          const px = range(r, 9, 10.5);
          const pz = range(r, 9.5, 11);
          const slabs: Hall['slabs'] = [];
          for (let k = 0; k < 4; k++)
            slabs.push({ x: x + (r() < 0.5 ? -1 : 1) * range(r, 10, 24), z: lerp(b.z0 - 10, b.z1 + 10, (k + r() * 0.8) / 4), hw: range(r, 3, 5), hd: range(r, 3, 4.5), rot: (r() - 0.5) * 0.3 });
          const side = r() < 0.5 ? -1 : 1;
          halls.push({ x, z0: b.z0 - 6, z1: b.z1 + 6, px, pz, half: range(r, 26, 32), slabs, bell: { x: x + side * range(r, 12, 17), z: lerp(b.z0, b.z1, range(r, 0.4, 0.6)) } });
          holds.push({ b, x: () => x });
          break;
        }
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

    // the swamp's islands: out at the sides of the way and never in it, in little archipelagos of
    // one kind each (a big one and its smaller ones trailing off downstream), so the open water
    // frames the way rather than filling it, and no two stretches of it look alike
    const islands: Island[] = [];
    /** The kinds each ground's water heaps up: the causeway's and the hall's run to bars and ruins. */
    const KINDS: Record<string, [IsleKind, number][]> = {
      causeway: [['bar', 3], ['mound', 2], ['tussocks', 2], ['ruin', 1]],
      hall: [['ruin', 2], ['bar', 2], ['tussocks', 2]],
      temple: [['mound', 2], ['tussocks', 2], ['lagoon', 1], ['ruin', 1]],
      open: [['mound', 3], ['bar', 2], ['tussocks', 2], ['lagoon', 2], ['ruin', 1]],
    };
    const lobed = (kind: IsleKind, x: number, z: number, rad: number, ang: number): Island => {
      const lobes: Island['lobes'] = [];
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      let reach = rad;
      let block: number | undefined;
      if (kind === 'mound') {
        // a big lobe and three or four smaller round it, so its outline is a coast, not an oval
        lobes.push({ x, z, r: rad, h: range(r, 0.75, 1.05) });
        for (let k = 0, n = 3 + Math.floor(r() * 2); k < n; k++) {
          const a = (k / n) * Math.PI * 2 + r() * 1.2;
          const d = rad * range(r, 0.55, 0.95);
          lobes.push({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, r: rad * range(r, 0.35, 0.6), h: range(r, 0.45, 0.8) });
        }
        reach = rad * 1.6;
      } else if (kind === 'bar') {
        // a spit drawn out along the flow, bending, fat at its head and thinning to its tail
        const len = rad * range(r, 3, 4.5);
        const bend = (r() - 0.5) * 0.8;
        for (let k = 0, n = 7; k < n; k++) {
          const t = k / (n - 1);
          const off = Math.sin(t * Math.PI) * bend * len * 0.35;
          lobes.push({ x: x + fx * (t - 0.4) * len + fz * off, z: z + fz * (t - 0.4) * len - fx * off, r: rad * lerp(0.75, 0.3, t), h: lerp(0.5, 0.25, t) });
        }
        reach = len * 0.7;
      } else if (kind === 'tussocks') {
        // sedge tufts, each its own little hump, in a loose cluster
        for (let k = 0, n = 6 + Math.floor(r() * 5); k < n; k++) {
          const a = r() * Math.PI * 2;
          const d = rad * Math.sqrt(r()) * 1.5;
          lobes.push({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d, r: range(r, 0.9, 1.7), h: range(r, 0.55, 0.8) });
        }
        reach = rad * 1.5 + 1.7;
      } else if (kind === 'lagoon') {
        // a ring of silt round a pool, open toward ang
        const n = 9;
        for (let k = 0; k < n; k++) {
          const a = ang + 0.7 + (k / (n - 1)) * (Math.PI * 2 - 1.4);
          lobes.push({ x: x + Math.sin(a) * rad * 1.3, z: z + Math.cos(a) * rad * 1.3, r: rad * range(r, 0.4, 0.55), h: range(r, 0.5, 0.75) });
        }
        reach = rad * 1.9;
      } else {
        // a fallen block of the temple, square to its turn, silt heaped round it
        block = rad * range(r, 0.32, 0.42);
        lobes.push({ x, z, r: rad, h: 0.45 });
        lobes.push({ x: x - fx * rad * 0.6, z: z - fz * rad * 0.6, r: rad * 0.7, h: 0.4 });
        reach = rad * 1.4;
      }
      return { kind, x, z, r: reach, ang, seed: r() * 100, lobes, block };
    };
    for (const b of beats) {
      if (b.kind === 'beds' || b.kind === 'cloister') continue;
      const off = b.kind === 'causeway' ? 24 : b.kind === 'temple' ? (temples[0]?.w ?? 28) + 7 : b.kind === 'hall' ? (halls[0]?.half ?? 28) + 5 : LANE + 6;
      const kinds = KINDS[b.kind] ?? KINDS.open;
      for (let z = b.z0 - range(r, 2, 8); z > b.z1 + 2; z -= range(r, 10, 16))
        for (const side of [-1, 1]) {
          if (r() < (b.kind === 'breather' || b.kind === 'mouth' || b.kind === 'out' ? 0.3 : 0.45)) continue;
          const kind = weighted(r, kinds);
          let rad = kind === 'tussocks' ? range(r, 2.5, 4) : kind === 'bar' ? range(r, 2, 3) : range(r, 3, 5.5);
          let x = wander(z) + side * range(r, off + rad * 0.6, Math.max(off + 2 + rad * 0.6, HALF_W + 6));
          let zz = z;
          // a bar lies along the flow; a lagoon opens away from the way (the sheltered side)
          const ang = kind === 'lagoon' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (r() - 0.5) * 0.8 : (r() - 0.5) * 0.7 + (r() < 0.5 ? 0 : Math.PI);
          for (let k = 0, n = kind === 'lagoon' || kind === 'ruin' ? 1 : 1 + Math.floor(r() * 3); k < n; k++) {
            const il = lobed(kind, x, zz, rad, ang);
            islands.push(il);
            // (the next smaller, downstream)
            x += side * range(r, -1, 3) + Math.sin(ang) * rad * 1.2;
            zz += -(il.r + rad * 0.4) * (r() < 0.5 ? 1 : -1) * 1.2;
            rad *= range(r, 0.5, 0.7);
          }
        }
    }
    const isleBy = new Map<number, Island[]>();
    for (const il of islands)
      for (let k = Math.floor((il.z - il.r - 2) / 10); k <= Math.floor((il.z + il.r + 2) / 10); k++) {
        if (!isleBy.has(k)) isleBy.set(k, []);
        isleBy.get(k)!.push(il);
      }
    /** The island at (x, z), if any, and how high it lifts there: its lobes' low domes, their edges ragged; a ruin's block square. */
    const isleAt = (x: number, z: number): [number, Island | null] => {
      let h = 0;
      let at: Island | null = null;
      for (const il of isleBy.get(Math.floor(z / 10)) ?? []) {
        if (Math.abs(x - il.x) > il.r + 2 || Math.abs(z - il.z) > il.r + 2) continue;
        const rag = 0.82 + 0.36 * noise2(x * 0.45 + il.seed, z * 0.45, s + 11);
        for (const lb of il.lobes) {
          const d = Math.hypot(x - lb.x, z - lb.z) / (lb.r * rag);
          if (d < 1.3) {
            const lh = (lb.h + MUD.high - MUD[tide] + 0.3) * (1 - smoothstep(0.25, 1.25, d));
            if (lh > h) [h, at] = [lh, il];
          }
        }
        if (il.block) {
          const c = Math.cos(il.ang);
          const sn = Math.sin(il.ang);
          const u = Math.abs((x - il.x) * c - (z - il.z) * sn);
          const v = Math.abs((x - il.x) * sn + (z - il.z) * c);
          const e = Math.max(u, v * 0.8) - il.block;
          if (e < 0.3) {
            const bh = 0.95 + MUD.high - MUD[tide] + 0.3 + (e < 0 ? 0.25 : 0);
            if (bh > h) [h, at] = [bh, il];
          }
        }
      }
      return [h, at];
    };
    const isle = (x: number, z: number) => isleAt(x, z)[0];
    /** The swamp's floor: black water, and the islands' silt heaped out of it. */
    const swamp = (x: number, z: number) => 0.0 + MUD[tide] + isle(x, z) + (noise2(x * 0.3, z * 0.3, s + 2) - 0.5) * 0.08;

    // ── the temple ──────────────────────────────────────────────────────────────────────────
    /** How far (x, z) is inside tier k's footprint (negative outside). */
    const inTier = (t: Temple, k: number, x: number, z: number) => Math.min(t.w - k * t.ix - Math.abs(x - t.x), t.d - k * t.iz - Math.abs(z - t.z));
    const tier = (t: Temple, x: number, z: number) => {
      let k = -1;
      while (k + 1 < t.n && inTier(t, k + 1, x, z) >= 0) k++;
      return k;
    };
    /** The temple's stairs: how far along (0 foot … 1 crown) (x, z) is up one, and how far across it from the middle; or null. */
    const stair = (t: Temple, x: number, z: number): [number, number] | null => {
      const across = Math.abs(x - t.x);
      if (across > 5.6) return null;
      const dz = Math.abs(z - t.z);
      const top = t.d - (t.n - 1) * t.iz;
      if (dz < top - 0.5 || dz > t.d + 1.5) return null;
      return [clamp((t.d + 0.6 - dz) / (t.d + 0.6 - top), 0, 1), across];
    };
    const templeHeight = (t: Temple, x: number, z: number, under: number) => {
      const lvl0 = base + 0.4;
      let h = lerp(under, lvl0, smoothstep(-0.4, 0.4, inTier(t, 0, x, z)));
      for (let k = 1; k < t.n; k++) h += RISE * smoothstep(-0.35, 0.35, inTier(t, k, x, z));
      // the stairs, up the face and down the back, between their balustrades
      const st = stair(t, x, z);
      if (st) {
        const [u, across] = st;
        const ramp = lvl0 + u * (t.n - 1) * RISE;
        if (across < 4.2) h = lerp(h, ramp, smoothstep(4.2, 3.6, across) * smoothstep(-0.6, 0, inTier(t, 0, x, z)));
        else h = Math.max(h, (ramp + 0.5) * smoothstep(5.6, 5.0, across) + h * smoothstep(5.0, 5.6, across));
      }
      // the socket in the crown, where the grow-heart tore herself out: a dark well, its lip heaved
      const dp = Math.hypot(x - t.x, (z - t.z) * 1.1);
      if (dp < t.pit + 2) {
        h += 0.35 * Math.exp(-((dp - t.pit - 0.6) ** 2) * 2);
        h = lerp(h, WATER - 0.6, 1 - smoothstep(t.pit - 0.8, t.pit + 0.2, dp));
      }
      return h;
    };
    /** The bloom pouring down the flank away from the Rang: lobes from the crown's edge down to the water. */
    const tongue = (t: Temple, x: number, z: number) => {
      const side = -t.rang;
      const ax = (x - t.x) * side;
      if (ax < 4) return 0;
      // (its middle swings as it comes down, like something poured; its lobes break up its edge)
      const run = (ax - 4) / Math.max(1, t.w - 4);
      const mid = t.z + (t.d * 0.25) * Math.sin(run * 2.2 + s) - t.d * 0.15;
      const width = t.d * (0.22 + 0.25 * run) * (0.75 + 0.5 * fbm(x * 0.12, z * 0.12, s + 5));
      return 1 - smoothstep(width * 0.8, width, Math.abs(z - mid));
    };

    // ── the cloister ────────────────────────────────────────────────────────────────────────
    const hex = (c: Cloister, x: number, z: number) => {
      const qx = (x - c.ox) / (1.5 * HEX);
      let best = { i: 0, j: 0, x: 0, z: 0, d: -Infinity };
      let bd = Infinity;
      for (let i = Math.floor(qx) - 1; i <= Math.floor(qx) + 2; i++) {
        const cx = c.ox + i * 1.5 * HEX;
        const off = i & 1 ? (SQ3 * HEX) / 2 : 0;
        const qj = Math.round((z - c.oz - off) / (SQ3 * HEX));
        for (let j = qj - 1; j <= qj + 1; j++) {
          const cz = c.oz + off + j * SQ3 * HEX;
          const dd = (x - cx) ** 2 + (z - cz) ** 2;
          if (dd < bd) {
            bd = dd;
            const dx = x - cx;
            const dz = z - cz;
            const e = Math.max(Math.abs(dx * (SQ3 / 2) + dz * 0.5), Math.abs(dz), Math.abs(-dx * (SQ3 / 2) + dz * 0.5));
            best = { i, j, x: cx, z: cz, d: (SQ3 / 2) * HEX - e };
          }
        }
      }
      return best;
    };
    const court = (i: number, j: number) => {
      const q = hash(i * 7.3 + s, j * 3.1);
      const pool = tide === 'drowned' ? 0.55 : tide === 'high' ? 0.35 : 0.2;
      if (q < pool) return 'pool';
      if (q < pool + 0.25) return 'grown';
      if (q < pool + 0.36) return 'garden';
      return 'paved';
    };
    const door = (x: number, z: number) => hash(Math.round(x * 2) + s * 0.37, Math.round(z * 2)) < 0.62;
    /** Where on its wall (x, z) is: how far from the wall's middle along it. */
    const alongWall = (h: { x: number; z: number }, x: number, z: number) => {
      const a = Math.atan2(z - h.z, x - h.x);
      const k = Math.round((a - Math.PI / 6) / (Math.PI / 3));
      const na = Math.PI / 6 + k * (Math.PI / 3);
      const mx = h.x + Math.cos(na) * (SQ3 / 2) * HEX;
      const mz = h.z + Math.sin(na) * (SQ3 / 2) * HEX;
      return { t: Math.abs(-(x - h.x) * Math.sin(na) + (z - h.z) * Math.cos(na)), mx, mz };
    };

    // ── the beds ────────────────────────────────────────────────────────────────────────────
    /** Where (x, z) is in the beds: which side, which tier (0 nearest the channel), which row; or null in the channel. */
    const bedAt = (b: Beds, x: number, z: number) => {
      const ax = Math.abs(x - b.x) - 4.5;
      if (ax < 0) return null;
      const t = Math.floor(ax / BED_W);
      const row = Math.floor((b.gz - z) / b.pitch);
      return { side: (x < b.x ? -1 : 1) as -1 | 1, tier: t, row, u: ax - t * BED_W, v: b.gz - z - row * b.pitch };
    };
    const bed = (b: Beds, side: -1 | 1, t: number, row: number) => {
      const q = hash(row * 5.1 + side * 13.7 + s, t * 2.9);
      const wet = tide === 'low' ? 0.2 : tide === 'high' ? 0.4 : 0.6;
      // (the lowest tier holds the most water; the highest is the driest)
      const w = wet * (1.3 - t * 0.2);
      return q < w ? 'water' : q < w + 0.4 ? 'grown' : 'dry';
    };

    // ── the hall ────────────────────────────────────────────────────────────────────────────
    const hallFloor = (hl: Hall, x: number, z: number, under: number) => {
      const d = Math.abs(x - hl.x);
      let h = Math.min(under, WATER - 0.35 + (noise2(x * 0.2, z * 0.2, s + 6) - 0.5) * 0.1);
      // (the hall's walls along its sides, awash)
      const wall = smoothstep(1.3, 0.7, Math.abs(d - hl.half)) * smoothstep(hl.z0 + 2, hl.z0 - 2, z) * smoothstep(hl.z1 - 2, hl.z1 + 2, z);
      h = Math.max(h, lerp(h, WATER + 0.18, wall));
      for (const sl of hl.slabs) {
        const c = Math.cos(sl.rot);
        const sn = Math.sin(sl.rot);
        const u = (x - sl.x) * c + (z - sl.z) * sn;
        const v = -(x - sl.x) * sn + (z - sl.z) * c;
        const k = smoothstep(0.3, -0.2, Math.max(Math.abs(u) - sl.hw, Math.abs(v) - sl.hd));
        h = lerp(h, WATER + 0.24 + (u / sl.hw) * 0.1, k);
      }
      return h;
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      let h = swamp(x, z);
      switch (b.kind) {
        case 'temple': {
          for (const t of temples) if (Math.abs(z - t.z) < t.d + 6) h = templeHeight(t, x, z, h);
          // (the causeway runs on up to the foot of the stair)
          for (const c of causeways) if (z <= c.z0 && z > c.z1) h = Math.max(h, deckHeight(c, x, z, h));
          break;
        }
        case 'causeway': {
          for (const c of causeways) if (z <= c.z0 && z > c.z1) h = deckHeight(c, x, z, h);
          break;
        }
        case 'beds': {
          for (const bd of beds) {
            if (z > bd.z0 + 3 || z < bd.z1 - 3) continue;
            const edge = smoothstep(bd.z0 + 3, bd.z0, z) * smoothstep(bd.z1 - 3, bd.z1, z);
            const at = bedAt(bd, x, z);
            let hb: number;
            if (!at) hb = Math.min(h, WATER - 0.45);
            else {
              const t = Math.min(at.tier, bd.tiers - 1);
              const top = base + 0.25 + t * BED_UP;
              const state = bed(bd, at.side, t, at.row);
              // the bed sunk inside its lips; a lip along the tier's inner edge and between the rows
              const lip = Math.max(smoothstep(0.9, 0.3, at.u), smoothstep(0.75, 0.2, at.v), smoothstep(bd.pitch - 0.75, bd.pitch - 0.2, at.v));
              const floor = top - (state === 'water' ? 0.3 : 0.18);
              hb = lerp(floor, top + 0.12, lip);
              // (the channel's bank: a sheer ceramic face down to the water)
              if (at.tier === 0) hb = lerp(WATER - 0.45, hb, smoothstep(-0.1, 0.35, at.u));
              if (at.tier >= bd.tiers) hb = lerp(hb, h, smoothstep(0, 4, at.u + (at.tier - bd.tiers) * BED_W));
            }
            h = lerp(h, hb, edge);
          }
          break;
        }
        case 'cloister': {
          for (const c of cloisters) {
            if (z > c.z0 + 4 || z < c.z1 - 4) continue;
            const edge = smoothstep(c.z0 + 4, c.z0, z) * smoothstep(c.z1 - 4, c.z1, z) * (1 - smoothstep(HALF_W + 2, HALF_W + 8, Math.abs(x)));
            const hx = hex(c, x, z);
            const kind = court(hx.i, hx.j);
            const floor = kind === 'pool' ? WATER - 0.4 : base;
            // the walls: along every edge, a door in the middle of most
            let wall = smoothstep(0.85, 0.35, hx.d);
            if (wall > 0) {
              const w = alongWall(hx, x, z);
              if (w.t < 1.5 && door(w.mx, w.mz)) wall *= smoothstep(1.0, 1.5, w.t);
            }
            const hc = lerp(floor, Math.max(base, WATER + 0.1) + WALL_UP, wall);
            h = lerp(h, hc, edge);
          }
          break;
        }
        case 'hall': {
          for (const hl of halls) if (z <= hl.z0 + 6 && z > hl.z1 - 6) h = hallFloor(hl, x, z, h);
          break;
        }
      }
      return h;
    };

    /** The causeway's deck over the water, its embankment sheer; sunk where it's gapped. */
    function deckHeight(c: Causeway, x: number, z: number, under: number) {
      const d = Math.abs(x - c.x);
      // (the stations: a bastion either side of the deck, for its lamps)
      const st = c.stations.some((zs) => Math.abs(z - zs) < 2.4) ? 2.2 : 0;
      const k = smoothstep(DECK + st + 0.5, DECK + st, d) * smoothstep(c.z1 - 1, c.z1 + 1, z) * smoothstep(c.z0 + 1, c.z0 - 1, z);
      let deck = base + DECK_UP;
      for (const g of c.gaps) {
        // (sunk in a dip, its broken ends tipped down into it)
        const into = Math.min(g.z0 - z, z - g.z1);
        if (into > -1.5) deck = lerp(deck, WATER - 0.3, smoothstep(-1.5, 0.8, into));
      }
      return lerp(under, Math.max(deck, Math.min(under, deck)), k);
    }

    /** The paving's pattern at (u, v) in its own frame: a joint (dark) or a slab (one of three tones). */
    const slabs = (u: number, v: number, w: number, d: number): [number, number] => {
      const iu = Math.floor(u / d);
      const iv = Math.floor(v / w + (iu & 1 ? 0.5 : 0));
      const fu = u / d - iu;
      const fv = v / w + (iu & 1 ? 0.5 : 0) - iv;
      if (fu < 0.1 || fv < 0.08) return [JOINT, 0.75];
      return [PAVE[Math.floor(noise2(iu * 3.1 + 0.5, iv * 1.7 + 0.5, s + 5) * 2.99)], 0.9];
    };
    /** Old moss and the swamp's stain creeping over ceramic, in patches (more near the water). */
    const weather = (x: number, z: number, h: number, c: [number, number]): [number, number] => {
      const m = fbm(x * 0.09, z * 0.09, s + 7) - 0.25 * smoothstep(WATER + 2.5, WATER + 0.5, h);
      if (m < 0.32) return [MOSS, 0.75];
      return c;
    };

    /**
     * The islands, by their kind, in bands like a contour map so each reads at a glance: pale silt
     * where it shelves into the water, a dark belt of sedge above that, then its back: moss in two
     * greens on a mound (the bloom creeping over the odd one), silt streaked along its flow on a
     * bar, dark tufts with pale tips on tussocks; a ruin's block pale ceramic, its joints showing.
     */
    const isleStain = (x: number, z: number, h: number): [number, number] | null => {
      if (h < WATER - 0.05) return null;
      const [ih, il] = isleAt(x, z);
      if (!il || ih < 0.05) return null;
      const up = h - WATER;
      if (il.block) {
        const c = Math.cos(il.ang);
        const sn = Math.sin(il.ang);
        const u = (x - il.x) * c - (z - il.z) * sn;
        const v = (x - il.x) * sn + (z - il.z) * c;
        if (Math.max(Math.abs(u), Math.abs(v) * 0.8) < il.block) {
          if (Math.max(Math.abs(u), Math.abs(v) * 0.8) > il.block - 0.6) return [KERB, 0.85];
          const fu = (((u + il.block) / 1.6) % 1 + 1) % 1;
          if (fu < 0.14) return [JOINT, 0.7];
          return fbm(x * 0.2, z * 0.2, s + 13) < 0.38 ? [MOSS, 0.75] : [PAVE[Math.floor(il.seed) % 3], 0.85];
        }
      }
      if (up < 0.1) return [il.kind === 'bar' ? 0xb0a888 : 0x9a9474, 0.7];
      if (up < 0.24) return [0x52683a, 0.85];
      switch (il.kind) {
        case 'bar': {
          const f = Math.sin(il.ang);
          const g = Math.cos(il.ang);
          // streaks along the flow
          const st = noise2((x * g - z * f) * 0.9, (x * f + z * g) * 0.12, s + 14);
          return st > 0.55 ? [0xb0a888, 0.65] : [0x8e8a6a, 0.65];
        }
        case 'tussocks':
          return up > 0.42 ? [0x8aa05a, 0.85] : [0x55703c, 0.85];
        default: {
          // the bloom creeping up the odd mound out of the water
          if (il.seed < 30 && fbm(x * 0.15, z * 0.15, s + 15) < 0.4) return [BLOOM, 0.75];
          return noise2(x * 0.35, z * 0.35, s + 9) > 0.55 ? [0x8aa45a, 0.85] : [0x6a8a4a, 0.85];
        }
      }
    };
    const stain = (x: number, z: number): [number, number] | null => {
      const h = height(x, z);
      return built(x, z, h) ?? isleStain(x, z, h);
    };
    const built = (x: number, z: number, h: number): [number, number] | null => {
      const b = beatAt(z);
      if (h < WATER - 0.05) return null;
      switch (b.kind) {
        case 'temple':
        case 'causeway': {
          for (const t of temples) {
            if (b.kind !== 'temple' || Math.abs(z - t.z) > t.d + 1) continue;
            const k = tier(t, x, z);
            const st = stair(t, x, z);
            if (st && st[1] < 5.6) {
              // the stair's treads, pale, their shadows dark; the balustrades plain
              if (st[1] > 4.2) return [KERB, 0.85];
              const dz = Math.abs(z - t.z);
              return Math.floor(dz / 0.8) % 2 ? [PAVE[2], 0.85] : [JOINT, 0.6];
            }
            if (k < 0) break;
            if (Math.hypot(x - t.x, (z - t.z) * 1.1) < t.pit + 1.2) return [SOOT, 0.5];
            const bl = tongue(t, x, z);
            if (bl > 0.5) return [BLOOM, 0.85];
            // each tier's top edge a kerb of long stones; slabs between
            const edge = inTier(t, k, x, z);
            if (edge < 1.0) return [KERB, 0.85];
            // (and at the foot of the next tier's riser, its shadow: a step you can see is a step)
            if (k + 1 < t.n && inTier(t, k + 1, x, z) > -1.3) return [JOINT, 0.8];
            // (darker down by the water, paler up to the crown: the tops lit)
            const sl = slabs(x - t.x + 100, z - t.z + 100, 3.2, 2.6);
            if (sl[0] === JOINT) return sl;
            return weather(x, z, h, [TIER[k] + (sl[0] === PAVE[1] ? 0x080808 : 0), 0.9]);
          }
          for (const c of causeways) {
            if (z > c.z0 || z <= c.z1) continue;
            const d = Math.abs(x - c.x);
            if (h < base + DECK_UP - 0.1) continue;
            // kerbs along both edges, the hearth line down the middle in glaze, slabs between
            if (d > DECK - 1.0 && d < DECK + 0.2) return [KERB, 0.85];
            if (d < 0.5) return Math.floor(z / 1.6) % 2 ? [GLAZE, 0.8] : [PAVE[0], 0.85];
            return slabs(z + 100, x - c.x + 100, 2.6, 3.4);
          }
          return null;
        }
        case 'beds': {
          for (const bd of beds) {
            const at = bedAt(bd, x, z);
            if (!at || at.tier >= bd.tiers || z > bd.z0 || z < bd.z1) continue;
            if (at.u < 0.9 || at.v < 0.75 || at.v > bd.pitch - 0.75) return [KERB, 0.85];
            const state = bed(bd, at.side, at.tier, at.row);
            if (state === 'water') return [BED_WET, 0.92];
            if (state === 'grown') return [BLOOM, 0.7];
            // (dry: cracked mud, the furrows still showing)
            return [BED_MUD, Math.floor(at.u / 1.2) % 2 ? 0.8 : 0.65];
          }
          return null;
        }
        case 'cloister': {
          for (const c of cloisters) {
            if (z > c.z0 || z < c.z1) continue;
            const hx = hex(c, x, z);
            if (hx.d < 0.85) return [KERB, 0.8];
            const kind = court(hx.i, hx.j);
            if (kind === 'grown') return [BLOOM, 0.6 + 0.3 * smoothstep(1, 4, hx.d)];
            if (kind === 'garden') return Math.floor((x - hx.x + 50) / 1.6) % 2 ? [BED_MUD, 0.85] : [0x6a5a48, 0.85];
            // (the floor paved in rings round the court's middle, a hearth-stone at its heart)
            const dc = Math.hypot(x - hx.x, z - hx.z);
            if (dc < 1.4) return [GLAZE, 0.75];
            return weather(x, z, h, Math.floor(dc / 1.9) % 2 ? [PAVE[0], 0.85] : [PAVE[1], 0.85]);
          }
          return null;
        }
        case 'hall': {
          // (the hall's walls, awash: a line of pale coping stones)
          for (const hl of halls) if (Math.abs(Math.abs(x - hl.x) - hl.half) < 1.0 && z < hl.z0 + 2 && z > hl.z1 - 2) return [KERB, 0.85];
          for (const hl of halls) for (const sl of hl.slabs) {
            const c = Math.cos(sl.rot);
            const sn = Math.sin(sl.rot);
            const u = (x - sl.x) * c + (z - sl.z) * sn;
            const v = -(x - sl.x) * sn + (z - sl.z) * c;
            if (Math.abs(u) < sl.hw && Math.abs(v) < sl.hd) return weather(x, z, h, slabs(u + 50, v + 50, 2.4, 2.4));
          }
          return null;
        }
      }
      return null;
    };

    // the water a Mire Eel keeps to (sim/foes.ts): the beds' feed channel, the hall's middle aisle,
    // the open water beside the causeway (one side, by its hash), and the open water between the
    // grounds; never under the courts or the temple
    const routes: Route[] = [];
    for (const b of beats) {
      if (b.kind === 'cloister' || b.kind === 'temple') continue;
      const cw = b.kind === 'causeway' ? causeways.find((c) => c.z0 >= b.z1 && c.z1 <= b.z0) : undefined;
      const side = noise2(b.z0 * 0.37, 1.5, s) < 0.5 ? -1 : 1;
      const pts: Route['pts'] = [];
      for (let z = b.z0; z > b.z1; z -= 4) pts.push({ x: cw ? cw.x + side * (DECK + 5) : lane(z), z });
      pts.push({ x: cw ? cw.x + side * (DECK + 5) : lane(b.z1), z: b.z1 });
      routes.push({ kind: 'water', pts });
    }

    const bones: Site = {
      height,
      stain,
      routes,
      beats,
      tide,
      base,
      lane,
      swamp,
      islands,
      causeways,
      beds,
      temples,
      cloisters,
      halls,
      bed,
      court,
      hex,
      door,
      tier,
      tongue,
    };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Site);
  },
};

/** What grows in the shallows. */
const REEDS = [['reed_clump', 3], ['lily_pad', 1]] as const;

function plan(kit: Kit, b: Site) {
  const r = kit.r;
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;
  const g = kit.ground;
  const wet = (x: number, z: number) => g.height(x, z) < WATER - 0.05;

  /** A hearth-lamp at (x, z): lit (the Rang keep a few), dark, or snapped. */
  const lamp = (x: number, z: number, lit = r() < 0.35, broken = false) =>
    kit.put('mirefall_hearth_lamp', x, z, { s: range(r, 0.95, 1.05), rot: 0, variant: broken ? 2 : lit ? 0 : 1, overlap: true });
  /** A column of the old halls: whole, broken, a stump, or fallen along (dx, dz). */
  const column = (x: number, z: number, fate: number, dx = 1, dz = 0) =>
    kit.put('mirefall_column', x, z, { s: range(r, 0.95, 1.05), rot: fate === 3 ? turnTo(1, 0, dx, dz) : r() * Math.PI * 2, variant: fate, pad: 0.2 });
  /** Reeds and lily pads in the shallows round (x, z), if it's shallow there. */
  const reeds = (x: number, z: number, n: number) => {
    const h = g.height(x, z);
    if (h > WATER + 0.2 || h < WATER - 0.4 || !clear(x, z, LANE + 1)) return;
    kit.group(x, z, { kinds: REEDS, n, spread: 2.5 + n * 0.35, big: 1.3, small: 0.7, keep: (xx, zz) => clear(xx, zz, LANE) && g.height(xx, zz) < WATER + 0.25 });
  };
  /** Lily pads in a drift on still open water. */
  const lilies = (x: number, z: number, n: number) => {
    if (!wet(x, z)) return;
    kit.group(x, z, { kinds: [['lily_pad', 1]], n, spread: 3 + n * 0.4, big: 1.2, small: 0.7, keep: (xx, zz) => wet(xx, zz) });
  };
  /** The open swamp: reeds round the mud banks, lilies on the still water, mist at the sides. */
  const swamp = (bt: Beat, rich: number, fog = true) => {
    // each island dressed by its kind: reeds where it shelves into the water, and on its back what
    // that kind grows; lilies in its lee
    for (const il of b.islands) {
      if (il.z > bt.z0 || il.z <= bt.z1) continue;
      const lee = -Math.sign(il.x - b.lane(il.z));
      const fx = Math.sin(il.ang);
      const fz = Math.cos(il.ang);
      /** The rim of a lobe, toward a (or the way out from the island's middle). */
      const rim = (lb: Island['lobes'][number], a = Math.atan2(lb.x - il.x, lb.z - il.z) + (r() - 0.5) * 0.8) =>
        [lb.x + Math.sin(a) * lb.r * 0.95, lb.z + Math.cos(a) * lb.r * 0.95] as const;
      switch (il.kind) {
        case 'mound': {
          const [head, ...rest] = il.lobes;
          for (const lb of rest) if (r() < 0.75) reeds(...rim(lb), 3 + Math.floor(lb.r));
          if (head.r > 3.2 && r() < rich + 0.3) kit.put('mirefall_hummock', head.x, head.z, { s: range(r, 0.8, 1.1), variant: r() < 0.25 ? 2 : 0 });
          else kit.put('mirefall_moss_bed', head.x, head.z, { s: range(r, 0.8, 1.1) });
          // a lantern plant or pitchers on a smaller lobe
          const lb = rest[Math.floor(r() * rest.length)];
          if (lb && r() < rich) kit.put(r() < 0.5 ? 'mirefall_bog_lantern' : 'mirefall_pitcher', lb.x, lb.z, { s: range(r, 0.7, 0.95), variant: 1 });
          break;
        }
        case 'bar':
          // reeds strung along its lee flank, thinning to the tail; lilies off the tail
          for (let k = 0; k < il.lobes.length - 1; k += 2) {
            const lb = il.lobes[k];
            reeds(lb.x + fz * lee * lb.r * 0.9, lb.z - fx * lee * lb.r * 0.9, Math.max(2, 5 - k));
          }
          if (r() < rich) {
            const t = il.lobes[il.lobes.length - 1];
            lilies(t.x + fx * 3, t.z + fz * 3, 4 + Math.floor(r() * 3));
          }
          // a drowned column the water rolled up onto it, lying along the flow
          if (r() < rich * 0.5) column(il.lobes[1].x, il.lobes[1].z, 3, fx, fz);
          break;
        case 'tussocks':
          // a tuft of reeds or cottongrass on every hump
          for (const lb of il.lobes)
            if (r() < 0.5) kit.put('reed_clump', lb.x, lb.z, { s: range(r, 0.7, 1.1) });
            else kit.put('mirefall_hummock', lb.x, lb.z, { s: lb.r * range(r, 0.3, 0.4), variant: 0 });
          break;
        case 'lagoon': {
          // lilies on its pool, reeds round its outside, a lantern plant at the mouth
          lilies(il.x, il.z, 6 + Math.floor(r() * 4));
          for (const lb of il.lobes) if (r() < 0.4) reeds(...rim(lb), 3);
          const m = il.lobes[r() < 0.5 ? 0 : il.lobes.length - 1];
          kit.put('mirefall_bog_lantern', m.x, m.z, { s: range(r, 0.8, 1), variant: r() < 0.5 ? 1 : 0 });
          if (r() < rich * 0.6) punt(il.x + fx * il.r * 0.8, il.z + fz * il.r * 0.8, fx, fz);
          break;
        }
        case 'ruin': {
          // what stood on the block: a column's stump, a stele, an idol's head; moss in its corner
          const pick = r();
          if (pick < 0.45) column(il.x, il.z, r() < 0.5 ? 1 : 2);
          else if (pick < 0.75) kit.put('mirefall_stele', il.x, il.z, { s: range(r, 0.8, 1), rot: il.ang, pad: 0.2 });
          else kit.put('mirefall_idol_head', il.x, il.z, { s: range(r, 0.6, 0.8), rot: il.ang + Math.PI / 2 });
          kit.put('mirefall_moss_bed', il.x - fx * (il.block ?? 2), il.z - fz * (il.block ?? 2), { s: range(r, 0.6, 0.8), overlap: true });
          for (const lb of il.lobes) reeds(...rim(lb), 3);
          break;
        }
      }
      if (il.kind !== 'lagoon' && r() < rich) lilies(il.x + lee * il.r * 1.2, il.z + (r() - 0.5) * il.r, 3 + Math.floor(r() * 4));
    }
    if (fog) for (const side of [-1, 1]) if (r() < 0.6) kit.emit('fog', side * range(r, 30, 40), lerp(bt.z0, bt.z1, range(r, 0.2, 0.8)));
  };
  /** A Rang punt on the water at (x, z), lying along (dx, dz). */
  const punt = (x: number, z: number, dx: number, dz: number) => {
    if (!wet(x, z)) return null;
    return kit.put('mirefall_punt', x, z, { s: 1, rot: turnTo(0, -1, dx, dz), pad: 0.3 });
  };
  /** A Rang hut at (x, z), its door to (dx, dz); smoke from its fire. */
  const hut = (x: number, z: number, dx: number, dz: number, variant?: number) => {
    const p = kit.put('mirefall_rang_hut', x, z, { s: range(r, 0.95, 1.1), rot: turnTo(0, 1, dx, dz), variant: variant ?? Math.floor(r() * 3), pad: 0.4 });
    if (p && r() < 0.6) kit.emit('smoke', x, z);
    return p;
  };

  for (const bt of kit.beats) {
    switch (bt.kind) {
      case 'mouth': {
        swamp(bt, 0.5);
        // the water-gate: two great lamps either side of the way, the Rang's kept lit
        const z = bt.z1 + 7;
        const lx = b.lane(z);
        const lit = r() < 0.5 ? -1 : 1;
        for (const side of [-1, 1]) {
          const x = lx + side * (LANE + 6);
          kit.solid('mirefall_lamp_pylon', x, z, 1, 0);
          const p = kit.props[kit.props.length - 1];
          if (p?.kind === 'mirefall_lamp_pylon') p.variant = side === lit ? 0 : 1;
          kit.post(x + side * 4, z + 3, 0, 'gate');
          reeds(x + side * 5, z - 2, 6);
          // the line of the old shore wall running off from each, its lamps long fallen
          for (let k = 1; k <= 3; k++) {
            const xs = x + side * k * 9;
            if (Math.abs(xs) < HALF_W + 6) column(xs, z + (r() - 0.5), k === 1 ? 1 : 2);
          }
        }
        // a punt going out to tend the lamp
        punt(lx + lit * (LANE + 2), z + 10, 0, -1);
        break;
      }
      case 'breather': {
        swamp(bt, 0.45);
        // a punt drifting, a lone lamp leaning in the shallows
        if (r() < 0.6) punt((r() < 0.5 ? -1 : 1) * range(r, 12, 26), lerp(bt.z0, bt.z1, range(r, 0.3, 0.7)), r() - 0.5, -1);
        if (r() < 0.5) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 14, 28);
          lamp(x, lerp(bt.z0, bt.z1, range(r, 0.2, 0.8)), false, r() < 0.5);
        }
        break;
      }
      case 'causeway': {
        for (const c of b.causeways) {
          // a lamp either side at every station, on its bastion; a lit one now and then
          // (lit in pairs: the Rang keep the last stations before the temple burning, and one here
          // and there along the way; a lamp beside a gap is broken)
          c.stations.forEach((zs, i) => {
            const gapped = c.gaps.some((gp) => zs < gp.z0 + 2 && zs > gp.z1 - 2);
            if (gapped) return;
            const near = c.gaps.some((gp) => zs < gp.z0 + 8 && zs > gp.z1 - 8);
            const lit = !near && (i >= c.stations.length - 2 || r() < 0.2);
            for (const side of [-1, 1]) lamp(c.x + side * (DECK + 1.3), zs, lit, near && r() < 0.5);
          });
          // the gaps: the deck's broken ends, slabs tipped into the water, reeds grown up in them
          for (const gp of c.gaps) {
            for (const zz of [gp.z0 + 0.5, gp.z1 - 0.5])
              kit.group(c.x + (r() - 0.5) * 4, zz, { kinds: [['mirefall_rubble', 1]], n: 2, spread: 3, big: 0.7, small: 0.5, keep: (xx) => Math.abs(xx - c.x) < DECK + 2 });
            kit.post(c.x + (r() < 0.5 ? -1 : 1) * (DECK + 2.5), gp.z0 + 3, 0, 'gap');
          }
          // either side, out on the water, the old colonnade the way ran between: a column every
          // station, most of them stumps now, in two lines
          for (const side of [-1, 1]) {
            const xl = c.x + side * range(r, 17, 21);
            for (const zs of c.stations) {
              const q = r();
              const fate = b.tide === 'drowned' ? (q < 0.15 ? 0 : q < 0.5 ? 1 : 2) : q < 0.35 ? 0 : q < 0.6 ? 1 : q < 0.85 ? 2 : 3;
              column(xl, zs + range(r, -0.3, 0.3), fate, side, (r() - 0.5) * 0.5);
              if (r() < 0.5) reeds(xl + side * 2.5, zs + range(r, -3, 3), 3 + Math.floor(r() * 3));
            }
          }
          // reeds grown up along the embankment's foot, lilies on the still water inside the colonnade
          for (let z = c.z0 - 3; z > c.z1 + 3; z -= range(r, 5, 9)) {
            const side = r() < 0.5 ? -1 : 1;
            reeds(c.x + side * (DECK + range(r, 2.5, 4)), z, 3 + Math.floor(r() * 3));
            if (r() < 0.4) lilies(c.x + side * range(r, 10, 14), z, 4 + Math.floor(r() * 4));
          }
          // a punt tied up at a station, the Rang come to light a lamp
          const zs = c.stations[Math.floor(r() * c.stations.length)];
          if (zs !== undefined) punt(c.x + (r() < 0.5 ? -1 : 1) * (DECK + 3.4), zs + 1.5, 0, -1);
          for (const zs2 of c.stations.filter((_, i) => i % 2 === 1)) kit.post(c.x + (r() < 0.5 ? -1 : 1) * (DECK + 0.5), zs2 - 3, 0, 'station');
        }
        // out past the colonnades, the swamp
        for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 6, 9))
          for (const side of [-1, 1]) if (r() < 0.4) reeds(side * range(r, 26, HALF_W + 6), z, 3 + Math.floor(r() * 4));
        break;
      }
      case 'temple': {
        for (const t of b.temples) templePlan(kit, b, t, { lamp, column, reeds, punt, hut, clear });
        swamp(bt, 0.3);
        break;
      }
      case 'beds': {
        for (const bd of b.beds) {
          const rows = Math.floor((bd.z0 - bd.z1) / bd.pitch);
          for (let row = 0; row < rows; row++) {
            const zr = bd.gz - (row + 0.5) * bd.pitch;
            if (zr < bd.z1 + 1) break;
            for (const side of [-1, 1] as const) {
              for (let t = 0; t < bd.tiers; t++) {
                const xm = bd.x + side * (4.5 + (t + 0.5) * BED_W + 0.4);
                if (Math.abs(xm) > HALF_W + 8) continue;
                const state = b.bed(bd, side, t, row);
                if (state === 'grown') {
                  // the mould in the rows it was taught, along the bed; since the Waking, one exact
                  const exact = hash(row + 0.5, t + side) < 0.25;
                  for (let k = 0; k < 2; k++) {
                    const xk = xm + (k - 0.5) * 2.6;
                    kit.put('mirefall_bloom_row', xk, zr, { s: range(r, 0.9, 1.05), rot: Math.PI / 2, variant: exact ? 1 : r() < 0.3 ? 2 : 0, overlap: true });
                  }
                } else if (state === 'dry' && r() < 0.3) {
                  kit.put('mirefall_bloom_mat', xm + (r() - 0.5) * 3, zr + (r() - 0.5) * 4, { s: range(r, 0.6, 0.8) });
                }
              }
              // a sluice in the channel's lip, every other row, letting the water down
              if ((row + (side > 0 ? 1 : 0)) % 2 === 0) {
                const xs = bd.x + side * 4.9;
                kit.put('mirefall_sluice', xs, zr, { s: 1, rot: turnTo(0, -1, -side, 0), variant: r() < 0.75 ? 0 : 1, overlap: true });
                kit.emit('spill', xs - side * 0.6, zr, 0, (-side) as -1 | 1);
              }
            }
            // guns on the lips at the sluices, now and then
            if (row % 2 === 1) kit.post(bd.x + (r() < 0.5 ? -1 : 1) * (4.5 + BED_W * range(r, 1, 2) + 0.4), zr - bd.pitch / 2, 0, 'beds');
          }
          // the Rang who work the beds: a hut or two up on the top tier, a punt in the channel
          for (const side of [-1, 1]) {
            if (r() < 0.65) {
              const z = lerp(bd.z0, bd.z1, range(r, 0.2, 0.8));
              const zr = bd.gz - (Math.floor((bd.gz - z) / bd.pitch) + 0.5) * bd.pitch;
              hut(bd.x + side * (4.5 + 3.5 * BED_W), zr, -side, 0);
            }
          }
          punt(bd.x + (r() - 0.5) * 2, lerp(bd.z0, bd.z1, range(r, 0.3, 0.7)), 0, 1);
          // lamps at the beds' near corners, either side of the channel, where the way comes in
          for (const side of [-1, 1]) lamp(bd.x + side * 5.6, bd.z0 - 1.2, r() < 0.5);
        }
        swamp(bt, 0.25, false);
        break;
      }
      case 'cloister': {
        for (const c of b.cloisters) {
          // every court: a column at each corner, the court's own life inside
          const seen = new Set<string>();
          for (let i = -6; i <= 6; i++)
            for (let j = -8; j <= 8; j++) {
              const off = i & 1 ? (SQ3 * HEX) / 2 : 0;
              const cx = c.ox + i * 1.5 * HEX;
              const cz = c.oz + off + j * SQ3 * HEX;
              if (cz > c.z0 + HEX || cz < c.z1 - HEX || Math.abs(cx) > HALF_W + 10) continue;
              const kind = b.court(i, j);
              const inWay = !clear(cx, cz, LANE + 2);
              for (let k = 0; k < 6; k++) {
                const vx = cx + Math.cos((k * Math.PI) / 3) * HEX;
                const vz = cz + Math.sin((k * Math.PI) / 3) * HEX;
                const key = `${Math.round(vx * 4)},${Math.round(vz * 4)}`;
                if (seen.has(key) || vz > c.z0 || vz < c.z1) continue;
                seen.add(key);
                const q = hash(vx * 1.3, vz * 0.7);
                const fate = b.tide === 'drowned' ? (q < 0.25 ? 0 : q < 0.6 ? 1 : 2) : q < 0.5 ? 0 : q < 0.75 ? 1 : 2;
                column(vx, vz, fate);
              }
              if (cz > c.z0 || cz < c.z1) continue;
              if (kind === 'grown' && !inWay) {
                kit.group(cx, cz, { kinds: [['mirefall_bloom_mat', 3], ['mirefall_brood_sac', 1]], n: 4, spread: 4, big: 1.1, small: 0.6, keep: (xx, zz) => b.hex(c, xx, zz).d > 1.4 });
              } else if (kind === 'garden' && !inWay) {
                // planted by the Rang: rows of the caps the bloom grows them, a hut at the side
                for (let k = -1; k <= 1; k++) kit.put('mirefall_bloom_row', cx + k * 2.4, cz, { s: 0.75, rot: Math.PI / 2, variant: 0, overlap: true });
                if (r() < 0.5) hut(cx + (r() < 0.5 ? -1 : 1) * 4.2, cz - 2.2, 0, 1, 1);
              } else if (kind === 'pool') {
                if (!inWay && r() < 0.6) lilies(cx + (r() - 0.5) * 3, cz + (r() - 0.5) * 3, 4 + Math.floor(r() * 4));
                if (r() < 0.25) kit.emit('bubble', cx, cz);
              } else if (kind === 'paved' && !inWay && r() < 0.35) {
                // a hearth-lamp at the court's heart
                lamp(cx, cz, r() < 0.4);
              }
              if (!inWay && r() < 0.18) kit.post(cx + (r() - 0.5) * 3, cz + (r() - 0.5) * 3, 0, 'court');
            }
          // the idol, fallen on its cheek in a drowned court beside the way
          const zc = (c.z0 + c.z1) / 2;
          const side = r() < 0.5 ? -1 : 1;
          kit.put('mirefall_idol_head', b.lane(zc) + side * range(r, 14, 20), zc, { s: 1.0, pad: 0.5, overlap: true });
        }
        break;
      }
      case 'hall': {
        for (const hl of b.halls) {
          // the hall's columns in their rows, standing out of the water: whole, broken, stumps;
          // the way down its nave, between the two middle rows
          const nx = Math.floor(hl.half / hl.px);
          for (let zr = hl.z0 - 3; zr > hl.z1 + 3; zr -= hl.pz)
            for (let i = -nx; i <= nx; i++) {
              const x = hl.x + (i + 0.5 * Math.sign(i || 1)) * hl.px * (i === 0 ? 0 : 1);
              if (i === 0) continue;
              const q = hash(x * 0.7, zr * 1.3);
              // (most still standing, and the fallen ones all thrown down the one way, away from the
              // nave: the quake that brought the bell down)
              const fate = b.tide === 'low' ? (q < 0.55 ? 0 : q < 0.78 ? 1 : q < 0.93 ? 2 : 3) : q < 0.45 ? 0 : q < 0.7 ? 1 : q < 0.9 ? 2 : 3;
              column(x, zr, fate, Math.sign(x - hl.x), 0.15);
            }
          // the bell, where it fell, in the shallows by the wall; ringing out on the water
          const bell = kit.put('mirefall_bell', hl.bell.x, hl.bell.z, { s: 1.05, rot: turnTo(1, 0, hl.bell.x > hl.x ? -1 : 1, 0.3), overlap: true, pad: 1 });
          if (bell) {
            kit.claim(hl.bell.x, hl.bell.z, 5);
            kit.emit('toll', hl.bell.x, hl.bell.z);
          }
          // lilies on the still water of the aisles, reeds along the walls outside
          for (let z = hl.z0 - 4; z > hl.z1 + 4; z -= range(r, 7, 11)) {
            lilies(hl.x + (r() < 0.5 ? -1 : 1) * range(r, 6, hl.half - 3), z, 4 + Math.floor(r() * 5));
            for (const side of [-1, 1]) if (r() < 0.6) reeds(hl.x + side * (hl.half + range(r, 1.5, 4)), z, 3 + Math.floor(r() * 4));
          }
          // guns on the roof slabs lying awash, the Rang's punts tied to them
          for (const sl of hl.slabs) {
            if (r() < 0.6) kit.post(sl.x, sl.z, 0, 'slab');
            if (r() < 0.35) punt(sl.x + (sl.x > hl.x ? 1 : -1) * (sl.hw + 1.4), sl.z, 0.2, -1);
          }
          for (let z = hl.z0; z > hl.z1; z -= range(r, 12, 18)) kit.emit('bubble', hl.x + (r() - 0.5) * hl.half, z);
        }
        swamp(bt, 0.15);
        break;
      }
      case 'out': {
        swamp(bt, 0.5);
        // the far shore's last lamps, either side of the way out, dark
        const z = bt.z0 - 8;
        const lx = b.lane(z);
        for (const side of [-1, 1]) {
          lamp(lx + side * (LANE + 3), z, false, r() < 0.3);
          reeds(lx + side * (LANE + 6), z - 1, 5);
        }
        break;
      }
    }
  }
}

interface Hands {
  lamp(x: number, z: number, lit?: boolean, broken?: boolean): unknown;
  column(x: number, z: number, fate: number, dx?: number, dz?: number): unknown;
  reeds(x: number, z: number, n: number): void;
  punt(x: number, z: number, dx: number, dz: number): unknown;
  hut(x: number, z: number, dx: number, dz: number, variant?: number): unknown;
  clear(x: number, z: number, m?: number): boolean;
}

/** The temple: its lamps, shrines, the Rang's side and the bloom's, the socket at its crown. */
function templePlan(kit: Kit, b: Site, t: Temple, h: Hands) {
  const r = kit.r;
  const front = t.z + t.d;
  const back = t.z - t.d;
  // lamps along the foot of the face either side of the stair, a station every few strides
  // (lit in mirrored pairs, the ones nearest the stair kept burning)
  for (const zEnd of [front - 1.2, back + 1.2])
    for (let k = 0, dx = 7.5; dx < t.w - 2; k++, dx += 6.5) {
      const lit = k === 0 || r() < 0.25;
      for (const side of [-1, 1]) h.lamp(t.x + side * dx, zEnd, lit);
    }
  // the stair's newels: a lit lamp each side at its foot and its head
  for (const zz of [front + 0.6, back - 0.6]) for (const side of [-1, 1]) h.lamp(t.x + side * 5.0, zz, true);
  // shrines at the corners of the middle tiers, the open side looking out over the corner
  for (let k = 1; k < t.n - 1; k++) {
    const wk = t.w - k * t.ix - 2.6;
    const dk = t.d - k * t.iz - 2.6;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        if (r() < 0.35) continue;
        const x = t.x + sx * wk;
        const z = t.z + sz * dk;
        kit.put('mirefall_shrine', x, z, { s: 1, rot: turnTo(1, -1, sx, sz), variant: r() < 0.7 ? 0 : 1, overlap: true });
      }
  }
  // the socket at the crown: the grow-heart's torn roots hanging over its lip, arching out; a
  // shard of the capstone among them; dark water deep in it
  const nroot = 7;
  const a0 = r() * Math.PI * 2;
  for (let k = 0; k < nroot; k++) {
    const a = a0 + (k / nroot) * Math.PI * 2 + (r() - 0.5) * 0.3;
    const x = t.x + Math.cos(a) * (t.pit + 0.4);
    const z = t.z + Math.sin(a) * (t.pit + 0.4) / 1.1;
    kit.put('mirefall_socket_root', x, z, { s: range(r, 0.85, 1.1), rot: turnTo(1, 0, Math.cos(a), Math.sin(a)), variant: k % 3, overlap: true });
  }
  kit.claim(t.x, t.z, t.pit + 3);
  kit.emit('breath', t.x, t.z);
  // the crown's guard: guns at its corners
  const top = t.n - 1;
  for (const sx of [-1, 1]) kit.post(t.x + sx * (t.w - top * t.ix - 3), t.z + (r() - 0.5) * 4, 0, 'crown');
  // guns at the stair's foot, either side
  for (const sx of [-1, 1]) kit.post(t.x + sx * 8, front - 3, 0, 'stair');

  // the Rang's side: two or three hamlets on the lower tiers, huts clustered round a kept lamp
  // and facing out over the water, one or two out on stilts in the shallows below; their punts
  // moored at the foot, their fires' smoke
  const rs = t.rang;
  const nh = 2 + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < nh; k++) {
    const zc = lerp(front - 8, back + 8, (k + 0.5) / nh) + range(r, -3, 3);
    const xe = t.x + rs * t.w;
    h.lamp(xe - rs * 1.6, zc, true);
    const spots: [number, number][] = [
      [-rs * 3.2, -3.2],
      [-rs * 3.6, 3.4],
      [-rs * (3.2 + t.ix), r() < 0.5 ? -1 : 1],
      [rs * 2.6, range(r, -2, 2)],
      [rs * 4.8, range(r, 3, 6) * (r() < 0.5 ? -1 : 1)],
    ];
    for (const [dx, dz] of spots) if (r() < 0.85) h.hut(xe + dx, zc + dz, rs, (r() - 0.5) * 0.6);
    h.punt(xe + rs * range(r, 3, 4.5), zc + range(r, -6, 6), r() * 0.4 - 0.2, r() < 0.5 ? 1 : -1);
  }

  // the bloom's side: mats of it poured down the tiers along its tongue, sacs swelling in it,
  // its spores lifting off
  const bs = -rs;
  for (let x = t.x + bs * 5; Math.abs(x - t.x) < t.w + 4; x += bs * range(r, 3, 4.5))
    for (let z = front; z > back; z -= range(r, 3, 4.5)) {
      if (b.tongue(t, x, z) < 0.6 || !h.clear(x, z, 5)) continue;
      if (r() < 0.55) kit.put('mirefall_bloom_mat', x + (r() - 0.5) * 1.5, z + (r() - 0.5) * 1.5, { s: range(r, 0.8, 1.15), overlap: true });
    }
  // where the tongue reaches the water, reeds
  for (let z = front; z > back; z -= range(r, 5, 8)) h.reeds(t.x + bs * (t.w + range(r, 1.5, 3.5)), z, 4);
}
