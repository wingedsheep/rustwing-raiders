import type { Game, Screen } from '../game/game';
import type { Rating } from '../sim/recording';
import { audio } from '../audio';
import { input } from '../input';
import { drawText } from '../ui/font';
import { DIM, EDGE, GOLD, GREEN, H, INK, PANEL, RED, W } from '../ui/hud';
import { backdrop, hints } from '../ui/widgets';

const CHOICES: { r: Rating; name: string; color: string; key: string }[] = [
  { r: 'fun', name: 'FUN', color: GREEN, key: 'Digit1' },
  { r: 'meh', name: 'MEH', color: GOLD, key: 'Digit2' },
  { r: 'unfair', name: 'UNFAIR', color: RED, key: 'Digit3' },
];

/**
 * The flight recorder's question after a stage or a Warden (see game/recorder.ts): fun, meh or
 * unfair, one press (1, 2, 3 on the keyboard), or skipped. At the run's end, a line about it too,
 * typed into a box over the game.
 */
export class Rate implements Screen {
  private at = 1;
  private t = 0;
  private picked = false;
  private box: HTMLInputElement | null = null;

  constructor(
    private game: Game,
    private what: string,
    private askLine: boolean,
    private then: (r: Rating | null, line?: string) => void,
  ) {}

  update(dt: number) {
    this.t += dt;
    if (this.picked || this.t < 0.4) return;
    const m = this.game.menu();
    if (m.left || m.right) {
      this.at = Math.max(0, Math.min(2, this.at + (m.left ? -1 : 1)));
      audio.play('ui_move');
    }
    const key = CHOICES.findIndex((c) => input.keyPressed(c.key));
    if (key >= 0) this.pick(CHOICES[key].r);
    else if (m.confirm) this.pick(CHOICES[this.at].r);
    else if (m.back) this.pick(null);
  }

  private pick(r: Rating | null) {
    this.picked = true;
    audio.play(r ? 'ui_select' : 'ui_back');
    if (!this.askLine) return this.then(r);
    // the run's over: a line about it, if they want
    const box = (this.box = document.createElement('input'));
    box.placeholder = 'One line about the run (Enter to send, Esc to skip)';
    Object.assign(box.style, {
      position: 'fixed', left: '50%', top: '62%', transform: 'translateX(-50%)', width: 'min(560px, 90vw)', padding: '10px 12px',
      font: '16px monospace', color: INK, background: PANEL, border: `2px solid ${EDGE}`, outline: 'none', zIndex: '10',
    });
    document.body.appendChild(box);
    box.focus();
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      const line = e.key === 'Enter' ? box.value.trim() : '';
      box.remove();
      this.box = null;
      this.then(r, line || undefined);
    });
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    backdrop(ctx);
    drawText(ctx, 'HOW WAS THAT?', W / 2, 100, INK, { scale: 3, align: 'center' });
    drawText(ctx, this.what, W / 2, 130, DIM, { align: 'center' });
    CHOICES.forEach((c, k) => {
      const x = W / 2 - 150 + k * 105;
      const on = k === this.at && !this.picked;
      ctx.fillStyle = PANEL;
      ctx.fillRect(x, 160, 90, 40);
      ctx.strokeStyle = on ? c.color : EDGE;
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(x + 0.5, 160.5, 89, 39);
      drawText(ctx, c.name, x + 45, 172, on ? c.color : DIM, { scale: 2, align: 'center' });
      drawText(ctx, `${k + 1}`, x + 45, 206, DIM, { align: 'center' });
    });
    if (this.box) drawText(ctx, 'AND THE RUN?', W / 2, 240, INK, { align: 'center' });
    else if (!this.picked) hints(ctx, g.hintDevices(), [['move', 'CHOOSE'], ['confirm', 'SEND'], ['back', 'SKIP']], W / 2, 300, 'center');
    drawText(ctx, 'FOR THE FLIGHT RECORDER', W / 2, 330, '#4a3e58', { align: 'center' });
  }

  dispose() {
    this.box?.remove();
  }
}
