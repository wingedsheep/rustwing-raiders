/**
 * Wreck grafts: you fly what you beat. Take an elite down (a dash through it while it reels) and
 * finish it, and its wreck is yours: after the results your wrecks lay out up to three grafts
 * between them (each wreck's own move, and its kin's). Pick one and it's bolted onto the verb it
 * fits. A Warden's wreck gives its signature, to everyone.
 *
 * - One graft a verb: TRIGGER, HEAVY, DASH, AUX, SPECIAL, BOOST. A new one on a taken verb
 *   replaces the old. A graft rides on the verb: it goes off when the verb does, so an AUX graft
 *   on a ship with no aux does nothing.
 * - Three from one faction wake its BOND, a rule for the whole ship.
 * - Found during the run, lost at its end. The chart shows who you'll meet, so hunting a Rook is
 *   choosing your heavy.
 *
 * How each one flies is in sim/grafting.ts.
 */

import type { Faction, Foe } from '../sim/factions';
import type { Stats } from '../sim/build';
import type { EnemySkin } from '../world/planets';
import { pick, shuffle, type Rng } from '../util';

export type GraftVerb = 'trigger' | 'heavy' | 'dash' | 'aux' | 'special' | 'boost';

export const VERBS: GraftVerb[] = ['trigger', 'heavy', 'dash', 'aux', 'special', 'boost'];

export const VERB_NAME: Record<GraftVerb, string> = { trigger: 'TRIGGER', heavy: 'HEAVY', dash: 'DASH', aux: 'AUX', special: 'SPECIAL', boost: 'BOOST' };

/** Each verb's colour (the hardpoints' where it has one: see HARDPOINT_COLOR in ui/hud.ts). */
export const VERB_COLOR: Record<GraftVerb, string> = { trigger: '#ff8a4a', heavy: '#ff5a78', dash: '#6ad0ff', aux: '#ffd04a', special: '#8affb0', boost: '#e0a0ff' };

export type GraftId =
  | 'ramline'
  | 'broadside'
  | 'torpedo'
  | 'eye'
  | 'squareturn'
  | 'halo'
  | 'spindle'
  | 'crane'
  | 'thorns'
  | 'stoop'
  | 'acid'
  | 'skydive'
  | 'bind'
  | 'spores'
  | 'bloom';

export interface GraftDef {
  id: GraftId;
  /** The move, as it's called out in flight. */
  name: string;
  /** Who it's taken from (a foe's kind, or a Warden). */
  from: string;
  foe?: Foe;
  /** A Warden's signature: its planet. */
  boss?: string;
  faction: Faction;
  verb: GraftVerb;
  /** What it does, as a rule. */
  text: string;
  /** How to make the most of it. */
  tip: string;
}

const G = (d: GraftDef) => d;

export const GRAFTS: Record<GraftId, GraftDef> = {
  // --- scrap: momentum ----------------------------------------------------------------------
  ramline: G({
    id: 'ramline', name: 'RAM LINE', from: 'Ramjack', foe: 'ramjack', faction: 'scrap', verb: 'dash',
    text: 'THE DASH IS A RAM DOWN A DRAWN LINE, HALF AGAIN AS LONG. EVERYTHING ON IT TAKES A BLOW, AND CAN’T HURT YOU',
    tip: 'RAM THROUGH PLATING TO OPEN IT, THEN RAM AGAIN FOR THE TAKEDOWN',
  }),
  broadside: G({
    id: 'broadside', name: 'BROADSIDE', from: 'Gunboat', foe: 'gunboat', faction: 'scrap', verb: 'dash',
    text: 'A DASH ENDS IN A FAN OF SHOT OUT OF BOTH FLANKS. A PERFECT DASH FIRES TWO',
    tip: 'DASH BETWEEN THEM: BOTH SIDES TAKE IT',
  }),
  torpedo: G({
    id: 'torpedo', name: 'TORPEDO TUBE', from: 'Torpedo Rig', foe: 'rigger', faction: 'scrap', verb: 'trigger',
    text: 'HOLD THE TRIGGER AND EVERY 1.5 S A TORPEDO DROPS OUT AND RUNS DOWN THE NEAREST ENEMY',
    tip: 'KEEP FIRING: THE TUBE ONLY LOADS WHILE THE TRIGGER IS HELD',
  }),
  eye: G({
    id: 'eye', name: 'TITAN EYE', from: 'Warlord Khet', boss: 'ashgrave', faction: 'scrap', verb: 'heavy',
    text: 'EVERY HEAVY ROUND OPENS THE EYE: A BEAM THAT FINDS THE NEAREST ENEMY AND FOLLOWS IT',
    tip: 'FIRE IT AND FLY: THE EYE KEEPS LOOKING',
  }),
  // --- lattice: precision -------------------------------------------------------------------
  squareturn: G({
    id: 'squareturn', name: 'SQUARE TURN', from: 'Rook', foe: 'rook', faction: 'lattice', verb: 'heavy',
    text: 'A HEAVY ROUND THAT WOULD MISS STOPS LEVEL WITH AN ENEMY, DRAWS ITS LANE AND TURNS SQUARE INTO IT',
    tip: 'FIRE PAST THEM: THE ROUND FINDS THE ONE BESIDE ITS LINE',
  }),
  halo: G({
    id: 'halo', name: 'HALO RING', from: 'Halo', foe: 'halo', faction: 'lattice', verb: 'aux',
    text: 'THE AUX THROWS TWO RINGS OF SHARDS OUT FROM YOU. THEY CUT THROUGH ENEMY FIRE',
    tip: 'USE THE AUX IN A CROWD: EVERY SHARD IS A BLOW',
  }),
  spindle: G({
    id: 'spindle', name: 'SPINDLE ARMS', from: 'Spindle', foe: 'spindle', faction: 'lattice', verb: 'special',
    text: 'THE SPECIAL DRAWS FOUR ARMS OUT FROM YOU. THEN THEY SPIN, FIRING, AND CUT WHAT THEY SWEEP',
    tip: 'FLY INTO THEM WHILE THE ARMS TURN',
  }),
  crane: G({
    id: 'crane', name: 'CRANE SWING', from: 'Harbourmaster Oko', boss: 'halcyon', faction: 'lattice', verb: 'aux',
    text: 'THE AUX SWINGS A WRECKING BALL UNDER YOU, THERE AND BACK. IT BATS BULLETS BACK AND HITS LIKE A BLOW',
    tip: 'SWING IT INTO A WALL OF FIRE',
  }),
  // --- wild: the hunt -----------------------------------------------------------------------
  thorns: G({
    id: 'thorns', name: 'THORN WAKE', from: 'Sky Manta', foe: 'manta', faction: 'wild', verb: 'boost',
    text: 'BOOSTING SOWS THORNS IN YOUR WAKE. THEY RIPEN, THEN BURST INTO NEEDLES',
    tip: 'BOOST PAST THEM, THEN TURN: LEAD THEM THROUGH YOUR WAKE',
  }),
  stoop: G({
    id: 'stoop', name: 'STOOP', from: 'Swooper', foe: 'swooper', faction: 'wild', verb: 'dash',
    text: 'THE DASH THROWS YOUR SHADOW AHEAD. A BEAT LATER A TALON STRIKE COMES DOWN ON IT',
    tip: 'DASH AT THEM, NOT THROUGH: THE STRIKE LANDS PAST WHERE YOU STOP',
  }),
  acid: G({
    id: 'acid', name: 'ACID SPIT', from: 'Spitter', foe: 'spitter', faction: 'wild', verb: 'trigger',
    text: 'HOLD THE TRIGGER AND EVERY SECOND A GLOB OF ACID IS LOBBED AT THE NEAREST ENEMY. THE PUDDLE EATS AND CRACKS',
    tip: 'CRACKED, THEY TAKE MORE: POUR FIRE INTO THE PUDDLE',
  }),
  skydive: G({
    id: 'skydive', name: 'SKY DIVE', from: 'Great Mother Vask', boss: 'orutal', faction: 'wild', verb: 'special',
    text: 'THE SPECIAL DRAWS YOUR LANE ACROSS THE SCREEN. YOU DIVE IT, UNTOUCHABLE, SOWING EGGS THAT BURST BEHIND YOU',
    tip: 'PICK THE LANE THEY CROWD',
  }),
  // --- bloom: the rot -----------------------------------------------------------------------
  bind: G({
    id: 'bind', name: 'HEART BIND', from: 'Heartpod', foe: 'heartpod', faction: 'bloom', verb: 'aux',
    text: 'THE AUX BINDS THE NEAREST ENEMY FOR 6 S. WHAT IT TAKES, EVERYTHING NEAR IT TAKES TOO',
    tip: 'BIND THE BIG ONE IN THE MIDDLE, THEN POUND IT',
  }),
  spores: G({
    id: 'spores', name: 'SPORE TRAIL', from: 'Puffball', foe: 'puffball', faction: 'bloom', verb: 'boost',
    text: 'BOOSTING LEAVES SPORE CLOUDS. THEY EAT ENEMY FIRE, AND ROT AND CRACK WHAT FLIES INTO THEM',
    tip: 'BOOST ACROSS THEIR FIRE: THE CLOUDS SCREEN YOU',
  }),
  bloom: G({
    id: 'bloom', name: 'MOTHER’S BLOOM', from: 'The Mother-of-Spores', boss: 'mirefall', faction: 'bloom', verb: 'heavy',
    text: 'A HEAVY ROUND THAT HITS FLOWERS: A RING OF SPORES BURSTS FROM IT AND A CLOUD HANGS WHERE IT LANDED',
    tip: 'HIT THE MIDDLE OF A PACK',
  }),
};

export const GRAFT_LIST = Object.values(GRAFTS);

/** The grafts on a ship: one a verb. */
export type Grafts = Partial<Record<GraftVerb, GraftId>>;

/** A faction's bond, woken by three of its grafts. */
export const BONDS: Record<Faction, { name: string; text: string }> = {
  scrap: { name: 'SALVAGE RIGHTS', text: 'KILLS THROW SHRAPNEL' },
  lattice: { name: 'TRUE LINE', text: 'TRIGGER SHOTS PIERCE ONE MORE' },
  wild: { name: 'BLOOD UP', text: 'TAKEDOWNS FILL THE WELD TWICE AS FAST' },
  bloom: { name: 'OVERGROWTH', text: 'A KILL PASSES ITS MARKS ON TO THE NEAREST' },
};

/** Grafts a faction's bond counts. */
export const BOND_AT = 3;

export const FACTION_NAME: Record<Faction, string> = { scrap: 'SCRAP', lattice: 'LATTICE', wild: 'WILD', bloom: 'BLOOM' };

/** How many grafts of each faction a ship has. */
export function factionCount(g: Grafts): Record<Faction, number> {
  const n: Record<Faction, number> = { scrap: 0, lattice: 0, wild: 0, bloom: 0 };
  for (const id of Object.values(g)) if (id) n[GRAFTS[id].faction]++;
  return n;
}

/** The bonds a ship's grafts wake. */
export function bondsOf(g: Grafts): Faction[] {
  const n = factionCount(g);
  return (Object.keys(n) as Faction[]).filter((f) => n[f] >= BOND_AT);
}

/** A wreck to salvage at the results: who downed it, what it was, and whose. */
export interface Wreck {
  owner: number;
  /** Its kind (a foe, or an old archetype), or 'boss'. */
  kind: string;
  /** Its name on its plate ("GRISTLE"), or the Warden's. */
  title: string;
  faction: Faction;
  /** A Warden's: its planet. */
  boss?: string;
  /** How it looked (an elite's), for its wreck on the salvage screen. */
  skin?: EnemySkin;
  model?: string;
  scale?: number;
}

/** A Warden's signature graft, if it has one. */
export const signatureOf = (planet: string) => GRAFT_LIST.find((g) => g.boss === planet)?.id;

/**
 * What a wreck offers: a Warden's signature (and nothing else beside it); an elite's own move,
 * if it has one, and another of its faction's. Boss grafts never turn up from an elite, and
 * what's already on the ship comes up last.
 */
export function wreckOffer(r: Rng, w: Wreck, have: Grafts): GraftId[] {
  if (w.boss) {
    const sig = signatureOf(w.boss);
    if (sig) return [sig];
  }
  const own = GRAFT_LIST.find((g) => g.foe === w.kind && !g.boss)?.id;
  const held = new Set(Object.values(have));
  const kin = shuffle(r, GRAFT_LIST.filter((g) => g.faction === w.faction && !g.boss && g.id !== own).map((g) => g.id));
  kin.sort((a, b) => Number(held.has(a)) - Number(held.has(b)));
  const out = own ? [own, ...kin.slice(0, 1)] : kin.slice(0, 2);
  // a faction with too few of its own: something from anywhere
  while (out.length < 2) {
    const any = GRAFT_LIST.filter((g) => !g.boss && !out.includes(g.id));
    if (!any.length) break;
    out.push(pick(r, any).id);
  }
  return out;
}

/** The most grafts the salvage lays out at once. */
export const SALVAGE_CARDS = 3;

/**
 * What a pilot's wrecks offer together, one pick from them all: a Warden's signature first, then
 * each wreck's own move, then their kin's, nothing twice, `SALVAGE_CARDS` at most. `from`: which
 * of the wrecks each came off.
 */
export function salvageOffer(r: Rng, wrecks: Wreck[], have: Grafts): { id: GraftId; from: number }[] {
  const lists = wrecks.map((w) => wreckOffer(r, w, have));
  const out: { id: GraftId; from: number }[] = [];
  const held = new Set(Object.values(have));
  // a round of each wreck's best, then the next round; what's on the ship already only to fill
  for (const late of [false, true])
    for (let round = 0; round < 2; round++)
      lists.forEach((l, k) => {
        const id = l[round];
        if (!id || out.length >= SALVAGE_CARDS || out.some((o) => o.id === id) || held.has(id) !== late) return;
        out.push({ id, from: k });
      });
  return out;
}

/** What bolting `id` on does: the ship's grafts after, what it pushed off, the bonds it wakes and breaks. */
export function boltOn(have: Grafts, id: GraftId) {
  const verb = GRAFTS[id].verb;
  const next: Grafts = { ...have, [verb]: id };
  const was = bondsOf(have);
  const now = bondsOf(next);
  return { next, replaced: have[verb] !== id ? have[verb] : undefined, woke: now.filter((f) => !was.includes(f)), broke: was.filter((f) => !now.includes(f)) };
}

/** Whether the ship has the tool a verb's graft rides on (the trigger, dash and boost it always has). */
export function hasVerb(s: Stats, verb: GraftVerb) {
  if (verb === 'aux') return !!s.aux;
  if (verb === 'special') return !!s.special;
  if (verb === 'heavy') return s.guns.some((g) => g.heavy);
  if (verb === 'trigger') return s.guns.some((g) => !g.heavy);
  return true;
}
