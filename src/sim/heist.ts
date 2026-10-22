/**
 * A heist: a loaded freighter (the runner) making a run for a jump point, and you running it down.
 * It flies at the top of the screen with three strongboxes clamped on: shoot one's clamps and it
 * breaks loose and falls back down the screen on a drogue, to be caught (each one caught is a card
 * at the results). Its two rear turrets guard them, it drops mines out of its bay and launches
 * fighters now and then, and its engines' wash burns anything flying right behind them.
 *
 * Shooting out an engine slows it: it sinks down the screen, closer and easier to work on. With both
 * out, the shield over its bridge fails and it can be taken down: everything still aboard spills
 * free. Near the end of the level it spools its jump drive, and whatever's still on it is gone.
 */

import type { Enemy, Level, Shot } from './level';
import { DT, HALF_H, HALF_W } from './types';
import { clamp, damp } from '../util';
import { go } from './combat';
import { lerpAngle } from './foes';
import type { EnemySkin } from '../world/planets';

/** Where its parts sit (x across, z down the screen, from its middle). Matches tools/models/ships.py. */
export const RUNNER = {
  pods: [
    { x: -5.1, z: -0.4, y: 0.45 },
    { x: 5.1, z: -0.4, y: 0.45 },
    { x: 0, z: 2.4, y: 1.3 },
  ],
  engines: [
    { x: -2.35, z: 6.5 },
    { x: 2.35, z: 6.5 },
  ],
  turrets: [
    { x: -1.9, z: -2.3 },
    { x: 1.9, z: -2.3 },
  ],
  core: { x: 0, z: -4.4 },
  /** The hull: this wide (half), from `front` to `back` (z from its middle). */
  half: 2.8,
  front: -8.4,
  back: 7.2,
  /** The bay, where mines drop and fighters launch from. */
  bay: { x: 0, z: 7.4 },
};

/** The shield over the bridge (half its size across and along), while both engines run. */
const DOME = { x: 2.7, z: 2.3 };
/** Half its width out to the strongboxes' outriggers (for steering round rock). */
const WIDE = 6.6;
/** Hull of each part, before the difficulty. */
const HP = { pod: 70, turret: 90, engine: 240, core: 520 };
/** How far up the screen it holds (screen z of its middle), by engines still running. */
const HOLD = [-2, -6, -10];
/** A falling strongbox: how fast it drops back down the screen (u/s), and how close counts as caught. */
const FALL = 8;
const CATCH = 2.6;
/** The jet wash behind a running engine: where it starts (behind the engine's middle), how long, how wide (half). */
export const WASH = { from: 2, len: 5.5, half: 0.9 };
/** When the jump drive starts spooling, and when it jumps (of the way to the level's end). */
const SPOOL = 0.86;
const JUMP = 0.965;
/** The turrets' rhythm: the tell, the burst, how long they're open after. */
const AIM = 0.75;
const BURST = 3;
const OPEN = 0.9;

export type PartKind = 'pod' | 'turret' | 'engine' | 'core';

/** A strongbox shot loose, on its way down the screen. */
export interface Loose {
  id: number;
  x: number;
  z: number;
  vx: number;
  t: number;
  /** Which way it tumbles, and how far it has. */
  spin: number;
  dead: boolean;
}

/** What became of each strongbox: still aboard, falling, caught, or gone (dropped past you, or jumped with it). */
export type PodFate = 'aboard' | 'loose' | 'caught' | 'fell' | 'jumped';

export class Heist {
  /** Its middle, its sideways speed (for banking), and where it's holding on the screen. */
  x = 0;
  z: number;
  vx = 0;
  hold: number;
  /** The parts, as enemies (so guns, marks and reactions work on them as on anything else). */
  readonly pods: Enemy[] = [];
  readonly turrets: Enemy[] = [];
  readonly engines: Enemy[] = [];
  readonly core: Enemy;
  readonly fate: PodFate[] = ['aboard', 'aboard', 'aboard'];
  readonly loose: Loose[] = [];
  /** 'run': on its way; 'spool': jump drive winding up; 'jumped': gone; 'down': taken down. */
  state: 'run' | 'spool' | 'jumped' | 'down' = 'run';
  /** Seconds in this state, and in all. */
  stateT = 0;
  t = 0;
  /** Its weave across the field, and its nudge round anything tall in the way. */
  private phase: number;
  private dodge = 0;
  private mineT = 4;
  private launchT = 9;
  /** Scrap it paid when taken down (for the results). */
  paid = 0;
  /** A jolt (0..1) when an engine goes: the view lurches it. */
  lurch = 0;

  constructor(private lv: Level) {
    this.phase = lv.rand() * 10;
    // it starts close, and makes its run as the level starts
    this.hold = -4;
    this.z = lv.scroll + this.hold;
    const skin = lv.spec.planet.enemies.find((s) => s.archetype === 'carrier') ?? lv.spec.planet.enemies[0];
    const part = (kind: PartKind, k: number, p: { x: number; z: number }, arch: Enemy['arch'], hp: number, r: number, scrap: number, score: number) => {
      const hard = lv.hullScale();
      const e = lv.spawn(arch, skin, this.x + p.x, this.z + p.z, { qp: kind, qk: k }, { ground: false, y: 10, hp: hp * hard, r, scrap, score });
      e.hp = e.max;
      return e;
    };
    RUNNER.pods.forEach((p, k) => this.pods.push(part('pod', k, p, 'dart', HP.pod, 1.5, 0, 300)));
    RUNNER.turrets.forEach((p, k) => this.turrets.push(part('turret', k, p, 'gunship', HP.turret, 1.2, 3, 400)));
    RUNNER.engines.forEach((p, k) => this.engines.push(part('engine', k, p, 'carrier', HP.engine, 1.5, 8, 1200)));
    this.core = part('core', 0, RUNNER.core, 'carrier', HP.core, 2.2, 0, 6000);
    this.core.shielded = true;
    this.turrets.forEach((e, k) => (e.d.fire = 2.2 + k * 1.4));
  }

  get running() {
    return this.engines.filter((e) => !e.dead).length;
  }

  get caught() {
    return this.fate.filter((f) => f === 'caught').length;
  }

  /** Gone from the screen (jumped, or down): nothing of it to hit. */
  get gone() {
    return this.state === 'jumped' || this.state === 'down';
  }

  /** Where along the level (its progress) it starts to spool, and where it jumps. */
  get spoolAt() {
    return this.lv.endAt * SPOOL;
  }
  get jumpAt() {
    return this.lv.endAt * JUMP;
  }

  /** Seconds till it jumps. */
  get jumpIn() {
    return Math.max(0, ((this.jumpAt - this.lv.progress) * -this.lv.terrain.end) / this.lv.speed);
  }

  private get skin(): EnemySkin {
    return this.core.skin;
  }

  update(dz: number) {
    const lv = this.lv;
    this.t += DT;
    this.stateT += DT;
    this.lurch = Math.max(0, this.lurch - DT * 1.5);
    this.updateLoose(dz);
    if (this.gone) {
      if (this.state === 'jumped') this.z -= dz + DT * (40 + this.stateT * 120);
      return;
    }
    // carried with the screen, holding further up the more engines it has
    this.z -= dz;
    const want = this.state === 'spool' ? HOLD[2] - 3 : HOLD[this.running];
    this.hold = damp(this.hold, want, this.t < 3 ? 0.7 : 0.45, DT);
    this.z = damp(this.z, lv.scroll + this.hold, 2, DT);
    // a weave across the field (down a canyon, it follows the floor); slower on one engine
    const canyon = lv.terrain.biome(this.z).shape === 'canyon';
    const slow = this.running === 2 ? 1 : this.running === 1 ? 0.7 : 0.45;
    const wx = canyon ? lv.terrain.lineX(this.z) : 15 * Math.sin(this.t * 0.17 * slow + this.phase) + 6 * Math.sin(this.t * 0.071 + this.phase * 2);
    // anything tall ahead, or alongside its length: it swings wide of it, outriggers and all
    let push = 0;
    for (const c of lv.terrain.colliders(this.x, this.z - 12, 30)) {
      const ahead = this.z - c.z;
      if (ahead < RUNNER.front - 2 || ahead > 34) continue;
      const side = this.x - c.x;
      const room = c.r + WIDE + 2;
      if (Math.abs(side) < room) push += (side >= 0 ? 1 : -1) * (room - Math.abs(side)) * (ahead > 16 ? 1 : 2);
    }
    this.dodge = damp(this.dodge, clamp(push, -24, 24), 3, DT);
    const tx = lv.terrain.intoCanyon(clamp(wx + this.dodge, -HALF_W + 8, HALF_W - 8), this.z, RUNNER.half + 1);
    const nx = damp(this.x, tx, push ? 1.6 : 0.8, DT);
    this.vx = (nx - this.x) / DT;
    this.x = nx;
    this.place();
    if (lv.state !== 'flying') return;
    // the jump: it spools up, then it's gone with whatever it still carries
    const prog = lv.progress;
    if (this.state === 'run' && prog >= this.spoolAt) {
      this.state = 'spool';
      this.stateT = 0;
      lv.emit({ type: 'runner', what: 'spool', x: this.x, z: this.z });
    }
    if (this.state === 'spool' && prog >= this.jumpAt) return this.jump();
    this.wash();
    // the bay: mines out the back, and now and then a pair of fighters
    if ((this.mineT -= DT) <= 0) {
      this.mineT = 4.2 - lv.spec.difficulty * 0.8 + lv.rand() * 1.5;
      const b = RUNNER.bay;
      lv.bullet(this.x + b.x, this.z + b.z, (lv.rand() - 0.5) * 0.8, 5, { kind: 'mine', r: 0.7, life: 2.2, split: 6 + Math.round(lv.spec.difficulty * 2), color: this.skin.colors[2] });
      lv.emit({ type: 'runner', what: 'mine', x: this.x + b.x, z: this.z + b.z });
    }
    if ((this.launchT -= DT) <= 0) {
      this.launchT = 13 - lv.spec.difficulty * 2 + lv.rand() * 3;
      const skin = lv.director.skinFor('dart') ?? lv.spec.planet.enemies[0];
      // (a swoop starts above the screen: these join it part way, at the bay)
      const t0 = (this.z + RUNNER.bay.z - lv.scroll + HALF_H + 3) / 15;
      for (const s of [-1, 1]) lv.spawn('dart', skin, this.x + s * 1.2, this.z + RUNNER.bay.z, { path: 'swoop', x0: this.x + s * 4, phase: s > 0 ? 0 : Math.PI, amp: 5 }, { t: t0 });
      lv.emit({ type: 'runner', what: 'launch', x: this.x, z: this.z + RUNNER.bay.z });
    }
  }

  /** Every part where it sits on the hull. */
  private place() {
    const at = (e: Enemy, p: { x: number; z: number }) => {
      if (e.dead) return;
      e.x = this.x + p.x;
      e.z = this.z + p.z;
      e.vx = this.vx;
      e.vz = 0;
    };
    this.pods.forEach((e, k) => at(e, RUNNER.pods[k]));
    this.turrets.forEach((e, k) => at(e, RUNNER.turrets[k]));
    this.engines.forEach((e, k) => at(e, RUNNER.engines[k]));
    at(this.core, RUNNER.core);
  }

  /** A running engine's wash: flying right behind it burns. */
  private wash() {
    const lv = this.lv;
    for (const e of this.engines) {
      if (e.dead) continue;
      for (const p of lv.players) {
        if (p.down) continue;
        const dz = p.z - (e.z + WASH.from);
        if (dz > 0 && dz < WASH.len && Math.abs(p.x - e.x) < WASH.half) lv.hurt(p, p.x, p.z, 'jetwash');
      }
    }
  }

  /** One of its parts, each frame (called from updateEnemy): where it sits, and the turrets' fire. */
  fly(e: Enemy) {
    const lv = this.lv;
    if (this.gone) return;
    if (e.d.qp !== 'turret' || lv.state !== 'flying' || this.t < 2.5) return;
    const d = e.d;
    const p = lv.nearest(e.x, e.z);
    const want = p ? Math.atan2(p.x - e.x, p.z - e.z) : 0;
    switch (e.state) {
      case 'idle':
        e.aim = lerpAngle(e.aim, want, 0.08);
        if (p && e.stun <= 0 && (d.fire = (d.fire ?? 2) - DT) <= 0) {
          e.aim = want;
          go(lv, e, 'windup', AIM, 'burst', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(want) * 30, z2: e.z + Math.cos(want) * 30, w: 0.8, lock: AIM * 0.7 });
        }
        break;
      case 'windup': {
        // the tell tracks you until it locks, then holds where it'll fire
        const t = e.tele;
        if (t && t.shape === 'line') {
          if (e.stateT < t.lock) e.aim = lerpAngle(e.aim, want, 0.25);
          t.x = e.x;
          t.z = e.z;
          t.x2 = e.x + Math.sin(e.aim) * 30;
          t.z2 = e.z + Math.cos(e.aim) * 30;
        }
        if (e.stateT >= AIM) {
          d.n = 0;
          d.gone = 0;
          go(lv, e, 'attack', BURST * 0.13, 'burst');
        }
        break;
      }
      case 'attack':
        if ((d.gone = (d.gone ?? 0) - DT) <= 0 && (d.n ?? 0) < BURST) {
          d.gone = 0.13;
          d.n = (d.n ?? 0) + 1;
          const a = e.aim + ((d.n ?? 0) - 2) * 0.05;
          lv.bullet(e.x + Math.sin(a) * 1.4, e.z + Math.cos(a) * 1.4, a, 17, { kind: 'needle', r: 0.4, color: e.skin.colors[2] });
          lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: e.skin.colors[2] });
        }
        if ((d.n ?? 0) >= BURST && e.stateT >= BURST * 0.13) go(lv, e, 'recover', OPEN);
        break;
      case 'recover':
        if (e.stateT >= OPEN) {
          d.fire = 2.4 - lv.spec.difficulty * 0.5 + lv.rand() * 1.2;
          go(lv, e, 'idle');
        }
        break;
      default:
        go(lv, e, 'idle');
    }
  }

  /** One of its parts is gone (called from Level.kill). */
  lost(e: Enemy, owner: number) {
    const lv = this.lv;
    const k = e.d.qk ?? 0;
    // (taken down, it all goes at once: that's said once, by takeDown)
    if (this.state === 'down' && e.d.qp !== 'pod') return;
    switch (e.d.qp) {
      case 'pod': {
        // its clamps blown: it breaks loose and drops back down the screen
        this.fate[k] = 'loose';
        // (the side ones are flung clear of the wash; the middle one drops straight, between the engines)
        const side = RUNNER.pods[k].x === 0 ? (lv.rand() < 0.5 ? -1 : 1) : Math.sign(RUNNER.pods[k].x);
        this.loose.push({ id: k, x: e.x, z: e.z, vx: RUNNER.pods[k].x === 0 ? 0 : side * 5, t: 0, spin: side, dead: false });
        lv.emit({ type: 'cargo', what: 'loose', id: k, x: e.x, z: e.z });
        break;
      }
      case 'engine': {
        this.lurch = 1;
        lv.emit({ type: 'runner', what: 'engine', x: e.x, z: e.z, left: this.running, k });
        if (this.running === 0) {
          // dead in the air: the bridge's shield fails
          this.core.shielded = false;
          lv.emit({ type: 'runner', what: 'exposed', x: this.core.x, z: this.core.z });
        }
        break;
      }
      case 'turret':
        lv.emit({ type: 'runner', what: 'turret', x: e.x, z: e.z, k });
        break;
      case 'core':
        this.takeDown(owner);
        break;
    }
  }

  /** The bridge is gone: it breaks up, and everything aboard spills free. */
  private takeDown(owner: number) {
    const lv = this.lv;
    this.state = 'down';
    this.stateT = 0;
    for (const e of [...this.turrets, ...this.engines]) if (!e.dead) lv.kill(e, owner);
    for (const e of this.pods) if (!e.dead) lv.kill(e, owner);
    const hard = 1 + lv.spec.difficulty * 0.5;
    this.paid = Math.round(36 * hard);
    for (let k = 0; k < this.paid; k += 4) lv.drop('scrap', this.x + (lv.rand() - 0.5) * 8, this.z + (lv.rand() - 0.5) * 12, Math.min(4, this.paid - k));
    lv.score += 20000;
    lv.emit({ type: 'runner', what: 'down', x: this.x, z: this.z });
  }

  /** It jumps, with whatever's still aboard (and at the level's end, if it hasn't yet). */
  jump() {
    if (this.gone) return;
    const lv = this.lv;
    this.state = 'jumped';
    this.stateT = 0;
    for (const e of [...this.pods, ...this.turrets, ...this.engines, this.core]) e.dead = true;
    this.fate.forEach((f, k) => {
      if (f === 'aboard') this.fate[k] = 'jumped';
    });
    lv.emit({ type: 'runner', what: 'jump', x: this.x, z: this.z, left: this.fate.filter((f) => f === 'jumped').length });
  }

  /** The strongboxes falling: caught by flying into one, lost off the bottom of the screen. */
  private updateLoose(dz: number) {
    const lv = this.lv;
    for (const c of this.loose) {
      if (c.dead) continue;
      c.t += DT;
      // carried a little less than the screen: it drops back down it
      c.z -= dz - Math.min(FALL, c.t * 10) * DT;
      c.vx = damp(c.vx, 0, 1.2, DT);
      c.x = clamp(c.x + c.vx * DT, -HALF_W + 2, HALF_W - 2);
      const p = lv.players.find((q) => !q.down && (q.x - c.x) ** 2 + (q.z - c.z) ** 2 < CATCH * CATCH);
      if (p || (lv.state === 'clear' && c.t > 0)) {
        c.dead = true;
        this.fate[c.id] = 'caught';
        const who = p ?? lv.players[0];
        lv.emit({ type: 'cargo', what: 'caught', id: c.id, x: c.x, z: c.z, by: who.id });
        continue;
      }
      if (c.z > lv.bottom + 3) {
        c.dead = true;
        this.fate[c.id] = 'fell';
        lv.emit({ type: 'cargo', what: 'fell', id: c.id, x: c.x, z: lv.bottom });
      }
    }
  }

  /**
   * A player's shot over the bridge while its shield's up: the dome stops it. (The runner flies a
   * little under the fighters: shots pass over its hull, and only what stands up off it catches them.)
   */
  stops(s: Shot) {
    const c = this.core;
    if (this.gone || !c.shielded || s.kind === 'mine') return false;
    if (((s.x - c.x) / DOME.x) ** 2 + ((s.z - c.z) / DOME.z) ** 2 > 1) return false;
    s.dead = true;
    this.lv.emit({ type: 'armour', x: s.x, z: s.z });
    return true;
  }

  /** The level's end: how it went. */
  rank() {
    const n = this.caught;
    if (this.state === 'down' && n === 3) return 'S';
    if (this.state === 'down' || n === 3) return 'A';
    return n >= 1 ? 'B' : 'C';
  }
}
