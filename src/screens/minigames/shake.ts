import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { rng, TAU, type Rng } from '../../util';
import { Fx, glow, meter, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

interface Leech {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where on the hull it's clamped (an angle and a reach), once it has. */
  at: { a: number; r: number } | null;
  /** How long it's been on: the longer, the harder it holds. */
  on: number;
  hp: number;
  big: boolean;
  /** Flung off and tumbling away. */
  gone: number;
  flap: number;
}

/**
 * Shake them off: your ship from above, hull leeches flapping in from the dark to clamp on to its
 * fuel lines. Each one that's on drinks your fuel, and holds harder the longer it's been there.
 * Throw the stick from side to side to roll the ship: every hard roll flings off whatever hasn't
 * got a grip yet. The button arcs a charge into the leech you're facing (point the stick at it),
 * whatever its grip, but it needs a moment to build again. Bold: more of them, and a big one that
 * takes three zaps.
 */
export class Shake implements Minigame {
  readonly title = 'SHAKE THEM OFF';
  readonly how = 'THROW THE STICK LEFT AND RIGHT TO ROLL: HARD ROLLS FLING OFF FRESH LEECHES. POINT AT ONE AND PRESS TO ZAP IT, HOWEVER TIGHT IT HOLDS.';
  result: number | null = null;
  private leeches: Leech[] = [];
  private fuel = 1;
  private time = 0;
  private readonly limit = 20;
  private roll = 0;
  private rollV = 0;
  private lastSide = 0;
  private shakes = 0;
  private zapCd = 0;
  private zapT = 0;
  private zapTo: { x: number; y: number } | null = null;
  private aim = -Math.PI / 2;
  private next = 0.6;
  private fx = new Fx();
  private r: Rng;
  private readonly cx = 240;
  private readonly cy = 126;
  private flung = 0;

  constructor(
    private bold: boolean,
    seed: number,
  ) {
    this.r = rng(seed);
    if (bold) this.spawn(true);
  }

  private spawn(big = false) {
    const a = this.r() * TAU;
    const d = 280;
    const x = this.cx + Math.cos(a) * d;
    const y = this.cy + Math.sin(a) * d * 0.6;
    this.leeches.push({ x, y, vx: 0, vy: 0, at: null, on: 0, hp: big ? 3 : 1, big, gone: 0, flap: this.r() * TAU });
  }

  status() {
    const on = this.leeches.filter((l) => l.at && !l.gone).length;
    return `FUEL ${Math.round(this.fuel * 100)}%  ·  ${on ? `${on} ON YOUR HULL` : 'HULL CLEAR'}  ·  FLUNG ${this.flung}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    this.zapT -= dt;
    if (this.result !== null) {
      for (const l of this.leeches) this.drift(l, dt);
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    if (this.time >= this.limit) {
      this.result = Math.max(0, Math.min(1, (this.fuel - 0.35) / 0.6));
      return;
    }
    // more come the longer it goes on
    this.next -= dt;
    if (this.next <= 0) {
      this.spawn();
      this.next = (this.bold ? 0.85 : 1.25) * (0.7 + this.r() * 0.6) * (1 - this.time / this.limit * 0.35);
    }
    // rolling: the stick throws the ship, and a hard change of side is a shake
    if (Math.abs(pad.x) > 0.2 || Math.abs(pad.y) > 0.2) this.aim = Math.atan2(pad.y, pad.x);
    this.rollV += (pad.x * 9 - this.roll * 6) * dt * 6;
    this.rollV *= Math.exp(-dt * 4);
    this.roll += this.rollV * dt;
    const side = pad.x > 0.75 ? 1 : pad.x < -0.75 ? -1 : 0;
    if (side && side !== this.lastSide) {
      if (this.lastSide) this.shake();
      this.lastSide = side;
    }
    // the zap
    this.zapCd -= dt;
    if (pad.press && this.zapCd <= 0) this.zap();
    for (const l of this.leeches) this.move(l, dt);
    this.leeches = this.leeches.filter((l) => l.gone < 1.5);
  }

  /** A hard roll: whatever hasn't a grip yet comes off. */
  private shake() {
    this.shakes++;
    this.fx.shake(3);
    audio.play('dash', { vol: 0.6 });
    for (const l of this.leeches) {
      if (!l.at || l.gone) continue;
      const grip = l.on * (l.big ? 0.5 : 1);
      if (grip < (this.bold ? 1.1 : 1.4)) this.fling(l, false);
    }
  }

  private zap() {
    this.zapCd = this.bold ? 0.75 : 0.6;
    // the one nearest the way you're pointing, flying or clamped
    let best: Leech | null = null;
    let bd = Infinity;
    for (const l of this.leeches) {
      if (l.gone) continue;
      const a = Math.atan2(l.y - this.cy, l.x - this.cx);
      const da = Math.abs(Math.atan2(Math.sin(a - this.aim), Math.cos(a - this.aim)));
      const dist = Math.hypot(l.x - this.cx, l.y - this.cy);
      if (dist > 170) continue;
      const score = da * 80 + dist * 0.3;
      if (da < 0.9 && score < bd) {
        bd = score;
        best = l;
      }
    }
    audio.play('lightning', { vol: 0.5 });
    this.zapT = 0.14;
    if (!best) {
      this.zapTo = { x: this.cx + Math.cos(this.aim) * 120, y: this.cy + Math.sin(this.aim) * 120 };
      return;
    }
    this.zapTo = { x: best.x, y: best.y };
    best.hp--;
    this.fx.burst(best.x, best.y, 10, 80, ['#b48aff', '#ffffff']);
    if (best.hp <= 0) this.fling(best, true);
    else this.fx.word('ZAP', best.x, best.y - 12, '#b48aff');
  }

  private fling(l: Leech, zapped: boolean) {
    const a = Math.atan2(l.y - this.cy, l.x - this.cx);
    l.vx = Math.cos(a) * 220;
    l.vy = Math.sin(a) * 220;
    l.at = null;
    l.gone = 0.01;
    this.flung++;
    this.fx.burst(l.x, l.y, zapped ? 16 : 10, 100, zapped ? ['#b48aff', '#ff8a5a'] : ['#ff8a5a', '#7a3a22'], { grav: 0 });
    this.fx.word(zapped ? 'FRIED' : 'FLUNG', l.x, l.y - 10, zapped ? '#b48aff' : '#ffb04a');
    audio.play(zapped ? 'kill' : 'eat', { vol: 0.7 });
  }

  private drift(l: Leech, dt: number) {
    if (l.gone) {
      l.gone += dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
    }
  }

  private move(l: Leech, dt: number) {
    l.flap += dt * (l.at ? 6 : 16);
    if (l.gone) return this.drift(l, dt);
    if (!l.at) {
      // flap in towards the hull
      const dx = this.cx - l.x;
      const dy = this.cy - l.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = (l.big ? 46 : 62) + this.time * 1.5;
      l.vx += ((dx / d) * sp - l.vx) * dt * 2.5 + Math.sin(l.flap) * 20 * dt;
      l.vy += ((dy / d) * sp - l.vy) * dt * 2.5 + Math.cos(l.flap * 0.7) * 20 * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (d < 30) {
        l.at = { a: Math.atan2(l.y - this.cy, l.x - this.cx) - this.roll * 0.3, r: 18 + this.r() * 10 };
        audio.play('hook', { vol: 0.5 });
        this.fx.burst(l.x, l.y, 6, 40, ['#ff8a5a']);
      }
      return;
    }
    // clamped on: it turns with the hull, and drinks
    l.on += dt;
    const a = l.at.a + this.roll * 0.3;
    l.x = this.cx + Math.cos(a) * l.at.r;
    l.y = this.cy + Math.sin(a) * l.at.r * 0.75;
    this.fuel = Math.max(0, this.fuel - dt * (l.big ? 0.03 : 0.014) * (1 + l.on * 0.15));
    if (this.r() < dt * 3) this.fx.spark(l.x, l.y, (this.r() - 0.5) * 40, (this.r() - 0.5) * 40, 0.3, '#ffd04a', { glow: true });
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#07050c';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, 0x1eec, t * 10 + this.roll * 30, 0, t);
    glow(ctx, w * 0.82, h * 0.2, 90, '#ffb04a', 0.18);
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    this.ship(ctx, t);
    // the zap's arc
    if (this.zapT > 0 && this.zapTo) {
      ctx.strokeStyle = '#d8c0ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      const n = 7;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const jx = k < n ? (Math.random() - 0.5) * 10 : 0;
        const jy = k < n ? (Math.random() - 0.5) * 10 : 0;
        ctx.lineTo(this.cx + (this.zapTo.x - this.cx) * f + jx, this.cy + (this.zapTo.y - this.cy) * f + jy);
      }
      ctx.stroke();
      glow(ctx, this.zapTo.x, this.zapTo.y, 20, '#b48aff', 0.6);
    }
    for (const l of this.leeches) this.leech(ctx, l);
    // where the zap would go
    const ax = this.cx + Math.cos(this.aim) * 44;
    const ay = this.cy + Math.sin(this.aim) * 44;
    ctx.fillStyle = this.zapCd <= 0 ? '#d8c0ff' : '#4a3e58';
    ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3);
    ctx.restore();
    this.fx.drawSparks(ctx);
    this.fx.drawWords(ctx);
    vignette(ctx, w, h, 0.6);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    drawText(ctx, 'FUEL', 8, h - 16, '#ffb04a');
    meter(ctx, 36, h - 15, 160, 5, this.fuel, this.fuel > 0.6 ? '#ffb04a' : this.fuel > 0.35 ? '#ff8a3a' : '#ff5a4a');
    drawText(ctx, this.zapCd <= 0 ? 'ZAP READY' : 'CHARGING', w - 8, h - 16, this.zapCd <= 0 ? '#d8c0ff' : '#6a5e7a', { align: 'right' });
    this.fx.drawFlash(ctx, w, h);
  }

  /** Your ship from above, rolling. */
  private ship(ctx: CanvasRenderingContext2D, t: number) {
    const { cx, cy } = this;
    const sq = Math.cos(this.roll * 0.6);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1);
    // engine glow behind
    glow(ctx, -26, 0, 22, '#ff9a3a', 0.4 + 0.1 * Math.sin(t * 30));
    // wings, foreshortened by the roll
    ctx.fillStyle = DARK;
    ctx.fillRect(-14, -30 * sq - 1, 16, 60 * sq + 2);
    ctx.fillStyle = '#7a3a22';
    ctx.fillRect(-13, -30 * sq, 14, 60 * sq);
    ctx.fillStyle = '#a85a32';
    ctx.fillRect(-13, -30 * sq, 14, 2);
    // hull
    ctx.fillStyle = DARK;
    ctx.fillRect(-26, -9, 52, 18);
    ctx.fillStyle = '#c86a3a';
    ctx.fillRect(-25, -8, 50, 16);
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(-25, -8, 50, 3);
    ctx.fillStyle = '#f4e4c8';
    ctx.fillRect(10, -8, 10, 16);
    ctx.fillStyle = '#2a6a7a';
    ctx.fillRect(14, -4, 7, 8);
    // fuel lines, glowing where something drinks
    const drinking = this.leeches.some((l) => l.at && !l.gone);
    ctx.fillStyle = drinking && Math.floor(t * 8) % 2 ? '#ffd04a' : '#ffb04a';
    ctx.fillRect(-22, -2, 30, 1);
    ctx.fillRect(-22, 2, 30, 1);
    ctx.restore();
  }

  private leech(ctx: CanvasRenderingContext2D, l: Leech) {
    const s = l.big ? 1.8 : 1;
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    if (l.gone) ctx.globalAlpha = Math.max(0, 1 - l.gone / 1.5);
    // wings: leathery, beating
    const beat = Math.sin(l.flap) * (l.at ? 2 : 6) * s;
    ctx.fillStyle = '#5a2a2a';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9 * s, y - 4 * s + beat);
    ctx.lineTo(x - 5 * s, y + 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 9 * s, y - 4 * s + beat);
    ctx.lineTo(x + 5 * s, y + 2 * s);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.ellipse(x, y, 4.5 * s, 3.5 * s, 0, 0, TAU);
    ctx.fill();
    const fat = l.at ? Math.min(1, l.on / 6) : 0;
    ctx.fillStyle = l.big ? '#a85a5a' : '#c87a5a';
    ctx.beginPath();
    ctx.ellipse(x, y, (3.5 + fat) * s, (2.5 + fat * 0.6) * s, 0, 0, TAU);
    ctx.fill();
    // a grip you can see: the longer it's on, the redder the ring
    if (l.at) {
      const grip = Math.min(1, l.on / (this.bold ? 1.1 : 1.4));
      ctx.strokeStyle = grip >= 1 ? '#ff5a4a' : '#ffd04a';
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      ctx.arc(x, y, 7 * s, -Math.PI / 2, -Math.PI / 2 + TAU * grip);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
