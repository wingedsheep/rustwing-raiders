/**
 * A run: the crew (one or two ships, their cargo and the shared scrap) across three sectors, each a
 * star system to cross (sim/chart.ts). Levels are made here from a planet and a kind of landing,
 * and so is what you find there: loot to choose from, a dealer's stock and prices.
 *
 * And the run's affairs, which last from stop to stop like a trader's: fuel; a debt to Mama Ruzz
 * that grows a tenth every jump; a Lantern Mutual policy that pays for every hole in the hull; a
 * price on your head that brings Kaspar; how each faction feels about you; a crate to deliver; a
 * doctor who owes you one. Events (sim/events.ts) change these, and they change the chart.
 */

import { PLANETS, type Planet } from '../world/planets';
import type { LevelSpec, Mode } from './level';
import { LOOT, duosOpen, startBuild, stats, type Build } from './build';
import { Chart, chartSeed, MARKET, SWEEP_SPEED, type ChartNode } from './chart';
import { PARTS, partById, type PartClass, type Rarity } from '../game/parts';
import { clamp, pick, rng, shuffle, weighted, type Rng } from '../util';
import { itemName, rollItem, rollTier, TIER_VALUE, tierOf, type Item, type Tier } from '../game/loot';

export function levelSpec(planet: Planet, mode: Mode, seed: number, difficulty: number): LevelSpec {
  const r = rng(seed);
  const open = planet.biomes.filter((b) => b.shape !== 'canyon');
  let biomes;
  if (mode === 'boss') {
    biomes = shuffle(r, [...open]).slice(0, 2);
  } else {
    // raids and hunts fly through three of the four, canyon included sometimes
    biomes = shuffle(r, [...planet.biomes]).slice(0, 3);
  }
  const length = mode === 'boss' ? 220 : 300;
  return { planet, biomes, mode, seed, difficulty, length };
}

export interface Crew {
  build: Build;
  /** Parts in the hold, not bolted on. */
  cargo: Item[];
  hull: number;
}

export const CARGO = 6;
export const SECTORS = 3;

export const PRICE: Record<Rarity, number> = { common: 30, rare: 60, epic: 110 };
export const SELL: Record<Rarity, number> = { common: 10, rare: 20, epic: 40 };
export const REPAIR = 12;
export const FUEL_PRICE = 12;
export const FUEL_MAX = 9;
/** Mama Ruzz's rate: a tenth more every jump. */
export const INTEREST = 0.1;

/** Extra difficulty, and scrap paid, by danger (0..3). */
export const DANGER_HARDER = [0, 0, 0.2, 0.42];
export const DANGER_PAY = [1, 1, 1.4, 1.9];

/** A threat (see Run.threat) as a word and a step on a five-step scale. */
export function threatTier(t: number): { step: number; word: string } {
  const steps = [0.25, 0.55, 0.9, 1.3];
  const step = steps.filter((s) => t >= s).length;
  return { step, word: ['EASY', 'FAIR', 'TOUGH', 'HARD', 'BRUTAL'][step] };
}

export interface ShopItem {
  part: Item;
  price: number;
  sold: boolean;
}

/** A sealed crate to take somewhere. */
export interface Contract {
  planet: string;
  pay: number;
  from: string;
}

/** The run's affairs at a moment, to see what an event changed. */
export interface Snapshot {
  scrap: number;
  fuel: number;
  hull: number[];
  cargo: Item[][];
  bounty: number;
  debt: number;
  policy: number;
  setback: number;
  known: number;
  contract: Contract | null;
  favours: string[];
  rep: Record<string, number>;
  boom: string;
}

export class Run {
  crew: Crew[];
  scrap = 25;
  score = 0;
  sector = 0;
  levels = 0;
  chart: Chart;
  readonly seed: number;
  /** Planets met in earlier sectors, so the next system is new ones. */
  seen: string[] = [];
  /** Stops made in this sector (difficulty rises with them). */
  stops = 0;
  r: Rng;
  stats = { kills: 0, grazes: 0, hits: 0, bosses: 0 };

  fuel = 7;
  /** Owed to Mama Ruzz. */
  debt = 0;
  /** Lantern Mutual pays this much scrap a hull lost, until the gate. */
  policy = 0;
  /** The price on your head, in steps (Kaspar comes for it). */
  bounty = 0;
  /** How each faction feels about you, -3..3. */
  rep: Record<string, number> = {};
  /** People who owe you one ('doctor': Dr Varga patches you up once when you're low). */
  favours: string[] = [];
  contract: Contract | null = null;
  /** News: a class of part a planet's dealers pay three times over for, this sector. */
  boom: { planet: string; cls: PartClass } | null = null;
  /** Times you've sold the Collector something (he pays more each time). */
  collector = 0;
  /** Events met this run (they come round less often). */
  seenEvents: string[] = [];
  /** Kaspar's been this sector already. */
  hunted = false;
  /** Where you've just landed (loot leans its way). */
  landing: ChartNode | null = null;
  /** Things to tell you when you're back on the chart. */
  notes: string[] = [];

  constructor(frames: string[], seed: number) {
    this.seed = seed;
    this.r = rng(seed ^ 0x5eed);
    this.crew = frames.map((f) => {
      const build = startBuild(f);
      return { build, cargo: [], hull: stats(build).hp };
    });
    this.chart = new Chart(chartSeed(seed, 0), 0);
    this.chart.nodes[0].done = true;
  }

  /** Difficulty of the next level: rises through each sector and from sector to sector. */
  difficulty() {
    return this.sector * 0.55 + Math.min(this.stops, 8) * 0.07;
  }

  nextSector() {
    for (const b of this.chart.bodies) if (b.planet) this.seen.push(b.planet.id);
    this.sector++;
    this.stops = 0;
    this.chart = new Chart(chartSeed(this.seed, this.sector), this.sector, this.seen.slice(-4), this.seenEvents);
    this.chart.nodes[0].done = true;
    // a breather between sectors, and the tanks topped up a little
    for (const c of this.crew) c.hull = Math.min(stats(c.build).hp, c.hull + 2);
    this.fuel = Math.min(FUEL_MAX, Math.max(this.fuel + 2, 6));
    if (this.policy) this.notes.push('YOUR LANTERN MUTUAL POLICY HAS RUN OUT');
    if (this.contract) this.notes.push(`THE CRATE FOR ${this.planetName(this.contract.planet)} IS LOST TO YOU`);
    this.policy = 0;
    this.contract = null;
    this.boom = null;
    this.hunted = false;
  }

  /** The danger of a site now: its own, and a pip more where the faction hates you. */
  danger(n: ChartNode) {
    if (n.kind === 'raid' || n.kind === 'hunt') return clamp(n.danger + (n.planet && this.moodOf(n.planet.faction) <= -2 ? 1 : 0), 1, 3);
    return n.danger;
  }

  /**
   * How hard a site's fight would be if you went now: the run's difficulty at the next stop, and
   * the site's danger on top. Null where there's no fight to be had (or none you know of).
   */
  threat(n: ChartNode): number | null {
    if (n.kind !== 'raid' && n.kind !== 'hunt' && n.kind !== 'gate') return null;
    const next = this.sector * 0.55 + Math.min(this.stops + 1, 8) * 0.07;
    return next + (n.kind === 'gate' ? 0.5 : DANGER_HARDER[this.danger(n)]);
  }

  /**
   * Three parts to choose from after a level (`rich`: hunts and bosses lean rare), each rolled.
   * `boss`: one of them is legendary.
   */
  lootChoice(seed: number, rich: boolean, boss = false): Item[] {
    const r = rng(seed);
    const d = this.difficulty();
    const at = this.landing;
    const danger = at ? this.danger(at) : 1;
    rich ||= danger >= 3;
    const lean = at && at.reward in CLASSES ? (at.reward as PartClass) : null;
    const out = new Set<string>();
    for (let tries = 0; out.size < 3 && tries < 50; tries++) {
      const rarity = weighted(r, [
        ['common', rich ? 26 : 64 - d * 18 - (danger - 1) * 14],
        ['rare', rich ? 54 : 30 + d * 12 + (danger - 1) * 10],
        ['epic', rich ? 20 : 6 + d * 6 + (danger - 1) * 4],
      ] as [Rarity, number][]);
      // two of the three lean the site's way, if it has one
      const leaning = lean ? LOOT[rarity].filter((p) => p.cls === lean) : [];
      const from = leaning.length && out.size < 2 && r() < 0.8 ? leaning : LOOT[rarity];
      out.add(pick(r, from).id);
    }
    // a duo the crew has earned (two of each of its tags aboard) can turn up in place of the third
    const duos = this.duos();
    const ids = duos.length && r() < 0.35 ? [...[...out].slice(0, 2), pick(r, duos)] : [...out];
    const items = ids.map((id) => rollItem(r, id, rollTier(r, d, rich, danger)));
    // the Warden always leaves something worth building round
    if (boss && !items.some((it) => it.tier === 'legendary')) {
      const k = Math.floor(r() * items.length);
      items[k] = rollItem(r, items[k].id === 'conduit' || items[k].id === 'elbow' ? pick(r, LOOT.epic).id : items[k].id, 'legendary');
    }
    return items;
  }

  /** A part picked up in flight, rolled when it's brought home. */
  salvage(id: string, seed: number): Item {
    const r = rng(seed);
    return rollItem(r, id, rollTier(r, this.difficulty()));
  }

  /** Duo parts any ship of the crew has opened up. */
  duos(): string[] {
    return [...new Set(this.crew.flatMap((c) => duosOpen(c.build, c.cargo).map((d) => d.id)))];
  }

  /** A dealer's market: what it sells cheap, what it pays over the odds for. */
  market(n: ChartNode | null) {
    const m = n?.planet ? MARKET[n.planet.id] : null;
    const boom = this.boom && n?.planet && this.boom.planet === n.planet.id ? this.boom.cls : null;
    const hostile = n?.planet ? this.moodOf(n.planet.faction) <= -2 : false;
    const friendly = n?.planet ? this.moodOf(n.planet.faction) >= 2 : false;
    return { sells: m?.sells ?? null, wants: m?.wants ?? null, boom, mark: hostile ? 1.25 : friendly ? 0.8 : 1 };
  }

  shopStock(n: ChartNode): ShopItem[] {
    const r = rng(n.seed);
    const m = this.market(n);
    // half the stall is the planet's own line, cheap
    const own = m.sells ? shuffle(r, PARTS.filter((p) => p.cls === m.sells && !p.duo).map((p) => p.id)).slice(0, 3) : [];
    const rest = shuffle(r, PARTS.filter((p) => !p.duo).map((p) => p.id).filter((id) => !own.includes(id))).slice(0, 6 - own.length);
    // a duo the crew has earned sits at the end of the stall
    const duo = this.duos();
    if (duo.length) rest.push(pick(r, duo));
    // dealers stock the odd tuned part, rarely anything finer
    return [...own, ...rest].map((id) => {
      const def = partById(id);
      const cheap = def.cls === m.sells ? 0.7 : 1;
      const tier = weighted(r, [['common', 58], ['rare', 32], ['epic', 9 + this.sector * 4], ['legendary', this.sector * 1.5]] as [Tier, number][]);
      const part = rollItem(r, id, tier);
      return { part, price: Math.round(PRICE[def.rarity] * TIER_VALUE[tierOf(part)] * (0.85 + r() * 0.3) * cheap * m.mark), sold: false };
    });
  }

  /** What a dealer gives for a part. */
  sellPrice(part: Item, n: ChartNode | null) {
    const def = partById(part.id);
    const m = this.market(n);
    const k = def.cls === m.boom ? 3 : def.cls === m.wants ? 2 : n && !n.planet ? 1.25 : 1;
    // notoriety: fences pay more to someone with a price on their head
    return Math.round(SELL[def.rarity] * TIER_VALUE[tierOf(part)] * k * (1 + this.bounty * 0.1));
  }

  /** Puts a part in someone's hold, or turns it into scrap if it's full. Returns false if scrapped. */
  stow(player: number, part: string | Item) {
    const it = typeof part === 'string' ? { id: part } : part;
    const c = this.crew[player];
    if (c.cargo.length < CARGO) {
      c.cargo.push(it);
      return true;
    }
    this.scrap += Math.round(SELL[partById(it.id).rarity] * TIER_VALUE[tierOf(it)]);
    return false;
  }

  /** A part for everyone (each their own copy). */
  give(part: string | Item | ((i: number) => string | Item)) {
    this.crew.forEach((_, i) => {
      const it = typeof part === 'function' ? part(i) : part;
      this.stow(i, typeof it === 'string' ? it : i ? { ...it } : it);
    });
  }

  maxHull(player: number) {
    return stats(this.crew[player].build).hp;
  }

  /** Damage everyone takes (never below one hull), with the insurance paying out. */
  hurt(n: number) {
    let lost = 0;
    for (const c of this.crew) {
      const was = c.hull;
      c.hull = Math.max(1, c.hull - n);
      lost += was - c.hull;
    }
    this.claim(lost);
  }

  /** Lantern Mutual pays up for hull lost. */
  claim(lost: number) {
    if (!this.policy || lost <= 0) return;
    this.scrap += lost * this.policy;
    this.notes.push(`LANTERN MUTUAL PAYS ${lost * this.policy} SCRAP FOR ${lost} HULL`);
  }

  heal(n: number) {
    this.crew.forEach((c, i) => (c.hull = Math.min(this.maxHull(i), c.hull + n)));
  }

  addFuel(n: number) {
    this.fuel = clamp(this.fuel + n, 0, FUEL_MAX);
  }

  moodOf(faction: string) {
    return this.rep[faction] ?? 0;
  }

  mood(faction: string, d: number) {
    this.rep[faction] = clamp(this.moodOf(faction) + d, -3, 3);
  }

  /** The Sweep held back (or, negative, egged on) by some watches. */
  holdSweep(watches: number) {
    this.chart.setback += SWEEP_SPEED * watches;
    this.chart.sweep = this.chart.front();
  }

  /** Can you make a jump costing `cost` fuel? Out of fuel, you burn the hull for it (but not to nothing). */
  canJump(cost: number) {
    const short = Math.max(0, cost - this.fuel);
    return short === 0 || this.crew.every((c) => c.hull > short);
  }

  /** Pays for a jump; the debt grows. */
  payJump(cost: number) {
    const short = Math.max(0, cost - this.fuel);
    this.fuel = Math.max(0, this.fuel - cost);
    if (short) {
      for (const c of this.crew) c.hull = Math.max(1, c.hull - short);
      this.notes.push(`OUT OF FUEL: BURNED ${short} HULL TO MAKE THE JUMP`);
    }
    if (this.debt) this.debt = Math.ceil(this.debt * (1 + INTEREST));
  }

  /** Landed on a planet: a crate for it is delivered. */
  deliver(n: ChartNode) {
    const c = this.contract;
    if (!c || !n.planet || n.planet.id !== c.planet) return;
    this.scrap += c.pay;
    this.contract = null;
    this.notes.push(`${c.from}'S CRATE DELIVERED: +${c.pay} SCRAP`);
  }

  planetName(id: string) {
    return PLANETS.find((p) => p.id === id)?.name ?? id.toUpperCase();
  }

  /** The planet in this sector furthest towards the gate from a node (for a delivery worth the trip). */
  farPlanet(from: ChartNode): Planet {
    const c = this.chart;
    const here = c.along(c.pos(from));
    let best = c.bossPlanet;
    let bd = -Infinity;
    c.bodies.forEach((b, i) => {
      if (!b.planet || (from.planet && b.planet.id === from.planet.id)) return;
      const d = c.along(c.bodyPos(i)) - here + b.radius * 0.3;
      if (d > bd) {
        bd = d;
        best = b.planet;
      }
    });
    return best;
  }

  snapshot(): Snapshot {
    return {
      scrap: this.scrap,
      fuel: this.fuel,
      hull: this.crew.map((c) => c.hull),
      cargo: this.crew.map((c) => [...c.cargo]),
      bounty: this.bounty,
      debt: this.debt,
      policy: this.policy,
      setback: this.chart.setback,
      known: this.chart.nodes.filter((n) => n.known).length,
      contract: this.contract,
      favours: [...this.favours],
      rep: { ...this.rep },
      boom: this.boom ? `${this.boom.planet}:${this.boom.cls}` : '',
    };
  }

  /** What changed since a snapshot, as short lines with a colour (good, bad or neither). */
  changes(s: Snapshot): { text: string; tone: 'good' | 'bad' | 'info' }[] {
    const out: { text: string; tone: 'good' | 'bad' | 'info' }[] = [];
    const num = (d: number, what: string, goodUp = true) => d && out.push({ text: `${d > 0 ? '+' : ''}${d} ${what}`, tone: d > 0 === goodUp ? 'good' : 'bad' });
    num(this.scrap - s.scrap, 'SCRAP');
    num(this.fuel - s.fuel, 'FUEL');
    const hull = this.crew.reduce((a, c, i) => a + c.hull - s.hull[i], 0);
    num(hull, 'HULL');
    this.crew.forEach((c, i) => {
      const was = [...s.cargo[i]];
      for (const it of c.cargo) {
        const k = was.indexOf(it);
        if (k >= 0) was.splice(k, 1);
        else out.push({ text: `${this.crew.length > 1 ? `P${i + 1} ` : ''}+ ${itemName(it)}`, tone: 'good' });
      }
      for (const it of was) out.push({ text: `${this.crew.length > 1 ? `P${i + 1} ` : ''}- ${itemName(it)}`, tone: 'bad' });
    });
    if (this.bounty !== s.bounty) out.push({ text: this.bounty ? `BOUNTY ${this.bounty * 40} ON YOU` : 'NO BOUNTY ON YOU', tone: this.bounty > s.bounty ? 'bad' : 'good' });
    if (this.debt !== s.debt) out.push({ text: this.debt ? `YOU OWE MAMA ${this.debt}` : 'MAMA RUZZ IS PAID', tone: this.debt > s.debt ? 'bad' : 'good' });
    if (this.policy !== s.policy) out.push({ text: `INSURED: ${this.policy} A HULL`, tone: 'good' });
    const sb = (this.chart.setback - s.setback) / SWEEP_SPEED;
    if (Math.abs(sb) > 0.05) out.push({ text: sb > 0 ? `SWEEP HELD BACK ${sb.toFixed(1)} WATCHES` : `SWEEP ${(-sb).toFixed(1)} WATCHES CLOSER`, tone: sb > 0 ? 'good' : 'bad' });
    const known = this.chart.nodes.filter((n) => n.known).length - s.known;
    if (known > 0) out.push({ text: `${known} SITE${known > 1 ? 'S' : ''} REVEALED ON THE CHART`, tone: 'info' });
    if (this.contract && this.contract !== s.contract) out.push({ text: `DELIVER TO ${this.planetName(this.contract.planet)}: ${this.contract.pay}`, tone: 'info' });
    for (const f of this.favours) if (!s.favours.includes(f)) out.push({ text: FAVOURS[f] ?? f, tone: 'good' });
    for (const k of new Set([...Object.keys(this.rep), ...Object.keys(s.rep)])) {
      const d = this.moodOf(k) - (s.rep[k] ?? 0);
      if (d) out.push({ text: `${k.toUpperCase()} ${d > 0 ? 'LIKE YOU MORE' : 'LIKE YOU LESS'}`, tone: d > 0 ? 'good' : 'bad' });
    }
    const boom = this.boom ? `${this.boom.planet}:${this.boom.cls}` : '';
    if (boom && boom !== s.boom) out.push({ text: `NEWS: ${this.boom!.cls.toUpperCase()}S FETCH ×3 ON ${this.planetName(this.boom!.planet)}`, tone: 'info' });
    return out;
  }
}

const CLASSES = { gun: 1, engine: 1, power: 1, defense: 1, booster: 1, special: 1 };

export const FAVOURS: Record<string, string> = {
  doctor: 'DR VARGA OWES YOU ONE',
  brask: 'CAPTAIN BRASK OWES YOU ONE',
};

export const planets = () => PLANETS;
