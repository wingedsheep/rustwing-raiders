import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { Fx, glow, meter, stars, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';

/**
 * Dock: a station's port (or a pod's hatch) turning in front of you, like Elite's Coriolis. Left
 * and right fire your roll jets: your collar has weight, so you match the port's spin first and
 * then line up its clamps. Hold the button to close in, pull down to brake, and come in slow: at
 * contact the clamps, the spin and the speed make the score. Bold: it spins faster and its spin
 * wobbles, your jets are slippier, and the safe speed is lower.
 */
export class Dock implements Minigame {
  readonly title = 'MATCH AND DOCK';
  readonly how = 'LEFT/RIGHT: ROLL TO MATCH THE SPIN AND THE CLAMPS. HOLD THE BUTTON TO CLOSE IN, DOWN TO BRAKE. COME IN ALIGNED AND SLOW.';
  result: number | null = null;
  private dist = 1;
  private v = 0.04;
  private a = 0;
  private av = 0;
  private port = 0;
  private time = 0;
  private readonly limit = 24;
  private readonly dir: number;
  private readonly safe: number;
  private grade = '';
  private locked = false;
  private thrust = false;
  private braking = false;
  private jet = 0;
  private fx = new Fx();
  private contact = -1;

  constructor(
    private bold: boolean,
    private seed: number,
  ) {
    const r = rng(seed);
    this.dir = r() < 0.5 ? 1 : -1;
    this.port = r() * Math.PI;
    this.a = this.port + Math.PI / 4;
    this.safe = bold ? 0.09 : 0.11;
  }

  private spin() {
    return this.dir * (this.bold ? 1 + Math.sin(this.time * 1.3) * 0.3 : 0.55);
  }

  /** How far off the clamps are, 0 (dead on) to 1 (as bad as it gets). Four clamps: a quarter turn repeats. */
  private off() {
    const d = wrapAngle((this.a - this.port) * 4) / 4;
    return Math.abs(d) / (Math.PI / 4);
  }

  /** How far your roll is from the port's, 0 (matched) to 1 (way off). */
  private slip() {
    return Math.min(1, Math.abs(this.av - this.spin()) / 1.2);
  }

  status() {
    if (this.grade) return this.grade;
    const parts = [`RANGE ${Math.round(this.dist * 100)}`];
    if (this.slip() > 0.15) parts.push(this.av < this.spin() === this.dir > 0 ? 'ROLL WITH IT' : 'TOO MUCH ROLL');
    else if (this.off() > 0.2) parts.push('LINE UP THE CLAMPS');
    else parts.push('LOCKED ON');
    if (this.v > this.safe) parts.push('TOO FAST!');
    return parts.join('  ');
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    if (this.contact >= 0) this.contact += dt;
    if (this.result !== null) {
      this.port += this.spin() * dt * 0.3;
      this.a = this.port;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    this.port += this.spin() * dt;
    // roll jets: they push, and the collar keeps turning (a little drag, less when bold)
    const acc = this.bold ? 2.6 : 2.2;
    this.av += pad.x * acc * dt;
    this.av *= Math.exp(-dt * (this.bold ? 0.2 : 0.35));
    this.a += this.av * dt;
    this.jet = pad.x;
    // thrust closes in, the brake (down) slows you; let go and you coast
    this.thrust = pad.hold;
    this.braking = pad.y > 0.5;
    if (this.thrust) this.v += dt * 0.15;
    if (this.braking) this.v = Math.max(0.015, this.v - dt * 0.22);
    this.dist -= this.v * dt;
    const lock = this.off() < 0.15 && this.slip() < 0.12;
    if (lock && !this.locked) audio.play('aux_ready', { pitch: 1.3, vol: 0.6 });
    this.locked = lock;

    if (this.dist <= 0) {
      this.dist = 0;
      this.contact = 0;
      const align = Math.max(0, 1 - Math.max(0, this.off() - 0.05) * 1.5);
      const spin = 1 - this.slip() * 0.8;
      const gentle = this.v <= this.safe ? 1 : Math.max(0, 1 - (this.v - this.safe) / 0.12);
      this.result = Math.max(0, Math.min(1, align * spin * gentle));
      const s = this.result;
      this.grade = s > 0.85 ? 'A PERFECT SEAL' : s > 0.55 ? 'A GOOD SEAL' : s > 0.25 ? 'A ROUGH SEAL' : gentle < 0.5 ? 'TOO FAST: YOU HIT IT' : 'THE CLAMPS MISSED';
      if (s > 0.55) {
        this.fx.flash('#8affb0', 0.25);
        audio.play('block', { pitch: 0.7 });
        audio.play('perfect', { vol: s > 0.85 ? 1 : 0.5 });
      } else {
        this.fx.flash('#ff8a3a', 0.25);
        this.fx.shake(7, 0.5);
        audio.play('ram');
      }
      this.fx.burst(240, 112, s > 0.55 ? 24 : 60, s > 0.55 ? 90 : 200, s > 0.55 ? ['#8affb0', '#ffffff'] : ['#ffd04a', '#ff8a3a', '#ffffff'], { grav: 0 });
    } else if (this.time >= this.limit) {
      this.result = 0;
      this.grade = 'OUT OF TIME';
    }
    audio.loop('engine', 'dock', this.result === null && this.thrust, 0.5);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    ctx.fillStyle = '#05060e';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, this.seed, 0, 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const cx = w / 2;
    const cy = 112;
    // perspective: the port grows as you close in
    const R = 22 / (0.22 + Math.max(0, this.dist) * 0.78);
    this.station(ctx, cx, cy, R, t);
    // landing lights rushing in towards the port
    for (let k = 0; k < 4; k++) {
      const f = (t * 0.8 + k / 4) % 1;
      const rr = R * (2.6 - f * 1.5);
      ctx.strokeStyle = `rgba(255,208,74,${0.08 + f * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.collar(ctx, cx, cy, t);
    fx.drawSparks(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.6);
    this.hud(ctx, w, h, t);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The station face: a lit disc of plating turning with the port, rim lights, the clamps. */
  private station(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number) {
    const S = R * 2.4;
    const g = ctx.createRadialGradient(cx - S * 0.4, cy - S * 0.5, S * 0.1, cx, cy, S);
    g.addColorStop(0, '#5a6080');
    g.addColorStop(0.6, '#2a2e44');
    g.addColorStop(1, '#14162a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, S, 0, Math.PI * 2);
    ctx.fill();
    // plating: rings and spokes that turn with it
    ctx.lineWidth = 1;
    for (const k of [0.62, 0.8, 1.4, 1.9]) {
      ctx.strokeStyle = 'rgba(10,10,24,0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, R * k * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = this.port + (k / 12) * Math.PI * 2 + Math.PI / 12;
      ctx.strokeStyle = k % 3 === 0 ? 'rgba(140,150,190,0.35)' : 'rgba(10,10,24,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 1.25);
      ctx.lineTo(cx + Math.cos(a) * S * 0.97, cy + Math.sin(a) * S * 0.97);
      ctx.stroke();
    }
    // rim lights, chasing round
    for (let k = 0; k < 24; k++) {
      const a = this.port + (k / 24) * Math.PI * 2;
      const on = (k + Math.floor(t * 8)) % 6 === 0;
      const x = cx + Math.cos(a) * S * 0.9;
      const y = cy + Math.sin(a) * S * 0.9;
      ctx.fillStyle = on ? '#ffd04a' : '#4a4030';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      if (on) glow(ctx, x, y, 6, '#ffd04a', 0.5);
    }
    // the port: a dark mouth with a lit throat
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, cx, cy, R * 0.9, this.locked ? '#8affb0' : '#6ad0ff', 0.35);
    ctx.strokeStyle = '#8a90b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // its clamps: hazard-striped arms
    for (let k = 0; k < 4; k++) {
      const a = this.port + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const n = Math.max(3, Math.round(R * 0.5));
      for (let s = 0; s < n; s++) {
        const d = R * 0.5 + (s / n) * R * 0.7;
        ctx.fillStyle = Math.floor((s / n) * 6) % 2 ? '#2a2236' : '#ffb04a';
        const sz = Math.max(2, Math.round(R / 16));
        ctx.fillRect(Math.round(cx + ca * d) - sz / 2, Math.round(cy + sa * d) - sz / 2, sz, sz);
      }
      glow(ctx, cx + ca * R * 1.2, cy + sa * R * 1.2, 8, '#ffb04a', 0.5);
    }
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#8affb0' : '#2a6a4a';
    ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4);
  }

  /** Your docking collar, a fixed ring in front of you with four brackets. */
  private collar(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
    const C = 100;
    const off = this.off();
    const col = this.locked ? '#8affb0' : off < 0.25 ? '#c8f0a0' : '#8affe0';
    ctx.strokeStyle = this.locked ? 'rgba(138,255,176,0.5)' : 'rgba(138,255,224,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, C, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let k = 0; k < 4; k++) {
      const a = this.a + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // a bracket: a bar along the radius with a crossbar at its tip
      ctx.strokeStyle = 'rgba(10,7,16,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + ca * (C - 16), cy + sa * (C - 16));
      ctx.lineTo(cx + ca * (C + 6), cy + sa * (C + 6));
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + ca * (C - 15), cy + sa * (C - 15));
      ctx.lineTo(cx + ca * (C + 5), cy + sa * (C + 5));
      ctx.moveTo(cx + ca * (C - 15) - sa * 5, cy + sa * (C - 15) + ca * 5);
      ctx.lineTo(cx + ca * (C - 15) + sa * 5, cy + sa * (C - 15) - ca * 5);
      ctx.stroke();
      if (this.locked) glow(ctx, cx + ca * (C - 5), cy + sa * (C - 5), 12, '#8affb0', 0.4);
      // roll jets puff at the bracket tips
      if (this.jet && this.result === null && this.fx.rand() < 0.3) {
        const d = -Math.sign(this.jet);
        this.fx.spark(cx + ca * (C + 4), cy + sa * (C + 4), -sa * d * 40, ca * d * 40, 0.25, '#c8f0ff', { drag: 4 });
      }
    }
    // the reticle
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx) - 10, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx) + 5, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx), Math.round(cy) - 10, 1, 6);
    ctx.fillRect(Math.round(cx), Math.round(cy) + 5, 1, 6);
    if (this.thrust && this.result === null) glow(ctx, cx, cy, 30, '#ffd04a', 0.12 + Math.sin(t * 30) * 0.04);
  }

  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const by = h - 20;
    ctx.fillStyle = 'rgba(10,7,16,0.8)';
    ctx.fillRect(0, by - 8, w, 28);
    // the clamps
    const off = this.off();
    drawText(ctx, 'CLAMPS', 8, by - 4, '#8a8098');
    meter(ctx, 8, by + 6, 100, 4, 1 - off, off < 0.15 ? '#8affb0' : off < 0.35 ? '#ffd04a' : '#ff8a3a');
    // the spin: centre is matched, the needle shows which way you're off
    const sx = 136;
    drawText(ctx, 'SPIN', sx, by - 4, '#8a8098');
    ctx.fillStyle = '#120c18';
    ctx.fillRect(sx - 1, by + 5, 102, 6);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(sx, by + 6, 100, 4);
    ctx.fillStyle = '#2a6a4a';
    ctx.fillRect(sx + 44, by + 6, 12, 4);
    const rel = Math.max(-1, Math.min(1, ((this.av - this.spin()) * this.dir) / 1.2));
    const nx = sx + 50 + Math.round(rel * 48);
    ctx.fillStyle = this.slip() < 0.12 ? '#8affb0' : '#f4ecd8';
    ctx.fillRect(nx - 1, by + 3, 3, 10);
    // range
    drawText(ctx, `RANGE ${Math.max(0, Math.round(this.dist * 100))}`, 300, by - 4, '#c8bcd8', { align: 'center' });
    if (this.braking && this.result === null) drawText(ctx, 'BRAKE', 300, by + 6, '#6ad0ff', { align: 'center' });
    else if (this.thrust && this.result === null) drawText(ctx, 'THRUST', 300, by + 6, '#ffd04a', { align: 'center' });
    // speed, with the safe line
    const vx = w - 128;
    drawText(ctx, 'CLOSING', vx, by - 4, '#8a8098');
    const fast = this.v > this.safe;
    meter(ctx, vx, by + 6, 118, 4, this.v / 0.3, fast ? '#ff5a4a' : '#8affb0');
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(vx + Math.round((118 * this.safe) / 0.3), by + 3, 1, 10);
    if (fast && this.result === null && Math.floor(t * 6) % 2) drawText(ctx, 'TOO FAST', w - 10, by - 4, '#ff5a4a', { align: 'right' });
  }
}
