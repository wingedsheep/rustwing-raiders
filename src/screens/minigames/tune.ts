import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { rng } from '../../util';
import { Fx, glow, meter, scanlines, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';

/** What comes through once a voice is clear. */
const SNATCHES = ['...MAYDAY, MAYDAY...', '...COORDINATES FOLLOW...', '...DO NOT DOCK...', '...CARGO IS INTACT...', '...ANYONE HEAR ME?...', '...THE CODE IS...'];

/**
 * Tune in: a voice in the static, and your receiver's wave over it, on an old phosphor scope.
 * Left and right turn the frequency knob (tap for fine, hold and it spins faster), up and down
 * slide the phase. When the two waves lie on top of each other the static clears; hold the button
 * to lock that voice. The tighter you hold it while it locks, the clearer it comes through, and
 * clear voices pay more. Careful: two voices. Bold: three, and they drift.
 */
export class Tune implements Minigame {
  readonly title = 'TUNE IN';
  readonly how = 'LEFT/RIGHT: FREQUENCY (HOLD TO SPIN FASTER). UP/DOWN: PHASE. LAY YOUR WAVE OVER THE VOICE, THEN HOLD THE BUTTON TO LOCK IT. TIGHTER IS CLEARER.';
  result: number | null = null;
  private voices: { f: number; p: number; amp: number; said: string }[] = [];
  private got: number[] = [];
  private at = 0;
  private f = 2.6;
  private p = 0;
  private lock = 0;
  private lockSum = 0;
  private lockT = 0;
  private xHeld = 0;
  private yHeld = 0;
  private xDir = 0;
  private time = 0;
  private readonly limit: number;
  private wasIn = false;
  private fx = new Fx();
  private trail: HTMLCanvasElement | null = null;

  constructor(
    private bold: boolean,
    seed: number,
  ) {
    const r = rng(seed);
    const n = bold ? 3 : 2;
    let last = 2.6;
    for (let k = 0; k < n; k++) {
      // each voice well away from where you'll be tuned from
      let f = 1.2 + r() * 3.6;
      for (let tries = 0; Math.abs(f - last) < 1 && tries < 8; tries++) f = 1.2 + r() * 3.6;
      last = f;
      this.voices.push({ f, p: r() * Math.PI * 2, amp: 0.75 + r() * 0.2, said: SNATCHES[Math.floor(r() * SNATCHES.length)] });
    }
    this.limit = bold ? 32 : 26;
  }

  private target() {
    const v = this.voices[Math.min(this.at, this.voices.length - 1)];
    // bold voices wander
    const drift = this.bold ? Math.sin(this.time * 0.6 + this.at * 2) * 0.35 : 0;
    return { f: v.f + drift, p: v.p + (this.bold ? this.time * 0.45 : 0), amp: v.amp };
  }

  /** How alike the two waves are, 0..1. */
  match() {
    const t = this.target();
    const df = Math.abs(this.f - t.f) / 0.8;
    const dp = Math.abs(wrapAngle(this.p - t.p)) / 1.2;
    return Math.max(0, 1 - Math.hypot(df, dp));
  }

  /** A locked voice's worth, from how well you held it: 0.55 for scraping in, 1 for dead on. */
  private worth(avg: number) {
    return 0.55 + 0.45 * Math.max(0, Math.min(1, (avg - 0.74) / 0.21));
  }

  status() {
    const m = Math.round(this.match() * 100);
    return `VOICE ${Math.min(this.at + 1, this.voices.length)}/${this.voices.length}  SIGNAL ${m}%${this.match() > 0.72 && this.lock === 0 ? '  HOLD TO LOCK!' : ''}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    if (this.result !== null) return;
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    // the knob: a tap moves it a hair, holding spins it up
    const dir = Math.sign(pad.x);
    if (dir && dir === this.xDir) this.xHeld += dt;
    else this.xHeld = 0;
    this.xDir = dir;
    const fr = 0.22 + Math.min(1.5, this.xHeld * 1.6);
    this.f = Math.max(0.8, Math.min(5.4, this.f + pad.x * dt * fr));
    this.yHeld = pad.y ? this.yHeld + dt : 0;
    this.p += -pad.y * dt * (0.6 + Math.min(2.4, this.yHeld * 2.5));

    const m = this.match();
    const inside = m > 0.72;
    if (inside && !this.wasIn) audio.play('graze', { pitch: 1.2 });
    this.wasIn = inside;
    if (pad.hold && inside) {
      this.lock += dt * (0.6 + m);
      this.lockSum += m * dt;
      this.lockT += dt;
    } else {
      this.lock = Math.max(0, this.lock - dt * 1.5);
      if (this.lock === 0) this.lockSum = this.lockT = 0;
    }
    if (this.lock >= 1.2) {
      const avg = this.lockSum / Math.max(0.001, this.lockT);
      const worth = this.worth(avg);
      this.got.push(worth);
      const clear = worth > 0.9 ? 'CRYSTAL CLEAR' : worth > 0.7 ? 'CLEAR' : 'CRACKLY';
      this.fx.word(clear, 240, 40, worth > 0.7 ? '#8affb0' : '#ffd04a', 2);
      this.fx.word(this.voices[this.at].said, 240, 64, '#ff9ad8');
      this.fx.flash('#8affb0', 0.2);
      audio.play('perfect', { vol: 0.6 + worth * 0.4 });
      this.lock = this.lockSum = this.lockT = 0;
      this.at++;
      // start the next search from wherever you are, a little knocked about
      this.p += Math.PI * 0.7;
      if (this.at >= this.voices.length) {
        this.result = this.score();
        return;
      }
    }
    if (this.time >= this.limit) this.result = this.score();
  }

  private score() {
    const n = this.voices.length;
    const sum = this.got.reduce((a, b) => a + b, 0);
    const partial = this.at < n ? this.match() * 0.3 + Math.min(1, this.lock / 1.2) * 0.2 : 0;
    return Math.min(1, (sum + partial) / n);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    const sh = 186;
    // the bezel
    ctx.fillStyle = '#16120e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a2218';
    ctx.fillRect(4, 6, w - 8, sh + 4);
    // the scope, with phosphor that lingers
    if (!this.trail) {
      this.trail = document.createElement('canvas');
      this.trail.width = w - 16;
      this.trail.height = sh - 6;
    }
    const tw = this.trail.width;
    const th = this.trail.height;
    const g = this.trail.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(4,16,12,0.35)';
    g.fillRect(0, 0, tw, th);
    // grid
    g.fillStyle = 'rgba(30,80,60,0.25)';
    for (let x = 0; x < tw; x += 24) g.fillRect(x, 0, 1, th);
    for (let y = th / 2 % 22; y < th; y += 22) g.fillRect(0, Math.round(y), tw, 1);
    g.fillStyle = 'rgba(60,140,110,0.3)';
    g.fillRect(0, Math.round(th / 2), tw, 1);
    const m = this.match();
    const done = this.at >= this.voices.length;
    // static: thick when you're off, thinning as the voice comes in
    const noise = done ? 20 : Math.round(40 + (1 - m) * 260);
    for (let k = 0; k < noise; k++) {
      g.fillStyle = fx.rand() < 0.5 ? 'rgba(90,200,150,0.5)' : 'rgba(40,110,80,0.6)';
      g.fillRect(Math.floor(fx.rand() * tw), Math.floor(fx.rand() * th), fx.rand() < 0.2 ? 2 : 1, 1);
    }
    const mid = th / 2;
    const amp = th * 0.38;
    const tg = this.target();
    g.globalCompositeOperation = 'lighter';
    const wave = (fq: number, ph: number, a: number, col: string, wd: number, jitter: number) => {
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.beginPath();
      for (let x = 0; x <= tw; x += 2) {
        const u = (x / tw) * Math.PI * 2;
        const y = mid - Math.sin(u * fq + ph + t * 1.5) * amp * a + (jitter ? (fx.rand() - 0.5) * jitter : 0);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    if (!done) {
      const jit = (1 - m) * 6;
      wave(tg.f, tg.p, tg.amp, 'rgba(255,90,200,0.18)', 5, jit);
      wave(tg.f, tg.p, tg.amp, 'rgba(255,140,220,0.9)', 1.5, jit);
    }
    const lit = m > 0.72;
    wave(this.f, this.p, 0.88, lit ? 'rgba(138,255,176,0.2)' : 'rgba(138,255,224,0.15)', 5, 0);
    wave(this.f, this.p, 0.88, lit ? 'rgba(200,255,220,0.95)' : 'rgba(160,255,230,0.8)', 1.2, 0);
    ctx.drawImage(this.trail, 8, 10);
    // glass: a sheen, scanlines and dark corners
    ctx.save();
    ctx.translate(8, 10);
    glow(ctx, tw * 0.3, th * 0.2, 90, '#4a8a7a', 0.12);
    scanlines(ctx, tw, th, 0.2);
    vignette(ctx, tw, th, 0.7);
    fx.drawWords(ctx);
    ctx.restore();
    if (this.lock > 0) {
      ctx.strokeStyle = `rgba(255,208,74,${0.3 + Math.sin(t * 20) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(9, 11, tw - 2, th - 2);
    }
    this.panel(ctx, w, h, sh, t, m);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The receiver's face: the tuning dial, the signal lamps, the lock and the voices. */
  private panel(ctx: CanvasRenderingContext2D, w: number, h: number, sh: number, t: number, m: number) {
    const py = sh + 14;
    // the dial: a strip of frequencies with a red needle
    const dx = 10;
    const dw = 200;
    ctx.fillStyle = '#e8d8a8';
    ctx.fillRect(dx, py, dw, 22);
    ctx.fillStyle = '#c8b888';
    ctx.fillRect(dx, py + 18, dw, 4);
    for (let k = 0; k <= 46; k++) {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(dx + 4 + Math.round((k / 46) * (dw - 8)), py + 2, 1, k % 5 === 0 ? 7 : 4);
    }
    for (let k = 1; k <= 5; k++) drawText(ctx, `${k}`, dx + 4 + ((k - 0.8) / 4.6) * (dw - 8), py + 11, '#5a3a1a', { align: 'center', shadow: false });
    const nx = dx + 4 + Math.round(((this.f - 0.8) / 4.6) * (dw - 8));
    ctx.fillStyle = '#c82a2a';
    ctx.fillRect(nx, py - 2, 2, 26);
    glow(ctx, dx + dw / 2, py + 10, 60, '#ffd890', 0.15);
    // signal lamps
    const sx = dx + dw + 14;
    drawText(ctx, 'SIGNAL', sx, py - 1, '#8a8098');
    for (let k = 0; k < 10; k++) {
      const on = m * 10 > k + 0.5;
      const col = k >= 7 ? '#8affb0' : k >= 4 ? '#ffd04a' : '#ff8a3a';
      ctx.fillStyle = on ? col : '#2a2218';
      ctx.fillRect(sx + k * 7, py + 10, 5, 8);
      if (on && k >= 7) glow(ctx, sx + k * 7 + 2, py + 14, 6, col, 0.4);
    }
    // lock
    const lx = sx + 82;
    drawText(ctx, 'LOCK', lx, py - 1, '#8a8098');
    meter(ctx, lx, py + 12, 70, 5, this.lock / 1.2, '#ffd04a', '#2a2218');
    if (m > 0.72 && this.lock === 0 && this.result === null && Math.floor(t * 3) % 2) drawText(ctx, 'HOLD!', lx + 35, py + 21, '#8affb0', { align: 'center' });
    // the voices: lamps that show how clear each came through
    const vx = w - 66;
    drawText(ctx, 'VOICES', vx, py - 1, '#8a8098');
    this.voices.forEach((_, k) => {
      const got = this.got[k];
      const x = vx + k * 19;
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 1, py + 9, 16, 12);
      ctx.fillStyle = got !== undefined ? (got > 0.9 ? '#8affb0' : got > 0.7 ? '#c8e86a' : '#ffd04a') : k === this.at ? (Math.floor(t * 3) % 2 ? '#ff6ac8' : '#7a2a5a') : '#2a2218';
      ctx.fillRect(x, py + 10, 14, 10);
      if (got !== undefined) drawText(ctx, got > 0.9 ? 'A' : got > 0.7 ? 'B' : 'C', x + 7, py + 12, DARK, { align: 'center', shadow: false });
    });
  }
}
