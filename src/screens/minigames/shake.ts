import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, TAU, type Rng } from '../../util';
import './shake-sound';
import { byLevel, Fx, glow, hardness, nebula, stars, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';
import { drawSprite, type SpriteOpts } from './sprites';

type Kind = 'small' | 'big' | 'skitter' | 'brood';

interface Leech {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The clamp point on the hull it's making for, or holding. */
  port: number;
  on: boolean;
  /** How hard it holds: grows while it's on. */
  grip: number;
  hp: number;
  /** A skitter in flight sidesteps the first zap it sees coming. */
  dodge: number;
  /** Flung off and tumbling away. */
  gone: number;
  flap: number;
  hurt: number;
  /** Seconds since it clamped on (it plays its bite, then drinks). */
  onT: number;
  /** Zapped (it fries) rather than flung (it tumbles). */
  fried: boolean;
  /** Where it faces, as drawn. */
  face: number;
  /** Let go of its own accord (full, or the run's over) and flapping off. */
  fled?: boolean;
  /** The frame of white when a zap strikes it. */
  struck?: number;
  /** A skitter scuttling to another clamp point: it goes back on without a fresh bite. */
  hop?: boolean;
  /** A brood's time to her next egg. */
  lay?: number;
}

/** A brood's egg on a clamp point: it hatches into a leech already on, unless a roll throws it. */
interface Egg {
  port: number;
  t: number;
}

/** A shaped particle of our own: goo that stretches as it flies, embers, smoke that swells. */
interface Bit {
  kind: 'goo' | 'ember' | 'smoke';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  c: string;
  s: number;
}

interface Wave {
  /** When it arrives, from where, and what's in it. */
  t: number;
  a: number;
  kinds: Kind[];
  told: boolean;
  sent: boolean;
}

/** The game's length, and when the swarm comes for the last third. */
const LIMIT = 26;
const SWARM = 17.5;
/** Grip stages: under LOOSE any roll throws it off; under HELD it takes a hard roll; past that, a zap. */
const LOOSE = 0.7;
const HELD = 1.7;
/** A chain this long is a hard roll. */
const HARD = 3;
/** What a leech takes as it bites on: the only way to save it is to zap it before it lands. */
const BITE = 0.004;
/** The zap's capacitor, in cells: a zap takes one. Only rolling fills it (the dynamo). */
const CELLS = 3;
/** What a throw puts in it: a lone throw, one chained in time, one in a hard roll. */
const SPIN = [0.2, 0.34, 0.48] as const;
/** What a kill in the air sparks back into the cells: a chain into a bunched wave pays for itself. */
const AIR_SPARK = 0.4;
/** A kill arcs on to the next one this close, as many times as this. */
const JUMP = 38;
const JUMPS = 2;
/** A fried bloater bursts: anything on the hull this close to it is blown off. */
const BURST = 46;
/** A brood lays every LAY seconds; an egg hatches after HATCH. */
const LAY = 2.1;
const HATCH = 2.6;
/** How long a hard roll's barrel roll takes, as drawn. */
const FLIP = 0.42;
/** The notes a chain of flings climbs, in semitones (a pentatonic run). */
const FLING_STEPS = [0, 2, 4, 7, 9, 12, 14];

/**
 * Where leeches clamp on, as offsets from the middle of the ship (wing ones fold with the roll):
 * one leech to a point, so they never pile into a heap.
 */
const PORTS: [number, number, boolean][] = [
  [-20, -31, true],
  [2, -24, true],
  [-20, 31, true],
  [2, 24, true],
  [-30, -10, false],
  [-8, -11, false],
  [14, -9, false],
  [36, -5, false],
  [-30, 10, false],
  [-8, 11, false],
  [14, 9, false],
  [36, 5, false],
];

/**
 * Shake them off: your ship from above, hull leeches flapping in from the dark in waves to clamp
 * on to its fuel lines, building to a swarm in the last third. Eyes glow at the edge of the dark
 * just before a wave comes. Each one that's on drinks, and holds harder the longer it's there: its
 * ring goes yellow (any roll throws it), orange (only a hard roll, three throws chained in time),
 * then red (only a zap). Throw the stick from side to side to roll; the bar under the ship shows
 * when the next throw chains. Every throw strains the engine, and strain it too far and it stalls.
 *
 * The button arcs a zap into the leech the stick points at, whatever its grip, but the zap runs
 * off a dynamo the rolls spin: three cells, one a zap, and only throws fill them (chained ones
 * more). So a roll is also charge, and the stick can't point and throw at once. A kill arcs on to
 * the next one close by, twice: let a wave bunch up before you snipe it, if you dare.
 *
 * Bloaters (from tricky) take two zaps and drink hard, and a fried one bursts and blows its
 * neighbours off whatever their grip. Skitters (from vicious) dodge the first zap in flight, and
 * on the hull a light roll only sends them scuttling to another clamp point. A brood (from hard)
 * shrugs off rolls and lays eggs on the free points that hatch on, already biting, unless a roll
 * throws them. When time's up the eggs hatch, and every one still on takes a last gulp.
 */
export class Shake implements Minigame {
  readonly title = 'SHAKE THEM OFF';
  readonly how = 'THROW THE STICK LEFT-RIGHT TO ROLL; THREE IN TIME MAKE A HARD ROLL. ROLLING CHARGES THE ZAP: POINT AND PRESS. A KILL JUMPS TO ONE CLOSE BY.';
  result: number | null = null;
  private readonly d: number;
  private leeches: Leech[] = [];
  private eggs: Egg[] = [];
  private waves: Wave[] = [];
  private fuel = 1;
  private shownFuel = 1;
  private drain = 0;
  private time = 0;
  private readonly limit = LIMIT;
  private readonly gripRate: number;
  private readonly window: [number, number];
  private readonly zapCdMax: number;
  private readonly tell: number;
  /**
   * How much each one drinks. Out where it's deadly there are more of them, harder to shift, so
   * each drinks a little less, or the level would be about the count and not the play.
   */
  private readonly hunger: number;
  private roll = 0;
  private rollV = 0;
  private lastSide = 0;
  private lastThrow = -9;
  private combo = 0;
  private bestCombo = 0;
  private strain = 0;
  private stall = 0;
  private zapCd = 0;
  /** The dynamo's charge, in cells, and as the gauge shows it. */
  private charge: number;
  private shownCharge: number;
  private zapT = 0;
  private zapArcs: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private aim = -Math.PI / 2;
  private target: Leech | null = null;
  private fx = new Fx();
  private r: Rng;
  private readonly cx = 240;
  private readonly cy = 116;
  private flung = 0;
  private fried = 0;
  private sniped = 0;
  private zaps = 0;
  /** The most one zap took, jumps and a burst included. */
  private bestZap = 0;
  private smashed = 0;
  private hatched = 0;
  private biggest = 0;
  private total = 0;
  private swarmed = false;
  /** Time up: the last gulps, one leech at a time, before the score. */
  private gulpT = -1;
  private gulped = 0;
  private slurpT = 0;
  private drops: { x: number; y: number; vy: number }[] = [];
  /** The prompts already shown, each once, the first time it matters. */
  private taught = new Set<string>();
  private prompt = '';
  private promptT = 0;
  private promptC = '#f4ecd8';
  /** The barrel roll of a hard throw, as drawn: how far in, which way, from what roll. */
  private flipT = -1;
  private flipDir = 1;
  private flipFrom = 0;
  /** Time since the result: the ship boosts away. */
  private outT = 0;
  /** When drawing began (the countdown draws before the first update): the ship flies in. */
  private t0 = -1;
  private bits: Bit[] = [];
  /** Dice for looks only, so the play's dice stay the play's. */
  private vr: Rng;

  constructor(
    private level: number,
    seed: number,
  ) {
    this.r = rng(seed);
    this.vr = rng(seed ^ 0x5a5a);
    const d = (this.d = hardness(level));
    this.gripRate = byLevel(d, 1.8, 1.9);
    this.window = [byLevel(d, 0.14, 0.18), byLevel(d, 0.6, 0.42)];
    this.zapCdMax = 0.22;
    this.charge = this.shownCharge = 2;
    this.tell = byLevel(d, 1.4, 0.8);
    this.hunger = byLevel(d, 1.25, 0.72);
    this.plan();
  }

  /** The waves, laid out ahead: when, from which side of the dark, and what; the swarm comes from two sides. */
  private plan() {
    const d = this.d;
    let t = 1.2;
    let n = 0;
    let a = this.r() * TAU;
    while (t < this.limit - 2.6) {
      const swarm = t >= SWARM;
      const count = Math.max(1, Math.round(byLevel(d, 2.2, 2.4) + (this.r() - 0.4) * 1.2 + (swarm ? 1 : 0)));
      const kinds: Kind[] = [];
      for (let k = 0; k < count; k++) kinds.push(this.level >= 4 && t > 4 && this.r() < byLevel(d, -0.2, 0.25) ? 'skitter' : 'small');
      // big ones: one now and then from tricky, every other wave from vicious
      const every = this.level >= 3 ? 3 : 4;
      if (this.level >= 2 && n % every === every - 1) kinds.push('big');
      // a brood now and then from hard
      if (this.level >= 3 && n % (this.level >= 5 ? 3 : 4) === 1) kinds.push('brood');
      if (swarm && kinds.length > 2) {
        // the swarm splits and comes at you from across the hull too
        const half = kinds.splice(0, Math.floor(kinds.length / 2));
        this.waves.push({ t, a: a + Math.PI * (0.8 + this.r() * 0.4), kinds: half, told: false, sent: false });
      }
      this.waves.push({ t, a, kinds, told: false, sent: false });
      // the next one comes from somewhere else, often across the hull
      a += Math.PI * (0.55 + this.r() * 0.9);
      t += byLevel(d, 3.2, 2.8) * (0.85 + this.r() * 0.3) * (swarm ? 0.85 : 1);
      n++;
    }
    for (const w of this.waves) this.total += w.kinds.length;
  }

  private spawn(kind: Kind, a: number, back = 0) {
    const x = this.cx + Math.cos(a) * (270 + back);
    const y = this.cy + Math.sin(a) * (170 + back * 0.6);
    this.leeches.push({ kind, x, y, vx: 0, vy: 0, port: -1, on: false, grip: 0, hp: kind === 'big' ? 2 : 1, dodge: kind === 'skitter' ? 1 : 0, gone: 0, flap: this.r() * TAU, hurt: 0, onT: 0, fried: false, face: a + Math.PI, lay: kind === 'brood' ? LAY * 0.6 : undefined });
  }

  private get on() {
    return this.leeches.filter((l) => l.on && !l.gone);
  }

  /** The ship's roll as drawn, in radians: its bank, or the barrel roll of a hard throw. */
  private rollAngle() {
    if (this.flipT >= 0) return this.flipFrom + this.flipDir * TAU * Math.min(1, this.flipT / FLIP);
    return this.roll * 0.6;
  }

  /** Where a clamp point is right now, folding with the roll (in a barrel roll, round under the hull). */
  private portAt(i: number): [number, number] {
    const [px, py, wing] = PORTS[i];
    const sq = Math.cos(this.rollAngle());
    return [this.cx + px, this.cy + py * (wing || this.flipT >= 0 ? sq : 0.85 + 0.15 * sq)];
  }

  /** On the underside just now, mid barrel roll. */
  private under(l: Leech) {
    return l.on && !l.gone && this.flipT >= 0 && Math.cos(this.rollAngle()) < 0;
  }

  private bit(kind: Bit['kind'], x: number, y: number, vx: number, vy: number, life: number, c: string, s = 1) {
    if (this.bits.length < 240) this.bits.push({ kind, x, y, vx, vy, life, max: life, c, s });
  }

  /** A splash of bits flying out from a point. */
  private splash(kind: Bit['kind'], x: number, y: number, n: number, speed: number, colors: string[], s = 1, dir?: number) {
    for (let k = 0; k < n; k++) {
      const a = dir === undefined ? this.vr() * TAU : dir + (this.vr() - 0.5) * 1.4;
      const v = speed * (0.4 + this.vr() * 0.8);
      this.bit(kind, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + this.vr() * 0.4, colors[k % colors.length], s);
    }
  }

  /** Bloaters and broods are too heavy for the wing points. */
  private heavy(l: Leech) {
    return l.kind === 'big' || l.kind === 'brood';
  }

  /** The nearest clamp point nobody holds, is making for, or has laid an egg on. */
  private freePort(x: number, y: number, big: boolean) {
    const taken = new Set(this.leeches.filter((l) => !l.gone && l.port >= 0).map((l) => l.port));
    for (const e of this.eggs) taken.add(e.port);
    let best = -1;
    let bd = Infinity;
    PORTS.forEach((p, i) => {
      if (taken.has(i) || (big && p[2])) return;
      const [px, py] = this.portAt(i);
      const dd = Math.hypot(px - x, py - y);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  /** Grip as a stage: 0 loose, 1 held, 2 locked (bloaters and broods always are). */
  private stage(l: Leech) {
    if (this.heavy(l)) return 2;
    return l.grip < LOOSE ? 0 : l.grip < HELD ? 1 : 2;
  }

  status() {
    const on = this.on.length;
    if (this.stall > 0) return `ENGINE STALLED  ·  FUEL ${Math.round(this.fuel * 100)}%`;
    return `FUEL ${Math.round(this.fuel * 100)}%  ·  ${on ? `${on} ON YOUR HULL` : 'HULL CLEAR'}  ·  OFF ${this.flung + this.fried}/${this.total}`;
  }

  breakdown(): [string, string][] {
    const rows: [string, string][] = [
      ['FUEL KEPT', `${Math.round(this.fuel * 100)}%`],
      ['FLUNG / FRIED', `${this.flung} / ${this.fried}${this.sniped ? ` (${this.sniped} IN THE AIR)` : ''}`],
      ['ZAPS', `${this.zaps}${this.bestZap > 1 ? ` (${this.bestZap} WITH ONE)` : ''}`],
      ['BEST ROLL', this.bestCombo > 1 ? `×${this.bestCombo}${this.biggest > 1 ? `, ${this.biggest} AT ONCE` : ''}` : '-'],
    ];
    if (this.smashed || this.hatched) rows.push(['EGGS', `${this.smashed} SMASHED${this.hatched ? `, ${this.hatched} HATCHED` : ''}`]);
    return rows;
  }

  /** A prompt, once, the first time something matters. */
  private teach(key: string, text: string, color = '#f4ecd8') {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.prompt = text;
    this.promptT = 2.2;
    this.promptC = color;
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    this.zapT -= dt;
    this.promptT -= dt;
    this.shownFuel += (this.fuel - this.shownFuel) * Math.min(1, dt * 1.5);
    this.shownCharge += (this.charge - this.shownCharge) * Math.min(1, dt * 12);
    for (const p of this.drops) {
      p.vy += 300 * dt;
      p.y += p.vy * dt;
    }
    this.drops = this.drops.filter((p) => p.y < 246);
    for (const b of this.bits) {
      b.life -= dt;
      const drag = b.kind === 'smoke' ? 2 : 3;
      b.vx *= Math.exp(-drag * dt);
      b.vy = b.vy * Math.exp(-drag * dt) + (b.kind === 'goo' ? 60 : b.kind === 'smoke' ? -8 : 0) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    if (this.flipT >= 0 && (this.flipT += dt) >= FLIP) this.flipT = -1;
    if (this.result !== null) {
      this.outT += dt;
      for (const l of this.leeches) this.drift(l, dt);
      return;
    }
    if (this.gulpT >= 0) return this.gulps(dt);
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    if (this.time >= this.limit) {
      // what's left of the clutch hatches, for the last gulp
      for (const e of [...this.eggs]) this.hatch(e);
      this.gulpT = 0.5;
      this.fx.word('TIME', this.cx, 40, '#f4ecd8', 2, { pop: true });
      return;
    }
    this.send();
    this.steer(dt, pad);
    // the zap
    this.zapCd -= dt;
    this.target = this.pick();
    if (pad.press && this.ready) this.zap();
    else if (pad.press && this.zapCd <= 0) this.flat();
    this.drain = 0;
    for (const l of this.leeches) this.move(l, dt);
    for (const e of [...this.eggs]) if ((e.t += dt) >= HATCH) this.hatch(e);
    this.hum(dt);
    this.leeches = this.leeches.filter((l) => l.gone < 1.5);
    if (this.strain > 0.7 && this.stall <= 0) this.teach('strain', 'EASE OFF OR THE ENGINE STALLS', '#ff8a5a');
  }

  /** The sounds that run under the play: them drinking, and the engine groaning under strain. */
  private hum(dt: number) {
    this.slurpT -= dt;
    const n = this.on.length;
    if (n && this.slurpT <= 0) {
      this.slurpT = 0.42 + this.r() * 0.15;
      audio.play('mini_shake_slurp', { vol: Math.min(0.9, 0.35 + n * 0.1), pitch: 0.9 + this.r() * 0.25 });
    }
    if (this.strain > 0.55 && this.stall <= 0) audio.play('mini_shake_strain', { vol: 0.4 + this.strain * 0.5, pitch: 0.8 + this.strain * 0.6 });
  }

  /** The waves: eyes in the dark first, then the wave itself, a few at a time. */
  private send() {
    if (!this.swarmed && this.time >= SWARM - this.tell - 0.6) {
      this.swarmed = true;
      this.prompt = 'HERE COMES THE SWARM';
      this.promptT = 2;
      this.promptC = '#ff5a4a';
      this.fx.flash('#ff4a3a', 0.12);
      this.fx.shake(3, 0.4);
      audio.play('mini_shake_swarm', { vol: 0.9 });
    }
    for (const w of this.waves) {
      if (!w.told && this.time >= w.t - this.tell) {
        w.told = true;
        audio.play('mini_shake_tell', { vol: 0.8, pitch: w.kinds.includes('big') ? 0.8 : 1 });
      }
      if (!w.sent && this.time >= w.t) {
        w.sent = true;
        // strung out, so they land one after another
        w.kinds.forEach((k, i) => this.spawn(k, w.a + (i - (w.kinds.length - 1) / 2) * 0.22, (i % 2 ? i : w.kinds.length - i) * 18));
        audio.play('wingbeat', { vol: 0.35, pitch: 1.3 });
        if (w.kinds.includes('big')) this.teach('big', 'A BLOATER: ROLLS WON\'T SHIFT IT. ZAP IT TWICE', '#ffd04a');
        if (w.kinds.includes('skitter')) this.teach('skitter', 'SKITTERS DODGE A ZAP IN THE AIR', '#8affe0');
        if (w.kinds.includes('brood')) this.teach('brood', 'A BROOD: ROLL HER EGGS OFF, ZAP HER', '#c8ff8a');
      }
    }
  }

  /** Rolling: the stick throws the ship, and a throw to the other side is a roll. */
  private steer(dt: number, pad: Pad) {
    if (Math.abs(pad.x) > 0.2 || Math.abs(pad.y) > 0.2) this.aim = Math.atan2(pad.y, pad.x);
    const push = this.stall > 0 ? 0 : pad.x;
    this.rollV += (push * 9 - this.roll * 6) * dt * 6;
    this.rollV *= Math.exp(-dt * 4);
    this.roll += this.rollV * dt;
    // the strain eases off once you stop throwing
    if (this.time - this.lastThrow > 0.4) this.strain = Math.max(0, this.strain - dt * 0.5);
    if (this.stall > 0) {
      this.stall -= dt;
      if (this.vr() < dt * 24) this.bit('smoke', this.cx - 36, this.cy + (this.vr() < 0.5 ? -13 : 13) * Math.cos(this.rollAngle()), -30 - this.vr() * 30, (this.vr() - 0.5) * 20, 0.9, this.vr() < 0.5 ? '#4a4060' : '#6a6080', 3);
      if (this.stall <= 0) {
        this.strain = 0.35;
        this.fx.word('ENGINE BACK', this.cx, this.cy - 74, '#8affb0');
        audio.play('mini_shake_restart', { vol: 0.8 });
      }
      return;
    }
    // a combo dies if you leave it too long
    if (this.combo && this.time - this.lastThrow > this.window[1] * 1.6) this.combo = 0;
    const side = pad.x > 0.6 ? 1 : pad.x < -0.6 ? -1 : 0;
    if (side && side !== this.lastSide) {
      if (this.lastSide) this.throwRoll();
      this.lastSide = side;
    }
  }

  /** A roll: in time with the last one it chains; loose ones come off, and held ones too once it's hard. */
  private throwRoll() {
    const gap = this.time - this.lastThrow;
    const [lo, hi] = this.window;
    if (this.combo && gap >= lo && gap <= hi) this.combo++;
    else {
      if (this.combo > 1 && gap < lo) this.fx.word('TOO FAST', this.cx, this.cy + 86, '#ff8a5a');
      this.combo = 1;
    }
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastThrow = this.time;
    this.strain += byLevel(this.d, 0.17, 0.18);
    const c = this.combo;
    const hard = c >= HARD;
    if (hard) {
      // a barrel roll, the way the stick threw it, from wherever it's at
      const step = TAU / 16;
      this.flipFrom = Math.round(this.rollAngle() / step) * step;
      this.flipDir = this.lastSide > 0 ? -1 : 1;
      this.flipT = 0;
    }
    this.fx.shake(hard ? 5 : 2 + c);
    if (hard) audio.play('mini_shake_hard', { vol: 0.8, pitch: 1 + Math.min(4, c - HARD) * 0.06 });
    else audio.play('mini_shake_roll', { vol: 0.75, pitch: 0.85 + c * 0.12 });
    if (c === HARD) {
      this.fx.word('HARD ROLL', this.cx, this.cy - 74, '#ffd04a', 2, { pop: true, life: 0.6 });
      this.fx.ring(this.cx, this.cy, 70, '#ffd04a', 0.3);
    } else if (c > HARD) this.fx.word(`HARD ×${c}`, this.cx, this.cy - 74, '#ffd04a', 1, { pop: true, life: 0.4 });
    this.spin(hard ? SPIN[2] : c > 1 ? SPIN[1] : SPIN[0]);
    let n = 0;
    for (const l of this.leeches) {
      if (!l.on || l.gone) continue;
      const s = this.stage(l);
      if (l.kind === 'skitter' && s < 2 && !hard) this.scuttle(l);
      else if (s === 0 || (s === 1 && hard)) {
        this.fling(l, false, c);
        n++;
      } else l.hurt = 0.2;
    }
    // any roll throws the eggs
    for (const e of [...this.eggs]) this.smash(e);
    if (n >= 2) this.cluster(n);
    if (this.strain >= 1) {
      this.strain = 1;
      this.stall = byLevel(this.d, 1.2, 1.6);
      this.combo = 0;
      this.fx.stop(0.08);
      this.fx.shake(6, 0.4);
      this.fx.word('ENGINE STALL', this.cx, this.cy - 74, '#ff5a4a', 2, { pop: true, life: 1.2 });
      audio.play('mini_shake_stall', { vol: 0.9 });
    }
  }

  /** Several off in one roll: a pop for each extra one. */
  private cluster(n: number) {
    this.biggest = Math.max(this.biggest, n);
    this.fx.stop(Math.min(0.14, 0.04 + n * 0.02));
    this.fx.ring(this.cx, this.cy, 60 + n * 12, '#ffb04a', 0.4);
    this.fx.word(n === 2 ? 'DOUBLE' : n === 3 ? 'TRIPLE' : `${n} AT ONCE!`, this.cx, this.cy - 90, '#ffd04a', 2, { pop: true, life: 1 });
    audio.play('mini_shake_cluster', { pitch: n / 2, vol: 0.9 });
  }

  /** A cell charged and the arc cooled: the button zaps. */
  private get ready() {
    return this.zapCd <= 0 && this.charge >= 1;
  }

  /** The dynamo: every throw spins charge into the zap's cells, sparks running back along the hull. */
  private spin(amount: number) {
    const before = Math.floor(this.charge);
    this.charge = Math.min(CELLS, this.charge + amount);
    for (const side of [-1, 1]) this.fx.spark(this.cx - 34, this.cy + side * 12, 150, -side * 40, 0.25, '#b48aff', { glow: true });
    const cells = Math.floor(this.charge);
    if (cells > before) {
      this.fx.ring(this.cx + 4, this.cy, 16, '#b48aff', 0.25);
      audio.play('mini_shake_charge', { vol: 0.7, pitch: 1 + (cells - 1) * 0.25 });
      if (cells === CELLS) this.fx.word('CHARGED', this.cx + 4, this.cy - 40, '#d8c0ff', 1, { pop: true, life: 0.6 });
    }
  }

  /** The button with no cell in it: a flat click, and the first time, why. */
  private flat() {
    this.zapCd = this.zapCdMax;
    audio.play('dash_dry', { vol: 0.6 });
    this.fx.word('NO CHARGE', this.cx + 4, this.cy - 40, '#6a5e7a');
    this.teach('flat', 'NO CHARGE: ROLLING SPINS THE DYNAMO', '#d8c0ff');
  }

  /** A skitter only rattled: it lets go and scuttles to another clamp point, its grip loosened. */
  private scuttle(l: Leech) {
    const to = this.freePort(l.x, l.y, false);
    if (to < 0) {
      l.hurt = 0.2;
      return;
    }
    l.on = false;
    l.hop = true;
    l.port = to;
    l.grip *= 0.5;
    l.vx = l.vy = 0;
    this.fx.word('SCUTTLE', l.x, l.y - 12, '#8affe0');
    audio.play('mini_shake_dodge', { vol: 0.6, pitch: 0.8 });
    this.teach('scuttle', 'SKITTERS SCUTTLE: ONLY A HARD ROLL THROWS THEM', '#8affe0');
  }

  /** An egg thrown off by a roll: a pale splat. */
  private smash(e: Egg) {
    const [x, y] = this.portAt(e.port);
    this.eggs.splice(this.eggs.indexOf(e), 1);
    this.smashed++;
    this.splash('goo', x, y, 6, 90, ['#e8f0c0', '#a8c070', '#5a6a3a'], 1, Math.atan2(y - this.cy, x - this.cx));
    audio.play('mini_shake_egg', { vol: 0.7, pitch: 1.2 + this.vr() * 0.3 });
  }

  /** An egg hatching: a leech, already on and biting. */
  private hatch(e: Egg) {
    const [x, y] = this.portAt(e.port);
    this.eggs.splice(this.eggs.indexOf(e), 1);
    this.hatched++;
    this.total++;
    this.leeches.push({ kind: 'small', x, y, vx: 0, vy: 0, port: e.port, on: true, grip: 0, hp: 1, dodge: 0, gone: 0, flap: this.r() * TAU, hurt: 0.2, onT: 0, fried: false, face: 0 });
    this.fuel = Math.max(0, this.fuel - BITE * this.hunger);
    this.splash('goo', x, y, 6, 50, ['#e8f0c0', '#a8c070'], 1);
    this.fx.word('HATCHED', x, y - 12, '#c8ff8a');
    audio.play('mini_shake_clamp', { vol: 0.8, pitch: 1.4 });
  }

  /** The leech the zap would hit: the one nearest where the stick points, flying or clamped. */
  private pick(): Leech | null {
    let best: Leech | null = null;
    let bd = Infinity;
    for (const l of this.leeches) {
      if (l.gone) continue;
      const a = Math.atan2(l.y - this.cy, l.x - this.cx);
      const da = Math.abs(wrapAngle(a - this.aim));
      const dist = Math.hypot(l.x - this.cx, l.y - this.cy);
      // one still in the air has to be pointed at more truly
      if (dist > 200 || da > (l.on ? 0.8 : 0.5)) continue;
      // the red ones on the hull first (those are what zaps are for), then the rest, then fliers
      const score = da * 80 + dist * 0.3 + (l.on ? (this.stage(l) === 2 ? -25 : 0) : 20);
      if (score < bd) {
        bd = score;
        best = l;
      }
    }
    return best;
  }

  private zap() {
    this.zapCd = this.zapCdMax;
    this.zapT = 0.16;
    this.zapArcs = [];
    this.zaps++;
    this.charge -= 1;
    audio.play('mini_shake_zap', { vol: 0.8 });
    const l = this.target;
    if (!l) {
      this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: this.cx + Math.cos(this.aim) * 120, y1: this.cy + Math.sin(this.aim) * 120 });
      audio.play('mini_shake_miss', { vol: 0.8 });
      this.fx.word('MISS', this.cx + Math.cos(this.aim) * 70, this.cy + Math.sin(this.aim) * 70, '#6a5e7a');
      this.teach('miss', 'A MISS WASTES A CELL: AIM IT', '#d8c0ff');
      return;
    }
    // a skitter in the air sees it coming, once
    if (!l.on && l.dodge > 0) {
      l.dodge = 0;
      const side = this.r() < 0.5 ? -1 : 1;
      const a = Math.atan2(l.y - this.cy, l.x - this.cx) + (side * Math.PI) / 2;
      this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: l.x, y1: l.y });
      l.x += Math.cos(a) * 22;
      l.y += Math.sin(a) * 22;
      this.fx.word('DODGED', l.x, l.y - 12, '#8affe0');
      this.fx.burst(l.x, l.y, 6, 50, ['#8affe0']);
      audio.play('mini_shake_dodge', { vol: 0.8 });
      return;
    }
    this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: l.x, y1: l.y });
    const off = this.flung + this.fried;
    this.hit(l);
    // a kill jumps on to the nearest one a zap would finish, and on from that
    let from = l;
    for (let j = 1; j <= JUMPS && from.hp <= 0; j++) {
      let next: Leech | null = null;
      let nd = JUMP;
      for (const o of this.leeches) {
        if (o.gone || o.hp > 1 || (!o.on && o.dodge > 0)) continue;
        const dd = Math.hypot(o.x - from.x, o.y - from.y);
        if (dd < nd) {
          nd = dd;
          next = o;
        }
      }
      if (!next) break;
      this.zapArcs.push({ x0: from.x, y0: from.y, x1: next.x, y1: next.y });
      this.hit(next);
      this.fx.word(j === 1 ? 'CHAIN!' : `CHAIN ×${j + 1}`, next.x, next.y - 20, '#d8c0ff', 1, { pop: true });
      this.fx.stop(0.05 + j * 0.02);
      audio.play('mini_shake_zap', { vol: 0.6, pitch: 1 + j * 0.2 });
      from = next;
    }
    const took = this.flung + this.fried - off;
    this.bestZap = Math.max(this.bestZap, took);
    if (took >= 3) {
      this.fx.word(`${took} WITH ONE!`, this.cx, this.cy - 90, '#d8c0ff', 2, { pop: true, life: 1 });
      audio.play('mini_shake_cluster', { pitch: took / 2, vol: 0.8 });
    }
  }

  private hit(l: Leech) {
    l.hp--;
    l.hurt = 0.3;
    l.struck = 0.1;
    this.fx.burst(l.x, l.y, 10, 80, ['#b48aff', '#ffffff']);
    if (l.hp <= 0) this.fling(l, true);
    else {
      this.fx.word('ONE MORE', l.x, l.y - 18, '#b48aff');
      this.fx.shake(2);
      audio.play('mini_shake_sting', { vol: 0.8 });
    }
  }

  private fling(l: Leech, zapped: boolean, combo = 0) {
    const a = Math.atan2(l.y - this.cy, l.x - this.cx);
    const big = l.kind === 'big';
    const sp = 200 + combo * 30;
    l.vx = Math.cos(a) * sp;
    l.vy = Math.sin(a) * sp;
    const air = !l.on;
    l.on = false;
    l.port = -1;
    l.gone = 0.01;
    l.fried = zapped;
    if (zapped) this.fried++;
    else this.flung++;
    if (zapped) {
      this.splash('ember', l.x, l.y, big ? 18 : 10, 140, ['#e8d8ff', '#b48aff', '#ffffff']);
      this.splash('smoke', l.x, l.y, big ? 5 : 3, 20, ['#3a3048', '#5a4e6a'], 3);
    } else this.splash('goo', l.x, l.y, 8, 110, ['#ffb04a', '#e87a3a', '#7a3a22'], 2, a);
    if (zapped && air) {
      this.sniped++;
      this.charge = Math.min(CELLS, this.charge + AIR_SPARK);
    }
    if (zapped && big) this.burst(l);
    this.fx.burst(l.x, l.y, zapped ? (big ? 30 : 16) : 10, big ? 140 : 100, zapped ? ['#b48aff', '#ff8a5a', '#ffffff'] : ['#ff8a5a', '#7a3a22'], { grav: 0 });
    this.fx.word(zapped ? (air ? 'MID-AIR!' : big ? 'BLOATER FRIED' : l.kind === 'brood' ? 'BROOD FRIED' : 'FRIED') : 'FLUNG', l.x, l.y - 12, zapped ? (air ? '#8affe0' : '#b48aff') : '#ffb04a', 1, { pop: big || air });
    if (big || air) {
      this.fx.stop(big ? 0.1 : 0.04);
      this.fx.ring(l.x, l.y, big ? 40 : 24, air ? '#8affe0' : '#b48aff', 0.35);
    }
    if (big) this.fx.shake(5);
    if (zapped) audio.play('mini_shake_fry', { vol: 0.8, pitch: big ? 0.7 : 1 });
    // a flung one climbs the scale with the chain
    else audio.play('mini_shake_fling', { vol: 0.75, pitch: 2 ** (FLING_STEPS[Math.min(FLING_STEPS.length - 1, Math.max(0, combo - 1))] / 12) });
  }

  /** A fried bloater bursts: everything light near it, on the hull or in the air, is blown off, eggs too. */
  private burst(l: Leech) {
    this.splash('goo', l.x, l.y, 18, 160, ['#ff8a5a', '#ffb04a', '#a83c52', '#7a3a22'], 2);
    this.fx.ring(l.x, l.y, BURST, '#ff8a5a', 0.3);
    this.fx.flash('#ff8a5a', 0.08);
    this.fx.shake(6, 0.3);
    audio.play('mini_shake_burst', { vol: 0.9 });
    let n = 0;
    for (const o of this.leeches) {
      if (o === l || o.gone || this.heavy(o) || Math.hypot(o.x - l.x, o.y - l.y) > BURST) continue;
      this.fling(o, false, 2);
      n++;
    }
    for (const e of [...this.eggs]) {
      const [x, y] = this.portAt(e.port);
      if (Math.hypot(x - l.x, y - l.y) <= BURST) this.smash(e);
    }
    if (n) this.fx.word(n > 1 ? `BURST ×${n}` : 'BURST!', l.x, l.y - 26, '#ff8a5a', 1, { pop: true });
    this.teach('burst', 'A FRIED BLOATER BLOWS ITS NEIGHBOURS OFF', '#ff8a5a');
  }

  private drift(l: Leech, dt: number) {
    l.flap += dt * 10;
    if (l.gone) {
      l.gone += dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
    }
  }

  private move(l: Leech, dt: number) {
    // on the hull its pulse quickens as it digs in
    l.flap += dt * (l.on ? 6 * (1 + l.grip * 0.4) : 16);
    if (l.on) l.onT += dt;
    l.hurt = Math.max(0, l.hurt - dt);
    l.struck = Math.max(0, (l.struck ?? 0) - dt);
    if (l.gone) return this.drift(l, dt);
    if (!l.on) {
      // make for a free clamp point; with none free, circle and wait
      if (l.port < 0 && Math.hypot(l.x - this.cx, l.y - this.cy) < 150) l.port = this.freePort(l.x, l.y, this.heavy(l));
      const [tx, ty] = l.port >= 0 ? this.portAt(l.port) : [this.cx + Math.cos(l.flap * 0.1) * 90, this.cy + Math.sin(l.flap * 0.1) * 70];
      const dx = tx - l.x;
      const dy = ty - l.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = (this.heavy(l) ? 52 : l.kind === 'skitter' ? 84 : 66) * byLevel(this.d, 0.9, 1.15);
      const weave = (l.kind === 'skitter' ? 70 : 22) * Math.min(1, d / 40);
      l.vx += ((dx / d) * sp - l.vx) * dt * 2.5 + Math.sin(l.flap) * weave * dt;
      l.vy += ((dy / d) * sp - l.vy) * dt * 2.5 + Math.cos(l.flap * 0.7) * weave * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (dt > 0) l.face += wrapAngle(Math.atan2(l.vy, l.vx) - l.face) * Math.min(1, dt * 8);
      if (l.port >= 0 && d < 6 && l.hop) {
        // a skitter back on after a scuttle: no fresh bite, it never really let go
        l.on = true;
        l.hop = false;
        audio.play('mini_shake_clamp', { vol: 0.5, pitch: 1.5 });
        return;
      }
      if (l.port >= 0 && d < 6) {
        l.on = true;
        l.onT = 0;
        this.splash('goo', l.x, l.y, 5, 50, ['#ffb04a', '#7a3a22'], 1);
        // the bite going in costs a little, whatever you do next
        this.fuel = Math.max(0, this.fuel - BITE * this.hunger);
        audio.play('mini_shake_clamp', { vol: 0.85, pitch: this.heavy(l) ? 0.7 : l.kind === 'skitter' ? 1.3 : 1 });
        this.fx.burst(l.x, l.y, 6, 40, ['#ff8a5a', '#ffd04a']);
        if (!this.heavy(l)) this.teach('roll', 'ONE ON! THROW THE STICK LEFT-RIGHT', '#ffd04a');
      }
      return;
    }
    // clamped on: it rides the hull, grips harder, and drinks
    const s0 = this.stage(l);
    l.grip = Math.min(3, l.grip + dt * this.gripRate * (l.kind === 'skitter' ? 1.1 : 1) * (this.stall > 0 ? 1.5 : 1));
    const s1 = this.stage(l);
    if (s1 > s0 && dt > 0) {
      // it digs in deeper: a tick you can hear and see
      l.hurt = 0.12;
      audio.play('mini_shake_dig', { vol: 0.7, pitch: s1 === 2 ? 0.75 : 1 });
      if (s1 === 1) this.teach('held', 'ORANGE GRIP: CHAIN THREE ROLLS IN TIME', '#ff8a3a');
      else this.teach('locked', 'RED GRIP: ONLY A ZAP SHIFTS IT', '#ff5a4a');
    }
    [l.x, l.y] = this.portAt(l.port);
    // mouth to the hull's spine
    l.face = Math.atan2(this.cy - l.y, (this.cx - l.x) * 0.3);
    // a brood lays on the nearest free point
    if (l.kind === 'brood' && dt > 0 && (l.lay = (l.lay ?? LAY) - dt) <= 0) {
      l.lay = LAY;
      const at = this.freePort(l.x, l.y, false);
      if (at >= 0) {
        this.eggs.push({ port: at, t: 0 });
        const [ex, ey] = this.portAt(at);
        this.splash('goo', ex, ey, 4, 30, ['#e8f0c0', '#a8c070'], 1);
        l.hurt = 0.15;
        audio.play('mini_shake_egg', { vol: 0.6, pitch: 0.7 });
      }
    }
    const sip = (l.kind === 'big' ? 0.026 : 0.026 * (1 + l.grip * 0.25)) * this.hunger;
    this.fuel = Math.max(0, this.fuel - dt * sip);
    this.drain += sip;
    if (this.r() < dt * 3) this.fx.spark(l.x, l.y, (this.r() - 0.5) * 40, (this.r() - 0.5) * 40, 0.3, '#ffd04a', { glow: true });
    if (this.r() < dt * 2.5) this.drops.push({ x: this.gaugeX + Math.round(this.gaugeW * this.fuel) - 1 - Math.floor(this.r() * 3), y: 230, vy: 0 });
  }

  /** Time's up: every one still on takes one last gulp, and then it's over. */
  private gulps(dt: number) {
    this.drain = 0;
    for (const l of this.leeches) {
      if (l.gone || !l.on) this.drift(l, dt);
      else this.move(l, 0);
    }
    this.gulpT -= dt;
    if (this.gulpT > 0) return;
    const l = this.on[0];
    if (!l) {
      if (this.gulped === 0) {
        this.fx.word('HULL CLEAR', this.cx, 40, '#8affb0', 2, { pop: true, life: 1.2 });
        this.fx.ring(this.cx, this.cy, 90, '#8affb0', 0.5);
        audio.play('mini_shake_clear');
      }
      this.result = clamp((this.fuel - 0.35) / 0.6, 0, 1);
      // the rest peel away into the dark, and you're off
      for (const o of this.leeches) {
        if (o.gone) continue;
        const a = Math.atan2(o.y - this.cy, o.x - this.cx);
        o.gone = 0.01;
        o.fled = true;
        o.face = a;
        o.vx = Math.cos(a) * 90;
        o.vy = Math.sin(a) * 90;
      }
      audio.play('boost', { vol: 0.6 });
      return;
    }
    const gulp = this.heavy(l) ? 0.07 : 0.035;
    this.fuel = Math.max(0, this.fuel - gulp);
    this.fx.word(`-${Math.round(gulp * 100)}%`, l.x, l.y - 12, '#ff5a4a', 1, { pop: true });
    this.fx.burst(l.x, l.y, 10, 60, ['#ffd04a', '#ff8a3a']);
    this.fx.shake(3);
    audio.play('mini_shake_gulp', { vol: 0.9, pitch: this.heavy(l) ? 0.75 : 1 });
    // full, it lets go and drops away
    l.on = false;
    l.port = -1;
    l.gone = 0.01;
    l.fled = true;
    l.vx = (l.x - this.cx) * 2;
    l.vy = (l.y - this.cy) * 2;
    l.face = Math.atan2(l.vy, l.vx);
    this.gulped++;
    this.gulpT = 0.28;
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  private readonly gaugeX = 22;
  private readonly gaugeW = 110;

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    // the countdown draws before the first update: the ship flies in under it
    if (this.t0 < 0) this.t0 = t;
    const intro = this.time > 0 ? 1 : clamp((t - this.t0) / 1.3, 0, 1);
    const out = Math.max(0, this.outT - 0.35);
    const sx = Math.round(this.cx - (1 - intro) ** 3 * 300 + out * out * 800);
    this.scene(ctx, w, h, t);
    if (this.time >= SWARM && this.gulpT < 0 && this.result === null) {
      const p = 0.06 + 0.04 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(255,40,40,${p})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.tells(ctx, w, h, t);
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    this.engine(ctx, sx, t, intro < 1 ? 1 - intro : out * 3);
    // mid barrel roll, the ones still on are round the underside
    for (const l of this.leeches) if (this.under(l)) this.leech(ctx, l, t);
    this.ship(ctx, sx, t);
    this.clutch(ctx, t);
    // fliers under the clamped ones, so what's on the hull stays readable
    for (const l of this.leeches) if (!l.on) this.leech(ctx, l, t);
    for (const l of this.leeches) if (l.on && !this.under(l)) this.leech(ctx, l, t);
    this.arcs(ctx);
    this.drawBits(ctx);
    this.reticle(ctx, t);
    this.rhythm(ctx, t);
    ctx.restore();
    this.fx.drawSparks(ctx);
    this.fx.drawWords(ctx);
    this.foreground(ctx, w, h, t);
    vignette(ctx, w, h, 0.6);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    if (this.promptT > 0) {
      const a = Math.min(1, this.promptT * 3);
      ctx.globalAlpha = a;
      this.panel(ctx, w / 2 - 132, 9, 264, 15);
      drawText(ctx, this.prompt, w / 2, 13, this.promptC, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    this.hud(ctx, w, h, t);
    this.fx.drawFlash(ctx, w, h);
  }

  /**
   * The lane through the dark: a blue-gold nebula, the gold world the lanterns lead to, their
   * buoys strung along it far off, rocks tumbling past nearer in, all drifting by as you fly.
   */
  private scene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#06050d';
    ctx.fillRect(0, 0, w, h);
    nebula(ctx, w, h, 0x1eec, [40, 80, 170], [170, 110, 40], t * 3);
    // the world at the lane's end, its light over everything
    const px = w - 64;
    const py = 34;
    glow(ctx, px, py, 150, '#ffb04a', 0.22);
    const g = ctx.createRadialGradient(px - 18, py - 16, 4, px, py, 52);
    g.addColorStop(0, '#fff0c0');
    g.addColorStop(0.35, '#f0b060');
    g.addColorStop(0.8, '#9a5a2a');
    g.addColorStop(1, '#3a1a14');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 50, 0, TAU);
    ctx.fill();
    // its bands, faint
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(90,40,20,0.22)';
    for (const [y, hh] of [
      [-22, 3],
      [-6, 5],
      [10, 2],
      [22, 6],
    ])
      ctx.fillRect(px - 50, py + y, 100, hh);
    ctx.restore();
    glow(ctx, px - 30, py + 26, 40, '#ffd890', 0.25);
    stars(ctx, w, h, 0x1eec, t * 18 + this.roll * 12, 0, t);
    // the lane: lantern buoys strung off towards the gold world, coming past as you fly it
    const [ax, ay, bx, by] = [-10, 226, w - 96, 60];
    ctx.strokeStyle = 'rgba(255,176,74,0.07)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,208,140,0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const N = 9;
    const ph = 1 - ((t * 0.06) % 1);
    for (let k = N - 1; k >= 0; k--) {
      const q = (k + ph) / N;
      // far ones bunch up towards the end of the lane
      const p = q ** 0.55;
      const x = ax + (bx - ax) * p;
      const y = ay + (by - ay) * p;
      const fade = Math.min(1, q * 6, (1 - q) * 5);
      glow(ctx, x, y - 6 * (1 - q), 26 * (1 - q) + 6, '#ffb04a', (0.25 + 0.1 * Math.sin(t * 3 + k)) * fade);
      // hazed blue with distance, so they sit back behind the play
      const o: SpriteOpts = { alpha: 0.7 * fade };
      const name = q < 0.22 ? 'lantern' : q < 0.65 ? 'lantern_far' : '';
      if (name) {
        drawSprite(ctx, 'shake', name, x, y, o);
        this.tint(ctx, name, x, y, o, '#141838', 0.45 + q * 0.3);
      }
      else {
        ctx.fillStyle = `rgba(255,216,140,${0.8 * fade})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      }
    }
    // rocks, nearer and quicker, turning as they go
    for (let i = 0; i < 6; i++) {
      const sp = 26 + i * 9;
      const x = ((((i * 97 - t * sp) % (w + 80)) + w + 80) % (w + 80)) - 40;
      const y = 20 + ((i * 53) % 190);
      drawSprite(ctx, 'shake', i % 3 ? 'rock_small' : 'rock', x, y, { angle: t * (0.4 + i * 0.13) * (i % 2 ? 1 : -1), alpha: 0.7 + (i % 3) * 0.1 });
    }
  }

  /** The near layer: a big rock tumbling past close, a dark shape out of focus, and dust streaking by. */
  private foreground(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const p = (t % 11) / 11;
    const x = w + 80 - p * (w + 420);
    if (x > -60 && x < w + 60) {
      const y = p < 0.5 ? h - 6 : 4;
      // out of focus, so close
      const o: SpriteOpts = { angle: t * 0.7, scale: 3, alpha: 0.9 };
      ctx.save();
      ctx.filter = 'blur(2px)';
      drawSprite(ctx, 'shake', 'rock', x, y, o);
      this.tint(ctx, 'rock', x, y, o, '#06040a', 0.7);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(244,236,216,0.18)';
    for (let i = 0; i < 10; i++) {
      const a = Math.sin(i * 91.7) * 4375.5;
      const yy = Math.round((a - Math.floor(a)) * h);
      const xx = Math.round(((((i * 131 - t * 240) % (w + 40)) + w + 40) % (w + 40)) - 20);
      ctx.fillRect(xx, yy, 8, 1);
    }
  }

  /** The two engine bells' flames, longer under strain or a boost; out when it's stalled. */
  private engine(ctx: CanvasRenderingContext2D, sx: number, t: number, boost: number) {
    if (this.stall > 0) return;
    const sq = Math.cos(this.rollAngle());
    const len = 1 + this.strain * 0.6 + boost;
    for (const side of [-1, 1]) {
      const ex = sx - 36;
      const ey = Math.round(this.cy + side * 13 * sq);
      glow(ctx, ex - 6, ey, 14 + 10 * len, '#ff9a3a', 0.45 + 0.08 * Math.sin(t * 40 + side));
      for (let k = 0; k < 5; k++) {
        const ph = (t * 6 + k * 0.2 + (side > 0 ? 0.1 : 0)) % 1;
        const fx = Math.round(ex - 2 - ph * 24 * len);
        ctx.globalAlpha = 1 - ph;
        ctx.fillStyle = k % 2 ? '#ffd04a' : '#ff8a3a';
        const s = ph < 0.4 ? 2 : 1;
        ctx.fillRect(fx, ey - (s >> 1), Math.round(5 * len), s);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff4c8';
      ctx.fillRect(ex - 4, ey - 1, 4, 2);
    }
  }

  /** Your Kestrel from above: banking with the stick, or a full barrel roll on a hard throw. */
  private ship(ctx: CanvasRenderingContext2D, sx: number, t: number) {
    const a = this.rollAngle();
    const o: SpriteOpts =
      this.flipT >= 0
        ? { clip: 'flip', frame: ((Math.round(a / (TAU / 16)) % 16) + 16) % 16 }
        : { clip: 'bank', frame: clamp(4 + Math.round((a * 180) / Math.PI / 20), 0, 8) };
    o.fallback = () => {
      ctx.fillStyle = '#c86a3a';
      ctx.fillRect(sx - 40, this.cy - 8, 90, 16);
      ctx.fillRect(sx - 20, this.cy - Math.round(30 * Math.cos(a)), 26, Math.round(60 * Math.cos(a)));
    };
    drawSprite(ctx, 'shake', 'ship', sx, this.cy, o);
    // the hull runs hot under strain
    if (this.strain > 0.7 && this.stall <= 0) this.tint(ctx, 'ship', sx, this.cy, o, '#ff5a3a', 0.18 + 0.14 * Math.sin(t * 20));
    if (this.stall > 0) this.tint(ctx, 'ship', sx, this.cy, o, '#1a1428', 0.35);
    // the zap emitter on its back: lit when it's ready
    const ready = this.ready && this.result === null;
    glow(ctx, sx + 4, this.cy, ready ? 8 + this.charge * 2 + Math.sin(t * 8) * 2 : 5, '#b48aff', ready ? 0.3 + this.charge * 0.1 : 0.15);
    // the clamp points, faint, so you can see where they'll land
    if (this.result === null && this.flipT < 0) {
      ctx.fillStyle = 'rgba(255,208,74,0.3)';
      for (let i = 0; i < PORTS.length; i++) {
        const [px, py] = this.portAt(i);
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
    }
  }

  /** A sprite again on top, washed with a colour: the white frame of a hit, heat, shadow. */
  private tint(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, o: SpriteOpts, color: string, a: number) {
    if (a <= 0 || typeof document === 'undefined') return;
    if (!tintCanvas) {
      tintCanvas = document.createElement('canvas');
      tintCanvas.width = tintCanvas.height = 128;
    }
    const g = tintCanvas.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, 128, 128);
    if (!drawSprite(g, 'shake', name, 64, 64, { ...o, alpha: 1, fallback: undefined })) return;
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = Math.min(1, a);
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(tintCanvas, Math.round(x) - 64, Math.round(y) - 64);
    ctx.restore();
  }

  /** The zap: a violet glow round a white-hot core, jagged, with a fork off it. */
  private arcs(ctx: CanvasRenderingContext2D) {
    if (this.zapT <= 0) return;
    const f = this.zapT / 0.16;
    for (const z of this.zapArcs) {
      const pts: [number, number][] = [[z.x0, z.y0]];
      const n = 8;
      for (let k = 1; k <= n; k++) {
        const q = k / n;
        const j = k < n ? 12 * Math.sin(q * Math.PI) : 0;
        pts.push([z.x0 + (z.x1 - z.x0) * q + (Math.random() - 0.5) * j, z.y0 + (z.y1 - z.y0) * q + (Math.random() - 0.5) * j]);
      }
      const path = (lw: number, col: string, a: number) => {
        ctx.globalAlpha = a;
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };
      path(4, '#7a4aff', 0.35 * f);
      path(2, '#b48aff', 0.8 * f);
      path(1, '#ffffff', 1);
      // a fork, off the middle
      const [mx, my] = pts[4];
      ctx.globalAlpha = f;
      ctx.strokeStyle = '#d8c0ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + (Math.random() - 0.5) * 24, my + (Math.random() - 0.5) * 24);
      ctx.stroke();
      ctx.globalAlpha = 1;
      glow(ctx, z.x1, z.y1, 22, '#b48aff', 0.7 * f);
      glow(ctx, z.x0, z.y0, 12, '#e8d8ff', 0.6 * f);
    }
  }

  private drawBits(ctx: CanvasRenderingContext2D) {
    for (const b of this.bits) {
      const f = b.life / b.max;
      if (b.kind === 'smoke') {
        ctx.globalAlpha = 0.45 * f;
        ctx.fillStyle = b.c;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.s * (1 + (1 - f) * 2.2), 0, TAU);
        ctx.fill();
        continue;
      }
      // goo and embers stretch along their flight
      ctx.globalAlpha = Math.min(1, f * 1.8);
      ctx.strokeStyle = b.c;
      ctx.lineWidth = b.s;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035);
      ctx.stroke();
      if (b.kind === 'ember' && f > 0.5) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Eyes in the dark at the edge: a wave on its way, brighter as it nears. */
  private tells(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    for (const wv of this.waves) {
      if (!wv.told || wv.sent) continue;
      const f = clamp(1 - (wv.t - this.time) / this.tell, 0, 1);
      // where its line from the hull meets the edge of the view
      const dx = Math.cos(wv.a);
      const dy = Math.sin(wv.a);
      const k = Math.min(dx ? (dx > 0 ? w - 14 - this.cx : this.cx - 14) / Math.abs(dx) : Infinity, dy ? (dy > 0 ? h - 34 - this.cy : this.cy - 28) / Math.abs(dy) : Infinity);
      const ex = this.cx + dx * k;
      const ey = this.cy + dy * k;
      // a dark hole in the starlight, and the eyes in it
      ctx.fillStyle = `rgba(4,2,8,${0.35 + f * 0.3})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 14 + f * 8, 0, TAU);
      ctx.fill();
      glow(ctx, ex, ey, 22 + f * 18, '#ff4a3a', 0.3 + f * 0.45);
      wv.kinds.forEach((kind, i) => {
        const along = (i - (wv.kinds.length - 1) / 2) * 12;
        const px = Math.round(ex - dy * along);
        const py = Math.round(ey + dx * along);
        if (Math.sin(t * 7 + i * 2.3) > 0.85) return;
        const col = kind === 'big' ? '#ffd04a' : kind === 'skitter' ? '#8affe0' : kind === 'brood' ? '#c8ff8a' : '#ff5a4a';
        ctx.fillStyle = col;
        const s = kind === 'big' || kind === 'brood' ? 3 : 2;
        ctx.fillRect(px - 2 - s, py, s + 1, s);
        ctx.fillRect(px + 2, py, s + 1, s);
        glow(ctx, px, py, 6, col, 0.4);
      });
      // an arrow in, towards you
      const ax = Math.round(ex - dx * (12 + f * 6));
      const ay = Math.round(ey - dy * (12 + f * 6));
      ctx.fillStyle = `rgba(255,90,74,${0.4 + f * 0.5})`;
      for (let s = 0; s < 4; s++) {
        const bx = ax - dx * s * 2;
        const by = ay - dy * s * 2;
        ctx.fillRect(Math.round(bx - dy * (3 - s)), Math.round(by + dx * (3 - s)), 1, 1);
        ctx.fillRect(Math.round(bx + dy * (3 - s)), Math.round(by - dx * (3 - s)), 1, 1);
      }
    }
  }

  /** A brood's eggs on the hull: pale, pulsing, rocking harder as they near hatching. */
  private clutch(ctx: CanvasRenderingContext2D, t: number) {
    for (const e of this.eggs) {
      const [px, py] = this.portAt(e.port);
      if (this.flipT >= 0 && Math.cos(this.rollAngle()) < 0) continue;
      const f = e.t / HATCH;
      const rock = f > 0.6 ? Math.round(Math.sin(t * (20 + f * 30)) * (f - 0.6) * 5) : 0;
      const x = Math.round(px) + rock;
      const y = Math.round(py);
      glow(ctx, x, y, 9 + f * 6, '#9aff4a', 0.3 + f * 0.4 * (0.5 + 0.5 * Math.sin(t * (4 + f * 16))));
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 4, y - 3, 8, 7);
      ctx.fillRect(x - 3, y - 4, 6, 9);
      ctx.fillStyle = f > 0.75 && Math.sin(t * 24) > 0 ? '#d8ff9a' : '#8ac840';
      ctx.fillRect(x - 3, y - 3, 6, 7);
      ctx.fillRect(x - 2, y - 4 + 1, 4, 7);
      ctx.fillStyle = '#e8ffc8';
      ctx.fillRect(x - 2, y - 2, 1, 2);
      // the thing inside, darkening as it grows
      ctx.fillStyle = `rgba(42,58,20,${0.3 + f * 0.6})`;
      ctx.fillRect(x - 1, y, 2 + Math.round(f), 2 + Math.round(f));
    }
  }

  /** Brackets on the leech the zap would hit. */
  private reticle(ctx: CanvasRenderingContext2D, t: number) {
    const l = this.target;
    const ready = this.ready;
    if (!l || l.gone || this.result !== null || this.gulpT >= 0) {
      if (this.result !== null || this.time === 0) return;
      const ax = this.cx + Math.cos(this.aim) * 70;
      const ay = this.cy + Math.sin(this.aim) * 56;
      ctx.fillStyle = ready ? '#d8c0ff' : '#4a3e58';
      ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3);
      return;
    }
    const s = (this.heavy(l) ? 18 : 12) + (ready ? Math.round(Math.sin(t * 10)) : 2);
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass ? (ready ? '#e8d8ff' : '#5a4e6a') : DARK;
      const o = pass ? 0 : 1;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.fillRect(x + sx * s - (sx > 0 ? 4 : 0) - o, y + sy * s - o, 5 + o * 2, 1 + o * 2);
        ctx.fillRect(x + sx * s - o, y + sy * s - (sy > 0 ? 4 : 0) - o, 1 + o * 2, 5 + o * 2);
      }
    }
    if (ready) glow(ctx, x, y, 16, '#b48aff', 0.25);
  }

  /** The roll's timing bar under the ship: throw again while the marker's in the green. */
  private rhythm(ctx: CanvasRenderingContext2D, t: number) {
    const x = this.cx - 34;
    const y = this.cy + 70;
    const bw = 68;
    if (this.stall > 0) {
      const f = this.stall / byLevel(this.d, 1.2, 1.6);
      this.panel(ctx, x - 4, y - 13, bw + 8, 21);
      drawText(ctx, 'STALLED', this.cx, y - 10, Math.sin(t * 12) > 0 ? '#ff5a4a' : '#ff8a5a', { align: 'center' });
      this.tube(ctx, x, y, bw, 1 - f, '#ff5a4a');
      return;
    }
    const since = this.time - this.lastThrow;
    const [lo, hi] = this.window;
    const span = hi * 1.6;
    if (!this.combo || since > span || this.gulpT >= 0 || this.result !== null) return;
    this.panel(ctx, x - 4, y - 4, bw + 26, 12);
    ctx.fillStyle = '#120c1a';
    ctx.fillRect(x, y, bw, 4);
    ctx.fillStyle = '#2a8a5a';
    ctx.fillRect(x + Math.round((lo / span) * bw), y, Math.round(((hi - lo) / span) * bw), 4);
    ctx.fillStyle = '#4ac88a';
    ctx.fillRect(x + Math.round((lo / span) * bw), y, Math.round(((hi - lo) / span) * bw), 1);
    const mx = x + Math.round(Math.min(1, since / span) * bw);
    const inWin = since >= lo && since <= hi;
    ctx.fillStyle = DARK;
    ctx.fillRect(mx - 2, y - 3, 4, 10);
    ctx.fillStyle = inWin ? '#8affb0' : '#f4ecd8';
    ctx.fillRect(mx - 1, y - 2, 2, 8);
    if (inWin) glow(ctx, mx, y + 2, 10, '#8affb0', 0.5);
    // the chain so far: pips, gold once it's a hard roll
    for (let k = 0; k < HARD; k++) {
      ctx.fillStyle = k < this.combo ? (this.combo >= HARD ? '#ffd04a' : '#f4ecd8') : '#3a2e48';
      ctx.fillRect(x + bw + 5 + k * 5, y, 3, 4);
    }
    if (this.combo >= HARD) glow(ctx, x + bw + 12, y + 2, 10, '#ffd04a', 0.4);
  }

  /** A riveted instrument panel. */
  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = 'rgba(12,9,20,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#5a4a6a';
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = '#8a7a5a';
    for (const [rx, ry] of [
      [x + 2, y + 2],
      [x + w - 3, y + 2],
      [x + 2, y + h - 3],
      [x + w - 3, y + h - 3],
    ])
      ctx.fillRect(rx, ry, 1, 1);
  }

  /** A glass tube meter: dark glass, a lit fill with a bright skin, a glint along the top. */
  private tube(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, f: number, color: string) {
    ctx.fillStyle = '#4a3e58';
    ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#120c1a';
    ctx.fillRect(x, y, w, 4);
    const fw = Math.round(w * clamp(f, 0, 1));
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fw, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y, fw, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x, y + 3, fw, 1);
  }

  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const y = h - 22;
    // fuel: a canister, and a glass tube of it that drips while they drink
    this.panel(ctx, 4, y, 202, 18);
    const fc = this.fuel > 0.86 ? '#ffd04a' : this.fuel > 0.68 ? '#ffb04a' : this.fuel > 0.5 ? '#ff8a3a' : '#ff5a4a';
    ctx.fillStyle = DARK;
    ctx.fillRect(8, y + 4, 9, 11);
    ctx.fillStyle = '#c86a3a';
    ctx.fillRect(9, y + 6, 7, 8);
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(9, y + 6, 7, 1);
    ctx.fillStyle = fc;
    ctx.fillRect(11, y + 8, 3, 4);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(11, y + 4, 3, 2);
    const gx = this.gaugeX;
    const gw = this.gaugeW;
    const gy = y + 8;
    ctx.fillStyle = '#4a3e58';
    ctx.fillRect(gx - 1, gy - 2, gw + 2, 8);
    ctx.fillStyle = '#120c1a';
    ctx.fillRect(gx, gy - 1, gw, 6);
    // what it just lost, fading, behind what's left
    ctx.fillStyle = 'rgba(244,236,216,0.35)';
    ctx.fillRect(gx, gy - 1, Math.round(gw * this.shownFuel), 6);
    const fw = Math.round(gw * this.fuel);
    ctx.fillStyle = fc;
    ctx.fillRect(gx, gy - 1, fw, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(gx, gy - 1, fw, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(gx, gy + 4, fw, 1);
    // bubbles drawn off towards the leeches while they drink
    if (this.drain > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 4; k++) {
        const bx = gx + fw - 2 - (((t * 40 + k * 23) % Math.max(1, fw - 2)) | 0);
        ctx.fillRect(bx, gy + 1 + (k % 3), 1, 1);
      }
      // the skin of it wobbles
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx + fw - 1, gy - 1 + Math.round(Math.sin(t * 20)), 1, 3);
    }
    // where the grades fall
    for (const [f, c] of [
      [0.86, '#8affb0'],
      [0.68, '#c8e86a'],
      [0.5, '#ffb04a'],
    ] as const) {
      ctx.fillStyle = c;
      ctx.fillRect(gx + Math.round(gw * f), gy - 4, 1, 2);
    }
    ctx.fillStyle = '#ffd04a';
    for (const p of this.drops) ctx.fillRect(p.x, Math.round(p.y), 1, 2);
    drawText(ctx, `${Math.round(this.shownFuel * 100)}%`, gx + gw + 4, y + 6, fc);
    if (this.drain > 0) drawText(ctx, `-${Math.min(99, Math.round(this.drain * 100))}%/S`, gx + gw + 32, y + 6, Math.sin(t * 10) > 0 ? '#ff5a4a' : '#ff8a5a');

    // the engine's heat on a dial, and the zap's charge in cells
    const rx = w - 132;
    this.panel(ctx, rx, y, 128, 18);
    const dx = rx + 14;
    const dy = y + 14;
    const zones: [number, number, string][] = [
      [0, 0.45, '#2a8a7a'],
      [0.45, 0.7, '#a88a2a'],
      [0.7, 1, '#a83a2a'],
    ];
    ctx.lineWidth = 3;
    for (const [a0, a1, c] of zones) {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(dx, dy, 8, Math.PI + a0 * Math.PI, Math.PI + a1 * Math.PI);
      ctx.stroke();
    }
    const jitter = this.strain > 0.7 && this.stall <= 0 ? Math.sin(t * 50) * 0.04 : 0;
    const na = Math.PI + clamp(this.strain + jitter, 0, 1) * Math.PI;
    ctx.strokeStyle = '#f4ecd8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + Math.cos(na) * 9, dy + Math.sin(na) * 9);
    ctx.stroke();
    ctx.fillStyle = '#8a7a5a';
    ctx.fillRect(dx - 1, dy - 1, 3, 2);
    if (this.strain > 0.7 && this.stall <= 0 && Math.sin(t * 14) > 0) glow(ctx, dx, dy - 4, 12, '#ff5a4a', 0.5);
    const stalled = this.stall > 0;
    drawText(ctx, stalled ? 'STALL' : 'STRAIN', rx + 27, y + 6, stalled ? (Math.sin(t * 12) > 0 ? '#ff5a4a' : '#ff8a5a') : this.strain > 0.7 ? '#ff8a5a' : '#c8bcd8');
    // a bolt, and the dynamo's cells, filling as the rolls spin it
    const bx = rx + 70;
    const ready = this.ready;
    ctx.fillStyle = ready ? '#e8d8ff' : '#5a4e6a';
    for (const [px, py, pw] of [
      [4, 3, 3],
      [3, 5, 3],
      [2, 7, 5],
      [4, 9, 2],
      [3, 11, 2],
      [2, 13, 1],
    ])
      ctx.fillRect(bx + px, y + py, pw, 2);
    if (ready) glow(ctx, bx + 4, y + 9, 10, '#b48aff', 0.35 + 0.15 * Math.sin(t * 8));
    for (let k = 0; k < CELLS; k++) {
      const cx = bx + 12 + k * 15;
      const f = clamp(this.shownCharge - k, 0, 1);
      ctx.fillStyle = '#4a3e58';
      ctx.fillRect(cx - 1, y + 5, 13, 9);
      ctx.fillStyle = '#120c1a';
      ctx.fillRect(cx, y + 6, 11, 7);
      // a full cell lit, the one charging fills from the bottom, dimmer
      const fh = Math.round(7 * f);
      ctx.fillStyle = f >= 1 ? '#b48aff' : '#5a3e98';
      ctx.fillRect(cx, y + 13 - fh, 11, fh);
      if (f >= 1) {
        ctx.fillStyle = '#e8d8ff';
        ctx.fillRect(cx, y + 6, 11, 1);
      }
    }
    if (!ready && this.charge < 1 && this.result === null && Math.sin(t * 6) > 0) {
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(bx + 12, y + 15, CELLS * 15 - 4, 1);
    }
  }

  private leech(ctx: CanvasRenderingContext2D, l: Leech, t: number) {
    const big = l.kind === 'big';
    const brood = l.kind === 'brood';
    // a brood is a bloater's body gone pale and swollen with eggs
    const kind = brood ? 'big' : l.kind;
    const shiver = l.hurt > 0 ? Math.round(Math.sin(t * 80) * 2) : 0;
    const x = Math.round(l.x) + shiver;
    const y = Math.round(l.y);
    const fallback = () => {
      ctx.fillStyle = big ? '#a83c52' : brood ? '#b8c890' : l.kind === 'skitter' ? '#2e8a80' : '#a8583a';
      ctx.beginPath();
      ctx.arc(x, y, big || brood ? 8 : 5, 0, TAU);
      ctx.fill();
    };
    if (l.gone) {
      if (l.fled) {
        // full, or let off: it flaps away into the dark
        drawSprite(ctx, 'shake', kind, x, y, { clip: 'flap', t: l.gone * 1.5, angle: l.face, alpha: Math.max(0, 1 - l.gone / 1.2), fallback });
        return;
      }
      // fried: it crisps and curls; flung: it tumbles off
      const name = `${kind}_spin`;
      const a = l.fried ? clamp(1 - (l.gone - 0.35) / 0.5, 0, 1) : Math.max(0, 1 - l.gone / 1.5);
      const o: SpriteOpts = l.fried ? { clip: 'fry', t: l.gone, alpha: a, fallback } : { clip: 'tumble', t: l.gone * 1.6, alpha: a, fallback };
      drawSprite(ctx, 'shake', name, x, y, o);
      if (l.gone < 0.07) this.tint(ctx, name, x, y, o, '#ffffff', 1);
      else if (l.fried && l.gone < 0.4) this.tint(ctx, name, x, y, o, '#b48aff', 0.5 * (1 - l.gone / 0.4));
      return;
    }
    const under = this.under(l);
    // its shadow on the hull
    if (l.on && !under) {
      ctx.fillStyle = 'rgba(8,4,16,0.35)';
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 3, big ? 10 : 6, big ? 7 : 4, 0, 0, TAU);
      ctx.fill();
    }
    const o: SpriteOpts = !l.on
      ? { clip: 'flap', t: (l.flap / 16) * (big ? 0.8 : 1.2), angle: l.face, fallback }
      : l.onT < 0.17
        ? { clip: 'clamp', t: l.onT, angle: l.face, fallback }
        : { clip: 'drink', t: l.flap / 6, angle: l.face, fallback };
    if (under) o.alpha = 0.55;
    drawSprite(ctx, 'shake', kind, x, y, o);
    if (brood) {
      // pale, and the eggs in her glowing through, quicker as the next is due
      this.tint(ctx, kind, x, y, o, '#d8f0a0', 0.5);
      const due = l.on ? 1 - clamp((l.lay ?? LAY) / LAY, 0, 1) : 0;
      glow(ctx, x, y, 9 + due * 6, '#c8ff8a', 0.25 + due * 0.3 * (0.6 + 0.4 * Math.sin(t * (6 + due * 14))));
    }
    if (under) this.tint(ctx, kind, x, y, o, '#1a1428', 0.5);
    // the frame of white when a zap strikes it
    if ((l.struck ?? 0) > 0) this.tint(ctx, kind, x, y, o, '#ffffff', 0.95);
    // a skitter still able to dodge shimmers
    if (l.dodge > 0 && !l.on && Math.sin(t * 20) > 0) glow(ctx, x, y, 10, '#8affe0', 0.35);
    if (under) return;
    // a big one's zaps to go
    if (big) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = DARK;
        ctx.fillRect(x - 5 + k * 6, y - 22, 5, 4);
        ctx.fillStyle = k < l.hp ? '#ffd04a' : '#3a2e48';
        ctx.fillRect(x - 4 + k * 6, y - 21, 3, 2);
      }
    }
    // its grip: one ring, its colour the stage (yellow rolls off, orange a hard roll, red a zap)
    if (l.on) {
      const st = this.stage(l);
      const col = st === 0 ? '#ffd04a' : st === 1 ? '#ff8a3a' : '#ff4a3a';
      const f = big ? 1 : st === 0 ? l.grip / LOOSE : st === 1 ? (l.grip - LOOSE) / (HELD - LOOSE) : 1;
      const r = big || brood ? 15 : l.kind === 'skitter' ? 9 : 10;
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.globalAlpha = st === 2 ? (Math.sin(t * 10) > 0 ? 1 : 0.6) : 0.9;
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.08, f));
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (st === 2) glow(ctx, x, y, r + 4, '#ff4a3a', 0.25);
    }
  }
}

/** Scratch for washing a sprite in a colour (a hit's white frame and such). */
let tintCanvas: HTMLCanvasElement | null = null;
