import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { noise2, rng, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, nebula, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

/**
 * Keep it taut: a cable (or Nell's fuel hose) with something heavy on the other end. Hold the
 * button to pull harder, let go to ease off. The tension has weight to it (it climbs and falls
 * like Stardew's fishing bar), and the green band wanders as the load swings and narrows as the
 * tow goes on. In the green you tow; outside it the tow slips back; in the red the cable strains
 * and snaps.
 *
 * Inside the green is a bright core. Towing in the core is faster and builds a combo, and the
 * score is how much of the tow you did there, so riding the edge of the band only just passes.
 * When the load's lamp flashes it's about to lurch, and the band jumps the way the arrow shows.
 * Rocks drift in across the cable: a taut cable catches them (a snag: strain, a jolt, tow lost),
 * so before one crosses you ease off and let the cable sag under it, out of the green on purpose,
 * then pull back in. Higher levels: a narrower band and core that wander faster, heavier loads,
 * more and harder lurches, more rocks with less warning, and the tow slips back faster.
 */
export class Tow implements Minigame {
  readonly title = 'KEEP IT TAUT';
  readonly how = 'HOLD TO PULL, LET GO TO EASE OFF. TOW IN THE BRIGHT CORE FOR A COMBO. WHEN A ROCK COMES, LET THE CABLE SAG UNDER IT.';
  result: number | null = null;
  private tension = 0.3;
  private tv = 0;
  private progress = 0;
  private strain = 0;
  private time = 0;
  private readonly limit = 28;
  private readonly need = 10;
  private readonly d: number;
  private readonly band0: number;
  private readonly coreF: number;
  private readonly roam: number;
  private readonly roamSpeed: number;
  private readonly heavy: number;
  private readonly drain: number;
  private readonly strainRate: number;
  private snapped = false;
  private r: Rng;
  /** The band's resting centre and the jump the next lurch gives it. */
  private shift = 0;
  private nextLurch: number;
  /** Seconds of warning left before a lurch (or 0). */
  private tell = 0;
  private lurchDir = 1;
  private sway = 0;
  private inBand = false;
  private inCore = false;
  private warned = false;
  private fx = new Fx();
  private hold = false;
  /** Seconds in the core without a break, and the grace before a slip out breaks it. */
  private coreRun = 0;
  private coreOut = 0;
  private mult = 1;
  private bestMult = 1;
  /** Tow made, all of it and the part made in the core: the score is the share. */
  private gained = 0;
  private gainedCore = 0;
  /** The rock on its way in, and the wait for the next. */
  private rock: Rock | null = null;
  private nextRock: number;
  private rocks = 0;
  private snags = 0;
  private dodged = 0;
  /** A short kick on the cable after a snag, for the picture. */
  private twang = 0;
  private done = 0;

  constructor(
    level: number,
    private seed: number,
  ) {
    this.r = rng(seed);
    const d = (this.d = hardness(level));
    this.band0 = byLevel(d, 0.25, 0.16);
    this.coreF = byLevel(d, 0.42, 0.38);
    this.roam = byLevel(d, 0.1, 0.22);
    this.roamSpeed = byLevel(d, 0.28, 0.52);
    this.heavy = byLevel(d, 1, 1.3);
    this.drain = byLevel(d, 0.3, 0.6);
    this.strainRate = byLevel(d, 1.0, 1.5);
    this.nextLurch = byLevel(d, 3.4, 2.4) + this.r() * 1.5;
    this.nextRock = byLevel(d, 5.5, 3.6) + this.r() * 1.5;
  }

  private get pf() {
    return Math.min(1, this.progress / this.need);
  }

  /** The middle of the green band: it wanders, and lurches shove it. */
  private centre() {
    const drift = (noise2(this.time * this.roamSpeed, this.seed % 89) - 0.5) * 2 * this.roam;
    return Math.max(0.22, Math.min(0.76, 0.52 + drift + this.shift));
  }

  /** The green band's width: it narrows as the tow goes on. */
  private band() {
    return this.band0 * (1 - byLevel(this.d, 0.15, 0.25) * this.pf);
  }

  private get red() {
    return 0.92;
  }

  status() {
    if (this.snapped) return 'SNAPPED!';
    if (this.result !== null) return this.progress >= this.need ? 'TOWED CLEAR!' : 'OUT OF TIME';
    if (this.rock && !this.rock.done) return this.tension > this.rock.clear ? 'ROCK! EASE OFF, LET IT SAG UNDER' : 'ROCK! HOLD IT LOW...';
    if (this.tell > 0) return 'IT IS ABOUT TO LURCH!';
    const parts = [`TOWED ${Math.round(this.pf * 100)}%`];
    if (this.mult > 1) parts.push(`CORE X${this.mult}`);
    if (this.strain > 0.4) parts.push('EASE OFF!');
    else if (this.inBand && !this.inCore) parts.push('FIND THE CORE');
    return parts.join('  ');
  }

  breakdown(): [string, string][] {
    const share = this.gained > 0 ? this.gainedCore / this.gained : 0;
    const out: [string, string][] = [
      ['TOWED', this.snapped ? 'SNAPPED' : `${Math.round(this.pf * 100)}%`],
      ['IN THE CORE', `${Math.round(share * 100)}%`],
      ['ROCKS', this.rocks ? (this.snags ? `${this.dodged}/${this.rocks} CLEAR` : 'ALL CLEAR') : 'NONE'],
    ];
    if (this.progress >= this.need) out.push(['TIME LEFT', `${Math.max(0, this.limit - this.time).toFixed(1)}S`]);
    else out.push(['BEST COMBO', `X${this.bestMult}`]);
    return out;
  }

  update(dt: number, pad: Pad) {
    const fx = this.fx;
    if (fx.frozen(dt)) return;
    this.twang = Math.max(0, this.twang - dt * 3);
    if (this.rock?.done) {
      this.rock.after += dt;
      if (this.rock.after > 0.8) this.rock = null;
    }
    if (this.result !== null) {
      this.done += dt;
      this.sway *= Math.exp(-dt * 2);
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    this.hold = pad.hold;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });

    this.rocksUpdate(dt);
    this.lurches(dt);

    // the needle has weight: the button pulls it up, the load drags it down
    const up = 2.3 / this.heavy;
    const down = 1.7 * this.heavy;
    this.tv += (pad.hold ? up : -down) * dt;
    this.tv *= Math.exp(-dt * 1.1);
    this.tension += this.tv * dt;
    if (this.tension < 0) {
      this.tension = 0;
      this.tv = Math.max(0, -this.tv * 0.25);
    }
    if (this.tension > 1.1) {
      this.tension = 1.1;
      this.tv = Math.min(0, this.tv);
    }

    // where the needle sits: the core, the green, or out
    const c = this.centre();
    const b = this.band();
    const wasBand = this.inBand;
    const wasCore = this.inCore;
    const off = Math.abs(this.tension - c);
    this.inBand = off <= b / 2;
    this.inCore = off <= (b * this.coreF) / 2;
    if (this.inBand && !wasBand) audio.play('ui_place', { pitch: 1.2, vol: 0.4 });
    if (this.inCore && !wasCore) audio.play('ui_place', { pitch: 1.6, vol: 0.35 });

    // the combo: a run in the core steps it up; slip out for more than a breath and it's gone
    if (this.inCore) {
      this.coreOut = 0;
      this.coreRun += dt;
      const m = Math.min(4, 1 + Math.floor(this.coreRun / 1.2));
      if (m > this.mult) {
        this.mult = m;
        this.bestMult = Math.max(this.bestMult, m);
        const gx = this.gaugeX();
        fx.word(`CORE X${m}`, gx + 11, this.gaugeY(this.tension) - 10, m >= 4 ? '#ffffff' : '#c8ffd8', 1, { pop: true });
        fx.ring(gx + 11, this.gaugeY(this.tension), 18 + m * 4, '#8affb0');
        audio.play('reload_perfect', { pitch: 0.8 + m * 0.12, vol: 0.6 });
      }
    } else {
      this.coreOut += dt;
      if (this.coreOut > 0.35 && this.mult > 1) {
        fx.word('COMBO LOST', this.gaugeX() + 11, this.gaugeY(this.tension) - 10, '#ff8a7a');
        audio.play('ui_error', { vol: 0.4 });
      }
      if (this.coreOut > 0.35) {
        this.coreRun = 0;
        this.mult = 1;
      }
    }

    // towing: the core tows fastest, the green slower, outside it slips back
    const was = this.progress;
    if (this.inCore) {
      const g = dt * (1 + 0.2 * (this.mult - 1));
      this.progress += g;
      this.gained += g;
      this.gainedCore += g;
    } else if (this.inBand) {
      this.progress += dt * 0.75;
      this.gained += dt * 0.75;
    } else if (!(this.rock && !this.rock.done && this.rock.at < 1.2)) this.progress = Math.max(0, this.progress - dt * this.drain);
    else this.progress = Math.max(0, this.progress - dt * this.drain * 0.3); // ducking a rock costs less
    const p = Math.floor((this.progress / this.need) * 4);
    if (p > Math.floor((was / this.need) * 4) && p > 0 && p < 4) {
      audio.play('pickup_scrap', { pitch: 0.8 + p * 0.15 });
      const mx = this.gaugeX() + 32 + 4;
      fx.word(`${p * 25}%`, mx, this.gaugeY(p * 0.275) - 6, '#8affb0', 1, { pop: true });
      fx.ring(mx, this.gaugeY(p * 0.275), 14, '#8affb0', 0.3);
    }

    // the red: strain builds, and it snaps
    if (this.tension > this.red) {
      this.strain += dt * this.strainRate;
      if (this.r() < dt * 30) fx.spark(110, 104, 30 + this.r() * 60, -40 + this.r() * 80, 0.4, this.r() < 0.5 ? '#ffd04a' : '#ffffff', { grav: 120 });
    } else {
      this.strain = Math.max(0, this.strain - dt * 0.4);
      if (this.strain < 0.2) this.warned = false;
    }
    if (this.strain > 0.5 && !this.warned) {
      this.warned = true;
      audio.play('overheat');
      fx.word('EASE OFF!', 186, 60, '#ff5a4a', 1, { pop: true });
    }

    if (this.strain >= 1) {
      this.snapped = true;
      this.result = Math.min(0.2, this.pf * 0.25);
      fx.stop(0.14);
      fx.burst(186, 120, 50, 180, ['#ffd04a', '#ffffff', '#ff8a3a'], { grav: 60 });
      fx.ring(186, 120, 90, '#ff8a3a', 0.5);
      fx.word('SNAP!', 186, 70, '#ff5a4a', 2, { pop: true, life: 1.4 });
      fx.shake(7, 0.6);
      fx.flash('#ff8a3a');
      audio.play('shield_break');
    } else if (this.progress >= this.need) {
      const share = this.gained > 0 ? this.gainedCore / this.gained : 0;
      const left = this.limit - this.time;
      const quick = Math.min(1, left / (this.limit * 0.3));
      this.result = Math.max(0.35, Math.min(1, 0.4 + 0.45 * share + 0.15 * quick - 0.05 * this.snags));
      fx.stop(0.12);
      fx.flash('#8affb0', 0.3);
      fx.ring(300, 110, 120, '#8affb0', 0.6);
      fx.ring(300, 110, 70, '#ffffff', 0.4);
      fx.burst(300, 110, 40, 140, ['#8affb0', '#ffffff', '#c8e86a'], { life: 0.9 });
      fx.word(this.result >= 0.85 ? 'PERFECT TOW!' : 'TOWED!', 186, 64, this.result >= 0.85 ? '#ffffff' : '#8affb0', 2, { pop: true, life: 1.6 });
      fx.shake(3, 0.3);
      audio.play('perfect', { vol: this.result >= 0.85 ? 1 : 0.6 });
      audio.play('heavy', { pitch: 0.8, vol: 0.6 });
    } else if (this.time >= this.limit) {
      const share = this.gained > 0 ? this.gainedCore / this.gained : 0;
      this.result = Math.min(0.58, this.pf * (0.48 + 0.1 * share));
      fx.word('OUT OF TIME', 186, 64, '#ffd04a', 2, { pop: true, life: 1.4 });
      audio.play('ui_error');
    }
    audio.loop('engine', 'tow', this.result === null && pad.hold, 0.4 + this.tension * 0.5);
  }

  /** Lurches: a warning, then the load bucks and the band jumps. */
  private lurches(dt: number) {
    this.nextLurch -= dt;
    // never on top of a rock: that would be a coin toss, not a test
    if (this.tell <= 0 && this.rock && !this.rock.done && Math.abs(this.rock.at - this.nextLurch) < 1.1) this.nextLurch = this.rock.at + 1.3;
    const warn = byLevel(this.d, 0.85, 0.55);
    if (this.tell <= 0 && this.nextLurch <= warn && this.nextLurch > 0) {
      this.tell = this.nextLurch;
      const c = this.centre();
      this.lurchDir = c > 0.6 ? -1 : c < 0.4 ? 1 : this.r() < 0.5 ? -1 : 1;
      audio.play('aux_ready', { pitch: 0.7 });
    }
    if (this.tell > 0) this.tell -= dt;
    if (this.nextLurch <= 0) {
      const size = byLevel(this.d, 0.1, 0.18) + this.r() * 0.06;
      this.shift = Math.max(-0.3, Math.min(0.3, this.shift + this.lurchDir * size));
      this.tv += this.lurchDir * byLevel(this.d, 0.45, 0.8);
      this.sway = this.lurchDir;
      this.tell = 0;
      this.nextLurch = byLevel(this.d, 3.4, 2.0) + this.r() * 1.6;
      this.fx.stop(0.05);
      this.fx.shake(3.5, 0.3);
      this.fx.ring(306, 98, 40, '#ff8a7a', 0.35);
      audio.play('ram', { pitch: 0.8, vol: 0.7 });
    }
    this.shift *= Math.exp(-dt * 0.25);
    this.sway *= Math.exp(-dt * 2);
  }

  /** Rocks: one at a time, a warning, then it crosses the cable at a spot and a height. */
  private rocksUpdate(dt: number) {
    const fx = this.fx;
    if (!this.rock) {
      this.nextRock -= dt;
      // not in the last stretch: the finish should be yours
      if (this.nextRock <= 0 && this.pf < 0.9) {
        const warn = byLevel(this.d, 2.1, 1.35);
        // it passes just above where the cable hangs at a tension under the band: you have to drop out
        const c = this.centre();
        const clear = Math.max(0.12, Math.min(0.55, c - this.band() / 2 - byLevel(this.d, 0.04, 0.1) - this.r() * 0.06));
        this.rock = { at: warn, warn, f: 0.32 + this.r() * 0.36, clear, size: 3 + Math.floor(this.r() * 3), spin: this.r() * 6, done: false, snag: false, after: 0 };
        this.rocks++;
        this.nextRock = byLevel(this.d, 6.5, 3.2) + this.r() * 2;
        audio.play('lock_on', { pitch: 0.8, vol: 0.6 });
      }
      return;
    }
    const k = this.rock;
    if (k.done) return;
    const prev = k.at;
    k.at -= dt;
    k.spin += dt * 4;
    if (prev > 0.6 && k.at <= 0.6) audio.play('ui_move', { pitch: 1.8, vol: 0.5 });
    // the crossing: a moment either side of it, the cable must be under it
    if (k.at <= 0.05 && this.tension > k.clear) {
      k.done = true;
      k.snag = true;
      this.snags++;
      this.strain = Math.min(0.97, this.strain + byLevel(this.d, 0.35, 0.5));
      this.tv += 0.9;
      this.progress = Math.max(0, this.progress - byLevel(this.d, 0.6, 1.1));
      this.coreRun = 0;
      this.mult = 1;
      this.twang = 1;
      const [x, y] = this.rockSpot(k);
      fx.stop(0.1);
      fx.shake(6, 0.4);
      fx.flash('#ff5a4a', 0.15);
      fx.burst(x, y, 30, 150, ['#ffd04a', '#ffffff', '#8a8098'], { grav: 80 });
      fx.ring(x, y, 34, '#ff5a4a');
      fx.word('SNAGGED!', x, y - 16, '#ff5a4a', 2, { pop: true, life: 1.1 });
      audio.play('hit_armor');
      audio.play('ram', { pitch: 1.2, vol: 0.6 });
    } else if (k.at <= -0.05) {
      k.done = true;
      this.dodged++;
      const [x, y] = this.rockSpot(k);
      fx.ring(x, y, 22, '#8affe0', 0.3);
      fx.word('CLEAR!', x, y - 16, '#8affe0', 1, { pop: true });
      audio.play('graze', { vol: 0.7 });
    }
  }

  // the scene's layout, shared by the picture and the effects
  private readonly ax = 96;
  private readonly bx = 264;
  private ay(t: number) {
    return 104 + Math.round(Math.sin(t * 2) * 3);
  }
  private by(t: number) {
    return 110 + Math.round(Math.sin(t * 1.3 + 1) * 5 + this.sway * 14 + (this.tell > 0 ? Math.sin(t * 40) * 1.5 : 0));
  }
  private sag(T: number) {
    return Math.pow(1 - Math.min(1, Math.max(0, T)), 1.6) * 60;
  }
  /** Where a rock crosses: on the straight line between the ends, dropped by the sag it needs. */
  private rockSpot(k: Rock, t = this.time): [number, number] {
    const x0 = this.ax + 12;
    const x1 = this.bx - 4;
    const ay = this.ay(t);
    const x = x0 + (x1 - x0) * k.f;
    const line = ay + (this.by(t) - ay) * k.f;
    return [x, line + this.sag(k.clear) * Math.sin(k.f * Math.PI) - k.size - 2];
  }
  private gaugeX() {
    return 480 - 64;
  }
  private gaugeY(v: number) {
    const gy = 32;
    const gh = 240 - gy - 34;
    return gy + gh - Math.round((v / 1.1) * gh);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    nebula(ctx, w, h, this.seed, [70, 30, 60], [30, 50, 90], this.progress * 30);
    stars(ctx, w, h, this.seed, this.progress * 60 + t * 4, this.inCore ? 5 : this.inBand ? 3 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);

    const T = this.tension;
    // the two ships, the cable between them sagging when slack
    const shake = T > this.red ? Math.round(Math.sin(t * 70) * 1.5) : 0;
    const ax = this.ax + shake;
    const ay = this.ay(t);
    const bx = this.bx;
    const by = this.by(t);
    const x0 = ax + 12;
    const x1 = bx - 4;
    const sag = this.sag(T);
    const thrum = (T > 0.75 ? (T - 0.75) * 10 : 0) + this.twang * 6;
    const danger = T > this.red;
    const good = this.inBand && !this.snapped;
    const k = this.rock;
    // a rock on its way: the spot it'll cross, a ring closing on it, red while the cable would catch it
    if (k && !k.done && this.result === null) {
      const [rx, ry] = this.rockSpot(k, t);
      const f = Math.max(0, k.at / k.warn);
      const catches = T > k.clear;
      const col = catches ? '#ff5a4a' : '#8affe0';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35 + (1 - f) * 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rx, ry, k.size + 3 + f * 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(rx - 14, ry + k.size + 2);
      ctx.lineTo(rx + 14, ry + k.size + 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (catches && Math.floor(t * 10) % 2) drawText(ctx, '▼', rx, ry + k.size + 6, '#ff5a4a', { align: 'center' });
    }
    const n = Math.round(x1 - x0);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (this.snapped && f > 0.42 && f < 0.62) continue;
      const x = x0 + (x1 - x0) * f;
      let y = ay + (by - ay) * f + Math.sin(f * Math.PI) * sag + Math.sin(f * Math.PI * 3) * Math.sin(t * 45) * thrum;
      if (this.snapped) y += (f < 0.5 ? f : 1 - f) * 50 + Math.sin(f * 20 + t * 6) * 4;
      ctx.fillStyle = DARK;
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 4);
      ctx.fillStyle = this.snapped ? '#5a4a5a' : danger || this.twang > 0.3 ? (Math.floor(t * 14) % 2 ? '#ff5a4a' : '#ffd04a') : this.inCore ? '#ffffff' : good ? '#c8f0d8' : '#a89cb8';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      if (i % 8 === 0 && !this.snapped) {
        ctx.fillStyle = '#5a5070';
        ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1);
      }
    }
    if (good) glow(ctx, (x0 + x1) / 2, (ay + by) / 2 + sag * 0.7, this.inCore ? 60 + this.mult * 6 : 50, '#8affb0', this.inCore ? 0.16 + this.mult * 0.03 : 0.1);
    if (k) this.drawRock(ctx, k, t);

    this.hulk(ctx, bx, by, t);

    // you, pulling to the left
    ctx.save();
    ctx.translate(ax * 2, 0);
    ctx.scale(-1, 1);
    sideShip(ctx, ax, ay, this.result === null ? (this.hold ? 0.7 + T * 0.3 : 0.25) : 0, '#c86a3a', t);
    ctx.restore();
    if (this.hold && this.result === null && fx.rand() < 0.6)
      fx.spark(ax + 22 + fx.rand() * 4, ay + (fx.rand() - 0.5) * 3, 50 + fx.rand() * 40, (fx.rand() - 0.5) * 20, 0.35, fx.rand() < 0.5 ? '#ffd04a' : '#ff8a3a');
    fx.drawSparks(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.5);

    this.gauge(ctx, w, h, t);
    // words over the gauge too, shaken with the scene
    ctx.save();
    ctx.translate(ox, oy);
    fx.drawWords(ctx);
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** A tumbling lump of rock: it drifts in from the dark, crosses the line, and tumbles away. */
  private drawRock(ctx: CanvasRenderingContext2D, k: Rock, t: number) {
    const [cx, cy] = this.rockSpot(k, t);
    // in: from up and to the right, small and dim; out: on down to the left, or knocked away
    const inF = k.done ? 0 : Math.max(0, Math.min(1, k.at / k.warn));
    const outF = k.done ? Math.min(1, k.after / 0.8) : 0;
    const x = cx + inF * 70 - outF * (k.snag ? -30 : 60);
    const y = cy - inF * 60 + outF * (k.snag ? -50 : 40);
    const s = Math.max(1, Math.round(k.size * (1 - inF * 0.6)));
    ctx.globalAlpha = (1 - inF * 0.6) * (1 - outF);
    ctx.fillStyle = DARK;
    ctx.fillRect(Math.round(x) - s - 1, Math.round(y) - s, s * 2 + 2, s * 2);
    ctx.fillRect(Math.round(x) - s, Math.round(y) - s - 1, s * 2, s * 2 + 2);
    ctx.fillStyle = '#6a6078';
    ctx.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2, s * 2);
    ctx.fillStyle = '#8a8098';
    const lit = Math.floor(k.spin) % 2;
    ctx.fillRect(Math.round(x) - s + lit, Math.round(y) - s, s, Math.max(1, s - 1));
    ctx.fillStyle = '#3e3850';
    ctx.fillRect(Math.round(x) - lit, Math.round(y) + s - 2, s, 2);
    ctx.globalAlpha = 1;
  }

  /** The load: a fat old freighter, its lamp flashing before a lurch. */
  private hulk(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 2, y - 20, 92, 42);
    ctx.fillRect(x + 50, y - 30, 26, 12);
    // body
    ctx.fillStyle = '#4a4458';
    ctx.fillRect(x, y - 18, 88, 38);
    ctx.fillStyle = '#5e5870';
    ctx.fillRect(x, y - 18, 88, 3);
    ctx.fillStyle = '#34304a';
    ctx.fillRect(x, y + 10, 88, 10);
    // plates and rust
    ctx.fillStyle = '#3e3a50';
    for (let k = 1; k < 6; k++) ctx.fillRect(x + k * 15, y - 15, 1, 25);
    ctx.fillStyle = '#7a4a2a';
    ctx.fillRect(x + 22, y - 6, 9, 4);
    ctx.fillRect(x + 58, y + 2, 6, 5);
    ctx.fillStyle = '#9a5a2a';
    ctx.fillRect(x + 23, y - 6, 4, 1);
    // bridge and a bent mast
    ctx.fillStyle = '#5e5870';
    ctx.fillRect(x + 52, y - 28, 22, 10);
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(x + 55, y - 25, 16, 3);
    ctx.fillStyle = '#8a8098';
    ctx.fillRect(x + 64, y - 38, 1, 10);
    ctx.fillRect(x + 65, y - 41, 3, 1);
    // tow eye at the nose
    ctx.fillStyle = '#8a8098';
    ctx.fillRect(x - 6, y - 2, 6, 5);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 1, 3, 3);
    // the lamp: steady dim, flashing hard before a lurch
    const warn = this.tell > 0 && Math.floor(t * 12) % 2 === 0;
    ctx.fillStyle = warn ? '#ffffff' : '#7a2a34';
    ctx.fillRect(x + 76, y - 13, 4, 4);
    if (warn) {
      glow(ctx, x + 78, y - 11, 34, '#ff5a4a', 0.9);
      drawText(ctx, '!', x + 78, y - 34, '#ff5a4a', { align: 'center', scale: 2 });
    } else glow(ctx, x + 78, y - 11, 8, '#ff5a4a', 0.3);
  }

  /** Stardew's bar, turned to fit: tension up the side, the green band and its core, the tow meter beside it. */
  private gauge(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const gx = this.gaugeX();
    const gy = 32;
    const gh = h - gy - 34;
    const gw = 22;
    const Y = (v: number) => this.gaugeY(v);
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(gx - 8, gy - 14, 82, gh + 40);
    ctx.fillStyle = DARK;
    ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(gx, gy, gw, gh);
    // the red
    const ry = Y(this.red);
    ctx.fillStyle = this.strain > 0 && Math.floor(t * 10) % 2 ? '#8a2a30' : '#4a1a24';
    ctx.fillRect(gx, gy, gw, ry - gy);
    for (let y = gy; y < ry; y += 4) {
      ctx.fillStyle = '#5a2430';
      ctx.fillRect(gx, y, gw, 1);
    }
    // the green band, and the bright core in it
    const c = this.centre();
    const b = this.band();
    const top = Y(c + b / 2);
    const bot = Y(c - b / 2);
    ctx.fillStyle = this.inBand ? '#2e8a58' : '#24583e';
    ctx.fillRect(gx, top, gw, bot - top);
    ctx.fillStyle = this.inBand ? '#8affb0' : '#4a9a6a';
    ctx.fillRect(gx, top, gw, 1);
    ctx.fillRect(gx, bot - 1, gw, 1);
    const ct = Y(c + (b * this.coreF) / 2);
    const cb = Y(c - (b * this.coreF) / 2);
    const pulse = this.inCore ? 0.5 + Math.sin(t * (6 + this.mult * 3)) * 0.5 : 0;
    ctx.fillStyle = this.inCore ? (pulse > 0.5 ? '#c8ffd8' : '#8affb0') : '#4ac080';
    ctx.fillRect(gx + 2, ct, gw - 4, Math.max(2, cb - ct));
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = this.inCore ? 0.8 : 0.3;
    ctx.fillRect(gx + 2, ct, gw - 4, 1);
    ctx.globalAlpha = 1;
    if (this.inBand) glow(ctx, gx + gw / 2, (top + bot) / 2, this.inCore ? 30 + this.mult * 5 : 24, '#8affb0', this.inCore ? 0.3 + this.mult * 0.05 : 0.18);
    if (this.tell > 0) {
      // where it's about to go
      const ay = Y(c + this.lurchDir * 0.14);
      if (Math.floor(t * 10) % 2) drawText(ctx, this.lurchDir > 0 ? '▲' : '▼', gx + gw / 2, ay - 3, '#ff8a7a', { align: 'center' });
    }
    // a rock coming: the line the needle must be under, and the time till it crosses
    const k = this.rock;
    if (k && !k.done && this.result === null) {
      const ly = Y(k.clear);
      const catches = this.tension > k.clear;
      const col = catches ? '#ff5a4a' : '#8affe0';
      ctx.fillStyle = catches ? 'rgba(255,90,74,0.18)' : 'rgba(138,255,224,0.1)';
      ctx.fillRect(gx, gy, gw, ly - gy);
      ctx.fillStyle = col;
      for (let x = gx - 4; x < gx + gw + 4; x += 3) ctx.fillRect(x, ly, 2, 1);
      const f = Math.max(0, k.at / k.warn);
      ctx.fillStyle = DARK;
      ctx.fillRect(gx - 7, ly - 1, 4, 3);
      ctx.fillStyle = col;
      ctx.fillRect(gx - 6, ly, 2, 1);
      meter(ctx, gx - 6, ly + 3, gw + 12, 2, f, col);
      if (catches || Math.floor(t * 8) % 2) drawText(ctx, 'DIP', gx - 8, ly - 3, col, { align: 'right' });
    }
    // the needle, with a tick for where it's heading
    const ny = Y(this.tension);
    ctx.fillStyle = DARK;
    ctx.fillRect(gx - 5, ny - 2, gw + 10, 5);
    ctx.fillStyle = this.tension > this.red ? '#ff5a4a' : this.inCore ? '#ffffff' : '#f4ecd8';
    ctx.fillRect(gx - 4, ny - 1, gw + 8, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(gx - 4, ny - 1, gw + 8, 1);
    const ahead = Y(this.tension + this.tv * 0.25);
    ctx.fillStyle = 'rgba(244,236,216,0.5)';
    ctx.fillRect(gx + gw + 5, Math.min(ny, ahead), 1, Math.abs(ahead - ny) + 1);
    if (this.inCore) glow(ctx, gx + gw / 2, ny, 16, '#ffffff', 0.25);
    drawText(ctx, 'SNAP', gx + gw / 2, gy - 11, '#ff8a7a', { align: 'center' });
    drawText(ctx, 'SLACK', gx + gw / 2, gy + gh + 6, '#8a8098', { align: 'center' });

    // the tow meter, filling up beside it
    const mx = gx + gw + 10;
    const mw = 8;
    ctx.fillStyle = DARK;
    ctx.fillRect(mx - 1, gy - 1, mw + 2, gh + 2);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(mx, gy, mw, gh);
    const f = this.pf;
    const fh = Math.round(gh * f);
    ctx.fillStyle = f > 0.75 ? '#8affb0' : f > 0.4 ? '#c8e86a' : '#ffd04a';
    ctx.fillRect(mx, gy + gh - fh, mw, fh);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(mx, gy + gh - fh, mw, 1);
    if (this.inBand && this.result === null) glow(ctx, mx + mw / 2, gy + gh - fh, 10 + this.mult * 3, '#8affb0', 0.4);
    for (let i = 1; i < 4; i++) {
      ctx.fillStyle = '#120c18';
      ctx.fillRect(mx, gy + Math.round((gh * i) / 4), mw, 1);
    }
    drawText(ctx, 'TOW', mx + mw / 2, gy - 11, '#8affb0', { align: 'center' });
    // the combo, under the meters
    const cy = gy + gh + 6;
    if (this.mult > 1) {
      const col = this.mult >= 4 ? '#ffffff' : '#8affb0';
      drawText(ctx, `X${this.mult}`, mx + mw / 2 + 6, cy, col, { align: 'center' });
      glow(ctx, mx + mw / 2 + 6, cy + 3, 12, '#8affb0', 0.3);
    }
    // strain, a crack across the top
    if (this.strain > 0.05) meter(ctx, gx - 4, gy - 2 - 4, gw + 8, 2, this.strain, '#ff5a4a');
  }
}

interface Rock {
  /** Seconds till it crosses the cable, of `warn` in all. */
  at: number;
  warn: number;
  /** Where along the cable it crosses, 0 (you) .. 1 (the load). */
  f: number;
  /** The tension the cable must be under as it crosses. */
  clear: number;
  size: number;
  spin: number;
  done: boolean;
  snag: boolean;
  /** Seconds since it crossed, as it tumbles away. */
  after: number;
}
