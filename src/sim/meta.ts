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
import setOrutal from '../generated/set_orutal.json';
import setHalcyon from '../generated/set_halcyon.json';
import setKessra from '../generated/set_kessra.json';
import setMirefall from '../generated/set_mirefall.json';
import setGlacis from '../generated/set_glacis.json';
import setAshgrave from '../generated/set_ashgrave.json';
import setVesh from '../generated/set_vesh.json';
import setCinder from '../generated/set_cinder.json';
import { FLIGHT_Y, toFlight } from './types';

export interface Meta {
  kind: string;
  variant: number;
  /** Bounds in game axes (x, y up, z towards the camera). */
  min: [number, number, number];
  max: [number, number, number];
  /**
   * Collider columns. A leaning part's says the height its (x, z) is at (`y`), how far it shifts per
   * unit up (`lean`) and where it ends (`top`); one `over` the flight line is at height `y`: see colsAt.
   */
  colliders: { x: number; z: number; r: number; y?: number; lean?: [number, number]; top?: number; over?: boolean }[];
  mounts: { type: string; p: [number, number, number] }[];
}

const ALL: Record<string, Meta> = Object.assign({}, propsA, propsB, creatures, enemies, ships, bosses, setOrutal, setHalcyon, setKessra, setMirefall, setGlacis, setAshgrave, setVesh, setCinder) as Record<string, Meta>;

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

/**
 * A model's collider columns where it stands: at (x, z) on ground y, turned by rot, at scale s
 * ((x, z) turns by θ about y to (x cos θ + z sin θ, -x sin θ + z cos θ)). Each one where its part
 * crosses the flight line: a leaning one slides along its lean (on a terrace a crystal crosses
 * lower down, nearer its foot), and one that ends under the flight line there isn't one at all.
 * One over the flight line (a tower-cap's) hits where it's seen: slid down the camera's line of
 * sight to the flight line, up the screen from where it stands.
 */
export function colsAt(m: Meta, x: number, z: number, y: number, rot: number, s: number, give = 1) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  // (the height in the model that's at the flight line)
  const h = (FLIGHT_Y - y) / s;
  const out: { x: number; z: number; r: number }[] = [];
  for (const k of m.colliders) {
    if (k.top !== undefined && k.top < h) continue;
    const d = k.lean ? h - (k.y ?? h) : 0;
    const kx = k.x + (k.lean ? k.lean[0] * d : 0);
    const kz = k.z + (k.lean ? k.lean[1] * d : 0);
    const wz = z + (-kx * sn + kz * c) * s;
    out.push({ x: x + (kx * c + kz * sn) * s, z: k.over ? toFlight(wz, Math.max(FLIGHT_Y, y + (k.y ?? 0) * s)) : wz, r: k.r * s * give });
  }
  return out;
}
