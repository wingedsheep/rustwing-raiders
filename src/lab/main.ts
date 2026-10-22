/**
 * The wave lab (wave-lab.html): compose waves, fly them in the real game, bench them headless
 * against every ship from the starter to the endgame, solo and co-op, and check every enemy's
 * model. See range.ts, bench.ts and bestiary.ts.
 */

import { PLANETS } from '../world/planets';
import { hullGrowth, type Mode } from '../sim/level';
import { DANGERS, LADDER, expectedAt } from './catalog';
import { mountComposer } from './composer';
import { mountRange } from './range';
import { store, type Tab } from './state';
import { h, seg } from './ui';

const stageEl = document.getElementById('stage')!;
const tabsEl = document.getElementById('tabs')!;
const view = document.getElementById('view')!;
const composerEl = document.getElementById('composer')!;

const TABS: { id: Tab; name: string; title: string }[] = [
  { id: 'range', name: 'Range', title: 'Fly the waves in the game' },
  { id: 'bench', name: 'Bench', title: 'Fly them headless with every ship, and judge the balance' },
  { id: 'bestiary', name: 'Bestiary', title: 'Every enemy’s model and animation' },
];

const MODES: { value: Mode; label: string }[] = [
  { value: 'raid', label: 'Raid' },
  { value: 'hunt', label: 'Hunt' },
  { value: 'escort', label: 'Escort' },
  { value: 'heist', label: 'Heist' },
  { value: 'boss', label: 'Boss' },
];

function renderStage() {
  const s = store.s;
  const planet = h('select', { 'aria-label': 'Planet', onchange: (e: Event) => store.set({ planet: (e.target as HTMLSelectElement).value }) }, ...PLANETS.map((p) => h('option', { value: p.id, selected: p.id === s.planet }, `${p.name}, ${p.epithet}`)));
  const mode = h('select', { 'aria-label': 'Kind of fight', title: 'The kind of fight the waves are flown in (an escort brings its haulers and boarders, a boss level its boss)', onchange: (e: Event) => store.set({ mode: (e.target as HTMLSelectElement).value as Mode }) }, ...MODES.map((m) => h('option', { value: m.value, selected: m.value === s.mode }, m.label)));
  const stop = h('input', { type: 'range', min: '1', max: '8', step: '1', value: String(s.stop), 'aria-label': 'Stop in the sector', oninput: (e: Event) => store.set({ stop: Number((e.target as HTMLInputElement).value) }) });
  stageEl.replaceChildren(
    h('label', { class: 'field' }, 'Sector', seg([1, 2, 3].map((v) => ({ value: v, label: String(v) })), s.sector, (v) => store.set({ sector: v }), 'Sector')),
    h('label', { class: 'field' }, 'Stop', stop, h('b', { class: 'num', style: 'color:var(--cream);width:10px' }, String(s.stop))),
    h('label', { class: 'field hide-narrow' }, 'Site', seg(DANGERS.map((d) => ({ value: d.id, label: d.name, title: `+${d.extra} difficulty` })), s.danger, (v) => store.set({ danger: v }), 'Site danger')),
    h('div', { class: 'diff', title: `Difficulty: enemy hull ×${hullGrowth(store.difficulty).toFixed(2)}, their hits ×${(1 + store.difficulty * 0.3).toFixed(2)}. Likely ship: ${LADDER[expectedAt(store.stage)].name}.` }, h('span', null, 'difficulty'), h('b', { class: 'num' }, store.difficulty.toFixed(2))),
    h('label', { class: 'field' }, planet),
    h('label', { class: 'field' }, mode),
  );
}

function renderTabs() {
  tabsEl.replaceChildren(
    ...TABS.map((t) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(store.s.tab === t.id), title: t.title, onclick: () => store.set({ tab: t.id }) }, t.name),
    ),
  );
}

// each view is made the first time it's shown, and kept (the range's flight goes on behind the others)
const views = new Map<Tab, HTMLElement>();
let range: ReturnType<typeof mountRange> | null = null;
const composer = mountComposer(composerEl);

async function showTab() {
  const tab = store.s.tab;
  if (!views.has(tab)) {
    const el = h('div', { style: 'display:flex;flex:1;min-width:0;min-height:0' });
    views.set(tab, el);
    view.appendChild(el);
    if (tab === 'range') range = mountRange(el, (id) => composer.light(id));
    else if (tab === 'bench') (await import('./bench')).mountBench(el);
    else (await import('./bestiary')).mountBestiary(el, () => (range ?? mountRangeNow()).launch());
  }
  for (const [t, el] of views) el.hidden = t !== tab;
  composerEl.hidden = tab === 'bestiary';
  document.querySelector('.lab')!.setAttribute('style', tab === 'bestiary' ? 'grid-template-columns:1fr' : '');
}

function mountRangeNow() {
  const el = h('div', { style: 'display:flex;flex:1;min-width:0;min-height:0', hidden: true });
  views.set('range', el);
  view.appendChild(el);
  range = mountRange(el, (id) => composer.light(id));
  return range;
}

renderStage();
renderTabs();
showTab();
store.on((_, c) => {
  if (['sector', 'stop', 'danger', 'planet', 'mode'].some((k) => c.has(k as never))) renderStage();
  if (c.has('tab')) {
    renderTabs();
    showTab();
  }
});
