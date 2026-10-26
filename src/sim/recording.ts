/**
 * The flight recorder's own half (see docs/simple-run.md#you-play-i-tune-the-flight-recorder):
 * what a stage was built from, every tick's input, and a tally of how it went, all plain data.
 * The sim is deterministic, so a stage's setup and its inputs fly it again exactly, here in the
 * browser or headless in tools/playtest.ts. The run around the stages is game/recorder.ts.
 *
 * Inputs are rounded before the sim sees them (sticks to 1/127, the boost to 1/255), live and in a
 * replay alike, so what's written down is exactly what was flown.
 */

import { Level, type LevelEvent, type Mode } from './level';
import type { Intent } from './types';
import type { Build } from './build';
import type { Grafts } from '../game/grafts';
import type { CoreKit } from '../game/core';
import { planetById } from '../world/planets';

/** Everything a Level is made from (the planet and biomes by id). */
export interface StageSetup {
  planet: string;
  biomes: string[];
  mode: Mode;
  seed: number;
  difficulty: number;
  length: number;
  builds: Build[];
  hull?: number[];
  grafts?: Grafts[];
  kits?: CoreKit[];
  call: number;
  /** The test switches that change the sim (&tough, &combos, &charged). */
  tough: number;
  combos: boolean;
  charged: boolean;
}

export function levelFrom(s: StageSetup): Level {
  const planet = planetById(s.planet);
  const biomes = s.biomes.map((id) => planet.biomes.find((b) => b.id === id)!);
  const spec = { planet, biomes, mode: s.mode, seed: s.seed, difficulty: s.difficulty, length: s.length };
  const lv = new Level(spec, structuredClone(s.builds), s.hull && [...s.hull], s.grafts && structuredClone(s.grafts), s.kits && structuredClone(s.kits), s.call);
  lv.tough = s.tough;
  lv.combos = s.combos;
  return lv;
}

/** A tick of the forge's &charged: the special fills back up in 3 s. */
export function charge(lv: Level) {
  for (const p of lv.players) p.charge = Math.min(1, p.charge + 1 / 180);
}

// --- the inputs ---

const FLAGS = ['fire', 'heavy', 'dash', 'special', 'aux', 'focus'] as const;

/** An intent as the sim will see it: sticks to 1/127, the boost to 1/255. */
export function rounded(i: Intent): Intent {
  return { ...i, x: Math.round(clamp1(i.x) * 127) / 127, y: Math.round(clamp1(i.y) * 127) / 127, boost: Math.round(Math.max(0, Math.min(1, i.boost)) * 255) / 255 };
}
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const hex2 = (n: number) => n.toString(16).padStart(2, '0');

function pack(i: Intent) {
  let f = 0;
  FLAGS.forEach((k, b) => i[k] && (f |= 1 << b));
  return hex2(Math.round(i.x * 127) + 127) + hex2(Math.round(i.y * 127) + 127) + hex2(Math.round(i.boost * 255)) + hex2(f);
}

function unpack(t: string): Intent {
  const f = parseInt(t.slice(6, 8), 16);
  const i = { x: (parseInt(t.slice(0, 2), 16) - 127) / 127, y: (parseInt(t.slice(2, 4), 16) - 127) / 127, boost: parseInt(t.slice(4, 6), 16) / 255 } as Intent;
  FLAGS.forEach((k, b) => (i[k] = !!(f & (1 << b))));
  return i;
}

/** One player's inputs, a tick at a time, run-length packed ("tok", or "tok*n" for n ticks of it). */
export class Tape {
  private runs: [string, number][] = [];
  push(i: Intent) {
    const t = pack(i);
    const last = this.runs[this.runs.length - 1];
    if (last && last[0] === t) last[1]++;
    else this.runs.push([t, 1]);
  }
  toString() {
    return this.runs.map(([t, n]) => (n > 1 ? `${t}*${n}` : t)).join(' ');
  }
  static read(s: string): Intent[] {
    const out: Intent[] = [];
    for (const r of s.split(' ').filter(Boolean)) {
      const [t, n] = r.split('*');
      const i = unpack(t);
      for (let k = 0; k < (n ? Number(n) : 1); k++) out.push(i);
    }
    return out;
  }
}

// --- the tally ---

/** Seconds from the first hit to the kill, for one kind of foe. */
export interface Kills {
  n: number;
  ttk: number[];
  escaped: number;
}

export interface PilotLog {
  hullStart: number;
  hullEnd: number;
  /** Hull lost, and hits taken, by who or what (a foe's kind, `boss:<move>`, land, laser...). */
  lost: Record<string, number>;
  hits: Record<string, number>;
  /** Hits the shield took all of, by the same. */
  shielded: Record<string, number>;
  /** Going down: when, where, and the hit that did it. */
  downs: { t: number; where: string; by: string }[];
  /** How often each verb was used (and seconds of fire, focus and boost held). */
  verbs: Record<string, number>;
  grafts: Record<string, number>;
}

export interface WardenLog {
  name: string;
  /** When it showed up, and each phase: when it began, how long it lasted, the hits it landed, by move. */
  at: number;
  phases: { at: number; secs: number; hits: number; lost: number; byMove: Record<string, number> }[];
  welds: number[];
  killed: boolean;
}

export interface StageEnd {
  state: 'clear' | 'failed' | 'quit';
  frames: number;
  time: number;
  progress: number;
  score: number;
  killed: number;
  spawned: number;
  hull: number[];
  rank: string | null;
}

export interface StageLog {
  setup: StageSetup;
  /** One packed tape per player. */
  inputs: string[];
  pilots: PilotLog[];
  kills: Record<string, Kills>;
  /** Every foe that came, by kind: how many, and their hull (for the stage's pace and weight). */
  foes?: Record<string, { n: number; hp: number }>;
  /** Damage dealt, by what dealt it (a part, a graft, a reaction). */
  dealt: Record<string, number>;
  warden: WardenLog | null;
  end: StageEnd | null;
  /** The pilot's verdict (fun / meh / unfair), if given. */
  rating?: Rating;
  /** What the pilot wrote about it, if anything. */
  note?: string;
  /** Seconds since the run began, when the stage did. */
  at?: number;
}

export type Rating = 'fun' | 'meh' | 'unfair';

const add = (r: Record<string, number>, k: string, n = 1) => (r[k] = (r[k] ?? 0) + n);

/** What kind a foe is, for the tally: its kind, an elite's own, or the boss. */
function kindOf(lv: Level, id: number) {
  const e = lv.enemies.find((e) => e.id === id);
  if (!e) return 'unknown';
  return e.boss ? 'boss' : e.elite ? `elite:${e.arch}` : e.arch;
}

/** Watches a stage tick by tick (its inputs and events) and keeps the tally. */
export class StageRecorder {
  readonly log: StageLog;
  private tapes: Tape[];
  private foes = new Map<number, { kind: string; first: number }>();
  /** Foes killed or away (a dead one stays on the list till the step's end: not to be counted again). */
  private gone = new Set<number>();
  private lastBy: string[] = [];

  constructor(
    private lv: Level,
    setup: StageSetup,
  ) {
    this.tapes = lv.players.map(() => new Tape());
    this.log = {
      setup: structuredClone(setup),
      inputs: [],
      pilots: lv.players.map((p) => ({ hullStart: p.hp, hullEnd: p.hp, lost: {}, hits: {}, shielded: {}, downs: [], verbs: {}, grafts: {} })),
      kills: {},
      foes: {},
      dealt: {},
      warden: null,
      end: null,
    };
  }

  /** Before the step: the inputs it's given (already rounded). */
  input(intents: Intent[]) {
    intents.forEach((i, k) => {
      this.tapes[k]?.push(i);
      const v = this.log.pilots[k]?.verbs;
      if (!v) return;
      if (i.fire) add(v, 'fire_secs', 1 / 60);
      if (i.focus) add(v, 'focus_secs', 1 / 60);
      if (i.boost > 0) add(v, 'boost_secs', 1 / 60);
    });
  }

  /** After the step: what came of it. */
  events(events: readonly LevelEvent[]) {
    const lv = this.lv;
    const t = lv.time;
    // (not every foe comes in with a spawn event: any new one is noted while it's still on the list)
    for (const e of lv.enemies) {
      if (this.foes.has(e.id) || this.gone.has(e.id)) continue;
      const kind = e.boss ? 'boss' : e.elite ? `elite:${e.arch}` : e.arch;
      this.foes.set(e.id, { kind, first: -1 });
      const f = (this.log.foes![kind] ??= { n: 0, hp: 0 });
      f.n++;
      f.hp += e.max;
    }
    for (const e of events) {
      const pl = 'id' in e && typeof e.id === 'number' ? this.log.pilots[e.id] : undefined;
      switch (e.type) {
        case 'hit': {
          let f = this.foes.get(e.enemy);
          if (!f) this.foes.set(e.enemy, (f = { kind: kindOf(lv, e.enemy), first: -1 }));
          if (f.first < 0) f.first = t;
          break;
        }
        case 'kill': {
          const f = this.foes.get(e.enemy) ?? { kind: kindOf(lv, e.enemy), first: t };
          const k = (this.log.kills[f.kind] ??= { n: 0, ttk: [], escaped: 0 });
          k.n++;
          k.ttk.push(+(t - (f.first < 0 ? t : f.first)).toFixed(2));
          this.foes.delete(e.enemy);
          this.gone.add(e.enemy);
          break;
        }
        case 'escaped': {
          const f = this.foes.get(e.enemy);
          const kind = f?.kind ?? e.kind;
          (this.log.kills[kind] ??= { n: 0, ttk: [], escaped: 0 }).escaped++;
          this.foes.delete(e.enemy);
          this.gone.add(e.enemy);
          break;
        }
        case 'playerHit': {
          if (!pl) break;
          const by = e.by ?? e.cause;
          this.lastBy[e.id] = by;
          add(pl.hits, by);
          if (e.shield) add(pl.shielded, by);
          else add(pl.lost, by, e.dmg ?? 0);
          const w = this.log.warden;
          if (w?.phases.length && !w.killed) {
            const ph = w.phases[w.phases.length - 1];
            ph.hits++;
            ph.lost += e.dmg ?? 0;
            add(ph.byMove, by.startsWith('boss:') ? by.slice(5) : by);
          }
          break;
        }
        case 'crash':
          if (pl) add(pl.verbs, 'crash');
          break;
        case 'down':
          pl?.downs.push({ t: +t.toFixed(1), where: this.where(), by: this.lastBy[e.id] ?? '?' });
          break;
        case 'dash':
        case 'dashDry':
        case 'perfect':
        case 'parry':
        case 'block':
        case 'aux':
        case 'special':
        case 'takedown':
        case 'graze':
        case 'jumpstart':
          if (pl) add(pl.verbs, e.type);
          break;
        case 'heavy':
          if (pl) add(pl.verbs, e.fired ? 'heavy' : 'heavyDry');
          break;
        case 'boost':
          if (pl && e.on) add(pl.verbs, 'boost');
          break;
        case 'weld':
          if (pl) add(pl.verbs, `weld_${e.state}`);
          if (e.state === 'done' && this.log.warden && !this.log.warden.killed) this.log.warden.welds.push(+t.toFixed(1));
          break;
        case 'graft':
          if (pl) add(pl.grafts, e.graft);
          break;
        case 'bossWarning':
          this.log.warden = { name: e.name, at: +t.toFixed(1), phases: [{ at: +t.toFixed(1), secs: 0, hits: 0, lost: 0, byMove: {} }], welds: [], killed: false };
          break;
        case 'bossPhase': {
          const w = this.log.warden;
          if (!w) break;
          const last = w.phases[w.phases.length - 1];
          last.secs = +(t - last.at).toFixed(1);
          w.phases.push({ at: +t.toFixed(1), secs: 0, hits: 0, lost: 0, byMove: {} });
          break;
        }
      }
    }
    // the boss down: its last phase ends
    const w = this.log.warden;
    if (w && !w.killed && w.phases.length > 0 && t > w.at + 1 && !lv.enemies.some((e) => e.boss && !e.dead)) {
      w.killed = lv.state !== 'failed';
      const last = w.phases[w.phases.length - 1];
      last.secs = +(t - last.at).toFixed(1);
    }
  }

  private where() {
    const lv = this.lv;
    return `${lv.terrain.biome(lv.scroll).id} ${Math.round(lv.progress * 100)}%`;
  }

  /** The stage is over (or given up): the tally closed and the tapes written. */
  finish(state: StageEnd['state']): StageLog {
    const lv = this.lv;
    this.log.inputs = this.tapes.map((t) => t.toString());
    this.log.dealt = Object.fromEntries(Object.entries(lv.dealtBy).map(([k, v]) => [k, Math.round(v)]));
    lv.players.forEach((p, i) => (this.log.pilots[i].hullEnd = p.down ? 0 : p.hp));
    for (const p of this.log.pilots) for (const r of [p.lost, p.verbs]) for (const k in r) r[k] = +r[k].toFixed(1);
    this.log.end = endOf(lv, state);
    const w = this.log.warden;
    if (w && !w.killed) {
      const last = w.phases[w.phases.length - 1];
      last.secs = +(lv.time - last.at).toFixed(1);
    }
    return this.log;
  }
}

/** How a stage ended: also what a replay is checked against. */
export function endOf(lv: Level, state: StageEnd['state']): StageEnd {
  return {
    state,
    frames: lv.frame,
    time: +lv.time.toFixed(2),
    progress: +lv.progress.toFixed(3),
    score: lv.score,
    killed: lv.killed,
    spawned: lv.spawned,
    hull: lv.players.map((p) => (p.down ? 0 : p.hp)),
    rank: lv.rank,
  };
}
