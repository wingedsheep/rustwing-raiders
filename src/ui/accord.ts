/**
 * A choice the crew makes together: where to jump, what to answer, when to move on. Alone, a
 * press is the choice. In co-op the cursor is shared and a press is a vote: your tag goes on what
 * you picked, and it's made once every pilot's tag is on the same thing. Back takes your vote
 * back. A vote stays where it was put while the cursor moves on, so a disagreement shows.
 *
 * The rule the screens keep: what moves the whole crew on (a jump, an answer, leaving) waits for
 * everyone; what's yours (your hold, your ship) is yours to do.
 */

import { input, type DeviceId, type MenuInput } from '../input';
import { audio } from '../audio';
import { LIVERY } from '../view/ship-model';
import { drawText, textWidth } from './font';
import { DARK, DIM, INK, RED, hex } from './hud';
import { button, capWidth, keycap } from './widgets';

export class Accord<K extends string | number = string | number> {
  private votes: (K | null)[];

  constructor(players: number) {
    this.votes = new Array(players).fill(null);
  }

  get coop() {
    return this.votes.length > 1;
  }

  /** Votes for `k` from each player who pressed confirm; `k` once everyone's on it (alone, at once). */
  confirm(ms: MenuInput[], k: K): K | null {
    let got: K | null = null;
    ms.forEach((m, i) => m.confirm && (got = this.vote(i, k) ?? got));
    return got;
  }

  /** Player `i` backs `k`: `k` if that makes it everyone's. */
  vote(i: number, k: K): K | null {
    if (!this.coop) return k;
    this.votes[i] = k;
    if (this.votes.every((v) => v === k)) {
      this.clear();
      return k;
    }
    audio.play('ui_place');
    return null;
  }

  /** Takes back the vote of each player who pressed back; true if any did (the press is spent). */
  withdraw(ms: MenuInput[]): boolean {
    let any = false;
    ms.forEach((m, i) => {
      if (!m.back || this.votes[i] === null) return;
      this.votes[i] = null;
      m.back = false;
      any = true;
    });
    if (any) audio.play('ui_back');
    return any;
  }

  clear() {
    this.votes.fill(null);
  }

  /** Who's backing `k`. */
  backers(k: K): number[] {
    return this.votes.flatMap((v, i) => (v === k ? [i] : []));
  }

  /** Whether anyone's voted. */
  get open() {
    return this.votes.some((v) => v !== null);
  }

  /** Each player's tag on what they backed, side by side from `x` (or centred on it, or ending at it). Returns the width. */
  tags(ctx: CanvasRenderingContext2D, k: K, x: number, y: number, align: 'left' | 'center' | 'right' = 'left') {
    const who = this.backers(k);
    const w = who.length * 17 - (who.length ? 2 : 0);
    let tx = Math.round(align === 'right' ? x - w : align === 'center' ? x - w / 2 : x);
    for (const i of who) {
      tag(ctx, i, tx, y);
      tx += 17;
    }
    return w;
  }

  /**
   * The line that says where the crew stands, centred on `cx` (or starting at it): who wants what
   * and who it waits on, or that they want different things. Nothing while nobody's voted.
   */
  banner(ctx: CanvasRenderingContext2D, cx: number, y: number, name: (k: K) => string, t: number, align: 'left' | 'center' = 'center') {
    if (!this.coop || !this.open) return;
    const wants = [...new Set(this.votes.filter((v): v is K => v !== null))];
    const waiting = this.votes.flatMap((v, i) => (v === null ? [i] : []));
    // pieces: a player's tag, or words
    const bits: (number | [string, string])[] = [];
    wants.forEach((k, n) => {
      if (n) bits.push(['   ', DIM]);
      for (const i of this.backers(k)) bits.push(i);
      bits.push([` ${name(k)}`, INK]);
    });
    if (wants.length > 1) bits.push(['   PICK THE SAME', '#ff8a7a']);
    else if (waiting.length) {
      bits.push(['   WAITING ON ', DIM]);
      waiting.forEach((i) => bits.push(i));
    }
    const width = bits.reduce<number>((s, b) => s + (typeof b === 'number' ? 17 : textWidth(b[0])), 0);
    const x0 = Math.round(align === 'center' ? cx - width / 2 : cx + 7);
    // a dark pill under it, its edge in the colour of whoever's waited on (a slow pulse)
    const edge = waiting.length && wants.length === 1 ? hex(LIVERY[waiting[0]][2]) : '#ff8a7a';
    ctx.fillStyle = DARK;
    ctx.fillRect(x0 - 7, y - 4, width + 14, 15);
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 5);
    ctx.fillStyle = edge;
    ctx.fillRect(x0 - 7, y - 4, width + 14, 1);
    ctx.fillRect(x0 - 7, y + 10, width + 14, 1);
    ctx.globalAlpha = 1;
    let x = x0;
    for (const b of bits) {
      if (typeof b === 'number') {
        tag(ctx, b, x, y);
        x += 17;
      } else x += drawText(ctx, b[0], x, y, b[1]);
    }
  }
}

/** A player's tag: P1 or P2 on their livery's colour. */
export function tag(ctx: CanvasRenderingContext2D, i: number, x: number, y: number) {
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 1, y - 2, 17, 11);
  ctx.fillStyle = hex(LIVERY[i][2]);
  ctx.fillRect(x, y - 1, 15, 9);
  drawText(ctx, `P${i + 1}`, x + 2, y, DARK, { shadow: false });
}

/**
 * Giving up a fight from the pause ends the run, so it's never one press. Alone, back asks and a
 * second back while it's asking does it; in co-op it's everyone's back (start, resuming, calls
 * it off).
 */
export class Quit {
  private accord: Accord<'quit'>;
  private ask = 0;
  private t = 0;

  constructor(players: number) {
    this.accord = new Accord(players);
  }

  /** This paused frame's presses: true once it's settled. */
  update(ms: MenuInput[], dt: number): boolean {
    this.t += dt;
    this.ask = Math.max(0, this.ask - dt);
    if (this.accord.coop) return ms.reduce((go, m, i) => (m.back && this.accord.vote(i, 'quit') !== null) || go, false);
    if (!ms[0]?.back) return false;
    if (this.ask > 0) return true;
    this.ask = 3;
    audio.play('ui_error');
    return false;
  }

  reset() {
    this.accord.clear();
    this.ask = 0;
  }

  /** The pause's foot, centred on `cx`: sound, resume, give up; and who's asked to give up. */
  draw(ctx: CanvasRenderingContext2D, devs: DeviceId[], cx: number, y: number, what = 'ABANDON THE RUN', warn = 'THE RUN ENDS HERE') {
    // (on the keyboard Esc is pause as well as back: give up names a back key that isn't)
    const back = (d: DeviceId) => (input.shown(d) === 'keys' ? 'X' : button(d, 'back'));
    const asking = this.ask > 0;
    // (a pad's buttons drawn as on the pad: the keyboard's X stays a key)
    const pads = devs.filter((d) => input.shown(d).startsWith('pad'));
    const padKeys = new Set([...pads.map((d) => button(d, 'move')), ...pads.map((d) => button(d, 'start')), ...pads.map(back)]);
    const items: [string[], string, string][] = [
      [uniq(devs.map((d) => button(d, 'move'))), 'SOUND', DIM],
      [uniq(devs.map((d) => button(d, 'start'))), 'RESUME', DIM],
      [uniq(devs.map(back)), asking ? `AGAIN: ${what}` : what, asking ? RED : DIM],
    ];
    const w = items.reduce((s, [ks, t]) => s + ks.reduce((q, k) => q + capWidth(k, padKeys.has(k)) + 4, 0) + textWidth(t) + 14, -14);
    let x = Math.round(cx - w / 2);
    for (const [ks, t, col] of items) {
      for (const k of ks) x += keycap(ctx, k, x, y, padKeys.has(k)) + 4;
      x += drawText(ctx, t, x, y, col) + 14;
    }
    if (asking && Math.floor(this.t * 4) % 2) drawText(ctx, warn, cx, y + 16, RED, { align: 'center' });
    this.accord.banner(ctx, cx, y + 18, () => what, this.t);
  }
}

const uniq = (a: string[]) => [...new Set(a)];
