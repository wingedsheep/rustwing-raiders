/**
 * How a run hangs together, screen to screen: the chart, then wherever you jump to (a stage, an
 * elite stage, the dealer), then the site's reward, then the chart again. Five stops and the
 * Warden's gate end a sector; three sectors end the run. (The old run's affairs, events, escorts,
 * heists and boarding are unhooked from here, not deleted: see docs/simple-run.md.)
 */

import type { Game } from './game';
import { Flight, type FlightResult } from '../screens/flight';
import { BoardingScreen } from '../screens/boarding';
import type { BoardResult, BoardSpec } from '../sim/boarding';
import type { Condition, Family, ShipSize } from '../sim/deck';
import { factionOf } from '../sim/factions';
import { ChartScreen } from '../screens/chart';
import { Results } from '../screens/results';
import { WreckScreen } from '../screens/wreck';
import { Hangar } from '../screens/hangar';
import { Shop } from '../screens/stops';
import { EventScreen } from '../screens/event';
import { Ending } from '../screens/ending';
import { CoreScreen } from '../screens/core';
import { kitOf, learn, type Fed } from './core';
import { crewHull, DANGER_HARDER, DANGER_PAY, levelSpec, Run, SECTORS } from '../sim/run';
import type { Wreck } from './grafts';
import type { SiteReward } from '../screens/results';
import type { Result, RunEvent } from '../sim/events';
import { WARDEN_GROUND, type ChartNode } from '../sim/chart';
import { HULL_STEP, type Mode } from '../sim/level';
import type { Planet } from '../world/planets';
import { hashStr, pick, rng } from '../util';
import { recorder } from './recorder';
import { Rate } from '../screens/rate';

export function newRun(game: Game, frames: string[], seed: number) {
  game.run = new Run(frames, seed);
  recorder.begin(game.run, !!game.net);
  const p = game.params;
  // for testing: ?debt=N, ?bounty=N, ?fuel=N to start with; ?gate straight to the Warden's gate
  if (p.has('debt')) game.run.debt = Number(p.get('debt'));
  if (p.has('bounty')) game.run.bounty = Number(p.get('bounty'));
  if (p.has('fuel')) game.run.fuel = Number(p.get('fuel'));
  if (p.has('gate')) {
    const gate = game.run.chart.nodes.find((n) => n.kind === 'gate')!;
    game.run.chart.jump(gate);
    return land(game, gate);
  }
  toChart(game);
}

export function toChart(game: Game) {
  const run = game.run!;
  // Dr Varga keeps her word
  if (run.favours.includes('doctor') && run.crew.some((c, i) => c.hull <= run.maxHull(i) * 0.4)) {
    run.favours.splice(run.favours.indexOf('doctor'), 1);
    run.heal(3);
    run.notes.push(`DR VARGA PATCHES YOU UP: +${3 * HULL_STEP} HULL. SHE SAYS YOU ARE EVEN NOW`);
  }
  game.go(new ChartScreen(game, run));
}

export function toHangar(game: Game, then: () => void) {
  game.go(new Hangar(game, game.run!, then));
}

/** Arrive at a node (the chart has already jumped there). */
export function land(game: Game, node: ChartNode) {
  const run = game.run!;
  run.stops++;
  run.landing = node;
  recorder.landed(run, node);
  arrive(game, node);
}

function arrive(game: Game, node: ChartNode) {
  const run = game.run!;
  run.landing = node;
  switch (node.kind) {
    case 'raid':
    case 'hunt':
      fly(game, node.planet!, node.kind, node.seed, DANGER_HARDER[run.danger(node)], undefined, node);
      return;
    case 'gate':
      fly(game, run.chart.bossPlanet, 'boss', node.seed, 0, undefined, node);
      return;
    case 'salvage':
      game.go(new Shop(game, run, node, () => toChart(game)));
      return;
    default:
      toChart(game);
  }
}

/** An event at a node, then on (or a fight first, if it came to that). Unhooked from the run for now. */
export function meet(game: Game, node: ChartNode, ev: RunEvent, then: () => void) {
  const run = game.run!;
  const planet = node.planet ?? nearestPlanet(run, node);
  game.go(
    new EventScreen(game, run, ev, node, planet, (res: Result) => {
      if (!res.fight) return then();
      // a fight out here: over the nearest planet
      fly(game, planet, res.fight, node.seed ^ 0xbeef, res.harder ?? 0, then);
    }),
  );
}

/** The Sweep caught you: fight your way out, and it throws you at the gate. */
export function caught(game: Game) {
  const run = game.run!;
  const gate = run.chart.nodes.find((n) => n.kind === 'gate')!;
  fly(game, run.chart.bossPlanet, 'hunt', hashStr(`caught:${run.chart.time}`), 0.35, () => {
    run.chart.jump(gate);
    land(game, gate);
  });
}

function nearestPlanet(run: Run, node: ChartNode): Planet {
  const c = run.chart;
  const p = c.pos(node);
  let best: Planet = c.bossPlanet;
  let bd = Infinity;
  c.bodies.forEach((b, i) => {
    if (!b.planet) return;
    const q = c.bodyPos(i);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = b.planet;
    }
  });
  return best;
}

/**
 * Flies a level of the run, then the results, then on. A site's danger has already gone into
 * `harder`; here it multiplies the scrap, and what the site pays in (fuel, intelligence) is paid.
 */
export function fly(game: Game, planet: Planet, mode: Mode, seed: number, harder = 0, after?: () => void, node?: ChartNode) {
  const run = game.run!;
  // (a quiet planet's easier, but never easier than the first stop)
  const spec = levelSpec(planet, mode, seed, Math.max(0, run.difficulty() + harder));
  // parts come only as a site's reward: what would drop one in flight pays scrap
  spec.parts = false;
  // every stage won on the Warden's ground took some of its hull
  if (mode === 'boss') spec.bossHull = 1 - run.wardenEase;
  const builds = run.crew.map((c) => c.build);
  const hull = run.crew.map((c) => c.hull);
  if (!node) run.landing = null;
  game.go(
    new Flight(game, spec, builds, hull, (res: FlightResult) => rated(game, `${planet.name.toUpperCase()}  ${mode === 'boss' ? 'THE WARDEN' : mode.toUpperCase()}`, !res.cleared || (mode === 'boss' && run.sector + 1 >= SECTORS), (line) => {
      run.levels++;
      run.score += res.score;
      for (const s of res.stats) {
        run.stats.kills += s.kills;
        run.stats.grazes += s.grazes;
        run.stats.hits += s.hits;
      }
      if (!res.cleared) {
        recorder.end(run, false, line);
        game.go(new Ending(game, run, false, `Shot down over ${planet.name}.`));
        return;
      }
      payOut(run, res);
      run.crew.forEach((c, i) => (c.hull = Math.min(crewHull(c), res.hull[i])));
      if (node && run.chart.mood(node) === 'warden') {
        run.wardenEase = Math.min(0.6, run.wardenEase + WARDEN_GROUND);
        run.notes.push(`${run.chart.bossPlanet.boss.name} LOSES ${Math.round(WARDEN_GROUND * 100)}% OF ITS HULL`);
      }
      const boss = mode === 'boss';
      if (boss) {
        run.stats.bosses++;
        // a Warden down: a big repair
        run.crew.forEach((c) => (c.hull = Math.min(crewHull(c), c.hull + Math.round(crewHull(c) * WARDEN_REPAIR))));
      }
      const next = () => {
        if (boss) {
          if (run.sector + 1 >= SECTORS) {
            recorder.end(run, true, line);
            game.go(new Ending(game, run, true, 'The last Warden falls. The way out is open.'));
          }
          else {
            run.nextSector();
            toChart(game);
          }
        } else if (after) after();
        else toChart(game);
      };
      // the site's reward; a GRAFT (or a Warden's signature) is picked off the wrecks after
      const reward: SiteReward = boss ? 'warden' : node && !after ? node.reward : 'none';
      const wrecks = boss ? res.wrecks : reward === 'graft' ? graftWrecks(run, res, planet, seed) : [];
      const grafts = () => (wrecks.length ? game.go(new WreckScreen(game, run, wrecks, planet, spec.seed, next)) : next());
      // (a dark planet's stages pay like an elite's)
      const rich = !!node?.elite || (!!node && run.chart.mood(node) === 'dark');
      game.go(new Results(game, run, res, spec, reward, rich, grafts));
    }), run.crew.map((c) => c.grafts), run.crew.map((c) => kitOf(c.core)), mode === 'boss' ? Math.min(2, run.sector) : 0),
  );
}

/** Of the hull, what a Warden's fall mends. */
const WARDEN_REPAIR = 0.6;

/**
 * A GRAFT site's wrecks, for each pilot: any elite they took down, then two of the faction they
 * fought (the offer is grafts of that faction, one of three).
 */
function graftWrecks(run: Run, res: FlightResult, planet: Planet, seed: number): Wreck[] {
  const faction = factionOf(planet);
  const r = rng(seed ^ 0x9a4f);
  const mechs = planet.enemies.filter((e) => e.kind === 'mech');
  return run.crew.flatMap((_, i) => {
    const own = res.wrecks.filter((w) => w.owner === i);
    const plain = [0, 1].map((): Wreck => {
      const skin = pick(r, mechs.length ? mechs : planet.enemies);
      return { owner: i, kind: skin.archetype, title: skin.name.toUpperCase(), faction, skin, model: skin.archetype };
    });
    return [...own, ...plain];
  });
}

/**
 * In a recorded run, the pilot's verdict on the stage just flown before going on (and, if the run
 * ends here, a line about it). Not online: both browsers must stay on the same screens.
 */
function rated(game: Game, what: string, last: boolean, then: (line?: string) => void) {
  if (!recorder.active || game.net) return then();
  game.go(
    new Rate(game, what, last, (r, note, line) => {
      recorder.rate(r, note);
      then(line);
    }),
  );
}

/**
 * A boarding at a site: as hard as the run and the site, the kelters as quick as your price.
 * Her crew is her owners' (a planet of beasts has poachers aboard: scrap, with cages), she's as
 * big as the site's danger (now and then a size bigger: at the top, a bulker), and now and then
 * she's in a state, from the site's seed. For testing:
 * &family=lattice|bloom|scrap, &size=0|1|2|3, &cond=dark|cages|breach|none.
 */
export function boardSpec(run: Run, node: ChartNode, params?: URLSearchParams): BoardSpec {
  const planet = node.planet ?? run.chart.bossPlanet;
  const fac = factionOf(planet);
  const family: Family = fac === 'lattice' || fac === 'bloom' ? fac : 'scrap';
  const danger = run.danger(node);
  const r = rng(node.seed ^ 0xc0d17);
  const size = clampSize(danger - 1 + (r() < 0.22 ? 1 : 0));
  const poachers = fac === 'wild' || planet.faction === 'Hesk Poachers';
  const roll = r();
  const condition: Condition = poachers && roll < 0.55 ? 'cages' : roll < 0.16 ? 'dark' : roll < 0.3 ? 'breach' : roll < 0.4 && family === 'scrap' ? 'cages' : 'none';
  const spec: BoardSpec = {
    seed: node.seed ^ 0xb0a4d, hard: run.difficulty() + DANGER_HARDER[danger], bounty: run.bounty, heroes: run.crew.length, family, size, condition,
    // near the Engine its cores hear it louder
    listen: planet.id === 'glacis' ? 2 : 1,
  };
  const f = params?.get('family');
  if (f === 'scrap' || f === 'lattice' || f === 'bloom') spec.family = f;
  const sz = params?.get('size');
  if (sz) spec.size = clampSize(Number(sz));
  const c = params?.get('cond');
  if (c === 'dark' || c === 'cages' || c === 'breach' || c === 'none') spec.condition = c;
  return spec;
}
const clampSize = (n: number): ShipSize => Math.max(0, Math.min(3, Math.round(n))) as ShipSize;

/**
 * Boarding a freighter: on foot through her crew, then the results. Boarding at all puts a price
 * on your head; what you carried out is the cards (a crate each), the strongbox's scrap and,
 * if you pulled her core, the pick of the hold. Thrown out, you keep only the tins you pocketed;
 * collected, the kelters take their price out of your scrap and your hull, and the bounty's paid.
 */
export function board(game: Game, node: ChartNode) {
  const run = game.run!;
  const planet = node.planet ?? run.chart.bossPlanet;
  const spec = levelSpec(planet, 'heist', node.seed, run.difficulty() + DANGER_HARDER[run.danger(node)]);
  const hull = run.crew.map((c) => c.hull);
  const skin = planet.enemies.find((e) => e.kind === 'mech')?.colors ?? ([0x8a6a4a, 0x4a3a30, 0xffb04a] as [number, number, number]);
  run.landing = node;
  run.bounty++;
  game.go(
    new BoardingScreen(game, boardSpec(run, node, game.params), skin, (r: BoardResult) => {
      run.levels++;
      // thrown out (or left down aboard) costs you hull, whatever the rest of you did
      const lost = (i: number) => (r.outcome === 'escaped' ? (r.heroes[i]?.out ? 2 : 0) : r.outcome === 'downed' ? 2 : 3);
      const res = boardResult(r, run.crew.map((c, i) => hull[i] - lost(i) * HULL_STEP).map((h) => Math.max(1, h)));
      for (const s of res.stats) {
        run.stats.kills += s.kills;
        run.stats.hits += s.hits;
      }
      run.mood(planet.faction, -1);
      run.notes.push(`YOU BOARDED THEIR FREIGHTER: ${planet.faction.toUpperCase()} WON'T FORGET IT`);
      run.notes.push('PRICE ON YOU +1');
      if (r.outcome === 'caught') {
        const fine = Math.round(run.scrap * 0.4);
        run.scrap -= fine;
        run.bounty = 0;
        run.notes.push(`THE KELTERS COLLECT: -${fine} SCRAP, AND THE PRICE IS PAID`);
      }
      // a danger site pays more for what you carried out
      const d = run.danger(node);
      if (DANGER_PAY[d] > 1 && res.scrap > 0) {
        const extra = Math.round(res.scrap * (DANGER_PAY[d] - 1));
        res.scrap += extra;
        run.notes.push(`DANGER PAID: +${extra} SCRAP`);
      }
      payOut(run, res);
      run.claim(res.hull.reduce((a, h, i) => a + Math.max(0, hull[i] - h), 0));
      run.crew.forEach((c, i) => (c.hull = Math.min(crewHull(c), res.hull[i] + (r.outcome === 'escaped' && !r.heroes[i]?.out ? HULL_STEP : 0))));
      const was = run.crew.map((c) => ({ ...c.core, life: { ...c.core.life } }));
      const grows = run.crew.map((c, i) => learn(c.core, res.fed[i]));
      const next = () => toChart(game);
      const core = () => (grows.some((n) => n > 0) || run.crew.some((c) => c.core.growths > 0) ? game.go(new CoreScreen(game, run, res.fed, was, next)) : next());
      game.go(new Results(game, run, res, spec, 'gun', false, core));
    }, run.crew[0].build.frame),
  );
}

/** A fight's pay: what each pilot scooped up is theirs, the rest (bonuses, a site's pay) the crew's. */
function payOut(run: Run, res: FlightResult) {
  const own = res.scrapBy ?? [];
  own.forEach((v, i) => run.crew[i] && (run.crew[i].scrap += v));
  run.share(res.scrap - own.reduce((a, b) => a + b, 0));
}

/** What the rank pays on top, by ship size. */
const RANK_PAY: Record<string, number> = { S: 40, A: 20, B: 8, C: 0 };
const MEDAL_LINE: Record<BoardResult['medals'][number], string> = { ghost: 'NO ALARM', clean: 'UNTOUCHED', full: 'FULL HOLD', core: 'HER CORE', quick: 'QUICK' };

/**
 * A boarding as the results read it: a heist's three cards, each a crate carried out (or left
 * aboard: a skiff only ever has two). A hauler's fourth crate pays scrap; the rank pays a bonus.
 */
function boardResult(r: BoardResult, hull: number[]): FlightResult {
  const got = r.outcome === 'escaped';
  const opened = r.crates.filter(Boolean).length;
  const spare = Math.max(0, opened - 3) * 35;
  const bonus = r.rank ? Math.round(RANK_PAY[r.rank] * [0.7, 1, 1.4, 1.8][r.size]) : 0;
  const lines = [
    got ? `CRATES ${opened}/${r.crates.length}${r.strongbox ? `  STRONGBOX +${r.pay}` : ''}${spare ? `  SPARE +${spare}` : ''}` : r.outcome === 'caught' ? 'COLLECTED' : 'THROWN OUT',
    `TINS +${r.tins}${bonus ? `  RANK +${bonus}` : ''}${got && r.spare > 0 ? `  ${Math.floor(r.spare)}S SPARE` : ''}`,
  ];
  if (r.medals.length) lines.push(r.medals.map((m) => MEDAL_LINE[m]).join('  '));
  const fed = r.heroes.map((h): Fed => {
    const out: Fed = { vein: { nerve: 0, steel: 0, grease: 0 }, lines: [] };
    const add = (vein: Fed['lines'][number]['vein'], n: number, text: string) => {
      if (n <= 0) return;
      out.vein[vein] += n;
      out.lines.push({ vein, text, n });
    };
    add('steel', Math.min(4, Math.ceil(h.takedowns / 2)), `${h.takedowns} TAKEDOWNS ON FOOT`);
    add('nerve', Math.min(4, Math.ceil(h.perfects / 2)), `${h.perfects} PERFECT SLIDES`);
    add('grease', got ? r.crates.filter(Boolean).length : 0, 'CRATES CRACKED');
    return out;
  });
  return {
    cleared: true,
    scrap: r.tins + r.pay + spare + bonus,
    // (the tins each picked up are theirs)
    scrapBy: r.heroes.map((h) => h.tins),
    score: 0,
    loot: r.heroes.map(() => []),
    hull,
    stats: r.heroes.map((h) => ({ hits: h.hits, grazes: h.perfects, kills: h.kills, crashes: 0 })),
    report: { rank: r.rank, lines },
    title: got ? 'AWAY CLEAN' : r.outcome === 'caught' ? 'COLLECTED' : 'THROWN OUT',
    heist: { fate: [0, 1, 2].map((k) => (k < Math.min(3, opened) ? 'caught' : 'aboard')), downed: r.core, paid: r.pay },
    wrecks: [],
    fed,
    spent: r.heroes.map(() => []),
  };
}
