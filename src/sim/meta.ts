/**
 * What the models are like, without loading them: bounds, collider columns and mounts, written by
 * tools/models/build.py next to each GLB. Keys are `kind` or `kind#variant`.
 */
import propsA from '../generated/props_a.json';
import propsB from '../generated/props_b.json';
import creatures from '../generated/creatures.json';
import enemies from '../generated/enemies.json';
import ships from '../generated/ships.json';
import bosses from '../generated/bosses.json';

export interface Meta {
  kind: string;
  variant: number;
  /** Bounds in game axes (x, y up, z towards the camera). */
  min: [number, number, number];
  max: [number, number, number];
  colliders: { x: number; z: number; r: number }[];
  mounts: { type: string; p: [number, number, number] }[];
}

const ALL: Record<string, Meta> = Object.assign({}, propsA, propsB, creatures, enemies, ships, bosses) as Record<string, Meta>;

/** Every variant of a kind (an empty list if the models haven't been built). */
const byKind = new Map<string, Meta[]>();
for (const m of Object.values(ALL)) {
  if (!byKind.has(m.kind)) byKind.set(m.kind, []);
  byKind.get(m.kind)!.push(m);
}
for (const list of byKind.values()) list.sort((a, b) => a.variant - b.variant);

export const variants = (kind: string): Meta[] => byKind.get(kind) ?? [];
export const metaOf = (kind: string, variant = 0): Meta | undefined => variants(kind)[variant] ?? variants(kind)[0];
export const height = (m: Meta | undefined) => (m ? m.max[1] : 2);
