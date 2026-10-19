/**
 * An escort: three haulers flying the length of the level in a loose formation, and you flying
 * cover. Fire aimed at whoever's nearest goes for them as readily as for you, so standing between
 * a hauler and a gun is how you keep it whole. Now and then raiders come to board one: they line up
 * (a tell runs from each to its prey), dive in, latch on and strip its hull until they're shot off.
 *
 * Every hauler that arrives pays, and each carries one crate for you: the parts you choose from at
 * the end are the ones that made it.
 */

import type { Enemy, Level } from './level';
import { DT, HALF_H, HALF_W } from './types';
import { clamp, damp, lerp, pick, rng, shuffle } from '../util';
import { go } from './combat';
import { lerpAngle, moveTo, sz } from './foes';
import type { EnemySkin } from '../world/planets';

/** Hull per hauler, and what each pays on arrival (both grow with the difficulty). */
const HULL = 40;
const PAY = 14;
/** The hull is a capsule along z: half its length between the end caps, and its radius. */
const HALF_LEN = 2.6;
const BEAM = 1.5;
/** Where each sits in the formation (screen space): the lead up front, two wings behind. */
const SLOTS = [
  { x: 0, s: -8 },
  { x: -9, s: 2 },
  { x: 9, s: 2 },
];
/** A beam laser chews through a hull this often. */
const LASER_TICK = 0.4;
/** Boarders: how long they line up, how fast they dive, how often they bite once on. */
const BOARD_AIM = 1.1;
const BOARD_SPEED = 34;
const BOARD_BITE = 0.65;

/**
 * What a hauler is, so that no two convoys ask the same of you. Each convoy is three of the four,
 * drawn from the site's seed (the chart shows them before you jump):
 *
 * - a FREIGHTER, plain;
 * - an ARMOURED barge, with two-thirds again of the hull, riding at the back where it's safest:
 *   the one you can leave alone a while;
 * - a COURIER, fast and thin-skinned, flying out ahead where the waves come in and wandering
 *   wide, paying half again for a quick run: the one that drags you up the screen;
 * - a PRIZE tanker, already shot up when it joins and smoking, carrying the best crate (a tier
 *   up, rare at the least): the one the boarders want, and so do you.
 */
export type Role = 'freighter' | 'armoured' | 'courier' | 'prize';
export const ROLES: Record<Role, { name: string; hull: number; start: number; pay: number; ahead: number; wander: number; variant: number | null; color: string; text: string }> = {
  freighter: { name: 'FREIGHTER', hull: 1, start: 1, pay: 1, ahead: 0, wander: 1, variant: null, color: '#8ad0ff', text: 'PLAIN' },
  armoured: { name: 'ARMOURED', hull: 1.7, start: 1, pay: 0.8, ahead: 5, wander: 0.7, variant: 2, color: '#b8c4d8', text: 'TOUGH, SLOW' },
  courier: { name: 'COURIER', hull: 0.75, start: 1, pay: 1.6, ahead: -7, wander: 1.5, variant: 0, color: '#8affb0', text: 'FRAIL, PAYS ×1.6' },
  prize: { name: 'PRIZE', hull: 1, start: 0.65, pay: 1, ahead: 0, wander: 1, variant: 1, color: '#ffd04a', text: 'HURT, BEST CRATE' },
};

/** The convoy a site's seed flies: three different roles, in their slots (lead, left, right). */
export function convoyRoles(seed: number): Role[] {
  const r = rng(Math.floor(seed) * 7919 + 13);
  return shuffle(r, ['freighter', 'armoured', 'courier', 'prize'] as Role[]).slice(0, 3);
}

/** A hauler's model: its role's, or the seed's for a plain freighter. */
export const haulerVariant = (role: Role, i: number, seed: number) => ROLES[role].variant ?? (i + Math.floor(seed)) % 3;

export interface Hauler {
  id: number;
  role: Role;
  /** Which model (0 containers, 1 tanks, 2 ore). */
  variant: number;
  /** Where it is on the flight plane, and its sideways speed (for banking). */
  x: number;
  z: number;
  vx: number;
  hp: number;
  max: number;
  dead: boolean;
  /** Seconds since it was last hit (the view flashes it). */
  hitT: number;
  /** Laser cooldown. */
  burnT: number;
  /** Boarders on it now. */
  boarders: number;
  /** Its sideways nudge round an obstacle in the way. */
  dodge: number;
  /** Made it to the end. */
  delivered: boolean;
  /** Paid on arrival. */
  pay: number;
}

export class Convoy {
  readonly haulers: Hauler[] = [];
  /** Seconds flown, for the formation's wander. */
  private t = 0;
  private phase: number;
  /** A plain freighter's hull, at this difficulty (the others' are measured against it). */
  readonly baseHull: number;
  /** Paid out at the end (for the results). */
  paid = 0;
  allLost = false;

  constructor(private lv: Level) {
    this.phase = lv.rand() * 10;
    const hull = HULL * (1 + lv.spec.difficulty * 0.25);
    this.baseHull = Math.round(hull);
    const roles = convoyRoles(lv.spec.seed);
    SLOTS.forEach((s, i) => {
      const role = ROLES[roles[i]];
      const max = Math.round(hull * role.hull);
      this.haulers.push({
        id: i,
        role: roles[i],
        variant: haulerVariant(roles[i], i, lv.spec.seed),
        x: s.x,
        z: lv.scroll + s.s + role.ahead,
        vx: 0,
        hp: Math.round(max * role.start),
        max,
        dead: false,
        hitT: 99,
        burnT: 0,
        boarders: 0,
        dodge: 0,
        delivered: false,
        pay: 0,
      });
    });
  }

  living() {
    return this.haulers.filter((h) => !h.dead);
  }

  get delivered() {
    return this.haulers.filter((h) => h.delivered).length;
  }

  /** The nearest living hauler to (x, z), and its squared distance. */
  nearest(x: number, z: number): { h: Hauler | undefined; d2: number } {
    let h: Hauler | undefined;
    let d2 = Infinity;
    for (const o of this.haulers) {
      if (o.dead) continue;
      const d = (o.x - x) ** 2 + (o.z - z) ** 2;
      if (d < d2) {
        d2 = d;
        h = o;
      }
    }
    return { h, d2 };
  }

  update(dz: number) {
    const lv = this.lv;
    this.t += DT;
    const over = lv.state === 'clear';
    // the formation's middle wanders across the field (down a canyon, it follows the floor)
    const mid = lv.scroll;
    const canyon = lv.terrain.biome(mid).shape === 'canyon';
    const cx = canyon ? lv.terrain.lineX(mid) : 11 * Math.sin(this.t * 0.11 + this.phase) + 5 * Math.sin(this.t * 0.047 + this.phase * 2);
    const spread = canyon ? 0.55 : 1;
    for (const h of this.haulers) {
      h.hitT += DT;
      h.burnT = Math.max(0, h.burnT - DT);
      if (h.dead) continue;
      h.boarders = 0;
      if (over) {
        // delivered: full burn, off the top of the screen
        const away = lv.ending;
        h.z -= dz + DT * (4 + away * away * 30);
        continue;
      }
      const slot = SLOTS[h.id];
      const role = ROLES[h.role];
      // carried along with the screen, easing to its slot (a courier out ahead, the armour behind)
      h.z -= dz;
      const ts = slot.s + role.ahead;
      h.z = damp(h.z, lv.scroll + ts, 1.2, DT);
      // an obstacle ahead in its lane: ease round it
      let push = 0;
      for (const c of lv.terrain.colliders(h.x, h.z - 8, 10)) {
        const ahead = h.z - c.z;
        if (ahead < -2 || ahead > 16) continue;
        const side = h.x - c.x;
        const room = c.r + BEAM + 1.5;
        if (Math.abs(side) < room) push += (side >= 0 ? 1 : -1) * (room - Math.abs(side)) * 1.4;
      }
      h.dodge = damp(h.dodge, clamp(push, -10, 10), 2, DT);
      // a courier weaves on a line of its own, wider and quicker than the rest
      const own = role.wander > 1 ? 7 * Math.sin(this.t * 0.31 + this.phase * 3) : 0;
      let tx = (cx + own) * (canyon ? 1 : role.wander) + slot.x * spread + h.dodge;
      tx = lv.terrain.intoCanyon(clamp(tx, -HALF_W + 6, HALF_W - 6), h.z, BEAM + 1);
      const nx = damp(h.x, tx, 0.9, DT);
      h.vx = (nx - h.x) / DT;
      h.x = nx;
    }
  }

  /** Is (x, z) within `r` of a hauler's hull? Returns it. */
  touching(x: number, z: number, r: number): Hauler | undefined {
    for (const h of this.haulers) {
      if (h.dead) continue;
      const dz = clamp(z - h.z, -HALF_LEN, HALF_LEN);
      if ((x - h.x) ** 2 + (z - h.z - dz) ** 2 < (BEAM + r) ** 2) return h;
    }
    return undefined;
  }

  /** Enemy fire against the hulls: each bullet that lands is spent. */
  collide() {
    const lv = this.lv;
    if (lv.state !== 'flying' && lv.state !== 'boss') return;
    for (const b of lv.bullets) {
      if (b.dead) continue;
      const h = this.touching(b.x, b.z, b.r);
      if (!h) continue;
      b.dead = true;
      if (b.kind === 'torpedo') lv.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
      this.hit(h, b.kind === 'torpedo' ? 4 : b.kind === 'big' ? 2 : 1, b.x, b.z, 'fire');
    }
  }

  /** A beam across the field: whatever hull it crosses burns. */
  laser(inBeam: (x: number, z: number, r: number) => boolean) {
    for (const h of this.haulers) {
      if (h.dead || h.burnT > 0) continue;
      for (const k of [-1, 0, 1])
        if (inBeam(h.x, h.z + k * HALF_LEN, BEAM)) {
          h.burnT = LASER_TICK;
          this.hit(h, 1, h.x, h.z + k * HALF_LEN, 'laser');
          break;
        }
    }
  }

  hit(h: Hauler, dmg: number, x: number, z: number, cause: 'fire' | 'laser' | 'boarder') {
    const lv = this.lv;
    if (h.dead || lv.state === 'clear' || lv.state === 'failed') return;
    h.hp = Math.max(0, h.hp - dmg);
    h.hitT = 0;
    lv.emit({ type: 'haulerHit', id: h.id, x, z, dmg, cause, hp: h.hp, max: h.max });
    if (h.hp > 0) return;
    h.dead = true;
    lv.emit({ type: 'haulerLost', id: h.id, x: h.x, z: h.z, left: this.living().length });
    // what was aboard gets off
    for (const e of lv.enemies) if (e.d.board === h.id && e.d.ph === 3) e.d.ph = 4;
    if (!this.living().length && !this.allLost) {
      this.allLost = true;
      lv.emit({ type: 'convoyLost' });
    }
  }

  /** The level's end: every hauler still flying is delivered, and pays. */
  deliver() {
    const lv = this.lv;
    const hard = 1 + lv.spec.difficulty * 0.5;
    for (const h of this.haulers) {
      if (h.dead) continue;
      h.delivered = true;
      // a hull that came through whole pays a little extra (the prize came in hurt: half its hull will do)
      const whole = h.hp >= h.max * (h.role === 'prize' ? 0.5 : 0.75);
      h.pay = Math.round(PAY * hard * ROLES[h.role].pay * (whole ? 1.25 : 1));
      this.paid += h.pay;
      lv.scrap += h.pay;
      lv.score += h.pay * 100;
      lv.emit({ type: 'delivered', id: h.id, x: h.x, z: h.z, pay: h.pay });
    }
    const n = this.delivered;
    return n === 3 ? 'S' : n === 2 ? 'A' : n === 1 ? 'B' : 'C';
  }

  /** Raiders come to board a hauler: `n` of them, from one side, lining up on it. */
  board(skin: EnemySkin, n: number) {
    const lv = this.lv;
    const r = lv.rand;
    const live = this.living();
    if (!live.length) return;
    // they go for the one that's weakest, or worst covered
    const h = r() < 0.5 ? live.reduce((a, b) => (b.hp < a.hp ? b : a)) : pick(r, live);
    const side = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const x0 = side * (HALF_W + 4);
      const s0 = lerp(-HALF_H + 4, -8, r()) + k * 4;
      const e = lv.spawn('dart', skin, x0 + side * k * 3, lv.scroll + s0, { board: h.id, ph: 0, x0, hx: side * (8 + k * 5), hz: -10 + k * 4 });
      e.heading = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    lv.emit({ type: 'boarders', id: h.id, x: h.x, z: h.z, n, side });
  }

  /**
   * A boarder's whole life: in from the side to a spot off its prey, a tell along the line it'll
   * take, the dive, then on the hull biting until it's shot off (or the hauler goes).
   */
  fly(e: Enemy) {
    const lv = this.lv;
    const d = e.d;
    let h = this.haulers[d.board ?? 0];
    if ((!h || h.dead) && (d.ph ?? 0) < 3) {
      // its prey's gone: another, if there is one
      const next = this.nearest(e.x, e.z).h;
      if (next) {
        d.board = next.id;
        h = next;
      } else d.ph = 4;
    }
    const stunned = e.stun > 0;
    switch (d.ph ?? 0) {
      case 0: {
        // in to a spot off its prey's flank, a little ahead of it
        const tx = clamp(h.x + (d.hx ?? 8), -HALF_W + 3, HALF_W - 3);
        const ts = h.z - lv.scroll + (d.hz ?? -10);
        const cs = sz(lv, e);
        const k = stunned ? 0.4 : 1;
        moveTo(lv, e, e.x + clamp((tx - e.x) * 4, -30, 30) * DT * k, cs + clamp((ts - cs) * 4, -30, 30) * DT * k);
        if (e.t > 0.9) {
          d.ph = 1;
          e.aim = Math.atan2(h.x - e.x, h.z - e.z);
          go(lv, e, 'windup', BOARD_AIM, 'dive', { shape: 'line', x: e.x, z: e.z, x2: h.x, z2: h.z, w: e.r, lock: BOARD_AIM * 0.8, body: true });
        }
        break;
      }
      case 1: {
        // lining up: it holds off the hull, the tell tracking the hauler until it locks
        moveTo(lv, e, e.x + (h.vx ?? 0) * DT, sz(lv, e) - 0.2 * DT);
        const t = e.tele;
        if (t && t.shape === 'line' && e.stateT < t.lock) {
          e.aim = Math.atan2(h.x - e.x, h.z - e.z);
          t.x = e.x;
          t.z = e.z;
          t.x2 = h.x;
          t.z2 = h.z;
        }
        e.heading = lerpAngle(e.heading, e.aim, 0.2);
        if (e.stateT >= BOARD_AIM && !stunned) {
          d.ph = 2;
          d.gone = 0;
          go(lv, e, 'attack', 0, 'dive');
        }
        break;
      }
      case 2: {
        // the dive: straight down its line, bending only a little after the hull
        d.gone = (d.gone ?? 0) + DT;
        const want = Math.atan2(h.x - e.x, h.z - e.z);
        e.aim = lerpAngle(e.aim, want, 0.04);
        e.heading = e.aim;
        const v = BOARD_SPEED * (stunned ? 0.3 : 1);
        moveTo(lv, e, e.x + Math.sin(e.aim) * v * DT, sz(lv, e) + Math.cos(e.aim) * v * DT);
        if (this.touching(e.x, e.z, 0.4) === h) {
          d.ph = 3;
          d.tx = clamp(e.x - h.x, -BEAM * 0.8, BEAM * 0.8);
          d.tz = clamp(e.z - h.z, -HALF_LEN, HALF_LEN);
          d.fire = BOARD_BITE;
          go(lv, e, 'idle');
          lv.emit({ type: 'boarded', id: h.id, enemy: e.id, x: e.x, z: e.z });
        } else if (d.gone > 1.3) {
          // missed: away and round again
          d.ph = 0;
          e.t = 0.2;
          go(lv, e, 'idle');
        }
        break;
      }
      case 3: {
        // on the hull, cutting in
        e.x = h.x + (d.tx ?? 0);
        e.z = h.z + (d.tz ?? 0);
        e.vx = h.vx;
        e.vz = 0;
        e.heading = lerpAngle(e.heading, Math.atan2(-(d.tx ?? 0), -(d.tz ?? 0)), 0.1);
        h.boarders++;
        if (!stunned && (d.fire = (d.fire ?? BOARD_BITE) - DT) <= 0) {
          d.fire = BOARD_BITE;
          this.hit(h, 1, e.x, e.z, 'boarder');
        }
        break;
      }
      default:
        // off and away up the screen
        moveTo(lv, e, e.x + Math.sign(e.x || 1) * 10 * DT, sz(lv, e) - 26 * DT);
    }
  }
}

/** The skin a planet's boarders wear: its darts if it has them, its smallest fliers if not. */
export function boarderSkin(lv: Level): EnemySkin {
  const p = lv.spec.planet;
  const dart = p.enemies.find((s) => s.archetype === 'dart') ?? p.enemies.find((s) => s.archetype === 'swarm') ?? p.enemies[0];
  return { ...dart, archetype: 'dart', name: 'Boarder' };
}
