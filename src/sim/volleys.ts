/**
 * Enemy fire by pattern family: every foe and boss fires one of the families the trials measure
 * (src/sim/trials.ts: ring, fan, burst, wall, spiral, rain), at the numbers the trials' tables give
 * for this point in the run.
 *
 * The table is the ceiling: what a player of this stage can be shown to dodge, pushed as far as
 * the run says (docs/wave-design.md). A foe fires at a `share` of it (its weight: a skirmisher
 * light, a heavy most of it, a boss all of it) and may fire less than that, never more: fewer
 * bullets, a wider fan, a bigger hole, a longer pause. Less is always easier, so it stays
 * dodgeable; that's where a foe's own character goes. The speed is the table's.
 *
 * Speeds here are true speeds (Level.shoot), not scaled again by the pace and the difficulty: the
 * tables already are.
 */

import type { Bullet, Enemy, Level } from './level';
import { FAMILIES, pushAt, type TrialTable } from './trials';
import { clamp, lerp } from '../util';
import WAVE from '../generated/trials_wave.json';
import BOSS from '../generated/trials_boss.json';

const TABLES: Record<'wave' | 'boss', TrialTable> = { wave: WAVE, boss: BOSS };

/** The run's difficulty at its last boss (run.ts: the third sector's fifth stop). */
const LAST = 1.44;
/** An elite fires this much more of its family than its kind does. */
const ELITE = 1.25;

export interface Ring {
  n: number;
  speed: number;
  every: number;
  hole: number;
}
export interface Fan {
  n: number;
  arc: number;
  speed: number;
  every: number;
}
export interface Burst {
  burst: number;
  gap: number;
  speed: number;
  every: number;
}
export interface Wall {
  spacing: number;
  hole: number;
  speed: number;
  every: number;
}
export interface Spiral {
  arms: number;
  speed: number;
  every: number;
  spin: number;
}
export interface Rain {
  speed: number;
  every: number;
}
interface Families {
  ring: Ring;
  fan: Fan;
  burst: Burst;
  wall: Wall;
  spiral: Spiral;
  rain: Rain;
}
export type Family = keyof Families;

/**
 * How much of its family a foe fires, by its weight: a skirmisher a light share (there are a lot of
 * them at once), a line foe more, a heavy most, a boss all. (Several foes fire at once in a wave;
 * the wave tables leave room for that, and fair fire is the net under it.)
 */
export const SHARE = { light: 0.4, mid: 0.6, heavy: 0.8, boss: 1 };

/** Where in the run this level is: 0 the first stop, 1 the last boss. */
export const runAt = (lv: Level) => clamp(lv.spec.difficulty / LAST, 0, 1);

/** How hard (0..1, the trials' `s`) a foe's family is here: the table's push, at its share. */
export function strength(lv: Level, e: Enemy | null, family: Family, share = 1) {
  const kind = e?.boss || lv.state === 'boss' ? 'boss' : 'wave';
  return clamp(pushAt(TABLES[kind], family, runAt(lv), kind) * share * (e?.elite ? ELITE : 1), 0, 1);
}

/**
 * A family's numbers for a foe here: its share of the count, the rate and the hole, and the table's
 * full speed (fewer shots at the table's speed is still less than the table: still dodgeable).
 * Counts are whole and holes rounded up: never past the table.
 */
export function pattern<F extends Family>(lv: Level, e: Enemy | null, family: F, share = 1): Families[F] {
  const s = strength(lv, e, family, share);
  const full = strength(lv, e, family, 1);
  const o: Record<string, number> = {};
  for (const [k, [a, b]] of Object.entries(FAMILIES[family].knobs)) o[k] = lerp(a, b, k === 'speed' ? full : s);
  for (const k of ['n', 'arms', 'burst']) if (k in o) o[k] = Math.max(1, Math.floor(o[k]));
  if ('hole' in o) o.hole = family === 'ring' ? Math.ceil(o.hole) : o.hole;
  return o as unknown as Families[F];
}

// --- firing (true speeds) -------------------------------------------------------------------

type Opts = Partial<Bullet>;

/** `n` (of the fan's, at most) over `arc` round `mid`. */
export function fan(lv: Level, x: number, z: number, mid: number, k: { n: number; arc: number; speed: number }, opts: Opts = {}) {
  const out: Bullet[] = [];
  for (let i = 0; i < k.n; i++) out.push(lv.shoot(x, z, mid + (k.n === 1 ? 0 : (i / (k.n - 1) - 0.5) * k.arc), k.speed, opts));
  return out;
}

/** A ring of `n` from `off`, `hole` of them left out round `holeAt` (if it's given). */
export function ring(lv: Level, x: number, z: number, k: { n: number; speed: number; hole?: number }, off = 0, holeAt?: number, opts: Opts = {}) {
  const step = (Math.PI * 2) / k.n;
  const out: Bullet[] = [];
  for (let i = 0; i < k.n; i++) {
    const a = off + i * step;
    if (holeAt !== undefined && k.hole && Math.abs(Math.atan2(Math.sin(a - holeAt), Math.cos(a - holeAt))) < (k.hole / 2) * step) continue;
    out.push(lv.shoot(x, z, a, k.speed, opts));
  }
  return out;
}

/** `arms` shots spread evenly round from `angle`. */
export function arms(lv: Level, x: number, z: number, angle: number, k: { arms: number; speed: number }, opts: Opts = {}) {
  for (let i = 0; i < k.arms; i++) lv.shoot(x, z, angle + (i / k.arms) * Math.PI * 2, k.speed, opts);
}

/** A row from `x0` to `x1` at `z`, `spacing` apart, down the screen, with a hole `hole` wide round each of `holes`. */
export function wall(lv: Level, z: number, x0: number, x1: number, holes: number[], k: { spacing: number; hole: number; speed: number }, opts: Opts = {}) {
  const r = opts.r ?? 0.45;
  for (let x = x0; x <= x1; x += k.spacing) if (!holes.some((h) => Math.abs(x - h) < k.hole / 2 + r)) lv.shoot(x, z, 0, k.speed, opts);
}
