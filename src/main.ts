import { Game } from './game/game';
import { library } from './render/assets';
import { Flight } from './screens/flight';
import { levelSpec } from './sim/run';
import { cellsOf, startBuild, type Build } from './sim/build';
import { PLANETS } from './world/planets';
import type { Mode } from './sim/level';
import { drawText } from './ui/font';
import { W, H, INK, DIM } from './ui/hud';
import type { PodFate } from './sim/heist';
import { input } from './input';

const game = new Game();
Object.assign(window, { game });

async function boot() {
  const ctx = game.ui;
  const loading = (f: number) => {
    ctx.clearRect(0, 0, W, H);
    drawText(ctx, 'RUSTWING RAIDERS', W / 2, 150, INK, { scale: 3, align: 'center' });
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(W / 2 - 80, 190, 160, 4);
    ctx.fillStyle = '#ffc24a';
    ctx.fillRect(W / 2 - 80, 190, 160 * f, 4);
    drawText(ctx, 'LOADING', W / 2, 200, DIM, { align: 'center' });
  };
  loading(0);
  await library.load(loading);
  const q = game.params;
  if (q.has('planet') || q.has('mode')) {
    // straight into a level, for testing: ?planet=orutal&mode=raid&seed=1&coop&autopilot&frame=mule&biomes=prism,jade
    const planet = PLANETS.find((p) => p.id === q.get('planet')) ?? PLANETS[0];
    const mode = (q.get('mode') ?? 'raid') as Mode;
    const seed = Number(q.get('seed') ?? 1);
    const frames = (q.get('frame') ?? 'kestrel').split(',');
    const coop = q.has('coop');
    game.devices = coop ? ['keys-left', 'keys-right'] : ['keys'];
    const pads = input.padIds();
    if (pads.length) game.devices = coop ? [pads[0], pads[1] ?? 'keys'] : [pads[0]];
    const builds = (coop ? [0, 1] : [0]).map((i) => startBuild(frames[i] ?? frames[0]));
    // &guns=rivet,rail;flak,mine: these guns across the front row (per ship, split by ';')
    q.get('guns')?.split(';').forEach((list, i) => {
      const b = builds[i];
      if (!b) return;
      b.parts = b.parts.filter((p) => p.r > 0);
      list.split(',').forEach((id, c) => b.parts.push({ id, c, r: 0 }));
    });
    builds.forEach(fitParts);
    const spec = levelSpec(planet, mode, seed, Number(q.get('difficulty') ?? 0.2));
    // &biomes=mesarun,saltpans: fly these of the planet's biomes, in this order
    const only = q.get('biomes')?.split(',').map((id) => planet.biomes.find((b) => b.id === id)).filter((b) => !!b);
    if (only?.length) spec.biomes = only;
    // &length=60: shorter biomes (to get to a level's end quickly)
    if (q.has('length')) spec.length = Number(q.get('length')) || spec.length;
    const fly = () => game.go(new Flight(game, spec, builds, undefined, () => fly()));
    fly();
  } else if (q.has('crew')) {
    // straight into a run, for testing: ?crew=kestrel,mule&run=5&screen=hangar|shop|event|dock|results
    const frames = q.get('crew')!.split(',');
    game.devices = frames.length > 1 ? ['keys-left', 'keys-right'] : ['keys'];
    const flow = await import('./game/flow');
    flow.newRun(game, frames, Number(q.get('run') ?? 1));
    const run = game.run!;
    run.crew.forEach((c) => fitParts(c.build));
    const screen = q.get('screen');
    // &site=escort: start beside a site of that kind on the chart (to look at its card)
    const site = q.get('site');
    const want = site && run.chart.nodes.find((n) => n.kind === site);
    const beside = want && run.chart.nodes.find((n) => n.body === want.body && n !== want);
    if (beside) {
      run.chart.here = beside.id;
      flow.toChart(game);
    }
    const node = (kind: string) => run.chart.nodes.find((n) => n.kind === kind) ?? run.chart.nodes[1];
    if (screen === 'hangar') {
      run.crew.forEach((c) =>
        c.cargo.push(
          { id: 'incend' },
          { id: 'amp', tier: 'legendary', trait: 'wireless', mods: [{ k: 'potent', roll: 0.8 }] },
          { id: 'rivet', tier: 'legendary', trait: 'splitting', mods: [{ k: 'dmg', roll: 0.7 }] },
          { id: 'catalyst' },
          { id: 'rail', tier: 'epic', mods: [{ k: 'dmg', roll: 0.95 }, { k: 'light', roll: 0.4 }] },
        ),
      );
      flow.toHangar(game, () => flow.toChart(game));
    } else if (screen && ['shop', 'event', 'dock'].includes(screen)) {
      run.scrap = 140;
      const n = node(screen === 'shop' ? 'salvage' : screen);
      n.kind = screen === 'shop' ? 'salvage' : (screen as 'event' | 'dock');
      flow.land(game, n);
    } else if (screen === 'results') {
      const { Results } = await import('./screens/results');
      // &convoy=101: an escort's results, the middle hauler lost
      const home = q.get('convoy')?.split('').map((c) => c === '1');
      // &heist=cfj: a heist's results (c caught, f fell, j jumped; a D on the end: taken down)
      const hq = q.get('heist');
      const spec = levelSpec(PLANETS[0], home ? 'escort' : hq ? 'heist' : 'raid', 1, 0.2);
      const res = { cleared: true, scrap: 42, score: 12345, loot: [['seeker'], []], hull: [3, 3], stats: run.crew.map(() => ({ hits: 2, grazes: 30, kills: 80, crashes: 0 })), report: { rank: 'A', lines: ['KILLED 30/34  WAVES WIPED 5/8  +40 SCRAP', 'BOUNTIES 1/2'] } };
      if (home) {
        const n = home.filter(Boolean).length;
        Object.assign(res, { convoy: { delivered: n, home, paid: n * 17 }, report: { rank: 'CBAS'[n], lines: [`HAULERS HOME ${n}/3  +${n * 17} SCRAP`, `${3 - n} CRATES LOST WITH THEM`] } });
      }
      if (hq) {
        const fate = [...hq.slice(0, 3)].map((c) => (c === 'c' ? 'caught' : c === 'j' ? 'jumped' : 'fell') as PodFate);
        const downed = hq.endsWith('D');
        const n = fate.filter((f) => f === 'caught').length;
        Object.assign(res, { heist: { fate, downed, paid: downed ? 46 : 0 }, report: { rank: downed && n === 3 ? 'S' : downed || n === 3 ? 'A' : n ? 'B' : 'C', lines: [`STRONGBOXES CAUGHT ${n}/3${downed ? '  RUNNER DOWN +46 SCRAP' : ''}`] } });
      }
      game.go(new Results(game, run, res, spec, () => flow.toChart(game)));
    }
  } else {
    const { Title } = await import('./screens/title');
    game.go(new Title(game));
  }
  game.start();
}

/** &parts=sentry.1.0,ram.0.0: bolts these parts on at (column, row), over whatever sat there. */
function fitParts(b: Build) {
  const want = game.params.get('parts');
  if (!want) return;
  for (const s of want.split(',')) {
    const [id, c, r] = s.split('.');
    const add = { id, c: Number(c), r: Number(r) };
    const taken = new Set(cellsOf(add).map(([cc, rr]) => `${cc},${rr}`));
    b.parts = b.parts.filter((p) => !cellsOf(p).some(([cc, rr]) => taken.has(`${cc},${rr}`)));
    b.parts.push(add);
  }
}

boot();
