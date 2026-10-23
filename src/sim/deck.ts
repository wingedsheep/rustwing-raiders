/**
 * The inside of a freighter, for a boarding: a grid of one-unit cells (x along the ship, stern to
 * bow; z across it), every cell space, wall or deck. A corridor runs down the middle from the aft
 * lock (where you cut in) to the bridge at the bow; rooms hang off it on both sides. What a room
 * is depends on how deep it is: the drive and the bunks near the stern, the mess and the holds
 * amidships, the core vault and the bridge at the far end. The deeper, the richer.
 *
 * Also what the crew needs to find its way: which cells block a body or a round, sight lines, and
 * a distance field to a point (every crewman walks down it).
 *
 * Plain data and rules, no three.js. Laid out from a seed, so the same freighter is the same ship.
 */

import { irange, pick, rng, shuffle, type Rng } from '../util';

export const enum Cell {
  Space = 0,
  Wall = 1,
  Floor = 2,
}

export type RoomKind = 'lock' | 'corridor' | 'engine' | 'bunks' | 'mess' | 'hold' | 'vault' | 'bridge';

export interface Room {
  id: number;
  kind: RoomKind;
  /** Cells inside its walls: x0..x1, z0..z1 inclusive. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** 0 at the lock, 1 at the bridge. */
  depth: number;
  /** Which side of the corridor: -1 up (low z), 1 down, 0 neither. */
  side: number;
}

/** A sliding bulkhead door in a wall: two cells wide, across `axis` ('x': the wall runs along x). */
export interface Door {
  id: number;
  /** Its middle (on a cell edge between the two cells). */
  x: number;
  z: number;
  axis: 'x' | 'z';
  /** The two cells it fills. */
  cells: [number, number][];
  /** 0 shut .. 1 open. */
  open: number;
}

/** What stands in a room: the game places a model for each, and some of them block. */
export type PropKind =
  | 'crate' | 'strongbox' | 'core' | 'console' | 'alarm' | 'locker' | 'bunk' | 'table' | 'canister' | 'barrel'
  | 'cargo' | 'engine' | 'pipes' | 'medkit' | 'turret' | 'sconce' | 'cage' | 'rupture' | 'spore';

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  z: number;
  /** Facing: the way its front looks, radians (0 = +z, down the screen). */
  rot: number;
  room: number;
  variant: number;
  /** Half its footprint (before turning), for blocking. */
  hw: number;
  hd: number;
  /** Blocks bodies; and rounds too (cover). */
  solid: boolean;
  cover: boolean;
}

/**
 * Whose ship it is decides who crews her, in the family's own attack language (the same tells as
 * in the air): scrap flares and commits, lattice draws the whole blow out in light first, bloom
 * swells before it bursts. Every crew has the same three jobs: one who closes in, one who shoots,
 * one who holds the line.
 */
export type Family = 'scrap' | 'lattice' | 'bloom';
export type CrewKind = 'deckhand' | 'gunner' | 'bruiser' | 'torcher' | 'clerk' | 'auditor' | 'warden' | 'notary' | 'thrall' | 'puffer' | 'nurse' | 'rooter' | 'skulk';
/** Each crew's hands: who rushes you, who shoots, who holds the line, and the odd one with its own trick. */
export const CREW: Record<Family, { melee: CrewKind; gun: CrewKind; heavy: CrewKind; odd: CrewKind }> = {
  scrap: { melee: 'deckhand', gun: 'gunner', heavy: 'bruiser', odd: 'torcher' },
  lattice: { melee: 'clerk', gun: 'auditor', heavy: 'warden', odd: 'notary' },
  bloom: { melee: 'thrall', gun: 'puffer', heavy: 'nurse', odd: 'rooter' },
};

/** How big she is: a skiff, a freighter, a hauler, now and then a bulker (from the site's danger, and luck). */
export type ShipSize = 0 | 1 | 2 | 3;
export const SIZE_NAME = ['SKIFF', 'FREIGHTER', 'HAULER', 'BULKER'] as const;
/** Crates aboard, by size (three are the cards at the results; past that they pay scrap). */
export const CRATES = [2, 3, 4, 5];

/**
 * Now and then she's in a state: DARK (her power's out: no alarms, no gates, half her crew asleep,
 * the rest by torchlight), CAGES (a poacher's hold: beasts in cages that'll go for whoever's
 * nearest once they're loose), BREACH (her hull's torn: the hole breathes out, and anything
 * loose near it goes with the air).
 */
export type Condition = 'none' | 'dark' | 'cages' | 'breach';

/** Who's aboard at the start, and where. */
export interface Post {
  kind: CrewKind;
  x: number;
  z: number;
  rot: number;
  room: number;
  /** Asleep in a bunk. */
  asleep: boolean;
  /** Runs for the alarm when it sees you. */
  runner: boolean;
  /** A beast in a cage (the cage's prop). */
  cage?: Prop;
}

/** A laser gate across a doorway (lattice ships): the door it fills. */
export interface Gate {
  door: Door;
  /** Where in its cycle it starts (s). */
  phase: number;
}

/** How big a freighter, and how many aboard, from the site's danger. */
export interface DeckSpec {
  seed: number;
  /** 0..2-ish: how hard (the run's difficulty plus the site's danger). */
  hard: number;
  family?: Family;
  size?: ShipSize;
  condition?: Condition;
  /** How many go aboard: more crew for more of you. */
  heroes?: number;
}

const HALF_CORRIDOR = 1;

export class Deck {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;
  /** Blocks a body (walls, shut doors, solid props) / a round (walls, shut doors, cover). */
  readonly solid: Uint8Array;
  readonly cover: Uint8Array;
  /** Which room each floor cell is in (-1 none). */
  readonly roomOf: Int16Array;
  readonly rooms: Room[] = [];
  readonly doors: Door[] = [];
  readonly props: Prop[] = [];
  readonly posts: Post[] = [];
  /** Where you cut in (the breach), and the lock's zone you leave from. */
  readonly breach: { x: number; z: number };
  /** The corridor's middle row. */
  readonly mid: number;
  readonly family: Family;
  readonly size: ShipSize;
  readonly condition: Condition;
  readonly gates: Gate[] = [];
  /** The tear in her hull (a BREACH), against an outer wall. */
  rupture: Prop | null = null;
  /** Door cells: which door is in each (-1 none). */
  private doorAt: Int16Array;
  private r: Rng;

  constructor(readonly spec: DeckSpec) {
    const r = (this.r = rng(spec.seed));
    const hard = spec.hard;
    this.family = spec.family ?? 'scrap';
    this.size = spec.size ?? 1;
    this.condition = spec.condition ?? 'none';
    // the bigger she is the longer, and the harder the longer still: more rooms, deeper holds
    this.w = [36, 48, 64, 82][this.size] + Math.round(Math.min(2, hard) * 3) + irange(r, 0, 4);
    this.h = [21, 25, 25, 29][this.size];
    const W = this.w;
    const H = this.h;
    this.cells = new Uint8Array(W * H);
    this.solid = new Uint8Array(W * H);
    this.cover = new Uint8Array(W * H);
    this.roomOf = new Int16Array(W * H).fill(-1);
    this.doorAt = new Int16Array(W * H).fill(-1);
    this.mid = Math.floor(H / 2);
    this.layout();
    this.breach = { x: 3, z: this.mid + 0.5 };
    this.furnish();
    this.crew(hard, Math.max(1, spec.heroes ?? 1));
    this.refresh();
  }

  idx(x: number, z: number) {
    return z * this.w + x;
  }

  inside(x: number, z: number) {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }

  cell(x: number, z: number): Cell {
    return this.inside(x, z) ? (this.cells[this.idx(x, z)] as Cell) : Cell.Space;
  }

  /** Does a body stop here (a whole cell's worth)? */
  blocked(x: number, z: number) {
    return !this.inside(x, z) || this.solid[this.idx(x, z)] === 1;
  }

  /** Does a round stop here? */
  stops(x: number, z: number) {
    return !this.inside(x, z) || this.cover[this.idx(x, z)] === 1;
  }

  /** The room a point is in (-1 for none: a doorway, a wall). */
  roomAt(x: number, z: number) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    return this.inside(cx, cz) ? this.roomOf[this.idx(cx, cz)] : -1;
  }

  doorIn(cx: number, cz: number): Door | null {
    if (!this.inside(cx, cz)) return null;
    const d = this.doorAt[this.idx(cx, cz)];
    return d < 0 ? null : this.doors[d];
  }

  // --- the plan ------------------------------------------------------------------------------

  private carve(room: Room) {
    for (let z = room.z0; z <= room.z1; z++)
      for (let x = room.x0; x <= room.x1; x++) {
        this.cells[this.idx(x, z)] = Cell.Floor;
        this.roomOf[this.idx(x, z)] = room.id;
      }
  }

  private addRoom(kind: RoomKind, x0: number, z0: number, x1: number, z1: number, side: number) {
    const room: Room = { id: this.rooms.length, kind, x0, z0, x1, z1, depth: 0, side };
    this.rooms.push(room);
    this.carve(room);
    return room;
  }

  /** A door two cells wide in the wall at (x, z), the wall running along `axis`. */
  private addDoor(x: number, z: number, axis: 'x' | 'z') {
    const cells: [number, number][] = axis === 'x' ? [[x, z], [x + 1, z]] : [[x, z], [x, z + 1]];
    const d: Door = { id: this.doors.length, x: axis === 'x' ? x + 1 : x + 0.5, z: axis === 'x' ? z + 0.5 : z + 1, axis, cells, open: 0 };
    this.doors.push(d);
    for (const [cx, cz] of cells) {
      this.cells[this.idx(cx, cz)] = Cell.Floor;
      this.doorAt[this.idx(cx, cz)] = d.id;
    }
    return d;
  }

  private layout() {
    const r = this.r;
    const W = this.w;
    const H = this.h;
    const m = this.mid;
    // everything inside the hull is wall until carved
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) this.cells[this.idx(x, z)] = Cell.Wall;
    // the bridge across the bow, the corridor from the lock to it
    const bridgeW = 9 + irange(r, 0, 2);
    const bx0 = W - 1 - bridgeW;
    const lock = this.addRoom('lock', 1, m - HALF_CORRIDOR - 1, 6, m + HALF_CORRIDOR + 1, 0);
    const corridor = this.addRoom('corridor', 8, m - HALF_CORRIDOR, bx0 - 2, m + HALF_CORRIDOR, 0);
    // the lock opens straight on to the corridor
    this.addDoor(7, m - 1, 'z');
    const bridge = this.addRoom('bridge', bx0, 3, W - 2, H - 4, 0);
    this.addDoor(bx0 - 1, m - 1, 'z');
    // the corridor's last cell joins the bridge door
    this.cells[this.idx(bx0 - 1, m + 1)] = Cell.Wall;
    void lock;
    void bridge;
    // rooms either side of the corridor, cut into widths of 8..13
    const bands: [number, number, number][] = [
      [1, m - HALF_CORRIDOR - 2, -1],
      [m + HALF_CORRIDOR + 2, H - 2, 1],
    ];
    for (const [z0, z1, side] of bands) {
      let x = 8;
      const end = bx0 - 2;
      const made: Room[] = [];
      while (end - x >= 7) {
        let w = irange(r, 8, 12);
        if (end - (x + w + 1) < 7) w = end - x;
        // a room a little shallower now and then, so the walls aren't one straight line
        const shallow = r() < 0.35 ? irange(r, 1, 2) : 0;
        const room = side < 0 ? this.addRoom('hold', x, z0 + shallow, x + w - 1, z1, side) : this.addRoom('hold', x, z0, x + w - 1, z1 - shallow, side);
        made.push(room);
        // its door onto the corridor
        const dx = irange(r, room.x0 + 1, room.x1 - 2);
        this.addDoor(dx, side < 0 ? z1 + 1 : z0 - 1, 'x');
        x += w + 1;
      }
      // now and then a door between neighbours, so there's a way round
      for (let i = 0; i + 1 < made.length; i++) {
        if (r() < 0.55) {
          const a = made[i];
          const b = made[i + 1];
          const lo = Math.max(a.z0, b.z0);
          const hi = Math.min(a.z1, b.z1);
          if (hi - lo >= 3) this.addDoor(a.x1 + 1, irange(r, lo + 1, hi - 2), 'z');
        }
      }
    }
    // how deep each room is: by its middle along the ship
    for (const room of this.rooms) room.depth = Math.min(1, Math.max(0, ((room.x0 + room.x1) / 2 - 4) / (W - 8)));
    corridor.depth = 0.5;
    // what each side room is, by depth: the drive and bunks aft, holds amidships, the vault forward
    const side = this.rooms.filter((q) => q.side !== 0).sort((a, b) => a.depth - b.depth);
    const n = side.length;
    const kinds: RoomKind[] = new Array(n).fill('hold');
    // the aftmost two: the drive on one side, the bunks on the other
    const aft = side.slice(0, 2);
    if (aft.length === 2) {
      const e = r() < 0.5 ? 0 : 1;
      kinds[e] = 'engine';
      kinds[1 - e] = 'bunks';
    }
    // the core vault: one of the two foremost
    kinds[n - 1 - (r() < 0.5 ? 0 : 1)] = 'vault';
    // a mess somewhere amidships
    const midIdx = side.map((_, i) => i).filter((i) => kinds[i] === 'hold' && i >= 2 && i < n - 2);
    if (midIdx.length > 2) kinds[pick(r, midIdx)] = 'mess';
    side.forEach((q, i) => (q.kind = kinds[i]));
  }

  // --- what's in it ---------------------------------------------------------------------------

  private occupied = new Set<number>();

  private free(x0: number, z0: number, x1: number, z1: number) {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (this.cell(x, z) !== Cell.Floor || this.occupied.has(this.idx(x, z)) || this.doorIn(x, z)) return false;
        // keep doorways clear: nothing right in front of one
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.doorIn(x + dx, z + dz)) return false;
      }
    return true;
  }

  /** Puts a prop down if there's room (cells it covers, rounded out). */
  private place(kind: PropKind, room: Room, x: number, z: number, rot: number, hw: number, hd: number, opts: { solid?: boolean; cover?: boolean; variant?: number; force?: boolean } = {}): Prop | null {
    const turned = Math.abs(Math.sin(rot)) > 0.5;
    const ex = turned ? hd : hw;
    const ez = turned ? hw : hd;
    const x0 = Math.floor(x - ex + 0.01);
    const x1 = Math.ceil(x + ex - 0.01) - 1;
    const z0 = Math.floor(z - ez + 0.01);
    const z1 = Math.ceil(z + ez - 0.01) - 1;
    if (!opts.force && !this.free(x0, z0, x1, z1)) return null;
    const solid = opts.solid ?? true;
    if (solid) for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) this.occupied.add(this.idx(cx, cz));
    const p: Prop = { id: this.props.length, kind, x, z, rot, room: room.id, variant: opts.variant ?? 0, hw, hd, solid, cover: opts.cover ?? false };
    this.props.push(p);
    return p;
  }

  /** Tries a few random spots in a room. */
  private scatter(kind: PropKind, room: Room, hw: number, hd: number, tries = 30, opts: Parameters<Deck['place']>[7] = {}) {
    const r = this.r;
    for (let i = 0; i < tries; i++) {
      const rot = pick(r, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      const turned = Math.abs(Math.sin(rot)) > 0.5;
      const ex = turned ? hd : hw;
      const ez = turned ? hw : hd;
      // whole-cell aligned (a footprint of odd width centres on a cell)
      const cx = room.x0 + ex + Math.floor(r() * Math.max(1, room.x1 - room.x0 + 2 - ex * 2));
      const cz = room.z0 + ez + Math.floor(r() * Math.max(1, room.z1 - room.z0 + 2 - ez * 2));
      const p = this.place(kind, room, Math.round(cx * 2) / 2, Math.round(cz * 2) / 2, rot, hw, hd, opts);
      if (p) return p;
    }
    return null;
  }

  /** Against a wall of the room (the side away from the corridor first), facing in. */
  private againstWall(kind: PropKind, room: Room, hw: number, hd: number, opts: Parameters<Deck['place']>[7] = {}, tries = 24) {
    const r = this.r;
    for (let i = 0; i < tries; i++) {
      // which wall: 0 the far one (from the corridor), 1/2 the ends, 3 the corridor side
      const wall = i < tries / 2 ? 0 : irange(r, 0, 3);
      let x: number;
      let z: number;
      let rot: number;
      const farZ = room.side < 0 ? room.z0 : room.z1;
      const nearZ = room.side < 0 ? room.z1 : room.z0;
      const span = (a: number, b: number, half: number) => a + half + Math.floor(r() * Math.max(1, b - a + 2 - half * 2));
      if (wall === 0 || wall === 3) {
        const zz = wall === 0 ? farZ : nearZ;
        const up = zz === room.z0;
        x = span(room.x0, room.x1, hw);
        z = up ? room.z0 + hd : room.z1 + 1 - hd;
        rot = up ? 0 : Math.PI;
      } else {
        const left = wall === 1;
        z = span(room.z0, room.z1, hw);
        x = left ? room.x0 + hd : room.x1 + 1 - hd;
        rot = left ? Math.PI / 2 : -Math.PI / 2;
      }
      const p = this.place(kind, room, Math.round(x * 2) / 2, Math.round(z * 2) / 2, rot, hw, hd, opts);
      if (p) return p;
    }
    return null;
  }

  private furnish() {
    const r = this.r;
    const rooms = this.rooms;
    // the crates of cargo worth taking: one per card at the results, in the holds first
    const holds = shuffle(r, rooms.filter((q) => q.kind === 'hold'));
    const others = shuffle(r, rooms.filter((q) => q.kind === 'engine' || q.kind === 'mess' || q.kind === 'bunks'));
    const crateRooms = [...holds, ...others, ...holds, ...others].slice(0, CRATES[this.size]);
    // a poacher's hold: beasts in cages, in the holds amidships and forward (not the crates' rooms if it can help it)
    if (this.condition === 'cages') {
      const pens = [...rooms.filter((q) => q.kind === 'hold' && q.depth > 0.2 && !crateRooms.includes(q)), ...holds].slice(0, this.size === 0 ? 1 : 2);
      for (const room of pens) {
        for (let i = 0; i < (this.size >= 2 ? 2 : 1); i++) this.againstWall('cage', room, 1, 1, { cover: true });
      }
    }
    // a tear in her hull: in a room amidships, on the outer wall
    if (this.condition === 'breach') {
      const mids = shuffle(r, rooms.filter((q) => q.side !== 0 && q.depth > 0.3 && q.depth < 0.8 && q.kind !== 'vault'));
      for (const room of mids) {
        const z = room.side < 0 ? room.z0 + 0.5 : room.z1 + 0.5;
        const x = Math.round((room.x0 + room.x1 + 1) / 2);
        const p = this.place('rupture', room, x, z, room.side < 0 ? 0 : Math.PI, 1, 0.5, { cover: true, force: true });
        if (p) {
          this.rupture = p;
          break;
        }
      }
    }
    for (const room of rooms) {
      const cx = (room.x0 + room.x1 + 1) / 2;
      const cz = (room.z0 + room.z1 + 1) / 2;
      switch (room.kind) {
        case 'engine':
          this.place('engine', room, Math.round(cx), Math.round(cz), 0, 2.5, 1.5, { cover: true, force: true });
          for (let i = 0; i < 2; i++) this.againstWall('pipes', room, 1, 0.5, { cover: true, variant: i % 2 });
          for (let i = 0; i < 2; i++) this.scatter('canister', room, 0.5, 0.5, 30, { cover: true });
          this.againstWall('console', room, 0.75, 0.5, { cover: true });
          break;
        case 'bunks':
          for (let i = 0; i < 3; i++) this.againstWall('bunk', room, 1, 0.5, { cover: true });
          for (let i = 0; i < 2; i++) this.againstWall('locker', room, 1, 0.5, { cover: true });
          this.againstWall('medkit', room, 0.5, 0.5, { solid: false });
          break;
        case 'mess':
          this.scatter('table', room, 1, 1, 40, { cover: false });
          if (r() < 0.6) this.scatter('table', room, 1, 1, 40, { cover: false });
          this.againstWall('console', room, 0.75, 0.5, { cover: true, variant: 1 });
          this.againstWall('locker', room, 1, 0.5, { cover: true });
          break;
        case 'hold':
          for (let i = 0; i < 3 + irange(r, 0, 2); i++) this.scatter('cargo', room, 1, 1, 30, { cover: true, variant: i % 2 });
          for (let i = 0; i < irange(r, 1, 2); i++) this.scatter('barrel', room, 0.5, 0.5, 30, { cover: true, variant: i % 2 });
          if (r() < 0.8) this.scatter('canister', room, 0.5, 0.5, 30, { cover: true });
          break;
        case 'vault':
          this.place('core', room, Math.round(cx), Math.round(cz), room.side < 0 ? Math.PI : 0, 1, 1, { cover: true, force: true });
          for (let i = 0; i < 2; i++) this.againstWall('pipes', room, 1, 0.5, { cover: true, variant: i % 2 });
          // the lockdown's guns, folded away in the floor until the core comes out
          this.place('turret', room, room.x0 + 1.5, room.side < 0 ? room.z0 + 1.5 : room.z1 - 0.5, 0, 0.5, 0.5, { solid: false, force: true });
          this.place('turret', room, room.x1 - 0.5, room.side < 0 ? room.z0 + 1.5 : room.z1 - 0.5, 0, 0.5, 0.5, { solid: false, force: true });
          break;
        case 'bridge': {
          // consoles along the bow, the strongbox behind them
          const fx = room.x1 + 1;
          for (let k = -1; k <= 1; k++) this.place('console', room, fx - 1.5, cz + k * 3, -Math.PI / 2, 0.75, 0.5, { cover: true, variant: k & 1 });
          this.place('strongbox', room, fx - 3.5, Math.round(cz), -Math.PI / 2, 0.5, 0.5, { cover: true, force: true });
          if (this.condition !== 'dark') this.againstWall('alarm', room, 0.5, 0.5, { solid: false });
          for (let i = 0; i < 2; i++) this.scatter('cargo', room, 1, 1, 30, { cover: true, variant: i % 2 });
          break;
        }
        default:
          break;
      }
    }
    for (const room of crateRooms) this.scatter('crate', room, 1, 0.5, 60, { cover: true, variant: irange(r, 0, 1) }) ?? this.scatter('crate', rooms.find((q) => q.kind === 'hold') ?? room, 1, 0.5, 60, { cover: true });
    // alarm panels along the corridor, one each side
    const corr = rooms.find((q) => q.kind === 'corridor')!;
    for (const side of this.condition === 'dark' ? [] : [-1, 1]) {
      for (let i = 0; i < 20; i++) {
        const x = irange(r, corr.x0 + 4, corr.x1 - 3);
        const z = side < 0 ? corr.z0 : corr.z1;
        const wallZ = z + side;
        if (this.cell(x, wallZ) !== Cell.Wall || this.cell(x + 1, wallZ) !== Cell.Wall) continue;
        if (this.props.some((p) => p.kind === 'alarm' && Math.abs(p.x - x) < 6)) continue;
        this.place('alarm', corr, x + 0.5, side < 0 ? corr.z0 + 0.5 : corr.z1 + 0.5, side < 0 ? 0 : Math.PI, 0.5, 0.5, { solid: false, force: true });
        break;
      }
    }
    // the Hive's ships grow: rot in the corners
    if (this.family === 'bloom') {
      for (const room of rooms) {
        if (room.kind === 'lock') continue;
        for (let i = 0; i < (room.kind === 'corridor' ? 4 : irange(r, 1, 2)); i++) this.scatter('spore', room, 0.5, 0.5, 20, { solid: false, variant: irange(r, 0, 1) });
      }
    }
    // a lattice ship's doorways are gated in light (unless her power's out)
    if (this.family === 'lattice' && this.condition !== 'dark') {
      const doors = shuffle(r, this.doors.filter((d) => d.id !== 0));
      for (const door of doors.slice(0, [2, 4, 6, 8][this.size])) this.gates.push({ door, phase: r() * 4 });
    }
    // lights on the walls, so every room has its own pool of light
    for (const room of rooms) {
      if (room.kind === 'corridor') {
        for (let x = room.x0 + 3; x < room.x1; x += 7) this.place('sconce', room, x + 0.5, room.z0 + 0.5, 0, 0.5, 0.5, { solid: false, force: true });
        continue;
      }
      const n = room.kind === 'bridge' ? 2 : 1;
      for (let i = 0; i < n; i++) this.againstWall('sconce', room, 0.5, 0.5, { solid: false }) ?? null;
    }
  }

  private crew(hard: number, heroes: number) {
    const r = this.r;
    const { melee, gun, heavy, odd } = CREW[this.family];
    const dark = this.condition === 'dark';
    const take = (room: Room, kind: CrewKind, asleep = false) => {
      for (let i = 0; i < 40; i++) {
        const x = room.x0 + 0.5 + r() * (room.x1 - room.x0);
        const z = room.z0 + 0.5 + r() * (room.z1 - room.z0);
        const cx = Math.floor(x);
        const cz = Math.floor(z);
        if (this.occupied.has(this.idx(cx, cz)) || this.cell(cx, cz) !== Cell.Floor) continue;
        if (this.posts.some((p) => Math.hypot(p.x - x, p.z - z) < 1.5)) continue;
        // her power's out: half of them have turned in where they stood
        this.posts.push({ kind, x, z, rot: r() * Math.PI * 2, room: room.id, asleep: asleep || (dark && room.kind !== 'bridge' && r() < 0.5), runner: false });
        return;
      }
    };
    const k = Math.min(2.2, Math.max(0, hard));
    for (const room of this.rooms) {
      const rk = room.kind;
      if (rk === 'lock') continue;
      // the deeper the room, the more it's guarded
      const deep = room.depth;
      if (rk === 'corridor') {
        take(room, melee);
        if (k > 0.5 || this.family === 'lattice') take(room, gun);
        if (this.size >= 2) take(room, melee);
      } else if (rk === 'bunks') {
        take(room, melee, true);
        take(room, melee, r() < 0.5);
        if (k > 0.8) take(room, melee);
      } else if (rk === 'mess') {
        take(room, melee);
        take(room, melee);
        take(room, r() < 0.4 + k * 0.2 ? gun : melee);
      } else if (rk === 'engine') {
        take(room, melee);
        take(room, this.size > 0 && r() < 0.5 + k * 0.2 ? odd : gun);
      } else if (rk === 'hold') {
        take(room, deep > 0.5 ? gun : melee);
        if (r() < 0.5 + k * 0.25) take(room, melee);
        if (k > 0.35 && r() < 0.35 + k * 0.2) take(room, heavy);
        else if (r() < 0.2 + k * 0.15 + this.size * 0.08) take(room, odd);
      } else if (rk === 'vault') {
        take(room, gun);
        if (k > 0.3) take(room, gun);
        if (k > 1 || this.size >= 2) take(room, heavy);
      } else if (rk === 'bridge') {
        take(room, gun);
        take(room, this.size === 0 ? melee : gun);
        take(room, melee);
        if (k > 0.6) take(room, heavy);
        if (k > 1.4) take(room, gun);
        if (this.size >= 2) take(room, odd);
      }
      // more of you, more of them: a hand more in most rooms for each partner
      for (let n = 1; n < heroes; n++) if (r() < 0.85) take(room, deep > 0.55 && r() < 0.6 ? gun : r() < 0.15 + k * 0.1 ? heavy : melee);
    }
    // the beasts, one to a cage
    for (const p of this.props) {
      if (p.kind !== 'cage') continue;
      this.posts.push({ kind: 'skulk', x: p.x, z: p.z, rot: p.rot, room: p.room, asleep: false, runner: false, cage: p });
    }
    // a few of the hands run for the alarm when they see you (nobody does with the power out)
    if (!dark) {
      const hands = shuffle(r, this.posts.filter((p) => p.kind === melee && !p.asleep));
      hands.slice(0, 2 + Math.round(k)).forEach((p) => (p.runner = true));
    }
  }

  /** Works out what blocks what, from the walls, the props and how open the doors are. */
  refresh() {
    const W = this.w;
    for (let i = 0; i < this.cells.length; i++) {
      const wall = this.cells[i] !== Cell.Floor;
      this.solid[i] = wall ? 1 : 0;
      this.cover[i] = wall ? 1 : 0;
    }
    for (const p of this.props) {
      if (!p.solid && !p.cover) continue;
      const turned = Math.abs(Math.sin(p.rot)) > 0.5;
      const ex = turned ? p.hd : p.hw;
      const ez = turned ? p.hw : p.hd;
      for (let z = Math.floor(p.z - ez + 0.01); z <= Math.ceil(p.z + ez - 0.01) - 1; z++)
        for (let x = Math.floor(p.x - ex + 0.01); x <= Math.ceil(p.x + ex - 0.01) - 1; x++) {
          if (!this.inside(x, z)) continue;
          const i = z * W + x;
          if (p.solid) this.solid[i] = 1;
          if (p.cover) this.cover[i] = 1;
        }
    }
    this.doorsChanged();
  }

  /** Doors open and shut: only their cells change. */
  doorsChanged() {
    for (const d of this.doors) {
      const shut = d.open < 0.65 ? 1 : 0;
      for (const [x, z] of d.cells) {
        const i = this.idx(x, z);
        this.solid[i] = shut;
        this.cover[i] = shut;
      }
    }
  }

  /** Takes a prop out of the blocking (it's been blown up). */
  remove(p: Prop) {
    p.solid = false;
    p.cover = false;
    this.refresh();
  }

  // --- sight and paths -------------------------------------------------------------------------

  /** Can a round (or an eye) get from a to b? Walks the cells the line crosses. */
  clear(ax: number, az: number, bx: number, bz: number) {
    let cx = Math.floor(ax);
    let cz = Math.floor(az);
    const ex = Math.floor(bx);
    const ez = Math.floor(bz);
    const dx = bx - ax;
    const dz = bz - az;
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tx = dx !== 0 ? (dx > 0 ? cx + 1 - ax : ax - cx) * tdx : Infinity;
    let tz = dz !== 0 ? (dz > 0 ? cz + 1 - az : az - cz) * tdz : Infinity;
    for (let n = 0; n < 200; n++) {
      if (cx === ex && cz === ez) return true;
      if (tx < tz) {
        cx += sx;
        tx += tdx;
      } else {
        cz += sz;
        tz += tdz;
      }
      if (cx === ex && cz === ez) return true;
      if (this.stops(cx, cz)) return false;
    }
    return true;
  }

  /**
   * Steps from every open cell to (x, z), as far as `max` steps (a breadth-first flood, eight
   * ways, never cutting a corner). Returns the field: -1 where it can't reach.
   */
  field(x: number, z: number, out: Int16Array, max = 400) {
    out.fill(-1);
    const W = this.w;
    const sx = Math.floor(x);
    const sz = Math.floor(z);
    if (!this.inside(sx, sz)) return out;
    const queue = this.queue;
    let head = 0;
    let tail = 0;
    const start = sz * W + sx;
    out[start] = 0;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++];
      const d = out[i];
      if (d >= max) continue;
      const cx = i % W;
      const cz = (i - cx) / W;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.h) continue;
        const j = nz * W + nx;
        if (out[j] >= 0 || this.solid[j]) continue;
        // diagonals only where both sides are open (no cutting corners)
        if (k >= 4 && (this.solid[cz * W + nx] || this.solid[nz * W + cx])) continue;
        // shut doors count as open for the path (a body opens them on the way)
        out[j] = d + 1;
        queue[tail++] = j;
      }
      // doors: cross them even while shut
      for (let k = 0; k < 4; k++) {
        const nx = cx + DX[k];
        const nz = cz + DZ[k];
        if (!this.inside(nx, nz)) continue;
        const j = nz * W + nx;
        if (out[j] >= 0 || this.doorAt[j] < 0) continue;
        out[j] = d + 1;
        queue[tail++] = j;
      }
    }
    return out;
  }
  private queue = new Int32Array(64 * 64);

  /** The way to go from (x, z) down a field: a unit step towards the lowest neighbour, or null. */
  downhill(f: Int16Array, x: number, z: number): { x: number; z: number } | null {
    const W = this.w;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    if (!this.inside(cx, cz)) return null;
    let best = f[cz * W + cx];
    if (best < 0) best = 9999;
    let bx = -1;
    let bz = -1;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k];
      const nz = cz + DZ[k];
      if (!this.inside(nx, nz)) continue;
      const v = f[nz * W + nx];
      if (v < 0) continue;
      if (k >= 4 && (this.solid[cz * W + nx] || this.solid[nz * W + cx])) continue;
      if (v < best) {
        best = v;
        bx = nx;
        bz = nz;
      }
    }
    if (bx < 0) return null;
    const tx = bx + 0.5 - x;
    const tz = bz + 0.5 - z;
    const l = Math.hypot(tx, tz) || 1;
    return { x: tx / l, z: tz / l };
  }

  /** A random open spot in a room, away from a point. */
  spot(room: Room, r: Rng, awayX = -99, awayZ = -99, min = 0) {
    for (let i = 0; i < 60; i++) {
      const x = room.x0 + 0.5 + Math.floor(r() * (room.x1 - room.x0 + 1));
      const z = room.z0 + 0.5 + Math.floor(r() * (room.z1 - room.z0 + 1));
      if (this.blocked(Math.floor(x), Math.floor(z))) continue;
      if (Math.hypot(x - awayX, z - awayZ) < min) continue;
      return { x, z };
    }
    return { x: (room.x0 + room.x1 + 1) / 2, z: (room.z0 + room.z1 + 1) / 2 };
  }
}

const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DZ = [0, 0, 1, -1, 1, -1, 1, -1];
