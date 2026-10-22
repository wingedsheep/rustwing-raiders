/**
 * The autopilot: flies a ship through a level using only what a player has (an Intent) and only
 * what's on the screen. Every frame it tries a fan of moves a half-second ahead against where the
 * bullets, lasers, hazards, the land and the enemies will be, and picks the one that stays clear
 * and gets it somewhere useful: under an enemy to shoot it, onto scrap, to a downed partner,
 * after a bounty before it gets away. It fights at the range its guns want (close in with a
 * scattergun or a torch, stood off with rivets and rails; over the top of things with mines, so
 * they're behind it). It boosts when the Burn is high and the screen is calm, likes to skim past
 * obstacles a little, and dashes through bullets at the last moment when it sees a perfect with a
 * safe place to come out. It's not meant to be perfect; it's meant to find unfair bits. A level that
 * the autopilot can't survive with a decent ship probably has a spot nobody could.
 *
 * Used by tools/autopilot.ts (headless, many seeds) and in the browser with ?autopilot.
 */

import type { Bullet, Level, Player } from './level';
import type { Gun } from './build';
import { DT, HALF_H, HALF_W, type Intent } from './types';
import { clamp } from '../util';
import { holdFire, targetWorth, threatCost, threatDash } from './dodge';

/** How fast a bullet comes down the flight plane (a seeker keeps up with the screen: it's flown, not thrown). */
const fall = (lv: Level, b: Bullet) => (b.kind === 'seeker' ? b.vz - lv.speedNow : b.vz);

const DIRS: [number, number][] = [[0, 0]];
for (let k = 0; k < 16; k++) DIRS.push([Math.cos((k / 16) * Math.PI * 2), Math.sin((k / 16) * Math.PI * 2)]);
const STEPS = [0.06, 0.12, 0.2, 0.3, 0.42, 0.56];
/** The dash as the level does it (see level.ts): speed, how long, and the slip at the start. */
const DASH_SPEED = 62;
const DASH_TIME = 0.17;
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
}

export function newPilot(opts: { noBoost?: boolean } = {}): PilotState {
  return { last: 0, lastFocus: false, boost: false, noBoost: !!opts.noBoost };
}

/** Each beam's angle when last seen, and how fast it's turning (rad/s): a turning beam is dodged where it'll be. */
const spins = new WeakMap<object, { a: number; w: number; at: number }>();
function watchBeams(lv: Level) {
  for (const l of lv.lasers) {
    const a = Math.atan2(l.x2 - l.x, l.z2 - l.z);
    const was = spins.get(l);
    if (was && was.at === lv.time) continue;
    const w = was && lv.time > was.at ? Math.atan2(Math.sin(a - was.a), Math.cos(a - was.a)) / (lv.time - was.at) : 0;
    spins.set(l, { a, w, at: lv.time });
  }
}

export function pilot(lv: Level, p: Player, st: PilotState): Intent {
  const intent: Intent = { x: 0, y: 0, fire: true, heavy: false, boost: 0, dash: false, special: false, aux: false, focus: false };
  if (p.down) return intent;
  watchBeams(lv);
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
    // (never blind: a dash runs into whatever's in its way)
    if (plan && plan.clear && (best > 400 || (plan.perfect && plan.safe))) {
      intent.dash = true;
      intent.x = DIRS[plan.k][0];
      intent.y = -DIRS[plan.k][1];
      intent.focus = false;
    }
    // something reeling within reach: dash through it (a takedown), if the dash's way is clear
    const td = !intent.dash && plan ? takedownDash(lv, p) : null;
    if (td) {
      intent.dash = true;
      intent.x = DIRS[td][0];
      intent.y = -DIRS[td][1];
      intent.focus = false;
    }
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
  // the heavies: a round now and then while there's something to shoot, never the last one in a hurry
  // (mines want something close behind to drop on: hold them till there is)
  intent.heavy = intent.fire && p.heavyT > 0.45 && p.rounds.some((r) => r > 0);
  if (intent.heavy && style(p).mines) intent.heavy = lv.enemies.some((e) => !e.dead && e.t >= 0 && e.z > p.z - 2 && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 10 * 10);
  // the Weld: full with a good bite out of the hull and a quiet moment (nothing near, an easy way to go), mend
  if (p.weld >= 1 && p.hp <= p.stats.hp * 0.8 && !intent.dash && near <= 2 && best < 60) {
    intent.focus = true;
    intent.fire = false;
    intent.heavy = false;
    intent.special = false;
    intent.aux = false;
  }
  return intent;
}

/** How far a gun's fire carries. */
function reach(g: Gun) {
  const sp = g.spec;
  if (sp.shot === 'beam') return 30;
  if (sp.shot === 'arc') return 15;
  if (sp.shot === 'mine') return 0;
  return sp.speed * sp.life;
}

const styles = new WeakMap<object, { standoff: number; mines: boolean }>();
/**
 * How a ship wants to fight, from its guns: how far below its target to sit (most of its damage
 * has to reach: a scattergun's pellets die at 18, a torch's flame at 10, rivets carry 50), and
 * whether it's mine-led (it wants things behind it).
 */
function style(p: Player) {
  let st = styles.get(p.stats);
  if (st) return st;
  let w = 0;
  let wr = 0;
  let mine = 0;
  for (const g of p.stats.guns) {
    const sp = g.spec;
    // what it puts out a second (a heavy counts half: it's only some of the presses)
    const dps = sp.damage * sp.count * sp.rate * (sp.heavy ? 0.5 : 1);
    if (sp.shot === 'mine') mine += dps;
    else {
      w += dps;
      wr += dps * reach(g);
    }
  }
  st = { standoff: w ? clamp((wr / w) * 0.4, 5, 15) : 15, mines: mine > w };
  styles.set(p.stats, st);
  return st;
}

function goalFor(lv: Level, p: Player): { x: number; z: number } {
  // a partner down: go and get them
  const partner = lv.players.find((q) => q !== p && q.down);
  if (partner) return { x: partner.x, z: partner.z };
  const bottom = lv.bottom - 9;
  // a beam broken at a distance (the Engine's scan): the break is the one place it doesn't reach
  const far = lv.lasers.find((l) => l.r0);
  if (far) {
    const near = lv.lasers.find((l) => l.owner === far.owner && !l.r0);
    const r = ((near ? Math.hypot(near.x2 - near.x, near.z2 - near.z) : 0) + far.r0!) / 2;
    const a = Math.atan2(p.x - far.x, p.z - far.z);
    return { x: clamp(far.x + Math.sin(a) * r, -HALF_W + 3, HALF_W - 3), z: clamp(far.z + Math.cos(a) * r, lv.top + 6, bottom) };
  }
  // a broadside (Istra's): run with her, in the gap under her waist
  const broad = lv.enemies.find((e) => !e.dead && e.boss?.move === 'broadside' && e.tele?.shape === 'gate');
  if (broad && broad.tele?.shape === 'gate') return { x: clamp(broad.tele.gx, -HALF_W + 3, HALF_W - 3), z: clamp(p.z, lv.scroll - 2, bottom) };
  // an escort: boarders on a hull (or lining up on one) come first
  if (lv.convoy) {
    let board: { x: number; z: number } | undefined;
    let bd = Infinity;
    for (const e of lv.enemies) {
      if (e.dead || e.d.board === undefined || (e.d.ph ?? 0) < 1 || (e.d.ph ?? 0) > 3 || !lv.onScreen(e.x, e.z, -2)) continue;
      const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 0.5 - (e.d.ph === 3 ? 20 : 0);
      if (d < bd) {
        bd = d;
        board = { x: e.x, z: clamp(e.z + 8, lv.top + 6, bottom) };
      }
    }
    if (board) return board;
  }
  // a heist: a strongbox falling comes first; then under the runner's parts (not in their wash)
  if (lv.heist) {
    const hs = lv.heist;
    const box = hs.loose.filter((c) => !c.dead).sort((a, b) => b.z - a.z)[0];
    if (box) return { x: box.x, z: clamp(box.z + 2, lv.top + 6, bottom) };
    if (!hs.gone) {
      const want = hs.pods.find((e) => !e.dead) ?? hs.engines.find((e) => !e.dead) ?? (hs.core.shielded ? undefined : hs.core);
      if (want) {
        // off to the side of an engine's wash, below the hull
        const off = want.d.qp === 'engine' ? (want.x < hs.x ? -2.6 : 2.6) : 0;
        return { x: want.x + off, z: clamp(hs.z + 18, lv.top + 6, bottom) };
      }
    }
  }
  const bounty = bountyGoal(lv, p);
  if (bounty) return bounty;
  // rings coming up
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
  if (target) {
    const st = style(p);
    // mines: over the top of it, so it's behind; anything else: under it, as close as the guns need
    const z = st.mines ? target.z - 5 : target.z + st.standoff;
    return { x: target.x, z: clamp(z, st.mines ? lv.top + 6 : lv.scroll - 4, bottom) };
  }
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
  return lv.enemies.some((e) => !e.dead && e.bounty && e.t >= 0 && lv.onScreen(e.x, e.z) && Math.hypot(e.x - p.x, e.z - p.z) > 10);
}

/** A takedown: the way to dash (an index into DIRS) that passes through something staggered, if one does. */
function takedownDash(lv: Level, p: Player): number | null {
  const reach = DASH_SPEED * DASH_TIME;
  for (const e of lv.enemies) {
    if (e.dead || e.ground || e.t < 0 || e.state !== 'stagger' || e.d.td) continue;
    const ex = e.x - p.x;
    const ez = e.z - p.z;
    if (ex * ex + ez * ez > (reach + e.r) ** 2) continue;
    let best = -1;
    let miss = Infinity;
    for (let k = 1; k < DIRS.length; k++) {
      const [dx, dz] = DIRS[k];
      const l = Math.hypot(dx, dz);
      const along = clamp((ex * dx + ez * dz) / l, 0, reach);
      const off = Math.hypot(ex - (dx / l) * along, ez - (dz / l) * along);
      if (off < miss) {
        miss = off;
        best = k;
      }
    }
    if (best > 0 && miss < e.r + p.stats.core + 0.8) return best;
  }
  return null;
}

/**
 * The best dash from here: which way, whether fire was about to land where it is (dashing out of
 * it in the slip is a perfect), whether the way out is clear (a dash isn't safe: what it runs into
 * still hits, unless a Slip Field shrouds it), and whether where it comes out stays clear after.
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
      if ((b.x + b.vx * t - p.x) ** 2 + (b.z + fall(lv, b) * t - z) ** 2 < hr * hr) {
        perfect = true;
        break;
      }
    }
  }
  let best: { k: number; perfect: boolean; safe: boolean; clear: boolean; score: number } | null = null;
  for (let k = 1; k < DIRS.length; k++) {
    const [dx, dz] = DIRS[k];
    // where it comes out, held there with the screen a moment
    const ex = p.x + dx * DASH_SPEED * DASH_TIME;
    const ez = p.z + dz * DASH_SPEED * DASH_TIME - scroll * DASH_TIME;
    if (Math.abs(ex) > HALF_W - 1.5 || ez - lv.scroll < -HALF_H + 4 || ez - lv.scroll > HALF_H - 3) continue;
    let danger = 0;
    // the way out: anything it'd run into on the way (a shrouded dash flies through fire and foes,
    // not the land)
    let way = 0;
    for (const f of [0.2, 0.4, 0.6, 0.8]) {
      const t = DASH_TIME * f;
      const x = p.x + dx * DASH_SPEED * t;
      const z = p.z + dz * DASH_SPEED * t - scroll * t;
      if (lv.terrain.solid(x, z, 1.4) || [...lv.terrain.colliders(x, z, 3)].some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 1.3) ** 2)) way += 5;
      for (const b of lv.bullets) {
        const hr = core + b.r + 0.4;
        if ((b.x + b.vx * t - x) ** 2 + (b.z + fall(lv, b) * t - z) ** 2 < hr * hr) way += 2;
      }
      // (and beams: a dash through a live one is a hit)
      for (const l of lv.lasers) {
        if (l.warn > t) continue;
        const len = Math.hypot(l.x2 - l.x, l.z2 - l.z) || 1;
        const along = ((x - l.x) * (l.x2 - l.x) + (z - l.z) * (l.z2 - l.z)) / len;
        if (along > (l.r0 ?? 0) && along < len && Math.abs((x - l.x) * (l.z2 - l.z) - (z - l.z) * (l.x2 - l.x)) / len < 1.6 + core) way += 3;
      }
      // (not what's staggered: a dash through that is a takedown, see takedownDash)
      for (const e of lv.enemies) if (!e.dead && !e.ground && e.t >= 0 && e.state !== 'stagger' && (e.x + e.vx * t - x) ** 2 + (e.z + (e.vz - scroll) * t - z) ** 2 < (e.r * 0.75 + core + 0.6) ** 2) way += 3;
      if (threatCost(lv, x, z, t, core) >= 500) way += 3;
    }
    danger += way;
    for (const t of [DASH_TIME, 0.22, 0.32, DASH_TIME + DASH_RECOVER, 0.5]) {
      const z = ez - scroll * (t - DASH_TIME);
      for (const b of lv.bullets) {
        const hr = core + b.r + 0.9;
        if ((b.x + b.vx * t - ex) ** 2 + (b.z + fall(lv, b) * t - z) ** 2 < hr * hr) danger++;
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
      if (along > (l.r0 ?? 0) && along < len && Math.abs((ex - l.x) * lz - (ez - l.z) * lx) / len < 2 + core && l.warn < 0.5) danger += 3;
    }
    const score = danger * 100 - (perfect ? 50 : 0) + Math.hypot(ex - goal.x, ez - goal.z) * 0.5;
    if (!best || score < best.score) best = { k, perfect, safe: danger === 0, clear: way === 0, score };
  }
  return best;
}

function cost(lv: Level, p: Player, dx: number, dz: number, focus: boolean, goal: { x: number; z: number }) {
  const s = p.stats;
  const sp = s.speed * (focus ? 0.45 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + 0.9 * p.boosting);
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
        const bz = b.z + fall(lv, b) * t;
        const dd = (bx - x) ** 2 + (bz - z) ** 2;
        const hr = core + b.r;
        if (dd < hr * hr) c += 1000 * weight;
        else if (dd < (hr + 2) ** 2) c += (hr + 2 - Math.sqrt(dd)) ** 2 * 4 * weight;
      }
      for (const l of lv.lasers) {
        if (l.warn > t + 0.15 || (l.warn <= 0 && l.on < t)) continue;
        // where it'll be pointing by then (turning beams sweep on)
        const len = Math.hypot(l.x2 - l.x, l.z2 - l.z);
        const sp = spins.get(l);
        const la = sp ? sp.a + sp.w * t : Math.atan2(l.x2 - l.x, l.z2 - l.z);
        const lx = Math.sin(la) * len;
        const lz = Math.cos(la) * len;
        const along = ((x - l.x) * lx + (z - l.z) * lz) / len;
        if (along < (l.r0 ?? 0) || along > len) continue;
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
  c += Math.hypot(x - goal.x, sz - (goal.z - lv.scroll)) * 0.9;
  // and not cornered
  if (Math.abs(x) > HALF_W - 4) c += (Math.abs(x) - HALF_W + 4) * 3;
  if (sz > HALF_H - 5) c += (sz - HALF_H + 5) * 3;
  if (sz < -HALF_H + 10) c += (-HALF_H + 10 - sz) * 4;
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
      if ((b.x + b.vx * t - p.x) ** 2 + (b.z + fall(lv, b) * t - z) ** 2 < 1.8 * 1.8) return true;
    }
    return false;
  }
  if (s.aux === 'siphon') return near(9) >= 6;
  if (s.aux === 'flare') return near(16) >= 8 || best > 300;
  // tether: something ahead, and nothing much in the way
  return best < 60 && near(10) < 3 && lv.enemies.some((e) => !e.dead && !e.shielded && e.t >= 0 && e.z < p.z && Math.abs(e.x - p.x) < 8 && p.z - e.z < 20);
}
