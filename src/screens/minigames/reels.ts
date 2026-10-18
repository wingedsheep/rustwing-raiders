import { drawText } from '../../ui/font';
import { rng, shuffle } from '../../util';
import type { Minigame, Pad } from './common';

/** The symbols on Spoke's reels: cog (the jackpot), star, skull, bolt, moon. */
const SYMBOLS = ['COG', 'STAR', 'SKULL', 'BOLT', 'MOON'] as const;
type Sym = (typeof SYMBOLS)[number];
const COLOUR: Record<Sym, string> = { COG: '#ffd04a', STAR: '#8affe0', SKULL: '#f4ecd8', BOLT: '#6ad0ff', MOON: '#c8a0ff' };
const ICON: Record<Sym, string[]> = {
  COG: ['..#.#..', '.#####.', '##...##', '.#.#.#.', '##...##', '.#####.', '..#.#..'],
  STAR: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  SKULL: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#####.', '.#.#.#.'],
  BOLT: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  MOON: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
};

/**
 * Spoke's reels: three of them, spinning; press the button to stop each in turn. A reel doesn't
 * stop dead: it runs on one symbol and a bit, so you time it by watching the strip come round.
 * Two alike pay, three pay more, three cogs pays most. Bold: faster reels, a bigger stake.
 */
export class Reels implements Minigame {
  readonly title = "SPOKE'S REELS";
  readonly how = 'PRESS THE BUTTON TO STOP EACH REEL. IT RUNS ON ONE SYMBOL BEFORE IT STOPS: WATCH THE STRIP AND TIME IT.';
  result: number | null = null;
  private strips: Sym[][] = [];
  private pos = [0, 0, 0];
  /** Where a stopping reel will come to rest (or -1 while it spins). */
  private stopAt = [-1, -1, -1];
  private stopped = [false, false, false];
  private at = 0;
  private readonly speed: number;
  private wait = 0;
  private time = 0;

  constructor(bold: boolean, seed: number) {
    const r = rng(seed);
    for (let k = 0; k < 3; k++) {
      // one cog a strip, two of everything else
      const s: Sym[] = ['COG', 'STAR', 'STAR', 'SKULL', 'SKULL', 'BOLT', 'BOLT', 'MOON', 'MOON'];
      this.strips.push(shuffle(r, s));
      this.pos[k] = r() * 9;
    }
    this.speed = bold ? 9 : 5;
  }

  private sym(k: number, offset = 0): Sym {
    const s = this.strips[k];
    return s[(((Math.round(this.pos[k]) + offset) % s.length) + s.length) % s.length];
  }

  status() {
    return this.at < 3 ? `REEL ${this.at + 1}: PRESS TO STOP` : 'AND THE REELS SAY...';
  }

  update(dt: number, pad: Pad) {
    if (this.result !== null) return;
    this.time += dt;
    for (let k = 0; k < 3; k++) {
      if (this.stopped[k]) continue;
      if (this.stopAt[k] >= 0) {
        this.pos[k] = Math.min(this.stopAt[k], this.pos[k] + dt * this.speed * 0.6);
        if (this.pos[k] >= this.stopAt[k]) this.stopped[k] = true;
      } else this.pos[k] += dt * this.speed;
    }
    // a reel left too long stops itself
    const auto = this.time > 6 + this.at * 3;
    if (this.at < 3 && (pad.press || auto)) {
      const k = this.at;
      this.stopAt[k] = Math.floor(this.pos[k]) + 2;
      this.at++;
    }
    if (this.stopped.every(Boolean)) {
      this.wait += dt;
      if (this.wait > 0.6) {
        const s = [this.sym(0), this.sym(1), this.sym(2)];
        const same = s[0] === s[1] && s[1] === s[2];
        this.result = same && s[0] === 'COG' ? 1 : same ? 0.7 : s[0] === s[1] || s[1] === s[2] || s[0] === s[2] ? 0.4 : 0;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(0, 0, w, h);
    // brass cabinet
    const cw = 330;
    const cx = Math.round((w - cw) / 2);
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(cx - 10, 12, cw + 20, h - 40);
    ctx.fillStyle = '#8a6a2a';
    ctx.fillRect(cx - 10, 12, cw + 20, 3);
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = Math.floor(t * 4 + k) % 3 === 0 ? '#ffd04a' : '#6a4a1a';
      ctx.fillRect(cx - 6 + k * 29, 18, 4, 4);
    }
    const rw = 96;
    const cell = 46;
    const top = 34;
    for (let k = 0; k < 3; k++) {
      const x = cx + k * (rw + 21);
      ctx.fillStyle = '#f0e0c0';
      ctx.fillRect(x, top, rw, cell * 3);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, top, rw, cell * 3);
      ctx.clip();
      const frac = this.pos[k] - Math.floor(this.pos[k]);
      for (let j = -2; j <= 2; j++) {
        const s = this.strips[k][(((Math.floor(this.pos[k]) + j) % 9) + 9) % 9];
        this.icon(ctx, s, x + rw / 2, Math.round(top + cell * 1.5 + (j - frac) * cell), 4);
      }
      ctx.restore();
      // shading top and bottom of the drum
      ctx.fillStyle = 'rgba(40,20,8,0.45)';
      ctx.fillRect(x, top, rw, 14);
      ctx.fillRect(x, top + cell * 3 - 14, rw, 14);
      if (this.stopped[k]) {
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(x, top + cell * 3 + 3, rw, 3);
      } else if (k === this.at && Math.floor(t * 4) % 2) {
        ctx.fillStyle = '#8affe0';
        ctx.fillRect(x, top + cell * 3 + 3, rw, 3);
      }
    }
    // the payline
    ctx.fillStyle = 'rgba(255,90,74,0.8)';
    ctx.fillRect(cx - 8, top + Math.round(cell * 1.5), cw + 16, 1);
    drawText(ctx, '2 ALIKE ×2   3 ALIKE ×5   3 COGS ×10', w / 2, h - 20, '#ffd04a', { align: 'center' });
  }

  private icon(ctx: CanvasRenderingContext2D, s: Sym, x: number, y: number, px: number) {
    const rows = ICON[s];
    const x0 = Math.round(x - (7 * px) / 2);
    const y0 = Math.round(y - (7 * px) / 2);
    ctx.fillStyle = '#2a1a0a';
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === '#') ctx.fillRect(x0 + c * px + 2, y0 + r * px + 2, px, px);
    ctx.fillStyle = COLOUR[s] === '#f4ecd8' ? '#8a8098' : COLOUR[s];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === '#') ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
  }
}
