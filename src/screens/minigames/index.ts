import type { MiniKind, Setup } from '../../sim/events';
import type { Minigame } from './common';
import { Tow } from './tow';
import { Tune } from './tune';
import { Grab } from './grab';
import { Reels } from './reels';
import { Dock } from './dock';
import { Thread } from './thread';
import { Haggle } from './haggle';
import { Shake } from './shake';

export type { Minigame, Pad } from './common';
export { levelInfo } from './common';

/** A game of `kind` at `level` (1 easy .. 5 deadly). */
export function minigame(kind: MiniKind, level: number, seed: number, setup: Setup = {}): Minigame {
  switch (kind) {
    case 'tow':
      return new Tow(level, seed);
    case 'tune':
      return new Tune(level, seed);
    case 'grab':
      return new Grab(level, seed);
    case 'reels':
      return new Reels(level, seed);
    case 'dock':
      return new Dock(level, seed);
    case 'thread':
      return new Thread(level, seed);
    case 'haggle':
      return new Haggle(level, seed, setup);
    case 'shake':
      return new Shake(level, seed);
  }
}
