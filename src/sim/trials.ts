/**
 * Pattern trials: attack patterns flown in pure shapes, to find how hard each can get and still be
 * dodged by a player who reads the screen well, and how far to push it at each point in a run.
 *
 * Three parts:
 *
 * 1. **Patterns** as pure shapes: a ring with its hole, a fan, an aimed burst, a wall with a gap,
 *    a spiral, rain. Each FAMILY turns one knob, `s` (0..1), into its numbers: 0 is gentle, 1 is
 *    brutal (more bullets, quicker, sooner, smaller holes).
 * 2. **The reader**: a pilot with a human's limits. It sees a bullet only `react` seconds after
 *    it's fired and flies at `pace` of the ship's top speed; it thinks again every `think`
 *    seconds. Each time it thinks, it plans through the gaps with the reach grid (reach.ts):
 *    every cell it could be in over the next `horizon` seconds past everything it has seen (held
 *    `margin` clear), the roomiest of the last ones, the cells it can still get there from, and
 *    the way there that fire crosses least soon (a late dodge is the one that's hit).
 * 3. **The verdict and the frontier**: a pattern is dodgeable for a reader if the reader flies it
 *    for `TRIAL` seconds on `SEEDS` seeds (where the emitter stands, where the ship starts, where
 *    the holes fall) and is hit on no more than `SLIPS` of them (the pilot's own slips). The
 *    frontier is the largest `s` that's still dodgeable, found by bisection. A reader that finds
 *    the way is a proof that there is one: the frontier is a floor, never an overestimate.
 *
 * Over a run, the readers get sharper (READERS: slower eyes and hands on the first stop, a sharp
 * player at the last boss), and each pattern is flown at a share of that reader's frontier (PUSH).
 * So the patterns are pushed further and further as the run goes on, but never past what a player
 * of that stage can be shown to dodge. tools/trials.ts runs it all and writes the table
 * (src/generated/trials.json) that `patternAt` reads.
 *
 * Everything is in true units (after FIRE_PACE and SHIP_PACE) and in the screen's frame.
 */

import { HALF_H, HALF_W, REACH_W } from './types';
import { clamp, lerp, rng, type Rng } from '../util';
import { COLS, H, ROWS, SIZE, STEP, STEP_CELLS, WORDS, cellX, cellZ, clampX, clampZ, colOf, grow4, grow8, has, keep, put, rowOf, shrink, sweep, type Track } from './reach';

// --- patterns -------------------------------------------------------------------------------

/** One attack, in pure shapes. Angle 0 is down the screen; speeds are true units a second. */
export type Shape =
  /** A ring of `n`, `hole` of them left out on the ship's side (to one side of it, so it has to go there). */
  | { kind: 'ring'; n: number; speed: number; every: number; spin: number; hole: number }
  /** `n` over `arc` radians, at the ship (`aimed`) or straight down. */
  | { kind: 'fan'; n: number; arc: number; speed: number; every: number; aimed: boolean }
  /** `burst` shots at the ship, `gap` seconds apart. */
  | { kind: 'burst'; burst: number; gap: number; speed: number; every: number }
  /** A row across the screen, `spacing` apart, with a hole `hole` units wide near the ship. */
  | { kind: 'wall'; spacing: number; hole: number; speed: number; every: number }
  /** `arms` arms turning at `spin` rad/s, a shot down each every `every`. */
  | { kind: 'spiral'; arms: number; speed: number; every: number; spin: number }
  /** One shot from a random spot along the top, every `every`. */
  | { kind: 'rain'; speed: number; every: number };

/** Something that fires a shape: where it stands (it sways), its body, its bullets' size. */
export interface Emitter {
  shape: Shape;
  x: number;
  z: number;
  /** Sways across this far (units), this fast (rad/s). */
  sway: number;
  swayW: number;
  /** Its body (0: none, e.g. a wall comes from off the screen). */
  body: number;
  /** Its bullets' radius. */
  r: number;
  /** Starts firing this long in (s). */
  from: number;
}

/** A pattern family: the knobs it turns as `s` goes from gentle (0) to brutal (1), and how one is set up. */
export interface Family {
  id: string;
  /** What each knob is at s = 0 and at s = 1 (for the table and the doc). */
  knobs: Record<string, [number, number]>;
  make: (s: number, rand: Rng) => Emitter[];
}

const at = (knobs: Record<string, [number, number]>, s: number) => {
  const o: Record<string, number> = {};
  for (const [k, [a, b]] of Object.entries(knobs)) o[k] = lerp(a, b, s);
  return o;
};

/** A foe up the screen, swaying. */
const foe = (shape: Shape, rand: Rng, r = 0.45): Emitter => ({ shape, x: (rand() - 0.5) * 40, z: -HALF_H + 10 + rand() * 4, sway: 4 + rand() * 6, swayW: 0.5 + rand() * 0.5, body: 2, r, from: 0.3 + rand() * 0.4 });

const RING = { n: [12, 96], speed: [8, 40], every: [1.6, 0.15], hole: [6, 1] } as Record<string, [number, number]>;
const FAN = { n: [5, 27], arc: [0.8, 2.2], speed: [9, 40], every: [1.3, 0.18] } as Record<string, [number, number]>;
const BURST = { burst: [3, 20], gap: [0.14, 0.02], speed: [12, 64], every: [1.4, 0.15] } as Record<string, [number, number]>;
const WALL = { spacing: [2.6, 1.1], hole: [8, 1.6], speed: [7, 30], every: [2, 0.3] } as Record<string, [number, number]>;
const SPIRAL = { arms: [3, 8], speed: [8, 20], every: [0.14, 0.04], spin: [1.4, 3.4] } as Record<string, [number, number]>;
const RAIN = { speed: [10, 60], every: [0.3, 0.002] } as Record<string, [number, number]>;

export const FAMILIES: Record<string, Family> = {
  ring: {
    id: 'ring',
    knobs: RING,
    make: (s, rand) => {
      const k = at(RING, s);
      return [foe({ kind: 'ring', n: Math.round(k.n), speed: k.speed, every: k.every, spin: (rand() - 0.5) * 2, hole: Math.max(0, Math.round(k.hole)) }, rand)];
    },
  },
  fan: {
    id: 'fan',
    knobs: FAN,
    make: (s, rand) => {
      const k = at(FAN, s);
      return [foe({ kind: 'fan', n: Math.round(k.n), arc: k.arc, speed: k.speed, every: k.every, aimed: true }, rand)];
    },
  },
  burst: {
    id: 'burst',
    knobs: BURST,
    make: (s, rand) => {
      const k = at(BURST, s);
      return [foe({ kind: 'burst', burst: Math.round(k.burst), gap: k.gap, speed: k.speed, every: k.every }, rand, 0.35)];
    },
  },
  wall: {
    id: 'wall',
    knobs: WALL,
    make: (s, rand) => {
      const k = at(WALL, s);
      return [{ shape: { kind: 'wall', spacing: k.spacing, hole: k.hole, speed: k.speed, every: k.every }, x: 0, z: -HALF_H - 1, sway: 0, swayW: 0, body: 0, r: 0.5, from: 0.2 + rand() * 0.5 }];
    },
  },
  spiral: {
    id: 'spiral',
    knobs: SPIRAL,
    make: (s, rand) => {
      const k = at(SPIRAL, s);
      return [foe({ kind: 'spiral', arms: Math.round(k.arms), speed: k.speed, every: k.every, spin: k.spin * (rand() < 0.5 ? -1 : 1) }, rand)];
    },
  },
  rain: {
    id: 'rain',
    knobs: RAIN,
    make: (s, rand) => {
      const k = at(RAIN, s);
      return [{ shape: { kind: 'rain', speed: k.speed, every: k.every }, x: 0, z: -HALF_H - 1, sway: 0, swayW: 0, body: 0, r: 0.4, from: 0.2 }];
    },
  },
};

// --- the reader -----------------------------------------------------------------------------

/** A player's eyes and hands. */
export interface Reader {
  name: string;
  /** Seconds after a bullet is fired before it's answered. */
  react: number;
  /** The share of the ship's top speed it counts on when it plans (it flies flat out: the rest is its turns and its slips). */
  pace: number;
  /** Clearance it keeps round every bullet (units, beyond the hit): how true it flies its line. The same for every reader: it's the trial pilot's own accuracy (its plan is in half-unit cells), not the player's skill. */
  margin: number;
  /** How far ahead it plans (s), and how often it thinks again (s). */
  horizon: number;
  think: number;
}

/**
 * The readers over a run: the first stop asks little of eyes and hands, the last boss asks a
 * sharp player's. Silksong's fast hits give 0.45–0.8 s of tell and its combos chain 0.25 s apart
 * (docs/wave-design.md): the last reader answers in 0.25 s.
 */
export const READERS: Reader[] = [
  { name: 'first stop', react: 0.55, pace: 0.5, margin: 0.5, horizon: 1.2, think: 0.1 },
  { name: 'early', react: 0.45, pace: 0.6, margin: 0.5, horizon: 1.2, think: 0.1 },
  { name: 'mid', react: 0.38, pace: 0.7, margin: 0.5, horizon: 1.2, think: 0.1 },
  { name: 'late', react: 0.3, pace: 0.8, margin: 0.5, horizon: 1.2, think: 0.1 },
  { name: 'last boss', react: 0.25, pace: 0.9, margin: 0.5, horizon: 1.2, think: 0.1 },
];

/**
 * How close to the reader's frontier a pattern is flown, from the first stop to the last boss: a
 * wave leaves room for everything else going on (shooting, the land, a second foe); a boss is the
 * test, and the last one asks nearly all of it.
 */
export const PUSH: Record<'wave' | 'boss', [number, number]> = { wave: [0.55, 0.85], boss: [0.75, 0.97] };

/** The ship the trials fly: the starter Kestrel's numbers (stats(loadout('starter', 'kestrel')), with SHIP_PACE). */
export interface Ship {
  speed: number;
  accel: number;
  core: number;
  stop: number;
}
export const SHIP: Ship = { speed: 33.8, accel: 284, core: 0.3, stop: 0.8 };

// --- the sandbox ----------------------------------------------------------------------------

const FRAME = 1 / 60;
/** How long a trial is flown (s), and on how many seeds. */
export const TRIAL = 10;
export const SEEDS = 10;
/** Seeds it may be hit on and still pass: the trial pilot's own slips (it's a planner on a half-unit grid, not a perfect player). */
export const SLIPS = 1;
/**
 * Where the reader likes to sit, tried in turn on a seed till one gets through: low, high, lower.
 * A player picks their spot for the pattern; one pilot with one habit would make the frontier
 * about the habit. Any that gets through shows there's a way.
 */
export const HOMES = [12, 4, 18];
/** How fast the screen moves on (units a second): fire comes down it this much quicker. A boss holds it still. */
export const SCROLL = { wave: 9, boss: 0 };

interface Shot {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  /** Fired at (s). */
  at: number;
  dead: boolean;
}

interface Live {
  e: Emitter;
  x: number;
  z: number;
  next: number;
  spin: number;
  /** Shots of a burst still to fire, and when the next. */
  left: number;
  burstAt: number;
}

/** What happened in a trial. */
export interface Flight {
  hit: boolean;
  /** When (s), if it was. */
  t: number;
  /** The nearest any bullet came (units, edge to edge with the core). */
  closest: number;
  /** Frame by frame, for the viewer (`record`): the ship and every bullet. */
  frames?: { x: number; z: number; shots: number[]; foes: number[]; goal: [number, number] | null }[];
}

export interface TrialOpts {
  scroll?: number;
  ship?: Ship;
  duration?: number;
  record?: boolean;
  /** Where the reader likes to sit when nothing's coming (z, down the screen from its middle). */
  home?: number;
  /** Each time the reader thinks: what it saw and where it chose to go (for debugging the reader). */
  trace?: (t: number, ship: { x: number; z: number; vx: number; vz: number }, seen: { x: number; z: number; vx: number; vz: number; r: number }[], goal: { x: number; z: number } | null) => void;
}

/** Flies `emitters` with `reader` for a trial, from a seed (where the ship starts, the holes, the rain). */
export function fly(emitters: Emitter[], reader: Reader, seed: number, opts: TrialOpts = {}): Flight {
  const ship = opts.ship ?? SHIP;
  const scroll = opts.scroll ?? SCROLL.wave;
  const rand = rng(seed * 7919 + 17);
  const lives: Live[] = emitters.map((e) => ({ e, x: e.x, z: e.z, next: e.from, spin: rand() * Math.PI * 2, left: 0, burstAt: 0 }));
  const shots: Shot[] = [];
  const p = { x: (rand() - 0.5) * 20, z: 12, vx: 0, vz: 0 };
  let goal: { x: number; z: number } | null = null;
  let thinkAt = 0;
  let closest = 99;
  const frames: Flight['frames'] = opts.record ? [] : undefined;
  const duration = opts.duration ?? TRIAL;
  const plan = planner(reader, ship, opts.home ?? HOMES[0]);
  const fire = (x: number, z: number, a: number, speed: number, r: number, t: number) =>
    shots.push({ x, z, vx: Math.sin(a) * speed, vz: Math.cos(a) * speed, r, at: t, dead: false });
  const toShip = (x: number, z: number) => Math.atan2(p.x - x, p.z - z);

  for (let f = 0; f * FRAME < duration; f++) {
    const t = f * FRAME;
    // the emitters
    for (const l of lives) {
      const e = l.e;
      l.x = e.x + Math.sin(t * e.swayW) * e.sway;
      const s = e.shape;
      if (s.kind === 'burst' && l.left > 0 && t >= l.burstAt) {
        fire(l.x, l.z, toShip(l.x, l.z), s.speed, e.r, t);
        l.left--;
        l.burstAt = t + s.gap;
      }
      // (as often as it fires, even more than once a frame)
      for (; t >= l.next; l.next += s.every) {
        switch (s.kind) {
          case 'ring': {
            const step = (Math.PI * 2) / s.n;
            // (the hole falls to one side of the ship, not on it: you go to it, as to a web's gap)
            const aim = toShip(l.x, l.z) + (rand() - 0.5) * 1.1;
            l.spin += s.spin * s.every;
            for (let k = 0; k < s.n; k++) {
              const a = l.spin + k * step;
              const off = Math.abs(Math.atan2(Math.sin(a - aim), Math.cos(a - aim)));
              if (s.hole > 0 && off < (s.hole / 2) * step) continue;
              fire(l.x, l.z, a, s.speed, e.r, t);
            }
            break;
          }
          case 'fan': {
            const mid = s.aimed ? toShip(l.x, l.z) : 0;
            for (let k = 0; k < s.n; k++) fire(l.x, l.z, mid + (s.n === 1 ? 0 : (k / (s.n - 1) - 0.5) * s.arc), s.speed, e.r, t);
            break;
          }
          case 'burst':
            l.left = s.burst;
            l.burstAt = t;
            break;
          case 'wall': {
            const hx = clamp(p.x + (rand() - 0.5) * 20, -HALF_W + 4, HALF_W - 4);
            for (let x = -REACH_W - rand() * s.spacing; x <= REACH_W + 1; x += s.spacing) if (Math.abs(x - hx) > s.hole / 2 + e.r) fire(x, l.z, 0, s.speed, e.r, t);
            break;
          }
          case 'spiral':
            l.spin += s.spin * s.every;
            for (let k = 0; k < s.arms; k++) fire(l.x, l.z, l.spin + (k / s.arms) * Math.PI * 2, s.speed, e.r, t);
            break;
          case 'rain':
            fire((rand() - 0.5) * 2 * REACH_W, l.z, 0, s.speed, e.r, t);
            break;
        }
      }
    }
    // the reader
    if (t >= thinkAt) {
      thinkAt = t + reader.think;
      const seen = shots.filter((b) => !b.dead && t - b.at >= reader.react);
      goal = plan(p, seen, lives, scroll);
      opts.trace?.(t, p, seen, goal);
    }
    let mx = 0;
    let mz = 0;
    if (goal) {
      const dx = goal.x - p.x;
      const dz = goal.z - p.z;
      const d = Math.hypot(dx, dz);
      // (flat out, like a pad's stick: the plan is made at `pace`, so flying faster keeps it on time
      // through the ship's turns; it holds on a spot it's on)
      const k = 1;
      if (d > 0.3) {
        mx = (dx / d) * k;
        mz = (dz / d) * k;
      }
    }
    // the ship, as Level.updatePlayer flies it
    const a = ship.accel * FRAME;
    p.vx += clamp(mx * ship.speed - p.vx, -a, a);
    p.vz += clamp(mz * ship.speed - p.vz, -a, a);
    if (Math.abs(mx) < 0.1) p.vx *= ship.stop;
    if (Math.abs(mz) < 0.1) p.vz *= ship.stop;
    p.x = clamp(p.x + p.vx * FRAME, -REACH_W + 1.2, REACH_W - 1.2);
    p.z = clamp(p.z + p.vz * FRAME, -HALF_H + 3, HALF_H - 2);
    // the fire
    for (const b of shots) {
      if (b.dead) continue;
      const dx = b.vx * FRAME;
      const dz = (b.vz + scroll) * FRAME;
      b.x += dx;
      b.z += dz;
      if (Math.abs(b.x) > HALF_W + 6 || b.z > HALF_H + 6 || b.z < -HALF_H - 6) {
        b.dead = true;
        continue;
      }
      // (along the frame's whole move: a quick shot doesn't skip over the ship)
      const u = clamp(((p.x - b.x + dx) * dx + (p.z - b.z + dz) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      const gap = Math.hypot(b.x - dx * (1 - u) - p.x, b.z - dz * (1 - u) - p.z) - b.r - ship.core;
      if (gap < closest) closest = gap;
      if (gap < 0) {
        frames?.push(snap(p, shots, lives, goal));
        return { hit: true, t, closest, frames };
      }
    }
    // (its body too)
    for (const l of lives) if (l.e.body && Math.hypot(l.x - p.x, l.z - p.z) < l.e.body + ship.core) return { hit: true, t, closest: 0, frames };
    if (frames) frames.push(snap(p, shots, lives, goal));
  }
  return { hit: false, t: duration, closest, frames };
}

const snap = (p: { x: number; z: number }, shots: Shot[], lives: Live[], goal: { x: number; z: number } | null) => {
  const out: number[] = [];
  for (const b of shots) if (!b.dead) out.push(Math.round(b.x * 10) / 10, Math.round(b.z * 10) / 10, b.r);
  const foes: number[] = [];
  for (const l of lives) if (l.e.body) foes.push(l.x, l.z, l.e.body);
  return { x: p.x, z: p.z, shots: out, foes, goal: goal ? ([goal.x, goal.z] as [number, number]) : null };
};

/**
 * The reader's planning: where to fly next. Every cell it could reach over the horizon past the
 * bullets it has seen (each held `margin` clear), the roomiest of the last ones (shrunk in from
 * the bullets as far as it'll go, then nearest home: low and central, the ship's own way), and the
 * first step of a way there.
 */
export function planner(reader: Reader, ship: Ship, home = HOMES[0]) {
  const speed = ship.speed * reader.pace;
  const dt = (STEP_CELLS * H) / speed;
  const n = Math.ceil(reader.horizon / dt);
  const layers = Array.from({ length: n + 1 }, () => new Uint32Array(SIZE));
  const shuts = Array.from({ length: n + 1 }, () => new Uint32Array(SIZE));
  const viable = Array.from({ length: n + 1 }, () => new Uint32Array(SIZE));
  /** How far ahead (steps) a cell about to be crossed counts against it: about half a second. */
  const soon = Math.max(2, Math.round(0.5 / dt));
  /** The least danger on a way from each cell at each step to the end (danger: how much of the next half second fire crosses it). */
  const togo = Array.from({ length: n + 1 }, () => new Float32Array(ROWS * COLS));
  const crossed = Array.from({ length: n + 2 }, () => new Uint8Array(ROWS * COLS));
  const plusMin = new Float32Array(ROWS * COLS);
  const rowMin = new Float32Array(ROWS * COLS);
  const a = new Uint32Array(SIZE);
  const tmp = new Uint32Array(SIZE);
  const tmp2 = new Uint32Array(SIZE);
  const core = new Uint32Array(SIZE);
  const best = new Uint32Array(SIZE);
  const tracks: Track[] = [];

  return (p: { x: number; z: number }, seen: Shot[], lives: Live[], scroll: number) => {
    // what it has seen, flown on
    tracks.length = 0;
    for (const b of seen) {
      const xs = new Float32Array(n + 1);
      const zs = new Float32Array(n + 1);
      for (let k = 0; k <= n; k++) {
        xs[k] = b.x + b.vx * k * dt;
        zs[k] = b.z + (b.vz + scroll) * k * dt;
      }
      tracks.push({ of: b, r: b.r, xs, zs });
    }
    const i0 = colOf(clampX(p.x));
    const j0 = rowOf(clampZ(p.z));
    // as tight as it likes, else tighter, else as tight as it must
    let last = 0;
    for (const margin of [reader.margin, reader.margin / 2, 0]) {
      layers[0].fill(0);
      put(layers[0], i0, j0);
      last = 0;
      for (let k = 1; k <= n; k++) {
        const shut = shuts[k];
        shut.fill(0);
        for (const tr of tracks) sweep(tr, k, tr.r + ship.core + margin, shut);
        for (const l of lives) if (l.e.body) disc(shut, l.x, l.z, l.e.body + ship.core + margin);
        grow4(layers[k - 1], a);
        keep(a, shut);
        grow8(a, layers[k], tmp);
        if (!keep(layers[k], shut)) break;
        last = k;
      }
      if (last === n) break;
    }
    if (last === 0) return null;
    // the roomiest of where it can be at the end
    best.set(layers[last]);
    for (let q = 0; q < 8; q++) {
      if (!shrink(best, core, tmp, tmp2)) break;
      best.set(core);
    }
    // of those, the nearest home (low and central, the ship's own way)
    let end = -1;
    let ed = Infinity;
    for (let w = 0; w < SIZE; w++) {
      let v = best[w];
      while (v) {
        const b = 31 - Math.clz32(v & -v);
        v &= v - 1;
        const j = Math.floor(w / WORDS);
        const i = (w % WORDS) * 32 + b;
        const d = (cellX(i) * 0.6) ** 2 + (cellZ(j) - home) ** 2 + 0.5 * ((cellX(i) - p.x) ** 2 + (cellZ(j) - p.z) ** 2);
        if (d < ed) {
          ed = d;
          end = j * COLS + i;
        }
      }
    }
    const ei = end % COLS;
    const ej = Math.floor(end / COLS);
    // the cells it can still get to the roomy ones from, step by step back from the end
    viable[last].set(best);
    for (let k = last - 1; k >= 1; k--) {
      grow8(viable[k + 1], a, tmp);
      grow4(a, viable[k]);
      for (let w = 0; w < SIZE; w++) viable[k][w] &= layers[k][w];
    }
    // the least danger from each of those to the end, back from the end (danger: how much of the
    // next half second fire crosses a cell; a late dodge is the one that's hit, so a way out of a
    // lane early beats one that waits in it)
    const box = (k: number) => [Math.max(0, i0 - 2 * k), Math.min(COLS - 1, i0 + 2 * k), Math.max(0, j0 - 2 * k), Math.min(ROWS - 1, j0 + 2 * k)];
    // (how many of the next `soon` steps fire crosses each cell: counted back from the end, a window sliding down)
    {
      const [ia, ib, ja, jb] = box(last);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) crossed[last][j * COLS + i] = has(shuts[last], i, j);
    }
    for (let k = last - 1; k >= 1; k--) {
      const [ia, ib, ja, jb] = box(k);
      const out = k + soon + 1 <= last ? shuts[k + soon + 1] : null;
      for (let j = ja; j <= jb; j++)
        for (let i = ia; i <= ib; i++) {
          const c = j * COLS + i;
          crossed[k][c] = crossed[k + 1][c] + has(shuts[k], i, j) - (out ? has(out, i, j) : 0);
        }
    }
    // (and a little for being far from the end at every step: with nothing coming, it heads there and holds)
    const far = (i: number, j: number) => 0.004 * ((i - ei) ** 2 + (j - ej) ** 2);
    {
      const [ia, ib, ja, jb] = box(last);
      const t = togo[last];
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) t[j * COLS + i] = has(viable[last], i, j) ? 0.02 * ((i - ei) ** 2 + (j - ej) ** 2) : Infinity;
    }
    // (a step's reach is a plus, then a square: the least of the next step's over each, in two passes)
    const get = (m: Float32Array, i: number, j: number) => (i < 0 || j < 0 || i >= COLS || j >= ROWS ? Infinity : m[j * COLS + i]);
    for (let k = last - 1; k >= 1; k--) {
      const [ia, ib, ja, jb] = box(k);
      const pa = Math.max(0, ia - 1);
      const pb = Math.min(COLS - 1, ib + 1);
      const qa = Math.max(0, ja - 1);
      const qb = Math.min(ROWS - 1, jb + 1);
      const t = togo[k];
      const next = togo[k + 1];
      for (let j = qa; j <= qb; j++)
        for (let i = pa; i <= pb; i++) plusMin[j * COLS + i] = Math.min(get(next, i, j), get(next, i - 1, j), get(next, i + 1, j), get(next, i, j - 1), get(next, i, j + 1));
      for (let j = qa; j <= qb; j++)
        for (let i = ia; i <= ib; i++) rowMin[j * COLS + i] = Math.min(plusMin[j * COLS + i], i > pa ? plusMin[j * COLS + i - 1] : Infinity, i < pb ? plusMin[j * COLS + i + 1] : Infinity);
      for (let j = ja; j <= jb; j++)
        for (let i = ia; i <= ib; i++) {
          const c = j * COLS + i;
          if (!has(viable[k], i, j)) {
            t[c] = Infinity;
            continue;
          }
          t[c] = crossed[k][c] + far(i, j) + Math.min(rowMin[c], j > qa ? rowMin[c - COLS] : Infinity, j < qb ? rowMin[c + COLS] : Infinity);
        }
    }
    // and on from the ship, down the least dangerous way, two steps (a goal far enough to fly at)
    let i = i0;
    let j = j0;
    for (let k = 1; k <= Math.min(2, last); k++) {
      let bi = i;
      let bj = j;
      let bv = Infinity;
      for (const [di, dj] of STEP) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= COLS || jj >= ROWS || !has(viable[k], ii, jj)) continue;
        const v = togo[k][jj * COLS + ii];
        if (v < bv) {
          bv = v;
          bi = ii;
          bj = jj;
        }
      }
      i = bi;
      j = bj;
    }
    return { x: cellX(i), z: cellZ(j) };
  };
}

function disc(m: Uint32Array, x: number, z: number, r: number) {
  for (let j = rowOf(z - r); j <= rowOf(z + r); j++)
    for (let i = colOf(x - r); i <= colOf(x + r); i++) if ((cellX(i) - x) ** 2 + (cellZ(j) - z) ** 2 < r * r) put(m, i, j);
}

// --- the verdict and the frontier -------------------------------------------------------------

export interface Verdict {
  /** Seeds flown clean, of all. */
  clean: number;
  seeds: number;
  /** The nearest call over the clean ones (units). */
  closest: number;
}

/** Flies a pattern (families at `s`, together) on every seed. */
export function judge(families: string[], s: number, reader: Reader, opts: TrialOpts & { seeds?: number } = {}): Verdict {
  const seeds = opts.seeds ?? SEEDS;
  let clean = 0;
  let closest = 99;
  for (let seed = 1; seed <= seeds; seed++) {
    const rand = rng(seed * 104729 + 3);
    const ems = families.flatMap((id) => FAMILIES[id].make(s, rand));
    const f = HOMES.reduce<Flight | null>((got, home) => (got && !got.hit ? got : fly(ems, reader, seed, { ...opts, home })), null)!;
    if (!f.hit) {
      clean++;
      closest = Math.min(closest, f.closest);
    } else if (seed - clean > SLIPS) break; // (it's not passing)
  }
  return { clean, seeds, closest };
}

/** The largest s (to 1/2^steps) a reader flies clean on every seed: 0 if not even the gentlest, 1 if even the most brutal. */
export function frontier(families: string[], reader: Reader, opts: TrialOpts & { seeds?: number; steps?: number } = {}) {
  const pass = (s: number) => {
    const v = judge(families, s, reader, opts);
    return v.seeds - v.clean <= SLIPS;
  };
  if (!pass(0)) return 0;
  if (pass(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < (opts.steps ?? 7); k++) {
    const mid = (lo + hi) / 2;
    if (pass(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// --- over a run -------------------------------------------------------------------------------

/** What the trials found (src/generated/trials.json): each family's frontier for each reader. */
export interface TrialTable {
  readers: string[];
  frontier: Record<string, number[]>;
}

/** The reader for a point in the run (0: the first stop, 1: the last boss), between the two nearest. */
export function readerAt(progress: number): { lo: number; hi: number; t: number } {
  const x = clamp(progress, 0, 1) * (READERS.length - 1);
  const lo = Math.floor(x);
  return { lo, hi: Math.min(READERS.length - 1, lo + 1), t: x - lo };
}

/** How hard a family is flown at a point in the run: a share (PUSH) of what that point's reader can be shown to dodge. */
export function pushAt(table: TrialTable, family: string, progress: number, kind: keyof typeof PUSH) {
  const f = table.frontier[family];
  if (!f) return 0;
  const r = readerAt(progress);
  return lerp(f[r.lo], f[r.hi], r.t) * lerp(PUSH[kind][0], PUSH[kind][1], clamp(progress, 0, 1));
}

/** The numbers of a family's attack at a point in the run. */
export function patternAt(table: TrialTable, family: string, progress: number, kind: keyof typeof PUSH) {
  return at(FAMILIES[family].knobs, pushAt(table, family, progress, kind));
}
