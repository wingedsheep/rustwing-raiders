/**
 * Marks: what a hit leaves on an enemy, and what two of them do together.
 *
 * - BURN (heat guns): it's on fire. Damage every moment, more the longer it's kept lit (up to three
 *   stacks).
 * - SHOCK (arc guns): its works are jammed. Everything it does runs slow, and now and then it
 *   seizes up for a beat.
 * - CRACK (explosive guns): its armour is split. It takes more from everything.
 *
 * Boosters can give any gun a mark (Incendiary Feed, Tesla Coupler, Breacher Rack). A second,
 * different mark landing on an enemy sets off a reaction, and uses both marks up:
 *
 * - OVERLOAD (burn + shock): lightning jumps from it to the enemies round it, shocking them.
 * - COOK-OFF (burn + crack): it blows, and sets fire to what's round it. Burning things that
 *   were cracked go up in turn: a chain.
 * - SHATTER (shock + crack): one huge blow, and it's knocked reeling (open to punishment).
 *
 * The pairs that react are the pairs that clash on a hull (arc with heat, explosive with heat):
 * mount them apart, land them together. After a reaction the enemy is spent for a moment and takes
 * no marks, so two guns on one target pulse rather than buzz.
 *
 * The Catalyst (a dash mod) sets off whatever single mark an enemy carries as you dash past it.
 */

import { hullGrowth, type Enemy, type Level } from './level';
import type { MarkKind, Tag } from '../game/parts';
import { DT } from './types';
import { noteSetup } from './arsenal';
import { go } from './combat';
import { isFoe } from './factions';

export const BURN = 1;
export const SHOCK = 2;
export const CRACK = 4;
export const MARK_BIT: Record<MarkKind, number> = { burn: BURN, shock: SHOCK, crack: CRACK };
export const MARK_KINDS: MarkKind[] = ['burn', 'shock', 'crack'];

/** The mark a gun leaves of its own, by tag. */
export const MARK_OF_TAG: Partial<Record<Tag, MarkKind>> = { heat: 'burn', arc: 'shock', explosive: 'crack' };

/** The bits a part's tags give a gun's hits. */
export function tagMarks(tags: Tag[]) {
  let bits = 0;
  for (const t of tags) {
    const m = MARK_OF_TAG[t];
    if (m) bits |= MARK_BIT[m];
  }
  return bits;
}

export type ReactionKind = 'overload' | 'cookoff' | 'shatter';

export interface ReactionDef {
  kind: ReactionKind;
  /** The two marks that make it. */
  bits: number;
  name: string;
  text: string;
}

export const REACTIONS: ReactionDef[] = [
  { kind: 'overload', bits: BURN | SHOCK, name: 'OVERLOAD', text: 'Lightning jumps to the enemies round it.' },
  { kind: 'cookoff', bits: BURN | CRACK, name: 'COOK-OFF', text: 'It blows, and sets fire to its neighbours.' },
  { kind: 'shatter', bits: SHOCK | CRACK, name: 'SHATTER', text: 'One huge blow, and it reels.' },
];

/** The reactions a set of mark bits can make. */
export function reactionsOf(bits: number) {
  return REACTIONS.filter((r) => (bits & r.bits) === r.bits);
}

export const MARK_NAME: Record<MarkKind, string> = { burn: 'BURN', shock: 'SHOCK', crack: 'CRACK' };

/** The kinds in a set of mark bits. */
export const markKinds = (bits: number) => MARK_KINDS.filter((k) => bits & MARK_BIT[k]);
/** Their names, for a stat line: 'BURN SHOCK'. */
export const markNames = (bits: number) => markKinds(bits).map((k) => MARK_NAME[k]).join(' ');

// The numbers.
/** How long each mark lasts after the last hit that left it. */
const BURN_TIME = 3;
const SHOCK_TIME = 2.5;
const CRACK_TIME = 4;
/** Burn: damage a second per stack, the most stacks, how often a hit can add one. */
export const BURN_DPS = 5;
const BURN_STACKS = 3;
const BURN_STACK_GAP = 0.3;
/** Shock: everything it does runs at this speed; a jolt (a short stun) this often, this long. */
const SHOCK_SLOW = 0.65;
const JOLT_EVERY = 1;
const JOLT = 0.18;
/** Crack: what it takes on top (at 100% strength). */
const CRACK_TAKEN = 0.3;
/** A reaction's base damage (it grows with the run, like the enemies' hull). */
const REACT_DMG = 16;
/** Spent after a reaction: no marks for this long. */
const SPENT = 1.1;
/** OVERLOAD: jumps, reach, what each jump does (of the base). */
const OVERLOAD_JUMPS = 4;
const OVERLOAD_REACH = 11;
/** COOK-OFF: blast radius and damage (of the base). */
const COOKOFF_R = 5;
const COOKOFF_K = 1.4;
/** SHATTER: the blow (of the base), the stagger. */
const SHATTER_K = 2.6;
const SHATTER_STAGGER = 1.4;

/** An enemy's marks: seconds left of each, how strong (1 = 100%), and who put them there. */
export interface Marks {
  burn: number;
  burnP: number;
  stacks: number;
  stackT: number;
  tick: number;
  shock: number;
  shockP: number;
  jolt: number;
  crack: number;
  crackP: number;
  /** Seconds it takes no marks (after a reaction). */
  spent: number;
  /** Who marked it last (who a burn's kill goes to). */
  by: number;
}

export const newMarks = (): Marks => ({ burn: 0, burnP: 0, stacks: 0, stackT: 0, tick: 0, shock: 0, shockP: 0, jolt: 0, crack: 0, crackP: 0, spent: 0, by: 0 });

/** The marks it carries now, as bits. */
export function marksOn(e: Enemy) {
  const m = e.mk;
  return (m.burn > 0 ? BURN : 0) | (m.shock > 0 ? SHOCK : 0) | (m.crack > 0 ? CRACK : 0);
}

/** What a hit is worth on it, for its marks (a crack). */
export const markTaken = (e: Enemy) => (e.mk.crack > 0 ? 1 + CRACK_TAKEN * e.mk.crackP : 1);

/** A reaction's damage: the base, grown with the run, at the marks' strength. */
const reactDmg = (lv: Level, pow: number) => REACT_DMG * hullGrowth(lv.spec.difficulty) * pow;

/**
 * A hit leaves `bits` on it, at `pow` strength. A new mark different from one it carries reacts
 * (the strongest pair, if it gets two at once).
 */
export function mark(lv: Level, e: Enemy, bits: number, pow: number, owner: number) {
  const m = e.mk;
  if (!bits || e.dead || e.shielded || m.spent > 0 || pow <= 0) return;
  const had = marksOn(e);
  m.by = owner;
  if (bits & BURN) {
    m.burnP = Math.max(pow, m.burn > 0 ? m.burnP * 0.9 : 0);
    if (!m.burn) {
      m.stacks = 1;
      m.stackT = BURN_STACK_GAP;
      m.tick = 0.25;
    } else if (m.stackT <= 0 && m.stacks < BURN_STACKS) {
      m.stacks++;
      m.stackT = BURN_STACK_GAP;
    }
    m.burn = BURN_TIME;
  }
  if (bits & SHOCK) {
    m.shockP = Math.max(pow, m.shock > 0 ? m.shockP * 0.9 : 0);
    if (!m.shock) m.jolt = 0;
    m.shock = SHOCK_TIME;
  }
  if (bits & CRACK) {
    m.crackP = Math.max(pow, m.crack > 0 ? m.crackP * 0.9 : 0);
    m.crack = CRACK_TIME;
  }
  for (const k of MARK_KINDS) if (bits & MARK_BIT[k]) noteSetup(e, k, lv.credit);
  const now = marksOn(e);
  for (const k of MARK_KINDS) if (now & MARK_BIT[k] && !(had & MARK_BIT[k])) lv.emit({ type: 'mark', enemy: e.id, kind: k, x: e.x, z: e.z });
  // two different marks: the pair goes off
  if (now !== had) {
    const r = reactionsOf(now)[0];
    if (r) react(lv, e, r.kind, owner);
  }
}

/** Takes its marks off, and leaves it spent for a moment. */
function clear(e: Enemy) {
  const m = e.mk;
  m.burn = m.shock = m.crack = 0;
  m.stacks = 0;
  m.spent = SPENT;
}

/** Two marks meet: the reaction. */
export function react(lv: Level, e: Enemy, kind: ReactionKind, owner: number) {
  const m = e.mk;
  const pow = kind === 'overload' ? (m.burnP + m.shockP) / 2 : kind === 'cookoff' ? (m.burnP + m.crackP) / 2 : (m.shockP + m.crackP) / 2;
  const dmg = reactDmg(lv, pow);
  const x = e.x;
  const z = e.z;
  // a Spark Gap's: the pair jumps on to the two nearest (and they go off in turn: a chain through a wave)
  const jump = lv.players[owner]?.stats.spark ? marksOn(e) : 0;
  if (jump) spread(lv, e, owner);
  clear(e);
  lv.reactions++;
  lv.emit({ type: 'reaction', kind, enemy: e.id, x, z, owner });
  lv.credited(kind.toUpperCase(), () => reactHits(lv, e, kind, owner, dmg, pow, x, z));
}

function reactHits(lv: Level, e: Enemy, kind: ReactionKind, owner: number, dmg: number, pow: number, x: number, z: number) {
  if (kind === 'overload') {
    // a blow where it starts (like every reaction), and the lightning runs out from it to its
    // neighbours, and leaves them shocked
    lv.damage(e, dmg, owner, true, null);
    lv.arc(owner, x, z, dmg * 0.8, OVERLOAD_JUMPS, { from: e, reach: OVERLOAD_REACH, bits: SHOCK, pow });
  } else if (kind === 'cookoff') {
    // it goes up, and what's round it catches
    lv.blast(x, z, COOKOFF_R, dmg * COOKOFF_K, owner, { bits: BURN, pow, quiet: true });
  } else {
    // one blow: through the cracks, with the works seized
    lv.damage(e, dmg * SHATTER_K, owner, true, null);
    if (!e.dead && !e.boss) {
      if (isFoe(e.arch)) go(lv, e, 'stagger', SHATTER_STAGGER);
      else e.stun = Math.max(e.stun, SHATTER_STAGGER * 0.5);
    }
  }
}

/**
 * The Catalyst: whatever it carries goes off at once, `k` as hard. Returns whether there was
 * anything to set off.
 */
export function detonate(lv: Level, e: Enemy, owner: number, k: number) {
  const m = e.mk;
  const on = marksOn(e);
  if (!on || e.dead) return false;
  const x = e.x;
  const z = e.z;
  const base = reactDmg(lv, 1) * k;
  // the fire it had left in it, all at once (never less than a fair blast)
  const burn = m.burn > 0 ? Math.max(base * 0.7, BURN_DPS * m.stacks * m.burnP * m.burn * 1.5 * k) : 0;
  const shock = m.shock > 0 ? base * 0.9 * m.shockP : 0;
  const crack = m.crack > 0 ? base * 1.6 * m.crackP : 0;
  clear(e);
  lv.emit({ type: 'detonate', enemy: e.id, x, z, owner, bits: on });
  if (crack) lv.damage(e, crack, owner, true, null);
  if (burn) lv.blast(x, z, 3.2, burn, owner, { quiet: true });
  if (shock) lv.arc(owner, x, z, shock, 3, { from: e, reach: 9, bits: 0, pow: 0 });
  return true;
}

/**
 * Its marks spread when it dies (a VOLATILE gun's kill): the two nearest catch what it carried.
 * Called before the marks are lost with it.
 */
export function spread(lv: Level, e: Enemy, owner: number) {
  const bits = marksOn(e);
  if (!bits) return;
  const pow = Math.max(e.mk.burnP, e.mk.shockP, e.mk.crackP, 0.5);
  const near = lv.enemies
    .filter((o) => o !== e && !o.dead && !o.shielded && o.t >= 0 && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 14 * 14)
    .sort((a, b) => (a.x - e.x) ** 2 + (a.z - e.z) ** 2 - ((b.x - e.x) ** 2 + (b.z - e.z) ** 2))
    .slice(0, 2);
  for (const o of near) {
    lv.emit({ type: 'spread', from: e.id, enemy: o.id, x: e.x, z: e.z, x2: o.x, z2: o.z, bits });
    mark(lv, o, bits, pow, owner);
  }
}

/** Each frame, for each enemy: the clocks, the burn's damage, the shock's jolts. */
export function tickMarks(lv: Level, e: Enemy) {
  const m = e.mk;
  if (m.spent > 0) m.spent -= DT;
  if (m.stackT > 0) m.stackT -= DT;
  if (m.crack > 0) m.crack = Math.max(0, m.crack - DT);
  if (m.shock > 0) {
    m.shock = Math.max(0, m.shock - DT);
    // everything it does runs slow (its tells, its attacks, its recovery: all of it)
    if (isFoe(e.arch)) e.stateT -= DT * (1 - SHOCK_SLOW);
    // a jolt now and then: it seizes for a beat (not a boss: a jolt would break its moves)
    if ((m.jolt -= DT) <= 0) {
      m.jolt = JOLT_EVERY;
      if (!e.boss) e.stun = Math.max(e.stun, JOLT * m.shockP);
      lv.emit({ type: 'jolt', enemy: e.id, x: e.x, z: e.z });
    }
  }
  if (m.burn > 0) {
    m.burn = Math.max(0, m.burn - DT);
    if ((m.tick -= DT) <= 0) {
      m.tick = 0.25;
      lv.damage(e, BURN_DPS * m.stacks * m.burnP * 0.25 * (1 + lv.spec.difficulty * 0.6), m.by, false, null, undefined, true);
    }
    if (m.burn <= 0) m.stacks = 0;
  }
}
