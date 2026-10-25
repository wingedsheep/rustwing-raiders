import { audio } from '../../audio';
import type { Setup } from '../../sim/events';
import { drawText } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { clamp, rng, TAU } from '../../util';
import { byLevel, Fx, glow, hardness, meter, nebula, sideShip, stars, vignette, type Minigame, type Pad } from './common';
import { drawFlashed, Juice, panel } from './thread-art';
import { penta } from './thread-sound';
import { cablePoint, Field, place, type Mine, type Piece, type Strand, type Sweeper } from './thread-field';
import { drawSprite } from './sprites';

/** Something in the scenery: a sprite at a spot in a parallax layer. */
interface Deco {
  x: number;
  y: number;
  name: string;
  clip: string;
  rate: number;
  phase: number;
  alpha: number;
}

interface Blast {
  x: number;
  y: number;
  r: number;
  t: number;
}

type Act = 'in' | 'heart' | 'out';

/** The hull, as a capsule: half its length, and its radius. */
const HULL = 15;
const HULL_R = 3;
/** A mine's radius. */
const MINE_R = 5;
/** Pass this close (hull to mine centre) for a skim, this close for a close one. */
const SKIM = 17;
const CLOSE = 12;
const CHAIN_T = 1.7;
/** The fairy lights strung along the cables. */
const FAIRY = ['#ffd04a', '#ff9a5a', '#ffe8a0', '#ff7a6a'];
const DASH_T = 0.2;
/** A hunter's warning: how long it shakes in the rock before it comes. */
const LOOSE = 0.55;

/**
 * Thread it: an old Cartel mine field, side-on, and a cache at its heart. The stick flies you
 * anywhere in the view; tap the button to burn, a short dash the way you're pushing (two or
 * three in the tank, filling back up). The field scrolls on at its own pace.
 *
 * Three acts. THE WAY IN: set pieces one after another. Scattered mines and curtains with a gap,
 * columns on chains, strings of mines hung from the walls that sway, tripwires right across the
 * lane (touch the line and it goes up from there, mine by mine, so trip it near an end and follow
 * the fire through), magnets that drift in as you come, fuse mines that arm when you're close and
 * blow a moment later (every blast sets off what's near it), spinning rings, sweeping girders,
 * and the last finder's wreck with their salvage spilled round it. The walls close in to a throat.
 * THE HEART: the view stops in a round chamber. The cache sits behind rings of mines turning
 * opposite ways; thread their gaps, take it, and the field wakes. GET OUT: it starts going up
 * behind you, a wall of fire rolling in from the left that keeps the view moving faster than you'd
 * like; the rings at the heart spin up, and hunter mines come loose from the walls and come for
 * you. They blow on whatever they touch, so lead them into other mines (LURED!). Wait too long at
 * the heart and the field wakes anyway, without you having the cache.
 *
 * Pass mines close to skim them: skims chain, every fourth in a row raising the multiplier to ×4.
 * The score is making it out, the cache, the salvage you picked up, and style; each hit takes a
 * bite. Three hits and you're wrecked (four on EASY and TRICKY). Higher levels: a faster field,
 * tighter gaps, a narrower throat, more rings round the cache that turn faster, magnets from TRICKY,
 * tripwires from TRICKY, fuse mines from HARD, girders from VICIOUS, more hunters, and a faster fire.
 */
export class Thread implements Minigame {
  readonly title = 'THREAD IT';
  readonly how = 'FLY ANYWHERE. TAP TO BURN (A DASH). THREAD IN TO THE CACHE AT THE HEART, TAKE IT, THEN OUTRUN THE FIRE. SKIM MINES FOR STYLE, GRAB SALVAGE.';
  result: number | null = null;
  private f: Field;
  private act: Act = 'in';
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;
  private cam = 0;
  private time = 0;
  private hits = 0;
  private hurt = 0;
  private scrapeCd = 0;
  // the burn
  private charges: number;
  private readonly maxCharges: number;
  private recharge = 0;
  private dashT = 0;
  private dashX = 0;
  private dashY = 0;
  private ghosts: { x: number; y: number; t: number }[] = [];
  // the heart and the way out
  private heartT: number;
  private readonly heartLimit: number;
  private cache = false;
  /** How fast the view is moving on, this frame: you ride along with it. */
  private camV = 0;
  private front = -999;
  private outT = 0;
  // style and salvage
  private skims = 0;
  private chain = 0;
  private chainT = 0;
  private bestChain = 0;
  private points = 0;
  private lures = 0;
  private readonly target: number;
  private salvage = 0;
  private readonly bitsTotal: number;
  private blasts: Blast[] = [];
  // sound
  private boomCd = 0;
  private armCd = 0;
  private pingT = 0;
  private tickT = 0;
  private rumbleT = 0;
  // the end
  private done = false;
  private wrecked = false;
  private exitX = 0;
  private wreckT = 0;
  // prompts and the act banners
  private tip = { text: '', t: 0 };
  private told = new Set<string>();
  private banner = { text: '', sub: '', color: '#ffd04a', t: 9 };
  private readonly w = 480;
  private readonly fieldH: number;
  private fx = new Fx();
  private juice = new Juice('thread', ['scrap_0', 'scrap_1', 'scrap_2']);
  private far: Deco[] = [];
  private mid: Deco[] = [];
  private near: Deco[] = [];
  private t0 = -1;
  private shownStyle = 0;
  // by level
  private readonly paceIn: number;
  private readonly paceOut: number;
  private readonly fuseT: number;
  private readonly armR: number;
  private readonly pullMax: number;
  private readonly pullSp: number;
  private readonly hunterV: number;
  private readonly lives: number;
  private readonly hitCost: number;

  /** What waits at the heart: the cache, unless the event says otherwise. */
  private readonly prize: NonNullable<Setup['heart']>;

  constructor(
    level: number,
    private seed: number,
    setup: Setup = {},
    h = 240,
  ) {
    this.prize = setup.heart ?? { label: 'THE CACHE', goal: 'THREAD THE RINGS AND TAKE THE CACHE', got: 'THE CACHE!', carry: true };
    const r = rng(seed ^ 0x7e1d);
    const d = hardness(level);
    this.fieldH = h - 20;
    this.f = new Field(level, seed, this.fieldH, this.w);
    this.y = this.fieldH / 2;
    this.x = 90;
    this.paceIn = byLevel(d, 78, 108);
    this.paceOut = byLevel(d, 96, 138);
    this.fuseT = byLevel(d, 0.62, 0.42);
    this.armR = byLevel(d, 40, 50);
    this.pullMax = byLevel(d, 10, 20);
    this.pullSp = byLevel(d, 26, 44);
    this.hunterV = byLevel(d, 64, 100);
    this.lives = level <= 2 ? 4 : 3;
    this.hitCost = byLevel(d, 0.08, 0.12);
    this.maxCharges = level <= 2 ? 3 : 2;
    this.charges = this.maxCharges;
    this.heartLimit = byLevel(d, 15, 10);
    this.heartT = this.heartLimit;
    this.bitsTotal = this.f.bits.length;
    this.target = Math.max(30, Math.round(this.f.mines.length * byLevel(d, 0.55, 0.8)));
    this.say('THE WAY IN', `${this.prize.label} IS AT THE HEART OF THE FIELD`, '#8affe0');

    // the scenery: big mines hung on chains far off, rocks between, dark rocks near
    const deco = (name: string, x: number, y: number, clip: string, alpha = 1, rate = 1): Deco => ({ x, y, name, clip, rate, phase: r() * 4, alpha });
    const span = 640;
    this.far.push(deco('chained', r() * span, 30 + r() * 20, 'blink', 0.4), deco('chained', r() * span, 20 + r() * 40, 'blink', 0.32));
    for (let k = 0; k < 9; k++) this.far.push(deco(`rock_far_${k % 2}`, r() * span, 10 + r() * (this.fieldH - 10), 'tumble', 0.45, 0.15 + r() * 0.2));
    for (let k = 0; k < 5; k++) this.mid.push(deco(`rock_${k % 3}`, r() * span, 14 + r() * (this.fieldH - 20), 'tumble', 0.55, 0.2 + r() * 0.3));
    for (let k = 0; k < 3; k++) {
      const topSide = k % 2 === 0;
      this.near.push(deco(k === 2 ? 'rock_fg_1' : 'rock_fg', k * 220 + r() * 100, topSide ? -6 - r() * 6 : this.fieldH + 6 + r() * 6, 'tumble', 1, 0.12 + r() * 0.1));
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Score
  // ----------------------------------------------------------------------------------------------

  private get mult() {
    return 1 + Math.min(3, Math.floor(this.chain / 4));
  }

  private get style() {
    return Math.min(1, this.points / this.target);
  }

  private get haul() {
    return this.bitsTotal ? this.salvage / this.bitsTotal : 0;
  }

  private get progress() {
    return clamp(this.x / this.f.exitX, 0, 1);
  }

  private score() {
    if (this.wrecked) return Math.min(0.2, this.progress * 0.25);
    const s = (this.done ? 0.4 : this.progress * 0.3) + (this.cache && this.done ? 0.3 : 0) + this.haul * 0.15 + this.style * 0.15;
    return clamp(s - this.hits * this.hitCost, 0, 1);
  }

  status() {
    const where = this.act === 'in' ? `IN ${Math.round(clamp(this.x / this.f.heartX, 0, 1) * 100)}%` : this.act === 'heart' ? 'THE HEART' : `OUT ${Math.round(clamp((this.x - this.f.heartX) / (this.f.exitX - this.f.heartX), 0, 1) * 100)}%`;
    return `${where}  ${'♥'.repeat(Math.max(0, this.lives - this.hits))}  SALVAGE ${this.salvage}/${this.bitsTotal}  STYLE ${Math.round(this.style * 100)}%${this.chain >= 4 ? `  ×${this.mult}` : ''}`;
  }

  breakdown(): [string, string][] {
    return [
      ['THROUGH', this.done ? 'ALL THE WAY' : `${Math.round(this.progress * 100)}%`],
      [this.prize.label, this.cache ? (!this.prize.carry ? 'REACHED' : this.done ? 'OUT WITH IT' : 'LOST WITH YOU') : 'NOT REACHED'],
      ['SALVAGE', `${this.salvage}/${this.bitsTotal}`],
      ['SKIMS', `${this.skims}${this.lures ? `  LURED ${this.lures}` : ''}`],
      ['BEST CHAIN', `${this.bestChain}`],
      ['HITS', `${this.hits}`],
    ];
  }

  // ----------------------------------------------------------------------------------------------
  // Flying
  // ----------------------------------------------------------------------------------------------

  /** Show a prompt once, the first time it matters. */
  private teach(key: string, text: string) {
    if (this.told.has(key) || this.result !== null) return;
    this.told.add(key);
    this.tip = { text, t: 2.6 };
  }

  private say(text: string, sub: string, color: string) {
    this.banner = { text, sub, color, t: 0 };
  }

  /** Screen position of a point in the field. */
  private scr(x: number, y: number): [number, number] {
    return [x - this.cam, y];
  }

  /** Distance from (px, py) to the hull. */
  private hullDist(px: number, py: number) {
    const dx = clamp(px - this.x, -HULL, HULL);
    return Math.hypot(px - this.x - dx, py - this.y);
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    this.juice.update(dt);
    this.shownStyle += (this.style - this.shownStyle) * Math.min(1, dt * 8);
    this.banner.t += dt;
    this.tip.t -= dt;
    for (const b of this.blasts) b.t += dt;
    this.blasts = this.blasts.filter((b) => b.t < 0.7);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.25);
    if (this.wrecked) this.wreckT += dt;
    if (this.result !== null) {
      audio.loop('engine', 'thread', false);
      if (this.done) {
        this.exitX += dt * (120 + this.exitX * 6);
        if (this.fx.rand() < 0.8) this.juice.streaks(this.x - this.cam + this.exitX - 16, this.y, 1, 160, ['#ffd04a', '#ff8a3a'], { dir: Math.PI, spread: 0.3, life: 0.3 });
      }
      if (this.wrecked && this.wreckT < 1.2 && this.fx.rand() < 0.6) this.juice.smoke(this.x - this.cam - this.wreckT * 40, this.y + this.wreckT ** 2 * 60, 1, '#2a2232', { size: 3, life: 1, vx: -40 });
      // the fire rolls on over the field after you
      if (this.act === 'out') this.burnField(dt);
      this.tickMines(dt, false);
      return;
    }
    this.time += dt;
    this.hurt -= dt;
    this.scrapeCd -= dt;
    this.boomCd -= dt;
    this.armCd -= dt;
    this.chainT -= dt;
    if (this.chainT <= 0 && this.chain) {
      if (this.chain >= 4) audio.play('mini_thread_lost', { vol: 0.5 });
      this.chain = 0;
    }

    this.moveView(dt);
    this.fly(dt, pad);
    this.tickMines(dt, true);
    if (this.result !== null) return;
    this.tickStrands(dt);
    this.tickSweepers();
    if (this.result !== null) return;
    this.pickUp();
    this.lessons();
    if (this.act === 'out') {
      this.burnField(dt);
      // the fire licks at your tail
      if (this.x - HULL < this.front + 8 && this.hurt <= 0) {
        this.hit(0, 'FIRE!');
        this.vx = 260;
      }
    }
    if (this.result !== null) return;
    if (this.x >= this.f.exitX) this.finish();
    this.sonar(dt);
    audio.loop('engine', 'thread', this.result === null, this.dashT > 0 ? 1 : 0.45 + Math.min(0.4, Math.hypot(this.vx, this.vy) / 300));
  }

  /** The view: on at the field's pace on the way in, held at the heart, chased by the fire out. */
  private moveView(dt: number) {
    const f = this.f;
    const heartCam = f.heartX - this.w / 2;
    const cam0 = this.cam;
    if (this.act === 'in') {
      const ease = clamp((heartCam - this.cam) / 160, 0.2, 1);
      this.cam = Math.min(heartCam, this.cam + this.paceIn * ease * dt);
      if (this.cam >= heartCam - 0.5) {
        this.act = 'heart';
        this.say('THE HEART', this.prize.goal, '#ffd04a');
        audio.play('mini_thread_mult', { pitch: 0.75 });
      }
    } else if (this.act === 'heart') {
      const before = this.heartT;
      this.heartT -= dt;
      if (this.heartT < 4 && Math.ceil(this.heartT) !== Math.ceil(before)) audio.play('mini_thread_tick', { pitch: 0.7, vol: 1 });
      if (this.heartT <= 0) this.wake();
    } else {
      this.outT += dt;
      const v = this.paceOut * clamp(this.outT / 1.6, 0.15, 1) * (1 + this.progressOut() * 0.15);
      this.front += v * dt;
      this.cam = Math.max(this.cam, this.front - 10);
    }
    this.camV = dt > 0 ? (this.cam - cam0) / dt : 0;
  }

  private progressOut() {
    return clamp((this.x - this.f.outX) / (this.f.exitX - this.f.outX), 0, 1);
  }

  /** The cache taken, or the time up: the field wakes, and starts going up from behind you. */
  private wake() {
    this.act = 'out';
    this.front = this.cam - 30;
    this.outT = 0;
    this.say('THE FIELD WAKES!', this.cache ? 'GET OUT!' : 'TOO SLOW. GET OUT!', '#ff5a4a');
    audio.play('mini_thread_alarm');
    this.fx.flash('#ff5a4a', 0.2);
    this.fx.shake(4, 0.5);
    // the rings at the heart spin up
    for (const g of this.f.rings) if (g.heart) g.rate *= 1.15;
    // every lamp in the field goes red: the magnets reach further
    this.teach('out', 'THE FIELD IS GOING UP BEHIND YOU: RUN!');
  }

  private fly(dt: number, pad: Pad) {
    // the burn: a dash the way you push, or straight on
    if (this.recharge > 0 || this.charges < this.maxCharges) {
      this.recharge -= dt;
      if (this.recharge <= 0 && this.charges < this.maxCharges) {
        this.charges++;
        this.recharge = this.charges < this.maxCharges ? 1.5 : 0;
      }
    }
    if (pad.press) {
      if (this.charges > 0) this.dash(pad);
      else audio.play('ui_move', { pitch: 0.6, vol: 0.5 });
    }
    const heavy = this.cache && this.prize.carry ? 0.82 : 1;
    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = this.dashT / DASH_T;
      this.vx = this.dashX * (180 + 200 * k);
      this.vy = this.dashY * (180 + 200 * k);
      this.ghosts.push({ x: this.x - this.cam, y: this.y, t: 0 });
      this.juice.streaks(this.x - this.cam - 14, this.y, 1, 120, ['#ffd04a', '#ffffff'], { dir: Math.atan2(-this.dashY, -this.dashX), spread: 0.4, life: 0.25 });
    } else {
      const acc = 1050 * heavy;
      this.vx += (pad.x * acc - this.vx * 7.5) * dt;
      this.vy += (pad.y * acc - this.vy * 7.5) * dt;
    }
    // the view's own drift carries you
    this.x += (this.vx + this.camV) * dt;
    this.y += this.vy * dt;
    // the view's edges
    const lo = this.cam + 22;
    const hi = this.cam + this.w - (this.act === 'heart' ? 24 : 44);
    if (this.x < lo) {
      this.x = lo;
      this.vx = Math.max(0, this.vx);
    }
    if (this.x > hi) {
      this.x = hi;
      this.vx = Math.min(0, this.vx);
    }
    // the walls: you scrape off them
    let push = 0;
    for (const o of [-HULL + 2, 0, HULL - 2]) {
      const c = this.f.ceil(this.x + o) + 5;
      const fl = this.fieldH - this.f.floor(this.x + o) - 5;
      if (this.y < c) push = Math.max(push, c - this.y);
      if (this.y > fl) push = Math.min(push, fl - this.y);
    }
    if (this.y < 6) push = Math.max(push, 6 - this.y);
    if (this.y > this.fieldH - 6) push = Math.min(push, this.fieldH - 6 - this.y);
    if (push) {
      this.y += push;
      this.vy = Math.sign(push) * Math.max(40, Math.abs(this.vy) * 0.4);
      this.scrape(push > 0 ? -1 : 1);
    }
    // the engine's trail, and the cache's glow once you have it
    const sx = this.x - this.cam;
    if (this.fx.rand() < 0.7) this.fx.spark(sx - 16, this.y + (this.fx.rand() - 0.5) * 2, -110 - this.fx.rand() * 40, (this.fx.rand() - 0.5) * 12, 0.22, this.dashT > 0 ? '#ffd04a' : '#ff8a3a', { drag: 3 });
    if (this.chain >= 8 && this.fx.rand() < 0.4) this.fx.spark(sx - 8, this.y + (this.fx.rand() - 0.5) * 8, -120, 0, 0.3, '#8affe0', { drag: 2 });
    if (this.hits && this.fx.rand() < this.hits * 0.16) this.juice.smoke(sx - 10, this.y, 1, '#3a3042', { size: 2, life: 0.7, vx: -30 });
    this.juice.scroll(-this.camV * dt);
  }

  private dash(pad: Pad) {
    const l = Math.hypot(pad.x, pad.y);
    this.dashX = l > 0.3 ? pad.x / l : 1;
    this.dashY = l > 0.3 ? pad.y / l : 0;
    this.dashT = DASH_T;
    this.charges--;
    if (this.recharge <= 0) this.recharge = 1.5;
    audio.play('mini_thread_burn', { vol: 0.8, pitch: 1.2 });
    const sx = this.x - this.cam;
    this.juice.streaks(sx - 14, this.y, 10, 200, ['#ffd04a', '#ff8a3a', '#ffffff'], { dir: Math.atan2(-this.dashY, -this.dashX), spread: 0.8, life: 0.35 });
    this.fx.ring(sx - 14, this.y, 14, '#ffd04a', 0.2);
  }

  private scrape(dir: number) {
    if (this.chain >= 4) this.fx.word('CHAIN LOST', this.x - this.cam + 24, this.y + 22, '#ff8a7a');
    this.chain = 0;
    if (this.scrapeCd > 0) return;
    this.scrapeCd = 0.25;
    const sx = this.x - this.cam;
    this.juice.streaks(sx, this.y - dir * 5, 8, 120, ['#ffd04a', '#ff8a3a', '#9a8aa0'], { dir: dir > 0 ? Math.PI * 0.5 + Math.PI : Math.PI * 0.5, spread: 1.6, life: 0.3 });
    this.fx.shake(2, 0.12);
    audio.play('mini_thread_scrape');
  }

  /** The prompts for each set piece, as it comes into view. */
  private lessons() {
    if (this.time > 0.4) this.teach('move', 'THE STICK FLIES YOU ANYWHERE. TAP THE BUTTON TO BURN: A DASH');
    if (this.time > 3.6) this.teach('skim', 'PASS MINES CLOSE TO SKIM THEM: CHAIN SKIMS FOR STYLE');
    const tips: Partial<Record<Piece, string>> = {
      tripwire: 'A TRIPWIRE: TOUCH THE LINE AND IT GOES UP. TRIP IT AT AN END',
      magnets: 'BLUE MINES DRIFT IN AS YOU COME: KEEP TO THE MIDDLE',
      fuses: 'ORANGE MINES BLOW WHEN YOU COME NEAR: BURN PAST, AND THEY TAKE THE REST',
      spinner: 'A RING: SLIP THROUGH ITS GAP FOR THE SALVAGE INSIDE, OR GO ROUND',
      girder: 'A GIRDER: GO THROUGH THE HALF IT ISN\'T IN',
      wreck: 'THE LAST ONE WHO TRIED. THEIR SALVAGE IS STILL HERE',
    };
    for (const p of this.f.pieces) {
      const dx = p.x - this.cam;
      if (dx < this.w - 30 && dx > 60 && tips[p.kind]) this.teach(p.kind, tips[p.kind]!);
    }
    if (this.act === 'out' && this.f.mines.some((m) => m.kind === 'seeker' && m.hunt >= 0 && !m.dead)) this.teach('seeker', 'HUNTERS! THEY BLOW ON ANYTHING: LEAD THEM INTO OTHER MINES');
  }

  // ----------------------------------------------------------------------------------------------
  // The mines
  // ----------------------------------------------------------------------------------------------

  private tickMines(dt: number, live: boolean) {
    const t = this.time;
    const view0 = this.cam - 60;
    const view1 = this.cam + this.w + 60;
    for (const m of this.f.mines) {
      if (m.dead) continue;
      if (m.fuse >= 0) {
        m.fuse -= dt;
        if (m.fuse <= 0) {
          place(m, t);
          this.blow(m);
          continue;
        }
      }
      if ((m.x < view0 || m.x > view1) && m.hunt < 0 && !m.ring) continue;
      place(m, t);
      if (!live) continue;
      const dx = m.cx - this.x;
      const dy = m.cy - this.y;
      // magnets drift towards you as you come, harder once the field's awake
      if (m.kind === 'magnet') {
        const reach = this.act === 'out' ? 110 : 90;
        if (Math.abs(dx) < reach && Math.abs(dy) < reach) {
          const lim = this.pullMax * (this.act === 'out' ? 1.4 : 1);
          const s = this.pullSp * dt;
          m.ox += clamp(clamp(this.x - m.x, -lim, lim) - m.ox, -s, s);
          m.oy += clamp(clamp(this.y - m.y, -lim, lim) - m.oy, -s, s);
          if (m.near > 50 && Math.hypot(dx, dy) < 70 && this.armCd <= 0) {
            audio.play('mini_thread_magnet', { vol: 0.6 });
            this.armCd = 0.3;
          }
        }
      }
      // hunters: asleep in the walls until you're past the fire's reach of them, then they come
      if (m.kind === 'seeker') this.hunt(m, dt);
      if (m.dead) continue;
      // fuse mines arm when you're near
      if (m.kind === 'fuse' && m.fuse < 0 && Math.hypot(dx, dy) < this.armR) this.arm(m, this.fuseT);
      if (Math.abs(dx) > 50 || Math.abs(dy) > 40) {
        m.near = 99;
        continue;
      }
      const dd = this.hullDist(m.cx, m.cy);
      if (dd < HULL_R + MINE_R - 1 && this.hurt <= 0) {
        this.blow(m, true);
        this.hit(dy > 0 ? -1 : 1);
        if (this.result !== null) return;
        continue;
      }
      if (this.hurt > 0) continue;
      if (dd < m.near) m.near = dd;
      if (!m.skimmed && m.near < SKIM && dd > SKIM + 5) {
        m.skimmed = true;
        const close = m.near < CLOSE;
        this.skim(close ? 2 : 1, dy, close ? 'CLOSE!' : 'SKIM');
      }
    }
  }

  /** A hunter: wakes as you come, flies at you with a lag, and blows on whatever it touches. */
  private hunt(m: Mine, dt: number) {
    if (m.hunt < 0) {
      if (this.act !== 'out' || m.x - this.x > 200 || m.x - this.x < -40) return;
      m.hunt = 0;
      m.vx = 0;
      m.vy = m.y < this.fieldH / 2 ? 40 : -40;
      const [px, py] = this.scr(m.x, m.y);
      this.juice.smoke(px, py, 4, '#4a3a4e', { size: 3 });
      this.juice.streaks(px, py, 6, 120, ['#c8a0ff', '#ffffff'], { life: 0.3 });
      audio.play('mini_thread_hunter', { pan: clamp((px - 240) / 240, -1, 1) });
      return;
    }
    m.hunt += dt;
    // it works itself loose from the rock first, shaking, lamp blazing: your warning
    if (m.hunt < LOOSE) {
      m.ox = Math.sin(m.hunt * 70) * 1.5;
      if (this.fx.rand() < 0.3) {
        const [px, py] = this.scr(m.cx, m.cy);
        this.juice.smoke(px, py, 1, '#3a2e48', { size: 2, life: 0.5 });
      }
      place(m, this.time);
      return;
    }
    const tx = this.x - m.cx;
    const ty = this.y - m.cy;
    const l = Math.hypot(tx, ty) || 1;
    // it leans towards you, but turns like a stone: lead it round
    const k = Math.min(1, dt * 1.8);
    const v = this.hunterV * Math.min(1, (m.hunt - LOOSE) * 1.5);
    m.vx += ((tx / l) * v - m.vx) * k;
    m.vy += ((ty / l) * v - m.vy) * k;
    m.ox += (m.vx + (this.act === 'out' ? this.paceOut * 0.35 : 0)) * dt;
    m.oy += m.vy * dt;
    place(m, this.time);
    if (this.fx.rand() < 0.6) {
      const [px, py] = this.scr(m.cx, m.cy);
      this.fx.spark(px - (m.vx / v) * 6, py - (m.vy / v) * 6, -m.vx * 0.5, -m.vy * 0.5, 0.3, '#c8a0ff', { drag: 3 });
    }
    // it blows on anything: the walls, other mines, a cable; or it burns out
    const hitWall = m.hunt > LOOSE + 0.6 && (m.cy < this.f.ceil(m.cx) + 2 || m.cy > this.fieldH - this.f.floor(m.cx) - 2);
    let other = false;
    for (const o of this.f.mines) {
      if (o === m || o.dead || Math.abs(o.cx - m.cx) > 12 || Math.abs(o.cy - m.cy) > 12) continue;
      if (Math.hypot(o.cx - m.cx, o.cy - m.cy) < MINE_R * 2) other = true;
    }
    if (hitWall || other || m.hunt > LOOSE + 6) {
      m.lured = other;
      this.blow(m);
    }
  }

  /** A fuse lit: it blows in `time`. */
  private arm(m: Mine, time: number) {
    m.fuse = m.fuse >= 0 ? Math.min(m.fuse, time) : time;
    if (m.kind === 'fuse' && this.armCd <= 0 && time > 0.2) {
      audio.play('mini_thread_arm', { vol: 0.7 });
      this.armCd = 0.15;
    }
  }

  /** A mine goes up: its blast hurts you if you're in it, and sets off whatever's near. */
  private blow(m: Mine, struck = false) {
    if (m.dead) return;
    m.dead = true;
    const r = m.kind === 'fuse' ? 26 : m.kind === 'seeker' ? 24 : m.strand ? 15 : 19;
    const [px, py] = this.scr(m.cx, m.cy);
    this.blasts.push({ x: m.cx, y: m.cy, r, t: 0 });
    const onScreen = px > -30 && px < this.w + 30;
    if (onScreen) {
      this.fx.burst(px, py, 8, 110, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.45 });
      this.juice.streaks(px, py, 10, 220, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.35 });
      this.juice.smoke(px, py, 4, '#4a3a4e', { size: 4, life: 1 });
      if (this.fx.rand() < 0.5) this.juice.scrap(px, py, 2, 110);
      this.fx.ring(px, py, r, m.kind === 'seeker' ? '#c8a0ff' : '#ff8a3a', 0.28);
      this.fx.shake(m.front ? 1.5 : 3, 0.18);
      if (this.boomCd <= 0) {
        audio.play('mini_thread_blast', { vol: m.front ? 0.45 : 0.8, pan: clamp((px - 240) / 240, -1, 1) });
        this.boomCd = 0.07;
      }
    }
    // a string goes up from here, both ways along it
    if (m.strand && m.strand.tripped < 0) this.trip(m.strand, m.at!, false);
    // it sets off its neighbours
    for (const o of this.f.mines) {
      if (o.dead || o === m || Math.abs(o.cx - m.cx) > r || Math.abs(o.cy - m.cy) > r) continue;
      if (Math.hypot(o.cx - m.cx, o.cy - m.cy) > r * 0.95) continue;
      if (o.strand && o.strand === m.strand) continue;
      this.arm(o, 0.09 + this.fx.rand() * 0.06);
      if (m.lured) o.lured = true;
      if (m.front) o.front = true;
    }
    // a hunter you led into the field
    if (m.lured && !m.front && this.result === null) {
      const near = this.hullDist(m.cx, m.cy) < 140;
      if (near) {
        this.lures++;
        this.skim(2, 0, m.kind === 'seeker' ? 'LURED!' : 'BOOM!');
      }
    }
    if (struck || this.result !== null) return;
    const d = this.hullDist(m.cx, m.cy);
    if (this.hurt <= 0 && d < r - 4) this.hit(m.cy > this.y ? -1 : 1);
    else if (this.hurt <= 0 && d < r + 14 && (m.kind === 'fuse' || m.kind === 'seeker')) this.skim(3, m.cy - this.y, 'DODGED!');
  }

  // ----------------------------------------------------------------------------------------------
  // Strings and girders
  // ----------------------------------------------------------------------------------------------

  /** A string tripped at `at` (0..1 along it): its mines go up one after another from there. */
  private trip(s: Strand, at: number, byYou: boolean) {
    s.tripped = 0;
    s.from = at;
    const n = s.mines.length;
    for (const m of s.mines) if (!m.dead) this.arm(m, (byYou ? 0.4 : 0.05) + Math.abs(m.at! - at) * n * 0.1);
    const [px, py] = this.scr(...cablePoint(s, at, this.time));
    this.juice.streaks(px, py, 8, 140, ['#ffd04a', '#ffffff'], { life: 0.3 });
    audio.play('mini_thread_trip', { pan: clamp((px - 240) / 240, -1, 1) });
    if (byYou) this.fx.word('TRIPPED!', px, py - 14, '#ffd04a', 1, { pop: true, life: 0.8 });
  }

  private tickStrands(dt: number) {
    for (const s of this.f.strands) {
      if (s.tripped >= 0) {
        s.tripped += dt;
        continue;
      }
      if (Math.max(s.ax, s.bx) < this.x - HULL - 10 || Math.min(s.ax, s.bx) > this.x + HULL + 10) continue;
      // touching the cable trips it, where you touched
      const n = 16;
      for (let k = 0; k <= n; k++) {
        const [cx, cy] = cablePoint(s, k / n, this.time);
        if (this.hullDist(cx, cy) < HULL_R + 1) {
          this.trip(s, k / n, true);
          break;
        }
      }
    }
  }

  /** Girders: a hit if the arm or the pivot touches you, a shave if it nearly does. */
  private tickSweepers() {
    for (const s of this.f.sweepers) {
      if (s.dead) continue;
      const dx = s.x - this.x;
      if (dx < -s.len - HULL - 6) {
        if (!s.skimmed && !s.touched && s.near < 14) {
          s.skimmed = true;
          this.skim(3, 0, 'SHAVED IT!');
        }
        continue;
      }
      if (dx > s.len + HULL + 6) continue;
      const a = s.a0 + s.rate * this.time;
      const ex = Math.cos(a) * s.len;
      const ey = Math.sin(a) * s.len;
      const py = this.y - s.y;
      let near = 99;
      for (const o of [-HULL, -HULL / 2, 0, HULL / 2, HULL]) {
        const px = -dx + o;
        const k = clamp((px * ex + py * ey) / (s.len * s.len), 0, 1);
        near = Math.min(near, Math.hypot(px - ex * k, py - ey * k), Math.hypot(px, py) - 4);
      }
      s.near = Math.min(s.near, near);
      if (this.hurt <= 0 && near < 4) {
        s.touched = true;
        this.boom(this.x, this.y, 16);
        this.hit(py < 0 ? -1 : 1);
        if (this.result !== null) return;
      }
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Salvage, the cache, the fire
  // ----------------------------------------------------------------------------------------------

  private pickUp() {
    const t = this.time;
    for (const b of this.f.bits) {
      if (b.got) continue;
      const by = b.y + Math.sin(t * 2 + b.phase) * 2;
      if (Math.abs(b.x - this.x) > HULL + 10 || this.hullDist(b.x, by) > 9) continue;
      b.got = true;
      this.salvage++;
      const [px, py] = this.scr(b.x, by);
      this.fx.burst(px, py, 10, 90, ['#ffd04a', '#f4ecd8', '#c8a070'], { life: 0.4 });
      this.fx.word('+SALVAGE', px, py - 12, '#ffd04a', 1, { life: 0.6 });
      audio.play('mini_thread_salvage', { pitch: penta(Math.min(9, this.salvage % 10)) });
    }
    // the cache: fly into it and it clamps on under the hull
    if (this.act === 'heart' && !this.cache && this.hullDist(this.f.heartX, this.f.heartY) < 10) {
      this.cache = true;
      const [px, py] = this.scr(this.f.heartX, this.f.heartY);
      this.fx.stop(0.1);
      this.fx.flash('#ffd04a', 0.2);
      this.fx.burst(px, py, 30, 140, ['#ffd04a', '#ffffff', '#8affb0'], { life: 0.7 });
      this.fx.ring(px, py, 50, '#ffd04a', 0.5);
      this.fx.word(this.prize.got, px, py - 24, '#ffd04a', 2, { pop: true, life: 1.2 });
      audio.play('mini_thread_grab');
      this.wake();
    }
  }

  /** The fire rolling in from behind: everything it reaches goes up. */
  private burnField(dt: number) {
    for (const m of this.f.mines) {
      if (m.dead || m.fuse >= 0 || m.cx > this.front + 6) continue;
      m.front = true;
      this.arm(m, 0.02 + this.fx.rand() * 0.2);
    }
    for (const s of this.f.sweepers) if (!s.dead && s.x < this.front) s.dead = true;
    // the fire's own look: smoke and embers along its edge
    const sx = this.front - this.cam;
    for (let k = 0; k < 3; k++) {
      const y = this.fx.rand() * this.fieldH;
      this.juice.smoke(sx + this.fx.rand() * 6, y, 1, this.fx.rand() < 0.5 ? '#3a2232' : '#5a2a2a', { size: 5, life: 0.9, vx: -30 });
      if (this.fx.rand() < 0.5) this.juice.embers(sx + 4, y, 1, '#ffb03a', { speed: 40, life: 0.6, vx: 30 });
    }
    if (this.fx.rand() < dt * 9) this.boom(this.front - 6 - this.fx.rand() * 40, 10 + this.fx.rand() * (this.fieldH - 20), 16 + this.fx.rand() * 14);
    this.rumbleT -= dt;
    if (this.rumbleT <= 0 && this.result === null) {
      this.rumbleT = 0.5;
      audio.play('mini_thread_rumble', { vol: 0.6 });
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Feedback
  // ----------------------------------------------------------------------------------------------

  /**
   * The field's voice: the nearest mine ahead pings, faster and louder as it comes (low for
   * magnets, high for fuses); lit fuses tick faster as they run down; girders whoom as they
   * swing past upright.
   */
  private sonar(dt: number) {
    this.pingT -= dt;
    this.tickT -= dt;
    let best: Mine | null = null;
    let bd = 150;
    let fuse = 9;
    for (const m of this.f.mines) {
      if (m.dead) continue;
      if (m.fuse >= 0 && m.kind === 'fuse' && !m.front) fuse = Math.min(fuse, m.fuse);
      const dx = m.cx - this.x;
      if (dx < 16 || dx > bd || Math.abs(m.cy - this.y) > 40) continue;
      bd = dx;
      best = m;
    }
    if (best && this.pingT <= 0) {
      const f = bd / 150;
      this.pingT = 0.08 + 0.45 * f;
      audio.play('mini_thread_ping', { pitch: best.kind === 'magnet' ? 0.75 : best.kind === 'fuse' ? 1.33 : 1, vol: 0.3 + 0.45 * (1 - f), pan: 0.3 });
    }
    if (fuse < 9 && this.tickT <= 0) {
      const f = Math.min(1, fuse / this.fuseT);
      this.tickT = 0.04 + 0.08 * f;
      audio.play('mini_thread_tick', { pitch: 1 + (1 - f) * 0.4 });
    }
    for (const s of this.f.sweepers) {
      const dx = s.x - this.x;
      const side = Math.sign(Math.cos(s.a0 + s.rate * this.time));
      if (s.side && side !== s.side && dx > -s.len && dx < 420 && !s.dead) audio.play('mini_thread_sweep', { vol: Math.max(0.25, 1 - Math.max(0, dx) / 420), pan: clamp(dx / 300, -0.5, 0.8) });
      s.side = side;
    }
  }

  private skim(base: number, dy: number, word: string) {
    const before = this.mult;
    this.skims++;
    this.chain++;
    this.chainT = CHAIN_T;
    this.bestChain = Math.max(this.bestChain, this.chain);
    this.points += base * this.mult;
    const step = penta(Math.min(this.chain - 1, 9));
    const sx = this.x - this.cam;
    if (word === 'SHAVED IT!') audio.play('mini_thread_shave', { pitch: step, pan: -0.4 });
    else if (word === 'DODGED!' || word === 'LURED!' || word === 'BOOM!') audio.play('mini_thread_dodged', { pitch: step, pan: -0.4 });
    else audio.play(base > 1 ? 'mini_thread_close' : 'mini_thread_skim', { pitch: step, pan: dy > 0 ? 0.2 : -0.2 });
    this.juice.streaks(sx, this.y + (dy > 0 ? 5 : -5), 5 + base * 3, 170, ['#8affe0', '#ffffff'], { dir: Math.PI, spread: 1.1, life: 0.35 });
    this.fx.word(word, sx + 14, this.y - 16, base > 1 ? '#ffffff' : '#8affe0', 1, { pop: base > 1, life: 0.6 });
    if (this.mult > before) {
      this.fx.word(`×${this.mult}`, sx, this.y - 30, '#ffd04a', 2, { pop: true, life: 1 });
      this.fx.ring(sx, this.y, 26 + this.mult * 6, '#ffd04a', 0.35);
      audio.play('mini_thread_mult', { pitch: penta((this.mult - 1) * 2) });
    }
  }

  /** The flash and fire where something went up. */
  private boom(x: number, y: number, r: number) {
    this.blasts.push({ x, y, r, t: 0 });
  }

  private hit(dir: number, word = 'HIT!') {
    this.hits++;
    this.hurt = 1.1;
    this.vy = dir * 200;
    this.dashT = 0;
    if (this.chain >= 4) this.fx.word('CHAIN LOST', this.x - this.cam + 24, this.y + 22, '#ff8a7a');
    this.chain = 0;
    this.chainT = 0;
    const [x, y] = [this.x - this.cam, this.y];
    this.fx.burst(x, y, 16, 150, ['#ffffff', '#ffd04a', '#ff8a3a', '#ff5a4a'], { life: 0.7 });
    this.juice.streaks(x, y, 18, 260, ['#ffffff', '#ffd04a', '#ff8a3a'], { life: 0.45 });
    this.juice.scrap(x, y, 5, 150, { dir: dir < 0 ? -Math.PI / 2 : Math.PI / 2, spread: 2.4 });
    this.juice.smoke(x, y, 5, '#3a3042', { size: 4 });
    this.fx.ring(x, y, 34, '#ff5a4a', 0.3);
    this.fx.shake(6, 0.35);
    this.fx.flash('#ff5a4a', 0.15);
    this.fx.stop(0.09);
    audio.play('mini_thread_hit');
    if (this.hits >= this.lives) {
      this.wrecked = true;
      this.result = this.score();
      this.fx.stop(0.18);
      this.fx.burst(x, y, 30, 200, ['#ffffff', '#ffd04a', '#ff8a3a', '#5a5466'], { life: 1 });
      this.juice.scrap(x, y, 9, 200);
      this.juice.smoke(x, y, 12, '#3a3042', { size: 6, life: 1.4, speed: 40 });
      this.boom(this.x, this.y, 30);
      this.fx.ring(x, y, 80, '#ff8a3a', 0.6);
      this.fx.word('WRECKED', this.w / 2, this.fieldH / 2, '#ff5a4a', 2, { pop: true, life: 1.6 });
      audio.play('mini_thread_wreck');
    } else this.fx.word(word, x + 14, y - 16, '#ff5a4a', 1, { pop: true });
  }

  private finish() {
    this.done = true;
    this.result = this.score();
    const [x, y] = [this.x - this.cam + 20, this.y];
    const clean = this.hits === 0;
    this.fx.stop(0.12);
    this.fx.flash('#ffd04a', 0.22);
    this.fx.burst(x, y, 50, 160, ['#ffd04a', '#8affb0', '#ffffff']);
    this.fx.ring(x, y, 60, '#ffd04a', 0.5);
    this.fx.ring(x, y, 110, '#8affb0', 0.8);
    this.fx.word(clean ? 'FLAWLESS!' : this.cache ? 'OUT WITH IT!' : 'OUT!', this.w / 2, this.fieldH / 2 - 10, clean ? '#8affb0' : '#ffd04a', 2, { pop: true, life: 1.6 });
    audio.play('mini_thread_clear', { pitch: clean ? 1.2 : 1 });
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const fx = this.fx;
    // the intro: before the first update (the countdown) the Kestrel slides in from the left
    if (this.t0 < 0) this.t0 = t;
    const intro = this.time > 0 || this.result !== null ? 1 : clamp((t - this.t0) / 1.5, 0, 1);
    const ease = 1 - (1 - intro) ** 3;
    const awake = this.act === 'out';
    nebula(ctx, w, h, this.seed, awake ? [80, 20, 30] : [40, 20, 70], [70, 40, 30], this.cam * 0.15);
    stars(ctx, w, h, this.seed, this.cam * 0.6, this.dashT > 0 ? 4 : 1, t);
    ctx.save();
    const [ox, oy] = fx.offset();
    ctx.translate(ox, oy);
    this.layer(ctx, w, this.far, 0.08, t, 0.55);
    this.layer(ctx, w, this.mid, 0.3, t, 0.3);
    // the heart's glow, through the rock, before you get there
    const [hx, hy] = this.scr(this.f.heartX, this.f.heartY);
    if (!this.cache && hx > -200 && hx < w + 300) glow(ctx, hx, hy, 150, '#ffb03a', 0.16 + Math.sin(t * 2) * 0.03);
    this.walls(ctx, w, t);
    this.exitLine(ctx, w, t);
    for (const s of this.f.sweepers) {
      if (s.dead) continue;
      const [x, y] = this.scr(s.x, s.y);
      if (x < -s.len - 10 || x > w + s.len + 10) continue;
      this.girder(ctx, Math.round(x), Math.round(y), s, t);
    }
    this.wrecks(ctx, w, t);
    this.cables(ctx, w, t);
    this.rings(ctx, w, t);
    this.juice.draw(ctx, 'back');
    this.salvageBits(ctx, w, t);
    if (!this.cache) this.drawCache(ctx, hx, hy, t);
    for (const m of this.f.mines) {
      if (m.dead) continue;
      const [x, y] = this.scr(m.cx, m.cy);
      if (x < -14 || x > w + 14) continue;
      this.drawMine(ctx, Math.round(x), Math.round(y), t, m);
    }
    this.drawBlasts(ctx, w);
    fx.drawSparks(ctx);
    for (const g of this.ghosts) drawSprite(ctx, 'thread', 'kestrel', g.x, g.y, { clip: 'burn', t, alpha: 0.35 * (1 - g.t / 0.25) });
    this.ship(ctx, this.x - this.cam - Math.round((1 - ease) * 90), this.y, t);
    this.juice.draw(ctx, 'front');
    if (awake) this.fire(ctx, t);
    this.chainTag(ctx);
    this.layer(ctx, w, this.near, 1.4, t);
    fx.drawWords(ctx);
    ctx.restore();
    vignette(ctx, w, h, awake ? 0.6 : 0.45);
    this.heartClock(ctx, w, t);
    this.prompt(ctx, w, t);
    this.drawBanner(ctx, w);
    this.hud(ctx, w, h, t);
    fx.drawFlash(ctx, w, h);
  }

  /** The rock above and below: a dark mass, heaped with rubble along its edge, lit from the lane. */
  private walls(ctx: CanvasRenderingContext2D, w: number, t: number) {
    const f = this.f;
    const x0 = Math.floor(this.cam / 4) * 4 - 8;
    const x1 = this.cam + w + 8;
    const awake = this.act === 'out';
    for (const side of [0, 1]) {
      const edge = (x: number) => (side ? this.fieldH - f.floor(x) : f.ceil(x));
      const base = side ? this.fieldH + 4 : -4;
      const dir = side ? 1 : -1;
      // the body, and a lighter skin just in from the edge, where the lane's light reaches
      for (const [inset, col] of [
        [0, '#2a2034'],
        [5, '#1a1322'],
        [14, '#0f0a15'],
      ] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x0 - this.cam, base);
        for (let x = x0; x <= x1; x += 4) ctx.lineTo(Math.round(x - this.cam), Math.round(edge(x) - dir * inset));
        ctx.lineTo(x1 - this.cam, base);
        ctx.closePath();
        ctx.fill();
      }
      // specks of stone in the dark
      for (let x = x0; x <= x1; x += 4) {
        const hsh = Math.sin(x * 12.9898 + side * 7.1) * 43758.5453;
        const n = hsh - Math.floor(hsh);
        if (n > 0.3) continue;
        ctx.fillStyle = n < 0.1 ? '#2e2440' : '#1c1528';
        ctx.fillRect(Math.round(x - this.cam) + Math.floor(n * 9), Math.round(edge(x)) - dir * (18 + Math.floor(n * 120)), 2 + Math.floor(n * 8), 2);
      }
    }
    // the rubble heaped along the edges
    for (const rb of f.rubble) {
      if (rb.x < this.cam - 24 || rb.x > x1 + 16) continue;
      const e = rb.side ? this.fieldH - f.floor(rb.x) + rb.inset : f.ceil(rb.x) - rb.inset;
      drawFlashed(ctx, 'thread', rb.name, Math.round(rb.x - this.cam), Math.round(e), { clip: 'tumble', frame: rb.frame, anchor: 'center' }, awake ? '#3a1414' : '#1a1222', 0.45);
    }
    // hunters asleep in the walls: a violet eye in the rock
    for (const m of f.mines) {
      if (m.kind !== 'seeker' || m.hunt >= 0 || m.dead) continue;
      const [x, y] = this.scr(m.cx, m.cy);
      if (x < -10 || x > w + 10) continue;
      const on = Math.floor(t * (awake ? 6 : 1.5) + m.phase) % 2 === 0;
      ctx.fillStyle = '#0d0912';
      ctx.fillRect(Math.round(x) - 5, Math.round(y) - 3, 11, 7);
      ctx.fillStyle = on ? '#c8a0ff' : '#3a2a4a';
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      if (on) glow(ctx, x, y, awake ? 14 : 8, '#c8a0ff', awake ? 0.5 : 0.25);
    }
  }

  /** The last finder's ship, dead in the field, nose down, a spark still flickering in it. */
  private wrecks(ctx: CanvasRenderingContext2D, w: number, t: number) {
    for (const wr of this.f.wrecks) {
      const [x, y] = this.scr(wr.x, wr.y);
      if (x < -40 || x > w + 40) continue;
      drawFlashed(ctx, 'thread', 'kestrel_down', x, y, { clip: 'fly', frame: 0, flipX: true }, '#1a0e16', 0.6);
      if (Math.sin(t * 13) + Math.sin(t * 7.3) > 1.2) {
        glow(ctx, x + 4, y - 2, 8, '#ff8a3a', 0.6);
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(Math.round(x) + 4, Math.round(y) - 2, 1, 1);
      }
      if (this.fx.rand() < 0.05) this.juice.smoke(x + 4, y - 2, 1, '#2a2232', { size: 2, life: 1.2, vy: -6 });
    }
  }

  /** The way out at the far end: two buoys and the line between them. */
  private exitLine(ctx: CanvasRenderingContext2D, w: number, t: number) {
    const ex = Math.round(this.f.exitX - this.cam);
    if (ex > w + 30 || ex < -20) return;
    for (let y = 10; y < this.fieldH - 10; y += 4) {
      ctx.fillStyle = Math.floor(y / 4 - t * 10) % 3 ? 'rgba(138,255,176,0.18)' : 'rgba(138,255,176,0.55)';
      ctx.fillRect(ex, y, 1, 2);
    }
    glow(ctx, ex + 1, this.fieldH / 2, 70, '#8affb0', 0.18 + Math.sin(t * 4) * 0.05);
    for (const by of [8, this.fieldH - 6]) drawSprite(ctx, 'thread', 'buoy', ex, by, { clip: 'blink', t, fallback: () => ((ctx.fillStyle = '#8affb0'), ctx.fillRect(ex - 1, by - 1, 3, 3)) });
    drawText(ctx, 'CLEAR', ex + 8, this.fieldH / 2 - 3, '#8affb0');
  }

  /** The cables the strings hang on, with their fairy lights; a tripped one burns along. */
  private cables(ctx: CanvasRenderingContext2D, w: number, t: number) {
    for (const s of this.f.strands) {
      if (Math.max(s.ax, s.bx) < this.cam - 20 || Math.min(s.ax, s.bx) > this.cam + w + 20) continue;
      const n = 24;
      let px = 0;
      let py = 0;
      for (let k = 0; k <= n; k++) {
        const [cx, cy] = cablePoint(s, k / n, this.time);
        const x = cx - this.cam;
        // a tripped cable's burnt away from the trip point as the fire runs along it
        const gone = s.tripped >= 0 && Math.abs(k / n - s.from) * s.mines.length * 0.1 < s.tripped - 0.35;
        if (k > 0 && !gone) {
          ctx.strokeStyle = s.tripped >= 0 ? '#ffb03a' : s.full ? '#c8a878' : '#a8909a';
          ctx.globalAlpha = s.tripped >= 0 ? 0.6 + 0.4 * Math.sin(t * 40 + k) : 0.9;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(px) + 0.5, Math.round(py) + 0.5);
          ctx.lineTo(Math.round(x) + 0.5, Math.round(cy) + 0.5);
          ctx.stroke();
          ctx.globalAlpha = 1;
          // the fairy lights strung between the mines
          if (k % 2 === 1 && s.tripped < 0) {
            const on = Math.floor(t * 3 + k * 0.7 + s.phase) % 3 !== 0;
            const col = FAIRY[(k + Math.floor(s.phase * 3)) % FAIRY.length];
            ctx.fillStyle = on ? col : '#4a2e2a';
            ctx.fillRect(Math.round(x), Math.round(cy), on ? 2 : 1, on ? 2 : 1);
            if (on) glow(ctx, x + 1, cy + 1, 6, col, s.full ? 0.5 : 0.35);
          }
        }
        // the spark running along a tripped line
        if (s.tripped >= 0 && !gone && k > 0) {
          const edge = Math.abs(k / n - s.from) * s.mines.length * 0.1;
          if (Math.abs(edge - (s.tripped - 0.35)) < 0.04) {
            glow(ctx, x, cy, 10, '#ffffff', 0.8);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(x) - 1, Math.round(cy) - 1, 2, 2);
          }
        }
        px = x;
        py = cy;
      }
      // the anchors bolted into the rock
      for (const [ax, ay] of [
        [s.ax, s.ay],
        [s.bx, s.by],
      ]) {
        if (!s.full && ax === s.bx && ay === s.by) continue;
        const x = Math.round(ax - this.cam);
        const y = Math.round(clamp(ay, 2, this.fieldH - 2));
        ctx.fillStyle = DARK;
        ctx.fillRect(x - 3, y - 3, 7, 7);
        ctx.fillStyle = '#5a5466';
        ctx.fillRect(x - 2, y - 2, 5, 5);
        ctx.fillStyle = '#8a8498';
        ctx.fillRect(x - 2, y - 2, 5, 1);
      }
    }
  }

  /** The rings' paths, faint, so their turn reads. */
  private rings(ctx: CanvasRenderingContext2D, w: number, t: number) {
    for (const g of this.f.rings) {
      const [x, y] = this.scr(g.x, g.y);
      if (x < -g.r - 20 || x > w + g.r + 20) continue;
      if (!this.f.mines.some((m) => m.ring === g && !m.dead)) continue;
      ctx.save();
      ctx.strokeStyle = g.heart ? 'rgba(255,176,58,0.22)' : 'rgba(255,90,74,0.16)';
      ctx.setLineDash([2, 5]);
      ctx.lineDashOffset = -t * 12 * Math.sign(g.rate);
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), g.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (!g.heart) {
        // the hub it turns on
        ctx.fillStyle = DARK;
        ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
        ctx.fillStyle = '#4a4458';
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
      }
    }
  }

  private salvageBits(ctx: CanvasRenderingContext2D, w: number, t: number) {
    for (const b of this.f.bits) {
      if (b.got) continue;
      const [x, y] = this.scr(b.x, b.y + Math.sin(t * 2 + b.phase) * 2);
      if (x < -10 || x > w + 10) continue;
      glow(ctx, x, y, 14, '#ffd04a', 0.4 + 0.15 * Math.sin(t * 5 + b.phase));
      drawFlashed(ctx, 'thread', b.name, x, y, { clip: 'tumble', t: t * 0.6 + b.phase, anchor: 'center' }, '#ffd04a', 0.22) || ((ctx.fillStyle = '#c8a070'), ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4));
      // a glint now and then, so it catches the eye among the mines
      if (Math.sin(t * 3 + b.phase * 3) > 0.92) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x) + 2, Math.round(y) - 4, 1, 3);
        ctx.fillRect(Math.round(x) + 1, Math.round(y) - 3, 3, 1);
      }
    }
  }

  private drawCache(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    if (x < -30 || x > this.w + 30) return;
    glow(ctx, x, y, 34, '#ffd04a', 0.4 + 0.1 * Math.sin(t * 4));
    if (this.prize.carry) drawSprite(ctx, 'thread', 'cache', x, y, { clip: 'pulse', t, scale: 1, fallback: () => ((ctx.fillStyle = '#ffd04a'), ctx.fillRect(Math.round(x) - 6, Math.round(y) - 5, 12, 10)) });
    else {
      // the eye: a still, bright point with the storm's light wheeling round it
      glow(ctx, x, y, 18, '#e8f4ff', 0.7);
      for (let k = 0; k < 8; k++) {
        const a = t * 1.5 + (k / 8) * TAU;
        ctx.fillStyle = k % 2 ? '#8affe0' : '#e8f4ff';
        ctx.fillRect(Math.round(x + Math.cos(a) * 9), Math.round(y + Math.sin(a) * 9), 2, 1);
      }
    }
    // its name, for the first moments at the heart, then the rings have the stage
    if (this.act === 'heart' && this.heartT > this.heartLimit - 4) drawText(ctx, this.prize.label, Math.round(x), Math.round(y) + 14, Math.floor(t * 3) % 2 ? '#ffd04a' : '#f4ecd8', { align: 'center' });
  }

  private drawBlasts(ctx: CanvasRenderingContext2D, w: number) {
    for (const b of this.blasts) {
      const [x, y] = this.scr(b.x, b.y);
      if (x < -40 || x > w + 40) continue;
      const f = b.t / 0.7;
      glow(ctx, x, y, b.r * 1.8 * (1 - f), '#ff8a3a', 1 - f * 1.4);
      drawSprite(ctx, 'thread', 'boom', x, y, {
        clip: 'go',
        t: b.t,
        scale: b.r > 22 ? 1 : undefined,
        fallback: () => {
          ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.7 - f * 3)})`;
          ctx.beginPath();
          ctx.arc(x, y, b.r * Math.min(1, f * 5), 0, TAU);
          ctx.fill();
        },
      });
      // the first instant: a hard white disc the size of the blast
      if (b.t < 0.06) {
        ctx.fillStyle = '#fff4d8';
        ctx.beginPath();
        ctx.arc(x, y, b.r * 0.8, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** The fire coming on from behind: a ragged wall of flame and smoke, lighting the field red. */
  private fire(ctx: CanvasRenderingContext2D, t: number) {
    const fx = Math.round(this.front - this.cam);
    if (fx < -60) return;
    // its light, thrown forward over the field
    for (let y = 10; y < this.fieldH; y += 40) glow(ctx, fx + 10, y + Math.sin(t * 2 + y) * 8, 120, '#ff4a1a', 0.22);
    // behind the front: what's left, burning
    ctx.fillStyle = 'rgba(30,8,12,0.9)';
    ctx.fillRect(0, 0, Math.max(0, fx - 18), this.fieldH);
    for (let y = 0; y < this.fieldH; y += 2) {
      const wob = Math.sin(y * 0.13 + t * 7) * 5 + Math.sin(y * 0.37 - t * 11) * 3 + Math.sin(y * 0.9 + t * 23) * 1.5;
      const x = fx + wob;
      ctx.fillStyle = '#4a1216';
      ctx.fillRect(Math.round(x) - 28, y, 12, 2);
      ctx.fillStyle = '#8a2218';
      ctx.fillRect(Math.round(x) - 18, y, 8, 2);
      ctx.fillStyle = '#ff5a2a';
      ctx.fillRect(Math.round(x) - 10, y, 6, 2);
      ctx.fillStyle = '#ffb03a';
      ctx.fillRect(Math.round(x) - 4, y, 3, 2);
      // tongues licking forward
      const tongue = Math.max(0, Math.sin(y * 0.21 + t * 5) * Math.sin(y * 0.05 - t * 3)) * 14;
      if (tongue > 2) {
        ctx.fillStyle = (y + Math.floor(t * 30)) % 7 < 2 ? '#fff4b0' : '#ffd04a';
        ctx.fillRect(Math.round(x) - 1, y, Math.round(tongue), 1);
      }
    }
  }

  /** The chain, riding under the ship: its multiplier and how long it has left. */
  private chainTag(ctx: CanvasRenderingContext2D) {
    if (!this.chain || this.result !== null) return;
    const cx = Math.round(this.x - this.cam) - 4;
    const cy = Math.round(this.y) + 18;
    const col = this.mult >= 3 ? '#ffd04a' : '#8affe0';
    const label = this.mult > 1 ? `×${this.mult}` : `${this.chain}`;
    const bw = label.length * 6 + 6;
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(cx - Math.round(bw / 2), cy - 8, bw, 14);
    drawText(ctx, label, cx, cy - 6, col, { align: 'center' });
    ctx.fillStyle = col;
    ctx.fillRect(cx - Math.round(bw / 2), cy + 4, Math.round(bw * Math.max(0, this.chainT / CHAIN_T)), 2);
    if (this.mult > 1) glow(ctx, cx, cy - 2, 14, col, 0.25);
  }

  /** The Kestrel: her attitude follows the stick, her flames the burn; struck, she flashes white. */
  private ship(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const sx = x + this.exitX;
    if (this.wrecked) {
      const k = this.wreckT;
      if (k > 1.2) return;
      drawFlashed(ctx, 'thread', 'kestrel_down', sx - k * 40, y + k * k * 60, { clip: 'fly', t }, '#1a0e16', 0.55);
      return;
    }
    if (this.hurt > 0 && this.hurt < 0.95 && Math.floor(t * 16) % 2) return;
    // the cache, clamped on under the hull
    if (this.cache && this.prize.carry) {
      glow(ctx, sx, y + 8, 16, '#ffd04a', 0.3);
      drawSprite(ctx, 'thread', 'cache', sx - 2, y + 9, { clip: 'pulse', t });
    }
    const tilt = this.vy < -45 ? 'kestrel_up' : this.vy > 45 ? 'kestrel_down' : 'kestrel';
    const burn = this.dashT > 0 || this.done || this.vx > 60 || (this.time === 0 && this.result === null);
    if (burn) glow(ctx, sx - 22, y + 1, 14, '#ffd04a', 0.35 + Math.sin(t * 40) * 0.1);
    drawFlashed(ctx, 'thread', tilt, sx, y, { clip: burn ? 'burn' : 'fly', t }, '#ffffff', this.hurt > 0.95 ? 1 : 0) || sideShip(ctx, sx, y, burn ? 1 : 0.45, '#c86a3a', t);
  }

  /** A parallax layer of the field: things drifting by at `k` of the view's speed, wrapping round. */
  private layer(ctx: CanvasRenderingContext2D, w: number, items: Deco[], k: number, t: number, haze = 0) {
    const span = w + 160;
    for (const d of items) {
      const x = ((((d.x - this.cam * k) % span) + span) % span) - 80;
      // far things sink into the nebula's colour, so they never read as the mines you fly through
      drawFlashed(ctx, 'thread', d.name, x, d.y, { clip: d.clip, t: t * d.rate + d.phase, alpha: d.alpha }, '#2a1a40', haze);
    }
  }

  /** A mine, each kind its own model: its eye blinks faster and it glows as you come near. */
  private drawMine(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, m: Mine) {
    const near = Math.hypot(m.cx - this.x, m.cy - this.y);
    const close = Math.max(0, 1 - near / 50);
    const lit = m.fuse >= 0;
    const awake = this.act === 'out';
    const lampC = m.kind === 'magnet' ? '#6ab0ff' : m.kind === 'fuse' ? '#ffb03a' : m.kind === 'seeker' ? '#c8a0ff' : '#ff3a4a';
    if (close > 0) glow(ctx, x, y, 14 + close * 10, lampC, close * 0.5);
    if (m.kind === 'bob') {
      // the chain it swings on, its links running up out of sight
      const v = Math.cos(this.time * m.rate + m.phase);
      const len = 16 + Math.round(v * 8);
      for (let k = 0; k < len; k += 3) {
        ctx.fillStyle = `rgba(154,148,168,${0.6 * (1 - k / len)})`;
        ctx.fillRect(x - (k % 6 ? 0 : 1), y - 9 - k, k % 6 ? 1 : 3, 2);
      }
    }
    const tugging = m.kind === 'magnet' && Math.abs(m.ox) + Math.abs(m.oy) > 2 && near < 100;
    if (tugging) {
      // field lines reaching for you
      ctx.fillStyle = '#6ab0ff';
      const sx = this.x - this.cam;
      for (let k = 1; k < 6; k++) {
        if ((k + Math.floor(t * 12)) % 2) continue;
        ctx.fillRect(Math.round(x + (sx - x) * (k / 6) * 0.5), Math.round(y + (this.y - y) * (k / 6) * 0.5), 2, 1);
      }
      glow(ctx, x, y, 18, '#6ab0ff', 0.4);
    }
    if (lit && m.kind === 'fuse' && !m.front) {
      // the blast to come: a ring that tightens as the fuse burns
      const f = Math.max(0, m.fuse / this.fuseT);
      ctx.strokeStyle = Math.floor(t * 20) % 2 ? '#ffd04a' : '#ff5a4a';
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 26 + f * 10, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      glow(ctx, x, y, 22, '#ff8a3a', 0.6 + (1 - f) * 0.3);
    }
    if (m.kind === 'seeker') {
      // a hunter: a mine with a rocket bolted on, its plume pointing back along its run
      const a = Math.atan2(m.vy, m.vx);
      ctx.fillStyle = '#ffd04a';
      for (let k = 0; k < 3; k++) ctx.fillRect(Math.round(x - Math.cos(a) * (7 + k * 2)), Math.round(y - Math.sin(a) * (7 + k * 2)), 2 - (k > 1 ? 1 : 0), 2 - (k > 1 ? 1 : 0));
      glow(ctx, x - Math.cos(a) * 8, y - Math.sin(a) * 8, 10, '#c8a0ff', 0.5);
    }
    const rate = lit ? 24 : awake ? 10 : 2 + close * 14;
    const on = Math.floor(t * rate + m.phase) % 2 === 0;
    const jit = lit ? Math.round(Math.sin(t * 90)) : 0;
    const sprite = m.kind === 'seeker' ? 'fuse' : m.kind;
    const drawn =
      lit && m.kind === 'fuse'
        ? drawSprite(ctx, 'thread', 'fuse', x + jit, y, { clip: 'arm', frame: Math.min(4, Math.floor((1 - Math.max(0, m.fuse) / this.fuseT) * 5)) })
        : tugging
          ? drawSprite(ctx, 'thread', 'magnet', x, y, { clip: 'reach', t })
          : drawFlashed(ctx, 'thread', sprite, x + jit, y, { clip: 'blink', frame: on ? 0 : 1 }, m.kind === 'seeker' ? '#8a60c8' : '#ffffff', m.kind === 'seeker' ? 0.45 : lit ? 0.5 : 0);
    if (!drawn) this.oldMine(ctx, x, y, m, on, lit, lampC);
    if (on) glow(ctx, x + 0.5, y + 1.5, lit ? 12 : awake ? 9 : 7, awake && m.kind === 'mine' ? '#ff2a3a' : lampC, awake ? 0.7 : 0.55);
    // a skimmed mine keeps a faint tick of the colour you earned on it
    if (m.skimmed) {
      ctx.fillStyle = 'rgba(138,255,224,0.7)';
      ctx.fillRect(x - 1, y - 11, 3, 1);
    }
  }

  /** The mine in plain shapes, while the sprites load. */
  private oldMine(ctx: CanvasRenderingContext2D, x: number, y: number, m: Mine, on: boolean, lit: boolean, lampC: string) {
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 5, y - 5, 11, 11);
    ctx.fillRect(x - 1, y - 8, 3, 17);
    ctx.fillRect(x - 8, y - 1, 17, 3);
    ctx.fillStyle = m.kind === 'magnet' ? '#8aa0c8' : '#9a9aaa';
    ctx.fillRect(x, y - 7, 1, 15);
    ctx.fillRect(x - 7, y, 15, 1);
    ctx.fillStyle = m.kind === 'magnet' ? '#3a4a6a' : m.kind === 'fuse' ? '#5a3a2a' : '#5a5466';
    ctx.fillRect(x - 4, y - 4, 9, 9);
    ctx.fillStyle = on ? (lit ? '#ffffff' : lampC) : '#3a1a24';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }

  /** A sweeping girder: a broken truss turning on its lit pivot, the circle it reaches drawn faint. */
  private girder(ctx: CanvasRenderingContext2D, x: number, y: number, s: Sweeper, t: number) {
    const a = s.a0 + s.rate * this.time;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,138,90,0.18)';
    ctx.setLineDash([2, 4]);
    ctx.lineDashOffset = -t * 8 * Math.sign(s.rate);
    ctx.beginPath();
    ctx.arc(x, y, s.len, 0, TAU);
    ctx.stroke();
    ctx.restore();
    for (let k = 1; k <= 3; k++) {
      const b = a - Math.sign(s.rate) * k * 0.12;
      ctx.globalAlpha = 0.22 / k;
      ctx.fillStyle = '#8a7a8a';
      for (let d = 8; d < s.len; d += 3) ctx.fillRect(Math.round(x + Math.cos(b) * d), Math.round(y + Math.sin(b) * d), 2, 2);
    }
    ctx.globalAlpha = 1;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const name = `girder_${Math.round(s.len) >= 57 ? 58 : 56}`;
    if (!drawSprite(ctx, 'thread', name, x, y, { angle: a })) {
      for (let d = 4; d < s.len; d += 1) {
        ctx.fillStyle = d % 8 < 1 ? '#ffd04a' : '#7a6a72';
        ctx.fillRect(Math.round(x + c * d) - 1, Math.round(y + sn * d) - 1, 2, 2);
      }
    }
    glow(ctx, x + c * s.len, y + sn * s.len, 12, '#ff5a3a', Math.floor(t * 6) % 2 ? 0.6 : 0.3);
    glow(ctx, x, y, 10, '#ff5a3a', Math.floor(t * 3) % 2 ? 0.5 : 0.2);
  }

  /** At the heart: how long before the field wakes on its own. */
  private heartClock(ctx: CanvasRenderingContext2D, w: number, t: number) {
    if (this.act !== 'heart' || this.result !== null) return;
    const s = Math.max(0, this.heartT);
    const low = s < 4;
    const text = `THE FIELD WAKES IN ${Math.ceil(s)}`;
    const tw = text.length * 6 + 12;
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(Math.round(w / 2 - tw / 2), this.fieldH - 18, tw, 12);
    ctx.fillStyle = low ? '#ff5a4a' : '#ffd04a';
    ctx.fillRect(Math.round(w / 2 - tw / 2), this.fieldH - 18, Math.round(tw * (s / this.heartLimit)), 1);
    drawText(ctx, text, w / 2, this.fieldH - 16, low && Math.floor(t * 6) % 2 ? '#ff5a4a' : '#f4ecd8', { align: 'center' });
  }

  /** An act's name, swept in big across the middle, held, and swept out. */
  private drawBanner(ctx: CanvasRenderingContext2D, w: number) {
    const b = this.banner;
    if (b.t > 2) return;
    const inn = Math.min(1, b.t / 0.25);
    const out = Math.max(0, (b.t - 1.6) / 0.4);
    const x = w / 2 + (1 - inn) ** 2 * 300 - out ** 2 * 400;
    const y = 54;
    ctx.globalAlpha = Math.min(1, 1.4 - out);
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(0, y - 6, w, 38);
    ctx.fillStyle = b.color;
    ctx.fillRect(0, y - 6, w, 1);
    ctx.fillRect(0, y + 31, w, 1);
    glow(ctx, x, y + 10, 90, b.color, 0.2);
    drawText(ctx, b.text, Math.round(x), y, b.color, { scale: 2, align: 'center' });
    drawText(ctx, b.sub, Math.round(x), y + 20, '#f4ecd8', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  /** The current prompt, on a dark band along the top: it blinks in, then fades. */
  private prompt(ctx: CanvasRenderingContext2D, w: number, t: number) {
    const tp = this.tip;
    if (tp.t <= 0 || this.result !== null || this.banner.t < 2) return;
    if (tp.t > 2.35 && Math.floor(t * 16) % 2) return;
    const tw = tp.text.length * 6 + 12;
    ctx.globalAlpha = Math.min(1, tp.t * 3);
    ctx.fillStyle = 'rgba(10,7,16,0.85)';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 4, tw, 12);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(Math.round(w / 2 - tw / 2), 4, 2, 12);
    drawText(ctx, tp.text, w / 2, 6, '#f4ecd8', { align: 'center' });
    ctx.globalAlpha = 1;
  }

  /** The run so far (with the heart and the exit on it), hearts, the burn, salvage and style. */
  private hud(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const by = h - 15;
    ctx.fillStyle = 'rgba(10,7,16,0.92)';
    ctx.fillRect(0, by - 4, w, 19);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, by - 4, w, 1);
    // the track: the heart halfway, the flag at the end, the fire chasing
    const pw = 132;
    panel(ctx, 4, by - 2, pw + 14, 12, this.act === 'out' ? '#ff5a4a' : '#8affb0');
    const f = this.progress;
    meter(ctx, 10, by + 2, pw, 3, f, this.cache ? '#ffd04a' : '#8affb0');
    const hx = 10 + Math.round(pw * (this.f.heartX / this.f.exitX));
    ctx.fillStyle = this.cache ? '#5a4e3a' : Math.floor(t * 3) % 2 ? '#ffd04a' : '#c8a040';
    ctx.fillRect(hx - 2, by, 5, 7);
    if (this.act === 'out') {
      const fr = 10 + Math.round(pw * clamp(this.front / this.f.exitX, 0, 1));
      ctx.fillStyle = Math.floor(t * 8) % 2 ? '#ff5a2a' : '#ffb03a';
      ctx.fillRect(10, by + 2, fr - 10, 3);
    }
    const shipX = 10 + Math.round(pw * f);
    ctx.fillStyle = '#f4ecd8';
    ctx.fillRect(shipX - 3, by + 1, 4, 3);
    ctx.fillRect(shipX + 1, by + 2, 2, 1);
    for (let k = 0; k < 3; k++)
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = (k + j) % 2 ? '#f4ecd8' : '#2a2236';
        ctx.fillRect(pw + 10 + j * 2, by + k * 2, 2, 2);
      }
    // hearts
    let x = pw + 24;
    panel(ctx, x, by - 2, this.lives * 9 + 6, 12, '#ff5a4a');
    for (let k = 0; k < this.lives; k++) {
      const live = k < this.lives - this.hits;
      const lost = k === this.lives - this.hits && this.hurt > 0.6;
      drawText(ctx, '♥', x + 5 + k * 9, by - (lost ? 2 : 0), lost ? '#ffffff' : live ? '#ff5a4a' : '#3a2e48');
    }
    x += this.lives * 9 + 12;
    // the burn: a pip a charge, the next one filling
    const bw = 30 + this.maxCharges * 8;
    panel(ctx, x, by - 2, bw, 12, this.charges ? '#ffd04a' : '#5a4e68');
    drawText(ctx, 'BURN', x + 5, by, this.charges ? '#ffd04a' : '#5a4e68');
    for (let k = 0; k < this.maxCharges; k++) {
      const px = x + 31 + k * 8;
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(px, by, 6, 7);
      if (k < this.charges) {
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(px, by, 6, 7);
        ctx.fillStyle = '#fff4b0';
        ctx.fillRect(px, by, 6, 1);
      } else if (k === this.charges) {
        const fill = Math.round(7 * (1 - Math.max(0, this.recharge) / 1.5));
        ctx.fillStyle = '#8a6a2a';
        ctx.fillRect(px, by + 7 - fill, 6, fill);
      }
    }
    x += bw + 6;
    // salvage
    panel(ctx, x, by - 2, 62, 12, '#c8a070');
    drawSprite(ctx, 'thread', 'scrap_1', x + 11, by + 3, { clip: 'tumble', t: t * 0.3, anchor: 'center' });
    drawText(ctx, `${this.salvage}/${this.bitsTotal}`, x + 58, by, this.salvage === this.bitsTotal ? '#ffd04a' : '#f4ecd8', { align: 'right' });
    x += 68;
    // style, ticking up as you earn it
    const sw = w - x - 4;
    panel(ctx, x, by - 2, sw, 12, this.style >= 1 ? '#ffd04a' : '#8affe0');
    drawText(ctx, 'STYLE', x + 5, by, '#8affe0');
    meter(ctx, x + 38, by + 2, sw - 72, 3, this.shownStyle, this.style >= 1 ? '#ffd04a' : '#8affe0');
    drawText(ctx, `${Math.round(this.shownStyle * 100)}%`, x + sw - 4, by, this.style >= 1 ? '#ffd04a' : '#f4ecd8', { align: 'right' });
  }
}
