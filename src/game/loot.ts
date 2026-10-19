/**
 * Loot: no two parts that drop are quite the same. A part as found is an item: the part itself,
 * a tier, and what was rolled for it.
 *
 * - The tier says how much was rolled: a COMMON part is stock, a RARE one has one mod, an EPIC two,
 *   and a LEGENDARY one has a mod and a trait.
 * - Mods are numbers, rolled within a range (+10..30% damage, -25..60% mass, ...). The roll is
 *   kept (0..1), so a card can show how good it came out.
 * - Traits are legendary and change the rules for that part: a gun that fires a mirror twin, a
 *   booster that reaches every gun on the ship, a part that links wherever it sits, shots that
 *   split or come back, kills that pass their marks on, a dash that leaves a turret behind or ends
 *   in a thunderclap, a hull that hits back, a special fed by kills. They are meant to be built round.
 *
 * The part's own rarity (in parts.ts) still says how often it turns up at all; the tier is on
 * top of that. itemDef() turns an item into the PartDef the build sees, numbers and all.
 */

import { partById, type PartDef, type Tag } from './parts';
import { pick, shuffle, weighted, type Rng } from '../util';

export type Tier = 'common' | 'rare' | 'epic' | 'legendary';
export const TIERS: Tier[] = ['common', 'rare', 'epic', 'legendary'];

export type ModKind = 'dmg' | 'rate' | 'cool' | 'thrust' | 'potent' | 'charge' | 'swift' | 'light' | 'frugal' | 'output' | 'plated';

export interface Mod {
  k: ModKind;
  /** Where in its range it rolled, 0..1. */
  roll: number;
}

export type TraitId =
  | 'twin' | 'colossal' | 'wireless' | 'keystone' | 'overclock' | 'prismatic' | 'volatile' | 'splitting'
  | 'sentinel' | 'boomerang' | 'frenzied' | 'thunderous' | 'vengeful' | 'ravenous';

/** A part as found: which part, and what was rolled for it. Plain ids are stock commons. */
export interface Item {
  id: string;
  tier?: Tier;
  mods?: Mod[];
  trait?: TraitId;
}

interface ModSpec {
  /** The range it rolls in. */
  lo: number;
  hi: number;
  /** Whole steps (power, hull). */
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
  light: { lo: 0.25, hi: 0.6, fits: (d) => d.mass >= 0.4 && !d.conduit, text: (v) => `-${pc(v)}% MASS`, short: (v) => `-${pc(v)}% MASS` },
  frugal: { lo: 1, hi: 2, whole: true, fits: (d) => d.power > 0, text: (v) => `-${v} POWER DRAW`, short: (v) => `-${v} DRAW` },
  output: { lo: 1, hi: 3, whole: true, fits: (d) => d.power < 0, text: (v) => `+${v} POWER`, short: (v) => `+${v} POWER` },
  plated: { lo: 1, hi: 2, whole: true, fits: (d) => d.cls === 'defense' || d.tags.includes('armor'), text: (v) => `+${v} HULL`, short: (v) => `+${v} HULL` },
};

/** Parts whose effect runs at a strength (boosters, passives, dash mods, the aux). */
function scales(d: PartDef) {
  return !!(d.boost || d.passive || (d.mod && !d.mod.refill) || d.aux);
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
    fits: (d) => !!(d.boost || d.drone || (d.link && !d.link.side && !d.link.want.open)),
  },
  keystone: { name: 'KEYSTONE', text: 'Always linked, wherever it sits: it runs at 150% anywhere.', fits: (d) => !!d.link },
  overclock: { name: 'OVERCLOCKED', text: 'Runs at double strength, and draws double power.', fits: (d) => scales(d) || d.power < 0 },
  volatile: { name: 'VOLATILE', text: 'What it kills passes its marks on: the two nearest enemies catch them.', fits: (d) => projectile(d) },
  splitting: { name: 'SPLITTING', text: 'Every shot splits in two when it first hits, and the halves fly on.', fits: (d) => projectile(d) && (d.gun?.count ?? 1) <= 2 },
  sentinel: { name: 'SENTINEL', text: 'Every dash leaves a copy of it behind: a turret that fires at the nearest enemy for 3 s.', fits: (d) => !!d.gun && d.gun.shot !== 'beam' && !d.gun.auto },
  boomerang: { name: 'BOOMERANG', text: 'Its shots turn at the end of their flight and come back past you, hitting everything again.', fits: (d) => thrown(d) },
  frenzied: { name: 'FRENZIED', text: 'Every kill whips it up: 15% faster each, up to +90%, until 2.5 s pass without one.', fits: (d) => !!d.gun && d.gun.shot !== 'beam' },
  thunderous: { name: 'THUNDEROUS', text: 'Every dash ends in a thunderclap: what’s near is shocked and thrown back. Twice as hard on a perfect.', fits: (d) => d.cls === 'engine' },
  vengeful: { name: 'VENGEFUL', text: 'A hit on you sets off a nova: bullets round you are wiped and shrapnel flies out, harder the lower your hull.', fits: (d) => d.cls === 'defense' && !!(d.hp || d.shield) },
  ravenous: { name: 'RAVENOUS', text: 'Kills feed it: each one charges it a tenth. Keep killing and it never runs dry.', fits: (d) => !!d.special },
  prismatic: { name: 'PRISMATIC', text: 'Counts as one of every tag towards set bonuses. Clashes with nothing new.', fits: (d) => !d.conduit },
};

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
  if (it.trait) out.trait = it.trait;
  return out;
}

/** How many mods each tier rolls. */
const MOD_COUNT: Record<Tier, number> = { common: 0, rare: 1, epic: 2, legendary: 1 };

/** Rolls an item of a part at a tier (as near as the part allows: conduit is only ever stock). */
export function rollItem(r: Rng, id: string, tier: Tier): Item {
  const d = partById(id);
  if (d.conduit) return { id };
  const kinds = shuffle(r, (Object.keys(MODS) as ModKind[]).filter((k) => MODS[k].fits(d)));
  const it: Item = { id, tier };
  // rolls lean high on the better tiers
  const floor = tier === 'legendary' ? 0.45 : tier === 'epic' ? 0.2 : 0;
  const mods = kinds.slice(0, MOD_COUNT[tier]).map((k) => ({ k, roll: floor + (1 - floor) * r() }));
  if (mods.length) it.mods = mods;
  if (tier === 'legendary') {
    const traits = (Object.keys(TRAITS) as TraitId[]).filter((t) => TRAITS[t].fits(d));
    // prismatic fits everything: only when nothing better does, or now and then
    const best = traits.filter((t) => t !== 'prismatic');
    it.trait = best.length && r() < 0.8 ? pick(r, best) : 'prismatic';
  }
  if (!it.mods && tier !== 'legendary' && tier !== 'common') it.tier = 'common';
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

/** Tags a part counts as, for set bonuses (a prismatic part counts as all of them). */
export function tagsOf(it: Item, all: Tag[]): Tag[] {
  return it.trait === 'prismatic' ? all : partById(it.id).tags;
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
  if (!it.mods && !it.trait) return base as ItemDef;
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
      case 'frugal':
        d.power = Math.max(0, d.power - v);
        break;
      case 'output':
        d.power -= v;
        break;
      case 'plated':
        d.hp = (d.hp ?? 0) + v;
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
    if (d.power > 0) d.power *= 2;
  }
  cache.set(it, d);
  return d;
}

/** What it sells for, against what the part alone would. */
export const TIER_VALUE: Record<Tier, number> = { common: 1, rare: 1.35, epic: 1.8, legendary: 3 };
