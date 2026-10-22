import { Game } from './game/game';
import { library } from './render/assets';
import { Flight } from './screens/flight';
import { levelSpec } from './sim/run';
import { cellsOf, fits, startBuild, type Build, type Placement } from './sim/build';
import { frameById, partById, PARTS } from './game/parts';
import type { TraitId } from './game/loot';
import { PLANETS } from './world/planets';
import type { Mode } from './sim/level';
import { drawText } from './ui/font';
import { W, H, INK, DIM } from './ui/hud';
import type { PodFate } from './sim/heist';
import type { ImprintId } from './game/core';
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
  if (q.has('planet') || q.has('mode') || q.has('tour')) {
    // straight into a level, for testing: ?planet=orutal&mode=raid&seed=1&coop&autopilot&frame=mule&biomes=prism,jade
    // ?tour: the autopilot flies level after level, every planet × mode and then the next seed (narrowed by &planet= and &mode=)
    const tour = q.has('tour');
    const planets = q.has('planet') ? PLANETS.filter((p) => p.id === q.get('planet')) : tour ? PLANETS : [PLANETS[0]];
    const modes = (q.has('mode') ? [q.get('mode')] : tour ? ['raid', 'hunt', 'escort', 'heist', 'boss'] : ['raid']) as Mode[];
    if (!planets.length) planets.push(PLANETS[0]);
    let seed = Number(q.get('seed') ?? 1);
    const frames = (q.get('frame') ?? 'kestrel').split(',');
    const coop = q.has('coop');
    game.devices = coop ? ['keys-left', 'keys-right'] : ['keys'];
    const pads = input.padIds();
    if (pads.length) game.devices = coop ? [pads[0], pads[1] ?? 'keys'] : [pads[0]];
    const builds = (coop ? [0, 1] : [0]).map((i) => startBuild(frames[i] ?? frames[0]));
    // &guns=rivet,mine;scatter: these guns on the ship, each on the first socket it fits with a hardpoint of its
    // kind (trigger or heavy) free, in place of its own guns (per ship, split by ';'; what won't go is left off)
    q.get('guns')?.split(';').forEach((list, i) => {
      const b = builds[i];
      if (!b) return;
      b.parts = b.parts.filter((p) => !partById(p.id).gun);
      const f = frameById(b.frame);
      for (const id of list.split(',')) {
        if (!PARTS.some((d) => d.id === id)) continue;
        const spot = f.grid.flatMap((row, r) => [...row].flatMap((_, c) => [0, 1, 2, 3].map((rot) => ({ id, c, r, rot })))).find((p) => fits(b, p));
        if (spot) b.parts.push(spot);
      }
    });
    builds.forEach(fitParts);
    let at = 0;
    const fly = () => {
      const planet = planets[at % planets.length];
      const mode = modes[Math.floor(at / planets.length) % modes.length];
      const spec = levelSpec(planet, mode, seed, Number(q.get('difficulty') ?? 0.2));
      // &biomes=mesarun,saltpans: fly these of the planet's biomes, in this order
      const only = q.get('biomes')?.split(',').map((id) => planet.biomes.find((b) => b.id === id)).filter((b) => !!b);
      if (only?.length) spec.biomes = only;
      // &length=60: shorter biomes (to get to a level's end quickly)
      if (q.has('length')) spec.length = Number(q.get('length')) || spec.length;
      if (tour) {
        document.title = `${planet.id} ${mode} seed ${seed}`;
        console.log(`[tour] ${planet.id} ${mode} seed ${seed}  (?planet=${planet.id}&mode=${mode}&seed=${seed})`);
      }
      game.go(
        new Flight(game, spec, builds, undefined, (r) => {
          if (tour) {
            console.log(`[tour] ${r.cleared ? 'cleared' : 'FAILED'} rank ${r.report.rank}  ${r.report.lines.join('  ')}`);
            if (++at % (planets.length * modes.length) === 0) seed++;
          }
          fly();
        }),
      );
    };
    fly();
  } else if (q.has('crew')) {
    // straight into a run, for testing: ?crew=kestrel,mule&run=5&screen=hangar|shop|event|dock|results|wreck
    const frames = q.get('crew')!.split(',');
    game.devices = frames.length > 1 ? ['keys-left', 'keys-right'] : ['keys'];
    const flow = await import('./game/flow');
    flow.newRun(game, frames, Number(q.get('run') ?? 1));
    const run = game.run!;
    run.crew.forEach((c) => fitParts(c.build));
    // &grafts=ramline,halo;stoop: wreck grafts already bolted on (per pilot, split by ';')
    const { GRAFTS } = await import('./game/grafts');
    (q.get('grafts') ?? '').split(';').forEach((list, i) => {
      if (run.crew[i]) run.crew[i].grafts = Object.fromEntries(list.split(',').filter((id) => id in GRAFTS).map((id) => [GRAFTS[id as keyof typeof GRAFTS].verb, id]));
    });
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
          { id: 'rail', tier: 'legendary', trait: 'sentinel', mods: [{ k: 'dmg', roll: 0.7 }] },
          { id: 'hone', tier: 'rare', mods: [{ k: 'potent', roll: 0.5 }] },
          { id: 'lunge' },
          { id: 'rail', tier: 'epic', mods: [{ k: 'dmg', roll: 0.95 }, { k: 'light', roll: 0.4 }] },
        ),
      );
      flow.toHangar(game, () => flow.toChart(game));
    } else if (screen && ['shop', 'event', 'dock'].includes(screen)) {
      run.scrap = 140;
      const n = node(screen === 'shop' ? 'salvage' : screen);
      n.kind = screen === 'shop' ? 'salvage' : (screen as 'event' | 'dock');
      flow.land(game, n);
    } else if (screen === 'wreck') {
      // &wreck=ramjack,rook (elites' kinds, P1's; ;-separated per pilot) or &wreck=boss:<planet>
      const { WreckScreen } = await import('./screens/wreck');
      const { FOES, isFoe, factionOf } = await import('./sim/factions');
      // (&at=<planet>: whose yard, and whose fliers the elites wear; a Warden's wreck brings its own)
      const boss = PLANETS.find((p) => q.get('wreck')?.includes(`boss:${p.id}`));
      const planet = PLANETS.find((p) => p.id === q.get('at')) ?? boss ?? PLANETS[0];
      const wrecks = (q.get('wreck') ?? 'ramjack,spitter').split(';').flatMap((list, owner) =>
        list.split(',').filter(Boolean).map((kind) => {
          if (kind.startsWith('boss')) {
            const pl = PLANETS.find((p) => p.id === kind.split(':')[1]) ?? planet;
            return { owner, kind: 'boss', title: pl.boss.name, faction: factionOf(pl), boss: pl.id };
          }
          const foe = isFoe(kind) ? FOES[kind] : undefined;
          const skin = planet.enemies.find((e) => e.archetype === (foe?.model ?? kind)) ?? planet.enemies[0];
          return { owner, kind, title: (foe?.name ?? kind).toUpperCase(), faction: foe?.faction ?? factionOf(planet), skin, model: foe?.model ?? kind, scale: foe?.scale };
        }),
      );
      game.go(new WreckScreen(game, run, wrecks, planet, 7, () => flow.toChart(game)));
    } else if (screen === 'core') {
      // &grown=5 (knots already grown, so the next wakes it), &held=laugh,creed (imprints held), &look (from the chart)
      const { CoreScreen } = await import('./screens/core');
      const core = await import('./game/core');
      run.crew.forEach((c) => {
        for (let k = 0, n = Number(q.get('grown') ?? 0); n > 0 && k < 60; k++) {
          const i = c.core.tree.findIndex((_, j) => core.reaches(c.core, j) && !c.core.grown[j]);
          if (i < 0) break;
          core.grow(c.core, i);
          n--;
        }
        for (const id of (q.get('held') ?? '').split(',').filter((id) => id in core.IMPRINTS)) core.imprint(c.core, id as ImprintId);
        // (near full, so this fight's feed grows a knot)
        c.core.learnt = core.toGrow(core.grownCount(c.core)) - 9;
      });
      const was = run.crew.map((c) => structuredClone(c.core));
      const fed = run.crew.map(() => ({
        vein: { nerve: 7, steel: 5, grease: 4 },
        lines: [
          { vein: 'nerve' as const, text: '9 PERFECTS', n: 4 },
          { vein: 'nerve' as const, text: '46 GRAZES', n: 3 },
          { vein: 'steel' as const, text: '2 TAKEDOWNS', n: 2 },
          { vein: 'steel' as const, text: '1 BIG TAKEDOWN', n: 3 },
          { vein: 'grease' as const, text: '2 WELDS', n: 4 },
        ],
      }));
      if (q.has('look')) game.go(new CoreScreen(game, run, null, null, () => flow.toChart(game)));
      else {
        run.crew.forEach((c, i) => core.learn(c.core, fed[i]));
        const scr = new CoreScreen(game, run, fed, was, () => flow.toChart(game));
        // &offer: straight to an IMPRINT knot's three
        if (q.has('offer')) scr.devOffer();
        game.go(scr);
      }
    } else if (screen === 'results') {
      const { Results } = await import('./screens/results');
      const { convoyRoles } = await import('./sim/convoy');
      // &convoy=101: an escort's results, the middle hauler lost
      const home = q.get('convoy')?.split('').map((c) => c === '1');
      // &heist=cfj: a heist's results (c caught, f fell, j jumped; a D on the end: taken down)
      const hq = q.get('heist');
      const spec = levelSpec(PLANETS[0], home ? 'escort' : hq ? 'heist' : 'raid', 1, 0.2);
      const res = { cleared: true, scrap: 42, score: 12345, loot: [[{ id: 'seeker', tier: 'epic' as const, mods: [{ k: 'dmg' as const, roll: 0.6 }, { k: 'rate' as const, roll: 0.3 }] }], []], hull: [60, 60], stats: run.crew.map(() => ({ hits: 2, grazes: 30, kills: 80, crashes: 0 })), report: { rank: 'A', lines: ['KILLED 30/34  WAVES WIPED 5/8  +40 SCRAP', 'BOUNTIES 1/2'] }, wrecks: [], fed: run.crew.map(() => ({ vein: { nerve: 3, steel: 5, grease: 2 }, lines: [] })), spent: [] };
      if (home) {
        const n = home.filter(Boolean).length;
        Object.assign(res, { convoy: { delivered: n, home, paid: n * 17, roles: convoyRoles(spec.seed) }, report: { rank: 'CBAS'[n], lines: [`HAULERS HOME ${n}/3  +${n * 17} SCRAP`, `${3 - n} CRATES LOST WITH THEM`] } });
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

/** &parts=sentry.1.0,ram.0.0.thunderous: bolts these parts on at (column, row), over whatever sat there (a fourth field: a legendary with that trait). */
function fitParts(b: Build) {
  const want = game.params.get('parts');
  if (!want) return;
  for (const s of want.split(',')) {
    const [id, c, r, trait] = s.split('.');
    if (!PARTS.some((d) => d.id === id)) continue;
    const add: Placement = { id, c: Number(c), r: Number(r) };
    if (trait) Object.assign(add, { tier: 'legendary', trait: trait as TraitId });
    const taken = new Set(cellsOf(add).map(([cc, rr]) => `${cc},${rr}`));
    b.parts = b.parts.filter((p) => !cellsOf(p).some(([cc, rr]) => taken.has(`${cc},${rr}`)));
    b.parts.push(add);
  }
}

boot();
