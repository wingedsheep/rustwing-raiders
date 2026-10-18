import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng } from '../../util';
import { Fx, glow, meter, ticked, timer, type Minigame, type Pad } from './common';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Crate {
  x: number;
  y: number;
  got: boolean;
  /** Seconds since it was knocked loose (it can't be picked up again straight away). */
  loose: number;
}

/**
 * Grab and go: a derelict's dark hold seen from above, crates glinting among the stacks, and the
 * hatch you came in by grinding shut. Fly the drone over crates to hook them: they trail behind
 * on a line, and every one makes you heavier. Get back out through the hatch (press the button
 * there) before it seals, or you lose the lot. Greed against time, like Spelunky. Bold: a deeper
 * hold, more crates, and the thing that lives there wakes up; press the button away from the
 * hatch to fire your flash and stun it.
 */
export class Grab implements Minigame {
  readonly title = 'GRAB AND GO';
  readonly how: string;
  result: number | null = null;
  private x = 24;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private crates: Crate[] = [];
  /** The order you hooked them in, for the line behind you. */
  private line: Crate[] = [];
  private path: { x: number; y: number }[] = [];
  private stacks: Box[] = [];
  private time = 0;
  private readonly limit: number;
  private beast = { x: 0, y: 0, stun: 0, on: false };
  private bumped = 0;
  private flash = 0;
  private flashCd = 0;
  private fx = new Fx();
  private readonly W = 480;
  private readonly top = 14;
  private readonly H: number;
  private dark: HTMLCanvasElement | null = null;
  private out = false;

  constructor(
    private bold: boolean,
    seed: number,
    h = 240,
  ) {
    const r = rng(seed);
    this.H = h - 34;
    this.how = bold
      ? 'STEER OVER CRATES TO HOOK THEM: EACH ONE SLOWS YOU. BACK TO THE HATCH AND PRESS BEFORE IT SEALS. PRESS ELSEWHERE TO FLASH THE BEAST.'
      : 'STEER OVER CRATES TO HOOK THEM: EACH ONE SLOWS YOU. GET BACK TO THE HATCH AND PRESS THE BUTTON BEFORE IT SEALS.';
    this.limit = bold ? 23 : 21;
    this.y = this.hatchY;
    // stacks of cargo in rows, with lanes between (never closing a column off)
    for (let c = 0; c < (bold ? 6 : 5); c++) {
      const x = 80 + c * (bold ? 66 : 76) + r() * 14;
      const w = 22 + r() * 14;
      const h1 = 26 + r() * 50;
      const y1 = this.top + 10 + r() * 24;
      this.stacks.push({ x, y: y1, w, h: h1 });
      const gapTop = y1 + h1 + 30;
      const y2 = Math.max(gapTop, this.top + this.H - 20 - (26 + r() * 60));
      this.stacks.push({ x: x + (r() - 0.5) * 10, y: y2, w: 22 + r() * 14, h: this.top + this.H - 10 - y2 - r() * 16 });
    }
    const n = bold ? 10 : 7;
    for (let tries = 0; this.crates.length < n && tries < 800; tries++) {
      const x = 70 + r() * (this.W - 90);
      const y = this.top + 12 + r() * (this.H - 24);
      if (this.hit(x, y, 7)) continue;
      if (this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 30)) continue;
      this.crates.push({ x, y, got: false, loose: 9 });
    }
    this.beast = { x: this.W - 30, y: this.hatchY, stun: 2.5, on: bold };
  }

  private get hatchY() {
    return this.top + this.H / 2;
  }

  private hit(x: number, y: number, rad: number) {
    if (x < 8 + rad || x > this.W - 8 - rad || y < this.top + rad || y > this.top + this.H - rad) return true;
    return this.stacks.some((b) => x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad);
  }

  private atHatch() {
    return this.x < 34 && Math.abs(this.y - this.hatchY) < 24;
  }

  private get carried() {
    return this.line.length;
  }

  status() {
    if (this.atHatch() && this.result === null) return `CRATES ${this.carried}/${this.crates.length}  AT THE HATCH: PRESS TO LEAVE`;
    const left = this.limit - this.time;
    return `CRATES ${this.carried}/${this.crates.length}${left < 5 ? '  GET OUT!' : ''}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    if (this.result !== null) {
      if (this.out) this.x -= dt * 80;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time, 5)) audio.play('ui_move', { pitch: 1.5 });
    this.bumped -= dt;
    this.flash -= dt;
    this.flashCd -= dt;
    // every crate on the line makes you slower to get going
    const acc = 560 / (1 + this.carried * 0.08);
    this.vx = (this.vx + pad.x * acc * dt) * Math.exp(-dt * 5);
    this.vy = (this.vy + pad.y * acc * dt) * Math.exp(-dt * 5);
    const nx = this.x + this.vx * dt;
    if (!this.hit(nx, this.y, 5)) this.x = nx;
    else this.vx *= -0.3;
    const ny = this.y + this.vy * dt;
    if (!this.hit(this.x, ny, 5)) this.y = ny;
    else this.vy *= -0.3;
    // the line behind you follows where you've been
    const last = this.path[0];
    if (!last || Math.hypot(last.x - this.x, last.y - this.y) > 2) {
      this.path.unshift({ x: this.x, y: this.y });
      if (this.path.length > 120) this.path.pop();
    }
    for (const c of this.crates) {
      c.loose += dt;
      if (!c.got && c.loose > 0.8 && Math.hypot(c.x - this.x, c.y - this.y) < 12) {
        c.got = true;
        this.line.push(c);
        audio.play('pickup_scrap', { pitch: 0.9 + this.carried * 0.06 });
        this.fx.burst(c.x, c.y, 10, 60, ['#ffd04a', '#ffffff']);
        this.fx.word(`${this.carried}/${this.crates.length}`, c.x, c.y - 12, '#ffd04a');
      }
    }
    this.line.forEach((c, i) => {
      const p = this.path[Math.min(this.path.length - 1, (i + 1) * 5)] ?? { x: this.x, y: this.y };
      c.x += (p.x - c.x) * Math.min(1, dt * 14);
      c.y += (p.y - c.y) * Math.min(1, dt * 14);
    });

    // the flash: away from the hatch, the button lights the hold and stuns what's in it
    if (pad.press && this.bold && !this.atHatch() && this.flashCd <= 0 && this.time > 0.3) {
      this.flash = 0.5;
      this.flashCd = 5;
      audio.play('flare');
      const b = this.beast;
      if (b.on && Math.hypot(b.x - this.x, b.y - this.y) < 100) {
        b.stun = 2.4;
        this.fx.word('STUNNED', b.x, b.y - 16, '#8affe0');
      }
    }

    // the thing in the dark comes after you, faster as it goes, and knocks your last crate loose
    const b = this.beast;
    if (b.on) {
      b.stun -= dt;
      if (b.stun <= 0) {
        const dx = this.x - b.x;
        const dy = this.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 36 + this.time * 1.8;
        b.x += (dx / d) * sp * dt;
        b.y += (dy / d) * sp * dt;
        if (d < 14 && this.bumped <= 0) {
          this.bumped = 1;
          b.stun = 1.5;
          this.fx.shake(4, 0.3);
          audio.play('player_hit', { vol: 0.7 });
          const c = this.line.pop();
          if (c) {
            c.got = false;
            c.loose = 0;
            c.x = clamp(this.x + (this.x - b.x) * 2, 20, this.W - 20);
            c.y = clamp(this.y + 14, this.top + 10, this.top + this.H - 10);
            if (this.hit(c.x, c.y, 7)) {
              c.x = this.x;
              c.y = this.y;
            }
            this.fx.word('LOST ONE!', this.x, this.y - 14, '#ff5a4a');
          }
          this.vx += (dx / d) * 160;
          this.vy += (dy / d) * 160;
        }
      }
    }
    const score = () => this.carried / this.crates.length || 0.01;
    if (pad.press && this.atHatch() && this.time > 1) {
      this.result = score();
      this.out = true;
      audio.play('warp', { vol: 0.6 });
    } else if (this.time >= this.limit) {
      this.out = this.atHatch();
      this.result = this.out ? score() : 0;
      audio.play('crash');
      this.fx.shake(5, 0.4);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    ctx.fillStyle = '#120e16';
    ctx.fillRect(-8, -8, w + 16, h + 16);
    // deck plates
    const bot = this.top + this.H;
    for (let y = this.top; y < bot; y += 16)
      for (let x = 8; x < this.W - 8; x += 16) {
        ctx.fillStyle = (x / 16 + y / 16) % 2 < 1 ? '#262030' : '#221c2a';
        ctx.fillRect(x, y, 15, 15);
        ctx.fillStyle = '#2e2838';
        ctx.fillRect(x, y, 15, 1);
      }
    // stripes on the deck by the hatch
    for (let y = this.hatchY - 24; y < this.hatchY + 24; y += 6) {
      ctx.fillStyle = '#3a3018';
      ctx.fillRect(10, y, 22, 3);
    }
    // stacks: a lit top and a dark south face
    for (const b of this.stacks) {
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      const bw = Math.round(b.w);
      const bh = Math.round(b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 3, y + 4, bw, bh);
      ctx.fillStyle = '#3a3040';
      ctx.fillRect(x, y + bh - 5, bw, 5);
      ctx.fillStyle = '#5a4e5e';
      ctx.fillRect(x, y, bw, bh - 5);
      ctx.fillStyle = '#6e6272';
      ctx.fillRect(x, y, bw, 2);
      for (let yy = y + 9; yy < y + bh - 6; yy += 10) {
        ctx.fillStyle = '#4a3e4e';
        ctx.fillRect(x + 1, yy, bw - 2, 1);
      }
      ctx.fillStyle = '#4a3e4e';
      ctx.fillRect(x + Math.round(bw / 2), y + 2, 1, bh - 7);
    }
    // the line, then the crates
    if (this.line.length) {
      ctx.strokeStyle = 'rgba(200,188,216,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (const c of this.line) ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    for (const c of this.crates) this.crate(ctx, c, t);
    // the beast: a dark mass with too many legs
    const b = this.beast;
    if (b.on) {
      const bx = Math.round(b.x);
      const by = Math.round(b.y);
      const moving = b.stun <= 0;
      ctx.fillStyle = '#1a0610';
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (moving ? Math.sin(t * 10 + k) * 0.35 : 0);
        for (let s = 4; s < 15; s++) ctx.fillRect(Math.round(bx + Math.cos(a) * s), Math.round(by + Math.sin(a) * s + Math.sin(s * 0.5) * 1.5), 2, 2);
      }
      ctx.fillStyle = '#3a0e24';
      ctx.fillRect(bx - 7, by - 6, 14, 12);
      ctx.fillStyle = '#5a1a34';
      ctx.fillRect(bx - 6, by - 6, 12, 3);
    }
    // your drone
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (!(this.out && this.x < 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 4, y - 1, 11, 9);
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 6, y - 6, 12, 11);
      ctx.fillStyle = this.bumped > 0 && Math.floor(t * 20) % 2 ? '#ff5a4a' : '#6ad0c8';
      ctx.fillRect(x - 5, y - 5, 10, 9);
      ctx.fillStyle = '#8affe0';
      ctx.fillRect(x - 5, y - 5, 10, 2);
      ctx.fillStyle = '#2a6a5a';
      ctx.fillRect(x - 3, y - 2, 6, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      // rotors
      const spin = Math.floor(t * 30) % 2;
      ctx.fillStyle = '#c8f0ff';
      for (const [rx, ry] of [[-7, -7], [6, -7], [-7, 5], [6, 5]]) ctx.fillRect(x + rx - (spin ? 1 : 0), y + ry, spin ? 3 : 1, spin ? 1 : 3);
    }
    fx.drawSparks(ctx);

    this.lights(ctx, w, h, t);

    // things you see in the dark: crate glints, the beast's eyes, the hatch
    for (const c of this.crates) {
      if (c.got) continue;
      if (Math.sin(t * 3 + c.x * 0.1) > 0.6) {
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(Math.round(c.x) - 5, Math.round(c.y) - 5, 1, 1);
        glow(ctx, c.x - 4, c.y - 4, 5, '#ffd04a', 0.6);
      }
    }
    if (b.on) {
      const eye = b.stun > 0 ? '#5a4a5a' : '#ff3a5a';
      ctx.fillStyle = eye;
      ctx.fillRect(Math.round(b.x) - 4, Math.round(b.y) - 2, 2, 2);
      ctx.fillRect(Math.round(b.x) + 2, Math.round(b.y) - 2, 2, 2);
      if (b.stun <= 0) {
        glow(ctx, b.x, b.y - 1, 10, '#ff3a5a', 0.5);
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        if (d < 60) glow(ctx, b.x, b.y, 40, '#ff3a5a', 0.15 * (1 - d / 60));
      } else drawText(ctx, '*', Math.round(b.x), Math.round(b.y) - 14, '#8affe0', { align: 'center' });
    }
    this.hatch(ctx, t);
    fx.drawWords(ctx);
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    this.footer(ctx, w, h, t);
    fx.drawFlash(ctx, w, h);
  }

  private crate(ctx: CanvasRenderingContext2D, c: Crate, t: number) {
    if (c.loose < 0.8 && Math.floor(t * 12) % 2) return;
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 3, y - 2, 10, 9);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 6, y - 6, 12, 11);
    ctx.fillStyle = '#c88a3a';
    ctx.fillRect(x - 5, y - 5, 10, 9);
    ctx.fillStyle = '#e8aa5a';
    ctx.fillRect(x - 5, y - 5, 10, 2);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(x - 5, y + 2, 10, 2);
    ctx.fillRect(x - 1, y - 3, 2, 5);
  }

  /** The dark: a black sheet with holes for your lamp, the hatch's light and the flash. */
  private lights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = w;
      this.dark.height = h;
    }
    const g = this.dark.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    const fl = Math.max(0, this.flash) * 2;
    g.fillStyle = `rgba(6,4,12,${(this.bold ? 0.9 : 0.8) * (1 - Math.min(1, fl))})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const flicker = 1 + Math.sin(t * 23) * 0.02 + Math.sin(t * 7) * 0.03;
    hole(this.x, this.y, (this.bold ? 64 : 76) * flicker);
    hole(16, this.hatchY, 54, 0.9);
    ctx.drawImage(this.dark, 0, 0);
    // a warm wash where the lamp falls
    glow(ctx, this.x, this.y, 50, '#8affe0', 0.08);
    glow(ctx, 16, this.hatchY, 50, '#ffd04a', 0.18);
  }

  /** The hatch: two doors grinding shut, a beacon going round. */
  private hatch(ctx: CanvasRenderingContext2D, t: number) {
    const left = Math.max(0, 1 - this.time / this.limit);
    const hy = this.hatchY;
    const open = Math.round(24 * left);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(0, this.top, 8, this.H);
    ctx.fillStyle = '#4a4458';
    ctx.fillRect(0, this.top, 8, 2);
    // the gap: light from outside
    ctx.fillStyle = '#ffe8a0';
    ctx.fillRect(0, hy - open, 4, open * 2);
    // the doors' edges, striped
    for (const s of [-1, 1]) {
      const ey = s < 0 ? hy - open - 8 : hy + open;
      for (let k = 0; k < 8; k += 2) {
        ctx.fillStyle = (k / 2) % 2 ? '#2a2236' : '#ffd04a';
        ctx.fillRect(0, ey + k, 8, 2);
      }
    }
    const urgent = left < 0.3;
    const pulse = urgent ? Math.floor(t * 6) % 2 : Math.floor(t * 2) % 2;
    glow(ctx, 6, hy, 30 + open, urgent ? '#ff5a4a' : '#ffd04a', pulse ? 0.5 : 0.25);
    if (this.atHatch() && this.result === null) {
      ctx.strokeStyle = Math.floor(t * 4) % 2 ? '#8affb0' : '#3a8a5a';
      ctx.lineWidth = 1;
      ctx.strokeRect(9.5, hy - 23.5, 24, 47);
    }
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fy = h - 16;
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(0, fy - 4, w, 20);
    drawText(ctx, '← HATCH', 6, fy, this.limit - this.time < 5 ? '#ff5a4a' : '#ffd04a');
    // the haul: a box per crate
    const n = this.crates.length;
    const x0 = Math.round(w / 2 - (n * 9) / 2);
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = k < this.carried ? '#c88a3a' : '#2a2236';
      ctx.fillRect(x0 + k * 9, fy, 7, 7);
      if (k < this.carried) {
        ctx.fillStyle = '#e8aa5a';
        ctx.fillRect(x0 + k * 9, fy, 7, 1);
      }
    }
    if (this.bold) {
      drawText(ctx, 'FLASH', w - 96, fy, '#8a8098');
      meter(ctx, w - 62, fy + 1, 50, 4, 1 - Math.max(0, this.flashCd) / 5, this.flashCd <= 0 ? '#8affe0' : '#4a6a7a');
    } else if (this.atHatch() && this.result === null && Math.floor(t * 3) % 2) drawText(ctx, 'PRESS TO LEAVE', w - 8, fy, '#8affb0', { align: 'right' });
    if (this.bold && this.atHatch() && this.result === null && Math.floor(t * 3) % 2) drawText(ctx, 'PRESS TO LEAVE', w / 2, fy - 14, '#8affb0', { align: 'center' });
  }
}
