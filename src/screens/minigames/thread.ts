import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { sideShip, stars, timer, type Minigame, type Pad } from './common';

/**
 * Thread it: side-on, through a field of mines (or rocks, with someone on your tail). Up and down
 * to steer; hold the button to burn harder, which gets you further in the time and gives you less
 * time to think. Three hits and you're out. The score is how far you got, less a bit per hit.
 * Bold: further to go, thicker mines, and some of them drift.
 */
export class Thread implements Minigame {
  readonly title = 'THREAD IT';
  readonly how = 'UP/DOWN TO STEER. HOLD THE BUTTON TO BURN FASTER. THREE HITS AND YOU ARE OUT.';
  result: number | null = null;
  private y = 0;
  private vy = 0;
  private dist = 0;
  private hits = 0;
  private hurt = 0;
  private time = 0;
  private readonly limit = 20;
  private readonly goal: number;
  private mines: { x: number; y: number; bob: number; r: number }[] = [];
  private booms: { x: number; y: number; t: number }[] = [];
  private burn = false;
  private readonly fieldH = 196;

  constructor(
    bold: boolean,
    private seed: number,
  ) {
    const r = rng(seed);
    this.y = this.fieldH / 2;
    this.goal = bold ? 2700 : 2000;
    // columns of mines with a gap or two
    for (let x = 260; x < this.goal + 100; x += bold ? 46 : 58) {
      const gap = 30 + r() * (this.fieldH - 60);
      const gw = bold ? 46 : 60;
      for (let y = 18; y < this.fieldH; y += 24) {
        if (Math.abs(y - gap) < gw / 2) continue;
        if (r() < 0.35) continue;
        this.mines.push({ x: x + (r() - 0.5) * 20, y: y + (r() - 0.5) * 8, bob: bold && r() < 0.4 ? 0.6 + r() * 1.2 : 0, r: 6 });
      }
    }
  }

  private mineY(m: { y: number; bob: number }, i: number) {
    return m.y + (m.bob ? Math.sin(this.time * m.bob * 2 + i) * 14 : 0);
  }

  status() {
    return `${Math.round((this.dist / this.goal) * 100)}% THROUGH  ${'♥'.repeat(3 - this.hits)}`;
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    this.hurt -= dt;
    this.burn = pad.hold;
    this.vy += (pad.y * 600 - this.vy * 7) * dt;
    this.y = Math.max(10, Math.min(this.fieldH - 4, this.y + this.vy * dt));
    this.dist += (this.burn ? 175 : 105) * dt;
    const sx = 70;
    if (this.hurt <= 0)
      this.mines.forEach((m, i) => {
        const mx = m.x - this.dist + sx;
        if (Math.abs(mx - sx) < 12 && Math.abs(this.mineY(m, i) - this.y) < 9) {
          this.hits++;
          this.hurt = 1.1;
          this.booms.push({ x: m.x, y: this.mineY(m, i), t: 0 });
          m.x = -9999;
        }
      });
    for (const b of this.booms) b.t += dt;
    const f = Math.min(1, this.dist / this.goal);
    if (this.hits >= 3) this.result = Math.max(0, f - 0.4);
    else if (f >= 1 || this.time >= this.limit) this.result = Math.max(0, f - this.hits * 0.15);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, this.fieldH + 14, this.seed, this.dist * 0.5);
    timer(ctx, w, this.limit - this.time, this.limit);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 10, w, this.fieldH + 10);
    ctx.clip();
    const sx = 70;
    const oy = 12;
    // the cache at the far end
    const ex = this.goal - this.dist + sx + 30;
    if (ex < w + 20) {
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(Math.round(ex), oy, 3, this.fieldH);
      drawText(ctx, 'CLEAR', Math.round(ex) + 6, oy + this.fieldH / 2, '#ffd04a');
    }
    this.mines.forEach((m, i) => {
      const x = Math.round(m.x - this.dist + sx);
      if (x < -10 || x > w + 10) return;
      const y = Math.round(this.mineY(m, i)) + oy;
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(x - 5, y - 4, 11, 10);
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(x - 4, y - 4, 9, 9);
      ctx.fillStyle = '#8a8a9a';
      ctx.fillRect(x - 1, y - 7, 2, 15);
      ctx.fillRect(x - 7, y - 1, 15, 2);
      ctx.fillStyle = Math.floor(t * 3 + i) % 2 ? '#ff3a4a' : '#5a1a24';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    });
    for (const b of this.booms) {
      if (b.t > 0.5) continue;
      const x = Math.round(b.x - this.dist + sx);
      const s = Math.round(4 + b.t * 40);
      ctx.fillStyle = b.t < 0.15 ? '#ffffff' : '#ff8a3a';
      ctx.fillRect(x - s, Math.round(b.y) + oy - s, s * 2, s * 2);
    }
    if (this.hurt <= 0 || Math.floor(t * 16) % 2) sideShip(ctx, sx, this.y + oy, this.burn ? 1 : 0.4);
    ctx.restore();
    // progress
    const by = h - 22;
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(10, by + 2, w - 120, 4);
    ctx.fillStyle = '#8affb0';
    ctx.fillRect(10, by + 2, Math.round((w - 120) * Math.min(1, this.dist / this.goal)), 4);
    for (let k = 0; k < 3; k++) drawText(ctx, '♥', w - 90 + k * 12, by, k < 3 - this.hits ? '#ff5a4a' : '#3a2e48');
    if (this.burn) drawText(ctx, 'BURN', w - 40, by, '#ffd04a');
  }
}
