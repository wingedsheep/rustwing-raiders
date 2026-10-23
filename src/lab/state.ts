/**
 * The wave lab's state: the stage of the run, the waves, how the range and the bench are set.
 * Kept in localStorage (and a composition can go in the URL's hash, to send someone).
 */

import type { Mode } from '../sim/level';
import { formatWaves, parseWaves, type ScriptWave } from '../sim/director';
import { PLANETS } from '../world/planets';
import { ARCHETYPES, DANGERS, LADDER, buildOf, difficultyAt, expectedAt, type Stage } from './catalog';
import type { Build } from '../sim/build';

export interface LabWave extends ScriptWave {
  id: number;
}

export type Tab = 'range' | 'bench' | 'bestiary' | 'forge';
export type PilotMode = 'bot' | 'you' | 'partner';

export interface State {
  planet: string;
  mode: Mode;
  seed: number;
  sector: number;
  stop: number;
  danger: string;
  /** Fly the lab's waves, or the level's own. */
  source: 'script' | 'game';
  waves: LabWave[];
  tab: Tab;
  /** Ships: 'auto' (the ladder's at this stage), a ladder id, or 'arch:<loadout>'. */
  ship: string;
  ship2: string;
  coop: boolean;
  pilot: PilotMode;
  speed: number;
  tough: number;
  muted: boolean;
  group: string;
  bench: BenchSettings;
  saved: Record<string, string>;
}

export interface BenchSettings {
  seeds: number;
  solo: boolean;
  coop: boolean;
  archetypes: boolean;
  /** Enemy hull multiplier in co-op (the game has none for waves; the boss gets 1.5). */
  coopHp: number;
  /** Seconds to clear a wave, and share of the hull a fight should cost: the "on target" band. */
  ttk: [number, number];
  hull: [number, number];
  /** Most of a fight's enemies that may get away before it's too hard (a weak ship lets them by rather than taking longer). */
  leak: number;
}

const KEY = 'rr.wavelab';

const DEFAULT: State = {
  planet: 'orutal',
  mode: 'raid',
  seed: 1,
  sector: 1,
  stop: 3,
  danger: 'calm',
  source: 'script',
  waves: [],
  tab: 'range',
  ship: 'auto',
  ship2: 'auto',
  coop: false,
  pilot: 'bot',
  speed: 1,
  tough: 1,
  muted: true,
  group: 'all',
  bench: { seeds: 2, solo: true, coop: true, archetypes: true, coopHp: 1, ttk: [3, 10], hull: [0.1, 0.4], leak: 0.3 },
  saved: {},
};

let nextId = 1;
export const waveId = () => nextId++;

function load(): State {
  let s: State = structuredClone(DEFAULT);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const got = JSON.parse(raw) as Partial<State>;
      s = { ...s, ...got, bench: { ...s.bench, ...(got.bench ?? {}) } };
    }
  } catch {
    /* storage unavailable: start fresh */
  }
  // #w=<waves>&p=<planet>…: a composition someone sent
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('w')) {
    s.waves = parseWaves(hash.get('w')!).map((w) => ({ ...w, id: 0 }));
    s.source = 'script';
    if (hash.get('p')) s.planet = hash.get('p')!;
    if (hash.get('m')) s.mode = hash.get('m') as Mode;
    if (hash.get('st')) [s.sector, s.stop] = hash.get('st')!.split('.').map(Number);
    history.replaceState(null, '', location.pathname + location.search);
  }
  // ?tab=forge: open on that tab
  const tab = new URLSearchParams(location.search).get('tab') as Tab | null;
  if (tab && ['range', 'bench', 'bestiary', 'forge'].includes(tab)) s.tab = tab;
  for (const w of s.waves) w.id = waveId();
  if (!PLANETS.some((p) => p.id === s.planet)) s.planet = DEFAULT.planet;
  if (s.waves.length === 0 && !raw()) s.waves = starter();
  return s;
}

const raw = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/** A first composition to look at: one of each kind of trouble, met alone, then a squad. */
function starter(): LabWave[] {
  return parseWaves('dart@30,ramjack@75,flakker@120,swooper@160,elite:hookjaw@210,warden@265,prism@269').map((w) => ({ ...w, id: waveId() }));
}

type Listener = (s: State, changed: Set<keyof State>) => void;

class Store {
  s: State = load();
  private ls: Listener[] = [];
  private saveT = 0;

  on(l: Listener) {
    this.ls.push(l);
  }

  set(patch: Partial<State>) {
    const changed = new Set(Object.keys(patch) as (keyof State)[]);
    this.s = { ...this.s, ...patch };
    if (changed.has('waves')) this.s.waves = [...this.s.waves].sort((a, b) => a.at - b.at);
    for (const l of this.ls) l(this.s, changed);
    clearTimeout(this.saveT);
    this.saveT = window.setTimeout(() => this.save(), 200);
  }

  setBench(patch: Partial<BenchSettings>) {
    this.set({ bench: { ...this.s.bench, ...patch } });
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.s));
    } catch {
      /* storage unavailable */
    }
  }

  get stage(): Stage {
    return { sector: this.s.sector, stop: this.s.stop };
  }

  /** The difficulty the stage and the site's danger come to. */
  get difficulty() {
    return difficultyAt(this.stage, DANGERS.find((d) => d.id === this.s.danger)?.extra ?? 0);
  }

  link() {
    const q = new URLSearchParams({ w: formatWaves(this.s.waves), p: this.s.planet, m: this.s.mode, st: `${this.s.sector}.${this.s.stop}` });
    return `${location.origin}${location.pathname}#${q}`;
  }
}

export const store = new Store();

// --- ships ----------------------------------------------------------------------------------

export interface ShipPick {
  id: string;
  name: string;
  note: string;
  build: Build;
}

/** A ship pick ('auto', a ladder id, 'arch:<loadout>') at a stage: archetypes come at the ladder's tier there. */
export function shipAt(id: string, stage: Stage): ShipPick {
  const at = expectedAt(stage);
  if (id === 'auto' || !id) {
    const l = LADDER[at];
    return { id: l.id, name: l.name, note: `${l.note} (the likely ship here)`, build: buildOf(l) };
  }
  if (id.startsWith('arch:')) {
    const a = ARCHETYPES.find((x) => x.loadout === id.slice(5)) ?? ARCHETYPES[0];
    const tier = LADDER[at].tier;
    return { id, name: a.name, note: `${a.note}, ${tier} parts`, build: buildOf({ loadout: a.loadout, frame: 'kestrel', tier }) };
  }
  const l = LADDER.find((x) => x.id === id) ?? LADDER[0];
  return { id: l.id, name: l.name, note: l.note, build: buildOf(l) };
}

export const SHIP_OPTIONS = () => [
  { value: 'auto', label: 'Likely ship at this stage' },
  ...LADDER.map((l) => ({ value: l.id, label: `${l.name}: ${l.note}` })),
  ...ARCHETYPES.map((a) => ({ value: `arch:${a.loadout}`, label: `${a.name}: ${a.note}` })),
];
