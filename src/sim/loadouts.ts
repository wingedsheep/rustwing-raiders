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
  // the archetypes (see the builds design doc): a parry tank, a speed demon, a dash assassin, a turret ship
  parry: () =>
    ship('mule', [
      ['plate', 0, 0], ['seeker', 1, 0], ['rivet', 2, 0], ['mine', 3, 0], ['plate', 4, 0],
      ['shield', 0, 1], ['plate', 1, 1], ['parry', 2, 1], ['sink', 3, 1], ['mirror', 4, 1],
      ['thruster', 2, 3],
    ]),
  // (the lance lies across the middle; a rivet in the nose holds the trigger between rounds)
  speed: () =>
    ship('kestrel', [
      ['rivet', 2, 0], ['flare', 1, 1], ['phasedrive', 3, 1], ['lance', 1, 2, 1],
    ]),
  assassin: () =>
    ship('wasp', [
      ['scatter', 1, 0], ['scatter', 3, 0], ['hone', 3, 1], ['ram', 0, 2], ['mine', 1, 2], ['bombbay', 2, 2], ['lunge', 3, 2],
      ['wake', 0, 3], ['thruster', 2, 4],
    ]),
  turret: () =>
    ship('lattice', [
      ['plate', 0, 0], ['seeker', 2, 0], ['plate', 4, 0], ['shield', 0, 1], ['sentry', 2, 1], ['mirror', 4, 1],
      ['autoloader', 0, 2], ['flare', 1, 2], ['amp', 2, 2], ['overdrive', 3, 2],
    ]),
  // marks and reactions: a torch that burns and a seeker that cracks off a Breacher Rack, a Catalyst to set them off
  alchemist: () =>
    ship('lattice', [
      ['flaw', 0, 0], ['seeker', 2, 0], ['plate', 4, 0], ['incend', 0, 1], ['torch', 2, 1], ['shield', 4, 1],
      ['catalyst', 0, 2], ['breach', 2, 2], ['emp', 3, 2], ['siphon', 4, 2],
    ]),
  // a sensible mid-run ship: a tool on every hardpoint, boosters on them, armour, an engine at the back
  strong: () =>
    ship('mule', [
      ['plate', 0, 0], ['seeker', 1, 0], ['scatter', 2, 0], ['mine', 3, 0], ['plate', 4, 0],
      ['shield', 0, 1], ['amp', 1, 1], ['flare', 2, 1], ['sink', 3, 1], ['vector', 4, 1],
      ['thruster', 2, 3],
    ]),
};

/** The parts a crew might pick up over a run, in the order they come (each where it first fits). */
const PATH = ['plate', 'amp', 'seeker', 'thruster', 'shield', 'sink', 'scatter', 'flare', 'plate', 'vector', 'mine', 'plate', 'amp'];
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
