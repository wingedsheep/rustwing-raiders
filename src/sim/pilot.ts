/**
 * The autopilot: flies a ship through a level using only what a player has (an Intent) and only
 * what's on the screen. Every frame it tries a fan of moves a half-second ahead against where the
 * bullets, lasers, hazards, the land and the enemies will be, and picks the one that stays clear
 * and gets it somewhere useful: under an enemy to shoot it, onto scrap, to a downed partner,
 * after a bounty before it gets away. (A race is flown by race-pilot.ts.) It boosts when the Burn is high and the screen is calm, likes to skim past
 * obstacles a little, and dashes through bullets at the last moment when it sees a perfect with a
 * safe place to come out. It's not meant to be perfect; it's meant to find unfair bits. A level that
 * the autopilot can't survive with a decent ship probably has a spot nobody could.
 *
 * Used by tools/autopilot.ts (headless, many seeds) and in the browser with ?autopilot.
 */

import type { Level, Player } from './level';
import { DT, HALF_H, HALF_W, type Intent } from './types';
import { clamp } from '../util';
import { newRacePilot, racePilot, type RacePilot } from './race-pilot';
import { holdFire, targetWorth, threatCost, threatDash } from './dodge';

const DIRS: [number, number][] = [[0, 0]];
for (let k = 0; k < 16; k++) DIRS.push([Math.cos((k / 16) * Math.PI * 2), Math.sin((k / 16) * Math.PI * 2)]);
const STEPS = [0.06, 0.12, 0.2, 0.3, 0.42, 0.56];
/** The dash as the level does it (see level.ts): speed, how long, and the slip at the start. */
const DASH_SPEED = 62;
const DASH_TIME = 0.13;
const SLIP = 0.12;
const DASH_RECOVER = 0.25;

export interface PilotState {
  /** The move it chose last frame, kept unless something's clearly better (no dithering). */
  last: number;
  lastFocus: boolean;
  /** Boosting (kept on until there's a reason to stop: no flicker). */
  boost: boolean;
  /** Never boost (to tell a hard layout from a greedy pilot). */
  noBoost: boolean;
  /** On a race, it flies with race-pilot.ts. */
  race: RacePilot;
}

export function newPilot(opts: { noBoost?: boolean } = {}): PilotState {
  return { last: 0, lastFocus: false, boost: false, noBoost: !!opts.noBoost, race: newRacePilot() };
}

export function pilot(lv: Level, p: Player, st: PilotState): Intent {
  if (lv.race) return racePilot(lv, p, st.race, st.noBoost);
  const intent: Intent = { x: 0, y: 0, fire: true, boost: 0, dash: false, special: false, aux: false, focus: false };
  if (p.down) return intent;
  const goal = goalFor(lv, p);
  let best = Infinity;
  let bestK = 0;
  let bestFocus = false;
  for (const focus of [false, true]) {
    for (let k = 0; k < DIRS.length; k++) {
      if (focus && k === 0) continue;
      let c = cost(lv, p, DIRS[k][0], DIRS[k][1], focus, goal);
      if (k === st.last && focus === st.lastFocus) c -= 0.8;
      if (c < best) {
        best = c;
        bestK = k;
        bestFocus = focus;
      }
    }
  }
  st.last = bestK;
  st.lastFocus = bestFocus;
  const [dx, dz] = DIRS[bestK];
  intent.x = dx;
  intent.y = -dz;
  intent.focus = bestFocus;
  // a dash: when nothing else works, or through bullets about to touch (a perfect), as long as
  // it comes out somewhere safe
  if (p.dashes > 0 && p.dashLock <= 0) {
    const plan = dashPlan(lv, p, goal);
    if (plan && (best > 400 || (plan.perfect && plan.safe))) {
      intent.dash = true;
      intent.x = DIRS[plan.k][0];
      intent.y = -DIRS[plan.k][1];
      intent.focus = false;
    } else if (best > 400) intent.dash = true;
    // the foes' own reasons to dash: hooked, or a ring to go through (see dodge.ts)
    const forced = threatDash(lv, p);
    if (forced) {
      intent.dash = true;
      intent.x = forced.x;
      intent.y = -forced.z;
      intent.focus = false;
    }
  }
  // boost when there's Burn to spare and nothing much going on; the boss fight, to get across
  // (not into laser gates or a dive coming: things arrive sooner at speed)
  const near = lv.bullets.filter((b) => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 14 * 14).length;
  const gates = lv.hazards.some((h) => h.kind === 'laser_gate' && h.z < p.z + 2);
  const dives = lv.enemies.some((e) => !e.dead && e.d.path === 'dive' && lv.onScreen(e.x, e.z));
  const calm = !gates && !dives;
  if (st.boost) st.boost = calm && p.burn > 0.06 && best < 120 && near < 8;
  else st.boost = calm && best < 60 && near < 5 && p.burn > 0.45 && lv.state === 'flying';
  if (lv.state === 'boss') st.boost = p.burn > 0.4 && Math.abs(goal.x - p.x) > 10;
  if (chasing(lv, p) && p.burn > 0.15 && best < 150) st.boost = true;
  intent.boost = st.boost && !st.noBoost ? 1 : 0;
  intent.aux = useAux(lv, p, best);
  // the special when it's needed
  if (p.charge >= 1 && (best > 250 || lv.state === 'boss' || lv.enemies.filter((e) => lv.onScreen(e.x, e.z)).length > 8)) intent.special = true;
  // let the guns cool if there's nothing to shoot
  const targets = lv.enemies.some((e) => !e.dead && lv.onScreen(e.x, e.z, -2));
  intent.fire = targets && !p.jam.some((j) => j > 0 && p.heat.every((h) => h > 0.85)) && !holdFire(lv, p);
  return intent;
}

function goalFor(lv: Level, p: Player): { x: number; z: number } {
  // a partner down: go and get them
  const partner = lv.players.find((q) => q !== p && q.down);
  if (partner) return { x: partner.x, z: partner.z };
  const bottom = lv.bottom - 9;
  const bounty = bountyGoal(lv, p);
  if (bounty) return bounty;
  // race rings coming up
  const ring = lv.pickups
    .filter((k) => k.kind === 'ring' && !(k.done! & (1 << p.id)) && k.z < p.z + 1 && k.z > lv.top)
    .sort((a, b) => b.z - a.z)[0];
  if (ring) return { x: ring.x, z: clamp(ring.z + 6, lv.top + 8, bottom) };
  // scrap close by
  const scrap = lv.pickups.filter((k) => k.kind !== 'ring' && lv.onScreen(k.x, k.z, -2) && (k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 100).sort(
    (a, b) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2),
  )[0];
  if (scrap && (scrap.kind !== 'scrap' || lv.bullets.length < 30)) return { x: scrap.x, z: scrap.z };
  // line up under the toughest thing on screen
  let target: { x: number; z: number } | undefined;
  let score = -Infinity;
  for (const e of lv.enemies) {
    if (e.dead || e.shielded || !lv.onScreen(e.x, e.z, -2)) continue;
    const s = (e.boss ? 100 : e.max / 10) * targetWorth(lv, e) - Math.abs(e.x - p.x) * 0.5;
    if (s > score) {
      score = s;
      target = e;
    }
  }
  if (target) return { x: target.x, z: clamp(target.z + 15, lv.scroll - 4, bottom) };
  // a canyon: keep to the middle of it
  const ahead = lv.top + 10;
  const rest = bottom;
  if (lv.terrain.biome(ahead).shape === 'canyon') return { x: lv.terrain.lineX(p.z - 12), z: rest };
  return { x: 0, z: rest };
}

/** A bounty on the screen: get after it (under it, or alongside it if it's low). */
function bountyGoal(lv: Level, p: Player) {
  let best: { x: number; z: number } | undefined;
  let bd = Infinity;
  for (const e of lv.enemies) {
    if (e.dead || !e.bounty || e.t < 0 || !lv.onScreen(e.x, e.z, -2)) continue;
    const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 0.5;
    if (d < bd) {
      bd = d;
      best = { x: e.x, z: clamp(e.z + 9, lv.top + 6, lv.bottom - 4) };
    }
  }
  return best;
}

/** Closing on something that'll get away. */
function chasing(lv: Level, p: Player) {
  return !lv.race && lv.enemies.some((e) => !e.dead && e.bounty && e.t >= 0 && lv.onScreen(e.x, e.z) && Math.hypot(e.x - p.x, e.z - p.z) > 10);
}

/**
 * The best dash from here: which way, whether it goes through a bullet in the slip (a perfect), and
 * whether where it comes out stays clear for a moment after.
 */
function dashPlan(lv: Level, p: Player, goal: { x: number; z: number }) {
  const core = p.stats.core;
  const scroll = lv.speedNow;
  // a perfect: something about to hit where it is now, inside the slip (but not so soon it lands first)
  let perfect = false;
  for (let f = 2; f * DT <= SLIP && !perfect; f++) {
    const t = f * DT;
    const z = p.z - scroll * t;
    for (const b of lv.bullets) {
      const hr = core + b.r + 0.2;
      if ((b.x + b.vx * t - p.x) ** 2 + (b.z + b.vz * t - z) ** 2 < hr * hr) {
        perfect = true;
        break;
      }
    }
  }
  let best: { k: number; perfect: boolean; safe: boolean; score: number } | null = null;
  for (let k = 1; k < DIRS.length; k++) {
    const [dx, dz] = DIRS[k];
    // where it comes out, held there with the screen a moment
    const ex = p.x + dx * DASH_SPEED * DASH_TIME;
    const ez = p.z + dz * DASH_SPEED * DASH_TIME - scroll * DASH_TIME;
    if (Math.abs(ex) > HALF_W - 1.5 || ez - lv.scroll < -HALF_H + 4 || ez - lv.scroll > HALF_H - 3) continue;
    let danger = 0;
    for (const t of [DASH_TIME, 0.22, 0.32, DASH_TIME + DASH_RECOVER, 0.5]) {
      const z = ez - scroll * (t - DASH_TIME);
      for (const b of lv.bullets) {
        const hr = core + b.r + 0.9;
        if ((b.x + b.vx * t - ex) ** 2 + (b.z + b.vz * t - z) ** 2 < hr * hr) danger++;
      }
      for (const e of lv.enemies) if (!e.dead && !e.ground && e.t >= 0 && (e.x - ex) ** 2 + (e.z - z) ** 2 < (e.r + 1.5) ** 2) danger++;
      if (threatCost(lv, ex, z, t, core) >= 500) danger++;
    }
    if (lv.terrain.solid(ex, ez, 1.6) || [...lv.terrain.colliders(ex, ez, 3)].some((c) => (c.x - ex) ** 2 + (c.z - ez) ** 2 < (c.r + 1.5) ** 2)) danger += 5;
    for (const l of lv.lasers) {
      const lx = l.x2 - l.x;
      const lz = l.z2 - l.z;
      const len = Math.hypot(lx, lz);
      const along = ((ex - l.x) * lx + (ez - l.z) * lz) / len;
      if (along > 0 && along < len && Math.abs((ex - l.x) * lz - (ez - l.z) * lx) / len < 2 + core && l.warn < 0.5) danger += 3;
    }
    const score = danger * 100 - (perfect ? 50 : 0) + Math.hypot(ex - goal.x, ez - goal.z) * 0.5;
    if (!best || score < best.score) best = { k, perfect, safe: danger === 0, score };
  }
  return best;
}

function cost(lv: Level, p: Player, dx: number, dz: number, focus: boolean, goal: { x: number; z: number }) {
  const s = p.stats;
  const sp = s.speed * (focus ? 0.45 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + 0.9 * p.boosting) * (p.shortcut >= 0 ? 1.4 : 1);
  const tvx = dx * sp;
  const tvz = dz * sp;
  const scroll = lv.speedNow;
  const core = s.core + 0.3;
  let c = 0;
  let x = p.x;
  let z = p.z;
  for (let i = 0; i < STEPS.length; i++) {
    const t = STEPS[i];
    const lag = Math.min(t, 0.07);
    x = clamp(p.x + p.vx * lag + tvx * (t - lag), -HALF_W + 1.2, HALF_W - 1.2);
    const sz = clamp(p.z - lv.scroll + p.vz * lag + tvz * (t - lag), -HALF_H + 3, HALF_H - 2);
    z = lv.scroll - scroll * t + sz;
    const weight = 1.6 - t;
    const safe = p.inv > t + 0.05;
    if (!safe) {
      for (const b of lv.bullets) {
        const bx = b.x + b.vx * t;
        const bz = b.z + b.vz * t;
        const dd = (bx - x) ** 2 + (bz - z) ** 2;
        const hr = core + b.r;
        if (dd < hr * hr) c += 1000 * weight;
        else if (dd < (hr + 2) ** 2) c += (hr + 2 - Math.sqrt(dd)) ** 2 * 4 * weight;
      }
      for (const l of lv.lasers) {
        if (l.warn > t + 0.15 || (l.warn <= 0 && l.on < t)) continue;
        const lx = l.x2 - l.x;
        const lz = l.z2 - l.z;
        const len = Math.hypot(lx, lz);
        const along = ((x - l.x) * lx + (z - l.z) * lz) / len;
        if (along < 0 || along > len) continue;
        const across = Math.abs((x - l.x) * lz - (z - l.z) * lx) / len;
        if (across < 1.0 + core + 0.4) c += 900 * weight;
      }
      for (const h of lv.hazards) {
        const hz = h.air ? h.z - scroll * t : h.z;
        if (h.kind === 'laser_gate') {
          const on = (h.t + t) % h.period > h.period * 0.45;
          if (on && Math.abs(z - hz) < 1.4) c += 900 * weight;
          continue;
        }
        if (h.t + t < h.warn - 0.3 || h.t + t > h.warn + h.active) continue;
        const dd = (h.x - x) ** 2 + (hz - z) ** 2;
        if (dd < (h.r + core + 0.6) ** 2) c += (h.kind === 'spore_cloud' ? 60 : 900) * weight;
      }
      for (const e of lv.enemies) {
        if (e.dead || e.ground || e.t < 0) continue;
        const ex = e.x + e.vx * t;
        const ez = e.z + (e.vz - scroll) * t;
        const r = e.r * 0.75 + core + 0.6;
        if ((ex - x) ** 2 + (ez - z) ** 2 < r * r) c += 700 * weight;
      }
      c += threatCost(lv, x, z, t, s.core) * weight;
    }
    for (const rv of lv.rivals) {
      const rx = rv.x + rv.vx * t;
      const rz = rv.z - rv.v * t;
      const dd = (rx - x) ** 2 + (rz - z) ** 2;
      if (dd < 3.2 * 3.2) c += 120 * weight;
    }
    if (p.phase <= t) {
      if (lv.terrain.solid(x, z, 1.4)) c += 950 * weight;
      for (const col of lv.terrain.colliders(x, z, 3)) {
        const dd = (col.x - x) ** 2 + (col.z - z) ** 2;
        if (dd < (col.r + 1.3) ** 2) {
          c += 950 * weight;
          break;
        }
        // a little closer than comfortable is worth it (Burn, risk): skim, a little
        if (t > 0.25 && dd < (col.r + 2.2) ** 2) c -= 2 * weight;
      }
    }
  }
  // getting where it wants to be (on the screen as it will be by then)
  const sz = z - (lv.scroll - scroll * STEPS[STEPS.length - 1]);
  c += Math.hypot(x - goal.x, (sz - (goal.z - lv.scroll)) * (lv.race ? 1.6 : 1)) * 0.9;
  // and not cornered
  if (Math.abs(x) > HALF_W - 4) c += (Math.abs(x) - HALF_W + 4) * 3;
  if (sz > HALF_H - 5) c += (sz - HALF_H + 5) * 3;
  if (sz < -HALF_H + (lv.race ? 6 : 10)) c += (-HALF_H + (lv.race ? 6 : 10) - sz) * 4;
  // the slow move is for squeezing through: a small cost so it's only used when it helps
  if (focus) c += 1.2;
  void DT;
  return c;
}

/**
 * The aux, crudely: parry what's about to land (a few frames out, inside the window), drink fire
 * when it's thick, throw a flare when a lot is coming, hook something ahead when it's calm.
 */
function useAux(lv: Level, p: Player, best: number): boolean {
  const s = p.stats;
  if (!s.aux || p.auxCd > 0 || p.auxT > 0) return false;
  const near = (r: number) => lv.bullets.filter((b) => (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < r * r).length;
  if (s.aux === 'parry') {
    // something reaches the parry reach in the next few frames (not so soon it lands first)
    for (const b of lv.bullets) {
      const t = 4 * DT;
      const z = p.z - lv.speedNow * t;
      if ((b.x + b.vx * t - p.x) ** 2 + (b.z + b.vz * t - z) ** 2 < 1.8 * 1.8) return true;
    }
    return false;
  }
  if (s.aux === 'siphon') return near(9) >= 6;
  if (s.aux === 'flare') return near(16) >= 8 || best > 300;
  // tether: something ahead, and nothing much in the way
  return best < 60 && near(10) < 3 && lv.enemies.some((e) => !e.dead && !e.shielded && e.t >= 0 && e.z < p.z && Math.abs(e.x - p.x) < 8 && p.z - e.z < 20);
}
