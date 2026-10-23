/**
 * Art helpers for THREAD IT (and GRAB AND GO, which borrows them): a sprite drawn flashing a solid
 * colour, and a small particle kit for the juicier effects the Fx sparks don't do: sparks stretched
 * along their flight, smoke that grows as it fades, and scrap sprites that tumble.
 */
import { drawSprite, spriteInfo, type SpriteOpts } from './sprites';

let scratch: HTMLCanvasElement | null = null;

/** Draws a sprite, then washes it with `color` (amount 0..1): the white flash of a struck sprite. */
export function drawFlashed(ctx: CanvasRenderingContext2D, sheet: string, name: string, x: number, y: number, o: SpriteOpts, color: string, amount: number): boolean {
  if (amount <= 0) return drawSprite(ctx, sheet, name, x, y, o);
  const info = spriteInfo(sheet, name);
  if (!info) return drawSprite(ctx, sheet, name, x, y, o);
  const k = o.scale ?? 1;
  const w = Math.ceil(info.w * k) * 2 + 4;
  const h = Math.ceil(info.h * k) * 2 + 4;
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  const g = scratch.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);
  if (!drawSprite(g, sheet, name, cx, cy, { ...o, alpha: undefined })) return false;
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = Math.min(1, amount);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  ctx.drawImage(scratch, 0, 0, w, h, Math.round(x) - cx, Math.round(y) - cy, w, h);
  ctx.restore();
  return true;
}

interface Bit {
  kind: 'streak' | 'smoke' | 'scrap' | 'ember';
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
  /** For scrap: which sprite, and where in its tumble it starts. */
  name: string;
  spin: number;
}

/** Streaks, smoke and tumbling scrap. update() it with the game, draw() it in the scene. */
export class Juice {
  bits: Bit[] = [];
  private seed = 1;
  constructor(
    private sheet: string,
    private scraps: string[] = [],
  ) {}

  rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private add(b: Partial<Bit> & { kind: Bit['kind']; x: number; y: number }) {
    if (this.bits.length > 260) this.bits.shift();
    this.bits.push({ vx: 0, vy: 0, t: 0, life: 0.5, size: 1, color: '#ffffff', drag: 2, grav: 0, name: '', spin: 0, ...b });
  }

  /** Sparks flung out from (x, y), drawn as streaks along their flight. */
  streaks(x: number, y: number, n: number, speed: number, colors: string[], o: { life?: number; dir?: number; spread?: number; grav?: number } = {}) {
    for (let k = 0; k < n; k++) {
      const a = o.dir !== undefined ? o.dir + (this.rand() - 0.5) * (o.spread ?? 1) : this.rand() * Math.PI * 2;
      const v = speed * (0.4 + this.rand() * 0.8);
      this.add({ kind: 'streak', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (o.life ?? 0.4) * (0.6 + this.rand() * 0.6), color: colors[k % colors.length], drag: 3, grav: o.grav ?? 0 });
    }
  }

  /** Puffs of smoke that swell and thin out. */
  smoke(x: number, y: number, n: number, color = '#3a2e42', o: { size?: number; life?: number; speed?: number; vx?: number; vy?: number } = {}) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const v = (o.speed ?? 20) * this.rand();
      this.add({ kind: 'smoke', x: x + (this.rand() - 0.5) * 6, y: y + (this.rand() - 0.5) * 6, vx: Math.cos(a) * v + (o.vx ?? 0), vy: Math.sin(a) * v + (o.vy ?? 0) - 4, life: (o.life ?? 0.9) * (0.7 + this.rand() * 0.5), size: (o.size ?? 4) * (0.7 + this.rand() * 0.6), color, drag: 1.5 });
    }
  }

  /** Bits of scrap (sprites) that tumble away. */
  scrap(x: number, y: number, n: number, speed: number, o: { life?: number; grav?: number; dir?: number; spread?: number } = {}) {
    if (!this.scraps.length) return;
    for (let k = 0; k < n; k++) {
      const a = o.dir !== undefined ? o.dir + (this.rand() - 0.5) * (o.spread ?? 1.5) : this.rand() * Math.PI * 2;
      const v = speed * (0.4 + this.rand() * 0.7);
      this.add({ kind: 'scrap', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: (o.life ?? 0.9) * (0.7 + this.rand() * 0.5), name: this.scraps[Math.floor(this.rand() * this.scraps.length)], spin: this.rand(), drag: 1.2, grav: o.grav ?? 0 });
    }
  }

  /** Glowing embers drifting off. */
  embers(x: number, y: number, n: number, color: string, o: { speed?: number; life?: number; vx?: number } = {}) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const v = (o.speed ?? 30) * this.rand();
      this.add({ kind: 'ember', x, y, vx: Math.cos(a) * v + (o.vx ?? 0), vy: Math.sin(a) * v, life: (o.life ?? 0.7) * (0.5 + this.rand()), color, drag: 2 });
    }
  }

  /** Everything slides by (dx, dy): for a scrolling scene. */
  scroll(dx: number, dy = 0) {
    for (const b of this.bits) {
      b.x += dx;
      b.y += dy;
    }
  }

  update(dt: number) {
    for (const b of this.bits) {
      b.t += dt;
      const k = Math.exp(-b.drag * dt);
      b.vx *= k;
      b.vy = b.vy * k + b.grav * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bits = this.bits.filter((b) => b.t < b.life);
  }

  /** Smoke first (it sits behind), then scrap, streaks and embers. */
  draw(ctx: CanvasRenderingContext2D, layer: 'back' | 'front' | 'all' = 'all') {
    for (const b of this.bits) {
      const f = b.t / b.life;
      if (b.kind === 'smoke') {
        if (layer === 'front') continue;
        ctx.globalAlpha = 0.55 * (1 - f) * Math.min(1, f * 8);
        ctx.fillStyle = b.color;
        const r = Math.round(b.size * (1 + f * 1.8));
        ctx.beginPath();
        ctx.arc(Math.round(b.x), Math.round(b.y), r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (layer === 'back') continue;
      if (b.kind === 'scrap') {
        ctx.globalAlpha = 1;
        if (f > 0.75 && Math.floor(b.t * 30) % 2) continue;
        drawSprite(ctx, this.sheet, b.name, b.x, b.y, { clip: 'tumble', t: b.t + b.spin, anchor: 'center' });
      } else if (b.kind === 'streak') {
        ctx.globalAlpha = Math.min(1, (1 - f) * 1.8);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        const len = 0.035;
        ctx.beginPath();
        ctx.moveTo(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5);
        ctx.lineTo(Math.round(b.x - b.vx * len) + 0.5, Math.round(b.y - b.vy * len) + 0.5);
        ctx.stroke();
      } else {
        ctx.globalAlpha = Math.min(1, (1 - f) * 2);
        ctx.fillStyle = b.color;
        ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/** A bevelled HUD panel: dark fill, a light top edge, a dark outline, and an accent tab. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent = '#5a4e68') {
  ctx.fillStyle = '#0a0710';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(26,20,36,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 2, h);
}

/** Smoothly approaches a target: for numbers that tick up rather than jump. */
export function tick(shown: number, target: number, dt: number, rate = 10) {
  if (Math.abs(target - shown) < 0.5) return target;
  return shown + (target - shown) * Math.min(1, dt * rate) + Math.sign(target - shown) * 0.3;
}
