/**
 * Flies levels for real, headless: the game's own sim (src/sim/level.ts), stepped at 60 Hz and
 * driven only through Intents by the autopilot (src/sim/pilot.ts). It tells you which levels
 * can't be got through and what kept hitting the ship there, so you can find the unfair bits
 * without playing every seed yourself. A run that goes wrong is one you can fly yourself:
 * ?planet=<id>&mode=<mode>&seed=<n> in the browser (add &autopilot to watch the pilot do it).
 *
 *   just autopilot                                every planet × mode, 3 seeds each
 *   just autopilot --planet orutal --mode hunt --seeds 20
 *   just autopilot --planet kessra --mode boss --seed 4 --verbose
 *   just autopilot --coop                         two ships
 *   just autopilot --frame mule --difficulty 1.2  a later sector
 *   just autopilot --loadout strong               a well-built ship instead of the starter
 *   just autopilot --loadout parry                an archetype: parry, speed, assassin, turret, alchemist (each picks its frame)
 *   just autopilot --loadout gun:rail             the starter ship with only that gun (a bench)
 *   just autopilot --noboost                      a pilot that never boosts (is it the layout, or the speed?)
 *   just autopilot --foes rook,halo               the level's waves are these kinds, in turn (as &foes= in the browser)
 *   just autopilot --grafts ramline,halo,spindle   wreck grafts on the ship (as &grafts= in the browser)
 *
 * Runs are shared out over every core (--cores to say how many). Exits non-zero if any run fails.
 */

import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { Level, type Mode } from '../src/sim/level';
import { levelSpec } from '../src/sim/run';
import { fits, startBuild, type Build } from '../src/sim/build';
import { frameById, partById } from '../src/game/parts';
import { newPilot, pilot } from '../src/sim/pilot';
import { PLANETS } from '../src/world/planets';
import { GRAFTS, type GraftId, type Grafts } from '../src/game/grafts';

interface Job {
  planet: string;
  mode: Mode;
  seed: number;
  coop: boolean;
  frame: string;
  difficulty: number;
  loadout: string;
  noboost: boolean;
  foes?: string;
  grafts?: string;
  verbose: boolean;
}

interface Result extends Job {
  outcome: 'clear' | 'failed' | 'timeout';
  time: number;
  hits: number;
  crashes: number;
  causes: Record<string, number>;
  kills: number;
  scrap: number;
  score: number;
  grazes: number;
  perfects: number;
  /** Dashes through something staggered. */
  takedowns: number;
  /** Welds finished, and lost to a hit. */
  welds: number;
  weldsLost: number;
  /** Hot crates: what came of each (o opened, b blown, l lost at the end or downed; '' none taken). */
  crates: string;
  /** Crits from the guns' edges. */
  edges: number;
  /** Reactions set off (marks meeting). */
  reactions: number;
  /** Bullets parried, and how often the aux went off. */
  parries: number;
  aux: number;
  /** Share of the time spent boosting, and seconds skimming. */
  boost: number;
  skim: number;
  /** Killed share, full clear, waves wiped, bounties claimed / seen. */
  killShare: number;
  /** Escorts: haulers delivered / flown, and their hull at the end. */
  convoy: string;
  fullClear: boolean;
  waves: string;
  bounties: string;
  rank: string;
  bonus: number;
  /** What the grafts did (their events, by graft), and wrecks taken / lost. */
  grafted: Record<string, number>;
  wrecks: string;
  hull: string;
  progress: number;
  log: string[];
}

/** Placements as [part, col, row, quarter turns]. */
const ship = (frame: string, parts: [string, number, number, number?][]): Build => ({ frame, parts: parts.map(([id, c, r, rot]) => ({ id, c, r, rot })) });

const LOADOUTS: Record<string, (frame: string) => Build> = {
  starter: (f) => startBuild(f),
  // the archetypes (see the builds design doc): a parry tank, a speed demon, a dash assassin, a turret ship
  parry: () =>
    ship('mule', [
      ['plate', 0, 0], ['seeker', 1, 0], ['rivet', 2, 0], ['mine', 3, 0], ['plate', 4, 0],
      ['shield', 0, 1], ['plate', 1, 1], ['parry', 2, 1], ['sink', 3, 1], ['mirror', 4, 1],
      ['thruster', 1, 2], ['thruster', 3, 2],
    ]),
  // (the lance lies across the heavy hardpoint; a rivet in the nose holds the trigger between rounds)
  speed: () =>
    ship('kestrel', [
      ['rivet', 1, 0], ['flare', 0, 1], ['phasedrive', 2, 1], ['lance', 0, 2, 1], ['thruster', 0, 3], ['thruster', 2, 3],
    ]),
  assassin: () =>
    ship('wasp', [
      ['scatter', 0, 0], ['scatter', 2, 0], ['ram', 0, 1], ['hone', 2, 1], ['bombbay', 0, 2], ['mine', 1, 2], ['lunge', 2, 2],
      ['wake', 0, 3], ['thruster', 1, 3], ['thruster', 2, 3],
    ]),
  turret: () =>
    ship('lattice', [
      ['plate', 0, 0], ['seeker', 2, 0], ['plate', 4, 0], ['shield', 0, 1], ['sentry', 2, 1], ['mirror', 4, 1],
      ['autoloader', 0, 2], ['flare', 1, 2], ['amp', 2, 2], ['overdrive', 3, 2], ['thruster', 1, 3], ['thruster', 3, 3],
    ]),
  // marks and reactions: a torch that burns and a seeker that cracks off a Breacher Rack, a Catalyst to set them off
  alchemist: () =>
    ship('lattice', [
      ['flaw', 0, 0], ['seeker', 2, 0], ['plate', 4, 0], ['incend', 0, 1], ['torch', 2, 1], ['shield', 4, 1],
      ['catalyst', 0, 2], ['siphon', 1, 2], ['breach', 2, 2], ['emp', 3, 2], ['thruster', 3, 3],
    ]),
  // a sensible mid-run ship: a gun on every hardpoint, boosters on them, armour, engines at the back
  strong: () =>
    ship('mule', [
      ['plate', 0, 0], ['seeker', 1, 0], ['scatter', 2, 0], ['mine', 3, 0], ['plate', 4, 0],
      ['shield', 0, 1], ['amp', 1, 1], ['flare', 2, 1], ['sink', 3, 1], ['vector', 4, 1],
      ['thruster', 1, 2], ['thruster', 3, 2],
    ]),
};

/**
 * A named loadout, or a bench: `gun:<id>` is the starter frame with only that gun on its hardpoint (a
 * second gun after a comma, `gun:rivet,rail`), to set the guns against each other.
 */
function loadout(name: string, frame: string): Build {
  if (!name.startsWith('gun:')) {
    // a hand-built ship that wouldn't go together in the hangar benches nothing real: say so
    const b = LOADOUTS[name](frame);
    for (const p of b.parts) if (!fits(b, p, p)) throw new Error(`${name}: ${p.id} at ${p.c},${p.r} doesn't fit the ${b.frame}`);
    return b;
  }
  const b = startBuild(frame);
  const guns = name.slice(4).split(',');
  // each on the next free hardpoint of its kind (trigger or heavy)
  b.parts = b.parts.filter((p) => partById(p.id).cls !== 'gun');
  const grid = frameById(b.frame).grid;
  for (const id of guns) {
    const spot = grid.flatMap((row, r) => [...row].flatMap((_, c) => [0, 1, 2, 3].map((rot) => ({ id, c, r, rot })))).find((p) => fits(b, p));
    if (!spot) throw new Error(`gun:${id} has no free hardpoint on the ${b.frame}`);
    b.parts.push(spot);
  }
  return b;
}

function fly(job: Job): Result {
  const planet = PLANETS.find((p) => p.id === job.planet)!;
  const spec = levelSpec(planet, job.mode, job.seed, job.difficulty);
  const builds = (job.coop ? [0, 1] : [0]).map(() => loadout(job.loadout, job.frame));
  const grafts: Grafts = Object.fromEntries((job.grafts ?? '').split(',').filter((id) => id in GRAFTS).map((id) => [GRAFTS[id as GraftId].verb, id]));
  const lv = new Level(spec, builds, undefined, builds.map(() => grafts));
  const grafted: Record<string, number> = {};
  let wrecksLost = 0;
  if (job.foes) lv.director.only(job.foes.split(','));
  const pilots = lv.players.map(() => newPilot({ noBoost: job.noboost }));
  const log: string[] = [];
  const hhit: Record<string, number> = {};
  let crates = '';
  const limit = 60 * 60 * 6;
  for (let f = 0; f < limit; f++) {
    const intents = lv.players.map((p, i) => pilot(lv, p, pilots[i]));
    lv.step(intents);
    for (const e of lv.events) {
      if (e.type === 'haulerHit') hhit[e.cause] = (hhit[e.cause] ?? 0) + e.dmg;
      if (e.type === 'hot' && (e.state === 'open' || e.state === 'blown' || e.state === 'lost')) crates += e.state[0];
      if (e.type === 'graft') grafted[`${e.graft}:${e.what}`] = (grafted[`${e.graft}:${e.what}`] ?? 0) + 1;
      if (e.type === 'bond') grafted[`bond:${e.faction}`] = (grafted[`bond:${e.faction}`] ?? 0) + 1;
      if (e.type === 'wreck' && e.lost) wrecksLost++;
      if (!job.verbose) continue;
      const at = `${lv.time.toFixed(1)}s ${Math.round(lv.progress * 100)}%`;
      const biome = lv.terrain.biome(lv.scroll).id;
      if (e.type === 'playerHit') log.push(`${at} [${biome}] P${e.id + 1} hit${e.shield ? ' (shield)' : ''}`);
      if (e.type === 'crash') log.push(`${at} [${biome}] P${e.id + 1} crashed into the land`);
      if (e.type === 'down') log.push(`${at} [${biome}] P${e.id + 1} DOWN`);
      if (e.type === 'revive') log.push(`${at} P${e.id + 1} revived`);
      if (e.type === 'bossWarning') log.push(`${at} boss: ${e.name}`);
      if (e.type === 'bossPhase') log.push(`${at} boss phase ${e.phase + 1}`);
      if (e.type === 'bossRead') log.push(`${at} boss reads: ${e.read}`);
      if (e.type === 'takedown') log.push(`${at} P${e.id + 1} TAKEDOWN${e.big ? ' (big)' : ''}${e.kill ? ' (kill)' : ''}`);
      if (e.type === 'biome') log.push(`${at} biome: ${spec.biomes[e.index]?.name}`);
      if (e.type === 'reaction') log.push(`${at} ${e.kind.toUpperCase()}`);
      if (e.type === 'detonate') log.push(`${at} DETONATE`);
      if (e.type === 'perfect') log.push(`${at} P${e.id + 1} PERFECT dash (${e.absorbed} absorbed)`);
      if (e.type === 'waveClear') log.push(`${at} wave ${e.wave} wiped out +${e.bonus}`);
      if (e.type === 'bounty' && e.state !== 'appear') log.push(`${at} bounty ${e.state} (${e.reward})`);
      if (e.type === 'haulerLost') log.push(`${at} hauler ${e.id} lost, ${e.left} left`);
      if (e.type === 'boarded') log.push(`${at} hauler ${e.id} boarded`);
      if (e.type === 'tally') log.push(`${at} killed ${e.killed}/${e.spawned}, missed ${e.missed}, waves ${e.cleared}/${e.waves}${e.full ? ' FULL CLEAR' : ''}: rank ${e.rank} +${e.bonus}`);
    }
    lv.events.length = 0;
    if (lv.state === 'clear' || lv.state === 'failed') break;
  }
  const causes: Record<string, number> = {};
  for (const p of lv.players) for (const [k, v] of Object.entries(p.causes)) causes[k] = (causes[k] ?? 0) + v;
  return {
    ...job,
    outcome: lv.state === 'clear' ? 'clear' : lv.state === 'failed' ? 'failed' : 'timeout',
    time: lv.time,
    hits: lv.players.reduce((s, p) => s + p.hits, 0),
    crashes: lv.players.reduce((s, p) => s + p.crashes, 0),
    causes,
    kills: lv.players.reduce((s, p) => s + p.kills, 0),
    scrap: lv.scrap,
    score: lv.score,
    grazes: lv.players.reduce((s, p) => s + p.grazes, 0),
    perfects: lv.players.reduce((s, p) => s + p.perfects, 0),
    takedowns: lv.players.reduce((s, p) => s + p.takedowns, 0),
    welds: lv.players.reduce((s, p) => s + p.welds, 0),
    weldsLost: lv.players.reduce((s, p) => s + p.weldsLost, 0),
    crates,
    edges: lv.players.reduce((s, p) => s + Object.values(p.edges).reduce((a, n) => a + (n ?? 0), 0), 0),
    parries: lv.players.reduce((s, p) => s + p.parries, 0),
    reactions: lv.reactions,
    aux: lv.players.reduce((s, p) => s + p.auxUses, 0),
    boost: lv.players.reduce((s, p) => s + p.boostTime, 0) / lv.players.length / Math.max(1, lv.time),
    skim: lv.players.reduce((s, p) => s + p.skimTime, 0),
    killShare: lv.killed / Math.max(1, lv.killed + lv.missed),
    fullClear: lv.fullClear,
    waves: `${lv.waves.filter((w) => w.missed === 0 && w.killed === w.total).length}/${lv.waves.length}`,
    bounties: `${lv.bounties}/${lv.bounties + lv.bountiesLost}`,
    rank: lv.rank ?? '-',
    bonus: lv.parBonus,
    grafted,
    wrecks: `${lv.wrecks.length}/${lv.wrecks.length + wrecksLost}`,
    hull: lv.players.map((p) => `${p.hp}/${p.stats.hp}`).join(' '),
    progress: lv.progress,
    convoy: lv.convoy ? `${lv.convoy.delivered}/3 (${lv.convoy.haulers.map((h) => `${h.hp}/${h.max}`).join(' ')}; ${Object.entries(hhit).map(([k, v]) => `${k} ${v}`).join(', ')})` : '',
    log,
  };
}

function parse(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = '1';
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

if (!isMainThread) {
  parentPort!.on('message', (job: Job | null) => {
    if (!job) process.exit(0);
    parentPort!.postMessage(fly(job));
  });
} else if (workerData === null || workerData === undefined) {
  const args = parse(process.argv.slice(2));
  const planets = args.planet ? [args.planet] : PLANETS.map((p) => p.id);
  const modes = (args.mode ? [args.mode] : ['raid', 'hunt', 'escort', 'heist', 'boss']) as Mode[];
  const seeds = args.seed ? [Number(args.seed)] : Array.from({ length: Number(args.seeds ?? 3) }, (_, i) => i + 1);
  const jobs: Job[] = [];
  for (const planet of planets)
    for (const mode of modes)
      for (const seed of seeds)
        jobs.push({
          planet,
          mode,
          seed,
          coop: !!args.coop,
          frame: args.frame ?? 'kestrel',
          difficulty: Number(args.difficulty ?? 0.2),
          loadout: args.loadout ?? 'starter',
          noboost: !!args.noboost,
          foes: args.foes,
          grafts: args.grafts,
          verbose: !!args.verbose || jobs.length === 0 && !!args.seed,
        });
  const cores = Math.min(Number(args.cores ?? cpus().length), jobs.length);
  const results: Result[] = [];
  let next = 0;
  const t0 = Date.now();
  await new Promise<void>((done) => {
    let live = cores;
    for (let w = 0; w < cores; w++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: { worker: true } });
      const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
      worker.on('message', (r: Result) => {
        results.push(r);
        const mark = r.outcome === 'clear' ? (r.hits === 0 ? 'PERFECT' : 'clear  ') : r.outcome.toUpperCase().padEnd(7);
        console.log(
          `${mark} ${r.planet.padEnd(9)} ${r.mode.padEnd(5)} seed ${String(r.seed).padEnd(3)} ${r.time.toFixed(0).padStart(4)}s  ` +
            `${Math.round(r.progress * 100)}%  hull ${r.hull}  hits ${r.hits} (${Object.entries(r.causes).map(([k, v]) => `${k} ${v}`).join(', ') || '-'})  ` +
            `kills ${r.kills}${r.reactions ? ` (reactions ${r.reactions})` : ''}  grazes ${r.grazes}  perfects ${r.perfects}  takedowns ${r.takedowns}  welds ${r.welds}${r.weldsLost ? ` (lost ${r.weldsLost})` : ''}${r.crates ? `  crate ${r.crates}` : ''}  edge crits ${r.edges}  aux ${r.aux} (parried ${r.parries})  boost ${Math.round(r.boost * 100)}%  skim ${r.skim.toFixed(1)}s  ` +
            `killed ${Math.round(r.killShare * 100)}%${r.fullClear ? ' FULL' : ''}  waves ${r.waves}  bounties ${r.bounties}` +
            `  ${r.rank} +${r.bonus}  scrap ${r.scrap}  wrecks ${r.wrecks}${r.convoy ? `  convoy ${r.convoy}` : ''}` +
            (Object.keys(r.grafted).length ? `\n    grafts: ${Object.entries(r.grafted).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''),
        );
        for (const l of r.log) console.log('    ' + l);
        feed();
      });
      worker.on('exit', () => {
        if (--live === 0) done();
      });
      feed();
    }
  });
  const failed = results.filter((r) => r.outcome !== 'clear');
  const causes: Record<string, number> = {};
  for (const r of results) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] ?? 0) + v;
  console.log(
    `\n${results.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${results.length - failed.length} clear, ${failed.length} failed. ` +
      `Average hits ${(results.reduce((s, r) => s + r.hits, 0) / results.length).toFixed(1)}, ` +
      `perfects ${(results.reduce((s, r) => s + r.perfects, 0) / results.length).toFixed(1)}, ` +
      `takedowns ${(results.reduce((s, r) => s + r.takedowns, 0) / results.length).toFixed(1)}, ` +
      `welds ${(results.reduce((s, r) => s + r.welds, 0) / results.length).toFixed(1)} (lost ${(results.reduce((s, r) => s + r.weldsLost, 0) / results.length).toFixed(1)}), ` +
      `crates ${['o', 'b', 'l'].map((k) => `${{ o: 'opened', b: 'blown', l: 'lost' }[k]} ${results.reduce((s, r) => s + r.crates.split('').filter((c) => c === k).length, 0)}`).join(' ')}, ` +
      `aux ${(results.reduce((s, r) => s + r.aux, 0) / results.length).toFixed(1)} (parried ${(results.reduce((s, r) => s + r.parries, 0) / results.length).toFixed(1)}), ` +
      `boost ${Math.round((results.reduce((s, r) => s + r.boost, 0) / results.length) * 100)}%, ` +
      `full clears ${results.filter((r) => r.fullClear).length}/${results.length}, ` +
      `killed ${Math.round((results.reduce((s, r) => s + r.killShare, 0) / results.length) * 100)}%, ` +
      `bounties ${results.reduce((s, r) => s + Number(r.bounties.split('/')[0]), 0)}/${results.reduce((s, r) => s + Number(r.bounties.split('/')[1]), 0)}, ` +
      `scrap ${(results.reduce((s, r) => s + r.scrap, 0) / results.length).toFixed(0)}. ` +
      `Ranks ${['S', 'A', 'B', 'C', '-'].map((k) => `${k} ${results.filter((r) => r.rank === k).length}`).join(' ')}. ` +
      `What hit: ${Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`,
  );
  process.exit(failed.length ? 1 : 0);
}
