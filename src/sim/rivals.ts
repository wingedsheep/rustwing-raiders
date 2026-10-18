/**
 * A race's rivals: three named racers lined up ahead of you on the grid, each flying the course at
 * its own pace: on the straights a touch under what a player's ship does flat out (so it's the
 * boost, the drifts and the lines you take that win it), easing off a little when they're well
 * clear of you and pushing a little when they're well back (never enough to see). They fly the racing line
 * between the walls, ease off for the bends as sharp as they are (and slide through them, noses
 * turned in), take the pads, the bolder ones the shortcuts, burst now and then, go round what
 * stands on the track, either way round an island, and up the ramps to clear the barriers (a slow
 * one doesn't, and piles in). You can sit in their wake (a slipstream: Burn and speed) and shove them:
 * hard enough, or into a wall, it's a takedown (they spin out and you get Burn). No guns: it's a race.
 *
 * They live in the world, not on the screen: ahead of the screen or fallen off the bottom, they
 * keep racing, and the HUD points to them.
 */

import type { Level, Player } from './level';
import type { Skin } from '../render/assets';
import { DT, HALF_H } from './types';
import { BARRIER_H, fly, MOUTH, PAD_L, PAD_W, RAMP_L, WALL_R } from './course';
import { clamp, rng, shuffle, type Rng } from '../util';

export interface Rival {
  id: number;
  name: string;
  frame: string;
  livery: Skin;
  x: number;
  z: number;
  /** Forward speed (units/s, along the course) and sideways (units/s). */
  v: number;
  vx: number;
  /** Which way its nose points (rad from the course's way: turned into a bend, it slides through). */
  hd: number;
  /** Its height over the flight height (off a ramp), and how fast it's climbing. */
  alt: number;
  vy: number;
  /** Their pace as a share of par, their nerve for shortcuts, how keen they are to lean on you, how heavy. */
  pace: number;
  cuts: number;
  aggro: number;
  mass: number;
  /** Where across the gates they like to be (-1..1 of their half-width), and when they'll change their mind. */
  off: number;
  offT: number;
  /** Seconds of surge left (a pad, a burst), and until the next burst. */
  surge: number;
  burstT: number;
  /** Seconds left spinning out (rammed). */
  spin: number;
  flash: number;
  /** When it crossed the line (the race clock), or null. */
  done: number | null;
  /** Bit per player: ahead of them (for the passes). */
  ahead: number;
  /** Seconds before it can be bumped again, and who bumped it last (and how long ago). */
  bumpT: number;
  byId: number;
  byT: number;
  /** Seconds until it reacts to GO. */
  react: number;
  /** Pads it's used (a bit per pad index). */
  pads: Set<number>;
  /** The shortcut it's decided on (its id), the last it decided about, or -1. */
  lane: number;
  judged: number;
  /** The island it's last decided about, and which way round it's going. */
  isle: number;
  branch: number;
}

interface Racer {
  name: string;
  frame: string;
  livery: Skin;
  pace: number;
  cuts: number;
  aggro: number;
  mass: number;
}

/** The circuit's regulars: the same faces every race, so you learn them. */
const CAST: Racer[] = [
  { name: 'VIX DORRAN', frame: 'kestrel', livery: [0xe8e0d0, 0xc8302a, 0xff6a5a], pace: 1.04, cuts: 0.8, aggro: 0.2, mass: 1 },
  { name: 'GRUBB', frame: 'mule', livery: [0x6a7a3a, 0x3a3428, 0xffd04a], pace: 0.95, cuts: 0.15, aggro: 0.9, mass: 1.6 },
  { name: 'KIX-7', frame: 'lattice', livery: [0x8a8aa8, 0x2a2a44, 0x8ad0ff], pace: 1.0, cuts: 1, aggro: 0.3, mass: 1.1 },
  { name: 'MAE DUSTER', frame: 'wasp', livery: [0xe0a040, 0x5a2a1a, 0xffe08a], pace: 1.01, cuts: 0.5, aggro: 0.55, mass: 0.9 },
  { name: 'SAL TOREK', frame: 'hammer', livery: [0x3a4a5a, 0xd8d0b8, 0xff8a4a], pace: 0.98, cuts: 0.35, aggro: 0.65, mass: 1.3 },
];

/** How close two ships touch (centre to centre); a shove harder than this across is a takedown. */
const TOUCH = 2.6;
const TAKEDOWN = 15;
/** Rival speed changes: up (units/s²), down. */
const ACCEL = 20;
const BRAKE = 40;
/** How hard they'll corner (units/s² across): the speed they'll take a bend at is √(GRIP / k). */
const GRIP = 46;
/** Their pace on the straights against par (par is about a player's full throttle). */
const STRAIGHT = 1;
/** A surge (a pad, a burst) is this much quicker. */
const SURGE = 1.18;
/** Well clear of the nearest player (units), they ease off up to EASE_OFF; well back, they push up to PUSH. */
const CLEAR = 40;
const EASE_OFF = 0.05;
const PUSH = 0.08;
/** Into a rock or a tree faster than this (units/s, square on): spun out (shoved there by you: a takedown). */
const GLANCE = 16;
/** Off the track, on the ground: rough going. */
const ROUGH = 0.72;
/** A rival's wake: how far behind it reaches, how wide (growing a little with the distance). */
const WAKE = 16;
const WAKE_W = 2.3;
const BURN_DRAFT = 0.14;

/** The grid: three rivals ahead of you, in two columns. */
export function makeRivals(lv: Level): Rival[] {
  const r = rng(lv.spec.seed * 3301 + 17);
  const cast = shuffle(r, [...CAST]).slice(0, 3);
  const d = lv.spec.difficulty;
  // the field gets quicker over a run; the order on the grid is shuffled, slowest not always last
  const pace = 0.99 + 0.07 * Math.min(d, 1.5);
  const z0 = HALF_H - 8;
  const slots = [
    { x: -5, z: z0 - 7 },
    { x: 5, z: z0 - 14 },
    { x: -5, z: z0 - 21 },
  ];
  if (lv.players.length > 1) slots.forEach((s) => (s.z -= 2));
  return cast.map((c, i) => ({
    id: i,
    name: c.name,
    frame: c.frame,
    livery: c.livery,
    x: slots[i].x,
    z: slots[i].z,
    v: 0,
    vx: 0,
    hd: 0,
    alt: 0,
    vy: 0,
    pace: c.pace * pace * (0.98 + r() * 0.04),
    cuts: c.cuts,
    aggro: c.aggro,
    mass: c.mass,
    off: slots[i].x / 16,
    offT: 2 + r() * 2,
    surge: 0,
    burstT: 5 + r() * 6,
    spin: 0,
    flash: 0,
    done: null,
    ahead: lv.players.reduce((m, p) => m | (slots[i].z < p.z ? 1 << p.id : 0), 0),
    bumpT: 0,
    byId: -1,
    byT: 9,
    react: 0.08 + r() * 0.25,
    pads: new Set(),
    lane: -1,
    judged: -1,
    isle: -1,
    branch: 0,
  }));
}

/** Where the best of the players stands among the field: 1 = in front. */
export function placeOf(lv: Level, p: Player) {
  return 1 + lv.rivals.filter((r) => r.done !== null || r.z < p.z).length;
}

export function updateRivals(lv: Level) {
  const c = lv.terrain.course;
  if (!c) return;
  const r = rivalRng(lv);
  for (const rv of lv.rivals) {
    rv.flash = Math.max(0, rv.flash - DT);
    rv.bumpT = Math.max(0, rv.bumpT - DT);
    rv.byT += DT;
    if (lv.countdown > 0) continue;
    if (rv.react > 0) {
      rv.react -= DT;
      continue;
    }
    drive(lv, rv, r);
    if (rv.done === null && rv.z <= c.finish) {
      rv.done = lv.time;
      lv.emit({ type: 'rivalFinish', rival: rv.id, place: 1 + lv.rivals.filter((o) => o.done !== null && o !== rv).length + (lv.place > 0 ? 1 : 0) });
    }
  }
  if (lv.countdown > 0) return;
  for (const p of lv.players) {
    if (p.down) continue;
    wake(lv, p);
    for (const rv of lv.rivals) bump(lv, p, rv);
    passes(lv, p);
  }
}

/** One random source for the rivals' whims, kept with the level (so a replay races the same). */
const rngs = new WeakMap<Level, Rng>();
function rivalRng(lv: Level) {
  let r = rngs.get(lv);
  if (!r) rngs.set(lv, (r = rng(lv.spec.seed * 77 + 5)));
  return r;
}

/** A rival's pace and line: the racing line (or a shortcut's lane), round what stands on the track, into the pads. */
function drive(lv: Level, rv: Rival, r: Rng) {
  const c = lv.terrain.course!;
  rv.surge = Math.max(0, rv.surge - DT);
  // the pace: its share of par, quicker on the straights, as quick as it dares through a bend
  // (judged a little ahead, so it's braked by the time it's in)
  let bend = 0;
  for (const ahead of [0, 10, 22, 34]) bend = Math.max(bend, Math.abs(c.k(rv.z - ahead)));
  let want = lv.parSpeed * rv.pace * STRAIGHT;
  if (bend > 1e-4) want = Math.min(want, Math.sqrt(GRIP / bend) * (0.9 + rv.pace * 0.1));
  if (rv.surge > 0) want *= SURGE;
  // well clear of every player, it eases off; well back of them all, it pushes
  let gap = Infinity;
  for (const p of lv.players) if (!p.down && Math.abs(p.z - rv.z) < Math.abs(gap)) gap = p.z - rv.z;
  if (Number.isFinite(gap) && rv.done === null) {
    if (gap > CLEAR) want *= 1 - Math.min(EASE_OFF, (gap - CLEAR) / 400);
    else if (gap < -CLEAR) want *= 1 + Math.min(PUSH, (-gap - CLEAR) / 500);
  }
  // a jump coming: fast enough to clear it
  const jump = c.jumpAhead(rv.x, rv.z, 70);
  if (jump?.rp) want = Math.max(want, lv.parSpeed * 0.95);
  if (rv.spin > 0) {
    rv.spin -= DT;
    want *= 0.35;
  }
  if (lv.state === 'clear' && rv.done !== null) want *= 0.6;
  if (rv.alt <= 0 && c.off(rv.x, rv.z)) want *= ROUGH;
  // now and then a burst, as racers do
  rv.burstT -= DT;
  if (rv.burstT <= 0 && rv.spin <= 0) {
    rv.burstT = 9 + r() * 8;
    rv.surge = 0.8 + r() * 0.5;
  }
  rv.v += clamp(want - rv.v, -BRAKE * DT, ACCEL * DT * (rv.v < want * 0.5 ? 1.8 : 1));

  // the line: through the next gate (where it likes to be in it), else down the course's line
  rv.offT -= DT;
  if (rv.offT <= 0) {
    rv.offT = 2.5 + r() * 3.5;
    rv.off = clamp(rv.off * 0.3 + (r() * 2 - 1) * 0.5, -0.55, 0.55);
  }
  const ahead = rv.z - 10;
  let tx = c.line(ahead) + rv.off * Math.min(3, c.half(ahead) - 4);
  // a shortcut coming: the bold ones take it (decided once, as its mouth comes up)
  const sc = c.shortcuts.find((s) => s.z0 < rv.z + 4 && rv.z - s.z0 < 40 + rv.v && s.z1 < rv.z);
  if (sc && rv.judged !== sc.id) {
    rv.judged = sc.id;
    rv.lane = r() < rv.cuts ? sc.id : -1;
  }
  const lane = rv.lane >= 0 ? c.shortcuts[rv.lane] : undefined;
  // (in by the end of its mouth, or it's missed)
  const missed = lane && rv.z < lane.z0 - MOUTH && (rv.x - (c.x(rv.z) + lane.side * c.half(rv.z))) * lane.side < 0;
  if (lane && rv.z > lane.z1 - 4 && !missed) tx = c.cutX(lane, ahead);
  else if (lane) rv.lane = -1;
  // (into a lane slower: it's narrow)
  if (lane) rv.v = Math.min(rv.v, Math.max(lv.parSpeed * 1.08, rv.v - BRAKE * DT));
  // an island coming: decided once which way round (the quick side, mostly)
  const il = c.islandNear(rv.z, 70);
  if (il && rv.isle !== il.id) {
    rv.isle = il.id;
    rv.branch = r() < 0.65 ? il.quick : -il.quick;
  }
  if (il && !lane) tx = c.branchX(il, rv.branch, ahead) + rv.off * 2;
  // a barrier coming: up the ramp that clears it
  if (jump?.rp && !lane) tx = c.x(jump.rp.z) + jump.rp.dx + rv.off * Math.min(2, jump.rp.half - 1.5);
  // a row of rock coming: through its gap
  const row = jump ? undefined : c.rowAhead(rv.z, 70);
  if (row && !lane) tx = c.gapX(row, rv.x) + rv.off;
  // a pad within reach: have it
  c.pads.forEach((pd, i) => {
    if (rv.pads.has(i)) return;
    if (pd.z < rv.z && rv.z - pd.z < 26 && Math.abs(pd.x - tx) < 7) tx = pd.x;
    if (Math.abs(pd.z - rv.z) < PAD_L && Math.abs(pd.x - rv.x) < PAD_W + 0.5) {
      rv.pads.add(i);
      rv.surge = Math.max(rv.surge, 1.1);
    }
  });
  // something standing on the track: round it, on the side towards the middle of the way
  for (const h of jump?.rp && rv.z > jump.rp.z - RAMP_L ? [] : c.hazards) {
    if (row && Math.abs(h.z - row.z) < 3) continue;
    if (h.z > rv.z || rv.z - h.z > 30) continue;
    const mid = lane ? c.laneX(lane, h.z) : c.x(h.z);
    if (Math.abs(tx - h.x) < 4.5) tx = h.x + (h.x > (Number.isNaN(mid) ? c.x(h.z) : mid) ? -1 : 1) * 4.5;
  }
  // a rival right ahead in its line: go round
  for (const o of lv.rivals) {
    if (o === rv || o.z > rv.z || rv.z - o.z > 8 || Math.abs(o.x - tx) > 3) continue;
    tx = o.x + (o.x > tx ? -1 : 1) * 3.5;
  }
  // a player alongside: lean on them, if that's its way
  for (const p of lv.players) {
    if (p.down || rv.spin > 0) continue;
    if (Math.abs(p.z - rv.z) < 4 && Math.abs(p.x - rv.x) < 7 && rv.aggro > 0.5 && r() < rv.aggro * 0.04) rv.vx += Math.sign(p.x - rv.x) * 9 * rv.aggro;
  }
  const steer = rv.spin > 0 ? 0 : rv.alt > 0 ? 0.6 : 2.6;
  rv.vx += clamp((tx - rv.x) * steer - rv.vx, -44 * DT, 44 * DT) * (rv.spin > 0 ? 0.2 : 1);
  rv.vx = clamp(rv.vx, -26, 26);
  const x0 = rv.x;
  const z0 = rv.z;
  rv.x += rv.vx * DT;
  // down the course: quicker on the inside of a bend
  rv.z -= (rv.v / c.metric(rv.x, rv.z)) * DT;
  // up a ramp, through the air; under a barrier, piled into it
  fly(c, rv, rv.v, DT);
  const b = c.barrierCrossed(z0, rv.z);
  if (b && rv.alt < BARRIER_H && c.blocks(b, rv.x)) {
    rv.z = b.z + 1.2;
    rv.v *= 0.3;
    if (rv.spin <= 0) rv.spin = 1.2;
    rv.flash = 0.3;
  }
  // into a tunnel's rock face
  if (c.portal(rv.x, z0, rv.z)) {
    rv.z = z0 + 0.5;
    rv.v *= 0.3;
    if (rv.spin <= 0) rv.spin = 1.2;
  }
  // rock and trees: glanced off, or (square into one) spun out; shoved into one, a takedown
  for (const col of lv.terrain.colliders(rv.x, rv.z, 3)) {
    const dx = rv.x - col.x;
    const dz = rv.z - col.z;
    const d = Math.hypot(dx, dz);
    if (d >= col.r + 0.8) continue;
    const nx = dx / (d || 1);
    const nz = dz / (d || 1);
    const into = -(rv.vx * nx - rv.v * nz);
    rv.x = col.x + nx * (col.r + 0.82);
    rv.z = col.z + nz * (col.r + 0.82);
    if (into > 0) {
      rv.vx += into * nx;
      rv.v -= into * nz;
    }
    if (into > 9 && rv.byT < 0.8 && rv.spin <= 0) takedown(lv, lv.players[rv.byId], rv);
    else if (into > GLANCE && rv.spin <= 0) {
      rv.spin = 1.2;
      rv.v *= 0.4;
    } else rv.v *= 1 - 0.9 * DT;
  }
  // the walls: held off them; slammed into one just after you shoved it, a takedown
  const held = c.hold(x0, z0, rv.x, rv.z, WALL_R);
  if (held.side) {
    const into = -held.side * rv.vx;
    rv.x = held.x;
    rv.vx = held.side * Math.max(0, into) * 0.3;
    rv.v *= 1 - 0.9 * DT;
    if (into > 9 && rv.byT < 0.8 && rv.spin <= 0) takedown(lv, lv.players[rv.byId], rv);
  }
  // the nose: where it's going, turned in through a bend as it slides round
  const k = c.k(rv.z);
  const slideIn = clamp((rv.v * rv.v * k) / GRIP, -1, 1) * 0.45;
  rv.hd = Math.atan2(rv.vx, Math.max(rv.v, 1)) + slideIn;
}

/** Riding in a rival's wake: Burn, and a little pace. */
function wake(lv: Level, p: Player) {
  let best: Rival | undefined;
  for (const rv of lv.rivals) {
    if (rv.spin > 0 || rv.done !== null) continue;
    const dz = p.z - rv.z;
    if (dz < 2.5 || dz > WAKE) continue;
    if (Math.abs(p.x - rv.x) < WAKE_W + dz * 0.05) best = rv;
  }
  const was = p.draft > 0;
  if (best) {
    p.draft = 0.25;
    p.burn = Math.min(1, p.burn + BURN_DRAFT * DT);
    if (!was) lv.emit({ type: 'draft', id: p.id, rival: best.id, on: true });
  } else if (was) {
    p.draft = Math.max(0, p.draft - DT);
    if (p.draft <= 0) lv.emit({ type: 'draft', id: p.id, rival: -1, on: false });
  }
}

/** Two ships touching: pushed apart, the lighter one more; a hard shove from you is a takedown. */
function bump(lv: Level, p: Player, rv: Rival) {
  if (rv.done !== null && lv.state !== 'clear') return;
  const dx = p.x - rv.x;
  const dz = p.z - rv.z;
  const d = Math.hypot(dx, dz);
  if (d >= TOUCH || d < 1e-4) return;
  const nx = dx / d;
  const nz = dz / d;
  const mp = 1;
  const mr = rv.mass;
  const over = TOUCH - d;
  p.x += nx * over * (mr / (mp + mr));
  p.z += nz * over * (mr / (mp + mr));
  rv.x -= nx * over * (mp / (mp + mr));
  rv.z -= nz * over * (mp / (mp + mr));
  const pvz = p.vz;
  const rvz = -rv.v;
  const rel = (p.vx - rv.vx) * nx + (pvz - rvz) * nz;
  if (rel >= 0) return;
  const j = (-(1 + 0.5) * rel) / (1 / mp + 1 / mr);
  p.vx += (j * nx) / mp;
  p.vz += (j * nz) / mp;
  rv.vx -= (j * nx) / mr;
  rv.v += (j * nz) / mr;
  rv.byId = p.id;
  rv.byT = 0;
  const hard = -rel;
  if ((hard > TAKEDOWN || p.dashT > 0) && rv.spin <= 0 && lv.time > 1.5) takedown(lv, p, rv);
  else if (rv.bumpT <= 0) {
    rv.bumpT = 0.25;
    lv.emit({ type: 'bump', id: p.id, rival: rv.id, x: (p.x + rv.x) / 2, z: (p.z + rv.z) / 2, hard: clamp(hard / TAKEDOWN, 0, 1) });
  }
}

function takedown(lv: Level, p: Player | undefined, rv: Rival) {
  rv.spin = 1.8;
  rv.v *= 0.5;
  rv.surge = 0;
  if (!p) return;
  p.takedowns++;
  p.burn = Math.min(1, p.burn + 0.35);
  lv.score += 2500;
  lv.emit({ type: 'takedown', id: p.id, rival: rv.id, x: rv.x, z: rv.z });
}

/** Who's passed whom since last frame. */
function passes(lv: Level, p: Player) {
  const bit = 1 << p.id;
  for (const rv of lv.rivals) {
    const was = (rv.ahead & bit) !== 0;
    const now = rv.done !== null ? (lv.place > 0 ? was : true) : rv.z < p.z;
    if (was && !now && p.z < rv.z - 0.5) {
      rv.ahead &= ~bit;
      p.passes++;
      p.burn = Math.min(1, p.burn + 0.08);
      lv.score += 500;
      lv.emit({ type: 'pass', id: p.id, rival: rv.id, place: placeOf(lv, p), x: p.x, z: p.z });
    } else if (!was && now && (rv.done !== null || rv.z < p.z - 0.5)) {
      rv.ahead |= bit;
      lv.emit({ type: 'passed', id: p.id, rival: rv.id, place: placeOf(lv, p) });
    }
  }
}
