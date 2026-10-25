/**
 * THREAD IT's field: the rock walls, the mines and how they're strung, the salvage, and the cache
 * at the heart, laid out from a seed and a level. The game (thread.ts) flies it.
 *
 * The field is three stretches along x. The way in: set pieces one after another (a scatter, a
 * curtain with a gap, a column on chains, strings of mines hung from the walls, tripwires right
 * across, magnets, fuse mines, spinning rings, sweeping girders, the last finder's wreck), the walls
 * closing in to a throat before the heart. The heart: a chamber with the cache in it, behind
 * rings of mines turning opposite ways. The way out: the same set pieces, thicker, with hunter mines
 * sleeping in the walls, to the buoys at the far end.
 */

import { clamp, fbm, rng, TAU, type Rng } from '../../util';
import { byLevel, hardness } from './common';

/** Plain, bobbing on a chain, pulled towards you, on a fuse, or a hunter that comes for you. */
export type Kind = 'mine' | 'bob' | 'magnet' | 'fuse' | 'seeker';

export interface Mine {
  kind: Kind;
  /** Where it hangs. */
  x: number;
  y: number;
  /** Where it is this frame. */
  cx: number;
  cy: number;
  /** Bobbing: how far, how fast, and where in the swing it starts. */
  amp: number;
  rate: number;
  phase: number;
  /** Pulled off its spot (magnets), or flying free (hunters). */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  /** Seconds to the bang once something set it off (-1: not yet). */
  fuse: number;
  /** A hunter's seconds since it came loose (-1: asleep in the wall). */
  hunt: number;
  /** The closest it's come to the hull, while it's near (for skims). */
  near: number;
  skimmed: boolean;
  dead: boolean;
  /** On a string: which, and where along it (0..1). */
  strand?: Strand;
  at?: number;
  /** On a ring: which, and its angle on it. */
  ring?: Ring;
  slot?: number;
  /** Set off by a hunter you led into it (for the LURED! bonus). */
  lured?: boolean;
  /** Set off by the fire coming on behind you. */
  front?: boolean;
}

/** A string of mines on a cable, from wall to wall (a tripwire) or from a wall into the lane. */
export interface Strand {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** How far the middle sags, and its sway. */
  sag: number;
  sway: number;
  rate: number;
  phase: number;
  mines: Mine[];
  /** Right across the lane: the only way past is to trip it. */
  full: boolean;
  /** Seconds since it was tripped (-1: not), and where along it. */
  tripped: number;
  from: number;
}

/** Mines on a ring, turning round a hub. */
export interface Ring {
  x: number;
  y: number;
  r: number;
  rate: number;
  /** The ring at the heart speeds up when the field wakes. */
  heart: boolean;
}

/** A broken girder turning on a pivot, filling a column. */
export interface Sweeper {
  x: number;
  y: number;
  len: number;
  rate: number;
  a0: number;
  near: number;
  touched: boolean;
  skimmed: boolean;
  side: number;
  dead: boolean;
}

/** Salvage adrift: bits of the last one who tried. */
export interface Bit {
  x: number;
  y: number;
  name: string;
  phase: number;
  got: boolean;
}

/** The last finder's wreck, for the scenery. */
export interface Wreck {
  x: number;
  y: number;
}

export type Piece = 'scatter' | 'curtain' | 'bobs' | 'garland' | 'tripwire' | 'magnets' | 'fuses' | 'spinner' | 'girder' | 'wreck';

/** Wall thickness is sampled every STEP pixels. */
const STEP = 4;
const ROW = 20;

export class Field {
  readonly fieldH: number;
  readonly d: number;
  readonly level: number;
  mines: Mine[] = [];
  strands: Strand[] = [];
  rings: Ring[] = [];
  sweepers: Sweeper[] = [];
  bits: Bit[] = [];
  wrecks: Wreck[] = [];
  /** Where each set piece starts, and what it is (the game teaches each the first time). */
  pieces: { x: number; kind: Piece }[] = [];
  /** The throat, the heart's middle, the end of the heart chamber, and the way out. */
  readonly throatX: number;
  readonly heartX: number;
  readonly heartY: number;
  readonly outX: number;
  readonly exitX: number;
  /** Rocks heaped along the walls, for their look: which side, how deep into the wall. */
  rubble: { x: number; side: 0 | 1; name: string; frame: number; inset: number }[] = [];
  private top: number[] = [];
  private bot: number[] = [];

  constructor(level: number, seed: number, fieldH: number, view: number) {
    const r = rng(seed);
    const d = hardness(level);
    this.d = d;
    this.level = level;
    this.fieldH = fieldH;
    const inLen = byLevel(d, 1650, 2050);
    this.throatX = inLen;
    this.heartX = inLen + 360;
    this.heartY = fieldH / 2;
    this.outX = this.heartX + view / 2;
    this.exitX = this.outX + byLevel(d, 1500, 1850);
    this.walls(seed % 997);

    // the way in
    const pool: [Piece, number][] = [
      ['scatter', 16],
      ['curtain', byLevel(d, 16, 10)],
      ['bobs', 12],
      ['garland', 14],
      ['spinner', 9],
      ['tripwire', level >= 2 ? 10 : 0],
      ['magnets', level >= 2 ? 12 : 0],
      ['fuses', level >= 3 ? 13 : 0],
      ['girder', level >= 4 ? 9 : 0],
    ];
    const first: Piece[] = level >= 3 ? ['scatter', 'garland'] : ['scatter', 'curtain'];
    this.lay(r, 380, inLen - 120, pool, first, true, false);
    // the throat: the walls close in, a few on chains
    this.bobs(r, inLen + 30, true);
    // the heart
    this.heart(r);
    // the way out: thicker, and the hunters sleep in the walls
    const out: [Piece, number][] = [
      ['scatter', 14],
      ['curtain', 10],
      ['bobs', 8],
      ['garland', 14],
      ['spinner', 8],
      ['tripwire', level >= 2 ? 10 : 0],
      ['magnets', level >= 2 ? 10 : 0],
      ['fuses', level >= 2 ? 14 : 0],
      ['girder', level >= 4 ? 8 : 0],
    ];
    this.lay(r, this.outX + 140, this.exitX - 160, out, [], false, true);
    this.hunters(r);
  }

  // ----------------------------------------------------------------------------------------------
  // The walls
  // ----------------------------------------------------------------------------------------------

  /**
   * Rock above and below: rough, never closer than the lane needs, closing to a throat before the
   * heart and opening into a round chamber round it. Rubble (rock sprites) along both edges.
   */
  private walls(s: number) {
    const n = Math.ceil((this.exitX + 800) / STEP);
    const throatGap = byLevel(this.d, 116, 90);
    const minLane = byLevel(this.d, 120, 96);
    const r = rng(s ^ 0x3a11);
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      let a = 12 + fbm(x * 0.005, 1.3, s) * 64 + fbm(x * 0.03, 7.1, s) * 12;
      let b = 12 + fbm(x * 0.005, 9.7, s) * 64 + fbm(x * 0.03, 3.3, s) * 12;
      // never pinched shut
      const room = this.fieldH - minLane;
      if (a + b > room) {
        const k = room / (a + b);
        a *= k;
        b *= k;
      }
      // into the field from open space, and out again at the end
      const edge = clamp(x / 260, 0.15, 1) * clamp((this.exitX + 140 - x) / 260, 0.15, 1);
      a *= edge;
      b *= edge;
      // the throat: the walls close in until the lane is throatGap tall, off centre
      const th = clamp((x - (this.throatX - 280)) / 240, 0, 1) * clamp((this.heartX - 150 - x) / 50, 0, 1);
      if (th > 0) {
        const lean = (fbm(x * 0.01, 5.5, s) - 0.5) * 50;
        const want = (this.fieldH - throatGap) / 2;
        a += (want + lean - a) * th;
        b += (want - lean - b) * th;
      }
      // the heart: a round chamber, walls pulled right back
      const hx = Math.abs(x - this.heartX);
      if (hx < 230) {
        const k = Math.sqrt(Math.max(0, 1 - (hx / 230) ** 2));
        a = a * (1 - k) + 4 * k;
        b = b * (1 - k) + 4 * k;
      }
      this.top.push(Math.max(4, a));
      this.bot.push(Math.max(4, b));
    }
    // rubble along both edges: big and small rocks, poking only a little past the line you hit
    for (const side of [0, 1] as const)
      for (let x = -20; x < this.exitX + 700; x += 9 + r() * 12) {
        const big = r() < 0.32;
        const name = big ? (r() < 0.5 ? 'rock_fg' : 'rock_fg_1') : `rock_${Math.floor(r() * 3)}`;
        const half = big ? 16 : 6;
        this.rubble.push({ x, side, name, frame: Math.floor(r() * 12), inset: half - 2 - r() * 2 + (big ? r() * 8 : 0) });
      }
  }

  /** How far down the ceiling comes at x. */
  ceil(x: number) {
    return this.sample(this.top, x);
  }

  /** How far up the floor comes (from the bottom edge) at x. */
  floor(x: number) {
    return this.sample(this.bot, x);
  }

  private sample(a: number[], x: number) {
    const f = clamp(x / STEP, 0, a.length - 1.001);
    const i = Math.floor(f);
    return a[i] + (a[i + 1] - a[i]) * (f - i);
  }

  /** The open lane at x, between the walls (with a margin). */
  lane(x: number, m = 10): [number, number] {
    return [this.ceil(x) + m, this.fieldH - this.floor(x) - m];
  }

  // ----------------------------------------------------------------------------------------------
  // Laying set pieces
  // ----------------------------------------------------------------------------------------------

  private lay(r: Rng, x0: number, x1: number, pool: [Piece, number][], first: Piece[], salvage: boolean, out: boolean) {
    let x = x0;
    let last: Piece | '' = '';
    let k = 0;
    let wreck = false;
    while (x < x1 - 100) {
      let kind: Piece = first[k] ?? this.roll(r, pool, last);
      // the last finder's wreck, once, halfway in
      if (salvage && !wreck && x > (x0 + x1) / 2) {
        kind = 'wreck';
        wreck = true;
      }
      k++;
      last = kind;
      this.pieces.push({ x, kind });
      const w = this.piece(r, kind, x, Math.min(x1, x + 400), out);
      x += w + byLevel(this.d, 85, 50) * (0.8 + r() * 0.5) * (out ? 0.7 : 1);
    }
  }

  private roll(r: Rng, pool: [Piece, number][], last: Piece | ''): Piece {
    const ws = pool.filter(([p, w]) => w > 0 && p !== last);
    let k = r() * ws.reduce((s, [, w]) => s + w, 0);
    for (const [p, w] of ws) if ((k -= w) < 0) return p;
    return ws[0][0];
  }

  /** Lays one set piece from x; returns how wide it came out. */
  private piece(r: Rng, kind: Piece, x: number, max: number, out: boolean): number {
    switch (kind) {
      case 'scatter':
        return this.scatter(r, x, Math.min(max - x, out ? 260 : 220), out);
      case 'curtain':
        return this.curtain(r, x, out);
      case 'bobs':
        return this.bobs(r, x, false);
      case 'garland':
        return this.garland(r, x);
      case 'tripwire':
        return this.tripwire(r, x);
      case 'magnets':
        return this.magnets(r, x);
      case 'fuses':
        return this.fuses(r, x, out);
      case 'spinner':
        return this.spinner(r, x);
      case 'girder':
        return this.girder(r, x);
      case 'wreck':
        return this.wreck(r, x);
    }
  }

  private mine(kind: Kind, x: number, y: number, r: Rng): Mine {
    const m: Mine = { kind, x, y, cx: x, cy: y, amp: 0, rate: 0, phase: r() * 6, ox: 0, oy: 0, vx: 0, vy: 0, fuse: -1, hunt: -1, near: 99, skimmed: false, dead: false };
    this.mines.push(m);
    return m;
  }

  private bit(x: number, y: number, r: Rng) {
    this.bits.push({ x, y, name: `scrap_${Math.floor(r() * 3)}`, phase: r() * 6, got: false });
  }

  /** Loose mines with room between every two, a few bits of salvage among them. */
  private scatter(r: Rng, x: number, w: number, out: boolean) {
    const gap = byLevel(this.d, 46, 34) * (out ? 0.94 : 1);
    const pts: [number, number][] = [];
    // thicker the deeper in you get
    const deep = out ? 1.15 : 0.7 + 0.45 * clamp(x / this.throatX, 0, 1);
    const want = Math.round((w / 100) * byLevel(this.d, 3.4, 6) * deep);
    for (let tries = 0; tries < want * 20 && pts.length < want; tries++) {
      const px = x + r() * w;
      const [lo, hi] = this.lane(px, 8);
      const py = lo + r() * (hi - lo);
      if (pts.every(([qx, qy]) => Math.hypot(qx - px, qy - py) > gap)) pts.push([px, py]);
    }
    for (const [px, py] of pts) {
      const bob = this.level >= 2 && r() < 0.2 + this.d * 0.2;
      const m = this.mine(bob ? 'bob' : 'mine', px, py, r);
      if (bob) {
        m.amp = 6 + r() * 6;
        m.rate = 1.5 + r();
      }
    }
    // salvage tucked between two of them
    for (let k = 0; k < 2 && pts.length > 2; k++) {
      const [a, b] = [pts[Math.floor(r() * pts.length)], pts[Math.floor(r() * pts.length)]];
      if (a !== b && Math.hypot(a[0] - b[0], a[1] - b[1]) < gap * 1.8) this.bit((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r);
    }
    return w;
  }

  /** A wall of mines with a gap in it (two, staggered, from HARD up). */
  private curtain(r: Rng, x: number, out: boolean) {
    const cols = this.level >= 3 || out ? 2 : 1;
    const gw = byLevel(this.d, 60, 38);
    let gy = 0;
    for (let c = 0; c < cols; c++) {
      const cx = x + c * byLevel(this.d, 90, 70);
      const [lo, hi] = this.lane(cx, 4);
      const ny = clamp(c === 0 ? lo + gw / 2 + r() * (hi - lo - gw) : gy + (r() < 0.5 ? -1 : 1) * (50 + r() * 40), lo + gw / 2, hi - gw / 2);
      gy = ny;
      for (let y = lo; y < hi + 1; y += ROW) if (Math.abs(y - gy) > gw / 2) this.mine('mine', cx + (r() - 0.5) * 6, y, r);
      // a prize in the gap, for the bold line through it
      if (r() < 0.5) this.bit(cx, gy, r);
    }
    return (cols - 1) * byLevel(this.d, 90, 70) + 20;
  }

  /** A column on chains, all swinging together: the gap moves. */
  private bobs(r: Rng, x: number, throat: boolean) {
    const [lo, hi] = this.lane(x, 2);
    const gw = byLevel(this.d, 58, 40) + (throat ? 6 : 0);
    const amp = Math.min(byLevel(this.d, 18, 30), (hi - lo - gw) / 2 - 4);
    const gy = (lo + hi) / 2 + (r() - 0.5) * Math.max(0, hi - lo - gw - amp * 2);
    const rate = byLevel(this.d, 1.4, 2.1) * (0.85 + r() * 0.3);
    const phase = r() * 6;
    for (let y = lo - amp; y < hi + amp; y += ROW) {
      if (Math.abs(y - gy) < gw / 2) continue;
      const m = this.mine('bob', x, y, r);
      m.amp = amp;
      m.rate = rate;
      m.phase = phase;
    }
    return 20;
  }

  /** A string of mines hung from a wall out into the lane, swaying: go round its free end. */
  private garland(r: Rng, x: number) {
    const fromTop = r() < 0.5;
    const [lo, hi] = this.lane(x, 0);
    // the free end leaves a gap the ship fits through, sway and all
    const gap = byLevel(this.d, 62, 46);
    const len = hi - lo - gap;
    const ay = fromTop ? lo - 10 : hi + 10;
    const by = fromTop ? lo + len : hi - len;
    const bx = x + (r() - 0.5) * 50;
    const sway = byLevel(this.d, 5, 11);
    this.strand(r, x, ay, bx, by, false, sway);
    // a second, from the other wall and further on, from TRICKY up: a slalom
    if (this.level >= 2 && r() < 0.6) {
      const x2 = x + byLevel(this.d, 160, 120) + r() * 30;
      const [lo2, hi2] = this.lane(x2, 0);
      const len2 = hi2 - lo2 - gap;
      this.strand(r, x2, fromTop ? hi2 + 10 : lo2 - 10, x2 + (r() - 0.5) * 50, fromTop ? hi2 - len2 : lo2 + len2, false, sway);
      return x2 - x + 30;
    }
    return 40;
  }

  /** A string right across, wall to wall: trip it (touch the line) and get clear while it goes. */
  private tripwire(r: Rng, x: number) {
    const [lo, hi] = this.lane(x, 0);
    this.strand(r, x - 10 + r() * 20, lo - 12, x + (r() - 0.5) * 50, hi + 12, true, 3);
    if (r() < 0.6) this.bit(x + 40, lo + 20 + r() * (hi - lo - 40), r);
    return 50;
  }

  private strand(r: Rng, ax: number, ay: number, bx: number, by: number, full: boolean, sway: number) {
    const s: Strand = { ax, ay, bx, by, sag: full ? 4 + r() * 6 : 6 + r() * 8, sway, rate: 0.8 + r() * 0.6, phase: r() * 6, mines: [], full, tripped: -1, from: 0 };
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / 17));
    for (let k = 1; k <= n; k++) {
      const m = this.mine('mine', ax, ay, r);
      m.strand = s;
      // a garland's mines run from the wall to its free end; a tripwire's stop short of the walls
      m.at = full ? (k - 0.5) / n : k / n;
      s.mines.push(m);
    }
    this.strands.push(s);
  }

  /** Magnets round a gap: they drift in as you come. */
  private magnets(r: Rng, x: number) {
    const [lo, hi] = this.lane(x, 6);
    const gy = lo + 30 + r() * Math.max(0, hi - lo - 60);
    const gw = byLevel(this.d, 84, 64);
    for (let k = 0; k < 2; k++) {
      const cx = x + k * 50;
      for (let y = lo; y <= hi; y += 26) if (Math.abs(y - gy) > gw / 2) this.mine('magnet', cx + (r() - 0.5) * 10, y, r);
    }
    this.bit(x + 25, gy, r);
    return 60;
  }

  /** Fuse mines: they arm when you come near and blow a moment later, setting each other off. */
  private fuses(r: Rng, x: number, out: boolean) {
    const n = Math.round(byLevel(this.d, 4, 7) * (out ? 1.2 : 1));
    const pts: [number, number][] = [];
    for (let t = 0; t < n * 20 && pts.length < n; t++) {
      const px = x + r() * 160;
      const [lo, hi] = this.lane(px, 10);
      const py = lo + r() * (hi - lo);
      if (pts.every(([qx, qy]) => Math.hypot(qx - px, qy - py) > 42)) pts.push([px, py]);
    }
    for (const [px, py] of pts) this.mine('fuse', px, py, r);
    if (pts.length > 2) this.bit(pts[1][0], pts[1][1] + 18, r);
    return 160;
  }

  /** A ring of mines turning round a hub, with a gap or two; salvage at the hub. */
  private spinner(r: Rng, x: number) {
    const [lo, hi] = this.lane(x + 50, 0);
    const rad = Math.min(byLevel(this.d, 40, 52), (hi - lo) / 2 - 22);
    if (rad < 26) return this.scatter(r, x, 120, false);
    const cy = lo + rad + 18 + r() * Math.max(0, hi - lo - rad * 2 - 36);
    this.ringOf(r, x + rad, cy, rad, (r() < 0.5 ? -1 : 1) * byLevel(this.d, 0.8, 1.4), this.level >= 4 ? 1 : 2, false);
    this.bit(x + rad, cy, r);
    return rad * 2;
  }

  private ringOf(r: Rng, x: number, y: number, rad: number, rate: number, gaps: number, heart: boolean) {
    const ring: Ring = { x, y, r: rad, rate, heart };
    this.rings.push(ring);
    const n = Math.max(8, Math.round((TAU * rad) / 19));
    const skip = new Set<number>();
    // the heart's gaps are wide enough to slip the hull through from any side
    const wide = heart ? 3 : this.level >= 4 ? 2 : 3;
    for (let g = 0; g < gaps; g++) {
      const at = Math.floor(((g + r() * 0.3) / gaps) * n);
      for (let k = 0; k < wide; k++) skip.add((at + k) % n);
    }
    for (let k = 0; k < n; k++) {
      if (skip.has(k)) continue;
      const m = this.mine('mine', x, y, r);
      m.ring = ring;
      m.slot = (k / n) * TAU;
    }
  }

  private girder(r: Rng, x: number) {
    const len = byLevel(this.d, 50, 58);
    const [lo, hi] = this.lane(x + len, 0);
    if (hi - lo < len * 2 + 20) return this.scatter(r, x, 140, false);
    const gy = lo + len + 10 + r() * Math.max(0, hi - lo - len * 2 - 20);
    this.sweepers.push({ x: x + len, y: gy, len, rate: (r() < 0.5 ? -1 : 1) * byLevel(this.d, 1.4, 2), a0: r() * TAU, near: 99, touched: false, skimmed: false, side: 0, dead: false });
    // mines above and below the girder's reach close it off
    for (let y = lo; y <= hi; y += ROW) if (Math.abs(y - gy) > len + 16) this.mine('mine', x + len + (r() - 0.5) * 6, y, r);
    return len * 2;
  }

  /** The last finder's wreck: salvage spilled round it, and the mines that got them. */
  private wreck(r: Rng, x: number) {
    const [lo, hi] = this.lane(x + 60, 16);
    const wy = lo + r() * (hi - lo);
    this.wrecks.push({ x: x + 60, y: wy });
    for (let k = 0; k < 5; k++) this.bit(x + 10 + r() * 110, clamp(wy + (r() - 0.5) * 70, lo, hi), r);
    for (let k = 0; k < 4; k++) {
      const a = r() * TAU;
      const d = 34 + r() * 20;
      const [mx, my] = [x + 60 + Math.cos(a) * d * 1.4, clamp(wy + Math.sin(a) * d, lo, hi)];
      if (this.bits.every((b) => Math.hypot(b.x - mx, b.y - my) > 16)) this.mine(this.level >= 3 && k % 2 ? 'fuse' : 'mine', mx, my, r);
    }
    return 130;
  }

  /** The heart: the cache, behind rings that turn opposite ways, and a few magnets on guard. */
  private heart(r: Rng) {
    const x = this.heartX;
    const y = this.heartY;
    const n = this.level >= 5 ? 3 : this.level >= 3 ? 2 : 1;
    const base = byLevel(this.d, 0.95, 1.2);
    // they turn opposite ways, with room between them to wait for the next gap to come round
    for (let k = 0; k < n; k++) this.ringOf(r, x, y, 36 + k * 31, (k % 2 ? -1 : 1) * base * (1 - k * 0.2), this.level >= 4 ? 2 : 3 - Math.min(1, k), true);
    if (this.level >= 2)
      for (const [dx, dy] of [
        [-120, -60],
        [-120, 60],
        [130, -55],
        [130, 55],
      ])
        this.mine('magnet', x + dx, y + dy, r);
    // salvage round the chamber, outside the rings
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.6;
      this.bit(x + Math.cos(a) * (60 + n * 26), y + Math.sin(a) * (50 + n * 14), r);
    }
  }

  /** Hunter mines asleep in the walls on the way out: they come loose as you pass. */
  private hunters(r: Rng) {
    const n = Math.round(byLevel(this.d, 2, 7));
    const span = this.exitX - 260 - (this.outX + 200);
    for (let k = 0; k < n; k++) {
      const x = this.outX + 200 + ((k + 0.2 + r() * 0.6) / n) * span;
      const fromTop = r() < 0.5;
      const y = fromTop ? this.ceil(x) - 2 : this.fieldH - this.floor(x) + 2;
      this.mine('seeker', x, y, r);
    }
  }
}

/** Where a mine on a string, a ring or a chain is at time t (the game adds magnet pull and hunts). */
export function place(m: Mine, t: number) {
  if (m.strand) {
    const s = m.strand;
    const k = m.at!;
    const bow = Math.sin(k * Math.PI);
    const sw = Math.sin(t * s.rate + s.phase) * s.sway * (s.full ? bow : k);
    // the cable hangs off a straight line between its ends, swaying across it
    const dx = s.bx - s.ax;
    const dy = s.by - s.ay;
    const l = Math.hypot(dx, dy) || 1;
    m.cx = s.ax + dx * k + (-dy / l) * (s.sag * bow + sw);
    m.cy = s.ay + dy * k + (dx / l) * (s.sag * bow + sw);
    return;
  }
  if (m.ring) {
    const g = m.ring;
    const a = m.slot! + t * g.rate;
    m.cx = g.x + Math.cos(a) * g.r;
    m.cy = g.y + Math.sin(a) * g.r;
    return;
  }
  m.cx = m.x + m.ox;
  m.cy = m.y + m.oy + (m.amp ? Math.sin(t * m.rate + m.phase) * m.amp : 0);
}

/** A point along a strand's cable at time t (0..1 along it). */
export function cablePoint(s: Strand, k: number, t: number): [number, number] {
  const bow = Math.sin(k * Math.PI);
  const sw = Math.sin(t * s.rate + s.phase) * s.sway * (s.full ? bow : k);
  const dx = s.bx - s.ax;
  const dy = s.by - s.ay;
  const l = Math.hypot(dx, dy) || 1;
  return [s.ax + dx * k + (-dy / l) * (s.sag * bow + sw), s.ay + dy * k + (dx / l) * (s.sag * bow + sw)];
}
