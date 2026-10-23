/**
 * The forge: design guns and try builds. On the left every part (the game's, the bench's new ones,
 * and the ones made here); in the middle the game itself flying the build against a target; on
 * the right the loadout, the dials of the part you're working on, and what the build does, live
 * and over many headless runs, side by side with a build you've pinned.
 *
 * Parts made here are kept in localStorage and sent to the game in `&forge=`; nothing reaches the
 * game proper until it's written into game/parts.ts (Copy as code gives the PartDef).
 */

import './forge.css';
import { EDGES, FRAMES, PARTS, frameById, hardpointOf, partById, type Edge, type GunSpec, type PartDef, type Tag } from '../game/parts';
import { LAB_PARTS, registerLabParts } from '../game/lab-parts';
import { AFFIXES, TRAITS, type AffixId, type TraitId, type Tier } from '../game/loot';
import { CASH } from '../sim/arsenal';
import { parseWaves } from '../sim/director';
import type { Level } from '../sim/level';
import { fitLength, type FlyJob, type FlyResult } from './fly';
import { TARGETS, kitBuild, type Kit, type KitPart } from './forge-kit';
import { store } from './state';
import { h, icon, kids, mean, seg, tip, tipRows, toast } from './ui';

// --- state ------------------------------------------------------------------------------------

interface Tested {
  label: string;
  kit: Kit;
  combos: boolean;
  target: string;
  runs: FlyResult[];
}

interface ForgeState {
  /** Parts made or changed here (a changed one keeps its id, and stands in for the game's). */
  custom: PartDef[];
  kit: Kit;
  target: string;
  combos: boolean;
  pilot: 'bot' | 'you';
  tough: number;
  seeds: number;
  selected: string;
  /** The last test, and the one pinned to compare against. */
  last: Tested | null;
  pinned: Tested | null;
}

const KEY = 'rr.forge';
const DEFAULT: ForgeState = {
  custom: [],
  kit: { frame: 'kestrel', parts: [{ id: 'frost' }, { id: 'anchor' }], keepStart: true },
  target: 'plated',
  combos: true,
  pilot: 'bot',
  tough: 1,
  seeds: 4,
  selected: 'frost',
  last: null,
  pinned: null,
};

function load(): ForgeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...structuredClone(DEFAULT), ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return structuredClone(DEFAULT);
}

let S = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    /* storage unavailable */
  }
}

/** Builds that show combos at work: one click loads them. */
const RECIPES: { name: string; note: string; kit: Kit; target: string }[] = [
  { name: 'Freeze and smash', note: 'The mist freezes them, the Charge Cannon smashes the ice', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'frost' }, { id: 'charge' }] }, target: 'plated' },
  { name: 'Nail and hammer', note: 'Pin it, then any blow NAILS it: plating gone, it reels', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'rivet' }, { id: 'anchor' }] }, target: 'elites' },
  { name: 'Pinball', note: 'Throw them into each other: every body is a blow', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'wave' }, { id: 'bumper' }] }, target: 'crowd' },
  { name: 'Wildfire', note: 'Three burns, then a flak shell: FLARE-UP', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'torch' }, { id: 'flak' }] }, target: 'crowd' },
  { name: 'Conductor', note: 'Shock the wave, then one blow runs to every shocked one', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'arc' }, { id: 'rail' }] }, target: 'mixed' },
  { name: 'Phase sniper', note: 'Through shields and plating: no openings, just kills', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'needle' }, { id: 'rail' }] }, target: 'shielded' },
  { name: 'Cold feed', note: 'A Cryo Feed turns a plain Rivet into a freezer', kit: { frame: 'kestrel', keepStart: true, parts: [{ id: 'rivet' }, { id: 'cryofeed' }, { id: 'flak' }] }, target: 'mixed' },
];

const SHOTS: GunSpec['shot'][] = ['slug', 'pellet', 'beam', 'rail', 'arc', 'missile', 'flak', 'flame', 'mine'];
const MARK_TAGS: { value: string; label: string; tags: Tag[] }[] = [
  { value: 'none', label: 'No mark', tags: ['kinetic'] },
  { value: 'burn', label: 'Burn', tags: ['heat'] },
  { value: 'shock', label: 'Shock', tags: ['arc'] },
  { value: 'crack', label: 'Crack', tags: ['explosive'] },
];
const TIERS: Tier[] = ['common', 'rare', 'epic', 'legendary'];

/** The dials, with their range and what they mean. */
const DIALS: { k: keyof GunSpec; name: string; min: number; max: number; step: number; note: string }[] = [
  { k: 'rate', name: 'Rate', min: 0.2, max: 30, step: 0.1, note: 'Shots a second (a heavy: rounds back a second)' },
  { k: 'damage', name: 'Hit', min: 0.5, max: 80, step: 0.5, note: 'Damage per shot' },
  { k: 'speed', name: 'Shot speed', min: 0, max: 180, step: 1, note: 'Units a second (0: instant, for beams and arcs)' },
  { k: 'life', name: 'Life', min: 0.1, max: 4, step: 0.05, note: 'Seconds a shot flies: with speed, its range' },
  { k: 'count', name: 'Shots', min: 1, max: 12, step: 1, note: 'Projectiles per shot' },
  { k: 'spread', name: 'Spread', min: 0, max: 1.6, step: 0.05, note: 'Fan between them (radians)' },
  { k: 'pierce', name: 'Pierce', min: 0, max: 99, step: 1, note: 'Enemies it goes through' },
  { k: 'heat', name: 'Heat', min: 0, max: 0.2, step: 0.002, note: 'Heat a shot; at 1 it jams' },
  { k: 'heavy', name: 'Heavy rounds', min: 0, max: 6, step: 1, note: '0: a trigger gun (held). More: a heavy, a round a press' },
  { k: 'chill', name: 'Chill', min: 0, max: 2, step: 0.02, note: 'Chill a hit; four and it freezes' },
  { k: 'shove', name: 'Shove', min: 0, max: 2, step: 0.05, note: 'Knocks it flying; a flung body is a blow' },
  { k: 'pin', name: 'Pin', min: 0, max: 5, step: 0.1, note: 'Seconds it is nailed in place' },
  { k: 'bounce', name: 'Bounces', min: 0, max: 6, step: 1, note: 'Off the edges of the screen' },
  { k: 'homing', name: 'Homing', min: 0, max: 5, step: 0.1, note: 'How hard it turns towards enemies' },
  { k: 'ripen', name: 'Ripen', min: 0, max: 4, step: 0.1, note: 'A heavy round left 3 s hits ×(1 + this)' },
  { k: 'size', name: 'Size', min: 0.4, max: 4, step: 0.1, note: 'Drawn and hits this much bigger' },
];

// --- the parts --------------------------------------------------------------------------------

const labIds = new Set(LAB_PARTS.map((d) => d.id));
const baseOf = new Map(PARTS.map((d) => [d.id, structuredClone(d)]));

/** Every part as the forge sees it: the game's, the bench's, and the custom ones over them. */
function syncParts() {
  // the game's own back as they are, then the bench's and the custom ones over them
  for (const [id, d] of baseOf) {
    const at = PARTS.findIndex((p) => p.id === id);
    if (at >= 0) PARTS[at] = structuredClone(d);
  }
  for (let i = PARTS.length - 1; i >= 0; i--) if (!baseOf.has(PARTS[i].id) && !labIds.has(PARTS[i].id)) PARTS.splice(i, 1);
  registerLabParts(S.custom);
}

const isCustom = (id: string) => S.custom.some((d) => d.id === id);
const isNewHere = (id: string) => isCustom(id) && !baseOf.has(id) && !labIds.has(id);

const SLOTS: { id: string; name: string; test: (d: PartDef) => boolean }[] = [
  { id: 'T', name: 'Trigger guns', test: (d) => !!d.gun && !d.gun.heavy },
  { id: 'H', name: 'Heavy guns', test: (d) => !!d.gun?.heavy },
  { id: 'A', name: 'Aux', test: (d) => !!d.aux },
  { id: 'S', name: 'Specials', test: (d) => !!d.special },
  { id: 'D', name: 'Dash mods and engines', test: (d) => d.cls === 'engine' },
  { id: 'F', name: 'Fittings', test: (d) => !d.gun && !d.aux && !d.special && d.cls !== 'engine' },
];

function personality(d: PartDef) {
  const g = d.gun;
  if (!g) return d.cls;
  const bits: string[] = [];
  if (g.shot === 'beam') bits.push('beam');
  else if (g.shot === 'arc') bits.push('chain');
  else bits.push(g.count > 1 ? `${g.count}× ${g.shot}` : g.shot);
  if (g.chill) bits.push('chills');
  if (g.shove) bits.push('shoves');
  if (g.pin) bits.push('pins');
  if (g.phase) bits.push('phases');
  if (g.bounce) bits.push('bounces');
  if (g.homing) bits.push('homes');
  if (g.ripen) bits.push('ripens');
  if ((g.pierce ?? 0) >= 50) bits.push('through all');
  return bits.join(' · ');
}

// --- the view ---------------------------------------------------------------------------------

export function mountForge(root: HTMLElement) {
  syncParts();
  let search = '';
  const list = h('nav', { class: 'f-list', 'aria-label': 'Parts' });
  const frame = h('iframe', { title: 'The game, flying the build', allow: 'autoplay; gamepad' });
  const idle = h('div', { class: 'idle' }, h('h3', null, 'The forge'), h('p', null, 'Pick parts on the left, set a target, and fly it: the autopilot, or you. Or run it headless many times over and pin a build to compare.'));
  const screen = h('div', { class: 'screen' }, idle);
  const deck = h('div', { class: 'deck' });
  const live = h('div', { class: 'f-live' });
  const side = h('aside', { class: 'f-side', 'aria-label': 'Build, dials, results' });
  root.replaceChildren(h('div', { class: 'forge' }, list, h('div', { class: 'f-main' }, screen, deck, live), side));

  let flying = false;
  let pollT = 0;
  let pool: Worker[] = [];
  let testing = false;

  const set = (patch: Partial<ForgeState>, what: ('list' | 'side' | 'deck')[] = ['list', 'side', 'deck']) => {
    S = { ...S, ...patch };
    save();
    if (what.includes('list')) renderList();
    if (what.includes('side')) renderSide();
    if (what.includes('deck')) renderDeck();
  };

  // --- the list ---------------------------------------------------------------------------

  function renderList() {
    const q = search.toLowerCase();
    const shown = PARTS.filter((d) => !q || d.name.toLowerCase().includes(q) || d.id.includes(q) || personality(d).includes(q));
    const groups = SLOTS.map((sl) => {
      const ds = shown.filter(sl.test);
      if (!ds.length) return null;
      return h('section', null, h('h4', null, sl.name), ...ds.map(item));
    });
    const input = h('input', { type: 'search', placeholder: 'Find a part', value: search, 'aria-label': 'Find a part', oninput: (e: Event) => ((search = (e.target as HTMLInputElement).value), renderList(), (document.querySelector('.f-list input') as HTMLInputElement)?.focus()) });
    list.replaceChildren(
      h('div', { class: 'f-list-head' }, input, h('button', { type: 'button', class: 'btn', title: 'A new gun from scratch (a copy of the Rivet Gun to start from)', onclick: newGun }, icon('plus'), 'New gun')),
      ...kids(...groups),
    );
  }

  function item(d: PartDef) {
    const inKit = S.kit.parts.some((p) => p.id === d.id);
    const badge = isNewHere(d.id) ? h('i', { class: 'tag made' }, 'MADE') : isCustom(d.id) ? h('i', { class: 'tag edited' }, 'EDITED') : labIds.has(d.id) ? h('i', { class: 'tag new' }, 'NEW') : null;
    const row = h(
      'div',
      { class: 'f-item', 'aria-current': String(S.selected === d.id) },
      h('button', { type: 'button', class: 'f-pick', onclick: () => set({ selected: d.id }, ['list', 'side']) }, h('b', null, d.name, badge), h('small', null, personality(d), d.gun ? ` · ${EDGES[d.gun.edge].name}` : '')),
      h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': inKit ? `Take ${d.name} off` : `Bolt ${d.name} on`, title: inKit ? 'Take it off the build' : 'Bolt it onto the build', onclick: () => toggle(d.id) }, icon(inKit ? 'minus' : 'plus')),
    );
    tip(row, () => tipRows(d.name, d.gun ? gunRows(d.gun) : [['class', d.cls]], d.text));
    return row;
  }

  function toggle(id: string) {
    const has = S.kit.parts.some((p) => p.id === id);
    const parts = has ? S.kit.parts.filter((p) => p.id !== id) : [...S.kit.parts, { id }];
    set({ kit: { ...S.kit, parts }, selected: id });
  }

  function newGun() {
    let n = 1;
    while (PARTS.some((d) => d.id === `gun${n}`)) n++;
    const d: PartDef = { ...structuredClone(partById('rivet')), id: `gun${n}`, name: `New Gun ${n}`, text: 'A gun made in the forge.' };
    S.custom = [...S.custom, d];
    syncParts();
    set({ selected: d.id });
  }

  // --- the deck (under the game) ----------------------------------------------------------

  function renderDeck() {
    const target = TARGETS.find((t) => t.id === S.target);
    const tsel = h('select', { 'aria-label': 'Target', onchange: (e: Event) => set({ target: (e.target as HTMLSelectElement).value }, ['deck', 'side']) }, ...TARGETS.map((t) => h('option', { value: t.id, selected: t.id === S.target }, t.name)));
    deck.replaceChildren(
      h('button', { type: 'button', class: 'btn go', onclick: launch }, icon(flying ? 'again' : 'play'), flying ? 'Fly again' : 'Fly it'),
      seg([{ value: 'bot', label: 'Autopilot' }, { value: 'you', label: 'You fly' }], S.pilot, (v) => set({ pilot: v }, ['deck']), 'Who flies'),
      h('label', { class: 'field' }, 'Target', tsel),
      h('label', { class: 'field', title: 'Blows cash in setups: SMASH, NAILED, FLARE-UP, GROUND-OUT, BREACH' }, h('input', { type: 'checkbox', checked: S.combos, onchange: (e: Event) => set({ combos: (e.target as HTMLInputElement).checked }, ['deck']) }), 'Combos'),
      h('label', { class: 'field', title: 'Enemies take this many times the beating (to watch the effects longer)' }, 'Tough', h('input', { type: 'range', min: '1', max: '6', step: '1', value: String(S.tough), oninput: (e: Event) => set({ tough: Number((e.target as HTMLInputElement).value) }, ['deck']) }), h('b', { class: 'num' }, `×${S.tough}`)),
      h('span', { class: 'grow f-note' }, target?.note ?? ''),
    );
  }

  function query(build: ReturnType<typeof kitBuild>['build']) {
    const waves = target().waves;
    const q = new URLSearchParams({
      planet: store.s.planet,
      mode: 'raid',
      seed: String(store.s.seed),
      difficulty: store.difficulty.toFixed(3),
      builds: JSON.stringify([build]),
      waves,
      length: String(fitLength(parseWaves(waves))),
      tough: String(S.tough),
      forge: JSON.stringify(S.custom),
      hold: '',
    });
    if (S.combos) q.set('combos', '');
    if (S.pilot === 'bot') q.set('autopilot', '');
    return q.toString();
  }

  const target = () => TARGETS.find((t) => t.id === S.target) ?? TARGETS[0];

  function launch() {
    const { build, left } = kitBuild(S.kit);
    if (left.length) toast(`No room for ${left.map((id) => partById(id)?.name ?? id).join(', ')}`);
    idle.hidden = true;
    if (!frame.isConnected) screen.prepend(frame);
    frame.src = `/index.html?${query(build)}`;
    frame.onload = () => {
      const w = frame.contentWindow as (Window & { audio?: { muted: boolean; toggleMute(): void } }) | null;
      if (w?.audio && w.audio.muted !== store.s.muted) w.audio.toggleMute();
      if (S.pilot === 'you') frame.focus();
    };
    flying = true;
    renderDeck();
    clearInterval(pollT);
    pollT = window.setInterval(renderLive, 400);
  }

  /** What the flight is doing right now, from the game in the frame. */
  function renderLive() {
    const lv = (frame.contentWindow as (Window & { level?: Level }) | null)?.level;
    if (!lv || root.offsetParent === null) return;
    live.replaceChildren(h('div', { class: 'f-live-row' }, h('span', { class: 'f-k' }, `${lv.time.toFixed(0)} s`), h('span', { class: 'f-k' }, `${lv.killed} killed`), h('span', { class: 'f-k' }, `${lv.reactions} reactions`), ...cashChips(lv.cashed)), shareBar(lv.dealtBy));
  }

  // --- the side: build, dials, results ----------------------------------------------------

  function renderSide() {
    side.replaceChildren(buildCard(), dialsCard(), resultsCard(), recipesCard());
  }

  function buildCard() {
    const f = frameById(S.kit.frame);
    const { build, left } = kitBuild(S.kit);
    const used = { T: 0, H: 0, A: 0, S: 0 } as Record<string, number>;
    for (const p of build.parts) {
      const hp = hardpointOf(partById(p.id));
      if (hp) used[hp]++;
    }
    const fsel = h('select', { 'aria-label': 'Frame', onchange: (e: Event) => set({ kit: { ...S.kit, frame: (e.target as HTMLSelectElement).value } }) }, ...FRAMES.map((fr) => h('option', { value: fr.id, selected: fr.id === S.kit.frame }, fr.name)));
    const mounts = (['T', 'H', 'A', 'S'] as const).map((k) => h('span', { class: 'f-mount', title: `${{ T: 'Trigger', H: 'Heavy', A: 'Aux', S: 'Special' }[k]} hardpoints used` }, `${k} ${used[k]}/${f.mounts[k] ?? 0}`));
    return h(
      'section',
      { class: 'card' },
      h('h3', null, 'The build'),
      h('div', { class: 'f-row' }, fsel, h('label', { class: 'f-check', title: 'Keep the frame’s own engines and aux' }, h('input', { type: 'checkbox', checked: S.kit.keepStart, onchange: (e: Event) => set({ kit: { ...S.kit, keepStart: (e.target as HTMLInputElement).checked } }) }), 'Its engines')),
      h('div', { class: 'f-row' }, ...mounts),
      ...S.kit.parts.map((k, i) => kitRow(k, i, left.includes(k.id))),
      S.kit.parts.length ? null : h('p', { class: 'sub' }, 'Nothing bolted on: press + by a part.'),
    );
  }

  function kitRow(k: KitPart, i: number, out: boolean) {
    const d = partById(k.id);
    const patch = (p: Partial<KitPart>) => {
      const parts = S.kit.parts.map((x, j) => (j === i ? { ...x, ...p } : x));
      set({ kit: { ...S.kit, parts } }, ['side']);
    };
    const tier = h('select', { 'aria-label': 'Tier', onchange: (e: Event) => patch({ tier: (e.target as HTMLSelectElement).value as Tier }) }, ...TIERS.map((t) => h('option', { value: t, selected: (k.tier ?? 'common') === t }, t)));
    const traits = (Object.keys(TRAITS) as TraitId[]).filter((t) => d && TRAITS[t].fits(d));
    const affixes = (Object.keys(AFFIXES) as AffixId[]).filter((a) => d && AFFIXES[a].fits(d));
    const trait = traits.length ? h('select', { 'aria-label': 'Trait', title: 'A legendary trait', onchange: (e: Event) => patch({ trait: ((e.target as HTMLSelectElement).value || undefined) as TraitId, tier: 'legendary' }) }, h('option', { value: '' }, 'no trait'), ...traits.map((t) => h('option', { value: t, selected: k.trait === t }, TRAITS[t].name))) : null;
    const affix = affixes.length ? h('select', { 'aria-label': 'Affix', onchange: (e: Event) => patch({ affix: ((e.target as HTMLSelectElement).value || undefined) as AffixId }) }, h('option', { value: '' }, 'no affix'), ...affixes.map((a) => h('option', { value: a, selected: k.affix === a }, AFFIXES[a].name))) : null;
    return h(
      'div',
      { class: `f-kit${out ? ' out' : ''}` },
      h('button', { type: 'button', class: 'f-pick', onclick: () => set({ selected: k.id }, ['list', 'side']) }, h('b', null, d?.name ?? k.id), out ? h('small', { class: 'warn' }, 'no room on this frame') : null),
      h('div', { class: 'f-row' }, tier, trait, affix, h('button', { type: 'button', class: 'btn icon ghost', 'aria-label': 'Take it off', onclick: () => toggle(k.id) }, icon('close'))),
    );
  }

  function dialsCard() {
    const d = PARTS.find((p) => p.id === S.selected);
    if (!d) return h('section', { class: 'card' }, h('h3', null, 'Dials'), h('p', { class: 'sub' }, 'Pick a part.'));
    if (!d.gun)
      return h('section', { class: 'card' }, h('h3', null, d.name), h('p', { class: 'sub' }, d.text), h('p', { class: 'sub' }, 'Only guns have dials here for now: bolt it on and try it.'));
    const g = d.gun;
    const write = (next: PartDef) => {
      S.custom = [...S.custom.filter((x) => x.id !== next.id), next];
      syncParts();
      save();
      renderList();
      renderDeck();
    };
    const change = (k: keyof GunSpec, v: unknown) => {
      const next = structuredClone(d);
      (next.gun as unknown as Record<string, unknown>)[k] = v;
      write(next);
      out.replaceChildren(...derived(next.gun!));
    };
    const out = h('div', { class: 'f-derived' }, ...derived(g));
    const dial = (x: (typeof DIALS)[number]) => {
      const val = Number(g[x.k] ?? 0);
      const num = h('b', { class: 'num' }, String(val));
      const input = h('input', {
        type: 'range', min: String(x.min), max: String(x.max), step: String(x.step), value: String(val), 'aria-label': x.name,
        oninput: (e: Event) => {
          const v = Number((e.target as HTMLInputElement).value);
          num.textContent = String(v);
          change(x.k, v || (x.k === 'rate' || x.k === 'damage' || x.k === 'count' ? v : undefined));
        },
      });
      const row = h('label', { class: 'f-dial' }, h('span', null, x.name), input, num);
      tip(row, () => x.note);
      return row;
    };
    const shot = h('select', { 'aria-label': 'Shot', onchange: (e: Event) => change('shot', (e.target as HTMLSelectElement).value) }, ...SHOTS.map((s) => h('option', { value: s, selected: g.shot === s }, s)));
    const edge = h('select', { 'aria-label': 'Edge', onchange: (e: Event) => change('edge', (e.target as HTMLSelectElement).value as Edge) }, ...(Object.keys(EDGES) as Edge[]).map((e) => h('option', { value: e, selected: g.edge === e }, `${EDGES[e].name}: ${EDGES[e].text.toLowerCase()}`)));
    const markNow = MARK_TAGS.find((m) => m.tags.some((t) => d.tags.includes(t)) && m.value !== 'none')?.value ?? 'none';
    const markSel = h('select', { 'aria-label': 'Mark', onchange: (e: Event) => {
      const m = MARK_TAGS.find((x) => x.value === (e.target as HTMLSelectElement).value)!;
      const next = structuredClone(d);
      next.tags = [...d.tags.filter((t) => t !== 'heat' && t !== 'arc' && t !== 'explosive'), ...m.tags.filter((t) => t !== 'kinetic')];
      write(next);
    } }, ...MARK_TAGS.map((m) => h('option', { value: m.value, selected: m.value === markNow }, m.label)));
    const name = h('input', { type: 'text', value: d.name, 'aria-label': 'Name', onchange: (e: Event) => write({ ...structuredClone(d), name: (e.target as HTMLInputElement).value }) });
    const text = h('textarea', { rows: 2, 'aria-label': 'What it does', onchange: (e: Event) => write({ ...structuredClone(d), text: (e.target as HTMLTextAreaElement).value }) }, d.text);
    const tint = h('input', { type: 'color', value: `#${(g.tint ?? 0xffc24a).toString(16).padStart(6, '0')}`, 'aria-label': 'Colour', onchange: (e: Event) => change('tint', parseInt((e.target as HTMLInputElement).value.slice(1), 16)) });
    const phase = h('label', { class: 'f-check', title: 'Through shields and plating, to the hull' }, h('input', { type: 'checkbox', checked: !!g.phase, onchange: (e: Event) => change('phase', (e.target as HTMLInputElement).checked || undefined) }), 'Phases');
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'f-head' }, h('h3', null, 'Dials'), isCustom(d.id) ? h('i', { class: `tag ${isNewHere(d.id) ? 'made' : 'edited'}` }, isNewHere(d.id) ? 'MADE HERE' : 'EDITED') : null),
      name,
      text,
      h('div', { class: 'f-row' }, shot, markSel, tint, phase),
      edge,
      out,
      ...DIALS.map(dial),
      h(
        'div',
        { class: 'f-row' },
        h('button', { type: 'button', class: 'btn', title: 'A copy of it to change, with a new name', onclick: () => fork(d) }, icon('plus'), 'Copy'),
        isCustom(d.id) && !isNewHere(d.id) ? h('button', { type: 'button', class: 'btn', title: 'Back to the game’s own numbers', onclick: () => reset(d.id) }, icon('again'), 'Reset') : null,
        isNewHere(d.id) ? h('button', { type: 'button', class: 'btn', title: 'Throw it away', onclick: () => reset(d.id) }, icon('trash'), 'Delete') : null,
        h('button', { type: 'button', class: 'btn', title: 'The PartDef, to paste into game/parts.ts', onclick: () => copyCode(d) }, icon('save'), 'Copy as code'),
      ),
    );
  }

  function fork(d: PartDef) {
    let n = 2;
    while (PARTS.some((x) => x.id === `${d.id}${n}`)) n++;
    const next: PartDef = { ...structuredClone(d), id: `${d.id}${n}`, name: `${d.name} ${n}` };
    S.custom = [...S.custom, next];
    syncParts();
    set({ selected: next.id });
  }

  function reset(id: string) {
    S.custom = S.custom.filter((x) => x.id !== id);
    const kit = isNewHere(id) ? { ...S.kit, parts: S.kit.parts.filter((p) => p.id !== id) } : S.kit;
    syncParts();
    set({ kit, selected: PARTS.some((p) => p.id === id) ? id : 'rivet' });
  }

  function copyCode(d: PartDef) {
    const code = `  ${JSON.stringify(d).replace(/"([a-z]\w*)":/gi, '$1: ').replace(/"/g, "'").replace(/,(?=\S)/g, ', ')},`;
    navigator.clipboard?.writeText(code).then(
      () => toast('Copied the PartDef'),
      () => toast('Couldn’t reach the clipboard'),
    );
  }

  // --- testing ----------------------------------------------------------------------------

  function resultsCard() {
    const rows = [S.last, S.pinned].filter((x): x is Tested => !!x);
    const seeds = h('select', { 'aria-label': 'Runs', onchange: (e: Event) => set({ seeds: Number((e.target as HTMLSelectElement).value) }, []) }, ...[2, 4, 8, 16].map((n) => h('option', { value: String(n), selected: n === S.seeds }, `${n} runs`)));
    return h(
      'section',
      { class: 'card' },
      h('h3', null, 'Test it'),
      h('p', { class: 'sub' }, 'The autopilot flies the build against the target, headless, at this stage’s difficulty. Pin a result to set the next against it.'),
      h('div', { class: 'f-row' }, h('button', { type: 'button', class: 'btn go', disabled: testing, onclick: test }, icon('bolt'), testing ? 'Flying…' : 'Run'), seeds, S.last ? h('button', { type: 'button', class: 'btn', title: 'Keep this result to compare the next against', onclick: () => set({ pinned: S.last }, ['side']) }, 'Pin') : null, S.pinned ? h('button', { type: 'button', class: 'btn ghost', onclick: () => set({ pinned: null }, ['side']) }, 'Unpin') : null),
      rows.length ? resultTable(rows) : null,
      ...rows.map((r) => h('div', { class: 'f-share' }, h('small', null, r === S.pinned ? 'Pinned' : 'Last', ': ', r.label), shareBar(sum(r.runs.map((x) => x.by))), h('div', { class: 'f-row' }, ...cashChips(scale(sum(r.runs.map((x) => x.cashed)), 1 / r.runs.length))))),
    );
  }

  function resultTable(rows: Tested[]) {
    const stat = (r: Tested) => {
      const runs = r.runs;
      const ttk = mean(runs.flatMap((x) => x.waves.filter((w) => w.end !== null).map((w) => w.end! - w.start)));
      return {
        clear: runs.filter((x) => x.outcome === 'clear').length / runs.length,
        ttk,
        dps: mean(runs.map((x) => x.dps)),
        lost: mean(runs.map((x) => x.taken[0] / x.hullMax[0])),
        missed: mean(runs.map((x) => x.missed)),
      };
    };
    const ss = rows.map(stat);
    const cell = (v: string, better: boolean | null) => h('td', { class: `num${better === true ? ' up' : better === false ? ' down' : ''}` }, v);
    const cmp = (i: number, k: keyof ReturnType<typeof stat>, lower: boolean) => (ss.length < 2 || i !== 0 ? null : lower ? ss[0][k] < ss[1][k] : ss[0][k] > ss[1][k]);
    return h(
      'table',
      { class: 'f-table' },
      h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Clear'), h('th', null, 'Per wave'), h('th', null, 'DPS'), h('th', null, 'Hull lost'), h('th', null, 'Let by'))),
      h('tbody', null, ...rows.map((r, i) => h('tr', null, h('th', { title: r.label }, i === 0 && S.pinned && r !== S.pinned ? 'Last' : r === S.pinned ? 'Pinned' : 'Last'), cell(`${Math.round(ss[i].clear * 100)}%`, cmp(i, 'clear', false)), cell(`${ss[i].ttk.toFixed(1)} s`, cmp(i, 'ttk', true)), cell(ss[i].dps.toFixed(0), cmp(i, 'dps', false)), cell(`${Math.round(ss[i].lost * 100)}%`, cmp(i, 'lost', true)), cell(ss[i].missed.toFixed(1), cmp(i, 'missed', true))))),
    );
  }

  function test() {
    const { build } = kitBuild(S.kit);
    const waves = parseWaves(target().waves);
    const jobs: FlyJob[] = Array.from({ length: S.seeds }, (_, i) => ({
      key: String(i), planet: store.s.planet, mode: 'raid', seed: i + 1, difficulty: store.difficulty, builds: [build], waves, length: fitLength(waves), tough: 1, forge: S.custom, combos: S.combos,
    }));
    const label = `${S.kit.parts.map((p) => partById(p.id)?.name ?? p.id).join(' + ')} on ${frameById(S.kit.frame).name}, ${target().name}${S.combos ? ', combos' : ''}`;
    testing = true;
    renderSide();
    const runs: FlyResult[] = [];
    const n = Math.min(jobs.length, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
    while (pool.length < n) pool.push(new Worker(new URL('./bench-worker.ts', import.meta.url), { type: 'module' }));
    let next = 0;
    let finished = 0;
    for (const w of pool.slice(0, n)) {
      const feed = () => {
        if (next < jobs.length) w.postMessage(jobs[next++]);
      };
      w.onmessage = (m: MessageEvent<{ ok: boolean; result?: FlyResult; error?: string }>) => {
        if (m.data.ok && m.data.result) runs.push(m.data.result);
        else console.error(m.data.error);
        if (++finished < jobs.length) return feed();
        testing = false;
        if (!runs.length) {
          toast('Every run failed: see the console');
          return renderSide();
        }
        set({ last: { label, kit: structuredClone(S.kit), combos: S.combos, target: S.target, runs } }, ['side']);
      };
      feed();
    }
  }

  function recipesCard() {
    return h(
      'section',
      { class: 'card' },
      h('h3', null, 'Combos to try'),
      ...RECIPES.map((r) =>
        h('button', { type: 'button', class: 'f-recipe', onclick: () => set({ kit: structuredClone(r.kit), target: r.target, combos: true, selected: r.kit.parts[0].id }) }, h('b', null, r.name), h('small', null, r.note)),
      ),
    );
  }

  renderList();
  renderSide();
  renderDeck();
}

// --- bits -------------------------------------------------------------------------------------

function gunRows(g: GunSpec): [string, string | number][] {
  return [
    ['hits', `${g.damage} × ${g.count}${g.shot === 'beam' ? '' : ''}`],
    [g.heavy ? 'reload' : 'rate', `${g.rate}/s`],
    ['range', g.speed ? `${Math.round(g.speed * g.life)}` : 'instant'],
    ['edge', EDGES[g.edge].name],
  ];
}

/** What the dials come to: damage a second, range, and so on. */
function derived(g: GunSpec) {
  const dps = g.damage * (g.shot === 'beam' ? 1 : g.count) * g.rate * (g.heavy ? 1 : 1);
  const range = g.speed ? g.speed * g.life : g.shot === 'beam' ? 999 : 15;
  return [
    h('span', null, h('b', { class: 'num' }, dps.toFixed(0)), g.heavy ? ' dmg/s on reload' : ' dmg/s held'),
    h('span', null, h('b', { class: 'num' }, range >= 999 ? 'screen' : range.toFixed(0)), ' range'),
    g.heavy ? h('span', null, h('b', { class: 'num' }, String(g.heavy)), ' rounds') : h('span', null, h('b', { class: 'num' }, g.heat ? (1 / (g.heat * g.rate)).toFixed(1) : '∞'), ' s to jam'),
  ];
}

const COLORS: Record<string, string> = { BURN: '#ff8a3a', TAKEDOWN: '#ffe08a', FLUNG: '#d8c8a8', OVERLOAD: '#c8b8ff', COOKOFF: '#ff7a2a', SHATTER: '#ffe8a0', other: '#5a5068' };
for (const k of Object.keys(CASH) as (keyof typeof CASH)[]) COLORS[CASH[k].name] = CASH[k].color;

/** A part's colour in the share bar: its tint, or one from its name. */
function colorOf(id: string) {
  if (COLORS[id]) return COLORS[id];
  const d = PARTS.find((p) => p.id === id);
  if (d?.gun?.tint) return `#${d.gun.tint.toString(16).padStart(6, '0')}`;
  let x = 0;
  for (const c of id) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${x % 360} 55% 62%)`;
}

/** Where the damage came from, as one bar and its key. */
function shareBar(by: Record<string, number>) {
  const total = Object.values(by).reduce((a, b) => a + b, 0);
  if (!total) return h('div', { class: 'f-bar empty' }, 'No damage yet');
  const parts = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const name = (k: string) => PARTS.find((p) => p.id === k)?.name ?? (k === 'other' ? 'Dash, rams, the rest' : k);
  return h(
    'div',
    null,
    h('div', { class: 'f-bar', role: 'img', 'aria-label': parts.map(([k, v]) => `${name(k)} ${Math.round((v / total) * 100)}%`).join(', ') }, ...parts.map(([k, v]) => h('i', { style: `flex:${v};background:${colorOf(k)}`, title: `${name(k)}: ${Math.round((v / total) * 100)}%` }))),
    h('div', { class: 'f-key' }, ...parts.slice(0, 7).map(([k, v]) => h('span', null, h('i', { style: `background:${colorOf(k)}` }), `${name(k)} `, h('b', { class: 'num' }, `${Math.round((v / total) * 100)}%`)))),
  );
}

function cashChips(c: Record<string, number>) {
  return Object.entries(c)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => {
      const def = CASH[k as keyof typeof CASH];
      return h('span', { class: 'f-cash', style: `color:${def?.color ?? '#fff'}` }, `${def?.name ?? k} ×${v % 1 ? v.toFixed(1) : v}`);
    });
}

function sum(xs: Record<string, number>[]) {
  const out: Record<string, number> = {};
  for (const x of xs) for (const [k, v] of Object.entries(x ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

const scale = (x: Record<string, number>, k: number) => Object.fromEntries(Object.entries(x).map(([a, v]) => [a, v * k]));
