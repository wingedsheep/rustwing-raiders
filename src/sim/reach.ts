/**
 * The screen as a grid in time: where a ship can get to, past what's flying. Half-unit cells held
 * as bitsets (a row of the flight plane in a few words), so growing and cutting a whole screen is
 * a few hundred word operations. Fair fire (fair.ts) uses it in the game; the pattern trials
 * (trials.ts) use it to fly patterns and find how hard each can get.
 *
 * Everything is in the screen's frame: x across, z down the screen from its middle.
 */

import { HALF_H, REACH_W } from './types';

export const H = 0.5;
export const COLS = Math.ceil((2 * REACH_W) / H);
export const ROWS = Math.ceil((2 * HALF_H) / H);
export const WORDS = Math.ceil(COLS / 32);
export const SIZE = ROWS * WORDS;
export const X0 = -REACH_W;
export const Z0 = -HALF_H;
/** How far a step's plus-then-square carries the ship, in cells (its far corners are √5 out; a little under, to be fair to the player). */
export const STEP_CELLS = 2.24;

export const cellX = (i: number) => X0 + (i + 0.5) * H;
export const cellZ = (j: number) => Z0 + (j + 0.5) * H;
export const colOf = (x: number) => Math.max(0, Math.min(COLS - 1, Math.floor((x - X0) / H)));
export const rowOf = (z: number) => Math.max(0, Math.min(ROWS - 1, Math.floor((z - Z0) / H)));

/** Where on the screen the ship can be at all (Level clamps it there). */
export const clampX = (x: number) => Math.max(-REACH_W + 1.3, Math.min(REACH_W - 1.3, x));
export const clampZ = (z: number) => Math.max(-HALF_H + 3.1, Math.min(HALF_H - 2.1, z));

/** The cells in the playfield the ship can be in at all. */
export const BOUNDS = (() => {
  const m = new Uint32Array(SIZE);
  for (let j = 0; j < ROWS; j++) {
    const z = cellZ(j);
    if (z < -HALF_H + 3 || z > HALF_H - 2) continue;
    for (let i = 0; i < COLS; i++) if (Math.abs(cellX(i)) < REACH_W - 1.2) m[j * WORDS + (i >> 5)] |= 1 << (i & 31);
  }
  return m;
})();

// --- bitset rows ---------------------------------------------------------------------------

/** Each cell and its 4 neighbours. */
export function grow4(src: Uint32Array, dst: Uint32Array) {
  for (let j = 0; j < ROWS; j++) {
    const o = j * WORDS;
    for (let w = 0; w < WORDS; w++) {
      const v = src[o + w];
      let x = v | (v << 1) | (v >>> 1);
      if (w > 0) x |= src[o + w - 1] >>> 31;
      if (w < WORDS - 1) x |= src[o + w + 1] << 31;
      if (j > 0) x |= src[o - WORDS + w];
      if (j < ROWS - 1) x |= src[o + WORDS + w];
      dst[o + w] = x;
    }
  }
}

/** Each cell and its 8 neighbours (across, then up and down). */
export function grow8(src: Uint32Array, dst: Uint32Array, tmp: Uint32Array) {
  for (let j = 0; j < ROWS; j++) {
    const o = j * WORDS;
    for (let w = 0; w < WORDS; w++) {
      const v = src[o + w];
      let x = v | (v << 1) | (v >>> 1);
      if (w > 0) x |= src[o + w - 1] >>> 31;
      if (w < WORDS - 1) x |= src[o + w + 1] << 31;
      tmp[o + w] = x;
    }
  }
  for (let j = 0; j < ROWS; j++) {
    const o = j * WORDS;
    for (let w = 0; w < WORDS; w++) dst[o + w] = tmp[o + w] | (j > 0 ? tmp[o - WORDS + w] : 0) | (j < ROWS - 1 ? tmp[o + WORDS + w] : 0);
  }
}

/** a &= ~b & BOUNDS; how many cells are left. */
export function keep(a: Uint32Array, b: Uint32Array) {
  let n = 0;
  for (let k = 0; k < SIZE; k++) {
    const v = a[k] & ~b[k] & BOUNDS[k];
    a[k] = v;
    n += popcount(v);
  }
  return n;
}

/** The cells of `a` with all 8 neighbours in it too (into `dst`); how many. */
export function shrink(a: Uint32Array, dst: Uint32Array, tmp: Uint32Array, tmp2: Uint32Array) {
  for (let k = 0; k < SIZE; k++) tmp2[k] = ~a[k];
  grow8(tmp2, dst, tmp);
  let n = 0;
  for (let k = 0; k < SIZE; k++) {
    const v = a[k] & ~dst[k];
    dst[k] = v;
    n += popcount(v);
  }
  return n;
}

export function popcount(v: number) {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export const has = (m: Uint32Array, i: number, j: number) => (m[j * WORDS + (i >> 5)] >>> (i & 31)) & 1;
export const put = (m: Uint32Array, i: number, j: number) => (m[j * WORDS + (i >> 5)] |= 1 << (i & 31));

// --- what's coming -------------------------------------------------------------------------

/** A bullet's way down the screen: (x, z) at each step, NaN once it's gone. `of`: what it belongs to (a mine's ring is its mine's). */
export interface Track<T = unknown> {
  of: T;
  r: number;
  xs: Float32Array;
  zs: Float32Array;
}

/** The cells a track sweeps through in step k (from k - 1), at reach `rr` past its middle, into `m`; `cost` counts them. */
export function sweep(tr: Track, k: number, rr: number, m: Uint32Array, cost?: Uint16Array) {
  const x1 = tr.xs[k];
  const z1 = tr.zs[k];
  if (x1 !== x1) return;
  let x0 = tr.xs[k - 1];
  let z0 = tr.zs[k - 1];
  if (x0 !== x0) {
    x0 = x1;
    z0 = z1;
  }
  const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - rr - X0) / H));
  const i1 = Math.min(COLS - 1, Math.floor((Math.max(x0, x1) + rr - X0) / H));
  const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - rr - Z0) / H));
  const j1 = Math.min(ROWS - 1, Math.floor((Math.max(z0, z1) + rr - Z0) / H));
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  for (let j = j0; j <= j1; j++) {
    const cz = cellZ(j);
    for (let i = i0; i <= i1; i++) {
      const cx = cellX(i);
      const u = len2 > 0 ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / len2)) : 0;
      const ex = cx - x0 - dx * u;
      const ez = cz - z0 - dz * u;
      if (ex * ex + ez * ez > rr * rr) continue;
      put(m, i, j);
      if (cost) cost[j * COLS + i]++;
    }
  }
}

/** Does a track come within `rr` of (x, z) in step k? */
export function near(tr: Track, k: number, x: number, z: number, rr: number) {
  const x1 = tr.xs[k];
  if (x1 !== x1) return false;
  const z1 = tr.zs[k];
  const x0 = tr.xs[k - 1] === tr.xs[k - 1] ? tr.xs[k - 1] : x1;
  const z0 = tr.zs[k - 1] === tr.zs[k - 1] ? tr.zs[k - 1] : z1;
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  const u = len2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2)) : 0;
  return (x - x0 - dx * u) ** 2 + (z - z0 - dz * u) ** 2 < rr * rr;
}

/** The step kernel (a plus, then a square): every cell offset one step can carry the ship. */
export const STEP: [number, number][] = [];
for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) if (Math.abs(di) + Math.abs(dj) <= 3) STEP.push([di, dj]);
