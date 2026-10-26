/**
 * The arsenal's dials, and the combos: what a shot does to what it hits beyond hurting it, and
 * what a blow does to an enemy that's been set up. See docs/parts-variety.md.
 *
 * What a gun can leave on an enemy (set on its GunSpec):
 *
 * - CHILL: stacks; four and it's FROZEN solid: it can't act or move. Fire and ice meeting put each
 *   other out, and QUENCH it: the hull cracks (a chill on a burn; a burn on the ice cracks it while
 *   it's still alight, and so it cooks off).
 * - SHOVE: knocked flying. A flung body that hits another enemy is a blow on both.
 * - PIN: nailed in place for a few seconds. It still shoots; it can't move.
 *
 * And how its shots fly: they bounce off the screen's edge, home in, phase through shields and
 * plating, or (a heavy's round) ripen in the chamber.
 *
 * COMBOS (`lv.combos`): a blow on an enemy that's been set up cashes the setup in, once:
 *
 * - FROZEN → SMASH: the blow hits double; the ice bursts, chilling what's round it.
 * - PINNED → NAILED: it takes all of it; its plating goes, and what's round it is thrown back.
 * - BURN at full stacks → FLARE-UP: the burn still to come, all at once, as a fireball.
 * - SHOCK → GROUND-OUT: the blow runs down the lightning to every shocked enemy on screen.
 * - CRACK → BREACH: straight through: its plating goes, and the crack spreads to its neighbours.
 *
 * Every payoff spills a setup on its neighbours, so a cash-in primes the next: a chain.
 */

import type { Enemy, Level, Shot } from './level';
import type { Edge, GunSpec } from '../game/parts';
import { BURN, CRACK, SHOCK, BURN_DPS, mark } from './marks';
import { hullGrowth } from './level';
import { isFoe } from './factions';
import { DT } from './types';

/** What an enemy carries from the arsenal's dials. */
export interface Ax {
  chill: number;
  chillT: number;
  frozen: number;
  /** Bosses and elites shrug off a second freeze or pin for this long. */
  proof: number;
  pin: number;
  px: number;
  pz: number;
  /** Knocked flying: seconds it's a body that hits things, and who threw it. */
  flung: number;
  by: number;
  /** Just knocked into: it can't be knocked into again yet, so a knot of bodies doesn't thud every frame. */
  bumped: number;
  /** Where it was before it moved this frame (to slow it, or hold it). */
  ox: number;
  oz: number;
}

/** What a shot carries from its gun's dials. */
export interface ShotAx {
  chill: number;
  shove: number;
  pin: number;
  phase: boolean;
  walls: number;
  size: number;
  tint?: number;
}

export type CashKind = 'smash' | 'nailed' | 'flareup' | 'groundout' | 'breach';

export const CASH: Record<CashKind, { name: string; color: string; hex: number }> = {
  smash: { name: 'SMASH', color: '#bff4ff', hex: 0xbff4ff },
  nailed: { name: 'NAILED', color: '#ffd08a', hex: 0xffb04a },
  flareup: { name: 'FLARE-UP', color: '#ff8a3a', hex: 0xff7a2a },
  groundout: { name: 'GROUND-OUT', color: '#c8b8ff', hex: 0xb8a8ff },
  breach: { name: 'BREACH', color: '#ffe8a0', hex: 0xffe08a },
};

// The numbers.
const CHILL_TIME = 3;
const FREEZE_AT = 4;
/** Each chill stack slows it this much more (as a share of its speed). */
const CHILL_SLOW = 0.15;
const FROZEN = { foe: 2, elite: 1.2, boss: 0.6 };
const PROOF = 4;
const PIN_ELITE = 0.5;
const FLING = { speed: 26, time: 0.7, dmg: 14 };
const SMASH_K = 2;
const SMASH_R = 7;
const NAILED_K = 1.5;
const NAILED_R = 6;
const FLARE_K = 1.5;
const FLARE_R = 4.5;
const GROUND_K = 0.6;
const BREACH_K = 1.5;
const BREACH_R = 8;
/** How deep one cash-in may set off the next (a chain), within one blow. */
const CHAIN_DEPTH = 4;

/** Who set each setup up (a part's id, or a payoff's name): a part's blow doesn't cash in its own. */
type SetupKind = 'burn' | 'shock' | 'crack' | 'ice' | 'pin';
const setters = new WeakMap<Enemy, Partial<Record<SetupKind, string | null>>>();
export function noteSetup(e: Enemy, kind: SetupKind, by: string | null) {
  let m = setters.get(e);
  if (!m) setters.set(e, (m = {}));
  m[kind] = by;
}

export const axOf = (e: Enemy): Ax => (e.ax ??= { chill: 0, chillT: 0, frozen: 0, proof: 0, pin: 0, px: 0, pz: 0, flung: 0, by: 0, bumped: 0, ox: e.x, oz: e.z });

/** Does this gun's spec do anything here? */
const dialled = (sp: GunSpec) => !!(sp.chill || sp.shove || sp.pin || sp.phase || sp.bounce || sp.size || sp.tint);

/** A shot leaving the gun: it takes the gun's dials. */
export function armShot(s: Shot, sp: GunSpec, ripe = 1) {
  if (sp.homing) s.homing = Math.max(s.homing, sp.homing * 2.5);
  if (!dialled(sp) && ripe === 1) return;
  const size = (sp.size ?? 1) * (ripe > 1 ? 1 + (ripe - 1) * 0.8 : 1);
  s.ax = { chill: sp.chill ?? 0, shove: sp.shove ?? 0, pin: sp.pin ?? 0, phase: !!sp.phase, walls: sp.bounce ?? 0, size, tint: sp.tint };
  if (sp.bounce) s.bounce = Math.max(s.bounce, sp.bounce);
  s.r *= size;
}

/** A heavy round's ripening: how much harder it is for the time it sat in the chamber. */
const lastShot = new WeakMap<object, number>();
export function ripeness(lv: Level, gun: object, sp: GunSpec) {
  if (!sp.ripen) return 1;
  const since = lv.time - (lastShot.get(gun) ?? 0);
  lastShot.set(gun, lv.time);
  return 1 + sp.ripen * Math.min(1, since / 3);
}

/** How ripe the round in this gun is now, 0 (just fired) .. 1 (full), for the view; read only. */
export function ripened(lv: Level, gun: object, sp: GunSpec) {
  if (!sp.ripen) return 0;
  return Math.min(1, (lv.time - (lastShot.get(gun) ?? 0)) / 3);
}

/** A shot has hit `e` (and it's still there): what its dials leave on it. */
export function shotLanded(lv: Level, s: Shot, e: Enemy) {
  const a = s.ax;
  if (!a || e.dead) return;
  if (a.chill) chill(lv, e, a.chill, s.owner);
  if (a.pin) pin(lv, e, a.pin);
  if (a.shove) {
    const sp = Math.hypot(s.vx, s.vz) || 1;
    shove(lv, e, s.vx / sp, s.vz / sp, a.shove, s.owner);
  }
}

export function chill(lv: Level, e: Enemy, n: number, owner: number) {
  if (e.dead || e.shielded) return;
  const a = axOf(e);
  // ice on fire: it douses it, and the hull cracks with the shock
  if (e.mk.burn > 0) {
    e.mk.burn = 0;
    e.mk.stacks = 0;
    lv.emit({ type: 'douse', enemy: e.id, x: e.x, z: e.z });
    mark(lv, e, CRACK, 1, owner);
  }
  if (a.frozen > 0) return;
  a.chill += n;
  a.chillT = CHILL_TIME;
  a.by = owner;
  if (a.chill >= FREEZE_AT && a.proof <= 0) {
    a.chill = 0;
    a.frozen = e.boss ? FROZEN.boss : e.elite ? FROZEN.elite : FROZEN.foe;
    if (e.boss || e.elite) a.proof = PROOF;
    noteSetup(e, 'ice', lv.credit);
    lv.emit({ type: 'freeze', enemy: e.id, x: e.x, z: e.z });
  }
}

export function pin(lv: Level, e: Enemy, secs: number) {
  if (e.dead || e.shielded || e.boss) return;
  const a = axOf(e);
  if (a.proof > 0 && e.elite) return;
  a.pin = Math.max(a.pin, e.elite ? secs * PIN_ELITE : secs);
  a.px = e.x;
  a.pz = e.z;
  if (e.elite) a.proof = PROOF;
  noteSetup(e, 'pin', lv.credit);
  lv.emit({ type: 'pin', enemy: e.id, x: e.x, z: e.z });
}

export function shove(lv: Level, e: Enemy, dx: number, dz: number, k: number, owner: number) {
  if (e.dead || e.boss || e.ground) return;
  const a = axOf(e);
  // pinned, it can't roll with it: the shove is a blow instead (which cashes the pin)
  if (a.pin > 0) {
    lv.asBlow(() => lv.damage(e, FLING.dmg * k * hullGrowth(lv.spec.difficulty) * 0.5, owner, false, null));
    return;
  }
  const w = (e.elite ? 0.4 : 1) * k;
  e.kx = (e.kx ?? 0) + dx * FLING.speed * w;
  e.kz = (e.kz ?? 0) + dz * FLING.speed * w;
  a.flung = FLING.time;
  a.by = owner;
}

/** Before it moves this frame (after the screen has carried it). */
export function preMove(e: Enemy, dz: number) {
  const a = e.ax;
  if (!a) return;
  a.ox = e.x;
  a.oz = e.z;
  if (a.pin > 0 && !e.ground) a.pz -= dz;
}

/** After it's moved: chill slows it, ice and pins hold it, a flung body hits what it meets. */
export function tickAx(lv: Level, e: Enemy) {
  const a = e.ax;
  if (!a || e.dead) return;
  if (a.proof > 0) a.proof -= DT;
  if (a.bumped > 0) a.bumped -= DT;
  // a burn thaws the ice, and cracks the hull under it: still alight, it cooks off
  if (a.frozen > 0 && e.mk.burn > 0) {
    a.frozen = 0;
    lv.emit({ type: 'thaw', enemy: e.id, x: e.x, z: e.z });
    lv.emit({ type: 'douse', enemy: e.id, x: e.x, z: e.z });
    mark(lv, e, CRACK, 1, e.mk.by);
  }
  let hold = 1;
  if (a.chill > 0) {
    if ((a.chillT -= DT) <= 0) a.chill = 0;
    hold = 1 - CHILL_SLOW * a.chill;
    if (isFoe(e.arch)) e.stateT -= DT * CHILL_SLOW * a.chill;
  }
  if (a.frozen > 0) {
    a.frozen -= DT;
    hold = e.boss ? 0.3 : 0;
    if (!e.boss) e.stun = Math.max(e.stun, DT * 2);
    if (a.frozen <= 0) lv.emit({ type: 'thaw', enemy: e.id, x: e.x, z: e.z });
  }
  if (hold < 1 && !(e.kx || e.kz)) {
    e.x = a.ox + (e.x - a.ox) * hold;
    e.z = a.oz + (e.z - a.oz) * hold;
  }
  if (a.pin > 0) {
    a.pin -= DT;
    e.x = a.px;
    e.z = a.pz;
    e.kx = e.kz = 0;
  }
  if (a.flung > 0) {
    a.flung -= DT;
    if (Math.hypot(e.kx ?? 0, e.kz ?? 0) < 6) a.flung = 0;
    else {
      const hit = lv.enemies.find((o) => o !== e && !o.dead && !o.shielded && o.t >= 0 && !(o.ax && o.ax.bumped > 0) && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < (o.r + e.r) ** 2);
      if (hit) thud(lv, e, hit, a.by);
      else if (lv.terrain.solid(e.x, e.z, 0)) thud(lv, e, null, a.by);
    }
  }
}

/** How long a body that's been knocked into is spared another thud. */
const BUMPED = 0.4;

/** A flung body hits something: a blow on both. */
function thud(lv: Level, e: Enemy, o: Enemy | null, owner: number) {
  const a = axOf(e);
  a.flung = 0;
  a.bumped = BUMPED;
  if (o) axOf(o).bumped = BUMPED;
  const dmg = FLING.dmg * hullGrowth(lv.spec.difficulty);
  lv.emit({ type: 'thud', x: o ? (e.x + o.x) / 2 : e.x, z: o ? (e.z + o.z) / 2 : e.z });
  lv.credited('FLUNG', () =>
    lv.asBlow(() => {
      lv.damage(e, dmg, owner, false, null);
      if (o) {
        lv.damage(o, dmg, owner, false, null);
        // and passes some of the push on
        o.kx = (o.kx ?? 0) + (e.kx ?? 0) * 0.5;
        o.kz = (o.kz ?? 0) + (e.kz ?? 0) * 0.5;
        if (!o.boss && !o.ground) axOf(o).flung = FLING.time * 0.5;
      }
    }),
  );
  e.kx = (e.kx ?? 0) * -0.3;
  e.kz = (e.kz ?? 0) * -0.3;
}

/** The arsenal's edges. */
export function axEdge(edge: Edge, e: Enemy) {
  const a = e.ax;
  if (!a) return false;
  if (edge === 'frozen') return a.frozen > 0 || a.chill > 0;
  if (edge === 'pinned') return a.pin > 0;
  return a.flung > 0;
}

const SETUP_OF: Record<CashKind, SetupKind> = { smash: 'ice', nailed: 'pin', flareup: 'burn', groundout: 'shock', breach: 'crack' };

// --- combos -----------------------------------------------------------------------------

const depth = new WeakMap<Level, number>();

/**
 * A blow is landing on `e`: if it's set up, cash it in. Returns what the blow's damage is
 * multiplied by (1: nothing to cash).
 */
export function cashIn(lv: Level, e: Enemy, owner: number, by: string | null): number {
  if (!lv.combos || e.dead) return 1;
  const d = depth.get(lv) ?? 0;
  if (d >= CHAIN_DEPTH) return 1;
  const a = e.ax;
  const m = e.mk;
  let kind: CashKind | null = null;
  if (a && a.frozen > 0) kind = 'smash';
  else if (a && a.pin > 0) kind = 'nailed';
  else if (m.burn > 0 && m.stacks >= 3) kind = 'flareup';
  else if (m.shock > 0) kind = 'groundout';
  else if (m.crack > 0) kind = 'breach';
  if (!kind) return 1;
  // two parts that need each other: a gun doesn't cash in what it set up itself
  const set = setters.get(e)?.[SETUP_OF[kind]];
  if (by && set === by) return 1;
  depth.set(lv, d + 1);
  lv.cashed[kind] = (lv.cashed[kind] ?? 0) + 1;
  const near = (r: number) => lv.enemies.filter((o) => o !== e && !o.dead && !o.shielded && o.t >= 0 && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < r * r);
  const to: { x: number; z: number }[] = [];
  let k = 1;
  const name = CASH[kind].name;
  try {
    lv.credited(name, () => {
      if (kind === 'smash') {
        a!.frozen = 0;
        k = SMASH_K;
        // the ice bursts: shards chill (and so maybe freeze) what's round it
        for (const o of near(SMASH_R)) {
          chill(lv, o, 2, owner);
          to.push({ x: o.x, z: o.z });
        }
      } else if (kind === 'nailed') {
        a!.pin = 0;
        k = NAILED_K;
        if (e.armour > 0) lv.breakPlating(e, owner);
        for (const o of near(NAILED_R)) {
          const dx = o.x - e.x;
          const dz = o.z - e.z;
          const dd = Math.hypot(dx, dz) || 1;
          shove(lv, o, dx / dd, dz / dd, 0.8, owner);
          to.push({ x: o.x, z: o.z });
        }
      } else if (kind === 'flareup') {
        // the burn still to come, all at once
        const left = BURN_DPS * m.stacks * m.burnP * m.burn * (1 + lv.spec.difficulty * 0.6);
        const pow = m.burnP;
        m.burn = 0;
        m.stacks = 0;
        lv.blast(e.x, e.z, FLARE_R, Math.max(left, 8) * FLARE_K, owner, { bits: BURN, pow, quiet: true });
      } else if (kind === 'groundout') {
        m.shock = 0;
        const base = 10 * hullGrowth(lv.spec.difficulty);
        for (const o of lv.enemies) {
          if (o === e || o.dead || o.shielded || o.mk.shock <= 0 || !lv.onScreen(o.x, o.z)) continue;
          to.push({ x: o.x, z: o.z });
          lv.damage(o, base * GROUND_K * 2, owner, true, null);
        }
        // and it jumps on to one more
        const next = near(12).find((o) => o.mk.shock <= 0);
        if (next) {
          mark(lv, next, SHOCK, 1, owner);
          to.push({ x: next.x, z: next.z });
        }
      } else {
        m.crack = 0;
        k = BREACH_K;
        if (e.armour > 0) lv.breakPlating(e, owner);
        for (const o of near(BREACH_R).slice(0, 2)) {
          mark(lv, o, CRACK, 1, owner);
          to.push({ x: o.x, z: o.z });
        }
      }
    });
  } finally {
    depth.set(lv, d);
  }
  lv.emit({ type: 'cash', kind, enemy: e.id, x: e.x, z: e.z, to });
  return k;
}
