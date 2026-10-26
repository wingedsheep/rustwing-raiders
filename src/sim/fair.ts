/**
 * Fair fire: there is always a way through, for a player who reads the screen well.
 *
 * Every frame something fires, the new bullets are checked against everything already flying:
 * is there still a path, flown at a human share of the ship's top speed and without a dash, that
 * keeps clear of every bullet (with a gap you can see, not a pixel), the land and the foes' bodies
 * for the next `horizon` seconds, and ends with room to spare? If there isn't, the fewest new
 * bullets that close it are taken out before they're ever seen: a ring gets its hole where the
 * way out runs, a wall its gap. And a new shot that would hit the ship where it's already going
 * sooner than anyone could react is taken out as well (unless it's fired from point blank: you
 * chose to be there).
 *
 * It's a safety net, not the design: a fight's patterns should leave their gaps by themselves
 * (see docs/wave-design.md). What it had to take out is counted on the level (`lv.fair`) by who
 * fired it, so the bench shows the patterns that need their gaps built in.
 *
 * How: the screen as a grid of half-unit cells, in bitsets, stepped through time. Each step the
 * cells the ship can be in grow by how far it flies in a step (a plus, then a square: close to a
 * disc) and lose what each bullet sweeps through in that step. Bullets are predicted the way
 * updateBullets moves them (turning, speeding up, a mine bursting into its ring). Everything is in
 * the screen's frame: the ship is carried with the screen, the fire and the land come down it.
 */

import type { Bullet, Level, Player } from './level';
import { REACH_W } from './types';
import { COLS, H, ROWS, SIZE, STEP_CELLS, WORDS, X0, Z0, clampX, clampZ, grow4, grow8, has, keep, near, put, sweep, type Track as Path } from './reach';

type Track = Path<Bullet>;

/** How hard a fight may ask of the player's eyes and hands. */
export interface Reading {
  /** Seconds before a new shot can be answered: nothing new may hit where the ship is already going sooner. */
  react: number;
  /** The share of top speed a dodge is counted at (nobody flies the perfect line). */
  pace: number;
  /** Clearance kept round every bullet beyond the hit itself (units): a gap you can see. */
  margin: number;
  /** How far ahead the way out must hold (s). */
  horizon: number;
  /** Room left at the end (units²): a way out, not into a coffin. */
  room: number;
}

/**
 * Waves ask less than bosses. A boss may ask Silksong's reflexes (a Grand Mother Silk or a
 * Trobbio: short tells, fast fire, narrow but always-there gaps); a wave is something you fly
 * through while you shoot.
 */
export const READING: Record<'wave' | 'boss', Reading> = {
  wave: { react: 0.4, pace: 0.75, margin: 0.45, horizon: 1.6, room: 4 },
  boss: { react: 0.3, pace: 0.85, margin: 0.3, horizon: 1.6, room: 2.5 },
};

/** Point blank: fire from this close (units) is the player's choice to be there, not an ambush. */
const POINT_BLANK = 6;
/** The land and the obstacles keep the ship's body off them by this much (Level's BODY). */
const BODY = 0.7;
/** Homing fire (torpedoes, seekers) can't be predicted far: only this long (s). */
const HOMING = 0.5;

/** What fair fire has done this level: for the bench and the flight recorder. */
export interface FairLog {
  /** Frames with new fire checked. */
  checks: number;
  /** Volleys that had to be opened up, and the bullets taken out of them. */
  carved: number;
  removed: number;
  /** Shots taken out as too quick to see. */
  unreadable: number;
  /** Frames the old fire alone had already shut every way (a hole elsewhere: lasers, hazards, the autopilot's line). */
  shut: number;
  /** Bullets taken out, by who fired them. */
  by: Record<string, number>;
}

export const newFairLog = (): FairLog => ({ checks: 0, carved: 0, removed: 0, unreadable: 0, shut: 0, by: {} });

// --- what's coming -------------------------------------------------------------------------

/** Where `b` will be on the screen at each of `n` steps of `dt` (as updateBullets moves it), and its ring if it bursts in time. */
function track(lv: Level, b: Bullet, dt: number, n: number, out: Track[]) {
  const xs = new Float32Array(n + 1).fill(NaN);
  const zs = new Float32Array(n + 1).fill(NaN);
  const scroll = lv.speedNow;
  const drift = b.kind === 'seeker' ? 0 : b.kind === 'mine' && lv.state !== 'boss' ? 0.7 : 1;
  const homing = b.kind === 'torpedo' || b.kind === 'seeker';
  let x = b.x;
  let z = b.z - lv.scroll;
  let vx = b.vx;
  let vz = b.vz;
  let t = b.t;
  for (let k = 0; k <= n; k++) {
    if (k > 0) {
      if (b.turn) {
        const c = Math.cos(b.turn * dt);
        const s = Math.sin(b.turn * dt);
        const v = vx * c - vz * s;
        vz = vx * s + vz * c;
        vx = v;
      } else if (b.accel && !homing) {
        const sp = Math.hypot(vx, vz) || 1;
        const f = Math.max(0.5, sp + b.accel * dt) / sp;
        vx *= f;
        vz *= f;
      }
      x += vx * dt;
      z += (vz + scroll * drift) * dt;
      t += dt;
    }
    if (t > b.life || (homing && k * dt > HOMING)) {
      if (b.split && t > b.life) {
        const sp = b.splitV ?? lv.fireSpeed(9);
        for (let q = 0; q < b.split; q++) {
          const a = b.splitA + (q / b.split) * Math.PI * 2;
          ring(xs, zs, k, n, dt, x, z, Math.sin(a) * sp, Math.cos(a) * sp + scroll, b, out);
        }
      }
      break;
    }
    xs[k] = x;
    zs[k] = z;
  }
  out.push({ of: b, r: b.r, xs, zs });
}

/** A mine's ring, from step `k0` on (straight out, plain orbs). */
function ring(_xs: Float32Array, _zs: Float32Array, k0: number, n: number, dt: number, x: number, z: number, vx: number, vz: number, of: Bullet, out: Track[]) {
  const xs = new Float32Array(n + 1).fill(NaN);
  const zs = new Float32Array(n + 1).fill(NaN);
  for (let k = k0; k <= n; k++) {
    xs[k] = x + vx * (k - k0) * dt;
    zs[k] = z + vz * (k - k0) * dt;
  }
  out.push({ of, r: 0.4, xs, zs });
}

// --- the land, by world row (it doesn't move: kept as the screen passes over it) ------------

const lands = new WeakMap<Level, { terrain: unknown; rows: Map<number, Uint32Array> }>();

/** The cells of world row `r` (z from r·H) the ship's body can't be in. */
function landRows(lv: Level, r0: number, r1: number) {
  let c = lands.get(lv);
  if (!c || c.terrain !== lv.terrain) lands.set(lv, (c = { terrain: lv.terrain, rows: new Map() }));
  const rows = c.rows;
  let lo = r0;
  while (lo <= r1 && rows.has(lo)) lo++;
  let hi = r1;
  while (hi >= lo && rows.has(hi)) hi--;
  if (lo <= hi) {
    const z0 = lo * H;
    const z1 = (hi + 1) * H;
    const fresh = new Map<number, Uint32Array>();
    for (let r = lo; r <= hi; r++) {
      if (rows.has(r)) continue;
      const m = new Uint32Array(WORDS);
      const z = (r + 0.5) * H;
      for (let i = 0; i < COLS; i++) if (lv.terrain.solid(X0 + (i + 0.5) * H, z)) m[i >> 5] |= 1 << (i & 31);
      fresh.set(r, m);
    }
    for (const col of lv.terrain.colliders(0, (z0 + z1) / 2, Math.max(REACH_W, (z1 - z0) / 2))) {
      const rr = col.r + BODY;
      for (const [r, m] of fresh) {
        const dz = (r + 0.5) * H - col.z;
        if (Math.abs(dz) >= rr) continue;
        const w = Math.sqrt(rr * rr - dz * dz);
        const a = Math.max(0, Math.ceil((col.x - w - X0) / H - 0.5));
        const b = Math.min(COLS - 1, Math.floor((col.x + w - X0) / H - 0.5));
        for (let i = a; i <= b; i++) m[i >> 5] |= 1 << (i & 31);
      }
    }
    for (const [r, m] of fresh) rows.set(r, m);
    // (what's gone off the bottom won't be back)
    for (const r of rows.keys()) if (r > r1 + 40) rows.delete(r);
  }
  return rows;
}

// --- the check -----------------------------------------------------------------------------

/** One look ahead: the steps' timing and every bullet's track. */
interface Ahead {
  dt: number;
  n: number;
  tracks: Track[];
}

/** Checks this frame's new fire against everything flying; takes out what shuts every way. Call once a frame, after everything has fired. */
export function fairFire(lv: Level) {
  let any = false;
  for (const b of lv.bullets) if (b.fresh && !b.dead) any = true;
  if (!any) return;
  const rules = READING[lv.state === 'boss' ? 'boss' : 'wave'];
  lv.fair.checks++;
  for (const p of lv.players) {
    if (p.down || p.out) continue;
    checkFor(lv, p, rules);
  }
  for (const b of lv.bullets) b.fresh = false;
}

function checkFor(lv: Level, p: Player, rules: Reading) {
  const speed = p.stats.speed * (p.slow > 0 ? 0.55 : 1) * rules.pace;
  const dt = (STEP_CELLS * H) / Math.max(4, speed);
  const n = Math.ceil(rules.horizon / dt);
  const ahead: Ahead = { dt, n, tracks: [] };
  for (const b of lv.bullets) if (!b.dead) track(lv, b, dt, n, ahead.tracks);
  const px = p.x;
  const pz = p.z - lv.scroll;

  // too quick to see: a new shot that meets the ship where it's going before anyone could react
  const hitR = p.stats.core;
  for (const tr of ahead.tracks) {
    const b = tr.of;
    if (!b.fresh || b.dead || (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < POINT_BLANK ** 2) continue;
    for (let k = 1; k <= n && k * dt <= rules.react; k++) {
      const t = k * dt;
      if (near(tr, k, clampX(px + p.vx * t), clampZ(pz + p.vz * t), tr.r + hitR)) {
        take(lv, b);
        lv.fair.unreadable++;
        break;
      }
    }
  }

  const old = (tr: Track) => !tr.of.fresh;
  const all = (tr: Track) => !tr.of.dead;
  if (ways(lv, p, rules, ahead, all).ok) return;
  // shut: is it this volley's doing?
  const before = ways(lv, p, rules, ahead, old, true);
  if (!before.ok) {
    lv.fair.shut++;
    return;
  }
  carve(lv, p, rules, ahead, before.layers!);
}

/** What step k's fire and land shut (bullets picked by `use`), into `m`. */
function shutAt(lv: Level, p: Player, rules: Reading, ahead: Ahead, k: number, use: (tr: Track) => boolean, m: Uint32Array, cost?: Uint16Array) {
  m.fill(0);
  const core = p.stats.core;
  for (const tr of ahead.tracks) if (use(tr)) sweep(tr, k, tr.r + core + rules.margin, m, cost);
  // the foes' bodies (where they are now: the screen carries the flyers, the land the rest)
  for (const e of lv.enemies) {
    if (e.dead || e.t < 0 || e.state === 'hidden') continue;
    const ez = e.z - lv.scroll + (e.ground ? lv.speedNow * k * ahead.dt : 0);
    const rr = e.r * 0.75 + core + rules.margin;
    const i0 = Math.max(0, Math.floor((e.x - rr - X0) / H));
    const i1 = Math.min(COLS - 1, Math.floor((e.x + rr - X0) / H));
    const j0 = Math.max(0, Math.floor((ez - rr - Z0) / H));
    const j1 = Math.min(ROWS - 1, Math.floor((ez + rr - Z0) / H));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if ((X0 + (i + 0.5) * H - e.x) ** 2 + (Z0 + (j + 0.5) * H - ez) ** 2 < rr * rr) put(m, i, j);
  }
  // the land, as the screen will have moved over it
  const scroll = lv.scroll - lv.speedNow * k * ahead.dt;
  const r0 = Math.floor((Z0 + scroll) / H);
  const rows = landRows(lv, r0, r0 + ROWS);
  for (let j = 0; j < ROWS; j++) {
    const row = rows.get(Math.floor((Z0 + (j + 0.5) * H + scroll) / H));
    if (row) for (let w = 0; w < WORDS; w++) m[j * WORDS + w] |= row[w];
  }
}

/** Is there a way through (bullets picked by `use`)? With `keepLayers`, where the ship can be at each step. */
function ways(lv: Level, p: Player, rules: Reading, ahead: Ahead, use: (tr: Track) => boolean, keepLayers = false) {
  const i = Math.floor((clampX(p.x) - X0) / H);
  const j = Math.floor((clampZ(p.z - lv.scroll) - Z0) / H);
  let can = new Uint32Array(SIZE);
  put(can, i, j);
  const layers = keepLayers ? [can.slice()] : null;
  const shut = new Uint32Array(SIZE);
  const a = new Uint32Array(SIZE);
  const tmp = new Uint32Array(SIZE);
  let left = 1;
  for (let k = 1; k <= ahead.n; k++) {
    shutAt(lv, p, rules, ahead, k, use, shut);
    grow4(can, a);
    keep(a, shut);
    grow8(a, can, tmp);
    left = keep(can, shut);
    layers?.push(can.slice());
    if (!left) return { ok: false };
  }
  return { ok: left * H * H >= rules.room, layers };
}

/** Opens the way: the path through the old fire that crosses the least new fire, and the new bullets on it taken out. */
function carve(lv: Level, p: Player, rules: Reading, ahead: Ahead, layers: Uint32Array[]) {
  const { n } = ahead;
  const cells = ROWS * COLS;
  const BIG = 1 << 30;
  // cost[k][cell]: the least new fire crossed to be there at step k
  const costs: Int32Array[] = [];
  let prev = new Int32Array(cells).fill(BIG);
  const i0 = Math.floor((clampX(p.x) - X0) / H);
  const j0 = Math.floor((clampZ(p.z - lv.scroll) - Z0) / H);
  prev[j0 * COLS + i0] = 0;
  costs.push(prev);
  const fresh = (tr: Track) => !!tr.of.fresh && !tr.of.dead;
  const scratch = new Uint32Array(SIZE);
  const hits = new Uint16Array(cells);
  const plus = new Int32Array(cells);
  const across = new Int32Array(cells);
  const at = (a: Int32Array, i: number, j: number) => (i < 0 || j < 0 || i >= COLS || j >= ROWS ? BIG : a[j * COLS + i]);
  for (let k = 1; k <= n; k++) {
    hits.fill(0);
    shutAt(lv, p, rules, ahead, k, fresh, scratch, hits);
    const cur = new Int32Array(cells).fill(BIG);
    const can = layers[k];
    // a step's reach, as `ways` grows it: the plus, then the square (each pass a cell wider than
    // the next needs; nothing past where the ship could have got to by now)
    const ia = Math.max(0, i0 - 2 * k - 1);
    const ib = Math.min(COLS - 1, i0 + 2 * k + 1);
    const ja = Math.max(0, j0 - 2 * k - 1);
    const jb = Math.min(ROWS - 1, j0 + 2 * k + 1);
    for (let j = ja; j <= jb; j++)
      for (let i = ia; i <= ib; i++)
        plus[j * COLS + i] = Math.min(prev[j * COLS + i], at(prev, i - 1, j), at(prev, i + 1, j), at(prev, i, j - 1), at(prev, i, j + 1));
    for (let j = ja; j <= jb; j++)
      for (let i = ia + 1; i < ib; i++) across[j * COLS + i] = Math.min(plus[j * COLS + i - 1], plus[j * COLS + i], plus[j * COLS + i + 1]);
    for (let j = ja + 1; j < jb; j++)
      for (let i = ia + 1; i < ib; i++) {
        if (!has(can, i, j)) continue;
        const c = j * COLS + i;
        const best = Math.min(across[c - COLS], across[c], across[c + COLS]);
        if (best < BIG) cur[c] = best + hits[c];
      }
    costs.push(cur);
    prev = cur;
  }
  // the cheapest end (ties: the nearest to where the ship is)
  let end = -1;
  let endCost = BIG;
  for (let c = 0; c < cells; c++) {
    const v = prev[c];
    if (v < endCost || (v === endCost && v < BIG && Math.abs((c % COLS) - i0) + Math.abs(Math.floor(c / COLS) - j0) < Math.abs((end % COLS) - i0) + Math.abs(Math.floor(end / COLS) - j0))) {
      end = c;
      endCost = v;
    }
  }
  if (end < 0) return;
  // back along it
  const path = [end];
  for (let k = n; k > 0; k--) {
    const c = path[path.length - 1];
    const i = c % COLS;
    const j = Math.floor(c / COLS);
    let best = -1;
    let bv = BIG;
    for (let dj = -2; dj <= 2; dj++)
      for (let di = -2; di <= 2; di++) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= COLS || jj >= ROWS || Math.abs(di) + Math.abs(dj) > 3) continue;
        const v = costs[k - 1][jj * COLS + ii];
        if (v < bv) {
          bv = v;
          best = jj * COLS + ii;
        }
      }
    path.push(best);
  }
  path.reverse();
  // every new bullet that comes near the path (with a cell's slack) is taken out
  const core = p.stats.core;
  let removed = 0;
  for (const tr of ahead.tracks) {
    if (!fresh(tr)) continue;
    const rr = tr.r + core + rules.margin + H;
    for (let k = 1; k <= n; k++) {
      const c = path[k];
      if (near(tr, k, X0 + ((c % COLS) + 0.5) * H, Z0 + (Math.floor(c / COLS) + 0.5) * H, rr)) {
        take(lv, tr.of);
        removed++;
        break;
      }
    }
  }
  if (removed) lv.fair.carved++;
}

/** Takes a bullet out before it's seen. */
function take(lv: Level, b: Bullet) {
  if (b.dead) return;
  b.dead = true;
  lv.fair.removed++;
  const who = b.from ?? '?';
  lv.fair.by[who] = (lv.fair.by[who] ?? 0) + 1;
}
