import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { rng, shuffle } from '../../util';
import { Fx, glow, type Minigame, type Pad } from './common';

/** The symbols on Spoke's reels: cog (the jackpot), star, skull, bolt, moon. */
const SYMBOLS = ['COG', 'STAR', 'SKULL', 'BOLT', 'MOON'] as const;
type Sym = (typeof SYMBOLS)[number];
const COLOUR: Record<Sym, string> = { COG: '#ffd04a', STAR: '#3ac8b0', SKULL: '#8a8098', BOLT: '#3a9ae8', MOON: '#a070e0' };
const SHADE: Record<Sym, string> = { COG: '#b07a1a', STAR: '#1a7a6a', SKULL: '#4a4458', BOLT: '#1a5a9a', MOON: '#5a3a9a' };
const ICON: Record<Sym, string[]> = {
  COG: ['..#.#..', '.#####.', '##...##', '.#.#.#.', '##...##', '.#####.', '..#.#..'],
  STAR: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  SKULL: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#####.', '.#.#.#.'],
  BOLT: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  MOON: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
};

/** How far past its symbol a stopping reel runs before it settles back, in symbols. */
const OVER = 0.2;

/**
 * Spoke's reels: three of them, spinning; press the button to stop each in turn, like the
 * picture slots in Mario 3. A reel doesn't stop dead: it runs on two symbols and thunks into
 * place, so you time it by watching the strip come round. Two alike pay, three pay more, three
 * cogs pays most. If the first two match, the last reel speeds up. Bold: faster reels, a bigger
 * stake.
 */
export class Reels implements Minigame {
  readonly title = "SPOKE'S REELS";
  readonly how = 'PRESS THE BUTTON TO STOP EACH REEL. IT RUNS ON TWO SYMBOLS BEFORE IT STOPS: WATCH THE STRIP AND TIME IT. THREE COGS PAYS MOST.';
  result: number | null = null;
  private strips: Sym[][] = [];
  private pos = [0, 0, 0];
  private speed: number[];
  /** A stopping reel: where from, where to, how far along (0..1). */
  private stops: ({ from: number; to: number; k: number; dur: number; settle: number } | null)[] = [null, null, null];
  private stopped = [false, false, false];
  private at = 0;
  private wait = 0;
  private time = 0;
  /** When the current reel was started on, for the auto-stop. */
  private since = 0;
  private hot = false;
  private lever = 0;
  private win: Sym | null = null;
  private fx = new Fx();

  constructor(bold: boolean, seed: number) {
    const r = rng(seed);
    for (let k = 0; k < 3; k++) {
      // one cog a strip, two of everything else
      const s: Sym[] = ['COG', 'STAR', 'STAR', 'SKULL', 'SKULL', 'BOLT', 'BOLT', 'MOON', 'MOON'];
      this.strips.push(shuffle(r, s));
      this.pos[k] = r() * 9;
    }
    this.speed = bold ? [8, 9, 10] : [4.6, 5.2, 5.8];
  }

  /** The symbol on the payline of reel k (or `offset` rows below it). */
  private sym(k: number, offset = 0): Sym {
    const s = this.strips[k];
    return s[(((Math.round(this.pos[k]) + offset) % s.length) + s.length) % s.length];
  }

  status() {
    if (this.result !== null) return this.win === 'COG' ? 'JACKPOT!' : this.result > 0 ? 'A WIN!' : 'NOTHING. SPOKE GRINS.';
    if (this.at >= 3) return 'AND THE REELS SAY...';
    return `REEL ${this.at + 1}: PRESS TO STOP${this.hot ? '  ONE MORE!' : ''}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    this.lever = Math.max(0, this.lever - dt * 4);
    if (this.result !== null) return;
    this.time += dt;
    this.since += dt;
    for (let k = 0; k < 3; k++) {
      if (this.stopped[k]) continue;
      const s = this.stops[k];
      if (s && s.k < 1) {
        // slowing from full speed, running a little past...
        s.k = Math.min(1, s.k + dt / s.dur);
        this.pos[k] = s.from + (s.to + OVER - s.from) * (1 - (1 - s.k) ** 2);
        if (s.k >= 1) {
          this.fx.shake(2, 0.12);
          audio.play('block', { pitch: 1.4, vol: 0.7 });
        }
      } else if (s) {
        // ...then the catch thunks it back
        s.settle = Math.min(1, s.settle + dt / 0.14);
        this.pos[k] = s.to + OVER * (1 - s.settle) ** 2;
        if (s.settle >= 1) {
          this.pos[k] = s.to;
          this.stopped[k] = true;
          this.landed(k);
        }
      } else this.pos[k] += dt * this.speed[k] * (k === 2 && this.hot ? 1.15 : 1);
    }
    // a reel left too long stops itself
    const auto = this.since > 5;
    if (this.at < 3 && (pad.press || auto) && this.time > 0.3) {
      const k = this.at;
      const to = Math.floor(this.pos[k]) + 2;
      this.stops[k] = { from: this.pos[k], to, k: 0, dur: ((to + OVER - this.pos[k]) / this.speed[k]) * 2, settle: 0 };
      this.at++;
      this.since = 0;
      this.lever = 1;
      audio.play('ui_select', { pitch: 0.8 });
    }
    if (this.stopped.every(Boolean)) {
      this.wait += dt;
      if (this.wait > 0.5) {
        const s = [this.sym(0), this.sym(1), this.sym(2)];
        const same = s[0] === s[1] && s[1] === s[2];
        this.result = same && s[0] === 'COG' ? 1 : same ? 0.7 : s[0] === s[1] || s[1] === s[2] || s[0] === s[2] ? 0.4 : 0;
        this.win = same ? s[0] : s[0] === s[1] || s[0] === s[2] ? s[0] : s[1] === s[2] ? s[1] : null;
        if (this.result > 0) {
          const n = this.result >= 1 ? 90 : this.result >= 0.7 ? 50 : 22;
          for (let k = 0; k < n; k++) this.fx.spark(240 + (this.fx.rand() - 0.5) * 200, 120, (this.fx.rand() - 0.5) * 260, -120 - this.fx.rand() * 200, 1.6, this.fx.rand() < 0.7 ? '#ffd04a' : '#ffffff', { size: 2, grav: 420, drag: 0.5 });
          this.fx.flash(this.result >= 1 ? '#ffd04a' : '#fff0c0', this.result >= 1 ? 0.4 : 0.2);
          if (this.result >= 1) {
            this.fx.shake(5, 0.6);
            audio.play('perfect');
          }
          audio.play('pickup_part');
        } else audio.play('ui_error');
      }
    }
  }

  /** A reel came to rest: if the first two match, the last one gets hot. */
  private landed(k: number) {
    if (k === 1 && this.sym(0) === this.sym(1)) {
      this.hot = true;
      audio.play('risk_up');
      this.fx.word('ONE MORE!', 240, 30, '#ff8a3a', 2);
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    // the back wall: a dim saloon
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2a1608');
    bg.addColorStop(1, '#0e0804');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    glow(ctx, w / 2, 20, 220, '#ff9a3a', 0.15);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    // the brass cabinet
    const cw = 336;
    const cx = Math.round((w - cw) / 2) - 12;
    const top = 30;
    const cell = 44;
    const rw = 98;
    const gap = 21;
    const cab = ctx.createLinearGradient(cx - 12, 0, cx + cw + 12, 0);
    cab.addColorStop(0, '#5a3a1a');
    cab.addColorStop(0.15, '#a07a3a');
    cab.addColorStop(0.5, '#7a5226');
    cab.addColorStop(0.85, '#a07a3a');
    cab.addColorStop(1, '#4a2e12');
    ctx.fillStyle = DARK;
    ctx.fillRect(cx - 14, 6, cw + 28, h - 22);
    ctx.fillStyle = cab;
    ctx.fillRect(cx - 12, 8, cw + 24, h - 26);
    ctx.fillStyle = '#d0a85a';
    ctx.fillRect(cx - 12, 8, cw + 24, 2);
    // bulbs round the top, chasing (faster when hot, all lit on a win)
    for (let k = 0; k < 14; k++) {
      const x = cx - 4 + k * 25;
      const on = this.result ? (this.result > 0 ? Math.floor(t * 10) % 2 === 0 : false) : Math.floor(t * (this.hot ? 14 : 5) + k) % 3 === 0;
      ctx.fillStyle = on ? '#fff0a0' : '#6a4a1a';
      ctx.fillRect(x, 14, 4, 4);
      if (on) glow(ctx, x + 2, 16, 8, '#ffd04a', 0.6);
    }
    // rivets
    ctx.fillStyle = '#d0a85a';
    for (const y of [24, h - 30]) for (const x of [cx - 8, cx + cw + 6]) ctx.fillRect(x, y, 2, 2);
    // the window
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(cx - 4, top - 4, cw + 8, cell * 3 + 8);
    for (let k = 0; k < 3; k++) {
      const x = cx + k * (rw + gap);
      this.reel(ctx, k, x, top, rw, cell, t);
      // a lamp under each reel
      const ly = top + cell * 3 + 6;
      ctx.fillStyle = this.stopped[k] ? '#ffd04a' : k === this.at && Math.floor(t * 4) % 2 ? '#8affe0' : '#3a2410';
      ctx.fillRect(x, ly, rw, 3);
      if (k === this.at && this.result === null) {
        // the auto-stop fuse
        const f = Math.max(0, 1 - this.since / 5);
        ctx.fillStyle = f < 0.3 ? '#ff5a4a' : '#8a6a3a';
        ctx.fillRect(x, ly + 5, Math.round(rw * f), 1);
      }
    }
    // the payline, with arrows at each end
    const py = top + Math.round(cell * 1.5);
    const winning = this.result !== null && this.result > 0;
    ctx.fillStyle = winning ? (Math.floor(t * 8) % 2 ? '#ffffff' : '#ffd04a') : 'rgba(255,90,74,0.85)';
    ctx.fillRect(cx - 6, py, cw + 12, 1);
    drawText(ctx, '→', cx - 12, py - 3, winning ? '#ffd04a' : '#ff5a4a', { shadow: false });
    drawText(ctx, '←', cx + cw + 7, py - 3, winning ? '#ffd04a' : '#ff5a4a', { shadow: false });
    if (winning) glow(ctx, cx + cw / 2, py, 160, '#ffd04a', 0.2);
    // the lever on the side
    const lx = cx + cw + 22;
    const ly = 60 + Math.round(this.lever * 40);
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(lx - 2, 56, 6, 110);
    ctx.fillStyle = '#c8c8d0';
    ctx.fillRect(lx, ly, 2, 110 - (ly - 56));
    ctx.fillStyle = DARK;
    ctx.fillRect(lx - 4, ly - 6, 10, 10);
    ctx.fillStyle = '#d82a2a';
    ctx.fillRect(lx - 3, ly - 5, 8, 8);
    ctx.fillStyle = '#ff8a7a';
    ctx.fillRect(lx - 2, ly - 4, 3, 2);
    // the paytable
    const ty = h - 44;
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(cx, ty - 3, cw, 13);
    drawText(ctx, '2 ALIKE ×2    3 ALIKE ×5    3 COGS ×10', cx + cw / 2, ty, '#ffd04a', { align: 'center' });
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    fx.drawFlash(ctx, w, h);
  }

  /** One drum: a paper strip with the symbols, curved by shading, blurred when it spins fast. */
  private reel(ctx: CanvasRenderingContext2D, k: number, x: number, top: number, rw: number, cell: number, t: number) {
    const hh = cell * 3;
    ctx.fillStyle = '#f0e2c0';
    ctx.fillRect(x, top, rw, hh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, rw, hh);
    ctx.clip();
    const spinning = !this.stopped[k];
    const s = this.stops[k];
    const blur = spinning && !s ? this.speed[k] / 4 : s && s.k < 1 ? (1 - s.k) * (this.speed[k] / 4) : 0;
    const frac = this.pos[k] - Math.floor(this.pos[k]);
    // symbols run downwards: a later position is the next one in from the top
    for (let j = -2; j <= 2; j++) {
      const sym = this.strips[k][(((Math.floor(this.pos[k]) - j) % 9) + 9) % 9];
      const y = Math.round(top + cell * 1.5 + (j + frac) * cell);
      if (blur > 0.4) {
        ctx.globalAlpha = 0.25;
        this.icon(ctx, sym, x + rw / 2, y - Math.round(blur * 6), 4);
        this.icon(ctx, sym, x + rw / 2, y + Math.round(blur * 6), 4);
        ctx.globalAlpha = 1;
      }
      const win = this.result !== null && this.result > 0 && j === 0 && sym === this.win && Math.floor(t * 6) % 2 === 0;
      if (win) {
        ctx.fillStyle = '#fff8d0';
        ctx.fillRect(x + 4, y - cell / 2 + 2, rw - 8, cell - 4);
      }
      this.icon(ctx, sym, x + rw / 2, y, 4);
    }
    ctx.restore();
    // shading: the drum curves away top and bottom
    const g = ctx.createLinearGradient(0, top, 0, top + hh);
    g.addColorStop(0, 'rgba(30,14,4,0.8)');
    g.addColorStop(0.28, 'rgba(30,14,4,0)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.72, 'rgba(30,14,4,0)');
    g.addColorStop(1, 'rgba(30,14,4,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(x, top, rw, hh);
    ctx.fillStyle = 'rgba(30,14,4,0.35)';
    ctx.fillRect(x, top, 3, hh);
    ctx.fillRect(x + rw - 3, top, 3, hh);
  }

  private icon(ctx: CanvasRenderingContext2D, s: Sym, x: number, y: number, px: number) {
    const rows = ICON[s];
    const x0 = Math.round(x - (7 * px) / 2);
    const y0 = Math.round(y - (7 * px) / 2);
    const a = ctx.globalAlpha;
    ctx.fillStyle = '#2a1a0a';
    ctx.globalAlpha = a * 0.5;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === '#') ctx.fillRect(x0 + c * px + 2, y0 + r * px + 2, px, px);
    ctx.globalAlpha = a;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        if (rows[r][c] !== '#') continue;
        ctx.fillStyle = COLOUR[s];
        ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
        // a lit top-left on each block, a shaded underside
        ctx.fillStyle = SHADE[s];
        ctx.fillRect(x0 + c * px, y0 + r * px + px - 1, px, 1);
      }
  }
}
