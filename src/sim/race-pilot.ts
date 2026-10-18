/**
 * The autopilot on a race: flies the course with the stick and buttons a player has. It aims down
 * the racing line (or a shortcut's lane: every other one; up the ramp when a barrier's coming;
 * round an island its quick side), and looks along its way there for
 * anything it would hit (rocks, walls, rivals), swinging out to whichever side is clear. It steers the slide, not just the nose (where the
 * ship is going is what matters), and leans in against the course's turn. Full throttle unless it's
 * badly off its line; the handbrake in the tight turns, to drift them (and charge a turbo); boost
 * on the straights when there's Burn. Not meant to be perfect: meant to find what nobody could fly.
 */

import { DRIFT_A, DRIFT_WIDE, GRIP_A, type Level, type Player } from './level';
import type { Intent } from './types';
import { BARRIER_H, MOUTH } from './course';
import { clamp } from '../util';

export interface RacePilot {
  /** The way round it chose last frame (kept unless another is clearly better). */
  off: number;
  /** The drift it's going into (+1 right), or 0. */
  hb: number;
  boost: boolean;
  /** Seconds it's been wedged (barely moving). */
  stuck: number;
  /** The row of rock it's aiming through (its z), and the gap it picked (across from the middle). */
  row: number;
  gap: number;
}

export function newRacePilot(): RacePilot {
  return { off: 0, hb: 0, boost: false, stuck: 0, row: 0, gap: 0 };
}

const OFFSETS = [0, -2.5, 2.5, -5, 5, -8, 8, -11, 11];

export function racePilot(lv: Level, p: Player, st: RacePilot, noBoost = false): Intent {
  const intent: Intent = { x: 0, y: 1, fire: false, boost: 0, dash: false, special: false, aux: false, focus: false };
  const c = lv.terrain.course;
  if (!c || p.down) return intent;
  if (lv.countdown > 0) {
    intent.boost = lv.countdown < 0.12 && !noBoost ? 1 : 0;
    return intent;
  }
  // where to: the racing line ahead, or down a shortcut's lane (every other one)
  const look = clamp(p.fwd * 0.6, 12, 30);
  const tz = p.z - look;
  let tx = c.line(tz);
  // (one it's not in by the end of its mouth, it's missed)
  const sc = c.shortcuts.find((s) => s.id % 2 === 0 && s.z0 > p.z - 70 - look && p.z > s.z0 - MOUTH * 0.8);
  const cut = p.shortcut >= 0 ? c.shortcuts[p.shortcut] : sc;
  if (cut) tx = c.cutX(cut, tz);
  // a barrier coming: up the ramp that clears it
  const jump = c.jumpAhead(p.x, p.z, look + 50);
  if (jump?.rp && !cut) tx = c.x(jump.rp.z) + jump.rp.dx;
  // a row of rock coming: through its gap
  const row = jump || cut ? undefined : c.rowAhead(p.z, look + 40);
  if (row) {
    // (the gap it picked for this row, kept: the nearest to where it'll be by then)
    if (st.row !== row.z) {
      st.row = row.z;
      st.gap = c.gapX(row, p.x + p.vx * ((p.z - row.z) / Math.max(p.fwd, 10)) * 0.5) - c.x(row.z);
    }
    tx = c.x(row.z) + st.gap;
  }
  // round whatever's in the way: the clearest of a few lines there
  let best = 0;
  let bestCost = Infinity;
  for (const off of jump?.rp || row ? [0, -1.5, 1.5] : OFFSETS) {
    let cost = Math.abs(off) * 0.25 + (off === st.off ? -1.5 : 0);
    cost += pathCost(lv, p, tx + off, tz);
    if (cost < bestCost) {
      bestCost = cost;
      best = off;
    }
  }
  st.off = best;
  tx += best;
  // (wedged against something, barely moving: nose hard round towards the middle of the way, and
  // go; still wedged a second later, the other way for a second)
  st.stuck = p.fwd < 12 && lv.time > 3 ? st.stuck + 1 / 60 : 0;
  if (st.stuck > 0) {
    const here = p.shortcut >= 0 ? c.laneX(c.shortcuts[p.shortcut], p.z) : c.x(p.z);
    const il = c.islandAt(p.z);
    const mid = il && p.shortcut < 0 ? c.branchX(il, Math.sign(p.x - c.x(p.z) - il.off) || 1, p.z) : here;
    intent.x = (Math.sign((Number.isNaN(mid) ? c.x(p.z) : mid) - p.x) || 1) * (st.stuck % 2 > 1 ? -1 : 1);
    return intent;
  }
  // steer the slide at it, with the nose leading, leaning in against the course's turn
  const ahead = Math.max(4, p.z - tz);
  const want = Math.atan2(tx - p.x, ahead);
  const going = Math.atan2(p.vx, -p.vz);
  const lean = c.k(p.z) * p.pace;
  const err = want - going;
  intent.x = clamp((want - p.hd) * 2 + err * 1.6 + lean / 2.5 - p.yaw * 0.12, -1, 1);
  // the bend coming, and how hard it'll have to turn for it (units/s² across)
  // (the turn held over a stretch: a switchback's lefts and rights about cancel, flown straight through)
  let turn = 0;
  let bendK = 0;
  for (const d of [0, 12, 24]) {
    const k = (c.k(p.z - d) + c.k(p.z - d - 10) + c.k(p.z - d - 20)) / 3;
    if (Math.abs(k) > turn) {
      turn = Math.abs(k);
      bendK = k;
    }
  }
  const v = Math.max(p.fwd, 8);
  const need = turn * v * v;
  // and further on, as far as it'll be in a second and a bit: what it should be slowing for
  let far = turn;
  for (let d = 30; d < v * 1.3; d += 10) far = Math.max(far, Math.abs(c.k(p.z - d) + c.k(p.z - d - 10)) / 2);
  const farNeed = far * v * v;
  // drift what grip won't hold (into the bend, on the ground); out of it once the bend's done
  const into = Math.sign(bendK);
  if (!p.driftDir) st.hb = p.alt <= 0 && need > GRIP_A * 0.8 && p.fwd > 30 && bestCost < 20 && Math.sign(err + lean * 0.3) !== -into ? into : 0;
  else if (need < GRIP_A * 0.45 || Math.sign(bendK) === -p.driftDir || bestCost > 30) st.hb = 0;
  // (the turn it wants now: the course's, and back onto its line)
  const turnWant = c.k(p.z - 6) * p.pace + clamp(err * 3, -1.2, 1.2);
  // (already turned in further than it wants: out of the drift, to straighten up)
  if (p.driftDir && turnWant * p.driftDir < -0.15) st.hb = 0;
  if (st.hb) {
    intent.fire = true;
    if (!p.driftDir) intent.x = st.hb;
    else {
      // how tight: the turn it wants against what the drift does, wide to tight
      const rate = (k: number) => (DRIFT_A / v) * k;
      const tight = clamp((turnWant * p.driftDir) / rate(1), 0, 1.4);
      intent.x = p.driftDir * clamp(((tight - DRIFT_WIDE) / (1 - DRIFT_WIDE)) * 2 - 1, -1, 1);
    }
  }
  // off the throttle when it's badly off its line at speed (and into a wall of trouble), or the bend's too tight even to drift
  intent.y = (Math.abs(err) > 0.5 && p.fwd > 32) || bestCost > 60 || farNeed > DRIFT_A * 0.9 ? -0.7 : 1;
  // boost on the straights
  const room = farNeed < GRIP_A * 0.7;
  if (st.boost) st.boost = p.burn > 0.04 && room && bestCost < 15;
  else st.boost = p.burn > 0.3 && room && Math.abs(err) < 0.2 && bestCost < 8;
  intent.boost = st.boost && !noBoost ? 1 : 0;
  return intent;
}

/** How bad the way from the ship to (x, z) looks: anything it would pass close to, closer is worse. */
function pathCost(lv: Level, p: Player, x: number, z: number) {
  const t = lv.terrain;
  const c = t.course!;
  const len = Math.max(1, p.z - z);
  let cost = 0;
  let walled = false;
  const b = c.barrierCrossed(p.z, z - 6);
  if (b && p.alt < BARRIER_H && !c.rampAhead(p.z, p.z - b.z) && c.blocks(b, x, 1.4)) cost += 40;
  for (let d = 2; d <= len + 6; d += 2) {
    const k = Math.min(1, d / len);
    const px = p.x + (x - p.x) * k;
    const pz = p.z - d;
    if (t.solid(px, pz, 2)) cost += 30;
    for (const col of t.colliders(px, pz, 3)) {
      const gap = Math.hypot(col.x - px, col.z - pz) - col.r - 0.7;
      if (gap < 2.2) cost += (2.2 - gap) * 12;
    }
    // (through a wall: no way)
    if (!walled && c.hold(p.x, p.z, px, pz, 1.4).side) {
      cost += 25;
      walled = true;
    }
    for (const r of lv.rivals) if (Math.abs(r.z - pz) < 2.5 && Math.abs(r.x - px) < 2.6) cost += 3;
  }
  return cost;
}
