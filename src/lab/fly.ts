/**
 * One fight flown headless for the wave lab: the game's own Level stepped at 60 Hz, the autopilot
 * at the stick, and a tally kept wave by wave (how long each took to clear, what it let through,
 * what it cost the ship). Plain TypeScript, so it runs in a worker (see bench-worker.ts).
 */

import { Level, type Mode } from '../sim/level';
import { levelSpec } from '../sim/run';
import type { Build } from '../sim/build';
import type { ScriptWave } from '../sim/director';
import { newPilot, pilot } from '../sim/pilot';
import { PLANETS } from '../world/planets';

export interface FlyJob {
  /** Where its result goes in the bench (row, column, solo/co-op, seed). */
  key: string;
  planet: string;
  mode: Mode;
  seed: number;
  difficulty: number;
  builds: Build[];
  /** The lab's waves, or null for the level's own (the director's). */
  waves: ScriptWave[] | null;
  /** Units per biome (see fitLength), or 0 for the level's own. */
  length: number;
  /** Enemy hull multiplier. */
  tough: number;
}

export interface WaveTally {
  /** Index into the job's waves (scripted), or the order it came in. */
  index: number;
  kinds: string[];
  elite: boolean;
  /** Everything in it on the ground (scrolling past one isn't it getting away). */
  ground: boolean;
  /** Distance flown when it came (to tell which of the lab's waves it is). */
  flown: number;
  /** Seconds into the level it came, and was over (killed or gone), or null if it never was. */
  start: number;
  end: number | null;
  total: number;
  killed: number;
  missed: number;
  /** Hull hits and hull lost while it was about. */
  hits: number;
  dmg: number;
  downs: number;
  /** Its enemies' hull and armour, all told. */
  pool: number;
}

export interface FlyResult {
  key: string;
  outcome: 'clear' | 'failed' | 'timeout';
  time: number;
  progress: number;
  hull: number[];
  hullMax: number[];
  /** Hull each ship lost over the level, all told (what's left at the end hides it: hull mends). */
  taken: number[];
  hits: number;
  /** Hits a shield took instead. */
  blocked: number;
  downs: number;
  causes: Record<string, number>;
  /** Damage dealt to enemies (hull and armour), and per second while there was a wave to shoot. */
  dealt: number;
  dps: number;
  /** Seconds with a wave about. */
  busy: number;
  killed: number;
  missed: number;
  /** Fliers that came, and that got away (ground things scroll past and don't count). */
  airTotal: number;
  airMissed: number;
  waves: WaveTally[];
  /** Hits that came while no wave was about (the land, hazards). */
  stray: number;
}

/** About how fast the screen moves (units a second) without boosting. */
export const PACE = 9;

/**
 * Biome length for a scripted fight: long enough to fly past the last wave and fight it out,
 * no longer (three biomes, as a raid has).
 */
export function fitLength(waves: ScriptWave[], biomes = 3) {
  const last = waves.reduce((m, w) => Math.max(m, w.at), 0);
  return Math.max(70, Math.ceil((last + 190) / biomes));
}

/** Which of the planned waves each tally is: the latest one due when it came that isn't spoken for. */
export function matchWaves<W extends { at: number }>(tallies: WaveTally[], plan: W[]): (W | null)[] {
  const taken = new Set<W>();
  return tallies.map((t) => {
    const w = [...plan].sort((a, b) => b.at - a.at).find((p) => p.at <= t.flown + 1 && !taken.has(p)) ?? null;
    if (w) taken.add(w);
    return w;
  });
}

export function fly(job: FlyJob): FlyResult {
  const planet = PLANETS.find((p) => p.id === job.planet) ?? PLANETS[0];
  const spec = levelSpec(planet, job.mode, job.seed, job.difficulty);
  if (job.length) spec.length = job.length;
  const lv = new Level(spec, job.builds);
  lv.tough = job.tough;
  if (job.waves) lv.director.script(job.waves);
  const pilots = lv.players.map(() => newPilot());
  const tallies: WaveTally[] = [];
  const pool = new Map<number, number>();
  let dealt = 0;
  let blocked = 0;
  let downs = 0;
  let stray = 0;
  let busy = 0;
  const taken = lv.players.map(() => 0);
  const grounded = new Map<number, boolean>();
  let airTotal = 0;
  let airMissed = 0;
  const limit = 60 * 60 * 6;
  for (let f = 0; f < limit; f++) {
    const seen = lv.waves.length;
    lv.step(lv.players.map((p, i) => pilot(lv, p, pilots[i])));
    // new waves: what came in them
    for (let w = seen; w < lv.waves.length; w++) {
      const of = lv.enemies.filter((e) => e.wave === w);
      tallies.push({
        index: w,
        kinds: [...new Set(of.map((e) => e.arch))],
        elite: of.some((e) => e.elite),
        ground: of.length > 0 && of.every((e) => e.ground),
        flown: -lv.scroll,
        start: lv.time,
        end: null,
        total: lv.waves[w].total,
        killed: 0,
        missed: 0,
        hits: 0,
        dmg: 0,
        downs: 0,
        pool: of.reduce((s, e) => s + e.max + e.armourMax, 0),
      });
    }
    const live = tallies.filter((t) => t.end === null);
    if (live.length) busy += 1 / 60;
    for (const e of lv.events) {
      if (e.type === 'spawn') {
        const en = lv.enemies.find((x) => x.id === e.enemy);
        if (en) {
          pool.set(en.id, en.max + en.armourMax);
          grounded.set(en.id, en.ground);
          if (!en.ground) airTotal++;
        }
      } else if (e.type === 'kill') {
        dealt += Math.max(0, pool.get(e.enemy) ?? 0);
        pool.delete(e.enemy);
      } else if (e.type === 'escaped') {
        pool.delete(e.enemy);
        if (grounded.get(e.enemy) === false) airMissed++;
      }
      else if (e.type === 'playerHit') {
        if (e.shield) blocked++;
        if (!live.length) stray++;
        const pi = lv.players.findIndex((p) => p.id === e.id);
        if (pi >= 0) taken[pi] += e.dmg ?? 0;
        for (const t of live) {
          t.hits++;
          t.dmg += e.dmg ?? 0;
        }
      } else if (e.type === 'down') {
        downs++;
        for (const t of live) t.downs++;
      }
    }
    lv.events.length = 0;
    // what the guns took off what's still flying
    for (const e of lv.enemies) {
      const was = pool.get(e.id);
      if (was === undefined || e.dead) continue;
      const now = Math.max(0, e.hp) + e.armour;
      if (now < was) dealt += was - now;
      pool.set(e.id, now);
    }
    for (const t of live) {
      const w = lv.waves[t.index];
      t.killed = w.killed;
      t.missed = w.missed;
      if (w.killed + w.missed >= w.total) t.end = lv.time;
    }
    if (lv.state === 'clear' || lv.state === 'failed') break;
  }
  const causes: Record<string, number> = {};
  for (const p of lv.players) for (const [k, v] of Object.entries(p.causes)) causes[k] = (causes[k] ?? 0) + v;
  return {
    key: job.key,
    outcome: lv.state === 'clear' ? 'clear' : lv.state === 'failed' ? 'failed' : 'timeout',
    time: lv.time,
    progress: lv.progress,
    hull: lv.players.map((p) => Math.max(0, p.down ? 0 : p.hp)),
    hullMax: lv.players.map((p) => p.stats.hp),
    taken,
    hits: lv.players.reduce((s, p) => s + p.hits, 0) - blocked,
    blocked,
    downs,
    causes,
    dealt,
    dps: dealt / Math.max(1, busy),
    busy,
    killed: lv.killed,
    missed: lv.missed,
    airTotal,
    airMissed,
    waves: tallies,
    stray,
  };
}
