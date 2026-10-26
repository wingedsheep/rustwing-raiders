/**
 * The Titan Graveyard: the Five Mouths, the plain under Sankven's gate where the Toll War's titans
 * fought for nine days and fell (docs/level-design.md, its layout row). Two sides of them: the
 * Compact's, ivory banded oxblood, and the Uukhvar's, gunmetal banded hazard yellow. 166 years of
 * ash lie on them, and the Sankvi live in their shade, taking plates and nothing more (the Glass Law:
 * a titan is nobody's).
 *
 * The titans are the bones. Each one lies where it fell, posed limb by limb from a kit of parts
 * (tools/models/set_ashgrave_titans.py): face down or on its back, its arms flung out or over its
 * head, a knee drawn up, longer than the field is wide, with the ash heaped against its flanks and
 * drifted out in its lee. Only what stands up past the flight line is solid: a hand curled out of the
 * ash, an arm raised, a knee.
 *
 * A level is a crossing, in between the clan's boundary plates and out under the Kneel (a titan that
 * died kneeling, bowed over the way), through three grounds (two, if the stretch is short), so no
 * two crossings fly alike:
 * - the reach: a titan lying off to one side, its arm flung out to the way and the hand beside it
 *   curled up past the flight line, a wall of knuckles framing the way; the Hand clan in its palm;
 * - the duel: two titans of the two sides who killed each other, lying crossed, the Uukhvar's fist
 *   in the Compact's chest, its core still smouldering; a ring of their shell holes round them;
 * - the rank: a file of one side's titans mown down by one barrage as they advanced up the field,
 *   face down side by side, all the one way, the way in a gap between two of them, the barrage's
 *   craters walking across them;
 * - the yard: a titan the clans are stripping, plates only, its back bared to the frame, its plates
 *   stacked by size beside it, a gantry over it, their shacks in its shade, the haul road out;
 * - the front: the two sides' trenches zig-zagging across the field, craters thick between them, a
 *   titan fallen across both.
 * And the ash for the whole crossing: thin (the paint showing), drifted, or deep (the bodies sunk to
 * their backs). Open ash between the grounds: the breathers.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { inField, routeX } from '../layout';
import type { Placed } from '../terrain';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Ash = 'thin' | 'drifted' | 'deep';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  plain: [34, 40],
  breather: [18, 26],
  reach: [64, 80],
  duel: [70, 86],
  rank: [76, 110],
  yard: [66, 84],
  front: [60, 80],
  out: [44, 50],
};

/** The plain's level, and how high the ash heaps against a body, by the year. */
const PLAIN = 0.4;
const HEAP: Record<Ash, number> = { thin: 0.7, drifted: 1.3, deep: 2.0 };
/** How far into the ash the bodies have sunk, by the year (times their scale). */
const SINK: Record<Ash, number> = { thin: 0.2, drifted: 0.6, deep: 1.1 };
/** Half the way kept open (over three ship widths across). */
const LANE = 8;

// the kit's measures (set_ashgrave_titans.py), at scale 1: where the joints are on the body, along
// its axis (u, toward the head) and across it (w, to its left)
const HIP = { u: -11.5, w: 4.2 };
const SHOULDER = { u: 5.0, w: 7.6 };
const NECK = 9.5;
const UPPER = 11;
const FORE = 10;
const THIGH = 12;
const SHIN = 12;
/** How far a hand's, a foot's and the reach's middles are past the wrist or ankle. */
const HAND_OFF = 3.0;
const FOOT_OFF = 2.4;
const REACH_OFF = 9.9;
/** The head's middle, past the neck. */
const HEAD_OFF = 3.4;
/** The parts' half widths, for the ash heaped against them and the room they take. */
const BODY_W = 7;

/** What an arm or a leg ends in. */
type ArmEnd = 'hand' | 'fist' | 'up' | 'reach';
type LegEnd = 'foot' | 'knee';

interface Limb {
  /** Its first segment's heading, and its second's (radians, world: atan2(dz, dx)). */
  a1: number;
  a2: number;
  end: ArmEnd | LegEnd;
}

/** A titan, where and how it fell. */
interface Titan {
  side: 0 | 1;
  /** 0 face down, 1 on its back, 2 stripped to the frame. */
  pose: 0 | 1 | 2;
  s: number;
  /** The body's middle, and its heading (toward the head). */
  x: number;
  z: number;
  ang: number;
  /** The head turned off the body's line, its eye still lit. */
  head: number;
  lit: boolean;
  arms: [Limb, Limb];
  legs: [Limb, Limb];
  /** Which ground's it is ('edge': one lying out past the field). */
  job: string;
}

/** A capsule of a body, for the ash heaped against it: from (ax, az) to (bx, bz), r across. */
interface Cap {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
}

interface Crater {
  x: number;
  z: number;
  r: number;
}

interface Trench {
  pts: { x: number; z: number }[];
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Field extends Bones {
  ash: Ash;
  lane(z: number): number;
  /** The plain under (x, z), without the ash heaped on it: what a body lies on. */
  plain(x: number, z: number): number;
  titans: Titan[];
  craters: Crater[];
  trenches: Trench[];
  trail: Route;
  wind: [number, number];
}

const dirOf = (a: number): [number, number] => [Math.cos(a), Math.sin(a)];
/** The turn that lays a part built along +x along heading a (see colsAt). */
const along = (a: number) => -a;

/** Where (u along, w across to the left) on titan t is in the world. */
function at(t: Titan, u: number, w: number) {
  const [dx, dz] = dirOf(t.ang);
  // (its left, seen from above with the head up the screen: the Blender model's +y is -z)
  return { x: t.x + (u * dx + w * dz) * t.s, z: t.z + (u * dz - w * dx) * t.s };
}

/** Each joint of a titan's limbs, and the capsules of its body, worked out from its pose. */
function skeleton(t: Titan) {
  const caps: Cap[] = [];
  const cap = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) => caps.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r: r * t.s });
  const chest = at(t, 6, 0);
  const pelvis = at(t, -12, 0);
  cap(pelvis, chest, BODY_W * 0.85);
  const neck = at(t, NECK, 0);
  const [hx, hz] = dirOf(t.ang + t.head);
  const head = { x: neck.x + hx * HEAD_OFF * t.s, z: neck.z + hz * HEAD_OFF * t.s };
  cap(neck, head, 3);
  const step = (p: { x: number; z: number }, a: number, l: number) => ({ x: p.x + Math.cos(a) * l * t.s, z: p.z + Math.sin(a) * l * t.s });
  const arms = t.arms.map((l, i) => {
    const sh = at(t, SHOULDER.u, i ? -SHOULDER.w : SHOULDER.w);
    const el = step(sh, l.a1, UPPER);
    const wr = l.end === 'up' ? el : step(el, l.a2, FORE);
    cap(sh, el, 2.4);
    if (l.end !== 'up') cap(el, wr, 2.1);
    return { sh, el, wr };
  });
  const legs = t.legs.map((l, i) => {
    const hp = at(t, HIP.u, i ? -HIP.w : HIP.w);
    const kn = step(hp, l.a1, THIGH);
    const an = step(kn, l.a2, SHIN);
    if (l.end === 'knee') cap(hp, step(hp, l.a1, 13.5), 2.6);
    else {
      cap(hp, kn, 2.8);
      cap(kn, an, 2.5);
    }
    return { hp, kn, an };
  });
  return { caps, arms, legs, head, neck };
}

/** Distance from (x, z) to a capsule's line. */
function capDist(c: Cap, x: number, z: number) {
  const vx = c.bx - c.ax;
  const vz = c.bz - c.az;
  const l2 = vx * vx + vz * vz || 1e-6;
  const t = clamp(((x - c.ax) * vx + (z - c.az) * vz) / l2, 0, 1);
  return Math.hypot(x - (c.ax + vx * t), z - (c.az + vz * t));
}

export const titans: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 6271 + Math.round(-z0) * 17 + 3, 0x9e3779b1) ^ 0x51ed270b);
    const s = seed % 991;

    // the year's ash, and the wind that laid it (across the field, mostly)
    const ash = weighted(r, [['thin', 3], ['drifted', 4], ['deep', 3]] as const) as Ash;
    const wa = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.2;
    const wind: [number, number] = [Math.cos(wa), Math.sin(wa)];

    // the grounds: the reach always (the hand is the graveyard's), and two more of any kind
    const rest = shuffle(r, ['duel', 'rank', 'yard', 'front']);
    const pool = ['reach', ...rest];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.plain[0], first) - LEN.out[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.breather[0];
    const n = want(3) <= total ? 3 : want(2) <= total ? 2 : 1;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['plain', ...grounds.flatMap((g, i) => (i ? ['breather', g] : [g])), 'out'];
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
    // (whatever won't fit goes to the rank and the plains, never to the breathers)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'rank' || k === 'front' ? i : -1)).filter((i) => i >= 0);
      const into = soak.length ? soak : [0];
      for (const i of into) lens[i] += spare / into.length;
    }
    const beats: Beat[] = [];
    let z = z0;
    seq.forEach((kind, i) => {
      const end = i === seq.length - 1 ? z1 : z - lens[i];
      beats.push({ kind, z0: z, z1: end, side: r() < 0.5 ? -1 : 1 });
      z = end;
    });
    const inside = (b: Beat, z: number, m: number) => smoothstep(0, m, Math.min(b.z0 - z, z - b.z1));

    // the way through, wandering over the open ash; each ground pulls it to its own line
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 10;
    const wander = (z: number) => clamp(x0 + 8 * Math.sin(z * 0.016 + k1) + 3 * Math.sin(z * 0.041 + k2), -14, 14);
    const holds: { b: Beat; x: (z: number) => number }[] = [];

    const titans: Titan[] = [];
    const craters: Crater[] = [];
    const trenches: Trench[] = [];
    const sideOf = (): 0 | 1 => (r() < 0.5 ? 0 : 1);
    /** A titan's limbs flung out naturally: arms out from the shoulders, legs trailing. */
    const limbs = (ang: number, spread: number): Pick<Titan, 'arms' | 'legs'> => {
      const arm = (k: number): Limb => {
        const a1 = ang + k * range(r, 0.9, 2.2) * spread;
        return { a1, a2: a1 + k * range(r, -0.6, 0.9), end: r() < 0.6 ? 'hand' : 'fist' };
      };
      const leg = (k: number): Limb => {
        const a1 = ang + Math.PI - k * range(r, 0.1, 0.45);
        return { a1, a2: a1 + k * range(r, -0.5, 0.2), end: 'foot' };
      };
      return { arms: [arm(1), arm(-1)], legs: [leg(1), leg(-1)] };
    };
    const titan = (o: Partial<Titan> & { x: number; z: number; ang: number }): Titan => {
      const t: Titan = {
        job: 'edge',
        side: sideOf(),
        pose: r() < 0.7 ? 0 : 1,
        s: range(r, 1.0, 1.15),
        head: (r() - 0.5) * 0.8,
        lit: r() < 0.3,
        ...limbs(o.ang, 1),
        ...o,
      };
      titans.push(t);
      return t;
    };
    const crater = (x: number, z: number, rr: number) => craters.push({ x, z, r: rr });
    /** A titan lying out past the field's edge on side sd, along it: only an arm or a leg reaches in. */
    const edge = (zc: number, sd: number) => {
      const ang = (r() < 0.5 ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 0.5;
      titan({ x: sd * range(r, HALF_W + 12, HALF_W + 16), z: zc, ang, pose: r() < 0.65 ? 0 : 1 });
    };

    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      const sd = b.side;
      switch (b.kind) {
        case 'reach': {
          // a titan lying off to one side, along the field, its arm flung out across to the way;
          // the hand curled up beside it. The way keeps to the hand's other side
          const lx = clamp(wander(zc), -8, 8);
          holds.push({ b, x: () => lx });
          const s1 = range(r, 1.05, 1.15);
          // (the fingers' wall stands REACH_OFF + 7 past the wrist, by the way's edge)
          const wall = lx + sd * (LANE + 3.5);
          const ax = -sd;
          // the arm comes in level from the side, a little slanted
          const tilt = (r() - 0.5) * 0.5;
          const a2 = Math.atan2(Math.sin(tilt), ax * Math.cos(tilt));
          const wrist = { x: wall - Math.cos(a2) * (REACH_OFF + 7) * s1, z: zc + range(r, -4, 4) - Math.sin(a2) * (REACH_OFF + 7) * s1 };
          const a1 = a2 + sd * range(r, -0.25, 0.35);
          const el = { x: wrist.x - Math.cos(a2) * FORE * s1, z: wrist.z - Math.sin(a2) * FORE * s1 };
          const sh = { x: el.x - Math.cos(a1) * UPPER * s1, z: el.z - Math.sin(a1) * UPPER * s1 };
          // the body lies along the field from that shoulder, head up or down the screen
          const up = r() < 0.5 ? -1 : 1;
          const ang = up < 0 ? -Math.PI / 2 : Math.PI / 2;
          // (the body's middle, from where its shoulder has to be: the arm's the one on that side)
          const left = up === sd;
          const w = (left ? 1 : -1) * SHOULDER.w;
          const [dx, dz] = dirOf(ang);
          const t: Titan = {
            job: 'reach',
            side: sideOf(),
            pose: 0,
            s: s1,
            x: sh.x - (SHOULDER.u * dx + w * dz) * s1,
            z: sh.z - (SHOULDER.u * dz - w * dx) * s1,
            ang,
            head: sd * up * range(r, 0.1, 0.5),
            lit: true,
            ...limbs(ang, 1),
          };
          const reach: Limb = { a1, a2, end: 'reach' };
          t.arms[left ? 0 : 1] = reach;
          // the other arm along its side, out past the field
          const o = t.arms[left ? 1 : 0];
          o.a1 = ang + (left ? -1 : 1) * range(r, 0.4, 0.9);
          o.a2 = o.a1 + (left ? -1 : 1) * range(r, 0, 0.5);
          titans.push(t);
          // a ring of shell holes on the way's other side, where whatever it reached for was
          for (let k = 0; k < 3; k++) crater(lx - sd * range(r, 14, 26), zc + range(r, -len * 0.35, len * 0.35), range(r, 2.6, 4.4));
          break;
        }
        case 'duel': {
          // the two who killed each other: the Compact's on its back, the Uukhvar's face down
          // across it, its fist driven into the Compact's chest
          const lx = clamp(wander(zc), -6, 6);
          holds.push({ b, x: () => lx });
          const cx = lx + sd * range(r, 14, 18);
          const angA = Math.PI / 2 + sd * range(r, 0.35, 0.6);
          const A = titan({ job: 'duel', side: 0, pose: 1, x: cx, z: zc + range(r, -4, 4), ang: angA, s: range(r, 1.05, 1.15), lit: true });
          // B's body beside A's chest, its arm reaching in
          const coreA = at(A, 1.6, 0);
          const angB = angA + Math.PI + sd * range(r, 0.7, 1.0);
          const [bx, bz] = dirOf(angB);
          const sB = range(r, 1.0, 1.1);
          // its right arm (w < 0) punches: from its shoulder to the core, two segments, near straight
          const reachLen = (UPPER + FORE + 1.5) * sB;
          // (its shoulder is reachLen back from the core along the punch, the punch at angle p)
          const p = angB + sd * range(r, 0.6, 0.9);
          const shx = coreA.x - Math.cos(p) * reachLen;
          const shz = coreA.z - Math.sin(p) * reachLen;
          const w = -SHOULDER.w;
          const B: Titan = {
            job: 'duel',
            side: 1,
            pose: 0,
            s: sB,
            x: shx - (SHOULDER.u * bx + w * bz) * sB,
            z: shz - (SHOULDER.u * bz - w * bx) * sB,
            ang: angB,
            head: (r() - 0.5) * 0.6,
            lit: r() < 0.5,
            ...limbs(angB, 1),
          };
          B.arms[1] = { a1: p, a2: p + (r() - 0.5) * 0.15, end: 'fist' };
          titans.push(B);
          // their fight's shell holes in a ring round them, glassed where the big ones hit
          const ring = range(r, 26, 32);
          for (let k = 0; k < 9; k++) {
            const a = (k / 9) * Math.PI * 2 + r() * 0.5;
            crater(cx + Math.cos(a) * ring * range(r, 0.8, 1.15), zc + Math.sin(a) * ring * 0.75, range(r, 2.4, 4.8));
          }
          break;
        }
        case 'rank': {
          // a file of one side's titans, mown down advancing up the field: face down side by
          // side, heads up the screen, the way in a gap between two
          const sideR = sideOf();
          const gap = range(r, 30, 34);
          const lx = clamp(wander(zc), -6, 6);
          holds.push({ b, x: () => lx });
          const n = Math.floor((HALF_W * 2 + 30) / gap) + 1;
          const xs: number[] = [];
          for (let k = -n; k <= n; k++) if (Math.abs(lx + (k + 0.5) * gap) <= HALF_W + 16) xs.push(lx + (k + 0.5) * gap);
          const lean = (r() - 0.5) * 0.25;
          // one file, or on a long stretch two, the second in step behind the first
          const files = len >= 130 ? [b.z0 - len * 0.25, b.z0 - len * 0.25 - 64] : [zc + range(r, -4, 4)];
          const ranked: Titan[] = [];
          files.forEach((zh, f) => {
            for (const x of xs) {
              // (the second file thinner: most of it fell further back, or got through)
              if (f && r() < 0.45) continue;
              const ang = -Math.PI / 2 + lean + (r() - 0.5) * 0.16;
              const t = titan({ job: 'rank', side: sideR, pose: r() < 0.3 ? 1 : 0, x, z: zh + (x - lx) * lean * 0.6 + range(r, -6, 6), ang, s: range(r, 0.95, 1.12) });
              t.head = (r() - 0.5) * 1.1;
              // arms thrown forward over their heads as they fell, or one flung out
              for (const [i, k] of [[0, 1], [1, -1]] as const) {
                const a1 = ang + k * (r() < 0.25 ? range(r, 1.2, 1.8) : range(r, 0.15, 0.7));
                t.arms[i] = { a1, a2: a1 - k * range(r, 0, 0.5), end: r() < 0.5 ? 'hand' : 'fist' };
              }
              ranked.push(t);
            }
            // the barrage that did it, walking across them at a slant
            const slant = (r() - 0.5) * 0.6;
            const bz = zh + range(r, 16, 24);
            for (let x = -HALF_W - 6; x < HALF_W + 6; x += range(r, 7, 11)) crater(x, bz + x * slant + range(r, -3, 3), range(r, 2.6, 4.2));
          });
          // one of them reached up as it went down
          const out = ranked.filter((t) => Math.abs(t.x - lx) > gap * 0.9 && Math.abs(t.x) < HALF_W - 4);
          if (out.length) {
            const t = out[Math.floor(r() * out.length)];
            const i = r() < 0.5 ? 0 : 1;
            t.arms[i] = { a1: t.ang + (i ? -1 : 1) * range(r, 0.8, 1.3), a2: 0, end: 'up' };
          }
          // and one beside the way rolled onto its back, its core still lit (its welders' nest)
          const by = ranked.filter((t) => Math.abs(t.x - lx) < gap && t.arms.every((l) => l.end !== 'up'));
          if (by.length && !ranked.some((t) => t.pose === 1 && Math.abs(t.x) < HALF_W - 4)) by[Math.floor(r() * by.length)].pose = 1;
          break;
        }
        case 'yard': {
          // the titan the clans are stripping: along the field beside the way, its back bared
          const lx = clamp(wander(zc), -8, 8);
          holds.push({ b, x: () => lx });
          const ang = (r() < 0.5 ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 0.2;
          const t = titan({ job: 'yard', side: sideOf(), pose: 2, x: lx + sd * range(r, 17, 20), z: zc + range(r, -6, 6), ang, s: range(r, 1.05, 1.15), lit: false });
          // its limbs laid out straight, the way the breakers lay a body to work it
          const [dx] = dirOf(ang);
          void dx;
          t.arms = [
            { a1: ang + 0.25, a2: ang + 0.1, end: 'hand' },
            { a1: ang - 0.25, a2: ang - 0.1, end: 'hand' },
          ];
          t.legs = [
            { a1: ang + Math.PI - 0.12, a2: ang + Math.PI - 0.05, end: 'foot' },
            { a1: ang + Math.PI + 0.12, a2: ang + Math.PI + 0.05, end: 'foot' },
          ];
          break;
        }
        case 'front': {
          // the two trench lines, zig-zagging across the field, facing each other
          const lx = clamp(wander(zc), -10, 10);
          holds.push({ b, x: () => lx });
          for (const zt of [b.z0 - len * 0.22, b.z1 + len * 0.22]) {
            const pts: { x: number; z: number }[] = [];
            const zig = range(r, 7, 9);
            const ph = r() * zig * 2;
            for (let x = -HALF_W - 12; x <= HALF_W + 12; x += zig) pts.push({ x, z: zt + ((Math.floor((x + ph) / zig) & 1) ? 2.6 : -2.6) + (r() - 0.5) * 1.2 });
            trenches.push({ pts });
          }
          // no-man's-land between, pocked
          for (let k = 0; k < 14; k++) crater(range(r, -HALF_W - 4, HALF_W + 4), range(r, b.z1 + len * 0.3, b.z0 - len * 0.3), range(r, 1.8, 4.2));
          // and a titan fell across both, crossing them
          const ang = -Math.PI / 2 + sd * range(r, 0.15, 0.45);
          titan({ job: 'front', x: lx + sd * range(r, 15, 20), z: zc, ang, pose: r() < 0.5 ? 0 : 1 });
          break;
        }
        case 'breather': {
          // a lone shell hole now and then; a titan lying out past the edge, an arm into the field
          if (r() < 0.7) crater(-sd * range(r, 14, 26), zc + (r() - 0.5) * len * 0.4, range(r, 2.4, 3.6));
          if (r() < 0.6) edge(zc, sd);
          break;
        }
        case 'plain':
          edge(b.z1 + len * range(r, 0.45, 0.65), sd);
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

    // every titan's capsules, for the ash heaped against them
    const caps: Cap[] = titans.flatMap((t) => skeleton(t).caps);
    // (sorted by their nearest z, to find the ones near a point quickly)
    const reachZ = 24;
    const capsNear = (z: number) => caps.filter((c) => Math.min(c.az, c.bz) - reachZ < z && Math.max(c.az, c.bz) + reachZ > z);
    const bucket = new Map<number, Cap[]>();
    const capsAt = (z: number) => {
      const k = Math.floor(z / 8);
      let b = bucket.get(k);
      if (!b) bucket.set(k, (b = capsNear(k * 8 + 4)));
      return b;
    };
    const A = HEAP[ash];

    /** The plain: nearly level ash, softly rolling. */
    const plain = (x: number, z: number) => PLAIN + (fbm(x * 0.035, z * 0.035, s) - 0.5) * 0.8;

    /** The ash heaped against the bodies: highest at a flank, falling away, drifted out in the lee. */
    const heap = (x: number, z: number) => {
      let h = 0;
      for (const c of capsAt(z)) {
        const d = capDist(c, x, z) - c.r;
        if (d > 12) continue;
        // (on the lee side the drift runs further out)
        const mx = (c.ax + c.bx) / 2;
        const mz = (c.az + c.bz) / 2;
        const lee = Math.max(0, ((x - mx) * wind[0] + (z - mz) * wind[1]) / (Math.hypot(x - mx, z - mz) || 1));
        const w = 2.2 + lee * 4.5;
        const k = d <= 0 ? 1 : Math.exp(-(d * d) / (w * w));
        h = Math.max(h, A * k * (0.75 + 0.5 * noise2(x * 0.15, z * 0.15, s + 3)));
      }
      return h;
    };

    /** A shell hole at (x, z): its bowl (negative) and its thrown-up lip. */
    const holes = (x: number, z: number) => {
      let h = 0;
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > c.r * 1.8) continue;
        const u = d / c.r;
        h += u < 1 ? -0.55 * c.r * 0.4 * (1 - u * u) : 0;
        h += 0.3 * c.r * 0.25 * Math.exp(-((u - 1.05) ** 2) * 18);
      }
      return h;
    };

    /** How far (x, z) is from a trench's line, and the trench there. */
    const trenchD = (x: number, z: number) => {
      let best = Infinity;
      for (const t of trenches) {
        if (Math.abs(z - t.pts[0].z) > 8) continue;
        for (let i = 0; i < t.pts.length - 1; i++) {
          const c: Cap = { ax: t.pts[i].x, az: t.pts[i].z, bx: t.pts[i + 1].x, bz: t.pts[i + 1].z, r: 0 };
          best = Math.min(best, capDist(c, x, z));
        }
      }
      return best;
    };

    const height = (x: number, z: number) => {
      let h = plain(x, z) + heap(x, z) + holes(x, z);
      const td = trenchD(x, z);
      if (td < 3) h += -1.4 * (1 - smoothstep(0.7, 1.4, td)) + 0.35 * Math.exp(-((td - 2) ** 2) * 3);
      return h;
    };

    // the scrap trail: a track the length of the graveyard beside the way, round the bodies
    const pts: { x: number; z: number }[] = [];
    let tside: -1 | 1 = r() < 0.5 ? -1 : 1;
    let cur = lane(z0) + tside * 14;
    for (let zz = z0 + 2; zz >= z1 - 2; zz -= 2) {
      const b = beats.find((q) => zz <= q.z0 && zz > q.z1);
      // (it crosses over in the breathers, where the ash is open)
      if (b?.kind === 'breather' && Math.abs(zz - (b.z0 + b.z1) / 2) < 1) tside = -tside as -1 | 1;
      let want = lane(zz) + tside * range(r, 13, 15);
      // off the bodies: pushed out of any it would cross
      for (let pass = 0; pass < 3; pass++)
        for (const c of capsAt(zz)) {
          const d = capDist(c, want, zz) - c.r;
          if (d < 2.5) want += (want >= (c.ax + c.bx) / 2 ? 1 : -1) * (2.5 - d);
        }
      want = clamp(want, -HALF_W - 4, HALF_W + 4);
      cur = lerp(cur, want, 0.25);
      pts.push({ x: cur, z: zz });
    }
    const trail: Route = { kind: 'track', pts };

    const stain = (x: number, z: number): [number, number] | null => {
      // the shell holes scorched dark at their bottoms, the lip's thrown ash paler
      for (const c of craters) {
        const d = Math.hypot(x - c.x, z - c.z) / c.r;
        if (d < 0.75) return [0x3e3a36, 0.55 * (1 - d / 0.75)];
        if (d < 1.25 && d > 0.9) return [0xc8c4bc, 0.35 * (1 - Math.abs(d - 1.07) / 0.18)];
      }
      // the trail: two ruts worn dark into the ash, the crown between them packed paler
      if (z <= pts[0].z && z >= pts[pts.length - 1].z) {
        const d = Math.abs(x - routeX(trail, z));
        if (d < 1.4) return Math.abs(d - 0.95) < 0.3 ? [0x5c5852, 0.5] : d < 0.65 ? [0xb4b0a8, 0.25] : null;
      }
      // the trenches dark in their bottoms
      const td = trenchD(x, z);
      if (td < 1.4) return [0x34302c, 0.6 * (1 - td / 1.4)];
      // the drifts: pale crests where the ash heaps against a body
      const hp = heap(x, z);
      if (hp > A * 0.35) return [0xd6d2ca, 0.35 * smoothstep(A * 0.35, A * 0.9, hp)];
      return null;
    };

    const bones: Field = { height, stain, routes: [trail], lines: [], beats, ash, lane, plain, titans, craters, trenches, trail, wind };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Field);
  },
};

/** The small war debris and the clans' leavings round a body. */
const DEBRIS = [['ashgrave_shed_plate', 5], ['ashgrave_cable_spill', 2], ['ashgrave_titan_shell', 1]] as const;

/** A shed plate in its titan's colours (variant % 2 is the side). */
const livery = (ps: Placed[], side: number, r: () => number) => {
  for (const p of ps) if (p.kind === 'ashgrave_shed_plate') p.variant = side + (r() < 0.5 ? 0 : 2);
};

function plan(kit: Kit, b: Field) {
  const r = kit.r;
  const sink = SINK[b.ash];
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;

  /** A part of a titan lying where it fell: placed as built (one shade, no lean), sunk in the ash. */
  const part = (kind: string, variant: number, x: number, z: number, heading: number, s: number, rad: number, len = 0) => {
    if (z > kit.z0 || z <= kit.z1) return null;
    const p: Placed = { kind, variant, x, z, y: b.plain(x, z) - sink * s, rot: along(heading), s, obstacle: false, cols: [], biome: kit.biome, role: 'giant' };
    kit.props.push(p);
    // (the room it takes, along its length)
    const [dx, dz] = dirOf(heading);
    const n = Math.max(1, Math.ceil(len / (rad * 1.5)));
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : k / (n - 1) - 0.5;
      kit.claim(x + dx * len * t, z + dz * len * t, rad * s);
    }
    return p;
  };

  /** A titan, laid down part by part; returns its joints. */
  const lay = (t: Titan) => {
    const sk = skeleton(t);
    const v = t.side;
    // the body
    const mid = at(t, 0, 0);
    // (the model's middle is at u = -2: chest and pelvis from -14 to 10)
    part('ashgrave_titan_body', v + t.pose * 2, mid.x, mid.z, t.ang, t.s, BODY_W, 20 * t.s);
    // the head, turned
    part('ashgrave_titan_head', v + (t.lit ? 2 : 0), sk.head.x, sk.head.z, t.ang + t.head, t.s, 3);
    // the arms
    t.arms.forEach((l, i) => {
      const { sh, el, wr } = sk.arms[i];
      const mid1 = { x: (sh.x + el.x) / 2, z: (sh.z + el.z) / 2 };
      part('ashgrave_titan_arm', v, mid1.x, mid1.z, l.a1, t.s, 2.4, UPPER * t.s);
      if (l.end === 'up') {
        const p = kit.solid('ashgrave_titan_arm_up', el.x, el.z, t.s, r() * Math.PI * 2);
        if (p) {
          p.variant = v;
          p.y = b.plain(el.x, el.z) - sink * t.s;
        }
        return;
      }
      const mid2 = { x: (el.x + wr.x) / 2, z: (el.z + wr.z) / 2 };
      part('ashgrave_titan_arm', v + 2, mid2.x, mid2.z, l.a2, t.s, 2.1, FORE * t.s);
      if (l.end === 'reach') {
        const [dx, dz] = dirOf(l.a2);
        const hx = wr.x + dx * REACH_OFF * t.s;
        const hz = wr.z + dz * REACH_OFF * t.s;
        const p = kit.solid('ashgrave_titan_reach', hx, hz, t.s, along(l.a2));
        if (p) {
          p.variant = v;
          p.y = b.plain(hx, hz) - sink * 0.5;
        }
        return;
      }
      const [dx, dz] = dirOf(l.a2);
      part('ashgrave_titan_hand', v + (l.end === 'fist' ? 2 : 0), wr.x + dx * HAND_OFF * t.s, wr.z + dz * HAND_OFF * t.s, l.a2, t.s, 3);
    });
    // the legs
    t.legs.forEach((l, i) => {
      const { hp, kn, an } = sk.legs[i];
      if (l.end === 'knee') {
        const p = kit.solid('ashgrave_titan_knee_up', hp.x, hp.z, t.s, along(l.a1));
        if (p) {
          p.variant = v;
          p.y = b.plain(hp.x, hp.z) - sink * t.s;
        }
        return;
      }
      part('ashgrave_titan_legpart', v, (hp.x + kn.x) / 2, (hp.z + kn.z) / 2, l.a1, t.s, 2.8, THIGH * t.s);
      part('ashgrave_titan_legpart', v + 2, (kn.x + an.x) / 2, (kn.z + an.z) / 2, l.a2, t.s, 2.5, SHIN * t.s);
      const [dx, dz] = dirOf(l.a2);
      part('ashgrave_titan_foot', v, an.x + dx * FOOT_OFF * t.s, an.z + dz * FOOT_OFF * t.s, l.a2 + (i ? -0.2 : 0.2), t.s, 2.8);
    });
    // what's still alive in it: the core breathing through the cracked chest, a lit eye's glow
    if (t.pose === 1) {
      const c = at(t, 1.6, 0);
      kit.emit('breath', c.x, c.z);
      kit.emit('breath', c.x + 0.8, c.z - 0.6);
    }
    // and its welders, asleep in the core till you come over it (the director wakes them; not out
    // past the field's edge, where they'd climb out unseen): on its back, or bared in the yard
    if (t.pose !== 0) {
      const c = at(t, t.pose === 1 ? 1.6 : 2.05, 0);
      if (inField(c.x, 4)) {
        kit.post(c.x, c.z, 0, `core:${t.side}`);
        kit.posts[kit.posts.length - 1].y = b.plain(c.x, c.z) - sink * t.s + (t.pose === 1 ? 5.2 : 2) * t.s;
      }
    }
    return sk;
  };

  /** The debris that gathers round a body: plates shed along its flanks, cables out of its joints. */
  const shed = (t: Titan, n: number) => {
    const sk = skeleton(t);
    for (let k = 0; k < n; k++) {
      const c = sk.caps[Math.floor(r() * sk.caps.length)];
      const u = r();
      const x0 = lerp(c.ax, c.bx, u);
      const z0 = lerp(c.az, c.bz, u);
      // out from the flank, on the ash heaped there
      const nx = -(c.bz - c.az);
      const nz = c.bx - c.ax;
      const nl = Math.hypot(nx, nz) || 1;
      const sd = r() < 0.5 ? -1 : 1;
      const d = c.r + range(r, 0.8, 3.5);
      const x = x0 + (sd * nx * d) / nl;
      const z = z0 + (sd * nz * d) / nl;
      if (!clear(x, z, LANE - 1)) continue;
      livery(kit.group(x, z, { kinds: DEBRIS, n: 1 + Math.floor(r() * 3), spread: 2.5, big: range(r, 1.0, 1.4), small: 0.6, keep: (xx, zz) => clear(xx, zz, LANE - 1) }), t.side, r);
    }
  };

  /** A shell hole's leavings: spent casings and a plate round its lip. */
  const holeBits = (c: Crater) => {
    for (let k = 0; k < 1 + Math.floor(r() * 3); k++) {
      const a = r() * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r * range(r, 1.1, 1.6);
      const z = c.z + Math.sin(a) * c.r * range(r, 1.1, 1.6);
      if (clear(x, z, LANE - 2)) kit.put(r() < 0.7 ? 'ashgrave_titan_shell' : 'ashgrave_shed_plate', x, z, { s: range(r, 0.8, 1.1) });
    }
  };

  /** Flak dug in on a body's back or shoulder, with a view of the way. */
  const onBack = (t: Titan, u: number, w: number, guards: string) => {
    const p = at(t, u, w);
    if (!clear(p.x, p.z, LANE - 2)) return;
    kit.post(p.x, p.z, 0, guards);
    kit.posts[kit.posts.length - 1].y = b.plain(p.x, p.z) - sink * t.s + 5.6 * t.s;
  };

  /** A clan crew cutting plate off a body's back or flank (u along it, w out from its spine): sparks falling, in bursts. */
  const cut = (t: Titan, u: number, w: number) => {
    const p = at(t, u, w);
    const n = kit.fx.length;
    kit.emit('cut', p.x, p.z);
    if (kit.fx.length > n) kit.fx[n].y = b.plain(p.x, p.z) - sink * t.s + (Math.abs(w) > 2 ? 4.4 : 5.4) * t.s;
  };

  /** The clan's lean-to against a body's flank, its fire and smoke. */
  const camp = (x: number, z: number, face: number) => {
    if (!clear(x, z, LANE)) return;
    if (kit.put('ashgrave_lean_to', x, z, { s: range(r, 0.95, 1.1), rot: face, variant: r() < 0.5 ? 0 : 1 })) {
      const fx = x + Math.sin(face) * 3;
      const fz = z + Math.cos(face) * 3;
      if (kit.put('bonfire', fx, fz, { s: 0.9 })) kit.emit('smoke', fx, fz);
    }
  };

  // the bodies first, all of them: the big forms
  for (const t of b.titans) lay(t);

  // then each ground's own details round them
  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    const zc = (bt.z0 + bt.z1) / 2;
    const own = b.titans.filter((t) => t.z <= bt.z0 + 10 && t.z > bt.z1 - 10 && (t.job === bt.kind || t.job === 'edge'));
    const mine = own.filter((t) => t.job === bt.kind);
    for (const t of own) shed(t, 6 + Math.floor(r() * 4));
    for (const c of b.craters) if (c.z <= bt.z0 && c.z > bt.z1) holeBits(c);
    switch (bt.kind) {
      case 'plain': {
        // the boundary: two plates stood on end either side of the way, the hand on them
        const z = bt.z1 + 10;
        const lx = b.lane(z);
        for (const sd of [-1, 1]) {
          const x = lx + sd * (LANE + 4.5);
          const p = kit.solid('ashgrave_boundary_plate', x, z, range(r, 0.95, 1.05), (r() - 0.5) * 0.25);
          if (p) p.variant = r() < 0.5 ? 0 : 1;
          kit.post(x + sd * 4, z + 3, 0, 'boundary');
        }
        // shed plates and a hole or two out on the ash
        for (let k = 0; k < 4; k++) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 16, HALF_W + 6);
          const z2 = range(r, bt.z1 + 4, bt.z0 - 4);
          kit.group(x, z2, { kinds: DEBRIS, n: 2 + Math.floor(r() * 3), spread: 3, big: 1.3, small: 0.6 });
        }
        break;
      }
      case 'breather': {
        kit.emit('devil', (r() - 0.5) * 40, zc);
        if (r() < 0.6) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 14, 28);
          kit.put('ashgrave_shed_plate', x, zc + (r() - 0.5) * len * 0.5, { s: range(r, 1.3, 1.6) });
        }
        break;
      }
      case 'reach': {
        const t = mine[0];
        if (!t) break;
        const sk = skeleton(t);
        const i = t.arms.findIndex((l) => l.end === 'reach');
        const { el, wr } = sk.arms[i];
        // flak on the wrist and the shoulder, looking down the way
        kit.post(lerp(el.x, wr.x, 0.6), lerp(el.z, wr.z, 0.6), 0, 'hand');
        kit.posts[kit.posts.length - 1].y = b.plain(wr.x, wr.z) - sink * t.s + 4.2 * t.s;
        onBack(t, 2, 0, 'hand');
        // the Hand clan: lean-tos in the crook of the arm, their fires
        const crook = { x: lerp(sk.arms[i].sh.x, el.x, 0.6), z: lerp(sk.arms[i].sh.z, el.z, 0.6) };
        for (const sd of [-1, 1]) camp(crook.x + sd * 1.5, crook.z + sd * 6, sd > 0 ? 0 : Math.PI);
        // and a crew up on its back, cutting
        cut(t, -3, (r() < 0.5 ? -1 : 1) * BODY_W * 0.45);
        // plates stacked by the wrist, ready to haul
        kit.put('ashgrave_plate_stack', lerp(el.x, wr.x, 0.4) + 1, lerp(el.z, wr.z, 0.4) + (r() < 0.5 ? -6 : 6), { s: 1, variant: Math.floor(r() * 3) });
        break;
      }
      case 'duel': {
        const [A, B] = mine;
        if (!A || !B) break;
        // the crossing's guns: on both their backs, facing the way
        onBack(B, 1, 0, 'duel');
        const kn = skeleton(A).legs[0].kn;
        kit.post(kn.x + 3, kn.z + 3, 0, 'duel');
        // their guns, thrown out
        for (const t of [A, B]) {
          const p = at(t, 4, (r() < 0.5 ? -1 : 1) * 22);
          if (clear(p.x, p.z, LANE + 4)) kit.put('ashgrave_titan_gun', p.x, p.z, { s: t.s, rot: r() * Math.PI * 2, variant: t.side, overlap: true });
        }
        // smoke still coming off the Compact's chest
        const c = at(A, 1.6, 0);
        kit.emit('smoke', c.x, c.z);
        break;
      }
      case 'rank': {
        // a gun on every other back, a clan's lean-to in the lee of one
        mine.forEach((t, k) => {
          if (k % 2 === 0) onBack(t, 2, 0, 'rank');
          if (r() < 0.35) {
            const sd = r() < 0.5 ? -1 : 1;
            const p = at(t, -4, sd * (BODY_W + 3));
            camp(p.x, p.z, -t.ang);
            // the camp's crew at work on the body above it
            if (r() < 0.6) cut(t, range(r, -6, 2), sd * BODY_W * 0.45);
          }
        });
        break;
      }
      case 'yard': {
        const t = mine[0];
        if (!t) break;
        // the gantry over the body
        const g = at(t, 2, 0);
        kit.set('ashgrave_scrap_gantry', 'span', 0, g.z, (r() - 0.5) * 0.06, 0);
        // crews cutting it up under the gantry and along its back
        for (const u of [range(r, -4, 0), range(r, 6, 10)]) cut(t, u, (r() < 0.5 ? -1 : 1) * BODY_W * 0.45);
        // its plates stacked in rows beside it, by size, on its far side from the way
        const out = Math.sign(t.x - b.lane(t.z)) || 1;
        for (let k = 0; k < 6; k++) {
          const u = -14 + k * 5;
          const p = at(t, u, 0);
          const x = p.x + out * (BODY_W + 6) * t.s;
          if (Math.abs(x) > HALF_W + 8) continue;
          const st = kit.put('ashgrave_plate_stack', x, p.z, { s: range(r, 0.95, 1.1), variant: k % 3, rot: -t.ang + (r() - 0.5) * 0.2 });
          if (st && k % 3 === 1) {
            kit.post(x, p.z + 2, 0, 'yard');
            kit.posts[kit.posts.length - 1].y = st.y + 3.6 * st.s;
          }
        }
        // the clan's shacks in its shade on the way's side, their fires
        for (let k = 0; k < 3; k++) {
          const p = at(t, -10 + k * 9, -out * (BODY_W + 3.5) * (t.ang > 0 ? 1 : -1));
          if (r() < 0.5) camp(p.x, p.z, out > 0 ? -Math.PI / 2 : Math.PI / 2);
          else if (clear(p.x, p.z)) kit.put('ashgrave_shack', p.x, p.z, { s: range(r, 0.9, 1.05) });
        }
        // the haul road's end: a truck hulk, scrap waiting
        for (let k = 0; k < 3; k++) {
          const z = range(r, bt.z1 + 6, bt.z0 - 6);
          const x = routeX(b.trail, z) + (r() < 0.5 ? -1 : 1) * 3.5;
          if (clear(x, z)) kit.group(x, z, { kinds: [['scrap_pile', 2], ['ashgrave_plate_stack', 1], ['ashgrave_cable_spill', 1]], n: 2, spread: 2.5, big: 1, small: 0.7 });
        }
        break;
      }
      case 'front': {
        // plates propped along the trenches as revetment, guns at the zig-zags' corners
        for (const tr of b.trenches) {
          if (tr.pts[0].z > bt.z0 || tr.pts[0].z <= bt.z1) continue;
          tr.pts.forEach((p, k) => {
            if (!clear(p.x, p.z, LANE)) return;
            if (k % 2 === 0) kit.put('ashgrave_shed_plate', p.x, p.z + 1.8, { s: range(r, 0.9, 1.1), rot: r() * 0.4 });
            if (k % 4 === 1 && Math.abs(p.x) < HALF_W - 4) kit.post(p.x, p.z - 2, 0, 'front');
          });
        }
        break;
      }
      case 'out': {
        // the Kneel, bowed over the way out, its knees out past one side, its fists the other
        const z = bt.z0 - 22;
        const lx = b.lane(z);
        const flip = r() < 0.5;
        // (the way's under its back: the open stretch from its knees to its fists is centred on x -4)
        const x = lx + (flip ? -4 : 4);
        const p = kit.set('ashgrave_kneel', 'giant', x, z, flip ? Math.PI : 0, r() < 0.5 ? 0 : 1);
        if (p) p.y = b.plain(x, z) - 0.4;
        for (const k of [-1, 1]) kit.post(x + (flip ? -1 : 1) * 31, z + k * 7, 0, 'kneel');
        break;
      }
    }
    // the clans' fires' smoke and the dust off the drifts, out at the sides
    for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= range(r, 10, 16)) {
      const x = (r() < 0.5 ? -1 : 1) * range(r, 16, HALF_W + 4);
      if (r() < 0.25) kit.emit('dust', x, z, 4, b.wind[0] > 0 ? 1 : -1);
    }
  }
}
