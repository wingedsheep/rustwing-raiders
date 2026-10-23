/**
 * The sound levels on the pause screens: up/down picks MASTER, MUSIC or SFX, left/right turns it
 * a notch (ten notches, saved for next time).
 */

import { audio } from '../audio';
import type { MenuInput } from '../input';
import { drawText, textWidth } from './font';
import { DARK, DIM, EDGE, GOLD, INK, frame } from './hud';

const ROWS = [
  ['master', 'MASTER'],
  ['music', 'MUSIC'],
  ['sfx', 'SFX'],
] as const;
const NOTCHES = 10;
export const SOUND_W = 200;
export const SOUND_H = ROWS.length * 12 + 10;

export class SoundPanel {
  row = 0;

  update(m: MenuInput) {
    if (m.up || m.down) {
      this.row = (this.row + (m.up ? ROWS.length - 1 : 1)) % ROWS.length;
      audio.play('ui_move');
    }
    if (m.left || m.right) {
      const v = audio.volumes;
      const k = ROWS[this.row][0];
      const was = Math.round(v[k] * NOTCHES);
      const now = Math.min(NOTCHES, Math.max(0, was + (m.left ? -1 : 1)));
      if (now === was) return audio.play('ui_error');
      v[k] = now / NOTCHES;
      audio.volume(v.master, v.music, v.sfx);
      // (heard at the new level, so the turn is the test)
      audio.play('ui_move');
    }
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    frame(ctx, x, y, SOUND_W, SOUND_H, 'rgba(18,12,24,0.94)', EDGE);
    const v = audio.volumes;
    ROWS.forEach(([k, word], i) => {
      const on = i === this.row;
      const ry = y + 6 + i * 12;
      if (on) drawText(ctx, '>', x + 8, ry, GOLD);
      drawText(ctx, word, x + 18, ry, on ? INK : DIM);
      const bx = x + 18 + textWidth('MASTER') + 10;
      const n = Math.round(v[k] * NOTCHES);
      for (let j = 0; j < NOTCHES; j++) {
        ctx.fillStyle = j < n ? (on ? GOLD : DIM) : DARK;
        ctx.fillRect(bx + j * 8, ry, 6, 7);
      }
      drawText(ctx, n ? `${n * 10}%` : 'OFF', x + SOUND_W - 8, ry, on ? INK : DIM, { align: 'right' });
    });
  }
}
