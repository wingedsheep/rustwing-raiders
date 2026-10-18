/**
 * One level: the land scrolling by, one or two ships, everything shooting at them, and what they
 * pick up. `step(intents)` advances it one 60th of a second. It knows nothing of three.js; what
 * the view needs to make a fuss about (a hit, an explosion, a graze) goes into `events`, which the
 * view empties each frame.
 */

import type { Archetype, Biome, EnemySkin, Planet } from '../world/planets';
import { DT, FLIGHT_Y, HALF_H, HALF_W, NEUTRAL, toFlight, type Intent } from './types';
import { Terrain } from './terrain';
import { stats, type Build, type Gun, type Stats } from './build';
import { rng, type Rng, clamp, damp, lerp } from '../util';
import { Director } from './director';
import { updateEnemy, enemyRadius, type EnemyData } from './enemies';
import type { BossState, BossStyle } from './boss';
import { foeDefaults, foeHurt, winded, foeShot, foeTaken, killHow, onKill, tickCombat, type FoeEvent, type FoeFields } from './combat';
import { FOES, factionOf, isFoe, type Faction, type Foe } from './factions';
import { updateStrikes, type Strike } from './strikes';
import type { AuxKind } from '../game/parts';
import { BARRIER_H, fly, PAD_L, PAD_W, WALL_R, type Wall } from './course';
import { makeRivals, updateRivals, type Rival } from './rivals';

export type Mode = 'raid' | 'run' | 'hunt' | 'boss';

// Racing, boosting, and what doing it well pays: the numbers the feel hangs on.
/**
 * Races: you and three rivals across the planet, through gates, round the course's bends (see
 * course.ts, rivals.ts). The camera follows the leader, so you never have to fly up the screen to go
 * faster: the stick steers the nose (left, right) and works the throttle (up, down), and the ship
 * goes where its momentum takes it. Grip turns its way round after the nose, but only so hard
 * (GRIP_A across, less on a boost): the faster you go the wider you turn, and a bend too tight for
 * your speed carries you wide, nose turned in, scrubbing speed, off the track and into whatever
 * lines it. Then there's the drift (fire, steering into the bend): the nose kicked in, the ship
 * sliding round on a tighter line than grip alone holds (DRIFT_A), the stick setting how tight; held,
 * it charges a turbo (three tiers, quicker held tight), let go and it fires. So the tight bends
 * flat out are drifted, the gentle ones steered, and a boost into a bend takes both.
 */
const RACE_CRUISE = 38;
const RACE_TOP = 55;
const RACE_BRAKE_TO = 18;
/** Throttle and brakes (units/s²): up to speed, and down from it. */
const RACE_ACCEL = 28;
const RACE_DECEL = 44;
/** What a boost, a surge (pad, launch, drift turbo) and a rival's wake add to the top speed. */
const BOOST_TOP = 20;
const SURGE_TOP = 17;
const DRAFT_TOP = 6;
/** Off the track (rough going, on the ground): the top speed's this share of what it was. */
const ROUGH = 0.62;
/** Steering: the nose's turn rate at full stick (rad/s), and how quickly it gets there. */
const STEER = 2.7;
const YAW_EASE = 9;
/** Grip: the hardest the ship's way turns (units/s² across it), steered and drifting; boosting, this share of it. */
export const GRIP_A = 40;
export const DRIFT_A = 68;
const GRIP_BOOST = 0.85;
/** How fast the way swings round to the nose, as far as grip allows (per second). */
const GRIP_RATE = 7;
/** Steered past what grip holds, the nose leads the way by up to this (rad): understeer, scrubbing speed (units/s² a radian past SCRUB_FREE). */
const SLIP_MAX = 0.5;
const SCRUB = 22;
const SCRUB_FREE = 0.12;
/** Left alone, the nose swings round to where the ship's going. */
const ALIGN = 1.8;
/** The nose never turns further than this from the course's way (rad). */
const HD_MAX = 1.25;
/**
 * The drift: the nose kicked in this far past the way (rad, a little more held tight); how tight it
 * turns pushed out (a share of DRIFT_A; held in, all of it); the speed it bleeds (units/s²). The
 * handbrake without a turn is a brake. Held this long it's each turbo tier (quicker held tight); the
 * surge each fires (seconds).
 */
const DRIFT_ANGLE = 0.42;
export const DRIFT_WIDE = 0.35;
const DRIFT_BLEED = 5;
const HANDBRAKE = 14;
const DRIFT_START = 24;
export const DRIFT_TIERS = [0.6, 1.3, 2.2];
const DRIFT_SURGE = [0.5, 0.9, 1.4];
/** A dash on a race: a sideways jink (units/s across the nose). */
const JINK = 30;
/** In the air: grip and steering this much of what they are on the ground; air longer than AIR_MIN landed square, a surge and Burn (a second's worth). */
const AIR_GRIP = 0.2;
const AIR_STEER = 0.5;
const AIR_MIN = 0.35;
const AIR_SURGE = 0.6;
const BURN_AIR = 0.12;
/** A boost pad's surge (seconds). */
const PAD_TIME = 1.1;
/** The camera keeps the leader this far below the middle of the screen, always. */
const RACE_ANCHOR = 9;
/** Into a wall faster than this (units/s, square on) is a crash; slower, a scrape that bleeds speed this fast (a share a second). */
const WALL_WRECK = 30;
const SCRAPE = 0.9;
/** Skimming a wall (within this of it, at speed, not touching) charges Burn this fast at the closest. */
const SKIM_WALL = 2.6;
const BURN_WALL = 0.16;
/**
 * Races: the Burn is the boost's tank. Boosting spends it this fast; it refills on its own this fast
 * off the boost, and quicker flying close (a shave, a gap, a wake: Burn earned). Run dry, the boost
 * cuts out till the tank's back over BURN_AGAIN (no flickering on fumes).
 */
const BURN_REGEN = 0.07;
const BURN_DRAIN_RACE = 0.3;
const BURN_THREAD = 0.07;
const BURN_AGAIN = 0.15;
/** Past a rock with less than this between you (units) is a close shave: Burn for nerve. */
const SHAVE = 1.4;
/** A crash keeps this share of your speed; after it the engine won't pull for a moment. */
const CRASH_KEEP = 0.35;
/** Into a rock or a tree faster than this (units/s, square on) is a wreck; slower, a glance. */
const GLANCE = 16;
/** Into something slower than this (units/s) is a nudge, not a crash. */
const WRECK_SLOW = 20;
/** A wreck puts you out of it this long (seconds), smoking where you hit; then you're back on the track, untouchable a moment. */
const WRECK_TIME = 2.6;
const BACK_SAFE = 1.4;
/** The countdown; a launch pressed this close to GO (before, after) is perfect; held longer before it floods. */
const COUNTDOWN = 3;
const LAUNCH_BEFORE = 0.25;
const LAUNCH_AFTER = 0.15;
const LAUNCH_EARLY = 0.6;
const LAUNCH_SURGE = 1.4;
const FLOODED = 0.7;
/** Speed tiers: the leader past these speeds (units/s) shows and sounds; it drops back a little below. */
export const TIERS = [52, 64, 75];
/** The finishing places' purse (shares of PLACE_SCRAP), first to last. */
const PLACE_PAY = [1, 0.55, 0.25, 0];
const PLACE_SCRAP = 90;
/** Par pace on a race: about this times the cruise. */
const PAR_PACE = 1.44;
/** Co-op: a ship left at the bottom edge is pushed along, and the clock charged this much per second of it. */
const TOW_PENALTY = 0.5;
/** Inside a shortcut, the slipstream: the ship this much faster, free, and it refuels (Burn a second): the hard line pays twice. */
const SLIPSTREAM = 1.4;
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
const PAR_SCRAP = 60;
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
  /** Races: seconds of surge left (a pad, a perfect launch, a drift turbo): a higher top speed. */
  surge: number;
  /** Races: which way the nose points (rad from the course's way, + right), and how fast it's turning. */
  hd: number;
  yaw: number;
  /** Races: how sideways the ship is sliding (rad, + its slide to the right of the nose); the handbrake held. */
  slide: number;
  handbrake: boolean;
  /** Races: seconds drifting (the turbo charging, quicker held tight), the turbo tier it's reached. */
  driftT: number;
  driftTier: number;
  /** Races: which way it's drifting (+1 right, 0 not). */
  driftDir: number;
  /** Races: out of it after a wreck (for `wreck` seconds). */
  out: boolean;
  /** Races: the tank's run dry (no boost till it's back over BURN_AGAIN). */
  dry: boolean;
  /** Races: speed along the nose (units/s), and down the course (units of z a second). */
  fwd: number;
  pace: number;
  /** Races: seconds against a wall (0 off it); how close it's skimming one (0..1); the closest it's come to a rock lately (for a close shave). */
  wallT: number;
  wallNear: number;
  shaveGap: number;
  /** Races: for the report: wall scrapes, close shaves, drift turbos fired. */
  scrapes: number;
  shaves: number;
  drifts: number;
  /** Races: gauntlet gaps threaded, for the report. */
  threads: number;
  /** Races: seconds left riding a rival's wake (refreshed while it lasts). */
  draft: number;
  /** Races: seconds the engine won't pull after a crash, or after flooding the launch. */
  wreck: number;
  /** Races: when boost was last pressed (on the race clock: negative before GO), and whether the launch is settled. */
  pressAt: number;
  launched: boolean;
  /** Races: rivals passed and taken down, for the report. */
  passes: number;
  takedowns: number;
  /** Races: height over the flight height (off a ramp), how fast it's climbing, seconds in the air; jumps landed, for the report. */
  alt: number;
  vy: number;
  airT: number;
  jumps: number;
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

/** torpedo: a homing round that can be shot down (see TORPEDO). */
export type BulletKind = 'orb' | 'needle' | 'big' | 'mine' | 'spore' | 'torpedo';

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
  /** Where the first of that ring will fly (rolled at launch, so the view can show it coming). */
  splitA: number;
  /** Whose fire it is: how it's drawn (a pirate's slug, the lattice's shard, a beast's spit, a spore). */
  look: Faction;
  /** Torpedoes: the player it chases, and what it takes to shoot it down. */
  seek: number;
  /** 0..1, fixed at launch: for the view, so spins and wobbles don't line up. */
  seed: number;
  hp: number;
  dead: boolean;
}

/** Torpedoes: drift out for `launch` seconds, then light and chase (turning at `turn` rad/s, up to `speed`) until `fuel` runs out. */
export const TORPEDO = { launch: 0.45, fuel: 2.8, turn: 2.1, speed: 19, accel: 26, hp: 12, life: 5 };

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
  /** Race rings: the run they're part of, and how many rings it has. */
  run?: number;
  of?: number;
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
  | { type: 'enemyShot'; x: number; z: number; color: number; look?: Faction }
  /** A bullet cancelled (by a bomb, a perfect, a hit): it pops instead of vanishing. */
  | { type: 'bulletPop'; x: number; z: number; color: number; look: Faction }
  /** A torpedo goes off: shot down, or burnt out at the end of its run. */
  | { type: 'torpedo'; x: number; z: number; color: number; shot: boolean }
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
  /** Races: the countdown's beats (3, 2, 1), and GO. */
  | { type: 'count'; n: number }
  | { type: 'go' }
  /** Races: off the line: right on GO (`perfect`), or held too early (flooded, a slow start). */
  | { type: 'launch'; id: number; perfect: boolean; x: number; z: number }
  /** Races: over a boost pad, or through every ring of a run. */
  | { type: 'pad'; id: number; x: number; z: number }
  | { type: 'ringRun'; id: number; x: number; z: number; count: number }
  /** Races: against a wall (`side`: +1 it's to your left, you're held on its right), `hard` how fast into it; a close shave past a rock. */
  | { type: 'wall'; id: number; x: number; z: number; side: number; hard: number }
  | { type: 'shave'; id: number; x: number; z: number }
  | { type: 'thread'; id: number; x: number; z: number }
  /** Races: back on the track after a wreck. */
  | { type: 'back'; id: number; x: number; z: number }
  /** Races: a drift's turbo charged up a tier (1..3), fired on the way out of it, or lost (a crash). */
  | { type: 'driftTier'; id: number; tier: number; x: number; z: number }
  | { type: 'driftBoost'; id: number; tier: number; x: number; z: number }
  /** Races: crashed into something (a rock, a canyon wall): (nx, nz) the way it threw you. */
  | { type: 'wreck'; id: number; x: number; z: number; nx: number; nz: number; speed: number }
  /** Races: the leader's speed went up a tier (1..3), or back down. */
  | { type: 'tier'; tier: number; up: boolean }
  /** Races: into a rival's wake, or out of it. */
  | { type: 'draft'; id: number; rival: number; on: boolean }
  /** Races: you passed a rival (`place` is yours now), or one passed you. */
  | { type: 'pass'; id: number; rival: number; place: number; x: number; z: number }
  | { type: 'passed'; id: number; rival: number; place: number }
  /** Races: a rival knocked about: a bump, rammed out (a takedown), shot until it spun out. */
  | { type: 'bump'; id: number; rival: number; x: number; z: number; hard: number }
  | { type: 'takedown'; id: number; rival: number; x: number; z: number }
  | { type: 'rivalHit'; rival: number; x: number; z: number; dmg: number }
  | { type: 'spinout'; id: number; rival: number; x: number; z: number }
  /** Races: the last stretch; a rival over the line; you over it (`place`). */
  | { type: 'finalStretch' }
  | { type: 'rivalFinish'; rival: number; place: number }
  | { type: 'finish'; id: number; place: number; time: number; x: number; z: number }
  /** Races: off a ramp's lip into the air; down again after `t` seconds of it (`clean`: square, a surge for it). */
  | { type: 'air'; id: number; state: 'launch' | 'land'; t: number; clean: boolean; x: number; z: number }
  /** Races: into a barrier, under it. */
  | { type: 'barrier'; id: number; x: number; z: number }
  /** Races: into a shortcut, out of the far end (`saved`: seconds it's worth), or out the side (`fail`). */
  | { type: 'shortcut'; id: number; shortcut: number; state: 'enter' | 'exit' | 'fail'; saved: number }
  /** Every one of a wave killed: `bonus` scrap, paid at (x, z) (the last kill). */
  | { type: 'waveClear'; wave: number; bonus: number; x: number; z: number }
  /** An enemy got away (off the screen, or a bounty's time ran out). */
  | { type: 'escaped'; enemy: number; x: number; z: number }
  /** A bounty showed up, was claimed (killed: `reward` paid), or escaped. */
  | { type: 'bounty'; state: 'appear' | 'claimed' | 'escaped'; enemy: number; x: number; z: number; reward: number }
  /** On a clear: a race's time against par, or a fight's tally; the rank and the scrap it earned. */
  | { type: 'par'; time: number; par: number; rank: Rank; bonus: number; place: number }
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
  /** Races: the leader's place on the screen the camera keeps (z below the middle). */
  anchor = RACE_ANCHOR;
  /** Races: seconds to GO (0 once racing), the rivals, the speed tier, and the finishing place (0 until over the line). */
  countdown = 0;
  readonly rivals: Rival[] = [];
  tier = 0;
  place = 0;
  /** Races: par pace in units/s (for the rivals, who race to it). */
  parSpeed = 1;
  /** Races: the pads each player has used (a bit each), and the ring runs each has threaded. */
  readonly padDone = new Map<object, number>();
  /** Scratch for the walls at a z. */
  private wallList: Wall[] = [];
  /** Rings threaded per run and player (key: run × 4 + player). */
  private readonly ringsRun = new Map<number, number>();
  private finalShown = false;
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
      spec.difficulty,
    );
    this.race = spec.mode === 'run';
    this.speed = this.race ? RACE_CRUISE : 9;
    this.speedNow = this.race ? 0 : this.speed;
    // a race is against the clock: its length at par pace
    const course = this.terrain.course;
    const length = course ? HALF_H - 8 - course.finish : -(this.terrain.end + HALF_H + 20);
    this.parTime = Math.round(length / (this.speed * PAR_PACE));
    this.parSpeed = length / this.parTime;
    if (this.race) this.countdown = COUNTDOWN;
    // what a shortcut's slipstream is worth, at par pace
    builds.forEach((b, i) => {
      const s = stats(b);
      // (a race: at the back of the grid, the rivals lined up ahead)
      const x = builds.length === 1 ? (this.race ? 5 : 0) : i === 0 ? -5 : 5;
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
        burn: this.race ? 1 : BURN_START,
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
        surge: 0,
        draft: 0,
        wreck: 0,
        pressAt: -99,
        launched: !this.race,
        passes: 0,
        takedowns: 0,
        hd: 0,
        yaw: 0,
        slide: 0,
        handbrake: false,
        driftT: 0,
        driftTier: 0,
        driftDir: 0,
        out: false,
        dry: false,
        fwd: 0,
        pace: 0,
        wallT: 0,
        wallNear: 0,
        shaveGap: 99,
        scrapes: 0,
        shaves: 0,
        drifts: 0,
        threads: 0,
        alt: 0,
        vy: 0,
        airT: 0,
        jumps: 0,
      });
    });
    this.director = new Director(this);
    if (this.race) this.rivals.push(...makeRivals(this));
  }

  id() {
    return this.nextId++;
  }

  /** How far along (0..1). */
  get progress() {
    const c = this.terrain.course;
    if (c) {
      const lead = this.leader();
      const z = lead ? lead.z : this.scroll;
      return clamp((HALF_H - 8 - z) / (HALF_H - 8 - c.finish), 0, 1);
    }
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
    else if (this.countdown <= 0) this.time += DT;

    // the screen moves on: at its own pace in a fight (the boss holds it nearly still), after the
    // leader on a race (once the lights have gone green)
    if (this.race) this.raceStart(intents);
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
      if (!e.ground && !e.boss && !e.dead && e.state !== 'hidden') this.keepOffRock(e);
      // gone off the bottom (or far off the sides), or a bounty out of time: it got away
      if (e.z > this.bottom + 10 || e.z < this.top - 40 || Math.abs(e.x) > HALF_W + 26) {
        if (e.t > 1 && !e.boss) this.escape(e);
      } else if (e.bounty && e.t > e.bounty.life) this.escape(e);
    }
    this.updateShots();
    if (this.race) updateRivals(this);
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
      } else if (this.race ? this.living().some((p) => p.z <= this.terrain.course!.finish) : this.spec.mode !== 'boss' && this.scroll < this.terrain.end + HALF_H + 20) {
        this.finish();
      } else if (this.race && !this.finalShown && this.progress > 0.86) {
        this.finalShown = true;
        this.emit({ type: 'finalStretch' });
      }
    }
  }

  /**
   * Races: the countdown, and the launch. Boost pressed right on GO (a hair before or after) is a
   * perfect start, a surge off the line; held down long before it floods the engine, a slow one.
   */
  private raceStart(intents: Intent[]) {
    const clock = this.countdown > 0 ? -this.countdown : this.time;
    for (const p of this.players) {
      const on = (intents[p.id]?.boost ?? 0) > 0.05;
      if (on && p.boosting <= 0.05 && p.pressAt < clock - 0.05) p.pressAt = clock;
      if (!on) p.pressAt = -99;
    }
    if (this.countdown > 0) {
      const was = Math.ceil(this.countdown);
      this.countdown -= DT;
      if (this.countdown > 0 && Math.ceil(this.countdown) !== was) this.emit({ type: 'count', n: Math.ceil(this.countdown) });
      if (this.countdown > 0) return;
      this.countdown = 0;
      this.emit({ type: 'go' });
    }
    for (const p of this.players) {
      if (p.launched || p.down) continue;
      const held = p.pressAt > -98;
      if (held && p.pressAt >= -LAUNCH_BEFORE && p.pressAt <= LAUNCH_AFTER) this.launch(p, true);
      else if (held && p.pressAt < -LAUNCH_EARLY) this.launch(p, false);
      else if (this.time > LAUNCH_AFTER) p.launched = true;
    }
  }

  private launch(p: Player, perfect: boolean) {
    p.launched = true;
    if (perfect) {
      p.surge = LAUNCH_SURGE;
      p.burn = Math.min(1, p.burn + 0.3);
      p.vz = -RACE_CRUISE;
    } else p.wreck = FLOODED;
    this.emit({ type: 'launch', id: p.id, perfect, x: p.x, z: p.z });
  }

  finish() {
    if (this.state === 'clear') return;
    this.state = 'clear';
    const hard = 1 + this.spec.difficulty * 0.5;
    if (this.race) {
      // a place on the podium (or not): the purse by place, and a bit more for coming in under par
      const time = this.time + this.penalty;
      const ratio = time / this.parTime;
      const first = this.living().reduce((a, b) => (b.z < a.z ? b : a));
      this.place = 1 + this.rivals.filter((r) => r.done !== null).length;
      this.rank = (['S', 'A', 'B', 'C'] as const)[Math.min(this.place, 4) - 1];
      this.parBonus = Math.round((PLACE_PAY[this.place - 1] ?? 0) * PLACE_SCRAP * hard) + (ratio < 1 ? Math.round((1 - ratio) * PAR_SCRAP * hard) : 0);
      this.beatPar = this.place === 1;
      this.emit({ type: 'finish', id: first.id, place: this.place, time, x: first.x, z: first.z });
      this.emit({ type: 'par', time, par: this.parTime, rank: this.rank, bonus: this.parBonus, place: this.place });
    } else {
      // a fight: how much got through
      const seen = this.killed + this.missed;
      const share = seen ? this.killed / seen : 1;
      this.fullClear = this.missed === 0 && this.spawned > 0;
      this.rank = this.fullClear || share >= 0.9 ? 'S' : share >= 0.7 ? 'A' : share >= 0.45 ? 'B' : 'C';
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
      // (no Burn, no boost)
      const press = clamp(i.boost ?? 0, 0, 1);
      // (run dry on a race: nothing till the tank's refilled a little)
      if (p.burn >= BURN_AGAIN) p.dry = false;
      const want = p.down || over || p.burn <= 0 || p.dry ? 0 : press;
      const was = p.boosting > 0.05;
      p.boosting = want;
      p.burn = Math.max(0, p.burn - (this.race ? BURN_DRAIN_RACE : BURN_DRAIN) * p.boosting * DT);
      if (this.race && p.burn <= 0) p.dry = true;
      // (on a race it refills on its own while you're off the boost)
      if (this.race && this.countdown <= 0 && !over && p.boosting <= 0.05 && !p.down) p.burn = Math.min(1, p.burn + BURN_REGEN * DT);
      p.boostTime += p.boosting * DT;
      if (was !== p.boosting > 0.05) this.emit({ type: 'boost', id: p.id, on: !was });
    }
    if (this.race) {
      this.follow();
      return;
    }
    const target = this.state === 'boss' && !this.chase ? 2.5 : this.state === 'clear' ? this.speed * 1.4 : this.speed;
    this.speedNow = damp(this.speedNow, target, 1 / 0.3, DT);
  }

  /**
   * Races: the camera follows the leader. It runs on at the leader's pace (lagging a little, so a
   * surge carries the ship up the screen before the camera catches it), pulled back towards where
   * it keeps the leader: below the middle, lower still at speed, so there's more to see ahead.
   */
  private follow() {
    const lead = this.leader();
    if (this.countdown > 0 || !lead) {
      this.speedNow = 0;
      return;
    }
    // locked to the leader: it stays in the same spot on the screen, the world rushing past
    const was = this.scroll;
    const next = lead.z - this.anchor;
    // (the dz everything carried along with the screen moves by)
    this.speedNow = (was - next) / DT;
    if (this.state === 'clear' || this.state === 'failed') {
      this.speedNow = Math.max(0, this.speedNow);
      return;
    }
    // the tiers: up past each mark, down again a little under it
    let tier = this.tier;
    while (tier < TIERS.length && lead.fwd >= TIERS[tier]) tier++;
    while (tier > 0 && lead.fwd < TIERS[tier - 1] - 6) tier--;
    if (tier !== this.tier) this.emit({ type: 'tier', tier, up: tier > this.tier });
    this.tier = tier;
  }

  /**
   * Races: a ship's flight. The stick turns the nose and works the throttle; the ship's momentum
   * goes on its own way, grip bringing it round to the nose. The course turning under it turns the
   * nose and the momentum both (relative to the course) the other way: that's what flings you wide.
   * A unit of z is shorter on the inside of a bend (`metric`), so the ship gains there.
   */
  private racePlayer(p: Player, i: Intent) {
    const c = this.terrain.course!;
    const s = p.stats;
    const z0 = p.z;
    if (p.out) {
      this.wrecked(p);
      if (p.z > this.bottom - 2) p.z = this.bottom - 2;
      return;
    }
    // the build: quicker frames are quicker, grippier ones grip
    const quick = 0.94 + 0.12 * clamp((s.speed - 11) / 17, 0, 1);
    const hold = clamp(s.accel / 140, 0.85, 1.2);
    const steer = clamp(i.x, -1, 1);
    const thr = clamp(i.y, -1, 1);
    p.handbrake = i.fire && this.state !== 'clear';
    const surge = p.surge > 0 ? 1 : 0;
    const b = Math.max(p.boosting, surge * 0.6);
    const air = p.alt > 0 && c.ramp(p.x, p.z) < 0;
    let spd = Math.hypot(p.vx, p.vz);
    let going = Math.atan2(p.vx, -p.vz);
    // the throttle: coasting holds the cruise, full on the top speed, back on the brakes
    const cruise = RACE_CRUISE * quick;
    const extra = BOOST_TOP * p.boosting + SURGE_TOP * surge + (p.draft > 0 ? DRAFT_TOP : 0);
    let target = cruise + (RACE_TOP * quick - cruise) * Math.max(0, thr) + extra;
    if (thr < -0.1) target = lerp(target, RACE_BRAKE_TO, -thr);
    if (p.wreck > 0) target = Math.min(target, RACE_CRUISE * 0.5);
    if (p.alt <= 0 && c.off(p.x, p.z)) target *= ROUGH;
    spd += clamp(target - spd, -RACE_DECEL * DT, RACE_ACCEL * (1 + b * 0.9) * DT);
    // the drift: fire with the stick over, on the ground, at speed; it lasts while fire's held
    if (!p.driftDir && p.handbrake && Math.abs(steer) > 0.25 && !air && spd > DRIFT_START && p.wreck <= 0) p.driftDir = Math.sign(steer);
    if (p.driftDir && (!p.handbrake || spd < DRIFT_START * 0.75 || p.wreck > 0)) this.driftEnd(p);
    const grip = air ? AIR_GRIP : 1;
    if (p.driftDir) {
      // round on a tight line, the stick setting how tight; the nose kicked in past the way
      const d = p.driftDir;
      const tight = (clamp(steer * d, -1, 1) + 1) / 2;
      going += d * ((DRIFT_A * hold * grip) / Math.max(spd, 8)) * lerp(DRIFT_WIDE, 1, tight) * DT;
      spd -= DRIFT_BLEED * DT;
      p.yaw = d * 2;
      p.hd = going + angleTo(going, p.hd) * Math.exp(-8 * DT) + d * (DRIFT_ANGLE + 0.12 * tight) * (1 - Math.exp(-8 * DT));
    } else {
      if (p.handbrake) spd -= HANDBRAKE * DT;
      // the nose turns with the stick; the way swings round after it as hard as grip allows
      p.yaw = damp(p.yaw, steer * STEER * (air ? AIR_STEER : 1), YAW_EASE, DT);
      p.hd += p.yaw * DT;
      if (Math.abs(steer) < 0.1) p.hd += angleTo(p.hd, going) * (1 - Math.exp(-ALIGN * DT));
      const slip = angleTo(going, p.hd);
      const most = ((GRIP_A * hold * lerp(1, GRIP_BOOST, b) * grip) / Math.max(spd, 8)) * DT;
      going += Math.sign(slip) * Math.min(Math.abs(slip) * (1 - Math.exp(-GRIP_RATE * grip * DT)), most);
      // (past what it can hold, the nose leads the way, scrubbing speed: understeer)
      const lead = angleTo(going, p.hd);
      if (Math.abs(lead) > SLIP_MAX) p.hd = going + Math.sign(lead) * SLIP_MAX;
      if (!air) spd -= SCRUB * Math.max(0, Math.abs(lead) - SCRUB_FREE) * DT;
    }
    spd = Math.max(spd, 3);
    p.vx = spd * Math.sin(going);
    p.vz = -spd * Math.cos(going);
    p.fwd = spd;
    // the dash: a jink sideways (across the nose)
    p.dashCd = Math.max(0, p.dashCd - DT);
    if (p.dashCd <= 0 && p.dashes < s.dashes) {
      p.dashes++;
      p.dashCd = s.dashCooldown;
    }
    if (i.dash && p.dashes > 0 && p.dashLock <= 0) {
      p.dashes--;
      if (p.dashCd <= 0) p.dashCd = s.dashCooldown;
      const side = Math.abs(steer) > 0.2 ? Math.sign(steer) : 0;
      p.dashLock = DASH_TIME + DASH_RECOVER;
      p.dashT = DASH_TIME;
      p.dashX = side;
      p.dashZ = side ? 0 : -1;
      p.vx += Math.cos(p.hd) * JINK * side + Math.sin(p.hd) * (side ? 0 : JINK * 0.5);
      p.vz += Math.sin(p.hd) * JINK * side - Math.cos(p.hd) * (side ? 0 : JINK * 0.5);
      this.emit({ type: 'dash', id: p.id, x: p.x, z: p.z, dx: p.dashX, dz: p.dashZ });
    }
    p.dashT = Math.max(0, p.dashT - DT);
    // the course turns under it: the nose and the momentum both turn the other way, relative to it
    const met = c.metric(p.x, p.z);
    const pace = -p.vz / met;
    const turn = c.k(p.z) * pace * DT;
    p.hd -= turn;
    const a = p.vx;
    const f = -p.vz;
    p.vx = a * Math.cos(turn) - f * Math.sin(turn);
    p.vz = -(a * Math.sin(turn) + f * Math.cos(turn));
    p.hd = clamp(p.hd, -HD_MAX, HD_MAX);
    // and it moves: across in world units, down the course by the metric, held inside the walls
    const x0 = p.x;
    p.x += p.vx * DT;
    p.z += (p.vz / c.metric(p.x, p.z)) * DT;
    p.pace = (z0 - p.z) / DT;
    this.walls(p, x0, z0);
    // into the rock face round a tunnel's mouth
    if (c.portal(p.x, z0, p.z)) {
      p.z = z0 + 0.5;
      this.raceWreck(p, 0, 1);
    }
    this.air(p, z0, air);
    // co-op: left at the bottom edge, towed along (the clock charged for it)
    if (p.z > this.bottom - 2) {
      p.z = this.bottom - 2;
      if (this.leader() !== p) {
        p.towed += DT;
        this.penalty += TOW_PENALTY * DT;
      }
    }
    p.z = Math.max(p.z, this.top + 4);
    this.drift(p, steer);
    this.threads(p, z0);
    this.shortcut(p);
    this.pads(p);
  }

  /**
   * Races: up a ramp and off its lip into the air, and down again: landed square after a good bit
   * of air, a surge. Under a barrier (not high enough to clear it), piled into it.
   */
  private air(p: Player, z0: number, was: boolean) {
    const c = this.terrain.course!;
    const landed = fly(c, p, p.fwd, DT);
    const up = p.alt > 0 && c.ramp(p.x, p.z) < 0;
    if (up && !was) {
      p.airT = 0;
      this.emit({ type: 'air', id: p.id, state: 'launch', t: 0, clean: false, x: p.x, z: p.z });
    }
    if (up) p.airT += DT;
    if (landed && p.airT > AIR_MIN) {
      const clean = Math.abs(p.slide) < 0.3 && p.wreck <= 0;
      if (clean) {
        p.jumps++;
        p.surge = Math.max(p.surge, AIR_SURGE);
        p.burn = Math.min(1, p.burn + BURN_AIR * p.airT);
        this.score += Math.round(400 * p.airT);
      } else p.vz *= 0.8;
      this.emit({ type: 'air', id: p.id, state: 'land', t: p.airT, clean, x: p.x, z: p.z });
    }
    if (landed) p.airT = 0;
    const b = c.barrierCrossed(z0, p.z);
    // (smashed through it: no ramp left to clear it with, so no piling into it again)
    if (b && p.alt < BARRIER_H && c.blocks(b, p.x) && p.inv <= 0) {
      this.emit({ type: 'barrier', id: p.id, x: p.x, z: b.z });
      this.raceWreck(p, 0, 1);
      p.z = b.z - 1;
    }
  }

  /** Races: a drift on the ground at speed charges a turbo, three tiers, quicker held tight. */
  private drift(p: Player, steer: number) {
    p.slide = angleTo(p.hd, Math.atan2(p.vx, -p.vz));
    if (!p.driftDir || p.alt > 0 || p.fwd < RACE_CRUISE * 0.6) return;
    p.driftT += DT * (0.7 + 0.6 * Math.max(0, steer * p.driftDir));
    const tier = DRIFT_TIERS.filter((t) => p.driftT >= t).length;
    if (tier > p.driftTier) {
      p.driftTier = tier;
      this.emit({ type: 'driftTier', id: p.id, tier, x: p.x, z: p.z });
    }
  }

  /** Races: out of a drift: the turbo it charged fires. */
  private driftEnd(p: Player) {
    if (p.driftTier > 0 && p.wreck <= 0) {
      p.surge = Math.max(p.surge, DRIFT_SURGE[p.driftTier - 1]);
      p.drifts++;
      this.score += 300 * p.driftTier;
      this.emit({ type: 'driftBoost', id: p.id, tier: p.driftTier, x: p.x, z: p.z });
    }
    p.driftDir = 0;
    p.driftT = 0;
    p.driftTier = 0;
  }

  /** Races: through a gauntlet's gap at speed: Burn for nerve. */
  private threads(p: Player, z0: number) {
    const c = this.terrain.course!;
    for (const rw of c.rows) {
      if (rw.z > z0 || rw.z <= p.z) continue;
      if (p.wreck > 0 || p.fwd < RACE_CRUISE) continue;
      const m = c.x(rw.z);
      if (!rw.gaps.some(([gx, gh]) => Math.abs(p.x - m - gx) < gh)) continue;
      p.threads++;
      p.burn = Math.min(1, p.burn + BURN_THREAD);
      this.score += 300;
      this.emit({ type: 'thread', id: p.id, x: p.x, z: p.z });
    }
  }

  /**
   * Races: held inside the walls. Square into one at speed is a crash; anything less is a scrape,
   * thrown back off it a little, the nose swung along it, speed bleeding away while you grind.
   */
  private walls(p: Player, x0: number, z0: number) {
    const c = this.terrain.course!;
    const held = c.hold(x0, z0, p.x, p.z);
    if (!held.side) {
      p.wallT = 0;
      // skimming one, fast and clean: Burn for nerve
      let gap = 99;
      for (const w of c.walls(p.z, this.wallList)) gap = Math.min(gap, Math.abs(p.x - w.x) - WALL_R);
      p.wallNear = p.fwd > RACE_CRUISE && p.wreck <= 0 ? clamp(1 - gap / SKIM_WALL, 0, 1) : 0;
      p.burn = Math.min(1, p.burn + BURN_WALL * p.wallNear * DT);
      return;
    }
    p.wallNear = 0;
    p.x = held.x;
    const into = -held.side * p.vx;
    if (into > WALL_WRECK && p.inv <= 0 && p.wreck <= 0) {
      p.vx = held.side * into * 0.3;
      this.raceWreck(p, held.side, 0);
      return;
    }
    if (into > 0) p.vx = held.side * into * 0.25;
    p.vz *= 1 - SCRAPE * DT;
    p.hd += angleTo(p.hd, 0) * (1 - Math.exp(-4 * DT));
    if (p.wallT <= 0) {
      p.scrapes++;
      p.driftDir = 0;
      p.driftT = 0;
      p.driftTier = 0;
    }
    if (p.wallT <= 0 || into > 6) this.emit({ type: 'wall', id: p.id, x: p.x - held.side * WALL_R, z: p.z, side: held.side, hard: clamp(into / WALL_WRECK, 0, 1) });
    p.wallT += DT;
  }

  /** Races: into a shortcut's lane (past the track's edge, where one runs), and out of its far end. */
  private shortcut(p: Player) {
    const c = this.terrain.course!;
    const sc = c.shortcutAt(p.z);
    if (p.shortcut < 0) {
      if (!sc) return;
      const edge = c.x(p.z) + sc.side * c.half(p.z);
      if ((p.x - edge) * sc.side < 0.5) return;
      p.shortcut = sc.id;
      this.emit({ type: 'shortcut', id: p.id, shortcut: sc.id, state: 'enter', saved: 0 });
      return;
    }
    const was = c.shortcuts[p.shortcut];
    if (sc === was) return;
    p.shortcut = -1;
    if (p.z > was.z1) return;
    p.shortcuts++;
    p.burn = Math.min(1, p.burn + 0.15);
    this.score += 1500;
    this.emit({ type: 'shortcut', id: p.id, shortcut: was.id, state: 'exit', saved: was.saved / Math.max(20, p.fwd) });
  }

  /** Races: into a rock or a wall: thrown off it, most of the speed gone, a hit. */
  private raceWreck(p: Player, nx: number, nz: number) {
    // out of it, and the momentum into it turned round (the rest kept, a little)
    p.x += nx * 0.6;
    p.z += nz * 0.6;
    const into = p.vx * nx + p.vz * nz;
    const speed = Math.hypot(p.vx, p.vz);
    if (into < 0) {
      p.vx -= 1.4 * into * nx;
      p.vz -= 1.4 * into * nz;
    }
    // (still shaken from the last one, or barely moving: glanced off, no more)
    if (p.inv > 0 || p.wreck > 0 || speed < WRECK_SLOW) return;
    p.vx *= CRASH_KEEP;
    p.vz *= CRASH_KEEP;
    p.crashes++;
    p.wreck = WRECK_TIME;
    p.surge = 0;
    p.driftDir = 0;
    p.driftT = 0;
    p.driftTier = 0;
    p.burn = Math.max(0, p.burn - BURN_CRASH);
    // spun a little by it
    p.hd += (Math.random() < 0.5 ? -1 : 1) * 0.5;
    this.emit({ type: 'wreck', id: p.id, x: p.x, z: p.z, nx, nz, speed });
    this.emit({ type: 'crash', id: p.id, x: p.x, z: p.z });
    // (and the hull: a few of these and the ship's done)
    this.hurt(p, p.x, p.z, 'land');
    if (p.down) return;
    p.out = true;
    p.inv = WRECK_TIME + BACK_SAFE;
  }

  /** Races: out of it after a wreck: stopped, spun round; then back on the track, at the middle of the way, clear of what's on it. */
  private wrecked(p: Player) {
    const c = this.terrain.course!;
    if (p.wreck > 0) {
      const k = Math.exp(-5 * DT);
      p.vx *= k;
      p.vz *= k;
      p.x += p.vx * DT;
      p.z += (p.vz / c.metric(p.x, p.z)) * DT;
      p.fwd = Math.hypot(p.vx, p.vz);
      p.pace = -p.vz;
      p.hd += p.fwd * 0.12 * DT;
      return;
    }
    p.out = false;
    const sc = p.shortcut >= 0 ? c.shortcuts[p.shortcut] : undefined;
    const il = c.islandAt(p.z);
    let x = sc ? c.laneX(sc, p.z) : il ? c.branchX(il, Math.sign(p.x - c.x(p.z) - il.off) || 1, p.z) : c.x(p.z);
    if (Number.isNaN(x)) x = c.x(p.z);
    // (a row of rock just ahead: lined up with its gap)
    const rw = c.rowAhead(p.z, 30);
    if (rw && !sc) x = c.gapX(rw, p.x);
    const free = (xx: number) => !this.terrain.solid(xx, p.z, 2) && Array.from(this.terrain.colliders(xx, p.z - 3, 6)).every((col) => Math.hypot(col.x - xx, col.z - p.z) > col.r + 2.5);
    for (const d of [0, 3, -3, 6, -6, 9, -9]) {
      if (!free(x + d)) continue;
      x += d;
      break;
    }
    p.x = x;
    p.hd = 0;
    p.yaw = 0;
    p.vx = 0;
    p.vz = -RACE_CRUISE * 0.5;
    p.alt = 0;
    p.vy = 0;
    this.emit({ type: 'back', id: p.id, x: p.x, z: p.z });
  }

  /** Races: over a boost pad, a surge. */
  private pads(p: Player) {
    const c = this.terrain.course!;
    const bit = 1 << p.id;
    for (const pd of c.pads) {
      if (p.alt > 1.5) break;
      if (Math.abs(pd.z - p.z) > PAD_L || Math.abs(pd.x - p.x) > PAD_W + p.stats.core) continue;
      const done = this.padDone.get(pd) ?? 0;
      if (done & bit) continue;
      this.padDone.set(pd, done | bit);
      p.surge = Math.max(p.surge, PAD_TIME);
      p.burn = Math.min(1, p.burn + 0.08);
      this.emit({ type: 'pad', id: p.id, x: pd.x, z: pd.z });
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
    if (!this.race) p.z -= dz; // carried along with the screen (a race's ships fly on their own)
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
    p.surge = Math.max(0, p.surge - DT);
    p.wreck = Math.max(0, p.wreck - DT);
    p.focus = i.focus;
    // on the grid, engines revving, waiting for the lights
    if (this.countdown > 0) {
      p.vx = p.vz = 0;
      return;
    }
    // a race: flown, not shot (no guns, no specials, no aux)
    if (this.race) {
      this.racePlayer(p, i);
      this.regenShield(p);
      return;
    }

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
    const b = Math.max(p.boosting, p.surge > 0 ? 0.8 : 0);
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

    this.regenShield(p);

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

  /** Shield comes back if you stop getting hit. */
  private regenShield(p: Player) {
    const s = p.stats;
    if (p.shield >= s.shield) return;
    // (Static Skin: much sooner while skimming)
    p.shieldWait += DT * (1 + s.skin * p.skim);
    if (p.shieldWait > 6) {
      p.shield++;
      p.shieldWait = 0;
      if (s.skin && p.skim > 0) this.emit({ type: 'shieldGain', id: p.id, source: 'skin' });
    }
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
    if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: true });
    else this.emit({ type: 'bulletPop', x: b.x, z: b.z, color: b.color, look: b.look });
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
      splitA: 0,
      look: factionOf(this.spec.planet),
      seek: -1,
      hp: 0,
      seed: (((this.time * 13.7 + x * 0.31 + z * 0.17 + angle * 0.53) % 1) + 1) % 1,
      dead: false,
      ...opts,
    });
    const b = this.bullets[this.bullets.length - 1];
    if (b.split) b.splitA = this.rand() * Math.PI;
    if (b.kind === 'torpedo') b.hp = TORPEDO.hp;
    return b;
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
      if (b.kind === 'torpedo') this.steer(b);
      else if (b.accel) {
        const sp = Math.hypot(b.vx, b.vz) || 1;
        const k = Math.max(0.5, sp + b.accel * DT) / sp;
        b.vx *= k;
        b.vz *= k;
      }
      b.x += b.vx * DT;
      b.z += b.vz * DT - (b.kind === 'mine' && !slowScroll ? dz * 0.3 : 0);
      if (b.t > b.life || !this.onScreen(b.x, b.z, 6)) {
        if (b.split && b.t > b.life && !b.dead) {
          for (let k = 0; k < b.split; k++)
            this.bullet(b.x, b.z, b.splitA + (k / b.split) * Math.PI * 2, 9, { color: b.color, r: 0.4, look: b.look });
        }
        if (b.kind === 'torpedo' && b.t > b.life && !b.dead) this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
        b.dead = true;
      }
    }
  }

  /** A torpedo: out slow from the launcher, then it lights and runs at its prey, turning only so hard. */
  private steer(b: Bullet) {
    if (b.t < TORPEDO.launch) {
      b.vx *= 0.97;
      b.vz *= 0.97;
      return;
    }
    const sp = Math.hypot(b.vx, b.vz) || 1;
    let have = Math.atan2(b.vx, b.vz);
    const p = this.players[b.seek];
    if (b.t < TORPEDO.fuel && p && !p.down) {
      // decoys pull it like anything else that aims
      const want = this.aim(b.x, b.z);
      const da = Math.atan2(Math.sin(want - have), Math.cos(want - have));
      have += clamp(da, -TORPEDO.turn * DT, TORPEDO.turn * DT);
    }
    const v = Math.min(TORPEDO.speed * (1 + this.spec.difficulty * 0.1), sp + TORPEDO.accel * DT);
    b.vx = Math.sin(have) * v;
    b.vz = Math.cos(have) * v;
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
          if (this.hurt(p, b.x, b.z)) {
            b.dead = true;
            if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
          }
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
      if (this.race) {
        if (!this.raceLand(p)) this.skimLand(p);
      } else if (p.phase <= 0 && !this.collideLand(p)) this.skimLand(p);
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
            if (this.race) p.surge = Math.max(p.surge, 0.35);
            this.emit({ type: 'pickup', id: p.id, kind: 'ring', x: k.x, z: k.z, value: v });
            // a run of rings: every one of them threaded, a real surge at the last
            if (this.race && k.run !== undefined) {
              const key = k.run * 4 + p.id;
              const n = (this.ringsRun.get(key) ?? 0) + 1;
              this.ringsRun.set(key, n);
              if (n === k.of) {
                p.surge = Math.max(p.surge, PAD_TIME * 0.8);
                p.burn = Math.min(1, p.burn + 0.2);
                this.emit({ type: 'ringRun', id: p.id, x: k.x, z: k.z, count: n });
              }
            }
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
    // player shots against enemies (and the torpedoes coming for them)
    const torps = this.bullets.some((b) => b.kind === 'torpedo' && !b.dead);
    for (const s of this.shots) {
      if (s.dead) continue;
      if (torps && s.kind !== 'flame' && s.kind !== 'mine') {
        for (const b of this.bullets) {
          if (b.dead || b.kind !== 'torpedo' || (b.x - s.x) ** 2 + (b.z - s.z) ** 2 > (b.r + s.r + 0.4) ** 2) continue;
          b.hp -= s.dmg;
          if (b.hp <= 0) {
            this.cancel(b, 0.6);
            this.score += 50 * (1 + this.combo);
          }
          if (s.pierce > 0) s.pierce--;
          else s.dead = true;
          break;
        }
        if (s.dead) continue;
      }
      if (s.kind === 'flame') {
        // plasma burns away enemy bullets it touches
        for (const b of this.bullets) if (!b.dead && (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 1) this.cancel(b);
      }
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (e.shielded) {
          // a boss closed up behind its shield stops shots there (and they show on it); anything
          // else untouchable for now (rolling, coming on) lets them by
          if (e.boss && e.t >= 3.5 && s.kind !== 'mine') {
            const rb = e.r * 1.35 + 1 + s.r;
            if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 < rb * rb) {
              this.emit({ type: 'guard', enemy: e.id, x: s.x, z: s.z });
              s.dead = true;
              break;
            }
          }
          continue;
        }
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

  /**
   * Flyers stay out of the land: slid off a canyon's walls and pillars, and round anything tall
   * enough to hit, rather than ghosting through the rock. (A lunge that hits it has already
   * crashed, in its own update.)
   */
  private keepOffRock(e: Enemy) {
    const t = this.terrain;
    const r = Math.max(0.8, e.r * 0.8);
    const inRock = () => t.solid(e.x, e.z, -0.5) || t.solid(e.x - r, e.z, -0.5) || t.solid(e.x + r, e.z, -0.5) || t.solid(e.x, e.z - r, -0.5) || t.solid(e.x, e.z + r, -0.5);
    if (t.biome(e.z).shape === 'canyon')
      for (let k = 0; k < 20 && inRock(); k++) {
        const o = t.outOfRock(e.x, e.z);
        e.x += o.x * 0.5;
        e.z += o.z * 0.5;
      }
    for (const c of t.colliders(e.x, e.z, r + 2)) {
      const dx = e.x - c.x;
      const dz = e.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d >= min) continue;
      e.x = c.x + (dx / (d || 1)) * min;
      e.z = c.z + (dz / (d || 1)) * min;
    }
  }

  /** Races: into the land (a canyon's walls) or an obstacle: a wreck. Returns whether it touched. */
  private raceLand(p: Player): boolean {
    const t = this.terrain;
    if (t.solid(p.x, p.z)) {
      const o = t.outOfRock(p.x, p.z);
      const l = Math.hypot(o.x, o.z) || 1;
      this.raceWreck(p, o.x / l, o.z / l);
      return true;
    }
    let gap = 99;
    for (const c of t.colliders(p.x, p.z, 3 + SHAVE)) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + 0.7) {
        p.shaveGap = 99;
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const into = -(p.vx * nx + p.vz * nz);
        // square into it: wrecked; a glancing blow: off it along its side, grinding
        if (into > GLANCE) {
          this.raceWreck(p, nx, nz);
          return true;
        }
        p.x = c.x + nx * (c.r + 0.72);
        p.z = c.z + nz * (c.r + 0.72);
        if (into > 0) {
          p.vx += into * nx * 1.2;
          p.vz += into * nz * 1.2;
        }
        p.vx *= 1 - SCRAPE * DT;
        p.vz *= 1 - SCRAPE * DT;
        if (into > 6 || Math.random() < 0.2) this.emit({ type: 'wall', id: p.id, x: c.x + nx * c.r, z: c.z + nz * c.r, side: Math.sign(nx) || 1, hard: clamp(into / GLANCE, 0, 1) });
        p.wallT = Math.max(p.wallT, DT);
        return true;
      }
      gap = Math.min(gap, d - c.r - 0.7);
    }
    // a close shave: by within SHAVE of a rock at speed, and away clean
    if (gap < SHAVE) p.shaveGap = Math.min(p.shaveGap, gap);
    else if (p.shaveGap < SHAVE) {
      p.shaveGap = 99;
      if (p.wreck <= 0 && p.fwd > RACE_CRUISE) {
        p.shaves++;
        p.burn = Math.min(1, p.burn + 0.06);
        this.score += 250;
        this.emit({ type: 'shave', id: p.id, x: p.x, z: p.z });
      }
    }
    return false;
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
        const o = t.outOfRock(p.x, p.z);
        push = { x: o.x, z: o.z + 0.3 };
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
      // a crash costs momentum: some Burn
      p.burn = Math.max(0, p.burn - BURN_CRASH);
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

/** The turn (rad, -π..π) from angle `a` to angle `b`. */
function angleTo(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

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
