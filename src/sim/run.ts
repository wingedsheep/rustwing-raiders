/**
 * A run: the crew (one or two ships, their cargo and their scrap) across three sectors, each a
 * star system to cross (sim/chart.ts). Levels are made here from a planet and a kind of landing,
 * and so is what you find there: loot to choose from, a dealer's stock and prices.
 *
 * And the run's affairs, which last from stop to stop like a trader's: fuel; a debt to Mama Ruzz
 * that grows a tenth every jump; a Lantern Mutual policy that pays for every hole in the hull; a
 * price on your head that brings Kaspar; how each faction feels about you; a crate to deliver; a
 * doctor who owes you one. Events (sim/events.ts) change these, and they change the chart.
 */

import { PLANETS, type Planet } from '../world/planets';
import { factionOf } from './factions';
import { HULL_STEP, type LevelSpec, type Mode } from './level';
import { LOOT, lootable, startBuild, stats, type Build, type Placement } from './build';
import { Chart, chartSeed, MARKET, SWEEP_SPEED, type ChartNode } from './chart';
import { PARTS, partById, type PartClass, type Rarity } from '../game/parts';
import { clamp, pick, rng, shuffle, weighted, type Rng } from '../util';
import { itemName, refitItem, rollItem, TIER_VALUE, TIERS, tierOf, type Item, type Tier } from '../game/loot';
import type { Grafts } from '../game/grafts';
import { remember } from './memory';
import { IMPRINTS, UNBENDING_HULL, WAYS, imprint, newCore, type Core, type ImprintId } from '../game/core';

/** Sites where there's a fight to fly. */
export const fights = (n: ChartNode) => n.kind === 'raid' || n.kind === 'hunt' || n.kind === 'escort' || n.kind === 'heist' || n.kind === 'gate';

export function levelSpec(planet: Planet, mode: Mode, seed: number, difficulty: number): LevelSpec {
  const r = rng(seed);
  // no canyons in a run: their walls pinch the lane and hide the foes (playtest 3); open ground
  // with obstacles to weave through flies better
  const open = planet.biomes.filter((b) => b.shape !== 'canyon');
  // a Warden's fight crosses two of them, the rest three
  const biomes = shuffle(r, [...open]).slice(0, mode === 'boss' ? 2 : 3);
  const length = mode === 'boss' ? 220 : 300;
  return { planet, biomes, mode, seed, difficulty, length };
}

export interface Crew {
  build: Build;
  /** Parts in the hold, not bolted on. */
  cargo: Item[];
  hull: number;
  /** Wreck grafts, one a verb (see game/grafts.ts): found this run, lost at its end. */
  grafts: Grafts;
  /** The ship's core, and what it's learnt (see game/core.ts): this run's, lost at its end. */
  core: Core;
  /** This pilot's own scrap (see Run.scrap for the crew's). */
  scrap: number;
}

/** A ship's whole hull: the frame's and its parts', and UNBENDING's if the core holds it. */
export const crewHull = (c: Crew) => stats(c.build).hp + (c.core.held.includes('unbending') ? UNBENDING_HULL : 0);

export const CARGO = 6;
/** Each pilot's scrap at the start of a run. */
export const START_SCRAP = 25;
/** Parts a dealer lays out. */
export const SHOP_PARTS = 3;
export const SECTORS = 3;

// a level pays about 180 scrap with the starter ship: about one part, not the whole stall
export const PRICE: Record<Rarity, number> = { common: 75, rare: 170, epic: 320 };
/** What a dealer asks on top for a finer roll (steeper than what it fetches: TIER_VALUE): a tuned part is a few levels' saving. */
export const BUY_TIER: Record<Tier, number> = { common: 1, rare: 1.6, epic: 2.6, legendary: 4 };
/** A dealer's list price for a part, before the haggling and the market. */
export const listPrice = (it: Item) => Math.round(PRICE[partById(it.id).rarity] * BUY_TIER[tierOf(it)]);
export const SELL: Record<Rarity, number> = { common: 10, rare: 20, epic: 40 };
export const REPAIR = 12;
export const FUEL_PRICE = 12;
export const FUEL_MAX = 9;
/** Mama Ruzz's rate: a tenth more every jump. */
export const INTEREST = 0.1;

/** Extra difficulty, and scrap paid, by danger (0..3). (0 is a quiet planet's: easier.) */
export const DANGER_HARDER = [-0.15, 0, 0.2, 0.42];
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

/** Who you owe: Mama Ruzz (a tenth a jump) or the Ledger Clan (a twentieth, and lattice drones). */
export type Lender = 'mama' | 'ledger';
export const RATE: Record<Lender, number> = { mama: INTEREST, ledger: 0.05 };

/** Who's riding with you (see sim/events.ts). */
export const ABOARD: Record<string, string> = {
  holly: '7-HOLLY RIDES WITH YOU',
  wren: "THE WREN'S CORE IS IN YOUR HOLD",
};

/** A sealed crate to take somewhere. */
export interface Contract {
  planet: string;
  pay: number;
  from: string;
}

/** The run's affairs at a moment, to see what an event changed. */
export interface Snapshot {
  scrap: number;
  purse: number[];
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
  owned: ImprintId[][];
  aboard: string[];
  easyJumps: number;
  wardenEase: number;
  tip: number;
  lender: Lender;
  due: string[];
}

export class Run {
  crew: Crew[];
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
  /** Lantern Mutual pays this much scrap a step of hull lost (HULL_STEP), until the gate. */
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
  /** Who holds the debt. */
  lender: Lender = 'mama';
  /** Who's riding with you ('holly', 'wren'). */
  aboard: string[] = [];
  /** Events that come to you at your next landing (Kaspar, sent by someone you crossed). */
  due: string[] = [];
  /** Long jumps that cost a hop's fuel, this sector (a reader told you which lanes sit right). */
  easyJumps = 0;
  /** How much easier the Warden's fight comes, this sector. */
  wardenEase = 0;
  /** The next fight pays this much more scrap (a tip about where the tithe barges unload). */
  tip = 0;
  /** What you did to whom this run (memory.ts keeps it between runs). */
  deeds: Record<string, string[]> = {};
  /** Hull leeches have had their go this sector. */
  leeched = false;
  /** PART offers in a row without an epic or better (each makes the next one likelier). */
  pity = 0;

  constructor(frames: string[], seed: number) {
    this.seed = seed;
    this.r = rng(seed ^ 0x5eed);
    this.crew = frames.map((f, i) => {
      const build = startBuild(f);
      return { build, cargo: [], hull: stats(build).hp, grafts: {}, core: newCore(seed * 7 + i), scrap: START_SCRAP };
    });
    this.chart = new Chart(chartSeed(seed, 0), 0);
    this.chart.nodes[0].done = true;
  }

  /**
   * The crew's scrap, all told. Each pilot has a purse of their own: what you scoop in a fight,
   * sell or scrap is yours, and what you buy for your own ship is paid from it. What comes to the
   * crew as a whole (a site's pay, a bonus, an event's reward) is shared out evenly, and what the
   * crew pays (fuel, fines, a debt, an event's price) is split evenly, whoever has more covering
   * what the other is short. So `run.scrap += n` and `run.scrap -= n` are the crew's, and whether
   * the crew can afford a thing is this total.
   */
  get scrap() {
    return this.crew.reduce((a, c) => a + c.scrap, 0);
  }

  set scrap(v: number) {
    this.share(Math.round(v) - this.scrap);
  }

  /** Each pilot's scrap in a few words ('P1 25  P2 40'), or the one purse's. */
  purses() {
    return this.crew.length > 1 ? this.crew.map((c, i) => `P${i + 1} ${c.scrap}`).join('  ') : `${this.scrap}`;
  }

  /** Scrap to (or, negative, from) the crew as a whole, split as `scrap` says. */
  share(d: number) {
    const n = this.crew.length;
    if (!d || !n) return;
    // the odd one goes to (or comes from) whoever has less (or more), P1 on a tie
    const order = this.crew.map((_, i) => i).sort((a, b) => (d > 0 ? this.crew[a].scrap - this.crew[b].scrap : this.crew[b].scrap - this.crew[a].scrap) || a - b);
    const each = Math.trunc(d / n);
    const odd = d - each * n;
    const part = order.map((i, k) => [i, each + (k < Math.abs(odd) ? Math.sign(odd) : 0)] as const);
    if (d > 0) {
      for (const [i, v] of part) this.crew[i].scrap += v;
      return;
    }
    // a cost: each their half, as far as their purse goes; then whoever has some covers the rest
    let short = 0;
    for (const [i, v] of part) {
      const take = Math.min(-v, Math.max(0, this.crew[i].scrap));
      this.crew[i].scrap -= take;
      short += -v - take;
    }
    for (const c of [...this.crew].sort((a, b) => b.scrap - a.scrap)) {
      const take = Math.min(short, Math.max(0, c.scrap));
      c.scrap -= take;
      short -= take;
    }
    // (more than the crew has: P1 goes into the red, as the crew did before purses)
    this.crew[0].scrap -= short;
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
    this.policy = 0;
    this.contract = null;
    this.boom = null;
    this.hunted = false;
    this.leeched = false;
    this.easyJumps = 0;
    this.wardenEase = 0;
    this.tip = 0;
  }

  /** Something you did to someone, remembered this run and the next. */
  did(who: string, deed: string) {
    (this.deeds[who] ??= []).push(deed);
    remember(who, deed);
  }

  /** Whether you've done that to them this run. */
  has(who: string, deed: string) {
    return this.deeds[who]?.includes(deed) ?? false;
  }

  /** What a jump of `cost` fuel really costs (a long jump along a lane that sits right costs a hop). */
  jumpCost(cost: number) {
    return this.easyJumps > 0 && cost > 1 ? cost - 1 : cost;
  }

  /** The things hanging over you, a line each, with a colour. */
  affairs(): [string, string][] {
    const out: [string, string][] = [];
    if (this.bounty) out.push([`BOUNTY ${this.bounty * 40}: KASPAR HUNTS`, '#ff5a4a']);
    if (this.debt) out.push([this.lender === 'ledger' ? `OWE THE COUNT ${this.debt} (+5%/JUMP)` : `OWE MAMA ${this.debt} (+10%/JUMP)`, '#ff8a7a']);
    if (this.contract) out.push([`CRATE TO ${this.planetName(this.contract.planet)}: ${this.contract.pay}`, '#ffd04a']);
    if (this.policy) out.push([`INSURED: ${this.policy} A HULL`, '#8affb0']);
    if (this.boom) out.push([`NEWS: ${this.boom.cls.toUpperCase()}S ×3 ON ${this.planetName(this.boom.planet)}`, '#8affe0']);
    if (this.easyJumps) out.push([`LONG JUMPS COST 1 FUEL: ${this.easyJumps} LEFT`, '#d8c8ff']);
    if (this.wardenEase) out.push(['YOU KNOW WHERE THE WARDEN IS WEAK', '#d8c8ff']);
    if (this.tip) out.push([`A TIP: THE NEXT FIGHT PAYS +${Math.round(this.tip * 100)}%`, '#ffd04a']);
    for (const a of this.aboard) out.push([ABOARD[a] ?? a, '#8affe0']);
    for (const f of this.favours) out.push([FAVOURS[f]?.replace(' ONE', '') ?? f, '#b48aff']);
    return out;
  }

  /** The danger of a site now: its own, and a pip more where the faction hates you. */
  danger(n: ChartNode) {
    return n.danger;
  }

  /**
   * How hard a site's fight would be if you went now: the run's difficulty at the next stop, and
   * the site's danger on top. Null where there's no fight to be had (or none you know of).
   */
  threat(n: ChartNode): number | null {
    if (!fights(n)) return null;
    const next = this.sector * 0.55 + Math.min(this.stops + 1, 8) * 0.07;
    return Math.max(0, next + (n.kind === 'gate' ? 0.5 : DANGER_HARDER[this.danger(n)]));
  }

  /**
   * A PART reward: three parts to choose from, by where it was won (see the table in
   * docs/simple-run.md). Any stage can turn up something good, an elite stage always has
   * something rare or better, and a Warden pays epics and a legendary. Every offer without an epic
   * or better makes the next one likelier to have one. `lean`: the class the site showed (two of
   * the three are of it). `named`: the part the site named on the chart, always the first card.
   */
  partOffer(seed: number, site: 'stage' | 'elite' | 'warden', lean: PartClass | null, named: string | null = null): Item[] {
    const r = rng(seed);
    const pity = Math.min(this.pity, 6) * 4;
    const odds: Record<typeof site, [Tier, number][]> = {
      stage: [['common', Math.max(20, 60 - pity)], ['rare', 30], ['epic', 9 + pity], ['legendary', 1]],
      elite: [['common', 15], ['rare', 40], ['epic', 40 + pity], ['legendary', 5]],
      warden: [['epic', 70], ['legendary', 30]],
    };
    // the part itself: how often it turns up at all (parts.ts), leaning rarer at the better sites
    const kinds: Record<typeof site, [Rarity, number][]> = {
      stage: [['common', 60], ['rare', 32], ['epic', 8]],
      elite: [['common', 40], ['rare', 42], ['epic', 18]],
      warden: [['common', 25], ['rare', 45], ['epic', 30]],
    };
    const out = new Set<string>(named ? [named] : []);
    for (let tries = 0; out.size < 3 && tries < 50; tries++) {
      const rarity = weighted(r, kinds[site]);
      const leaning = lean ? LOOT[rarity].filter((p) => p.cls === lean) : [];
      const from = leaning.length && out.size < 2 ? leaning : LOOT[rarity];
      out.add(pick(r, from).id);
    }
    const items = [...out].map((id) => rollItem(r, id, weighted(r, odds[site])));
    const rank = (it: Item) => TIERS.indexOf(tierOf(it));
    // an elite always leaves something rare or better; a Warden, a legendary
    if (site === 'elite' && !items.some((it) => rank(it) >= 1)) items[0] = rollItem(r, items[0].id, 'rare');
    if (site === 'warden' && !items.some((it) => it.tier === 'legendary')) {
      const k = Math.floor(r() * items.length);
      items[k] = rollItem(r, items[k].id, 'legendary');
    }
    this.pity = items.some((it) => rank(it) >= 2) ? 0 : this.pity + 1;
    return items;
  }

  /** Every part a pilot has, fitted or in the hold. */
  partsOf(player: number): Item[] {
    const c = this.crew[player];
    return [...c.build.parts, ...c.cargo];
  }

  /**
   * A REFIT reward: up to three of a pilot's parts (fitted first), each as it would come out a
   * tier up. `from` is the part as it is now (a placement or a hold item).
   */
  refitOffer(player: number, seed: number): { from: Item; to: Item }[] {
    const r = rng(seed);
    const c = this.crew[player];
    const fitted = shuffle(r, [...c.build.parts]);
    const held = shuffle(r, [...c.cargo]);
    const out: { from: Item; to: Item }[] = [];
    for (const from of [...fitted, ...held]) {
      if (out.length >= 3) break;
      const to = refitItem(r, from);
      if (to) out.push({ from, to });
    }
    return out;
  }

  /** Puts a refitted part where the old one was (on the ship, at its place; or in the hold). */
  refit(player: number, from: Item, to: Item) {
    const c = this.crew[player];
    const k = c.build.parts.indexOf(from as Placement);
    if (k >= 0) {
      const p = c.build.parts[k];
      // (a new object: item numbers are cached by object)
      const fitted: Placement = { ...to, c: p.c, r: p.r };
      if (p.rot !== undefined) fitted.rot = p.rot;
      if (p.turned) fitted.turned = p.turned;
      c.build.parts[k] = fitted;
      return;
    }
    const h = c.cargo.indexOf(from);
    if (h >= 0) c.cargo[h] = to;
  }

  /** A dealer's market: what it sells cheap, what it pays over the odds for. */
  market(n: ChartNode | null) {
    const m = n?.planet ? MARKET[n.planet.id] : null;
    const boom = this.boom && n?.planet && this.boom.planet === n.planet.id ? this.boom.cls : null;
    const hostile = n?.planet ? this.moodOf(n.planet.faction) <= -2 : false;
    const friendly = n?.planet ? this.moodOf(n.planet.faction) >= 2 : false;
    return { sells: m?.sells ?? null, wants: m?.wants ?? null, boom, mark: hostile ? 1.25 : friendly ? 0.8 : 1 };
  }

  shopStock(n: ChartNode, rerolls = 0): ShopItem[] {
    const r = rng(n.seed + rerolls * 7919);
    const m = this.market(n);
    // three parts: one of the planet's own line, cheap, and two of anything (a ship only has
    // so much room, so each one gets looked at)
    const own = m.sells ? shuffle(r, PARTS.filter((p) => p.cls === m.sells && lootable(p)).map((p) => p.id)).slice(0, 1) : [];
    const rest = shuffle(r, PARTS.filter(lootable).map((p) => p.id).filter((id) => !own.includes(id))).slice(0, SHOP_PARTS - own.length);
    // dealers stock the odd tuned part, rarely anything finer
    return [...own, ...rest].map((id) => {
      const def = partById(id);
      const cheap = def.cls === m.sells ? 0.7 : 1;
      const tier = weighted(r, [['common', 58], ['rare', 32], ['epic', 9 + this.sector * 4], ['legendary', this.sector * 1.5]] as [Tier, number][]);
      const part = rollItem(r, id, tier);
      return { part, price: Math.round(listPrice(part) * (0.85 + r() * 0.3) * cheap * m.mark), sold: false };
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
    c.scrap += Math.round(SELL[partById(it.id).rarity] * TIER_VALUE[tierOf(it)]);
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
    return crewHull(this.crew[player]);
  }

  /** Damage everyone takes, `n` steps of hull (never down to nothing), with the insurance paying out. */
  hurt(n: number) {
    let lost = 0;
    for (const c of this.crew) {
      const was = c.hull;
      c.hull = Math.max(1, c.hull - n * HULL_STEP);
      lost += was - c.hull;
    }
    this.claim(lost);
  }

  /** Lantern Mutual pays up for hull lost (points of it). */
  claim(lost: number) {
    const pay = Math.round((lost * this.policy) / HULL_STEP);
    if (pay <= 0) return;
    this.scrap += pay;
    this.notes.push(`LANTERN MUTUAL PAYS ${pay} SCRAP FOR ${lost} HULL`);
  }

  /** Mends everyone `n` steps of hull. */
  heal(n: number) {
    this.crew.forEach((c, i) => (c.hull = Math.min(this.maxHull(i), c.hull + n * HULL_STEP)));
  }

  addFuel(n: number) {
    this.fuel = clamp(this.fuel + n, 0, FUEL_MAX);
  }

  moodOf(faction: string) {
    return this.rep[faction] ?? 0;
  }

  mood(faction: string, d: number) {
    this.rep[faction] = clamp(this.moodOf(faction) + d, -3, 3);
    // liked enough, the cores pick up their ways
    const planet = PLANETS.find((p) => p.faction === faction);
    if (d > 0 && this.moodOf(faction) >= 2 && planet) this.copy(WAYS[factionOf(planet)]);
  }

  /** The cores copy an imprint off someone you met (each pilot's, if it hasn't already). */
  copy(id: ImprintId) {
    for (const c of this.crew) imprint(c.core, id);
  }

  /** The Sweep held back (or, negative, egged on) by some watches. */
  holdSweep(watches: number) {
    this.chart.setback += SWEEP_SPEED * watches;
    this.chart.sweep = this.chart.front();
  }

  /** Can you make a jump costing `cost` fuel? Out of fuel, you burn the hull for it, a step a cell (but not to nothing). */
  canJump(cost: number) {
    cost = this.jumpCost(cost);
    const short = Math.max(0, cost - this.fuel);
    return short === 0 || this.crew.every((c) => c.hull > short * HULL_STEP);
  }

  /** Pays for a jump; the debt grows. */
  payJump(cost: number) {
    if (this.jumpCost(cost) < cost) this.easyJumps--;
    cost = this.jumpCost(cost);
    const short = Math.max(0, cost - this.fuel);
    this.fuel = Math.max(0, this.fuel - cost);
    if (short) {
      for (const c of this.crew) c.hull = Math.max(1, c.hull - short * HULL_STEP);
      this.notes.push(`OUT OF FUEL: BURNED ${short * HULL_STEP} HULL TO MAKE THE JUMP`);
    }
    if (this.debt) this.debt = Math.ceil(this.debt * (1 + RATE[this.lender]));
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
      purse: this.crew.map((c) => c.scrap),
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
      owned: this.crew.map((c) => [...c.core.owned]),
      aboard: [...this.aboard],
      easyJumps: this.easyJumps,
      wardenEase: this.wardenEase,
      tip: this.tip,
      lender: this.lender,
      due: [...this.due],
    };
  }

  /** What changed since a snapshot, as short lines with a colour (good, bad or neither). */
  changes(s: Snapshot): { text: string; tone: 'good' | 'bad' | 'info' }[] {
    const out: { text: string; tone: 'good' | 'bad' | 'info' }[] = [];
    const num = (d: number, what: string, goodUp = true) => d && out.push({ text: `${d > 0 ? '+' : ''}${d} ${what}`, tone: d > 0 === goodUp ? 'good' : 'bad' });
    if (this.crew.length > 1)
      this.crew.forEach((c, i) => {
        const d = c.scrap - s.purse[i];
        if (d) out.push({ text: `P${i + 1} ${d > 0 ? '+' : ''}${d} SCRAP`, tone: d > 0 ? 'good' : 'bad' });
      });
    else num(this.scrap - s.scrap, 'SCRAP');
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
    const owe = (l: Lender) => (l === 'ledger' ? 'THE COUNT' : 'MAMA');
    if (this.debt !== s.debt || this.lender !== s.lender)
      out.push({ text: this.debt ? `YOU OWE ${owe(this.lender)} ${this.debt}` : `${owe(s.lender)} IS PAID`, tone: this.debt > s.debt ? 'bad' : this.debt < s.debt ? 'good' : 'info' });
    for (const a of this.aboard) if (!s.aboard.includes(a)) out.push({ text: ABOARD[a] ?? a, tone: 'info' });
    for (const a of s.aboard) if (!this.aboard.includes(a)) out.push({ text: a === 'wren' ? 'THE WREN IS GONE FROM YOUR HOLD' : '7-HOLLY HAS LEFT YOU', tone: 'bad' });
    if (this.easyJumps > s.easyJumps) out.push({ text: `${this.easyJumps} LONG JUMPS AT A HOP'S FUEL`, tone: 'good' });
    if (this.wardenEase > s.wardenEase) out.push({ text: 'THE WARDEN WILL FIGHT WEAKER', tone: 'good' });
    if (this.wardenEase < s.wardenEase) out.push({ text: 'THE WARDEN WILL FIGHT HARDER', tone: 'bad' });
    if (this.tip > s.tip) out.push({ text: `THE NEXT FIGHT PAYS +${Math.round(this.tip * 100)}%`, tone: 'good' });
    if (this.due.length > s.due.length) out.push({ text: 'SOMEONE IS COMING FOR YOU', tone: 'bad' });
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
    // (a copy every pilot's core took is said once)
    const copied = new Set(this.crew.flatMap((c, i) => c.core.owned.filter((id) => !s.owned[i]?.includes(id))));
    for (const id of copied) out.push({ text: `THE CORE COPIES ${IMPRINTS[id].name}`, tone: 'good' });
    const boom = this.boom ? `${this.boom.planet}:${this.boom.cls}` : '';
    if (boom && boom !== s.boom) out.push({ text: `NEWS: ${this.boom!.cls.toUpperCase()}S FETCH ×3 ON ${this.planetName(this.boom!.planet)}`, tone: 'info' });
    return out;
  }
}

export const FAVOURS: Record<string, string> = {
  doctor: 'DR VARGA OWES YOU ONE',
  brask: 'CAPTAIN BRASK OWES YOU ONE',
};

export const planets = () => PLANETS;
