/**
 * The star chart of a sector: a little solar system, held still, and a route through it. The
 * sites lie in columns from the jump point on the left to the Warden's gate on the right, one
 * column for each of the five stops, each site just off the planet it's on. Each site links on to
 * one or two in the next column, so the whole way through can be seen, and planned, from the
 * start: taking one site now closes off the ones it doesn't link to. That's the puzzle.
 *
 * Every site says what it pays before you go (a part of a class, a graft, a refit, scrap or a
 * repair), the way Hades shows its rewards on the doors. Three kinds of site: a stage, an elite
 * stage (harder, and pays better), and the dealer.
 */

import { PLANETS, type Planet } from '../world/planets';
import type { PartClass } from '../game/parts';
import { EVENT_META } from './events';
import { LOOT } from './build';
import { clamp, hashStr, pick, rng, shuffle, weighted, type Rng } from '../util';

export type NodeKind = 'start' | 'raid' | 'hunt' | 'escort' | 'heist' | 'salvage' | 'dock' | 'event' | 'gate';

/**
 * What a site pays: a PART of a class (one of three), a GRAFT from the faction you fight there,
 * a REFIT (a tier up on one of three parts you carry), SCRAP, or a REPAIR. (The rest are the
 * old run's, unhooked.)
 */
export type Reward = PartClass | 'graft' | 'refit' | 'repair' | 'scrap' | 'fuel' | 'hull' | 'intel' | 'trade' | 'none';

export const CLASSES: PartClass[] = ['gun', 'engine', 'defense', 'booster', 'special'];
export const isPartReward = (r: Reward): r is PartClass => (CLASSES as string[]).includes(r);

export interface Body {
  planet: Planet | null;
  radius: number;
  angle0: number;
  /** Radians per watch (negative: the other way round). */
  speed: number;
  size: number;
  kind: 'planet' | 'trader' | 'fixed';
}

export interface ChartNode {
  id: number;
  kind: NodeKind;
  /** The body it rides on (or -1 for a fixed point in space). */
  body: number;
  /** Where on/around its body, or in space for fixed ones. */
  angle: number;
  dist: number;
  done: boolean;
  seed: number;
  name: string;
  planet: Planet | null;
  /** 0 (safe) to 3 (elite): harder fights, richer pickings. */
  danger: number;
  elite: boolean;
  reward: Reward;
  /** For events: which one (sim/events.ts). */
  event: string | null;
  /** Do you know what's there? (Events start hidden, unless they're a business everyone knows.) */
  known: boolean;
  /** Which stop it is (0 the first; -1 the jump point, STOPS the gate). */
  col: number;
  /** The sites it links on to, by id. */
  links: number[];
  /** A PART site's named part: it's always one of the three on offer. */
  part: string | null;
}

/**
 * What's going on at a planet this sector, the same for every site on it. Each is one plain
 * trade, so the route is a choice of risks: the Warden's own planet, and two of the others.
 */
export type Mood = 'warden' | 'alert' | 'quiet' | 'dark';

export const MOODS: Record<Mood, { name: string; color: string; text: string }> = {
  warden: { name: "WARDEN'S GROUND", color: '#ff6a6a', text: 'HARDER. EACH WIN HERE TAKES 15% OFF THE WARDEN.' },
  alert: { name: 'ON ALERT', color: '#ff8a4a', text: 'EVERY STAGE AN ELITE: HARDER, PAYS RARE+.' },
  quiet: { name: 'QUIET', color: '#8affb0', text: 'EASIER, BUT NO PARTS: REPAIRS, REFITS, SCRAP.' },
  dark: { name: 'DARK', color: '#c8a0ff', text: 'WHAT IT PAYS IS HIDDEN, BUT IT PAYS RARE+.' },
};

/** Of the Warden's hull, what each stage won on its ground takes off. */
export const WARDEN_GROUND = 0.15;

/** What a planet's dealers sell cheap (it's what its faction flies with) and pay well for. */
export const MARKET: Record<string, { sells: PartClass; wants: PartClass }> = {
  orutal: { sells: 'gun', wants: 'defense' },
  halcyon: { sells: 'defense', wants: 'special' },
  kessra: { sells: 'engine', wants: 'gun' },
  mirefall: { sells: 'booster', wants: 'special' },
  glacis: { sells: 'engine', wants: 'booster' },
  ashgrave: { sells: 'special', wants: 'engine' },
  vesh: { sells: 'gun', wants: 'engine' },
  cinder: { sells: 'defense', wants: 'gun' },
};

/** A hop this long is a short jump. */
export const HOP = 12;
/** How many sites are in reach at once: the nearest landing on each of the nearest planets. */
export const REACH = 3;
export const SWEEP_SPEED = 4.6;
export const EDGE = 28;
/** Stops in a sector before the Warden's gate opens. */
export const STOPS = 5;

/** What a plain stage pays, and an elite one (better: no scrap or repairs, more parts and grafts). */
const STAGE_PAY: [Reward | 'part', number][] = [['part', 38], ['graft', 18], ['refit', 16], ['scrap', 12], ['repair', 16]];
const ELITE_PAY: [Reward | 'part', number][] = [['part', 50], ['graft', 34], ['refit', 16]];
/** A quiet planet's stages: the safe road, to mend and catch up, not to find new parts. */
const QUIET_PAY: [Reward, number][] = [['repair', 40], ['refit', 35], ['scrap', 25]];
/** How rare a PART site's named part is, by site. */
const NAMED: Record<'stage' | 'elite', [keyof typeof LOOT, number][]> = {
  stage: [['common', 60], ['rare', 32], ['epic', 8]],
  elite: [['common', 30], ['rare', 45], ['epic', 25]],
};

export class Chart {
  bodies: Body[] = [];
  nodes: ChartNode[] = [];
  time = 0;
  here = 0;
  /** Stops made this sector (the gate opens at STOPS). */
  stops = 0;
  /** The sites made this sector, in order (for the route along the top). */
  path: number[] = [];
  /** The route the pilot's planned on from here (sites' ids, the next jump first). */
  plan: number[] = [];
  /** (The Sweep is unhooked: these stay so the old screens and events still read.) */
  sweep = -999;
  setback = 0;
  /** The direction from the start to the gate. */
  axis = 0;
  /** (Unhooked: no planet is on alert.) */
  alert = -1;
  /** Each planet's mood this sector, by its id (a planet with none is just itself). */
  moods: Record<string, Mood> = {};
  readonly bossPlanet: Planet;
  readonly seed: number;

  constructor(seed: number, readonly sector: number, exclude: string[] = [], _seenEvents: string[] = []) {
    this.seed = seed;
    this.bossPlanet = this.make(rng(seed), exclude);
  }

  /**
   * Lays the sector out, left to right: the jump point, a column of sites for each of the STOPS
   * stops (three, or two either side of the star in the middle one), then the gate. Each site
   * belongs to the planet it's nearest, and sits just off it. Every site is linked on to the one
   * or two nearest it in the next column, so every route is STOPS stops long and there are forks
   * all the way.
   */
  private make(r: Rng, exclude: string[]): Planet {
    // (the chart is laid out along x already: the way in on the left, the gate on the right)
    this.axis = 0;
    this.time = 0;
    this.stops = 0;
    this.path = [];
    this.plan = [];
    const pool = PLANETS.filter((p) => !exclude.includes(p.id));
    const planets = shuffle(r, [...(pool.length >= 4 ? pool : PLANETS)]).slice(0, 4);
    // the planets in a zigzag across the system, round the star in the middle
    const flip = r() < 0.5 ? 1 : -1;
    const spots = [-15, -5, 5, 15].map((x, i) => ({ x: x + (r() - 0.5) * 3, y: (i % 2 ? -1 : 1) * flip * (9.5 + r() * 2.5) }));
    planets.forEach((p, i) => {
      const s = spots[i];
      this.bodies.push({ planet: p, radius: Math.hypot(s.x, s.y), angle0: Math.atan2(s.y, s.x), speed: 0, size: 1.4 + r() * 0.6, kind: 'planet' });
    });
    const add = (kind: NodeKind, body: number, angle: number, dist: number, name: string, planet: Planet | null, col: number) => {
      const n: ChartNode = { id: this.nodes.length, kind, body, angle, dist, done: false, seed: Math.floor(r() * 1e9), name, planet, danger: 0, elite: false, reward: 'none', event: null, known: true, col, links: [], part: null };
      this.nodes.push(n);
      return n;
    };
    add('start', -1, Math.PI, EDGE, 'JUMP POINT', null, -1);
    const boss = pick(r, planets);
    const gate = add('gate', -1, 0, EDGE, 'WARDEN GATE', boss, STOPS);
    gate.danger = 3;
    gate.reward = 'trade';
    // the grid: where each column's sites would sit, before they're drawn in to their planets
    const cells: { x: number; y: number; col: number }[] = [];
    for (let col = 0; col < STOPS; col++) {
      const rows = col === Math.floor(STOPS / 2) ? [-1, 1] : r() < 0.25 && col > 0 && col < STOPS - 1 ? [-0.5, 0.5] : [-1, 0, 1];
      for (const row of rows) cells.push({ x: -20 + col * 10 + (r() - 0.5) * 1.5, y: row * 19.5 + (r() - 0.5) * 2.5, col });
    }
    // the dealers: the trader comet in one middle column, a planet's yard in another
    const mids = shuffle(r, [1, 2, 3].filter((k) => k < STOPS - 1));
    const cometCell = pick(r, cells.filter((c) => c.col === mids[0]));
    const yardCell = pick(r, cells.filter((c) => c.col === mids[1]));
    this.bodies.push({ planet: null, radius: Math.hypot(cometCell.x, cometCell.y), angle0: Math.atan2(cometCell.y, cometCell.x), speed: 0, size: 0.6, kind: 'trader' });
    const eliteOdds = this.sector > 0 ? 0.3 : 0.18;
    const byCol: ChartNode[][] = Array.from({ length: STOPS }, () => []);
    for (const cell of cells) {
      if (cell === cometCell) {
        const comet = add('salvage', 4, 0, 0, 'TRADER COMET', null, cell.col);
        comet.reward = 'trade';
        byCol[cell.col].push(comet);
        continue;
      }
      // its planet: the nearest; it's drawn a little way in towards it (not so far its column's lost)
      let bi = 0;
      for (let i = 1; i < 4; i++) if (Math.hypot(cell.x - spots[i].x, cell.y - spots[i].y) < Math.hypot(cell.x - spots[bi].x, cell.y - spots[bi].y)) bi = i;
      const b = this.bodies[bi];
      const p = planets[bi];
      // (drawn in mostly up or down, so the columns stay straight; never onto the planet itself)
      const x = cell.x + clamp((spots[bi].x - cell.x) * 0.15, -0.7, 0.7);
      let y = cell.y + (spots[bi].y - cell.y) * 0.35;
      const room = b.size + 2.4;
      if (Math.hypot(x - spots[bi].x, y - spots[bi].y) < room) y = spots[bi].y + Math.sign(cell.y - spots[bi].y || 1) * Math.sqrt(Math.max(0, room ** 2 - (x - spots[bi].x) ** 2));
      const kind: NodeKind = cell === yardCell ? 'salvage' : cell.col > 0 || this.sector > 0 ? (r() < eliteOdds ? 'hunt' : 'raid') : 'raid';
      const node = add(kind, bi, Math.atan2(y - spots[bi].y, x - spots[bi].x), Math.hypot(x - spots[bi].x, y - spots[bi].y), '', p, cell.col);
      if (kind === 'salvage') node.reward = 'trade';
      else {
        node.elite = kind === 'hunt';
        node.danger = kind === 'hunt' ? 2 : 1;
        const pay = weighted(r, node.elite ? ELITE_PAY : STAGE_PAY);
        // a part leans the planet's way, more often than not
        node.reward = pay === 'part' ? (r() < 0.55 ? MARKET[p.id].sells : pick(r, CLASSES)) : pay;
      }
      node.name = siteName(r, p, node);
      byCol[cell.col].push(node);
    }
    this.moodsAndParts(rng(this.seed ^ 0x6d00d), boss, planets);
    // the links: the jump point to the whole first column; each site on to the one or two nearest
    // it in the next (by height, so the lines don't cross), and every site has a way in
    for (const col of byCol) col.sort((a, b) => this.pos(a).y - this.pos(b).y);
    this.nodes[0].links = byCol[0].map((n) => n.id);
    for (let k = 0; k < STOPS - 1; k++) {
      const [here, next] = [byCol[k], byCol[k + 1]];
      here.forEach((n, i) => {
        // (spread over the next column in proportion, so a column of three into two still forks)
        const f = here.length > 1 ? i / (here.length - 1) : 0.5;
        const at = f * (next.length - 1);
        const lo = Math.floor(at + 1e-6);
        const hi = Math.ceil(at - 1e-6);
        const two = lo === hi ? [lo, at < (next.length - 1) / 2 ? lo + 1 : lo - 1] : [lo, hi];
        n.links = [...new Set(two.filter((j) => j >= 0 && j < next.length))].map((j) => next[j].id);
      });
      // now and then a fork's closed, if both ends keep a way through: routes with fewer choices
      for (const n of here)
        if (n.links.length > 1 && r() < 0.3) {
          const cut = n.links[Math.floor(r() * n.links.length)];
          if (here.filter((o) => o.links.includes(cut)).length > 1) n.links = n.links.filter((id) => id !== cut);
        }
    }
    for (const n of byCol[STOPS - 1]) n.links = [gate.id];
    return boss;
  }

  /**
   * The planets' moods, and what they do to the sites on them; then a named part for every PART
   * site. (Their own dice, so a seed's layout stays as it was.)
   */
  private moodsAndParts(r: Rng, boss: Planet, planets: Planet[]) {
    this.moods = { [boss.id]: 'warden' };
    const others = shuffle(r, planets.filter((p) => p !== boss));
    const moods = shuffle(r, ['alert', 'quiet', 'dark'] as Mood[]);
    // two of the other three: one planet's left as it is
    others.slice(0, 2).forEach((p, i) => (this.moods[p.id] = moods[i]));
    for (const n of this.nodes) {
      if ((n.kind !== 'raid' && n.kind !== 'hunt') || !n.planet) continue;
      const mood = this.moods[n.planet.id];
      const lean = MARKET[n.planet.id].sells;
      const roll = (pay: [Reward | 'part', number][]) => {
        const got = weighted(r, pay);
        return got === 'part' ? (r() < 0.55 ? lean : pick(r, CLASSES)) : got;
      };
      if (mood === 'warden') n.danger++;
      // (the first stop of a run is never an elite)
      else if (mood === 'alert' && (n.col > 0 || this.sector > 0)) {
        if (!n.elite) n.reward = roll(ELITE_PAY);
        n.kind = 'hunt';
        n.elite = true;
        n.danger = 2;
      } else if (mood === 'quiet') {
        n.kind = 'raid';
        n.elite = false;
        n.danger = 0;
        n.reward = weighted(r, QUIET_PAY);
      } else if (mood === 'dark') {
        n.known = false;
        if (!n.elite) n.reward = roll(ELITE_PAY);
      }
      n.name = siteName(r, n.planet, n);
      if (isPartReward(n.reward)) {
        const cls = n.reward;
        const rich = n.elite || mood === 'dark';
        const first = weighted(r, NAMED[rich ? 'elite' : 'stage']);
        // (a class has none of a rarity: the next rarity down, then up)
        const order = [first, ...(['rare', 'common', 'epic'] as const).filter((k) => k !== first)];
        const pool = order.map((k) => LOOT[k].filter((p) => p.cls === cls)).find((xs) => xs.length);
        n.part = pool ? pick(r, pool).id : null;
      }
    }
  }

  /** A planet's mood this sector, if it has one. */
  mood(n: ChartNode): Mood | null {
    const p = n.kind === 'gate' ? null : n.planet;
    return (p && this.moods[p.id]) ?? null;
  }

  /** Where a node is at a watch (default now), in chart units. */
  pos(n: ChartNode, time = this.time): { x: number; y: number } {
    if (n.body < 0) return { x: Math.cos(n.angle) * n.dist, y: Math.sin(n.angle) * n.dist };
    const b = this.bodyPos(n.body, time);
    return { x: b.x + Math.cos(n.angle) * n.dist, y: b.y + Math.sin(n.angle) * n.dist };
  }

  bodyPos(i: number, time = this.time) {
    const b = this.bodies[i];
    const a = b.angle0 + b.speed * time;
    return { x: Math.cos(a) * b.radius, y: Math.sin(a) * b.radius };
  }

  /** How far along the axis (start -EDGE … gate +EDGE) a point is. */
  along(p: { x: number; y: number }) {
    return p.x * Math.cos(this.axis) + p.y * Math.sin(this.axis);
  }

  /** (The Sweep is unhooked: nothing is ever swept.) */
  front(_time = this.time) {
    return -999;
  }

  swept(_n: ChartNode, _time = this.time) {
    return false;
  }

  watchesLeft(_n: ChartNode) {
    return 99;
  }

  /** How far a jump is: from where `from` is now to where `to` will be when you get there. */
  distance(to: ChartNode, from = this.nodes[this.here], time = this.time) {
    const p = this.pos(from, time);
    const q = this.pos(to, time + 1);
    return Math.hypot(q.x - p.x, q.y - p.y);
  }

  /** (Fuel is unhooked: a hop is 1, a long jump 2, for how the route is drawn.) */
  cost(to: ChartNode, from = this.nodes[this.here], time = this.time) {
    return this.distance(to, from, time) <= HOP ? 1 : 2;
  }

  /** Is the gate open: STOPS made this sector? */
  get open() {
    return this.stops >= STOPS;
  }

  /**
   * Where you could jump from `from`: the sites it links on to (skipping any in `skip`, the ones a
   * plan's already been through). (`time` and `stops` are kept for the callers that pass them: the
   * links already make every route STOPS stops long.)
   */
  reachable(from = this.nodes[this.here], _time = this.time, _stops = this.stops, skip: ChartNode[] = []): ChartNode[] {
    return from.links.map((id) => this.nodes[id]).filter((n) => !n.done && !skip.includes(n));
  }

  /** Every site you could still get to from here, by some route. */
  ahead(from = this.nodes[this.here]): Set<ChartNode> {
    const seen = new Set<ChartNode>();
    const walk = (n: ChartNode) => {
      for (const m of this.reachable(n)) if (!seen.has(m)) seen.add(m), walk(m);
    };
    walk(from);
    return seen;
  }

  /** What you'd have in reach after going to `to`: what that jump opens up next. */
  after(to: ChartNode): ChartNode[] {
    return this.reachable(to, this.time + 1, this.stops + (to.kind === 'gate' ? 0 : 1), [to]);
  }

  /**
   * Where you could go at the `k`th jump of a planned route (0: the next one), having made the
   * jumps before it in `plan`: from where the last of them leaves you, when you'd be there.
   */
  optionsAt(plan: ChartNode[], k: number): ChartNode[] {
    const made = plan.slice(0, k);
    if (made.some((n) => n.kind === 'gate')) return [];
    return this.reachable(k ? made[k - 1] : this.nodes[this.here], this.time + k, this.stops + k, made);
  }

  jump(to: ChartNode) {
    this.time++;
    this.here = to.id;
    to.done = true;
    if (to.kind !== 'gate') {
      this.stops++;
      this.path.push(to.id);
    }
  }

  /** (Unhooked: the Sweep never catches you.) */
  caught() {
    return false;
  }

  /** Names up to `n` hidden things still out there (nearest first). Returns what it named. */
  reveal(n: number): ChartNode[] {
    const hidden = this.nodes.filter((x) => !x.known && !x.done).slice(0, n);
    for (const x of hidden) x.known = true;
    return hidden;
  }
}

function siteName(r: Rng, p: Planet, n: ChartNode) {
  const b = pick(r, p.biomes);
  const word = p.name.split(/[ -]/)[0];
  switch (n.kind) {
    case 'raid':
      return b.name.toUpperCase();
    case 'hunt':
      return `${n.elite ? 'ARMED ' : ''}${p.faction.toUpperCase()} CONVOY`;
    case 'escort':
      return `${word} ${pick(r, ['WATER RUN', 'ORE RUN', 'GRAIN RUN', 'MEDICINE RUN', 'FUEL RUN', 'SEED RUN'])}`;
    case 'heist':
      return `${word} ${pick(r, ['PAYROLL RUNNER', 'TITHE BARGE', 'BLOCKADE RUNNER', 'STRONGBOX RUN', 'GOLD FREIGHTER', 'BANK SHIP'])}`;
    case 'salvage':
      return `${word} ${pick(r, ['SALVAGE YARD', 'SCRAP MARKET', 'CHOP SHOP'])}`;
    case 'dock':
      return `${word} FRIENDLY DOCK`;
    case 'event':
      return EVENT_META.find((e) => e.id === n.event)?.title ?? 'SOMETHING';
    default:
      return p.name;
  }
}

/** A seed for a run's sector chart. */
export const chartSeed = (run: number, sector: number) => hashStr(`${run}:${sector}`);
