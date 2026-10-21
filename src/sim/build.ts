/**
 * A ship as built: a frame and the parts bolted into its grid, and what that adds up to. See
 * game/parts.ts for the rules of the grid.
 */

import { CELL, FRAMES, LOAD, PARTS, TAG_BONUS, frameById, partById, type AuxKind, type LoadClass, type DashMod, type FrameDef, type GunSpec, type PartDef, type Tag } from '../game/parts';
import { links } from './links';
import { tagsOf, type Item, type ItemDef } from '../game/loot';
import { BURN, MARK_BIT, SHOCK, tagMarks } from './marks';

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
  homing: number;
  /** Extra shot every few (capacitor). */
  burst: number;
  cool: number;
  /** A drone copy (fires from the drone, not the ship). */
  drone: boolean;
  /** Hair Trigger: seconds of crits after a perfect dash (0: none touching). */
  crit: number;
  /** Throttle Link: extra fire rate at full boost. */
  throttle: number;
  /** Heat Exchanger: shields per overheat. */
  exchange: number;
  /** Storm Lens: an arc every this many shots (0: none). */
  storm: number;
  /** Recoil Battery: on a perfect dash, a free shot this many times as hard (0: none). */
  volley: number;
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
  /** A HEAVY gun's rounds (0: a main gun, on the held trigger). */
  heavy: number;
  /** Where it's bolted on. */
  at: Placement;
}

export interface Stats {
  frame: FrameDef;
  hp: number;
  shield: number;
  mass: number;
  powerOut: number;
  powerDraw: number;
  /** Fire rate multiplier from power (1 when there's enough). */
  brown: number;
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
  magnet: number;
  graze: number;
  tags: Record<Tag, number>;
  /** Tags with their set bonus awake: 1 at three, 2 at five. */
  bonus: Partial<Record<Tag, 1 | 2>>;
  drones: number;
  /** Hit radius (the bit of you bullets can hit: small, like every good shmup; the frame says how small). */
  core: number;
  /** Burn back a second once the boost is let go (the frame's). */
  burnBack: number;
  /** Kestrel: guns hit up to this much harder the faster it flies. */
  swift: number;
  /** The aux verb, and how strong it runs (1 = 100%). */
  aux: AuxKind | null;
  auxStr: number;
  /** What the dash does besides (each summed over the dash mods, at their strength). */
  mod: Required<Omit<DashMod, 'refill' | 'shroud'>> & { refill: boolean; shroud: boolean };
  /** Background effects, summed at strength (see Passive in game/parts.ts). */
  skin: number;
  gamble: number;
  salvage: number;
  echo: number;
  mirror: number;
  /** Seconds of crit a perfect dash gives (the best Hair Trigger). */
  crit: number;
  /** Every mark the ship can leave (its guns, and what else it has that marks: bits). */
  marks: number;
  /** Legendary traits off the guns: THUNDEROUS dashes (strength), a VENGEFUL hull, a RAVENOUS special. */
  thunder: number;
  vengeful: boolean;
  ravenous: boolean;
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

export const socket = (f: FrameDef, c: number, r: number) => r >= 0 && r < f.grid.length && c >= 0 && c < f.grid[0].length && f.grid[r][c] === '#';

/** Ship-local position of a socket's middle. */
export function cellPos(f: FrameDef, c: number, r: number) {
  const cols = f.grid[0].length;
  const rows = f.grid.length;
  return { x: (c - (cols - 1) / 2) * CELL, z: (r - (rows - 1) / 2) * CELL };
}

/** Can this part go here (all on sockets, nothing in the way)? `ignore` is a placement to leave out (the one being moved). */
export function fits(b: Build, p: Placement, ignore?: Placement) {
  const f = frameById(b.frame);
  const taken = new Set<string>();
  for (const q of b.parts) if (q !== ignore) for (const [c, r] of cellsOf(q)) taken.add(`${c},${r}`);
  return cellsOf(p).every(([c, r]) => socket(f, c, r) && !taken.has(`${c},${r}`));
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
  const tags = Object.fromEntries(Object.keys(TAG_BONUS).map((t) => [t, 0])) as Record<Tag, number>;
  const lk = links(b);
  const touching = lk.touch;
  const parts = lk.parts;
  const ALL = Object.keys(tags) as Tag[];
  for (const { p } of parts) for (const t of tagsOf(p, ALL)) tags[t]++;
  const bonus: Stats['bonus'] = {};
  for (const t of Object.keys(tags) as Tag[]) if (tags[t] >= 3) bonus[t] = tags[t] >= 5 ? 2 : 1;

  let hp = f.hp;
  let shield = f.shield ?? 0;
  let mass = f.mass;
  let powerOut = f.power;
  let powerDraw = 0;
  let thrust = f.thrust;
  let grip = f.grip;
  let dash = 0;
  let magnet = 0;
  let graze = 0;
  let special: Stats['special'] = null;
  let chargeRate = 1;
  let dashRecover = 1;
  let aux: AuxKind | null = null;
  let auxStr = 0;
  // (the frame's own perk counts as a dash mod: the Hammerhead's ram, the Wasp's refill)
  const mod = { ram: f.ram ?? 0, blink: 0, mines: 0, ghost: 0, volley: 0, detonate: 0, strike: 0, refill: !!f.refill, shroud: false };
  const pas = { skin: 0, gamble: 0, salvage: 0, echo: 0, mirror: 0, crit: 0 };
  let thunder = 0;
  let vengeful = false;
  let ravenous = false;
  for (const { p, def, str, idle } of parts) {
    if (p.trait === 'thunderous') thunder = Math.max(thunder, Math.max(0.5, Math.min(str, 1.5)));
    if (p.trait === 'vengeful') vengeful = true;
    hp += def.hp ?? 0;
    shield += def.shield ?? 0;
    mass += def.mass;
    // power made runs at the part's strength (a clash halves it); power drawn doesn't
    if (def.power < 0) powerOut -= def.power * Math.max(str, 0.5);
    else powerDraw += def.power;
    // engines on the back row push harder
    const back = cellsOf(p).some(([c, r]) => !socket(f, c, r + 1));
    thrust += (def.thrust ?? 0) * (back ? 1.5 : 1) * Math.min(str, 1);
    grip += def.grip ?? 0;
    dash += def.dash ?? 0;
    magnet += def.magnet ?? 0;
    graze += def.graze ?? 0;
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
      mod.refill ||= !!def.mod.refill;
      mod.shroud ||= !!def.mod.shroud;
      mod.strike = Math.max(mod.strike, (def.mod.strike ?? 0) * str);
      mod.volley = Math.max(mod.volley, (def.mod.volley ?? 0) * Math.min(str, 1));
    }
    const ps = def.passive;
    if (ps && str > 0) {
      pas.skin = Math.max(pas.skin, (ps.skin ?? 0) * str);
      pas.gamble += (ps.gamble ?? 0) * str;
      pas.salvage += (ps.salvage ?? 0) * str;
      pas.echo = Math.max(pas.echo, (ps.echo ?? 0) * Math.min(str, 1));
      pas.mirror += Math.round((ps.mirror ?? 0) * str);
      pas.crit = Math.max(pas.crit, (ps.crit ?? 0) * str);
    }
  }
  // load: what the parts weigh against what the frame and its engines can carry
  let load = 0;
  let carry = f.load;
  for (const { def, str } of parts) {
    load += def.mass;
    carry += ((def.thrust ?? 0) * LOAD.engine + (def.carry ?? 0)) * Math.min(Math.max(str, 0.5), 1);
  }
  const loadClass = loadClassOf(load, carry);
  if (bonus.armor) hp += 2;
  if (bonus.tech) powerOut += 3;
  const brown = powerDraw > powerOut ? powerOut / powerDraw : 1;

  const guns: Gun[] = [];
  let drones = 0;
  const copied = new Map<Placement, number>();
  for (const { p, def, str: gs } of parts) {
    if (!def.gun) continue;
    const pos = centre(f, p);
    const dir = gunDir(f, p);
    const spec = { ...def.gun };
    // a clashing gun loses a quarter of its punch
    spec.damage *= 0.5 + 0.5 * Math.min(gs, 1);
    let homing = 0;
    let burst = 0;
    let cool = 1;
    let crit = 0;
    let throttle = 0;
    let exchange = 0;
    let storm = 0;
    let volley = 0;
    // its own mark, by its tags (a prismatic gun's every-tag is for set bonuses only)
    let marks = tagMarks(def.tags);
    let markStr = marks ? Math.max(0.5, gs) : 0;
    let flaw = false;
    let edgeMul = 2;
    for (const { p: q, def: d, str } of parts) {
      if (!touching(p, q) || str <= 0) continue;
      if (d.boost) {
        spec.damage *= 1 + (d.boost.damage ?? 0) * str;
        spec.rate *= 1 + (d.boost.rate ?? 0) * str;
        cool += (d.boost.cool ?? 0) * str;
        homing += (d.boost.homing ?? 0) * str;
        burst += (d.boost.burst ?? 0) * (str >= 1 ? 1 : 0);
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
      const ps = d.passive;
      if (ps?.crit) crit = Math.max(crit, ps.crit * str);
      if (ps?.throttle) throttle += ps.throttle * str;
      if (ps?.storm) storm = storm ? Math.min(storm, ps.storm) : ps.storm;
      if (d.mod?.volley) volley = Math.max(volley, d.mod.volley * Math.min(str, 1));
      if (ps?.exchange) {
        exchange += ps.exchange;
        spec.heat *= 1.3;
      }
    }
    if (bonus.kinetic && def.tags.includes('kinetic')) spec.rate *= 1.2;
    if (bonus.energy && def.tags.includes('energy')) spec.damage *= 1.25;
    if (bonus.energy === 2 && def.tags.includes('energy')) spec.pierce = (spec.pierce ?? 0) + 1;
    if (bonus.heat) spec.heat *= 0.7;
    spec.rate *= brown;
    const heavy = spec.heavy ?? 0;
    const g: Gun = {
      part: def, spec, x: pos.x, z: pos.z - CELL * 0.5, dir, homing, burst, cool, drone: false, crit, throttle, exchange, storm, volley,
      marks, markStr, flaw, edgeMul, volatile: p.trait === 'volatile', split: p.trait === 'splitting',
      sentinel: p.trait === 'sentinel', boomerang: p.trait === 'boomerang', frenzied: p.trait === 'frenzied', heavy, at: p,
    };
    guns.push(g);
    // twinned: a mirror copy from the other side of the hull (both off the middle, if it's there)
    if (p.trait === 'twin') {
      const off = Math.abs(g.x) < 0.1 ? CELL * 0.45 : 0;
      if (off) g.x = -off;
      guns.push({ ...g, spec: { ...spec }, x: off || -g.x, dir: -g.dir });
    }
    // a drone bay touching this gun flies a copy of it (two guns a bay at most)
    for (const { p: q, def: d, str } of parts)
      if (d.drone && str > 0 && touching(p, q) && (copied.get(q) ?? 0) < 2) {
        copied.set(q, (copied.get(q) ?? 0) + 1);
        drones++;
        guns.push({ ...g, spec: { ...spec, damage: spec.damage * 0.6 }, drone: true, sentinel: false, x: (drones % 2 ? -1 : 1) * 2.4, z: 1.2 });
      }
  }

  // what the ship can mark with: its guns, the lightning a Storm Lens throws, Furnace's fire ring
  let marks = guns.reduce((m, g) => m | g.marks, 0);
  if (guns.some((g) => g.storm) || bonus.arc === 2) marks |= SHOCK;
  if (bonus.heat === 2) marks |= BURN;
  const ratio = thrust / mass;
  return {
    frame: f,
    hp,
    shield,
    mass,
    powerOut,
    powerDraw,
    brown,
    thrust,
    speed: Math.min(28, Math.max(11, 10 + 5 * Math.sqrt(ratio))) * f.speed * (loadClass === 'overloaded' ? 0.88 : 1),
    accel: 140 * grip * (loadClass === 'overloaded' ? 0.8 : 1),
    dashes: Math.max(1, f.dash + Math.floor(dash) + (bonus.drive ? 1 : 0) + (loadClass === 'nimble' ? 1 : loadClass === 'overloaded' ? -1 : 0)),
    dashCooldown: (1.1 / (1 + dash * 0.6)) * dashRecover * (loadClass === 'nimble' ? 0.8 : loadClass === 'overloaded' ? 1.5 : 1),
    slip: loadClass === 'nimble' ? 0.17 : loadClass === 'overloaded' ? 0.09 : 0.12,
    load,
    capacity: carry,
    loadClass,
    guns,
    special,
    specialRate: (bonus.tech === 2 ? 1.4 : 1) * chargeRate,
    magnet: 4 + magnet * 7,
    graze: 1 + graze,
    tags,
    bonus,
    drones,
    core: f.core,
    burnBack: f.burn,
    swift: f.swift ?? 0,
    aux,
    auxStr,
    mod,
    ...pas,
    marks,
    thunder,
    vengeful,
    ravenous,
  };
}

export function loadClassOf(load: number, capacity: number): LoadClass {
  return load <= capacity * LOAD.nimble + 1e-6 ? 'nimble' : load <= capacity + 1e-6 ? 'steady' : 'overloaded';
}

/** Parts that can turn up as loot, by rarity (not the duo parts: see duosOpen). */
export const LOOT = {
  common: PARTS.filter((p) => p.rarity === 'common' && !p.duo),
  rare: PARTS.filter((p) => p.rarity === 'rare' && !p.duo),
  epic: PARTS.filter((p) => p.rarity === 'epic' && !p.duo),
};

/** The duo parts, offered only to a ship that carries two of each of their tags. */
export const DUOS = PARTS.filter((p) => p.duo);

/** The duo parts a player has earned: two parts of each tag, on the ship or in the hold. */
export function duosOpen(build: Build, cargo: Item[] = []) {
  const all = Object.keys(TAG_BONUS) as Tag[];
  const count = (t: Tag) => [...build.parts, ...cargo].filter((it) => tagsOf(it, all).includes(t)).length;
  return DUOS.filter((d) => count(d.duo![0]) >= 2 && count(d.duo![1]) >= 2);
}

export { FRAMES };
