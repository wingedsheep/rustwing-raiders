/**
 * The star chart of a sector: not a fixed graph but a little solar system. Planets go round the
 * star, inner ones faster; each has a few landing sites. Every jump (or a wait) moves the clock on
 * a watch, so the planets move and what's in reach changes. Meanwhile the Sweep (the Syndicate's
 * net) comes across the system from where you came in; whatever it passes over is lost to you. The
 * Warden's gate is on the far side.
 *
 * And jumps cost fuel: a short hop one cell, a long jump two. Crossing a system takes four at
 * the least, and a sector's fuel is six or seven: five or six stops out of the twenty-odd on the
 * chart, if you plan well. So a route is a commitment. Every site says
 * what it's worth before you go: how dangerous (one to three pips; the dangerous ones pay more),
 * what it pays in (a class of part, scrap, fuel, intelligence), what the planet's market sells
 * cheap and wants dear. Some things are hidden: what's out in the dark (an event) stays a question
 * mark until a rumour names it.
 *
 * Systems get harder as the run goes on, and so does each crossing: the first sector has no
 * elites and no planet on alert, and whatever you can reach from the jump point is a gentle start.
 */

import { PLANETS, type Planet } from '../world/planets';
import type { PartClass } from '../game/parts';
import { EVENT_META } from './events';
import { hashStr, pick, rng, shuffle, weighted, type Rng } from '../util';

export type NodeKind = 'start' | 'raid' | 'hunt' | 'escort' | 'heist' | 'salvage' | 'dock' | 'event' | 'gate';

/** What a site pays in: a class of part (it leans that way), or something else. */
export type Reward = PartClass | 'scrap' | 'fuel' | 'hull' | 'intel' | 'trade' | 'none';

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
}

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

/** A hop this long costs one fuel; anything up to RANGE costs two. */
export const HOP = 12;
export const RANGE = 18;
export const SWEEP_SPEED = 4.6;
export const EDGE = 28;
/** How likely a raid or hunt is to be elite, by sector. */
const ELITE = [0, 0.18, 0.3];

export class Chart {
  bodies: Body[] = [];
  nodes: ChartNode[] = [];
  time = 0;
  here = 0;
  /** Where the Sweep's front is, along the axis from the start (-EDGE) to the gate (+EDGE). */
  sweep = -EDGE - 8;
  /** How far the Sweep has been set back (by events; negative: it's been egged on). */
  setback = 0;
  /** The direction from the start to the gate. */
  axis = 0;
  /** The planet on alert this sector: every site on it a pip more dangerous, and richer. */
  alert = -1;
  readonly bossPlanet: Planet;
  readonly seed: number;

  constructor(seed: number, readonly sector: number, exclude: string[] = [], seenEvents: string[] = []) {
    // keep rolling until there's a fair way through
    for (let attempt = 0; ; attempt++) {
      this.seed = seed + attempt * 7919;
      this.bodies = [];
      this.nodes = [];
      const r = rng(this.seed);
      this.bossPlanet = this.make(r, exclude, seenEvents);
      if (this.fair() || attempt > 60) break;
    }
  }

  private make(r: Rng, exclude: string[], seenEvents: string[]): Planet {
    this.axis = r() * Math.PI * 2;
    this.time = 0;
    this.sweep = -EDGE - 8;
    this.setback = 0;
    const pool = PLANETS.filter((p) => !exclude.includes(p.id));
    const planets = shuffle(r, [...(pool.length >= 4 ? pool : PLANETS)]).slice(0, 4);
    const radii = [7, 12, 17, 22];
    planets.forEach((p, i) => {
      const radius = radii[i];
      // start roughly strung out between the way in and the way out
      const angle0 = this.axis + Math.PI + (i / 3) * Math.PI * (r() < 0.5 ? 1 : -1) * 0.9 + (r() - 0.5) * 1.2;
      this.bodies.push({ planet: p, radius, angle0, speed: 16 / radius ** 1.5, size: 1.4 + r() * 0.6 + (i === 3 ? 0.4 : 0), kind: 'planet' });
    });
    // a trader going round the wrong way
    this.bodies.push({ planet: null, radius: 14.5, angle0: r() * Math.PI * 2, speed: -0.32, size: 0.6, kind: 'trader' });
    // no planet on alert in the first system: it's where you learn the trade
    this.alert = this.sector > 0 ? Math.floor(r() * 4) : -1;

    // events, dealt like cards: each at most once a sector, ones met already this run less likely
    const deck = (where: 'planet' | 'space', p: Planet | null) => {
      const used = new Set(this.nodes.map((n) => n.event));
      const xs = EVENT_META.filter((e) => e.where !== 'never' && (e.where === 'any' || e.where === where) && !used.has(e.id) && (!e.planets || (p && e.planets.includes(p.id))));
      return weighted(r, xs.map((e) => [e, e.weight * (seenEvents.includes(e.id) ? 0.35 : 1)] as const));
    };
    const add = (kind: NodeKind, body: number, angle: number, dist: number, name: string, planet: Planet | null) => {
      const n: ChartNode = { id: this.nodes.length, kind, body, angle, dist, done: false, seed: Math.floor(r() * 1e9), name, planet, danger: 0, elite: false, reward: 'none', event: null, known: true };
      this.nodes.push(n);
      return n;
    };
    add('start', -1, this.axis + Math.PI, EDGE, 'JUMP POINT', null);
    const boss = pick(r, planets);
    const gate = add('gate', -1, this.axis, EDGE, 'WARDEN GATE', boss);
    gate.danger = 3;
    gate.reward = 'trade';
    // sites on each planet: mostly fights, and at most one escort or heist a sector
    const kinds: [NodeKind, number][] = [
      ['raid', 52],
      ['hunt', this.sector > 0 ? 22 : 12],
      ['escort', 6],
      ['heist', 5],
      ['salvage', 6],
      ['dock', 3],
      ['event', 6],
    ];
    const fights = kinds.filter(([k]) => k !== 'escort' && k !== 'heist');
    let errand = false;
    planets.forEach((p, i) => {
      const n = 2 + (r() < 0.6 ? 1 : 0);
      const off = r() * Math.PI * 2;
      const hot = i === this.alert ? 1 : 0;
      const market = MARKET[p.id];
      for (let k = 0; k < n; k++) {
        const kind = weighted(r, errand ? fights : kinds);
        if (kind === 'escort' || kind === 'heist') errand = true;
        const node = add(kind, i, off + (k / n) * Math.PI * 2, this.bodies[i].size + 1.6, '', p);
        if (kind === 'escort') {
          // haulers don't fly where it's hottest: never elite, a pip more only on alert
          node.danger = 1 + hot;
          node.reward = r() < 0.7 ? market.sells : pick(r, ['gun', 'engine', 'defense', 'booster', 'special'] as const);
        } else if (kind === 'heist') {
          // the runner's armed: a pip more than a raid, never elite (it's the prize)
          node.danger = Math.min(3, 2 + hot);
          node.reward = r() < 0.6 ? market.sells : pick(r, ['gun', 'engine', 'defense', 'booster', 'special'] as const);
        } else if (kind === 'raid' || kind === 'hunt') {
          node.elite = r() < ELITE[Math.min(this.sector, ELITE.length - 1)];
          node.danger = Math.min(3, (kind === 'hunt' ? 2 : 1) + hot + (node.elite ? 1 : 0));
          const roll = r();
          node.reward = roll < 0.12 ? 'fuel' : roll < 0.22 ? 'intel' : roll < 0.75 ? market.sells : pick(r, ['gun', 'engine', 'defense', 'booster', 'special'] as const);
        } else if (kind === 'salvage') node.reward = 'trade';
        else if (kind === 'dock') node.reward = 'hull';
        else {
          const ev = deck('planet', p);
          node.event = ev.id;
          node.known = ev.open;
          node.danger = ev.danger;
        }
        node.name = siteName(r, p, node);
      }
    });
    const comet = add('salvage', 4, 0, 0, 'TRADER COMET', null);
    comet.reward = 'trade';
    // things drifting at the edge, one near each end, and two in the belt
    const spots: [number, number][] = [
      [this.axis + Math.PI + (r() - 0.5) * 0.9, 23 + r() * 3],
      [this.axis + (r() - 0.5) * 0.9, 23 + r() * 3],
      [this.axis + Math.PI / 2 + (r() - 0.5) * 1.4, 9 + r() * 8],
      [this.axis - Math.PI / 2 + (r() - 0.5) * 1.4, 9 + r() * 8],
    ];
    spots.forEach(([a, d], k) => {
      if (k === 1 && r() < 0.5) {
        const n = add('dock', -1, a, d, 'OUTER BUOY', null);
        n.reward = 'hull';
        return;
      }
      const ev = deck('space', null);
      const n = add('event', -1, a, d, ev.title, null);
      n.event = ev.id;
      n.known = ev.open;
      n.danger = ev.danger;
    });
    // make sure there's somewhere to mend
    if (!this.nodes.some((n) => n.kind === 'dock')) {
      const n = this.nodes.find((n) => n.kind === 'event' && n.body < 0)!;
      Object.assign(n, { kind: 'dock', name: 'OUTER BUOY', event: null, known: true, danger: 0, reward: 'hull' });
    }
    // the first jump is a gentle one: nothing elite in reach of the jump point, and in the first
    // system nothing above the lowest danger
    for (const n of this.reachable(this.nodes[0], 0)) {
      if (n.kind !== 'raid' && n.kind !== 'hunt') continue;
      const was = n.elite;
      n.elite = false;
      n.danger = Math.min(n.danger, this.sector > 0 ? 2 : 1);
      if (was && n.planet) n.name = siteName(r, n.planet, n);
    }
    return boss;
  }

  /** Where a node is at a watch (default now), in chart units. */
  pos(n: ChartNode, time = this.time): { x: number; y: number } {
    if (n.body < 0) return { x: Math.cos(n.angle) * n.dist, y: Math.sin(n.angle) * n.dist };
    const b = this.bodyPos(n.body, time);
    return { x: b.x + Math.cos(n.angle + time * 0.3) * n.dist, y: b.y + Math.sin(n.angle + time * 0.3) * n.dist };
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

  /** Where the Sweep's front is at a watch (along the axis), allowing for any setback. */
  front(time = this.time) {
    return -EDGE - 8 + SWEEP_SPEED * time - this.setback;
  }

  /** Has the Sweep passed over this node (at the given watch)? */
  swept(n: ChartNode, time = this.time) {
    return n.kind !== 'gate' && this.along(this.pos(n, time)) < this.front(time);
  }

  /** Watches until the Sweep reaches a node (0: it already has; 99: never, in reason). */
  watchesLeft(n: ChartNode) {
    for (let k = 0; k < 20; k++) if (this.swept(n, this.time + k)) return k;
    return 99;
  }

  /** How far a jump is: from where `from` is now to where `to` will be when you get there. */
  distance(to: ChartNode, from = this.nodes[this.here], time = this.time) {
    const p = this.pos(from, time);
    const q = this.pos(to, time + 1);
    return Math.hypot(q.x - p.x, q.y - p.y);
  }

  /** Fuel for a jump: a hop is one, a long jump two. */
  cost(to: ChartNode, from = this.nodes[this.here], time = this.time) {
    return this.distance(to, from, time) <= HOP ? 1 : 2;
  }

  /** Where you could jump from `from` at a watch. */
  reachable(from = this.nodes[this.here], time = this.time): ChartNode[] {
    // a jump arrives a watch later: where things will be then is what counts
    return this.nodes.filter((n) => {
      if (n === from || n.done || n.kind === 'start') return false;
      return this.distance(n, from, time) <= RANGE && !this.swept(n, time + 1);
    });
  }

  /** What you could reach now but couldn't any more from `to` (out of range, or swept): what going there costs you. */
  closes(to: ChartNode): ChartNode[] {
    const after = new Set(this.reachable(to, this.time + 1));
    return this.reachable().filter((n) => n !== to && n.kind !== 'gate' && !after.has(n));
  }

  jump(to: ChartNode) {
    this.time++;
    this.sweep = this.front();
    this.here = to.id;
    to.done = true;
  }

  /** Wait a watch for the planets to come round. */
  drift() {
    this.time++;
    this.sweep = this.front();
  }

  /** Caught: the Sweep is past where you are. */
  caught() {
    return this.swept(this.nodes[this.here]);
  }

  /** Names up to `n` hidden things still out there (nearest first). Returns what it named. */
  reveal(n: number): ChartNode[] {
    const here = this.pos(this.nodes[this.here]);
    const hidden = this.nodes
      .filter((x) => !x.known && !x.done && !this.swept(x))
      .sort((a, b) => {
        const pa = this.pos(a);
        const pb = this.pos(b);
        return Math.hypot(pa.x - here.x, pa.y - here.y) - Math.hypot(pb.x - here.x, pb.y - here.y);
      })
      .slice(0, n);
    for (const x of hidden) x.known = true;
    return hidden;
  }

  /**
   * A fair chart: the gate can be reached in a decent number of stops without being swept, and
   * on a sector's fuel (five) with at least two stops on the way.
   */
  private fair() {
    // breadth-first over (node, watch, fuel spent), allowing waits
    const gate = this.nodes.find((n) => n.kind === 'gate')!;
    const seen = new Set<string>();
    let frontier: { node: ChartNode; time: number; stops: number; fuel: number }[] = [{ node: this.nodes[0], time: 0, stops: 0, fuel: 0 }];
    let best = -1;
    let frugal = -1;
    for (let step = 0; step < 16 && frontier.length; step++) {
      const next: typeof frontier = [];
      for (const s of frontier) {
        for (const n of this.reachable(s.node, s.time)) {
          const fuel = s.fuel + this.cost(n, s.node, s.time);
          if (n === gate) {
            best = Math.max(best, s.stops);
            if (fuel <= 5) frugal = Math.max(frugal, s.stops);
            continue;
          }
          const key = `${n.id}:${s.time + 1}:${Math.min(fuel, 6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ node: n, time: s.time + 1, stops: s.stops + 1, fuel });
        }
        // waiting is allowed, if it doesn't get you swept
        if (!this.swept(s.node, s.time + 1)) {
          const key = `${s.node.id}:${s.time + 1}:${Math.min(s.fuel, 6)}`;
          if (!seen.has(key)) {
            seen.add(key);
            next.push({ node: s.node, time: s.time + 1, stops: s.stops, fuel: s.fuel });
          }
        }
      }
      frontier = next;
    }
    return best >= 4 && frugal >= 2;
  }
}

function siteName(r: Rng, p: Planet, n: ChartNode) {
  const b = pick(r, p.biomes);
  const word = p.name.split(/[ -]/)[0];
  switch (n.kind) {
    case 'raid':
      if (n.reward === 'fuel') return `${word} FUEL DEPOT`;
      if (n.reward === 'intel') return `${word} LISTENING POST`;
      return `${n.elite ? 'ELITE: ' : ''}${b.name.toUpperCase()}`;
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
