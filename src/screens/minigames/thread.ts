import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { rng } from '../../util';
import { Fx, glow, meter, nebula, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

interface Mine {
  x: number;
  y: number;
  bob: number;
  phase: number;
  skimmed: boolean;
  dead: boolean;
}

/**
 * Thread it: side-on, through a field of mines. Up and down to steer; hold the button to burn,
 * which gets you there in time but gives you less time to think. Brush past a mine without
 * touching it to skim it: skims chain, and each one is worth a little (like grazing a bullet).
 * Three hits and you're out. Bold: further to go, tighter gaps, and some mines drift.
 */
export class Thread implements Minigame {
  readonly title = 'THREAD IT';
  readonly how = 'UP/DOWN TO STEER. HOLD THE BUTTON TO BURN: YOU NEED IT TO MAKE IT IN TIME. BRUSH PAST MINES TO SKIM THEM FOR A BONUS.';
  result: number | null = null;
  private y = 0;
  private vy = 0;
  private dist = 0;
  private hits = 0;
  private hurt = 0;
  private time = 0;
  private readonly limit = 20;
  private readonly goal: number;
  private mines: Mine[] = [];
  private booms: { x: number; y: number; t: number }[] = [];
  private burn = false;
  private skims = 0;
  private combo = 0;
  private comboT = 0;
  private readonly top = 12;
  private readonly fieldH: number;
  private readonly sx = 72;
  private fx = new Fx();

  constructor(
    bold: boolean,
    private seed: number,
    h = 240,
  ) {
    const r = rng(seed);
    this.fieldH = h - 30;
    this.y = this.fieldH / 2;
    this.goal = bold ? 2600 : 2100;
    // columns of mines, each with a gap that moves only so far from the last one, so there's always a way
    const step = bold ? 60 : 68;
    const gw = bold ? 56 : 62;
    const shift = bold ? 50 : 56;
    let gap = this.fieldH / 2;
    for (let x = 300; x < this.goal + 60; x += step) {
      gap = Math.max(gw / 2 + 8, Math.min(this.fieldH - gw / 2 - 8, gap + (r() - 0.5) * 2 * shift));
      for (let y = 10; y < this.fieldH; y += 22) {
        if (Math.abs(y - gap) < gw / 2 + 4) continue;
        if (r() < 0.22) continue;
        this.mines.push({ x: x + (r() - 0.5) * 16, y: y + (r() - 0.5) * 6, bob: bold && r() < 0.35 ? 0.6 + r() * 1.1 : 0, phase: r() * 6, skimmed: false, dead: false });
      }
    }
  }

  private mineY(m: Mine) {
    return m.y + (m.bob ? Math.sin(this.time * m.bob * 2 + m.phase) * 10 : 0);
  }

  private score() {
    const f = Math.min(1, this.dist / this.goal);
    const bonus = Math.min(0.15, this.skims * 0.02);
    if (this.hits >= 3) return Math.max(0, f - 0.4);
    return Math.max(0, Math.min(1, f - this.hits * 0.15 + bonus));
  }

  status() {
    return `${Math.round((this.dist / this.goal) * 100)}% THROUGH  ${'♥'.repeat(Math.max(0, 3 - this.hits))}  SKIMS ${this.skims}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    for (const b of this.booms) b.t += dt;
    if (this.result !== null) {
      audio.loop('engine', 'thread', false);
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    this.hurt -= dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (pad.hold && !this.burn) audio.play('boost', { vol: 0.5 });
    this.burn = pad.hold;
    this.vy += (pad.y * 1050 - this.vy * 7) * dt;
    this.y += this.vy * dt;
    if (this.y < 6 || this.y > this.fieldH - 6) {
      this.y = Math.max(6, Math.min(this.fieldH - 6, this.y));
      this.vy = 0;
    }
    this.dist += (this.burn ? 170 : 90) * dt;
    const sx = this.sx;
    for (const m of this.mines) {
      if (m.dead) continue;
      const dx = m.x - this.dist;
      if (dx < -16 || dx > 16) continue;
      const dy = this.mineY(m) - this.y;
      if (this.hurt <= 0 && Math.abs(dx) < 9 && Math.abs(dy) < 7) {
        this.hits++;
        this.hurt = 1.1;
        this.combo = 0;
        m.dead = true;
        this.booms.push({ x: m.x, y: this.mineY(m), t: 0 });
        this.fx.burst(sx + dx, this.mineY(m) + this.top, 34, 150, ['#ffffff', '#ffd04a', '#ff8a3a', '#ff5a4a'], { life: 0.7 });
        this.fx.shake(5, 0.35);
        this.fx.flash('#ff5a4a', 0.15);
        this.vy += dy > 0 ? -140 : 140;
        audio.play('explode_small');
        audio.play('player_hit', { vol: 0.6 });
      } else if (!m.skimmed && this.hurt <= 0 && Math.abs(dx) < 4 && Math.abs(dy) < 19) {
        m.skimmed = true;
        this.skims++;
        this.combo++;
        this.comboT = 1.2;
        audio.play('skim', { pitch: 1 + Math.min(this.combo, 8) * 0.08 });
        const yy = this.y + this.top + (dy > 0 ? 5 : -5);
        for (let k = 0; k < 8; k++) this.fx.spark(sx, yy, -60 - this.fx.rand() * 80, (this.fx.rand() - 0.5) * 60, 0.35, k % 2 ? '#8affe0' : '#ffffff');
        this.fx.word(this.combo > 1 ? `SKIM ×${this.combo}` : 'SKIM', sx + 10, this.y + this.top - 16, '#8affe0');
      }
    }
    // the engine leaves a trail
    if (this.fx.rand() < (this.burn ? 1 : 0.5))
      this.fx.spark(sx - 12, this.y + this.top + (this.fx.rand() - 0.5) * 2, -(this.burn ? 160 : 90) - this.fx.rand() * 40, (this.fx.rand() - 0.5) * 12, this.burn ? 0.35 : 0.2, this.burn ? '#ffd04a' : '#ff8a3a', { drag: 3 });
    const f = this.dist / this.goal;
    if (this.hits >= 3) this.result = this.score();
    else if (f >= 1 || this.time >= this.limit) {
      this.result = this.score();
      if (f >= 1) {
        this.fx.flash('#ffd04a', 0.2);
        this.fx.burst(sx + 20, this.y + this.top, 30, 120, ['#ffd04a', '#8affb0', '#ffffff']);
      }
    }
    audio.loop('engine', 'thread', this.result === null, this.burn ? 0.9 : 0.4);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    nebula(ctx, w, h, this.seed, [40, 20, 70], [70, 40, 30], this.dist * 0.15);
    stars(ctx, w, h, this.seed, this.dist * 0.6, this.burn ? 6 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const sx = this.sx;
    const oyF = this.top;
    // the way out at the far end
    const ex = Math.round(this.goal - this.dist + sx + 20);
    if (ex < w + 20) {
      for (let y = oyF; y < oyF + this.fieldH; y += 6) {
        ctx.fillStyle = Math.floor(y / 6 + t * 8) % 2 ? '#ffd04a' : '#8a6a1a';
        ctx.fillRect(ex, y, 3, 4);
      }
      glow(ctx, ex + 1, oyF + this.fieldH / 2, 60, '#ffd04a', 0.3);
      drawText(ctx, 'CLEAR', ex + 8, oyF + this.fieldH / 2 - 3, '#ffd04a');
    }
    for (const m of this.mines) {
      if (m.dead) continue;
      const x = Math.round(m.x - this.dist + sx);
      if (x < -12 || x > w + 12) continue;
      const my = this.mineY(m);
      const y = Math.round(my) + oyF;
      const near = Math.hypot(x - sx, my - this.y);
      this.mine(ctx, x, y, t, m, near);
    }
    for (const b of this.booms) {
      if (b.t > 0.6) continue;
      const x = Math.round(b.x - this.dist + sx);
      const y = Math.round(b.y) + oyF;
      const r = 4 + b.t * 70;
      glow(ctx, x, y, 30 * (1 - b.t), '#ff8a3a', 1 - b.t * 1.6);
      ctx.strokeStyle = `rgba(255,208,74,${Math.max(0, 1 - b.t * 1.8)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    fx.drawSparks(ctx);
    if (this.hurt <= 0 || Math.floor(t * 16) % 2) sideShip(ctx, sx, this.y + oyF, this.result !== null ? 0.2 : this.burn ? 1 : 0.45, '#c86a3a', t);
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.45);
    timer(ctx, w, this.limit - this.time, this.limit, t);

    // progress, hearts, skims
    const by = h - 13;
    ctx.fillStyle = 'rgba(10,7,16,0.8)';
    ctx.fillRect(0, by - 5, w, 18);
    const pw = w - 200;
    meter(ctx, 10, by, pw, 4, this.dist / this.goal, '#8affb0');
    // where you'd get to without burning any more, so you can see if you need to
    const coast = Math.min(1, (this.dist + (this.limit - this.time) * 90) / this.goal);
    ctx.fillStyle = coast < 1 ? '#ff8a7a' : '#5a7a6a';
    ctx.fillRect(10 + Math.round(pw * coast), by - 2, 1, 8);
    for (let k = 0; k < 3; k++) drawText(ctx, '♥', pw + 24 + k * 10, by - 1, k < 3 - this.hits ? '#ff5a4a' : '#3a2e48');
    drawText(ctx, `SKIMS ${this.skims}`, pw + 60, by - 1, '#8affe0');
    if (this.burn && this.result === null) drawText(ctx, 'BURN', w - 8, by - 1, Math.floor(t * 8) % 2 ? '#ffd04a' : '#ff8a3a', { align: 'right' });
    fx.drawFlash(ctx, w, h);
  }

  /** A spiked mine: its lamp blinks faster and it glows as you come near. */
  private mine(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, m: Mine, near: number) {
    const close = Math.max(0, 1 - near / 50);
    if (close > 0) glow(ctx, x, y, 14 + close * 10, '#ff3a4a', close * 0.5);
    if (m.bob) {
      ctx.fillStyle = 'rgba(138,128,152,0.25)';
      const v = Math.cos(this.time * m.bob * 2 + m.phase);
      ctx.fillRect(x - 1, y - Math.round(v * 6), 2, Math.round(v * 6));
    }
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 5, 11, 11);
    ctx.fillRect(x - 1, y - 8, 3, 17);
    ctx.fillRect(x - 8, y - 1, 17, 3);
    // spikes
    ctx.fillStyle = '#9a9aaa';
    ctx.fillRect(x, y - 7, 1, 15);
    ctx.fillRect(x - 7, y, 15, 1);
    ctx.fillRect(x - 5, y - 5, 1, 1);
    ctx.fillRect(x + 5, y - 5, 1, 1);
    ctx.fillRect(x - 5, y + 5, 1, 1);
    ctx.fillRect(x + 5, y + 5, 1, 1);
    // body
    ctx.fillStyle = m.skimmed ? '#4a5a6a' : '#5a5466';
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = '#7a748a';
    ctx.fillRect(x - 4, y - 4, 9, 2);
    ctx.fillRect(x - 4, y - 4, 2, 9);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(x - 4, y + 3, 9, 2);
    // lamp
    const rate = 2 + close * 14;
    const on = Math.floor(t * rate + m.phase) % 2 === 0;
    ctx.fillStyle = on ? '#ff3a4a' : '#5a1a24';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    if (on) glow(ctx, x + 0.5, y + 0.5, 6, '#ff3a4a', 0.6);
  }
}
