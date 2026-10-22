/** Line charts for the bench: one y axis, thin lines, a band for the target, a crosshair and tooltip on hover. */

import { h, hideTip, showTip, svg } from './ui';

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  /** The path the run takes (drawn as a dotted cream line over the rest). */
  path?: boolean;
}

export interface LineSpec {
  title: string;
  sub: string;
  x: string[];
  series: Series[];
  band?: [number, number];
  bandLabel?: string;
  fmt: (v: number) => string;
  /** Floor of the y axis (0 by default). */
  min?: number;
}

const W = 560;
const H = 230;
const M = { l: 44, r: 92, t: 12, b: 26 };

export function lineChart(spec: LineSpec) {
  const all = spec.series.flatMap((s) => s.values.filter((v): v is number => v !== null && isFinite(v)));
  const lo = spec.min ?? 0;
  // four steps, each a round number
  const step = nice((Math.max(...all, spec.band?.[1] ?? 0, lo + 1e-6) * 1.08 - lo) / 4);
  const hi = lo + step * 4;
  const px = (i: number) => M.l + (i / Math.max(1, spec.x.length - 1)) * (W - M.l - M.r);
  const py = (v: number) => H - M.b - ((v - lo) / (hi - lo)) * (H - M.t - M.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  let body = '';
  body += `<g class="grid">${ticks.map((t) => `<line x1="${M.l}" x2="${W - M.r}" y1="${py(t)}" y2="${py(t)}"/>`).join('')}</g>`;
  if (spec.band) {
    const [a, b] = spec.band;
    body += `<rect class="band" x="${M.l}" width="${W - M.l - M.r}" y="${py(Math.min(b, hi))}" height="${Math.max(0, py(a) - py(Math.min(b, hi)))}" rx="2"/>`;
    if (spec.bandLabel) body += `<text class="band-label" x="${M.l + 6}" y="${py(Math.min(b, hi)) + 13}">${spec.bandLabel}</text>`;
  }
  body += `<g class="axis">${ticks.map((t) => `<text x="${M.l - 8}" y="${py(t) + 4}" text-anchor="end">${spec.fmt(t)}</text>`).join('')}`;
  body += spec.x.map((x, i) => `<text x="${px(i)}" y="${H - 6}" text-anchor="middle">${x}</text>`).join('') + '</g>';
  // direct labels at the right end, nudged apart
  const ends: { y: number; name: string; color: string }[] = [];
  for (const s of spec.series) {
    const pts = s.values.map((v, i) => (v === null || !isFinite(v) ? null : [px(i), py(v)] as const));
    const d = pts.reduce((acc, p, i) => (p ? acc + `${acc && pts[i - 1] ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : acc), '');
    if (!d) continue;
    if (s.path) body += `<g class="path"><path d="${d}"/></g>`;
    else {
      body += `<g class="series"><path d="${d}" stroke="${s.color}"/>`;
      body += pts.map((p) => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${s.color}"/>` : '')).join('') + '</g>';
    }
    const last = [...pts].reverse().find((p) => p);
    if (last) ends.push({ y: last[1], name: s.name, color: s.path ? 'var(--cream)' : s.color });
  }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  body += ends.map((e) => `<text class="label" x="${W - M.r + 8}" y="${e.y + 4}" style="fill:${e.color}">${esc(e.name)}</text>`).join('');
  body += `<line class="cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}" visibility="hidden"/>`;
  body += `<rect class="hit" x="${M.l - 10}" y="0" width="${W - M.l - M.r + 20}" height="${H}" fill="transparent"/>`;
  const el = svg(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${body}</svg>`);
  const cross = el.querySelector('.cross') as SVGLineElement;
  const hit = el.querySelector('.hit') as SVGRectElement;
  hit.addEventListener('pointermove', (e) => {
    const r = (el as SVGSVGElement).getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(spec.x.length - 1, Math.round(((x - M.l) / (W - M.l - M.r)) * (spec.x.length - 1))));
    cross.setAttribute('x1', String(px(i)));
    cross.setAttribute('x2', String(px(i)));
    cross.setAttribute('visibility', 'visible');
    const rows = spec.series
      .map((s) => ({ s, v: s.values[i] }))
      .filter((r) => r.v !== null && isFinite(r.v!))
      .sort((a, b) => b.v! - a.v!);
    showTip(
      e,
      h(
        'div',
        null,
        h('b', null, spec.x[i]),
        ...rows.map((r) => h('div', { class: 'k' }, h('span', null, h('i', { style: `display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:3px;background:${r.s.path ? 'var(--cream)' : r.s.color}` }), r.s.name), h('em', null, spec.fmt(r.v!)))),
      ),
    );
  });
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    hideTip();
  });
  return h(
    'div',
    { class: 'card chart' },
    h('h3', null, spec.title),
    h('div', { class: 'sub', style: 'margin:-4px 0 8px' }, spec.sub),
    el,
    h(
      'div',
      { class: 'chart-legend' },
      ...spec.series.map((s) => h('span', null, h('i', { style: { background: s.path ? 'var(--cream)' : s.color } }), s.name)),
      spec.band ? h('span', null, h('i', { style: { background: '#3a3542', height: '8px', verticalAlign: '0' } }), spec.bandLabel ?? 'Target') : null,
    ),
  );
}

function nice(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
