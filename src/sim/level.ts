/**
 * One level: the land scrolling by, one or two ships, everything shooting at them, and what they
 * pick up. `step(intents)` advances it one 60th of a second. It knows nothing of three.js; what
 * the view needs to make a fuss about (a hit, an explosion, a graze) goes into `events`, which the
 * view empties each frame.
 */

import type { Archetype, Biome, EnemySkin, Planet } from '../world/planets';
import { DT, FLIGHT_Y, HALF_H, HALF_W, NEUTRAL, OFF_BOTTOM, REACH_W, toFlight, type Intent } from './types';
import { Terrain } from './terrain';
import { SHIELD_CELL, stats, type Build, type Gun, type Stats } from './build';
import { rng, type Rng, clamp, damp, lerp, pick } from '../util';
import { Director } from './director';
import { updateEnemy, enemyRadius, type EnemyData } from './enemies';
import { bossRead, bossUnplated, type BossState, type BossStyle, type Read } from './boss';
import { CHAIN, PLATE, PLATE_GLANCE, plated, foeDefaults, foeHurt, go, lookOf, release, winded, foeShot, foeTaken, wearGuard, killHow, onKill, tickCombat, type FoeEvent, type FoeFields } from './combat';
import { ELITE_NAMES, FOES, POPCORN, factionOf, isFoe, type Faction, type Foe } from './factions';
import { updateStrikes, type Strike } from './strikes';
import type { AuxKind, Edge, MarkKind } from '../game/parts';
import { BURN, CRACK, SHOCK, detonate, mark, markTaken, marksOn, newMarks, spread, tickMarks, type Marks, type ReactionKind } from './marks';
import { Convoy } from './convoy';
import { Heist } from './heist';
import { rollItem, rollTier, tierOf as itemTier, type AffixId, type Item, type Tier } from '../game/loot';
import { Grafting, newGraftState, type GraftState } from './grafting';
import { bondsOf, type GraftId, type Grafts, type Wreck } from '../game/grafts';
import { LONG_SLOW, Mind, newMindState, type MindState, type MindWhat } from './mind';
import { UNBENDING_HULL, waysOf, type CoreKit, type ImprintId } from '../game/core';
import { canParryProjectile } from './parry';
import { fairFire, newFairLog } from './fair';
import { kitAux, kitGraze, kitShip, kitSoak, kitSpecial, kitTakedown, kitWalls, kitWorld, type KitWhat } from './kit';
import { armShot, axEdge, cashIn, preMove, ripeness, shotLanded, tickAx, type Ax, type CashKind, type ShotAx } from './arsenal';

export type Mode = 'raid' | 'hunt' | 'escort' | 'heist' | 'boss';
/** The two ways to a perfect: dash out of fire in the slip, or parry it in the guard's first instant. */
export type PerfectHow = 'dash' | 'parry';

// Boosting, and what doing it well pays: the numbers the feel hangs on.
/** Boost is a surge of your own ship: faster, up the screen unless steered, sliding more. */
const SURGE_SHIP = 0.9;
const SURGE_PUSH = 0.7;
/** Seconds between heavy rounds while the button's held. */
const HEAVY_GAP = 0.22;
/** Enemy fire, all of it, this much quicker than it's written (playtest: everything felt a touch slow). */
const FIRE_PACE = 1.4;
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
/** The ship's body against the land and obstacles: how far round its middle it touches. */
const BODY = 0.7;
/** Round the body's edge: where the land is felt for. */
const RIM = Array.from({ length: 12 }, (_, k) => [Math.cos((k / 12) * Math.PI * 2), Math.sin((k / 12) * Math.PI * 2)]);
/** A kill this close is point-blank: a little Burn. */
const POINT_BLANK = 7;
/** A Tender's seam: its last seconds, cooling, harmless (and drawn dull). */
export const SEAM_COOL = 0.3;
/*
 * The dash (its speed, length and recovery are the frame's: see stats): a burst, and not a safe one:
 * what it runs into still hits you (unless a Slip Field makes it untouchable). Fire that would have
 * hit where you dashed from, during the opening slip, is a perfect.
 */
/**
 * A dash pressed too soon (in the dash, or its recovery) is held this long and goes the moment it
 * can: mashing through a recovery never eats a press.
 */
const DASH_QUEUE = 0.3;
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
  /** False in a run: parts come only as the site's reward, so what would drop one in flight pays scrap. */
  parts?: boolean;
  /** A Warden's hull, of its full (stages won on its ground take some off). */
  bossHull?: number;
}

export interface Player {
  id: number;
  build: Build;
  stats: Stats;
  x: number;
  z: number;
  /** Where it was at the start of this step (fire is checked along the way, not just where it ended up). */
  ox?: number;
  oz?: number;
  vx: number;
  vz: number;
  hp: number;
  shield: number;
  shieldWait: number;
  /** What's left this level to refill the shield from (full again at the next). */
  shieldStore: number;
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
  /** A partner's jumpstart, under way (s). */
  jump: number;
  /** How long it's been down with nobody close: at JUMP_WAIT it crashes, and is `out` for the level. */
  downT: number;
  out: boolean;
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
  /** How hard it's boosting this frame, 0..1 (0 once the Burn runs out). The boost is cut: always 0. */
  boosting: number;
  /** The heavy button held last step (a fresh press clicks even when dry; a hold doesn't). */
  heavyHeld: boolean;
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
  /** A dash pressed and not gone yet: seconds it's held for (see DASH_QUEUE). */
  dashQ: number;
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
  /**
   * RIPOSTE: seconds left after a perfect parry in which everything the guns fire crits (and so
   * breaks plating). The dash's answer is the dash-strike; the guard's is this, longer.
   */
  riposte: number;
  /** The Kestrel's FLY-BY: the foes this dash has passed close to (their ids), paid back as it ends. */
  tagged: number[];
  /** The FLY-BY volley in flight: the rounds still to land, one after another (seconds till each), and how many it has killed. */
  volley: { id: number; t: number; dmg: number; n: number }[];
  volleyKills: number;
  volleyOf: number;
  /** Grazes towards the next round a Graze Fins feeds. */
  grazeFeed: number;
  /** Perfects in a row, each within PERFECT_CHAIN of the last (for the view's pitch and count), and the time since the last. */
  chain: number;
  chainT: number;
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
  /** A volatile crate carried (see HOT): what's in it, how far its lock has cracked (1: open), and whether a hit has set it off. */
  crate?: Item;
  crack: number;
  blow: boolean;
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
  /** Wreck grafts bolted onto its verbs, the bonds they wake, and their working state (see grafting.ts). */
  grafts: Grafts;
  bonds: Faction[];
  gs: GraftState;
  /** The ship's core: what it holds and knows, and the fight's tally of what fed it (see mind.ts). */
  ch: MindState;
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
  /** A graft's (see grafting.ts); `blow`: it breaks plating at full strength, whatever its punch. */
  graft?: GraftId;
  blow?: boolean;
  /** SQUARE TURN: 0 looking for one to turn into, 1 holding (`halt` more) before it goes off at (nvx, nvz), 2 done. */
  sq?: number;
  halt?: number;
  nvx?: number;
  nvz?: number;
  /** The arsenal's dials it carries (see arsenal.ts), and the part that fired it (for the tally). */
  ax?: ShotAx;
  src?: string;
  dead: boolean;
}

/** torpedo: a homing round that can be shot down (see TORPEDO); seeker: the lattice's, that only turns square and can't be shot (see SEEKER). */
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
  /** How fast that ring flies (a true speed, its family's: see volleys.ts); else a plain 9. */
  splitV?: number;
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
  /** Who fired it (a foe's kind, a boss's move), for the flight recorder. */
  from?: string;
  /** Fired this frame, not yet checked for a way through (see fair.ts). */
  fresh?: boolean;
  /** Where it was before this step's move (see `closest`). */
  ox?: number;
  oz?: number;
}

/** Torpedoes: drift out for `launch` seconds, then light and chase (turning at `turn` rad/s, up to `speed`) until `fuel` runs out. */
/** How fast loose scrap sinks down the screen (units a second), to fall off the bottom if no one takes it. */
const SCRAP_DRIFT = 4;
export const TORPEDO = { launch: 0.45, fuel: 2.8, turn: 2.1, speed: 19, accel: 26, hp: 12, life: 5 };

/**
 * Seekers (the Rook's): they fly with the screen, dead straight, and only ever turn square. Once its
 * prey is level with it (or it meets the edge), one stops, points down its next leg for `halt`
 * seconds while that lane is drawn, then snaps off down it, kicking up to `speed`. `turns` turns
 * and it flies its last leg out. The first leg runs `out` seconds before it starts hunting. Guns
 * and fire pass through it: a seeker is dodged, never shot down.
 */
export const SEEKER = { out: 0.45, leg: 0.18, halt: 0.5, turns: 3, kick: 5, speed: 21, accel: 80, life: 10 };

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
  /** Chilled, frozen, pinned, flung (see arsenal.ts). */
  ax?: Ax;
  /** An elite a takedown's landed on: who by (its wreck is theirs when it goes down). */
  downBy?: number;
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
  /** On a boss's tow line (ARU-0's Lien): it moves it, not the screen. */
  towed?: boolean;
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
  /** Where it comes up out of the ground (a spore cloud out of its vent), the ground's height there. */
  from?: number;
}

export type LevelEvent =
  /** `turret`: fired by a SENTINEL left behind, not the ship. */
  | { type: 'shot'; owner: number; kind: Gun['spec']['shot']; x: number; z: number; dir: number; turret?: boolean; heavy?: boolean; src?: string; ripe?: number }
  /** HEAVY guns: the button pressed (`fired` rounds went, 0: all dry), a round back (`perfect`: a perfect gave it). */
  | { type: 'heavy'; id: number; x: number; z: number; fired: number }
  | { type: 'reload'; id: number; gun: number; perfect: boolean; rounds: number }
  /** `dot`: a burn's tick, not a blow. */
  /** `edge`: the crit was the gun's edge; `strike`: a dash-strike's. */
  /** `armour`: it landed on plating; `blow`: a hit that breaks plating at full strength (see isBlow). */
  | { type: 'hit'; x: number; z: number; enemy: number; dmg: number; kill: boolean; crit: boolean; dot?: boolean; edge?: Edge; strike?: boolean; armour?: boolean; blow?: boolean; src?: string }
  | { type: 'explode'; x: number; z: number; y: number; size: number; color: number; enemy?: number }
  | { type: 'enemyShot'; x: number; z: number; color: number; look?: Faction }
  /** A bullet cancelled (by a bomb, a perfect, a hit): it pops instead of vanishing. */
  | { type: 'bulletPop'; x: number; z: number; color: number; look: Faction }
  /** A torpedo goes off: shot down, or burnt out at the end of its run. */
  | { type: 'torpedo'; x: number; z: number; color: number; shot: boolean }
  /** A seeker stops to turn (`n` turns made so far), goes off down its new leg, is shot down, or breaks on a hull. */
  | { type: 'seeker'; x: number; z: number; color: number; how: 'halt' | 'go' | 'shot' | 'hit'; n: number }
  /** `shield`: the shield took all of it; `dmg` and `tier`: what got through to the hull; `soak`: what the shield took. */
  /** `cause`: what kind of thing hit (bullet, laser, land, ram:<kind>); `by`: who fired it, where known (a foe's kind, a boss's move). */
  | { type: 'playerHit'; id: number; shield: boolean; x: number; z: number; dmg?: number; tier?: HitTier; soak?: number; cause: string; by?: string }
  /** A ship into the land or an obstacle: (x, z) where it struck, (nx, nz) the way it was thrown off. */
  | { type: 'crash'; id: number; x: number; z: number; nx: number; nz: number }
  /** A player's shot meeting the land: stopped there, or (`bounce`) glancing off it. */
  | { type: 'shotLand'; x: number; z: number; bounce: boolean; heavy: boolean; src?: string }
  | { type: 'down'; id: number; x: number; z: number }
  /** A down ship nobody jumpstarted in time: it goes in, and is out for the level. */
  | { type: 'crashed'; id: number; x: number; z: number }
  /** `by`: the partner who brought it back (its jolt clears the bullets round it). */
  | { type: 'jumpstart'; id: number; by: number }
  | { type: 'graze'; id: number; x: number; z: number }
  /** An Echo Coil's free volley, off a gun. */
  | { type: 'echo'; id: number; x: number; z: number }
  /** The Kestrel's FLY-BY: a foe tagged as the dash passes it, and the volley as the dash ends (at each tagged foe). */
  | { type: 'tag'; id: number; enemy: number; x: number; z: number }
  | { type: 'flyby'; id: number; x: number; z: number; to: { x: number; z: number }[] }
  /** A FLY-BY round landing: the `n`th of `of`, from the ship at (fx, fz); `sweep` on the last when it killed two or more (the dash back). */
  | { type: 'flybyHit'; id: number; enemy: number; x: number; z: number; fx: number; fz: number; n: number; of: number; kill: boolean; sweep: boolean }
  /** The new kit (see kit.ts): the Bulwark, the Swap Beacon, the skins and the bombs. */
  | { type: 'kit'; id: number; what: KitWhat; x: number; z: number; n?: number; x2?: number; z2?: number }
  | { type: 'dash'; id: number; x: number; z: number; dx: number; dz: number }
  /** Dash pressed with none left (and none back in time). */
  | { type: 'dashDry'; id: number }
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
  /** A titan's core waking, its Tenders climbing out (y: the core's height). */
  | { type: 'brood'; x: number; z: number; y: number }
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
  | { type: 'perfect'; id: number; x: number; z: number; absorbed: number; how: PerfectHow; chain: number }
  /** Flying a hair from the land or an obstacle (a few times a second while it lasts): (x, z) is the near point, `close` 0..1. */
  | { type: 'skim'; id: number; x: number; z: number; close: number }
  /** A kill from up close. */
  | { type: 'pointBlank'; id: number; x: number; z: number }
  /** Every one of a wave killed: `bonus` scrap, paid at (x, z) (the last kill). */
  | { type: 'waveClear'; wave: number; bonus: number; x: number; z: number }
  /** An enemy got away (off the screen, or a bounty's time ran out). */
  | { type: 'escaped'; enemy: number; x: number; z: number; kind: string }
  /** A bounty showed up, was claimed (killed: `reward` paid), or escaped. */
  | { type: 'bounty'; state: 'appear' | 'claimed' | 'escaped'; enemy: number; x: number; z: number; reward: number }
  /** On a clear: the fight's tally; the rank and the scrap it earned. */
  | { type: 'tally'; killed: number; spawned: number; missed: number; waves: number; cleared: number; full: boolean; rank: Rank; bonus: number }
  /** The aux went off. */
  | { type: 'aux'; id: number; kind: AuxKind; x: number; z: number }
  /** A parry: `count` bullets thrown back (the opening instant of a Parry Emitter burst). */
  | { type: 'parry'; id: number; x: number; z: number; count: number; first: boolean }
  /** The guard burst ran out with nothing in it (a long wait), or a block gave out under fire. */
  | { type: 'guardOut'; id: number; x: number; z: number; how: 'whiff' | 'broke' }
  /** A small shot broken on the Hammerhead's head in a dash. */
  | { type: 'plough'; id: number; x: number; z: number }
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
  /** `heavy`: the Hammerhead's ram on something plated or elite (it breaks the plating). */
  | { type: 'ram'; id: number; x: number; z: number; enemy: number; heavy?: boolean }
  /** Hair Trigger: crits on (after a perfect) or off. */
  /** A flare or an afterimage appeared (it lives in Level.decoys). */
  | { type: 'decoy'; id: number; kind: Decoy['kind']; x: number; z: number }
  /** A mark took on an enemy (it wasn't carrying that one). */
  | { type: 'mark'; enemy: number; kind: MarkKind; x: number; z: number }
  /** Two marks met on an enemy (see marks.ts). */
  | { type: 'reaction'; kind: ReactionKind; enemy: number; x: number; z: number; owner: number }
  /** The arsenal (see arsenal.ts): frozen, thawed, a burn doused, pinned, a flung body landing, a setup cashed in. */
  | { type: 'freeze' | 'thaw' | 'douse' | 'pin'; enemy: number; x: number; z: number }
  /** A torch's plasma melts an enemy bullet. */
  | { type: 'melt'; x: number; z: number }
  | { type: 'thud'; x: number; z: number }
  | { type: 'cash'; kind: CashKind; enemy: number; x: number; z: number; to: { x: number; z: number }[] }
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
  /** A volatile crate: there to take (`id` -1), taken, a bolt given (`n` of HOT_BOLTS), cracked open (the part's yours), blown (a hull and the part gone), or let go at the level's end. */
  | { type: 'hot'; id: number; state: 'appear' | 'on' | 'bolt' | 'open' | 'blown' | 'lost'; x: number; z: number; part?: Item; n?: number }
  /** A graft went off (`what` it did: see grafting.ts), at (x, z), with a line to (x2, z2) or a count where it has one. */
  | { type: 'graft'; id: number; graft: GraftId; what: string; x: number; z: number; x2?: number; z2?: number; n?: number }
  /** The ship's core did something (see mind.ts): `n` a count where it has one; `say`: what a woken core barks about. */
  | { type: 'core'; id: number; what: MindWhat; x: number; z: number; n: number; imprint?: ImprintId; say?: 'perfect' | 'takedown' | 'weld' | 'hurt' | 'call' }
  /** A bond did its thing. */
  | { type: 'bond'; id: number; faction: Faction; x: number; z: number }
  /** An elite went down: its wreck is `id`'s to salvage (or, `lost`, nobody took it down first). */
  | { type: 'wreck'; id: number; enemy: number; x: number; z: number; title: string; kind: string; faction: Faction; lost: boolean }
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

/** Who an enemy's fire is put down to: its kind (an elite's own), or a boss's move. */
function firer(e: Enemy | undefined): string | undefined {
  if (!e) return undefined;
  const b = e.boss;
  if (b) {
    const list = b.patterns[b.phase] ?? [];
    return `boss:${b.move ?? (list.length ? list[b.current % list.length] : 'boss')}`;
  }
  return e.elite ? `elite:${e.arch}` : e.arch;
}

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
  /** Beams from their owner to (x2, z2); `r0`: it starts that far out (nothing nearer is hit). */
  /** `tow`: a tow line, not a beam (ARU-0's Lien: drawn as a cable, hurts the same). */
  /**
   * Beams from their owners. `seam`: a weld line a Tender draws as it darts (sim/foes.ts), left
   * where it was drawn (riding the screen), narrow, and burning on after its welder's gone; `grow`:
   * still being drawn, its far end on the welder.
   */
  readonly lasers: { x: number; z: number; x2: number; z2: number; warn: number; on: number; color: number; owner: number; r0?: number; tow?: boolean; seam?: boolean; grow?: boolean }[] = [];
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
  /** What each pilot scooped up themselves (theirs to keep; the rest of `scrap` is the crew's). */
  scrapBy: number[] = [];
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
  /** The grafts' doings, and what they leave about. */
  readonly grafting: Grafting;
  /** Wrecks taken: elites taken down and finished, each one theirs to salvage at the results. */
  readonly wrecks: Wreck[] = [];
  /** The ships' cores in flight. */
  readonly mind: Mind;
  /** THE LONG SECOND: seconds left of the enemy's fire crawling. */
  slowBullets = 0;
  /** Boss phases a takedown has already filled the Weld half in. */
  private readonly tookPhase = new Set<number>();
  /** Inside a blast: its hits are blows (see isBlow). */
  private blowing = 0;
  /** Blows cash in setups (see arsenal.ts). Off only for old recordings, and in the forge to compare. */
  combos = true;
  /** Damage dealt, by what dealt it (a part's id, a reaction, a cash-in), and the cash-ins, by kind. */
  dealtBy: Record<string, number> = {};
  cashed: Record<string, number> = {};
  /** Who the damage being dealt now is put down to, when it isn't a shot's. */
  credit: string | null = null;
  /** Who's firing now (the foe being updated), so its bullets carry it (see Bullet.from). */
  firing: string | undefined;
  /** What fair fire took out to keep a way through (see fair.ts). */
  fair = newFairLog();
  private nextId = 1;
  private biomeShown = -1;

  constructor(
    readonly spec: LevelSpec,
    builds: Build[],
    /** Players' hull carried over from the last level (or full). */
    hull?: number[],
    /** Their wreck grafts. */
    grafts?: Grafts[],
    /** Their cores (what each holds and knows), and how hard the Engine calls in this fight. */
    kits?: CoreKit[],
    call = 0,
  ) {
    this.rand = rng(spec.seed);
    this.terrain = new Terrain(
      spec.seed,
      spec.biomes.map((biome) => ({ biome, length: spec.length })),
    );
    this.speed = 9;
    this.speedNow = this.speed;
    builds.forEach((b, i) => {
      // (a copy: the core changes it for the level)
      const s0 = stats(b);
      const s = { ...s0, guns: s0.guns.map((g) => ({ ...g })) };
      const kit = kits?.[i];
      if (kit?.held.includes('unbending')) s.hp += UNBENDING_HULL;
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
        shieldStore: s.shield * SHIELD_STORE,
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
        jump: 0,
        downT: 0,
        out: false,
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
        heavyHeld: false,
        burnWait: 0,
        skim: 0,
        skimT: 0,
        slip: 0,
        slipX: 0,
        slipZ: 0,
        dashLock: 0,
        dashQ: 0,
        perfect: false,
        perfects: 0,
        boostTime: 0,
        skimTime: 0,
        auxCd: 0,
        auxMax: 1,
        auxT: 0,
        parryT: 0,
        riposte: 0,
        tagged: [],
        volley: [],
        volleyKills: 0,
        volleyOf: 0,
        grazeFeed: 0,
        chain: 0,
        chainT: 9,
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
        crack: 0,
        blow: false,
        weld: 0,
        weldT: 0,
        welds: 0,
        weldsLost: 0,
        grafts: { ...(grafts?.[i] ?? {}) },
        bonds: bondsOf(grafts?.[i] ?? {}, waysOf(kit?.held ?? [])),
        gs: newGraftState(),
        ch: newMindState(kit),
      });
    });
    this.grafting = new Grafting(this);
    this.mind = new Mind(this);
    this.mind.call = call;
    for (const p of this.players) this.mind.start(p);
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
    this.mind?.heard(e);
  }

  /** The bonds again, after a faction's ways were shaken out of a core. */
  rebond(p: Player) {
    p.bonds = bondsOf(p.grafts, waysOf(p.ch.held));
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

    for (const p of this.players) {
      p.ox = p.x;
      p.oz = p.z;
    }
    for (let i = 0; i < this.players.length; i++) this.updatePlayer(this.players[i], intents[i] ?? NEUTRAL, dz);
    this.updateJumpstarts();
    this.convoy?.update(dz);
    this.heist?.update(dz);
    this.director.update();
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!e.ground) e.z -= dz;
      e.t += DT;
      e.flash = Math.max(0, e.flash - DT);
      e.stun = Math.max(0, e.stun - DT);
      preMove(e, dz);
      this.firing = firer(e);
      updateEnemy(this, e);
      this.firing = undefined;
      if (e.kx || e.kz) {
        e.x += e.kx! * DT;
        e.z += e.kz! * DT;
        e.kx! *= 0.86;
        e.kz! *= 0.86;
        if (Math.abs(e.kx!) + Math.abs(e.kz!) < 0.5) e.kx = e.kz = 0;
      }
      tickAx(this, e);
      if (!e.dead) tickMarks(this, e);
      if (!e.ground && !e.boss && !e.dead && e.state !== 'hidden' && !(e.d.board !== undefined && e.d.ph === 3) && e.d.qp === undefined) this.keepOffRock(e);
      // gone off the bottom (or far off the sides), or a bounty out of time: it got away
      if (e.z > this.scroll + OFF_BOTTOM + 4 || e.z < this.top - 40 || Math.abs(e.x) > HALF_W + 26) {
        if (e.t > 1 && !e.boss) this.escape(e);
      } else if (e.bounty && e.t > e.bounty.life) this.escape(e);
    }
    this.updateShots();
    this.updateBullets(dz);
    this.updateLasers(dz);
    updateStrikes(this, dz);
    this.grafting.update(dz);
    tickCombat(this);
    this.updatePickups(dz);
    this.updateDecoys(dz);
    this.updateSentinels(dz);
    this.updateHazards(dz);
    kitWorld(this, dz);
    fairFire(this);
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
  private updateSpeed(_intents: Intent[]) {
    const over = this.state === 'clear' || this.state === 'failed';
    for (const p of this.players) {
      // (the boost is cut: nothing boosts, the autopilot included; see docs/simple-run.md)
      const press = 0;
      this.tickCrate(p);
      const want = p.down || over || p.burn <= 0 ? 0 : press;
      const was = p.boosting > 0.05;
      p.boosting = want;
      p.burn = Math.max(0, p.burn - BURN_DRAIN * p.boosting * DT);
      // let go, and after a moment it comes back on its own (a racer's quickly, a hauler's slowly)
      if (p.boosting > 0.05) p.burnWait = BURN_WAIT;
      else if ((p.burnWait = Math.max(0, p.burnWait - DT)) <= 0 && !p.down) p.burn = Math.min(1, p.burn + p.stats.burnBack * DT);
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
    this.emit({ type: 'escaped', enemy: e.id, x: e.x, z: e.z, kind: e.boss ? 'boss' : e.elite ? `elite:${e.arch}` : e.arch });
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
    p.riposte = Math.max(0, p.riposte - DT);
    if ((p.chainT += DT) > PERFECT_CHAIN) p.chain = 0;
    p.focus = i.focus;
    const welding = this.updateWeld(p, i);
    // a SKY DIVE has the ship till it's done
    const diving = this.grafting.diving(p);
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
    const top = welding && !this.mind.fieldWeld(p) ? s.speed * WELD.crawl : s.speed * (i.focus ? 0.45 : 1) * (p.slow > 0 ? 0.55 : 1) * (1 + SURGE_SHIP * b);
    if (p.volley.length) this.volley(p);
    if (diving) this.grafting.dive(p);
    else if (p.dashT > 0) {
      p.dashT -= DT;
      // the Kestrel's bends with the stick
      if (s.steer && Math.hypot(mx, mz) > 0.2) {
        const at = Math.atan2(p.dashZ, p.dashX);
        const d = Math.atan2(mz, mx) - at;
        const a = at + clamp(Math.atan2(Math.sin(d), Math.cos(d)), -s.steer * DT, s.steer * DT);
        p.dashX = Math.cos(a);
        p.dashZ = Math.sin(a);
      }
      p.vx = p.dashX * s.dashSpeed;
      p.vz = p.dashZ * s.dashSpeed;
      if (s.flyby) this.tagAlong(p);
      if (p.dashT <= 0) {
        p.vx *= s.dashExit;
        p.vz *= s.dashExit;
        if (s.flyby) this.flyby(p);
        if (s.thunder > 0) this.thunderclap(p);
        this.grafting.dashEnd(p);
      }
    } else {
      const tx = mx * top;
      const tz = mz * top;
      const a = s.accel * DT * (1 - 0.35 * b);
      p.vx += clamp(tx - p.vx, -a, a);
      p.vz += clamp(tz - p.vz, -a, a);
      // stopping is sharper than starting: no ice (a little more slide at speed)
      const stop = s.stop + 0.1 * b;
      if (Math.abs(mx) < 0.1) p.vx *= stop;
      if (Math.abs(mz) < 0.1) p.vz *= stop;
    }
    p.x += p.vx * DT;
    p.z += p.vz * DT;
    p.x = clamp(p.x, -REACH_W + 1.2, REACH_W - 1.2);
    p.z = clamp(p.z, this.top + 3, this.bottom - 2);

    // dash
    p.dashCd = Math.max(0, p.dashCd - DT);
    if (p.dashCd <= 0 && p.dashes < s.dashes) {
      p.dashes++;
      p.dashCd = s.dashCooldown;
    }
    if (i.dash) {
      p.dashQ = DASH_QUEUE;
      // none left, and none back in time: say so (a dry click, the pips flash), don't just ignore it
      if (p.dashes <= 0 && p.dashCd > DASH_QUEUE) this.emit({ type: 'dashDry', id: p.id });
    }
    p.dashQ = Math.max(0, p.dashQ - DT);
    if (p.dashQ > 0 && !welding && !diving && p.dashes > 0 && p.dashT <= 0 && p.dashLock <= 0) {
      p.dashQ = 0;
      p.dashes--;
      if (p.dashCd <= 0) p.dashCd = s.dashCooldown;
      const dl = Math.hypot(mx, mz);
      p.dashX = dl > 0.2 ? mx / dl : 0;
      p.dashZ = dl > 0.2 ? mz / dl : -1;
      // committed: a fixed burst, and nothing in it is safe (see perfectDash)
      p.dashT = s.dashTime * this.grafting.dashLength(p);
      p.dashLock = p.dashT + s.dashRecover;
      p.slip = s.slip;
      p.slipX = p.x;
      p.slipZ = p.z - this.scroll;
      p.perfect = false;
      p.strike = STRIKE_TIME * (1 + 0.5 * s.mod.strike);
      this.emit({ type: 'dash', id: p.id, x: p.x, z: p.z, dx: p.dashX, dz: p.dashZ });
      this.mind.dash(p, i.focus);
      this.dashMods(p);
      this.grafting.dash(p);
    }

    this.regenShield(p);

    // special
    const was = p.charge;
    p.charge = Math.min(1, p.charge + DT * 0.012 * s.specialRate);
    if (was < 1 && p.charge >= 1 && s.special) this.emit({ type: 'specialReady', id: p.id });
    if (i.special && !welding && !diving && s.special && p.charge >= 1) {
      p.charge = 0;
      this.special(p, s.special);
      this.grafting.special(p, i.x);
    }

    // guns (quiet in a weld, unless it's a FIELD WELD)
    const quiet = welding && !this.mind.fieldWeld(p);
    p.firing = i.fire && !quiet && this.state !== 'clear';
    p.heavyT += DT;
    let fired = 0;
    // a press fires a round; held, the next goes as soon as one's back (a beat apart at least)
    const hold = !!i.heavy && !quiet && this.state !== 'clear';
    const fresh = hold && !p.heavyHeld;
    p.heavyHeld = !!i.heavy;
    const press = hold && (fresh || p.heavyT >= HEAVY_GAP);
    for (let k = 0; k < s.guns.length; k++) {
      if (s.guns[k].heavy) fired += this.updateHeavy(p, k, press);
      else this.updateGun(p, k, p.firing);
    }
    if (press && s.guns.some((g) => g.heavy)) {
      if (fired) {
        p.heavyT = 0;
        this.grafting.heavy(p);
      }
      // (held with nothing ready says nothing; only a fresh press clicks dry)
      if (fired || fresh) this.emit({ type: 'heavy', id: p.id, x: p.x, z: p.z, fired });
    }
    this.updateKit(p, welding || diving ? { ...i, aux: false } : i);
    this.grafting.tick(p);
    this.mind.tick(p);
  }

  /** Shield comes back if you stop getting hit: nothing for a while, then filling steadily, out of the level's store. */
  private regenShield(p: Player) {
    const s = p.stats;
    if (p.shield >= s.shield || p.shieldStore <= 0) return;
    p.shieldWait += DT;
    if (p.shieldWait <= SHIELD_WAIT) return;
    const fill = Math.min(SHIELD_RATE * DT, s.shield - p.shield, p.shieldStore);
    p.shield += fill;
    p.shieldStore -= fill;
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
    } else kitSpecial(this, p, kind, k);
  }

  /** A bullet wiped out (bombs, phase changes, perfect dashes). It leaves no scrap: only a kill does. */
  cancel(b: Bullet) {
    if (b.dead) return;
    b.dead = true;
    if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: true });
    else if (b.kind === 'seeker') this.emit({ type: 'seeker', x: b.x, z: b.z, color: b.color, how: 'shot', n: b.leg?.n ?? 0 });
    else this.emit({ type: 'bulletPop', x: b.x, z: b.z, color: b.color, look: b.look });
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
        this.credit = g.part.id;
        for (const e of reach.hit) {
          const flaw = g.flaw && marksOn(e) > 0;
          const edge = !flaw && this.edged(sp.edge, e, p, gx, gz, e.id === p.lockOn[k] ? p.lockT[k] : 0);
          if (edge) p.edges[sp.edge] = (p.edges[sp.edge] ?? 0) + 1;
          this.damage(e, hit.dmg * (edge ? g.edgeMul : flaw ? 2 : 1) * (p.strike > 0 ? this.strikeMul(p) : 1), p.id, hit.crit || flaw || edge, undefined, undefined, false, edge ? sp.edge : undefined, g.affix);
          mark(this, e, g.marks, g.markStr, p.id);
        }
        this.credit = null;
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

  /** ECHO COIL: the guns it touches fire a free volley (a heavy, a round that costs none). */
  private echo(p: Player) {
    p.stats.guns.forEach((g, k) => {
      if (!g.echo || p.down) return;
      p.shotCount[k]++;
      this.fire(p, g, p.x + g.x, p.z + g.z, g.dir, g.heavy ? 0 : 2);
      this.emit({ type: 'echo', id: p.id, x: p.x + g.x, z: p.z + g.z });
    });
  }

  /** A round in each heavy gun that `which` picks, up to its magazine. */
  private feedRounds(p: Player, which: (g: Gun) => boolean) {
    p.stats.guns.forEach((g, k) => {
      if (!g.heavy || !which(g) || p.rounds[k] >= g.heavy) return;
      p.rounds[k]++;
      this.emit({ type: 'reload', id: p.id, gun: k, perfect: true, rounds: p.rounds[k] });
    });
  }

  /** A perfect puts a round back in every heavy gun. */
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
    // the land and anything tall stop a beam
    for (let d = 0; d < len; d += 1) {
      if (this.terrain.blocks(x + dx * d, z + dz * d)) {
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
    // a ripening round: harder for the time it sat in the chamber
    const ripe = g.heavy && !turret ? ripeness(this, g, sp) : 1;
    this.emit({ type: 'shot', owner: p.id, kind: sp.shot, x, z, dir, turret, heavy: !!g.heavy && !turret, src: g.part.id, ripe });
    const hit = this.gunDamage(p, g);
    // out of a dash, the guns strike harder (not a turret's: it didn't dash)
    const strike = p.strike > 0 && !turret;
    hit.dmg *= mul * ripe * (strike ? this.strikeMul(p) : 1);
    if (sp.shot === 'arc') {
      this.credited(g.part.id, () => this.arc(p.id, x, z, hit.dmg, 3 + extra, { bits: g.marks, pow: g.markStr, flaw: g.flaw, edge: sp.edge, edgeMul: g.edgeMul, affix: g.affix }));
      return;
    }
    // and pulls spreads in: a focused stream instead of a fan
    const tight = p.focus ? FOCUS_SPREAD : 1;
    const n = sp.count + extra;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * sp.spread * tight;
      const jitter = sp.shot === 'pellet' || sp.shot === 'flame' ? (this.rand() - 0.5) * 0.12 * tight : 0;
      const speed = sp.speed * (sp.shot === 'pellet' ? 0.85 + this.rand() * 0.3 : 1);
      const s = this.addShot(p.id, sp.shot, x, z, dir + off + jitter, speed, hit.dmg, sp.life, (sp.pierce ?? 0) + (g.heavy ? 0 : this.grafting.pierce(p)), 0);
      s.crit = hit.crit;
      s.marks = g.marks;
      s.markStr = g.markStr;
      // the Rivet Gun's: every so many, a round that cracks
      if (sp.crackEvery && p.shotCount[p.stats.guns.indexOf(g)] % sp.crackEvery === 0) {
        s.marks |= CRACK;
        s.markStr = Math.max(s.markStr, 0.6);
      }
      if (g.flaw) s.flaw = true;
      if (g.volatile) s.volatile = true;
      if (g.split) s.split = true;
      if (g.boomerang) s.boomerang = true;
      if (g.affix) s.affix = g.affix;
      s.edge = sp.edge;
      s.edgeMul = g.edgeMul;
      s.src = g.part.id;
      armShot(s, sp, ripe);
      if (strike) s.strike = true;
      if (g.heavy) s.heavy = true;
      if (g.heavy && !turret) this.grafting.heavyShot(p, s);
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

  /**
   * A down ship in co-op: a partner flying close kicks its engines back on. Nobody close, its
   * countdown runs (held while a partner's there); at JUMP_WAIT it goes in.
   */
  private updateJumpstarts() {
    if (this.players.length < 2 || this.state === 'failed' || this.state === 'clear') return;
    for (const p of this.players) {
      if (!p.down || p.out) continue;
      const helper = jumpHelper(this.players, p);
      if (helper) p.jump += DT;
      else {
        p.jump = Math.max(0, p.jump - DT * 0.5);
        if ((p.downT += DT) >= JUMP_WAIT) {
          p.out = true;
          this.emit({ type: 'crashed', id: p.id, x: p.x, z: p.z });
          this.emit({ type: 'explode', x: p.x, z: p.z, y: FLIGHT_Y, size: 5, color: 0xff7030 });
          continue;
        }
      }
      if (helper && p.jump >= JUMP_TIME) {
        p.down = false;
        p.jump = 0;
        p.downT = 0;
        p.hp = Math.round(p.stats.hp * JUMP_HULL);
        p.inv = 2.5;
        // the jolt: a shockwave off the hull that turns the fire round both ships to scrap
        for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < JUMP_JOLT * JUMP_JOLT) this.cancel(b);
        this.emit({ type: 'jumpstart', id: p.id, by: helper.id });
      }
    }
  }

  /**
   * A hit on a player: it's worth what its tier is (see HIT_DMG, less the armour); the shield
   * soaks what it can of that, and the hull takes the rest. Returns false if it didn't land.
   */
  hurt(p: Player, x: number, z: number, cause = 'bullet', tier: HitTier = tierOf(cause), by?: string) {
    if (p.down || p.inv > 0 || p.phase > 0 || this.state === 'clear') return false;
    // an Ablative layer takes it instead (and a Static Skin lets go at whatever hit it)
    if (kitSoak(this, p, x, z)) return true;
    p.shieldWait = 0;
    p.hits++;
    tier = this.mind.tier(p, tier);
    this.mind.hit(p);
    // hit in a weld: it's lost
    if (p.weldT >= WELD.hold) {
      p.weld = 0;
      p.weldsLost++;
      this.emit({ type: 'weld', id: p.id, state: 'lost', x: p.x, z: p.z });
    }
    p.weldT = 0;
    p.causes[cause] = (p.causes[cause] ?? 0) + 1;
    p.spiteT = SPITE_TIME;
    // a hit sets a volatile crate off (see tickCrate); what it takes is the hull, shields or not
    if (p.crate && cause !== 'crate') p.blow = true;
    const worth = this.hitDamage(p, tier);
    const soak = cause === 'crate' ? 0 : Math.min(p.shield, worth);
    if (soak > 0) {
      p.shield -= soak;
      if (p.stats.mirror && cause === 'bullet') this.mirror(p, x, z, p.stats.mirror);
      if (p.shield <= 0 && p.stats.affixes.reactive) this.reactive(p);
    }
    const dmg = worth - soak;
    if (dmg <= 0) {
      p.inv = 0.8;
      this.emit({ type: 'playerHit', id: p.id, shield: true, x, z, soak, cause, by });
    } else {
      p.hp -= dmg;
      p.inv = 1.4;
      this.emit({ type: 'playerHit', id: p.id, shield: false, x, z, dmg, tier, soak, cause, by });
      // PIP'S POLICY pays out on the blow that would down you
      if (p.hp <= 0) this.mind.saved(p);
      // SECOND WIND: once a level, the blow that would down you doesn't
      if (p.hp <= 0 && p.stats.affixes.secondwind && !p.wind) {
        p.wind = true;
        p.hp = Math.max(1, Math.round(p.stats.hp * SECOND_WIND));
        p.inv = 2.5;
        for (const b of this.bullets) if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 14 * 14) this.cancel(b);
        this.emit({ type: 'affix', id: p.id, affix: 'secondwind', x: p.x, z: p.z });
      }
      if (p.hp <= 0) {
        p.hp = 0;
        p.down = true;
        this.dropCrate(p);
        p.jump = 0;
        p.downT = 0;
        p.firing = false;
        this.emit({ type: 'down', id: p.id, x: p.x, z: p.z });
        this.emit({ type: 'explode', x: p.x, z: p.z, y: FLIGHT_Y, size: 2.5, color: 0xffa040 });
      }
      this.mind.hurt(p);
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

  /** What an enemy's base hull is multiplied by here: the run's growth, two ships (both up), the testing aid. */
  hullScale() {
    return hullGrowth(this.spec.difficulty) * (this.living().length > 1 ? COOP_HULL : 1) * this.tough;
  }

  spawn(arch: Enemy['arch'], skin: EnemySkin, x: number, z: number, d: EnemyData, opts: Partial<Enemy> = {}): Enemy {
    const foe = isFoe(arch) ? FOES[arch] : undefined;
    const base = (foe ? foe.hp : HP[arch as Archetype | 'boss']) * this.hullScale() * (opts.elite ? 2.4 : 1);
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
    if (af === 'blasting' && crit) this.credited(s?.src ?? this.credit ?? 'other', () => this.blast(e.x, e.z, BLAST_R, dmg * 0.45, owner, { quiet: false }));
    const blow = !dot && this.isBlow(p, dmg, crit, s);
    // a phasing shot goes through shields and plating to the hull
    const phase = !!s?.ax?.phase;
    // armour, shields, exposed after an attack (see combat.ts)
    const taken = foeTaken(this, e, from === undefined ? (p ? { x: p.x, z: p.z } : null) : from, crit);
    const k = phase ? Math.max(taken, 1) : taken;
    if (k <= 0) {
      this.emit({ type: 'guard', enemy: e.id, x: e.x, z: e.z });
      if (e.guard > 0) wearGuard(this, e, dmg);
      return;
    }
    // cracked open: it takes more
    dmg *= k * markTaken(e);
    // a blow on something set up cashes it in (see arsenal.ts)
    if (blow) dmg *= cashIn(this, e, owner, s?.src ?? this.credit);
    if (e.dead) return;
    // a boss shrugs off the stream unless it's open
    if (e.boss && !blow && !dot && e.state !== 'recover' && e.state !== 'stagger') dmg *= BOSS_GLANCE;
    if (!dot) e.flash = 0.08;
    if (p) p.charge = Math.min(1, p.charge + dmg * 0.0018 * p.stats.specialRate);
    // plating first (what's left over from the blow that breaks it is lost); the stream only chips
    // it; broken, it reels
    if (e.armour > 0 && !phase) {
      const bite = dot ? 0.5 : blow ? 1 : PLATE_GLANCE;
      this.tally(Math.min(e.armour, dmg * bite), s, dot);
      e.armour -= dmg * bite;
      this.grafting.share(e, dmg, dot);
      if (p && !dot) this.feedWeld(p, Math.min(dmg * bite, WELD.cap) * (blow ? WELD.blow : WELD.stream));
      foeHurt(this, e, 0);
      this.emit({ type: 'hit', x: e.x, z: e.z, enemy: e.id, dmg: dmg * bite, kill: false, crit, dot, edge, strike: s?.strike, armour: true, blow, src: s?.src ?? this.credit ?? undefined });
      if (e.armour <= 0) this.breakPlating(e, owner);
      return;
    }
    this.tally(Math.min(Math.max(0, e.hp), dmg), s, dot);
    e.hp -= dmg;
    this.grafting.share(e, dmg, dot);
    // EXECUTIONER: what's left that low is finished off
    // CHARGED: its crits shock what they hit
    if (af === 'charged' && crit && e.hp > 0) mark(this, e, SHOCK, 0.8, owner);
    if (af === 'executioner' && !e.boss && e.hp > 0 && e.hp < e.max * EXECUTE) {
      dmg += e.hp;
      e.hp = 0;
      if (p) this.emit({ type: 'affix', id: p.id, affix: af, x: e.x, z: e.z });
    }
    // blows wear a boss's poise harder
    foeHurt(this, e, dmg, dmg * (blow ? POISE_BLOW : 1));
    if (p && !dot) this.feedWeld(p, Math.min(dmg, WELD.cap) * (blow ? WELD.blow : WELD.stream));
    const kill = e.hp <= 0;
    this.emit({ type: 'hit', x: e.x, z: e.z, enemy: e.id, dmg, kill, crit, dot, edge, strike: s?.strike, blow, src: s?.src ?? this.credit ?? undefined });
    if (!kill) return;
    // a VOLATILE gun's kill: its marks jump to the nearest
    if (s?.volatile) spread(this, e, owner);
    // KINDLING: what's round its kill catches fire
    if (af === 'kindling')
      for (const o of this.enemies)
        if (o !== e && !o.dead && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 < KINDLE_R * KINDLE_R) mark(this, o, BURN, 0.8, owner);
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

  /** Damage dealt, put down to what dealt it (see dealtBy). */
  private tally(dmg: number, s: Shot | undefined, dot: boolean) {
    if (dmg <= 0) return;
    const by = s?.src ?? (dot ? 'BURN' : (this.credit ?? 'other'));
    this.dealtBy[by] = (this.dealtBy[by] ?? 0) + dmg;
  }

  /** What `fn` deals is put down to `by` (a part, a reaction, a cash-in). */
  credited(by: string, fn: () => void) {
    const was = this.credit;
    this.credit = by;
    try {
      fn();
    } finally {
      this.credit = was;
    }
  }

  /** Plating broken (by a blow, or the core's doing): it reels, open to a takedown. */
  breakPlating(e: Enemy, owner: number) {
    const p = this.players[owner];
    // a boss's plating (ARU-0's Liens): off it comes, as scrap, and it reels
    if (e.boss) {
      bossUnplated(this, e);
      this.mind.broke(p, e);
      return;
    }
    e.armour = 0;
    e.stun = Math.max(e.stun, 1.2);
    if (e.grab >= 0) release(this, e, true);
    go(this, e, 'stagger', this.mind.stagger(p, 2.6));
    e.d.combo = 0;
    this.emit({ type: 'armourBreak', enemy: e.id, x: e.x, z: e.z });
    this.mind.broke(p, e);
  }

  /** A volatile crate: a faction strongbox, a part rolled well above the level's luck. It drifts down the screen: take it or let it go. */
  hotCrate() {
    const r = this.rand;
    const x = (r() - 0.5) * HALF_W * 1.1;
    const z = this.top + 2;
    const tier = rollTier(r, this.spec.difficulty + 1, true) === 'legendary' || r() < 0.2 ? 'legendary' : 'epic';
    const part = rollItem(r, this.director.loot(), tier);
    this.pickups.push({ x, z, vx: 0, vz: 0, kind: 'hot', value: 0, t: 0, dead: false, part });
    this.emit({ type: 'hot', id: -1, state: 'appear', x, z, part });
  }

  /** A volatile crate: its lock cracks open on its own while it's carried. Hit before it does, it blows on you. */
  private tickCrate(p: Player) {
    if (!p.crate || p.down) return;
    const was = p.crack;
    p.crack += DT / HOT_CRACK[itemTier(p.crate)];
    // its three bolts give, one by one, before the lid does
    for (let k = 1; k <= HOT_BOLTS; k++) {
      const at = k / (HOT_BOLTS + 1);
      if (was < at && p.crack >= at) this.emit({ type: 'hot', id: p.id, state: 'bolt', x: p.x, z: p.z, n: k });
    }
    if (p.blow) {
      const part = p.crate;
      p.crate = undefined;
      this.emit({ type: 'hot', id: p.id, state: 'blown', x: p.x, z: p.z, part });
      this.blast(p.x, p.z, 5, 30, p.id, { quiet: true });
      p.inv = 0;
      this.hurt(p, p.x, p.z, 'crate');
    } else if (p.crack >= 1) {
      this.loot[p.id].push(p.crate);
      this.emit({ type: 'hot', id: p.id, state: 'open', x: p.x, z: p.z, part: p.crate });
      p.crate = undefined;
    }
  }


  /** Downed, or the level over, with a crate still shut: it's gone. */
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
    kitTakedown(this, p);
    // its wreck is yours, once it's finished
    if (e.elite && !e.boss) e.downBy ??= p.id;
    let big = false;
    if (e.boss) {
      const ph = e.boss.phase;
      if (!this.tookPhase.has(ph)) {
        this.tookPhase.add(ph);
        big = true;
      }
    } else big = e.elite;
    const dmg = this.mind.takedownDmg(p, e, e.boss ? e.max * TAKEDOWN_BOSS : Math.max(TAKEDOWN_MIN, e.max * TAKEDOWN_FOE));
    // back on its heels: its poise doesn't count this one, and it goes on reeling
    this.damage(e, dmg, p.id, true, null);
    this.mind.takedown(p, e, big);
    if (e.dead) this.mind.takedownKill(p, e);
    p.dashes = Math.min(p.stats.dashes, p.dashes + 1);
    this.echo(p);
    p.burn = Math.min(1, p.burn + BURN_TAKEDOWN);
    p.inv = Math.max(p.inv, 0.5);
    p.strike = Math.max(p.strike, STRIKE_TIME);
    this.feedWeld(p, this.grafting.takedownWeld(p, big ? WELD.bigTakedown : WELD.takedown));
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
      this.grafting.killed(e, owner);
    }
    if (e.elite && !e.boss && !e.bounty) this.salvage(e, owner);
    for (let i = 0; i < e.scrap * (close ? 2 : 1) * this.mind.scrapMul(p, e); i++) this.drop('scrap', e.x + (this.rand() - 0.5) * e.r, e.z + (this.rand() - 0.5) * e.r, 1 + (this.rand() < 0.2 ? 4 : 0));
    if (e.drop) this.drop('part', e.x, e.z, 0);
    else if (this.rand() < 0.015) this.drop('repair', e.x, e.z, 1);
    onKill(this, e, p ? owner : -1);
    if (e.boss) this.director.bossDown(e);
    // a Warden's wreck is everyone's: its signature, or the pick of its faction's
    if (e.boss && !this.wrecks.some((w) => w.boss)) {
      const pl = this.spec.planet;
      for (const q of this.players) this.wrecks.push({ owner: q.id, kind: 'boss', title: pl.boss.name, faction: factionOf(pl), boss: pl.id });
    }
  }

  /** An elite down: if a takedown landed on it first, its wreck is that pilot's (see game/grafts.ts). */
  private salvage(e: Enemy, owner: number) {
    const by = e.downBy !== undefined && this.players[e.downBy] ? e.downBy : undefined;
    const faction = isFoe(e.arch) ? FOES[e.arch].faction : factionOf(this.spec.planet);
    const title = e.title ?? e.skin.name.toUpperCase();
    const foe = isFoe(e.arch) ? FOES[e.arch] : undefined;
    if (by !== undefined) this.wrecks.push({ owner: by, kind: e.arch, title, faction, skin: e.skin, model: foe?.model ?? e.arch, scale: foe?.scale });
    this.emit({ type: 'wreck', id: by ?? owner, enemy: e.id, x: e.x, z: e.z, title, kind: e.arch, faction, lost: by === undefined });
  }

  /** The nearest enemy on the screen that can be hit, within `reach` (`ahead`: up the screen of (x, z), give or take). */
  nearestEnemy(x: number, z: number, reach = 999, ahead = false) {
    let best: Enemy | undefined;
    let bd = reach * reach;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.t < 0 || !this.seen(e) || (ahead && e.z > z + 4)) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** A ray from (x, z) at `dir` (0 up the screen) as a beam sees it: how far it reaches (the land stops it), and what's on it. */
  reach(x: number, z: number, dir: number, width: number) {
    return this.beamReach(x, z, dir, width);
  }

  /** Whatever `fn` hits counts as blows (it breaks plating at full strength). */
  asBlow(fn: () => void) {
    this.blowing++;
    try {
      fn();
    } finally {
      this.blowing--;
    }
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

  /** How fast enemy fire of speed `speed` flies here (harder levels throw it harder). */
  fireSpeed(speed: number) {
    return speed * FIRE_PACE * (1 + this.spec.difficulty * 0.18);
  }

  /** Enemy fire at a true speed (a pattern family's, see volleys.ts: already paced, not scaled again). */
  shoot(x: number, z: number, angle: number, speed: number, opts: Partial<Bullet> = {}) {
    return this.bullet(x, z, angle, speed / this.fireSpeed(1), opts);
  }

  /** Enemy fire. Angle 0 is down the screen (towards the players). */
  bullet(x: number, z: number, angle: number, speed: number, opts: Partial<Bullet> = {}) {
    const s = this.fireSpeed(speed);
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
      from: this.firing,
      seek: -1,
      hp: 0,
      seed: (((this.time * 13.7 + x * 0.31 + z * 0.17 + angle * 0.53) % 1) + 1) % 1,
      open: false,
      dead: false,
      fresh: true,
      ...opts,
    });
    const b = this.bullets[this.bullets.length - 1];
    if (b.split) b.splitA = this.rand() * Math.PI;
    if (b.kind === 'torpedo') b.hp = TORPEDO.hp;
    if (b.kind === 'seeker') {
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
    if (kind === 'part' && this.spec.parts === false) {
      for (let k = 0; k < 3; k++) this.drop('scrap', x + (this.rand() - 0.5) * 2, z + (this.rand() - 0.5) * 2, 5);
      return;
    }
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
      // a graft's shot steering itself, or holding still to turn
      if (s.graft && this.grafting.shot(s)) continue;
      // a BOOMERANG shot at the end of its flight (or the edge of the screen) turns for home
      if (s.boomerang && !s.back && (s.t > s.life || !this.onScreen(s.x, s.z, 1))) this.turnHome(s);
      if (s.back) {
        if (this.homeward(s)) continue;
      } else if (s.t > s.life) {
        s.dead = true;
        if (s.kind === 'flak') {
          this.emit({ type: 'flak', x: s.x, z: s.z });
          this.credited(s.src ?? 'other', () => this.blast(s.x, s.z, 3, s.dmg * 0.6, s.owner, { bits: s.marks, pow: s.markStr }));
          for (let a = 0; a < 8; a++) this.addShot(s.owner, 'pellet', s.x, s.z, (a / 8) * Math.PI * 2, 30, s.dmg * 0.25, 0.25, 0, 0).src = s.src;
        } else if (s.kind === 'mine') {
          this.credited(s.src ?? 'other', () => this.blast(s.x, s.z, 3.5, s.dmg, s.owner, { bits: s.marks, pow: s.markStr }));
          if (s.graft) this.grafting.burst(s);
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
      // a bouncing shot comes back off the screen's sides and top
      if (s.ax && s.ax.walls > 0 && (Math.abs(s.x) > HALF_W || s.z < this.top)) {
        s.ax.walls--;
        if (Math.abs(s.x) > HALF_W) s.vx = -Math.sign(s.x) * Math.abs(s.vx);
        if (s.z < this.top) s.vz = Math.abs(s.vz);
        s.hit = [];
        s.life = Math.max(s.life, s.t + 0.6);
        this.emit({ type: 'shotLand', x: s.x, z: s.z, bounce: true, heavy: false, src: s.src });
      }
      if (!this.onScreen(s.x, s.z, s.back ? 12 : 4)) s.dead = true;
      else if (s.kind !== 'rail' && this.terrain.blocks(s.x, s.z)) {
        // the land and anything tall stop shots
        const bounce = s.bounce > 0;
        if (bounce) {
          s.bounce--;
          s.vz = -s.vz;
        } else s.dead = true;
        if (s.kind !== 'flame') this.emit({ type: 'shotLand', x: s.x, z: s.z, bounce, heavy: !!s.heavy || s.dmg >= 10 });
      }
    }
  }

  private updateBullets(dz: number) {
    const slowScroll = this.state === 'boss';
    // THE LONG SECOND: their fire crawls (it still comes down with the screen)
    this.slowBullets = Math.max(0, this.slowBullets - DT);
    const k = this.slowBullets > 0 ? LONG_SLOW : 1;
    for (const b of this.bullets) {
      b.ox = b.x;
      b.oz = b.z;
      b.t += DT * k;
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
      b.x += b.vx * DT * k;
      // (a seeker is flown, not thrown: it keeps up with the screen, so its lanes stay square to it)
      b.z += b.vz * DT * k - (b.kind === 'seeker' ? dz : b.kind === 'mine' && !slowScroll ? dz * 0.3 : 0);
      if (b.t > b.life || !this.onScreen(b.x, b.z, 6)) {
        if (b.split && b.t > b.life && !b.dead) {
          for (let k = 0; k < b.split; k++)
            this.shoot(b.x, b.z, b.splitA + (k / b.split) * Math.PI * 2, b.splitV ?? this.fireSpeed(9), { color: b.color, r: 0.4, look: b.look, fresh: false });
        }
        if (b.kind === 'torpedo' && b.t > b.life && !b.dead) this.emit({ type: 'torpedo', x: b.x, z: b.z, color: b.color, shot: false });
        b.dead = true;
      } else if (!this.terrain.blocks(b.x, b.z)) b.open = true;
      else if (b.open) {
        // the land and anything tall stop fire as they stop yours: it flies at your height, not over the hills
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

  private updateLasers(scrolled: number) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i];
      // (a read can stagger a boss mid-loop, and that puts its beams out)
      if (!l) continue;
      const owner = this.enemies.find((e) => e.id === l.owner);
      if (l.seam) {
        // a seam stays where it was welded, on the screen; its welder shot down, it's done growing
        l.z -= scrolled;
        l.z2 -= scrolled;
        if (!owner || owner.dead) l.grow = false;
      } else if (!owner || owner.dead) {
        this.lasers.splice(i, 1);
        continue;
      } else {
        // the laser comes from its owner, wherever it is now
        const ox = l.x2 - l.x;
        const oz = l.z2 - l.z;
        l.x = owner.x;
        l.z = owner.z;
        l.x2 = l.x + ox;
        l.z2 = l.z + oz;
      }
      const dx = l.x2 - l.x;
      const dz = l.z2 - l.z;
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
      // (a seam only just struck: nothing to it yet; cooling, its last moments are harmless)
      if (len < 0.3 || (l.seam && l.on < SEAM_COOL)) continue;
      const ux = dx / len;
      const uz = dz / len;
      const half = l.seam ? 0.45 : 1.0;
      const inBeam = (x: number, z: number, r: number) => {
        const along = (x - l.x) * ux + (z - l.z) * uz;
        return along >= (l.r0 ?? 0) && along <= len && Math.abs((x - l.x) * uz - (z - l.z) * ux) < half + r;
      };
      for (const p of this.players) {
        if (p.slip > 0 && !p.down && inBeam(p.slipX, this.scroll + p.slipZ, p.stats.core)) this.perfectDash(p);
        if (inBeam(p.x, p.z, p.stats.core) && !kitWalls(p, l.z)) {
          this.hurt(p, p.x, p.z, 'laser', undefined, firer(this.enemies.find((e) => e.id === l.owner)));
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
        // (one volatile crate at a time: a ship with one doesn't pull in another)
        if (p.down || (k.kind === 'hot' && p.crate)) continue;
        const dx = p.x - k.x;
        const dz2 = p.z - k.z;
        const d = Math.hypot(dx, dz2);
        const reach = k.kind === 'scrap' ? (this.mind.magnet(p) && this.onScreen(k.x, k.z) ? 999 : MAGNET) : 3;
        if (d < reach || k.t > 60) {
          const pull = 70 / Math.max(d, 1);
          k.vx += (dx / Math.max(d, 0.01)) * pull * DT * 9;
          k.vz += (dz2 / Math.max(d, 0.01)) * pull * DT * 9;
          pulled = true;
          break;
        }
      }
      // drifts down the screen and off it: scrap at its own steady pace (even when the screen
      // holds still for a boss), the rest slower than the land (not on a tow line: that's hauled)
      if (!pulled && !k.towed) k.z -= k.kind === 'scrap' ? dz - SCRAP_DRIFT * DT : dz * 0.75;
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
        // (the nearest it came to the ship this step, not just where both ended up: a quick round
        // and a quick ship can pass right through each other between two frames)
        const [rx, rz] = closest(b, p);
        const d2 = rx * rx + rz * rz;
        const hitR = core + b.r;
        // in a dash's opening slip, a bullet that would have hit where you were (give or take) is a perfect
        if (p.slip > 0 && !p.stats.catch && (b.x - p.slipX) ** 2 + (b.z - this.scroll - p.slipZ) ** 2 < (hitR + 0.3) ** 2) this.perfectDash(p);
        if (b.dead) continue;
        // the Hammerhead's head ploughs through small fire in a dash (beams and blasts still go through)
        if (p.stats.battering && p.dashT > 0 && canParryProjectile(b) && d2 < (p.stats.ramW + b.r) ** 2 && (b.x - p.x) * p.dashX + (b.z - p.z) * p.dashZ > -core) {
          b.dead = true;
          this.emit({ type: 'plough', id: p.id, x: b.x, z: b.z });
          continue;
        }
        if (d2 < hitR * hitR) {
          // where it struck: on the hull's edge, the side it came from
          const d = Math.sqrt(d2) || 1;
          const hx = p.x + (rx / d) * Math.min(d, core + 0.2);
          const hz = p.z + (rz / d) * Math.min(d, core + 0.2);
          if (this.hurt(p, hx, hz, b.kind === 'seeker' ? 'seeker' : b.kind === 'torpedo' ? 'torpedo' : 'bullet', BULLET_TIER[b.kind], b.from)) {
            b.dead = true;
            if (b.kind === 'torpedo') this.emit({ type: 'torpedo', x: hx, z: hz, color: b.color, shot: false });
            else if (b.kind === 'seeker') this.emit({ type: 'seeker', x: hx, z: hz, color: b.color, how: 'hit', n: b.leg?.n ?? 0 });
            // the round that got you bursts on the hull, in its own colour: you see what hit you
            else this.emit({ type: 'bulletPop', x: hx, z: hz, color: b.color, look: b.look });
          }
        } else if (!(b.grazed & (1 << p.id)) && d2 < (hitR + 1.5) ** 2 && p.inv <= 0) {
          b.grazed |= 1 << p.id;
          p.grazes++;
          p.charge = Math.min(1, p.charge + 0.018 * p.stats.specialRate);
          p.burn = Math.min(1, p.burn + BURN_GRAZE);
          this.score += 5 * (1 + this.combo);
          this.emit({ type: 'graze', id: p.id, x: p.x + rx / 2, z: p.z + rz / 2 });
          // Graze Fins: every few grazes, a round in the heavies they touch
          if (++p.grazeFeed >= GRAZE_FEED) {
            p.grazeFeed = 0;
            this.feedRounds(p, (g) => g.grazeFed);
          }
          this.mind.graze(p);
          kitGraze(this, p);
        }
      }
      // ramming
      for (const e of this.enemies) {
        if (e.dead || e.ground || e.state === 'hidden') continue;
        // flying into (or dashing through) anything staggered is a takedown (once a stagger)
        // (not the one this ram just knocked reeling: that takes a second ram)
        if (e.state === 'stagger' && !e.d.td && e.t >= 0 && !(p.dashT > 0 && p.rammed.includes(e.id))) {
          const tr = e.r + core + TAKEDOWN_REACH;
          if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < tr * tr) this.credited('TAKEDOWN', () => this.takedown(p, e));
          continue;
        }
        // (anything left reeling after its attack is there to be punished, not to punish)
        if (winded(e)) continue;
        const r = e.r * 0.75 + core;
        if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) {
          // a Ram Prow dashing through: the dash does the hitting (see ramAlong)
          if (p.dashT > 0 && (p.stats.mod.ram > 0 || this.grafting.rams(p))) continue;
          // (popcorn only grazes you, and breaks on you; on the Hammerhead's head it just breaks)
          const pop = POPCORN.has(e.arch);
          if (pop && p.stats.battering) {
            this.emit({ type: 'ram', id: p.id, x: e.x, z: e.z, enemy: e.id });
            this.damage(e, 999, p.id, false);
            continue;
          }
          if (this.hurt(p, p.x, p.z, 'ram:' + e.arch, pop ? 'graze' : undefined)) {
            this.damage(e, pop ? 999 : 20, p.id, false);
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
            this.scrapBy[p.id] = (this.scrapBy[p.id] ?? 0) + v;
            this.combo++;
            this.comboT = 3;
            p.charge = Math.min(1, p.charge + 0.06);
            p.burn = Math.min(1, p.burn + BURN_RING);
            this.emit({ type: 'pickup', id: p.id, kind: 'ring', x: k.x, z: k.z, value: v });
          }
          continue;
        }
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 1.6 * 1.6) {
          // one volatile crate at a time
          if (k.kind === 'hot') {
            if (p.crate) continue;
            k.dead = true;
            p.crate = k.part;
            p.crack = 0;
            p.blow = false;
            this.emit({ type: 'hot', id: p.id, state: 'on', x: k.x, z: k.z, part: k.part });
            continue;
          }
          k.dead = true;
          const v = k.value;
          if (k.kind === 'scrap') {
            this.scrap += v;
            this.scrapBy[p.id] = (this.scrapBy[p.id] ?? 0) + v;
            this.mind.scrap(p, v);
          } else if (k.kind === 'repair') p.hp = Math.min(p.stats.hp, p.hp + HULL_STEP);
          else if (k.kind === 'part') this.loot[p.id].push(k.part!);
          this.emit({ type: 'pickup', id: p.id, kind: k.kind, x: k.x, z: k.z, value: v, part: k.part });
        }
      }
    }
    // what's left of the enemy fire against the haulers' hulls
    this.convoy?.collide();
    // player shots against enemies (and the torpedoes coming for them)
    const torps = this.bullets.some((b) => b.hp > 0 && !b.dead);
    for (const s of this.shots) {
      if (s.dead) continue;
      if (torps && s.kind !== 'flame' && s.kind !== 'mine') {
        for (const b of this.bullets) {
          if (b.dead || b.hp <= 0 || (b.x - s.x) ** 2 + (b.z - s.z) ** 2 > (b.r + s.r + 0.4) ** 2) continue;
          b.hp -= s.dmg;
          if (b.hp <= 0) {
            this.cancel(b);
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
      if (s.kind === 'flame' && !s.ax?.chill) {
        // plasma burns away enemy bullets it touches (a frost sprayer's mist doesn't)
        for (const b of this.bullets)
          if (!b.dead && b.kind !== 'seeker' && (b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 1.6) {
            this.cancel(b);
            this.emit({ type: 'melt', x: b.x, z: b.z });
          }
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
        const [nx, nz] = nearOn(e, s.x, s.z);
        if ((nx - s.x) ** 2 + (nz - s.z) ** 2 > r * r) continue;
        if (s.kind === 'mine') {
          s.t = s.life + 1; // goes off next update
          continue;
        }
        // shields and reflectors first: a stopped shot stops here (one that phases goes through)
        const m = s.ax?.phase ? 1 : foeShot(this, e, s);
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
        // (what it leaves is put down to its gun: a gun's blow never cashes in its own setup)
        const was = this.credit;
        this.credit = s.src ?? was;
        this.damage(e, dmg, s.owner, crit, null, s, false, edge);
        if (!e.dead) mark(this, e, s.marks, s.markStr, s.owner);
        if (s.ax) shotLanded(this, s, e);
        this.credit = was;
        if (s.affix === 'ricochet' && !s.rico) this.ricochet(s, e);
        if (s.graft) this.grafting.hit(s, e);
        if (s.split && !s.hit.length) this.split(s, e);
        s.hit.push(e.id);
        if (s.kind === 'missile') this.credited(s.src ?? 'other', () => this.blast(s.x, s.z, 1.8, s.dmg * 0.4, s.owner, { bits: s.marks, pow: s.markStr }));
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
    // RAM LINE: everything on the line takes a blow
    if (this.grafting.rams(p)) this.grafting.ramAlong(p, p.x - p.vx * DT, p.z - p.vz * DT, p.x, p.z);
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
      p.x = clamp(p.x + p.vx * DT, -REACH_W + 1.2, REACH_W - 1.2);
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
    kitShip(this, p, i, this.speedNow * DT);
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
    this.grafting.aux(p);
    if (kitAux(this, p, i)) return;
    if (s.aux === 'parry') {
      p.auxT = PARRY_BURST;
      p.parryT = PARRY_WINDOW;
      p.parried = 0;
      p.blocked = 0;
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
    if (a === 'parry') {
      if (!p.parried && !p.blocked) this.emit({ type: 'guardOut', id: p.id, x: p.x, z: p.z, how: 'whiff' });
      this.setAuxCd(p, p.parried ? CD_PARRY : p.blocked ? CD_BLOCK : CD_WHIFF);
    }
    else if (a === 'siphon') this.setAuxCd(p, CD_SIPHON);
    else if (a === 'flare') this.setAuxCd(p, CD_FLARE);
    else if (a === 'tether') {
      p.hook = 0;
      this.setAuxCd(p, kill ? CD_TETHER_KILL : CD_TETHER);
    }
  }

  /** A clashing aux takes longer to come back. */
  private setAuxCd(p: Player, t: number) {
    p.auxCd = p.auxMax = t / clamp(p.stats.auxStr, 0.5, 1) / this.mind.luckMul(p, 'A');
  }

  /** The aux against enemy fire (before the bullets can hit): parry, block, or drink it. */
  private auxBullets(p: Player) {
    const s = p.stats;
    if (p.auxT <= 0 || p.down) return;
    if (s.aux === 'parry') {
      let parried = 0;
      let blocked = 0;
      for (const b of this.bullets) {
        // The late block obeys the same rule; it must not become a universal shield.
        if (!canParryProjectile(b)) continue;
        const d2 = (b.x - p.x) ** 2 + (b.z - p.z) ** 2;
        if (p.parryT > 0 && d2 < PARRY_R * PARRY_R) {
          // thrown straight back where it came from, as yours
          b.dead = true;
          parried++;
          const dir = Math.atan2(-b.vx, b.vz);
          const dmg = PARRY_DMG * s.auxStr * (1 + p.burn);
          for (let k = 0; k < (s.mirror ? 2 : 1); k++) {
            const shot = this.addShot(p.id, 'slug', b.x, b.z, dir + k * 0.15, 55, dmg, 1, 0, 1);
            shot.tag = 'reflect';
            // Catch Coil: it goes back carrying the touching guns' marks
            shot.marks = s.catchMarks;
          }
        } else if (p.parryT <= 0 && d2 < BLOCK_R * BLOCK_R) {
          this.cancel(b);
          p.blocked++;
          blocked++;
          if (s.mirror) this.mirror(p, b.x, b.z, s.mirror);
          if (p.blocked >= BLOCK_MAX) {
            // the block gives out
            p.auxT = 0;
            this.emit({ type: 'guardOut', id: p.id, x: p.x, z: p.z, how: 'broke' });
            this.auxEnd(p);
            break;
          }
        }
      }
      if (parried) {
        const first = !p.parried;
        // and every bullet thrown back feeds the special
        p.charge = Math.min(1, p.charge + PARRY_CHARGE_EACH * parried);
        p.parried += parried;
        p.parries += parried;
        this.emit({ type: 'parry', id: p.id, x: p.x, z: p.z, count: parried, first });
        if (first) this.perfectParry(p, parried);
        // THE CATCH (the Magpie's): every shot caught is a heavy round (the perfect's own comes first)
        if (s.catch) for (let k = first ? 1 : 0; k < parried; k++) this.reloadHeavies(p);
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
          this.cancel(b);
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

  /** FLY-BY (the Kestrel's): every foe the dash passes close to, without touching it, is tagged. */
  private tagAlong(p: Player) {
    const s = p.stats;
    for (const e of this.enemies) {
      if (p.tagged.length >= FLYBY_MAX) return;
      if (e.dead || e.shielded || e.t < 0 || e.state === 'hidden' || !this.seen(e) || p.tagged.includes(e.id)) continue;
      const d2 = (e.x - p.x) ** 2 + (e.z - p.z) ** 2;
      const touch = e.r * 0.75 + s.core;
      if (d2 > (e.r + FLYBY_R) ** 2 || d2 < touch * touch) continue;
      p.tagged.push(e.id);
      this.emit({ type: 'tag', id: p.id, enemy: e.id, x: e.x, z: e.z });
    }
  }

  /**
   * The dash is over: a volley from the guns at everything it tagged, nearest first, the rounds
   * landing one after another. Each is a blow (it breaks plating, and cashes in what's set up on
   * it), then the trigger guns' marks; every foe more the dash tagged makes every round hit harder.
   */
  private flyby(p: Player) {
    const s = p.stats;
    // what's left of the last volley lands now
    for (const r of p.volley) r.t = 0;
    this.volley(p);
    const hit = p.tagged
      .map((id) => this.enemies.find((e) => e.id === id))
      .filter((e): e is Enemy => !!e && !e.dead && !e.shielded)
      .sort((a, b) => (a.x - p.x) ** 2 + (a.z - p.z) ** 2 - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
    p.tagged = [];
    if (!hit.length) return;
    const guns = s.guns.filter((g) => !g.heavy);
    const base = Math.max(FLYBY_MIN, guns.reduce((a, g) => a + this.gunDamage(p, g).dmg * g.spec.count, 0) * FLYBY_K);
    const dmg = base * (1 + FLYBY_CHAIN * Math.min(FLYBY_CHAINS, hit.length - 1));
    this.emit({ type: 'flyby', id: p.id, x: p.x, z: p.z, to: hit.map((e) => ({ x: e.x, z: e.z })) });
    p.volley = hit.map((e, k) => ({ id: e.id, t: k * FLYBY_STEP, dmg, n: k }));
    p.volleyOf = hit.length;
    p.volleyKills = 0;
    this.volley(p);
  }

  /** The FLY-BY volley's rounds landing as they come due; a volley that kills two or more gives the dash back. */
  private volley(p: Player) {
    const guns = p.stats.guns.filter((g) => !g.heavy);
    while (p.volley.length && p.volley[0].t <= 0) {
      const r = p.volley.shift()!;
      const last = !p.volley.length;
      const e = this.enemies.find((o) => o.id === r.id);
      const live = !!e && !e.dead && !e.shielded;
      if (live) {
        this.credited('FLY-BY', () => {
          this.blowing++;
          this.damage(e, r.dmg, p.id, true, { x: p.x, z: p.z });
          this.blowing--;
          if (!e.dead) for (const g of guns) if (g.marks) this.credited(g.part.id, () => mark(this, e, g.marks, g.markStr, p.id));
        });
      }
      // (one the guns got to first still counts: it's down)
      if (!e || e.dead) p.volleyKills++;
      const sweep = last && p.volleyKills >= 2;
      if (e && (live || sweep)) this.emit({ type: 'flybyHit', id: p.id, enemy: e.id, x: e.x, z: e.z, fx: p.x, fz: p.z, n: r.n, of: p.volleyOf, kill: live && e.dead, sweep });
      if (sweep) {
        p.dashes = p.stats.dashes;
        p.dashLock = Math.min(p.dashLock, p.dashT);
      }
    }
    for (const r of p.volley) r.t -= DT;
  }

  /** The first parry of a burst: the reward for the timing. A perfect, and the riposte. */
  private perfectParry(p: Player, count: number) {
    p.charge = Math.min(1, p.charge + PARRY_CHARGE);
    // Rewards apply to the pilot; no blanket invulnerability against overlapping hazards.
    p.riposte = RIPOSTE_TIME;
    this.perfect(p, 'parry', count);
  }

  /** A cell of shield from a part, one cell over the top at most. */
  private gainShield(p: Player, source: 'siphon') {
    if (p.shield >= p.stats.shield + SHIELD_CELL) return;
    p.shield = Math.min(p.stats.shield + SHIELD_CELL, p.shield + SHIELD_CELL);
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

  /** A gun's damage now: the lance's speed, SPITE, PRIMED. */
  private gunDamage(p: Player, g: Gun) {
    let dmg = g.spec.damage;
    if (g.spec.speedy) dmg *= 1 + p.boosting;
    if (g.affix === 'spite' && p.spiteT > 0) dmg *= SPITE_DMG;
    if (g.primed && p.primeT > 0) dmg *= PRIMED_DMG;
    dmg *= this.mind.luckMul(p, g.heavy ? 'H' : 'T');
    if (p.riposte > 0) return { dmg: dmg * RIPOSTE_DMG, crit: true };
    return { dmg, crit: false };
  }

  /** The dash just began: what the dash mods add. */
  private dashMods(p: Player) {
    const s = p.stats;
    const m = s.mod;
    p.rammed = [];
    p.sparked = [];
    p.tagged = [];
    const x0 = p.x;
    const z0 = p.z;
    if (m.blink > 0) this.blink(p);
    // where it ends up (for mines along the way)
    const x1 = m.blink > 0 ? p.x : x0 + p.dashX * s.dashSpeed * s.dashTime;
    const z1 = m.blink > 0 ? p.z : z0 + p.dashZ * s.dashSpeed * s.dashTime;
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
      const tx = clamp(x0 + p.dashX * d, -REACH_W + 1.2, REACH_W - 1.2);
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

  /**
   * Ram Prow, and the Hammerhead's BATTERING RAM: a hit on everything along a bit of the dash (once
   * each a dash). The Hammerhead's hits with the whole head, as a blow: it breaks plating (the
   * next ram takes the reeling down), and every foe it hits gives the dash back sooner.
   */
  private ramAlong(p: Player, x0: number, z0: number, x1: number, z1: number) {
    const s = p.stats;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const l2 = dx * dx + dz * dz || 1;
    for (const e of this.enemies) {
      if (e.dead || e.shielded || e.ground || e.t < 0 || p.rammed.includes(e.id)) continue;
      // (something already reeling is a takedown's, not a ram's: see collide)
      if (s.battering && e.state === 'stagger' && !e.d.td) continue;
      const t = clamp(((e.x - x0) * dx + (e.z - z0) * dz) / l2, 0, 1);
      if ((x0 + dx * t - e.x) ** 2 + (z0 + dz * t - e.z) ** 2 > (e.r + s.ramW) ** 2) continue;
      p.rammed.push(e.id);
      const plated = e.armour > 0;
      this.emit({ type: 'ram', id: p.id, x: e.x, z: e.z, enemy: e.id, heavy: s.battering && (plated || e.elite) });
      e.stun = Math.max(e.stun, 0.3);
      if (s.battering) this.blowing++;
      this.damage(e, s.mod.ram * (p.perfect ? 1.5 : 1), p.id, p.perfect);
      // Ram Spurs: what's rammed takes the touching guns' marks (after the blow, so the next one cashes them)
      if (s.ramMarks && !e.dead) this.credited('recoil', () => mark(this, e, s.ramMarks, 1, p.id));
      if (s.battering) {
        this.blowing--;
        if (!e.dead && !e.boss && e.armour > 0) this.breakPlating(e, p.id);
        p.dashCd = Math.max(0, p.dashCd - (e.dead ? RAM_BACK_KILL : RAM_BACK));
      }
      if (s.affixes.barbed) this.barb(p, e);
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
      case 'frozen':
      case 'pinned':
      case 'airborne':
        return axEdge(edge, e);
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
    for (const b of this.bullets) if (!b.dead && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < (r * 0.6) ** 2) this.cancel(b);
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
    for (const b of this.bullets) if (!b.dead && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < NOVA_R * NOVA_R) this.cancel(b);
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
      if (p.weldT >= WELD.hold + this.mind.weldTime(p, WELD.time)) {
        p.hp = Math.min(p.stats.hp, p.hp + Math.round(p.stats.hp * WELD_HEAL));
        p.weld = 0;
        p.weldT = 0;
        p.welds++;
        this.emit({ type: 'weld', id: p.id, state: 'done', x: p.x, z: p.z });
        this.mind.welded(p);
        return false;
      }
      return true;
    }
    const can = p.weld >= 1 && p.hp < p.stats.hp && i.focus && (!i.fire || this.mind.fieldWeld(p)) && p.dashT <= 0 && !p.hook && this.state !== 'clear';
    p.weldT = can ? p.weldT + DT : 0;
    if (p.weldT < WELD.hold) return false;
    this.emit({ type: 'weld', id: p.id, state: 'start', x: p.x, z: p.z });
    return true;
  }

  /** The Weld charging: `k` of a full one. */
  feedWeld(p: Player, k: number) {
    // (not what a special does: that's its own reward)
    if (p.down || k <= 0 || this.inSpecial || !this.mind.charging(p)) return;
    // full: a SPARE TANK takes what's over
    if (p.weld >= 1) return this.mind.spare(p, k);
    p.weld = Math.min(1, p.weld + k);
    if (p.weld >= 1) this.emit({ type: 'weld', id: p.id, state: 'ready', x: p.x, z: p.z });
  }

  /** A blow: a hit that breaks plating at full strength (the stream only chips it). */
  private isBlow(p: Player | undefined, dmg: number, crit: boolean, s?: Shot) {
    if (crit || this.blowing > 0 || dmg >= BLOW_DMG || this.mind.blows(p)) return true;
    if (s) return !!s.heavy || !!s.strike || !!s.blow || s.tag === 'reflect' || s.tag === 'mirror' || s.tag === 'nova';
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
        this.cancel(b);
        absorbed++;
      }
    if (p.perfect) return;
    p.perfect = true;
    p.dashes = Math.min(p.stats.dashes, p.dashes + 1);
    // the Wasp gets them all back and skips the recovery; the afterimage burns hotter
    if (p.stats.mod.refill) {
      p.dashes = p.stats.dashes;
      p.dashLock = Math.min(p.dashLock, p.dashT);
    }
    for (const d of this.decoys) if (d.kind === 'ghost' && d.owner === p.id && d.t < p.stats.slip + DT) d.power *= 2;
    this.perfect(p, 'dash', absorbed);
    // DEFLECTING: what it soaked goes back at them (at least a few, to the nearest)
    if (p.stats.affixes.deflecting) {
      for (let k = 0; k < Math.min(8, Math.max(3, absorbed)); k++) {
        const t = this.nearest(p.x, p.z);
        const dir = t ? Math.atan2(t.x - p.x, -(t.z - p.z)) : 0;
        this.addShot(p.id, 'slug', p.x, p.z, dir + (k - 1.5) * 0.12, 55, DEFLECT_DMG, 1, 0, 1).tag = 'reflect';
      }
      this.emit({ type: 'affix', id: p.id, affix: 'deflecting', x: p.x, z: p.z });
    }
  }

  /**
   * A perfect, either way: what every perfect pays (Burn, the Weld, a round in every heavy, the
   * core's nerve, a read on a boss mid-attack, the perfect affixes). What's the dash's own (a dash
   * back) or the guard's (the riposte) is paid where it happens.
   */
  private perfect(p: Player, how: PerfectHow, absorbed: number) {
    p.perfects++;
    this.echo(p);
    p.chain = p.chainT <= PERFECT_CHAIN ? p.chain + 1 : 1;
    p.chainT = 0;
    this.reloadHeavies(p);
    p.burn = Math.min(1, p.burn + BURN_PERFECT);
    this.feedWeld(p, how === 'parry' ? WELD.parry : WELD.perfect);
    this.mind.perfect(p, how);
    // a perfect read: through a boss's attack it wears its poise hard, through its signature it breaks it
    for (const e of this.enemies) if (e.boss && !e.dead && e.state === 'attack') bossRead(this, e);
    this.emit({ type: 'perfect', id: p.id, x: p.x, z: p.z, absorbed, how, chain: p.chain });
    const af = p.stats.affixes;
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
      const g = d - c.r - BODY;
      if (g < gap) {
        gap = Math.max(0, g);
        nx = c.x + (dx / d) * c.r;
        nz = c.z + (dz / d) * c.r;
      }
    }
    // the land itself (canyon walls): look round at the edge of reach first, closer in if it's there
    // (all from the body's edge, where collideLand feels it)
    const solidAt = (r: number) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        if (t.solid(x, z)) return { x, z };
      }
      return null;
    };
    if (solidAt(BODY + SKIM)) {
      for (const g of [0.2, 0.6, 1, SKIM]) {
        const hit = g - 0.2 < gap ? solidAt(BODY + g) : null;
        if (hit) {
          gap = g - 0.2;
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

  /**
   * Where the body is in the land at (x, z): the middle of the rock it's in, and the way out of it
   * (away from that rock, round the body's edge), or null if it's clear.
   */
  private landTouch(x: number, z: number): { x: number; z: number; nx: number; nz: number } | null {
    const t = this.terrain;
    let n = 0;
    let sx = 0;
    let sz = 0;
    for (const [cx, cz] of RIM) {
      if (!t.solid(x + cx * BODY, z + cz * BODY)) continue;
      n++;
      sx += cx;
      sz += cz;
    }
    const mid = t.solid(x, z);
    if (!n && !mid) return null;
    const l = Math.hypot(sx, sz);
    if (n && n < RIM.length && l > 0.2) return { x: x + (sx / n) * BODY, z: z + (sz / n) * BODY, nx: -sx / l, nz: -sz / l };
    // in it all round (or squeezed from both sides): out the way the ground falls away, or a canyon's way out
    if (t.biome(z).shape === 'canyon') {
      const o = t.outOfRock(x, z);
      const ol = Math.hypot(o.x, o.z) || 1;
      return { x, z, nx: o.x / ol, nz: o.z / ol };
    }
    const e = 0.8;
    const gx = t.height(x + e, z) - t.height(x - e, z);
    const gz = t.height(x, z + e) - t.height(x, z - e);
    const g = Math.hypot(gx, gz) || 1;
    return { x, z, nx: -gx / g, nz: -gz / g };
  }

  /** Into the land or an obstacle: put back outside it, thrown off it, and a hit. Returns whether it touched. */
  private collideLand(p: Player): boolean {
    const t = this.terrain;
    // the obstacle it's deepest in, against the land it's in
    let hit: { x: number; z: number; nx: number; nz: number } | null = null;
    let deep = 0;
    for (const c of t.colliders(p.x, p.z, 3)) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const over = c.r + BODY - d;
      if (over <= deep) continue;
      deep = over;
      const nx = d > 1e-6 ? dx / d : 0;
      const nz = d > 1e-6 ? dz / d : 1;
      hit = { x: c.x + nx * c.r, z: c.z + nz * c.r, nx, nz };
    }
    if (hit) {
      p.x += hit.nx * (deep + 0.05);
      p.z += hit.nz * (deep + 0.05);
    }
    const land = this.landTouch(p.x, p.z);
    if (land) {
      hit ??= land;
      // out along the way it came in, till the body's clear (a wall scrolling on can bury it a way)
      for (let k = 0; k < 30 && this.landTouch(p.x, p.z); k++) {
        p.x += land.nx * 0.15;
        p.z += land.nz * 0.15;
      }
    }
    if (!hit) return false;
    p.vx = hit.nx * 22;
    p.vz = hit.nz * 22 + 4;
    if (p.inv <= 0) {
      p.crashes++;
      this.emit({ type: 'crash', id: p.id, x: hit.x, z: hit.z, nx: hit.nx, nz: hit.nz });
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
export const PARRY_WINDOW = 0.1;
const PARRY_R = 2.4;
const BLOCK_R = 1.9;
export const BLOCK_MAX = 3;
/** A parried small projectile's damage (more with Burn). */
const PARRY_DMG = 14;
/**
 * FLY-BY (the Kestrel): how far past a foe's edge the dash tags it, how many one dash can tag, and
 * the volley's hit on each: the trigger guns' damage (every pellet) this many times over, never
 * under the least.
 */
const FLYBY_R = 4.5;
const FLYBY_MAX = 8;
const FLYBY_K = 3;
const FLYBY_MIN = 14;
/** FLY-BY: the gap between its rounds landing, and how much harder every round hits for each foe more the dash tagged (up to so many more). */
const FLYBY_STEP = 0.06;
const FLYBY_CHAIN = 0.2;
const FLYBY_CHAINS = 4;
/** KINDLING: how far round a kill the fire catches. */
const KINDLE_R = 5;
/** Graze Fins: grazes for a round. */
const GRAZE_FEED = 3;
/** BATTERING RAM (the Hammerhead): seconds of dash back for each foe rammed, and for each one it kills. */
const RAM_BACK = 0.35;
const RAM_BACK_KILL = 0.6;
/** RIPOSTE: how long after a perfect parry the guns crit, and how much harder they hit in it. */
export const RIPOSTE_TIME = 1.2;
const RIPOSTE_DMG = 1.3;
/** Perfects closer together than this (seconds) run on as a chain. */
const PERFECT_CHAIN = 3;
/** Special charge for a parry, and for each bullet in it. */
const PARRY_CHARGE = 0.08;
const PARRY_CHARGE_EACH = 0.03;
/** The wait after: a parry, a block, a whiff (a good read comes back soonest; it can't be held up against everything), and a tether kill. */
export const CD_PARRY = 1.5;
const CD_BLOCK = 2.5;
export const CD_WHIFF = 3;
const CD_TETHER_KILL = 0.2;
/** Grapple Tether: reach, reel speed, the hit on arrival, how long it can reel, the waits. */
export const TETHER_RANGE = 24;
const REEL = 75;
export const TETHER_HIT = 24;
const TETHER_TIME = 0.6;
export const CD_TETHER = 3;
const CD_MISS = 0.6;
/** Decoy Flare, and how far away aimed fire notices a decoy. */
export const FLARE_LIFE = 2.5;
export const FLARE_DMG = 24;
const FLARE_R = 4.5;
export const CD_FLARE = 6;
const DECOY_REACH = 45;
/** Void Siphon: how long, its pull and reach, the mouth, bullets per shield, the slowdown, the wait. */
export const SIPHON_TIME = 1.5;
const SIPHON_R = 10;
const SIPHON_PULL = 90;
const SIPHON_EAT = 1.6;
export const SIPHON_PER = 6;
export const SIPHON_SLOW = 0.3;
export const CD_SIPHON = 7;
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
/** Volatile crates: seconds carried till the lock cracks, by what's inside; its bolts give at even steps on the way. */
export const HOT_CRACK: Record<Tier, number> = { common: 20, rare: 25, epic: 30, legendary: 45 };
export const HOT_BOLTS = 3;
/**
 * The hull is a number (a frame's 60 to 100), and a hit takes what it's worth. A GRAZE of light
 * stuff (spores, acid, a jet's wash), a HIT (shots, shells, rams, the land, beams: a beam always
 * charges where you can see it, and sweeps), or a HEAVY blow (big orbs, torpedoes, seekers, slams,
 * lightning, a crate going up): the bigger the tell, the more it takes, but never so much that
 * three hits end a 60-hull ship (playtest 3). Hits grow with the run, as the enemies' hulls do.
 */
export type HitTier = 'graze' | 'hit' | 'heavy';
export const HIT_DMG: Record<HitTier, number> = { graze: 8, hit: 15, heavy: 22 };
const HIT_GROWTH = 0.3;
/** Seconds without a hit before the shield starts coming back, and how fast it fills then (points a second). */
const SHIELD_WAIT = 10;
const SHIELD_RATE = 4;
/** The store a level starts with, in full shields: it refills the shield about this many times, then it stays down. */
export const SHIELD_STORE = 2;
const HEAVY_CAUSES = new Set(['torpedo', 'seeker', 'slam', 'ball', 'lightning', 'crate']);
const GRAZE_CAUSES = new Set(['spore', 'acid', 'puddle', 'jetwash']);
export const tierOf = (cause: string): HitTier => (HEAVY_CAUSES.has(cause) ? 'heavy' : GRAZE_CAUSES.has(cause) ? 'graze' : 'hit');
const BULLET_TIER: Record<BulletKind, HitTier> = { orb: 'hit', needle: 'hit', mine: 'hit', spore: 'graze', big: 'heavy', torpedo: 'heavy', seeker: 'heavy' };
/** A step of hull (the old pip): a repair kit's worth, a dock's patch, an event's knock. */
export const HULL_STEP = 20;
/** Shares of the hull: a Weld mends this much, a jumpstart comes back with this, a SECOND WIND leaves this. */
export const WELD_HEAL = 0.25;
const JUMP_HULL = 0.4;
/** Co-op downs: a partner within this reach for this long jumpstarts you. */
export const JUMP_REACH = 3.6;
export const JUMP_TIME = 1.6;
/** How far a jumpstart's jolt clears the fire. */
export const JUMP_JOLT = 9;
/** The partner close enough to be jumpstarting a down ship, if any. */
export const jumpHelper = (players: Player[], p: Player) => players.find((q) => q !== p && !q.down && (q.x - p.x) ** 2 + (q.z - p.z) ** 2 < JUMP_REACH * JUMP_REACH);
/** How long a down ship holds out with nobody close before it crashes (s). */
export const JUMP_WAIT = 20;
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
 * (a hit counts up to `cap`), and per perfect dash, perfect parry and takedown (an elite's, or a
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

/**
 * Where a bullet came nearest a ship this step, relative to the ship (x, z): both moved, so it's
 * the nearest point of the bullet's path as the ship saw it. A jump (spawned, warped, carried off
 * by a pickup) counts only where it ended up. A needle counts along its length.
 */
function closest(b: Bullet, p: Player): [number, number] {
  const ex = b.x - p.x;
  const ez = b.z - p.z;
  // (a jump counts only where it ended up)
  const sx = b.ox === undefined || p.ox === undefined ? ex : b.ox - p.ox;
  const sz = b.oz === undefined || p.oz === undefined ? ez : b.oz - p.oz;
  const dx = ex - sx;
  const dz = ez - sz;
  const len2 = dx * dx + dz * dz;
  const t = len2 < 1e-6 || len2 > SWEEP_MAX * SWEEP_MAX ? 1 : Math.min(1, Math.max(0, -(sx * dx + sz * dz) / len2));
  const cx = sx + dx * t;
  const cz = sz + dz * t;
  if (b.kind !== 'needle') return [cx, cz];
  // a needle is long: it hits along its length (a capsule down the way it flies), as it's drawn
  const sp = Math.hypot(b.vx, b.vz);
  if (sp < 1e-3) return [cx, cz];
  const ux = b.vx / sp;
  const uz = b.vz / sp;
  const along = Math.min(NEEDLE_HALF, Math.max(-NEEDLE_HALF, -(ex * ux + ez * uz)));
  const nx = ex + ux * along;
  const nz = ez + uz * along;
  return nx * nx + nz * nz < cx * cx + cz * cz ? [nx, nz] : [cx, cz];
}
/** Further than this (units) in a step isn't flying: it's a jump (see `closest`). */
const SWEEP_MAX = 4;
/** A needle's hitbox runs this far (units) ahead of and behind its middle, its radius round that. */
export const NEEDLE_HALF = 0.6;

function sweep<T extends { dead: boolean }>(xs: T[]) {
  let j = 0;
  for (let i = 0; i < xs.length; i++) if (!xs[i].dead) xs[j++] = xs[i];
  xs.length = j;
}

/**
 * How much tougher enemies get as the run goes on: under their base hull at the first stop
 * (the start guns are all you have), about double by the third sector, growing with the ship.
 */
export const hullGrowth = (difficulty: number) => 0.6 + difficulty;
/** Enemy hull with two ships shooting at it (the boss's too). */
export const COOP_HULL = 1.5;

export const HP: Record<Archetype | 'boss', number> = {
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

/** The nearest point of a foe to (x, z): its middle, or along its body for an eel lying down its channel. */
function nearOn(e: Enemy, x: number, z: number): [number, number] {
  if (e.arch !== 'eel' || e.d.bx === undefined || e.d.bz === undefined) return [e.x, e.z];
  const dx = e.d.bx - e.x;
  const dz = e.d.bz - e.z;
  const t = clamp(((x - e.x) * dx + (z - e.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return [e.x + dx * t, e.z + dz * t];
}
