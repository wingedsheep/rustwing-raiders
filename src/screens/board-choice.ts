import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import { Boarding, type BoardSpec } from '../sim/boarding';
import { Cell, SIZE_NAME } from '../sim/deck';
import { drawText, textWidth } from '../ui/font';
import { icon, iconSize, type Icon } from '../ui/board-icons';
import { CYAN, DARK, DIM, EDGE, GOLD, HEIST, INK, PANEL, RED, W, H, frame } from '../ui/hud';
import { hints } from '../ui/widgets';
import { audio } from '../audio';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Coming up on a heist's freighter: run her down in the air (shoot the strongboxes loose, as
 * ever), or clamp on and go aboard: on foot through her crew for the crates, a price on your head
 * for it, and the kelters on their way. The card shows her deck, as the clamp's scan reads it.
 */
export class BoardChoice implements Screen {
  private at = 0;
  private t = 0;
  private chosen = -1;
  private chosenT = 0;
  private deck: Boarding['deck'];
  private clock: number;

  constructor(
    private game: Game,
    private run: Run,
    private name: string,
    spec: BoardSpec,
    private onChoose: (board: boolean) => void,
  ) {
    const b = new Boarding(spec);
    this.deck = b.deck;
    this.clock = b.clockMax;
    audio.music('map');
  }

  update(dt: number) {
    this.t += dt;
    if (this.chosen >= 0) {
      this.chosenT += dt;
      if (this.chosenT > 0.55) this.onChoose(this.chosen === 1);
      return;
    }
    const m = this.game.menu();
    if (m.left || m.right || m.up || m.down) {
      this.at = 1 - this.at;
      audio.play('ui_move');
    }
    if (m.confirm) {
      this.chosen = this.at;
      audio.play(this.at ? 'kelter_clamp' : 'ui_select', { vol: this.at ? 0.6 : 1 });
    }
  }

  draw() {
    const ctx = this.game.ui;
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);
    // a slow drift of stars
    for (let i = 0; i < 90; i++) {
      const x = (i * 97.3 + this.t * (4 + (i % 5) * 3)) % W;
      const y = (i * 53.7) % H;
      ctx.fillStyle = i % 7 ? '#3a3048' : '#8a80a0';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
    drawText(ctx, 'HEIST', W / 2, 14, HEIST, { scale: 2, align: 'center' });
    drawText(ctx, this.name, W / 2, 34, DIM, { align: 'center' });
    const cw = 290;
    const ch = 282;
    const gap = 16;
    const x0 = Math.round(W / 2 - cw - gap / 2);
    const y0 = 52;
    const titles = ['RUN HER DOWN', 'BOARD HER'];
    titles.forEach((title, i) => {
      const on = this.at === i;
      const picked = this.chosen === i;
      const x = x0 + i * (cw + gap);
      const y = y0 - (on ? 2 : 0);
      const flash = picked && Math.floor(this.chosenT * 16) % 2 === 0;
      frame(ctx, x, y, cw, ch, flash ? '#3a3048' : on ? '#241a32' : PANEL, on ? (i ? RED : HEIST) : EDGE);
      drawText(ctx, title, x + cw / 2, y + 10, on ? INK : DIM, { scale: 2, align: 'center' });
      if (i === 1) this.board(ctx, x + 12, y + 34, cw - 24, on);
      else this.air(ctx, x + 12, y + 34, cw - 24, on);
    });
    hints(ctx, this.game.devices[0] ?? 'keys', [['move', 'CHOOSE'], ['confirm', 'GO']], W / 2, H - 16, 'center');
  }

  /** A row of pictures with a number or a word beside each, centred in `w`. */
  private row(ctx: CanvasRenderingContext2D, items: [Icon | null, string, string][], x: number, y: number, w: number, on: boolean) {
    const gap = 14;
    const widths = items.map(([ic, t]) => (ic ? iconSize(ic, 2).w + (t ? 4 : 0) : 0) + (t ? textWidth(t) : 0));
    let cx = Math.round(x + (w - widths.reduce((a, b) => a + b, 0) - gap * (items.length - 1)) / 2);
    items.forEach(([ic, t, color]) => {
      if (ic) {
        const sz = iconSize(ic, 2);
        icon(ctx, ic, cx, y + 8 - sz.h / 2, 2, !on);
        cx += sz.w + 4;
      }
      if (t) drawText(ctx, t, cx, y + 4, on ? color : DIM);
      cx += (t ? textWidth(t) : 0) + gap + (ic && !t ? -4 : 0);
    });
  }

  /** In the air: her escort, her strongboxes to catch. */
  private air(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, on: boolean) {
    this.row(ctx, [['strongbox', '\u00d73', GOLD]], x, y + 4, w, on);
    this.chase(ctx, x, y + 60, w, on);
  }

  /** Aboard: how big she is and whose, her state, the haul, the clock, the price, the scan. */
  private board(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, on: boolean) {
    const d = this.deck;
    // size: pips and the word, with whose crew she carries
    const pips = d.size + 1;
    const fam = d.family as Icon;
    const famSz = iconSize(fam, 2);
    const label = SIZE_NAME[d.size];
    const total = SIZE_NAME.length * 6 + 6 + textWidth(label) + 12 + famSz.w + (d.condition !== 'none' ? 8 + iconSize(d.condition as Icon, 2).w : 0);
    let cx = Math.round(x + (w - total) / 2);
    for (let k = 0; k < SIZE_NAME.length; k++) {
      ctx.fillStyle = k < pips ? (on ? RED : DIM) : '#3a3048';
      ctx.fillRect(cx + k * 6, y + 6, 4, 6);
    }
    cx += SIZE_NAME.length * 6 + 6;
    drawText(ctx, label, cx, y + 5, on ? INK : DIM);
    cx += textWidth(label) + 12;
    icon(ctx, fam, cx, y + 9 - famSz.h / 2, 2, !on);
    cx += famSz.w + 8;
    if (d.condition !== 'none') {
      const c = d.condition as Icon;
      icon(ctx, c, cx, y + 9 - iconSize(c, 2).h / 2, 2, !on);
    }
    // the haul
    const crates = d.props.filter((p) => p.kind === 'crate').length;
    const items: [Icon | null, string, string][] = [['crate', `\u00d7${crates}`, HEIST]];
    if (d.props.some((p) => p.kind === 'strongbox')) items.push(['strongbox', '', GOLD]);
    if (d.props.some((p) => p.kind === 'core')) items.push(['core', '', CYAN]);
    this.row(ctx, items, x, y + 26, w, on);
    // the clock and the price
    const bounty = this.run.bounty;
    this.row(
      ctx,
      [
        ['hook', mmss(this.clock), RED],
        ['skull', `+1${bounty ? ` \u2192 ${bounty + 1}` : ''}`, RED],
      ],
      x,
      y + 48,
      w,
      on,
    );
    this.plan(ctx, x, y + 82, w, on);
  }

  /** The freighter's deck, as the clamp's scan reads it: rooms, the loot's glow, the lock. */
  private plan(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, on: boolean) {
    const d = this.deck;
    const s = Math.max(1, Math.floor(Math.min(w / d.w, 100 / d.h)));
    const ox = Math.round(x + (w - d.w * s) / 2);
    const oy = y + 4;
    // the scan line sweeps across
    const sweep = ((this.t * 0.6) % 1.4) * d.w;
    for (let z = 0; z < d.h; z++)
      for (let cx = 0; cx < d.w; cx++) {
        const c = d.cell(cx, z);
        if (c === Cell.Space) continue;
        const near = Math.abs(cx - sweep) < 2;
        // the walls that face the deck are the lines of the plan; the rest is solid dark
        const edge = c === Cell.Wall && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => d.cell(cx + dx, z + dz) === Cell.Floor);
        if (c === Cell.Wall && !edge) ctx.fillStyle = '#121a20';
        else ctx.fillStyle = c === Cell.Wall ? (near ? '#8affe0' : on ? '#5a8a98' : '#3a4450') : near ? '#1a4a4a' : '#16222a';
        ctx.fillRect(ox + cx * s, oy + z * s, s, s);
      }
    const dot = (px: number, pz: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(ox + px * s - 1), Math.round(oy + pz * s - 1), Math.max(2, s), Math.max(2, s));
    };
    const blink = Math.floor(this.t * 3) % 2 === 0;
    for (const g of d.gates) dot(g.door.x, g.door.z, '#4ae8ff');
    for (const p of d.props) {
      if (p.kind === 'cage') dot(p.x, p.z, '#ff8a3a');
      else if (p.kind === 'rupture') dot(p.x, p.z, blink ? '#ffffff' : '#ff7a3a');
      else if (p.kind === 'crate') dot(p.x, p.z, HEIST);
      else if (p.kind === 'strongbox') dot(p.x, p.z, GOLD);
      else if (p.kind === 'core' && blink) dot(p.x, p.z, CYAN);
    }
    const crew = d.posts.length;
    dot(d.breach.x, d.breach.z, '#8affb0');
    // the crew, a figure each
    const fy = oy + d.h * s + 6;
    for (let k = 0; k < crew; k++) {
      const fx = x + k * 5;
      if (fx > x + w - 20) break;
      ctx.fillStyle = on ? '#ff8a6a' : DIM;
      ctx.fillRect(fx + 1, fy, 2, 2);
      ctx.fillRect(fx, fy + 3, 4, 4);
      ctx.fillRect(fx + 1, fy + 7, 2, 2);
    }
    icon(ctx, 'lock', x + w - 8, fy, 1, !on);
  }

  /** The chase: her and her strongboxes, small, sliding along. */
  private chase(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, on: boolean) {
    const cy = y + 50;
    const fx = x + w * 0.62 + Math.sin(this.t * 0.8) * 8;
    ctx.fillStyle = on ? '#8a6a4a' : '#4a3a30';
    ctx.fillRect(Math.round(fx - 30), cy - 8, 60, 16);
    ctx.fillRect(Math.round(fx + 30), cy - 5, 10, 10);
    ctx.fillStyle = on ? '#ffa040' : '#5a4030';
    ctx.fillRect(Math.round(fx - 34 - (Math.floor(this.t * 12) % 2) * 2), cy - 4, 4, 8);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = on ? HEIST : '#2a4a44';
      ctx.fillRect(Math.round(fx - 20 + k * 14), cy - 12, 8, 4);
    }
    const sx = x + 30 + Math.sin(this.t * 1.3) * 10;
    ctx.fillStyle = on ? GOLD : '#5a4a30';
    ctx.fillRect(Math.round(sx - 6), cy - 2 + Math.round(Math.cos(this.t * 2) * 4), 12, 5);
    ctx.fillRect(Math.round(sx - 2), cy - 6 + Math.round(Math.cos(this.t * 2) * 4), 4, 13);
  }
}
