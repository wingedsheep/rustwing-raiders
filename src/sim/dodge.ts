/**
 * The autopilot's sense of the foes (see pilot.ts): what the strikes and the tells say is about
 * to be dangerous, and when only a dash will do (hooked, or a ring about to break over you). Crude
 * on purpose: it reads the same tells a player does, and no more.
 */

import type { Enemy, Level, Player } from './level';
import { clamp, lerp } from '../util';
import { WASH } from './heist';

/** How bad it is to be at (x, z) (the flight plane, `t` seconds from now). */
export function threatCost(lv: Level, x: number, z: number, t: number, core: number) {
  const scroll = lv.speedNow;
  const m = core + 0.5;
  let c = 0;
  // a seeker stopped to turn: the lane it has drawn, from just before it goes till it's well down it
  for (const b of lv.bullets) {
    const g = b.leg;
    if (b.dead || !g || g.halt <= 0 || t < g.halt - 0.3 || t > g.halt + 1.2) continue;
    const bz = b.z - scroll * t;
    const along = (x - b.x) * g.dx + (z - bz) * g.dz;
    const across = Math.abs((x - b.x) * g.dz - (z - bz) * g.dx);
    if (along > -1 && across < b.r + m + 0.3) c += 900;
  }
  for (const s of lv.strikes) {
    if (s.dead || s.hit) continue;
    const st = s.t + t;
    const sx = s.x + s.vx * t;
    const sz = s.z + s.vz * t - (s.air ? scroll * t : 0);
    const bad = s.effect === 'hurt' ? 900 : s.effect === 'latch' ? 800 : 150;
    const d2 = (sx - x) ** 2 + (sz - z) ** 2;
    switch (s.kind) {
      case 'wave': {
        const r = Math.min(s.rMax, (st - s.warn) * s.v);
        if (r > 0 && Math.abs(Math.sqrt(d2) - r) < s.w / 2 + m) c += bad;
        break;
      }
      case 'gate': {
        const gap = lerp(s.gap0, s.gap1, clamp(st / s.active, 0, 1));
        if (Math.abs(z - sz) < 1.4 + m && Math.abs(x - s.gx) > gap - m - 0.6) c += bad;
        // and line up on the gap well before it gets here
        else if (sz < z && z - sz < 18) c += Math.max(0, Math.abs(x - s.gx) - gap * 0.5) * 3;
        break;
      }
      case 'harpoon':
        if (d2 < (1.2 + m) ** 2) c += bad;
        break;
      default:
        if (st > s.warn - 0.35 && st < s.warn + s.active + 0.05 && d2 < (s.r + m) ** 2) c += bad;
    }
  }
  // a heist's runner: the wash behind its engines
  const hs = lv.heist;
  if (hs && !hs.gone) {
    for (const e of hs.engines) {
      const dz = z - (e.z + WASH.from);
      if (!e.dead && dz > -1 && dz < WASH.len + 1 && Math.abs(x - e.x) < WASH.half + m + 0.6) c += 700;
    }
  }
  for (const e of lv.enemies) {
    const tl = e.tele;
    if (e.dead || !tl) continue;
    const left = e.stateDur - e.stateT - t;
    // a sweep is worth getting out of from the start; the rest, as they're about to go
    // (a wide line, a big body coming down it: get out sooner)
    const early = e.state === 'windup' && left > (tl.shape === 'sweep' ? 2 : tl.shape === 'line' ? 0.3 + tl.w * 0.08 : 0.6);
    if (early && tl.shape !== 'line') continue;
    if (tl.shape === 'line') {
      const lx = tl.x2 - tl.x;
      const lz = tl.z2 - tl.z;
      const len = Math.hypot(lx, lz) || 1;
      const along = ((x - tl.x) * lx + (z - tl.z) * lz) / len;
      const across = Math.abs((x - tl.x) * lz - (z - tl.z) * lx) / len;
      // (a line still tracking is worth stepping off early: it'll lock where you were)
      if (along > -1 && along < len + 2 && across < tl.w / 2 + m + 0.8) c += early ? 200 : 500;
    } else if (tl.shape === 'circle') {
      const cz = tl.ground ? tl.z : tl.z - scroll * t;
      if ((tl.x - x) ** 2 + (cz - z) ** 2 < (tl.r + m) ** 2) c += 600;
    } else if (tl.shape === 'sweep') {
      // inside the wedge a beam is about to sweep
      const a = Math.atan2(x - e.x, z - e.z);
      const lo = Math.min(tl.a0, tl.a1);
      const hi = Math.max(tl.a0, tl.a1);
      const dist = Math.hypot(x - e.x, z - e.z);
      // how deep into the wedge (in units, counting the beam's width), so there's a way out to find
      const depth = (v: number) => Math.max(0, Math.min(v - lo, hi - v) * dist + 1.6 + m);
      const k = Math.max(depth(a), e.boss ? depth(-a) : 0);
      // worst where the beam comes on (a0), and on the way it's going
      const from = (v: number) => clamp(1 - Math.abs(v - tl.a0) / Math.max(0.05, Math.abs(tl.a1 - tl.a0)), 0, 1);
      const near0 = Math.max(from(a), e.boss ? from(-a) : 0);
      if (dist < tl.len && k > 0) c += (e.state === 'attack' ? 600 : 450) + k * 40 + near0 * 300;
    }
  }
  return c;
}

/**
 * When only a dash will do: hooked (dash to break free), or a ring or a beam about to break over
 * it. A dash isn't safe (what it runs into still hits), but fire landing where it left, in the
 * slip, is a perfect: so dash *out*, the way the danger's going, and let it take the empty spot.
 */
export function threatDash(lv: Level, p: Player): { x: number; z: number } | null {
  const hook = lv.enemies.find((e) => !e.dead && e.grab === p.id);
  if (hook) {
    const dx = p.x - hook.x;
    const dz = p.z - hook.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }
  // a sweeping beam about to cross it: dash on ahead of it, the way it's sweeping
  for (const e of lv.enemies) {
    const tl = e.tele;
    if (e.dead || e.boss || e.state !== 'attack' || !tl || tl.shape !== 'sweep') continue;
    const sg = Math.sign(tl.a1 - tl.a0);
    const pa = Math.atan2(p.x - e.x, p.z - e.z);
    const dist = Math.hypot(p.x - e.x, p.z - e.z);
    const ahead = (pa - e.aim) * sg;
    const rate = Math.abs(tl.a1 - tl.a0) / Math.max(0.3, e.stateDur);
    if (dist < tl.len && ahead > 0 && ahead * dist < rate * dist * 0.08 + 1.4 + p.stats.core) return { x: sg * Math.cos(pa), z: -sg * Math.sin(pa) };
  }
  for (const s of lv.strikes) {
    if (s.kind !== 'wave' || s.effect !== 'hurt' || s.dead || s.hit & (1 << p.id) || s.t < s.warn) continue;
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const gap = d - s.r;
    // (outwards, away from where it spreads from)
    if (gap > 0 && gap < s.v * 0.1 + s.w / 2 + p.stats.core && d < s.rMax) return { x: -dx / d, z: -dz / d };
  }
  return null;
}

/** How much a target is worth shooting at now (a closed shield or prism: not much; a bound boss: its pods first). */
export function targetWorth(lv: Level, e: Enemy) {
  if (e.state === 'hidden') return 0;
  if (e.arch === 'prism' && (e.state === 'idle' || e.state === 'attack')) return 0.2;
  if (e.guard > 0) return 0.4;
  if (e.arch === 'heartpod') return 3;
  if (e.boss && e.taken < 0.5) return 0.1;
  return Math.max(0.5, e.taken);
}

/** Hold fire: a closed prism in the line of fire throws it back. */
export function holdFire(lv: Level, p: Player) {
  return lv.enemies.some((e) => !e.dead && e.arch === 'prism' && (e.state === 'idle' || e.state === 'attack') && Math.abs(e.x - p.x) < 5 && e.z < p.z && !p.focus);
}
