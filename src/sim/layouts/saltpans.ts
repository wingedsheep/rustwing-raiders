/**
 * The Salt Pans: white to the horizon (docs/level-design.md, its layout row). A rough first
 * layout, the second on the toolkit after Red Mesa Run, to show it fits a place laid out by
 * different rules: no walls, nothing to frame the lane but what grows on the cracks.
 *
 * Bones: the flat salt, near level, crossed by a few long dry cracks that wander down the pan; one
 * or two old haul tracks, near straight, crossing each other now and then. Its beats: fields where
 * the cracks run thick with pillars, a crossing of the tracks, a stranded hauler, the bones of
 * something huge, and long bright breathers of bare salt between.
 *
 * Groups: salt pillars in tight clusters strung along the cracks, crystals at their feet, ridges
 * pushed up along the crack lines; wide bare salt between. Posts: mortars at the tracks'
 * crossings. Routes: the haul tracks.
 */

import { routeX, type Beat, type Layout, type Route } from '../layout';
import { HALF_W } from '../types';
import { clamp, fbm, range, rng, shuffle, smoothstep } from '../../util';

const BEATS: Record<string, [number, number]> = {
  field: [56, 70],
  crossing: [48, 56],
  hauler: [44, 52],
  bones: [60, 70],
  breather: [46, 60],
};
const FEATURES = ['field', 'crossing', 'hauler', 'bones'];

export const saltpans: Layout = {
  bones(seed, z0, z1) {
    const r = rng(seed * 6271 + Math.round(-z0) * 17 + 3);
    const s = seed % 991;

    // the beats: a feature, a long breather, a feature… the fields most often
    const f = shuffle(r, [...FEATURES]);
    const seq = ['breather', 'field', f[0], 'breather', 'field', f[1], 'breather', f[2]];
    const beats: Beat[] = [];
    let z = z0;
    for (let i = 0; i < seq.length && z > z1 + 30; i++) {
      // (the level's start keeps clear: the first breather reaches past it)
      let len = i === 0 && z0 > 0 ? z0 + 30 : range(r, ...BEATS[seq[i]]);
      if (z - len < z1 + 30) len = z - z1;
      beats.push({ kind: seq[i], z0: z, z1: z - len, side: r() < 0.5 ? -1 : 1 });
      z -= len;
    }

    // the cracks: long and wandering, down the pan, off to the sides of the middle
    const cracks: Route[] = [];
    for (let k = 0; k < 3; k++) {
      const x0 = (k - 1) * 24 + (r() - 0.5) * 8;
      const ph = r() * 100;
      const pts: { x: number; z: number }[] = [];
      for (let zz = z0; zz >= z1 - 4; zz -= 3) pts.push({ x: clamp(x0 + 9 * Math.sin(zz * 0.019 + ph) + (fbm(zz * 0.05, k, s) - 0.5) * 8, -HALF_W - 4, HALF_W + 4), z: zz });
      cracks.push({ kind: 'crack', pts });
    }

    // the haul tracks: near straight, leaning across the pan, so they cross now and then
    const tracks: Route[] = [];
    for (let k = 0; k < 2; k++) {
      const lean = (k ? -1 : 1) * (0.08 + r() * 0.06);
      const x0 = (k ? 1 : -1) * (6 + r() * 8);
      const pts: { x: number; z: number }[] = [];
      for (let zz = z0; zz >= z1 - 4; zz -= 3) {
        // (bouncing off the sides of the field, as a hauler would turn back across the pan)
        const u = x0 + lean * (z0 - zz) + HALF_W - 6;
        const w = (HALF_W - 6) * 2;
        const m = ((u % (2 * w)) + 2 * w) % (2 * w);
        pts.push({ x: (m < w ? m : 2 * w - m) - (HALF_W - 6), z: zz });
      }
      tracks.push({ kind: 'track', pts });
    }

    const near = (rt: Route, x: number, z: number) => Math.abs(x - routeX(rt, z));
    const height = (x: number, z: number) => {
      let h = 0.3 + (fbm(x * 0.05, z * 0.05, s) - 0.5) * 0.25;
      for (const c of cracks) h -= 0.25 * (1 - smoothstep(0.2, 0.7, near(c, x, z)));
      return h;
    };
    // the cracks dark and fine, the tracks two worn ruts
    const wash = (x: number, z: number) => {
      let v = 0;
      for (const c of cracks) v = Math.max(v, 1 - smoothstep(0.2, 0.6, near(c, x, z)));
      for (const t of tracks) v = Math.max(v, 0.6 * (1 - smoothstep(0.2, 0.5, Math.abs(near(t, x, z) - 1.1))));
      return v;
    };

    return { height, wash, routes: tracks, lines: cracks, beats };
  },

  plan(kit, bones) {
    const r = kit.r;
    const cracks = bones.lines ?? [];
    const tracks = bones.routes ?? [];
    /** Off the haul tracks (nothing stands where they drive). */
    const clear = (x: number, z: number) => tracks.every((t) => Math.abs(x - routeX(t, z)) > 3.5) && Math.abs(x) < HALF_W + 6;
    const pillars = [['salt_pillar', 3], ['kessra_salt_crystal', 2]] as const;

    for (const b of kit.beats) {
      const len = b.z0 - b.z1;
      const zc = (b.z0 + b.z1) / 2;
      switch (b.kind) {
        case 'field': {
          // pillars in tight clusters strung along the cracks, a ridge pushed up between them
          for (const c of cracks)
            for (let z = b.z0 - r() * 10; z > b.z1; z -= 12 + r() * 10) {
              const x = routeX(c, z);
              if (!clear(x, z)) continue;
              if (r() < 0.65) kit.group(x, z, { kinds: pillars, n: 4 + Math.floor(r() * 4), spread: 3, big: 'fit', small: 0.6, keep: clear, along: 0, stretch: 1.6 });
              else kit.put('kessra_salt_ridge', x, z, { rot: Math.PI / 2 + (r() - 0.5) * 0.3, s: 1 + r() * 0.3 });
            }
          break;
        }
        case 'crossing': {
          // where the tracks cross (or come closest), mortars dug in, a cache by them
          let best = { z: zc, d: Infinity };
          for (let z = b.z0 - 4; z > b.z1 + 4; z -= 1) {
            const d = Math.abs(routeX(tracks[0], z) - routeX(tracks[1], z));
            if (d < best.d) best = { z, d };
          }
          const x = (routeX(tracks[0], best.z) + routeX(tracks[1], best.z)) / 2;
          for (const side of [-1, 1]) kit.post(x + side * 7, best.z + (r() - 0.5) * 6, 0, 'crossing');
          kit.put('kessra_salt_cache', x + b.side * 9, best.z - 6, { s: 1 });
          break;
        }
        case 'hauler': {
          // a hauler run off its track and left, its cargo strewn behind it
          const t = tracks[r() < 0.5 ? 0 : 1];
          const x = routeX(t, zc) + b.side * 6;
          kit.put('kessra_land_yacht', x, zc, { s: 1.2, rot: (r() - 0.5) * 0.6 });
          kit.group(x + b.side * 4, zc + 8, { kinds: [['kessra_salt_cache', 1], ['kessra_salt_crystal', 1]], n: 3, spread: 4, big: 0.9, small: 0.6, keep: clear });
          break;
        }
        case 'bones': {
          // something huge died here: its bones lying down one side, ribs standing out of the salt
          kit.set('kessra_leviathan', 'giant', b.side * 22, zc, (r() - 0.5) * 0.3);
          kit.group(-b.side * 18, zc - len * 0.3, { kinds: [['skeleton_ribs', 1]], n: 2, spread: 6, big: 1, small: 0.8, keep: clear });
          break;
        }
        case 'breather': {
          // bare and bright: now and then a lone crystal on a crack, and that's all
          for (const c of cracks)
            if (r() < 0.35) {
              const z = zc + (r() - 0.5) * len * 0.6;
              kit.group(routeX(c, z), z, { kinds: [['kessra_salt_crystal', 1]], n: 2, spread: 2, big: 0.8, small: 0.5, keep: clear });
            }
          break;
        }
      }
    }
  },
};
