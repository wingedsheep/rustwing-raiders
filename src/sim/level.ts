/**
 * One level: the land scrolling by, one or two ships, everything shooting at them, and what they
 * pick up. `step(intents)` advances it one 60th of a second. It knows nothing of three.js; what
 * the view needs to make a fuss about (a hit, an explosion, a graze) goes into `events`, which the
 * view empties each frame.
 */

import type { Archetype, Biome, EnemySkin, Planet } from '../world/planets';
import { DT, FLIGHT_Y, HALF_H, HALF_W, NEUTRAL, toFlight, type Intent } from './types';
import { Terrain, laneX } from './terrain';
import { stats, type Build, type Gun, type Stats } from './build';
import { rng, type Rng, clamp, damp, lerp, smooth } from '../util';
import { Director } from './director';
import { updateEnemy, enemyRadius, type EnemyData } from './enemies';
import type { BossState, BossStyle } from './boss';
import { foeDefaults, foeHurt, winded, foeShot, foeTaken, killHow, onKill, tickCombat, type FoeEvent, type FoeFields } from './combat';
import { FOES, isFoe, type Foe } from './factions';
import { updateStrikes, type Strike } from './strikes';
import type { AuxKind } from '../game/parts';

export type Mode = 'raid' | 'run' | 'hunt' | 'boss';

// Racing, boosting, and what doing it well pays: the numbers the feel hangs on.
/**
 * Races: a push zone, not a lock. The screen creeps on at the level's speed, and you fly freely
 * all over it; up in the top PUSH_BAND of it, you drive it on: the deeper the faster (PUSH_DEPTH
 * more at the very top), and faster still for climbing into it (PUSH_TAKE of the climb, so
 * holding up on boost is the fastest there is), eased so it never snaps. Sitting low reads what's
 * coming, at the cost of time.
 */
const PUSH_BAND = 0.34;
const PUSH_TAKE = 0.5;
const PUSH_DEPTH = 12;
const CAM_EASE = 0.3;
/** Par pace on a race: about this times the creep (holding up into the push, some boost). */
const PAR_PACE = 1.6;
/** Co-op: a ship left at the bottom edge is pushed along, and the clock charged this much per second of it. */
const TOW_PENALTY = 0.5;
/** A crash on a race knocks the screen's speed down to this share. */
const CRASH_SLOW = 0.6;
/** Inside a shortcut, the slipstream: the ship this much faster, free, and it refuels (Burn a second): the hard line pays twice. */
const SLIPSTREAM = 1.4;
const BURN_SLIPSTREAM = 0.25;
/**
 * The redline: boost on past an empty Burn and the engine heats (per second, cooling when you
 * stop); full, it bursts: a hit, and the heat drops back.
 */
const REDLINE_HEAT = 0.45;
const REDLINE_COOL = 0.35;
const REDLINE_AFTER = 0.4;
/** Boost is a surge of your own ship: faster, up the screen unless steered, sliding more. */
const SURGE_SHIP = 0.9;
const SURGE_PUSH = 0.7;
/** Burn per second at full boost, and what flying close to danger earns. */
const BURN_DRAIN = 0.3;
const BURN_START = 0.35;
const BURN_GRAZE = 0.035;
const BURN_SKIM = 0.3;
const BURN_RING = 0.15;
const BURN_CLOSE_KILL = 0.05;
const BURN_PERFECT = 0.3;
const BURN_CRASH = 0.2;
/** Skimming: within this far of the land or an obstacle (without touching) counts. */
const SKIM = 1.6;
/** A kill this close is point-blank: a little Burn. */
const POINT_BLANK = 7;
/**
 * The dash: a fixed burst, untouchable only at the start (the slip). Fire that would have hit
 * where you dashed from, during the slip, is a perfect. After it, a moment before the next.
 */
const DASH_SPEED = 62;
const DASH_TIME = 0.13;
const SLIP = 0.12;
const DASH_RECOVER = 0.25;
/** A perfect soaks up the bullets this close. */
const PERFECT_R = 2.4;
/** Focus pulls spreads in to this much. */
const FOCUS_SPREAD = 0.4;
/** Races are against the clock (par: PAR_PACE); under it pays, by how far. */
const PAR_SCRAP = 120;
/** Fights: a wave wiped out pays per head; a level with nothing let through pays big. */
const WAVE_BONUS = 0.6;
const FULL_CLEAR = 40;

export interface LevelSpec {
  planet: Planet;
  biomes: Biome[];
  mode: Mode;
  seed: number;
  /** 0 at the start of a run, rising to ~1.5 by the last sector. */
  difficulty: number;
  /** Units per biome. */
  length: number;
}

export interface Player {
  id: number;
  build: Build;
  stats: Stats;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  shield: number;
  shieldWait: number;
  /** Invulnerable for this long (after a hit, while dashing, phased). */
  inv: number;
  dashT: number;
  dashCd: number;
  dashes: number;
  dashX: number;
  dashZ: number;
  heat: number[];
  jam: number[];
  cooldown: number[];
  shotCount: number[];
  charge: number;
  phase: number;
  overdrive: number;
  down: boolean;
  revive: number;
  focus: boolean;
  firing: boolean;
  /** Beam reach this frame per gun (0 = not beaming), for the view. */
  beam: number[];
  hits: number;
  crashes: number;
  grazes: number;
  kills: number;
  /** Bulwark: ignore a hit every 10 s. */
  ward: number;
  slow: number;
  /** What hit you, and how often (for the autopilot's report). */
  causes: Record<string, number>;
  /** The Burn meter, 0..1: earned by flying close to danger, spent on boost. */
  burn: number;
  /** How hard it's boosting this frame, 0..1 (0 once the Burn runs out). */
  boosting: number;
  /** How close it's skimming the land or an obstacle this frame: 0 (not) to 1 (a hair away). */
  skim: number;
  skimT: number;
  /** Seconds left of the dash's opening slip: fire that would have hit where you dashed from is a perfect. */
  slip: number;
  /** Where the dash started, on the screen (x, and z from the middle of the screen). */
  slipX: number;
  slipZ: number;
  /** Seconds until the next dash can start. */
  dashLock: number;
  /** This dash has had its perfect already. */
  perfect: boolean;
  perfects: number;
  /** Seconds spent boosting (×how hard) and skimming, for the autopilot's report. */
  boostTime: number;
  skimTime: number;
  /** Races: seconds spent pushed along at the bottom edge. */
  towed: number;
  /** The shortcut it's in (its id), or -1; and how many it got through. */
  shortcut: number;
  shortcuts: number;
  /** Engine heat from boosting on an empty Burn, 0..1 (it bursts at 1). */
  redline: number;
  /** The aux: seconds until it can go again, and how long that wait was (for the HUD). */
  auxCd: number;
  auxMax: number;
  /** Seconds left of the aux running: the parry burst, the siphon's vacuum, the tether's reel. */
  auxT: number;
  /** Seconds left of the parry window (the opening of a Parry Emitter burst). */
  parryT: number;
  /** Bullets parried, blocked and drunk this use. */
  parried: number;
  blocked: number;
  eaten: number;
  /** The enemy the tether is reeling you to (its id), or 0. */
  hook: number;
  /** Seconds of Hair Trigger crits left. */
  crit: number;
  /** Echo Relay: seconds until the special goes off again. */
  echoT: number;
  /** Enemies already rammed this dash (Ram Prow). */
  rammed: number[];
  /** For the autopilot's report. */
  parries: number;
  auxUses: number;
}

/** A flare or an afterimage: aimed fire goes for it first. Flares burst at the end; afterimages burn. */
export interface Decoy {
  kind: 'flare' | 'ghost';
  owner: number;
  x: number;
  z: number;
  t: number;
  life: number;
  r: number;
  /** Afterimage: damage per second to what touches it. Flare: the burst at the end. */
  power: number;
  tick: number;
  dead: boolean;
}

export interface Shot {
  x: number;
  z: number;
  vx: number;
  vz: number;
  dmg: number;
  kind: Gun['spec']['shot'];
  life: number;
  t: number;
  pierce: number;
  owner: number;
  homing: number;
  r: number;
  hit: number[];
  bounce: number;
  /** Doubled and shown as a crit (Hair Trigger). */
  crit?: boolean;
  /** Where it came from, if not a gun: for the view to tint. */
  tag?: 'reflect' | 'mirror' | 'wake' | 'salvage';
  dead: boolean;
}

export type BulletKind = 'orb' | 'needle' | 'big' | 'mine' | 'spore';

export interface Bullet {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  kind: BulletKind;
  life: number;
  t: number;
  /** Bit per player: already grazed. */
  grazed: number;
  color: number;
  /** Turn rate (rad/s) and acceleration (units/s²), for curving and speeding bullets. */
  turn: number;
  accel: number;
  /** Bursts into a ring of this many when its life runs out (mines, big orbs). */
  split: number;
  dead: boolean;
}

export interface Enemy extends FoeFields {
  id: number;
  arch: Archetype | Foe | 'boss';
  skin: EnemySkin;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  max: number;
  r: number;
  t: number;
  /** Stands on the ground (turrets): fixed in the world, not carried with the screen. */
  ground: boolean;
  /** Its ground height (turrets) or flying height (everything else). */
  y: number;
  elite: boolean;
  stun: number;
  flash: number;
  /** Which way it faces (radians, 0 = down the screen towards you). */
  heading: number;
  d: EnemyData;
  boss?: BossState;
  dead: boolean;
  /** Can't be hurt yet (a boss coming on). */
  shielded: boolean;
  score: number;
  scrap: number;
  drop: boolean;
  /** A bounty: worth a lot, if it's killed before it gets away (see Level.escape). */
  bounty?: Bounty;
  /** The wave it came in (see Level.openWave), for full clears. */
  wave?: number;
}

/** A hard drop: `reward` scrap (and a part crate with `part`) if it's killed within `life` seconds. */
export interface Bounty {
  reward: number;
  part?: boolean;
  life: number;
}

/** A wave as it stands: how many came, how many were killed, how many got away. */
export interface Wave {
  id: number;
  total: number;
  killed: number;
  missed: number;
}

export type PickupKind = 'scrap' | 'part' | 'repair' | 'ring';

export interface Pickup {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kind: PickupKind;
  value: number;
  t: number;
  dead: boolean;
  /** Part crates: what's inside. */
  part?: string;
  /** Rings: flown through by. */
  done?: number;
}

export type HazardKind = 'geyser' | 'falling_rocks' | 'lightning' | 'spore_cloud' | 'laser_gate' | 'flare';

export interface Hazard {
  kind: HazardKind;
  x: number;
  z: number;
  r: number;
  t: number;
  /** Warning time, then active time. */
  warn: number;
  active: number;
  /** laser gates: on/off period. */
  period: number;
  dead: boolean;
  /** Moves with the screen rather than with the ground. */
  air: boolean;
}

export type LevelEvent =
  | { type: 'shot'; owner: number; kind: Gun['spec']['shot']; x: number; z: number; dir: number }
  | { type: 'hit'; x: number; z: number; enemy: number; dmg: number; kill: boolean; crit: boolean }
  | { type: 'explode'; x: number; z: number; y: number; size: number; color: number; enemy?: number }
  | { type: 'enemyShot'; x: number; z: number; color: number }
  | { type: 'playerHit'; id: number; shield: boolean; x: number; z: number }
  | { type: 'crash'; id: number; x: number; z: number }
  | { type: 'down'; id: number; x: number; z: number }
  | { type: 'revive'; id: number }
  | { type: 'graze'; id: number; x: number; z: number }
  | { type: 'dash'; id: number; x: number; z: number; dx: number; dz: number }
  /** `echo`: the Echo Relay's second go, weaker. */
  | { type: 'special'; id: number; kind: NonNullable<Stats['special']>; x: number; z: number; echo?: boolean }
  | { type: 'specialReady'; id: number }
  | { type: 'pickup'; id: number; kind: PickupKind; x: number; z: number; value: number; part?: string }
  | { type: 'overheat'; id: number; gun: number }
  | { type: 'arc'; points: number[] }
  | { type: 'flak'; x: number; z: number }
  | { type: 'telegraph'; x: number; z: number; x2: number; z2: number; t: number }
  | { type: 'beam'; x: number; z: number; x2: number; z2: number; color: number }
  | { type: 'spawn'; enemy: number }
  | { type: 'bossWarning'; name: string }
  | { type: 'bossPhase'; phase: number; style?: BossStyle }
  | { type: 'biome'; index: number }
  /** The fight around the foes: tells, punish windows, kills and how (see combat.ts). */
  | FoeEvent
  | { type: 'hazard'; kind: HazardKind; x: number; z: number }
  /** Boost started or stopped. */
  | { type: 'boost'; id: number; on: boolean }
  /** A dash through fire, timed right: `absorbed` bullets soaked up, the dash given back. */
  | { type: 'perfect'; id: number; x: number; z: number; absorbed: number }
  /** Flying a hair from the land or an obstacle (a few times a second while it lasts): (x, z) is the near point, `close` 0..1. */
  | { type: 'skim'; id: number; x: number; z: number; close: number }
  /** A kill from up close. */
  | { type: 'pointBlank'; id: number; x: number; z: number }
  /** Races: into a shortcut, out of the far end (`saved`: seconds it's worth), or out the side (`fail`). */
  | { type: 'shortcut'; id: number; shortcut: number; state: 'enter' | 'exit' | 'fail'; saved: number }
  /** Every one of a wave killed: `bonus` scrap, paid at (x, z) (the last kill). */
  | { type: 'waveClear'; wave: number; bonus: number; x: number; z: number }
  /** Boosted past empty too long: the engine burst (a hit). */
  | { type: 'redline'; id: number; x: number; z: number }
  /** An enemy got away (off the screen, or a bounty's time ran out). */
  | { type: 'escaped'; enemy: number; x: number; z: number }
  /** A bounty showed up, was claimed (killed: `reward` paid), or escaped. */
  | { type: 'bounty'; state: 'appear' | 'claimed' | 'escaped'; enemy: number; x: number; z: number; reward: number }
  /** On a clear: a race's time against par, or a fight's tally; the rank and the scrap it earned. */
  | { type: 'par'; time: number; par: number; rank: Rank; bonus: number }
  | { type: 'tally'; killed: number; spawned: number; missed: number; waves: number; cleared: number; full: boolean; rank: Rank; bonus: number }
  /** The aux went off. */
  | { type: 'aux'; id: number; kind: AuxKind; x: number; z: number }
  /** A parry: `count` bullets thrown back (the opening instant of a Parry Emitter burst). */
  | { type: 'parry'; id: number; x: number; z: number; count: number }
  /** A late press: the burst only blocked these. */
  | { type: 'block'; id: number; x: number; z: number; count: number }
  /** The aux can be used again. */
  | { type: 'auxReady'; id: number }
  /** The tether flew from (x, z) to (x2, z2): hooked `enemy`, or 0 for a miss. */
  | { type: 'hook'; id: number; x: number; z: number; x2: number; z2: number; enemy: number }
  /** The tether reeled you in and hit. */
  | { type: 'reeled'; id: number; x: number; z: number; enemy: number; kill: boolean }
  /** The Void Siphon drank a bullet at (x, z). */
  | { type: 'eat'; id: number; x: number; z: number }
  /** A shield from something other than waiting (or waiting sped up by Static Skin). */
  | { type: 'shieldGain'; id: number; source: 'exchanger' | 'siphon' | 'skin' }
  /** Blink Coil: the dash was a jump from (x, z) to (x2, z2). */
  | { type: 'blink'; id: number; x: number; z: number; x2: number; z2: number }
  /** Ram Prow: dashed through an enemy. */
  | { type: 'ram'; id: number; x: number; z: number; enemy: number }
  /** Hair Trigger: crits on (after a perfect) or off. */
  | { type: 'crit'; id: number; on: boolean }
  /** A flare or an afterimage appeared (it lives in Level.decoys). */
  | { type: 'decoy'; id: number; kind: Decoy['kind']; x: number; z: number }
  | { type: 'clear' }
  | { type: 'failed' };

export type Rank = 'S' | 'A' | 'B' | 'C';

export class Level {
  readonly terrain: Terrain;
  readonly players: Player[] = [];
  readonly enemies: Enemy[] = [];
  readonly shots: Shot[] = [];
  readonly bullets: Bullet[] = [];
  readonly pickups: Pickup[] = [];
  readonly hazards: Hazard[] = [];
  events: LevelEvent[] = [];
  /** Lasers being aimed (lancers), for drawing and for dodging. */
  readonly lasers: { x: number; z: number; x2: number; z2: number; warn: number; on: number; color: number; owner: number }[] = [];
  /** What isn't bullets: shells, rings, gates, harpoons (see strikes.ts). */
  readonly strikes: Strike[] = [];
  /** A chase boss on its chase: the screen keeps going, though there's a boss. */
  chase = false;
  readonly rand: Rng;
  readonly director: Director;
  /** Where the middle of the screen is (z on the flight plane). Decreases as you fly. */
  scroll = 0;
  /** The level's own speed (units/s: the fights' scroll, a race's cruising), and how fast the screen is moving right now. */
  speed: number;
  speedNow: number;
  /** A race: the camera follows the leader rather than scrolling at its own pace. */
  readonly race: boolean;
  /** Races: how deep the leader is into the push band, 0..1 (eased). */
  push = 0;
  /** Races: seconds the level should take, and seconds added for being towed (co-op). */
  parTime: number;
  penalty = 0;
  /** On a clear: the rank (races: time against par; fights: how much was killed), the bonus it
   * paid, and whether a race came in under par (for whatever that opens up on the map). */
  rank: Rank | null = null;
  parBonus = 0;
  beatPar = false;
  /** Fights: the waves so far, and what was spawned in them, killed and let through. */
  readonly waves: Wave[] = [];
  spawned = 0;
  killed = 0;
  missed = 0;
  /** Bounties claimed and let go. */
  bounties = 0;
  bountiesLost = 0;
  /** Scrap paid for full waves, and for a full clear (on the results). */
  waveBonus = 0;
  fullClear = false;
  private openWaveId = -1;
  /** Seconds flown (stops when the level ends). */
  time = 0;
  frame = 0;
  state: 'flying' | 'boss' | 'clear' | 'failed' = 'flying';
  /** Seconds since the level ended (it lingers a little). */
  ending = 0;
  scrap = 0;
  score = 0;
  combo = 0;
  comboT = 0;
  /** Parts picked up this level, per player. */
  loot: string[][] = [[], []];
  /** Flares and afterimages: aimed fire goes for these first. */
  readonly decoys: Decoy[] = [];
  private nextId = 1;
  private biomeShown = -1;

  constructor(
    readonly spec: LevelSpec,
    builds: Build[],
    /** Players' hull carried over from the last level (or full). */
    hull?: number[],
  ) {
    this.rand = rng(spec.seed);
    this.terrain = new Terrain(
      spec.seed,
      spec.biomes.map((biome) => ({ biome, length: spec.length })),
      spec.mode === 'run',
    );
    this.race = spec.mode === 'run';
    this.speed = this.race ? 12 : 9;
    this.speedNow = this.speed;
    // a race is against the clock: its length at par pace
    this.parTime = Math.round(-(this.terrain.end + HALF_H + 20) / (this.speed * PAR_PACE));
    // what a shortcut's slipstream is worth, at par pace
    for (const sc of this.terrain.shortcuts) sc.saved = ((sc.z0 - sc.z1) / (this.speed * PAR_PACE)) * (1 - 1 / SLIPSTREAM);
    builds.forEach((b, i) => {
      const s = stats(b);
      const x = builds.length === 1 ? 0 : i === 0 ? -5 : 5;
      this.players.push({
        id: i,
        build: b,
        stats: s,
        x,
        z: HALF_H - 8,
        vx: 0,
        vz: 0,
        hp: Math.min(hull?.[i] ?? s.hp, s.hp),
        shield: s.shield,
        shieldWait: 0,
        inv: 2,
        dashT: 0,
        dashCd: 0,
        dashes: s.dashes,
        dashX: 0,
        dashZ: -1,
        heat: s.guns.map(() => 0),
        jam: s.guns.map(() => 0),
        cooldown: s.guns.map((_, k) => k * 0.013),
        shotCount: s.guns.map(() => 0),
        charge: 0.25,
        phase: 0,
        overdrive: 0,
        down: false,
        revive: 0,
        focus: false,
        firing: false,
        beam: s.guns.map(() => 0),
        hits: 0,
        crashes: 0,
        grazes: 0,
        kills: 0,
        ward: 0,
        slow: 0,
        causes: {},
        burn: BURN_START,
        boosting: 0,
        skim: 0,
        skimT: 0,
        slip: 0,
        slipX: 0,
        slipZ: 0,
        dashLock: 0,
        perfect: false,
        perfects: 0,
        boostTime: 0,
        skimTime: 0,
        towed: 0,
        shortcut: -1,
        shortcuts: 0,
        redline: 0,
        auxCd: 0,
        auxMax: 1,
        auxT: 0,
        parryT: 0,
        parried: 0,
        blocked: 0,
        eaten: 0,
        hook: 0,
        crit: 0,
        echoT: 0,
        rammed: [],
        parries: 0,
        auxUses: 0,
      });
    });
    this.director = new Director(this);
  }

  id() {
    return this.nextId++;
  }

  /** How far along (0..1). */
  get progress() {
    return clamp(-this.scroll / -this.terrain.end, 0, 1);
  }

  /** The playfield's top and bottom edges (z). */
  get top() {
    return this.scroll - HALF_H;
  }
  get bottom() {
    return this.scroll + HALF_H;
  }

  emit(e: LevelEvent) {
    this.events.push(e);
  }

  living() {
    return this.players.filter((p) => !p.down);
  }

  /** The nearest living player to (x, z), or undefined. */
  nearest(x: number, z: number) {
    let best: Player | undefined;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.down) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  step(intents: Intent[]) {
    this.frame++;
    if (this.state === 'clear' || this.state === 'failed') this.ending += DT;
    else this.time += DT;

    // the screen moves on: at its own pace in a fight (the boss holds it nearly still), after the
    // leader on a race
    this.updateSpeed(intents);
    const dz = this.speedNow * DT;
    this.scroll -= dz;

    const bi = this.terrain.biomeIndex(this.scroll - HALF_H * 0.5);
    if (bi !== this.biomeShown) {
      this.biomeShown = bi;
      this.emit({ type: 'biome', index: bi });
    }

    for (let i = 0; i < this.players.length; i++) this.updatePlayer(this.players[i], intents[i] ?? NEUTRAL, dz);
    this.updateRevives();
    this.director.update();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.ground) e.z -= dz;
      e.t += DT;
      e.flash = Math.max(0, e.flash - DT);
      e.stun = Math.max(0, e.stun - DT);
      updateEnemy(this, e);
      // gone off the bottom (or far off the sides), or a bounty out of time: it got away
      if (e.z > this.bottom + 10 || e.z < this.top - 40 || Math.abs(e.x) > HALF_W + 26) {
        if (e.t > 1 && !e.boss) this.escape(e);
      } else if (e.bounty && e.t > e.bounty.life) this.escape(e);
    }
    this.updateShots();
    this.updateBullets(dz);
    this.updateLasers();
    updateStrikes(this, dz);
    tickCombat(this);
    this.updatePickups(dz);
    this.updateDecoys(dz);
    this.updateHazards(dz);
    this.collide();

    if (this.comboT > 0) {
      this.comboT -= DT;
      if (this.comboT <= 0) this.combo = 0;
    }

    sweep(this.enemies);
    sweep(this.shots);
    sweep(this.bullets);
    sweep(this.pickups);
    sweep(this.hazards);

    if (this.state === 'flying' || this.state === 'boss') {
      if (this.players.every((p) => p.down)) {
        this.state = 'failed';
        this.emit({ type: 'failed' });
      } else if (this.spec.mode !== 'boss' && this.scroll < this.terrain.end + HALF_H + 20) {
        this.finish();
      }
    }
  }

  finish() {
    if (this.state === 'clear') return;
    this.state = 'clear';
    const hard = 1 + this.spec.difficulty * 0.5;
    if (this.race) {
      // against the clock: under par pays, by how far under
      const time = this.time + this.penalty;
      const ratio = time / this.parTime;
      this.rank = ratio <= 0.85 ? 'S' : ratio <= 1 ? 'A' : ratio <= 1.15 ? 'B' : 'C';
      this.parBonus = ratio < 1 ? Math.round((1 - ratio) * PAR_SCRAP * hard) : 0;
      this.beatPar = ratio <= 1;
      this.emit({ type: 'par', time, par: this.parTime, rank: this.rank, bonus: this.parBonus });
    } else {
      // a fight: how much got through
      const seen = this.killed + this.missed;
      const share = seen ? this.killed / seen : 1;
      this.fullClear = this.missed === 0 && this.spawned > 0;
      this.rank = this.fullClear || share >= 0.95 ? 'S' : share >= 0.85 ? 'A' : share >= 0.65 ? 'B' : 'C';
      this.parBonus = this.fullClear ? Math.round(FULL_CLEAR * hard) : 0;
      const cleared = this.waves.filter((w) => w.missed === 0 && w.killed === w.total).length;
      this.emit({
        type: 'tally', killed: this.killed, spawned: this.spawned, missed: this.missed, waves: this.waves.length, cleared, full: this.fullClear, rank: this.rank, bonus: this.parBonus,
      });
    }
    this.scrap += this.parBonus;
    this.score += this.parBonus * 100;
    this.emit({ type: 'clear' });
    // everything left flies to you
    for (const p of this.pickups) if (p.kind === 'scrap') p.t = 99;
    for (const b of this.bullets) b.dead = true;
  }

  // --- speed, waves and bounties -----------------------------------------------------------

  /**
   * Boost spends Burn. On a race it's your own forward speed, and the camera follows the leader
   * (with a lag, so a surge shows); in a fight the screen keeps its pace and the boost goes into
   * the ship (see updatePlayer).
   */
  private updateSpeed(intents: Intent[]) {
    const over = this.state === 'clear' || this.state === 'failed';
    for (const p of this.players) {
      const i = intents[p.id] ?? NEUTRAL;
      const want = p.down || over ? 0 : clamp(i.boost ?? 0, 0, 1);
      const was = p.boosting > 0.05;
      // past an empty Burn the boost runs on, into the redline
      p.boosting = want;
      const red = p.burn <= 0 && want > 0.05;
      p.burn = Math.max(0, p.burn - BURN_DRAIN * p.boosting * DT);
      p.redline = red ? p.redline + REDLINE_HEAT * want * DT : Math.max(0, p.redline - REDLINE_COOL * DT);
      if (p.redline >= 1) {
        p.redline = REDLINE_AFTER;
        this.emit({ type: 'redline', id: p.id, x: p.x, z: p.z });
        this.hurt(p, p.x, p.z, 'redline');
      }
      if (p.shortcut >= 0) p.burn = Math.min(1, p.burn + BURN_SLIPSTREAM * DT);
      p.boostTime += p.boosting * DT;
      if (was !== p.boosting > 0.05) this.emit({ type: 'boost', id: p.id, on: !was });
    }
    let target = this.state === 'boss' && !this.chase ? 2.5 : this.state === 'clear' ? this.speed * 1.4 : this.speed;
    if (this.race && !over) {
      // whoever's furthest up the screen pushes it on, the deeper into the top band the more
      this.push = 0;
      const leader = this.leader();
      if (leader) {
        const edge = -HALF_H + 2 * HALF_H * PUSH_BAND;
        this.push = smooth(clamp((edge - (leader.z - this.scroll)) / (edge - (-HALF_H + 3)), 0, 1));
        target += this.push * (PUSH_TAKE * Math.max(0, -leader.vz) + PUSH_DEPTH);
      }
    }
    this.speedNow = damp(this.speedNow, target, 1 / CAM_EASE, DT);
  }

  /** Races: into a shortcut's mouth, out of its far end (made it), or out of its side (didn't). */
  private updateShortcut(p: Player) {
    const t = this.terrain;
    if (p.shortcut < 0) {
      const sc = t.shortcuts.find((c) => p.z <= c.z0 && p.z > c.z0 - 4);
      if (sc && Math.abs(p.x - laneX(sc, p.z)) < sc.half + 0.3) {
        p.shortcut = sc.id;
        this.emit({ type: 'shortcut', id: p.id, shortcut: sc.id, state: 'enter', saved: sc.saved });
      }
      return;
    }
    const sc = t.shortcuts[p.shortcut];
    if (p.z < sc.z1) {
      p.shortcut = -1;
      p.shortcuts++;
      this.emit({ type: 'shortcut', id: p.id, shortcut: sc.id, state: 'exit', saved: sc.saved });
    } else if (Math.abs(p.x - laneX(sc, p.z)) > sc.half + 1.2 || p.down) {
      p.shortcut = -1;
      this.emit({ type: 'shortcut', id: p.id, shortcut: sc.id, state: 'fail', saved: 0 });
    }
  }

  /** On a race: the living ship furthest up the screen (whose push counts). */
  leader() {
    let best: Player | undefined;
    for (const p of this.players) if (!p.down && (!best || p.z < best.z)) best = p;
    return best;
  }

  /** Everything the director spawns between these is one wave (for full clears). */
  openWave() {
    this.openWaveId = this.waves.length;
    this.waves.push({ id: this.openWaveId, total: 0, killed: 0, missed: 0 });
  }

  closeWave() {
    if (this.waves.length && this.waves[this.waves.length - 1].total === 0) this.waves.pop();
    this.openWaveId = -1;
  }

  /** An enemy that got away: off the screen, or a bounty whose time ran out. It's missed. */
  escape(e: Enemy) {
    if (e.dead) return;
    e.dead = true;
    this.emit({ type: 'escaped', enemy: e.id, x: e.x, z: e.z });
    if (e.bounty) {
      this.bountiesLost++;
      this.emit({ type: 'bounty', state: 'escaped', enemy: e.id, x: e.x, z: e.z, reward: e.bounty.reward });
    }
    const w = e.wave === undefined ? undefined : this.waves[e.wave];
    if (!w) return;
    w.missed++;
    this.missed++;
  }

  /** A kill, for the tally: a bounty paid out, and a wave finished off. */
  private tallyKill(e: Enemy) {
    if (e.bounty) {
      this.bounties++;
      const b = e.bounty;
      for (let k = 0; k < b.reward; k += 5) this.drop('scrap', e.x + (this.rand() - 0.5) * e.r, e.z + (this.rand() - 0.5) * e.r, Math.min(5, b.reward - k));
      if (b.part) this.drop('part', e.x, e.z, 0);
      this.emit({ type: 'bounty', state: 'claimed', enemy: e.id, x: e.x, z: e.z, reward: b.reward });
    }
    const w = e.wave === undefined ? undefined : this.waves[e.wave];
    if (!w) return;
    w.killed++;
    this.killed++;
    if (w.killed === w.total && w.missed === 0) {
      const bonus = Math.max(1, Math.round(w.total * WAVE_BONUS));
      this.scrap += bonus;
      this.waveBonus += bonus;
      this.emit({ type: 'waveClear', wave: w.id, bonus, x: e.x, z: e.z });
    }
  }

  // --- players -----------------------------------------------------------------------------

  private updatePlayer(p: Player, i: Intent, dz: number) {
    const s = p.stats;
    p.z -= dz; // carried along with the screen
    if (p.down) {
      p.vx *= 0.95;
      p.vz *= 0.95;
      p.x += p.vx * DT;
      p.z += p.vz * DT;
      p.z = Math.min(p.z, this.bottom - 2);
      return;
    }
    p.inv = Math.max(0, p.inv - DT);
    p.phase = Math.max(0, p.phase - DT);
    p.overdrive = Math.max(0, p.overdrive - DT);
    p.slow = Math.max(0, p.slow - DT);
    p.ward = Math.max(0, p.ward - DT);
    p.slip = Math.max(0, p.slip - DT);
    p.dashLock = Math.max(0, p.dashLock - DT);
    p.focus = i.focus;

    // movement: quick to answer, quick to stop
    let mx = i.x;
    let mz = -i.y;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    // boost is a surge of the ship: much faster, up the screen unless steered, and it slides more
    // (less grip); in a race's shortcut, the slipstream on top
    const b = p.boosting;
    if (Math.hypot(mx, mz) < 0.1) mz = -SURGE_PUSH * b;
    const top = s.speed * (i.focus ? 0.45 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + SURGE_SHIP * b) * (p.shortcut >= 0 ? SLIPSTREAM : 1);
    if (p.dashT > 0) {
      p.dashT -= DT;
      p.vx = p.dashX * DASH_SPEED;
      p.vz = p.dashZ * DASH_SPEED;
      if (p.dashT <= 0) {
        p.vx *= 0.35;
        p.vz *= 0.35;
      }
    } else {
      const tx = mx * top;
      const tz = mz * top;
      const a = s.accel * DT * (1 - 0.35 * b);
      p.vx += clamp(tx - p.vx, -a, a);
      p.vz += clamp(tz - p.vz, -a, a);
      // stopping is sharper than starting: no ice (a little more slide at speed)
      const stop = 0.8 + 0.1 * b;
      if (Math.abs(mx) < 0.1) p.vx *= stop;
      if (Math.abs(mz) < 0.1) p.vz *= stop;
    }
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    p.x = clamp(p.x, -HALF_W + 1.2, HALF_W - 1.2);
    p.z = clamp(p.z, this.top + 3, this.bottom - 2);
    if (this.race) {
      // left at the bottom edge while someone else pushes on: towed, and the clock charged for it
      if (p.z >= this.bottom - 2.01 && this.push > 0 && this.leader() !== p) {
        p.towed += DT;
        this.penalty += TOW_PENALTY * DT;
      }
      this.updateShortcut(p);
    }

    // dash
    p.dashCd = Math.max(0, p.dashCd - DT);
    if (p.dashCd <= 0 && p.dashes < s.dashes) {
      p.dashes++;
      p.dashCd = s.dashCooldown;
    }
    if (i.dash && p.dashes > 0 && p.dashT <= 0 && p.dashLock <= 0) {
      p.dashes--;
      if (p.dashCd <= 0) p.dashCd = s.dashCooldown;
      const dl = Math.hypot(mx, mz);
      p.dashX = dl > 0.2 ? mx / dl : 0;
      p.dashZ = dl > 0.2 ? mz / dl : -1;
      // committed: a fixed burst, safe only at the very start (see perfectDash)
      p.dashT = DASH_TIME;
      p.dashLock = DASH_TIME + DASH_RECOVER;
      p.slip = SLIP;
      p.slipX = p.x;
      p.slipZ = p.z - this.scroll;
      p.perfect = false;
      p.inv = Math.max(p.inv, SLIP);
      this.emit({ type: 'dash', id: p.id, x: p.x, z: p.z, dx: p.dashX, dz: p.dashZ });
      this.dashMods(p);
    }

    // shield comes back if you stop getting hit
    if (p.shield < s.shield) {
      // (Static Skin: much sooner while skimming)
      p.shieldWait += DT * (1 + s.skin * p.skim);
      if (p.shieldWait > 6) {
        p.shield++;
        p.shieldWait = 0;
        if (s.skin && p.skim > 0) this.emit({ type: 'shieldGain', id: p.id, source: 'skin' });
      }
    }

    // special
    const was = p.charge;
    p.charge = Math.min(1, p.charge + DT * 0.012 * s.specialRate);
    if (was < 1 && p.charge >= 1 && s.special) this.emit({ type: 'specialReady', id: p.id });
    if (i.special && s.special && p.charge >= 1) {
      p.charge = 0;
      this.special(p, s.special);
    }

    // guns
    p.firing = i.fire && this.state !== 'clear';
    for (let k = 0; k < s.guns.length; k++) this.updateGun(p, k, p.firing);
    this.updateKit(p, i);
  }

  /** `k`: how strong (below 1: the Echo Relay's second go). */
  private special(p: Player, kind: NonNullable<Stats['special']>, k = 1) {
    this.emit({ type: 'special', id: p.id, kind, x: p.x, z: p.z, echo: k < 1 });
    if (k === 1 && p.stats.echo > 0) p.echoT = ECHO_DELAY;
    if (kind === 'bomb') {
      for (const b of this.bullets) if (this.onScreen(b.x, b.z)) this.cancel(b);
      for (const e of this.enemies) if (this.onScreen(e.x, e.z)) this.damage(e, (e.boss ? 60 : 90) * k, p.id, false);
      p.inv = Math.max(p.inv, 1.5 * k);
    } else if (kind === 'phase') {
      p.phase = Math.max(p.phase, 2.2 * k);
      p.inv = Math.max(p.inv, 2.2 * k);
    } else if (kind === 'emp') {
      for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 14 * 14) this.cancel(b);
      for (const e of this.enemies)
        if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < 16 * 16) {
          if (e.skin.kind === 'mech') e.stun = (e.boss ? 1.5 : 3.5) * k;
          this.damage(e, 15 * k, p.id, false);
        }
    } else if (kind === 'overdrive') {
      p.overdrive = Math.max(p.overdrive, 5 * k);
      p.heat.fill(0);
      p.jam.fill(0);
    }
  }

  /** A bullet turned into a bit of scrap (bombs, phase changes, perfect dashes). */
  cancel(b: Bullet, chance = 0.25) {
    if (b.dead) return;
    b.dead = true;
    if (this.rand() < chance) this.drop('scrap', b.x, b.z, 1);
  }

  onScreen(x: number, z: number, margin = 0) {
    return Math.abs(x) < HALF_W + margin && z > this.top - margin && z < this.bottom + margin;
  }

  private updateGun(p: Player, k: number, firing: boolean) {
    const g = p.stats.guns[k];
    const sp = g.spec;
    p.beam[k] = 0;
    p.cooldown[k] -= DT;
    // a sentry picks its own target, and fires whether you do or not
    const target = sp.auto ? this.autoTarget(p.x + g.x, p.z + g.z) : undefined;
    if (sp.auto) firing = !!target && this.state !== 'clear';
    const od = p.overdrive > 0;
    if (p.jam[k] > 0) {
      p.jam[k] -= DT;
      p.heat[k] = Math.max(0, p.heat[k] - DT * 0.5);
      return;
    }
    if (!firing || p.slow > 0) {
      p.heat[k] = Math.max(0, p.heat[k] - DT * 0.6 * g.cool);
      return;
    }
    p.heat[k] = Math.max(0, p.heat[k] - DT * 0.18 * g.cool);
    const gx = p.x + g.x;
    const gz = p.z + g.z;
    // focus turns the angled guns to fire straight ahead (the ones facing back stay put)
    const dir = target ? Math.atan2(target.x - gx, -(target.z - gz)) : p.focus && Math.abs(g.dir) < Math.PI / 2 ? 0 : g.dir;
    // Throttle Link: faster and cooler while boosting
    const thr = 1 + g.throttle * p.boosting;
    if (sp.shot === 'beam') {
      // a held beam: worked out every frame, as a ray up the screen
      const rate = (od ? 2 : 1) * thr;
      p.heat[k] += (sp.heat * DT * 60 * (od ? 0 : 1) * 0.5) / thr;
      const reach = this.beamReach(gx, gz, dir, 0.9);
      p.beam[k] = reach.len;
      if (p.cooldown[k] <= 0) {
        p.cooldown[k] = 1 / (sp.rate * rate);
        const hit = this.gunDamage(p, g);
        for (const e of reach.hit) this.damage(e, hit.dmg, p.id, hit.crit);
      }
    } else if (p.cooldown[k] <= 0) {
      const rate = sp.rate * (od ? 2 : 1) * thr;
      p.cooldown[k] += 1 / rate;
      if (p.cooldown[k] < 0) p.cooldown[k] = 0;
      p.shotCount[k]++;
      const extra = g.burst && p.shotCount[k] % 4 === 0 ? 1 : 0;
      this.fire(p, g, gx, gz, dir, extra);
      // Storm Lens: every few shots, lightning too
      if (g.storm && p.shotCount[k] % g.storm === 0) this.arc(p, gx, gz, this.gunDamage(p, g).dmg * 1.5, 3 + (p.stats.bonus.arc ? 2 : 0));
      if (!od) p.heat[k] += sp.heat / thr;
    }
    if (p.heat[k] >= 1) {
      p.jam[k] = g.exchange ? 0.85 : 1.4;
      this.emit({ type: 'overheat', id: p.id, gun: k });
      // Heat Exchanger: the heat comes back as a shield
      for (let n = 0; n < g.exchange; n++) this.gainShield(p, 'exchanger');
      if (p.stats.bonus.heat === 2) {
        // Furnace: overheating throws a ring of fire
        for (let a = 0; a < 16; a++) this.addShot(p.id, 'flame', p.x, p.z, (a / 16) * Math.PI * 2, 26, 4, 0.4, 3, 0);
      }
    }
  }

  private beamReach(x: number, z: number, dir: number, width: number) {
    const dx = Math.sin(dir);
    const dz = -Math.cos(dir);
    let len = HALF_H * 2.2;
    // the land stops a beam
    for (let d = 0; d < len; d += 1) {
      if (this.terrain.solid(x + dx * d, z + dz * d, 0)) {
        len = d;
        break;
      }
    }
    const hit: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.dead || e.shielded) continue;
      const ex = e.x - x;
      const ez = e.z - z;
      const along = ex * dx + ez * dz;
      if (along < 0 || along > len) continue;
      const across = Math.abs(ex * dz - ez * dx);
      if (across < e.r + width) hit.push(e);
    }
    return { len, hit };
  }

  /** `mul`: harder than usual (a Recoil Battery's volley). */
  private fire(p: Player, g: Gun, x: number, z: number, dir: number, extra: number, mul = 1) {
    const sp = g.spec;
    if (g.drone) {
      // drones ride alongside, a little behind
      x = p.x + g.x;
      z = p.z + g.z;
    }
    this.emit({ type: 'shot', owner: p.id, kind: sp.shot, x, z, dir });
    const hit = this.gunDamage(p, g);
    hit.dmg *= mul;
    if (sp.shot === 'arc') {
      this.arc(p, x, z, hit.dmg, 3 + (p.stats.bonus.arc ? 2 : 0) + extra);
      return;
    }
    // and pulls spreads in: a focused stream instead of a fan
    const tight = p.focus ? FOCUS_SPREAD : 1;
    const n = sp.count + extra;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * sp.spread * tight;
      const jitter = sp.shot === 'pellet' || sp.shot === 'flame' ? (this.rand() - 0.5) * 0.12 * tight : 0;
      const speed = sp.speed * (sp.shot === 'pellet' ? 0.85 + this.rand() * 0.3 : 1);
      this.addShot(p.id, sp.shot, x, z, dir + off + jitter, speed, hit.dmg, sp.life, sp.pierce ?? 0, g.homing).crit = hit.crit;
    }
  }

  addShot(owner: number, kind: Shot['kind'], x: number, z: number, dir: number, speed: number, dmg: number, life: number, pierce: number, homing: number) {
    const r = kind === 'rail' ? 0.7 : kind === 'flak' || kind === 'mine' ? 0.6 : kind === 'flame' ? 0.7 : kind === 'missile' ? 0.45 : 0.35;
    const shot: Shot = {
      x,
      z,
      vx: Math.sin(dir) * speed,
      vz: -Math.cos(dir) * speed,
      dmg,
      kind,
      life,
      t: 0,
      pierce,
      owner,
      homing: kind === 'missile' ? Math.max(homing, 1) * 5 : homing * 2.5,
      r,
      hit: [],
      bounce: this.players[owner]?.stats.bonus.kinetic === 2 && (kind === 'slug' || kind === 'pellet') ? 1 : 0,
      dead: false,
    };
    this.shots.push(shot);
    return shot;
  }

  private arc(p: Player, x: number, z: number, dmg: number, jumps: number) {
    const points = [x, z];
    const done: Enemy[] = [];
    let cx = x;
    let cz = z;
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | undefined;
      let bd = (j === 0 ? 15 : 9) ** 2;
      for (const e of this.enemies) {
        if (e.dead || e.shielded || done.includes(e)) continue;
        if (j === 0 && e.z > z + 2) continue; // the first jump goes forward
        const d = (e.x - cx) ** 2 + (e.z - cz) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      done.push(best);
      points.push(best.x, best.z);
      this.damage(best, dmg * (j === 0 ? 1 : 0.8), p.id, false);
      cx = best.x;
      cz = best.z;
    }
    if (points.length === 2) points.push(x + (this.rand() - 0.5) * 4, z - 7);
    this.emit({ type: 'arc', points });
  }

  private updateRevives() {
    if (this.players.length < 2) return;
    for (const p of this.players) {
      if (!p.down) continue;
      const helper = this.players.find((q) => q !== p && !q.down && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 3.6 * 3.6);
      if (helper) p.revive += DT;
      else p.revive = Math.max(0, p.revive - DT * 0.5);
      if (p.revive >= 1.6) {
        p.down = false;
        p.revive = 0;
        p.hp = Math.min(2, p.stats.hp);
        p.inv = 2.5;
        this.emit({ type: 'revive', id: p.id });
      }
    }
  }

  /** A hit on a player: shield first, then hull. Returns false if it didn't land. */
  hurt(p: Player, x: number, z: number, cause = 'bullet', amount = 1) {
    if (p.down || p.inv > 0 || p.phase > 0 || this.state === 'clear') return false;
    if (p.stats.bonus.armor === 2 && p.ward <= 0) {
      p.ward = 10;
      p.inv = 0.6;
      this.emit({ type: 'playerHit', id: p.id, shield: true, x, z });
      return true;
    }
    p.shieldWait = 0;
    p.hits++;
    p.causes[cause] = (p.causes[cause] ?? 0) + 1;
    // Burn Engine: the price of the power
    if (p.stats.gamble > 0) p.burn = 0;
    if (p.shield > 0) {
      p.shield--;
      p.inv = 0.8;
      if (p.stats.mirror && cause === 'bullet') this.mirror(p, x, z, p.stats.mirror);
      this.emit({ type: 'playerHit', id: p.id, shield: true, x, z });
    } else {
      p.hp -= amount;
      p.inv = 1.4;
      this.emit({ type: 'playerHit', id: p.id, shield: false, x, z });
      if (p.hp <= 0) {
        p.hp = 0;
        p.down = true;
        p.revive = 0;
        p.firing = false;
        this.emit({ type: 'down', id: p.id, x: p.x, z: p.z });
        this.emit({ type: 'explode', x: p.x, z: p.z, y: FLIGHT_Y, size: 2.5, color: 0xffa040 });
      }
    }
    if (p.stats.bonus.arc === 2) this.arc(p, p.x, p.z, 12, 6);
    // a hit clears the bullets right around you: no double hits
    for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 9) this.cancel(b);
    this.combo = 0;
    return true;
  }

  // --- enemies -----------------------------------------------------------------------------

  spawn(arch: Enemy['arch'], skin: EnemySkin, x: number, z: number, d: EnemyData, opts: Partial<Enemy> = {}): Enemy {
    const diff = this.spec.difficulty;
    const foe = isFoe(arch) ? FOES[arch] : undefined;
    const base = (foe ? foe.hp : HP[arch as Archetype | 'boss']) * (1 + diff * 0.9) * (opts.elite ? 3 : 1);
    const e: Enemy = {
      id: this.id(),
      arch,
      skin,
      x,
      z,
      vx: 0,
      vz: 0,
      hp: base,
      max: base,
      r: enemyRadius(arch) * (opts.elite ? 1.3 : 1),
      t: 0,
      ground: arch === 'turret' || !!foe?.ground,
      y: arch === 'turret' || foe?.ground ? 0 : FLIGHT_Y,
      elite: false,
      stun: 0,
      flash: 0,
      heading: 0,
      d,
      dead: false,
      shielded: false,
      score: foe ? foe.score : SCORE[arch as Archetype | 'boss'],
      scrap: foe ? foe.scrap : SCRAP[arch as Archetype | 'boss'],
      drop: false,
      ...foeDefaults(),
      ...opts,
    };
    if (opts.hp) e.max = opts.hp;
    if (e.elite) {
      e.scrap *= 3;
      e.score *= 3;
      e.drop = true;
    }
    this.enemies.push(e);
    this.emit({ type: 'spawn', enemy: e.id });
    // counted for full clears if the director sent it (not the boss, not what's launched later)
    const w = this.waves[this.openWaveId];
    if (w && arch !== 'boss' && e.wave === undefined) {
      e.wave = w.id;
      w.total++;
      this.spawned++;
    }
    if (e.bounty) this.emit({ type: 'bounty', state: 'appear', enemy: e.id, x: e.x, z: e.z, reward: e.bounty.reward });
    return e;
  }

  /**
   * `from`: where the hit came from, for shields (default: the owner's ship; null: nowhere, as for
   * a shot, which has had its own say in collide); `s`: the shot, if it was one.
   */
  damage(e: Enemy, dmg: number, owner: number, crit: boolean, from?: { x: number; z: number } | null, s?: Shot) {
    if (e.dead || e.shielded) return;
    const p = this.players[owner];
    // armour, shields, exposed after an attack (see combat.ts)
    const k = foeTaken(this, e, from === undefined ? (p ? { x: p.x, z: p.z } : null) : from, crit);
    if (k <= 0) {
      this.emit({ type: 'guard', enemy: e.id, x: e.x, z: e.z });
      return;
    }
    dmg *= k;
    e.hp -= dmg;
    e.flash = 0.08;
    foeHurt(this, e, dmg);
    if (p) p.charge = Math.min(1, p.charge + dmg * 0.0018 * p.stats.specialRate);
    const kill = e.hp <= 0;
    this.emit({ type: 'hit', x: e.x, z: e.z, enemy: e.id, dmg, kill, crit });
    if (!kill) return;
    // up close: worth the danger
    const close = !!p && !p.down && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < POINT_BLANK * POINT_BLANK;
    if (close) {
      p.burn = Math.min(1, p.burn + BURN_CLOSE_KILL);
      this.emit({ type: 'pointBlank', id: p.id, x: e.x, z: e.z });
      // Salvage Charges leave a mine; Hair Trigger crits run on
      if (p.stats.salvage > 0) this.addShot(p.id, 'mine', e.x, e.z, 0, 0, p.stats.salvage, 2.5, 0, 0).tag = 'salvage';
      if (p.crit > 0) p.crit += 0.5;
    }
    this.emit({ type: 'kill', enemy: e.id, arch: e.arch, x: e.x, z: e.z, ...killHow(e, p, close, s) });
    this.kill(e, owner, close);
  }

  /** `close`: a point-blank kill, double scrap. */
  kill(e: Enemy, owner: number, close = false) {
    if (e.dead) return;
    e.dead = true;
    const big = e.arch === 'boss' ? 8 : e.arch === 'brute' || e.arch === 'carrier' ? 3.5 : e.arch === 'gunship' || e.arch === 'bomber' ? 2.4 : 1.4;
    this.emit({ type: 'explode', x: e.x, z: e.z, y: e.y, size: big * (e.elite ? 1.4 : 1), color: e.skin.colors[2], enemy: e.id });
    this.combo++;
    this.comboT = 2;
    this.score += Math.round(e.score * (1 + Math.min(this.combo, 50) * 0.1));
    this.tallyKill(e);
    const p = this.players[owner];
    if (p) p.kills++;
    for (let i = 0; i < e.scrap * (close ? 2 : 1); i++) this.drop('scrap', e.x + (this.rand() - 0.5) * e.r, e.z + (this.rand() - 0.5) * e.r, 1 + (this.rand() < 0.2 ? 4 : 0));
    if (e.drop) this.drop('part', e.x, e.z, 0);
    else if (this.rand() < 0.015) this.drop('repair', e.x, e.z, 1);
    // Demolition: kills explode
    if (p?.stats.bonus.explosive === 2) this.blast(e.x, e.z, 3.5, 10, owner);
    onKill(this, e, p ? owner : -1);
    if (e.boss) this.director.bossDown(e);
  }

  /** Splash damage (flak, mines, Demolition). */
  blast(x: number, z: number, r: number, dmg: number, owner: number) {
    const rr = r * (this.players[owner]?.stats.bonus.explosive ? 1.4 : 1);
    this.emit({ type: 'explode', x, z, y: FLIGHT_Y, size: rr * 0.5, color: 0xffc060 });
    for (const e of this.enemies) if (!e.dead && (e.x - x) ** 2 + (e.z - z) ** 2 < (rr + e.r) ** 2) this.damage(e, dmg, owner, false);
  }

  /** Enemy fire. Angle 0 is down the screen (towards the players). */
  bullet(x: number, z: number, angle: number, speed: number, opts: Partial<Bullet> = {}) {
    const s = speed * (1 + this.spec.difficulty * 0.18);
    this.bullets.push({
      x,
      z,
      vx: Math.sin(angle) * s,
      vz: Math.cos(angle) * s,
      r: 0.45,
      kind: 'orb',
      life: 9,
      t: 0,
      grazed: 0,
      color: 0xff4a6a,
      turn: 0,
      accel: 0,
      split: 0,
      dead: false,
      ...opts,
    });
  }

  /** The angle from (x, z) to the nearest decoy in reach, or else the nearest player (0 if there's nobody). */
  aim(x: number, z: number) {
    let p: { x: number; z: number } | undefined;
    let bd = DECOY_REACH * DECOY_REACH;
    for (const d of this.decoys) {
      const dd = (d.x - x) ** 2 + (d.z - z) ** 2;
      if (dd < bd) {
        bd = dd;
        p = d;
      }
    }
    p ??= this.nearest(x, z);
    return p ? Math.atan2(p.x - x, p.z - z) : 0;
  }

  drop(kind: PickupKind, x: number, z: number, value: number, part?: string) {
    const a = this.rand() * Math.PI * 2;
    const v = kind === 'scrap' ? 3 + this.rand() * 6 : 2;
    this.pickups.push({ x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v - 2, kind, value, t: 0, dead: false, part: part ?? (kind === 'part' ? this.director.loot() : undefined) });
  }

  // --- the rest ----------------------------------------------------------------------------

  private updateShots() {
    for (const s of this.shots) {
      s.t += DT;
      if (s.t > s.life) {
        s.dead = true;
        if (s.kind === 'flak') {
          this.emit({ type: 'flak', x: s.x, z: s.z });
          this.blast(s.x, s.z, 3, s.dmg * 0.6, s.owner);
          for (let a = 0; a < 8; a++) this.addShot(s.owner, 'pellet', s.x, s.z, (a / 8) * Math.PI * 2, 30, s.dmg * 0.25, 0.25, 0, 0);
        } else if (s.kind === 'mine') {
          this.blast(s.x, s.z, 3.5, s.dmg, s.owner);
          if (s.tag === 'salvage') for (let k = 0; k < 2; k++) this.drop('scrap', s.x, s.z, 1);
        }
        continue;
      }
      if (s.homing > 0) {
        // curve towards the nearest enemy ahead
        let best: Enemy | undefined;
        let bd = 22 * 22;
        for (const e of this.enemies) {
          if (e.dead || e.shielded) continue;
          const d = (e.x - s.x) ** 2 + (e.z - s.z) ** 2;
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) {
          const sp = Math.hypot(s.vx, s.vz);
          const want = Math.atan2(best.x - s.x, -(best.z - s.z));
          const have = Math.atan2(s.vx, -s.vz);
          let da = want - have;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          const turn = clamp(da, -s.homing * DT, s.homing * DT);
          s.vx = Math.sin(have + turn) * sp;
          s.vz = -Math.cos(have + turn) * sp;
        }
        if (s.kind === 'missile') {
          const sp = Math.hypot(s.vx, s.vz);
          const k = Math.min(sp + 40 * DT, 46) / sp;
          s.vx *= k;
          s.vz *= k;
        }
      }
      if (s.kind === 'mine') {
        s.vx *= 0.96;
        s.vz *= 0.96;
        s.z -= this.state === 'boss' ? 0 : this.speedNow * DT * 0.6;
      }
      s.x += s.vx * DT;
      s.z += s.vz * DT;
      if (!this.onScreen(s.x, s.z, 4)) s.dead = true;
      else if (s.kind !== 'rail' && this.terrain.solid(s.x, s.z, 0)) {
        // the land stops shots
        if (s.bounce > 0) {
          s.bounce--;
          s.vz = -s.vz;
        } else s.dead = true;
      }
    }
  }

  private updateBullets(dz: number) {
    const slowScroll = this.state === 'boss';
    for (const b of this.bullets) {
      b.t += DT;
      if (b.turn) {
        const c = Math.cos(b.turn * DT);
        const sn = Math.sin(b.turn * DT);
        const vx = b.vx * c - b.vz * sn;
        b.vz = b.vx * sn + b.vz * c;
        b.vx = vx;
      }
      if (b.accel) {
        const sp = Math.hypot(b.vx, b.vz) || 1;
        const k = Math.max(0.5, sp + b.accel * DT) / sp;
        b.vx *= k;
        b.vz *= k;
      }
      b.x += b.vx * DT;
      b.z += b.vz * DT - (b.kind === 'mine' && !slowScroll ? dz * 0.3 : 0);
      if (b.t > b.life || !this.onScreen(b.x, b.z, 6)) {
        if (b.split && b.t > b.life && !b.dead) {
          const off = this.rand() * Math.PI;
          for (let k = 0; k < b.split; k++)
            this.bullet(b.x, b.z, off + (k / b.split) * Math.PI * 2, 9, { color: b.color, r: 0.4 });
        }
        b.dead = true;
      }
    }
  }

  private updateLasers() {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      const owner = this.enemies.find((e) => e.id === l.owner);
      if (!owner || owner.dead) {
        this.lasers.splice(i, 1);
        continue;
      }
      // the laser comes from its owner, wherever it is now
      const dx = l.x2 - l.x;
      const dz = l.z2 - l.z;
      l.x = owner.x;
      l.z = owner.z;
      l.x2 = l.x + dx;
      l.z2 = l.z + dz;
      if (l.warn > 0) {
        l.warn -= DT;
        continue;
      }
      l.on -= DT;
      if (l.on <= 0) {
        this.lasers.splice(i, 1);
        continue;
      }
      const len = Math.hypot(dx, dz);
      const ux = dx / len;
      const uz = dz / len;
      const inBeam = (x: number, z: number, r: number) => {
        const along = (x - l.x) * ux + (z - l.z) * uz;
        return along >= 0 && along <= len && Math.abs((x - l.x) * uz - (z - l.z) * ux) < 1.0 + r;
      };
      for (const p of this.players) {
        if (p.slip > 0 && !p.down && inBeam(p.slipX, this.scroll + p.slipZ, p.stats.core)) this.perfectDash(p);
        if (inBeam(p.x, p.z, p.stats.core)) {
          if (p.parryT > 0) this.parryLaser(p, l, owner);
          else this.hurt(p, p.x, p.z, 'laser');
        }
      }
    }
  }

  private updatePickups(dz: number) {
    for (const k of this.pickups) {
      k.t += DT;
      if (k.kind === 'ring') {
        // rings stand in the world: they don't drift with the screen
        if (k.z > this.bottom + 4) k.dead = true;
        continue;
      }
      k.vx *= 0.92;
      k.vz *= 0.92;
      // pulled in by the nearest magnet in reach (everything, once the level's done)
      let pulled = false;
      for (const p of this.players) {
        if (p.down) continue;
        const dx = p.x - k.x;
        const dz2 = p.z - k.z;
        const d = Math.hypot(dx, dz2);
        const reach = k.kind === 'scrap' ? p.stats.magnet : 3;
        if (d < reach || k.t > 60) {
          const pull = 70 / Math.max(d, 1);
          k.vx += (dx / Math.max(d, 0.01)) * pull * DT * 9;
          k.vz += (dz2 / Math.max(d, 0.01)) * pull * DT * 9;
          pulled = true;
          break;
        }
      }
      if (!pulled) k.z -= dz * 0.75; // drifts down the screen, slower than the land
      k.x += k.vx * DT;
      k.z += k.vz * DT;
      if (k.z > this.bottom + 3 && !pulled) k.dead = true;
    }
  }

  private updateHazards(dz: number) {
    for (const h of this.hazards) {
      h.t += DT;
      if (h.air) h.z -= dz;
      if (h.kind === 'spore_cloud') {
        h.x += Math.sin(h.t * 0.7 + h.z) * DT * 1.5;
      }
      if (h.t > h.warn + h.active) h.dead = true;
      if (h.kind === 'laser_gate') {
        if (h.z > this.bottom + 4) h.dead = true;
        continue;
      }
    }
  }

  /** Is a laser gate on right now? */
  gateOn(h: Hazard) {
    return h.t % h.period > h.period * 0.45;
  }

  private collide() {
    for (const p of this.players) {
      if (p.down) continue;
      const core = p.stats.core;
      this.auxBullets(p);
      // enemy bullets: hit, or graze
      for (const b of this.bullets) {
        if (b.dead) continue;
        const d2 = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
        const hitR = core + b.r;
        // in a dash's opening slip, a bullet that would have hit where you were (give or take) is a perfect
        if (p.slip > 0 && (b.x - p.slipX) ** 2 + (b.z - this.scroll - p.slipZ) ** 2 < (hitR + 0.3) ** 2) this.perfectDash(p);
        if (b.dead) continue;
        if (d2 < hitR * hitR) {
          if (this.hurt(p, b.x, b.z)) b.dead = true;
        } else if (!(b.grazed & (1 << p.id)) && d2 < (hitR + 1.5) ** 2 && p.inv <= 0) {
          b.grazed |= 1 << p.id;
          p.grazes++;
          p.charge = Math.min(1, p.charge + 0.018 * p.stats.graze * p.stats.specialRate);
          // Static Skin: a graze brings the shield nearer
          p.shieldWait += p.stats.skin * 0.15;
          p.burn = Math.min(1, p.burn + BURN_GRAZE);
          this.score += 5 * (1 + this.combo);
          this.emit({ type: 'graze', id: p.id, x: (b.x + p.x) / 2, z: (b.z + p.z) / 2 });
        }
      }
      // ramming
      for (const e of this.enemies) {
        // (anything left reeling after its attack is there to be punished, not to punish)
        if (e.dead || e.ground || e.state === 'hidden' || winded(e)) continue;
        const r = e.r * 0.75 + core;
        if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) {
          // a Ram Prow dashing through: the dash does the hitting (see ramAlong)
          if (p.dashT > 0 && p.stats.mod.ram > 0) continue;
          if (this.hurt(p, p.x, p.z, 'ram:' + e.arch)) this.damage(e, e.arch === 'swarm' ? 999 : 20, p.id, false);
        }
      }
      // the land and what stands on it: hit it, or skim it
      p.skim = 0;
      if (p.phase <= 0 && !this.collideLand(p)) this.skimLand(p);
      // hazards
      for (const h of this.hazards) {
        if (h.t < h.warn) continue;
        if (h.kind === 'laser_gate') {
          if (this.gateOn(h) && Math.abs(p.z - h.z) < 0.8) this.hurt(p, p.x, p.z, h.kind);
          continue;
        }
        if ((h.x - p.x) ** 2 + (h.z - p.z) ** 2 < (h.r + core) ** 2) {
          if (h.kind === 'spore_cloud') p.slow = 0.3;
          else this.hurt(p, p.x, p.z, h.kind);
        }
      }
      // pickups
      for (const k of this.pickups) {
        if (k.dead) continue;
        if (k.kind === 'ring') {
          if (k.done! & (1 << p.id)) continue;
          if (Math.abs(k.z - p.z) < 1 && Math.abs(k.x - p.x) < 2.6) {
            k.done = (k.done ?? 0) | (1 << p.id);
            const v = k.value;
            this.scrap += v;
            this.combo++;
            this.comboT = 3;
            p.charge = Math.min(1, p.charge + 0.06);
            p.burn = Math.min(1, p.burn + BURN_RING);
            this.emit({ type: 'pickup', id: p.id, kind: 'ring', x: k.x, z: k.z, value: v });
          }
          continue;
        }
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 1.6 * 1.6) {
          k.dead = true;
          const v = k.value;
          if (k.kind === 'scrap') this.scrap += v;
          else if (k.kind === 'repair') p.hp = Math.min(p.stats.hp, p.hp + 1);
          else if (k.kind === 'part') this.loot[p.id].push(k.part!);
          this.emit({ type: 'pickup', id: p.id, kind: k.kind, x: k.x, z: k.z, value: v, part: k.part });
        }
      }
    }
    // player shots against enemies
    for (const s of this.shots) {
      if (s.dead) continue;
      if (s.kind === 'flame') {
        // plasma burns away enemy bullets it touches
        for (const b of this.bullets) if (!b.dead && (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 1) this.cancel(b);
      }
      for (const e of this.enemies) {
        if (e.dead || e.shielded) continue;
        if (s.hit.includes(e.id)) continue;
        const r = e.r + s.r;
        if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 > r * r) continue;
        if (s.kind === 'mine') {
          s.t = s.life + 1; // goes off next update
          continue;
        }
        // shields and reflectors first: a stopped shot stops here
        const m = foeShot(this, e, s);
        if (m <= 0) {
          s.dead = true;
          break;
        }
        let dmg = s.dmg * m;
        let crit = !!s.crit;
        if (e.boss) {
          for (const w of e.boss.weak)
            if ((e.x + w.x - s.x) ** 2 + (e.z + w.z - s.z) ** 2 < 2.2 * 2.2) {
              dmg *= 2;
              crit = true;
            }
        }
        this.damage(e, dmg, s.owner, crit, null, s);
        s.hit.push(e.id);
        if (s.kind === 'missile') this.blast(s.x, s.z, 1.8, s.dmg * 0.4, s.owner);
        if (s.pierce > 0) s.pierce--;
        else {
          s.dead = true;
          if (s.kind === 'flak') s.t = s.life + 1;
          break;
        }
      }
    }
  }

  // --- the kit: dash mods, the aux, passives ----------------------------------------------

  /** What the parts on the ship do every frame: the aux, the tether's reel, rams, crits, the echo. */
  private updateKit(p: Player, i: Intent) {
    const s = p.stats;
    if (p.crit > 0 && (p.crit -= DT) <= 0) this.emit({ type: 'crit', id: p.id, on: false });
    if (p.echoT > 0 && (p.echoT -= DT) <= 0 && s.special) this.special(p, s.special, s.echo);
    // Ram Prow: everything the dash went through this frame
    if (p.dashT > 0 && s.mod.ram > 0) this.ramAlong(p, p.x - p.vx * DT, p.z - p.vz * DT, p.x, p.z);
    // the Void Siphon is heavy going
    if (p.auxT > 0 && s.aux === 'siphon') {
      p.x -= p.vx * DT * SIPHON_SLOW;
      p.z -= p.vz * DT * SIPHON_SLOW;
    }
    // the tether reels you in: untouchable, and a hit on arrival
    const hooked = p.hook ? this.enemies.find((e) => e.id === p.hook && !e.dead) : undefined;
    if (p.hook && !hooked) {
      p.hook = 0;
      p.auxT = 0;
      this.auxEnd(p, true);
    } else if (hooked) {
      const dx = hooked.x - p.x;
      const dz = hooked.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      p.vx = (dx / d) * REEL;
      p.vz = (dz / d) * REEL;
      p.x = clamp(p.x + p.vx * DT, -HALF_W + 1.2, HALF_W - 1.2);
      p.z = clamp(p.z + p.vz * DT, this.top + 3, this.bottom - 2);
      p.inv = Math.max(p.inv, DT * 2);
      if (d < hooked.r + 1.4) {
        this.damage(hooked, TETHER_HIT * s.auxStr, p.id, false);
        hooked.stun = Math.max(hooked.stun, 0.8);
        this.emit({ type: 'reeled', id: p.id, x: hooked.x, z: hooked.z, enemy: hooked.id, kill: hooked.dead });
        p.hook = 0;
        p.auxT = 0;
        p.inv = Math.max(p.inv, 0.3);
        p.vx *= -0.3;
        p.vz = Math.abs(p.vz) * 0.3 + 4;
        this.auxEnd(p, hooked.dead);
      }
    }
    this.updateAux(p, i);
  }

  /** The aux button, and its timers. */
  private updateAux(p: Player, i: Intent) {
    const s = p.stats;
    if (p.auxCd > 0 && (p.auxCd -= DT) <= 0 && s.aux) this.emit({ type: 'auxReady', id: p.id });
    p.parryT = Math.max(0, p.parryT - DT);
    if (p.auxT > 0 && (p.auxT -= DT) <= 0) this.auxEnd(p);
    if (!i.aux || !s.aux || p.auxCd > 0 || p.auxT > 0 || this.state === 'clear' || this.state === 'failed') return;
    p.auxUses++;
    this.emit({ type: 'aux', id: p.id, kind: s.aux, x: p.x, z: p.z });
    if (s.aux === 'parry') {
      p.auxT = PARRY_BURST;
      p.parryT = PARRY_WINDOW;
      p.parried = 0;
      p.blocked = 0;
      p.inv = Math.max(p.inv, PARRY_WINDOW);
    } else if (s.aux === 'siphon') {
      p.auxT = SIPHON_TIME;
    } else if (s.aux === 'flare') {
      // thrown the way you're pushing (ahead if you're not)
      const dl = Math.hypot(i.x, i.y);
      const fx = dl > 0.2 ? i.x / dl : 0;
      const fz = dl > 0.2 ? -i.y / dl : -1;
      this.decoy(p, 'flare', clamp(p.x + fx * 7, -HALF_W + 2, HALF_W - 2), clamp(p.z + fz * 7, this.top + 3, this.bottom - 3), FLARE_LIFE, FLARE_DMG * s.auxStr);
      this.auxEnd(p);
    } else if (s.aux === 'tether') {
      // the nearest enemy ahead, in a cone
      const range = TETHER_RANGE * (0.75 + 0.25 * s.auxStr);
      let best: Enemy | undefined;
      let bd = range * range;
      for (const e of this.enemies) {
        if (e.dead || e.shielded || e.t < 0 || !this.onScreen(e.x, e.z, -1)) continue;
        const dx = e.x - p.x;
        const dz = e.z - p.z;
        const d = dx * dx + dz * dz;
        if (dz > 0 || Math.abs(Math.atan2(dx, -dz)) > 0.8 || d > bd) continue;
        bd = d;
        best = e;
      }
      this.emit({ type: 'hook', id: p.id, x: p.x, z: p.z, x2: best?.x ?? p.x, z2: best?.z ?? p.z - range, enemy: best?.id ?? 0 });
      if (best) {
        p.hook = best.id;
        p.auxT = TETHER_TIME;
      } else this.setAuxCd(p, CD_MISS);
    }
  }

  /** The aux has done its thing: how long until it can go again. */
  private auxEnd(p: Player, kill = false) {
    const a = p.stats.aux;
    if (a === 'parry') this.setAuxCd(p, p.parried ? CD_PARRY : p.blocked ? CD_BLOCK : CD_WHIFF);
    else if (a === 'siphon') this.setAuxCd(p, CD_SIPHON);
    else if (a === 'flare') this.setAuxCd(p, CD_FLARE);
    else if (a === 'tether') {
      p.hook = 0;
      this.setAuxCd(p, kill ? CD_PARRY : CD_TETHER);
    }
  }

  /** A clashing aux takes longer to come back. */
  private setAuxCd(p: Player, t: number) {
    p.auxCd = p.auxMax = t / clamp(p.stats.auxStr, 0.5, 1);
  }

  /** The aux against enemy fire (before the bullets can hit): parry, block, or drink it. */
  private auxBullets(p: Player) {
    const s = p.stats;
    if (p.auxT <= 0 || p.down) return;
    if (s.aux === 'parry') {
      let parried = 0;
      let blocked = 0;
      for (const b of this.bullets) {
        if (b.dead) continue;
        const d2 = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
        if (p.parryT > 0 && d2 < PARRY_R * PARRY_R) {
          // thrown straight back where it came from, as yours
          b.dead = true;
          parried++;
          const dir = Math.atan2(-b.vx, b.vz);
          const dmg = PARRY_DMG * s.auxStr * (1 + p.burn);
          for (let k = 0; k < (s.mirror ? 2 : 1); k++) this.addShot(p.id, 'slug', b.x, b.z, dir + k * 0.15, 55, dmg, 1, 0, 1).tag = 'reflect';
        } else if (p.parryT <= 0 && d2 < BLOCK_R * BLOCK_R) {
          this.cancel(b, 0);
          p.blocked++;
          blocked++;
          if (s.mirror) this.mirror(p, b.x, b.z, s.mirror);
          if (p.blocked >= BLOCK_MAX) {
            // the block gives out
            p.auxT = 0;
            this.auxEnd(p);
            break;
          }
        }
      }
      if (parried) {
        if (!p.parried) {
          // the first of a burst: the reward for the timing
          p.burn = Math.min(1, p.burn + PARRY_BURN);
          p.charge = Math.min(1, p.charge + PARRY_CHARGE);
          p.inv = Math.max(p.inv, 0.35);
        }
        // and every bullet thrown back feeds the special
        p.charge = Math.min(1, p.charge + PARRY_CHARGE_EACH * parried);
        p.parried += parried;
        p.parries += parried;
        this.emit({ type: 'parry', id: p.id, x: p.x, z: p.z, count: parried });
      }
      if (blocked) this.emit({ type: 'block', id: p.id, x: p.x, z: p.z, count: blocked });
    } else if (s.aux === 'siphon') {
      // linked, every four it drinks is a shield; clashing, every twelve
      const per = Math.round(SIPHON_PER / Math.max(0.5, s.auxStr));
      for (const b of this.bullets) {
        if (b.dead) continue;
        const dx = p.x - b.x;
        const dz = p.z - b.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < SIPHON_EAT) {
          this.cancel(b, 0);
          p.eaten++;
          p.charge = Math.min(1, p.charge + 0.01);
          this.emit({ type: 'eat', id: p.id, x: b.x, z: b.z });
          if (p.eaten >= per) {
            p.eaten = 0;
            this.gainShield(p, 'siphon');
          }
        } else if (d < SIPHON_R) {
          b.vx = b.vx * 0.95 + (dx / d) * SIPHON_PULL * DT;
          b.vz = b.vz * 0.95 + (dz / d) * SIPHON_PULL * DT;
        }
      }
    }
  }

  /** A laser met in the parry window: cut off, and its owner hurt. */
  private parryLaser(p: Player, l: Level['lasers'][number], owner: Enemy) {
    l.on = 0;
    this.damage(owner, PARRY_LASER * p.stats.auxStr, p.id, true);
    if (!p.parried) p.burn = Math.min(1, p.burn + PARRY_BURN);
    p.parried++;
    p.parries++;
    this.emit({ type: 'parry', id: p.id, x: p.x, z: p.z, count: 1 });
  }

  /** A shield from a part, one over the top at most. */
  private gainShield(p: Player, source: 'exchanger' | 'siphon' | 'skin') {
    if (p.shield >= p.stats.shield + 1) return;
    p.shield++;
    this.emit({ type: 'shieldGain', id: p.id, source });
  }

  /** Reflector Plate: a stopped bullet thrown back as shots, at the nearest enemy. */
  private mirror(p: Player, x: number, z: number, n: number) {
    const e = this.autoTarget(x, z, 40);
    const a = e ? Math.atan2(e.x - x, -(e.z - z)) : 0;
    for (let k = 0; k < n; k++) this.addShot(p.id, 'slug', x, z, a + (k - (n - 1) / 2) * 0.2, 50, MIRROR_DMG, 0.9, 0, 0.5).tag = 'mirror';
  }

  /** The nearest enemy that can be shot, within reach (sentries, reflections). */
  private autoTarget(x: number, z: number, reach = SENTRY_RANGE) {
    let best: Enemy | undefined;
    let bd = reach * reach;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.t < 0 || !this.onScreen(e.x, e.z, -1)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** A gun's damage now: Burn Engine, the lance's speed, Hair Trigger's crits. */
  private gunDamage(p: Player, g: Gun) {
    let dmg = g.spec.damage * (1 + p.stats.gamble * p.burn);
    if (g.spec.speedy) dmg *= (1 + p.boosting) * (p.skim > 0 ? 1.5 : 1);
    const crit = g.crit > 0 && p.crit > 0;
    return { dmg: crit ? dmg * 2 : dmg, crit };
  }

  /** The dash just began: what the dash mods add. */
  private dashMods(p: Player) {
    const s = p.stats;
    const m = s.mod;
    p.rammed = [];
    const x0 = p.x;
    const z0 = p.z;
    if (m.blink > 0) this.blink(p);
    // where it ends up (for mines along the way)
    const x1 = m.blink > 0 ? p.x : x0 + p.dashX * DASH_SPEED * DASH_TIME;
    const z1 = m.blink > 0 ? p.z : z0 + p.dashZ * DASH_SPEED * DASH_TIME;
    for (let k = 0; k < m.mines; k++) {
      const t = (k + 0.5) / m.mines;
      this.addShot(p.id, 'mine', lerp(x0, x1, t), lerp(z0, z1, t), 0, 0, WAKE_DMG, WAKE_LIFE, 0, 0).tag = 'wake';
    }
    if (m.ghost > 0) this.decoy(p, 'ghost', x0, z0, GHOST_LIFE, m.ghost);
  }

  /** Blink Coil: the dash is a jump, stopping short of the land. */
  private blink(p: Player) {
    const x0 = p.x;
    const z0 = p.z;
    const clear = (x: number, z: number) => !this.terrain.solid(x, z) && ![...this.terrain.colliders(x, z, 3)].some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.8) ** 2);
    let x = x0;
    let z = z0;
    for (let d = p.stats.mod.blink; d > 0; d -= 0.5) {
      const tx = clamp(x0 + p.dashX * d, -HALF_W + 1.2, HALF_W - 1.2);
      const tz = clamp(z0 + p.dashZ * d, this.top + 3, this.bottom - 2);
      if (clear(tx, tz)) {
        x = tx;
        z = tz;
        break;
      }
    }
    p.x = x;
    p.z = z;
    p.dashT = DT * 2;
    this.emit({ type: 'blink', id: p.id, x: x0, z: z0, x2: x, z2: z });
    if (p.stats.mod.ram > 0) this.ramAlong(p, x0, z0, x, z);
  }

  /** Ram Prow: a hit on everything along a bit of the dash (once each a dash). */
  private ramAlong(p: Player, x0: number, z0: number, x1: number, z1: number) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l2 = dx * dx + dz * dz || 1;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.ground || e.t < 0 || p.rammed.includes(e.id)) continue;
      const t = clamp(((e.x - x0) * dx + (e.z - z0) * dz) / l2, 0, 1);
      if ((x0 + dx * t - e.x) ** 2 + (z0 + dz * t - e.z) ** 2 > (e.r + p.stats.core + 0.6) ** 2) continue;
      p.rammed.push(e.id);
      this.emit({ type: 'ram', id: p.id, x: e.x, z: e.z, enemy: e.id });
      e.stun = Math.max(e.stun, 0.3);
      this.damage(e, p.stats.mod.ram * (p.perfect ? 1.5 : 1), p.id, p.perfect);
    }
  }

  private decoy(p: Player, kind: Decoy['kind'], x: number, z: number, life: number, power: number) {
    this.decoys.push({ kind, owner: p.id, x, z, t: 0, life, r: kind === 'ghost' ? GHOST_R : 1.2, power, tick: 0, dead: false });
    this.emit({ type: 'decoy', id: p.id, kind, x, z });
  }

  /** Flares drift down the screen and burst; afterimages hold still on it and burn. */
  private updateDecoys(dz: number) {
    for (const d of this.decoys) {
      d.t += DT;
      d.z -= dz * (d.kind === 'flare' ? 0.6 : 1);
      if (d.kind === 'ghost' && (d.tick -= DT) <= 0) {
        d.tick = 0.1;
        for (const e of this.enemies) if (!e.dead && (e.x - d.x) ** 2 + (e.z - d.z) ** 2 < (e.r + d.r) ** 2) this.damage(e, d.power * 0.1, d.owner, false);
      }
      if (d.t >= d.life) {
        d.dead = true;
        if (d.kind === 'flare') this.blast(d.x, d.z, FLARE_R, d.power, d.owner);
      }
    }
    sweep(this.decoys);
  }

  /** A dash through fire, timed right: what would have hit you is soaked up, and the dash given back. */
  perfectDash(p: Player) {
    let absorbed = 0;
    const gz = this.scroll + p.slipZ;
    const near = (b: Bullet) => Math.min((b.x - p.x) ** 2 + (b.z - p.z) ** 2, (b.x - p.slipX) ** 2 + (b.z - gz) ** 2) < PERFECT_R * PERFECT_R;
    for (const b of this.bullets)
      if (!b.dead && near(b)) {
        this.cancel(b, 0.6);
        absorbed++;
      }
    if (p.perfect) return;
    p.perfect = true;
    p.perfects++;
    p.dashes = Math.min(p.stats.dashes, p.dashes + 1);
    // Kick Spring gives them all back and skips the recovery; Hair Trigger wakes the crits;
    // Recoil Battery fires a volley; the afterimage burns hotter
    if (p.stats.mod.refill) {
      p.dashes = p.stats.dashes;
      p.dashLock = Math.min(p.dashLock, p.dashT);
    }
    p.stats.guns.forEach((g) => {
      if (g.volley > 0 && g.spec.shot !== 'beam') this.fire(p, g, p.x + g.x, p.z + g.z, g.dir, 0, g.volley);
    });
    for (const d of this.decoys) if (d.kind === 'ghost' && d.owner === p.id && d.t < SLIP + DT) d.power *= 2;
    if (p.stats.crit > 0) {
      if (p.crit <= 0) this.emit({ type: 'crit', id: p.id, on: true });
      p.crit = p.stats.crit;
    }
    p.burn = Math.min(1, p.burn + BURN_PERFECT);
    this.emit({ type: 'perfect', id: p.id, x: p.x, z: p.z, absorbed });
  }

  /** Flying a hair from the land or an obstacle without touching it: Burn. */
  private skimLand(p: Player) {
    const t = this.terrain;
    let gap = SKIM;
    let nx = 0;
    let nz = 0;
    for (const c of t.colliders(p.x, p.z, 3 + SKIM)) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      const g = d - c.r - 0.7; // 0.7: where collideLand says you've touched
      if (g < gap) {
        gap = Math.max(0, g);
        nx = c.x + (dx / d) * c.r;
        nz = c.z + (dz / d) * c.r;
      }
    }
    // the land itself (canyon walls): look round at the edge of reach first, closer in if it's there
    const solidAt = (r: number) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (t.solid(x, z)) return { x, z };
      }
      return null;
    };
    if (solidAt(SKIM)) {
      for (const r of [0.4, 0.8, 1.2, SKIM]) {
        const hit = r - 0.2 < gap ? solidAt(r) : null;
        if (hit) {
          gap = r - 0.2;
          nx = hit.x;
          nz = hit.z;
          break;
        }
      }
    }
    if (gap >= SKIM) return;
    const close = 1 - gap / SKIM;
    p.skim = close;
    p.skimTime += DT;
    p.burn = Math.min(1, p.burn + BURN_SKIM * close * DT);
    p.skimT -= DT;
    if (p.skimT <= 0) {
      p.skimT = 0.1;
      this.emit({ type: 'skim', id: p.id, x: nx, z: nz, close });
    }
  }

  /** Into the land or an obstacle: pushed off it, and a hit. Returns whether it touched. */
  private collideLand(p: Player): boolean {
    const t = this.terrain;
    let push: { x: number; z: number } | null = null;
    if (t.solid(p.x, p.z)) {
      // out the way the ground falls away
      const e = 0.8;
      const gx = t.height(p.x + e, p.z) - t.height(p.x - e, p.z);
      const gz = t.height(p.x, p.z + e) - t.height(p.x, p.z - e);
      const g = Math.hypot(gx, gz) || 1;
      push = { x: -gx / g, z: -gz / g };
      if (t.biome(p.z).shape === 'canyon') {
        const dx = t.pathX(p.z) - p.x;
        push = { x: Math.sign(dx) || 1, z: 0.3 };
      }
    } else {
      for (const c of t.colliders(p.x, p.z, 3)) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d < c.r + 0.7) {
          push = { x: dx / (d || 1), z: dz / (d || 1) };
          break;
        }
      }
    }
    if (!push) return false;
    p.vx = push.x * 22;
    p.vz = push.z * 22 + 4;
    p.x += push.x * 0.5;
    p.z += push.z * 0.5;
    if (p.inv <= 0) {
      p.crashes++;
      this.emit({ type: 'crash', id: p.id, x: p.x, z: p.z });
      // a crash costs momentum: some Burn, and on a race your speed
      p.burn = Math.max(0, p.burn - BURN_CRASH);
      if (this.race) this.speedNow = Math.min(this.speedNow, Math.max(this.speed, this.speedNow * CRASH_SLOW));
    }
    this.hurt(p, p.x, p.z, 'land');
    return true;
  }

  /** A hazard (geyser, rockfall, lightning…) at (x, z) on the flight plane. */
  hazard(kind: HazardKind, x: number, z: number, opts: Partial<Hazard> = {}) {
    const h: Hazard = { kind, x, z, r: 1.8, t: 0, warn: 1.2, active: 1, period: 2.4, dead: false, air: false, ...opts };
    this.hazards.push(h);
    this.emit({ type: 'hazard', kind, x, z });
    return h;
  }

  /** Ground at (x, z) as it shows on the flight plane: for placing turrets. */
  groundToFlight(x: number, zGround: number) {
    const h = Math.max(this.terrain.height(x, zGround), this.terrain.water(zGround));
    return { z: toFlight(zGround, h), y: h };
  }

  lerpScreen(t: number) {
    return lerp(this.top, this.bottom, t);
  }
}

// The kit (dash mods, aux, passives): the numbers.
/** Parry Emitter: the burst, its parry window at the start, how far each reaches, what a block can take. */
const PARRY_BURST = 0.35;
const PARRY_WINDOW = 0.1;
const PARRY_R = 2.4;
const BLOCK_R = 1.9;
const BLOCK_MAX = 3;
/** A parried bullet's damage (more with Burn), a parried laser's, the Burn a parry earns. */
const PARRY_DMG = 14;
const PARRY_LASER = 25;
const PARRY_BURN = 0.2;
/** Special charge for a parry, and for each bullet in it. */
const PARRY_CHARGE = 0.08;
const PARRY_CHARGE_EACH = 0.03;
/** The wait after: a parry (or a tether kill), a block, a whiff. */
const CD_PARRY = 0.2;
const CD_BLOCK = 1;
const CD_WHIFF = 1.5;
/** Grapple Tether: reach, reel speed, the hit on arrival, how long it can reel, the waits. */
const TETHER_RANGE = 24;
const REEL = 75;
const TETHER_HIT = 24;
const TETHER_TIME = 0.6;
const CD_TETHER = 3;
const CD_MISS = 0.6;
/** Decoy Flare, and how far away aimed fire notices a decoy. */
const FLARE_LIFE = 2.5;
const FLARE_DMG = 24;
const FLARE_R = 4.5;
const CD_FLARE = 6;
const DECOY_REACH = 45;
/** Void Siphon: how long, its pull and reach, the mouth, bullets per shield, the slowdown, the wait. */
const SIPHON_TIME = 1.5;
const SIPHON_R = 10;
const SIPHON_PULL = 90;
const SIPHON_EAT = 1.6;
const SIPHON_PER = 6;
const SIPHON_SLOW = 0.3;
const CD_SIPHON = 7;
/** Dash mods: afterimage life and size, wake mines. Passives: echo delay, reflector shots, sentry reach. */
const GHOST_LIFE = 1.2;
const GHOST_R = 2.5;
const WAKE_DMG = 14;
const WAKE_LIFE = 3.5;
const ECHO_DELAY = 1;
const MIRROR_DMG = 8;
const SENTRY_RANGE = 30;

function sweep<T extends { dead: boolean }>(xs: T[]) {
  let j = 0;
  for (let i = 0; i < xs.length; i++) if (!xs[i].dead) xs[j++] = xs[i];
  xs.length = j;
}

const HP: Record<Archetype | 'boss', number> = {
  dart: 10,
  swarm: 3,
  gunship: 60,
  turret: 34,
  bomber: 75,
  lancer: 45,
  brute: 220,
  serpent: 26,
  carrier: 260,
  boss: 2600,
};
const SCORE: Record<Archetype | 'boss', number> = {
  dart: 100,
  swarm: 40,
  gunship: 400,
  turret: 250,
  bomber: 500,
  lancer: 400,
  brute: 1500,
  serpent: 120,
  carrier: 2000,
  boss: 20000,
};
const SCRAP: Record<Archetype | 'boss', number> = {
  dart: 1,
  swarm: 0,
  gunship: 4,
  turret: 3,
  bomber: 5,
  lancer: 4,
  brute: 12,
  serpent: 1,
  carrier: 14,
  boss: 60,
};
