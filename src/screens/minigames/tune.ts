import { audio } from '../../audio';
import { artImage } from '../art';
import { drawText, wrap } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, scanlines, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';
import { drawSprite, preloadSprites } from './sprites';
import './tune-sound';

/** What comes through once a voice is clear. */
const SNATCHES = [
  '...MAYDAY, MAYDAY...',
  '...COORDINATES FOLLOW...',
  '...DO NOT DOCK...',
  '...CARGO IS INTACT...',
  '...ANYONE HEAR ME?...',
  '...THE CODE IS...',
  '...THEY OWE US...',
  '...KEEP SINGING...',
];

/** How alike the waves must be for the static to clear and the lock to take. */
const IN = 0.72;
/** Where the set's pieces stand (their sprites' origins): the scope's screen centre, the panel's
 *  centre, the knob; and the holes in the panel, from its centre (x right, y up, w, h). */
const SC = { x: 134, y: 104 };
const SCR_W = 226;
const SCR_H = 136;
const PN = { x: 367, y: 126 };
const METER = [-22, 58, 120, 50];
const LOCK = [-22, 24, 120, 8];
const SLOT = [76, -50, 8, 76];
const KNOB = { x: PN.x - 20, y: PN.y + 36 };
const VALVE_X = PN.x - 70;
/** The steps the dead-on bell climbs with the streak. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
/** Just off: holding here keeps the lock from draining much, but it muddies the clarity. */
const EDGE = 0.58;
/** Dead on: the lock fills faster, and every beat held here adds to a streak. */
const PERFECT = 0.9;
/** Tight enough at the moment a burst hits to ride it out. */
const RIDE = 0.86;

/** A held voice's clarity, from how well you tracked it: C, B or A. */
const grade = (worth: number) => (worth >= 0.88 ? 'A' : worth >= 0.68 ? 'B' : 'C');
const GRADE_COL: Record<string, string> = {
  A: '#8affb0',
  B: '#c8e86a',
  C: '#ffd04a',
};

/**
 * Tune in: a voice in the static, and your receiver's wave over it, on an old phosphor scope.
 * Left and right turn the frequency knob (tap for fine, hold and it spins faster), up and down
 * slide the phase. The voice never sits still: it drifts on the dial and its phase wanders and
 * turns back, so locking is tracking, not set-and-hold. Hold the button while the waves lie
 * together and the lock fills; just off it barely holds (and muddies the clarity), slip right
 * off while holding and it drains fast, let go and it only fades, so letting go before you slip
 * is a choice. Dead on, the lock fills faster and builds a streak. Every so often the jammer
 * sweeps the scope: a red band warns you, then a burst kicks your wave off. Be dead on when it
 * lands and you ride it out; be loose and it knocks you off and eats your lock. Clarity is graded
 * live, A to C, and clear voices pay. Higher levels: more voices (two to four), faster drift,
 * tighter bands, more bursts with less warning, and a longer lock.
 */
export class Tune implements Minigame {
  readonly title = 'TUNE IN';
  readonly how = 'LEFT/RIGHT: FREQUENCY. UP/DOWN: PHASE. TRACK THE DRIFTING VOICE AND HOLD THE BUTTON TO LOCK IT. WHEN THE JAMMER BURSTS, BE DEAD ON.';
  result: number | null = null;
  /** The score it ended on: the finish plays out for a moment before it becomes the result. */
  private outcome: number | null = null;
  private outroT = 0;
  private readonly d: number;
  private voices: {
    f: number;
    p: number;
    amp: number;
    said: string;
    a: number;
    b: number;
  }[] = [];
  private got: number[] = [];
  private at = 0;
  private f = 2.6;
  private p = 0;
  /** 0..1 towards the current voice. */
  private lock = 0;
  private lockSum = 0;
  private lockT = 0;
  private xHeld = 0;
  private yHeld = 0;
  private xDir = 0;
  private time = 0;
  private readonly limit: number;
  private wasIn = false;
  private slipping = false;
  private fading = false;
  // the voice's wander
  private vPhase = 0;
  private vDir = 1;
  private flipT = 2;
  private fAmp: number;
  private fRate: number;
  private pRate: number;
  private tolF: number;
  private tolP: number;
  /** The average match that scrapes a voice in, and the one that makes it crystal clear. */
  private wLo = 0.74;
  private wHi = 0.92;
  /** Seconds of good holding a lock needs. */
  private need: number;
  // the jammer
  private burstT: number;
  private warn = 0;
  private staticT = 0;
  /** Sound clocks: the next hiss grain, the next syllable of the voice. */
  private hissT = 0;
  private sayT = 0;
  /** The knob and slider notches last clicked past. */
  private fNotch = NaN;
  private pNotch = NaN;
  private every: number;
  private warnTime: number;
  private knock: number;
  private bursts = 0;
  private ridden = 0;
  // the streak
  private streak = 0;
  private best = 0;
  private perfT = 0;
  /** The best streak on the voice being locked: dead-on beats add a little to its worth. */
  private voiceBest = 0;
  /** Bursts ridden out on the voice being locked: each one makes it come through a little clearer. */
  private voiceRides = 0;
  // onboarding: a prompt at the moment each thing first matters, once each
  private tip: { text: string; col: string; t: number; up: number } | null = null;
  private queued: { text: string; col: string } | null = null;
  private seen = new Set<string>();
  /** While a pop word is up, the prompt waits (hidden, its clock stopped), so they never stack. */
  private wordT = 0;
  /** Since the last voice came through, for the finish. */
  private doneT = 0;
  private r: Rng;
  private fx = new Fx();
  private trail: HTMLCanvasElement | null = null;
  private bg: HTMLCanvasElement | null = null;
  /** The meter's needle, lagging the signal. */
  private needle = 0;

  constructor(level: number, seed: number) {
    const r = rng(seed);
    this.r = r;
    preloadSprites('tune');
    const d = (this.d = hardness(level));
    const n = level <= 3 ? 4 : 5;
    let last = 2.6;
    for (let k = 0; k < n; k++) {
      // each voice well away from where you'll be tuned from
      let f = 1.3 + r() * 3.4;
      for (let tries = 0; Math.abs(f - last) < 1 && tries < 8; tries++) f = 1.3 + r() * 3.4;
      last = f;
      this.voices.push({
        f,
        p: r() * Math.PI * 2,
        amp: 0.75 + r() * 0.2,
        said: SNATCHES[Math.floor(r() * SNATCHES.length)],
        a: r() * 6,
        b: r() * 6,
      });
    }
    this.fAmp = byLevel(d, 0.25, 0.26);
    this.fRate = byLevel(d, 0.6, 0.62);
    this.pRate = byLevel(d, 0.3, 0.34);
    this.tolF = byLevel(d, 0.75, 0.6);
    this.tolP = byLevel(d, 1.1, 0.9);
    this.need = byLevel(d, 2.2, 2.4);
    this.wLo = byLevel(d, 0.74, 0.79);
    this.wHi = byLevel(d, 0.92, 0.94);
    this.every = byLevel(d, 9, 4.5);
    this.warnTime = byLevel(d, 1.1, 0.6);
    this.knock = byLevel(d, 0.9, 1.6);
    this.burstT = this.every * 0.6 + 2;
    this.limit = Math.round(6 + n * byLevel(d, 10, 8));
  }

  private target() {
    const v = this.voices[Math.min(this.at, this.voices.length - 1)];
    const T = this.time;
    const f = v.f + this.fAmp * (Math.sin(T * this.fRate + v.a) * 0.7 + Math.sin(T * this.fRate * 1.9 + v.b) * 0.3);
    return { f: clamp(f, 0.9, 5.3), p: v.p + this.vPhase, amp: v.amp };
  }

  /** How alike the two waves are, 0..1. */
  match() {
    const t = this.target();
    const df = Math.abs(this.f - t.f) / this.tolF;
    const dp = Math.abs(wrapAngle(this.p - t.p)) / this.tolP;
    return Math.max(0, 1 - Math.hypot(df, dp));
  }

  /** A held voice's worth, from how well you tracked it while it locked: 0.5 scraped, 1 dead on. */
  private worth(avg: number) {
    return 0.5 + 0.5 * clamp((avg - this.wLo) / (this.wHi - this.wLo), 0, 1);
  }

  /** The clarity of the lock so far, with a little for the dead-on streak and bursts ridden out. */
  private clarity() {
    return this.lockT > 0.05 ? Math.min(1, this.worth(this.lockSum / this.lockT) + Math.min(0.1, this.voiceBest * 0.01 + this.voiceRides * 0.03)) : null;
  }

  /** A pop word on the scope; the prompt steps aside while it's up. */
  private say(text: string, x: number, y: number, color: string, scale = 1, o: { pop?: boolean; life?: number } = {}) {
    this.fx.word(text, x, y, color, scale, o);
    this.wordT = Math.max(this.wordT, o.life ?? 0.9);
  }

  /** Shows a prompt the first time something matters; urgent ones cut in. */
  private hint(key: string, text: string, col = '#8affe0', urgent = false) {
    if (this.seen.has(key) || this.outcome !== null) return;
    this.seen.add(key);
    if (!this.tip || urgent || this.tip.up > 1.1) this.tip = { text, col, t: 2.4, up: 0 };
    else this.queued = { text, col };
  }

  status() {
    if (this.outcome !== null) return this.got.length === this.voices.length ? 'ALL VOICES IN.' : 'THE STATIC TAKES THEM.';
    if (this.warn > 0) return 'JAMMER! GET DEAD ON TO RIDE IT OUT';
    const m = this.match();
    const c = this.clarity();
    const tail = m > IN && this.lock === 0 ? '  HOLD TO LOCK!' : this.slipping ? '  SLIPPING!' : this.fading ? '  FADING...' : c !== null ? `  CLARITY ${grade(c)}` : '';
    return `VOICE ${Math.min(this.at + 1, this.voices.length)}/${this.voices.length}  SIGNAL ${Math.round(m * 100)}%${tail}`;
  }

  breakdown(): [string, string][] {
    const rows: [string, string][] = [['VOICES', `${this.got.length}/${this.voices.length}`]];
    if (this.got.length) rows.push(['CLARITY', this.got.map(grade).join(' ')]);
    if (this.bursts) rows.push(['RODE OUT', `${this.ridden}/${this.bursts}`]);
    rows.push(['BEST STREAK', `×${this.best}`]);
    return rows;
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    if (this.outcome !== null) {
      this.doneT += dt;
      this.outroT -= dt;
      if (this.outroT <= 0 && this.result === null) this.result = this.outcome;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('mini_tune_tick');
    // the voice wanders: its phase slides one way, then turns back
    this.vPhase += dt * this.pRate * this.vDir;
    this.flipT -= dt;
    if (this.flipT <= 0) {
      this.vDir = -this.vDir;
      this.flipT = byLevel(this.d, 3, 1.4) + this.r() * 2.5;
    }
    // the knob: a tap moves it a hair, holding spins it up
    const dir = Math.sign(pad.x);
    if (dir && dir === this.xDir) this.xHeld += dt;
    else this.xHeld = 0;
    this.xDir = dir;
    const fr = 0.22 + Math.min(1.5, this.xHeld * 1.6);
    this.f = clamp(this.f + pad.x * dt * fr, 0.8, 5.4);
    this.yHeld = pad.y ? this.yHeld + dt : 0;
    this.p += -pad.y * dt * (0.6 + Math.min(2.4, this.yHeld * 2.5));

    const m = this.match();
    const inside = m > IN;
    const perfect = m >= PERFECT;
    if (inside && !this.wasIn) audio.play('mini_tune_in');
    this.sound(dt, m);
    this.wasIn = inside;

    // the prompts
    this.wordT = Math.max(0, this.wordT - dt);
    if (this.tip && this.wordT <= 0) {
      this.tip.t -= dt;
      this.tip.up += dt;
      if (this.tip.t <= 0) {
        this.tip = this.queued ? { ...this.queued, t: 2.4, up: 0 } : null;
        this.queued = null;
      }
    }
    const tg = this.target();
    const near = Math.abs(this.f - tg.f) / this.tolF;
    if (this.time > 0.3 && near > 0.5) this.hint('knob', '← →  TURN THE KNOB TILL THE WAVES MATCH');
    if (near < 0.35 && !inside) this.hint('phase', '↑ ↓  SLIDE YOUR WAVE ON TOP OF IT');
    if (inside && this.lock === 0) this.hint('hold', 'HOLD THE BUTTON TO LOCK IT', '#8affb0');
    if (this.lock > 0.35) this.hint('drift', 'IT DRIFTS: STAY ON IT WHILE YOU HOLD');

    // the lock: fills while you hold it matched, holds (barely) at the edge, drains fast if you
    // slip right off, and fades if you let go
    const edge = pad.hold && !inside && m >= EDGE && this.lock > 0;
    const slip = pad.hold && !inside && !edge && this.lock > 0;
    this.fading = edge;
    if (slip && !this.slipping) {
      audio.play('mini_tune_slip');
      this.say('SLIPPING', 113, 91, '#ff8a3a');
      this.hint('slip', 'SLIPPING! GET BACK ON, OR LET GO: IT ONLY FADES', '#ff8a3a', true);
    }
    this.slipping = slip;
    if (pad.hold && inside) {
      const boost = perfect ? 1.25 + Math.min(0.5, this.streak * 0.08) : 1;
      this.lock += (dt * (0.55 + 0.45 * m) * boost) / this.need;
    } else if (edge) this.lock -= dt * 0.2;
    else if (slip) this.lock -= dt * 1.6;
    else this.lock -= dt * 0.5;
    this.lock = Math.max(0, this.lock);
    if (pad.hold && this.lock > 0) {
      this.lockSum += m * dt;
      this.lockT += dt;
    }
    if (this.lock === 0) this.lockSum = this.lockT = 0;

    // the streak: every beat held dead on
    if (pad.hold && perfect && this.lock > 0) {
      this.perfT += dt;
      if (this.perfT >= 0.4) {
        this.perfT -= 0.4;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        this.voiceBest = Math.max(this.voiceBest, this.streak);
        this.hint('perfect', 'DEAD ON! IT LOCKS FASTER, AND CLEARER', '#fff0a0');
        const step = PENTA[Math.min(this.streak - 1, PENTA.length - 1)];
        audio.play('mini_tune_perfect', { pitch: 2 ** (step / 12), vol: 0.8 });
        if (this.streak === 1) this.say('PERFECT', 113, 31, '#fff0a0', 1, { pop: true, life: 0.6 });
        else if (this.streak % 2 === 0) this.say(`PERFECT ×${this.streak}`, 113, 31, this.streak >= 6 ? '#ffd04a' : '#fff0a0', this.streak >= 6 ? 2 : 1, { pop: true, life: 0.6 });
      }
    } else if (!perfect && this.streak) {
      this.streak = 0;
      this.perfT = 0;
    }

    // the jammer: a warning sweep, then a burst
    this.staticT = Math.max(0, this.staticT - dt);
    if (this.warn > 0) {
      const w0 = this.warn;
      this.warn -= dt;
      if (Math.floor(w0 * 6) !== Math.floor(this.warn * 6)) audio.play('mini_tune_jam_tick');
      if (this.warn <= 0) {
        this.warn = 0;
        this.burst(m);
      }
    } else {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.warn = this.warnTime;
        // the last voice is the hardest to hold: the jammer comes more often
        const last = this.at === this.voices.length - 1;
        this.burstT = this.every * (last ? 0.7 : 1) * (0.75 + this.r() * 0.5);
        audio.play('mini_tune_jam');
        this.hint('jam', 'JAMMER! GET DEAD ON TO RIDE IT OUT', '#ff6a5a', true);
      }
    }

    if (this.lock >= 1) this.locked();
    if (this.outcome === null && this.time >= this.limit) {
      this.outcome = this.score();
      // the event lets the game run on 0.9 s more before its card comes down
      this.outroT = 0.1;
      this.say('LOST IT', 113, 62, '#ff5a4a', 2, { pop: true, life: 1.4 });
      audio.play('mini_tune_lost');
    }
  }

  /**
   * The set's running sound: hiss that thins as the waves match (and roars after a burst), the
   * voice murmuring up through it once you're close, and the knob and slider clicking notches.
   */
  private sound(dt: number, m: number) {
    this.hissT -= dt;
    if (this.hissT <= 0) {
      this.hissT += 0.22;
      const hiss = Math.min(1, (1 - m) * 0.9 + 0.1 + this.staticT * 2 + (this.warn > 0 ? 0.3 : 0));
      audio.play('mini_tune_static', { vol: hiss * 0.7 });
    }
    this.sayT -= dt;
    if (m >= EDGE && this.sayT <= 0) {
      this.sayT = 0.14 + Math.random() * 0.1;
      audio.play('mini_tune_voice', { vol: ((m - EDGE) / (1 - EDGE)) ** 1.5 * 0.9 + 0.1, pitch: 0.85 + this.target().f * 0.06 });
    }
    const fn = Math.round(this.f * 10);
    if (fn !== this.fNotch) {
      if (!Number.isNaN(this.fNotch)) audio.play('mini_tune_detent', { pitch: 0.8 + this.f * 0.1, vol: 0.7 });
      this.fNotch = fn;
    }
    const pn = Math.round(this.p * 4);
    if (pn !== this.pNotch) {
      if (!Number.isNaN(this.pNotch)) audio.play('mini_tune_slide', { vol: 0.7 });
      this.pNotch = pn;
    }
  }

  /** The jammer's burst lands: ride it out dead on, or get knocked off. */
  private burst(m: number) {
    const fx = this.fx;
    this.bursts++;
    const side = this.r() < 0.5 ? -1 : 1;
    if (m >= RIDE) {
      this.ridden++;
      if (this.lock > 0) this.voiceRides++;
      this.p += side * this.knock * 0.15;
      fx.stop(0.07);
      fx.ring(113, 69, 130, '#8affb0', 0.4);
      this.say('RODE IT OUT!', 113, 54, '#8affb0', 2, { pop: true, life: 1 });
      fx.flash('#8affb0', 0.1);
      audio.play('mini_tune_ride');
    } else {
      this.p += side * this.knock;
      this.f = clamp(this.f + (this.r() - 0.5) * byLevel(this.d, 0.3, 0.8), 0.8, 5.4);
      this.lock = Math.max(0, this.lock - 0.35);
      this.staticT = 0.45;
      this.streak = 0;
      fx.stop(0.05);
      fx.shake(4, 0.3);
      fx.flash('#ffffff', 0.15);
      this.say('STATIC!', 113, 54, '#ff5a4a', 2, { pop: true, life: 0.9 });
      audio.play('mini_tune_burst');
    }
  }

  /** A voice comes through: grade it, show what it said, and move on to the next. */
  private locked() {
    const fx = this.fx;
    const worth = this.clarity() ?? this.worth(this.lockSum / Math.max(0.001, this.lockT));
    const g = grade(worth);
    this.got.push(worth);
    fx.stop(g === 'A' ? 0.14 : 0.08);
    fx.ring(113, 69, 160, GRADE_COL[g], 0.45);
    if (g === 'A') fx.ring(113, 69, 90, '#ffffff', 0.3);
    this.say(g === 'A' ? 'CRYSTAL CLEAR' : g === 'B' ? 'CLEAR' : 'CRACKLY', 113, 26, GRADE_COL[g], 2, { pop: true, life: 1.2 });
    this.say(this.voices[this.at].said, 113, 46, '#ff9ad8', 1, { life: 1.6 });
    fx.burst(113, 69, g === 'A' ? 40 : 20, 160, [GRADE_COL[g], '#ffffff'], {
      life: 0.7,
    });
    fx.flash(GRADE_COL[g], 0.2);
    audio.play('mini_tune_lock', { pitch: g === 'A' ? 1.12 : g === 'B' ? 1 : 0.89, vol: 0.7 + worth * 0.3 });
    this.lock = this.lockSum = this.lockT = 0;
    this.streak = this.perfT = this.voiceBest = this.voiceRides = 0;
    this.at++;
    if (this.at === this.voices.length - 1) {
      this.say('LAST VOICE', 113, 91, '#ff9ad8', 2, { pop: true, life: 1.6 });
      audio.play('mini_tune_last');
    }
    // start the next search from wherever you are, a little knocked about, with a breather
    this.p += Math.PI * 0.7;
    this.burstT = Math.max(this.burstT, 2.5);
    if (this.at >= this.voices.length) {
      // the finish: every voice in, the scope clears and sings
      this.outcome = this.score();
      this.outroT = 0.7;
      fx.stop(0.22);
      fx.shake(3, 0.3);
      fx.ring(113, 69, 240, '#ffffff', 0.7);
      fx.ring(113, 69, 160, '#ff9ad8', 0.5);
      this.say('SIGNAL DECODED', 113, 98, '#fff0a0', 2, { pop: true, life: 2.4 });
      this.tip = this.queued = null;
      audio.play('mini_tune_decoded');
    }
  }

  private score() {
    const n = this.voices.length;
    const sum = this.got.reduce((a, b) => a + b, 0);
    const partial = this.at < n ? this.match() * 0.15 + this.lock * 0.3 : 0;
    return Math.min(1, (sum + partial) / n);
  }

  /** Space through the cockpit glass behind the set: the painted scene, soft and dim, cached. */
  private backdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, m: number) {
    const art = artImage('signal');
    if (art && !this.bg) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d')!;
      g.filter = 'blur(1.5px) brightness(0.55)';
      // the source and its rings sit at the painting's middle: keep them in the strip over the set
      g.drawImage(art, 120, 40, 400, 200, 0, -70, w, h);
      g.filter = 'none';
      this.bg = c;
    }
    if (this.bg) ctx.drawImage(this.bg, 0, 0);
    else {
      ctx.fillStyle = '#1a0e26';
      ctx.fillRect(0, 0, w, h);
    }
    // the source pulses as the voice comes in
    const src = 0.15 + m * 0.35 + (this.outcome !== null && this.at >= this.voices.length ? 0.4 : 0);
    glow(ctx, 260, 10, 60 + m * 30, '#ffb04a', src * (0.8 + Math.sin(t * 6) * 0.2));
    // the cockpit frame: a beam over the glass, the dark of the cabin round the set
    ctx.fillStyle = '#16101c';
    ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = 'rgba(20,14,26,0.85)';
    ctx.fillRect(0, 18, w, h - 18);
    // a warm cabin lamp somewhere above, falling on the set
    glow(ctx, 120, 20, 160, '#ff9a5a', 0.12);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    const m = this.match();
    const done = this.outcome !== null;
    const decoded = done && this.at >= this.voices.length;
    // the set warms up as the game opens: valves first, then the tube
    const warm = Math.min(1, this.time / 0.6);
    this.backdrop(ctx, w, h, t, m);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    // the valves on top of the panel: their glow follows the signal, flickers in static
    for (let i = 0; i < 4; i++) {
      const x = VALVE_X + i * 24;
      const flick = this.staticT > 0 ? fx.rand() * 0.6 : 0;
      const g = warm * (0.35 + m * 0.5 + (decoded ? 0.4 : 0)) * (1 - flick) * (done && !decoded ? Math.max(0.15, 1 - this.doneT) : 1);
      drawSprite(ctx, 'tune', 'valve', x, PN.y - 106);
      glow(ctx, x + 1, PN.y - 122, 14 + g * 10, '#ffb04a', g * 0.7);
      ctx.fillStyle = `rgba(255,220,150,${g * 0.8})`;
      ctx.fillRect(x - 1, PN.y - 125, 3, 6);
    }
    drawSprite(ctx, 'tune', 'scope', SC.x, SC.y);
    drawSprite(ctx, 'tune', 'panel', PN.x, PN.y);

    // the scope, with phosphor that lingers
    const tw = SCR_W;
    const th = SCR_H;
    if (!this.trail) {
      this.trail = document.createElement('canvas');
      this.trail.width = tw;
      this.trail.height = th;
    }
    const g = this.trail.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(4,16,12,0.35)';
    g.fillRect(0, 0, tw, th);
    // grid
    g.fillStyle = 'rgba(30,80,60,0.25)';
    for (let x = (tw / 2) % 20; x < tw; x += 20) g.fillRect(Math.round(x), 0, 1, th);
    for (let y = (th / 2) % 20; y < th; y += 20) g.fillRect(0, Math.round(y), tw, 1);
    g.fillStyle = 'rgba(60,140,110,0.3)';
    g.fillRect(0, Math.round(th / 2), tw, 1);
    g.fillRect(Math.round(tw / 2), 0, 1, th);
    const warnF = this.warn > 0 ? 1 - this.warn / this.warnTime : 0;
    // static: thick when you're off, thinning as the voice comes in, a storm in a burst
    const noise = done ? 12 : Math.round(25 + (1 - m) * 150 + warnF * 90 + this.staticT * 900);
    for (let k = 0; k < noise; k++) {
      g.fillStyle = fx.rand() < 0.5 ? 'rgba(90,200,150,0.5)' : 'rgba(40,110,80,0.6)';
      g.fillRect(Math.floor(fx.rand() * tw), Math.floor(fx.rand() * th), fx.rand() < 0.2 ? 2 : 1, 1);
    }
    // the jammer's sweep: a red band racing across before the burst
    if (this.warn > 0) {
      const bx = Math.round(warnF * tw);
      g.fillStyle = 'rgba(255,60,60,0.22)';
      g.fillRect(bx - 14, 0, 14, th);
      g.fillStyle = 'rgba(255,120,100,0.7)';
      g.fillRect(bx, 0, 2, th);
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
    if (decoded) {
      // every voice in: one bright wave, breathing
      const k = Math.min(1, this.doneT * 2);
      wave(this.f, this.p, 0.88, `rgba(255,240,160,${0.3 * k})`, 8, 0);
      wave(this.f, this.p, 0.88, `rgba(255,154,216,${0.5 * k})`, 3, 0);
    } else {
      const jit = (1 - m) * 5 + this.staticT * 30;
      wave(tg.f, tg.p, tg.amp, 'rgba(255,90,200,0.18)', 4, jit);
      wave(tg.f, tg.p, tg.amp, 'rgba(255,140,220,0.9)', 1.5, jit);
    }
    const lit = m > IN;
    const dead = m >= PERFECT;
    const mine = this.staticT * 24;
    wave(this.f, this.p, 0.88, dead ? 'rgba(255,230,140,0.28)' : lit ? 'rgba(138,255,176,0.2)' : 'rgba(138,255,224,0.15)', dead ? 6 : 4, mine);
    wave(this.f, this.p, 0.88, dead ? 'rgba(255,250,210,1)' : lit ? 'rgba(200,255,220,0.95)' : 'rgba(160,255,230,0.8)', 1.2, mine);
    // the tube: it opens from a line as the set warms up, and collapses to a dot when it's lost
    const lost = done && !decoded;
    const open = this.time === 0 ? 0 : lost ? Math.max(0, 1 - this.doneT / 0.45) : Math.min(1, this.time / 0.35);
    const sx = SC.x - tw / 2;
    const sy = SC.y - th / 2;
    ctx.fillStyle = '#060a08';
    ctx.fillRect(sx, sy, tw, th);
    if (open > 0) {
      const oh = Math.max(1, Math.round(th * open * open));
      const ow = lost && open < 0.15 ? Math.round(tw * (open / 0.15)) : tw;
      ctx.drawImage(this.trail, (tw - ow) / 2, (th - oh) / 2, ow, oh, sx + (tw - ow) / 2, sy + (th - oh) / 2, ow, oh);
      if (open < 1) {
        ctx.fillStyle = 'rgba(220,255,240,0.8)';
        ctx.fillRect(sx + (tw - ow) / 2, SC.y, ow, 1);
        glow(ctx, SC.x, SC.y, 60 * open + 10, '#8affe0', 0.4);
      }
    } else if (lost && this.doneT < 0.8) glow(ctx, SC.x, SC.y, 8, '#ffffff', 0.8 * (1 - this.doneT / 0.8));
    // glass: a sheen, the cockpit's window reflected faintly, scanlines and dark corners
    ctx.save();
    ctx.translate(sx, sy);
    glow(ctx, tw * 0.28, th * 0.2, 80, '#4a8a7a', 0.12);
    ctx.fillStyle = 'rgba(200,160,255,0.035)';
    ctx.fillRect(tw * 0.58, 0, 26, th);
    ctx.fillRect(tw * 0.58 + 32, 0, 8, th);
    if (dead && this.lock > 0) glow(ctx, tw / 2, th / 2, 130, '#ffd04a', 0.08 + Math.min(0.12, this.streak * 0.015));
    if (this.warn > 0) {
      glow(ctx, warnF * tw, th / 2, 60, '#ff3a3a', 0.25);
      if (Math.floor(t * 10) % 2) drawText(ctx, 'JAMMER INCOMING', tw / 2, 5, '#ff6a5a', { align: 'center' });
    }
    scanlines(ctx, tw, th, 0.2);
    vignette(ctx, tw, th, 0.75);
    // the prompt: a pill along the bottom of the glass, wrapped to fit
    if (this.tip && this.wordT <= 0) {
      const tp = this.tip;
      const lines = wrap(tp.text, tw - 24);
      const pw = Math.max(...lines.map((l) => l.length)) * 6 + 12;
      const ph = lines.length * 9 + 4;
      const py = th - ph - 6;
      ctx.globalAlpha = Math.min(1, tp.t * 4, tp.up * 8);
      ctx.fillStyle = 'rgba(6,10,10,0.88)';
      ctx.fillRect(Math.round(tw / 2 - pw / 2), py, pw, ph);
      ctx.fillStyle = tp.col;
      ctx.fillRect(Math.round(tw / 2 - pw / 2), py, pw, 1);
      ctx.fillRect(Math.round(tw / 2 - pw / 2), py + ph - 1, pw, 1);
      lines.forEach((l, k) => drawText(ctx, l, tw / 2, py + 3 + k * 9, tp.up < 0.3 && Math.floor(tp.up * 20) % 2 ? '#ffffff' : tp.col, { align: 'center' }));
      ctx.globalAlpha = 1;
    }
    if (this.streak >= 2) drawText(ctx, `×${this.streak}`, tw - 5, 5, this.streak >= 6 ? '#ffd04a' : '#fff0a0', { align: 'right', scale: this.streak >= 6 ? 2 : 1 });
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    // the tube's rim: gold while locking, orange when slipping, red when the jammer comes
    const frameCol =
      this.warn > 0
        ? `rgba(255,70,60,${0.4 + Math.sin(t * 30) * 0.3})`
        : this.slipping
          ? `rgba(255,138,58,${0.5 + Math.sin(t * 30) * 0.3})`
          : this.fading
            ? 'rgba(200,232,106,0.45)'
            : this.lock > 0
              ? `rgba(255,208,74,${0.3 + this.lock * 0.4 + Math.sin(t * 20) * 0.15})`
              : null;
    if (frameCol) {
      ctx.strokeStyle = frameCol;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, tw - 2, th - 2);
    }
    this.dial(ctx, t);
    this.panel(ctx, t, m, warm);
    // the desk the set stands on
    ctx.fillStyle = DARK;
    ctx.fillRect(0, h - 8, w, 8);
    ctx.fillStyle = '#3a2a22';
    ctx.fillRect(0, h - 7, w, 7);
    ctx.fillStyle = '#6a4a38';
    ctx.fillRect(0, h - 7, w, 1);
    // the pilot's hand on the knob
    drawSprite(ctx, 'tune', 'glove', KNOB.x, KNOB.y, { clip: 'turn', frame: this.knobFrame() });
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The knob turns a detent (30 degrees, twelve frames) for every tenth of the dial. */
  private knobFrame() {
    const k = (this.f * 120) % 12;
    return Math.floor(k < 0 ? k + 12 : k);
  }

  /** Under the tube: the backlit frequency dial with its red needle, and the voices' lamps. */
  private dial(ctx: CanvasRenderingContext2D, t: number) {
    const dw = SCR_W - 2;
    const dx = SC.x - dw / 2;
    const dy = SC.y + 87;
    ctx.fillStyle = '#e8d8a8';
    ctx.fillRect(dx, dy, dw, 14);
    ctx.fillStyle = '#c8b888';
    ctx.fillRect(dx, dy + 11, dw, 3);
    for (let k = 0; k <= 46; k++) {
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(dx + 4 + Math.round((k / 46) * (dw - 8)), dy + 1, 1, k % 5 === 0 ? 5 : 3);
    }
    for (let k = 1; k <= 5; k++) drawText(ctx, `${k}`, dx + 4 + ((k - 0.8) / 4.6) * (dw - 8), dy + 6, '#5a3a1a', { align: 'center', shadow: false });
    const nx = dx + 4 + Math.round(((this.f - 0.8) / 4.6) * (dw - 8));
    ctx.fillStyle = '#c82a2a';
    ctx.fillRect(nx, dy - 1, 2, 16);
    glow(ctx, dx + dw / 2, dy + 7, 70, '#ffd890', 0.18);
    // the voices: lamps that show how clear each came through
    const n = this.voices.length;
    const ly = SC.y + 109;
    const lx = SC.x - (n * 20) / 2;
    this.voices.forEach((_, k) => {
      const got = this.got[k];
      const x = lx + k * 20 + 3;
      const gr = got !== undefined ? grade(got) : null;
      ctx.fillStyle = gr ? GRADE_COL[gr] : k === this.at ? (Math.floor(t * 3) % 2 ? '#ff6ac8' : '#7a2a5a') : '#2a2a1c';
      ctx.fillRect(x, ly, 14, 8);
      if (gr) {
        drawText(ctx, gr, x + 7, ly + 1, DARK, { align: 'center', shadow: false });
        glow(ctx, x + 7, ly + 4, 10, GRADE_COL[gr], 0.3);
      }
    });
  }

  /** The control panel: the signal meter's needle, the lock tube, the grille, the knob, the phase slider. */
  private panel(ctx: CanvasRenderingContext2D, t: number, m: number, warm: number) {
    // the meter: a cream face with a scale, a red band for the dead-on, and a swinging needle
    const [mx, my, mw, mh] = [PN.x + METER[0], PN.y - METER[1], METER[2], METER[3]];
    const face = ctx.createLinearGradient(0, my - mh / 2, 0, my + mh / 2);
    face.addColorStop(0, '#f0e4bc');
    face.addColorStop(1, '#c8b488');
    ctx.fillStyle = face;
    ctx.fillRect(mx - mw / 2, my - mh / 2, mw, mh);
    const pivX = mx;
    const pivY = my + mh / 2 + 6;
    const ang = (v: number) => -Math.PI / 2 + (v - 0.5) * 1.6;
    for (let k = 0; k <= 20; k++) {
      const v = k / 20;
      const a = ang(v);
      const r0 = k % 5 === 0 ? 34 : 37;
      ctx.strokeStyle = v >= PERFECT ? '#c82a2a' : v >= IN ? '#3a7a4a' : '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(pivX + Math.cos(a) * r0) + 0.5, Math.round(pivY + Math.sin(a) * r0) + 0.5);
      ctx.lineTo(Math.round(pivX + Math.cos(a) * 40) + 0.5, Math.round(pivY + Math.sin(a) * 40) + 0.5);
      ctx.stroke();
    }
    drawText(ctx, 'SIGNAL', mx, PN.y - 91 - 3, '#3a2a1a', { align: 'center', shadow: false });
    const c = this.clarity();
    if (c !== null && this.lock > 0 && this.outcome === null) {
      const gr = grade(c);
      drawText(ctx, gr, mx + mw / 2 - 6, my - mh / 2 + 3, GRADE_COL[gr], { align: 'right', scale: 2 });
    }
    // the needle lags the signal a little and shivers in static
    this.needle += (m - this.needle) * 0.25;
    const nv = Math.max(0, Math.min(1.02, this.needle + (this.staticT > 0 ? (this.fx.rand() - 0.5) * 0.3 : 0) + (this.warn > 0 ? Math.sin(t * 50) * 0.03 : 0)));
    const na = ang(nv);
    ctx.strokeStyle = '#1a1008';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pivX, pivY);
    ctx.lineTo(pivX + Math.cos(na) * 42, pivY + Math.sin(na) * 42);
    ctx.stroke();
    ctx.strokeStyle = nv >= PERFECT ? '#c82a2a' : '#3a2a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pivX, pivY);
    ctx.lineTo(pivX + Math.cos(na) * 42, pivY + Math.sin(na) * 42);
    ctx.stroke();
    // the face's lamp, and the glass over it
    glow(ctx, mx, my, 70, '#ffd890', 0.12 * warm);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(mx - mw / 2, my - mh / 2, mw, 6);
    // the lock tube: an amber phosphor bar that fills
    const [lx, ly, lw, lh] = [PN.x + LOCK[0] - LOCK[2] / 2, PN.y - LOCK[1] - LOCK[3] / 2, LOCK[2], LOCK[3]];
    ctx.fillStyle = '#140c06';
    ctx.fillRect(lx, ly, lw, lh);
    const lc = this.slipping ? (Math.floor(t * 12) % 2 ? '#ff8a3a' : '#ff5a4a') : this.fading ? '#c8e86a' : '#ffd04a';
    const fill = Math.round(lw * this.lock);
    if (fill > 0) {
      ctx.fillStyle = lc;
      ctx.fillRect(lx, ly + 1, fill, lh - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(lx, ly + 2, fill, 1);
      glow(ctx, lx + fill, ly + lh / 2, 14, lc, 0.6);
    }
    if (this.outcome === null && m > IN && this.lock === 0 && Math.floor(t * 3) % 2) drawText(ctx, 'HOLD!', lx + lw / 2, ly - 1, '#8affb0', { align: 'center' });
    // the grille: the voice comes through it, lighting the slots pink and shaking the cone
    const voice = this.outcome === null ? Math.max(0, (m - EDGE) / (1 - EDGE)) : 0;
    if (voice > 0) {
      const j = Math.round(Math.sin(t * 60) * voice);
      glow(ctx, PN.x + 78 + j, PN.y - 55, 30, '#ff9ad8', voice * 0.35 * (0.7 + Math.sin(t * 23) * 0.3));
    }
    // the knob, on its dish
    drawSprite(ctx, 'tune', 'knob', KNOB.x, KNOB.y, { clip: 'turn', frame: this.knobFrame() });
    // the phase slider's thumb rides its slot, wrapping round
    const [px, pyc, , ph] = [PN.x + SLOT[0], PN.y - SLOT[1], SLOT[2], SLOT[3]];
    const u = (((this.p / (Math.PI * 2)) % 1) + 1) % 1;
    const ty = Math.round(pyc + ph / 2 - 6 - u * (ph - 12));
    glow(ctx, px, ty, 14, '#8affe0', 0.15 * warm);
    drawSprite(ctx, 'tune', 'thumb', px, ty);
    // the plates' engraving
    drawText(ctx, 'TUNE', KNOB.x, KNOB.y + 39, '#3a2a1a', { align: 'center', shadow: false });
    drawText(ctx, 'PHASE', px, pyc - ph / 2 - 13, '#3a2a1a', { align: 'center', shadow: false });
  }
}
