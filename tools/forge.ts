/**
 * The forge, headless: fly builds against a target with the autopilot, several seeds each, and set
 * them side by side: how fast they clear, what they cost, and where the damage came from.
 *
 *   just forge --frame kestrel --a rivet,flak --b frost,anchor,cryofeed --target plated --seeds 6 --combos
 *
 * --a, --b, --c ...: a build each (part ids, comma-separated; `id:tier` for a tier)
 * --target: a preset (crowd, plated, shielded, elites, mixed) or waves (`gunship@30,brute@80`)
 * --combos: blows cash in setups (both ways if --combos=both)
 * --difficulty, --planet, --tough, --keep (keep the frame's own engines and aux; on by default)
 */

import { fly, fitLength, type FlyResult } from '../src/lab/fly';
import { kitBuild, TARGETS, type KitPart } from '../src/lab/forge-kit';
import { registerLabParts } from '../src/game/lab-parts';
import { parseWaves } from '../src/sim/director';
import type { Tier } from '../src/game/loot';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const [k, v] = a.slice(2).split('=');
  const next = process.argv[i + 1];
  args.set(k, v ?? (next && !next.startsWith('--') ? (i++, next) : ''));
}

registerLabParts();
const frame = args.get('frame') ?? 'kestrel';
const seeds = Number(args.get('seeds') ?? 4);
const difficulty = Number(args.get('difficulty') ?? 0.5);
const planet = args.get('planet') ?? 'orutal';
const tough = Number(args.get('tough') ?? 1);
const keepStart = args.get('keep') !== 'no';
const tq = args.get('target') ?? 'mixed';
const waves = parseWaves(TARGETS.find((t) => t.id === tq)?.waves ?? tq);
const combosArg = args.get('combos');
const comboModes = combosArg === 'both' ? [false, true] : [combosArg !== undefined];

const builds = [...args.entries()].filter(([k]) => /^[a-z]$/.test(k) && k !== 'x');
if (!builds.length) {
  console.error('give at least one build: --a rivet,flak');
  process.exit(1);
}

interface Row {
  name: string;
  runs: FlyResult[];
}
const rows: Row[] = [];
for (const [k, list] of builds) {
  const parts: KitPart[] = list.split(',').filter(Boolean).map((s) => {
    const [id, tier] = s.split(':');
    return { id, tier: tier as Tier | undefined };
  });
  const { build, left } = kitBuild({ frame, parts, keepStart });
  if (left.length) console.warn(`${k}: no room for ${left.join(', ')}`);
  for (const combos of comboModes) {
    const runs: FlyResult[] = [];
    for (let s = 1; s <= seeds; s++)
      runs.push(fly({ key: `${k}${s}`, planet, mode: 'raid', seed: s, difficulty, builds: [build], waves, length: fitLength(waves), tough, combos }));
    rows.push({ name: `${k}: ${list}${comboModes.length > 1 ? (combos ? ' +combos' : '') : ''}`, runs });
  }
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (x: number, d = 1) => x.toFixed(d);

console.log(`\n${frame}, target ${tq}, difficulty ${difficulty}, ${seeds} seeds${comboModes.length === 1 && comboModes[0] ? ', combos on' : ''}\n`);
console.log(['build'.padEnd(44), 'clear', 'ttk/wave', 'dps', 'hull lost', 'killed', 'missed', 'cash-ins'].join('  '));
for (const r of rows) {
  const clear = r.runs.filter((x) => x.outcome === 'clear').length / r.runs.length;
  const ttk = mean(r.runs.flatMap((x) => x.waves.filter((w) => w.end !== null).map((w) => w.end! - w.start)));
  const lost = mean(r.runs.map((x) => x.taken[0] / x.hullMax[0]));
  const cash = mean(r.runs.map((x) => Object.values(x.cashed).reduce((a, b) => a + b, 0)));
  console.log([r.name.slice(0, 44).padEnd(44), pct(clear).padStart(5), `${fmt(ttk)}s`.padStart(8), fmt(mean(r.runs.map((x) => x.dps)), 0).padStart(3), pct(lost).padStart(9), fmt(mean(r.runs.map((x) => x.killed)), 0).padStart(6), fmt(mean(r.runs.map((x) => x.missed)), 0).padStart(6), fmt(cash).padStart(8)].join('  '));
}
console.log('\nwhere the damage came from:');
for (const r of rows) {
  const by: Record<string, number> = {};
  const cashed: Record<string, number> = {};
  for (const x of r.runs) {
    for (const [k, v] of Object.entries(x.by)) by[k] = (by[k] ?? 0) + v;
    for (const [k, v] of Object.entries(x.cashed)) cashed[k] = (cashed[k] ?? 0) + v;
  }
  const total = Object.values(by).reduce((a, b) => a + b, 0) || 1;
  const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / total)}`);
  const cs = Object.entries(cashed).map(([k, v]) => `${k}×${fmt(v / r.runs.length)}`);
  console.log(`  ${r.name}\n    ${parts.join(', ')}${cs.length ? `\n    cash-ins a run: ${cs.join(', ')}` : ''}`);
}
