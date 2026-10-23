/**
 * The numbers behind `just look --stats` (docs/readability.md, the checks): what a still measures
 * (read as raw pixels) and what the sim says of the whole level (its Terrain, built as the level
 * builds it). tools/look.ts takes the frames and prints the table.
 */

import { spawnSync } from 'node:child_process';
import { Terrain } from '../src/sim/terrain';
import { HALF_H, HALF_W } from '../src/sim/types';
import { metaOf } from '../src/sim/meta';
import { levelSpec } from '../src/sim/run';
import type { Planet } from '../src/world/planets';

export interface Img {
  w: number;
  h: number;
  /** RGB, 8 bits each. */
  d: Uint8Array;
}

/** A png read as raw RGB, cropped and scaled to w × h as the side-by-side tiles are. */
export function load(file: string, w: number, h: number): Img {
  const r = spawnSync('magick', [file, '-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`, '-depth', '8', 'rgb:-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`magick ${file}: ${r.stderr}`);
  return { w, h, d: new Uint8Array(r.stdout) };
}

export function save(img: Img, file: string, ...after: string[]) {
  const r = spawnSync('magick', ['-size', `${img.w}x${img.h}`, '-depth', '8', 'rgb:-', ...after, file], { input: img.d });
  if (r.status !== 0) throw new Error(`magick ${file}: ${r.stderr}`);
}

const lin = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const enc = (c: number) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)));

/** OKLab, a pixel each: lightness, chroma, and a and b. */
export function oklab(img: Img) {
  const n = img.w * img.h;
  const L = new Float32Array(n);
  const C = new Float32Array(n);
  const As = new Float32Array(n);
  const Bs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = lin[img.d[i * 3]];
    const g = lin[img.d[i * 3 + 1]];
    const b = lin[img.d[i * 3 + 2]];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    L[i] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    C[i] = Math.hypot(A, B);
    As[i] = A;
    Bs[i] = B;
  }
  return { L, C, A: As, B: Bs };
}

/** The frame as it looks: its OKLab lightness in grey, and through deuteranopia and protanopia (Machado et al. 2009, full strength). */
export function value(img: Img): { grey: Img; deutan: Img; protan: Img } {
  const n = img.w * img.h;
  const { L } = oklab(img);
  const grey = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) grey[i * 3] = grey[i * 3 + 1] = grey[i * 3 + 2] = Math.round(255 * Math.min(1, L[i]));
  const sim = (M: number[]) => {
    const out = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = lin[img.d[i * 3]];
      const g = lin[img.d[i * 3 + 1]];
      const b = lin[img.d[i * 3 + 2]];
      for (let k = 0; k < 3; k++) out[i * 3 + k] = enc(M[k * 3] * r + M[k * 3 + 1] * g + M[k * 3 + 2] * b);
    }
    return { w: img.w, h: img.h, d: out };
  };
  return {
    grey: { w: img.w, h: img.h, d: grey },
    deutan: sim([0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881]),
    protan: sim([0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]),
  };
}

/** Edge energy (Sobel on lightness) of the outer thirds over the middle third's. */
export function detail(L: Float32Array, w: number, h: number) {
  const sum = [0, 0];
  const cnt = [0, 0];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1];
      const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
      const k = x < w / 3 || x >= (2 * w) / 3 ? 0 : 1;
      sum[k] += Math.hypot(gx, gy);
      cnt[k]++;
    }
  return sum[0] / cnt[0] / (sum[1] / cnt[1]);
}

/** The pixels lit in `on`, in groups (8-connected), each a list of indices. */
function groups(on: Uint8Array, w: number, h: number): number[][] {
  const seen = new Uint8Array(on.length);
  const out: number[][] = [];
  const stack: number[] = [];
  for (let i0 = 0; i0 < on.length; i0++) {
    if (!on[i0] || seen[i0]) continue;
    const g: number[] = [];
    seen[i0] = 1;
    stack.push(i0);
    while (stack.length) {
      const i = stack.pop()!;
      g.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (on[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    out.push(g);
  }
  return out;
}

/** The ring round a group: within `r` pixels of it but not in `taken`. */
function ring(g: number[], taken: Uint8Array, w: number, h: number, r: number): number[] {
  const out = new Set<number>();
  for (const i of g) {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!taken[j]) out.add(j);
      }
  }
  return [...out];
}

/** A group's bounds: x0, y0, x1, y1. */
function box(g: number[], w: number): [number, number, number, number] {
  let x0 = Infinity, x1 = 0, y0 = Infinity, y1 = 0;
  for (const i of g) {
    const x = i % w;
    const y = (i - x) / w;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

const mean = (xs: ArrayLike<number>, at: number[]) => at.reduce((a, i) => a + xs[i], 0) / Math.max(1, at.length);
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** Grown by r pixels (a square). */
function grow(on: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(on.length);
  for (let i = 0; i < on.length; i++) {
    if (!on[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
      }
  }
  return out;
}

/** Something that reads as a shot: its box, its gap to the ground, its colour (the 90th percentile of its chroma, halo and all) and its pixels, halo and all. */
export interface Blob {
  box: [number, number, number, number];
  gap: number;
  chroma: number;
  near: number[];
}

/**
 * How far a shot stands from its ground: the OKLab distance (lightness and colour) from the
 * ground's mean to the shot's core, the 90th percentile of its pixels. (Lightness alone misses an
 * orange shot on white salt; the Value sheet looks at lightness.)
 */
function gap(at: Lab, g: number[], on: Lab, ground: number[]) {
  const l = mean(on.L, ground);
  const a = mean(on.A, ground);
  const b = mean(on.B, ground);
  return quantile(g.map((i) => Math.hypot(at.L[i] - l, at.A[i] - a, at.B[i] - b)), 0.9);
}
type Lab = { L: Float32Array; A: Float32Array; B: Float32Array };

export interface Fire {
  /** Bullets seen (groups of pixels the enemy fire changes). */
  n: number;
  /** The gap of the worst one to the ground round it (see gap). */
  worst: number;
  /** The median bullet's chroma (see Blob). */
  chroma: number;
  each: Blob[];
}

/**
 * Each bullet against its ground: the still against the frame without enemy fire. Where they
 * differ is fire (halo and all: groups of 12 px or more); its ground is the ring round it (4 px
 * out) in the frame without.
 */
export function fire(still: Img, nofire: Img): Fire {
  const { w, h } = still;
  const a = oklab(still);
  const b = oklab(nofire);
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) {
    const d = Math.max(Math.abs(still.d[i * 3] - nofire.d[i * 3]), Math.abs(still.d[i * 3 + 1] - nofire.d[i * 3 + 1]), Math.abs(still.d[i * 3 + 2] - nofire.d[i * 3 + 2]));
    on[i] = d > 24 ? 1 : 0;
  }
  const taken = grow(on, w, h, 1);
  const gs = groups(on, w, h).filter((g) => g.length >= 12);
  const each = gs.map((g) => {
    return { box: box(g, w), gap: gap(a, g, b, ring(g, taken, w, h, 4)), chroma: quantile(g.map((i) => a.C[i]), 0.9), near: g };
  });
  const worst = Math.min(...each.map((e) => e.gap));
  return { n: gs.length, worst: gs.length ? worst : NaN, chroma: quantile(each.map((e) => e.chroma), 0.5), each };
}

/** Boxes drawn round what was found, each with its label (a still, to check the numbers by eye). */
export function boxes(src: string, w: number, h: number, found: { box: [number, number, number, number]; label?: string; colour?: string }[], to: string) {
  const draw = found.flatMap(({ box: [x0, y0, x1, y1], label, colour = 'cyan' }) => [
    '-stroke', colour, '-fill', 'none', '-draw', `rectangle ${x0 - 3},${y0 - 3} ${x1 + 3},${y1 + 3}`,
    ...(label ? ['-stroke', 'none', '-fill', colour, '-draw', `text ${x1 + 5},${y0 + 4} '${label}'`] : []),
  ]);
  const r = spawnSync('magick', [src, '-resize', `${w}x${h}^`, '-gravity', 'center', '-extent', `${w}x${h}`, '-gravity', 'northwest', '-strokewidth', '2', '-pointsize', '14', ...draw, to]);
  if (r.status !== 0) throw new Error(`magick ${to}: ${r.stderr}`);
}

/** The top 1% of chroma in a frame (the world's, given the frame without what must read), leaving out `skip`'s pixels. */
export const topChroma = (img: Img, skip: Blob[] = []) => {
  const out = new Set(skip.flatMap((b) => b.near));
  return quantile([...oklab(img).C].filter((_, i) => !out.has(i)), 0.99);
};

/**
 * A blob's pixels lift this far over their box; it's this light, and it or its halo has this much
 * colour (or it's vivid, and a little less light); and it stands this far out all round.
 */
const [POP, LIGHT, MIN_C, VIVID, RING_POP] = [0.08, 0.85, 0.08, 0.16, 0.25];
/**
 * Small, bright, saturated blobs: what could be taken for a shot. A pixel is a candidate when it
 * is lighter than the 21 px box round it; a blob is a compact group of them (12 to 600 px, no more
 * than 2.5 times longer than wide, filling half its box at least), white-hot in a coloured halo
 * (as the paintings' shots burn) or vivid itself, that stands out from the ground all the way round
 * it. The boxes.
 */
export function lookalikes(img: Img): Blob[] {
  const { w, h } = img;
  const { L, C, A, B } = oklab(img);
  // the box means, from summed tables
  const table = (X: Float32Array) => {
    const S = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        row += X[y * w + x];
        S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row;
      }
    }
    return S;
  };
  const SL = table(L);
  const SA = table(A);
  const SB = table(B);
  const R = 10;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - R);
      const x1 = Math.min(w, x + R + 1);
      const y0 = Math.max(0, y - R);
      const y1 = Math.min(h, y + R + 1);
      const k = (x1 - x0) * (y1 - y0);
      const box = (S: Float64Array) => (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / k;
      const i = y * w + x;
      const dl = L[i] - box(SL);
      on[i] = dl > POP ? 1 : 0;
    }
  const taken = grow(on, w, h, 1);
  const out: Blob[] = [];
  const none = new Uint8Array(w * h);
  for (const g of groups(on, w, h)) {
    if (g.length < 12 || g.length > 600) continue;
    const [x0, y0, x1, y1] = box(g, w);
    const long = Math.max(x1 - x0, y1 - y0) + 1;
    const wide = Math.min(x1 - x0, y1 - y0) + 1;
    if (long > wide * 2.5 || g.length < 0.5 * long * wide) continue;
    // (the top strip is the paintings' HUD)
    if (y1 < 48) continue;
    // standing out all the way round (a lit edge of rock is dark on one side only): the ring in
    // eight sectors about the middle, the blob lighter than each and far from it in colour
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const sectors: number[][] = Array.from({ length: 8 }, () => []);
    for (const i of ring(g, taken, w, h, 3)) {
      const x = i % w;
      const y = (i - x) / w;
      sectors[Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 8) % 8].push(i);
    }
    const bl = mean(L, g);
    const ba = mean(A, g);
    const bb = mean(B, g);
    const halo = mean(C, ring(g, taken, w, h, 3));
    const least = Math.min(...sectors.filter((x) => x.length).map((r) => (bl > mean(L, r) ? Math.hypot(bl - mean(L, r), ba - mean(A, r), bb - mean(B, r)) : 0)));
    const c = quantile(g.map((i) => C[i]), 0.9);
    // white-hot in a coloured halo, or itself vivid
    const hot = (bl > LIGHT && Math.max(c, halo) > MIN_C) || (bl > LIGHT - 0.25 && c > VIVID);
    if (!hot || least <= RING_POP) continue;
    // against the ground past its halo (6 px out), as a bullet is measured
    const near = new Set(ring(g, none, w, h, 6));
    const ground = ring(g, none, w, h, 10).filter((i) => !near.has(i));
    out.push({ box: [x0, y0, x1, y1], gap: gap({ L, A, B }, g, { L, A, B }, ground), chroma: quantile([...near].map((i) => C[i]), 0.9), near: [...near] });
  }
  return out;
}

// ---- the sim ----

/** A screen of the level: as wide as the field, as deep as the view. */
const SCREEN = HALF_H * 2;
/** The ship's width (the kestrel's model), for the open lane. */
export const SHIP_W = (() => {
  const m = metaOf('frame_kestrel');
  return m ? m.max[0] - m.min[0] : 5;
})();
/** Where a ship's middle touches a collider column (sim/level.ts collideLand), as the lane counts room. */
const TOUCH = 0.7;

export interface Level {
  terrain: Terrain;
  /** From the start (60, a run-up behind z 0) to its end. */
  z0: number;
  z1: number;
}

/** The level `?planet=&biomes=&mode=&seed=` flies: one biome, as the look tool asks for it. */
export function level(planet: Planet, biome: string, mode: string, seed: number): Level {
  const spec = levelSpec(planet, mode as never, seed, 0.2);
  spec.biomes = planet.biomes.filter((b) => b.id === biome);
  const terrain = new Terrain(spec.seed, spec.biomes.map((b) => ({ biome: b, length: spec.length })));
  return { terrain, z0: 60, z1: terrain.end };
}

type Kind = 'scenery' | 'collider' | 'landmark' | 'set';
/** A prop's part in the picture: set pieces, landmarks (the big scenery, see Terrain.landmark), colliders, scenery. */
const kindOf = (p: { obstacle: boolean; role?: string; foot?: number }): Kind => (p.role ? 'set' : p.foot !== undefined ? 'landmark' : p.obstacle ? 'collider' : 'scenery');

/** Every prop of the level, over the field and out to the side the camera sees (±1.3 × the field). */
function props(lv: Level, reach = HALF_W * 1.3) {
  return lv.terrain
    .chunksBetween(lv.z1, lv.z0)
    .flatMap((c) => c.props)
    .filter((p) => p.z <= lv.z0 && p.z > lv.z1 && Math.abs(p.x) <= reach)
    .map((p) => ({ ...p, as: kindOf(p) }));
}

/**
 * Clark–Evans: the mean distance to the nearest neighbour over what scatter would give at that
 * density (with Donnelly's correction for the edges). 1 is scatter, lower is grouped, higher even.
 */
export function clumping(lv: Level): number {
  const ps = props(lv, HALF_W);
  const n = ps.length;
  if (n < 3) return NaN;
  let sum = 0;
  for (const p of ps) {
    let best = Infinity;
    for (const q of ps) if (q !== p) best = Math.min(best, (p.x - q.x) ** 2 + (p.z - q.z) ** 2);
    sum += Math.sqrt(best);
  }
  const W = HALF_W * 2;
  const H = lv.z0 - lv.z1;
  const A = W * H;
  const P = 2 * (W + H);
  const expected = 0.5 * Math.sqrt(A / n) + (0.0514 + 0.041 / Math.sqrt(n)) * (P / n);
  return sum / n / expected;
}

/**
 * The narrowest the way through gets: down the level a unit at a time, the widest run of open
 * flight plane across the field (no ground over the flight line, no collider within touching), and
 * the least of those per screen. In world units.
 */
export function lanes(lv: Level): { z: number; open: number }[] {
  const t = lv.terrain;
  const out: { z: number; open: number }[] = [];
  for (let s = lv.z0; s > lv.z1; s -= SCREEN) {
    let least = Infinity;
    for (let z = s; z > Math.max(lv.z1, s - SCREEN); z -= 1) {
      const cols = [...t.colliders(0, z, HALF_W + 2)].filter((c) => Math.abs(c.z - z) < c.r + TOUCH);
      let run = 0;
      let best = 0;
      for (let x = -HALF_W; x <= HALF_W; x += 0.5) {
        const shut = t.solid(x, z) || cols.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + TOUCH) ** 2);
        run = shut ? 0 : run + 0.5;
        best = Math.max(best, run);
      }
      least = Math.min(least, best);
    }
    out.push({ z: s, open: least });
  }
  return out;
}

export interface Screen {
  z: number;
  scenery: number;
  colliders: number;
  landmarks: number;
}

/** What's on each screen of the level (scenery, colliders, landmarks and set pieces), counted in the sim. */
export function budget(lv: Level): Screen[] {
  const ps = props(lv, HALF_W + 10);
  const out: Screen[] = [];
  for (let s = lv.z0; s > lv.z1; s -= SCREEN) {
    const on = ps.filter((p) => p.z <= s && p.z > s - SCREEN);
    out.push({
      z: s,
      scenery: on.filter((p) => p.as === 'scenery').length,
      colliders: on.filter((p) => p.as === 'collider').length,
      landmarks: on.filter((p) => p.as === 'landmark' || p.as === 'set').length,
    });
  }
  return out;
}

/**
 * The level from above, one tall strip (3 px a unit, the start at the bottom, as it scrolls): the ground over the
 * flight line in black, scenery in grey, colliders in red, landmarks and set pieces in gold, the
 * field's edges and each screen marked.
 */
export function strip(lv: Level, file: string) {
  const K = 3;
  const X = 60;
  const w = X * 2 * K;
  const h = Math.ceil((lv.z0 - lv.z1) * K);
  const d = new Uint8Array(w * h * 3).fill(0xd8);
  const put = (px: number, py: number, c: number[]) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    d.set(c, (py * w + px) * 3);
  };
  const at = (x: number, z: number) => [Math.round((x + X) * K), Math.round((z - lv.z1) * K)] as const;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const x = px / K - X;
      const z = lv.z1 + py / K;
      if (lv.terrain.solid(x, z, 0)) put(px, py, [0x22, 0x1c, 0x24]);
      else if (Math.abs(x) > HALF_W) put(px, py, [0xc4, 0xc0, 0xc8]);
    }
  const disc = (x: number, z: number, r: number, c: number[]) => {
    const [cx, cy] = at(x, z);
    const R = Math.max(1, r * K);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= R * R) put(Math.round(cx + dx), Math.round(cy + dy), c);
  };
  const colour: Record<Kind, number[]> = { scenery: [0x7a, 0x76, 0x80], collider: [0xd0, 0x30, 0x28], landmark: [0xe0, 0xa8, 0x20], set: [0xe0, 0xa8, 0x20] };
  for (const p of props(lv, X)) {
    const m = metaOf(p.kind, p.variant);
    const foot = p.foot ?? (m ? (Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]) * p.s) / 2 : 1);
    if (p.as === 'collider') for (const c of p.cols) disc(c.x, c.z, c.r, colour.collider);
    // (a span is a band across, flown under: its legs are its colliders)
    else if (p.role === 'span') {
      for (let x = p.x - foot; x <= p.x + foot; x += 1 / K) disc(x, p.z, 0.5, colour.set);
      for (const c of p.cols) disc(c.x, c.z, c.r, colour.collider);
    } else disc(p.x, p.z, Math.max(0.6, foot), colour[p.as]);
  }
  for (let s = lv.z0; s > lv.z1; s -= SCREEN) for (let px = 0; px < w; px += 2) put(px, at(0, s)[1], [0x30, 0x60, 0xd0]);
  for (let py = 0; py < h; py++) {
    put(at(-HALF_W, 0)[0], py, [0x30, 0x60, 0xd0]);
    put(at(HALF_W, 0)[0], py, [0x30, 0x60, 0xd0]);
  }
  save({ w, h, d }, file);
}
