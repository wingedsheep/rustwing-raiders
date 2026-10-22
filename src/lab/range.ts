/**
 * The range: the waves flown for real, in the game itself (index.html in a frame, so it's the
 * real thing: the HUD, the models, the sounds), by the autopilot, by you, or by you with the
 * autopilot as your partner. Under it the flight strip (the level as a line, each wave on it where
 * it comes, the ship's place on it), and beside it how the flight is going, wave by wave.
 */

import type { Level } from '../sim/level';
import { formatWaves } from '../sim/director';
import { PACE, fitLength } from './fly';
import { groupOf } from './catalog';
import { flownWaves, kindOf, levelEnd } from './composer';
import { SHIP_OPTIONS, shipAt, store, type LabWave, type PilotMode } from './state';
import { fmt, h, hideTip, icon, kids, median, seg, tip, tipRows } from './ui';
import { verdict, verdictPill } from './verdict';

interface LiveWave {
  /** Its index in lv.waves, and the lab wave it's taken to be (by when it came). */
  idx: number;
  wave: LabWave | null;
  flown: number;
  start: number;
  end: number | null;
  total: number;
  killed: number;
  missed: number;
  hits: number;
  kinds: string[];
  elite: boolean;
}

interface Live {
  lv: Level;
  waves: LiveWave[];
  hits: number[];
  pool: Map<number, number>;
  dealt: number;
  busy: number;
  lastT: number;
  /** The waves the flight was launched with (the strip shows these while it flies). */
  plan: LabWave[];
}

type GameWindow = Window & { level?: Level; flight?: { rate: number }; audio?: { muted: boolean; toggleMute(): void } };

export function mountRange(root: HTMLElement, onLight: (id: number) => void) {
  const frame = h('iframe', { title: 'The game, flying the waves', allow: 'autoplay; gamepad' });
  const idle = h(
    'div',
    { class: 'idle' },
    h('div', null, h('h3', null, 'Ready to fly'), h('p', null, 'The waves on the left, flown in the real game.'), h('button', { class: 'btn go', type: 'button', onclick: () => launch() }, icon('play'), 'Fly these waves')),
  );
  const note = h('div', { class: 'hud-note', hidden: true });
  const screen = h('div', { class: 'screen' }, idle, note);
  const deck = h('div', { class: 'deck' });
  const rail = h('div', { class: 'rail' });
  const head = h('div', { class: 'head', hidden: true });
  const strip = h('div', { class: 'strip', 'aria-label': 'Flight strip: when each wave comes' }, rail);
  rail.appendChild(head);
  const inspector = h('aside', { class: 'inspector', 'aria-label': 'This flight' });
  root.replaceChildren(h('div', { class: 'range' }, h('div', { class: 'range-main' }, screen, deck, strip), inspector));

  let live: Live | null = null;
  let flying = false;
  let paused = false;
  let stale = false;
  let launchedWith = '';
  let drawT = 0;
  let noteT = 0;

  const win = () => frame.contentWindow as GameWindow | null;

  function query() {
    const s = store.s;
    const coop = s.coop || s.pilot === 'partner';
    const stage = store.stage;
    const ships = [shipAt(s.ship, stage), shipAt(s.ship2, stage)].slice(0, coop ? 2 : 1);
    const q = new URLSearchParams({
      planet: s.planet,
      mode: s.mode,
      seed: String(s.seed),
      difficulty: store.difficulty.toFixed(3),
      builds: JSON.stringify(ships.map((x) => x.build)),
      tough: String(s.tough),
      hold: '',
    });
    if (coop) q.set('coop', '');
    if (s.pilot === 'bot') q.set('autopilot', '');
    if (s.pilot === 'partner') q.set('autopilot', '2');
    if (s.source === 'script') {
      q.set('waves', formatWaves(s.waves));
      q.set('length', String(fitLength(s.waves)));
    }
    return q.toString();
  }

  function launch() {
    const q = query();
    launchedWith = signature();
    stale = false;
    paused = false;
    live = null;
    flying = true;
    idle.hidden = true;
    if (!frame.isConnected) screen.prepend(frame);
    frame.src = `/index.html?${q}`;
    frame.onload = () => {
      const w = win();
      if (w?.audio && w.audio.muted !== store.s.muted) w.audio.toggleMute();
      if (store.s.pilot !== 'bot') frame.focus();
    };
    const s = store.s;
    note.hidden = s.pilot === 'bot';
    note.classList.remove('gone');
    clearTimeout(noteT);
    noteT = window.setTimeout(() => note.classList.add('gone'), 7000);
    note.textContent = s.pilot === 'you' ? 'You fly: WASD or arrows, J fire, K dash, L boost, Shift focus' : 'You fly P1 (WASD or arrows, J fire, K dash, L boost), the autopilot flies P2';
    renderDeck();
  }

  /** What a flight depends on: when it changes, what's on screen is out of date. */
  const signature = () => {
    const s = store.s;
    return JSON.stringify([s.planet, s.mode, s.seed, store.difficulty, s.source, formatWaves(s.waves), s.ship, s.ship2, s.coop, s.pilot, s.tough]);
  };

  function setRate() {
    const f = win()?.flight;
    if (f) f.rate = paused ? 0 : store.s.speed;
  }

  // --- the deck ---------------------------------------------------------------------------

  function shipSelect(value: string, onPick: (v: string) => void, label: string) {
    const sel = h('select', { 'aria-label': label, title: label, onchange: (e: Event) => onPick((e.target as HTMLSelectElement).value) });
    for (const o of SHIP_OPTIONS()) sel.appendChild(h('option', { value: o.value, selected: o.value === value }, o.label));
    sel.style.maxWidth = '210px';
    return sel;
  }

  function renderDeck() {
    const s = store.s;
    const coop = s.coop || s.pilot === 'partner';
    deck.replaceChildren(
      ...kids(
      h('button', { class: `btn ${!flying || stale ? 'go' : ''}`, type: 'button', onclick: launch, title: 'Fly from the start (F)' }, icon(flying ? 'again' : 'play'), flying ? (stale ? 'Fly the changes' : 'Fly again') : 'Fly'),
      h(
        'button',
        {
          class: 'btn icon',
          type: 'button',
          disabled: !flying,
          title: paused ? 'Carry on (P)' : 'Hold still (P)',
          'aria-label': paused ? 'Carry on' : 'Hold still',
          onclick: () => {
            paused = !paused;
            setRate();
            renderDeck();
          },
        },
        icon(paused ? 'play' : 'pause'),
      ),
      h(
        'label',
        { class: 'field' },
        'Speed',
        seg(
          [0.25, 0.5, 1, 2, 4, 8].map((v) => ({ value: v, label: v < 1 ? `${v === 0.25 ? '¼' : '½'}×` : `${v}×` })),
          s.speed,
          (v) => store.set({ speed: v }),
          'Speed',
        ),
      ),
      h(
        'label',
        { class: 'field' },
        'Pilot',
        seg<PilotMode>(
          [
            { value: 'bot', label: 'Autopilot', title: 'The autopilot flies (every ship)' },
            { value: 'you', label: 'You', title: 'You fly (in co-op, the keyboard is split)' },
            { value: 'partner', label: 'You + autopilot', title: 'Co-op: you fly P1, the autopilot flies P2' },
          ],
          s.pilot,
          (v) => store.set({ pilot: v }),
          'Pilot',
        ),
      ),
      h(
        'label',
        { class: 'field' },
        'Crew',
        seg(
          [
            { value: 'solo', label: 'Solo' },
            { value: 'coop', label: 'Co-op' },
          ],
          coop ? 'coop' : 'solo',
          (v) => store.set({ coop: v === 'coop', pilot: v === 'solo' && s.pilot === 'partner' ? 'bot' : s.pilot }),
          'Crew',
        ),
      ),
      h('label', { class: 'field' }, coop ? 'P1' : 'Ship', shipSelect(s.ship, (v) => store.set({ ship: v }), coop ? 'P1 ship' : 'Ship')),
      coop ? h('label', { class: 'field' }, 'P2', shipSelect(s.ship2, (v) => store.set({ ship2: v }), 'P2 ship')) : null,
      h(
        'label',
        { class: 'field', title: 'Every enemy’s hull times this, on top of the game’s own (try the co-op multiplier the bench suggests)' },
        'Enemy hull ×',
        h('input', { type: 'number', min: '0.1', max: '10', step: '0.1', value: String(s.tough), onchange: (e: Event) => store.set({ tough: Math.max(0.1, Number((e.target as HTMLInputElement).value) || 1) }) }),
      ),
      h(
        'label',
        { class: 'field', title: 'The seed: which biomes, and how each group rolls' },
        'Seed',
        h('input', { type: 'number', min: '1', step: '1', value: String(s.seed), onchange: (e: Event) => store.set({ seed: Math.max(1, Math.round(Number((e.target as HTMLInputElement).value) || 1)) }) }),
      ),
      h('div', { class: 'grow' }),
      h(
        'button',
        {
          class: 'btn ghost icon',
          type: 'button',
          title: s.muted ? 'Sound off' : 'Sound on',
          'aria-label': s.muted ? 'Turn the sound on' : 'Turn the sound off',
          onclick: () => {
            store.set({ muted: !s.muted });
            const w = win();
            if (w?.audio && w.audio.muted !== store.s.muted) w.audio.toggleMute();
          },
        },
        icon(s.muted ? 'muted' : 'sound'),
      ),
      ),
    );
  }

  // --- the strip --------------------------------------------------------------------------

  const stripWaves = () => (live?.plan ?? flownWaves());

  function renderStrip() {
    hideTip();
    for (const el of [...rail.children]) if (el !== head) el.remove();
    const waves = stripWaves();
    const end = levelEnd();
    const max = Math.max(end + 30, ...waves.map((w) => w.at + 60));
    const width = rail.clientWidth || 600;
    const x = (at: number) => (at / max) * width;
    // ticks every 10 s (5 s on a short fight)
    const step = max / PACE > 80 ? 20 : max / PACE > 40 ? 10 : 5;
    for (let t = 0; t * PACE <= max; t += step) rail.appendChild(h('div', { class: 'tick num', style: { left: `${x(t * PACE)}px` } }, `${t}s`));
    rail.appendChild(h('div', { class: 'end', style: { left: `${x(end)}px` } }, h('span', null, 'fight over')));
    // lanes, so chips close together don't sit on each other
    const lanes: number[] = [];
    for (const w of waves) {
      const k = kindOf(w.kind);
      const px = x(w.at);
      const label = `${(k?.name ?? w.kind).split(' ').slice(-1)[0]}${w.n > 1 ? ` ×${w.n}` : ''}`;
      const res = live?.waves.find((lw) => lw.wave?.id === w.id);
      const wide = (label.length + (res && res.end !== null ? 6 : 0)) * 6.8 + 24;
      let lane = lanes.findIndex((r) => px - wide / 2 > r + 4);
      if (lane < 0) lane = lanes.length < 2 ? lanes.length : lanes.indexOf(Math.min(...lanes));
      lanes[lane] = px + wide / 2;
      const col = k ? groupOf(k.group).color : '#888';
      const chip = h(
        'div',
        {
          class: `blip${w.elite ? ' elite' : ''}${res ? (res.end !== null ? (res.missed ? ' done-leak' : ' done-clean') : ' live') : ''}`,
          style: { left: `${px}px`, top: `${8 + lane * 30}px`, borderColor: col, color: col },
          tabindex: '0',
          role: 'button',
          'aria-label': `${k?.name ?? w.kind} at ${(w.at / PACE).toFixed(1)} seconds`,
        },
        h('span', { style: { color: 'var(--cream)' } }, label),
        res && res.end !== null ? h('span', { style: { color: 'var(--dim)' } }, `${(res.end - res.start).toFixed(1)}s`) : null,
        h('i', { class: 'stem' }),
      );
      tip(chip, () => {
        const rows: [string, string | number][] = [['Comes at', fmt.s(w.at / PACE)], ['Groups', w.n]];
        if (res) {
          rows.push(['Cleared in', res.end === null ? 'still flying' : fmt.s(res.end - res.start)], ['Killed', `${res.killed}/${res.total}`], ['Got away', res.missed], ['Hits taken', res.hits]);
        }
        return tipRows(`${w.elite ? 'Elite ' : ''}${k?.name ?? w.kind}`, rows, store.s.source === 'script' && !live ? 'Drag to move it.' : undefined);
      });
      chip.addEventListener('click', () => onLight(w.id));
      if (store.s.source === 'script' && !live) drag(chip, w, max, width);
      rail.appendChild(chip);
    }
  }

  function drag(chip: HTMLElement, w: LabWave, max: number, width: number) {
    chip.addEventListener('pointerdown', (e) => {
      const x0 = e.clientX;
      const left0 = parseFloat(chip.style.left);
      let moved = false;
      chip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - x0;
        if (Math.abs(dx) > 3) moved = true;
        chip.style.left = `${Math.max(0, Math.min(width, left0 + dx))}px`;
        hideTip();
      };
      const up = () => {
        chip.removeEventListener('pointermove', move);
        chip.removeEventListener('pointerup', up);
        if (!moved) return;
        const at = Math.round(((parseFloat(chip.style.left) / width) * max) / (PACE / 2)) * (PACE / 2);
        store.set({ waves: store.s.waves.map((x) => (x.id === w.id ? { ...x, at } : x)) });
        onLight(w.id);
      };
      chip.addEventListener('pointermove', move);
      chip.addEventListener('pointerup', up);
    });
  }

  // --- watching the flight ----------------------------------------------------------------

  function watch() {
    const lv = win()?.level;
    if (!lv) return;
    if (!live || live.lv !== lv) {
      live = { lv, waves: [], hits: lv.players.map(() => 0), pool: new Map(), dealt: 0, busy: 0, lastT: 0, plan: flownWaves() };
      setRate();
      renderStrip();
    }
    const L = live;
    let changed = false;
    for (let i = L.waves.length; i < lv.waves.length; i++) {
      const of = lv.enemies.filter((e) => e.wave === i);
      const flown = -lv.scroll;
      const taken = new Set(L.waves.map((w) => w.wave?.id));
      // the lab wave it is: the latest one due by now that isn't spoken for
      const wave = [...L.plan].reverse().find((w) => w.at <= flown + 1 && !taken.has(w.id)) ?? null;
      L.waves.push({ idx: i, wave, flown, start: lv.time, end: null, total: 0, killed: 0, missed: 0, hits: 0, kinds: [...new Set(of.map((e) => e.arch))], elite: of.some((e) => e.elite) });
      changed = true;
    }
    const open = L.waves.filter((w) => w.end === null);
    lv.players.forEach((p, i) => {
      const got = p.hits - L.hits[i];
      if (got > 0) for (const w of open) w.hits += got;
      L.hits[i] = p.hits;
    });
    for (const w of open) {
      const lw = lv.waves[w.idx];
      w.total = lw.total;
      w.killed = lw.killed;
      w.missed = lw.missed;
      if (lw.killed + lw.missed >= lw.total) {
        w.end = lv.time;
        changed = true;
      }
    }
    // what the guns took off what's still flying (a guess at the end: what vanished low was killed)
    const seen = new Set<number>();
    for (const e of lv.enemies) {
      if (e.dead) continue;
      seen.add(e.id);
      const now = Math.max(0, e.hp) + e.armour;
      const was = L.pool.get(e.id) ?? e.max + e.armourMax;
      if (now < was) L.dealt += was - now;
      L.pool.set(e.id, now);
    }
    for (const [id, left] of L.pool)
      if (!seen.has(id)) {
        L.dealt += left;
        L.pool.delete(id);
      }
    if (open.length && lv.time > L.lastT) L.busy += lv.time - L.lastT;
    L.lastT = lv.time;
    head.hidden = false;
    const end = levelEnd();
    const max = Math.max(end + 30, ...L.plan.map((w) => w.at + 60));
    head.style.left = `${(Math.min(-lv.scroll, max) / max) * (rail.clientWidth || 600)}px`;
    if (changed) renderStrip();
  }

  function renderInspector() {
    const s = store.s;
    const L = live;
    const lv = L?.lv;
    const ships = [shipAt(s.ship, store.stage), shipAt(s.ship2, store.stage)].slice(0, s.coop || s.pilot === 'partner' ? 2 : 1);
    const state = !lv ? 'waiting' : lv.state === 'boss' ? 'flying' : lv.state;
    const stateText = !lv ? (flying ? 'Taking off…' : 'Not flying yet') : lv.state === 'clear' ? 'Fight over' : lv.state === 'failed' ? 'Every ship down' : `Flying, ${Math.round((Math.min(-lv.scroll, levelEnd()) / levelEnd()) * 100)}% of the way`;
    const done = L ? L.waves.filter((w) => w.end !== null) : [];
    const ttk = median(done.map((w) => w.end! - w.start));
    const hullLost = lv ? 1 - lv.players.reduce((a, p) => a + Math.max(0, p.down ? 0 : p.hp) / p.stats.hp, 0) / lv.players.length : NaN;
    const v = lv && done.length ? verdict({ ttk, hullLost, failed: lv.state === 'failed' ? 1 : 0, leaks: lv.missed / Math.max(1, lv.killed + lv.missed) }, s.bench) : null;
    inspector.replaceChildren(
      h(
        'div',
        null,
        h('h3', null, 'This flight'),
        h('div', { class: `state ${state}` }, h('span', { class: 'dot' }), stateText, v && lv && (lv.state === 'clear' || lv.state === 'failed') ? verdictPill(v) : null),
        v && lv && (lv.state === 'clear' || lv.state === 'failed') && v.level !== 0 ? h('p', { class: 'sub', style: 'margin:6px 0 0' }, `${v.why}.`) : null,
        stale && flying ? h('p', { class: 'sub', style: 'margin:6px 0 0' }, 'You’ve changed things since this took off. Fly again to see them.') : null,
      ),
      h(
        'div',
        { class: 'hull' },
        ...ships.map((sh, i) => {
          const p = lv?.players[i];
          const f = p ? Math.max(0, p.down ? 0 : p.hp) / p.stats.hp : 1;
          return h(
            'div',
            { class: 'hull-row' },
            h('span', { style: { color: i ? 'var(--teal)' : 'var(--rust-hi)' } }, `P${i + 1}`),
            h('div', { class: 'hull-bar', title: sh.note }, h('div', { style: { width: `${f * 100}%`, background: f > 0.5 ? (i ? 'var(--teal-lo)' : 'var(--rust)') : f > 0.2 ? 'var(--gold)' : 'var(--red)' } })),
            h('span', { class: 'num', style: 'text-align:right' }, p ? `${Math.max(0, p.hp)}/${p.stats.hp}` : sh.name),
          );
        }),
        h('div', { class: 'sub', style: 'margin-top:4px' }, ships.map((x) => x.name).join(' and ')),
      ),
      h(
        'div',
        { class: 'stats' },
        stat(lv ? fmt.s(lv.time, 0) : '–', 'Flown'),
        stat(lv ? String(lv.players.reduce((a, p) => a + p.hits, 0)) : '–', 'Hits taken'),
        stat(L && L.busy > 1 ? Math.round(L.dealt / L.busy).toString() : '–', 'Damage a second, in a fight'),
        stat(fmt.s(ttk), 'Typical wave clear'),
        stat(lv ? `${lv.killed}/${lv.spawned}` : '–', 'Killed'),
        stat(lv ? String(lv.missed) : '–', 'Got away'),
      ),
      h(
        'div',
        null,
        h('h3', null, 'Wave by wave'),
        L && L.waves.length
          ? h(
              'table',
              { class: 'log' },
              h('thead', null, h('tr', null, h('th', null, 'Wave'), h('th', { class: 'r' }, 'Cleared in'), h('th', { class: 'r' }, 'Away'), h('th', { class: 'r' }, 'Hits'))),
              h(
                'tbody',
                null,
                ...L.waves.map((w) => {
                  const k = kindOf(w.wave?.kind ?? w.kinds[0] ?? '');
                  return h(
                    'tr',
                    { class: w.end === null ? 'now' : '' },
                    h('td', null, h('span', { class: 'who-dot', style: { background: k ? groupOf(k.group).color : '#888' } }), `${w.elite ? 'Elite ' : ''}${k?.name ?? w.kinds.join(', ')}`),
                    h('td', { class: 'r num' }, w.end === null ? '…' : fmt.s(w.end - w.start)),
                    h('td', { class: 'r num', style: w.missed ? 'color:var(--gold)' : '' }, String(w.missed)),
                    h('td', { class: 'r num', style: w.hits ? 'color:var(--red)' : '' }, String(w.hits)),
                  );
                }),
              ),
            )
          : h('div', { class: 'sub' }, flying ? 'Waves show up here as they come.' : 'Fly to see each wave: how long it took, what got away, what it cost.'),
      ),
    );
  }

  const stat = (v: string, label: string) => h('div', { class: 'stat' }, h('b', { class: 'num' }, v), h('span', null, label));

  function tick(t: number) {
    if (root.isConnected && root.offsetParent !== null) {
      if (flying) watch();
      if (t - drawT > 120) {
        drawT = t;
        renderInspector();
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener('keydown', (e) => {
    if (root.offsetParent === null || (e.target as HTMLElement).matches('input, select, textarea')) return;
    if (e.key === 'f' || e.key === 'F') launch();
    if ((e.key === 'p' || e.key === 'P') && flying) {
      paused = !paused;
      setRate();
      renderDeck();
    }
  });
  new ResizeObserver(() => renderStrip()).observe(strip);

  renderDeck();
  renderStrip();
  renderInspector();
  store.on((s, c) => {
    if (c.has('speed')) setRate();
    if ([...c].some((k) => ['coop', 'pilot', 'ship', 'ship2', 'speed', 'tough', 'seed', 'muted'].includes(k))) renderDeck();
    if (flying && signature() !== launchedWith && !stale) {
      stale = true;
      renderDeck();
    }
    if (!live && [...c].some((k) => ['waves', 'source', 'planet', 'mode', 'seed', 'sector', 'stop', 'danger'].includes(k))) renderStrip();
    void s;
  });

  return {
    /** Fly these waves now (from the bestiary: "see it fly"). */
    launch,
  };
}

