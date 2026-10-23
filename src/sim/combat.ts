/**
 * The fight around every foe: what it's doing (for the view and the pilot), its tells, how much a
 * hit hurts it right now (armour, shields, exposed after an attack), and the events that make a kill
 * feel like one. Every foe runs the same loop:
 *
 *   idle → windup (a tell you can read) → attack → recover (exposed: takes extra damage)
 *
 * and some can be knocked into a stagger (more exposed, for longer) by a counter: a dash at the
 * right moment, a parry, a crash into the land.
 */

import type { Enemy, Level, Player, Shot } from './level';
import { DT } from './types';
import { FOES, TELL, factionOf, isFoe, type Faction } from './factions';
import { bossHurt, bossReflects, bossTaken } from './boss';
import { strike } from './strikes';

export type FoeState = 'idle' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dodge' | 'hidden';

export type AttackKind =
  | 'lunge'
  | 'ram'
  | 'harpoon'
  | 'burst'
  | 'bar'
  | 'shell'
  | 'dive'
  | 'erupt'
  | 'spit'
  | 'sweep'
  | 'pulse'
  | 'swell'
  | 'charge'
  | 'slam'
  | 'gate'
  | 'spores'
  | 'fan'
  | 'beam'
  | 'jink'
  | 'torpedo'
  | 'seekers'
  | 'broadside'
  | 'spin'
  | 'ring';

/** A tell's shape on the flight plane. `ground`: fixed to the land (it scrolls with it). */
export type Tele =
  /** body: it's the enemy itself that comes down the line (a charge), not a shot. */
  | { shape: 'line'; x: number; z: number; x2: number; z2: number; w: number; lock: number; body?: boolean }
  | { shape: 'sweep'; x: number; z: number; a0: number; a1: number; len: number; w: number }
  | { shape: 'circle'; x: number; z: number; r: number; ground: boolean }
  | { shape: 'ring'; x: number; z: number; r: number; w: number }
  | { shape: 'edge'; x: number; z: number }
  | { shape: 'gate'; x: number; x2: number; z: number; gx: number; gap: number }
  /** A lock-on: brackets closing in on player `id` (what a torpedo will chase); `dirs`: the ways it'll launch, marked on it. */
  | { shape: 'lock'; id: number; dirs?: number[] }
  /** A spinning turret: its `arms` drawn out from angle `a`, and arrows the way they'll turn (`dir`). */
  | { shape: 'spin'; x: number; z: number; a: number; arms: number; dir: number; len: number };

/** What every enemy carries for the fight (and for the view to draw it). */
export interface FoeFields {
  state: FoeState;
  stateT: number;
  /** How long this state lasts, if known (0: open-ended). */
  stateDur: number;
  /** Which way it's aiming (0 = down the screen, as atan2(dx, dz)). */
  aim: number;
  tele: Tele | null;
  /** Seconds since it was last hurt. */
  hitT: number;
  /** A shield's half-arc about `aim` (0: none). */
  guard: number;
  /** Enemies it tethers (heartpods, the hive boss). */
  links: number[];
  /** The player it has hooked (-1: none). */
  grab: number;
  /** What a hit does to it right now (>1: exposed). */
  taken: number;
}

export const foeDefaults = (): FoeFields => ({ state: 'idle', stateT: 0, stateDur: 0, aim: 0, tele: null, hitT: 99, guard: 0, links: [], grab: -1, taken: 1 });

export interface KillHow {
  overkill: boolean;
  close: boolean;
  dash: boolean;
  reflect: boolean;
  exposed: boolean;
}

export type FoeEvent =
  /** A tell starts: draw `tele` for `dur` seconds, in the faction's grammar (`style`, see factions.ts TELL). */
  | { type: 'windup'; enemy: number; kind: AttackKind; tele: Tele | null; dur: number; faction: Faction; style: (typeof TELL)[Faction] }
  /** And the attack goes off. */
  | { type: 'release'; enemy: number; kind: AttackKind; x: number; z: number; a: number }
  /** Open to punishment (recovering), or knocked reeling (stagger). */
  | { type: 'exposed'; enemy: number; x: number; z: number; dur: number; stagger: boolean }
  /** Its armour or shield drops. */
  | { type: 'crack'; enemy: number; x: number; z: number }
  /** A shot sparked off a shield. */
  | { type: 'guard'; enemy: number; x: number; z: number }
  /** A prism threw a shot back. */
  | { type: 'reflect'; enemy: number; x: number; z: number; a: number }
  | { type: 'weakHit'; enemy: number; x: number; z: number; dmg: number }
  | { type: 'parried'; id: number; enemy: number; x: number; z: number }
  | ({ type: 'kill'; enemy: number; arch: string; x: number; z: number } & KillHow)
  | { type: 'multiKill'; id: number; n: number; x: number; z: number }
  | { type: 'latch'; id: number; enemy: number; x: number; z: number }
  | { type: 'breakFree'; id: number; enemy: number; x: number; z: number }
  /** A strike lands or starts (a shell, a ring, a slam); `gateDown`: a gate dropped. */
  | { type: 'strike'; kind: string; x: number; z: number; r: number; color?: number }
  | { type: 'outran'; id: number; enemy: number }
  | { type: 'overtake'; enemy: number; by: number }
  | { type: 'link'; enemy: number; to: number; on: boolean }
  | { type: 'jam'; id: number; dur: number }
  /** A boss's poise broken: STAGGERED, wide open. */
  | { type: 'bossStagger'; enemy: number; x: number; z: number }
  /** A boss's phase taken without a hit: paid in `scrap`. */
  | { type: 'phaseClean'; phase: number; x: number; z: number; scrap: number }
  /** An elite's armour broken: it reels. */
  | { type: 'armourBreak'; enemy: number; x: number; z: number }
  /** An elite's chain: attack `n` of `of` coming (n === of: the last, then it's open for long). */
  | { type: 'chain'; enemy: number; n: number; of: number }
  /** A boss's move landing on the beat (a screech's ring, a wing beat). */
  | { type: 'bossBeat'; enemy: number; move: string; k: number; x: number; z: number };

/**
 * An elite chains its attack (Hollow Knight's way): this many in a row, each tell quicker than the
 * one before, and after the last it's open for longer. Learn the count and you know when to go in.
 */
export const CHAIN: Partial<Record<string, number>> = {
  ramjack: 3,
  hookjaw: 2,
  rigger: 2,
  rook: 2,
  flakker: 3,
  swooper: 3,
  spitter: 3,
  warden: 3,
  prism: 2,
  heartpod: 2,
  gunship: 3,
  brute: 2,
  lancer: 2,
  gunboat: 2,
  technical: 3,
  spindle: 2,
  manta: 2,
  blimp: 2,
  halo: 3,
};

/** Into a state: the events that go with it. */
export function go(lv: Level, e: Enemy, state: FoeState, dur = 0, kind: AttackKind = 'lunge', tele: Tele | null = null) {
  // an elite's chain: straight on to the next attack, or (the last) open for long
  let skip = false;
  const of = e.elite && !e.boss ? (e.d.chain ?? 0) : 0;
  if (of > 1) {
    const n = e.d.combo ?? 0;
    if (state === 'recover') {
      if (n + 1 < of) {
        e.d.combo = n + 1;
        state = 'idle';
        dur = 0;
        skip = true;
      } else {
        e.d.combo = 0;
        dur *= 1.6;
      }
    } else if (state === 'windup') {
      if (n > 0) dur *= 0.7;
      lv.emit({ type: 'chain', enemy: e.id, n: n + 1, of });
    }
  }
  if (state === 'stagger') e.d.td = 0;
  e.state = state;
  e.stateT = skip ? 30 : 0;
  e.stateDur = dur;
  if (state === 'windup') {
    e.tele = tele;
    const faction = lookOf(lv, e);
    lv.emit({ type: 'windup', enemy: e.id, kind, tele, dur, faction, style: TELL[faction] });
  } else if (state === 'attack') lv.emit({ type: 'release', enemy: e.id, kind, x: e.x, z: e.z, a: e.aim });
  else if (state === 'recover' || state === 'stagger') {
    e.tele = null;
    lv.emit({ type: 'exposed', enemy: e.id, x: e.x, z: e.z, dur, stagger: state === 'stagger' });
  } else if (state === 'idle' || state === 'hidden') e.tele = null;
}

/** Whose side it fights for: its tells and its bullets speak that faction's language. */
export const lookOf = (lv: Level, e: Enemy): Faction => foeDef(e.arch)?.faction ?? (e.skin.kind === 'beast' && !e.boss ? 'wild' : factionOf(lv.spec.planet));

/** Done with this state? */
export const over = (e: Enemy) => e.stateDur > 0 && e.stateT >= e.stateDur;

/** How a hit lands in each state: [armoured, recovering, staggered]. Per kind, or the default. */
const TAKEN: Partial<Record<string, [number, number, number]>> = {
  ramjack: [1, 2, 2.5],
  rattler: [1, 1.5, 2],
  hookjaw: [1, 1.5, 2],
  rigger: [1, 1.8, 2.2],
  rook: [1, 1.8, 2.2],
  ace: [1, 1.5, 2],
  flakker: [1, 1.6, 2],
  swooper: [1, 2, 2.5],
  burrower: [1, 1.5, 2],
  spitter: [1, 1.6, 2],
  warden: [1, 1.5, 2],
  prism: [1, 2, 2.5],
  heartpod: [1, 1.6, 2],
  gunboat: [0.8, 1.6, 2],
  technical: [1, 1.8, 2.2],
  blimp: [0.7, 1.6, 2],
  spindle: [0.6, 1.8, 2.2],
  halo: [1, 1.8, 2.2],
  manta: [1, 1.6, 2],
  brute: [0.5, 1.5, 2],
  gunship: [1, 1.3, 1.6],
  lancer: [1, 1.8, 2],
  vault: [1, 1, 1],
};

/** What a hit does to it right now, before shields (which need to know where the hit came from). */
export function takenNow(lv: Level, e: Enemy) {
  const t = TAKEN[e.arch] ?? [1, 1.3, 1.6];
  let k = e.state === 'stagger' ? t[2] : e.state === 'recover' ? t[1] : t[0];
  if (e.arch === 'prism' && e.state === 'windup') k = 1.5;
  // a strongbox is iron while its tugs hold it
  if (e.arch === 'vault' && e.d.fall === undefined) k = 0;
  // linked by a heartpod: tough
  if (lv.enemies.some((o) => !o.dead && o.links.includes(e.id))) k *= 0.35;
  return k;
}

/**
 * A player's shot meeting an enemy: shields and reflectors get their say first. Returns what the
 * shot's damage is worth (0: it was stopped).
 */
export function foeShot(lv: Level, e: Enemy, s: Shot) {
  const p = lv.players[s.owner];
  if ((e.arch === 'prism' && (e.state === 'idle' || e.state === 'attack')) || (e.boss && bossReflects(lv, e))) {
    // closed: it throws the shot back, unless the shot was fired true (focus)
    if (p?.focus) return 0.5;
    const d = e.d;
    if ((d.refl ?? 0) <= 0 && p) {
      d.refl = 0.35;
      const a = Math.atan2(p.x - e.x, p.z - e.z) + (lv.rand() - 0.5) * 0.3;
      lv.bullet(e.x, e.z, a, 12, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: 'lattice' });
      lv.emit({ type: 'reflect', enemy: e.id, x: s.x, z: s.z, a });
    }
    return 0;
  }
  if (e.guard > 0 && blocked(e, s.x - s.vx * s.t, s.z - s.vz * s.t)) {
    lv.emit({ type: 'guard', enemy: e.id, x: s.x, z: s.z });
    // (a boss's shield doesn't wear through: it's there to be got round)
    if (!e.boss) wearGuard(lv, e, s.dmg);
    return 0;
  }
  return 1;
}

/** A shield soaks only so much: what it stops wears it, and worn through it cracks and leaves it reeling. */
export function wearGuard(lv: Level, e: Enemy, dmg: number) {
  e.d.worn = (e.d.worn ?? 0) + dmg;
  if (e.d.worn < e.max * 0.3) return;
  e.d.worn = 0;
  e.guard = 0;
  lv.emit({ type: 'crack', enemy: e.id, x: e.x, z: e.z });
  go(lv, e, 'stagger', 2.2);
}

/** A shield faces `aim`: what comes from inside its arc (and from further than point blank) is stopped. */
function blocked(e: Enemy, fx: number, fz: number) {
  const dx = fx - e.x;
  const dz = fz - e.z;
  if (dx * dx + dz * dz < 7 * 7) return false;
  const a = Math.atan2(dx, dz);
  return Math.abs(Math.atan2(Math.sin(a - e.aim), Math.cos(a - e.aim))) < e.guard;
}

/** What damage from (fx, fz) (or from nowhere in particular: null) is worth on this enemy. */
export function foeTaken(lv: Level, e: Enemy, from: { x: number; z: number } | null, crit: boolean) {
  if (e.boss) return bossTaken(lv, e, crit);
  if (from && e.guard > 0 && blocked(e, from.x, from.z)) return 0;
  return e.taken;
}

/**
 * Plating: everything bigger than fodder wears a band of it over its hull (an elite's is its gold
 * armour). The stream glances off it, at PLATE_GLANCE; blows (heavy rounds, the dash-strike, crits,
 * blasts, what's parried back, any big hit) break it at full strength. Broken, it reels, open to a
 * takedown. Left alone for PLATE_WAIT, it grows back.
 */
const PLATED = new Set(['gunship', 'bomber', 'brute', 'carrier', 'hookjaw', 'rigger', 'ace', 'burrower', 'warden', 'prism', 'gunboat', 'blimp', 'spindle', 'halo', 'manta', 'rook']);
export const plated = (arch: string) => PLATED.has(arch);
/** Plating, as a share of the hull. */
export const PLATE = 0.4;
/** What the stream does to plating. */
export const PLATE_GLANCE = 0.35;
/** Seconds unhit before plating grows back, and how fast it does (shares of it a second). */
const PLATE_WAIT = 2.5;
const PLATE_BACK = 0.2;

/** It was hit (after damage): the counters some foes have. `poise`: what it does to a boss's poise (blows: more). */
export function foeHurt(lv: Level, e: Enemy, dmg: number, poise = dmg) {
  e.hitT = 0;
  if (e.boss) bossHurt(lv, e, poise);
  // a hooked player is let go if the hook takes enough
  if (e.grab >= 0) {
    e.d.yank = (e.d.yank ?? 0) + dmg;
    if (e.d.yank > e.max * 0.25) release(lv, e, true);
  }
}

/** Let go of a hooked player (broken free: it reels, staggered). */
export function release(lv: Level, e: Enemy, broken: boolean) {
  if (e.grab < 0) return;
  const p = lv.players[e.grab];
  e.grab = -1;
  e.d.yank = 0;
  if (broken && p) {
    lv.emit({ type: 'breakFree', id: p.id, enemy: e.id, x: p.x, z: p.z });
    p.burn = Math.min(1, p.burn + 0.1);
  }
  if (!e.boss) go(lv, e, broken ? 'stagger' : 'recover', broken ? 1.6 : 1.2);
  else e.boss.yanked = broken;
}

/** How a kill happened. */
export function killHow(e: Enemy, p: Player | undefined, close: boolean, s?: Shot): KillHow {
  return {
    overkill: -e.hp >= Math.max(8, e.max * 0.5),
    close,
    dash: !!p && (p.dashT > 0 || p.dashLock > 0),
    reflect: s?.tag === 'reflect',
    exposed: e.taken > 1.01,
  };
}

const chains = new WeakMap<Level, { id: number; n: number; t: number; x: number; z: number }>();

/** Every kill: a multi-kill if they come quick, and the foes that do something as they go. */
export function onKill(lv: Level, e: Enemy, owner: number) {
  if (e.arch === 'puffball') puff(lv, e.x, e.z, e.skin.colors[2]);
  if (e.grab >= 0) release(lv, e, false);
  for (const o of lv.enemies) {
    const i = o.links.indexOf(e.id);
    if (i >= 0) {
      o.links.splice(i, 1);
      lv.emit({ type: 'link', enemy: o.id, to: e.id, on: false });
    }
  }
  for (const to of e.links) lv.emit({ type: 'link', enemy: e.id, to, on: false });
  e.links = [];
  if (e.boss || owner < 0) return;
  let c = chains.get(lv);
  if (!c || lv.time - c.t > 0.45 || c.id !== owner) {
    flush(lv);
    c = { id: owner, n: 0, t: lv.time, x: 0, z: 0 };
    chains.set(lv, c);
  }
  c.n++;
  c.t = lv.time;
  c.x = e.x;
  c.z = e.z;
}

function flush(lv: Level) {
  const c = chains.get(lv);
  if (c && c.n >= 3) lv.emit({ type: 'multiKill', id: c.id, n: c.n, x: c.x, z: c.z });
  chains.delete(lv);
}

/** Each frame: a chain of kills that's gone quiet is counted. */
export function tickCombat(lv: Level) {
  const c = chains.get(lv);
  if (c && lv.time - c.t > 0.45) flush(lv);
}

/** A spore puff where a puffball burst: slows and jams whoever's in it. */
export function puff(lv: Level, x: number, z: number, color: number) {
  strike(lv, 'spore', x, z, { r: 3.2, warn: 0, active: 1.2, color, effect: 'jam', air: true });
}

/** Reeling after its attack (or staggered): its body does no harm, so you can get in close and punish it. A brake-checking rattler still blocks. */
/** No ram damage: winded (stagger, recover), a boss under the sea, or a swooper not yet down at its shadow or already climbing away. */
export const winded = (e: Enemy) =>
  !!e.boss?.under ||
  // (a boss in the air over you, on a leap: it's the landing that hurts)
  (e.boss?.move === 'leap' && e.state === 'attack') ||
  ((e.state === 'stagger' || e.state === 'recover') && e.arch !== 'rattler') ||
  (e.arch === 'swooper' && (e.state === 'idle' || e.state === 'windup' || (e.state === 'attack' && Math.abs(e.stateT / (e.d.len ?? 0.6) - 1) > 0.25)));

/** Per frame for every enemy: the clocks, and how exposed it is. */
export function tickFoe(lv: Level, e: Enemy) {
  e.stateT += DT;
  e.hitT += DT;
  if (e.armour < e.armourMax && e.state !== 'stagger' && e.hitT > PLATE_WAIT) e.armour = Math.min(e.armourMax, e.armour + e.armourMax * PLATE_BACK * DT);
  if (e.d.refl) e.d.refl -= DT;
  e.taken = e.boss ? bossTaken(lv, e, false) : takenNow(lv, e);
}

export const foeDef = (arch: string) => (isFoe(arch) ? FOES[arch] : undefined);
