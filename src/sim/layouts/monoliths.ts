/**
 * The Monolith Field: the Tonkva's ledger-beacons on Kessra's red erg (docs/level-design.md, its
 * layout row). The Tonkva were the level people: they laid their beacons out the way they kept
 * their books, exactly, in avenues and rings and a lattice, with the count between them in stones
 * (in primes, the song the beacons sing). Then they died, and for twelve hundred years the dunes
 * have marched over the field. So everything here is one of two hands: the Tonkva's straight lines,
 * and the wind's curves over them. A beacon stands whole in a trough, sunk to its ruff on a dune's
 * flank, or lies where it fell; the reading floors show where the wind has scoured them. The faces
 * look where they were set to look, and their eyes have opened again.
 *
 * A level is a crossing of the field, in over the open erg between the two threshold beacons that
 * watch you come, and out past the last row of faces looking north, through three grounds (two,
 * if the stretch is short), each with bones of its own, so no two crossings fly alike:
 * - the avenue: the reading way, dead straight at a slant to the wind, two ranks of beacons facing
 *   across it, the count between each two (two stones, three, five, seven), its paving under the sand;
 * - the ring: a reading ring of seven or eleven faces looking in at a hearth on a stepped dais, the
 *   count in a ring round it; the way through over the hearth, where two of the ring have sunk;
 * - the drowned rows: the field's lattice, beacons in exact hexes, with the dunes marched over them:
 *   whole in the troughs, sunk on the flanks, plume tips on the crests; a worm's furrow down a trough;
 * - the terraces: a rise cut into steps, the ledger written along each tread, the count on the
 *   risers, a stair up the middle and two faces at its head looking down it;
 * - the fall: a quake's fault across the field, the beacons either side of it thrown down away from
 *   it, broken where their bands were; a few still standing, leaning.
 * And the sand for the whole crossing: scoured (a storm's stripped it, the floors bare, the dunes
 * low), drifted, or buried (the dunes high, most of the faces sunk to the ruff). Open erg between the
 * grounds, a dust devil wandering on it: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { routeX } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep, weighted } from '../../util';

type Drift = 'scoured' | 'drifted' | 'buried';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  erg: [34, 40],
  breather: [16, 24],
  avenue: [76, 130],
  ring: [58, 72],
  rows: [62, 120],
  terraces: [56, 76],
  fall: [56, 110],
  out: [28, 34],
};

/** The erg's floor, and the reading floors' (the paving the sand lies on). */
const SAND = 0.5;
const PAVE = 0.45;
/** How high the dunes stand, by the year's sand. */
const DUNE: Record<Drift, number> = { scoured: 0.8, drifted: 1.9, buried: 2.7 };
/** How much of a floor the sand covers, by the year. */
const COVER: Record<Drift, number> = { scoured: 0.08, drifted: 0.4, buried: 0.8 };
/** Half the way kept open (over three ship widths across). */
const LANE = 8.5;
/** A terrace's step up. */
const STEP = 0.5;

/** The count, in stones: the primes, over and over. */
const PRIMES = [2, 3, 5, 7];

/** The avenue: its axis through (x, z) turned `ang` off straight ahead, `half` its width out to a rank. */
interface Avenue {
  x: number;
  z: number;
  ang: number;
  len: number;
  half: number;
  step: number;
}
interface Ring {
  x: number;
  z: number;
  r: number;
  n: number;
  a0: number;
}
/** The lattice: its hexes' spacing, turned `ang`, offset; where it runs. */
interface Lattice {
  z0: number;
  z1: number;
  step: number;
  ang: number;
  ox: number;
  oz: number;
}
interface Terraces {
  z0: number;
  /** How many steps, how deep a tread, how much the edges lean (dz per dx). */
  n: number;
  tread: number;
  lean: number;
  /** The stair's middle. */
  x: number;
  /** The top's depth, past the last riser. */
  top: number;
}
interface Fault {
  pts: { x: number; z: number }[];
  z0: number;
  z1: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Field extends Bones {
  drift: Drift;
  /** The way through: x at z. */
  lane(z: number): number;
  /** The dune at (x, z): 0 in a trough … 1 on a crest. */
  dune(x: number, z: number): number;
  /** The wind's heading (x, z), the way the sand goes. */
  wind: [number, number];
  avenues: Avenue[];
  rings: Ring[];
  lattices: Lattice[];
  terraces: Terraces[];
  faults: Fault[];
  furrows: Route[];
  /** A lattice's sites between its ends. */
  sites(l: Lattice): { x: number; z: number }[];
}

/** (u along, v across) of the avenue to (x, z). */
const fromAvenue = (a: Avenue, u: number, v: number) => {
  const sa = Math.sin(a.ang);
  const ca = Math.cos(a.ang);
  return { x: a.x + u * sa + v * ca, z: a.z - u * ca + v * sa };
};
const toAvenue = (a: Avenue, x: number, z: number) => {
  const sa = Math.sin(a.ang);
  const ca = Math.cos(a.ang);
  return { u: (x - a.x) * sa - (z - a.z) * ca, v: (x - a.x) * ca + (z - a.z) * sa };
};
/** The turn that faces a model (built looking at the camera, +z) along (dx, dz). */
const facing = (dx: number, dz: number) => Math.atan2(dx, dz);

export const monoliths: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 7919 + Math.round(-z0) * 13 + 5, 0x9e3779b1) ^ 0x2545f491);
    const s = seed % 997;

    // the year's sand, and the wind that brought it: mostly across the field, so the dunes' crests
    // run slantwise down it
    const drift = weighted(r, [['scoured', 3], ['drifted', 4], ['buried', 3]] as const) as Drift;
    const wa = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.6;
    const wind: [number, number] = [Math.cos(wa), Math.sin(wa)];
    const lam = range(r, 15, 21);
    const A = DUNE[drift];

    // the grounds: one with a shape all its own (the avenue or the ring) and two more of any kind
    const signature = r() < 0.55 ? 'avenue' : 'ring';
    const rest = shuffle(r, ['avenue', 'ring', 'rows', 'rows', 'rows', 'terraces', 'terraces', 'fall', 'fall'].filter((g) => g !== signature));
    const pool = [signature, ...rest.filter((g, i) => rest.indexOf(g) === i)];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.erg[0], first) - LEN.out[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.breather[0];
    const n = want(3) <= total ? 3 : 2;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['erg', ...grounds.flatMap((g, i) => (i ? ['breather', g] : [g])), 'out'];
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
    // (whatever won't fit goes to the grounds that grow with their length: a longer avenue, more of
    // the lattice, a longer fault; never to the breathers, which stay short)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'avenue' || k === 'rows' || k === 'fall' ? i : -1)).filter((i) => i >= 0);
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

    // the way through, wandering gently over the open erg; each ground pulls it to its own line
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 10;
    const wander = (z: number) => clamp(x0 + 9 * Math.sin(z * 0.017 + k1) + 3.5 * Math.sin(z * 0.043 + k2), -15, 15);

    // each ground's own bones
    const avenues: Avenue[] = [];
    const rings: Ring[] = [];
    const lattices: Lattice[] = [];
    const terraces: Terraces[] = [];
    const faults: Fault[] = [];
    const furrows: Route[] = [];
    /** Each ground's own line for the way, where it has one. */
    const holds: { b: Beat; x: (z: number) => number }[] = [];
    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'avenue': {
          // dead straight, at a slant (never with the wind: the Tonkva set it to a bearing)
          const L = len - 10;
          // (a long one leans less: its ends stay in the field)
          const ang = (r() < 0.5 ? -1 : 1) * Math.min(range(r, 0.06, 0.24), Math.atan(11 / (L / 2)));
          const ax = clamp(wander(zc), -6, 6);
          const av: Avenue = { x: ax, z: zc, ang, len: L, half: range(r, 11.5, 13), step: range(r, 15, 18) };
          avenues.push(av);
          holds.push({ b, x: (z) => ax - (z - zc) * Math.tan(ang) });
          break;
        }
        case 'ring': {
          const n = r() < 0.6 ? 7 : 11;
          const rr = n === 7 ? range(r, 15, 17) : range(r, 17, 18.5);
          const rx = clamp(wander(zc), -8, 8);
          rings.push({ x: rx, z: zc, r: rr, n, a0: r() * Math.PI * 2 });
          holds.push({ b, x: () => rx });
          break;
        }
        case 'rows': {
          lattices.push({ z0: b.z0 - 4, z1: b.z1 + 4, step: range(r, 15.5, 17.5), ang: (r() - 0.5) * 0.6, ox: r() * 20, oz: r() * 20 });
          // a worm's been down a trough: its furrow, wandering along the dunes' grain
          const along: [number, number] = [-wind[1], wind[0]];
          const sx = b.side * range(r, 8, 22);
          const pts: { x: number; z: number }[] = [];
          const ph = r() * 10;
          for (let zz = b.z0 + 2; zz >= b.z1 - 2; zz -= 2) {
            const t = (b.z0 - zz) / len;
            pts.push({ x: sx + along[0] * (t - 0.5) * 18 + 4 * Math.sin(zz * 0.09 + ph), z: zz });
          }
          furrows.push({ kind: 'crack', pts });
          break;
        }
        case 'terraces': {
          const steps = 4 + Math.floor(r() * 2);
          const tread = range(r, 6.5, 8);
          const x = clamp(wander(zc), -8, 8);
          terraces.push({ z0: b.z0 - 8, n: steps, tread, lean: (r() - 0.5) * 0.16, x, top: range(r, 10, 14) });
          holds.push({ b, x: () => x });
          break;
        }
        case 'fall': {
          // the fault: across the field at a slant, kinked where the ground gave
          const pts: { x: number; z: number }[] = [];
          const lean = (r() < 0.5 ? -1 : 1) * range(r, 0.25, 0.6);
          const fx = (r() - 0.5) * 12;
          for (let zz = b.z0 - 4; zz >= b.z1 + 4; zz -= 2) {
            const t = zz - zc;
            pts.push({ x: fx - t * lean + (fbm(zz * 0.08, 7, s) - 0.5) * 6, z: zz });
          }
          faults.push({ pts, z0: b.z0 - 4, z1: b.z1 + 4 });
          break;
        }
        case 'breather': {
          // now and then a worm's furrow across the open erg
          if (r() < 0.5) {
            const pts: { x: number; z: number }[] = [];
            const sx = (r() - 0.5) * 30;
            const ph = r() * 10;
            const dir = r() < 0.5 ? -1 : 1;
            for (let zz = b.z0 + 2; zz >= b.z1 - 2; zz -= 2) pts.push({ x: sx + dir * (b.z0 - zz) * 0.7 + 3 * Math.sin(zz * 0.12 + ph), z: zz });
            furrows.push({ kind: 'crack', pts });
          }
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

    /** Where (x, z) is on its dune, 0 at the upwind trough … 1 at the next (the crest at 0.74), and the crest's height there. */
    const phase = (x: number, z: number): [number, number] => {
      const warp = (fbm(x * 0.02, z * 0.02, s + 1) - 0.5) * 1.6;
      const u = (x * wind[0] + z * wind[1]) / lam + warp;
      // (the crests rise and fall along their length, and break into crescents)
      const along = (-x * wind[1] + z * wind[0]) / lam;
      const crest = 0.35 + 0.65 * smoothstep(0.25, 0.7, fbm(along * 0.7, Math.floor(u) * 1.7, s + 2));
      return [u - Math.floor(u), crest];
    };
    /** The dune at (x, z): 0 in a trough, 1 on a crest, a steep slip face on the lee. */
    const dune = (x: number, z: number) => {
      const [f, crest] = phase(x, z);
      return (f < 0.74 ? smooth(f / 0.74) : 1 - smoothstep(0.74, 1, f)) * crest;
    };

    /** A reading floor under (x, z): its level and how much it's a floor (0..1), or null. */
    const floor = (x: number, z: number): [number, number] | null => {
      const b = beatAt(z);
      switch (b.kind) {
        case 'avenue': {
          const a = avenues[0] && avenues.find((q) => Math.abs(toAvenue(q, x, z).u) < q.len / 2 + 6);
          if (!a) return null;
          const { u, v } = toAvenue(a, x, z);
          const k = (1 - smoothstep(a.half + 1, a.half + 4, Math.abs(v))) * (1 - smoothstep(a.len / 2, a.len / 2 + 5, Math.abs(u)));
          return k > 0 ? [PAVE, k] : null;
        }
        case 'ring': {
          for (const g of rings) {
            const d = Math.hypot(x - g.x, z - g.z);
            const k = 1 - smoothstep(g.r + 2, g.r + 5, d);
            if (k > 0) return [PAVE, k];
          }
          return null;
        }
        case 'terraces': {
          for (const t of terraces) {
            const k = terraceAt(t, x, z);
            if (k) return k;
          }
          return null;
        }
      }
      return null;
    };

    /** The terraces at (x, z): the tread's level (steps up as you fly) and how much it's a floor. */
    const terraceAt = (t: Terraces, x: number, z: number): [number, number] | null => {
      const d = t.z0 - z + t.lean * x;
      const full = t.n * t.tread + t.top;
      if (d < -3 || d > full + 4) return null;
      const step = clamp(Math.floor(d / t.tread) + 1, 0, t.n);
      // (the risers' edges sharp, a little rounded by the wind)
      const into = d - (step - 1) * t.tread;
      const lip = step > 0 && step <= t.n ? smoothstep(0, 0.5, into) : 1;
      const lvl = PAVE + STEP * (step - 1 + lip) * (d < 0 ? 0 : 1);
      const k = smoothstep(-3, 0, d) * (1 - smoothstep(full, full + 4, d)) * (1 - smoothstep(HALF_W - 2, HALF_W + 6, Math.abs(x)));
      return [lvl, k];
    };

    /** How far (x, z) is from a worm's furrow or the fault (world units), and which. */
    const scar = (x: number, z: number): [number, 'furrow' | 'fault' | null] => {
      let best = Infinity;
      let what: 'furrow' | 'fault' | null = null;
      for (const f of furrows) {
        if (z > f.pts[0].z || z < f.pts[f.pts.length - 1].z) continue;
        const d = Math.abs(x - routeX(f, z));
        if (d < best) [best, what] = [d, 'furrow'];
      }
      for (const f of faults) {
        if (z > f.pts[0].z || z < f.pts[f.pts.length - 1].z) continue;
        const d = Math.abs(x - routeX({ kind: 'crack', pts: f.pts }, z));
        if (d < best) [best, what] = [d, 'fault'];
      }
      return [best, what];
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      // the rows are where the dunes stand highest, over the lattice
      const big = b.kind === 'rows' ? 1.25 : b.kind === 'breather' || b.kind === 'erg' ? 1.1 : 1;
      const sand = SAND + dune(x, z) * A * big;
      let h = sand;
      const fl = floor(x, z);
      if (fl) {
        // the floor, the sand lying over it (in patches, more in the troughs' lee)
        const lie = COVER[drift] * (0.4 + 0.9 * fbm(x * 0.06, z * 0.06, s + 3));
        const over = Math.max(fl[0], lerp(fl[0], sand, clamp(lie, 0, 1)));
        h = lerp(sand, over, fl[1]);
      }
      // the scars: a worm's furrow (a groove, its lips heaped), the fault (a slumped trench)
      const [d, what] = scar(x, z);
      if (what === 'furrow' && d < 3) h += -0.35 * (1 - smoothstep(0, 1.2, d)) + 0.18 * Math.exp(-((d - 1.8) ** 2) * 2.5);
      if (what === 'fault' && d < 4) h += -0.6 * (1 - smoothstep(0.3, 2.4, d)) + 0.25 * Math.exp(-((d - 3) ** 2) * 1.5);
      return h;
    };

    const wash = (x: number, z: number) => {
      const [d, what] = scar(x, z);
      if (what === 'fault') return (1 - smoothstep(0.4, 1.6, d)) * 0.9;
      if (what === 'furrow') return (1 - smoothstep(0.3, 1.1, d)) * 0.5;
      return 0;
    };

    /** The paving's pattern at (u, v) in its own frame: a joint (dark), a slab (one of two tones) or a carved line. */
    const slabs = (u: number, v: number, w: number, d: number, cut: boolean): [number, number] => {
      const iu = Math.floor(u / d);
      const iv = Math.floor(v / w + (iu & 1 ? 0.5 : 0));
      const fu = u / d - iu;
      const fv = v / w + (iu & 1 ? 0.5 : 0) - iv;
      if (fu < 0.06 || fv < 0.05) return [0x6e5a5e, 0.8];
      // (now and then a slab carved with a line of the count)
      if (cut && noise2(iu + 0.5, iv + 0.5, s + 4) > 0.72 && Math.abs(fu - 0.5) < 0.08 && fv > 0.2 && fv < 0.8) return [0x6e5a5e, 0.7];
      return [noise2(iu * 3.1 + 0.5, iv * 1.7 + 0.5, s + 5) > 0.5 ? 0xae9a98 : 0xa08c8c, 0.85];
    };

    const stain = (x: number, z: number): [number, number] | null => {
      const fl = floor(x, z);
      if (fl) {
        // the paving, where the sand's thin over it
        const over = height(x, z) - fl[0];
        const bare = (1 - smoothstep(0.08, 0.35, over)) * fl[1];
        if (bare > 0.02) {
          const b = beatAt(z);
          let pat: [number, number];
          if (b.kind === 'avenue' && avenues.length) {
            const a = avenues.find((q) => Math.abs(toAvenue(q, x, z).u) < q.len / 2 + 6) ?? avenues[0];
            const { u, v } = toAvenue(a, x, z);
            // (a kerb of long stones along each side, slabs between)
            pat = Math.abs(Math.abs(v) - a.half + 1.2) < 0.8 ? [0x8e7a7c, 0.85] : slabs(u, v + 100, 3.6, 3, true);
          } else if (b.kind === 'ring' && rings.length) {
            const g = rings[0];
            const d = Math.hypot(x - g.x, z - g.z);
            const a = Math.atan2(z - g.z, x - g.x);
            // (in rings round the hearth, each ring's slabs as many as its turn of the count)
            const ring = Math.floor(d / 2.6);
            const per = 6 * (ring + 1);
            pat = slabs(d, (a / (Math.PI * 2)) * per * 2.6 + 50, 2.6, 2.6, ring % 2 === 1);
          } else {
            const t = terraces[0];
            const dd = t.z0 - z + t.lean * x;
            // the treads written along their length: the count in tallies, a row to a tread, in
            // primes with a gap between each group; the stair plain
            const into = dd - Math.floor(dd / t.tread) * t.tread;
            const stair = Math.abs(x - t.x) < 4;
            const row = !stair && Math.abs(into - t.tread * 0.5) < 0.55;
            const tick = Math.floor(Math.abs(x - t.x) / 0.8);
            const grp = Math.floor(dd / t.tread) % PRIMES.length;
            const per = PRIMES[grp] + 1;
            const mark = row && (Math.abs(x - t.x) / 0.8) % 1 < 0.45 && tick % per !== per - 1;
            pat = mark ? [0x5e4a52, 0.85] : stair ? [0xbaa6a2, 0.85] : slabs(dd, x + 100, 4, 3, false);
          }
          return [pat[0], pat[1] * bare];
        }
      }
      // the dunes: the wind side combed pale up to a sharp crest, the slip face in its own shade
      const [f, crest] = phase(x, z);
      if (f > 0.74) return [0x9a4a32, 0.32 * crest * (1 - smoothstep(0.9, 1, f)) * smoothstep(0.74, 0.77, f)];
      if (f > 0.55) return [0xeab88a, 0.4 * crest * smoothstep(0.55, 0.73, f)];
      return null;
    };

    const sites = (l: Lattice) => {
      const out: { x: number; z: number }[] = [];
      const c = Math.cos(l.ang);
      const sn = Math.sin(l.ang);
      const h = l.step * (Math.sqrt(3) / 2);
      for (let j = -12; j <= 12; j++)
        for (let i = -6; i <= 6; i++) {
          const u = (i + (j & 1 ? 0.5 : 0)) * l.step + l.ox;
          const v = j * h + l.oz;
          const x = u * c - v * sn;
          const z = (l.z0 + l.z1) / 2 + u * sn + v * c;
          if (z > l.z0 || z < l.z1 || Math.abs(x) > HALF_W + 8) continue;
          out.push({ x, z });
        }
      return out;
    };

    const bones: Field = { height, wash, stain, routes: [], lines: [...furrows, ...faults.map((f) => ({ kind: 'crack' as const, pts: f.pts }))], beats, drift, lane, dune, wind, avenues, rings, lattices, terraces, faults, furrows, sites };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Field);
  },
};

/** Which sunk face: most of them still dark (0 lit, 1 tipped and half lit, 3 dark). */
const SUNK = [[0, 3], [1, 2.5], [3, 4.5]] as const;
/** The scrub that holds on in the troughs. */
const SCRUB = [['kessra_ironscrub', 2], ['kessra_brush', 3]] as const;

function plan(kit: Kit, b: Field) {
  const r = kit.r;
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;

  /** A great beacon standing at (x, z), looking along (dx, dz), if there's room; else null. */
  const beacon = (x: number, z: number, dx: number, dz: number, variant?: number, s = range(r, 0.95, 1.05)) => {
    if (!kit.free(x, z, 2.2)) return null;
    const p = kit.solid('kessra_beacon', x, z, s, facing(dx, dz) + (r() - 0.5) * 0.1);
    // (every variant stands on one column, so its colliders don't change with it)
    if (p && variant !== undefined) p.variant = variant;
    return p;
  };
  /** A beacon the sand came over: its face and plumes out of a heap. */
  const sunk = (x: number, z: number, dx: number, dz: number, variant?: number) =>
    kit.put('kessra_beacon_sunk', x, z, { s: range(r, 1.0, 1.15), rot: facing(dx, dz) + (r() - 0.5) * 0.3, variant: variant ?? weighted(r, SUNK), pad: 0.5 });
  /**
   * What's left of a beacon whose head came off long ago, faceless: a broken drum, the capital
   * alone, the plinth's top steps. Most of the field is these; the faces are the few, and mean more.
   */
  const stump = (x: number, z: number, variant?: number) =>
    kit.put('kessra_beacon_stump', x, z, { s: range(r, 0.9, 1.1), variant: variant ?? Math.floor(r() * 3), pad: 0.5 });
  /** A beacon that fell, its plinth where it stood at (x, z), lying along (dx, dz). */
  const fallen = (x: number, z: number, dx: number, dz: number) => {
    const l = Math.hypot(dx, dz) || 1;
    const s = range(r, 0.9, 1.0);
    // (the model's middle is 10.6 along from its plinth)
    const mx = x + (dx / l) * 10.6 * s;
    const mz = z + (dz / l) * 10.6 * s;
    return kit.put('kessra_beacon_fallen', mx, mz, { s, rot: Math.atan2(-dz, dx), overlap: true });
  };
  /** The count between two points: n stones evenly along the line, the odd one leaning. */
  const count = (ax: number, az: number, bx: number, bz: number, n: number) => {
    for (let k = 0; k < n; k++) {
      const t = (k + 1) / (n + 1);
      const x = lerp(ax, bx, t);
      const z = lerp(az, bz, t);
      if (!clear(x, z, LANE - 2)) continue;
      kit.put('kessra_count_stone', x, z, { s: range(r, 0.9, 1.05), variant: r() < 0.8 ? 0 : r() < 0.6 ? 1 : 2, overlap: true });
    }
  };
  /** Scrub in a trough near (x, z), if there's one there. */
  const scrub = (x: number, z: number, n: number) => {
    if (b.dune(x, z) > 0.3 || !clear(x, z, LANE + 1)) return;
    kit.group(x, z, { kinds: SCRUB, n, spread: 2.5 + n * 0.3, big: 1.3, small: 0.6, keep: (xx, zz) => clear(xx, zz, LANE) && b.dune(xx, zz) < 0.45 });
  };
  /** The erg between things: scrub in some of the troughs, dust off the crests out at the sides. */
  const erg = (bt: Beat, rich: number) => {
    for (let z = bt.z0 - 3; z > bt.z1 + 3; z -= range(r, 5, 8)) {
      for (const side of [-1, 1]) {
        const x = side * range(r, 12, HALF_W + 6);
        if (r() < rich) scrub(x, z, 3 + Math.floor(r() * 4));
        if (r() < 0.12 && b.dune(x, z) > 0.75) kit.emit('dust', x, z, 3, b.wind[0] > 0 ? 1 : -1);
      }
    }
  };

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    switch (bt.kind) {
      case 'erg': {
        erg(bt, 0.35);
        // the threshold: two beacons either side of the way, watching you come, the count run out
        // from each to the sides
        const z = bt.z1 + 8;
        const lx = b.lane(z);
        for (const side of [-1, 1]) {
          const x = lx + side * (LANE + 5.5);
          beacon(x, z, 0, 1, 0, 1.05);
          count(x + side * 3, z + 1, x + side * 16, z + 3, side < 0 ? 2 : 3);
          kit.post(x - side * 3.2, z + 3, 0, 'threshold');
        }
        break;
      }
      case 'breather': {
        erg(bt, 0.2);
        // a dust devil wandering the open sand; now and then one stone of the count, alone
        kit.emit('devil', (r() - 0.5) * 40, (bt.z0 + bt.z1) / 2);
        if (r() < 0.5) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 14, 26);
          const z = bt.z1 + len * range(r, 0.3, 0.7);
          if (r() < 0.5) stump(x, z);
          else kit.put('kessra_count_stone', x, z, { s: 1, variant: 1 });
        }
        break;
      }
      case 'avenue': {
        for (const a of b.avenues) {
          const ca = Math.cos(a.ang);
          const sa = Math.sin(a.ang);
          const n = Math.floor(a.len / a.step);
          const u0 = (-n * a.step) / 2;
          /** What the sand's made of each beacon on a rank: whole, sunk or fallen. */
          const fate = () => {
            const q = r();
            if (b.drift === 'buried') return q < 0.45 ? 'sunk' : q < 0.6 ? 'fallen' : 'whole';
            if (b.drift === 'scoured') return q < 0.08 ? 'sunk' : q < 0.2 ? 'fallen' : 'whole';
            return q < 0.22 ? 'sunk' : q < 0.36 ? 'fallen' : 'whole';
          };
          for (const side of [-1, 1] as const) {
            let prev: { x: number; z: number } | null = null;
            for (let i = 0; i <= n; i++) {
              const u = u0 + i * a.step;
              const p = fromAvenue(a, u, side * a.half);
              // looking in across the way
              const dx = -side * ca;
              const dz = -side * sa;
              // the two at each end always stand: the avenue's gates
              const f = i === 0 || i === n ? 'whole' : fate();
              if (f === 'whole') beacon(p.x, p.z, dx, dz, i === 0 || i === n ? 0 : undefined);
              else if (f === 'sunk') {
                if (r() < 0.25) sunk(p.x, p.z, dx, dz);
                else stump(p.x, p.z);
              }
              // (a fallen one lies outward, away from the way, as if the way pushed it)
              else fallen(p.x, p.z, side * ca, side * sa);
              // the count between this one and the last: two, three, five, seven, and again
              if (prev) count(prev.x, prev.z, p.x, p.z, PRIMES[(i - 1) % PRIMES.length]);
              prev = p;
              // sand heaped behind the rank on the lee, scrub in its shelter
              if (r() < 0.35) scrub(p.x + side * range(r, 5, 9), p.z + (r() - 0.5) * 6, 3 + Math.floor(r() * 3));
            }
          }
          // the gates' guns: either side of the way at both ends
          for (const u of [u0 - 2, -u0 + 2]) for (const side of [-1, 1]) {
            const p = fromAvenue(a, u, side * (a.half - 3.5));
            kit.post(p.x, p.z, 0, 'avenue');
          }
          // out past the ranks, the open erg
          erg(bt, 0.25);
        }
        break;
      }
      case 'ring': {
        for (const g of b.rings) {
          // the hearth on its dais, breathing heat
          kit.put('kessra_reader', g.x, g.z, { s: 1.15, rot: r() * Math.PI, overlap: true });
          kit.claim(g.x, g.z, 7);
          kit.emit('breath', g.x, g.z);
          kit.emit('breath', g.x + 1, g.z - 0.8);
          // the faces round it, looking in; where one would stand in the way, it's sunk
          for (let k = 0; k < g.n; k++) {
            const a = g.a0 + (k * Math.PI * 2) / g.n;
            const x = g.x + Math.cos(a) * g.r;
            const z = g.z + Math.sin(a) * g.r;
            const dx = -Math.cos(a);
            const dz = -Math.sin(a);
            if (!clear(x, z, LANE + 1.5)) sunk(x, z, dx, dz, 0);
            else if (b.drift === 'buried' && r() < 0.35) sunk(x, z, dx, dz);
            else beacon(x, z, dx, dz);
          }
          // the count in a ring round the dais: a stone at each turn of it, in primes between gaps
          const cr = g.r * 0.55;
          let a = g.a0 + Math.PI / g.n;
          for (const q of [...PRIMES, ...PRIMES]) {
            for (let k = 0; k < q; k++, a += 0.13) {
              const x = g.x + Math.cos(a) * cr;
              const z = g.z + Math.sin(a) * cr;
              if (clear(x, z, 4.5)) kit.put('kessra_count_stone', x, z, { s: 0.95, variant: 0, rot: a, overlap: true });
            }
            a += 0.32;
            if (a > g.a0 + Math.PI * 2 + Math.PI / g.n - 0.3) break;
          }
          // the hearth's keepers: guns round the dais, off the way
          for (const side of [-1, 1]) kit.post(g.x + side * 6.5, g.z + (r() - 0.5) * 4, 0, 'hearth');
          kit.post(g.x + (r() < 0.5 ? -1 : 1) * 3, g.z - 8, 0, 'hearth');
        }
        erg(bt, 0.2);
        break;
      }
      case 'rows': {
        for (const l of b.lattices) {
          for (const p of b.sites(l)) {
            if (r() < 0.2) continue;
            const h = b.dune(p.x, p.z);
            const inWay = !clear(p.x, p.z, LANE + 1.5);
            // the lattice all looks the one way: down the field, at you
            const dx = Math.sin(l.ang * 0.5);
            const dz = Math.cos(l.ang * 0.5);
            // most of the lattice lost its heads long ago: stumps, capitals, a plinth scoured bare.
            // Only some in the troughs still stand whole, and now and then a face looks out of a
            // dune's flank: the few that watch, so they're worth looking at
            if (h < 0.32 && !inWay && r() < 0.55) {
              if (beacon(p.x, p.z, dx, dz) && r() < 0.3) kit.post(p.x + (r() - 0.5) * 6, p.z + 4, 0, 'rows');
            } else if (h < 0.32) stump(p.x, p.z, r() < 0.5 ? 0 : 2);
            else if (h < 0.6) {
              if (r() < 0.15) sunk(p.x, p.z, dx, dz);
              else stump(p.x, p.z, r() < 0.6 ? 1 : 0);
            }
            // (high on a dune the sand's over all of it, or all but the capital's rim)
            else if (h < 0.85 && r() < 0.3) stump(p.x, p.z, 1);
            // scrub in the trough beside it
            if (r() < 0.3) scrub(p.x + (r() - 0.5) * 8, p.z + (r() - 0.5) * 8, 2 + Math.floor(r() * 3));
          }
          // the count along the lattice's rows, where the troughs have left it bare: so its lines
          // show between the dunes
          const sites = b.sites(l);
          const ux = Math.cos(l.ang);
          const uz = Math.sin(l.ang);
          let q = 0;
          for (const p of sites)
            for (const o of sites) {
              const dx = o.x - p.x;
              const dz = o.z - p.z;
              if (Math.abs(dx * ux + dz * uz - l.step) > 0.5 || Math.abs(-dx * uz + dz * ux) > 0.5) continue;
              const mx = (p.x + o.x) / 2;
              const mz = (p.z + o.z) / 2;
              if (b.dune(mx, mz) > 0.4 || b.dune(p.x, p.z) > 0.55 || b.dune(o.x, o.z) > 0.55) continue;
              count(p.x, p.z, o.x, o.z, PRIMES[q++ % PRIMES.length]);
            }
        }
        // dust off the crests
        for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= 6)
          for (const side of [-1, 1]) {
            const x = side * range(r, 6, HALF_W);
            if (b.dune(x, z) > 0.7 && r() < 0.35) kit.emit('dust', x, z, 3, b.wind[0] > 0 ? 1 : -1);
          }
        break;
      }
      case 'terraces': {
        for (const t of b.terraces) {
          // the count on each riser, either side of the stair, out to the sides; a face at each
          // end of the top step, two at the stair's head looking down it
          for (let k = 1; k <= t.n; k += 2) {
            const zr = (x: number) => t.z0 - (k - 1) * t.tread + t.lean * x - 0.8;
            for (const side of [-1, 1]) {
              // in groups, a prime to a group, a gap between: two, three, five, seven
              let x = t.x + side * (LANE - 1);
              for (let g = 0; Math.abs(x) < HALF_W + 6; g++) {
                const q = PRIMES[(g + k) % PRIMES.length];
                for (let i = 0; i < q && Math.abs(x) < HALF_W + 6; i++, x += side * 1.7)
                  kit.put('kessra_count_stone', x, zr(x), { s: 0.95, variant: r() < 0.85 ? 0 : 1, rot: 0, overlap: true });
                x += side * 4.5;
              }
            }
          }
          const zt = (x: number) => t.z0 - t.n * t.tread + t.lean * x - 2.5;
          for (const side of [-1, 1]) {
            const x = t.x + side * (LANE + 3);
            beacon(x, zt(x), 0, 1, 0);
            kit.post(x + side * 4, zt(x) - 2, 0, 'stair');
            const xe = t.x + side * range(r, 22, 28);
            if (b.drift === 'buried') sunk(xe, zt(xe) - 4, 0, 1);
            else beacon(xe, zt(xe) - 4, 0, 1);
          }
          // sand drifted against the risers' feet at the far ends, scrub in it
          for (let k = 0; k < 6; k++) scrub((r() < 0.5 ? -1 : 1) * range(r, 18, HALF_W + 4), t.z0 - range(r, 0, t.n * t.tread), 3);
        }
        erg(bt, 0.15);
        break;
      }
      case 'fall': {
        for (const f of b.faults) {
          const rt: Route = { kind: 'crack', pts: f.pts };
          // two ranks along the fault, thrown down away from it; one or two still standing, leaning
          for (const side of [-1, 1]) {
            for (let z = f.z0 - range(r, 2, 6); z > f.z1 + 4; z -= range(r, 11, 14)) {
              const fx = routeX(rt, z);
              const nz = routeX(rt, z - 1) - fx;
              // (the fault's normal, out to this side)
              const nl = Math.hypot(1, nz);
              const ox = side / nl;
              const oz = (side * nz) / nl;
              const d = range(r, 7, 10);
              const x = fx + ox * d;
              const zz = z + oz * d;
              if (Math.abs(x) > HALF_W + 6) continue;
              const q = r();
              if (q < 0.2 && clear(x, zz, LANE + 1.5)) {
                if (beacon(x, zz, -ox, -oz, 1)) kit.post(x - ox * 3.5, zz - oz * 3.5 + 2, 0, 'fall');
              } else if (q < 0.3) stump(x, zz);
              else fallen(x, zz, ox + (r() - 0.5) * 0.3, oz + (r() - 0.5) * 0.3);
              // stones of the count shaken out round it
              if (r() < 0.5) kit.group(x + ox * 4, zz + oz * 4, { kinds: [['kessra_count_stone', 1]], n: 2 + Math.floor(r() * 3), spread: 3, big: 1, small: 0.85, keep: (xx, zz2) => clear(xx, zz2, LANE - 1) });
            }
          }
          // dust still settling out of the fault
          for (let z = f.z0 - 4; z > f.z1; z -= range(r, 10, 16)) kit.emit('dust', routeX(rt, z), z, 2, r() < 0.5 ? -1 : 1);
        }
        erg(bt, 0.2);
        break;
      }
      case 'out': {
        // the field's last row: two faces sunk to the ruff either side of the way out, looking
        // north, away from you; the rest of the row long since headless
        const z = bt.z0 - 6;
        const lx = b.lane(z);
        for (const side of [-1, 1]) {
          sunk(lx + side * (LANE + 4), z, 0, -1, 0);
          for (let x = lx + side * (LANE + 4 + range(r, 11, 14)); Math.abs(x) < HALF_W + 8; x += side * range(r, 11, 14))
            if (r() < 0.75) stump(x, z + (r() - 0.5) * 2);
        }
        erg({ ...bt, z0: bt.z0 - 10 }, 0.3);
        break;
      }
    }
  }
}
