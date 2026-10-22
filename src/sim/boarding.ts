/**
 * A boarding: you cut into a freighter's aft lock and go aboard on foot. The crew are at their
 * posts; most haven't seen you yet. Somewhere in the holds are three crates worth taking (each
 * one a card at the results), on the bridge the strongbox, and in the vault the ship's core,
 * worth more than the rest put together. Pulling it locks the ship down.
 *
 * The moment you're in, somebody calls it in, and the kelters come: guild collectors cashing the
 * writ on your head, the bigger your price the sooner. A deckhand who gets to an alarm panel
 * brings them sooner still. When their pod clamps on, your own ship can only hold the lock a
 * little longer. Get back to it with what you've got, or be collected.
 *
 * On foot, with Rustwing's verbs: a rivet pistol you hold (it finds its own mark, near where
 * you're facing), the breacher you press (two shells, wide and brutal: it cracks plating), and
 * the dash, a slide. Plated crew glance most rivets off; crack the plating and they're OPEN:
 * slide into one for a takedown, which patches you up. A slide through a hit just as it lands is
 * PERFECT: time slows, and a shell comes back. Anyone who hasn't seen you yet goes down to a
 * slide from anywhere.
 *
 * Plain TypeScript at a fixed 60 Hz, driven only by Intents (no three.js): the view reads the
 * state and the events.
 */

import { DT, type Intent } from './types';
import { Deck, type Prop, type Room } from './deck';
import { clamp, rng, type Rng } from '../util';

export type FoeKind = 'deckhand' | 'gunner' | 'bruiser' | 'kelter';

export type FoeState =
  | 'idle' | 'sleep' | 'alert' | 'chase' | 'move' | 'alarm' | 'pull' | 'windup' | 'swing' | 'recover' | 'aim' | 'burst'
  | 'charge' | 'stun' | 'stagger' | 'reel' | 'dead';

/** What each kind of crewman is: hull, plating, size, pace, how far it sees. */
export const FOES: Record<FoeKind, { hp: number; plate: number; r: number; speed: number; sight: number; name: string }> = {
  deckhand: { hp: 4, plate: 0, r: 0.36, speed: 4.3, sight: 10, name: 'DECKHAND' },
  gunner: { hp: 5, plate: 4, r: 0.38, speed: 3.6, sight: 13, name: 'GUNNER' },
  bruiser: { hp: 12, plate: 8, r: 0.62, speed: 2.5, sight: 11, name: 'BRUISER' },
  kelter: { hp: 6, plate: 5, r: 0.4, speed: 5.0, sight: 18, name: 'KELTER' },
};

/** You on foot. */
export const HERO = {
  hp: 5,
  r: 0.34,
  speed: 6.4,
  accel: 60,
  /** The slide: how long, how fast, how long after before the next, and the window for a perfect. */
  dashT: 0.22,
  dashSpeed: 17,
  dashCd: 0.28,
  perfect: 0.16,
  /** The rivet pistol: rounds a second, speed, damage, how far it reaches for a mark. */
  rate: 7,
  rivetSpeed: 44,
  reach: 14,
  /** The breacher: shells, pellets, spread (radians, either side), seconds a shell takes to come back. */
  shells: 2,
  pellets: 7,
  spread: 0.34,
  reload: 1.5,
  /** After a hit, untouchable this long. */
  inv: 1.0,
};

/** Seconds to work things open (standing at them, not shooting). */
export const WORK = { crate: 1.8, strongbox: 3.0, core: 3.4, leave: 0.8, revive: 1.6 };

/** How long the kelters take (before the price on you), and how long your ship holds the lock once they're aboard. */
export const CLOCK = { base: 62, perBounty: 5, perHard: 5, min: 36, alarm: 12, lockdown: 16, dock: 26 };

export interface Hero {
  id: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Where it's facing and where it's aiming (radians, atan2(z, x)). */
  face: number;
  aim: number;
  hp: number;
  inv: number;
  dashT: number;
  dashAge: number;
  dashCd: number;
  dashX: number;
  dashZ: number;
  /** This slide already scored its perfect. */
  perfected: boolean;
  fireCd: number;
  shells: number;
  shellT: number;
  firing: boolean;
  /** Seconds since the last round it fired (for the arm to come down). */
  sinceShot: number;
  /** The mark the pistol has found (a foe's id, or -1). */
  mark: number;
  down: boolean;
  /** Knocked off its feet (by a reel-in, a blast): no control. */
  stun: number;
  hook: { by: number } | null;
  work: { kind: keyof typeof WORK; id: number; t: number } | null;
  /** Ran into this slide's takedown already. */
  bumped: boolean;
  room: number;
  kills: number;
  takedowns: number;
  perfects: number;
  hits: number;
  tins: number;
  /** For the steps: how far it's walked. */
  stride: number;
}

export interface Foe {
  id: number;
  kind: FoeKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** A shove from a hit, on top of its own walking. */
  kx: number;
  kz: number;
  r: number;
  face: number;
  /** Where it's aiming (gunners, kelters): turns slower than it looks. */
  aimA: number;
  hp: number;
  max: number;
  plate: number;
  plateMax: number;
  /** Seconds OPEN left (plating cracked, or stunned): a slide into it is a takedown. */
  open: number;
  state: FoeState;
  t: number;
  /** Cooldowns: its main attack, its other one. */
  cd: number;
  cd2: number;
  aware: boolean;
  asleep: boolean;
  runner: boolean;
  /** Which hero it's after. */
  target: number;
  room: number;
  /** Strafing this way (gunners). */
  strafe: number;
  shots: number;
  sinceHit: number;
  flash: number;
  dead: boolean;
  deathT: number;
  /** Which way it was going when it fell. */
  fallA: number;
  takenDown: boolean;
  /** Its alarm panel, while it runs for one. */
  alarmAt: number;
  home: { x: number; z: number };
  /** For the view's steps and gait. */
  stride: number;
}

export interface Round {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  life: number;
  from: 'hero' | 'foe';
  kind: 'rivet' | 'pellet' | 'crew' | 'hook' | 'turret';
  owner: number;
  dmg: number;
  plate: number;
  knock: number;
  dead: boolean;
}

export interface Tin {
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  value: number;
  t: number;
  taken: boolean;
}

export interface Crate {
  prop: Prop;
  t: number;
  open: boolean;
}

export interface Turret {
  prop: Prop;
  up: number;
  hp: number;
  aimA: number;
  state: 'down' | 'rise' | 'watch' | 'aim' | 'burst' | 'dead';
  t: number;
  shots: number;
  flash: number;
}

export interface Canister {
  prop: Prop;
  hp: number;
  fuse: number;
  gone: boolean;
}

export interface Alarm {
  prop: Prop;
  hp: number;
  /** Pulled (it's already rung), or shot to bits. */
  used: boolean;
  broken: boolean;
  /** A deckhand at it, pulling: how far (0..1). */
  pull: number;
}

export type BoardEvent =
  | { type: 'breach' }
  | { type: 'shot'; hero: number; x: number; z: number; a: number }
  | { type: 'blast'; hero: number; x: number; z: number; a: number }
  | { type: 'dry'; hero: number }
  | { type: 'shell'; hero: number }
  | { type: 'foeShot'; id: number; x: number; z: number; a: number; kind: Round['kind'] }
  | { type: 'hit'; id: number; x: number; z: number; a: number; plate: boolean; heavy: boolean; dmg: number }
  | { type: 'block'; id: number; x: number; z: number; a: number }
  | { type: 'plateBreak'; id: number; x: number; z: number }
  | { type: 'kill'; id: number; x: number; z: number; a: number; takedown: boolean; hero: number }
  | { type: 'takedown'; hero: number; id: number; x: number; z: number }
  | { type: 'bump'; hero: number; id: number; x: number; z: number }
  | { type: 'heroHit'; hero: number; x: number; z: number; a: number; dmg: number }
  | { type: 'heroDown'; hero: number }
  | { type: 'revive'; hero: number }
  | { type: 'perfect'; hero: number; x: number; z: number }
  | { type: 'dash'; hero: number }
  | { type: 'step'; x: number; z: number; hero: boolean; heavy: boolean }
  | { type: 'wall'; x: number; z: number; a: number; heavy: boolean }
  | { type: 'alert'; id: number }
  | { type: 'runner'; id: number }
  | { type: 'alarm'; x: number; z: number; by: number }
  | { type: 'alarmBroken'; x: number; z: number }
  | { type: 'door'; id: number; open: boolean }
  | { type: 'windup'; id: number }
  | { type: 'swing'; id: number }
  | { type: 'aim'; id: number }
  | { type: 'charge'; id: number }
  | { type: 'slam'; id: number; x: number; z: number }
  | { type: 'crate'; i: number; x: number; z: number }
  | { type: 'strongbox'; x: number; z: number; pay: number }
  | { type: 'core'; x: number; z: number }
  | { type: 'tin'; hero: number; value: number; x: number; z: number }
  | { type: 'heal'; hero: number; n: number }
  | { type: 'fuse'; i: number }
  | { type: 'boom'; x: number; z: number; r: number }
  | { type: 'kelters'; x: number; z: number }
  | { type: 'kelterIn'; id: number }
  | { type: 'hookShot'; id: number }
  | { type: 'hooked'; hero: number; by: number }
  | { type: 'snap'; hero: number; x: number; z: number }
  | { type: 'collected'; hero: number }
  | { type: 'turretUp'; i: number }
  | { type: 'turretDown'; i: number }
  | { type: 'room'; room: number }
  | { type: 'tick'; s: number }
  | { type: 'work'; hero: number; kind: keyof typeof WORK; t: number }
  | { type: 'escape' }
  | { type: 'failed'; how: 'downed' | 'caught' };

export interface BoardSpec {
  seed: number;
  /** How hard: the run's difficulty plus the site's danger. */
  hard: number;
  /** The price on your head (from the run): the kelters come sooner. */
  bounty: number;
  heroes: number;
}

export type Outcome = 'escaped' | 'downed' | 'caught';

export interface BoardResult {
  outcome: Outcome;
  /** Each of the three crates: cracked and carried off. */
  crates: boolean[];
  strongbox: boolean;
  core: boolean;
  /** Scrap in tins picked up (kept whatever happens), and the strongbox's (only if you got out). */
  tins: number;
  pay: number;
  alarm: boolean;
  kelters: boolean;
  /** Seconds left on the clock when you got out (the kelters' or, once they're aboard, the lock's). */
  spare: number;
  heroes: { kills: number; takedowns: number; perfects: number; hits: number }[];
}

export class Boarding {
  readonly deck: Deck;
  readonly r: Rng;
  heroes: Hero[] = [];
  foes: Foe[] = [];
  rounds: Round[] = [];
  tins: Tin[] = [];
  crates: Crate[] = [];
  strongbox: Crate | null = null;
  core: Crate | null = null;
  turrets: Turret[] = [];
  canisters: Canister[] = [];
  alarms: Alarm[] = [];
  medkits: { prop: Prop; used: boolean }[] = [];
  events: BoardEvent[] = [];
  /** 'intro' while the cutter burns in, 'play', then 'out' (got away) or 'failed'. */
  state: 'intro' | 'play' | 'out' | 'failed' = 'intro';
  stateT = 0;
  time = 0;
  /** Seconds till the kelters clamp on; once they have, `dock` is how long your ship holds the lock. */
  clock: number;
  clockMax: number;
  dock = -1;
  alarmed = false;
  lockdown = false;
  kelters: { x: number; z: number; t: number; wave: number; next: number } | null = null;
  visited = new Set<number>();
  /** Someone's stepped out of the lock (till then there's no casting off). */
  ventured = false;
  outcome: Outcome | null = null;
  pay = 0;
  private nextId = 0;
  private fields: Int16Array[] = [];
  private fieldT: number[] = [];
  private alarmFields = new Map<number, Int16Array>();
  private lastTick = -1;

  constructor(readonly spec: BoardSpec) {
    this.r = rng(spec.seed ^ 0x5eed);
    this.deck = new Deck({ seed: spec.seed, hard: spec.hard });
    const d = this.deck;
    const k = 1 + Math.max(0, spec.hard) * 0.22;
    for (const post of d.posts) {
      const f = this.spawn(post.kind, post.x, post.z, k);
      f.face = post.rot;
      f.asleep = post.asleep;
      f.state = post.asleep ? 'sleep' : 'idle';
      f.runner = post.runner;
      f.room = post.room;
    }
    let ci = 0;
    for (const p of d.props) {
      if (p.kind === 'crate' && ci++ < 3) this.crates.push({ prop: p, t: 0, open: false });
      else if (p.kind === 'strongbox') this.strongbox = { prop: p, t: 0, open: false };
      else if (p.kind === 'core') this.core = { prop: p, t: 0, open: false };
      else if (p.kind === 'turret') this.turrets.push({ prop: p, up: 0, hp: 5, aimA: 0, state: 'down', t: 0, shots: 0, flash: 0 });
      else if (p.kind === 'canister') this.canisters.push({ prop: p, hp: 2, fuse: -1, gone: false });
      else if (p.kind === 'alarm') this.alarms.push({ prop: p, hp: 3, used: false, broken: false, pull: 0 });
      else if (p.kind === 'medkit') this.medkits.push({ prop: p, used: false });
    }
    // the strongbox pays by how hard the ship was to get into
    this.pay = Math.round(55 + Math.max(0, spec.hard) * 30);
    this.clockMax = this.clock = clamp(CLOCK.base - spec.bounty * CLOCK.perBounty - Math.max(0, spec.hard) * CLOCK.perHard, CLOCK.min, CLOCK.base);
    for (let i = 0; i < spec.heroes; i++) {
      const h: Hero = {
        id: i, x: d.breach.x + 0.6, z: d.breach.z + (i - (spec.heroes - 1) / 2) * 1.1, vx: 0, vz: 0, face: 0, aim: 0, hp: HERO.hp, inv: 0,
        dashT: 0, dashAge: 0, dashCd: 0, dashX: 1, dashZ: 0, perfected: false, fireCd: 0, shells: HERO.shells, shellT: 0, firing: false, sinceShot: 9,
        mark: -1, down: false, stun: 0, hook: null, work: null, bumped: false, room: d.roomAt(d.breach.x, d.breach.z), kills: 0, takedowns: 0,
        perfects: 0, hits: 0, tins: 0, stride: 0,
      };
      this.heroes.push(h);
      this.fields.push(new Int16Array(d.w * d.h).fill(-1));
      this.fieldT.push(0);
    }
    this.visited.add(this.heroes[0].room);
    this.events.push({ type: 'breach' });
  }

  private spawn(kind: FoeKind, x: number, z: number, k = 1): Foe {
    const def = FOES[kind];
    const f: Foe = {
      id: this.nextId++, kind, x, z, vx: 0, vz: 0, kx: 0, kz: 0, r: def.r, face: 0, aimA: 0, hp: def.hp * k, max: def.hp * k, plate: def.plate * k,
      plateMax: def.plate * k, open: 0, state: 'idle', t: 0, cd: 0.5 + this.r() * 0.8, cd2: 0, aware: false, asleep: false, runner: false, target: 0,
      room: this.deck.roomAt(x, z), strafe: this.r() < 0.5 ? -1 : 1, shots: 0, sinceHit: 9, flash: 0, dead: false, deathT: 0, fallA: 0, takenDown: false,
      alarmAt: -1, home: { x, z }, stride: 0,
    };
    this.foes.push(f);
    return f;
  }

  get living() {
    return this.foes.filter((f) => !f.dead);
  }

  /** Seconds on whichever clock is running (the kelters', then the lock's). */
  get timeLeft() {
    return this.dock >= 0 ? this.dock : this.clock;
  }

  // --- the step --------------------------------------------------------------------------------

  step(intents: Intent[], aims: ({ x: number; z: number } | null)[] = []) {
    this.time += DT;
    this.stateT += DT;
    const d = this.deck;
    if (this.state === 'intro') {
      if (this.stateT > 2.4) {
        this.state = 'play';
        this.stateT = 0;
      }
      this.doors();
      return;
    }
    if (this.state === 'out' || this.state === 'failed') {
      // the world keeps going a moment behind the curtain
      this.moveRounds();
      this.updateTins();
      return;
    }
    this.clocks();
    this.heroes.forEach((h, i) => this.updateHero(h, intents[i] ?? NO_INTENT, aims[i] ?? null));
    // the paths the crew walks, a hero's every quarter second (in turns)
    this.heroes.forEach((h, i) => {
      this.fieldT[i] -= DT;
      if (this.fieldT[i] <= 0 && !h.down) {
        d.field(h.x, h.z, this.fields[i], 80);
        this.fieldT[i] = 0.25 + i * 0.05;
      }
    });
    for (const f of this.foes) this.updateFoe(f);
    this.separate();
    this.updateTurrets();
    this.moveRounds();
    this.updateTins();
    this.updateCanisters();
    this.doors();
    this.endings();
  }

  private clocks() {
    if (this.kelters) {
      const k = this.kelters;
      k.t += DT;
      // first the three of them, one after another; then more, every so often, up to six aboard
      if (k.t >= k.next) {
        const aboard = this.foes.filter((f) => f.kind === 'kelter' && !f.dead).length;
        const n = k.wave === 0 ? 3 : 2;
        if (k.wave === 0 || aboard < 6) {
          for (let i = 0; i < n; i++) {
            const a = this.r() * Math.PI * 2;
            const f = this.spawn('kelter', k.x + Math.cos(a) * 0.6, k.z + Math.sin(a) * 0.6, 1 + this.spec.hard * 0.15);
            f.aware = true;
            f.state = 'alert';
            f.t = 0.5 + i * 0.35;
            f.face = a;
            f.target = this.nearestHero(f.x, f.z)?.id ?? 0;
            this.events.push({ type: 'kelterIn', id: f.id });
          }
        }
        k.wave++;
        k.next = k.t + 13;
      }
      this.dock -= DT;
      if (this.dock <= 0) {
        this.dock = 0;
        this.fail('caught');
      }
    } else {
      this.clock -= DT;
      if (this.clock <= 0) {
        this.clock = 0;
        this.kelterPod();
      }
    }
    const s = Math.ceil(this.timeLeft);
    if (s <= 10 && s !== this.lastTick && s > 0) {
      this.lastTick = s;
      this.events.push({ type: 'tick', s });
    }
  }

  /** The kelters' pod clamps on in the corridor, between you and the way out if it can. */
  private kelterPod() {
    const d = this.deck;
    const corr = d.rooms.find((q) => q.kind === 'corridor')!;
    const alive = this.heroes.filter((h) => !h.down);
    const hx = alive.length ? alive.reduce((a, h) => a + h.x, 0) / alive.length : corr.x0;
    let x = clamp((hx + d.breach.x) / 2, corr.x0 + 3, corr.x1 - 3);
    // not right on top of anyone
    if (alive.some((h) => Math.abs(h.x - x) < 5 && h.room === corr.id)) x = clamp(x + (x > (corr.x0 + corr.x1) / 2 ? -7 : 7), corr.x0 + 3, corr.x1 - 3);
    const z = d.mid + 0.5;
    this.kelters = { x, z, t: 0, wave: 0, next: 1.2 };
    this.dock = CLOCK.dock;
    this.lastTick = -1;
    this.events.push({ type: 'kelters', x, z });
    this.alarmAll();
  }

  /** Everyone aboard knows. */
  private alarmAll() {
    for (const f of this.foes) if (!f.dead && !f.aware) this.notice(f, 0.6);
  }

  private endings() {
    if (this.state !== 'play') return;
    const up = this.heroes.filter((h) => !h.down);
    if (!up.length) {
      this.fail(this.kelters ? 'caught' : 'downed');
      return;
    }
    // everyone still standing at the lock, working the hatch together
    const lock = this.deck.rooms.find((q) => q.kind === 'lock')!;
    const inLock = (h: Hero) => h.x > lock.x0 && h.x < lock.x1 + 1 && h.z > lock.z0 && h.z < lock.z1 + 1;
    // (only once someone's been out of it: you came for something)
    if (up.some((h) => !inLock(h))) this.ventured = true;
    if (this.ventured && up.every(inLock)) {
      const lead = up[0];
      if (!lead.work || lead.work.kind !== 'leave') lead.work = { kind: 'leave', id: 0, t: 0 };
      if (!up.some((h) => h.firing || h.dashT > 0)) lead.work.t += DT / WORK.leave;
      this.events.push({ type: 'work', hero: lead.id, kind: 'leave', t: lead.work.t });
      if (lead.work.t >= 1) {
        this.state = 'out';
        this.stateT = 0;
        this.outcome = 'escaped';
        this.events.push({ type: 'escape' });
      }
    } else for (const h of up) if (h.work?.kind === 'leave') h.work = null;
  }

  private fail(how: 'downed' | 'caught') {
    if (this.state !== 'play') return;
    this.state = 'failed';
    this.stateT = 0;
    this.outcome = how;
    this.events.push({ type: 'failed', how });
  }

  // --- you --------------------------------------------------------------------------------------

  private updateHero(h: Hero, it: Intent, padAim: { x: number; z: number } | null) {
    const d = this.deck;
    h.inv = Math.max(0, h.inv - DT);
    h.fireCd -= DT;
    h.dashCd -= DT;
    h.sinceShot += DT;
    h.stun = Math.max(0, h.stun - DT);
    if (h.down) {
      h.vx *= 0.85;
      h.vz *= 0.85;
      this.moveBody(h, h.vx * DT, h.vz * DT, HERO.r);
      // a partner standing over you hauls you up
      for (const o of this.heroes) {
        if (o === h || o.down || o.firing || Math.hypot(o.x - h.x, o.z - h.z) > 1.5) continue;
        if (!o.work || o.work.kind !== 'revive' || o.work.id !== h.id) o.work = { kind: 'revive', id: h.id, t: 0 };
        o.work.t += DT / WORK.revive;
        this.events.push({ type: 'work', hero: o.id, kind: 'revive', t: o.work.t });
        if (o.work.t >= 1) {
          o.work = null;
          h.down = false;
          h.hp = 2;
          h.inv = 1.5;
          this.events.push({ type: 'revive', hero: h.id });
        }
      }
      return;
    }
    let mx = it.x;
    let mz = -it.y;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    const control = h.stun <= 0;
    // the slide
    if (control && it.dash && h.dashCd <= 0 && h.dashT <= 0) {
      const dl = Math.hypot(mx, mz);
      h.dashX = dl > 0.2 ? mx / dl : Math.cos(h.face);
      h.dashZ = dl > 0.2 ? mz / dl : Math.sin(h.face);
      h.dashT = HERO.dashT;
      h.dashAge = 0;
      h.perfected = false;
      h.bumped = false;
      h.work = null;
      this.events.push({ type: 'dash', hero: h.id });
      if (h.hook) {
        this.events.push({ type: 'snap', hero: h.id, x: h.x, z: h.z });
        const by = this.foes.find((f) => f.id === h.hook!.by);
        if (by && by.state === 'reel') {
          by.state = 'recover';
          by.t = 0.8;
        }
        h.hook = null;
      }
    }
    if (h.dashT > 0) {
      h.dashT -= DT;
      h.dashAge += DT;
      h.vx = h.dashX * HERO.dashSpeed;
      h.vz = h.dashZ * HERO.dashSpeed;
      if (h.dashT <= 0) {
        h.dashCd = HERO.dashCd;
        h.vx *= 0.35;
        h.vz *= 0.35;
      }
      this.slideInto(h);
    } else {
      const slow = (h.hook ? 0.35 : 1) * (it.fire ? 0.82 : 1) * (control ? 1 : 0);
      const tx = mx * HERO.speed * slow;
      const tz = mz * HERO.speed * slow;
      const a = HERO.accel * DT * (control ? 1 : 0.2);
      h.vx += clamp(tx - h.vx, -a, a);
      h.vz += clamp(tz - h.vz, -a, a);
    }
    // a hook in you: reeled towards whoever fired it
    if (h.hook) {
      const by = this.foes.find((f) => f.id === h.hook!.by);
      if (!by || by.dead || by.open > 0) {
        if (by) this.events.push({ type: 'snap', hero: h.id, x: h.x, z: h.z });
        h.hook = null;
      } else {
        const dx = by.x - h.x;
        const dz = by.z - h.z;
        const l = Math.hypot(dx, dz) || 1;
        h.vx += (dx / l) * 9 * DT * 6;
        h.vz += (dz / l) * 9 * DT * 6;
        const cap = 5.5;
        const sp = Math.hypot(h.vx, h.vz);
        if (sp > cap && h.dashT <= 0) {
          h.vx *= cap / sp;
          h.vz *= cap / sp;
        }
        if (l < by.r + HERO.r + 0.5) {
          // collected: thrown to the deck
          h.hook = null;
          this.events.push({ type: 'collected', hero: h.id });
          this.hurtHero(h, 2, by.x, by.z, true);
          h.stun = 1.0;
          h.vx = (-dx / l) * 6;
          h.vz = (-dz / l) * 6;
          by.state = 'recover';
          by.t = 1.2;
          by.cd = 2.5;
        }
      }
    }
    const was = { x: h.x, z: h.z };
    this.moveBody(h, h.vx * DT, h.vz * DT, HERO.r);
    const moved = Math.hypot(h.x - was.x, h.z - was.z);
    h.stride += moved;
    if (h.dashT <= 0 && moved > 0.02 && Math.floor(h.stride / 1.45) !== Math.floor((h.stride - moved) / 1.45)) this.events.push({ type: 'step', x: h.x, z: h.z, hero: true, heavy: false });
    // which room it's in now (a room seen for the first time lights up)
    const room = d.roomAt(h.x, h.z);
    if (room >= 0 && room !== h.room) {
      h.room = room;
      if (!this.visited.has(room)) {
        this.visited.add(room);
        this.events.push({ type: 'room', room });
      }
    }
    // aiming: the stick if there is one (with a little help), else the pistol finds a mark near where you face
    const moving = Math.hypot(h.vx, h.vz) > 0.8 && h.dashT <= 0;
    const moveA = Math.atan2(mz, mx);
    let want = Math.hypot(mx, mz) > 0.2 ? moveA : h.face;
    if (padAim && Math.hypot(padAim.x, padAim.z) > 0.3) want = Math.atan2(padAim.z, padAim.x);
    const mark = this.findMark(h, want, padAim ? 0.45 : 1.1);
    h.mark = mark ? mark.id : -1;
    h.firing = control && it.fire && h.dashT <= 0;
    if (mark && (h.firing || padAim)) h.aim = Math.atan2(mark.z - h.z, mark.x - h.x);
    else h.aim = want;
    if (h.firing || (padAim && Math.hypot(padAim.x, padAim.z) > 0.3) || h.sinceShot < 0.35) h.face = turn(h.face, h.aim, 30 * DT);
    else if (moving) h.face = turn(h.face, moveA, 16 * DT);
    else if (h.dashT > 0) h.face = Math.atan2(h.dashZ, h.dashX);
    // the pistol
    if (h.firing && h.fireCd <= 0) {
      h.fireCd = 1 / HERO.rate;
      h.sinceShot = 0;
      const a = h.aim + (this.r() - 0.5) * 0.07;
      const mx2 = h.x + Math.cos(h.aim) * 0.6;
      const mz2 = h.z + Math.sin(h.aim) * 0.6;
      this.fire('hero', 'rivet', h.id, mx2, mz2, a, HERO.rivetSpeed, 0.12, 1, 0.5, 1.6, 0.55);
      this.events.push({ type: 'shot', hero: h.id, x: mx2, z: mz2, a });
      this.noise(h.x, h.z, 8);
    }
    // the breacher
    if (control && it.heavy && h.dashT <= 0) {
      if (h.shells > 0) {
        h.shells--;
        if (h.shellT <= 0) h.shellT = HERO.reload;
        h.sinceShot = 0;
        const a0 = h.aim;
        const mx2 = h.x + Math.cos(a0) * 0.6;
        const mz2 = h.z + Math.sin(a0) * 0.6;
        for (let i = 0; i < HERO.pellets; i++) {
          const a = a0 + ((i / (HERO.pellets - 1)) * 2 - 1) * HERO.spread + (this.r() - 0.5) * 0.08;
          this.fire('hero', 'pellet', h.id, mx2, mz2, a, 30 + this.r() * 8, 0.16, 1.3, 1.6, 3.2, 0.26 + this.r() * 0.04);
        }
        h.vx -= Math.cos(a0) * 6;
        h.vz -= Math.sin(a0) * 6;
        h.face = a0;
        this.events.push({ type: 'blast', hero: h.id, x: mx2, z: mz2, a: a0 });
        this.noise(h.x, h.z, 12);
      } else this.events.push({ type: 'dry', hero: h.id });
    }
    if (h.shells < HERO.shells) {
      h.shellT -= DT;
      if (h.shellT <= 0) {
        h.shells++;
        h.shellT = h.shells < HERO.shells ? HERO.reload : 0;
        this.events.push({ type: 'shell', hero: h.id });
      }
    }
    this.work(h);
    this.pickups(h);
  }

  /** The foe the pistol would go for: in sight, near the way you face, nearest first. */
  private findMark(h: Hero, want: number, cone: number): Foe | null {
    let best: Foe | null = null;
    let score = Infinity;
    for (const f of this.foes) {
      if (f.dead) continue;
      const dx = f.x - h.x;
      const dz = f.z - h.z;
      const dist = Math.hypot(dx, dz);
      if (dist > HERO.reach) continue;
      const off = Math.abs(angleDiff(Math.atan2(dz, dx), want));
      if (off > cone && dist > 2.2) continue;
      if (!this.deck.clear(h.x, h.z, f.x, f.z)) continue;
      // the sleeping and the unaware are still marks, just less urgent ones
      const s = dist + off * 7 + (f.aware ? 0 : 4);
      if (s < score) {
        score = s;
        best = f;
      }
    }
    return best;
  }

  /** A slide that runs into someone: a takedown if they're open (or never saw you), else a shove. */
  private slideInto(h: Hero) {
    if (h.bumped) return;
    for (const f of this.foes) {
      if (f.dead) continue;
      const dist = Math.hypot(f.x - h.x, f.z - h.z);
      if (dist > f.r + HERO.r + 0.25) continue;
      if (f.open > 0 || !f.aware || f.state === 'stun') {
        h.bumped = true;
        h.takedowns++;
        f.takenDown = true;
        this.events.push({ type: 'takedown', hero: h.id, id: f.id, x: f.x, z: f.z });
        this.kill(f, Math.atan2(h.dashZ, h.dashX), h.id);
        if (h.hp < HERO.hp) {
          h.hp++;
          this.events.push({ type: 'heal', hero: h.id, n: 1 });
        }
        // a shell back for the trouble
        if (h.shells < HERO.shells) {
          h.shells++;
          this.events.push({ type: 'shell', hero: h.id });
        }
        h.dashT = Math.min(h.dashT, 0.05);
        return;
      }
      // a shove: it staggers back, you stop
      h.bumped = true;
      this.events.push({ type: 'bump', hero: h.id, id: f.id, x: f.x, z: f.z });
      const a = Math.atan2(f.z - h.z, f.x - h.x);
      this.hitFoe(f, 0.5, 1.2, a, f.kind === 'bruiser' ? 2 : 7, h.id, true, false);
      h.dashT = 0;
      h.dashCd = HERO.dashCd;
      h.vx = -Math.cos(a) * 3;
      h.vz = -Math.sin(a) * 3;
      return;
    }
  }

  /** Working something open: a crate, the strongbox, the core, standing at it and not shooting. */
  private work(h: Hero) {
    const near = (p: Prop, reach: number) => Math.hypot(p.x - h.x, p.z - h.z) < reach;
    let target: { kind: keyof typeof WORK; id: number; c: Crate } | null = null;
    this.crates.forEach((c, i) => {
      if (!c.open && near(c.prop, 1.6)) target = { kind: 'crate', id: i, c };
    });
    if (this.strongbox && !this.strongbox.open && near(this.strongbox.prop, 1.5)) target = { kind: 'strongbox', id: 0, c: this.strongbox };
    if (this.core && !this.core.open && near(this.core.prop, 1.9)) target = { kind: 'core', id: 0, c: this.core };
    const t = target as { kind: keyof typeof WORK; id: number; c: Crate } | null;
    if (!t || h.firing || h.dashT > 0 || h.stun > 0) {
      if (h.work && h.work.kind !== 'leave' && h.work.kind !== 'revive') h.work = null;
      return;
    }
    if (!h.work || h.work.kind !== t.kind || h.work.id !== t.id) h.work = { kind: t.kind, id: t.id, t: t.c.t };
    t.c.t = Math.min(1, t.c.t + DT / WORK[t.kind]);
    h.work.t = t.c.t;
    this.events.push({ type: 'work', hero: h.id, kind: t.kind, t: t.c.t });
    if (t.c.t >= 1) {
      t.c.open = true;
      h.work = null;
      const p = t.c.prop;
      if (t.kind === 'crate') this.events.push({ type: 'crate', i: t.id, x: p.x, z: p.z });
      else if (t.kind === 'strongbox') {
        this.events.push({ type: 'strongbox', x: p.x, z: p.z, pay: this.pay });
        this.noise(p.x, p.z, 10);
      } else {
        // the core out of its cradle: the ship locks itself down
        this.lockdown = true;
        this.events.push({ type: 'core', x: p.x, z: p.z });
        if (!this.kelters) this.clock = Math.max(6, this.clock - CLOCK.lockdown);
        this.alarmAll();
        this.turrets.forEach((tu, i) => {
          tu.state = 'rise';
          tu.t = 0.4 + i * 0.5;
        });
      }
    }
  }

  private pickups(h: Hero) {
    for (const m of this.medkits) {
      if (m.used || h.hp >= HERO.hp || Math.hypot(m.prop.x - h.x, m.prop.z - h.z) > 1.3) continue;
      m.used = true;
      const n = Math.min(2, HERO.hp - h.hp);
      h.hp += n;
      this.events.push({ type: 'heal', hero: h.id, n });
    }
  }

  hurtHero(h: Hero, dmg: number, fx: number, fz: number, force = false) {
    if (h.down || this.state !== 'play') return false;
    // a slide through it, just as it lands: perfect
    if (h.dashT > 0 && h.dashAge < HERO.perfect && !force) {
      if (!h.perfected) {
        h.perfected = true;
        h.perfects++;
        this.events.push({ type: 'perfect', hero: h.id, x: h.x, z: h.z });
        if (h.shells < HERO.shells) {
          h.shells++;
          this.events.push({ type: 'shell', hero: h.id });
        }
        h.inv = Math.max(h.inv, 0.4);
      }
      return false;
    }
    if (!force && (h.inv > 0 || h.dashT > 0)) return false;
    h.hp -= dmg;
    h.hits++;
    h.inv = HERO.inv;
    if (h.work) h.work.t *= 0.5;
    const a = Math.atan2(h.z - fz, h.x - fx);
    h.vx += Math.cos(a) * 7;
    h.vz += Math.sin(a) * 7;
    this.events.push({ type: 'heroHit', hero: h.id, x: h.x, z: h.z, a, dmg });
    if (h.hp <= 0) {
      h.hp = 0;
      h.down = true;
      h.hook = null;
      h.work = null;
      this.events.push({ type: 'heroDown', hero: h.id });
    }
    return true;
  }

  // --- the crew --------------------------------------------------------------------------------

  private nearestHero(x: number, z: number): Hero | null {
    let best: Hero | null = null;
    let bd = Infinity;
    for (const h of this.heroes) {
      if (h.down) continue;
      const dd = Math.hypot(h.x - x, h.z - z);
      if (dd < bd) {
        bd = dd;
        best = h;
      }
    }
    return best;
  }

  private notice(f: Foe, delay = 0.35) {
    if (f.dead || f.aware) return;
    f.aware = true;
    f.asleep = false;
    f.state = 'alert';
    f.t = delay;
    this.events.push({ type: 'alert', id: f.id });
    // a runner goes for the nearest alarm that still works
    if (f.runner && !this.alarmed && !this.kelters) {
      const a = this.nearestAlarm(f);
      if (a >= 0) {
        f.alarmAt = a;
        this.events.push({ type: 'runner', id: f.id });
      }
    }
  }

  private nearestAlarm(f: Foe) {
    let best = -1;
    let bd = Infinity;
    this.alarms.forEach((a, i) => {
      if (a.used || a.broken) return;
      const dd = Math.hypot(a.prop.x - f.x, a.prop.z - f.z);
      if (dd < bd && dd < 40) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  /** A gunshot is heard: by anyone near enough, or in the same room. */
  private noise(x: number, z: number, radius: number) {
    const room = this.deck.roomAt(x, z);
    for (const f of this.foes) {
      if (f.dead || f.aware) continue;
      const dd = Math.hypot(f.x - x, f.z - z);
      const asleep = f.asleep ? 0.45 : 1;
      if (dd < radius * asleep && (f.room === room || dd < radius * 0.55 * asleep || this.deck.clear(x, z, f.x, f.z))) this.notice(f, 0.45 + this.r() * 0.3);
    }
  }

  private sees(f: Foe, h: Hero) {
    const dx = h.x - f.x;
    const dz = h.z - f.z;
    const dd = Math.hypot(dx, dz);
    const def = FOES[f.kind];
    if (dd > def.sight) return false;
    if (f.asleep) return dd < 1.6;
    // close enough to feel you behind; otherwise a cone
    if (dd > 2.2 && Math.abs(angleDiff(Math.atan2(dz, dx), f.face)) > 1.1) return false;
    return this.deck.clear(f.x, f.z, h.x, h.z);
  }

  private updateFoe(f: Foe) {
    if (f.dead) {
      f.deathT += DT;
      // the body slides to a stop
      f.kx *= 0.9;
      f.kz *= 0.9;
      this.moveBody(f, f.kx * DT, f.kz * DT, f.r * 0.6);
      return;
    }
    f.t -= DT;
    f.cd -= DT;
    f.cd2 -= DT;
    f.flash = Math.max(0, f.flash - DT * 6);
    f.sinceHit += DT;
    if (f.open > 0) {
      f.open -= DT;
      if (f.open <= 0) {
        f.open = 0;
        f.plate = Math.max(f.plate, f.plateMax * 0.5);
        if (f.state === 'stagger' || f.state === 'stun') {
          f.state = 'recover';
          f.t = 0.3;
        }
      }
    } else if (f.plate < f.plateMax && f.sinceHit > 2.5) f.plate = Math.min(f.plateMax, f.plate + f.plateMax * 0.35 * DT);
    f.kx *= Math.exp(-8 * DT);
    f.kz *= Math.exp(-8 * DT);
    f.room = this.deck.roomAt(f.x, f.z) >= 0 ? this.deck.roomAt(f.x, f.z) : f.room;
    // who it's after: the nearest standing hero
    const h = this.heroes.find((x) => x.id === f.target && !x.down) ?? this.nearestHero(f.x, f.z);
    if (h) f.target = h.id;
    if (!f.aware) {
      if (h && this.heroes.some((x) => !x.down && this.sees(f, x))) this.notice(f);
      else {
        // at its post: now and then it turns to look at something else
        if (f.state === 'idle' && this.r() < DT * 0.25) f.face += (this.r() - 0.5) * 2.2;
        this.walk(f, 0, 0, 0);
        return;
      }
    }
    if (!h) {
      this.walk(f, 0, 0, 0);
      return;
    }
    const dx = h.x - f.x;
    const dz = h.z - f.z;
    const dist = Math.hypot(dx, dz);
    const toward = Math.atan2(dz, dx);
    const los = this.deck.clear(f.x, f.z, h.x, h.z);
    const def = FOES[f.kind];
    switch (f.state) {
      case 'alert':
        f.face = turn(f.face, toward, 10 * DT);
        this.walk(f, 0, 0, 0);
        if (f.t <= 0) f.state = f.alarmAt >= 0 ? 'alarm' : f.kind === 'deckhand' || f.kind === 'bruiser' ? 'chase' : 'move';
        return;
      case 'stagger':
      case 'stun':
        this.walk(f, 0, 0, 0);
        return;
      case 'recover':
        this.walk(f, 0, 0, 0);
        f.face = turn(f.face, toward, 3 * DT);
        if (f.t <= 0) f.state = f.kind === 'deckhand' || f.kind === 'bruiser' ? 'chase' : 'move';
        return;
      default:
        break;
    }
    if (f.kind === 'deckhand') this.deckhand(f, h, dist, toward, los, def.speed);
    else if (f.kind === 'gunner') this.gunner(f, h, dist, toward, los, def.speed, false);
    else if (f.kind === 'kelter') this.gunner(f, h, dist, toward, los, def.speed, true);
    else this.bruiser(f, h, dist, toward, los, def.speed);
  }

  /** Walks a foe: towards (dx, dz) at `speed` (smoothed), with its shove on top; turns it to face where it walks unless told. */
  private walk(f: Foe, dx: number, dz: number, speed: number, face = true) {
    const l = Math.hypot(dx, dz);
    const tx = l > 0 ? (dx / l) * speed : 0;
    const tz = l > 0 ? (dz / l) * speed : 0;
    const k = 1 - Math.exp(-10 * DT);
    f.vx += (tx - f.vx) * k;
    f.vz += (tz - f.vz) * k;
    if (face && l > 0 && speed > 0.5) f.face = turn(f.face, Math.atan2(dz, dx), 9 * DT);
    const was = { x: f.x, z: f.z };
    this.moveBody(f, (f.vx + f.kx) * DT, (f.vz + f.kz) * DT, f.r);
    const moved = Math.hypot(f.x - was.x, f.z - was.z);
    f.stride += moved;
    if (moved > 0.03 && Math.floor(f.stride / 1.5) !== Math.floor((f.stride - moved) / 1.5)) this.events.push({ type: 'step', x: f.x, z: f.z, hero: false, heavy: f.kind === 'bruiser' });
    return moved;
  }

  /** Which way to go to get at a hero: straight there if it can see them, else down the path. */
  private way(f: Foe, h: Hero, los: boolean): { x: number; z: number } {
    if (los) return { x: h.x - f.x, z: h.z - f.z };
    const step = this.deck.downhill(this.fields[h.id], f.x, f.z);
    return step ?? { x: 0, z: 0 };
  }

  private deckhand(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    switch (f.state) {
      case 'alarm': {
        const a = this.alarms[f.alarmAt];
        if (!a || a.used || a.broken || this.alarmed || this.kelters) {
          f.alarmAt = -1;
          f.state = 'chase';
          return;
        }
        let field = this.alarmFields.get(f.alarmAt);
        if (!field) {
          field = new Int16Array(this.deck.w * this.deck.h);
          this.deck.field(a.prop.x, a.prop.z, field, 200);
          this.alarmFields.set(f.alarmAt, field);
        }
        const ad = Math.hypot(a.prop.x - f.x, a.prop.z - f.z);
        if (ad < 1.1) {
          f.state = 'pull';
          f.t = 1.6;
          return;
        }
        const s = ad < 3 && this.deck.clear(f.x, f.z, a.prop.x, a.prop.z) ? { x: a.prop.x - f.x, z: a.prop.z - f.z } : this.deck.downhill(field, f.x, f.z) ?? { x: 0, z: 0 };
        this.walk(f, s.x, s.z, speed * 1.15);
        return;
      }
      case 'pull': {
        const a = this.alarms[f.alarmAt];
        this.walk(f, 0, 0, 0, false);
        if (!a || a.broken || this.alarmed || this.kelters) {
          f.state = 'chase';
          if (a) a.pull = 0;
          return;
        }
        f.face = turn(f.face, Math.atan2(a.prop.z - f.z, a.prop.x - f.x), 10 * DT);
        a.pull = 1 - f.t / 1.6;
        if (f.t <= 0) {
          a.used = true;
          a.pull = 1;
          this.alarmed = true;
          if (!this.kelters) this.clock = Math.max(6, this.clock - CLOCK.alarm);
          this.events.push({ type: 'alarm', x: a.prop.x, z: a.prop.z, by: f.id });
          this.alarmAll();
          f.alarmAt = -1;
          f.state = 'chase';
        }
        return;
      }
      case 'windup':
        this.walk(f, 0, 0, 0, false);
        // tracks you for most of it, then commits
        if (f.t > 0.18) f.face = turn(f.face, toward, 7 * DT);
        if (f.t <= 0) {
          f.state = 'swing';
          f.t = 0.16;
          this.events.push({ type: 'swing', id: f.id });
          f.vx = Math.cos(f.face) * 7;
          f.vz = Math.sin(f.face) * 7;
          for (const x of this.heroes) {
            const dd = Math.hypot(x.x - f.x, x.z - f.z);
            if (dd < 1.95 && Math.abs(angleDiff(Math.atan2(x.z - f.z, x.x - f.x), f.face)) < 1.1) this.hurtHero(x, 1, f.x, f.z);
          }
        }
        return;
      case 'swing':
        this.walk(f, Math.cos(f.face), Math.sin(f.face), 2, false);
        if (f.t <= 0) {
          f.state = 'recover';
          f.t = 0.65;
        }
        return;
      default: {
        // chase
        f.state = 'chase';
        if (dist < 1.55 && los && f.cd <= 0) {
          f.state = 'windup';
          f.t = 0.5;
          f.cd = 1.0;
          this.events.push({ type: 'windup', id: f.id });
          return;
        }
        const w = this.way(f, h, los);
        this.walk(f, w.x, w.z, dist < 1.3 ? 0 : speed);
      }
    }
  }

  private gunner(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number, kelter: boolean) {
    const near = kelter ? 3 : 4.5;
    const far = kelter ? 8 : 10;
    switch (f.state) {
      case 'aim': {
        this.walk(f, 0, 0, 0, false);
        // the laser lags you, then locks for the last moment
        if (f.t > 0.2) f.aimA = turn(f.aimA, toward, (kelter ? 3.4 : 2.8) * DT);
        f.face = f.aimA;
        if (f.t <= 0) {
          if (kelter && f.shots === -1) {
            // the hook
            this.fire('foe', 'hook', f.id, f.x + Math.cos(f.aimA) * 0.7, f.z + Math.sin(f.aimA) * 0.7, f.aimA, 17, 0.32, 0, 0, 0, 1.0);
            this.events.push({ type: 'hookShot', id: f.id });
            f.state = 'recover';
            f.t = 0.7;
            f.cd = 3.2 + this.r() * 1.5;
            f.cd2 = 1.4;
            return;
          }
          f.state = 'burst';
          f.shots = kelter ? 2 : 3;
          f.t = 0;
        }
        return;
      }
      case 'burst':
        this.walk(f, 0, 0, 0, false);
        if (f.t <= 0 && f.shots > 0) {
          f.shots--;
          f.t = 0.11;
          const a = f.aimA + (this.r() - 0.5) * 0.12;
          this.fire('foe', 'crew', f.id, f.x + Math.cos(a) * 0.7, f.z + Math.sin(a) * 0.7, a, kelter ? 17 : 15, 0.22, 1, 0, 0, 1.6);
          this.events.push({ type: 'foeShot', id: f.id, x: f.x, z: f.z, a, kind: 'crew' });
        }
        if (f.shots <= 0 && f.t <= 0) {
          f.state = 'recover';
          f.t = 0.75;
          f.cd = (kelter ? 1.3 : 1.6) + this.r() * 0.8;
        }
        return;
      case 'reel': {
        // holding the line while you come in
        this.walk(f, 0, 0, 0, false);
        f.face = turn(f.face, toward, 8 * DT);
        if (!h.hook || h.hook.by !== f.id) {
          f.state = 'recover';
          f.t = 0.5;
        }
        return;
      }
      default: {
        f.state = 'move';
        if (los && dist < 14 && f.cd <= 0) {
          f.state = 'aim';
          f.t = kelter ? 0.6 : 0.78;
          f.aimA = f.face;
          // a kelter fires its hook when nobody's on one, now and then
          f.shots = kelter && f.cd2 <= 0 && !this.heroes.some((x) => x.hook) && this.r() < 0.6 ? -1 : 0;
          this.events.push({ type: 'aim', id: f.id });
          return;
        }
        if (!los || dist > far + 2) {
          const w = this.way(f, h, false);
          this.walk(f, w.x, w.z, speed);
          return;
        }
        // in range: keep its distance, slipping sideways
        if (this.r() < DT * 0.6) f.strafe = -f.strafe;
        let sx = -Math.sin(toward) * f.strafe;
        let sz = Math.cos(toward) * f.strafe;
        if (dist < near) {
          sx -= Math.cos(toward) * 1.5;
          sz -= Math.sin(toward) * 1.5;
        } else if (dist > far) {
          sx += Math.cos(toward);
          sz += Math.sin(toward);
        }
        this.walk(f, sx, sz, speed * 0.6, false);
        f.face = turn(f.face, toward, 8 * DT);
      }
    }
  }

  private bruiser(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    switch (f.state) {
      case 'windup':
        this.walk(f, 0, 0, 0, false);
        if (f.t > 0.25) f.face = turn(f.face, toward, 2.2 * DT);
        if (f.t <= 0) {
          f.state = 'charge';
          f.t = 1.1;
        }
        return;
      case 'charge': {
        const want = 14;
        f.vx = Math.cos(f.face) * want;
        f.vz = Math.sin(f.face) * want;
        const was = { x: f.x, z: f.z };
        this.moveBody(f, f.vx * DT, f.vz * DT, f.r);
        const moved = Math.hypot(f.x - was.x, f.z - was.z);
        f.stride += moved;
        if (Math.floor(f.stride / 1.3) !== Math.floor((f.stride - moved) / 1.3)) this.events.push({ type: 'step', x: f.x, z: f.z, hero: false, heavy: true });
        // into a hero: flattened
        for (const x of this.heroes) {
          if (x.down || Math.hypot(x.x - f.x, x.z - f.z) > f.r + HERO.r + 0.2) continue;
          if (this.hurtHero(x, 2, f.x, f.z)) {
            x.vx += Math.cos(f.face) * 10;
            x.vz += Math.sin(f.face) * 10;
            x.stun = 0.35;
          }
        }
        // into a wall: stunned, wide open
        if (moved < want * DT * 0.4 && f.t < 1.0) {
          f.state = 'stun';
          f.open = 2.4;
          f.plate = 0;
          f.t = 2.4;
          this.events.push({ type: 'slam', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r });
          return;
        }
        if (f.t <= 0) {
          f.state = 'recover';
          f.t = 0.9;
          f.vx *= 0.2;
          f.vz *= 0.2;
        }
        return;
      }
      case 'swing':
        this.walk(f, 0, 0, 0, false);
        if (f.t <= 0) {
          this.events.push({ type: 'swing', id: f.id });
          for (const x of this.heroes) {
            const dd = Math.hypot(x.x - f.x, x.z - f.z);
            if (dd < 2.1 && Math.abs(angleDiff(Math.atan2(x.z - f.z, x.x - f.x), f.face)) < 1.2 && this.hurtHero(x, 1, f.x, f.z)) {
              x.vx += Math.cos(f.face) * 9;
              x.vz += Math.sin(f.face) * 9;
            }
          }
          f.state = 'recover';
          f.t = 0.8;
        }
        return;
      default: {
        f.state = 'chase';
        // turns slowly: get round behind it
        f.face = turn(f.face, toward, 1.9 * DT);
        const facing = Math.abs(angleDiff(toward, f.face)) < 0.35;
        if (los && dist > 2.6 && dist < 9 && f.cd <= 0 && facing) {
          f.state = 'windup';
          f.t = 0.8;
          f.cd = 3.2;
          this.events.push({ type: 'charge', id: f.id });
          return;
        }
        if (dist < 1.9 && f.cd2 <= 0) {
          f.state = 'swing';
          f.t = 0.45;
          f.cd2 = 1.6;
          this.events.push({ type: 'windup', id: f.id });
          return;
        }
        const w = this.way(f, h, los);
        // walks the way it faces when it can see you (so it turns like a tank)
        if (los) this.walk(f, Math.cos(f.face), Math.sin(f.face), dist < 1.6 ? 0 : speed, false);
        else this.walk(f, w.x, w.z, speed);
      }
    }
  }

  /** A foe takes a hit. `a`: the way the round was going. */
  hitFoe(f: Foe, dmg: number, plate: number, a: number, knock: number, hero: number, heavy: boolean, round = true) {
    if (f.dead) return;
    // the bruiser's shield: anything from in front glances off
    if (f.kind === 'bruiser' && f.state !== 'stun' && f.open <= 0 && Math.abs(angleDiff(a + Math.PI, f.face)) < 1.15) {
      f.kx += Math.cos(a) * knock * 0.25;
      f.kz += Math.sin(a) * knock * 0.25;
      this.events.push({ type: 'block', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r, a });
      if (!f.aware) this.notice(f, 0.2);
      return;
    }
    let plated = false;
    if (!f.aware) {
      // caught napping: hurts double, and now it knows
      dmg *= 2;
      plate *= 2;
      this.notice(f, 0.5);
    }
    if (f.open > 0) f.hp -= dmg * 1.6;
    else if (f.plate > 0) {
      plated = true;
      f.plate -= plate;
      f.hp -= dmg * 0.2;
      if (f.plate <= 0) {
        f.plate = 0;
        f.open = 2.6;
        f.state = 'stagger';
        f.t = 2.6;
        this.events.push({ type: 'plateBreak', id: f.id, x: f.x, z: f.z });
      }
    } else f.hp -= dmg;
    f.sinceHit = 0;
    f.flash = 1;
    const kk = f.kind === 'bruiser' ? 0.35 : 1;
    f.kx += Math.cos(a) * knock * kk;
    f.kz += Math.sin(a) * knock * kk;
    if (round) this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, a, plate: plated, heavy, dmg });
    if (f.hp <= 0) this.kill(f, a, hero);
    else if (f.kind === 'gunner' && f.state === 'aim' && heavy) {
      // a breacher blast knocks the aim off
      f.state = 'recover';
      f.t = 0.4;
    }
  }

  private kill(f: Foe, a: number, hero: number) {
    if (f.dead) return;
    f.dead = true;
    f.state = 'dead';
    f.deathT = 0;
    f.fallA = a;
    f.kx = Math.cos(a) * (f.takenDown ? 11 : 6);
    f.kz = Math.sin(a) * (f.takenDown ? 11 : 6);
    const h = this.heroes[hero];
    if (h) h.kills++;
    this.events.push({ type: 'kill', id: f.id, x: f.x, z: f.z, a, takedown: f.takenDown, hero });
    // a kelter's line goes slack
    for (const x of this.heroes) if (x.hook?.by === f.id) x.hook = null;
    // what was in its pockets
    // (a takedown shakes out more)
    const n = (f.kind === 'bruiser' ? 5 : f.kind === 'kelter' ? 3 : f.kind === 'gunner' ? 3 : 2) + (f.takenDown ? 2 : 0);
    for (let i = 0; i < n; i++) this.dropTin(f.x, f.z, f.kind === 'bruiser' ? 3 : 2);
  }

  private dropTin(x: number, z: number, value: number) {
    const a = this.r() * Math.PI * 2;
    const v = 2 + this.r() * 3;
    this.tins.push({ x, z, y: 0.6, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + this.r() * 3, value, t: 0, taken: false });
  }

  /** Keeps bodies from standing in each other, and you out of them. */
  private separate() {
    const fs = this.foes.filter((f) => !f.dead);
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dd = Math.hypot(dx, dz);
        const min = a.r + b.r;
        if (dd >= min || dd < 1e-4) continue;
        const push = (min - dd) / 2;
        const nx = dx / dd;
        const nz = dz / dd;
        this.moveBody(a, -nx * push, -nz * push, a.r);
        this.moveBody(b, nx * push, nz * push, b.r);
      }
      for (const h of this.heroes) {
        if (h.down || h.dashT > 0) continue;
        const dx = h.x - a.x;
        const dz = h.z - a.z;
        const dd = Math.hypot(dx, dz);
        const min = a.r + HERO.r;
        if (dd >= min || dd < 1e-4) continue;
        this.moveBody(h, (dx / dd) * (min - dd), (dz / dd) * (min - dd), HERO.r);
      }
    }
  }

  /** Moves a round body through the deck, sliding along walls. */
  private moveBody(b: { x: number; z: number }, dx: number, dz: number, r: number) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.3));
    for (let s = 0; s < steps; s++) {
      b.x += dx / steps;
      this.push(b, r);
      b.z += dz / steps;
      this.push(b, r);
    }
  }

  /** Pushes a circle out of any blocking cell it overlaps. */
  private push(b: { x: number; z: number }, r: number) {
    const d = this.deck;
    const x0 = Math.floor(b.x - r);
    const x1 = Math.floor(b.x + r);
    const z0 = Math.floor(b.z - r);
    const z1 = Math.floor(b.z + r);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        if (!d.blocked(cx, cz)) continue;
        const nx = clamp(b.x, cx, cx + 1);
        const nz = clamp(b.z, cz, cz + 1);
        const ex = b.x - nx;
        const ez = b.z - nz;
        const dd = Math.hypot(ex, ez);
        if (dd >= r) continue;
        if (dd > 1e-5) {
          b.x = nx + (ex / dd) * r;
          b.z = nz + (ez / dd) * r;
        } else {
          // the centre's inside the cell: out the nearest side
          const l = b.x - cx;
          const rr = cx + 1 - b.x;
          const t = b.z - cz;
          const bt = cz + 1 - b.z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) b.x = cx - r;
          else if (m === rr) b.x = cx + 1 + r;
          else if (m === t) b.z = cz - r;
          else b.z = cz + 1 + r;
        }
      }
  }

  // --- guns, rounds, the rest -----------------------------------------------------------------

  private fire(from: Round['from'], kind: Round['kind'], owner: number, x: number, z: number, a: number, speed: number, r: number, dmg: number, plate: number, knock: number, life: number) {
    this.rounds.push({ x, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, r, life, from, kind, owner, dmg, plate, knock, dead: false });
  }

  private moveRounds() {
    const d = this.deck;
    for (const b of this.rounds) {
      if (b.dead) continue;
      b.life -= DT;
      if (b.life <= 0) {
        b.dead = true;
        continue;
      }
      const sub = 3;
      for (let s = 0; s < sub && !b.dead; s++) {
        b.x += (b.vx * DT) / sub;
        b.z += (b.vz * DT) / sub;
        const a = Math.atan2(b.vz, b.vx);
        const cx = Math.floor(b.x);
        const cz = Math.floor(b.z);
        // things you can shoot that aren't people: a canister, an alarm panel, a turret
        if (b.from === 'hero') {
          for (const c of this.canisters) {
            if (c.gone || Math.hypot(c.prop.x - b.x, c.prop.z - b.z) > 0.6) continue;
            b.dead = true;
            c.hp -= b.dmg;
            if (c.hp <= 0 && c.fuse < 0) {
              c.fuse = 0.55;
              this.events.push({ type: 'fuse', i: this.canisters.indexOf(c) });
            }
            this.events.push({ type: 'wall', x: b.x, z: b.z, a, heavy: b.kind === 'pellet' });
          }
          for (const al of this.alarms) {
            if (al.broken || Math.hypot(al.prop.x - b.x, al.prop.z - b.z) > 0.55) continue;
            b.dead = true;
            al.hp -= b.dmg;
            this.events.push({ type: 'wall', x: b.x, z: b.z, a, heavy: false });
            if (al.hp <= 0 && !al.used) {
              al.broken = true;
              al.pull = 0;
              this.events.push({ type: 'alarmBroken', x: al.prop.x, z: al.prop.z });
            }
          }
          for (const t of this.turrets) {
            if (t.state === 'down' || t.state === 'dead' || t.up < 0.5 || Math.hypot(t.prop.x - b.x, t.prop.z - b.z) > 0.6) continue;
            b.dead = true;
            t.hp -= b.dmg + b.plate * 0.5;
            t.flash = 1;
            this.events.push({ type: 'wall', x: b.x, z: b.z, a, heavy: false });
            if (t.hp <= 0) {
              t.state = 'dead';
              this.events.push({ type: 'boom', x: t.prop.x, z: t.prop.z, r: 1.2 });
              this.events.push({ type: 'turretDown', i: this.turrets.indexOf(t) });
            }
          }
          if (b.dead) break;
        }
        if (d.stops(cx, cz)) {
          b.dead = true;
          this.events.push({ type: 'wall', x: b.x - (b.vx * DT) / sub, z: b.z - (b.vz * DT) / sub, a, heavy: b.kind === 'pellet' });
          break;
        }
        if (b.from === 'hero') {
          for (const f of this.foes) {
            if (f.dead || Math.hypot(f.x - b.x, f.z - b.z) > f.r + b.r) continue;
            b.dead = true;
            this.hitFoe(f, b.dmg, b.plate, a, b.knock, b.owner, b.kind === 'pellet');
            break;
          }
        } else {
          for (const h of this.heroes) {
            if (h.down || Math.hypot(h.x - b.x, h.z - b.z) > HERO.r + b.r) continue;
            if (b.kind === 'hook') {
              // a hook: unless you slid through it, you're on the line
              if (h.dashT > 0) {
                this.hurtHero(h, 0, b.x, b.z);
                continue;
              }
              if (h.inv > 0 || h.hook) continue;
              b.dead = true;
              h.hook = { by: b.owner };
              h.work = null;
              const by = this.foes.find((f) => f.id === b.owner);
              if (by && !by.dead) {
                by.state = 'reel';
                by.t = 9;
              }
              this.events.push({ type: 'hooked', hero: h.id, by: b.owner });
              break;
            }
            if (h.dashT > 0 && h.dashAge < HERO.perfect) {
              // slid through it
              this.hurtHero(h, b.dmg, b.x, b.z);
              continue;
            }
            if (this.hurtHero(h, b.dmg, b.x - b.vx, b.z - b.vz)) {
              b.dead = true;
              break;
            }
          }
        }
      }
    }
    this.rounds = this.rounds.filter((b) => !b.dead);
  }

  private updateTurrets() {
    this.turrets.forEach((t, i) => {
      t.flash = Math.max(0, t.flash - DT * 6);
      t.t -= DT;
      switch (t.state) {
        case 'down':
        case 'dead':
          return;
        case 'rise':
          if (t.t > 0) return;
          if (t.up === 0) this.events.push({ type: 'turretUp', i });
          t.up = Math.min(1, t.up + DT * 1.2);
          if (t.up >= 1) {
            t.state = 'watch';
            t.t = 0.5;
          }
          return;
        default:
          break;
      }
      const h = this.nearestHero(t.prop.x, t.prop.z);
      if (!h) return;
      const toward = Math.atan2(h.z - t.prop.z, h.x - t.prop.x);
      const dist = Math.hypot(h.x - t.prop.x, h.z - t.prop.z);
      const los = dist < 13 && this.deck.clear(t.prop.x, t.prop.z, h.x, h.z);
      if (t.state === 'watch') {
        t.aimA = turn(t.aimA, toward, 2 * DT);
        if (los && t.t <= 0) {
          t.state = 'aim';
          t.t = 0.7;
          this.events.push({ type: 'aim', id: -1 - i });
        }
      } else if (t.state === 'aim') {
        if (t.t > 0.2) t.aimA = turn(t.aimA, toward, 2.6 * DT);
        if (t.t <= 0) {
          t.state = 'burst';
          t.shots = 4;
          t.t = 0;
        }
      } else if (t.state === 'burst' && t.t <= 0) {
        if (t.shots-- > 0) {
          t.t = 0.09;
          const a = t.aimA + (this.r() - 0.5) * 0.1;
          this.fire('foe', 'turret', -1 - i, t.prop.x + Math.cos(a) * 0.6, t.prop.z + Math.sin(a) * 0.6, a, 16, 0.2, 1, 0, 0, 1.4);
          this.events.push({ type: 'foeShot', id: -1 - i, x: t.prop.x, z: t.prop.z, a, kind: 'turret' });
        } else {
          t.state = 'watch';
          t.t = 1.5;
        }
      }
    });
  }

  private updateTins() {
    for (const t of this.tins) {
      if (t.taken) continue;
      t.t += DT;
      t.vy -= 22 * DT;
      t.y += t.vy * DT;
      if (t.y < 0.15) {
        t.y = 0.15;
        t.vy = Math.abs(t.vy) * 0.35;
        t.vx *= 0.6;
        t.vz *= 0.6;
      }
      // drawn to whoever's near, after a moment
      let best: Hero | null = null;
      let bd = 3.2;
      for (const h of this.heroes) {
        if (h.down) continue;
        const dd = Math.hypot(h.x - t.x, h.z - t.z);
        if (dd < bd) {
          bd = dd;
          best = h;
        }
      }
      if (best && t.t > 0.35) {
        const k = 1 - Math.exp(-6 * DT);
        t.vx += ((best.x - t.x) * 14 - t.vx) * k;
        t.vz += ((best.z - t.z) * 14 - t.vz) * k;
        if (bd < 0.55) {
          t.taken = true;
          best.tins += t.value;
          this.events.push({ type: 'tin', hero: best.id, value: t.value, x: t.x, z: t.z });
          continue;
        }
      } else {
        t.vx *= Math.exp(-3 * DT);
        t.vz *= Math.exp(-3 * DT);
      }
      this.moveBody(t, t.vx * DT, t.vz * DT, 0.15);
    }
    this.tins = this.tins.filter((t) => !t.taken);
  }

  private updateCanisters() {
    this.canisters.forEach((c, i) => {
      if (c.gone || c.fuse < 0) return;
      c.fuse -= DT;
      if (c.fuse > 0) return;
      c.gone = true;
      this.deck.remove(c.prop);
      this.blast(c.prop.x, c.prop.z, 3.2);
      void i;
    });
  }

  /** A blast: everyone near takes it (plating cracked), more canisters go up, the heroes too. */
  blast(x: number, z: number, r: number) {
    this.events.push({ type: 'boom', x, z, r });
    this.noise(x, z, 14);
    for (const f of this.foes) {
      if (f.dead) continue;
      const dd = Math.hypot(f.x - x, f.z - z);
      if (dd > r + f.r) continue;
      const a = Math.atan2(f.z - z, f.x - x);
      this.hitFoe(f, 3, 99, a, 12, 0, true, false);
    }
    for (const h of this.heroes) {
      const dd = Math.hypot(h.x - x, h.z - z);
      if (dd > r * 0.85) continue;
      if (this.hurtHero(h, 2, x, z)) {
        h.stun = 0.25;
      }
    }
    for (const c of this.canisters) {
      if (c.gone || c.fuse >= 0) continue;
      if (Math.hypot(c.prop.x - x, c.prop.z - z) < r + 0.5) {
        c.fuse = 0.18 + this.r() * 0.2;
        this.events.push({ type: 'fuse', i: this.canisters.indexOf(c) });
      }
    }
  }

  /** Doors slide open for anyone near, and shut behind them. */
  private doors() {
    const d = this.deck;
    let changed = false;
    for (const door of d.doors) {
      let want = false;
      const near = (x: number, z: number) => Math.abs(x - door.x) < (door.axis === 'x' ? 1.6 : 2.3) && Math.abs(z - door.z) < (door.axis === 'x' ? 2.3 : 1.6);
      for (const h of this.heroes) if (!h.down && near(h.x, h.z)) want = true;
      for (const f of this.foes) if (!f.dead && f.aware && near(f.x, f.z)) want = true;
      // the lock door stands open while you're about
      if (door.id === 0 && this.state !== 'out') want = true;
      const was = door.open >= 0.65;
      door.open = clamp(door.open + (want ? DT * 5 : -DT * 2.5), 0, 1);
      const now = door.open >= 0.65;
      if (was !== now) {
        changed = true;
        this.events.push({ type: 'door', id: door.id, open: now });
      }
      // nobody gets shut in a door: while someone's in its cells it stays open
      if (!now && door.open > 0) {
        for (const [cx, cz] of door.cells) {
          const inCell = (x: number, z: number) => Math.floor(x) === cx && Math.floor(z) === cz;
          if (this.heroes.some((h) => inCell(h.x, h.z)) || this.foes.some((f) => !f.dead && inCell(f.x, f.z))) door.open = 0.7;
        }
      }
    }
    if (changed) d.doorsChanged();
  }

  // --- the end -----------------------------------------------------------------------------------

  result(): BoardResult {
    const out = this.outcome ?? 'downed';
    const got = out === 'escaped';
    return {
      outcome: out,
      crates: this.crates.map((c) => got && c.open),
      strongbox: got && !!this.strongbox?.open,
      core: got && !!this.core?.open,
      tins: this.heroes.reduce((a, h) => a + h.tins, 0),
      pay: got && this.strongbox?.open ? this.pay : 0,
      alarm: this.alarmed,
      kelters: !!this.kelters,
      spare: got ? this.timeLeft : 0,
      heroes: this.heroes.map((h) => ({ kills: h.kills, takedowns: h.takedowns, perfects: h.perfects, hits: h.hits })),
    };
  }

  /** The room by id (for the view). */
  room(id: number): Room | undefined {
    return this.deck.rooms[id];
  }
}

const NO_INTENT: Intent = { x: 0, y: 0, fire: false, heavy: false, boost: 0, dash: false, special: false, aux: false, focus: false };

/** The shortest signed turn from a to b. */
export function angleDiff(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turns `a` towards `b` by at most `step`. */
export function turn(a: number, b: number, step: number) {
  const d = angleDiff(b, a);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}
