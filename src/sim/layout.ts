/**
 * The level generator's shared toolkit (docs/readability.md, laying out a level). A biome with a
 * layout isn't scattered a chunk at a time: it plans its whole stretch at once, the way the place
 * would have formed or been built. First its bones (the big features the ground is shaped by: a
 * gorge's walls, a wash, the rock left standing), and the beats down its length (narrows, a bowl,
 * a breather); then its groups along the bones, the big forms first and the details gathered round
 * them; the spots worth guarding, and the routes things drive along. The terrain hands each chunk
 * its share of the plan, and the director puts foes on the posts and routes.
 *
 * The layouts themselves, one per biome, are in sim/layouts/.
 */

import type { Pillar, Placed } from './terrain';
import type { SetRole } from '../world/looks';
import { metaOf, variants, height as metaHeight, type Meta } from './meta';
import { FLIGHT_Y, HALF_H, HALF_W } from './types';
import { lerp, smooth, weighted, type Rng } from '../util';

/** A stretch of the level with its own job: a narrows, a bowl, a breather. `z0` is the near end (z0 > z1). */
export interface Beat {
  kind: string;
  z0: number;
  z1: number;
  /** Which side it leans to, if it does (a depot's wall, a bowl's big group). */
  side: -1 | 1;
}

/** A spot worth guarding, where a gun is dug in: its ground, which way it faces, and what it guards. */
export interface Post {
  x: number;
  z: number;
  y: number;
  face: number;
  guards: string;
  /** Taken by a foe already. */
  used?: boolean;
}

/** Something to drive along, from the near end of the stretch to the far one. */
export interface Route {
  kind: 'wash' | 'track' | 'road' | 'water' | 'crack';
  pts: { x: number; z: number }[];
}

/**
 * A place's own effect, where its bones say (step 7 of laying out): dust off a rim, a dust devil
 * out in the open, smoke over a camp. `side` is which way it leans (a rim's dust blows off it).
 */
export interface Emitter {
  kind: 'dust' | 'devil' | 'smoke' | 'trickle' | 'bubble' | 'breath' | 'flakes' | 'spores' | 'vent' | 'fog';
  x: number;
  z: number;
  /** How far it runs along z (a rim's length), 0 for a point. */
  len: number;
  /** Which way it leans; a vent's size (1 a great one). */
  side: -1 | 1;
}

/** The big features the ground is shaped by. */
export interface Bones {
  /** A gorge's walls at z: where the rock turns solid on the left and the right (x). */
  walls?(z: number): [number, number];
  /** Rock left standing in a gorge. */
  pillars?: Pillar[];
  /** The ground's height at (x, z), in place of the biome's shape. */
  height?(x: number, z: number): number;
  /** How much (x, z) is a dry bed or a worn track (0..1), for the ground's colour. */
  wash?(x: number, z: number): number;
  /** A colour the ground at (x, z) is stained with, and how much (0..1): a pond's spice-salt, a shore's sand. */
  stain?(x: number, z: number): [number, number] | null;
  /** The water's level, where the biome has none of its own: brine standing in a pan's hollows. */
  water?: number;
  routes?: Route[];
  /** Other lines the ground is shaped by (cracks, faults): things group along them, nothing drives them. */
  lines?: Route[];
  beats?: Beat[];
}

/** What a layout plans for its stretch. */
export interface Plan {
  beats: Beat[];
  props: Placed[];
  posts: Post[];
  routes: Route[];
  fx: Emitter[];
}

/** What the toolkit needs of the land (the terrain, without importing it). */
export interface Ground {
  height(x: number, z: number): number;
  place(kind: string, x: number, z: number, r: Rng, biome: number, obstacle?: boolean): Placed | null;
}

export interface Layout {
  /** The bones, worked out from the seed: the stretch from z0 down to z1 (z1 < z0). */
  bones(seed: number, z0: number, z1: number, base: { x(z: number): number; half(z: number): number }): Bones;
  /** Everything else, on the kit. */
  plan(kit: Kit, bones: Bones): void;
}

/** A screen of the level. */
export const SCREEN = HALF_H * 2;

/** A size to grow to: a scale, or `fit` to as tall as passes under you. */
type Size = number | 'fit';

export interface Put {
  /** Scale (default: as built, ±10%). */
  s?: Size;
  rot?: number;
  variant?: number;
  /** Room to leave round it (on top of its own footprint). */
  pad?: number;
  /** Stands up on a wall's top, over the flight line, out of play. */
  rim?: boolean;
  /** May stand on what's taken (rubble on a pile, scrub in a group). */
  overlap?: boolean;
}

/** A group's makeup: what it's made of and how many, how far it spreads, its biggest and smallest scale. */
export interface Group {
  kinds: readonly (readonly [string, number])[];
  n: number;
  spread: number;
  big: Size;
  small: number;
  /** Where it mustn't go (the lane, a route). */
  keep?: (x: number, z: number) => boolean;
  /** Stretched along (radians, and how much longer than wide), for a run along a wall. */
  along?: number;
  stretch?: number;
  rim?: boolean;
}

/**
 * The toolkit a layout plans on: putting things down where there's room (each thing's footprint
 * kept), groups that go big to small, the posts and routes. No cap on how much goes on a screen:
 * how it looks decides that, and performance is made to work round it.
 */
export class Kit {
  readonly props: Placed[] = [];
  readonly posts: Post[] = [];
  readonly routes: Route[] = [];
  readonly fx: Emitter[] = [];
  private taken: { x: number; z: number; r: number }[] = [];

  constructor(
    readonly ground: Ground,
    readonly z0: number,
    readonly z1: number,
    readonly biome: number,
    readonly r: Rng,
    readonly beats: Beat[],
  ) {}

  /** The beat at z. */
  beat(z: number): Beat | undefined {
    return this.beats.find((b) => z <= b.z0 && z > b.z1);
  }

  /** How far across (x, z) a kind reaches at scale s. */
  reach(kind: string, s: number, variant = 0) {
    const m = metaOf(kind, variant);
    if (!m) return s;
    return Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]) * 0.5 * s;
  }

  /** Is there room for something `rad` across at (x, z)? */
  free(x: number, z: number, rad: number) {
    return this.taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 >= (t.r + rad) ** 2);
  }

  /** Keeps (x, z) for something `rad` across (nothing else goes there). */
  claim(x: number, z: number, rad: number) {
    this.taken.push({ x, z, r: rad });
  }

  /** Puts a kind down at (x, z), if there's room and it fits the ground (null if not). */
  put(kind: string, x: number, z: number, o: Put = {}): Placed | null {
    if (z > this.z0 || z <= this.z1) return null;
    const p = o.rim ? this.onRim(kind, x, z) : this.ground.place(kind, x, z, this.r, this.biome);
    if (!p) return null;
    if (o.variant !== undefined && metaOf(kind, o.variant)?.variant === o.variant) p.variant = o.variant;
    if (o.rot !== undefined) p.rot = o.rot;
    const tall = Math.max(metaHeight(metaOf(kind, p.variant)), 0.3);
    const fit = (FLIGHT_Y - 1.5 - p.y) / tall;
    p.s = o.s === 'fit' ? fit : (o.s ?? 0.9 + this.r() * 0.2);
    // (scenery keeps under the flight line, whatever it was asked to grow to)
    if (!o.rim) p.s = Math.min(p.s, fit);
    if (p.s < 0.35) return null;
    const rad = this.reach(kind, p.s, p.variant) * 0.8;
    if (!o.overlap && !this.free(x, z, rad + (o.pad ?? 0))) return null;
    this.claim(x, z, rad);
    this.props.push(p);
    return p;
  }

  /** Something on a wall's top: drawn with depth like the rock, never in the way. */
  private onRim(kind: string, x: number, z: number): Placed | null {
    const vs = metaOf(kind);
    if (!vs) return null;
    return { kind, variant: 0, x, z, y: this.ground.height(x, z), rot: this.r() * Math.PI * 2, s: 1, obstacle: false, cols: [], biome: this.biome, rim: true };
  }

  /**
   * A group round (x, z): the biggest first, in the middle, then the rest, smaller the further out
   * they land, so it reads as one thing with its details round it (never one size everywhere).
   */
  group(x: number, z: number, g: Group): Placed[] {
    const out: Placed[] = [];
    const r = this.r;
    const c = Math.cos(g.along ?? 0);
    const sn = Math.sin(g.along ?? 0);
    const st = g.stretch ?? 1;
    for (let i = 0, tries = 0; i < g.n && tries < g.n * 6; tries++) {
      // the first in the middle; each of the rest settles against one already down (the details
      // gather round what's there, never strewn), the later ones smaller, all within the spread
      const k = i / Math.max(1, g.n - 1);
      const a = r() * Math.PI * 2;
      const by = out.length ? out[Math.floor(r() * out.length)] : null;
      const d = by ? this.reach(by.kind, by.s, by.variant) * 0.7 + g.spread * 0.2 * (0.5 + r()) : 0;
      const u = Math.cos(a) * d * st;
      const v = Math.sin(a) * d;
      // (stretched along `along`: u runs that way)
      const px = (by?.x ?? x) + u * sn + v * c;
      const pz = (by?.z ?? z) - u * c + v * sn;
      if (Math.hypot(px - x, (pz - z) / st) > g.spread * 1.2) continue;
      if (g.keep && !g.keep(px, pz)) continue;
      const kind = i === 0 && g.kinds.length > 1 ? g.kinds[0][0] : weighted(r, g.kinds);
      const big = g.big === 'fit' ? 'fit' : g.big;
      const s: Size = i === 0 ? big : lerp(typeof big === 'number' ? big : 1.4, g.small, smooth(k)) * (0.85 + r() * 0.3);
      // (the details nestle in against what's there; only the first keeps its room)
      const p = this.put(kind, px, pz, { s, rim: g.rim, pad: i === 0 ? 0.2 : -this.reach(kind, typeof s === 'number' ? s : 1) * 0.45 });
      // (only what's put down counts: a group that lost half its members to crowding reads as strewn)
      if (!p) continue;
      out.push(p);
      i++;
    }
    return out;
  }

  /**
   * A set piece (see world/looks.ts) at (x, z), turned `rot`: a span across (its legs out in the
   * rock), a gate, a giant lying under you.
   */
  set(kind: string, role: SetRole, x: number, z: number, rot: number, variant = Math.floor(this.r() * variants(kind).length)): Placed | null {
    const vs = variants(kind);
    if (!vs.length || z > this.z0 || z <= this.z1) return null;
    variant = Math.min(variant, vs.length - 1);
    const m = vs[variant];
    const cols = turned(m, x, z, rot, 1);
    const p: Placed = { kind, variant, x, z, y: role === 'giant' ? this.ground.height(x, z) - 0.2 : 0, rot, s: 1, obstacle: cols.length > 0, cols, biome: this.biome, role };
    if (role !== 'span') {
      p.foot = Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]) * 0.5;
      this.claim(x, z, p.foot);
    }
    this.props.push(p);
    return p;
  }

  /** Something tall enough to hit, standing at (x, z): its collider columns as built, scaled and turned. */
  solid(kind: string, x: number, z: number, s: number, rot: number): Placed | null {
    const p = this.ground.place(kind, x, z, this.r, this.biome, true);
    const m = p && metaOf(kind, p.variant);
    if (!p || !m) return null;
    p.s = s;
    p.rot = rot;
    p.cols = turned(m, x, z, rot, s);
    this.claim(x, z, this.reach(kind, s, p.variant) * 0.9);
    this.props.push(p);
    return p;
  }

  /** An effect of the place's own (see Emitter). */
  emit(kind: Emitter['kind'], x: number, z: number, len = 0, side: -1 | 1 = 1) {
    if (z > this.z0 || z - len <= this.z1) return;
    this.fx.push({ kind, x, z, len, side });
  }

  /** A post worth guarding. */
  post(x: number, z: number, face: number, guards: string) {
    this.posts.push({ x, z, y: this.ground.height(x, z), face, guards });
  }
}

/** A model's collider columns, placed: (three turns (x, z) by θ about y to (x cos θ + z sin θ, -x sin θ + z cos θ)). */
function turned(m: Meta, x: number, z: number, rot: number, s: number) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  return m.colliders.map((k) => ({ x: x + (k.x * c + k.z * sn) * s, z: z + (-k.x * sn + k.z * c) * s, r: k.r * s }));
}

/**
 * A smooth curve through anchors along z (each held flat for a stretch, eased between), for a
 * gorge's width, say: anchors near to far.
 */
export function eased(anchors: { z: number; v: number }[]) {
  const a = [...anchors].sort((p, q) => q.z - p.z);
  return (z: number) => {
    if (z >= a[0].z) return a[0].v;
    for (let i = 1; i < a.length; i++) {
      if (z >= a[i].z) {
        const t = (a[i - 1].z - z) / Math.max(1e-6, a[i - 1].z - a[i].z);
        return lerp(a[i - 1].v, a[i].v, smooth(t));
      }
    }
    return a[a.length - 1].v;
  };
}

/** x along a route at z (its first or last point's past the ends). */
export function routeX(rt: Route, z: number) {
  const p = rt.pts;
  if (z >= p[0].z) return p[0].x;
  if (z <= p[p.length - 1].z) return p[p.length - 1].x;
  // (the first point at or past z, halving)
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m].z > z) lo = m;
    else hi = m;
  }
  const t = (p[lo].z - z) / Math.max(1e-6, p[lo].z - p[hi].z);
  return lerp(p[lo].x, p[hi].x, t);
}

/** Is x inside the field (with a margin)? */
export const inField = (x: number, m = 0) => Math.abs(x) <= HALF_W - m;
