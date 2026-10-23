import { audio } from '../../audio';
import { drawText, textWidth, wrap } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { TIER_COLOR } from '../../ui/widgets';
import { itemName, tierOf, type Item } from '../../game/loot';
import { portraits } from '../../view/portraits';
import { clamp, pick, rng, TAU, type Rng } from '../../util';
import type { Setup } from '../../sim/events';
import { artImage } from '../art';
import './haggle-sound';
import { byLevel, Fx, glow, hardness, ticked, vignette, type Minigame, type Pad } from './common';
import { drawSprite, type SpriteOpts } from './sprites';

const INSULTED = ['ZZA?! YOU INSULT TOBBO!', 'BOH! TOBBO HAS CHILDREN!', 'FOR THAT? TOBBO WOULD SOONER EAT IT!', 'WAHH! AN INSULT TO THE METAL!', 'ZZIMBO! GET OUT! NO, WAIT.'];
const CHEEKY = ['HEH. CHEEKY. NO.', 'OH-HO, A FUNNY ONE. NO.', 'TOBBO LIKES YOU. STILL NO.'];
const CLOSE = ['HMM. HMM-HMM. FOR YOU:', 'TOBBO IS LOSING MONEY. FINE:', 'OH-BOH-BOH. YOU ARE HARD. SAY', 'TOBBO WEEPS. BUT:', 'ZZA. ONLY FOR A FRIEND:'];
const PUSHED = ['YOU PUSH TOBBO NOW? NOW?!', 'ZZT. BAD TIME, FRIEND. MAYBE', 'TOBBO IS BUSY BEING ANGRY.', 'BOH! ASK NICER. ASK LATER.'];
const FIRM = ['TOBBO DOES NOT MOVE. NOT ONE SCRAP MORE.', 'THAT IS THE PRICE. TOBBO HAS A FAMILY.'];
const CHASE = ['WAIT! WAIT WAIT WAIT! FOR YOU:', 'ZZA! COME BACK! TOBBO WAS JOKING!', 'NO NO NO, FRIEND! SIT! SAY'];
const LET_GO = ['GO THEN! GO! TOBBO HAS OTHER FRIENDS!', 'BOH. WALK. TOBBO DOES NOT CHASE.'];

/** How long the button has to be held before you turn and walk. */
const WALK_HOLD = 0.45;
/** The notes he hums, and the scale a streak of soft spots climbs, in semitones. */
const HUM = [0, 2, 4, 7, 9, 12];
/** Tobbo's mood counts as soft above this, prickly below the other. */
const SOFT = 0.4;
const PRICKLY = -0.3;

/** A bit of our own: a coin knocked flying, steam off his head, dust off the counter. */
interface Bit {
  kind: 'coin' | 'steam' | 'dust';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
}

/**
 * Haggle with Tobbo Grisk: he names a price, you name yours, he comes down, or he doesn't. Under
 * his asking price is the least he'll take, and you can't see it. What you can see is his mood,
 * which swings on its own rhythm, and which you can hear in his wings too: when he's soft they go
 * slow and he hums, and an offer then gets a real step down; when he's prickly they buzz, and an
 * offer then costs patience and barely moves him. Go under his floor and it's an insult: patience burns, and his floor climbs.
 * Catch him soft and his floor sinks a little. Another buyer is eyeing the part, so there's no
 * haggling forever: when he reaches it, Tobbo calls a last price. Holding the button walks away,
 * a bluff: time it while he's soft and still has room, and he chases you down with a better price;
 * time it badly and he lets you go. Higher levels: less patience, a quicker buyer, a moodier
 * rhythm, and soft spots that show for less of each swing; past tricky, the needle that spells
 * his mood out is gone and you read him by his wings alone.
 */
export class Haggle implements Minigame {
  readonly title = 'HAGGLE';
  readonly how = 'UP/DOWN: YOUR OFFER, LEFT/RIGHT: TENS. TAP THE BUTTON TO OFFER, HOLD IT TO WALK AWAY. OFFER WHEN HIS WINGS SLOW AND HE HUMS, NEVER WHEN HE BUZZES.';
  result: number | null = null;
  /** The price you got him to; null if he shut the gate, 0 if the other buyer got it. */
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
  private walkMood = 0;
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
  /** His mood as it shows (what you can read off him), and that eased for drawing. */
  private look: 'soft' | 'prickly' | 'even' = 'even';
  private lookV = 0;
  /** The prompts already shown, each once, the first time it matters. */
  private taught = new Set<string>();
  private prompt = '';
  private promptT = 0;
  private promptC = '#f4ecd8';
  private noteT = 0;
  private wingT = 0;
  private fx = new Fx();
  private r: Rng;
  private done = 0;
  private shut = false;
  private lost = false;
  /** Looks only: his wingbeat, the coins' slap, the price tag's swing, the intro and the finish. */
  private wingPhase = 0;
  private slapT = 0;
  private spinT = 0;
  private tagX = 0;
  private tagV = 0;
  private lastPrice = 0;
  private steamT = 0;
  private bits: Bit[] = [];
  private outT = 0;
  private t0 = -1;
  private vr: Rng;

  constructor(
    private level: number,
    seed: number,
    s: Setup,
  ) {
    this.r = rng(seed);
    this.vr = rng(seed ^ 0x7a7a);
    const d = (this.d = hardness(level));
    this.item = s.item ?? null;
    this.ask = s.ask ?? 120;
    this.floor = s.floor ?? Math.round(this.ask * 0.5);
    this.eff = this.floor;
    this.purse = s.purse ?? 999;
    this.price = this.shown = this.lastPrice = this.ask;
    this.offer = Math.min(this.purse, Math.round(this.ask * 0.7));
    this.period = byLevel(d, 4, 3.4);
    this.wobble = byLevel(d, 0.08, 0.3);
    this.tells = byLevel(d, 1, 0.4);
    this.limit = byLevel(d, 34, 22);
    this.lastLimit = byLevel(d, 4, 2.6);
    // he starts somewhere on his swing, never right in a soft spot
    this.phase = Math.PI * (1 + this.r() * 0.8);
    this.say(`${pick(this.r, ['FOR YOU, FRIEND', 'A BARGAIN', 'PRACTICALLY FREE'])}: ${this.ask}.`);
  }

  /** A prompt, once, the first time something matters. */
  private teach(key: string, text: string, color = '#f4ecd8') {
    if (this.taught.has(key)) return;
    this.taught.add(key);
    this.prompt = text;
    this.promptT = 2.4;
    this.promptC = color;
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
    out.push(['PRICE', this.lost ? 'SOLD TO THE OTHER ONE' : this.value === null ? (this.shut ? 'GATE SHUT' : 'NO DEAL') : `${this.value} (ASKED ${this.ask})`]);
    out.push(['HIS FLOOR', `${this.floor}`]);
    out.push(['OFFERS', `${this.offers}, ${this.softs} SOFT`]);
    if (this.insults) out.push(['INSULTS', `${this.insults}`]);
    else out.push(['PATIENCE LEFT', `${Math.round(this.patience * 100)}%`]);
    return out;
  }

  update(dt: number, pad: Pad) {
    if (this.fx.frozen(dt)) return;
    this.lineT += dt;
    this.promptT -= dt;
    this.flush = Math.max(0, this.flush - dt * 0.8);
    this.hit = Math.max(0, this.hit - dt * 3);
    this.lean += (0 - this.lean) * Math.min(1, dt * 4);
    this.shown += (this.price - this.shown) * Math.min(1, dt * 7);
    this.shownPatience += (this.patience - this.shownPatience) * Math.min(1, dt * 2.5);
    this.swing(dt);
    this.looks(dt);
    if (this.result !== null) return;
    // his wings, always going: you can hear his mood as well as see it
    this.wingT -= dt;
    if (this.wingT <= 0) {
      this.wingT = 0.3;
      const cross = this.flush > 0.5 || this.look === 'prickly';
      audio.play(cross ? 'mini_haggle_buzz' : this.look === 'soft' ? 'mini_haggle_hum' : 'mini_haggle_whirr', { vol: cross ? 0.6 + this.flush * 0.3 : 0.7, pitch: 1 + this.flush * 0.15 });
    }
    if (this.done > 0) {
      this.done -= dt;
      if (this.done <= 0) {
        this.result = this.value === null ? 0 : this.score();
        if (this.lost) this.value = 0;
      }
      return;
    }
    this.time += dt;
    if (this.walk > 0) return this.walking(dt);
    if (this.last > 0) return this.lastCall(dt, pad);
    // the other buyer comes closer
    const was = this.buyer;
    this.buyer += dt / this.limit;
    if (was < 0.7 && this.buyer >= 0.7) {
      this.teach('buyer', 'SOMEONE ELSE WANTS IT: HURRY', '#ffb04a');
      audio.play('mini_haggle_buyer', { vol: 0.8 });
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

  /** What moves for the eye only: wings, coins, the tag, steam, the finish. */
  private looks(dt: number) {
    // his wings: slow and wide when he's soft, a buzz when he's cross
    const cross = Math.max(this.flush, this.look === 'prickly' ? 1 : 0);
    this.wingPhase += dt * (this.look === 'soft' ? 2.2 : 6.5) * (1 + cross * 1.6);
    this.slapT = Math.max(0, this.slapT - dt * 3);
    this.spinT = Math.max(0, this.spinT - dt);
    // the price tag swings when his price moves
    if (this.price !== this.lastPrice) {
      this.tagV += Math.sign(this.lastPrice - this.price) * 40 + 20;
      this.lastPrice = this.price;
    }
    this.tagV += (-this.tagX * 120 - this.tagV * 6) * dt;
    this.tagX += this.tagV * dt;
    // steam off his head when he's cross
    this.steamT -= dt;
    if (cross > 0.45 && this.steamT <= 0 && this.result === null) {
      this.steamT = 0.12;
      const [x, y] = this.vr() < 0.5 ? [160, 40] : [186, 34];
      this.bits.push({ kind: 'steam', x: x + (this.vr() - 0.5) * 6, y, vx: (this.vr() - 0.5) * 14, vy: -26 - this.vr() * 14, life: 0.8, max: 0.8 });
    }
    for (const b of this.bits) {
      b.life -= dt;
      b.vy += (b.kind === 'coin' ? 420 : b.kind === 'dust' ? -10 : -6) * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // coins bounce on the counter
      if (b.kind === 'coin' && b.y > 200 && b.vy > 0 && b.x > 232 && b.x < 352) {
        b.y = 200;
        b.vy *= -0.4;
        b.vx *= 0.6;
      }
    }
    this.bits = this.bits.filter((b) => b.life > 0);
    if (this.done > 0 || this.result !== null) this.outT += dt;
  }

  /** His mood turning: a swing that wobbles off the beat more the harder the level. */
  private swing(dt: number) {
    const speed = (TAU / this.period) * (1 + this.wobble * Math.sin(this.time * 0.9 + this.floor));
    this.phase += dt * speed;
    const bias = byLevel(this.d, -0.08, 0.04);
    const m = Math.sin(this.phase) * (1 - this.wobble * 0.3) + this.wobble * 0.3 * Math.sin(this.phase * 2.3 + 1) - bias;
    this.mood = clamp(m, -1, 1);
    // what shows: at the harder levels only the deep end of each swing shows at all, so the
    // soft spots you can see are shorter (but he never shows soft when he isn't)
    const was = this.look;
    this.look = this.mood > SOFT + (1 - this.tells) * 0.45 ? 'soft' : this.mood < PRICKLY - (1 - this.tells) * 0.2 ? 'prickly' : 'even';
    const goal = this.look === 'soft' ? 1 : this.look === 'prickly' ? -1 : 0;
    this.lookV += (goal - this.lookV) * Math.min(1, dt * 9);
    if (!this.over && this.look !== was) {
      if (this.look === 'soft') this.teach('soft', "HE'S HUMMING: OFFER NOW", '#8affb0');
      if (this.look === 'prickly') this.teach('prickly', 'WINGS BUZZING: WAIT HIM OUT', '#ff7a6a');
    }
    // humming, when he's soft: little notes off his snout
    this.noteT -= dt;
    if (this.look === 'soft' && this.noteT <= 0 && !this.over) {
      this.noteT = 0.28;
      this.notes.push({ x: 156 + this.r() * 14, y: 72, life: 1.2 });
      audio.play('mini_haggle_note', { pitch: 2 ** (HUM[Math.floor(this.r() * HUM.length)] / 12), vol: 0.7 });
    }
    for (const n of this.notes) {
      n.life -= dt;
      n.y -= dt * 18;
      n.x += Math.sin(n.life * 6) * dt * 10;
    }
    this.notes = this.notes.filter((n) => n.life > 0);
    // buzzing, when he's prickly: sparks off the wings
    if (this.look === 'prickly' && !this.over && this.r() < dt * 16) {
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
    if (this.offer !== was) this.spinT = 0.25;
    if (this.offer !== was) audio.play('mini_haggle_dial', { pitch: 0.7 + (this.offer / this.ask) * 0.8, vol: 0.7 });
  }

  private moodNow(): 'soft' | 'prickly' | 'even' {
    return this.mood > SOFT ? 'soft' : this.mood < PRICKLY ? 'prickly' : 'even';
  }

  /** You name your price. */
  private make() {
    const o = this.offer;
    this.lean = 1;
    // you slap your scrap down on the counter
    this.slapT = 1;
    for (let k = 0; k < 5; k++) this.bits.push({ kind: 'dust', x: this.pileX + (this.vr() - 0.5) * 16, y: 199, vx: (this.vr() - 0.5) * 40, vy: -10 - this.vr() * 10, life: 0.5, max: 0.5 });
    if (o >= this.price) return this.deal(this.price);
    this.offers++;
    audio.play('mini_haggle_offer', { pitch: 0.9 + (o / this.ask) * 0.3 });
    const mood = this.moodNow();
    const base = byLevel(this.d, 0.14, 0.26);
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
        this.teach('insult', 'TOO LOW: NOW HIS FLOOR IS HIGHER', '#ff7a6a');
      }
      this.streak = 0;
      this.flush = cheeky ? 0.4 : 1;
      this.hit = 1;
      // he sweeps some of your coins off the counter
      for (let k = 0; k < (cheeky ? 1 : 3); k++)
        this.bits.push({ kind: 'coin', x: this.pileX, y: 190 - k * 2, vx: 40 + this.vr() * 90, vy: -120 - this.vr() * 80, life: 1.2, max: 1.2 });
      this.fx.shake(cheeky ? 2 : 3 + how * 10);
      this.fx.burst(150, 100, cheeky ? 6 : 16, 90, ['#ff5a4a', '#ffd04a']);
      if (!cheeky && how > 0.25) {
        this.fx.stop(0.08);
        this.fx.flash('#ff4a3a', 0.12);
      }
      this.fx.word(cheeky ? 'CHEEKY' : 'INSULT!', 150, 64, cheeky ? '#ffb04a' : '#ff5a4a', cheeky ? 1 : 2, { pop: true });
      audio.play(cheeky ? 'mini_haggle_cheeky' : 'mini_haggle_insult', { vol: cheeky ? 0.8 : 0.6 + how * 0.6 });
      if (this.patience > 0) this.say(cheeky ? pick(this.r, CHEEKY) : `${pick(this.r, INSULTED)} ${this.price}.`);
    } else {
      // he gives way readily from his ask, and grudgingly near his floor
      const room = clamp((this.price - this.eff) / this.span, 0, 1);
      const k = (mood === 'soft' ? 0.33 + Math.min(3, this.streak) * 0.03 : mood === 'even' ? 0.13 : 0.03) * byLevel(this.d, 1, 0.66) * (0.55 + 0.45 * room);
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
        // the streak climbs a scale
        audio.play('mini_haggle_soft', { pitch: 2 ** (HUM[Math.min(HUM.length - 1, this.streak - 1)] / 12) });
      } else if (mood === 'prickly') {
        this.streak = 0;
        this.eff += this.span * 0.03;
        this.flush = 0.5;
        this.fx.shake(2);
        this.fx.word('BAD MOMENT', 150, 64, '#ff8a5a', 1, { pop: true });
        audio.play('mini_haggle_pushed', { vol: 0.8 });
      } else {
        this.streak = 0;
      }
      if (this.price - this.eff < 1.5 || this.price === before) {
        this.price = Math.max(Math.ceil(this.eff), Math.min(this.price, before));
        this.say(`${pick(this.r, FIRM)} ${this.price}.`);
        audio.play('mini_haggle_firm', { vol: 0.8 });
      } else this.say(`${pick(this.r, mood === 'prickly' ? PUSHED : CLOSE)} ${this.price}.`);
      if (this.price < before) this.fx.word(`-${before - this.price}`, 420, Math.round(this.ladderY(this.price)) - 8, '#ffd04a', 1, { pop: true });
    }
    this.eff = Math.min(this.eff, this.price);
    this.said.push(this.price);
    this.offer = Math.min(this.offer, this.top);
    if (this.patience <= 0) this.slam();
    else if (this.offers >= 2 && !this.bluffs) this.teach('walk', 'HOLD THE BUTTON TO WALK AWAY: A BLUFF', '#ffd04a');
  }

  private slam() {
    this.patience = 0;
    this.shut = true;
    this.done = 1.6;
    this.say("OUT! OUT OF TOBBO'S YARD!");
    audio.play('mini_haggle_slam');
    this.fx.stop(0.12);
    this.fx.shake(9, 0.6);
    this.fx.flash('#ff4a3a', 0.25);
    this.fx.word('GATE SHUT', 240, 110, '#ff5a4a', 3, { pop: true, life: 1.5 });
  }

  /** A hold of the button: you turn and walk. He chases you, or he doesn't. */
  private startWalk() {
    this.walk = 0.001;
    this.walkMood = this.mood;
    this.walkSettled = false;
    this.streak = 0;
    this.say('...');
    audio.play('mini_haggle_step', { vol: 0.8 });
  }

  private walking(dt: number) {
    const before = this.walk;
    this.walk += dt;
    if (Math.floor(before * 3) !== Math.floor(this.walk * 3)) audio.play('mini_haggle_step', { vol: 0.7, pitch: 0.9 + this.r() * 0.2 });
    if (!this.walkSettled && this.walk > 0.8) {
      this.walkSettled = true;
      const room = (this.price - this.eff) / this.span;
      // what counts is how he was when you turned your back
      const want = this.walkMood + 0.5 * room - 0.55 * this.bluffs - 0.15 * this.d - 0.15 + (this.r() - 0.5) * 0.15;
      this.bluffs++;
      if (want > 0) {
        const before = this.price;
        this.price = Math.max(Math.ceil(this.eff), Math.round(this.eff + (this.price - this.eff) * byLevel(this.d, 0.5, 0.45)));
        this.eff = Math.max(this.floor - this.span * 0.1, this.eff - this.span * 0.04);
        this.patience -= 0.05;
        this.said.push(this.price);
        this.say(`${pick(this.r, CHASE)} ${this.price}!`);
        this.fx.stop(0.1);
        this.fx.ring(150, 96, 70, '#ffd04a', 0.5);
        this.fx.word('HE CHASES!', 240, 90, '#ffd04a', 2, { pop: true, life: 1.2 });
        if (this.price < before) this.fx.word(`-${before - this.price}`, 420, Math.round(this.ladderY(this.price)) - 8, '#ffd04a', 1, { pop: true });
        audio.play('mini_haggle_chase');
      } else {
        this.patience -= 0.3;
        this.eff += this.span * 0.08;
        this.buyer = Math.min(0.97, this.buyer + 0.15);
        this.eff = Math.min(this.eff, this.price);
        this.say(pick(this.r, LET_GO));
        this.flush = 0.8;
        this.fx.shake(4);
        this.fx.word('CALLED YOUR BLUFF', 240, 90, '#ff5a4a', 2, { pop: true, life: 1.2 });
        audio.play('mini_haggle_letgo');
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
    audio.play('mini_haggle_lastcall');
    this.fx.stop(0.08);
    this.fx.shake(4);
    this.fx.word('LAST CALL', 240, 100, '#ffb04a', 3, { pop: true, life: 1.3 });
  }

  private lastCall(dt: number, pad: Pad) {
    const before = this.last;
    this.last -= dt;
    if (ticked(before, this.last, 4)) audio.play('mini_haggle_tick', { pitch: this.last < 1 ? 1.5 : 1.2 });
    if (pad.press && this.purse >= this.price) return this.deal(this.price);
    if (pad.press) audio.play('ui_error');
    if (this.last <= 0) {
      this.last = 0;
      this.lost = true;
      this.done = 1.6;
      this.say('SOLD! TO THE ONE WITH THE HAT! BOH.');
      audio.play('mini_haggle_sold');
      this.fx.word('GONE', 240, 110, '#ff5a4a', 3, { pop: true, life: 1.5 });
    }
  }

  private deal(at: number, his = false) {
    this.value = at;
    this.last = 0;
    this.done = 1.6;
    const s = this.score();
    this.say(his ? 'ZZA... FINE. YOURS. TOBBO IS TOO KIND.' : at <= this.floor + 2 ? 'ROBBERY. DONE. TOBBO WEEPS.' : 'DONE! A PLEASURE, FRIEND!');
    audio.play('mini_haggle_deal', { pitch: s >= 0.85 ? 2 ** (4 / 12) : s >= 0.55 ? 2 ** (2 / 12) : 1 });
    this.fx.stop(0.14);
    this.fx.flash('#ffd04a', 0.2);
    this.fx.shake(4);
    this.fx.ring(this.cx, 150, 90, '#ffd04a', 0.5);
    this.fx.ring(this.cx, 150, 50, '#ffffff', 0.3);
    this.fx.burst(this.cx, 150, 40, 160, ['#ffd04a', '#ffffff', '#8affb0'], { life: 1, grav: 120 });
    this.fx.word('DEAL!', 150, 140, '#ffd04a', 3, { pop: true, life: 1.5 });
    this.fx.word(s >= 0.85 ? 'ROBBERY!' : s >= 0.55 ? 'A GOOD PRICE' : s >= 0.25 ? 'FAIR-ISH' : 'FLEECED', 150, 162, s >= 0.85 ? '#8affb0' : s >= 0.55 ? '#c8e86a' : s >= 0.25 ? '#ffb04a' : '#ff5a4a', 2, { pop: true, life: 1.5 });
  }

  /** How good the price was: 1 at the floor he walked in with, a little over nothing at his ask. */
  private score() {
    if (this.value === null) return 0;
    return clamp(0.05 + 0.95 * ((this.ask - this.value) / this.span), 0.05, 1);
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  private readonly lx = 374;
  private readonly ly = 34;
  private readonly lh = 168;
  /** Where your scrap sits on the counter, and where the part turns. */
  private readonly pileX = 330;
  private readonly cx = 283;

  private ladderY(v: number) {
    return this.ly + this.lh - (v / this.ask) * this.lh;
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    // the countdown draws before the first update: the yard comes up out of the dark
    if (this.t0 < 0) this.t0 = t;
    const intro = this.time > 0 || this.over ? 1 : clamp((t - this.t0) / 1.2, 0, 1);
    const e = 1 - (1 - intro) ** 3;
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    // walking away, the yard slides off and goes dim
    const away = this.walk > 0 ? Math.sin(Math.min(1, this.walk / 1.5) * Math.PI) : 0;
    ctx.save();
    ctx.translate(Math.round(away * 14), 0);
    this.yard(ctx, w, h, t, e);
    ctx.restore();
    if (away > 0) {
      ctx.fillStyle = `rgba(6,4,12,${away * 0.4})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.translate(0, Math.round((1 - e) * 70));
    this.counter(ctx, t);
    ctx.restore();
    this.drawBits(ctx);
    if (this.shut) this.gate(ctx, w, h, t);
    this.bubble(ctx, e);
    ctx.save();
    ctx.translate(Math.round((1 - e) * 140), 0);
    this.ladder(ctx, t);
    ctx.restore();
    ctx.save();
    ctx.translate(0, -Math.round((1 - e) * 40));
    this.buyerTrack(ctx, t);
    ctx.restore();
    if (this.promptT > 0 && !this.over) {
      ctx.globalAlpha = Math.min(1, this.promptT * 3);
      this.panel(ctx, 8, h - 42, 218, 15);
      drawText(ctx, this.prompt, 117, h - 38, this.promptC, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(0, Math.round((1 - e) * 30));
    this.gauges(ctx, h, t);
    ctx.restore();
    if (this.holding && this.holdT > 0.12) {
      const f = Math.min(1, this.holdT / WALK_HOLD);
      this.panel(ctx, 112, 92, 74, 44);
      ctx.strokeStyle = '#3a2e48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(149, 108, 9, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#f4ecd8';
      ctx.beginPath();
      ctx.arc(149, 108, 9, -Math.PI / 2, -Math.PI / 2 + TAU * f);
      ctx.stroke();
      drawText(ctx, 'WALK AWAY...', 149, 123, '#f4ecd8', { align: 'center' });
    }
    if (this.last > 0 && !this.over) {
      const pulse = Math.sin(t * 12) > 0;
      this.panel(ctx, this.cx - 60, 46, 120, 34);
      drawText(ctx, `${Math.ceil(this.last)}`, this.cx, 49, pulse ? '#ffb04a' : '#ffd04a', { align: 'center', scale: 2 });
      drawText(ctx, this.purse >= this.price ? 'TAP TO TAKE IT' : "YOU CAN'T AFFORD IT", this.cx, 69, this.purse >= this.price ? '#f4ecd8' : '#ff7a6a', { align: 'center' });
    }
    ctx.restore();
    this.fx.drawSparks(ctx);
    for (const n of this.notes) this.note(ctx, n.x, n.y, n.life);
    this.fx.drawWords(ctx);
    vignette(ctx, w, h, 0.45);
    this.fx.drawFlash(ctx, w, h);
  }

  /** A riveted dark panel, like the rest of the minigames' HUD. */
  private panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.fillStyle = 'rgba(14,9,16,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#4a3428';
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);
    ctx.fillStyle = '#6a4a38';
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = '#c89a48';
    for (const [rx, ry] of [
      [x + 2, y + 2],
      [x + w - 3, y + 2],
      [x + 2, y + h - 3],
      [x + w - 3, y + h - 3],
    ])
      ctx.fillRect(rx, ry, 1, 1);
  }

  /** A sprite again on top, washed with a colour (drawn at the current transform). */
  private tint(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, o: SpriteOpts, color: string, a: number) {
    if (a <= 0 || typeof document === 'undefined') return;
    if (!tintCanvas) {
      tintCanvas = document.createElement('canvas');
      tintCanvas.width = tintCanvas.height = 200;
    }
    const g = tintCanvas.getContext('2d');
    if (!g) return;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, 200, 200);
    if (!drawSprite(g, 'haggle', name, 100, 100, { ...o, alpha: 1, fallback: undefined })) return;
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = Math.min(1, a);
    g.fillStyle = color;
    g.fillRect(0, 0, 200, 200);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(tintCanvas, Math.round(x) - 100, Math.round(y) - 100);
    ctx.restore();
  }

  /** His line, typed out in a bubble; red when he's cross. */
  private bubble(ctx: CanvasRenderingContext2D, e: number) {
    if (e < 0.6) return;
    const lines = wrap(this.line, 150);
    const bx = 10;
    const by = 14 - Math.round(this.hit * 2);
    const bh = lines.length * 10 + 8;
    const cross = this.flush > 0.3;
    ctx.globalAlpha = Math.min(1, (e - 0.6) * 4);
    ctx.fillStyle = DARK;
    ctx.fillRect(bx - 1, by - 1, 162, bh + 2);
    ctx.fillStyle = cross ? 'rgba(255,214,200,0.96)' : 'rgba(244,236,216,0.95)';
    ctx.fillRect(bx, by, 160, bh);
    ctx.fillStyle = cross ? 'rgba(200,120,100,0.5)' : 'rgba(200,180,140,0.5)';
    ctx.fillRect(bx, by + bh - 1, 160, 1);
    // the tail, towards his mouth
    ctx.fillStyle = DARK;
    ctx.fillRect(bx + 99, by + bh, 8, 6);
    ctx.fillStyle = cross ? 'rgba(255,214,200,0.96)' : 'rgba(244,236,216,0.95)';
    ctx.fillRect(bx + 100, by + bh, 6, 3);
    ctx.fillRect(bx + 102, by + bh + 3, 3, 2);
    let left = Math.floor(this.lineT * 90);
    lines.forEach((l, k) => {
      if (left > 0) drawText(ctx, l.slice(0, left), bx + 5, by + 5 + k * 10, cross ? '#a02020' : DARK, { shadow: false });
      left -= l.length + 1;
    });
    ctx.globalAlpha = 1;
  }

  /**
   * The counter in front of him: the part turning on its brass turntable, your scrap stacked at
   * the end, the part's name on a card. On a deal the part comes off to you and your scrap goes
   * to him; lose it, and it goes up to the other buyer.
   */
  private counter(ctx: CanvasRenderingContext2D, t: number) {
    const cx = this.cx;
    const won = this.value !== null && !this.lost && this.over;
    const p = this.over ? clamp(this.outT / 1.1, 0, 1) : 0;
    drawSprite(ctx, 'haggle', 'counter', cx, 222, {
      fallback: () => {
        ctx.fillStyle = '#5a3a22';
        ctx.fillRect(cx - 64, 186, 128, 46);
      },
    });
    // the lamp on it, alive
    glow(ctx, cx - 50, 187, 16 + Math.sin(t * 9) * 1.5, '#ffb04a', 0.45);
    drawSprite(ctx, 'haggle', 'turntable', cx, 199, { clip: 'spin', frame: Math.floor(((t % 6) / 6) * 12) });
    // the part on it, under a lamp in its tier's colour
    if (this.item && !(this.lost && p >= 1)) {
      const tc = TIER_COLOR[tierOf(this.item)];
      let ix = cx;
      let iy = 160;
      let k = 1;
      if (won) {
        // handed over: it lifts off and comes to you
        const q = p * p * (3 - 2 * p);
        iy -= q * 36;
        k = 1 + q * 0.6;
        this.rays(ctx, ix, iy, t, q, tc);
      } else if (this.lost) {
        // up to the other buyer, at the top of the yard
        const q = p * p;
        ix += (334 - ix) * q;
        iy += (18 - iy) * q;
        k = 1 - q * 0.75;
      }
      ctx.fillStyle = 'rgba(10,6,4,0.35)';
      ctx.beginPath();
      ctx.ellipse(cx, 193, 18, 4, 0, 0, TAU);
      ctx.fill();
      glow(ctx, ix, iy, 40, tc, 0.22 + (won ? 0.3 : 0));
      ctx.save();
      ctx.translate(ix, iy);
      ctx.scale(k, k);
      ctx.translate(-28, -28);
      this.portrait(ctx, this.item.id, t);
      ctx.restore();
      // its name on a card hung on the counter's front
      const name = itemName(this.item);
      const cw = Math.max(textWidth(name), textWidth(tierOf(this.item).toUpperCase())) + 10;
      ctx.fillStyle = DARK;
      ctx.fillRect(Math.round(cx - cw / 2) - 1, 205, cw + 2, 22);
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(Math.round(cx - cw / 2), 206, cw, 20);
      ctx.fillStyle = tc;
      ctx.fillRect(Math.round(cx - cw / 2), 206, cw, 2);
      drawText(ctx, name, cx, 210, '#2a1a12', { align: 'center', shadow: false });
      drawText(ctx, tierOf(this.item).toUpperCase(), cx, 218, '#6a5040', { align: 'center', shadow: false });
    }
    // your scrap: a stack as tall as your offer, slapped down when you make it
    const n = clamp(Math.round((this.offer / this.ask) * 12), 1, 12);
    const slide = won ? p * p * 130 : 0;
    const jump = Math.sin(this.slapT * Math.PI) * 3;
    for (let k = 0; k < n; k++) {
      const x = this.pileX - slide + (k % 2) - (k % 3 === 0 ? 1 : 0);
      const y = 201 - k * 2 - Math.round(jump * (k / n));
      drawSprite(ctx, 'haggle', 'coin_flat', x, y, { alpha: won ? 1 - p : 1 });
    }
    // the one you just slapped down, landing on top
    if (this.slapT > 0.5) {
      const f = (this.slapT - 0.5) * 2;
      drawSprite(ctx, 'haggle', 'coin', this.pileX, 199 - n * 2 - Math.round(f * f * 40), { clip: 'spin', t: t * 2 });
    }
  }

  /** The part's turning portrait, lifted off its square backdrop so it stands on the turntable. */
  private portrait(ctx: CanvasRenderingContext2D, id: string, t: number) {
    if (typeof document === 'undefined') return;
    if (!partCanvas) {
      partCanvas = document.createElement('canvas');
      partCanvas.width = partCanvas.height = 56;
    }
    const g = partCanvas.getContext('2d', { willReadFrequently: true });
    if (!g) return;
    g.clearRect(0, 0, 56, 56);
    if (!portraits.draw(g, id, 0, 0, 56, t)) return;
    const img = g.getImageData(0, 0, 56, 56);
    const d = img.data;
    const [r0, g0, b0] = [d[0], d[1], d[2]];
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 20) d[i + 3] = 0;
    g.putImageData(img, 0, 0);
    ctx.drawImage(partCanvas, 0, 0);
  }

  /** Light off a part that's yours now. */
  private rays(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, q: number, color: string) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.18 * q;
    ctx.fillStyle = color;
    for (let k = 0; k < 8; k++) {
      const a = t * 0.6 + (k / 8) * TAU;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - 0.12) * 80, y + Math.sin(a - 0.12) * 80);
      ctx.lineTo(x + Math.cos(a + 0.12) * 80, y + Math.sin(a + 0.12) * 80);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBits(ctx: CanvasRenderingContext2D) {
    for (const b of this.bits) {
      const f = b.life / b.max;
      if (b.kind === 'coin') {
        drawSprite(ctx, 'haggle', 'coin', b.x, b.y, { clip: 'spin', t: b.life * 3, alpha: Math.min(1, f * 3) });
        continue;
      }
      ctx.globalAlpha = (b.kind === 'steam' ? 0.5 : 0.4) * f;
      ctx.fillStyle = b.kind === 'steam' ? '#f4e8e0' : '#c8a878';
      ctx.beginPath();
      ctx.arc(b.x, b.y, (b.kind === 'steam' ? 2 : 1.5) + (1 - f) * (b.kind === 'steam' ? 5 : 3), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Thrown out: the yard's iron shutter comes down, bounces, and stays down. */
  private gate(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const f = clamp(this.outT / 0.32, 0, 1);
    // a drop, then a bounce or two
    const b = f < 1 ? f * f : 1;
    const bounce = this.outT < 0.32 ? 0 : Math.abs(Math.sin((this.outT - 0.32) * 18)) * Math.exp(-(this.outT - 0.32) * 7) * 14;
    const gw = 352;
    const y = Math.round(-h + b * h - bounce);
    for (let x = 0; x < gw; x += 6) {
      ctx.fillStyle = x % 12 ? '#4a4250' : '#5e5666';
      ctx.fillRect(x, y, 6, h);
      ctx.fillStyle = '#6e6676';
      ctx.fillRect(x + 1, y, 1, h);
      ctx.fillStyle = '#2e2836';
      ctx.fillRect(x + 5, y, 1, h);
    }
    // bands, rust, the bottom rail
    ctx.fillStyle = '#3a3240';
    for (const by of [40, 120, 200]) ctx.fillRect(0, y + by, gw, 3);
    ctx.fillStyle = 'rgba(160,80,40,0.35)';
    for (let k = 0; k < 14; k++) ctx.fillRect((k * 53) % gw, y + ((k * 71) % (h - 10)), 4 + (k % 3) * 3, 2 + (k % 2) * 3);
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(0, y + h - 6, gw, 6);
    ctx.fillStyle = DARK;
    ctx.fillRect(gw, y, 2, h);
    // a sign hung on it, swinging
    const sw = Math.sin(this.outT * 5) * Math.exp(-this.outT * 1.5) * 4;
    const sx = Math.round(176 + sw);
    const sy = y + 150;
    ctx.fillStyle = '#c89a48';
    ctx.fillRect(160, y + 126, 1, 24);
    ctx.fillRect(192, y + 126, 1, 24);
    ctx.fillStyle = DARK;
    ctx.fillRect(sx - 44, sy - 1, 88, 26);
    ctx.fillStyle = '#7a5232';
    ctx.fillRect(sx - 43, sy, 86, 24);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(sx - 43, sy + 12, 86, 1);
    drawText(ctx, 'NO TOBBO', sx, sy + 3, '#f4ecd8', { align: 'center' });
    drawText(ctx, 'GO AWAY', sx, sy + 14, '#ffd04a', { align: 'center' });
    if (Math.sin(t * 3) > 0.9) glow(ctx, sx, sy + 12, 30, '#ffb04a', 0.15);
  }

  /** The price board: his ask at the top, his tag sliding down as he gives way, your coin coming up. */
  private ladder(ctx: CanvasRenderingContext2D, t: number) {
    const { lx: x, ly: y, lh: hh } = this;
    const at = (v: number) => Math.round(this.ladderY(v));
    // the board: dark planks in a brass frame
    const bx = x - 24;
    const bw = 128;
    ctx.fillStyle = DARK;
    ctx.fillRect(bx - 1, 3, bw + 2, 234);
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? '#2e1e16' : '#34221a';
      ctx.fillRect(bx, 4 + k * 58, bw, 58);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(bx, 4 + k * 58 + 57, bw, 1);
      ctx.fillStyle = 'rgba(255,200,140,0.04)';
      for (let g = 0; g < 5; g++) ctx.fillRect(bx + ((k * 37 + g * 29) % (bw - 30)), 8 + k * 58 + g * 10, 24, 1);
    }
    ctx.fillStyle = '#a8783a';
    ctx.fillRect(bx, 4, bw, 1);
    ctx.fillRect(bx, 235, bw, 1);
    ctx.fillRect(bx, 4, 1, 232);
    ctx.fillRect(bx + bw - 1, 4, 1, 232);
    // the title plate
    ctx.fillStyle = '#c89a48';
    ctx.fillRect(bx + 30, 8, 66, 11);
    ctx.fillStyle = '#8a6030';
    ctx.fillRect(bx + 30, 18, 66, 1);
    drawText(ctx, 'THE PRICE', bx + 63, 10, '#2a1a12', { align: 'center', shadow: false });
    // the rail, notched every so often
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(x + 19, y - 1, 5, hh + 2);
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(x + 20, y, 3, hh);
    ctx.fillStyle = '#c8a070';
    ctx.fillRect(x + 20, y, 1, hh);
    const step = Math.max(5, Math.round(this.ask / 10 / 5) * 5);
    for (let v = 0; v <= this.ask; v += step) {
      ctx.fillStyle = '#c8a070';
      ctx.fillRect(x + 16, at(v), 4, 1);
      ctx.fillRect(x + 23, at(v), 3, 1);
    }
    // what you can afford: chalk hatching above it
    if (this.purse < this.ask) {
      const py = at(this.purse);
      ctx.fillStyle = 'rgba(255,90,74,0.22)';
      for (let yy = y; yy < py; yy += 3) ctx.fillRect(x + 6, yy, 13, 1);
      ctx.fillStyle = 'rgba(255,122,106,0.8)';
      ctx.fillRect(x + 4, py, 16, 1);
      if (Math.abs(py - at(this.offer)) > 12) drawText(ctx, 'BROKE', x - 20, py - 8, '#ff7a6a');
    }
    // his old prices, chalked on the board
    for (const v of this.said) {
      ctx.fillStyle = 'rgba(244,236,216,0.3)';
      ctx.fillRect(x + 26, at(v), 6, 1);
    }
    // once it's over, where his floor was all along
    if (this.over) {
      const fy = at(this.floor);
      for (let k = 0; k < 110; k += 4) {
        ctx.fillStyle = '#8affb0';
        ctx.fillRect(x - 20 + k, fy, 2, 1);
      }
      drawText(ctx, `FLOOR ${this.floor}`, x + 98, fy + 3, '#8affb0', { align: 'right' });
    }
    // his price on a paper tag, hung on a string from the top, swinging when it moves
    const hy = at(this.shown);
    const tx = Math.round(x + 34 + this.tagX * 0.3);
    ctx.fillStyle = '#c8b090';
    ctx.fillRect(x + 32, 20, 1, hy - 24);
    ctx.fillRect(Math.min(x + 32, tx), hy - 5, Math.abs(tx - x - 32) + 1, 1);
    const label = `${Math.round(this.shown)}`;
    const tw = textWidth(label) + 26;
    glow(ctx, tx + tw / 2, hy, 18, '#ffd04a', 0.2);
    ctx.fillStyle = DARK;
    ctx.fillRect(tx - 1, hy - 7, tw + 2, 15);
    ctx.fillStyle = '#f0e4c4';
    ctx.fillRect(tx, hy - 6, tw, 13);
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(tx, hy + 5, tw, 2);
    ctx.fillStyle = DARK;
    ctx.fillRect(tx + 3, hy - 1, 2, 2);
    drawText(ctx, label, tx + 8, hy - 3, '#8a2a1a', { shadow: false });
    ctx.fillStyle = '#c89a48';
    ctx.fillRect(tx + tw - 9, hy - 3, 6, 6);
    ctx.fillStyle = '#8a6030';
    ctx.fillRect(tx + tw - 8, hy - 2, 4, 4);
    // your offer: a coin on the rail, and its number on a teal chip
    const oy = at(this.offer);
    const pulse = 0.6 + 0.4 * Math.sin(t * 8);
    glow(ctx, x + 12, oy, 12, '#8affe0', 0.3 * pulse);
    drawSprite(ctx, 'haggle', 'coin', x + 21, oy, { clip: 'spin', t: this.spinT > 0 ? t * 3 : 0 });
    const ol = `${this.offer}`;
    const ow = textWidth(ol) + 6;
    ctx.fillStyle = DARK;
    ctx.fillRect(x + 12 - ow - 1, oy - 5, ow + 2, 11);
    ctx.fillStyle = '#1a5a5a';
    ctx.fillRect(x + 12 - ow, oy - 4, ow, 9);
    drawText(ctx, ol, x + 12 - ow + 3, oy - 2, '#8affe0', { shadow: false });
    const take = this.offer >= this.price;
    const ly = Math.abs(oy - hy) > 12 ? oy - 2 : oy + 9;
    drawText(ctx, take ? 'TAKE IT' : 'OFFER', x + 32, ly, take ? '#ffd04a' : '#8affe0');
  }

  /** The other buyer, walking along the back of the yard to the part. */
  private buyerTrack(ctx: CanvasRenderingContext2D, t: number) {
    const x0 = 206;
    const x1 = 326;
    const gy = 37;
    const f = this.last > 0 || this.lost ? 1 : Math.min(1, this.buyer);
    const hot = f > 0.7;
    this.panel(ctx, x0 - 34, 0, x1 - x0 + 52, 42);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 33, 1, x1 - x0 + 50, 40);
    ctx.clip();
    // the path: dust, and how far he's come along it
    ctx.fillStyle = '#4a3428';
    ctx.fillRect(x0 - 2, gy, x1 - x0 + 14, 2);
    ctx.fillStyle = hot ? '#ff8a3a' : '#a89070';
    for (let k = x0; k < x0 + (x1 - x0) * f; k += 4) ctx.fillRect(k, gy, 2, 1);
    // the part's crate at the end
    ctx.fillStyle = DARK;
    ctx.fillRect(x1 + 2, gy - 9, 11, 9);
    ctx.fillStyle = '#7a5a3a';
    ctx.fillRect(x1 + 3, gy - 8, 9, 8);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(x1 + 3, gy - 5, 9, 1);
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x1 + 6, gy - 8, 3, 2);
    // him
    const p = this.over ? clamp(this.outT / 1.1, 0, 1) : 0;
    let bx = Math.round(x0 + (x1 - x0 - 4) * f);
    let o: SpriteOpts = { clip: 'walk', t: this.time * 1.2 };
    if (this.last > 0 || (this.over && !this.lost)) o = { clip: 'rest' };
    if (this.lost) {
      // he takes it, and goes off with it
      o = p < 0.6 ? { clip: 'grab', t: p * 1.5 } : { clip: 'walk', t: this.outT * 1.2 };
      if (p >= 0.6) bx += Math.round((this.outT - 0.66) * 40);
    }
    {
      drawSprite(ctx, 'haggle', 'buyer', bx, gy, o);
      if (hot && !this.over && Math.sin(t * 10) > 0) this.tint(ctx, 'buyer', bx, gy, o, '#ff8a3a', 0.4);
    }
    // tapping his foot at the last call
    if (this.last > 0 && !this.over) drawText(ctx, '!', bx + 8, 2, Math.sin(t * 12) > 0 ? '#ff8a3a' : '#ffd04a');
    ctx.restore();
    if (f < 0.7) drawText(ctx, 'BUYER', x0 - 30, 6, '#8a7a6a');
    else drawText(ctx, 'HURRY', x0 - 30, 6, Math.sin(t * 10) > 0 ? '#ff8a3a' : '#ffd04a');
  }

  /**
   * His patience as a fuse burning down to a powder keg; at the easy levels, his mood spelled out
   * on a strip beside it.
   */
  private gauges(ctx: CanvasRenderingContext2D, h: number, t: number) {
    const y = h - 24;
    this.panel(ctx, 4, y, 222, 20);
    const plain = this.level <= 2;
    const p = clamp(this.shownPatience, 0, 1);
    const low = this.patience < 0.25 && !this.over;
    // the keg, trembling once the fuse is short
    const kx = 16 + (low ? Math.round(Math.sin(t * 40)) : 0);
    drawSprite(ctx, 'haggle', 'keg', kx, y + 18, {
      fallback: () => {
        ctx.fillStyle = '#7a5030';
        ctx.fillRect(kx - 7, y + 4, 14, 14);
      },
    });
    drawText(ctx, 'PATIENCE', 30, y + 4, low ? (Math.sin(t * 10) > 0 ? '#ff5a4a' : '#ff8a5a') : '#c8bcd8');
    // the fuse: twisted cord from the keg, burnt to ash behind the flame
    const fx0 = 25;
    const fw = plain ? 132 : 192;
    const fy = y + 14;
    const end = fx0 + Math.round(fw * p);
    for (let x = fx0; x < fx0 + fw; x++) {
      const burnt = x >= end;
      const wave = Math.round(Math.sin(x * 0.5) * 0.6);
      ctx.fillStyle = burnt ? (x % 3 ? '#3a3238' : '#2a2428') : x % 3 === 0 ? '#8a6a48' : x % 3 === 1 ? '#c8a878' : '#a88a60';
      ctx.fillRect(x, fy + wave, 1, burnt ? 1 : 2);
    }
    // the flame at the end of it, spitting
    if (!this.shut && p > 0) {
      const fl = 1 + Math.sin(t * 30) * 0.3 + (this.patience < this.shownPatience - 0.02 ? 1 : 0);
      glow(ctx, end, fy, 10 * fl, '#ffb04a', 0.6);
      ctx.fillStyle = '#fff4c8';
      ctx.fillRect(end - 1, fy - 1, 2, 2);
      ctx.fillStyle = '#ff8a3a';
      ctx.fillRect(end, fy - 3 - Math.round(Math.sin(t * 25)), 1, 2);
      if (Math.sin(t * 17) > 0.3) {
        ctx.fillStyle = '#ffd04a';
        ctx.fillRect(end + 2 + Math.round(Math.sin(t * 11) * 2), fy - 4 + Math.round(Math.cos(t * 13) * 2), 1, 1);
      }
    }
    if (!plain) return;
    // his mood, shown plainly: a needle between prickly and soft
    const mx = 168;
    const mw = 50;
    drawText(ctx, 'MOOD', mx, y + 4, '#c8bcd8');
    const zone = (a: number, b: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(mx + Math.round(((a + 1) / 2) * mw), y + 13, Math.round(((b - a) / 2) * mw), 4);
    };
    ctx.fillStyle = DARK;
    ctx.fillRect(mx - 1, y + 12, mw + 2, 6);
    zone(-1, PRICKLY, '#8a2a2a');
    zone(PRICKLY, SOFT, '#3a2e48');
    zone(SOFT, 1, '#2a8a5a');
    const nx = mx + Math.round(((this.mood + 1) / 2) * mw);
    const mc = this.mood > SOFT ? '#8affb0' : this.mood < PRICKLY ? '#ff7a6a' : '#c8bcd8';
    ctx.fillStyle = DARK;
    ctx.fillRect(nx - 2, y + 10, 5, 10);
    ctx.fillStyle = mc;
    ctx.fillRect(nx - 1, y + 11, 3, 8);
    if (this.mood > SOFT) glow(ctx, nx, y + 15, 10, '#8affb0', 0.5);
  }

  /** A hummed note, drifting up off his snout. */
  private note(ctx: CanvasRenderingContext2D, x: number, y: number, life: number) {
    ctx.globalAlpha = Math.min(1, life * 2);
    const nx = Math.round(x);
    const ny = Math.round(y);
    glow(ctx, nx + 3, ny + 2, 9, '#8affb0', 0.35);
    ctx.fillStyle = DARK;
    ctx.fillRect(nx - 1, ny + 3, 6, 5);
    ctx.fillRect(nx + 3, ny - 5, 4, 9);
    ctx.fillStyle = '#c8ffd8';
    ctx.fillRect(nx, ny + 4, 4, 3);
    ctx.fillRect(nx + 3, ny - 4, 1, 9);
    ctx.fillRect(nx + 4, ny - 4, 2, 1);
    ctx.fillRect(nx + 5, ny - 3, 1, 1);
    ctx.globalAlpha = 1;
  }

  /**
   * Tobbo in his yard: the painted scene, bobbing as he hovers, his wings beating over it (slow
   * and wide when he's soft, a buzz when he's not), and his face: brows down and steam when he's
   * cross, lids low and a blush when he's soft.
   */
  private yard(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, e: number) {
    ctx.fillStyle = '#1a1018';
    ctx.fillRect(-10, -10, w + 20, h + 20);
    const img = artImage('tobbo');
    // the crop of the painting that holds him, and where it lands
    const [sx, sy, sw, sh] = [30, 30, 360, 270];
    const k = h / sh;
    const soft = (this.lookV + 1) / 2;
    const bob = Math.sin(t * (2 + (1 - soft) * 3)) * (1.5 + soft * 1.5) - this.lean * 3 + this.hit * 2;
    ctx.save();
    // the intro: a slow push in on him
    const zoom = 1 + (1 - e) * 0.12;
    ctx.translate(120, 90);
    ctx.scale(zoom, zoom);
    ctx.translate(-120, -90 + bob);
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy - 8, sw, sh + 16, 0, -8 * k, sw * k, (sh + 16) * k);
    }
    // the yard's lamps, flickering
    for (const [lx, ly, ph] of [
      [12, 22, 0],
      [70, 72, 1.3],
      [76, 140, 2.1],
      [62, 175, 0.4],
    ])
      glow(ctx, lx, ly, 12 + Math.sin(t * 7 + ph) * 2, '#ffb04a', 0.25 + 0.1 * Math.sin(t * 11 + ph));
    // insulted: he goes red in the face
    const cross = Math.max(this.flush, Math.max(0, -this.lookV) * 0.55);
    if (cross > 0.02) glow(ctx, 170, 72, 62, '#ff4a3a', cross * 0.45);
    if (soft > 0.7) glow(ctx, 170, 72, 54, '#8affb0', (soft - 0.7) * 0.6);
    this.wings(ctx, t, cross);
    this.face(ctx, t, cross, soft);
    ctx.restore();
    // fade the right of the yard into the dark, for the counter and the board
    const fade = ctx.createLinearGradient(226, 0, 318, 0);
    fade.addColorStop(0, 'rgba(14,10,22,0)');
    fade.addColorStop(1, 'rgba(14,10,22,0.94)');
    ctx.fillStyle = fade;
    ctx.fillRect(224, -10, w - 214, h + 20);
    // warm dust in the air, drifting
    ctx.fillStyle = 'rgba(255,208,140,0.35)';
    for (let i = 0; i < 14; i++) {
      const a = Math.sin(i * 47.3) * 9999;
      const px = (((a - Math.floor(a)) * 260 + t * (4 + (i % 3) * 3)) % 260) | 0;
      const py = ((Math.sin(i * 13.1 + t * 0.4) * 0.5 + 0.5) * 200 + 20) | 0;
      ctx.fillRect(px, py, 1, 1);
    }
  }

  /** His two wings, painted in already: the sprites beat over them, see-through. */
  private wings(ctx: CanvasRenderingContext2D, t: number, cross: number) {
    const phase = this.wingPhase + (this.time > 0 ? 0 : t * 2);
    const buzz = this.look !== 'soft' ? Math.min(1, 0.4 + cross) : 0;
    const swingA = this.look === 'soft' ? 0.2 : 0.09;
    for (const [rx, ry, ang, sc, mirror] of [
      [124, 107, Math.PI + 0.17, 0.82, true],
      [209, 71, -0.33, 0.4, false],
    ] as const) {
      const passes = buzz > 0.5 ? 3 : 1;
      for (let n = 0; n < passes; n++) {
        const ph = phase - n * 0.11;
        const frame = ((Math.floor(ph * 8) % 8) + 8) % 8;
        const swing = Math.sin(ph * TAU) * swingA;
        const o: SpriteOpts = { clip: 'beat', frame, alpha: passes > 1 ? [0.34, 0.2, 0.1][n] : 0.42 };
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(ang + (mirror ? -swing : swing));
        ctx.scale(sc, mirror ? -sc : sc);
        drawSprite(ctx, 'haggle', 'wing', 0, 0, o);
        if (cross > 0.3) this.tint(ctx, 'wing', 0, 0, o, '#ff7a6a', cross * 0.5);
        else if (this.look === 'soft') this.tint(ctx, 'wing', 0, 0, o, '#c8ffd8', 0.3);
        ctx.restore();
      }
    }
  }

  /** His face, over the painting: brows down when he's cross, lids low and a blush when soft. */
  private face(ctx: CanvasRenderingContext2D, t: number, cross: number, soft: number) {
    if (cross > 0.25) {
      // brows, knitted down towards his snout
      ctx.globalAlpha = Math.min(1, (cross - 0.25) * 2.5);
      ctx.strokeStyle = '#2a140a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(138, 57);
      ctx.lineTo(156, 62);
      ctx.moveTo(182, 48);
      ctx.lineTo(195, 43);
      ctx.stroke();
      ctx.strokeStyle = '#7a4a2a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(138, 55);
      ctx.lineTo(156, 60);
      ctx.moveTo(182, 46);
      ctx.lineTo(195, 41);
      ctx.stroke();
      // a vein, throbbing
      if (Math.sin(t * 9) > 0) {
        ctx.fillStyle = '#c83a2a';
        ctx.fillRect(166, 44, 1, 3);
        ctx.fillRect(167, 43, 2, 1);
        ctx.fillRect(165, 47, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    if (soft > 0.75) {
      // lids half down, content; a blush on the cheeks
      const a = Math.min(1, (soft - 0.75) * 4);
      ctx.globalAlpha = a;
      for (const [ex, ey, rx, ry] of [
        [147.5, 66, 7.5, 4],
        [188, 52.5, 4.5, 3.6],
      ]) {
        ctx.fillStyle = '#b87a40';
        ctx.beginPath();
        ctx.ellipse(ex, ey, rx, ry, 0, Math.PI, TAU);
        ctx.fill();
        ctx.fillStyle = '#5a3018';
        ctx.fillRect(Math.round(ex - rx), Math.round(ey), Math.round(rx * 2), 1);
      }
      ctx.globalAlpha = 1;
      glow(ctx, 133, 80, 12, '#ff7a8a', 0.3 * a);
      glow(ctx, 200, 66, 9, '#ff7a8a', 0.25 * a);
    }
    // a deal: a glint off his best tooth
    if (this.value !== null && !this.lost && this.over && this.outT < 1) {
      const s = Math.sin(this.outT * Math.PI) * 4;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(172, 76 - Math.round(s), 1, Math.round(s * 2) + 1);
      ctx.fillRect(172 - Math.round(s), 76, Math.round(s * 2) + 1, 1);
      glow(ctx, 172, 76, 10, '#fff4c8', 0.6);
    }
  }
}

/** Scratch for washing a sprite in a colour, and for lifting the part off its backdrop. */
let tintCanvas: HTMLCanvasElement | null = null;
let partCanvas: HTMLCanvasElement | null = null;
