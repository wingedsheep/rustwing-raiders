/**
 * A pad's face button as the pad draws it: the PlayStation's shapes in their colours, the Xbox's
 * lettered discs. Shared by the kit tray and the menus' button hints.
 */

import { disc, ring } from './core-icon';
import { drawText } from './font';

const KEY = '#0a0610';
const PS: Record<string, string> = { TRIANGLE: '#40e0b0', CIRCLE: '#ff6a7a', CROSS: '#8ab4ff', SQUARE: '#ff9ad8' };
const XB: Record<string, string> = { A: '#6ad05a', B: '#ff5a4a', X: '#4a9aff', Y: '#ffd04a' };

/** Whether `b` (a button's printed name) is a face button with a glyph of its own. */
export const isFace = (b: string, xbox = true) => b in PS || (xbox && b in XB);

/**
 * A face button centred on (cx, cy): 13 across with its outline, or 15 when `big` (beside a menu's
 * keycaps). Unlit, its mark goes dim.
 */
export function faceGlyph(ctx: CanvasRenderingContext2D, b: string, cx: number, cy: number, lit = true, big = false) {
  const dimmed = (c: string) => (lit ? c : '#5a4e6a');
  const r = big ? 7 : 6;
  // the mark's half-size
  const m = big ? 3 : 2;
  if (PS[b]) {
    disc(ctx, cx, cy, r, KEY);
    disc(ctx, cx, cy, r - 1, big ? '#33283f' : '#2a2036');
    ring(ctx, cx, cy, r - 1, big ? '#5a4a6e' : '#4a3c5c', 0.6, 1.1);
    ctx.fillStyle = dimmed(PS[b]);
    const px = (dx: number, dy: number) => ctx.fillRect(cx + dx, cy + dy, 1, 1);
    if (b === 'SQUARE') {
      ctx.fillRect(cx - m, cy - m, 2 * m + 1, 1);
      ctx.fillRect(cx - m, cy + m, 2 * m + 1, 1);
      ctx.fillRect(cx - m, cy - m + 1, 1, 2 * m - 1);
      ctx.fillRect(cx + m, cy - m + 1, 1, 2 * m - 1);
    } else if (b === 'CIRCLE') ring(ctx, cx, cy, m + 0.2, dimmed(PS[b]));
    else if (b === 'CROSS') for (let k = -m; k <= m; k++) (px(k, k), px(k, -k));
    else {
      // a triangle's sides up from its foot, to a point
      for (let k = 0; k < m + 1; k++) (px(-k, k - m), px(k, k - m));
      ctx.fillRect(cx - m - 1, cy + 1, 2 * m + 3, 1);
    }
    return;
  }
  disc(ctx, cx, cy, r, KEY);
  disc(ctx, cx, cy, r - 1, dimmed(XB[b]));
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(cx - 2, cy - r + 1, 5, 1);
  drawText(ctx, b, cx - 2, cy - 3, '#1a1020', { shadow: false });
}
