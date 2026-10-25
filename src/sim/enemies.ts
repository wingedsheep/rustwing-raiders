/**
 * How each kind of enemy flies and fights. Fliers are steered in screen space (`sz`, their z
 * relative to the middle of the screen), so a formation keeps its shape however fast the land goes
 * by; turrets stand on the ground and scroll past with it.
 *
 * An enemy with a negative age is waiting its turn in a formation: hidden above the screen.
 */

import type { Form } from './foes';
import type { Enemy, Level } from './level';
import { DT, HALF_H, HALF_W } from './types';
import { clamp, lerp, smooth } from '../util';
import { updateBoss } from './boss';
import { go, lookOf, over, tickFoe } from './combat';
import { foeDef } from './combat';
import { lerpAngle, moveTo, sz, updateFoe } from './foes';
import { strike } from './strikes';
import type { PartKind } from './heist';

export interface EnemyData {
  /** The boss has come: it's off out of the way, firing nothing (see Director.spawnBoss). */
  flee?: number;
  /** Taken down this stagger (a dash through it: see Level.takedown). */
  td?: number;
  path?: 'swoop' | 'dive' | 'cross' | 'loop';
  /** Seconds a stun has held its path back (see updateEnemy). */
  lag?: number;
  /** Scraplings: the formation it flies (see foes.ts FORMS), and its place in it (0: the leader). */
  form?: Form;
  slot?: number;
  x0?: number;
  sz0?: number;
  /** Where it hovers (screen space). */
  hx?: number;
  hz?: number;
  amp?: number;
  phase?: number;
  /** Seconds to the next shot. */
  fire?: number;
  shots?: number;
  stay?: number;
  dir?: number;
  /** Serpents: the head this segment follows, and how far back. */
  leader?: number;
  index?: number;
  trail?: number[];
  spawned?: number;
  angle?: number;
  dived?: number;
  // the foes (foes.ts): their working numbers
  hz2?: number;
  n?: number;
  len?: number;
  gone?: number;
  ph?: number;
  held?: number;
  yank?: number;
  rollCd?: number;
  rollDir?: number;
  heat?: number;
  passed?: number;
  tx?: number;
  tz?: number;
  /** Drives a road (a wash, a track: see sim/layout.ts) rather than across. */
  ride?: number;
  ts?: number;
  a?: number;
  x0d?: number;
  s0?: number;
  side?: number;
  a0?: number;
  a1?: number;
  link?: number;
  /** A boarder: the hauler it's after (convoy.ts), `ph` its phase. */
  board?: number;
  /** A part of a heist's runner (heist.ts): which kind, and which of them. */
  qp?: PartKind;
  qk?: number;
  /** Heartpods: the enemy it's bound to (the hive boss). Tugs: the strongbox they haul. */
  host?: number;
  prey?: number;
  drop?: number;
  mine?: number;
  /** A strongbox cut loose: how long it's been falling, from where (ground z), and its drift. */
  fall?: number;
  gz?: number;
  fvx?: number;
  away?: number;
  /** Prisms: seconds until it can throw another shot back. */
  refl?: number;
  /** Wardens: damage its shield has stopped since it last cracked. */
  worn?: number;
  /** Brutes: where it charged from. */
  bx?: number;
  bs?: number;
  /** Elites: how many attacks they chain, and which of them it's on (see combat.ts CHAIN). */
  chain?: number;
  combo?: number;
  /** A move's counter (volleys fired, flanks used). */
  k?: number;
  /** Fliers: how far across it's swung out of its way round an obstacle (see foes.ts veer). */
  veer?: number;
  /** Mantas: their pace (eased), how far along their line and their wave they are, how far they've been knocked off it, and where they were left. */
  pace?: number;
  glide?: number;
  wave?: number;
  ox?: number;
  oz?: number;
  ex?: number;
  es?: number;
}

export function enemyRadius(arch: Enemy['arch']) {
  const f = foeDef(arch);
  if (f) return f.r;
  switch (arch) {
    case 'swarm':
      return 0.8;
    case 'dart':
      return 1.1;
    case 'serpent':
      return 1.1;
    case 'turret':
      return 1.3;
    case 'lancer':
      return 1.5;
    case 'gunship':
      return 1.9;
    case 'bomber':
      return 2.2;
    case 'brute':
      return 2.9;
    case 'carrier':
      return 3.4;
    case 'boss':
      return 5.5;
  }
  return 1.5;
}

function face(lv: Level, e: Enemy, t = 0.1) {
  e.heading = lerpAngle(e.heading, lv.aim(e.x, e.z), t);
}

/** Can it see you? (On screen, and not right at the edge.) */
const live = (lv: Level, e: Enemy) => lv.onScreen(e.x, e.z, -1) && e.stun <= 0 && lv.state !== 'clear';

function fan(lv: Level, e: Enemy, n: number, spread: number, speed: number, opts = {}) {
  const a = lv.aim(e.x, e.z);
  for (let i = 0; i < n; i++) lv.bullet(e.x, e.z, a + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), speed, { color: e.skin.colors[2], look: lookOf(lv, e), ...opts });
  lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
}

function ring(lv: Level, e: Enemy, n: number, speed: number, off = 0, opts = {}) {
  for (let i = 0; i < n; i++) lv.bullet(e.x, e.z, off + (i / n) * Math.PI * 2, speed, { color: e.skin.colors[2], look: lookOf(lv, e), ...opts });
  lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
}

/** How much more often everything shoots as the run goes on. */
const pace = (lv: Level) => 1 + lv.spec.difficulty * 0.45;

export function updateEnemy(lv: Level, e: Enemy) {
  const d = e.d;
  if (e.t < 0) {
    // waiting in line above the screen
    e.shielded = true;
    e.z = lv.top - 6;
    e.x = d.x0 ?? 0;
    return;
  }
  // a boss has come: the air's its own now. Fliers go up and away (and are gone off the top);
  // anything on the ground goes quiet as it scrolls by
  if (d.flee) {
    e.tele = null;
    if (!e.ground) {
      d.flee += DT;
      e.z -= 26 * DT * Math.min(1, d.flee);
      e.vx = 0;
    }
    return;
  }
  // (a runner's bridge keeps its shield till its engines are out)
  if (e.arch !== 'boss' && d.qp === undefined) e.shielded = false;
  tickFoe(lv, e);
  // a heist's runner works its own parts (see heist.ts)
  if (d.qp !== undefined) {
    lv.heist?.fly(e);
    return;
  }
  // an escort's boarders fly their own way (see convoy.ts)
  if (d.board !== undefined && lv.convoy) {
    lv.convoy.fly(e);
    return;
  }
  if (foeDef(e.arch)) {
    updateFoe(lv, e);
    return;
  }
  const stunned = e.stun > 0;
  const slow = stunned ? 0.3 : 1;
  const t = e.t;
  // a path's own clock: it loses what a stun slows it by, so a stunned flier slows where it is
  // (a path read off the clock times `slow` would throw it back along its path, then snap it on)
  if (stunned && t > 0) d.lag = (d.lag ?? 0) + DT * (1 - slow);
  const pt = t - (d.lag ?? 0);
  switch (e.arch) {
    case 'dart': {
      const x0 = d.x0 ?? 0;
      if (d.path === 'dive') {
        // in, a pause to line up, then straight at you
        if (t < 1.1) moveTo(lv, e, x0, lerp(-HALF_H - 3, -HALF_H * 0.45, smooth(t / 1.1)));
        else if (t < 1.7) {
          face(lv, e, 0.2);
          e.aim = e.heading;
          if (!d.shots && live(lv, e)) {
            d.shots = 1;
            fan(lv, e, 2, 0.35, 11);
            go(lv, e, 'windup', 0.6, 'dive', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 40, z2: e.z + Math.cos(e.aim) * 40, w: e.r, lock: 0.45, body: true });
          }
          const tl = e.tele;
          if (tl && tl.shape === 'line') {
            tl.x = e.x;
            tl.z = e.z;
            tl.x2 = e.x + Math.sin(e.aim) * 40;
            tl.z2 = e.z + Math.cos(e.aim) * 40;
          }
        } else {
          if (d.dived === undefined) {
            d.dived = e.heading;
            go(lv, e, 'attack', 0, 'dive');
          }
          const sp = 26 * slow;
          moveTo(lv, e, e.x + Math.sin(d.dived) * sp * DT, sz(lv, e) + Math.cos(d.dived) * sp * DT, true);
        }
      } else if (d.path === 'cross') {
        const dir = d.dir ?? 1;
        moveTo(lv, e, -dir * (HALF_W + 4) + dir * pt * 20, (d.sz0 ?? -12) + Math.sin(t * 2) * 1.5);
        d.fire = (d.fire ?? 0.6) - DT * pace(lv);
        if (d.fire <= 0 && live(lv, e)) {
          d.fire = 0.8;
          lv.bullet(e.x, e.z, 0, 10, { color: e.skin.colors[2], kind: 'needle', look: lookOf(lv, e) });
        }
      } else if (d.path === 'loop') {
        // down, a loop, and off the way it came
        const cx = x0;
        const a = pt * 2.1;
        const s = -HALF_H - 3 + Math.min(t, 1.4) * 16 - (t > 1.4 ? Math.sin(a - 2.94) * 6 : 0);
        moveTo(lv, e, cx + (t > 1.4 ? (1 - Math.cos(a - 2.94)) * 6 * (d.dir ?? 1) : 0), s - (t > 4.4 ? (t - 4.4) * 20 : 0));
        if (t > 2 && !d.shots && live(lv, e)) {
          d.shots = 1;
          fan(lv, e, 1, 0, 12);
        }
      } else {
        // swoop: a weave down the screen
        moveTo(lv, e, x0 + Math.sin(t * 1.9 + (d.phase ?? 0)) * (d.amp ?? 7), -HALF_H - 3 + pt * 15);
        d.fire = (d.fire ?? 1 + (d.phase ?? 0) * 0.3) - DT * pace(lv);
        if (d.fire <= 0 && live(lv, e) && sz(lv, e) < 6) {
          d.fire = 2.4;
          fan(lv, e, 1, 0, 12);
        }
      }
      break;
    }
    case 'swarm': {
      const target = lv.nearest(e.x, e.z);
      const flee = t > 7;
      let ax = 0;
      let az = 0;
      if (target && !flee) {
        const dx = target.x - e.x;
        const dz = target.z - e.z;
        const dl = Math.hypot(dx, dz) || 1;
        // they overshoot and wheel around rather than homing perfectly
        ax = (dx / dl) * 30 + Math.sin(t * 3 + e.id) * 14;
        az = (dz / dl) * 30 + Math.cos(t * 2.6 + e.id) * 10;
      } else az = -40;
      e.vx = clamp((e.vx || 0) + ax * DT * slow, -14, 14);
      e.vz = clamp((e.vz || 8) + az * DT * slow, -16, 14);
      const s = sz(lv, e) + e.vz * DT * (0.6 + lv.spec.difficulty * 0.2);
      moveTo(lv, e, e.x + e.vx * DT, s, true);
      break;
    }
    case 'gunship': {
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -12;
      const stay = d.stay ?? 6;
      if (t < 1.6) moveTo(lv, e, lerp(d.x0 ?? hx, hx, smooth(t / 1.6)), lerp(-HALF_H - 4, hz, smooth(t / 1.6)));
      else if (t < 1.6 + stay) {
        moveTo(lv, e, hx + Math.sin(t * 0.8) * 2, hz + Math.sin(t * 1.3) * 0.8);
        if (e.state !== 'windup') face(lv, e);
        e.aim = e.heading;
        if (e.state === 'idle') {
          d.fire = (d.fire ?? 0.4) - DT * pace(lv) * slow;
          if (d.fire <= 0 && live(lv, e)) {
            const ringNext = ((d.shots ?? 0) + 1) % 4 === 0;
            go(lv, e, 'windup', 0.5, ringNext ? 'pulse' : 'fan', ringNext ? { shape: 'ring', x: e.x, z: e.z, r: 10, w: 1 } : { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 30, z2: e.z + Math.cos(e.aim) * 30, w: 3, lock: 0.3 });
          }
        } else if (e.state === 'windup') {
          if (e.stateT < 0.3) face(lv, e, 0.2);
          if (over(e)) {
            d.shots = (d.shots ?? 0) + 1;
            if (d.shots % 4 === 0) {
              ring(lv, e, 6 + Math.round(lv.spec.difficulty * 4), 8, d.shots * 0.2);
              d.fire = 1.8;
            } else {
              fan(lv, e, lv.spec.difficulty > 0.8 ? 5 : 3, 0.6, 11);
              d.fire = 1.3;
            }
            go(lv, e, 'recover', 0.6);
          }
        } else if (over(e)) go(lv, e, 'idle');
      } else moveTo(lv, e, e.x + (hx < 0 ? -1 : 1) * 10 * DT * (t - 1.6 - stay), sz(lv, e) - 14 * DT * (t - 1.6 - stay), true);
      break;
    }
    case 'turret': {
      // fixed on the ground: it scrolls past with the land
      face(lv, e, 0.08);
      e.aim = e.heading;
      d.fire = (d.fire ?? 1.2) - DT * pace(lv) * slow;
      if (d.fire <= 0.4 && e.state === 'idle' && (d.shots ?? 0) % 3 === 0 && live(lv, e)) go(lv, e, 'windup', 0.4, 'burst');
      if (d.fire <= 0 && live(lv, e) && sz(lv, e) < HALF_H - 8) {
        if (e.state === 'windup') go(lv, e, 'idle');
        d.shots = (d.shots ?? 0) + 1;
        lv.bullet(e.x, e.z, e.heading, 12, { color: e.skin.colors[2], look: lookOf(lv, e) });
        lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2], look: lookOf(lv, e) });
        d.fire = d.shots % 3 === 0 ? 2.2 : 0.16;
      }
      break;
    }
    case 'bomber': {
      const dir = d.dir ?? 1;
      // across the whole width in about nine seconds, mining as it goes
      moveTo(lv, e, -dir * (HALF_W + 5) + dir * pt * 9, (d.sz0 ?? -14) + Math.sin(t) * 1.2);
      e.heading = (dir * Math.PI) / 2;
      d.fire = (d.fire ?? 0.8) - DT * pace(lv) * slow;
      if (d.fire <= 0 && live(lv, e)) {
        d.fire = 0.95;
        lv.bullet(e.x, e.z + 1, 0, 3.5, { kind: 'mine', r: 0.7, life: 1.8, split: 6 + Math.round(lv.spec.difficulty * 3), color: e.skin.colors[2], look: lookOf(lv, e) });
      }
      break;
    }
    case 'lancer': {
      const hx = d.hx ?? 0;
      const hz = d.hz ?? -14;
      if (t < 1.4) moveTo(lv, e, hx, lerp(-HALF_H - 4, hz, smooth(t / 1.4)));
      else if (t < (e.elite ? 40 : 7) || e.state === 'attack' || e.state === 'windup') {
        moveTo(lv, e, hx + Math.sin(t * 0.6) * 1.5, hz);
        const beam = lv.lasers.find((l) => l.owner === e.id);
        if (e.state === 'idle') {
          face(lv, e, 0.06);
          e.aim = e.heading;
          d.fire = (d.fire ?? 0.3) - DT * pace(lv) * slow;
          if (d.fire <= 0 && live(lv, e)) {
            d.fire = 2.2;
            // it aims a little to one side and sweeps through where you are
            d.dir = lv.rand() < 0.5 ? -1 : 1;
            const a = e.heading - d.dir * 0.18;
            e.aim = a;
            const len = 70;
            lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(a) * len, z2: e.z + Math.cos(a) * len, warn: 1.0, on: 0.55, color: e.skin.colors[2], owner: e.id });
            lv.emit({ type: 'telegraph', x: e.x, z: e.z, x2: e.x + Math.sin(a) * len, z2: e.z + Math.cos(a) * len, t: 1 });
            go(lv, e, 'windup', 1, 'beam', { shape: 'sweep', x: e.x, z: e.z, a0: a, a1: a + d.dir * 0.36, len, w: 1 });
          }
        } else if (e.state === 'windup') {
          if (beam && beam.warn <= 0) go(lv, e, 'attack', 0.55, 'beam');
          else if (!beam) go(lv, e, 'idle');
        } else if (e.state === 'attack') {
          // the sweep
          if (beam) {
            e.aim += (d.dir ?? 1) * 0.36 * (DT / 0.55);
            beam.x = e.x;
            beam.z = e.z;
            beam.x2 = e.x + Math.sin(e.aim) * 70;
            beam.z2 = e.z + Math.cos(e.aim) * 70;
            e.heading = e.aim;
          }
          if (!beam || over(e)) go(lv, e, 'recover', 1.2);
        } else if (over(e)) go(lv, e, 'idle');
      } else moveTo(lv, e, e.x, sz(lv, e) - (t - 7) * 30 * DT, true);
      break;
    }
    case 'brute': {
      // armoured, until it charges: a stamp, a lunge at you, a slam that rings out; then it's open
      const hx = d.hx ?? 0;
      if (t < 3) moveTo(lv, e, hx, lerp(-HALF_H - 5, -13, smooth(t / 3)));
      else if (t < (e.elite ? 45 : 16) || e.state !== 'idle') {
        if (e.state === 'idle' && d.ph === 1) {
          // back up to where it stands
          moveTo(lv, e, lerp(e.x, d.bx ?? hx, 0.04), lerp(sz(lv, e), d.bs ?? -13, 0.04), true);
          e.stateT = 0;
          if (Math.abs(sz(lv, e) - (d.bs ?? -13)) < 1.5) d.ph = 0;
        } else if (e.state === 'idle') {
          moveTo(lv, e, lerp(e.x, hx + Math.sin(t * 0.35) * 12, 0.03), lerp(sz(lv, e), -13 + Math.sin(t * 0.5), 0.05), true);
          e.heading = lerpAngle(e.heading, 0, 0.05);
          e.aim = lv.aim(e.x, e.z);
          // short spirals between charges
          d.angle = (d.angle ?? 0) + DT * 1.7 * slow;
          d.fire = (d.fire ?? 0) - DT * pace(lv) * slow;
          const burst = (e.stateT % 3.2) < 1.1 && e.stateT > 0.6;
          if (d.fire <= 0 && burst && live(lv, e)) {
            for (let k = 0; k < 3; k++) lv.bullet(e.x, e.z, d.angle + (k / 3) * Math.PI * 2, 8, { color: e.skin.colors[2], look: lookOf(lv, e) });
            d.fire = 0.2;
          }
          if (e.stateT > 4.4 && live(lv, e) && lv.nearest(e.x, e.z)) {
            const p = lv.nearest(e.x, e.z)!;
            e.aim = lv.aim(e.x, e.z);
            d.len = clamp(Math.hypot(p.x - e.x, p.z - e.z) + 3, 10, 30);
            d.bx = e.x;
            d.bs = sz(lv, e);
            go(lv, e, 'windup', 1.2, 'charge', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * d.len, z2: e.z + Math.cos(e.aim) * d.len, w: e.r * 1.6, lock: 0.6, body: true });
          }
        } else if (e.state === 'windup') {
          if (e.stateT < 0.6) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.1);
          e.heading = e.aim;
          const tl = e.tele;
          if (tl && tl.shape === 'line') {
            tl.x = e.x;
            tl.z = e.z;
            tl.x2 = e.x + Math.sin(e.aim) * (d.len ?? 20);
            tl.z2 = e.z + Math.cos(e.aim) * (d.len ?? 20);
          }
          moveTo(lv, e, e.x, sz(lv, e), true);
          if (over(e)) {
            d.gone = 0;
            go(lv, e, 'attack', 0, 'charge');
          }
        } else if (e.state === 'attack') {
          const sp = 32 * slow;
          moveTo(lv, e, clamp(e.x + Math.sin(e.aim) * sp * DT, -HALF_W + 3, HALF_W - 3), sz(lv, e) + Math.cos(e.aim) * sp * DT, true);
          d.gone = (d.gone ?? 0) + sp * DT;
          if (d.gone >= (d.len ?? 20) || sz(lv, e) > HALF_H - 4) {
            strike(lv, 'slam', e.x, e.z, { r: 3.6, warn: 0, active: 0.2, air: true, owner: e.id, color: e.skin.colors[2] });
            strike(lv, 'wave', e.x, e.z, { v: 12, w: 1, rMax: 15, warn: 0.05, active: 2, air: true, owner: e.id, color: e.skin.colors[2] });
            lv.emit({ type: 'crack', enemy: e.id, x: e.x, z: e.z });
            go(lv, e, 'recover', 1.6);
          }
        } else {
          // open (or knocked reeling by a parry)
          moveTo(lv, e, e.x, sz(lv, e), true);
          if (over(e)) {
            d.ph = 1;
            go(lv, e, 'idle');
          }
        }
      } else moveTo(lv, e, e.x, sz(lv, e) - (t - 16) * 20 * DT, true);
      break;
    }
    case 'serpent': {
      if (d.leader === undefined) {
        // the head: weaving across, leaving a trail for the body
        const s = -HALF_H - 3 + pt * 8.5;
        moveTo(lv, e, (d.x0 ?? 0) + Math.sin(t * 1.3 + (d.phase ?? 0)) * (d.amp ?? 10), s);
        (d.trail ??= []).push(e.x, s);
        if (d.trail.length > 400) d.trail.splice(0, 2);
        d.fire = (d.fire ?? 1.5) - DT * pace(lv) * slow;
        if (d.fire <= 0 && live(lv, e)) {
          d.fire = 1.6;
          fan(lv, e, 3, 0.35, 11);
        }
      } else {
        const head = lv.enemies.find((h) => h.id === d.leader);
        if (!head || head.dead) {
          // without its head it comes apart, from the front back
          d.stay = (d.stay ?? (d.index ?? 1) * 0.12) - DT;
          if (d.stay <= 0) lv.kill(e, 0);
          break;
        }
        const tr = head.d.trail ?? [];
        const k = tr.length - 2 - (d.index ?? 1) * 8;
        if (k >= 0) moveTo(lv, e, tr[k], tr[k + 1]);
        else {
          e.x = head.d.x0 ?? 0;
          e.z = lv.top - 5;
        }
        d.fire = (d.fire ?? 2 + (d.index ?? 0) * 0.4) - DT * slow;
        if (d.fire <= 0 && live(lv, e) && lv.spec.difficulty > 0.3) {
          d.fire = 5;
          const side = e.heading + Math.PI / 2;
          lv.bullet(e.x, e.z, side, 7, { color: e.skin.colors[2], look: lookOf(lv, e) });
          lv.bullet(e.x, e.z, side + Math.PI, 7, { color: e.skin.colors[2], look: lookOf(lv, e) });
        }
      }
      break;
    }
    case 'carrier': {
      const hx = d.hx ?? 0;
      if (t < 4) moveTo(lv, e, hx, lerp(-HALF_H - 6, -15, smooth(t / 4)));
      else if (t < (e.elite ? 45 : 20)) {
        moveTo(lv, e, hx + Math.sin(t * 0.25) * 10, -15 + Math.sin(t * 0.4));
        e.heading = 0;
        d.fire = (d.fire ?? 1) - DT * pace(lv) * slow;
        if (d.fire <= 0 && live(lv, e)) {
          d.shots = (d.shots ?? 0) + 1;
          d.fire = 1.3;
          if (d.shots % 2 === 0 && (d.spawned ?? 0) < 10) {
            // launches a pair from its bay
            const skin = lv.director.skinFor('swarm') ?? e.skin;
            for (const side of [-1, 1]) lv.spawn('swarm', skin, e.x + side * 2, e.z + 2, {}, { t: 0 });
            d.spawned = (d.spawned ?? 0) + 2;
          } else if (lv.spec.difficulty > 0.5) ring(lv, e, 8, 7.5, d.shots * 0.3);
        }
      } else moveTo(lv, e, e.x, sz(lv, e) - (t - 20) * 16 * DT, true);
      break;
    }
    case 'boss':
      updateBoss(lv, e);
      break;
  }
}
