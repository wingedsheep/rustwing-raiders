/**
 * Bits the menu screens share: part cards, button hints that name the right buttons for the
 * device, hearts, the hatched backdrop.
 */

import { partById, type PartDef, type Rarity } from '../game/parts';
import type { Tier } from '../game/loot';
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
    out.push(`DMG ${num(g.damage)}${g.count > 1 ? `×${g.count}` : ''}  RATE ${num(g.rate)}${g.pierce && g.pierce < 99 ? `  PIERCE ${g.pierce}` : ''}`);
    out.push(`DPS ${Math.round(dps)}  HEAT ${Math.round(g.heat * 100)}`);
  }
  if (def.thrust) out.push(`THRUST +${num(def.thrust)}`);
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
      b.rate && `RATE +${Math.round(b.rate * 100)}%`,
      b.cool && 'COOLER',
      b.homing && 'HOMING',
      b.burst && 'BURST',
    ].filter(Boolean);
    out.push(`TOUCHING GUNS: ${bits.join(' ')}`);
  }
  if (def.drone) out.push('A DRONE COPIES A GUN');
  if (def.special) out.push(`SPECIAL: ${def.special.toUpperCase()}`);
  if (def.aux) out.push(`AUX: ${def.aux.toUpperCase()}`);
  if (def.mod) out.push(`DASH MOD${def.mod.ram ? ` RAM ${def.mod.ram}` : ''}${def.mod.blink ? ` BLINK ${def.mod.blink}` : ''}${def.mod.mines ? ` MINES ${def.mod.mines}` : ''}${def.mod.ghost ? ' AFTERIMAGE' : ''}${def.mod.refill ? ' REFILL' : ''}`);
  if (def.conduit) out.push('CONDUIT: RELAYS LINKS');
  if (def.link) out.push(`${def.link.need ? 'NEEDS' : 'LINK +50%:'} ${def.link.text}`);
  out.push(`MASS ${num(def.mass)}  ${def.power < 0 ? `POWER +${num(-def.power)}` : def.power > 0 ? `DRAW ${num(def.power)}` : 'NO POWER'}`);
  return out;
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
