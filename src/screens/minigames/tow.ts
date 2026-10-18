import { drawText } from '../../ui/font';
import { noise2, rng, type Rng } from '../../util';
import { sideShip, stars, timer, type Minigame, type Pad } from './common';

/**
 * Keep it taut: a cable (or Nell's fuel hose) with something heavy on the other end. Hold the
 * button to pull, let go to ease off; gusts and lurches push the tension about. In the green band
 * the tow goes on; slack gets you nowhere; too tight for too long and it snaps. Bold: a narrow band
 * that wanders, and worse lurches.
 */
export class Tow implements Minigame {
  readonly title = 'KEEP IT TAUT';
  readonly how = 'HOLD THE BUTTON TO PULL, LET GO TO EASE OFF. STAY IN THE GREEN; TOO TIGHT TOO LONG AND IT SNAPS.';
  result: number | null = null;
  private tension = 0.35;
  private progress = 0;
  private strain = 0;
  private time = 0;
  private readonly limit = 22;
  private readonly need: number;
  private readonly band: number;
  private readonly gusts: number;
  private snapped = false;
  private r: Rng;
  private kick = 0;

  constructor(
    private bold: boolean,
    private seed: number,
  ) {
    this.r = rng(seed);
    this.need = bold ? 13 : 11;
    this.band = bold ? 0.16 : 0.26;
    this.gusts = bold ? 1.25 : 0.7;
  }

  /** The middle of the green band (it wanders when bold). */
  private centre() {
    return this.bold ? 0.6 + Math.sin(this.time * 0.7) * 0.14 : 0.6;
  }

  status() {
    if (this.snapped) return 'SNAPPED!';
    return `TOWED ${Math.round((this.progress / this.need) * 100)}%`;
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    // lurches now and then: the other end bucks
    if (this.r() < dt * (this.bold ? 0.7 : 0.4)) this.kick = (this.r() < 0.5 ? -1 : 1) * (0.5 + this.r() * 0.7);
    this.kick *= Math.exp(-dt * 3);
    const gust = (noise2(this.time * 0.8, this.seed % 97) - 0.5) * 2 * this.gusts;
    this.tension += ((pad.hold ? 0.95 : -0.75) + gust + this.kick) * dt;
    this.tension = Math.max(0, Math.min(1.15, this.tension));
    const c = this.centre();
    const inBand = Math.abs(this.tension - c) <= this.band / 2;
    if (inBand) this.progress += dt;
    if (this.tension > c + this.band / 2 + 0.12) this.strain += dt * (this.tension > 1 ? 1.6 : 0.8);
    else this.strain = Math.max(0, this.strain - dt * 0.5);
    if (this.strain >= 1) {
      this.snapped = true;
      this.result = Math.min(0.2, (this.progress / this.need) * 0.3);
    } else if (this.progress >= this.need) this.result = 1;
    else if (this.time >= this.limit) this.result = Math.min(1, this.progress / this.need);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#0a0812';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h - 60, this.seed, this.progress * 40);
    timer(ctx, w, this.limit - this.time, this.limit);
    const T = this.tension;
    // the two ships, the cable between them sagging when slack
    const shake = T > 0.95 ? Math.round(Math.sin(t * 60) * 1.5) : 0;
    const ax = 150 + shake;
    const ay = 90 + Math.round(Math.sin(t * 2) * 3);
    const bx = 380;
    const by = 100 + Math.round(Math.sin(t * 1.3 + 1) * 6 + this.kick * 8);
    const sag = (1 - Math.min(1, T)) * 50;
    const tight = T > this.centre() + this.band / 2;
    ctx.fillStyle = this.snapped ? '#5a4a5a' : tight ? (Math.floor(t * 12) % 2 ? '#ff5a4a' : '#ffd04a') : '#c8bcd8';
    const n = 80;
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      if (this.snapped && f > 0.45 && f < 0.6) continue;
      const x = ax - 10 - (ax - 10 - (bx + 16)) * f;
      const y = ay + (by - ay) * f + Math.sin(f * Math.PI) * sag + (this.snapped ? f * 30 : 0);
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    // the load: a fat, dark hulk
    ctx.fillStyle = '#120c18';
    ctx.fillRect(bx - 2, by - 14, 44, 29);
    ctx.fillStyle = '#5a5470';
    ctx.fillRect(bx, by - 12, 40, 25);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(bx, by + 6, 40, 7);
    ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff5a4a' : '#5a2a34';
    ctx.fillRect(bx + 30, by - 9, 3, 3);
    // you, pulling to the left
    ctx.save();
    ctx.translate(ax * 2, 0);
    ctx.scale(-1, 1);
    sideShip(ctx, ax, ay, this.result === null ? (T > 0.2 ? 0.4 + T * 0.6 : 0.2) : 0);
    ctx.restore();

    // the gauge
    const gx = 40;
    const gy = h - 46;
    const gw = w - 80;
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(gx, gy, gw, 14);
    const c = this.centre();
    ctx.fillStyle = '#2a6a4a';
    ctx.fillRect(gx + Math.round((c - this.band / 2) * gw), gy, Math.round(this.band * gw), 14);
    ctx.fillStyle = '#5a2430';
    const red = c + this.band / 2 + 0.12;
    ctx.fillRect(gx + Math.round(red * gw), gy, gw - Math.round(red * gw), 14);
    ctx.fillStyle = '#f4ecd8';
    const nx = gx + Math.round(Math.min(1, T) * gw);
    ctx.fillRect(nx - 1, gy - 4, 3, 22);
    drawText(ctx, 'SLACK', gx, gy + 18, '#8a8098');
    drawText(ctx, 'SNAP', gx + gw, gy + 18, '#ff8a7a', { align: 'right' });
    // strain
    drawText(ctx, 'STRAIN', gx, gy - 14, '#8a8098');
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(gx + 44, gy - 12, 80, 4);
    ctx.fillStyle = this.strain > 0.6 ? '#ff5a4a' : '#ffd04a';
    ctx.fillRect(gx + 44, gy - 12, Math.round(80 * Math.min(1, this.strain)), 4);
    // progress
    drawText(ctx, 'TOWED', gx + gw - 130, gy - 14, '#8a8098');
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(gx + gw - 92, gy - 12, 92, 4);
    ctx.fillStyle = '#8affb0';
    ctx.fillRect(gx + gw - 92, gy - 12, Math.round(92 * Math.min(1, this.progress / this.need)), 4);
  }
}
