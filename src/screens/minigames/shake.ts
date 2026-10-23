import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, TAU, type Rng } from '../../util';
import './shake-sound';
import { byLevel, Fx, glow, hardness, nebula, ticked, timer, vignette, type Minigame, type Pad } from './common';

type Kind = 'louse' | 'skipper' | 'shell' | 'brood' | 'nymph';

/** A lane-louse out in the dark: coming for the glass, or (gorged) going off with your fuel. */
interface Bug {
  kind: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Where on the glass it's making for, in world units at NEAR. */
  tx: number;
  ty: number;
  age: number;
  /** Riding a rock, out of sight behind it, until it leaps. */
  rock?: Rock;
  leap: number;
  /** Where on the rock's rim it clings (radians), for its eyes peeking out. */
  rim: number;
  /** A skipper's wait to its next hop, and how far through the dart it is. */
  hop: number;
  dart: number;
  /** A shellback's shell, round its cycle (open at the end of it). */
  phase: number;
  /** A nymph's scatter from the burst brood, before it dives. */
  scatter: number;
  /** Full of your fuel and making off with it: how much. */
  gorged: number;
  /** Seconds since it was shot (0: alive). */
  dead: number;
  /** Let go when time ran out, and off into the dark. */
  fled?: boolean;
  spin: number;
  spinV: number;
  hurt: number;
  seed: number;
}

/** One that made it: on the glass, crawling for the fuel lines along the frame, drinking. */
interface Crawler {
  kind: Kind;
  x: number;
  y: number;
  /** Seconds on. */
  on: number;
  drank: number;
  phase: number;
  hurt: number;
  seed: number;
  /** Which way it's crawling. */
  face: number;
}

interface Rock {
  x: number;
  y: number;
  z: number;
  r: number;
  spin: number;
  spinV: number;
  /** Its outline: a radius for each of its corners. */
  verts: number[];
  hurt: number;
}

/** The lane's lantern buoys, coming past: don't shoot them. */
interface Lantern {
  x: number;
  y: number;
  z: number;
  /** Seconds since it was shot out (0: lit). */
  broken: number;
  seed: number;
}

interface Bolt {
  /** Where it was aimed, on the screen, and the muzzle it left. */
  ax: number;
  ay: number;
  mx: number;
  my: number;
  z: number;
  /** Fired on a hot streak: it goes through what it kills. */
  hot: boolean;
  hits: number;
  passed: Set<object>;
  done: boolean;
}

/** A bit of something shot, flying in the lane: shell chips, or goo that splats on the glass. */
interface Debris {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  c: string;
  goo: boolean;
}

/** Goo on the glass, sliding down and thinning out. */
interface Smear {
  x: number;
  y: number;
  r: number;
  life: number;
  max: number;
  c: string;
  seed: number;
}

interface Wave {
  t: number;
  kinds: Kind[];
  /** Off a rock (they peek out from behind it) or out of the dark (eyes, far off). */
  rock: boolean;
  /** Where, on the screen, it comes from. */
  sx: number;
  sy: number;
  rk?: Rock;
  told: boolean;
  sent: boolean;
}

/** The game's length, and when the swarm comes for the last third. */
const LIMIT = 28;
const SWARM = 18.5;
/** The lens: a thing at depth z is drawn F/z times its size. */
const F = 220;
/** Where they come out of the dark, and the depth at which one reaches the glass. */
const FAR = 16;
const NEAR = 2.6;
/** How fast the ship flies down the lane (rocks and lanterns come past at this). */
const SPEED = 2.6;
/** Where a rock's riders leap off. */
const LEAP_Z = 9.5;
/** How fast a bolt goes out: a far one takes a quarter second, so lead the quick ones. */
const BOLT = 52;
/** Heat: a shot puts this in, a hit takes some back out, and it cools by itself, slowly. */
const HEAT_SHOT = 0.16;
const HEAT_HIT = 0.1;
const COOL = 0.3;
const VENT = 1.3;
/** Hits in a row for a hot streak, when bolts go through what they kill. */
const HOT = 6;
/** What a landing takes, what one on the glass drinks a second, and how long until it's full. */
const BITE = 0.02;
const SIP = 0.032;
const FULL = 4.5;
/** A shellback's cycle: shut, then the seams glow, then it's open for the last stretch. */
const CYCLE = 2.3;
const OPENING = 1.25;
const OPEN = 1.6;
/** A shot shellback bursts: anything flying this close to it goes too. */
const BURST = 2.6;
/** How big each one is, in the lane and on the glass. */
const SIZE: Record<Kind, number> = { louse: 0.34, skipper: 0.3, shell: 0.62, brood: 0.52, nymph: 0.17 };
const GLASS: Record<Kind, number> = { louse: 19, skipper: 17, shell: 25, brood: 23, nymph: 11 };
/** What each drinks, against a louse. */
const THIRST: Record<Kind, number> = { louse: 1, skipper: 1, shell: 1.8, brood: 1.5, nymph: 0.5 };
/** The notes a streak climbs, in semitones (a pentatonic run). */
const STEPS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/**
 * Shake them off, from the gunner's seat: you look out down the lane through the canopy, and the
 * hull leeches (lane-lice) come at the glass out of the dark, or leap off the rocks drifting past,
 * their eyes glinting just before. The stick swings a reticle, the button fires the twin guns (hold
 * it for auto). A bolt takes a moment to reach the far dark, so the quick ones want leading.
 *
 * Every shot heats the guns and every hit cools them, so a good eye can fire all day and a spray
 * vents them. Hits in a row make a streak; on a hot streak the bolts go through what they kill.
 * The lantern buoys of the lane come past among them: shoot one and its light blinds you.
 *
 * Any that reach the glass bite on, crawl for the fuel lines round the frame and drink until
 * they're full, then leap off back into the dark with your fuel inside them: shoot one of those
 * and you get it back. Skippers (from tricky) hop sideways, and only hold still a moment between.
 * Shellbacks (from hard) shrug off bolts until their shell opens, and burst when shot, taking
 * whatever flies near them. A brood (from vicious) bursts into a scatter of young that dive at you.
 * When time's up, every one still on takes a last gulp.
 */
export class Shake implements Minigame {
  readonly title = 'SHOOT THEM OFF';
  readonly how = 'STICK AIMS, BUTTON SHOOTS (HOLD FOR AUTO). HITS COOL THE GUNS, MISSES HEAT THEM. SHOOT THEM BEFORE THEY LAND, AND SPARE THE LANTERNS.';
  result: number | null = null;
  private readonly d: number;
  private bugs: Bug[] = [];
  private crawlers: Crawler[] = [];
  private rocks: Rock[] = [];
  private lanterns: Lantern[] = [];
  private bolts: Bolt[] = [];
  private debris: Debris[] = [];
  private smears: Smear[] = [];
  private cracks: { x: number; y: number; r: number; seed: number }[] = [];
  private stars: { x: number; y: number; z: number }[] = [];
  private waves: Wave[] = [];
  private fuel = 1;
  private shownFuel = 1;
  private drain = 0;
  private time = 0;
  private readonly tell: number;
  private readonly speed: number;
  /** Out where it's deadly there are more of them, so each drinks a little less. */
  private readonly hunger: number;
  /** The reticle, and how it's moving. */
  private ax = 240;
  private ay = 100;
  private avx = 0;
  private avy = 0;
  /** How long the stick's been held one way: the reticle speeds up the longer it is. */
  private held = 0;
  private lastDir: [number, number] = [0, 0];
  /** Over something worth shooting (1), a lantern (2), or nothing. */
  private over = 0;
  private heat = 0;
  private vent = 0;
  private cd = 0;
  private side = 0;
  private recoil = [0, 0];
  private muzzle = [0, 0];
  private kx = 0;
  private ky = 0;
  private streak = 0;
  private bestStreak = 0;
  private blind = 0;
  private nextRock = 1;
  private fx = new Fx();
  private r: Rng;
  private readonly cx = 240;
  private readonly cy = 100;
  private shots = 0;
  private hits = 0;
  private downed = 0;
  private total = 0;
  private landed = 0;
  private wonBack = 0;
  private lanternsHit = 0;
  private swarmed = false;
  /** Time up: the last gulps, one at a time, before the score. */
  private gulpT = -1;
  private gulped = 0;
  private slurpT = 0;
  /** The prompts already shown, each once, the first time it matters. */
  private taught = new Set<string>();
  private prompt = '';
  private promptT = 0;
  private promptC = '#f4ecd8';
  /** Time since the result: the ship boosts away. */
  private outT = 0;
  /** Dice for looks only, so the play's dice stay the play's. */
  private vr: Rng;

  constructor(
    private level: number,
    seed: number,
  ) {
    this.r = rng(seed);
    this.vr = rng(seed ^ 0x5a5a);
    const d = (this.d = hardness(level));
    this.tell = byLevel(d, 1.3, 0.8);
    this.speed = byLevel(d, 2.7, 3.2);
    this.hunger = byLevel(d, 1.15, 0.6);
    for (let k = 0; k < 4; k++) this.lanterns.push({ x: k % 2 ? 2.4 : -2.4, y: 0.9, z: 4 + k * 4.6, broken: 0, seed: this.vr() * 99 });
    for (let k = 0; k < 130; k++) this.stars.push({ x: (this.vr() - 0.5) * 60, y: (this.vr() - 0.5) * 36, z: 1 + this.vr() * 39 });
    this.plan();
    this.teach('aim', 'SWING THE STICK TO AIM, PRESS TO SHOOT');
  }

  /** The waves, laid out ahead: when, from where, and what's in them. */
  private plan() {
    const d = this.d;
    let t = 1.3;
    let n = 0;
    while (t < LIMIT - 3.2) {
      const swarm = t >= SWARM;
      const count = Math.max(1, Math.round(byLevel(d, 1.9, 2.2) + (this.r() - 0.4) * 1.4 + (swarm ? 1 : 0)));
      const kinds: Kind[] = [];
      for (let k = 0; k < count; k++) kinds.push(this.level >= 2 && t > 4 && this.r() < byLevel(d, 0.1, 0.3) ? 'skipper' : 'louse');
      if (this.level >= 3 && n % 4 === 2) kinds.push('shell');
      if (this.level >= 4 && t > 5 && n % (this.level >= 5 ? 4 : 5) === 1) kinds.push('brood');
      // off a rock once the rocks have had time to come up the lane, else out of the dark
      const rock = t > (FAR - LEAP_Z) / SPEED + 0.5 && this.r() < 0.5;
      const side = this.r() < 0.5 ? -1 : 1;
      this.waves.push({ t, kinds, rock, sx: this.cx + side * (50 + this.r() * 120), sy: 40 + this.r() * 100, told: false, sent: false });
      t += byLevel(d, 2.9, 2.6) * (0.85 + this.r() * 0.3) * (swarm ? 0.8 : 1);
      n++;
    }
    for (const w of this.waves) this.total += w.kinds.length;
  }

  /** A point in the lane on the screen, and how many pixels a unit is there. */
  private proj(x: number, y: number, z: number): [number, number, number] {
    const s = F / Math.max(0.05, z);
    return [this.cx + x * s, this.cy + y * s, s];
  }

  private bug(kind: Kind, x: number, y: number, z: number): Bug {
    // somewhere on the glass to make for
    const sx = 60 + this.r() * 360;
    const sy = 30 + this.r() * 150;
    const b: Bug = { kind, x, y, z, vx: 0, vy: 0, vz: -this.speed * (kind === 'shell' ? 0.55 : kind === 'brood' ? 0.7 : 1), tx: ((sx - this.cx) * NEAR) / F, ty: ((sy - this.cy) * NEAR) / F, age: 0, leap: 0, rim: 0, hop: 0.6, dart: 0, phase: this.r() * CYCLE * 0.5, scatter: 0, gorged: 0, dead: 0, spin: this.r() * TAU, spinV: (this.r() - 0.5) * 2, hurt: 0, seed: this.r() * 99 };
    this.bugs.push(b);
    return b;
  }

  private rock(x: number, y: number, r: number): Rock {
    const verts: number[] = [];
    for (let k = 0; k < 9; k++) verts.push(0.75 + this.vr() * 0.35);
    const rk: Rock = { x, y, z: FAR + 2, r, spin: this.vr() * TAU, spinV: (this.vr() - 0.5) * 0.8, verts, hurt: 0 };
    this.rocks.push(rk);
    return rk;
  }

  private get live() {
    return this.bugs.filter((b) => !b.dead && !b.rock);
  }

  status() {
    const on = this.crawlers.length;
    return `FUEL ${Math.round(this.fuel * 100)}%  ·  ${on ? `${on} ON THE GLASS` : 'GLASS CLEAR'}  ·  DOWN ${this.downed}/${this.total}`;
  }

  breakdown(): [string, string][] {
    const rows: [string, string][] = [
      ['FUEL KEPT', `${Math.round(this.fuel * 100)}%`],
      ['SHOT DOWN', `${this.downed} / ${this.total}${this.landed ? ` (${this.landed} LANDED)` : ''}`],
      ['ACCURACY', this.shots ? `${Math.round((this.hits / this.shots) * 100)}%` : '-'],
      ['BEST STREAK', this.bestStreak > 1 ? `×${this.bestStreak}` : '-'],
    ];
    if (this.wonBack) rows.push(['FUEL WON BACK', `${Math.round(this.wonBack * 100)}%`]);
    if (this.lanternsHit) rows.push(['LANTERNS SHOT', `${this.lanternsHit}`]);
    return rows;
  }

  /** A prompt, once, the first time something matters. */
  private teach(key: string, text: string, color = '#f4ecd8') {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.prompt = text;
    this.promptT = 2.4;
    this.promptC = color;
  }

  update(dt: number, pad: Pad) {
    this.fx.frozen(dt);
    this.promptT -= dt;
    this.blind = Math.max(0, this.blind - dt);
    this.shownFuel += (this.fuel - this.shownFuel) * Math.min(1, dt * 1.5);
    this.kx *= Math.exp(-dt * 18);
    this.ky *= Math.exp(-dt * 18);
    for (let k = 0; k < 2; k++) {
      this.recoil[k] = Math.max(0, this.recoil[k] - dt * 6);
      this.muzzle[k] = Math.max(0, this.muzzle[k] - dt);
    }
    this.fly(dt);
    this.bits(dt);
    if (this.result !== null) {
      this.outT += dt;
      for (const b of this.bugs) this.drift(b, dt);
      return;
    }
    if (this.gulpT >= 0) return this.gulps(dt);
    const before = LIMIT - this.time;
    this.time += dt;
    if (ticked(before, LIMIT - this.time)) audio.play('ui_move', { pitch: 1.5 });
    if (this.time >= LIMIT) return this.timeUp();
    this.send();
    this.aim(dt, pad);
    this.gun(dt, pad);
    this.shoot(dt);
    for (const b of this.bugs) this.move(b, dt);
    this.bugs = this.bugs.filter((b) => b.dead < 0.8 && b.z < FAR + 4);
    this.drain = 0;
    for (const c of [...this.crawlers]) this.crawl(c, dt);
    this.hum(dt);
  }

  /** The lane coming past: stars, lanterns, rocks; faster as you boost away at the end. */
  private fly(dt: number) {
    const boost = 1 + Math.max(0, this.outT - 0.3) * 10;
    for (const s of this.stars) {
      s.z -= dt * 9 * boost;
      const [x, y] = this.proj(s.x, s.y, s.z);
      if (s.z < 0.5 || x < -20 || x > 500 || y < -20 || y > 260) {
        s.x = (this.vr() - 0.5) * 60;
        s.y = (this.vr() - 0.5) * 36;
        s.z = 34 + this.vr() * 6;
      }
    }
    for (const l of this.lanterns) {
      l.z -= dt * SPEED * boost;
      if (l.broken) l.broken += dt;
      // past you: a new one strung on far down the lane
      if (l.z < 1) {
        l.z += 4 * 4.6;
        l.broken = 0;
      }
    }
    for (const rk of this.rocks) {
      rk.z -= dt * SPEED * boost;
      rk.spin += rk.spinV * dt;
      rk.hurt = Math.max(0, rk.hurt - dt);
    }
    this.rocks = this.rocks.filter((rk) => rk.z > 0.6);
    // now and then a bare rock drifts by: cover for nothing, but in the way
    if (this.result === null && this.gulpT < 0 && (this.nextRock -= dt) <= 0) {
      this.nextRock = 2.6 + this.r() * 2.4;
      const side = this.r() < 0.5 ? -1 : 1;
      this.rock(side * (1.8 + this.r() * 4), -1.6 + this.r() * 2.6, 0.5 + this.r() * 0.7);
    }
  }

  /** Bits in flight, goo on the glass. */
  private bits(dt: number) {
    for (const p of this.debris) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.goo && p.z < 0.45 && p.life > 0) {
        // it hits the glass
        p.life = 0;
        const [x, y] = this.proj(p.x, p.y, 0.45);
        if (x > 0 && x < 480 && y > 0 && y < 212) this.smear(x, y, 2 + this.vr() * 3, p.c, 2.5);
      }
    }
    this.debris = this.debris.filter((p) => p.life > 0 && p.z > 0.1);
    for (const s of this.smears) {
      s.life -= dt;
      s.y += dt * 4 * (s.life / s.max);
    }
    this.smears = this.smears.filter((s) => s.life > 0);
  }

  private smear(x: number, y: number, r: number, c: string, life: number) {
    if (this.smears.length > 60) this.smears.shift();
    this.smears.push({ x, y, r, life, max: life, c, seed: this.vr() * 99 });
  }

  /** The sounds under the play: them drinking. */
  private hum(dt: number) {
    this.slurpT -= dt;
    const n = this.crawlers.length;
    if (n && this.slurpT <= 0) {
      this.slurpT = 0.42 + this.r() * 0.15;
      audio.play('mini_shake_slurp', { vol: Math.min(0.9, 0.35 + n * 0.1), pitch: 0.9 + this.r() * 0.25 });
    }
  }

  /** The waves: eyes in the dark (or peeking off a rock) first, then the wave itself. */
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
      // a rock wave's rock comes up the lane well ahead, its riders out of sight behind it
      if (w.rock && !w.rk && this.time >= w.t - (FAR + 2 - LEAP_Z) / SPEED) {
        const x = ((w.sx - this.cx) * LEAP_Z) / F;
        const rk = (w.rk = this.rock(Math.sign(x) * Math.max(1.5, Math.abs(x)), ((w.sy - this.cy) * LEAP_Z) / F, 0.8 + w.kinds.length * 0.08));
        w.kinds.forEach((k, i) => {
          const b = this.bug(k, rk.x, rk.y, rk.z + 0.3);
          b.rock = rk;
          b.leap = w.t + i * 0.2;
          b.rim = -Math.PI / 2 + (i - (w.kinds.length - 1) / 2) * 0.9 + (rk.x > 0 ? -0.6 : 0.6);
        });
      }
      if (!w.told && this.time >= w.t - this.tell) {
        w.told = true;
        audio.play('mini_shake_tell', { vol: 0.8, pitch: w.kinds.includes('shell') ? 0.8 : 1 });
      }
      if (!w.sent && this.time >= w.t) {
        w.sent = true;
        if (!w.rock)
          w.kinds.forEach((k, i) => {
            const [ox, oy] = this.eyeAt(w, i);
            this.bug(k, ((ox - this.cx) * FAR) / F, ((oy - this.cy) * FAR) / F, FAR);
          });
        if (w.kinds.includes('skipper')) this.teach('skipper', 'SKIPPERS HOP: CATCH THEM WHEN THEY STOP', '#8affe0');
        if (w.kinds.includes('shell')) this.teach('shell', 'A SHELLBACK: SHOOT IT WHEN THE SHELL OPENS', '#ffd04a');
        if (w.kinds.includes('brood')) this.teach('brood', 'A BROOD: SHOOT HER, THEN HER YOUNG', '#c8ff8a');
      }
    }
  }

  /** Where in the dark a dark wave's i-th one is, on the screen. */
  private eyeAt(w: Wave, i: number): [number, number] {
    const n = w.kinds.length;
    const a = i * 2.4 + w.t;
    const r = n > 1 ? 14 + i * 3 : 0;
    return [w.sx + Math.cos(a) * r, w.sy + Math.sin(a) * r * 0.7];
  }

  /**
   * The reticle: the stick swings it, slow at first for the fine work and quicker the longer it's
   * held one way. It drags a little over something worth shooting.
   */
  private aim(dt: number, pad: Pad) {
    const m = Math.min(1, Math.hypot(pad.x, pad.y));
    let wx = 0;
    let wy = 0;
    if (m > 0.15) {
      const dx = pad.x / m;
      const dy = pad.y / m;
      // turning back on yourself starts slow again
      if (dx * this.lastDir[0] + dy * this.lastDir[1] < 0.5) this.held = 0;
      this.lastDir = [dx, dy];
      this.held += dt;
      const ramp = clamp(this.held / 0.45, 0, 1);
      const sp = (95 + 270 * ramp * ramp) * m ** 1.4 * (this.over === 1 ? 0.62 : 1);
      wx = dx * sp;
      wy = dy * sp;
    } else this.held = 0;
    const k = Math.min(1, dt * 22);
    this.avx += (wx - this.avx) * k;
    this.avy += (wy - this.avy) * k;
    this.ax = clamp(this.ax + this.avx * dt, 12, 468);
    this.ay = clamp(this.ay + this.avy * dt, 12, 204);
    this.over = 0;
    for (const c of this.crawlers) if (Math.hypot(c.x - this.ax, c.y - this.ay) < GLASS[c.kind]) this.over = 1;
    for (const b of this.live) {
      const [x, y, s] = this.proj(b.x, b.y, b.z);
      if (Math.hypot(x - this.ax, y - this.ay) < Math.max(4, SIZE[b.kind] * s + 2)) this.over = 1;
    }
    if (!this.over)
      for (const l of this.lanterns) {
        const [x, y, s] = this.proj(l.x, l.y, l.z);
        if (!l.broken && Math.hypot(x - this.ax, y - this.ay) < 0.3 * s + 2) this.over = 2;
      }
  }

  /** The twin guns: a press fires, holding it keeps firing a little slower; too hot and they vent. */
  private gun(dt: number, pad: Pad) {
    this.cd -= dt;
    if (this.vent > 0) {
      this.vent -= dt;
      this.heat = Math.max(0, this.vent / VENT);
      if (this.vr() < dt * 30) for (const k of [0, 1]) this.fx.spark(this.tip(k)[0], this.tip(k)[1], (this.vr() - 0.5) * 30, -30 - this.vr() * 30, 0.6, '#8a8098', { glow: false, size: 2, drag: 1 });
      if (this.vent <= 0) {
        this.heat = 0;
        this.fx.word('GUNS READY', this.cx, 190, '#8affb0');
      }
      if (pad.press) audio.play('dash_dry', { vol: 0.5 });
      return;
    }
    this.heat = Math.max(0, this.heat - dt * COOL);
    if ((pad.press && this.cd <= 0) || (pad.hold && this.cd <= -0.06)) this.fire();
  }

  /** Where a gun's muzzle is: they swing to follow the reticle. */
  private tip(k: number): [number, number] {
    const px = k ? 446 : 34;
    const py = 236;
    const a = Math.atan2(this.ay - py, this.ax - px);
    const len = 54 - this.recoil[k] * 10;
    return [px + Math.cos(a) * len, py + Math.sin(a) * len];
  }

  private fire() {
    this.cd = 0.11;
    const k = (this.side = 1 - this.side);
    const [mx, my] = this.tip(k);
    this.bolts.push({ ax: this.ax, ay: this.ay, mx, my, z: 0, hot: this.streak >= HOT, hits: 0, passed: new Set(), done: false });
    this.shots++;
    this.heat += HEAT_SHOT;
    this.recoil[k] = 1;
    this.muzzle[k] = 0.06;
    // the kick climbs the reticle, so held fire wanders
    this.ay -= 2.5;
    this.ax += (this.vr() - 0.5) * 3;
    this.kx += (this.cx - mx) * 0.012;
    this.ky += 1.4;
    this.fx.spark(mx, my, (k ? -1 : 1) * 40, 30, 0.35, '#c8a060', { glow: false, size: 2, grav: 300 });
    audio.play('mini_shake_shot', { vol: 0.65, pitch: (k ? 1.04 : 0.97) + this.vr() * 0.05 });
    if (this.heat >= 1) {
      this.vent = VENT;
      this.heat = 1;
      this.fx.word('OVERHEAT', this.cx, 190, '#ff5a4a', 1, { pop: true, life: 1 });
      this.fx.shake(2);
      audio.play('mini_shake_vent', { vol: 0.8 });
      this.teach('heat', 'MISSES HEAT THE GUNS. HITS COOL THEM', '#ff8a5a');
    }
  }

  /** The bolts going out: each hits the first thing in its line as it passes that depth. */
  private shoot(dt: number) {
    for (const b of this.bolts) {
      const z0 = b.z;
      const z1 = (b.z += BOLT * dt);
      const near = (x: number, y: number, r: number) => Math.hypot(x - b.ax, y - b.ay) < r;
      // on the glass, first
      if (z0 === 0)
        for (let i = this.crawlers.length - 1; i >= 0 && !b.done; i--) {
          const c = this.crawlers[i];
          if (near(c.x, c.y, GLASS[c.kind] + 2)) this.hitCrawler(b, c);
        }
      // then out down the lane, nearest first: each thing is passed (hit or not) as the bolt reaches its depth
      const things: { o: { x: number; y: number; z: number }; r: (s: number) => number; hit: () => void }[] = [];
      for (const g of this.live) things.push({ o: g, r: (s) => Math.max(4, SIZE[g.kind] * s + 2.5), hit: () => this.hitBug(b, g) });
      for (const rk of this.rocks) things.push({ o: rk, r: (s) => rk.r * 0.85 * s, hit: () => this.hitRock(b, rk) });
      for (const l of this.lanterns) if (!l.broken) things.push({ o: l, r: (s) => 0.3 * s + 1, hit: () => this.hitLantern(b, l) });
      things.sort((p, q) => p.o.z - q.o.z);
      for (const { o, r, hit } of things) {
        if (b.done) break;
        if (o.z > z1 || b.passed.has(o)) continue;
        b.passed.add(o);
        const [x, y, s] = this.proj(o.x, o.y, o.z);
        if (near(x, y, r(s))) hit();
      }
      if (!b.done && z1 > FAR + 2) {
        b.done = true;
        if (!b.hits) this.miss();
      }
    }
    this.bolts = this.bolts.filter((b) => !b.done);
  }

  /** A shot that found nothing: the streak's gone. */
  private miss() {
    if (this.streak >= 3) this.fx.word('STREAK LOST', this.ax, this.ay - 16, '#8a7e9a');
    this.streak = 0;
  }

  /** A clean hit: the streak climbs, and on a hot streak the bolt goes on through. */
  private scored(b: Bolt) {
    b.hits++;
    this.hits++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.heat = Math.max(0, this.heat - HEAT_HIT);
    if (!b.hot) b.done = true;
    if (this.streak === HOT) {
      this.fx.word('HOT STREAK', this.cx, 34, '#ffd04a', 2, { pop: true, life: 1.1 });
      this.fx.ring(this.ax, this.ay, 40, '#ffd04a', 0.35);
      audio.play('mini_shake_hot', { vol: 0.8 });
      this.teach('hot', 'HOT STREAK: THE BOLTS GO THROUGH', '#ffd04a');
    }
  }

  private shellShut(phase: number) {
    return phase % CYCLE < OPEN;
  }

  /** A bolt bouncing off a shut shell: no harm done, to either of you. */
  private clang(b: Bolt, x: number, y: number) {
    b.done = true;
    b.hits++;
    this.fx.burst(x, y, 8, 120, ['#ffffff', '#c8c0e0', '#ffd04a'], { life: 0.3 });
    this.fx.word('CLANG', x, y - 14, '#a8a0c0');
    audio.play('mini_shake_clang', { vol: 0.7, pitch: 0.9 + this.vr() * 0.2 });
    this.teach('shell', 'A SHELLBACK: SHOOT IT WHEN THE SHELL OPENS', '#ffd04a');
  }

  private hitBug(b: Bolt, g: Bug) {
    const [x, y] = this.proj(g.x, g.y, g.z);
    if (g.kind === 'shell' && this.shellShut(g.phase)) return this.clang(b, x, y);
    this.scored(b);
    this.kill(g);
  }

  private hitCrawler(b: Bolt, c: Crawler) {
    if (c.kind === 'shell' && this.shellShut(c.phase)) return this.clang(b, c.x, c.y);
    this.scored(b);
    this.crawlers.splice(this.crawlers.indexOf(c), 1);
    this.downed++;
    // it lets go of the glass and drops away into the dark, leaving its mess
    const g = this.bug(c.kind, ((c.x - this.cx) * NEAR) / F, ((c.y - this.cy) * NEAR) / F, NEAR);
    g.dead = 0.01;
    g.vz = 3;
    g.vx = g.vy = 0;
    g.spinV = (this.vr() - 0.5) * 16;
    this.smear(c.x, c.y, GLASS[c.kind] * 0.7, this.goo(c.kind), 6);
    for (let k = 0; k < 5; k++) this.smear(c.x + (this.vr() - 0.5) * 40, c.y + (this.vr() - 0.5) * 30, 2 + this.vr() * 4, this.goo(c.kind), 4);
    this.fx.burst(c.x, c.y, 18, 160, [this.goo(c.kind), '#ffffff', '#ffd04a']);
    this.fx.ring(c.x, c.y, 34, '#ffd04a', 0.3);
    this.fx.shake(3);
    this.fx.word(this.streak > 1 ? `OFF! ×${this.streak}` : 'OFF!', c.x, c.y - 24, '#ffd04a', 1, { pop: true });
    this.killSound(c.kind, 1);
  }

  private hitRock(b: Bolt, rk: Rock) {
    b.done = true;
    rk.hurt = 0.08;
    const [x, y] = [b.ax, b.ay];
    this.fx.burst(x, y, 6, 70, ['#ffd890', '#8a7e9a'], { life: 0.3 });
    audio.play('mini_shake_tink', { vol: 0.5, pitch: 0.9 + this.vr() * 0.3 });
    if (!b.hits) this.miss();
  }

  /** A lantern shot out: a white burst that blinds you, and the lane-keepers' light gone. */
  private hitLantern(b: Bolt, l: Lantern) {
    b.done = true;
    l.broken = 0.01;
    this.lanternsHit++;
    this.blind = 1.1;
    this.streak = 0;
    const [x, y] = this.proj(l.x, l.y, l.z);
    this.fx.burst(x, y, 30, 200, ['#ffffff', '#fff0c0', '#ffd890']);
    this.fx.ring(x, y, 80, '#ffffff', 0.4);
    this.fx.shake(4, 0.3);
    audio.play('mini_shake_lantern', { vol: 0.9 });
    this.teach('lantern', 'NOT THE LANTERNS: THEY BLIND YOU', '#fff0c0');
  }

  private goo(kind: Kind) {
    return kind === 'skipper' ? '#6ad8b0' : kind === 'brood' || kind === 'nymph' ? '#b8e070' : kind === 'shell' ? '#ffb04a' : '#e8783a';
  }

  private killSound(kind: Kind, vol: number) {
    const n = STEPS[Math.min(STEPS.length - 1, Math.max(0, this.streak - 1))];
    audio.play('mini_shake_kill', { vol: 0.8 * vol, pitch: 2 ** (n / 12) * (kind === 'nymph' ? 1.3 : 1) });
  }

  /** Shot out of the lane: it bursts in a spray of shell and goo, some of it onto the glass. */
  private kill(g: Bug, burst = false) {
    const [x, y, s] = this.proj(g.x, g.y, g.z);
    g.dead = 0.01;
    g.spinV = (this.vr() < 0.5 ? -1 : 1) * (8 + this.vr() * 8);
    g.hurt = 0.06;
    const c = this.goo(g.kind);
    for (let k = 0; k < (g.kind === 'shell' ? 16 : 9); k++) {
      const a = this.vr() * TAU;
      const v = 1 + this.vr() * 2.5;
      const goo = this.vr() < 0.5;
      // goo sprays forward, some of it all the way to the glass
      this.debris.push({ x: g.x, y: g.y, z: g.z, vx: g.vx * 0.5 + Math.cos(a) * v, vy: g.vy * 0.5 + Math.sin(a) * v, vz: g.vz * 0.5 + (goo ? -3 - this.vr() * 5 : (this.vr() - 0.5) * 3), life: 0.5 + this.vr() * 0.5, max: 1, c: goo ? c : '#d8c4a0', goo });
    }
    this.fx.burst(x, y, Math.round(8 + s * 0.15), 50 + s * 0.6, [c, '#ffffff', '#ffd890'], { life: 0.4 });
    this.fx.ring(x, y, 10 + SIZE[g.kind] * s, burst ? '#ff8a5a' : '#ffd890', 0.25);
    if (g.gorged) {
      // your fuel, back out of it
      this.fuel = Math.min(1, this.fuel + g.gorged);
      this.wonBack += g.gorged;
      this.fx.word(`+${Math.round(g.gorged * 100)}% FUEL`, x, y - 14, '#ffd04a', 1, { pop: true, life: 1.2 });
      this.fx.burst(x, y, 20, 120, ['#ffd04a', '#ffb04a', '#fff0c0']);
      audio.play('mini_shake_refund', { vol: 0.8 });
    } else {
      this.downed++;
      if (!burst) this.fx.word(this.streak > 1 ? `×${this.streak}` : 'HIT', x, y - 10 - SIZE[g.kind] * s, this.streak >= HOT ? '#ffd04a' : '#f4ecd8', 1, { pop: this.streak >= 3 });
    }
    this.killSound(g.kind, burst ? 0.5 : 1);
    if (g.kind === 'shell') this.burst(g);
    if (g.kind === 'brood') this.hatch(g);
  }

  /** A shot shellback bursts, and takes anything flying close by with it. */
  private burst(g: Bug) {
    const [x, y, s] = this.proj(g.x, g.y, g.z);
    this.fx.ring(x, y, BURST * s, '#ff8a5a', 0.35);
    this.fx.flash('#ff8a5a', 0.08);
    this.fx.shake(5, 0.3);
    audio.play('mini_shake_burst', { vol: 0.9 });
    let n = 0;
    for (const o of this.live) {
      if (o === g || Math.hypot(o.x - g.x, o.y - g.y, o.z - g.z) > BURST) continue;
      this.kill(o, true);
      n++;
    }
    if (n) this.fx.word(n > 1 ? `BURST ×${n}` : 'BURST!', x, y - 26, '#ff8a5a', 1, { pop: true });
  }

  /** A shot brood bursts into her young: a scatter of little ones that turn and dive at you. */
  private hatch(g: Bug) {
    const n = this.level >= 5 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + this.r() * 0.5;
      const y = this.bug('nymph', g.x, g.y, g.z);
      y.vx = Math.cos(a) * 2.6;
      y.vy = Math.sin(a) * 2;
      y.vz = -0.6;
      y.scatter = 0.9 + this.r() * 0.3;
    }
    this.total += n;
    audio.play('mini_shake_egg', { vol: 0.8, pitch: 0.8 });
  }

  private drift(b: Bug, dt: number) {
    b.age += dt;
    b.spin += b.spinV * dt;
    b.hurt = Math.max(0, b.hurt - dt);
    if (b.dead || b.fled) {
      if (b.dead) b.dead += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
    }
  }

  private move(b: Bug, dt: number) {
    b.phase += dt;
    if (b.dead || b.fled) return this.drift(b, dt);
    b.age += dt;
    b.hurt = Math.max(0, b.hurt - dt);
    if (b.kind === 'shell' && b.phase % CYCLE >= OPENING && (b.phase - dt) % CYCLE < OPENING && b.z < 13) audio.play('mini_shake_open', { vol: 0.5, pitch: 0.9 + this.vr() * 0.2 });
    if (b.rock) {
      // out of sight behind its rock, riding it up the lane, until it leaps
      const rk = b.rock;
      b.x = rk.x + Math.cos(b.rim) * rk.r * 0.6;
      b.y = rk.y + Math.sin(b.rim) * rk.r * 0.6;
      b.z = rk.z + 0.3;
      if (this.time >= b.leap) {
        b.rock = undefined;
        b.z = rk.z - 0.3;
        b.vx = Math.cos(b.rim) * 2;
        b.vy = Math.sin(b.rim) * 2;
        audio.play('mini_shake_hop', { vol: 0.5, pitch: 0.8 });
      }
      return;
    }
    if (b.gorged) {
      // full, and off back into the dark with it, wobbling under the weight
      b.vz = 3.4;
      b.x += Math.sin(b.age * 5 + b.seed) * dt * 0.8;
      b.z += b.vz * dt;
      b.spin += dt;
      if (b.z > FAR - 2) {
        const [x, y] = this.proj(b.x, b.y, b.z);
        b.dead = 1;
        this.fx.word(`-${Math.round(b.gorged * 100)}% GONE`, x, y - 10, '#ff8a5a');
      }
      return;
    }
    if (b.scatter > 0) {
      // a nymph flung out of the burst, slowing, then it turns and dives
      b.scatter -= dt;
      b.vx *= Math.exp(-dt * 2.5);
      b.vy *= Math.exp(-dt * 2.5);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.scatter <= 0) {
        b.vz = -this.speed * 1.25;
        b.tx = b.x * (NEAR / b.z) + (this.r() - 0.5) * 0.6;
        b.ty = b.y * (NEAR / b.z) + (this.r() - 0.5) * 0.4;
      }
      return;
    }
    let vz = b.vz;
    if (b.kind === 'skipper') {
      // it holds, tucked, then darts sideways and on; the hold is the moment to take it
      if (b.dart > 0) {
        b.dart -= dt;
        vz = -this.speed * 2.2;
      } else {
        vz = -this.speed * 0.25;
        if ((b.hop -= dt) <= 0) {
          b.dart = 0.26;
          b.hop = byLevel(this.d, 0.8, 0.5) + this.r() * 0.3;
          const side = this.r() < 0.5 ? -1 : 1;
          const jump = (b.z * (26 + this.r() * 30)) / F;
          const toward = (b.tx * b.z) / NEAR - b.x;
          b.vx = (toward * 0.35 + side * jump) / 0.26;
          b.vy = (((b.ty * b.z) / NEAR - b.y) * 0.35 + (this.r() - 0.5) * jump * 0.6) / 0.26;
          b.spin = Math.atan2(b.vy, b.vx);
          if (b.z < 12) audio.play('mini_shake_hop', { vol: 0.45, pitch: 1 + this.vr() * 0.3 });
        }
      }
      b.x += (b.dart > 0 ? b.vx : 0) * dt;
      b.y += (b.dart > 0 ? b.vy : 0) * dt;
    } else {
      // make for its spot on the glass, weaving
      const left = Math.max(0.25, (b.z - NEAR) / -vz);
      const k = Math.min(1, dt * 3);
      b.vx += ((b.tx - b.x) / left - b.vx) * k;
      b.vy += ((b.ty - b.y) / left - b.vy) * k;
      const weave = b.kind === 'shell' ? 0.3 : 0.9;
      b.x += (b.vx + Math.sin(b.age * 4 + b.seed) * weave) * dt;
      b.y += (b.vy + Math.cos(b.age * 3.1 + b.seed) * weave * 0.6) * dt;
      b.spin += dt * (b.kind === 'shell' ? 0.6 : 1.5);
    }
    b.z += vz * dt;
    if (b.z <= NEAR) this.land(b);
  }

  /** One reaches the glass: a thump, a crack, and it's on, biting. */
  private land(b: Bug) {
    let [x, y] = this.proj(b.x, b.y, NEAR);
    x = clamp(x, 36, 444);
    y = clamp(y, 22, 196);
    b.dead = 1;
    this.landed++;
    this.crawlers.push({ kind: b.kind, x, y, on: 0, drank: 0, phase: b.phase, hurt: 0.2, seed: b.seed, face: Math.atan2(y - this.cy, x - this.cx) });
    const bite = BITE * this.hunger * THIRST[b.kind];
    this.fuel = Math.max(0, this.fuel - bite);
    if (this.cracks.length < 14) this.cracks.push({ x, y, r: GLASS[b.kind] * 1.4, seed: this.vr() * 99 });
    this.fx.shake(b.kind === 'shell' ? 5 : 3, 0.2);
    this.fx.burst(x, y, 10, 90, ['#c8e0ff', '#ffffff', this.goo(b.kind)], { life: 0.35 });
    this.fx.word('ON THE GLASS', x, y - 26, '#ff5a4a');
    this.ky += 2;
    audio.play('mini_shake_land', { vol: 0.85, pitch: b.kind === 'shell' ? 0.75 : b.kind === 'nymph' ? 1.4 : 1 });
    this.teach('glass', "ONE'S ON THE GLASS! SHOOT IT OFF", '#ff5a4a');
  }

  /** On the glass: it crawls for the fuel lines round the frame and drinks till it's full. */
  private crawl(c: Crawler, dt: number) {
    c.on += dt;
    c.phase += dt;
    c.hurt = Math.max(0, c.hurt - dt);
    const sip = SIP * this.hunger * THIRST[c.kind] * dt;
    this.fuel = Math.max(0, this.fuel - sip);
    c.drank += sip;
    this.drain += SIP * this.hunger * THIRST[c.kind];
    // the nearest frame edge: the pillars, or the bar over the top
    const ex = c.x < this.cx ? 34 : 446;
    const toSide = Math.abs(c.x - ex);
    const [tx, ty] = c.y - 22 < toSide ? [c.x, 22] : [ex, c.y];
    const d = Math.hypot(tx - c.x, ty - c.y);
    if (d > 2) {
      c.face += Math.atan2(Math.sin(Math.atan2(ty - c.y, tx - c.x) - c.face), Math.cos(Math.atan2(ty - c.y, tx - c.x) - c.face)) * Math.min(1, dt * 4);
      const sp = (c.kind === 'skipper' ? 30 : c.kind === 'shell' ? 10 : 18) * dt;
      c.x += ((tx - c.x) / d) * Math.min(sp, d);
      c.y += ((ty - c.y) / d) * Math.min(sp, d);
    }
    if (c.on >= FULL) {
      // full: it lets go and makes off with it
      this.crawlers.splice(this.crawlers.indexOf(c), 1);
      const g = this.bug(c.kind, ((c.x - this.cx) * NEAR) / F, ((c.y - this.cy) * NEAR) / F, NEAR + 0.1);
      g.gorged = c.drank;
      g.phase = c.phase;
      this.fx.word('FULL', c.x, c.y - 22, '#ffb04a');
      audio.play('mini_shake_gulp', { vol: 0.7, pitch: 1.1 });
      this.teach('gorged', "IT'S FULL OF YOUR FUEL: SHOOT IT TO GET IT BACK", '#ffd04a');
    }
  }

  /** Time: the ones in flight peel off, and every one on the glass takes a last gulp. */
  private timeUp() {
    for (const b of this.bugs) {
      if (b.dead) continue;
      b.fled = true;
      b.rock = undefined;
      b.vz = 4;
      b.vx = b.x * 0.4;
      b.vy = b.y * 0.4;
    }
    this.bolts = [];
    this.gulpT = 0.5;
    this.fx.word('TIME', this.cx, 40, '#f4ecd8', 2, { pop: true });
  }

  private gulps(dt: number) {
    this.drain = 0;
    for (const b of this.bugs) this.drift(b, dt);
    for (const c of this.crawlers) c.phase += dt;
    this.gulpT -= dt;
    if (this.gulpT > 0) return;
    const c = this.crawlers.shift();
    if (!c) {
      if (this.gulped === 0) {
        this.fx.word('GLASS CLEAR', this.cx, 40, '#8affb0', 2, { pop: true, life: 1.2 });
        this.fx.ring(this.ax, this.ay, 90, '#8affb0', 0.5);
        audio.play('mini_shake_clear');
      }
      this.result = clamp((this.fuel - 0.35) / 0.6, 0, 1);
      audio.play('boost', { vol: 0.6 });
      return;
    }
    const gulp = 0.035 * THIRST[c.kind];
    this.fuel = Math.max(0, this.fuel - gulp);
    this.fx.word(`-${Math.round(gulp * 100)}%`, c.x, c.y - 14, '#ff5a4a', 1, { pop: true });
    this.fx.burst(c.x, c.y, 10, 60, ['#ffd04a', '#ff8a3a']);
    this.fx.shake(3);
    audio.play('mini_shake_gulp', { vol: 0.9, pitch: c.kind === 'shell' ? 0.75 : 1 });
    // full, it lets go and drops away
    const g = this.bug(c.kind, ((c.x - this.cx) * NEAR) / F, ((c.y - this.cy) * NEAR) / F, NEAR);
    g.fled = true;
    g.gorged = c.drank + gulp;
    g.vz = 3.5;
    this.gulped++;
    this.gulpT = 0.28;
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    this.scene(ctx, w, h, t);
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(Math.round(ox + this.kx), Math.round(oy + this.ky));
    // the lane, far to near
    const items: [number, () => void][] = [];
    for (const rk of this.rocks) items.push([rk.z, () => this.drawRock(ctx, rk, t)]);
    for (const l of this.lanterns) items.push([l.z, () => this.drawLantern(ctx, l, t)]);
    for (const b of this.bugs) if (!b.rock) items.push([b.z, () => this.drawBug(ctx, b, t)]);
    for (const p of this.debris) items.push([p.z, () => this.drawDebris(ctx, p)]);
    items.sort((a, b) => b[0] - a[0]);
    for (const [, f] of items) f();
    this.tells(ctx, t);
    this.drawBolts(ctx);
    this.glass(ctx, t);
    ctx.restore();
    if (this.time >= SWARM && this.gulpT < 0 && this.result === null) {
      const p = 0.05 + 0.04 * Math.sin(t * 4);
      ctx.fillStyle = `rgba(255,40,40,${p})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.frame(ctx, w, h, t);
    this.guns(ctx);
    if (this.result === null && this.gulpT < 0) this.reticle(ctx, t);
    this.fx.drawSparks(ctx);
    this.fx.drawWords(ctx);
    if (this.blind > 0) {
      ctx.fillStyle = `rgba(255,250,235,${Math.min(0.92, this.blind * 1.3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    vignette(ctx, w, h, 0.5);
    this.dash(ctx, w, h, t);
    timer(ctx, w, LIMIT - this.time, LIMIT, t);
    if (this.promptT > 0) {
      ctx.globalAlpha = Math.min(1, this.promptT * 3);
      this.panel(ctx, w / 2 - 140, 9, 280, 15);
      drawText(ctx, this.prompt, w / 2, 13, this.promptC, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    this.fx.drawFlash(ctx, w, h);
  }

  /** Down the lane: a blue-gold nebula, the gold world the lanterns lead to, stars streaming past. */
  private scene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#06050d';
    ctx.fillRect(0, 0, w, h);
    nebula(ctx, w, h, 0x1eec, [40, 80, 170], [170, 110, 40], t * 2);
    const px = this.cx + 64;
    const py = this.cy - 34;
    glow(ctx, px, py, 110, '#ffb04a', 0.2);
    const g = ctx.createRadialGradient(px - 7, py - 6, 2, px, py, 22);
    g.addColorStop(0, '#fff0c0');
    g.addColorStop(0.35, '#f0b060');
    g.addColorStop(0.8, '#9a5a2a');
    g.addColorStop(1, '#3a1a14');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, 20, 0, TAU);
    ctx.fill();
    // stars, streaking out from the middle as you fly
    const boost = 1 + Math.max(0, this.outT - 0.3) * 10;
    for (const s of this.stars) {
      const [x, y] = this.proj(s.x, s.y, s.z);
      const [x0, y0] = this.proj(s.x, s.y, s.z + 0.5 * boost);
      const f = clamp(1 - s.z / 36, 0, 1);
      ctx.strokeStyle = f > 0.75 ? '#f4ecd8' : f > 0.45 ? '#a89cc0' : '#5a5070';
      ctx.globalAlpha = 0.4 + f * 0.6;
      ctx.lineWidth = f > 0.85 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Far things fade into the dark. */
  private haze(z: number) {
    return 0.45 + 0.55 * clamp((FAR + 2 - z) / 8, 0, 1);
  }

  private drawRock(ctx: CanvasRenderingContext2D, rk: Rock, t: number) {
    const [x, y, s] = this.proj(rk.x, rk.y, rk.z);
    const R = rk.r * s;
    if (x + R < -10 || x - R > 490 || y + R < -10 || y - R > 250) return;
    ctx.save();
    ctx.globalAlpha = this.haze(rk.z);
    ctx.beginPath();
    rk.verts.forEach((v, k) => {
      const a = rk.spin + (k / rk.verts.length) * TAU;
      const px = x + Math.cos(a) * R * v;
      const py = y + Math.sin(a) * R * v;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = rk.hurt > 0 ? '#8a7e9a' : '#2a2236';
    ctx.fill();
    ctx.save();
    ctx.clip();
    // lit from the gold world, up and right
    const g = ctx.createRadialGradient(x + R * 0.5, y - R * 0.5, 0, x + R * 0.3, y - R * 0.3, R * 1.3);
    g.addColorStop(0, 'rgba(255,190,110,0.55)');
    g.addColorStop(0.5, 'rgba(120,90,110,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, R * 2, R * 2);
    // pits
    ctx.fillStyle = 'rgba(10,6,16,0.45)';
    for (let k = 0; k < 4; k++) {
      const a = rk.spin + k * 1.9;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.4, Math.max(0.5, R * (0.1 + (k % 2) * 0.06)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = DARK;
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.stroke();
    ctx.restore();
    // riders peeking over its rim, eyes first, the moment before they leap
    for (const b of this.bugs) {
      if (b.rock !== rk) continue;
      const f = clamp(1 - (b.leap - this.time) / this.tell, 0, 1);
      if (f <= 0) continue;
      const ex = x + Math.cos(b.rim) * R * (0.75 + f * 0.25);
      const ey = y + Math.sin(b.rim) * R * (0.75 + f * 0.25);
      if (f > 0.5) this.body(ctx, ex, ey, SIZE[b.kind] * s * 0.8, b, t, { tuck: 0.5, alpha: (f - 0.5) * 2 });
      if (Math.sin(t * 9 + b.seed) > 0.8 - f) this.eyes(ctx, ex, ey, Math.max(1, SIZE[b.kind] * s * 0.3), b.kind, 0.5 + f * 0.5);
    }
  }

  /** A pair of eyes in the dark. */
  private eyes(ctx: CanvasRenderingContext2D, x: number, y: number, gap: number, kind: Kind, a: number) {
    const col = kind === 'shell' ? '#ffd04a' : kind === 'skipper' ? '#8affe0' : kind === 'brood' ? '#c8ff8a' : '#ff5a4a';
    glow(ctx, x, y, 6 + gap * 2, col, 0.4 * a);
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    const s = kind === 'shell' || kind === 'brood' ? 2 : 1;
    ctx.fillRect(Math.round(x - gap - s), Math.round(y), s + 1, s);
    ctx.fillRect(Math.round(x + gap), Math.round(y), s + 1, s);
    ctx.globalAlpha = 1;
  }

  /** A dark wave's eyes, far off down the lane, brighter as it comes. */
  private tells(ctx: CanvasRenderingContext2D, t: number) {
    for (const w of this.waves) {
      if (w.rock || !w.told || w.sent) continue;
      const f = clamp(1 - (w.t - this.time) / this.tell, 0, 1);
      ctx.fillStyle = `rgba(4,2,8,${0.25 + f * 0.25})`;
      ctx.beginPath();
      ctx.arc(w.sx, w.sy, 10 + w.kinds.length * 4, 0, TAU);
      ctx.fill();
      w.kinds.forEach((k, i) => {
        if (Math.sin(t * 7 + i * 2.3) > 0.85) return;
        const [x, y] = this.eyeAt(w, i);
        this.eyes(ctx, x, y, k === 'shell' || k === 'brood' ? 3 : 2, k, 0.4 + f * 0.6);
      });
    }
  }

  private drawLantern(ctx: CanvasRenderingContext2D, l: Lantern, t: number) {
    const [x, y, s] = this.proj(l.x, l.y, l.z);
    const R = 0.3 * s;
    if (x + R < -20 || x - R > 500 || y - R > 260) return;
    const lit = !l.broken;
    const flick = 0.85 + 0.15 * Math.sin(t * 9 + l.seed);
    ctx.save();
    ctx.globalAlpha = this.haze(l.z);
    if (lit) glow(ctx, x, y, R * 5 + 6, '#ffb04a', 0.35 * flick);
    if (R < 2) {
      ctx.fillStyle = lit ? '#ffe0a0' : '#4a4058';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 2);
      ctx.restore();
      return;
    }
    // the cage: a brass hoop top and bottom, ribs, the light in it
    const lw = Math.max(1, R * 0.16);
    if (lit) {
      ctx.fillStyle = '#fff0c0';
      ctx.beginPath();
      ctx.ellipse(x, y, R * 0.5, R * 0.75, 0, 0, TAU);
      ctx.fill();
      glow(ctx, x, y, R * 1.6, '#ffd890', 0.6 * flick);
    } else {
      ctx.fillStyle = '#1a1424';
      ctx.beginPath();
      ctx.ellipse(x, y, R * 0.5, R * 0.75, 0, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = lit ? '#b8803a' : '#4a3a2a';
    ctx.lineWidth = lw;
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + k * R * 0.55, y - R);
      ctx.quadraticCurveTo(x + k * R * 0.95, y, x + k * R * 0.55, y + R);
      ctx.stroke();
    }
    ctx.fillStyle = lit ? '#d8a050' : '#4a3a2a';
    ctx.fillRect(x - R * 0.7, y - R * 1.15, R * 1.4, R * 0.3);
    ctx.fillRect(x - R * 0.5, y + R * 0.95, R, R * 0.25);
    // its tether, up into the dark
    ctx.strokeStyle = 'rgba(120,100,80,0.5)';
    ctx.lineWidth = Math.max(1, lw * 0.5);
    ctx.beginPath();
    ctx.moveTo(x, y - R * 1.15);
    ctx.lineTo(x, y - R * 8);
    ctx.stroke();
    ctx.restore();
  }

  private drawBug(ctx: CanvasRenderingContext2D, b: Bug, t: number) {
    const [x, y, s] = this.proj(b.x, b.y, b.z);
    const R = SIZE[b.kind] * s;
    if (x + R < -20 || x - R > 500 || y + R < -20 || y - R > 260) return;
    const alpha = this.haze(b.z) * (b.dead ? Math.max(0, 1 - b.dead / 0.7) : b.fled ? clamp(1 - (b.z - 6) / 8, 0, 1) : 1);
    // head-on it comes out at you, so it faces out from the middle; full, it heads back in
    const face = b.dead ? b.spin : Math.atan2(y - this.cy, x - this.cx) + (b.gorged || b.fled ? Math.PI : 0) + Math.sin(b.age * 3 + b.seed) * 0.2;
    this.body(ctx, x, y, R, { ...b, spin: face }, t, { tuck: b.dead ? 1 : b.kind === 'skipper' && b.dart <= 0 && b.hop < 0.2 ? 0.8 : 0, alpha, hurt: b.hurt > 0 || (b.dead > 0 && b.dead < 0.06), gorged: b.gorged > 0 });
  }

  /**
   * A lane-louse: a flat armoured thing, plated in segments like a woodlouse, a bone head-shield
   * with a row of eyes and a pair of feelers, and a great many legs down both sides, going all the
   * time. Drawn head-on along `spin`; on the glass, flat to it, its mouth working at the plating.
   */
  private body(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, b: { kind: Kind; spin: number; seed: number; phase: number }, t: number, o: { tuck?: number; alpha?: number; hurt?: boolean; gorged?: boolean; flat?: boolean; drink?: number } = {}) {
    const kind = b.kind;
    // plate, plate's lit edge, seams and legs, head-shield
    const pal = o.gorged
      ? ['#c86a2a', '#ffb060', '#4a1e0e', '#ffd890']
      : kind === 'skipper'
        ? ['#2e7a72', '#5ab0a0', '#0e2e2c', '#bfe8d8']
        : kind === 'shell'
          ? ['#4a4660', '#7a76a0', '#141020', '#a8a4c0']
          : kind === 'brood'
            ? ['#9a9e6a', '#c8cc98', '#2e321a', '#e8ecc8']
            : kind === 'nymph'
              ? ['#88a058', '#b8d088', '#28361a', '#e8f0c0']
              : ['#8a3a32', '#b8604a', '#2a0e12', '#d8c4a0'];
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    if (R < 2.4) {
      ctx.fillStyle = pal[0];
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(Math.round(x), Math.round(y) - 1, 1, 1);
      ctx.restore();
      return;
    }
    if (o.gorged) {
      R *= 1.2;
      glow(ctx, x, y, R * 2.2, '#ffb04a', 0.4);
    }
    const hurt = o.hurt;
    const fat = kind === 'brood' || o.gorged ? 0.82 : kind === 'shell' ? 0.78 : kind === 'skipper' ? 0.5 : 0.6;
    const tuck = o.tuck ?? 0;
    ctx.translate(x, y);
    ctx.rotate(b.spin);
    // u runs head-ward (+x here), v across
    const L = R;
    const W = R * fat;
    // legs, both sides, in waves down the body
    const pairs = kind === 'shell' ? 5 : kind === 'nymph' ? 4 : 7;
    ctx.strokeStyle = hurt ? '#ffffff' : pal[2];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, R * 0.11);
    const pace = o.flat ? 8 : 20;
    for (let i = 0; i < pairs; i++) {
      const u = L * (0.55 - (i / (pairs - 1)) * 1.15);
      for (const side of [-1, 1]) {
        const wig = Math.sin(t * pace + i * 0.9 + (side > 0 ? Math.PI : 0) + b.seed) * (1 - tuck);
        const reach = (o.flat ? 1.5 : 1.3) - tuck * 0.55;
        // a skipper's last pair: long, folded jumping legs
        const jump = kind === 'skipper' && i === pairs - 1 ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(u, side * W * 0.7);
        ctx.lineTo(u + wig * R * 0.12 + R * 0.08 * jump, side * W * (1.05 + 0.25 * jump));
        ctx.lineTo(u + wig * R * 0.28 - R * 0.18 * jump, side * (W + R * 0.45 * reach * jump));
        ctx.stroke();
      }
    }
    // feelers, out ahead of it
    ctx.lineWidth = Math.max(1, R * 0.06);
    for (const side of [-1, 1]) {
      const sw = Math.sin(t * 6 + side + b.seed) * 0.25 * (1 - tuck);
      ctx.beginPath();
      ctx.moveTo(L * 0.85, side * W * 0.25);
      ctx.quadraticCurveTo(L * 1.25, side * W * (0.5 + sw), L * (1.5 - tuck * 0.3), side * W * (0.9 + sw));
      ctx.stroke();
    }
    const ph = b.phase % CYCLE;
    const opening = kind === 'shell' && ph >= OPENING && ph < OPEN;
    const isOpen = kind === 'shell' && ph >= OPEN;
    // the weak heart of a shellback, under its plates
    if (kind === 'shell') {
      const shake = opening ? Math.sin(t * 60) * R * 0.03 : 0;
      const gap = isOpen ? W * 0.55 : opening ? W * 0.06 : 0;
      if (isOpen || opening) {
        glow(ctx, 0, 0, R * 1.5, '#ffb04a', isOpen ? 0.75 : 0.35);
        ctx.fillStyle = '#ffd890';
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.6, W * 0.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ff8a3a';
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.25 * (1 + 0.15 * Math.sin(t * 14)), 0, TAU);
        ctx.fill();
      }
      // two halves of the shell, swung apart when it opens
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(shake, side * gap);
        ctx.beginPath();
        ctx.ellipse(0, 0, L, W, 0, side < 0 ? Math.PI : 0, side < 0 ? TAU : Math.PI);
        ctx.closePath();
        ctx.fillStyle = hurt ? '#ffffff' : pal[0];
        ctx.fill();
        ctx.strokeStyle = DARK;
        ctx.lineWidth = Math.max(1, R * 0.07);
        ctx.stroke();
        // ridges across each half
        ctx.strokeStyle = pal[2];
        for (const k of [-0.5, 0, 0.5]) {
          ctx.beginPath();
          ctx.moveTo(L * k, 0);
          ctx.lineTo(L * k, side * W * 0.92 * Math.sqrt(1 - k * k));
          ctx.stroke();
        }
        ctx.fillStyle = pal[1];
        ctx.fillRect(-L * 0.6, side < 0 ? -W * 0.8 : W * 0.55, L * 1.1, Math.max(1, R * 0.08));
        ctx.restore();
      }
      if (opening) {
        ctx.strokeStyle = '#ffb04a';
        ctx.lineWidth = Math.max(1, R * 0.08);
        ctx.beginPath();
        ctx.moveTo(-L, 0);
        ctx.lineTo(L, 0);
        ctx.stroke();
      }
    } else {
      // the plates, back to front, each overlapping the one behind
      const n = kind === 'nymph' ? 3 : 5;
      for (let k = 0; k < n; k++) {
        const u = -L * 0.75 + (k / (n - 1)) * L * 1.15;
        const w = W * Math.sqrt(Math.max(0.15, 1 - (u / L) ** 2));
        ctx.fillStyle = hurt ? '#ffffff' : k % 2 ? pal[0] : pal[1];
        ctx.strokeStyle = DARK;
        ctx.lineWidth = Math.max(1, R * 0.06);
        ctx.beginPath();
        ctx.ellipse(u, 0, L * 0.3, w, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      if (kind === 'brood' && !hurt) {
        // her young, glowing through her
        for (let k = 0; k < 5; k++) glow(ctx, -L * 0.6 + k * L * 0.28, Math.sin(k * 2.3) * W * 0.35, R * 0.4, '#c8ff8a', 0.45 + 0.2 * Math.sin(t * 6 + k));
      }
      if (o.gorged) glow(ctx, -L * 0.2, 0, R, '#ffd04a', 0.4 + 0.15 * Math.sin(t * 8));
    }
    // the head-shield, bone, and the eyes along it
    ctx.fillStyle = hurt ? '#ffffff' : pal[3];
    ctx.strokeStyle = DARK;
    ctx.lineWidth = Math.max(1, R * 0.06);
    ctx.beginPath();
    ctx.ellipse(L * 0.62, 0, L * 0.3, W * 0.62, 0, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (!hurt) {
      const col = kind === 'skipper' ? '#8affe0' : kind === 'shell' ? '#ffd04a' : '#ff4a3a';
      const es = Math.max(1, R * 0.1);
      for (const k of [-0.42, -0.15, 0.15, 0.42]) {
        ctx.fillStyle = col;
        ctx.fillRect(L * 0.72, k * W - es / 2, es, es);
      }
      if (R > 6) glow(ctx, L * 0.75, 0, R * 0.5, col, 0.3);
      // on the glass, the mouth under the shield works at the plating
      if (o.drink) {
        const mr = R * (0.16 + 0.04 * Math.sin(t * 9));
        glow(ctx, L * 0.85, 0, R * 0.6, '#ffd04a', 0.35 + 0.2 * Math.sin(t * 9));
        ctx.fillStyle = '#1a0a10';
        ctx.beginPath();
        ctx.arc(L * 0.9, 0, mr, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawDebris(ctx: CanvasRenderingContext2D, p: Debris) {
    const [x, y, s] = this.proj(p.x, p.y, p.z);
    const [x0, y0] = this.proj(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.z - p.vz * 0.03);
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2) * this.haze(p.z);
    ctx.strokeStyle = p.c;
    ctx.lineWidth = clamp(s * 0.05, 1, 4);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** The bolts: hot tracers narrowing from the muzzle into the dark. */
  private drawBolts(ctx: CanvasRenderingContext2D) {
    for (const b of this.bolts) {
      const at = (z: number): [number, number] => {
        const k = Math.max(0, z) / (Math.max(0, z) + 0.8);
        return [b.mx + (b.ax - b.mx) * k, b.my + (b.ay - b.my) * k];
      };
      const [hx, hy] = at(b.z);
      const [tx, ty] = at(b.z - 3.5);
      const col = b.hot ? '#ffd04a' : '#8affe0';
      const wid = Math.max(1, 4 * (1 - b.z / (FAR + 2)));
      ctx.lineCap = 'round';
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = wid + 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, wid * 0.5);
      ctx.stroke();
      glow(ctx, hx, hy, 6 + wid * 2, col, 0.6);
    }
  }

  /** The canopy glass: cracks where they landed, the ones on it, and the goo of the ones shot off. */
  private glass(ctx: CanvasRenderingContext2D, t: number) {
    ctx.strokeStyle = 'rgba(210,225,255,0.3)';
    ctx.lineWidth = 1;
    for (const c of this.cracks) {
      const r = rng(Math.floor(c.seed * 1000));
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU + r() * 0.8;
        let [x, y] = [c.x, c.y];
        ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          const aa = a + (r() - 0.5) * 0.9;
          x += Math.cos(aa) * c.r * (0.25 + r() * 0.2);
          y += Math.sin(aa) * c.r * (0.25 + r() * 0.2);
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    for (const c of this.crawlers) {
      // a hard light on it, from your instruments
      glow(ctx, c.x, c.y, GLASS[c.kind] * 1.6, '#ff8a5a', 0.12);
      this.body(ctx, c.x, c.y, GLASS[c.kind], { kind: c.kind, spin: c.face, seed: c.seed, phase: c.phase }, t, { flat: true, drink: 1, hurt: c.hurt > 0 && Math.sin(t * 60) > 0 });
      // how full it is: a ring filling round it
      const f = c.on / FULL;
      const r = GLASS[c.kind] + 6;
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = f > 0.75 ? (Math.sin(t * 16) > 0 ? '#ff5a4a' : '#ffd04a') : '#ffb04a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
    }
    for (const s of this.smears) {
      const f = s.life / s.max;
      const r = rng(Math.floor(s.seed * 1000));
      ctx.fillStyle = s.c;
      ctx.globalAlpha = 0.55 * Math.min(1, f * 2);
      for (let k = 0; k < (s.r > 6 ? 6 : 3); k++) {
        ctx.beginPath();
        ctx.arc(s.x + (r() - 0.5) * s.r, s.y + (r() - 0.5) * s.r * 0.8 + k * (1 - f) * 3, s.r * (0.35 + r() * 0.4), 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.35 * f;
      ctx.fillRect(Math.round(s.x - s.r * 0.2), Math.round(s.y - s.r * 0.3), Math.max(1, Math.round(s.r * 0.2)), 1);
    }
    ctx.globalAlpha = 1;
  }

  /** The canopy's frame: pillars down the sides, a bar over the top, and a glint on the glass. */
  private frame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(60, 0);
    ctx.lineTo(110, 0);
    ctx.lineTo(30, h);
    ctx.lineTo(-20, h);
    ctx.fill();
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : w;
      ctx.fillStyle = DARK;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 - side * 16, 0);
      ctx.lineTo(x0 - side * 30, h);
      ctx.lineTo(x0, h);
      ctx.fill();
      ctx.strokeStyle = '#3a2e48';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 - side * 16.5, 0);
      ctx.lineTo(x0 - side * 30.5, h);
      ctx.stroke();
      // the fuel line along it, pulsing while they drink
      const drink = this.crawlers.some((c) => (side < 0 ? c.x < this.cx : c.x >= this.cx));
      ctx.strokeStyle = drink ? `rgba(255,176,74,${0.5 + 0.3 * Math.sin(t * 10)})` : 'rgba(255,176,74,0.25)';
      ctx.beginPath();
      ctx.moveTo(x0 - side * 12, 0);
      ctx.lineTo(x0 - side * 24, h);
      ctx.stroke();
      ctx.fillStyle = '#8a7a5a';
      for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(x0 - side * (8 + k * 2.4)), 16 + k * 36, 1, 1);
    }
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, w, 6);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(0, 6, w, 1);
  }

  /** The twin guns in their cowlings, swinging after the reticle, kicking back as they fire. */
  private guns(ctx: CanvasRenderingContext2D) {
    for (const k of [0, 1]) {
      const px = k ? 446 : 34;
      const py = 236;
      const [tx, ty] = this.tip(k);
      const a = Math.atan2(ty - py, tx - px);
      const hot = this.vent > 0 ? 1 : this.heat;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      const len = Math.hypot(tx - px, ty - py);
      // the barrel: dark outline, gunmetal, a lit top edge, cooling rings
      ctx.fillStyle = DARK;
      ctx.fillRect(0, -6, len + 2, 12);
      ctx.fillStyle = '#4a4258';
      ctx.fillRect(0, -5, len, 10);
      ctx.fillStyle = '#6a6280';
      ctx.fillRect(0, -5, len, 3);
      ctx.fillStyle = '#9a92b0';
      ctx.fillRect(0, -5, len, 1);
      ctx.fillStyle = DARK;
      for (let r = 14; r < len - 8; r += 6) ctx.fillRect(r, -6, 2, 12);
      // the muzzle brake
      ctx.fillStyle = DARK;
      ctx.fillRect(len - 8, -8, 10, 16);
      ctx.fillStyle = '#5a5270';
      ctx.fillRect(len - 7, -7, 8, 14);
      ctx.fillStyle = '#8a82a0';
      ctx.fillRect(len - 7, -7, 8, 2);
      // it glows with the heat, down from the muzzle
      if (hot > 0.15) {
        ctx.globalAlpha = Math.min(1, hot);
        ctx.fillStyle = hot > 0.7 ? '#ff5a2a' : '#c85a2a';
        ctx.fillRect(len * 0.55, -3, len * 0.45 - 8, 4);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (hot > 0.15) glow(ctx, tx, ty, 10 + hot * 10, '#ff6a2a', hot * 0.35);
      // the cowling it sits in
      ctx.fillStyle = DARK;
      ctx.beginPath();
      ctx.arc(px, py + 4, 22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a3248';
      ctx.beginPath();
      ctx.arc(px, py + 4, 20, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a5070';
      ctx.beginPath();
      ctx.arc(px - 3, py - 1, 9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#8a7a5a';
      for (const q of [-0.9, -0.3, 0.3]) ctx.fillRect(Math.round(px + Math.cos(q - Math.PI / 2) * 16), Math.round(py + 4 + Math.sin(q - Math.PI / 2) * 16), 1, 1);
      if (this.muzzle[k] > 0) {
        const f = this.muzzle[k] / 0.06;
        glow(ctx, tx, ty, 30, '#ffe8a0', 0.9 * f);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(a);
        ctx.fillStyle = '#ffd890';
        ctx.fillRect(0, -5 * f, 18 * f, 10 * f);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -2, 24 * f, 4);
        ctx.fillRect(4, -9 * f, 3, 18 * f);
        ctx.restore();
      }
    }
  }

  /** Corner ticks, closing in over a target; the guns' heat round it; the streak beside. */
  private reticle(ctx: CanvasRenderingContext2D, t: number) {
    const x = Math.round(this.ax);
    const y = Math.round(this.ay);
    const lock = this.over === 1;
    const hot = this.streak >= HOT;
    const col = this.vent > 0 ? '#6a5e7a' : lock ? '#ff5a4a' : this.over === 2 ? '#fff0c0' : hot ? '#ffd04a' : '#f4ecd8';
    const s = lock ? 6 : 9 + Math.round(Math.sin(t * 6) * 0.6);
    if (lock) glow(ctx, x, y, 14, '#ff5a4a', 0.3);
    if (hot) glow(ctx, x, y, 18, '#ffd04a', 0.25 + 0.1 * Math.sin(t * 12));
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass ? col : DARK;
      const o = pass ? 0 : 1;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.fillRect(x + sx * s - (sx > 0 ? 3 : 0) - o, y + sy * s - o, 4 + o * 2, 1 + o * 2);
        ctx.fillRect(x + sx * s - o, y + sy * s - (sy > 0 ? 3 : 0) - o, 1 + o * 2, 4 + o * 2);
      }
      ctx.fillRect(x - o, y - o, 1 + o * 2, 1 + o * 2);
    }
    // the heat, a ring that fills and reddens
    const r = 15;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(18,12,24,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    if (this.heat > 0.01) {
      ctx.strokeStyle = this.vent > 0 ? (Math.sin(t * 16) > 0 ? '#ff5a4a' : '#8a7e9a') : this.heat > 0.7 ? '#ff5a4a' : this.heat > 0.4 ? '#ffb04a' : '#8affe0';
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI * 1.4 - Math.PI * 0.8 * Math.min(1, this.heat), Math.PI * 1.4);
      ctx.stroke();
    }
    if (this.vent > 0) drawText(ctx, 'VENT', x, y + 18, Math.sin(t * 12) > 0 ? '#ff5a4a' : '#ff8a5a', { align: 'center' });
    else if (this.streak > 1) drawText(ctx, `×${this.streak}`, x + 14, y + 8, hot ? '#ffd04a' : '#c8bcd8');
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

  /** The dash under the glass: the fuel, the count, the streak lamp. */
  private dash(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const y = h - 22;
    this.panel(ctx, 96, y, 288, 18);
    const fc = this.fuel > 0.86 ? '#ffd04a' : this.fuel > 0.68 ? '#ffb04a' : this.fuel > 0.5 ? '#ff8a3a' : '#ff5a4a';
    ctx.fillStyle = DARK;
    ctx.fillRect(100, y + 4, 9, 11);
    ctx.fillStyle = '#c86a3a';
    ctx.fillRect(101, y + 6, 7, 8);
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(101, y + 6, 7, 1);
    ctx.fillStyle = fc;
    ctx.fillRect(103, y + 8, 3, 4);
    const gx = 114;
    const gw = 110;
    const gy = y + 8;
    ctx.fillStyle = '#4a3e58';
    ctx.fillRect(gx - 1, gy - 2, gw + 2, 8);
    ctx.fillStyle = '#120c1a';
    ctx.fillRect(gx, gy - 1, gw, 6);
    ctx.fillStyle = 'rgba(244,236,216,0.35)';
    ctx.fillRect(gx, gy - 1, Math.round(gw * this.shownFuel), 6);
    const fw = Math.round(gw * this.fuel);
    ctx.fillStyle = fc;
    ctx.fillRect(gx, gy - 1, fw, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(gx, gy - 1, fw, 1);
    if (this.drain > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx + fw - 1, gy - 1 + Math.round(Math.sin(t * 20)), 1, 3);
    }
    for (const [f, c] of [
      [0.86, '#8affb0'],
      [0.68, '#c8e86a'],
      [0.5, '#ffb04a'],
    ] as const) {
      ctx.fillStyle = c;
      ctx.fillRect(gx + Math.round(gw * f), gy - 4, 1, 2);
    }
    drawText(ctx, `${Math.round(this.shownFuel * 100)}%`, gx + gw + 4, y + 6, fc);
    if (this.drain > 0) drawText(ctx, `-${Math.min(99, Math.round(this.drain * 100))}%/S`, gx + gw + 30, y + 6, Math.sin(t * 10) > 0 ? '#ff5a4a' : '#ff8a5a');
    // the streak lamp: lit gold on a hot streak
    const lx = 372;
    const hot = this.streak >= HOT;
    ctx.fillStyle = DARK;
    ctx.fillRect(lx - 4, y + 5, 9, 9);
    ctx.fillStyle = hot ? '#ffd04a' : this.streak ? '#7a6a3a' : '#2a2236';
    ctx.fillRect(lx - 3, y + 6, 7, 7);
    if (hot) glow(ctx, lx, y + 9, 14, '#ffd04a', 0.4 + 0.2 * Math.sin(t * 10));
    for (let k = 0; k < HOT; k++) {
      ctx.fillStyle = k < this.streak ? (hot ? '#ffd04a' : '#f4ecd8') : '#3a2e48';
      ctx.fillRect(lx - 10 - (HOT - k) * 5, y + 8, 3, 3);
    }
  }
}
