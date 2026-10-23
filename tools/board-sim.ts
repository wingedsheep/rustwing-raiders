/**
 * The boarding bench: plays boardings with the bot, no graphics, across ship sizes, crews,
 * conditions and one or two aboard, and prints how they went (got out, crates, the core, hits,
 * time). A rough proxy for a player, for tuning, not a verdict.
 *
 *   npx esbuild tools/board-sim.ts --bundle --platform=node --outfile=/tmp/board-sim.mjs --format=esm && node /tmp/board-sim.mjs [seeds] [hard]
 */
import { Boarding, type BoardSpec } from '../src/sim/boarding';
import { BoardBot } from '../src/sim/board-bot';
import type { Condition, Family, ShipSize } from '../src/sim/deck';

const seeds = Number(process.argv[2] ?? 16);
const hard = Number(process.argv[3] ?? 0.7);
const only = process.argv[4] ?? '';

interface Row { got: number; crates: number; core: number; hits: number; time: number; ranks: Record<string, number>; caught: number; downed: number; n: number }

function play(spec: BoardSpec) {
  const b = new Boarding(spec);
  const bot = new BoardBot(b);
  let steps = 0;
  while ((b.state === 'intro' || b.state === 'play') && steps < 60 * 400) {
    b.step(b.heroes.map((h) => bot.intent(h)), []);
    b.events.length = 0;
    steps++;
  }
  return { r: b.result(), t: steps / 60 };
}

const rows: [string, Row][] = [];
const run = (label: string, mk: (seed: number) => BoardSpec) => {
  const row: Row = { got: 0, crates: 0, core: 0, hits: 0, time: 0, ranks: {}, caught: 0, downed: 0, n: 0 };
  for (let s = 0; s < seeds; s++) {
    const { r, t } = play(mk(1000 + s * 7919));
    row.n++;
    if (r.outcome === 'escaped') row.got++;
    if (r.outcome === 'caught') row.caught++;
    if (r.outcome === 'downed') row.downed++;
    row.crates += r.crates.filter(Boolean).length / r.crates.length;
    row.core += r.core ? 1 : 0;
    row.hits += r.heroes.reduce((a, h) => a + h.hits, 0) / r.heroes.length;
    row.time += t;
    const k = r.rank ?? '-';
    row.ranks[k] = (row.ranks[k] ?? 0) + 1;
  }
  rows.push([label, row]);
  const p = (x: number) => `${Math.round((x / row.n) * 100)}%`.padStart(5);
  console.log(`${label.padEnd(30)} out ${p(row.got)}  caught ${p(row.caught)}  downed ${p(row.downed)}  crates ${p(row.crates)}  core ${p(row.core)}  hits ${(row.hits / row.n).toFixed(1).padStart(4)}  ${(row.time / row.n).toFixed(0).padStart(3)}s  ${Object.entries(row.ranks).sort().map(([k, v]) => `${k}${v}`).join(' ')}`);
};

const families: Family[] = ['scrap', 'lattice', 'bloom'];
const sizes: ShipSize[] = [0, 1, 2, 3];
const conds: Condition[] = ['none', 'dark', 'cages', 'breach'];
for (const heroes of [1, 2])
  for (const size of sizes)
    for (const family of families) {
      if (only && !`${family}`.includes(only)) continue;
      run(`${['skiff', 'freighter', 'hauler', 'bulker'][size]} ${family} x${heroes}`, (seed) => ({ seed, hard: hard + [0, 0.2, 0.42, 0.55][size], bounty: 1, heroes, family, size, condition: 'none' }));
    }
for (const condition of conds.slice(1))
  for (const heroes of [1, 2]) run(`freighter scrap ${condition} x${heroes}`, (seed) => ({ seed, hard: hard + 0.2, bounty: 1, heroes, family: 'scrap', size: 1, condition }));
