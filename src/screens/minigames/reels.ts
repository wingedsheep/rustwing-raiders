import { audio } from "../../audio";
import { drawText } from "../../ui/font";
import { DARK } from "../../ui/hud";
import { rng, shuffle, type Rng } from "../../util";
import { byLevel, Fx, glow, hardness, type Minigame, type Pad } from "./common";

/** The symbols on Spoke's reels: cog (the jackpot), star, skull, bolt, moon. */
const SYMBOLS = ["COG", "STAR", "SKULL", "BOLT", "MOON"] as const;
type Sym = (typeof SYMBOLS)[number];
const COLOUR: Record<Sym, string> = {
  COG: "#ffd04a",
  STAR: "#3ac8b0",
  SKULL: "#8a8098",
  BOLT: "#3a9ae8",
  MOON: "#a070e0",
};
const SHADE: Record<Sym, string> = {
  COG: "#b07a1a",
  STAR: "#1a7a6a",
  SKULL: "#4a4458",
  BOLT: "#1a5a9a",
  MOON: "#5a3a9a",
};
const ICON: Record<Sym, string[]> = {
  COG: [
    "..#.#..",
    ".#####.",
    "##...##",
    ".#.#.#.",
    "##...##",
    ".#####.",
    "..#.#..",
  ],
  STAR: [
    "...#...",
    "...#...",
    "#######",
    ".#####.",
    "..###..",
    ".##.##.",
    "##...##",
  ],
  SKULL: [
    ".#####.",
    "#######",
    "#..#..#",
    "#######",
    ".##.##.",
    ".#####.",
    ".#.#.#.",
  ],
  BOLT: [
    "....##.",
    "...##..",
    "..##...",
    ".#####.",
    "...##..",
    "..##...",
    ".##....",
  ],
  MOON: [
    "..###..",
    ".##....",
    "##.....",
    "##.....",
    "##.....",
    ".##....",
    "..###..",
  ],
};

/** How far past its symbol a stopping reel runs before it settles back, in symbols. */
const OVER = 0.2;
/** A reel left spinning this long stops itself, wherever it is. */
const FUSE = 5;
/** The middle of reel k, across the game. */
const reelX = (k: number) => 109 + k * 119;

/** A reel slowing to a stop: where from, where to, how far along (0..1), and how it eases. */
interface Stop {
  from: number;
  to: number;
  k: number;
  dur: number;
  settle: number;
  /** A long, teasing crawl on the last reel when a match is one symbol away. */
  crawl: boolean;
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
 * Spoke's reels: three of them, spinning; press the button to stop each in turn. A reel doesn't
 * stop dead: it runs on two symbols and thunks into place, so the symbol you get is the one
 * crossing the brass notches at the top of the window when you press. Read the strip, don't
 * count a rhythm: from TRICKY up the reels surge and sag, and from VICIOUS they hitch. Spoke
 * cheats: when a reel lands on a cog or makes a match, his tin hand may reach in to nudge it a
 * symbol off. Throw the stick to slap it away before it moves the reel, but slap at nothing and
 * you rock the cabinet and jolt whatever's still spinning. Two alike pay, three pay more, three
 * cogs pays most; if the first two match, the last reel runs hot. Higher levels: faster reels,
 * fewer cogs, a quicker and greedier hand.
 */
export class Reels implements Minigame {
  readonly title = "SPOKE'S REELS";
  readonly how =
    "PRESS TO STOP EACH REEL: YOU GET THE SYMBOL CROSSING THE NOTCHES. WHEN SPOKE'S HAND REACHES IN, THROW THE STICK TO SLAP IT. NOT BEFORE.";
  result: number | null = null;
  private readonly d: number;
  private strips: Sym[][] = [];
  private pos = [0, 0, 0];
  private speed: number[];
  private stops: (Stop | null)[] = [null, null, null];
  private stopped = [false, false, false];
  /** A stopped reel being shoved a symbol (by Spoke), easing to its new place. */
  private shove: ({ from: number; to: number; t: number } | null)[] = [
    null,
    null,
    null,
  ];
  private at = 0;
  private wait = 0;
  private time = 0;
  private since = 0;
  private hot = false;
  private lever = 0;
  private win: Sym | null = null;
  // the reels' moods: a surge and sag, and the odd hitch
  private wob: { ph: number; rate: number }[] = [];
  private readonly wobble: number;
  private hitch = [0, 0, 0];
  private hitchT = [0, 0, 0];
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
  private r: Rng;
  private fx = new Fx();

  constructor(level: number, seed: number) {
    const r = rng(seed);
    this.r = r;
    const d = (this.d = hardness(level));
    for (let k = 0; k < 3; k++) {
      // two of everything else, and cogs: two a strip when it's easy, one when it isn't, and from
      // vicious up an extra skull to water it down
      const s: Sym[] = [
        "STAR",
        "STAR",
        "SKULL",
        "SKULL",
        "BOLT",
        "BOLT",
        "MOON",
        "MOON",
        "COG",
      ];
      if (level <= 1) s.push("COG");
      if (level >= 4) s.push("SKULL");
      this.strips.push(shuffle(r, s));
      this.pos[k] = r() * s.length;
      this.wob.push({ ph: r() * 6, rate: 4 + r() * 5 });
      this.hitchT[k] = 1 + r() * 2;
    }
    const base = byLevel(d, 6.5, 13);
    this.speed = [base, base * 1.08, base * 1.16];
    this.wobble = level >= 2 ? byLevel(d, 0, 0.45) : 0;
    this.greed = byLevel(d, 0.3, 0.85);
    this.reach = byLevel(d, 1.0, 0.55);
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

  /** How fast reel k is turning right now, with its surges and hitches. */
  private rate(k: number) {
    const w = this.wob[k];
    let v = this.speed[k] * (k === 2 && this.hot ? 1.2 : 1);
    v *=
      1 +
      this.wobble *
        Math.sin(this.time * w.rate * 0.5 + w.ph) *
        (0.7 + 0.3 * Math.sin(this.time * w.rate * 0.23));
    if (this.hitch[k] > 0.14) v *= 0.15;
    else if (this.hitch[k] > 0) v *= 1.85;
    return v;
  }

  status() {
    if (this.result !== null)
      return this.win === "COG"
        ? "JACKPOT!"
        : this.result >= 0.7
          ? "THREE ALIKE!"
          : this.result > 0
            ? "A PAIR. A WIN!"
            : "NOTHING. SPOKE GRINS.";
    if (this.nudge && !this.nudge.slapped) return "HIS HAND! THROW THE STICK!";
    if (this.at >= 3) return "AND THE REELS SAY...";
    const want = this.wanted();
    return `REEL ${this.at + 1}: PRESS TO STOP${want ? `  WANT: ${want}` : ""}${this.hot ? "  ONE MORE!" : ""}`;
  }

  /** What the reel being stopped would like to land on, from where the others are ending up. */
  private wants(): Sym[] {
    const s = [0, 1, 2].filter((k) => k < this.at).map((k) => this.final(k));
    return s.length ? [...new Set(s)] : ["COG"];
  }

  private wanted(): string | null {
    return this.at === 0 ? null : this.wants().join(" OR ");
  }

  breakdown(): [string, string][] {
    const line = [this.sym(0), this.sym(1), this.sym(2)];
    const k =
      this.result === null
        ? 0
        : this.result >= 1
          ? 10
          : this.result >= 0.7
            ? 5
            : this.result > 0
              ? 2
              : 0;
    const rows: [string, string][] = [["LINE", line.join(" ")]];
    rows.push([
      "HIS HAND",
      this.nudges ? `SLAPPED ${this.slaps}/${this.nudges}` : "KEPT TO ITSELF",
    ]);
    if (this.jolts) rows.push(["JOLTS", `${this.jolts}`]);
    rows.push(["PAYS", k ? `×${k}` : "NOTHING"]);
    return rows;
  }

  update(dt: number, pad: Pad) {
    const fx = this.fx;
    if (fx.frozen(dt)) return;
    this.lever = Math.max(0, this.lever - dt * 4);
    this.grin = Math.max(0, this.grin - dt);
    for (let k = 0; k < 3; k++)
      this.kick[k] = Math.max(0, this.kick[k] - dt * 8);
    if (this.result !== null) {
      // the win keeps raining a while
      if (
        this.result >= 0.7 &&
        this.time < this.wait + 2.5 &&
        fx.rand() < (this.result >= 1 ? 0.6 : 0.25)
      )
        this.coin(240 + (fx.rand() - 0.5) * 300, -4);
      this.time += dt;
      return;
    }
    this.time += dt;
    this.since += dt;
    // stop the next reel, on the button or when its fuse burns down: before the reels move on,
    // so you get what you saw
    if (this.at < 3 && (pad.press || this.since > FUSE) && this.time > 0.3)
      this.stopReel(this.at, this.since > FUSE);
    for (let k = 0; k < 3; k++) {
      const sv = this.shove[k];
      if (sv) {
        sv.t = Math.min(1, sv.t + dt / 0.16);
        const e = 1 + 2.2 * (sv.t - 1) ** 3 + 1.2 * (sv.t - 1) ** 2;
        this.pos[k] = sv.from + (sv.to - sv.from) * e;
        if (sv.t >= 1) {
          this.pos[k] = sv.to;
          this.shove[k] = null;
        }
        continue;
      }
      if (this.stopped[k]) continue;
      const s = this.stops[k];
      if (s && s.k < 1) {
        // slowing from full speed, running a little past...
        s.k = Math.min(1, s.k + dt / s.dur);
        const ease = s.crawl ? 1 - (1 - s.k) ** 4 : 1 - (1 - s.k) ** 2;
        const p0 = this.pos[k];
        this.pos[k] = s.from + (s.to + OVER - s.from) * ease;
        if (s.crawl && Math.round(p0) !== Math.round(this.pos[k]))
          audio.play("ui_move", { pitch: 0.8 + s.k * 0.6, vol: 0.6 });
        if (s.k >= 1) {
          fx.shake(2, 0.12);
          audio.play("block", { pitch: 1.4, vol: 0.7 });
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
      } else {
        // spinning: surging and sagging, and now and then a hitch
        if (this.d >= 0.7) {
          this.hitchT[k] -= dt;
          if (this.hitchT[k] <= 0) {
            this.hitch[k] = 0.28;
            this.hitchT[k] = byLevel(this.d, 2.6, 0.8) + this.r() * 1.4;
            this.kick[k] = 1;
          }
        }
        this.hitch[k] = Math.max(0, this.hitch[k] - dt);
        this.pos[k] += dt * this.rate(k);
      }
    }
    this.hand(dt, pad);
    if (
      this.stopped.every(Boolean) &&
      !this.nudge &&
      !this.shove.some(Boolean)
    ) {
      this.wait += dt;
      if (this.wait > 0.5) this.pay();
    }
  }

  /** Press: reel k runs on two symbols and stops. On the last reel, a near thing crawls in. */
  private stopReel(k: number, fused: boolean) {
    const v = Math.max(this.rate(k), this.speed[k] * 0.5);
    const to = Math.floor(this.pos[k]) + 2;
    const dist = to + OVER - this.pos[k];
    let crawl = false;
    if (k === 2) {
      // would it match, or is a match one symbol either side? then make them sweat
      const a = this.final(0);
      const b = this.final(1);
      const hits = (s: Sym) => s === a || s === b;
      crawl =
        hits(this.symAt(2, to)) ||
        hits(this.symAt(2, to - 1)) ||
        hits(this.symAt(2, to + 1));
    }
    this.stops[k] = {
      from: this.pos[k],
      to,
      k: 0,
      dur: (dist / v) * (crawl ? 4 : 2),
      settle: 0,
      crawl,
    };
    this.hitch[k] = 0;
    this.at++;
    this.since = 0;
    this.lever = 1;
    audio.play("ui_select", { pitch: fused ? 0.6 : 0.8 });
    if (fused)
      this.fx.word("TOO SLOW", reelX(k), 178, "#ff8a3a", 1, { pop: true });
  }

  /** A reel came to rest: cogs ping, a pair heats the last reel, and Spoke may reach for it. */
  private landed(k: number) {
    const fx = this.fx;
    const x = reelX(k);
    const s = this.sym(k);
    if (s === "COG") {
      fx.ring(x, 96, 40, "#ffd04a", 0.3);
      fx.burst(x, 96, 12, 90, ["#ffd04a", "#fff0a0"]);
      audio.play("pickup_scrap", { pitch: 1.2 + k * 0.15 });
    }
    this.checkHot();
    if (k === 1 && this.hot) {
      audio.play("risk_up");
      fx.word("ONE MORE!", reelX(2), 178, "#ff8a3a", 2, { pop: true });
    }
    const st = this.stops[2];
    if (k === 2 && st?.crawl) {
      const a = this.sym(0);
      const b = this.sym(1);
      if (s !== a && s !== b) {
        fx.word("SO CLOSE!", 240, 178, "#ff8a3a", 2, { pop: true, life: 1.2 });
        this.grin = 1.2;
      }
    }
    // Spoke's hand: cogs and matches tempt it
    const worthy =
      s === "COG" ||
      (k >= 1 && s === this.sym(0) && this.stopped[0]) ||
      (k === 2 && s === this.sym(1));
    if (worthy && !this.nudge && !this.tried[k] && this.r() < this.greed) {
      this.tried[k] = true;
      this.nudge = {
        k,
        t: this.reach,
        max: this.reach,
        dir: this.r() < 0.5 ? -1 : 1,
        slapped: 0,
      };
      this.nudges++;
      audio.play("hook", { pitch: 1.4 });
    }
  }

  /** Where reel k will end up: on its stop, if it's still slowing. */
  private final(k: number): Sym {
    const s = this.stops[k];
    return !this.stopped[k] && s ? this.symAt(k, s.to) : this.sym(k);
  }

  private checkHot() {
    this.hot =
      this.stopped[0] && this.stopped[1] && this.sym(0) === this.sym(1);
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
        fx.ring(x, 40, 50, "#ffffff", 0.3);
        fx.burst(x, 40, 14, 120, ["#ffffff", "#c8c8d0", "#ffd04a"]);
        fx.word("SLAPPED!", x, 52, "#8affb0", 2, { pop: true });
        audio.play("parry");
        return;
      }
      // nothing to slap: the cabinet rocks, and whatever's spinning lurches
      const spin = [0, 1, 2].filter((k) => !this.stopped[k] && !this.stops[k]);
      fx.shake(3, 0.15);
      audio.play("hit_armor", { pitch: 0.8, vol: 0.6 });
      if (spin.length) {
        this.jolts++;
        for (const k of spin) {
          this.pos[k] += 0.4 + this.r() * 0.8;
          this.kick[k] = 1;
        }
        fx.word("JOLT!", x, 52, "#ff8a3a", 1, { pop: true });
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
        fx.word("NUDGED!", reelX(k), 52, "#ff5a4a", 2, { pop: true });
        audio.play("block", { pitch: 0.7 });
        audio.play("ui_error", { vol: 0.5 });
        // shove first, then see what's on the line
        this.pos[k] = from + n.dir;
        this.checkHot();
        this.pos[k] = from;
      }
    }
  }

  /** All three in: pay out, and make a show of it. */
  private pay() {
    const fx = this.fx;
    const s = [this.sym(0), this.sym(1), this.sym(2)];
    const same = s[0] === s[1] && s[1] === s[2];
    this.result =
      same && s[0] === "COG"
        ? 1
        : same
          ? 0.7
          : s[0] === s[1] || s[1] === s[2] || s[0] === s[2]
            ? 0.4
            : 0;
    this.win = same
      ? s[0]
      : s[0] === s[1] || s[0] === s[2]
        ? s[0]
        : s[1] === s[2]
          ? s[1]
          : null;
    this.wait = this.time;
    if (this.result >= 1) {
      fx.stop(0.3);
      fx.shake(6, 0.8);
      fx.flash("#ffd04a", 0.45);
      fx.ring(240, 96, 220, "#ffd04a", 0.6);
      fx.ring(240, 96, 140, "#ffffff", 0.4);
      fx.ring(240, 96, 300, "#ff8a3a", 0.9);
      fx.word("JACKPOT!", 240, 70, "#fff0a0", 4, { pop: true, life: 2.2 });
      for (let k = 0; k < 90; k++)
        this.coin(240 + (fx.rand() - 0.5) * 200, 110);
      audio.play("perfect");
      audio.play("loot_legendary");
    } else if (this.result >= 0.7) {
      fx.stop(0.15);
      fx.shake(4, 0.4);
      fx.flash("#fff0c0", 0.3);
      fx.ring(240, 96, 180, "#ffd04a", 0.5);
      fx.word("THREE ALIKE!", 240, 70, "#ffd04a", 3, { pop: true, life: 1.8 });
      for (let k = 0; k < 50; k++)
        this.coin(240 + (fx.rand() - 0.5) * 200, 110);
      audio.play("loot_epic");
    } else if (this.result > 0) {
      fx.stop(0.06);
      fx.flash("#fff0c0", 0.15);
      fx.ring(240, 96, 120, "#ffd04a", 0.35);
      fx.word("A PAIR!", 240, 70, "#ffd04a", 2, { pop: true, life: 1.4 });
      for (let k = 0; k < 18; k++)
        this.coin(240 + (fx.rand() - 0.5) * 200, 110);
      audio.play("pickup_part");
    } else {
      this.grin = 2;
      fx.word("HEH HEH.", 240, 70, "#8a8098", 2, { pop: true, life: 1.4 });
      audio.play("ui_error");
    }
  }

  /** A coin flung up from (x, y), falling. */
  private coin(x: number, y: number) {
    const fx = this.fx;
    const up = y > 0;
    fx.spark(
      x,
      y,
      (fx.rand() - 0.5) * 260,
      up ? -120 - fx.rand() * 220 : 20 + fx.rand() * 40,
      1.8,
      fx.rand() < 0.7 ? "#ffd04a" : "#ffffff",
      { size: 2, grav: 420, drag: 0.5 },
    );
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    // the back wall: a dim saloon
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#2a1608");
    bg.addColorStop(1, "#0e0804");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    glow(
      ctx,
      w / 2,
      20,
      220,
      "#ff9a3a",
      0.15 + (this.hot ? 0.08 + Math.sin(t * 12) * 0.04 : 0),
    );
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
    cab.addColorStop(0, "#5a3a1a");
    cab.addColorStop(0.15, "#a07a3a");
    cab.addColorStop(0.5, "#7a5226");
    cab.addColorStop(0.85, "#a07a3a");
    cab.addColorStop(1, "#4a2e12");
    ctx.fillStyle = DARK;
    ctx.fillRect(cx - 14, 6, cw + 28, h - 22);
    ctx.fillStyle = cab;
    ctx.fillRect(cx - 12, 8, cw + 24, h - 26);
    ctx.fillStyle = "#d0a85a";
    ctx.fillRect(cx - 12, 8, cw + 24, 2);
    // bulbs round the top: chasing, faster when hot, a mad race on a jackpot, dark on a loss
    const res = this.result;
    for (let k = 0; k < 14; k++) {
      const x = cx - 4 + k * 25;
      let on: boolean;
      let col = "#fff0a0";
      if (res === null) on = Math.floor(t * (this.hot ? 14 : 5) + k) % 3 === 0;
      else if (res >= 1) {
        on = Math.floor(t * 24 + k) % 2 === 0;
        col = ["#fff0a0", "#ff8a3a", "#8affe0", "#ff6ac8"][
          Math.floor(t * 8 + k) % 4
        ];
      } else if (res >= 0.7) on = Math.floor(t * 16 + k) % 3 !== 0;
      else if (res > 0) on = Math.floor(t * 10) % 2 === 0;
      else on = Math.floor(t * 1.5) % 2 === 0 && k % 4 === 0;
      ctx.fillStyle = on ? col : "#6a4a1a";
      ctx.fillRect(x, 14, 4, 4);
      if (on)
        glow(
          ctx,
          x + 2,
          16,
          res !== null && res >= 1 ? 12 : 8,
          col === "#fff0a0" ? "#ffd04a" : col,
          0.6,
        );
    }
    // rivets
    ctx.fillStyle = "#d0a85a";
    for (const y of [24, h - 30])
      for (const x of [cx - 8, cx + cw + 6]) ctx.fillRect(x, y, 2, 2);
    // the window
    ctx.fillStyle = "#1a0e06";
    ctx.fillRect(cx - 4, top - 4, cw + 8, cell * 3 + 8);
    for (let k = 0; k < 3; k++) {
      const x = cx + k * (rw + gap);
      const jig =
        this.kick[k] > 0 ? Math.round((fx.rand() - 0.5) * 3 * this.kick[k]) : 0;
      this.reel(ctx, k, x + jig, top, rw, cell, t);
      // a lamp under each reel
      const ly = top + cell * 3 + 6;
      ctx.fillStyle = this.stopped[k]
        ? "#ffd04a"
        : k === this.at && Math.floor(t * 4) % 2
          ? "#8affe0"
          : "#3a2410";
      ctx.fillRect(x, ly, rw, 3);
      if (k === this.at && res === null) {
        // what this reel wants, small, under it
        const want = this.wants();
        want.forEach((sym, i) =>
          this.icon(
            ctx,
            sym,
            x + rw / 2 + (i - (want.length - 1) / 2) * 20,
            ly + 17,
            2,
          ),
        );
        // the auto-stop fuse
        const f = Math.max(0, 1 - this.since / FUSE);
        ctx.fillStyle = f < 0.3 ? "#ff5a4a" : "#8a6a3a";
        ctx.fillRect(x, ly + 5, Math.round(rw * f), 1);
      }
      // the notches: the symbol crossing these when you press is the one you get
      const live = k === this.at && res === null;
      const nc = live ? "#fff0a0" : "#8a6a3a";
      ctx.fillStyle = nc;
      for (const nx of [x - 4, x + rw + 1]) {
        ctx.fillRect(nx, top - 1, 3, 3);
        ctx.fillRect(nx + 1, top + 2, 1, 1);
      }
      if (live) {
        ctx.fillStyle = "rgba(255,240,160,0.35)";
        ctx.fillRect(x, top, rw, 1);
        glow(ctx, x - 3, top, 6, "#fff0a0", 0.4);
        glow(ctx, x + rw + 2, top, 6, "#fff0a0", 0.4);
      }
    }
    // the payline, with arrows at each end
    const py = top + Math.round(cell * 1.5);
    const winning = res !== null && res > 0;
    ctx.fillStyle = winning
      ? Math.floor(t * 8) % 2
        ? "#ffffff"
        : "#ffd04a"
      : "rgba(255,90,74,0.85)";
    ctx.fillRect(cx - 6, py, cw + 12, 1);
    drawText(ctx, "→", cx - 12, py - 3, winning ? "#ffd04a" : "#ff5a4a", {
      shadow: false,
    });
    drawText(ctx, "←", cx + cw + 7, py - 3, winning ? "#ffd04a" : "#ff5a4a", {
      shadow: false,
    });
    if (winning)
      glow(
        ctx,
        cx + cw / 2,
        py,
        160,
        "#ffd04a",
        0.2 + (res! >= 1 ? 0.15 * Math.sin(t * 10) + 0.15 : 0),
      );
    // Spoke's hand, over the reel it's after
    if (this.nudge)
      this.drawHand(ctx, cx + this.nudge.k * (rw + gap) + rw / 2, top, t);
    // the lever on the side
    const lx = cx + cw + 22;
    const ly = 60 + Math.round(this.lever * 40);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(lx - 2, 56, 6, 110);
    ctx.fillStyle = "#c8c8d0";
    ctx.fillRect(lx, ly, 2, 110 - (ly - 56));
    ctx.fillStyle = DARK;
    ctx.fillRect(lx - 4, ly - 6, 10, 10);
    ctx.fillStyle = "#d82a2a";
    ctx.fillRect(lx - 3, ly - 5, 8, 8);
    ctx.fillStyle = "#ff8a7a";
    ctx.fillRect(lx - 2, ly - 4, 3, 2);
    // Spoke's eye, in the dark beside the cabinet: it narrows when he's pleased with himself
    const ex = cx - 34;
    const ey = 70;
    const eh = this.grin > 0 ? 1 : 3;
    ctx.fillStyle = "#ff5a4a";
    for (const dx of [0, 10]) ctx.fillRect(ex + dx, ey + (3 - eh), 5, eh);
    glow(ctx, ex + 7, ey + 2, 14, "#ff5a4a", 0.3 + (this.nudge ? 0.3 : 0));
    if (this.grin > 0)
      drawText(ctx, "HEH", ex + 7, ey + 8, "#8a6a5a", { align: "center" });
    // the paytable: the line you're on lights up
    const ty = h - 44;
    ctx.fillStyle = "#1a0e06";
    ctx.fillRect(cx, ty - 3, cw, 13);
    const paid =
      res === null ? -1 : res >= 1 ? 2 : res >= 0.7 ? 1 : res > 0 ? 0 : -1;
    const lines = ["2 ALIKE ×2", "3 ALIKE ×5", "3 COGS ×10"];
    lines.forEach((l, k) => {
      const x = cx + cw / 6 + (k * cw) / 3;
      const lit = paid === k && Math.floor(t * 6) % 2 === 0;
      if (paid === k) glow(ctx, x, ty + 3, 40, "#ffd04a", 0.35);
      drawText(
        ctx,
        l,
        x,
        ty,
        lit
          ? "#ffffff"
          : paid === k
            ? "#fff0a0"
            : paid >= 0
              ? "#8a6a3a"
              : "#ffd04a",
        { align: "center" },
      );
    });
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    fx.drawFlash(ctx, w, h);
  }

  /** Spoke's tin hand, reaching down into the window, or snatched back after a slap. */
  private drawHand(
    ctx: CanvasRenderingContext2D,
    x: number,
    top: number,
    t: number,
  ) {
    const n = this.nudge!;
    const reach =
      n.slapped > 0 ? n.slapped / 0.35 : Math.min(1, (n.max - n.t) / 0.15);
    const hy = Math.round(top - 26 + reach * 40);
    const hx = Math.round(x + (n.slapped > 0 ? 0 : Math.sin(t * 40) * 1.5));
    // the arm, from the dark above
    ctx.fillStyle = DARK;
    ctx.fillRect(hx - 4, 0, 9, hy);
    ctx.fillStyle = "#6a6478";
    ctx.fillRect(hx - 3, 0, 7, hy);
    ctx.fillStyle = "#8a8098";
    ctx.fillRect(hx - 3, 0, 2, hy);
    // the hand: a tin fist with brass knuckles, fingers hooked over the drum
    ctx.fillStyle = DARK;
    ctx.fillRect(hx - 9, hy - 1, 19, 14);
    ctx.fillStyle = n.slapped > 0 ? "#c86a6a" : "#a8a0b8";
    ctx.fillRect(hx - 8, hy, 17, 12);
    ctx.fillStyle = "#d0a85a";
    for (let k = 0; k < 4; k++) ctx.fillRect(hx - 7 + k * 4, hy + 9, 3, 2);
    ctx.fillStyle = "#c8c8d0";
    ctx.fillRect(hx - 8, hy, 17, 1);
    if (n.slapped > 0) return;
    // the warning, and how long before he shoves
    const f = n.t / n.max;
    glow(ctx, hx, hy + 6, 26, "#ff5a4a", 0.35 + Math.sin(t * 30) * 0.15);
    if (Math.floor(t * 12) % 2)
      drawText(ctx, "SLAP!", hx, hy + 16, "#ffffff", { align: "center" });
    ctx.fillStyle = DARK;
    ctx.fillRect(hx - 15, hy + 26, 31, 3);
    ctx.fillStyle = f < 0.35 ? "#ff5a4a" : "#ffd04a";
    ctx.fillRect(hx - 14, hy + 27, Math.round(29 * f), 1);
  }

  /** One drum: a paper strip with the symbols, curved by shading, blurred when it spins fast. */
  private reel(
    ctx: CanvasRenderingContext2D,
    k: number,
    x: number,
    top: number,
    rw: number,
    cell: number,
    t: number,
  ) {
    const hh = cell * 3;
    const strip = this.strips[k];
    const L = strip.length;
    ctx.fillStyle = "#f0e2c0";
    ctx.fillRect(x, top, rw, hh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, top, rw, hh);
    ctx.clip();
    const spinning = !this.stopped[k];
    const s = this.stops[k];
    const v =
      spinning && !s
        ? this.rate(k)
        : s && s.k < 1
          ? (1 - s.k) * this.rate(k)
          : 0;
    const blur = v / 4;
    const frac = this.pos[k] - Math.floor(this.pos[k]);
    // symbols run downwards: a later position is the next one in from the top
    for (let j = -2; j <= 2; j++) {
      const sym = strip[(((Math.floor(this.pos[k]) - j) % L) + L) % L];
      const y = Math.round(top + cell * 1.5 + (j + frac) * cell);
      if (blur > 0.4) {
        ctx.globalAlpha = 0.25;
        this.icon(ctx, sym, x + rw / 2, y - Math.round(blur * 6), 4);
        this.icon(ctx, sym, x + rw / 2, y + Math.round(blur * 6), 4);
        ctx.globalAlpha = 1;
      }
      const res = this.result;
      const win =
        res !== null &&
        res > 0 &&
        j === 0 &&
        sym === this.win &&
        Math.floor(t * 6) % 2 === 0;
      if (win) {
        ctx.fillStyle = "#fff8d0";
        ctx.fillRect(x + 4, y - cell / 2 + 2, rw - 8, cell - 4);
      }
      this.icon(ctx, sym, x + rw / 2, y, 4);
    }
    ctx.restore();
    // shading: the drum curves away top and bottom
    const g = ctx.createLinearGradient(0, top, 0, top + hh);
    g.addColorStop(0, "rgba(30,14,4,0.8)");
    g.addColorStop(0.28, "rgba(30,14,4,0)");
    g.addColorStop(0.45, "rgba(255,255,255,0.12)");
    g.addColorStop(0.72, "rgba(30,14,4,0)");
    g.addColorStop(1, "rgba(30,14,4,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(x, top, rw, hh);
    ctx.fillStyle = "rgba(30,14,4,0.35)";
    ctx.fillRect(x, top, 3, hh);
    ctx.fillRect(x + rw - 3, top, 3, hh);
    if (this.result !== null && this.result > 0 && this.sym(k) === this.win)
      glow(ctx, x + rw / 2, top + hh / 2, 50, COLOUR[this.win], 0.25);
  }

  private icon(
    ctx: CanvasRenderingContext2D,
    s: Sym,
    x: number,
    y: number,
    px: number,
  ) {
    const rows = ICON[s];
    const x0 = Math.round(x - (7 * px) / 2);
    const y0 = Math.round(y - (7 * px) / 2);
    const a = ctx.globalAlpha;
    ctx.fillStyle = "#2a1a0a";
    ctx.globalAlpha = a * 0.5;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++)
        if (rows[r][c] === "#")
          ctx.fillRect(x0 + c * px + 2, y0 + r * px + 2, px, px);
    ctx.globalAlpha = a;
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 7; c++) {
        if (rows[r][c] !== "#") continue;
        ctx.fillStyle = COLOUR[s];
        ctx.fillRect(x0 + c * px, y0 + r * px, px, px);
        // a lit top-left on each block, a shaded underside
        ctx.fillStyle = SHADE[s];
        ctx.fillRect(x0 + c * px, y0 + r * px + px - 1, px, 1);
      }
  }
}
