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
import { rng, type Rng, clamp, damp, lerp, pick } from '../util';
import { Director } from './director';
import { updateEnemy, enemyRadius, type EnemyData } from './enemies';
import { bossRead, type BossState, type BossStyle, type Read } from './boss';
import { CHAIN, PLATE, PLATE_GLANCE, plated, foeDefaults, foeHurt, go, lookOf, release, winded, foeShot, foeTaken, wearGuard, killHow, onKill, tickCombat, type FoeEvent, type FoeFields } from './combat';
import { ELITE_NAMES, FOES, factionOf, isFoe, type Faction, type Foe } from './factions';
import { updateStrikes, type Strike } from './strikes';
import type { AuxKind, Edge, MarkKind } from '../game/parts';
import { BURN, CRACK, SHOCK, detonate, mark, markTaken, marksOn, newMarks, spread, tickMarks, type Marks, type ReactionKind } from './marks';
import { Convoy } from './convoy';
import { Heist } from './heist';
import { rollItem, rollTier, type AffixId, type Item } from '../game/loot';

export type Mode = 'raid' | 'hunt' | 'escort' | 'heist' | 'boss';

// Boosting, and what doing it well pays: the numbers the feel hangs on.
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
/** Seconds after letting go of the boost before the Burn starts coming back (at the frame's rate). */
const BURN_WAIT = 0.6;
/** Skimming: within this far of the land or an obstacle (without touching) counts. */
const SKIM = 1.6;
/** A kill this close is point-blank: a little Burn. */
const POINT_BLANK = 7;
/**
 * The dash: a fixed burst, and not a safe one: what it runs into still hits you (unless a Slip
 * Field makes it untouchable). Fire that would have hit where you dashed from, during the opening slip, is a
 * perfect. After it, a moment before the next.
 */
const DASH_SPEED = 62;
const DASH_TIME = 0.17;
const DASH_RECOVER = 0.25;
/** A perfect soaks up the bullets this close. */
const PERFECT_R = 2.4;
/** Focus pulls spreads in to this much. */
const FOCUS_SPREAD = 0.4;
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
  /** HEAVY guns: rounds ready, and seconds until the next comes back (main guns: unused). */
  rounds: number[];
  reload: number[];
  /** Seconds since the heavy button last fired (for the view's flash and the pilot). */
  heavyT: number;
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
  slow: number;
  /** What hit you, and how often (for the autopilot's report). */
  causes: Record<string, number>;
  /** The Burn meter, 0..1: earned by flying close to danger, spent on boost. */
  burn: number;
  /** How hard it's boosting this frame, 0..1 (0 once the Burn runs out). */
  boosting: number;
  /** Seconds till the Burn starts coming back (it waits a moment after the boost is let go). */
  burnWait: number;
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
  /** Enemies already rammed this dash (Ram Prow), and set off (Catalyst). */
  rammed: number[];
  sparked: number[];
  /** For the autopilot's report. */
  parries: number;
  auxUses: number;
  /** FRENZIED: kills in a row (each one speeds those guns up), and seconds until they cool off. */
  frenzy: number;
  frenzyT: number;
  /** The dash-strike: seconds left in which what the guns fire hits harder (see STRIKE). */
  strike: number;
  /** Beams: who each gun has been held on, and for how long (the LOCK-ON edge). */
  lockOn: number[];
  lockT: number[];
  /** Crits each edge has landed (for the autopilot's report). */
  edges: Partial<Record<Edge, number>>;
  /** Affixes: seconds of SPITE left (after a hit), of PRIMED (after a perfect); SECOND WIND spent this level. */
  spiteT: number;
  primeT: number;
  wind: boolean;
  /** Takedowns landed (for the autopilot's report). */
  takedowns: number;
  /** A hot crate carried (see HOT): what's in it, and its fuse (0 it blows, 1 it's open). */
  crate?: Item;
  fuse: number;
  /**
   * The Weld (see WELD): 0..1, charged by hitting things. Full, let go of the trigger and hold
   * focus: `weldT` counts up, and past WELD.hold the weld is under way (committed, slow, the guns
   * quiet) until WELD.hold + WELD.time, when a hull point comes back. A hit in it loses the lot.
   */
  weld: number;
  weldT: number;
  /** Welds finished, and lost to a hit (for the autopilot's report). */
  welds: number;
  weldsLost: number;
}

/** SENTINEL: a copy of a gun left behind by a dash, firing on its own until it winks out. */
export interface Sentinel {
  owner: number;
  /** Which of the owner's guns it copies (an index into stats.guns). */
  gun: number;
  x: number;
  z: number;
  /** Which way it's aimed (0 up the screen), turning towards its target. */
  dir: number;
  t: number;
  life: number;
  cd: number;
  /** Shots it's fired (for the view's recoil). */
  shots: number;
  dead: boolean;
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
  tag?: 'reflect' | 'mirror' | 'wake' | 'nova';
  /** The marks it leaves (bits, see marks.ts) and how strong. */
  marks: number;
  markStr: number;
  /** Flaw Finder: crits anything marked. */
  flaw?: boolean;
  /** VOLATILE: what it kills passes its marks on. SPLITTING: it splits in two on its first hit. */
  volatile?: boolean;
  split?: boolean;
  /** Its gun's edge (when it crits) and what that crit multiplies by, and where it was fired from (for the edges that care how far). */
  edge?: Edge;
  edgeMul?: number;
  ox: number;
  oz: number;
  /** Fired in a dash-strike: it hits harder. */
  strike?: boolean;
  /** A HEAVY gun's round: a blow (it breaks plating at full strength). */
  heavy?: boolean;
  /** BOOMERANG: it turns at the end of its flight; `back`: it has, and is on its way home. */
  boomerang?: boolean;
  back?: boolean;
  /** Its gun's affix; `rico`: a RICOCHET's glance (it doesn't glance again). */
  affix?: AffixId;
  rico?: boolean;
  dead: boolean;
}

/** torpedo: a homing round that can be shot down (see TORPEDO); seeker: the lattice's, that only turns square (see SEEKER). */
export type BulletKind = 'orb' | 'needle' | 'big' | 'mine' | 'spore' | 'torpedo' | 'seeker';

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
  /** Seekers: the turns it has made, how long it's been on this leg, and (`halt` > 0) how long it still holds (of `hold`), pointing (dx, dz) down its next. */
  leg?: { n: number; t: number; halt: number; hold: number; dx: number; dz: number };
  /** Been out in the open air: from then on the land stops it (a gun dug into a cliff still gets its shots out). */
  open: boolean;
  dead: boolean;
}

/** Torpedoes: drift out for `launch` seconds, then light and chase (turning at `turn` rad/s, up to `speed`) until `fuel` runs out. */
/** How fast loose scrap sinks down the screen (units a second), to fall off the bottom if no one takes it. */
const SCRAP_DRIFT = 4;
export const TORPEDO = { launch: 0.45, fuel: 2.8, turn: 2.1, speed: 19, accel: 26, hp: 12, life: 5 };

/**
 * Seekers (the Rook's): they fly with the screen, dead straight, and only ever turn square. Once its
 * prey is level with it (or it meets the edge), one stops, points down its next leg for `halt`
 * seconds while that lane is drawn, then snaps off down it, kicking up to `speed`. `turns` turns
 * and it flies its last leg out. The first leg runs `out` seconds before it starts hunting.
 */
export const SEEKER = { out: 0.45, leg: 0.18, halt: 0.5, turns: 3, kick: 5, speed: 21, accel: 80, hp: 6, life: 10 };

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
  /** An elite's name ("GRISTLE"), for its plate. */
  title?: string;
  /** Armour over the hull (elites): it takes the hits first, and breaking it leaves it reeling. */
  armour: number;
  armourMax: number;
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
  /** What the guns have left on it: burning, shocked, cracked (see marks.ts). */
  mk: Marks;
  /** Thrown (a THUNDEROUS clap): a push that dies away. */
  kx?: number;
  kz?: number;
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

export type PickupKind = 'scrap' | 'part' | 'repair' | 'ring' | 'hot';

export interface Pickup {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kind: PickupKind;
  value: number;
  t: number;
  dead: boolean;
  /** Part crates: what's inside (rolled as it drops, so the crate can show its tier). */
  part?: Item;
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
  /** `turret`: fired by a SENTINEL left behind, not the ship. */
  | { type: 'shot'; owner: number; kind: Gun['spec']['shot']; x: number; z: number; dir: number; turret?: boolean; heavy?: boolean }
  /** HEAVY guns: the button pressed (`fired` rounds went, 0: all dry), a round back (`perfect`: a perfect dash gave it). */
  | { type: 'heavy'; id: number; x: number; z: number; fired: number }
  | { type: 'reload'; id: number; gun: number; perfect: boolean; rounds: number }
  /** `dot`: a burn's tick, not a blow. */
  /** `edge`: the crit was the gun's edge; `strike`: a dash-strike's. */
  /** `armour`: it landed on plating; `blow`: a hit that breaks plating at full strength (see isBlow). */
  | { type: 'hit'; x: number; z: number; enemy: number; dmg: number; kill: boolean; crit: boolean; dot?: boolean; edge?: Edge; strike?: boolean; armour?: boolean; blow?: boolean }
  | { type: 'explode'; x: number; z: number; y: number; size: number; color: number; enemy?: number }
  | { type: 'enemyShot'; x: number; z: number; color: number; look?: Faction }
  /** A bullet cancelled (by a bomb, a perfect, a hit): it pops instead of vanishing. */
  | { type: 'bulletPop'; x: number; z: number; color: number; look: Faction }
  /** A torpedo goes off: shot down, or burnt out at the end of its run. */
  | { type: 'torpedo'; x: number; z: number; color: number; shot: boolean }
  /** A seeker stops to turn (`n` turns made so far), goes off down its new leg, is shot down, or breaks on a hull. */
  | { type: 'seeker'; x: number; z: number; color: number; how: 'halt' | 'go' | 'shot' | 'hit'; n: number }
  /** `dmg` and `tier`: what it took off the hull (none when a shield stopped it). */
  | { type: 'playerHit'; id: number; shield: boolean; x: number; z: number; dmg?: number; tier?: HitTier }
  | { type: 'crash'; id: number; x: number; z: number }
  | { type: 'down'; id: number; x: number; z: number }
  | { type: 'revive'; id: number }
  | { type: 'graze'; id: number; x: number; z: number }
  | { type: 'dash'; id: number; x: number; z: number; dx: number; dz: number }
  /** `echo`: the Echo Relay's second go, weaker. */
  | { type: 'special'; id: number; kind: NonNullable<Stats['special']>; x: number; z: number; echo?: boolean }
  | { type: 'specialReady'; id: number }
  | { type: 'pickup'; id: number; kind: PickupKind; x: number; z: number; value: number; part?: Item }
  | { type: 'overheat'; id: number; gun: number }
  | { type: 'arc'; points: number[] }
  | { type: 'flak'; x: number; z: number }
  | { type: 'telegraph'; x: number; z: number; x2: number; z2: number; t: number }
  | { type: 'beam'; x: number; z: number; x2: number; z2: number; color: number }
  | { type: 'spawn'; enemy: number }
  | { type: 'bossWarning'; name: string; title: string }
  /** The boss read how you fly, and is answering it (`side`: the side you hug, for 'side'). */
  | { type: 'bossRead'; read: Read; side: number }
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
  /** Every one of a wave killed: `bonus` scrap, paid at (x, z) (the last kill). */
  | { type: 'waveClear'; wave: number; bonus: number; x: number; z: number }
  /** An enemy got away (off the screen, or a bounty's time ran out). */
  | { type: 'escaped'; enemy: number; x: number; z: number }
  /** A bounty showed up, was claimed (killed: `reward` paid), or escaped. */
  | { type: 'bounty'; state: 'appear' | 'claimed' | 'escaped'; enemy: number; x: number; z: number; reward: number }
  /** On a clear: the fight's tally; the rank and the scrap it earned. */
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
  | { type: 'shieldGain'; id: number; source: 'siphon' }
  /** Blink Coil: the dash was a jump from (x, z) to (x2, z2). */
  | { type: 'blink'; id: number; x: number; z: number; x2: number; z2: number }
  /** Ram Prow: dashed through an enemy. */
  | { type: 'ram'; id: number; x: number; z: number; enemy: number }
  /** Hair Trigger: crits on (after a perfect) or off. */
  /** A flare or an afterimage appeared (it lives in Level.decoys). */
  | { type: 'decoy'; id: number; kind: Decoy['kind']; x: number; z: number }
  /** A mark took on an enemy (it wasn't carrying that one). */
  | { type: 'mark'; enemy: number; kind: MarkKind; x: number; z: number }
  /** Two marks met on an enemy (see marks.ts). */
  | { type: 'reaction'; kind: ReactionKind; enemy: number; x: number; z: number; owner: number }
  /** The Catalyst set off what an enemy carried (`bits`). */
  | { type: 'detonate'; enemy: number; x: number; z: number; owner: number; bits: number }
  /** A SPLITTING shot split at (x, z). */
  | { type: 'split'; x: number; z: number }
  /** A VOLATILE kill passed its marks from (x, z) to `enemy` at (x2, z2). */
  | { type: 'spread'; from: number; enemy: number; x: number; z: number; x2: number; z2: number; bits: number }
  /** SENTINEL: a turret left at (x, z), copying gun `gun`. */
  | { type: 'sentinel'; id: number; gun: number; x: number; z: number }
  /** BOOMERANG: a shot turned for home at (x, z). */
  | { type: 'turn'; x: number; z: number }
  /** FRENZIED: the kills in a row now (0: it cooled off). */
  | { type: 'frenzy'; id: number; stacks: number }
  /** THUNDEROUS: a dash ended in a clap of reach `r` (`perfect`: twice as hard). */
  | { type: 'thunder'; id: number; x: number; z: number; r: number; perfect: boolean; hit: number }
  /** VENGEFUL: a hit on you set off a nova (`power` 1..3: the lower the hull, the harder). */
  | { type: 'nova'; id: number; x: number; z: number; power: number }
  /** RAVENOUS: a kill at (x, z) fed the special (`full`: and filled it). */
  | { type: 'feed'; id: number; x: number; z: number; full: boolean }
  /** An affix did its thing (the view names it over the ship, now and then). */
  | { type: 'affix'; id: number; affix: AffixId; x: number; z: number }
  /** A dash through something staggered: `big`, an elite's or a boss's first a phase (it fills the Weld half). */
  | { type: 'takedown'; id: number; enemy: number; x: number; z: number; kill: boolean; big: boolean; boss: boolean }
  /** The Weld: `ready` (just full), `start` (committed), `done` (a hull point back), `lost` (hit in it). */
  | { type: 'weld'; id: number; state: 'ready' | 'start' | 'done' | 'lost'; x: number; z: number }
  /** A hot crate: there to take (`id` -1), taken, cracked open (the part's yours), blown (a hull and the part gone), or let go at the level's end. */
  | { type: 'hot'; id: number; state: 'appear' | 'on' | 'open' | 'blown' | 'lost'; x: number; z: number; part?: Item }
  /** A shocked enemy seized up for a beat. */
  | { type: 'jolt'; enemy: number; x: number; z: number }
  /** Escorts (see convoy.ts): a hauler hit, lost, boarded, delivered; raiders coming to board one. */
  | { type: 'haulerHit'; id: number; x: number; z: number; dmg: number; cause: 'fire' | 'laser' | 'boarder'; hp: number; max: number }
  | { type: 'haulerLost'; id: number; x: number; z: number; left: number }
  | { type: 'boarders'; id: number; x: number; z: number; n: number; side: number }
  | { type: 'boarded'; id: number; enemy: number; x: number; z: number }
  /** A boarder killed while it clung to a hull (or lining up on one: `clinging` false). */
  | { type: 'shotOff'; id: number; x: number; z: number; clinging: boolean }
  | { type: 'delivered'; id: number; x: number; z: number; pay: number }
  | { type: 'convoyLost' }
  /** A heist (see heist.ts): the runner's doings, and its strongboxes'. */
  | { type: 'runner'; what: 'spool' | 'jump' | 'down' | 'engine' | 'turret' | 'exposed' | 'mine' | 'launch'; x: number; z: number; left?: number; k?: number }
  | { type: 'cargo'; what: 'loose' | 'caught' | 'fell'; id: number; x: number; z: number; by?: number }
  /** A shot stopped by armour (the runner's hull). */
  | { type: 'armour'; x: number; z: number }
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
  /** An escort's haulers (null in any other fight). */
  readonly convoy: Convoy | null;
  /** A heist's runner (null in any other fight). */
  readonly heist: Heist | null;
  /** Where the middle of the screen is (z on the flight plane). Decreases as you fly. */
  scroll = 0;
  /** The level's own speed (units/s), and how fast the screen is moving right now. */
  speed: number;
  speedNow: number;
  /** On a clear: the rank (how much was killed), and the bonus it paid. */
  rank: Rank | null = null;
  parBonus = 0;
  /** Fights: the waves so far, and what was spawned in them, killed and let through. */
  readonly waves: Wave[] = [];
  spawned = 0;
  killed = 0;
  missed = 0;
  /** Bounties claimed and let go. */
  bounties = 0;
  /** Reactions set off (two marks meeting). */
  reactions = 0;
  /** Enemy hull multiplier (a testing aid: &tough=8). */
  tough = 1;
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
  loot: Item[][] = [[], []];
  /** Flares and afterimages: aimed fire goes for these first. */
  readonly decoys: Decoy[] = [];
  /** SENTINEL turrets left behind by dashes. */
  readonly sentinels: Sentinel[] = [];
  /** A special going off right now: what it kills doesn't feed a RAVENOUS special. */
  private inSpecial = false;
  /** Boss phases a takedown has already filled the Weld half in. */
  private readonly tookPhase = new Set<number>();
  /** Inside a blast: its hits are blows (see isBlow). */
  private blowing = 0;
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
    );
    this.speed = 9;
    this.speedNow = this.speed;
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
        rounds: s.guns.map((g) => g.heavy),
        reload: s.guns.map(() => 0),
        heavyT: 9,
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
        slow: 0,
        causes: {},
        burn: BURN_START,
        boosting: 0,
        burnWait: 0,
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
        auxCd: 0,
        auxMax: 1,
        auxT: 0,
        parryT: 0,
        parried: 0,
        blocked: 0,
        eaten: 0,
        hook: 0,
        rammed: [],
        sparked: [],
        parries: 0,
        auxUses: 0,
        frenzy: 0,
        frenzyT: 0,
        strike: 0,
        lockOn: s.guns.map(() => 0),
        lockT: s.guns.map(() => 0),
        edges: {},
        spiteT: 0,
        primeT: 0,
        wind: false,
        takedowns: 0,
        fuse: 0,
        weld: 0,
        weldT: 0,
        welds: 0,
        weldsLost: 0,
      });
    });
    this.convoy = spec.mode === 'escort' ? new Convoy(this) : null;
    this.heist = spec.mode === 'heist' ? new Heist(this) : null;
    this.director = new Director(this);
  }

  id() {
    return this.nextId++;
  }

  /** How far along (0..1). */
  get progress() {
    return clamp(-this.scroll / -this.terrain.end, 0, 1);
  }

  /** How far along (progress) a fight that isn't a boss is over. */
  get endAt() {
    return 1 - (HALF_H + 20) / -this.terrain.end;
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

    // the screen moves on at its own pace (the boss holds it nearly still)
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
    this.convoy?.update(dz);
    this.heist?.update(dz);
    this.director.update();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.ground) e.z -= dz;
      e.t += DT;
      e.flash = Math.max(0, e.flash - DT);
      e.stun = Math.max(0, e.stun - DT);
      updateEnemy(this, e);
      if (e.kx || e.kz) {
        e.x += e.kx! * DT;
        e.z += e.kz! * DT;
        e.kx! *= 0.86;
        e.kz! *= 0.86;
        if (Math.abs(e.kx!) + Math.abs(e.kz!) < 0.5) e.kx = e.kz = 0;
      }
      if (!e.dead) tickMarks(this, e);
      if (!e.ground && !e.boss && !e.dead && e.state !== 'hidden' && !(e.d.board !== undefined && e.d.ph === 3) && e.d.qp === undefined) this.keepOffRock(e);
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
    this.updateSentinels(dz);
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
      } else if (this.spec.mode !== 'boss' && this.progress >= this.endAt) {
        this.finish();
      }
    }
  }

  finish() {
    if (this.state === 'clear') return;
    this.state = 'clear';
    for (const p of this.players) this.dropCrate(p);
    const hard = 1 + this.spec.difficulty * 0.5;
    // a fight: how much got through
    const seen = this.killed + this.missed;
    const share = seen ? this.killed / seen : 1;
    this.fullClear = this.missed === 0 && this.spawned > 0;
    this.rank = this.fullClear || share >= 0.9 ? 'S' : share >= 0.7 ? 'A' : share >= 0.45 ? 'B' : 'C';
    // an escort is ranked on what it brought home
    if (this.convoy) this.rank = this.convoy.deliver();
    // a heist, on what it took off the runner
    this.heist?.jump();
    if (this.heist) this.rank = this.heist.rank();
    this.parBonus = this.fullClear ? Math.round(FULL_CLEAR * hard) : 0;
    const cleared = this.waves.filter((w) => w.missed === 0 && w.killed === w.total).length;
    this.emit({
      type: 'tally', killed: this.killed, spawned: this.spawned, missed: this.missed, waves: this.waves.length, cleared, full: this.fullClear, rank: this.rank, bonus: this.parBonus,
    });
    this.scrap += this.parBonus;
    this.score += this.parBonus * 100;
    this.emit({ type: 'clear' });
    // everything left flies to you
    for (const p of this.pickups) if (p.kind === 'scrap') p.t = 99;
    for (const b of this.bullets) b.dead = true;
  }

  // --- speed, waves and bounties -----------------------------------------------------------

  /** Boost spends Burn. The screen keeps its pace and the boost goes into the ship (see updatePlayer). */
  private updateSpeed(intents: Intent[]) {
    const over = this.state === 'clear' || this.state === 'failed';
    for (const p of this.players) {
      const i = intents[p.id] ?? NEUTRAL;
      // (no Burn, no boost)
      const press = clamp(i.boost ?? 0, 0, 1);
      // (a hot crate takes the Burn: no boost while it's carried, see tickCrate)
      this.tickCrate(p);
      const want = p.down || over || p.burn <= 0 || p.crate ? 0 : press;
      const was = p.boosting > 0.05;
      p.boosting = want;
      p.burn = Math.max(0, p.burn - BURN_DRAIN * p.boosting * DT);
      // let go, and after a moment it comes back on its own (a racer's quickly, a hauler's slowly)
      if (p.boosting > 0.05) p.burnWait = BURN_WAIT;
      else if ((p.burnWait = Math.max(0, p.burnWait - DT)) <= 0 && !p.down && !p.crate) p.burn = Math.min(1, p.burn + p.stats.burnBack * DT);
      p.boostTime += p.boosting * DT;
      if (was !== p.boosting > 0.05) this.emit({ type: 'boost', id: p.id, on: !was });
    }
    const target = this.state === 'boss' && !this.chase ? 2.5 : this.state === 'clear' ? this.speed * 1.4 : this.speed;
    this.speedNow = damp(this.speedNow, target, 1 / 0.3, DT);
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
    p.slip = Math.max(0, p.slip - DT);
    p.dashLock = Math.max(0, p.dashLock - DT);
    p.strike = Math.max(0, p.strike - DT);
    p.spiteT = Math.max(0, p.spiteT - DT);
    p.primeT = Math.max(0, p.primeT - DT);
    p.focus = i.focus;
    const welding = this.updateWeld(p, i);
    if (p.frenzyT > 0 && (p.frenzyT -= DT) <= 0) {
      p.frenzy = 0;
      this.emit({ type: 'frenzy', id: p.id, stacks: 0 });
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
    // (less grip)
    const b = p.boosting;
    if (Math.hypot(mx, mz) < 0.1) mz = -SURGE_PUSH * b;
    const top = welding ? s.speed * WELD.crawl : s.speed * (i.focus ? 0.45 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + SURGE_SHIP * b);
    if (p.dashT > 0) {
      p.dashT -= DT;
      p.vx = p.dashX * DASH_SPEED;
      p.vz = p.dashZ * DASH_SPEED;
      if (p.dashT <= 0) {
        p.vx *= 0.35;
        p.vz *= 0.35;
        if (s.thunder > 0) this.thunderclap(p);
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
    if (i.dash && !welding && p.dashes > 0 && p.dashT <= 0 && p.dashLock <= 0) {
      p.dashes--;
      if (p.dashCd <= 0) p.dashCd = s.dashCooldown;
      const dl = Math.hypot(mx, mz);
      p.dashX = dl > 0.2 ? mx / dl : 0;
      p.dashZ = dl > 0.2 ? mz / dl : -1;
      // committed: a fixed burst, and nothing in it is safe (see perfectDash)
      p.dashT = DASH_TIME;
      p.dashLock = DASH_TIME + DASH_RECOVER;
      p.slip = s.slip;
      p.slipX = p.x;
      p.slipZ = p.z - this.scroll;
      p.perfect = false;
      p.strike = STRIKE_TIME * (1 + 0.5 * s.mod.strike);
      this.emit({ type: 'dash', id: p.id, x: p.x, z: p.z, dx: p.dashX, dz: p.dashZ });
      this.dashMods(p);
    }

    this.regenShield(p);

    // special
    const was = p.charge;
    p.charge = Math.min(1, p.charge + DT * 0.012 * s.specialRate);
    if (was < 1 && p.charge >= 1 && s.special) this.emit({ type: 'specialReady', id: p.id });
    if (i.special && !welding && s.special && p.charge >= 1) {
      p.charge = 0;
      this.special(p, s.special);
    }

    // guns
    p.firing = i.fire && !welding && this.state !== 'clear';
    p.heavyT += DT;
    let fired = 0;
    const press = i.heavy && !welding && this.state !== 'clear';
    for (let k = 0; k < s.guns.length; k++) {
      if (s.guns[k].heavy) fired += this.updateHeavy(p, k, press);
      else this.updateGun(p, k, p.firing);
    }
    if (press && s.guns.some((g) => g.heavy)) {
      if (fired) p.heavyT = 0;
      this.emit({ type: 'heavy', id: p.id, x: p.x, z: p.z, fired });
    }
    this.updateKit(p, welding ? { ...i, aux: false } : i);
  }

  /** Shield comes back if you stop getting hit. */
  private regenShield(p: Player) {
    const s = p.stats;
    if (p.shield >= s.shield) return;
    p.shieldWait += DT;
    if (p.shieldWait > 6) {
      p.shield++;
      p.shieldWait = 0;
    }
  }

  /** `k`: how strong (below 1: the Echo Relay's second go). */
  private special(p: Player, kind: NonNullable<Stats['special']>, k = 1) {
    this.inSpecial = true;
    this.specialGoes(p, kind, k);
    this.inSpecial = false;
    const af = p.stats.affixes;
    // SURGING: every heavy loaded, every gun cool
    if (af.surging) {
      p.heat.fill(0);
      p.jam.fill(0);
      p.stats.guns.forEach((g, n) => (p.rounds[n] = Math.max(p.rounds[n], g.heavy)));
      this.emit({ type: 'affix', id: p.id, affix: 'surging', x: p.x, z: p.z });
    }
    if (af.lingering) {
      p.inv = Math.max(p.inv, LINGER * k);
      this.emit({ type: 'affix', id: p.id, affix: 'lingering', x: p.x, z: p.z });
    }
  }

  private specialGoes(p: Player, kind: NonNullable<Stats['special']>, k: number) {
    this.emit({ type: 'special', id: p.id, kind, x: p.x, z: p.z, echo: k < 1 });
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
      p.stats.guns.forEach((g, n) => (p.rounds[n] = Math.max(p.rounds[n], g.heavy)));
    }
  }

  /** A bullet turned into a bit of scrap (bombs, phase changes, perfect dashes). */
  cancel(b: Bullet, chance = 0.25) {
    if (b.dead) return;
    b.dead = true;
    if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: true });
    else if (b.kind === 'seeker') this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'shot', n: b.leg?.n ?? 0 });
    else this.emit({ type: 'bulletPop', x: b.x, z: b.z, color: b.color, look: b.look });
    if (this.rand() < chance) this.drop('scrap', b.x, b.z, 1);
  }

  onScreen(x: number, z: number, margin = 0) {
    return Math.abs(x) < HALF_W + margin && z > this.top - margin && z < this.bottom + margin;
  }

  /** In view enough to be hit (its middle on the screen): nothing is shot down before it's seen. */
  seen(e: Enemy) {
    return this.onScreen(e.x, e.z);
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
    // FRENZIED: faster (no hotter) for every kill in a row
    const thr = g.frenzied ? 1 + FRENZY_EACH * p.frenzy : 1;
    if (sp.shot === 'beam') {
      // a held beam: worked out every frame, as a ray up the screen
      const rate = (od ? 2 : 1) * thr;
      p.heat[k] += (sp.heat * DT * 60 * (od ? 0 : 1) * 0.5) / thr;
      const reach = this.beamReach(gx, gz, dir, 0.9);
      p.beam[k] = reach.len;
      // LOCK-ON: held on the same first target, the beam comes to its edge
      const first = reach.hit.reduce<Enemy | undefined>((b, e) => (!b || (e.x - gx) ** 2 + (e.z - gz) ** 2 < (b.x - gx) ** 2 + (b.z - gz) ** 2 ? e : b), undefined);
      if (first && first.id === p.lockOn[k]) p.lockT[k] += DT;
      else {
        p.lockOn[k] = first?.id ?? 0;
        p.lockT[k] = 0;
      }
      if (p.cooldown[k] <= 0) {
        p.cooldown[k] = 1 / (sp.rate * rate);
        const hit = this.gunDamage(p, g);
        for (const e of reach.hit) {
          const flaw = g.flaw && marksOn(e) > 0;
          const edge = !flaw && this.edged(sp.edge, e, p, gx, gz, e.id === p.lockOn[k] ? p.lockT[k] : 0);
          if (edge) p.edges[sp.edge] = (p.edges[sp.edge] ?? 0) + 1;
          this.damage(e, hit.dmg * (edge ? g.edgeMul : flaw ? 2 : 1) * (p.strike > 0 ? this.strikeMul(p) : 1), p.id, hit.crit || flaw || edge, undefined, undefined, false, edge ? sp.edge : undefined, g.affix);
          mark(this, e, g.marks, g.markStr, p.id);
        }
      }
    } else {
      p.lockOn[k] = 0;
      p.lockT[k] = 0;
    }
    if (sp.shot !== 'beam' && p.cooldown[k] <= 0) {
      const rate = sp.rate * (od ? 2 : 1) * thr;
      p.cooldown[k] += 1 / rate;
      if (p.cooldown[k] < 0) p.cooldown[k] = 0;
      p.shotCount[k]++;
      this.fire(p, g, gx, gz, dir, 0);
      if (!od) p.heat[k] += sp.heat / thr;
    }
    if (p.heat[k] >= 1) {
      p.jam[k] = 1.4;
      this.emit({ type: 'overheat', id: p.id, gun: k });
    }
  }

  /**
   * A HEAVY gun: a round each press of the heavy button, from its magazine, and the rounds come
   * back one at a time (as fast as its rate: rate boosts reload it quicker). Returns 1 if it fired.
   */
  private updateHeavy(p: Player, k: number, press: boolean) {
    const g = p.stats.guns[k];
    const sp = g.spec;
    const od = p.overdrive > 0;
    if (p.rounds[k] < g.heavy) {
      const thr = g.frenzied ? 1 + FRENZY_EACH * p.frenzy : 1;
      p.reload[k] += DT * sp.rate * thr * (od ? 2 : 1);
      if (p.reload[k] >= 1) {
        p.reload[k] = 0;
        p.rounds[k]++;
        this.emit({ type: 'reload', id: p.id, gun: k, perfect: false, rounds: p.rounds[k] });
      }
    } else p.reload[k] = 0;
    if (!press || p.rounds[k] <= 0 || p.slow > 0) return 0;
    p.rounds[k]--;
    const gx = p.x + g.x;
    const gz = p.z + g.z;
    const dir = p.focus && Math.abs(g.dir) < Math.PI / 2 ? 0 : g.dir;
    p.shotCount[k]++;
    this.fire(p, g, gx, gz, dir, 0);
    return 1;
  }

  /** A perfect dash puts a round back in every heavy gun. */
  private reloadHeavies(p: Player) {
    p.stats.guns.forEach((g, k) => {
      if (!g.heavy || p.rounds[k] >= g.heavy) return;
      p.rounds[k]++;
      this.emit({ type: 'reload', id: p.id, gun: k, perfect: true, rounds: p.rounds[k] });
    });
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
      if (e.dead || e.shielded || !this.seen(e)) continue;
      const ex = e.x - x;
      const ez = e.z - z;
      const along = ex * dx + ez * dz;
      if (along < 0 || along > len) continue;
      const across = Math.abs(ex * dz - ez * dx);
      if (across < e.r + width) hit.push(e);
    }
    return { len, hit };
  }

  /** `extra`: shots (or arc jumps) more than usual; `mul`: harder than usual; `turret`: a SENTINEL fires it. */
  private fire(p: Player, g: Gun, x: number, z: number, dir: number, extra: number, mul = 1, turret = false) {
    const sp = g.spec;
    this.emit({ type: 'shot', owner: p.id, kind: sp.shot, x, z, dir, turret, heavy: !!g.heavy && !turret });
    const hit = this.gunDamage(p, g);
    // out of a dash, the guns strike harder (not a turret's: it didn't dash)
    const strike = p.strike > 0 && !turret;
    hit.dmg *= mul * (strike ? this.strikeMul(p) : 1);
    if (sp.shot === 'arc') {
      this.arc(p.id, x, z, hit.dmg, 3 + extra, { bits: g.marks, pow: g.markStr, flaw: g.flaw, edge: sp.edge, edgeMul: g.edgeMul, affix: g.affix });
      return;
    }
    // and pulls spreads in: a focused stream instead of a fan
    const tight = p.focus ? FOCUS_SPREAD : 1;
    const n = sp.count + extra;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * sp.spread * tight;
      const jitter = sp.shot === 'pellet' || sp.shot === 'flame' ? (this.rand() - 0.5) * 0.12 * tight : 0;
      const speed = sp.speed * (sp.shot === 'pellet' ? 0.85 + this.rand() * 0.3 : 1);
      const s = this.addShot(p.id, sp.shot, x, z, dir + off + jitter, speed, hit.dmg, sp.life, sp.pierce ?? 0, 0);
      s.crit = hit.crit;
      s.marks = g.marks;
      s.markStr = g.markStr;
      if (g.flaw) s.flaw = true;
      if (g.volatile) s.volatile = true;
      if (g.split) s.split = true;
      if (g.boomerang) s.boomerang = true;
      if (g.affix) s.affix = g.affix;
      s.edge = sp.edge;
      s.edgeMul = g.edgeMul;
      if (strike) s.strike = true;
      if (g.heavy) s.heavy = true;
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
      bounce: 0,
      ox: x,
      oz: z,
      marks: 0,
      markStr: 1,
      dead: false,
    };
    this.shots.push(shot);
    return shot;
  }

  /** SPLITTING: a shot that's just hit goes on as two halves, angled off (they don't split again). */
  private split(s: Shot, e: Enemy) {
    const sp = Math.hypot(s.vx, s.vz) || 30;
    const dir = Math.atan2(s.vx, -s.vz);
    for (const k of [-1, 1]) {
      const h = this.addShot(s.owner, s.kind === 'mine' || s.kind === 'flak' ? 'slug' : s.kind, s.x, s.z, dir + k * 0.42, Math.max(sp, 30), s.dmg * 0.5, Math.max(0.25, s.life * 0.5), 0, s.homing ? 0.5 : 0);
      h.hit.push(e.id);
      h.marks = s.marks;
      h.markStr = s.markStr;
      h.crit = s.crit;
      h.flaw = s.flaw;
      h.volatile = s.volatile;
      h.affix = s.affix;
      h.edge = s.edge;
      h.edgeMul = s.edgeMul;
      h.ox = s.ox;
      h.oz = s.oz;
    }
    this.emit({ type: 'split', x: s.x, z: s.z });
  }

  /**
   * Lightning: from (x, z) to the nearest enemy (ahead, from a gun), then the next, and so on. It
   * shocks what it hits unless told otherwise. `from`: it starts at this enemy (a reaction), not at
   * a gun, and can go any way.
   */
  arc(owner: number, x: number, z: number, dmg: number, jumps: number, opts: { from?: Enemy; reach?: number; bits?: number; pow?: number; flaw?: boolean; edge?: Edge; edgeMul?: number; affix?: AffixId } = {}) {
    const points = [x, z];
    const done: Enemy[] = opts.from ? [opts.from] : [];
    const bits = opts.bits ?? SHOCK;
    let cx = x;
    let cz = z;
    for (let j = 0; j < jumps; j++) {
      let best: Enemy | undefined;
      let bd = (opts.reach ?? (j === 0 ? 15 : 9)) ** 2;
      for (const e of this.enemies) {
        if (e.dead || e.shielded || e.t < 0 || done.includes(e)) continue;
        if (j === 0 && !opts.from && e.z > z + 2) continue; // the first jump from a gun goes forward
        const d = (e.x - cx) ** 2 + (e.z - cz) ** 2;
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      done.push(best);
      points.push(best.x, best.z);
      const flaw = !!opts.flaw && marksOn(best) > 0;
      const p = this.players[owner];
      const edge = !flaw && !!opts.edge && !!p && this.edged(opts.edge, best, p, x, z);
      if (edge) p.edges[opts.edge!] = (p.edges[opts.edge!] ?? 0) + 1;
      this.damage(best, dmg * (j === 0 ? 1 : 0.8) * (edge ? (opts.edgeMul ?? 2) : flaw ? 2 : 1), owner, flaw || edge, undefined, undefined, false, edge ? opts.edge : undefined, opts.affix);
      mark(this, best, bits, opts.pow ?? 1, owner);
      cx = best.x;
      cz = best.z;
    }
    if (points.length === 2) {
      if (opts.from) return;
      points.push(x + (this.rand() - 0.5) * 4, z - 7);
    }
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
        p.hp = Math.round(p.stats.hp * REVIVE_HULL);
        p.inv = 2.5;
        this.emit({ type: 'revive', id: p.id });
      }
    }
  }

  /**
   * A hit on a player: shield first (it stops a whole hit, whatever its tier), then hull, which
   * takes what the hit is worth (see HIT_DMG). Returns false if it didn't land.
   */
  hurt(p: Player, x: number, z: number, cause = 'bullet', tier: HitTier = tierOf(cause)) {
    if (p.down || p.inv > 0 || p.phase > 0 || this.state === 'clear') return false;
    p.shieldWait = 0;
    p.hits++;
    // hit in a weld: it's lost
    if (p.weldT >= WELD.hold) {
      p.weld = 0;
      p.weldsLost++;
      this.emit({ type: 'weld', id: p.id, state: 'lost', x: p.x, z: p.z });
    }
    p.weldT = 0;
    p.causes[cause] = (p.causes[cause] ?? 0) + 1;
    p.spiteT = SPITE_TIME;
    // a hit jolts a hot crate's fuse; when it blows, it's the hull it takes (shields or not)
    if (p.crate) p.fuse -= HOT_JOLT;
    if (p.shield > 0 && cause !== 'crate') {
      p.shield--;
      p.inv = 0.8;
      if (p.stats.mirror && cause === 'bullet') this.mirror(p, x, z, p.stats.mirror);
      this.emit({ type: 'playerHit', id: p.id, shield: true, x, z });
      if (p.stats.affixes.reactive) this.reactive(p);
    } else {
      const dmg = this.hitDamage(p, tier);
      p.hp -= dmg;
      p.inv = 1.4;
      this.emit({ type: 'playerHit', id: p.id, shield: false, x, z, dmg, tier });
      // SECOND WIND: once a level, the blow that would down you doesn't
      if (p.hp <= 0 && p.stats.affixes.secondwind && !p.wind) {
        p.wind = true;
        p.hp = Math.max(1, Math.round(p.stats.hp * SECOND_WIND));
        p.inv = 2.5;
        for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 14 * 14) this.cancel(b, 0.6);
        this.emit({ type: 'affix', id: p.id, affix: 'secondwind', x: p.x, z: p.z });
      }
      if (p.hp <= 0) {
        p.hp = 0;
        p.down = true;
        this.dropCrate(p);
        p.revive = 0;
        p.firing = false;
        this.emit({ type: 'down', id: p.id, x: p.x, z: p.z });
        this.emit({ type: 'explode', x: p.x, z: p.z, y: FLIGHT_Y, size: 2.5, color: 0xffa040 });
      }
    }
    if (p.stats.vengeful) this.nova(p);
    // a hit clears the bullets right around you: no double hits
    for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 9) this.cancel(b);
    this.combo = 0;
    return true;
  }

  /** What a hit of this tier takes off the hull here: more as the run goes on, less the armour (never under a third). */
  hitDamage(p: Player, tier: HitTier) {
    const raw = HIT_DMG[tier] * (1 + HIT_GROWTH * this.spec.difficulty);
    return Math.round(Math.max(raw / 3, raw - p.stats.armor));
  }

  // --- enemies -----------------------------------------------------------------------------

  spawn(arch: Enemy['arch'], skin: EnemySkin, x: number, z: number, d: EnemyData, opts: Partial<Enemy> = {}): Enemy {
    const diff = this.spec.difficulty;
    const foe = isFoe(arch) ? FOES[arch] : undefined;
    const base = (foe ? foe.hp : HP[arch as Archetype | 'boss']) * (1 + diff * 0.9) * (opts.elite ? 2.4 : 1) * this.tough;
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
      armour: 0,
      armourMax: 0,
      stun: 0,
      flash: 0,
      heading: 0,
      d,
      dead: false,
      shielded: false,
      score: foe ? foe.score : SCORE[arch as Archetype | 'boss'],
      scrap: foe ? foe.scrap : SCRAP[arch as Archetype | 'boss'],
      drop: false,
      mk: newMarks(),
      ...foeDefaults(),
      ...opts,
    };
    if (opts.hp) e.max = opts.hp;
    if (e.elite) {
      e.scrap *= 3;
      e.score *= 3;
      e.drop = true;
      e.armour = e.armourMax = e.max * 0.45;
      e.d.chain = CHAIN[arch] ?? 0;
      if (!e.title && arch !== 'boss') e.title = pick(this.rand, ELITE_NAMES[lookOf(this, e)]);
    } else if (plated(arch)) e.armour = e.armourMax = e.max * PLATE;
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
   * a shot, which has had its own say in collide); `s`: the shot, if it was one; `dot`: a burn's
   * tick (no blow to make a fuss of).
   */
  damage(e: Enemy, dmg: number, owner: number, crit: boolean, from?: { x: number; z: number } | null, s?: Shot, dot = false, edge?: Edge, affix?: AffixId) {
    if (e.dead || e.shielded || !this.seen(e)) return;
    const p = this.players[owner];
    const af = dot ? undefined : (s?.affix ?? affix);
    if (af === 'giantslayer' && (e.elite || e.boss || e.r >= GIANT_R)) dmg *= GIANT_DMG;
    if (af === 'executioner' && e.boss && e.hp < e.max * 0.25) dmg *= 1.5;
    // a BLASTING crit bursts (not its own burst's hits: those come in with no shot and no affix)
    if (af === 'blasting' && crit) this.blast(e.x, e.z, BLAST_R, dmg * 0.45, owner, { quiet: false });
    const blow = !dot && this.isBlow(p, dmg, crit, s);
    // armour, shields, exposed after an attack (see combat.ts)
    const k = foeTaken(this, e, from === undefined ? (p ? { x: p.x, z: p.z } : null) : from, crit);
    if (k <= 0) {
      this.emit({ type: 'guard', enemy: e.id, x: e.x, z: e.z });
      if (e.guard > 0) wearGuard(this, e, dmg);
      return;
    }
    // cracked open: it takes more
    dmg *= k * markTaken(e);
    // a boss shrugs off the stream unless it's open
    if (e.boss && !blow && !dot && e.state !== 'recover' && e.state !== 'stagger') dmg *= BOSS_GLANCE;
    if (!dot) e.flash = 0.08;
    if (p) p.charge = Math.min(1, p.charge + dmg * 0.0018 * p.stats.specialRate);
    // plating first (what's left over from the blow that breaks it is lost); the stream only chips
    // it; broken, it reels
    if (e.armour > 0) {
      const bite = dot ? 0.5 : blow ? 1 : PLATE_GLANCE;
      e.armour -= dmg * bite;
      if (p && !dot) this.feedWeld(p, Math.min(dmg * bite, WELD.cap) * (blow ? WELD.blow : WELD.stream));
      foeHurt(this, e, 0);
      this.emit({ type: 'hit', x: e.x, z: e.z, enemy: e.id, dmg: dmg * bite, kill: false, crit, dot, edge, strike: s?.strike, armour: true, blow });
      if (e.armour <= 0) {
        e.armour = 0;
        e.stun = Math.max(e.stun, 1.2);
        if (e.grab >= 0) release(this, e, true);
        go(this, e, 'stagger', 2.6);
        e.d.combo = 0;
        this.emit({ type: 'armourBreak', enemy: e.id, x: e.x, z: e.z });
      }
      return;
    }
    e.hp -= dmg;
    // EXECUTIONER: what's left that low is finished off
    if (af === 'executioner' && !e.boss && e.hp > 0 && e.hp < e.max * EXECUTE) {
      dmg += e.hp;
      e.hp = 0;
      if (p) this.emit({ type: 'affix', id: p.id, affix: af, x: e.x, z: e.z });
    }
    // blows wear a boss's poise harder
    foeHurt(this, e, dmg, dmg * (blow ? POISE_BLOW : 1));
    if (p && !dot) this.feedWeld(p, Math.min(dmg, WELD.cap) * (blow ? WELD.blow : WELD.stream));
    const kill = e.hp <= 0;
    this.emit({ type: 'hit', x: e.x, z: e.z, enemy: e.id, dmg, kill, crit, dot, edge, strike: s?.strike, blow });
    if (!kill) return;
    // a VOLATILE gun's kill: its marks jump to the nearest
    if (s?.volatile) spread(this, e, owner);
    // up close: worth the danger
    const close = !dot && !!p && !p.down && (e.x - p.x) ** 2 + (e.z - p.z) ** 2 < POINT_BLANK * POINT_BLANK;
    if (close) {
      p.burn = Math.min(1, p.burn + BURN_CLOSE_KILL);
      this.emit({ type: 'pointBlank', id: p.id, x: e.x, z: e.z });
    }
    this.emit({ type: 'kill', enemy: e.id, arch: e.arch, x: e.x, z: e.z, ...killHow(e, p, close, s) });
    this.kill(e, owner, close);
    if (af === 'shrapnel') this.shrapnel(e, owner, dmg);
    if (af === 'scavenger') {
      for (let i = 0; i < 3; i++) this.drop('scrap', e.x + (this.rand() - 0.5) * e.r, e.z + (this.rand() - 0.5) * e.r, 1);
      if (this.rand() < SCAVENGE_REPAIR) this.drop('repair', e.x, e.z, 1);
    }
  }

  /** A hot crate: a faction strongbox, a part rolled well above the level's luck. It drifts down the screen: take it or let it go. */
  hotCrate() {
    const r = this.rand;
    const x = (r() - 0.5) * HALF_W * 1.1;
    const z = this.top + 2;
    const tier = rollTier(r, this.spec.difficulty + 1, true) === 'legendary' || r() < 0.2 ? 'legendary' : 'epic';
    const part = rollItem(r, this.director.loot(), tier);
    this.pickups.push({ x, z, vx: 0, vz: 0, kind: 'hot', value: 0, t: 0, dead: false, part });
    this.emit({ type: 'hot', id: -1, state: 'appear', x, z, part });
  }

  /**
   * A hot crate's fuse: it burns down, and the Burn you earn (grazes, skims, perfects, point-blank
   * kills, takedowns) winds it back instead of filling the meter. Full, it cracks open; out, it blows.
   */
  private tickCrate(p: Player) {
    if (!p.crate || p.down) return;
    p.fuse += p.burn * HOT_FEED - HOT_BURN * DT;
    p.burn = 0;
    if (p.fuse >= 1) {
      this.loot[p.id].push(p.crate);
      this.emit({ type: 'hot', id: p.id, state: 'open', x: p.x, z: p.z, part: p.crate });
      p.crate = undefined;
      p.burn = HOT_OPEN_BURN;
    } else if (p.fuse <= 0) {
      const part = p.crate;
      p.crate = undefined;
      this.emit({ type: 'hot', id: p.id, state: 'blown', x: p.x, z: p.z, part });
      this.blast(p.x, p.z, 5, 30, p.id, { quiet: true });
      p.inv = 0;
      this.hurt(p, p.x, p.z, 'crate');
    }
  }

  /** Downed, or the level over, with a crate still hot: it's gone. */
  private dropCrate(p: Player) {
    if (!p.crate) return;
    this.emit({ type: 'hot', id: p.id, state: 'lost', x: p.x, z: p.z, part: p.crate });
    p.crate = undefined;
  }

  /** SHRAPNEL: a kill bursts into splinters that fly on (they don't burst again). */
  private shrapnel(e: Enemy, owner: number, dmg: number) {
    const a0 = this.rand() * Math.PI * 2;
    const each = clamp(dmg * 0.35, 4, 30);
    for (let k = 0; k < 5; k++) this.addShot(owner, 'slug', e.x, e.z, a0 + (k / 5) * Math.PI * 2, 40, each, 0.35, 0, 0).hit.push(e.id);
  }

  /** RICOCHET: a shot that's hit glances off to the nearest other enemy (once). */
  private ricochet(s: Shot, e: Enemy) {
    let best: Enemy | undefined;
    let bd = RICOCHET_REACH ** 2;
    for (const o of this.enemies) {
      if (o === e || o.dead || o.shielded || o.t < 0 || s.hit.includes(o.id)) continue;
      const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (!best) return;
    const r = this.addShot(s.owner, s.kind === 'missile' || s.kind === 'rail' ? s.kind : 'slug', s.x, s.z, Math.atan2(best.x - s.x, -(best.z - s.z)), 50, s.dmg * 0.6, 0.6, 0, 0.6);
    r.hit.push(e.id);
    r.rico = true;
    r.marks = s.marks;
    r.markStr = s.markStr;
  }

  /** A dash through something staggered: the big hit. It charges the Weld, an elite's (or a boss's first in a phase) by half. */
  private takedown(p: Player, e: Enemy) {
    e.d.td = 1;
    p.takedowns++;
    let big = false;
    if (e.boss) {
      const ph = e.boss.phase;
      if (!this.tookPhase.has(ph)) {
        this.tookPhase.add(ph);
        big = true;
      }
    } else big = e.elite;
    const dmg = e.boss ? e.max * TAKEDOWN_BOSS : Math.max(TAKEDOWN_MIN, e.max * TAKEDOWN_FOE);
    // back on its heels: its poise doesn't count this one, and it goes on reeling
    this.damage(e, dmg, p.id, true, null);
    p.dashes = Math.min(p.stats.dashes, p.dashes + 1);
    p.burn = Math.min(1, p.burn + BURN_TAKEDOWN);
    p.inv = Math.max(p.inv, 0.5);
    p.strike = Math.max(p.strike, STRIKE_TIME);
    this.feedWeld(p, big ? WELD.bigTakedown : WELD.takedown);
    this.emit({ type: 'takedown', id: p.id, enemy: e.id, x: e.x, z: e.z, kill: e.dead, big, boss: !!e.boss });
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
    if (e.d.qp !== undefined) this.heist?.lost(e, owner);
    if (e.d.board !== undefined && (e.d.ph ?? 0) >= 1 && (e.d.ph ?? 0) <= 3) this.emit({ type: 'shotOff', id: e.d.board, x: e.x, z: e.z, clinging: e.d.ph === 3 });
    const p = this.players[owner];
    if (p) {
      p.kills++;
      this.fed(p, e);
    }
    for (let i = 0; i < e.scrap * (close ? 2 : 1); i++) this.drop('scrap', e.x + (this.rand() - 0.5) * e.r, e.z + (this.rand() - 0.5) * e.r, 1 + (this.rand() < 0.2 ? 4 : 0));
    if (e.drop) this.drop('part', e.x, e.z, 0);
    else if (this.rand() < 0.015) this.drop('repair', e.x, e.z, 1);
    onKill(this, e, p ? owner : -1);
    if (e.boss) this.director.bossDown(e);
  }

  /** Splash damage (flak, mines, a cook-off): leaving `bits` marks; `quiet`: the caller makes the fuss. */
  blast(x: number, z: number, r: number, dmg: number, owner: number, opts: { bits?: number; pow?: number; quiet?: boolean } = {}) {
    const rr = r;
    if (!opts.quiet) this.emit({ type: 'explode', x, z, y: FLIGHT_Y, size: rr * 0.5, color: 0xffc060 });
    // everything in reach first, then the hits (a hit can set off a reaction that moves the list)
    const caught = this.enemies.filter((e) => !e.dead && (e.x - x) ** 2 + (e.z - z) ** 2 < (rr + e.r) ** 2);
    this.blowing++;
    for (const e of caught) {
      this.damage(e, dmg, owner, false, null);
      if (opts.bits) mark(this, e, opts.bits, opts.pow ?? 1, owner);
    }
    this.blowing--;
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
      open: false,
      dead: false,
      ...opts,
    });
    const b = this.bullets[this.bullets.length - 1];
    if (b.split) b.splitA = this.rand() * Math.PI;
    if (b.kind === 'torpedo') b.hp = TORPEDO.hp;
    if (b.kind === 'seeker') {
      b.hp = SEEKER.hp;
      const sp = Math.hypot(b.vx, b.vz) || 1;
      // (square to the screen from the start: it only ever flies along x or z)
      const across = Math.abs(b.vx) > Math.abs(b.vz);
      b.leg = { n: 0, t: 0, halt: 0, hold: SEEKER.halt, dx: across ? Math.sign(b.vx) : 0, dz: across ? 0 : Math.sign(b.vz) || 1 };
      b.vx = b.leg.dx * sp;
      b.vz = b.leg.dz * sp;
    }
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
    // on an escort, a hauler's a target too, if it's clearly the nearer
    if (this.convoy && this.state !== 'clear') {
      const h = this.convoy.nearest(x, z);
      if (h.h && (!p || h.d2 * HAULER_BIAS < (p.x - x) ** 2 + (p.z - z) ** 2)) p = h.h;
    }
    return p ? Math.atan2(p.x - x, p.z - z) : 0;
  }

  /** A part crate's part is rolled as it drops (`part`: this one, else the director's pick), so it shows its tier in flight. */
  drop(kind: PickupKind, x: number, z: number, value: number, part?: string) {
    const a = this.rand() * Math.PI * 2;
    const v = kind === 'scrap' ? 3 + this.rand() * 6 : 2;
    const id = part ?? (kind === 'part' ? this.director.loot() : undefined);
    const item = id === undefined ? undefined : rollItem(this.rand, id, rollTier(this.rand, this.spec.difficulty));
    this.pickups.push({ x, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v - 2, kind, value, t: 0, dead: false, part: item });
  }

  // --- the rest ----------------------------------------------------------------------------

  private updateShots() {
    for (const s of this.shots) {
      s.t += DT;
      // a BOOMERANG shot at the end of its flight (or the edge of the screen) turns for home
      if (s.boomerang && !s.back && (s.t > s.life || !this.onScreen(s.x, s.z, 1))) this.turnHome(s);
      if (s.back) {
        if (this.homeward(s)) continue;
      } else if (s.t > s.life) {
        s.dead = true;
        if (s.kind === 'flak') {
          this.emit({ type: 'flak', x: s.x, z: s.z });
          this.blast(s.x, s.z, 3, s.dmg * 0.6, s.owner, { bits: s.marks, pow: s.markStr });
          for (let a = 0; a < 8; a++) this.addShot(s.owner, 'pellet', s.x, s.z, (a / 8) * Math.PI * 2, 30, s.dmg * 0.25, 0.25, 0, 0);
        } else if (s.kind === 'mine') {
          this.blast(s.x, s.z, 3.5, s.dmg, s.owner, { bits: s.marks, pow: s.markStr });
        }
        continue;
      }
      if (s.homing > 0 && !s.back) {
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
      if (!this.onScreen(s.x, s.z, s.back ? 12 : 4)) s.dead = true;
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
      else if (b.kind === 'seeker') this.square(b);
      else if (b.accel) {
        const sp = Math.hypot(b.vx, b.vz) || 1;
        const k = Math.max(0.5, sp + b.accel * DT) / sp;
        b.vx *= k;
        b.vz *= k;
      }
      b.x += b.vx * DT;
      // (a seeker is flown, not thrown: it keeps up with the screen, so its lanes stay square to it)
      b.z += b.vz * DT - (b.kind === 'seeker' ? dz : b.kind === 'mine' && !slowScroll ? dz * 0.3 : 0);
      if (b.t > b.life || !this.onScreen(b.x, b.z, 6)) {
        if (b.split && b.t > b.life && !b.dead) {
          for (let k = 0; k < b.split; k++)
            this.bullet(b.x, b.z, b.splitA + (k / b.split) * Math.PI * 2, 9, { color: b.color, r: 0.4, look: b.look });
        }
        if (b.kind === 'torpedo' && b.t > b.life && !b.dead) this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
        b.dead = true;
      } else if (!this.terrain.solid(b.x, b.z, 0)) b.open = true;
      else if (b.open) {
        // the land stops fire as it stops yours: it flies at your height, not over the hills
        b.dead = true;
        if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
        else if (b.kind === 'seeker') this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'hit', n: b.leg?.n ?? 0 });
        else this.emit({ type: 'bulletPop', x: b.x, z: b.z, color: b.color, look: b.look });
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

  /** A seeker: dead straight down its leg until its prey is level with it, then it stops, points, and turns square at it. */
  private square(b: Bullet) {
    const g = b.leg!;
    g.t += DT;
    if (g.halt > 0) {
      g.halt -= DT;
      if (g.halt > 0) return;
      // and off down the new leg
      g.n++;
      g.t = 0;
      b.vx = g.dx * SEEKER.kick;
      b.vz = g.dz * SEEKER.kick;
      this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'go', n: g.n });
      return;
    }
    const v = Math.min(SEEKER.speed * (1 + this.spec.difficulty * 0.1), Math.hypot(b.vx, b.vz) + SEEKER.accel * DT);
    b.vx = g.dx * v;
    b.vz = g.dz * v;
    if (g.n >= SEEKER.turns) return;
    const room = this.onScreen(b.x + g.dx * 2, b.z + g.dz * 2, -1);
    if (room && g.t < (g.n ? SEEKER.leg : SEEKER.out)) return;
    const p = this.players[b.seek];
    if (!p || p.down) return;
    // what it's after: its prey, or a decoy pulling it (as anything that aims)
    const a = this.aim(b.x, b.z);
    const tx = Math.sin(a);
    const tz = Math.cos(a);
    // still ahead of it down this leg, and room to go: on it goes
    if ((g.dx ? tx * g.dx : tz * g.dz) > 0.12 && room) return;
    // level with it, or out of room: stop, and point down the other way at it
    const across = g.dx === 0;
    g.dx = across ? Math.sign(tx) || 1 : 0;
    g.dz = across ? 0 : Math.sign(tz) || 1;
    g.halt = g.hold = SEEKER.halt * (1 - this.spec.difficulty * 0.2);
    b.vx = b.vz = 0;
    this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'halt', n: g.n });
  }

  private updateLasers() {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      // (a read can stagger a boss mid-loop, and that puts its beams out)
      if (!l) continue;
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
      this.convoy?.laser(inBeam);
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
        const reach = k.kind === 'scrap' ? MAGNET : 3;
        if (d < reach || k.t > 60) {
          const pull = 70 / Math.max(d, 1);
          k.vx += (dx / Math.max(d, 0.01)) * pull * DT * 9;
          k.vz += (dz2 / Math.max(d, 0.01)) * pull * DT * 9;
          pulled = true;
          break;
        }
      }
      // drifts down the screen and off it: scrap at its own steady pace (even when the screen
      // holds still for a boss), the rest slower than the land
      if (!pulled) k.z -= k.kind === 'scrap' ? dz - SCRAP_DRIFT * DT : dz * 0.75;
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
          if (this.hurt(p, b.x, b.z, b.kind === 'seeker' ? 'seeker' : b.kind === 'torpedo' ? 'torpedo' : 'bullet', BULLET_TIER[b.kind])) {
            b.dead = true;
            if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
            if (b.kind === 'seeker') this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'hit', n: b.leg?.n ?? 0 });
          }
        } else if (!(b.grazed & (1 << p.id)) && d2 < (hitR + 1.5) ** 2 && p.inv <= 0) {
          b.grazed |= 1 << p.id;
          p.grazes++;
          p.charge = Math.min(1, p.charge + 0.018 * p.stats.specialRate);
          p.burn = Math.min(1, p.burn + BURN_GRAZE);
          this.score += 5 * (1 + this.combo);
          this.emit({ type: 'graze', id: p.id, x: (b.x + p.x) / 2, z: (b.z + p.z) / 2 });
        }
      }
      // ramming
      for (const e of this.enemies) {
        if (e.dead || e.ground || e.state === 'hidden') continue;
        // a dash through anything staggered is a takedown (once a stagger)
        if (p.dashT > 0 && e.state === 'stagger' && !e.d.td && e.t >= 0) {
          const tr = e.r + core + TAKEDOWN_REACH;
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < tr * tr) this.takedown(p, e);
          continue;
        }
        // (anything left reeling after its attack is there to be punished, not to punish)
        if (winded(e)) continue;
        const r = e.r * 0.75 + core;
        if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) {
          // a Ram Prow dashing through: the dash does the hitting (see ramAlong)
          if (p.dashT > 0 && p.stats.mod.ram > 0) continue;
          if (this.hurt(p, p.x, p.z, 'ram:' + e.arch)) {
            this.damage(e, e.arch === 'swarm' ? 999 : 20, p.id, false);
            if (p.stats.affixes.barbed) this.barb(p, e);
          }
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
          // one hot crate at a time: it takes the Burn you have, and all you earn after
          if (k.kind === 'hot') {
            if (p.crate) continue;
            k.dead = true;
            p.crate = k.part;
            p.fuse = HOT_START;
            p.burn = 0;
            this.emit({ type: 'hot', id: p.id, state: 'on', x: k.x, z: k.z, part: k.part });
            continue;
          }
          k.dead = true;
          const v = k.value;
          if (k.kind === 'scrap') this.scrap += v;
          else if (k.kind === 'repair') p.hp = Math.min(p.stats.hp, p.hp + HULL_STEP);
          else if (k.kind === 'part') this.loot[p.id].push(k.part!);
          this.emit({ type: 'pickup', id: p.id, kind: k.kind, x: k.x, z: k.z, value: v, part: k.part });
        }
      }
    }
    // what's left of the enemy fire against the haulers' hulls
    this.convoy?.collide();
    // player shots against enemies (and the torpedoes and seekers coming for them)
    const torps = this.bullets.some((b) => b.hp > 0 && !b.dead);
    for (const s of this.shots) {
      if (s.dead) continue;
      if (torps && s.kind !== 'flame' && s.kind !== 'mine') {
        for (const b of this.bullets) {
          if (b.dead || b.hp <= 0 || (b.x - s.x) ** 2 + (b.z - s.z) ** 2 > (b.r + s.r + 0.4) ** 2) continue;
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
      // a heist: the shield over the runner's bridge
      if (this.heist?.stops(s)) continue;
      if (s.kind === 'flame') {
        // plasma burns away enemy bullets it touches
        for (const b of this.bullets) if (!b.dead && (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 1) this.cancel(b);
      }
      for (const e of this.enemies) {
        // (not yet on the screen, or gone off it: shots fly on by)
        if (e.dead || !this.seen(e)) continue;
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
        // Flaw Finder: the marked are open; or else the gun's own edge
        let edge: Edge | undefined;
        if (s.flaw && marksOn(e) > 0) {
          dmg *= 2;
          crit = true;
        } else if (s.edge && !s.tag && this.edged(s.edge, e, this.players[s.owner], s.ox, s.oz)) {
          dmg *= s.edgeMul ?? 2;
          crit = true;
          edge = s.edge;
          const op = this.players[s.owner];
          if (op) op.edges[edge] = (op.edges[edge] ?? 0) + 1;
        }
        if (e.boss) {
          for (const w of e.boss.weak)
            if ((e.x + w.x - s.x) ** 2 + (e.z + w.z - s.z) ** 2 < 2.2 * 2.2) {
              dmg *= 2;
              crit = true;
            }
        }
        this.damage(e, dmg, s.owner, crit, null, s, false, edge);
        if (!e.dead) mark(this, e, s.marks, s.markStr, s.owner);
        if (s.affix === 'ricochet' && !s.rico) this.ricochet(s, e);
        if (s.split && !s.hit.length) this.split(s, e);
        s.hit.push(e.id);
        if (s.kind === 'missile') this.blast(s.x, s.z, 1.8, s.dmg * 0.4, s.owner, { bits: s.marks, pow: s.markStr });
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

  /** What the parts on the ship do every frame: the aux, the tether's reel, rams. */
  private updateKit(p: Player, i: Intent) {
    const s = p.stats;
    // Ram Prow: everything the dash went through this frame; Catalyst: every mark it went past
    if (p.dashT > 0 && s.mod.ram > 0) this.ramAlong(p, p.x - p.vx * DT, p.z - p.vz * DT, p.x, p.z);
    if (p.dashT > 0 && s.mod.detonate > 0) this.catalyst(p, p.x - p.vx * DT, p.z - p.vz * DT, p.x, p.z);
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
        // (the Weld once a use)
        if (!p.parried) this.feedWeld(p, WELD.parry);
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
    if (!p.parried) {
      p.burn = Math.min(1, p.burn + PARRY_BURN);
      this.feedWeld(p, WELD.parry);
    }
    p.parried++;
    p.parries++;
    this.emit({ type: 'parry', id: p.id, x: p.x, z: p.z, count: 1 });
  }

  /** A shield from a part, one over the top at most. */
  private gainShield(p: Player, source: 'siphon') {
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

  /** A gun's damage now: the lance's speed, the Kestrel's slipstream, SPITE, PRIMED. */
  private gunDamage(p: Player, g: Gun) {
    let dmg = g.spec.damage;
    if (g.spec.speedy) dmg *= 1 + p.boosting;
    if (p.stats.swift) dmg *= 1 + p.stats.swift * this.pace(p);
    if (g.affix === 'spite' && p.spiteT > 0) dmg *= SPITE_DMG;
    if (g.primed && p.primeT > 0) dmg *= PRIMED_DMG;
    return { dmg, crit: false };
  }

  /** How fast it's flying, 0..1: about half at full speed, 1 flat out on the boost or in a dash. */
  pace(p: Player) {
    return Math.min(1, Math.hypot(p.vx, p.vz) / (p.stats.speed * (1 + SURGE_SHIP)));
  }

  /** The dash just began: what the dash mods add. */
  private dashMods(p: Player) {
    const s = p.stats;
    const m = s.mod;
    p.rammed = [];
    p.sparked = [];
    const x0 = p.x;
    const z0 = p.z;
    if (m.blink > 0) this.blink(p);
    // where it ends up (for mines along the way)
    const x1 = m.blink > 0 ? p.x : x0 + p.dashX * DASH_SPEED * DASH_TIME;
    const z1 = m.blink > 0 ? p.z : z0 + p.dashZ * DASH_SPEED * DASH_TIME;
    for (let k = 0; k < m.mines; k++) {
      const t = (k + 0.5) / m.mines;
      const w = this.addShot(p.id, 'mine', lerp(x0, x1, t), lerp(z0, z1, t), 0, 0, WAKE_DMG, WAKE_LIFE, 0, 0);
      w.tag = 'wake';
      w.marks = CRACK;
    }
    if (m.ghost > 0) this.decoy(p, 'ghost', x0, z0, GHOST_LIFE, m.ghost);
    // AFTERBURN: a wake of fire the length of the dash
    if (s.affixes.afterburn)
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        const f = this.addShot(p.id, 'flame', lerp(x0, x1, t), lerp(z0, z1, t), 0, 0, AFTERBURN_DMG, AFTERBURN_LIFE, 99, 0);
        f.tag = 'wake';
        f.marks = BURN;
      }
    this.leaveSentinels(p, x0, z0);
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
    if (p.stats.mod.detonate > 0) this.catalyst(p, x0, z0, x, z);
  }

  /** Catalyst: the marks on everything the dash passes close to go off (twice as hard on a perfect). */
  private catalyst(p: Player, x0: number, z0: number, x1: number, z1: number) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l2 = dx * dx + dz * dz || 1;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.t < 0 || !marksOn(e) || p.sparked.includes(e.id)) continue;
      const t = clamp(((e.x - x0) * dx + (e.z - z0) * dz) / l2, 0, 1);
      if ((x0 + dx * t - e.x) ** 2 + (z0 + dz * t - e.z) ** 2 > (e.r + CATALYST_REACH) ** 2) continue;
      p.sparked.push(e.id);
      detonate(this, e, p.id, p.stats.mod.detonate * (p.perfect ? 2 : 1));
    }
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
      if (p.stats.affixes.barbed) this.barb(p, e);
    }
  }

  /** BARBED: what you ram, or what rams you, takes a hard hit and reels (open to a takedown). */
  private barb(p: Player, e: Enemy) {
    if (e.dead) return;
    this.damage(e, BARB_DMG, p.id, true, null);
    if (!e.dead && !e.boss && e.state !== 'stagger') go(this, e, 'stagger', 1.4);
    this.emit({ type: 'affix', id: p.id, affix: 'barbed', x: e.x, z: e.z });
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
        if (d.kind === 'flare') this.blast(d.x, d.z, FLARE_R, d.power, d.owner, { bits: BURN });
      }
    }
    sweep(this.decoys);
  }

  /** How much harder the guns hit in a dash-strike (Lunge Jets: more). */
  private strikeMul(p: Player) {
    return 1 + STRIKE_DMG * (1 + p.stats.mod.strike);
  }

  /**
   * Does a gun's edge hold on `e`, for a shot fired from (ox, oz) by `p`? `held`: seconds a beam
   * has been on it.
   */
  edged(edge: Edge, e: Enemy, p: Player | undefined, ox: number, oz: number, held = 0): boolean {
    if (!p) return false;
    switch (edge) {
      case 'reeling':
        return e.stun > 0 || e.state === 'recover' || e.state === 'stagger';
      case 'close':
        return (e.x - ox) ** 2 + (e.z - oz) ** 2 < EDGE_CLOSE * EDGE_CLOSE;
      case 'far':
        return (e.x - ox) ** 2 + (e.z - oz) ** 2 > EDGE_FAR * EDGE_FAR;
      case 'locked':
        return held >= EDGE_LOCK;
      case 'shocked':
        return e.mk.shock > 0;
      case 'burning':
        return e.mk.burn > 0;
      case 'tell':
        return e.state === 'windup' || this.lasers.some((l) => l.owner === e.id && l.warn > 0);
      case 'crowd': {
        let n = 0;
        for (const o of this.enemies) if (o !== e && !o.dead && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < EDGE_CROWD * EDGE_CROWD && ++n >= 2) return true;
        return false;
      }
      case 'behind':
        return e.z > p.z + 1.5;
      case 'hurt':
        return e.hp < e.max * 0.5;
      case 'skim':
        return p.skim > 0;
    }
  }

  // --- legendary traits that play in flight -----------------------------------------------

  /** BOOMERANG: the shot turns for home, free to hit everything again on the way. */
  private turnHome(s: Shot) {
    s.back = true;
    s.t = 0;
    s.life = BOOMERANG_LIFE;
    s.hit = [];
    s.pierce = Math.max(s.pierce, 1);
    s.x = clamp(s.x, -HALF_W - 1, HALF_W + 1);
    s.z = clamp(s.z, this.top - 1, this.bottom + 1);
    this.emit({ type: 'turn', x: s.x, z: s.z });
  }

  /** A BOOMERANG shot on its way home: it curves round to its ship and is caught there. Returns true if it's done. */
  private homeward(s: Shot) {
    const p = this.players[s.owner];
    if (s.t > s.life || !p || p.down) {
      s.dead = true;
      return true;
    }
    const sp = Math.max(Math.hypot(s.vx, s.vz), BOOMERANG_SPEED);
    const have = Math.atan2(s.vx, -s.vz);
    const want = Math.atan2(p.x - s.x, -(p.z - s.z));
    const da = Math.atan2(Math.sin(want - have), Math.cos(want - have));
    // it swings round wide at first, then comes in hard
    const turn = clamp(da, -BOOMERANG_TURN * DT * (0.4 + s.t * 3), BOOMERANG_TURN * DT * (0.4 + s.t * 3));
    s.vx = Math.sin(have + turn) * sp;
    s.vz = -Math.cos(have + turn) * sp;
    if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 2.2 * 2.2 && s.t > 0.15) {
      s.dead = true;
      return true;
    }
    return false;
  }

  /** A kill by `p`: FRENZIED guns whip up, a RAVENOUS special eats. */
  private fed(p: Player, e: Enemy) {
    const s = p.stats;
    if (s.guns.some((g) => g.frenzied)) {
      p.frenzy = Math.min(FRENZY_MAX, p.frenzy + 1);
      p.frenzyT = FRENZY_TIME;
      this.emit({ type: 'frenzy', id: p.id, stacks: p.frenzy });
    }
    if (s.ravenous && s.special && !this.inSpecial && p.charge < 1) {
      p.charge = Math.min(1, p.charge + RAVENOUS_FEED);
      const full = p.charge >= 1;
      this.emit({ type: 'feed', id: p.id, x: e.x, z: e.z, full });
      if (full) this.emit({ type: 'specialReady', id: p.id });
    }
  }

  /** THUNDEROUS: the dash ends in a clap that shocks what's near, throws it back and blows the bullets away. */
  private thunderclap(p: Player) {
    const k = p.stats.thunder * (p.perfect ? 2 : 1);
    const r = THUNDER_R * (p.perfect ? 1.3 : 1);
    let hit = 0;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.t < 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > r + e.r) continue;
      hit++;
      this.damage(e, THUNDER_DMG * k, p.id, p.perfect);
      if (e.dead) continue;
      mark(this, e, SHOCK, k, p.id);
      // (not the runner's own parts, nor a boarder on a hull: they're fixed to something)
      if (!e.boss && !e.ground && e.d.qp === undefined && e.d.board === undefined) {
        e.kx = (dx / d) * THUNDER_PUSH * k;
        e.kz = (dz / d) * THUNDER_PUSH * k;
        e.stun = Math.max(e.stun, 0.3);
      }
    }
    for (const b of this.bullets) if (!b.dead && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < (r * 0.6) ** 2) this.cancel(b, 0.3);
    this.emit({ type: 'thunder', id: p.id, x: p.x, z: p.z, r, perfect: p.perfect, hit });
  }

  /** REACTIVE: a shield lost lets out a shockwave. */
  private reactive(p: Player) {
    for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < REACTIVE_R * REACTIVE_R) this.cancel(b);
    this.blast(p.x, p.z, REACTIVE_R * 0.8, 14, p.id, { bits: SHOCK, quiet: true });
    this.emit({ type: 'affix', id: p.id, affix: 'reactive', x: p.x, z: p.z });
  }

  /** VENGEFUL: a hit on you lets out a nova: the bullets round you are gone, and shrapnel flies out, harder on a low hull. */
  private nova(p: Player) {
    const power = 1 + 2 * (1 - p.hp / Math.max(1, p.stats.hp));
    for (const b of this.bullets) if (!b.dead && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < NOVA_R * NOVA_R) this.cancel(b, 0.4);
    for (let k = 0; k < NOVA_SHOTS; k++) {
      const s = this.addShot(p.id, 'slug', p.x, p.z, (k / NOVA_SHOTS) * Math.PI * 2 + this.rand() * 0.1, 46, NOVA_DMG * power, 0.55, 1, 0);
      s.tag = 'nova';
      s.marks = CRACK;
    }
    this.emit({ type: 'nova', id: p.id, x: p.x, z: p.z, power });
  }

  /** SENTINEL: each such gun leaves a copy of itself where the dash began (a few at most, the oldest go first). */
  private leaveSentinels(p: Player, x: number, z: number) {
    p.stats.guns.forEach((g, k) => {
      if (!g.sentinel) return;
      const mine = this.sentinels.filter((t) => t.owner === p.id && !t.dead);
      if (mine.length >= SENTINEL_MAX) mine[0].dead = true;
      this.sentinels.push({ owner: p.id, gun: k, x: clamp(x + g.x * 1.5, -HALF_W + 1.5, HALF_W - 1.5), z: z + g.z, dir: g.dir, t: 0, life: SENTINEL_LIFE, cd: 0.25, shots: 0, dead: false });
      this.emit({ type: 'sentinel', id: p.id, gun: k, x: x + g.x, z: z + g.z });
    });
  }

  /** Sentinels hold still on the screen, turn to the nearest enemy and fire their gun at it. */
  private updateSentinels(dz: number) {
    for (const t of this.sentinels) {
      t.t += DT;
      t.z -= dz;
      const p = this.players[t.owner];
      const g = p?.stats.guns[t.gun];
      if (!p || !g || t.t >= t.life || this.state === 'clear' || t.z > this.bottom + 2) {
        t.dead = true;
        continue;
      }
      const target = this.autoTarget(t.x, t.z, SENTRY_RANGE + 6);
      const want = target ? Math.atan2(target.x - t.x, -(target.z - t.z)) : g.dir;
      const da = Math.atan2(Math.sin(want - t.dir), Math.cos(want - t.dir));
      t.dir += clamp(da, -8 * DT, 8 * DT);
      t.cd -= DT;
      if (t.cd > 0 || !target || Math.abs(da) > 0.5 || t.t < 0.2) continue;
      t.cd += 1 / (g.spec.rate * SENTINEL_RATE);
      t.cd = Math.max(t.cd, 0);
      t.shots++;
      this.fire(p, g, t.x + Math.sin(t.dir) * 0.6, t.z - Math.cos(t.dir) * 0.6, t.dir, 0, SENTINEL_DMG, true);
    }
    sweep(this.sentinels);
  }

  /**
   * The Weld: full, with the hull short and the trigger let go, holding focus starts it. For the
   * first WELD.hold it's only a hold (let go and nothing's lost); then it's under way and can't be
   * stopped: the ship crawls, the guns are quiet. Returns whether it's under way.
   */
  private updateWeld(p: Player, i: Intent) {
    if (p.weldT >= WELD.hold) {
      p.weldT += DT;
      if (p.weldT >= WELD.hold + WELD.time) {
        p.hp = Math.min(p.stats.hp, p.hp + Math.round(p.stats.hp * WELD_HEAL));
        p.weld = 0;
        p.weldT = 0;
        p.welds++;
        this.emit({ type: 'weld', id: p.id, state: 'done', x: p.x, z: p.z });
        return false;
      }
      return true;
    }
    const can = p.weld >= 1 && p.hp < p.stats.hp && i.focus && !i.fire && p.dashT <= 0 && !p.hook && this.state !== 'clear';
    p.weldT = can ? p.weldT + DT : 0;
    if (p.weldT < WELD.hold) return false;
    this.emit({ type: 'weld', id: p.id, state: 'start', x: p.x, z: p.z });
    return true;
  }

  /** The Weld charging: `k` of a full one. */
  feedWeld(p: Player, k: number) {
    // (not what a special does: that's its own reward)
    if (p.down || p.weld >= 1 || k <= 0 || this.inSpecial) return;
    p.weld = Math.min(1, p.weld + k);
    if (p.weld >= 1) this.emit({ type: 'weld', id: p.id, state: 'ready', x: p.x, z: p.z });
  }

  /** A blow: a hit that breaks plating at full strength (the stream only chips it). */
  private isBlow(p: Player | undefined, dmg: number, crit: boolean, s?: Shot) {
    if (crit || this.blowing > 0 || dmg >= BLOW_DMG) return true;
    if (s) return !!s.heavy || !!s.strike || s.tag === 'reflect' || s.tag === 'mirror' || s.tag === 'nova';
    // beams and arcs: out of a dash
    return !!p && p.strike > 0;
  }

  /** A dash out of fire, timed right: what would have hit where you were is soaked up, and the dash given back. */
  perfectDash(p: Player) {
    let absorbed = 0;
    const gz = this.scroll + p.slipZ;
    const near = (b: Bullet) => (b.x - p.slipX) ** 2 + (b.z - gz) ** 2 < PERFECT_R * PERFECT_R;
    for (const b of this.bullets)
      if (!b.dead && near(b)) {
        this.cancel(b, 0.6);
        absorbed++;
      }
    if (p.perfect) return;
    p.perfect = true;
    p.perfects++;
    p.dashes = Math.min(p.stats.dashes, p.dashes + 1);
    // the Wasp gets them all back and skips the recovery; the afterimage burns hotter
    if (p.stats.mod.refill) {
      p.dashes = p.stats.dashes;
      p.dashLock = Math.min(p.dashLock, p.dashT);
    }
    this.reloadHeavies(p);
    for (const d of this.decoys) if (d.kind === 'ghost' && d.owner === p.id && d.t < p.stats.slip + DT) d.power *= 2;
    p.burn = Math.min(1, p.burn + BURN_PERFECT);
    this.feedWeld(p, WELD.perfect);
    // a perfect read: through a boss's attack it wears its poise hard, through its signature it breaks it
    for (const e of this.enemies) if (e.boss && !e.dead && e.state === 'attack') bossRead(this, e);
    this.emit({ type: 'perfect', id: p.id, x: p.x, z: p.z, absorbed });
    const af = p.stats.affixes;
    // DEFLECTING: what it soaked goes back at them (at least a few, to the nearest)
    if (af.deflecting) {
      for (let k = 0; k < Math.min(8, Math.max(3, absorbed)); k++) {
        const t = this.nearest(p.x, p.z);
        const dir = t ? Math.atan2(t.x - p.x, -(t.z - p.z)) : 0;
        this.addShot(p.id, 'slug', p.x, p.z, dir + (k - 1.5) * 0.12, 55, DEFLECT_DMG, 1, 0, 1).tag = 'reflect';
      }
      this.emit({ type: 'affix', id: p.id, affix: 'deflecting', x: p.x, z: p.z });
    }
    // ADRENAL: the kit comes up
    if (af.adrenal) {
      const was = p.charge;
      p.charge = Math.min(1, p.charge + 0.2);
      if (was < 1 && p.charge >= 1 && p.stats.special) this.emit({ type: 'specialReady', id: p.id });
      if (p.auxCd > 0) p.auxCd = Math.max(0, p.auxCd - p.auxMax * 0.5);
      this.emit({ type: 'affix', id: p.id, affix: 'adrenal', x: p.x, z: p.z });
    }
    if (p.stats.guns.some((g) => g.primed)) {
      if (p.primeT <= 0) this.emit({ type: 'affix', id: p.id, affix: 'primed', x: p.x, z: p.z });
      p.primeT = PRIMED_TIME;
    }
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
      if (p.crate) p.fuse -= HOT_JOLT;
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
/** How far scrap is pulled in from. */
const MAGNET = 4;
const MIRROR_DMG = 8;
const SENTRY_RANGE = 30;
/** Catalyst: how close the dash must pass a marked enemy (past its edge) to set it off. */
const CATALYST_REACH = 3;
/**
 * The dash-strike: for this long from the start of a dash, what the guns fire hits this much
 * harder. Dash in, and the guns answer: the dash is an attack, not just a way out.
 */
const STRIKE_TIME = 0.4;
const STRIKE_DMG = 0.5;
/** The edges: point-blank and long-shot reach, a beam's lock-on, a crowd's reach. */
const EDGE_CLOSE = 8;
const EDGE_FAR = 24;
const EDGE_LOCK = 0.8;
const EDGE_CROWD = 6;
/** Legendary traits. SENTINEL: how long a turret lasts, how many a ship can leave, its rate and punch against the gun's. */
const SENTINEL_LIFE = 3;
const SENTINEL_MAX = 3;
const SENTINEL_RATE = 0.8;
const SENTINEL_DMG = 0.7;
/** BOOMERANG: how long it has to get home, how fast it comes, how hard it turns. */
const BOOMERANG_LIFE = 2.2;
const BOOMERANG_SPEED = 34;
const BOOMERANG_TURN = 7;
/** FRENZIED: fire rate per kill in a row, how many count, and how long they last without another. */
const FRENZY_EACH = 0.15;
const FRENZY_MAX = 6;
const FRENZY_TIME = 2.5;
/** THUNDEROUS: the clap's reach, its blow, how hard it throws. */
const THUNDER_R = 6;
const THUNDER_DMG = 10;
const THUNDER_PUSH = 26;
/** VENGEFUL: how far the nova wipes bullets, its shrapnel, and each piece's punch (×1..3 by hull lost). */
const NOVA_R = 9;
const NOVA_SHOTS = 18;
const NOVA_DMG = 9;
/** RAVENOUS: special charge per kill. */
const RAVENOUS_FEED = 0.1;
/**
 * Hot crates: the fuse it starts at, how fast it burns down (a second's worth), how much of the Burn
 * you earn winds it, what a hit knocks off it, and the Burn you get back when it cracks open.
 */
const HOT_START = 0.5;
const HOT_BURN = 0.02;
const HOT_FEED = 1;
const HOT_JOLT = 0.12;
const HOT_OPEN_BURN = 1;
/**
 * The hull is a number (a frame's 60 to 100), and a hit takes what it's worth. A GRAZE of light
 * stuff (spores, acid, a jet's wash), a HIT (shots, shells, rams, the land), or a HEAVY blow (big
 * orbs, torpedoes, seekers, slams, lightning, beams, a crate going up): the bigger the tell, the
 * more it takes. Hits grow with the run, as the enemies' hulls do.
 */
export type HitTier = 'graze' | 'hit' | 'heavy';
export const HIT_DMG: Record<HitTier, number> = { graze: 8, hit: 15, heavy: 30 };
const HIT_GROWTH = 0.3;
const HEAVY_CAUSES = new Set(['torpedo', 'seeker', 'slam', 'ball', 'lightning', 'laser', 'crate']);
const GRAZE_CAUSES = new Set(['spore', 'acid', 'puddle', 'jetwash']);
export const tierOf = (cause: string): HitTier => (HEAVY_CAUSES.has(cause) ? 'heavy' : GRAZE_CAUSES.has(cause) ? 'graze' : 'hit');
const BULLET_TIER: Record<BulletKind, HitTier> = { orb: 'hit', needle: 'hit', mine: 'hit', spore: 'graze', big: 'heavy', torpedo: 'heavy', seeker: 'heavy' };
/** A step of hull (the old pip): a repair kit's worth, a dock's patch, an event's knock. */
export const HULL_STEP = 20;
/** Shares of the hull: a Weld mends this much, a revive comes back with this, a SECOND WIND leaves this. */
const WELD_HEAL = 0.25;
const REVIVE_HULL = 0.4;
const SECOND_WIND = 0.1;
/** Affixes (see AFFIXES in game/loot.ts). */
const SPITE_TIME = 5;
const SPITE_DMG = 1.7;
const PRIMED_TIME = 3;
const PRIMED_DMG = 1.6;
const GIANT_DMG = 1.6;
/** GIANTSLAYER: anything this big (or an elite, or a Warden) counts. */
const GIANT_R = 2.2;
const EXECUTE = 0.15;
const BLAST_R = 2.6;
const RICOCHET_REACH = 16;
const SCAVENGE_REPAIR = 0.04;
const DEFLECT_DMG = 16;
const AFTERBURN_DMG = 4;
const AFTERBURN_LIFE = 1.4;
const BARB_DMG = 40;
const REACTIVE_R = 7;
const LINGER = 1.5;
/**
 * Takedowns: a dash through something staggered. Its hit (a share of the hull: a boss's is less),
 * and how much more Burn it gives. The reach is past touching, so a dash that skims it counts.
 */
const TAKEDOWN_FOE = 0.6;
/** A hit this big is a blow whatever fired it (see isBlow). */
const BLOW_DMG = 20;
/** A boss takes the stream at this, unless it's open (after a move, or staggered). */
const BOSS_GLANCE = 0.7;
/** Blows wear a boss's poise this much harder. */
const POISE_BLOW = 1.5;
/**
 * The Weld: `hold` before it's under way, `time` it takes then, the speed it crawls at (of top).
 * What charges it, as shares of a full one: per point of damage from the stream and from blows
 * (a hit counts up to `cap`), and per perfect dash, parry (a use) and takedown (an elite's, or a
 * boss's first a phase: `bigTakedown`). About 40 s of good fighting fills it.
 */
export const WELD = {
  hold: 0.2,
  time: 1,
  crawl: 0.2,
  stream: 1 / 6000,
  blow: 1 / 1000,
  cap: 60,
  perfect: 1 / 30,
  parry: 1 / 25,
  takedown: 1 / 6,
  bigTakedown: 0.5,
};
const TAKEDOWN_MIN = 60;
const TAKEDOWN_BOSS = 0.045;
const TAKEDOWN_REACH = 1;
const BURN_TAKEDOWN = 0.25;
/** Escorts: a hauler draws aimed fire only when it's this much nearer (squared) than you. */
const HAULER_BIAS = 1.6;

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
