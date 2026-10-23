import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { cracks, dockSky, hullBand } from './dock-art';
import { dockStep } from './dock-sound';
import { drawSprite } from './sprites';
import { Bits } from './tow-art';
import { byLevel, Fx, glow, hardness, meter, stars, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';

/**
 * Dock: a station's port (or a pod's hatch) turning in front of you, like Elite's Coriolis. Left
 * and right fire your roll jets: a tap nudges, a hold pushes hard, and your collar has weight, so
 * you match the port's spin first and then line up its clamps. Hold the button to close in, pull
 * down to brake; let go and you coast.
 *
 * On the way in are approach gates, rings you fly through, each lit with the closing speed it
 * wants, fast and slow by turns: too fast or too slow through one and it's missed. So the
 * approach is a rhythm of thrust and brake while you hold the roll. Partway in, the station's
 * spin changes (its rim lights flash red and the klaxon sounds first, with arrows for the new
 * turn and a red mark on the dial) and you have to match it again. Past the last gate is the
 * final approach: the landing lights rush in, green only when you're locked and under the safe
 * speed, and the reticle says what's still wrong. At contact the clamps, the spin and the speed
 * make the seal, and the clamps slam shut one by one; the gates and a quick approach top it up.
 * Prompts teach each thing the first time it matters. Higher levels: faster spin that changes
 * more often and can reverse, slipperier jets, narrower gate windows, a lower safe speed and a
 * stricter seal.
 */
export class Dock implements Minigame {
  readonly title = 'MATCH AND DOCK';
  readonly how = 'LEFT/RIGHT: ROLL TO MATCH THE SPIN AND CLAMPS. HOLD THE BUTTON TO THRUST, HOLD DOWN TO BRAKE. FLY THE GATES AT THEIR SPEED, DOCK SLOW.';
  result: number | null = null;
  private dist = 1;
  private v = 0.04;
  private a = 0;
  private av = 0;
  private port = 0;
  private time = 0;
  private readonly limit: number;
  private readonly d: number;
  private readonly safe: number;
  private readonly acc: number;
  private readonly drag: number;
  private grade = '';
  private locked = false;
  private thrust = false;
  private braking = false;
  private jet = 0;
  /** How long the jets have fired one way: a tap nudges, a hold pushes hard. */
  private jetHeld = 0;
  private fx = new Fx();
  /** Seconds since contact, for the clamps slamming shut (-1 before). */
  private contact = -1;
  /** The spin it turns at now, and where it's easing to. */
  private spinNow: number;
  private spinGoal: number;
  /** Spin changes still to come, each at a range; and the one being warned of. */
  private shifts: { at: number; spin: number }[] = [];
  private tell = 0;
  private tellMax = 0;
  private pending: number | null = null;
  private gates: Gate[] = [];
  private streak = 0;
  /** What the seal was made of, for the card. */
  private q = { align: 0, spin: 0, gentle: 0, crash: false };
  /** How many clamps catch (0..4), and how many have slammed so far. */
  private catches = 0;
  private slammed = 0;
  private sealDone = false;
  /** Past the last gate: the final approach, where it all comes down to the seal. */
  private final = false;
  /** A prompt for the moment a thing first matters, each shown once. */
  private hint = '';
  private hintT = 0;
  private taught = new Set<string>();
  /** Shaped bits (vented gas, torn plates, sparks), and the first frame drawn, for the intro. */
  private bits = new Bits();
  private t0: number | null = null;
  /** Seconds left of the FINAL APPROACH banner (cut off at contact, so CRASH! never shares the screen). */
  private finalT = 0;

  constructor(
    level: number,
    private seed: number,
  ) {
    const r = rng(seed);
    // a little steeper through the middle levels than a straight line
    const d = (this.d = hardness(level) ** 0.85);
    const dir = r() < 0.5 ? 1 : -1;
    this.port = r() * Math.PI;
    this.a = this.port + Math.PI / 4;
    this.safe = byLevel(d, 0.1, 0.075);
    this.acc = byLevel(d, 2.0, 2.8);
    this.drag = byLevel(d, 0.45, 0.12);
    this.limit = byLevel(d, 26, 22);
    this.spinNow = this.spinGoal = dir * byLevel(d, 0.45, 0.8);

    // the spin changes, at ranges spread through the approach
    const n = Math.floor(byLevel(d, 1, 3) + 0.01);
    const ats = n === 1 ? [0.58] : n === 2 ? [0.7, 0.4] : [0.8, 0.55, 0.32];
    let s = this.spinNow;
    for (const at of ats) {
      let next = s;
      for (let k = 0; k < 8 && Math.abs(next - s) < 0.35; k++) {
        const mag = byLevel(d, 0.3, 0.5) + r() * byLevel(d, 0.35, 0.8);
        const flip = r() < byLevel(d, 0, 0.55) ? -1 : 1;
        next = Math.sign(s) * flip * mag;
      }
      this.shifts.push({ at: at + (r() - 0.5) * 0.06, spin: next });
      s = next;
    }

    // the gates: each wants a closing speed, a window around it, fast and slow mixed
    const g = d < 0.2 ? [0.72, 0.45] : [0.76, 0.54, 0.3];
    const width = byLevel(d, 0.06, 0.03);
    let fast = r() < 0.5;
    for (const at of g) {
      // fast and slow by turns, so every gate means a change of pace
      const mid = fast ? 0.14 + r() * 0.04 : 0.06 + r() * 0.03;
      fast = !fast;
      this.gates.push({ at, lo: Math.max(0.02, mid - width / 2), hi: mid + width / 2, passed: null });
    }
  }

  /** Show a prompt, once per kind. */
  private teach(key: string, text: string, time = 2.6) {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.hint = text;
    this.hintT = time;
  }

  private spin() {
    // from vicious up, the spin wobbles on top
    const wob = Math.max(0, this.d - 0.5) * 2 * 0.15;
    return this.spinNow * (1 + Math.sin(this.time * 1.3) * wob);
  }

  /** How far off the clamps are, 0 (dead on) to 1 (as bad as it gets). Four clamps: a quarter turn repeats. */
  private off() {
    const d = wrapAngle((this.a - this.port) * 4) / 4;
    return Math.abs(d) / (Math.PI / 4);
  }

  /** How far your roll is from the port's, 0 (matched) to 1 (way off). */
  private slip() {
    return Math.min(1, Math.abs(this.av - this.spin()) / 1.2);
  }

  private nextGate() {
    return this.gates.find((g) => g.passed === null) ?? null;
  }

  status() {
    if (this.grade) return this.grade;
    if (this.tell > 0) return 'SPIN CHANGE! GET READY TO MATCH IT';
    const parts = [`RANGE ${Math.round(this.dist * 100)}`];
    if (this.slip() > 0.12) parts.push(this.av < this.spin() ? 'ROLL RIGHT' : 'ROLL LEFT');
    else if (this.off() > 0.15) parts.push('LINE UP THE CLAMPS');
    else parts.push('LOCKED ON');
    const g = this.nextGate();
    if (g) parts.push(this.v > g.hi ? 'TOO FAST: HOLD ▼ TO BRAKE' : this.v < g.lo ? 'TOO SLOW: HOLD THE BUTTON' : 'GATE SPEED: GOOD');
    else if (this.v > this.safe) parts.push('TOO FAST: HOLD ▼ TO BRAKE');
    return parts.join('  ');
  }

  breakdown(): [string, string][] {
    const gates: [string, string] = ['GATES', `${this.gates.filter((g) => g.passed).length}/${this.gates.length}`];
    if (this.contact < 0) return [['RANGE LEFT', `${Math.round(this.dist * 100)}`], gates];
    const q = this.q;
    return [
      ['CLAMPS', `${Math.round(q.align * 100)}%`],
      ['SPIN MATCH', `${Math.round(q.spin * 100)}%`],
      ['CONTACT', q.crash ? 'CRASHED' : q.gentle >= 1 ? 'SOFT' : 'HARD'],
      gates,
    ];
  }

  update(dt: number, pad: Pad) {
    const fx = this.fx;
    if (fx.frozen(dt)) return;
    this.bits.update(dt);
    this.finalT = this.contact >= 0 ? 0 : Math.max(0, this.finalT - dt);
    if (this.result !== null) {
      if (this.contact >= 0) this.seal(dt);
      this.port += this.spin() * dt * 0.3;
      if (this.catches > 0 || this.contact < 0) this.a = this.port;
      else this.a += this.av * dt;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time)) audio.play('ui_move', { pitch: 1.5 });
    this.hintT -= dt;

    this.shiftUpdate(dt);
    this.spinNow += (this.spinGoal - this.spinNow) * Math.min(1, dt * 5);
    this.port += this.spin() * dt;
    // roll jets: they push, and the collar keeps turning (a little drag, less at higher levels)
    this.jetHeld = pad.x !== 0 && Math.sign(pad.x) === Math.sign(this.jet) ? this.jetHeld + dt : 0;
    const feather = Math.min(1, 0.3 + (this.jetHeld / 0.3) * 0.7);
    this.av += pad.x * this.acc * feather * dt;
    this.av *= Math.exp(-dt * this.drag);
    this.a += this.av * dt;
    this.jet = pad.x;
    // thrust closes in, the brake (down) slows you; let go and you coast
    this.thrust = pad.hold;
    this.braking = pad.y > 0.5;
    if (this.thrust) this.v = Math.min(0.3, this.v + dt * byLevel(this.d, 0.15, 0.19));
    if (this.braking) this.v = Math.max(0.015, this.v - dt * 0.22);
    const was = this.dist;
    this.dist -= this.v * dt;
    const lock = this.off() < byLevel(this.d, 0.15, 0.1) && this.slip() < byLevel(this.d, 0.12, 0.08);
    if (lock && !this.locked) audio.play('mini_dock_lock');
    this.locked = lock;

    // the first seconds teach: match the spin, then the clamps, then close in (only early on)
    const early = this.dist > 0.5;
    if (early && this.time > 0.6 && this.slip() > 0.15) this.teach('spin', 'ROLL: NEEDLE INTO THE GREEN', 6);
    else if (early && this.taught.has('spin') && this.off() > 0.15) this.teach('clamps', 'NOW TURN ONTO THE CLAMPS', 4);
    if (lock && this.taught.has('clamps')) this.teach('locked', 'LOCKED! HOLD TO CLOSE IN', 2.5);
    const ng = this.nextGate();
    if (ng && this.dist - ng.at < 0.16) this.teach('gate', `GATE: FLY IT AT ${Math.round(ng.lo * 100)}-${Math.round(ng.hi * 100)}`, 3);
    // the first time you're too fast for what's ahead, say how to slow down
    else if (this.time > 1 && (ng ? this.v > ng.hi : this.v > this.safe)) this.teach('brake', 'TOO FAST? HOLD ▼ TO BRAKE', 3);
    // under range 25 on the final approach, the range ticks down
    if (this.final && this.dist < 0.25 && Math.floor(this.dist * 20) !== Math.floor(was * 20)) audio.play('mini_dock_range', { pitch: 1 + (0.25 - this.dist) * 2.4 });

    // the gates, as you pass through them
    for (const g of this.gates) {
      if (g.passed !== null || !(was > g.at && this.dist <= g.at)) continue;
      g.passed = this.v >= g.lo && this.v <= g.hi;
      if (g.passed) {
        this.streak++;
        fx.ring(240, 112, 220, '#8affb0', 0.45);
        fx.word(this.streak > 1 ? `GATE CLEAN X${this.streak}` : 'GATE CLEAN', 240, 60, '#8affb0', 1, { pop: true });
        audio.play('mini_dock_gate', { pitch: dockStep(this.streak * 2 - 2) });
      } else {
        this.streak = 0;
        fx.ring(240, 112, 220, '#ff5a4a', 0.35);
        fx.word(this.v > g.hi ? 'GATE: TOO FAST' : 'GATE: TOO SLOW', 240, 60, '#ff8a7a', 1, { pop: true });
        fx.shake(2, 0.2);
        audio.play('mini_dock_gate_miss');
      }
      if (!this.nextGate()) this.finalApproach();
    }

    if (this.dist <= 0) this.touch();
    else if (this.time >= this.limit) {
      this.result = 0;
      this.grade = 'OUT OF TIME';
      fx.word('OUT OF TIME', 240, 60, '#ffd04a', 2, { pop: true, life: 1.4 });
      audio.play('mini_dock_fail');
    }
    // the jets: a puff per beat while held, louder as they push harder; the brake hisses
    if (this.result === null && pad.x !== 0) audio.play('mini_dock_jet', { pitch: pad.x > 0 ? 1.08 : 0.94, vol: 0.4 + feather * 0.5 });
    if (this.result === null && this.braking) audio.play('mini_dock_brake');
    // a gate closing in: three blips, the last highest
    const near = this.nextGate();
    if (near) {
      for (const [r, k] of [[0.12, 0], [0.08, 1], [0.04, 2]] as const)
        if (was - near.at > r && this.dist - near.at <= r) audio.play('mini_dock_blip', { pitch: dockStep(k * 2) });
    }
    // too fast on the final approach: the warning beeps until you brake
    if (this.result === null && this.final && this.v > this.safe) audio.play('mini_dock_warn');
    audio.loop('engine', 'dock', this.result === null && this.thrust, 0.5);
  }

  /** Through the last gate: the station fills the view and the range counts down. */
  private finalApproach() {
    const fx = this.fx;
    this.final = true;
    fx.ring(240, 112, 200, '#ffd04a', 0.6);
    // drawn by the game, not as a floating word, so contact can cut it off
    this.finalT = 1.4;
    fx.shake(2, 0.2);
    audio.play('mini_dock_final');
    this.teach('final', 'HOLD ▼: BRAKE UNDER THE LINE', 3);
  }

  /** Spin changes: a warning (red rim, klaxon), then the station turns over to its new spin. */
  private shiftUpdate(dt: number) {
    const next = this.shifts[0];
    if (this.pending === null && next && this.dist <= next.at) {
      this.shifts.shift();
      this.pending = next.spin;
      this.tell = this.tellMax = byLevel(this.d, 1.3, 0.8);
      audio.play('mini_dock_klaxon');
      this.fx.word('SPIN CHANGE!', 240, 70, '#ff8a7a', 1, { pop: true, life: 1.2 });
      this.teach('shift', 'MATCH THE RED MARK', this.tell + 0.6);
    }
    if (this.pending === null) return;
    this.tell -= dt;
    if (this.tell > 0) return;
    const flip = Math.sign(this.pending) !== Math.sign(this.spinGoal);
    this.spinGoal = this.pending;
    this.pending = null;
    this.locked = false;
    this.fx.stop(0.05);
    this.fx.shake(3, 0.3);
    this.fx.ring(240, 112, 140, '#ff8a3a', 0.4);
    this.fx.word(flip ? 'REVERSED!' : Math.abs(this.spinGoal) > Math.abs(this.spinNow) ? 'FASTER!' : 'SLOWER!', 240, 74, '#ffd04a', 2, { pop: true });
    audio.play('mini_dock_shift', { pitch: flip ? 1 : Math.abs(this.spinGoal) > Math.abs(this.spinNow) ? 1.25 : 0.8 });
  }

  /** Contact: the seal is made of the clamps, the spin and the speed; the gates and the time top it up. */
  private touch() {
    const fx = this.fx;
    const d = this.d;
    this.dist = 0;
    this.contact = 0;
    const align = Math.max(0, Math.min(1, 1 - Math.max(0, this.off() - byLevel(d, 0.035, 0.02)) * byLevel(d, 2.6, 4)));
    const spin = Math.max(0, Math.min(1, 1 - Math.max(0, this.slip() - byLevel(d, 0.035, 0.02)) * byLevel(d, 3, 4.5)));
    const gentle = this.v <= this.safe ? 1 : Math.max(0, 1 - (this.v - this.safe) / byLevel(d, 0.12, 0.07));
    const crash = gentle < 0.4;
    this.q = { align, spin, gentle, crash };
    const seal = align * spin * gentle;
    const gates = this.gates.filter((g) => g.passed).length / this.gates.length;
    const quick = Math.max(0, Math.min(1, (byLevel(d, 15, 13) - this.time) / 6));
    this.result = Math.max(0, Math.min(1, seal * (0.62 + 0.24 * gates + 0.14 * quick)));
    const s = this.result;
    this.catches = crash ? 0 : seal > 0.6 ? 4 : seal > 0.3 ? 2 : 0;
    this.grade = s >= 0.85 ? 'A PERFECT SEAL' : s >= 0.55 ? 'A GOOD SEAL' : s >= 0.25 ? 'A ROUGH SEAL' : crash ? 'TOO FAST: YOU HIT IT' : 'THE CLAMPS MISSED';
    fx.stop(crash ? 0.16 : 0.1);
    if (crash) {
      fx.flash('#ff8a3a', 0.3);
      fx.shake(9, 0.6);
      fx.burst(240, 112, 70, 220, ['#ffd04a', '#ff8a3a', '#ffffff'], { grav: 0 });
      fx.ring(240, 112, 160, '#ff5a4a', 0.5);
      fx.word('CRASH!', 240, 60, '#ff5a4a', 2, { pop: true, life: 1.4 });
      for (let i = 0; i < 26; i++) {
        const a = fx.rand() * Math.PI * 2;
        const sp = 60 + fx.rand() * 200;
        if (i % 2) this.bits.shard(240, 112, Math.cos(a) * sp, Math.sin(a) * sp, 1 + fx.rand() * 0.8, i % 4 === 1 ? '#b07a40' : '#8a8aa0');
        else this.bits.streak(240, 112, Math.cos(a) * sp * 1.5, Math.sin(a) * sp * 1.5, 0.5, fx.rand() < 0.5 ? '#ffd04a' : '#ffffff');
      }
      for (let i = 0; i < 10; i++) this.bits.smoke(240 + (fx.rand() - 0.5) * 60, 112 + (fx.rand() - 0.5) * 60, (fx.rand() - 0.5) * 60, (fx.rand() - 0.5) * 60, 1.6, 10 + fx.rand() * 8, '#3a3448');
      audio.play('mini_dock_crash');
    } else {
      fx.shake(3, 0.25);
      fx.ring(240, 112, 110, '#c8f0ff', 0.3);
      audio.play('mini_dock_contact');
    }
  }

  /** After contact: the clamps slam shut one by one, then the seal is called. */
  private seal(dt: number) {
    const fx = this.fx;
    this.contact += dt;
    const R = 100;
    while (this.slammed < 4 && this.contact >= 0.12 + this.slammed * 0.13) {
      const k = this.slammed++;
      const a = this.port + (k * Math.PI) / 2;
      const x = 240 + Math.cos(a) * R;
      const y = 112 + Math.sin(a) * R;
      if (k < this.catches) {
        fx.ring(x, y, 22, '#8affb0', 0.3);
        fx.burst(x, y, 10, 80, ['#ffd04a', '#ffffff'], { life: 0.4 });
        for (let i = 0; i < 5; i++) this.bits.streak(x, y, (fx.rand() - 0.5) * 160, (fx.rand() - 0.5) * 160, 0.3, '#ffd04a');
        fx.shake(2 + k, 0.15);
        audio.play('mini_dock_clamp', { pitch: dockStep(k) });
      } else if (!this.q.crash) {
        fx.word('MISS', x, y - 8, '#ff8a7a');
        audio.play('mini_dock_clamp_miss', { pitch: 1 + k * 0.05 });
      }
    }
    if (!this.sealDone && this.contact >= 0.75) {
      this.sealDone = true;
      const s = this.result ?? 0;
      if (s >= 0.55) {
        fx.stop(0.08);
        fx.flash('#8affb0', 0.3);
        fx.ring(240, 112, 200, '#8affb0', 0.6);
        fx.ring(240, 112, 120, '#ffffff', 0.4);
        fx.burst(240, 112, 36, 120, ['#8affb0', '#ffffff'], { grav: 0 });
        fx.word(s >= 0.85 ? 'PERFECT SEAL!' : 'SEALED', 240, 60, s >= 0.85 ? '#ffffff' : '#8affb0', 2, { pop: true, life: 1.6 });
        audio.play('mini_dock_seal');
        // the pressure equalises: gas vents from each clamp, out past the rim
        for (let k = 0; k < 4; k++) {
          const a = this.port + (k * Math.PI) / 2 + Math.PI / 4;
          for (let i = 0; i < 5; i++) this.bits.smoke(240 + Math.cos(a) * 110, 112 + Math.sin(a) * 110, Math.cos(a) * (40 + i * 18), Math.sin(a) * (40 + i * 18), 1.2 + i * 0.1, 6 + i * 2, '#c8d8e8');
        }
        if (s >= 0.85) audio.play('mini_dock_perfect');
      } else if (!this.q.crash) {
        fx.word(s >= 0.25 ? 'ROUGH SEAL' : 'NO SEAL', 240, 60, '#ffd04a', 2, { pop: true, life: 1.4 });
        audio.play('mini_dock_rough', { pitch: s >= 0.25 ? 1 : 0.85 });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    if (this.t0 === null) this.t0 = t;
    // the first beat, over the count-in: the station's lights come up, ring by ring
    const power = Math.min(1, (t - this.t0) / 1.3);
    dockSky(ctx, w, h, this.seed);
    stars(ctx, w, h, this.seed, 0, 1 + this.v * 20, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const cx = w / 2;
    const cy = 112;
    // perspective: the port grows as you close in
    const R = 22 / (0.22 + Math.max(0, this.dist) * 0.78);
    hullBand(ctx, w, cx, cy, R * 2.4, power, t);
    this.station(ctx, cx, cy, R, t, power);
    this.bits.draw(ctx, 'back');
    if (this.result === null) this.drawGates(ctx, cx, cy, t);
    // the final approach: landing lights rush into the port, green when you're good to dock
    if (this.final && this.result === null) {
      const ready = this.locked && this.v <= this.safe;
      const col = ready ? '138,255,176' : '255,90,74';
      for (let k = 0; k < 5; k++) {
        const f = (t * (1.2 + (0.25 - Math.min(0.25, this.dist)) * 6) + k / 5) % 1;
        ctx.strokeStyle = `rgba(${col},${0.08 + f * 0.35})`;
        ctx.lineWidth = f > 0.7 ? 2 : 1;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (2.4 - f * 1.35), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.collar(ctx, cx, cy, t);
    this.bits.draw(ctx, 'front');
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    if (this.finalT > 0 && this.contact < 0) {
      const age = 1.4 - this.finalT;
      ctx.globalAlpha = Math.min(1, this.finalT * 3);
      drawText(ctx, 'FINAL APPROACH', 240, 76 - Math.round(age * 6), '#ffd04a', { align: 'center', scale: age < 0.08 ? 3 : 2 });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    vignette(ctx, w, h, 0.6);
    // a crash cracks the canopy
    if (this.q.crash && this.contact >= 0) cracks(ctx, cx + 30, cy - 18, Math.min(1, this.contact * 6), this.seed % 17);
    this.hud(ctx, w, h, t);
    this.drawHint(ctx, 8, 10);
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

  /** Gates ahead: segmented rings that swell as you near them, lit by whether your speed suits them. */
  private drawGates(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      if (g.passed !== null) continue;
      const rel = this.dist - g.at;
      if (rel > 0.55) continue;
      const rr = 26 / (0.06 + rel * 0.9);
      const near = this.nextGate() === g;
      const ok = this.v >= g.lo && this.v <= g.hi;
      const col = !near ? '#6a6488' : ok ? '#8affb0' : this.v > g.hi ? '#ff5a4a' : '#6ad0ff';
      const fade = Math.min(1, (0.55 - rel) * 4);
      ctx.globalAlpha = fade * (near ? 0.9 : 0.4);
      ctx.strokeStyle = 'rgba(10,7,16,0.8)';
      ctx.lineWidth = near ? 6 : 4;
      const turn = t * 0.4 + i;
      for (let s = 0; s < 8; s++) {
        const a0 = turn + (s / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, a0, a0 + Math.PI / 6);
        ctx.stroke();
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = near ? 3 : 2;
      for (let s = 0; s < 8; s++) {
        const a0 = turn + (s / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, a0, a0 + Math.PI / 6);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (near && rr < 150) {
        glow(ctx, cx, cy - rr, 10, col, 0.5 * fade);
        drawText(ctx, `${Math.round(g.lo * 100)}-${Math.round(g.hi * 100)}`, cx, cy - rr - 10, col, { align: 'center' });
      }
    }
  }

  /** A dock sprite turned to an angle about its origin. */
  private turned(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, a: number, o: { scale?: number; clip?: string; t?: number; frame?: number; alpha?: number } = {}) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(a);
    const ok = drawSprite(ctx, 'dock', name, 0, 0, o);
    ctx.restore();
    return ok;
  }

  /** The station's docking ring: frosted plating turning with the port, rim lights, the clamps. */
  private station(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number, power: number) {
    const S = R * 2.4;
    const alarm = this.tell > 0;
    // a crash knocks the ring back
    const kick = this.q.crash && this.contact >= 0 ? Math.max(0, 1 - this.contact * 2) * 6 : 0;
    cx += Math.round(Math.sin(this.contact * 60) * kick);
    // the ring's own sprite, in whichever size is nearest 1:1 (the two biggest are quarters)
    const mouths = [22, 32, 48, 68, 94];
    let lod = 0;
    for (let i = 1; i < mouths.length; i++) if (Math.abs(Math.log(R / mouths[i])) < Math.abs(Math.log(R / mouths[lod]))) lod = i;
    const scale = R / mouths[lod];
    let drawn: boolean;
    if (lod >= 3) {
      drawn = true;
      for (let q = 0; q < 4; q++) drawn = this.turned(ctx, `face_${lod}`, cx, cy, this.port + (q * Math.PI) / 2, { scale, alpha: 0.4 + power * 0.6 }) && drawn;
    } else drawn = this.turned(ctx, `face_${lod}`, cx, cy, this.port, { scale, alpha: 0.4 + power * 0.6 });
    if (!drawn) {
      ctx.fillStyle = '#2a2e44';
      ctx.beginPath();
      ctx.arc(cx, cy, S, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0a0a14';
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
    }
    // the alarm washes the ring red
    if (alarm && Math.floor(t * 8) % 2) glow(ctx, cx, cy, S, '#ff4a5a', 0.18);
    // rim lights, chasing round; all red and flashing before a spin change; green once sealed
    const sealed = this.sealDone && (this.result ?? 0) >= 0.55;
    const lit = Math.floor(power * 24);
    for (let k = 0; k < 24; k++) {
      const a = this.port + (k / 24) * Math.PI * 2;
      const on = k > lit ? false : sealed ? (k + Math.floor(this.contact * 30)) % 3 === 0 : alarm ? Math.floor(t * 10) % 2 === k % 2 : (k + Math.floor(t * 8)) % 6 === 0;
      const x = cx + Math.cos(a) * S * 0.92;
      const y = cy + Math.sin(a) * S * 0.92;
      const col = sealed ? '#8affb0' : alarm || this.q.crash ? '#ff4a5a' : '#ffd04a';
      const sz = Math.max(2, Math.round(R / 30));
      ctx.fillStyle = on ? col : alarm ? '#4a2028' : '#4a4030';
      ctx.fillRect(Math.round(x) - sz / 2, Math.round(y) - sz / 2, sz, sz);
      if (on) glow(ctx, x, y, alarm ? 9 : 6 + R / 20, col, 0.5);
    }
    // the warning: arrows round the rim showing the new turn, and how hard
    if (alarm && this.pending !== null) {
      const dir = Math.sign(this.pending);
      const n = Math.abs(this.pending) > 0.8 ? 3 : Math.abs(this.pending) > 0.5 ? 2 : 1;
      const rr = Math.min(S * 0.75, 150);
      const sweep = (1 - this.tell / this.tellMax) * 0.6;
      for (const [lw, col] of [
        [4, 'rgba(10,7,16,0.8)'],
        [2, '#ff8a7a'],
      ] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        for (let q = 0; q < 4; q++) {
          const a0 = q * (Math.PI / 2) + this.port + dir * sweep;
          ctx.beginPath();
          ctx.arc(cx, cy, rr, a0, a0 + dir * 0.6, dir < 0);
          ctx.stroke();
          // chevrons at the leading end, more for a faster spin
          for (let c = 0; c < n; c++) {
            const a = a0 + dir * (0.6 + c * 0.12);
            const x = cx + Math.cos(a) * rr;
            const y = cy + Math.sin(a) * rr;
            const tx = -Math.sin(a) * dir;
            const ty = Math.cos(a) * dir;
            ctx.beginPath();
            ctx.moveTo(x - tx * 4 + Math.cos(a) * 4, y - ty * 4 + Math.sin(a) * 4);
            ctx.lineTo(x, y);
            ctx.lineTo(x - tx * 4 - Math.cos(a) * 4, y - ty * 4 - Math.sin(a) * 4);
            ctx.stroke();
          }
        }
      }
    }
    // the throat's light: teal, green when locked or sealed, red in an alarm
    glow(ctx, cx, cy, R * 0.9, alarm || this.q.crash ? '#ff5a4a' : this.locked || sealed ? '#8affb0' : '#4ae0d0', (0.25 + (sealed ? 0.25 : 0)) * power);
    // its clamps: hazard-striped arms reaching into the mouth, where your brackets must meet them
    for (let k = 0; k < 4; k++) {
      const a = this.port + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const n = Math.max(3, Math.round(R * 0.5));
      const sz = Math.max(2, Math.round(R / 16));
      for (let s = 0; s < n; s++) {
        const d = R * 0.5 + (s / n) * R * 0.55;
        ctx.fillStyle = Math.floor((s / n) * 6) % 2 ? '#2a2236' : '#ffb04a';
        ctx.fillRect(Math.round(cx + ca * d) - sz / 2, Math.round(cy + sa * d) - sz / 2, sz, sz);
      }
      glow(ctx, cx + ca * R * 1.2, cy + sa * R * 1.2, 8 + R / 12, '#ffb04a', 0.45);
      // the jaws: waiting open as you close in, then slamming down one by one at contact
      if (R > 46 || this.contact >= 0) {
        const since = k < this.slammed ? this.contact - (0.12 + k * 0.13) : -1;
        const shut = k < this.catches;
        let frame = 0;
        if (since >= 0) frame = shut ? Math.min(5, Math.floor(since * 20 * 2.5)) : since < 0.1 ? Math.floor(since * 50) : Math.max(0, 5 - Math.floor((since - 0.1) * 25));
        const jx = cx + ca * R * 1.2;
        const jy = cy + sa * R * 1.2;
        const ok = this.turned(ctx, 'jaw', jx, jy, a, { clip: 'shut', frame, scale: R / 100, alpha: Math.min(1, (R - 46) / 10 + (this.contact >= 0 ? 1 : 0)) });
        if (!ok && since >= 0) {
          ctx.strokeStyle = shut ? '#8affb0' : '#ff8a7a';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 1.06, a - 0.16, a + 0.16);
          ctx.stroke();
        }
        if (since >= 0) {
          if (shut) glow(ctx, cx + ca * R, cy + sa * R, 16, '#8affb0', since < 0.2 ? 0.9 : 0.4);
          else if (!this.q.crash) glow(ctx, jx, jy, 14, '#ff5a4a', Math.max(0, 0.7 - since));
        }
      }
    }
    ctx.fillStyle = Math.floor(t * 2) % 2 ? '#8affb0' : '#2a6a4a';
    ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 4, 4);
  }

  /** Your docking collar, a fixed ring in front of you with four brackets. */
  private collar(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
    const C = 100;
    const off = this.off();
    const col = this.locked ? '#8affb0' : off < 0.25 ? '#c8f0a0' : '#8affe0';
    ctx.strokeStyle = this.locked ? 'rgba(138,255,176,0.5)' : 'rgba(138,255,224,0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.arc(cx, cy, C, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let k = 0; k < 4; k++) {
      const a = this.a + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // a bracket: the arm, its crossbar, its jet; a status light along it in the lock colour
      const ok = this.turned(ctx, 'bracket', cx + ca * (C - 5), cy + sa * (C - 5), a);
      ctx.strokeStyle = ok ? col : 'rgba(10,7,16,0.8)';
      ctx.lineWidth = ok ? 2 : 5;
      ctx.beginPath();
      ctx.moveTo(cx + ca * (C - 13), cy + sa * (C - 13));
      ctx.lineTo(cx + ca * (C + 3), cy + sa * (C + 3));
      if (!ok) {
        ctx.moveTo(cx + ca * (C - 15) - sa * 5, cy + sa * (C - 15) + ca * 5);
        ctx.lineTo(cx + ca * (C - 15) + sa * 5, cy + sa * (C - 15) - ca * 5);
      }
      ctx.stroke();
      if (!ok) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      if (this.locked) glow(ctx, cx + ca * (C - 5), cy + sa * (C - 5), 12, '#8affb0', 0.4);
      // roll jets puff at the bracket tips
      if (this.jet && this.result === null && this.fx.rand() < 0.3) {
        const d = -Math.sign(this.jet);
        this.fx.spark(cx + ca * (C + 6), cy + sa * (C + 6), -sa * d * 40, ca * d * 40, 0.25, '#c8f0ff', { drag: 4 });
        if (this.fx.rand() < 0.4) this.bits.smoke(cx + ca * (C + 6), cy + sa * (C + 6), -sa * d * 30, ca * d * 30, 0.4, 2, '#c8d8e8');
      }
    }
    // the reticle
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx) - 10, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx) + 5, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx), Math.round(cy) - 10, 1, 6);
    ctx.fillRect(Math.round(cx), Math.round(cy) + 5, 1, 6);
    if (this.result === null && this.final) {
      // on the final approach the reticle says what's wrong, or that you're good
      const say = !this.locked ? (this.slip() > 0.12 ? 'SPIN' : 'ALIGN') : this.v > this.safe ? '▼ SLOW' : 'READY';
      const bw = say.length * 6 + 9;
      ctx.fillStyle = 'rgba(10,7,16,0.8)';
      ctx.fillRect(Math.round(cx - bw / 2), Math.round(cy) + 8, bw, 11);
      drawText(ctx, say, cx + 1, cy + 10, say === 'READY' ? '#8affb0' : '#ff8a7a', { align: 'center' });
    } else if (this.locked && this.result === null) drawText(ctx, 'LOCKED', cx, cy + 16, '#8affb0', { align: 'center' });
    if (this.thrust && this.result === null) glow(ctx, cx, cy, 30, '#ffd04a', 0.12 + Math.sin(t * 30) * 0.04);
  }

  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    // at contact the readouts fade, so the clamps slamming shut are all you see
    const fade = this.contact >= 0 ? Math.max(0, 1 - this.contact * 3) : 1;
    if (fade <= 0) return;
    ctx.save();
    ctx.globalAlpha = fade;
    this.readouts(ctx, w, h, t);
    ctx.restore();
  }

  private readouts(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const by = h - 20;
    ctx.fillStyle = 'rgba(10,7,16,0.8)';
    ctx.fillRect(0, by - 8, w, 28);
    // the clamps
    const off = this.off();
    drawText(ctx, 'CLAMPS', 8, by - 4, '#8a8098');
    meter(ctx, 8, by + 6, 100, 4, 1 - off, off < 0.15 ? '#8affb0' : off < 0.35 ? '#ffd04a' : '#ff8a3a');
    // the spin: centre is matched, the needle shows which way you're off
    const sx = 136;
    const alarm = this.tell > 0 && Math.floor(t * 8) % 2;
    drawText(ctx, alarm ? 'SPIN CHANGE' : 'SPIN', sx, by - 4, alarm ? '#ff5a4a' : '#8a8098');
    ctx.fillStyle = '#120c18';
    ctx.fillRect(sx - 1, by + 5, 102, 6);
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(sx, by + 6, 100, 4);
    ctx.fillStyle = '#2a6a4a';
    ctx.fillRect(sx + 44, by + 6, 12, 4);
    const rel = Math.max(-1, Math.min(1, (this.av - this.spin()) / 1.2));
    const nx = sx + 50 + Math.round(rel * 48);
    ctx.fillStyle = this.slip() < 0.12 ? '#8affb0' : '#f4ecd8';
    ctx.fillRect(nx - 1, by + 3, 3, 10);
    // the spin it's about to change to, a ghost on the dial
    if (this.pending !== null) {
      const gx = sx + 50 + Math.round(Math.max(-1, Math.min(1, (this.av - this.pending) / 1.2)) * 48);
      ctx.fillStyle = '#ff5a4a';
      ctx.fillRect(gx, by + 4, 1, 8);
    }
    // range, and the gate or the dock ahead
    drawText(ctx, `RANGE ${Math.max(0, Math.round(this.dist * 100))}`, 300, by - 4, '#c8bcd8', { align: 'center' });
    if (this.braking && this.result === null) drawText(ctx, 'BRAKE', 300, by + 6, '#6ad0ff', { align: 'center' });
    else if (this.thrust && this.result === null) drawText(ctx, 'THRUST', 300, by + 6, '#ffd04a', { align: 'center' });
    // speed: the window the next gate wants, or the safe line to dock under
    const vx = w - 128;
    const vw = 118;
    const g = this.nextGate();
    const X = (v: number) => vx + Math.round((vw * v) / 0.3);
    const ok = g ? this.v >= g.lo && this.v <= g.hi : this.v <= this.safe;
    // the label turns into the warning, so nothing ever overlaps it
    const warn = this.result === null && !ok ? (g && this.v < g.lo ? 'SPEED UP: HOLD' : 'BRAKE: HOLD ▼') : '';
    if (warn) drawText(ctx, warn, vx, by - 4, Math.floor(t * 6) % 2 ? (g && this.v < g.lo ? '#6ad0ff' : '#ff5a4a') : '#f4ecd8');
    else drawText(ctx, 'CLOSING', vx, by - 4, '#8a8098');
    drawText(ctx, `${Math.round(this.v * 100)}`, vx + vw, by - 4, ok ? '#8affb0' : '#f4ecd8', { align: 'right' });
    meter(ctx, vx, by + 6, vw, 4, this.v / 0.3, ok ? '#8affb0' : g && this.v < g.lo ? '#6ad0ff' : '#ff5a4a');
    if (g) {
      ctx.fillStyle = 'rgba(138,255,176,0.35)';
      ctx.fillRect(X(g.lo), by + 3, X(g.hi) - X(g.lo), 10);
      ctx.fillStyle = '#8affb0';
      ctx.fillRect(X(g.lo), by + 3, 1, 10);
      ctx.fillRect(X(g.hi), by + 3, 1, 10);
    } else {
      ctx.fillStyle = '#f4ecd8';
      ctx.fillRect(X(this.safe), by + 3, 1, 10);
    }
    // gates passed, as pips
    for (let i = 0; i < this.gates.length; i++) {
      const p = this.gates[i].passed;
      ctx.fillStyle = p === null ? '#3a3448' : p ? '#8affb0' : '#ff5a4a';
      ctx.fillRect(272 + i * 8, by + 14, 5, 3);
    }
  }
}

interface Gate {
  /** The range it stands at. */
  at: number;
  /** The closing speeds it wants. */
  lo: number;
  hi: number;
  /** Whether you went through it right, once you've been through. */
  passed: boolean | null;
}
