/**
 * The composer: the waves to fly, in order of when they come, and the enemies to add from. A
 * wave is a kind, when it comes (seconds at the level's own pace), elite or not, and how many of
 * its groups come at once.
 */

import { Level, hullGrowth } from '../sim/level';
import { levelSpec } from '../sim/run';
import { PLANETS } from '../world/planets';
import { GROUPS, groupOf, kindsFor, type Kind } from './catalog';
import { PACE, fitLength } from './fly';
import { store, waveId, type LabWave } from './state';
import { formatWaves } from '../sim/director';
import { fmt, h, hideTip, icon, seg, tip, tipRows, toast } from './ui';

/** Seconds between a wave added and the one before it. */
const GAP = 5;

export const planetOf = () => PLANETS.find((p) => p.id === store.s.planet) ?? PLANETS[0];

let kindsCache: { planet: string; kinds: Kind[] } | null = null;
export function kinds(): Kind[] {
  if (kindsCache?.planet !== store.s.planet) kindsCache = { planet: store.s.planet, kinds: kindsFor(planetOf()) };
  return kindsCache.kinds;
}

export const kindOf = (id: string) => kinds().find((k) => k.id === id);

/** The game's own waves for this planet, mode, seed and stage (what its director plans). */
let planCache: { key: string; waves: LabWave[] } | null = null;
export function gameWaves(): LabWave[] {
  const key = `${store.s.planet} ${store.s.mode} ${store.s.seed} ${store.difficulty}`;
  if (planCache?.key !== key) {
    let waves: LabWave[] = [];
    try {
      const lv = new Level(levelSpec(planetOf(), store.s.mode, store.s.seed, store.difficulty), []);
      waves = lv.director.planned.map((w) => ({ ...w, id: waveId() })).sort((a, b) => a.at - b.at);
    } catch (err) {
      console.warn("couldn't plan the game's waves", err);
    }
    planCache = { key, waves };
  }
  return planCache.waves.map((w) => ({ ...w }));
}

/** The waves the range and bench fly: the lab's, or the game's own (read only). */
export const flownWaves = (): LabWave[] => (store.s.source === 'script' ? store.s.waves : gameWaves());

/** Where the level ends (distance flown), so the strip can show it. */
export function levelEnd() {
  const spec = levelSpec(planetOf(), store.s.mode, store.s.seed, store.difficulty);
  const length = store.s.source === 'script' ? fitLength(store.s.waves) : spec.length;
  return spec.biomes.length * length - 46;
}

/** Hull a wave's enemies have at this stage, for one group (a guess: groups vary in size). */
const hullAt = (k: Kind, elite: boolean) => Math.round(k.hp * hullGrowth(store.difficulty) * (elite ? 2.4 : 1));

export function mountComposer(root: HTMLElement) {
  const list = h('div', { class: 'waves', role: 'list' });
  const foot = h('div', { class: 'c-foot' });
  const search = h('input', { type: 'search', placeholder: 'Find an enemy', 'aria-label': 'Find an enemy' });
  const groups = h('div', { class: 'groups', role: 'group', 'aria-label': 'Factions' });
  const kindList = h('div', { class: 'kinds' });
  const sourceEl = h('div', { class: 'source' });
  const saved = h('select', { 'aria-label': 'Saved compositions', title: 'Saved compositions' });
  let lit = -1;

  const add = (k: Kind, elite: boolean) => {
    if (store.s.source !== 'script') store.set({ source: 'script', waves: gameWaves() });
    const last = store.s.waves.reduce((m, w) => Math.max(m, w.at), 0);
    const at = store.s.waves.length ? last + GAP * PACE : 30;
    const w: LabWave = { id: waveId(), kind: k.id, elite, at, n: 1 };
    store.set({ waves: [...store.s.waves, w] });
    lit = w.id;
    requestAnimationFrame(() => list.querySelector(`[data-id="${w.id}"]`)?.scrollIntoView({ block: 'nearest' }));
  };

  const patch = (id: number, p: Partial<LabWave>) => store.set({ waves: store.s.waves.map((w) => (w.id === id ? { ...w, ...p } : w)) });

  function renderSource() {
    sourceEl.replaceChildren(
      seg(
        [
          { value: 'script', label: 'My waves', title: 'Fly the waves in this list' },
          { value: 'game', label: "The game's waves", title: "Fly the level's own waves, as its director plans them for this planet, mode and seed" },
        ],
        store.s.source,
        (v) => store.set({ source: v as 'script' | 'game' }),
        'Which waves to fly',
      ),
    );
  }

  function renderList() {
    const game = store.s.source === 'game';
    const waves = flownWaves();
    list.replaceChildren();
    if (!waves.length) {
      list.appendChild(h('div', { class: 'empty' }, h('b', null, 'No waves yet'), 'Pick an enemy below to send it. Shift-click sends an elite.'));
    }
    for (const w of waves) {
      const k = kindOf(w.kind);
      const col = k ? groupOf(k.group).color : '#888';
      const sec = w.at / PACE;
      const at = h('input', {
        type: 'number',
        min: '0',
        step: '0.5',
        value: sec.toFixed(1).replace(/\.0$/, ''),
        'aria-label': 'Seconds in',
        disabled: game,
        onchange: (e: Event) => patch(w.id, { at: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) * PACE }),
      });
      const row = h(
        'div',
        { class: `wave${w.id === lit ? ' lit' : ''}`, role: 'listitem', 'data-id': String(w.id) },
        h('div', { class: 'stripe', style: { background: col } }),
        h('label', { class: 'at' }, at, h('span', null, 's')),
        h(
          'div',
          { class: 'who' },
          h('b', null, k?.name ?? w.kind),
          h('small', null, w.elite ? h('span', { class: 'elite-tag' }, 'Elite ') : null, `${hullAt(k ?? ({ hp: 0 } as Kind), w.elite)} hull`, w.n > 1 ? `, ${w.n} groups` : '', k?.water ? ', needs water' : ''),
        ),
        game
          ? h('div', { class: 'acts' })
          : h(
              'div',
              { class: 'acts' },
              h('button', { class: 'mini', type: 'button', title: 'Elite: armoured, named, carries a part', 'aria-pressed': String(w.elite), onclick: () => patch(w.id, { elite: !w.elite }) }, icon('crown')),
              h('button', { class: 'mini', type: 'button', title: 'One group fewer', 'aria-label': 'Fewer groups', onclick: () => patch(w.id, { n: Math.max(1, w.n - 1) }) }, icon('minus')),
              h('span', { class: 'count', title: 'Groups that come at once' }, `×${w.n}`),
              h('button', { class: 'mini', type: 'button', title: 'One group more', 'aria-label': 'More groups', onclick: () => patch(w.id, { n: Math.min(6, w.n + 1) }) }, icon('plus')),
              h('button', { class: 'mini', type: 'button', title: 'Remove this wave', 'aria-label': 'Remove', onclick: () => store.set({ waves: store.s.waves.filter((x) => x.id !== w.id) }) }, icon('close')),
            ),
      );
      if (k) tip(row.querySelector('.who') as HTMLElement, () => tipRows(k.name, [['Hull at this stage', hullAt(k, w.elite)], ['Hit radius', k.r.toFixed(1)]], k.role));
      list.appendChild(row);
    }
    if (game)
      list.appendChild(
        h('div', { style: 'padding:10px 8px' }, h('button', { class: 'btn', type: 'button', onclick: () => store.set({ source: 'script', waves: gameWaves() }) }, 'Edit a copy of these')),
      );
    const end = levelEnd();
    foot.replaceChildren(
      h('span', null, h('b', null, String(waves.length)), waves.length === 1 ? ' wave' : ' waves'),
      h('span', null, 'The fight ends at ', h('b', null, fmt.s(end / PACE, 0))),
    );
  }

  function renderGroups() {
    const present = new Set(kinds().map((k) => k.group));
    groups.replaceChildren(
      ...[{ id: 'all', name: 'All', color: '' }, ...GROUPS.filter((g) => present.has(g.id))].map((g) =>
        h('button', { class: 'chip', type: 'button', 'aria-pressed': String(store.s.group === g.id), onclick: () => store.set({ group: g.id }) }, g.color ? h('i', { style: { background: g.color } }) : null, g.name),
      ),
    );
  }

  function renderKinds() {
    const q = search.value.trim().toLowerCase();
    const ks = kinds().filter((k) => (store.s.group === 'all' || k.group === store.s.group) && (!q || k.name.toLowerCase().includes(q) || k.id.includes(q) || k.role.toLowerCase().includes(q)));
    kindList.replaceChildren();
    for (const k of ks) {
      const b = h(
        'button',
        {
          class: 'kind',
          type: 'button',
          onclick: (e: MouseEvent) => add(k, e.shiftKey || e.altKey),
        },
        h('i', { style: { background: groupOf(k.group).color } }),
        h('span', null, h('b', null, k.name), h('small', null, k.role)),
        h('span', { class: 'hp num', title: 'Hull at this stage' }, String(hullAt(k, false))),
      );
      tip(b, () => tipRows(k.name, [['Hull at this stage', hullAt(k, false)], ['As an elite', hullAt(k, true)], ['Hit radius', k.r.toFixed(1)]], `${k.role}${k.water ? '. Off water a gun truck comes instead.' : ''}`));
      kindList.appendChild(b);
    }
    if (!ks.length) kindList.appendChild(h('div', { class: 'empty' }, `Nothing called “${search.value}”.`));
  }

  function renderSaved() {
    const names = Object.keys(store.s.saved).sort();
    saved.replaceChildren(h('option', { value: '' }, names.length ? 'Saved…' : 'Nothing saved'), ...names.map((n) => h('option', { value: n }, n)));
    saved.disabled = !names.length;
  }
  saved.onchange = () => {
    const name = saved.value;
    if (!name) return;
    import('../sim/director').then(({ parseWaves }) => {
      store.set({ source: 'script', waves: parseWaves(store.s.saved[name]).map((w) => ({ ...w, id: waveId() })) });
      toast(`Loaded “${name}”`);
      saved.value = '';
    });
  };

  // saving: a name, inline under the header
  const saveRow = h('form', { class: 'save-row', hidden: true });
  const saveName = h('input', { type: 'text', 'aria-label': 'Name these waves', placeholder: 'Name these waves' });
  saveRow.append(
    saveName,
    h('button', { class: 'btn', type: 'submit' }, 'Save'),
    h('button', { class: 'btn ghost icon', type: 'button', 'aria-label': 'Cancel', title: 'Cancel', onclick: () => (saveRow.hidden = true) }, icon('close')),
  );
  saveRow.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = saveName.value.trim();
    if (!name) return saveName.focus();
    store.set({ saved: { ...store.s.saved, [name]: formatWaves(store.s.waves) } });
    saveRow.hidden = true;
    toast(`Saved as “${name}”`);
  });
  saveName.addEventListener('keydown', (e) => e.key === 'Escape' && (saveRow.hidden = true));
  const saveAs = () => {
    if (!store.s.waves.length || store.s.source !== 'script') return toast('Nothing of yours to save yet');
    saveRow.hidden = false;
    saveName.value = `${planetOf().name.toLowerCase()} ${Object.keys(store.s.saved).length + 1}`;
    saveName.select();
    saveName.focus();
  };

  search.addEventListener('input', renderKinds);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = kindList.querySelector('.kind') as HTMLButtonElement | null;
    first?.dispatchEvent(new MouseEvent('click', { shiftKey: e.shiftKey }));
  });

  root.replaceChildren(
    h(
      'div',
      { class: 'c-head' },
      h('div', null, h('h2', null, 'Waves'), h('div', { class: 'c-sub' }, 'When each comes, at the level’s own pace')),
      h(
        'div',
        { class: 'c-tools' },
        h('button', { class: 'btn ghost icon', type: 'button', title: "Start from the game's waves for this planet and seed", 'aria-label': "Start from the game's waves", onclick: () => store.set({ source: 'script', waves: gameWaves() }) }, icon('dice')),
        h('button', { class: 'btn ghost icon', type: 'button', title: 'Save these waves', 'aria-label': 'Save', onclick: saveAs }, icon('save')),
        h(
          'button',
          {
            class: 'btn ghost icon',
            type: 'button',
            title: 'Copy a link to these waves',
            'aria-label': 'Copy link',
            onclick: () => navigator.clipboard.writeText(store.link()).then(() => toast('Link copied')),
          },
          icon('link'),
        ),
        h('button', { class: 'btn ghost icon', type: 'button', title: 'Remove every wave', 'aria-label': 'Clear', onclick: () => store.set({ source: 'script', waves: [] }) }, icon('trash')),
      ),
    ),
    saveRow,
    sourceEl,
    h('div', { style: 'padding:0 16px 8px' }, saved),
    list,
    foot,
    h(
      'div',
      { class: 'picker' },
      h('div', { class: 'picker-head' }, search),
      groups,
      kindList,
      h('div', { class: 'picker-hint' }, 'Click to send it after the last wave. ', h('kbd', null, 'Shift'), ' + click sends an elite.'),
    ),
  );
  (saved as HTMLElement).style.width = '100%';

  const all = () => {
    hideTip();
    renderSource();
    renderList();
    renderGroups();
    renderKinds();
    renderSaved();
  };
  all();
  store.on((s, c) => {
    if (c.has('planet')) {
      kindsCache = null;
      return all();
    }
    if (c.has('waves') || c.has('source') || c.has('sector') || c.has('stop') || c.has('danger') || c.has('mode') || c.has('seed')) {
      renderSource();
      renderList();
      renderKinds();
    }
    if (c.has('group')) {
      renderGroups();
      renderKinds();
    }
    if (c.has('saved')) renderSaved();
    void s;
  });

  /** For the strip: light up a wave in the list. */
  return {
    light(id: number) {
      lit = id;
      for (const el of list.querySelectorAll('.wave')) el.classList.toggle('lit', (el as HTMLElement).dataset.id === String(id));
      list.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    },
  };
}
