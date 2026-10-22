/**
 * Little games inside events: a stick (or d-pad, or arrows) and one button. Each takes ten to
 * thirty seconds and ends with a score, 0..1, that the event turns into what you get. Every one
 * has a careful and a bold version; the bold one is harder and pays about double.
 *
 * They draw themselves into a rectangle of the 640 × 360 UI canvas. Pixels stay whole, but light
 * is soft: glows, haze and vignettes, a modern game in a retro jacket.
 *
 * `update` keeps being called after the result is in (with an idle pad), so sparks can settle.
 */

import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { fbm, rng } from '../../util';

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
  /** A number the game settled on, if it settles on one (the price Tobbo took). */
  value?: number | null;
  /** How it's going, a few words. */
  status(): string;
  update(dt: number, pad: Pad): void;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

// ------------------------------------------------------------------------------------------------
// Juice: sparks, floating words, shake and flashes
// ------------------------------------------------------------------------------------------------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  glow: boolean;
}

interface Word {
  text: string;
  x: number;
  y: number;
  life: number;
  color: string;
  scale: number;
}

/** Sparks, smoke, floating words, screen shake and a flash: one per game. */
export class Fx {
  private sparks: Spark[] = [];
  private words: Word[] = [];
  private shakeT = 0;
  private shakeA = 0;
  private flashT = 0;
  private flashC = '#ffffff';
  private r = rng(0x5eed);

  spark(x: number, y: number, vx: number, vy: number, life: number, color: string, o: { size?: number; drag?: number; grav?: number; glow?: boolean } = {}) {
    if (this.sparks.length > 400) this.sparks.shift();
    this.sparks.push({ x, y, vx, vy, life, max: life, color, size: o.size ?? 1, drag: o.drag ?? 2, grav: o.grav ?? 0, glow: o.glow ?? true });
  }

  /** A ring of sparks flying out from (x, y). */
  burst(x: number, y: number, n: number, speed: number, colors: string[], o: { life?: number; size?: number; grav?: number; glow?: boolean } = {}) {
    for (let k = 0; k < n; k++) {
      const a = this.r() * Math.PI * 2;
      const s = speed * (0.3 + this.r() * 0.7);
      this.spark(x, y, Math.cos(a) * s, Math.sin(a) * s, (o.life ?? 0.6) * (0.5 + this.r() * 0.5), colors[k % colors.length], { size: o.size ?? (this.r() < 0.3 ? 2 : 1), grav: o.grav, glow: o.glow });
    }
  }

  word(text: string, x: number, y: number, color: string, scale = 1) {
    this.words.push({ text, x, y, life: 0.9, color, scale });
  }

  shake(amount: number, time = 0.25) {
    this.shakeA = Math.max(this.shakeA * (this.shakeT > 0 ? 1 : 0), amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  flash(color: string, time = 0.18) {
    this.flashC = color;
    this.flashT = time;
  }

  rand() {
    return this.r();
  }

  update(dt: number) {
    this.shakeT -= dt;
    this.flashT -= dt;
    for (const s of this.sparks) {
      s.life -= dt;
      s.vx *= Math.exp(-s.drag * dt);
      s.vy = s.vy * Math.exp(-s.drag * dt) + s.grav * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const w of this.words) {
      w.life -= dt;
      w.y -= dt * 22;
    }
    this.words = this.words.filter((w) => w.life > 0);
  }

  /** Where to translate the scene this frame. */
  offset(): [number, number] {
    if (this.shakeT <= 0) return [0, 0];
    const a = this.shakeA * Math.min(1, this.shakeT * 6);
    return [Math.round((this.r() - 0.5) * 2 * a), Math.round((this.r() - 0.5) * 2 * a)];
  }

  drawSparks(ctx: CanvasRenderingContext2D) {
    for (const s of this.sparks) {
      const f = s.life / s.max;
      if (s.glow) {
        ctx.globalAlpha = 0.25 * f;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x) - s.size, Math.round(s.y) - s.size, s.size * 3, s.size * 3);
      }
      ctx.globalAlpha = Math.min(1, f * 1.6);
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  drawWords(ctx: CanvasRenderingContext2D) {
    for (const w of this.words) {
      if (w.life < 0.25 && Math.floor(w.life * 30) % 2) continue;
      drawText(ctx, w.text, w.x, w.y, w.color, { align: 'center', scale: w.scale });
    }
  }

  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.flashT <= 0) return;
    ctx.globalAlpha = Math.min(0.6, this.flashT * 3);
    ctx.fillStyle = this.flashC;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------------------------------------
// Light and backdrops
// ------------------------------------------------------------------------------------------------

/** A soft additive glow centred on (x, y). */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha = 0.5) {
  if (r <= 0 || alpha <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

/** Darkened corners. */
export function vignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.65);
  g.addColorStop(0, 'rgba(6,4,12,0)');
  g.addColorStop(1, `rgba(6,4,12,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Faint CRT scanlines. */
export function scanlines(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.18) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
}

const nebulae = new Map<string, HTMLCanvasElement>();

/**
 * A painted nebula, twice as wide as the view so it can scroll: fractal noise in two colours over
 * a dark base, made once per seed and kept.
 */
export function nebula(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, a: [number, number, number], b: [number, number, number], scroll = 0) {
  const key = `${w}x${h}:${seed}:${a}:${b}`;
  let c = nebulae.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const cw = Math.ceil(w / 2) * 2;
    const ch = Math.ceil(h / 2);
    c.width = cw;
    c.height = ch;
    const g = c.getContext('2d')!;
    const img = g.createImageData(cw, ch);
    const s = seed % 1000;
    for (let y = 0; y < ch; y++)
      for (let x = 0; x < cw; x++) {
        // tile across the seam: blend the noise with its copy one width over
        const u = x / cw;
        const n1 = fbm(x * 0.018, y * 0.026, s) * (1 - u) + fbm((x - cw) * 0.018, y * 0.026, s) * u;
        const n2 = fbm(x * 0.03 + 40, y * 0.03, s + 7) * (1 - u) + fbm((x - cw) * 0.03 + 40, y * 0.03, s + 7) * u;
        const ka = Math.max(0, n1 - 0.42) * 2.2;
        const kb = Math.max(0, n2 - 0.5) * 2.4;
        const i = (y * cw + x) * 4;
        img.data[i] = 8 + a[0] * ka + b[0] * kb;
        img.data[i + 1] = 6 + a[1] * ka + b[1] * kb;
        img.data[i + 2] = 16 + a[2] * ka + b[2] * kb;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    nebulae.set(key, c);
  }
  // drawn at double size, soft
  const sw = c.width * 2;
  const x0 = -(((scroll % sw) + sw) % sw);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, x0, 0, sw, h);
  ctx.drawImage(c, x0 + sw, 0, sw, h);
  ctx.restore();
}

/** A starfield, seeded, scrolling left by `scroll`; with `streak`, stars smear into lines. */
export function stars(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, scroll = 0, streak = 0, t = 0) {
  for (let i = 0; i < 110; i++) {
    const a = Math.sin(seed * 0.001 + i * 12.9898) * 43758.5453;
    const b = Math.sin(seed * 0.002 + i * 78.233) * 12543.1234;
    const depth = 0.3 + (i % 3) * 0.35;
    const x = ((((a - Math.floor(a)) * w - scroll * depth) % w) + w) % w;
    const y = (b - Math.floor(b)) * h;
    const near = depth > 0.9;
    const twinkle = near && Math.sin(t * 3 + i) > 0.7;
    ctx.fillStyle = i % 7 === 0 ? '#c8b0ff' : near ? (twinkle ? '#ffffff' : '#f4ecd8') : depth > 0.6 ? '#8a80a0' : '#4a4060';
    const len = Math.max(1, Math.round(streak * depth * depth));
    ctx.fillRect(Math.round(x), Math.round(y), len, 1);
    if (twinkle) {
      ctx.globalAlpha = 0.35;
      ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
      ctx.globalAlpha = 1;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Readouts
// ------------------------------------------------------------------------------------------------

/** A time bar along the top of a game: what's left of `limit`. It pulses in the last quarter. */
export function timer(ctx: CanvasRenderingContext2D, w: number, left: number, limit: number, t = 0) {
  const f = Math.max(0, left / limit);
  const low = f < 0.25;
  ctx.fillStyle = 'rgba(10,7,16,0.7)';
  ctx.fillRect(0, 0, w, 4);
  const col = low ? '#ff5a4a' : f < 0.5 ? '#ffd04a' : '#8affe0';
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, Math.round(w * f), 3);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, Math.round(w * f), 1);
  if (low && Math.sin(t * 14) > 0) glow(ctx, Math.round(w * f), 1, 14, col, 0.5);
  drawText(ctx, `${Math.max(0, left).toFixed(1)}S`, w - 4, 7, low ? '#ff5a4a' : '#c8bcd8', { align: 'right' });
}

/** Whether a countdown just crossed a whole second in its last few: time for a tick. */
export function ticked(before: number, after: number, last = 3) {
  return after > 0 && after < last && Math.ceil(after) !== Math.ceil(before);
}

/** A bevelled horizontal meter. */
export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string, back = '#1a1424') {
  f = Math.max(0, Math.min(1, f));
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  const fw = Math.round(w * f);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, fw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x, y, fw, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + h - 1, fw, 1);
}

// ------------------------------------------------------------------------------------------------
// Shapes
// ------------------------------------------------------------------------------------------------

/** A little ship seen side-on, pointing right, centred on (x, y). `flame` 0..1. */
export function sideShip(ctx: CanvasRenderingContext2D, x: number, y: number, flame: number, hull = '#c86a3a', t = 0) {
  x = Math.round(x);
  y = Math.round(y);
  if (flame > 0) {
    const flick = 0.8 + Math.sin(t * 50) * 0.2;
    const len = Math.round(flame * 12 * flick);
    glow(ctx, x - 11 - len / 2, y + 0.5, 6 + len, '#ff9a3a', 0.35 + flame * 0.3);
    ctx.fillStyle = '#ff6a2a';
    ctx.fillRect(x - 10 - len, y - 1, len, 3);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x - 10 - Math.round(len * 0.6), y - 1, Math.round(len * 0.6), 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 11, y, 3, 1);
  }
  // outline
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 10, y - 4, 21, 9);
  ctx.fillRect(x - 7, y - 7, 7, 15);
  ctx.fillRect(x + 10, y - 2, 2, 5);
  // wings
  ctx.fillStyle = '#7a3a22';
  ctx.fillRect(x - 6, y - 6, 5, 3);
  ctx.fillRect(x - 6, y + 4, 5, 3);
  ctx.fillStyle = '#a85a32';
  ctx.fillRect(x - 6, y - 6, 5, 1);
  // hull
  ctx.fillStyle = hull;
  ctx.fillRect(x - 9, y - 3, 16, 7);
  ctx.fillRect(x + 7, y - 2, 3, 5);
  ctx.fillStyle = '#e89a5a';
  ctx.fillRect(x - 8, y - 3, 15, 1);
  ctx.fillStyle = '#8a4a2a';
  ctx.fillRect(x - 9, y + 2, 16, 2);
  ctx.fillStyle = '#5a5470';
  ctx.fillRect(x - 10, y - 2, 2, 5);
  // canopy
  ctx.fillStyle = '#2a6a7a';
  ctx.fillRect(x + 1, y - 2, 5, 2);
  ctx.fillStyle = '#8affe0';
  ctx.fillRect(x + 3, y - 2, 2, 1);
  // running light
  if (Math.floor(t * 2) % 2) {
    ctx.fillStyle = '#ff5a4a';
    ctx.fillRect(x - 5, y - 7, 1, 1);
  }
}

export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
