import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, damp, rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, nebula, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

/** Plain, bobbing on a chain, pulled towards you, or on a fuse that blows when you come near. */
type Kind = 'mine' | 'bob' | 'magnet' | 'fuse';

interface Mine {
  x: number;
  y: number;
  kind: Kind;
  /** Bobbing: how far, how fast, and where in the swing it starts. */
  amp: number;
  rate: number;
  phase: number;
  /** Magnets: how far it's been pulled off its spot. */
  pull: number;
  tug: boolean;
  /** Fuse mines: seconds left once armed, -1 until then. */
  fuse: number;
  skimmed: boolean;
  dead: boolean;
  /** Last frame's distance ahead of the ship, to catch it going past. */
  prev: number;
}

/** A broken girder turning on a pivot, filling a whole column. */
interface Sweeper {
  x: number;
  y: number;
  len: number;
  rate: number;
  a0: number;
  /** The closest it came to you on the way past. */
  near: number;
  touched: boolean;
  skimmed: boolean;
}

interface Blast {
  x: number;
  y: number;
  r: number;
  t: number;
}

const ROW = 22;
const SKIM = 18;
const CLOSE = 11;

/**
 * Thread it: side-on, through a field of mines. Up and down to steer; hold the button to burn.
 * You need to burn to make it in time, but burning makes the ship stiff to steer, so ease off
 * before a big jink. Pass a mine close to skim it (closer counts double): skims chain, and every
 * third one in a row raises the multiplier, up to ×5. The style they earn is a big part of the
 * score, so the best runs hug the edges of every gap. Three hits and you're out.
 *
 * The field changes with the level. EASY has plain mines and a few on chains, bobbing. TRICKY adds
 * magnets, which drift into the gap as you come (stay central, or burn so they have less time).
 * HARD adds fuse mines, which arm when you come near and blow a moment later: burn through them
 * and you're gone before they go (and chains of them set each other off). VICIOUS adds sweeping
 * girders to time your way past. Higher levels are faster, with tighter gaps that jump further.
 */
export class Thread implements Minigame {
  readonly title = 'THREAD IT';
  readonly how = 'UP/DOWN TO STEER. HOLD TO BURN: FASTER BUT STIFFER, AND YOU NEED IT. SKIM MINES CLOSE TO CHAIN A MULTIPLIER. ARMED MINES BLOW: BURN PAST.';
  result: number | null = null;
  private y = 0;
  private vy = 0;
  private v = 0;
  private dist = 0;
  private hits = 0;
  private hurt = 0;
  private slow = 0;
  private time = 0;
  private readonly limit = 20;
  private readonly goal: number;
  private mines: Mine[] = [];
  private sweepers: Sweeper[] = [];
  private blasts: Blast[] = [];
  private burn = false;
  private skims = 0;
  private chain = 0;
  private chainT = 0;
  private bestChain = 0;
  private points = 0;
  private readonly target: number;
  private tugCd = 0;
  private boomCd = 0;
  private armCd = 0;
  /** Once it's over: through the far side (and flying off), or wrecked. */
  private done = false;
  private wrecked = false;
  private exitX = 0;
  private readonly top = 12;
  private readonly fieldH: number;
  private readonly sx = 72;
  private fx = new Fx();
  // by level
  private readonly cruise: number;
  private readonly burnV: number;
  private readonly pullMax: number;
  private readonly pullSp: number;
  private readonly fuseT: number;
  private readonly blastR = 26;
  private readonly armR = 52;

  constructor(
    level: number,
    private seed: number,
    h = 240,
  ) {
    const r = rng(seed);
    const d = hardness(level);
    this.fieldH = h - 30;
    this.y = this.fieldH / 2;
    this.cruise = byLevel(d, 110, 150);
    this.burnV = byLevel(d, 200, 260);
    this.v = this.cruise;
    // the share of the run you must spend burning to get there in time
    this.goal = Math.round(this.limit * (this.cruise + byLevel(d, 0.4, 0.55) * (this.burnV - this.cruise)));
    this.pullMax = byLevel(d, 12, 20);
    this.pullSp = byLevel(d, 28, 44);
    this.fuseT = byLevel(d, 0.5, 0.32);

    // columns of mines, each with a gap that moves only so far from the last one, so there's always a way
    const step = byLevel(d, 76, 60);
    const gw = byLevel(d, 58, 42);
    const shift = byLevel(d, 56, 64);
    const weights: [Kind | 'sweep', number][] = [
      ['mine', byLevel(d, 75, 20)],
      ['bob', byLevel(d, 25, 20)],
      ['magnet', level >= 2 ? 20 : 0],
      ['fuse', level >= 3 ? byLevel(d, 20, 22) : 0],
      ['sweep', level >= 4 ? byLevel(d, 12, 18) : 0],
    ];
    const sum = weights.reduce((s, [, w]) => s + w, 0);
    const roll = () => {
      let k = r() * sum;
      for (const [kind, w] of weights) if ((k -= w) < 0) return kind;
      return 'mine';
    };
    let gap = this.fieldH / 2;
    let cols = 0;
    let lastSweep = -9;
    for (let x = 300; x < this.goal + 40; x += step * (0.9 + r() * 0.2), cols++) {
      let kind = cols < 3 ? 'mine' : roll();
      if (kind === 'sweep') {
        const len = byLevel(d, 50, 58);
        const lo = len + 10;
        const hi = this.fieldH - len - 10;
        const want = clamp(gap + (r() - 0.5) * shift, lo, hi);
        if (cols - lastSweep < 4 || Math.abs(want - gap) > shift) kind = 'mine';
        else {
          lastSweep = cols;
          gap = want;
          x += step * 0.5;
          this.sweepers.push({ x, y: gap, len, rate: (r() < 0.5 ? -1 : 1) * (level >= 5 ? 2 : 1.6), a0: r() * Math.PI * 2, near: 99, touched: false, skimmed: false });
          for (let y = 10; y < this.fieldH; y += ROW) if (Math.abs(y - gap) > len + 16) this.mines.push(this.mine(x + (r() - 0.5) * 8, y, 'mine', r));
          x += step * 0.5;
          continue;
        }
      }
      const k = kind as Kind;
      const widen = k === 'magnet' ? this.pullMax * 2 : k === 'fuse' ? 8 : 0;
      const half = (gw + widen) / 2;
      gap = clamp(gap + (r() - 0.5) * 2 * shift * (k === 'bob' ? 0.55 : 1), half + 8, this.fieldH - half - 8);
      const amp = byLevel(d, 12, 20);
      const rate = 1.6 + r() * 1.2;
      const phase = r() * 6;
      for (let y = 10; y < this.fieldH; y += ROW) {
        if (Math.abs(y - gap) < half + 4) continue;
        if (r() < 0.16) continue;
        const m = this.mine(x + (r() - 0.5) * 14, y + (r() - 0.5) * 6, k, r);
        if (k === 'bob') {
          // the whole column swings together, so the gap moves but keeps its width
          m.amp = amp;
          m.rate = rate;
          m.phase = phase;
        }
        this.mines.push(m);
      }
    }
    this.target = Math.round(cols * 2.4);
  }

  private mine(x: number, y: number, kind: Kind, r: () => number): Mine {
    return { x, y, kind, amp: 0, rate: 0, phase: r() * 6, pull: 0, tug: false, fuse: -1, skimmed: false, dead: false, prev: 999 };
  }

  private mineY(m: Mine) {
    return m.y + m.pull + (m.amp ? Math.sin(this.time * m.rate + m.phase) * m.amp : 0);
  }

  private get mult() {
    return 1 + Math.min(4, Math.floor(this.chain / 3));
  }

  private get style() {
    return Math.min(1, this.points / (this.target || 1));
  }

  private score() {
    const f = Math.min(1, this.dist / this.goal);
    if (this.wrecked) return Math.min(0.2, f * 0.25);
    const s = f >= 1 ? 0.62 + this.style * 0.38 : f * 0.55 + this.style * 0.3;
    return clamp(s - this.hits * 0.12, 0, 1);
  }

  status() {
    const pct = Math.min(100, Math.round((this.dist / this.goal) * 100));
    return `${pct}% THROUGH  ${'♥'.repeat(Math.max(0, 3 - this.hits))}  STYLE ${Math.round(this.style * 100)}%${this.chain >= 3 ? `  ×${this.mult}` : ''}`;
  }

  breakdown(): [string, string][] {
    return [
      ['THROUGH', `${Math.min(100, Math.round((this.dist / this.goal) * 100))}%`],
      ['SKIMS', `${this.skims}`],
      ['BEST CHAIN', `${this.bestChain}`],
      ['HITS', `${this.hits}`],
    ];
  }

  /** Screen position of a point in the field. */
  private scr(x: number, y: number): [number, number] {
    return [x - this.dist + this.sx, y + this.top];
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < 0.7);
    if (this.result !== null) {
      audio.loop('engine', 'thread', false);
      if (this.done) this.exitX += dt * 320;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    this.hurt -= dt;
    this.slow -= dt;
    this.tugCd -= dt;
    this.boomCd -= dt;
    this.armCd -= dt;
    this.chainT -= dt;
    if (this.chainT <= 0 && this.chain) {
      if (this.chain >= 3) audio.play('risk_lost', { vol: 0.4 });
      this.chain = 0;
    }

    // burning is fast but stiff
    if (pad.hold && !this.burn) audio.play('boost', { vol: 0.5 });
    this.burn = pad.hold;
    this.vy += (pad.y * (this.burn ? 620 : 1050) - this.vy * 7) * dt;
    this.y += this.vy * dt;
    if (this.y < 6 || this.y > this.fieldH - 6) {
      this.y = clamp(this.y, 6, this.fieldH - 6);
      this.vy = 0;
    }
    this.v = damp(this.v, (this.burn ? this.burnV : this.cruise) * (this.slow > 0 ? 0.5 : 1), 6, dt);
    this.dist += this.v * dt;

    for (const m of this.mines) {
      if (m.dead) continue;
      const dx = m.x - this.dist;
      if (m.fuse >= 0) {
        m.fuse -= dt;
        if (m.fuse <= 0) {
          this.blow(m);
          continue;
        }
      }
      if (dx < -40 || dx > 140) {
        m.prev = dx;
        continue;
      }
      // magnets drift towards you as you come, and hold still for the last moment before you pass
      if (m.kind === 'magnet' && dx > 28 && dx < 110) {
        const want = clamp(this.y - m.y, -this.pullMax, this.pullMax);
        const s = this.pullSp * dt;
        m.pull += clamp(want - m.pull, -s, s);
        if (!m.tug) {
          m.tug = true;
          if (this.tugCd <= 0) {
            audio.play('seeker_halt', { vol: 0.3, pitch: 1.4 });
            this.tugCd = 0.4;
          }
        }
      }
      const my = this.mineY(m);
      const dy = my - this.y;
      if (m.kind === 'fuse' && m.fuse < 0 && dx > -20 && Math.hypot(dx, dy) < this.armR) this.arm(m, this.fuseT);
      if (this.hurt <= 0 && Math.abs(dx) < 9 && Math.abs(dy) < 7) {
        m.dead = true;
        this.boom(m.x, my, 22);
        this.hit(dy > 0 ? -1 : 1);
        if (this.result !== null) return;
        continue;
      }
      if (m.prev > 0 && dx <= 0 && !m.skimmed && this.hurt <= 0 && Math.abs(dy) < SKIM) {
        m.skimmed = true;
        this.skim(Math.abs(dy) < CLOSE ? 2 : 1, dy, Math.abs(dy) < CLOSE ? 'CLOSE!' : 'SKIM');
      }
      m.prev = dx;
    }

    // girders: a hit if the arm (or the pivot) touches you, a shave if it nearly does
    for (const s of this.sweepers) {
      const dx = s.x - this.dist;
      if (dx < -s.len - 14) {
        if (!s.skimmed && !s.touched && s.near < 14) {
          s.skimmed = true;
          this.skim(3, 0, 'SHAVED IT!');
        }
        continue;
      }
      if (dx > s.len + 14) continue;
      const a = s.a0 + s.rate * this.time;
      const ex = Math.cos(a) * s.len;
      const ey = Math.sin(a) * s.len;
      const py = this.y - s.y;
      let near = 99;
      for (const o of [-8, 0, 8]) {
        const px = -dx + o;
        const k = clamp((px * ex + py * ey) / (s.len * s.len), 0, 1);
        near = Math.min(near, Math.hypot(px - ex * k, py - ey * k), Math.hypot(px, py) - 4);
      }
      s.near = Math.min(s.near, near);
      if (this.hurt <= 0 && near < 5) {
        s.touched = true;
        const [bx, by] = [this.dist, this.y];
        this.boom(bx, by, 16);
        this.hit(py < 0 ? -1 : 1);
        if (this.result !== null) return;
      }
    }

    // the engine leaves a trail
    if (this.fx.rand() < (this.burn ? 1 : 0.5))
      this.fx.spark(this.sx - 12, this.y + this.top + (this.fx.rand() - 0.5) * 2, -(this.burn ? 160 : 90) - this.fx.rand() * 40, (this.fx.rand() - 0.5) * 12, this.burn ? 0.35 : 0.2, this.burn ? '#ffd04a' : '#ff8a3a', { drag: 3 });
    if (this.chain >= 6 && this.fx.rand() < 0.4) this.fx.spark(this.sx - 8, this.y + this.top + (this.fx.rand() - 0.5) * 8, -120, 0, 0.3, '#8affe0', { drag: 2 });

    if (this.result !== null) {
      audio.loop('engine', 'thread', false);
      return;
    }
    if (this.dist >= this.goal) this.finish();
    else if (this.time >= this.limit) {
      this.result = this.score();
      audio.play('ui_error');
      this.fx.word('OUT OF TIME', 240, this.fieldH / 2, '#ff8a3a', 2, { pop: true, life: 1.6 });
    }
    audio.loop('engine', 'thread', this.result === null, this.burn ? 0.9 : 0.4);
  }

  private skim(base: number, dy: number, word: string) {
    const before = this.mult;
    this.skims++;
    this.chain++;
    this.chainT = 1.4;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.points += base * this.mult;
    audio.play('skim', { pitch: 1 + Math.min(this.chain, 12) * 0.05 });
    const sx = this.sx;
    const yy = this.y + this.top + (dy > 0 ? 5 : -5);
    for (let k = 0; k < 6 + base * 3; k++) this.fx.spark(sx, yy, -60 - this.fx.rand() * 90, (this.fx.rand() - 0.5) * 70, 0.35, k % 2 ? '#8affe0' : '#ffffff');
    this.fx.word(word, sx + 14, this.y + this.top - 16, base > 1 ? '#ffffff' : '#8affe0', 1, { pop: base > 1, life: 0.6 });
    if (this.mult > before) {
      this.fx.word(`×${this.mult}`, sx, this.y + this.top - 30, '#ffd04a', 2, { pop: true, life: 1 });
      this.fx.ring(sx, this.y + this.top, 26 + this.mult * 6, '#ffd04a', 0.35);
      audio.play('risk_up', { pitch: 0.9 + this.mult * 0.1 });
    }
  }

  /** A fuse mine arms: it'll blow in `time`. */
  private arm(m: Mine, time: number) {
    m.fuse = time;
    if (this.armCd <= 0) {
      audio.play('lock_on', { vol: 0.4 });
      this.armCd = 0.15;
    }
  }

  private blow(m: Mine) {
    m.dead = true;
    const y = this.mineY(m);
    this.blasts.push({ x: m.x, y, r: this.blastR, t: 0 });
    const [px, py] = this.scr(m.x, y);
    this.fx.burst(px, py, 22, 120, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.5 });
    this.fx.ring(px, py, this.blastR, '#ff8a3a', 0.3);
    this.fx.shake(3, 0.2);
    if (this.boomCd <= 0) {
      audio.play('explode_small', { vol: 0.6 });
      this.boomCd = 0.08;
    }
    // it sets off its neighbours
    for (const o of this.mines) if (!o.dead && o.kind === 'fuse' && o.fuse < 0 && Math.hypot(o.x - m.x, this.mineY(o) - y) < 40) this.arm(o, 0.12);
    if (this.result !== null) return;
    const d = Math.hypot(m.x - this.dist, y - this.y);
    if (this.hurt <= 0 && d < this.blastR + 4) this.hit(y > this.y ? -1 : 1);
    else if (this.hurt <= 0 && d < this.blastR + 22) this.skim(3, y - this.y, 'DODGED!');
  }

  /** The flash and fire where a mine went up. */
  private boom(x: number, y: number, r: number) {
    this.blasts.push({ x, y, r, t: 0 });
  }

  private hit(dir: number) {
    this.hits++;
    this.hurt = 1;
    this.slow = 0.5;
    this.vy = dir * 220;
    if (this.chain >= 3) this.fx.word('CHAIN LOST', this.sx + 20, this.y + this.top + 14, '#ff8a7a');
    this.chain = 0;
    this.chainT = 0;
    const [x, y] = [this.sx, this.y + this.top];
    this.fx.burst(x, y, 34, 150, ['#ffffff', '#ffd04a', '#ff8a3a', '#ff5a4a'], { life: 0.7 });
    this.fx.ring(x, y, 34, '#ff5a4a', 0.3);
    this.fx.shake(6, 0.35);
    this.fx.flash('#ff5a4a', 0.15);
    this.fx.stop(0.09);
    audio.play('explode_small');
    audio.play('player_hit', { vol: 0.6 });
    if (this.hits >= 3) {
      this.wrecked = true;
      this.result = this.score();
      this.fx.stop(0.18);
      this.fx.burst(x, y, 60, 200, ['#ffffff', '#ffd04a', '#ff8a3a', '#5a5466'], { life: 1 });
      this.fx.ring(x, y, 80, '#ff8a3a', 0.6);
      this.fx.word('WRECKED', 240, this.fieldH / 2, '#ff5a4a', 2, { pop: true, life: 1.6 });
      audio.play('explode_big');
    } else this.fx.word('HIT!', x + 14, y - 16, '#ff5a4a', 1, { pop: true });
  }

  private finish() {
    this.done = true;
    this.result = this.score();
    const [x, y] = [this.sx + 20, this.y + this.top];
    const clean = this.hits === 0;
    this.fx.stop(0.12);
    this.fx.flash('#ffd04a', 0.22);
    this.fx.burst(x, y, 50, 160, ['#ffd04a', '#8affb0', '#ffffff']);
    this.fx.ring(x, y, 60, '#ffd04a', 0.5);
    this.fx.ring(x, y, 110, '#8affb0', 0.8);
    this.fx.word(clean ? 'FLAWLESS!' : 'THROUGH!', 240, this.fieldH / 2 - 10, clean ? '#8affb0' : '#ffd04a', 2, { pop: true, life: 1.6 });
    audio.play(clean ? 'perfect' : 'warp', { vol: 0.7 });
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    nebula(ctx, w, h, this.seed, [40, 20, 70], [70, 40, 30], this.dist * 0.15);
    stars(ctx, w, h, this.seed, this.dist * 0.6, this.burn ? 6 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const sx = this.sx;
    const oyF = this.top;
    // the way out at the far end
    const ex = Math.round(this.goal - this.dist + sx + 20);
    if (ex < w + 20) {
      for (let y = oyF; y < oyF + this.fieldH; y += 6) {
        ctx.fillStyle = Math.floor(y / 6 + t * 8) % 2 ? '#ffd04a' : '#8a6a1a';
        ctx.fillRect(ex, y, 3, 4);
      }
      glow(ctx, ex + 1, oyF + this.fieldH / 2, 60, '#ffd04a', 0.3);
      drawText(ctx, 'CLEAR', ex + 8, oyF + this.fieldH / 2 - 3, '#ffd04a');
    }
    for (const s of this.sweepers) {
      const [x, y] = this.scr(s.x, s.y);
      if (x < -s.len - 10 || x > w + s.len + 10) continue;
      this.girder(ctx, Math.round(x), Math.round(y), s, t);
    }
    for (const m of this.mines) {
      if (m.dead) continue;
      const x = Math.round(m.x - this.dist + sx);
      if (x < -12 || x > w + 12) continue;
      const my = this.mineY(m);
      const y = Math.round(my) + oyF;
      const near = Math.hypot(x - sx, my - this.y);
      this.drawMine(ctx, x, y, t, m, near);
    }
    for (const b of this.blasts) {
      const [x, y] = this.scr(b.x, b.y);
      const f = b.t / 0.7;
      glow(ctx, x, y, b.r * 1.4 * (1 - f), '#ff8a3a', 1 - f * 1.4);
      ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.7 - f * 3)})`;
      ctx.beginPath();
      ctx.arc(x, y, b.r * Math.min(1, f * 5), 0, Math.PI * 2);
      ctx.fill();
    }
    fx.drawSparks(ctx);
    if (!this.wrecked && (this.hurt <= 0 || Math.floor(t * 16) % 2)) sideShip(ctx, sx + this.exitX, this.y + oyF, this.result !== null ? (this.done ? 1 : 0.2) : this.burn ? 1 : 0.45, '#c86a3a', t);
    // the chain, riding with you: its multiplier and how long it has left
    if (this.chain && this.result === null) {
      const cx = sx;
      const cy = Math.round(this.y + oyF) - 18;
      const col = this.mult >= 3 ? '#ffd04a' : '#8affe0';
      drawText(ctx, this.mult > 1 ? `×${this.mult}` : `${this.chain}`, cx, cy - 6, col, { align: 'center' });
      ctx.fillStyle = 'rgba(10,7,16,0.7)';
      ctx.fillRect(cx - 9, cy + 3, 18, 2);
      ctx.fillStyle = col;
      ctx.fillRect(cx - 9, cy + 3, Math.round(18 * Math.max(0, this.chainT / 1.4)), 2);
    }
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.45);
    timer(ctx, w, this.limit - this.time, this.limit, t);

    // progress, hearts, style
    const by = h - 13;
    ctx.fillStyle = 'rgba(10,7,16,0.8)';
    ctx.fillRect(0, by - 5, w, 18);
    const pw = 220;
    meter(ctx, 10, by, pw, 4, this.dist / this.goal, '#8affb0');
    // where you'd get to without burning any more, so you can see if you need to
    const coast = Math.min(1, (this.dist + (this.limit - this.time) * this.cruise) / this.goal);
    const short = coast < 1 && this.result === null;
    ctx.fillStyle = short ? (Math.floor(t * 4) % 2 ? '#ff8a7a' : '#ff5a4a') : '#5a7a6a';
    ctx.fillRect(10 + Math.round(pw * coast), by - 2, 1, 8);
    for (let k = 0; k < 3; k++) drawText(ctx, '♥', pw + 22 + k * 10, by - 1, k < 3 - this.hits ? '#ff5a4a' : '#3a2e48');
    drawText(ctx, 'STYLE', pw + 64, by - 1, '#8affe0');
    meter(ctx, pw + 98, by, 80, 4, this.style, this.style >= 1 ? '#ffd04a' : '#8affe0');
    if (this.burn && this.result === null) drawText(ctx, 'BURN', w - 8, by - 1, Math.floor(t * 8) % 2 ? '#ffd04a' : '#ff8a3a', { align: 'right' });
    else if (short && Math.floor(t * 2) % 2) drawText(ctx, 'BURN!', w - 8, by - 1, '#ff8a7a', { align: 'right' });
    fx.drawFlash(ctx, w, h);
  }

  /** A spiked mine: its lamp blinks faster and it glows as you come near. Each kind has its own look. */
  private drawMine(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, m: Mine, near: number) {
    const close = Math.max(0, 1 - near / 50);
    const armed = m.fuse >= 0;
    const lampC = m.kind === 'magnet' ? '#6ab0ff' : m.kind === 'fuse' ? '#ffb03a' : '#ff3a4a';
    if (close > 0) glow(ctx, x, y, 14 + close * 10, lampC, close * 0.5);
    if (m.kind === 'bob') {
      // the chain it swings on
      ctx.fillStyle = 'rgba(138,128,152,0.35)';
      const v = Math.cos(this.time * m.rate + m.phase);
      ctx.fillRect(x, y - Math.round(v * 8), 1, Math.round(v * 8));
    }
    if (m.kind === 'magnet' && m.tug && Math.abs(m.pull) < this.pullMax && m.x - this.dist > 28) {
      // field lines reaching for you
      const [, shipY] = this.scr(0, this.y);
      ctx.fillStyle = '#6ab0ff';
      const n = 5;
      for (let k = 1; k < n; k++) {
        if ((k + Math.floor(t * 12)) % 2) continue;
        ctx.fillRect(Math.round(x + (this.sx - x) * (k / n) * 0.5), Math.round(y + (shipY - y) * (k / n)), 1, 1);
      }
      glow(ctx, x, y, 16, '#6ab0ff', 0.35);
    }
    if (armed) {
      // the blast to come: a ring that tightens as the fuse burns
      const f = Math.max(0, m.fuse / this.fuseT);
      ctx.strokeStyle = Math.floor(t * 20) % 2 ? '#ffd04a' : '#ff5a4a';
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, this.blastR + f * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      glow(ctx, x, y, 20, '#ff8a3a', 0.6);
    }
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 5, 11, 11);
    ctx.fillRect(x - 1, y - 8, 3, 17);
    ctx.fillRect(x - 8, y - 1, 17, 3);
    // spikes
    ctx.fillStyle = m.kind === 'magnet' ? '#8aa0c8' : '#9a9aaa';
    ctx.fillRect(x, y - 7, 1, 15);
    ctx.fillRect(x - 7, y, 15, 1);
    ctx.fillRect(x - 5, y - 5, 1, 1);
    ctx.fillRect(x + 5, y - 5, 1, 1);
    ctx.fillRect(x - 5, y + 5, 1, 1);
    ctx.fillRect(x + 5, y + 5, 1, 1);
    // body
    ctx.fillStyle = m.kind === 'magnet' ? '#3a4a6a' : m.kind === 'fuse' ? '#5a3a2a' : m.skimmed ? '#4a5a6a' : '#5a5466';
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = m.kind === 'magnet' ? '#5a6a9a' : m.kind === 'fuse' ? '#8a5a2a' : '#7a748a';
    ctx.fillRect(x - 4, y - 4, 9, 2);
    ctx.fillRect(x - 4, y - 4, 2, 9);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(x - 4, y + 3, 9, 2);
    if (m.kind === 'fuse') {
      // hazard band
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(x - 4, y + 1, 9, 1);
    }
    // lamp
    const rate = armed ? 24 : 2 + close * 14;
    const on = Math.floor(t * rate + m.phase) % 2 === 0;
    ctx.fillStyle = on ? (armed ? '#ffffff' : lampC) : '#3a1a24';
    ctx.fillRect(x - 1, y - 1, 3, 3);
    if (on) glow(ctx, x + 0.5, y + 0.5, armed ? 10 : 6, lampC, 0.6);
  }

  /** A sweeping girder: a riveted arm from a lit pivot, with the circle it reaches drawn faint. */
  private girder(ctx: CanvasRenderingContext2D, x: number, y: number, s: Sweeper, t: number) {
    const a = s.a0 + s.rate * this.time;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,138,90,0.18)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(x, y, s.len, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // a faint wake behind the arm, so its way of turning reads
    for (let k = 1; k <= 3; k++) {
      const b = a - Math.sign(s.rate) * k * 0.12;
      ctx.globalAlpha = 0.25 / k;
      ctx.fillStyle = '#8a7a8a';
      for (let d = 8; d < s.len; d += 3) ctx.fillRect(Math.round(x + Math.cos(b) * d), Math.round(y + Math.sin(b) * d), 2, 2);
    }
    ctx.globalAlpha = 1;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    for (let d = 4; d < s.len; d += 1) {
      const px = Math.round(x + c * d);
      const py = Math.round(y + sn * d);
      ctx.fillStyle = DARK;
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }
    for (let d = 4; d < s.len; d += 1) {
      const px = Math.round(x + c * d);
      const py = Math.round(y + sn * d);
      ctx.fillStyle = d % 8 < 1 ? '#ffd04a' : '#7a6a72';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
    // the tip's warning light
    const tx = x + c * s.len;
    const ty = y + sn * s.len;
    glow(ctx, tx, ty, 10, '#ff5a3a', Math.floor(t * 6) % 2 ? 0.6 : 0.3);
    ctx.fillStyle = '#ff5a3a';
    ctx.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
    // the pivot
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 6, y - 6, 12, 12);
    ctx.fillStyle = '#5a5466';
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = '#7a748a';
    ctx.fillRect(x - 5, y - 5, 10, 2);
    ctx.fillStyle = Math.floor(t * 3) % 2 ? '#ff5a3a' : '#5a1a24';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
}
