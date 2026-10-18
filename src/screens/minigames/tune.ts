import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { timer, wrapAngle, type Minigame, type Pad } from './common';

/**
 * Tune in: a voice in the static, and your receiver's wave over it. Left and right change your
 * frequency, up and down slide its phase; when the two lie on top of each other, hold the button
 * to lock that voice. Careful: two voices. Bold: three, and they drift.
 */
export class Tune implements Minigame {
  readonly title = 'TUNE IN';
  readonly how = 'LEFT/RIGHT: FREQUENCY. UP/DOWN: PHASE. LAY YOUR WAVE OVER THE VOICE, THEN HOLD THE BUTTON TO LOCK IT.';
  result: number | null = null;
  private voices: { f: number; p: number; amp: number }[] = [];
  private at = 0;
  private f = 2;
  private p = 0;
  private lock = 0;
  private time = 0;
  private readonly limit: number;
  private flash = 0;

  constructor(
    private bold: boolean,
    seed: number,
  ) {
    const r = rng(seed);
    const n = bold ? 3 : 2;
    for (let k = 0; k < n; k++) this.voices.push({ f: 1.2 + r() * 3.6, p: r() * Math.PI * 2, amp: 0.8 + r() * 0.2 });
    this.f = 2.5;
    this.limit = bold ? 30 : 26;
  }

  private target() {
    const v = this.voices[this.at];
    // bold voices wander
    const drift = this.bold ? Math.sin(this.time * 0.6 + this.at) * 0.35 : 0;
    return { f: v.f + drift, p: v.p + (this.bold ? this.time * 0.4 : 0), amp: v.amp };
  }

  /** How alike the two waves are, 0..1. */
  match() {
    const t = this.target();
    const df = Math.abs(this.f - t.f) / 0.8;
    const dp = Math.abs(wrapAngle(this.p - t.p)) / 1.2;
    return Math.max(0, 1 - Math.hypot(df, dp));
  }

  status() {
    return `VOICE ${Math.min(this.at + 1, this.voices.length)}/${this.voices.length}  MATCH ${Math.round(this.match() * 100)}%`;
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    this.flash -= dt;
    this.f = Math.max(0.8, Math.min(5.4, this.f + pad.x * dt * 1.1));
    this.p += -pad.y * dt * 2.2;
    const m = this.match();
    if (pad.hold && m > 0.72) this.lock += dt * (0.6 + m);
    else this.lock = Math.max(0, this.lock - dt * 1.5);
    if (this.lock >= 1.2) {
      this.lock = 0;
      this.at++;
      this.flash = 0.5;
      if (this.at >= this.voices.length) {
        this.result = 1;
        return;
      }
    }
    if (this.time >= this.limit) this.result = (this.at + this.match() * 0.5) / this.voices.length;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#06120e';
    ctx.fillRect(0, 0, w, h);
    // the scope's grid
    ctx.fillStyle = '#0e2a20';
    for (let x = 0; x < w; x += 25) ctx.fillRect(x, 10, 1, h - 60);
    for (let y = 10; y < h - 50; y += 25) ctx.fillRect(0, y, w, 1);
    timer(ctx, w, this.limit - this.time, this.limit);
    const mid = (h - 50) / 2 + 8;
    const amp = 62;
    const tg = this.target();
    const done = this.at >= this.voices.length;
    // static
    for (let k = 0; k < 140; k++) {
      const x = Math.floor(((Math.sin(k * 91.7 + t * 17) + 1) / 2) * w);
      const y = Math.floor(((Math.sin(k * 47.3 + t * 23) + 1) / 2) * (h - 60)) + 10;
      ctx.fillStyle = '#1a4a3a';
      ctx.fillRect(x, y, 1, 1);
    }
    const m = this.match();
    for (let x = 0; x < w; x++) {
      const u = (x / w) * Math.PI * 2;
      if (!done) {
        const yt = mid - Math.sin(u * tg.f + tg.p + t * 1.5) * amp * tg.amp;
        ctx.fillStyle = '#ff6ac8';
        ctx.fillRect(x, Math.round(yt), 1, 2);
      }
      const ys = mid - Math.sin(u * this.f + this.p + t * 1.5) * amp * 0.9;
      ctx.fillStyle = m > 0.72 ? '#8affb0' : '#8affe0';
      ctx.fillRect(x, Math.round(ys), 1, 1);
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(138,255,176,${this.flash})`;
      ctx.fillRect(0, 0, w, h - 50);
    }
    // the readout
    const by = h - 40;
    drawText(ctx, 'VOICES', 8, by, '#8a8098');
    this.voices.forEach((_, k) => {
      ctx.fillStyle = k < this.at ? '#8affb0' : k === this.at ? '#ff6ac8' : '#2a3a34';
      ctx.fillRect(52 + k * 14, by, 10, 7);
    });
    drawText(ctx, 'MATCH', 120, by, '#8a8098');
    ctx.fillStyle = '#1a2a24';
    ctx.fillRect(156, by + 1, 120, 5);
    ctx.fillStyle = m > 0.72 ? '#8affb0' : '#c8a060';
    ctx.fillRect(156, by + 1, Math.round(120 * m), 5);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(156 + Math.round(120 * 0.72), by - 1, 1, 9);
    drawText(ctx, 'LOCK', 296, by, '#8a8098');
    ctx.fillStyle = '#1a2a24';
    ctx.fillRect(324, by + 1, 100, 5);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(324, by + 1, Math.round(100 * Math.min(1, this.lock / 1.2)), 5);
    if (m > 0.72 && this.lock === 0 && Math.floor(t * 3) % 2) drawText(ctx, 'HOLD TO LOCK!', w / 2, by + 14, '#8affb0', { align: 'center' });
  }
}
