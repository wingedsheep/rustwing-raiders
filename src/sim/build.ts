/**
 * A ship as built: a frame and the parts bolted into its grid, and what that adds up to. See
 * game/parts.ts for the rules of the grid.
 */

import { CELL, FRAMES, LOAD, PARTS, frameById, hardpointOf, partById, type AuxKind, type LoadClass, type DashMod, type FrameDef, type GunSpec, type Hardpoint, type PartDef } from '../game/parts';
import { links } from './links';
import { type AffixId, type Item, type ItemDef } from '../game/loot';
import { MARK_BIT, tagMarks } from './marks';

/** An item bolted on somewhere. */
export interface Placement extends Item {
  c: number;
  r: number;
  /** Quarter turns clockwise, 0..3. */
  rot?: number;
  /** Old saves: turned a quarter (rot 1). */
  turned?: boolean;
}

export interface Build {
  frame: string;
  parts: Placement[];
}

export interface Gun {
  part: PartDef;
  spec: GunSpec;
  /** Muzzle, ship-local (x right, z towards the camera). */
  x: number;
  z: number;
  /** Firing direction: 0 straight up the screen, positive to the right. */
  dir: number;
  cool: number;
  /** The marks its hits leave (bits, see sim/marks.ts), and how strong. */
  marks: number;
  markStr: number;
  /** Flaw Finder: crits anything marked. */
  flaw: boolean;
  /** What its edge's crits multiply by: 2, or 3 with an Edge Hone touching. */
  edgeMul: number;
  /** Legendary traits that work in flight: kills pass their marks on; shots split on a hit. */
  volatile: boolean;
  split: boolean;
  /** SENTINEL: a dash leaves a turret copy of it behind. BOOMERANG: its shots come back. FRENZIED: kills speed it up. */
  sentinel: boolean;
  boomerang: boolean;
  frenzied: boolean;
  /** Its own affix (the gun ones: see AFFIXES in game/loot.ts), and a PRIMED part touching it. */
  affix?: AffixId;
  primed: boolean;
  /** A HEAVY gun's rounds (0: a main gun, on the held trigger). */
  heavy: number;
  /** Where it's bolted on. */
  at: Placement;
}

export interface Stats {
  frame: FrameDef;
  hp: number;
  /** Taken off every hit on the hull (never below a third of it). */
  armor: number;
  shield: number;
  mass: number;
  thrust: number;
  speed: number;
  accel: number;
  dashes: number;
  dashCooldown: number;
  /** Seconds a dash's opening slip lasts: fire that would have hit you then makes it a perfect. */
  slip: number;
  /** The parts' mass, what the ship can carry, and so how it flies (see LOAD in game/parts.ts). */
  load: number;
  capacity: number;
  loadClass: LoadClass;
  guns: Gun[];
  special: PartDef['special'] | null;
  specialRate: number;
  /** Hit radius (the bit of you bullets can hit: small, like every good shmup; the frame says how small). */
  core: number;
  /** Burn back a second once the boost is let go (the frame's). */
  burnBack: number;
  /** Kestrel: guns hit up to this much harder the faster it flies. */
  swift: number;
  /** The aux verb, and how strong it runs (1 = 100%). */
  aux: AuxKind | null;
  auxStr: number;
  /** What the dash does besides (each summed over the dash mods, at their strength); `refill`: the Wasp's. */
  mod: Required<DashMod> & { refill: boolean };
  /** Reflector Plates: shots each bullet the shield stops is thrown back as. */
  mirror: number;
  /** Every mark the ship can leave (its guns, and what else it has that marks: bits). */
  marks: number;
  /** Legendary traits off the guns: THUNDEROUS dashes (strength), a VENGEFUL hull, a RAVENOUS special. */
  thunder: number;
  vengeful: boolean;
  ravenous: boolean;
  /** The ship-wide affixes it carries: an engine's DEFLECTING dash, a SECOND WIND hull, a SURGING special. */
  affixes: Partial<Record<AffixId, true>>;
}

export const rotOf = (p: Placement) => (p.rot ?? (p.turned ? 1 : 0)) & 3;

/** The cells a part takes, turned clockwise `rot` times about its corner (the cursor is the top-left of its box). */
export function cellsOf(p: Placement): [number, number][] {
  const def = partById(p.id);
  let cells = def.shape.map(([c, r]) => [c, r] as [number, number]);
  for (let k = 0; k < rotOf(p); k++) cells = cells.map(([c, r]) => [-r, c]);
  const mc = Math.min(...cells.map(([c]) => c));
  const mr = Math.min(...cells.map(([, r]) => r));
  return cells.map(([c, r]) => [p.c + c - mc, p.r + r - mr]);
}

/** What's at a cell of the grid: '#' a fitting's socket, a hardpoint's letter, or '.' (also off the grid). */
export const slotAt = (f: FrameDef, c: number, r: number) => (r >= 0 && r < f.grid.length && c >= 0 && c < f.grid[0].length ? f.grid[r][c] : '.');

export const socket = (f: FrameDef, c: number, r: number) => slotAt(f, c, r) !== '.';

/** Its hardpoint, if the cell is one. */
export const hardpointAt = (f: FrameDef, c: number, r: number): Hardpoint | null => {
  const ch = slotAt(f, c, r);
  return ch === 'T' || ch === 'H' || ch === 'A' || ch === 'S' ? ch : null;
};

/**
 * Whether a part's cells suit the hardpoints under them: a tool has one on its own hardpoint and
 * none on another's; a fitting sits on plain sockets only.
 */
export function suits(f: FrameDef, p: Placement) {
  const want = hardpointOf(partById(p.id));
  const hps = cellsOf(p).map(([c, r]) => hardpointAt(f, c, r));
  if (hps.some((h) => h && h !== want)) return false;
  return !want || hps.includes(want);
}

/** Ship-local position of a socket's middle. */
export function cellPos(f: FrameDef, c: number, r: number) {
  const cols = f.grid[0].length;
  const rows = f.grid.length;
  return { x: (c - (cols - 1) / 2) * CELL, z: (r - (rows - 1) / 2) * CELL };
}

/** Can this part go here (all on sockets that suit it, nothing in the way)? `ignore` is a placement to leave out (the one being moved). */
export function fits(b: Build, p: Placement, ignore?: Placement) {
  const f = frameById(b.frame);
  const taken = new Set<string>();
  for (const q of b.parts) if (q !== ignore) for (const [c, r] of cellsOf(q)) taken.add(`${c},${r}`);
  return cellsOf(p).every(([c, r]) => socket(f, c, r) && !taken.has(`${c},${r}`)) && suits(f, p);
}

export function partAt(b: Build, c: number, r: number): Placement | undefined {
  return b.parts.find((p) => cellsOf(p).some(([pc, pr]) => pc === c && pr === r));
}

/** The middle of all a part's cells, ship-local. */
export function centre(f: FrameDef, p: Placement) {
  const cells = cellsOf(p);
  const mc = cells.reduce((s, [c]) => s + c, 0) / cells.length;
  const mr = cells.reduce((s, [, r]) => s + r, 0) / cells.length;
  return cellPos(f, mc, mr);
}

/**
 * Which way a gun fires, from where it sits: the back row backwards, the outer columns out at an
 * angle, everywhere else forwards (0 is up the screen, positive to the right). Mines drop behind.
 */
export function gunDir(f: FrameDef, p: Placement) {
  const cols = f.grid[0].length;
  const rows = f.grid.length;
  const cells = cellsOf(p);
  const mc = cells.reduce((s, [c]) => s + c, 0) / cells.length;
  const backRow = cells.every(([c, r]) => !socket(f, c, r + 1)) && Math.max(...cells.map(([, r]) => r)) === rows - 1 && rows > 2;
  const front = cells.some(([c, r]) => !socket(f, c, r - 1));
  const outer = cols >= 3 && (mc <= 0.01 || mc >= cols - 1.01);
  if (p.id === 'mine') return Math.PI;
  if (backRow && !front) return Math.PI;
  if (outer) return (mc < cols / 2 ? -1 : 1) * 0.22;
  return 0;
}

export function startBuild(frame: string): Build {
  const f = frameById(frame);
  return { frame, parts: f.start.map(([id, c, r]) => ({ id, c, r })) };
}

export function stats(b: Build): Stats {
  const f = frameById(b.frame);
  const lk = links(b);
  const touching = lk.touch;
  const parts = lk.parts;

  let hp = f.hp;
  let hullPct = 0;
  let armor = 0;
  let shield = f.shield ?? 0;
  let mass = f.mass;
  let thrust = f.thrust;
  let grip = f.grip;
  let dash = 0;
  let special: Stats['special'] = null;
  let chargeRate = 1;
  let dashRecover = 1;
  let aux: AuxKind | null = null;
  let auxStr = 0;
  // (the frame's own perk counts as a dash mod: the Hammerhead's ram, the Wasp's refill)
  const mod = { ram: f.ram ?? 0, blink: 0, mines: 0, ghost: 0, detonate: 0, strike: 0, refill: !!f.refill };
  let mirror = 0;
  let thunder = 0;
  let vengeful = false;
  let ravenous = false;
  const affixes: Stats['affixes'] = {};
  for (const { p, def, str, idle } of parts) {
    // a special's affix works only on the special that runs (the gun ones ride on the gun)
    if (p.affix && str > 0 && !def.gun && !(def.special && (idle || special))) affixes[p.affix] = true;
    if (p.trait === 'thunderous') thunder = Math.max(thunder, Math.max(0.5, Math.min(str, 1.5)));
    if (p.trait === 'vengeful') vengeful = true;
    hp += def.hp ?? 0;
    hullPct += def.hullPct ?? 0;
    armor += def.armor ?? 0;
    shield += def.shield ?? 0;
    mass += def.mass;
    // engines on the back row push harder
    const back = cellsOf(p).some(([c, r]) => !socket(f, c, r + 1));
    thrust += (def.thrust ?? 0) * (back ? 1.5 : 1) * Math.min(str, 1);
    grip += def.grip ?? 0;
    dash += def.dash ?? 0;
    if (def.special && !special && !idle) {
      special = def.special;
      chargeRate = (def as ItemDef).chargeRate ?? 1;
      ravenous = p.trait === 'ravenous';
    }
    dashRecover *= (def as ItemDef).dashRecover ?? 1;
    if (def.aux && !aux && !idle) {
      aux = def.aux;
      auxStr = str;
    }
    if (def.mod && str > 0) {
      mod.ram += (def.mod.ram ?? 0) * str;
      mod.blink = Math.max(mod.blink, (def.mod.blink ?? 0) * str);
      mod.mines += Math.round((def.mod.mines ?? 0) * str);
      mod.ghost += (def.mod.ghost ?? 0) * str;
      mod.detonate = Math.max(mod.detonate, (def.mod.detonate ?? 0) * str);
      mod.strike = Math.max(mod.strike, (def.mod.strike ?? 0) * str);
    }
    if (def.passive?.mirror && str > 0) mirror += Math.round(def.passive.mirror * str);
  }
  // load: what the parts weigh against what the frame and its engines can carry
  let load = 0;
  let carry = f.load;
  for (const { def, str } of parts) {
    load += def.mass;
    carry += ((def.thrust ?? 0) * LOAD.engine + (def.carry ?? 0)) * Math.min(Math.max(str, 0.5), 1);
  }
  const loadClass = loadClassOf(load, carry);

  const guns: Gun[] = [];
  for (const { p, def, str: gs } of parts) {
    if (!def.gun) continue;
    const pos = centre(f, p);
    const dir = gunDir(f, p);
    const spec = { ...def.gun };
    let cool = 1;
    // its own mark, by its tags
    let marks = tagMarks(def.tags);
    let markStr = marks ? Math.max(0.5, gs) : 0;
    let flaw = false;
    let edgeMul = 2;
    let primed = false;
    for (const { p: q, def: d, str } of parts) {
      if (!touching(p, q) || str <= 0) continue;
      if (q.affix === 'hotwired') spec.pierce = (spec.pierce ?? 0) + 1;
      primed ||= q.affix === 'primed';
      if (d.boost) {
        spec.damage *= 1 + (d.boost.damage ?? 0) * str;
        spec.rate *= 1 + (d.boost.rate ?? 0) * str;
        cool += (d.boost.cool ?? 0) * str;
        if (d.boost.mark) {
          marks |= MARK_BIT[d.boost.mark];
          markStr = Math.max(markStr, str);
        }
        flaw ||= !!d.boost.flaw;
        if (d.boost.hone) edgeMul = Math.max(edgeMul, 2 + str);
        // Autoloader: only heavies have rounds to feed (its rate is their reload)
        if (d.boost.rounds && spec.heavy) spec.heavy += Math.round(d.boost.rounds * Math.max(str, 1));
        else if (d.boost.rounds) spec.rate /= 1 + (d.boost.rate ?? 0) * str;
      }
    }
    const heavy = spec.heavy ?? 0;
    const g: Gun = {
      part: def, spec, x: pos.x, z: pos.z - CELL * 0.5, dir, cool,
      marks, markStr, flaw, edgeMul, volatile: p.trait === 'volatile', split: p.trait === 'splitting',
      sentinel: p.trait === 'sentinel', boomerang: p.trait === 'boomerang', frenzied: p.trait === 'frenzied', affix: p.affix, primed, heavy, at: p,
    };
    guns.push(g);
    // twinned: a mirror copy from the other side of the hull (both off the middle, if it's there)
    if (p.trait === 'twin') {
      const off = Math.abs(g.x) < 0.1 ? CELL * 0.45 : 0;
      if (off) g.x = -off;
      guns.push({ ...g, spec: { ...spec }, x: off || -g.x, dir: -g.dir });
    }
  }

  // what the ship can mark with
  const marks = guns.reduce((m, g) => m | g.marks, 0);
  const ratio = thrust / mass;
  return {
    frame: f,
    hp: Math.round(hp * (1 + hullPct)),
    armor,
    shield,
    mass,
    thrust,
    speed: Math.min(28, Math.max(11, 10 + 5 * Math.sqrt(ratio))) * f.speed * (loadClass === 'overloaded' ? 0.88 : 1),
    accel: 140 * grip * (loadClass === 'overloaded' ? 0.8 : 1),
    dashes: Math.max(1, f.dash + Math.floor(dash) + (loadClass === 'nimble' ? 1 : loadClass === 'overloaded' ? -1 : 0)),
    dashCooldown: (1.1 / (1 + dash * 0.6)) * dashRecover * (loadClass === 'nimble' ? 0.8 : loadClass === 'overloaded' ? 1.5 : 1),
    slip: loadClass === 'nimble' ? 0.17 : loadClass === 'overloaded' ? 0.09 : 0.12,
    load,
    capacity: carry,
    loadClass,
    guns,
    special,
    specialRate: chargeRate,
    core: f.core,
    burnBack: f.burn,
    swift: f.swift ?? 0,
    aux,
    auxStr,
    mod,
    mirror,
    marks,
    thunder,
    vengeful,
    ravenous,
    affixes,
  };
}

export function loadClassOf(load: number, capacity: number): LoadClass {
  return load <= capacity * LOAD.nimble + 1e-6 ? 'nimble' : load <= capacity + 1e-6 ? 'steady' : 'overloaded';
}

/** Parts that can turn up as loot, by rarity. */
export const LOOT = {
  common: PARTS.filter((p) => p.rarity === 'common'),
  rare: PARTS.filter((p) => p.rarity === 'rare'),
  epic: PARTS.filter((p) => p.rarity === 'epic'),
};

export { FRAMES };
