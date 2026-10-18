import { drawText } from '../../ui/font';
import { clamp, rng } from '../../util';
import { timer, type Minigame, type Pad } from './common';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Grab and go: a derelict's hold seen from above, crates scattered among the stacks, and the
 * hatch you came in by grinding shut. Fly the drone over crates to pick them up, and get back out
 * through the hatch (press the button there) before it seals, or you lose the lot. Bold: a deeper
 * hold, more crates, less time, and the thing that lives there wakes up.
 */
export class Grab implements Minigame {
  readonly title = 'GRAB AND GO';
  readonly how = 'STEER THE DRONE OVER CRATES TO TAKE THEM. GET BACK TO THE HATCH AND PRESS THE BUTTON BEFORE IT SEALS.';
  result: number | null = null;
  private x = 26;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private crates: { x: number; y: number; got: boolean }[] = [];
  private stacks: Box[] = [];
  private time = 0;
  private readonly limit: number;
  private beast = { x: 0, y: 0, stun: 0 };
  private bumped = 0;
  private carried = 0;
  private readonly W = 480;
  private readonly H = 196;

  constructor(
    bold: boolean,
    seed: number,
  ) {
    const r = rng(seed);
    this.limit = bold ? 17 : 16;
    this.y = this.H / 2 + 14;
    // stacks of cargo in rows, with lanes between
    for (let c = 0; c < (bold ? 6 : 5); c++)
      for (let k = 0; k < 2; k++) {
        const x = 80 + c * 70 + r() * 16;
        const h = 30 + r() * 40;
        const y = k === 0 ? 14 + r() * 30 : this.H - h - r() * 30 + 10;
        this.stacks.push({ x, y, w: 22 + r() * 14, h });
      }
    const n = bold ? 10 : 7;
    for (let tries = 0; this.crates.length < n && tries < 500; tries++) {
      const x = 70 + r() * (this.W - 90);
      const y = 22 + r() * (this.H - 20);
      if (this.hit(x, y, 6)) continue;
      if (this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 26)) continue;
      this.crates.push({ x, y, got: false });
    }
    this.beast = { x: this.W - 30, y: this.H / 2 + 14, stun: bold ? 0 : 99 };
  }

  private hit(x: number, y: number, rad: number) {
    if (x < 8 + rad || x > this.W - 8 - rad || y < 14 + rad || y > this.H + 14 - rad) return true;
    return this.stacks.some((b) => x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad);
  }

  private atHatch() {
    return this.x < 30 && Math.abs(this.y - (this.H / 2 + 14)) < 22;
  }

  status() {
    return `CRATES ${this.carried}/${this.crates.length}${this.atHatch() ? '  AT THE HATCH: PRESS TO LEAVE' : ''}`;
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    this.bumped -= dt;
    const acc = 520;
    this.vx = (this.vx + pad.x * acc * dt) * Math.exp(-dt * 5);
    this.vy = (this.vy + pad.y * acc * dt) * Math.exp(-dt * 5);
    const nx = this.x + this.vx * dt;
    if (!this.hit(nx, this.y, 5)) this.x = nx;
    else this.vx *= -0.3;
    const ny = this.y + this.vy * dt;
    if (!this.hit(this.x, ny, 5)) this.y = ny;
    else this.vy *= -0.3;
    for (const c of this.crates)
      if (!c.got && Math.hypot(c.x - this.x, c.y - this.y) < 10) {
        c.got = true;
        this.carried++;
      }
    // the thing in the dark comes after you, slowly, and knocks a crate loose
    const b = this.beast;
    if (b.stun < 90) {
      b.stun -= dt;
      if (b.stun <= 0) {
        const dx = this.x - b.x;
        const dy = this.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 38 + this.time * 1.5;
        b.x += (dx / d) * sp * dt;
        b.y += (dy / d) * sp * dt;
        if (d < 14 && this.bumped <= 0) {
          this.bumped = 1;
          b.stun = 1.4;
          if (this.carried > 0) {
            this.carried--;
            const c = this.crates.find((c) => c.got)!;
            c.got = false;
            c.x = clamp(this.x + 30, 60, this.W - 20);
            c.y = clamp(this.y + 10, 30, this.H);
            if (this.hit(c.x, c.y, 6)) c.got = true;
          }
          this.vx = -this.vx - 80;
        }
      }
    }
    if (pad.press && this.atHatch() && this.time > 1) this.result = this.carried / this.crates.length || 0.01;
    else if (this.time >= this.limit) this.result = this.atHatch() ? this.carried / this.crates.length || 0.01 : 0;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#120e16';
    ctx.fillRect(0, 0, w, h);
    // deck plates
    for (let y = 14; y < this.H + 14; y += 16)
      for (let x = 8; x < this.W - 8; x += 16) {
        ctx.fillStyle = (x / 16 + y / 16) % 2 < 1 ? '#1e1a24' : '#1a1620';
        ctx.fillRect(x, y, 15, 15);
      }
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(0, 10, w, 4);
    ctx.fillRect(0, this.H + 14, w, 4);
    // the hatch, closing
    const left = Math.max(0, 1 - this.time / this.limit);
    const hy = this.H / 2 + 14;
    const open = Math.round(22 * left);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(0, 14, 8, this.H);
    ctx.fillStyle = left < 0.3 && Math.floor(t * 6) % 2 ? '#ff5a4a' : '#ffd04a';
    ctx.fillRect(0, hy - open, 8, open * 2);
    ctx.fillStyle = 'rgba(255,208,74,0.12)';
    ctx.fillRect(8, hy - 22, 22, 44);
    // stacks
    for (const b of this.stacks) {
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(Math.round(b.x) + 2, Math.round(b.y) + 3, Math.round(b.w), Math.round(b.h));
      ctx.fillStyle = '#4a3e4a';
      ctx.fillRect(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h));
      ctx.fillStyle = '#5a4e5a';
      ctx.fillRect(Math.round(b.x), Math.round(b.y), Math.round(b.w), 2);
      for (let yy = b.y + 8; yy < b.y + b.h; yy += 10) {
        ctx.fillStyle = '#3a2e3a';
        ctx.fillRect(Math.round(b.x), Math.round(yy), Math.round(b.w), 1);
      }
    }
    // crates
    for (const c of this.crates) {
      if (c.got) continue;
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(x - 5, y - 4, 11, 10);
      ctx.fillStyle = '#c88a3a';
      ctx.fillRect(x - 5, y - 5, 10, 9);
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(x - 5, y - 1, 10, 1);
      ctx.fillRect(x, y - 5, 1, 9);
      if (Math.floor(t * 2 + c.x) % 3 === 0) {
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(x - 5, y - 5, 1, 1);
      }
    }
    // the beast: a dark mass with too many legs
    const b = this.beast;
    if (b.stun < 90) {
      const bx = Math.round(b.x);
      const by = Math.round(b.y);
      ctx.fillStyle = '#2a0a1a';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.sin(t * 8 + k) * 0.3;
        for (let s = 4; s < 14; s += 1) ctx.fillRect(Math.round(bx + Math.cos(a) * s), Math.round(by + Math.sin(a) * s), 1, 1);
      }
      ctx.fillStyle = '#3a0e24';
      ctx.fillRect(bx - 6, by - 5, 12, 10);
      ctx.fillStyle = b.stun > 0 ? '#5a4a5a' : '#ff3a5a';
      ctx.fillRect(bx - 3, by - 2, 2, 2);
      ctx.fillRect(bx + 2, by - 2, 2, 2);
    }
    // your drone, with a light cone
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    ctx.fillStyle = 'rgba(138,255,224,0.08)';
    ctx.fillRect(x - 18, y - 18, 36, 36);
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(x - 5, y - 4, 11, 10);
    ctx.fillStyle = this.bumped > 0 && Math.floor(t * 20) % 2 ? '#ff5a4a' : '#8affe0';
    ctx.fillRect(x - 5, y - 5, 10, 9);
    ctx.fillStyle = '#2a6a5a';
    ctx.fillRect(x - 3, y - 3, 6, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 2, 2, 2);
    if (this.carried) drawText(ctx, `${this.carried}`, x + 8, y - 12, '#ffd04a');
    timer(ctx, w, this.limit - this.time, this.limit);
    // footer
    const fy = h - 18;
    drawText(ctx, 'HATCH', 8, fy, '#ffd04a');
    drawText(ctx, `CRATES ${this.carried}/${this.crates.length}`, w / 2, fy, '#f4ecd8', { align: 'center' });
    if (this.atHatch() && Math.floor(t * 3) % 2) drawText(ctx, 'PRESS TO LEAVE', w - 8, fy, '#8affb0', { align: 'right' });
  }
}
