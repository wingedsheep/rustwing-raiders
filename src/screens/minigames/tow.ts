import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { noise2, rng, type Rng } from '../../util';
import { drawSprite } from './sprites';
import { Bits, towSky } from './tow-art';
import { towStep } from './tow-sound';
import { byLevel, Fx, glow, hardness, meter, sideShip, stars, ticked, timer, vignette, type Minigame, type Pad } from './common';

/**
 * Keep it taut: a cable (or Nell's fuel hose) with something heavy on the other end. Hold the
 * button to pull harder, let go to ease off. The tension has weight to it (it climbs and falls
 * like Stardew's fishing bar), and the green band wanders as the load swings and narrows as the
 * tow goes on. In the green you tow; outside it the tow slips back, though never past a quarter
 * already made (those lock in); in the red the cable strains and snaps.
 *
 * Inside the green is a bright core. Towing in the core is faster and builds a combo, and the
 * score is how much of the tow you did there, so riding the edge of the band only just passes.
 * When the load's lamp flashes it's about to lurch, and the band jumps the way the arrow shows.
 * Rocks drift in across the cable: a taut cable catches them (a snag: strain, a jolt, tow lost),
 * so before one crosses you ease off and let the cable sag under the DIP line, out of the green
 * on purpose, then pull back in. The last quarter is the last haul: no more rocks, but the load
 * bucks twice as often and the band is at its narrowest. Prompts teach each thing the first time
 * it matters. Higher levels: a narrower band that wanders faster, a floatier, heavier needle,
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
  /** How quickly the needle's swing dies away: low levels settle, high levels float. */
  private readonly grip: number;
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
  /** Counts down to the cable's next creak. */
  private creakT = 0;
  private done = 0;
  /** The last quarter: no more rocks, the load fights hardest, and it all speeds up. */
  private haul = false;
  /** A prompt for the moment a thing first matters, each shown once. */
  private hint = '';
  private hintT = 0;
  private taught = new Set<string>();
  private everBand = false;
  /** Shaped bits (smoke, plates, sparks), the time since the last lurch, and the first frame drawn. */
  private bits = new Bits();
  private lurchT = 9;
  private t0: number | null = null;

  constructor(
    level: number,
    private seed: number,
  ) {
    this.r = rng(seed);
    // a little steeper through the middle levels than a straight line
    const d = (this.d = hardness(level) ** 0.8);
    this.band0 = byLevel(d, 0.3, 0.19);
    this.coreF = byLevel(d, 0.42, 0.38);
    this.roam = byLevel(d, 0.1, 0.19);
    this.roamSpeed = byLevel(d, 0.28, 0.44);
    this.heavy = byLevel(d, 1, 1.2);
    this.drain = byLevel(d, 0.15, 0.3);
    this.grip = byLevel(d, 3, 2.5);
    this.strainRate = byLevel(d, 1.0, 1.5);
    this.nextLurch = byLevel(d, 3.4, 2.4) + this.r() * 1.5;
    this.nextRock = byLevel(d, 5.5, 3.6) + this.r() * 1.5;
  }

  /** Show a prompt, once per kind. */
  private teach(key: string, text: string, time = 2.4) {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.hint = text;
    this.hintT = time;
  }

  private get pf() {
    return Math.min(1, this.progress / this.need);
  }

  /** Each quarter of the tow, once made, is locked in: the tow never slips back past it. */
  private floor() {
    return (Math.floor((this.progress / this.need) * 4) / 4) * this.need;
  }

  /** The middle of the green band: it wanders, and lurches shove it. */
  private centre() {
    const drift = (noise2(this.time * this.roamSpeed, this.seed % 89) - 0.5) * 2 * this.roam;
    return Math.max(0.22, Math.min(0.76, 0.52 + drift + this.shift));
  }

  /** The green band's width: it narrows as the tow goes on. */
  private band() {
    return this.band0 * (1 - byLevel(this.d, 0.15, 0.32) * this.pf);
  }

  private get red() {
    return 0.92;
  }

  status() {
    if (this.snapped) return 'SNAPPED!';
    if (this.result !== null) return this.progress >= this.need ? 'TOWED CLEAR!' : 'OUT OF TIME';
    if (this.rock && !this.rock.done) return this.tension > this.rock.clear ? 'ROCK! EASE OFF, LET IT SAG UNDER' : 'ROCK! HOLD IT LOW...';
    if (this.tell > 0) return 'IT IS ABOUT TO LURCH!';
    const parts = [`${this.haul ? 'LAST HAUL ' : 'TOWED '}${Math.round(this.pf * 100)}%`];
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
    this.bits.update(dt);
    this.lurchT += dt;
    this.twang = Math.max(0, this.twang - dt * 3);
    this.smoke(dt);
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
    this.hintT -= dt;

    this.rocksUpdate(dt);
    this.lurches(dt);

    // the needle has weight: the button pulls it up, the load drags it down
    const up = 2.3 / this.heavy;
    const down = 1.7 * this.heavy;
    this.tv += (pad.hold ? up : -down) * dt;
    this.tv *= Math.exp(-dt * this.grip);
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
    if (this.inBand && !wasBand) audio.play('mini_tow_band', { vol: 0.8 });
    // the first seconds teach: what to press, then what to aim for
    if (this.inBand) {
      if (!this.everBand) this.hintT = Math.min(this.hintT, 0.3);
      this.everBand = true;
      if (this.time > 1.5 && !this.inCore) this.teach('core', 'AIM FOR THE BRIGHT CORE');
    } else if (!this.everBand && this.time > 0.8) {
      if (this.tension < c) this.teach('pull', 'HOLD TO PULL THE NEEDLE UP', 30);
      else this.teach('ease', 'LET GO TO EASE OFF', 30);
    }
    if (this.inCore && !wasCore) audio.play('mini_tow_sing', { vol: 0.8 });

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
        audio.play('mini_tow_combo', { pitch: towStep(m * 2 - 3) });
        if (m === 2) this.teach('combo', 'STAY IN THE CORE: COMBO!');
      }
    } else {
      this.coreOut += dt;
      if (this.coreOut > 0.35 && this.mult > 1) {
        fx.word('COMBO LOST', this.gaugeX() + 11, this.gaugeY(this.tension) - 10, '#ff8a7a');
        audio.play('mini_tow_combo_lost', { vol: 0.8 });
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
    } else if (!(this.rock && !this.rock.done && this.rock.at < 1.2)) this.progress = Math.max(this.floor(), this.progress - dt * this.drain);
    else this.progress = Math.max(this.floor(), this.progress - dt * this.drain * 0.3); // ducking a rock costs less
    const p = Math.floor((this.progress / this.need) * 4);
    if (p > Math.floor((was / this.need) * 4) && p > 0 && p < 4) {
      audio.play('mini_tow_lock', { pitch: towStep(p - 1) });
      const mx = this.gaugeX() + 32 + 4;
      fx.word(`${p * 25}% LOCKED`, mx - 14, this.gaugeY(p * 0.275) - 6, '#8affb0', 1, { pop: true });
      fx.ring(mx, this.gaugeY(p * 0.275), 14, '#8affb0', 0.3);
      if (p === 1) this.teach('lock', 'EACH QUARTER LOCKS IN');
      if (p === 3) this.lastHaul();
    }
    // the last haul counts down to the finish in ticks
    if (this.haul) {
      const k = Math.floor(this.pf * 20);
      if (k > Math.floor((was / this.need) * 20) && k < 20) audio.play('mini_tow_tick', { pitch: towStep(k - 15) });
    }

    // the red: strain builds, and it snaps
    if (this.tension > this.red) {
      this.strain += dt * this.strainRate;
      if (this.r() < dt * 30) fx.spark(110, 104, 30 + this.r() * 60, -40 + this.r() * 80, 0.4, this.r() < 0.5 ? '#ffd04a' : '#ffffff', { grav: 120 });
    } else {
      this.strain = Math.max(0, this.strain - dt * 0.4);
      if (this.strain < 0.2) this.warned = false;
    }
    if (this.strain > 0.25) this.teach('red', 'TOO TIGHT! LET GO TO EASE OFF', 2);
    if (this.strain > 0.5 && !this.warned) {
      this.warned = true;
      audio.play('mini_tow_strain');
      fx.word('EASE OFF!', 186, 60, '#ff5a4a', 1, { pop: true });
    }

    if (this.strain >= 1) {
      this.snapped = true;
      this.result = Math.min(0.2, this.pf * 0.25);
      fx.stop(0.14);
      fx.burst(186, 120, 50, 180, ['#ffd04a', '#ffffff', '#ff8a3a'], { grav: 60 });
      for (let i = 0; i < 14; i++) this.bits.streak(186, 120, (this.fx.rand() - 0.5) * 300, (this.fx.rand() - 0.6) * 220, 0.5, this.fx.rand() < 0.5 ? '#ffd04a' : '#ffffff');
      for (let i = 0; i < 6; i++) this.bits.shard(186, 120, (this.fx.rand() - 0.5) * 120, (this.fx.rand() - 0.5) * 120, 1.4, '#c86a3a');
      fx.ring(186, 120, 90, '#ff8a3a', 0.5);
      fx.word('SNAP!', 186, 70, '#ff5a4a', 2, { pop: true, life: 1.4 });
      fx.shake(7, 0.6);
      fx.flash('#ff8a3a');
      audio.play('mini_tow_snap');
    } else if (this.progress >= this.need) {
      const share = this.gained > 0 ? this.gainedCore / this.gained : 0;
      const left = this.limit - this.time;
      const quick = Math.min(1, left / (this.limit * 0.4));
      this.result = Math.max(0.35, Math.min(1, 0.3 + 0.55 * share + 0.15 * quick - 0.05 * this.snags));
      fx.stop(0.12);
      fx.flash('#8affb0', 0.3);
      fx.ring(300, 110, 120, '#8affb0', 0.6);
      fx.ring(300, 110, 70, '#ffffff', 0.4);
      fx.burst(300, 110, 40, 140, ['#8affb0', '#ffffff', '#c8e86a'], { life: 0.9 });
      fx.word(this.result >= 0.85 ? 'PERFECT TOW!' : 'TOWED!', 186, 64, this.result >= 0.85 ? '#ffffff' : '#8affb0', 2, { pop: true, life: 1.6 });
      fx.shake(3, 0.3);
      audio.play('mini_tow_done');
      if (this.result >= 0.85) audio.play('mini_tow_perfect');
    } else if (this.time >= this.limit) {
      const share = this.gained > 0 ? this.gainedCore / this.gained : 0;
      this.result = Math.min(0.58, this.pf * (0.48 + 0.1 * share));
      fx.word('OUT OF TIME', 186, 64, '#ffd04a', 2, { pop: true, life: 1.4 });
      audio.play('mini_tow_fail');
    }
    // the cable talks: it creaks faster and higher the tighter it is, and frays in the red
    this.creakT -= dt * (0.6 + this.tension * 2.6);
    if (this.result === null && this.tension > this.red) audio.play('mini_tow_fray', { pitch: 0.9 + this.strain * 0.3, vol: 0.6 + this.strain * 0.4 });
    else if (this.result === null && this.creakT <= 0 && this.tension > 0.3) {
      this.creakT = 1;
      audio.play('mini_tow_creak', { pitch: 0.7 + this.tension * 0.7, vol: 0.25 + this.tension * 0.55 });
    }
    audio.loop('engine', 'tow', this.result === null && pad.hold, 0.4 + this.tension * 0.5);
  }

  /** Three quarters in: the last haul. No more rocks, the load bucks harder and more often. */
  private lastHaul() {
    const fx = this.fx;
    this.haul = true;
    this.nextLurch = Math.min(this.nextLurch, 1.8);
    fx.stop(0.08);
    fx.shake(4, 0.4);
    fx.ring(186, 100, 150, '#ffd04a', 0.6);
    fx.word('LAST HAUL!', 186, 50, '#ffd04a', 2, { pop: true, life: 1.5 });
    audio.play('mini_tow_haul');
    this.teach('haul', 'NO MORE ROCKS. HOLD ON!', 2);
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
      audio.play('mini_tow_lamp');
      this.teach('lurch', this.lurchDir > 0 ? 'LAMP: THE GREEN JUMPS UP' : 'LAMP: THE GREEN DROPS', 1.6);
    }
    if (this.tell > 0) this.tell -= dt;
    if (this.nextLurch <= 0) {
      const size = byLevel(this.d, 0.1, 0.18) + this.r() * 0.06;
      this.shift = Math.max(-0.3, Math.min(0.3, this.shift + this.lurchDir * size));
      this.tv += this.lurchDir * byLevel(this.d, 0.45, 0.8);
      this.sway = this.lurchDir;
      this.tell = 0;
      this.lurchT = 0;
      this.nextLurch = (byLevel(this.d, 3.4, 2.0) + this.r() * 1.6) * (this.haul ? 0.6 : 1);
      this.fx.stop(0.05);
      this.fx.shake(3.5, 0.3);
      this.fx.ring(306, 98, 40, '#ff8a7a', 0.35);
      audio.play('mini_tow_lurch');
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
      if (this.nextRock <= 0 && !this.haul) {
        const warn = byLevel(this.d, 2.1, 1.35);
        // it passes just above where the cable hangs at a tension under the band: you have to drop out
        const c = this.centre();
        const clear = Math.max(0.12, Math.min(0.55, c - this.band() / 2 - byLevel(this.d, 0.04, 0.1) - this.r() * 0.06));
        this.rock = { at: warn, warn, f: 0.32 + this.r() * 0.36, clear, size: 3 + Math.floor(this.r() * 3), spin: this.r() * 6, done: false, snag: false, after: 0 };
        this.rocks++;
        this.nextRock = byLevel(this.d, 6.5, 3.2) + this.r() * 2;
        audio.play('mini_tow_rock');
        this.teach('rock', 'LET IT SAG UNDER THE LINE', warn + 0.3);
      }
      return;
    }
    const k = this.rock;
    if (k.done) return;
    const prev = k.at;
    k.at -= dt;
    k.spin += dt * 4;
    if (prev > 0.5 && k.at <= 0.5) audio.play('mini_tow_rock_near');
    // the crossing: a moment either side of it, the cable must be under it
    if (k.at <= 0.05 && this.tension > k.clear) {
      k.done = true;
      k.snag = true;
      this.snags++;
      this.strain = Math.min(0.97, this.strain + byLevel(this.d, 0.35, 0.5));
      this.tv += 0.9;
      this.progress = Math.max(this.floor(), this.progress - byLevel(this.d, 0.5, 0.8));
      this.coreRun = 0;
      this.mult = 1;
      this.twang = 1;
      const [x, y] = this.rockSpot(k);
      fx.stop(0.1);
      fx.shake(6, 0.4);
      fx.flash('#ff5a4a', 0.15);
      fx.burst(x, y, 30, 150, ['#ffd04a', '#ffffff', '#8a8098'], { grav: 80 });
      fx.ring(x, y, 34, '#ff5a4a');
      // the rock bursts on the cable, and the jolt tears a plate off the load
      for (let i = 0; i < 10; i++) {
        const a = this.fx.rand() * Math.PI * 2;
        this.bits.shard(x, y, Math.cos(a) * (40 + this.fx.rand() * 70), Math.sin(a) * (40 + this.fx.rand() * 70) - 20, 0.8 + this.fx.rand() * 0.6, i % 2 ? '#8a7a66' : '#6a6078');
      }
      for (let i = 0; i < 6; i++) this.bits.smoke(x, y, (this.fx.rand() - 0.5) * 40, (this.fx.rand() - 0.5) * 30, 0.9 + this.fx.rand() * 0.5, 4 + this.fx.rand() * 3, '#4a4458');
      const [hx, hy] = this.holes()[Math.min(1, this.snags - 1)];
      for (let i = 0; i < 5; i++) this.bits.shard(hx, hy, 20 + this.fx.rand() * 60, -30 - this.fx.rand() * 50, 1.2, '#a8643a');
      for (let i = 0; i < 8; i++) this.bits.streak(hx, hy, (this.fx.rand() - 0.3) * 160, -this.fx.rand() * 120, 0.35, this.fx.rand() < 0.5 ? '#ffd04a' : '#ff8a3a');
      fx.word('SNAGGED!', x, y - 16, '#ff5a4a', 2, { pop: true, life: 1.1 });
      audio.play('mini_tow_snag');
    } else if (k.at <= -0.05) {
      k.done = true;
      this.dodged++;
      const [x, y] = this.rockSpot(k);
      fx.ring(x, y, 22, '#8affe0', 0.3);
      fx.word('CLEAR!', x, y - 16, '#8affe0', 1, { pop: true });
      audio.play('mini_tow_clear');
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
    const x0 = this.ax + 22;
    const x1 = this.bx + 1;
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

  /** Where the hull's holes are, for the smoke and the sparks (one for each of the first two snags). */
  private holes(t = this.time): [number, number][] {
    const by = this.by(t);
    return [
      [this.bx + 44, by - 4],
      [this.bx + 70, by - 2],
    ];
  }

  /** A holed load trails smoke; a hard pull spits sparks from your engines. */
  private smoke(dt: number) {
    if (this.snapped) return;
    const n = Math.min(2, this.snags);
    for (let i = 0; i < n; i++)
      if (this.fx.rand() < dt * 9) {
        const [x, y] = this.holes()[i];
        this.bits.smoke(x, y, 14 + this.fx.rand() * 16, -8 - this.fx.rand() * 12, 1.4 + this.fx.rand() * 0.6, 2 + this.fx.rand() * 2, i ? '#3a3040' : '#4a4050');
        if (this.fx.rand() < 0.3) this.bits.ember(x, y, 10 + this.fx.rand() * 20, -10 - this.fx.rand() * 20, 0.8);
      }
  }

  /** How far the finish has towed the pair into the haven's light (0 until she's clear). */
  private clearX() {
    if (this.result === null || this.snapped || this.progress < this.need) return 0;
    const f = Math.min(1, this.done / 1.6);
    return f * f * (3 - 2 * f) * 54;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    if (this.t0 === null) this.t0 = t;
    // the first beat, over the count-in: the Kestrel swings in and takes up the slack
    const intro = Math.min(1, (t - this.t0) / 1.3);
    const ie = 1 - (1 - intro) ** 3;
    const clear = this.clearX();
    // the sky drifts the way she tows (to the left, so it all slides right)
    const travel = this.progress * 2.4 + clear * 0.3;
    towSky(ctx, w, h, this.seed, travel);
    stars(ctx, w, h, this.seed, -(this.progress * (this.haul ? 90 : 60) + t * 4 + clear * 4), (this.inCore ? 5 : this.inBand ? 3 : 1) + (this.haul ? 4 : 0) + clear * 0.15, t);
    if (this.haul && this.result === null) glow(ctx, 300, 110, 160, '#ffb04a', 0.06 + Math.sin(t * 6) * 0.03);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);

    // the haven: the far dock she tows it to, sliding in with the last haul
    const hf = this.haul || clear > 0 ? Math.min(1, Math.max(0, (this.pf - 0.75) / 0.25)) : 0;
    if (hf > 0) {
      const hx = Math.round(-34 + 72 * (1 - (1 - hf) ** 2));
      const hy = 98;
      const beam = 0.25 + hf * 0.2 + clear / 54;
      glow(ctx, hx + 14, hy, 70 + clear, '#ffe6a8', 0.16 * beam);
      drawSprite(ctx, 'tow', 'haven', hx, hy, { clip: 'blink', t, alpha: 0.6 + hf * 0.4 });
      // the bay's light, reaching out to meet you
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.07 * beam + (clear > 0 ? 0.08 : 0);
      ctx.fillStyle = '#ffe6a8';
      ctx.beginPath();
      ctx.moveTo(hx + 12, hy - 14);
      ctx.lineTo(hx + 160, hy - 40);
      ctx.lineTo(hx + 160, hy + 44);
      ctx.lineTo(hx + 12, hy + 14);
      ctx.fill();
      ctx.restore();
    }

    const T = this.tension;
    // the two ships, the cable between them sagging when slack
    const shake = T > this.red ? Math.round(Math.sin(t * 70) * 1.5) : 0;
    const ax = this.ax + shake - Math.round((1 - ie) * 90) - Math.round(clear);
    const ay = this.ay(t);
    const lost = this.snapped ? Math.min(1, this.done / 1.2) : 0;
    const bx = this.bx - Math.round(clear * 0.96) + Math.round(lost * 26);
    const by = this.by(t) + Math.round(lost * 10);
    const x0 = ax + 22;
    const x1 = bx + 1;
    // slack in the intro, until she takes it up
    const sag = this.sag(T) + (1 - ie) * 30;
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
      ctx.globalAlpha = 0.35 + (1 - f) * 0.55;
      ctx.lineWidth = f < 0.3 ? 2 : 1;
      ctx.beginPath();
      ctx.arc(rx, ry, k.size + 3 + f * 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (f < 0.4) glow(ctx, rx, ry, 18, col, 0.35);
    }
    this.bits.draw(ctx, 'back');

    // the load, behind the cable's end: holed by every snag, its lamp flashing before a lurch
    this.hulk(ctx, bx, by, t);

    // the cable: a heavy hose, collared every few pixels, dark-edged so it reads on the planet
    const flash = danger || this.twang > 0.3 ? (Math.floor(t * 14) % 2 ? '#ff5a4a' : '#ffd04a') : null;
    const body = this.snapped ? '#5a4a5a' : (flash ?? (this.inCore ? (this.haul ? '#ffe8a0' : '#f4f8ff') : good ? '#b8e8c8' : '#9a90aa'));
    const shade = this.snapped ? '#3a2e3e' : flash ? '#8a2a30' : this.inCore ? (this.haul ? '#c8904a' : '#a8b8c8') : good ? '#5a9a78' : '#5a5070';
    const n = Math.round(x1 - x0);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (this.snapped && f > 0.42 && f < 0.62) continue;
      const x = x0 + (x1 - x0) * f;
      let y = ay + (by - ay) * f + Math.sin(f * Math.PI) * sag + Math.sin(f * Math.PI * 3) * Math.sin(t * 45) * thrum;
      if (this.snapped) y += (f < 0.5 ? f : 1 - f) * 50 + Math.sin(f * 20 + t * 6) * 4;
      const X = Math.round(x);
      const Y = Math.round(y);
      ctx.fillStyle = DARK;
      ctx.fillRect(X, Y - 2, 1, 5);
      ctx.fillStyle = body;
      ctx.fillRect(X, Y - 1, 1, 2);
      ctx.fillStyle = shade;
      ctx.fillRect(X, Y + 1, 1, 1);
      // collars, and a glint running down the line while you tow in the core
      if (i % 9 === 4 && !this.snapped) {
        ctx.fillStyle = DARK;
        ctx.fillRect(X - 1, Y - 3, 3, 7);
        ctx.fillStyle = flash ?? '#c86a3a';
        ctx.fillRect(X, Y - 2, 1, 5);
      }
      if (this.inCore && !this.snapped && (((i - t * (60 + this.mult * 30)) % 46) + 46) % 46 < 2) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(X, Y - 1, 1, 1);
      }
    }
    // the hook on her tail and the eye on its nose
    if (!this.snapped || lost < 1) {
      ctx.fillStyle = DARK;
      ctx.fillRect(x1 - 2, by - 3, 5, 7);
      ctx.fillStyle = '#c86a3a';
      ctx.fillRect(x1 - 1, by - 2, 3, 5);
    }
    if (good) glow(ctx, (x0 + x1) / 2, (ay + by) / 2 + sag * 0.7, this.inCore ? 60 + this.mult * 6 : 50, '#8affb0', this.inCore ? 0.14 + this.mult * 0.03 : 0.08);
    if (k) this.drawRock(ctx, k, t);

    // you, pulling to the left: flames long and fat while you hold
    const pulling = this.result === null && this.hold;
    drawSprite(ctx, 'tow', 'kestrel', ax, ay, {
      clip: pulling || clear > 0 || intro < 1 ? 'pull' : this.result === null ? 'fly' : 'rest',
      t,
      flipX: true,
      fallback: () => {
        ctx.save();
        ctx.translate(ax * 2, 0);
        ctx.scale(-1, 1);
        sideShip(ctx, ax, ay, this.result === null ? (this.hold ? 0.7 + T * 0.3 : 0.25) : 0, '#c86a3a', t);
        ctx.restore();
      },
    });
    if (pulling || clear > 0) glow(ctx, ax + 31, ay, 12 + T * 8, '#ff9a3a', 0.25 + T * 0.2);
    if (pulling && fx.rand() < 0.6)
      fx.spark(ax + 31 + fx.rand() * 4, ay + (fx.rand() - 0.5) * 3, 50 + fx.rand() * 40, (fx.rand() - 0.5) * 20, 0.35, fx.rand() < 0.5 ? '#ffd04a' : '#ff8a3a');
    this.bits.draw(ctx, 'front');
    fx.drawSparks(ctx);
    // the haven's light washes over the pair as she tows it in
    if (clear > 0) glow(ctx, ax, ay, 40 + clear, '#ffe6a8', (clear / 54) * 0.35);
    ctx.restore();

    // dark rocks close to the lens, drifting by low down, out of the play
    for (let i = 0; i < 2; i++) {
      const span = w + 140;
      const fxp = (((t * (22 + i * 9) + this.progress * 18 + clear * 2 + i * 300 + (this.seed % 97)) % span) + span) % span - 70;
      drawSprite(ctx, 'tow', 'rock_fg', Math.round(fxp), i ? 236 : 226, { clip: 'tumble', t: t * (0.5 + i * 0.2) + i, scale: 2, anchor: 'center', alpha: 0.95 });
    }
    vignette(ctx, w, h, 0.5);

    this.gauge(ctx, w, h, t);
    // words over the gauge too, shaken with the scene
    ctx.save();
    ctx.translate(ox, oy);
    fx.drawWords(ctx);
    ctx.restore();
    this.drawHint(ctx, 8, h - 21);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The prompt of the moment, in a small box out of the way of the play. */
  private drawHint(ctx: CanvasRenderingContext2D, x: number, y: number) {
    if (this.hintT <= 0 || !this.hint || this.result !== null) return;
    const tw = this.hint.length * 6 + 9;
    ctx.globalAlpha = Math.min(1, this.hintT * 4);
    ctx.fillStyle = 'rgba(10,7,16,0.88)';
    ctx.fillRect(x, y, tw, 13);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x, y, 2, 13);
    drawText(ctx, this.hint, x + 6, y + 3, '#ffe8a0');
    ctx.globalAlpha = 1;
  }

  /** A tumbling lump of rock: it drifts in from the dark, crosses the line, and tumbles away. */
  private drawRock(ctx: CanvasRenderingContext2D, k: Rock, t: number) {
    const [cx, cy] = this.rockSpot(k, t);
    // in: from up and to the right, dim; out: on down to the left, or knocked away
    const inF = k.done ? 0 : Math.max(0, Math.min(1, k.at / k.warn));
    const outF = k.done ? Math.min(1, k.after / 0.8) : 0;
    const x = cx + inF * 70 - outF * (k.snag ? -30 : 60);
    const y = cy - inF * 60 + outF * (k.snag ? -50 : 40);
    // a snagged rock bursts: only its bits fly on
    if (k.snag) return;
    const a = (1 - inF * 0.6) * (1 - outF);
    drawSprite(ctx, 'tow', `rock_${Math.max(0, Math.min(2, k.size - 3))}`, Math.round(x), Math.round(y), {
      clip: 'tumble',
      t: k.spin / 3,
      anchor: 'center',
      alpha: a,
      fallback: () => {
        const s = k.size;
        ctx.globalAlpha = a;
        ctx.fillStyle = DARK;
        ctx.fillRect(Math.round(x) - s - 1, Math.round(y) - s, s * 2 + 2, s * 2);
        ctx.fillStyle = '#6a6078';
        ctx.fillRect(Math.round(x) - s, Math.round(y) - s, s * 2, s * 2);
        ctx.globalAlpha = 1;
      },
    });
  }

  /** The load: a fat old rust-red freighter, its lamp flashing before a lurch. */
  private hulk(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    x = Math.round(x);
    y = Math.round(y);
    const v = Math.min(2, this.snags);
    const warn = this.tell > 0 && Math.floor(t * 12) % 2 === 0;
    const clip = this.lurchT < 0.6 ? 'lurch' : this.tell > 0 ? 'lamp' : 'rest';
    const ok = drawSprite(ctx, 'tow', `freighter_${v}`, x - 1, y - 31, { clip, t: clip === 'lurch' ? this.lurchT : t * 1.5, anchor: 'topleft' });
    if (!ok) {
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 2, y - 20, 92, 42);
      ctx.fillStyle = '#4a4458';
      ctx.fillRect(x, y - 18, 88, 38);
    }
    // the lamp: a slow dim pulse, flashing hard before a lurch
    const lx = x + 80;
    const ly = y - 26;
    if (warn) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(lx - 2, ly - 2, 4, 4);
      glow(ctx, lx, ly, 34, '#ff5a4a', 0.9);
      drawText(ctx, '!', lx, ly - 22, '#ff5a4a', { align: 'center', scale: 2 });
    } else glow(ctx, lx, ly, 8, '#ff5a4a', 0.2 + Math.sin(t * 3) * 0.1);
    // its engines, still lit, and a fire glow from each hole
    glow(ctx, x + 100, y + 2, 10, '#ff8a3a', 0.3);
    for (let i = 0; i < v; i++) {
      const [hx, hy] = this.holes(t)[i];
      glow(ctx, hx, hy, 9, '#ff8a3a', 0.35 + Math.sin(t * 13 + i) * 0.12);
    }
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
    // a rock coming: one line the needle must be under, with the time till it crosses beside it
    const k = this.rock;
    if (k && !k.done && this.result === null) {
      const ly = Y(k.clear);
      const catches = this.tension > k.clear;
      const col = catches ? (Math.floor(t * 10) % 2 ? '#ff5a4a' : '#ff8a7a') : '#8affe0';
      ctx.fillStyle = DARK;
      ctx.fillRect(gx - 13, ly - 1, gw + 20, 3);
      ctx.fillStyle = col;
      ctx.fillRect(gx - 12, ly, gw + 18, 1);
      ctx.fillStyle = 'rgba(10,7,16,0.85)';
      ctx.fillRect(gx - 37, ly - 5, 22, 15);
      drawText(ctx, 'DIP', gx - 26, ly - 3, col, { align: 'center' });
      meter(ctx, gx - 35, ly + 6, 18, 2, Math.max(0, k.at / k.warn), col);
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
