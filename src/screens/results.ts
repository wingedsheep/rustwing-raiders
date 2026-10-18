import type { Game, Screen } from '../game/game';
import type { FlightResult } from './flight';
import type { LevelSpec } from '../sim/level';
import { CARGO, Run, SELL } from '../sim/run';
import { partById } from '../game/parts';
import { audio } from '../audio';
import { drawText } from '../ui/font';
import { CYAN, DIM, GOLD, GREEN, INK, W, frame, hex } from '../ui/hud';
import { LIVERY } from '../view/ship-model';
import { backdrop, heading, hints, partCard } from '../ui/widgets';

interface Pick {
  options: string[];
  /** Cursor: 0..2 the parts, 3 scrap it. */
  at: number;
  done: boolean;
  /** What was picked up flying, already in the hold. */
  salvaged: string[];
  /** Parts that didn't fit in the hold and went for scrap. */
  scrapped: string[];
}

/**
 * After a level: what you salvaged on the way (straight into the hold), then each player picks
 * one of three parts, or takes the scrap instead.
 */
export class Results implements Screen {
  private picks: Pick[];
  private t = 0;
  private leaving = -1;

  constructor(
    private game: Game,
    private run: Run,
    private res: FlightResult,
    private spec: LevelSpec,
    private onDone: () => void,
  ) {
    const rich = spec.mode === 'hunt' || spec.mode === 'boss';
    this.picks = run.crew.map((_, i) => {
      const salvaged: string[] = [];
      const scrapped: string[] = [];
      for (const id of res.loot[i] ?? []) (run.stow(i, id) ? salvaged : scrapped).push(id);
      return { options: run.lootChoice(spec.seed * 31 + i * 7 + run.levels, rich), at: 0, done: false, salvaged, scrapped };
    });
    audio.music('hangar');
  }

  update(dt: number) {
    this.t += dt;
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving > 0.35) this.onDone();
      return;
    }
    if (this.t < 0.4) return;
    this.picks.forEach((p, i) => {
      if (p.done) return;
      const m = this.game.menuOf(this.game.devices[i] ?? 'keys');
      if (m.up) p.at = (p.at + 3) % 4;
      if (m.down) p.at = (p.at + 1) % 4;
      if (m.up || m.down) audio.play('ui_move');
      if (m.confirm) {
        if (p.at < 3) {
          const id = p.options[p.at];
          if (this.run.stow(i, id)) audio.play('pickup_part');
          else {
            p.scrapped.push(id);
            audio.play('pickup_scrap');
          }
        } else {
          this.run.scrap += this.scrapValue(p);
          audio.play('pickup_scrap');
        }
        p.done = true;
      }
    });
    if (this.picks.every((p) => p.done)) this.leaving = 0;
  }

  private scrapValue(p: Pick) {
    return Math.max(...p.options.map((id) => SELL[partById(id).rarity])) + 10;
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, 360);
    backdrop(ctx);
    const boss = this.spec.mode === 'boss';
    heading(ctx, boss ? 'WARDEN DOWN' : `${this.spec.planet.name.toUpperCase()} CLEAR`, `+${this.res.scrap} SCRAP   ${this.res.score} POINTS   ${this.run.scrap} SCRAP IN THE TIN`, boss ? GOLD : INK);
    // the rank, stamped in the corner, and what earned it
    const r = this.res.report;
    if (r?.rank) {
      const pop = Math.min(1, this.t * 4);
      drawText(ctx, r.rank, W - 34, 8, RANK_COLOR[r.rank] ?? INK, { scale: pop < 1 ? 6 : 5, align: 'center' });
      drawText(ctx, 'RANK', W - 34, 46, DIM, { align: 'center' });
    }
    r?.lines.forEach((l, k) => drawText(ctx, l, W / 2, 46 + k * 9, k ? DIM : INK, { align: 'center' }));
    const n = this.picks.length;
    const colW = n === 1 ? 280 : 300;
    this.picks.forEach((p, i) => {
      const x = n === 1 ? (W - colW) / 2 : 14 + i * (colW + 12);
      this.column(ctx, p, i, x, 54 + (r?.lines.length ?? 0) * 9 + (r?.lines.length ? 4 : 0), colW);
    });
  }

  private column(ctx: CanvasRenderingContext2D, p: Pick, i: number, x: number, y: number, w: number) {
    const crew = this.run.crew[i];
    const st = this.res.stats[i];
    const col = hex(LIVERY[i][2]);
    frame(ctx, x, y, w, 24);
    drawText(ctx, `P${i + 1}`, x + 6, y + 5, col, { scale: 2 });
    drawText(ctx, `${st.kills} KILLS  ${st.grazes} GRAZES  ${st.hits} HITS`, x + 34, y + 5, INK);
    drawText(ctx, `HOLD ${crew.cargo.length}/${CARGO}`, x + 34, y + 14, crew.cargo.length >= CARGO ? GOLD : DIM);
    y += 30;
    if (p.salvaged.length || p.scrapped.length) {
      const s = p.salvaged.map((id) => partById(id).name).join(', ');
      if (s) drawText(ctx, `SALVAGED: ${s}`.slice(0, Math.floor(w / 6)), x + 2, y, GREEN);
      if (p.scrapped.length) drawText(ctx, `HOLD FULL: ${p.scrapped.length} SOLD FOR SCRAP`, x + 2, y + 9, GOLD);
      y += p.scrapped.length && s ? 20 : 11;
    }
    drawText(ctx, p.done ? 'DONE' : 'CHOOSE ONE', x + 2, y, p.done ? CYAN : INK);
    y += 12;
    p.options.forEach((id, k) => {
      const on = !p.done && p.at === k;
      y += partCard(ctx, id, x + 6, y, w - 6, on, { compact: this.picks.length > 1 || !on }) + 5;
    });
    const on = !p.done && p.at === 3;
    frame(ctx, x + 6, y, w - 6, 16, on ? '#2c2240' : '#1c1526', on ? GOLD : '#3a2e48');
    drawText(ctx, `NONE OF THESE: +${this.scrapValue(p)} SCRAP`, x + 12, y + 5, on ? GOLD : DIM);
    if (on) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(x + 2, y + 4, 2, 8);
    }
    y += 24;
    if (!p.done) hints(ctx, this.game.devices[i] ?? 'keys', [['move', 'CHOOSE'], ['confirm', 'TAKE']], x + w / 2, Math.min(y, 346), 'center');
  }
}

const RANK_COLOR: Record<string, string> = { S: '#ffd04a', A: '#8affe0', B: '#e8e0f0', C: '#a08aa8' };
