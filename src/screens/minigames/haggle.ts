import { audio } from '../../audio';
import { drawText, wrap } from '../../ui/font';
import { DARK } from '../../ui/hud';
import { TIER_COLOR } from '../../ui/widgets';
import { itemName, tierOf, type Item } from '../../game/loot';
import { portraits } from '../../view/portraits';
import { clamp, pick, rng, type Rng } from '../../util';
import type { Setup } from '../../sim/events';
import { artImage } from '../art';
import { Fx, glow, meter, vignette, type Minigame, type Pad } from './common';

const INSULTED = ['ZZA?! YOU INSULT TOBBO!', 'BOH! TOBBO HAS CHILDREN!', 'FOR THAT? TOBBO WOULD SOONER EAT IT!', 'WAHH! AN INSULT TO THE METAL!', 'ZZIMBO! GET OUT! NO, WAIT.'];
const CLOSE = ['HMM. HMM-HMM. FOR YOU:', 'TOBBO IS LOSING MONEY. FINE:', 'OH-BOH-BOH. YOU ARE HARD. SAY', 'TOBBO WEEPS. BUT:', 'ZZA. ONLY FOR A FRIEND:'];
const FIRM = ['TOBBO DOES NOT MOVE. NOT ONE SCRAP MORE.', 'THAT IS THE PRICE. TOBBO HAS A FAMILY.'];

/**
 * Haggle with Tobbo Grisk: he names a price, you name yours, he comes down towards you, or he
 * doesn't. Somewhere under his asking price is the least he'll take, and you can't see it; you can
 * see his wings. An offer far under it is an insult (his wings roar, his patience burns); an offer
 * near it makes him hesitate and buzz low. Run out his patience and he shuts the gate. Up and down
 * set your offer (hold to run it), left and right in tens; the button makes it. Offer his own price
 * to take it. Bold: his good stock, and a shorter fuse.
 */
export class Haggle implements Minigame {
  readonly title = 'HAGGLE';
  readonly how = 'UP/DOWN: YOUR OFFER (HOLD TO RUN IT), LEFT/RIGHT: TENS. THE BUTTON MAKES IT. WATCH HIS WINGS: THE LOUDER THEY GO, THE FURTHER UNDER HIS FLOOR YOU ARE.';
  result: number | null = null;
  value: number | null = null;
  private readonly item: Item | null;
  private readonly ask: number;
  private readonly floor: number;
  private readonly purse: number;
  /** His price now, and every price he's said. */
  private price: number;
  private said: number[] = [];
  private offer: number;
  private patience: number;
  /** How worked up his wings are, 0..1, and how fast they settle. */
  private buzz = 0.2;
  private flush = 0;
  private line = '';
  private lineT = 0;
  private lean = 0;
  private held = 0;
  private dir = 0;
  private time = 0;
  private fx = new Fx();
  private r: Rng;
  private done = 0;
  private shut = false;

  constructor(
    private bold: boolean,
    seed: number,
    s: Setup,
  ) {
    this.r = rng(seed);
    this.item = s.item ?? null;
    this.ask = s.ask ?? 120;
    this.floor = s.floor ?? Math.round(this.ask * 0.5);
    this.purse = s.purse ?? 999;
    this.price = this.ask;
    this.offer = Math.min(this.purse, Math.round(this.ask * 0.6));
    this.patience = bold ? 0.78 : 1;
    this.say(`${pick(this.r, ['FOR YOU, FRIEND', 'A BARGAIN', 'PRACTICALLY FREE'])}: ${this.ask}.`);
  }

  private say(s: string) {
    this.line = s;
    this.lineT = 0;
  }

  private get top() {
    return Math.min(this.price, this.purse);
  }

  status() {
    return `YOUR OFFER ${this.offer}  ·  HE WANTS ${this.price}  ·  YOUR SCRAP ${this.purse}`;
  }

  update(dt: number, pad: Pad) {
    this.fx.update(dt);
    this.lineT += dt;
    this.buzz += (0.18 + (1 - this.patience) * 0.25 - this.buzz) * Math.min(1, dt * 1.6);
    this.flush = Math.max(0, this.flush - dt * 0.8);
    this.lean += (0 - this.lean) * Math.min(1, dt * 4);
    if (this.result !== null) return;
    if (this.done > 0) {
      this.done -= dt;
      if (this.done <= 0) this.result = this.shut ? 0 : this.score();
      return;
    }
    this.time += dt;
    // the offer: a tap is one, a hold runs, faster the longer
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
    if (pad.press) this.make();
  }

  private step(n: number) {
    const was = this.offer;
    this.offer = clamp(this.offer + n, 1, this.top);
    if (this.offer !== was) audio.play('ui_move', { pitch: 0.7 + (this.offer / this.ask) * 0.8, vol: 0.5 });
  }

  /** You name your price. */
  private make() {
    const o = this.offer;
    this.lean = 1;
    if (o >= this.price) return this.deal(this.price);
    const gap = this.floor - o;
    // patience goes a little with every round, a lot with an insult
    if (gap > 0) {
      const how = gap / this.ask;
      this.patience -= (0.16 + how * 1.6) * (this.bold ? 1.35 : 1);
      this.buzz = Math.min(1, 0.6 + how * 2);
      this.flush = 1;
      this.fx.shake(3 + how * 10);
      this.fx.burst(120, 70, 14, 90, ['#ff5a4a', '#ffd04a']);
      audio.play('ui_error');
      // he barely moves for an insult
      this.price = Math.max(this.floor, Math.round(this.price - (this.price - this.floor) * 0.06));
      if (this.patience > 0) this.say(`${pick(this.r, INSULTED)} ${this.price}.`);
    } else {
      this.patience -= this.bold ? 0.1 : 0.07;
      // close to his floor he wavers: the wings go low
      this.buzz = 0.1;
      const before = this.price;
      this.price = Math.max(this.floor, Math.round(this.price - (this.price - o) * (0.4 + this.r() * 0.2)));
      if (this.price === before || this.price - this.floor < 2) {
        this.price = this.floor;
        this.say(`${pick(this.r, FIRM)} ${this.price}.`);
      } else this.say(`${pick(this.r, CLOSE)} ${this.price}.`);
      audio.play('ui_place');
      this.fx.word(`${this.price}`, 360, 40, '#ffd04a', 2);
    }
    this.said.push(this.price);
    this.offer = Math.min(this.offer, this.top);
    if (this.patience <= 0) {
      this.patience = 0;
      this.shut = true;
      this.done = 1.4;
      this.say('OUT! OUT OF TOBBO\'S YARD!');
      audio.play('explode_small');
      this.fx.shake(8, 0.5);
    }
  }

  private deal(at: number) {
    this.value = at;
    this.done = 1.3;
    this.say(at <= this.floor + 2 ? 'ROBBERY. DONE. TOBBO WEEPS.' : 'DONE! A PLEASURE, FRIEND!');
    audio.play('ui_buy');
    this.fx.burst(240, 120, 30, 140, ['#ffd04a', '#ffffff', '#8affb0'], { life: 0.9 });
  }

  /** How good the price was: 1 at his floor, a little over nothing at his ask. */
  private score() {
    if (this.value === null) return 0;
    return clamp(0.05 + 0.95 * ((this.ask - this.value) / Math.max(1, this.ask - this.floor)), 0.05, 1);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const [ox, oy] = this.fx.offset();
    ctx.save();
    ctx.translate(ox, oy);
    // his yard at dusk, and Tobbo in it
    this.yard(ctx, w, h, t);
    // his line, in a bubble
    const lines = wrap(this.line, 150);
    const bx = 10;
    const by = 10;
    const bh = lines.length * 10 + 8;
    ctx.fillStyle = 'rgba(244,236,216,0.95)';
    ctx.fillRect(bx, by, 160, bh);
    ctx.fillRect(bx + 60, by + bh, 6, 5);
    const shown = Math.floor(this.lineT * 90);
    let left = shown;
    lines.forEach((l, k) => {
      if (left > 0) drawText(ctx, l.slice(0, left), bx + 5, by + 5 + k * 10, this.flush > 0.3 ? '#a02020' : DARK, { shadow: false });
      left -= l.length + 1;
    });
    // the part, turning
    if (this.item) {
      const tc = TIER_COLOR[tierOf(this.item)];
      ctx.fillStyle = 'rgba(10,7,16,0.72)';
      ctx.fillRect(244, 112, 88, 104);
      ctx.fillStyle = tc;
      ctx.fillRect(244, 112, 88, 1);
      glow(ctx, 288, 152, 44, tc, 0.22);
      portraits.draw(ctx, this.item.id, 252, 116, 72, t);
      drawText(ctx, itemName(this.item), 288, 192, tc, { align: 'center' });
      drawText(ctx, tierOf(this.item).toUpperCase(), 288, 202, tc, { align: 'center' });
    }
    this.ladder(ctx, 350, 26, 180);
    // patience
    ctx.fillStyle = 'rgba(10,7,16,0.75)';
    ctx.fillRect(14, h - 28, 314, 16);
    drawText(ctx, "TOBBO'S PATIENCE", 22, h - 22, '#c8bcd8');
    meter(ctx, 120, h - 22, 200, 6, this.patience, this.patience > 0.5 ? '#8affb0' : this.patience > 0.25 ? '#ffd04a' : '#ff5a4a');
    ctx.restore();
    this.fx.drawSparks(ctx);
    this.fx.drawWords(ctx);
    vignette(ctx, w, h, 0.45);
    this.fx.drawFlash(ctx, w, h);
  }

  /** The price ladder: his ask at the top, his prices coming down, your offer coming up. */
  private ladder(ctx: CanvasRenderingContext2D, x: number, y: number, hh: number) {
    const max = this.ask;
    const at = (v: number) => y + hh - (v / max) * hh;
    ctx.fillStyle = 'rgba(10,7,16,0.7)';
    ctx.fillRect(x - 6, y - 8, 136, hh + 18);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x + 20, y, 3, hh);
    for (let v = 0; v <= max; v += Math.max(5, Math.round(max / 10 / 5) * 5)) ctx.fillRect(x + 17, Math.round(at(v)), 9, 1);
    // what you can afford
    if (this.purse < max) {
      const py = Math.round(at(this.purse));
      ctx.fillStyle = 'rgba(255,90,74,0.18)';
      ctx.fillRect(x + 14, y, 16, py - y);
      drawText(ctx, 'BROKE', x - 2, py - 9, '#ff7a6a');
    }
    for (const v of this.said) {
      ctx.fillStyle = 'rgba(255,208,74,0.35)';
      ctx.fillRect(x + 24, Math.round(at(v)), 8, 1);
    }
    // his price
    const hy = Math.round(at(this.price));
    ctx.fillStyle = '#ffd04a';
    ctx.fillRect(x + 24, hy - 1, 14, 3);
    drawText(ctx, `TOBBO ${this.price}`, x + 42, hy - 3, '#ffd04a');
    // your offer
    const oy = Math.round(at(this.offer));
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
    glow(ctx, x + 12, oy, 12, '#8affe0', 0.3 * pulse);
    ctx.fillStyle = '#8affe0';
    ctx.fillRect(x + 4, oy - 1, 16, 3);
    drawText(ctx, `${this.offer}`, x + 2, oy + 4, '#8affe0');
    drawText(ctx, this.offer >= this.price ? 'TAKE IT' : 'OFFER', x + 42, oy + 4, '#8affe0');
  }

  /**
   * Tobbo in his yard: the painted scene, bobbing as he hovers, with his wings drawn over it as a
   * blur that goes faster and wider (and pinker, when he's insulted) the crosser he gets.
   */
  private yard(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    ctx.fillStyle = '#1a1018';
    ctx.fillRect(-10, -10, w + 20, h + 20);
    const img = artImage('tobbo');
    // the crop of the painting that holds him, and where it lands
    const [sx, sy, sw, sh] = [30, 30, 360, 270];
    const k = h / sh;
    const bob = Math.sin(t * 3) * 2 - this.lean * 3;
    const map = (x: number, y: number) => [(x - sx) * k, (y - sy) * k + bob] as const;
    if (img) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy - 8, sw, sh + 16, 0, -8 * k + bob, sw * k, (sh + 16) * k);
    }
    // insulted: he goes red in the face
    if (this.flush > 0.02) {
      const [fx, fy] = map(215, 115);
      glow(ctx, fx, fy, 70, '#ff4a3a', this.flush * 0.45);
    }
    // the wings: a blur, faster and wider as he winds up
    const rate = 20 + this.buzz * 70;
    const span = 1 + this.buzz * 0.9;
    for (const [wx, wy, ang, s] of [
      [125, 145, 0.25, -1],
      [272, 102, -0.35, 1],
    ] as const) {
      const [x, y] = map(wx, wy);
      for (let n = 0; n < 4; n++) {
        const a = Math.sin(t * rate + n * 1.7) * 0.35 * span;
        ctx.globalAlpha = 0.1 + this.buzz * 0.12;
        ctx.fillStyle = this.flush > 0.3 ? '#ffb0a0' : '#e8f6ff';
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
