/**
 * How a run hangs together, screen to screen: the chart, then wherever you jump to (a level, a
 * salvage dealer, a dock, something in the dark), then what you got, then the chart again. The
 * Warden's gate ends a sector; three sectors end the run.
 *
 * On the way in to a landing, your affairs can catch up with you: Kaspar, if there's a price on
 * your head; Mama Ruzz's boys at the gate, if you owe her.
 */

import type { Game } from './game';
import { Flight, type FlightResult } from '../screens/flight';
import { ChartScreen } from '../screens/chart';
import { Results } from '../screens/results';
import { Hangar } from '../screens/hangar';
import { Shop, Dock, EventScreen } from '../screens/stops';
import { Ending } from '../screens/ending';
import { DANGER_HARDER, DANGER_PAY, levelSpec, Run, SECTORS } from '../sim/run';
import { EVENTS, eventById, type Result, type RunEvent } from '../sim/events';
import type { ChartNode } from '../sim/chart';
import type { Mode } from '../sim/level';
import type { Planet } from '../world/planets';
import { stats } from '../sim/build';
import { hashStr, pick, rng } from '../util';

export function newRun(game: Game, frames: string[], seed: number) {
  game.run = new Run(frames, seed);
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
  if (run.favours.includes('doctor') && run.crew.some((c, i) => c.hull <= Math.min(2, run.maxHull(i) - 1))) {
    run.favours.splice(run.favours.indexOf('doctor'), 1);
    run.heal(3);
    run.notes.push('DR VARGA PATCHES YOU UP: +3 HULL. SHE SAYS YOU ARE EVEN NOW');
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
  run.deliver(node);
  // Mama's boys wait at the gate for anyone who owes her
  if (node.kind === 'gate' && run.debt > 0) return meet(game, node, eventById('collect'), () => arrive(game, node));
  // Kaspar comes for a bounty, once a sector at most, more likely the bigger it is
  if (run.bounty > 0 && !run.hunted && node.kind !== 'gate' && rng(node.seed ^ 0x4a5)() < 0.18 + run.bounty * 0.14) {
    run.hunted = true;
    return meet(game, node, eventById('hunter'), () => arrive(game, node));
  }
  arrive(game, node);
}

function arrive(game: Game, node: ChartNode) {
  const run = game.run!;
  run.landing = node;
  switch (node.kind) {
    case 'raid':
    case 'hunt':
    case 'escort':
    case 'heist': {
      const d = run.danger(node);
      fly(game, node.planet!, node.kind, node.seed, DANGER_HARDER[d], undefined, node);
      return;
    }
    case 'gate': {
      // Captain Brask keeps his word: his convoy draws the Warden's fire
      let harder = 0;
      if (run.favours.includes('brask')) {
        run.favours.splice(run.favours.indexOf('brask'), 1);
        harder = -0.25;
        run.notes.push("BRASK'S CONVOY DRAWS THE WARDEN'S FIRE");
      }
      fly(game, run.chart.bossPlanet, 'boss', node.seed, harder, undefined, node);
      return;
    }
    case 'salvage':
      game.go(new Shop(game, run, node, () => toChart(game)));
      return;
    case 'dock':
      game.go(new Dock(game, run, node, () => toChart(game)));
      return;
    case 'event': {
      // ?ev=<id>: that event, for testing
      const want = game.params.get('ev');
      const ev = (want && EVENTS.find((e) => e.id === want)) || (node.event ? eventById(node.event) : pick(rng(node.seed), EVENTS.filter((e) => e.where !== 'never')));
      node.known = true;
      if (want === 'hunter') run.bounty ||= 2;
      if (want === 'collect') run.debt ||= 120;
      meet(game, node, ev, () => toChart(game));
      return;
    }
    default:
      toChart(game);
  }
}

/** An event at a node, then on (or a fight first, if it came to that). */
function meet(game: Game, node: ChartNode, ev: RunEvent, then: () => void) {
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
  const spec = levelSpec(planet, mode, seed, run.difficulty() + harder);
  const builds = run.crew.map((c) => c.build);
  const hull = run.crew.map((c) => c.hull);
  if (!node) run.landing = null;
  game.go(
    new Flight(game, spec, builds, hull, (res: FlightResult) => {
      run.levels++;
      run.score += res.score;
      for (const s of res.stats) {
        run.stats.kills += s.kills;
        run.stats.grazes += s.grazes;
        run.stats.hits += s.hits;
      }
      if (!res.cleared) {
        game.go(new Ending(game, run, false, `Shot down over ${planet.name}.`));
        return;
      }
      // what the danger pays, and what the site was worth
      const d = node ? run.danger(node) : 1;
      if (DANGER_PAY[d] > 1) {
        const extra = Math.round(res.scrap * (DANGER_PAY[d] - 1));
        res.scrap += extra;
        run.notes.push(`DANGER PAID: +${extra} SCRAP`);
      }
      if (node?.reward === 'fuel') {
        run.addFuel(3);
        run.notes.push('FUEL TAKEN: +3');
      } else if (node?.reward === 'intel') {
        const named = run.chart.reveal(99);
        run.notes.push(`THE LISTENING POST'S LOGS NAME ${named.length} HIDDEN SITES`);
      } else if (node?.reward === 'scrap') {
        const extra = Math.round(20 * DANGER_PAY[d]);
        res.scrap += extra;
      }
      if (node?.kind === 'hunt' && node.planet) run.mood(node.planet.faction, -1);
      // an escort that brought every hauler home is remembered
      if (node?.kind === 'escort' && node.planet && res.convoy?.delivered === 3) {
        run.mood(node.planet.faction, 1);
        run.notes.push(`ALL THREE HAULERS HOME: ${node.planet.faction.toUpperCase()} WON'T FORGET IT`);
      }
      // a runner taken down is remembered too, the other way
      if (node?.kind === 'heist' && node.planet && res.heist?.downed) {
        run.mood(node.planet.faction, -1);
        run.notes.push(`YOU TOOK THEIR RUNNER DOWN: ${node.planet.faction.toUpperCase()} WON'T FORGET IT`);
      }
      run.scrap += res.scrap;
      // the insurance pays for what got shot off
      run.claim(res.hull.reduce((a, h, i) => a + Math.max(0, hull[i] - h), 0));
      // patched up a little on the way out
      run.crew.forEach((c, i) => (c.hull = Math.min(stats(c.build).hp, res.hull[i] + 1)));
      const boss = mode === 'boss';
      if (boss) run.stats.bosses++;
      game.go(
        new Results(game, run, res, spec, () => {
          if (boss) {
            if (run.sector + 1 >= SECTORS) game.go(new Ending(game, run, true, 'The last Warden falls. The way out is open.'));
            else {
              run.nextSector();
              toChart(game);
            }
          } else if (after) after();
          else toChart(game);
        }),
      );
    }),
  );
}
