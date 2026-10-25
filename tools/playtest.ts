/**
 * The flight recorder's reader (see docs/simple-run.md#you-play-i-tune-the-flight-recorder):
 * what the runs in playtests/ say, and any stage of them flown again.
 *
 *   just playtest-report                      the latest day's runs
 *   just playtest-report --all                every run in playtests/
 *   just playtest-report playtests/a.json ... these runs
 *   just replay <file> --stage 3              fly stage 3 again headless: does it end where it did? and its timeline
 *   just replay <file> --stage 3 --browser    watch it in the browser (dev server on 5190)
 *   just replay <file> --stage 3 --video      record it to an mp4 (tools/record.ts)
 *   just replay <file>                        every stage, headless
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { RunLog } from '../src/game/recorder';
import { charge, endOf, levelFrom, StageRecorder, Tape, type StageLog } from '../src/sim/recording';
import { NEUTRAL } from '../src/sim/types';
import { weightOf } from '../src/sim/factions';

const DIR = 'playtests';
const argv = process.argv.slice(2);
const cmd = argv.shift();
const flag = (name: string) => argv.includes(`--${name}`);
const opt = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const load = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as RunLog;
const fileOf = (f: string) => (f.includes('/') || f.endsWith('.json') ? f : join(DIR, `${f}.json`));
const sum = (r: Record<string, number>, into: Record<string, number>) => {
  for (const [k, v] of Object.entries(r)) into[k] = (into[k] ?? 0) + v;
  return into;
};
const top = (r: Record<string, number>, n = 3) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${k} ${Math.round(v)}`)
    .join(', ');
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);
const stageName = (s: StageLog) => `${s.setup.planet} ${s.setup.mode === 'boss' ? 'WARDEN' : s.setup.mode}`;

/** The verbs a pilot ought to be pressing: any never pressed in a session is worth a look. */
const VERBS: [key: string, name: string][] = [
  ['dash', 'dash'], ['perfect', 'perfect dash'], ['heavy', 'heavy'], ['special', 'special'], ['aux', 'aux'], ['boost', 'boost'],
  ['focus_secs', 'focus'], ['weld_start', 'weld'], ['takedown', 'takedown'], ['graze', 'graze'],
];

/** Time-to-kill targets (docs/simple-run.md#time-to-kill-the-target), for what the logs can tell apart. */
const ELITE_TTK = [6, 10];
/** A stage's pace: foes a minute, and the share of weak, medium and heavy (by count; see factions.ts weightOf). */
function pace(s: StageLog) {
  if (!s.foes) return '';
  let n = 0;
  const w = { weak: 0, medium: 0, heavy: 0 };
  for (const [kind, f] of Object.entries(s.foes)) {
    if (kind === 'boss') continue;
    w[weightOf(kind.replace('elite:', ''))] += f.n;
    n += f.n;
  }
  const mins = Math.max(1, s.end?.time ?? 60) / 60;
  const pc = (k: keyof typeof w) => Math.round((w[k] / Math.max(1, n)) * 100);
  return `${Math.round(n / mins)}/min ${pc('weak')}/${pc('medium')}/${pc('heavy')}`;
}
const PHASE_SECS = [30, 50];

function report(files: string[]) {
  const runs = files.map(load);
  if (!runs.length) return console.log('no runs to report on');
  console.log(`\n${runs.length} run${runs.length > 1 ? 's' : ''}: ${files.map((f) => basename(f, '.json')).join(', ')}\n`);

  console.log('RUNS');
  for (const r of runs) {
    const last = r.stages[r.stages.length - 1];
    const how = r.end ? (r.end.won ? 'WON' : `died in sector ${r.end.sector + 1}`) : `unfinished (${r.stages.length} stages)`;
    const mins = ((r.flightSecs + r.menuSecs) / 60).toFixed(1);
    console.log(`  run ${r.seed}  ${r.frames.join('+')}  build ${r.commit ?? '?'}  ${how}${last && !r.end?.won ? `, last: ${stageName(last)}` : ''}  ${mins} min (${Math.round((r.menuSecs / Math.max(1, r.flightSecs + r.menuSecs)) * 100)}% in menus)`);
    console.log(`    route: ${r.route.map((s) => `${s.kind}${s.planet ? `@${s.planet}` : ''}${s.reward ? `(${s.reward})` : ''}`).join(' → ')}`);
    if (r.end?.line) console.log(`    "${r.end.line}"`);
  }

  console.log('\nSTAGES');
  console.log(`  ${pad('#', 4)}${pad('stage', 20)}${pad('result', 8)}${lpad('time', 6)}  ${pad('hull', 12)}${pad('rated', 8)}${pad('pace', 18)}hurt by`);
  const lost: Record<string, number> = {};
  const deaths: string[] = [];
  const kills: Record<string, { n: number; ttk: number[]; escaped: number }> = {};
  const verbs: Record<string, number> = {};
  const ratings: Record<string, number> = {};
  const dealt: Record<string, number> = {};
  let n = 0;
  for (const r of runs) {
    for (const s of r.stages) {
      n++;
      const hullStart = Math.round(s.pilots.reduce((a, p) => a + p.hullStart, 0));
      const hullEnd = Math.round(s.pilots.reduce((a, p) => a + p.hullEnd, 0));
      const stageLost: Record<string, number> = {};
      for (const p of s.pilots) {
        sum(p.lost, stageLost);
        sum(p.verbs, verbs);
        for (const d of p.downs) deaths.push(`  run ${r.seed} stage ${r.stages.indexOf(s) + 1} (${stageName(s)}): ${d.t}s at ${d.where}, by ${d.by}`);
      }
      sum(stageLost, lost);
      sum(s.dealt, dealt);
      for (const [k, v] of Object.entries(s.kills)) {
        const into = (kills[k] ??= { n: 0, ttk: [], escaped: 0 });
        into.n += v.n;
        into.ttk.push(...v.ttk);
        into.escaped += v.escaped;
      }
      ratings[s.rating ?? 'skipped'] = (ratings[s.rating ?? 'skipped'] ?? 0) + 1;
      const pct = hullStart ? Math.round(((hullStart - hullEnd) / hullStart) * 100) : 0;
      console.log(`  ${pad(n, 4)}${pad(stageName(s), 20)}${pad(s.end?.state ?? '?', 8)}${lpad(Math.round(s.end?.time ?? 0) + 's', 6)}  ${pad(`${hullStart}→${hullEnd} ${pct >= 0 ? '-' : '+'}${Math.abs(pct)}%`, 12)}${pad(s.rating ?? '-', 8)}${pad(pace(s) || '-', 18)}${top(stageLost) || '-'}`);
    }
  }
  console.log('  (hull target: 25-40% lost a stage, Wardens more. pace: foes a minute, % weak/medium/heavy by kind)');

  console.log('\nDEATHS');
  console.log(deaths.length ? deaths.join('\n') : '  none');

  console.log('\nWHAT HURT (hull lost, all stages)');
  const total = Object.values(lost).reduce((a, b) => a + b, 0) || 1;
  for (const [k, v] of Object.entries(lost).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${pad(k, 28)}${lpad(Math.round(v), 5)}  ${lpad(Math.round((v / total) * 100), 3)}%`);

  console.log('\nTIME TO KILL (first hit to kill; median, slowest tenth)');
  for (const [k, v] of Object.entries(kills).sort((a, b) => median(b[1].ttk) - median(a[1].ttk))) {
    const m = median(v.ttk);
    const p90 = [...v.ttk].sort((a, b) => a - b)[Math.floor(v.ttk.length * 0.9)] ?? 0;
    const flag = k.startsWith('elite:') && (m < ELITE_TTK[0] || m > ELITE_TTK[1]) ? `  (elite target ${ELITE_TTK[0]}-${ELITE_TTK[1]}s)` : '';
    const times = v.n ? `  ${lpad(m.toFixed(1), 5)}s  ${lpad(p90.toFixed(1), 5)}s${flag}` : '';
    console.log(`  ${pad(k, 24)}${lpad(v.n, 4)} killed${v.escaped ? `, ${v.escaped} got away` : ''}${times}`);
  }

  console.log('\nWARDENS');
  let any = false;
  for (const r of runs)
    for (const s of r.stages) {
      const w = s.warden;
      if (!w) continue;
      any = true;
      console.log(`  ${w.name} (run ${r.seed}): ${w.killed ? 'down' : 'not down'}, welds at ${w.welds.join(', ') || '-'}s, rated ${s.rating ?? '-'}`);
      w.phases.forEach((ph, k) => {
        const off = ph.secs < PHASE_SECS[0] || ph.secs > PHASE_SECS[1] ? `  (target ${PHASE_SECS[0]}-${PHASE_SECS[1]}s)` : '';
        console.log(`    phase ${k + 1}: ${ph.secs}s${off}, ${ph.hits} hits, -${Math.round(ph.lost)} hull${ph.hits ? `: ${top(ph.byMove, 5)}` : ''}`);
      });
    }
  if (!any) console.log('  none met');

  console.log('\nDAMAGE DEALT, BY WHAT');
  const dealtTotal = Object.values(dealt).reduce((a, b) => a + b, 0) || 1;
  for (const [k, v] of Object.entries(dealt).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${pad(k, 24)}${lpad(Math.round((v / dealtTotal) * 100), 3)}%`);

  console.log('\nPICKS');
  const offered: Record<string, number> = {};
  const picked: Record<string, number> = {};
  for (const r of runs)
    for (const o of r.offers) {
      for (const it of o.options) offered[it.split(':')[0]] = (offered[it.split(':')[0]] ?? 0) + 1;
      if (o.picked) picked[o.picked.split(':')[0]] = (picked[o.picked.split(':')[0]] ?? 0) + 1;
    }
  for (const r of runs) for (const o of r.offers) console.log(`  run ${r.seed} ${o.where}: [${o.options.join(', ')}] → ${o.picked ?? '-'}`);
  const never = Object.keys(offered).filter((k) => !picked[k] && offered[k] >= 2);
  if (never.length) console.log(`  offered twice or more, never picked: ${never.join(', ')}`);
  for (const r of runs) for (const b of r.buys) console.log(`  run ${r.seed} dealer: ${b.what} ${b.price > 0 ? `-${b.price}` : `+${-b.price}`} scrap`);

  console.log('\nBUTTONS');
  console.log(`  ${Object.entries(verbs).filter(([k]) => !k.endsWith('_secs')).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ')}`);
  console.log(`  held: fire ${Math.round(verbs.fire_secs ?? 0)}s, focus ${Math.round(verbs.focus_secs ?? 0)}s, boost ${Math.round(verbs.boost_secs ?? 0)}s`);
  const unused = VERBS.filter(([k]) => !verbs[k]).map(([, name]) => name);
  console.log(`  never pressed: ${unused.join(', ') || 'none'}`);
  // (the weld filled, and was never used)
  if (verbs.weld_ready && !verbs.weld_start) console.log(`  the weld was ready ${verbs.weld_ready} times and never used`);

  console.log('\nRATINGS');
  console.log(`  ${Object.entries(ratings).map(([k, v]) => `${k} ${v}`).join(', ')}\n`);
}

/** Flies a recorded stage again, headless: its tally, its timeline, and whether it ended where it did. */
function replayStage(log: RunLog, k: number, timeline: boolean) {
  const s = log.stages[k];
  const lv = levelFrom(s.setup);
  const tapes = s.inputs.map((t) => Tape.read(t));
  const rec = new StageRecorder(lv, s.setup);
  const lines: string[] = [];
  const at = () => `${lpad(lv.time.toFixed(1), 6)}s ${pad(`${lv.terrain.biome(lv.scroll).id} ${Math.round(lv.progress * 100)}%`, 18)}`;
  const len = tapes[0]?.length ?? 0;
  for (let t = 0; t < len; t++) {
    const intents = tapes.map((tp) => tp[t] ?? NEUTRAL);
    rec.input(intents);
    if (s.setup.charged) charge(lv);
    lv.step(intents);
    rec.events(lv.events);
    if (timeline)
      for (const e of lv.events) {
        if (e.type === 'playerHit') lines.push(`${at()} P${e.id + 1} hit by ${e.by ?? e.cause}${e.shield ? ' (shield)' : ` -${e.dmg}`}  hull ${lv.players[e.id].hp}`);
        else if (e.type === 'down') lines.push(`${at()} P${e.id + 1} DOWN`);
        else if (e.type === 'crash') lines.push(`${at()} P${e.id + 1} crashed into the land`);
        else if (e.type === 'bossWarning') lines.push(`${at()} the Warden: ${e.name}`);
        else if (e.type === 'bossPhase') lines.push(`${at()} Warden phase ${e.phase + 1}`);
        else if (e.type === 'biome') lines.push(`${at()} into ${s.setup.biomes[e.index] ?? e.index}`);
        else if (e.type === 'weld' && e.state === 'done') lines.push(`${at()} P${e.id + 1} welded`);
        else if (e.type === 'takedown' && e.big) lines.push(`${at()} P${e.id + 1} big takedown`);
        else if (e.type === 'clear') lines.push(`${at()} CLEAR`);
        else if (e.type === 'failed') lines.push(`${at()} FAILED`);
      }
    lv.events.length = 0;
  }
  const got = endOf(lv, s.end?.state ?? 'quit');
  const want = s.end;
  const same = !!want && JSON.stringify({ ...got, state: 0 }) === JSON.stringify({ ...want, state: 0 });
  console.log(`stage ${k + 1}: ${stageName(s)} seed ${s.setup.seed}, ${len} ticks: ${same ? 'ends where it did' : 'DIFFERS'}`);
  if (!same) {
    console.log(`  recorded: ${JSON.stringify(want)}`);
    console.log(`  replayed: ${JSON.stringify(got)}`);
  }
  rec.finish(got.state);
  console.log(`  pace ${pace(rec.log)} (foes a minute, % weak/medium/heavy): ${Object.entries(rec.log.foes ?? {}).map(([k, f]) => `${k} ${f.n}`).join(', ')}`);
  if (timeline) console.log(lines.join('\n'));
  return same;
}

function latestDay() {
  const all = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  if (!all.length) return [];
  const day = all[all.length - 1].slice(0, 10);
  return all.filter((f) => f.startsWith(day)).map((f) => join(DIR, f));
}

if (cmd === 'report') {
  const given = argv.filter((a) => !a.startsWith('--'));
  let files: string[] = [];
  try {
    files = given.length ? given.map(fileOf) : flag('all') ? readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().map((f) => join(DIR, f)) : latestDay();
  } catch {
    console.log(`nothing in ${DIR}/ yet: play a run on the dev server (just serve) and it's saved there`);
    process.exit(0);
  }
  report(files);
} else if (cmd === 'replay') {
  const file = argv.find((a) => !a.startsWith('--') && a !== opt('stage'));
  if (!file) {
    console.log('just replay <file> [--stage n] [--browser | --video]');
    process.exit(1);
  }
  const path = fileOf(file);
  const log = load(path);
  const stage = opt('stage');
  if (stage && (flag('browser') || flag('video'))) {
    const query = `?replay=${basename(path, '.json')}&stage=${stage}`;
    if (flag('browser')) spawnSync('open', [`http://localhost:5190/${query}`]);
    else {
      const s = log.stages[Number(stage) - 1];
      const secs = String(Math.ceil((s?.end?.time ?? 120) + 6));
      spawnSync('npx', ['esbuild', 'tools/record.ts', '--bundle', '--platform=node', '--format=esm', '--log-level=warning', `--outfile=${process.env.TMPDIR ?? '/tmp'}/rustwing-rec.mjs`], { stdio: 'inherit' });
      spawnSync('node', [`${process.env.TMPDIR ?? '/tmp'}/rustwing-rec.mjs`, query, '--secs', secs, '--out', opt('out') ?? `${process.env.TMPDIR ?? '/tmp'}/replay-${basename(path, '.json')}-${stage}`], { stdio: 'inherit' });
    }
  } else {
    const ks = stage ? [Number(stage) - 1] : log.stages.map((_, k) => k);
    const ok = ks.map((k) => replayStage(log, k, !!stage)).every(Boolean);
    process.exit(ok ? 0 : 1);
  }
} else {
  console.log('playtest report [files] | replay <file> [--stage n]');
}
