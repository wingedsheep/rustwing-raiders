/**
 * The Glass Craters: the Glassing's fire plan (docs/level-design.md, its layout row). In 244 L the
 * Compact's gunships glassed Sankven's plains to deny them to the Uukhvar, and they did it by the
 * book: a gun walked across the field, a salvo laid in ranks, the flagship's one great shot. So the
 * craters are where the plan put them, and a crossing reads as a sortie flown again. 166 years on
 * the sand's a dark crust baked hard; every bowl the guns dug deep enough holds a sheet of green
 * glass (the biome's water, set solid: see world-view's glass), its cracks still glowing in the
 * deep; and the ash blows in over it all from the graveyard.
 *
 * The bowls are the bones. A level is a crossing, in over the edge of the fire zone (the grey ash,
 * then the ruled line where the glassing starts, two of the Compact's ranging masts either side of
 * the way) and out over the gunship that did it, shot down at the end of its run and sunk in a lake
 * of its own glass, through three grounds (two, if the stretch is short):
 * - the walk: a gun walked up the field at a slant across the way, shot after shot of one size, the
 *   bowls run together into one glass gutter; now and then a second gunship's walk crossing it in
 *   an X off to one side, spires of fused glass where they cross. The gutters are the skaters';
 * - the salvo: a pattern laid in ruled ranks, bowls packed rim to rim like a honeycomb; one bowl
 *   missing where a shell never went off, the dud still standing in the sand in the clans' ring of
 *   warning stakes;
 * - the eye: the flagship's main gun, one bowl wider than the field: blocks heaped on its crest,
 *   rays thrown out over the crust, terraces slumped down its inner wall, a lake of glass on its
 *   floor with frozen ripples ringing a peak of glass spires; the way across the lake past the peak;
 * - the flow: the melt ran. Tongues of glass flowed down towards you and set, each with a levee of
 *   crust and ropy wrinkles bowed downhill across it, out of the hot crater they ran from;
 * - the column: an Uukhvar convoy caught on its road: the trucks in file, fused into puddles of
 *   glass where they stood, and behind each its flash shadow (the pale sand it kept from the
 *   flash), all thrown the one way from the strike's crater. The clans' trucks drive the road now;
 * - the cuttings: the Glass Law (the glass is everybody's): a big bowl's glazed wall quarried for
 *   lens-glass in rectangular cuts, the blocks stacked in rows, a derrick over the deepest cut, the
 *   Chikta's sail-barges drawn up on its lake, their lanterns lit.
 * And the ash for the whole crossing: swept (the crust bare, glass in every bowl), drifted (ash in
 * streaks downwind of every rim, the small bowls half filled), or buried (only the big bowls and
 * the gutters showing their glass, green eyes in the grey). Open crust between the grounds.
 */

import type { Beat, Bones, Kit, Layout, Route } from '../layout';
import { routeX } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smoothstep, weighted } from '../../util';

type Cover = 'swept' | 'drifted' | 'buried';

/** Each beat's length (world units). */
const LEN: Record<string, [number, number]> = {
  edge: [34, 40],
  open: [16, 22],
  walk: [56, 82],
  salvo: [56, 76],
  eye: [70, 84],
  flow: [56, 74],
  column: [58, 86],
  cuttings: [58, 74],
  gunship: [62, 70],
};

/** The crust's level. */
const PLAIN = 1.0;
/** The glass's (the biome's water level: planets.ts). */
const GLASS = -0.3;
/** Half the way kept open (over three ship widths across). */
const LANE = 8;
/** How far the ash fills the small bowls, by the year (0..1); how much of the crust it hides. */
const FILL: Record<Cover, number> = { swept: 0, drifted: 0.4, buried: 0.8 };
const DUST: Record<Cover, number> = { swept: 0.06, drifted: 0.22, buried: 0.45 };

/** The ground's own colours. */
const ASH = 0xa29e94;
const ASH_PALE = 0xb4b0a6;
const GLAZE = 0x2a4034;
const SKIRT = 0x7a6a52;
const CREST = 0x9c9580;
const SAND = 0xc8bc9e;
const ROAD = 0x726b5e;
const RUT = 0x3a3730;
const CUT = 0x173526;
const CUT_EDGE = 0x8ab8a0;

type BowlKind = 'shot' | 'walk' | 'salvo' | 'eye' | 'strike' | 'quarry' | 'source' | 'line';

/** A bowl the guns dug. */
interface Bowl {
  x: number;
  z: number;
  r: number;
  /** How deep its floor lies under the crust; how high its rim stands over it. */
  deep: number;
  rim: number;
  kind: BowlKind;
  /** Its ejecta tipped up round it (none on the inside of a salvo, where the rims are shared). */
  blocks: boolean;
}

/** A gun's walk: its line (near end first), its calibre, its bowls. */
interface Walk {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  bowls: Bowl[];
}

/** The melt's run: the spine from its source down to its toe (near end first), its half width there. */
interface Tongue {
  pts: { x: number; z: number; w: number }[];
}

/** A truck of the convoy where it stood, and which way its shadow's thrown. */
interface Wreck {
  x: number;
  z: number;
  heading: number;
  sx: number;
  sz: number;
}

/** The cuttings: its bowl, and the quarry's axis on the far side of it from the way. */
interface Quarry {
  bowl: Bowl;
  /** The way out from its middle to the cuts (unit), and along them. */
  ux: number;
  uz: number;
}

/** What the plan needs of the bones, beyond the toolkit's. */
interface Field extends Bones {
  cover: Cover;
  lane(z: number): number;
  bowls: Bowl[];
  walks: Walk[];
  tongues: Tongue[];
  wrecks: Wreck[];
  road: Route | null;
  quarry: Quarry | null;
  /** The salvo's missing bowl, the dud standing in it. */
  dud: { x: number; z: number } | null;
  /** The eye's peak. */
  peak: { x: number; z: number; r: number } | null;
  /** Where the gunship lies, nose up the field. */
  ship: { x: number; z: number; ang: number } | null;
  /** The edge: where the glassing starts (z at x = 0, and its slant), the masts either side of the way there. */
  line: number;
  lean: number;
  wind: [number, number];
}

/** Distance from (x, z) to the segment a-b, and how far along it (0..1). */
function seg(ax: number, az: number, bx: number, bz: number, x: number, z: number): [number, number] {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz || 1e-6;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / l2, 0, 1);
  return [Math.hypot(x - (ax + vx * t), z - (az + vz * t)), t];
}

/** Distance from (x, z) to a polyline (pts near to far), the piece's index and how far along it. */
function poly(pts: { x: number; z: number }[], x: number, z: number): [number, number, number] {
  let best = Infinity;
  let at = 0;
  let along = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (Math.min(a.z, b.z) - 14 > z || Math.max(a.z, b.z) + 14 < z) continue;
    const [d, t] = seg(a.x, a.z, b.x, b.z, x, z);
    if (d < best) {
      best = d;
      at = i;
      along = t;
    }
  }
  return [best, at, along];
}

export const glass: Layout = {
  bones(seed, z0, z1) {
    // (the seed scrambled first: neighbouring seeds' first draws run close together)
    const r = rng(Math.imul(seed * 7919 + Math.round(-z0) * 13 + 5, 0x9e3779b1) ^ 0x2545f491);
    const s = seed % 997;

    // the year's ash, and the wind that laid it (across the field, mostly)
    const cover = weighted(r, [['swept', 3], ['drifted', 4], ['buried', 3]] as const) as Cover;
    const wa = (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.1;
    const wind: [number, number] = [Math.cos(wa), Math.sin(wa)];

    // the grounds: three of the six, the walk or the eye always (they're the plan's own)
    const sig = r() < 0.5 ? 'walk' : 'eye';
    const rest = shuffle(r, ['walk', 'salvo', 'eye', 'flow', 'column', 'cuttings'].filter((g) => g !== sig));
    const pool = [sig, ...rest];
    const first = z0 > 0 ? z0 + 24 : 0;
    const total = z0 - z1 - Math.max(LEN.edge[0], first) - LEN.gunship[0];
    const want = (n: number) => pool.slice(0, n).reduce((a, k) => a + LEN[k][0], 0) + (n - 1) * LEN.open[0];
    const n = want(3) <= total ? 3 : want(2) <= total ? 2 : 1;
    const grounds = shuffle(r, pool.slice(0, n));

    // their lengths: each its least, and what's left shared out
    const seq = ['edge', ...grounds.flatMap((g, i) => (i ? ['open', g] : [g])), 'gunship'];
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
    // (whatever won't fit goes to the grounds that grow with their length, never to the breathers)
    if (spare > 0.5) {
      const soak = seq.map((k, i) => (k === 'walk' || k === 'salvo' || k === 'column' ? i : -1)).filter((i) => i >= 0);
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

    // the way through, wandering gently over the crust
    const k1 = r() * 100;
    const k2 = r() * 100;
    const x0 = (r() - 0.5) * 8;
    const lane = (z: number) => clamp(x0 + 9 * Math.sin(z * 0.014 + k1) + 3 * Math.sin(z * 0.039 + k2), -13, 13);

    const bowls: Bowl[] = [];
    const walks: Walk[] = [];
    const tongues: Tongue[] = [];
    const wrecks: Wreck[] = [];
    const routes: Route[] = [];
    let road: Route | null = null;
    let quarry: Quarry | null = null;
    let dud: Field['dud'] = null;
    let peak: Field['peak'] = null;
    let ship: Field['ship'] = null;
    let line = 0;
    let lean = 0;
    const bowl = (x: number, z: number, rad: number, kind: BowlKind, deep: number, rim: number, blocks = true) => {
      const b: Bowl = { x, z, r: rad, deep, rim, kind, blocks };
      bowls.push(b);
      return b;
    };
    /** Room for a lone bowl: clear of the way and of the others. */
    const room = (x: number, z: number, R: number, m = 1) => Math.abs(x - lane(z)) > LANE + R * 0.6 + m && bowls.every((c) => Math.hypot(c.x - x, c.z - z) > c.r + R + m);
    /** A gun's walk from (ax, az) to (bx, bz): its shots one calibre, run together. */
    const walk = (ax: number, az: number, bx: number, bz: number, R: number) => {
      const w: Walk = { ax, az, bx, bz, r: R, bowls: [] };
      const L = Math.hypot(bx - ax, bz - az);
      // (the first a ranging shot, smaller; the gun found its range and walked on, the shots
      // closing up; as it stopped, a little ragged)
      for (let d = 0; d <= L; ) {
        const t = d / L;
        const rr = R * (d === 0 ? 0.7 : 1) * range(r, 0.93, 1.06);
        const px = lerp(ax, bx, t) + (r() - 0.5) * 0.8;
        const pz = lerp(az, bz, t) + (r() - 0.5) * 0.8;
        w.bowls.push(bowl(px, pz, rr, 'walk', range(r, 2.2, 2.6), 0.75));
        d += R * (t > 0.85 ? range(r, 1.3, 1.6) : range(r, 1.05, 1.25));
      }
      walks.push(w);
      // its gutter, for the skaters: down it towards you (near end first)
      const pts: { x: number; z: number }[] = [];
      const [nx, nz, fx, fz] = az > bz ? [ax, az, bx, bz] : [bx, bz, ax, az];
      for (let k = 0; k <= 24; k++) pts.push({ x: lerp(nx, fx, k / 24), z: lerp(nz, fz, k / 24) });
      routes.push({ kind: 'glass', pts });
      return w;
    };

    for (const b of beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      const sd = b.side;
      switch (b.kind) {
        case 'edge': {
          // the ruled line where the glassing starts, a little slanted; the ranging shots along it,
          // either side of the way, the first of the plan's
          line = b.z1 + len * range(r, 0.3, 0.38);
          lean = (r() - 0.5) * 0.12;
          for (let x = -HALF_W - 4; x < HALF_W + 4; x += range(r, 9, 12)) {
            const zz = line + lean * x - range(r, 3, 5);
            const R = range(r, 2.4, 3.2);
            if (Math.abs(x - lane(zz)) > LANE + 6 + R) bowl(x, zz, R, 'line', 1.6, 0.5);
          }
          break;
        }
        case 'walk': {
          // up the field at a slant, across the way once; its calibre the gunship's
          const R = range(r, 3.6, 4.4);
          const zx = b.z0 - len * range(r, 0.4, 0.6);
          const lx = lane(zx);
          const tilt = sd * range(r, 0.34, 0.5);
          const half = (len - 10) / 2;
          walk(lx - Math.tan(tilt) * half, zx + half, lx + Math.tan(tilt) * half, zx - half, R);
          // a second gunship's walk crossing it in an X out to one side of the way, where the
          // first is well off it (the heat ran deepest where they cross: the spires stand there)
          if (r() < 0.6) {
            const k = r() < 0.5 ? 1 : -1;
            const zc2 = zx - k * half * range(r, 0.7, 0.85);
            const cx = lx + Math.tan(tilt) * (zx - zc2);
            if (Math.abs(cx - lane(zc2)) > LANE + 3) {
              const t2 = -tilt * range(r, 1.1, 1.5);
              const h2 = half * range(r, 0.55, 0.7);
              const w2 = walk(cx - Math.tan(t2) * h2, zc2 + h2, cx + Math.tan(t2) * h2, zc2 - h2, range(r, 3.0, 3.4));
              (w2 as Walk & { cross?: { x: number; z: number } }).cross = { x: cx, z: zc2 };
            }
          }
          break;
        }
        case 'salvo': {
          // ruled ranks, packed rim to rim (a honeycomb), turned a little off the field's line
          const R = range(r, 3.2, 3.7);
          const sp = R * 2 * 0.94;
          const rot = (r() - 0.5) * 0.3;
          const c = Math.cos(rot);
          const sn = Math.sin(rot);
          const zs = b.z0 - 8;
          const ze = b.z1 + 8;
          const ox = lane(zc);
          const rows = Math.floor((zs - ze) / (sp * 0.866));
          const cells: { x: number; z: number; edge: boolean }[] = [];
          for (let j = 0; j <= rows; j++)
            for (let i = -12; i <= 12; i++) {
              const u = (i + (j & 1 ? 0.5 : 0)) * sp;
              const v = -j * sp * 0.866;
              const x = ox + u * c - v * sn;
              const zz = zs + u * sn + v * c;
              if (Math.abs(x) > HALF_W + 8 || zz > zs + 2 || zz < ze - 2) continue;
              cells.push({ x, z: zz, edge: j === 0 || j === rows || Math.abs(x) > HALF_W + 2 });
            }
          // the dud: one never went off, off the way, near enough to be seen
          const cand = cells.filter((q) => !q.edge && Math.abs(q.x - lane(q.z)) > LANE + 4 && Math.abs(q.x - lane(q.z)) < 22);
          const d = cand.length ? cand[Math.floor(r() * cand.length)] : null;
          if (d) dud = { x: d.x, z: d.z };
          // the spread: deep where it fell thickest, in its middle (those hold glass), shallow and
          // ash-choked out at its edges; here and there two shells in one cell
          const mz = (zs + ze) / 2;
          const far = Math.max(...cells.map((q) => Math.hypot((q.x - ox) / 1.4, q.z - mz)), 1);
          for (const q of cells) {
            if (q === d) continue;
            // (its first and last ranks ragged: the pattern's edge, a few short)
            if (q.edge && r() < 0.3) continue;
            const f = Math.hypot((q.x - ox) / 1.4, q.z - mz) / far;
            const deep = lerp(2.7, 0.9, smoothstep(0.15, 0.95, f)) * range(r, 0.85, 1.1);
            const R1 = R * range(r, 0.88, 1.1);
            const x = q.x + (r() - 0.5) * 1.2;
            const z = q.z + (r() - 0.5) * 1.2;
            bowl(x, z, R1, 'salvo', deep, 0.6 + 0.25 * (1 - f), q.edge);
            if (!q.edge && r() < 0.13) {
              const a = r() * Math.PI * 2;
              bowl(x + Math.cos(a) * R1 * 0.55, z + Math.sin(a) * R1 * 0.55, R1 * range(r, 0.6, 0.72), 'salvo', deep * 0.8, 0.5, false);
            }
          }
          break;
        }
        case 'eye': {
          // the great bowl: its peak beside the way, the way across its lake
          const R = range(r, 33, 37);
          const zc2 = zc + range(r, -3, 3);
          const px = lane(zc2) + sd * range(r, 13, 15);
          bowl(px, zc2, R, 'eye', 3.4, 2.4);
          peak = { x: px, z: zc2, r: range(r, 4.5, 5.5) };
          break;
        }
        case 'flow': {
          // the hot crater the melt came out of, off to one side up the field; its tongue down
          // towards you across the way, splitting into lobes at its toe
          const zs = b.z1 + range(r, 12, 16);
          const xs = sd * range(r, HALF_W - 6, HALF_W + 2);
          bowl(xs, zs, range(r, 8, 9.5), 'source', 3.2, 1.4);
          const toe = b.z0 - range(r, 8, 12);
          const xt = lane(toe) - sd * range(r, 6, 12);
          const main: Tongue = { pts: [] };
          const N = 18;
          for (let k = N; k >= 0; k--) {
            const t = k / N;
            // (from the source (t 1) to the toe (t 0), bending as it ran across the slope)
            const zz = lerp(toe, zs, t);
            const bend = Math.sin(t * Math.PI) * sd * range(r, 3, 6) + Math.sin(t * Math.PI * 3 + s) * 2.2;
            main.pts.push({ x: lerp(xt, xs, t ** 1.3) + bend + (noise2(t * 3, 1.7, s) - 0.5) * 3, z: zz, w: lerp(7.5, 4.5, t) });
          }
          // (near end first)
          main.pts.reverse();
          tongues.push(main);
          // the toe's lobes: one or two split off its last stretch
          for (let k = 0; k < 1 + (r() < 0.6 ? 1 : 0); k++) {
            const at = main.pts[Math.floor(main.pts.length * range(r, 0.15, 0.35))];
            const way = (k ? -1 : 1) * (r() < 0.5 ? -1 : 1);
            const L = range(r, 12, 18);
            const lobe: Tongue = { pts: [] };
            for (let q = 0; q <= 6; q++) {
              const t = q / 6;
              lobe.pts.push({ x: at.x + way * L * 0.7 * t, z: at.z + L * t * 0.75, w: lerp(at.w * 0.8, 4.2, t) });
            }
            // (near end first)
            lobe.pts.reverse();
            tongues.push(lobe);
          }
          // its run down, for the skaters (near end first)
          routes.push({ kind: 'glass', pts: main.pts.map((p) => ({ x: p.x, z: p.z })) });
          break;
        }
        case 'column': {
          // the road beside the way, the strike's crater out past it, the trucks in file between
          const off = sd * range(r, 12, 15);
          const pts: { x: number; z: number }[] = [];
          for (let zz = b.z0 + 6; zz >= b.z1 - 6; zz -= 2) pts.push({ x: lane(zz) * 0.6 + off + (fbm(zz * 0.03, 2.2, s) - 0.5) * 3, z: zz });
          road = { kind: 'road', pts };
          routes.push(road);
          const zsk = zc + range(r, -len * 0.15, len * 0.15);
          const xsk = routeX(road, zsk) + sd * range(r, 13, 17);
          const strike = bowl(xsk, zsk, range(r, 8, 10), 'strike', 2.8, 1.3);
          // the trucks, nose to tail as they were driving (towards you or away), a gap now and then
          const way = r() < 0.5 ? 1 : -1;
          for (let zz = b.z0 - range(r, 6, 10); zz > b.z1 + 6; zz -= range(r, 7.5, 9.5)) {
            if (r() < 0.15) continue;
            const x = routeX(road, zz) + (r() - 0.5) * 0.6;
            if (Math.hypot(x - strike.x, zz - strike.z) < strike.r + 3) continue;
            const dx = x - strike.x;
            const dz = zz - strike.z;
            const l = Math.hypot(dx, dz) || 1;
            // (its heading as a turn of the model, built nose up the screen: see colsAt)
            const fx = routeX(road, zz - way * 2) - x;
            const fz = -way * 2;
            wrecks.push({ x, z: zz, heading: Math.atan2(-fx, -fz) + (r() - 0.5) * 0.2, sx: dx / l, sz: dz / l });
          }
          break;
        }
        case 'cuttings': {
          // a big bowl the way runs over the near rim of; the cuts in its far wall
          const R = range(r, 18, 21);
          const zq = zc + range(r, -4, 4);
          const x = lane(zq) + sd * R * range(r, 0.62, 0.72);
          const q = bowl(x, zq, R, 'quarry', 3.0, 1.2);
          const a = Math.atan2(range(r, -0.5, 0.5), sd);
          quarry = { bowl: q, ux: Math.cos(a), uz: Math.sin(a) };
          break;
        }
        case 'open': {
          // a lone shot off to one side, now and then
          if (r() < 0.75) {
            const zz = zc + (r() - 0.5) * len * 0.3;
            const x = lane(zz) - sd * range(r, 17, 26);
            const R = range(r, 3.2, 4.4);
            if (room(x, zz, R)) bowl(x, zz, R, 'shot', 2.0, 0.7);
          }
          break;
        }
        case 'gunship': {
          // the gunship came down at the end of its run and slid up the field, ploughing a furrow
          // of glass behind it; it lies beside the way, nose up the field, and past its nose a
          // run-out of plain crust hands the field to the next land (its nose 12 short of the end,
          // so neither it nor its lake is blended away into the next)
          const zs = b.z1 + range(r, 34, 38);
          const x = lane(zs) + sd * range(r, 15, 18);
          const ang = -Math.PI / 2 + sd * range(r, 0.05, 0.25);
          ship = { x, z: zs, ang };
          bowl(x, zs, 11, 'strike', 2.2, 1.0, false);
          // its furrow: back the way it slid, out to the field's edge
          const pts: { x: number; z: number }[] = [];
          for (let k = 0; k <= 12; k++) {
            const t = k / 12;
            pts.push({ x: x + sd * t * range(r, 6, 8) - Math.cos(ang) * t * 34, z: zs - Math.sin(ang) * t * 34 });
          }
          // (near end first)
          pts.reverse();
          routes.push({ kind: 'glass', pts });
          tongues.push({ pts: pts.map((p, k) => ({ ...p, w: lerp(2.6, 3.6, k / pts.length) })) });
          // the gunship's own shots, the last few, walked short of where it fell
          const zb = b.z0 - range(r, 6, 10);
          for (let k = 0; k < 3; k++) {
            const xx = -sd * range(r, 14, 30);
            const zz = zb - k * range(r, 7, 10);
            const R = range(r, 3, 3.8);
            if (room(xx, zz, R)) bowl(xx, zz, R, 'shot', 2.2, 0.7);
          }
          break;
        }
      }
    }
    // and now and then a short burst off the plan out at a field's edge (a gun ranging), two or
    // three shots in a line, where the grounds leave room
    for (const b of beats) {
      if (b.kind !== 'column' && b.kind !== 'flow' && b.kind !== 'cuttings') continue;
      if (r() < 0.4) continue;
      const sd = -b.side;
      const zz = range(r, b.z1 + 10, b.z0 - 10);
      const a = range(r, -0.6, 0.6);
      const R = range(r, 2.6, 3.2);
      for (let k = 0; k < 2 + (r() < 0.5 ? 1 : 0); k++) {
        const x = sd * range(r, HALF_W - 4, HALF_W) + Math.sin(a) * k * R * 1.9;
        const z2 = zz - Math.cos(a) * k * R * 1.9;
        if (room(x, z2, R, 0.5)) bowl(x, z2, R, 'shot', 1.9, 0.6);
      }
    }

    // (the bowls bucketed by z, to find the ones near a point quickly)
    const reach = (c: Bowl) => c.r * (c.kind === 'eye' ? 1.45 : 1.9);
    const bucket = new Map<number, Bowl[]>();
    const near = (z: number) => {
      const k = Math.floor(z / 8);
      let got = bucket.get(k);
      if (!got) bucket.set(k, (got = bowls.filter((c) => Math.abs(c.z - (k * 8 + 4)) < reach(c) + 6)));
      return got;
    };
    const fill = FILL[cover];
    /** How deep a bowl's floor really is: the year's ash fills the small ones (never the gutters). */
    const depth = (c: Bowl) =>
      c.kind === 'salvo'
        ? // (the spread's deep middle keeps its glass whatever the years drifted in; its edge fills)
          c.deep * (1 - fill * (1 - smoothstep(1.7, 2.3, c.deep)))
        : c.kind === 'shot' || c.kind === 'line'
          ? c.deep * (1 - fill * (1 - smoothstep(3, 6, c.r)))
          : c.deep;

    /** The crust: nearly level, heaved a little; under the edge's ash, gently rolling. */
    const plain = (x: number, z: number) => PLAIN + (fbm(x * 0.04, z * 0.04, s) - 0.5) * 0.5;

    /** A bowl's profile at t (its distance over its radius): the floor, the wall, the rim and the blanket thrown out. */
    const profile = (c: Bowl, t: number, x: number, z: number) => {
      const D = depth(c);
      if (c.kind === 'eye') {
        if (t > 1) return c.rim * Math.exp(-(((t - 1) / 0.16) ** 2)) + 0.5 * c.rim * Math.exp(-(t - 1) * 3.5);
        // the inner wall slumped in terraces; the floor a lake, frozen ripples ringing the peak
        const wall = smoothstep(0.52, 1, t);
        // (each riser eased over half a step, so the glass meets it in a curve, not the grid's stairs)
        const steps = (Math.floor(wall * 4) + smoothstep(0.25, 0.75, wall * 4 - Math.floor(wall * 4))) / 4;
        const terr = lerp(wall, steps, 0.6);
        // (up to the crest's full height, the blanket's and the rim's, so the wall meets it without a step)
        let h = -D + (D + 1.5 * c.rim) * terr ** 1.2;
        if (t < 0.56 && peak) {
          const dp = Math.hypot(x - peak.x, z - peak.z);
          // the peak
          if (dp < peak.r * 1.8) h = Math.max(h, -D + (D + 0.9) * (1 - smoothstep(peak.r * 0.7, peak.r * 1.8, dp)));
          // the ripples: thin rings of crust just breaking the glass
          const ring = (dp - peak.r * 1.6) / 4.2;
          const f = ring - Math.floor(ring);
          if (ring > 0 && ring < 5 && Math.abs(f - 0.5) < 0.07) h = Math.max(h, GLASS - PLAIN + 0.12);
        }
        return h;
      }
      if (t > 1) {
        // the rim, and its blanket out over the crust (a salvo's inner ones meet in ridges)
        const w = c.kind === 'salvo' ? 0.22 : 0.3;
        return c.rim * Math.exp(-(((t - 1) / w) ** 2)) + (c.blocks ? 0.18 * c.rim * Math.exp(-(t - 1) * 2.5) : 0);
      }
      // the bowl: a floor in the middle, the wall steepening up under the rim
      return -D + (D + c.rim) * smoothstep(c.kind === 'quarry' ? 0.45 : 0.3, 1, t) ** 1.5;
    };

    /** The quarry's cuts at (x, z): whether it's in one (its cell's local u, v) and how deep. */
    const cutAt = (x: number, z: number): { cut: boolean; edge: boolean } | null => {
      if (!quarry) return null;
      const q = quarry;
      const c = q.bowl;
      const dx = x - c.x;
      const dz = z - c.z;
      const t = Math.hypot(dx, dz) / c.r;
      if (t < 0.72 || t > 1.02) return null;
      // (only on the far side from the way, round its axis)
      const along = (dx * q.ux + dz * q.uz) / Math.hypot(dx, dz);
      if (along < 0.25) return null;
      const u = dx * -q.uz + dz * q.ux;
      const v = dx * q.ux + dz * q.uz;
      const cu = (u / 3.4) - Math.floor(u / 3.4);
      const cv = (v / 2.4) - Math.floor(v / 2.4);
      const edge = cu < 0.16 || cv < 0.2;
      // (a few cells left standing, the cuts' rows ragged)
      const keep = noise2(Math.floor(u / 3.4) * 1.7, Math.floor(v / 2.4) * 2.3, s + 31) < 0.3;
      return { cut: !keep && !edge, edge: edge && !keep };
    };

    /** The melt's tongues at (x, z): how far inside one (0 at its edge), its levee, its wrinkles. */
    const tongueAt = (x: number, z: number): { h: number } | null => {
      let best: { h: number } | null = null;
      for (const tg of tongues) {
        const [d, i, a] = poly(tg.pts, x, z);
        const p = tg.pts[i];
        const q = tg.pts[Math.min(i + 1, tg.pts.length - 1)];
        const w = lerp(p.w, q.w, a) * (0.92 + 0.16 * noise2(x * 0.2, z * 0.2, s + 5));
        if (d > w + 2.5) continue;
        // (how far down it: 0 at its toe, 1 at its head)
        const down = (i + a) / Math.max(1, tg.pts.length - 1);
        let h: number;
        if (d < w) {
          // the sheet: deeper (hotter) near the source, a crust of ropy wrinkles bowed down it
          const sheet = GLASS - PLAIN - lerp(0.35, 1.4, down);
          // (each a crust of the melt's skin, pushed into a bow as the sheet ran on under it)
          const k = (i + a) * 0.85 - ((d / w) ** 2) * 1.3 + (noise2(x * 0.15, z * 0.15, s + 3) - 0.5) * 0.3;
          const f = k - Math.floor(k);
          const wr = Math.abs(f - 0.5) < 0.15 && d < w * 0.88 ? GLASS - PLAIN + 0.14 : -9;
          h = Math.max(sheet, wr);
        } else {
          // the levee: crust heaped at its edge
          h = 0.5 * Math.exp(-(((d - w - 1.1) / 1.2) ** 2));
        }
        if (!best || h < best.h) best = { h };
      }
      return best;
    };

    const height = (x: number, z: number) => {
      let h = plain(x, z);
      // inside any bowl: the deepest floor there (a later shot cuts through an older rim); outside: the highest rim's blanket
      let inside = Infinity;
      let out = 0;
      for (const c of near(z)) {
        const d = Math.hypot(x - c.x, z - c.z);
        if (d > reach(c)) continue;
        const t = (d + (noise2(x * 0.25, z * 0.25, s + 7) - 0.5) * Math.min(1.2, c.r * 0.1)) / c.r;
        const p = profile(c, t, x, z);
        if (t <= 1) inside = Math.min(inside, p);
        else out = Math.max(out, p);
      }
      h += inside < Infinity ? inside : out;
      const tg = tongueAt(x, z);
      if (tg) h = tg.h < 0 ? Math.min(h, PLAIN + tg.h) : h + tg.h;
      // the quarry's cuts: rectangular steps into its glazed wall
      const ct = cutAt(x, z);
      if (ct?.cut) h -= 0.5;
      // the convoy's trucks each sunk in a puddle of glass
      for (const w of wrecks) {
        const d = Math.hypot(x - w.x, z - w.z);
        if (d < 4.2) h = Math.min(h, lerp(GLASS - 0.5, h, smoothstep(2.4, 4.2, d)));
      }
      return h;
    };

    const stain = (x: number, z: number): [number, number] | null => {
      // the edge: grey ash out past the line, the crust baked dark beyond it
      const eb = beats[0];
      if (z <= eb.z0 && z > eb.z1) {
        const past = z - (line + lean * x) + (noise2(x * 0.3, 0.5, s) - 0.5) * 1.5;
        if (past > 0) return [past > 1.2 ? ASH : 0x5a564e, past > 1.2 ? 0.85 : 0.6];
      }
      // the convoy: each truck's flash shadow, the pale sand it kept, thrown away from the strike
      for (const w of wrecks) {
        const dx = x - w.x;
        const dz = z - w.z;
        const along = dx * w.sx + dz * w.sz;
        if (along < 0.5 || along > 11) continue;
        const across = Math.abs(dx * -w.sz + dz * w.sx);
        const wide = 1.6 + along * 0.08;
        if (across < wide) return [SAND, 0.75 * (1 - smoothstep(wide * 0.75, wide, across)) * (1 - smoothstep(7, 11, along))];
      }
      // the road: packed pale, two ruts
      if (road && z <= road.pts[0].z && z >= road.pts[road.pts.length - 1].z) {
        const d = Math.abs(x - routeX(road, z));
        if (d < 2.2) return Math.abs(d - 1.2) < 0.32 ? [RUT, 0.55] : [ROAD, 0.5 * (1 - smoothstep(1.6, 2.2, d))];
      }
      // the quarry's cuts: dark glass in their floors, their edges cut pale
      const ct = cutAt(x, z);
      if (ct?.cut) return [CUT, 0.85];
      if (ct?.edge) return [CUT_EDGE, 0.35];
      // the bowls: their walls glazed dark, a pale crest, the heat's brown skirt round the big ones,
      // the eye's rays out over the crust; the ash lying in each one's lee
      for (const c of near(z)) {
        const dx = x - c.x;
        const dz = z - c.z;
        const d = Math.hypot(dx, dz);
        const big = c.kind === 'eye' ? 1.6 : c.kind === 'shot' || c.kind === 'salvo' || c.kind === 'line' ? 1.5 : 1.9;
        if (d > c.r * big) continue;
        const t = d / c.r + (noise2(x * 0.3, z * 0.3, s + 9) - 0.5) * 0.08;
        // (a shallow cell of the salvo's edge choked with ash)
        if (c.kind === 'salvo' && c.deep < 1.4 && t < 0.7) return [ASH_PALE, 0.6 * (1 - smoothstep(0.5, 0.7, t)) * (1 - smoothstep(1.0, 1.4, c.deep))];
        if (t < 0.97) return [GLAZE, 0.6 * smoothstep(0.3, 0.6, t) * (1 - smoothstep(0.85, 0.97, t))];
        if (t < 1.1) return [CREST, 0.5];
        const lee = (dx * wind[0] + dz * wind[1]) / Math.max(d, 0.01);
        if (lee > 0.3 && DUST[cover] > 0.1) {
          const k = (1 - smoothstep(1.1, big, t)) * smoothstep(0.3, 0.8, lee) * DUST[cover] * 1.4;
          if (k > 0.05) return [ASH_PALE, Math.min(0.85, k)];
        }
        if (c.kind === 'eye') {
          // rays: streaks of pale ejecta flung out from it
          const a = Math.atan2(dz, dx);
          const ray = noise2(a * 9, 1.3, s + 21);
          if (ray > 0.62) return [ASH_PALE, 0.5 * smoothstep(0.62, 0.75, ray) * (1 - smoothstep(1.1, 1.6, t))];
        }
        if (c.kind !== 'salvo' && c.kind !== 'shot' && c.kind !== 'line') return [SKIRT, 0.4 * (1 - smoothstep(1.1, big, t))];
      }
      // the ash over the crust: streaks along the wind, thicker the more there is
      const dust = DUST[cover];
      if (dust > 0) {
        const u = x * wind[0] + z * wind[1];
        const v = -x * wind[1] + z * wind[0];
        const k = fbm(u * 0.022, v * 0.07, s + 13) + (noise2(u * 0.12, v * 0.3, s + 14) - 0.5) * 0.08;
        const a = smoothstep(0.6 - dust * 0.35, 0.72 - dust * 0.25, k) * Math.min(0.75, 0.2 + dust);
        if (a > 0.03) return [ASH, a];
      }
      return null;
    };

    const bones: Field = { height, stain, routes, lines: [], beats, cover, lane, bowls, walks, tongues, wrecks, road, quarry, dud, peak, ship, line, lean, wind };
    return bones;
  },

  plan(kit, bones) {
    plan(kit, bones as Field);
  },
};

function plan(kit: Kit, b: Field) {
  const r = kit.r;
  /** Off the way through. */
  const clear = (x: number, z: number, m = LANE) => Math.abs(x - b.lane(z)) > m;
  const inBeat = (z: number) => z <= kit.z0 && z > kit.z1;

  /** A bowl's ejecta: blocks tipped up round its rim, outward, the biggest nearest the rim. */
  const ejecta = (c: Bowl, n: number, big: number) => {
    const a0 = r() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      const t = c.kind === 'eye' ? range(r, 1.02, 1.22) : range(r, 1.05, 1.32);
      const x = c.x + Math.cos(a) * c.r * t;
      const z = c.z + Math.sin(a) * c.r * t;
      if (!clear(x, z, LANE - 1) || !inBeat(z)) continue;
      // (inside a walk, none on its neighbours' bowls: the gutter's lips only)
      if (b.bowls.some((o) => o !== c && o.kind === c.kind && (c.kind === 'walk' || c.kind === 'salvo') && Math.hypot(x - o.x, z - o.z) < o.r * 1.05)) continue;
      // tipped outward: its long side across the way out (rot turns about y; facing a)
      kit.put('ashgrave_glass_ejecta', x, z, { s: big * 1.5 * lerp(1, 0.6, (t - 1.02) / 0.3) * range(r, 0.85, 1.15), rot: -a + (r() - 0.5) * 0.4 });
    }
  };

  /** A bowl's details: fulgurite roots dug out at its foot, glass splashed out of it, casings. */
  const feet = (c: Bowl, n: number) => {
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI * 2;
      const t = range(r, 1.5, 2.1);
      const x = c.x + Math.cos(a) * c.r * t;
      const z = c.z + Math.sin(a) * c.r * t;
      if (!clear(x, z, LANE - 1)) continue;
      if (r() < 0.55) kit.put('ashgrave_fulgurite_root', x, z, { s: range(r, 0.8, 1.15) });
      else kit.put('ashgrave_glass_crust', x, z, { s: range(r, 0.7, 1.0), rot: -a, variant: 0 });
    }
  };

  /** Glass spires where the heat ran deepest; `tall`: some reach the flight line (a needle you'd hit). */
  const spires = (x: number, z: number, n: number, spread: number, tall: number) => {
    const out: { x: number; z: number }[] = [];
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) {
      const a = r() * Math.PI * 2;
      const d = k === 0 ? 0 : range(r, spread * 0.3, spread);
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (!inBeat(pz)) continue;
      // (the tall ones first; where they won't fit, on to the rest)
      if (k < tall && tries < tall * 5) {
        if (!clear(px, pz, LANE + 3.5)) continue;
        if (!kit.free(px, pz, 2)) continue;
        if (kit.solid('ashgrave_glass_needle', px, pz, range(r, 0.95, 1.1), r() * Math.PI * 2)) {
          out.push({ x: px, z: pz });
          k++;
        }
        continue;
      }
      if (!clear(px, pz, LANE - 1)) continue;
      if (kit.put('ashgrave_glass_spire', px, pz, { s: lerp(1.2, 0.6, k / n) * range(r, 0.85, 1.1) })) k++;
    }
    return out;
  };

  /** A gun dug in at (x, z), up on whatever's there. */
  const gun = (x: number, z: number, guards: string, y?: number) => {
    if (!inBeat(z) || Math.abs(x) > HALF_W - 3) return;
    kit.post(x, z, 0, guards);
    if (y !== undefined) kit.posts[kit.posts.length - 1].y = y;
  };

  // the big forms first: the gunship, the masts, the convoy, the derrick, the needles
  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    const zc = (bt.z0 + bt.z1) / 2;
    switch (bt.kind) {
      case 'edge': {
        // the ranging masts either side of the way, on the line
        const lean = b.lean;
        for (const sd of [-1, 1]) {
          const zm = b.line - 1;
          const x = b.lane(zm) + sd * (LANE + 4.5);
          const p = kit.solid('ashgrave_glass_mast', x, zm + lean * x, range(r, 0.95, 1.05), (r() - 0.5) * 0.3);
          if (p) p.variant = sd < 0 ? 0 : 1;
          gun(x + sd * 5, zm + lean * x + 2, 'mast');
        }
        // out on the ash before it: the graveyard's leavings drifting in, a plate, a casing
        for (let k = 0; k < 5; k++) {
          const x = (r() < 0.5 ? -1 : 1) * range(r, 15, HALF_W + 6);
          const z = range(r, b.line + 6, bt.z0 - 4);
          if (clear(x, z)) kit.group(x, z, { kinds: [['ashgrave_shed_plate', 3], ['ashgrave_shell_casing', 2]], n: 2 + Math.floor(r() * 2), spread: 2.5, big: 1.2, small: 0.6 });
        }
        break;
      }
      case 'gunship': {
        if (!b.ship) break;
        // (built nose along +x: turned to its heading as the titans' parts are)
        const p = kit.set('ashgrave_glass_gunship', 'giant', b.ship.x, b.ship.z, -b.ship.ang, 0) ?? kit.set('ashgrave_glass_ship', 'giant', b.ship.x, b.ship.z, -b.ship.ang, 0);
        if (p) p.y = GLASS - 0.4;
        // guns on its back, and at its nose
        const [dx, dz] = [Math.cos(b.ship.ang), Math.sin(b.ship.ang)];
        gun(b.ship.x - dx * 6, b.ship.z - dz * 6, 'gunship', 5.5);
        gun(b.ship.x + dx * 9, b.ship.z + dz * 9, 'gunship', 4.5);
        // smoke still coming off its engines
        kit.emit('smoke', b.ship.x - dx * 14, b.ship.z - dz * 14);
        // the crust it shoved up ahead of its nose as it slid, a bow wave of slabs heaved up and
        // tipped away from it; past that, plates torn off its hull and flung on ahead
        // (an arc round a point inside the nose, so it wraps the nose's tip and flanks)
        const nx = b.ship.x + dx * 16;
        const nz = b.ship.z + dz * 16;
        for (let k = 0; k < 9; k++) {
          const a = b.ship.ang + (k / 8 - 0.5) * 2.4 + (r() - 0.5) * 0.15;
          const d = range(r, 7, 8.5);
          const x = nx + Math.cos(a) * d;
          const z = nz + Math.sin(a) * d;
          if (!clear(x, z, LANE - 1) || !inBeat(z)) continue;
          kit.put('ashgrave_glass_ejecta', x, z, { s: range(r, 1.6, 2.1) * (1 - 0.35 * Math.abs(k / 8 - 0.5)), rot: -a + (r() - 0.5) * 0.3, overlap: true });
        }
        for (let k = 0; k < 3; k++) {
          const a = b.ship.ang + (r() - 0.5) * 0.9;
          const d = range(r, 14, 21);
          const x = nx + Math.cos(a) * d;
          const z = nz + Math.sin(a) * d;
          if (!clear(x, z, LANE - 1) || !inBeat(z)) continue;
          kit.put('ashgrave_shed_plate', x, z, { s: range(r, 0.9, 1.2), rot: r() * Math.PI * 2 });
        }
        break;
      }
      case 'column': {
        // the convoy, each truck in its puddle of glass, its kind by turn: a hauler, a half-track, a tanker
        b.wrecks.forEach((w, k) => {
          if (!inBeat(w.z)) return;
          const p = kit.put('ashgrave_glass_convoy', w.x, w.z, { s: range(r, 0.95, 1.05), rot: w.heading, variant: [0, 1, 0, 2][k % 4], overlap: true });
          if (p) kit.claim(w.x, w.z, 3.5);
          // the clans' guns up on every other hulk
          if (p && k % 3 === 1) gun(w.x, w.z, 'convoy', p.y + 2.6);
        });
        break;
      }
    }
    void len;
    void zc;
  }

  // then each ground's own forms and details
  for (const bt of kit.beats) {
    const len = bt.z0 - bt.z1;
    const zc = (bt.z0 + bt.z1) / 2;
    const mine = b.bowls.filter((c) => c.z <= bt.z0 && c.z > bt.z1);
    switch (bt.kind) {
      case 'walk': {
        for (const w of b.walks) {
          if (!w.bowls.some((c) => c.z <= bt.z0 && c.z > bt.z1)) continue;
          // the gutter's lips: blocks along both sides, roots and splashes at their feet
          for (const c of w.bowls) {
            ejecta(c, 5, 1.0);
            if (r() < 0.5) feet(c, 1);
          }
          // the spires where two walks cross
          const cross = (w as Walk & { cross?: { x: number; z: number } }).cross;
          if (cross) spires(cross.x, cross.z, 7, 5, 2);
          // a gun on a lip with a view down the way, every few shots, out to the sides
          w.bowls.forEach((c, k) => {
            const off = Math.abs(c.x - b.lane(c.z));
            if (k % 3 === 1 && off > 12 && off < 28) gun(c.x + Math.sign(c.x - b.lane(c.z)) * c.r * 1.1, c.z, 'walk');
          });
        }
        break;
      }
      case 'salvo': {
        // ejecta only round the pattern's outside; the junctions' spires at its sides
        for (const c of mine) if (c.blocks) ejecta(c, 3, 0.85);
        const sides = mine.filter((c) => Math.abs(c.x - b.lane(c.z)) > 16 && Math.abs(c.x) < HALF_W + 2);
        for (let k = 0; k < Math.min(4, sides.length); k++) {
          const c = sides[Math.floor(r() * sides.length)];
          const a = r() * Math.PI * 2;
          if (r() < 0.6) spires(c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r, 3, 1.5, 0);
        }
        // guns on the junctions at its sides, either side of the way
        for (const sd of [-1, 1]) {
          const at = mine.filter((c) => Math.sign(c.x - b.lane(c.z)) === sd && Math.abs(c.x - b.lane(c.z)) > 12 && Math.abs(c.x - b.lane(c.z)) < 24);
          if (at.length) {
            const c = at[Math.floor(r() * at.length)];
            gun(c.x, c.z - c.r, 'salvo');
          }
        }
        // the dud: the shell standing in its sand, the clans' ring of warning stakes round it
        if (b.dud && inBeat(b.dud.z)) {
          const { x, z } = b.dud;
          kit.put('ashgrave_glass_dud', x, z, { s: 1.1, rot: r() * Math.PI * 2, overlap: true });
          kit.claim(x, z, 1.2);
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * Math.PI * 2 + r() * 0.3;
            kit.put('ashgrave_glass_stake', x + Math.cos(a) * 3.4, z + Math.sin(a) * 3.4, { s: range(r, 0.9, 1.1), rot: -a, overlap: true });
          }
          for (let k = 0; k < 3; k++) {
            const a = r() * Math.PI * 2;
            kit.put('ashgrave_shell_casing', x + Math.cos(a) * 5.5, z + Math.sin(a) * 5.5, { s: range(r, 0.8, 1) });
          }
        }
        break;
      }
      case 'eye': {
        const eye = mine.find((c) => c.kind === 'eye');
        if (!eye || !b.peak) break;
        // the peak's spires, the tallest a needle cluster you'd hit
        spires(b.peak.x, b.peak.z, 9, b.peak.r * 1.1, 3);
        kit.emit('breath', b.peak.x, b.peak.z);
        // the crest: blocks heaped all round it, the biggest the eye threw
        ejecta(eye, 26, 2.2);
        ejecta(eye, 18, 1.4);
        // the rays' blocks out over the crust, in lines
        for (let k = 0; k < 5; k++) {
          const a = r() * Math.PI * 2;
          for (let t = 1.3; t < 1.6; t += 0.1) {
            const x = eye.x + Math.cos(a) * eye.r * t;
            const z = eye.z + Math.sin(a) * eye.r * t;
            if (clear(x, z)) kit.put('ashgrave_glass_ejecta', x, z, { s: range(r, 0.5, 0.8), rot: -a });
          }
        }
        // guns on the crest where the way comes over it, and goes out over it
        for (const k of [1, -1]) {
          const zz = eye.z + k * Math.sqrt(Math.max(0, eye.r ** 2 - (b.lane(eye.z) - eye.x) ** 2)) * 0.98;
          for (const sd of [-1, 1]) gun(b.lane(zz) + sd * (LANE + 5), zz + k * 1.5, 'eye');
        }
        // dust blowing off the crest
        for (let k = 0; k < 4; k++) {
          const a = r() * Math.PI * 2;
          kit.emit('dust', eye.x + Math.cos(a) * eye.r, eye.z + Math.sin(a) * eye.r, 4, b.wind[0] > 0 ? 1 : -1);
        }
        break;
      }
      case 'flow': {
        const src = mine.find((c) => c.kind === 'source');
        if (src) {
          ejecta(src, 10, 1.4);
          spires(src.x, src.z, 6, src.r * 0.5, 1);
          kit.emit('breath', src.x, src.z);
        }
        // blisters on the levees, roots out on the crust beside
        for (const tg of b.tongues) {
          tg.pts.forEach((p, k) => {
            if (k % 3 !== 1) return;
            for (const sd of [-1, 1]) {
              const x = p.x + sd * (p.w + 1.2);
              if (!clear(x, p.z, LANE - 1) || !inBeat(p.z)) continue;
              if (r() < 0.45) kit.put('ashgrave_glass_bubble', x, p.z, { s: range(r, 0.6, 1.0) });
              else if (r() < 0.4) kit.put('ashgrave_fulgurite_root', x + sd * 2, p.z, { s: range(r, 0.8, 1.1) });
            }
          });
        }
        // a gun on each levee's tip, out to the sides
        const main = b.tongues.find((t) => t.pts.some((p) => p.z <= bt.z0 && p.z > bt.z1));
        if (main) {
          const p = main.pts[Math.floor(main.pts.length * 0.6)];
          for (const sd of [-1, 1]) if (clear(p.x + sd * (p.w + 3), p.z, LANE + 2)) gun(p.x + sd * (p.w + 3), p.z, 'flow');
        }
        break;
      }
      case 'column': {
        const strike = mine.find((c) => c.kind === 'strike');
        if (strike) {
          ejecta(strike, 12, 1.5);
          feet(strike, 4);
          gun(strike.x, strike.z + strike.r * 1.1, 'strike');
        }
        // the road's marker posts burnt to stumps, their shadows left on the sand like the trucks'
        if (b.road)
          for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= 12) {
            const x = routeX(b.road, z) + (strike && strike.x > routeX(b.road, z) ? -2.6 : 2.6);
            if (clear(x, z)) kit.put('ashgrave_glass_stake', x, z, { s: 1.2, variant: 1 });
          }
        break;
      }
      case 'cuttings': {
        const q = b.quarry;
        if (!q || !inBeat(q.bowl.z)) break;
        const c = q.bowl;
        ejecta(c, 14, 1.3);
        // the derrick over the deepest cut, the blocks in rows out on the rim behind
        const dx = c.x + q.ux * c.r * 0.86;
        const dz = c.z + q.uz * c.r * 0.86;
        // (built reaching out along +x: turned to face the cut)
        if (kit.put('ashgrave_glass_derrick', dx, dz, { s: 1, rot: -Math.atan2(q.uz, q.ux), overlap: true })) {
          kit.claim(dx, dz, 3);
          gun(dx + q.uz * 5, dz - q.ux * 5, 'cuttings');
          kit.emit('cut', dx, dz);
        }
        for (let row = 0; row < 2; row++)
          for (let k = -3; k <= 3; k++) {
            const t = 1.25 + row * 0.18;
            const x = c.x + q.ux * c.r * t - q.uz * k * 3.6;
            const z = c.z + q.uz * c.r * t + q.ux * k * 3.6;
            if (!clear(x, z) || r() < 0.2) continue;
            const st = kit.put('ashgrave_glass_block', x, z, { s: range(r, 0.9, 1.05), rot: -Math.atan2(q.uz, q.ux) + (r() - 0.5) * 0.15, variant: (k + row + 6) % 3 });
            if (st && row === 0 && k === 0) gun(x, z, 'cuttings', st.y + 2.4);
          }
        // the cutters at work in the cuts, sparks off their saws
        for (let k = 0; k < 2; k++) {
          const a = Math.atan2(q.uz, q.ux) + range(r, -0.6, 0.6);
          kit.emit('cut', c.x + Math.cos(a) * c.r * 0.8, c.z + Math.sin(a) * c.r * 0.8);
        }
        // the Chikta's barges drawn up on the lake, lanterns on poles along the shore
        for (let k = 0; k < 3; k++) {
          const a = Math.atan2(q.uz, q.ux) + range(r, -1.2, 1.2);
          const t = range(r, 0.2, 0.42);
          const x = c.x + Math.cos(a) * c.r * t;
          const z = c.z + Math.sin(a) * c.r * t;
          // (nose up the screen as built: turned to lie along the shore)
          if (clear(x, z, LANE + 2)) kit.put('ashgrave_sail_barge', x, z, { s: 1, rot: Math.PI - a + (r() - 0.5) * 0.5 });
        }
        for (let k = 0; k < 6; k++) {
          const a = Math.atan2(q.uz, q.ux) + ((k / 5) - 0.5) * 2.4;
          const x = c.x + Math.cos(a) * c.r * 0.79;
          const z = c.z + Math.sin(a) * c.r * 0.79;
          if (clear(x, z)) kit.put('ashgrave_lantern_pole', x, z, { s: 1, overlap: true });
        }
        break;
      }
      case 'open': {
        for (const c of mine) {
          ejecta(c, 7, 1.0);
          feet(c, 2);
        }
        kit.emit('devil', (r() - 0.5) * 40, zc);
        break;
      }
      case 'gunship':
      case 'edge': {
        for (const c of mine) {
          ejecta(c, c.kind === 'strike' ? 16 : 6, c.kind === 'strike' ? 1.6 : 0.9);
          if (c.kind !== 'line') feet(c, 2);
        }
        break;
      }
    }
    // the lone shots out at the edges: their own blocks
    for (const c of mine) if (c.kind === 'shot' && bt.kind !== 'open' && bt.kind !== 'gunship') ejecta(c, 6, 0.9);
    // ash blowing off the crests, out at the sides
    for (let z = bt.z0 - 4; z > bt.z1 + 4; z -= range(r, 12, 18)) {
      const x = (r() < 0.5 ? -1 : 1) * range(r, 18, HALF_W + 4);
      if (r() < 0.3) kit.emit('dust', x, z, 4, b.wind[0] > 0 ? 1 : -1);
    }
    void len;
  }
}
