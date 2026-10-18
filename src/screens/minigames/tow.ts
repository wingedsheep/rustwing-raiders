import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { noise2, rng, type Rng } from '../../util';
import { Fx, glow, meter, nebula, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

/**
 * Keep it taut: a cable (or Nell's fuel hose) with something heavy on the other end. Hold the
 * button to pull harder, let go to ease off. The tension has weight to it (it climbs and falls
 * like Stardew's fishing bar), and the sweet spot wanders as the load swings. Keep the needle in
 * the green to tow, the meter fills; outside it drains. Into the red too long and it snaps. When
 * the load's lamp flashes, it's about to lurch. Bold: a narrow band that wanders further, harder
 * lurches, and a heavier load.
 */
export class Tow implements Minigame {
  readonly title = 'KEEP IT TAUT';
  readonly how = 'HOLD THE BUTTON TO PULL, LET GO TO EASE OFF. KEEP THE NEEDLE IN THE GREEN. WHEN THE LAMP FLASHES, IT LURCHES.';
  result: number | null = null;
  private tension = 0.3;
  private tv = 0;
  private progress = 0;
  private strain = 0;
  private time = 0;
  private readonly limit = 24;
  private readonly need: number;
  private readonly band: number;
  private readonly roam: number;
  private readonly heavy: number;
  private snapped = false;
  private r: Rng;
  /** The band's resting centre and the jump the next lurch gives it. */
  private shift = 0;
  private nextLurch: number;
  /** Seconds of warning left before a lurch (or 0). */
  private tell = 0;
  private lurchDir = 1;
  private sway = 0;
  private inBand = false;
  private warned = false;
  private fx = new Fx();
  private hold = false;

  constructor(
    private bold: boolean,
    private seed: number,
  ) {
    this.r = rng(seed);
    this.need = bold ? 10 : 10;
    this.band = bold ? 0.15 : 0.2;
    this.roam = bold ? 0.2 : 0.12;
    this.heavy = bold ? 1.25 : 1;
    this.nextLurch = 2.5 + this.r() * 2;
  }

  /** The middle of the green band: it wanders, and lurches shove it. */
  private centre() {
    const drift = (noise2(this.time * (this.bold ? 0.45 : 0.3), this.seed % 89) - 0.5) * 2 * this.roam;
    return Math.max(0.2, Math.min(0.78, 0.52 + drift + this.shift));
  }

  private get red() {
    return 0.92;
  }

  status() {
    if (this.snapped) return 'SNAPPED!';
    if (this.tell > 0) return 'IT IS ABOUT TO LURCH!';
    return `TOWED ${Math.round((this.progress / this.need) * 100)}%${this.strain > 0.4 ? '  EASE OFF!' : ''}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    if (this.result !== null) return;
    const before = this.limit - this.time;
    this.time += dt;
    this.hold = pad.hold;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });

    // lurches: a warning, then the load bucks and the sweet spot jumps
    this.nextLurch -= dt;
    if (this.tell <= 0 && this.nextLurch <= 0.7 && this.nextLurch > 0) {
      this.tell = this.nextLurch;
      const c = this.centre();
      this.lurchDir = c > 0.6 ? -1 : c < 0.4 ? 1 : this.r() < 0.5 ? -1 : 1;
      audio.play('aux_ready', { pitch: 0.7 });
    }
    if (this.tell > 0) this.tell -= dt;
    if (this.nextLurch <= 0) {
      const size = (this.bold ? 0.17 : 0.12) + this.r() * 0.06;
      this.shift = Math.max(-0.3, Math.min(0.3, this.shift + this.lurchDir * size));
      this.tv += this.lurchDir * (this.bold ? 0.75 : 0.5);
      this.sway = this.lurchDir;
      this.tell = 0;
      this.nextLurch = (this.bold ? 2.2 : 3.2) + this.r() * 1.8;
      this.fx.shake(3, 0.3);
      audio.play('ram', { pitch: 0.8, vol: 0.7 });
    }
    this.shift *= Math.exp(-dt * 0.25);
    this.sway *= Math.exp(-dt * 2);

    // the needle has weight: the button pulls it up, the load drags it down
    const up = 2.3 / this.heavy;
    const down = 1.7 * this.heavy;
    this.tv += (pad.hold ? up : -down) * dt;
    this.tv *= Math.exp(-dt * 1.1);
    this.tension += this.tv * dt;
    if (this.tension < 0) {
      this.tension = 0;
      this.tv = Math.max(0, -this.tv * 0.25);
    }
    if (this.tension > 1.1) {
      this.tension = 1.1;
      this.tv = Math.min(0, this.tv);
    }

    const c = this.centre();
    const was = this.inBand;
    this.inBand = Math.abs(this.tension - c) <= this.band / 2;
    if (this.inBand) this.progress += dt;
    else this.progress = Math.max(0, this.progress - dt * 0.4);
    if (this.inBand && !was) audio.play('ui_place', { pitch: 1.2, vol: 0.5 });
    const p = Math.floor((this.progress / this.need) * 4);
    if (p > Math.floor(((this.progress - dt) / this.need) * 4) && p > 0 && p < 4) {
      audio.play('pickup_scrap', { pitch: 0.8 + p * 0.15 });
      this.fx.word(`${p * 25}%`, 186, 70, '#8affb0');
    }

    if (this.tension > this.red) {
      this.strain += dt * (this.bold ? 1.4 : 1.15);
      if (this.r() < dt * 30) this.fx.spark(110, 104, 30 + this.r() * 60, -40 + this.r() * 80, 0.4, this.r() < 0.5 ? '#ffd04a' : '#ffffff', { grav: 120 });
      if (this.strain > 0.45 && !this.warned) {
        this.warned = true;
        audio.play('overheat');
      }
    } else {
      this.strain = Math.max(0, this.strain - dt * 0.45);
      if (this.strain < 0.2) this.warned = false;
    }

    if (this.strain >= 1) {
      this.snapped = true;
      this.result = Math.min(0.2, (this.progress / this.need) * 0.3);
      this.fx.burst(186, 120, 40, 160, ['#ffd04a', '#ffffff', '#ff8a3a'], { grav: 60 });
      this.fx.shake(6, 0.5);
      this.fx.flash('#ff8a3a');
      audio.play('shield_break');
    } else if (this.progress >= this.need) {
      this.result = 1;
      this.fx.flash('#8affb0', 0.25);
    } else if (this.time >= this.limit) this.result = Math.min(1, this.progress / this.need);
    audio.loop('engine', 'tow', this.result === null && pad.hold, 0.4 + this.tension * 0.5);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    nebula(ctx, w, h, this.seed, [70, 30, 60], [30, 50, 90], this.progress * 30);
    stars(ctx, w, h, this.seed, this.progress * 60 + t * 4, this.inBand ? 3 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);

    const T = this.tension;
    const sceneW = w - 96;
    // the two ships, the cable between them sagging when slack
    const shake = T > this.red ? Math.round(Math.sin(t * 70) * 1.5) : 0;
    const ax = 96 + shake;
    const ay = 104 + Math.round(Math.sin(t * 2) * 3);
    const bx = sceneW - 120;
    const by = 110 + Math.round(Math.sin(t * 1.3 + 1) * 5 + this.sway * 14 + (this.tell > 0 ? Math.sin(t * 40) * 1.5 : 0));
    const x0 = ax + 12;
    const x1 = bx - 4;
    const sag = Math.pow(1 - Math.min(1, T), 1.6) * 60;
    const thrum = T > 0.75 ? (T - 0.75) * 10 : 0;
    const danger = T > this.red;
    const good = this.inBand && !this.snapped;
    const n = Math.round(x1 - x0);
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      if (this.snapped && f > 0.42 && f < 0.62) continue;
      const x = x0 + (x1 - x0) * f;
      let y = ay + (by - ay) * f + Math.sin(f * Math.PI) * sag + Math.sin(f * Math.PI * 3) * Math.sin(t * 45) * thrum;
      if (this.snapped) y += (f < 0.5 ? f : 1 - f) * 50 + Math.sin(f * 20 + t * 6) * 4;
      ctx.fillStyle = DARK;
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 4);
      ctx.fillStyle = this.snapped ? '#5a4a5a' : danger ? (Math.floor(t * 14) % 2 ? '#ff5a4a' : '#ffd04a') : good ? '#c8f0d8' : '#a89cb8';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      if (k % 8 === 0 && !this.snapped) {
        ctx.fillStyle = '#5a5070';
        ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
      }
    }
    if (good) glow(ctx, (x0 + x1) / 2, (ay + by) / 2 + sag * 0.7, 50, '#8affb0', 0.12);

    this.hulk(ctx, bx, by, t);

    // you, pulling to the left
    ctx.save();
    ctx.translate(ax * 2, 0);
    ctx.scale(-1, 1);
    sideShip(ctx, ax, ay, this.result === null ? (this.hold ? 0.7 + T * 0.3 : 0.25) : 0, '#c86a3a', t);
    ctx.restore();
    if (this.hold && this.result === null && fx.rand() < 0.6)
      fx.spark(ax + 22 + fx.rand() * 4, ay + (fx.rand() - 0.5) * 3, 50 + fx.rand() * 40, (fx.rand() - 0.5) * 20, 0.35, fx.rand() < 0.5 ? '#ffd04a' : '#ff8a3a');
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.5);

    this.gauge(ctx, w, h, t);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The load: a fat old freighter, its lamp flashing before a lurch. */
  private hulk(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 2, y - 20, 92, 42);
    ctx.fillRect(x + 50, y - 30, 26, 12);
    // body
    ctx.fillStyle = '#4a4458';
    ctx.fillRect(x, y - 18, 88, 38);
    ctx.fillStyle = '#5e5870';
    ctx.fillRect(x, y - 18, 88, 3);
    ctx.fillStyle = '#34304a';
    ctx.fillRect(x, y + 10, 88, 10);
    // plates and rust
    ctx.fillStyle = '#3e3a50';
    for (let k = 1; k < 6; k++) ctx.fillRect(x + k * 15, y - 15, 1, 25);
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(x + 22, y - 6, 9, 4);
    ctx.fillRect(x + 58, y + 2, 6, 5);
    ctx.fillStyle = '#9a5a2a';
    ctx.fillRect(x + 23, y - 6, 4, 1);
    // bridge and a bent mast
    ctx.fillStyle = '#5e5870';
    ctx.fillRect(x + 52, y - 28, 22, 10);
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(x + 55, y - 25, 16, 3);
    ctx.fillStyle = '#8a8098';
    ctx.fillRect(x + 64, y - 38, 1, 10);
    ctx.fillRect(x + 65, y - 41, 3, 1);
    // tow eye at the nose
    ctx.fillStyle = '#8a8098';
    ctx.fillRect(x - 6, y - 2, 6, 5);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 1, 3, 3);
    // the lamp: steady dim, flashing hard before a lurch
    const warn = this.tell > 0 && Math.floor(t * 12) % 2 === 0;
    ctx.fillStyle = warn ? '#ffffff' : '#7a2a34';
    ctx.fillRect(x + 76, y - 13, 4, 4);
    if (warn) {
      glow(ctx, x + 78, y - 11, 34, '#ff5a4a', 0.9);
      drawText(ctx, '!', x + 78, y - 34, '#ff5a4a', { align: 'center', scale: 2 });
    } else glow(ctx, x + 78, y - 11, 8, '#ff5a4a', 0.3);
  }

  /** Stardew's bar, turned to fit: tension up the side, the green band, the meter beside it. */
  private gauge(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const gx = w - 64;
    const gy = 32;
    const gh = h - gy - 34;
    const gw = 22;
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(gx - 8, gy - 14, 82, gh + 40);
    ctx.fillStyle = DARK;
    ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(gx, gy, gw, gh);
    const Y = (v: number) => gy + gh - Math.round((v / 1.1) * gh);
    // the red
    const ry = Y(this.red);
    ctx.fillStyle = this.strain > 0 && Math.floor(t * 10) % 2 ? '#8a2a30' : '#4a1a24';
    ctx.fillRect(gx, gy, gw, ry - gy);
    for (let y = gy; y < ry; y += 4) {
      ctx.fillStyle = '#5a2430';
      ctx.fillRect(gx, y, gw, 1);
    }
    // the green band
    const c = this.centre();
    const top = Y(c + this.band / 2);
    const bot = Y(c - this.band / 2);
    ctx.fillStyle = this.inBand ? '#3aa86a' : '#2a6a4a';
    ctx.fillRect(gx, top, gw, bot - top);
    ctx.fillStyle = this.inBand ? '#8affb0' : '#4a9a6a';
    ctx.fillRect(gx, top, gw, 1);
    ctx.fillRect(gx, bot - 1, gw, 1);
    if (this.inBand) glow(ctx, gx + gw / 2, (top + bot) / 2, 26, '#8affb0', 0.25);
    if (this.tell > 0) {
      // where it's about to go
      const ay = Y(c + this.lurchDir * 0.14);
      if (Math.floor(t * 10) % 2) drawText(ctx, this.lurchDir > 0 ? '▲' : '▼', gx + gw / 2, ay - 3, '#ff8a7a', { align: 'center' });
    }
    // the needle
    const ny = Y(this.tension);
    ctx.fillStyle = DARK;
    ctx.fillRect(gx - 5, ny - 2, gw + 10, 5);
    ctx.fillStyle = this.tension > this.red ? '#ff5a4a' : '#f4ecd8';
    ctx.fillRect(gx - 4, ny - 1, gw + 8, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx - 4, ny - 1, gw + 8, 1);
    drawText(ctx, 'SNAP', gx + gw / 2, gy - 11, '#ff8a7a', { align: 'center' });
    drawText(ctx, 'SLACK', gx + gw / 2, gy + gh + 6, '#8a8098', { align: 'center' });

    // the tow meter, filling up beside it
    const mx = gx + gw + 10;
    const mw = 8;
    ctx.fillStyle = DARK;
    ctx.fillRect(mx - 1, gy - 1, mw + 2, gh + 2);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(mx, gy, mw, gh);
    const f = Math.min(1, this.progress / this.need);
    const fh = Math.round(gh * f);
    ctx.fillStyle = f > 0.75 ? '#8affb0' : f > 0.4 ? '#c8e86a' : '#ffd04a';
    ctx.fillRect(mx, gy + gh - fh, mw, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(mx, gy + gh - fh, mw, 1);
    for (let k = 1; k < 4; k++) {
      ctx.fillStyle = '#120c18';
      ctx.fillRect(mx, gy + Math.round((gh * k) / 4), mw, 1);
    }
    drawText(ctx, 'TOW', mx + mw / 2, gy - 11, '#8affb0', { align: 'center' });
    // strain, a crack across the top
    if (this.strain > 0.05) meter(ctx, gx - 4, gy - 2 - 4, gw + 8, 2, this.strain, '#ff5a4a');
  }
}
