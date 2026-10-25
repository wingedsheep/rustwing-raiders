/**
 * Bits the menu screens share: part cards, button hints that name the right buttons for the
 * device, hearts, the hatched backdrop.
 */

import { EDGES, HARDPOINTS, LOAD, LOAD_CLASS, hardpointOf, partById, type AuxKind, type PartDef, type Rarity } from '../game/parts';
import { BEACON, BULWARK, CARPET, CRYO, DRONES, WELL } from '../sim/kit';
import { BLOCK_MAX, CD_FLARE, CD_PARRY, CD_SIPHON, CD_TETHER, CD_WHIFF, FLARE_DMG, FLARE_LIFE, PARRY_WINDOW, RIPOSTE_TIME, SIPHON_PER, SIPHON_SLOW, SIPHON_TIME, TETHER_HIT, TETHER_RANGE } from '../sim/level';
import { HALF_H } from '../sim/types';
import { SHIELD_CELL, type Stats } from '../sim/build';
import type { Tier } from '../game/loot';
import { markNames, tagMarks } from '../sim/marks';
import { input, type DeviceId } from '../input';
import { drawText, textWidth, wrap } from './font';
import { faceGlyph, isFace } from './glyph';
import { CLASS_COLOR, DARK, DIM, EDGE, GOLD, H, INK, PANEL, RED, W, frame, hullBar } from './hud';

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

/** A reach in world units, as part of the screen (its height: EDGE_FAR's 24 is half of it). */
function reach(u: number) {
  const k = u / (HALF_H * 2);
  return k < 0.24 ? 'A FIFTH OF A SCREEN' : k < 0.29 ? 'A QUARTER SCREEN' : k < 0.4 ? 'A THIRD OF A SCREEN' : k < 0.7 ? 'HALF A SCREEN' : 'MOST OF THE SCREEN';
}

/** How long the special takes to fill on its own (the level's 0.012 a second); hits fill it faster. */
const CHARGE = `FILLS: ${Math.round(1 / 0.012)} S, FASTER ON HITS`;

/** What each aux does, in numbers (sim/level.ts, sim/kit.ts): short, a card's line is 28 letters. */
const AUX_LINES: Record<AuxKind, string[]> = {
  parry: [`PARRY ${num(PARRY_WINDOW)} S: GUNS CRIT ${num(RIPOSTE_TIME)} S`, `WAIT ${num(CD_PARRY)} S, ${num(CD_WHIFF)} S ON A MISS`, `LATE: BLOCKS ${BLOCK_MAX} SMALL SHOTS`],
  tether: [`HOOK ${reach(TETHER_RANGE)}: ${TETHER_HIT} DMG`, `COOLDOWN ${num(CD_TETHER)} S; KILLS RESET IT`, 'UNTOUCHABLE AS YOU REEL IN'],
  flare: [`AIMED FIRE CHASES IT ${num(FLARE_LIFE)} S`, `THEN IT BURSTS: ${FLARE_DMG} DMG`, `COOLDOWN ${num(CD_FLARE)} S`],
  siphon: [`DRINKS BULLETS FOR ${num(SIPHON_TIME)} S`, `EVERY ${SIPHON_PER}: A SHIELD CELL`, `COOLDOWN ${num(CD_SIPHON)} S  ${Math.round(SIPHON_SLOW * 100)}% SLOWER`],
  bulwark: [`HOLD UP TO ${num(BULWARK.hold)} S: STOPS ALL`, `LET GO: ${BULWARK.dmg} DMG +${num(BULWARK.each)} A BULLET`, `COOLDOWN ${num(BULWARK.cd)} S  ${Math.round(BULWARK.slow * 100)}% SLOWER`],
  beacon: [`SWAP PLACES WITHIN ${num(BEACON.life)} S`, `BURSTS ${BEACON.dmg} DMG, ${BEACON.each} A SHOT BACK`, `COOLDOWN ${num(BEACON.cd)} S`],
};

/** What each special does, in numbers (sim/level.ts specialGoes, sim/kit.ts). */
const SPECIAL_LINES: Record<NonNullable<PartDef['special']>, string[]> = {
  bomb: ['WIPES ALL BULLETS ON SCREEN', '90 DMG (BOSS 60)  SAFE 1.5 S', CHARGE],
  phase: ['UNTOUCHABLE 2.2 S', 'BULLETS, BODIES PASS THROUGH', CHARGE],
  emp: ['ERASES NEAR BULLETS, 15 DMG', 'STUNS MACHINES 3.5 S', CHARGE],
  overdrive: ['5 S: DOUBLE RATE, NO HEAT', 'RELOADS EVERY HEAVY', CHARGE],
  carpet: [`BOMBLETS BEHIND YOU ${num(CARPET.time)} S`, `${CARPET.dmg} DMG EACH, EATS BULLETS`, CHARGE],
  cryo: [`ALL FROZEN ${num(CRYO.time)} S, BULLETS TOO`, CHARGE],
  gravity: ['DRAGS ALL NEAR INTO A KNOT', `THEN FLINGS THEM: ${WELL.dmg} DMG`, CHARGE],
  drones: [`${DRONES.at.length} DRONES FOR ${num(DRONES.time)} S`, `COPY YOUR TRIGGER GUN AT ${Math.round(DRONES.dmg * 100)}%`, CHARGE],
};

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
  if (def.hullPct) out.push(`HULL +${Math.round(def.hullPct * 100)}%`);
  if (def.armor) out.push(`ARMOUR ${def.armor}: EVERY HIT -${def.armor}`);
  if (def.shield) out.push(`SHIELD +${def.shield * SHIELD_CELL}`);
  if (def.boost) {
    // in plain words, at the strength its rolls give it (an Edge Hone at 119% crits ×3.2)
    const b = def.boost;
    const k = (def as { potency?: number }).potency ?? 1;
    const pc = (v: number) => Math.round(v * k * 100);
    const bits = [
      b.damage && `+${pc(b.damage)}% DAMAGE`,
      b.rate && !b.rounds && `FIRE ${pc(b.rate)}% FASTER`,
      b.cool && `COOL ${num(1 + b.cool * k)}× FASTER`,
      b.mark && `HITS LEAVE ${b.mark.toUpperCase()}`,
      b.chill && 'HITS CHILL',
      b.flaw && 'CRIT ANYTHING MARKED',
      b.hone && `CRITS HIT ×${num(2 + k)}, NOT ×2`,
      b.rounds && `HEAVIES +${b.rounds} ROUND, RELOAD ${pc(b.rate ?? 0)}% FASTER`,
      b.share && 'CARRY EACH OTHER’S MARKS; THEIR REACTIONS JUMP ON',
      b.relay === 'echo' && 'A FREE VOLLEY ON A PERFECT OR TAKEDOWN',
      b.relay === 'graze' && 'HEAVIES: A ROUND EVERY 3 GRAZES',
      b.relay === 'ram' && 'WHAT YOU RAM TAKES THEIR MARKS',
      b.relay === 'catch' && 'CAUGHT SHOTS CARRY THEIR MARKS',
    ].filter(Boolean);
    out.push(`GUNS IT TOUCHES: ${bits.join(', ')}`);
  }
  if (def.special) out.push(...SPECIAL_LINES[def.special]);
  if (def.aux) out.push(...AUX_LINES[def.aux]);
  if (def.mod) out.push(`DASH MOD${def.mod.ram ? ` RAM ${def.mod.ram}` : ''}${def.mod.blink ? ` BLINK ${def.mod.blink}` : ''}${def.mod.mines ? ` MINES ${def.mod.mines}` : ''}${def.mod.ghost ? ' AFTERIMAGE' : ''}${def.mod.detonate ? ' DETONATE MARKS' : ''}${def.mod.strike ? ' STRIKE +100%' : ''}`);
  if (def.link) out.push(`${def.link.need ? 'NEEDS' : 'LINK +50%:'} ${def.link.text}`);
  const hp = hardpointOf(def);
  out.push(`LOAD ${num(def.mass)}${hp ? `  ${HARDPOINTS[hp].name} HARDPOINT` : ''}`);
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

export type Action = 'confirm' | 'back' | 'alt' | 'prev' | 'next' | 'start' | 'move' | 'info';

/** The button for an action on a device, as printed on it. */
export function button(dev: DeviceId, a: Action): string {
  dev = input.shown(dev);
  if (dev.startsWith('pad')) {
    const ps = input.padName(dev) === 'PS PAD';
    const names: Record<Action, string> = ps
      ? { confirm: 'CROSS', back: 'CIRCLE', alt: 'TRIANGLE', prev: 'L1', next: 'R1', start: 'OPTIONS', move: 'STICK', info: 'SHARE' }
      : { confirm: 'A', back: 'B', alt: 'Y', prev: 'LB', next: 'RB', start: 'MENU', move: 'STICK', info: 'VIEW' };
    return names[a];
  }
  const names: Record<string, Record<Action, string>> = {
    keys: { confirm: 'ENTER', back: 'ESC', alt: 'R', prev: 'Q', next: 'E', start: 'P', move: 'ARROWS', info: 'F' },
    'keys-left': { confirm: 'SPACE', back: 'LSHIFT', alt: 'E', prev: 'Z', next: 'X', start: 'ESC', move: 'WASD', info: 'C' },
    'keys-right': { confirm: '/', back: 'RSHIFT', alt: '.', prev: ',', next: "'", start: 'P', move: 'ARROWS', info: 'M' },
  };
  return names[dev][a];
}

export type FlightAction = 'move' | 'fire' | 'heavy' | 'dash' | 'boost' | 'special' | 'aux' | 'focus';

/** The button for a flight control on a device, as printed on it (see input.ts). */
export function flightButton(dev: DeviceId, a: FlightAction): string {
  dev = input.shown(dev);
  if (dev.startsWith('pad')) {
    const ps = input.padName(dev) === 'PS PAD';
    const names: Record<FlightAction, string> = ps
      ? { move: 'STICK', fire: 'R2', heavy: 'SQUARE', dash: 'CROSS', boost: 'L2', special: 'TRIANGLE', aux: 'CIRCLE', focus: 'L1' }
      : { move: 'STICK', fire: 'RT', heavy: 'X', dash: 'A', boost: 'LT', special: 'Y', aux: 'B', focus: 'LB' };
    return names[a];
  }
  const names: Record<string, Record<FlightAction, string>> = {
    keys: { move: 'WASD', fire: 'J', heavy: 'O', dash: 'K', boost: 'L', special: 'I', aux: 'U', focus: 'SHIFT' },
    'keys-left': { move: 'WASD', fire: 'SPACE', heavy: 'G', dash: 'LSHIFT', boost: 'F', special: 'E', aux: 'R', focus: 'Q' },
    'keys-right': { move: 'ARROWS', fire: '/', heavy: ';', dash: 'RSHIFT', boost: '.', special: 'ENTER', aux: "'", focus: 'RCTRL' },
  };
  return names[dev][a];
}

/** A hint: the action, what it does, and (to call it out) a colour for the words. */
export type Hint = [Action, string] | [Action, string, string];

/** How wide a row of hints is. */
export function hintsWidth(dev: DeviceId | DeviceId[], items: Hint[]) {
  const devs = Array.isArray(dev) ? dev : [dev];
  return items.reduce((s, [a, t]) => s + caps(devs, a).reduce((q, [b, pad]) => q + capWidth(b, pad) + 4, 0) + textWidth(t) + 12, -12);
}

/** Hints, in as few rows as fit `w` (in order: the first ones first). */
export function hintRows(dev: DeviceId | DeviceId[], items: Hint[], w: number): Hint[][] {
  const rows: Hint[][] = [];
  for (const it of items) {
    const last = rows[rows.length - 1];
    if (last && hintsWidth(dev, [...last, it]) <= w) last.push(it);
    else rows.push([it]);
  }
  return rows;
}

/** A row of "[BUTTON] WHAT" hints, centred or from the left. Returns its width. */
export function hints(ctx: CanvasRenderingContext2D, dev: DeviceId | DeviceId[], items: Hint[], x: number, y: number, align: 'left' | 'center' | 'right' = 'left') {
  // (several devices: each one's key, side by side, where they differ: co-op on a shared screen)
  const devs = Array.isArray(dev) ? dev : [dev];
  const parts = items.map(([a, t, col]) => [caps(devs, a), t, col ?? DIM] as const);
  const w = hintsWidth(devs, items);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  cx = Math.round(cx);
  for (const [bs, t, col] of parts) {
    for (const [b, pad] of bs) cx += keycap(ctx, b, cx, y, pad) + 4;
    drawText(ctx, t, cx, y, col);
    cx += textWidth(t) + 12;
  }
  return w;
}

/** An action's buttons on each device, where they differ, and whether each is a pad's. */
function caps(devs: DeviceId[], a: Action): [string, boolean][] {
  const out = new Map<string, boolean>();
  for (const d of devs) out.set(button(d, a), input.shown(d).startsWith('pad'));
  return [...out];
}

/** How wide a keycap is (a pad's face button is its glyph). */
export const capWidth = (b: string, pad = false) => (isFace(b, pad) ? 13 : textWidth(b) + 4);

/**
 * A keycap: rounded, lit along its top, a darker lip under it, a keyline round the lot; a pad's
 * face button drawn as on the pad (its shape or lettered disc). Returns its width.
 */
export function keycap(ctx: CanvasRenderingContext2D, b: string, x: number, y: number, pad = false) {
  if (isFace(b, pad)) {
    faceGlyph(ctx, b, x + 6, y + 4, true, true);
    return 13;
  }
  const bw = textWidth(b) + 4;
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 3, y - 2, bw + 2, 13);
  ctx.fillRect(x - 2, y - 3, bw, 15);
  ctx.fillStyle = '#2a2036';
  ctx.fillRect(x - 2, y + 8, bw, 2);
  ctx.fillStyle = '#4a3c5c';
  ctx.fillRect(x - 2, y - 2, bw, 10);
  ctx.fillStyle = '#6a5a80';
  ctx.fillRect(x - 1, y - 2, bw - 2, 1);
  drawText(ctx, b, x, y, INK, { shadow: false });
  return bw;
}

/** Hull as hearts. */
/** A ship's hull off the field: its notched bar, `w` wide, and the number after it. */
export function hullGauge(ctx: CanvasRenderingContext2D, hull: number, max: number, x: number, y: number, w = 48) {
  hullBar(ctx, x, y + 1, w, 6, hull, max);
  drawText(ctx, `${Math.round(hull)}`, x + w + 6, y, hull <= max * 0.25 ? RED : INK);
}

/** A big title across the top of a screen, with a rule under it. */
export function heading(ctx: CanvasRenderingContext2D, text: string, sub: string, color = INK) {
  drawText(ctx, text, W / 2, 12, color, { scale: 2, align: 'center' });
  if (sub) drawText(ctx, sub, W / 2, 32, DIM, { align: 'center' });
  // the rule fades out to both ends, a small diamond at its middle
  const g = ctx.createLinearGradient(40, 0, W - 40, 0);
  g.addColorStop(0, 'rgba(90,74,112,0)');
  g.addColorStop(0.5, 'rgba(120,100,148,1)');
  g.addColorStop(1, 'rgba(90,74,112,0)');
  ctx.fillStyle = g;
  ctx.fillRect(40, 44, W - 80, 1);
  ctx.fillStyle = DARK;
  ctx.fillRect(W / 2 - 3, 43, 7, 3);
  ctx.fillRect(W / 2 - 2, 42, 5, 5);
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - 1, 43, 3, 3);
  ctx.fillRect(W / 2, 42, 1, 5);
  ctx.fillRect(W / 2 - 2, 44, 5, 1);
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
