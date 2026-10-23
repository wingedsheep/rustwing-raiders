/**
 * A boarding: you cut into a ship's aft lock and go aboard on foot. The crew are at their posts;
 * most haven't seen you yet. Somewhere in the holds are the crates worth taking (each one a card
 * at the results), on the bridge the strongbox, and in the vault the ship's core, worth more than
 * the rest put together. You carry it out in your arms, and pulling it locks the ship down.
 *
 * Whose ship it is decides who's aboard (see CREW in deck.ts): a scrap crew flares and commits,
 * a lattice crew draws every blow out in light first (and now and then stops to listen to
 * something far off, wide open), a bloom crew swells before it bursts and heals its own. How big
 * she is and what state she's in (dark, caged beasts in her hold, a tear in her hull) come from
 * the site.
 *
 * The moment you're in, somebody calls it in, and the kelters come: guild collectors cashing the
 * writ on your head, the bigger your price the sooner. A hand who gets to an alarm panel brings
 * them sooner still. When their pod clamps on, your own ship can only hold the lock a little
 * longer. Get back to it with what you've got, or be collected.
 *
 * On foot, with Rustwing's verbs: a rivet pistol you hold (it finds its own mark, near where
 * you're facing), the breacher you press (two shells, wide and brutal: it cracks plating), and
 * the dash, a slide. Plated crew glance most rivets off; crack the plating and they're OPEN:
 * slide into one for a takedown, which patches you up. A slide through a hit just as it lands is
 * PERFECT: a shell comes back. Anyone who hasn't seen you yet goes down to a slide from anywhere,
 * and they don't see you at once: what they glimpse builds, and you can be gone before it does.
 *
 * More of you, more of them: every partner brings more crew, tougher, and more kelters.
 *
 * Plain TypeScript at a fixed 60 Hz, driven only by Intents (no three.js): the view reads the
 * state and the events. Nothing here changes the clock's pace (see docs/parry-rules.md).
 */

import { DT, type Intent } from './types';
import { CRATES, Deck, type Condition, type CrewKind, type Family, type Gate, type Prop, type Room, type ShipSize } from './deck';
import { clamp, rng, type Rng } from '../util';

export type FoeKind = CrewKind | 'kelter';

export type FoeState =
  | 'idle' | 'sleep' | 'alert' | 'chase' | 'move' | 'alarm' | 'pull' | 'windup' | 'swing' | 'recover' | 'aim' | 'burst'
  | 'charge' | 'stun' | 'stagger' | 'reel' | 'dead' | 'listen' | 'swell' | 'lunge' | 'shove' | 'rear' | 'pounce' | 'caged'
  | 'ignite' | 'spray' | 'stamp' | 'dig' | 'rumble';

export type Role = 'melee' | 'gun' | 'heavy' | 'odd' | 'beast' | 'kelter';

/** What each kind aboard is: hull, plating, size, pace, how far it sees, whose it is, its job. */
export const FOES: Record<FoeKind, { hp: number; plate: number; r: number; speed: number; sight: number; name: string; family: Family | 'wild' | 'guild'; role: Role }> = {
  deckhand: { hp: 4, plate: 0, r: 0.36, speed: 4.3, sight: 10, name: 'DECKHAND', family: 'scrap', role: 'melee' },
  gunner: { hp: 5, plate: 4, r: 0.38, speed: 3.6, sight: 13, name: 'GUNNER', family: 'scrap', role: 'gun' },
  bruiser: { hp: 12, plate: 8, r: 0.62, speed: 2.5, sight: 11, name: 'BRUISER', family: 'scrap', role: 'heavy' },
  torcher: { hp: 7, plate: 3, r: 0.44, speed: 3.0, sight: 11, name: 'TORCHER', family: 'scrap', role: 'odd' },
  clerk: { hp: 5, plate: 4, r: 0.36, speed: 4.8, sight: 11, name: 'CLERK', family: 'lattice', role: 'melee' },
  auditor: { hp: 6, plate: 5, r: 0.38, speed: 3.4, sight: 15, name: 'AUDITOR', family: 'lattice', role: 'gun' },
  warden: { hp: 13, plate: 4, r: 0.6, speed: 2.3, sight: 11, name: 'BULWARK', family: 'lattice', role: 'heavy' },
  notary: { hp: 6, plate: 2, r: 0.4, speed: 2.7, sight: 14, name: 'NOTARY', family: 'lattice', role: 'odd' },
  thrall: { hp: 5, plate: 0, r: 0.4, speed: 3.3, sight: 9, name: 'THRALL', family: 'bloom', role: 'melee' },
  puffer: { hp: 5, plate: 0, r: 0.42, speed: 3.2, sight: 12, name: 'PUFFER', family: 'bloom', role: 'gun' },
  nurse: { hp: 13, plate: 0, r: 0.6, speed: 2.2, sight: 10, name: 'NURSE', family: 'bloom', role: 'heavy' },
  rooter: { hp: 8, plate: 0, r: 0.5, speed: 5.4, sight: 11, name: 'ROOTER', family: 'bloom', role: 'odd' },
  skulk: { hp: 9, plate: 0, r: 0.45, speed: 6.6, sight: 14, name: 'SKULK', family: 'wild', role: 'beast' },
  kelter: { hp: 6, plate: 5, r: 0.4, speed: 5.0, sight: 18, name: 'KELTER', family: 'guild', role: 'kelter' },
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
  /** With the core in your arms: this much of your pace. */
  carry: 0.72,
  /** Down with a partner still standing: this long for them to haul you up, before the crew throw you out. */
  bleed: 15,
};

/** Seconds to work things open (standing at them, not shooting). Two of you at one thing: twice as fast. */
export const WORK = { crate: 1.8, strongbox: 3.0, core: 3.4, leave: 0.8, revive: 1.6, heart: 0.45 };

/** How long the kelters take (by size, before the price on you), and how long your ship holds the lock once they're aboard. */
export const CLOCK = { base: [50, 62, 78, 94], min: [32, 38, 46, 54], perBounty: 5, perHard: 5, alarm: 12, lockdown: 16, dock: 26 };

/** The gates' cycle (s): off (the last of it warming, drawn faint), then on. */
export const GATE = { off: 1.9, warm: 0.65, on: 2.0 };
/** The breach breathes: calm, then a gust that drags everything loose towards the hole. */
export const VENT = { calm: 3.2, warm: 1.0, gust: 4.2, reach: 9, pull: 17 };

/**
 * Arms off the deck: what the crew carry, dropped when they go down. One in your hand at a time
 * (in the pistol's place) till it's empty, then it's thrown away and the pistol's back.
 *   nailer   scrap: a hose of nails, light and wild; for whoever likes to lean on the trigger
 *   scatter  scrap: a pump scattergun, a wall of lead at arm's length that kicks you back
 *   lance    lattice: hold to draw it, then a beam through everyone to the bulkhead
 *   stamp    lattice: a heavy seal round that comes back off the walls, twice
 *   spore    bloom: lobs a sac where you're aiming; its cloud eats crew (not you)
 *   hook     the kelters': reels a crewman in, open for a slide; a heavy one reels you in instead
 */
export type ArmKind = 'nailer' | 'scatter' | 'lance' | 'stamp' | 'spore' | 'hook';
export const ARMS: Record<ArmKind, { ammo: number; rate: number }> = {
  nailer: { ammo: 40, rate: 14 },
  scatter: { ammo: 7, rate: 1.7 },
  lance: { ammo: 5, rate: 1.6 },
  stamp: { ammo: 10, rate: 2.4 },
  spore: { ammo: 5, rate: 1.3 },
  hook: { ammo: 6, rate: 1.6 },
};
/** Seconds the lance takes to draw (fire held). */
export const LANCE_DRAW = 0.4;
/** Who drops what, and how often. */
const ARM_DROP: Partial<Record<FoeKind, [ArmKind, number]>> = {
  gunner: ['nailer', 0.4], bruiser: ['scatter', 0.55], torcher: ['nailer', 0.3],
  auditor: ['lance', 0.4], warden: ['stamp', 0.55], notary: ['stamp', 0.35],
  puffer: ['spore', 0.4], nurse: ['spore', 0.5], rooter: ['scatter', 0.25],
  kelter: ['hook', 0.35],
};
/** What a crew keeps aboard (one's lying about, and the strongbox may hold another). */
const FAMILY_ARMS: Record<Family, ArmKind[]> = { scrap: ['nailer', 'scatter', 'hook'], lattice: ['lance', 'stamp'], bloom: ['spore', 'scatter', 'hook'] };

/** Burning fuel (a canister's spill, a torcher's tank): burns whoever stands in it, crew and you; lights spores. */
export const FIRE = { r: 1.7, life: 5.5 };
/** The engine-room pipes: a hiss, then a scalding jet off the wall. A shot bursts one early. */
export const STEAM = { calm: 4.5, warm: 0.8, jet: 1.3, len: 3.4, w: 0.55 };
/** Hazards bite on a beat this long (fire, steam, your spores). */
const TICK = 0.3;

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
  /** A slide pressed too soon, held for a moment (as the flight's dash: see DASH_QUEUE there). */
  dashQ: number;
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
  /** Down too long: thrown out the lock, back to your ship (out of it till the end). */
  out: boolean;
  /** Down with a partner standing: seconds left to be hauled up. */
  bleed: number;
  /** Knocked off its feet (by a reel-in, a blast): no control. */
  stun: number;
  hook: { by: number } | null;
  work: { kind: keyof typeof WORK; id: number; t: number } | null;
  /** The core in its arms. */
  carry: boolean;
  /** In spores: the pistol jams (seconds it stays jammed). */
  jam: number;
  dryT: number;
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
  /** What it picked up (the pistol when null), rounds left in it, how far the lance is drawn. */
  arm: ArmKind | null;
  ammo: number;
  draw: number;
  swapCd: number;
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
  /** How long the timed state it's in lasts in all (the view reads t / dur as a tell's progress). */
  dur: number;
  /** Cooldowns: its main attack, its other one. */
  cd: number;
  cd2: number;
  aware: boolean;
  asleep: boolean;
  runner: boolean;
  /** What it's glimpsed of you, before it knows (0..1: at 1, it knows), and where. */
  sus: number;
  seenX: number;
  seenZ: number;
  /** Which hero it's after. */
  target: number;
  room: number;
  /** Strafing this way (gunners). */
  strafe: number;
  shots: number;
  sinceHit: number;
  /** Who last hurt it (for the credit when the air takes it). */
  lastHero: number;
  flash: number;
  dead: boolean;
  deathT: number;
  /** Which way it was going when it fell. */
  fallA: number;
  takenDown: boolean;
  /** The air took it (a breach). */
  spaced: boolean;
  /** Its alarm panel, while it runs for one. */
  alarmAt: number;
  home: { x: number; z: number };
  /** For the view's steps and gait. */
  stride: number;
  /** A warden's wall of light: how much is left of it, all of it, and the seconds till it's back up. */
  wall: number;
  wallMax: number;
  wallT: number;
  /** A nurse's lines into the crew it's mending (foe ids). */
  links: number[];
  /** Where a lunge, a lob or a pounce is going. */
  tx: number;
  tz: number;
  /** A beast's prey: a hero, or one of the crew. */
  prey: { hero: number } | { foe: number } | null;
  /** Dead and flying: the crew it's bowled over already. */
  bowled: number[];
  /** A torcher's tank: shots in it (enough and it goes up). */
  tank: number;
  /** A rooter under the deck: nothing touches it. */
  under: boolean;
}

export interface Round {
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  life: number;
  from: 'hero' | 'foe';
  kind: 'rivet' | 'pellet' | 'crew' | 'hook' | 'turret' | 'reflect' | 'nail' | 'stamp' | 'harpoon' | 'flame';
  owner: number;
  dmg: number;
  plate: number;
  knock: number;
  dead: boolean;
  /** Times left it comes back off a wall (a stamp). */
  bounce?: number;
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
  /** A hand at it, pulling: how far (0..1). */
  pull: number;
}

/** A cloud of spores: inside it your pistol jams. */
export interface Cloud {
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
  /** Yours (a sporecaster's): it eats crew and leaves your pistol be. The hero it's from. */
  ours?: number;
}

/** A spore sac in the air, from a puffer to where it'll burst. */
export interface Sac {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  t: number;
  dur: number;
  ours?: number;
}

/** An auditor's lance (or yours), just gone (for the view to fade). */
export interface Lance {
  x: number;
  z: number;
  a: number;
  len: number;
  t: number;
  hero?: boolean;
}

/** An arm on the deck. */
export interface FloorArm {
  id: number;
  kind: ArmKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  ammo: number;
  t: number;
}

export interface Fire {
  x: number;
  z: number;
  r: number;
  t: number;
  life: number;
}

/** A steam pipe: the mouth of the jet, the way it blows, and where it is in its breath. */
export interface Steam {
  prop: Prop;
  x: number;
  z: number;
  a: number;
  t: number;
  cycle: number;
  warm: boolean;
  on: boolean;
}

/** A notary's seal on the deck: arms, then bursts. */
export interface Seal {
  x: number;
  z: number;
  t: number;
  dur: number;
  by: number;
}

export interface GateState {
  gate: Gate;
  on: boolean;
  /** Drawn faint, about to come on. */
  warm: boolean;
}

export interface Cage {
  prop: Prop;
  hp: number;
  open: boolean;
  foe: number;
}

/** The core, out of its cradle: in someone's arms, or on the deck where it was dropped. */
export interface Heart {
  x: number;
  z: number;
  carrier: number;
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
  | { type: 'thrownOut'; hero: number }
  | { type: 'perfect'; hero: number; x: number; z: number }
  | { type: 'dash'; hero: number }
  | { type: 'step'; x: number; z: number; hero: boolean; heavy: boolean }
  | { type: 'wall'; x: number; z: number; a: number; heavy: boolean }
  | { type: 'alert'; id: number }
  | { type: 'suspect'; id: number }
  | { type: 'runner'; id: number }
  | { type: 'alarm'; x: number; z: number; by: number }
  | { type: 'alarmBroken'; x: number; z: number }
  | { type: 'door'; id: number; open: boolean }
  | { type: 'windup'; id: number }
  | { type: 'swing'; id: number }
  | { type: 'aim'; id: number }
  | { type: 'charge'; id: number }
  | { type: 'slam'; id: number; x: number; z: number }
  | { type: 'listen'; id: number }
  | { type: 'lance'; id: number; x: number; z: number; a: number; len: number }
  | { type: 'reflect'; id: number; x: number; z: number; a: number }
  | { type: 'wallHit'; id: number; x: number; z: number }
  | { type: 'wallBreak'; id: number; x: number; z: number }
  | { type: 'wallUp'; id: number }
  | { type: 'shove'; id: number }
  | { type: 'swell'; id: number }
  | { type: 'lob'; id: number; x: number; z: number }
  | { type: 'spores'; x: number; z: number; r: number }
  | { type: 'jam'; hero: number }
  | { type: 'gate'; i: number; on: boolean }
  | { type: 'gateHit'; hero: number; x: number; z: number }
  | { type: 'cage'; i: number; x: number; z: number }
  | { type: 'rear'; id: number; x: number; z: number }
  | { type: 'pounce'; id: number; x: number; z: number }
  | { type: 'spaced'; id: number; x: number; z: number }
  | { type: 'vent'; on: boolean }
  | { type: 'crate'; i: number; x: number; z: number }
  | { type: 'strongbox'; x: number; z: number; pay: number }
  | { type: 'core'; x: number; z: number }
  | { type: 'carry'; hero: number }
  | { type: 'drop'; hero: number; x: number; z: number }
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
  | { type: 'failed'; how: 'downed' | 'caught' }
  | { type: 'arm'; hero: number; kind: ArmKind }
  | { type: 'armDrop'; id: number; kind: ArmKind; x: number; z: number }
  | { type: 'armShot'; hero: number; kind: ArmKind; x: number; z: number; a: number }
  | { type: 'armDraw'; hero: number }
  | { type: 'toss'; hero: number; kind: ArmKind; x: number; z: number; a: number }
  | { type: 'reel'; hero: number; id: number; zip: boolean }
  | { type: 'bowl'; id: number; x: number; z: number; a: number }
  | { type: 'fire'; x: number; z: number; r: number }
  | { type: 'flare'; x: number; z: number; r: number }
  | { type: 'steam'; i: number; on: boolean }
  | { type: 'steamWarm'; i: number }
  | { type: 'scald'; x: number; z: number }
  | { type: 'ignite'; id: number }
  | { type: 'tank'; id: number; x: number; z: number; k: number }
  | { type: 'raise'; id: number }
  | { type: 'seal'; id: number; x: number; z: number }
  | { type: 'sealBurst'; x: number; z: number }
  | { type: 'burrow'; id: number; x: number; z: number }
  | { type: 'rumble'; id: number; x: number; z: number }
  | { type: 'erupt'; id: number; x: number; z: number };

export interface BoardSpec {
  seed: number;
  /** How hard: the run's difficulty plus the site's danger. */
  hard: number;
  /** The price on your head (from the run): the kelters come sooner. */
  bounty: number;
  heroes: number;
  /** Whose ship (her crew), how big, what state she's in. */
  family?: Family;
  size?: ShipSize;
  condition?: Condition;
  /** How often a lattice crew stops to listen (1 as anywhere; more near the Engine). */
  listen?: number;
}

export type Outcome = 'escaped' | 'downed' | 'caught';

/** What a boarding earns a mark for. */
export type Medal = 'ghost' | 'clean' | 'full' | 'core' | 'quick';
export const MEDALS: Medal[] = ['ghost', 'clean', 'full', 'core', 'quick'];

export interface BoardResult {
  outcome: Outcome;
  /** Each crate aboard: cracked and carried off. */
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
  medals: Medal[];
  rank: 'S' | 'A' | 'B' | 'C' | null;
  size: ShipSize;
  family: Family;
  condition: Condition;
  heroes: { kills: number; takedowns: number; perfects: number; hits: number; out: boolean; tins: number }[];
}

/** The pickings by ship size: the strongbox's weight. */
const PAY_K = [0.7, 1, 1.45, 1.9];

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
  heart: Heart | null = null;
  turrets: Turret[] = [];
  canisters: Canister[] = [];
  alarms: Alarm[] = [];
  medkits: { prop: Prop; used: boolean }[] = [];
  clouds: Cloud[] = [];
  sacs: Sac[] = [];
  lances: Lance[] = [];
  gates: GateState[] = [];
  cages: Cage[] = [];
  arms: FloorArm[] = [];
  fires: Fire[] = [];
  steams: Steam[] = [];
  seals: Seal[] = [];
  /** The hazards' beat. */
  private hazT = 0;
  private hazTick = false;
  /** The breach's breath: seconds into its cycle, and whether it's pulling. */
  ventT = 0;
  venting = false;
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
  readonly family: Family;
  readonly size: ShipSize;
  readonly condition: Condition;
  private nextId = 0;
  private fields: Int16Array[] = [];
  private fieldT: number[] = [];
  private alarmFields = new Map<number, Int16Array>();
  private lastTick = -1;
  private listenP: number;

  constructor(readonly spec: BoardSpec) {
    this.r = rng(spec.seed ^ 0x5eed);
    this.family = spec.family ?? 'scrap';
    this.size = spec.size ?? 1;
    this.condition = spec.condition ?? 'none';
    const n = Math.max(1, spec.heroes);
    this.deck = new Deck({ seed: spec.seed, hard: spec.hard, family: this.family, size: this.size, condition: this.condition, heroes: n });
    const d = this.deck;
    const hard = Math.max(0, spec.hard);
    // tougher the harder it is, and for each partner
    const k = 1 + hard * 0.22 + (n - 1) * 0.3;
    this.listenP = (0.07 + hard * 0.02) * (spec.listen ?? 1);
    for (const post of d.posts) {
      const f = this.spawn(post.kind, post.x, post.z, post.kind === 'skulk' ? 1 + hard * 0.15 : k);
      f.face = post.rot;
      f.asleep = post.asleep;
      f.state = post.cage ? 'caged' : post.asleep ? 'sleep' : 'idle';
      f.runner = post.runner;
      f.room = post.room;
      if (post.cage) this.cages.push({ prop: post.cage, hp: 4, open: false, foe: f.id });
    }
    let ci = 0;
    for (const p of d.props) {
      if (p.kind === 'crate' && ci++ < CRATES[this.size]) this.crates.push({ prop: p, t: 0, open: false });
      else if (p.kind === 'strongbox') this.strongbox = { prop: p, t: 0, open: false };
      else if (p.kind === 'core') this.core = { prop: p, t: 0, open: false };
      else if (p.kind === 'turret') this.turrets.push({ prop: p, up: 0, hp: 5, aimA: 0, state: 'down', t: 0, shots: 0, flash: 0 });
      else if (p.kind === 'canister') this.canisters.push({ prop: p, hp: 2, fuse: -1, gone: false });
      else if (p.kind === 'alarm') this.alarms.push({ prop: p, hp: 3, used: false, broken: false, pull: 0 });
      else if (p.kind === 'medkit') this.medkits.push({ prop: p, used: false });
      else if (p.kind === 'pipes') {
        // the jet blows out of the pipes' face, into the room
        const a = Math.atan2(Math.cos(p.rot), Math.sin(p.rot));
        const cycle = STEAM.calm + this.r() * 2.5;
        this.steams.push({ prop: p, x: p.x + Math.cos(a) * 0.45, z: p.z + Math.sin(a) * 0.45, a, t: this.r() * cycle, cycle, warm: false, on: false });
      }
    }
    // an arm or two lying about, by the cargo (theirs, mostly)
    const pool = FAMILY_ARMS[this.family];
    for (let i = 0; i < (this.size >= 2 ? 2 : 1) && this.crates.length; i++) {
      const c = this.crates[(i * 2 + Math.floor(this.r() * 2)) % this.crates.length].prop;
      for (const [ox, oz] of [[1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) {
        if (d.blocked(Math.floor(c.x + ox), Math.floor(c.z + oz))) continue;
        this.dropArm(pool[Math.floor(this.r() * pool.length)], c.x + ox, c.z + oz, -1, 0);
        break;
      }
    }
    this.gates = d.gates.map((gate) => ({ gate, on: false, warm: false }));
    // the strongbox pays by how hard the ship was to get into, and how big she is
    this.pay = Math.round((55 + hard * 30) * PAY_K[this.size]);
    this.clockMax = this.clock = clamp(CLOCK.base[this.size] - spec.bounty * CLOCK.perBounty - hard * CLOCK.perHard, CLOCK.min[this.size], CLOCK.base[this.size]);
    for (let i = 0; i < n; i++) {
      const h: Hero = {
        id: i, x: d.breach.x + 0.6, z: d.breach.z + (i - (n - 1) / 2) * 1.1, vx: 0, vz: 0, face: 0, aim: 0, hp: HERO.hp, inv: 0,
        dashT: 0, dashAge: 0, dashQ: 0, dashCd: 0, dashX: 1, dashZ: 0, perfected: false, fireCd: 0, shells: HERO.shells, shellT: 0, firing: false, sinceShot: 9,
        mark: -1, down: false, out: false, bleed: HERO.bleed, stun: 0, hook: null, work: null, carry: false, jam: 0, dryT: 0, bumped: false,
        room: d.roomAt(d.breach.x, d.breach.z), kills: 0, takedowns: 0, perfects: 0, hits: 0, tins: 0, stride: 0,
        arm: null, ammo: 0, draw: 0, swapCd: 0,
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
      plateMax: def.plate * k, open: 0, state: 'idle', t: 0, dur: 1, cd: 0.5 + this.r() * 0.8, cd2: 0, aware: false, asleep: false, runner: false,
      sus: 0, seenX: x, seenZ: z, target: 0, room: this.deck.roomAt(x, z), strafe: this.r() < 0.5 ? -1 : 1, shots: 0, sinceHit: 9, lastHero: -1, flash: 0,
      dead: false, deathT: 0, fallA: 0, takenDown: false, spaced: false, alarmAt: -1, home: { x, z }, stride: 0,
      wall: kind === 'warden' ? 8 * k : 0, wallMax: kind === 'warden' ? 8 * k : 0, wallT: 0, links: [], tx: x, tz: z, prey: null,
      bowled: [], tank: 0, under: false,
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

  /** Still in it: not down, not thrown out. */
  get standing() {
    return this.heroes.filter((h) => !h.down && !h.out);
  }

  /** Who has the core in their arms (or null). */
  get carrier(): Hero | null {
    return this.heart && this.heart.carrier >= 0 ? this.heroes[this.heart.carrier] ?? null : null;
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
      this.updateArms();
      return;
    }
    this.clocks();
    this.hazT += DT;
    this.hazTick = this.hazT >= TICK;
    if (this.hazTick) this.hazT -= TICK;
    this.heroes.forEach((h, i) => this.updateHero(h, intents[i] ?? NO_INTENT, aims[i] ?? null));
    // the paths the crew walks, a hero's every quarter second (in turns)
    this.heroes.forEach((h, i) => {
      this.fieldT[i] -= DT;
      if (this.fieldT[i] <= 0 && !h.down && !h.out) {
        d.field(h.x, h.z, this.fields[i], 80);
        this.fieldT[i] = 0.25 + i * 0.05;
      }
    });
    for (const f of this.foes) this.updateFoe(f);
    this.separate();
    this.updateTurrets();
    this.updateGates();
    this.updateVent();
    this.moveRounds();
    this.updateSpores();
    this.updateFires();
    this.updateSteam();
    this.updateSeals();
    this.updateTins();
    this.updateArms();
    this.updateCanisters();
    if (this.heart && this.heart.carrier >= 0) {
      const c = this.heroes[this.heart.carrier];
      this.heart.x = c.x;
      this.heart.z = c.z;
    }
    for (const l of this.lances) l.t += DT;
    this.lances = this.lances.filter((l) => l.t < 0.5);
    this.doors();
    this.endings();
  }

  private clocks() {
    if (this.kelters) {
      const k = this.kelters;
      k.t += DT;
      // first a party of them, one after another; then more, every so often, up to a crowd aboard
      const n = this.heroes.length;
      if (k.t >= k.next) {
        const aboard = this.foes.filter((f) => f.kind === 'kelter' && !f.dead).length;
        const count = (k.wave === 0 ? 3 : 2) + (n - 1);
        if (k.wave === 0 || aboard < 6 + (n - 1) * 2) {
          for (let i = 0; i < count; i++) {
            const a = this.r() * Math.PI * 2;
            const f = this.spawn('kelter', k.x + Math.cos(a) * 0.6, k.z + Math.sin(a) * 0.6, 1 + this.spec.hard * 0.15 + (n - 1) * 0.15);
            f.aware = true;
            f.state = 'alert';
            f.t = 0.5 + i * 0.35;
            f.face = a;
            f.target = (this.carrier ?? this.nearestHero(f.x, f.z))?.id ?? 0;
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
    const alive = this.standing;
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
    for (const f of this.foes) if (!f.dead && !f.aware && f.state !== 'caged' && f.kind !== 'skulk') this.notice(f, 0.6);
  }

  private endings() {
    if (this.state !== 'play') return;
    const up = this.standing;
    if (!up.length) {
      this.fail(this.kelters ? 'caught' : 'downed');
      return;
    }
    // everyone still standing at the lock, working the hatch together
    const lock = this.deck.rooms.find((q) => q.kind === 'lock')!;
    // (only once someone's been out of it: you came for something)
    if (up.some((h) => !this.inLock(h.x, h.z))) this.ventured = true;
    void lock;
    if (this.ventured && up.every((h) => this.inLock(h.x, h.z))) {
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

  inLock(x: number, z: number) {
    const lock = this.deck.rooms.find((q) => q.kind === 'lock')!;
    return x > lock.x0 && x < lock.x1 + 1 && z > lock.z0 && z < lock.z1 + 1;
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
    if (h.out) return;
    h.inv = Math.max(0, h.inv - DT);
    h.fireCd -= DT;
    h.dashCd -= DT;
    h.dryT -= DT;
    h.sinceShot += DT;
    h.stun = Math.max(0, h.stun - DT);
    h.jam = Math.max(0, h.jam - DT);
    if (h.down) {
      h.vx *= 0.85;
      h.vz *= 0.85;
      this.moveBody(h, h.vx * DT, h.vz * DT, HERO.r);
      // a partner standing over you hauls you up
      let hauled = false;
      for (const o of this.heroes) {
        if (o === h || o.down || o.out || o.firing || Math.hypot(o.x - h.x, o.z - h.z) > 1.5) continue;
        hauled = true;
        if (!o.work || o.work.kind !== 'revive' || o.work.id !== h.id) o.work = { kind: 'revive', id: h.id, t: 0 };
        o.work.t += DT / WORK.revive;
        this.events.push({ type: 'work', hero: o.id, kind: 'revive', t: o.work.t });
        if (o.work.t >= 1) {
          o.work = null;
          h.down = false;
          h.hp = 2;
          h.inv = 1.5;
          h.bleed = HERO.bleed;
          this.events.push({ type: 'revive', hero: h.id });
        }
      }
      // nobody comes: the crew throw you out the lock, back to your ship
      if (!hauled && this.standing.length) {
        h.bleed -= DT;
        if (h.bleed <= 0) {
          h.out = true;
          h.x = -40;
          h.z = -40;
          this.events.push({ type: 'thrownOut', hero: h.id });
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
    if (it.dash) h.dashQ = 0.25;
    h.dashQ = Math.max(0, h.dashQ - DT);
    if (control && h.dashQ > 0 && h.dashCd <= 0 && h.dashT <= 0) {
      h.dashQ = 0;
      const dl = Math.hypot(mx, mz);
      h.dashX = dl > 0.2 ? mx / dl : Math.cos(h.face);
      h.dashZ = dl > 0.2 ? mz / dl : Math.sin(h.face);
      h.dashT = HERO.dashT;
      h.dashAge = 0;
      h.perfected = false;
      h.bumped = false;
      if (h.work?.kind !== 'leave') h.work = null;
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
    const pace = h.carry ? HERO.carry : 1;
    if (h.dashT > 0) {
      h.dashT -= DT;
      h.dashAge += DT;
      h.vx = h.dashX * HERO.dashSpeed * (h.carry ? 0.8 : 1);
      h.vz = h.dashZ * HERO.dashSpeed * (h.carry ? 0.8 : 1);
      if (h.dashT <= 0) {
        h.dashCd = HERO.dashCd;
        h.vx *= 0.35;
        h.vz *= 0.35;
      }
      this.slideInto(h);
    } else {
      const slow = (h.hook ? 0.35 : 1) * (it.fire && !h.carry ? 0.82 : 1) * (control ? 1 : 0) * pace;
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
    // in spores the pistol clogs
    if (this.clouds.some((c) => c.ours === undefined && Math.hypot(c.x - h.x, c.z - h.z) < c.r)) {
      if (h.jam <= 0) this.events.push({ type: 'jam', hero: h.id });
      h.jam = 0.35;
    }
    // aiming: the stick if there is one (with a little help), else the pistol finds a mark near where you face
    const moving = Math.hypot(h.vx, h.vz) > 0.8 && h.dashT <= 0;
    const moveA = Math.atan2(mz, mx);
    let want = Math.hypot(mx, mz) > 0.2 ? moveA : h.face;
    if (padAim && Math.hypot(padAim.x, padAim.z) > 0.3) want = Math.atan2(padAim.z, padAim.x);
    // (a sporecaster doesn't clog)
    const armed = !h.carry && (h.jam <= 0 || h.arm === 'spore');
    const mark = armed || !h.carry ? this.findMark(h, want, padAim ? 0.45 : 1.1) : null;
    h.mark = mark && armed ? mark.id : -1;
    h.firing = control && it.fire && h.dashT <= 0 && armed;
    if (control && it.fire && h.dashT <= 0 && !h.carry && h.jam > 0 && h.dryT <= 0) {
      h.dryT = 0.32;
      this.events.push({ type: 'dry', hero: h.id });
    }
    if (mark && (h.firing || padAim)) h.aim = Math.atan2(mark.z - h.z, mark.x - h.x);
    else h.aim = want;
    if (h.firing || (padAim && Math.hypot(padAim.x, padAim.z) > 0.3) || h.sinceShot < 0.35) h.face = turn(h.face, h.aim, 30 * DT);
    else if (moving) h.face = turn(h.face, moveA, 16 * DT);
    else if (h.dashT > 0) h.face = Math.atan2(h.dashZ, h.dashX);
    // what you picked up, or the pistol
    if (!h.firing) h.draw = 0;
    if (h.firing && h.arm) this.armFire(h);
    else if (h.firing && h.fireCd <= 0) {
      h.fireCd = 1 / HERO.rate;
      h.sinceShot = 0;
      const a = h.aim + (this.r() - 0.5) * 0.07;
      const mx2 = h.x + Math.cos(h.aim) * 0.6;
      const mz2 = h.z + Math.sin(h.aim) * 0.6;
      this.fire('hero', 'rivet', h.id, mx2, mz2, a, HERO.rivetSpeed, 0.12, 1, 0.5, 1.6, 0.55);
      this.events.push({ type: 'shot', hero: h.id, x: mx2, z: mz2, a });
      this.noise(h.x, h.z, 8);
    }
    // the breacher (or, with the core in your arms, setting it down)
    if (control && it.heavy && h.dashT <= 0) {
      if (h.carry) this.dropHeart(h);
      else if (h.shells > 0) {
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
    h.swapCd -= DT;
    this.pickups(h, control && it.special);
  }

  /** Fires what's in your hand; throws it away when it's empty. */
  private armFire(h: Hero) {
    const kind = h.arm!;
    if (h.fireCd > 0) return;
    if (kind === 'lance') {
      if (h.draw === 0) this.events.push({ type: 'armDraw', hero: h.id });
      h.draw += DT;
      if (h.draw < LANCE_DRAW) return;
      h.draw = 0;
    }
    h.fireCd = 1 / ARMS[kind].rate;
    h.sinceShot = 0;
    const a0 = h.aim;
    const ca = Math.cos(a0);
    const sa = Math.sin(a0);
    const mx = h.x + ca * 0.7;
    const mz = h.z + sa * 0.7;
    if (kind === 'nailer') {
      this.fire('hero', 'nail', h.id, mx, mz, a0 + (this.r() - 0.5) * 0.3, 38 + this.r() * 6, 0.1, 0.8, 0.4, 1.2, 0.42);
      this.noise(h.x, h.z, 7);
    } else if (kind === 'scatter') {
      for (let i = 0; i < 9; i++) {
        const a = a0 + ((i / 8) * 2 - 1) * 0.42 + (this.r() - 0.5) * 0.1;
        this.fire('hero', 'pellet', h.id, mx, mz, a, 26 + this.r() * 8, 0.16, 1.4, 1.6, 4.5, 0.24 + this.r() * 0.04);
      }
      h.vx -= ca * 8;
      h.vz -= sa * 8;
      this.noise(h.x, h.z, 12);
    } else if (kind === 'lance') {
      // through everyone on the line, to the bulkhead
      const len = this.lanceLength(mx, mz, a0);
      for (const f of this.foes) {
        if (f.dead || f.state === 'caged' || f.under) continue;
        const px = f.x - mx;
        const pz = f.z - mz;
        const t = px * ca + pz * sa;
        if (t < -0.3 || t > len || Math.abs(-px * sa + pz * ca) > f.r + 0.35) continue;
        if (f.kind === 'warden') f.wall = 0;
        this.hitFoe(f, 7, 99, a0, 8, h.id, true);
      }
      for (const c of this.canisters) {
        if (c.gone || c.fuse >= 0) continue;
        const px = c.prop.x - mx;
        const pz = c.prop.z - mz;
        const t = px * ca + pz * sa;
        if (t > 0 && t < len && Math.abs(-px * sa + pz * ca) < 0.6) {
          c.fuse = 0.3;
          this.events.push({ type: 'fuse', i: this.canisters.indexOf(c) });
        }
      }
      this.lances.push({ x: mx, z: mz, a: a0, len, t: 0, hero: true });
      this.noise(h.x, h.z, 10);
    } else if (kind === 'stamp') {
      this.fire('hero', 'stamp', h.id, mx, mz, a0, 24, 0.26, 3.5, 4, 8, 1.1).bounce = 2;
      this.noise(h.x, h.z, 8);
    } else if (kind === 'spore') {
      // where you're aiming: the mark, or a way ahead
      const mark = this.foes.find((f) => f.id === h.mark);
      let tx = mark ? mark.x : h.x + ca * 7;
      let tz = mark ? mark.z : h.z + sa * 7;
      const l = Math.hypot(tx - h.x, tz - h.z);
      if (l > 10) {
        tx = h.x + ((tx - h.x) / l) * 10;
        tz = h.z + ((tz - h.z) / l) * 10;
      }
      if (this.deck.blocked(Math.floor(tx), Math.floor(tz))) {
        tx = mx;
        tz = mz;
      }
      this.sacs.push({ x0: h.x, z0: h.z, x1: tx, z1: tz, t: 0, dur: 0.45 + Math.min(10, l) * 0.03, ours: h.id });
    } else {
      this.fire('hero', 'harpoon', h.id, mx, mz, a0, 34, 0.2, 0.5, 0.5, 0, 0.42);
    }
    this.events.push({ type: 'armShot', hero: h.id, kind, x: mx, z: mz, a: a0 });
    h.ammo--;
    if (h.ammo <= 0) {
      this.events.push({ type: 'toss', hero: h.id, kind, x: h.x, z: h.z, a: a0 + Math.PI * 0.7 });
      h.arm = null;
      h.draw = 0;
    }
  }

  /** An arm onto the deck, tossed a little. `ammo` -1: full. */
  private dropArm(kind: ArmKind, x: number, z: number, ammo = -1, toss = 3) {
    const a = this.r() * Math.PI * 2;
    const arm: FloorArm = { id: this.nextId++, kind, x, z, vx: Math.cos(a) * toss, vz: Math.sin(a) * toss, ammo: ammo < 0 ? ARMS[kind].ammo : ammo, t: 0 };
    this.arms.push(arm);
    this.events.push({ type: 'armDrop', id: arm.id, kind, x, z });
    return arm;
  }

  private updateArms() {
    for (const a of this.arms) {
      a.t += DT;
      a.vx *= Math.exp(-5 * DT);
      a.vz *= Math.exp(-5 * DT);
      this.moveBody(a, a.vx * DT, a.vz * DT, 0.25);
    }
  }

  /** The foe the pistol would go for: in sight, near the way you face, nearest first. */
  private findMark(h: Hero, want: number, cone: number): Foe | null {
    let best: Foe | null = null;
    let score = Infinity;
    for (const f of this.foes) {
      if (f.dead || f.state === 'caged') continue;
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
      if (f.dead || f.state === 'caged' || f.under) continue;
      const dist = Math.hypot(f.x - h.x, f.z - h.z);
      if (dist > f.r + HERO.r + 0.25) continue;
      // a warden's wall stops a slide from in front
      const walled = f.kind === 'warden' && f.wall > 0 && f.open <= 0 && Math.abs(angleDiff(Math.atan2(h.z - f.z, h.x - f.x), f.face)) < 1.05;
      if (!walled && (f.open > 0 || (!f.aware && f.kind !== 'skulk') || f.state === 'stun')) {
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
      if (walled) this.events.push({ type: 'wallHit', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r });
      else this.hitFoe(f, 0.5, 1.2, a, f.kind === 'bruiser' || f.kind === 'warden' || f.kind === 'nurse' ? 2 : 7, h.id, true, false);
      h.dashT = 0;
      h.dashCd = HERO.dashCd;
      h.vx = -Math.cos(a) * (walled ? 7 : 3);
      h.vz = -Math.sin(a) * (walled ? 7 : 3);
      return;
    }
  }

  /** Working something open: a crate, the strongbox, the core, the core where it lies; standing at it and not shooting. */
  private work(h: Hero) {
    const near = (x: number, z: number, reach: number) => Math.hypot(x - h.x, z - h.z) < reach;
    let target: { kind: keyof typeof WORK; id: number; c: { t: number } } | null = null;
    this.crates.forEach((c, i) => {
      if (!c.open && near(c.prop.x, c.prop.z, 1.6)) target = { kind: 'crate', id: i, c };
    });
    if (this.strongbox && !this.strongbox.open && near(this.strongbox.prop.x, this.strongbox.prop.z, 1.5)) target = { kind: 'strongbox', id: 0, c: this.strongbox };
    if (this.core && !this.core.open && near(this.core.prop.x, this.core.prop.z, 1.9)) target = { kind: 'core', id: 0, c: this.core };
    if (this.heart && this.heart.carrier < 0 && !h.carry && near(this.heart.x, this.heart.z, 1.3)) target = { kind: 'heart', id: 0, c: this.heartWork };
    const t = target as { kind: keyof typeof WORK; id: number; c: { t: number } } | null;
    if (!t || h.firing || h.dashT > 0 || h.stun > 0) {
      if (h.work && h.work.kind !== 'leave' && h.work.kind !== 'revive') h.work = null;
      return;
    }
    if (!h.work || h.work.kind !== t.kind || h.work.id !== t.id) h.work = { kind: t.kind, id: t.id, t: t.c.t };
    t.c.t = Math.min(1, t.c.t + DT / WORK[t.kind]);
    h.work.t = t.c.t;
    this.events.push({ type: 'work', hero: h.id, kind: t.kind, t: t.c.t });
    if (t.c.t < 1) return;
    h.work = null;
    if (t.kind === 'heart') {
      this.heartWork.t = 0;
      this.takeHeart(h);
      return;
    }
    const c = t.c as Crate;
    c.open = true;
    const p = c.prop;
    if (t.kind === 'crate') this.events.push({ type: 'crate', i: t.id, x: p.x, z: p.z });
    else if (t.kind === 'strongbox') {
      this.events.push({ type: 'strongbox', x: p.x, z: p.z, pay: this.pay });
      this.noise(p.x, p.z, 10);
      const pool = FAMILY_ARMS[this.family];
      if (this.r() < 0.6) this.dropArm(pool[Math.floor(this.r() * pool.length)], h.x + (p.x - h.x) * 0.5, h.z + (p.z - h.z) * 0.5);
    } else {
      // the core out of its cradle, into your arms: the ship locks itself down
      this.lockdown = true;
      this.events.push({ type: 'core', x: p.x, z: p.z });
      if (!this.kelters) this.clock = Math.max(6, this.clock - CLOCK.lockdown);
      this.heart = { x: h.x, z: h.z, carrier: -1 };
      this.takeHeart(h);
      this.alarmAll();
      this.turrets.forEach((tu, i) => {
        tu.state = 'rise';
        tu.t = 0.4 + i * 0.5;
      });
    }
  }
  private heartWork = { t: 0 };

  private takeHeart(h: Hero) {
    if (!this.heart) return;
    this.heart.carrier = h.id;
    h.carry = true;
    h.work = null;
    this.events.push({ type: 'carry', hero: h.id });
    // everyone aboard wants it back
    for (const f of this.foes) if (!f.dead && f.kind !== 'skulk') f.target = h.id;
  }

  private dropHeart(h: Hero) {
    if (!this.heart || this.heart.carrier !== h.id) return;
    h.carry = false;
    this.heart.carrier = -1;
    this.heart.x = h.x;
    this.heart.z = h.z;
    this.heartWork.t = 0;
    this.events.push({ type: 'drop', hero: h.id, x: h.x, z: h.z });
  }

  private pickups(h: Hero, swap: boolean) {
    // an arm underfoot: yours if your hands are empty; with one in them, swap on the button
    if (!h.carry && !h.down && h.swapCd <= 0) {
      const a = this.arms.find((x) => x.t > 0.45 && Math.hypot(x.x - h.x, x.z - h.z) < 0.95);
      if (a && (!h.arm || swap)) {
        if (h.arm) this.dropArm(h.arm, h.x, h.z, h.ammo, 2);
        h.arm = a.kind;
        h.ammo = a.ammo;
        h.draw = 0;
        h.fireCd = 0.12;
        h.swapCd = 0.3;
        this.arms = this.arms.filter((x) => x !== a);
        this.events.push({ type: 'arm', hero: h.id, kind: a.kind });
      }
    }
    for (const m of this.medkits) {
      if (m.used || h.hp >= HERO.hp || Math.hypot(m.prop.x - h.x, m.prop.z - h.z) > 1.3) continue;
      m.used = true;
      const n = Math.min(2, HERO.hp - h.hp);
      h.hp += n;
      this.events.push({ type: 'heal', hero: h.id, n });
    }
  }

  hurtHero(h: Hero, dmg: number, fx: number, fz: number, force = false) {
    if (h.down || h.out || this.state !== 'play') return false;
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
      this.dropHeart(h);
      h.down = true;
      h.bleed = HERO.bleed;
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
      if (h.down || h.out) continue;
      const dd = Math.hypot(h.x - x, h.z - z);
      if (dd < bd) {
        bd = dd;
        best = h;
      }
    }
    return best;
  }

  private notice(f: Foe, delay = 0.35) {
    if (f.dead || f.aware || f.state === 'caged' || f.kind === 'skulk') return;
    f.aware = true;
    f.asleep = false;
    f.sus = 1;
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
      if (f.dead || f.aware || f.state === 'caged' || f.kind === 'skulk') continue;
      const dd = Math.hypot(f.x - x, f.z - z);
      const asleep = f.asleep ? 0.45 : 1;
      if (dd < radius * asleep && (f.room === room || dd < radius * 0.55 * asleep || this.deck.clear(x, z, f.x, f.z))) this.notice(f, 0.45 + this.r() * 0.3);
    }
  }

  /** How far a crewman sees (by torchlight, on a dark ship, not so far). */
  sight(f: Foe) {
    return FOES[f.kind].sight * (this.condition === 'dark' ? 0.6 : 1);
  }

  private sees(f: Foe, h: Hero) {
    if (h.down || h.out) return false;
    const dx = h.x - f.x;
    const dz = h.z - f.z;
    const dd = Math.hypot(dx, dz);
    if (dd > this.sight(f)) return false;
    if (f.asleep) return dd < 1.6;
    // close enough to feel you behind; otherwise a cone
    if (dd > 2.2 && Math.abs(angleDiff(Math.atan2(dz, dx), f.face)) > SIGHT_CONE) return false;
    return this.deck.clear(f.x, f.z, h.x, h.z);
  }

  /**
   * Not yet aware: what it glimpses of you builds, quicker the nearer you are (and at once in
   * arm's reach); out of sight it fades. Halfway there it turns to look.
   */
  private watch(f: Foe) {
    let seen: Hero | null = null;
    let near = Infinity;
    for (const x of this.heroes) {
      if (!this.sees(f, x)) continue;
      const dd = Math.hypot(x.x - f.x, x.z - f.z);
      if (dd < near) {
        near = dd;
        seen = x;
      }
    }
    if (seen) {
      const k = near / this.sight(f);
      const rate = f.asleep ? 2.5 : near < 2.2 ? 4.5 : 0.75 / (0.35 + k * 0.95);
      const was = f.sus;
      f.sus += rate * DT * (seen.carry ? 1.6 : 1);
      f.seenX = seen.x;
      f.seenZ = seen.z;
      if (was < 0.3 && f.sus >= 0.3) this.events.push({ type: 'suspect', id: f.id });
      if (f.sus >= 1) {
        this.notice(f, 0.3);
        f.target = seen.id;
        return true;
      }
    } else f.sus = Math.max(0, f.sus - DT * 0.3);
    // at its post: now and then it turns to look at something else; something glimpsed, it looks there
    if (!f.asleep && f.sus > 0.3) f.face = turn(f.face, Math.atan2(f.seenZ - f.z, f.seenX - f.x), 3 * DT);
    else if (f.state === 'idle' && this.r() < DT * 0.25) f.face += (this.r() - 0.5) * 2.2;
    this.walk(f, 0, 0, 0);
    return false;
  }

  private updateFoe(f: Foe) {
    if (f.dead) {
      f.deathT += DT;
      // the body slides to a stop, bowling over whoever it meets on the way
      const sp = Math.hypot(f.kx, f.kz);
      if (sp > 5 && !f.spaced) {
        for (const g of this.foes) {
          if (g === f || g.dead || g.state === 'caged' || g.under || f.bowled.includes(g.id)) continue;
          if (Math.hypot(g.x - f.x, g.z - f.z) > g.r + f.r) continue;
          f.bowled.push(g.id);
          const a = Math.atan2(f.kz, f.kx);
          this.hitFoe(g, 1.5 + sp * 0.12, 2, a, sp * 0.6, f.lastHero, true, false);
          if (!g.dead && FOES[g.kind].role !== 'heavy') {
            g.open = Math.max(g.open, 0.9);
            if (g.state !== 'stagger') this.enter(g, 'stagger', 0.9);
          }
          this.events.push({ type: 'bowl', id: g.id, x: g.x, z: g.z, a });
          f.kx *= 0.55;
          f.kz *= 0.55;
        }
      }
      f.kx *= 0.9;
      f.kz *= 0.9;
      this.moveBody(f, f.kx * DT, f.kz * DT, f.r * 0.6);
      return;
    }
    if (f.state === 'caged') return;
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
        if (f.state === 'stagger' || f.state === 'stun' || f.state === 'listen') {
          f.state = 'recover';
          f.t = 0.3;
        }
      }
    } else if (f.plate < f.plateMax && f.sinceHit > 2.5) f.plate = Math.min(f.plateMax, f.plate + f.plateMax * 0.35 * DT);
    // a warden's wall comes back up a while after it broke
    if (f.kind === 'warden' && f.wall <= 0 && f.open <= 0) {
      f.wallT -= DT;
      if (f.wallT <= 0) {
        f.wall = f.wallMax;
        this.events.push({ type: 'wallUp', id: f.id });
      }
    }
    f.kx *= Math.exp(-8 * DT);
    f.kz *= Math.exp(-8 * DT);
    f.room = this.deck.roomAt(f.x, f.z) >= 0 ? this.deck.roomAt(f.x, f.z) : f.room;
    if (f.kind === 'skulk') {
      this.beast(f);
      return;
    }
    // who it's after: the core first, else the one it was after, else the nearest standing hero
    const carrier = this.carrier;
    const h = (carrier && f.aware ? carrier : null) ?? this.heroes.find((x) => x.id === f.target && !x.down && !x.out) ?? this.nearestHero(f.x, f.z);
    if (h) f.target = h.id;
    if (!f.aware) {
      if (!this.watch(f)) return;
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
    if (f.kind === 'nurse') this.mend(f);
    switch (f.state) {
      case 'alert':
        f.face = turn(f.face, toward, 10 * DT);
        this.walk(f, 0, 0, 0);
        if (f.t <= 0) f.state = f.alarmAt >= 0 ? 'alarm' : def.role === 'melee' || def.role === 'heavy' ? 'chase' : 'move';
        return;
      case 'stagger':
      case 'stun':
        this.walk(f, 0, 0, 0);
        return;
      case 'listen':
        // something far off, to the north: it stops dead and turns its face to it
        this.walk(f, 0, 0, 0);
        f.face = turn(f.face, -Math.PI / 2, 4 * DT);
        if (f.t <= 0) {
          f.state = 'recover';
          f.t = 0.2;
        }
        return;
      case 'recover':
        this.walk(f, 0, 0, 0);
        f.face = turn(f.face, toward, 3 * DT);
        if (f.t <= 0) f.state = def.role === 'melee' || def.role === 'heavy' ? 'chase' : 'move';
        return;
      default:
        break;
    }
    switch (f.kind) {
      case 'deckhand':
      case 'clerk':
        return this.deckhand(f, h, dist, toward, los, def.speed);
      case 'thrall':
        return this.thrall(f, h, dist, toward, los, def.speed);
      case 'gunner':
        return this.gunner(f, h, dist, toward, los, def.speed, false);
      case 'kelter':
        return this.gunner(f, h, dist, toward, los, def.speed, true);
      case 'auditor':
        return this.auditor(f, h, dist, toward, los, def.speed);
      case 'puffer':
        return this.puffer(f, h, dist, toward, los, def.speed);
      case 'bruiser':
        return this.bruiser(f, h, dist, toward, los, def.speed);
      case 'warden':
        return this.warden(f, h, dist, toward, los, def.speed);
      case 'nurse':
        return this.nurse(f, h, dist, toward, los, def.speed);
      case 'torcher':
        return this.torcher(f, h, dist, toward, los, def.speed);
      case 'notary':
        return this.notary(f, h, dist, toward, los, def.speed);
      case 'rooter':
        return this.rooter(f, h, dist, toward, los, def.speed);
    }
  }

  /** Puts a foe into a timed state. */
  private enter(f: Foe, state: FoeState, t: number) {
    f.state = state;
    f.t = t;
    f.dur = t;
  }

  /** A lattice crewman, about to strike, now and then stops to listen instead: wide open while it does. */
  private listens(f: Foe) {
    if (FOES[f.kind].family !== 'lattice' || this.r() >= this.listenP) return false;
    this.enter(f, 'listen', 1.5);
    f.open = 1.5;
    this.events.push({ type: 'listen', id: f.id });
    return true;
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
    const heavy = FOES[f.kind].role === 'heavy';
    if (moved > 0.03 && Math.floor(f.stride / 1.5) !== Math.floor((f.stride - moved) / 1.5)) this.events.push({ type: 'step', x: f.x, z: f.z, hero: false, heavy });
    return moved;
  }

  /** Which way to go to get at a hero: straight there if it can see them, else down the path. */
  private way(f: Foe, h: Hero, los: boolean): { x: number; z: number } {
    if (los) return { x: h.x - f.x, z: h.z - f.z };
    const step = this.deck.downhill(this.fields[h.id], f.x, f.z);
    return step ?? { x: 0, z: 0 };
  }

  /** A runner on its way to an alarm panel, or pulling it. True while that's what it's doing. */
  private runAlarm(f: Foe, speed: number) {
    if (f.state === 'alarm') {
      const a = this.alarms[f.alarmAt];
      if (!a || a.used || a.broken || this.alarmed || this.kelters) {
        f.alarmAt = -1;
        f.state = 'chase';
        return false;
      }
      let field = this.alarmFields.get(f.alarmAt);
      if (!field) {
        field = new Int16Array(this.deck.w * this.deck.h);
        this.deck.field(a.prop.x, a.prop.z, field, 200);
        this.alarmFields.set(f.alarmAt, field);
      }
      const ad = Math.hypot(a.prop.x - f.x, a.prop.z - f.z);
      if (ad < 1.1) {
        this.enter(f, 'pull', 1.6);
        return true;
      }
      const s = ad < 3 && this.deck.clear(f.x, f.z, a.prop.x, a.prop.z) ? { x: a.prop.x - f.x, z: a.prop.z - f.z } : this.deck.downhill(field, f.x, f.z) ?? { x: 0, z: 0 };
      this.walk(f, s.x, s.z, speed * 1.15);
      return true;
    }
    if (f.state === 'pull') {
      const a = this.alarms[f.alarmAt];
      this.walk(f, 0, 0, 0, false);
      if (!a || a.broken || this.alarmed || this.kelters) {
        f.state = 'chase';
        if (a) a.pull = 0;
        return true;
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
      return true;
    }
    return false;
  }

  /**
   * Hands who close in and swing: a deckhand's wrench after a wind-up (scrap: it flares, then
   * commits); a clerk's baton of light, its arc drawn on the deck the whole time it winds up.
   */
  private deckhand(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (this.runAlarm(f, speed)) return;
    const lattice = f.kind === 'clerk';
    switch (f.state) {
      case 'windup':
        this.walk(f, 0, 0, 0, false);
        // tracks you for most of it, then commits
        if (f.t > (lattice ? 0.3 : 0.18)) f.face = turn(f.face, toward, (lattice ? 5 : 7) * DT);
        if (f.t <= 0) {
          this.enter(f, 'swing', 0.16);
          this.events.push({ type: 'swing', id: f.id });
          f.vx = Math.cos(f.face) * 7;
          f.vz = Math.sin(f.face) * 7;
          const reach = lattice ? 2.2 : 1.95;
          for (const x of this.heroes) {
            const dd = Math.hypot(x.x - f.x, x.z - f.z);
            if (dd < reach && Math.abs(angleDiff(Math.atan2(x.z - f.z, x.x - f.x), f.face)) < 1.1) this.hurtHero(x, 1, f.x, f.z);
          }
        }
        return;
      case 'swing':
        this.walk(f, Math.cos(f.face), Math.sin(f.face), 2, false);
        if (f.t <= 0) this.enter(f, 'recover', lattice ? 0.8 : 0.65);
        return;
      default: {
        // chase
        f.state = 'chase';
        if (dist < (lattice ? 1.85 : 1.55) && los && f.cd <= 0) {
          if (this.listens(f)) return;
          this.enter(f, 'windup', lattice ? 0.62 : 0.5);
          f.cd = 1.0;
          this.events.push({ type: 'windup', id: f.id });
          return;
        }
        const w = this.way(f, h, los);
        this.walk(f, w.x, w.z, dist < 1.3 ? 0 : speed);
      }
    }
  }

  /** A thrall: shambles in, swells, then lunges with its teeth; it bursts into spores when it dies. */
  private thrall(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (this.runAlarm(f, speed)) return;
    switch (f.state) {
      case 'swell':
        this.walk(f, 0, 0, 0, false);
        if (f.t > 0.2) f.face = turn(f.face, toward, 5 * DT);
        if (f.t <= 0) {
          this.enter(f, 'lunge', 0.22);
          f.shots = 0;
          this.events.push({ type: 'swing', id: f.id });
        }
        return;
      case 'lunge': {
        f.vx = Math.cos(f.face) * 10;
        f.vz = Math.sin(f.face) * 10;
        this.moveBody(f, f.vx * DT, f.vz * DT, f.r);
        if (!f.shots) {
          for (const x of this.heroes) {
            if (x.down || x.out || Math.hypot(x.x - f.x, x.z - f.z) > f.r + HERO.r + 0.25) continue;
            if (this.hurtHero(x, 1, f.x, f.z)) f.shots = 1;
          }
        }
        if (f.t <= 0) {
          f.vx *= 0.2;
          f.vz *= 0.2;
          this.enter(f, 'recover', 0.9);
        }
        return;
      }
      default: {
        f.state = 'chase';
        if (dist < 2.8 && los && f.cd <= 0) {
          this.enter(f, 'swell', 0.65);
          f.cd = 1.8;
          this.events.push({ type: 'swell', id: f.id });
          return;
        }
        const w = this.way(f, h, los);
        // a lurching walk: it surges and stalls
        const surge = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 2.6 + f.id));
        this.walk(f, w.x, w.z, dist < 1.2 ? 0 : speed * surge);
      }
    }
  }

  /** Keeps its distance, slipping sideways (a gunner, a kelter, an auditor, a puffer between shots). */
  private keepOff(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number, near: number, far: number) {
    if (!los || dist > far + 2) {
      const w = this.way(f, h, false);
      this.walk(f, w.x, w.z, speed);
      return;
    }
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
            this.enter(f, 'recover', 0.7);
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
          this.enter(f, 'recover', 0.75);
          f.cd = (kelter ? 1.3 : 1.6) + this.r() * 0.8;
        }
        return;
      case 'reel': {
        // holding the line while you come in
        this.walk(f, 0, 0, 0, false);
        f.face = turn(f.face, toward, 8 * DT);
        if (!h.hook || h.hook.by !== f.id) this.enter(f, 'recover', 0.5);
        return;
      }
      default: {
        f.state = 'move';
        if (los && dist < 14 && f.cd <= 0) {
          this.enter(f, 'aim', kelter ? 0.6 : 0.78);
          f.aimA = f.face;
          // a kelter fires its hook when nobody's on one, now and then
          f.shots = kelter && f.cd2 <= 0 && !this.heroes.some((x) => x.hook) && this.r() < 0.6 ? -1 : 0;
          this.events.push({ type: 'aim', id: f.id });
          return;
        }
        this.keepOff(f, h, dist, toward, los, speed, near, far);
      }
    }
  }

  /**
   * An auditor draws its lance out in light, a full second, tracking you for the first half;
   * then it's a beam, through cover (crates are no help), as far as the first bulkhead. Step off
   * the line, or slide through it as it goes. A long breath after while it recharges.
   */
  private auditor(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'aim') {
      this.walk(f, 0, 0, 0, false);
      if (f.t > 0.35) f.aimA = turn(f.aimA, toward, 3.2 * DT);
      f.face = f.aimA;
      if (f.t <= 0) {
        const len = this.lanceLength(f.x, f.z, f.aimA);
        const ca = Math.cos(f.aimA);
        const sa = Math.sin(f.aimA);
        for (const x of this.heroes) {
          if (x.down || x.out) continue;
          const px = x.x - f.x;
          const pz = x.z - f.z;
          const along = px * ca + pz * sa;
          const off = Math.abs(-px * sa + pz * ca);
          if (along > 0 && along < len && off < HERO.r + 0.32) this.hurtHero(x, 1, f.x, f.z);
        }
        this.lances.push({ x: f.x, z: f.z, a: f.aimA, len, t: 0 });
        this.events.push({ type: 'lance', id: f.id, x: f.x, z: f.z, a: f.aimA, len });
        this.enter(f, 'recover', 1.1);
        f.cd = 1.8 + this.r() * 0.8;
      }
      return;
    }
    f.state = 'move';
    if (los && dist < 16 && f.cd <= 0) {
      if (this.listens(f)) return;
      this.enter(f, 'aim', 1.0);
      f.aimA = f.face;
      this.events.push({ type: 'aim', id: f.id });
      return;
    }
    this.keepOff(f, h, dist, toward, los, speed, 6, 12);
  }

  /** A lance goes as far as the first bulkhead or shut door (not the cargo: it's through cover). */
  lanceLength(x: number, z: number, a: number) {
    const d = this.deck;
    let len = 0.5;
    while (len < 22) {
      const cx = Math.floor(x + Math.cos(a) * len);
      const cz = Math.floor(z + Math.sin(a) * len);
      const door = d.doorIn(cx, cz);
      if (d.cell(cx, cz) !== 2 || (door && door.open < 0.65)) break;
      len += 0.2;
    }
    return len;
  }

  /**
   * A puffer swells, then lobs a spore sac where you're going: a ring on the deck where it'll
   * land, growing as it falls. It bursts in a cloud that jams your pistol (the breacher still
   * works). Shot down, it bursts in a bigger one.
   */
  private puffer(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'swell') {
      this.walk(f, 0, 0, 0, false);
      f.face = turn(f.face, toward, 6 * DT);
      if (f.t <= 0) {
        let tx = h.x + h.vx * 0.45;
        let tz = h.z + h.vz * 0.45;
        const l = Math.hypot(tx - f.x, tz - f.z);
        if (l > 11) {
          tx = f.x + ((tx - f.x) / l) * 11;
          tz = f.z + ((tz - f.z) / l) * 11;
        }
        if (this.deck.blocked(Math.floor(tx), Math.floor(tz))) {
          tx = h.x;
          tz = h.z;
        }
        this.sacs.push({ x0: f.x, z0: f.z, x1: tx, z1: tz, t: 0, dur: 0.8 + Math.min(11, l) * 0.03 });
        this.events.push({ type: 'lob', id: f.id, x: tx, z: tz });
        this.enter(f, 'recover', 0.9);
        f.cd = 3.0 + this.r() * 1.0;
      }
      return;
    }
    f.state = 'move';
    if (los && dist < 12 && f.cd <= 0) {
      this.enter(f, 'swell', 0.7);
      this.events.push({ type: 'swell', id: f.id });
      return;
    }
    this.keepOff(f, h, dist, toward, los, speed, 5.5, 10);
  }

  /**
   * A torcher walks in and lights up: a pilot flame (the tell), then a cone of fire it hoses
   * round after you, slowly: get round the side of it. Its tank's on its back: shots in it hurt
   * more, and enough of them set it off, it and whoever's stood near (you too, if that's you).
   */
  private torcher(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'ignite') {
      this.walk(f, 0, 0, 0, false);
      f.face = turn(f.face, toward, 5 * DT);
      if (f.t <= 0) this.enter(f, 'spray', 2.0);
      return;
    }
    if (f.state === 'spray') {
      f.face = turn(f.face, toward, 1.3 * DT);
      this.walk(f, Math.cos(f.face), Math.sin(f.face), dist > 2 ? 0.9 : 0, false);
      if (Math.floor(f.t * 30) !== Math.floor((f.t + DT) * 30)) {
        const a = f.face + (this.r() - 0.5) * 0.5;
        this.fire('foe', 'flame', f.id, f.x + Math.cos(f.face) * 0.6, f.z + Math.sin(f.face) * 0.6, a, 8 + this.r() * 3, 0.32, 1, 0, 0, 0.36);
      }
      this.noise(f.x, f.z, 4);
      if (f.t <= 0) {
        this.enter(f, 'recover', 1.0);
        f.cd = 2.2 + this.r();
      }
      return;
    }
    f.state = 'chase';
    if (los && dist < 3.8 && f.cd <= 0) {
      this.enter(f, 'ignite', 0.6);
      this.events.push({ type: 'ignite', id: f.id });
      return;
    }
    const w = this.way(f, h, los);
    this.walk(f, w.x, w.z, dist < 2.5 ? 0 : speed);
  }

  /**
   * A notary keeps its distance and stamps the deck about you: three seals in a line across your
   * way, armed a beat later. Keep moving. Run at it and it backs off; put it down and its seals
   * come to nothing. They don't care whose feet are on them.
   */
  private notary(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'stamp') {
      this.walk(f, 0, 0, 0, false);
      f.face = turn(f.face, toward, 6 * DT);
      if (f.t <= 0) {
        const px = h.x + h.vx * 0.5;
        const pz = h.z + h.vz * 0.5;
        const sx = -Math.sin(toward);
        const sz = Math.cos(toward);
        for (const k of [-1, 0, 1]) {
          const x = px + sx * k * 1.9;
          const z = pz + sz * k * 1.9;
          if (this.deck.blocked(Math.floor(x), Math.floor(z))) continue;
          this.seals.push({ x, z, t: 0, dur: 1.05 + Math.abs(k) * 0.15, by: f.id });
        }
        this.events.push({ type: 'seal', id: f.id, x: px, z: pz });
        this.enter(f, 'recover', 0.8);
        f.cd = 3.0 + this.r() * 1.2;
      }
      return;
    }
    f.state = 'move';
    if (los && dist < 13 && f.cd <= 0) {
      this.enter(f, 'stamp', 0.7);
      this.events.push({ type: 'raise', id: f.id });
      return;
    }
    this.keepOff(f, h, dist, toward, los, speed, 6.5, 11);
  }

  /**
   * A rooter goes under the deck (a ripple you can follow, nothing you can hit), comes up under
   * you after a rumble (the cracks are the tell: off them), and is stuck a moment in the plating
   * it broke: wide open. Then it shambles a little, and goes under again.
   */
  private rooter(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'dig') {
      f.under = true;
      const w = this.way(f, h, los);
      this.walk(f, w.x, w.z, speed);
      if (dist < 1.4 || f.t <= 0) {
        f.tx = h.x + h.vx * 0.2;
        f.tz = h.z + h.vz * 0.2;
        if (this.deck.blocked(Math.floor(f.tx), Math.floor(f.tz))) {
          f.tx = h.x;
          f.tz = h.z;
        }
        this.enter(f, 'rumble', 0.7);
        this.events.push({ type: 'rumble', id: f.id, x: f.tx, z: f.tz });
      }
      return;
    }
    if (f.state === 'rumble') {
      const dx = f.tx - f.x;
      const dz = f.tz - f.z;
      const l = Math.hypot(dx, dz);
      this.walk(f, dx, dz, l > 0.1 ? Math.min(7, l / DT) : 0);
      if (f.t <= 0) {
        f.under = false;
        for (const x of this.heroes) if (Math.hypot(x.x - f.x, x.z - f.z) < 1.35) this.hurtHero(x, 2, f.x, f.z);
        for (const g of this.foes) {
          if (g === f || g.dead || g.state === 'caged' || g.under || Math.hypot(g.x - f.x, g.z - f.z) > 1.35 + g.r) continue;
          this.hitFoe(g, 3, 3, Math.atan2(g.z - f.z, g.x - f.x), 6, -1, true, false);
        }
        this.events.push({ type: 'erupt', id: f.id, x: f.x, z: f.z });
        this.noise(f.x, f.z, 8);
        this.enter(f, 'stagger', 1.5);
        f.open = 1.5;
        // (counting from now: stuck, then a while up top)
        f.cd = 3.4;
      }
      return;
    }
    f.under = false;
    f.state = 'chase';
    if (f.cd <= 0) {
      this.enter(f, 'dig', 4.5);
      f.under = true;
      this.events.push({ type: 'burrow', id: f.id, x: f.x, z: f.z });
      return;
    }
    const w = this.way(f, h, los);
    this.walk(f, w.x, w.z, 1.8);
  }

  private bruiser(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    switch (f.state) {
      case 'windup':
        this.walk(f, 0, 0, 0, false);
        if (f.t > 0.25) f.face = turn(f.face, toward, 2.2 * DT);
        if (f.t <= 0) this.enter(f, 'charge', 1.1);
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
          if (x.down || x.out || Math.hypot(x.x - f.x, x.z - f.z) > f.r + HERO.r + 0.2) continue;
          if (this.hurtHero(x, 2, f.x, f.z)) {
            x.vx += Math.cos(f.face) * 10;
            x.vz += Math.sin(f.face) * 10;
            x.stun = 0.35;
          }
        }
        // into a wall: stunned, wide open
        if (moved < want * DT * 0.4 && f.t < 1.0) {
          this.enter(f, 'stun', 2.4);
          f.open = 2.4;
          f.plate = 0;
          this.events.push({ type: 'slam', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r });
          return;
        }
        if (f.t <= 0) {
          this.enter(f, 'recover', 0.9);
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
          this.enter(f, 'recover', 0.8);
        }
        return;
      default: {
        f.state = 'chase';
        // turns slowly: get round behind it
        f.face = turn(f.face, toward, 1.9 * DT);
        const facing = Math.abs(angleDiff(toward, f.face)) < 0.35;
        if (los && dist > 2.6 && dist < 9 && f.cd <= 0 && facing) {
          this.enter(f, 'windup', 0.8);
          f.cd = 3.2;
          this.events.push({ type: 'charge', id: f.id });
          return;
        }
        if (dist < 1.9 && f.cd2 <= 0) {
          this.enter(f, 'swing', 0.45);
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

  /**
   * A warden walks behind a wall of light. Your rivets come back off it; a blast cracks it, and
   * cracked it leaves the warden open. Or get round: it turns slowly, and its back is bare. Close
   * up it draws the wall bright and shoves.
   */
  private warden(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'shove') {
      this.walk(f, 0, 0, 0, false);
      if (f.t > 0.3) f.face = turn(f.face, toward, 2 * DT);
      if (f.t <= 0) {
        for (const x of this.heroes) {
          const dd = Math.hypot(x.x - f.x, x.z - f.z);
          if (dd < 2.6 && Math.abs(angleDiff(Math.atan2(x.z - f.z, x.x - f.x), f.face)) < 1.1 && this.hurtHero(x, 1, f.x, f.z)) {
            x.vx += Math.cos(f.face) * 11;
            x.vz += Math.sin(f.face) * 11;
            x.stun = 0.25;
          }
        }
        this.events.push({ type: 'swing', id: f.id });
        this.enter(f, 'recover', 0.9);
        f.cd = 2.2;
      }
      return;
    }
    f.state = 'chase';
    f.face = turn(f.face, toward, 1.6 * DT);
    const facing = Math.abs(angleDiff(toward, f.face)) < 0.45;
    if (los && dist < 2.5 && facing && f.cd <= 0) {
      if (this.listens(f)) return;
      this.enter(f, 'shove', 0.65);
      this.events.push({ type: 'shove', id: f.id });
      return;
    }
    if (los) this.walk(f, Math.cos(f.face), Math.sin(f.face), dist < 1.8 ? 0 : speed, false);
    else {
      const w = this.way(f, h, los);
      this.walk(f, w.x, w.z, speed);
    }
  }

  /**
   * A nurse keeps behind its crew with lines into the hurt ones, mending them as you work; it's
   * the one to go for. Close up it swells and bursts out in a ring that throws you back.
   */
  private nurse(f: Foe, h: Hero, dist: number, toward: number, los: boolean, speed: number) {
    if (f.state === 'swell') {
      this.walk(f, 0, 0, 0, false);
      if (f.t <= 0) {
        for (const x of this.heroes) {
          const dd = Math.hypot(x.x - f.x, x.z - f.z);
          if (dd < 2.8 && this.hurtHero(x, 1, f.x, f.z)) {
            const a = Math.atan2(x.z - f.z, x.x - f.x);
            x.vx += Math.cos(a) * 9;
            x.vz += Math.sin(a) * 9;
          }
        }
        this.spores(f.x, f.z, 1.7, 2.5);
        this.enter(f, 'recover', 1.0);
        f.cd = 3;
      }
      return;
    }
    f.state = 'chase';
    if (dist < 2.6 && f.cd <= 0) {
      this.enter(f, 'swell', 0.85);
      this.events.push({ type: 'swell', id: f.id });
      return;
    }
    // behind the crew it's mending, away from you
    const crew = this.foes.filter((g) => !g.dead && g !== f && g.aware && FOES[g.kind].family === 'bloom' && Math.hypot(g.x - f.x, g.z - f.z) < 10);
    if (crew.length && los) {
      const cx = crew.reduce((a, g) => a + g.x, 0) / crew.length;
      const cz = crew.reduce((a, g) => a + g.z, 0) / crew.length;
      const tx = cx - Math.cos(toward) * 3 - f.x;
      const tz = cz - Math.sin(toward) * 3 - f.z;
      this.walk(f, tx, tz, Math.hypot(tx, tz) > 0.8 ? speed : 0, false);
      f.face = turn(f.face, toward, 4 * DT);
      return;
    }
    this.keepOff(f, h, dist, toward, los, speed, 4, 7);
  }

  /** A nurse's lines: into the two nearest hurt crew it can see, mending hull and plating. */
  private mend(f: Foe) {
    if (Math.floor(this.time * 2) !== Math.floor((this.time - DT) * 2)) {
      f.links = this.foes
        .filter((g) => !g.dead && g !== f && g.aware && g.kind !== 'skulk' && g.kind !== 'kelter' && (g.hp < g.max || g.plate < g.plateMax) && Math.hypot(g.x - f.x, g.z - f.z) < 8 && this.deck.clear(f.x, f.z, g.x, g.z))
        .sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))
        .slice(0, 2)
        .map((g) => g.id);
    }
    if (f.state === 'stagger' || f.state === 'stun') return;
    for (const id of f.links) {
      const g = this.foes.find((x) => x.id === id);
      if (!g || g.dead) continue;
      g.hp = Math.min(g.max, g.hp + 1.0 * DT);
      if (g.open <= 0) g.plate = Math.min(g.plateMax, g.plate + 2 * DT);
    }
  }

  /**
   * A beast loose from its cage: it goes for whatever's nearest, crew or you. It rears (its
   * shadow falls where it'll land), then pounces; after, it's winded, open for a moment.
   */
  private beast(f: Foe) {
    // its prey, every so often: the nearest body it can see
    if (!f.prey || Math.floor(this.time * 2.5) !== Math.floor((this.time - DT) * 2.5)) {
      let best: Foe['prey'] = null;
      let bd = f.prey ? FOES.skulk.sight : FOES.skulk.sight;
      for (const h of this.heroes) {
        if (h.down || h.out) continue;
        const dd = Math.hypot(h.x - f.x, h.z - f.z);
        if (dd < bd && this.deck.clear(f.x, f.z, h.x, h.z)) {
          bd = dd;
          best = { hero: h.id };
        }
      }
      for (const g of this.foes) {
        if (g === f || g.dead || g.kind === 'skulk' || g.state === 'caged') continue;
        const dd = Math.hypot(g.x - f.x, g.z - f.z) * 0.9;
        if (dd < bd && this.deck.clear(f.x, f.z, g.x, g.z)) {
          bd = dd;
          best = { foe: g.id };
        }
      }
      // nothing in sight: hunt the nearest of you down the paths
      if (!best) {
        const h = this.nearestHero(f.x, f.z);
        if (h) best = { hero: h.id };
      }
      f.prey = best;
    }
    const prey = f.prey;
    const body = !prey ? null : 'hero' in prey ? this.heroes[prey.hero] : this.foes.find((g) => g.id === prey.foe);
    if (!body || ('dead' in body && body.dead) || ('down' in body && (body.down || body.out))) {
      f.prey = null;
      this.walk(f, 0, 0, 0);
      return;
    }
    const dx = body.x - f.x;
    const dz = body.z - f.z;
    const dist = Math.hypot(dx, dz);
    const toward = Math.atan2(dz, dx);
    const los = this.deck.clear(f.x, f.z, body.x, body.z);
    switch (f.state) {
      case 'alert':
        this.walk(f, 0, 0, 0);
        f.face = turn(f.face, toward, 8 * DT);
        if (f.t <= 0) f.state = 'chase';
        return;
      case 'stagger':
      case 'stun':
        this.walk(f, 0, 0, 0);
        return;
      case 'recover':
        this.walk(f, 0, 0, 0);
        if (f.t <= 0) f.state = 'chase';
        return;
      case 'rear':
        this.walk(f, 0, 0, 0, false);
        f.face = turn(f.face, Math.atan2(f.tz - f.z, f.tx - f.x), 8 * DT);
        if (f.t <= 0) this.enter(f, 'pounce', 0.3);
        return;
      case 'pounce': {
        const l = Math.hypot(f.tx - f.x, f.tz - f.z);
        const v = Math.min(18, l / Math.max(DT, f.t));
        if (l > 0.05) this.moveBody(f, ((f.tx - f.x) / l) * v * DT, ((f.tz - f.z) / l) * v * DT, f.r);
        if (f.t <= 0 || l < 0.2) {
          for (const h of this.heroes) if (!h.down && !h.out && Math.hypot(h.x - f.x, h.z - f.z) < 1.25) this.hurtHero(h, 2, f.x, f.z);
          for (const g of this.foes) {
            if (g === f || g.dead || g.kind === 'skulk' || g.state === 'caged' || Math.hypot(g.x - f.x, g.z - f.z) > 1.35) continue;
            this.hitFoe(g, 5, 99, Math.atan2(g.z - f.z, g.x - f.x), 9, -1, true, false);
          }
          this.events.push({ type: 'pounce', id: f.id, x: f.x, z: f.z });
          this.noise(f.x, f.z, 9);
          this.enter(f, 'recover', 0.85);
          f.open = 0.85;
          f.cd = 1.4;
        }
        return;
      }
      default: {
        f.state = 'chase';
        if (los && dist < 6.5 && dist > 1 && f.cd <= 0) {
          const bv = 'vx' in body ? { x: body.vx, z: body.vz } : { x: 0, z: 0 };
          f.tx = body.x + bv.x * 0.25;
          f.tz = body.z + bv.z * 0.25;
          if (this.deck.blocked(Math.floor(f.tx), Math.floor(f.tz))) {
            f.tx = body.x;
            f.tz = body.z;
          }
          this.enter(f, 'rear', 0.5);
          this.events.push({ type: 'rear', id: f.id, x: f.tx, z: f.tz });
          return;
        }
        const w = los || !('hp' in body && 'tins' in body) ? { x: dx, z: dz } : this.deck.downhill(this.fields[(body as Hero).id], f.x, f.z) ?? { x: 0, z: 0 };
        this.walk(f, w.x, w.z, dist < 1 ? 0 : FOES.skulk.speed);
      }
    }
  }

  /** A foe takes a hit. `a`: the way the round was going. `hero` -1: not one of you (a beast, the air). */
  hitFoe(f: Foe, dmg: number, plate: number, a: number, knock: number, hero: number, heavy: boolean, round = true) {
    if (f.dead || f.state === 'caged' || f.under) return;
    if (hero >= 0) f.lastHero = hero;
    // the bruiser's shield: anything from in front glances off
    if (f.kind === 'bruiser' && f.state !== 'stun' && f.open <= 0 && Math.abs(angleDiff(a + Math.PI, f.face)) < 1.15) {
      f.kx += Math.cos(a) * knock * 0.25;
      f.kz += Math.sin(a) * knock * 0.25;
      this.events.push({ type: 'block', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r, a });
      if (!f.aware) this.notice(f, 0.2);
      return;
    }
    // a torcher's tank, in its back: hurts more, and fills up towards going off
    if (f.kind === 'torcher' && Math.abs(angleDiff(a, f.face)) < 1.0) {
      f.tank += heavy ? 0.5 : 1;
      dmg *= 1.5;
      this.events.push({ type: 'tank', id: f.id, x: f.x - Math.cos(f.face) * 0.4, z: f.z - Math.sin(f.face) * 0.4, k: Math.min(1, f.tank / 5) });
      if (f.tank >= 5) {
        this.kill(f, a, hero);
        return;
      }
    }
    let plated = false;
    if (!f.aware && f.kind !== 'skulk') {
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
        this.enter(f, 'stagger', 2.6);
        this.events.push({ type: 'plateBreak', id: f.id, x: f.x, z: f.z });
      }
    } else f.hp -= dmg;
    f.sinceHit = 0;
    f.flash = 1;
    const kk = FOES[f.kind].role === 'heavy' ? 0.35 : 1;
    f.kx += Math.cos(a) * knock * kk;
    f.kz += Math.sin(a) * knock * kk;
    if (round) this.events.push({ type: 'hit', id: f.id, x: f.x, z: f.z, a, plate: plated, heavy, dmg });
    if (f.hp <= 0) this.kill(f, a, hero);
    else if ((f.kind === 'gunner' || f.kind === 'auditor') && f.state === 'aim' && heavy) {
      // a breacher blast knocks the aim off
      this.enter(f, 'recover', 0.4);
    }
  }

  private kill(f: Foe, a: number, hero: number) {
    if (f.dead) return;
    f.dead = true;
    f.state = 'dead';
    f.deathT = 0;
    f.fallA = a;
    // it goes the way it was hit, harder for a harder hit (and a body flying fast bowls the crew over)
    const base = f.takenDown ? 11 : 6;
    f.kx = Math.cos(a) * base + f.kx * 0.5;
    f.kz = Math.sin(a) * base + f.kz * 0.5;
    const ks = Math.hypot(f.kx, f.kz);
    if (ks > 18) {
      f.kx *= 18 / ks;
      f.kz *= 18 / ks;
    }
    const by = hero >= 0 ? hero : f.lastHero;
    const h = this.heroes[by];
    if (h) h.kills++;
    this.events.push({ type: 'kill', id: f.id, x: f.x, z: f.z, a, takedown: f.takenDown, hero: by });
    // a kelter's line goes slack
    for (const x of this.heroes) if (x.hook?.by === f.id) x.hook = null;
    // the Hive's crew burst as they go (not when you take them quietly)
    if (f.kind === 'thrall' && !f.takenDown) this.spores(f.x, f.z, 1.3, 2.2);
    if (f.kind === 'puffer') this.spores(f.x, f.z, f.takenDown ? 1.5 : 2.3, 3.4);
    // a torcher's fuel: a spill as it falls, or the whole tank going up
    if (f.kind === 'torcher') {
      if (f.tank >= 5) {
        this.blast(f.x, f.z, 2.6);
        this.ignite(f.x, f.z, 2.1, FIRE.life);
      } else if (!f.takenDown) this.ignite(f.x, f.z, 1.1, 3);
    }
    // a notary's seals come to nothing
    if (f.kind === 'notary') this.seals = this.seals.filter((s) => s.by !== f.id);
    if (f.spaced) return;
    const drop = ARM_DROP[f.kind];
    if (drop && this.r() < drop[1]) this.dropArm(drop[0], f.x, f.z);
    // what was in its pockets
    // (a takedown shakes out more)
    const role = FOES[f.kind].role;
    const n = (role === 'heavy' ? 5 : role === 'gun' || role === 'kelter' || role === 'odd' ? 3 : 2) + (f.takenDown ? 2 : 0);
    for (let i = 0; i < n; i++) this.dropTin(f.x, f.z, role === 'heavy' ? 3 : 2);
  }

  private dropTin(x: number, z: number, value: number) {
    const a = this.r() * Math.PI * 2;
    const v = 2 + this.r() * 3;
    this.tins.push({ x, z, y: 0.6, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + this.r() * 3, value, t: 0, taken: false });
  }

  /** Keeps bodies from standing in each other, and you out of them. */
  private separate() {
    const fs = this.foes.filter((f) => !f.dead && f.state !== 'caged' && !f.under);
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
        if (h.down || h.out || h.dashT > 0) continue;
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

  /** Pushes a circle out of any wall cell or solid prop it overlaps (a prop at its own edges). */
  private push(b: { x: number; z: number }, r: number) {
    const d = this.deck;
    const x0 = Math.floor(b.x - r);
    const x1 = Math.floor(b.x + r);
    const z0 = Math.floor(b.z - r);
    const z1 = Math.floor(b.z + r);
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        if (d.walled(cx, cz)) pushOut(b, r, cx, cz, cx + 1, cz + 1);
        const boxes = d.boxesIn(cx, cz);
        if (boxes) for (const q of boxes) pushOut(b, r, q.x0, q.z0, q.x1, q.z1);
      }
  }

  // --- guns, rounds, the rest -----------------------------------------------------------------

  private fire(from: Round['from'], kind: Round['kind'], owner: number, x: number, z: number, a: number, speed: number, r: number, dmg: number, plate: number, knock: number, life: number) {
    const b: Round = { x, z, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, r, life, from, kind, owner, dmg, plate, knock, dead: false };
    this.rounds.push(b);
    return b;
  }

  private moveRounds() {
    const d = this.deck;
    const fresh: Round[] = [];
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
        // things you can shoot that aren't people: a canister, an alarm panel, a turret, a cage
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
          // a steam pipe, shot: it bursts now
          for (const st of this.steams) {
            if (st.on || st.warm || Math.hypot(st.prop.x - b.x, st.prop.z - b.z) > 0.75) continue;
            b.dead = true;
            st.t = st.cycle;
            this.events.push({ type: 'wall', x: b.x, z: b.z, a, heavy: false });
          }
          for (const c of this.cages) {
            if (c.open || Math.hypot(c.prop.x - b.x, c.prop.z - b.z) > 1.15) continue;
            b.dead = true;
            c.hp -= b.dmg;
            this.events.push({ type: 'wall', x: b.x, z: b.z, a, heavy: b.kind === 'pellet' });
            if (c.hp <= 0) this.openCage(c);
          }
          // a warden's wall: rivets come back off it, a blast cracks it
          for (const f of this.foes) {
            if (b.dead) break;
            if (f.kind !== 'warden' || f.dead || f.wall <= 0 || f.open > 0) continue;
            const dd = Math.hypot(b.x - f.x, b.z - f.z);
            if (dd > f.r + 0.85 || Math.abs(angleDiff(Math.atan2(b.z - f.z, b.x - f.x), f.face)) > 1.05) continue;
            b.dead = true;
            if (b.kind === 'pellet') {
              f.wall -= b.plate;
              this.events.push({ type: 'wallHit', id: f.id, x: b.x, z: b.z });
              if (f.wall <= 0) {
                f.wall = 0;
                f.wallT = 6;
                f.open = 2.6;
                this.enter(f, 'stagger', 2.6);
                f.lastHero = b.owner;
                this.events.push({ type: 'wallBreak', id: f.id, x: f.x + Math.cos(f.face) * f.r, z: f.z + Math.sin(f.face) * f.r });
              }
            } else {
              const ra = a + Math.PI + (this.r() - 0.5) * 0.35;
              fresh.push({ x: b.x, z: b.z, vx: Math.cos(ra) * 24, vz: Math.sin(ra) * 24, r: 0.16, life: 0.75, from: 'foe', kind: 'reflect', owner: f.id, dmg: 1, plate: 0, knock: 0, dead: false });
              this.events.push({ type: 'reflect', id: f.id, x: b.x, z: b.z, a: ra });
            }
          }
          if (b.dead) break;
        }
        if (d.stops(cx, cz)) {
          const px = b.x - (b.vx * DT) / sub;
          const pz = b.z - (b.vz * DT) / sub;
          if (b.bounce && b.bounce > 0) {
            // a stamp comes back off it
            const hx = d.stops(Math.floor(b.x), Math.floor(pz));
            const hz = d.stops(Math.floor(px), Math.floor(b.z));
            if (hx || !hz) b.vx = -b.vx;
            if (hz || !hx) b.vz = -b.vz;
            b.x = px;
            b.z = pz;
            b.bounce--;
            this.events.push({ type: 'wall', x: px, z: pz, a, heavy: true });
            continue;
          }
          b.dead = true;
          if (b.kind !== 'flame') this.events.push({ type: 'wall', x: px, z: pz, a, heavy: b.kind === 'pellet' || b.kind === 'stamp' });
          break;
        }
        if (b.from === 'hero') {
          for (const f of this.foes) {
            if (f.dead || f.state === 'caged' || f.under || Math.hypot(f.x - b.x, f.z - b.z) > f.r + b.r) continue;
            b.dead = true;
            if (b.kind === 'harpoon') this.reel(this.heroes[b.owner], f, a);
            else this.hitFoe(f, b.dmg, b.plate, a, b.knock, b.owner, b.kind === 'pellet' || b.kind === 'stamp');
            if (b.kind === 'stamp') {
              // the seal's weight: the crew stood close take some of it
              for (const g of this.foes) {
                if (g === f || g.dead || g.state === 'caged' || g.under || Math.hypot(g.x - b.x, g.z - b.z) > 1.3 + g.r) continue;
                this.hitFoe(g, 1.5, 1.5, Math.atan2(g.z - b.z, g.x - b.x), 4, b.owner, true, false);
              }
              this.events.push({ type: 'boom', x: b.x, z: b.z, r: 0.8 });
            }
            break;
          }
        } else {
          for (const h of this.heroes) {
            if (h.down || h.out || Math.hypot(h.x - b.x, h.z - b.z) > HERO.r + b.r) continue;
            if (b.kind === 'hook') {
              // a hook: unless you slid through it, you're on the line
              if (h.dashT > 0) {
                this.hurtHero(h, 0, b.x, b.z);
                continue;
              }
              if (h.inv > 0 || h.hook) continue;
              b.dead = true;
              h.hook = { by: b.owner };
              if (h.work?.kind !== 'leave') h.work = null;
              const by = this.foes.find((f) => f.id === b.owner);
              if (by && !by.dead) this.enter(by, 'reel', 9);
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
    this.rounds.push(...fresh);
  }

  /** A cage broken open: its beast is loose, and hungry. */
  private openCage(c: Cage) {
    if (c.open) return;
    c.open = true;
    this.deck.remove(c.prop);
    const f = this.foes.find((x) => x.id === c.foe);
    if (f && !f.dead) {
      f.aware = true;
      this.enter(f, 'alert', 0.35);
    }
    this.events.push({ type: 'cage', i: this.cages.indexOf(c), x: c.prop.x, z: c.prop.z });
    this.noise(c.prop.x, c.prop.z, 10);
  }

  /** A hook in a crewman: it's yanked to you and left open; a heavy one, or a beast, reels you in to it instead. */
  private reel(h: Hero, f: Foe, a: number) {
    if (!h || h.down || h.out) return;
    const zip = FOES[f.kind].role === 'heavy' || f.kind === 'skulk';
    this.hitFoe(f, 0.5, 0.5, a, 0, h.id, false);
    if (f.dead) return;
    f.open = Math.max(f.open, zip ? 1.0 : 1.4);
    this.enter(f, 'stagger', f.open);
    if (zip) {
      // a slide you didn't press, straight into it: open, so it's a takedown when you get there
      const l = Math.hypot(f.x - h.x, f.z - h.z) || 1;
      h.dashX = (f.x - h.x) / l;
      h.dashZ = (f.z - h.z) / l;
      h.dashT = Math.min(0.5, l / HERO.dashSpeed);
      h.dashAge = 1;
      h.bumped = false;
      h.perfected = true;
    } else {
      const l = Math.hypot(h.x - f.x, h.z - f.z) || 1;
      const pull = Math.min(18, l * 4.5);
      f.kx = ((h.x - f.x) / l) * pull;
      f.kz = ((h.z - f.z) / l) * pull;
    }
    this.events.push({ type: 'reel', hero: h.id, id: f.id, zip });
  }

  private ignite(x: number, z: number, r: number, life: number) {
    // a fire on a fire: just more of it
    const at = this.fires.find((f) => Math.hypot(f.x - x, f.z - z) < 0.8);
    if (at) {
      at.r = Math.max(at.r, r);
      at.life = Math.max(at.life, at.t + life);
      return;
    }
    this.fires.push({ x, z, r, t: 0, life });
    this.events.push({ type: 'fire', x, z, r });
  }

  /** The fires burn on the beat: crew and you alike; they set off canisters, and spores go up in a flash. */
  private updateFires() {
    for (const fi of this.fires) {
      fi.t += DT;
      if (!this.hazTick) continue;
      const r = fi.r * Math.min(1, (fi.life - fi.t) / 0.8);
      for (const h of this.heroes) if (Math.hypot(h.x - fi.x, h.z - fi.z) < r * 0.85) this.hurtHero(h, 1, fi.x, fi.z);
      for (const f of this.foes) {
        if (f.dead || f.state === 'caged' || f.under || Math.hypot(f.x - fi.x, f.z - fi.z) > r + f.r * 0.5) continue;
        this.hitFoe(f, 0.9, 0.9, Math.atan2(f.z - fi.z, f.x - fi.x), 2, f.lastHero, false, false);
        if (!f.aware && !f.dead) this.notice(f, 0.2);
      }
      for (const c of this.canisters) {
        if (c.gone || c.fuse >= 0 || Math.hypot(c.prop.x - fi.x, c.prop.z - fi.z) > r + 0.4) continue;
        c.fuse = 0.4 + this.r() * 0.3;
        this.events.push({ type: 'fuse', i: this.canisters.indexOf(c) });
      }
      for (const c of this.clouds) {
        if (c.t >= c.life || Math.hypot(c.x - fi.x, c.z - fi.z) > r + c.r * 0.6) continue;
        // spores burn: a flash the size of the cloud
        c.t = c.life;
        for (const f of this.foes) {
          if (f.dead || f.state === 'caged' || f.under || Math.hypot(f.x - c.x, f.z - c.z) > c.r + f.r) continue;
          this.hitFoe(f, 2.5, 2.5, Math.atan2(f.z - c.z, f.x - c.x), 5, f.lastHero, true, false);
        }
        for (const h of this.heroes) if (Math.hypot(h.x - c.x, h.z - c.z) < c.r * 0.8) this.hurtHero(h, 1, c.x, c.z);
        this.events.push({ type: 'flare', x: c.x, z: c.z, r: c.r });
      }
    }
    this.fires = this.fires.filter((f) => f.t < f.life);
  }

  /** Is (x, z) in a pipe's jet, give or take `r`? */
  inJet(s: Steam, x: number, z: number, r: number) {
    const px = x - s.x;
    const pz = z - s.z;
    const t = px * Math.cos(s.a) + pz * Math.sin(s.a);
    return t > -0.2 && t < STEAM.len && Math.abs(-px * Math.sin(s.a) + pz * Math.cos(s.a)) < STEAM.w + r;
  }

  private updateSteam() {
    this.steams.forEach((s, i) => {
      s.t += DT;
      const warm = s.t > s.cycle - STEAM.warm && s.t < s.cycle;
      const on = s.t >= s.cycle && s.t < s.cycle + STEAM.jet;
      if (warm && !s.warm) this.events.push({ type: 'steamWarm', i });
      if (on !== s.on) this.events.push({ type: 'steam', i, on });
      s.warm = warm;
      s.on = on;
      if (s.t >= s.cycle + STEAM.jet) {
        s.t = 0;
        s.cycle = STEAM.calm + this.r() * 2.5;
      }
      if (!on) return;
      const ca = Math.cos(s.a);
      const sa = Math.sin(s.a);
      for (const h of this.heroes) {
        if (h.down || h.out || !this.inJet(s, h.x, h.z, HERO.r)) continue;
        if (this.hurtHero(h, 1, s.x - ca, s.z - sa)) this.events.push({ type: 'scald', x: h.x, z: h.z });
        if (h.dashT <= 0) {
          h.vx += ca * 30 * DT;
          h.vz += sa * 30 * DT;
        }
      }
      for (const f of this.foes) {
        if (f.dead || f.state === 'caged' || f.under || !this.inJet(s, f.x, f.z, f.r)) continue;
        f.kx += ca * 40 * DT;
        f.kz += sa * 40 * DT;
        if (this.hazTick) {
          this.hitFoe(f, 1.2, 1.2, s.a, 1, f.lastHero, false, false);
          if (!f.dead) this.events.push({ type: 'scald', x: f.x, z: f.z });
        }
      }
    });
  }

  /** A notary's seals: armed, they burst, and they don't care whose feet are on them. */
  private updateSeals() {
    for (const s of this.seals) {
      s.t += DT;
      if (s.t < s.dur) continue;
      for (const h of this.heroes) if (Math.hypot(h.x - s.x, h.z - s.z) < 1.15) this.hurtHero(h, 1, s.x, s.z);
      for (const f of this.foes) {
        if (f.dead || f.state === 'caged' || f.under || Math.hypot(f.x - s.x, f.z - s.z) > 1.15 + f.r) continue;
        this.hitFoe(f, 2, 2, Math.atan2(f.z - s.z, f.x - s.x), 3, -1, true, false);
      }
      this.events.push({ type: 'sealBurst', x: s.x, z: s.z });
    }
    this.seals = this.seals.filter((s) => s.t < s.dur);
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
      // the one with the core first
      const c = this.carrier;
      const seesC = c && Math.hypot(c.x - t.prop.x, c.z - t.prop.z) < 13 && this.deck.clear(t.prop.x, t.prop.z, c.x, c.z);
      const h = seesC ? c : this.nearestHero(t.prop.x, t.prop.z);
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

  /** Where a gate is in its cycle: 0..GATE.off off (warming at the end), then on. */
  gatePhase(g: GateState) {
    return (this.time + g.gate.phase) % (GATE.off + GATE.on);
  }

  /** The lattice gates cycle; on, they burn whoever's in them (not the crew: it's their ship). Slide through. */
  private updateGates() {
    this.gates.forEach((g, i) => {
      const p = this.gatePhase(g);
      const on = p >= GATE.off;
      g.warm = !on && p >= GATE.off - GATE.warm;
      if (on !== g.on) {
        g.on = on;
        this.events.push({ type: 'gate', i, on });
      }
      if (!on) return;
      const door = g.gate.door;
      for (const h of this.heroes) {
        if (h.down || h.out) continue;
        const inGate = door.axis === 'x' ? Math.abs(h.x - door.x) < 1.0 + HERO.r * 0.5 && Math.abs(h.z - door.z) < 0.5 + HERO.r * 0.6 : Math.abs(h.z - door.z) < 1.0 + HERO.r * 0.5 && Math.abs(h.x - door.x) < 0.5 + HERO.r * 0.6;
        if (!inGate) continue;
        if (this.hurtHero(h, 1, door.x, door.z)) {
          // thrown back out the way it came
          const back = door.axis === 'x' ? Math.sign(h.z - door.z || h.vz || 1) : Math.sign(h.x - door.x || h.vx || 1);
          if (door.axis === 'x') h.vz = back * 9;
          else h.vx = back * 9;
          h.stun = 0.2;
          this.events.push({ type: 'gateHit', hero: h.id, x: h.x, z: h.z });
        }
      }
    });
  }

  /** The breach breathes: calm, a rattle of warning, then a gust dragging everything loose towards the tear. */
  private updateVent() {
    const rp = this.deck.rupture;
    if (!rp) return;
    const cycle = VENT.calm + VENT.gust;
    this.ventT = (this.ventT + DT) % cycle;
    const on = this.ventT >= VENT.calm;
    if (on !== this.venting) {
      this.venting = on;
      this.events.push({ type: 'vent', on });
    }
    if (!on) return;
    // the mouth of it, just inside the hull
    const mx = rp.x;
    const mz = rp.z + (rp.rot === 0 ? 0.3 : -0.3);
    const pull = (x: number, z: number) => {
      const dx = mx - x;
      const dz = mz - z;
      const d = Math.hypot(dx, dz);
      if (d > VENT.reach || d < 1e-3 || !this.deck.clear(x, z, mx, mz)) return null;
      const k = VENT.pull * Math.pow(1 - d / VENT.reach, 1.2);
      return { x: (dx / d) * k, z: (dz / d) * k, d };
    };
    for (const h of this.heroes) {
      if (h.out) continue;
      const p = pull(h.x, h.z);
      if (!p) continue;
      h.vx += p.x * DT * (h.dashT > 0 ? 0.3 : 1);
      h.vz += p.z * DT * (h.dashT > 0 ? 0.3 : 1);
      if (h.dashT <= 0) this.moveBody(h, p.x * DT * 0.35, p.z * DT * 0.35, HERO.r);
      if (p.d < 1.3) this.hurtHero(h, 1, mx, mz);
    }
    for (const f of this.foes) {
      if (f.dead || f.state === 'caged') continue;
      const p = pull(f.x, f.z);
      if (!p) continue;
      const heavy = FOES[f.kind].role === 'heavy' ? 0.45 : 1;
      f.kx += p.x * DT * 3 * heavy;
      f.kz += p.z * DT * 3 * heavy;
      // too near: out it goes
      if (p.d < 1.45) {
        f.spaced = true;
        this.events.push({ type: 'spaced', id: f.id, x: f.x, z: f.z });
        this.kill(f, Math.atan2(mz - f.z, mx - f.x), f.lastHero);
      }
    }
    for (const t of this.tins) {
      const p = pull(t.x, t.z);
      if (!p) continue;
      t.vx += p.x * DT * 2;
      t.vz += p.z * DT * 2;
      if (p.d < 1) t.taken = true;
    }
    for (const b of this.rounds) {
      const p = pull(b.x, b.z);
      if (!p) continue;
      b.vx += p.x * DT * 2.5;
      b.vz += p.z * DT * 2.5;
    }
  }

  /** A cloud of spores here. */
  private spores(x: number, z: number, r: number, life: number, ours?: number) {
    this.clouds.push({ x, z, r, t: 0, life, ours });
    this.events.push({ type: 'spores', x, z, r });
  }

  private updateSpores() {
    for (const s of this.sacs) {
      s.t += DT;
      if (s.t >= s.dur) {
        if (s.ours !== undefined) this.spores(s.x1, s.z1, 2.2, 4, s.ours);
        else this.spores(s.x1, s.z1, 1.9, 3.4);
      }
    }
    this.sacs = this.sacs.filter((s) => s.t < s.dur);
    for (const c of this.clouds) {
      c.t += DT;
      // yours eat the crew in them, on the beat
      if (c.ours === undefined || !this.hazTick) continue;
      for (const f of this.foes) {
        if (f.dead || f.state === 'caged' || f.under || Math.hypot(f.x - c.x, f.z - c.z) > c.r + f.r * 0.5) continue;
        this.hitFoe(f, 0.8, 0.8, Math.atan2(f.z - c.z, f.x - c.x), 0, c.ours, false, false);
      }
    }
    this.clouds = this.clouds.filter((c) => c.t < c.life);
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
        if (h.down || h.out) continue;
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
    this.canisters.forEach((c) => {
      if (c.gone || c.fuse < 0) return;
      c.fuse -= DT;
      if (c.fuse > 0) return;
      c.gone = true;
      this.deck.remove(c.prop);
      this.blast(c.prop.x, c.prop.z, 3.2);
      this.ignite(c.prop.x, c.prop.z, FIRE.r, FIRE.life);
    });
  }

  /** A blast: everyone near takes it (plating cracked), more canisters go up, cages burst, the heroes too. */
  blast(x: number, z: number, r: number) {
    this.events.push({ type: 'boom', x, z, r });
    this.noise(x, z, 14);
    for (const f of this.foes) {
      if (f.dead || f.state === 'caged') continue;
      const dd = Math.hypot(f.x - x, f.z - z);
      if (dd > r + f.r) continue;
      const a = Math.atan2(f.z - z, f.x - x);
      if (f.kind === 'warden') f.wall = 0;
      this.hitFoe(f, 3, 99, a, 12, -1, true, false);
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
    for (const c of this.cages) if (!c.open && Math.hypot(c.prop.x - x, c.prop.z - z) < r + 1) this.openCage(c);
  }

  /** Doors slide open for anyone near, and shut behind them. */
  private doors() {
    const d = this.deck;
    let changed = false;
    for (const door of d.doors) {
      let want = false;
      const near = (x: number, z: number) => Math.abs(x - door.x) < (door.axis === 'x' ? 1.6 : 2.3) && Math.abs(z - door.z) < (door.axis === 'x' ? 2.3 : 1.6);
      for (const h of this.heroes) if (!h.down && !h.out && near(h.x, h.z)) want = true;
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

  /** The core made it out: in someone's arms in the lock, or set down there. */
  get coreOut() {
    return !!this.heart && this.inLock(this.heart.x, this.heart.z);
  }

  medals(): Medal[] {
    if (this.outcome !== 'escaped') return [];
    const out: Medal[] = [];
    if (!this.alarmed && !this.kelters) out.push('ghost');
    if (this.heroes.every((h) => h.hits === 0)) out.push('clean');
    if (this.crates.every((c) => c.open)) out.push('full');
    if (this.coreOut) out.push('core');
    if (!this.kelters && this.clock >= this.clockMax * 0.3) out.push('quick');
    return out;
  }

  /** The rank: what you carried out (the crates, the strongbox, the core) and the marks you earned. */
  rank(): BoardResult['rank'] {
    if (this.outcome !== 'escaped') return null;
    const crates = this.crates.filter((c) => c.open).length / Math.max(1, this.crates.length);
    const m = this.medals();
    const score = crates * 3 + (this.strongbox?.open ? 1 : 0) + (m.includes('core') ? 2 : 0) + m.filter((x) => x !== 'full' && x !== 'core').length;
    return score >= 7 ? 'S' : score >= 5 ? 'A' : score >= 3 ? 'B' : 'C';
  }

  result(): BoardResult {
    const out = this.outcome ?? 'downed';
    const got = out === 'escaped';
    return {
      outcome: out,
      crates: this.crates.map((c) => got && c.open),
      strongbox: got && !!this.strongbox?.open,
      core: got && this.coreOut,
      tins: this.heroes.reduce((a, h) => a + h.tins, 0),
      pay: got && this.strongbox?.open ? this.pay : 0,
      alarm: this.alarmed,
      kelters: !!this.kelters,
      spare: got ? this.timeLeft : 0,
      medals: this.medals(),
      rank: this.rank(),
      size: this.size,
      family: this.family,
      condition: this.condition,
      heroes: this.heroes.map((h) => ({ kills: h.kills, takedowns: h.takedowns, perfects: h.perfects, hits: h.hits, out: h.out || (got && h.down), tins: h.tins })),
    };
  }

  /** The room by id (for the view). */
  room(id: number): Room | undefined {
    return this.deck.rooms[id];
  }
}

/** How wide a crewman's eyes take in (either side of where it faces). */
export const SIGHT_CONE = 1.1;

const NO_INTENT: Intent = { x: 0, y: 0, fire: false, heavy: false, boost: 0, dash: false, special: false, aux: false, focus: false };

/** The shortest signed turn from a to b. */
/** Pushes a circle out of a box, the shortest way. */
function pushOut(b: { x: number; z: number }, r: number, x0: number, z0: number, x1: number, z1: number) {
  const nx = clamp(b.x, x0, x1);
  const nz = clamp(b.z, z0, z1);
  const ex = b.x - nx;
  const ez = b.z - nz;
  const dd = Math.hypot(ex, ez);
  if (dd >= r) return;
  if (dd > 1e-5) {
    b.x = nx + (ex / dd) * r;
    b.z = nz + (ez / dd) * r;
    return;
  }
  // the centre's inside the box: out the nearest side
  const l = b.x - x0;
  const rr = x1 - b.x;
  const t = b.z - z0;
  const bt = z1 - b.z;
  const m = Math.min(l, rr, t, bt);
  if (m === l) b.x = x0 - r;
  else if (m === rr) b.x = x1 + r;
  else if (m === t) b.z = z0 - r;
  else b.z = z1 + r;
}

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
