import type { Player } from '../sim/level';
import type { DeviceId } from '../input';
import { partById, type Verb } from '../game/parts';
import { VERB_COLOR } from './loot-card';
import { drawText, textWidth } from './font';
import { DARK, DIM, EDGE, INK, frame } from './hud';
import { flightButton, type FlightAction } from './widgets';

const SPECIAL_NAME = { bomb: 'BOMB', phase: 'PHASE', emp: 'EMP', overdrive: 'OVERDRIVE' } as const;
const AUX_NAME = { parry: 'PARRY', tether: 'TETHER', flare: 'FLARE', siphon: 'SIPHON' } as const;

/** The card's size, for laying two side by side. */
export const CONTROLS_W = 250;
export const CONTROLS_H = 116;

/**
 * A pilot's controls, as their device has them and their ship uses them: every button, what it
 * does, and what's on it now (the guns on the trigger, the heavies, the dash's mods, the special
 * and the aux). A button the ship has nothing on is drawn dim, so the card also says what's missing.
 */
export function controlsCard(ctx: CanvasRenderingContext2D, dev: DeviceId, p: Player, color: string, x: number, y: number) {
  frame(ctx, x, y, CONTROLS_W, CONTROLS_H, 'rgba(18,12,24,0.94)', EDGE);
  ctx.fillStyle = color;
  ctx.fillRect(x + 6, y + 5, 19, 11);
  drawText(ctx, `P${p.id + 1}`, x + 9, y + 7, DARK, { shadow: false });
  drawText(ctx, 'CONTROLS', x + 31, y + 7, INK);
  const s = p.stats;
  const names = (ids: string[]) => {
    const seen = new Map<string, number>();
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    return [...seen].map(([id, n]) => `${partById(id).name.toUpperCase()}${n > 1 ? ` ×${n}` : ''}`).join(', ');
  };
  const main = s.guns.filter((g) => !g.drone && !g.spec.heavy).map((g) => g.part.id);
  const heavy = s.guns.filter((g) => !g.drone && g.spec.heavy).map((g) => g.part.id);
  const mods = p.build.parts.map((q) => partById(q.id)).filter((d) => d.mod).map((d) => d.id);
  const rows: [FlightAction, string, string, Verb | null][] = [
    ['move', 'MOVE', '', null],
    ['fire', 'FIRE (HOLD)', names(main) || 'NO GUNS ON THE TRIGGER', 'GUN'],
    ['heavy', 'HEAVY', names(heavy) || 'NO HEAVY GUNS', 'HEAVY'],
    ['dash', `DASH ×${s.dashes}`, names(mods) || 'PLAIN', 'DASH MOD'],
    ['boost', 'BOOST (HOLD)', 'SPENDS BURN', null],
    ['special', 'SPECIAL', s.special ? SPECIAL_NAME[s.special] : 'NONE FITTED', 'SPECIAL'],
    ['aux', 'AUX', s.aux ? AUX_NAME[s.aux] : 'NONE FITTED', 'AUX'],
    ['focus', 'FOCUS (HOLD)', 'SLOW AND STEADY', null],
  ];
  rows.forEach(([a, what, on, verb], k) => {
    const ry = y + 22 + k * 11;
    const empty = /^(NO |NONE)/.test(on);
    const b = flightButton(dev, a);
    const bw = Math.max(11, textWidth(b) + 4);
    // the button as a key cap, right-aligned in its column so the actions line up
    const bx = x + 60 - bw;
    ctx.fillStyle = empty ? '#2a2236' : '#3a2e48';
    ctx.fillRect(bx, ry - 1, bw, 9);
    ctx.fillStyle = DARK;
    ctx.fillRect(bx, ry + 8, bw, 1);
    drawText(ctx, b, bx + Math.round((bw - textWidth(b)) / 2), ry, empty ? DIM : INK, { shadow: false });
    drawText(ctx, what, x + 66, ry, empty ? DIM : INK);
    if (!on) return;
    // what's on it, in the verb's colour, cut to fit
    let t = on;
    const room = CONTROLS_W - 148;
    while (textWidth(t) > room && t.length > 4) t = t.slice(0, -4) + '...';
    drawText(ctx, t, x + CONTROLS_W - 6, ry, empty ? '#5a4e68' : verb ? VERB_COLOR[verb] : '#a898c0', { align: 'right' });
  });
}
