import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, ticked, timer, type Minigame, type Pad } from './common';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Crate {
  x: number;
  y: number;
  /** Gold: worth three plain ones, heavy, and stowed deep. */
  gold: boolean;
  /** Lying in the hold, trailing on your line, or banked through the hatch. */
  state: 'free' | 'line' | 'bank';
  /** Seconds since it was knocked loose (it can't be hooked again straight away). */
  loose: number;
}

type Mode = 'sleep' | 'prowl' | 'hunt' | 'wind' | 'lunge' | 'rest' | 'stun';

interface Beast {
  x: number;
  y: number;
  /** The stalker hears you and sees you in your own lamp; the listener is blind but hears further. */
  kind: 'stalker' | 'listener';
  mode: Mode;
  /** Time left in this mode (asleep: until it wakes; prowling: until it picks a new spot). */
  t: number;
  /** Where it's heading. */
  tx: number;
  ty: number;
  /** Which way the lunge goes, locked when it winds up. */
  dx: number;
  dy: number;
  /** Until it can lunge again. */
  cd: number;
  /** How long it's gone without hearing you while hunting. */
  lost: number;
}

const GOLD_VALUE = 3;
const GOLD_LOAD = 2.5;
const LUNGE_SPEED = 250;
const LUNGE_TIME = 0.3;

/**
 * Grab and go: a derelict's dark hold seen from above, crates glinting among the stacks, and the
 * hatch you came in by grinding shut. Fly the drone over crates to hook them; they trail behind on
 * a line. Bring the line back into the striped bay by the hatch to bank it, then go again. Gold
 * crates are worth three, sit deep, and weigh you down.
 *
 * Something lives in here. It hears your line rattle: the more you carry and the faster you go,
 * the further the sound carries (the ring round the drone). When it's close it crouches, then
 * lunges where you were: a hit knocks crates off your line, and a lunge through the line snaps it.
 * Slam a stack at speed and your last crate falls off too. The button fires your flash, which stuns
 * whatever's near (catch one mid-crouch for a long stun) but wakes everything else. At the hatch it
 * takes you out. Be in the doorway when it seals or you lose the drone and half the haul.
 *
 * Higher levels: more crates, tighter stacks, a dimmer lamp, a quicker, sharper-eared beast, and
 * from VICIOUS a second, blind one that only hunts by sound.
 */
export class Grab implements Minigame {
  readonly title = 'GRAB AND GO';
  readonly how = 'HOOK CRATES, BANK THEM IN THE HATCH BAY (GOLD IS WORTH 3). A LONG LINE IS LOUD AND THE BEAST HEARS IT. PRESS: FLASH. PRESS AT THE HATCH: LEAVE.';
  result: number | null = null;
  private x = 24;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private crates: Crate[] = [];
  /** The order you hooked them in, for the line behind you. */
  private line: Crate[] = [];
  private path: { x: number; y: number }[] = [];
  private stacks: Box[] = [];
  private beasts: Beast[] = [];
  private time = 0;
  private readonly limit = 25;
  private fx = new Fx();
  private r: Rng;
  private readonly W = 480;
  private readonly top = 14;
  private readonly H: number;
  private dark: HTMLCanvasElement | null = null;
  /** Out through the hatch (the drone flies off); sealed in (it's lost). */
  private out = false;
  private sealed = false;
  private hurt = 0;
  private daze = 0;
  private flash = 0;
  private flashCd = 0;
  /** A burst of noise from a scrape or the flash, on top of the line's rattle. */
  private kick = 0;
  /** How far you can be heard right now, and the ring that shows it (eased). */
  private noise = 26;
  private ring = 26;
  private haulT = 0;
  private trip = 0;
  private tripN = 0;
  private banked = 0;
  private goldBanked = 0;
  private hits = 0;
  private scrapes = 0;
  private perfects = 0;
  private alertCd = 0;
  // by level
  private readonly lamp: number;
  private readonly darkA: number;
  private readonly prowlSp: number;
  private readonly huntSp: number;
  private readonly hearK: number;
  private readonly lungeR: number;
  private readonly windT: number;
  private readonly scrapeV: number;
  private readonly flashMax: number;
  private readonly stunT: number;
  private readonly knock: number;

  constructor(level: number, seed: number, h = 240) {
    const r = rng(seed);
    this.r = rng(seed ^ 0x9e37);
    const d = hardness(level);
    this.H = h - 34;
    this.lamp = byLevel(d, 82, 54);
    this.darkA = byLevel(d, 0.8, 0.93);
    this.prowlSp = byLevel(d, 16, 26);
    this.huntSp = byLevel(d, 34, 56);
    this.hearK = byLevel(d, 12, 18);
    this.lungeR = byLevel(d, 50, 70);
    this.windT = byLevel(d, 0.7, 0.42);
    this.scrapeV = byLevel(d, 100, 72);
    this.flashMax = byLevel(d, 5, 8);
    this.stunT = byLevel(d, 3, 2);
    this.knock = level >= 4 ? 2 : 1;
    this.y = this.hatchY;

    // stacks of cargo in columns, each with a gap through the middle, and lanes between columns
    // at least 22 wide, so every corner of the hold can be reached
    const cols = level >= 3 ? 6 : 5;
    const x0 = 72;
    const colW = (this.W - 40 - x0) / cols;
    const bot = this.top + this.H;
    const midGap = byLevel(d, 44, 30);
    for (let c = 0; c < cols; c++) {
      const w = 18 + r() * (Math.min(34, colW - 26) - 18);
      const x = x0 + c * colW + r() * (colW - w - 22);
      const gap = midGap + r() * 14;
      const gc = this.top + 30 + gap / 2 + r() * (this.H - 60 - gap);
      // flush against the wall, or with a tight alley behind it
      const y1 = this.top + (r() < 0.45 ? 0 : 14 + r() * 16);
      const y2 = bot - (r() < 0.45 ? 0 : 14 + r() * 16);
      if (gc - gap / 2 - y1 > 12) this.stacks.push({ x, y: y1, w, h: gc - gap / 2 - y1 });
      if (y2 - (gc + gap / 2) > 12) this.stacks.push({ x, y: gc + gap / 2, w, h: y2 - (gc + gap / 2) });
    }
    // gold deep in the hold, plain ones all over
    const place = (gold: boolean, xa: number, xb: number) => {
      for (let tries = 0; tries < 400; tries++) {
        const x = xa + r() * (xb - xa);
        const y = this.top + 12 + r() * (this.H - 24);
        if (this.hit(x, y, 8)) continue;
        if (this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 28)) continue;
        this.crates.push({ x, y, gold, state: 'free', loose: 9 });
        return;
      }
    };
    const golds = level >= 3 ? 3 : 2;
    for (let k = 0; k < golds; k++) place(true, this.W * 0.62, this.W - 24);
    const plain = Math.round(byLevel(d, 7, 8));
    for (let k = 0; k < plain; k++) place(false, 64, this.W - 30);

    const beast = (kind: Beast['kind'], x: number, y: number, wake: number): Beast => ({ x, y, kind, mode: 'sleep', t: wake, tx: x, ty: y, dx: 0, dy: 0, cd: 0, lost: 0 });
    this.beasts.push(beast('stalker', this.W - 28, this.top + this.H * (0.25 + r() * 0.5), byLevel(d, 4, 1)));
    if (level >= 4) this.beasts.push(beast('listener', this.W * 0.55, r() < 0.5 ? this.top + 20 : bot - 20, level >= 5 ? 5 : 8));
  }

  private get hatchY() {
    return this.top + this.H / 2;
  }

  /** How wide the doorway still is, each way from the middle: it closes slowly, then fast. */
  private get open() {
    return Math.max(0, 24 * (1 - (this.time / this.limit) ** 2.5));
  }

  private hit(x: number, y: number, rad: number) {
    if (x < 8 + rad || x > this.W - 8 - rad || y < this.top + rad || y > this.top + this.H - rad) return true;
    return this.stacks.some((b) => x > b.x - rad && x < b.x + b.w + rad && y > b.y - rad && y < b.y + b.h + rad);
  }

  /** In the striped bay by the hatch, where the line is banked. */
  private inBay() {
    return this.x < 40 && Math.abs(this.y - this.hatchY) < 26;
  }

  /** In the doorway itself, where you can leave: it narrows as the doors close. */
  private atHatch() {
    return this.inBay() && Math.abs(this.y - this.hatchY) < Math.max(5, this.open + 5);
  }

  private worth(c: Crate) {
    return c.gold ? GOLD_VALUE : 1;
  }

  private get total() {
    return this.crates.reduce((s, c) => s + this.worth(c), 0);
  }

  private get load() {
    return this.line.reduce((s, c) => s + (c.gold ? GOLD_LOAD : 1), 0);
  }

  private get lineValue() {
    return this.line.reduce((s, c) => s + this.worth(c), 0);
  }

  private score() {
    return clamp(this.banked / (this.total || 1), 0, 1);
  }

  status() {
    const haul = `HAUL ${this.banked}/${this.total}${this.line.length ? `  +${this.lineValue} ON THE LINE` : ''}`;
    if (this.result !== null) return this.sealed ? `${haul}  SEALED IN` : haul;
    if (this.atHatch()) return `${haul}  PRESS TO LEAVE`;
    return `${haul}${this.limit - this.time < 5 ? '  GET OUT!' : ''}`;
  }

  breakdown(): [string, string][] {
    const golds = this.crates.filter((c) => c.gold).length;
    return [
      ['HAUL', `${this.banked}/${this.total}`],
      ['GOLD', `${this.goldBanked}/${golds}`],
      ['HITS', `${this.hits + this.scrapes}`],
      ['OUT', this.sealed ? 'SEALED IN' : this.banked >= this.total ? 'CLEANED OUT' : `${Math.max(0, this.limit - this.time).toFixed(1)}S SPARE`],
    ];
  }

  update(dt: number, pad: Pad) {
    // banked crates still fly into the hatch, even through the end
    for (const c of this.crates)
      if (c.state === 'bank') {
        c.x += (2 - c.x) * Math.min(1, dt * 12);
        c.y += (this.hatchY - c.y) * Math.min(1, dt * 12);
      }
    if (this.fx.frozen(dt)) return;
    if (this.result !== null) {
      if (this.out) this.x -= dt * 90;
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time, 5)) audio.play('ui_move', { pitch: 1.5 });
    this.hurt -= dt;
    this.daze -= dt;
    this.flash -= dt;
    this.flashCd -= dt;
    this.alertCd -= dt;
    this.kick = Math.max(0, this.kick - dt * 200);

    // every crate on the line makes you slower to get going (gold ones most)
    const load = this.load;
    const acc = (this.daze > 0 ? 0 : 600) / (1 + load * 0.07);
    this.vx = (this.vx + pad.x * acc * dt) * Math.exp(-dt * 5);
    this.vy = (this.vy + pad.y * acc * dt) * Math.exp(-dt * 5);
    const nx = this.x + this.vx * dt;
    if (!this.hit(nx, this.y, 5)) this.x = nx;
    else {
      this.bump(Math.abs(this.vx), Math.sign(this.vx), 0);
      this.vx *= -0.3;
    }
    const ny = this.y + this.vy * dt;
    if (!this.hit(this.x, ny, 5)) this.y = ny;
    else {
      this.bump(Math.abs(this.vy), 0, Math.sign(this.vy));
      this.vy *= -0.3;
    }

    // the line behind you follows where you've been
    const last = this.path[0];
    if (!last || Math.hypot(last.x - this.x, last.y - this.y) > 2) {
      this.path.unshift({ x: this.x, y: this.y });
      if (this.path.length > 160) this.path.pop();
    }
    for (const c of this.crates) {
      c.loose += dt;
      if (c.state === 'free' && c.loose > 0.9 && Math.hypot(c.x - this.x, c.y - this.y) < 11) {
        c.state = 'line';
        this.line.push(c);
        audio.play(c.gold ? 'pickup_part' : 'pickup_scrap', { pitch: 0.9 + this.line.length * 0.05 });
        this.fx.burst(c.x, c.y, c.gold ? 18 : 10, c.gold ? 80 : 60, c.gold ? ['#ffd04a', '#fff4c0', '#ffffff'] : ['#e8aa5a', '#ffffff']);
        this.fx.word(c.gold ? 'GOLD +3' : '+1', c.x, c.y - 12, c.gold ? '#ffd04a' : '#e8aa5a', 1, { pop: c.gold });
        if (c.gold) this.fx.ring(c.x, c.y, 18, '#ffd04a', 0.3);
      }
    }
    this.line.forEach((c, i) => {
      const p = this.path[Math.min(this.path.length - 1, (i + 1) * 5)] ?? { x: this.x, y: this.y };
      c.x += (p.x - c.x) * Math.min(1, dt * 14);
      c.y += (p.y - c.y) * Math.min(1, dt * 14);
    });

    // in the bay the line reels in through the hatch, one crate at a time
    if (this.inBay() && this.line.length) {
      this.haulT -= dt;
      if (this.haulT <= 0) {
        this.haulT = 0.08;
        this.bank(this.line.shift()!);
        if (!this.line.length) this.tripDone();
      }
    } else {
      this.haulT = 0;
      if (this.trip) this.tripDone();
    }
    if (this.banked >= this.total) {
      this.result = 1;
      this.out = true;
      this.fx.word('CLEANED OUT!', this.W / 2, this.hatchY - 20, '#8affb0', 2, { pop: true, life: 1.6 });
      this.fx.flash('#ffd04a', 0.2);
      this.fx.ring(12, this.hatchY, 120, '#8affb0', 0.6);
      audio.play('perfect');
      audio.play('warp', { vol: 0.6 });
      return;
    }

    // how far the rattle carries
    const sp = Math.min(1, Math.hypot(this.vx, this.vy) / 110);
    this.noise = Math.max(this.kick, Math.min(210, 26 + load * this.hearK * (0.35 + 0.65 * sp)));
    this.ring += (this.noise - this.ring) * Math.min(1, dt * 6);

    // the flash: away from the hatch, the button lights the hold and stuns what's near
    if (pad.press && !this.atHatch() && this.time > 0.3) {
      if (this.flashCd <= 0) this.fire();
      else audio.play('ui_error', { vol: 0.4 });
    }

    for (const b of this.beasts) this.think(b, dt);

    if (pad.press && this.atHatch() && this.time > 1) this.leave();
    else if (this.time >= this.limit) {
      if (this.atHatch()) this.leave();
      else {
        // sealed in: the line's lost and the drone with it, and the ship only gets half
        this.sealed = true;
        for (const c of this.line.splice(0)) this.drop(c);
        this.result = this.score() * 0.5;
        audio.play('crash');
        audio.play('player_hit', { vol: 0.6 });
        this.fx.shake(6, 0.5);
        this.fx.flash('#ff5a4a', 0.25);
        this.fx.stop(0.12);
        this.fx.word('SEALED IN', this.W / 2, this.hatchY - 20, '#ff5a4a', 2, { pop: true, life: 1.6 });
      }
    }
  }

  /** You ran into a stack (or the wall): hard enough, and your last crate shakes off. */
  private bump(speed: number, sx: number, sy: number) {
    if (speed < 45) return;
    const px = this.x + sx * 5;
    const py = this.y + sy * 5;
    if (speed > this.scrapeV && this.line.length) {
      this.scrapes++;
      this.drop(this.line.pop()!);
      this.kick = 150;
      this.fx.shake(3, 0.2);
      this.fx.stop(0.05);
      this.fx.burst(px, py, 14, 90, ['#ffd04a', '#ffffff', '#ff8a3a']);
      this.fx.word('SCRAPED!', this.x, this.y - 14, '#ff8a3a', 1, { pop: true });
      audio.play('hit_armor');
    } else {
      this.kick = Math.max(this.kick, 60);
      for (let k = 0; k < 5; k++) this.fx.spark(px, py, (this.fx.rand() - 0.5) * 60 - sx * 40, (this.fx.rand() - 0.5) * 60 - sy * 40, 0.25, '#c8bcd8');
      audio.play('block', { vol: 0.3 });
    }
  }

  /** A crate falls off the line and lies where it fell. */
  private drop(c: Crate) {
    c.state = 'free';
    c.loose = 0;
    this.fx.burst(c.x, c.y, 8, 50, ['#c88a3a', '#e8aa5a']);
  }

  private bank(c: Crate) {
    c.state = 'bank';
    const v = this.worth(c);
    this.banked += v;
    this.trip += v;
    this.tripN++;
    if (c.gold) this.goldBanked++;
    audio.play('pickup_scrap', { pitch: 1 + this.tripN * 0.09 });
    this.fx.word(`+${v}`, 26, this.hatchY - 30 - this.tripN * 3, c.gold ? '#ffd04a' : '#e8aa5a');
    this.fx.burst(10, this.hatchY, 6, 50, ['#ffd04a', '#ffffff']);
  }

  /** A trip's haul all banked: the bigger it was, the louder it lands. */
  private tripDone() {
    const big = this.tripN >= 4 || this.trip >= 6;
    this.fx.word(big ? `BIG HAUL +${this.trip}` : `BANKED +${this.trip}`, 64, this.hatchY - 46, big ? '#8affb0' : '#ffd04a', big ? 2 : 1, { pop: true, life: 1.2 });
    this.fx.ring(10, this.hatchY, big ? 70 : 40, big ? '#8affb0' : '#ffd04a', 0.4);
    if (big) {
      audio.play('perfect', { vol: 0.7 });
      this.fx.flash('#ffd04a', 0.1);
    }
    this.trip = 0;
    this.tripN = 0;
  }

  private leave() {
    for (const c of this.line.splice(0)) this.bank(c);
    this.result = this.score();
    this.out = true;
    audio.play('warp', { vol: 0.6 });
    this.fx.ring(10, this.hatchY, 60, '#8affb0', 0.5);
    this.fx.word('OUT!', 60, this.hatchY - 20, '#8affb0', 2, { pop: true, life: 1.2 });
  }

  /** The flash: everything near is stunned, everything else now knows where you are. */
  private fire() {
    this.flash = 0.5;
    this.flashCd = this.flashMax;
    this.kick = 210;
    audio.play('flare');
    this.fx.ring(this.x, this.y, 110, '#c8f0ff', 0.4);
    for (const b of this.beasts) {
      const d = Math.hypot(b.x - this.x, b.y - this.y);
      if (d < 110 && b.mode !== 'sleep') {
        const perfect = b.mode === 'wind';
        b.mode = 'stun';
        b.t = this.stunT * (perfect ? 1.6 : 1);
        if (perfect) {
          this.perfects++;
          this.fx.stop(0.1);
          this.fx.word('PERFECT!', b.x, b.y - 18, '#8affe0', 2, { pop: true });
          this.fx.ring(b.x, b.y, 30, '#8affe0', 0.35);
          audio.play('parry');
        } else this.fx.word('STUNNED', b.x, b.y - 16, '#8affe0');
      } else if (b.mode !== 'stun') {
        // woken or not, it heard that
        b.mode = 'hunt';
        b.tx = this.x;
        b.ty = this.y;
        b.lost = 0;
        this.fx.word('!', b.x, b.y - 16, '#ff3a5a', 2, { pop: true });
      }
    }
  }

  private hears(b: Beast, d: number) {
    if (d < this.noise * (b.kind === 'listener' ? 1.45 : 1)) return true;
    return b.kind === 'stalker' && d < this.lamp * 0.55;
  }

  private moveTo(b: Beast, x: number, y: number, sp: number, dt: number) {
    const dx = x - b.x;
    const dy = y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return d;
    const s = Math.min(d, sp * dt);
    b.x += (dx / d) * s;
    b.y += (dy / d) * s;
    return d;
  }

  /** What the thing in the dark does this frame. */
  private think(b: Beast, dt: number) {
    b.t -= dt;
    b.cd -= dt;
    const d = Math.hypot(this.x - b.x, this.y - b.y);
    const heard = this.hears(b, d);
    const sp = (b.kind === 'listener' ? 1.15 : 1) * this.huntSp;
    switch (b.mode) {
      case 'sleep':
        if (b.t <= 0 || (heard && this.time > 1.5)) {
          b.mode = 'prowl';
          b.t = 0;
          audio.play('shriek', { vol: 0.35, pitch: b.kind === 'listener' ? 1.3 : 0.8 });
          this.fx.ring(b.x, b.y, 50, '#ff3a5a', 0.5);
        }
        break;
      case 'stun':
        if (b.t <= 0) {
          b.mode = 'hunt';
          b.cd = 0.5;
        }
        break;
      case 'prowl':
        if (heard) {
          b.mode = 'hunt';
          b.lost = 0;
          if (this.alertCd <= 0) {
            audio.play('shriek', { vol: 0.45 });
            this.alertCd = 1.2;
          }
          this.fx.word('!', b.x, b.y - 16, '#ff3a5a', 2, { pop: true });
          break;
        }
        if (this.moveTo(b, b.tx, b.ty, this.prowlSp, dt) < 4 || b.t <= 0) {
          b.tx = 110 + this.r() * (this.W - 140);
          b.ty = this.top + 20 + this.r() * (this.H - 40);
          b.t = 3 + this.r() * 3;
        }
        break;
      case 'hunt':
        if (heard) {
          b.tx = this.x;
          b.ty = this.y;
          b.lost = 0;
        } else b.lost += dt;
        if (b.lost > 1.8) {
          b.mode = 'prowl';
          b.t = 2;
          this.fx.word('?', b.x, b.y - 16, '#8a8098');
          break;
        }
        this.moveTo(b, b.tx, b.ty, sp, dt);
        if (heard && d < this.lungeR && b.cd <= 0) {
          b.mode = 'wind';
          b.t = this.windT;
          b.dx = (this.x - b.x) / (d || 1);
          b.dy = (this.y - b.y) / (d || 1);
          audio.play('laser_charge', { vol: 0.35, pitch: 1.6 });
        } else if (d < 11 && this.hurt <= 0) this.mauled(b);
        break;
      case 'wind':
        // it draws back before it springs
        b.x -= b.dx * 10 * dt;
        b.y -= b.dy * 10 * dt;
        if (b.t <= 0) {
          b.mode = 'lunge';
          b.t = LUNGE_TIME;
          audio.play('dash', { pitch: 0.7 });
        }
        break;
      case 'lunge': {
        b.x += b.dx * LUNGE_SPEED * dt;
        b.y += b.dy * LUNGE_SPEED * dt;
        if (Math.floor(b.t * 60) % 2) this.fx.spark(b.x, b.y, -b.dx * 40, -b.dy * 40, 0.3, '#5a1a34', { glow: false, size: 2 });
        if (d < 12 && this.hurt <= 0) this.mauled(b);
        else {
          // through the line: it snaps there, and everything behind falls
          const i = this.line.findIndex((c) => Math.hypot(c.x - b.x, c.y - b.y) < 9);
          if (i >= 0) {
            const cut = this.line.splice(i);
            for (const c of cut) this.drop(c);
            this.fx.word(`SNAPPED! -${cut.length}`, b.x, b.y - 14, '#ff5a4a', 1, { pop: true });
            this.fx.shake(3, 0.2);
            this.fx.stop(0.06);
            audio.play('shield_break', { vol: 0.5 });
          }
        }
        if (b.t <= 0) {
          b.mode = 'rest';
          b.t = 0.8;
        }
        break;
      }
      case 'rest':
        if (b.t <= 0) {
          b.mode = 'hunt';
          b.cd = 0.6;
        }
        break;
    }
    b.x = clamp(b.x, 14, this.W - 12);
    b.y = clamp(b.y, this.top + 8, this.top + this.H - 8);
  }

  /** It got you: knocked flying, dazed, and crates off the end of the line. */
  private mauled(b: Beast) {
    this.hits++;
    this.hurt = 1.2;
    this.daze = 0.35;
    const d = Math.hypot(this.x - b.x, this.y - b.y) || 1;
    this.vx = ((this.x - b.x) / d) * 200;
    this.vy = ((this.y - b.y) / d) * 200;
    let lost = 0;
    for (let k = 0; k < this.knock && this.line.length; k++, lost++) this.drop(this.line.pop()!);
    this.fx.stop(0.09);
    this.fx.shake(5, 0.35);
    this.fx.flash('#ff5a4a', 0.15);
    this.fx.ring(this.x, this.y, 30, '#ff5a4a', 0.3);
    this.fx.burst(this.x, this.y, 20, 110, ['#ff5a4a', '#ffffff', '#5a1a34']);
    this.fx.word(lost ? `LOST ${lost}!` : 'OUCH!', this.x, this.y - 14, '#ff5a4a', 1, { pop: true });
    audio.play('player_hit', { vol: 0.7 });
    b.mode = 'rest';
    b.t = 1;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    ctx.fillStyle = '#120e16';
    ctx.fillRect(-8, -8, w + 16, h + 16);
    // deck plates
    const bot = this.top + this.H;
    for (let y = this.top; y < bot; y += 16)
      for (let x = 8; x < this.W - 8; x += 16) {
        ctx.fillStyle = (x / 16 + y / 16) % 2 < 1 ? '#262030' : '#221c2a';
        ctx.fillRect(x, y, 15, 15);
        ctx.fillStyle = '#2e2838';
        ctx.fillRect(x, y, 15, 1);
      }
    // stripes on the deck by the hatch: the bay
    for (let y = this.hatchY - 24; y < this.hatchY + 24; y += 6) {
      ctx.fillStyle = this.inBay() && this.line.length ? '#5a4a18' : '#3a3018';
      ctx.fillRect(10, y, 28, 3);
    }
    // stacks: a lit top and a dark south face
    for (const b of this.stacks) {
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      const bw = Math.round(b.w);
      const bh = Math.round(b.h);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(x + 3, y + 4, bw, bh);
      ctx.fillStyle = '#3a3040';
      ctx.fillRect(x, y + bh - 5, bw, 5);
      ctx.fillStyle = '#5a4e5e';
      ctx.fillRect(x, y, bw, bh - 5);
      ctx.fillStyle = '#6e6272';
      ctx.fillRect(x, y, bw, 2);
      for (let yy = y + 9; yy < y + bh - 6; yy += 10) {
        ctx.fillStyle = '#4a3e4e';
        ctx.fillRect(x + 1, yy, bw - 2, 1);
      }
      ctx.fillStyle = '#4a3e4e';
      ctx.fillRect(x + Math.round(bw / 2), y + 2, 1, bh - 7);
    }
    // the line, then the crates
    if (this.line.length) {
      ctx.strokeStyle = 'rgba(200,188,216,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (const c of this.line) ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    for (const c of this.crates) if (c.state !== 'bank' || c.x > 8) this.crate(ctx, c, t);
    for (const b of this.beasts) this.beast(ctx, b, t);
    // your drone
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    if (!(this.out && this.x < 0) && !this.sealed) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 4, y - 1, 11, 9);
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 6, y - 6, 12, 11);
      ctx.fillStyle = this.hurt > 0 && Math.floor(t * 20) % 2 ? '#ff5a4a' : '#6ad0c8';
      ctx.fillRect(x - 5, y - 5, 10, 9);
      ctx.fillStyle = '#8affe0';
      ctx.fillRect(x - 5, y - 5, 10, 2);
      ctx.fillStyle = '#2a6a5a';
      ctx.fillRect(x - 3, y - 2, 6, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1, y - 1, 2, 2);
      // rotors
      const spin = Math.floor(t * 30) % 2;
      ctx.fillStyle = '#c8f0ff';
      for (const [rx, ry] of [[-7, -7], [6, -7], [-7, 5], [6, 5]]) ctx.fillRect(x + rx - (spin ? 1 : 0), y + ry, spin ? 3 : 1, spin ? 1 : 3);
    }
    fx.drawSparks(ctx);

    this.lights(ctx, w, h, t);

    // things you see in the dark: crate glints, the beasts' eyes, the hatch
    for (const c of this.crates) {
      if (c.state !== 'free') continue;
      if (Math.sin(t * (c.gold ? 5 : 3) + c.x * 0.1) > (c.gold ? 0.3 : 0.6)) {
        ctx.fillStyle = c.gold ? '#fff4c0' : '#ffd04a';
        ctx.fillRect(Math.round(c.x) - 5, Math.round(c.y) - 5, 1, 1);
        glow(ctx, c.x - 4, c.y - 4, c.gold ? 9 : 5, '#ffd04a', c.gold ? 0.8 : 0.6);
      }
    }
    for (const b of this.beasts) this.tells(ctx, b, t);
    // the ring your noise carries to: red when something is inside it
    if (this.result === null) {
      const heard = this.beasts.some((b) => b.mode !== 'sleep' && b.mode !== 'stun' && this.hears(b, Math.hypot(b.x - this.x, b.y - this.y)));
      ctx.save();
      ctx.strokeStyle = heard ? '#ff5a5a' : '#8affe0';
      ctx.globalAlpha = heard ? 0.3 + Math.sin(t * 12) * 0.1 : 0.14;
      ctx.setLineDash([2, 4]);
      ctx.lineDashOffset = -t * 12;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (this.line.length) drawText(ctx, `+${this.lineValue}`, x, y - 16, '#e8aa5a', { align: 'center' });
    }
    this.hatch(ctx, t);
    fx.drawWords(ctx);
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    this.footer(ctx, w, h, t);
    fx.drawFlash(ctx, w, h);
  }

  private crate(ctx: CanvasRenderingContext2D, c: Crate, t: number) {
    if (c.loose < 0.9 && Math.floor(t * 12) % 2) return;
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 3, y - 2, 10, 9);
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 6, y - 6, 12, 11);
    if (c.gold) {
      ctx.fillStyle = '#d8a82a';
      ctx.fillRect(x - 5, y - 5, 10, 9);
      ctx.fillStyle = '#fff0a0';
      ctx.fillRect(x - 5, y - 5, 10, 2);
      ctx.fillStyle = '#8a6a1a';
      ctx.fillRect(x - 5, y + 2, 10, 2);
      ctx.fillStyle = '#5a4a18';
      ctx.fillRect(x - 5, y - 1, 10, 1);
      ctx.fillRect(x - 1, y - 3, 2, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 4, y - 4, 1, 1);
      return;
    }
    ctx.fillStyle = '#c88a3a';
    ctx.fillRect(x - 5, y - 5, 10, 9);
    ctx.fillStyle = '#e8aa5a';
    ctx.fillRect(x - 5, y - 5, 10, 2);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(x - 5, y + 2, 10, 2);
    ctx.fillRect(x - 1, y - 3, 2, 5);
  }

  /** The beast's body: a dark mass with too many legs. It crouches to wind up and stretches to lunge. */
  private beast(ctx: CanvasRenderingContext2D, b: Beast, t: number) {
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    const moving = b.mode === 'prowl' || b.mode === 'hunt' || b.mode === 'lunge';
    const pale = b.kind === 'listener';
    const squash = b.mode === 'wind' ? 0.7 : b.mode === 'lunge' ? 1.3 : 1;
    const legs = pale ? '#2a2430' : '#1a0610';
    ctx.fillStyle = legs;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + (moving ? Math.sin(t * (b.mode === 'hunt' ? 16 : 8) + k) * 0.35 : 0);
      const reach = (pale ? 18 : 15) * squash;
      for (let s = 4; s < reach; s++) ctx.fillRect(Math.round(bx + Math.cos(a) * s), Math.round(by + Math.sin(a) * s + Math.sin(s * 0.5) * 1.5), 2, 2);
    }
    const bw = Math.round(14 * (b.mode === 'wind' ? 1.2 : 1));
    const bh = Math.round(12 * (b.mode === 'wind' ? 0.75 : 1));
    ctx.fillStyle = pale ? '#4a4458' : '#3a0e24';
    ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    ctx.fillStyle = pale ? '#6a6478' : '#5a1a34';
    ctx.fillRect(bx - bw / 2 + 1, by - bh / 2, bw - 2, 3);
  }

  /** What gives a beast away in the dark: eyes, feelers, and the line of its lunge as it crouches. */
  private tells(ctx: CanvasRenderingContext2D, b: Beast, t: number) {
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    if (b.mode === 'wind') {
      // where it will land: a dotted line and its end, blinking faster as it's about to go
      const f = 1 - b.t / this.windT;
      const len = LUNGE_SPEED * LUNGE_TIME;
      const on = Math.floor(t * (8 + f * 20)) % 2 === 0;
      ctx.fillStyle = on ? '#ff3a5a' : '#8a1a2a';
      for (let s = 10; s < len; s += 5) ctx.fillRect(Math.round(bx + b.dx * s), Math.round(by + b.dy * s), 2, 2);
      glow(ctx, bx + b.dx * len, by + b.dy * len, 10, '#ff3a5a', 0.3 + f * 0.4);
      glow(ctx, bx, by, 24, '#ff3a5a', 0.2 + f * 0.4);
    }
    if (b.kind === 'listener') {
      // no eyes: pale feelers that twitch when it hears
      if (b.mode === 'sleep') return;
      const hunting = b.mode === 'hunt' || b.mode === 'wind' || b.mode === 'lunge';
      ctx.fillStyle = b.mode === 'stun' ? '#5a4a5a' : hunting ? '#f4ecd8' : '#8a8098';
      for (const s of [-1, 1]) {
        const a = -Math.PI / 2 + s * 0.6 + Math.sin(t * (hunting ? 20 : 4) + s) * 0.2;
        for (let k = 6; k < 12; k += 2) ctx.fillRect(Math.round(bx + Math.cos(a) * k), Math.round(by + Math.sin(a) * k), 1, 1);
      }
      if (hunting) glow(ctx, bx, by - 8, 12, '#c8b0ff', 0.3);
    } else {
      const eye = b.mode === 'stun' || b.mode === 'sleep' ? '#3a2a3a' : b.mode === 'prowl' ? '#8a2a3a' : '#ff3a5a';
      ctx.fillStyle = eye;
      if (b.mode === 'sleep') {
        ctx.fillRect(bx - 4, by - 1, 2, 1);
        ctx.fillRect(bx + 2, by - 1, 2, 1);
      } else {
        ctx.fillRect(bx - 4, by - 2, 2, 2);
        ctx.fillRect(bx + 2, by - 2, 2, 2);
      }
      if (b.mode === 'hunt' || b.mode === 'lunge') {
        glow(ctx, bx, by - 1, 10, '#ff3a5a', 0.5);
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        if (d < 60) glow(ctx, bx, by, 40, '#ff3a5a', 0.15 * (1 - d / 60));
      }
    }
    if (b.mode === 'sleep' && Math.floor(t * 1.5) % 2) drawText(ctx, 'Z', bx + 6, by - 14 - Math.round((t * 4) % 4), '#5a4e68');
    if (b.mode === 'stun') drawText(ctx, '*', bx + Math.round(Math.sin(t * 8) * 4), by - 14, '#8affe0', { align: 'center' });
  }

  /** The dark: a black sheet with holes for your lamp, the hatch's light and the flash. */
  private lights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    if (!this.dark) {
      this.dark = document.createElement('canvas');
      this.dark.width = w;
      this.dark.height = h;
    }
    const g = this.dark.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    const fl = Math.max(0, this.flash) * 2;
    g.fillStyle = `rgba(6,4,12,${this.darkA * (1 - Math.min(1, fl))})`;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const flicker = 1 + Math.sin(t * 23) * 0.02 + Math.sin(t * 7) * 0.03;
    if (!this.sealed) hole(this.x, this.y, this.lamp * flicker);
    hole(16, this.hatchY, 30 + this.open * 1.2, 0.9);
    ctx.drawImage(this.dark, 0, 0);
    // a cool wash where the lamp falls, a warm one at the door
    glow(ctx, this.x, this.y, this.lamp * 0.6, '#8affe0', 0.08);
    glow(ctx, 16, this.hatchY, 26 + this.open, '#ffd04a', 0.18);
  }

  /** The hatch: two doors grinding shut, a beacon going round, and the doorway you can leave by. */
  private hatch(ctx: CanvasRenderingContext2D, t: number) {
    const hy = this.hatchY;
    const open = Math.round(this.open);
    ctx.fillStyle = '#3a3448';
    ctx.fillRect(0, this.top, 8, this.H);
    ctx.fillStyle = '#4a4458';
    ctx.fillRect(0, this.top, 8, 2);
    // the gap: light from outside
    ctx.fillStyle = '#ffe8a0';
    ctx.fillRect(0, hy - open, 4, open * 2);
    // the doors' edges, striped
    for (const s of [-1, 1]) {
      const ey = s < 0 ? hy - open - 8 : hy + open;
      for (let k = 0; k < 8; k += 2) {
        ctx.fillStyle = (k / 2) % 2 ? '#2a2236' : '#ffd04a';
        ctx.fillRect(0, ey + k, 8, 2);
      }
    }
    const left = this.limit - this.time;
    const urgent = left < 6;
    const pulse = urgent ? Math.floor(t * 8) % 2 : Math.floor(t * 2) % 2;
    glow(ctx, 6, hy, 20 + open, urgent ? '#ff5a4a' : '#ffd04a', pulse ? 0.5 : 0.25);
    if (this.result !== null) return;
    // the doorway: the box you must be in to leave, shrinking with the doors
    const lz = Math.max(5, open + 5);
    const inside = this.atHatch();
    if (inside || urgent) {
      ctx.strokeStyle = inside ? (Math.floor(t * 4) % 2 ? '#8affb0' : '#3a8a5a') : pulse ? '#ff5a4a' : '#8a2a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(9.5, Math.round(hy - lz) + 0.5, 30, Math.round(lz * 2));
    }
    if (urgent && !inside && Math.floor(t * 4) % 2) drawText(ctx, '←', 44, hy - 3, '#ff5a4a');
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fy = h - 16;
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(0, fy - 4, w, 20);
    const urgent = this.limit - this.time < 6 && this.result === null;
    drawText(ctx, '← HATCH', 6, fy, urgent && Math.floor(t * 6) % 2 ? '#ff5a4a' : '#ffd04a');
    drawText(ctx, `${this.banked}/${this.total}`, 56, fy, '#f4ecd8');
    // the haul: a box per crate, gold ones bigger; banked ones solid, ones on the line outlined
    const order = [...this.crates].sort((a, b) => Number(a.gold) - Number(b.gold));
    const widths = order.map((c) => (c.gold ? 11 : 7));
    let bx = Math.round(w / 2 - (widths.reduce((s, x) => s + x + 2, 0) - 2) / 2) + 10;
    order.forEach((c, k) => {
      const cw = widths[k];
      const col = c.gold ? '#ffd04a' : '#c88a3a';
      if (c.state === 'bank') {
        ctx.fillStyle = col;
        ctx.fillRect(bx, fy, cw, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(bx, fy, cw, 1);
      } else {
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(bx, fy, cw, 7);
        if (c.state === 'line') {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, fy + 0.5, cw - 1, 6);
        }
      }
      bx += cw + 2;
    });
    const ready = this.flashCd <= 0;
    drawText(ctx, 'FLASH', w - 96, fy, ready ? '#8affe0' : '#8a8098');
    meter(ctx, w - 62, fy + 1, 50, 4, 1 - Math.max(0, this.flashCd) / this.flashMax, ready ? '#8affe0' : '#4a6a7a');
    if (ready && this.result === null) glow(ctx, w - 37, fy + 3, 16, '#8affe0', 0.2 + Math.sin(t * 6) * 0.1);
    if (this.atHatch() && this.result === null && Math.floor(t * 3) % 2) drawText(ctx, 'PRESS TO LEAVE', w / 2, fy - 14, '#8affb0', { align: 'center' });
  }
}
