/**
 * Chips: what a choice costs and pays, as a little pixel icon and a few words in a pill, coloured
 * by whether it's good for you, bad, just so, or a gamble. Read at a glance, so every choice's
 * price is in plain sight (docs/style-and-characters.md §4).
 */

import type { Chip, ChipIcon, Tone, When } from '../sim/events';
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
  none: ['.......', '..###..', '.#...#.', '.#...#.', '.#...#.', '..###..', '.......'],
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
  // (nothing at all is said quietly)
  const quiet = c.icon === 'none';
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = quiet ? 'rgba(60,50,74,0.45)' : TONE_BACK[c.tone];
  ctx.fillRect(x + 1, y, w - 2, CHIP_H);
  ctx.fillRect(x, y + 1, w, CHIP_H - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 1, y, w - 2, 1);
  const ink = quiet ? '#8a7e9a' : TONE_INK[c.tone];
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

/** A game's grades, and a gamble's two ways, as the badge at the head of their row. */
export const WHEN_INK: Record<When, string> = { fail: '#ff7a6a', pass: '#ffb04a', a: '#8affb0', s: '#ffd04a', win: '#8affb0', lose: '#ff7a6a' };
const WHEN_WORD: Record<When, string> = { fail: 'F', pass: 'C+', a: 'A+', s: 'S', win: 'WIN', lose: 'LOSE' };
/** Rows in the order they're read: what's sure, then best to worst. */
const ORDER: (When | undefined)[] = [undefined, 's', 'a', 'pass', 'win', 'lose', 'fail'];
const BADGE_W = 22;

/** A row's badge: the grade, or a gamble's odds that way (`66%`). Returns its width, gap included. */
function badge(ctx: CanvasRenderingContext2D | null, when: When, x: number, y: number, odds: number | undefined, dim: boolean) {
  const ink = WHEN_INK[when];
  const word = odds === undefined || (when !== 'win' && when !== 'lose') ? WHEN_WORD[when] : `${Math.round((when === 'win' ? odds : 1 - odds) * 100)}%`;
  const w = Math.max(BADGE_W, textWidth(word) + 7);
  if (!ctx) return w;
  ctx.globalAlpha = dim ? 0.45 : 1;
  ctx.fillStyle = '#0c0912';
  ctx.fillRect(x, y, w - 3, CHIP_H);
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, 1, CHIP_H);
  drawText(ctx, word, x + 2 + Math.round((w - 5 - textWidth(word)) / 2), y + 2, ink, { shadow: false });
  ctx.globalAlpha = 1;
  return w;
}

/** Chips split by when they come true, best first. */
export function outcomeGroups(cs: Chip[]) {
  return ORDER.map((when) => ({ when, chips: cs.filter((c) => c.on === when) })).filter((g) => g.chips.length);
}

/**
 * Every outcome of a choice: the sure chips first, then a row for each grade or each way a gamble
 * falls, a badge at its head. `stacked`: a row each; else they flow on, a badge before each group
 * (for a choice not in focus, short of room). `odds` puts a gamble's chances in its badges.
 * Returns the height used.
 */
export function outcomeRows(ctx: CanvasRenderingContext2D | null, cs: Chip[], x: number, y: number, w: number, o: { dim?: boolean; stacked?: boolean; odds?: number } = {}) {
  const groups = outcomeGroups(cs);
  if (!groups.length) return 0;
  let cx = x;
  let cy = y;
  let first = true;
  for (const g of groups) {
    const lead = g.when ? badge(null, g.when, 0, 0, o.odds, false) : 0;
    // a new row for each group when stacked, or when even its first chip won't fit after the badge
    if (!first && (o.stacked || cx + lead + chipWidth(g.chips[0]) > x + w)) {
      cx = x;
      cy += CHIP_H + 2;
    }
    first = false;
    if (g.when) {
      badge(ctx, g.when, cx, cy, o.odds, !!o.dim);
      cx += lead;
    }
    const rowX = o.stacked ? cx : x;
    g.chips.forEach((c, k) => {
      const cw = chipWidth(c);
      if (k > 0 && cx + cw > x + w) {
        cx = rowX;
        cy += CHIP_H + 2;
      }
      if (ctx) chip(ctx, c, cx, cy, o.dim);
      cx += cw + 3;
    });
    cx += 3;
  }
  return cy - y + CHIP_H;
}

/** The grades as the results card stamps them, in a line: what a game's badges mean. */
export function gradeKey(ctx: CanvasRenderingContext2D, x: number, y: number, short = false) {
  const bits: [string, string][] = [['F', short ? '<25%' : 'UNDER 25%'], ['C', '25%'], ['A', '55%'], ['S', '85%']];
  const inks = [WHEN_INK.fail, WHEN_INK.pass, WHEN_INK.a, WHEN_INK.s];
  let cx = Math.round(x);
  if (!short) cx += drawText(ctx, 'GRADES', cx, y, '#8a7e9a') + 8;
  bits.forEach(([l, t], k) => {
    cx += drawText(ctx, l, cx, y, inks[k]) + (short ? 2 : 4);
    cx += drawText(ctx, t, cx, y, '#8a7e9a') + (short ? 8 : 12);
  });
}
