/**
 * The dangers that aren't bullets: shells that land on a marker, acid that leaves a puddle, slams,
 * shockwave rings to dash through, spore puffs that jam your guns, gates that close, and harpoons
 * that hook you. Each has a warning (`warn` seconds) and then an active time; anything can be
 * dashed through, and a dash timed so it would have hit where you were is a perfect.
 *
 * Ground strikes (`air: false`) stand on the land and scroll past with it; air ones ride the screen.
 */

import type { Level, Player } from './level';
import { DT } from './types';
import { clamp, lerp } from '../util';

/** `ball`: a body its owner swings about (a crane's wrecking ball), hurting all the while it's out; `plate`: one it throws (ARU-0's ballast), the same until it's off the field. */
export type StrikeKind = 'shell' | 'acid' | 'puddle' | 'slam' | 'wave' | 'spore' | 'gate' | 'harpoon' | 'ball' | 'plate';

export interface Strike {
  kind: StrikeKind;
  x: number;
  z: number;
  /** Radius (a wave's: how far it has spread). */
  r: number;
  t: number;
  warn: number;
  active: number;
  /** Who made it (gates: both pylons). */
  owner: number;
  owner2: number;
  color: number;
  air: boolean;
  effect: 'hurt' | 'slow' | 'jam' | 'latch';
  /** Shells and acid: where they were thrown from (for the arc). */
  sx: number;
  sz: number;
  /** Waves: how fast they spread, how thick, and how far they go. */
  v: number;
  w: number;
  rMax: number;
  /** Gates: the gap's middle and half-width now, from gap0 closing to gap1 over `active`. */
  gx: number;
  gap: number;
  gap0: number;
  gap1: number;
  /** Velocity on the screen (harpoons, a boss's gate coming down). */
  vx: number;
  vz: number;
  /** Bit per player: already dealt with (hit, or dashed through). */
  hit: number;
  /** Shells: shards it bursts into where it lands (the Engine's ice). */
  shards: number;
  dead: boolean;
}

export function strike(lv: Level, kind: StrikeKind, x: number, z: number, opts: Partial<Strike> = {}): Strike {
  const s: Strike = {
    kind,
    x,
    z,
    r: 2,
    t: 0,
    warn: 1,
    active: 0.2,
    owner: 0,
    owner2: 0,
    color: 0xffb02a,
    air: false,
    effect: 'hurt',
    sx: x,
    sz: z,
    v: 0,
    w: 1,
    rMax: 0,
    gx: 0,
    gap: 0,
    gap0: 0,
    gap1: 0,
    vx: 0,
    vz: 0,
    hit: 0,
    shards: 0,
    dead: false,
    ...opts,
  };
  if (kind === 'wave') s.r = 0;
  if (kind === 'gate') s.gap = s.gap0;
  lv.strikes.push(s);
  return s;
}

/** Is (x, z) inside it right now (with a margin `m`)? */
export function inStrike(lv: Level, s: Strike, x: number, z: number, m: number, t = s.t) {
  if (t < s.warn && s.kind !== 'gate' && s.kind !== 'harpoon') return false;
  const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
  switch (s.kind) {
    case 'wave': {
      const r = Math.min(s.rMax, (t - s.warn) * s.v);
      if (r <= 0) return false;
      return Math.abs(Math.sqrt(d2) - r) < s.w / 2 + m;
    }
    case 'gate':
      return Math.abs(z - s.z) < 0.7 + m && Math.abs(x - s.gx) > s.gap - m;
    case 'harpoon':
      return d2 < (0.7 + m) ** 2;
    default:
      return t <= s.warn + s.active && d2 < (s.r + m) ** 2;
  }
}

export function updateStrikes(lv: Level, dz: number) {
  for (const s of lv.strikes) {
    if (s.dead) continue;
    const was = s.t;
    s.t += DT;
    if (s.air) s.z -= dz;
    s.x += s.vx * DT;
    s.z += s.vz * DT;
    // landing
    if (was < s.warn && s.t >= s.warn && s.kind !== 'gate' && s.kind !== 'harpoon') {
      lv.emit({ type: 'strike', kind: s.kind, x: s.x, z: s.z, r: s.kind === 'wave' ? s.rMax : s.r });
      for (let k = 0; k < s.shards; k++) lv.bullet(s.x, s.z, ((k + 0.5) / s.shards) * Math.PI * 2, 7, { color: s.color, kind: 'needle', r: 0.35 });
      if (s.kind === 'acid') {
        strike(lv, 'puddle', s.x, s.z, { r: s.r * 1.1, warn: 0, active: 2.5, color: s.color, owner: s.owner });
        s.dead = true;
        continue;
      }
    }
    if (s.kind === 'wave') {
      s.r = Math.max(0, Math.min(s.rMax, (s.t - s.warn) * s.v));
      if (s.r >= s.rMax) s.dead = true;
    } else if (s.kind === 'gate') {
      s.gap = lerp(s.gap0, s.gap1, clamp(s.t / s.active, 0, 1));
      const a = lv.enemies.find((e) => e.id === s.owner);
      const b = lv.enemies.find((e) => e.id === s.owner2);
      if (!a || a.dead || !b || b.dead) {
        s.dead = true;
        lv.emit({ type: 'strike', kind: 'gateDown', x: s.gx, z: s.z, r: 0 });
      } else if (s.z > lv.bottom + 4) s.dead = true;
    } else if (s.kind === 'ball' || s.kind === 'plate') {
      const o = lv.enemies.find((e) => e.id === s.owner);
      if (!o || o.dead || (s.kind === 'plate' && !lv.onScreen(s.x, s.z, 6))) s.dead = true;
    } else if (s.kind === 'harpoon') {
      const o = lv.enemies.find((e) => e.id === s.owner);
      if (s.t > s.active || !o || o.dead || !lv.onScreen(s.x, s.z, 2)) s.dead = true;
    } else if (s.t > s.warn + s.active) s.dead = true;
    if (!s.dead) for (const p of lv.players) if (!p.down && !(s.hit & (1 << p.id))) touch(lv, s, p);
  }
  let j = 0;
  for (const s of lv.strikes) if (!s.dead) lv.strikes[j++] = s;
  lv.strikes.length = j;
}

function touch(lv: Level, s: Strike, p: Player) {
  const core = p.stats.core;
  const bit = 1 << p.id;
  // dashed through it, timed right
  if (p.slip > 0 && inStrike(lv, s, p.slipX, lv.scroll + p.slipZ, core + 0.3)) {
    lv.perfectDash(p);
    if (s.kind === 'harpoon') s.dead = true;
    if (s.kind === 'wave' || s.kind === 'slam' || s.kind === 'gate') s.hit |= bit;
    return;
  }
  if (!inStrike(lv, s, p.x, p.z, core)) return;
  switch (s.effect) {
    case 'hurt':
      // a ring or a gate is passed once, hit or not; the rest burn while you're in them
      if (lv.hurt(p, p.x, p.z, s.kind) || s.kind === 'wave' || s.kind === 'gate' || s.kind === 'slam') s.hit |= s.kind === 'puddle' || s.kind === 'shell' || s.kind === 'ball' || s.kind === 'plate' ? 0 : bit;
      break;
    case 'slow':
      p.slow = Math.max(p.slow, 0.9);
      s.hit |= bit;
      lv.emit({ type: 'jam', id: p.id, dur: 0.9 });
      break;
    case 'jam':
      if (p.inv > 0) return;
      for (let k = 0; k < p.jam.length; k++) p.jam[k] = Math.max(p.jam[k], 1.2);
      p.slow = Math.max(p.slow, 0.4);
      s.hit |= bit;
      lv.emit({ type: 'jam', id: p.id, dur: 1.2 });
      break;
    case 'latch': {
      if (p.inv > 0) return;
      const o = lv.enemies.find((e) => e.id === s.owner);
      s.dead = true;
      if (!o || o.dead || lv.enemies.some((e) => e.grab === p.id)) return;
      o.grab = p.id;
      o.d.held = 0;
      lv.emit({ type: 'latch', id: p.id, enemy: o.id, x: p.x, z: p.z });
      break;
    }
  }
}
