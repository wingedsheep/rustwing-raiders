import type { Intent } from './types';
import type { Boarding, Hero } from './boarding';

/**
 * A stand-in for a player aboard, for testing (?bot): makes for the nearest loot not yet taken,
 * then the lock; shoots whatever the pistol finds, blasts what gets close, slides when hurt.
 */
export class BoardBot {
  private field: Int16Array;
  private goal = -1;
  private t = 0;

  constructor(private b: Boarding) {
    this.field = new Int16Array(b.deck.w * b.deck.h);
  }

  intent(h: Hero): Intent {
    const b = this.b;
    const d = b.deck;
    this.t -= 1 / 60;
    const loot = [...b.crates, ...(b.strongbox ? [b.strongbox] : [])].filter((c) => !c.open);
    const near = loot.sort((p, q) => Math.hypot(p.prop.x - h.x, p.prop.z - h.z) - Math.hypot(q.prop.x - h.x, q.prop.z - h.z))[0];
    const home = b.kelters || !near;
    const tx = home ? d.breach.x : near.prop.x;
    const tz = home ? d.breach.z : near.prop.z;
    const key = Math.floor(tx) * 1000 + Math.floor(tz);
    if (key !== this.goal || this.t <= 0) {
      d.field(tx, tz, this.field);
      this.goal = key;
      this.t = 0.5;
    }
    const at = Math.hypot(tx - h.x, tz - h.z) < 1.2;
    const dir = at ? null : d.downhill(this.field, h.x, h.z);
    const foe = b.foes.find((f) => !f.dead && f.aware && Math.hypot(f.x - h.x, f.z - h.z) < 3);
    const shot = b.rounds.some((r) => r.from === 'foe' && Math.hypot(r.x - h.x, r.z - h.z) < 1.4);
    return {
      x: dir?.x ?? 0,
      y: -(dir?.z ?? 0),
      fire: h.mark >= 0 && !at,
      heavy: !!foe && h.shells > 0,
      boost: 0,
      dash: shot || (!!foe && Math.random() < 0.05),
      special: false,
      aux: false,
      focus: false,
    };
  }
}
