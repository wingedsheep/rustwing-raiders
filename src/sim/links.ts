/**
 * How the parts on a grid get on with each other: what touches what (directly, or through a run
 * of conduit), which links are met, which parts clash, and so how strong each part runs. The
 * hangar draws this; stats() uses it. See game/parts.ts for the rules.
 */

import { CLASHES, STRENGTH, frameById, linkedStr, type FrameDef, type PartDef, type Side, type Want } from '../game/parts';
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
  /** How strong it runs: 0 missing what it needs, 0.5 clashing, 1.5 linked (they multiply). */
  str: number;
  /** Its link, if it has one: met or not, and the cell and side it looks across (null side: anywhere it touches). */
  link: { ok: boolean; c: number; r: number; side: Side | null } | null;
  /** What meets its link. */
  partners: Placement[];
  /** Tag clashes with what it touches; `fused`: turned round by a Slag Furnace (125%, not 50%). */
  clashes: { q: Placement; name: string; fused: boolean }[];
  /** Why it does nothing at all ('ONE AUX PER SHIP'), if it doesn't. */
  idle: string | null;
}

/** A pair that work together or against each other, and where it shows on the grid. */
export interface Edge {
  a: Placement;
  b: Placement;
  kind: 'boost' | 'drone' | 'link' | 'clash' | 'fuse';
  /** Shared edges (c, r, c2, r2) between touching cells, or the conduit cells it runs through. */
  edges: [number, number, number, number][];
  via: Placement[];
}

export interface Links {
  parts: PartLinks[];
  edges: Edge[];
  /** Each run of conduit. */
  nets: Placement[][];
  of(p: Placement): PartLinks | undefined;
  /** Touching, directly or through the same run of conduit. */
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
    (!!w.cls && w.cls.includes(def.cls) && !def.conduit) ||
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

  // runs of conduit, and what each touches
  const netOf = new Map<Placement, number>();
  const nets: Placement[][] = [];
  for (const p of parts) {
    if (!defs.get(p)!.conduit || netOf.has(p)) continue;
    const net: Placement[] = [];
    const todo = [p];
    netOf.set(p, nets.length);
    while (todo.length) {
      const q = todo.pop()!;
      net.push(q);
      for (const n of adj.get(q)!)
        if (defs.get(n)!.conduit && !netOf.has(n)) {
          netOf.set(n, nets.length);
          todo.push(n);
        }
    }
    nets.push(net);
  }
  /** The runs of conduit a part touches. */
  const netsBy = new Map<Placement, Set<number>>(parts.map((p) => [p, new Set([...adj.get(p)!].filter((q) => netOf.has(q)).map((q) => netOf.get(q)!))]));
  const via = (a: Placement, b: Placement): Placement[] | null => {
    if (adj.get(a)!.has(b)) return [];
    for (const n of netsBy.get(a)!) if (netsBy.get(b)!.has(n)) return nets[n];
    return null;
  };
  // a wireless part touches everything aboard
  const touch = (a: Placement, b: Placement) =>
    a !== b && !defs.get(a)!.conduit && !defs.get(b)!.conduit && (a.trait === 'wireless' || b.trait === 'wireless' || via(a, b) !== null);

  const out: PartLinks[] = [];
  const edges: Edge[] = [];
  const edge = (a: Placement, b: Placement, kind: Edge['kind']) => {
    const v = via(a, b) ?? [];
    edges.push({ a, b, kind, via: v, edges: v.length ? [] : sharedEdges(a, b) });
  };
  let aux = false;
  let special = false;
  for (const p of parts) {
    const def = defs.get(p)!;
    const pl: PartLinks = { p, def, str: 1, link: null, partners: [], clashes: [], idle: null };
    out.push(pl);
    if (def.conduit) continue;
    // one aux, one special: the first on the ship
    if (def.aux) {
      if (aux) pl.idle = 'ONE AUX PER SHIP';
      aux = true;
    }
    if (def.special) {
      if (special) pl.idle = 'ONE SPECIAL PER SHIP';
      special = true;
    }
    // clashes: only parts that really touch (conduit doesn't pass them on); a furnace touching
    // either of them turns the clash round
    const fuser = (x: Placement) => defs.get(x)!.passive?.fuse ?? 0;
    for (const q of adj.get(p)!) {
      const d = defs.get(q)!;
      for (const k of CLASHES) {
        const hit = (def.tags.includes(k.a) && d.tags.includes(k.b)) || (def.tags.includes(k.b) && d.tags.includes(k.a));
        if (!hit || pl.clashes.some((x) => x.q === q)) continue;
        const fused = [p, q, ...adj.get(p)!, ...adj.get(q)!].some((x) => fuser(x) > 0);
        pl.clashes.push({ q, name: fused ? 'FUSED' : k.name, fused });
      }
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
          if (q && q !== p) {
            if (matches(defs.get(q)!, l.want)) pl.partners.push(q);
            else if (defs.get(q)!.conduit) for (const o of parts) if (o !== p && touch(p, o) && netsBy.get(o)!.has(netOf.get(q)!) && matches(defs.get(o)!, l.want)) pl.partners.push(o);
          }
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
    if (pl.clashes.some((c) => !c.fused)) pl.str *= STRENGTH.clash;
    else if (pl.clashes.length) pl.str *= STRENGTH.fused;
    // its rolls: potency, overclocking
    pl.str *= (def as ItemDef).potency ?? 1;
    if (pl.idle) pl.str = 0;
  }
  // what to draw: boosters and drone bays on the guns they reach, links, clashes
  for (const pl of out) {
    const { p, def } = pl;
    if (def.boost || def.drone)
      for (const q of parts) if (defs.get(q)!.gun && touch(p, q)) edge(p, q, def.drone ? 'drone' : 'boost');
    for (const q of pl.partners) edge(p, q, 'link');
    for (const { q, fused } of pl.clashes) if (parts.indexOf(q) > parts.indexOf(p)) edge(p, q, fused ? 'fuse' : 'clash');
  }
  return { parts: out, edges, nets, of: (p) => out.find((x) => x.p === p), touch };
}
