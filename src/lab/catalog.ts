/**
 * What the wave lab can send, and what it can fly against it: every enemy kind a planet has (its
 * old guard, and every faction's foes in that planet's colours), the stages of a run, and a ladder
 * of ships from the starter to an endgame build.
 */

import type { Archetype, EnemySkin, Planet } from '../world/planets';
import { BOUNTIES, FOES, PALETTE, factionOf, foeSkin, type Faction, type Foe } from '../sim/factions';
import { HP } from '../sim/level';
import { enemyRadius } from '../sim/enemies';
import type { Build } from '../sim/build';
import { LOADOUTS, loadout, withTier } from '../sim/loadouts';
import type { Tier } from '../game/loot';

export type Group = Faction | 'guard' | 'bounty';

export interface Kind {
  id: Archetype | Foe;
  name: string;
  group: Group;
  /** Base hull (before the stage's growth). */
  hp: number;
  r: number;
  /** One line on how it fights. */
  role: string;
  skin: EnemySkin;
  /** The model it falls back on (enemy_<model>_<mech|beast>). */
  model: string;
  water: boolean;
  ground: boolean;
}

export const GROUPS: { id: Group; name: string; color: string }[] = [
  { id: 'guard', name: 'Old guard', color: '#e9dcc2' },
  { id: 'scrap', name: 'Scrap clans', color: hex(PALETTE.scrap[2]) },
  { id: 'lattice', name: 'The Lattice', color: hex(PALETTE.lattice[2]) },
  { id: 'wild', name: 'Wild beasts', color: hex(PALETTE.wild[2]) },
  { id: 'bloom', name: 'The Bloom', color: hex(PALETTE.bloom[2]) },
  { id: 'bounty', name: 'Bounties', color: '#ffd04a' },
];

export const groupOf = (g: Group) => GROUPS.find((x) => x.id === g)!;

const ROLE: Record<Archetype, string> = {
  dart: 'Quick fighters that swoop in formation',
  gunship: 'Hovers in, fires spreads, leaves',
  turret: 'On the ground, tracks you',
  bomber: 'Slow; lays mines and flak',
  lancer: 'Stops, telegraphs, fires a beam',
  swarm: 'A flock of small beasts',
  brute: 'Big and tough; spirals of shots',
  serpent: 'Bursts out of sea or sand, segmented',
  carrier: 'Launches fighters of its own',
};

const BOUNTY = new Set<Foe>(Object.values(BOUNTIES).flat());

export function kindsFor(planet: Planet): Kind[] {
  const out: Kind[] = planet.enemies.map((s) => ({
    id: s.archetype,
    name: s.name,
    group: 'guard',
    hp: HP[s.archetype],
    r: enemyRadius(s.archetype),
    role: ROLE[s.archetype],
    skin: s,
    model: s.archetype,
    water: false,
    ground: s.archetype === 'turret',
  }));
  for (const id of Object.keys(FOES) as Foe[]) {
    const d = FOES[id];
    out.push({
      id,
      name: d.name,
      group: BOUNTY.has(id) && id !== 'ace' ? 'bounty' : d.faction,
      hp: d.hp,
      r: d.r,
      role: d.tip ? sentence(d.tip) : 'Worth chasing down before it gets away',
      skin: foeSkin(planet, id),
      model: d.model,
      water: !!d.water,
      ground: !!d.ground,
    });
  }
  return out;
}

/** The faction a planet's own fliers belong to. */
export const homeOf = (planet: Planet) => factionOf(planet);

function sentence(tip: string) {
  const s = tip.toLowerCase().replace(/\s*:\s*/, ': ');
  return s[0].toUpperCase() + s.slice(1);
}

function hex(n: number) {
  return `#${n.toString(16).padStart(6, '0')}`;
}

// --- the run --------------------------------------------------------------------------------

/** A point in a run: sector 1..3, stop 1..8 (difficulty as Run.difficulty works it out). */
export interface Stage {
  sector: number;
  stop: number;
}

export const difficultyAt = (s: Stage, extra = 0) => (s.sector - 1) * 0.55 + Math.min(s.stop, 8) * 0.07 + extra;
export const stageName = (s: Stage) => `S${s.sector}·${s.stop}`;

/** The run in six steps: the start and middle of each sector (the bench's columns). */
export const STAGES: Stage[] = [
  { sector: 1, stop: 1 },
  { sector: 1, stop: 5 },
  { sector: 2, stop: 1 },
  { sector: 2, stop: 5 },
  { sector: 3, stop: 1 },
  { sector: 3, stop: 5 },
];

/** A site's danger on top of the run's difficulty (see DANGER_HARDER in run.ts); a gate is the Warden's. */
export const DANGERS = [
  { id: 'calm', name: 'Calm', extra: 0 },
  { id: 'risky', name: 'Risky', extra: 0.2 },
  { id: 'deadly', name: 'Deadly', extra: 0.42 },
  { id: 'gate', name: 'Gate', extra: 0.5 },
];

// --- ships ----------------------------------------------------------------------------------

export interface Ship {
  id: string;
  name: string;
  /** What it stands for. */
  note: string;
  loadout: string;
  frame: string;
  tier: Tier;
}

/** The ladder: the ship a crew is likely to fly at each point of a run, weakest first. */
export const LADDER: Ship[] = [
  { id: 'starter', name: 'Starter', note: 'The Kestrel as it leaves the yard', loadout: 'starter', frame: 'kestrel', tier: 'common' },
  { id: 'starter+', name: 'Starter, tuned', note: 'Same guns, rare rolls on them', loadout: 'starter', frame: 'kestrel', tier: 'rare' },
  { id: 'mid', name: 'Mid-run', note: 'A Mule with a tool on every hardpoint, rare parts', loadout: 'strong', frame: 'mule', tier: 'rare' },
  { id: 'late', name: 'Late', note: 'The same Mule, all epic', loadout: 'strong', frame: 'mule', tier: 'epic' },
  { id: 'end', name: 'Endgame', note: 'All legendary, traits and all', loadout: 'strong', frame: 'mule', tier: 'legendary' },
];

/** The build archetypes: some will be strong and some weak, and that's fine; they're benched against the ladder. */
export const ARCHETYPES: { loadout: string; name: string; note: string }[] = [
  { loadout: 'parry', name: 'Parry tank', note: 'Mule: parry, plate, mirror' },
  { loadout: 'speed', name: 'Speed demon', note: 'Kestrel: a lance and a phase drive' },
  { loadout: 'assassin', name: 'Dash assassin', note: 'Wasp: scatterguns, ram and lunge' },
  { loadout: 'turret', name: 'Turret', note: 'Lattice: a sentry with an amp' },
  { loadout: 'alchemist', name: 'Alchemist', note: 'Lattice: marks and reactions' },
];

/** The ladder's ship you'd most likely have at a stage (the assumption the bench's diagonal draws). */
export function expectedAt(s: Stage): number {
  if (s.sector === 1) return s.stop <= 4 ? 0 : 1;
  if (s.sector === 2) return 2;
  return s.stop <= 4 ? 3 : 4;
}

export const TIER_OF_LADDER: Tier[] = LADDER.map((s) => s.tier);

export function buildOf(ship: Pick<Ship, 'loadout' | 'frame' | 'tier'>): Build {
  return withTier(loadout(ship.loadout, ship.frame), ship.tier);
}

export const loadouts = () => Object.keys(LOADOUTS);
