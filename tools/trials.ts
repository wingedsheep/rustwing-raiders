/**
 * Pattern trials (src/sim/trials.ts), headless: how hard each attack pattern can get and still be
 * dodged, by each reader over a run, and the table the game reads (src/generated/trials.json).
 *
 *   just trials                            every family against every reader, and write the table
 *   just trials --family ring,fan          only these
 *   just trials --combo ring+burst         patterns together (their frontier as one), not written
 *   just trials --mode boss                a boss's screen (held still) instead of a wave's
 *   just trials --show ring --s 0.6 --reader 2 --seed 3
 *                                          fly one trial and write a replay to open in the browser
 *                                          (--at 4.5: open it paused 4.5 s in; --out: where)
 *
 * Runs are shared out over every core (--cores to say how many).
 */

import { cpus } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { FAMILIES, HOMES, PUSH, READERS, SCROLL, fly, frontier, type TrialTable } from '../src/sim/trials';
import { existsSync, readFileSync } from 'node:fs';
import { rng } from '../src/util';
import { HALF_H, REACH_W } from '../src/sim/types';

interface Job {
  families: string[];
  reader: number;
  scroll: number;
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

const knobs = (id: string, s: number) =>
  Object.entries(FAMILIES[id].knobs)
    .map(([k, [a, b]]) => `${k} ${(a + (b - a) * s).toFixed(k === 'n' || k === 'arms' || k === 'burst' || k === 'hole' ? 0 : 2)}`)
    .join(', ');

if (!isMainThread) {
  parentPort!.on('message', (job: Job | null) => {
    if (!job) process.exit(0);
    const t0 = Date.now();
    const s = frontier(job.families, READERS[job.reader], { scroll: job.scroll });
    parentPort!.postMessage({ ...job, s, ms: Date.now() - t0 });
  });
} else {
  const args = parse(process.argv.slice(2));
  const mode = (args.mode ?? 'wave') as keyof typeof SCROLL;
  const scroll = SCROLL[mode];

  if (args.show) {
    // one trial, as a replay
    const ids = args.show.split('+');
    const s = Number(args.s ?? 0.5);
    const reader = READERS[Number(args.reader ?? 0)];
    const seed = Number(args.seed ?? 1);
    const rand = rng(seed * 104729 + 3);
    const ems = ids.flatMap((id) => FAMILIES[id].make(s, rand));
    // (the first of the reader's spots that gets through, as the verdict flies it; --home to pick one)
    const homes = args.home ? [Number(args.home)] : HOMES;
    let f = fly(ems, reader, seed, { scroll, record: true, home: homes[0] });
    for (const home of homes.slice(1)) if (f.hit) f = fly(ems, reader, seed, { scroll, record: true, home });
    const out = args.out ?? join(process.env.TMPDIR ?? '/tmp', `trial-${ids.join('+')}-${s}-${seed}.html`);
    writeFileSync(out, viewer(`${ids.join(' + ')} at s ${s}, ${reader.name} reader, seed ${seed}: ${f.hit ? `hit at ${f.t.toFixed(2)} s` : `clean, closest ${f.closest.toFixed(2)} u`}`, args.at ? Math.round(Number(args.at) * 60) : undefined, f.frames!));
    console.log(`${f.hit ? `HIT at ${f.t.toFixed(2)} s` : `clean (closest ${f.closest.toFixed(2)} u)`}: ${knobs(ids[0], s)}\n${out}`);
    process.exit(0);
  }

  const sets = args.combo ? [args.combo.split('+')] : (args.family ? args.family.split(',') : Object.keys(FAMILIES)).map((id) => [id]);
  const jobs: Job[] = sets.flatMap((families) => READERS.map((_, reader) => ({ families, reader, scroll })));
  const cores = Math.min(Number(args.cores ?? cpus().length), jobs.length);
  const found: Record<string, number[]> = {};
  const t0 = Date.now();
  let next = 0;
  await new Promise<void>((done) => {
    let live = cores;
    for (let w = 0; w < cores; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => worker.postMessage(next < jobs.length ? jobs[next++] : null);
      worker.on('message', (r: Job & { s: number; ms: number }) => {
        const key = r.families.join('+');
        (found[key] ??= READERS.map(() => -1))[r.reader] = r.s;
        console.log(`${key.padEnd(14)} ${READERS[r.reader].name.padEnd(10)} s ${r.s.toFixed(3)}  (${(r.ms / 1000).toFixed(1)} s)`);
        feed();
      });
      worker.on('exit', () => {
        if (--live === 0) done();
      });
      feed();
    }
  });
  // a sharper reader can fly anything a gentler one can (it sees sooner and flies faster): it's never set below one
  for (const f of Object.values(found)) for (let k = 1; k < f.length; k++) f[k] = Math.max(f[k], f[k - 1]);
  console.log(`\n${jobs.length} frontiers in ${((Date.now() - t0) / 1000).toFixed(0)} s (${mode}). The most each reader can be shown to dodge, and what a ${mode} flies there (${PUSH[mode][0]} of it on the first stop, up to ${PUSH[mode][1]} at the last boss):\n`);
  for (const [key, f] of Object.entries(found)) {
    console.log(key);
    READERS.forEach((r, k) => {
      const at = f[k] * (PUSH[mode][0] + ((PUSH[mode][1] - PUSH[mode][0]) * k) / (READERS.length - 1));
      console.log(`  ${r.name.padEnd(10)} s ${f[k].toFixed(2)}  ${key.includes('+') ? '' : `flown at ${at.toFixed(2)}: ${knobs(key, at)}`}`);
    });
  }
  if (!args.combo) {
    // (a run of some families goes over theirs in the table, and keeps the rest)
    const out = join(process.cwd(), 'src', 'generated', `trials_${mode}.json`);
    const was: Partial<TrialTable> = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
    const table: TrialTable & { mode: string; made: string } = { mode, made: new Date().toISOString().slice(0, 10), readers: READERS.map((r) => r.name), frontier: { ...was.frontier, ...found } };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(table, null, 2) + '\n');
    console.log(`\nwrote ${out}`);
  }
  process.exit(0);
}

/** A replay page: the trial in pure shapes, the ship's goal, the hit. */
function viewer(title: string, start: number | undefined, frames: { x: number; z: number; shots: number[]; foes: number[]; goal: [number, number] | null }[]) {
  return `<!doctype html><meta charset="utf-8"><title>Trial</title>
<style>body{margin:0;background:#101318;color:#cfd6df;font:14px system-ui;display:flex;flex-direction:column;align-items:center}canvas{background:#181c24;max-width:100%}p{margin:8px}</style>
<p>${title}</p><canvas id="c" width="${Math.round(REACH_W * 2 * 10)}" height="${Math.round(HALF_H * 2 * 10)}"></canvas>
<p><button id="p">pause</button> <input id="r" type="range" min="0" max="${frames.length - 1}" value="0" style="width:420px"> <span id="t"></span></p>
<script>
const F = ${JSON.stringify(frames)};
const c = document.getElementById('c'), g = c.getContext('2d'), S = 10, W = ${REACH_W}, H = ${HALF_H};
let f = 0, run = true;
const at = /f=(\d+)/.exec(location.search + location.hash) ?? (${start ?? -1} >= 0 ? [0, ${start ?? -1}] : null); if (at) { f = Math.min(F.length - 1, +at[1]); run = false; }
document.getElementById('p').onclick = (e) => { run = !run; e.target.textContent = run ? 'pause' : 'play'; };
const r = document.getElementById('r'); r.oninput = () => { f = +r.value; draw(); };
const X = (x) => (x + W) * S, Z = (z) => (z + H) * S;
function draw() {
  const fr = F[f]; g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#2a3140'; g.strokeRect(X(-${REACH_W - 1.2}), Z(-H + 3), (2 * ${REACH_W - 1.2}) * S, (2 * H - 5) * S);
  g.fillStyle = '#ff4a6a';
  for (let k = 0; k < fr.shots.length; k += 3) { g.beginPath(); g.arc(X(fr.shots[k]), Z(fr.shots[k + 1]), fr.shots[k + 2] * S, 0, 7); g.fill(); }
  g.fillStyle = '#c9a25a'; for (let k = 0; k < fr.foes.length; k += 3) { g.beginPath(); g.arc(X(fr.foes[k]), Z(fr.foes[k + 1]), fr.foes[k + 2] * S, 0, 7); g.fill(); }
  if (fr.goal) { g.strokeStyle = '#6fd3ff'; g.beginPath(); g.moveTo(X(fr.x), Z(fr.z)); g.lineTo(X(fr.goal[0]), Z(fr.goal[1])); g.stroke(); }
  g.fillStyle = f === F.length - 1 && /hit/.test(document.title + ${JSON.stringify(title)}) ? '#ffd23f' : '#8cf5a0';
  g.beginPath(); g.arc(X(fr.x), Z(fr.z), 0.3 * S + 1, 0, 7); g.fill();
  r.value = f; document.getElementById('t').textContent = (f / 60).toFixed(2) + ' s';
}
setInterval(() => { if (run) { f = (f + 1) % F.length; draw(); } }, 1000 / 60);
draw();
</script>`;
}
