import { audio } from '../../audio';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, type Rng } from '../../util';
import { byLevel, Fx, glow, hardness, meter, ticked, timer, type Minigame, type Pad } from './common';
import { penta } from './grab-sound';
import { drawSprite, spriteReady } from './sprites';
import { drawFlashed, Juice, panel } from './thread-art';

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
  /** Until its next breath. */
  breath: number;
  /** For drawing: which way it faces, and how long since the flash caught it. */
  face: number;
  hitT: number;
}

const GOLD_VALUE = 3;
const GOLD_LOAD = 2.5;
const LUNGE_SPEED = 250;
const LUNGE_TIME = 0.3;

/** Turns angle `a` towards `b` by at most `k` (a fraction of the way, the short way round). */
function turn(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, k);
}

/**
 * Grab and go: a derelict's dark hold seen from above, crates glinting among the stacks, and the
 * hatch you came in by grinding shut. Fly the drone over crates to hook them; they trail behind on
 * a line. Bring the line back into the striped bay by the hatch to bank it, then go again. Gold
 * crates are worth three, sit deep, and weigh you down.
 *
 * Something lives in here. It hears your line rattle: the more you carry and the faster you go,
 * the further the sound carries (the ring round the drone). Only its lunge hurts, and it always
 * crouches first, with the line it will take drawn in red: dodge off that line, or fire the flash
 * (the button), which stuns whatever's near (catch one mid-crouch for a long stun) but tells
 * everything else where you are. A hit knocks a crate off your line, a lunge through the line
 * snaps it there, and slamming a stack at speed shakes your last crate off. At the hatch the button
 * takes you out. Be in the doorway when it seals or you lose the drone and half the haul.
 *
 * Higher levels: more gold, more stacks with tighter gaps, a dimmer lamp, a quicker, sharper-eared
 * beast that wakes sooner, and from VICIOUS a second, blind one that only hunts by sound and
 * guards the deep half, where the gold is: go quiet (stop, or creep with a short line) and it soon
 * loses you. The deeper holds give you longer (30 s at EASY, 41 at DEADLY). In the last third the
 * beasts go into a frenzy. The drone rounds corners it nearly clears, so the stacks never snag.
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
  private readonly limit: number;
  private fx = new Fx();
  private juice = new Juice('grab');
  /** Junk on the deck, the beacons on the north wall, the drone's heading, the first frame drawn. */
  private junk: { x: number; y: number; name: string }[] = [];
  private beacons: number[] = [];
  private face = 0;
  private t0 = -1;
  private readonly seed: number;
  private r: Rng;
  private readonly W = 480;
  private readonly top = 14;
  private readonly H: number;
  private dark: HTMLCanvasElement | null = null;
  private bg: HTMLCanvasElement | null = null;
  /** Out through the hatch (the drone flies off); sealed in (it's lost). */
  private out = false;
  private sealed = false;
  /** Been out into the hold yet: until then the button can't take you out (and waste the run). */
  private ventured = false;
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
  private doorT = 0;
  /** How far you've flown since the line last rattled. */
  private rattle = 0;
  /** A one-line prompt at the moment a thing first matters, and the ones already shown. */
  private tip = { text: '', t: 0 };
  private told = new Set<string>();
  private raged = false;
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
  /** The level as 0..1. */
  private readonly d: number;

  constructor(level: number, seed: number, h = 240) {
    const r = rng(seed);
    this.r = rng(seed ^ 0x9e37);
    this.seed = seed;
    const d = hardness(level);
    this.d = d;
    this.H = h - 34;
    // a deeper hold, a little longer to clear it
    this.limit = [30, 30, 32, 38, 41][clamp(Math.round(level), 1, 5) - 1];
    // the beast sharpens quickly over the first levels, then levels off
    const db = Math.sqrt(d);
    this.lamp = byLevel(d, 82, 54);
    this.darkA = byLevel(d, 0.8, 0.93);
    this.prowlSp = byLevel(db, 16, 26);
    this.huntSp = byLevel(db, 32, 48);
    this.hearK = byLevel(db, 12, 18);
    this.lungeR = byLevel(db, 48, 70);
    this.windT = byLevel(db, 0.75, 0.5);
    this.scrapeV = byLevel(d, 110, 90);
    this.flashMax = byLevel(d, 5, 6.5);
    this.stunT = byLevel(d, 3, 2.4);
    this.knock = 1;
    this.y = this.hatchY;

    // stacks of cargo in columns, each with a gap through the middle, and lanes between columns
    // at least 22 wide, so every corner of the hold can be reached
    const cols = level >= 3 ? 6 : 5;
    const x0 = 72;
    const colW = (this.W - 40 - x0) / cols;
    const bot = this.top + this.H;
    const midGap = byLevel(d, 48, 40);
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
    const plain = 7;
    for (let k = 0; k < plain; k++) place(false, 64, this.W - 30);

    const beast = (kind: Beast['kind'], x: number, y: number, wake: number): Beast => ({ x, y, kind, mode: 'sleep', t: wake, tx: x, ty: y, dx: 0, dy: 0, cd: 0, lost: 0, breath: 0.5 + r() * 1.5, face: Math.PI, hitT: 9 });
    this.beasts.push(beast('stalker', this.W - 28, this.top + this.H * (0.25 + r() * 0.5), byLevel(d, 4, 1)));
    if (level >= 4) this.beasts.push(beast('listener', this.W * 0.78, r() < 0.5 ? this.top + 20 : bot - 20, level >= 5 ? 7 : 12));

    // the dressing (its own dice, so the hold plays the same): junk where nothing stands, beacons
    const dr = rng(seed ^ 0x51ed);
    for (let k = 0, tries = 0; k < 9 && tries < 200; tries++) {
      const x = 56 + dr() * (this.W - 80);
      const y = this.top + 10 + dr() * (this.H - 20);
      if (this.hit(x, y, 12) || this.crates.some((c) => Math.hypot(c.x - x, c.y - y) < 16) || this.junk.some((j) => Math.hypot(j.x - x, j.y - y) < 40)) continue;
      this.junk.push({ x, y, name: `junk_${Math.floor(dr() * 6)}` });
      k++;
    }
    this.beacons = [this.W * 0.28, this.W * 0.6, this.W * 0.9].map((x) => Math.round(x + (dr() - 0.5) * 30));
  }

  /** Where the deep hold starts, the listener's ground. */
  private get deep() {
    return this.W * 0.5;
  }

  /** The last third: the beasts move faster. */
  private get rage() {
    return this.time > this.limit * 0.66;
  }

  /** Show a prompt once, the first time it matters. */
  private teach(key: string, text: string) {
    if (this.told.has(key) || this.result !== null) return;
    this.told.add(key);
    this.tip = { text, t: 2.6 };
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
    return this.ventured && this.inBay() && Math.abs(this.y - this.hatchY) < this.open + 8;
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
    this.juice.update(dt);
    for (const b of this.beasts) b.hitT += dt;
    if (this.result !== null) {
      if (this.out) {
        this.x -= dt * 90;
        this.face = Math.PI;
      }
      return;
    }
    const before = this.limit - this.time;
    this.time += dt;
    if (ticked(before, this.limit - this.time, 5)) audio.play('ui_move', { pitch: 1.5 });
    // the doors' ratchet, louder and quicker as they close
    const left = this.limit - this.time;
    if (left < 8) {
      this.doorT -= dt;
      if (this.doorT <= 0) {
        this.doorT = Math.max(0.25, left / 8);
        audio.play('mini_grab_door', { pan: -0.7, vol: 0.5 + (1 - left / 8) * 0.5, pitch: 1 + (1 - left / 8) * 0.25 });
      }
    }
    this.hurt -= dt;
    this.daze -= dt;
    this.flash -= dt;
    this.flashCd -= dt;
    this.alertCd -= dt;
    this.kick = Math.max(0, this.kick - dt * 200);
    this.tip.t -= dt;
    if (this.time > 0.2) this.teach('hook', 'FLY OVER CRATES TO HOOK THEM. GOLD IS WORTH 3');
    if (this.limit - this.time < 7 && !this.atHatch()) this.teach('hatch', 'THE DOORS ARE CLOSING: BE IN THE DOORWAY WHEN THEY SEAL');
    if (this.rage && !this.raged) {
      // the last stretch: it's had enough of you
      this.raged = true;
      if (this.beasts.some((b) => b.mode !== 'sleep')) {
        audio.play('mini_grab_frenzy');
        this.fx.shake(2, 0.4);
        for (const b of this.beasts) if (b.mode !== 'sleep') this.fx.word('FRENZY!', b.x, b.y - 18, '#ff3a5a', 1, { pop: true, life: 1.2 });
      }
    }

    // every crate on the line makes you slower to get going (gold ones most)
    const load = this.load;
    const acc = (this.daze > 0 ? 0 : 600) / (1 + load * 0.07);
    this.vx = (this.vx + pad.x * acc * dt) * Math.exp(-dt * 5);
    this.vy = (this.vy + pad.y * acc * dt) * Math.exp(-dt * 5);
    const nx = this.x + this.vx * dt;
    if (!this.hit(nx, this.y, 5)) this.x = nx;
    else if (!(Math.abs(pad.y) < 0.3 && this.round(nx, this.y, 0, dt))) {
      this.bump(Math.abs(this.vx), Math.sign(this.vx), 0);
      this.vx *= -0.3;
    }
    const ny = this.y + this.vy * dt;
    if (!this.hit(this.x, ny, 5)) this.y = ny;
    else if (!(Math.abs(pad.x) < 0.3 && this.round(this.x, ny, 1, dt))) {
      this.bump(Math.abs(this.vy), 0, Math.sign(this.vy));
      this.vy *= -0.3;
    }

    if (this.x > 60) this.ventured = true;
    // the line rattles as you fly, more often the faster you go and the more it carries
    if (this.line.length) {
      this.rattle += Math.hypot(this.vx, this.vy) * dt;
      if (this.rattle > 46 / Math.sqrt(this.line.length)) {
        this.rattle = 0;
        audio.play('mini_grab_rattle', { vol: Math.min(1, 0.35 + this.load * 0.08), pitch: 0.9 + Math.random() * 0.2, pan: this.pan(this.x) });
      }
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
        this.teach('bank', 'NOW BRING IT BACK TO THE STRIPED BAY TO BANK IT');
        audio.play(c.gold ? 'mini_grab_gold' : 'mini_grab_hook', { pitch: penta(this.line.length - 1), pan: this.pan(c.x) });
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
      audio.play('mini_grab_haul', { pitch: 1.2 });
      audio.play('mini_grab_out');
      return;
    }

    // how far the rattle carries
    const sp = Math.min(1, Math.hypot(this.vx, this.vy) / 110);
    this.noise = Math.max(this.kick, Math.min(210, 26 + load * this.hearK * (0.35 + 0.65 * sp)));
    this.ring += (this.noise - this.ring) * Math.min(1, dt * 6);

    // the flash: away from the hatch, the button lights the hold and stuns what's near
    if (pad.press && !this.atHatch()) {
      if (this.flashCd <= 0) this.fire();
      else audio.play('mini_grab_dry');
    }

    for (const b of this.beasts) {
      const [bx, by] = [b.x, b.y];
      this.think(b, dt);
      // which way it faces: where it's springing, where it's going, or at you
      const want = b.mode === 'wind' || b.mode === 'lunge' ? Math.atan2(b.dy, b.dx) : Math.hypot(b.x - bx, b.y - by) > 0.05 ? Math.atan2(b.y - by, b.x - bx) : b.mode === 'rest' || b.mode === 'hunt' ? Math.atan2(this.y - b.y, this.x - b.x) : b.face;
      b.face = turn(b.face, want, dt * (b.mode === 'wind' ? 30 : 6));
    }
    if (Math.hypot(this.vx, this.vy) > 12) this.face = turn(this.face, Math.atan2(this.vy, this.vx), dt * 8);

    if (pad.press && this.atHatch()) this.leave();
    else if (this.time >= this.limit) {
      if (this.inBay() && Math.abs(this.y - this.hatchY) < this.open + 8) this.leave();
      else {
        // sealed in: the line's lost and the drone with it, and the ship only gets half
        this.sealed = true;
        for (const c of this.line.splice(0)) this.drop(c);
        this.result = this.score() * 0.5;
        audio.play('mini_grab_seal');
        this.fx.shake(6, 0.5);
        this.fx.flash('#ff5a4a', 0.25);
        this.fx.stop(0.12);
        this.fx.word('SEALED IN', this.W / 2, this.hatchY - 20, '#ff5a4a', 2, { pop: true, life: 1.6 });
        this.juice.streaks(6, this.hatchY, 30, 220, ['#ffd04a', '#ffffff', '#ff8a3a'], { dir: 0, spread: 2.6, life: 0.5 });
        this.juice.smoke(10, this.hatchY, 8, '#3a3042', { size: 5, vx: 20 });
      }
    }
  }

  /**
   * Corner assist: blocked going one way, but a few pixels to the side would clear the corner?
   * Slide that way instead of stopping dead (axis 0: blocked in x, slide in y; 1: the other way).
   */
  private round(nx: number, ny: number, axis: 0 | 1, dt: number) {
    for (let k = 1; k <= 7; k++)
      for (const s of [-1, 1]) {
        const free = axis === 0 ? !this.hit(nx, ny + s * k, 5) : !this.hit(nx + s * k, ny, 5);
        if (!free) continue;
        const step = s * Math.min(k, 110 * dt);
        if (axis === 0 && !this.hit(this.x, this.y + step, 5)) this.y += step;
        else if (axis === 1 && !this.hit(this.x + step, this.y, 5)) this.x += step;
        else return false;
        return true;
      }
    return false;
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
      this.fx.burst(px, py, 6, 90, ['#ffd04a', '#ffffff', '#ff8a3a']);
      this.juice.streaks(px, py, 12, 180, ['#ffd04a', '#ffffff', '#ff8a3a'], { dir: Math.atan2(-sy, -sx), spread: 2.4, life: 0.35 });
      this.juice.smoke(px, py, 2, '#4a3e4e', { size: 2 });
      this.fx.word('SCRAPED!', this.x, this.y - 14, '#ff8a3a', 1, { pop: true });
      audio.play('mini_grab_scrape', { pan: this.pan(this.x) });
    } else {
      this.kick = Math.max(this.kick, 60);
      for (let k = 0; k < 5; k++) this.fx.spark(px, py, (this.fx.rand() - 0.5) * 60 - sx * 40, (this.fx.rand() - 0.5) * 60 - sy * 40, 0.25, '#c8bcd8');
      audio.play('mini_grab_bump', { vol: Math.min(1, speed / 90), pan: this.pan(this.x) });
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
    audio.play('mini_grab_bank', { pitch: penta(this.tripN - 1), pan: -0.7 });
    this.fx.word(`+${v}`, 26, this.hatchY - 30 - this.tripN * 3, c.gold ? '#ffd04a' : '#e8aa5a');
    this.fx.burst(10, this.hatchY, 6, 50, ['#ffd04a', '#ffffff']);
  }

  /** A trip's haul all banked: the bigger it was, the louder it lands. */
  private tripDone() {
    const big = this.tripN >= 4 || this.trip >= 6;
    this.fx.word(big ? `BIG HAUL +${this.trip}` : `BANKED +${this.trip}`, 64, this.hatchY - 46, big ? '#8affb0' : '#ffd04a', big ? 2 : 1, { pop: true, life: 1.2 });
    this.fx.ring(10, this.hatchY, big ? 70 : 40, big ? '#8affb0' : '#ffd04a', 0.4);
    if (big) {
      this.fx.flash('#ffd04a', 0.1);
    }
    audio.play('mini_grab_haul', { pitch: big ? 1.2 : 1, pan: -0.6 });
    this.trip = 0;
    this.tripN = 0;
  }

  private leave() {
    for (const c of this.line.splice(0)) this.bank(c);
    this.result = this.score();
    this.out = true;
    audio.play('mini_grab_out', { pan: -0.7 });
    this.fx.ring(10, this.hatchY, 60, '#8affb0', 0.5);
    this.fx.word('OUT!', 60, this.hatchY - 20, '#8affb0', 2, { pop: true, life: 1.2 });
  }

  /** The flash: everything near is stunned, everything else now knows where you are. */
  private fire() {
    this.flash = 0.5;
    this.flashCd = this.flashMax;
    this.kick = 210;
    audio.play('mini_grab_flash', { pan: this.pan(this.x) });
    this.fx.ring(this.x, this.y, 110, '#c8f0ff', 0.4);
    this.juice.streaks(this.x, this.y, 24, 260, ['#ffffff', '#c8f0ff', '#8affe0'], { life: 0.3 });
    for (const b of this.beasts) {
      const d = Math.hypot(b.x - this.x, b.y - this.y);
      if (d < 110 && b.mode !== 'sleep') {
        const perfect = b.mode === 'wind';
        b.mode = 'stun';
        b.hitT = 0;
        this.juice.streaks(b.x, b.y, 10, 120, ['#ffffff', '#8affe0'], { life: 0.35 });
        b.t = this.stunT * (perfect ? 2 : 1);
        if (perfect) {
          this.perfects++;
          this.fx.stop(0.1);
          this.fx.word('PERFECT!', b.x, b.y - 18, '#8affe0', 2, { pop: true });
          this.fx.ring(b.x, b.y, 30, '#8affe0', 0.35);
          audio.play('parry', { vol: 0.6 });
        } else this.fx.word('STUNNED', b.x, b.y - 16, '#8affe0');
        audio.play('mini_grab_stun', { pitch: b.kind === 'listener' ? 1.3 : 1, pan: this.pan(b.x) });
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

  /** Left or right in the stereo field, by where in the hold `x` is. */
  private pan(x: number) {
    return clamp((x / this.W) * 2 - 1, -0.8, 0.8);
  }

  /** Where a beast sounds from: panned, and quieter and duller the further off it is. */
  private place(b: Beast) {
    const d = Math.hypot(b.x - this.x, b.y - this.y);
    return { pan: this.pan(b.x), vol: clamp(1.15 - d / 260, 0.2, 1), dist: clamp(d / 380, 0, 0.8) };
  }

  private hears(b: Beast, d: number) {
    if (d < this.noise) return true;
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
    // its breath, which tells you where it is: slow asleep, quick when it's after you
    b.breath -= dt;
    if (b.breath <= 0 && b.mode !== 'stun' && b.mode !== 'lunge') {
      const hunting = b.mode === 'hunt' || b.mode === 'wind';
      b.breath = b.mode === 'sleep' ? 2.8 : hunting ? 1.15 : 1.8;
      audio.play('mini_grab_breath', { pitch: (b.kind === 'listener' ? 1.25 : 1) * (hunting ? 1.15 : b.mode === 'sleep' ? 0.85 : 1), ...this.place(b), vol: this.place(b).vol * (b.mode === 'sleep' ? 0.6 : 1) });
    }
    const heard = this.hears(b, d);
    const sp = (b.kind === 'listener' ? 0.85 : 1) * this.huntSp * (this.rage ? 1.15 : 1);
    switch (b.mode) {
      case 'sleep':
        if (b.t <= 0 || (heard && this.time > 1.5)) {
          b.mode = 'prowl';
          b.t = 0;
          this.teach('wake', 'IT WOKE. IT HEARS YOUR LINE: THE RING SHOWS HOW FAR');
          audio.play('mini_grab_wake', { pitch: b.kind === 'listener' ? 1.3 : 1, ...this.place(b) });
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
            audio.play('mini_grab_growl', { pitch: b.kind === 'listener' ? 1.3 : 1, ...this.place(b) });
            this.alertCd = 1.2;
          }
          this.fx.word('!', b.x, b.y - 16, '#ff3a5a', 2, { pop: true });
          break;
        }
        if (this.moveTo(b, b.tx, b.ty, this.prowlSp, dt) < 4 || b.t <= 0) {
          b.tx = (b.kind === 'listener' ? this.deep : 110) + this.r() * (this.W - 30 - (b.kind === 'listener' ? this.deep : 110));
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
        // the blind one loses you fast once you go quiet: freeze, or creep, and it's lost you
        if (b.lost > (b.kind === 'listener' ? 0.7 : 1.8)) {
          b.mode = 'prowl';
          b.t = 2;
          this.fx.word('?', b.x, b.y - 16, '#8a8098');
          break;
        }
        this.moveTo(b, b.tx, b.ty, sp, dt);
        if (heard && d < this.lungeR * (b.kind === 'listener' ? 0.8 : 1) && b.cd <= 0) {
          if (d < 140) this.teach('lunge', 'IT CROUCHES: DODGE THE LINE, OR FLASH IT NOW!');
          b.mode = 'wind';
          b.t = this.windT * (b.kind === 'listener' ? 1.3 : 1);
          b.dx = (this.x - b.x) / (d || 1);
          b.dy = (this.y - b.y) / (d || 1);
          // the crouch lasts as long as the wind-up, so the sound is the warning
          audio.play('mini_grab_crouch', { pitch: 0.55 / b.t, ...this.place(b), vol: 1 });
        }
        // (only the lunge hurts: it always crouches first, so you get a warning)
        break;
      case 'wind':
        // it draws back before it springs
        b.x -= b.dx * 10 * dt;
        b.y -= b.dy * 10 * dt;
        if (b.t <= 0) {
          b.mode = 'lunge';
          b.t = LUNGE_TIME;
          audio.play('mini_grab_lunge', { pitch: b.kind === 'listener' ? 1.2 : 1, ...this.place(b), vol: 1 });
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
            audio.play('mini_grab_snap', { pan: this.pan(b.x) });
          }
        }
        if (b.t <= 0) {
          b.mode = 'rest';
          // the blind one takes longer to gather itself
          b.t = byLevel(this.d, 0.9, 0.6) * (b.kind === 'listener' ? 2 : 1);
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
    // the listener keeps to the deep hold: it guards the gold, and won't follow you home
    b.x = clamp(b.x, b.kind === 'listener' ? this.deep : 14, this.W - 12);
    b.y = clamp(b.y, this.top + 8, this.top + this.H - 8);
  }

  /** It got you: knocked flying, dazed, and crates off the end of the line. */
  private mauled(b: Beast) {
    this.hits++;
    this.hurt = 1.5;
    this.daze = 0.25;
    const d = Math.hypot(this.x - b.x, this.y - b.y) || 1;
    this.vx = ((this.x - b.x) / d) * 200;
    this.vy = ((this.y - b.y) / d) * 200;
    let lost = 0;
    for (let k = 0; k < this.knock && this.line.length; k++, lost++) this.drop(this.line.pop()!);
    this.fx.stop(0.09);
    this.fx.shake(5, 0.35);
    this.fx.flash('#ff5a4a', 0.15);
    this.fx.ring(this.x, this.y, 30, '#ff5a4a', 0.3);
    this.fx.burst(this.x, this.y, 10, 110, ['#ff5a4a', '#ffffff', '#5a1a34']);
    this.juice.streaks(this.x, this.y, 16, 220, ['#ffffff', '#ff5a4a', '#ffd04a'], { dir: Math.atan2(this.vy, this.vx), spread: 2.2, life: 0.4 });
    this.juice.smoke(this.x, this.y, 5, '#3a2e42', { size: 3 });
    this.fx.word(lost ? `LOST ${lost}!` : 'OUCH!', this.x, this.y - 14, '#ff5a4a', 1, { pop: true });
    audio.play('mini_grab_maul', { pan: this.pan(this.x) });
    b.mode = 'rest';
    b.t = 1;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    if (this.t0 < 0) this.t0 = t;
    const intro = this.time > 0 || this.result !== null ? 1 : clamp((t - this.t0) / 1.5, 0, 1);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    ctx.fillStyle = '#120e16';
    ctx.fillRect(-8, -8, w + 16, h + 16);
    // the hold that doesn't move (deck, junk, stacks, the north wall), drawn once
    const bg = this.backdrop(w, h);
    if (bg) ctx.drawImage(bg, 0, 0);
    else {
      for (let i = 0; i < this.stacks.length; i++) this.stack(ctx, this.stacks[i], i);
    }
    // stripes on the deck by the hatch: the bay
    for (let y = this.hatchY - 24; y < this.hatchY + 24; y += 6) {
      ctx.fillStyle = this.inBay() && this.line.length ? '#6a5a1a' : '#3a3018';
      ctx.fillRect(10, y, 28, 3);
    }
    for (const bx of this.beacons) drawSprite(ctx, 'grab', 'beacon', bx, this.top - 1, { clip: 'spin', t: t + bx });
    // the line, then the crates
    if (this.line.length) {
      ctx.strokeStyle = 'rgba(200,188,216,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (const c of this.line) ctx.lineTo(c.x, c.y);
      ctx.stroke();
    }
    for (const c of this.crates) if (c.state !== 'bank' || c.x > 8) this.crate(ctx, c, t);
    this.juice.draw(ctx, 'back');
    for (const b of this.beasts) this.beast(ctx, b, t);
    // your drone (in the countdown it flies in through the hatch)
    const dx = Math.round(this.x - (1 - intro) ** 2 * 40);
    const dy = Math.round(this.y);
    if (!(this.out && this.x < -8) && !this.sealed) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(dx + 3, dy + 5, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const struck = this.hurt > 1.3 ? 1 : 0;
      if (!(this.hurt > 0 && this.hurt <= 1.3 && Math.floor(t * 20) % 2))
        drawFlashed(ctx, 'grab', 'drone', dx, dy, { angle: this.face, clip: 'spin', t }, '#ffffff', struck) || this.oldDrone(ctx, dx, dy, t);
    }
    fx.drawSparks(ctx);
    this.juice.draw(ctx, 'front');

    this.lights(ctx, w, h, t, dx, intro);

    // things you see in the dark: crate glints, the beasts' eyes, the beacons, the hatch
    for (const c of this.crates) {
      if (c.state !== 'free') continue;
      // a steady dim mark, so you never lose track of one, and a glint now and then
      ctx.fillStyle = c.gold ? 'rgba(255,208,74,0.55)' : 'rgba(200,138,58,0.45)';
      ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y) - 1, 2, 2);
      if (Math.sin(t * (c.gold ? 5 : 3) + c.x * 0.1) > (c.gold ? 0.3 : 0.6)) {
        ctx.fillStyle = c.gold ? '#fff4c0' : '#ffd04a';
        ctx.fillRect(Math.round(c.x) - 5, Math.round(c.y) - 5, 1, 1);
        glow(ctx, c.x - 4, c.y - 4, c.gold ? 9 : 5, '#ffd04a', c.gold ? 0.8 : 0.6);
      }
    }
    for (const bx of this.beacons) {
      // the red lamp going round, and its beam sweeping the deck below it
      const a = t * Math.PI * 4 + bx;
      const on = Math.cos(a);
      glow(ctx, bx, this.top - 2, 8, '#ff3a3a', 0.35 + Math.max(0, on) * 0.5);
      if (on > 0) glow(ctx, bx + Math.sin(a) * 26, this.top + 14 + on * 10, 26, '#ff3a3a', on * 0.12);
    }
    for (const b of this.beasts) this.tells(ctx, b, t);
    // the ring your noise carries to: red when something is inside it
    if (this.result === null) {
      const heard = this.beasts.some((b) => b.mode !== 'sleep' && b.mode !== 'stun' && this.hears(b, Math.hypot(b.x - this.x, b.y - this.y)));
      ctx.save();
      ctx.strokeStyle = heard ? '#ff5a5a' : '#8affe0';
      ctx.globalAlpha = (heard ? 0.3 + Math.sin(t * 12) * 0.1 : 0.14) * intro;
      ctx.setLineDash([2, 4]);
      ctx.lineDashOffset = -t * 12;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.ring, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (this.line.length) {
        const label = `+${this.lineValue}`;
        ctx.fillStyle = 'rgba(10,7,16,0.7)';
        ctx.fillRect(dx - label.length * 3 - 2, dy - 18, label.length * 6 + 3, 10);
        drawText(ctx, label, dx, dy - 17, '#e8aa5a', { align: 'center' });
      }
    }
    this.hatch(ctx, t);
    fx.drawWords(ctx);
    ctx.restore();
    timer(ctx, w, this.limit - this.time, this.limit, t);
    this.prompt(ctx, w, t);
    this.footer(ctx, w, h, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The still parts of the hold, painted once the atlas is in: deck plates, junk, the stacks
   *  (dimmed a touch, so the crates you're after stand out), and the north wall. */
  private backdrop(w: number, h: number) {
    if (this.bg) return this.bg;
    if (!spriteReady('grab')) return null;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#120e16';
    ctx.fillRect(0, 0, w, h);
    // deck plates, scuffed, with a drain grate here and there
    const bot = this.top + this.H;
    for (let y = this.top; y < bot; y += 16)
      for (let x = 8; x < this.W - 8; x += 16) {
        const n = ((x * 7 + y * 13) ^ (x * y)) % 11;
        ctx.fillStyle = (x / 16 + y / 16) % 2 < 1 ? '#262030' : '#221c2a';
        ctx.fillRect(x, y, 15, 15);
        ctx.fillStyle = '#2e2838';
        ctx.fillRect(x, y, 15, 1);
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(x, y + 15, 16, 1);
        if (n === 3) {
          ctx.fillStyle = '#16121c';
          for (let k = 3; k < 13; k += 3) ctx.fillRect(x + 3, y + k, 9, 1);
        } else if (n === 7) {
          ctx.fillStyle = '#3a3242';
          ctx.fillRect(x + 2, y + 2, 1, 1);
          ctx.fillRect(x + 12, y + 2, 1, 1);
          ctx.fillRect(x + 2, y + 12, 1, 1);
          ctx.fillRect(x + 12, y + 12, 1, 1);
        }
      }
    for (const j of this.junk) drawSprite(ctx, 'grab', j.name, j.x, j.y, { anchor: 'center' });
    ctx.fillStyle = '#1a1420';
    ctx.fillRect(0, 0, this.W, this.top);
    for (let x = 8, k = 0; x < this.W; x += 32, k++) drawSprite(ctx, 'grab', `wall_${(k * 5 + (this.seed & 3)) % 3}`, x + 16, this.top, {});
    for (let i = 0; i < this.stacks.length; i++) this.stack(ctx, this.stacks[i], i);
    ctx.fillStyle = 'rgba(22,16,30,0.3)';
    for (const b of this.stacks) ctx.fillRect(Math.round(b.x), Math.round(b.y) - 5, Math.round(b.w), Math.round(b.h) + 5);
    this.bg = c;
    return c;
  }

  /** A stack of cargo: rows of containers and barrels, the widest that fits, back to front. */
  private stack(ctx: CanvasRenderingContext2D, b: Box, i: number) {
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    const bw = Math.round(b.w);
    const bh = Math.round(b.h);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 3, y + 4, bw, bh);
    ctx.fillStyle = '#2a2232';
    ctx.fillRect(x, y, bw, bh);
    const cw = [32, 28, 24, 20, 16].find((c) => c <= bw + 2) ?? 16;
    const rows = Math.max(1, Math.round((bh - 12) / 8) + 1);
    const cx = x + Math.round(bw / 2);
    let drawn = true;
    for (let k = rows - 1; k >= 0; k--) {
      const v = (i * 7 + k * 3 + (k % 2) * i) % 4;
      drawn = drawSprite(ctx, 'grab', `cargo_${cw}_${v}`, cx, y + bh - k * 8, { anchor: 'bottom' }) && drawn;
    }
    if (drawn) return;
    // plain shapes until the atlas loads
    ctx.fillStyle = '#3a3040';
    ctx.fillRect(x, y + bh - 5, bw, 5);
    ctx.fillStyle = '#5a4e5e';
    ctx.fillRect(x, y, bw, bh - 5);
  }

  private oldDrone(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 6, y - 6, 12, 11);
    ctx.fillStyle = this.hurt > 0 && Math.floor(t * 20) % 2 ? '#ff5a4a' : '#6ad0c8';
    ctx.fillRect(x - 5, y - 5, 10, 9);
    ctx.fillStyle = '#8affe0';
    ctx.fillRect(x - 5, y - 5, 10, 2);
  }

  private crate(ctx: CanvasRenderingContext2D, c: Crate, t: number) {
    if (c.loose < 0.9 && Math.floor(t * 12) % 2) return;
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 3, y - 1, 10, 8);
    // hooked ones swing a little on the line
    const sway = c.state === 'line' ? Math.round(Math.sin(t * 9 + c.x * 0.2)) : 0;
    if (drawSprite(ctx, 'grab', c.gold ? 'crate_gold' : 'crate', x + sway, y + 3, { anchor: 'bottom', clip: c.gold ? 'shine' : 'rest', t: t * 0.7 + c.x * 0.01 })) return;
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 6, y - 6, 12, 11);
    ctx.fillStyle = c.gold ? '#d8a82a' : '#c88a3a';
    ctx.fillRect(x - 5, y - 5, 10, 9);
  }

  /** The beast's body: its pose follows what it's doing; struck by the flash it whitens and reels. */
  /** Which clip and frame a beast's sprite shows for what it's doing. */
  private pose(b: Beast, t: number) {
    let clip = 'idle';
    let frame: number | undefined;
    let tt = t + b.x * 0.01;
    switch (b.mode) {
      case 'sleep':
        clip = 'sleep';
        break;
      case 'prowl':
        clip = 'prowl';
        break;
      case 'hunt':
        clip = 'prowl';
        tt = t * 1.7;
        break;
      case 'wind': {
        const total = this.windT * (b.kind === 'listener' ? 1.3 : 1);
        clip = 'crouch';
        frame = Math.min(2, Math.floor((1 - b.t / total) * 3));
        break;
      }
      case 'lunge':
        clip = 'lunge';
        tt = LUNGE_TIME - b.t;
        break;
      case 'stun':
        clip = b.hitT < 0.3 ? 'hurt' : 'stun';
        tt = b.hitT < 0.3 ? b.hitT : t;
        break;
      case 'rest':
        clip = 'idle';
        break;
    }
    return { clip, frame, tt };
  }

  private beast(ctx: CanvasRenderingContext2D, b: Beast, t: number) {
    const name = b.kind;
    const { clip, frame, tt } = this.pose(b, t);
    // a shadow under it, then the body
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(Math.round(b.x) + 3, Math.round(b.y) + 4, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    const white = b.mode === 'stun' && b.hitT < 0.12 ? 1 : 0;
    const shake = b.mode === 'wind' ? Math.round(Math.sin(t * 70) * 1) : 0;
    if (drawFlashed(ctx, 'grab', name, b.x + shake, b.y, { clip, t: tt, frame, angle: b.face }, '#ffffff', white)) return;
    // plain shapes until the atlas loads
    ctx.fillStyle = b.kind === 'listener' ? '#4a4458' : '#3a0e24';
    ctx.fillRect(Math.round(b.x) - 7, Math.round(b.y) - 6, 14, 12);
  }

  /** What gives a beast away in the dark: eyes, feelers, and the line of its lunge as it crouches. */
  private tells(ctx: CanvasRenderingContext2D, b: Beast, t: number) {
    const bx = Math.round(b.x);
    const by = Math.round(b.y);
    // a faint shape in the dark, so you can track it: a dim silhouette everywhere, catching a rim
    // of your lamp as it comes to the edge of the light
    if (!this.sealed && this.flash <= 0) {
      const d = Math.hypot(b.x - this.x, b.y - this.y);
      const rim = clamp(1 - Math.abs(d - this.lamp * 0.9) / (this.lamp * 0.6), 0, 1);
      const { clip, frame, tt } = this.pose(b, t);
      const fade = clamp((d - this.lamp * 0.45) / (this.lamp * 0.3), 0, 1);
      const tint = b.kind === 'listener' ? '#4a4462' : '#5a1e34';
      drawFlashed(ctx, 'grab', b.kind, b.x, b.y, { clip, frame, t: tt, angle: b.face, alpha: (0.2 + rim * 0.3) * fade }, tint, 1 - rim * 0.45);
    }
    const fc = Math.cos(b.face);
    const fs = Math.sin(b.face);
    // the head, a little ahead of the body's middle
    const reach = b.mode === 'lunge' ? 16 : b.mode === 'wind' ? 8 : 12;
    const hx = bx + fc * reach;
    const hy = by + fs * reach;
    if (b.mode === 'wind') {
      // where it will land: a dotted line and its end, blinking faster as it's about to go
      const f = 1 - b.t / (this.windT * (b.kind === 'listener' ? 1.3 : 1));
      const len = LUNGE_SPEED * LUNGE_TIME;
      const on = Math.floor(t * (8 + f * 20)) % 2 === 0;
      ctx.fillStyle = on ? '#ff3a5a' : '#8a1a2a';
      for (let s = 10; s < len; s += 5) ctx.fillRect(Math.round(bx + b.dx * s), Math.round(by + b.dy * s), 2, 2);
      glow(ctx, bx + b.dx * len, by + b.dy * len, 10, '#ff3a5a', 0.3 + f * 0.4);
      glow(ctx, bx, by, 24, '#ff3a5a', 0.2 + f * 0.4);
    }
    if (b.kind === 'listener') {
      // no eyes: pale feelers that twitch when it hears, and a maw that glows when it's after you
      if (b.mode === 'sleep') return;
      const hunting = b.mode === 'hunt' || b.mode === 'wind' || b.mode === 'lunge';
      ctx.fillStyle = b.mode === 'stun' ? '#5a4a5a' : hunting ? '#f4ecd8' : '#8a8098';
      for (const s of [-1, 1]) {
        const a = b.face + s * 0.5 + Math.sin(t * (hunting ? 20 : 4) + s) * 0.2;
        for (let k = 2; k < 10; k += 2) ctx.fillRect(Math.round(hx + Math.cos(a) * k), Math.round(hy + Math.sin(a) * k), 1, 1);
      }
      if (hunting) glow(ctx, hx, hy, 12, '#c8b0ff', 0.35);
    } else {
      const eye = b.mode === 'stun' || b.mode === 'sleep' ? '#3a2a3a' : b.mode === 'prowl' ? '#8a2a3a' : '#ff3a5a';
      ctx.fillStyle = eye;
      // two big eyes either side of the head's line, small ones between
      const px = -fs;
      const py = fc;
      for (const s of [-1, 1]) {
        const ex = Math.round(hx + px * s * 3);
        const ey = Math.round(hy + py * s * 3);
        if (b.mode === 'sleep') ctx.fillRect(ex - 1, ey, 2, 1);
        else ctx.fillRect(ex - 1, ey - 1, 2, 2);
      }
      if (b.mode !== 'sleep') ctx.fillRect(Math.round(hx + fc * 2), Math.round(hy + fs * 2), 1, 1);
      if (b.mode === 'hunt' || b.mode === 'lunge' || b.mode === 'wind') {
        glow(ctx, hx, hy, 10, '#ff3a5a', 0.5);
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        if (d < 60) glow(ctx, bx, by, 40, '#ff3a5a', 0.15 * (1 - d / 60));
      }
    }
    if (b.mode === 'sleep' && Math.floor(t * 1.5) % 2) drawText(ctx, 'Z', bx + 8, by - 16 - Math.round((t * 4) % 4), '#5a4e68');
    if (b.mode === 'stun') {
      for (let k = 0; k < 3; k++) {
        const a = t * 5 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = k % 2 ? '#8affe0' : '#ffffff';
        ctx.fillRect(Math.round(bx + Math.cos(a) * 9), Math.round(by - 14 + Math.sin(a) * 3), 2, 2);
      }
    }
  }

  /** The dark: a black sheet with holes for your lamp, the hatch's light and the flash. */
  private lights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, lx: number, intro: number) {
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
    // in the countdown the lamp stutters on as the drone comes in
    const on = intro >= 1 ? 1 : intro < 0.5 ? 0.35 : Math.floor(t * 18) % 3 ? 1 : 0.4;
    if (!this.sealed) {
      hole(lx, this.y, this.lamp * flicker * on);
      // the lamp throws its light ahead of the drone a little
      hole(lx + Math.cos(this.face) * this.lamp * 0.35, this.y + Math.sin(this.face) * this.lamp * 0.35, this.lamp * 0.6 * on, 0.6);
    }
    hole(16, this.hatchY, 30 + this.open * 1.2, 0.9);
    // the beacons light a little of the wall round them as they turn
    for (const bx of this.beacons) hole(bx, this.top + 2, 14 + Math.max(0, Math.cos(t * Math.PI * 4 + bx)) * 10, 0.35);
    ctx.drawImage(this.dark, 0, 0);
    // a cool wash where the lamp falls, a warm one at the door
    glow(ctx, lx, this.y, this.lamp * 0.6, '#8affe0', 0.08 * on);
    glow(ctx, 16, this.hatchY, 26 + this.open, '#ffd04a', 0.18);
  }

  /** The hatch: two heavy doors grinding shut, the light from outside between them, and the doorway. */
  private hatch(ctx: CanvasRenderingContext2D, t: number) {
    const hy = this.hatchY;
    const open = Math.round(this.open);
    // the bulkhead, tiled, with the gap for the doors
    for (let y = this.top; y < this.top + this.H; y += 16) {
      if (y + 16 > hy - 26 && y < hy + 26) continue;
      if (!drawSprite(ctx, 'grab', 'wall_w', 4, y + 8, {})) {
        ctx.fillStyle = '#3a3448';
        ctx.fillRect(0, y, 8, 16);
      }
    }
    // the gap: light from outside
    ctx.fillStyle = '#ffe8a0';
    ctx.fillRect(0, hy - open, 5, open * 2);
    glow(ctx, 2, hy, 8 + open, '#fff4c0', 0.4);
    const blink = this.limit - this.time < 8 ? 't' : 'f';
    for (const [name, y] of [['door_a', hy - open], ['door_b', hy + open]] as const) {
      if (!drawSprite(ctx, 'grab', name, 4, y, { clip: 'blink', t: blink === 't' ? t * 2 : 0 })) {
        const ey = name === 'door_a' ? y - 8 : y;
        for (let k = 0; k < 8; k += 2) {
          ctx.fillStyle = (k / 2) % 2 ? '#2a2236' : '#ffd04a';
          ctx.fillRect(0, ey + k, 8, 2);
        }
      }
    }
    // the doors grind: sparks off their edges in the last seconds
    const left = this.limit - this.time;
    if (left < 8 && left > 0 && this.result === null && this.fx.rand() < 0.3)
      for (const y of [hy - open, hy + open]) this.juice.streaks(8, y, 1, 90, ['#ffd04a', '#ff8a3a'], { dir: y < hy ? Math.PI * 0.25 : -Math.PI * 0.25, spread: 1, life: 0.3, grav: 0 });
    const urgent = left < 6;
    const pulse = urgent ? Math.floor(t * 8) % 2 : Math.floor(t * 2) % 2;
    glow(ctx, 6, hy, 20 + open, urgent ? '#ff5a4a' : '#ffd04a', pulse ? 0.5 : 0.25);
    if (this.result !== null) return;
    // the doorway: the box you must be in to leave, shrinking with the doors
    const lz = open + 8;
    const inside = this.atHatch();
    if (inside || urgent) {
      ctx.strokeStyle = inside ? (Math.floor(t * 4) % 2 ? '#8affb0' : '#3a8a5a') : pulse ? '#ff5a4a' : '#8a2a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(9.5, Math.round(hy - lz) + 0.5, 30, Math.round(lz * 2));
    }
    if (urgent && !inside && Math.floor(t * 4) % 2) drawText(ctx, '←', 44, hy - 3, '#ff5a4a');
  }

  /** The current prompt, on a dark band under the timer: it blinks in, then fades. */
  private prompt(ctx: CanvasRenderingContext2D, w: number, t: number) {
    const tp = this.tip;
    if (tp.t <= 0 || this.result !== null) return;
    if (tp.t > 2.35 && Math.floor(t * 16) % 2) return;
    const tw = tp.text.length * 6 + 12;
    ctx.globalAlpha = Math.min(1, tp.t * 3);
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 16, tw, 12);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 16, 2, 12);
    drawText(ctx, tp.text, w / 2, 18, '#f4ecd8', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  private footer(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fy = h - 15;
    ctx.fillStyle = 'rgba(10,7,16,0.9)';
    ctx.fillRect(0, fy - 5, w, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, fy - 5, w, 1);
    const urgent = this.limit - this.time < 6 && this.result === null;
    // the hatch, and how much is banked
    panel(ctx, 4, fy - 3, 82, 13, urgent ? '#ff5a4a' : '#ffd04a');
    drawText(ctx, '← HATCH', 9, fy, urgent && Math.floor(t * 6) % 2 ? '#ff5a4a' : '#ffd04a');
    drawText(ctx, `${this.banked}/${this.total}`, 82, fy, '#f4ecd8', { align: 'right' });
    // the haul: a box per crate, gold ones bigger; banked ones solid, ones on the line outlined
    const order = [...this.crates].sort((a, b) => Number(a.gold) - Number(b.gold));
    const widths = order.map((c) => (c.gold ? 11 : 7));
    const total = widths.reduce((s, x) => s + x + 2, 0) - 2;
    let bx = Math.round(w / 2 - total / 2) - 10;
    panel(ctx, bx - 6, fy - 3, total + 12, 13, '#e8aa5a');
    order.forEach((c, k) => {
      const cw = widths[k];
      const col = c.gold ? '#ffd04a' : '#c88a3a';
      if (c.state === 'bank') {
        ctx.fillStyle = col;
        ctx.fillRect(bx, fy, cw, 7);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(bx, fy, cw, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(bx, fy + 6, cw, 1);
      } else {
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(bx, fy, cw, 7);
        if (c.state === 'line') {
          ctx.strokeStyle = Math.floor(t * 4) % 2 ? col : '#f4ecd8';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, fy + 0.5, cw - 1, 6);
        }
      }
      bx += cw + 2;
    });
    // the flash: charging, then ready (and glowing)
    const ready = this.flashCd <= 0;
    panel(ctx, w - 108, fy - 3, 104, 13, ready ? '#8affe0' : '#4a6a7a');
    drawText(ctx, 'FLASH', w - 102, fy, ready ? '#8affe0' : '#8a8098');
    meter(ctx, w - 66, fy + 2, 56, 3, 1 - Math.max(0, this.flashCd) / this.flashMax, ready ? '#8affe0' : '#4a6a7a');
    if (ready && this.result === null) glow(ctx, w - 38, fy + 3, 16, '#8affe0', 0.2 + Math.sin(t * 6) * 0.1);
    if (this.atHatch() && this.result === null && Math.floor(t * 3) % 2) {
      const msg = 'PRESS TO LEAVE';
      ctx.fillStyle = 'rgba(10,7,16,0.85)';
      ctx.fillRect(Math.round(w / 2 - msg.length * 3 - 6), fy - 20, msg.length * 6 + 12, 12);
      drawText(ctx, msg, w / 2, fy - 18, '#8affb0', { align: 'center' });
    }
  }
}
