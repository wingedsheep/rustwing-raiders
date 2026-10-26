/**
 * The Scav Camp: the Draw (docs/level-design.md, its layout row). The Sankvi live on crawler-barges
 * and roll between the wrecks; when the clans gather they draw up together on the open ash, and
 * every line of the camp is a crawler's: the broad twin treads they came in on, ruled across the ash
 * and converging, the rings they drew up into, the lines they parked in.
 *
 * A level is a crossing, in through the gate in the berm (the wall of hulks the crawlers' blades
 * pushed up round the camp, a gate tower either side of the way) and out along the tracks leaving
 * the far side between the picket's two crawlers, through three grounds (two, if the stretch is
 * short), so no two crossings fly alike:
 * - the laager: a clan's crawlers drawn up nose to tail in a ring, the way in through the gap
 *   between two and out through the opposite one; inside, the commons: the long fire, the clan's
 *   tents in a ring round it, its laundry, its clutter in the crawlers' lee;
 * - the sort: the Glass Law, *what you dig is yours*: the unsorted heaps at its near end, then the
 *   clans' claims in a grid either side of the main aisle, each one kind sorted by size inside its
 *   stakes, the tally crane over the aisle;
 * - the row: the Chikta market, their sail-barges drawn up off the glass in a file along one side,
 *   bows to the way, lanterns lit between them; the Sankvi stalls under tarps facing them across
 *   it; fires behind, where they eat together;
 * - the muster: Khet's ground, the clans' banners in ranks across the field either side of the way,
 *   the rigs parked in rows on their pads, and the head's berth, empty, the ash blown out round it
 *   in a scorched star;
 * - the forge: titan alloy smelted in a pit dug down to the old glass, furnaces under chimneys of
 *   titan pipe, the slag run out of their taps in tongues, crucibles, the ingots stacked to trade.
 * And the gathering for the whole crossing: a few clans (the crawlers few, more open ash), many, or
 * the muster (every clan here: the muster ground always in, crawlers packed, banners everywhere).
 * Open trodden ash between the grounds, a lone crawler's ruts across it: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { eased, inField } from '../layout';
import type { Placed } from '../terrain';
import { metaOf, colsAt } from '../meta';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Gathering = 'few' | 'many' | 'muster';
type Ground = 'laager' | 'sort' | 'row' | 'muster' | 'forge';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  gate: [30, 38],
  breather: [12, 18],
  laager: [66, 80],
  sort: [56, 72],
  row: [52, 66],
  muster: [58, 74],
  forge: [50, 62],
  out: [30, 38],
};

/** The ash's level. */
const PLAIN = 0.4;
/** Half the way kept open (over three ship widths across). */
const LANE = 8;
/** A crawler's tracks, either side of its middle, and how wide each tread is (half). */
const GAUGE = 4.2;
const TREAD = 0.95;
/** A crawler, as built (set_ashgrave_camp.py): its length either way of its middle. */
const BOW = 14;
const STERN = 16.4;
/** A claim (8 across) and the aisles between them. */
const CLAIM = 8;
const PITCH = 9.4;

interface Crawler {
  x: number;
  z: number;
  /** Which way its bow points (radians, world: atan2(dz, dx)). */
  head: number;
  variant: number;
  job: string;
}

interface Laager {
  x: number;
  z: number;
  r: number;
  /** The fire's place, off the way. */
  fx: number;
  fz: number;
  /** Which side of the way the commons is. */
  side: -1 | 1;
}

interface Pit {
  x: number;
  z: number;
  r: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Camp extends Bones {
  gathering: Gathering;
  lane(z: number): number;
  plain(x: number, z: number): number;
  crawlers: Crawler[];
  laagers: Laager[];
  pits: Pit[];
  /** The head's berth, if the muster's in. */
  berth: { x: number; z: number } | null;
  /** The berm's line and its gate. */
  berm: { z: number; x: number };
  main: Route;
  /** Crawler tracks (each its middle line, near to far). */
  tracks: { x: number; z: number }[][];
  wind: [number, number];
}

const dirOf = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];
/** The turn that lays a thing built along +x along heading a. */
const along = (a: number) => -a;
/** The turn that faces a thing built facing the camera (-y in Blender, +z here) toward heading a. */
const facing = (a: number) => Math.PI / 2 - a;

/** Where (u along its bow, w across to its left) on a crawler is in the world. */
function onCrawler(c: Crawler, u: number, w: number) {
  const [dx, dz] = dirOf(c.head);
  return { x: c.x + u * dx + w * dz, z: c.z + u * dz - w * dx };
}

/** Distance from (x, z) to the segment a-b, and how far along it (0..1). */
function seg(ax: number, az: number, bx: number, bz: number, x: number, z: number) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1e-6;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
  return { d: Math.hypot(x - (ax + vx * t), z - (az + vz * t)), t, len: Math.sqrt(l2) };
}

export const scavcamp: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 7243 + Math.round(-z0) * 13 + 5, 0x9e3779b1) ^ 0x2c1b3c6d);
    const s = seed % 997;
    const gathering = weighted(r, [['few', 3], ['many', 4], ['muster', 3]] as const) as Gathering;
    const wa = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.0;
    const wind: [number, number] = [Math.cos(wa), Math.sin(wa)];

    // the grounds: the laager always (the camp is its crawlers), the muster if every clan's here
    const rest = shuffle(r, ['sort', 'row', 'muster', 'forge'] as Ground[]);
    if (gathering === 'muster') rest.sort((a, b) => (a === 'muster' ? -1 : b === 'muster' ? 1 : 0));
    const pool: Ground[] = ['laager', ...rest];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.gate[0], first) - LEN.out[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.breather[0];
    const n = want(3) <= total ? 3 : want(2) <= total ? 2 : 1;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['gate', ...grounds.flatMap((g, i) => (i ? ['breather', g] : [g])), 'out'];
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
    // (whatever won't fit goes to the grounds themselves, never to the gate, the breathers or the way out)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k !== 'gate' && k !== 'breather' && k !== 'out' ? i : -1)).filter((i) => i >= 0);
      for (const i of soak) lens[i] += spare / soak.length;
    }
    const beats: Beat[] = [];
    let z = z0;
    seq.forEach((kind, i) => {
      const end = i === seq.length - 1 ? z1 : z - lens[i];
      beats.push({ kind, z0: z, z1: end, side: r() < 0.5 ? -1 : 1 });
      z = end;
    });
    const inside = (b: Beat, z: number, m: number) => smoothstep(0, m, Math.min(b.z0 - z, z - b.z1));

    // the way through, wandering over the open ash; each ground holds it to its own line
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 10;
    const wander = (z: number) => clamp(x0 + 9 * Math.sin(z * 0.015 + k1) + 3 * Math.sin(z * 0.043 + k2), -14, 14);
    const holds: { b: Beat; x: number }[] = [];

    const crawlers: Crawler[] = [];
    const laagers: Laager[] = [];
    const pits: Pit[] = [];
    let berth: Camp['berth'] = null;
    let berm = { z: 0, x: 0 };
    const tracks: { x: number; z: number }[][] = [];
    const cv = () => Math.floor(r() * 3);

    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      const sd = b.side;
      switch (b.kind) {
        case 'gate': {
          // the berm across the field, the gate in it on the way; the tracks of the clans that
          // came in converging on it from out on the ash
          const zb = b.z1 + Math.min(18, len * 0.35);
          const gx = clamp(wander(zb), -8, 8);
          holds.push({ b: { ...b, z1: b.z1 - 30 }, x: gx });
          berm = { z: zb, x: gx };
          for (let k = 0; k < (gathering === 'few' ? 1 : 2); k++) {
            const from = (k % 2 ? -1 : 1) * sd;
            const sx = from * range(r, HALF_W + 10, HALF_W + 30);
            const sz = zb + range(r, 40, 70);
            const pts: { x: number; z: number }[] = [];
            for (let t = 0; t <= 1.0001; t += 0.1) {
              // (curving in to run straight through the gate)
              const u = t * t;
              pts.push({ x: lerp(sx, gx, 1 - (1 - t) ** 2), z: lerp(sz, zb + 6, u * 0.4 + t * 0.6) });
            }
            tracks.push(pts);
            // a clan's crawler still coming in along it, out at the side
            if (k === 0 || gathering === 'muster') {
              const i = 2 + Math.floor(r() * 2);
              const a = pts[i];
              const q = pts[i + 1];
              if (Math.abs(a.x) > HALF_W - 4) crawlers.push({ x: a.x, z: a.z, head: Math.atan2(q.z - a.z, q.x - a.x), variant: cv(), job: 'coming' });
            }
          }
          break;
        }
        case 'laager': {
          // a ring of crawlers nose to tail; the way through it off its middle, so the commons is
          // to one side of the way
          const R = gathering === 'few' ? 26 : gathering === 'many' ? 29 : 31;
          const lx = clamp(wander(zc), -7, 7);
          holds.push({ b, x: lx });
          const cx = lx + sd * range(r, 11, 13);
          const L: Laager = { x: cx, z: zc, r: R, fx: cx + sd * 3, fz: zc + range(r, -3, 3), side: sd };
          laagers.push(L);
          // the gaps where the way crosses the ring, near and far
          const dx = lx - cx;
          const dz = Math.sqrt(Math.max(1, R * R - dx * dx));
          const gaps = [Math.atan2(dz, dx), Math.atan2(-dz, dx)];
          const half = Math.asin(Math.min(0.95, (LANE + 7) / R));
          // round the ring from one gap's edge to the other's, both ways, crawlers laid along it
          const arcs: [number, number][] = [
            [gaps[0] + half, gaps[1] + Math.PI * 2 - half],
            [gaps[1] + half, gaps[0] - half],
          ];
          for (const [a0, a1raw] of arcs) {
            let a1 = a1raw;
            while (a1 < a0) a1 += Math.PI * 2;
            const arc = (a1 - a0) * R;
            const body = BOW + STERN - 2;
            const m = Math.max(1, Math.floor(arc / body));
            const step = (a1 - a0) / m;
            for (let k = 0; k < m; k++) {
              const a = a0 + step * (k + 0.5) + range(r, -0.04, 0.04);
              // nose to tail round the ring (its middle a little inside the circle, it's straight)
              const px = cx + Math.cos(a) * R * 0.97;
              const pz = zc + Math.sin(a) * R * 0.97;
              const head = a + Math.PI / 2 + range(r, -0.08, 0.08);
              // (the bow is forward of its middle: shift it back so the hull's middle sits on the ring)
              const [hx, hz] = dirOf(head);
              crawlers.push({ x: px - hx * (BOW - STERN) * 0.5, z: pz - hz * (BOW - STERN) * 0.5, head, variant: cv(), job: 'laager' });
            }
          }
          break;
        }
        case 'sort': {
          // the main aisle dead straight down the claims
          const lx = clamp(wander(zc), -6, 6);
          holds.push({ b, x: lx });
          break;
        }
        case 'row': {
          const lx = clamp(wander(zc), -8, 8);
          holds.push({ b, x: lx });
          break;
        }
        case 'muster': {
          const lx = clamp(wander(zc), -6, 6);
          holds.push({ b, x: lx });
          berth = { x: lx - sd * range(r, 24, 27), z: zc + range(r, -len * 0.15, len * 0.1) };
          break;
        }
        case 'forge': {
          const lx = clamp(wander(zc), -7, 7);
          holds.push({ b, x: lx });
          pits.push({ x: lx + sd * range(r, 21, 24), z: zc + range(r, -6, 6), r: range(r, 13, 16) });
          break;
        }
        case 'breather': {
          // a lone crawler's ruts across the open ash, at a slant
          if (r() < 0.75) {
            const pts: { x: number; z: number }[] = [];
            const a = range(r, 0.35, 0.8) * (r() < 0.5 ? -1 : 1);
            const zm = zc + (r() - 0.5) * len * 0.3;
            for (let t = -1; t <= 1.0001; t += 0.1) pts.push({ x: t * (HALF_W + 20), z: zm - t * (HALF_W + 20) * Math.tan(a) });
            if (pts[0].z < pts[pts.length - 1].z) pts.reverse();
            tracks.push(pts);
          }
          break;
        }
        case 'out': {
          // the picket: two crawlers drawn up either side of the tracks out, bows to the waste
          const zp = b.z0 - Math.min(24, len * 0.5);
          const lx = clamp(wander(zp), -6, 6);
          holds.push({ b: { ...b, z0: b.z0 + 20 }, x: lx });
          for (const k of [-1, 1]) crawlers.push({ x: lx + k * (LANE + 9.5), z: zp + range(r, -3, 3), head: -Math.PI / 2 + k * range(r, 0.05, 0.18), variant: cv(), job: 'picket' });
          break;
        }
      }
    }

    const lane = (z: number) => {
      let x = wander(z);
      for (const h of holds) {
        const k = inside(h.b, z, 14);
        if (k > 0) x = lerp(x, h.x, k);
      }
      return x;
    };

    // the camp's main track: the clans' crawlers came in by it and leave by it. Through the gate,
    // through the laager's gaps, down the sort's aisle and the row; beside the way elsewhere
    const offs: { z: number; v: number }[] = [{ z: z0 + 10, v: 0 }];
    for (const b of beats) {
      const zc = (b.z0 + b.z1) / 2;
      const len = b.z0 - b.z1;
      const v = b.kind === 'muster' ? b.side * 14 : b.kind === 'forge' ? -b.side * 12 : b.kind === 'laager' ? -b.side * 3 : 0;
      offs.push({ z: b.z0 - Math.min(10, len * 0.2), v }, { z: zc, v }, { z: b.z1 + Math.min(10, len * 0.2), v });
    }
    const off = eased(offs);
    const pts: { x: number; z: number }[] = [];
    for (let zz = z0 + 2; zz >= z1 - 2; zz -= 2) pts.push({ x: clamp(lane(zz) + off(zz), -HALF_W - 4, HALF_W + 4), z: zz });
    const main: Route = { kind: 'track', pts };
    tracks.push(pts);

    /** The plain: nearly level ash, softly rolling, trodden flat in the camp. */
    const plain = (x: number, z: number) => PLAIN + (fbm(x * 0.03, z * 0.03, s) - 0.5) * 0.7;

    /** Tracks near z, as segments, for the ruts (bucketed by z). */
    const segs: { ax: number; az: number; bx: number; bz: number; s0: number }[] = [];
    for (const tr of tracks) {
      let sl = 0;
      for (let i = 0; i < tr.length - 1; i++) {
        const a = tr[i];
        const b = tr[i + 1];
        segs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, s0: sl });
        sl += Math.hypot(b.x - a.x, b.z - a.z);
      }
    }
    const bucket = new Map<number, typeof segs>();
    const segsAt = (z: number) => {
      const k = Math.floor(z / 8);
      let out = bucket.get(k);
      if (!out) {
        const lo = k * 8 - 8;
        const hi = k * 8 + 16;
        out = segs.filter((q) => Math.max(q.az, q.bz) > lo && Math.min(q.az, q.bz) < hi);
        bucket.set(k, out);
      }
      return out;
    };
    /** How deep in a rut (x, z) is (0..1), and whether on a cleat's mark. */
    const rut = (x: number, z: number): [number, boolean, number] => {
      let best = 0;
      let cleat = false;
      let crown = 0;
      for (const q of segsAt(z)) {
        const g = seg(q.ax, q.az, q.bx, q.bz, x, z);
        if (g.d > GAUGE + TREAD + 0.5) continue;
        const e = Math.abs(g.d - GAUGE);
        const k = 1 - smoothstep(TREAD * 0.7, TREAD + 0.3, e);
        if (k > best) {
          best = k;
          cleat = ((q.s0 + g.t * g.len) % 1.5) < 0.45;
        }
        if (g.d < GAUGE - TREAD) crown = Math.max(crown, 1 - g.d / (GAUGE - TREAD));
      }
      return [best, cleat, crown];
    };

    /** The forge's pit: dug down to the old glass, its sides stepped where they dug. */
    const pitAt = (x: number, z: number) => {
      let h = 0;
      for (const p of pits) {
        const d = Math.hypot(x - p.x, (z - p.z) * 0.8) / p.r;
        if (d < 1.15) h = Math.min(h, -1.5 * (1 - smoothstep(0.7, 1.1, d)));
      }
      return h;
    };

    /** The berm's bank under its hulks, broken at the gate. */
    const bank = (x: number, z: number) => {
      const dz = Math.abs(z - berm.z);
      if (dz > 6) return 0;
      const gap = smoothstep(LANE + 2, LANE + 6, Math.abs(x - berm.x));
      return 1.6 * Math.exp(-(dz * dz) / 8) * gap;
    };

    const height = (x: number, z: number) => {
      const [k] = rut(x, z);
      return plain(x, z) + pitAt(x, z) + bank(x, z) - k * 0.12;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      // the ruts dark and ribbed, the crown between them packed paler
      const [k] = rut(x, z);
      if (k > 0.15) return [0x4a4038, 0.32 * k];
      // the forge's pit: soot, the slag's black near the furnaces
      for (const p of pits) {
        const d = Math.hypot(x - p.x, (z - p.z) * 0.8) / p.r;
        if (d < 1.05) return [0x221c18, 0.55 * (1 - smoothstep(0.6, 1.05, d))];
      }
      // the berth: the ash blown out from under the head's thrusters in a scorched star
      if (berth) {
        const dx = x - berth.x;
        const dz = z - berth.z;
        const d = Math.hypot(dx, dz);
        if (d < 22) {
          const a = Math.atan2(dz, dx);
          const ray = Math.pow(Math.abs(Math.cos(a * 4 + 0.6)), 6) * 0.7 + 0.3;
          const k2 = (1 - smoothstep(10, 22, d)) * ray;
          if (k2 > 0.08) return [0x2a2420, 0.6 * k2];
        }
      }
      // a laager's commons, trodden pale round its fire, the hearth dark
      for (const L of laagers) {
        const d = Math.hypot(x - L.fx, z - L.fz);
        if (d < 4) return [0x1e1a18, 0.5 * (1 - d / 4)];
        const dc = Math.hypot(x - L.x, z - L.z);
        if (dc < L.r * 0.8) return [0xb8a488, 0.22 * (1 - smoothstep(L.r * 0.4, L.r * 0.8, dc))];
      }
      return null;
    };

    const bones: Camp = { height, stain, routes: [main], lines: [], beats, gathering, lane, plain, crawlers, laagers, pits, berth, berm, main, tracks, wind };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Camp);
  },
};

/** What gathers in a crawler's lee: drums, crates, a plate stack, its cables. */
const CLUTTER = [['ashgrave_clutter', 5], ['ashgrave_plate_stack', 1], ['ashgrave_cable_spill', 1]] as const;

function plan(kit: Kit, b: Camp) {
  const r = kit.r;
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;

  /** A crawler drawn up where the bones put it: solid at its cab tower, its hull's room claimed along it. */
  const crawl = (c: Crawler) => {
    if (c.z > kit.z0 || c.z <= kit.z1) return null;
    const m = metaOf('ashgrave_crawler', c.variant);
    if (!m) return null;
    // (one drawn up where there's room: never into another's hull)
    const spots: { x: number; z: number }[] = [];
    for (let u = -STERN + 3; u <= BOW - 2; u += 5) spots.push(onCrawler(c, u, 0));
    if (c.job !== 'laager' && c.job !== 'picket' && !spots.every((q) => kit.free(q.x, q.z, 6))) return null;
    const y = b.plain(c.x, c.z) - 0.15;
    const rot = along(c.head);
    const p: Placed = { kind: 'ashgrave_crawler', variant: c.variant, x: c.x, z: c.z, y, rot, s: 1, obstacle: true, cols: colsAt(m, c.x, c.z, y, rot, 1), biome: kit.biome };
    kit.props.push(p);
    for (const q of spots) kit.claim(q.x, q.z, 6.2);
    // its engine ticking over: smoke off a stack, now and then
    if (r() < 0.45) {
      const q = onCrawler(c, 3.8, r() < 0.5 ? 2.9 : -2.9);
      kit.emit('smoke', q.x, q.z);
    }
    return p;
  };

  /** A gun on a crawler's aft deck, looking out. */
  const deckGun = (c: Crawler, guards: string) => {
    const q = onCrawler(c, -7, 0);
    if (!inField(q.x, 3) || !clear(q.x, q.z, LANE - 2)) return;
    kit.post(q.x, q.z, 0, guards);
    kit.posts[kit.posts.length - 1].y = b.plain(q.x, q.z) + 4.0;
  };

  /** A Chikta sail-barge drawn up off the glass onto the ash (put by hand: it's a glass-borne thing). */
  const barge = (x: number, z: number, sc: number, rot: number) => {
    if (z > kit.z0 || z <= kit.z1 || !kit.free(x, z, 3)) return null;
    const p: Placed = { kind: 'ashgrave_sail_barge', variant: r() < 0.6 ? 0 : 1, x, z, y: b.plain(x, z) - 0.25, rot, s: sc, obstacle: false, cols: [], biome: kit.biome };
    kit.props.push(p);
    kit.claim(x, z, 3.2);
    return p;
  };

  /**
   * A family's camp off the way: their fire, tents round it doors in, a washing line, the clutter
   * by the tents. What frames the camp's grounds at their sides.
   */
  const hamlet = (x: number, z: number, n = 3 + Math.floor(r() * 3)) => {
    if (!kit.free(x, z, 4) || !clear(x, z, LANE + 6)) return false;
    fire(x, z);
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + range(r, -0.2, 0.2);
      const d = range(r, 5.2, 6.4);
      const tx = x + Math.cos(a) * d;
      const tz = z + Math.sin(a) * d;
      if (clear(tx, tz, LANE + 2)) kit.put('ashgrave_tent', tx, tz, { rot: along(a + Math.PI), variant: Math.floor(r() * 3), s: range(r, 0.9, 1.05) });
    }
    const a = a0 + Math.PI / n;
    if (r() < 0.6) kit.put('ashgrave_laundry', x + Math.cos(a) * 9, z + Math.sin(a) * 9, { rot: along(a + Math.PI / 2), s: 1 });
    kit.group(x + Math.cos(a + 1) * 8.5, z + Math.sin(a + 1) * 8.5, { kinds: CLUTTER, n: 2, spread: 2, big: 1, small: 0.7, keep: (xx, zz) => clear(xx, zz, LANE + 2) });
    return true;
  };

  /** The sides of a ground filled with families' camps and a parked crawler now and then, where its own things left room. */
  const frame = (bt: Beat, from: number, every: number) => {
    const few = b.gathering === 'few';
    for (let z = bt.z0 - 8; z > bt.z1 + 8; z -= every * range(r, 0.85, 1.15)) {
      for (const k of [-1, 1]) {
        if (few && r() < 0.5) continue;
        const x = b.lane(z) + k * range(r, from, from + 8);
        if (!inField(x, -6)) continue;
        if (r() < (b.gathering === 'muster' ? 0.4 : 0.25) && kit.free(x + k * 6, z, 9)) {
          const c: Crawler = { x: x + k * 6, z, head: (r() < 0.5 ? -1 : 1) * Math.PI / 2 + range(r, -0.25, 0.25), variant: Math.floor(r() * 3), job: 'parked' };
          if (crawl(c)) {
            kit.group(x - k * 2, z + range(r, -6, 6), { kinds: CLUTTER, n: 3, spread: 2.5, big: 1.05, small: 0.65, keep: (xx, zz) => clear(xx, zz, LANE + 2) });
            continue;
          }
        }
        hamlet(x, z);
      }
    }
  };

  /** A clan's cookfire and its smoke. */
  const fire = (x: number, z: number) => {
    if (kit.put('ashgrave_hearth', x, z, { s: range(r, 0.95, 1.1) })) kit.emit('smoke', x, z);
  };

  // the crawlers first: the big forms
  for (const c of b.crawlers) crawl(c);

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    const zc = (bt.z0 + bt.z1) / 2;
    const sd = bt.side;
    switch (bt.kind) {
      case 'gate': {
        // the berm across the field, hulks heaped in ash; the gate towers either side of the way
        const { z, x: gx } = b.berm;
        for (const k of [-1, 1]) {
          const tx = gx + k * (LANE + 3.5);
          const t = kit.solid('ashgrave_gate_tower', tx, z, 1, 0);
          if (t) t.variant = r() < 0.5 ? 0 : 1;
          kit.post(gx + k * (LANE + 9), z + 2.5, 0, 'gate');
          kit.posts[kit.posts.length - 1].y = b.plain(gx + k * (LANE + 9), z) + 2.6;
          for (let x = tx + k * 10; Math.abs(x) < HALF_W + 14; x += k * range(r, 13.5, 15)) kit.put('ashgrave_berm', x, z + range(r, -1, 1), { s: range(r, 0.95, 1.1), rot: range(r, -0.08, 0.08), overlap: true });
        }
        // the open ash before it: the clans' tracks coming in, a wreck the blades dragged and left
        for (let k = 0; k < 3; k++) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 14, HALF_W);
          const z2 = range(r, z + 14, bt.z0 - 6);
          if (clear(x, z2)) kit.group(x, z2, { kinds: [['scrap_pile', 3], ['ashgrave_shed_plate', 2], ['ashgrave_clutter', 1]], n: 2 + Math.floor(r() * 2), spread: 3, big: 1.1, small: 0.6, keep: (xx, zz) => clear(xx, zz) });
        }
        // just inside, the first tents and a fire, either side
        for (const k of [-1, 1]) {
          const x = gx + k * range(r, 16, 22);
          const z2 = z - range(r, 8, 12);
          if (z2 > bt.z1) {
            kit.put('ashgrave_tent', x, z2, { rot: along(Math.atan2(0, -k)), variant: Math.floor(r() * 3) });
            fire(x - k * 4.5, z2 - 2);
          }
        }
        kit.emit('dust', gx + (r() < 0.5 ? -1 : 1) * 22, z, 6, b.wind[0] > 0 ? 1 : -1);
        break;
      }
      case 'laager': {
        const L = b.laagers.find((l) => l.z <= bt.z0 && l.z > bt.z1);
        if (!L) break;
        const mine = b.crawlers.filter((c) => c.job === 'laager' && Math.hypot(c.x - L.x, c.z - L.z) < L.r + 8);
        // the long fire, along the commons, and its smoke
        const fa = Math.atan2(L.fz - L.z, L.fx - L.x) + Math.PI / 2;
        if (kit.put('ashgrave_longfire', L.fx, L.fz, { s: 1, rot: along(fa), variant: r() < 0.5 ? 0 : 1 })) {
          kit.emit('smoke', L.fx - 1.5, L.fz);
          kit.emit('smoke', L.fx + 1.5, L.fz);
        }
        // the clan's tents in a ring round it, doors to the fire, the way's side left open
        const ring = range(r, 9.5, 11);
        const nT = b.gathering === 'few' ? 6 : 8;
        const a0 = r() * Math.PI * 2;
        for (let k = 0; k < nT; k++) {
          const a = a0 + (k / nT) * Math.PI * 2 + range(r, -0.12, 0.12);
          const x = L.fx + Math.cos(a) * ring;
          const z = L.fz + Math.sin(a) * ring;
          if (!clear(x, z, LANE + 2)) continue;
          // (its door, at +x, toward the fire)
          kit.put('ashgrave_tent', x, z, { rot: along(a + Math.PI), variant: Math.floor(r() * 3), s: range(r, 0.95, 1.1) });
        }
        // laundry strung between the tents and the crawlers, now and then
        for (let k = 0; k < 3; k++) {
          const a = r() * Math.PI * 2;
          const x = L.fx + Math.cos(a) * (ring + 5);
          const z = L.fz + Math.sin(a) * (ring + 5);
          if (clear(x, z, LANE + 1)) kit.put('ashgrave_laundry', x, z, { rot: along(a + Math.PI / 2), s: 1 });
        }
        // each crawler's clutter in its lee (inside the ring), a gun on every other deck
        mine.forEach((c, k) => {
          for (const u of [-9, 2]) {
            const q = onCrawler(c, u, 0);
            // (toward the ring's middle)
            const ix = L.x - q.x;
            const iz = L.z - q.z;
            const il = Math.hypot(ix, iz) || 1;
            const x = q.x + (ix / il) * 9;
            const z = q.z + (iz / il) * 9;
            if (clear(x, z, LANE + 1)) kit.group(x, z, { kinds: CLUTTER, n: 2 + Math.floor(r() * 2), spread: 2.6, big: 1.05, small: 0.65, keep: (xx, zz) => clear(xx, zz, LANE + 1) });
          }
          if (k % 2 === 0) deckGun(c, 'laager');
          // a workshop's crew at it on the deck
          if (c.variant === 1 && r() < 0.7) {
            const q = onCrawler(c, 1.5, 2.2);
            const n = kit.fx.length;
            kit.emit('cut', q.x, q.z);
            if (kit.fx.length > n) kit.fx[n].y = b.plain(q.x, q.z) + 4.6;
          }
          // a galley's stovepipes smoking
          if (c.variant === 2) {
            const q = onCrawler(c, 1, 0);
            kit.emit('smoke', q.x, q.z);
          }
        });
        // outside the ring, a few things left where the ash is open
        for (let k = 0; k < 2; k++) {
          const x = L.x - L.side * range(r, L.r + 6, L.r + 14);
          const z = range(r, bt.z1 + 6, bt.z0 - 6);
          if (clear(x, z)) kit.group(x, z, { kinds: [['scrap_pile', 2], ['ashgrave_clutter', 2], ['ashgrave_shed_plate', 1]], n: 3, spread: 3, big: 1.1, small: 0.6, keep: (xx, zz) => clear(xx, zz) });
        }
        break;
      }
      case 'sort': {
        const lx = b.lane(zc);
        // the unsorted heaps at its near end, waiting
        const zh = bt.z0 - 8;
        for (const k of [-1, 1]) {
          const x = lx + k * range(r, 15, 24);
          kit.group(x, zh, { kinds: [['scrap_pile', 3], ['ashgrave_cable_spill', 1], ['ashgrave_shed_plate', 2]], n: 4 + Math.floor(r() * 3), spread: 5, big: 1.4, small: 0.6, keep: (xx, zz) => clear(xx, zz) });
        }
        // the claims in a grid either side of the aisle, a cross aisle every third row
        const cols = [0, 1, 2, 3].map((i) => LANE + 1.5 + CLAIM / 2 + i * PITCH);
        const zTop = bt.z0 - 18;
        const rows: number[] = [];
        for (let zz = zTop, k = 0; zz > bt.z1 + 8; zz -= PITCH + (k % 3 === 2 ? 3.5 : 0), k++) rows.push(zz);
        // (one clan's run of claims is one kind: the kinds change every few claims down a column)
        for (const k of [-1, 1]) {
          cols.forEach((u, ci) => {
            let kind = Math.floor(r() * 6);
            rows.forEach((zz, ri) => {
              const x = lx + k * u;
              if (!inField(x, -CLAIM / 2) || r() < (ci === 3 ? 0.4 : 0.12)) return;
              if (r() < 0.35) kind = Math.floor(r() * 6);
              const p = kit.put('ashgrave_claim', x, zz, { s: 1, rot: k < 0 ? Math.PI : 0, variant: kind, pad: -0.6 });
              // a gun dug in on the claims' corners at the aisle, now and then
              if (p && ci === 0 && ri % 3 === 1) {
                kit.post(lx + k * (LANE + 1.5), zz + CLAIM / 2 + 0.6, 0, 'sort');
              }
            });
          });
        }
        // the tally crane over the aisle, at its middle
        const zt = rows[Math.floor(rows.length / 2)] + PITCH / 2 + 1.7 || zc;
        kit.set('ashgrave_scrap_gantry', 'span', 0, zt, (r() - 0.5) * 0.04, 1);
        break;
      }
      case 'row': {
        const lx = b.lane(zc);
        // the barges: bows to the way, side by side in a file, a second file behind on a long row
        const bx = (u: number) => lx + sd * u;
        let k = 0;
        for (let z = bt.z0 - 8; z > bt.z1 + 6; z -= range(r, 5.2, 6.4), k++) {
          barge(bx(LANE + 7.5) + range(r, -0.6, 0.6), z, 1.15, sd * (Math.PI / 2) + range(r, -0.12, 0.12));
          if (r() < 0.55) barge(bx(LANE + 18) + range(r, -1, 1), z + range(r, -1.5, 1.5), 1.1, sd * (Math.PI / 2) + range(r, -0.25, 0.25));
          if (k % 2 === 1) kit.put('ashgrave_lantern_pole', bx(LANE + 2), z + 2.6, { s: 1, overlap: true });
        }
        // the stalls facing them across the way, their fires behind
        k = 0;
        for (let z = bt.z0 - 7; z > bt.z1 + 6; z -= range(r, 6.2, 7.2), k++) {
          const x = lx - sd * (LANE + 3.5);
          kit.put('ashgrave_stall', x, z, { s: 1, rot: facing(sd > 0 ? 0 : Math.PI), variant: Math.floor(r() * 3), overlap: true });
          if (k % 2 === 0) fire(x - sd * 6, z + range(r, -1, 1));
          if (k % 3 === 1) kit.put('ashgrave_tent', x - sd * 11, z, { rot: along(sd > 0 ? 0 : Math.PI), variant: Math.floor(r() * 3) });
        }
        // the market's two ends: a gun either side of the way
        for (const z of [bt.z0 - 3, bt.z1 + 3]) {
          kit.post(lx - sd * (LANE + 2), z, 0, 'row');
        }
        break;
      }
      case 'muster': {
        const lx = b.lane(zc);
        // the berth: the head's cradle, empty, on the far side from the rigs
        if (b.berth) {
          kit.set('ashgrave_berth', 'giant', b.berth.x, b.berth.z, 0, 0);
          for (const k of [-1, 1]) kit.post(b.berth.x + sd * 15, b.berth.z + k * 9, 0, 'berth');
        }
        // the banners in ranks across the field, either side of the way, the gap kept for it
        const ranks = b.gathering === 'muster' ? 2 : 1;
        for (let k = 0; k < ranks; k++) {
          const z = bt.z0 - 12 - k * 7;
          for (let x = lx + LANE + 2; x < HALF_W + 6; x += 5.2) kit.put('ashgrave_banner', x, z, { s: 1, rot: 0, variant: Math.floor(r() * 4), overlap: true });
          for (let x = lx - LANE - 2; x > -HALF_W - 6; x -= 5.2) if (!b.berth || Math.hypot(x - b.berth.x, z - b.berth.z) > 17) kit.put('ashgrave_banner', x, z, { s: 1, rot: 0, variant: Math.floor(r() * 4), overlap: true });
        }
        // and the far ranks, on the way out of the ground
        for (let x = lx + LANE + 2; x < HALF_W + 6; x += 5.2) kit.put('ashgrave_banner', x, bt.z1 + 8, { s: 1, rot: 0, variant: Math.floor(r() * 4), overlap: true });
        for (let x = lx - LANE - 2; x > -HALF_W - 6; x -= 5.2) kit.put('ashgrave_banner', x, bt.z1 + 8, { s: 1, rot: 0, variant: Math.floor(r() * 4), overlap: true });
        // the rigs on their pads in rows, on the side away from the berth
        const z0r = bt.z0 - 12 - ranks * 7 - 8;
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 2; j++) {
            const x = lx + sd * (LANE + 7 + j * 10);
            const z = z0r - i * 10;
            if (z <= bt.z1 + 14) continue;
            kit.put('ashgrave_rig', x, z, { s: 1, rot: 0, variant: (i + j) % 2, overlap: true });
            if (i === 1 && j === 1) kit.post(x + sd * 6, z, 0, 'muster');
          }
        break;
      }
      case 'forge': {
        const P = b.pits.find((p) => p.z <= bt.z0 + 10 && p.z > bt.z1 - 10);
        if (!P) break;
        // the furnaces in the pit, their mouths toward you, the slag run out of their taps
        const nF = b.gathering === 'few' ? 1 : 2;
        for (let k = 0; k < nF; k++) {
          const x = P.x + (k - (nF - 1) / 2) * 13 * (r() < 0.5 ? 1 : 0.8);
          const z = P.z - 2 + (k % 2) * range(r, -4, 4);
          if (!clear(x, z, LANE + 5)) continue;
          const f = kit.solid('ashgrave_furnace', x, z, 1, 0);
          if (!f) continue;
          f.variant = r() < 0.5 ? 0 : 1;
          // (the cols as built for that variant)
          const m = metaOf('ashgrave_furnace', f.variant);
          if (m) f.cols = colsAt(m, x, z, f.y, 0, 1);
          kit.emit('smoke', x, z - 1);
          kit.emit('smoke', x + 0.8, z - 0.4);
          kit.post(x - sd * 5, z + 2, 0, 'forge');
          // the slag tongues fanning toward you from the tap
          for (let j = 0; j < 3; j++) {
            const a = Math.PI / 2 + (j - 1) * 0.55 + range(r, -0.15, 0.15);
            const d = range(r, 6, 8);
            const sx = x + Math.cos(a) * d;
            const sz = z + 3 + Math.sin(a) * d;
            if (clear(sx, sz, LANE + 1)) kit.put('ashgrave_slag', sx, sz, { s: range(r, 0.9, 1.15), rot: -Math.PI / 2 - a, variant: j % 3, overlap: true });
          }
          // a crucible beside it
          kit.put('ashgrave_crucible', x + (r() < 0.5 ? -1 : 1) * 6, z + 1, { s: 1, rot: 0, variant: k % 2 });
        }
        // the ingots stacked to trade, in rows on the pit's lip by the track
        const iy = P.z + P.r * 0.6;
        for (let i = 0; i < 4; i++)
          for (let j = 0; j < 2; j++) {
            const x = P.x - sd * (P.r * 0.4) + (i - 1.5) * 3.2;
            const z = iy - j * 3.2 - P.r * 1.2;
            if (clear(x, z, LANE + 1)) kit.put('ashgrave_ingots', x, z, { s: 1, rot: 0, variant: (i + j) % 2 });
          }
        // fuel heaped on the far side, the breakers' plates waiting to go in
        for (let k = 0; k < 2; k++) {
          const x = P.x + sd * range(r, 8, 12);
          const z = P.z + range(r, -P.r * 0.6, P.r * 0.6);
          if (clear(x, z)) kit.group(x, z, { kinds: [['ashgrave_plate_stack', 2], ['scrap_pile', 2], ['ashgrave_clutter', 1]], n: 3, spread: 3, big: 1.1, small: 0.6 });
        }
        // the other side of the way: the forge's crews' tents and a fire
        for (let k = 0; k < 2; k++) {
          const x = b.lane(zc) - sd * range(r, 16, 24);
          const z = range(r, bt.z1 + 8, bt.z0 - 8);
          kit.put('ashgrave_tent', x, z, { rot: along(sd > 0 ? 0 : Math.PI), variant: Math.floor(r() * 3) });
          fire(x + sd * 4.5, z);
        }
        break;
      }
      case 'breather': {
        kit.emit('devil', (r() - 0.5) * 40, zc);
        // a crawler drawn up alone out at the edge now and then, its fire
        if (r() < 0.5) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, HALF_W - 2, HALF_W + 6);
          const z = zc + (r() - 0.5) * len * 0.4;
          const c: Crawler = { x, z, head: (r() < 0.5 ? -1 : 1) * Math.PI / 2 + range(r, -0.4, 0.4), variant: Math.floor(r() * 3), job: 'lone' };
          if (crawl(c)) fire(x - Math.sign(x) * 10, z + range(r, -3, 3));
        }
        break;
      }
      case 'out': {
        // the picket's crawlers (laid down with the rest), a gun on each, their fires
        for (const c of b.crawlers.filter((q) => q.job === 'picket' && q.z <= bt.z0 && q.z > bt.z1)) {
          deckGun(c, 'picket');
          fire(c.x + Math.sign(c.x - b.lane(c.z)) * 10, c.z + range(r, -2, 4));
        }
        break;
      }
    }
    // what the ground's own things left room for at its sides: families' camps, a parked crawler
    if (bt.kind === 'row' || bt.kind === 'muster' || bt.kind === 'forge' || bt.kind === 'laager') frame(bt, 20, 15);
  }
}
