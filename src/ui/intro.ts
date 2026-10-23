/**
 * The first time a player meets a system (a link, a bounty, the Sweep), it's said once, unasked:
 * a card slides in with NEW and the keyword, says what it means in a line or two, and slides out.
 * Remembered across runs (glossary.ts `firstTime`), so it's said once a player, not once a run.
 * More than one at once queue up; the INFO button lists them all again.
 */

import { audio } from '../audio';
import { drawText, wrap } from './font';
import { DARK, frame } from './hud';
import { firstTime, term, type Term } from './glossary';
import { keycap } from './widgets';

const SLIDE = 0.22;
/** Seconds on screen: a base, and a little more a word. */
const HOLD = 3.2;
const PER_WORD = 0.22;

export class Intro {
  private queue: Term[] = [];
  private cur: Term | null = null;
  private t = 0;
  private life = 0;

  /** Say this keyword, if the player's never met it. */
  meet(id: string) {
    const k = term(id);
    if (!k || this.cur === k || this.queue.includes(k)) return;
    if (!firstTime(`kw:${id}`)) return;
    this.queue.push(k);
  }

  /** Each of these, as above. */
  meetAll(ids: Iterable<string>) {
    for (const id of ids) this.meet(id);
  }

  get showing() {
    return this.cur !== null;
  }

  /** Put it away early (the player's read it, or opened the full list). */
  dismiss() {
    if (this.cur && this.t < this.life - SLIDE) this.t = this.life - SLIDE;
  }

  update(dt: number) {
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift()!;
      this.t = 0;
      this.life = HOLD + this.cur.text.split(' ').length * PER_WORD;
      audio.play('ui_move', { pitch: 1.5, vol: 0.6 });
    }
    if (!this.cur) return;
    this.t += dt;
    if (this.t >= this.life) this.cur = null;
  }

  /** The card, its top-left at (x, y), sliding down from just above. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, infoKey?: string) {
    const k = this.cur;
    if (!k) return;
    const into = Math.min(1, this.t / SLIDE);
    const out = Math.min(1, Math.max(0, (this.life - this.t) / SLIDE));
    const a = Math.min(into, out);
    const lines = wrap(k.text, w - 18);
    const h = 25 + lines.length * 9 + 6;
    const yy = Math.round(y - (1 - a) * 10);
    ctx.globalAlpha = a;
    frame(ctx, x, yy, w, h, 'rgba(16,11,24,0.97)', k.color);
    // a flash along the top as it lands
    if (this.t < 0.5) {
      ctx.fillStyle = k.color;
      ctx.globalAlpha = a * (1 - this.t / 0.5) * 0.35;
      ctx.fillRect(x, yy, w, h);
      ctx.globalAlpha = a;
    }
    // NEW, on a tab of the keyword's colour, then the word
    ctx.fillStyle = k.color;
    ctx.fillRect(x + 6, yy + 6, 23, 10);
    drawText(ctx, 'NEW', x + 9, yy + 8, DARK, { shadow: false });
    drawText(ctx, k.word, x + 35, yy + 8, k.color);
    if (infoKey) {
      const label = 'ALL KEYWORDS';
      const lw = label.length * 6;
      drawText(ctx, label, x + w - 8 - lw, yy + 8, '#8a7e9a');
      keycap(ctx, infoKey, x + w - 8 - lw - 8 - infoKey.length * 6, yy + 8);
    }
    let ty = yy + 22;
    for (const l of lines) {
      drawText(ctx, l, x + 9, ty, '#e4dcec');
      ty += 9;
    }
    // how long it has left, as a thin line along the foot
    const left = 1 - this.t / this.life;
    ctx.fillStyle = k.color;
    ctx.globalAlpha = a * 0.6;
    ctx.fillRect(x + 2, yy + h - 2, Math.round((w - 4) * left), 1);
    ctx.globalAlpha = 1;
  }
}
