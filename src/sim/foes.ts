/**
 * How the faction foes fly and fight (see factions.ts for who they are). Each runs the loop in
 * combat.ts: idle, a windup with a tell, the attack, then a recovery where it's open. Screen space
 * as in enemies.ts: `s` is z from the middle of the screen (negative is up, towards the top).
 */

import { TORPEDO, type Enemy, type Level, type Player } from './level';
import { DT, FLIGHT_Y, HALF_H, HALF_W, fromFlight, toFlight } from './types';
import { clamp, lerp, smooth } from '../util';
import { go, lookOf, over, release, type Tele } from './combat';
import { strike } from './strikes';

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

/** Put a flier at screen position (x, s), facing the way it moved. */
export function moveTo(lv: Level, e: Enemy, x: number, s: number) {
  const nz = lv.scroll + s;
  // (down a canyon: between its walls, not into them)
  if (!e.ground) x = lv.terrain.intoCanyon(x, nz, e.r);
  const dx = x - e.x;
  const dz = nz - e.z;
  e.vx = dx / DT;
  e.vz = dz / DT;
  if (Math.abs(dx) + Math.abs(s - (e.z - lv.scroll)) > 1e-4) e.heading = lerpAngle(e.heading, Math.atan2(dx, s - (e.z - lv.scroll)), 0.15);
  e.x = x;
  e.z = nz;
}

/** Ease towards a screen spot (a hover), at up to `max` units/s. */
function ease(lv: Level, e: Enemy, x: number, s: number, k = 3, max = 18) {
  const cs = sz(lv, e);
  const dx = clamp((x - e.x) * k, -max, max);
  const ds = clamp((s - cs) * k, -max, max);
  moveTo(lv, e, e.x + dx * DT, cs + ds * DT);
}

/** Can it see you? (On screen, and not right at the edge.) */
export const live = (lv: Level, e: Enemy) => lv.onScreen(e.x, e.z, -1) && e.stun <= 0 && lv.state !== 'clear' && lv.state !== 'failed';

/** Quicker tells later in the run (never by much). */
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
  moveTo(lv, e, e.x + dx * DT * Math.min(1, e.d.away * 2), sz(lv, e) - 24 * DT * Math.min(1, e.d.away * 1.5));
}

const ps = (lv: Level, p: Player) => p.z - lv.scroll;

/** A ground vehicle to (x, ground z): up on the land (or the water) there. */
function drive(lv: Level, e: Enemy, x: number, zg: number, boat = false) {
  const t = lv.terrain;
  const h = boat ? t.water(zg) : Math.max(t.height(x, zg), t.water(zg));
  e.vx = (x - e.x) / DT;
  e.x = x;
  e.y = h;
  e.z = toFlight(zg, h);
}

/** Is there water to float on at (x, ground z)? */
export const afloat = (lv: Level, x: number, zg: number) => lv.terrain.height(x, zg) < lv.terrain.water(zg) - 0.25;

/** Fire a row of shots out of a hull's flank: `side` 1 to its right (of its heading), -1 to its left. */
function broadside(lv: Level, e: Enemy, side: number, ports: number, spacing: number, spread: number, speed: number) {
  const out = e.heading - side * (Math.PI / 2);
  const fx = Math.sin(e.heading);
  const fz = Math.cos(e.heading);
  for (let k = 0; k < ports; k++) {
    const off = (k - (ports - 1) / 2) * spacing;
    const a = out + (lv.rand() - 0.5) * spread;
    lv.bullet(e.x + fx * off + Math.sin(out) * e.r * 0.6, e.z + fz * off + Math.cos(out) * e.r * 0.6, a, speed, { color: e.skin.colors[2], look: lookOf(lv, e) });
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

export function updateFoe(lv: Level, e: Enemy): void {
  const d = e.d;
  // an elite doesn't tire and leave: it stays till it's beaten (or a long while)
  if (e.elite && !e.bounty && e.t < 45) d.n = Math.min(d.n ?? 0, 1);
  const p = lv.nearest(e.x, e.z);
  const ok = live(lv, e);
  const s = sz(lv, e);
  const slow = e.stun > 0 ? 0.3 : 1;
  switch (e.arch) {
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
        moveTo(lv, e, e.x - Math.sin(e.aim) * 2 * DT, s - Math.cos(e.aim) * 2 * DT);
        if (over(e)) {
          d.gone = 0;
          go(lv, e, 'attack', 0, 'lunge');
        }
      } else if (e.state === 'attack') {
        const sp = 40 * slow;
        moveTo(lv, e, e.x + Math.sin(e.aim) * sp * DT, s + Math.cos(e.aim) * sp * DT);
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
        moveTo(lv, e, clamp(e.x + e.vx * DT * 0.3, -HALF_W + 2, HALF_W - 2), s - 1.5 * DT);
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
        moveTo(lv, e, e.x + clamp(tx - e.x, -6, 6) * DT, HALF_H + 5);
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
        moveTo(lv, e, e.x + clamp(tx - e.x, -9, 9) * DT * 1.5, s + ds * DT);
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
        moveTo(lv, e, e.x, s + (lv.speedNow - lv.speed * 1.45) * DT);
        track(lv, e, 0);
        if (over(e)) {
          d.ph = 3;
          go(lv, e, 'attack', 0.5, 'ram');
        }
        break;
      }
      if (ph === 3) {
        moveTo(lv, e, e.x, s - 30 * slow * DT);
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
        q.x += (dx / dl) * 7 * DT;
        q.z += (dz / dl) * 7 * DT;
        q.vx *= 0.85;
        q.vz *= 0.85;
        e.aim = Math.atan2(-dx, -dz);
        e.heading = e.aim;
        if (q.dashT > 0) release(lv, e, true);
        else if (dl < 3 + e.r || d.held > 2.2) {
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
        track(lv, e, 0.1);
        e.heading = e.aim;
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          strike(lv, 'harpoon', e.x, e.z, { vx: Math.sin(e.aim) * 40, vz: Math.cos(e.aim) * 40, active: 1.3, warn: 0, owner: e.id, effect: 'latch', air: true, color: e.skin.colors[2] });
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
        moveTo(lv, e, e.x, s - 30 * DT);
        break;
      }
      // the race: when you boost harder than it can, you pass it
      const push = Math.max(0, lv.speedNow - lv.speed * 1.35 + (!p ? 0 : p.boosting * lv.speed * 0.6));
      if (e.state === 'dodge') {
        e.shielded = true;
        moveTo(lv, e, clamp(e.x + (d.rollDir ?? 1) * 18 * DT, -HALF_W + 3, HALF_W - 3), s + push * DT);
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
      moveTo(lv, e, e.x + clamp(tx - e.x, -10, 10) * DT * (e.state === 'recover' ? 0.4 : 1), cs + (clamp((ts - cs) * 2, -8, 8) + push) * DT);
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
          lv.bullet(e.x, e.z, e.aim, 15, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
          d.shots = (d.shots ?? 0) + 1;
          d.fire = 0.1;
          if (d.shots >= 3) {
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
        moveTo(lv, e, e.x, s);
        if (over(e)) {
          strike(lv, 'slam', e.x, e.z, { r: 2.6, warn: 0, active: 0.25, air: true, owner: e.id, color: e.skin.colors[2] });
          strike(lv, 'wave', e.x, e.z, { v: 13, w: 1, rMax: 18, warn: 0.05, active: 2, air: true, owner: e.id, color: e.skin.colors[2] });
          go(lv, e, 'attack', 0.2, 'erupt');
        }
      } else if (e.state === 'attack') {
        e.y = FLIGHT_Y - 1;
        moveTo(lv, e, e.x, s);
        if (over(e)) go(lv, e, 'recover', 1.8);
      } else {
        // up, exposed, then back under
        e.y = FLIGHT_Y - 1;
        moveTo(lv, e, e.x, s);
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          go(lv, e, 'hidden', 1.6);
        }
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
      // a shield in front; it drops it to fire
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -12;
      if (e.t < 1.6) {
        moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(e.t / 1.6)), lerp(-HALF_H - 4, hz, smooth(e.t / 1.6)));
        e.aim = lv.aim(e.x, e.z);
        e.guard = 0.9;
        break;
      }
      if (e.t > (d.stay ?? 10) && e.state === 'idle') {
        e.guard = 0.9;
        leave(lv, e);
        break;
      }
      ease(lv, e, hx + Math.sin(e.t * 0.5) * 3, hz, 2, 6);
      e.heading = e.aim;
      if (e.state === 'idle' || e.state === 'windup') {
        e.aim = turn(e.aim, lv.aim(e.x, e.z), 0.7);
        e.guard = 0.9;
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
          for (let k = -2; k <= 2; k++) lv.bullet(e.x + px * k * 1.3, e.z + pz * k * 1.3, e.aim, 10, { color: e.skin.colors[2], kind: 'needle', r: 0.4, look: lookOf(lv, e) });
          go(lv, e, 'attack', 0.3, 'bar');
        }
      } else if (e.state === 'attack') {
        if (over(e)) go(lv, e, 'recover', 1.0);
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
      // drifting spore mines; boost near them and they come after you
      if (e.state === 'idle') {
        moveTo(lv, e, e.x + Math.sin(e.t * 1.3 + e.id) * 2 * DT, s + 2.5 * DT);
        const q = lv.players.find((o) => !o.down && o.boosting > 0.2 && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < 20 * 20);
        if (q && e.t > 0.5 && ok) {
          d.prey = q.id;
          go(lv, e, 'windup', 0.4, 'swell', { shape: 'circle', x: e.x, z: e.z, r: 1.6, ground: false });
        }
      } else if (e.state === 'windup') {
        moveTo(lv, e, e.x, s);
        if (over(e)) go(lv, e, 'attack', 3.5, 'swell');
      } else if (e.state === 'attack') {
        const q = lv.players[d.prey ?? 0];
        if (q && !q.down) {
          const dx = q.x - e.x;
          const dz = q.z - e.z;
          const dl = Math.hypot(dx, dz) || 1;
          e.vx = clamp(e.vx + (dx / dl) * 30 * DT, -15, 15);
          e.vz = clamp((e.vz ?? 0) + (dz / dl) * 30 * DT, -15, 15);
        }
        moveTo(lv, e, e.x + e.vx * DT, s + e.vz * DT);
        if (over(e)) go(lv, e, 'idle');
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
          d.fire = 1.5;
          lv.bullet(e.x, e.z, e.aim, 11, { color: e.skin.colors[2], look: lookOf(lv, e) });
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
          broadside(lv, e, d.side ?? 1, 3, 1.4, 0.35, 9.5);
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
      if (e.state === 'idle' || e.state === 'recover') {
        const sp = (e.state === 'recover' ? 7 : 15) * slow;
        d.tz = zg + 3.5 * DT;
        drive(lv, e, e.x + dir * sp * DT, d.tz);
        e.heading = lerpAngle(e.heading, Math.atan2(dir * sp, 3.5), 0.15);
      } else {
        // skidding: it slews round and stops
        d.tz = zg;
        drive(lv, e, e.x + dir * Math.max(0, 9 - e.stateT * 30) * DT, zg);
      }
      e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.15);
      if (Math.abs(e.x) > HALF_W + 8) {
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
          d.fire = 0.12;
          lv.bullet(e.x, e.z, e.aim + (lv.rand() - 0.5) * 0.08, 14, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
        }
        if (over(e)) {
          d.n = (d.n ?? 0) + 1;
          go(lv, e, 'recover', 1.1);
        }
      } else if (e.state === 'stagger' && over(e)) go(lv, e, 'idle');
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
        lv.bullet(e.x, e.z + 1, 0, 2.5, { kind: 'mine', r: 0.7, life: 2, split: 6, color: e.skin.colors[2], look: lookOf(lv, e) });
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
          broadside(lv, e, d.side ?? 1, 2, 2.2, 0.5, 8.5);
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
          d.fire = 0.13;
          for (let k = 0; k < 4; k++) lv.bullet(e.x, e.z, d.a + (k * Math.PI) / 2, 8.5, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
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
          const n = 18;
          for (let k = 0; k < n; k++) {
            const a = gap + (k / n) * Math.PI * 2;
            if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.38) continue;
            lv.bullet(e.x, e.z, a, 8, { color: e.skin.colors[2], kind: 'needle', r: 0.35, look: lookOf(lv, e) });
          }
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
          d.k = (d.k ?? 0) + 1;
        }
        if (over(e)) go(lv, e, 'recover', 1.3);
      } else if (over(e)) go(lv, e, 'idle');
      break;
    }
    case 'manta': {
      // a sky manta glides across the top in a long wave, sowing thorns that hang in its wake
      // and then burst up and down; now and then it rears and flings a fan of them at you
      const dir = d.dir ?? 1;
      const u = e.t * 6.5 * slow;
      const x = -dir * (HALF_W + 7) + dir * u;
      const z = (d.hz ?? -15) + Math.sin(e.t * 0.9 + (d.phase ?? 0)) * 5;
      if (e.state === 'windup') moveTo(lv, e, lerp(e.x, x, 0.02), lerp(s, z, 0.02));
      else moveTo(lv, e, x, z);
      if (Math.abs(e.x) > HALF_W + 9 && e.t > 3) {
        lv.escape(e);
        break;
      }
      d.mine = (d.mine ?? 0.6) - DT * slow;
      if (d.mine <= 0 && ok && e.state !== 'windup') {
        d.mine = 0.5;
        const b = lv.bullet(e.x - Math.sin(e.heading) * 2, e.z - Math.cos(e.heading) * 2, 0, 0, { kind: 'mine', r: 0.5, life: 1.5, split: 2, color: e.skin.colors[2], look: lookOf(lv, e) });
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
          for (let k = 0; k < 7; k++) lv.bullet(e.x, e.z, a + (k / 6 - 0.5) * 1.1, 9, { color: e.skin.colors[2], look: lookOf(lv, e) });
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
        moveTo(lv, e, e.x, s - 32 * DT * Math.min(1, (e.t - life + 1) * 3));
        break;
      }
      d.drop = d.drop ?? 0;
      // shaken loose: a bit of the loot each fifth of its hull
      while (e.hp < e.max * (1 - (d.drop + 1) * 0.2) && d.drop < 4) {
        d.drop++;
        lv.drop('scrap', e.x, e.z, 2);
      }
      if (e.state === 'attack') {
        moveTo(lv, e, clamp(e.x + (d.dir ?? 1) * 30 * DT, -HALF_W + 3, HALF_W - 3), s);
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
          lv.bullet(e.x, e.z + 1, 0, 3, { kind: 'mine', r: 0.7, life: 1.6, split: 6, color: e.skin.colors[2], look: lookOf(lv, e) });
        }
        if (p && Math.abs(p.x - e.x) < 3 && e.stateT > 0.8) {
          d.dir = e.x > 0 ? -1 : 1;
          go(lv, e, 'windup', 0.25, 'jink', null);
        }
      } else if (e.state === 'windup' && over(e)) go(lv, e, 'attack', 0.35, 'jink');
      break;
    }
    case 'vault': {
      // a strongbox: it reseals itself between hits, so only a quick burst cracks it
      const life = e.bounty?.life ?? 10;
      const hx = d.hx ?? 0;
      if (e.t < 1.4) moveTo(lv, e, hx, lerp(-HALF_H - 4, -13, smooth(e.t / 1.4)));
      else if (e.t > life - 1) moveTo(lv, e, e.x, s - 30 * DT * Math.min(1, (e.t - life + 1) * 3));
      else ease(lv, e, hx + Math.sin(e.t * 0.5) * 8, -13 + Math.sin(e.t * 0.8) * 2, 1, 6);
      e.heading += DT * 0.6;
      if (e.hitT > 0.3) e.hp = Math.min(e.max, e.hp + e.max * 0.45 * DT);
      // the tumblers: how close it is to opening
      if (e.state === 'idle' && e.hp < e.max * 0.5) go(lv, e, 'recover', 0);
      else if (e.state === 'recover' && e.hp > e.max * 0.6) go(lv, e, 'idle');
      break;
    }
    case 'cache': {
      // an iron crate: armour you crack with a dash into it (or by shooting it point blank)
      const life = e.bounty?.life ?? 12;
      if (e.t > life - 1) moveTo(lv, e, e.x, s - 28 * DT);
      else moveTo(lv, e, e.x + Math.sin(e.t * 0.9) * 3 * DT + (e.vx || 0) * DT * 0.2, s + (e.t < 1 ? 14 : 3) * DT);
      e.vx *= 0.95;
      e.heading += DT * 0.4;
      if (e.state === 'stagger' && over(e)) go(lv, e, 'recover', 0);
      if (!d.cracked)
        for (const q of lv.players) {
          if (q.down || q.dashT <= 0) continue;
          if ((q.x - e.x) ** 2 + (q.z - e.z) ** 2 < (e.r + 1.8) ** 2) {
            d.cracked = 1;
            q.inv = Math.max(q.inv, 0.35);
            e.vx = q.dashX * 40;
            lv.emit({ type: 'crack', enemy: e.id, x: e.x, z: e.z });
            e.taken = 1.3;
            lv.damage(e, e.max * 0.25, q.id, false);
            go(lv, e, 'stagger', 0.8);
          }
        }
      break;
    }
  }
}
