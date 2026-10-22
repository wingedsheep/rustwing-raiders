/**
 * How the parts on a grid get on with each other: what touches what, which links are met, and so
 * how strong each part runs. The hangar draws this; stats() uses it. See game/parts.ts for the
 * rules.
 */

import { STRENGTH, frameById, linkedStr, type FrameDef, type PartDef, type Side, type Want } from '../game/parts';
import { cellsOf, rotOf, socket, type Build, type Placement } from './build';
import { itemDef, type ItemDef } from '../game/loot';

const STEP: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const SIDES: Side[] = ['n', 'e', 's', 'w'];

/** A side of a part's shape, as it sits (turned clockwise with it). */
export function sideOf(p: Placement, side: Side): Side {
  return SIDES[(SIDES.indexOf(side) + rotOf(p)) & 3];
}

export interface PartLinks {
  p: Placement;
  def: PartDef;
  /** How strong it runs: 0 missing what it needs, 1.5 linked. */
  str: number;
  /** Its link, if it has one: met or not, and the cell and side it looks across (null side: anywhere it touches). */
  link: { ok: boolean; c: number; r: number; side: Side | null } | null;
  /** What meets its link. */
  partners: Placement[];
  /** Why it does nothing at all ('ONE AUX PER SHIP'), if it doesn't. */
  idle: string | null;
}

/** A pair that work together or against each other, and where it shows on the grid. */
export interface Edge {
  a: Placement;
  b: Placement;
  kind: 'boost' | 'link';
  /** Shared edges (c, r, c2, r2) between touching cells (none for a WIRELESS part's reach). */
  edges: [number, number, number, number][];
}

export interface Links {
  parts: PartLinks[];
  edges: Edge[];
  of(p: Placement): PartLinks | undefined;
  /** Touching (or one of them WIRELESS). */
  touch(a: Placement, b: Placement): boolean;
}

const key = (c: number, r: number) => `${c},${r}`;

function sharedEdges(a: Placement, b: Placement) {
  const out: [number, number, number, number][] = [];
  const bc = cellsOf(b);
  for (const [c, r] of cellsOf(a)) for (const [c2, r2] of bc) if (Math.abs(c - c2) + Math.abs(r - r2) === 1) out.push([c, r, c2, r2]);
  return out;
}

export function matches(def: PartDef, w: Want) {
  return (
    (!!w.gun && !!def.gun) ||
    (!!w.thrust && (def.thrust ?? 0) > 0) ||
    (!!w.shield && ((def.shield ?? 0) > 0 || def.aux === 'parry' || def.aux === 'siphon')) ||
    (!!w.special && !!def.special) ||
    (!!w.cls && w.cls.includes(def.cls)) ||
    (!!w.ids && w.ids.includes(def.id))
  );
}

export function links(b: Build): Links {
  const f: FrameDef = frameById(b.frame);
  const parts = b.parts;
  const defs = new Map<Placement, PartDef>(parts.map((p) => [p, itemDef(p)]));
  const at = new Map<string, Placement>();
  for (const p of parts) for (const [c, r] of cellsOf(p)) at.set(key(c, r), p);
  const adj = new Map<Placement, Set<Placement>>(parts.map((p) => [p, new Set()]));
  for (const p of parts)
    for (const [c, r] of cellsOf(p))
      for (const s of SIDES) {
        const q = at.get(key(c + STEP[s][0], r + STEP[s][1]));
        if (q && q !== p) adj.get(p)!.add(q);
      }

  // a wireless part touches everything aboard
  const touch = (a: Placement, b: Placement) => a !== b && (a.trait === 'wireless' || b.trait === 'wireless' || adj.get(a)!.has(b));

  const out: PartLinks[] = [];
  const edges: Edge[] = [];
  const edge = (a: Placement, b: Placement, kind: Edge['kind']) => edges.push({ a, b, kind, edges: sharedEdges(a, b) });
  let aux = false;
  let special = false;
  for (const p of parts) {
    const def = defs.get(p)!;
    const pl: PartLinks = { p, def, str: 1, link: null, partners: [], idle: null };
    out.push(pl);
    // one aux, one special: the first on the ship
    if (def.aux) {
      if (aux) pl.idle = 'ONE AUX PER SHIP';
      aux = true;
    }
    if (def.special) {
      if (special) pl.idle = 'ONE SPECIAL PER SHIP';
      special = true;
    }
    // its link
    const l = def.link;
    if (l) {
      const cells = cellsOf(p);
      const [c, r] = cells[l.cell ?? 0];
      if (l.side) {
        const s = sideOf(p, l.side);
        const ac = c + STEP[s][0];
        const ar = r + STEP[s][1];
        const q = at.get(key(ac, ar));
        if (l.want.open) pl.link = { ok: !socket(f, ac, ar), c, r, side: s };
        else {
          if (q && q !== p && matches(defs.get(q)!, l.want)) pl.partners.push(q);
          pl.link = { ok: pl.partners.length > 0, c, r, side: s };
        }
      } else {
        for (const o of parts) if (touch(p, o) && matches(defs.get(o)!, l.want)) pl.partners.push(o);
        pl.link = { ok: pl.partners.length > 0, c, r, side: null };
      }
      // a keystone is linked wherever it sits, and runs as if it were
      if (p.trait === 'keystone') {
        pl.link.ok = true;
        pl.str *= linkedStr(f);
      } else if (pl.link.ok) pl.str *= l.need ? linkedStr(f, true) : linkedStr(f);
      else if (l.need) pl.str = STRENGTH.idle;
    }
    // its rolls: potency, overclocking
    pl.str *= (def as ItemDef).potency ?? 1;
    if (pl.idle) pl.str = 0;
  }
  // what to draw: boosters on the guns they reach, links
  for (const pl of out) {
    const { p, def } = pl;
    if (def.boost) for (const q of parts) if (defs.get(q)!.gun && touch(p, q)) edge(p, q, 'boost');
    for (const q of pl.partners) edge(p, q, 'link');
  }
  return { parts: out, edges, of: (p) => out.find((x) => x.p === p), touch };
}
