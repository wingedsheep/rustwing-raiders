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

export function minigame(kind: MiniKind, bold: boolean, seed: number, setup: Setup = {}): Minigame {
  switch (kind) {
    case 'tow':
      return new Tow(bold, seed);
    case 'tune':
      return new Tune(bold, seed);
    case 'grab':
      return new Grab(bold, seed);
    case 'reels':
      return new Reels(bold, seed);
    case 'dock':
      return new Dock(bold, seed);
    case 'thread':
      return new Thread(bold, seed);
    case 'haggle':
      return new Haggle(bold, seed, setup);
    case 'shake':
      return new Shake(bold, seed);
  }
}
