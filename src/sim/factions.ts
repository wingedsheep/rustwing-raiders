/**
 * Who you fight, and how they fight. Four factions, each with its own attack language:
 *
 *  - scrap:   the pirate clans (Hesk, the Cartel, the Scav Clans, the Reef Pirates). Momentum: they
 *             ram, chase, harpoon, shell and torpedo you, and race you for it.
 *  - lattice: the old machine and the companies that copied it (Port Authority, the Waking Engine,
 *             Vantorr). Precision: shields, reflectors, sweeping beams and gates.
 *  - wild:    the native beasts. The hunt: they pounce, burrow and spit.
 *  - bloom:   the fungal rot of Mirefall. Links that heal, spores that jam your guns, mines that
 *             hunt your boost.
 *
 * The foes here are the new kinds (see foes.ts for how they fly); the older archetypes still come
 * from each planet's roster (world/planets.ts).
 */

import type { Archetype, Biome, EnemySkin, Planet } from '../world/planets';

export type Faction = 'scrap' | 'lattice' | 'wild' | 'bloom';

export type Foe =
  | 'ramjack'
  | 'rattler'
  | 'hookjaw'
  | 'rigger'
  | 'ace'
  | 'flakker'
  | 'swooper'
  | 'burrower'
  | 'spitter'
  | 'warden'
  | 'prism'
  | 'gatekeeper'
  | 'heartpod'
  | 'puffball'
  // the second wave of kinds: boats, cars, airships and odd fliers
  | 'gunboat'
  | 'technical'
  | 'blimp'
  | 'spindle'
  | 'halo'
  | 'manta'
  | 'rook'
  // bounties: worth chasing down before they get away
  | 'runner'
  | 'vault'
  // a strongbox's pair of haulers: never sent on their own
  | 'tug';

export interface FoeDef {
  name: string;
  faction: Faction;
  hp: number;
  r: number;
  score: number;
  scrap: number;
  /** The model to clone (enemy_<model>_<mech|beast>), and how big. */
  model: Archetype | 'gunboat' | 'technical' | 'blimp' | 'spindle' | 'halo' | 'manta' | 'heartpod';
  beast: boolean;
  scale: number;
  /** Stands on the ground (scrolls with the land). */
  ground?: boolean;
  /** Rides the water (a boat): only sent where there's water to float on. */
  water?: boolean;
  /** For the field guide, the first time it's met: what it does, and how to beat it. */
  tip?: string;
}

export const FOES: Record<Foe, FoeDef> = {
  ramjack: { name: 'Ramjack', faction: 'scrap', hp: 40, r: 1.6, score: 300, scrap: 3, model: 'dart', beast: false, scale: 1.5, tip: 'LINES UP, LOCKS, LUNGES: SIDESTEP THE LANE, THEN HIT IT WHILE IT SPINS OUT' },
  rattler: { name: 'Rattler', faction: 'scrap', hp: 30, r: 1.4, score: 250, scrap: 2, model: 'dart', beast: false, scale: 1.25, tip: 'COMES UP FROM BEHIND: BOOST TO OUTRUN IT, OR LET IT BRAKE AND PUNISH IT' },
  hookjaw: { name: 'Hookjaw', faction: 'scrap', hp: 70, r: 2, score: 500, scrap: 4, model: 'gunship', beast: false, scale: 1, tip: 'HARPOONS YOU AND REELS YOU IN: DASH TO SNAP THE LINE' },
  rigger: { name: 'Torpedo Rig', faction: 'scrap', hp: 65, r: 1.8, score: 550, scrap: 4, model: 'bomber', beast: false, scale: 1.05, tip: 'LOCKS ON, THEN TORPEDOES: TURN HARD, DASH THROUGH, OR SHOOT THEM DOWN' },
  ace: { name: 'Pirate Ace', faction: 'scrap', hp: 160, r: 1.5, score: 1500, scrap: 8, model: 'dart', beast: false, scale: 1.4, tip: 'A RIVAL: ROLLS AWAY FROM YOUR FIRE. BOOST PAST IT TO BEAT IT' },
  flakker: { name: 'Flakker', faction: 'scrap', hp: 45, r: 1.4, score: 300, scrap: 3, model: 'turret', beast: false, scale: 1.1, ground: true , tip: 'SHELLS LAND WHERE YOU WILL BE: CHANGE YOUR PACE' },
  swooper: { name: 'Sower', faction: 'wild', hp: 30, r: 1.6, score: 250, scrap: 2, model: 'swarm', beast: true, scale: 2.2, tip: 'ITS SHADOW MARKS YOU, THEN IT FOLDS AND DIVES THROUGH THE MARK' },
  burrower: { name: 'Burrower', faction: 'wild', hp: 90, r: 2.2, score: 700, scrap: 5, model: 'serpent', beast: true, scale: 1.7, tip: 'A RIPPLE COMES FOR YOU, THEN IT ERUPTS: GET OFF THE MARK' },
  spitter: { name: 'Spitter', faction: 'wild', hp: 40, r: 1.4, score: 300, scrap: 3, model: 'turret', beast: true, scale: 1.1, ground: true , tip: 'LOBS ACID AHEAD OF YOU: KEEP OUT OF THE PUDDLE' },
  warden: { name: 'Bulwark', faction: 'lattice', hp: 110, r: 2, score: 700, scrap: 5, model: 'gunship', beast: false, scale: 1, tip: 'SHIELDED IN FRONT: GET ROUND IT, HIT IT AS IT FIRES, OR POUND THE SHIELD TILL IT CRACKS' },
  prism: { name: 'Prism', faction: 'lattice', hp: 70, r: 1.6, score: 600, scrap: 4, model: 'lancer', beast: false, scale: 1.2, tip: 'CLOSED, IT THROWS SHOTS BACK: HIT IT WHEN IT OPENS TO SWEEP, OR FIRE IN FOCUS' },
  gatekeeper: { name: 'Gatekeeper', faction: 'lattice', hp: 60, r: 1.5, score: 300, scrap: 3, model: 'turret', beast: false, scale: 1.2, ground: true , tip: 'TWO PYLONS, A CLOSING GATE: FLY THE GAP, OR DROP A PYLON' },
  heartpod: { name: 'Heartpod', faction: 'bloom', hp: 50, r: 1.8, score: 600, scrap: 4, model: 'heartpod', beast: true, scale: 1.1, tip: 'BINDS ITS FRIENDS AND HEALS THEM: KILL THE POD FIRST' },
  puffball: { name: 'Puffball', faction: 'bloom', hp: 6, r: 0.9, score: 60, scrap: 0, model: 'swarm', beast: true, scale: 0.9, tip: 'SPORE MINES: BOOST NEAR ONE AND IT COMES AFTER YOU' },
  gunboat: { name: 'Gunboat', faction: 'scrap', hp: 120, r: 2.4, score: 900, scrap: 6, model: 'gunboat', beast: false, scale: 1.1, ground: true, water: true, tip: 'BROADSIDES OUT OF ITS FLANK: KEEP OFF ITS BEAM, AHEAD OR ASTERN' },
  technical: { name: 'Technical', faction: 'scrap', hp: 50, r: 1.6, score: 400, scrap: 3, model: 'technical', beast: false, scale: 1.1, ground: true, tip: 'IT SKIDS TO A STOP TO FIRE: SLIDE OFF ITS LINE, HIT IT WHILE IT STANDS' },
  blimp: { name: 'Dreadnought', faction: 'scrap', hp: 260, r: 3.6, score: 1400, scrap: 10, model: 'blimp', beast: false, scale: 1, tip: 'HEAVY: A BROADSIDE EACH WAY AND MINES BELOW. GET ABOVE IT' },
  spindle: { name: 'Spindle', faction: 'lattice', hp: 90, r: 1.8, score: 650, scrap: 4, model: 'spindle', beast: false, scale: 1.1, ground: true, tip: 'ITS ARMS SPIN THE WAY THE ARROWS SHOW: CIRCLE WITH THEM' },
  halo: { name: 'Halo', faction: 'lattice', hp: 70, r: 1.7, score: 600, scrap: 4, model: 'halo', beast: false, scale: 1.1, tip: 'TWO RINGS: THE FIRST GAP IS WHERE YOU ARE, THE SECOND IS NOT' },
  manta: { name: 'Sky Manta', faction: 'wild', hp: 140, r: 3.2, score: 900, scrap: 6, model: 'manta', beast: true, scale: 1, tip: 'ITS WAKE OF THORNS BURSTS UP AND DOWN: CROSS IT BEFORE IT RIPENS' },
  rook: { name: 'Rook', faction: 'lattice', hp: 75, r: 1.8, score: 600, scrap: 4, model: 'carrier', beast: false, scale: 0.8, tip: 'ITS DARTS ONLY TURN SQUARE: WHEN ONE STOPS AND DRAWS ITS LANE, STEP OFF IT' },
  runner: { name: 'Loot Runner', faction: 'scrap', hp: 55, r: 1.8, score: 800, scrap: 6, model: 'bomber', beast: false, scale: 0.8 },
  vault: { name: 'Strongbox', faction: 'lattice', hp: 90, r: 2, score: 900, scrap: 2, model: 'carrier', beast: false, scale: 0.55, tip: 'TWO TUGS HAUL IT AWAY: SHOOT THEM DOWN AND IT DROPS AND BURSTS OPEN' },
  tug: { name: 'Tug', faction: 'lattice', hp: 16, r: 1.1, score: 150, scrap: 1, model: 'swarm', beast: false, scale: 0.9, tip: 'HAULING A STRONGBOX: SHOOT DOWN BOTH TUGS AND THE BOX DROPS AND BURSTS OPEN' },
};

export const isFoe = (a: string): a is Foe => a in FOES;

/**
 * Faction colours: body, trim, accent (the accent is what its attacks and bullets glow: one hue per
 * faction, so a bullet says who fired it). Rust and cream are the players' own: nobody else wears them.
 */
export const PALETTE: Record<Faction, [number, number, number]> = {
  scrap: [0xa88a4a, 0x2e2a2e, 0xff3a3a],
  lattice: [0xe8ecf0, 0x2a3448, 0x4ae8ff],
  wild: [0x6a8a3a, 0xe0d0a0, 0xff5a8a],
  bloom: [0x6a3a8a, 0xd8c0ff, 0xb0ff4a],
};

const PLANET_FACTION: Record<string, Faction> = {
  orutal: 'scrap',
  halcyon: 'lattice',
  kessra: 'scrap',
  mirefall: 'bloom',
  glacis: 'lattice',
  ashgrave: 'scrap',
  vesh: 'scrap',
  cinder: 'lattice',
};

export const factionOf = (planet: Planet): Faction => PLANET_FACTION[planet.id] ?? 'scrap';

/** The factions fighting in a biome: the planet's own, plus the beasts where there are beasts. */
export function factionsIn(planet: Planet, biome: Biome): Faction[] {
  const f: Faction[] = [];
  if (planet.id === 'mirefall' || biome.id === 'sporevents') f.push('bloom');
  else if (biome.id === 'monoliths') f.push('lattice');
  else f.push(factionOf(planet));
  if (biome.creatures.length && !f.includes('wild')) f.push('wild');
  return f;
}

/** [foe, weight, from how far into the level (0..1)] per faction. */
export const ROSTER: Record<Faction, [Foe, number, number][]> = {
  scrap: [
    ['ramjack', 2.2, 0],
    ['flakker', 2.5, 0.05],
    ['rattler', 2, 0.1],
    ['hookjaw', 1.4, 0.25],
    ['rigger', 1.5, 0.2],
    ['ace', 0.6, 0.45],
    ['technical', 2, 0.05],
    ['gunboat', 1.8, 0.1],
    ['blimp', 0.9, 0.4],
  ],
  lattice: [
    ['warden', 2.6, 0],
    ['prism', 2, 0.1],
    ['gatekeeper', 1.6, 0.15],
    ['halo', 1.5, 0.05],
    ['spindle', 1.3, 0.1],
    ['rook', 1.4, 0.15],
  ],
  wild: [
    ['swooper', 3, 0],
    ['spitter', 2, 0.05],
    ['burrower', 1.4, 0.2],
    ['manta', 1.3, 0.2],
  ],
  bloom: [
    ['puffball', 2.5, 0],
    ['heartpod', 2, 0.15],
    ['swooper', 1, 0.1],
    ['spitter', 1.4, 0],
    ['manta', 0.8, 0.25],
  ],
};

/** Elites have names (on their plate): a few for each faction. */
export const ELITE_NAMES: Record<Faction, string[]> = {
  scrap: ['GRISTLE', 'OLD RUST', 'BLACK MOLLY', 'HACKSAW', 'THE BARON', 'RIVET-JAW', 'MAD DOSSA', 'CINDERBACK'],
  lattice: ['ARBITER', 'THE CENSOR', 'BULWARK PRIME', 'UNIT NINE', 'THE AUDITOR', 'SEVENFOLD'],
  wild: ['SCARBACK', 'GREYMAW', 'OLD MOTHER', 'THE WIDOW', 'SPLITHORN', 'HOLLOWEYE'],
  bloom: ['ROTHEART', 'THE SWELLING', 'GRAVEBLOOM', 'MOTHERSPAWN'],
};

/** The bounties a faction puts out. */
export const BOUNTIES: Record<Faction, Foe[]> = {
  scrap: ['runner', 'vault', 'ace'],
  lattice: ['vault', 'runner'],
  wild: ['runner', 'vault'],
  bloom: ['vault'],
};

/**
 * How each faction tells you it's about to strike (the same grammar for every foe of a faction, so
 * learning one reads its kin): scrappers flare their engines red, then commit; the lattice draws the
 * whole attack out in light first (a full second, never less); beasts rear back and their shadow
 * falls where they'll land; the bloom swells and pulses before it bursts.
 */
export const TELL: Record<Faction, 'flare' | 'draw' | 'rear' | 'swell'> = { scrap: 'flare', lattice: 'draw', wild: 'rear', bloom: 'swell' };

const mix = (a: number, b: number, t: number) => {
  let out = 0;
  for (const s of [16, 8, 0]) {
    const ca = (a >> s) & 255;
    const cb = (b >> s) & 255;
    out |= Math.round(ca + (cb - ca) * t) << s;
  }
  return out;
};

/** The faction's colours, leaning a little towards the planet's own enemies (so it's still that planet). */
export function foeSkin(planet: Planet, foe: Foe): EnemySkin {
  const def = FOES[foe];
  const pal = PALETTE[def.faction];
  const kind = def.beast ? 'beast' : 'mech';
  const local = planet.enemies.find((s) => s.kind === kind)?.colors ?? pal;
  const lean = def.faction === 'bloom' || def.faction === 'lattice' ? 0.12 : 0.2;
  return {
    archetype: def.model as Archetype,
    name: def.name,
    kind,
    colors: [mix(pal[0], local[0], lean), mix(pal[1], local[1], lean), pal[2]],
  };
}
