/**
 * Ships to fly without a run behind them: the starter, a sensible mid-run ship and the build
 * archetypes, for the autopilot (tools/autopilot.ts) and the wave lab (src/lab) to bench.
 */

import { fits, startBuild, type Build } from './build';
import { frameById, partById } from '../game/parts';
import { rollItem, type Tier } from '../game/loot';
import { rng } from '../util';

/** Placements as [part, col, row, quarter turns]. */
const ship = (frame: string, parts: [string, number, number, number?][]): Build => ({ frame, parts: parts.map(([id, c, r, rot]) => ({ id, c, r, rot })) });

export const LOADOUTS: Record<string, (frame: string) => Build> = {
  starter: (f) => startBuild(f),
  // the archetypes, one or two a frame: a parry tank and a turret ship (Magpie), a speed demon and an alchemist (Kestrel), a rammer and a brawler (Hammerhead)
  parry: () =>
    ship('magpie', [
      ['seeker', 0, 0], ['plate', 4, 0], ['rivet', 1, 1], ['rivet', 3, 1], ['mirror', 0, 1], ['sink', 4, 1],
      ['shield', 0, 2], ['amp', 1, 2], ['parry', 2, 2], ['plate', 3, 2], ['thruster', 1, 4], ['thruster', 3, 4],
    ]),
  // (the lance lies across the middle; a rivet in the nose holds the trigger between rounds)
  speed: () =>
    ship('kestrel', [
      ['rivet', 2, 0], ['vector', 1, 1], ['phasedrive', 3, 1], ['lance', 1, 2, 1], ['thruster', 1, 4], ['thruster', 3, 4],
    ]),
  assassin: () =>
    ship('hammer', [
      ['vector', 0, 0], ['lunge', 1, 0], ['scatter', 2, 0], ['scatter', 3, 0], ['hone', 4, 0], ['wake', 2, 1], ['bombbay', 3, 1],
      ['mine', 2, 2], ['thruster', 2, 3], ['thruster', 3, 3],
    ]),
  turret: () =>
    ship('magpie', [
      ['plate', 0, 0], ['seeker', 4, 0], ['shield', 0, 1], ['sentry', 1, 1], ['rivet', 3, 1], ['autoloader', 4, 1],
      ['amp', 1, 2], ['parry', 2, 2], ['overdrive', 3, 2], ['thruster', 1, 4], ['thruster', 3, 4],
    ]),
  // marks and reactions: a torch that burns and a seeker that cracks off a Breacher Rack, a Catalyst to set them off
  alchemist: () =>
    ship('kestrel', [
      ['emp', 2, 0], ['torch', 1, 1], ['flaw', 2, 1], ['seeker', 3, 1], ['incend', 1, 2], ['catalyst', 2, 2], ['breach', 3, 2],
      ['plate', 0, 3], ['shield', 4, 3], ['thruster', 1, 4], ['thruster', 3, 4],
    ]),
  // a sensible mid-run ship: a tool on every hardpoint, boosters on them, armour, an engine at the back
  strong: () =>
    ship('hammer', [
      ['seeker', 0, 0], ['scatter', 2, 0], ['scatter', 3, 0], ['plate', 5, 0], ['plate', 0, 1], ['bombbay', 1, 1],
      ['amp', 2, 1], ['sink', 3, 1], ['vector', 4, 1], ['shield', 5, 1], ['thruster', 2, 3], ['thruster', 3, 3],
    ]),
};

/** The parts a crew might pick up over a run, in the order they come (each where it first fits). */
const PATH = ['plate', 'amp', 'seeker', 'thruster', 'shield', 'sink', 'scatter', 'incend', 'plate', 'vector', 'mine', 'plate', 'amp'];
/** A part's tier by when it came: the first sector's are common, the second's rare, the third's epic (about what the loot rolls). */
const pathTier = (i: number): Tier => (i < 3 ? 'common' : i < 7 ? 'rare' : 'epic');

/** The frame as a run grows it: its start, plus the first `n` parts of PATH at their tiers. */
function grown(frame: string, n: number): Build {
  const b = startBuild(frame);
  let added = 0;
  for (const id of PATH) {
    if (added >= n) break;
    const grid = frameById(frame).grid;
    const spot = grid.flatMap((row, r) => [...row].flatMap((_, c) => [0, 1, 2, 3].map((rot) => ({ id, c, r, rot })))).find((p) => fits(b, p));
    if (!spot) continue;
    b.parts.push({ ...rollItem(rng(added * 7919 + 13), id, pathTier(added)), c: spot.c, r: spot.r, rot: spot.rot });
    added++;
  }
  if (added < n) throw new Error(`path:${n} fits only ${added} parts on the ${frame}`);
  return b;
}

/**
 * A named loadout, or a bench: `gun:<id>` is the starter frame with only that gun on it (a
 * second gun after a comma, `gun:rivet,rail`), to set the guns against each other; `path:<n>`
 * is the frame grown n parts along a run.
 */
export function loadout(name: string, frame: string): Build {
  if (name.startsWith('path:')) return grown(frame, Number(name.slice(5)));
  if (!name.startsWith('gun:')) {
    // a hand-built ship that wouldn't go together in the hangar benches nothing real: say so
    const b = LOADOUTS[name](frame);
    for (const p of b.parts) if (!fits(b, p, p)) throw new Error(`${name}: ${p.id} at ${p.c},${p.r} doesn't fit the ${b.frame}`);
    return b;
  }
  const b = startBuild(frame);
  const guns = name.slice(4).split(',');
  // each on the first socket it fits, with a hardpoint of its kind free (trigger or heavy)
  b.parts = b.parts.filter((p) => partById(p.id).cls !== 'gun');
  const grid = frameById(b.frame).grid;
  for (const id of guns) {
    const spot = grid.flatMap((row, r) => [...row].flatMap((_, c) => [0, 1, 2, 3].map((rot) => ({ id, c, r, rot })))).find((p) => fits(b, p));
    if (!spot) throw new Error(`gun:${id} has no free hardpoint on the ${b.frame}`);
    b.parts.push(spot);
  }
  return b;
}

/** The same ship with every part rolled at `tier` (its mods, affix and trait from `seed`, so a tier is always the same ship). */
export function withTier(b: Build, tier: Tier, seed = 1): Build {
  if (tier === 'common') return b;
  return { frame: b.frame, parts: b.parts.map((p, i) => ({ ...rollItem(rng(seed * 101 + i * 7919), p.id, tier), c: p.c, r: p.r, rot: p.rot })) };
}
