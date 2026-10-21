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
 *
 * And each has a signature, a move nobody else makes, named on its bar as it comes (a spell card,
 * as Touhou calls them): Vask's SKY DIVE, Oko's CRANE SWING, the Sandking's STAMPEDE, the Mother's
 * BLOOM, the Engine's FROST CROSS, Khet's TITAN EYE, Istra's DEEP BREATH, ARU-0's REPOSSESSION.
 *
 * Each move has one tell and leaves it open. Hit it hard enough while it's open and it's
 * STAGGERED (its poise, the bar under its hull, broken). A phase taken without a hit pays a CLEAN
 * bonus, and at the end it makes a LAST STAND: everything it has, once more, faster.
 *
 * And it reads you. It watches how you fly (hanging back, sitting still, hugging a side, boosting,
 * crowding it, dashing through everything) and picks the move that answers it, and says so on its
 * bar: change how you fly and it changes its mind. Its first phase goes round in order, to be
 * learnt; after that it reads, and strings moves together (a short breath between, a long one after).
 */

import type { Enemy, Level } from './level';
import { DT, HALF_H, HALF_W } from './types';
import { metaOf } from './meta';
import { clamp, hashStr, lerp, rng, shuffle, smooth } from '../util';
import { go, over, release, type AttackKind, type Tele } from './combat';
import { foeSkin, type Foe } from './factions';
import { lerpAngle } from './foes';
import { strike, type Strike } from './strikes';

export type BossStyle = 'brawler' | 'fortress' | 'pursuer' | 'hive';
export type BossMove =
  | 'charge'
  | 'slam'
  | 'sweep'
  | 'gate'
  | 'shells'
  | 'harpoon'
  | 'spores'
  | 'summon'
  | 'lunge'
  // the signatures: one each
  | 'skydive'
  | 'crane'
  | 'stampede'
  | 'bloom'
  | 'cross'
  | 'eye'
  | 'breath'
  | 'repossess';

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
  /** Its own move (see SIGNATURE). */
  sig: BossMove;
  /** Damage taken towards a stagger (it breaks at POISE of its hull), and a breather after one. */
  poise: number;
  poiseCd: number;
  /** The players' hits taken when this phase began (none since: a clean phase). */
  hitsAt: number;
  /** In its last stand (the last sliver of its hull). */
  last: boolean;
  /** The move's working counters (passes made, shots fired), and a turn direction. */
  k: number;
  dir: number;
  /** A strike it's steering (the crane's ball). */
  ball: Strike | null;
  /** How it reads you (see READS), the last read it said out loud and when, and the last move it made. */
  read: Record<Read, number>;
  /** Which side you hug (-1 left, 1 right). */
  readSide: number;
  said: Read | null;
  saidT: number;
  lastMove: BossMove | null;
  /** Moves since its signature, and moves left to string on before a long breath. */
  sinceSig: number;
  combo: number;
  /** Perfects seen (to notice new ones). */
  perfects: number;
  /** The move just made was part of a string (its end is open longer). */
  comboed: boolean;
}

/** What it notices about how you fly. */
export type Read = 'back' | 'still' | 'side' | 'boost' | 'close' | 'dash';

/** What it says on its bar when it answers a read. */
export const READ_LINE: Record<Read, string> = {
  back: 'SEES YOU HANGING BACK',
  still: 'SEES YOU SITTING STILL',
  side: 'SEES YOU HUGGING THE SIDE',
  boost: 'IS LEADING YOUR BOOST',
  close: 'FEELS YOU UP CLOSE',
  dash: 'IS BAITING YOUR DASH',
};

/** Which reads each move answers. */
const ANSWERS: Record<BossMove, Read[]> = {
  charge: ['back', 'still'],
  lunge: ['back'],
  slam: ['close', 'still'],
  sweep: ['side', 'still'],
  gate: ['side', 'back'],
  shells: ['still', 'back'],
  harpoon: ['back', 'side'],
  spores: ['close'],
  summon: ['boost'],
  skydive: ['side', 'still'],
  crane: ['close'],
  stampede: ['back'],
  bloom: ['close', 'still'],
  cross: ['still'],
  eye: ['back', 'still'],
  breath: ['back', 'side'],
  repossess: ['boost', 'dash'],
};

/** How fast a read builds and fades (seconds), how sure it must be to act and to say so. */
const READ_TAU = 5;
const READ_ACT = 0.35;
const READ_SAY = 0.55;
/** How often it strings another move on, by phase (none in the first: it's learnt in order). */
const COMBO = [0, 0.35, 0.6];

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

const KIND: Record<BossMove, AttackKind> = {
  charge: 'charge',
  lunge: 'charge',
  slam: 'slam',
  sweep: 'sweep',
  gate: 'gate',
  shells: 'shell',
  harpoon: 'harpoon',
  spores: 'spores',
  summon: 'pulse',
  skydive: 'charge',
  crane: 'sweep',
  stampede: 'slam',
  bloom: 'spores',
  cross: 'beam',
  eye: 'beam',
  breath: 'pulse',
  repossess: 'torpedo',
};

/** Each boss's own move, and what it's called on its bar. */
const SIGNATURE: Record<string, BossMove> = {
  orutal: 'skydive',
  halcyon: 'crane',
  kessra: 'stampede',
  mirefall: 'bloom',
  glacis: 'cross',
  ashgrave: 'eye',
  vesh: 'breath',
  cinder: 'repossess',
};
export const MOVE_NAME: Partial<Record<BossMove, string>> = {
  skydive: 'SKY DIVE',
  crane: 'CRANE SWING',
  stampede: 'STAMPEDE',
  bloom: 'BLOOM',
  cross: 'FROST CROSS',
  eye: 'TITAN EYE',
  breath: 'DEEP BREATH',
  repossess: 'REPOSSESSION',
};

/** Damage that breaks its poise (a share of its hull), and how fast poise comes back. */
const POISE = 0.075;
const POISE_BACK = 0.012;
/** Below this share of its hull it makes its last stand. */
const LAST = 0.08;

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
  // its own move comes second in every phase (seen early, and every time round)
  const sig = SIGNATURE[planet] ?? 'skydive';
  for (const l of moves) l.splice(1, 0, sig);
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
    sig,
    poise: 0,
    poiseCd: 0,
    hitsAt: 0,
    last: false,
    k: 0,
    dir: 1,
    ball: null,
    read: { back: 0, still: 0, side: 0, boost: 0, close: 0, dash: 0 },
    readSide: 0,
    said: null,
    saidT: -99,
    lastMove: null,
    sinceSig: 0,
    combo: 0,
    perfects: 0,
    comboed: false,
  };
}

/** How near its poise is to breaking, 0..1 (1 while it's staggered). */
export const poiseOf = (e: Enemy) => (e.state === 'stagger' ? 1 : clamp(e.boss!.poise / (e.max * POISE), 0, 1));

/** The name of the signature it's making, if it is. */
export const sigName = (e: Enemy) => (e.boss && e.boss.move === e.boss.sig && (e.state === 'windup' || e.state === 'attack') ? MOVE_NAME[e.boss.sig] : undefined);

/** Hit: its poise gives, and when it breaks it's STAGGERED, whatever it was doing. */
export function bossHurt(lv: Level, e: Enemy, dmg: number) {
  const b = e.boss!;
  if (e.t < 3.5 || e.shielded || b.poiseCd > 0 || e.state === 'stagger') return;
  b.poise += dmg;
  if (b.poise < e.max * POISE) return;
  b.poise = 0;
  b.poiseCd = 5;
  // whatever it was making stops: beams go out, a swinging ball drops
  for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
  dropBall(b);
  if (e.grab >= 0) release(lv, e, true);
  b.move ??= 'summon';
  // knocked out of a string of moves
  b.combo = 0;
  b.comboed = false;
  go(lv, e, 'stagger', 2.6);
  lv.emit({ type: 'bossStagger', enemy: e.id, x: e.x, z: e.z });
}

function dropBall(b: BossState) {
  if (b.ball) b.ball.dead = true;
  b.ball = null;
}

/** What a hit is worth on it now: armour, and the weak points when it's open. */
export function bossTaken(lv: Level, e: Enemy, crit: boolean) {
  const b = e.boss!;
  const open = e.state === 'recover' || e.state === 'stagger';
  if (crit && open) lv.emit({ type: 'weakHit', enemy: e.id, x: e.x, z: e.z, dmg: 0 });
  // poise broken: wide open, whatever it is
  if (e.state === 'stagger' && !(b.style === 'hive' && lv.enemies.some((o) => !o.dead && o.links.includes(e.id)))) return crit ? 2.2 : 1.8;
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
  readYou(lv, e, b);

  // phases at two thirds and one third (a chase ends after half a minute regardless)
  if (b.style === 'pursuer' && b.phase === 0) b.chaseT += DT;
  let want = e.hp < e.max / 3 ? 2 : e.hp < (e.max * 2) / 3 ? 1 : 0;
  if (b.style === 'pursuer' && b.chaseT > 30) want = Math.max(want, 1);
  b.poiseCd = Math.max(0, b.poiseCd - DT);
  b.poise = Math.max(0, b.poise - e.max * POISE_BACK * DT);
  const last = e.hp < e.max * LAST && !b.last;
  if ((want > b.phase || last) && (!b.move || e.state === 'recover' || e.state === 'stagger')) {
    // a phase taken without a hit: paid for, in scrap thrown from its hull
    const hits = lv.players.reduce((n, p) => n + p.hits, 0);
    if (hits === b.hitsAt) {
      const scrap = 15 + b.phase * 10 + Math.round(lv.spec.difficulty * 10);
      for (let k = 0; k < 6; k++) lv.drop('scrap', e.x + (lv.rand() - 0.5) * 6, e.z + 2 + lv.rand() * 3, Math.round(scrap / 6));
      lv.emit({ type: 'phaseClean', phase: b.phase, x: e.x, z: e.z, scrap });
    }
    b.hitsAt = hits;
    if (last) {
      b.last = true;
      b.phase = 2;
      b.moveN = 0;
      // the last stand: its own move, straight away, and then everything at once
      b.moves[2] = [b.sig, ...b.moves[2].filter((m) => m !== b.sig && m !== 'summon'), b.sig];
    } else {
      b.phase = want;
      b.moveN = 0;
    }
    b.current = 0;
    b.pt = 0;
    b.combo = 0;
    b.comboed = false;
    b.shieldT = 1.6;
    b.move = null;
    dropBall(b);
    if (e.grab >= 0) release(lv, e, false);
    go(lv, e, 'idle');
    lv.chase = false;
    for (const x of lv.bullets) lv.cancel(x);
    lv.lasers.length = 0;
    lv.emit({ type: 'bossPhase', phase: b.last ? 3 : b.phase, style: b.style });
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
  // in its last stand it hardly stops to breathe between moves
  const len = chase || b.last ? 0.6 : LENGTH[pat];
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
  const m = pickMove(lv, b);
  b.move = m;
  b.lastMove = m;
  b.sinceSig = m === b.sig ? 0 : b.sinceSig + 1;
  b.parried = false;
  b.yanked = false;
  // a string of moves starts here, now and then (not off the back of another)
  if (!b.comboed && b.combo <= 0 && !b.last && lv.rand() < COMBO[b.phase]) {
    b.combo = b.phase >= 2 && lv.rand() < 0.4 ? 2 : 1;
    lv.emit({ type: 'chain', enemy: e.id, n: 1, of: b.combo + 1 });
  }
  const p = lv.nearest(e.x, e.z);
  // boosting a lot: it aims where you're going, not where you are
  const lead = b.read.boost > READ_ACT ? 0.45 * b.read.boost : 0;
  const px = (p?.x ?? 0) + (p ? p.vx * lead : 0);
  const pz = (p?.z ?? lv.bottom - 8) + (p ? p.vz * lead : 0);
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
    default:
      b.k = 0;
      startSig(lv, e, b, px, pz);
  }
  // dashing through everything: it holds its tell a beat longer, now and then, to bait the dash
  if (e.state === 'windup' && b.read.dash > READ_ACT && lv.rand() < b.read.dash) e.stateDur *= 1.25 + lv.rand() * 0.35;
}

/**
 * Which move next. The first phase (and the last stand) go round in order. After that it answers
 * what it reads (the strongest read a move answers weighs it up), its signature comes round every
 * few, and it never makes the same move twice running.
 */
function pickMove(lv: Level, b: BossState): BossMove {
  const list = b.moves[b.phase];
  if (b.phase === 0 || b.last) return list[b.moveN++ % list.length];
  b.moveN++;
  const moves = [...new Set(list)].filter((m) => m !== b.lastMove || list.length < 2);
  if (b.sinceSig >= SIG_EVERY && moves.includes(b.sig)) return b.sig;
  let best: Read | null = null;
  const w = moves.map((m) => {
    let top = 0;
    let why: Read | null = null;
    for (const r of ANSWERS[m])
      if (b.read[r] > top) {
        top = b.read[r];
        why = r;
      }
    return { m, why: top > READ_ACT ? why : null, w: 1 + (top > READ_ACT ? 4 * top : 0) * (b.phase === 2 ? 1.5 : 1) };
  });
  let x = lv.rand() * w.reduce((s, o) => s + o.w, 0);
  let pick = w[0];
  for (const o of w) if ((x -= o.w) <= 0) {
    pick = o;
    break;
  }
  best = pick.why;
  // and says so, if it's sure (not the same thing again soon)
  if (best && b.read[best] > READ_SAY && (best !== b.said || lv.time - b.saidT > READ_AGAIN)) {
    b.said = best;
    b.saidT = lv.time;
    lv.emit({ type: 'bossRead', read: best, side: b.readSide });
  }
  return pick.m;
}

/** Watching how you fly: each read eases towards what it sees (over READ_TAU seconds). */
function readYou(lv: Level, e: Enemy, b: BossState) {
  const ps = lv.players.filter((p) => !p.down);
  if (!ps.length) return;
  const k = DT / READ_TAU;
  const see = (r: Read, v: number) => (b.read[r] += (clamp(v, 0, 1) - b.read[r]) * k);
  const avg = (f: (p: (typeof ps)[number]) => number) => ps.reduce((s, p) => s + f(p), 0) / ps.length;
  see('back', avg((p) => clamp((p.z - lv.scroll - HALF_H * 0.2) / (HALF_H * 0.5), 0, 1)));
  see('still', avg((p) => (Math.hypot(p.vx, p.vz) < 5 ? 1 : 0)));
  see('side', avg((p) => clamp((Math.abs(p.x) - HALF_W * 0.4) / (HALF_W * 0.3), 0, 1)));
  see('boost', avg((p) => p.boosting));
  see('close', avg((p) => clamp((16 - Math.hypot(p.x - e.x, p.z - e.z)) / 8, 0, 1)));
  b.readSide = Math.sign(avg((p) => p.x)) || 1;
  // a perfect is a jolt to the dash read (it fades like the rest)
  const perfects = lv.players.reduce((n, p) => n + p.perfects, 0);
  if (perfects > b.perfects) b.read.dash = Math.min(1, b.read.dash + 0.3 * (perfects - b.perfects));
  b.perfects = perfects;
  b.read.dash *= 1 - k;
}

/** The screen z of a spot, kept off the very edges. */
const lane = (lv: Level, z: number) => clamp(z - lv.scroll, -HALF_H + 7, HALF_H - 6);

/** The signature moves: each its own tell (see runMove for the moves themselves). */
function startSig(lv: Level, e: Enemy, b: BossState, px: number, pz: number) {
  const m = b.move!;
  const col = e.skin.colors[2];
  const fast = b.last ? 0.75 : b.phase >= 2 ? 0.88 : 1;
  switch (m) {
    case 'skydive': {
      // she picks your lane, flies out to the far side of it, and the lane is drawn across
      const side = b.k === 0 ? (px > 0 ? -1 : 1) : b.sx > 0 ? 1 : -1;
      b.dir = -side;
      b.mx = side * (HALF_W - 6);
      b.ms = lane(lv, pz);
      const z = lv.scroll + b.ms;
      go(lv, e, 'windup', (b.k ? 0.9 : 1.4) * fast, 'charge', { shape: 'line', x: b.mx, z, x2: -side * (HALF_W + 6), z2: z, w: 8.5, lock: (b.k ? 0.5 : 0.8) * fast, body: true });
      break;
    }
    case 'crane': {
      // the arc the ball will swing through, swept out in light
      b.dir = lv.rand() < 0.5 ? 1 : -1;
      const len = craneLen(b);
      go(lv, e, 'windup', 1.25 * fast, 'sweep', { shape: 'sweep', x: e.x, z: e.z, a0: -b.dir * CRANE_A, a1: b.dir * CRANE_A, len: len + 2.6, w: 1.6 });
      break;
    }
    case 'stampede':
      // it rears: the ground about it shakes
      go(lv, e, 'windup', 0.95 * fast, 'slam', { shape: 'ring', x: e.x, z: e.z, r: 9, w: 2 });
      break;
    case 'bloom':
      b.dir = b.dir > 0 ? -1 : 1;
      b.angle = lv.rand() * Math.PI;
      go(lv, e, 'windup', 1.0 * fast, 'spores', { shape: 'ring', x: e.x, z: e.z, r: 10, w: 3 });
      break;
    case 'cross': {
      // four beams drawn out from its core, then they burn and turn
      b.dir = b.dir > 0 ? -1 : 1;
      b.angle = Math.PI / 4;
      const n = crossBeams(b);
      for (let k = 0; k < n; k++) {
        const a = b.angle + (k / n) * Math.PI * 2;
        lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(a) * 75, z2: e.z + Math.cos(a) * 75, warn: 1.3 * fast, on: crossTime(b) + 0.1, color: col, owner: e.id });
      }
      go(lv, e, 'windup', 1.3 * fast, 'beam', { shape: 'ring', x: e.x, z: e.z, r: 6, w: 2 });
      break;
    }
    case 'eye': {
      // the eye opens on you: a thin line that thickens, then the beam, following you
      e.aim = Math.atan2(px - e.x, pz - e.z);
      lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 75, z2: e.z + Math.cos(e.aim) * 75, warn: 1.1 * fast, on: eyeTime(b), color: col, owner: e.id });
      go(lv, e, 'windup', 1.1 * fast, 'beam', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 75, z2: e.z + Math.cos(e.aim) * 75, w: 2.2, lock: 0.7 * fast });
      break;
    }
    case 'breath':
      // how far the pull will reach
      go(lv, e, 'windup', 0.9 * fast, 'pulse', { shape: 'ring', x: e.x, z: e.z, r: BREATH_R, w: 3 });
      break;
    case 'repossess': {
      const p = lv.nearest(e.x, e.z);
      b.mx = px;
      b.ms = pz;
      go(lv, e, 'windup', (b.k ? 0.75 : 1.15) * fast, 'torpedo', p ? { shape: 'lock', id: p.id } : null);
      break;
    }
  }
}

const CRANE_A = 1.15;
const craneLen = (b: BossState) => 16 + b.phase * 1.5;
const craneSwings = (b: BossState) => (b.last ? 4 : b.phase >= 2 ? 3 : 2);
const CRANE_P = 1.3;
const crossBeams = (b: BossState) => (b.last ? 6 : 4);
const crossTime = (b: BossState) => 3.4 + b.phase * 0.4;
const eyeTime = (b: BossState) => 3 + b.phase * 0.5;
const BREATH_R = 34;
/** Its signature, at least every this many moves (after the first phase). */
const SIG_EVERY = 3;
/** Seconds before it says the same read again. */
const READ_AGAIN = 14;
/** How long it's open between the moves of a string. */
const COMBO_BREATH = 0.45;
const BREATH_IN = 2.2;
const repoShots = (b: BossState) => 2 + b.phase + (b.last ? 1 : 0);
const divePasses = (b: BossState) => (b.last ? 3 : b.phase >= 2 ? 2 : 1);

function endMove(lv: Level, e: Enemy, b: BossState, dur: number, stagger = false) {
  // mid-string, only a breath open; the end of one, open for longer
  if (!stagger && b.combo > 0) dur = Math.min(dur, COMBO_BREATH);
  else if (!stagger && b.comboed) dur *= 1.4;
  if (stagger) b.combo = 0;
  b.comboed = b.combo > 0;
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
      // stringing moves together: straight into the next
      if (b.combo > 0 && !e.shielded) {
        b.combo--;
        startMove(lv, e, b);
      }
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
    sigWindup(lv, e, b);
    if (!over(e)) return;
    if (sigGo(lv, e, b)) return;
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
    case 'skydive':
    case 'crane':
    case 'bloom':
    case 'cross':
    case 'eye':
    case 'breath':
      sigAttack(lv, e, b);
      break;
    default:
      // the rest are thrown and left to do their work: it watches, open
      endMove(lv, e, b, m === 'gate' ? 2.2 : m === 'summon' ? 0.8 : m === 'stampede' ? 1.8 : m === 'repossess' ? 2.2 : 1.4);
  }
}

/** A signature's windup: what it tracks while it tells. */
function sigWindup(lv: Level, e: Enemy, b: BossState) {
  const p = lv.nearest(e.x, e.z);
  const tl = e.tele;
  switch (b.move) {
    case 'skydive': {
      // out to the end of the lane (it follows you till it locks)
      if (p && tl && tl.shape === 'line' && e.stateT < tl.lock) b.ms = lerp(b.ms, lane(lv, p.z), 0.12);
      b.sx = lerp(b.sx, b.mx, 0.09);
      b.ss = lerp(b.ss, b.ms, 0.09);
      if (tl && tl.shape === 'line') {
        tl.x = b.sx;
        tl.z = tl.z2 = lv.scroll + b.ms;
      }
      break;
    }
    case 'crane':
    case 'stampede':
    case 'bloom':
    case 'cross':
    case 'breath':
      if (tl && (tl.shape === 'sweep' || tl.shape === 'ring')) {
        tl.x = e.x;
        tl.z = e.z;
      }
      break;
    case 'eye': {
      if (tl && tl.shape === 'line' && e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.06);
      aimBeams(lv, e, e.aim, 1);
      if (tl && tl.shape === 'line') {
        tl.x = e.x;
        tl.z = e.z;
        tl.x2 = e.x + Math.sin(e.aim) * 75;
        tl.z2 = e.z + Math.cos(e.aim) * 75;
      }
      break;
    }
    case 'repossess':
      // where you are, until the last moment: it fires where you were
      if (p && e.stateT < e.stateDur - 0.32) {
        b.mx = p.x;
        b.ms = p.z;
      }
      break;
  }
}

/** Point its beams: `n` of them spread evenly from angle `a`. */
function aimBeams(lv: Level, e: Enemy, a: number, n: number) {
  let k = 0;
  for (const l of lv.lasers)
    if (l.owner === e.id) {
      const ak = a + (k++ / n) * Math.PI * 2;
      l.x = e.x;
      l.z = e.z;
      l.x2 = e.x + Math.sin(ak) * 75;
      l.z2 = e.z + Math.cos(ak) * 75;
    }
}

/** A signature's windup is over: off it goes. True if it has dealt with its own state. */
function sigGo(lv: Level, e: Enemy, b: BossState): boolean {
  const col = e.skin.colors[2];
  const p = lv.nearest(e.x, e.z);
  const px = p?.x ?? 0;
  const pz = p?.z ?? lv.bottom - 8;
  b.fire = 0;
  switch (b.move) {
    case 'skydive':
      b.gone = 0;
      go(lv, e, 'attack', 0, 'charge');
      return true;
    case 'crane': {
      const len = craneLen(b);
      const a = -b.dir * CRANE_A;
      b.ball = strike(lv, 'ball', e.x + Math.sin(a) * len, e.z + Math.cos(a) * len, { r: 2.7, warn: 0, active: 99, air: true, owner: e.id, color: col });
      go(lv, e, 'attack', CRANE_P * craneSwings(b), 'sweep');
      // (the ball's out: it's its own warning now)
      e.tele = null;
      return true;
    }
    case 'stampede': {
      // a line of stomps marching away from it through where you are, left foot, right foot;
      // later a second line beside it, a beat behind
      const dz = pz >= e.z ? 1 : -1;
      const lines = b.last ? 3 : b.phase >= 1 ? 2 : 1;
      const side = px > 0 ? -1 : 1;
      for (let n = 0; n < lines; n++) {
        const cx = clamp(px + (n === 0 ? 0 : n === 1 ? side * 13 : -side * 13), -HALF_W + 4, HALF_W - 4);
        for (let k = 0; k < 14; k++) {
          const z = e.z + dz * (7 + k * 5);
          if (!lv.onScreen(cx, z, 2)) break;
          const x = cx + (k % 2 ? 3.2 : -3.2);
          strike(lv, 'slam', x, z, { r: 3.1, warn: 0.75 + k * 0.27 + n * 0.14, active: 0.2, air: true, owner: e.id, color: col });
        }
      }
      go(lv, e, 'attack', 0, 'slam');
      e.tele = null;
      return true;
    }
    case 'repossess': {
      // the beam goes where you were a moment ago; and a pair of collector mines at the spot
      const a = Math.atan2(b.mx - e.x, b.ms - e.z);
      lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(a) * 80, z2: e.z + Math.cos(a) * 80, warn: 0.32, on: 0.45, color: col, owner: e.id });
      lv.emit({ type: 'telegraph', x: e.x, z: e.z, x2: e.x + Math.sin(a) * 80, z2: e.z + Math.cos(a) * 80, t: 0.32 });
      if (b.k % 2 === 1 || b.phase >= 2)
        for (const s of [-1, 1]) lv.bullet(b.mx + Math.cos(a) * s * 5, b.ms - Math.sin(a) * s * 5, 0, 0, { kind: 'mine', r: 0.7, life: 1.6, split: 6, color: col });
      b.k++;
      if (b.k < repoShots(b)) startSig(lv, e, b, px, pz);
      else go(lv, e, 'attack', 0, 'torpedo');
      return true;
    }
    case 'eye':
    case 'cross':
    case 'bloom':
      go(lv, e, 'attack', b.move === 'eye' ? eyeTime(b) : b.move === 'cross' ? crossTime(b) : b.last ? 4.2 : 3.4, KIND[b.move]);
      e.tele = null;
      return true;
    case 'breath':
      b.k = 0;
      go(lv, e, 'attack', BREATH_IN, 'pulse');
      return true;
  }
  return false;
}

/** A signature, under way. */
function sigAttack(lv: Level, e: Enemy, b: BossState) {
  const col = e.skin.colors[2];
  const p = lv.nearest(e.x, e.z);
  switch (b.move) {
    case 'skydive': {
      // across the lane, low and fast, sowing eggs behind her
      const sp = 58 * (e.stun > 0 ? 0.4 : 1);
      b.sx += b.dir * sp * DT;
      b.gone += sp * DT;
      if (b.gone > 5) {
        b.gone -= 5;
        lv.bullet(b.sx, e.z, 0, 0, { kind: 'mine', r: 0.7, life: 1.1 + lv.rand() * 0.4, split: b.phase >= 1 ? 6 : 4, color: col });
      }
      if (Math.abs(b.sx) > HALF_W - 6 && Math.sign(b.sx) === b.dir) {
        b.sx = b.dir * (HALF_W - 6);
        b.k++;
        if (b.k < divePasses(b)) startSig(lv, e, b, p?.x ?? 0, p?.z ?? 0);
        // she lands at the far end, winded
        else endMove(lv, e, b, 2.3);
      }
      break;
    }
    case 'crane': {
      // a pendulum under the barge; at each end of its swing it sheds shrapnel
      const len = craneLen(b);
      const u = e.stateT / CRANE_P;
      const a = -b.dir * CRANE_A * Math.cos(Math.PI * u);
      if (b.ball) {
        b.ball.x = e.x + Math.sin(a) * len;
        b.ball.z = e.z + Math.cos(a) * len;
        b.ball.vx = -b.dir * CRANE_A * Math.sin(Math.PI * u) * (Math.PI / CRANE_P) * len * Math.cos(a);
      }
      if (Math.floor(u) > b.k && b.ball) {
        b.k = Math.floor(u);
        if (b.phase >= 1 || b.last) {
          const n = 7 + b.phase;
          for (let k = 0; k < n; k++) lv.bullet(b.ball.x, b.ball.z, (k / n) * Math.PI * 2 + b.k, 7, { color: col, kind: 'big', r: 0.6 });
        }
        lv.emit({ type: 'strike', kind: 'slam', x: b.ball.x, z: b.ball.z, r: 1.5 });
      }
      if (over(e)) {
        dropBall(b);
        endMove(lv, e, b, 2);
      }
      break;
    }
    case 'bloom': {
      // a flower of spores turning one way, and halfway through, back the other
      const half = e.stateDur / 2;
      if (e.stateT - DT < half && e.stateT >= half) {
        b.dir = -b.dir;
        lv.emit({ type: 'telegraph', x: e.x, z: e.z, x2: e.x, z2: e.z, t: 0.2 });
      }
      b.fire -= DT;
      if (b.fire <= 0) {
        b.fire = 0.11;
        b.angle += b.dir * 0.14;
        const arms = Math.min(7, 5 + b.phase);
        for (let k = 0; k < arms; k++) lv.bullet(e.x, e.z, b.angle + (k / arms) * Math.PI * 2, 6.2, { color: col, kind: 'spore', r: 0.5 });
      }
      if (over(e)) endMove(lv, e, b, 1.8);
      break;
    }
    case 'cross': {
      const n = crossBeams(b);
      const turn = Math.PI / 2 + b.phase * (Math.PI / 6);
      aimBeams(lv, e, b.angle + b.dir * turn * clamp(e.stateT / e.stateDur, 0, 1), n);
      if (over(e)) {
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        endMove(lv, e, b, 1.9);
      }
      break;
    }
    case 'eye': {
      // it follows you, slower than you can fly: keep moving
      const rate = 0.42 + b.phase * 0.12 + (b.last ? 0.15 : 0);
      const want = lv.aim(e.x, e.z);
      const da = Math.atan2(Math.sin(want - e.aim), Math.cos(want - e.aim));
      e.aim += clamp(da, -rate * DT, rate * DT);
      aimBeams(lv, e, e.aim, 1);
      if (over(e)) {
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        endMove(lv, e, b, 2.1);
      }
      break;
    }
    case 'breath': {
      // in: everything near is drawn to her maw (boost against it; a dash is free of it)
      for (const q of lv.players) {
        if (q.down || q.dashT > 0) continue;
        const dx = e.x - q.x;
        const dz = e.z - q.z;
        const dl = Math.hypot(dx, dz) || 1;
        if (dl > BREATH_R || dl < e.r) continue;
        const pull = (8 + b.phase * 1.5) * (1 - 0.65 * q.boosting) * (1 - dl / (BREATH_R * 1.3));
        q.x += (dx / dl) * pull * DT;
        q.z += (dz / dl) * pull * DT;
      }
      if (over(e)) {
        // and out: a wall of bubbles, three rows deep, fanned at you
        const a = lv.aim(e.x, e.z);
        const rows = b.last ? 4 : 3;
        // (each row's bubbles sit in the gaps of the one before: weave through)
        for (let r = 0; r < rows; r++) {
          const n = 8;
          const step = 1.9 / n;
          for (let k = 0; k < n; k++) lv.bullet(e.x, e.z + 2, a + (k - (n - 1) / 2 + (r % 2) * 0.5) * step, 6 + r * 1.8, { color: col, kind: 'big', r: 0.7 });
        }
        lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
        endMove(lv, e, b, 2.3);
      }
      break;
    }
  }
}

function at(e: Enemy, m: { x: number; z: number }) {
  return { x: e.x + m.x, z: e.z + m.z };
}

/** The filler between moves: lighter than it was (slower fire, fewer at once). */
function run(lv: Level, e: Enemy, b: BossState, pat: Pattern) {
  const col = e.skin.colors[2];
  const d = lv.spec.difficulty;
  const hard = (1 + b.phase * 0.2 + d * 0.3 + (b.last ? 0.3 : 0)) / 1.35;
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
