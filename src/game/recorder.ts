/**
 * The flight recorder, the run's half: one file a run, with the route taken, every reward offered
 * and what was picked, every purchase, and each stage's log (sim/recording.ts: its setup, inputs
 * and tally, and the pilot's rating). It's saved after every stage, to playtests/ through the dev
 * server (server/playtests.ts), or downloaded at the run's end where there's none.
 *
 * On in the dev server and with ?rec; ?norec turns it off. `just playtest-report` reads the files,
 * and `just replay` flies a stage of one again (tools/playtest.ts).
 */

import type { Run } from '../sim/run';
import type { ChartNode } from '../sim/chart';
import type { Rating, StageLog } from '../sim/recording';
import type { Item } from './loot';

export interface RunLog {
  version: 1;
  name: string;
  /** When it began (local time), and the build it was flown on (the server stamps it). */
  started: string;
  commit?: string;
  url: string;
  seed: number;
  frames: string[];
  online: boolean;
  /** Each stop, as you landed: the sector, the site, and when (seconds into the run). */
  route: { t: number; sector: number; stop: number; kind: string; planet?: string; reward?: string; elite?: boolean; mood?: string; part?: string }[];
  /** Every choice put in front of you: where, what was on offer, and what was taken (null: none). */
  offers: { t: number; where: string; pilot: number; options: string[]; picked: string | null }[];
  buys: { t: number; pilot: number; what: string; price: number }[];
  stages: StageLog[];
  /** Seconds in flight, and outside it (menus, the chart, the hangar). */
  flightSecs: number;
  menuSecs: number;
  end?: { t: number; won: boolean; sector: number; line?: string };
}

/** A part as the logs name it: id, then tier, affix and trait where it has them. */
export const itemTag = (it: Item) => [it.id, it.tier, it.affix, it.trait].filter(Boolean).join(':');

/** The frames flown on recorded runs here, latest last, for the title's random pick. */
const FLOWN = 'rr.flown';
const flown = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FLOWN) ?? '[]') as string[];
  } catch {
    return [];
  }
};

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

class Recorder {
  log: RunLog | null = null;
  private t0 = 0;
  private flying = 0;
  private flyingSince = -1;
  private saved: 'server' | 'none' | 'unknown' = 'unknown';
  readonly enabled: boolean;

  constructor() {
    const q = new URLSearchParams(location.search);
    this.enabled = !q.has('norec') && !q.has('replay') && (import.meta.env.DEV || q.has('rec'));
  }

  get active() {
    return !!this.log;
  }

  private get now() {
    return +((performance.now() - this.t0) / 1000).toFixed(1);
  }

  begin(run: Run, online: boolean) {
    if (!this.enabled) return;
    this.t0 = performance.now();
    this.flying = 0;
    this.flyingSince = -1;
    const started = stamp();
    this.log = {
      version: 1,
      name: `${started}_run${run.seed}`,
      started,
      url: location.search,
      seed: run.seed,
      frames: run.crew.map((c) => c.build.frame),
      online,
      route: [],
      offers: [],
      buys: [],
      stages: [],
      flightSecs: 0,
      menuSecs: 0,
    };
    try {
      localStorage.setItem(FLOWN, JSON.stringify([...flown(), ...this.log.frames].slice(-40)));
    } catch {
      // no storage: the random pick just forgets
    }
    console.log(`[recorder] recording run ${run.seed} as ${this.log.name}`);
  }

  /**
   * The title's random pick, so recorded runs go round the roster: a frame never flown here if
   * there is one, else one of the half flown longest ago.
   */
  freshFrame(ids: string[]): string {
    const log = flown();
    const last = (id: string) => log.lastIndexOf(id);
    const never = ids.filter((id) => last(id) < 0);
    const pool = never.length ? never : [...ids].sort((a, b) => last(a) - last(b)).slice(0, Math.ceil(ids.length / 2));
    return pool[Math.floor(Math.random() * pool.length)];
  }

  landed(run: Run, node: ChartNode) {
    this.log?.route.push({ t: this.now, sector: run.sector, stop: run.stops, kind: node.kind, planet: node.planet?.id, reward: node.reward, elite: node.elite, mood: run.chart.mood(node) ?? undefined, part: node.part ?? undefined });
  }

  /** A stage is in the air. */
  takeoff() {
    if (this.log) this.flyingSince = performance.now();
  }

  /** A stage is over: its log in, and the run saved. */
  landedStage(stage: StageLog) {
    if (!this.log) return;
    if (this.flyingSince >= 0) this.flying += (performance.now() - this.flyingSince) / 1000;
    this.flyingSince = -1;
    stage.at = this.now;
    this.log.stages.push(stage);
    this.save();
  }

  /** The pilot's verdict on the stage just flown, and their note on it. */
  rate(r: Rating | null, note?: string) {
    const s = this.log?.stages[this.log.stages.length - 1];
    if (!s) return;
    if (r) s.rating = r;
    if (note) s.note = note;
    this.save();
  }

  offer(where: string, pilot: number, options: string[], picked: string | null) {
    this.log?.offers.push({ t: this.now, where, pilot, options, picked });
  }

  buy(pilot: number, what: string, price: number) {
    this.log?.buys.push({ t: this.now, pilot, what, price });
  }

  /** The run is over: won or lost, and a line from the pilot if they left one. */
  end(run: Run, won: boolean, line?: string) {
    if (!this.log || this.log.end) return;
    this.log.end = { t: this.now, won, sector: run.sector, line: line || undefined };
    this.save(true);
  }

  private save(last = false) {
    const log = this.log;
    if (!log) return;
    log.flightSecs = Math.round(this.flying);
    log.menuSecs = Math.round(this.now - this.flying);
    const body = JSON.stringify({ name: log.name, log });
    if (this.saved === 'none') {
      if (last) download(log);
      return;
    }
    fetch('/playtests/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((r: { commit?: string }) => {
        this.saved = 'server';
        log.commit ??= r.commit;
      })
      .catch(() => {
        // no dev server: keep it, and hand it over as a download at the end
        this.saved = 'none';
        if (last) download(log);
      });
  }
}

function download(log: RunLog) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(log)], { type: 'application/json' }));
  a.download = `${log.name}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export const recorder = new Recorder();
