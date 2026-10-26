/**
 * How the faction foes fly and fight (see factions.ts for who they are). Each runs the loop in
 * combat.ts: idle, a windup with a tell, the attack, then a recovery where it's open. Screen space
 * as in enemies.ts: `s` is z from the middle of the screen (negative is up, towards the top).
 */

import { SEEKER, TORPEDO, type Enemy, type Level, type Player } from './level';
import { DT, FLIGHT_Y, HALF_H, HALF_W, fromFlight, toFlight } from './types';
import { clamp, lerp, smooth } from '../util';
import { go, lookOf, over, release, type Tele } from './combat';
import { strike } from './strikes';
import { routeX, type Route } from './layout';
import { SHARE, arms as volleyArms, fan as volleyFan, pattern } from './volleys';

export const sz = (lv: Level, e: Enemy) => e.z - lv.scroll;

export function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

/** Turn towards an angle at no more than `rate` rad/s. */
function turn(a: number, b: number, rate: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + clamp(d, -rate * DT, rate * DT);
}

/**
 * Put a flier at screen position (x, s), facing the way it moved. `from`: the spot was worked out
 * from where it is (a step from e.x, its swing already in it), not a spot on a path of its own.
 */
export function moveTo(lv: Level, e: Enemy, x: number, s: number, from = false) {
  const nz = lv.scroll + s;
  if (!e.ground) {
    // (down a canyon: between its walls, not into them)
    x = lv.terrain.intoCanyon(x, nz, e.r);
    // round what stands in its way. (Said by the move, never guessed: a guess that flips from one
    // frame to the next puts the whole swing on or takes it off at once, and it jumps)
    const d = e.d;
    const v0 = d.veer ?? 0;
    const v = veer(lv, e, from ? x - v0 : x, nz, s, v0);
    d.veer = v;
    x += from ? v - v0 : v;
  }
  const dx = x - e.x;
  const dz = nz - e.z;
  e.vx = dx / DT;
  e.vz = dz / DT;
  if (Math.abs(dx) + Math.abs(s - (e.z - lv.scroll)) > 1e-4) e.heading = lerpAngle(e.heading, Math.atan2(dx, s - (e.z - lv.scroll)), 0.15);
  e.x = x;
  e.z = nz;
}

/** How far ahead (s) a flier looks for an obstacle in its way, how far it'll swing out round one, and how quick it swings out and back (units/s). */
const VEER_LOOK = 1.1;
const VEER_MAX = 16;
const VEER_OUT = 24;
const VEER_BACK = 7;

/**
 * A flier's swing round the obstacles. It looks along the way it's going over the land (the land
 * comes down the screen at it): if the first column in its way would have it, it swings out past
 * it, on the side it's already on unless that's shut (the field's edge, or more columns), and back
 * once it's by. `x` is where it means to be, without the swing; returns the swing. A lunge doesn't
 * swerve: what it lined up on, it hits.
 */
function veer(lv: Level, e: Enemy, x: number, z: number, s: number, v0: number): number {
  if (e.tele?.shape === 'line' && (e.state === 'windup' || e.state === 'attack')) return v0;
  // (not while it's still coming in from off the top or the sides)
  if (s < -HALF_H - 2 || Math.abs(x) > HALF_W + 2) return v0 + clamp(-v0, -VEER_BACK * DT, VEER_BACK * DT);
  const vx = clamp(e.vx, -30, 30);
  const vz = clamp(e.vz, -30, 30) - lv.speedNow;
  const r = e.r + 0.8;
  const reach = Math.abs(vz) * VEER_LOOK + r + 4;
  const cols = [...lv.terrain.colliders(x + v0, z + (vz * VEER_LOOK) / 2, reach)];
  let want = 0;
  let soonest = Infinity;
  for (const c of cols) {
    // the first moment on the way it means to go that it would be in the column, and where across
    const span = c.r + r;
    let k = -1;
    for (let i = 0; i <= 8; i++) {
      const ki = (i / 8) * VEER_LOOK;
      if (Math.abs(z + vz * ki - c.z) < span && Math.abs(x + vx * ki - c.x) < span) {
        k = ki;
        break;
      }
    }
    if (k < 0 || k >= soonest) continue;
    const px = x + vx * k;
    // past it on either side (and past whatever stands next to it), as near where it is as will do
    const at = px + v0;
    const mine = Math.sign(at - c.x) || -Math.sign(c.x) || 1;
    let best = Infinity;
    let pick = 0;
    for (const side of [mine, -mine]) {
      let to = c.x + side * span;
      for (let n = 0; n < 4; n++) {
        const b = cols.find((o) => o !== c && Math.abs(o.z - c.z) < o.r + r && Math.abs(o.x - to) < o.r + r);
        if (!b) break;
        to = b.x + side * (b.r + r);
      }
      if (Math.abs(to) > HALF_W - 1 || Math.abs(to - px) > VEER_MAX) continue;
      const cost = Math.abs(to - at) + (side === mine ? 0 : 3);
      if (cost < best) {
        best = cost;
        pick = to - px;
      }
    }
    if (best === Infinity) continue;
    soonest = k;
    want = pick;
  }
  const rate = Math.abs(want) > Math.abs(v0) || want * v0 < 0 ? VEER_OUT : VEER_BACK;
  return v0 + clamp((want - v0) * 6, -rate, rate) * DT;
}

/** Ease towards a screen spot (a hover), at up to `max` units/s. */
function ease(lv: Level, e: Enemy, x: number, s: number, k = 3, max = 18) {
  const cs = sz(lv, e);
  const dx = clamp((x - e.x) * k, -max, max);
  const ds = clamp((s - cs) * k, -max, max);
  moveTo(lv, e, e.x + dx * DT, cs + ds * DT, true);
}

/** Can it see you? (On screen, and not right at the edge.) */
export const live = (lv: Level, e: Enemy) => lv.onScreen(e.x, e.z, -1) && e.stun <= 0 && lv.state !== 'clear' && lv.state !== 'failed';

/** Quicker tells later in the run (never by much). */
/** Puffballs: how fast they sink, how close sets one off, the swell, the blast and the cloud it leaves (radius, seconds). */
const PUFF = { sink: 6, near: 4.5, swell: 0.55, blast: 4.5, cloud: 4, linger: 3 };
/** Hookjaws: the harpoon's speed, how far ahead of you it aims (of your flight), the reel's pull, how long until it drags you onto its hull, and how squarely a dash must pull away to snap the line, and how far a wrong-way dash is yanked back. */
const HOOK = { speed: 58, lead: 0.85, reel: 10, hold: 1.8, snap: 0.35, yank: 0.7 };
/** Tenders: the climb out of the core and the ring they circle in, the gap between turns in a brood, then each one's windup and lock, its dart's speed, how long its seam burns on, how long it's open, how many darts before it goes home, and the wait between them. */
const TEND = { rise: 1.4, ring: 4.5, turn: 0.55, wind: 0.75, lock: 0.45, speed: 34, burn: 1.3, open: 1.0, darts: 2, again: 1.6 };
const quick = (lv: Level) => 1 / (1 + Math.min(lv.spec.difficulty, 1.5) * 0.15);

/** A line tell from the enemy along its aim. */
function line(e: Enemy, len: number, w: number, lock: number, body = false): Tele {
  return { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * len, z2: e.z + Math.cos(e.aim) * len, w, lock, body };
}

/** Keep a tracking line tell on the enemy, following its aim until it locks. */
function track(lv: Level, e: Enemy, rate = 0.12) {
  const t = e.tele;
  if (!t || t.shape !== 'line') return;
  if (e.stateT < t.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), rate);
  const len = Math.hypot(t.x2 - t.x, t.z2 - t.z);
  t.x = e.x;
  t.z = e.z;
  t.x2 = e.x + Math.sin(e.aim) * len;
  t.z2 = e.z + Math.cos(e.aim) * len;
}

/** Leaving: off the top (or a side) and away. */
function leave(lv: Level, e: Enemy, dx = 0) {
  e.tele = null;
  e.d.away = (e.d.away ?? 0) + DT;
  moveTo(lv, e, e.x + dx * DT * Math.min(1, e.d.away * 2), sz(lv, e) - 24 * DT * Math.min(1, e.d.away * 1.5), true);
}

const ps = (lv: Level, p: Player) => p.z - lv.scroll;

/** How long a burrower takes to pour itself back down its hole (the view draws it going). */
export const BURROW_SINK = 0.45;

/** A ground vehicle to (x, ground z): up on the land (or the water) there. */
function drive(lv: Level, e: Enemy, x: number, zg: number, boat = false) {
  const t = lv.terrain;
  const h = boat ? t.water(zg) : Math.max(t.height(x, zg), t.water(zg));
  e.vx = (x - e.x) / DT;
  e.x = x;
  e.y = h;
  e.z = toFlight(zg, h);
}

/** The obstacle column standing at (x, ground z), if any (`pad`: the room it needs round it). */
function column(lv: Level, x: number, zg: number, pad: number) {
  for (const c of lv.terrain.colliders(x, zg, pad + 2)) if ((c.x - x) ** 2 + (c.z - zg) ** 2 < (c.r + pad) ** 2) return c;
  return null;
}

/** The road through ground z nearest x (a dry wash, a track: what a laid-out place drives along), if any. */
export function road(lv: Level, x: number, zg: number): Route | null {
  let best: Route | null = null;
  let far = Infinity;
  for (const rt of lv.terrain.routes(zg)) {
    // (the water's for boats and the glass for skaters: no truck drives either)
    if (rt.kind === 'water' || rt.kind === 'glass' || zg > rt.pts[0].z || zg < rt.pts[rt.pts.length - 1].z) continue;
    const d = Math.abs(routeX(rt, zg) - x);
    if (d < far) {
      far = d;
      best = rt;
    }
  }
  return best;
}

/** The water route through ground z nearest x (a channel, an aisle: what an eel swims along), if any. */
export function channel(lv: Level, x: number, zg: number): Route | null {
  let best: Route | null = null;
  let far = Infinity;
  for (const rt of lv.terrain.routes(zg)) {
    if (rt.kind !== 'water' || zg > rt.pts[0].z || zg < rt.pts[rt.pts.length - 1].z) continue;
    const d = Math.abs(routeX(rt, zg) - x);
    if (d < far) {
      far = d;
      best = rt;
    }
  }
  return best;
}

/** The glass gutter through ground z nearest x (a gunship's walk fused into one channel: what a skater rides), if any. */
export function gutter(lv: Level, x: number, zg: number): Route | null {
  let best: Route | null = null;
  let far = Infinity;
  for (const rt of lv.terrain.routes(zg)) {
    if (rt.kind !== 'glass' || zg > rt.pts[0].z || zg < rt.pts[rt.pts.length - 1].z) continue;
    const d = Math.abs(routeX(rt, zg) - x);
    if (d < far) {
      far = d;
      best = rt;
    }
  }
  return best;
}

/**
 * A Glass Skater's run: how fast it skates down its gutter (ground units a second, on top of the
 * land going by), how it bleeds speed through the luff, the slew and the slide, how far it slews,
 * and the rake it fires down the gutter out of its downhill flank (shots a volley, the fan's step).
 */
export const SKATE = { run: 11, luff: 6, slide: 3, slew: 1.35, volleys: 2, fan: 5, step: 0.17 };

/**
 * The Mire Eel's body: how many segments trail its head and how far apart (ground units, back down
 * its channel), how long it swims under between surfacings, and how far ahead of you it keeps.
 */
export const EEL = { segs: 10, gap: 2.3, under: 2.2, ahead: 20 };

/** Where an eel's segment k lies (its head is -1): x, ground z (k from the head back down its channel). */
export function eelAt(lv: Level, e: Enemy, k: number): [number, number] {
  const zg = (e.d.tz ?? fromFlight(e.z, e.y)) + (k + 1) * EEL.gap;
  const rt = channel(lv, e.x, zg);
  return [rt ? routeX(rt, zg) : e.x, zg];
}

/** Is there water to float on at (x, ground z)? */
export const afloat = (lv: Level, x: number, zg: number) => lv.terrain.height(x, zg) < lv.terrain.water(zg) - 0.25;

/** Fire a row of shots out of a hull's flank: `side` 1 to its right (of its heading), -1 to its left. */
/** (its speed is the wall family's, at a line foe's share: see volleys.ts) */
function broadside(lv: Level, e: Enemy, side: number, ports: number, spacing: number, spread: number) {
  const speed = pattern(lv, e, 'wall', SHARE.mid).speed;
  const out = e.heading - side * (Math.PI / 2);
  const fx = Math.sin(e.heading);
  const fz = Math.cos(e.heading);
  for (let k = 0; k < ports; k++) {
    const off = (k - (ports - 1) / 2) * spacing;
    const a = out + (lv.rand() - 0.5) * spread;
    lv.shoot(e.x + fx * off + Math.sin(out) * e.r * 0.6, e.z + fz * off + Math.cos(out) * e.r * 0.6, a, speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
  }
  lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
}

/** Which flank of it faces you (1: its right). */
const flank = (lv: Level, e: Enemy) => (Math.sin(lv.aim(e.x, e.z) - e.heading) < 0 ? 1 : -1);

/** Does it run into the land or an obstacle here? */
function crashes(lv: Level, e: Enemy) {
  if (lv.terrain.solid(e.x, e.z, 0)) return true;
  for (const c of lv.terrain.colliders(e.x, e.z, 3)) if ((c.x - e.x) ** 2 + (c.z - e.z) ** 2 < (c.r + e.r * 0.5) ** 2) return true;
  return false;
}

/**
 * The scraplings' formations: classic popcorn paths, each a string of them on one path (or a V, or
 * a column that peels apart), in shapes you can sweep.
 *  - snake:   down the screen in an S
 *  - sweep:   in from a side, across in a shallow bow, out the other side
 *  - hook:    down a side lane, a U-turn across towards you, and back up and away
 *  - loop:    down, one full loop, and on down off the bottom
 *  - vee:     a V straight down, its wings splitting off to the sides
 *  - peel:    a column down the middle, each one peeling off left or right in turn
 *  - retreat: down to near your row, then back up and away the way it came
 */
export type Form = 'snake' | 'sweep' | 'hook' | 'loop' | 'vee' | 'peel' | 'retreat';

/** Where a scrapling of its formation is, `t` seconds along its path (screen x, s). */
function formation(d: Enemy['d'], t: number): [number, number] {
  const x0 = d.x0 ?? 0;
  const dir = d.dir ?? 1;
  const slot = d.slot ?? 0;
  const top = -HALF_H - 3;
  switch (d.form) {
    case 'sweep': {
      const span = 2 * (HALF_W + 4);
      const u = clamp((t * 22) / span, 0, 1.4);
      return [-dir * (HALF_W + 4) + dir * u * span, (d.sz0 ?? -16) + Math.sin(Math.min(u, 1) * Math.PI) * 7];
    }
    case 'hook':
    case 'loop': {
      const v = 18;
      const R = d.form === 'hook' ? 9 : 7;
      const s0 = d.sz0 ?? -8;
      const t1 = (s0 - top) / v;
      if (t < t1) return [x0, top + t * v];
      const a = ((t - t1) * v) / R;
      const turn = d.form === 'hook' ? Math.PI : 2 * Math.PI;
      if (a < turn) return [x0 + dir * R * (1 - Math.cos(a)), s0 + R * Math.sin(a)];
      const after = t - t1 - (turn * R) / v;
      // the hook climbs away on the far side; the loop carries on down
      return d.form === 'hook' ? [x0 + dir * 2 * R, s0 - after * v * 1.2] : [x0, s0 + after * v];
    }
    case 'vee': {
      const s = top + t * 13;
      const u = Math.max(0, s + 8);
      return [x0 + slot * 3.2 + Math.sign(slot) * u * u * 0.05, s];
    }
    case 'peel': {
      const v = 14;
      const s1 = -10;
      const t1 = (s1 - top) / v;
      if (t < t1) return [x0, top + t * v];
      const side = slot % 2 ? 1 : -1;
      const R = 10;
      const a = Math.min(((t - t1) * v) / R, Math.PI / 2);
      const on = Math.max(0, t - t1 - (Math.PI / 2) * (R / v));
      return [x0 + side * (R * (1 - Math.cos(a)) + on * v * 1.3), s1 + R * Math.sin(a)];
    }
    case 'retreat': {
      const v = 18;
      const s0 = d.sz0 ?? 0;
      const t1 = (s0 - top) / v;
      if (t < t1) return [x0, top + t * v];
      const b = t - t1;
      // a short rounded turn at the bottom, then up and away on a slant
      return [x0 + dir * b * 9, s0 + 3 * Math.sin(Math.min(b * 3, Math.PI)) - Math.max(0, b - 0.35) * 17];
    }
    default:
      return [x0 + dir * 11 * Math.sin(t * 1.5), top + t * 15];
  }
}

export function updateFoe(lv: Level, e: Enemy): void {
  const d = e.d;
  // an elite doesn't tire and leave: it stays till it's beaten (or a long while)
  if (e.elite && !e.bounty && e.t < 45) d.n = Math.min(d.n ?? 0, 1);
  const p = lv.nearest(e.x, e.z);
  const ok = live(lv, e);
  const s = sz(lv, e);
  const slow = e.stun > 0 ? 0.3 : 1;
  // a path's own clock, slowed by a stun where it is (see enemies.ts)
  if (e.stun > 0 && e.t > 0) d.lag = (d.lag ?? 0) + DT * (1 - slow);
  const pt = e.t - (d.lag ?? 0);
  switch (e.arch) {
    // --- the scrap popcorn ----------------------------------------------------------------------
    case 'scrapling': {
      // a string of them on one of the formations; only a leader shoots, and only later on: once,
      // a short flare and one slug
      const [x, fs] = formation(d, pt);
      moveTo(lv, e, x, fs);
      if (e.state === 'idle') {
        if (d.shots === 1 && ok && p && s > -16 && s < -2 && ps(lv, p) - s > 10) {
          d.shots = 2;
          e.aim = lv.aim(e.x, e.z);
          go(lv, e, 'windup', 0.5 * quick(lv), 'burst', line(e, 24, 0.4, 0.3 * quick(lv)));
        }
      } else if (e.state === 'windup') {
        track(lv, e, 0.2);
        if (over(e)) {
          lv.shoot(e.x, e.z, e.aim, pattern(lv, e, 'burst', SHARE.light).speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          go(lv, e, 'recover', 0.4);
        }
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'potshot': {
      // drops in to a spot, stops, flares and takes its shot (two, later on), sits a moment
      // exposed, then runs off up the side it's on
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -12;
      if ((d.n ?? 0) >= 1 && e.state === 'idle') {
        leave(lv, e, Math.sign(e.x || 1) * 14);
        break;
      }
      if (e.t < 0.9) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 0.9)), lerp(-HALF_H - 4, hz, smooth(e.t / 0.9)));
        e.aim = lv.aim(e.x, e.z);
        e.heading = 0;
        break;
      }
      if (e.state === 'idle') {
        ease(lv, e, hx, hz, 4, 10);
        e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.15);
        e.heading = lerpAngle(e.heading, e.aim, 0.1);
        if (e.stateT > (d.phase ?? 0.3) && ok && p && ps(lv, p) - s > 8) go(lv, e, 'windup', 0.7 * quick(lv), 'burst', line(e, 30, 0.5, 0.45 * quick(lv)));
      } else if (e.state === 'windup') {
        track(lv, e, 0.15);
        e.heading = e.aim;
        // a kick back as it braces
        moveTo(lv, e, e.x - Math.sin(e.aim) * 1.2 * DT, s - Math.cos(e.aim) * 1.2 * DT, true);
        if (over(e)) {
          d.shots = 0;
          d.fire = 0;
          go(lv, e, 'attack', 0.4, 'burst');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        const k = pattern(lv, e, 'burst', SHARE.light);
        if (d.fire <= 0 && (d.shots ?? 0) < Math.min(lv.spec.difficulty >= 0.5 ? 2 : 1, k.burst)) {
          d.fire = Math.max(0.18, k.gap);
          d.shots = (d.shots ?? 0) + 1;
          lv.shoot(e.x, e.z, e.aim, k.speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          // the recoil
          moveTo(lv, e, e.x - Math.sin(e.aim) * 0.6, s - Math.cos(e.aim) * 0.6, true);
        }
        if (over(e)) go(lv, e, 'recover', 0.9);
      } else if (over(e)) {
        d.n = 1;
        go(lv, e, 'idle');
      }
      break;
    }
    case 'raker': {
      // across the top third in a string; as it comes over you it flares and drops one slug
      // straight down, leading you by where it'll be
      const dir = d.dir ?? 1;
      const x = -dir * (HALF_W + 4) + dir * pt * 20;
      moveTo(lv, e, x, (d.sz0 ?? -16) + Math.sin(pt * 2 + (d.phase ?? 0)) * 0.8);
      e.heading = (dir * Math.PI) / 2;
      e.aim = 0;
      if (e.state === 'idle') {
        const lead = e.x + dir * 20 * 0.35;
        if (!d.shots && ok && p && Math.abs(p.x - lead) < 3 && ps(lv, p) - s > 8)
          go(lv, e, 'windup', 0.35 * quick(lv), 'burst', { shape: 'line', x: e.x, z: e.z, x2: e.x, z2: e.z + 26, w: 0.5, lock: 0 });
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'line') {
          t.x = t.x2 = e.x;
          t.z = e.z;
          t.z2 = e.z + 26;
        }
        if (over(e)) {
          d.shots = 1;
          lv.shoot(e.x, e.z + 0.8, 0, pattern(lv, e, 'burst', SHARE.mid).speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          go(lv, e, 'recover', 0.6);
        }
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    // --- scrappers ------------------------------------------------------------------------
    case 'ramjack': {
      // hovers, lines up (a line that locks), lunges, brakes near you and sits there spinning
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -14;
      if ((d.n ?? 0) >= 3 && e.state === 'idle') {
        leave(lv, e);
        break;
      }
      if (e.t < 1.2 && !d.n) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.2)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.2)));
        e.aim = lv.aim(e.x, e.z);
        break;
      }
      if (e.state === 'idle') {
        // climbing back: across first if it's down among you
        ease(lv, e, hx, s > 0 && Math.abs(e.x - hx) > 3 ? s : hz, 3, 14);
        e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.1);
        e.heading = e.aim;
        // it only lunges down at you, never across: from above, with room to get out of the way
        const down = p && Math.abs(lv.aim(e.x, e.z)) < 0.9 && ps(lv, p) - s > 10 && Math.abs(p.x) < HALF_W - 5;
        // an elite on a chain goes again from where it is
        const again = e.elite && (d.combo ?? 0) > 0 && p && ps(lv, p) - s > 7 && Math.abs(lv.aim(e.x, e.z)) < 1.1;
        if (e.stateT > 0.35 && ok && p && ((down && Math.abs(s - hz) < 3) || again)) {
          const len = clamp(Math.hypot(p.x - e.x, p.z - e.z) + 8, 20, 44);
          d.len = len;
          go(lv, e, 'windup', 0.85 * quick(lv), 'lunge', line(e, len, e.r * 1.5, 0.5 * quick(lv), true));
        }
      } else if (e.state === 'windup') {
        track(lv, e);
        e.heading = e.aim;
        // rocking back on its haunches
        moveTo(lv, e, e.x - Math.sin(e.aim) * 2 * DT, s - Math.cos(e.aim) * 2 * DT, true);
        if (over(e)) {
          d.gone = 0;
          go(lv, e, 'attack', 0, 'lunge');
        }
      } else if (e.state === 'attack') {
        const sp = 40 * slow;
        moveTo(lv, e, e.x + Math.sin(e.aim) * sp * DT, s + Math.cos(e.aim) * sp * DT, true);
        e.heading = e.aim;
        d.gone = (d.gone ?? 0) + sp * DT;
        if (crashes(lv, e)) {
          // into the rocks: dazed, and hurt
          lv.emit({ type: 'strike', kind: 'crash', x: e.x, z: e.z, r: e.r });
          lv.damage(e, e.max * 0.3, -1, false);
          go(lv, e, 'stagger', 1.8);
        } else if (d.gone >= (d.len ?? 30) || s > HALF_H - 3 || Math.abs(e.x) > HALF_W - 2) go(lv, e, 'recover', 1.1);
      } else {
        // spinning out, exposed: then back up to line up again
        e.vx *= 0.9;
        e.vz *= 0.9;
        e.heading += DT * 9 * (1 - e.stateT / Math.max(e.stateDur, 0.1));
        moveTo(lv, e, clamp(e.x + e.vx * DT * 0.3, -HALF_W + 2, HALF_W - 2), s - 1.5 * DT, true);
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          // back up the side it's on, not through you
          d.hx = clamp(e.x + (e.x > (p?.x ?? 0) ? 6 : -6) + (lv.rand() - 0.5) * 6, -HALF_W + 6, HALF_W - 6);
          d.hz = -16 + lv.rand() * 4;
          go(lv, e, 'idle');
        }
      }
      break;
    }
    case 'rattler': {
      // a chaser from behind: faster than the level, so it gains unless you boost
      const ph = d.ph ?? 0;
      if (ph === 0) {
        // waiting under the screen: a chevron at the bottom edge
        if (e.state !== 'windup') go(lv, e, 'windup', 1.0, 'ram', { shape: 'edge', x: e.x, z: lv.bottom });
        const tx = p ? p.x : e.x;
        moveTo(lv, e, e.x + clamp(tx - e.x, -6, 6) * DT, HALF_H + 5, true);
        const t = e.tele;
        if (t && t.shape === 'edge') {
          t.x = e.x;
          t.z = lv.bottom;
        }
        if (over(e)) {
          d.ph = 1;
          go(lv, e, 'attack', 0, 'ram');
        }
        e.heading = Math.PI;
        break;
      }
      if (ph === 1) {
        const chase = lv.speed * 1.45;
        // in a fight the screen keeps its pace and boost moves the ship: count the target's boost
        const ds = lv.speedNow - chase + (!p ? 0 : p.boosting * lv.speed * 0.9);
        const tx = p ? p.x : e.x;
        moveTo(lv, e, e.x + clamp(tx - e.x, -9, 9) * DT * 1.5, s + ds * DT, true);
        e.heading = Math.PI;
        e.aim = Math.PI;
        if (s > HALF_H + 9 && e.stateT > 1) {
          // left behind: it spins out into the dust
          const q = p ?? lv.players[0];
          lv.emit({ type: 'outran', id: q.id, enemy: e.id });
          q.burn = Math.min(1, q.burn + 0.1);
          e.scrap = 1;
          lv.kill(e, q.id);
          break;
        }
        if (p && ok && s - ps(lv, p) > 0 && s - ps(lv, p) < 7 && Math.abs(e.x - p.x) < 4) {
          d.ph = 2;
          go(lv, e, 'windup', 0.35, 'ram', line(e, 14, e.r * 1.4, 0, true));
        }
        break;
      }
      if (ph === 2) {
        moveTo(lv, e, e.x, s + (lv.speedNow - lv.speed * 1.45) * DT, true);
        track(lv, e, 0);
        if (over(e)) {
          d.ph = 3;
          go(lv, e, 'attack', 0.5, 'ram');
        }
        break;
      }
      if (ph === 3) {
        moveTo(lv, e, e.x, s - 30 * slow * DT, true);
        if (over(e)) {
          d.ph = 4;
          go(lv, e, 'recover', 2.5);
        }
        break;
      }
      if (ph === 4) {
        // the brake-check: sits in front of you, in your way, open to fire
        if (p) ease(lv, e, e.x + clamp(p.x - e.x, -3, 3), ps(lv, p) - 9, 2.5, 12);
        e.heading = lerpAngle(e.heading, 0, 0.1);
        if (over(e)) {
          d.ph = 5;
          go(lv, e, 'idle');
        }
        break;
      }
      leave(lv, e);
      break;
    }
    case 'hookjaw': {
      // hangs at a side and harpoons you: hooked, you're reeled in until you dash free
      const side = d.dir ?? 1;
      const hx = side * (HALF_W - 6);
      const hz = d.hz ?? -6;
      if (e.t < 1.4) {
        moveTo(lv, e, lerp(side * (HALF_W + 5), hx, smooth(e.t / 1.4)), hz);
        e.aim = lv.aim(e.x, e.z);
        e.heading = e.aim;
        break;
      }
      if (e.grab >= 0) {
        const q = lv.players[e.grab];
        if (!q || q.down) {
          release(lv, e, false);
          break;
        }
        // reeling in
        d.held = (d.held ?? 0) + DT;
        const dx = e.x - q.x;
        const dz = e.z - q.z;
        const dl = Math.hypot(dx, dz) || 1;
        q.x += (dx / dl) * HOOK.reel * DT;
        q.z += (dz / dl) * HOOK.reel * DT;
        q.vx *= 0.85;
        q.vz *= 0.85;
        e.aim = Math.atan2(-dx, -dz);
        e.heading = e.aim;
        d.taut = Math.max(0, (d.taut ?? 0) - DT);
        // only a dash that pulls against the line snaps it: across it, or towards the hookjaw, the line
        // jerks taut, cuts the dash short and yanks you back a little (and the reel goes on)
        if (q.dashT > 0 && (q.dashX * -dx + q.dashZ * -dz) / dl > HOOK.snap) release(lv, e, true);
        else if (q.dashT > 0 && d.held > 0.15) {
          q.dashT = Math.min(q.dashT, 0.001);
          q.x += (dx / dl) * HOOK.yank;
          q.z += (dz / dl) * HOOK.yank;
          d.taut = 0.4;
          lv.emit({ type: 'hookStrain', id: q.id, enemy: e.id, x: q.x, z: q.z, dx: dx / dl, dz: dz / dl });
        } else if (dl < 3 + e.r || d.held > HOOK.hold) {
          lv.hurt(q, q.x, q.z, 'harpoon');
          release(lv, e, false);
        }
        break;
      }
      if ((d.n ?? 0) >= 4 || (e.t > 17 && !e.elite)) {
        leave(lv, e, side * 16);
        break;
      }
      moveTo(lv, e, hx + Math.sin(e.t * 0.7) * 1.2, hz + Math.sin(e.t * 0.9) * 2);
      if (e.state === 'idle') {
        e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.08);
        e.heading = e.aim;
        if (e.stateT > 1.1 && ok) go(lv, e, 'windup', 0.9 * quick(lv), 'harpoon', line(e, 50, 0.6, 0.6 * quick(lv)));
      } else if (e.state === 'windup') {
        // it leads you: keep flying the same way and the iron meets you; turn after the line locks
        if (p && e.tele?.shape === 'line' && e.stateT < e.tele.lock) {
          const fly = (e.stateDur - e.stateT + Math.hypot(p.x - e.x, p.z - e.z) / HOOK.speed) * HOOK.lead;
          e.aim = lerpAngle(e.aim, Math.atan2(p.x + p.vx * fly - e.x, p.z + p.vz * fly - e.z), 0.12);
        }
        track(lv, e, 0);
        e.heading = e.aim;
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          strike(lv, 'harpoon', e.x, e.z, { vx: Math.sin(e.aim) * HOOK.speed, vz: Math.cos(e.aim) * HOOK.speed, active: 1.3, warn: 0, owner: e.id, effect: 'latch', air: true, color: e.skin.colors[2] });
          go(lv, e, 'attack', 0, 'harpoon');
        }
      } else if (e.state === 'attack') {
        // the line's out: if it comes back empty, it has to wind it in
        if (!lv.strikes.some((k) => k.owner === e.id && k.kind === 'harpoon')) go(lv, e, 'recover', 1.2);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'rigger': {
      // a torpedo rig: locks on to you (brackets close in), then lets go a pair of torpedoes that
      // chase you until their fuel's out. Turn hard, dash through them, or shoot them down; it's
      // open while it reloads
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -17;
      if (e.t < 1.6) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.6)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.6)));
        e.aim = lv.aim(e.x, e.z);
        e.heading = e.aim;
        break;
      }
      if (((d.n ?? 0) >= 3 || (e.t > 20 && !e.elite)) && e.state !== 'windup') {
        leave(lv, e, (hx < 0 ? -1 : 1) * 10);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.45) * 7, hz + Math.sin(e.t * 0.8) * 1.5, 1.5, 6);
      e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.06);
      e.heading = e.aim;
      if (e.state === 'idle') {
        if (e.stateT > (d.n ? 2.2 : 1.2) && ok && p) {
          d.prey = p.id;
          go(lv, e, 'windup', 1.15 * quick(lv), 'torpedo', { shape: 'lock', id: p.id });
        }
      } else if (e.state === 'windup') {
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          // out to the sides first, so they come at you from two angles
          const n = lv.spec.difficulty > 0.9 ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const side = n === 2 ? (k ? 1 : -1) : k - 1;
            const px = Math.cos(e.aim);
            const pz = -Math.sin(e.aim);
            lv.bullet(e.x + px * side * 1.4, e.z + pz * side * 1.4, e.aim + side * 1.25, 9, {
              kind: 'torpedo',
              r: 0.55,
              life: TORPEDO.life,
              seek: d.prey ?? 0,
              color: e.skin.colors[2],
              look: lookOf(lv, e),
            });
          }
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          go(lv, e, 'attack', 0.3, 'torpedo');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.8);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'ace': {
      // a rival: overtakes you, sits in your line, shoots in short bursts and rolls away from your fire
      if (!p) break;
      const py = ps(lv, p);
      d.rollCd = Math.max(0, (d.rollCd ?? 0) - DT);
      d.heat = e.hitT < 0.12 ? (d.heat ?? 0) + DT : Math.max(0, (d.heat ?? 0) - DT * 2);
      if (e.t < 1.6) {
        // coming past you from behind
        const side = d.dir ?? 1;
        moveTo(lv, e, lerp(p.x + side * 7, p.x + side * 3, smooth(e.t / 1.6)), lerp(HALF_H + 4, py - 10, smooth(e.t / 1.6)));
        e.heading = 0;
        break;
      }
      const life = e.bounty?.life ?? 22;
      if (e.t > life - 1.5 && !e.bounty) {
        leave(lv, e);
        break;
      }
      if (e.t > life - 1.5) {
        // a bounty bolting: up and away before it's gone
        moveTo(lv, e, e.x, s - 30 * DT, true);
        break;
      }
      // the race: when you boost harder than it can, you pass it
      const push = Math.max(0, lv.speedNow - lv.speed * 1.35 + (!p ? 0 : p.boosting * lv.speed * 0.6));
      if (e.state === 'dodge') {
        e.shielded = true;
        moveTo(lv, e, clamp(e.x + (d.rollDir ?? 1) * 18 * DT, -HALF_W + 3, HALF_W - 3), s + push * DT, true);
        e.heading += DT * 14;
        if (over(e)) {
          d.rollCd = 2.5;
          go(lv, e, 'recover', 0.9);
        }
        break;
      }
      const tx = clamp(p.x, -HALF_W + 4, HALF_W - 4);
      const ts = clamp(py - 10, -HALF_H + 5, 4);
      const cs = s;
      moveTo(lv, e, e.x + clamp(tx - e.x, -10, 10) * DT * (e.state === 'recover' ? 0.4 : 1), cs + (clamp((ts - cs) * 2, -8, 8) + push) * DT, true);
      e.heading = lerpAngle(e.heading, 0, 0.2);
      if (s > py + 4) {
        d.passed = (d.passed ?? 0) + DT;
        if (d.passed > 0.8) {
          lv.emit({ type: 'overtake', enemy: e.id, by: p.id });
          lv.kill(e, p.id);
          break;
        }
      } else d.passed = 0;
      if (e.state === 'idle') {
        e.aim = lv.aim(e.x, e.z);
        d.fire = (d.fire ?? 1.6) - DT;
        if ((d.heat ?? 0) > 0.4 && d.rollCd <= 0) {
          d.rollDir = e.x > p.x ? 1 : -1;
          if (Math.abs(e.x + d.rollDir * 8) > HALF_W - 4) d.rollDir = -d.rollDir;
          d.heat = 0;
          go(lv, e, 'dodge', 0.45);
        } else if (d.fire <= 0 && ok) go(lv, e, 'windup', 0.5 * quick(lv), 'burst', line(e, 30, 0.5, 0.3));
      } else if (e.state === 'windup') {
        track(lv, e, 0.2);
        if (over(e)) {
          d.shots = 0;
          d.fire = 0;
          go(lv, e, 'attack', 0, 'burst');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0) {
          const k = pattern(lv, e, 'burst', SHARE.heavy);
          lv.shoot(e.x, e.z, e.aim, k.speed, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
          d.shots = (d.shots ?? 0) + 1;
          d.fire = Math.max(0.1, k.gap);
          if (d.shots >= Math.min(3, k.burst)) {
            d.fire = 2.6;
            go(lv, e, 'idle');
          }
        }
      } else if (e.state === 'recover' && over(e)) go(lv, e, 'idle');
      break;
    }
    case 'flakker': {
      // ground artillery: shells onto markers where you'll be on the screen (boost, and they land behind)
      e.heading = lerpAngle(e.heading, lv.aim(e.x, e.z), 0.08);
      e.aim = e.heading;
      if (!ok || s > HALF_H - 10 || !p) break;
      if (e.state === 'idle') {
        if (e.stateT > 1.6 / (1 + lv.spec.difficulty * 0.3)) {
          d.tx = p.x + p.vx * 0.3;
          d.tz = p.z - lv.speedNow * 1.3;
          go(lv, e, 'windup', 0.5, 'shell', { shape: 'circle', x: d.tx, z: d.tz, r: 2.6, ground: true });
        }
      } else if (e.state === 'windup') {
        if (over(e)) {
          const n = lv.spec.difficulty > 0.4 ? 3 : 2;
          for (let k = 0; k < n; k++) {
            const off = k === 0 ? 0 : (k === 1 ? -1 : 1) * 5.5;
            const warn = 1.3 + k * 0.25;
            strike(lv, 'shell', p.x + p.vx * 0.3 + off, p.z - lv.speedNow * warn, { r: 2.6, warn, active: 0.15, sx: e.x, sz: e.z, owner: e.id, color: e.skin.colors[2] });
          }
          go(lv, e, 'attack', 0.2, 'shell');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.6);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    // --- the wilds ------------------------------------------------------------------------
    case 'swooper': {
      // circles high, screeches, its shadow marks you, and it dives through the mark
      const hx = d.hx ?? 0;
      const hz = -18;
      if ((d.n ?? 0) >= 4 && e.state === 'idle') {
        leave(lv, e);
        break;
      }
      if (e.state === 'idle') {
        d.a = (d.a ?? d.phase ?? 0) + DT * 1.6;
        const tx = hx + Math.cos(d.a) * 5;
        const ts = hz + Math.sin(d.a) * 3;
        if (e.t < 1.4 && !d.n) moveTo(lv, e, lerp(d.x0 ?? hx, tx, smooth(e.t / 1.4)), lerp(-HALF_H - 4, ts, smooth(e.t / 1.4)));
        else ease(lv, e, tx, ts, 4, 20);
        if (e.stateT > 1.2 + (d.phase ?? 0) * 0.3 && ok && p && e.t > 1.4) {
          go(lv, e, 'windup', 1.1 * quick(lv), 'dive', { shape: 'circle', x: p.x, z: p.z, r: 2.2, ground: false });
        }
      } else if (e.state === 'windup') {
        const t = e.tele;
        // the shadow follows you, then holds
        if (t && t.shape === 'circle') {
          if (p && e.stateT < 0.55 * quick(lv)) {
            d.tx = p.x;
            d.ts = ps(lv, p);
          }
          t.x = d.tx ?? t.x;
          t.z = lv.scroll + (d.ts ?? 0);
        }
        ease(lv, e, e.x, s - 2, 2, 6);
        if (over(e)) {
          d.x0d = e.x;
          d.s0 = s;
          d.side = e.x > (d.tx ?? 0) ? 1 : -1;
          // a dive you can follow: about 36 units/s, whatever the distance
          d.len = clamp(Math.hypot((d.tx ?? 0) - e.x, (d.ts ?? 0) - s) / 36, 0.6, 1.1);
          go(lv, e, 'attack', d.len * 1.35, 'dive');
        }
      } else if (e.state === 'attack') {
        const u = e.stateT / (d.len ?? 0.6);
        const x0 = d.x0d ?? 0;
        const s0 = d.s0 ?? -18;
        const tx = d.tx ?? 0;
        const ts = (d.ts ?? 0) - 0; // screen space: the mark rides the screen
        // a curving dive: out to one side, through the mark, on past it
        const cx = (x0 + tx) / 2 + (d.side ?? 1) * 3.5;
        const cs = (s0 + ts) / 2;
        let x: number;
        let y: number;
        if (u <= 1) {
          x = (1 - u) ** 2 * x0 + 2 * (1 - u) * u * cx + u * u * tx;
          y = (1 - u) ** 2 * s0 + 2 * (1 - u) * u * cs + u * u * ts;
        } else {
          const k = (u - 1) * 0.35;
          x = tx + (tx - cx) * k;
          y = ts + (ts - cs) * k;
        }
        const t = e.tele;
        if (u > 1) e.tele = null;
        else if (t && t.shape === 'circle') t.z = lv.scroll + ts;
        moveTo(lv, e, clamp(x, -HALF_W + 1, HALF_W - 1), Math.min(y, HALF_H - 1));
        if (over(e)) go(lv, e, 'recover', 1.3);
      } else {
        // climbing out, heavy and slow
        ease(lv, e, hx, hz, 1, 9);
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          go(lv, e, 'idle');
        }
      }
      break;
    }
    case 'burrower': {
      // under the ground (untouchable), a ripple coming for you: then it erupts
      if (e.state === 'idle' && e.t < 0.1) go(lv, e, 'hidden', 1.8);
      // (going back down its hole it's still there to be shot, and it doesn't move)
      const sinking = e.state === 'hidden' && e.stateT < BURROW_SINK && (d.n ?? 0) > 0;
      if (sinking) {
        e.shielded = false;
        moveTo(lv, e, e.x, s, true);
        break;
      }
      if ((d.n ?? 0) >= 3 && (e.state === 'hidden' || e.state === 'idle')) {
        e.shielded = true;
        e.y = 1;
        leave(lv, e);
        break;
      }
      if (e.state === 'hidden') {
        e.shielded = true;
        e.y = 1;
        if (p) ease(lv, e, p.x, ps(lv, p), 1.2, 9);
        else ease(lv, e, e.x, s, 1);
        if (over(e) && ok && p) go(lv, e, 'windup', 0.8 * quick(lv), 'erupt', { shape: 'circle', x: e.x, z: e.z, r: 2.6, ground: false });
      } else if (e.state === 'windup') {
        e.shielded = true;
        e.y = 2;
        moveTo(lv, e, e.x, s, true);
        if (over(e)) {
          strike(lv, 'slam', e.x, e.z, { r: 2.6, warn: 0, active: 0.25, air: true, owner: e.id, color: e.skin.colors[2] });
          strike(lv, 'wave', e.x, e.z, { v: 13, w: 1, rMax: 18, warn: 0.05, active: 2, air: true, owner: e.id, color: e.skin.colors[2] });
          go(lv, e, 'attack', 0.2, 'erupt');
        }
      } else if (e.state === 'attack') {
        e.y = FLIGHT_Y - 1;
        moveTo(lv, e, e.x, s, true);
        if (over(e)) go(lv, e, 'recover', 2.4);
      } else {
        // up, exposed, then back under
        e.y = FLIGHT_Y - 1;
        moveTo(lv, e, e.x, s, true);
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          go(lv, e, 'hidden', 1.6 + BURROW_SINK);
        }
      }
      break;
    }
    case 'eel': {
      // a Tonkva channel-keeper, the bloom grown over its back: it swims up its channel under the
      // water, keeping ahead of you (untouchable, its back breaking the surface); it surfaces, its
      // back arching out of the water and the sacs on it swelling; then it fires out of both flanks
      // down its length, head to tail, a fence of spores slanting back at you; it lies out on the
      // water, open; it sinks and goes on. After three it swims off up its channel.
      const t = lv.terrain;
      let zg = d.tz ?? fromFlight(e.z, e.y);
      const water = t.water(zg);
      if (e.state === 'idle' && e.t < 0.1) go(lv, e, 'hidden', EEL.under * 0.6);
      const rt = channel(lv, e.x, zg);
      // off its channel's end, or done: it goes, under and away ahead
      if (!rt && e.state === 'hidden') d.n = 3;
      const gone = (d.n ?? 0) >= 3 && e.state === 'hidden';
      e.shielded = e.state === 'hidden';
      // a stretch ahead of you up its channel; surfaced, it barely swims (and drifts down to you)
      const pz = p ? fromFlight(p.z, water) : zg;
      const want = pz - (gone ? 80 : EEL.ahead);
      const lim = e.state === 'hidden' ? lv.speedNow + 9 : lv.speedNow * 0.45;
      zg += clamp((want - zg) * 2, -lim, lim) * DT * slow;
      d.tz = zg;
      const x = rt ? routeX(rt, zg) : e.x;
      e.heading = Math.PI + clamp((x - e.x) * 2, -0.6, 0.6);
      e.vx = (x - e.x) / DT;
      e.x = lerp(e.x, x, 0.2);
      e.y = water;
      e.z = toFlight(zg, water);
      // its tail, for what hits it (see Level.updateShots): the body lies back down the channel
      const [tx, tz] = eelAt(lv, e, EEL.segs - 1);
      d.bx = tx;
      d.bz = toFlight(tz, water);
      if (gone) break;
      const deep = (k: number) => {
        const [sx, sz2] = eelAt(lv, e, k);
        return t.height(sx, sz2) < water - 0.15;
      };
      if (e.state === 'hidden') {
        // (it comes up only on open water, on the screen, ahead of you)
        if (over(e) && ok && p && s < -4 && s > -HALF_H + 3 && deep(-1) && deep(4) && deep(EEL.segs - 1)) {
          d.side = Math.sign(p.x - e.x) || 1;
          const [mx, mz] = eelAt(lv, e, EEL.segs / 2);
          const out = d.side * (Math.PI / 2 - 0.3);
          go(lv, e, 'windup', 1.1 * quick(lv), 'broadside', { shape: 'sweep', x: mx, z: toFlight(mz, water), a0: out - 0.45, a1: out + 0.45, len: 34, w: 0 });
        }
      } else if (e.state === 'windup') {
        const tl = e.tele;
        if (tl && tl.shape === 'sweep') {
          const [mx, mz] = eelAt(lv, e, EEL.segs / 2);
          tl.x = mx;
          tl.z = toFlight(mz, water);
        }
        if (over(e)) {
          // the head spits first, at you; then the flanks, down the body
          if (p) {
            const a = lv.aim(e.x, e.z);
            const k = pattern(lv, e, 'fan', SHARE.mid);
            volleyFan(lv, e.x, e.z, a, { n: Math.min(3, k.n), arc: 0.44, speed: k.speed }, { color: e.skin.colors[2], look: lookOf(lv, e) });
          }
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          d.k = 0;
          d.fire = 0.12;
          go(lv, e, 'attack', 0.9, 'broadside');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        while (d.fire <= 0 && (d.k ?? 0) < EEL.segs) {
          d.fire += 0.08;
          const [sx, sz2] = eelAt(lv, e, d.k ?? 0);
          const fz = toFlight(sz2, water);
          const v = pattern(lv, e, 'wall', SHARE.mid).speed;
          for (const side of [-1, 1]) lv.shoot(sx, fz, side * (Math.PI / 2 - 0.3), v, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: sx, z: fz, color: e.skin.colors[2], look: lookOf(lv, e) });
          d.k = (d.k ?? 0) + 2;
        }
        if (over(e)) go(lv, e, 'recover', 1.9);
      } else if (over(e)) {
        d.n = (d.n ?? 0) + 1;
        go(lv, e, 'hidden', EEL.under);
      }
      break;
    }
    case 'spitter': {
      // ground: lobs acid that lands as a puddle on the land in front of you
      e.heading = lerpAngle(e.heading, lv.aim(e.x, e.z), 0.08);
      e.aim = e.heading;
      if (!ok || s > HALF_H - 10 || !p) break;
      if (e.state === 'idle') {
        if (e.stateT > 1.8 / (1 + lv.spec.difficulty * 0.3)) go(lv, e, 'windup', 0.7, 'spit', { shape: 'circle', x: p.x, z: p.z - lv.speedNow * 1.1, r: 2.2, ground: true });
      } else if (e.state === 'windup') {
        if (over(e)) {
          const n = lv.spec.difficulty > 0.6 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const warn = 1.1 + k * 0.3;
            strike(lv, 'acid', p.x + (k ? (lv.rand() < 0.5 ? -6 : 6) : 0), p.z - lv.speedNow * warn, { r: 2.2, warn, active: 0, sx: e.x, sz: e.z, owner: e.id, color: e.skin.colors[2] });
          }
          go(lv, e, 'attack', 0.2, 'spit');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.4);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    // --- the lattice ----------------------------------------------------------------------
    case 'warden': {
      // a shield in front; it drops it to fire, and enough fire into it cracks it (see wearGuard)
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -12;
      if (e.t < 1.6) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.6)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.6)));
        e.aim = lv.aim(e.x, e.z);
        e.guard = 0.7;
        break;
      }
      if (e.t > (d.stay ?? 10) && e.state === 'idle') {
        e.guard = 0.7;
        leave(lv, e);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.5) * 3, hz, 2, 6);
      e.heading = e.aim;
      if (e.state === 'idle' || e.state === 'windup') {
        e.aim = turn(e.aim, lv.aim(e.x, e.z), 0.5);
        e.guard = 0.7;
      }
      if (e.state === 'idle') {
        if (e.stateT > 2 && ok) go(lv, e, 'windup', 1.0, 'bar', line(e, 40, 6, 1.0));
      } else if (e.state === 'windup') {
        track(lv, e, 0);
        if (over(e)) {
          e.guard = 0;
          lv.emit({ type: 'crack', enemy: e.id, x: e.x, z: e.z });
          // a bar: five abreast, square to its aim
          const px = Math.cos(e.aim);
          const pz = -Math.sin(e.aim);
          // (as a wall's row: no tighter than its spacing, its speed)
          const w = pattern(lv, e, 'wall', SHARE.heavy);
          const gap = Math.max(1.3, w.spacing);
          for (let k = -2; k <= 2; k++) lv.shoot(e.x + px * k * gap, e.z + pz * k * gap, e.aim, w.speed, { color: e.skin.colors[2], kind: 'needle', r: 0.4, look: lookOf(lv, e) });
          go(lv, e, 'attack', 0.3, 'bar');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.6);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'prism': {
      // closed it throws your shots back; it opens to sweep a beam, and that's when it's soft
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -15;
      if (e.t < 1.6) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.6)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.6)));
        break;
      }
      if (e.t > (d.stay ?? 14) && e.state === 'idle') {
        leave(lv, e);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.4) * 4, hz + Math.cos(e.t * 0.6) * 1.5, 2, 6);
      e.heading += DT * (e.state === 'idle' ? 0.8 : 3);
      if (e.state === 'idle') {
        e.aim = lv.aim(e.x, e.z);
        // it sweeps what's below it (never across the top of the screen), with room to read it
        if (e.stateT > 2.6 && ok && p && Math.hypot(p.x - e.x, p.z - e.z) > 12 && Math.abs(e.aim) < 0.8 && !lv.enemies.some((o) => o.arch === 'prism' && o !== e && (o.state === 'windup' || o.state === 'attack'))) {
          const side = lv.rand() < 0.5 ? -1 : 1;
          d.a0 = e.aim - side * 0.35;
          d.a1 = e.aim + side * 0.35;
          go(lv, e, 'windup', 1.0, 'sweep', { shape: 'sweep', x: e.x, z: e.z, a0: d.a0, a1: d.a1, len: 60, w: 1 });
        }
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'sweep') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          e.aim = d.a0 ?? 0;
          lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 60, z2: e.z + Math.cos(e.aim) * 60, warn: 0, on: 1.4, color: e.skin.colors[2], owner: e.id });
          go(lv, e, 'attack', 1.4, 'sweep');
        }
      } else if (e.state === 'attack') {
        e.aim = lerp(d.a0 ?? 0, d.a1 ?? 0, clamp(e.stateT / 1.4, 0, 1));
        for (const l of lv.lasers)
          if (l.owner === e.id) {
            l.x = e.x;
            l.z = e.z;
            l.x2 = e.x + Math.sin(e.aim) * 60;
            l.z2 = e.z + Math.cos(e.aim) * 60;
          }
        if (over(e)) go(lv, e, 'recover', 1.2);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'gatekeeper': {
      // a pylon: holds one end of a gate (see the director); it only glares
      e.heading = e.x < 0 ? Math.PI / 2 : -Math.PI / 2;
      e.aim = e.heading;
      break;
    }
    // --- the bloom ------------------------------------------------------------------------
    case 'heartpod': {
      // tethers its friends (tough while linked, and healing) and breathes spores
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -17;
      if (e.t < 2) moveTo(lv, e, hx, lerp(-HALF_H - 4, hz, smooth(e.t / 2)));
      else if (e.t > (d.stay ?? 16) && e.state !== 'windup') leave(lv, e);
      else ease(lv, e, hx + Math.sin(e.t * 0.3) * 6, hz + Math.sin(e.t * 0.7), 1.5, 5);
      e.heading = Math.sin(e.t) * 0.3;
      // the links: to the boss if it has a host, or else the nearest few
      d.link = (d.link ?? 0) - DT;
      if (d.link <= 0) {
        d.link = 1;
        const want: number[] = [];
        if (d.host) {
          const h = lv.enemies.find((o) => o.id === d.host && !o.dead);
          if (h) want.push(h.id);
        } else {
          const near = lv.enemies
            .filter((o) => !o.dead && o !== e && o.t >= 0 && o.arch !== 'heartpod' && !o.boss && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 22 * 22)
            .sort((a, b) => (a.x - e.x) ** 2 + (a.z - e.z) ** 2 - ((b.x - e.x) ** 2 + (b.z - e.z) ** 2));
          for (const o of near.slice(0, 3)) want.push(o.id);
        }
        for (const id of e.links) if (!want.includes(id)) lv.emit({ type: 'link', enemy: e.id, to: id, on: false });
        for (const id of want) if (!e.links.includes(id)) lv.emit({ type: 'link', enemy: e.id, to: id, on: true });
        e.links = want;
      }
      for (const id of e.links) {
        const o = lv.enemies.find((x) => x.id === id);
        if (o && !o.boss) o.hp = Math.min(o.max, o.hp + o.max * 0.04 * DT);
      }
      if (e.state === 'idle') {
        if (e.stateT > (d.host ? 4.5 : 5.5) && ok) go(lv, e, 'windup', 0.8, 'pulse', { shape: 'ring', x: e.x, z: e.z, r: 14, w: 1.6 });
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'ring') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          strike(lv, 'wave', e.x, e.z, { v: 9, w: 1.6, rMax: 14, warn: 0, active: 2, air: true, effect: 'slow', owner: e.id, color: e.skin.colors[2] });
          go(lv, e, 'attack', 0.2, 'pulse');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.4);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'puffball': {
      // spore mines sinking down the screen; come too close and one swells and bursts, a blast and
      // then a cloud that burns a while; boost near them and they come after you to do it
      const near = lv.players.some((o) => !o.down && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < PUFF.near ** 2);
      const swell = () => {
        d.prey = undefined;
        go(lv, e, 'windup', PUFF.swell, 'swell', { shape: 'circle', x: e.x, z: e.z, r: PUFF.cloud, ground: false });
      };
      if (e.state === 'idle') {
        moveTo(lv, e, e.x + Math.sin(e.t * 1.3 + e.id) * 2 * DT, s + PUFF.sink * DT, true);
        const q = lv.players.find((o) => !o.down && o.boosting > 0.2 && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 20 * 20);
        if (near && e.t > 0.3 && ok) swell();
        else if (q && e.t > 0.5 && ok) {
          d.prey = q.id;
          go(lv, e, 'windup', 0.4, 'swell', { shape: 'circle', x: e.x, z: e.z, r: 1.6, ground: false });
        }
      } else if (e.state === 'windup') {
        // it stops to swell: shoot it now and it only puffs
        moveTo(lv, e, e.x, s + DT, true);
        const t = e.tele;
        if (t && t.shape === 'circle') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          // (swelling to chase a boost, or to burst)
          if (d.prey !== undefined) go(lv, e, 'attack', 3.5, 'swell');
          else {
            strike(lv, 'shell', e.x, e.z, { r: PUFF.blast, warn: 0, active: 0.15, color: e.skin.colors[2], air: true, owner: e.id });
            strike(lv, 'spore', e.x, e.z, { r: PUFF.cloud, warn: 0, active: PUFF.linger, color: e.skin.colors[2], effect: 'hurt', air: true, vz: PUFF.sink * 0.4, owner: e.id });
            lv.escape(e);
            lv.emit({ type: 'explode', x: e.x, z: e.z, y: e.y, size: 2.2, color: e.skin.colors[2], enemy: e.id });
          }
        }
      } else if (e.state === 'attack') {
        const q = lv.players[d.prey ?? 0];
        if (q && !q.down) {
          const dx = q.x - e.x;
          const dz = q.z - e.z;
          const dl = Math.hypot(dx, dz) || 1;
          e.vx = clamp(e.vx + (dx / dl) * 30 * DT, -15, 15);
          e.vz = clamp((e.vz ?? 0) + (dz / dl) * 30 * DT, -15, 15);
        }
        moveTo(lv, e, e.x + e.vx * DT, s + e.vz * DT, true);
        if (near && ok) swell();
        else if (over(e)) go(lv, e, 'idle');
      }
      break;
    }
    case 'tender': {
      // a fallen titan's welder, woken in its lit core: the brood climbs out of the crack, round
      // and round; then each in turn draws its line at you and darts down it, welding a seam that
      // burns on behind it, and hangs there cooling, open; after a couple it goes home to the core
      const zg = d.tz ?? fromFlight(e.z, e.y);
      const gy = d.gz ?? 0;
      const ph = d.ph ?? 0;
      if (ph === 0) {
        const k = clamp(e.t / TEND.rise, 0, 1);
        const rad = lerp(0.8, TEND.ring, smooth(k));
        d.a = (d.a ?? 0) + DT * lerp(5, 2.5, k);
        e.y = lerp(gy + 0.6, FLIGHT_Y, smooth(k));
        const x = (d.tx ?? e.x) + Math.cos(d.a) * rad;
        const z = toFlight(zg + Math.sin(d.a) * rad * 0.7, e.y);
        e.vx = (x - e.x) / DT;
        e.vz = (z - e.z) / DT;
        e.heading = Math.atan2(e.vx, e.vz - lv.speedNow);
        e.x = x;
        e.z = z;
        e.aim = e.heading;
        if (k >= 1) {
          d.ph = 1;
          d.hx = e.x;
          d.hz = clamp(s, -HALF_H + 5, -8);
          d.fire = 0.25 + (d.index ?? 0) * TEND.turn;
          go(lv, e, 'idle');
        }
        break;
      }
      if (ph === 2) {
        // home: down into the core, if it's still on the screen; else away off the top
        const cs = toFlight(zg, gy) - lv.scroll;
        if (cs > HALF_H - 2) {
          leave(lv, e);
          break;
        }
        ease(lv, e, d.tx ?? e.x, cs, 4, 20);
        e.y = Math.max(gy + 0.6, e.y - DT * 6);
        if (Math.hypot(e.x - (d.tx ?? e.x), s - cs) < 1.5) lv.escape(e);
        break;
      }
      if (e.state === 'idle') {
        // hanging about its station above the core, waiting its turn
        const w = e.t * 1.7 + (d.index ?? 0);
        ease(lv, e, (d.hx ?? 0) + Math.cos(w) * 2, (d.hz ?? -12) + Math.sin(w * 1.3) * 1.2, 3, 16);
        e.heading = lerpAngle(e.heading, lv.aim(e.x, e.z), 0.08);
        d.fire = (d.fire ?? 1) - DT * slow;
        if ((d.n ?? 0) >= TEND.darts && d.fire <= 0) d.ph = 2;
        else if (d.fire <= 0 && ok && p && ps(lv, p) - s > 6) {
          e.aim = lv.aim(e.x, e.z);
          d.len = clamp(Math.hypot(p.x - e.x, p.z - e.z) + 6, 14, 30);
          go(lv, e, 'windup', TEND.wind * quick(lv), 'lunge', line(e, d.len, 0.9, TEND.lock * quick(lv), true));
        }
      } else if (e.state === 'windup') {
        // the torch lit, drawing back on its line
        track(lv, e, 0.15);
        e.heading = e.aim;
        moveTo(lv, e, e.x - Math.sin(e.aim) * 1.5 * DT, s - Math.cos(e.aim) * 1.5 * DT, true);
        if (over(e)) {
          d.gone = 0;
          lv.lasers.push({ x: e.x, z: e.z, x2: e.x, z2: e.z, warn: 0, on: 99, color: e.skin.colors[2], owner: e.id, seam: true, grow: true });
          go(lv, e, 'attack', 0, 'lunge');
        }
      } else if (e.state === 'attack') {
        const sp = TEND.speed * slow;
        moveTo(lv, e, e.x + Math.sin(e.aim) * sp * DT, s + Math.cos(e.aim) * sp * DT, true);
        e.heading = e.aim;
        d.gone = (d.gone ?? 0) + sp * DT;
        const seam = lv.lasers.find((l) => l.seam && l.grow && l.owner === e.id);
        if (seam) {
          seam.x2 = e.x;
          seam.z2 = e.z;
        }
        const crash = crashes(lv, e);
        if (crash || d.gone >= (d.len ?? 20) || s > HALF_H - 3 || Math.abs(e.x) > HALF_W - 2) {
          if (seam) {
            seam.grow = false;
            seam.on = TEND.burn;
          }
          if (crash) {
            lv.emit({ type: 'strike', kind: 'crash', x: e.x, z: e.z, r: e.r });
            lv.damage(e, e.max, -1, false);
          } else go(lv, e, 'recover', TEND.open);
        }
      } else {
        // cooling at the end of its seam, open; then back up to its station for another go
        e.vx *= 0.9;
        e.vz *= 0.9;
        moveTo(lv, e, e.x + e.vx * DT * 0.2, s - 1 * DT, true);
        if (over(e)) {
          if (e.state === 'recover') d.n = (d.n ?? 0) + 1;
          d.hx = clamp(e.x + (lv.rand() - 0.5) * 8, -HALF_W + 6, HALF_W - 6);
          d.hz = -HALF_H + 6 + lv.rand() * 6;
          d.fire = TEND.again + lv.rand() * 0.8;
          go(lv, e, 'idle');
        }
      }
      break;
    }
    // --- the second wave: boats, cars, airships, and odd things that fly ------------------
    case 'gunboat': {
      // patrols the water across its reach; turns its flank to you and fires a broadside out of
      // it (the guns on that side glow, and the arc is drawn); its deck gun picks at you between
      const zg = d.tz ?? fromFlight(e.z, e.y);
      d.tz = zg;
      const dir = d.dir ?? 1;
      const nx = e.x + dir * 3.2 * DT * slow;
      if (!afloat(lv, nx + dir * 3, zg) || Math.abs(nx) > HALF_W - 3) d.dir = -dir;
      else drive(lv, e, nx, zg, true);
      e.heading = lerpAngle(e.heading, (d.dir ?? 1) * (Math.PI / 2), 0.04);
      e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.1);
      if (!ok || s > HALF_H - 8 || !p) break;
      if (e.state === 'idle') {
        d.fire = (d.fire ?? 0.8) - DT;
        if (d.fire <= 0) {
          const k = pattern(lv, e, 'burst', SHARE.mid);
          d.fire = Math.max(1.5, k.every);
          lv.shoot(e.x, e.z, e.aim, k.speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
        }
        if (e.stateT > 2.2) {
          d.side = flank(lv, e);
          const out = e.heading - d.side * (Math.PI / 2);
          go(lv, e, 'windup', 1.0 * quick(lv), 'broadside', { shape: 'sweep', x: e.x, z: e.z, a0: out - 0.5, a1: out + 0.5, len: 30, w: 0 });
        }
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'sweep') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          d.shots = 0;
          d.fire = 0;
          go(lv, e, 'attack', 0.6, 'broadside');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0 && (d.shots ?? 0) < 3) {
          d.fire = 0.18;
          d.shots = (d.shots ?? 0) + 1;
          broadside(lv, e, d.side ?? 1, 3, 1.4, 0.35);
        }
        if (over(e)) go(lv, e, 'recover', 1.5);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'technical': {
      // a gun truck: tears in from the side in a cloud of dust, skids to a stop, empties the gun
      // in the bed at you (a line that locks), and tears off again
      const dir = d.dir ?? 1;
      const zg = d.tz ?? fromFlight(e.z, e.y);
      const rt = d.ride ? road(lv, e.x, zg) : null;
      if (rt && (e.state === 'idle' || e.state === 'recover')) {
        // on a road: down it towards you, turning where it turns
        const sp = (e.state === 'recover' ? 5 : 8) * slow;
        d.tz = zg + sp * DT;
        const x = routeX(rt, d.tz);
        drive(lv, e, x, d.tz);
        e.heading = lerpAngle(e.heading, Math.atan2((routeX(rt, d.tz + 2) - x) / 2, 1), 0.15);
      } else if (e.state === 'idle' || e.state === 'recover') {
        const sp = (e.state === 'recover' ? 7 : 15) * slow;
        d.tz = zg + 3.5 * DT;
        // round a pillar in the road, not through it
        const c = column(lv, e.x + dir * (e.r + 1.5), d.tz, e.r);
        if (c) d.tz += Math.sign(d.tz - c.z || 1) * sp * 0.8 * DT;
        drive(lv, e, e.x + dir * sp * DT, d.tz);
        e.heading = lerpAngle(e.heading, Math.atan2(dir * sp, 3.5), 0.15);
      } else {
        // skidding: it slews round and stops
        d.tz = zg;
        drive(lv, e, e.x + dir * Math.max(0, 9 - e.stateT * 30) * DT, zg);
      }
      e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.15);
      // (off the side it's driving to: the trucks behind the first come in from further out)
      if ((Math.abs(e.x) > HALF_W + 8 && Math.sign(e.x) === dir) || (d.ride && sz(lv, e) > HALF_H + 6)) {
        lv.escape(e);
        break;
      }
      if (!ok || !p) break;
      if (e.state === 'idle') {
        const inside = Math.abs(e.x) < HALF_W - 8;
        if (inside && e.stateT > ((d.n ?? 0) ? 0.9 : 0.4) && (d.n ?? 0) < 2 && s < HALF_H - 6) go(lv, e, 'windup', 0.65 * quick(lv), 'burst', line(e, 34, 0.5, 0.4 * quick(lv)));
      } else if (e.state === 'windup') {
        track(lv, e, 0.15);
        if (over(e)) {
          d.shots = 0;
          d.fire = 0;
          go(lv, e, 'attack', 0.55, 'burst');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0) {
          const k = pattern(lv, e, 'burst', SHARE.mid);
          d.fire = Math.max(0.12, k.gap);
          lv.shoot(e.x, e.z, e.aim + (lv.rand() - 0.5) * 0.08, k.speed, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
        }
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          go(lv, e, 'recover', 1.1);
        }
      } else if (e.state === 'stagger' && over(e)) go(lv, e, 'idle');
      break;
    }
    case 'skater': {
      // a Sankvi sail-sled riding a glass gutter (a gunship's walk, fused into one channel) down
      // at you, sail full, faster than the land goes by. Its tell: the sail luffs and the runners
      // shriek. Then it slews broadside across the gutter, sliding on down it, and rakes a fan of
      // shot down the gutter out of its downhill flank; it lies slewed, sail spilled and slow, open
      // to you; it rights itself and skates on. Twice, then on down and away. It never leaves the
      // glass: at its gutter's near end it skids to a stop and rides the land.
      const st = e.state;
      const k = e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0;
      let zg = d.tz ?? fromFlight(e.z, e.y);
      const sp =
        st === 'idle' ? SKATE.run * Math.min(1, 0.45 + e.stateT * 1.2)
        : st === 'windup' ? lerp(SKATE.run, SKATE.luff, k)
        : st === 'attack' ? lerp(SKATE.luff, SKATE.slide, k)
        : st === 'recover' ? lerp(SKATE.slide, SKATE.run * 0.45, k * k)
        : SKATE.slide;
      zg += sp * slow * DT;
      if (d.end !== undefined) zg = Math.min(zg, d.end - 0.3);
      d.tz = zg;
      const rt = gutter(lv, e.x, zg);
      if (rt) d.end = rt.pts[0].z;
      const x = rt ? routeX(rt, zg) : e.x;
      drive(lv, e, x, zg);
      // which way the gutter runs, down it towards you; slewed, across it, bow to `turn`
      const run = rt ? Math.atan2(routeX(rt, zg + 1.5) - routeX(rt, zg - 1.5), 3) : (d.run ?? 0);
      d.run = run;
      const turn = d.turn ?? 1;
      const slewed = st === 'attack' || (st === 'recover' && k < 0.65);
      const want = slewed ? run + turn * SKATE.slew : st === 'windup' ? run - turn * 0.18 * k : run;
      e.heading = lerpAngle(e.heading, want, slewed ? 0.2 : 0.08);
      e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.1);
      if (s > HALF_H + 6) {
        lv.escape(e);
        break;
      }
      if (!ok || !p) break;
      if (st === 'idle') {
        // (on the screen, ahead of you, with room before it's past you)
        const n = d.n ?? 0;
        if (n < 2 && e.stateT > (n ? 0.8 : 0.5) && s > -HALF_H + 5 && s < HALF_H - 14 && ps(lv, p) - s > 8) {
          d.turn = Math.sign(p.x - e.x) || 1;
          // the rake: down the gutter, leaning towards you a little, then held
          const off = Math.atan2(Math.sin(lv.aim(e.x, e.z) - run), Math.cos(lv.aim(e.x, e.z) - run));
          d.rake = run + clamp(off, -0.3, 0.3);
          const half = ((SKATE.fan - 1) / 2 + 0.5) * SKATE.step;
          go(lv, e, 'windup', 0.8 * quick(lv), 'broadside', { shape: 'sweep', x: e.x, z: e.z, a0: d.rake - half, a1: d.rake + half, len: 30, w: 0 });
        }
      } else if (st === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'sweep') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          d.shots = 0;
          d.fire = 0.12;
          go(lv, e, 'attack', 0.55, 'broadside');
        }
      } else if (st === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0 && (d.shots ?? 0) < SKATE.volleys) {
          d.fire = 0.22;
          // (the second volley between the first's shots: the fan is one you leave, not thread)
          const k = pattern(lv, e, 'fan', SHARE.mid);
          const n = Math.min(SKATE.fan + (lv.spec.difficulty > 0.6 ? 1 : 0) - (d.shots ?? 0), k.n);
          const c = d.rake ?? run;
          for (let j = 0; j < n; j++) lv.shoot(e.x, e.z, c + (j - (n - 1) / 2) * SKATE.step, k.speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          d.shots = (d.shots ?? 0) + 1;
        }
        if (over(e)) go(lv, e, 'recover', 1.2);
      } else if (st === 'recover' && over(e)) {
        d.n = (d.n ?? 0) + 1;
        go(lv, e, 'idle');
      } else if (st === 'stagger' && over(e)) go(lv, e, 'idle');
      break;
    }
    case 'blimp': {
      // a heavy: noses in slow, turns broadside and rolls a volley out of one flank and then the
      // other; parachute mines drop from its gondola; its flanks are hot while it reloads
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -14;
      if (e.t < 3) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 3)), lerp(-HALF_H - 6, hz, smooth(e.t / 3)));
        e.heading = 0;
        break;
      }
      if (e.t > (d.stay ?? 24) && e.state === 'idle') {
        leave(lv, e);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.22) * 9, hz + Math.sin(e.t * 0.5) * 1.2, 1, 3);
      e.heading = lerpAngle(e.heading, Math.PI / 2, 0.01);
      d.mine = (d.mine ?? 2.5) - DT * slow;
      if (d.mine <= 0 && ok) {
        d.mine = 3.2;
        const k = pattern(lv, e, 'ring', SHARE.mid);
        lv.bullet(e.x, e.z + 1, 0, 2.5, { kind: 'mine', r: 0.7, life: 2, split: Math.min(6, k.n), splitV: k.speed, color: e.skin.colors[2], look: lookOf(lv, e) });
      }
      if (e.state === 'idle') {
        if (e.stateT > 2.4 && ok && p) {
          d.side = flank(lv, e);
          d.k = 0;
          const out = e.heading - d.side * (Math.PI / 2);
          go(lv, e, 'windup', 1.1 * quick(lv), 'broadside', { shape: 'sweep', x: e.x, z: e.z, a0: out - 0.6, a1: out + 0.6, len: 34, w: 0 });
        }
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'sweep') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          d.shots = 0;
          d.fire = 0;
          go(lv, e, 'attack', 1.1, 'broadside');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0 && (d.shots ?? 0) < 4) {
          d.fire = 0.22;
          d.shots = (d.shots ?? 0) + 1;
          broadside(lv, e, d.side ?? 1, 2, 2.2, 0.5);
        }
        if (over(e)) {
          // and then the other flank, once
          if ((d.k ?? 0) === 0) {
            d.k = 1;
            d.side = -(d.side ?? 1);
            const out = e.heading - d.side * (Math.PI / 2);
            go(lv, e, 'windup', 0.8 * quick(lv), 'broadside', { shape: 'sweep', x: e.x, z: e.z, a0: out - 0.6, a1: out + 0.6, len: 34, w: 0 });
          } else go(lv, e, 'recover', 1.8);
        }
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'spindle': {
      // a pylon of the old machine: its arms are drawn out, with arrows the way they'll turn;
      // then they spin, firing down their length; each time it turns the other way
      if (!ok || s > HALF_H - 8 || !p) break;
      d.a ??= lv.rand() * Math.PI;
      if (e.state === 'idle') {
        if (e.stateT > 1.4) {
          d.dir = (d.dir ?? 1) > 0 ? -1 : 1;
          go(lv, e, 'windup', 1.0, 'spin', { shape: 'spin', x: e.x, z: e.z, a: d.a, arms: 4, dir: d.dir, len: 9 });
        }
      } else if (e.state === 'windup') {
        if (over(e)) {
          d.fire = 0;
          go(lv, e, 'attack', 2.4, 'spin');
        }
      } else if (e.state === 'attack') {
        d.a += (d.dir ?? 1) * 1.25 * DT * slow;
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0) {
          const k = pattern(lv, e, 'spiral', SHARE.mid);
          d.fire = Math.max(0.13, k.every);
          volleyArms(lv, e.x, e.z, d.a, { arms: Math.min(4, k.arms), speed: k.speed }, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
        }
        if (over(e)) go(lv, e, 'recover', 1.5);
      } else if (over(e)) go(lv, e, 'idle');
      e.heading = d.a;
      e.aim = d.a;
      break;
    }
    case 'halo': {
      // a ring drone: two rings of shards, the first with its gap where you are, the second with
      // its gap turned away (the way it's spinning): you have to move between them
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -14;
      if (e.t < 1.4) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.4)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.4)));
        break;
      }
      if (e.t > (d.stay ?? 14) && e.state === 'idle') {
        leave(lv, e);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.6) * 6, hz + Math.cos(e.t * 0.9), 2, 7);
      e.heading += DT * (e.state === 'windup' ? 6 : 1.5);
      if (e.state === 'idle') {
        if (e.stateT > 1.8 && ok && p) {
          d.dir = lv.rand() < 0.5 ? -1 : 1;
          go(lv, e, 'windup', 0.95, 'ring', { shape: 'ring', x: e.x, z: e.z, r: 5, w: 1 });
        }
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'ring') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          d.a = lv.aim(e.x, e.z);
          d.k = 0;
          d.fire = 0;
          go(lv, e, 'attack', 0.75, 'ring');
        }
      } else if (e.state === 'attack') {
        d.fire = (d.fire ?? 0) - DT;
        if (d.fire <= 0 && (d.k ?? 0) < 2) {
          d.fire = 0.55;
          const gap = (d.a ?? 0) + (d.k ? (d.dir ?? 1) * 0.6 : 0);
          // (a ring, at most 18 and its hole no narrower than the table's)
          const r = pattern(lv, e, 'ring', SHARE.mid);
          const n = Math.min(18, r.n);
          const half = Math.max(0.38, ((r.hole / 2) * Math.PI * 2) / r.n);
          for (let k = 0; k < n; k++) {
            const a = gap + (k / n) * Math.PI * 2;
            if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < half) continue;
            lv.shoot(e.x, e.z, a, r.speed, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
          }
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          d.k = (d.k ?? 0) + 1;
        }
        if (over(e)) go(lv, e, 'recover', 1.3);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'rook': {
      // a dart carrier: locks on, then lets go darts out to its sides that fly only straight and turn
      // only square (see SEEKER). Each stops and draws its next lane before it takes it: step off the
      // lane. Shoot them down, or hit the rook while it reloads
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -17;
      if (e.t < 1.6) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.6)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.6)));
        e.heading = 0;
        break;
      }
      if (((d.n ?? 0) >= 3 || (e.t > 22 && !e.elite)) && e.state !== 'windup') {
        leave(lv, e, (hx < 0 ? -1 : 1) * 10);
        break;
      }
      // it keeps square to the screen, and slides along it in steps
      const step = Math.round(Math.sin(e.t * 0.4) * 2) * 4;
      ease(lv, e, hx + step, hz, 2.5, 8);
      e.heading = 0;
      const three = e.elite || lv.spec.difficulty > 0.9;
      const dirs = three ? [Math.PI / 2, -Math.PI / 2, 0] : [Math.PI / 2, -Math.PI / 2];
      if (e.state === 'idle') {
        if (e.stateT > (d.n ? 2.4 : 1.3) && ok && p) {
          d.prey = p.id;
          go(lv, e, 'windup', 1.1, 'seekers', { shape: 'lock', id: p.id, dirs });
        }
      } else if (e.state === 'windup') {
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          for (const a of dirs)
            lv.bullet(e.x + Math.sin(a) * e.r, e.z + Math.cos(a) * e.r, a, 12, {
              kind: 'seeker',
              r: 0.5,
              life: SEEKER.life,
              seek: d.prey ?? 0,
              color: e.skin.colors[2],
              look: lookOf(lv, e),
            });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          go(lv, e, 'attack', 0.3, 'seekers');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.7);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'manta': {
      // a sky manta glides across the top in a long wave, sowing thorns that hang in its wake
      // and then burst up and down; now and then it rears and flings a fan of them at you
      // (it flies its line step by step, so a hit or a rear only slows it: it never jumps along it)
      const dir = d.dir ?? 1;
      d.pace = lerp(d.pace ?? 1, e.state === 'windup' ? 0.25 : slow, Math.min(1, 4 * DT));
      d.glide = (d.glide ?? 0) + 6.5 * d.pace * DT;
      d.wave = (d.wave ?? d.phase ?? 0) + 0.9 * d.pace * DT;
      const x = -dir * (HALF_W + 7) + dir * d.glide;
      const z = (d.hz ?? -15) + Math.sin(d.wave) * 5;
      // knocked off its line, it glides back onto it rather than snapping
      const back = 1 - Math.min(1, 2.5 * DT);
      d.ox = ((d.ox ?? 0) + (d.ex === undefined ? 0 : e.x - d.ex)) * back;
      d.oz = ((d.oz ?? 0) + (d.es === undefined ? 0 : s - d.es)) * back;
      moveTo(lv, e, x + d.ox, z + d.oz);
      d.ex = e.x;
      d.es = sz(lv, e);
      if (Math.abs(e.x) > HALF_W + 9 && e.t > 3) {
        lv.escape(e);
        break;
      }
      d.mine = (d.mine ?? 0.6) - DT * slow;
      if (d.mine <= 0 && ok && e.state !== 'windup') {
        d.mine = 0.5;
        const b = lv.bullet(e.x - Math.sin(e.heading) * 2, e.z - Math.cos(e.heading) * 2, 0, 0, { kind: 'mine', r: 0.5, life: 1.5, split: 2, splitV: pattern(lv, e, 'ring', SHARE.light).speed, color: e.skin.colors[2], look: lookOf(lv, e) });
        b.splitA = e.heading + Math.PI / 2;
      }
      if (!ok || !p) break;
      if (e.state === 'idle') {
        if (e.stateT > 2.6 && Math.abs(e.x) < HALF_W - 8) go(lv, e, 'windup', 0.8 * quick(lv), 'spit', { shape: 'ring', x: e.x, z: e.z, r: 7, w: 1.4 });
      } else if (e.state === 'windup') {
        const t = e.tele;
        if (t && t.shape === 'ring') {
          t.x = e.x;
          t.z = e.z;
        }
        if (over(e)) {
          const a = lv.aim(e.x, e.z);
          const k = pattern(lv, e, 'fan', SHARE.mid);
          volleyFan(lv, e.x, e.z, a, { n: Math.min(7, k.n), arc: 1.1, speed: k.speed }, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          go(lv, e, 'attack', 0.2, 'spit');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.2);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    // --- bounties -------------------------------------------------------------------------
    case 'runner': {
      // a loot runner: keeps away from your guns, jinks when you line up, and bolts when time's up
      const life = e.bounty?.life ?? 9;
      if (e.t < 1.2) {
        moveTo(lv, e, d.x0 ?? 0, lerp(-HALF_H - 4, -17, smooth(e.t / 1.2)));
        break;
      }
      if (e.t > life - 1) {
        moveTo(lv, e, e.x, s - 32 * DT * Math.min(1, (e.t - life + 1) * 3), true);
        break;
      }
      if (e.state === 'attack') {
        moveTo(lv, e, clamp(e.x + (d.dir ?? 1) * 30 * DT, -HALF_W + 3, HALF_W - 3), s, true);
        if (over(e)) go(lv, e, 'idle');
        break;
      }
      const away = p ? (e.x > p.x ? 1 : -1) : 1;
      const tx = clamp((p?.x ?? 0) + away * 14, -HALF_W + 4, HALF_W - 4);
      ease(lv, e, tx + Math.sin(e.t * 2.2) * 3, -17 + Math.sin(e.t * 1.3) * 3, 1.2, 11);
      e.heading = lerpAngle(e.heading, Math.PI, 0.05);
      if (e.state === 'idle') {
        d.mine = (d.mine ?? 2) - DT;
        if (d.mine <= 0 && ok) {
          d.mine = 2.4;
          const k = pattern(lv, e, 'ring', SHARE.mid);
          lv.bullet(e.x, e.z + 1, 0, 3, { kind: 'mine', r: 0.7, life: 1.6, split: Math.min(6, k.n), splitV: k.speed, color: e.skin.colors[2], look: lookOf(lv, e) });
        }
        if (p && Math.abs(p.x - e.x) < 3 && e.stateT > 0.8) {
          d.dir = e.x > 0 ? -1 : 1;
          go(lv, e, 'windup', 0.25, 'jink', null);
        }
      } else if (e.state === 'windup' && over(e)) go(lv, e, 'attack', 0.35, 'jink');
      break;
    }
    case 'vault': {
      // a strongbox, hauled off by two tugs: iron while they hold it (see takenNow). Shoot them
      // down and it drops, and bursts open on the ground
      if (d.fall !== undefined) {
        e.shielded = true;
        d.fall += DT;
        const gz = d.gz ?? e.z;
        const h = Math.max(0, lv.terrain.height(e.x, gz));
        e.y = Math.max(h, FLIGHT_Y - 15 * d.fall * d.fall);
        d.fvx = (d.fvx ?? 0) * 0.97;
        e.x += d.fvx * DT;
        e.z = toFlight(gz, e.y);
        e.heading += DT * 6;
        if (e.y <= h) lv.kill(e, d.prey ?? 0);
        break;
      }
      // where the tugs are taking it: down onto the screen, a weave, then up and away
      const life = e.bounty?.life ?? 10;
      const hx = d.hx ?? 0;
      d.tx = e.t < 1.4 ? hx : hx + Math.sin(e.t * 0.5) * 8;
      d.ts = e.t < 1.4 ? lerp(-HALF_H - 4, -13, smooth(e.t / 1.4)) : e.t > life - 1 ? (d.ts ?? -13) - 30 * DT : -13 + Math.sin(e.t * 0.8) * 2;
      e.heading += DT * 0.6;
      const tugs = lv.enemies.filter((o) => o.arch === 'tug' && o.d.host === e.id && !o.dead);
      if (tugs.length < (d.n ?? 2)) {
        d.n = tugs.length;
        d.prey = p?.id ?? 0;
        if (!tugs.length) {
          // cut loose: it falls where it is, still drifting the way it swung
          d.fall = 0;
          d.gz = e.z;
          d.fvx = e.vx * 0.5;
          e.ground = true;
          if (e.bounty) e.bounty.life = e.t + 5;
          break;
        }
        // one line snapped: it lurches and swings from the other
        const t = tugs[0];
        d.a = Math.atan2(e.x - t.x, s - sz(lv, t));
        d.ph = (d.ph ?? 0) + (t.d.side ?? 1) * 2.5;
      }
      if (tugs.length === 2) {
        moveTo(lv, e, (tugs[0].x + tugs[1].x) / 2, (sz(lv, tugs[0]) + sz(lv, tugs[1])) / 2 + 2.6);
        break;
      }
      // a pendulum under the one that's left
      const t = tugs[0];
      d.ph = ((d.ph ?? 0) - Math.sin(d.a ?? 0) * 9 * DT) * 0.992;
      d.a = (d.a ?? 0) + d.ph * DT;
      moveTo(lv, e, t.x + Math.sin(d.a) * 3.2, sz(lv, t) + Math.cos(d.a) * 3.2);
      break;
    }
    case 'tug': {
      // a strongbox's hauler, hooked on above it. Left on its own it panics: it bolts from side to
      // side, faster, the box swinging under it. The box gone, it's off
      const box = lv.enemies.find((o) => o.id === d.host && !o.dead && o.d.fall === undefined);
      if (!box) {
        leave(lv, e);
        break;
      }
      const side = d.side ?? 1;
      const alone = (box.d.n ?? 2) < 2;
      const tx = (box.d.tx ?? e.x) + (alone ? Math.sin(e.t * 2.6 + side) * 9 : side * 3.4);
      ease(lv, e, clamp(tx, -HALF_W + 3, HALF_W - 3), (box.d.ts ?? -13) - 2.6, alone ? 2.2 : 4, alone ? 22 : 16);
      e.heading = lerpAngle(e.heading, Math.PI, 0.1);
      break;
    }
  }
}
