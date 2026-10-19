/**
 * The marks' look, shared by the flight view (pips over a marked enemy), the cards and the hangar:
 * a colour each and a little pixel icon each, a different shape for each (a flame, a bolt, a
 * cracked diamond) so they read without the colour too.
 */

import type { MarkKind } from '../game/parts';
import type { ReactionKind } from '../sim/marks';

export const MARK_COLOR: Record<MarkKind, string> = { burn: '#ff7a2a', shock: '#b48aff', crack: '#ffd04a' };
export const MARK_HEX: Record<MarkKind, number> = { burn: 0xff7a2a, shock: 0xb48aff, crack: 0xffd04a };
export const REACTION_COLOR: Record<ReactionKind, string> = { overload: '#ff8ae0', cookoff: '#ffa83a', shatter: '#bff0ff' };
export const REACTION_HEX: Record<ReactionKind, number> = { overload: 0xff8ae0, cookoff: 0xffa83a, shatter: 0xbff0ff };

/** 9 × 9: '#' the mark's colour, 'o' a hot core (light), 'x' ink. */
const ART: Record<MarkKind, string[]> = {
  burn: [
    '....#....',
    '...##....',
    '...###.#.',
    '..####.#.',
    '.#######.',
    '.###o###.',
    '.##ooo##.',
    '..#ooo#..',
    '...###...',
  ],
  shock: [
    '.....###.',
    '....###..',
    '...###...',
    '..######.',
    '.....##..',
    '....##...',
    '...#o....',
    '..#o.....',
    '.#.......',
  ],
  crack: [
    '....#....',
    '...##x...',
    '..###x#..',
    '.###x###.',
    '###x####.',
    '.###x##..',
    '..##x#...',
    '...#x....',
    '....#....',
  ],
};

const CORE: Record<MarkKind, string> = { burn: '#ffe8a0', shock: '#f0e8ff', crack: '#fff8d8' };
const INK = '#120c18';

/**
 * A mark's icon at (x, y) (its top-left), `px` texels a pixel, with an ink outline round it.
 * `alpha` fades it (a mark running out).
 */
export function markIcon(ctx: CanvasRenderingContext2D, kind: MarkKind, x: number, y: number, px = 1, alpha = 1) {
  const art = ART[kind];
  ctx.globalAlpha = alpha;
  // the outline: the silhouette, a pixel out every way
  ctx.fillStyle = INK;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      if (art[r][c] === '.') continue;
      ctx.fillRect(x + (c - 1) * px, y + r * px, px * 3, px);
      ctx.fillRect(x + c * px, y + (r - 1) * px, px, px * 3);
    }
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const k = art[r][c];
      if (k === '.') continue;
      ctx.fillStyle = k === '#' ? MARK_COLOR[kind] : k === 'o' ? CORE[kind] : INK;
      ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  ctx.globalAlpha = 1;
}

/** Width of an icon with its outline, in texels at `px`. */
export const ICON_W = (px = 1) => 9 * px;
