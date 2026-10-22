import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, TAU, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, stars, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';

type Kind = 'small' | 'big' | 'skitter';

interface Leech {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where on the hull it's clamped (an angle and a reach), once it has. */
  at: { a: number; r: number } | null;
  /** How hard it holds: grows while it's on. */
  grip: number;
  hp: number;
  /** A skitter in flight sidesteps the first zap it sees coming. */
  dodge: number;
  /** Flung off and tumbling away. */
  gone: number;
  flap: number;
  hurt: number;
}

interface Wave {
  /** When it arrives, from where, and what's in it. */
  t: number;
  a: number;
  kinds: Kind[];
  told: boolean;
  sent: boolean;
}

/** How long the eyes show in the dark before a wave comes in, at easy and at deadly. */
const TELL = [1.4, 0.75] as const;
/** A grip at or past this, and only a zap will get it off. */
const LOCKED = 2.45;

/**
 * Shake them off: your ship from above, hull leeches flapping in from the dark in waves to clamp
 * on to its fuel lines. Eyes glow at the edge of the dark just before a wave comes. Each one
 * that's on drinks, and holds harder the longer it's there. Throw the stick from side to side to
 * roll: a roll flings off whatever's holding looser than the roll is hard, and rolls thrown in
 * time (the bar under the ship) chain into harder ones. But every roll strains the engine, and
 * strain it too far and it stalls. The button arcs a zap into the leech the stick points at,
 * whatever its grip, then needs a moment; a kill can jump to a neighbour. Big ones (from hard)
 * only come off to zaps; skitters (from vicious) dodge the first zap in flight and grip fast.
 * When time's up, every one still on takes a last gulp.
 */
export class Shake implements Minigame {
  readonly title = 'SHAKE THEM OFF';
  readonly how = 'THROW THE STICK LEFT-RIGHT IN TIME TO ROLL: CHAINED ROLLS FLING TIGHTER GRIPS, BUT STRAIN THE ENGINE. POINT AND PRESS TO ZAP: ONLY ZAPS SHIFT A RED GRIP.';
  result: number | null = null;
  private readonly d: number;
  private leeches: Leech[] = [];
  private waves: Wave[] = [];
  private fuel = 1;
  private shownFuel = 1;
  private drain = 0;
  private time = 0;
  private readonly limit = 24;
  private readonly gripRate: number;
  private readonly window: [number, number];
  private readonly zapCdMax: number;
  private roll = 0;
  private rollV = 0;
  private lastSide = 0;
  private lastThrow = -9;
  private combo = 0;
  private bestCombo = 0;
  private strain = 0;
  private stall = 0;
  private zapCd = 0;
  private zapT = 0;
  private zapArcs: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private aim = -Math.PI / 2;
  private target: Leech | null = null;
  private fx = new Fx();
  private r: Rng;
  private readonly cx = 240;
  private readonly cy = 118;
  private flung = 0;
  private fried = 0;
  private biggest = 0;
  private total = 0;
  /** Time up: the last gulps, one leech at a time, before the score. */
  private gulpT = -1;
  private gulped = 0;
  private drops: { x: number; y: number; vy: number }[] = [];

  constructor(
    private level: number,
    seed: number,
  ) {
    this.r = rng(seed);
    const d = (this.d = hardness(level));
    this.gripRate = byLevel(d, 0.95, 1.4);
    this.window = [byLevel(d, 0.15, 0.2), byLevel(d, 0.62, 0.42)];
    this.zapCdMax = byLevel(d, 0.5, 0.8);
    this.plan();
  }

  /** The waves, laid out ahead: when, from which side of the dark, and what. */
  private plan() {
    const d = this.d;
    let t = 0.9;
    let n = 0;
    let a = this.r() * TAU;
    while (t < this.limit - 2.5) {
      const count = Math.max(1, Math.round(byLevel(d, 2.6, 3.2) + (this.r() - 0.4) * 1.2 + (t / this.limit) * 0.8));
      const kinds: Kind[] = [];
      for (let k = 0; k < count; k++) kinds.push(this.level >= 4 && this.r() < byLevel(d, 0, 0.3) ? 'skitter' : 'small');
      if (this.level >= 3 && n % 2 === 1) kinds.push('big');
      this.waves.push({ t, a, kinds, told: false, sent: false });
      this.total += kinds.length;
      // the next one comes from somewhere else, often across the hull
      a += Math.PI * (0.55 + this.r() * 0.9);
      t += byLevel(d, 3.0, 2.35) * (0.8 + this.r() * 0.4);
      n++;
    }
  }

  private spawn(kind: Kind, a: number) {
    const x = this.cx + Math.cos(a) * 270;
    const y = this.cy + Math.sin(a) * 170;
    this.leeches.push({ kind, x, y, vx: 0, vy: 0, at: null, grip: 0, hp: kind === 'big' ? 3 : 1, dodge: kind === 'skitter' ? 1 : 0, gone: 0, flap: this.r() * TAU, hurt: 0 });
  }

  private get on() {
    return this.leeches.filter((l) => l.at && !l.gone);
  }

  status() {
    const on = this.on.length;
    if (this.stall > 0) return `ENGINE STALLED  ·  FUEL ${Math.round(this.fuel * 100)}%`;
    return `FUEL ${Math.round(this.fuel * 100)}%  ·  ${on ? `${on} ON YOUR HULL` : 'HULL CLEAR'}  ·  OFF ${this.flung + this.fried}/${this.total}`;
  }

  breakdown(): [string, string][] {
    return [
      ['FUEL KEPT', `${Math.round(this.fuel * 100)}%`],
      ['FLUNG', `${this.flung}`],
      ['FRIED', `${this.fried}`],
      ['BEST ROLL', this.bestCombo > 1 ? `×${this.bestCombo}${this.biggest > 1 ? `, ${this.biggest} AT ONCE` : ''}` : '-'],
    ];
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    this.zapT -= dt;
    this.shownFuel += (this.fuel - this.shownFuel) * Math.min(1, dt * 1.5);
    for (const p of this.drops) {
      p.vy += 300 * dt;
      p.y += p.vy * dt;
    }
    this.drops = this.drops.filter((p) => p.y < 246);
    if (this.result !== null) {
      for (const l of this.leeches) this.drift(l, dt);
      return;
    }
    if (this.gulpT >= 0) return this.gulps(dt);
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    if (this.time >= this.limit) {
      this.gulpT = 0.5;
      this.fx.word('TIME', this.cx, this.cy - 50, '#f4ecd8', 2, { pop: true });
      return;
    }
    this.send();
    this.steer(dt, pad);
    // the zap
    this.zapCd -= dt;
    this.target = this.pick();
    if (pad.press && this.zapCd <= 0) this.zap();
    else if (pad.press) audio.play('dash_dry', { vol: 0.5 });
    this.drain = 0;
    for (const l of this.leeches) this.move(l, dt);
    this.leeches = this.leeches.filter((l) => l.gone < 1.5);
  }

  /** The waves: eyes in the dark first, then the wave itself, a few at a time. */
  private send() {
    const tell = byLevel(this.d, TELL[0], TELL[1]);
    for (const w of this.waves) {
      if (!w.told && this.time >= w.t - tell) {
        w.told = true;
        audio.play('aim_tell', { vol: 0.35, pitch: 0.8 });
      }
      if (!w.sent && this.time >= w.t) {
        w.sent = true;
        w.kinds.forEach((k, i) => this.spawn(k, w.a + (i - (w.kinds.length - 1) / 2) * 0.22));
        audio.play('wingbeat', { vol: 0.5 });
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
    if (this.time - this.lastThrow > 0.5) this.strain = Math.max(0, this.strain - dt * 0.45);
    if (this.stall > 0) {
      this.stall -= dt;
      if (this.r() < dt * 20) this.fx.spark(this.cx - 26, this.cy + (this.r() - 0.5) * 8, -20 - this.r() * 30, (this.r() - 0.5) * 20, 0.8, this.r() < 0.5 ? '#4a4060' : '#8a80a0', { size: 2, glow: false });
      if (this.stall <= 0) {
        this.strain = 0.35;
        this.fx.word('ENGINE BACK', this.cx, this.cy - 40, '#8affb0');
        audio.play('aux_ready', { vol: 0.6 });
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

  /** How hard a roll at this combo is: it flings anything holding looser than this. */
  private power(combo = this.combo) {
    return 0.25 + 0.44 * Math.min(5, combo);
  }

  /** A roll: in time with the last one it chains harder; everything loose enough comes off. */
  private throwRoll() {
    const gap = this.time - this.lastThrow;
    const [lo, hi] = this.window;
    if (this.combo && gap >= lo && gap <= hi) this.combo++;
    else {
      if (this.combo > 1 && gap < lo) this.fx.word('TOO FAST', this.cx, this.cy + 62, '#ff8a5a');
      this.combo = 1;
    }
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.lastThrow = this.time;
    this.strain += byLevel(this.d, 0.13, 0.16);
    const c = this.combo;
    this.fx.shake(2 + Math.min(5, c));
    audio.play('dash', { vol: 0.55, pitch: 0.8 + Math.min(5, c) * 0.1 });
    if (c > 1) this.fx.word(c >= 5 ? 'MAX ROLL' : `ROLL ×${c}`, this.cx, this.cy + 50, c >= 5 ? '#ffd04a' : '#f4ecd8', c >= 4 ? 2 : 1, { pop: true, life: 0.5 });
    let n = 0;
    const p = this.power();
    for (const l of this.leeches) {
      if (!l.at || l.gone || l.kind === 'big') continue;
      if (l.grip < p) {
        this.fling(l, false, c);
        n++;
      } else if (l.grip < LOCKED) l.hurt = 0.25;
    }
    if (n >= 2) this.cluster(n);
    if (this.strain >= 1) {
      this.strain = 1;
      this.stall = byLevel(this.d, 1.2, 1.8);
      this.combo = 0;
      this.fx.stop(0.08);
      this.fx.shake(6, 0.4);
      this.fx.word('ENGINE STALL', this.cx, this.cy - 40, '#ff5a4a', 2, { pop: true, life: 1.2 });
      audio.play('overheat');
    }
  }

  /** Several off in one roll: a pop for each extra one. */
  private cluster(n: number) {
    this.biggest = Math.max(this.biggest, n);
    this.fx.stop(Math.min(0.14, 0.04 + n * 0.02));
    this.fx.ring(this.cx, this.cy, 50 + n * 12, '#ffb04a', 0.4);
    this.fx.word(n === 2 ? 'DOUBLE' : n === 3 ? 'TRIPLE' : `${n} AT ONCE!`, this.cx, this.cy - 52, '#ffd04a', 2, { pop: true, life: 1 });
    audio.play('perfect', { pitch: 0.9 + n * 0.08 });
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
      if (dist > 190 || da > 0.8) continue;
      const score = da * 80 + dist * 0.3;
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
    audio.play('lightning', { vol: 0.5 });
    const l = this.target;
    if (!l) {
      this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: this.cx + Math.cos(this.aim) * 120, y1: this.cy + Math.sin(this.aim) * 120 });
      return;
    }
    // a skitter in the air sees it coming, once
    if (!l.at && l.dodge > 0) {
      l.dodge = 0;
      const side = this.r() < 0.5 ? -1 : 1;
      const a = Math.atan2(l.y - this.cy, l.x - this.cx) + side * Math.PI / 2;
      this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: l.x, y1: l.y });
      l.x += Math.cos(a) * 22;
      l.y += Math.sin(a) * 22;
      this.fx.word('DODGED', l.x, l.y - 12, '#8affe0');
      this.fx.burst(l.x, l.y, 6, 50, ['#8affe0']);
      audio.play('blink', { vol: 0.5 });
      return;
    }
    this.zapArcs.push({ x0: this.cx, y0: this.cy, x1: l.x, y1: l.y });
    this.hit(l);
    if (l.hp > 0) return;
    // a kill jumps to the nearest neighbour that a zap would finish
    let next: Leech | null = null;
    let nd = 40;
    for (const o of this.leeches) {
      if (o === l || o.gone || o.hp > 1 || (!o.at && o.dodge > 0)) continue;
      const dd = Math.hypot(o.x - l.x, o.y - l.y);
      if (dd < nd) {
        nd = dd;
        next = o;
      }
    }
    if (next) {
      this.zapArcs.push({ x0: l.x, y0: l.y, x1: next.x, y1: next.y });
      this.hit(next);
      this.fx.word('CHAIN!', next.x, next.y - 20, '#d8c0ff', 1, { pop: true });
      this.fx.stop(0.06);
    }
  }

  private hit(l: Leech) {
    l.hp--;
    l.hurt = 0.3;
    this.fx.burst(l.x, l.y, 10, 80, ['#b48aff', '#ffffff']);
    if (l.hp <= 0) this.fling(l, true);
    else {
      this.fx.word(`ZAP ${3 - l.hp}/3`, l.x, l.y - 14, '#b48aff');
      this.fx.shake(2);
      audio.play('hit_armor', { vol: 0.5 });
    }
  }

  private fling(l: Leech, zapped: boolean, combo = 0) {
    const a = Math.atan2(l.y - this.cy, l.x - this.cx);
    const sp = 200 + combo * 30;
    l.vx = Math.cos(a) * sp;
    l.vy = Math.sin(a) * sp;
    const air = !l.at;
    l.at = null;
    l.gone = 0.01;
    if (zapped) this.fried++;
    else this.flung++;
    const big = l.kind === 'big';
    this.fx.burst(l.x, l.y, zapped ? (big ? 30 : 16) : 10, big ? 140 : 100, zapped ? ['#b48aff', '#ff8a5a', '#ffffff'] : ['#ff8a5a', '#7a3a22'], { grav: 0 });
    this.fx.word(zapped ? (air ? 'MID-AIR!' : big ? 'BIG ONE FRIED' : 'FRIED') : 'FLUNG', l.x, l.y - 10, zapped ? (air ? '#8affe0' : '#b48aff') : '#ffb04a', 1, { pop: big || air });
    if (big) {
      this.fx.stop(0.1);
      this.fx.ring(l.x, l.y, 40, '#b48aff', 0.4);
      this.fx.shake(5);
    }
    audio.play(zapped ? 'kill' : 'eat', { vol: 0.7, pitch: zapped ? 1 : 0.9 + combo * 0.06 });
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
    l.flap += dt * (l.at ? 6 : 16);
    l.hurt = Math.max(0, l.hurt - dt);
    if (l.gone) return this.drift(l, dt);
    if (!l.at) {
      // flap in towards the hull, weaving
      const dx = this.cx - l.x;
      const dy = this.cy - l.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = (l.kind === 'big' ? 52 : l.kind === 'skitter' ? 84 : 66) * byLevel(this.d, 0.9, 1.15);
      const weave = l.kind === 'skitter' ? 70 : 22;
      l.vx += ((dx / d) * sp - l.vx) * dt * 2.5 + Math.sin(l.flap) * weave * dt;
      l.vy += ((dy / d) * sp - l.vy) * dt * 2.5 + Math.cos(l.flap * 0.7) * weave * dt;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      if (d < 30) {
        l.at = { a: Math.atan2(l.y - this.cy, l.x - this.cx) - this.roll * 0.3, r: 16 + this.r() * 12 };
        audio.play('hook', { vol: 0.5 });
        this.fx.burst(l.x, l.y, 6, 40, ['#ff8a5a']);
      }
      return;
    }
    // clamped on: it turns with the hull, grips harder, and drinks
    l.grip = Math.min(3, l.grip + dt * this.gripRate * (l.kind === 'skitter' ? 1.6 : 1) * (this.stall > 0 ? 1.5 : 1));
    const a = l.at.a + this.roll * 0.3;
    l.x = this.cx + Math.cos(a) * l.at.r;
    l.y = this.cy + Math.sin(a) * l.at.r * 0.75;
    const sip = (l.kind === 'big' ? 0.024 : 0.014) * (1 + l.grip * 0.25) * byLevel(this.d, 1, 1.15);
    this.fuel = Math.max(0, this.fuel - dt * sip);
    this.drain += sip;
    if (this.r() < dt * 3) this.fx.spark(l.x, l.y, (this.r() - 0.5) * 40, (this.r() - 0.5) * 40, 0.3, '#ffd04a', { glow: true });
    if (this.r() < dt * 2.5) this.drops.push({ x: 36 + Math.round(150 * this.fuel) - 1 - Math.floor(this.r() * 3), y: 230, vy: 0 });
  }

  /** Time's up: every one still on takes one last gulp, and then it's over. */
  private gulps(dt: number) {
    for (const l of this.leeches) {
      if (l.gone) this.drift(l, dt);
      else this.move(l, 0);
    }
    this.gulpT -= dt;
    if (this.gulpT > 0) return;
    const l = this.on[0];
    if (!l) {
      if (this.gulped === 0) {
        this.fx.word('HULL CLEAR', this.cx, this.cy - 30, '#8affb0', 2, { pop: true, life: 1.2 });
        this.fx.ring(this.cx, this.cy, 80, '#8affb0', 0.5);
        audio.play('perfect');
      }
      this.result = clamp((this.fuel - 0.35) / 0.6, 0, 1);
      return;
    }
    const gulp = l.kind === 'big' ? 0.07 : 0.035;
    this.fuel = Math.max(0, this.fuel - gulp);
    this.fx.word(`-${Math.round(gulp * 100)}%`, l.x, l.y - 12, '#ff5a4a', 1, { pop: true });
    this.fx.burst(l.x, l.y, 10, 60, ['#ffd04a', '#ff8a3a']);
    this.fx.shake(3);
    audio.play('eat', { vol: 0.8, pitch: 0.7 });
    // full, it lets go and drops away
    l.at = null;
    l.gone = 0.01;
    l.vx = (l.x - this.cx) * 2;
    l.vy = 60;
    this.gulped++;
    this.gulpT = 0.28;
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#07050c';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, 0x1eec, t * 10 + this.roll * 30, 0, t);
    glow(ctx, w * 0.82, h * 0.2, 90, '#ffb04a', 0.18);
    this.tells(ctx, w, h, t);
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    this.ship(ctx, t);
    for (const l of this.leeches) this.leech(ctx, l, t);
    // the zap's arcs
    if (this.zapT > 0) {
      ctx.strokeStyle = '#d8c0ff';
      ctx.lineWidth = 1;
      for (const z of this.zapArcs) {
        ctx.beginPath();
        ctx.moveTo(z.x0, z.y0);
        const n = 7;
        for (let k = 1; k <= n; k++) {
          const f = k / n;
          const jx = k < n ? (Math.random() - 0.5) * 10 : 0;
          const jy = k < n ? (Math.random() - 0.5) * 10 : 0;
          ctx.lineTo(z.x0 + (z.x1 - z.x0) * f + jx, z.y0 + (z.y1 - z.y0) * f + jy);
        }
        ctx.stroke();
        glow(ctx, z.x1, z.y1, 20, '#b48aff', 0.6);
      }
    }
    this.reticle(ctx, t);
    this.rhythm(ctx, t);
    ctx.restore();
    this.fx.drawSparks(ctx);
    this.fx.drawWords(ctx);
    vignette(ctx, w, h, 0.6);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    this.hud(ctx, w, h, t);
    this.fx.drawFlash(ctx, w, h);
  }

  /** Eyes in the dark at the edge: a wave on its way, brighter as it nears. */
  private tells(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const tell = byLevel(this.d, TELL[0], TELL[1]);
    for (const wv of this.waves) {
      if (!wv.told || wv.sent) continue;
      const f = clamp(1 - (wv.t - this.time) / tell, 0, 1);
      // where its line from the hull meets the edge of the view
      const dx = Math.cos(wv.a);
      const dy = Math.sin(wv.a);
      const k = Math.min(dx ? (dx > 0 ? w - 14 - this.cx : this.cx - 14) / Math.abs(dx) : Infinity, dy ? (dy > 0 ? h - 30 - this.cy : this.cy - 16) / Math.abs(dy) : Infinity);
      const ex = this.cx + dx * k;
      const ey = this.cy + dy * k;
      glow(ctx, ex, ey, 18 + f * 14, '#ff4a3a', 0.2 + f * 0.35);
      wv.kinds.forEach((kind, i) => {
        const along = (i - (wv.kinds.length - 1) / 2) * 9;
        const px = Math.round(ex - dy * along);
        const py = Math.round(ey + dx * along);
        if (Math.sin(t * 7 + i * 2.3) > 0.85) return;
        ctx.fillStyle = kind === 'big' ? '#ffd04a' : kind === 'skitter' ? '#8affe0' : '#ff5a4a';
        const s = kind === 'big' ? 2 : 1;
        ctx.fillRect(px - 2 - s, py, s + 1, s);
        ctx.fillRect(px + 2, py, s + 1, s);
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

  /** Brackets on the leech the zap would hit. */
  private reticle(ctx: CanvasRenderingContext2D, t: number) {
    const l = this.target;
    const ready = this.zapCd <= 0;
    if (!l || l.gone || this.result !== null || this.gulpT >= 0) {
      const ax = this.cx + Math.cos(this.aim) * 44;
      const ay = this.cy + Math.sin(this.aim) * 44;
      ctx.fillStyle = ready ? '#d8c0ff' : '#4a3e58';
      ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 3, 3);
      return;
    }
    const s = (l.kind === 'big' ? 13 : 9) + (ready ? Math.round(Math.sin(t * 10)) : 2);
    const x = Math.round(l.x);
    const y = Math.round(l.y);
    ctx.fillStyle = ready ? '#d8c0ff' : '#5a4e6a';
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.fillRect(x + sx * s - (sx > 0 ? 3 : 0), y + sy * s, 4, 1);
      ctx.fillRect(x + sx * s, y + sy * s - (sy > 0 ? 3 : 0), 1, 4);
    }
    if (ready) glow(ctx, x, y, 14, '#b48aff', 0.2);
  }

  /** The roll's timing bar under the ship: throw again while the marker's in the green. */
  private rhythm(ctx: CanvasRenderingContext2D, t: number) {
    if (this.stall > 0) {
      const f = this.stall / byLevel(this.d, 1.2, 1.8);
      drawText(ctx, 'STALLED', this.cx, this.cy + 40, Math.sin(t * 12) > 0 ? '#ff5a4a' : '#ff8a5a', { align: 'center' });
      meter(ctx, this.cx - 30, this.cy + 50, 60, 3, 1 - f, '#ff5a4a');
      return;
    }
    const since = this.time - this.lastThrow;
    const [lo, hi] = this.window;
    const span = hi * 1.6;
    if (!this.combo || since > span) return;
    const x = this.cx - 32;
    const y = this.cy + 42;
    const bw = 64;
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 1, y - 1, bw + 2, 6);
    ctx.fillStyle = '#2a2036';
    ctx.fillRect(x, y, bw, 4);
    ctx.fillStyle = '#2a8a5a';
    ctx.fillRect(x + Math.round((lo / span) * bw), y, Math.round(((hi - lo) / span) * bw), 4);
    const mx = x + Math.round(Math.min(1, since / span) * bw);
    const inWin = since >= lo && since <= hi;
    ctx.fillStyle = inWin ? '#8affb0' : '#f4ecd8';
    ctx.fillRect(mx - 1, y - 2, 2, 8);
    if (inWin) glow(ctx, mx, y + 2, 10, '#8affb0', 0.5);
    drawText(ctx, `×${this.combo}`, x + bw + 5, y - 1, this.combo >= 4 ? '#ffd04a' : '#c8bcd8');
  }

  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    // fuel: a gauge that drips while they drink
    const fx = 36;
    const fw = 150;
    drawText(ctx, 'FUEL', 8, h - 16, '#ffb04a');
    const fc = this.fuel > 0.68 ? '#ffb04a' : this.fuel > 0.5 ? '#ff8a3a' : '#ff5a4a';
    meter(ctx, fx, h - 15, fw, 5, this.shownFuel, '#f4ecd8');
    ctx.fillStyle = fc;
    ctx.fillRect(fx, h - 15, Math.round(fw * this.fuel), 5);
    // where the grades fall
    for (const [f, c] of [
      [0.86, '#8affb0'],
      [0.68, '#c8e86a'],
      [0.5, '#ffb04a'],
    ] as const) {
      ctx.fillStyle = c;
      ctx.fillRect(fx + Math.round(fw * f), h - 17, 1, 2);
    }
    ctx.fillStyle = '#ffd04a';
    for (const p of this.drops) ctx.fillRect(p.x, Math.round(p.y), 1, 2);
    if (this.drain > 0) {
      const rate = `-${(this.drain * 100).toFixed(1)}%/S`;
      drawText(ctx, rate, fx + fw + 6, h - 16, Math.sin(t * 10) > 0 ? '#ff5a4a' : '#ff8a5a');
    }
    // strain and zap, on the right
    const sx = w - 150;
    drawText(ctx, 'STRAIN', sx, h - 16, this.stall > 0 ? '#ff5a4a' : '#c8bcd8');
    meter(ctx, sx + 40, h - 15, 46, 5, this.strain, this.strain > 0.75 ? '#ff5a4a' : this.strain > 0.5 ? '#ffd04a' : '#8affe0');
    if (this.strain > 0.75 && this.stall <= 0 && Math.sin(t * 14) > 0) glow(ctx, sx + 40 + 46 * this.strain, h - 13, 10, '#ff5a4a', 0.5);
    const ready = this.zapCd <= 0;
    drawText(ctx, 'ZAP', w - 50, h - 16, ready ? '#d8c0ff' : '#6a5e7a');
    meter(ctx, w - 30, h - 15, 22, 5, ready ? 1 : 1 - this.zapCd / this.zapCdMax, ready ? '#b48aff' : '#4a3e58');
  }

  /** Your ship from above, rolling. */
  private ship(ctx: CanvasRenderingContext2D, t: number) {
    const { cx, cy } = this;
    const sq = Math.cos(this.roll * 0.6);
    ctx.save();
    ctx.translate(cx, cy);
    // engine glow behind, out when it's stalled
    if (this.stall <= 0) glow(ctx, -26, 0, 22, '#ff9a3a', 0.4 + 0.1 * Math.sin(t * 30) + this.strain * 0.3);
    // wings, foreshortened by the roll
    ctx.fillStyle = DARK;
    ctx.fillRect(-14, -30 * sq - 1, 16, 60 * sq + 2);
    ctx.fillStyle = '#7a3a22';
    ctx.fillRect(-13, -30 * sq, 14, 60 * sq);
    ctx.fillStyle = '#a85a32';
    ctx.fillRect(-13, -30 * sq, 14, 2);
    // hull
    ctx.fillStyle = DARK;
    ctx.fillRect(-26, -9, 52, 18);
    ctx.fillStyle = this.strain > 0.75 && Math.sin(t * 20) > 0 ? '#e87a4a' : '#c86a3a';
    ctx.fillRect(-25, -8, 50, 16);
    ctx.fillStyle = '#e89a5a';
    ctx.fillRect(-25, -8, 50, 3);
    ctx.fillStyle = '#f4e4c8';
    ctx.fillRect(10, -8, 10, 16);
    ctx.fillStyle = '#2a6a7a';
    ctx.fillRect(14, -4, 7, 8);
    // fuel lines, glowing where something drinks
    const drinking = this.leeches.some((l) => l.at && !l.gone);
    ctx.fillStyle = drinking && Math.floor(t * 8) % 2 ? '#ffd04a' : '#ffb04a';
    ctx.fillRect(-22, -2, 30, 1);
    ctx.fillRect(-22, 2, 30, 1);
    ctx.restore();
  }

  private leech(ctx: CanvasRenderingContext2D, l: Leech, t: number) {
    const s = l.kind === 'big' ? 1.8 : l.kind === 'skitter' ? 0.85 : 1;
    const shiver = l.hurt > 0 ? Math.round(Math.sin(t * 80) * 2) : 0;
    const x = Math.round(l.x) + shiver;
    const y = Math.round(l.y);
    if (l.gone) ctx.globalAlpha = Math.max(0, 1 - l.gone / 1.5);
    // wings: leathery, beating
    const beat = Math.sin(l.flap) * (l.at ? 2 : 6) * s;
    ctx.fillStyle = l.kind === 'skitter' ? '#2a5a5a' : '#5a2a2a';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + side * 9 * s, y - 4 * s + beat);
      ctx.lineTo(x + side * 5 * s, y + 2 * s);
      ctx.closePath();
      ctx.fill();
    }
    // body, fattening as it drinks
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.ellipse(x, y, 4.5 * s, 3.5 * s, 0, 0, TAU);
    ctx.fill();
    const fat = l.at ? Math.min(1, l.grip / 3) : 0;
    ctx.fillStyle = l.hurt > 0.15 ? '#ffffff' : l.kind === 'big' ? '#a85a5a' : l.kind === 'skitter' ? '#5ab8a8' : '#c87a5a';
    ctx.beginPath();
    ctx.ellipse(x, y, (3.5 + fat) * s, (2.5 + fat * 0.6) * s, 0, 0, TAU);
    ctx.fill();
    // a skitter still able to dodge shimmers
    if (l.dodge > 0 && !l.at && !l.gone && Math.sin(t * 20) > 0) {
      ctx.fillStyle = '#c8fff0';
      ctx.fillRect(x - 1, y - 1, 2, 1);
    }
    // a big one's zaps to go
    if (l.kind === 'big' && !l.gone) {
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < l.hp ? '#ffd04a' : '#3a2e48';
        ctx.fillRect(x - 5 + k * 4, y - 11, 3, 2);
      }
    }
    // the grip you can see: yellow comes off a roll, orange needs a chain, red needs a zap
    if (l.at && !l.gone) {
      const locked = l.grip >= LOCKED || l.kind === 'big';
      const easy = l.grip < this.power(1);
      const col = locked ? '#ff4a3a' : easy ? '#ffd04a' : '#ff8a3a';
      ctx.strokeStyle = col;
      ctx.globalAlpha = locked && Math.sin(t * 10) > 0 ? 1 : 0.75;
      ctx.lineWidth = locked ? 2 : 1;
      ctx.beginPath();
      ctx.arc(x, y, 7 * s + 1, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, l.grip / LOCKED));
      ctx.stroke();
      ctx.lineWidth = 1;
      if (!locked && !easy) {
        // how long a chain it'd take, so you know how far to roll
        let need = 2;
        while (need < 5 && this.power(need) <= l.grip) need++;
        drawText(ctx, `×${need}`, x + 8 * s, y - 10 * s, '#ff8a3a');
      }
    }
    ctx.globalAlpha = 1;
  }
}
