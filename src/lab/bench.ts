/**
 * The bench: the waves flown headless by the autopilot, many times over, in workers. Down the
 * side, ships from the starter to an endgame build (and the build archetypes); across, the run
 * from its first stop to the third sector; solo and co-op. Each fight is judged against the bands
 * (how long a wave should take, how much hull a fight should cost), so it shows at a glance
 * whether the waves keep pace with the ship you'd likely have, and where they don't.
 */

import { ARCHETYPES, DANGERS, LADDER, STAGES, TIER_OF_LADDER, buildOf, difficultyAt, expectedAt, groupOf, stageName } from './catalog';
import { fitLength, matchWaves, type FlyJob, type FlyResult } from './fly';
import { flownWaves, kindOf } from './composer';
import { store, type BenchSettings, type LabWave } from './state';
import { lineChart } from './charts';
import { FILL, INKS, verdict, verdictPill, type Verdict } from './verdict';
import { fmt, h, hideTip, icon, kids, mean, median, tip, tipRows, toast } from './ui';
import type { Build } from '../sim/build';

type Crew = 'solo' | 'coop';

interface Row {
  id: string;
  name: string;
  note: string;
  ladder: number | null;
  loadout?: string;
}

interface Cell {
  runs: FlyResult[];
  want: number;
  ttk: number;
  hullLost: number;
  failed: number;
  leaks: number;
  dps: number;
  hits: number;
  v: Verdict | null;
}

/** Ladder colours: one hue, darkest the weakest (an ordinal ramp, for the dark surface). */
const LADDER_COL = ['#2f6fc4', '#4a8fe0', '#74aeef', '#a3c9f5', '#d2e4fb'];

const rowsOf = (b: BenchSettings): Row[] => [
  ...LADDER.map((l, i) => ({ id: l.id, name: l.name, note: l.note, ladder: i })),
  ...(b.archetypes ? ARCHETYPES.map((a) => ({ id: `arch:${a.loadout}`, name: a.name, note: `${a.note}, at the stage's tier`, ladder: null, loadout: a.loadout })) : []),
];

function buildFor(row: Row, col: number): Build {
  const stage = STAGES[col];
  if (row.ladder !== null) return buildOf(LADDER[row.ladder]);
  return buildOf({ loadout: row.loadout!, frame: 'kestrel', tier: TIER_OF_LADDER[expectedAt(stage)] });
}

const key = (row: string, col: number, crew: Crew) => `${row}|${col}|${crew}`;

/** Workers, each flying one fight at a time. */
class Pool {
  private workers: Worker[] = [];
  private queue: FlyJob[] = [];
  private busy = new Map<Worker, FlyJob>();
  onResult: (r: FlyResult) => void = () => {};
  onError: (key: string, err: string) => void = () => {};
  readonly size = Math.max(2, Math.min(12, (navigator.hardwareConcurrency || 4) - 1));

  get left() {
    return this.queue.length + this.busy.size;
  }

  run(jobs: FlyJob[]) {
    this.queue.push(...jobs);
    while (this.workers.length < this.size) {
      const w = new Worker(new URL('./bench-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (m) => {
        const job = this.busy.get(w);
        this.busy.delete(w);
        if (m.data.ok) this.onResult(m.data.result);
        else this.onError(job?.key ?? '?', m.data.error);
        this.feed(w);
      };
      this.workers.push(w);
    }
    for (const w of this.workers) if (!this.busy.has(w)) this.feed(w);
  }

  private feed(w: Worker) {
    const job = this.queue.shift();
    if (!job) return;
    this.busy.set(w, job);
    w.postMessage(job);
  }

  stop() {
    this.queue = [];
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.busy.clear();
  }
}

export function mountBench(root: HTMLElement) {
  const pool = new Pool();
  const results = new Map<string, FlyResult[]>();
  let want = 0;
  let got = 0;
  let t0 = 0;
  let ranWith = '';
  let ranRows: Row[] = [];
  let ranCrews: Crew[] = [];
  let ranPlan: LabWave[] = [];
  let ranCoopHp = 1;
  let errors = 0;
  let sel: { row: string; col: number } | null = null;
  let renderT = 0;

  const head = h('div', { class: 'bench-head' });
  const knobs = h('div', { class: 'knobs' });
  const prog = h('div', { class: 'progress', hidden: true }, h('div', { style: 'width:0%' }));
  const out = h('div', { style: 'display:flex;flex-direction:column;gap:18px' });
  root.replaceChildren(h('div', { class: 'bench' }, head, knobs, prog, out));

  const setup = () => {
    const s = store.s;
    return JSON.stringify([s.planet, s.mode, s.danger, s.source, s.source === 'script' ? s.waves.map((w) => [w.kind, w.elite, w.at, w.n]) : s.seed, s.bench.seeds, s.bench.solo, s.bench.coop, s.bench.archetypes, s.bench.coopHp]);
  };

  /** Fly the bench; `resume`: only the flights the last run (cut short by a reload) didn't get to. */
  function start(resume = false) {
    const s = store.s;
    const b = s.bench;
    pool.stop();
    const done = new Set([...results.values()].flat().map((r) => r.key));
    if (!resume) {
      results.clear();
      done.clear();
    }
    errors = 0;
    const plan = flownWaves();
    if (s.source === 'script' && !plan.length) {
      toast('Add a wave first');
      return;
    }
    ranRows = rowsOf(b);
    ranCrews = [b.solo ? 'solo' : null, b.coop ? 'coop' : null].filter((c): c is Crew => !!c);
    ranPlan = plan;
    ranCoopHp = b.coopHp;
    ranWith = setup();
    if (!ranCrews.length) {
      toast('Pick solo, co-op or both');
      return;
    }
    const extra = DANGERS.find((d) => d.id === s.danger)?.extra ?? 0;
    const waves = s.source === 'script' ? s.waves.map(({ kind, elite, at, n }) => ({ kind, elite, at, n })) : null;
    const length = waves ? fitLength(waves) : 0;
    const jobs: (FlyJob & { pri: number })[] = [];
    STAGES.forEach((stage, col) => {
      for (const row of ranRows)
        for (const crew of ranCrews)
          for (let seed = 1; seed <= b.seeds; seed++) {
            const build = buildFor(row, col);
            jobs.push({
              key: `${key(row.id, col, crew)}|${seed}`,
              planet: s.planet,
              mode: s.mode,
              seed: s.source === 'game' ? s.seed + seed - 1 : seed,
              difficulty: difficultyAt(stage, extra),
              builds: crew === 'coop' ? [build, build] : [build],
              waves,
              length,
              tough: crew === 'coop' ? b.coopHp : 1,
              // the likely ship at each stage first, then the rest of the ladder, then the archetypes
              pri: (row.ladder === null ? 10 : Math.abs(row.ladder - expectedAt(stage))) * 100 + seed * 10 + (crew === 'coop' ? 1 : 0),
            });
          }
    });
    jobs.sort((a, b) => a.pri - b.pri);
    const todo = jobs.filter((j) => !done.has(j.key));
    want = jobs.length;
    got = resumedAt = jobs.length - todo.length;
    took = 0;
    t0 = performance.now();
    pool.run(todo.map(({ pri, ...j }) => (void pri, j)));
    renderHead();
    render();
  }

  const SAVED = 'rr.wavelab.bench';
  /** The last run, kept so the results are still there after a reload. */
  function save() {
    try {
      localStorage.setItem(SAVED, JSON.stringify({ results: [...results], want, got, ranWith, ranRows, ranCrews, ranPlan, ranCoopHp, took: performance.now() - t0, errors }));
    } catch {
      /* too big, or no storage: it just won't survive a reload */
    }
  }
  function restore() {
    try {
      const raw = localStorage.getItem(SAVED);
      if (!raw) return;
      const d = JSON.parse(raw);
      for (const [k, v] of d.results) results.set(k, v);
      ({ want, got, ranWith, ranRows, ranCrews, ranPlan, ranCoopHp, errors } = d);
      t0 = performance.now() - d.took;
      took = d.took;
    } catch {
      /* nothing kept */
    }
  }
  let took = 0;
  let savedT = 0;
  /** Flights already flown when this run (a resumed one) began. */
  let resumedAt = 0;

  pool.onResult = (r) => {
    const k = r.key.split('|').slice(0, 3).join('|');
    if (!results.has(k)) results.set(k, []);
    results.get(k)!.push(r);
    got++;
    const now = performance.now();
    if (got === want || now - renderT > 300) {
      renderT = now;
      render();
    }
    if (got === want) took = now - t0;
    // (kept as it goes: the dev server reloads the page when the game's code changes)
    if (got === want || now - savedT > 3000) {
      savedT = now;
      save();
    }
    renderProgress();
  };
  pool.onError = (k, err) => {
    errors++;
    got++;
    console.error(`bench flight ${k} failed`, err);
    renderProgress();
  };

  function renderProgress() {
    const running = got < want && pool.left > 0;
    prog.hidden = !running;
    (prog.firstElementChild as HTMLElement).style.width = `${want ? (got / want) * 100 : 0}%`;
    if (!running) renderHead();
    const st = head.querySelector('.run-state');
    if (st) st.textContent = statusText();
  }

  function statusText() {
    if (!want) return 'Not run yet.';
    if (got < want && !pool.left) return `Cut short at ${got} of ${want} flights (the page reloaded). Run it again for the rest.`;
    if (got < want) {
      if (got === resumedAt) return `${got} of ${want} flights flown, working out how long the rest will take`;
      const per = (performance.now() - t0) / (got - resumedAt);
      const left = Math.round((per * (want - got)) / 1000);
      return `${got} of ${want} flights flown, about ${left < 60 ? `${left} s` : `${Math.round(left / 60)} min`} to go`;
    }
    return `${got} flights flown in ${Math.round((took || performance.now() - t0) / 1000)} s${errors ? `, ${errors} failed (see the console)` : ''}.`;
  }

  function renderHead() {
    const running = got < want && pool.left > 0;
    const stale = want > 0 && ranWith !== setup();
    head.replaceChildren(
      ...kids(
      h(
        'div',
        null,
        h('h2', null, 'Balance bench'),
        h('p', null, 'The autopilot flies your waves with every ship on the ladder, at every stage of the run, solo and in co-op. Each square is judged against the bands below; the outlined squares are the ship you’d most likely have at that stage.'),
      ),
      h('div', { class: 'grow' }),
      h('div', { class: 'sub run-state', style: stale && !running ? 'color:var(--gold)' : '' }, stale && !running ? 'The setup has changed since this ran.' : statusText()),
      running
        ? h('button', { class: 'btn', type: 'button', onclick: () => { pool.stop(); want = got; took = performance.now() - t0; save(); renderProgress(); renderHead(); render(); } }, icon('pause'), 'Stop')
        : h('button', { class: 'btn go', type: 'button', onclick: () => start() }, icon('play'), want ? 'Run again' : 'Run the bench'),
      ),
    );
  }

  function renderKnobs() {
    const b = store.s.bench;
    const num = (value: number, onSet: (v: number) => void, opts: { min: number; max: number; step: number; label: string }) =>
      h('input', { type: 'number', min: String(opts.min), max: String(opts.max), step: String(opts.step), value: String(value), 'aria-label': opts.label, onchange: (e: Event) => onSet(Number((e.target as HTMLInputElement).value)) });
    const box = (checked: boolean, label: string, onSet: (v: boolean) => void, title?: string) =>
      h('label', { class: 'field', title }, h('input', { type: 'checkbox', checked, onchange: (e: Event) => onSet((e.target as HTMLInputElement).checked) }), label);
    const flights = STAGES.length * (LADDER.length + (b.archetypes ? ARCHETYPES.length : 0)) * ((b.solo ? 1 : 0) + (b.coop ? 1 : 0)) * b.seeds;
    knobs.replaceChildren(
      h('label', { class: 'field', title: 'Flights per square: more is steadier, and slower' }, 'Seeds', num(b.seeds, (v) => store.setBench({ seeds: Math.max(1, Math.min(10, Math.round(v) || 1)) }), { min: 1, max: 10, step: 1, label: 'Seeds' })),
      box(b.solo, 'Solo', (v) => store.setBench({ solo: v })),
      box(b.coop, 'Co-op', (v) => store.setBench({ coop: v })),
      box(b.archetypes, 'Build archetypes', (v) => store.setBench({ archetypes: v }), 'Also fly the five build archetypes, at the tier the ladder has at each stage'),
      h(
        'label',
        { class: 'field', title: 'Enemy hull in co-op, times this. The game has none for waves today (the boss gets 1.5×).' },
        'Co-op enemy hull ×',
        num(b.coopHp, (v) => store.setBench({ coopHp: Math.max(0.2, Math.min(5, v || 1)) }), { min: 0.2, max: 5, step: 0.1, label: 'Co-op enemy hull' }),
      ),
      h(
        'span',
        { class: 'field', title: 'How long a wave should take to clear' },
        'Clear a wave in',
        num(b.ttk[0], (v) => store.setBench({ ttk: [v, b.ttk[1]] }), { min: 0, max: 60, step: 0.5, label: 'Shortest clear' }),
        'to',
        num(b.ttk[1], (v) => store.setBench({ ttk: [b.ttk[0], v] }), { min: 0, max: 60, step: 0.5, label: 'Longest clear' }),
        's',
      ),
      h(
        'span',
        { class: 'field', title: 'How much of the hull a fight should cost' },
        'A fight costs',
        num(Math.round(b.hull[0] * 100), (v) => store.setBench({ hull: [v / 100, b.hull[1]] }), { min: 0, max: 100, step: 5, label: 'Least hull lost' }),
        'to',
        num(Math.round(b.hull[1] * 100), (v) => store.setBench({ hull: [b.hull[0], v / 100] }), { min: 0, max: 100, step: 5, label: 'Most hull lost' }),
        '% hull',
      ),
      h(
        'span',
        { class: 'field', title: 'Most of the enemies that may get away: a ship too weak for its stage lets them by rather than taking longer' },
        'At most',
        num(Math.round(b.leak * 100), (v) => store.setBench({ leak: v / 100 }), { min: 0, max: 100, step: 5, label: 'Most that get away' }),
        '% get away',
      ),
      h('span', { class: 'sub' }, `${flights} flights`),
    );
  }

  // --- reading the results ----------------------------------------------------------------

  function cell(row: string, col: number, crew: Crew): Cell {
    const runs = results.get(key(row, col, crew)) ?? [];
    const b = store.s.bench;
    const ttks = runs.flatMap((r) => r.waves.filter((w) => w.end !== null).map((w) => w.end! - w.start));
    const total = runs.reduce((s, r) => s + r.killed + r.missed, 0);
    const c: Cell = {
      runs,
      want: b.seeds,
      ttk: median(ttks),
      hullLost: mean(runs.map((r) => mean(r.hull.map((hp, i) => 1 - hp / r.hullMax[i])))),
      failed: runs.length ? runs.filter((r) => r.outcome === 'failed').length / runs.length : 0,
      leaks: total ? runs.reduce((s, r) => s + r.missed, 0) / total : 0,
      dps: mean(runs.map((r) => r.dps)),
      hits: mean(runs.map((r) => r.hits)),
      v: null,
    };
    if (runs.length) c.v = verdict({ ttk: c.ttk, hullLost: c.hullLost, failed: c.failed, leaks: c.leaks }, b);
    return c;
  }

  function matrix(crew: Crew) {
    const table = h('table', { class: 'matrix' });
    table.appendChild(
      h('thead', null, h('tr', null, h('th', null, crew === 'solo' ? 'Solo' : `Co-op${ranCoopHp !== 1 ? `, enemy hull ×${ranCoopHp}` : ''}`), ...STAGES.map((s) => h('th', null, `Sector ${s.sector}`, h('small', null, `stop ${s.stop}, d ${difficultyAt(s).toFixed(2)}`))))),
    );
    const body = h('tbody');
    ranRows.forEach((row, ri) => {
      if (ri === LADDER.length) body.appendChild(h('tr', { class: 'split' }, h('th', { colspan: String(STAGES.length + 1) }, 'Build archetypes, at the ladder’s tier for each stage')));
      const tr = h('tr', null, h('th', { class: 'row', title: row.note }, row.name, h('small', null, row.ladder !== null ? `${LADDER[row.ladder].tier}` : row.note.split(':')[0])));
      STAGES.forEach((stage, col) => {
        const c = cell(row.id, col, crew);
        const expect = row.ladder !== null && expectedAt(stage) === row.ladder;
        const td = h('td', {
          class: `${c.runs.length ? '' : 'pending'}${expect ? ' expect' : ''}${sel && sel.row === row.id && sel.col === col ? ' sel' : ''}`,
          tabindex: '0',
          'aria-label': `${row.name}, ${stageName(stage)}, ${crew}: ${c.v?.word ?? 'not flown yet'}`,
          onclick: () => {
            sel = { row: row.id, col };
            render();
          },
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              sel = { row: row.id, col };
              render();
            }
          },
        });
        if (c.v) {
          td.style.background = FILL[c.v.level];
          td.style.color = INKS[c.v.level];
          td.append(h('b', { class: 'num' }, fmt.s(c.ttk)), h('span', { class: 'num' }, `${Math.round(c.hullLost * 100)}% hull`));
          if (c.v.level === 3 || c.failed > 0) td.appendChild(icon('skull')).setAttribute('class', 'fails');
          else if (c.leaks > store.s.bench.leak) td.appendChild(h('i', { class: 'leaky' }));
          tip(td, () =>
            tipRows(
              `${row.name}, ${stageName(stage)}`,
              [
                ['Verdict', c.v!.word],
                ['Typical wave clear', fmt.s(c.ttk)],
                ['Hull lost', fmt.pct(c.hullLost)],
                ['Hits taken', c.hits.toFixed(1)],
                ['Got away', fmt.pct(c.leaks)],
                ['All ships down', `${Math.round(c.failed * c.runs.length)} of ${c.runs.length}`],
                ['Damage a second', Math.round(c.dps)],
              ],
              c.v!.why,
            ),
          );
        } else td.append(h('span', null, c.runs.length ? '' : '…'));
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    return h('div', { class: 'card' }, table);
  }

  const legend = () =>
    h(
      'div',
      { class: 'legend' },
      ...([-2, -1, 0, 1, 2] as const).map((l) => h('span', null, h('i', { class: 'sw', style: { background: FILL[l] } }), ['Too easy', 'Easy', 'On target', 'Hard', 'Too hard'][l + 2])),
      h('span', null, icon('skull'), 'every ship went down'),
      h('span', null, h('i', { class: 'leak' }), `over ${Math.round(store.s.bench.leak * 100)}% got away`),
      h('span', null, h('i', { class: 'ring' }), 'the likely ship at that stage'),
      h('span', null, 'Each square: typical seconds to clear a wave, and the hull the fight cost'),
    );

  /** The likely path: the expected ship at each stage. */
  const path = (crew: Crew) => STAGES.map((s, col) => cell(LADDER[expectedAt(s)].id, col, crew));

  function summary() {
    const cards: HTMLElement[] = [];
    const crew: Crew = ranCrews.includes('solo') ? 'solo' : 'coop';
    const p = path(crew);
    const judged = p.filter((c) => c.v);
    if (judged.length) {
      const on = judged.filter((c) => c.v!.level === 0).length;
      const worst = judged.reduce((a, c) => (Math.abs(c.v!.level) > Math.abs(a.v!.level) ? c : a), judged[0]);
      const at = STAGES[p.indexOf(worst)];
      cards.push(
        h(
          'div',
          { class: 'card lead' },
          h('h3', null, 'Along the run'),
          h('div', { class: 'big num' }, `${on} of ${judged.length}`),
          h('p', null, `stages on target with the likely ship (${crew === 'solo' ? 'solo' : 'co-op'}).${worst.v!.level ? ` Furthest off: ${stageName(at)}, ${worst.v!.word.toLowerCase()}.` : ''}`),
          h('div', { style: 'display:flex;gap:3px;margin-top:10px' }, ...p.map((c, i) => h('i', { title: `${stageName(STAGES[i])}: ${c.v?.word ?? 'not flown'}`, style: { flex: '1', height: '8px', borderRadius: '2px', background: c.v ? FILL[c.v.level] : 'var(--raised)' } }))),
        ),
      );
    }
    // the trend: do the waves keep up with the ship?
    const ttks = p.map((c) => c.ttk).filter(isFinite);
    if (ttks.length >= 3) {
      const first = ttks[0];
      const last = ttks[ttks.length - 1];
      const r = last / first;
      cards.push(
        h(
          'div',
          { class: 'card' },
          h('h3', null, 'Waves against the ship'),
          h('div', { class: 'big num' }, r > 1.15 ? `${r.toFixed(1)}× slower` : r < 0.87 ? `${(1 / r).toFixed(1)}× faster` : 'Steady'),
          h(
            'p',
            null,
            r > 1.15
              ? 'Waves take longer to clear late in the run than early, even with the likely ship: the enemies outgrow it.'
              : r < 0.87
                ? 'Waves melt faster late in the run: the ship outgrows the enemies. Their hull could grow faster with the stage.'
                : 'Waves take about as long to clear from the first sector to the last: their growth keeps pace with the ship.',
          ),
        ),
      );
    }
    // co-op: how much faster two ships clear, and what would even it out
    if (ranCrews.length === 2) {
      const ratios: number[] = [];
      const hullDiff: number[] = [];
      for (const row of ranRows.filter((r) => r.ladder !== null))
        STAGES.forEach((_, col) => {
          const a = cell(row.id, col, 'solo');
          const b = cell(row.id, col, 'coop');
          if (isFinite(a.ttk) && isFinite(b.ttk) && b.ttk > 0) ratios.push(a.ttk / b.ttk);
          if (isFinite(a.hullLost) && isFinite(b.hullLost)) hullDiff.push(b.hullLost - a.hullLost);
        });
      if (ratios.length) {
        const r = median(ratios);
        const rec = Math.round(ranCoopHp * r * 10) / 10;
        const even = Math.abs(r - 1) < 0.12;
        cards.push(
          h(
            'div',
            { class: 'card' },
            h('h3', null, 'Co-op'),
            h('div', { class: 'big num' }, even ? 'Even' : r > 1 ? `${r.toFixed(1)}× faster` : `${(1 / r).toFixed(1)}× slower`),
            h(
              'p',
              null,
              even
                ? `Two ships clear waves about as fast as one${ranCoopHp !== 1 ? ` with enemy hull ×${ranCoopHp}` : ''}.`
                : `Two ships clear waves ${r > 1 ? 'faster' : 'slower'} than one${ranCoopHp !== 1 ? ` (enemy hull ×${ranCoopHp})` : ''}. Enemy hull ×${rec} in co-op would even it out.`,
              ` Each co-op ship loses ${Math.abs(Math.round(mean(hullDiff) * 100))}% ${mean(hullDiff) < 0 ? 'less' : 'more'} hull than a solo one.`,
            ),
            even ? null : h('button', { class: 'btn act', type: 'button', onclick: () => { store.setBench({ coopHp: rec }); start(); } }, `Run co-op at ×${rec}`),
          ),
        );
      }
    }
    // the wave that hurts most on the likely path
    const per = perWave(p.flatMap((c) => c.runs));
    const hurt = [...per].filter((w) => w.runs).sort((a, b) => b.hits - a.hits || b.ttk - a.ttk)[0];
    if (hurt && hurt.hits > 0) {
      cards.push(
        h(
          'div',
          { class: 'card' },
          h('h3', null, 'Hits the hardest'),
          h('div', { class: 'big' }, hurt.name),
          h('p', null, `${hurt.hits.toFixed(1)} hits a flight on the likely path, ${fmt.s(hurt.ttk)} to clear, ${fmt.pct(hurt.leaks)} got away.`),
        ),
      );
    }
    return cards.length ? h('div', { class: 'summary' }, ...cards) : null;
  }

  interface WaveRow {
    name: string;
    color: string;
    elite: boolean;
    at: number;
    runs: number;
    ttk: number;
    hits: number;
    leaks: number;
    dmg: number;
  }

  /** The runs' tallies, gathered by the lab wave each one is. */
  function perWave(runs: FlyResult[]): WaveRow[] {
    const plan = ranPlan;
    const rows: WaveRow[] = plan.map((w) => {
      const k = kindOf(w.kind);
      return { name: `${w.elite ? 'Elite ' : ''}${k?.name ?? w.kind}${w.n > 1 ? ` ×${w.n}` : ''}`, color: k ? groupOf(k.group).color : '#888', elite: w.elite, at: w.at, runs: 0, ttk: NaN, hits: 0, leaks: 0, dmg: 0 };
    });
    const ttk: number[][] = plan.map(() => []);
    const tot = plan.map(() => [0, 0]);
    for (const r of runs) {
      const m = matchWaves(r.waves, plan);
      r.waves.forEach((t, i) => {
        const w = m[i];
        if (!w) return;
        const j = plan.indexOf(w);
        rows[j].runs++;
        rows[j].hits += t.hits;
        rows[j].dmg += t.dmg;
        tot[j][0] += t.missed;
        tot[j][1] += t.total;
        if (t.end !== null) ttk[j].push(t.end - t.start);
      });
    }
    rows.forEach((w, j) => {
      const n = Math.max(1, w.runs);
      w.ttk = median(ttk[j]);
      w.hits /= n;
      w.dmg /= n;
      w.leaks = tot[j][1] ? tot[j][0] / tot[j][1] : 0;
    });
    return rows;
  }

  function charts() {
    const ladder = ranRows.filter((r) => r.ladder !== null);
    const crew: Crew = ranCrews.includes('solo') ? 'solo' : 'coop';
    const b = store.s.bench;
    const x = STAGES.map(stageName);
    const series = (f: (c: Cell) => number) => [
      ...ladder.map((r) => ({ name: r.name, color: LADDER_COL[r.ladder!], values: STAGES.map((_, col) => { const c = cell(r.id, col, crew); return c.runs.length ? f(c) : null; }) })),
      { name: 'Likely ship', color: '', path: true, values: path(crew).map((c) => (c.runs.length ? f(c) : null)) },
    ];
    return h(
      'div',
      { class: 'charts' },
      lineChart({
        title: 'Seconds to clear a wave',
        sub: `Typical wave, by stage of the run (${crew}). Lines falling as the ship gets better is the ladder doing its job; the dotted path is the ship you'd likely have.`,
        x,
        series: series((c) => c.ttk),
        band: b.ttk,
        bandLabel: 'Target',
        fmt: (v) => `${v.toFixed(v < 10 ? 1 : 0)}s`,
      }),
      lineChart({
        title: 'Hull a fight costs',
        sub: `Share of the hull lost, by stage (${crew}). Ships down count as all of it.`,
        x,
        series: series((c) => c.hullLost * 100),
        band: [b.hull[0] * 100, b.hull[1] * 100],
        bandLabel: 'Target',
        fmt: (v) => `${Math.round(v)}%`,
      }),
    );
  }

  function detail() {
    const rowId = sel?.row ?? LADDER[expectedAt(store.stage)].id;
    const col = sel?.col ?? Math.max(0, STAGES.findIndex((s) => s.sector === store.s.sector && s.stop >= store.s.stop - 2));
    const row = ranRows.find((r) => r.id === rowId) ?? ranRows[0];
    const solo = ranCrews.includes('solo') ? perWave(cell(row.id, col, 'solo').runs) : null;
    const coop = ranCrews.includes('coop') ? perWave(cell(row.id, col, 'coop').runs) : null;
    const base = solo ?? coop!;
    const b = store.s.bench;
    const wavePill = (w: { ttk: number; leaks: number }) => (isFinite(w.ttk) ? verdictPill(verdict({ ttk: w.ttk, hullLost: NaN, failed: 0, leaks: w.leaks }, b)) : h('span', { class: 'sub' }, 'never cleared'));
    const causes: Record<string, number> = {};
    for (const r of [...(cell(row.id, col, 'solo').runs ?? []), ...(cell(row.id, col, 'coop').runs ?? [])]) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] ?? 0) + v;
    const cs = Object.entries(causes).sort((a, b) => b[1] - a[1]);
    return h(
      'div',
      { class: 'card detail' },
      h('h3', null, `Wave by wave: ${row.name}, ${stageName(STAGES[col])}`),
      h('div', { class: 'sub', style: 'margin:-4px 0 10px' }, 'Pick any square above to see its waves.'),
      base.length
        ? h(
            'table',
            { class: 'log' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', null, 'At'),
                h('th', null, 'Wave'),
                solo ? h('th', { class: 'r' }, 'Clear, solo') : null,
                coop ? h('th', { class: 'r' }, 'Clear, co-op') : null,
                h('th', null, 'Verdict'),
                h('th', { class: 'r' }, 'Got away'),
                h('th', { class: 'r' }, 'Hits'),
                h('th', { class: 'r' }, 'Hull lost'),
              ),
            ),
            h(
              'tbody',
              null,
              ...base.map((w, i) => {
                const main = solo?.[i] ?? coop![i];
                return h(
                  'tr',
                  null,
                  h('td', { class: 'num' }, fmt.s(w.at / 9, 0)),
                  h('td', null, h('span', { class: 'who-dot', style: { background: w.color } }), w.name),
                  solo ? h('td', { class: 'r num' }, fmt.s(solo[i].ttk)) : null,
                  coop ? h('td', { class: 'r num' }, fmt.s(coop[i].ttk)) : null,
                  h('td', null, wavePill(main)),
                  h('td', { class: 'r num', style: main.leaks ? 'color:var(--gold)' : '' }, fmt.pct(main.leaks)),
                  h('td', { class: 'r num', style: main.hits >= 1 ? 'color:var(--red)' : '' }, main.hits.toFixed(1)),
                  h('td', { class: 'r num' }, String(Math.round(main.dmg))),
                );
              }),
            ),
          )
        : h('div', { class: 'sub' }, 'The game’s own waves vary by seed; their tally is by kind in the matrix tooltips.'),
      cs.length ? h('p', { class: 'sub', style: 'margin-top:10px' }, `What hit the ships here: ${cs.map(([k, v]) => `${k} ${v}`).join(', ')}.`) : null,
    );
  }

  function builds() {
    if (!ranRows.some((r) => r.ladder === null) || !ranCrews.includes('solo')) return null;
    const rows = ranRows
      .filter((r) => r.ladder === null)
      .map((r) => {
        const ratios: number[] = [];
        const hull: number[] = [];
        STAGES.forEach((s, col) => {
          const a = cell(r.id, col, 'solo');
          const l = cell(LADDER[expectedAt(s)].id, col, 'solo');
          if (isFinite(a.ttk) && isFinite(l.ttk) && l.ttk > 0) ratios.push(a.ttk / l.ttk);
          if (isFinite(a.hullLost) && isFinite(l.hullLost)) hull.push(a.hullLost - l.hullLost);
        });
        return { r, ratio: ratios.length ? Math.exp(mean(ratios.map(Math.log))) : NaN, hull: mean(hull) };
      })
      .filter((x) => isFinite(x.ratio));
    if (!rows.length) return null;
    const span = Math.max(Math.log2(2), ...rows.map((x) => Math.abs(Math.log2(x.ratio))));
    return h(
      'div',
      { class: 'card' },
      h('h3', null, 'Builds against the likely ship'),
      h('div', { class: 'sub', style: 'margin:-4px 0 12px' }, 'How fast each archetype clears waves next to the ladder’s ship at the same tier (solo, every stage). Some way off either side is fine: builds should feel different.'),
      h(
        'div',
        { class: 'bars' },
        ...rows.map(({ r, ratio, hull }) => {
          const l = Math.log2(ratio) / span;
          const w = Math.min(50, Math.abs(l) * 50);
          const bar = h('div', { class: 'fill', style: { left: l < 0 ? `${50 - w}%` : '50%', width: `${w}%`, background: l < 0 ? 'var(--easy-2)' : 'var(--hard-2)' } });
          const el = h('div', { class: 'barrow' }, h('span', null, r.name), h('div', { class: 'track' }, h('div', { class: 'mid' }), bar), h('b', { class: 'num' }, ratio < 1 ? `${(1 / ratio).toFixed(1)}× faster` : `${ratio.toFixed(1)}× slower`));
          tip(el, () => tipRows(r.name, [['Clears waves', ratio < 1 ? `${(1 / ratio).toFixed(2)}× faster` : `${ratio.toFixed(2)}× slower`], ['Hull lost', `${hull >= 0 ? '+' : ''}${Math.round(hull * 100)} points`]], r.note));
          return el;
        }),
      ),
      h('div', { class: 'legend', style: 'margin-top:10px' }, h('span', null, h('i', { class: 'sw', style: { background: 'var(--easy-2)' } }), 'stronger than the ladder'), h('span', null, h('i', { class: 'sw', style: { background: 'var(--hard-2)' } }), 'weaker')),
    );
  }

  function render() {
    hideTip();
    if (!want) {
      out.replaceChildren(
        h(
          'div',
          { class: 'empty', style: 'margin:24px 0;padding:40px' },
          h('b', null, 'Nothing flown yet'),
          `Run the bench to fly ${store.s.source === 'script' ? 'your waves' : "the game's waves"} on ${STAGES.length} stages with every ship. It takes a minute or so; squares fill in as flights land.`,
        ),
      );
      return;
    }
    out.replaceChildren(...kids(summary(), h('div', { class: 'matrices' }, ...ranCrews.map(matrix)), legend(), charts(), detail(), builds()));
  }

  restore();
  renderHead();
  renderKnobs();
  render();
  // cut short by a reload (the dev server reloads the page when the game's code changes): carry on
  if (want && got < want && ranWith === setup()) {
    start(true);
    toast(`Carrying on with the bench: ${want - got} flights to go`);
  }
  store.on((_, c) => {
    if (c.has('bench')) renderKnobs();
    renderHead();
    if (c.has('bench') && want && got === want) render();
  });

  return { start };
}
