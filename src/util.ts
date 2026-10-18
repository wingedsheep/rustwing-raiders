/** Small seeded helpers shared by everything: random numbers, noise and easing. */

export type Rng = () => number;

/** A seeded random source in [0, 1) (mulberry32). */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const range = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const irange = (r: Rng, a: number, b: number) => Math.floor(a + (b - a + 1) * r());
export const pick = <T>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export function shuffle<T>(r: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}
/** Picks from weighted entries ([item, weight]). */
export function weighted<T>(r: Rng, xs: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of xs) total += w;
  let x = r() * total;
  for (const [v, w] of xs) if ((x -= w) <= 0) return v;
  return xs[xs.length - 1][0];
}

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoothstep = (a: number, b: number, x: number) => smooth(clamp((x - a) / (b - a), 0, 1));
/** Frame-rate independent approach: move `a` towards `b` with rate `k` per second. */
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;

function hash2(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
}

/** Fractal noise in roughly [0, 1]. */
export function fbm(x: number, y: number, seed = 0, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, y, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}

/** Ridged noise in [0, 1]: sharp crests, for cliffs and crystal ridges. */
export function ridged(x: number, y: number, seed = 0, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(noise2(x, y, seed + i * 31) * 2 - 1)) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.1;
    y *= 2.1;
  }
  return sum / norm;
}

/** Hash of a string, for seeding from names. */
export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
