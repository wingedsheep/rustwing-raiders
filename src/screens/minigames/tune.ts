import { audio } from "../../audio";
import { drawText } from "../../ui/font";
import { DARK } from "../../ui/hud";
import { clamp, rng, type Rng } from "../../util";
import {
  byLevel,
  Fx,
  glow,
  hardness,
  meter,
  scanlines,
  ticked,
  timer,
  vignette,
  wrapAngle,
  type Minigame,
  type Pad,
} from "./common";

/** What comes through once a voice is clear. */
const SNATCHES = [
  "...MAYDAY, MAYDAY...",
  "...COORDINATES FOLLOW...",
  "...DO NOT DOCK...",
  "...CARGO IS INTACT...",
  "...ANYONE HEAR ME?...",
  "...THE CODE IS...",
  "...THEY OWE US...",
  "...KEEP SINGING...",
];

/** How alike the waves must be for the static to clear and the lock to take. */
const IN = 0.72;
/** Just off: holding here keeps the lock from draining much, but it muddies the clarity. */
const EDGE = 0.58;
/** Dead on: the lock fills faster, and every beat held here adds to a streak. */
const PERFECT = 0.9;
/** Tight enough at the moment a burst hits to ride it out. */
const RIDE = 0.86;

/** A held voice's clarity, from how well you tracked it: C, B or A. */
const grade = (worth: number) =>
  worth >= 0.88 ? "A" : worth >= 0.68 ? "B" : "C";
const GRADE_COL: Record<string, string> = {
  A: "#8affb0",
  B: "#c8e86a",
  C: "#ffd04a",
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
  readonly title = "TUNE IN";
  readonly how =
    "LEFT/RIGHT: FREQUENCY. UP/DOWN: PHASE. TRACK THE DRIFTING VOICE AND HOLD THE BUTTON TO LOCK IT. WHEN THE JAMMER BURSTS, BE DEAD ON.";
  result: number | null = null;
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
  private readonly fAmp: number;
  private readonly fRate: number;
  private readonly pRate: number;
  private readonly tolF: number;
  private readonly tolP: number;
  /** Seconds of good holding a lock needs. */
  private readonly need: number;
  // the jammer
  private burstT: number;
  private warn = 0;
  private staticT = 0;
  private readonly every: number;
  private readonly warnTime: number;
  private readonly knock: number;
  private bursts = 0;
  private ridden = 0;
  // the streak
  private streak = 0;
  private best = 0;
  private perfT = 0;
  private r: Rng;
  private fx = new Fx();
  private trail: HTMLCanvasElement | null = null;

  constructor(level: number, seed: number) {
    const r = rng(seed);
    this.r = r;
    const d = (this.d = hardness(level));
    const n = level <= 1 ? 2 : level <= 3 ? 3 : 4;
    let last = 2.6;
    for (let k = 0; k < n; k++) {
      // each voice well away from where you'll be tuned from
      let f = 1.3 + r() * 3.4;
      for (let tries = 0; Math.abs(f - last) < 1 && tries < 8; tries++)
        f = 1.3 + r() * 3.4;
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
    this.fAmp = byLevel(d, 0.14, 0.34);
    this.fRate = byLevel(d, 0.4, 0.75);
    this.pRate = byLevel(d, 0.16, 0.5);
    this.tolF = byLevel(d, 0.75, 0.66);
    this.tolP = byLevel(d, 1.1, 0.98);
    this.need = byLevel(d, 1.5, 2.0);
    this.every = byLevel(d, 9, 4.5);
    this.warnTime = byLevel(d, 1.1, 0.6);
    this.knock = byLevel(d, 0.9, 1.6);
    this.burstT = this.every * 0.6 + 2;
    this.limit = Math.round(6 + n * byLevel(d, 10, 8));
  }

  private target() {
    const v = this.voices[Math.min(this.at, this.voices.length - 1)];
    const T = this.time;
    const f =
      v.f +
      this.fAmp *
        (Math.sin(T * this.fRate + v.a) * 0.7 +
          Math.sin(T * this.fRate * 1.9 + v.b) * 0.3);
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
    return 0.5 + 0.5 * clamp((avg - 0.74) / 0.18, 0, 1);
  }

  /** The clarity of the lock so far. */
  private clarity() {
    return this.lockT > 0.05 ? this.worth(this.lockSum / this.lockT) : null;
  }

  status() {
    if (this.result !== null)
      return this.got.length === this.voices.length
        ? "ALL VOICES IN."
        : "THE STATIC TAKES THEM.";
    if (this.warn > 0) return "JAMMER! GET DEAD ON TO RIDE IT OUT";
    const m = this.match();
    const c = this.clarity();
    const tail =
      m > IN && this.lock === 0
        ? "  HOLD TO LOCK!"
        : this.slipping
          ? "  SLIPPING!"
          : this.fading
            ? "  FADING..."
            : c !== null
              ? `  CLARITY ${grade(c)}`
              : "";
    return `VOICE ${Math.min(this.at + 1, this.voices.length)}/${this.voices.length}  SIGNAL ${Math.round(m * 100)}%${tail}`;
  }

  breakdown(): [string, string][] {
    const rows: [string, string][] = [
      ["VOICES", `${this.got.length}/${this.voices.length}`],
    ];
    if (this.got.length) rows.push(["CLARITY", this.got.map(grade).join(" ")]);
    if (this.bursts) rows.push(["RODE OUT", `${this.ridden}/${this.bursts}`]);
    rows.push(["BEST STREAK", `×${this.best}`]);
    return rows;
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    if (this.result !== null) return;
    const fx = this.fx;
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time))
      audio.play("ui_move", { pitch: 1.5 });
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
    if (inside && !this.wasIn) audio.play("graze", { pitch: 1.2 });
    this.wasIn = inside;

    // the lock: fills while you hold it matched, holds (barely) at the edge, drains fast if you
    // slip right off, and fades if you let go
    const edge = pad.hold && !inside && m >= EDGE && this.lock > 0;
    const slip = pad.hold && !inside && !edge && this.lock > 0;
    this.fading = edge;
    if (slip && !this.slipping) {
      audio.play("graze", { pitch: 0.6, vol: 0.7 });
      fx.word("SLIPPING", 236, 150, "#ff8a3a");
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
        audio.play("ui_move", {
          pitch: 1 + Math.min(1.2, this.streak * 0.1),
          vol: 0.6,
        });
        if (this.streak === 1)
          fx.word("PERFECT", 236, 40, "#fff0a0", 1, { pop: true, life: 0.6 });
        else if (this.streak % 2 === 0)
          fx.word(
            `PERFECT ×${this.streak}`,
            236,
            40,
            this.streak >= 6 ? "#ffd04a" : "#fff0a0",
            this.streak >= 6 ? 2 : 1,
            { pop: true, life: 0.6 },
          );
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
      if (Math.floor(w0 * 6) !== Math.floor(this.warn * 6))
        audio.play("ui_move", { pitch: 0.7, vol: 0.5 });
      if (this.warn <= 0) {
        this.warn = 0;
        this.burst(m);
      }
    } else {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.warn = this.warnTime;
        this.burstT = this.every * (0.75 + this.r() * 0.5);
        audio.play("laser_charge", { pitch: 1.6, vol: 0.5 });
      }
    }

    if (this.lock >= 1) this.locked();
    if (this.result === null && this.time >= this.limit) {
      this.result = this.score();
      fx.word("LOST IT", 236, 80, "#ff5a4a", 2, { pop: true, life: 1.4 });
      audio.play("ui_error");
    }
  }

  /** The jammer's burst lands: ride it out dead on, or get knocked off. */
  private burst(m: number) {
    const fx = this.fx;
    this.bursts++;
    const side = this.r() < 0.5 ? -1 : 1;
    if (m >= RIDE) {
      this.ridden++;
      this.p += side * this.knock * 0.15;
      fx.stop(0.07);
      fx.ring(236, 90, 130, "#8affb0", 0.4);
      fx.word("RODE IT OUT!", 236, 70, "#8affb0", 2, { pop: true, life: 1 });
      fx.flash("#8affb0", 0.1);
      audio.play("parry");
    } else {
      this.p += side * this.knock;
      this.f = clamp(
        this.f + (this.r() - 0.5) * byLevel(this.d, 0.3, 0.8),
        0.8,
        5.4,
      );
      this.lock = Math.max(0, this.lock - 0.35);
      this.staticT = 0.45;
      this.streak = 0;
      fx.stop(0.05);
      fx.shake(4, 0.3);
      fx.flash("#ffffff", 0.15);
      fx.word("STATIC!", 236, 70, "#ff5a4a", 2, { pop: true, life: 0.9 });
      audio.play("lightning", { vol: 0.6 });
    }
  }

  /** A voice comes through: grade it, show what it said, and move on to the next. */
  private locked() {
    const fx = this.fx;
    const worth = this.worth(this.lockSum / Math.max(0.001, this.lockT));
    const g = grade(worth);
    this.got.push(worth);
    fx.stop(g === "A" ? 0.14 : 0.08);
    fx.ring(236, 90, 160, GRADE_COL[g], 0.45);
    if (g === "A") fx.ring(236, 90, 90, "#ffffff", 0.3);
    fx.word(
      g === "A" ? "CRYSTAL CLEAR" : g === "B" ? "CLEAR" : "CRACKLY",
      236,
      34,
      GRADE_COL[g],
      2,
      { pop: true, life: 1.2 },
    );
    fx.word(this.voices[this.at].said, 236, 60, "#ff9ad8", 1, { life: 1.6 });
    fx.burst(236, 90, g === "A" ? 40 : 20, 160, [GRADE_COL[g], "#ffffff"], {
      life: 0.7,
    });
    fx.flash(GRADE_COL[g], 0.2);
    audio.play("perfect", { vol: 0.6 + worth * 0.4 });
    this.lock = this.lockSum = this.lockT = 0;
    this.streak = this.perfT = 0;
    this.at++;
    // start the next search from wherever you are, a little knocked about, with a breather
    this.p += Math.PI * 0.7;
    this.burstT = Math.max(this.burstT, 2.5);
    if (this.at >= this.voices.length) {
      this.result = this.score();
      audio.play("level_clear", { vol: 0.6 });
    }
  }

  private score() {
    const n = this.voices.length;
    const sum = this.got.reduce((a, b) => a + b, 0);
    const partial = this.at < n ? this.match() * 0.15 + this.lock * 0.3 : 0;
    return Math.min(1, (sum + partial) / n);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    const sh = 186;
    // the bezel
    ctx.fillStyle = "#16120e";
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    ctx.fillStyle = "#2a2218";
    ctx.fillRect(4, 6, w - 8, sh + 4);
    // the scope, with phosphor that lingers
    if (!this.trail) {
      this.trail = document.createElement("canvas");
      this.trail.width = w - 16;
      this.trail.height = sh - 6;
    }
    const tw = this.trail.width;
    const th = this.trail.height;
    const g = this.trail.getContext("2d")!;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(4,16,12,0.35)";
    g.fillRect(0, 0, tw, th);
    // grid
    g.fillStyle = "rgba(30,80,60,0.25)";
    for (let x = 0; x < tw; x += 24) g.fillRect(x, 0, 1, th);
    for (let y = (th / 2) % 22; y < th; y += 22)
      g.fillRect(0, Math.round(y), tw, 1);
    g.fillStyle = "rgba(60,140,110,0.3)";
    g.fillRect(0, Math.round(th / 2), tw, 1);
    const m = this.match();
    const done = this.result !== null;
    const warnF = this.warn > 0 ? 1 - this.warn / this.warnTime : 0;
    // static: thick when you're off, thinning as the voice comes in, a storm in a burst
    const noise = done
      ? 20
      : Math.round(40 + (1 - m) * 260 + warnF * 160 + this.staticT * 1600);
    for (let k = 0; k < noise; k++) {
      g.fillStyle =
        fx.rand() < 0.5 ? "rgba(90,200,150,0.5)" : "rgba(40,110,80,0.6)";
      g.fillRect(
        Math.floor(fx.rand() * tw),
        Math.floor(fx.rand() * th),
        fx.rand() < 0.2 ? 2 : 1,
        1,
      );
    }
    // the jammer's sweep: a red band racing across before the burst
    if (this.warn > 0) {
      const bx = Math.round(warnF * tw);
      g.fillStyle = "rgba(255,60,60,0.22)";
      g.fillRect(bx - 18, 0, 18, th);
      g.fillStyle = "rgba(255,120,100,0.7)";
      g.fillRect(bx, 0, 2, th);
    }
    const mid = th / 2;
    const amp = th * 0.38;
    const tg = this.target();
    g.globalCompositeOperation = "lighter";
    const wave = (
      fq: number,
      ph: number,
      a: number,
      col: string,
      wd: number,
      jitter: number,
    ) => {
      g.strokeStyle = col;
      g.lineWidth = wd;
      g.beginPath();
      for (let x = 0; x <= tw; x += 2) {
        const u = (x / tw) * Math.PI * 2;
        const y =
          mid -
          Math.sin(u * fq + ph + t * 1.5) * amp * a +
          (jitter ? (fx.rand() - 0.5) * jitter : 0);
        if (x) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
      g.stroke();
    };
    if (!done || this.at < this.voices.length) {
      const jit = (1 - m) * 6 + this.staticT * 40;
      wave(tg.f, tg.p, tg.amp, "rgba(255,90,200,0.18)", 5, jit);
      wave(tg.f, tg.p, tg.amp, "rgba(255,140,220,0.9)", 1.5, jit);
    }
    const lit = m > IN;
    const dead = m >= PERFECT;
    const mine = this.staticT * 30;
    wave(
      this.f,
      this.p,
      0.88,
      dead
        ? "rgba(255,230,140,0.28)"
        : lit
          ? "rgba(138,255,176,0.2)"
          : "rgba(138,255,224,0.15)",
      dead ? 7 : 5,
      mine,
    );
    wave(
      this.f,
      this.p,
      0.88,
      dead
        ? "rgba(255,250,210,1)"
        : lit
          ? "rgba(200,255,220,0.95)"
          : "rgba(160,255,230,0.8)",
      1.2,
      mine,
    );
    ctx.drawImage(this.trail, 8, 10);
    // glass: a sheen, scanlines and dark corners
    ctx.save();
    ctx.translate(8, 10);
    glow(ctx, tw * 0.3, th * 0.2, 90, "#4a8a7a", 0.12);
    if (dead && this.lock > 0)
      glow(
        ctx,
        tw / 2,
        th / 2,
        160,
        "#ffd04a",
        0.08 + Math.min(0.12, this.streak * 0.015),
      );
    if (this.warn > 0) {
      glow(ctx, warnF * tw, th / 2, 70, "#ff3a3a", 0.25);
      if (Math.floor(t * 10) % 2)
        drawText(ctx, "JAMMER INCOMING", tw / 2, 6, "#ff6a5a", {
          align: "center",
        });
    }
    scanlines(ctx, tw, th, 0.2);
    vignette(ctx, tw, th, 0.7);
    // the streak, in the corner
    if (this.streak >= 2)
      drawText(
        ctx,
        `×${this.streak}`,
        tw - 6,
        6,
        this.streak >= 6 ? "#ffd04a" : "#fff0a0",
        { align: "right", scale: this.streak >= 6 ? 2 : 1 },
      );
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    // the frame: gold while locking, orange when slipping, red when the jammer comes
    const frameCol =
      this.warn > 0
        ? `rgba(255,70,60,${0.4 + Math.sin(t * 30) * 0.3})`
        : this.slipping
          ? `rgba(255,138,58,${0.5 + Math.sin(t * 30) * 0.3})`
          : this.fading
            ? "rgba(200,232,106,0.45)"
            : this.lock > 0
              ? `rgba(255,208,74,${0.3 + this.lock * 0.4 + Math.sin(t * 20) * 0.15})`
              : null;
    if (frameCol) {
      ctx.strokeStyle = frameCol;
      ctx.lineWidth = 2;
      ctx.strokeRect(9, 11, tw - 2, th - 2);
    }
    this.panel(ctx, w, sh, t, m);
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The receiver's face: the tuning dial, the signal lamps, the lock and the voices. */
  private panel(
    ctx: CanvasRenderingContext2D,
    w: number,
    sh: number,
    t: number,
    m: number,
  ) {
    const py = sh + 14;
    // the dial: a strip of frequencies with a red needle
    const dx = 10;
    const dw = 190;
    ctx.fillStyle = "#e8d8a8";
    ctx.fillRect(dx, py, dw, 22);
    ctx.fillStyle = "#c8b888";
    ctx.fillRect(dx, py + 18, dw, 4);
    for (let k = 0; k <= 46; k++) {
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(
        dx + 4 + Math.round((k / 46) * (dw - 8)),
        py + 2,
        1,
        k % 5 === 0 ? 7 : 4,
      );
    }
    for (let k = 1; k <= 5; k++)
      drawText(
        ctx,
        `${k}`,
        dx + 4 + ((k - 0.8) / 4.6) * (dw - 8),
        py + 11,
        "#5a3a1a",
        { align: "center", shadow: false },
      );
    const nx = dx + 4 + Math.round(((this.f - 0.8) / 4.6) * (dw - 8));
    ctx.fillStyle = "#c82a2a";
    ctx.fillRect(nx, py - 2, 2, 26);
    glow(ctx, dx + dw / 2, py + 10, 60, "#ffd890", 0.15);
    // signal lamps: the last two are the dead-on band
    const sx = dx + dw + 12;
    drawText(ctx, "SIGNAL", sx, py - 1, "#8a8098");
    for (let k = 0; k < 10; k++) {
      const on = m * 10 > k + 0.5;
      const col =
        k >= 9
          ? "#fff0a0"
          : k >= 7
            ? "#8affb0"
            : k >= 4
              ? "#ffd04a"
              : "#ff8a3a";
      ctx.fillStyle = on ? col : "#2a2218";
      ctx.fillRect(sx + k * 7, py + 10, 5, 8);
      if (on && k >= 7)
        glow(ctx, sx + k * 7 + 2, py + 14, k >= 9 ? 10 : 6, col, 0.4);
    }
    // the lock, and the clarity it's coming through at
    const lx = sx + 80;
    drawText(ctx, "LOCK", lx, py - 1, "#8a8098");
    const c = this.clarity();
    const lc = this.slipping
      ? Math.floor(t * 12) % 2
        ? "#ff8a3a"
        : "#ff5a4a"
      : "#ffd04a";
    meter(ctx, lx, py + 10, 74, 6, this.lock, lc, "#2a2218");
    if (this.lock > 0.02) glow(ctx, lx + 74 * this.lock, py + 13, 10, lc, 0.5);
    if (this.result === null) {
      if (m > IN && this.lock === 0 && Math.floor(t * 3) % 2)
        drawText(ctx, "HOLD!", lx + 37, py + 20, "#8affb0", {
          align: "center",
        });
      else if (c !== null && this.lock > 0) {
        const gr = grade(c);
        drawText(ctx, "CLARITY", lx, py + 20, "#8a8098");
        drawText(ctx, gr, lx + 52, py + 20, GRADE_COL[gr]);
      }
    }
    // the voices: lamps that show how clear each came through
    const n = this.voices.length;
    const vx = w - 10 - n * 19;
    drawText(ctx, "VOICES", vx, py - 1, "#8a8098");
    this.voices.forEach((_, k) => {
      const got = this.got[k];
      const x = vx + k * 19;
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 1, py + 9, 16, 12);
      const gr = got !== undefined ? grade(got) : null;
      ctx.fillStyle = gr
        ? GRADE_COL[gr]
        : k === this.at
          ? Math.floor(t * 3) % 2
            ? "#ff6ac8"
            : "#7a2a5a"
          : "#2a2218";
      ctx.fillRect(x, py + 10, 14, 10);
      if (gr) {
        drawText(ctx, gr, x + 7, py + 12, DARK, {
          align: "center",
          shadow: false,
        });
        if (gr === "A") glow(ctx, x + 7, py + 15, 10, GRADE_COL.A, 0.3);
      }
    });
  }
}
