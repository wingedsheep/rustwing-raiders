/**
 * The wreck grafts in flight (see game/grafts.ts for what they are). Each rides on a verb and goes
 * off when the verb does: the level calls in here as a dash starts and ends, as the heavy fires,
 * the aux and the special go, every frame the trigger is held or the boost burns, and as shots fly
 * and hit. What grafts leave lying about (talon strikes coming down, acid, spore clouds, binds) is
 * kept here too, for the view to draw.
 *
 * And the bonds: three grafts of a faction wake a rule for the whole ship.
 */

import type { Bullet, Enemy, Level, Player, Shot } from './level';
import { DT, HALF_W } from './types';
import { clamp, lerp } from '../util';
import { CRACK, mark, marksOn, spread } from './marks';
import type { GraftId, GraftVerb } from '../game/grafts';
import type { Faction } from './factions';

/** RAM LINE: the dash runs this much longer; what it rams takes this, and reels this long. */
export const RAM_LONG = 1.6;
const RAM_DMG = 34;
const RAM_STUN = 0.35;
/** BROADSIDE: shots a flank (a perfect dash: this many more), their spread, punch and reach. */
const BROAD_N = 5;
const BROAD_PERFECT = 3;
const BROAD_SPREAD = 0.6;
const BROAD_DMG = 11;
/** TORPEDO TUBE: seconds of trigger a torpedo, its punch, its blast, how hard it turns, how fast it goes. */
const TUBE_EVERY = 1.5;
const TORP_DMG = 36;
const TORP_BLAST = 3.2;
const TORP_TURN = 5.5;
const TORP_SPEED = 44;
/** TITAN EYE: how long it stays open, how fast it turns, its tick and what each does. */
export const EYE_TIME = 0.9;
const EYE_TURN = 7;
const EYE_TICK = 0.08;
const EYE_DMG = 5.5;
/** SQUARE TURN: how long a round holds as it turns, and how far to the side it looks. */
const SQUARE_HOLD = 0.12;
const SQUARE_REACH = 34;
/** HALO RING: shards a ring, the second ring's beat, a shard's punch. */
const HALO_N = 22;
const HALO_BEAT = 0.22;
const HALO_DMG = 8;
/** SPINDLE ARMS: drawn out for this long, then they turn for this long; their reach, turn, fire and cut. */
export const ARMS_DRAW = 0.45;
export const ARMS_SPIN = 2.6;
export const ARMS_LEN = 9;
const ARMS_TURN = 2.4;
const ARMS_FIRE = 0.07;
const ARMS_SHOT = 5;
const ARMS_CUT = 6;
/** CRANE SWING: a swing's time (there, then back), its arc, the chain, the ball, its blow. */
export const CRANE_SWING = 0.5;
export const CRANE_ARC = 1.25;
export const CRANE_LEN = 5.5;
export const CRANE_R = 1.5;
const CRANE_DMG = 30;
const CRANE_BAT = 12;
/** THORN WAKE: a thorn every so often on the boost, how long it takes to ripen, how many at most. */
const THORN_EVERY = 0.2;
const THORN_LIFE = 1;
const THORN_DMG = 12;
const THORN_MAX = 10;
/** STOOP: how far past the dash's end the shadow falls, the beat before it strikes, the strike. */
const STOOP_AHEAD = 6;
export const STOOP_WARN = 0.38;
export const STOOP_R = 4.2;
const STOOP_DMG = 34;
/** ACID SPIT: a second of trigger a glob, its flight, the puddle, what it eats a tick. */
const SPIT_EVERY = 1;
const SPIT_FLY = 0.42;
const SPIT_REACH = 34;
export const ACID_R = 3.2;
const ACID_LIFE = 2.6;
const ACID_DMG = 4;
/** SKY DIVE: the lane's tell, how fast it's dived, eggs and their punch. */
export const DIVE_TELL = 0.28;
const DIVE_SPEED = 90;
const DIVE_EGG = 3.2;
const EGG_DMG = 26;
const DIVE_RAM = 30;
/** HEART BIND: how long, how far it reaches to the neighbours, what they take of it. */
export const BIND_TIME = 6;
export const BIND_REACH = 12;
const BIND_SHARE = 0.6;
/** SPORE TRAIL and MOTHER'S BLOOM: a cloud every so often, its size and life, what it eats. */
const SPORE_EVERY = 0.22;
export const SPORE_R = 2.8;
const SPORE_LIFE = 2.4;
const SPORE_DMG = 3;
const SPORE_MAX = 14;
const BLOOM_N = 10;
/** SALVAGE RIGHTS: a kill's shrapnel. */
const SALVAGE_N = 6;
const SALVAGE_DMG = 9;

/** A player's grafts' working state. */
export interface GraftState {
  /** Seconds of trigger held since the tube (or the spit) last went, and which side it drops from next. */
  trig: number;
  side: number;
  /** Seconds since the boost last left something. */
  wake: number;
  /** TITAN EYE: open for `t` more, looking at `a` (0 up the screen), `len` long, at `target`. */
  eye: { t: number; a: number; tick: number; len: number; target: number };
  /** SPINDLE ARMS: `t` from -ARMS_DRAW (drawn out) through 0 (turning) to ARMS_SPIN; their angle, way and fire. */
  arms: { t: number; a: number; dir: number; fire: number; tick: number } | null;
  /** SKY DIVE: `t` from -DIVE_TELL (the lane drawn) on; the way, the lane (z on the screen), the egg count, what it's rammed. */
  dive: { t: number; dir: number; s: number; egg: number; hit: number[]; end: number } | null;
  /** CRANE SWING: `t` through two swings, starting from the `dir` side; what this swing has hit; where the ball is. */
  crane: { t: number; dir: number; hit: number[]; x: number; z: number; back: boolean } | null;
  /** HALO RING: the second ring, coming in this long. */
  halo: number;
  /** Seconds since each verb's graft last went (the HUD lights it). */
  fired: Partial<Record<GraftVerb, number>>;
}

export const newGraftState = (): GraftState => ({
  trig: 0,
  side: 1,
  wake: 0,
  eye: { t: 0, a: 0, tick: 0, len: 0, target: 0 },
  arms: null,
  dive: null,
  crane: null,
  halo: 0,
  fired: {},
});

/** A talon strike coming down on a dash's shadow. */
export interface Stoop {
  owner: number;
  x: number;
  z: number;
  t: number;
  done: boolean;
}

/** Acid in flight (from, to, how far along), then a puddle hanging where it landed. */
export interface Glob {
  owner: number;
  x0: number;
  z0: number;
  x: number;
  z: number;
  t: number;
  done: boolean;
}

/** A puddle of acid, or a spore cloud: eats what's in it. */
export interface Patch {
  kind: 'acid' | 'spore';
  owner: number;
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  tick: number;
  dead: boolean;
}

/** A HEART BIND: an enemy and who bound it. */
export interface Bind {
  owner: number;
  enemy: number;
  t: number;
}

export class Grafting {
  readonly stoops: Stoop[] = [];
  readonly globs: Glob[] = [];
  readonly patches: Patch[] = [];
  readonly binds: Bind[] = [];
  /** A hit being shared out by a bind (so a share isn't shared again). */
  private sharing = false;

  constructor(private readonly lv: Level) {}

  bonded(p: Player | undefined, f: Faction) {
    return !!p && p.bonds.includes(f);
  }

  private went(p: Player, v: GraftVerb, g: GraftId, x = p.x, z = p.z, what = 'go', more: { x2?: number; z2?: number; n?: number } = {}) {
    p.gs.fired[v] = 0;
    this.lv.emit({ type: 'graft', id: p.id, graft: g, what, x, z, ...more });
  }

  // --- the verbs ---------------------------------------------------------------------------

  /** How much longer a dash runs (RAM LINE). */
  dashLength(p: Player) {
    return p.grafts.dash === 'ramline' ? RAM_LONG : 1;
  }

  /** Does the dash ram (and so the things it goes through can't hurt you)? */
  rams(p: Player) {
    return p.dashT > 0 && p.grafts.dash === 'ramline';
  }

  /** A dash has begun. */
  dash(p: Player) {
    const g = p.grafts.dash;
    if (g === 'ramline') {
      // the line it'll run, drawn
      const len = 62 * 0.17 * RAM_LONG;
      this.went(p, 'dash', g, p.x, p.z, 'line', { x2: clamp(p.x + p.dashX * len, -HALF_W, HALF_W), z2: p.z + p.dashZ * len });
    } else if (g === 'stoop') {
      const len = 62 * 0.17 + STOOP_AHEAD;
      const x = clamp(p.x + p.dashX * len, -HALF_W + 2, HALF_W - 2);
      const z = clamp(p.z + p.dashZ * len, this.lv.top + 3, this.lv.bottom - 3);
      this.stoops.push({ owner: p.id, x, z, t: 0, done: false });
      this.went(p, 'dash', g, x, z, 'shadow');
    }
  }

  /** The dash has run its course. */
  dashEnd(p: Player) {
    if (p.grafts.dash !== 'broadside') return;
    const lv = this.lv;
    const a = Math.atan2(p.dashX, -p.dashZ);
    const n = BROAD_N + (p.perfect ? BROAD_PERFECT : 0);
    for (const side of [-1, 1]) {
      const at = a + (side * Math.PI) / 2;
      for (let k = 0; k < n; k++) {
        const off = (k / (n - 1) - 0.5) * BROAD_SPREAD;
        const s = lv.addShot(p.id, 'slug', p.x + Math.sin(at) * 0.8, p.z - Math.cos(at) * 0.8, at + off, 56 + lv.rand() * 8, BROAD_DMG, 0.42, 0, 0);
        s.graft = 'broadside';
        s.blow = true;
      }
    }
    this.went(p, 'dash', 'broadside', p.x, p.z, p.perfect ? 'perfect' : 'go', { n: a });
  }

  /** Along a bit of a RAM LINE dash: a blow on everything on it (once each a dash). */
  ramAlong(p: Player, x0: number, z0: number, x1: number, z1: number) {
    const lv = this.lv;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l2 = dx * dx + dz * dz || 1;
    for (const e of lv.enemies) {
      if (e.dead || e.shielded || e.ground || e.t < 0 || p.rammed.includes(e.id) || !lv.seen(e)) continue;
      const t = clamp(((e.x - x0) * dx + (e.z - z0) * dz) / l2, 0, 1);
      if ((x0 + dx * t - e.x) ** 2 + (z0 + dz * t - e.z) ** 2 > (e.r + p.stats.core + 0.9) ** 2) continue;
      p.rammed.push(e.id);
      // a staggered one is the collider's (the takedown); the rest are rammed aside
      if (e.state === 'stagger') continue;
      lv.damage(e, RAM_DMG * (p.perfect ? 1.5 : 1), p.id, p.perfect);
      if (!e.dead && !e.boss) {
        e.stun = Math.max(e.stun, RAM_STUN);
        if (!e.ground && e.d.board === undefined && e.d.qp === undefined) {
          // thrown off the line, to whichever side it's on
          const side = Math.sign((e.x - x0) * dz - (e.z - z0) * dx) || 1;
          const l = Math.sqrt(l2);
          e.kx = (-dz / l) * side * -18;
          e.kz = (dx / l) * side * -18;
        }
      }
      this.went(p, 'dash', 'ramline', e.x, e.z, 'ram');
    }
  }

  /** The heavy fired (`fired` rounds). */
  heavy(p: Player) {
    if (p.grafts.heavy !== 'eye') return;
    const e = this.lv.nearestEnemy(p.x, p.z);
    const eye = p.gs.eye;
    // it opens looking straight ahead (or where it was looking) and swings to its prey
    if (eye.t <= 0) eye.a = 0;
    eye.t = EYE_TIME;
    eye.tick = 0;
    eye.target = e?.id ?? 0;
    this.went(p, 'heavy', 'eye');
  }

  /** A heavy round just fired: what its graft makes of it. */
  heavyShot(p: Player, s: Shot) {
    const g = p.grafts.heavy;
    if (g === 'squareturn' && s.kind !== 'mine') {
      s.graft = g;
      s.sq = 0;
    } else if (g === 'bloom') s.graft = g;
  }

  /** The aux went off (`i`: which way you're pushing). */
  aux(p: Player) {
    const g = p.grafts.aux;
    const lv = this.lv;
    if (g === 'halo') {
      this.ring(p, 0);
      p.gs.halo = HALO_BEAT;
      this.went(p, 'aux', g);
    } else if (g === 'crane') {
      const was = p.gs.crane;
      const dir = was ? -was.dir : lv.rand() < 0.5 ? -1 : 1;
      p.gs.crane = { t: 0, dir, hit: [], x: p.x, z: p.z, back: false };
      this.went(p, 'aux', g);
    } else if (g === 'bind') {
      const e = lv.nearestEnemy(p.x, p.z, 40);
      if (!e) return;
      const i = this.binds.findIndex((b) => b.owner === p.id);
      if (i >= 0) this.binds.splice(i, 1);
      this.binds.push({ owner: p.id, enemy: e.id, t: BIND_TIME });
      this.went(p, 'aux', g, e.x, e.z, 'bind', { n: e.id });
    }
  }

  /** A ring of shards out from the ship (the second turned half a shard). */
  private ring(p: Player, k: number) {
    const lv = this.lv;
    const a0 = (k * Math.PI) / HALO_N + lv.rand() * 0.1;
    for (let n = 0; n < HALO_N; n++) {
      const s = lv.addShot(p.id, 'slug', p.x, p.z, a0 + (n / HALO_N) * Math.PI * 2, 34, HALO_DMG, 0.55, 1, 0);
      s.graft = 'halo';
      s.blow = true;
    }
  }

  /** The special went off (`ix`: which way you're pushing, across). */
  special(p: Player, ix: number) {
    const g = p.grafts.special;
    const lv = this.lv;
    if (g === 'spindle') {
      p.gs.arms = { t: -ARMS_DRAW, a: Math.PI / 4, dir: p.gs.arms?.dir === 1 ? -1 : 1, fire: 0, tick: 0 };
      this.went(p, 'special', g, p.x, p.z, 'draw');
    } else if (g === 'skydive') {
      // across the screen the way you're pushing, or towards the side with more room
      const dir = Math.abs(ix) > 0.3 ? Math.sign(ix) : p.x > 0 ? -1 : 1;
      const end = dir * (HALF_W - 1.5);
      p.gs.dive = { t: -DIVE_TELL, dir, s: p.z - lv.scroll, egg: 0, hit: [], end };
      p.inv = Math.max(p.inv, DIVE_TELL + 1);
      this.went(p, 'special', g, p.x, p.z, 'lane', { x2: end, z2: p.z });
    }
  }

  /** Diving (SKY DIVE): the ship isn't yours to fly till it's done. */
  diving(p: Player) {
    return !!p.gs.dive;
  }

  /** The dive, a frame of it: the ship's moved here, not by the stick. */
  dive(p: Player) {
    const d = p.gs.dive!;
    const lv = this.lv;
    d.t += DT;
    p.vx = p.vz = 0;
    p.z = lv.scroll + d.s;
    p.inv = Math.max(p.inv, 0.3);
    if (d.t < 0) return;
    if (d.t - DT < 0) this.went(p, 'special', 'skydive', p.x, p.z, 'dive');
    const x0 = p.x;
    const step = DIVE_SPEED * DT;
    p.x = d.dir > 0 ? Math.min(d.end, p.x + step) : Math.max(d.end, p.x - step);
    // eggs along the way, every so often
    d.egg += Math.abs(p.x - x0);
    while (d.egg >= DIVE_EGG) {
      d.egg -= DIVE_EGG;
      const ex = p.x - d.dir * d.egg;
      const s = lv.addShot(p.id, 'mine', ex, p.z, 0, 0, EGG_DMG, 0.5 + lv.rand() * 0.12, 0, 0);
      s.graft = 'skydive';
      s.blow = true;
      s.vx = s.vz = 0;
    }
    // through what's in the lane: rammed
    for (const e of lv.enemies) {
      if (e.dead || e.shielded || e.ground || e.t < 0 || d.hit.includes(e.id) || !lv.seen(e)) continue;
      if (Math.abs(e.z - p.z) > e.r + 1.2 || (e.x - x0) * d.dir < -e.r || (e.x - p.x) * d.dir > e.r) continue;
      d.hit.push(e.id);
      lv.damage(e, DIVE_RAM, p.id, false);
      this.went(p, 'special', 'skydive', e.x, e.z, 'ram');
    }
    if (p.x === d.end) {
      p.gs.dive = null;
      p.vx = d.dir * 20;
      p.inv = Math.max(p.inv, 0.35);
      this.went(p, 'special', 'skydive', p.x, p.z, 'end');
    }
  }

  // --- every frame -------------------------------------------------------------------------

  /** A player's grafts, a frame: the trigger's and the boost's, the eye, the arms, the ball. */
  tick(p: Player) {
    const gs = p.gs;
    for (const v in gs.fired) gs.fired[v as GraftVerb]! += DT;
    if (p.down) {
      gs.eye.t = 0;
      gs.arms = null;
      gs.crane = null;
      gs.dive = null;
      return;
    }
    const lv = this.lv;
    const over = lv.state === 'clear' || lv.state === 'failed';
    // the trigger's: loads while it's held
    const tg = p.grafts.trigger;
    if (tg && p.firing && !over && p.stats.guns.some((g) => !g.heavy)) {
      gs.trig += DT;
      const every = tg === 'torpedo' ? TUBE_EVERY : SPIT_EVERY;
      if (gs.trig >= every) {
        gs.trig -= every;
        if (tg === 'torpedo') this.torpedo(p);
        else if (tg === 'acid') this.spit(p);
      }
    }
    // the boost's: something left in the wake
    const bg = p.grafts.boost;
    gs.wake += DT;
    if (bg && p.boosting > 0.05 && !over) {
      const every = bg === 'thorns' ? THORN_EVERY : SPORE_EVERY;
      if (gs.wake >= every) {
        gs.wake = 0;
        if (bg === 'thorns') this.thorn(p);
        else this.cloud(p, p.x, p.z + 1.4, 'spores');
      }
    }
    if (gs.eye.t > 0) this.eye(p);
    if (gs.arms) this.arms(p);
    if (gs.crane) this.crane(p);
    if (gs.halo > 0 && (gs.halo -= DT) <= 0) this.ring(p, 1);
  }

  private torpedo(p: Player) {
    const gs = p.gs;
    gs.side = -gs.side;
    const lv = this.lv;
    const s = lv.addShot(p.id, 'missile', p.x + gs.side * 0.9, p.z + 0.4, gs.side * 1.75, 14, TORP_DMG, 3, 0, 0);
    // (it steers itself: see shot())
    s.homing = 0;
    s.graft = 'torpedo';
    s.blow = true;
    this.went(p, 'trigger', 'torpedo', s.x, s.z);
  }

  private spit(p: Player) {
    const lv = this.lv;
    const e = lv.nearestEnemy(p.x, p.z, SPIT_REACH, true);
    if (!e) return;
    // where it'll be when the glob comes down
    const x = clamp(e.x + e.vx * SPIT_FLY * 0.6, -HALF_W + 1, HALF_W - 1);
    const z = e.z + e.vz * SPIT_FLY * 0.6;
    this.globs.push({ owner: p.id, x0: p.x, z0: p.z - lv.scroll, x, z: z - lv.scroll, t: 0, done: false });
    this.went(p, 'trigger', 'acid', p.x, p.z, 'spit', { x2: x, z2: z });
  }

  private thorn(p: Player) {
    const lv = this.lv;
    if (lv.shots.filter((s) => s.graft === 'thorns' && s.owner === p.id && !s.dead).length >= THORN_MAX) return;
    const s = lv.addShot(p.id, 'mine', p.x + (lv.rand() - 0.5) * 1.2, p.z + 1.2, 0, 0, THORN_DMG, THORN_LIFE, 0, 0);
    s.graft = 'thorns';
    s.blow = true;
    p.gs.fired.boost = 0;
  }

  /** A ring of `n` spore clouds round (x, z), and one in the middle (THE CHOIR'S HUM, a PLAGUE NOTICE). */
  sporeRing(p: Player, x: number, z: number, n: number) {
    this.cloud(p, x, z, 'bloom');
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.cloud(p, x + Math.cos(a) * SPORE_R * 1.6, z + Math.sin(a) * SPORE_R * 1.6, 'bloom');
    }
  }

  private cloud(p: Player, x: number, z: number, from: 'spores' | 'bloom') {
    const mine = this.patches.filter((c) => c.kind === 'spore' && c.owner === p.id && !c.dead);
    if (mine.length >= SPORE_MAX) mine[0].dead = true;
    this.patches.push({ kind: 'spore', owner: p.id, x, z, r: SPORE_R * (from === 'bloom' ? 1.3 : 1), t: 0, life: SPORE_LIFE, tick: 0, dead: false });
    if (from === 'spores') p.gs.fired.boost = 0;
  }

  /** The eye, a frame: it turns to its prey (the nearest, if that's gone) and burns down its line. */
  private eye(p: Player) {
    const lv = this.lv;
    const eye = p.gs.eye;
    eye.t -= DT;
    let e = lv.enemies.find((o) => o.id === eye.target && !o.dead && lv.seen(o));
    if (!e) {
      e = lv.nearestEnemy(p.x, p.z);
      eye.target = e?.id ?? 0;
    }
    if (e) {
      const want = Math.atan2(e.x - p.x, -(e.z - p.z));
      const da = Math.atan2(Math.sin(want - eye.a), Math.cos(want - eye.a));
      eye.a += clamp(da, -EYE_TURN * DT, EYE_TURN * DT);
    }
    const reach = lv.reach(p.x, p.z, eye.a, 1);
    eye.len = reach.len;
    if ((eye.tick -= DT) > 0) return;
    eye.tick += EYE_TICK;
    lv.asBlow(() => {
      for (const o of reach.hit) lv.damage(o, EYE_DMG, p.id, false);
    });
  }

  /** The arms, a frame: drawn out, then turning, firing from their tips and cutting what they sweep. */
  private arms(p: Player) {
    const lv = this.lv;
    const a = p.gs.arms!;
    a.t += DT;
    if (a.t < 0) return;
    if (a.t - DT < 0) this.went(p, 'special', 'spindle', p.x, p.z, 'spin');
    if (a.t >= ARMS_SPIN) {
      p.gs.arms = null;
      this.went(p, 'special', 'spindle', p.x, p.z, 'end');
      return;
    }
    // it winds up to speed and down again at the end
    const k = Math.min(1, a.t / 0.3, (ARMS_SPIN - a.t) / 0.3 + 0.2);
    a.a += a.dir * ARMS_TURN * k * DT;
    a.fire -= DT;
    const fire = a.fire <= 0;
    if (fire) a.fire += ARMS_FIRE;
    a.tick -= DT;
    const cut = a.tick <= 0;
    if (cut) a.tick += 0.1;
    for (let n = 0; n < 4; n++) {
      const arm = a.a + (n * Math.PI) / 2;
      const ux = Math.sin(arm);
      const uz = -Math.cos(arm);
      if (fire) {
        const s = lv.addShot(p.id, 'slug', p.x + ux * ARMS_LEN, p.z + uz * ARMS_LEN, arm + a.dir * 0.4, 45, ARMS_SHOT, 0.45, 0, 0);
        s.graft = 'spindle';
      }
      if (!cut) continue;
      lv.asBlow(() => {
        for (const e of lv.enemies) {
          if (e.dead || e.shielded || e.t < 0 || !lv.seen(e)) continue;
          const ex = e.x - p.x;
          const ez = e.z - p.z;
          const along = ex * ux + ez * uz;
          if (along < 0 || along > ARMS_LEN + e.r) continue;
          if (Math.abs(ex * uz - ez * ux) > e.r + 0.7) continue;
          lv.damage(e, ARMS_CUT, p.id, false);
        }
      });
    }
  }

  /** Where the crane's ball is `t` into its swings (from the `dir` side, over, and back). */
  ballAt(p: Player, c: NonNullable<GraftState['crane']>) {
    const a = -c.dir * CRANE_ARC * Math.cos((Math.PI * c.t) / CRANE_SWING);
    return { x: p.x + Math.sin(a) * CRANE_LEN, z: p.z - Math.cos(a) * CRANE_LEN, a };
  }

  private crane(p: Player) {
    const lv = this.lv;
    const c = p.gs.crane!;
    c.t += DT;
    if (c.t >= CRANE_SWING * 2) {
      p.gs.crane = null;
      return;
    }
    // over the top and coming back: free to hit everything again
    if (!c.back && c.t >= CRANE_SWING) {
      c.back = true;
      c.hit = [];
      this.went(p, 'aux', 'crane', c.x, c.z, 'turn');
    }
    const was = { x: c.x, z: c.z };
    const b = this.ballAt(p, c);
    c.x = b.x;
    c.z = b.z;
    const vx = (c.x - was.x) / DT;
    const vz = (c.z - was.z) / DT;
    // bullets it meets are batted back the way it's swinging
    let batted = 0;
    for (const bl of lv.bullets) {
      if (bl.dead || (bl.x - c.x) ** 2 + (bl.z - c.z) ** 2 > (CRANE_R + bl.r + 0.3) ** 2) continue;
      bl.dead = true;
      batted++;
      const out = Math.atan2(bl.x - p.x, -(bl.z - p.z));
      const sh = lv.addShot(p.id, 'slug', bl.x, bl.z, out + (lv.rand() - 0.5) * 0.3, 55, CRANE_BAT, 0.8, 0, 1);
      sh.tag = 'reflect';
    }
    if (batted) this.went(p, 'aux', 'crane', c.x, c.z, 'bat', { n: batted });
    for (const e of lv.enemies) {
      if (e.dead || e.shielded || e.t < 0 || c.hit.includes(e.id) || !lv.seen(e)) continue;
      if ((e.x - c.x) ** 2 + (e.z - c.z) ** 2 > (CRANE_R + e.r) ** 2) continue;
      c.hit.push(e.id);
      lv.damage(e, CRANE_DMG, p.id, false, { x: c.x, z: c.z });
      if (!e.dead && !e.boss && !e.ground && e.d.board === undefined && e.d.qp === undefined) {
        const v = Math.hypot(vx, vz) || 1;
        e.kx = (vx / v) * 30;
        e.kz = (vz / v) * 30;
        e.stun = Math.max(e.stun, 0.4);
      }
      this.went(p, 'aux', 'crane', e.x, e.z, 'hit');
    }
  }

  // --- shots -------------------------------------------------------------------------------

  /** A graft's shot, before it moves: true if it's holding still this frame. */
  shot(s: Shot): boolean {
    const lv = this.lv;
    if (s.graft === 'torpedo') {
      // out slow from the tube, then it lights and runs at the nearest
      const sp = Math.hypot(s.vx, s.vz) || 1;
      let have = Math.atan2(s.vx, -s.vz);
      if (s.t < 0.3) {
        s.vx *= 0.94;
        s.vz *= 0.94;
        return false;
      }
      const e = lv.nearestEnemy(s.x, s.z);
      if (e) {
        const want = Math.atan2(e.x - s.x, -(e.z - s.z));
        have += clamp(Math.atan2(Math.sin(want - have), Math.cos(want - have)), -TORP_TURN * DT, TORP_TURN * DT);
      } else if (s.t < 0.5) have = lerp(have, 0, 0.1);
      const v = Math.min(TORP_SPEED, sp + 70 * DT);
      s.vx = Math.sin(have) * v;
      s.vz = -Math.cos(have) * v;
      return false;
    }
    if (s.graft !== 'squareturn') return false;
    if (s.sq === 1) {
      s.halt! -= DT;
      if (s.halt! > 0) return true;
      s.sq = 2;
      s.vx = s.nvx!;
      s.vz = s.nvz!;
      s.t = Math.min(s.t, s.life - 0.6);
      return false;
    }
    if (s.sq !== 0) return false;
    // level with an enemy it'd fly past: stop, and turn square into it
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < 1) return false;
    const ux = s.vx / sp;
    const uz = s.vz / sp;
    const step = sp * DT;
    let best: Enemy | undefined;
    let bd = SQUARE_REACH;
    for (const e of lv.enemies) {
      if (e.dead || e.shielded || e.t < 0 || s.hit.includes(e.id) || !lv.seen(e)) continue;
      const ex = e.x - s.x;
      const ez = e.z - s.z;
      const along = ex * ux + ez * uz;
      if (along < -step || along > Math.max(step, e.r * 0.5)) continue;
      const across = Math.abs(ex * uz - ez * ux);
      if (across <= e.r + 0.6 || across > bd) continue;
      bd = across;
      best = e;
    }
    if (!best) return false;
    const side = Math.sign((best.x - s.x) * uz - (best.z - s.z) * ux);
    s.sq = 1;
    s.halt = SQUARE_HOLD;
    // square to its line, towards it
    s.nvx = uz * side * Math.max(sp, 60);
    s.nvz = -ux * side * Math.max(sp, 60);
    s.x += ux * ((best.x - s.x) * ux + (best.z - s.z) * uz);
    s.z += uz * ((best.x - s.x) * ux + (best.z - s.z) * uz);
    const p = lv.players[s.owner];
    if (p) this.went(p, 'heavy', 'squareturn', s.x, s.z, 'turn', { x2: best.x, z2: best.z });
    return true;
  }

  /** A graft's shot has hit `e` (it's still in the air, or just spent). */
  hit(s: Shot, e: Enemy) {
    const lv = this.lv;
    const p = lv.players[s.owner];
    if (s.graft === 'torpedo') {
      lv.blast(s.x, s.z, TORP_BLAST, TORP_DMG * 0.4, s.owner, { quiet: true });
      if (p) this.went(p, 'trigger', 'torpedo', s.x, s.z, 'hit');
    } else if (s.graft === 'bloom' && s.hit.length === 0) {
      // the round flowers
      for (let k = 0; k < BLOOM_N; k++) {
        const sh = lv.addShot(s.owner, 'slug', e.x, e.z, (k / BLOOM_N) * Math.PI * 2 + lv.rand() * 0.2, 30, 6, 0.45, 0, 0);
        sh.graft = 'bloom';
        sh.marks = CRACK;
        sh.markStr = 1;
        sh.hit.push(e.id);
      }
      if (p) {
        this.cloud(p, e.x, e.z, 'bloom');
        this.went(p, 'heavy', 'bloom', e.x, e.z, 'flower');
      }
    }
  }

  /** A graft's mine has ripened (thorns, eggs): it's burst; what else it throws. */
  burst(s: Shot) {
    const lv = this.lv;
    if (s.graft === 'thorns') {
      const a0 = lv.rand() * Math.PI;
      for (let k = 0; k < 6; k++) {
        const sh = lv.addShot(s.owner, 'slug', s.x, s.z, a0 + (k / 6) * Math.PI * 2, 40, 5, 0.35, 0, 0);
        sh.graft = 'thorns';
      }
    }
    const p = lv.players[s.owner];
    if (p && (s.graft === 'thorns' || s.graft === 'skydive')) lv.emit({ type: 'graft', id: p.id, graft: s.graft, what: 'burst', x: s.x, z: s.z });
  }

  /** Halo shards and the bloom's spores cut through the enemy fire they meet. */
  private cuts(b: Bullet) {
    for (const s of this.lv.shots) {
      if (s.dead || s.graft !== 'halo') continue;
      if ((b.x - s.x) ** 2 + (b.z - s.z) ** 2 < (b.r + 0.6) ** 2) return true;
    }
    return false;
  }

  // --- the field: what grafts leave about ----------------------------------------------------

  update(dz: number) {
    const lv = this.lv;
    // talon strikes coming down
    for (const st of this.stoops) {
      st.t += DT;
      st.z -= dz;
      if (st.t < STOOP_WARN || st.done) continue;
      st.done = true;
      lv.blast(st.x, st.z, STOOP_R, STOOP_DMG, st.owner, { quiet: true });
      lv.emit({ type: 'graft', id: st.owner, graft: 'stoop', what: 'strike', x: st.x, z: st.z });
    }
    // acid in flight, then a puddle
    for (const g of this.globs) {
      g.t += DT;
      if (g.t < SPIT_FLY || g.done) continue;
      g.done = true;
      const z = lv.scroll + g.z;
      this.patches.push({ kind: 'acid', owner: g.owner, x: g.x, z, r: ACID_R, t: 0, life: ACID_LIFE, tick: 0, dead: false });
      lv.blast(g.x, z, ACID_R * 0.7, 8, g.owner, { quiet: true, bits: CRACK });
      lv.emit({ type: 'graft', id: g.owner, graft: 'acid', what: 'splash', x: g.x, z });
    }
    for (const c of this.patches) {
      c.t += DT;
      c.z -= dz;
      if (c.t >= c.life) {
        c.dead = true;
        continue;
      }
      // spores eat the fire that comes through them
      if (c.kind === 'spore') for (const b of lv.bullets) if (!b.dead && b.kind !== 'seeker' && (b.x - c.x) ** 2 + (b.z - c.z) ** 2 < (c.r * 0.9) ** 2) lv.cancel(b);
      if ((c.tick -= DT) > 0) continue;
      c.tick += 0.25;
      for (const e of lv.enemies) {
        if (e.dead || e.shielded || e.t < 0 || (e.x - c.x) ** 2 + (e.z - c.z) ** 2 > (c.r + e.r * 0.7) ** 2) continue;
        lv.damage(e, c.kind === 'acid' ? ACID_DMG : SPORE_DMG, c.owner, false, null, undefined, true);
        if (!e.dead) mark(lv, e, CRACK, c.kind === 'acid' ? 1 : 0.6, c.owner);
      }
    }
    // binds run down (or go with what they bound)
    for (const b of this.binds) b.t -= DT;
    sweep(this.stoops, (s) => s.done);
    sweep(this.globs, (g) => g.done);
    sweep(this.patches, (c) => c.dead);
    sweep(this.binds, (b) => b.t <= 0 || !lv.enemies.some((e) => e.id === b.enemy && !e.dead));
    // halo shards cut through what they meet
    if (lv.shots.some((s) => s.graft === 'halo' && !s.dead)) for (const b of lv.bullets) if (!b.dead && b.kind !== 'seeker' && this.cuts(b)) lv.cancel(b);
  }

  /** A hit on `e` that it took (`dmg`): if it's bound, everything near it takes a share. */
  share(e: Enemy, dmg: number, dot: boolean) {
    if (this.sharing || !this.binds.length || dmg <= 0) return;
    const b = this.binds.find((x) => x.enemy === e.id);
    if (!b) return;
    const lv = this.lv;
    this.sharing = true;
    let n = 0;
    for (const o of lv.enemies) {
      if (o === e || o.dead || o.shielded || o.t < 0 || (o.x - e.x) ** 2 + (o.z - e.z) ** 2 > BIND_REACH * BIND_REACH) continue;
      lv.damage(o, dmg * BIND_SHARE, b.owner, false, null, undefined, dot);
      n++;
    }
    this.sharing = false;
    if (n && !dot) lv.emit({ type: 'graft', id: b.owner, graft: 'bind', what: 'share', x: e.x, z: e.z, n });
  }

  /** The bound enemy of a player's, if any (for the view). */
  boundBy(owner: number) {
    return this.binds.find((b) => b.owner === owner);
  }

  // --- bonds -------------------------------------------------------------------------------

  /** A kill by `owner`: what the bonds make of it. */
  killed(e: Enemy, owner: number) {
    const lv = this.lv;
    const p = lv.players[owner];
    if (!p || e.boss) return;
    if (this.bonded(p, 'scrap')) {
      // SALVAGE RIGHTS: it comes apart in shrapnel
      const a0 = lv.rand() * Math.PI * 2;
      for (let k = 0; k < SALVAGE_N; k++) lv.addShot(owner, 'slug', e.x, e.z, a0 + (k / SALVAGE_N) * Math.PI * 2, 42, SALVAGE_DMG, 0.4, 0, 0).hit.push(e.id);
      lv.emit({ type: 'bond', id: owner, faction: 'scrap', x: e.x, z: e.z });
    }
    if (this.bonded(p, 'bloom') && marksOn(e)) {
      // OVERGROWTH: its marks take root in the nearest
      spread(lv, e, owner);
      lv.emit({ type: 'bond', id: owner, faction: 'bloom', x: e.x, z: e.z });
    }
  }

  /** A takedown: what it fills the Weld with, the bonds counted (BLOOD UP doubles it). */
  takedownWeld(p: Player, k: number) {
    if (!this.bonded(p, 'wild')) return k;
    this.lv.emit({ type: 'bond', id: p.id, faction: 'wild', x: p.x, z: p.z });
    return k * 2;
  }

  /** Pierce a trigger shot gets from the bonds (TRUE LINE). */
  pierce(p: Player) {
    return this.bonded(p, 'lattice') ? 1 : 0;
  }
}

function sweep<T>(xs: T[], gone: (x: T) => boolean) {
  let j = 0;
  for (let i = 0; i < xs.length; i++) if (!gone(xs[i])) xs[j++] = xs[i];
  xs.length = j;
}
