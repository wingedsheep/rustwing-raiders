/**
 * Bosses: one per planet, each a big model with gun mounts and glowing weak points (read from the
 * model, see tools/models/bosses.py), fighting in three phases. Each boss has a personality, and
 * between its bullet patterns (the filler, kept light) it makes set-piece moves: a tell, the move,
 * then a recovery where it's open (weak points worth far more).
 *
 *  - brawler (Vask, Khet, Istra): charges at you across its arena and slams; one that charges into
 *    the edge, or is parried, is left reeling.
 *  - fortress (Oko, the Waking Engine): armoured but for its weak points, which only open after it
 *    commits: sweeping beams, closing walls, shellfire.
 *  - pursuer (the Sandking, ARU-0): a chase first, the level still racing by, with it coming up
 *    behind you; then it overtakes, and the screen holds for the rest.
 *  - hive (the Mother-of-Spores): bound to heartpods; kill them to open her up.
 */

import type { Enemy, Level } from './level';
import { DT, HALF_H, HALF_W } from './types';
import { metaOf } from './meta';
import { clamp, hashStr, lerp, rng, shuffle, smooth } from '../util';
import { go, over, release, type AttackKind, type Tele } from './combat';
import { foeSkin, type Foe } from './factions';
import { lerpAngle } from './foes';
import { strike } from './strikes';

export type BossStyle = 'brawler' | 'fortress' | 'pursuer' | 'hive';
export type BossMove = 'charge' | 'slam' | 'sweep' | 'gate' | 'shells' | 'harpoon' | 'spores' | 'summon' | 'lunge';

export interface BossState {
  style: BossStyle;
  phase: number;
  /** Ship-local mount points (x right, z towards the camera). */
  guns: { x: number; z: number }[];
  weak: { x: number; z: number }[];
  patterns: Pattern[][];
  moves: BossMove[][];
  current: number;
  /** Seconds into the current pattern. */
  pt: number;
  angle: number;
  fire: number;
  shots: number;
  shieldT: number;
  summon: number;
  /** The set piece it's making (null: patterns). */
  move: BossMove | null;
  moveN: number;
  /** Where it is on the screen (x, and z from the middle), and the move's working numbers. */
  sx: number;
  ss: number;
  mx: number;
  ms: number;
  gone: number;
  len: number;
  /** A charge stopped by a parry; a harpoon broken free of. */
  parried: boolean;
  yanked: boolean;
  /** Seconds into the chase (pursuers). */
  chaseT: number;
  /** Phases that have had their pods (hive). */
  pods: number;
}

type Pattern = 'fans' | 'spiral' | 'rain' | 'rings' | 'walls' | 'lasers' | 'splitters' | 'curves';

const LENGTH: Record<Pattern, number> = { fans: 3.5, spiral: 4, rain: 3.5, rings: 3.5, walls: 4, lasers: 4, splitters: 3.5, curves: 4 };

/** Bosses lean on patterns that suit them. */
const FAVOURITES: Record<string, Pattern[]> = {
  orutal: ['fans', 'curves', 'rain', 'splitters'],
  halcyon: ['lasers', 'walls', 'fans', 'rings'],
  kessra: ['walls', 'rain', 'splitters', 'fans'],
  mirefall: ['spiral', 'curves', 'splitters', 'rings'],
  glacis: ['lasers', 'spiral', 'rings', 'walls'],
  ashgrave: ['fans', 'walls', 'lasers', 'rain'],
  vesh: ['curves', 'rings', 'spiral', 'fans'],
  cinder: ['lasers', 'walls', 'splitters', 'spiral'],
};

const STYLE: Record<string, BossStyle> = {
  orutal: 'brawler',
  ashgrave: 'brawler',
  vesh: 'brawler',
  halcyon: 'fortress',
  glacis: 'fortress',
  kessra: 'pursuer',
  cinder: 'pursuer',
  mirefall: 'hive',
};

const MOVES: Record<BossStyle, BossMove[][]> = {
  brawler: [['charge', 'slam'], ['charge', 'summon', 'slam'], ['charge', 'slam', 'charge', 'summon']],
  fortress: [['sweep', 'shells'], ['gate', 'sweep', 'shells'], ['gate', 'sweep', 'summon', 'shells']],
  pursuer: [['lunge', 'shells'], ['charge', 'shells', 'harpoon'], ['charge', 'harpoon', 'shells', 'summon']],
  hive: [['spores', 'harpoon'], ['spores', 'summon', 'harpoon'], ['spores', 'harpoon', 'summon']],
};

const KIND: Record<BossMove, AttackKind> = { charge: 'charge', lunge: 'charge', slam: 'slam', sweep: 'sweep', gate: 'gate', shells: 'shell', harpoon: 'harpoon', spores: 'spores', summon: 'pulse' };

/** Who comes when it calls. */
const HELP: Record<string, [Foe, number]> = {
  orutal: ['swooper', 2],
  ashgrave: ['ramjack', 2],
  vesh: ['rattler', 2],
  halcyon: ['warden', 2],
  glacis: ['prism', 2],
  kessra: ['rattler', 2],
  cinder: ['hookjaw', 1],
  mirefall: ['puffball', 7],
};

/** Its home spot (screen z), and the chase spot behind you. */
const HZ = -12.5;
const CHASE_S = HALF_H + 3;

export function makeBoss(planet: string): BossState {
  const m = metaOf(`boss_${planet}`);
  const guns = m?.mounts.filter((k) => k.type === 'gun').map((k) => ({ x: k.p[0], z: k.p[2] })) ?? [];
  const weak = m?.mounts.filter((k) => k.type === 'weak').map((k) => ({ x: k.p[0], z: k.p[2] })) ?? [];
  if (!guns.length) guns.push({ x: -4, z: 2 }, { x: 4, z: 2 }, { x: 0, z: 3 });
  if (!weak.length) weak.push({ x: 0, z: 0 });
  const r = rng(hashStr(planet));
  const fav = shuffle(r, [...(FAVOURITES[planet] ?? ['fans', 'rings', 'spiral', 'walls'])]);
  const style = STYLE[planet] ?? 'brawler';
  const moves = MOVES[style].map((l) => [...l]);
  // Khet hooks you in his last phase; the others slam
  if (planet === 'ashgrave') moves[2][1] = 'harpoon';
  return {
    style,
    phase: 0,
    guns,
    weak,
    // fewer patterns at once: the last phase no longer stacks a third on
    patterns: [[fav[0], fav[1]], [fav[1], fav[2]], [fav[2], fav[3]]],
    moves,
    current: 0,
    pt: 0,
    angle: 0,
    fire: 0,
    shots: 0,
    shieldT: 0,
    summon: 6,
    move: null,
    moveN: 0,
    sx: 0,
    ss: style === 'pursuer' ? CHASE_S : HZ,
    mx: 0,
    ms: 0,
    gone: 0,
    len: 0,
    parried: false,
    yanked: false,
    chaseT: 0,
    pods: -1,
  };
}

/** What a hit is worth on it now: armour, and the weak points when it's open. */
export function bossTaken(lv: Level, e: Enemy, crit: boolean) {
  const b = e.boss!;
  const open = e.state === 'recover' || e.state === 'stagger';
  if (crit && open) lv.emit({ type: 'weakHit', enemy: e.id, x: e.x, z: e.z, dmg: 0 });
  switch (b.style) {
    case 'brawler':
      return open ? 1.5 : crit ? 1 : 0.8;
    case 'fortress':
      return open ? (crit ? 1.75 : 0.6) : crit ? 1 : 0.35;
    case 'pursuer':
      return open ? 1.6 : 1;
    case 'hive':
      if (lv.enemies.some((o) => !o.dead && o.links.includes(e.id))) return 0.15;
      return open ? 1.6 : 1.2;
  }
}

/** Glacis, in its last phase: closed, it throws shots back (unless they're fired true). */
export const bossReflects = (lv: Level, e: Enemy) => lv.spec.planet.id === 'glacis' && e.boss!.phase === 2 && !e.boss!.move;

export function updateBoss(lv: Level, e: Enemy) {
  const b = e.boss!;
  const t = e.t;
  // coming on: from above (or for a pursuer, from behind), untouchable
  if (t < 3.5) {
    e.shielded = true;
    if (b.style === 'pursuer') {
      lv.chase = true;
      e.x = Math.sin(t) * 2;
      e.z = lv.scroll + lerp(HALF_H + 8, CHASE_S, smooth(t / 3.5));
      b.sx = e.x;
      b.ss = e.z - lv.scroll;
    } else {
      e.x = Math.sin(t) * 2;
      e.z = lv.scroll + lerp(-40, HZ, smooth(t / 3.5));
      b.ss = HZ;
    }
    return;
  }
  b.shieldT = Math.max(0, b.shieldT - DT);
  e.shielded = b.shieldT > 0;
  e.heading = 0;

  // phases at two thirds and one third (a chase ends after half a minute regardless)
  if (b.style === 'pursuer' && b.phase === 0) b.chaseT += DT;
  let want = e.hp < e.max / 3 ? 2 : e.hp < (e.max * 2) / 3 ? 1 : 0;
  if (b.style === 'pursuer' && b.chaseT > 30) want = Math.max(want, 1);
  if (want > b.phase && !b.move) {
    b.phase = want;
    b.current = 0;
    b.pt = 0;
    b.shieldT = 1.6;
    b.moveN = 0;
    lv.chase = false;
    for (const x of lv.bullets) lv.cancel(x);
    lv.lasers.length = 0;
    lv.emit({ type: 'bossPhase', phase: b.phase, style: b.style });
    lv.emit({ type: 'explode', x: e.x, z: e.z, y: e.y, size: 4, color: e.skin.colors[2] });
  }
  if (b.style === 'pursuer' && b.phase === 0) lv.chase = true;
  // the hive's pods, a few more each phase
  if (b.style === 'hive' && b.pods < b.phase && t > 4) {
    b.pods = b.phase;
    const skin = foeSkin(lv.spec.planet, 'heartpod');
    const n = 2 + b.phase;
    for (let k = 0; k < n; k++) {
      const hx = lerp(-HALF_W + 8, HALF_W - 8, (k + 0.5) / n);
      lv.spawn('heartpod', skin, hx, lv.top - 4, { hx, hz: -19 + (k % 2) * 5, host: e.id, stay: 999 });
    }
  }

  if (b.move) runMove(lv, e, b);
  else home(lv, e, b);
  e.x = b.sx;
  e.z = lv.scroll + b.ss;
  if (e.shielded || e.stun > 0 || b.move) return;

  // patterns, then a breath, then a move, then a breath...
  const list = b.patterns[b.phase];
  const pat = list[b.current % list.length];
  // on a chase it's all moves (a breath between them)
  const chase = b.style === 'pursuer' && b.phase === 0;
  const len = chase ? 0.6 : LENGTH[pat];
  b.pt += DT;
  if (b.pt > len + 0.9) {
    b.current++;
    b.pt = 0;
    b.fire = 0;
    startMove(lv, e, b);
    return;
  }
  if (b.pt > len || chase) return;
  run(lv, e, b, pat);
}

/** Drifting about its home spot (or, on a chase, about the spot behind you). */
function home(lv: Level, e: Enemy, b: BossState) {
  const fast = 1 + b.phase * 0.35;
  const chase = b.style === 'pursuer' && b.phase === 0;
  const px = lv.nearest(e.x, e.z)?.x ?? 0;
  // on a chase it drops back behind you round your side, not through you
  const back = chase && b.ss < CHASE_S - 6;
  const tx = back ? (px > 0 ? -1 : 1) * (HALF_W - 9) : chase ? clamp(px, -HALF_W + 10, HALF_W - 10) * 0.6 : Math.sin((e.t - 3.5) * 0.35 * fast) * (HALF_W - 18);
  const ts = chase ? CHASE_S : HZ + Math.sin(e.t * 0.8) * 1.2;
  b.sx += clamp((tx - b.sx) * 2, -9, 9) * DT;
  b.ss += clamp((ts - b.ss) * 2, -10, 10) * DT * (back && Math.abs(b.sx - tx) > 6 ? 0.2 : 1);
}

function startMove(lv: Level, e: Enemy, b: BossState) {
  const list = b.moves[b.phase];
  const m = list[b.moveN++ % list.length];
  b.move = m;
  b.parried = false;
  b.yanked = false;
  const p = lv.nearest(e.x, e.z);
  const px = p?.x ?? 0;
  const pz = p?.z ?? lv.bottom - 8;
  const aim = Math.atan2(px - e.x, pz - e.z);
  e.aim = aim;
  const line = (len: number, w: number, lock: number, body = false): Tele => ({ shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(aim) * len, z2: e.z + Math.cos(aim) * len, w, lock, body });
  switch (m) {
    case 'charge':
    case 'lunge': {
      b.len = m === 'lunge' ? Math.max(14, e.z - pz + 8) : clamp(Math.hypot(px - e.x, pz - e.z) + 6, 16, 40);
      if (m === 'lunge') e.aim = Math.PI;
      go(lv, e, 'windup', 1.2, 'charge', m === 'lunge' ? { shape: 'line', x: e.x, z: e.z, x2: e.x, z2: e.z - b.len, w: e.r * 1.4, lock: 0.8, body: true } : line(b.len, e.r * 1.4, 0.8, true));
      break;
    }
    case 'slam':
      go(lv, e, 'windup', 0.9, 'slam', { shape: 'ring', x: e.x, z: e.z, r: 22, w: 1.2 });
      break;
    case 'sweep':
      b.mx = b.phase >= 2 ? -1 : 1;
      go(lv, e, 'windup', 1.1, 'sweep', { shape: 'sweep', x: e.x, z: e.z, a0: b.mx > 0 ? 1.1 : 0.15, a1: b.mx > 0 ? 0.15 : 1.1, len: 70, w: 1 });
      // both beams pre-drawn: a pair of scissors (closing to the middle, or opening to the sides)
      for (const sgn of [-1, 1]) {
        const a = sgn * (b.mx > 0 ? 1.1 : 0.15);
        lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(a) * 70, z2: e.z + Math.cos(a) * 70, warn: 1.1, on: 1.6, color: e.skin.colors[2], owner: e.id });
      }
      break;
    case 'gate': {
      b.mx = clamp(px + (lv.rand() - 0.5) * 30, -HALF_W + 9, HALF_W - 9);
      go(lv, e, 'windup', 1.0, 'gate', { shape: 'gate', x: -HALF_W, x2: HALF_W, z: e.z + 7, gx: b.mx, gap: 14 });
      break;
    }
    case 'shells':
      go(lv, e, 'windup', 0.6, 'shell', { shape: 'circle', x: px, z: pz, r: 3, ground: b.style === 'pursuer' && b.phase === 0 });
      break;
    case 'harpoon':
      go(lv, e, 'windup', 0.9, 'harpoon', line(60, 0.7, 0.6));
      break;
    case 'spores':
      go(lv, e, 'windup', 0.8, 'spores', { shape: 'ring', x: e.x, z: e.z, r: 26, w: 2 });
      break;
    case 'summon':
      go(lv, e, 'windup', 0.8, 'pulse', null);
      break;
  }
}

function endMove(lv: Level, e: Enemy, b: BossState, dur: number, stagger = false) {
  go(lv, e, stagger ? 'stagger' : 'recover', dur);
}

function runMove(lv: Level, e: Enemy, b: BossState) {
  const m = b.move!;
  const col = e.skin.colors[2];
  const p = lv.nearest(e.x, e.z);
  // open after the move: drifting back towards home; and then back to patterns
  if (e.state === 'recover' || e.state === 'stagger') {
    // it holds where it ended up (open), and only drifts home in the last moment
    if (e.stateT > e.stateDur - 0.5) home(lv, e, b);
    if (e.grab >= 0) e.grab = -1;
    if (over(e)) {
      go(lv, e, 'idle');
      b.move = null;
    }
    return;
  }
  if (e.state === 'windup') {
    const tl = e.tele;
    // the line rides with it (and tracks you, until it locks)
    if (tl && tl.shape === 'line') {
      if ((m === 'charge' || m === 'harpoon') && e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.08);
      const len = m === 'harpoon' ? 60 : b.len;
      tl.x = e.x;
      tl.z = e.z;
      tl.x2 = e.x + Math.sin(e.aim) * len;
      tl.z2 = e.z + Math.cos(e.aim) * len;
    }
    if (tl && tl.shape === 'circle' && p && e.stateT < 0.3) {
      tl.x = p.x;
      tl.z = p.z;
    }
    if (!over(e)) return;
    b.gone = 0;
    switch (m) {
      case 'slam':
        strike(lv, 'wave', e.x, e.z, { v: 13, w: 1.1, rMax: 30, warn: 0, active: 3, air: true, owner: e.id, color: col });
        if (b.phase >= 2) strike(lv, 'wave', e.x, e.z, { v: 13, w: 1.1, rMax: 30, warn: 0.55, active: 3, air: true, owner: e.id, color: col });
        break;
      case 'gate':
        strike(lv, 'gate', -HALF_W, e.z + 7, { gx: b.mx, gap0: 14, gap1: 2.6, active: 4.5, vz: 7, air: true, owner: e.id, owner2: e.id, color: col });
        break;
      case 'shells': {
        // one on you, more around: ground markers on a chase (the land still racing by), else on the screen
        const chase = b.style === 'pursuer' && b.phase === 0;
        const n = 4 + b.phase;
        const px = p?.x ?? 0;
        const pz = p?.z ?? lv.bottom - 8;
        for (let k = 0; k < n; k++) {
          const a = (k / Math.max(1, n - 1)) * Math.PI * 2 + lv.rand();
          const off = k === 0 ? 0 : 6.5;
          const warn = 1.2 + k * 0.15;
          const x = clamp(px + Math.cos(a) * off, -HALF_W + 2, HALF_W - 2);
          const z = pz + Math.sin(a) * off - (chase ? lv.speedNow * warn : 0);
          strike(lv, 'shell', x, z, { r: 2.8, warn, active: 0.15, sx: e.x, sz: e.z, owner: e.id, color: col, air: !chase });
        }
        break;
      }
      case 'harpoon':
        strike(lv, 'harpoon', e.x, e.z, { vx: Math.sin(e.aim) * 38, vz: Math.cos(e.aim) * 38, active: 1.5, warn: 0, owner: e.id, effect: 'latch', air: true, color: col });
        break;
      case 'spores':
        strike(lv, 'wave', e.x, e.z, { v: 10, w: 2, rMax: 26, warn: 0, active: 3, air: true, effect: 'slow', owner: e.id, color: col });
        break;
      case 'summon': {
        const [foe, n] = HELP[lv.spec.planet.id] ?? ['ramjack', 2];
        const skin = foeSkin(lv.spec.planet, foe);
        for (let k = 0; k < n; k++) {
          const x = lerp(-HALF_W + 8, HALF_W - 8, (k + 0.5) / n);
          const d = { x0: x, hx: x, hz: -16, dir: k % 2 ? 1 : -1, phase: k };
          if (foe === 'rattler') lv.spawn(foe, skin, x, lv.bottom + 5, d);
          else lv.spawn(foe, skin, x, lv.top - 4, d);
        }
        break;
      }
    }
    go(lv, e, 'attack', m === 'sweep' ? 1.6 : 0, KIND[m]);
    return;
  }
  // attack
  switch (m) {
    case 'charge':
    case 'lunge': {
      const sp = (m === 'lunge' ? 32 : 34) * (e.stun > 0 ? 0.3 : 1);
      b.sx += Math.sin(e.aim) * sp * DT;
      b.ss += Math.cos(e.aim) * sp * DT;
      b.gone += sp * DT;
      const edge = Math.abs(b.sx) > HALF_W - 6 || b.ss > HALF_H - 4 || b.ss < -HALF_H + 4;
      b.sx = clamp(b.sx, -HALF_W + 6, HALF_W - 6);
      b.ss = clamp(b.ss, -HALF_H + 4, m === 'lunge' ? CHASE_S : HALF_H - 4);
      if (b.parried || edge || b.gone >= b.len) {
        strike(lv, 'slam', b.sx, lv.scroll + b.ss, { r: 4.5, warn: 0, active: 0.25, air: true, owner: e.id, color: col });
        if (m === 'charge') strike(lv, 'wave', b.sx, lv.scroll + b.ss, { v: 12, w: 1, rMax: 18, warn: 0.05, active: 2, air: true, owner: e.id, color: col });
        // a charge into the wall, or into a parry, leaves it reeling
        const reel = b.parried || (edge && m === 'charge');
        endMove(lv, e, b, reel ? 2.2 : m === 'lunge' ? 2 : 1.6, reel);
      }
      break;
    }
    case 'sweep': {
      const u = clamp(e.stateT / 1.6, 0, 1);
      const a = b.mx > 0 ? lerp(1.1, 0.15, u) : lerp(0.15, 1.1, u);
      let k = 0;
      for (const l of lv.lasers)
        if (l.owner === e.id) {
          const sgn = k++ % 2 ? 1 : -1;
          l.x = e.x;
          l.z = e.z;
          l.x2 = e.x + Math.sin(sgn * a) * 70;
          l.z2 = e.z + Math.cos(sgn * a) * 70;
        }
      if (over(e)) endMove(lv, e, b, 1.8);
      break;
    }
    case 'harpoon': {
      if (e.grab >= 0) {
        const q = lv.players[e.grab];
        b.gone += DT;
        if (!q || q.down) {
          release(lv, e, false);
          endMove(lv, e, b, 1.2);
          break;
        }
        const dx = e.x - q.x;
        const dz = e.z - q.z;
        const dl = Math.hypot(dx, dz) || 1;
        q.x += (dx / dl) * 8 * DT;
        q.z += (dz / dl) * 8 * DT;
        q.vx *= 0.85;
        q.vz *= 0.85;
        if (q.dashT > 0) {
          release(lv, e, true);
          endMove(lv, e, b, 2.2, true);
        } else if (dl < e.r + 3 || b.gone > 2.4) {
          lv.hurt(q, q.x, q.z, 'harpoon');
          release(lv, e, false);
          endMove(lv, e, b, 1.4);
        }
      } else if (!lv.strikes.some((k) => k.owner === e.id && k.kind === 'harpoon')) endMove(lv, e, b, 1.5);
      break;
    }
    default:
      // the rest are thrown and left to do their work: it watches, open
      endMove(lv, e, b, m === 'gate' ? 2.2 : m === 'summon' ? 0.8 : 1.4);
  }
}

function at(e: Enemy, m: { x: number; z: number }) {
  return { x: e.x + m.x, z: e.z + m.z };
}

/** The filler between moves: lighter than it was (slower fire, fewer at once). */
function run(lv: Level, e: Enemy, b: BossState, pat: Pattern) {
  const col = e.skin.colors[2];
  const d = lv.spec.difficulty;
  const hard = (1 + b.phase * 0.2 + d * 0.3) / 1.35;
  b.fire -= DT * hard;
  if (b.fire > 0) return;
  b.shots++;
  switch (pat) {
    case 'fans': {
      for (const g of b.guns.filter((_, k) => k % 2 === b.shots % 2)) {
        const p = at(e, g);
        const a = lv.aim(p.x, p.z);
        for (let k = 0; k < 4; k++) lv.bullet(p.x, p.z, a + (k / 3 - 0.5) * 0.7, 11, { color: col });
      }
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = 0.85;
      break;
    }
    case 'spiral': {
      b.angle += 0.27;
      const arms = 3 + b.phase;
      for (let k = 0; k < arms; k++) lv.bullet(e.x, e.z, b.angle + (k / arms) * Math.PI * 2, 8, { color: col });
      b.fire = 0.11;
      break;
    }
    case 'rain': {
      const g = b.guns[b.shots % b.guns.length];
      const p = at(e, g);
      lv.bullet(p.x, p.z, (lv.rand() - 0.5) * 0.7, 10 + lv.rand() * 4, { color: col, kind: 'needle', r: 0.35 });
      b.fire = 0.07;
      break;
    }
    case 'rings': {
      const n = 14 + b.phase * 3;
      const off = (b.shots % 2) * (Math.PI / n);
      for (let k = 0; k < n; k++) lv.bullet(e.x, e.z, off + (k / n) * Math.PI * 2, 8.5, { color: col });
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = 0.9;
      break;
    }
    case 'walls': {
      // a row across the screen with two gaps to find (one in each half: it's a wide screen)
      const gaps = [lerp(-HALF_W + 5, -4, lv.rand()), lerp(4, HALF_W - 5, lv.rand())];
      for (let x = -HALF_W; x <= HALF_W; x += 1.8) {
        if (gaps.some((g) => Math.abs(x - g) < 3.4)) continue;
        lv.bullet(x, e.z + 2, 0, 9, { color: col, kind: 'needle', r: 0.35 });
      }
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = 1.4;
      break;
    }
    case 'lasers': {
      const guns = [b.guns[0], b.guns[b.guns.length - 1]];
      for (const g of guns) {
        const p = at(e, g);
        const a = lv.aim(p.x, p.z) + (lv.rand() - 0.5) * 0.25;
        lv.lasers.push({ x: p.x, z: p.z, x2: p.x + Math.sin(a) * 70, z2: p.z + Math.cos(a) * 70, warn: 1.05, on: 0.6, color: col, owner: e.id });
      }
      for (let k = 0; k < 6; k++) lv.bullet(e.x, e.z, (k / 6) * Math.PI * 2 + b.shots, 7, { color: col });
      b.fire = 2.1;
      break;
    }
    case 'splitters': {
      const g = b.guns[b.shots % b.guns.length];
      const p = at(e, g);
      lv.bullet(p.x, p.z, lv.aim(p.x, p.z) + (lv.rand() - 0.5) * 0.6, 7.5, { kind: 'big', r: 1, life: 1.3, split: 8 + b.phase * 2, color: col });
      lv.emit({ type: 'enemyShot', x: p.x, z: p.z, color: col });
      b.fire = 0.9;
      break;
    }
    case 'curves': {
      for (const side of [-1, 1]) {
        const g = side < 0 ? b.guns[0] : b.guns[b.guns.length - 1];
        const p = at(e, g);
        for (let k = 0; k < 3; k++) lv.bullet(p.x, p.z, side * (0.9 - k * 0.25), 9, { color: col, turn: -side * 0.9 });
      }
      b.fire = 0.4;
      break;
    }
  }
}
