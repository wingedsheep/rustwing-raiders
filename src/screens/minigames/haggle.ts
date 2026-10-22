import { audio } from '../../audio';
import { drawText, wrap } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { TIER_COLOR } from '../../ui/widgets';
import { itemName, tierOf, type Item } from '../../game/loot';
import { portraits } from '../../view/portraits';
import { clamp, pick, rng, TAU, type Rng } from '../../util';
import type { Setup } from '../../sim/events';
import { artImage } from '../art';
import { byLevel, Fx, glow, hardness, meter, ticked, vignette, type Minigame, type Pad } from './common';

const INSULTED = ['ZZA?! YOU INSULT TOBBO!', 'BOH! TOBBO HAS CHILDREN!', 'FOR THAT? TOBBO WOULD SOONER EAT IT!', 'WAHH! AN INSULT TO THE METAL!', 'ZZIMBO! GET OUT! NO, WAIT.'];
const CHEEKY = ['HEH. CHEEKY. NO.', 'OH-HO, A FUNNY ONE. NO.', 'TOBBO LIKES YOU. STILL NO.'];
const CLOSE = ['HMM. HMM-HMM. FOR YOU:', 'TOBBO IS LOSING MONEY. FINE:', 'OH-BOH-BOH. YOU ARE HARD. SAY', 'TOBBO WEEPS. BUT:', 'ZZA. ONLY FOR A FRIEND:'];
const PUSHED = ['YOU PUSH TOBBO NOW? NOW?!', 'ZZT. BAD TIME, FRIEND. MAYBE', 'TOBBO IS BUSY BEING ANGRY.', 'BOH! ASK NICER. ASK LATER.'];
const FIRM = ['TOBBO DOES NOT MOVE. NOT ONE SCRAP MORE.', 'THAT IS THE PRICE. TOBBO HAS A FAMILY.'];
const CHASE = ['WAIT! WAIT WAIT WAIT! FOR YOU:', 'ZZA! COME BACK! TOBBO WAS JOKING!', 'NO NO NO, FRIEND! SIT! SAY'];
const LET_GO = ['GO THEN! GO! TOBBO HAS OTHER FRIENDS!', 'BOH. WALK. TOBBO DOES NOT CHASE.'];

/** How long the button has to be held before you turn and walk. */
const WALK_HOLD = 0.45;
/** Tobbo's mood counts as soft above this, prickly below the other. */
const SOFT = 0.4;
const PRICKLY = -0.3;

/**
 * Haggle with Tobbo Grisk: he names a price, you name yours, he comes down, or he doesn't. Under
 * his asking price is the least he'll take, and you can't see it. What you can see is his mood,
 * which swings on its own rhythm: when he's soft his wings go slow and he hums, and an offer then
 * gets a real step down; when he's prickly his wings buzz, and an offer then costs patience and
 * barely moves him. Go under his floor and it's an insult: patience burns, and his floor climbs.
 * Catch him soft and his floor sinks a little. Another buyer is eyeing the part, so there's no
 * haggling forever: when he reaches it, Tobbo calls a last price. Holding the button walks away,
 * a bluff: time it while he's soft and still has room, and he chases you down with a better price;
 * time it badly and he lets you go. Higher levels: less patience, a quicker buyer, a moodier
 * rhythm, and tells you have to look harder for.
 */
export class Haggle implements Minigame {
  readonly title = 'HAGGLE';
  readonly how = 'UP/DOWN: YOUR OFFER, LEFT/RIGHT: TENS. TAP THE BUTTON TO OFFER, HOLD IT TO WALK AWAY. OFFER WHEN HIS WINGS SLOW AND HE HUMS, NEVER WHEN HE BUZZES.';
  result: number | null = null;
  value: number | null = null;
  private readonly d: number;
  private readonly item: Item | null;
  private readonly ask: number;
  /** The least he'd take when you walked in: what the score is measured against. */
  private readonly floor: number;
  /** The least he'll take now: insults push it up, good timing brings it down. */
  private eff: number;
  private readonly purse: number;
  /** His price now, what the ladder shows (it slides), and every price he's said. */
  private price: number;
  private shown: number;
  private said: number[] = [];
  private offer: number;
  private patience = 1;
  private shownPatience = 1;
  /** His mood: a phase that turns at its own pace, read as -1 (prickly) .. 1 (soft). */
  private phase: number;
  private mood = 0;
  private readonly period: number;
  private readonly wobble: number;
  /** How plainly his mood shows: 1 at easy, much less at deadly. */
  private readonly tells: number;
  /** The other buyer, walking up to the part. */
  private buyer = 0;
  private readonly limit: number;
  private last = 0;
  private readonly lastLimit: number;
  /** Walking away: how far you've gone, and whether he's answered yet. */
  private walk = 0;
  private walkSettled = false;
  private bluffs = 0;
  private holdT = 0;
  private holding = false;
  private streak = 0;
  private best = 0;
  private offers = 0;
  private softs = 0;
  private insults = 0;
  private flush = 0;
  private lean = 0;
  private hit = 0;
  private line = '';
  private lineT = 0;
  private held = 0;
  private dir = 0;
  private time = 0;
  private notes: { x: number; y: number; life: number }[] = [];
  private noteT = 0;
  private fx = new Fx();
  private r: Rng;
  private done = 0;
  private shut = false;
  private lost = false;

  constructor(
    private level: number,
    seed: number,
    s: Setup,
  ) {
    this.r = rng(seed);
    const d = (this.d = hardness(level));
    this.item = s.item ?? null;
    this.ask = s.ask ?? 120;
    this.floor = s.floor ?? Math.round(this.ask * 0.5);
    this.eff = this.floor;
    this.purse = s.purse ?? 999;
    this.price = this.shown = this.ask;
    this.offer = Math.min(this.purse, Math.round(this.ask * 0.7));
    this.period = byLevel(d, 4.2, 2.9);
    this.wobble = byLevel(d, 0.08, 0.45);
    this.tells = byLevel(d, 1, 0.4);
    this.limit = byLevel(d, 34, 24);
    this.lastLimit = byLevel(d, 4, 2.6);
    // he starts somewhere on his swing, never right in a soft spot
    this.phase = Math.PI * (1 + this.r() * 0.8);
    this.say(`${pick(this.r, ['FOR YOU, FRIEND', 'A BARGAIN', 'PRACTICALLY FREE'])}: ${this.ask}.`);
  }

  private say(s: string) {
    this.line = s;
    this.lineT = 0;
  }

  /** The gap between his ask and his floor: what every concession is measured in. */
  private get span() {
    return Math.max(1, this.ask - this.floor);
  }

  private get top() {
    return Math.min(this.price, this.purse);
  }

  private get over() {
    return this.done > 0 || this.result !== null;
  }

  status() {
    if (this.last > 0 && !this.over) return `LAST CALL: ${this.price}  ·  TAP TO TAKE IT  ·  YOUR SCRAP ${this.purse}`;
    return `YOUR OFFER ${this.offer}  ·  HE WANTS ${this.price}  ·  YOUR SCRAP ${this.purse}`;
  }

  breakdown(): [string, string][] {
    const out: [string, string][] = [];
    out.push(['PRICE', this.value === null ? (this.lost ? 'SOLD TO THE OTHER ONE' : this.shut ? 'GATE SHUT' : 'NO DEAL') : `${this.value} (ASKED ${this.ask})`]);
    out.push(['HIS FLOOR', `${this.floor}`]);
    out.push(['OFFERS', `${this.offers}, ${this.softs} SOFT`]);
    if (this.insults) out.push(['INSULTS', `${this.insults}`]);
    else out.push(['PATIENCE LEFT', `${Math.round(this.patience * 100)}%`]);
    return out;
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    this.lineT += dt;
    this.flush = Math.max(0, this.flush - dt * 0.8);
    this.hit = Math.max(0, this.hit - dt * 3);
    this.lean += (0 - this.lean) * Math.min(1, dt * 4);
    this.shown += (this.price - this.shown) * Math.min(1, dt * 7);
    this.shownPatience += (this.patience - this.shownPatience) * Math.min(1, dt * 2.5);
    this.swing(dt);
    if (this.result !== null) return;
    if (this.done > 0) {
      this.done -= dt;
      if (this.done <= 0) this.result = this.value === null ? 0 : this.score();
      return;
    }
    this.time += dt;
    if (this.walk > 0) return this.walking(dt);
    if (this.last > 0) return this.lastCall(dt, pad);
    // the other buyer comes closer
    const was = this.buyer;
    this.buyer += dt / this.limit;
    if (was < 0.7 && this.buyer >= 0.7) {
      this.fx.word('SOMEONE ELSE WANTS IT', 160, 34, '#ffb04a', 1, { life: 1.4 });
      audio.play('risk_up', { vol: 0.5 });
    }
    if (this.buyer >= 1) return this.callLast();
    this.dial(dt, pad);
    // the button: a tap offers, a hold walks
    if (pad.press) {
      this.holding = true;
      this.holdT = 0;
    }
    if (this.holding) {
      if (pad.hold) {
        this.holdT += dt;
        if (this.holdT >= WALK_HOLD) {
          this.holding = false;
          this.startWalk();
        }
      } else {
        this.holding = false;
        this.make();
      }
    }
  }

  /** His mood turning: a swing that wobbles off the beat more the harder the level. */
  private swing(dt: number) {
    const speed = (TAU / this.period) * (1 + this.wobble * Math.sin(this.time * 0.9 + this.floor));
    this.phase += dt * speed;
    const bias = byLevel(this.d, -0.08, 0.22);
    const m = Math.sin(this.phase) * (1 - this.wobble * 0.3) + this.wobble * 0.3 * Math.sin(this.phase * 2.3 + 1) - bias;
    this.mood = clamp(m, -1, 1);
    // humming, when he's soft: little notes off his snout
    const soft = this.mood > SOFT + (1 - this.tells) * 0.25;
    this.noteT -= dt;
    if (soft && this.noteT <= 0 && !this.over) {
      this.noteT = 0.32 / this.tells;
      this.notes.push({ x: 158 + this.r() * 12, y: 70, life: 1.2 });
      if (this.level <= 2) audio.play('ui_move', { pitch: 0.45 + this.r() * 0.25, vol: 0.12 });
    }
    for (const n of this.notes) {
      n.life -= dt;
      n.y -= dt * 18;
      n.x += Math.sin(n.life * 6) * dt * 10;
    }
    this.notes = this.notes.filter((n) => n.life > 0);
    // buzzing, when he's prickly: sparks off the wings
    if (this.mood < PRICKLY - 0.15 && !this.over && this.r() < dt * 14 * this.tells) {
      const [wx, wy] = this.r() < 0.5 ? [84, 102] : [215, 64];
      this.fx.spark(wx + (this.r() - 0.5) * 30, wy + (this.r() - 0.5) * 16, (this.r() - 0.5) * 60, -20 - this.r() * 30, 0.3, '#ff7a6a', { size: 1 });
    }
  }

  /** Setting your offer: a tap is one, a hold runs it, faster the longer. */
  private dial(dt: number, pad: Pad) {
    const d = pad.y < -0.5 ? 1 : pad.y > 0.5 ? -1 : 0;
    const big = pad.x > 0.5 ? 1 : pad.x < -0.5 ? -1 : 0;
    const want = d || big * 10;
    if (want !== this.dir) {
      this.dir = want;
      this.held = 0;
      if (want) this.step(want);
    } else if (want) {
      this.held += dt;
      const rate = big ? 5 : this.held > 1.2 ? 40 : 14;
      const before = Math.floor((this.held - dt) * rate);
      if (this.held > 0.3 && Math.floor(this.held * rate) > before) this.step(want);
    }
  }

  private step(n: number) {
    const was = this.offer;
    this.offer = clamp(this.offer + n, 1, this.top);
    if (this.offer !== was) audio.play('ui_move', { pitch: 0.7 + (this.offer / this.ask) * 0.8, vol: 0.5 });
  }

  private moodNow(): 'soft' | 'prickly' | 'even' {
    return this.mood > SOFT ? 'soft' : this.mood < PRICKLY ? 'prickly' : 'even';
  }

  /** You name your price. */
  private make() {
    const o = this.offer;
    this.lean = 1;
    if (o >= this.price) return this.deal(this.price);
    this.offers++;
    const mood = this.moodNow();
    const base = byLevel(this.d, 0.14, 0.22);
    // pushing him at all knocks him off his soft spot for a while
    this.phase += 1.3;
    // soft, and you're nearly there: he takes yours
    if (mood === 'soft' && o >= this.eff && this.price - o <= Math.max(2, this.ask * byLevel(this.d, 0.03, 0.015))) {
      this.softs++;
      return this.deal(o, true);
    }
    const under = this.eff - o;
    if (under > 0) {
      const how = under / this.span;
      const cheeky = mood === 'soft' && how < 0.12;
      const mul = mood === 'soft' ? 0.6 : mood === 'prickly' ? 1.6 : 1;
      this.patience -= (base * 1.2 + how * 0.5) * mul * (cheeky ? 0.5 : 1);
      if (!cheeky) {
        this.eff += under * byLevel(this.d, 0.15, 0.3) * mul;
        this.insults++;
      }
      this.streak = 0;
      this.flush = cheeky ? 0.4 : 1;
      this.hit = 1;
      this.fx.shake(cheeky ? 2 : 3 + how * 10);
      this.fx.burst(150, 100, cheeky ? 6 : 16, 90, ['#ff5a4a', '#ffd04a']);
      if (!cheeky && how > 0.25) {
        this.fx.stop(0.08);
        this.fx.flash('#ff4a3a', 0.12);
      }
      this.fx.word(cheeky ? 'CHEEKY' : 'INSULT!', 150, 64, cheeky ? '#ffb04a' : '#ff5a4a', cheeky ? 1 : 2, { pop: true });
      audio.play(cheeky ? 'block' : 'ui_error');
      if (this.patience > 0) this.say(cheeky ? pick(this.r, CHEEKY) : `${pick(this.r, INSULTED)} ${this.price}.`);
    } else {
      // he gives way readily from his ask, and grudgingly near his floor
      const room = clamp((this.price - this.eff) / this.span, 0, 1);
      const k = (mood === 'soft' ? 0.33 + Math.min(3, this.streak) * 0.03 : mood === 'even' ? 0.13 : 0.03) * byLevel(this.d, 1, 0.86) * (0.55 + 0.45 * room);
      const target = Math.max(o, this.eff);
      const before = this.price;
      this.price = Math.max(Math.ceil(target), Math.round(this.price - (this.price - target) * k));
      this.patience -= base * (mood === 'soft' ? 0.5 : mood === 'even' ? 1 : 1.8);
      if (mood === 'soft') {
        this.softs++;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        this.eff = Math.max(this.floor - this.span * 0.1, this.eff - this.span * 0.02);
        this.fx.ring(150, 96, 40 + this.streak * 8, '#8affb0');
        this.fx.word(this.streak > 1 ? `READ HIM ×${this.streak}` : 'SOFT SPOT', 150, 64, '#8affb0', this.streak > 1 ? 2 : 1, { pop: true });
        audio.play(this.streak > 1 ? 'perfect' : 'ui_place', { pitch: 1 + this.streak * 0.08 });
      } else if (mood === 'prickly') {
        this.streak = 0;
        this.eff += this.span * 0.03;
        this.flush = 0.5;
        this.fx.shake(2);
        this.fx.word('BAD MOMENT', 150, 64, '#ff8a5a', 1, { pop: true });
        audio.play('block');
      } else {
        this.streak = 0;
        audio.play('ui_place');
      }
      if (this.price - this.eff < 1.5 || this.price === before) {
        this.price = Math.max(Math.ceil(this.eff), Math.min(this.price, before));
        this.say(`${pick(this.r, FIRM)} ${this.price}.`);
      } else this.say(`${pick(this.r, mood === 'prickly' ? PUSHED : CLOSE)} ${this.price}.`);
      if (this.price < before) this.fx.word(`-${before - this.price}`, 420, Math.round(this.ladderY(this.price)) - 8, '#ffd04a', 1, { pop: true });
    }
    this.eff = Math.min(this.eff, this.price);
    this.said.push(this.price);
    this.offer = Math.min(this.offer, this.top);
    if (this.patience <= 0) this.slam();
  }

  private slam() {
    this.patience = 0;
    this.shut = true;
    this.done = 1.6;
    this.say("OUT! OUT OF TOBBO'S YARD!");
    audio.play('explode_small');
    this.fx.stop(0.12);
    this.fx.shake(9, 0.6);
    this.fx.flash('#ff4a3a', 0.25);
    this.fx.word('GATE SHUT', 240, 110, '#ff5a4a', 3, { pop: true, life: 1.5 });
  }

  /** A hold of the button: you turn and walk. He chases you, or he doesn't. */
  private startWalk() {
    this.walk = 0.001;
    this.walkSettled = false;
    this.streak = 0;
    this.say('...');
    audio.play('step', { vol: 0.6 });
  }

  private walking(dt: number) {
    const before = this.walk;
    this.walk += dt;
    if (Math.floor(before * 3) !== Math.floor(this.walk * 3)) audio.play('step', { vol: 0.5, pitch: 0.9 + this.r() * 0.2 });
    if (!this.walkSettled && this.walk > 0.8) {
      this.walkSettled = true;
      const room = (this.price - this.eff) / this.span;
      const want = 0.7 * this.mood + 0.6 * room - 0.55 * this.bluffs - 0.2 * this.d - 0.1 + (this.r() - 0.5) * 0.15;
      this.bluffs++;
      if (want > 0) {
        const before = this.price;
        this.price = Math.max(Math.ceil(this.eff), Math.round(this.eff + (this.price - this.eff) * byLevel(this.d, 0.45, 0.6)));
        this.eff = Math.max(this.floor - this.span * 0.1, this.eff - this.span * 0.04);
        this.patience -= 0.05;
        this.said.push(this.price);
        this.say(`${pick(this.r, CHASE)} ${this.price}!`);
        this.fx.stop(0.1);
        this.fx.ring(150, 96, 70, '#ffd04a', 0.5);
        this.fx.word('HE CHASES!', 240, 90, '#ffd04a', 2, { pop: true, life: 1.2 });
        if (this.price < before) this.fx.word(`-${before - this.price}`, 420, Math.round(this.ladderY(this.price)) - 8, '#ffd04a', 1, { pop: true });
        audio.play('perfect');
      } else {
        this.patience -= 0.3;
        this.eff += this.span * 0.08;
        this.buyer = Math.min(0.97, this.buyer + 0.15);
        this.eff = Math.min(this.eff, this.price);
        this.say(pick(this.r, LET_GO));
        this.flush = 0.8;
        this.fx.shake(4);
        this.fx.word('CALLED YOUR BLUFF', 240, 90, '#ff5a4a', 2, { pop: true, life: 1.2 });
        audio.play('ui_error');
      }
      this.offer = Math.min(this.offer, this.top);
      if (this.patience <= 0) {
        this.walk = 0;
        return this.slam();
      }
    }
    if (this.walk > 1.5) this.walk = 0;
  }

  /** The other buyer has reached the part: one last price, take it or lose it. */
  private callLast() {
    this.last = this.lastLimit;
    this.offer = this.top;
    this.say(`LAST CALL, FRIEND. ${this.price}, OR IT GOES TO HIM.`);
    audio.play('risk_up');
    this.fx.stop(0.08);
    this.fx.shake(4);
    this.fx.word('LAST CALL', 240, 100, '#ffb04a', 3, { pop: true, life: 1.3 });
  }

  private lastCall(dt: number, pad: Pad) {
    const before = this.last;
    this.last -= dt;
    if (ticked(before, this.last, 4)) audio.play('ui_move', { pitch: 1.5 });
    if (pad.press && this.purse >= this.price) return this.deal(this.price);
    if (pad.press) audio.play('ui_error');
    if (this.last <= 0) {
      this.last = 0;
      this.lost = true;
      this.done = 1.6;
      this.say('SOLD! TO THE ONE WITH THE HAT! BOH.');
      audio.play('explode_small', { vol: 0.5 });
      this.fx.word('GONE', 240, 110, '#ff5a4a', 3, { pop: true, life: 1.5 });
    }
  }

  private deal(at: number, his = false) {
    this.value = at;
    this.last = 0;
    this.done = 1.6;
    const s = this.score();
    this.say(his ? 'ZZA... FINE. YOURS. TOBBO IS TOO KIND.' : at <= this.floor + 2 ? 'ROBBERY. DONE. TOBBO WEEPS.' : 'DONE! A PLEASURE, FRIEND!');
    audio.play('ui_buy');
    if (s >= 0.85) audio.play('perfect');
    this.fx.stop(0.14);
    this.fx.flash('#ffd04a', 0.2);
    this.fx.shake(4);
    this.fx.ring(288, 160, 90, '#ffd04a', 0.5);
    this.fx.ring(288, 160, 50, '#ffffff', 0.3);
    this.fx.burst(288, 160, 40, 160, ['#ffd04a', '#ffffff', '#8affb0'], { life: 1, grav: 120 });
    this.fx.word('DEAL!', 288, 124, '#ffd04a', 3, { pop: true, life: 1.5 });
    this.fx.word(s >= 0.85 ? 'ROBBERY!' : s >= 0.55 ? 'A GOOD PRICE' : s >= 0.25 ? 'FAIR-ISH' : 'FLEECED', 288, 146, s >= 0.85 ? '#8affb0' : s >= 0.55 ? '#c8e86a' : s >= 0.25 ? '#ffb04a' : '#ff5a4a', 2, { pop: true, life: 1.5 });
  }

  /** How good the price was: 1 at the floor he walked in with, a little over nothing at his ask. */
  private score() {
    if (this.value === null) return 0;
    return clamp(0.05 + 0.95 * ((this.ask - this.value) / this.span), 0.05, 1);
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  private readonly lx = 360;
  private readonly ly = 30;
  private readonly lh = 170;

  private ladderY(v: number) {
    return this.ly + this.lh - (v / this.ask) * this.lh;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    // walking away, the yard slides off and goes dim
    const away = this.walk > 0 ? Math.sin(Math.min(1, this.walk / 1.5) * Math.PI) : 0;
    ctx.save();
    ctx.translate(Math.round(away * 14), 0);
    this.yard(ctx, w, h, t);
    ctx.restore();
    if (away > 0) {
      ctx.fillStyle = `rgba(6,4,12,${away * 0.4})`;
      ctx.fillRect(0, 0, w, h);
    }
    this.bubble(ctx);
    this.part(ctx, t);
    this.ladder(ctx, t);
    this.buyerTrack(ctx, t);
    this.gauges(ctx, h, t);
    if (this.holding && this.holdT > 0.12) {
      const f = Math.min(1, this.holdT / WALK_HOLD);
      ctx.strokeStyle = '#f4ecd8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(240, 120, 14, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
      drawText(ctx, 'WALK AWAY...', 240, 140, '#f4ecd8', { align: 'center' });
    }
    if (this.last > 0 && !this.over) {
      const pulse = Math.sin(t * 12) > 0;
      drawText(ctx, `${Math.ceil(this.last)}`, 288, 92, pulse ? '#ffb04a' : '#ffd04a', { align: 'center', scale: 3 });
      drawText(ctx, this.purse >= this.price ? 'TAP TO TAKE IT' : "YOU CAN'T AFFORD IT", 288, 116, this.purse >= this.price ? '#f4ecd8' : '#ff7a6a', { align: 'center' });
    }
    ctx.restore();
    this.fx.drawSparks(ctx);
    for (const n of this.notes) this.note(ctx, n.x, n.y, n.life);
    this.fx.drawWords(ctx);
    vignette(ctx, w, h, 0.45);
    this.fx.drawFlash(ctx, w, h);
  }

  /** His line, typed out in a bubble; red when he's cross. */
  private bubble(ctx: CanvasRenderingContext2D) {
    const lines = wrap(this.line, 150);
    const bx = 10;
    const by = 14 - Math.round(this.hit * 2);
    const bh = lines.length * 10 + 8;
    ctx.fillStyle = DARK;
    ctx.fillRect(bx - 1, by - 1, 162, bh + 2);
    ctx.fillStyle = this.flush > 0.3 ? 'rgba(255,214,200,0.96)' : 'rgba(244,236,216,0.95)';
    ctx.fillRect(bx, by, 160, bh);
    ctx.fillRect(bx + 60, by + bh, 6, 5);
    let left = Math.floor(this.lineT * 90);
    lines.forEach((l, k) => {
      if (left > 0) drawText(ctx, l.slice(0, left), bx + 5, by + 5 + k * 10, this.flush > 0.3 ? '#a02020' : DARK, { shadow: false });
      left -= l.length + 1;
    });
  }

  /** The part, turning on its crate. */
  private part(ctx: CanvasRenderingContext2D, t: number) {
    if (!this.item) return;
    const tc = TIER_COLOR[tierOf(this.item)];
    ctx.fillStyle = 'rgba(10,7,16,0.72)';
    ctx.fillRect(244, 112, 88, 104);
    ctx.fillStyle = tc;
    ctx.fillRect(244, 112, 88, 1);
    glow(ctx, 288, 152, 44, tc, 0.22 + (this.value !== null ? 0.3 : 0));
    portraits.draw(ctx, this.item.id, 252, 116, 72, t);
    drawText(ctx, itemName(this.item), 288, 192, tc, { align: 'center' });
    drawText(ctx, tierOf(this.item).toUpperCase(), 288, 202, tc, { align: 'center' });
  }

  /** The price ladder: his ask at the top, his prices coming down, your offer coming up. */
  private ladder(ctx: CanvasRenderingContext2D, t: number) {
    const { lx: x, ly: y, lh: hh } = this;
    const at = (v: number) => Math.round(this.ladderY(v));
    ctx.fillStyle = 'rgba(10,7,16,0.7)';
    ctx.fillRect(x - 6, y - 8, 126, hh + 18);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x + 20, y, 3, hh);
    for (let v = 0; v <= this.ask; v += Math.max(5, Math.round(this.ask / 10 / 5) * 5)) ctx.fillRect(x + 17, at(v), 9, 1);
    // what you can afford
    if (this.purse < this.ask) {
      const py = at(this.purse);
      ctx.fillStyle = 'rgba(255,90,74,0.18)';
      ctx.fillRect(x + 14, y, 16, py - y);
      drawText(ctx, 'BROKE', x - 2, py - 9, '#ff7a6a');
    }
    for (const v of this.said) {
      ctx.fillStyle = 'rgba(255,208,74,0.35)';
      ctx.fillRect(x + 24, at(v), 8, 1);
    }
    // once it's over, where his floor was all along
    if (this.over) {
      const fy = at(this.floor);
      for (let k = 0; k < 110; k += 4) {
        ctx.fillStyle = '#8affb0';
        ctx.fillRect(x - 4 + k, fy, 2, 1);
      }
      drawText(ctx, `FLOOR ${this.floor}`, x + 112, fy + 3, '#8affb0', { align: 'right' });
    }
    // his price, sliding down as he gives way
    const hy = at(this.shown);
    glow(ctx, x + 30, hy, 14, '#ffd04a', 0.25);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x + 24, hy - 1, 14, 3);
    drawText(ctx, `TOBBO ${Math.round(this.shown)}`, x + 42, hy - 3, '#ffd04a');
    // your offer
    const oy = at(this.offer);
    const pulse = 0.6 + 0.4 * Math.sin(t * 8);
    glow(ctx, x + 12, oy, 12, '#8affe0', 0.3 * pulse);
    ctx.fillStyle = '#8affe0';
    ctx.fillRect(x + 4, oy - 1, 16, 3);
    drawText(ctx, `${this.offer}`, x + 2, oy + 4, '#8affe0');
    const label = this.offer >= this.price ? 'TAKE IT' : 'OFFER';
    if (Math.abs(oy - hy) > 8) drawText(ctx, label, x + 42, oy + 4, '#8affe0');
    else drawText(ctx, label, x + 42, oy + 10, '#8affe0');
  }

  /** The other buyer, walking along the top of the yard towards the part. */
  private buyerTrack(ctx: CanvasRenderingContext2D, t: number) {
    const x0 = 182;
    const x1 = 340;
    const y = 5;
    const f = this.last > 0 || this.lost ? 1 : Math.min(1, this.buyer);
    const hot = f > 0.7;
    ctx.fillStyle = 'rgba(10,7,16,0.7)';
    ctx.fillRect(x0 - 4, y - 3, x1 - x0 + 14, 14);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x0, y + 7, x1 - x0, 1);
    ctx.fillStyle = hot ? '#ff8a3a' : '#8a7a9a';
    ctx.fillRect(x0, y + 7, Math.round((x1 - x0) * f), 1);
    // the crate at the end
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(x1 + 1, y + 1, 7, 6);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x1 + 3, y + 3, 3, 2);
    // him: a hat, a coat, legs going
    const bx = Math.round(x0 + (x1 - x0 - 6) * f);
    const step = this.last > 0 || this.done > 0 ? 0 : Math.floor(t * 6) % 2;
    ctx.fillStyle = hot && Math.sin(t * 10) > 0 ? '#ff8a3a' : '#c8bcd8';
    ctx.fillRect(bx, y - 1, 5, 1);
    ctx.fillRect(bx + 1, y - 2, 3, 1);
    ctx.fillRect(bx + 1, y, 3, 2);
    ctx.fillRect(bx, y + 2, 5, 3);
    ctx.fillRect(bx + (step ? 0 : 1), y + 5, 1, 2);
    ctx.fillRect(bx + (step ? 4 : 3), y + 5, 1, 2);
    if (f < 0.7) drawText(ctx, 'BUYER', x0 - 6, y + 1, '#6a5e7a', { align: 'right' });
    else drawText(ctx, 'HURRY', x0 - 6, y + 1, Math.sin(t * 10) > 0 ? '#ff8a3a' : '#ffd04a', { align: 'right' });
  }

  /** Patience along the bottom, and at the easy levels, his mood spelled out beside it. */
  private gauges(ctx: CanvasRenderingContext2D, h: number, t: number) {
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(14, h - 28, 222, 16);
    drawText(ctx, 'PATIENCE', 20, h - 22, '#c8bcd8');
    const p = this.patience;
    const col = p > 0.5 ? '#8affb0' : p > 0.25 ? '#ffd04a' : '#ff5a4a';
    // what he just lost lingers white before it drains
    meter(ctx, 76, h - 22, 152, 6, this.shownPatience, '#f4ecd8');
    ctx.fillStyle = col;
    ctx.fillRect(76, h - 22, Math.round(152 * Math.max(0, p)), 6);
    if (p < 0.25 && !this.over && Math.sin(t * 10) > 0) glow(ctx, 76 + 152 * p, h - 19, 12, '#ff5a4a', 0.5);
    if (this.level > 2) return;
    // his mood, shown plainly: a needle between prickly and soft
    const mx = 244;
    const mw = 88;
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(mx - 4, h - 28, mw + 8, 16);
    const zone = (a: number, b: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(mx + Math.round(((a + 1) / 2) * mw), h - 21, Math.round(((b - a) / 2) * mw), 4);
    };
    zone(-1, PRICKLY, '#6a2a2a');
    zone(PRICKLY, SOFT, '#3a2e48');
    zone(SOFT, 1, '#2a6a4a');
    const nx = mx + Math.round(((this.mood + 1) / 2) * mw);
    const mc = this.mood > SOFT ? '#8affb0' : this.mood < PRICKLY ? '#ff7a6a' : '#c8bcd8';
    ctx.fillStyle = mc;
    ctx.fillRect(nx - 1, h - 24, 3, 9);
    if (this.mood > SOFT) glow(ctx, nx, h - 19, 10, '#8affb0', 0.5);
  }

  /** A hummed note, drifting up off his snout. */
  private note(ctx: CanvasRenderingContext2D, x: number, y: number, life: number) {
    ctx.globalAlpha = Math.min(1, life * 2) * (0.35 + 0.65 * this.tells);
    ctx.fillStyle = '#c8ffd8';
    const nx = Math.round(x);
    const ny = Math.round(y);
    ctx.fillRect(nx, ny + 3, 3, 2);
    ctx.fillRect(nx + 2, ny - 2, 1, 5);
    ctx.fillRect(nx + 3, ny - 2, 2, 1);
    ctx.globalAlpha = 1;
  }

  /**
   * Tobbo in his yard: the painted scene, bobbing as he hovers, with his wings drawn over it as a
   * blur that goes slow and wide when he's soft, fast and pink when he's prickly.
   */
  private yard(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#1a1018';
    ctx.fillRect(-10, -10, w + 20, h + 20);
    const img = artImage('tobbo');
    // the crop of the painting that holds him, and where it lands
    const [sx, sy, sw, sh] = [30, 30, 360, 270];
    const k = h / sh;
    const soft = (this.mood + 1) / 2;
    const bob = Math.sin(t * (2 + (1 - soft) * 3 * this.tells)) * (1.5 + soft * 1.5) - this.lean * 3 + this.hit * 2;
    const map = (x: number, y: number) => [(x - sx) * k, (y - sy) * k + bob] as const;
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy - 8, sw, sh + 16, 0, -8 * k + bob, sw * k, (sh + 16) * k);
    }
    // insulted: he goes red in the face
    const cross = Math.max(this.flush, Math.max(0, -this.mood - 0.3) * 0.5 * this.tells);
    if (cross > 0.02) {
      const [fx, fy] = map(215, 115);
      glow(ctx, fx, fy, 70, '#ff4a3a', cross * 0.45);
    }
    if (soft > 0.7) {
      const [fx, fy] = map(215, 115);
      glow(ctx, fx, fy, 60, '#8affb0', (soft - 0.7) * 0.4 * this.tells);
    }
    // the wings: a blur, slow when he's soft, a buzz when he's not
    const wind = Math.max(this.flush, 1 - soft);
    const rate = 18 + wind * 80 * this.tells + (1 - this.tells) * 30;
    const span = 1 + (soft * 0.5 + this.flush * 0.5) * (0.5 + 0.5 * this.tells);
    for (const [wx, wy, ang, s] of [
      [125, 145, 0.25, -1],
      [272, 102, -0.35, 1],
    ] as const) {
      const [x, y] = map(wx, wy);
      for (let n = 0; n < 4; n++) {
        const a = Math.sin(t * rate + n * 1.7) * 0.35 * span;
        ctx.globalAlpha = 0.1 + wind * 0.12;
        ctx.fillStyle = cross > 0.3 ? '#ffb0a0' : '#e8f6ff';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang + a * s);
        ctx.beginPath();
        ctx.ellipse(s * 22 * span, 0, 30 * span, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // fade the right of the yard into the dark, for the price ladder
    const fade = ctx.createLinearGradient(220, 0, 360, 0);
    fade.addColorStop(0, 'rgba(14,10,22,0)');
    fade.addColorStop(1, 'rgba(14,10,22,0.92)');
    ctx.fillStyle = fade;
    ctx.fillRect(220, -10, w - 210, h + 20);
  }
}
