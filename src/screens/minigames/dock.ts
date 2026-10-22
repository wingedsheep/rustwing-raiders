import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, stars, ticked, timer, vignette, wrapAngle, type Minigame, type Pad } from './common';

/**
 * Dock: a station's port (or a pod's hatch) turning in front of you, like Elite's Coriolis. Left
 * and right fire your roll jets: your collar has weight, so you match the port's spin first and
 * then line up its clamps. Hold the button to close in, pull down to brake; let go and you coast.
 *
 * On the way in are approach gates, rings you fly through, each lit with the closing speed it
 * wants: too fast or too slow through one and it's missed. So the approach is a rhythm of thrust
 * and brake while you hold the roll. Partway in, the station's spin changes (its rim lights flash
 * red and the klaxon sounds first, with an arrow for the new turn) and you have to match it
 * again. At contact the clamps, the spin and the speed make the seal; the gates and a quick
 * approach top it up. Higher levels: faster spin that changes more often and can reverse,
 * slipperier jets, narrower gate windows, a lower safe speed and stricter clamps.
 */
export class Dock implements Minigame {
  readonly title = 'MATCH AND DOCK';
  readonly how = 'LEFT/RIGHT: ROLL TO MATCH THE SPIN AND CLAMPS. HOLD TO THRUST, DOWN TO BRAKE. FLY THE GATES AT THEIR SPEED, DOCK SLOW.';
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

  constructor(
    level: number,
    private seed: number,
  ) {
    const r = rng(seed);
    const d = (this.d = hardness(level));
    const dir = r() < 0.5 ? 1 : -1;
    this.port = r() * Math.PI;
    this.a = this.port + Math.PI / 4;
    this.safe = byLevel(d, 0.12, 0.08);
    this.acc = byLevel(d, 2.0, 2.8);
    this.drag = byLevel(d, 0.45, 0.12);
    this.limit = byLevel(d, 26, 22);
    this.spinNow = this.spinGoal = dir * byLevel(d, 0.45, 0.8);

    // the spin changes, at ranges spread through the approach
    const n = Math.round(byLevel(d, 1, 3));
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
    const g = d < 0.3 ? [0.72, 0.45] : [0.76, 0.54, 0.3];
    const width = byLevel(d, 0.075, 0.035);
    let fast = r() < 0.5;
    for (const at of g) {
      // fast and slow by turns, so every gate means a change of pace
      const mid = fast ? 0.14 + r() * 0.04 : 0.06 + r() * 0.03;
      fast = !fast;
      this.gates.push({ at, lo: Math.max(0.02, mid - width / 2), hi: mid + width / 2, passed: null });
    }
  }

  private spin() {
    // from vicious up, the spin wobbles on top
    const wob = Math.max(0, this.d - 0.5) * 2 * 0.25;
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
    if (g) parts.push(this.v > g.hi ? 'GATE: SLOW DOWN' : this.v < g.lo ? 'GATE: SPEED UP' : 'GATE: HOLD IT');
    else if (this.v > this.safe) parts.push('TOO FAST!');
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

    this.shiftUpdate(dt);
    this.spinNow += (this.spinGoal - this.spinNow) * Math.min(1, dt * 5);
    this.port += this.spin() * dt;
    // roll jets: they push, and the collar keeps turning (a little drag, less at higher levels)
    this.av += pad.x * this.acc * dt;
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
    if (lock && !this.locked) audio.play('aux_ready', { pitch: 1.3, vol: 0.6 });
    this.locked = lock;

    // the gates, as you pass through them
    for (const g of this.gates) {
      if (g.passed !== null || !(was > g.at && this.dist <= g.at)) continue;
      g.passed = this.v >= g.lo && this.v <= g.hi;
      if (g.passed) {
        this.streak++;
        fx.ring(240, 112, 220, '#8affb0', 0.45);
        fx.word(this.streak > 1 ? `GATE CLEAN X${this.streak}` : 'GATE CLEAN', 240, 60, '#8affb0', 1, { pop: true });
        audio.play('pickup_scrap', { pitch: 0.9 + this.streak * 0.15 });
      } else {
        this.streak = 0;
        fx.ring(240, 112, 220, '#ff5a4a', 0.35);
        fx.word(this.v > g.hi ? 'GATE: TOO FAST' : 'GATE: TOO SLOW', 240, 60, '#ff8a7a', 1, { pop: true });
        fx.shake(2, 0.2);
        audio.play('ui_error', { vol: 0.6 });
      }
    }

    if (this.dist <= 0) this.touch();
    else if (this.time >= this.limit) {
      this.result = 0;
      this.grade = 'OUT OF TIME';
      fx.word('OUT OF TIME', 240, 60, '#ffd04a', 2, { pop: true, life: 1.4 });
      audio.play('ui_error');
    }
    audio.loop('engine', 'dock', this.result === null && this.thrust, 0.5);
  }

  /** Spin changes: a warning (red rim, klaxon), then the station turns over to its new spin. */
  private shiftUpdate(dt: number) {
    const next = this.shifts[0];
    if (this.pending === null && next && this.dist <= next.at) {
      this.shifts.shift();
      this.pending = next.spin;
      this.tell = this.tellMax = byLevel(this.d, 1.3, 0.8);
      audio.play('horn', { pitch: 1.1, vol: 0.7 });
      this.fx.word('SPIN CHANGE!', 240, 40, '#ff8a7a', 1, { pop: true, life: 1.2 });
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
    this.fx.word(flip ? 'REVERSED!' : Math.abs(this.spinGoal) > Math.abs(this.spinNow) ? 'FASTER!' : 'SLOWER!', 240, 52, '#ffd04a', 2, { pop: true });
    audio.play('ram', { pitch: 0.7, vol: 0.6 });
  }

  /** Contact: the seal is made of the clamps, the spin and the speed; the gates and the time top it up. */
  private touch() {
    const fx = this.fx;
    const d = this.d;
    this.dist = 0;
    this.contact = 0;
    const align = Math.max(0, Math.min(1, 1 - Math.max(0, this.off() - byLevel(d, 0.05, 0.03)) * byLevel(d, 1.6, 2.2)));
    const spin = Math.max(0, Math.min(1, 1 - Math.max(0, this.slip() - 0.03) * byLevel(d, 1.3, 2)));
    const gentle = this.v <= this.safe ? 1 : Math.max(0, 1 - (this.v - this.safe) / byLevel(d, 0.12, 0.07));
    const crash = gentle < 0.4;
    this.q = { align, spin, gentle, crash };
    const seal = align * spin * gentle;
    const gates = this.gates.filter((g) => g.passed).length / this.gates.length;
    const quick = Math.max(0, Math.min(1, (byLevel(d, 15, 13) - this.time) / 6));
    this.result = Math.max(0, Math.min(1, seal * (0.66 + 0.22 * gates + 0.12 * quick)));
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
      audio.play('crash');
    } else {
      fx.shake(3, 0.25);
      fx.ring(240, 112, 110, '#c8f0ff', 0.3);
      audio.play('block', { pitch: 0.7 });
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
        fx.shake(2 + k, 0.15);
        audio.play('heavy', { pitch: 0.9 + k * 0.08, vol: 0.7 });
      } else if (!this.q.crash) {
        fx.word('MISS', x, y - 8, '#ff8a7a');
        audio.play('heavy_dry', { pitch: 1 + k * 0.05, vol: 0.6 });
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
        audio.play('perfect', { vol: s >= 0.85 ? 1 : 0.6 });
      } else if (!this.q.crash) {
        fx.word(s >= 0.25 ? 'ROUGH SEAL' : 'NO SEAL', 240, 60, '#ffd04a', 2, { pop: true, life: 1.4 });
        audio.play(s >= 0.25 ? 'ram' : 'ui_error');
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    ctx.fillStyle = '#05060e';
    ctx.fillRect(0, 0, w, h);
    stars(ctx, w, h, this.seed, 0, 1 + this.v * 20, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    const cx = w / 2;
    const cy = 112;
    // perspective: the port grows as you close in
    const R = 22 / (0.22 + Math.max(0, this.dist) * 0.78);
    this.station(ctx, cx, cy, R, t);
    if (this.result === null) this.drawGates(ctx, cx, cy, t);
    this.collar(ctx, cx, cy, t);
    fx.drawSparks(ctx);
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, 0.6);
    this.hud(ctx, w, h, t);
    timer(ctx, w, this.limit - this.time, this.limit, t);
    fx.drawFlash(ctx, w, h);
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

  /** The station face: a lit disc of plating turning with the port, rim lights, the clamps. */
  private station(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number) {
    const S = R * 2.4;
    const alarm = this.tell > 0;
    const g = ctx.createRadialGradient(cx - S * 0.4, cy - S * 0.5, S * 0.1, cx, cy, S);
    g.addColorStop(0, alarm && Math.floor(t * 8) % 2 ? '#7a5060' : '#5a6080');
    g.addColorStop(0.6, '#2a2e44');
    g.addColorStop(1, '#14162a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, S, 0, Math.PI * 2);
    ctx.fill();
    // plating: rings and spokes that turn with it
    ctx.lineWidth = 1;
    for (const k of [0.62, 0.8, 1.4, 1.9]) {
      ctx.strokeStyle = 'rgba(10,10,24,0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, R * k * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 12; k++) {
      const a = this.port + (k / 12) * Math.PI * 2 + Math.PI / 12;
      ctx.strokeStyle = k % 3 === 0 ? 'rgba(140,150,190,0.35)' : 'rgba(10,10,24,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 1.25, cy + Math.sin(a) * R * 1.25);
      ctx.lineTo(cx + Math.cos(a) * S * 0.97, cy + Math.sin(a) * S * 0.97);
      ctx.stroke();
    }
    // rim lights, chasing round; all red and flashing before a spin change
    for (let k = 0; k < 24; k++) {
      const a = this.port + (k / 24) * Math.PI * 2;
      const on = alarm ? Math.floor(t * 10) % 2 === k % 2 : (k + Math.floor(t * 8)) % 6 === 0;
      const x = cx + Math.cos(a) * S * 0.9;
      const y = cy + Math.sin(a) * S * 0.9;
      const col = alarm ? '#ff4a5a' : '#ffd04a';
      ctx.fillStyle = on ? col : alarm ? '#4a2028' : '#4a4030';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      if (on) glow(ctx, x, y, alarm ? 9 : 6, col, 0.5);
    }
    // the warning: arrows round the rim showing the new turn, and how hard
    if (alarm && this.pending !== null) {
      const dir = Math.sign(this.pending);
      const n = Math.abs(this.pending) > 0.8 ? 3 : Math.abs(this.pending) > 0.5 ? 2 : 1;
      const rr = Math.min(S * 0.75, 150);
      const sweep = (1 - this.tell / this.tellMax) * 0.6;
      ctx.strokeStyle = '#ff8a7a';
      ctx.lineWidth = 2;
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
    // the port: a dark mouth with a lit throat
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    glow(ctx, cx, cy, R * 0.9, alarm ? '#ff5a4a' : this.locked ? '#8affb0' : '#6ad0ff', 0.35);
    ctx.strokeStyle = '#8a90b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // its clamps: hazard-striped arms
    for (let k = 0; k < 4; k++) {
      const a = this.port + (k * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const n = Math.max(3, Math.round(R * 0.5));
      for (let s = 0; s < n; s++) {
        const d = R * 0.5 + (s / n) * R * 0.7;
        ctx.fillStyle = Math.floor((s / n) * 6) % 2 ? '#2a2236' : '#ffb04a';
        const sz = Math.max(2, Math.round(R / 16));
        ctx.fillRect(Math.round(cx + ca * d) - sz / 2, Math.round(cy + sa * d) - sz / 2, sz, sz);
      }
      glow(ctx, cx + ca * R * 1.2, cy + sa * R * 1.2, 8, '#ffb04a', 0.5);
      // after contact, the jaws: a clamp band slams down over each bracket, and stays if it caught
      if (this.contact >= 0 && k < this.slammed) {
        const shut = k < this.catches;
        const since = this.contact - (0.12 + k * 0.13);
        const drop = Math.max(0, 1 - since * 9);
        const rr = R * (shut ? 1.06 + drop * 0.35 : 1.06 + Math.min(1, since * 2) * 0.3);
        const span = shut ? 0.16 : 0.1;
        ctx.globalAlpha = shut ? 1 : Math.max(0, 1 - since * 1.5);
        ctx.strokeStyle = 'rgba(10,7,16,0.9)';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, a - span, a + span);
        ctx.stroke();
        ctx.strokeStyle = shut ? '#8affb0' : '#ff8a7a';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, rr - 2, a - span, a + span);
        ctx.stroke();
        ctx.globalAlpha = 1;
        if (shut) glow(ctx, cx + ca * R, cy + sa * R, 14, '#8affb0', since < 0.2 ? 0.9 : 0.4);
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
      // a bracket: a bar along the radius with a crossbar at its tip
      ctx.strokeStyle = 'rgba(10,7,16,0.8)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + ca * (C - 16), cy + sa * (C - 16));
      ctx.lineTo(cx + ca * (C + 6), cy + sa * (C + 6));
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx + ca * (C - 15), cy + sa * (C - 15));
      ctx.lineTo(cx + ca * (C + 5), cy + sa * (C + 5));
      ctx.moveTo(cx + ca * (C - 15) - sa * 5, cy + sa * (C - 15) + ca * 5);
      ctx.lineTo(cx + ca * (C - 15) + sa * 5, cy + sa * (C - 15) - ca * 5);
      ctx.stroke();
      if (this.locked) glow(ctx, cx + ca * (C - 5), cy + sa * (C - 5), 12, '#8affb0', 0.4);
      // roll jets puff at the bracket tips
      if (this.jet && this.result === null && this.fx.rand() < 0.3) {
        const d = -Math.sign(this.jet);
        this.fx.spark(cx + ca * (C + 4), cy + sa * (C + 4), -sa * d * 40, ca * d * 40, 0.25, '#c8f0ff', { drag: 4 });
      }
    }
    // the reticle
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(cx) - 10, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx) + 5, Math.round(cy), 6, 1);
    ctx.fillRect(Math.round(cx), Math.round(cy) - 10, 1, 6);
    ctx.fillRect(Math.round(cx), Math.round(cy) + 5, 1, 6);
    if (this.locked && this.result === null) drawText(ctx, 'LOCKED', cx, cy + 16, '#8affb0', { align: 'center' });
    if (this.thrust && this.result === null) glow(ctx, cx, cy, 30, '#ffd04a', 0.12 + Math.sin(t * 30) * 0.04);
  }

  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
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
    drawText(ctx, `CLOSING ${Math.round(this.v * 100)}`, vx, by - 4, '#8a8098');
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
    if (this.result === null && Math.floor(t * 6) % 2) {
      if (g && !ok) drawText(ctx, this.v > g.hi ? 'GATE: SLOWER' : 'GATE: FASTER', w - 10, by - 4, this.v > g.hi ? '#ff5a4a' : '#6ad0ff', { align: 'right' });
      else if (!g && !ok) drawText(ctx, 'TOO FAST', w - 10, by - 4, '#ff5a4a', { align: 'right' });
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
