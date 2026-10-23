/**
 * Loot: no two parts that drop are quite the same. A part as found is an item: the part itself,
 * a tier, and what was rolled for it.
 *
 * - The tier says how much was rolled: a COMMON part is stock, a RARE one has a mod (or, as often
 *   as not, an affix instead), an EPIC a mod and an affix, and a LEGENDARY a mod, an affix and a trait.
 * - Mods are numbers, rolled within a range (+10..30% damage, -25..60% mass, ...). The roll is
 *   kept (0..1), so a card can show how good it came out.
 * - Affixes are Dead Cells' kind: not a number but a habit. A gun whose crits burst, whose kills
 *   throw splinters, that finishes what it leaves nearly dead; a dash that throws the bullets it
 *   soaks back; a hull with a second wind. Two Rivet Guns found on one run needn't fly alike, and
 *   what drops early says how the run will want to be flown.
 * - Traits are legendary and change the rules for that part: a gun that fires a mirror twin, a
 *   booster that reaches every gun on the ship, a part that links wherever it sits, shots that
 *   split or come back, kills that pass their marks on, a dash that leaves a turret behind or ends
 *   in a thunderclap, a hull that hits back, a special fed by kills. They are meant to be built round.
 *
 * The part's own rarity (in parts.ts) still says how often it turns up at all; the tier is on
 * top of that. itemDef() turns an item into the PartDef the build sees, numbers and all.
 */

import { partById, type PartDef } from './parts';
import { pick, shuffle, weighted, type Rng } from '../util';

export type Tier = 'common' | 'rare' | 'epic' | 'legendary';
export const TIERS: Tier[] = ['common', 'rare', 'epic', 'legendary'];

export type ModKind = 'dmg' | 'rate' | 'cool' | 'thrust' | 'potent' | 'charge' | 'swift' | 'light' | 'plated';

export interface Mod {
  k: ModKind;
  /** Where in its range it rolled, 0..1. */
  roll: number;
}

export type TraitId =
  | 'twin' | 'colossal' | 'wireless' | 'keystone' | 'overclock' | 'volatile' | 'splitting'
  | 'sentinel' | 'boomerang' | 'frenzied' | 'thunderous' | 'vengeful' | 'ravenous';

export type AffixId =
  | 'blasting' | 'shrapnel' | 'executioner' | 'giantslayer' | 'spite' | 'ricochet' | 'scavenger'
  | 'deflecting' | 'afterburn' | 'adrenal'
  | 'secondwind' | 'barbed' | 'reactive'
  | 'hotwired' | 'primed'
  | 'surging' | 'lingering';

/** A part as found: which part, and what was rolled for it. Plain ids are stock commons. */
export interface Item {
  id: string;
  tier?: Tier;
  mods?: Mod[];
  affix?: AffixId;
  trait?: TraitId;
}

interface ModSpec {
  /** The range it rolls in. */
  lo: number;
  hi: number;
  /** Whole steps. */
  whole?: boolean;
  fits: (d: PartDef) => boolean;
  /** The line on a card, from the rolled value. */
  text: (v: number) => string;
  /** Short, for tight spots (the hangar). */
  short: (v: number) => string;
}

const pc = (v: number) => Math.round(v * 100);

export const MODS: Record<ModKind, ModSpec> = {
  dmg: { lo: 0.1, hi: 0.3, fits: (d) => !!d.gun, text: (v) => `+${pc(v)}% DAMAGE`, short: (v) => `+${pc(v)}% DMG` },
  rate: { lo: 0.08, hi: 0.22, fits: (d) => !!d.gun, text: (v) => `+${pc(v)}% FIRE RATE`, short: (v) => `+${pc(v)}% RATE` },
  cool: { lo: 0.2, hi: 0.45, fits: (d) => !!d.gun && d.gun.heat > 0, text: (v) => `-${pc(v)}% HEAT`, short: (v) => `-${pc(v)}% HEAT` },
  thrust: { lo: 0.15, hi: 0.4, fits: (d) => (d.thrust ?? 0) > 0, text: (v) => `+${pc(v)}% THRUST`, short: (v) => `+${pc(v)}% THRUST` },
  potent: { lo: 0.15, hi: 0.35, fits: (d) => scales(d), text: (v) => `+${pc(v)}% STRENGTH`, short: (v) => `+${pc(v)}% STR` },
  charge: { lo: 0.15, hi: 0.35, fits: (d) => !!d.special, text: (v) => `+${pc(v)}% SPECIAL CHARGE`, short: (v) => `+${pc(v)}% CHARGE` },
  swift: { lo: 0.1, hi: 0.25, fits: (d) => d.cls === 'engine', text: (v) => `-${pc(v)}% DASH RECOVERY`, short: (v) => `-${pc(v)}% DASH CD` },
  light: { lo: 0.25, hi: 0.6, fits: (d) => d.mass >= 0.4, text: (v) => `-${pc(v)}% MASS`, short: (v) => `-${pc(v)}% MASS` },
  plated: { lo: 0.1, hi: 0.25, fits: (d) => d.cls === 'defense' || d.tags.includes('armor'), text: (v) => `+${pc(v)}% HULL`, short: (v) => `+${pc(v)}% HULL` },
};

/** Parts whose effect runs at a strength (boosters, passives, dash mods, the aux). */
function scales(d: PartDef) {
  return !!(d.boost || d.passive || d.mod || d.aux);
}

/** A gun that fires things that fly (not a beam, not lightning). */
const projectile = (d: PartDef) => !!d.gun && d.gun.shot !== 'beam' && d.gun.shot !== 'arc';
/** Things that fly far enough to come back (not plasma, not mines, not shells that burst). */
const thrown = (d: PartDef) => projectile(d) && !['flame', 'mine', 'flak'].includes(d.gun!.shot);

export const modValue = (m: Mod) => {
  const s = MODS[m.k];
  const v = s.lo + (s.hi - s.lo) * m.roll;
  return s.whole ? Math.round(v) : v;
};

export interface TraitSpec {
  name: string;
  text: string;
  fits: (d: PartDef) => boolean;
}

export const TRAITS: Record<TraitId, TraitSpec> = {
  twin: { name: 'TWINNED', text: 'A mirror twin fires from the other side of the hull.', fits: (d) => !!d.gun },
  colossal: { name: 'COLOSSAL', text: 'Three times the punch at half the rate, and it pierces two more.', fits: (d) => !!d.gun && d.gun.shot !== 'beam' },
  wireless: {
    name: 'WIRELESS',
    text: 'Counts as touching every part on the ship.',
    fits: (d) => !!(d.boost || (d.link && !d.link.side && !d.link.want.open)),
  },
  keystone: { name: 'KEYSTONE', text: 'Always linked, wherever it sits: it runs as linked (150%) anywhere.', fits: (d) => !!d.link },
  overclock: { name: 'OVERCLOCKED', text: 'Runs at double strength, and weighs double.', fits: (d) => scales(d) },
  volatile: { name: 'VOLATILE', text: 'What it kills passes its marks on: the two nearest enemies catch them.', fits: (d) => projectile(d) },
  splitting: { name: 'SPLITTING', text: 'Every shot splits in two when it first hits, and the halves fly on.', fits: (d) => projectile(d) && (d.gun?.count ?? 1) <= 2 },
  sentinel: { name: 'SENTINEL', text: 'Every dash leaves a copy of it behind: a turret that fires at the nearest enemy for 3 s.', fits: (d) => !!d.gun && d.gun.shot !== 'beam' && !d.gun.auto },
  boomerang: { name: 'BOOMERANG', text: 'Its shots turn at the end of their flight and come back past you, hitting everything again.', fits: (d) => thrown(d) },
  frenzied: { name: 'FRENZIED', text: 'Every kill whips it up: 15% faster each, up to +90%, until 2.5 s pass without one.', fits: (d) => !!d.gun && d.gun.shot !== 'beam' },
  thunderous: { name: 'THUNDEROUS', text: 'Every dash ends in a thunderclap: what’s near is shocked and thrown back. Twice as hard on a perfect.', fits: (d) => d.cls === 'engine' },
  vengeful: { name: 'VENGEFUL', text: 'A hit on you sets off a nova: bullets round you are wiped and shrapnel flies out, harder the lower your hull.', fits: (d) => d.cls === 'defense' && !!(d.hp || d.shield) },
  ravenous: { name: 'RAVENOUS', text: 'Kills feed it: each one charges it a tenth. Keep killing and it never runs dry.', fits: (d) => !!d.special },
};

export interface AffixSpec {
  name: string;
  /** The line on a card. */
  text: string;
  fits: (d: PartDef) => boolean;
}

const gun = (d: PartDef) => !!d.gun;

/**
 * The affixes. Each changes when or how a part does its work, so a run's drops pull its flying one
 * way or another: crits that burst want edges, a spiteful gun wants you to take risks, a deflecting
 * dash wants perfects. A card shows one in its own colour, with a ✦.
 */
export const AFFIXES: Record<AffixId, AffixSpec> = {
  // guns
  blasting: { name: 'BLASTING', text: 'Its crits burst: a blast round what they hit.', fits: gun },
  shrapnel: { name: 'SHRAPNEL', text: 'Its kills burst into five splinters that fly on.', fits: gun },
  executioner: { name: 'EXECUTIONER', text: 'Finishes off what it leaves below 15% hull. On a Warden, +50% below a quarter.', fits: gun },
  giantslayer: { name: 'GIANTSLAYER', text: '+60% on elites, Wardens and anything big.', fits: gun },
  spite: { name: 'SPITE', text: '+70% for 5 s after you are hit.', fits: gun },
  ricochet: { name: 'RICOCHET', text: 'Its shots glance off what they hit to the nearest other enemy.', fits: (d) => projectile(d) && !['mine', 'flame', 'flak'].includes(d.gun!.shot) },
  scavenger: { name: 'SCAVENGER', text: 'Its kills shake loose more scrap, and now and then a repair kit.', fits: gun },
  // engines and dash mods
  deflecting: { name: 'DEFLECTING', text: 'A perfect dash throws the bullets it soaks back at them.', fits: (d) => d.cls === 'engine' },
  afterburn: { name: 'AFTERBURN', text: 'Dashes leave a wake of fire: what crosses it burns.', fits: (d) => d.cls === 'engine' },
  adrenal: { name: 'ADRENAL', text: 'A perfect (dash or parry) charges the special a fifth and the aux halfway.', fits: (d) => d.cls === 'engine' },
  // the hull
  secondwind: { name: 'SECOND WIND', text: 'Once a level, the hit that would down you leaves you a sliver of hull.', fits: (d) => d.cls === 'defense' },
  barbed: { name: 'BARBED', text: 'Whatever rams you, or you ram, takes a hard hit and reels.', fits: (d) => d.cls === 'defense' && !d.aux },
  reactive: { name: 'REACTIVE', text: 'Your shield breaking lets out a shockwave: the bullets round you go, what is near is shocked.', fits: (d) => d.cls === 'defense' && !!d.shield },
  // boosters: on the guns they touch
  hotwired: { name: 'HOT-WIRED', text: 'Touching guns’ shots pierce one more.', fits: (d) => d.cls === 'booster' },
  primed: { name: 'PRIMED', text: 'After a perfect (dash or parry), touching guns hit +60% for 3 s.', fits: (d) => d.cls === 'booster' },
  // specials
  surging: { name: 'SURGING', text: 'The special also reloads every heavy and cools every gun.', fits: (d) => !!d.special },
  lingering: { name: 'LINGERING', text: 'Nothing can touch you for 1.5 s after the special.', fits: (d) => !!d.special },
};

/** The colour an affix is written in (on cards, in the hangar, over the ship). */
export const AFFIX_COLOR = '#5ef0c8';

export const tierOf = (it: Item): Tier => it.tier ?? 'common';

/** What it's called: a legendary carries its trait in its name. */
export function itemName(it: Item) {
  const d = partById(it.id);
  return it.trait ? `${TRAITS[it.trait].name} ${d.name.toUpperCase()}` : d.name.toUpperCase();
}

/** Just the item (a placement is one, plus where it sits). */
export function toItem(it: Item): Item {
  const out: Item = { id: it.id };
  if (it.tier) out.tier = it.tier;
  if (it.mods) out.mods = it.mods.map((m) => ({ ...m }));
  if (it.affix) out.affix = it.affix;
  if (it.trait) out.trait = it.trait;
  return out;
}

/** How many mods each tier rolls (a rare's may be an affix instead: see rollItem). */
const MOD_COUNT: Record<Tier, number> = { common: 0, rare: 1, epic: 1, legendary: 1 };
/** How likely a tier is to carry an affix. */
const AFFIX_CHANCE: Record<Tier, number> = { common: 0, rare: 0.45, epic: 1, legendary: 1 };

/** Affixes that fit a part. */
export const affixesFor = (d: PartDef) => (Object.keys(AFFIXES) as AffixId[]).filter((a) => AFFIXES[a].fits(d));

/** Rolls an item of a part at a tier (as near as the part allows). */
export function rollItem(r: Rng, id: string, tier: Tier): Item {
  const d = partById(id);
  const kinds = shuffle(r, (Object.keys(MODS) as ModKind[]).filter((k) => MODS[k].fits(d)));
  const it: Item = { id, tier };
  // rolls lean high on the better tiers
  const floor = tier === 'legendary' ? 0.45 : tier === 'epic' ? 0.2 : 0;
  const affixes = affixesFor(d);
  const affix = affixes.length && r() < AFFIX_CHANCE[tier] ? pick(r, affixes) : undefined;
  // a rare carries one thing: the affix, or a mod
  const n = tier === 'rare' && affix ? 0 : MOD_COUNT[tier];
  const mods = kinds.slice(0, n).map((k) => ({ k, roll: floor + (1 - floor) * r() }));
  if (mods.length) it.mods = mods;
  if (affix) it.affix = affix;
  if (tier === 'legendary') {
    const traits = (Object.keys(TRAITS) as TraitId[]).filter((t) => TRAITS[t].fits(d));
    if (traits.length) it.trait = pick(r, traits);
    else it.tier = 'epic';
  }
  if (!it.mods && !it.affix && tier !== 'legendary' && tier !== 'common') it.tier = 'common';
  return it;
}

/** A tier, by luck: `d` the run's difficulty, `rich` a hunt or a boss, `danger` 1..3. */
export function rollTier(r: Rng, d: number, rich = false, danger = 1): Tier {
  const k = rich ? 2 : 1;
  return weighted(r, [
    ['common', Math.max(18, 62 - d * 22 - (danger - 1) * 10 - (rich ? 20 : 0))],
    ['rare', 30 + d * 8 + (danger - 1) * 5],
    ['epic', (7 + d * 6 + (danger - 1) * 3) * k],
    ['legendary', (1.2 + d * 1.6) * k * k],
  ] as [Tier, number][]);
}

/** What an item does to a part's numbers, beyond the trait's rules (see links.ts and build.ts). */
export interface ItemDef extends PartDef {
  item: Item;
  /** Strength multiplier its mods and trait give (potency, overclock). */
  potency: number;
  /** Special charges this much faster (1: no change). */
  chargeRate: number;
  /** Dash recovery multiplier (1: no change). */
  dashRecover: number;
}

const cache = new WeakMap<Item, ItemDef>();

/** The PartDef an item works as: its rolled numbers applied. Stock items come back as the part. */
export function itemDef(it: Item): ItemDef {
  const base = partById(it.id);
  if (!it.mods && !it.trait && !it.affix) return base as ItemDef;
  let d = cache.get(it);
  if (d && d.id === it.id) return d;
  d = { ...base, item: it, potency: 1, chargeRate: 1, dashRecover: 1 };
  if (base.gun) d.gun = { ...base.gun };
  if (base.boost) d.boost = { ...base.boost };
  for (const m of it.mods ?? []) {
    const v = modValue(m);
    switch (m.k) {
      case 'dmg':
        d.gun!.damage *= 1 + v;
        break;
      case 'rate':
        d.gun!.rate *= 1 + v;
        break;
      case 'cool':
        d.gun!.heat *= 1 - v;
        break;
      case 'thrust':
        d.thrust = (d.thrust ?? 0) * (1 + v);
        break;
      case 'potent':
        d.potency *= 1 + v;
        break;
      case 'charge':
        d.chargeRate *= 1 + v;
        break;
      case 'swift':
        d.dashRecover *= 1 - v;
        break;
      case 'light':
        d.mass *= 1 - v;
        break;
      case 'plated':
        d.hullPct = (d.hullPct ?? 0) + v;
        break;
    }
  }
  if (it.trait === 'colossal' && d.gun) {
    d.gun.damage *= 3;
    d.gun.rate *= 0.5;
    d.gun.pierce = (d.gun.pierce ?? 0) + 2;
    d.gun.heat *= 1.5;
  }
  if (it.trait === 'overclock') {
    d.potency *= 2;
    d.mass *= 2;
  }
  cache.set(it, d);
  return d;
}

/** What it sells for, against what the part alone would. */
export const TIER_VALUE: Record<Tier, number> = { common: 1, rare: 1.35, epic: 1.8, legendary: 3 };
