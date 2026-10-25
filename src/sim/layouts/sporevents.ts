/**
 * The Spore Vents: where the bloom breathes (docs/level-design.md, its layout row). Under Mirefall's
 * fen the bloom's root-mat is a thousand years thick, and it breathes: where the old ground is
 * broken, along the buried faults, its breath comes up through the crust. So everything here
 * follows the breaks. The vents are strung along the faults like beads; the crust they breathe out
 * is ochre round the live ones, grey round the dead; the chimneys stand where a vent built itself
 * up; the fog lies in the old craters. A grey-green day, no sun, no direction.
 *
 * One fault runs through the whole crossing beside the way, now on one side, now on the other,
 * crossing it at a saddle; every ground is what that fault does there. A level is a crossing, in
 * out of the fog between two dead chimneys and out over the split (the fault turned across the
 * field, breathing all along it), through three grounds (two, if the stretch is short), each with
 * bones of its own, so no two crossings fly alike:
 * - the row: a fissure's craters strung along the fault, big and small, some run together; the
 *   live ones crusted ochre and breathing, the old ones caved, grey, full of fog; the way alongside,
 *   over the fault once at a saddle between two;
 * - the pocks: the fault and its splays, little cones in families along them, the ground between
 *   pitted with a thousand pocks;
 * - the rimstone: a great vent up the slope ahead, its runoff laid down in lobed stepped pools
 *   that spill down towards you; the way climbs the cascade;
 * - the chimneys: the fault opened into two, the ground between sunk into a trough, chimneys built
 *   up along both scarps, the way down the trough between them;
 * - the maar: one vast crater on the fault, its floor a lake of fog, the great throat breathing in
 *   its middle; the way over its inner slope, past the column;
 * - the cold ground: a stretch where the fault's gone quiet: caved craters full of fog, broken
 *   chimneys, nothing breathing. The dead quiet.
 * And the breath for the whole crossing: still (most vents asleep, the fog thin), breathing, or
 * heaving (most of them live, the fog thick, the clouds rising often). Flat pocked crust between
 * the grounds, fog drifting at the sides: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { eased } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Breath = 'still' | 'breathing' | 'heaving';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  edge: [32, 38],
  flat: [16, 24],
  row: [64, 120],
  pocks: [56, 96],
  rimstone: [60, 76],
  chimneys: [58, 96],
  maar: [62, 74],
  cold: [50, 76],
  split: [30, 36],
};

/** The crust's level. */
const FLOOR = 0.8;
/** Half the way kept open (over three ship widths across). */
const LANE = 7.5;
/** How much of the vents are live, by the breath. */
const LIVE: Record<Breath, number> = { still: 0.3, breathing: 0.55, heaving: 0.8 };

/** A vent's crater: live (crusted, breathing) or cold (caved, grey, fogged). */
interface Crater {
  x: number;
  z: number;
  r: number;
  live: boolean;
  /** How deep its bowl, below the rim. */
  deep: number;
  /** The maar: a crater the size of a ground. */
  great?: boolean;
}
/** A splay or a second scarp: a short line off the fault. */
interface Line {
  pts: { x: number; z: number }[];
}
interface Cascade {
  /** The vent at its head (far up-field). */
  x: number;
  z: number;
  /** Where it reaches down to (near). */
  z0: number;
  /** A step down per terrace, a terrace's depth along the slope, the head's height. */
  drop: number;
  tread: number;
  top: number;
  seed: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Field extends Bones {
  breath: Breath;
  /** The way through: x at z. */
  lane(z: number): number;
  /** The fault: x at z (it runs the whole crossing). */
  fault(z: number): number;
  /** The lesser fault, mostly on the way's other side. */
  far(z: number): number;
  /** Which side of the way the fault is on at z (-1 … 1, through 0 where it crosses). */
  side(z: number): number;
  /** Where the fault crosses the way. */
  saddles: number[];
  craters: Crater[];
  splays: Line[];
  cascades: Cascade[];
  /** The way the crust's blown off the vents, (x, z). */
  drift: [number, number];
  /** The split's line across the field at the way out: z at x. */
  split: { z: number; lean: number } | null;
  splitZ(x: number): number;
  /** The chimneys' trough at (x, z): how far sunk (0..1). */
  troughAt(x: number, z: number): number;
}

/** Distance from (x, z) to a polyline (and the index of the nearer end of its nearest piece). */
function lineDist(pts: { x: number; z: number }[], x: number, z: number) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (Math.max(a.z, b.z) < z - 12 || Math.min(a.z, b.z) > z + 12) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

export const sporevents: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 6271 + Math.round(-z0) * 17 + 3, 0x9e3779b1) ^ 0x61c88647);
    const s = seed % 991;

    const breath = weighted(r, [['still', 3], ['breathing', 4], ['heaving', 3]] as const) as Breath;
    const live = LIVE[breath];
    const da = r() * Math.PI * 2;
    const drift: [number, number] = [Math.cos(da), Math.sin(da)];

    // the grounds: one with a shape all its own (the rimstone, the chimneys or the maar) and two
    // more; a still crossing more likely to have gone cold somewhere, a heaving one never
    const signature = weighted(r, [['rimstone', 1], ['chimneys', 1], ['maar', 1]] as const);
    const odd = r() < 0.2 ? [weighted(r, [['rimstone', 1], ['chimneys', 1], ['maar', 1]] as const)] : [];
    const colds = breath === 'still' ? ['cold', 'cold'] : breath === 'breathing' ? ['cold'] : [];
    const rest = shuffle(r, ['row', 'row', 'pocks', 'pocks', ...odd, ...colds].filter((g) => g !== signature));
    const pool = [signature, ...rest.filter((g, i) => rest.indexOf(g) === i)];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.edge[0], first) - LEN.split[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.flat[0];
    const n = want(3) <= total ? 3 : 2;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['edge', ...grounds.flatMap((g, i) => (i ? ['flat', g] : [g])), 'split'];
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
    // (whatever won't fit goes to the grounds that grow with their length: a longer row, more
    // pocks, a longer trough; never to the breathers)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'row' || k === 'pocks' || k === 'chimneys' || k === 'cold' ? i : -1)).filter((i) => i >= 0);
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

    // the way through, wandering gently
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 8;
    const lane = (z: number) => clamp(x0 + 9 * Math.sin(z * 0.013 + k1) + 3 * Math.sin(z * 0.037 + k2), -13, 13);

    // which side of the way the fault runs, and how far off: it changes sides at the saddles,
    // where it crosses the way at a slant. Each ground says where it wants it. A lesser fault runs
    // on the far side, so both sides of the way have their vents; it crosses back over where the
    // great one's come over to its side
    const sides: { z: number; v: number }[] = [];
    const offs: { z: number; v: number }[] = [];
    const farSides: { z: number; v: number }[] = [];
    const farOffs: { z: number; v: number }[] = [];
    const saddles: number[] = [];
    // (it starts on the roomier side)
    let at = lane(z0) > 0 ? -1 : 1;
    let farAt = -at;
    sides.push({ z: z0 + 30, v: at });
    farSides.push({ z: z0 + 30, v: farAt });
    const cross = (zc: number) => {
      sides.push({ z: zc + 10, v: at }, { z: zc - 10, v: -at });
      at = -at;
      saddles.push(zc);
    };
    const farCross = (zc: number) => {
      if (farAt !== at) return;
      farSides.push({ z: zc + 9, v: farAt }, { z: zc - 9, v: -farAt });
      farAt = -farAt;
    };
    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      // (the lesser fault out wider, closing in where a ground wants it close)
      farOffs.push({ z: zc, v: b.kind === 'chimneys' ? range(r, LANE + 6, LANE + 8) : b.kind === 'pocks' ? range(r, 15, 19) : range(r, 19, 24) });
      if (b.kind === 'chimneys') farOffs.push({ z: b.z0 - 10, v: farOffs[farOffs.length - 1].v }, { z: b.z1 + 10, v: farOffs[farOffs.length - 1].v });
      switch (b.kind) {
        case 'row':
          offs.push({ z: b.z0 - 8, v: 15 }, { z: b.z1 + 8, v: 15 });
          // over it once, at a saddle between two craters
          cross(b.z0 - len * range(r, 0.4, 0.6));
          break;
        case 'pocks':
          offs.push({ z: b.z0 - 6, v: 12 }, { z: b.z1 + 6, v: 12 });
          if (r() < 0.5) cross(b.z0 - len * range(r, 0.35, 0.65));
          break;
        case 'rimstone':
          // (the head vent off to the fault's side; the cascade spreads across the way)
          offs.push({ z: zc, v: 13 });
          break;
        case 'chimneys':
          // the near scarp: the fault, the trough's wall
          offs.push({ z: b.z0 - 10, v: LANE + 7 }, { z: b.z1 + 10, v: LANE + 7 });
          break;
        case 'maar':
          offs.push({ z: zc, v: 15 });
          break;
        case 'cold':
          offs.push({ z: zc, v: 14 });
          if (r() < 0.4) cross(b.z0 - len * range(r, 0.35, 0.65));
          break;
        case 'flat':
          offs.push({ z: zc, v: 18 });
          if (r() < 0.3 && farAt !== at) cross(zc);
          else farCross(zc);
          break;
        case 'edge':
          offs.push({ z: zc, v: 20 });
          break;
        case 'split':
          offs.push({ z: b.z0, v: 18 });
          break;
      }
      // (where the great one's crossed over in a ground, the lesser goes back at its end)
      if (b.kind !== 'flat' && b.kind !== 'split') farCross(b.z1 + 4);
    }
    farSides.sort((p, q) => q.z - p.z);
    const sideOf = eased(sides);
    const offOf = eased(offs.length ? offs : [{ z: 0, v: 15 }]);
    const farSideOf = eased(farSides);
    const farOffOf = eased(farOffs);
    const fault = (z: number) => lane(z) + sideOf(z) * offOf(z) + (fbm(z * 0.05, 3.1, s) - 0.5) * 3;
    const far = (z: number) => lane(z) + farSideOf(z) * farOffOf(z) + (fbm(z * 0.05, 8.7, s) - 0.5) * 3;
    const faultLine: Route = { kind: 'crack', pts: [] };
    const farLine: Route = { kind: 'crack', pts: [] };
    for (let zz = z0 + 4; zz >= z1 - 4; zz -= 2) {
      faultLine.pts.push({ x: fault(zz), z: zz });
      farLine.pts.push({ x: far(zz), z: zz });
    }

    const craters: Crater[] = [];
    const splays: Line[] = [];
    const cascades: Cascade[] = [];
    let split: Field['split'] = null;
    /** Room for a crater of radius R at (x, z): off the way, clear of the others (it may touch one, as a row's do). */
    const room = (x: number, z: number, R: number, touch = 0.15) => Math.abs(x - lane(z)) > LANE + R + 0.5 && craters.every((c) => Math.hypot(c.x - x, c.z - z) > (c.r + R) * (1 - touch));
    /** Craters strung along a fault through beat b: radius in rad, the gap between in gap (in radii), so many live. */
    const beads = (line: (z: number) => number, b: Beat, rad: [number, number], gap: [number, number], live: number) => {
      for (let zz = b.z0 - range(r, 3, 10); zz > b.z1 + 3; ) {
        const R = range(r, rad[0], rad[1]);
        const zc = zz - R;
        const x = line(zc) + (r() - 0.5) * 1.5;
        const fit = Math.min(R, Math.abs(x - lane(zc)) - LANE - 1);
        if (fit >= Math.min(1.8, rad[0]) && Math.abs(x) < HALF_W + 6 && room(x, zc, fit)) craters.push({ x, z: zc, r: fit, live: r() < live, deep: range(r, 0.9, 1.5) * (fit / 4) ** 0.5 });
        zz -= R * (2 + range(r, gap[0], gap[1]));
      }
    };

    for (const b of beats) {
      const len = b.z0 - b.z1;
      switch (b.kind) {
        case 'row': {
          // beads along the fault: big and small, some run together, a gap at the saddle
          for (let zz = b.z0 - range(r, 3, 6); zz > b.z1 + 3; ) {
            const R = r() < 0.3 ? range(r, 6, 9) : range(r, 2.6, 5.5);
            const zc = zz - R * 0.8;
            const x = fault(zc) + (r() - 0.5) * 1.5;
            if (saddles.some((q) => Math.abs(q - zc) < R + 5)) {
              zz -= 3;
              continue;
            }
            // (where the way's too close for a big one, a smaller)
            const fit = Math.min(R, Math.abs(x - lane(zc)) - LANE - 1);
            if (fit >= 2.2 && room(x, zc, fit, 0.25)) craters.push({ x, z: zc, r: fit, live: r() < live, deep: range(r, 1.2, 2) * (fit / 5) ** 0.5 });
            zz -= R * 2 * range(r, 0.75, 1.15);
          }
          // the lesser fault's beads: smaller, further apart
          beads(far, b, [2.2, 4.2], [1.4, 2.6], live * 0.8);
          break;
        }
        case 'pocks': {
          // the fault frays into splays, off away from the way: the cones go along all of them
          for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
            const za = b.z0 - len * range(r, 0.05, 0.7);
            const L = range(r, 22, 40);
            const away = Math.sign(fault(za) - lane(za)) || 1;
            const ang = away * range(r, 0.35, 0.8);
            const pts: { x: number; z: number }[] = [];
            for (let t = 0; t <= L; t += 2) pts.push({ x: fault(za) + Math.sin(ang) * t + (noise2(t * 0.15, k, s) - 0.5) * 2, z: za - Math.cos(ang) * t });
            splays.push({ pts });
          }
          // a bigger vent or two along the faults, the big forms; chains of little pits between
          beads(fault, b, [3.8, 5.5], [3, 5], live);
          beads(far, b, [3.2, 4.5], [3.5, 6], live * 0.8);
          beads(fault, b, [1.5, 2.3], [0.3, 1.2], live * 0.3);
          beads(far, b, [1.4, 2.1], [0.4, 1.4], live * 0.3);
          break;
        }
        case 'rimstone': {
          // the head vent near the far end, on the fault; the cascade reaches back to the near end
          const zh = b.z1 + range(r, 10, 14);
          const xh = fault(zh);
          const R = range(r, 4.5, 6);
          craters.push({ x: xh, z: zh, r: R, live: true, deep: 1.6 });
          cascades.push({ x: xh, z: zh, z0: b.z0 - 4, drop: range(r, 0.32, 0.42), tread: range(r, 5.5, 7.5), top: 0, seed: r() * 100 });
          break;
        }
        case 'maar': {
          const zc = b.z1 + len * range(r, 0.42, 0.58);
          const R = range(r, 21, 24);
          // (centred out on the fault's side, so the way runs over its inner slope, not its throat)
          const sd = Math.sign(fault(zc) - lane(zc)) || 1;
          const x = lane(zc) + sd * range(r, 13, 16);
          craters.push({ x, z: zc, r: R, live: true, deep: 3.2, great: true });
          beads(far, b, [2.0, 3.4], [2.5, 4], live * 0.7);
          break;
        }
        case 'cold': {
          for (let zz = b.z0 - range(r, 4, 8); zz > b.z1 + 4; ) {
            const R = r() < 0.25 ? range(r, 5.5, 8) : range(r, 2.5, 5);
            const zc = zz - R;
            const x = fault(zc) + (r() - 0.5) * 3;
            const fit = Math.min(R, Math.abs(x - lane(zc)) - LANE - 1);
            if (fit >= 2.2 && room(x, zc, fit)) craters.push({ x, z: zc, r: fit, live: false, deep: range(r, 1.2, 1.8) });
            zz -= R * 2 + range(r, 2, 10);
          }
          beads(far, b, [2.2, 4], [2, 4], 0);
          break;
        }
        case 'edge': {
          // the first vents, out of the fog: old pits on both faults, the last of them breathing
          const sub = { ...b, z0: b.z1 + len * 0.55 };
          beads(fault, sub, [2.2, 3.8], [2.5, 5], live * 0.5);
          beads(far, sub, [2, 3], [3, 6], live * 0.3);
          break;
        }
        case 'flat': {
          // now and then one old pit on the fault
          if (r() < 0.6) {
            const zc = (b.z0 + b.z1) / 2;
            const x = fault(zc);
            const R = range(r, 2.4, 3.6);
            if (room(x, zc, R)) craters.push({ x, z: zc, r: R, live: r() < live * 0.4, deep: 1 });
          }
          break;
        }
        case 'split': {
          // the way out: the fault turns across the field, open and breathing all along it
          split = { z: b.z0 - len * range(r, 0.45, 0.6), lean: (r() - 0.5) * 0.3 };
          break;
        }
      }
    }

    /** (the lesser fault, as a line: things group along it as along the splays) */
    const FAR: Line = { pts: farLine.pts };
    /** The split's z at x. */
    const splitZ = (x: number) => (split ? split.z + split.lean * x + (fbm(x * 0.07, 5.5, s) - 0.5) * 3 : 0);

    /** The fault's distance at (x, z), and the splays' and the far scarp's. */
    const scar = (x: number, z: number): [number, Line | null] => {
      let d = Math.abs(x - fault(z));
      let which: Line | null = null;
      const df = Math.abs(x - far(z));
      if (df < d) [d, which] = [df, FAR];
      for (const l of splays) {
        if (z > l.pts[0].z + 2 || z < l.pts[l.pts.length - 1].z - 2) continue;
        const dl = lineDist(l.pts, x, z);
        if (dl < d) [d, which] = [dl, l];
      }
      return [d, which];
    };

    /** The chimneys' trough at (x, z): how far sunk (0..1). */
    const trough = (x: number, z: number) => {
      const b = beatAt(z);
      if (b.kind !== 'chimneys') return 0;
      const a = fault(z);
      const c = far(z);
      const lo = Math.min(a, c);
      const hi = Math.max(a, c);
      // (eased in at its ends, the scarps short and steep)
      const ends = smoothstep(0, 12, Math.min(b.z0 - z, z - b.z1));
      return ends * smoothstep(lo - 0.3, lo + 1.4, x) * (1 - smoothstep(hi - 1.4, hi + 0.3, x));
    };

    /** The cascade at (x, z): its height, and how much it's a lip (0..1) or a pool's floor. */
    const cascadeAt = (c: Cascade, x: number, z: number): { h: number; lip: number; pool: number } | null => {
      if (z > c.z0 + 4 || z < c.z - 16) return null;
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx * 0.75, dz);
      const reach = c.z0 - c.z;
      // (it fans out down the slope towards you; behind the head the rise falls away to the crust)
      const fan = (1 - smoothstep(reach * 0.85, reach + 6, d)) * (1 - smoothstep(2, 14, -dz));
      if (fan <= 0) return null;
      // the terraces: rings round the head, lobed where the runoff found its ways down
      const a = Math.atan2(dz, dx);
      const lobe = (noise2(Math.cos(a) * 2.2 + c.seed, Math.sin(a) * 2.2, 11) - 0.5) * c.tread * 0.9 + (noise2(x * 0.12, z * 0.12, c.seed) - 0.5) * 1.2;
      const q = Math.max(0, d - 6 + lobe) / c.tread;
      const k = Math.floor(q);
      const f = q - k;
      // (each pool dished a little, its lip raised at its downhill edge)
      const lip = smoothstep(0.82, 0.93, f) * (1 - smoothstep(0.97, 1, f));
      const h = FLOOR + 2.6 - k * c.drop * 1.0 - 0.12 * Math.sin(f * Math.PI) + 0.22 * lip - (f > 0.97 ? c.drop * smoothstep(0.97, 1, f) : 0);
      return { h: lerp(FLOOR, Math.max(FLOOR, h), fan), lip: lip * fan, pool: (1 - lip) * fan * smoothstep(0, 0.2, f) * (d > 6 ? 1 : 0) };
    };

    /** A crater's profile at d from its middle: its rim up, its bowl down, its throat (0 out past the apron). */
    const crater = (c: Crater, d: number) => {
      const t = d / c.r;
      const rim = c.great ? 0.9 : 0.45 + c.r * 0.06;
      if (t > 1) return rim * Math.exp(-(((t - 1) / (c.great ? 0.25 : 0.4)) ** 2));
      // (the bowl: steep under the rim, a floor, the throat in the middle)
      const bowl = -c.deep + (c.deep + rim) * smoothstep(c.great ? 0.55 : 0.3, 1, t) ** 1.6;
      const throat = c.live && !c.great ? -0.9 * (1 - smoothstep(0.12, 0.26, t)) : 0;
      return bowl + throat;
    };

    const height = (x: number, z: number) => {
      const b = beatAt(z);
      // the crust: nearly flat, heaved a little
      let h = FLOOR + (fbm(x * 0.035, z * 0.035, s) - 0.5) * 0.7;
      // the fault: a groove, its lips heaved; the splays fainter
      const [d, l] = scar(x, z);
      if (d < 3.5) {
        const k = l ? 0.6 : 1;
        h += k * (-0.35 * (1 - smoothstep(0.2, 1.1, d)) + 0.2 * Math.exp(-((d - 1.8) ** 2) * 1.5));
      }
      // the chimneys' trough: sunk between its scarps
      const tr = b.kind === 'chimneys' ? trough(x, z) : 0;
      if (tr > 0) h -= 1.3 * tr;
      // the split: open across the field
      if (split && b.kind === 'split') {
        const ds = Math.abs(z - splitZ(x));
        if (ds < 4) h += -0.9 * (1 - smoothstep(0.4, 1.8, ds)) + 0.3 * Math.exp(-((ds - 2.6) ** 2) * 1.2);
      }
      // the cascade
      for (const c of cascades) {
        const q = cascadeAt(c, x, z);
        if (q) h = Math.max(h, q.h);
      }
      // the craters
      for (const c of craters) {
        if (Math.abs(z - c.z) > c.r * 1.8) continue;
        const dc = Math.hypot(x - c.x, z - c.z) + (noise2(x * 0.3, z * 0.3, s + 7) - 0.5) * c.r * 0.12;
        if (dc > c.r * 1.8) continue;
        h += crater(c, dc);
      }
      return h;
    };

    const wash = (x: number, z: number) => {
      const [d, l] = scar(x, z);
      return (1 - smoothstep(0.3, 1.4, d)) * (l ? 0.45 : 0.75);
    };

    const stain = (x: number, z: number): [number, number] | null => {
      // the craters: live ones' rims crusted ochre, their crust blown downwind; their throats dark;
      // the cold ones grey, their bowls pale with old ash
      for (const c of craters) {
        if (Math.abs(z - c.z) > c.r * 2.4) continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz) + (noise2(x * 0.35, z * 0.35, s + 8) - 0.5) * c.r * 0.18;
        if (d > c.r * 2.4) continue;
        const t = d / c.r;
        if (c.great) {
          // the maar: its rim a crisp band of crust, its floor damp and dark, the throat's crust
          // the throat's own (a model)
          if (t > 0.86 && t < 1.12) return [0xc4703a, 0.8 * smoothstep(0.86, 0.92, t) * (1 - smoothstep(1.04, 1.12, t))];
          if (t < 0.86) return [0x46524a, 0.55 * (1 - smoothstep(0.7, 0.86, t))];
          continue;
        }
        if (c.live) {
          if (t < 0.24) return [0x1e1c18, 0.9];
          // (the crust thickest on the rim, spilling out down the side the breath blows)
          const down = Math.max(0, (dx * drift[0] + dz * drift[1]) / Math.max(d, 0.01));
          const out = 1 - smoothstep(1.05 + down * 0.7, 1.35 + down * 0.9, t);
          const rim = smoothstep(0.55, 0.85, t) * out;
          if (rim > 0.02) return [t > 1.12 ? 0xcf9a58 : 0xc4703a, (t > 1.12 ? 0.55 : 0.85) * rim];
          return [0x3a3430, 0.6 * (1 - smoothstep(0.3, 0.55, t))];
        }
        // cold: an ash-pale bowl, a grey rim, no crust
        if (t < 0.85) return [0x9aa49a, 0.45 * (1 - smoothstep(0.55, 0.85, t))];
        if (t < 1.25) return [0x6a706a, 0.35 * (1 - smoothstep(1.05, 1.25, t))];
      }
      // the cascade: the lips cream, the pools' floors a milky mint, the runoff stained ochre
      for (const c of cascades) {
        const q = cascadeAt(c, x, z);
        if (!q) continue;
        if (q.lip > 0.1) return [0xe8d8b0, 0.8 * q.lip];
        if (q.pool > 0.1) return [noise2(x * 0.2, z * 0.2, s + 9) > 0.55 ? 0xb8c8a8 : 0xa8bca4, 0.7 * q.pool];
      }
      // the split's breath has crusted its lips
      if (split && beatAt(z).kind === 'split') {
        const ds = Math.abs(z - splitZ(x));
        if (ds < 1) return [0x1e1c18, 0.85];
        if (ds < 3.2) return [0xc4703a, 0.7 * (1 - smoothstep(2, 3.2, ds))];
      }
      // the chimneys' trough floor, darker, damp
      if (beatAt(z).kind === 'chimneys') {
        const tr = trough(x, z);
        if (tr > 0.3) return [0x4a5648, 0.4 * tr];
      }
      return null;
    };

    const bones: Field = {
      height,
      wash,
      stain,
      routes: [],
      lines: [faultLine, farLine, ...splays.map((l) => ({ kind: 'crack' as const, pts: l.pts }))],
      beats,
      breath,
      lane,
      fault,
      far,
      side: sideOf,
      saddles,
      craters,
      splays,
      cascades,
      drift,
      split,
      splitZ,
      troughAt: trough,
    };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Field);
  },
};

/** The little things that fruit where the breath reaches: tufts and the odd low stack. */
const TUFTS = [['mirefall_tuft', 4], ['mirefall_stack_low', 1]] as const;

function plan(kit: Kit, b: Field) {
  const r = kit.r;
  /** Off the way through (and in the field, near enough). */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m && Math.abs(x) < HALF_W + 10;
  const live = LIVE[b.breath];

  /** A tall chimney you'd hit, at (x, z): a live one capped, a cold one broken off. */
  const chimney = (x: number, z: number, cold = false) => {
    if (!clear(x, z, LANE + 3) || !kit.free(x, z, 2.4)) return null;
    const p = kit.solid('mirefall_stack', x, z, range(r, 0.9, 1.1), r() * Math.PI * 2);
    // (every variant stands on the one column, so its colliders don't change with it)
    if (p) p.variant = cold ? 3 : Math.floor(r() * 3);
    return p;
  };
  /** A low stack under the flight line: a vent that built itself up, or what's left of a chimney. */
  const stack = (x: number, z: number, cold = false) =>
    clear(x, z, LANE + 1) ? kit.put('mirefall_stack_low', x, z, { s: range(r, 0.85, 1.15), variant: cold ? 3 : Math.floor(r() * 3), pad: 0.3 }) : null;
  /** Tufts fruiting round (x, z), where the breath reaches. */
  const tufts = (x: number, z: number, n: number, spread = 3) =>
    kit.group(x, z, { kinds: TUFTS, n, spread, big: 1.25, small: 0.55, keep: (xx, zz) => clear(xx, zz) });
  /** Fog lying low at (x, z). */
  const fog = (x: number, z: number) => kit.emit('fog', x, z);

  /** A crater's dressing: the crust on its rim, the cone in its throat, the tufts outside, its breath or its fog. */
  const dress = (c: Crater) => {
    if (c.great) return;
    if (c.live) {
      // the throat: a cone of fresh crust, breathing
      if (c.r < 4.2) kit.put('mirefall_vent_cone', c.x, c.z, { s: clamp(c.r / 3.4, 0.7, 1.2), variant: Math.floor(r() * 3), overlap: true });
      else kit.put('mirefall_vent_cone', c.x, c.z, { s: clamp(c.r / 4.5, 0.9, 1.5), variant: r() < 0.5 ? 1 : 2, overlap: true });
      kit.claim(c.x, c.z, c.r * 0.9);
      kit.emit('vent', c.x, c.z, 0, c.r > 5 ? 1 : -1);
      // crust shelves round the rim, on the downwind side mostly
      const n = Math.max(3, Math.round(c.r * 0.9));
      const a0 = Math.atan2(b.drift[1], b.drift[0]);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n - 0.5) * Math.PI * range(r, 1.1, 1.6);
        const x = c.x + Math.cos(a) * c.r * 1.02;
        const z = c.z + Math.sin(a) * c.r * 1.02;
        if (clear(x, z, LANE - 0.5)) kit.put('mirefall_rim_crust', x, z, { s: clamp(c.r / 5, 0.7, 1.3) * range(r, 0.85, 1.1), rot: -a + Math.PI / 2, variant: k % 3, overlap: true });
      }
      // what fruits in its breath: tufts round the outside, thickest downwind
      for (let k = 0; k < 2 + Math.floor(c.r / 2.5); k++) {
        const a = a0 + (r() - 0.5) * Math.PI * 1.4;
        const d = c.r * range(r, 1.25, 1.7);
        tufts(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 3 + Math.floor(r() * 4), 2.5);
      }
      // a low stack beside the bigger ones, where it's built itself a chimney
      if (c.r > 4.5 && r() < 0.6) {
        const a = r() * Math.PI * 2;
        stack(c.x + Math.cos(a) * c.r * 1.35, c.z + Math.sin(a) * c.r * 1.35);
      }
      // a gun rooted on the rim, off the way, where the breath feeds it
      if (r() < 0.55) {
        const sd = Math.sign(c.x - b.lane(c.z)) || 1;
        kit.post(c.x - sd * c.r * 0.9, c.z + range(r, -2, 2), 0, 'vent');
      }
    } else {
      // cold: caved, fog lying in its bowl, a dead stump on its rim now and then
      if (c.r > 3) fog(c.x, c.z);
      if (r() < 0.35) {
        const a = r() * Math.PI * 2;
        stack(c.x + Math.cos(a) * c.r * 1.1, c.z + Math.sin(a) * c.r * 1.1, true);
      }
      if (r() < 0.4) {
        const a = r() * Math.PI * 2;
        kit.put('mirefall_vent_cone', c.x + Math.cos(a) * c.r * 0.2, c.z + Math.sin(a) * c.r * 0.2, { s: clamp(c.r / 4, 0.6, 1.1), variant: 3, overlap: true });
      }
    }
  };

  /** Along a line: the fault's own pocks and little cones, a family to each, every so often. */
  const cones = (pts: { x: number; z: number }[], every: [number, number], live: number) => {
    let acc = range(r, 0, every[0]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const p = pts[i];
      acc -= Math.hypot(p.x - a.x, p.z - a.z);
      if (acc > 0) continue;
      acc = range(r, every[0], every[1]);
      if (!clear(p.x, p.z, LANE + 2.5)) continue;
      const on = r() < live;
      // the parent cone on the line, its children round it (smaller, on the line's either side)
      if (!kit.put('mirefall_vent_cone', p.x, p.z, { s: range(r, 0.8, 1.1), variant: on ? Math.floor(r() * 3) : 3, pad: 0.5 })) continue;
      if (on) kit.emit('vent', p.x, p.z, 0, -1);
      const kids = 1 + Math.floor(r() * 3);
      for (let k = 0; k < kids; k++) {
        const ang = r() * Math.PI * 2;
        const d = range(r, 2.6, 4.2);
        const x = p.x + Math.cos(ang) * d;
        const z = p.z + Math.sin(ang) * d;
        if (clear(x, z, LANE + 1)) kit.put('mirefall_vent_cone', x, z, { s: range(r, 0.45, 0.65), variant: on && r() < 0.6 ? 0 : 3, overlap: true });
      }
      if (on) tufts(p.x + (r() - 0.5) * 4, p.z + (r() - 0.5) * 4, 3 + Math.floor(r() * 3), 3);
      if (on && r() < 0.25) kit.post(p.x + (r() - 0.5) * 4, p.z + 2.5, 0, 'vent');
    }
  };

  /** Fog banks out at the sides, framing the way; thicker the more the field breathes. */
  const banks = (bt: Beat, every: number) => {
    const k = b.breath === 'heaving' ? 0.8 : b.breath === 'breathing' ? 1 : 1.3;
    for (let z = bt.z0 - range(r, 2, every * k); z > bt.z1 + 2; z -= every * k * range(r, 0.7, 1.3)) {
      const side = r() < 0.5 ? -1 : 1;
      fog(side * range(r, HALF_W - 4, HALF_W + 8), z);
      if (r() < 0.5) fog(-side * range(r, HALF_W - 2, HALF_W + 8), z - range(r, 3, 8));
    }
  };

  /**
   * The old stands out at the field's edges: where the faults' old branches ran, long since built
   * up into chimneys, a stand every so often on each side, framing the way. Cold, they're broken.
   */
  const stands = (bt: Beat, every: [number, number], cold = false) => {
    for (const side of [-1, 1]) {
      for (let z = bt.z0 - range(r, 2, every[1]); z > bt.z1 + 3; z -= range(r, every[0], every[1])) {
        const x = side * range(r, HALF_W - 8, HALF_W + 6);
        if (!clear(x, z, LANE + 6)) continue;
        // (the stand: a tall one out at the edge now and then, low ones gathered round it)
        if (Math.abs(x) > HALF_W - 4 && r() < 0.35) chimney(x, z, cold);
        else if (clear(x, z, LANE + 1)) kit.put('mirefall_stack_low', x, z, { s: range(r, 1.15, 1.45), variant: cold ? 3 : Math.floor(r() * 3), pad: 0.3 });
        for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
          const a = r() * Math.PI * 2;
          const d = range(r, 3.5, 6);
          if (clear(x + Math.cos(a) * d, z + Math.sin(a) * d, LANE + 3)) kit.put('mirefall_stack_low', x + Math.cos(a) * d, z + Math.sin(a) * d, { s: range(r, 0.7, 1.05), variant: cold || r() < 0.12 ? 3 : Math.floor(r() * 3), overlap: true });
        }
        if (!cold) tufts(x - side * range(r, 2, 4), z + range(r, -3, 3), 3 + Math.floor(r() * 3), 2.5);
      }
    }
  };

  /** The fault's own scatter between the grounds: tufts where it's warm, a stump where it isn't. */
  const along = (bt: Beat, rich: number) => {
    for (let z = bt.z0 - range(r, 3, 8); z > bt.z1 + 3; z -= range(r, 7, 12)) {
      const x = b.fault(z) + (r() - 0.5) * 4;
      if (!clear(x, z, LANE + 1)) continue;
      if (r() < rich) tufts(x, z, 2 + Math.floor(r() * 3), 2.5);
      else if (r() < 0.25) stack(x, z, r() < 0.5);
    }
  };

  for (const c of b.craters) dress(c);

  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    switch (bt.kind) {
      case 'edge': {
        // in out of the fog: banks of it either side, two dead chimneys standing either side of
        // the way, the fault's first cold stumps
        for (let z = bt.z0 - 2; z > bt.z1 + len * 0.3; z -= range(r, 5, 8))
          for (const side of [-1, 1]) fog(b.lane(z) + side * range(r, LANE + 8, HALF_W), z);
        const z = bt.z1 + range(r, 6, 10);
        const lx = b.lane(z);
        for (const side of [-1, 1]) {
          chimney(lx + side * (LANE + 5), z, true);
          for (let k = 0; k < 2; k++) stack(lx + side * (LANE + range(r, 10, 22)), z + range(r, -6, 6), true);
        }
        along(bt, 0.3);
        stands({ ...bt, z0: bt.z1 + len * 0.6 }, [9, 14], true);
        break;
      }
      case 'flat': {
        banks(bt, 12);
        stands(bt, [7, 11]);
        along(bt, 0.45);
        break;
      }
      case 'row': {
        banks(bt, 16);
        stands(bt, [10, 16]);
        // the saddle: guns on its shoulders, the craters either side of it its walls
        for (const zs of b.saddles) {
          if (zs > bt.z0 || zs <= bt.z1) continue;
          for (const side of [-1, 1]) kit.post(b.lane(zs) + side * (LANE + 3.5), zs + range(r, -2, 2), 0, 'saddle');
        }
        // a low stack or two out on the far side of the row, the old vents that built up
        for (let z = bt.z0 - range(r, 6, 12); z > bt.z1 + 6; z -= range(r, 14, 22)) {
          const sd = Math.sign(b.fault(z) - b.lane(z)) || 1;
          const x = b.fault(z) + sd * range(r, 8, 14);
          if (r() < 0.6) stack(x, z);
          else if (r() < 0.5 && Math.abs(x) < HALF_W + 4) chimney(x, z);
        }
        break;
      }
      case 'pocks': {
        banks(bt, 18);
        stands(bt, [8, 12]);
        // the fault's cones, a family to each; the splays' too
        for (const [line, every] of [[b.fault, [7, 11]], [b.far, [8, 13]]] as const) {
          const pts = [] as { x: number; z: number }[];
          for (let z = bt.z0; z >= bt.z1; z -= 2) pts.push({ x: line(z), z });
          cones(pts, every as unknown as [number, number], live);
        }
        for (const l of b.splays) if (l.pts[0].z <= bt.z0 && l.pts[0].z > bt.z1) cones(l.pts, [6, 9], live * 0.8);
        break;
      }
      case 'rimstone': {
        for (const c of b.cascades) {
          // the head vent: a big live one (dressed with the craters), low stacks round it; tufts on
          // the lips at the sides, where the runoff's cooled; guns on the lips looking down
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + r();
            stack(c.x + Math.cos(a) * 8.5, c.z + Math.sin(a) * 6.5);
          }
          for (let z = c.z0 - 3; z > c.z + 6; z -= range(r, 4, 6))
            for (const side of [-1, 1]) {
              const x = b.lane(z) + side * range(r, LANE + 3, HALF_W);
              if (r() < 0.35) tufts(x, z, 2 + Math.floor(r() * 3), 2);
            }
          for (const side of [-1, 1]) kit.post(b.lane(c.z + 14) + side * (LANE + 4), c.z + 14, 0, 'cascade');
          kit.emit('vent', c.x, c.z, 0, 1);
        }
        banks(bt, 20);
        stands(bt, [8, 12]);
        break;
      }
      case 'chimneys': {
        // chimneys up both scarps: tall ones you'd hit, low ones between, tufts at their feet
        for (const line of [b.fault, b.far]) {
          for (let z = bt.z0 - range(r, 4, 8); z > bt.z1 + 4; z -= range(r, 6, 10)) {
            const sd = Math.sign(line(z) - b.lane(z)) || 1;
            // (on the scarp's top, out of the trough; a second rank behind now and then)
            const x = line(z) + sd * range(r, 1.5, 3);
            if (r() < 0.35) chimney(x, z);
            else stack(x, z);
            if (r() < 0.45) stack(x + sd * range(r, 5, 9), z + range(r, -3, 3));
            tufts(x + sd * range(r, 2, 4), z + range(r, -3, 3), 2 + Math.floor(r() * 3), 2);
            if (r() < 0.3) {
              kit.put('mirefall_vent_cone', x + sd * range(r, 4, 8), z + range(r, -3, 3), { s: range(r, 0.7, 1), variant: r() < live ? Math.floor(r() * 3) : 3 });
            }
          }
          // the guns on the scarps' tops, looking down into the trough
          for (let z = bt.z0 - len * 0.3; z > bt.z1 + 6; z -= len * 0.35) {
            const sd = Math.sign(line(z) - b.lane(z)) || 1;
            kit.post(line(z) + sd * 3, z, 0, 'scarp');
          }
        }
        // the trough's floor: fog lying in it out at its ends, a few tufts in the damp
        fog(b.lane(bt.z0 - 6) + (r() - 0.5) * 6, bt.z0 - 6);
        for (let z = bt.z0 - 8; z > bt.z1 + 8; z -= range(r, 9, 14)) {
          const x = b.lane(z) + (r() < 0.5 ? -1 : 1) * range(r, LANE + 0.5, LANE + 3);
          if (b.troughAt(x, z) > 0.5) tufts(x, z, 2, 1.5);
        }
        break;
      }
      case 'maar': {
        const c = b.craters.find((q) => q.great && q.z <= bt.z0 && q.z > bt.z1);
        if (c) {
          // the great throat breathing in its middle, a lake of fog on its floor, stacks round the
          // far rim, tufts and low stacks on its inner slopes; the guns round the rim
          kit.put('mirefall_throat', c.x, c.z, { s: 1, rot: r() * Math.PI * 2, overlap: true });
          kit.claim(c.x, c.z, 8);
          kit.emit('vent', c.x, c.z, 0, 1);
          kit.emit('vent', c.x + 1.5, c.z - 1, 0, 1);
          for (let k = 0; k < 7; k++) {
            const a = r() * Math.PI * 2;
            const d = c.r * range(r, 0.35, 0.6);
            fog(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d);
          }
          const sd = Math.sign(c.x - b.lane(c.z)) || 1;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2 + (r() - 0.5) * 0.2;
            const x = c.x + Math.cos(a) * c.r * 1.06;
            const z = c.z + Math.sin(a) * c.r * 1.06;
            // (the rim on the far side from the way: chimneys, crust between; the near side open)
            const farSide = Math.cos(a) * sd > 0.2;
            if (farSide && k % 2 === 0) chimney(x, z);
            else if (clear(x, z, LANE + 1)) kit.put('mirefall_rim_crust', x, z, { s: range(r, 1.1, 1.4), rot: -a + Math.PI / 2, variant: k % 3, overlap: true });
          }
          for (let k = 0; k < 9; k++) {
            const a = r() * Math.PI * 2;
            const d = c.r * range(r, 0.62, 0.9);
            const x = c.x + Math.cos(a) * d;
            const z = c.z + Math.sin(a) * d;
            if (r() < 0.3) stack(x, z);
            else tufts(x, z, 3 + Math.floor(r() * 3), 2.5);
          }
          for (const a of [Math.PI * 0.5, Math.PI * 1.5, Math.PI * (sd > 0 ? 0.0 : 1.0) + Math.PI])
            kit.post(c.x + Math.cos(a) * (c.r - 2), c.z + Math.sin(a) * (c.r - 2), 0, 'maar');
        }
        banks(bt, 22);
        stands(bt, [9, 14]);
        break;
      }
      case 'cold': {
        // the dead quiet: broken chimneys, grey stumps, fog in every hollow, nothing breathing
        for (let z = bt.z0 - range(r, 4, 8); z > bt.z1 + 4; z -= range(r, 9, 15)) {
          const sd = r() < 0.5 ? -1 : 1;
          const x = b.lane(z) + sd * range(r, LANE + 4, HALF_W);
          if (r() < 0.2) chimney(x, z, true);
          else stack(x, z, true);
        }
        banks(bt, 9);
        stands(bt, [8, 12], true);
        break;
      }
      case 'split': {
        // the way out: the split across the field, little cones breathing all along it, two
        // chimneys standing either side of the way where it's crossed
        for (let x = -HALF_W - 6; x < HALF_W + 6; x += range(r, 5, 8)) {
          const z = b.splitZ(x);
          if (!clear(x, z, LANE + 1.5)) continue;
          const on = r() < Math.max(live, 0.5);
          kit.put('mirefall_vent_cone', x, z, { s: range(r, 0.6, 0.95), variant: on ? Math.floor(r() * 3) : 3, overlap: true });
          if (on && r() < 0.5) kit.emit('vent', x, z, 0, -1);
          if (r() < 0.5) tufts(x + (r() - 0.5) * 3, z - range(r, 2, 4), 2 + Math.floor(r() * 2), 2);
        }
        const zs = b.splitZ(b.lane(bt.z0)) - 6;
        for (const side of [-1, 1]) {
          const x = b.lane(zs) + side * (LANE + 5);
          chimney(x, zs);
          kit.post(x - side * 2.5, zs + 4, 0, 'split');
        }
        banks(bt, 14);
        break;
      }
    }
  }
}
