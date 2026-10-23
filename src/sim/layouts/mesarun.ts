/**
 * Red Mesa Run: the old race course, through mesa country (docs/readability.md, its layout row):
 * stretches of winding gorge, opening out into open ground where the mesas stand on their own.
 *
 * Bones: the gorge's two walls, stepped (a low ledge you fly over, a sheer cliff, a second tier
 * further back), wandering in and out in blocky buttresses, standing back out of sight where the
 * country opens; a dry wash winding down the floor; and mesas, alone or in families (a big butte
 * with smaller ones by it), in the gorge or out in the open. Its beats: in the gorge runs, narrows,
 * bowls, a split round a mesa, a broken arch, a depot dug into a wall; in the open, mesas, hoodoo
 * fields and bare flats; breathers between.
 *
 * Groups: rubble at the cliffs' feet (thicker where the walls close in), scrub along the wash's
 * banks and on the ledges, hoodoos gathered in the bowls, scrub and rock on the tops; the middle of
 * the floor left calm. Posts: guns on the ledges at the narrows, and guarding the depot. Routes:
 * the wash, and the depot's track out to it.
 */

import { eased, routeX, type Beat, type Layout, type Route } from '../layout';
import type { Pillar } from '../terrain';
import { clamp, fbm, lerp, noise2, range, rng, shuffle, smooth, smoothstep } from '../../util';

/** Each beat: how long (world units), and how far each wall stands from the gorge's middle. */
const BEATS: Record<string, { len: [number, number]; half: number }> = {
  // (room to fight in, two ships side by side: even the narrows are a third of the field and more,
  // and short)
  run: { len: [44, 56], half: 24 },
  breather: { len: [36, 44], half: 27 },
  narrows: { len: [36, 42], half: 17 },
  arch: { len: [46, 54], half: 23 },
  bowl: { len: [64, 76], half: 33 },
  split: { len: [62, 70], half: 34 },
  depot: { len: [54, 62], half: 23 },
  // out in the open: the walls stood back out of sight
  mesas: { len: [72, 84], half: 62 },
  hoodoos: { len: [56, 66], half: 62 },
  flats: { len: [34, 42], half: 62 },
};
/** The features of the gorge and of the open country; runs, breathers and flats go between them. */
const GORGE = ['narrows', 'arch', 'bowl', 'split', 'depot'];
const OPEN = ['mesas', 'hoodoos'];
/** Out in the open (where there are no walls to put things against). */
export const isOpen = (kind: string) => BEATS[kind]?.half > 40;
/** How far the depot's wall stands back, making its bay. */
const BAY = 34;

/** The heights of the steps: the ledge (under you), the cliff's top, the tier behind it. */
const LEDGE = 4.4;
/** The rock shelves out in the open. */
const SHELF = 3.4;
const TIER1 = 17;
const TIER2 = 24;
/** Over this many units at each end the gorge eases into whatever runs either side. */
const TAPER = 40;

/** A blocky wander along z: flat runs `len` long with quick steps between (buttresses, bays), -0.5 … 0.5. */
function blocks(z: number, len: number, seed: number) {
  const u = z / len;
  const k = Math.floor(u);
  return lerp(noise2(k, 0, seed), noise2(k + 1, 0, seed), smoothstep(0.55, 1, u - k)) - 0.5;
}

export const mesarun: Layout = {
  bones(seed, z0, z1, base) {
    const r = rng(seed * 9341 + Math.round(-z0) * 31 + 7);
    const s = seed % 997;

    // the beats: into the gorge and out into the open (or the other way), a feature or two of
    // each, with a run, a breather or a flat between
    const g = shuffle(r, [...GORGE]);
    const o = shuffle(r, [...OPEN]);
    const rest = () => (r() < 0.55 ? 'breather' : 'run');
    const seq = r() < 0.55 ? ['run', g[0], o[0], 'flats', o[1], 'run', g[1], rest(), g[2]] : ['flats', o[0], 'run', g[0], rest(), g[1], o[1], 'flats', g[2]];
    const beats: Beat[] = [];
    let z = z0;
    for (let i = 0; i < seq.length && z > z1; i++) {
      let kind = seq[i];
      const b = BEATS[kind];
      // (the level's start keeps clear: the first run reaches past it)
      let len = i === 0 && z0 > 0 ? z0 + 50 : range(r, b.len[0], b.len[1]);
      if (z - len < z1 + 30) {
        // the last: whatever's left, a plain run if a feature wouldn't fit
        len = z - z1;
        if (len < b.len[0]) kind = 'run';
      }
      beats.push({ kind, z0: z, z1: z - len, side: r() < 0.5 ? -1 : 1 });
      z -= len;
    }

    // the walls: each beat holds its width over its middle, eased between
    const anchors = (side: -1 | 1) =>
      beats.flatMap((b) => {
        const len = b.z0 - b.z1;
        let half = BEATS[b.kind].half + (r() - 0.5) * 3;
        if (b.kind === 'depot' && b.side === side) half = BAY;
        return [
          { z: b.z0 - len * 0.22, v: half },
          { z: b.z1 + len * 0.22, v: half },
        ];
      });
    const left = eased(anchors(-1));
    const right = eased(anchors(1));
    const k1 = r() * 100;
    const k2 = r() * 100;
    /** The gorge's own middle: it winds, less the wider it is (so both walls stay in view). */
    const own = (z: number) => {
      const room = clamp(35 - Math.max(left(z), right(z)), 0, 10);
      return room * Math.sin(z * 0.021 + k1) + 2.5 * Math.sin(z * 0.053 + k2);
    };
    /** How much is its own (eased into the default canyon at the ends, so neighbours join up). */
    const own_w = (z: number) => smoothstep(0, TAPER, Math.min(z0 - z, z - z1));
    const walls = (z: number): [number, number] => {
      const w = own_w(z);
      const m = lerp(base.x(z), own(z), w);
      const h = base.half(z);
      return [m - lerp(h, left(z), w), m + lerp(h, right(z), w)];
    };
    const mid = (z: number) => {
      const [l, rt] = walls(z);
      return (l + rt) / 2;
    };

    // the rock left standing: a mesa splitting the gorge, one off to the side of a bowl or a run;
    // out in the open, a family of mesas, a big one with smaller ones by it and one across the way
    const pillars: Pillar[] = [];
    const butte = (x: number, z: number, rad: number) => pillars.push({ x, z, r: rad, len: rad * (1.05 + r() * 0.45), split: false });
    for (const b of beats) {
      const zc = (b.z0 + b.z1) / 2;
      const [l, rt] = walls(zc);
      const m = mid(zc);
      if (b.kind === 'mesas') {
        const side = b.side;
        const big = 7.5 + r() * 2;
        const bx = m + side * (17 + big * 0.4 + r() * 5);
        const bz = zc + (r() - 0.5) * 12;
        butte(bx, bz, big);
        // (its family out past it, and along the way)
        for (let k = 0, n = 1 + Math.floor(r() * 2); k < n; k++) {
          const rad = 3 + r() * 1.8;
          const a = (k === 0 ? 0.3 : -0.9) + (r() - 0.5) * 0.6;
          butte(bx + side * Math.cos(a) * (big + rad + 4 + r() * 3), bz + Math.sin(a) * (big + rad + 6), rad);
        }
        const other = 4.5 + r() * 2;
        butte(m - side * (16 + other + r() * 6), zc - side * 0 - (b.z0 - b.z1) * (0.28 + r() * 0.1), other);
      } else if (b.kind === 'hoodoos' && r() < 0.6) {
        const rad = 3.5 + r() * 1.5;
        butte(m + b.side * (20 + r() * 8), zc + (r() - 0.5) * 20, rad);
      } else if (b.kind === 'split') {
        const rad = 6 + r() * 1.5;
        pillars.push({ x: mid(zc) + (r() - 0.5) * 2, z: zc, r: rad, len: rad * (1.5 + r() * 0.4), split: true });
      } else if ((b.kind === 'bowl' && r() < 0.7) || (b.kind === 'run' && r() < 0.35 && b.z0 < -60)) {
        const rad = b.kind === 'bowl' ? 4 + r() * 1.2 : 3 + r() * 0.6;
        // (on the side the bowl's big group isn't)
        const side = -b.side;
        const x = side < 0 ? l + rad + 3.5 : rt - rad - 3.5;
        pillars.push({ x, z: zc + (r() - 0.5) * 10, r: rad, len: rad * (1.1 + r() * 0.4), split: false });
      }
    }

    // the wash: a dry bed winding down the floor, round the rock
    const k3 = r() * 100;
    // (round each rock on the side with more room)
    const round = pillars.map((p) => {
      const [l, rt] = walls(p.z);
      return p.x - l > rt - p.x ? -1 : 1;
    });
    const pts: { x: number; z: number }[] = [];
    for (let zz = z0; zz >= z1 - 4; zz -= 3) {
      const [l, rt] = walls(zz);
      const m = (l + rt) / 2;
      const half = (rt - l) / 2;
      let x = m + Math.min(22, Math.max(0, half - 9) * 0.6) * Math.sin(zz * 0.03 + k3);
      pillars.forEach((p, i) => {
        const near = smooth(1 - smoothstep(p.len * 0.6, p.len + 18, Math.abs(zz - p.z)));
        const away = p.x + round[i] * (p.r + 6);
        x = lerp(x, round[i] > 0 ? Math.max(x, away) : Math.min(x, away), near);
      });
      pts.push({ x: clamp(x, l + 5, rt - 5), z: zz });
    }
    const wash: Route = { kind: 'wash', pts };
    const washAt = (x: number, z: number) => 1 - smoothstep(2.1, 3.3, Math.abs(x - routeX(wash, z)));

    /** How wide the ledge under a wall is at z (0: the cliff drops straight to the floor). */
    const ledge = (z: number, side: number) => {
      const b = beats.find((q) => z <= q.z0 && z > q.z1);
      const w = clamp((blocks(z, 11, s + (side < 0 ? 40 : 41)) + 0.5) * 9 - 2.5, 0, 6);
      // (the narrows keep a ledge each side, for their guns)
      return b?.kind === 'narrows' ? Math.max(w, 4.5) : w;
    };

    const height = (x: number, z: number) => {
      const [l, rt] = walls(z);
      // how far into the rock, each side, with the buttresses' blocky wander
      const dl = l - x + blocks(z, 4.5, s + 11) * 3.2 + (fbm(z * 0.04, 1, s + 3) - 0.5) * 4;
      const dr = x - rt + blocks(z, 4.5, s + 12) * 3.2 + (fbm(z * 0.04, 9, s + 3) - 0.5) * 4;
      const side = dl > dr ? -1 : 1;
      const d = Math.max(dl, dr);
      const dip = washAt(x, z);
      let h = 0.55 + fbm(x * 0.06, z * 0.06, s) * 0.8 - dip * 0.4;
      // out in the open, shelves of the red rock break the floor: low, flat-topped, sharp-edged
      // (under you), kept off the wash and out of the middle
      const open = smoothstep(32, 50, Math.min(rt - x, x - l));
      if (open > 0) {
        const n = fbm(x * 0.045, z * 0.03, s + 13) + (noise2(Math.floor(x / 3), Math.floor(z / 3), s + 14) - 0.5) * 0.06;
        const keep = smoothstep(4, 9, Math.abs(x - routeX(wash, z))) * smoothstep(6, 14, Math.abs(x - (l + rt) / 2));
        h = lerp(h, SHELF + fbm(x * 0.2, z * 0.2, s + 15) * 0.4, smoothstep(0.545, 0.56, n) * open * keep);
      }
      // scree banked against the foot of the rock
      if (d > -4) h += smooth(clamp((d + 4) / 4, 0, 1)) ** 2 * 1.2;
      if (d > -1) {
        const w = ledge(z, side);
        const back = 9 + (blocks(z, 7, s + (side < 0 ? 21 : 22)) + 0.5) * 7;
        const lip = blocks(z, 3.5, s + (side < 0 ? 31 : 32)) * 1.4;
        // (each riser over a couple of the ground's cells, so a face is a face, not a row of teeth)
        const t0 = smoothstep(0, 1.4, d);
        const t1 = smoothstep(w + lip, w + lip + 2.6, d);
        const t2 = smoothstep(w + back, w + back + 3, d);
        h = lerp(h, LEDGE + fbm(x * 0.2, z * 0.2, s + 5) * 0.6, t0);
        h = lerp(h, TIER1 + (noise2(x * 0.18, z * 0.18, s + 6) - 0.5) * 1.2, t1);
        h = lerp(h, TIER2 + (noise2(x * 0.12, z * 0.12, s + 7) - 0.5) * 1.6, t2);
      }
      for (const p of pillars) {
        if (Math.abs(z - p.z) > p.len + 6) continue;
        const a = Math.atan2(z - p.z, x - p.x);
        // a craggy outline, in facets
        const e = Math.hypot(x - p.x, (z - p.z) * (p.r / p.len)) - p.r + (noise2(Math.floor((a + Math.PI) * 2.2), p.z, s + 8) - 0.5) * 1.8;
        const skirt = 1 - smoothstep(0.6, 2.4, e);
        const core = 1 - smoothstep(-0.9, 0.1, e);
        h = Math.max(h, lerp(h, LEDGE * 0.8, skirt), lerp(h, TIER1 - 1 + (noise2(x * 0.3, z * 0.3, s + 9) - 0.5), core));
        // (a big one steps up again in the middle)
        if (p.r > 6.5) h = Math.max(h, lerp(h, TIER2 - 2, 1 - smoothstep(-p.r * 0.42 - 1.2, -p.r * 0.42 + 0.4, e)));
      }
      return h;
    };

    return { walls, pillars, height, wash: washAt, routes: [wash], beats };
  },

  plan(kit, bones) {
    const r = kit.r;
    const walls = bones.walls!;
    const wash = bones.routes![0];
    const mid = (z: number) => (walls(z)[0] + walls(z)[1]) / 2;
    /** Keeps the middle of the floor calm: nothing within `m` of the racing middle, nor in the wash. */
    const calm = (m: number) => (x: number, z: number) => Math.abs(x - mid(z)) > m && Math.abs(x - routeX(wash, z)) > 3.2;
    /** A spot on the ledge under the wall on `side` at z, where a gun could be dug in (null if none). */
    const onLedge = (side: number, z: number) => {
      const [l, rt] = walls(z);
      for (let k = -3; k < 9; k += 0.5) {
        const x = side < 0 ? l - k : rt + k;
        const h = kit.ground.height(x, z);
        if (h > 3.6 && h < 6.5 && kit.ground.height(x - side * 1.5, z) < 6.5) return x;
      }
      return null;
    };
    /** Just out from the rock at the foot of the wall on `side` at z (null if the floor's not there). */
    const foot = (side: number, z: number) => {
      const [l, rt] = walls(z);
      for (let k = -4; k < 6; k += 0.5) {
        const x = side < 0 ? l + k : rt - k;
        if (kit.ground.height(x, z) < 2.4) return x + side * -1.2;
      }
      return null;
    };
    const rubble = [['kessra_scree', 3]] as const;
    const scrub = [['kessra_brush', 3], ['kessra_deadwood', 0.35]] as const;

    for (const b of kit.beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      const [lc, rc] = walls(zc);

      // the big forms first: each feature's own
      switch (b.kind) {
        case 'narrows': {
          // guns on the ledges, both sides, looking down the gorge; a rope bridge over now and then
          for (const side of [-1, 1] as const)
            for (const dz of [-0.18, 0.18]) {
              const z = zc + dz * len + (r() - 0.5) * 4;
              const x = onLedge(side, z);
              if (x !== null) kit.post(x, z, 0, 'narrows');
            }
          if (r() < 0.4) kit.set('kessra_rope_bridge', 'span', mid(zc), zc - len * 0.3, (r() - 0.5) * 0.08);
          break;
        }
        case 'arch': {
          // the broken arch, standing across the floor: through it, or round it either side
          kit.solid('arch', mid(zc) + (r() - 0.5) * 3, zc, 1.15 + r() * 0.15, (r() - 0.5) * 0.25);
          break;
        }
        case 'bowl': {
          // hoodoos gathered against one wall, the biggest at the back
          const side = b.side;
          const x = side < 0 ? lc + 7 : rc - 7;
          kit.group(x, zc, { kinds: [['kessra_hoodoo', 1]], n: 4 + Math.floor(r() * 3), spread: 11, big: 'fit', small: 0.75, keep: calm(9), along: 0, stretch: 1.5 });
          kit.group(x - side * 4, zc + 9, { kinds: scrub, n: 4, spread: 3, big: 1.5, small: 1, keep: calm(9) });
          break;
        }
        case 'depot': {
          // the raiders' depot at the back of its bay, guarded, its track out to the wash
          const side = b.side;
          const x = side < 0 ? lc + 6 : rc - 6;
          // (its back to the wall)
          kit.put('kessra_depot', x, zc, { s: 1.25, rot: (-side * Math.PI) / 2, overlap: true });
          kit.group(x - side * 2, zc + 9, { kinds: [['kessra_race_debris', 1]], n: 3, spread: 4, big: 1.2, small: 0.8, along: 0, stretch: 1.6 });
          kit.post(x - side * 6, zc - 5, 0, 'depot');
          kit.post(x - side * 5, zc + 6, 0, 'depot');
          const pts: { x: number; z: number }[] = [];
          for (let t = 0; t <= 1.001; t += 0.1) {
            const z = zc - t * len * 0.45;
            pts.push({ x: lerp(x, routeX(wash, z), smooth(t)), z });
          }
          kit.routes.push({ kind: 'track', pts });
          break;
        }
        case 'mesas': {
          // one more mesa standing free, a model's, with the family; scrub gathered at their feet
          const near = (bones.pillars ?? []).filter((p) => p.z <= b.z0 && p.z > b.z1);
          const big = near[0];
          if (big) {
            const side = Math.sign(big.x - mid(big.z)) || 1;
            kit.solid('mesa', big.x - side * (big.r + 9), big.z + big.len + 9 + r() * 5, 0.95 + r() * 0.2, r() * Math.PI * 2);
          }
          // guns on the big one's skirt, looking out over the way
          if (big) {
            const side = Math.sign(big.x - mid(big.z)) || 1;
            for (const dz of [-0.5, 0.5]) {
              const z = big.z + dz * big.len;
              for (let x = big.x - side * big.r * 0.6; Math.abs(x - big.x) < big.r + 4; x -= side * 0.5) {
                const h = kit.ground.height(x, z);
                if (h > 2.4 && h < 5) {
                  kit.post(x, z, 0, 'mesa');
                  break;
                }
              }
            }
          }
          for (const p of near) {
            const a = r() * Math.PI * 2;
            kit.group(p.x + Math.cos(a) * (p.r + 4), p.z + Math.sin(a) * (p.len + 4), { kinds: scrub, n: 3 + Math.floor(r() * 3), spread: 3, big: 1.5, small: 0.9, keep: calm(8) });
          }
          break;
        }
        case 'hoodoos': {
          // hoodoos in stands, each round its tallest, either side of the way, staggered
          let side = b.side;
          for (let k = 0, n = 2 + Math.floor(r() * 2); k < n; k++, side = -side as -1 | 1) {
            const z = b.z0 - len * ((k + 0.5) / n) + (r() - 0.5) * 6;
            const x = mid(z) + side * (15 + r() * 10);
            // a pinnacle or two at its back, out from the way
            for (let q = 0, m = r() < 0.6 ? 1 : 2; q < m; q++)
              kit.solid('kessra_spire', x + side * (7 + r() * 5), z + (q - 0.5) * 12 + (r() - 0.5) * 4, 0.9 + r() * 0.25, r() * Math.PI * 2);
            kit.group(x, z, { kinds: [['kessra_hoodoo', 1]], n: 3 + Math.floor(r() * 3), spread: 10, big: 'fit', small: 0.7, keep: calm(9), along: 0, stretch: 1.3 });
            kit.group(x + side * 5, z - 8, { kinds: scrub, n: 3, spread: 3, big: 1.4, small: 0.9, keep: calm(8) });
          }
          break;
        }
        case 'flats':
        case 'run': {
          // now and then a racer that didn't make it, by the wash, its bits strewn after it
          if (r() < 0.55 && b.z0 < -40) {
            const z = zc + (r() - 0.5) * len * 0.4;
            const side = r() < 0.5 ? -1 : 1;
            const x = routeX(wash, z) + side * (5 + r() * 3);
            kit.group(x, z, { kinds: [['kessra_race_debris', 1]], n: 4, spread: 4, big: 1.3, small: 0.6, along: 0, stretch: 1.8 });
          }
          if (r() < 0.25 && b.z0 < -40) kit.set('kessra_race_gantry', 'span', mid(zc), zc, (r() - 0.5) * 0.06);
          break;
        }
      }

      // a gun on a ledge with a view down the gorge, now and then
      if (['run', 'bowl', 'split', 'arch'].includes(b.kind) && r() < 0.7) {
        const z = zc + (r() - 0.5) * len * 0.5;
        const x = onLedge(b.side, z);
        if (x !== null && Math.abs(x) < 40) kit.post(x, z, 0, 'ledge');
      }

      // rubble fallen from the cliffs, in heaps at their feet: thick where the walls close in,
      // a heap now and then elsewhere, none in a breather
      const often = b.kind === 'narrows' ? 9 : b.kind === 'breather' ? 0 : 24;
      for (const side of [-1, 1] as const)
        for (let z = b.z0 - r() * often; often && z > b.z1; z -= often * (0.7 + r() * 0.6)) {
          const x = foot(side, z);
          if (x === null || Math.abs(x) > 46) continue;
          kit.group(x, z, { kinds: rubble, n: 3 + Math.floor(r() * 4), spread: 3, big: 1.1 + r() * 0.4, small: 0.45, along: 0, stretch: 1.8, keep: calm(6) });
        }

      // scrub along the wash's banks, in clumps (not in a breather)
      if (b.kind !== 'breather')
        for (let z = b.z0 - r() * 14; z > b.z1; z -= 13 + r() * 10) {
          const side = r() < 0.5 ? -1 : 1;
          const x = routeX(wash, z) + side * (4.2 + r() * 2.5);
          kit.group(x, z, { kinds: scrub, n: 2 + Math.floor(r() * 3), spread: 2.2, big: 1.3 + r() * 0.4, small: 0.8 });
        }

      // the ledges: a clump of scrub or a rock now and then
      for (const side of [-1, 1] as const)
        for (let z = b.z0 - r() * 12; z > b.z1; z -= 12 + r() * 12) {
          const x = onLedge(side, z);
          if (x === null || Math.abs(x) > 46) continue;
          kit.group(x, z, { kinds: r() < 0.7 ? scrub : rubble, n: 2 + Math.floor(r() * 2), spread: 1.6, big: 1.3, small: 0.8 });
        }

      // the tops: scrub and rock, in clumps, along the cliff's edge and further back
      for (const side of [-1, 1] as const)
        for (let z = b.z0 - r() * 14; z > b.z1; z -= 14 + r() * 16) {
          const [l, rt] = walls(z);
          const back = 8 + r() * 16;
          const x = side < 0 ? l - back : rt + back;
          if (Math.abs(x) > 52 || kit.ground.height(x, z) < 15) continue;
          kit.group(x, z, { kinds: r() < 0.75 ? scrub : rubble, n: 3 + Math.floor(r() * 4), spread: 3.5, big: 1.2 + r() * 0.3, small: 0.7, rim: true });
        }
    }

    // the rock standing: scrub on its top, rubble round its foot
    for (const p of bones.pillars ?? []) {
      if (p.r > 4.5) kit.group(p.x + (r() - 0.5) * p.r * 0.5, p.z + (r() - 0.5) * p.len * 0.5, { kinds: scrub, n: 2 + Math.floor(r() * 3), spread: p.r * 0.4, big: 1.3, small: 0.8, rim: true });
      for (let a = r() * 6; a < Math.PI * 2 + r(); a += 1 + r() * 1.2) {
        const x = p.x + Math.cos(a) * (p.r + 2.6);
        const z = p.z + Math.sin(a) * (p.len + 2.6);
        kit.group(x, z, { kinds: r() < 0.7 ? rubble : scrub, n: 2 + Math.floor(r() * 3), spread: 2, big: 1.5, small: 0.5 });
      }
    }
  },
};
