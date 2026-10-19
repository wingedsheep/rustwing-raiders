/**
 * Bits the menu screens share: part cards, button hints that name the right buttons for the
 * device, hearts, the hatched backdrop.
 */

import { EDGES, LOAD, LOAD_CLASS, partById, type PartDef, type Rarity } from '../game/parts';
import type { Stats } from '../sim/build';
import type { Tier } from '../game/loot';
import { markNames, tagMarks } from '../sim/marks';
import { input, type DeviceId } from '../input';
import { drawText, textWidth, wrap } from './font';
import { CLASS_COLOR, DARK, DIM, EDGE, GOLD, H, INK, PANEL, RED, W, frame } from './hud';

export const RARITY_COLOR: Record<Rarity, string> = { common: '#a8a0b8', rare: '#6ad0ff', epic: '#ffb04a' };

/** An item's tier: its colour, a dark of it for fills, and a faint tint for a card's body. */
export const TIER_COLOR: Record<Tier, string> = { common: '#b8b0c8', rare: '#5ab8ff', epic: '#c27aff', legendary: '#ffb03a' };
export const TIER_DARK: Record<Tier, string> = { common: '#2e2a3a', rare: '#16304c', epic: '#33194e', legendary: '#4e2c0c' };
export const TIER_BODY: Record<Tier, string> = { common: '#1c1526', rare: '#151a2c', epic: '#1d1430', legendary: '#21181a' };

/** A number for a card: whole when it's big, a decimal when it isn't. */
export const num = (n: number) => (Math.abs(n) >= 10 || Number.isInteger(n) ? `${Math.round(n)}` : n.toFixed(1).replace(/\.0$/, ''));

/** The hatched hull-plate backdrop the side panels have, over a rectangle. */
export function backdrop(ctx: CanvasRenderingContext2D, x = 0, y = 0, w = W, h = H) {
  ctx.fillStyle = '#0f0b16';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#16101f';
  for (let j = y; j < y + h; j += 2) for (let k = (j % 6) - 6; k < w; k += 6) if (k >= 0) ctx.fillRect(x + k, j, 1, 1);
}

/** What a part does, in a few words. */
export function partStats(def: PartDef): string[] {
  const out: string[] = [];
  const g = def.gun;
  if (g) {
    const dps = g.damage * g.count * g.rate;
    if (g.heavy) {
      out.push(`DMG ${num(g.damage)}${g.count > 1 ? `×${g.count}` : ''}  ${g.heavy} ROUNDS  RELOAD ${num(1 / g.rate)}S${g.pierce && g.pierce < 99 ? `  PIERCE ${g.pierce}` : ''}`);
      out.push(`EDGE: ${EDGES[g.edge].text}`);
      out.push('HEAVY BUTTON: A ROUND A PRESS');
    } else {
      out.push(`DMG ${num(g.damage)}${g.count > 1 ? `×${g.count}` : ''}  RATE ${num(g.rate)}${g.pierce && g.pierce < 99 ? `  PIERCE ${g.pierce}` : ''}`);
      out.push(`EDGE: ${EDGES[g.edge].text}`);
      out.push(`DPS ${Math.round(dps)}  HEAT ${Math.round(g.heat * 100)}`);
    }
    const m = markNames(tagMarks(def.tags));
    if (m) out.push(`MARKS: ${m}`);
  }
  if (def.carry) out.push(`CARRIES +${num(def.carry)} LOAD`);
  if (def.thrust) out.push(`THRUST +${num(def.thrust)}  CARRIES +${num(def.thrust * LOAD.engine)}`);
  if (def.grip) out.push(`GRIP ${def.grip > 0 ? '+' : ''}${def.grip}`);
  if (def.dash) out.push(`DASH +${def.dash}`);
  if (def.hp) out.push(`HULL +${def.hp}`);
  if (def.shield) out.push(`SHIELD +${def.shield}`);
  if (def.magnet) out.push(`MAGNET +${def.magnet}`);
  if (def.graze) out.push(`GRAZE +${def.graze}`);
  if (def.boost) {
    const b = def.boost;
    const bits = [
      b.damage && `DMG +${Math.round(b.damage * 100)}%`,
      b.rate && !b.rounds && `RATE +${Math.round(b.rate * 100)}%`,
      b.cool && 'COOLER',
      b.homing && 'HOMING',
      b.burst && 'BURST',
      b.mark && `MARK ${b.mark.toUpperCase()}`,
      b.flaw && 'CRIT MARKED',
      b.hone && 'EDGES ×3',
      b.rounds && `HEAVIES +${b.rounds} ROUND, RELOAD +${Math.round((b.rate ?? 0) * 100)}%`,
    ].filter(Boolean);
    out.push(`TOUCHING GUNS: ${bits.join(' ')}`);
  }
  if (def.drone) out.push('A DRONE COPIES A GUN');
  if (def.special) out.push(`SPECIAL: ${def.special.toUpperCase()}`);
  if (def.aux) out.push(`AUX: ${def.aux.toUpperCase()}`);
  if (def.mod) out.push(`DASH MOD${def.mod.ram ? ` RAM ${def.mod.ram}` : ''}${def.mod.blink ? ` BLINK ${def.mod.blink}` : ''}${def.mod.mines ? ` MINES ${def.mod.mines}` : ''}${def.mod.ghost ? ' AFTERIMAGE' : ''}${def.mod.refill ? ' REFILL' : ''}${def.mod.detonate ? ' DETONATE MARKS' : ''}${def.mod.strike ? ' STRIKE +100%' : ''}`);
  if (def.conduit) out.push('CONDUIT: RELAYS LINKS');
  if (def.link) out.push(`${def.link.need ? 'NEEDS' : 'LINK +50%:'} ${def.link.text}`);
  out.push(`LOAD ${num(def.mass)}  ${def.power < 0 ? `POWER +${num(-def.power)}` : def.power > 0 ? `DRAW ${num(def.power)}` : 'NO POWER'}`);
  return out;
}

/**
 * The ship's load as a gauge: the NIMBLE stretch tinted, a notch where it ends and one where the
 * ship is full, the OVERLOADED stretch past it in red. `after` (a move being weighed) shows as a
 * ghost: what it would add, or what it would free. Its class is named above, on the right.
 */
export function loadGauge(ctx: CanvasRenderingContext2D, s: Stats, after: Stats | null, x: number, y: number, w: number, t = 0) {
  const span = s.capacity * 1.35;
  const px = (v: number) => Math.round((Math.min(v, span) / span) * w);
  const nim = px(s.capacity * LOAD.nimble);
  const cap = px(s.capacity);
  const now = LOAD_CLASS[s.loadClass];
  const then = after && after.loadClass !== s.loadClass ? LOAD_CLASS[after.loadClass] : null;
  drawText(ctx, 'LOAD', x, y, DIM);
  drawText(ctx, `${num(s.load)}${after && Math.abs(after.load - s.load) > 1e-3 ? `→${num(after.load)}` : ''}/${num(s.capacity)}`, x + 28, y, after && after.load > s.load + 1e-3 ? '#ffc0a0' : after && after.load < s.load - 1e-3 ? '#a0ffd0' : INK);
  if (then) {
    const blink = Math.floor(t * 4) % 2 === 0;
    const tw = drawText(ctx, then.name, x + w, y, blink ? then.color : '#ffffff', { align: 'right' });
    drawText(ctx, '→', x + w - tw - 2, y, DIM, { align: 'right' });
    drawText(ctx, now.name, x + w - tw - 12, y, now.color, { align: 'right' });
  } else drawText(ctx, now.name, x + w, y, now.color, { align: 'right' });
  const by = y + 10;
  // the track: nimble, steady, overloaded
  ctx.fillStyle = '#0c0a14';
  ctx.fillRect(x - 1, by - 1, w + 2, 7);
  ctx.fillStyle = '#163a36';
  ctx.fillRect(x, by, nim, 5);
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(x + nim, by, cap - nim, 5);
  ctx.fillStyle = '#3a1820';
  ctx.fillRect(x + cap, by, w - cap, 5);
  // the load, and a move's ghost on top
  const fill = (v: number) => (v <= s.capacity * LOAD.nimble ? LOAD_CLASS.nimble.color : v <= s.capacity ? '#e8dcc0' : LOAD_CLASS.overloaded.color);
  const a = px(s.load);
  ctx.fillStyle = fill(s.load);
  ctx.fillRect(x, by + 1, a, 3);
  if (after && Math.abs(after.load - s.load) > 1e-3) {
    const b = px(after.load);
    ctx.fillStyle = after.load > s.load ? '#ff8a6a' : '#0c0a14';
    ctx.globalAlpha = after.load > s.load ? (Math.floor(t * 6) % 2 ? 0.95 : 0.6) : 0.7;
    ctx.fillRect(x + Math.min(a, b), by + 1, Math.abs(b - a), 3);
    ctx.globalAlpha = 1;
  }
  // the notches
  ctx.fillStyle = '#8affe0';
  ctx.fillRect(x + nim, by - 2, 1, 9);
  ctx.fillStyle = RED;
  ctx.fillRect(x + cap, by - 2, 1, 9);
  // what the class does, under it
  const c = then ?? now;
  drawText(ctx, c.text, x, by + 8, then ? c.color : '#7a6e88');
}

/** A part's shape, drawn as little cells. */
export function shapeIcon(ctx: CanvasRenderingContext2D, def: PartDef, x: number, y: number, cell = 5, turned = false) {
  ctx.fillStyle = CLASS_COLOR[def.cls];
  for (const [c, r] of def.shape) {
    const [cc, rr] = turned ? [r, c] : [c, r];
    ctx.fillRect(x + cc * cell, y + rr * cell, cell - 1, cell - 1);
  }
}

/** A card for a part: name, class, rarity, shape, what it does. Returns its height. */
export function partCard(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, on: boolean, opts: { compact?: boolean; price?: number; afford?: boolean } = {}) {
  const def = partById(id);
  const stats = partStats(def);
  const text = opts.compact ? [] : wrap(def.text, w - 12);
  const h = 26 + stats.length * 9 + (text.length ? text.length * 9 + 4 : 0);
  frame(ctx, x, y, w, h, on ? '#2c2240' : PANEL, on ? GOLD : EDGE);
  shapeIcon(ctx, def, x + 6, y + 6);
  drawText(ctx, def.name, x + 22, y + 5, on ? INK : '#d8cce8');
  drawText(ctx, `${def.rarity} ${def.cls}`, x + 22, y + 14, RARITY_COLOR[def.rarity]);
  if (def.tags.length) drawText(ctx, def.tags.join(' '), x + w - 6, y + 14, '#c8b0ff', { align: 'right' });
  if (opts.price !== undefined) drawText(ctx, `${opts.price}`, x + w - 6, y + 5, opts.afford ? GOLD : RED, { align: 'right' });
  let ty = y + 25;
  for (const s of stats) {
    drawText(ctx, s, x + 6, ty, '#b8acc8');
    ty += 9;
  }
  if (text.length) {
    ty += 3;
    for (const l of text) {
      drawText(ctx, l, x + 6, ty, DIM);
      ty += 9;
    }
  }
  if (on) {
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 4, y + 4, 2, h - 8);
  }
  return h;
}

export type Action = 'confirm' | 'back' | 'alt' | 'prev' | 'next' | 'start' | 'move';

/** The button for an action on a device, as printed on it. */
export function button(dev: DeviceId, a: Action): string {
  if (dev.startsWith('pad')) {
    const ps = input.padName(dev) === 'PS PAD';
    const names: Record<Action, string> = ps
      ? { confirm: 'CROSS', back: 'CIRCLE', alt: 'TRIANGLE', prev: 'L1', next: 'R1', start: 'OPTIONS', move: 'STICK' }
      : { confirm: 'A', back: 'B', alt: 'Y', prev: 'LB', next: 'RB', start: 'MENU', move: 'STICK' };
    return names[a];
  }
  const names: Record<string, Record<Action, string>> = {
    keys: { confirm: 'ENTER', back: 'ESC', alt: 'R', prev: 'Q', next: 'E', start: 'P', move: 'ARROWS' },
    'keys-left': { confirm: 'SPACE', back: 'LSHIFT', alt: 'E', prev: 'Z', next: 'X', start: 'ESC', move: 'WASD' },
    'keys-right': { confirm: '/', back: 'RSHIFT', alt: '.', prev: ',', next: "'", start: 'P', move: 'ARROWS' },
  };
  return names[dev][a];
}

export type FlightAction = 'fire' | 'dash' | 'boost' | 'special' | 'aux' | 'focus';

/** The button for a flight control on a device, as printed on it (see input.ts). */
export function flightButton(dev: DeviceId, a: FlightAction): string {
  if (dev.startsWith('pad')) {
    const ps = input.padName(dev) === 'PS PAD';
    const names: Record<FlightAction, string> = ps
      ? { fire: 'CROSS', dash: 'CIRCLE', boost: 'R2', special: 'TRIANGLE', aux: 'L1', focus: 'L2' }
      : { fire: 'A', dash: 'B', boost: 'RT', special: 'Y', aux: 'LB', focus: 'LT' };
    return names[a];
  }
  const names: Record<string, Record<FlightAction, string>> = {
    keys: { fire: 'J', dash: 'K', boost: 'L', special: 'I', aux: 'U', focus: 'SHIFT' },
    'keys-left': { fire: 'SPACE', dash: 'LSHIFT', boost: 'F', special: 'E', aux: 'R', focus: 'Q' },
    'keys-right': { fire: '/', dash: 'RSHIFT', boost: '.', special: 'ENTER', aux: "'", focus: 'RCTRL' },
  };
  return names[dev][a];
}

/** A row of "[BUTTON] WHAT" hints, centred or from the left. Returns its width. */
export function hints(ctx: CanvasRenderingContext2D, dev: DeviceId, items: [Action, string][], x: number, y: number, align: 'left' | 'center' | 'right' = 'left') {
  const parts = items.map(([a, t]) => [button(dev, a), t] as const);
  const w = parts.reduce((s, [b, t]) => s + textWidth(b) + 6 + textWidth(t) + 12, -12);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  cx = Math.round(cx);
  for (const [b, t] of parts) {
    const bw = textWidth(b) + 4;
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(cx - 2, y - 2, bw, 11);
    ctx.fillStyle = DARK;
    ctx.fillRect(cx - 2, y + 9, bw, 1);
    drawText(ctx, b, cx, y, INK, { shadow: false });
    cx += bw + 4;
    drawText(ctx, t, cx, y, DIM);
    cx += textWidth(t) + 12;
  }
  return w;
}

/** Hull as hearts. */
export function hearts(ctx: CanvasRenderingContext2D, hull: number, max: number, x: number, y: number, per = 12) {
  for (let i = 0; i < max; i++) drawText(ctx, '♥', x + (i % per) * 9, y + Math.floor(i / per) * 9, i < hull ? RED : '#3a2e48');
}

/** A big title across the top of a screen, with a rule under it. */
export function heading(ctx: CanvasRenderingContext2D, text: string, sub: string, color = INK) {
  drawText(ctx, text, W / 2, 12, color, { scale: 2, align: 'center' });
  if (sub) drawText(ctx, sub, W / 2, 32, DIM, { align: 'center' });
  ctx.fillStyle = EDGE;
  ctx.fillRect(40, 44, W - 80, 1);
}

/** A hauler from above, seven texels long, its engines lit (crossed out in red, if it was lost). */
export function haulerIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, lost = false) {
  const rows = ['01110', '11111', '10101', '11111', '10101', '11111', '01010'];
  ctx.fillStyle = '#120c18';
  ctx.fillRect(x - 1, y - 1, 7, 9);
  rows.forEach((row, r) => {
    for (let c = 0; c < 5; c++) {
      if (row[c] !== '1') continue;
      ctx.fillStyle = lost ? '#4a3a52' : r === 6 ? '#ffd890' : color;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  });
  if (!lost) return;
  ctx.fillStyle = '#ff5a4a';
  for (let k = 0; k < 7; k++) {
    const d = Math.round((k * 4) / 6);
    ctx.fillRect(x + d, y + k, 1, 1);
    ctx.fillRect(x + 4 - d, y + k, 1, 1);
  }
}

/** A heist's strongbox from above, on its drogue: seven texels tall (crossed out in red, if it was lost). */
export function strongboxIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, lost = false) {
  const rows = ['01110', '10001', '01010', '00100', '11111', '1G1G1', '11111'];
  ctx.fillStyle = '#120c18';
  ctx.fillRect(x - 1, y - 1, 7, 9);
  rows.forEach((row, r) => {
    for (let c = 0; c < 5; c++) {
      if (row[c] === '0') continue;
      ctx.fillStyle = lost ? '#4a3a52' : row[c] === 'G' ? '#ffd060' : r < 4 ? color : '#d8a43a';
      ctx.fillRect(x + c, y + r, 1, 1);
    }
  });
  if (!lost) return;
  ctx.fillStyle = '#ff5a4a';
  for (let k = 0; k < 7; k++) {
    const d = Math.round((k * 4) / 6);
    ctx.fillRect(x + d, y + k, 1, 1);
    ctx.fillRect(x + 4 - d, y + k, 1, 1);
  }
}
