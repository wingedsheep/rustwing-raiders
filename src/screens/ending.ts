import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import { audio } from '../audio';
import { drawText, wrap } from '../ui/font';
import { DIM, GOLD, H, INK, RED, W, frame } from '../ui/hud';
import { backdrop, hints } from '../ui/widgets';

/** The end of a run, one way or the other: how far, what it was worth, and back to the title. */
export class Ending implements Screen {
  private t = 0;

  constructor(
    private game: Game,
    private run: Run,
    private won: boolean,
    private line: string,
  ) {
    audio.music(won ? 'title' : null);
    audio.play(won ? 'level_clear' : 'player_down');
  }

  update(dt: number) {
    this.t += dt;
    if (this.t > 1.2 && this.game.menu().confirm) {
      audio.play('ui_select');
      this.game.run = null;
      import('./title').then(({ Title }) => this.game.go(new Title(this.game)));
    }
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    backdrop(ctx);
    const r = this.run;
    drawText(ctx, this.won ? 'FREE AND CLEAR' : 'THE RUN IS OVER', W / 2, 50, this.won ? GOLD : RED, { scale: 3, align: 'center' });
    wrap(this.line, 400).forEach((l, k) => drawText(ctx, l, W / 2, 84 + k * 10, INK, { align: 'center' }));
    frame(ctx, 200, 120, 240, 130);
    const rows: [string, string][] = [
      ['SECTOR', `${r.sector + 1} / 3`],
      ['LANDINGS', `${r.levels}`],
      ['WARDENS', `${r.stats.bosses}`],
      ['KILLS', `${r.stats.kills}`],
      ['GRAZES', `${r.stats.grazes}`],
      ['HITS TAKEN', `${r.stats.hits}`],
      ['SCRAP', `${r.scrap}`],
      ['SCORE', `${r.score}`],
    ];
    rows.forEach(([a, b], k) => {
      drawText(ctx, a, 214, 132 + k * 14, DIM);
      drawText(ctx, b, 426, 132 + k * 14, k === rows.length - 1 ? GOLD : INK, { align: 'right' });
    });
    drawText(ctx, `RUN ${r.seed}`, W / 2, 262, '#4a3e58', { align: 'center' });
    if (this.t > 1.2) hints(ctx, g.devices[0] ?? 'keys', [['confirm', 'TITLE']], W / 2, 300, 'center');
  }
}
