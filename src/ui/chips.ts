/**
 * Chips: what a choice costs and pays, as a little pixel icon and a few words in a pill, coloured
 * by whether it's good for you, bad, just so, or a gamble. Read at a glance, so every choice's
 * price is in plain sight (docs/style-and-characters.md §4).
 */

import type { Chip, ChipIcon, Tone } from '../sim/events';
import { drawText, textWidth } from './font';

export const TONE_INK: Record<Tone, string> = { good: '#8affb0', bad: '#ff7a6a', info: '#8affe0', risk: '#ffb04a' };
const TONE_BACK: Record<Tone, string> = { good: 'rgba(40,90,60,0.55)', bad: 'rgba(110,30,30,0.55)', info: 'rgba(30,80,90,0.5)', risk: 'rgba(110,70,20,0.55)' };

/** 7×7 icons, a row a string, '#' lit and '+' a highlight. */
const ICON: Record<ChipIcon, string[]> = {
  scrap: ['.+###..', '+#####.', '##.#.##', '###.###', '##.#.##', '.#####.', '..###..'],
  fuel: ['...#...', '..###..', '.##+##.', '###+###', '.#####.', '..###..', '...#...'],
  hull: ['#######', '#+####+', '#######', '#######', '.#####.', '..###..', '...#...'],
  part: ['..###..', '.#+#+#.', '#######', '.#####.', '..###..', '...#...', '.......'],
  bounty: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#.#.#.', '.......'],
  rep: ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'],
  fight: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  chart: ['.......', '.#####.', '#..#..#', '#.###.#', '#..#..#', '.#####.', '.......'],
  sweep: ['#######', '.#####.', '..###..', '...#...', '..#+#..', '.#+++#.', '#######'],
  favour: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...', '.......'],
  debt: ['.#####.', '#.....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '.#####.'],
  crew: ['..###..', '..###..', '...#...', '.#####.', '#.###.#', '..#.#..', '..#.#..'],
  core: ['..###..', '.#+++#.', '#++#++#', '#+###+#', '#++#++#', '.#+++#.', '..###..'],
  risk: ['#######', '#+...+#', '#.....#', '#..+..#', '#.....#', '#+...+#', '#######'],
};

/** The colour an icon is drawn in, whatever the chip's tone (scrap is always gold). */
const ICON_INK: Partial<Record<ChipIcon, string>> = { scrap: '#ffd04a', fuel: '#ffb04a', core: '#8affe0', favour: '#c8a0ff' };

export function chipIcon(ctx: CanvasRenderingContext2D, icon: ChipIcon, x: number, y: number, color: string) {
  const rows = ICON[icon];
  for (let r = 0; r < 7; r++)
    for (let k = 0; k < 7; k++) {
      const ch = rows[r][k];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '+' ? '#ffffff' : color;
      ctx.globalAlpha = ch === '+' ? 0.75 : 1;
      ctx.fillRect(x + k, y + r, 1, 1);
    }
  ctx.globalAlpha = 1;
}

export const chipWidth = (c: Chip) => 7 + 3 + textWidth(c.text) + 6;
export const CHIP_H = 11;

/** One chip at (x, y), its top-left; returns its width. `dim` for a choice you can't take. */
export function chip(ctx: CanvasRenderingContext2D, c: Chip, x: number, y: number, dim = false) {
  const w = chipWidth(c);
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = TONE_BACK[c.tone];
  ctx.fillRect(x + 1, y, w - 2, CHIP_H);
  ctx.fillRect(x, y + 1, w, CHIP_H - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 1, y, w - 2, 1);
  const ink = TONE_INK[c.tone];
  chipIcon(ctx, c.icon, x + 3, y + 2, ICON_INK[c.icon] ?? ink);
  drawText(ctx, c.text, x + 13, y + 2, ink, { shadow: false });
  ctx.globalAlpha = 1;
  return w;
}

/** Chips in rows, wrapping at `w`; returns the height used. */
export function chipRows(ctx: CanvasRenderingContext2D | null, cs: Chip[], x: number, y: number, w: number, dim = false) {
  let cx = x;
  let cy = y;
  for (const c of cs) {
    const cw = chipWidth(c);
    if (cx > x && cx + cw > x + w) {
      cx = x;
      cy += CHIP_H + 2;
    }
    if (ctx) chip(ctx, c, cx, cy, dim);
    cx += cw + 3;
  }
  return cs.length ? cy - y + CHIP_H : 0;
}
