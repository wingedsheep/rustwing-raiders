/**
 * The loot card: one part as found, laid out so a choice reads at a glance. Its tier along the
 * top, its shape big, what it does in numbers, what was rolled for it (and how well), a
 * legendary's trait, and at the foot what it would do on your ship: where it would go, and what
 * that changes. The results screen, the dealer and the hangar all use it.
 */

import { CLASS_COLOR, DARK, DIM, EDGE, GOLD, GREEN, INK, RED } from './hud';
import { drawText, textWidth, wrap } from './font';
import { partStats, TIER_BODY, TIER_COLOR, TIER_DARK } from './widgets';
import { frameById, partById, verbOf, type PartDef, type Verb } from '../game/parts';
import { itemDef, MODS, modValue, tierOf, TRAITS, type Item, type Tier } from '../game/loot';
import { cellsOf, type Build } from '../sim/build';
import type { Fit } from '../sim/fit';
import { portraits } from '../view/portraits';

export const VERB_COLOR: Record<Verb, string> = {
  GUN: '#ff8a4a',
  HEAVY: '#ff5a78',
  'DASH MOD': '#6ad0ff',
  AUX: '#ffd04a',
  SPECIAL: '#8affb0',
  PASSIVE: '#d08aff',
};

export const TIER_WORD: Record<Tier, string> = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

export interface CardOpts {
  /** In focus: lifted, outlined. */
  on?: boolean;
  /** Seconds, for the shimmer. */
  t?: number;
  /** What it would do on the ship (drawn at the foot). */
  fit?: Fit | null;
  /** Leave out the flavour text. */
  terse?: boolean;
  /** Greyed out (taken by someone else, sold, not chosen). */
  dim?: boolean;
  /** Whose livery the part is shown in (player index). */
  livery?: number;
}

/** A shape drawn big: bevelled cells in its class colour. */
export function bigShape(ctx: CanvasRenderingContext2D, def: PartDef, cx: number, cy: number, box: number) {
  const cols = Math.max(...def.shape.map(([c]) => c)) + 1;
  const rows = Math.max(...def.shape.map(([, r]) => r)) + 1;
  const cell = Math.min(11, Math.floor(box / Math.max(cols, rows)));
  const x0 = Math.round(cx - (cols * cell) / 2);
  const y0 = Math.round(cy - (rows * cell) / 2);
  const col = def.conduit ? '#7a7090' : CLASS_COLOR[def.cls];
  for (const [c, r] of def.shape) {
    const x = x0 + c * cell;
    const y = y0 + r * cell;
    ctx.fillStyle = DARK;
    ctx.fillRect(x, y, cell, cell);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, cell - 1, cell - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y, cell - 1, 1);
    ctx.fillRect(x, y, 1, cell - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 1, y + cell - 2, cell - 2, 1);
    ctx.fillRect(x + cell - 2, y + 1, 1, cell - 2);
    // join the cells of a long part
    if (def.shape.some(([c2, r2]) => c2 === c + 1 && r2 === r)) {
      ctx.fillStyle = col;
      ctx.fillRect(x + cell - 2, y + 3, 3, cell - 7);
    }
    if (def.shape.some(([c2, r2]) => c2 === c && r2 === r + 1)) {
      ctx.fillStyle = col;
      ctx.fillRect(x + 3, y + cell - 2, cell - 7, 3);
    }
  }
  // a gun's muzzle
  if (def.gun) {
    const [c, r] = def.shape[0];
    ctx.fillStyle = INK;
    ctx.fillRect(x0 + c * cell + Math.floor(cell / 2) - 1, y0 + r * cell - 3, 2, 3);
  }
}

/** A shape in little cells, its bottom-right corner at (x1, y1): the key to a portrait. */
function smallShape(ctx: CanvasRenderingContext2D, def: PartDef, x1: number, y1: number) {
  const cell = 3;
  const cols = Math.max(...def.shape.map(([c]) => c)) + 1;
  const rows = Math.max(...def.shape.map(([, r]) => r)) + 1;
  const x0 = x1 - cols * cell;
  const y0 = y1 - rows * cell;
  ctx.fillStyle = 'rgba(18,12,24,0.8)';
  ctx.fillRect(x0 - 2, y0 - 2, cols * cell + 3, rows * cell + 3);
  ctx.fillStyle = def.conduit ? '#7a7090' : CLASS_COLOR[def.cls];
  for (const [c, r] of def.shape) ctx.fillRect(x0 + c * cell, y0 + r * cell, cell - 1, cell - 1);
}

/** A diagonal glint moving across a strip (legendary bands, card backs). */
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, period = 2.4) {
  const k = (t % period) / period;
  const gx = x - 20 + (w + 40) * k;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let j = 0; j < h; j++) {
    ctx.fillStyle = 'rgba(255,240,200,0.55)';
    ctx.fillRect(Math.round(gx - j * 0.6), y + j, 3, 1);
    ctx.fillStyle = 'rgba(255,240,200,0.25)';
    ctx.fillRect(Math.round(gx - j * 0.6) + 5, y + j, 1, 1);
  }
  ctx.restore();
}

/** Roll pips: how well a mod came out, in five. */
function pips(ctx: CanvasRenderingContext2D, roll: number, x: number, y: number, col: string) {
  const n = Math.max(1, Math.ceil(roll * 5 - 0.001));
  const max = roll >= 0.9;
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = DARK;
    ctx.fillRect(x + k * 5, y, 4, 5);
    ctx.fillStyle = k < n ? (max ? GOLD : col) : '#2a2236';
    ctx.fillRect(x + k * 5, y, 3, 4);
  }
}

/** The ship's grid, small, with the new part where it would go and what it would replace. */
export function fitSchematic(ctx: CanvasRenderingContext2D, b: Build, fit: Fit, x: number, y: number, cell: number, tier: Tier, t: number) {
  const f = frameById(b.frame);
  for (let r = 0; r < f.grid.length; r++)
    for (let c = 0; c < f.grid[0].length; c++) {
      if (f.grid[r][c] !== '#') continue;
      ctx.fillStyle = '#2a2238';
      ctx.fillRect(x + c * cell, y + r * cell, cell - 1, cell - 1);
    }
  for (const p of b.parts) {
    const d = partById(p.id);
    const out = p === fit.swap;
    ctx.fillStyle = out ? RED : d.conduit ? '#4a4060' : CLASS_COLOR[d.cls];
    ctx.globalAlpha = out ? (Math.floor(t * 4) % 2 ? 0.9 : 0.4) : 0.5;
    for (const [c, r] of cellsOf(p)) ctx.fillRect(x + c * cell + 1, y + r * cell + 1, cell - 3, cell - 3);
    ctx.globalAlpha = 1;
  }
  if (fit.place) {
    const pulse = 0.65 + 0.35 * Math.sin(t * 6);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = TIER_COLOR[tier];
    for (const [c, r] of cellsOf(fit.place)) ctx.fillRect(x + c * cell, y + r * cell, cell - 1, cell - 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    for (const [c, r] of cellsOf(fit.place)) ctx.fillRect(x + c * cell + 2, y + r * cell + 2, cell - 5, 1);
  }
}

/**
 * Draws the card. `x, y` the top-left, `w, h` its size; it lays itself out to fit, dropping the
 * flavour text first when it's short of room.
 */
export function lootCard(ctx: CanvasRenderingContext2D, it: Item, b: Build | null, x: number, y: number, w: number, h: number, o: CardOpts = {}) {
  const t = o.t ?? 0;
  const tier = tierOf(it);
  const tc = TIER_COLOR[tier];
  const def = itemDef(it);
  const base = partById(it.id);
  const verb = verbOf(base);
  const legend = tier === 'legendary';

  // glow and frame
  if (legend || o.on) {
    const a = legend ? 0.35 + 0.2 * Math.sin(t * 3) : 0.3;
    ctx.fillStyle = tc;
    ctx.globalAlpha = a * 0.5;
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.globalAlpha = a;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = TIER_BODY[tier];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = o.on ? INK : tier === 'common' ? EDGE : tc;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillRect(x, y + h - 1, w, 1);

  // the band: tier, verb
  ctx.fillStyle = TIER_DARK[tier];
  ctx.fillRect(x + 1, y + 1, w - 2, 12);
  ctx.fillStyle = tc;
  ctx.fillRect(x + 1, y + 13, w - 2, 1);
  if (legend) glint(ctx, x + 1, y + 1, w - 2, 12, t);
  if (tier !== 'common') drawText(ctx, '◆', x + 4, y + 4, tc);
  drawText(ctx, TIER_WORD[tier], x + (tier !== 'common' ? 13 : 5), y + 4, tc);
  drawText(ctx, verb, x + w - 5, y + 4, VERB_COLOR[verb], { align: 'right' });

  // the part itself, turning on its sockets in a well (its shape small in the corner); the
  // shape alone, big, if it has no model
  const box = w >= 180 && h >= 170 ? 56 : 38;
  const bx = x + 6;
  const by = y + 19;
  ctx.fillStyle = DARK;
  ctx.fillRect(bx, by, box, box);
  ctx.fillStyle = '#16101f';
  ctx.fillRect(bx + 1, by + 1, box - 2, box - 2);
  if (portraits.draw(ctx, base.id, bx + 1, by + 1, box - 2, t, o.livery)) {
    // a tier-coloured corner bracket on each corner
    ctx.fillStyle = tier === 'common' ? EDGE : tc;
    for (const [cx, cy, sx, sy] of [[bx, by, 1, 1], [bx + box - 1, by, -1, 1], [bx, by + box - 1, 1, -1], [bx + box - 1, by + box - 1, -1, -1]]) {
      ctx.fillRect(cx, cy, 5 * sx, 1);
      ctx.fillRect(cx, cy, 1, 5 * sy);
    }
    smallShape(ctx, base, bx + box - 3, by + box - 3);
  } else bigShape(ctx, base, bx + box / 2, by + box / 2 + 1, box - 10);
  if (legend) {
    // a slow ring of light round the well
    const per = box * 4;
    for (let k = 0; k < 6; k++) {
      const d = (t * 40 + (k * per) / 6) % per;
      const s = Math.floor(d / box);
      const u = d % box;
      const px = s === 0 ? bx + u : s === 1 ? bx + box - 1 : s === 2 ? bx + box - 1 - u : bx;
      const py = s === 0 ? by : s === 1 ? by + u : s === 2 ? by + box - 1 : by + box - 1 - u;
      ctx.fillStyle = GOLD;
      ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  }

  // name (a legendary's trait on its own line, in gold), tags
  const nx = x + box + 12;
  const nw = w - box - 18;
  let ny = y + 19;
  if (it.trait) {
    drawText(ctx, TRAITS[it.trait].name, nx, ny, tc);
    ny += 9;
  }
  for (const l of wrap(base.name.toUpperCase(), nw).slice(0, it.trait ? 1 : 2)) {
    drawText(ctx, l, nx, ny, INK);
    ny += 9;
  }
  const tags = it.trait === 'prismatic' ? 'EVERY TAG' : base.tags.join(' ').toUpperCase() || 'NO TAGS';
  drawText(ctx, tags.length * 6 > nw ? tags.slice(0, Math.floor(nw / 6)) : tags, nx, ny + 3, it.trait === 'prismatic' ? GOLD : '#a890d0');
  let ty = y + box + 24;

  // the foot: what it would do on the ship
  const footH = o.fit && b ? footHeight(o.fit) : 0;
  const limit = y + h - footH - 4;
  const line = (s: string, col: string, dx = 0) => {
    if (ty + 8 > limit) return false;
    drawText(ctx, s, x + 7 + dx, ty, col);
    ty += 9;
    return true;
  };

  // numbers (with the rolls already in them), the link it wants
  const st = partStats(def).filter((s) => !s.startsWith('MASS') && !s.startsWith('SPECIAL:') && !s.startsWith('AUX:'));
  const mass = partStats(def).find((s) => s.startsWith('MASS'));
  for (const s of st.slice(0, 3)) {
    const want = s.startsWith('NEEDS') || s.startsWith('LINK');
    if (s.startsWith('EDGE')) {
      // the gun's edge: how it wants to be flown, in crit pink (wrapped: it's the line that matters)
      const ls = wrap(s, w - 20);
      if (ty + 9 * Math.min(ls.length, 2) > limit) break;
      ctx.fillStyle = '#ffa8d8';
      ctx.fillRect(x + 7, ty + 2, 3, 3);
      for (const l of ls.slice(0, 2)) line(l, '#ffa8d8', 6);
      continue;
    }
    if (!line(s, want ? '#e0c070' : '#c8bcd8')) break;
  }
  if (mass) line(mass, DIM);

  // what was rolled for it
  if (it.mods?.length) {
    ty += 2;
    ctx.fillStyle = EDGE;
    if (ty < limit) ctx.fillRect(x + 6, ty - 2, w - 12, 1);
    ty += 2;
    for (const m of it.mods) {
      if (ty + 8 > limit) break;
      drawText(ctx, MODS[m.k].text(modValue(m)), x + 7, ty, '#e8e0f0');
      pips(ctx, m.roll, x + w - 31, ty + 1, tc);
      ty += 10;
    }
  }

  // a legendary's trait: the rule it breaks
  if (it.trait && ty + 20 < limit) {
    const tr = TRAITS[it.trait];
    const lines = wrap(tr.text.toUpperCase(), w - 22);
    const th = 13 + Math.min(lines.length, Math.floor((limit - ty - 15) / 9)) * 9;
    ty += 2;
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(x + 5, ty, w - 10, th);
    ctx.fillStyle = tc;
    ctx.fillRect(x + 5, ty, 2, th);
    drawText(ctx, `★ ${tr.name}`, x + 11, ty + 3, GOLD);
    let ly = ty + 13;
    for (const l of lines) {
      if (ly + 8 > ty + th) break;
      drawText(ctx, l, x + 11, ly, '#ffd9a0');
      ly += 9;
    }
    ty += th + 4;
  }

  // the flavour, if there's room
  if (!o.terse && ty + 12 < limit) {
    ty += 3;
    for (const l of wrap(base.text.toUpperCase(), w - 14)) if (!line(l, '#7a6e8a')) break;
  }

  if (o.fit && b) foot(ctx, o.fit, b, x, y + h - footH, w, footH, tier, t);

  if (o.dim) {
    ctx.fillStyle = 'rgba(15,11,22,0.6)';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  }
}

function footHeight(f: Fit) {
  const rows = Math.min(4, f.deltas.length + (f.state ? 1 : 0) + (f.wakes.length ? 1 : 0));
  return Math.max(48, 16 + rows * 9 + 4);
}

/** What it would do on the ship: the grid with it in place, and the numbers that change. */
function foot(ctx: CanvasRenderingContext2D, f: Fit, b: Build, x: number, y: number, w: number, h: number, tier: Tier, t: number) {
  ctx.fillStyle = 'rgba(10,7,16,0.55)';
  ctx.fillRect(x + 1, y, w - 2, h - 1);
  ctx.fillStyle = EDGE;
  ctx.fillRect(x + 1, y, w - 2, 1);
  drawText(ctx, 'ON YOUR SHIP', x + 6, y + 4, DIM);
  if (!f.place) {
    drawText(ctx, 'NO WAY TO FIT IT', x + w - 6, y + 4, RED, { align: 'right' });
    return;
  }
  const where = f.swap ? `FOR ${partById(f.swap.id).name.toUpperCase()}` : 'FREE SOCKET';
  const ww = textWidth(where);
  drawText(ctx, ww > w - 90 ? (f.swap ? 'SWAP' : 'FITS') : where, x + w - 6, y + 4, f.swap ? '#ff9a6a' : GREEN, { align: 'right' });
  const fr = frameById(b.frame);
  const cols = fr.grid[0].length;
  const rows = fr.grid.length;
  const cell = Math.max(5, Math.min(8, Math.floor((h - 18) / rows)));
  fitSchematic(ctx, b, f, x + 7, y + 15, cell, tier, t);
  const dx = x + 7 + cols * cell + 8;
  let dy = y + 15;
  const room = Math.floor((h - 17) / 9);
  const items: [string, string, string?, boolean?][] = [];
  for (const d of f.deltas) items.push([d.label, d.from ? `${d.from}→${d.to}` : d.to, d.good ? GREEN : RED]);
  if (f.wakes.length) items.splice(1, 0, ['WAKES', f.wakes[0], GOLD]);
  if (f.state) items.splice(Math.min(2, items.length), 0, ['', f.state.text, f.state.good ? GREEN : '#ff9a8a', true]);
  if (!items.length) items.push(['', 'NO CHANGE TO SPEAK OF', DIM, true]);
  const avail = x + w - 6 - dx;
  for (const [label, val, col, whole] of items.slice(0, room)) {
    if (whole) {
      const s = val.length * 6 > avail ? val.slice(0, Math.floor(avail / 6)) : val;
      drawText(ctx, s, dx, dy, col);
    } else {
      drawText(ctx, label, dx, dy, DIM);
      // too long beside its label (NIMBLE→STEADY): just where it ends up
      const v = textWidth(label) + textWidth(val) + 6 > avail && val.includes('→') ? `→${val.split('→').pop()}` : val;
      drawText(ctx, v, x + w - 6, dy, col, { align: 'right' });
    }
    dy += 9;
  }
}

/** The back of a card, before it turns over: its tier's colours, and a mark. */
export function cardBack(ctx: CanvasRenderingContext2D, tier: Tier, x: number, y: number, w: number, h: number, t: number) {
  const tc = TIER_COLOR[tier];
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = TIER_DARK[tier];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let j = y + 2; j < y + h - 2; j += 4) for (let k = x + 2 + ((j >> 2) % 2) * 2; k < x + w - 2; k += 4) ctx.fillRect(k, j, 2, 2);
  ctx.fillStyle = tc;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillRect(x + 3, y + 3, w - 6, 1);
  ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  if (w > 24) drawText(ctx, '◆', x + w / 2, y + h / 2 - 10, tc, { scale: 3, align: 'center' });
  if (tier === 'legendary' || tier === 'epic') glint(ctx, x, y, w, h, t, 1.2);
}
