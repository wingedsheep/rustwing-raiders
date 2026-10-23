import type { Intent } from './types';
import { angleDiff, FOES, GATE, HERO, type Boarding, type FoeState, type Hero } from './boarding';

/** The tells it slides on, as they end. */
const TELLS = new Set<FoeState>(['aim', 'windup', 'shove', 'rear', 'swell', 'charge', 'rumble', 'ignite']);

/**
 * A stand-in for a player aboard, for testing (?bot) and the balance bench (tools/board-sim.ts):
 * makes for the nearest loot not yet taken (the core too, with time in hand), then the lock;
 * hauls a downed partner up; shoots whatever the pistol finds, blasts what gets close, slides
 * into the open and through shots, gates and lances, and out of spores.
 */
export class BoardBot {
  private fields = new Map<number, { f: Int16Array; key: number; t: number }>();
  private dashT = new Map<number, number>();

  constructor(private b: Boarding) {}

  private path(h: Hero, tx: number, tz: number) {
    const d = this.b.deck;
    let e = this.fields.get(h.id);
    if (!e) {
      e = { f: new Int16Array(d.w * d.h), key: -1, t: 0 };
      this.fields.set(h.id, e);
    }
    e.t -= 1 / 60;
    const key = Math.floor(tx) * 1000 + Math.floor(tz);
    if (key !== e.key || e.t <= 0) {
      d.field(tx, tz, e.f);
      e.key = key;
      e.t = 0.5;
    }
    return d.downhill(e.f, h.x, h.z);
  }

  /** Where it's going: a partner to haul up, the core where it lies, loot, or home. */
  private goal(h: Hero): { x: number; z: number } {
    const b = this.b;
    const d = b.deck;
    const home = { x: d.breach.x + 1, z: d.breach.z };
    if (h.carry) return home;
    const down = b.heroes.find((o) => o !== h && o.down && !o.out);
    if (down && Math.hypot(down.x - h.x, down.z - h.z) < 18) return down;
    if (b.heart && b.heart.carrier < 0) return b.heart;
    // an arm close by, hands empty
    if (!h.arm) {
      const a = b.arms.find((x) => Math.hypot(x.x - h.x, x.z - h.z) < 5 && b.deck.clear(h.x, h.z, x.x, x.z));
      if (a) return a;
    }
    const left = b.timeLeft;
    if (b.kelters && left < 18) return home;
    const loot = [...b.crates, ...(b.strongbox ? [b.strongbox] : [])].filter((c) => !c.open).map((c) => c.prop);
    // the core, if there's time in hand and the rest is done
    if (!loot.length && b.core && !b.core.open && !b.kelters && left > 30) loot.push(b.core.prop);
    // far loot with the clock short isn't worth it
    const near = loot.sort((p, q) => Math.hypot(p.x - h.x, p.z - h.z) - Math.hypot(q.x - h.x, q.z - h.z))[0];
    if (!near || (b.kelters && Math.hypot(near.x - h.x, near.z - h.z) > left * 1.2)) return home;
    return near;
  }

  intent(h: Hero): Intent {
    const b = this.b;
    const d = b.deck;
    const g = this.goal(h);
    const at = Math.hypot(g.x - h.x, g.z - h.z) < 1.1;
    let dir = at ? null : this.path(h, g.x, g.z);
    let mx = dir?.x ?? 0;
    let mz = dir?.z ?? 0;
    // out of spores
    for (const c of b.clouds) {
      const dd = Math.hypot(h.x - c.x, h.z - c.z);
      if (dd < c.r + 0.5 && dd > 0.01) {
        mx += ((h.x - c.x) / dd) * 1.2;
        mz += ((h.z - c.z) / dd) * 1.2;
      }
    }
    // off fire, seals and live steam
    const away = (x: number, z: number, r: number, k: number) => {
      const dd = Math.hypot(h.x - x, h.z - z);
      if (dd < r && dd > 0.01) {
        mx += ((h.x - x) / dd) * k;
        mz += ((h.z - z) / dd) * k;
      }
    };
    for (const f of b.fires) away(f.x, f.z, f.r + 0.6, 1.5);
    for (const s of b.seals) away(s.x, s.z, 1.6, 1.6);
    // out of a torcher's cone: round its side
    for (const f of b.foes) {
      if (f.dead || f.kind !== 'torcher' || (f.state !== 'ignite' && f.state !== 'spray')) continue;
      const dd = Math.hypot(h.x - f.x, h.z - f.z);
      if (dd > 5) continue;
      const side = angleDiff(Math.atan2(h.z - f.z, h.x - f.x), f.face) > 0 ? 1 : -1;
      mx += -Math.sin(f.face) * side * 2.5;
      mz += Math.cos(f.face) * side * 2.5;
    }
    for (const s of b.steams) {
      if (!(s.on || s.warm) || !b.inJet(s, h.x, h.z, 0.6)) continue;
      // step out sideways
      const side = -Math.sin(s.a) * (h.x - s.x) + Math.cos(s.a) * (h.z - s.z) > 0 ? 1 : -1;
      mx += -Math.sin(s.a) * side * 2;
      mz += Math.cos(s.a) * side * 2;
    }
    // the breach's pull: lean away
    const rp = d.rupture;
    if (rp && b.venting) {
      const dd = Math.hypot(h.x - rp.x, h.z - rp.z);
      if (dd < 7) {
        mx += ((h.x - rp.x) / dd) * 1.5;
        mz += ((h.z - rp.z) / dd) * 1.5;
      }
    }
    let dash = false;
    let dashX = mx;
    let dashZ = mz;
    // shots on the way in, lances and aim lines locked on: slide (sideways to an aim)
    const shot = b.rounds.some((r) => r.from === 'foe' && Math.hypot(r.x - h.x, r.z - h.z) < 1.5);
    for (const f of b.foes) {
      if (f.dead || !TELLS.has(f.state)) continue;
      const close = f.t < 0.15;
      const dd = Math.hypot(f.x - h.x, f.z - h.z);
      if (!close || dd > (f.state === 'aim' ? 16 : 7)) continue;
      // off the line it's coming down
      const a = f.state === 'aim' ? f.aimA : Math.atan2(h.z - f.z, h.x - f.x);
      const side = Math.sin(this.b.time * 3 + h.id) > 0 ? 1 : -1;
      dashX = -Math.sin(a) * side;
      dashZ = Math.cos(a) * side;
      dash = true;
    }
    if (shot) dash = true;
    // an open foe near: slide into it
    const open = b.foes.find((f) => !f.dead && f.state !== 'caged' && !f.under && (f.open > 0.3 || (!f.aware && f.kind !== 'skulk')) && Math.hypot(f.x - h.x, f.z - h.z) < 3.5 && d.clear(h.x, h.z, f.x, f.z));
    if (open && !h.carry) {
      dash = true;
      dashX = open.x - h.x;
      dashZ = open.z - h.z;
    }
    // a gate coming on ahead: slide through it
    for (const gs of b.gates) {
      const door = gs.gate.door;
      const dd = Math.hypot(door.x - h.x, door.z - h.z);
      const p = b.gatePhase(gs);
      if (dd < 2.2 && (gs.on || p > GATE.off - 0.25)) {
        dash = true;
        dashX = mx;
        dashZ = mz;
      }
    }
    const cd = (this.dashT.get(h.id) ?? 0) - 1 / 60;
    this.dashT.set(h.id, cd);
    if (dash && cd > 0) dash = false;
    if (dash) {
      this.dashT.set(h.id, HERO.dashT + HERO.dashCd + 0.1);
      mx = dashX;
      mz = dashZ;
    }
    const foe = b.foes.find((f) => !f.dead && f.aware && f.state !== 'caged' && Math.hypot(f.x - h.x, f.z - h.z) < (FOES[f.kind].role === 'heavy' ? 4 : 3));
    const l = Math.hypot(mx, mz) || 1;
    // not into a warden's wall (it comes back)
    const mark = b.foes.find((f) => f.id === h.mark);
    const walled = !!mark && mark.kind === 'warden' && mark.wall > 0 && mark.open <= 0 && Math.abs(angleDiff(Math.atan2(h.z - mark.z, h.x - mark.x), mark.face)) < 1.1;
    return {
      x: mx / l,
      y: -(mz / l),
      fire: h.mark >= 0 && !at && !h.carry && !walled,
      heavy: !!foe && h.shells > 0 && !h.carry,
      boost: 0,
      dash,
      special: false,
      aux: false,
      focus: false,
    };
  }
}
