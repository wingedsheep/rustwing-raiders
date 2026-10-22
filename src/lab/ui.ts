/** Small DOM helpers for the wave lab: elements, icons, the tooltip and the toast. */

type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { style?: Partial<CSSStyleDeclaration> | string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  add(el, kids);
  return el;
}

function add(el: Node, kids: Child[]) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
  }
}

export function svg(markup: string): SVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstChild as SVGElement;
}

const I = (d: string, fill = false) => `<svg viewBox="0 0 16 16" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="${fill ? 'none' : 'currentColor'}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const ICON = {
  play: I('<path d="M4 2.5v11l9-5.5z"/>', true),
  pause: I('<rect x="3.5" y="2.5" width="3" height="11" rx="0.5"/><rect x="9.5" y="2.5" width="3" height="11" rx="0.5"/>', true),
  again: I('<path d="M3 8a5 5 0 1 0 1.6-3.7"/><path d="M3 2.5v3h3"/>'),
  crown: I('<path d="M2.5 12.5h11l1-7-3.5 2.5L8 3 5 8 1.5 5.5z"/>', true),
  close: I('<path d="M4 4l8 8M12 4l-8 8"/>'),
  plus: I('<path d="M8 3v10M3 8h10"/>'),
  minus: I('<path d="M3 8h10"/>'),
  grip: I('<circle cx="6" cy="4" r="1"/><circle cx="10" cy="4" r="1"/><circle cx="6" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="10" cy="12" r="1"/>', true),
  link: I('<path d="M7 9a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.8.8"/><path d="M9 7a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.8-.8"/>'),
  save: I('<path d="M3 2.5h8l2.5 2.5v8.5h-10.5z"/><path d="M5.5 2.5v3.5h5v-3.5M5 13.5v-4h6v4"/>'),
  trash: I('<path d="M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9"/>'),
  sound: I('<path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5"/>'),
  muted: I('<path d="M2.5 6h2.5l3.5-3v10L5 10H2.5z"/><path d="M11 6l3.5 4M14.5 6L11 10"/>'),
  warn: I('<path d="M8 1.8l6.5 12H1.5z" fill="currentColor" stroke="none"/><path d="M8 6v3.5M8 11.5v.2" stroke="#1b0808"/>'),
  check: I('<path d="M3 8.5l3 3 7-7"/>'),
  skull: I('<path d="M8 1.5a5.5 5.5 0 0 0-3.5 9.7v2.3h7v-2.3A5.5 5.5 0 0 0 8 1.5z" fill="currentColor" stroke="none"/><circle cx="6" cy="7.5" r="1.2" fill="#1b0808" stroke="none"/><circle cx="10" cy="7.5" r="1.2" fill="#1b0808" stroke="none"/>'),
  bolt: I('<path d="M9 1.5L3.5 9H8l-1 5.5L12.5 7H8z"/>', true),
  dice: I('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><circle cx="5.5" cy="5.5" r="0.6" fill="currentColor"/><circle cx="10.5" cy="10.5" r="0.6" fill="currentColor"/><circle cx="8" cy="8" r="0.6" fill="currentColor"/>'),
};

export const icon = (k: keyof typeof ICON) => svg(ICON[k]);

// --- tooltip ---------------------------------------------------------------------------------

const tipEl = () => document.getElementById('tip')!;

/** Shows the tooltip by the pointer with this content (an element or HTML). */
export function showTip(ev: { clientX: number; clientY: number }, content: Node | string) {
  const t = tipEl();
  t.hidden = false;
  t.replaceChildren();
  if (typeof content === 'string') t.innerHTML = content;
  else t.appendChild(content);
  const r = t.getBoundingClientRect();
  let x = ev.clientX + 14;
  let y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${Math.max(8, y)}px`;
}

export const hideTip = () => (tipEl().hidden = true);

/** Hover (and focus) shows `make()`'s content. */
export function tip(el: HTMLElement | SVGElement, make: () => Node | string) {
  el.addEventListener('pointermove', (e) => showTip(e as PointerEvent, make()));
  el.addEventListener('pointerleave', hideTip);
  el.addEventListener('focus', () => {
    const r = el.getBoundingClientRect();
    showTip({ clientX: r.right, clientY: r.bottom }, make());
  });
  el.addEventListener('blur', hideTip);
}

/** Key-value rows for a tooltip. */
export function tipRows(title: string, rows: [string, string | number][], note?: string) {
  return h('div', null, h('b', null, title), ...rows.map(([k, v]) => h('div', { class: 'k' }, h('span', null, k), h('em', null, String(v)))), note ? h('div', { style: 'margin-top:4px' }, note) : null);
}

// --- toast -----------------------------------------------------------------------------------

let toastT = 0;
export function toast(text: string) {
  const t = document.getElementById('toast')!;
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => t.classList.remove('on'), 1800);
}

/** A segmented control. */
export function seg<T extends string | number>(options: { value: T; label: string; title?: string }[], value: T, onPick: (v: T) => void, label?: string) {
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label });
  for (const o of options)
    el.appendChild(
      h('button', { type: 'button', 'aria-pressed': String(o.value === value), title: o.title, onclick: () => onPick(o.value) }, o.label),
    );
  return el;
}

export const fmt = {
  s: (v: number | null | undefined, d = 1) => (v === null || v === undefined || !isFinite(v) ? '–' : `${v.toFixed(d)} s`),
  pct: (v: number | null | undefined) => (v === null || v === undefined || !isFinite(v) ? '–' : `${Math.round(v * 100)}%`),
  n: (v: number, d = 0) => v.toFixed(d),
};

export const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** What's there of these (for replaceChildren, which takes no nulls). */
export const kids = (...xs: (Node | string | null | undefined | false)[]) => xs.filter((x): x is Node | string => x !== null && x !== undefined && x !== false);
