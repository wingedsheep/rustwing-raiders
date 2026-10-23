/**
 * The forge's kit: a ship from a list of parts (each bolted where it does the most good: guns up
 * front facing forward, boosters touching guns, the rest wherever they fit), and the targets to
 * try a build on. Plain TypeScript, shared by the forge tab and tools/forge.ts.
 */

import { cellsOf, fits, startBuild, type Build, type Placement } from '../sim/build';
import { frameById, partById, type PartDef } from '../game/parts';
import type { AffixId, TraitId, Tier } from '../game/loot';

export interface KitPart {
  id: string;
  tier?: Tier;
  trait?: TraitId;
  affix?: AffixId;
}

export interface Kit {
  frame: string;
  parts: KitPart[];
  /** Keep the frame's own engines and aux (its thrusters, a Mule's parry). */
  keepStart: boolean;
}

export interface Target {
  id: string;
  name: string;
  note: string;
  waves: string;
}

/** What to try a build on: each preset asks a different question of it. */
export const TARGETS: Target[] = [
  { id: 'crowd', name: 'Crowd', note: 'Fodder in numbers: darts and swarms. Is it good at clearing?', waves: 'dart@30x2,swarm@70,dart@110x2,swarm@150,dart@190x3' },
  { id: 'plated', name: 'Plated', note: 'Gunships, brutes, bombers: plating to break before the hull. Does it open things up?', waves: 'gunship@30,brute@80,bomber@130,gunship@170x2' },
  { id: 'shielded', name: 'Shielded', note: 'Wardens behind shields, a prism. Does it get through?', waves: 'warden@30,prism@90,warden@140x2' },
  { id: 'elites', name: 'Elites', note: 'Two elites with gold plating: a long fight with one big thing.', waves: 'elite:hookjaw@40,elite:brute@140' },
  { id: 'mixed', name: 'Mixed', note: 'A bit of everything, as a level throws it at you.', waves: 'dart@30,ramjack@60,gunship@90,swarm@120,elite:hookjaw@160,flakker@200,brute@240' },
];

const adjacent = (a: [number, number][], b: [number, number][]) => a.some(([c, r]) => b.some(([c2, r2]) => Math.abs(c - c2) + Math.abs(r - r2) === 1));

/** A ship from a kit: the frame, its own engines (and aux) if kept, then each part where it does most good. `left`: what didn't fit. */
export function kitBuild(kit: Kit): { build: Build; left: string[] } {
  const f = frameById(kit.frame);
  const b: Build = kit.keepStart ? startBuild(kit.frame) : { frame: kit.frame, parts: [] };
  // the kit's guns replace the frame's; its aux and its special too, if it brings one
  const brings = (f: (d: PartDef) => unknown) => kit.parts.some((k) => partById(k.id) && f(partById(k.id)));
  const aux = brings((d) => d.aux);
  const special = brings((d) => d.special);
  b.parts = b.parts.filter((p) => {
    const d = partById(p.id);
    return !d.gun && !(aux && d.aux) && !(special && d.special);
  });
  const left: string[] = [];
  // guns first (so boosters have something to touch), then the rest in the order given
  const order = [...kit.parts].sort((a, c) => rank(partById(a.id)) - rank(partById(c.id)));
  for (const k of order) {
    const d = partById(k.id);
    if (!d) {
      left.push(k.id);
      continue;
    }
    const spots = f.grid.flatMap((row, r) => [...row].flatMap((_, c) => [0, 1, 2, 3].map((rot) => ({ id: k.id, c, r, rot }) as Placement))).filter((p) => fits(b, p));
    if (!spots.length) {
      left.push(k.id);
      continue;
    }
    const best = spots.map((p) => ({ p, s: score(b, d, p) })).sort((x, y) => y.s - x.s)[0].p;
    const item: Placement = { ...best };
    if (k.tier) item.tier = k.tier;
    if (k.trait) item.trait = k.trait;
    if (k.affix) item.affix = k.affix;
    b.parts.push(item);
  }
  return { build: b, left };
}

const rank = (d: PartDef | undefined) => (!d ? 9 : d.gun ? 0 : d.boost ? 2 : 1);

/** How good a spot is for a part: guns want the front and the middle, facing forward; boosters want guns to touch. */
function score(b: Build, d: PartDef, p: Placement) {
  const f = frameById(b.frame);
  const cells = cellsOf(p);
  const mid = (f.grid[0].length - 1) / 2;
  const cx = cells.reduce((s, [c]) => s + c, 0) / cells.length;
  const cy = cells.reduce((s, [, r]) => s + r, 0) / cells.length;
  if (d.gun) return -cy * 3 - Math.abs(cx - mid) - (p.rot ?? 0) * 0.5;
  if (d.boost) {
    const guns = b.parts.filter((q) => partById(q.id).gun && adjacent(cells, cellsOf(q))).length;
    return guns * 10 - cy;
  }
  if (d.thrust) return cy * 2;
  return -Math.abs(cy - f.grid.length / 2);
}
