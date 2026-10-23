import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, damp, rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, nebula, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';
import { drawFlashed, Juice, panel } from './thread-art';
import { penta } from './thread-sound';
import { drawSprite } from './sprites';

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
  /** Which way the arm pointed last frame (left or right), to hear it swing past upright. */
  side: number;
}

/** Something in the scenery: a sprite at a spot in a parallax layer. */
interface Deco {
  x: number;
  y: number;
  name: string;
  clip: string;
  rate: number;
  phase: number;
  alpha: number;
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
 * fourth one in a row raises the multiplier, up to ×4. The style they earn is a big part of the
 * score, so the best runs hug the edges of every gap. Three hits and you're out
 * (four on EASY and TRICKY).
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
  private pingT = 0;
  private tickT = 0;
  /** Once it's over: through the far side (and flying off), or wrecked. */
  private done = false;
  private wrecked = false;
  private exitX = 0;
  /** A one-line prompt at the moment a thing first matters, and the ones already shown. */
  private tip = { text: '', t: 0 };
  private told = new Set<string>();
  private readonly top = 12;
  private readonly fieldH: number;
  private readonly sx = 72;
  private fx = new Fx();
  private juice = new Juice('thread', ['scrap_0', 'scrap_1', 'scrap_2']);
  /** The scenery, far to near. */
  private far: Deco[] = [];
  private mid: Deco[] = [];
  private near: Deco[] = [];
  /** When the first frame was drawn (for the intro), the style as shown, the wreck's fall. */
  private t0 = -1;
  private shownStyle = 0;
  private wreckT = 0;
  // by level
  private readonly cruise: number;
  private readonly burnV: number;
  private readonly pullMax: number;
  private readonly pullSp: number;
  private readonly fuseT: number;
  private readonly blastR = 24;
  private readonly lives: number;
  /** What each hit takes off the score. */
  private readonly hitCost: number;
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
    this.cruise = byLevel(d, 95, 150);
    this.burnV = byLevel(d, 180, 260);
    this.v = this.cruise;
    // the share of the run you must spend burning to get there in time
    this.goal = Math.round(this.limit * (this.cruise + byLevel(d, 0.4, 0.55) * (this.burnV - this.cruise)));
    this.pullMax = byLevel(d, 8, 18);
    this.pullSp = byLevel(d, 28, 44);
    this.fuseT = byLevel(d, 0.5, 0.36);
    this.lives = level <= 2 ? 4 : 3;
    this.hitCost = byLevel(d, 0.09, 0.14);

    // columns of mines, each with a gap that moves only so far from the last one, so there's always a way
    const step = byLevel(d, 80, 60);
    const gw = byLevel(d, 66, 42);
    const shift = byLevel(d, 46, 66);
    const weights: [Kind | 'sweep', number][] = [
      ['mine', byLevel(d, 75, 20)],
      ['bob', byLevel(d, 25, 20)],
      ['magnet', level >= 2 ? 20 : 0],
      ['fuse', level >= 3 ? byLevel(d, 20, 22) : 0],
      ['sweep', level >= 4 ? byLevel(d, 12, 18) : 0],
    ];
    // the field thickens as you go: specials grow commoner and gaps tighter towards the end
    const roll = (p: number) => {
      const ws = weights.map(([kind, w]) => [kind, kind === 'mine' ? w : w * (0.5 + p)] as const);
      let k = r() * ws.reduce((s, [, w]) => s + w, 0);
      for (const [kind, w] of ws) if ((k -= w) < 0) return kind;
      return 'mine';
    };
    let gap = this.fieldH / 2;
    let cols = 0;
    let lastSweep = -9;
    for (let x = 300; x < this.goal + 40; x += step * (0.9 + r() * 0.2), cols++) {
      const p = x / this.goal;
      let kind = cols < 3 ? 'mine' : roll(p);
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
          this.sweepers.push({ x, y: gap, len, rate: (r() < 0.5 ? -1 : 1) * (level >= 5 ? 2 : 1.6), a0: r() * Math.PI * 2, near: 99, touched: false, skimmed: false, side: 0 });
          for (let y = 10; y < this.fieldH; y += ROW) if (Math.abs(y - gap) > len + 16) this.mines.push(this.mine(x + (r() - 0.5) * 8, y, 'mine', r));
          x += step * 0.5;
          continue;
        }
      }
      const k = kind as Kind;
      const widen = k === 'magnet' ? this.pullMax * 2 : k === 'fuse' ? 10 : 0;
      const half = (gw * (1.06 - 0.12 * p) + widen) / 2;
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
    this.target = Math.round(cols * byLevel(d, 7, 16));

    // the scenery: big mines hung on chains and a cache far off, rocks between, dark rocks near
    const deco = (name: string, x: number, y: number, clip: string, alpha = 1, rate = 1): Deco => ({ x, y, name, clip, rate, phase: r() * 4, alpha });
    const span = 640;
    this.far.push(deco('chained', r() * span, 30 + r() * 20, 'blink', 0.4), deco('chained', r() * span, 20 + r() * 40, 'blink', 0.32));
    this.far.push(deco('cache', r() * span, 60 + r() * (this.fieldH - 100), 'pulse', 0.55, 0.6));
    for (let k = 0; k < 9; k++) this.far.push(deco(`rock_far_${k % 2}`, r() * span, 10 + r() * (this.fieldH - 10), 'tumble', 0.45, 0.15 + r() * 0.2));
    for (let k = 0; k < 6; k++) this.mid.push(deco(`rock_${k % 3}`, r() * span, 14 + r() * (this.fieldH - 20), 'tumble', 0.7, 0.2 + r() * 0.3));
    for (let k = 0; k < 3; k++) {
      const topSide = k % 2 === 0;
      this.near.push(deco(k === 2 ? 'rock_fg_1' : 'rock_fg', k * 220 + r() * 100, topSide ? -2 - r() * 8 : this.fieldH + 26 + r() * 6, 'tumble', 1, 0.12 + r() * 0.1));
    }
  }

  /** Show a prompt once, the first time it matters. */
  private teach(key: string, text: string) {
    if (this.told.has(key) || this.result !== null) return;
    this.told.add(key);
    this.tip = { text, t: 2.4 };
  }

  private mine(x: number, y: number, kind: Kind, r: () => number): Mine {
    return { x, y, kind, amp: 0, rate: 0, phase: r() * 6, pull: 0, tug: false, fuse: -1, skimmed: false, dead: false, prev: 999 };
  }

  private mineY(m: Mine) {
    return m.y + m.pull + (m.amp ? Math.sin(this.time * m.rate + m.phase) * m.amp : 0);
  }

  private get mult() {
    return 1 + Math.min(3, Math.floor(this.chain / 4));
  }

  private get style() {
    return Math.min(1, this.points / (this.target || 1));
  }

  private score() {
    const f = Math.min(1, this.dist / this.goal);
    if (this.wrecked) return Math.min(0.2, f * 0.25);
    const s = f >= 1 ? 0.62 + this.style * 0.38 : f * 0.45 + this.style * 0.3;
    return clamp(s - this.hits * this.hitCost, 0, 1);
  }

  status() {
    const pct = Math.min(100, Math.round((this.dist / this.goal) * 100));
    return `${pct}% THROUGH  ${'♥'.repeat(Math.max(0, this.lives - this.hits))}  STYLE ${Math.round(this.style * 100)}%${this.chain >= 3 ? `  ×${this.mult}` : ''}`;
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
    this.juice.update(dt);
    this.shownStyle += (this.style - this.shownStyle) * Math.min(1, dt * 8);
    if (this.wrecked) this.wreckT += dt;
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < 0.7);
    if (this.result !== null) {
      audio.loop('engine', 'thread', false);
      if (this.done) {
        this.exitX += dt * (120 + this.exitX * 6);
        if (this.fx.rand() < 0.8) this.juice.streaks(this.sx + this.exitX - 16, this.y + this.top, 1, 160, ['#ffd04a', '#ff8a3a'], { dir: Math.PI, spread: 0.3, life: 0.3 });
      }
      if (this.wrecked && this.wreckT < 1.2 && this.fx.rand() < 0.6) this.juice.smoke(this.sx - this.wreckT * 40, this.y + this.top + this.wreckT ** 2 * 60, 1, '#2a2232', { size: 3, life: 1, vx: -40 });
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
    this.tip.t -= dt;
    if (this.time > 0.3) this.teach('burn', 'HOLD THE BUTTON TO BURN, OR YOU WON\'T MAKE IT');
    if (this.time > 2.8) this.teach('skim', 'PASS MINES CLOSE TO SKIM THEM: CHAIN SKIMS FOR STYLE');
    // the first of each special kind gets a word as it comes on screen
    for (const m of this.mines) {
      const dx = m.x - this.dist;
      if (dx > 380 || dx < 0 || m.kind === 'mine' || m.kind === 'bob') continue;
      if (m.kind === 'magnet') this.teach('magnet', 'BLUE MINES DRIFT IN AS YOU COME: KEEP TO THE MIDDLE');
      else this.teach('fuse', 'ORANGE MINES BLOW WHEN YOU\'RE NEAR: BURN PAST THEM');
      break;
    }
    if (this.sweepers.some((s) => s.x - this.dist < 380 && s.x > this.dist)) this.teach('sweep', 'A GIRDER: GO THROUGH THE HALF IT ISN\'T IN');
    this.chainT -= dt;
    if (this.chainT <= 0 && this.chain) {
      if (this.chain >= 3) audio.play('mini_thread_lost', { vol: 0.5 });
      this.chain = 0;
    }

    // burning is fast but stiff
    if (pad.hold && !this.burn) audio.play('mini_thread_burn', { vol: 0.7 });
    this.burn = pad.hold;
    this.vy += (pad.y * (this.burn ? 620 : 1050) - this.vy * 7) * dt;
    this.y += this.vy * dt;
    if (this.y < 6 || this.y > this.fieldH - 6) {
      this.y = clamp(this.y, 6, this.fieldH - 6);
      this.vy = 0;
    }
    this.v = damp(this.v, (this.burn ? this.burnV : this.cruise) * (this.slow > 0 ? 0.5 : 1), 6, dt);
    this.dist += this.v * dt;
    this.juice.scroll(-this.v * dt);
    // hurt, she trails smoke: more with every hit
    if (this.hits && this.fx.rand() < this.hits * 0.18) this.juice.smoke(this.sx - 10, this.y + this.top, 1, '#3a3042', { size: 2, life: 0.7, vx: -30 });

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
            audio.play('mini_thread_magnet', { vol: 0.8 });
            this.tugCd = 0.4;
          }
        }
      }
      const my = this.mineY(m);
      const dy = my - this.y;
      if (m.kind === 'fuse' && m.fuse < 0 && dx > -20 && Math.hypot(dx, dy) < this.armR) this.arm(m, this.fuseT);
      if (this.hurt <= 0 && Math.abs(dx) < 8 && Math.abs(dy) < 6) {
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
      audio.play('mini_thread_lost', { pitch: 0.75 });
      this.fx.word('OUT OF TIME', 240, this.fieldH / 2, '#ff8a3a', 2, { pop: true, life: 1.6 });
    }
    this.sonar(dt);
    audio.loop('engine', 'thread', this.result === null, this.burn ? 0.9 : 0.4);
  }

  /**
   * The field's voice: the nearest mine ahead pings, faster and louder as it comes (low for
   * magnets, high for fuses); armed fuses tick faster as they run down; girders whoom as they
   * swing past upright.
   */
  private sonar(dt: number) {
    if (this.result !== null) return;
    this.pingT -= dt;
    this.tickT -= dt;
    let best: Mine | null = null;
    let bd = 170;
    let fuse = 9;
    for (const m of this.mines) {
      if (m.dead) continue;
      const dx = m.x - this.dist;
      if (m.fuse >= 0) fuse = Math.min(fuse, m.fuse);
      if (dx < 12 || dx > bd || Math.abs(this.mineY(m) - this.y) > 50) continue;
      bd = dx;
      best = m;
    }
    if (best && this.pingT <= 0) {
      const f = bd / 170;
      this.pingT = 0.07 + 0.45 * f;
      audio.play('mini_thread_ping', { pitch: best.kind === 'magnet' ? 0.75 : best.kind === 'fuse' ? 1.33 : 1, vol: 0.35 + 0.5 * (1 - f), pan: 0.3 });
    }
    if (fuse < 9 && this.tickT <= 0) {
      const f = Math.min(1, fuse / this.fuseT);
      this.tickT = 0.04 + 0.08 * f;
      audio.play('mini_thread_tick', { pitch: 1 + (1 - f) * 0.4 });
    }
    for (const s of this.sweepers) {
      const dx = s.x - this.dist;
      const side = Math.sign(Math.cos(s.a0 + s.rate * this.time));
      if (s.side && side !== s.side && dx > -s.len && dx < 420) audio.play('mini_thread_sweep', { vol: Math.max(0.25, 1 - Math.max(0, dx) / 420), pan: Math.min(0.8, Math.max(-0.5, dx / 300)) });
      s.side = side;
    }
  }

  private skim(base: number, dy: number, word: string) {
    const before = this.mult;
    this.skims++;
    this.chain++;
    this.chainT = 1.4;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.points += base * this.mult;
    const step = penta(Math.min(this.chain - 1, 7));
    const pan = -0.4;
    if (word === 'SHAVED IT!') audio.play('mini_thread_shave', { pitch: step, pan });
    else if (word === 'DODGED!') audio.play('mini_thread_dodged', { pitch: step, pan });
    else audio.play(base > 1 ? 'mini_thread_close' : 'mini_thread_skim', { pitch: step, pan: dy > 0 ? 0.2 : -0.2 });
    const sx = this.sx;
    const yy = this.y + this.top + (dy > 0 ? 5 : -5);
    this.juice.streaks(sx, yy, 6 + base * 3, 170, ['#8affe0', '#ffffff'], { dir: Math.PI, spread: 1.1, life: 0.35 });
    this.fx.word(word, sx + 14, this.y + this.top - 16, base > 1 ? '#ffffff' : '#8affe0', 1, { pop: base > 1, life: 0.6 });
    if (this.mult > before) {
      this.fx.word(`×${this.mult}`, sx, this.y + this.top - 30, '#ffd04a', 2, { pop: true, life: 1 });
      this.fx.ring(sx, this.y + this.top, 26 + this.mult * 6, '#ffd04a', 0.35);
      audio.play('mini_thread_mult', { pitch: penta((this.mult - 1) * 2) });
    }
  }

  /** A fuse mine arms: it'll blow in `time`. */
  private arm(m: Mine, time: number) {
    m.fuse = time;
    if (this.armCd <= 0) {
      audio.play('mini_thread_arm', { vol: 0.7 });
      this.armCd = 0.15;
    }
  }

  private blow(m: Mine) {
    m.dead = true;
    const y = this.mineY(m);
    this.blasts.push({ x: m.x, y, r: this.blastR, t: 0 });
    const [px, py] = this.scr(m.x, y);
    this.fx.burst(px, py, 10, 120, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.5 });
    this.juice.streaks(px, py, 16, 240, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.4 });
    this.juice.smoke(px, py, 6, '#4a3a4e', { size: 5, life: 1.1 });
    this.juice.scrap(px, py, 4, 130);
    this.fx.ring(px, py, this.blastR, '#ff8a3a', 0.3);
    this.fx.shake(3, 0.2);
    if (this.boomCd <= 0) {
      audio.play('mini_thread_blast', { vol: 0.8 });
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
    if (this.chain >= 3) this.fx.word('CHAIN LOST', this.sx + 24, this.y + this.top + 22, '#ff8a7a');
    this.chain = 0;
    this.chainT = 0;
    const [x, y] = [this.sx, this.y + this.top];
    this.fx.burst(x, y, 16, 150, ['#ffffff', '#ffd04a', '#ff8a3a', '#ff5a4a'], { life: 0.7 });
    this.juice.streaks(x, y, 18, 260, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.45 });
    this.juice.scrap(x, y, 5, 150, { dir: dir < 0 ? -Math.PI / 2 : Math.PI / 2, spread: 2.4 });
    this.juice.smoke(x, y, 5, '#3a3042', { size: 4 });
    this.fx.ring(x, y, 34, '#ff5a4a', 0.3);
    this.fx.shake(6, 0.35);
    this.fx.flash('#ff5a4a', 0.15);
    this.fx.stop(0.09);
    audio.play('mini_thread_hit');
    if (this.hits >= this.lives) {
      this.wrecked = true;
      this.result = this.score();
      this.fx.stop(0.18);
      this.fx.burst(x, y, 30, 200, ['#ffffff', '#ffd04a', '#ff8a3a', '#5a5466'], { life: 1 });
      this.juice.scrap(x, y, 9, 200);
      this.juice.smoke(x, y, 12, '#3a3042', { size: 6, life: 1.4, speed: 40 });
      this.boom(this.dist, this.y, 30);
      this.fx.ring(x, y, 80, '#ff8a3a', 0.6);
      this.fx.word('WRECKED', 240, this.fieldH / 2, '#ff5a4a', 2, { pop: true, life: 1.6 });
      audio.play('mini_thread_wreck');
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
    audio.play('mini_thread_clear', { pitch: clean ? 1.2 : 1 });
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    // the intro: before the first update (the countdown) the Kestrel slides in from the left
    if (this.t0 < 0) this.t0 = t;
    const intro = this.time > 0 || this.result !== null ? 1 : clamp((t - this.t0) / 1.5, 0, 1);
    const ease = 1 - (1 - intro) ** 3;
    nebula(ctx, w, h, this.seed, [40, 20, 70], [70, 40, 30], this.dist * 0.15);
    stars(ctx, w, h, this.seed, this.dist * 0.6, this.burn ? 6 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const sx = this.sx;
    const oyF = this.top;
    this.layer(ctx, w, this.far, 0.08, t, 0.55);
    this.layer(ctx, w, this.mid, 0.3, t, 0.25);
    // the way out at the far end: two buoys and the line between them
    const ex = Math.round(this.goal - this.dist + sx + 20);
    if (ex < w + 30) {
      for (let y = oyF + 10; y < oyF + this.fieldH - 10; y += 4) {
        ctx.fillStyle = Math.floor(y / 4 - t * 10) % 3 ? 'rgba(138,255,176,0.18)' : 'rgba(138,255,176,0.55)';
        ctx.fillRect(ex, y, 1, 2);
      }
      glow(ctx, ex + 1, oyF + this.fieldH / 2, 70, '#8affb0', 0.18 + Math.sin(t * 4) * 0.05);
      for (const by of [oyF + 6, oyF + this.fieldH - 4])
        drawSprite(ctx, 'thread', 'buoy', ex, by, { clip: 'blink', t, fallback: () => ((ctx.fillStyle = '#8affb0'), ctx.fillRect(ex - 1, by - 1, 3, 3)) });
      drawText(ctx, 'CLEAR', ex + 8, oyF + this.fieldH / 2 - 3, '#8affb0');
    }
    for (const s of this.sweepers) {
      const [x, y] = this.scr(s.x, s.y);
      if (x < -s.len - 10 || x > w + s.len + 10) continue;
      this.girder(ctx, Math.round(x), Math.round(y), s, t);
    }
    this.juice.draw(ctx, 'back');
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
      glow(ctx, x, y, b.r * 1.8 * (1 - f), '#ff8a3a', 1 - f * 1.4);
      drawSprite(ctx, 'thread', 'boom', x, y, {
        clip: 'go',
        t: b.t,
        fallback: () => {
          ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.7 - f * 3)})`;
          ctx.beginPath();
          ctx.arc(x, y, b.r * Math.min(1, f * 5), 0, Math.PI * 2);
          ctx.fill();
        },
      });
      // the first instant: a hard white disc the size of the blast
      if (b.t < 0.06) {
        ctx.fillStyle = '#fff4d8';
        ctx.beginPath();
        ctx.arc(x, y, b.r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    fx.drawSparks(ctx);
    this.ship(ctx, sx - Math.round((1 - ease) * 90), this.y + oyF, t);
    this.juice.draw(ctx, 'front');
    // the chain, riding with you: its multiplier and how long it has left
    if (this.chain && this.result === null) {
      // it rides under the ship, clear of the words that pop up above her
      const cx = sx - 4;
      const cy = Math.round(this.y + oyF) + 18;
      const col = this.mult >= 3 ? '#ffd04a' : '#8affe0';
      const label = this.mult > 1 ? `×${this.mult}` : `${this.chain}`;
      const bw = label.length * 6 + 6;
      ctx.fillStyle = 'rgba(10,7,16,0.75)';
      ctx.fillRect(cx - Math.round(bw / 2), cy - 8, bw, 14);
      drawText(ctx, label, cx, cy - 6, col, { align: 'center' });
      ctx.fillStyle = col;
      ctx.fillRect(cx - Math.round(bw / 2), cy + 4, Math.round(bw * Math.max(0, this.chainT / 1.4)), 2);
      if (this.mult > 1) glow(ctx, cx, cy - 2, 14, col, 0.25);
    }
    // dark rocks rushing past close to the camera, along the top and bottom edges
    this.layer(ctx, w, this.near, 1.6, t);
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.45);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    this.prompt(ctx, w, t);
    this.hud(ctx, w, h, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The Kestrel: her attitude follows the stick, her flames the burn; struck, she flashes white. */
  private ship(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const sx = x + this.exitX;
    if (this.wrecked) {
      // the wreck tumbles away, burning
      const k = this.wreckT;
      if (k > 1.2) return;
      drawFlashed(ctx, 'thread', 'kestrel_down', sx - k * 40, y + k * k * 60, { clip: 'fly', t }, '#1a0e16', 0.55);
      return;
    }
    if (this.hurt > 0 && this.hurt < 0.85 && Math.floor(t * 16) % 2) return;
    const tilt = this.vy < -45 ? 'kestrel_up' : this.vy > 45 ? 'kestrel_down' : 'kestrel';
    const burn = this.burn || this.done || (this.time === 0 && this.result === null);
    if (burn) glow(ctx, sx - 22, y + 1, 14, '#ffd04a', 0.35 + Math.sin(t * 40) * 0.1);
    drawFlashed(ctx, 'thread', tilt, sx, y, { clip: burn ? 'burn' : 'fly', t }, '#ffffff', this.hurt > 0.85 ? 1 : 0) ||
      sideShip(ctx, sx, y, this.burn ? 1 : 0.45, '#c86a3a', t);
  }

  /** A parallax layer of the field: things drifting by at `k` of the ship's speed, wrapping round. */
  private layer(ctx: CanvasRenderingContext2D, w: number, items: Deco[], k: number, t: number, haze = 0) {
    const span = w + 160;
    for (const d of items) {
      const x = ((((d.x - this.dist * k) % span) + span) % span) - 80;
      // far things sink into the nebula's colour, so they never read as the mines you fly through
      drawFlashed(ctx, 'thread', d.name, x, d.y, { clip: d.clip, t: t * d.rate + d.phase, alpha: d.alpha }, '#2a1a40', haze);
    }
  }

  /** Progress (with where you'd coast to), hearts, style and the burn, on bevelled panels. */
  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const by = h - 15;
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(0, by - 4, w, 19);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, by - 4, w, 1);
    // progress: the track, a ship riding it, the coast marker and the flag at the end
    const pw = 196;
    panel(ctx, 4, by - 2, pw + 18, 12, '#8affb0');
    const f = Math.min(1, this.dist / this.goal);
    meter(ctx, 10, by + 2, pw, 3, f, '#8affb0');
    const coast = Math.min(1, (this.dist + (this.limit - this.time) * this.cruise) / this.goal);
    const short = coast < 1 && this.result === null;
    ctx.fillStyle = short ? (Math.floor(t * 4) % 2 ? '#ff8a7a' : '#ff5a4a') : '#5a7a6a';
    ctx.fillRect(10 + Math.round(pw * coast), by, 1, 7);
    const shipX = 10 + Math.round(pw * f);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(shipX - 3, by + 1, 4, 3);
    ctx.fillRect(shipX + 1, by + 2, 2, 1);
    ctx.fillStyle = this.burn ? '#ffd04a' : '#ff8a3a';
    ctx.fillRect(shipX - 5, by + 2, 2, 1);
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (k + j) % 2 ? '#f4ecd8' : '#2a2236';
        ctx.fillRect(pw + 12 + j * 2, by + k * 2, 2, 2);
      }
    // hearts
    const hx = pw + 30;
    panel(ctx, hx, by - 2, this.lives * 9 + 6, 12, '#ff5a4a');
    for (let k = 0; k < this.lives; k++) {
      const live = k < this.lives - this.hits;
      const lost = k === this.lives - this.hits && this.hurt > 0.6;
      drawText(ctx, '♥', hx + 5 + k * 9, by - (lost ? 2 : 0), lost ? '#ffffff' : live ? '#ff5a4a' : '#3a2e48');
    }
    // style, ticking up as you earn it
    const stx = hx + this.lives * 9 + 14;
    panel(ctx, stx, by - 2, 128, 12, this.style >= 1 ? '#ffd04a' : '#8affe0');
    drawText(ctx, 'STYLE', stx + 5, by, '#8affe0');
    meter(ctx, stx + 38, by + 2, 60, 3, this.shownStyle, this.style >= 1 ? '#ffd04a' : '#8affe0');
    drawText(ctx, `${Math.round(this.shownStyle * 100)}%`, stx + 124, by, this.style >= 1 ? '#ffd04a' : '#f4ecd8', { align: 'right' });
    // the burn
    const bx = w - 46;
    const on = this.burn && this.result === null;
    panel(ctx, bx, by - 2, 42, 12, on ? '#ffd04a' : short ? '#ff5a4a' : '#5a4e68');
    if (on) {
      drawText(ctx, 'BURN', bx + 24, by, Math.floor(t * 8) % 2 ? '#ffd04a' : '#ff8a3a', { align: 'center' });
      glow(ctx, bx + 21, by + 3, 16, '#ffd04a', 0.25);
    } else if (short) drawText(ctx, 'BURN!', bx + 24, by, Math.floor(t * 3) % 2 ? '#ff8a7a' : '#5a2a2a', { align: 'center' });
    else drawText(ctx, 'BURN', bx + 24, by, '#5a4e68', { align: 'center' });
  }

  /** The current prompt, on a dark band under the timer: it blinks in, then fades. */
  private prompt(ctx: CanvasRenderingContext2D, w: number, t: number) {
    const tp = this.tip;
    if (tp.t <= 0 || this.result !== null) return;
    if (tp.t > 2.15 && Math.floor(t * 16) % 2) return;
    const tw = tp.text.length * 6 + 12;
    ctx.globalAlpha = Math.min(1, tp.t * 3);
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 6, tw, 12);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 6, 2, 12);
    drawText(ctx, tp.text, w / 2, 8, '#f4ecd8', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  /** A spiked mine (each kind its own model): its eye blinks faster and it glows as you come near. */
  private drawMine(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, m: Mine, near: number) {
    const close = Math.max(0, 1 - near / 50);
    const armed = m.fuse >= 0;
    const lampC = m.kind === 'magnet' ? '#6ab0ff' : m.kind === 'fuse' ? '#ffb03a' : '#ff3a4a';
    if (close > 0) glow(ctx, x, y, 14 + close * 10, lampC, close * 0.5);
    if (m.kind === 'bob') {
      // the chain it swings on, its links running up out of sight
      const v = Math.cos(this.time * m.rate + m.phase);
      const len = 16 + Math.round(v * 8);
      for (let k = 0; k < len; k += 3) {
        ctx.fillStyle = `rgba(154,148,168,${0.6 * (1 - k / len)})`;
        ctx.fillRect(x - (k % 6 ? 0 : 1), y - 9 - k, k % 6 ? 1 : 3, 2);
      }
    }
    const tugging = m.kind === 'magnet' && m.tug && Math.abs(m.pull) < this.pullMax && m.x - this.dist > 28;
    if (tugging) {
      // field lines reaching for you
      const [, shipY] = this.scr(0, this.y);
      ctx.fillStyle = '#6ab0ff';
      const n = 6;
      for (let k = 1; k < n; k++) {
        if ((k + Math.floor(t * 12)) % 2) continue;
        ctx.fillRect(Math.round(x + (this.sx - x) * (k / n) * 0.5), Math.round(y + (shipY - y) * (k / n)), 2, 1);
      }
      glow(ctx, x, y, 18, '#6ab0ff', 0.4);
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
      glow(ctx, x, y, 22, '#ff8a3a', 0.6 + (1 - f) * 0.3);
    }
    const rate = armed ? 24 : 2 + close * 14;
    const on = Math.floor(t * rate + m.phase) % 2 === 0;
    const jit = armed ? Math.round(Math.sin(t * 90) * (1 - Math.max(0, m.fuse / this.fuseT))) : 0;
    const drawn = armed
      ? drawSprite(ctx, 'thread', 'fuse', x + jit, y, { clip: 'arm', frame: Math.min(4, Math.floor((1 - Math.max(0, m.fuse) / this.fuseT) * 5)) })
      : tugging
        ? drawSprite(ctx, 'thread', 'magnet', x, y, { clip: 'reach', t })
        : drawSprite(ctx, 'thread', m.kind, x, y, { clip: 'blink', frame: on ? 0 : 1 });
    if (!drawn) this.oldMine(ctx, x, y, m, on, armed, lampC);
    if (on) glow(ctx, x + 0.5, y + 1.5, armed ? 12 : 7, lampC, 0.55);
    // a skimmed mine keeps a faint tick of the colour you earned on it
    if (m.skimmed) {
      ctx.fillStyle = 'rgba(138,255,224,0.7)';
      ctx.fillRect(x - 1, y - 11, 3, 1);
    }
  }

  /** The mine in plain shapes, while the sprites load. */
  private oldMine(ctx: CanvasRenderingContext2D, x: number, y: number, m: Mine, on: boolean, armed: boolean, lampC: string) {
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 5, 11, 11);
    ctx.fillRect(x - 1, y - 8, 3, 17);
    ctx.fillRect(x - 8, y - 1, 17, 3);
    ctx.fillStyle = m.kind === 'magnet' ? '#8aa0c8' : '#9a9aaa';
    ctx.fillRect(x, y - 7, 1, 15);
    ctx.fillRect(x - 7, y, 15, 1);
    ctx.fillStyle = m.kind === 'magnet' ? '#3a4a6a' : m.kind === 'fuse' ? '#5a3a2a' : '#5a5466';
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = on ? (armed ? '#ffffff' : lampC) : '#3a1a24';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  /** A sweeping girder: a broken truss turning on its lit pivot, the circle it reaches drawn faint. */
  private girder(ctx: CanvasRenderingContext2D, x: number, y: number, s: Sweeper, t: number) {
    const a = s.a0 + s.rate * this.time;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,138,90,0.18)';
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = -t * 8 * Math.sign(s.rate);
    ctx.beginPath();
    ctx.arc(x, y, s.len, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // a faint wake behind the arm, so its way of turning reads
    for (let k = 1; k <= 3; k++) {
      const b = a - Math.sign(s.rate) * k * 0.12;
      ctx.globalAlpha = 0.22 / k;
      ctx.fillStyle = '#8a7a8a';
      for (let d = 8; d < s.len; d += 3) ctx.fillRect(Math.round(x + Math.cos(b) * d), Math.round(y + Math.sin(b) * d), 2, 2);
    }
    ctx.globalAlpha = 1;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const name = `girder_${Math.round(s.len) >= 57 ? 58 : 56}`;
    if (!drawSprite(ctx, 'thread', name, x, y, { angle: a })) {
      for (let d = 4; d < s.len; d += 1) {
        ctx.fillStyle = d % 8 < 1 ? '#ffd04a' : '#7a6a72';
        ctx.fillRect(Math.round(x + c * d) - 1, Math.round(y + sn * d) - 1, 2, 2);
      }
    }
    // the tip's warning light and the pivot's
    glow(ctx, x + c * s.len, y + sn * s.len, 12, '#ff5a3a', Math.floor(t * 6) % 2 ? 0.6 : 0.3);
    glow(ctx, x, y, 10, '#ff5a3a', Math.floor(t * 3) % 2 ? 0.5 : 0.2);
  }
}
