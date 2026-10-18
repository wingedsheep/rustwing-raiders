/**
 * Little games inside events: a stick (or d-pad, or arrows) and one button. Each takes ten to
 * thirty seconds and ends with a score, 0..1, that the event turns into what you get. Every one
 * has a careful and a bold version; the bold one is harder and pays about double.
 *
 * They draw themselves into a rectangle of the 640 × 360 UI canvas, in whole texels.
 */

import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';

export interface Pad {
  /** -1..1, x to the right, y down the screen. */
  x: number;
  y: number;
  /** The button, held. */
  hold: boolean;
  /** The button, pressed this frame. */
  press: boolean;
}

export interface Minigame {
  readonly title: string;
  /** How to play, a line or two. */
  readonly how: string;
  /** 0..1 once it's over; null while it goes on. */
  result: number | null;
  /** How it's going, a few words. */
  status(): string;
  update(dt: number, pad: Pad): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

/** A time bar along the top of a game: what's left of `limit`. */
export function timer(ctx: CanvasRenderingContext2D, w: number, left: number, limit: number) {
  const f = Math.max(0, left / limit);
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = f < 0.25 ? '#ff5a4a' : f < 0.5 ? '#ffd04a' : '#8affe0';
  ctx.fillRect(0, 0, Math.round(w * f), 3);
  drawText(ctx, `${Math.max(0, left).toFixed(1)}S`, w - 4, 6, f < 0.25 ? '#ff5a4a' : '#c8bcd8', { align: 'right' });
}

/** A starfield, seeded, scrolling left by `scroll`. */
export function stars(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, scroll = 0) {
  for (let i = 0; i < 90; i++) {
    const a = Math.sin(seed * 0.001 + i * 12.9898) * 43758.5453;
    const b = Math.sin(seed * 0.002 + i * 78.233) * 12543.1234;
    const depth = 0.3 + (i % 3) * 0.35;
    const x = ((((a - Math.floor(a)) * w - scroll * depth) % w) + w) % w;
    const y = (b - Math.floor(b)) * h;
    ctx.fillStyle = i % 7 === 0 ? '#c8b0ff' : depth > 0.9 ? '#f4ecd8' : '#5a5070';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

/** A little ship seen side-on, pointing right, centred on (x, y). */
export function sideShip(ctx: CanvasRenderingContext2D, x: number, y: number, flame: number, hull = '#c86a3a') {
  x = Math.round(x);
  y = Math.round(y);
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 9, y - 4, 19, 9);
  ctx.fillStyle = hull;
  ctx.fillRect(x - 8, y - 3, 14, 7);
  ctx.fillRect(x + 6, y - 2, 3, 5);
  ctx.fillStyle = '#8a4a2a';
  ctx.fillRect(x - 8, y + 2, 14, 2);
  ctx.fillRect(x - 6, y - 6, 5, 3);
  ctx.fillRect(x - 6, y + 4, 5, 3);
  ctx.fillStyle = '#8affe0';
  ctx.fillRect(x + 2, y - 2, 3, 2);
  if (flame > 0) {
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x - 9 - Math.round(flame * 6), y - 1, Math.round(flame * 6), 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 10, y, 2, 1);
  }
}

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
