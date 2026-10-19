/**
 * What a part would do for a ship, before you take it: the best place on the grid for it (or the
 * part it would best replace, when there's no room), and what that changes. The loot cards and
 * the dealer's stall show this, so a choice is between ships, not between names.
 */

import { EDGES, frameById, LOAD_CLASS, partById, TAG_BONUS, type Tag } from '../game/parts';
import { itemName, type Item } from '../game/loot';
import { fits, gunDir, stats, type Build, type Placement, type Stats } from './build';
import { links } from './links';
import { markKinds, markNames, reactionsOf } from './marks';

export interface Delta {
  label: string;
  from: string;
  to: string;
  good: boolean;
}

export interface Fit {
  /** Where it would go (null: nowhere, not even in place of something). */
  place: Placement | null;
  /** What it would replace, if there's no room for it as is. */
  swap: Placement | null;
  build: Build;
  before: Stats;
  after: Stats;
  /** The changes worth saying, most important first. */
  deltas: Delta[];
  /** How it would run there: 'LINKED', 'NEEDS A GUN TOUCHING', 'CLASH', ''. */
  state: { text: string; good: boolean } | null;
  /** Set bonuses it would wake. */
  wakes: string[];
}

export function dps(s: Stats) {
  return s.guns.reduce((t, g) => t + g.spec.damage * (g.spec.shot === 'beam' ? 1 : g.spec.count) * g.spec.rate, 0);
}

/** A rough worth of a ship, to rank placements by: firepower, toughness, speed, links, power. */
function worth(b: Build, s: Stats) {
  const lk = links(b);
  let v = dps(s) / 8 + s.hp * 1.2 + s.shield * 1.4 + s.speed * 0.12 + s.dashes * 0.8;
  v += Object.values(s.bonus).reduce((t, n) => t + (n ?? 0) * 1.5, 0);
  for (const pl of lk.parts) v += pl.def.conduit ? 0 : pl.str >= 1 ? (pl.str - 1) * 2 : -(1 - pl.str) * 3;
  if (s.brown < 1) v -= (1 - s.brown) * 12;
  // how it flies: a nimble ship is worth a part or two, an overloaded one costs as much
  v += s.loadClass === 'nimble' ? 4 : s.loadClass === 'overloaded' ? -6 : 0;
  // guns that fire behind are worth less (mines are meant to)
  for (const p of b.parts) if (partById(p.id).gun && p.id !== 'mine' && Math.abs(gunDir(frameById(b.frame), p)) > 1) v -= 2;
  if (s.aux) v += 2;
  if (s.special) v += 2;
  // marks, and more for the reactions they make; crits and detonations only count with marks to play on
  const kinds = markKinds(s.marks).length;
  v += kinds * 1.5 + reactionsOf(s.marks).length * 4;
  if (s.guns.some((g) => g.flaw)) v += kinds ? 3 : -1;
  if (s.mod.detonate) v += kinds ? 3 : -1;
  return v;
}

/** Every way a part could sit on a build: each socket, each turn that's really different. */
function spots(b: Build, it: Item): Placement[] {
  const f = frameById(b.frame);
  const shape = partById(it.id).shape;
  const line = shape.every(([c]) => c === shape[0][0]) || shape.every(([, r]) => r === shape[0][1]);
  const turns = shape.length === 1 ? 1 : line ? 2 : 4;
  const out: Placement[] = [];
  for (let r = 0; r < f.grid.length; r++)
    for (let c = 0; c < f.grid[0].length; c++)
      for (let rot = 0; rot < turns; rot++) {
        const p: Placement = { ...it, c, r, rot };
        if (fits(b, p)) out.push(p);
      }
  return out;
}

/** One aux, one special: placing a second is no good. */
function allowed(b: Build, it: Item) {
  const d = partById(it.id);
  if (d.aux && b.parts.some((q) => partById(q.id).aux)) return false;
  if (d.special && b.parts.some((q) => partById(q.id).special)) return false;
  return true;
}

export function bestFit(b: Build, it: Item): Fit {
  const before = stats(b);
  let best: { place: Placement; swap: Placement | null; build: Build; v: number } | null = null;
  const tryOn = (bb: Build, swap: Placement | null) => {
    if (!allowed(bb, it)) return;
    for (const p of spots(bb, it)) {
      const nb = { frame: bb.frame, parts: [...bb.parts, p] };
      const v = worth(nb, stats(nb));
      if (!best || v > best.v) best = { place: p, swap, build: nb, v };
    }
  };
  tryOn(b, null);
  // no room (or it's a second aux or special): what would it best replace?
  if (!best)
    for (const q of b.parts) {
      if (partById(q.id).conduit) continue;
      tryOn({ frame: b.frame, parts: b.parts.filter((x) => x !== q) }, q);
    }
  if (!best) return { place: null, swap: null, build: b, before, after: before, deltas: [], state: null, wakes: [] };
  const found = best as { place: Placement; swap: Placement | null; build: Build; v: number };
  const after = stats(found.build);
  return { place: found.place, swap: found.swap, build: found.build, before, after, deltas: deltas(before, after), state: state(found.build, found.place), wakes: wakes(before, after) };
}

function deltas(a: Stats, b: Stats): Delta[] {
  const out: (Delta & { w: number })[] = [];
  const row = (label: string, x: number, y: number, fmt: (n: number) => string, w: number, lowerBetter = false) => {
    if (Math.abs(y - x) < 1e-3 || fmt(x) === fmt(y)) return;
    out.push({ label, from: fmt(x), to: fmt(y), good: lowerBetter ? y < x : y > x, w: w * Math.abs(y - x) / Math.max(Math.abs(x), 1) });
  };
  row('DPS', dps(a), dps(b), (n) => `${Math.round(n)}`, 6);
  row('HULL', a.hp, b.hp, (n) => `${n}`, 5);
  row('SHIELD', a.shield, b.shield, (n) => `${n}`, 8);
  row('DASHES', a.dashes, b.dashes, (n) => `${n}`, 4);
  // the load class, when it moves, is the most important line on the card
  if (a.loadClass !== b.loadClass) {
    const order = ['nimble', 'steady', 'overloaded'];
    out.push({ label: 'LOAD', from: LOAD_CLASS[a.loadClass].name, to: LOAD_CLASS[b.loadClass].name, good: order.indexOf(b.loadClass) < order.indexOf(a.loadClass), w: 14 });
  } else row('LOAD', a.load, b.load, (n) => n.toFixed(1), 0.8, true);
  row('SPEED', a.speed, b.speed, (n) => n.toFixed(1), 3);
  row('POWER', a.powerOut - a.powerDraw, b.powerOut - b.powerDraw, (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}`, 1.5);
  row('DASH CD', a.dashCooldown, b.dashCooldown, (n) => `${n.toFixed(2)}S`, 2, true);
  row('CHARGE', a.specialRate, b.specialRate, (n) => `×${n.toFixed(2)}`, 2);
  // a new verb for a button: just what it is (or what it was, gone)
  const verb = (label: string, x?: string | null, y?: string | null) => {
    if (x === y) return;
    out.push({ label, from: x && y ? x.toUpperCase() : '', to: (y ?? `NO ${label}`).toUpperCase(), good: !!y, w: 9 });
  };
  verb('AUX', a.aux, b.aux);
  const heavy = (s: Stats) => s.guns.some((g) => g.heavy && !g.drone) || null;
  if (!heavy(a) && heavy(b)) out.push({ label: 'HEAVY', from: '', to: 'ON ITS OWN BUTTON', good: true, w: 9 });
  verb('SPECIAL', a.special, b.special);
  // the marks the guns leave, and the reactions they can set off between them
  verb('MARKS', markNames(a.marks) || null, markNames(b.marks) || null);
  const ra = reactionsOf(a.marks).map((r) => r.name);
  const rb = reactionsOf(b.marks).map((r) => r.name);
  const fresh = rb.filter((r) => !ra.includes(r));
  if (fresh.length) out.push({ label: 'REACTS', from: '', to: fresh.join(' '), good: true, w: 12 });
  // a new edge on the ship: a new way to land crits (and to fly)
  const ea = new Set(a.guns.map((g) => g.spec.edge));
  const eb = [...new Set(b.guns.map((g) => g.spec.edge))].filter((e) => !ea.has(e));
  if (eb.length) out.push({ label: 'EDGE', from: '', to: eb.map((e) => EDGES[e].name).join(' '), good: true, w: 10 });
  if (!a.mod.detonate !== !b.mod.detonate) verb('DASH', a.mod.detonate ? 'detonates marks' : null, b.mod.detonate ? 'detonates marks' : null);
  // power gone negative is always worth saying
  for (const d of out) if (d.label === 'POWER' && Number(d.to) < 0) d.w = 99;
  return out.sort((x, y) => y.w - x.w);
}

function wakes(a: Stats, b: Stats) {
  const out: string[] = [];
  for (const t of Object.keys(TAG_BONUS) as Tag[]) if ((b.bonus[t] ?? 0) > (a.bonus[t] ?? 0)) out.push(`${TAG_BONUS[t].name.toUpperCase()}${b.bonus[t] === 2 ? ' II' : ''}`);
  return out;
}

function state(b: Build, p: Placement): Fit['state'] {
  const pl = links(b).of(p);
  if (!pl) return null;
  const d = pl.def;
  if (pl.idle) return { text: pl.idle, good: false };
  if (d.link && !pl.link?.ok) return { text: `${d.link.need ? 'NEEDS' : 'WANTS'} ${d.link.text}`, good: false };
  if (pl.clashes.some((c) => !c.fused)) return { text: `CLASHES: RUNS AT ${Math.round(pl.str * 100)}%`, good: false };
  if (pl.str > 1.001) return { text: `RUNS AT ${Math.round(pl.str * 100)}%`, good: true };
  if (d.link && pl.link?.ok) return { text: 'LINKED', good: true };
  return null;
}

/** A line saying what a fit means, for when there's no room to draw it. */
export function fitLine(f: Fit) {
  if (!f.place) return 'NO WAY TO FIT IT';
  return f.swap ? `IN PLACE OF ${itemName(f.swap)}` : 'FITS A FREE SOCKET';
}
