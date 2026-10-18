import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { timer, wrapAngle, type Minigame, type Pad } from './common';

/**
 * Dock: a port (or a pod's hatch) turning in front of you, coming closer as you thrust. Turn your
 * collar with left and right to match its clamps, hold the button to close in, and let go to coast:
 * at contact, how well the clamps line up and how gently you came in make the score. Bold: it spins
 * faster and wobbles, and your collar has more weight to it.
 */
export class Dock implements Minigame {
  readonly title = 'MATCH AND DOCK';
  readonly how = 'LEFT/RIGHT: TURN YOUR COLLAR TO MATCH THE CLAMPS. HOLD THE BUTTON TO CLOSE IN. COME IN ALIGNED AND SLOW.';
  result: number | null = null;
  private dist = 1;
  private v = 0;
  private a = 0;
  private av = 0;
  private port = 0;
  private time = 0;
  private readonly limit = 22;
  private readonly spin: number;
  private readonly safe = 0.11;
  private grade = '';

  constructor(
    private bold: boolean,
    seed: number,
  ) {
    const r = rng(seed);
    this.spin = (bold ? 1.25 : 0.6) * (r() < 0.5 ? 1 : -1);
    this.port = r() * Math.PI;
    this.a = this.port + Math.PI / 4;
  }

  /** How far off the clamps are, 0 (dead on) to 1 (as bad as it gets). Four clamps: a quarter turn repeats. */
  private off() {
    const d = wrapAngle((this.a - this.port) * 4) / 4;
    return Math.abs(d) / (Math.PI / 4);
  }

  status() {
    if (this.grade) return this.grade;
    return `RANGE ${Math.round(this.dist * 100)}  CLOSING ${Math.round(this.v * 100)}${this.v > this.safe ? ' TOO FAST' : ''}`;
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    this.port += (this.spin + (this.bold ? Math.sin(this.time * 1.7) * 0.6 : 0)) * dt;
    // your collar turns with a little weight to it (more when bold)
    const grip = this.bold ? 3 : 6;
    this.av += (pad.x * 2.6 - this.av) * Math.min(1, dt * grip);
    this.a += this.av * dt;
    // thrust closes in; let go and you coast, slowing a little
    if (pad.hold) this.v += dt * 0.16;
    else this.v = Math.max(0.02, this.v - dt * 0.05);
    this.dist -= this.v * dt;
    if (this.dist <= 0) {
      const align = Math.max(0, 1 - this.off() * 1.6);
      const gentle = this.v <= this.safe ? 1 : Math.max(0, 1 - (this.v - this.safe) / 0.15);
      this.result = align * gentle;
      this.grade = this.result > 0.8 ? 'A PERFECT SEAL' : this.result > 0.4 ? 'A ROUGH SEAL' : 'YOU HIT IT';
    } else if (this.time >= this.limit) this.result = 0;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#080a14';
    ctx.fillRect(0, 0, w, h);
    timer(ctx, w, this.limit - this.time, this.limit);
    const cx = w / 2;
    const cy = (h - 30) / 2 + 6;
    // the port grows as you close in
    const R = 18 + (1 - Math.max(0, this.dist)) * 70;
    const ring = (r: number, col: string, step = 1) => {
      ctx.fillStyle = col;
      const n = Math.max(24, Math.round(r * 6));
      for (let k = 0; k < n; k += step) {
        const a = (k / n) * Math.PI * 2;
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2);
      }
    };
    // hull plating around the port
    ring(R * 1.6, '#1e2236', 2);
    ring(R * 1.25, '#3a4060');
    ring(R, '#6a7090');
    // its clamps
    for (let k = 0; k < 4; k++) {
      const a = this.port + (k * Math.PI) / 2;
      for (let s = R * 0.55; s < R; s++) {
        ctx.fillStyle = '#ffb04a';
        ctx.fillRect(Math.round(cx + Math.cos(a) * s) - 1, Math.round(cy + Math.sin(a) * s) - 1, 3, 3);
      }
    }
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#8affb0' : '#2a6a4a';
    ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4);
    // your collar: fixed size, in front
    const off = this.off();
    const good = off < 0.25;
    const C = 96;
    ring(C, good ? '#8affb0' : '#8affe0', 3);
    for (let k = 0; k < 4; k++) {
      const a = this.a + (k * Math.PI) / 2;
      ctx.fillStyle = good ? '#8affb0' : '#c8f0ff';
      for (let s = C - 14; s < C + 8; s++) ctx.fillRect(Math.round(cx + Math.cos(a) * s) - 1, Math.round(cy + Math.sin(a) * s) - 1, 3, 3);
    }
    // readouts
    const by = h - 22;
    drawText(ctx, 'ALIGN', 10, by, '#8a8098');
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(46, by + 1, 100, 5);
    ctx.fillStyle = good ? '#8affb0' : '#ffd04a';
    ctx.fillRect(46, by + 1, Math.round(100 * (1 - off)), 5);
    drawText(ctx, 'SPEED', w - 160, by, '#8a8098');
    ctx.fillStyle = '#1a2030';
    ctx.fillRect(w - 124, by + 1, 110, 5);
    const sv = Math.min(1, this.v / 0.3);
    ctx.fillStyle = this.v > this.safe ? '#ff5a4a' : '#8affb0';
    ctx.fillRect(w - 124, by + 1, Math.round(110 * sv), 5);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(w - 124 + Math.round((110 * this.safe) / 0.3), by - 1, 1, 9);
    drawText(ctx, `RANGE ${Math.max(0, Math.round(this.dist * 100))}`, w / 2, by, '#c8bcd8', { align: 'center' });
  }
}
