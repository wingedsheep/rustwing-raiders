import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { rng, shuffle, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, type Minigame, type Pad } from './common';
import { artImage } from '../art';
import './reels-sound';
import { drawSprite, preloadSprites } from './sprites';

/** The symbols on Spoke's reels: cog (the jackpot), star, skull, bolt, moon, and rust, which pays nothing. */
const SYMBOLS = ['COG', 'STAR', 'SKULL', 'BOLT', 'MOON', 'RUST'] as const;
type Sym = (typeof SYMBOLS)[number];
const PAYING: Sym[] = ['COG', 'STAR', 'SKULL', 'BOLT', 'MOON'];
const COLOUR: Record<Sym, string> = { COG: '#ffd04a', STAR: '#3ac8b0', SKULL: '#8a8098', BOLT: '#3a9ae8', MOON: '#a070e0', RUST: '#b0703a' };
const SHADE: Record<Sym, string> = { COG: '#b07a1a', STAR: '#1a7a6a', SKULL: '#4a4458', BOLT: '#1a5a9a', MOON: '#5a3a9a', RUST: '#7a4a22' };
const ICON: Record<Sym, string[]> = {
  COG: ['..#.#..', '.#####.', '##...##', '.#.#.#.', '##...##', '.#####.', '..#.#..'],
  STAR: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '##...##'],
  SKULL: ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#####.', '.#.#.#.'],
  BOLT: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  MOON: ['..###..', '.##....', '##.....', '##.....', '##.....', '.##....', '..###..'],
  // a corroded blank plate: rivets (o), rust blooms (r), flakes lifting (f), holes through to the paper (.)
  RUST: ['o#####o', '##r##f#', '#rr#f.#', '##r###.', '#.##rr#', '#f##r##', 'o####.o'],
};

/** A reel left spinning this long stops itself, wherever it is. */
const FUSE = 5;
/** The middle of reel k, across the game. */
/** The cabinet's centre, and its window's (the payline runs through it). */
const CX = 300;
const WY = 84;
/** The reels: their width, the gap between them, a symbol's height, and the top of the window. */
const RW = 70;
const RGAP = 12;
const CELL = 38;
const TOP = WY - (CELL * 3) / 2;
const reelL = (k: number) => CX - (RW * 3 + RGAP * 2) / 2 + k * (RW + RGAP);
const reelX = (k: number) => reelL(k) + RW / 2;
/** Spoke stands here (his waist, under the counter), and his reaching paw ends up here. */
const SX = 74;
const SY = 242;
const PAW = { x: SX + 73, y: SY - 128 };
/** The counter's top edge, and the coin tray on the cabinet's foot. */
const COUNTER = 220;
const TRAY = { x: CX, y: 213 };
/** The cabinet's crown bulbs. */
const BULBS = 14;
const bulbX = (i: number) => CX - 112 + (i * 224) / (BULBS - 1);
/** Where reel k sits in the stereo field. */
const pan = (k: number) => (k - 1) * 0.5;
/** A line's worth as Spoke pays it. */
const payName = (v: number) => (v >= 1 ? '×10' : v >= 0.7 ? '×5' : v > 0 ? '×2' : 'NOTHING');
/** Where the payline runs, down the game. */
const LINE_Y = WY;
/** How long Spoke's hand takes to come down before it grips. */
const REACH_IN = 0.15;
/** Pulls for your stake. */
const PULLS = 3;
/** How long you have to choose between taking a line and pulling again. */
const CHOOSE = 4;

/**
 * A reel caught by the brake: a stiff spring pulls it on to the symbol that was nearest the line
 * when you pressed, so it runs past with the speed it had and gets yanked back. On the last reel,
 * with a match in reach, the spring goes slack and it rocks a long while before it settles.
 */
interface Brake {
  to: number;
  vel: number;
  stiff: number;
  damp: number;
  tease: boolean;
  /** Whether it has swung past its symbol yet (for the clunk). */
  past: boolean;
}

/** Spoke's tin hand, reaching in to nudge a reel that landed too well. */
interface Nudge {
  k: number;
  t: number;
  max: number;
  dir: number;
  /** Slapped away: it's retreating, for this long. */
  slapped: number;
}

/**
 * Spoke's reels: three of them, spinning; press the button to stop each in turn on the red line.
 * The brake grabs whatever's nearest the line when you press, lets it run past and yanks it back,
 * so what you saw is what you get, and the skill is all timing. Go for cogs, then match what
 * landed: the symbols you want glow as they come round. Cogs are greased and only catch dead on
 * the line (miss by a hair and the brake slips to the next symbol), and the strips are padded
 * with rust, which pays nothing. From TRICKY up the reels surge and sag (press in the sag), and
 * from VICIOUS they catch: a shudder, a stall, then a lurch. Spoke cheats: when a reel lands on a
 * cog or makes a match, his tin hand may reach in to nudge it a symbol off. Throw the stick to
 * slap it away before it moves the reel, but slap at nothing and you rock the cabinet and jolt
 * whatever's still spinning. Two alike pay, three pay more, three cogs pays most; if the first
 * two match, the last reel runs hot and rocks on its brake.
 *
 * Three pulls for your stake. After a pull that paid, take the line (the stick) or let it ride
 * (the button) and pull again, for better or worse: he pays the line you walk away with. Higher
 * levels: faster reels, more rust, a quicker, greedier hand.
 */
export class Reels implements Minigame {
  readonly title = "SPOKE'S REELS";
  readonly how = "STOP EACH REEL ON THE RED LINE: COGS, THEN MATCH. THREE PULLS: TAKE A WIN (STICK) OR LET IT RIDE. SLAP SPOKE'S HAND WITH THE STICK.";
  result: number | null = null;
  /** The line it ended on: shown off for a moment before it becomes the result. */
  private outcome: number | null = null;
  private outroT = 0;
  private readonly d: number;
  private strips: Sym[][] = [];
  private pos = [0, 0, 0];
  private speed: number[];
  private brakes: (Brake | null)[] = [null, null, null];
  private stopped = [false, false, false];
  /** A stopped reel being shoved a symbol (by Spoke), easing to its new place. */
  private shove: ({ from: number; to: number; t: number } | null)[] = [null, null, null];
  private at = 0;
  private wait = 0;
  private time = 0;
  /** Since this pull's lever came down. */
  private spinT = 0;
  private pull = 1;
  /** What the last pull's line is worth (0, 0.4, 0.7, 1), while you choose; null while it spins. */
  private line: number | null = null;
  private chooseT = 0;
  /** Lines you let ride, and what each was. */
  private rode: number[] = [];
  private since = 0;
  private hot = false;
  private beat = 0;
  private humT = 0;
  private lever = 1;
  private win: Sym | null = null;
  private paidAt = 0;
  // the reels' moods: a surge and sag, and from vicious up a catch (shudder, stall, lurch)
  private wob: { ph: number; rate: number }[] = [];
  private readonly wobble: number;
  private catchT = [0, 0, 0];
  /** Time into a catch: 0..0.5 shudder (the warning), 0.5..0.75 stall, 0.75..0.95 lurch. */
  private catching = [-1, -1, -1];
  private kick = [0, 0, 0];
  // Spoke's hand
  private nudge: Nudge | null = null;
  private tried = [false, false, false];
  private readonly greed: number;
  private readonly reach: number;
  private nudges = 0;
  private slaps = 0;
  private jolts = 0;
  private stickWas = false;
  private grin = 0;
  // onboarding: a prompt at the moment each thing first matters, once each
  private tip: { text: string; col: string; t: number; up: number } | null = null;
  private seen = new Set<string>();
  /** Up to this level a strip carries two cogs. */
  private cogs2 = 0;
  /** How far off the line (in symbols) a cog still catches; anything else catches within half. */
  private cogWin: number;
  private r: Rng;
  private fx = new Fx();
  // the look: the den behind, the coins on the counter, and what Spoke's doing (since when)
  private bg: HTMLCanvasElement | null = null;
  private coins: { x: number; y: number; vx: number; vy: number; floor: number; ph: number; spin: number; rest: boolean }[] = [];
  private clinks = 0;
  private mood = 'idle';
  private speech: { text: string; t: number; up: number } | null = null;
  private moodAt = 0;

  constructor(level: number, seed: number) {
    const r = rng(seed);
    this.r = r;
    const d = (this.d = hardness(level));
    for (let k = 0; k < 3; k++) {
      // two of each paying symbol; cogs two a strip when it's easy, one after; rust to pad it out
      const s: Sym[] = ['STAR', 'STAR', 'SKULL', 'SKULL', 'BOLT', 'BOLT', 'MOON', 'MOON', 'COG', 'RUST', 'RUST', 'RUST'];
      if (level <= this.cogs2) s[s.length - 1] = 'COG';
      for (let n = 4; n <= level; n++) s.push('RUST');
      this.strips.push(this.deal(r, s));
      this.pos[k] = r() * s.length;
      this.wob.push({ ph: r() * 6, rate: 2.2 + r() * 1.6 });
      this.catchT[k] = 1.5 + r() * 2;
    }
    const base = byLevel(d, 5.2, 10.3);
    this.cogWin = byLevel(d, 0.25, 0.32);
    this.speed = [base, base * 1.06, base * 1.12];
    this.wobble = level >= 2 ? byLevel(d, 0, 0.32) : 0;
    this.greed = byLevel(d, 0.3, 0.8);
    this.reach = byLevel(d, 1.0, 0.6);
    preloadSprites('reels');
  }

  /** Shuffles a strip so that no symbol sits next to its twin (round the loop too). */
  private deal(r: Rng, s: Sym[]) {
    for (let tries = 0; tries < 200; tries++) {
      const out = shuffle(r, s.slice());
      if (out.every((x, i) => x !== out[(i + 1) % out.length])) return out;
    }
    return shuffle(r, s.slice());
  }

  /** The symbol at position p on reel k. */
  private symAt(k: number, p: number): Sym {
    const s = this.strips[k];
    return s[((Math.round(p) % s.length) + s.length) % s.length];
  }

  /** The symbol on the payline of reel k. */
  private sym(k: number): Sym {
    return this.symAt(k, this.pos[k]);
  }

  /** Where reel k will end up: on its brake's symbol, if it's still rocking. */
  private final(k: number): Sym {
    const b = this.brakes[k];
    return !this.stopped[k] && b ? this.symAt(k, b.to) : this.sym(k);
  }

  /** How fast reel k turns right now: its surge and sag, the hot reel, the spin-up, a catch. */
  private rate(k: number) {
    const w = this.wob[k];
    let v = this.speed[k] * (k === 2 && this.hot ? 1.15 : 1);
    v *= 1 + this.wobble * Math.sin(this.time * w.rate + w.ph);
    v *= Math.min(1, Math.max(0, (this.spinT - k * 0.12) / 0.5));
    const c = this.catching[k];
    if (c >= 0.5 && c < 0.75) v *= 0.15;
    else if (c >= 0.75) v *= 1.8;
    return v;
  }

  status() {
    if (this.outcome !== null) return this.outcome >= 1 ? 'JACKPOT!' : this.outcome >= 0.7 ? 'THREE ALIKE!' : this.outcome > 0 ? 'A PAIR. A WIN!' : 'NOTHING. SPOKE GRINS.';
    if (this.line !== null) return this.line > 0 ? `TAKE ${payName(this.line)}, OR LET IT RIDE? (${PULLS - this.pull} LEFT)` : `NOTHING. PULL AGAIN? (${PULLS - this.pull} LEFT)`;
    if (this.nudge && !this.nudge.slapped) return 'HIS HAND! THROW THE STICK!';
    if (this.at >= 3) return 'AND THE REELS SAY...';
    const ws = this.wants();
    const want = ws.length > 2 ? 'ANYTHING BUT RUST' : ws.join(' OR ');
    return `REEL ${this.at + 1}: PRESS TO STOP${want ? `  WANT: ${want}` : ''}${this.hot ? '  ONE MORE!' : ''}`;
  }

  /** What the reel being stopped would like to land on, from where the others are ending up. */
  private wants(): Sym[] {
    if (this.at === 0) return ['COG'];
    const s = [0, 1, 2]
      .filter((k) => k < this.at)
      .map((k) => this.final(k))
      .filter((x) => x !== 'RUST');
    return s.length ? [...new Set(s)] : PAYING;
  }

  breakdown(): [string, string][] {
    const line = [this.sym(0), this.sym(1), this.sym(2)].map((s) => (s === 'RUST' ? '-' : s));
    const k = this.outcome === null ? 0 : this.outcome >= 1 ? 10 : this.outcome >= 0.7 ? 5 : this.outcome > 0 ? 2 : 0;
    const rows: [string, string][] = [['LINE', line.join(' ')]];
    rows.push([
      'PULLS',
      `${this.pull}/${PULLS}${
        this.rode.some((x) => x > 0)
          ? `  RODE ${this.rode
              .filter((x) => x > 0)
              .map(payName)
              .join(' ')}`
          : ''
      }`,
    ]);
    rows.push(['HIS HAND', this.nudges ? `SLAPPED ${this.slaps}/${this.nudges}` : 'KEPT TO ITSELF']);
    if (this.jolts) rows.push(['JOLTS', `${this.jolts}`]);
    rows.push(['PAYS', k ? `×${k}` : 'NOTHING']);
    return rows;
  }

  /** Shows a prompt the first time something matters; urgent ones cut in. */
  private hint(key: string, text: string, col = '#fff0a0', urgent = false) {
    if (this.seen.has(key) || this.outcome !== null) return;
    if (!urgent && ((this.tip && this.tip.up < 1.2) || this.at >= 3 || this.hot)) return;
    this.seen.add(key);
    this.tip = { text, col, t: 2.4, up: 0 };
  }

  update(dt: number, pad: Pad) {
    const fx = this.fx;
    if (fx.frozen(dt)) return;
    this.moveCoins(dt);
    if (this.speech) {
      this.speech.t -= dt;
      this.speech.up += dt;
      if (this.speech.t <= 0) this.speech = null;
    }
    this.lever = Math.max(0, this.lever - dt * 4);
    this.grin = Math.max(0, this.grin - dt);
    for (let k = 0; k < 3; k++) this.kick[k] = Math.max(0, this.kick[k] - dt * 6);
    if (this.tip) {
      this.tip.t -= dt;
      this.tip.up += dt;
      if (this.tip.t <= 0) this.tip = null;
    }
    if (this.time === 0) audio.play('mini_reels_lever', { vol: 0.9 });
    this.time += dt;
    this.spinT += dt;
    if (this.outcome !== null && this.result === null) {
      this.outroT -= dt;
      if (this.outroT <= 0) this.result = this.outcome;
    }
    if (this.outcome !== null || this.line !== null) {
      // the win keeps raining a while
      const age = this.time - this.paidAt;
      const v = this.outcome ?? this.line ?? 0;
      if (v >= 0.7 && age < 2.5 && fx.rand() < (v >= 1 ? 0.7 : 0.3) * (this.outcome === null ? 0.3 : 1)) this.coin();
      if (v >= 1 && age < 2 && Math.floor(age * 4) !== Math.floor((age - dt) * 4)) fx.ring(CX, LINE_Y, 120 + fx.rand() * 100, fx.rand() < 0.5 ? '#ffd04a' : '#ff9ad8', 0.5);
      if (this.line !== null && this.outcome === null) this.choose(dt, pad);
      return;
    }
    this.since += dt;
    // the prompts, each when it first matters
    if (this.spinT > 0.4) this.hint('start', 'STOP IT ON THE RED LINE. GO FOR A COG!');
    if (this.wobble > 0 && this.spinT > 1.8 && this.at < 2) this.hint('surge', 'THE REELS SURGE AND SAG: PRESS IN THE SAG');
    if (this.at === 0 && this.pull === 1 && this.spinT > 3.4) this.hint('greased', 'COGS ARE GREASED: THEY ONLY CATCH DEAD ON THE LINE');
    if (this.at < 3 && this.since > FUSE - 1.6) this.hint('fuse', 'TOO SLOW AND IT STOPS ITSELF!', '#ff8a3a');

    // stop the next reel, on the button or when its fuse burns down: before the reels move on,
    // so you get what you saw
    if (this.at < 3 && (pad.press || this.since > FUSE) && this.spinT > 0.25) this.brake(this.at, this.since > FUSE);
    for (let k = 0; k < 3; k++) this.turn(k, dt);
    this.hand(dt, pad);
    // the motor under it all, climbing with how fast the drums are going
    const spinning = [0, 1, 2].filter((k) => !this.stopped[k] && !this.brakes[k]);
    this.humT -= dt;
    if (spinning.length && this.humT <= 0) {
      this.humT = 0.22;
      const v = spinning.reduce((a, k) => a + this.rate(k), 0) / spinning.length;
      audio.play('mini_reels_hum', { pitch: 0.75 + v * 0.05, vol: 0.5 + spinning.length * 0.17 });
    }
    // the fuse ticking down its last second and a half
    if (this.at < 3 && this.since > FUSE - 1.5 && Math.floor(this.since * 4) !== Math.floor((this.since - dt) * 4)) audio.play('mini_reels_fuse', { vol: 0.7, pan: pan(this.at) });
    // the hot reel's heartbeat
    if (this.hot && !this.stopped[2]) {
      this.beat -= dt;
      if (this.beat <= 0) {
        this.beat = 0.62;
        audio.play('mini_reels_heart', { vol: 0.9, pan: pan(2) });
      }
    }
    if (this.stopped.every(Boolean) && !this.nudge && !this.shove.some(Boolean)) {
      this.wait += dt;
      if (this.wait > 0.45) this.pay();
    }
  }

  /** Moves reel k on: spinning, rocking on its brake, or being shoved by Spoke. */
  private turn(k: number, dt: number) {
    const fx = this.fx;
    const sv = this.shove[k];
    if (sv) {
      sv.t = Math.min(1, sv.t + dt / 0.16);
      const e = 1 + 2.2 * (sv.t - 1) ** 3 + 1.2 * (sv.t - 1) ** 2;
      this.pos[k] = sv.from + (sv.to - sv.from) * e;
      if (sv.t >= 1) {
        this.pos[k] = sv.to;
        this.shove[k] = null;
      }
      return;
    }
    if (this.stopped[k]) return;
    const b = this.brakes[k];
    if (b) {
      // the spring pulls it on to its symbol; a click each time a symbol crosses the line
      const p0 = this.pos[k];
      b.vel += (-b.stiff * (this.pos[k] - b.to) - b.damp * b.vel) * dt;
      this.pos[k] += b.vel * dt;
      if (Math.round(p0) !== Math.round(this.pos[k]))
        audio.play(b.tease ? 'mini_reels_creak' : 'mini_reels_tick', { pitch: b.tease ? 0.8 + Math.random() * 0.15 : 0.85, vol: b.tease ? 0.9 : 0.8, pan: pan(k) });
      if (!b.past && this.pos[k] > b.to) {
        b.past = true;
        fx.shake(b.tease ? 1 : 2, 0.1);
        audio.play('mini_reels_clunk', { pitch: [1, 1.12, 1.26][k], vol: b.tease ? 0.6 : 0.9, pan: pan(k) });
        for (const side of [-1, 1])
          for (let i = 0; i < 4; i++)
            fx.spark(reelX(k) + side * 50, LINE_Y + (fx.rand() - 0.5) * 30, side * (30 + fx.rand() * 60), -40 - fx.rand() * 60, 0.35, fx.rand() < 0.5 ? '#ffd04a' : '#ff8a3a', { grav: 300 });
      }
      if (Math.abs(this.pos[k] - b.to) < 0.01 && Math.abs(b.vel) < 0.3) {
        this.pos[k] = b.to;
        this.stopped[k] = true;
        fx.shake(2, 0.12);
        audio.play('mini_reels_settle', { pitch: [1, 1.12, 1.26][k], vol: 0.8, pan: pan(k) });
        this.landed(k);
      }
      return;
    }
    // spinning; from vicious up it catches now and then: a shudder, a stall, a lurch
    if (this.d >= 0.7) {
      if (this.catching[k] < 0) {
        this.catchT[k] -= dt;
        if (this.catchT[k] <= 0 && this.spinT > 1.2) {
          this.catching[k] = 0;
          this.catchT[k] = byLevel(this.d, 3.2, 1.8) + this.r() * 1.6;
          if (k === this.at) {
            audio.play('mini_reels_catch', { vol: 0.8, pan: pan(k) });
            this.hint('catch', "IT'S CATCHING: A STALL, THEN A LURCH!", '#ff8a3a');
          }
        }
      } else {
        this.catching[k] += dt;
        if (this.catching[k] < 0.5) this.kick[k] = Math.max(this.kick[k], 0.6);
        if (this.catching[k] >= 0.95) this.catching[k] = -1;
      }
    }
    const p0 = this.pos[k];
    this.pos[k] += dt * this.rate(k);
    // the pawl ticking off each symbol: loud on the live reel, faint on the others
    if (Math.floor(p0) !== Math.floor(this.pos[k])) audio.play('mini_reels_tick', { pitch: 1 + k * 0.06, vol: k === this.at ? 0.55 : 0.15, pan: pan(k) });
  }

  /** Press: the brake grabs reel k on the symbol nearest the line. */
  private brake(k: number, fused: boolean) {
    const v = this.rate(k);
    let to = Math.round(this.pos[k]);
    // cogs are greased: they only catch dead on the line, else the brake slips to the next one
    const off = this.pos[k] - to;
    const slipped = this.symAt(k, to) === 'COG' && Math.abs(off) > this.cogWin;
    if (slipped) {
      to += off > 0 ? 1 : -1;
      this.fx.word('SLIPPED!', reelX(k), 34, '#ff8a3a', 1, { pop: true });
      audio.play('mini_reels_slip', { pan: pan(k) });
      this.hint('greased', 'COGS ARE GREASED: THEY ONLY CATCH DEAD ON THE LINE', '#ff8a3a', true);
    }
    // the last reel, with a match landing or one symbol off: it rocks and makes them sweat
    let tease = false;
    if (k === 2) {
      const a = this.final(0);
      const b = this.final(1);
      const hits = (s: Sym) => s !== 'RUST' && (s === a || s === b);
      tease = hits(this.symAt(2, to)) || hits(this.symAt(2, to - 1)) || hits(this.symAt(2, to + 1));
    }
    const stiff = tease ? 160 : 650;
    this.brakes[k] = { to, vel: v, stiff, damp: 2 * (tease ? 0.2 : 0.45) * Math.sqrt(stiff), tease, past: this.pos[k] > to };
    this.catching[k] = -1;
    this.at++;
    this.since = 0;
    this.lever = 1;
    audio.play('mini_reels_brake', { pitch: fused ? 0.8 : 1, vol: 0.9, pan: pan(k) });
    if (fused) this.fx.word('TOO SLOW', reelX(k), 176, '#ff8a3a', 1, { pop: true });
  }

  /** A reel came to rest: cogs ping, a pair heats the last reel, and Spoke may reach for it. */
  private landed(k: number) {
    const fx = this.fx;
    const x = reelX(k);
    const s = this.sym(k);
    if (s === 'COG') {
      fx.ring(x, LINE_Y, 44, '#ffd04a', 0.3);
      fx.burst(x, LINE_Y, 14, 90, ['#ffd04a', '#fff0a0']);
      const cogs = [0, 1, 2].filter((j) => this.stopped[j] && this.sym(j) === 'COG').length;
      audio.play('mini_reels_cog', { pitch: Math.pow(2, [0, 0, 4, 7][cogs] / 12), vol: 0.8, pan: pan(k) });
    }
    const wasHot = this.hot;
    this.checkHot();
    if (k === 1 && this.hot && !wasHot) this.heat();
    else if (k === 0 && s !== 'RUST') this.hint('match', `NOW MATCH IT: ${s}S GLOW AS THEY COME ROUND`);
    else if (k === 1 && !this.hot && s !== 'RUST' && this.sym(0) !== 'RUST') this.hint('either', 'MATCH EITHER ONE FOR A PAIR');
    const b = this.brakes[k];
    if (k === 2 && b?.tease && s !== this.sym(0) && s !== this.sym(1)) {
      fx.word('SO CLOSE!', CX, 176, '#ff8a3a', 2, { pop: true, life: 1.2 });
      this.speak('AWW. SHAME.');
      audio.play('mini_reels_heh', { vol: 0.8 });
      this.grin = 1.2;
    }
    // Spoke's hand: cogs and matches tempt it
    const worthy = s === 'COG' || (s !== 'RUST' && [0, 1, 2].some((j) => j !== k && this.stopped[j] && this.sym(j) === s));
    if (worthy && !this.nudge && !this.tried[k] && this.r() < this.greed) {
      this.tried[k] = true;
      this.nudge = { k, t: this.reach + REACH_IN, max: this.reach + REACH_IN, dir: this.r() < 0.5 ? -1 : 1, slapped: 0 };
      this.nudges++;
      audio.play('mini_reels_hand', { vol: 0.9, pan: pan(k) });
      this.hint('hand', "SPOKE'S HAND! THROW THE STICK TO SLAP IT!", '#ff6a5a', true);
    }
  }

  /** The first two match: the last reel runs hot, and the stakes go up on the plate. */
  private heat() {
    const fx = this.fx;
    const cogs = this.sym(0) === 'COG';
    audio.play('mini_reels_hot', { pitch: cogs ? Math.pow(2, 2 / 12) : 1 });
    fx.ring(reelX(2), LINE_Y, 70, cogs ? '#ffd04a' : '#ff8a3a', 0.4);
    fx.word('ONE MORE!', reelX(2), 34, '#ff8a3a', 2, { pop: true, life: 1.2 });
    this.hint('hot', cogs ? 'TWO COGS! ×10 ON THE LINE' : `ONE MORE ${this.sym(0)} PAYS ×5`, '#ffd04a', true);
  }

  private checkHot() {
    this.hot = this.stopped[0] && this.stopped[1] && this.sym(0) === this.sym(1) && this.sym(0) !== 'RUST';
  }

  /** Spoke's hand, and the stick that slaps it, or rocks the cabinet if there's nothing to slap. */
  private hand(dt: number, pad: Pad) {
    const fx = this.fx;
    const stick = Math.max(Math.abs(pad.x), Math.abs(pad.y)) > 0.6;
    const thrown = stick && !this.stickWas;
    this.stickWas = stick;
    const n = this.nudge;
    if (n && n.slapped > 0) {
      n.slapped -= dt;
      if (n.slapped <= 0) this.nudge = null;
      return;
    }
    if (thrown) {
      const x = reelX(n ? n.k : Math.min(2, this.at));
      if (n) {
        // caught him
        n.slapped = 0.35;
        this.slaps++;
        fx.stop(0.1);
        fx.shake(3, 0.15);
        fx.ring(x, 40, 50, '#ffffff', 0.3);
        fx.burst(x, 40, 14, 120, ['#ffffff', '#c8c8d0', '#ffd04a']);
        fx.word('SLAPPED!', x, 52, '#8affb0', 2, { pop: true });
        this.speak('OW! MY TIN!');
        audio.play('mini_reels_slap', { pan: pan(n.k) });
        return;
      }
      // nothing to slap: the cabinet rocks, and whatever's spinning lurches
      const spin = [0, 1, 2].filter((k) => !this.stopped[k] && !this.brakes[k]);
      fx.shake(3, 0.15);
      audio.play('mini_reels_jolt', { vol: 0.9 });
      if (spin.length) {
        this.jolts++;
        for (const k of spin) {
          this.pos[k] += 0.4 + this.r() * 0.8;
          this.kick[k] = 1;
        }
        fx.word('JOLT!', x, 52, '#ff8a3a', 1, { pop: true });
        this.hint('jolt', 'NOTHING TO SLAP: YOU ROCKED THE CABINET', '#ff8a3a', true);
      }
    }
    if (n) {
      n.t -= dt;
      if (n.t <= 0) {
        // too slow: he nudges it
        const k = n.k;
        const from = this.pos[k];
        this.shove[k] = { from, to: from + n.dir, t: 0 };
        this.nudge = null;
        this.grin = 1.2;
        fx.shake(3, 0.2);
        fx.word('NUDGED!', reelX(k), 52, '#ff5a4a', 2, { pop: true });
        this.speak('OOPS. SLIPPED.');
        audio.play('mini_reels_nudge', { pan: pan(k) });
        audio.play('mini_reels_heh', { vol: 0.7 });
        // shove first, then see what's on the line
        this.pos[k] = from + n.dir;
        this.checkHot();
        this.pos[k] = from;
      }
    }
  }

  /** All three in: what the line is worth. A jackpot, or the last pull, ends it; else you choose. */
  private pay() {
    const fx = this.fx;
    const s = [this.sym(0), this.sym(1), this.sym(2)];
    const pays = (a: Sym, b: Sym) => a === b && a !== 'RUST';
    const same = pays(s[0], s[1]) && s[1] === s[2];
    const v = same && s[0] === 'COG' ? 1 : same ? 0.7 : pays(s[0], s[1]) || pays(s[1], s[2]) || pays(s[0], s[2]) ? 0.4 : 0;
    this.win = same ? s[0] : pays(s[0], s[1]) || pays(s[0], s[2]) ? s[0] : pays(s[1], s[2]) ? s[1] : null;
    this.paidAt = this.time;
    this.tip = null;
    this.line = v;
    this.chooseT = CHOOSE;
    if (v >= 1 || this.pull >= PULLS) {
      this.finish(v);
      return;
    }
    // a line to think about: a little show now, the big one if you take it
    if (v >= 0.7) {
      fx.stop(0.12);
      fx.shake(3, 0.3);
      fx.flash('#fff0c0', 0.2);
      fx.ring(CX, LINE_Y, 160, '#ffd04a', 0.45);
      fx.word('THREE ALIKE!', CX, 66, '#ffd04a', 3, { pop: true, life: 1.4 });
      audio.play('mini_reels_three', { vol: 0.8 });
    } else if (v > 0) {
      fx.stop(0.06);
      fx.ring(CX, LINE_Y, 110, '#ffd04a', 0.35);
      fx.word('A PAIR!', CX, 70, '#ffd04a', 2, { pop: true, life: 1.2 });
      audio.play('mini_reels_pair', { vol: 0.8 });
    } else {
      this.grin = 1.5;
      fx.shake(2, 0.2);
      fx.word('NOTHING.', CX, 70, '#8a8098', 2, { pop: true, life: 1.2 });
      this.speak('HEH. AGAIN?');
      audio.play('mini_reels_bust', { vol: 0.8 });
      audio.play('mini_reels_heh', { vol: 0.6 });
    }
  }

  /** Between pulls: the button lets it ride (another pull, for better or worse), the stick takes the line. */
  private choose(dt: number, pad: Pad) {
    const line = this.line!;
    const stick = Math.max(Math.abs(pad.x), Math.abs(pad.y)) > 0.6;
    const thrown = stick && !this.stickWas;
    this.stickWas = stick;
    this.chooseT -= dt;
    const settled = this.time - this.paidAt > 0.35;
    if (settled && pad.press) this.repull();
    else if (settled && thrown && line > 0) this.finish(line);
    else if (this.chooseT <= 0) this.finish(line);
  }

  /** Another pull: whatever was on the line is swept away, and the reels spin up again. */
  private repull() {
    const fx = this.fx;
    const line = this.line!;
    this.rode.push(line);
    if (line > 0) {
      fx.word(`LET ${payName(line)} RIDE!`, CX, 70, '#ff8a3a', 2, { pop: true, life: 1.2 });
      audio.play('mini_reels_ride', { vol: 0.9 });
      this.grin = 1;
    }
    this.pull++;
    if (this.pull === PULLS) fx.word('LAST PULL', CX, 176, '#ff6a5a', 2, { pop: true, life: 1.4 });
    this.line = null;
    this.win = null;
    this.at = 0;
    this.wait = 0;
    this.since = 0;
    this.spinT = 0;
    this.hot = false;
    this.lever = 1;
    this.brakes = [null, null, null];
    this.stopped = [false, false, false];
    this.tried = [false, false, false];
    this.catching = [-1, -1, -1];
    fx.shake(2, 0.15);
    audio.play('mini_reels_lever', { vol: 0.9 });
  }

  /** The game's over on this line: make a show of it. */
  private finish(v: number) {
    const fx = this.fx;
    this.outcome = v;
    // the event lets the game run on 0.9 s more before its card comes down
    this.outroT = v >= 1 ? 0.9 : v >= 0.7 ? 0.4 : v > 0 ? 0.1 : 0;
    this.line = null;
    this.paidAt = this.time;
    this.tip = null;
    if (v >= 1) {
      fx.stop(0.3);
      fx.shake(6, 0.8);
      fx.flash('#ffd04a', 0.45);
      fx.ring(CX, LINE_Y, 220, '#ffd04a', 0.6);
      fx.ring(CX, LINE_Y, 140, '#ffffff', 0.4);
      fx.ring(CX, LINE_Y, 300, '#ff8a3a', 0.9);
      fx.word('JACKPOT!', CX, 62, '#fff0a0', 4, { pop: true, life: 2.4 });
      this.speak('...THREE COGS.', 3);
      for (let k = 0; k < 90; k++) this.coin();
      audio.play('mini_reels_jackpot');
      audio.play('mini_reels_coins', { pitch: 1.5 });
    } else if (v >= 0.7) {
      fx.stop(0.15);
      fx.shake(4, 0.4);
      fx.flash('#fff0c0', 0.3);
      fx.ring(CX, LINE_Y, 180, '#ffd04a', 0.5);
      fx.word('×5!', CX, 62, '#ffd04a', 4, { pop: true, life: 1.8 });
      this.speak('AW, RUST IT.');
      for (let k = 0; k < 50; k++) this.coin();
      if (this.pull > 1 || this.rode.length) audio.play('mini_reels_take');
      audio.play('mini_reels_three');
      audio.play('mini_reels_coins', { pitch: 1 });
    } else if (v > 0) {
      fx.stop(0.06);
      fx.flash('#fff0c0', 0.15);
      fx.ring(CX, LINE_Y, 120, '#ffd04a', 0.35);
      fx.word('×2', CX, 66, '#ffd04a', 3, { pop: true, life: 1.4 });
      this.speak('SMALL CHANGE.');
      for (let k = 0; k < 18; k++) this.coin();
      audio.play('mini_reels_take');
      audio.play('mini_reels_coins', { pitch: 0.6 });
    } else {
      this.grin = 2;
      fx.shake(2, 0.2);
      fx.word('NOTHING!', CX, 70, '#8a8098', 2, { pop: true, life: 1.4 });
      this.speak('HEH HEH HEH.');
      audio.play('mini_reels_bust');
      audio.play('mini_reels_heh', { vol: 0.8 });
    }
  }

  /** Spoke says something, in a bubble by his head. */
  private speak(text: string, life = 1.6) {
    this.speech = { text, t: life, up: 0 };
  }

  /** A coin flung up out of the tray: it spins, bounces on the counter and stays where it lands. */
  private coin() {
    const fx = this.fx;
    if (this.coins.length > 220) this.coins.splice(0, 1);
    this.coins.push({
      x: TRAY.x + (fx.rand() - 0.5) * 50,
      y: TRAY.y - 2,
      vx: (fx.rand() - 0.5) * 340,
      vy: -150 - fx.rand() * 230,
      floor: COUNTER + 3 + fx.rand() * 15,
      ph: fx.rand(),
      spin: 0.6 + fx.rand() * 1.2,
      rest: false,
    });
  }

  /** The coins in flight: gravity, a bounce or two on the counter, then they lie there. */
  private moveCoins(dt: number) {
    for (const c of this.coins) {
      if (c.rest) continue;
      c.vy += 620 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.ph += dt * c.spin * 2.5;
      if (c.y >= c.floor && c.vy > 0) {
        c.y = c.floor;
        if (c.vy < 90) c.rest = true;
        else {
          c.vy *= -0.32;
          c.vx *= 0.55;
          if (this.clinks++ % 3 === 0) audio.play('mini_reels_tick', { pitch: 1.6 + this.fx.rand() * 0.6, vol: 0.35 });
        }
      }
    }
  }

  /** The den behind it all: the painted scene, out of focus and in shadow, cached once it loads. */
  private backdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const art = artImage('dice');
    if (art && !this.bg) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.filter = 'blur(2px) brightness(0.42) saturate(0.85)';
      // the left of the painting, where the den opens out behind Spoke
      const s = Math.max(w / art.naturalWidth, h / art.naturalHeight) * 1.15;
      g.drawImage(art, 0, 0, art.naturalWidth, art.naturalHeight, -60, -40, art.naturalWidth * s, art.naturalHeight * s);
      g.filter = 'none';
      const fade = g.createLinearGradient(0, 0, 0, h);
      fade.addColorStop(0, 'rgba(20,10,4,0.2)');
      fade.addColorStop(0.7, 'rgba(14,7,3,0.55)');
      fade.addColorStop(1, 'rgba(10,5,2,0.9)');
      g.fillStyle = fade;
      g.fillRect(0, 0, w, h);
      this.bg = c;
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    else {
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a1608');
      bg.addColorStop(1, '#0e0804');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** What Spoke is doing, from how it's going for him; one-shots play out before he moves on. */
  private spokeClip(): string {
    const res = this.outcome;
    if (res !== null) {
      const age = this.time - this.paidAt;
      if (res >= 1) return age < 0.9 ? 'shock' : 'count';
      if (res >= 0.7) return 'groan';
      if (res > 0) return age < 0.6 ? 'groan' : 'idle';
      return 'laugh';
    }
    const n = this.nudge;
    if (n) return n.slapped > 0 ? 'ouch' : 'reach';
    if (this.line !== null) return this.line > 0 ? 'lean' : 'laugh';
    if (this.grin > 0) return 'laugh';
    if (this.hot && !this.stopped[2]) return 'lean';
    return 'idle';
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    const res = this.outcome ?? this.line;
    const winning = res !== null && res > 0;
    const big = res !== null && res >= 1;
    this.backdrop(ctx, w, h);
    // the den's lanterns, swaying, and the light they throw
    for (const [x, y, k] of [
      [26, -4, 0],
      [128, -10, 1],
      [466, -6, 2],
    ]) {
      glow(ctx, x, y + 34, 70, '#ff9a3a', 0.22 + Math.sin(t * 3 + k) * 0.02);
      drawSprite(ctx, 'reels', 'lantern', x, y, { clip: 'sway', t: t + k * 0.7 });
    }
    // smoke from his cigar and the den, drifting up through the light
    for (let i = 0; i < 14; i++) {
      const u = (t * 0.05 + i * 0.137) % 1;
      const x = 40 + ((i * 97) % 420) + Math.sin(t * 0.4 + i) * 12;
      const y = 240 - u * 260;
      ctx.fillStyle = `rgba(255,210,160,${0.05 * Math.sin(u * Math.PI)})`;
      const r = 6 + u * 14;
      ctx.fillRect(Math.round(x - r), Math.round(y - r / 2), Math.round(r * 2), Math.round(r));
    }
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);

    // Spoke, behind his counter
    const clip = this.spokeClip();
    if (clip !== this.mood) {
      this.mood = clip;
      this.moodAt = t;
    }
    // he's lit from his cabinet: warmer the better it's going for you
    glow(ctx, SX + 40, SY - 100, 110, '#ffb04a', 0.12 + (winning ? 0.12 : 0) + (big ? Math.sin(t * 10) * 0.06 + 0.1 : 0));
    drawSprite(ctx, 'reels', 'spoke', SX, SY, { clip, t: t - this.moodAt });

    // the cabinet: flank pillars and the brass face
    const cab = this.kick.reduce((a, b) => Math.max(a, b), 0);
    const jig = cab > 0.3 ? Math.round((fx.rand() - 0.5) * 2 * cab) : 0;
    drawSprite(ctx, 'reels', 'pillar', CX - 140 + jig, WY);
    drawSprite(ctx, 'reels', 'pillar', CX + 140 + jig, WY, { flipX: true });
    drawSprite(ctx, 'reels', 'cabinet', CX + jig, WY);
    // bulbs round the crown: they sweep on as the game opens, chase, race when hot, go mad on a
    // jackpot and die on a loss
    for (let k = 0; k < BULBS; k++) {
      const x = bulbX(k) + jig;
      let on: boolean;
      let col = '#fff0a0';
      if (this.time < 0.6) on = k / BULBS < this.time / 0.5 && this.time > 0;
      else if (res === null) on = Math.floor(t * (this.hot ? 16 : 5) + k) % 3 === 0;
      else if (res >= 1) {
        on = Math.floor(t * 24 + k) % 2 === 0;
        col = ['#fff0a0', '#ff8a3a', '#8affe0', '#ff6ac8'][Math.floor(t * 8 + k) % 4];
      } else if (res >= 0.7) on = Math.floor(t * 16 + k) % 3 !== 0;
      else if (res > 0) on = Math.floor(t * 10) % 2 === 0;
      else on = Math.floor(t * 1.5) % 2 === 0 && k % 4 === 0;
      ctx.fillStyle = on ? col : '#5a3a14';
      ctx.fillRect(x - 2, WY - 70, 4, 4);
      if (on) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 1, WY - 70, 1, 1);
        glow(ctx, x, WY - 68, big ? 14 : 9, col === '#fff0a0' ? '#ffd04a' : col, 0.6);
      }
    }
    // the reels, in the window
    const want = res === null && this.at < 3 ? this.wants() : [];
    for (let k = 0; k < 3; k++) {
      const x = reelL(k) + jig;
      const kj = this.kick[k] > 0 ? Math.round((fx.rand() - 0.5) * 3 * this.kick[k]) : 0;
      this.reel(ctx, k, x + kj, TOP, RW, CELL, t, k === this.at ? want : []);
      // the hot reel burns at the edges
      if (k === 2 && this.hot && !this.stopped[2]) {
        ctx.strokeStyle = `rgba(255,${this.sym(0) === 'COG' ? 208 : 138},74,${0.5 + Math.sin(t * 15) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, TOP - 1, RW + 2, CELL * 3 + 2);
      }
      // a lamp on the ledge under each reel: gold once it's stopped, blinking on the live one, red when it catches
      const ly = WY + 67;
      const caught = this.catching[k] >= 0 && this.catching[k] < 0.5;
      const lc = this.stopped[k] ? '#ffd04a' : caught && Math.floor(t * 16) % 2 ? '#ff5a4a' : k === this.at && res === null && Math.floor(t * 4) % 2 ? '#8affe0' : null;
      ctx.fillStyle = lc ?? '#3a2410';
      ctx.fillRect(x + 4, ly, RW - 8, 3);
      if (lc) glow(ctx, x + RW / 2, ly + 1, 22, lc, 0.3);
      if (k === this.at && res === null) {
        // the auto-stop fuse
        const f = Math.max(0, 1 - this.since / FUSE);
        ctx.fillStyle = f < 0.3 ? '#ff5a4a' : '#c89a5a';
        ctx.fillRect(x + 4, ly + 4, Math.round((RW - 8) * f), 1);
      }
    }
    // glass over the window: a sheen across the top and down one side
    ctx.fillStyle = 'rgba(255,240,210,0.06)';
    ctx.fillRect(reelL(0) + jig, TOP, RW * 3 + RGAP * 2, 10);
    ctx.fillStyle = 'rgba(255,240,210,0.05)';
    for (let k = 0; k < 3; k++) ctx.fillRect(reelL(k) + 6 + jig, TOP, 6, CELL * 3);
    // the payline, with arrows at each end
    const live = res === null && this.at < 3;
    const py = WY;
    ctx.fillStyle = winning ? (Math.floor(t * 8) % 2 ? '#ffffff' : '#ffd04a') : live ? '#ff5a4a' : 'rgba(255,90,74,0.7)';
    ctx.fillRect(reelL(0) - 4 + jig, py, RW * 3 + RGAP * 2 + 8, 1);
    if (live) glow(ctx, reelX(this.at), py, 36, '#ff5a4a', 0.18);
    if (winning) glow(ctx, CX, py, 150, '#ffd04a', 0.2 + (big ? 0.15 * Math.sin(t * 10) + 0.15 : 0));

    // the plates under the window: the prompt (or the choice), and the paytable
    const slotY = WY + 81;
    if (this.line !== null && this.outcome === null) {
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(CX - 114, slotY + 16, Math.round(228 * Math.max(0, this.chooseT / CHOOSE)), 1);
      const blink = Math.floor(t * 4) % 2 === 0;
      if (this.line > 0) {
        drawText(ctx, 'PRESS: LET IT RIDE', CX - 110, slotY + 5, blink ? '#ff8a3a' : '#c86a3a');
        drawText(ctx, `STICK: TAKE ${payName(this.line)}`, CX + 110, slotY + 5, '#8affb0', { align: 'right' });
      } else drawText(ctx, `PRESS: PULL AGAIN (${PULLS - this.pull} LEFT)`, CX, slotY + 5, blink ? '#fff0a0' : '#c8a86a', { align: 'center' });
    } else if (this.outcome !== null) {
      const v = this.outcome;
      const k = Math.min(1, (this.time - this.paidAt) * 4);
      ctx.globalAlpha = k;
      drawText(ctx, v > 0 ? `HE PAYS ${payName(v)}` : 'HE PAYS NOTHING', CX, slotY + 5, v > 0 ? (Math.floor(t * 6) % 2 ? '#fff0a0' : '#ffd04a') : '#8a8098', { align: 'center' });
      ctx.globalAlpha = 1;
    } else if (this.tip) {
      const tp = this.tip;
      ctx.globalAlpha = Math.min(1, tp.t * 4, tp.up * 8);
      drawText(ctx, tp.text, CX, slotY + 5, tp.up < 0.3 && Math.floor(tp.up * 20) % 2 ? '#ffffff' : tp.col, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    const ty = WY + 109;
    const paid = res === null ? -1 : res >= 1 ? 2 : res >= 0.7 ? 1 : res > 0 ? 0 : -1;
    const chase = res === null && this.hot && !this.stopped[2] ? (this.sym(0) === 'COG' ? 2 : 1) : -1;
    ['2 ALIKE ×2', '3 ALIKE ×5', '3 COGS ×10'].forEach((l, k) => {
      const x = CX - 76 + k * 76;
      const on = paid === k || chase === k;
      const lit = on && Math.floor(t * 6) % 2 === 0;
      if (on) glow(ctx, x, ty + 3, 36, '#ffd04a', 0.35);
      drawText(ctx, l, x, ty, lit ? '#ffffff' : on ? '#fff0a0' : paid >= 0 ? '#7a5a32' : '#e8b860', { align: 'center', shadow: false });
    });
    if (winning) glow(ctx, TRAY.x, TRAY.y, 34, '#ffd04a', 0.4);

    // the lever on the right flank: it comes down with each pull and springs back up
    const lv = this.time === 0 ? 0 : this.lever;
    drawSprite(ctx, 'reels', 'lever', CX + 152 + jig, WY + 30, { clip: 'pull', frame: Math.round(lv * 6) });

    // Spoke's hand, over the reel it's after, on its telescoping tin arm
    if (this.nudge) this.drawHand(ctx, reelX(this.nudge.k) + jig, t);

    // the counter, in front of it all, with his takings stacked on it and the coins that land
    this.counter(ctx, w, h, t);
    this.bubble(ctx, t);
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    fx.drawFlash(ctx, w, h);
  }

  /** Spoke's speech bubble, popping up by his head with a tail to his mouth. */
  private bubble(ctx: CanvasRenderingContext2D, t: number) {
    const sp = this.speech;
    if (!sp) return;
    const pop = Math.min(1, sp.up * 8);
    const a = Math.min(1, sp.t * 5);
    const bw = sp.text.length * 6 + 10;
    const bx = Math.round(Math.min(SX + 12, 150 - bw));
    const by = Math.round(SY - 196 - (1 - pop) * 4 + Math.sin(t * 3) * 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = DARK;
    ctx.fillRect(bx - 1, by - 1, bw + 2, 15);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(bx, by, bw, 13);
    // the tail, down toward his grin
    ctx.fillStyle = DARK;
    ctx.fillRect(bx + 14, by + 13, 6, 2);
    ctx.fillRect(bx + 15, by + 15, 4, 2);
    ctx.fillRect(bx + 16, by + 17, 2, 2);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(bx + 15, by + 13, 4, 2);
    ctx.fillRect(bx + 16, by + 15, 2, 2);
    drawText(ctx, sp.text, bx + bw / 2, by + 3, '#3a2010', { align: 'center', shadow: false });
    ctx.globalAlpha = 1;
  }

  /** The bar: worn planks, a brass rail, Spoke's coin stacks, your three pulls as tokens, and the winnings. */
  private counter(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = DARK;
    ctx.fillRect(0, COUNTER - 1, w, h - COUNTER + 1);
    ctx.fillStyle = '#6a3e22';
    ctx.fillRect(0, COUNTER, w, 7);
    ctx.fillStyle = '#9a6038';
    ctx.fillRect(0, COUNTER, w, 1);
    ctx.fillStyle = '#4e2c18';
    for (const x of [0, 96, 211, 330, 404]) ctx.fillRect(x, COUNTER + 1, 1, 6);
    // the front, in shadow, with the brass rail
    ctx.fillStyle = '#3a2214';
    ctx.fillRect(0, COUNTER + 7, w, h - COUNTER - 7);
    ctx.fillStyle = '#2a180e';
    for (let x = 18; x < w; x += 44) ctx.fillRect(x, COUNTER + 8, 1, h);
    ctx.fillStyle = '#8a5e22';
    ctx.fillRect(0, COUNTER + 12, w, 3);
    ctx.fillStyle = '#f0c870';
    ctx.fillRect(0, COUNTER + 12, w, 1);
    // the tray's light on the wood
    glow(ctx, TRAY.x, COUNTER + 4, 80, '#ffb04a', 0.12);
    drawSprite(ctx, 'reels', 'stack', 26, COUNTER + 6);
    drawSprite(ctx, 'reels', 'stack_b', 112, COUNTER + 5);
    drawSprite(ctx, 'reels', 'stack_b', 172, COUNTER + 6, { flipX: true });
    // your pulls: three tokens; each pull feeds one into the machine
    drawText(ctx, 'PULLS', 414, COUNTER + 9, '#c8a060', { shadow: false });
    for (let k = 0; k < PULLS; k++) {
      const x = 454 + k * 9;
      const used = k < this.pull;
      const now = k === this.pull - 1 && this.outcome === null;
      if (used && !now) {
        ctx.fillStyle = '#3a2214';
        ctx.fillRect(x - 3, COUNTER + 11, 7, 2);
        continue;
      }
      drawSprite(ctx, 'reels', 'coin', x, COUNTER + 11, { clip: 'spin', frame: now ? Math.floor(t * 12) % 8 : 0 });
    }
    // the coins: spinning in the air, lying flat once they've landed
    for (const c of this.coins) {
      if (c.rest) {
        ctx.fillStyle = '#8a5e22';
        ctx.fillRect(Math.round(c.x) - 3, Math.round(c.y) + 1, 7, 2);
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(Math.round(c.x) - 3, Math.round(c.y), 7, 2);
        ctx.fillStyle = '#fff0a0';
        ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y), 2, 1);
      } else drawSprite(ctx, 'reels', 'coin', c.x, c.y - 5, { clip: 'spin', t: c.ph });
    }
  }

  /**
   * Spoke's tin hand: his arm goes up out of his shoulder, telescopes over the crown and drops
   * its fist onto the drum; slapped, it snatches back the way it came.
   */
  private drawHand(ctx: CanvasRenderingContext2D, x: number, t: number) {
    const n = this.nudge!;
    const reach = n.slapped > 0 ? n.slapped / 0.35 : Math.min(1, (n.max - n.t) / REACH_IN);
    const hx = Math.round(x + (n.slapped > 0 ? 0 : Math.sin(t * 40) * 1.5));
    const hy = Math.round(TOP - 34 + reach * 44);
    // the arm: a curve from his paw, up over the cabinet's crown, and down to the wrist
    const pts: [number, number][] = [];
    const c1 = { x: PAW.x + 10, y: -30 };
    const c2 = { x: hx, y: -40 };
    const end = { x: hx, y: hy - 16 };
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const a = (1 - u) ** 3;
      const b = 3 * (1 - u) ** 2 * u;
      const c = 3 * (1 - u) * u * u;
      const d = u ** 3;
      pts.push([a * PAW.x + b * c1.x + c * c2.x + d * end.x, a * PAW.y + b * c1.y + c * c2.y + d * end.y]);
    }
    const line = (wd: number, col: string, dx = 0) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = wd;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py) : ctx.moveTo(px + dx, py)));
      ctx.stroke();
    };
    line(8, DARK);
    line(6, '#7a7888');
    line(2, '#b8b8c8', -1);
    // brass collars where the arm telescopes
    for (let i = 3; i < pts.length - 1; i += 4) {
      const [px, py] = pts[i];
      ctx.fillStyle = DARK;
      ctx.fillRect(Math.round(px) - 5, Math.round(py) - 3, 10, 6);
      ctx.fillStyle = '#c8963a';
      ctx.fillRect(Math.round(px) - 4, Math.round(py) - 2, 8, 4);
      ctx.fillStyle = '#f0c870';
      ctx.fillRect(Math.round(px) - 4, Math.round(py) - 2, 8, 1);
    }
    const slapped = n.slapped > 0;
    drawSprite(ctx, 'reels', 'hand', hx, hy, slapped ? { clip: 'slapped', t: 0.35 - n.slapped } : { clip: 'grab', t });
    if (slapped) {
      // the slap lands: a flash of white on the tin
      if (n.slapped > 0.25) glow(ctx, hx, hy, 24, '#ffffff', 0.6);
      return;
    }
    // the warning, and how long before he shoves
    const f = Math.min(1, n.t / this.reach);
    glow(ctx, hx, hy + 4, 26, '#ff5a4a', 0.35 + Math.sin(t * 30) * 0.15);
    if (Math.floor(t * 12) % 2) drawText(ctx, 'SLAP!', hx, hy + 26, '#ffffff', { align: 'center' });
    ctx.fillStyle = DARK;
    ctx.fillRect(hx - 15, hy + 36, 31, 3);
    ctx.fillStyle = f < 0.35 ? '#ff5a4a' : '#ffd04a';
    ctx.fillRect(hx - 14, hy + 37, Math.round(29 * f), 1);
  }

  /** One drum: a paper strip with the symbols, curved by shading, blurred when it spins fast. */
  private reel(ctx: CanvasRenderingContext2D, k: number, x: number, top: number, rw: number, cell: number, t: number, want: Sym[]) {
    const hh = cell * 3;
    const strip = this.strips[k];
    const L = strip.length;
    ctx.fillStyle = '#f0e2c0';
    ctx.fillRect(x, top, rw, hh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, rw, hh);
    ctx.clip();
    const b = this.brakes[k];
    const v = this.stopped[k] ? 0 : b ? Math.abs(b.vel) : this.rate(k);
    const blur = v / 4;
    const frac = this.pos[k] - Math.floor(this.pos[k]);
    const res = this.outcome ?? this.line;
    // symbols run downwards: a later position is the next one in from the top
    for (let j = -2; j <= 2; j++) {
      const sym = strip[(((Math.floor(this.pos[k]) - j) % L) + L) % L];
      const y = Math.round(top + cell * 1.5 + (j + frac) * cell);
      // the ones this reel wants glow as they come round
      if (want.length <= 2 && want.includes(sym)) {
        ctx.fillStyle = sym === 'COG' ? 'rgba(255,208,74,0.35)' : 'rgba(255,240,160,0.4)';
        ctx.fillRect(x + 6, y - cell / 2 + 3, rw - 12, cell - 6);
        glow(ctx, x + rw / 2, y, 30, COLOUR[sym], 0.35);
      }
      if (blur > 0.4) {
        ctx.globalAlpha = 0.25;
        this.icon(ctx, sym, x + rw / 2, y - Math.round(blur * 5), 4);
        this.icon(ctx, sym, x + rw / 2, y + Math.round(blur * 5), 4);
        ctx.globalAlpha = 1;
      }
      const win = res !== null && res > 0 && j === 0 && sym === this.win && Math.floor(t * 6) % 2 === 0;
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
    if (res !== null && res > 0 && this.win && this.sym(k) === this.win) glow(ctx, x + rw / 2, top + hh / 2, 50, COLOUR[this.win], 0.25);
  }

  private icon(ctx: CanvasRenderingContext2D, s: Sym, x: number, y: number, px: number) {
    const rows = ICON[s];
    const x0 = Math.round(x - (7 * px) / 2);
    const y0 = Math.round(y - (7 * px) / 2);
    const a = ctx.globalAlpha;
    if (s === 'RUST') {
      this.plate(ctx, rows, x0, y0, px);
      return;
    }
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
    ctx.globalAlpha = a;
  }

  /** The rust symbol: a blank tin plate eaten through, flaking at the edges, two rivets left. */
  private plate(ctx: CanvasRenderingContext2D, rows: string[], x0: number, y0: number, px: number) {
    const a = ctx.globalAlpha;
    const PLATE: Record<string, string> = { '#': '#7a4a2a', r: '#c8703a', f: '#e0b080', o: '#4a2a18' };
    ctx.fillStyle = '#2a1a0a';
    ctx.globalAlpha = a * 0.4;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (rows[r][c] !== '.') ctx.fillRect(x0 + c * px + 2, y0 + r * px + 2, px, px);
    ctx.globalAlpha = a;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        const ch = rows[r][c];
        if (ch === '.') continue;
        ctx.fillStyle = PLATE[ch];
        ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
        if (ch === 'o') {
          // a rivet head, catching the light
          ctx.fillStyle = '#b08a5a';
          ctx.fillRect(x0 + c * px + 1, y0 + r * px + 1, 1, 1);
        } else if (ch === 'f') {
          // a flake curling up: lit edge, dark under
          ctx.fillStyle = '#5a3018';
          ctx.fillRect(x0 + c * px, y0 + r * px + px - 1, px, 1);
        } else if (ch === 'r') {
          ctx.fillStyle = '#e8904a';
          ctx.fillRect(x0 + c * px + 1, y0 + r * px + 1, 1, 1);
        } else {
          ctx.fillStyle = '#5a3420';
          ctx.fillRect(x0 + c * px, y0 + r * px + px - 1, px, 1);
        }
      }
    // pits along the plate's top edge
    ctx.fillStyle = '#a06038';
    ctx.fillRect(x0 + px, y0, px * 5, 1);
  }
}
