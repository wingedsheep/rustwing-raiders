/**
 * A race's course: a track flown across the planet, over its own land and water (no paving: the
 * planet is the surface). No fences: its edges are the land's own, a line of whatever stands tall
 * there (rock, trees, spires: hit one square and you're wrecked, glance it and you grind), buoys
 * on the water, the ground worn to a path between (the terrain and the view do those). Off the
 * edge is rough going (slower) and thickening scenery; the only hard walls are a tunnel's or a
 * slot's rock, a shortcut lane's and an island's.
 * It turns: the sim flies straight down -z with x across the course, and the course says how
 * sharply it bends at each z (`k`, radians a unit, + to the right). The view bends the drawn world
 * to match (render/bend.ts), and the sim honours it in two ways (level.ts): a ship's momentum
 * carries it to the outside of a bend unless it's steered in (so you drift through), and a unit of
 * z is shorter on the inside of a bend than the outside (so the tight line is the quick one).
 *
 * It's wide: out in the open there's room to pick your own line, and it pinches into corridors now
 * and then (always down a canyon). It runs in sections, and every race mixes them its own way (each
 * seed weights them differently, and the same kind never comes twice running):
 * - corners and hairpins, a rock at the apex for cutting it too fine, often a shortcut inside;
 * - chicanes, quick lefts and rights, the track narrowing;
 * - sweepers, long and fast, the track wandering across;
 * - straights, with boost pads to one side and now and then a ramp for the air;
 * - tunnels, the track under a roof, narrow and dark, lit by its lights rushing past;
 * - slots: a crack through the rock, narrow, walled, no roof;
 * - gauntlets: rows of rock across the track, each with a gap or two to aim through, never in line;
 * - jumps: a ramp, and past it a barrier across the track that only the air clears (or squeeze
 *   round it through the gap at the wall);
 * - splits: an island down the middle, two ways round it, one with a jump, one with rocks;
 * - fields: wide open ground with rocks scattered over it, every line your own.
 *
 * Shortcuts: on the inside of some turns the inner wall breaks open into a lane of its own, narrow,
 * with rocks to weave, swinging out across the inside of the bend (where z is shortest) and back in
 * after it. Quicker, if you thread it.
 *
 * It's all worked out from the seed, so the sim, the view and the autopilot see the same course.
 */

import { clamp, lerp, rng, smooth, smoothstep } from '../util';

/**
 * A shortcut: a lane on the `side` of the track (+1 right), its mouth opening in the wall at `z0`
 * and its exit closing at `z1`. It swings out `out` past the track's edge (its middle), `half` wide.
 */
export interface Shortcut {
  id: number;
  side: number;
  z0: number;
  z1: number;
  out: number;
  half: number;
  /** About how many units of the course it saves (at the lane's middle against the racing line). */
  saved: number;
}

/** A boost pad: fly over it for a surge. */
export interface Pad {
  x: number;
  z: number;
}

/** A ramp: from `z` (its foot) up to `z - RAMP_L` (its lip), `dx` across from the track's middle, `half` wide. */
export interface Ramp {
  dx: number;
  z: number;
  half: number;
}

/** A barrier across the track at `z`: walls only the air clears, each [from, to] across from the track's middle. */
export interface Barrier {
  z: number;
  spans: [number, number][];
}

/** A tunnel (under a roof) or a slot (open to the sky): the track walled in rock from z0 down to z1. */
export interface Tunnel {
  z0: number;
  z1: number;
  roof: boolean;
}

/** A row of rock across the track at `z`, but for its gaps: each [across from the middle, half-width]. */
export interface Row {
  z: number;
  gaps: [number, number][];
}

/** An island down the track from z0 to z1: `off` across from its middle, `half` wide at its widest. `quick`: the side the racing line takes. */
export interface Island {
  id: number;
  z0: number;
  z1: number;
  off: number;
  half: number;
  quick: number;
}

/** A turn: from z0 down to z1, which way (+1 right), how sharp at its sharpest. */
export interface Turn {
  kind: 'corner' | 'hairpin' | 'chicane' | 'sweep';
  z0: number;
  z1: number;
  dir: number;
  k: number;
}

/** What the course needs to know of the land at z. */
export interface CourseLand {
  canyon: boolean;
}

/** A wall standing at some z: where across, and which it is (for the view's colours). */
export interface Wall {
  x: number;
  /** The track's own edge, or a shortcut lane's. */
  lane: boolean;
  /** An island's. */
  island?: boolean;
  /** Which wall it is, the same from one z to the next: -1 the left edge, -2 the right, a lane's 2·id (outer) and 2·id + 1 (inner), an island's -10 - 2·id (left) and -11 - 2·id (right). */
  id: number;
}

/** The pads' size: half across, half along. */
export const PAD_W = 2.4;
export const PAD_L = 3;
/** The grid: where the race starts. */
export const GRID_Z = 0;
/** A ship's reach against a wall. */
export const WALL_R = 0.9;
/** The sharpest a corner turns (radians a unit): a hairpin's, a radius of ~64 units (flat out, only a drift holds it). */
export const K_MAX = 1 / 64;
/** A corner's, sharpest and gentlest; a bend this sharp has the racing line all the way in. */
const K_CORNER = 1 / 72;
const K_GENTLE = 1 / 115;
const K_LINE = 1 / 95;
/** A ramp: how long, and how high its lip stands over the flight height. */
export const RAMP_L = 10;
export const RAMP_H = 2.4;
/** A barrier stands this high over the flight height: under it, you hit it. */
export const BARRIER_H = 2.2;
/** The middle of the track keeps within this of the course's own line. */
const MID_MAX = 16;
/** The track's half-width: out in the open, down a corridor, out on a field, through a tunnel. */
const OPEN = 22;
const NARROW = 12;
const WIDE = 30;
const TUNNEL = 11;
const SLOT = 7;
/** The course keeps within this of its first heading (rad): it never loops back over itself. */
const HEAD_MAX = 1.5;
/** Corners ease in and out over this many units. */
const EASE = 26;
/** A shortcut's mouth (and its exit): how long the gap in the wall is, and how long the lane swings out over. */
export const MOUTH = 22;
const SWING = 26;
/** An island's nose (and tail): how long it takes to widen to its full width. */
const NOSE = 30;
/** A barrier's gap at the wall: room to squeeze round it, if you'd rather not jump. */
const GAP = 4.5;

type Kind = 'corner' | 'hairpin' | 'chicane' | 'esses' | 'sweep' | 'straight' | 'tunnel' | 'slot' | 'gauntlet' | 'jump' | 'split' | 'field';

/** How often each kind of section comes up, before a race's own mix. */
const MIX: [Kind, number][] = [
  ['corner', 1.6],
  ['hairpin', 0.5],
  ['chicane', 0.8],
  ['esses', 1.1],
  ['sweep', 1],
  ['straight', 0.6],
  ['tunnel', 0.6],
  ['slot', 0.6],
  ['gauntlet', 1.1],
  ['jump', 1],
  ['split', 0.8],
  ['field', 0.8],
];

interface Pt {
  z: number;
  x: number;
  half: number;
}

export class Course {
  /** The track's middle and half-width, between control points. */
  readonly pts: Pt[] = [];
  /** How sharp the course turns, between control points. */
  private readonly ks: { z: number; k: number }[] = [];
  readonly pads: Pad[] = [];
  /** Where an obstacle stands on the track (the terrain puts one there): go round. */
  readonly hazards: { x: number; z: number }[] = [];
  /** Where rock stands on an island (the terrain puts it there): only to look at, the island's walls keep you off it. */
  readonly decor: { x: number; z: number }[] = [];
  readonly turns: Turn[] = [];
  readonly shortcuts: Shortcut[] = [];
  readonly ramps: Ramp[] = [];
  readonly barriers: Barrier[] = [];
  readonly tunnels: Tunnel[] = [];
  readonly rows: Row[] = [];
  readonly islands: Island[] = [];
  /** The sections, in order down the course (for the autopilot's report). */
  readonly sections: { kind: string; z0: number; z1: number }[] = [];
  /** The finish line (z). */
  readonly finish: number;
  /** Per unit of z from `z0`: the heading, and the line's place in the bent world. */
  private readonly z0: number;
  private readonly head: Float32Array;
  private readonly px: Float32Array;
  private readonly pz: Float32Array;

  constructor(seed: number, start: number, end: number, land: (z: number) => CourseLand, difficulty = 0) {
    const r = rng(seed * 92821 + 7);
    this.finish = end + 70;
    const pts = this.pts;
    const ks = this.ks;
    const hard = clamp(difficulty, 0, 1.5);
    const at = (z: number, x: number, half: number) => pts.push({ z, x: clamp(x, -MID_MAX, MID_MAX), half });
    const kAt = (z: number, k: number) => ks.push({ z, k });
    // this race's own mix of sections
    const mix = MIX.map(([k, w]) => [k, w * (0.35 + r() * 1.3)] as [Kind, number]);
    const pick = (): Kind => {
      const total = mix.reduce((a, [, w]) => a + w, 0);
      let u = r() * total;
      for (const [k, w] of mix) if ((u -= w) <= 0) return k;
      return 'corner';
    };
    // the grid and the run to the first turn: straight and wide
    at(start + 40, 0, OPEN + 2);
    kAt(start + 40, 0);
    at(GRID_Z - 60, 0, OPEN + 2);
    this.pads.push({ x: -8, z: GRID_Z - 70 }, { x: 8, z: GRID_Z - 70 });
    let z = GRID_Z - 140;
    at(z, 0, OPEN);
    kAt(z, 0);
    let x = 0;
    let head = 0;
    let last: Kind = 'straight';
    /** The last shortcut's exit: they're spaced out. */
    let lastLane = Infinity;
    /** Which way a turn of `angle` can go from here (back towards the first heading, more often), or 0. */
    const way = (angle: number) => {
      const pref = (r() < 0.65 ? -Math.sign(head) : Math.sign(head)) || (r() < 0.5 ? 1 : -1);
      for (const d of [pref, -pref]) if (Math.abs(head + d * angle) <= HEAD_MAX) return d;
      return 0;
    };
    /** How wide here: a canyon's always a corridor; out in the open, now and then one. */
    const width = (zz: number) => (land(zz).canyon ? NARROW + r() * 2 : r() < 0.15 + hard * 0.05 ? NARROW + 2 + r() * 3 : OPEN + r() * 6);
    /** A gentle bend over a section (`len` long), either way it can go: k (+ right), or 0. */
    const gentle = (zIn: number, len: number, kk: number) => {
      const dir = way(kk * (len - EASE * 1.5));
      const k = dir * kk;
      kAt(zIn, 0);
      kAt(zIn - EASE * 1.5, k);
      kAt(zIn - len + EASE * 1.5, k);
      kAt(zIn - len, 0);
      head += k * (len - EASE * 1.5);
      return k;
    };
    /** A jump at z: a ramp, the barrier `run` past its lip; spans across from the middle (a gap at each wall). */
    const jump = (zz: number, mid: number, lo: number, hi: number, rampDx: number, rampHalf: number, run = 12) => {
      this.ramps.push({ dx: rampDx - mid, z: zz, half: rampHalf });
      this.barriers.push({ z: zz - RAMP_L - run, spans: [[lo - mid, hi - mid]] });
    };
    while (z > this.finish + 280) {
      const canyon = land(z - 80).canyon;
      let kind = pick();
      if (kind === last) kind = pick();
      // (out of the grid, room to spread out first)
      if (z > GRID_Z - 200 && (kind === 'tunnel' || kind === 'slot' || kind === 'gauntlet')) kind = 'sweep';
      // (a canyon's too tight for a field or a split, and the rock overhead is a tunnel's)
      if (canyon && (kind === 'field' || kind === 'split')) kind = r() < 0.5 ? 'tunnel' : 'sweep';
      // (the turn's size decided first, so it can be checked against the heading)
      const hpLen = 95 + r() * 20;
      const cLen = 50 + r() * 70;
      const cK = lerp(K_GENTLE, K_CORNER, r());
      if (kind === 'hairpin' && (canyon || !way(K_MAX * (hpLen + EASE)))) kind = 'corner';
      let dir = kind === 'hairpin' ? way(K_MAX * (hpLen + EASE)) : kind === 'corner' ? way(cK * (cLen + EASE)) : 1;
      if ((kind === 'corner' || kind === 'hairpin') && !dir) kind = 'straight';
      last = kind;
      const zStart = z;
      if (kind === 'corner' || kind === 'hairpin') {
        const hp = kind === 'hairpin';
        const len = hp ? hpLen : cLen;
        const k = dir * (hp ? K_MAX : cK);
        const zIn = z;
        const zOut = z - len - EASE * 2;
        const zApex = (zIn + zOut) / 2;
        kAt(zIn, 0);
        kAt(zIn - EASE, k);
        kAt(zOut + EASE, k);
        kAt(zOut, 0);
        const half = width(zApex);
        // the middle swings a little to the outside through the turn
        const mid = clamp(x * 0.5 - dir * 4, -MID_MAX, MID_MAX);
        at(zIn - 4, mid, half);
        at(zOut, mid, half);
        // a shortcut across the inside, or a rock at the apex for cutting it too fine
        const lane = !canyon && half >= OPEN - 1 && lastLane - zIn > 220 && len > 90 && r() < 0.62;
        if (lane) {
          const out = hp ? 20 + r() * 4 : 15 + r() * 4;
          const z0 = zIn - EASE * 0.4;
          const z1 = zOut + EASE * 0.4;
          // the lane's middle against the racing line (in on the inside, ~3 from the wall)
          const saved = Math.abs(k) * (out + 3) * (z0 - z1);
          const sc: Shortcut = { id: this.shortcuts.length, side: dir, z0, z1, out, half: 3.6, saved };
          this.shortcuts.push(sc);
          // rocks to weave in the lane, against one wall then the other (never a pocket to get stuck in)
          const l = z0 - z1;
          const lx = mid + dir * (half + out);
          this.hazards.push({ x: lx + (sc.half - 1.2) * dir, z: z0 - l * 0.4 });
          if (l > 120) this.hazards.push({ x: lx - (sc.half - 1.2) * dir, z: z0 - l * 0.68 });
          lastLane = z1;
        } else if (r() < 0.75) this.hazard(mid + dir * (half - 6), zApex - 4 - r() * 6);
        // and out on the exit, for running wide (a couple, on a wide one)
        if (r() < 0.65) this.hazard(mid - dir * (half - 4 - r() * 3), zOut - 6 - r() * 10);
        if (half > OPEN && r() < 0.5) this.hazard(mid + (r() - 0.5) * half, zOut - 20 - r() * 10);
        this.turns.push({ kind: hp ? 'hairpin' : 'corner', z0: zIn, z1: zOut, dir, k: Math.abs(k) });
        head += k * (len + EASE);
        x = mid;
        z = zOut - 20;
      } else if (kind === 'chicane') {
        // quick lefts and rights (back towards the first heading first), the track narrowing
        dir = -Math.sign(head) || (r() < 0.5 ? 1 : -1);
        const n = 2 + (r() < 0.4 && Math.abs(head) < 0.4 ? 1 : 0);
        let d = dir;
        const zIn = z;
        const half = canyon ? NARROW : NARROW + 1 + r() * 3 - hard;
        at(z - 6, x * 0.3, half);
        kAt(z, 0);
        for (let i = 0; i < n; i++) {
          const len = 26 + r() * 10;
          const k = d / (66 + r() * 14);
          // a rock on the outside of each, for running wide
          if (r() < 0.6) this.hazard(x * 0.3 - d * (half - 2.5), z - 14 - len * 0.8);
          head += k * (len + 14);
          kAt(z - 14, k);
          kAt(z - 14 - len, k);
          z -= len + 28;
          kAt(z, 0);
          d = -d;
        }
        at(z, x * 0.3, half);
        this.turns.push({ kind: 'chicane', z0: zIn, z1: z, dir, k: 1 / 70 });
        x *= 0.3;
        z -= 12;
      } else if (kind === 'esses') {
        // a switchback: tight bends one way then the other, each one a drift flat out, rock on the
        // outside of each exit for running wide, and on the apex for cutting it too fine
        let d = -Math.sign(head) || (r() < 0.5 ? 1 : -1);
        const n = 3 + Math.floor(r() * 2 + hard * 0.7);
        const half = canyon ? NARROW + 2 : 14 + r() * 4;
        const zIn = z;
        const mid = clamp(x * 0.4, -MID_MAX, MID_MAX);
        at(z - 6, mid, half);
        kAt(z, 0);
        for (let i = 0; i < n; i++) {
          const k = 1 / (68 + r() * 20);
          // (each bend undoes the last: the heading swings to and fro)
          const len = (0.5 + r() * 0.25) / k - 8;
          if (Math.abs(head + d * k * (len + 8)) > HEAD_MAX) d = -d;
          const kk = d * k;
          kAt(z - 8, kk);
          kAt(z - 8 - len, kk);
          head += kk * (len + 8);
          if (r() < 0.5) this.hazard(mid + d * (half - 2.5), z - 8 - len * 0.5);
          else if (r() < 0.7) this.hazard(mid - d * (half - 2 - r() * 2), z - 14 - len);
          z -= len + 16;
          kAt(z, 0);
          d = -d;
        }
        at(z, mid, half);
        this.turns.push({ kind: 'chicane', z0: zIn, z1: z, dir: -d, k: 1 / 70 });
        x = mid;
        z -= 16;
      } else if (kind === 'sweep') {
        // a long fast curve, the track wandering across, a rock or two to go round
        const len = 160 + r() * 90;
        const k = gentle(z, len, 1 / (190 + r() * 90));
        const n = Math.max(2, Math.round(len / 65));
        for (let i = 1; i <= n; i++) {
          const pz = z - (len * i) / (n + 0.5);
          const half = width(pz);
          const pxx = clamp(x + (r() * 2 - 1) * 10, -MID_MAX, MID_MAX);
          at(pz, pxx, half);
          if (i < n && half > NARROW + 2 && r() < 0.55) this.hazard(pxx + (r() < 0.5 ? -1 : 1) * (2 + r() * (half - 7)), pz - 30);
          x = pxx;
        }
        if (k) this.turns.push({ kind: 'sweep', z0: z, z1: z - len, dir: Math.sign(k), k: Math.abs(k) });
        z -= len + 10;
      } else if (kind === 'straight') {
        // a straight: pads to one side (you have to want them), a rock in the middle now and then, a ramp for the air
        const len = 110 + r() * 60;
        const half = canyon ? NARROW + 2 : OPEN + r() * 4;
        at(z - 10, x, half);
        at(z - len, x, half);
        kAt(z, 0);
        kAt(z - len, 0);
        const side = r() < 0.5 ? -1 : 1;
        this.pads.push({ x: x + side * (half - 5), z: z - len * 0.3 });
        if (r() < 0.5) this.pads.push({ x: x - side * (half - 6), z: z - len * 0.75 });
        if (r() < 0.55) this.ramps.push({ dx: -side * (2 + r() * 4), z: z - len * 0.5, half: 4 + r() * 2 });
        else if (r() < 0.6) this.hazard(x + (r() - 0.5) * 6, z - len * 0.55);
        z -= len;
      } else if (kind === 'tunnel') {
        // into the rock: the track narrows to the portal, a roof over it, a gentle bend inside
        const len = 150 + r() * 90;
        const zIn = z;
        at(z - 4, x * 0.6, width(z));
        const mid = clamp(x * 0.6, -MID_MAX, MID_MAX);
        at(z - 50, mid, TUNNEL + r() * 2);
        at(z - len, mid, TUNNEL + r() * 2);
        const k = gentle(z - 20, len - 20, 1 / (200 + r() * 120));
        if (k) this.turns.push({ kind: 'sweep', z0: z - 20, z1: z - len, dir: Math.sign(k), k: Math.abs(k) });
        this.tunnels.push({ z0: zIn - 50, z1: z - len, roof: true });
        // a pad in the dark, a rock or two (lit up: you see it coming)
        if (r() < 0.6) this.pads.push({ x: mid + (r() - 0.5) * 8, z: z - len * 0.55 });
        if (r() < 0.6) this.hazard(mid + (r() < 0.5 ? -1 : 1) * (2 + r() * 5), z - len * 0.35);
        x = mid;
        z -= len;
        // (out into the light, wide again)
        at(z - 26, x, width(z - 26));
        z -= 26;
      } else if (kind === 'slot') {
        // a crack through the rock: in through a narrow mouth, a bend or two, out again
        const len = 110 + r() * 70;
        const zIn = z;
        at(z - 4, x * 0.5, width(z));
        const mid = clamp(x * 0.5, -MID_MAX, MID_MAX);
        const half = SLOT + 1 + r() * 1.5 - hard;
        at(z - 46, mid, half);
        at(z - len, mid, half);
        kAt(z - 40, 0);
        // (wiggling: a quick bend one way, then the other)
        const d = r() < 0.5 ? 1 : -1;
        const k = 1 / (85 + r() * 25);
        kAt(z - 54, d * k);
        kAt(z - len / 2, d * k);
        kAt(z - len / 2 - 12, -d * k);
        kAt(z - len + 10, -d * k);
        kAt(z - len, 0);
        this.tunnels.push({ z0: zIn - 46, z1: z - len, roof: false });
        x = mid;
        z -= len;
        at(z - 24, x, width(z - 24));
        z -= 24;
      } else if (kind === 'gauntlet') {
        // rows of rock across the track, a gap or two in each, never where the last one's was
        const half = canyon ? NARROW + 2 : OPEN + r() * 4;
        const mid = clamp(x + (r() - 0.5) * 6, -MID_MAX, MID_MAX);
        const n = 3 + Math.floor(r() * 2 + hard);
        const space = 50 + r() * 14;
        const len = 55 + n * space;
        at(z - 10, mid, half);
        at(z - len, mid, half);
        kAt(z, 0);
        kAt(z - len, 0);
        let lastAt = 0;
        for (let i = 0; i < n; i++) {
          const zr = z - 45 - i * space;
          const g = 3.2 + r() * 1.1 - hard * 0.4;
          const gaps: [number, number][] = [];
          // (the gap swung across from the last one's, as far as you can turn between them: you have to turn for it)
          const lim = half - g - 2;
          const swing = 6 + r() * (space - 44) * 0.45;
          let at0 = i === 0 ? (r() * 2 - 1) * Math.min(lim, 8) : lastAt + (r() < 0.5 ? -1 : 1) * swing;
          if (Math.abs(at0) > lim) at0 = lastAt - Math.sign(at0) * swing;
          at0 = clamp(at0, -lim, lim);
          gaps.push([at0, g]);
          if (half > 18 && r() < 0.55) gaps.push([clamp(-at0 * 0.8 + (r() - 0.5) * 4, -(half - g - 2), half - g - 2), g * 0.85]);
          lastAt = at0;
          this.rows.push({ z: zr, gaps });
          // the rock: a ragged line of it across, edge to edge (and a little past), but in the gaps
          for (let rx = -half - 3; rx <= half + 3; rx += 3.4 + r() * 1.8) if (!gaps.some(([gx, gh]) => Math.abs(rx - gx) < gh + 1.6)) this.hazards.push({ x: mid + rx, z: zr + (r() - 0.5) * 5 });
        }
        x = mid;
        z -= len;
      } else if (kind === 'jump') {
        // a ramp, a barrier past it; once or twice, the ramp in the middle (gaps at the walls) or two ramps either side (a gap in the middle)
        const n = r() < 0.35 ? 2 : 1;
        const half = canyon ? NARROW + 3 : OPEN + 2 + r() * 4;
        const mid = clamp(x + (r() - 0.5) * 6, -MID_MAX, MID_MAX);
        const len = 70 + n * 90;
        at(z - 10, mid, half);
        at(z - len, mid, half);
        kAt(z, 0);
        kAt(z - len, 0);
        for (let i = 0; i < n; i++) {
          const zr = z - 40 - i * 90;
          if (r() < 0.6 || half < OPEN) {
            // the ramp in the middle: a barrier wall to wall but for a gap at each
            jump(zr, mid, mid - half + GAP, mid + half - GAP, mid + (r() - 0.5) * 4, half * 0.42);
          } else {
            // two ramps, the barrier across both, the gap in the middle (a rock in it)
            this.ramps.push({ dx: -half * 0.55, z: zr, half: half * 0.3 }, { dx: half * 0.55, z: zr, half: half * 0.3 });
            this.barriers.push({ z: zr - RAMP_L - 12, spans: [[-half, -GAP * 0.7], [GAP * 0.7, half]] });
            this.hazards.push({ x: mid, z: zr - RAMP_L - 36 });
          }
        }
        if (r() < 0.6) this.pads.push({ x: mid + (r() - 0.5) * 8, z: z - len + 15 });
        x = mid;
        z -= len;
      } else if (kind === 'split') {
        // an island down the middle: two ways round, gently curving (the inside one's the shorter)
        const len = 170 + r() * 80;
        const half = WIDE + r() * 4;
        const mid = clamp(x * 0.5, -MID_MAX + 4, MID_MAX - 4);
        at(z - 4, mid, half);
        at(z - len, mid, half);
        const k = gentle(z, len, 1 / (240 + r() * 160));
        const ih = 6 + r() * 3;
        const off = (r() - 0.5) * 6;
        const z0 = z - 24;
        const z1 = z - len + 16;
        const quick = Math.sign(k) || (r() < 0.5 ? 1 : -1);
        const isl: Island = { id: this.islands.length, z0, z1, off, half: ih, quick };
        this.islands.push(isl);
        // one way has a jump across it, the other rocks to weave
        const jumpSide = r() < 0.5 ? -1 : 1;
        const zj = (z0 + z1) / 2 + 20;
        const inner = mid + off + jumpSide * (ih + 1);
        const outer = mid + jumpSide * (half - GAP);
        jump(zj, mid, Math.min(inner, outer), Math.max(inner, outer), (inner + outer) / 2, Math.abs(outer - inner) * 0.4);
        for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
          const hz = z0 - NOSE - 10 - r() * (z0 - z1 - NOSE * 2 - 20);
          this.hazard(mid + off - jumpSide * (ih + 3 + r() * (half - ih - 8)), hz);
        }
        // rock along the island itself
        for (let iz = z0 - NOSE; iz > z1 + NOSE; iz -= 18) this.decor.push({ x: mid + off + (r() - 0.5) * ih * 0.6, z: iz });
        x = mid;
        z -= len + 10;
      } else {
        // a field: wide open ground, rocks scattered over it, a pad or two, now and then a ramp
        const len = 160 + r() * 80;
        const half = WIDE + r() * 6;
        const mid = clamp(x + (r() - 0.5) * 8, -MID_MAX, MID_MAX);
        at(z - 20, mid, half);
        at(z - len + 20, clamp(mid + (r() - 0.5) * 10, -MID_MAX, MID_MAX), half);
        const k = gentle(z, len, 1 / (220 + r() * 140));
        if (k) this.turns.push({ kind: 'sweep', z0: z, z1: z - len, dir: Math.sign(k), k: Math.abs(k) });
        const rocks = 6 + Math.floor(r() * 6);
        for (let i = 0; i < rocks; i++) this.hazard(mid + (r() * 2 - 1) * (half - 5), z - 30 - r() * (len - 50));
        this.pads.push({ x: mid + (r() - 0.5) * half, z: z - len * (0.3 + r() * 0.4) });
        if (r() < 0.5) this.ramps.push({ dx: (r() - 0.5) * half, z: z - len * 0.6, half: 4 + r() * 2 });
        x = mid;
        z -= len;
      }
      this.sections.push({ kind, z0: zStart, z1: z });
    }
    // the run-in to the finish: straight and wide
    kAt(z, 0);
    at(this.finish + 60, x * 0.5, OPEN);
    at(this.finish, 0, OPEN + 2);
    at(end - 500, 0, OPEN + 2);
    kAt(end - 500, 0);
    pts.sort((a, b) => b.z - a.z);
    ks.sort((a, b) => b.z - a.z);
    // (no rock in a lane's mouth or its exit, on a ramp or the run past it, nor against an island)
    const mouth = (h: { z: number }) => this.shortcuts.some((sc) => (h.z <= sc.z0 + 6 && h.z >= sc.z0 - MOUTH - 10) || (h.z >= sc.z1 - 6 && h.z <= sc.z1 + MOUTH + 10));
    const jumpy = (h: { x: number; z: number }) => this.ramps.some((rp) => h.z <= rp.z + 12 && h.z >= rp.z - RAMP_L - 40 && Math.abs(h.x - this.x(h.z) - rp.dx) < rp.half + 4);
    const isle = (h: { x: number; z: number }) => this.islands.some((il) => h.z <= il.z0 + 6 && h.z >= il.z1 - 6 && Math.abs(h.x - this.x(h.z) - il.off) < il.half + 3.5);
    const row = (h: { z: number }) => this.rows.some((rw) => Math.abs(rw.z - h.z) < 2.6);
    const keep = this.hazards.filter((h) => row(h) || (!mouth(h) && !jumpy(h) && !isle(h) && !this.barriers.some((b) => Math.abs(b.z - h.z) < 10)));
    this.hazards.length = 0;
    this.hazards.push(...keep);

    // the heading, and the line in the bent world, unit by unit
    this.z0 = start + 40;
    const n = Math.ceil(this.z0 - (end - 500)) + 2;
    this.head = new Float32Array(n);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    let h = 0;
    let wx = 0;
    let wz = this.z0;
    for (let i = 0; i < n; i++) {
      this.head[i] = h;
      this.px[i] = wx;
      this.pz[i] = wz;
      const k = this.k(this.z0 - i - 0.5);
      h += k;
      wx += Math.sin(h - k / 2);
      wz -= Math.cos(h - k / 2);
    }
  }

  /** A rock standing on the track at about (x, z), not on a pad. */
  private hazard(x: number, z: number) {
    if (this.pads.some((p) => Math.abs(p.z - z) < 14 && Math.abs(p.x - x) < 8)) return;
    this.hazards.push({ x, z });
  }

  private seg<T extends { z: number }>(list: T[], z: number): [T, T, number] {
    if (z >= list[0].z) return [list[0], list[0], 0];
    let lo = 0;
    let hi = list.length - 1;
    if (z <= list[hi].z) return [list[hi], list[hi], 0];
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (list[m].z > z) lo = m;
      else hi = m;
    }
    const a = list[lo];
    const b = list[hi];
    return [a, b, (a.z - z) / (a.z - b.z || 1)];
  }

  /** The middle of the track at z. */
  x(z: number) {
    const [a, b, t] = this.seg(this.pts, z);
    return lerp(a.x, b.x, smooth(t));
  }

  /** The track's half-width at z (wall to wall). */
  half(z: number) {
    const [a, b, t] = this.seg(this.pts, z);
    return lerp(a.half, b.half, smooth(t));
  }

  /**
   * The racing line at z: in towards the inside of a bend (judged a little ahead, so it's there
   * by the apex), the middle on the straights; round an island, its quick side.
   */
  line(z: number) {
    const il = this.islandNear(z);
    if (il) return this.branchX(il, il.quick, z);
    // (judged over a stretch: through a switchback's lefts and rights it runs about straight)
    const k = (this.k(z - 8) + this.k(z - 20) + this.k(z - 34) * 0.7 + this.k(z + 4) * 0.5) / 3.2;
    return this.x(z) + clamp((k / K_LINE) * 1.3, -1, 1) * Math.min(this.half(z) - 3.2, 14);
  }

  /** Drawn bent round the course, would (x, z) fold over (past the middle of a bend's circle, on its inside)? */
  folds(x: number, z: number) {
    for (let d = -40; d <= 40; d += 10) {
      const k = this.k(z + d);
      if (k * x > 0 && Math.abs(k * x) > 0.85) return true;
    }
    return false;
  }

  /** How far either side of the middle anything of the course reaches at z (its lanes too): the terrain keeps clear of it. */
  corridor(z: number) {
    let far = this.half(z);
    for (const sc of this.shortcuts) if (z <= sc.z0 + 2 && z >= sc.z1 - 2) far = Math.max(far, this.half(z) + sc.out + sc.half);
    return far + 2;
  }

  /** How the middle runs at z: dx/dz (positive: it drifts right as you go down the course). */
  slope(z: number) {
    const e = 0.5;
    return (this.x(z + e) - this.x(z - e)) / (2 * e);
  }

  /** How sharply the course turns at z (radians a unit, + right). */
  k(z: number) {
    const [a, b, t] = this.seg(this.ks, z);
    return lerp(a.k, b.k, smooth(t));
  }

  /** Units of the world per unit of z at x across: shorter on the inside of a bend. */
  metric(x: number, z: number) {
    return Math.max(0.3, 1 - this.k(z) * x);
  }

  /** The course's heading at z, from the start (radians, + right). */
  heading(z: number) {
    return this.sample(this.head, z);
  }

  /** The line's place in the bent world (for render/bend.ts). */
  at(z: number, out: { x: number; z: number }) {
    out.x = this.sample(this.px, z);
    out.z = this.sample(this.pz, z);
    return out;
  }

  private sample(a: Float32Array, z: number) {
    const u = clamp(this.z0 - z, 0, a.length - 1.001);
    const i = Math.floor(u);
    return a[i] + (a[i + 1] - a[i]) * (u - i);
  }

  /** The turn running past z, if any. */
  turnAt(z: number) {
    return this.turns.find((t) => z <= t.z0 && z >= t.z1);
  }

  /** The shortcut whose lane runs past z, if any. */
  shortcutAt(z: number) {
    return this.shortcuts.find((sc) => z <= sc.z0 && z >= sc.z1);
  }

  /** The tunnel over z, if any. */
  tunnelAt(z: number) {
    return this.tunnels.find((t) => z <= t.z0 && z >= t.z1);
  }

  /** The row of rock coming up within `ahead` of z, if any. */
  rowAhead(z: number, ahead: number) {
    return this.rows.find((rw) => rw.z - 3 < z && rw.z > z - ahead);
  }

  /** The middle of a row's gap nearest x (in world x). */
  gapX(rw: Row, x: number) {
    const m = this.x(rw.z);
    let best = rw.gaps[0];
    for (const g of rw.gaps) if (Math.abs(m + g[0] - x) < Math.abs(m + best[0] - x)) best = g;
    return m + best[0];
  }

  /** Going from z0 to z1 at x: into a tunnel's or a slot's mouth outside it (into the rock face round it)? */
  portal(x: number, z0: number, z1: number) {
    const t = this.tunnels.find((tn) => tn.z0 <= z0 && tn.z0 > z1);
    return !!t && Math.abs(x - this.x(t.z0)) > this.half(t.z0) - 0.3;
  }

  /** Whether x is off the track at z (and out of a lane): rough going. */
  off(x: number, z: number) {
    return !this.inside(x, z);
  }

  /** The island standing at z, if any. */
  islandAt(z: number) {
    return this.islands.find((il) => z <= il.z0 && z >= il.z1);
  }

  /** The island at z or coming up (within `ahead`), if any: what to line up for. */
  islandNear(z: number, ahead = 50) {
    return this.islands.find((il) => z <= il.z0 + ahead && z >= il.z1);
  }

  /** An island's half-width at z (0 off its ends; narrowing to a point at each). */
  islandHalf(il: Island, z: number) {
    if (z > il.z0 || z < il.z1) return 0;
    return il.half * smoothstep(0, NOSE, il.z0 - z) * smoothstep(0, NOSE, z - il.z1);
  }

  /** The middle of the way round an island on `side` at z (before it, the way as it'll be). */
  branchX(il: Island, side: number, z: number) {
    const zz = clamp(z, il.z1 + NOSE, il.z0 - NOSE);
    const m = this.x(zz);
    const h = this.half(zz);
    const wall = m + il.off + side * this.islandHalf(il, zz);
    return (wall + m + side * h) / 2;
  }

  /** How high a ramp stands at (x, z) over the flight height, or -1 off every ramp. */
  ramp(x: number, z: number) {
    for (const rp of this.ramps) {
      if (z > rp.z || z < rp.z - RAMP_L) continue;
      if (Math.abs(x - this.x(z) - rp.dx) > rp.half) continue;
      return (RAMP_H * (rp.z - z)) / RAMP_L;
    }
    return -1;
  }

  /** The ramp whose foot is ahead of z within `ahead` (or under it), if any. */
  rampAhead(z: number, ahead: number) {
    return this.ramps.find((rp) => rp.z - RAMP_L < z && rp.z > z - ahead);
  }

  /** The barrier between z0 and z1 (going down the course), if any. */
  barrierCrossed(z0: number, z1: number) {
    return this.barriers.find((b) => b.z <= z0 && b.z > z1);
  }

  /** Whether a barrier stands at x across (within `r`). */
  blocks(b: Barrier, x: number, r = WALL_R) {
    const dx = x - this.x(b.z);
    return b.spans.some(([lo, hi]) => dx > lo - r && dx < hi + r);
  }

  /** The barrier coming up within `ahead` of z that stands across x (one round the far side of an island doesn't), and the ramp that clears it. */
  jumpAhead(x: number, z: number, ahead: number): { b: Barrier; rp: Ramp | undefined } | undefined {
    const b = this.barriers.find((bb) => bb.z < z && bb.z > z - ahead);
    if (!b) return undefined;
    const il = this.islandAt(b.z);
    const across = (b.spans[0][0] + b.spans[0][1]) / 2;
    if (il && Math.sign(x - this.x(z) - il.off) !== Math.sign(across - il.off)) return undefined;
    // (the ramp just before it nearest the middle of where it's heading)
    let best: Ramp | undefined;
    for (const rp of this.ramps) if (rp.z > b.z && rp.z - b.z < RAMP_L + 30 && (!best || Math.abs(rp.dx) < Math.abs(best.dx))) best = rp;
    return { b, rp: best };
  }

  /** A shortcut's lane walls at z (outer, inner), where they stand; NaN where one doesn't. */
  laneWalls(sc: Shortcut, z: number): [number, number] {
    if (z > sc.z0 || z < sc.z1) return [NaN, NaN];
    const m = this.x(z);
    const h = this.half(z);
    const s = sc.side;
    const swing = (a: number, b: number) => smoothstep(0, SWING, a - z) * smoothstep(0, SWING, z - b);
    const outer = m + s * (h + (sc.out + sc.half) * swing(sc.z0, sc.z1));
    const zi0 = sc.z0 - MOUTH;
    const zi1 = sc.z1 + MOUTH;
    const inner = z <= zi0 && z >= zi1 ? m + s * (h + (sc.out - sc.half) * swing(zi0, zi1)) : NaN;
    return [outer, inner];
  }

  /** A shortcut lane's middle at z (where both its walls stand), else NaN. */
  laneX(sc: Shortcut, z: number) {
    const [o, i] = this.laneWalls(sc, z);
    return (o + i) / 2;
  }

  /** The line through a shortcut at z: just inside the track's edge before it, through the middle of its mouth, its lane and its exit. */
  cutX(sc: Shortcut, z: number) {
    const edge = this.x(z) + sc.side * this.half(z);
    if (z > sc.z0) return edge - sc.side * 2;
    if (z < sc.z1) return edge - sc.side * 3;
    const [o, i] = this.laneWalls(sc, z);
    return ((Number.isNaN(i) ? edge : i) + o) / 2;
  }

  /** Whether the track's own wall on `side` is open at z (a shortcut's mouth or exit). */
  open(side: number, z: number) {
    return this.shortcuts.some((sc) => sc.side === side && ((z <= sc.z0 && z > sc.z0 - MOUTH) || (z < sc.z1 + MOUTH && z >= sc.z1)));
  }

  /** The walls standing at z: a tunnel's or a slot's rock (the track's edges are soft elsewhere), the lanes', an island's. */
  walls(z: number, out: Wall[] = []) {
    out.length = 0;
    const m = this.x(z);
    const h = this.half(z);
    if (this.tunnelAt(z)) out.push({ x: m - h, lane: false, id: -1 }, { x: m + h, lane: false, id: -2 });
    for (const sc of this.shortcuts) {
      if (z > sc.z0 || z < sc.z1) continue;
      const [o, i] = this.laneWalls(sc, z);
      out.push({ x: o, lane: true, id: sc.id * 2 });
      if (!Number.isNaN(i)) out.push({ x: i, lane: true, id: sc.id * 2 + 1 });
    }
    const il = this.islandAt(z);
    if (il) {
      const w = this.islandHalf(il, z);
      out.push({ x: m + il.off - w, lane: false, island: true, id: -10 - 2 * il.id }, { x: m + il.off + w, lane: false, island: true, id: -11 - 2 * il.id });
    }
    return out;
  }

  /**
   * Keeps something moving from (x0, z0) to (x1, z1) on its side of every wall (within `r` of one
   * counts). Which side it was on is judged where the wall stood at z0 (walls move across as the
   * track narrows and bends: one sweeping in mustn't sweep past it). Returns where it ends up, and
   * the side of the wall it was held on (+1: to the wall's right), or 0 if it touched none.
   */
  hold(x0: number, z0: number, x1: number, z1: number, r = WALL_R): { x: number; side: number } {
    const before = this.walls(z0, scratch0);
    const ws = this.walls(z1, scratch);
    let x = x1;
    let side = 0;
    for (const w of ws) {
      const was = before.find((b) => b.id === w.id);
      // (an island's nose: which side of it is judged by where it'll be)
      const s = Math.sign(x0 - (was ? was.x : w.x)) || (w.island ? (w.id % 2 === 0 ? -1 : 1) : 1);
      // (a lane's outer wall only keeps in what's in the lane: out on the rough beyond it, it's just rock)
      if (w.lane && w.id >= 0 && w.id % 2 === 0 && s === this.shortcuts[w.id / 2].side) continue;
      if ((x - w.x) * s < r) {
        x = w.x + s * r;
        side = s;
      }
    }
    // (lost outside everything somehow: back on the track)
    const m = this.x(z1);
    if (Math.abs(x - m) > this.corridor(z1) + 14) {
      side = -Math.sign(x - m);
      x = m - side * (this.half(z1) - r);
    }
    return { x, side };
  }

  /** Whether (x, z) is somewhere a ship can be: on the track (not on an island), or in a lane. */
  inside(x: number, z: number) {
    const m = this.x(z);
    const h = this.half(z);
    const il = this.islandAt(z);
    if (il && Math.abs(x - m - il.off) < this.islandHalf(il, z)) return false;
    if (Math.abs(x - m) <= h) return true;
    const sc = this.shortcutAt(z);
    if (!sc) return false;
    const [o, i] = this.laneWalls(sc, z);
    const near = Number.isNaN(i) ? m + sc.side * h : i;
    return (x - near) * sc.side >= 0 && (o - x) * sc.side >= 0;
  }
}

const scratch0: Wall[] = [];
const scratch: Wall[] = [];

/** In the air: gravity (units/s²), and how much of a ship's speed a ramp's lip throws it up at. */
export const GRAVITY = 34;
const LIFT = 0.22;
/** However fast you hit a ramp, it throws you up no faster than this. */
const LIFT_MAX = 14;

/**
 * Up a ramp, off its lip and through the air: a ship's height over the flight height (`alt`) and
 * how fast it's climbing (`vy`), stepped on by `dt` at forward speed `fwd`. Returns true on the
 * frame it lands.
 */
export function fly(c: Course, s: { x: number; z: number; alt: number; vy: number }, fwd: number, dt: number) {
  const h = c.ramp(s.x, s.z);
  if (h >= 0 && s.alt <= h + 0.5) {
    s.alt = h;
    s.vy = Math.min(fwd * LIFT, LIFT_MAX);
    return false;
  }
  if (s.alt <= 0 && s.vy <= 0) {
    s.alt = 0;
    s.vy = 0;
    return false;
  }
  s.vy -= GRAVITY * dt;
  s.alt += s.vy * dt;
  if (s.alt > 0) return false;
  s.alt = 0;
  s.vy = 0;
  return true;
}
