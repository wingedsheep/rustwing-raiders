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
 * Khet's has two minds (`TWO_LOOKS`): his own scrap moves, flared, and his titan's, drawn in light.
 * In its middle phase the light can take a move back from him mid-flare (the false tell); in its
 * last it has decided, and every move is its own.
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

import type { Bullet, Enemy, Level, Pickup } from './level';
import { DT, FLIGHT_Y, HALF_H, HALF_W } from './types';
import { metaOf } from './meta';
import { clamp, hashStr, lerp, rng, shuffle, smooth } from '../util';
import { go, over, release, type AttackKind, type Tele } from './combat';
import { foeSkin, type Foe } from './factions';
import { lerpAngle } from './foes';
import { strike, type Strike } from './strikes';
import { SHARE, pattern, type Family } from './volleys';

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
  // a boss's own (see OWN)
  | 'rake'
  | 'screech'
  | 'gust'
  | 'scan'
  | 'calve'
  | 'count'
  | 'grasp'
  | 'irons'
  | 'breach'
  | 'broadside'
  | 'pursuit'
  | 'lien'
  | 'ballast'
  | 'ram'
  | 'leap'
  | 'glassing'
  | 'kneel'
  | 'measure'
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
  /** The phase from which it has no guns left (see BARE). */
  bare: number;
  /** How slowly it moves, by phase and in its last stand (see TEMPO). */
  tempo: number[];
  /** Under the sea, out of reach (Istra's breach). */
  under: boolean;
  /** What it has thrown that comes back to it, and when it turns (Istra's tide). */
  tide: { o: Bullet | Strike; at: number; back: boolean }[];
  /** When the tide last turned (it says so once a turn, not once a bubble). */
  tideT: number;
  /** A chase that ends before its phase does (ARU-0's): it has overtaken you, and holds the screen. */
  overtook: boolean;
  /** ARU-0's nineteen seconds: how long it still stands silent (0: not now), and whether it has been called since. */
  hush: number;
  called: boolean;
  /** Its company plates, torn off and thrown as ballast; and the plates its Liens have bolted on (its armour). */
  torn: number;
  plates: number;
  /** Its name on its bar, once it isn't the one it came with (ARU-0, called: RECOVERY UNIT). */
  name?: string;
  /** The move it has lined up to make next (two Liens in a string). */
  next: BossMove | null;
  /** Turned to look up the screen (on a chase, behind you; ARU-0 facing Glacis). */
  faceUp: boolean;
  /** Lien's tow lines: each a line of light to the scrap it's reeling in (or where it threw a claw for it). */
  tows: Tow[];
  /** Ballast thrown down its lanes, coming back once it reaches the edge; and the lanes drawn while it tells. */
  thrown: { s: Strike; back: boolean }[];
  lanes: Laser[];
  /** Whose tell it is (Khet's flare, or *Unbending*'s light): the colour it's drawn in (null: the danger red). */
  look: 'scrap' | 'lattice' | null;
  /** Khet's call that *Unbending* won't make: what it does instead, once the flare's gone on long enough. */
  turn: BossMove | null;
  /** The Glassing's fire plan: the circles still to draw, in order. */
  plan: { x: number; z: number }[];
  /** Where the eye last laid glass; and where a leap left from. */
  glass: { x: number; z: number };
  from: { x: number; z: number };
}

type Laser = Level['lasers'][number];
interface Tow {
  k: Pickup | null;
  x: number;
  z: number;
  l: Laser;
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

/** A boss with its own way of saying it (the Engine doesn't see you: it logs you). */
const READ_OWN: Record<string, Partial<Record<Read, string>>> = {
  glacis: {
    back: 'LOGS: HANGING BACK',
    still: 'LOGS: STATIONARY',
    side: 'LOGS: LISTING',
    boost: 'LOGS: EXCESS VELOCITY',
    close: 'LOGS: INSIDE TOLERANCE',
    dash: 'LOGS: UNWITNESSED CROSSINGS',
  },
  // Istra plays to her Court: everything you do is part of the show
  vesh: {
    back: 'CALLS YOU IN, LITTLE FISH',
    still: 'SAYS: A SITTING SHELL',
    side: 'SAYS: HUGGING THE REEF',
    boost: 'THERE SHE VENTS!',
    close: 'SAYS: BOLD. SHE LIKES BOLD',
    dash: 'SAYS: SHOW-OFF',
  },
  // Oko has to be seen to stop you (the Census Office is watching his gate), and he's sorry
  halcyon: {
    back: 'HAILS: HEAVE TO, PILOT',
    still: 'SAYS: YOU SHOULD HAVE RUN',
    side: 'HAILS: KEEP TO THE',
    boost: 'SAYS: FAST SHIP. SHAME',
    close: 'SAYS: NOT PERSONAL, PILOT',
    dash: 'SAYS: ANSMOR FLYING, THAT',
  },
  // the Long Table aboard, its two-headed Chair never once agreeing with itself
  kessra: {
    back: 'VOTES: RUN IT DOWN',
    still: 'VOTES: LET IT WAIT',
    side: 'VOTES: CLOSE THE',
    boost: 'VOTES: CHARGE IT INTEREST',
    close: 'SPLITS: IT WANTS TO DEAL',
    dash: 'SPLITS, SIX TO SIX',
  },
  // the Choir speaks for her: always we, always polite, slightly wrong (a freighter's intercom)
  mirefall: {
    back: 'SINGS: WE SEE YOU, LITTLE ONE',
    still: 'SINGS: PLEASE REMAIN SEATED',
    side: 'SINGS: WE MAKE ROOM ON THE',
    boost: 'SINGS: NO RUNNING ON DECK',
    close: 'SINGS: WE ARE SO GLAD YOU CAME',
    dash: 'SINGS: WE FELT THAT',
  },
  // Khet, playing to the clans; he thinks he's the one steering
  ashgrave: {
    back: 'YELLS: SCARED OF A HEAD?',
    still: 'YELLS: HOLD STILL!',
    side: 'YELLS: GOT YOU ON THE',
    boost: 'YELLS: RUN, RUSTWING!',
    close: 'YELLS: OFF MY TITAN!',
    dash: 'LAUGHS: SLIPPERY!',
  },
  // Vantorr's account voice: you are an asset under recovery
  cinder: {
    back: 'ISSUES: ASSET WITHHELD',
    still: 'ISSUES: ASSET LOCATED',
    side: 'ISSUES: ASSET EVADING',
    boost: 'APPLIES A LATE FEE',
    close: 'SERVES YOU IN PERSON',
    dash: 'ISSUES: FINAL NOTICE',
  },
};

/** What a boss says it read, under its bar. */
export function readLine(planet: string, read: Read, side: number) {
  const own = READ_OWN[planet]?.[read];
  if (own) return read === 'side' ? `${own} ${side < 0 ? 'LEFT' : 'RIGHT'}` : own;
  return read === 'side' ? `SEES YOU HUGGING THE ${side < 0 ? 'LEFT' : 'RIGHT'}` : READ_LINE[read];
}

/** Which reads each move answers. */
const ANSWERS: Record<BossMove, Read[]> = {
  charge: ['back', 'still'],
  lunge: ['back'],
  rake: ['back', 'still'],
  screech: ['close', 'still'],
  gust: ['close', 'side'],
  scan: ['back', 'close'],
  calve: ['still', 'back'],
  count: ['side', 'still'],
  grasp: ['side', 'still'],
  irons: ['back', 'side'],
  breach: ['still', 'back'],
  broadside: ['side', 'close'],
  pursuit: ['back'],
  lien: ['still', 'close'],
  ballast: ['side', 'still'],
  ram: ['back', 'still'],
  leap: ['close', 'still'],
  glassing: ['still', 'side'],
  kneel: ['close', 'still'],
  measure: ['back', 'side'],
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

type Pattern = 'fans' | 'spiral' | 'rain' | 'rings' | 'walls' | 'lasers' | 'splitters' | 'curves' | 'frost' | 'tide' | 'ledger' | 'salvo';

const LENGTH: Record<Pattern, number> = { fans: 3.5, spiral: 4, rain: 3.5, rings: 3.5, walls: 4, lasers: 4, splitters: 3.5, curves: 4, frost: 3.2, tide: 4.4, ledger: 4, salvo: 3.6 };

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

/**
 * A boss's own moves, in place of its style's, a list a phase (its signature goes in second).
 * Vask: rake, sky dive, screech, to learn; the cage cracks and she adds her gust and calls her
 * brood; free, she's alone and it's all her.
 */
const OWN: Record<string, BossMove[][]> = {
  orutal: [['rake', 'screech'], ['rake', 'gust', 'summon', 'screech'], ['rake', 'screech', 'gust']],
  // The Engine: half asleep, it scans, crosses and sheds its ice; stirring, it starts to count and
  // calls its menders; awake, the ice is gone (no calving), its arms are free and it grasps
  glacis: [['scan', 'calve'], ['scan', 'count', 'summon', 'calve'], ['scan', 'count', 'grasp']],
  // Istra hunts you as she'd hunt an umora: irons, her breath, a breach; drawing blood makes it a
  // sea fight (broadsides, her captains called in); with her crew gone, everything comes back
  vesh: [['irons', 'breach'], ['irons', 'broadside', 'summon', 'breach'], ['irons', 'broadside', 'breach']],
  // ARU-0 by the contract: it repossesses, reels in the scrap as a lien and sends its collectors;
  // in arrears it reels twice running; called, it throws its company hull away as ballast
  cinder: [['lien', 'summon'], ['lien', 'summon'], ['ballast', 'lien', 'ballast']],
  // Khet rides: he rams, he leaps, he calls his clans, all on a flare. Then the head won't (the
  // same calls, but now and then *Unbending* draws something else and does that). Then it has
  // decided: Khet held in its jaw, and the titan fights the Compact's way, by the book
  ashgrave: [['ram', 'leap', 'summon'], ['ram', 'leap', 'summon'], ['glassing', 'kneel', 'measure']],
};

/** A boss whose signature opens each phase instead of coming second (ARU-0 serves notice first). */
const SIG_FIRST = new Set(['cinder']);

/** A chase that's an opening, not a phase: how long it lasts and what it makes on it, before it overtakes you. */
const CHASE: Record<string, { len: number; moves: BossMove[] }> = { cinder: { len: 10, moves: ['pursuit'] } };

/** A boss's own last stand, in order, in place of everything once more. */
const LAST_OWN: Record<string, BossMove[]> = {
  // ballast down every lane, a Lien on everything on the field, and the lanes again
  cinder: ['ballast', 'lien', 'ballast', 'repossess'],
  // the whole field glassed with one way out, then the eye twice
  ashgrave: ['glassing', 'eye', 'eye'],
};

/** ARU-0's nineteen seconds: its last phase opens with it standing still and silent, facing Glacis, before it's called. */
const HUSH: Record<string, number> = { cinder: 19 };

/**
 * A boss with two minds: its tells are drawn in the colour of whichever one is making the move
 * (Khet's in scrap amber, a flare; *Unbending*'s in lattice blue, drawn in light).
 */
const TWO_LOOKS = new Set(['ashgrave']);

/** A boss whose last phase is somebody else's: it's called as that phase starts, and goes by this name (*Unbending* sets Khet in its jaw and fights by the book). */
const DECIDES: Record<string, string> = { ashgrave: 'UNBENDING' };

/**
 * A boss's own filler, a list a phase, in place of its planet's favourites. The Engine's guns are
 * frozen while it dozes: all it does between moves is breathe out frost.
 */
const FILLER: Record<string, Pattern[][]> = {
  glacis: [['frost'], ['lasers', 'rings'], ['spiral', 'walls']],
  // Istra's crew on the deck guns, then the cannon; and when they've gone, only the sea she
  // breathes out and in
  vesh: [['curves', 'fans'], ['splitters', 'fans'], ['tide']],
  // ARU-0: the company's orderly walls and its mines; then fees (beams); called, the Engine's own
  cinder: [['walls', 'splitters'], ['lasers', 'walls'], ['spiral', 'lasers']],
  // Khet's junk guns bolted to the head (fans, walls; then rain as it fights him); with them
  // blown off, the titan's own: a file of rounds down a line, and rings
  ashgrave: [['fans', 'walls'], ['fans', 'rain'], ['salvo', 'rings']],
};

/**
 * How slowly it moves, by phase (its tells and its moves take this much longer); the last stand
 * is the last entry. The Engine is half asleep, then stirring, then wide awake. (A lattice tell is
 * never under a second, however awake.)
 */
const TEMPO: Record<string, number[]> = { glacis: [1.35, 1.1, 0.92, 0.85], cinder: [1, 0.92, 0.95, 0.85], ashgrave: [1, 0.94, 1, 0.88] };

/** How long its filler runs between moves, against the usual (Khet doesn't stand about: he's riding). */
const FILL: Record<string, number> = { ashgrave: 0.55 };

/**
 * What a hit is worth on it closed and open (after a move), crit or not, by phase, if not its
 * style's: a titan's head is armour. Khet leaves it open after everything he does; *Unbending*,
 * fighting the way it was built to, much less.
 */
const TAKEN: Record<string, { shut: [number, number]; open: [number, number] }[]> = {
  ashgrave: [
    { shut: [0.68, 0.9], open: [1.3, 1.55] },
    { shut: [0.48, 0.7], open: [1.05, 1.25] },
    { shut: [0.38, 0.55], open: [0.8, 1] },
  ],
};

/** The phase from which a boss has no guns left: no patterns, just its moves (Vask, free). */
const BARE: Record<string, number> = { orutal: 2 };

/** The beat of a boss's theme (its rings and wing beats land on it). */
const BEAT: Record<string, number> = { orutal: 60 / 140, glacis: 60 / 120, vesh: 60 / 126, cinder: 60 / 112, ashgrave: 60 / 116 };

const KIND: Record<BossMove, AttackKind> = {
  charge: 'charge',
  lunge: 'charge',
  rake: 'charge',
  screech: 'slam',
  gust: 'pulse',
  scan: 'beam',
  calve: 'shell',
  count: 'beam',
  grasp: 'slam',
  irons: 'harpoon',
  breach: 'slam',
  broadside: 'sweep',
  pursuit: 'shell',
  lien: 'beam',
  ballast: 'slam',
  ram: 'charge',
  leap: 'slam',
  glassing: 'shell',
  kneel: 'beam',
  measure: 'beam',
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
  count: 'THE COUNT',
  broadside: 'BROADSIDE',
  pursuit: 'PURSUIT',
  lien: 'LIEN',
  ballast: 'BALLAST',
  glassing: 'THE GLASSING',
  kneel: 'THE KNEEL',
  measure: 'THE MEASURE',
};
/** Called, ARU-0 names its moves in the Engine's words. */
const CALLED_NAME: Partial<Record<BossMove, string>> = { repossess: 'RECOVERY' };

/** Damage that breaks its poise (a share of its hull), and how fast poise comes back. */
const POISE = 0.075;
const POISE_BACK = 0.012;
/** A boss that's harder to rock (a titan's head), as a share of its hull. */
const POISE_OWN: Record<string, number> = { ashgrave: 0.12 };
const poiseAt = (lv: Level) => POISE_OWN[lv.spec.planet.id] ?? POISE;
/** Below this share of its hull it makes its last stand. */
const LAST = 0.08;

/**
 * How much hull it has, against the rest (2400 at the start of a run). Vask's three phases each
 * teach something, so each needs time: half again as long.
 */
const HULL: Record<string, number> = { orutal: 2.6, glacis: 2.4, vesh: 2.4, cinder: 2.2, ashgrave: 3.3 };
export const bossHull = (planet: string) => HULL[planet] ?? 1;

/** Who comes when it calls. */
const HELP: Record<string, [Foe, number]> = {
  orutal: ['swooper', 2],
  ashgrave: ['ramjack', 2],
  // Istra's captains: harpooners, with irons of their own
  vesh: ['hookjaw', 2],
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
  const moves = (OWN[planet] ?? MOVES[style]).map((l) => [...l]);
  // its own move comes second in every phase (seen early, and every time round)
  const sig = SIGNATURE[planet] ?? 'skydive';
  for (const l of moves) l.splice(SIG_FIRST.has(planet) ? 0 : 1, 0, sig);
  return {
    style,
    phase: 0,
    guns,
    weak,
    // fewer patterns at once: the last phase no longer stacks a third on
    patterns: FILLER[planet] ?? [[fav[0], fav[1]], [fav[1], fav[2]], [fav[2], fav[3]]],
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
    bare: BARE[planet] ?? 9,
    tempo: TEMPO[planet] ?? [1, 1, 1, 1],
    under: false,
    tide: [],
    tideT: -99,
    overtook: false,
    hush: 0,
    called: false,
    torn: 0,
    plates: 0,
    next: null,
    faceUp: style === 'pursuer',
    tows: [],
    thrown: [],
    lanes: [],
    look: TWO_LOOKS.has(planet) ? 'scrap' : null,
    turn: null,
    plan: [],
    glass: { x: 0, z: 0 },
    from: { x: 0, z: 0 },
  };
}

/** How near its poise is to breaking, 0..1 (1 while it's staggered). */
export const poiseOf = (lv: Level, e: Enemy) => (e.state === 'stagger' ? 1 : clamp(e.boss!.poise / (e.max * poiseAt(lv)), 0, 1));

/** The name of the move it's making, if it has one (its signature, and a few others). */
export const sigName = (e: Enemy) =>
  e.boss?.move && (e.state === 'windup' || e.state === 'attack') ? ((e.boss.called && CALLED_NAME[e.boss.move]) || MOVE_NAME[e.boss.move]) : undefined;

/** A perfect dash through its attack: a read. It wears its poise half through; through its signature, it breaks it. */
export function bossRead(lv: Level, e: Enemy) {
  const b = e.boss!;
  bossHurt(lv, e, e.max * poiseAt(lv) * (b.move === b.sig ? 1 : 0.5));
}

/** Hit: its poise gives, and when it breaks it's STAGGERED, whatever it was doing. */
export function bossHurt(lv: Level, e: Enemy, dmg: number) {
  const b = e.boss!;
  // no hit carries it past a phase it hasn't fought yet (nor past its last stand): it holds at the
  // line until the phase turns
  if (!b.last) e.hp = Math.max(e.hp, e.max * (b.phase === 0 ? 2 / 3 : b.phase === 1 ? 1 / 3 : LAST) - 1);
  if (e.t < 3.5 || e.shielded || b.poiseCd > 0 || e.state === 'stagger') return;
  b.poise += dmg;
  if (b.poise < e.max * poiseAt(lv)) return;
  stagger(lv, e, b);
  lv.emit({ type: 'bossStagger', enemy: e.id, x: e.x, z: e.z });
}

/** Its poise broken (or its plating): whatever it was making stops, and it reels. */
function stagger(lv: Level, e: Enemy, b: BossState) {
  b.poise = 0;
  b.poiseCd = 5;
  // whatever it was making stops: beams go out, a swinging ball drops, tow lines let go
  for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
  dropBall(b);
  letGo(b);
  if (e.grab >= 0) release(lv, e, true);
  b.move ??= 'summon';
  b.next = null;
  b.turn = null;
  // (a kneel's shield drops with it)
  e.guard = 0;
  // knocked out of a string of moves
  b.combo = 0;
  b.comboed = false;
  go(lv, e, 'stagger', 2.6);
}

/**
 * The plating its Liens bolted on, broken by a blow: it reels, and the plates come off it as scrap
 * on the field (take it, or the next Lien reels it back in).
 */
export function bossUnplated(lv: Level, e: Enemy) {
  const b = e.boss!;
  for (let k = 0; k < b.plates; k++) lv.drop('scrap', e.x + (lv.rand() - 0.5) * e.r * 2, e.z + 1 + lv.rand() * e.r, LIEN_SCRAP);
  b.plates = 0;
  e.armour = e.armourMax = 0;
  if (e.state !== 'stagger') stagger(lv, e, b);
  lv.emit({ type: 'armourBreak', enemy: e.id, x: e.x, z: e.z });
}

/** Lien's lines let go of what they held (it's left where it is). */
function letGo(b: BossState) {
  for (const t of b.tows) if (t.k) t.k.towed = false;
  b.tows.length = 0;
  b.lanes.length = 0;
  for (const w of b.thrown) w.s.dead = true;
  b.thrown.length = 0;
}

function dropBall(b: BossState) {
  if (b.ball) b.ball.dead = true;
  b.ball = null;
}

/** What a hit is worth on it now: armour, and the weak points when it's open. */
export function bossTaken(lv: Level, e: Enemy, crit: boolean) {
  const b = e.boss!;
  // ARU-0 in its nineteen seconds: nobody's there to hurt
  if (b.hush > 0) return crit ? 0.35 : 0.25;
  // *Unbending* kneeling over Khet: what gets past its shield gets him (what doesn't, never arrives)
  if (e.guard > 0) return crit ? 2 : 1.6;
  const open = e.state === 'recover' || e.state === 'stagger';
  if (crit && open) lv.emit({ type: 'weakHit', enemy: e.id, x: e.x, z: e.z, dmg: 0 });
  // poise broken: wide open, whatever it is
  if (e.state === 'stagger' && !(b.style === 'hive' && lv.enemies.some((o) => !o.dead && o.links.includes(e.id)))) return crit ? 2.2 : 1.8;
  const own = TAKEN[lv.spec.planet.id]?.[b.phase];
  if (own) return (open ? own.open : own.shut)[crit ? 1 : 0];
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
  e.shielded = b.shieldT > 0 || overtaking(b);
  e.heading = 0;
  // (silent, it isn't watching you)
  if (!b.hush) readYou(lv, e, b);
  // what its Liens bolt on stays on until it's broken off (it doesn't grow back)
  e.armourMax = e.armour;

  // phases at two thirds and one third (a chase ends after half a minute regardless, unless it's
  // only the opening: then it overtakes you after a while, and the phase goes on)
  const chase = CHASE[lv.spec.planet.id];
  if (b.style === 'pursuer' && b.phase === 0) b.chaseT += DT;
  let want = e.hp < e.max / 3 ? 2 : e.hp < (e.max * 2) / 3 ? 1 : 0;
  if (b.style === 'pursuer' && b.chaseT > 30 && !chase) want = Math.max(want, 1);
  if (chase && chasing(b) && b.chaseT > chase.len && !b.move) {
    b.overtook = true;
    lv.chase = false;
    // (once it's at the head of the screen, it serves notice straight away)
    b.pt = 99;
    lv.emit({ type: 'bossBeat', enemy: e.id, move: 'overtake', k: 0, x: e.x, z: e.z });
  }
  b.poiseCd = Math.max(0, b.poiseCd - DT);
  b.poise = Math.max(0, b.poise - e.max * POISE_BACK * DT);
  // (no last stand until it has been called)
  const last = e.hp < e.max * LAST && !b.last && !b.hush && (!HUSH[lv.spec.planet.id] || b.called);
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
      b.moves[2] = LAST_OWN[lv.spec.planet.id] ?? [b.sig, ...b.moves[2].filter((m) => m !== b.sig && m !== 'summon'), b.sig];
    } else {
      b.phase = want;
      b.moveN = 0;
      if (want === 2 && HUSH[lv.spec.planet.id]) b.hush = HUSH[lv.spec.planet.id];
      if (want === 2 && DECIDES[lv.spec.planet.id]) decide(lv, e, b);
    }
    b.current = 0;
    b.pt = 0;
    b.combo = 0;
    b.comboed = false;
    b.shieldT = 1.6;
    b.move = null;
    b.next = null;
    dropBall(b);
    letGo(b);
    b.tide.length = 0;
    b.turn = null;
    e.guard = 0;
    if (e.grab >= 0) release(lv, e, false);
    go(lv, e, 'idle');
    lv.chase = false;
    for (const x of lv.bullets) lv.cancel(x);
    lv.lasers.length = 0;
    lv.emit({ type: 'bossPhase', phase: b.last ? 3 : b.phase, style: b.style });
    lv.emit({ type: 'explode', x: e.x, z: e.z, y: e.y, size: 4, color: e.skin.colors[2] });
  }
  if (chasing(b)) lv.chase = true;
  b.faceUp = chasing(b) || b.hush > 0;
  if (b.hush > 0) hush(lv, e, b);
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
  // up from under the sea (a breach cut short: staggered as she rose); down from a leap
  if (b.move !== 'breach' && !(b.move === 'leap' && e.state !== 'recover' && e.state !== 'stagger')) {
    b.under = false;
    e.y += (FLIGHT_Y - e.y) * Math.min(1, DT * 6);
  }
  if (b.tide.length) ebb(lv, e, b);
  e.x = b.sx;
  e.z = lv.scroll + b.ss;
  if (e.shielded || e.stun > 0 || b.move) return;

  // patterns, then a breath, then a move, then a breath...
  const list: Pattern[] = b.hush > 0 ? ['ledger'] : b.patterns[b.phase];
  const pat = list[b.current % list.length];
  // on a chase it's all moves (a breath between them); with no guns left, too
  const onChase = chasing(b);
  const bare = b.phase >= b.bare;
  // in its last stand it hardly stops to breathe between moves
  const len = bare ? 0.2 : onChase || b.last ? 0.6 : LENGTH[pat] * (FILL[lv.spec.planet.id] ?? 1);
  b.pt += DT;
  if (b.pt > len + 0.9) {
    b.current++;
    b.pt = 0;
    b.fire = 0;
    // (silent, it makes no moves: it only prints)
    if (!b.hush) startMove(lv, e, b);
    return;
  }
  if (b.pt > len || onChase || bare) return;
  run(lv, e, b, pat);
}

/** On its chase: behind you, the level racing by. */
const chasing = (b: BossState) => b.style === 'pursuer' && b.phase === 0 && !b.overtook;
/** Its chase over, going round you to its spot at the head of the screen (out of reach meanwhile). */
const overtaking = (b: BossState) => b.overtook && b.phase === 0 && b.ss > HZ + 6;

/**
 * ARU-0's nineteen seconds: it stops in the middle of the field, turns to face Glacis and fights
 * on without a word (its ledger, printed blind down the field, a tick a second). Then a toll, and
 * it has been called: it isn't Vantorr's any more.
 */
function hush(lv: Level, e: Enemy, b: BossState) {
  const was = Math.ceil(b.hush);
  b.hush = Math.max(0, b.hush - DT);
  if (Math.ceil(b.hush) < was) lv.emit({ type: 'bossBeat', enemy: e.id, move: 'hush', k: Math.ceil(b.hush), x: e.x, z: e.z });
  if (b.hush > 0) return;
  b.called = true;
  b.name = 'RECOVERY UNIT';
  // it leads with the ballast now: Vantorr's hull is the first thing it throws away
  b.moves[2] = ['ballast', b.sig, 'ballast', 'lien'];
  b.moveN = 0;
  b.pt = 0;
  b.current = 0;
  b.shieldT = 1.2;
  for (const r of Object.keys(b.read) as Read[]) b.read[r] = 0;
  lv.emit({ type: 'bossBeat', enemy: e.id, move: 'called', k: 0, x: e.x, z: e.z });
}

/**
 * *Unbending* has decided: it blows the clans' plating and junk guns off itself, takes Khet into
 * its jaw like a cub, and from here fights the way it was built to. Everything is drawn, a full
 * second at least; it goes by the book (in order); it says nothing.
 */
function decide(lv: Level, e: Enemy, b: BossState) {
  b.called = true;
  b.name = DECIDES[lv.spec.planet.id];
  b.look = 'lattice';
  for (const r of Object.keys(b.read) as Read[]) b.read[r] = 0;
  lv.emit({ type: 'bossBeat', enemy: e.id, move: 'decided', k: 0, x: e.x, z: e.z });
}

/** Drifting about its home spot (or, on a chase, about the spot behind you). */
function home(lv: Level, e: Enemy, b: BossState) {
  // lighter for every plate it has thrown away
  const fast = (1 + b.phase * 0.35) * (1 + b.torn * 0.12);
  const chase = chasing(b);
  const px = lv.nearest(e.x, e.z)?.x ?? 0;
  // on a chase it drops back behind you round your side, not through you; overtaking, it goes
  // round you the same way
  const back = (chase && b.ss < CHASE_S - 6) || overtaking(b);
  const tx = back ? (px > 0 ? -1 : 1) * (HALF_W - 9) : chase ? clamp(px, -HALF_W + 10, HALF_W - 10) * 0.6 : b.hush > 0 ? 0 : Math.sin((e.t - 3.5) * 0.35 * fast) * (HALF_W - 18);
  const ts = chase ? CHASE_S : HZ + (b.hush > 0 ? 2 : Math.sin(e.t * 0.8) * 1.2);
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
  b.k = 0;
  // a string of moves starts here, now and then (not off the back of another)
  if (!b.comboed && b.combo <= 0 && !b.last && lv.rand() < COMBO[b.phase]) {
    b.combo = b.phase >= 2 && lv.rand() < 0.4 ? 2 : 1;
    lv.emit({ type: 'chain', enemy: e.id, n: 1, of: b.combo + 1 });
  }
  // in arrears, ARU-0 reels twice running
  if (m === 'lien' && b.phase === 1 && !b.last && !b.comboed && lv.spec.planet.id === 'cinder') {
    b.next = 'lien';
    if (b.combo <= 0) {
      b.combo = 1;
      lv.emit({ type: 'chain', enemy: e.id, n: 1, of: 2 });
    }
  }
  const p = lv.nearest(e.x, e.z);
  // boosting a lot: it aims where you're going, not where you are
  const lead = b.read.boost > READ_ACT ? 0.45 * b.read.boost : 0;
  const px = (p?.x ?? 0) + (p ? p.vx * lead : 0);
  const pz = (p?.z ?? lv.bottom - 8) + (p ? p.vz * lead : 0);
  const aim = Math.atan2(px - e.x, pz - e.z);
  e.aim = aim;
  const line = (len: number, w: number, lock: number, body = false): Tele => ({ shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(aim) * len, z2: e.z + Math.cos(aim) * len, w, lock, body });
  if (TWO_LOOKS.has(lv.spec.planet.id)) {
    // whose move it is: Khet's on a flare, until *Unbending* has decided
    b.look = b.called || UNBENDING.has(m) ? 'lattice' : 'scrap';
    b.turn = b.phase === 1 && !b.last ? defy(lv, e, b, m, px, pz) : null;
  }
  switch (m) {
    case 'charge':
    case 'rake':
    case 'lunge': {
      b.len = m === 'lunge' ? Math.max(14, e.z - pz + 8) : clamp(Math.hypot(px - e.x, pz - e.z) + 6, 16, 40);
      if (m === 'lunge') e.aim = Math.PI;
      go(lv, e, 'windup', 1.2, 'charge', m === 'lunge' ? { shape: 'line', x: e.x, z: e.z, x2: e.x, z2: e.z - b.len, w: e.r * 1.4, lock: 0.8, body: true } : line(b.len, e.r * 1.4, 0.8, true));
      break;
    }
    case 'slam':
      go(lv, e, 'windup', 0.9, 'slam', { shape: 'ring', x: e.x, z: e.z, r: 22, w: 1.2 });
      break;
    case 'ram':
      // the thrusters flare: the head's about to come down the line at you
      b.len = clamp(Math.hypot(px - e.x, pz - e.z) + RAM_PAST, 16, 42);
      go(lv, e, 'windup', 1.1 * slow(b), 'charge', line(b.len, e.r * 1.4, 0.75 * slow(b), true));
      break;
    case 'leap': {
      // the jaw drops and the head rears: where it'll come down is drawn on you, and follows you
      // until it locks
      b.mx = clamp(px, -HALF_W + LEAP_R, HALF_W - LEAP_R);
      b.ms = lane(lv, pz);
      go(lv, e, 'windup', 1.05 * slow(b), 'slam', { shape: 'circle', x: b.mx, z: lv.scroll + b.ms, r: LEAP_R, ground: false });
      break;
    }
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
      go(lv, e, 'windup', 0.6, 'shell', { shape: 'circle', x: px, z: pz, r: 3, ground: chasing(b) });
      break;
    case 'pursuit':
      // its lamps come up behind you: it's about to throw its claws over you, a row a beat
      b.dir = px > 0 ? -1 : 1;
      go(lv, e, 'windup', 0.9, 'shell', { shape: 'ring', x: e.x, z: e.z, r: 7, w: 1.5 });
      break;
    case 'lien':
      lienStart(lv, e, b);
      break;
    case 'ballast': {
      // it tears off a plate: the lane drawn from it through you, edge to edge
      const warn = tell(b, 1.15 * slow(b));
      e.aim = aim;
      b.len = laneLen(e.x, e.z, aim, lv);
      go(lv, e, 'windup', warn, 'slam', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(aim) * b.len, z2: e.z + Math.cos(aim) * b.len, w: BALLAST_R * 2, lock: warn * 0.6 });
      b.lanes.length = 0;
      for (const off of ballastLanes(b).slice(1)) {
        const l: Laser = { x: e.x, z: e.z, x2: e.x, z2: e.z, warn: warn + 0.05, on: 0.01, color: e.skin.colors[2], owner: e.id };
        lv.lasers.push(l);
        b.lanes.push(l);
        aimLane(lv, e, l, aim + off);
      }
      break;
    }
    case 'harpoon':
      go(lv, e, 'windup', 0.9, 'harpoon', line(60, 0.7, 0.6));
      break;
    case 'spores':
      go(lv, e, 'windup', 0.8, 'spores', { shape: 'ring', x: e.x, z: e.z, r: 26, w: 2 });
      break;
    case 'summon':
      go(lv, e, 'windup', 0.8, 'pulse', null);
      break;
    case 'screech':
      // how far the rings will reach
      go(lv, e, 'windup', 0.8, 'slam', { shape: 'ring', x: e.x, z: e.z, r: SCREECH_R, w: 1.2 });
      break;
    case 'gust':
      go(lv, e, 'windup', 0.9, 'pulse', { shape: 'ring', x: e.x, z: e.z, r: 12, w: 3 });
      break;
    case 'scan': {
      // its eye opens and reads the field: a beam that will sweep across from the side away from
      // you, broken at one distance (the reading ring, drawn: be on it as the beam goes by)
      b.k = 0;
      b.dir = px > e.x ? -1 : 1;
      b.ms = Math.hypot(px - e.x, pz - e.z) < 22 ? SCAN_FAR : SCAN_NEAR;
      e.aim = b.dir * SCAN_A;
      const warn = 1.25 * slow(b);
      scanBeams(lv, e, b, warn);
      go(lv, e, 'windup', warn, 'beam', scanRing(e, b));
      break;
    }
    case 'calve':
      // it shudders: ice cracks off it (the chunks are drawn where they'll land as they're thrown)
      go(lv, e, 'windup', 0.9 * slow(b), 'shell', { shape: 'ring', x: e.x, z: e.z, r: 9, w: 2 });
      break;
    case 'count':
      // its antennae lift: it's about to count the field
      go(lv, e, 'windup', Math.max(1, 1.1 * slow(b)), 'beam', { shape: 'ring', x: e.x, z: e.z, r: 6, w: 1.5 });
      break;
    case 'grasp': {
      // its arms reach out to both edges of your row: claws drawn all along it, closing on you
      const z = clamp(pz, lv.scroll - HALF_H + 6, lv.scroll + HALF_H - 4);
      const warn = Math.max(1, 1.15 * slow(b));
      graspRow(lv, e, px, z, warn);
      go(lv, e, 'windup', warn, 'slam', null);
      break;
    }
    default:
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
  if (b.next) {
    const m = b.next;
    b.next = null;
    return m;
  }
  const chase = CHASE[lv.spec.planet.id];
  if (chase && chasing(b)) return chase.moves[Math.floor(b.chaseT) % chase.moves.length];
  const list = b.moves[b.phase];
  // (called, ARU-0 keeps the Engine's order: it no longer answers you)
  if (b.phase === 0 || b.last || b.called) return list[b.moveN++ % list.length];
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
  // (a boss with its own tempo goes by that)
  const fast = b.tempo[0] === 1 ? (b.last ? 0.75 : b.phase >= 2 ? 0.88 : 1) : slow(b);
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
      // the titan's eye is slow to open: longer from the line settling to the beam
      const open = (b.look ? 1.25 : 1.1) * fast;
      lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 75, z2: e.z + Math.cos(e.aim) * 75, warn: open, on: eyeTime(b), color: col, owner: e.id });
      go(lv, e, 'windup', open, 'beam', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * 75, z2: e.z + Math.cos(e.aim) * 75, w: 2.2, lock: (b.look ? 0.55 : 0.7) * fast });
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
      go(lv, e, 'windup', tell(b, (b.k ? 0.75 : 1.15) * fast), 'torpedo', p ? { shape: 'lock', id: p.id } : null);
      break;
    }
    case 'irons': {
      // she calls, her bow-gunners answer on the beat: a line drawn for each iron, the first two
      // beats ahead and the rest a beat. The middle one leads you (where you're going); the
      // others are on you
      const p = lv.nearest(e.x, e.z);
      const lead = b.k === 1 && p ? 0.55 : 0;
      e.aim = Math.atan2(px + (p?.vx ?? 0) * lead - e.x, pz + (p?.vz ?? 0) * lead - e.z);
      b.len = IRON_LEN;
      const warn = (b.k ? 1 : 2) * beatOf(lv);
      go(lv, e, 'windup', warn, 'harpoon', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * IRON_LEN, z2: e.z + Math.cos(e.aim) * IRON_LEN, w: 0.9, lock: warn * 0.6 });
      break;
    }
    case 'breach': {
      // she sounds: noses down and goes under, and where she'll come up is drawn on you (it
      // follows you until it sets, a moment before she breaches)
      go(lv, e, 'windup', (b.k ? 0.75 : 1.0) * fast, 'slam', { shape: 'ring', x: px, z: pz, r: BREACH_R, w: 2 });
      break;
    }
    case 'broadside': {
      // she comes alongside you: out to your side of the field, turns her flank to you and runs
      // out her guns. The row she'll fire is drawn across the field, with its gap under her
      // waist (no guns at the queen's cabin): run with her, in the gap. Coming back (the tide),
      // she starts from where she ended
      const side = b.k === 0 ? (px > 0 ? 1 : -1) : -b.dir;
      b.dir = -side;
      b.mx = side * BROAD_X;
      go(lv, e, 'windup', (b.k ? 0.8 : 1.4) * fast, 'sweep', { shape: 'gate', x: -HALF_W, x2: HALF_W, z: e.z + 4, gx: b.mx, gap: BROAD_GAP });
      break;
    }
    case 'glassing':
      // *Unbending* raises its eye and plots the fire: the circles are drawn across the field one
      // by one, the Compact's way, and each air-bursts in turn into a cloud of molten glass
      b.plan = glassPlan(lv, b, px, pz);
      go(lv, e, 'windup', tell(b, 0.9 * fast), 'shell', { shape: 'ring', x: e.x, z: e.z, r: 7, w: 1.5 });
      break;
    case 'kneel':
      // it bows its head over Khet, and its shield is drawn round him, facing you
      e.aim = Math.atan2(px - e.x, pz - e.z);
      go(lv, e, 'windup', tell(b, 1 * fast), 'beam', { shape: 'ring', x: e.x, z: e.z, r: e.r + 2, w: 1 });
      break;
    case 'measure': {
      // a lane drawn in light from its eye through you, edge to edge: it follows you until it's
      // set, and then the eye burns straight down it (it doesn't follow: it measured you)
      e.aim = Math.atan2(px - e.x, pz - e.z);
      const warn = tell(b, (b.k ? 1.6 : 2) * beatOf(lv) * fast);
      const len = laneLen(e.x, e.z, e.aim, lv);
      const l: Laser = { x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * len, z2: e.z + Math.cos(e.aim) * len, warn, on: MEASURE_ON, color: LIGHT, owner: e.id };
      lv.lasers.push(l);
      b.lanes = [l];
      go(lv, e, 'windup', warn, 'beam', { shape: 'line', x: e.x, z: e.z, x2: l.x2, z2: l.z2, w: 2, lock: warn * 0.6 });
      break;
    }
  }
}

const CRANE_A = 1.15;
const craneLen = (b: BossState) => 16 + b.phase * 1.5;
const craneSwings = (b: BossState) => (b.last ? 4 : b.phase >= 2 ? 3 : 2);
const CRANE_P = 1.3;
/** Half asleep, one bar (two beams); stirring, the cross; in its last stand, six. */
const crossBeams = (b: BossState) => (b.last ? 6 : b.phase >= 1 ? 4 : 2);
const crossTime = (b: BossState) => (3.4 + b.phase * 0.4) * slow(b);
const eyeTime = (b: BossState) => (b.look ? 2.4 + b.phase * 0.25 : 3 + b.phase * 0.5);
const BREATH_R = 34;
/** Its signature, at least every this many moves (after the first phase). */
const SIG_EVERY = 3;
/** Seconds before it says the same read again. */
const READ_AGAIN = 14;
/** How long it's open between the moves of a string. */
const COMBO_BREATH = 0.45;
const BREATH_IN = 2.2;
const rakes = (b: BossState) => (b.last ? 3 : b.phase >= 1 ? 2 : 1);
const screechRings = (b: BossState) => (b.last ? 4 : b.phase >= 2 ? 3 : 2);
const SCREECH_R = 30;
const gustBeats = (b: BossState) => (b.last ? 4 : 3);
/** How hard a wing beat shoves you (units a second, for GUST_T seconds). */
const GUST_SHOVE = 26;
const GUST_T = 0.3;
const beatOf = (lv: Level) => BEAT[lv.spec.planet.id] ?? 0.45;
const repoShots = (b: BossState) => 2 + b.phase + (b.last ? 1 : 0);
const divePasses = (b: BossState) => (b.last ? 3 : b.phase >= 2 ? 2 : 1);

/** Istra's irons: how many she throws (three on the beat), how far and fast, and how long one is out before it's reeled home (the tide). */
const ironsN = (b: BossState) => (b.last ? 4 : 3);
const IRON_LEN = 60;
const IRON_V = 40;
const IRON_OUT = 0.75;
/** Her breach: the ring she comes up in, how long she's under, and how long she takes to rise. */
const BREACH_R = 8;
const BREACH_UNDER = 1.15;
const BREACH_RISE = 0.35;
const breaches = (b: BossState) => (b.last ? 3 : b.phase >= 2 ? 2 : 1);
/** Her broadside: where she starts (either side), how fast she sails, the gap (half its width) and the row's ball spacing. */
const BROAD_X = HALF_W - 10;
const BROAD_V = 13;
const BROAD_GAP = 4.6;
const BROAD_STEP = 1.8;
const broadPasses = (b: BossState) => (b.phase >= 2 ? 2 : 1);
/** The tide: from her third phase, everything she throws comes back to her. */
const tideOn = (b: BossState) => b.phase >= 2;
/** How long it stalls before it turns, and how fast it comes home. */
const EBB = 0.5;
const TIDE_V = 9;

/** How slowly it moves now (see TEMPO); ARU-0 quickens for every plate of company hull it throws off. */
const slow = (b: BossState) => (b.tempo[b.last ? 3 : b.phase] ?? 1) * (1 - b.torn * 0.05);
/** A tell's length: once ARU-0 has been called, every tell is drawn a full second (the Engine's way). */
const tell = (b: BossState, d: number) => (b.called ? Math.max(1, d) : d);

/** ARU-0's mines: they wait longer once it's in arrears. */
const repoMine = (lv: Level, b: BossState) => (lv.spec.planet.id === 'cinder' && b.phase >= 1 ? 2.4 : 1.6);

/** PURSUIT: rows of claws a move, how long each is in the air, the gap's half-width and how far it steps. */
const pursuitRows = (b: BossState) => (b.chaseT > 8 ? 4 : 3);
const CLAW_WARN = 1.05;
const CLAW_GAP = 4.4;
const CLAW_STEP = 9.5;
const CLAW_SPACE = 4.2;

/** A row of claws thrown over you to land on your row, with one gap (at you, then stepped to the side with room). */
function clawRow(lv: Level, e: Enemy, b: BossState) {
  const p = lv.nearest(e.x, e.z);
  const px = p?.x ?? 0;
  // (where you'll be on the screen when they land: the land moves under you on a chase)
  const z = (p?.z ?? lv.bottom - 8) - (chasing(b) ? lv.speedNow * CLAW_WARN : 0);
  let gx = px + (b.k % 2) * b.dir * CLAW_STEP;
  if (Math.abs(gx) > HALF_W - 6) gx = px - (b.k % 2) * b.dir * CLAW_STEP;
  gx = clamp(gx, -HALF_W + 6, HALF_W - 6);
  for (let x = -HALF_W + 1.5; x <= HALF_W - 1.5; x += CLAW_SPACE) {
    if (Math.abs(x - gx) < CLAW_GAP) continue;
    strike(lv, 'shell', x, z, { r: 2.1, warn: CLAW_WARN + Math.abs(x - gx) * 0.004, active: 0.45, sx: e.x + (lv.rand() - 0.5) * 4, sz: e.z, owner: e.id, color: e.skin.colors[1], air: !chasing(b) });
  }
}

/** LIEN: scrap a scrap lot its claws seize, how many lines at most, how few before it throws claws for more, how fast it reels and drifts, and how long it hauls at most. */
const LIEN_SCRAP = 2;
const LIEN_MAX = 9;
const lienMin = (b: BossState) => (b.last ? 6 : 3 + b.phase);
const LIEN_V = 6.5;
const LIEN_DRIFT = 4;
const LIEN_T = 5;
/** Where a line stops short of what it's reeling: come in behind the scrap and it's yours. */
const LIEN_GAP = 2.6;
/** A plate's worth of plating (a share of its hull), and the most it'll carry. */
const LIEN_PLATE = 0.014;
const LIEN_CAP = 8;
const TOW_COLOR = 0xffb04a;

/** The hold opens: lines to every loose scrap on the field, and claws thrown out for more if there's too little. */
function lienStart(lv: Level, e: Enemy, b: BossState) {
  const warn = tell(b, 1.2 * slow(b));
  letGo(b);
  b.dir = e.x > 0 ? -1 : 1;
  const loose = lv.pickups
    .filter((k) => k.kind === 'scrap' && !k.dead && !k.towed && lv.onScreen(k.x, k.z, -2))
    .sort((a, c) => (a.x - e.x) ** 2 + (a.z - e.z) ** 2 - ((c.x - e.x) ** 2 + (c.z - e.z) ** 2))
    .slice(0, LIEN_MAX);
  const line = (k: Pickup | null, x: number, z: number) => {
    const l: Laser = { x: e.x, z: e.z, x2: x, z2: z, warn: warn + 0.15, on: 99, color: TOW_COLOR, owner: e.id, tow: true };
    lv.lasers.push(l);
    b.tows.push({ k, x, z, l });
  };
  for (const k of loose) line(k, k.x, k.z);
  // too little on the field: it puts a lien on salvage, claws thrown down across it
  const n = Math.max(0, lienMin(b) - loose.length);
  for (let i = 0; i < n; i++) {
    const x = clamp(lerp(-HALF_W + 9, HALF_W - 9, (i + 0.5) / n) + (lv.rand() - 0.5) * 6, -HALF_W + 4, HALF_W - 4);
    const z = lv.scroll + lerp(-2, HALF_H - 8, lv.rand());
    strike(lv, 'shell', x, z, { r: 1.6, warn, active: 0.15, sx: e.x, sz: e.z, owner: e.id, color: TOW_COLOR, air: true });
    line(null, x, z);
  }
  towLines(lv, e, b);
  go(lv, e, 'windup', warn, 'beam', { shape: 'ring', x: e.x, z: e.z, r: 6, w: 1.5 });
}

/** Each line from its hold to what it holds, stopping short of it. */
function towLines(lv: Level, e: Enemy, b: BossState) {
  for (const t of b.tows) {
    const dx = t.x - e.x;
    const dz = t.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const len = Math.max(0.5, d - LIEN_GAP);
    t.l.x = e.x;
    t.l.z = e.z;
    t.l.x2 = e.x + (dx / d) * len;
    t.l.z2 = e.z + (dz / d) * len;
    t.l.r0 = Math.min(len - 0.1, e.r * 0.7);
  }
}

function dropLine(lv: Level, l: Laser) {
  const i = lv.lasers.indexOf(l);
  if (i >= 0) lv.lasers.splice(i, 1);
}

/** A scrap reeled home: bolted on as a plate (plating: the stream glances off it, a blow breaks it all off). */
function plate(lv: Level, e: Enemy, b: BossState) {
  if (b.plates < LIEN_CAP) {
    b.plates++;
    e.armour += e.max * LIEN_PLATE;
    e.armourMax = e.armour;
  }
  lv.emit({ type: 'bossBeat', enemy: e.id, move: 'lien', k: b.plates, x: e.x, z: e.z });
}

/** BALLAST: a plate's size, how fast it goes out and how much of that it comes back at, and how many plates of company hull it has to throw. */
const BALLAST_R = 1.9;
const BALLAST_V = 27;
const BALLAST_BACK = 0.8;
const TORN_MAX = 4;
/** Its lanes, as turns off the one through you: one, then two (the second leading) once it's lighter; every lane in its last stand. */
const ballastLanes = (b: BossState) => (b.last ? [0, -0.5, 0.5, -1.05, 1.05] : b.torn >= 2 ? [0, b.dir * 0.42] : [0]);

/** How far from (x, z) along angle a to the edge of the field. */
function laneLen(x: number, z: number, a: number, lv: Level) {
  const sx = Math.sin(a);
  const cz = Math.cos(a);
  const tx = sx > 0.001 ? (HALF_W - x) / sx : sx < -0.001 ? (-HALF_W - x) / sx : 999;
  const tz = cz > 0.001 ? (lv.bottom - z) / cz : cz < -0.001 ? (lv.top - z) / cz : 999;
  return Math.max(4, Math.min(tx, tz));
}

/** A lane drawn (as a beam that never burns) from it along angle a, edge to edge. */
function aimLane(lv: Level, e: Enemy, l: Laser, a: number) {
  const len = laneLen(e.x, e.z, a, lv);
  l.x = e.x;
  l.z = e.z;
  l.x2 = e.x + Math.sin(a) * len;
  l.z2 = e.z + Math.cos(a) * len;
}

/** KHET'S RAM: how far past you it carries, how fast, and the retro-burn that stops it (its thrusters fired back up the line: how many, how wide a fan, how fast, how far they go). */
const RAM_PAST = 7;
const RAM_V = 38;
const RETRO_N = 7;
const RETRO_FAN = 0.3;
const RETRO_V = 17;
const RETRO_LIFE = 0.95;
/** His leap: the ring it comes down in, when the ring stops following you (a share of the tell), how long it's in the air, how high it goes, and the junk thrown off where it lands (gaps where its thrusters are). */
const LEAP_R = 7;
const LEAP_LOCK = 0.62;
const LEAP_AIR = 0.5;
const LEAP_UP = 7;
const leapJunk = (b: BossState) => 16 + b.phase * 4;
/** The eye's glass: laid this far past where the beam crosses you, this far apart, this wide, burning this long. */
const GLASS_PAST = 7;
const GLASS_STEP = 2.8;
const GLASS_R = 1.6;
const glassBurn = (b: BossState) => 1.2 + b.phase * 0.3;
const GLASS = 0x4aff8a;
/** *Unbending*'s light (its tells, its lanes, its plan). */
const LIGHT = 0x4ae8ff;
/** The moves that are *Unbending*'s, not Khet's: drawn, never flared. */
const UNBENDING = new Set<BossMove>(['glassing', 'kneel', 'measure']);
/** Phase II: how long Khet's flare goes on before the light overrides it, and how often it does when Khet's call isn't reckless. */
const FLARE = 0.55;
const DEFY = 0.5;
/** THE GLASSING: the grid's columns and rows (screen z), a cloud's size, how long from drawn to burst, how fast the plan is drawn, how long a cloud burns. */
const GLASS_COLS = [-30, -18, -6, 6, 18, 30];
const glassRows = (b: BossState) => (b.last ? [-15, -4.5, 6, 16.5] : [-5, 5.5, 16]);
const CLOUD_R = 6.6;
const CLOUD_WARN = 1.35;
const CLOUD_DRAW = 0.085;
const cloudBurn = (b: BossState) => (b.phase >= 2 ? 3.4 : 2.6);
/** THE KNEEL: its shield's half-arc, how fast it turns after you, how long it kneels, and the lances down its middle (drawn two beats, burning this long). */
const KNEEL_GUARD = 0.55;
const KNEEL_TURN = 0.48;
const KNEEL_T = 6.2;
const LANCE_ON = 0.4;
/** THE MEASURE: lanes a time (two when it overrides a ram, three by the book), how long the eye burns down each. */
const measures = (b: BossState) => (b.phase >= 2 ? 3 : 2);
const MEASURE_ON = 0.7;

/**
 * Phase II: Khet calls a move and the thrusters flare for it; *Unbending* doesn't have to do it.
 * It won't when it's reckless (a ram into the edge of the field; a leap down on its own clans),
 * and now and then it just doesn't. What it does instead: a ram becomes THE MEASURE, a leap a
 * small GLASSING. (Never its signature, never his clans: those it lets him have.)
 */
function defy(lv: Level, e: Enemy, b: BossState, m: BossMove, px: number, pz: number): BossMove | null {
  if (m !== 'ram' && m !== 'leap') return null;
  let reckless = false;
  if (m === 'ram') {
    const a = Math.atan2(px - e.x, pz - e.z);
    const len = clamp(Math.hypot(px - e.x, pz - e.z) + RAM_PAST, 16, 42);
    reckless = Math.abs(e.x + Math.sin(a) * len) > HALF_W - 7 || e.z + Math.cos(a) * len > lv.bottom - 3;
  } else reckless = lv.enemies.some((o) => !o.dead && !o.boss && o.arch === 'ramjack' && Math.hypot(o.x - px, o.z - pz) < LEAP_R + 6);
  if (!reckless && lv.rand() >= DEFY) return null;
  return m === 'ram' ? 'measure' : 'glassing';
}

/** The flare has gone on long enough: the light is drawn over it, and the head does that instead. */
function override(lv: Level, e: Enemy, b: BossState) {
  const p = lv.nearest(e.x, e.z);
  b.move = b.turn!;
  b.lastMove = b.move;
  b.turn = null;
  b.look = 'lattice';
  b.k = 0;
  for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
  lv.emit({ type: 'bossBeat', enemy: e.id, move: 'defy', k: 0, x: e.x, z: e.z });
  startSig(lv, e, b, p?.x ?? 0, p?.z ?? lv.bottom - 8);
}

/**
 * The Glassing's plan: by the book, a grid of air-bursts over the field, row by row from the top,
 * with one way through it (a column a row, never more than one over from the row before, and the
 * bottom one near you). Overriding a leap, only five: one on you and four about it (go corner-wise).
 */
function glassPlan(lv: Level, b: BossState, px: number, pz: number) {
  const plan: { x: number; z: number }[] = [];
  if (!b.called && !b.last) {
    const z = lane(lv, pz);
    for (const [dx, dz] of [[0, -9], [-9, 0], [0, 0], [9, 0], [0, 9]])
      plan.push({ x: clamp(px + dx, -HALF_W + 3, HALF_W - 3), z: clamp(z + dz, -HALF_H + 4, HALF_H - 3) });
    return plan;
  }
  const rows = glassRows(b);
  const near = GLASS_COLS.reduce((k, x, i) => (Math.abs(x - px) < Math.abs(GLASS_COLS[k] - px) ? i : k), 0);
  const holes: number[] = [];
  holes[rows.length - 1] = clamp(near + Math.floor(lv.rand() * 3) - 1, 0, GLASS_COLS.length - 1);
  for (let r = rows.length - 2; r >= 0; r--) holes[r] = clamp(holes[r + 1] + Math.floor(lv.rand() * 3) - 1, 0, GLASS_COLS.length - 1);
  rows.forEach((z, r) => GLASS_COLS.forEach((x, c) => c !== holes[r] && plan.push({ x, z })));
  return plan;
}

/** The Engine's scan: how wide it sweeps (each side of straight down), the reading ring's two distances and its half-width. */
const SCAN_A = 1.2;
const SCAN_NEAR = 15;
const SCAN_FAR = 29;
const scanGap = (b: BossState) => (b.phase >= 2 ? 2.8 : b.phase >= 1 ? 3.2 : 3.6);
const scanPasses = (b: BossState) => (b.last ? 3 : b.phase >= 1 ? 2 : 1);
const scanSweep = (b: BossState) => 1.75 * slow(b);
/** Between passes it rests at the edge for a full second while the ring is drawn again. */
const SCAN_REST = 1.05;
const scanRing = (e: Enemy, b: BossState): Tele => ({ shape: 'ring', x: e.x, z: e.z, r: b.ms + scanGap(b), w: scanGap(b) * 2 });

/** Its scan beam at angle e.aim: in two pieces, either side of the reading ring. */
function scanBeams(lv: Level, e: Enemy, b: BossState, warn: number) {
  for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
  const g = scanGap(b);
  const col = e.skin.colors[2];
  const sx = Math.sin(e.aim);
  const cz = Math.cos(e.aim);
  lv.lasers.push({ x: e.x, z: e.z, x2: e.x + sx * (b.ms - g), z2: e.z + cz * (b.ms - g), warn, on: 99, color: col, owner: e.id });
  lv.lasers.push({ x: e.x, z: e.z, x2: e.x + sx * 80, z2: e.z + cz * 80, r0: b.ms + g, warn, on: 99, color: col, owner: e.id });
}

/** Ice chunks thrown off it: one on you, the rest about; each bursts into shards where it lands. */
function calveVolley(lv: Level, e: Enemy, b: BossState) {
  const p = lv.nearest(e.x, e.z);
  const px = p?.x ?? 0;
  const pz = p?.z ?? lv.bottom - 8;
  const n = 5;
  const a0 = lv.rand() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / (n - 1)) * Math.PI * 2;
    const off = k === 0 ? 0 : 7.5;
    const x = clamp(px + Math.cos(a) * off, -HALF_W + 3, HALF_W - 3);
    const z = clamp(pz + Math.sin(a) * off, lv.scroll - HALF_H + 4, lv.scroll + HALF_H - 3);
    strike(lv, 'shell', x, z, { r: 2.7, warn: 1.15 * slow(b) + k * 0.12, active: 0.15, sx: e.x + (lv.rand() - 0.5) * 6, sz: e.z, owner: e.id, color: ICE, air: true, shards: b.phase >= 1 ? 8 : 6 });
  }
}
const ICE = 0xbfe8ff;

/** How many it counts (its beams, from the outside in), and how many after are on you. */
const countAmps = (b: BossState) => (b.phase >= 2 ? [0.82, 0.58, 0.34, 0.1] : [0.8, 0.5, 0.2]);
const countAimed = (b: BossState) => (b.last ? 2 : b.phase >= 2 ? 1 : 0);
const countN = (b: BossState) => countAmps(b).length * 2 + countAimed(b);
/** Beats it holds the count, all lit, before they go out. */
const COUNT_HOLD = 1.5;

/** Claws all along a row, from both edges in, meeting at x. */
function graspRow(lv: Level, e: Enemy, x: number, z: number, warn: number) {
  for (const side of [-1, 1]) {
    const edge = side * (HALF_W - 3);
    const steps = Math.max(1, Math.floor(Math.abs(edge - x) / 4.4));
    for (let i = 0; i <= steps; i++) {
      const cx = lerp(edge, x, i / steps);
      strike(lv, 'slam', cx, z, { r: 2.6, warn: warn + i * (0.42 / steps), active: 0.2, air: true, owner: e.id, color: e.skin.colors[2] });
    }
  }
}

/** A rake turns where it ended up and comes back at you: the same line, a shorter tell. */
function rakeAgain(lv: Level, e: Enemy, b: BossState) {
  const p = lv.nearest(e.x, e.z);
  const px = p?.x ?? 0;
  const pz = p?.z ?? lv.bottom - 8;
  e.aim = Math.atan2(px - e.x, pz - e.z);
  b.len = clamp(Math.hypot(px - e.x, pz - e.z) + 6, 16, 40);
  b.gone = 0;
  go(lv, e, 'windup', 0.7, 'charge', { shape: 'line', x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * b.len, z2: e.z + Math.cos(e.aim) * b.len, w: e.r * 1.4, lock: 0.45, body: true });
}

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
      if ((m === 'charge' || m === 'rake' || m === 'harpoon' || m === 'ram') && e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.08);
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
    // Khet's flare, and then the light: *Unbending* won't
    if (b.turn && e.stateT >= FLARE * slow(b)) {
      override(lv, e, b);
      return;
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
    case 'rake':
    case 'ram':
    case 'lunge': {
      const sp = (m === 'lunge' ? 32 : m === 'rake' ? 36 : m === 'ram' ? RAM_V : 34) * (e.stun > 0 ? 0.3 : 1);
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
        const reel = b.parried || (edge && m !== 'lunge');
        // Khet's thrusters fired back to stop it: a fan of fire back up the line it came down
        if (m === 'ram' && !b.parried) retro(lv, e, b);
        // a rake turns and comes back at you (a shorter tell), unless it's reeling
        if (m === 'rake' && !reel && ++b.k < rakes(b)) rakeAgain(lv, e, b);
        else endMove(lv, e, b, reel ? 2.2 : m === 'lunge' ? 2 : 1.6, reel);
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
    case 'harpoon':
      if (e.grab >= 0) reel(lv, e, b);
      else if (!lv.strikes.some((k) => k.owner === e.id && k.kind === 'harpoon')) endMove(lv, e, b, 1.5);
      break;
    case 'skydive':
    case 'crane':
    case 'bloom':
    case 'cross':
    case 'eye':
    case 'breath':
    case 'screech':
    case 'gust':
    case 'scan':
    case 'calve':
    case 'count':
    case 'grasp':
    case 'irons':
    case 'breach':
    case 'broadside':
    case 'pursuit':
    case 'lien':
    case 'ballast':
    case 'leap':
    case 'glassing':
    case 'kneel':
    case 'measure':
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
    case 'scan':
    case 'calve':
    case 'count':
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
    case 'irons':
      // caught on the last one: no more thrown, she plays you on the line
      if (e.grab >= 0) {
        e.tele = null;
        go(lv, e, 'attack', 0, 'harpoon');
      } else if (b.k !== 1 && tl && tl.shape === 'line' && e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.1);
      break;
    case 'breach':
      // nose down, sinking; the ring on you
      e.y = lerp(FLIGHT_Y, -2, smooth(clamp(e.stateT / e.stateDur, 0, 1)));
      breachRing(lv, e, b, true);
      break;
    case 'lien':
      // the hold open, the lines drawn to everything it'll take
      towLines(lv, e, b);
      break;
    case 'ballast':
      // the lane follows you until it locks
      if (tl && tl.shape === 'line') {
        if (e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.08);
        b.len = laneLen(e.x, e.z, e.aim, lv);
        tl.x = e.x;
        tl.z = e.z;
        tl.x2 = e.x + Math.sin(e.aim) * b.len;
        tl.z2 = e.z + Math.cos(e.aim) * b.len;
        const offs = ballastLanes(b);
        b.lanes.forEach((l, k) => aimLane(lv, e, l, e.aim + offs[k + 1]));
      }
      break;
    case 'leap': {
      // rearing; the ring on you until it locks
      const u = clamp(e.stateT / e.stateDur, 0, 1);
      e.y = FLIGHT_Y + smooth(u) * 1.5;
      if (p && u < LEAP_LOCK) {
        b.mx += (clamp(p.x, -HALF_W + LEAP_R, HALF_W - LEAP_R) - b.mx) * Math.min(1, DT * 8);
        b.ms += (lane(lv, p.z) - b.ms) * Math.min(1, DT * 8);
      }
      if (tl && tl.shape === 'circle') {
        tl.x = b.mx;
        tl.z = lv.scroll + b.ms;
      }
      break;
    }
    case 'kneel':
      // bowing: its shield drawn up round Khet as it goes down
      e.guard = KNEEL_GUARD * clamp(e.stateT / e.stateDur / 0.5, 0, 1);
      kneelTurn(lv, e);
      if (tl && tl.shape === 'ring') {
        tl.x = e.x;
        tl.z = e.z;
      }
      break;
    case 'measure': {
      // the lane follows you until it's set
      const l = b.lanes[0];
      if (tl && tl.shape === 'line' && e.stateT < tl.lock) e.aim = lerpAngle(e.aim, lv.aim(e.x, e.z), 0.07);
      if (l) aimLane(lv, e, l, e.aim);
      if (l && tl && tl.shape === 'line') {
        tl.x = e.x;
        tl.z = e.z;
        tl.x2 = l.x2;
        tl.z2 = l.z2;
      }
      break;
    }
    case 'glassing':
      if (tl && tl.shape === 'ring') {
        tl.x = e.x;
        tl.z = e.z;
      }
      break;
    case 'broadside':
      // out to her side, the row drawn with her
      b.sx = lerp(b.sx, b.mx, 0.06);
      b.ss = lerp(b.ss, HZ, 0.06);
      if (tl && tl.shape === 'gate') {
        tl.gx = b.sx;
        tl.z = e.z + 4;
      }
      break;
  }
}

/** The ring she'll come up in: on you until it sets (a moment before she breaches), and her under it. */
function breachRing(lv: Level, e: Enemy, b: BossState, follow: boolean) {
  const tl = e.tele;
  const p = lv.nearest(e.x, e.z);
  if (!tl || tl.shape !== 'ring') return;
  if (follow && p) {
    tl.x += (p.x - tl.x) * Math.min(1, DT * 7);
    tl.z += (p.z - tl.z) * Math.min(1, DT * 7);
  }
  tl.x = clamp(tl.x, -HALF_W + BREACH_R, HALF_W - BREACH_R);
  tl.z = lv.scroll + clamp(tl.z - lv.scroll, -HALF_H + BREACH_R, HALF_H - BREACH_R);
  if (b.under) {
    b.sx = tl.x;
    b.ss = tl.z - lv.scroll;
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
        for (const s of [-1, 1]) lv.bullet(b.mx + Math.cos(a) * s * 5, b.ms - Math.sin(a) * s * 5, 0, 0, { kind: 'mine', r: 0.7, life: repoMine(lv, b), ...mineRing(lv, e, 6), color: col });
      // ARU-0 seizes what's there: a lot of scrap left where you were (its Lien comes for it next)
      if (lv.spec.planet.id === 'cinder') {
        lv.drop('scrap', b.mx, b.ms, LIEN_SCRAP);
        const k = lv.pickups[lv.pickups.length - 1];
        k.vx = k.vz = 0;
      }
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
    case 'scan': {
      const n = scanPasses(b);
      go(lv, e, 'attack', n * scanSweep(b) + (n - 1) * SCAN_REST, 'beam');
      return true;
    }
    case 'calve': {
      // a second volley a second later, once it's stirring
      b.k = 0;
      b.fire = 0;
      go(lv, e, 'attack', b.phase >= 1 ? 1.1 : 0.1, 'shell');
      e.tele = null;
      return true;
    }
    case 'count': {
      // a beat for each it counts, two more for the last to be drawn and burn, then it holds them
      // a moment before they all go out
      b.k = 0;
      b.fire = 0;
      b.dir = px > e.x ? 1 : -1;
      const beat = beatOf(lv);
      go(lv, e, 'attack', (countN(b) + 1 + COUNT_HOLD) * beat, 'beam');
      e.tele = null;
      return true;
    }
    case 'grasp':
      go(lv, e, 'attack', 0.75, 'slam');
      return true;
    case 'irons': {
      // HO: the iron flies down its line
      const s = strike(lv, 'harpoon', e.x, e.z, { vx: Math.sin(e.aim) * IRON_V, vz: Math.cos(e.aim) * IRON_V, active: 1.6, warn: 0, owner: e.id, effect: 'latch', air: true, color: col });
      if (tideOn(b)) onTide(lv, b, s, IRON_OUT);
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'irons', k: b.k, x: e.x, z: e.z });
      b.k++;
      b.gone = 0;
      if (b.k < ironsN(b)) startSig(lv, e, b, px, pz);
      else {
        go(lv, e, 'attack', 0, 'harpoon');
        e.tele = null;
      }
      return true;
    }
    case 'pursuit':
      b.k = 0;
      b.fire = 0;
      go(lv, e, 'attack', 0, 'shell');
      e.tele = null;
      return true;
    case 'lien':
      // the claws it threw have landed: what they hold is its now, and it reels the lot in
      for (const t of b.tows) {
        if (!t.k) {
          lv.drop('scrap', t.x, t.z, LIEN_SCRAP);
          t.k = lv.pickups[lv.pickups.length - 1];
          t.k.vx = t.k.vz = 0;
        }
        t.k.towed = true;
      }
      b.k = 0;
      go(lv, e, 'attack', 0, 'beam');
      e.tele = null;
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'reel', k: b.tows.length, x: e.x, z: e.z });
      return true;
    case 'ballast': {
      // down every lane: a plate of its hull, thrown flat; it comes back from the edge
      for (const l of b.lanes) {
        const i = lv.lasers.indexOf(l);
        if (i >= 0) lv.lasers.splice(i, 1);
      }
      b.lanes.length = 0;
      for (const off of ballastLanes(b)) {
        const a = e.aim + off;
        const s = strike(lv, 'plate', e.x + Math.sin(a) * e.r * 0.6, e.z + Math.cos(a) * e.r * 0.6, {
          r: BALLAST_R,
          warn: 0,
          active: 99,
          vx: Math.sin(a) * BALLAST_V,
          vz: Math.cos(a) * BALLAST_V,
          owner: e.id,
          color: col,
          air: true,
        });
        b.thrown.push({ s, back: false });
      }
      // what it throws: a plate its Liens bolted on, else its own company hull
      if (b.plates > 0) {
        e.armour = Math.max(0, e.armour - e.armour / b.plates);
        b.plates--;
      } else if (b.torn < TORN_MAX) {
        b.torn++;
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'tear', k: b.torn, x: e.x, z: e.z });
      }
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'ballast', k: b.thrown.length, x: e.x, z: e.z });
      go(lv, e, 'attack', 0, 'slam');
      e.tele = null;
      return true;
    }
    case 'leap':
      // up and over: it flies to the ring and comes down in it
      b.from = { x: b.sx, z: b.ss };
      b.gone = 0;
      go(lv, e, 'attack', LEAP_AIR, 'slam');
      return true;
    case 'glassing':
      b.k = 0;
      b.fire = 0;
      go(lv, e, 'attack', b.plan.length * CLOUD_DRAW + 0.3, 'shell');
      e.tele = null;
      return true;
    case 'kneel':
      // the first lance a beat in; then one every two
      b.k = 0;
      b.fire = beatOf(lv);
      e.guard = KNEEL_GUARD;
      go(lv, e, 'attack', KNEEL_T * slow(b), 'beam');
      e.tele = null;
      return true;
    case 'measure':
      b.lanes.length = 0;
      go(lv, e, 'attack', MEASURE_ON, 'beam');
      e.tele = null;
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'measure', k: b.k, x: e.x, z: e.z });
      return true;
    case 'breach':
      // under: the ring keeps on you a while, then sets, and up she comes
      b.under = true;
      go(lv, e, 'attack', BREACH_UNDER + BREACH_RISE, 'slam');
      return true;
    case 'broadside':
      go(lv, e, 'attack', (2 * BROAD_X) / BROAD_V, 'sweep');
      return true;
    case 'screech':
    case 'gust': {
      // the first beat straight away, the rest on the beat after it
      b.k = 0;
      b.ms = 0;
      b.angle = lv.aim(e.x, e.z);
      // the gust's second gap is on the side with more room
      b.dir = px > e.x ? -1 : 1;
      const n = b.move === 'screech' ? screechRings(b) : gustBeats(b);
      const gap = beatOf(lv) * (b.move === 'gust' ? 2 : 1);
      go(lv, e, 'attack', (n - 1) * gap + 0.35, KIND[b.move]);
      e.tele = null;
      return true;
    }
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
        lv.bullet(b.sx, e.z, 0, 0, { kind: 'mine', r: 0.7, life: 1.1 + lv.rand() * 0.4, ...mineRing(lv, e, b.phase >= 1 ? 6 : 4), color: col });
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
          const r = pattern(lv, e, 'ring', SHARE.boss);
          const n = Math.min(7 + b.phase, r.n);
          for (let k = 0; k < n; k++) lv.shoot(b.ball.x, b.ball.z, (k / n) * Math.PI * 2 + b.k, r.speed, { color: col, kind: 'big', r: 0.6 });
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
        const sp = pattern(lv, e, 'spiral', SHARE.boss);
        b.fire = Math.max(0.11, sp.every);
        b.angle += b.dir * Math.min(0.14, sp.spin * b.fire);
        const arms = Math.min(7, 5 + b.phase, sp.arms);
        for (let k = 0; k < arms; k++) lv.shoot(e.x, e.z, b.angle + (k / arms) * Math.PI * 2, sp.speed, { color: col, kind: 'spore', r: 0.5 });
      }
      if (over(e)) endMove(lv, e, b, 1.8);
      break;
    }
    case 'cross': {
      // half asleep, a slow quarter turn; awake, it stops halfway for a beat (a click) and turns
      // most of the way back
      const n = crossBeams(b);
      const turn = Math.PI / 2 + b.phase * (Math.PI / 6);
      const u = clamp(e.stateT / e.stateDur, 0, 1);
      let f = u;
      if (b.phase >= 2) {
        f = u < 0.45 ? u / 0.45 : u < 0.55 ? 1 : 1 - ((u - 0.55) / 0.45) * 0.7;
        if (b.k === 0 && u >= 0.45) {
          b.k = 1;
          lv.emit({ type: 'bossBeat', enemy: e.id, move: 'cross', k: 0, x: e.x, z: e.z });
        }
      }
      aimBeams(lv, e, b.angle + b.dir * turn * f, n);
      if (over(e)) {
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        endMove(lv, e, b, 1.9);
      }
      break;
    }
    case 'eye': {
      // it follows you, slower than you can fly: keep moving (Khet's titan is heavier about it)
      const rate = (b.look ? 0.34 + b.phase * 0.09 : 0.42 + b.phase * 0.12) + (b.last ? 0.15 : 0);
      const want = lv.aim(e.x, e.z);
      const da = Math.atan2(Math.sin(want - e.aim), Math.cos(want - e.aim));
      e.aim += clamp(da, -rate * DT, rate * DT);
      aimBeams(lv, e, e.aim, 1);
      // Khet's eye glasses the ground at its foot, just past you: keep moving round it, don't back off
      if (TWO_LOOKS.has(lv.spec.planet.id) && p) layGlass(lv, e, b, Math.hypot(p.x - e.x, p.z - e.z) + GLASS_PAST);
      if (over(e)) {
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        endMove(lv, e, b, 2.1);
      }
      break;
    }
    case 'screech': {
      // rings of sound on the beat: dash through each
      b.fire -= DT;
      if (b.fire <= 0 && b.k < screechRings(b)) {
        b.fire += beatOf(lv);
        strike(lv, 'wave', e.x, e.z, { v: 15, w: 1.1, rMax: SCREECH_R, warn: 0, active: 3, air: true, owner: e.id, color: col });
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'screech', k: b.k++, x: e.x, z: e.z });
      }
      if (over(e)) endMove(lv, e, b, 1.4);
      break;
    }
    case 'gust': {
      // a wing beat every two beats: a shove down the screen and a row of feathers with one gap,
      // first where you are, then on the side with more room, then back
      b.fire -= DT;
      if (b.fire <= 0 && b.k < gustBeats(b)) {
        b.fire += beatOf(lv) * 2;
        b.ms = GUST_T;
        const gap = b.angle + (b.k % 2) * b.dir * 0.55;
        // (a fan: no denser than the table's)
        const f = pattern(lv, e, 'fan', SHARE.boss);
        const step = Math.max(0.085, 2.3 / Math.max(1, f.n - 1));
        for (let a = -1.15; a <= 1.15; a += step) {
          if (Math.abs(b.angle + a - gap) < 0.17) continue;
          lv.shoot(e.x, e.z + 2, b.angle + a, f.speed, { color: col, kind: 'needle', r: 0.4 });
        }
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'gust', k: b.k++, x: e.x, z: e.z });
      }
      if (b.ms > 0) {
        b.ms -= DT;
        for (const q of lv.players) {
          if (q.down || q.dashT > 0) continue;
          const dx = q.x - e.x;
          const dz = q.z - e.z;
          const dl = Math.hypot(dx, dz) || 1;
          if (dl > 45) continue;
          q.x += (dx / dl) * GUST_SHOVE * (1 - 0.5 * q.boosting) * DT;
          q.z += (dz / dl) * GUST_SHOVE * (1 - 0.5 * q.boosting) * DT;
        }
      }
      if (over(e)) endMove(lv, e, b, 1.8);
      break;
    }
    case 'scan': {
      // across, and (stirring) back: between passes it rests at the edge for a full second while
      // the ring is drawn again somewhere else (near to far, far to near)
      const sw = scanSweep(b);
      const per = sw + SCAN_REST;
      const n = scanPasses(b);
      const pass = Math.min(n - 1, Math.floor(e.stateT / per));
      const local = e.stateT - pass * per;
      const from = (pass % 2 ? -1 : 1) * b.dir * SCAN_A;
      e.aim = local <= sw ? lerp(from, -from, smooth(clamp(local / sw, 0, 1))) : -from;
      if (local > sw && pass < n - 1 && b.k === pass) {
        b.k = pass + 1;
        b.ms = b.ms === SCAN_NEAR ? SCAN_FAR : SCAN_NEAR;
        scanBeams(lv, e, b, SCAN_REST - (local - sw));
        e.tele = scanRing(e, b);
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'scan', k: b.k, x: e.x, z: e.z });
      }
      const g = scanGap(b);
      let i = 0;
      for (const l of lv.lasers)
        if (l.owner === e.id) {
          const len = i++ === 0 ? b.ms - g : 80;
          l.x2 = l.x + Math.sin(e.aim) * len;
          l.z2 = l.z + Math.cos(e.aim) * len;
        }
      if (e.tele && e.tele.shape === 'ring') {
        e.tele.x = e.x;
        e.tele.z = e.z;
      }
      if (over(e)) {
        for (let k = lv.lasers.length - 1; k >= 0; k--) if (lv.lasers[k].owner === e.id) lv.lasers.splice(k, 1);
        e.tele = null;
        endMove(lv, e, b, 1.7);
      }
      break;
    }
    case 'calve': {
      b.fire -= DT;
      if (b.fire <= 0 && b.k < (b.phase >= 1 ? 2 : 1)) {
        b.fire += 1;
        b.k++;
        calveVolley(lv, e, b);
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'calve', k: b.k - 1, x: e.x, z: e.z });
      }
      if (over(e)) endMove(lv, e, b, 1.6);
      break;
    }
    case 'count': {
      // a beam for every beat, outside in, one side then the other: each drawn two beats (a second)
      // before it burns, and each burns on until the count is done. Awake, it counts you last.
      const beat = beatOf(lv);
      const amps = countAmps(b);
      const n = countN(b);
      const col = e.skin.colors[2];
      b.fire -= DT;
      if (b.fire <= 0 && b.k < n) {
        b.fire += beat;
        const k = b.k++;
        const a = k < amps.length * 2 ? (k % 2 ? -1 : 1) * b.dir * amps[k >> 1] : lv.aim(e.x, e.z);
        lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(a) * 80, z2: e.z + Math.cos(a) * 80, warn: 2 * beat, on: 99, color: col, owner: e.id });
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'count', k, x: e.x, z: e.z });
      }
      if (over(e)) {
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'count', k: -1, x: e.x, z: e.z });
        endMove(lv, e, b, 1.8);
      }
      break;
    }
    case 'grasp': {
      // in its last stand it reaches again, a row on from wherever you went
      if (b.last && b.k === 0 && e.stateT > 0.3) {
        b.k = 1;
        const p = lv.nearest(e.x, e.z);
        graspRow(lv, e, p?.x ?? 0, clamp(p?.z ?? lv.bottom - 8, lv.scroll - HALF_H + 6, lv.scroll + HALF_H - 4), 1);
        e.stateDur += 1.2;
      }
      if (over(e)) endMove(lv, e, b, 2);
      break;
    }
    case 'irons':
      // played on her line; or watching her irons fly (and, on the tide, come home)
      if (e.grab >= 0) reel(lv, e, b);
      else if (!lv.strikes.some((k) => k.owner === e.id && k.kind === 'harpoon' && !k.dead)) endMove(lv, e, b, 1.6);
      break;
    case 'breach': {
      const rise = e.stateDur - BREACH_RISE;
      if (e.stateT < rise) {
        e.y = -6;
        e.shielded = true;
        breachRing(lv, e, b, e.stateT < rise - 0.45);
      } else {
        if (b.under) {
          // up through the ring: a slam where she breaks the surface, and the sea thrown off her
          // in a ring (from the second phase: dash through it, or be well clear)
          b.under = false;
          const tl = e.tele;
          const x = tl && tl.shape === 'ring' ? tl.x : e.x;
          const z = tl && tl.shape === 'ring' ? tl.z : e.z;
          strike(lv, 'slam', x, z, { r: BREACH_R, warn: 0, active: 0.3, air: true, owner: e.id, color: col });
          if (b.phase >= 1) strike(lv, 'wave', x, z, { v: 14, w: 1.2, rMax: 26, warn: 0.1, active: 3, air: true, owner: e.id, color: col });
          e.tele = null;
          lv.emit({ type: 'bossBeat', enemy: e.id, move: 'breach', k: b.k, x, z });
        }
        e.y = lerp(-6, FLIGHT_Y, smooth(clamp((e.stateT - rise) / BREACH_RISE, 0, 1)));
      }
      if (over(e)) {
        e.y = FLIGHT_Y;
        // on the tide she goes straight back under where she came up, and comes up where you went
        if (++b.k < breaches(b)) startSig(lv, e, b, p?.x ?? 0, p?.z ?? 0);
        // wallowing where she came up, in the open
        else endMove(lv, e, b, 2.4);
      }
      break;
    }
    case 'broadside': {
      // she sails across, firing the row every other beat; the gap rides under her waist
      b.sx += b.dir * BROAD_V * (e.stun > 0 ? 0.4 : 1) * DT;
      b.ss += (HZ - b.ss) * Math.min(1, DT * 3);
      b.fire -= DT;
      if (b.fire <= 0) {
        b.fire += 2 * beatOf(lv);
        const w = pattern(lv, e, 'wall', SHARE.boss);
        const gap = Math.max(BROAD_GAP, w.hole / 2);
        for (let x = -HALF_W + 0.9; x <= HALF_W; x += Math.max(BROAD_STEP, w.spacing)) {
          if (Math.abs(x - b.sx) < gap) continue;
          lv.shoot(x, e.z + 3, 0, w.speed, { color: col, r: 0.45 });
        }
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'broadside', k: b.k, x: b.sx, z: e.z });
      }
      const tl = e.tele;
      if (tl && tl.shape === 'gate') {
        tl.gx = b.sx;
        tl.z = e.z + 4;
      }
      if (over(e) || Math.abs(b.sx) > BROAD_X + 1) {
        b.sx = clamp(b.sx, -BROAD_X, BROAD_X);
        // the tide: back the other way
        if (++b.k < broadPasses(b)) startSig(lv, e, b, p?.x ?? 0, p?.z ?? 0);
        else endMove(lv, e, b, 2.0);
      }
      break;
    }
    case 'pursuit': {
      // a row of claws a beat, thrown over you from behind to land on your row: one gap in each,
      // stepping to the side with room and back (weave)
      const rows = pursuitRows(b);
      b.fire -= DT;
      if (b.fire <= 0 && b.k < rows) {
        b.fire += 2 * beatOf(lv);
        clawRow(lv, e, b);
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'pursuit', k: b.k++, x: e.x, z: e.z });
      }
      if (b.k >= rows && b.fire < -CLAW_WARN) endMove(lv, e, b, 0.9);
      break;
    }
    case 'lien': {
      // reeling: drifting across the top as it hauls, so its lines swing; each scrap that reaches
      // its hold is bolted on as a plate
      const v = LIEN_V + b.phase * 1.5 + (b.last ? 2 : 0);
      b.sx += b.dir * LIEN_DRIFT * (1 + b.phase * 0.3) * DT;
      if (Math.abs(b.sx) > HALF_W - 10) {
        b.sx = Math.sign(b.sx) * (HALF_W - 10);
        b.dir = -Math.sign(b.sx);
      }
      for (const t of b.tows) {
        const k = t.k;
        if (!k || k.dead) {
          // taken from under it (you flew in behind it): the line goes slack
          t.k = null;
          dropLine(lv, t.l);
          lv.emit({ type: 'bossBeat', enemy: e.id, move: 'snap', k: 0, x: t.x, z: t.z });
          continue;
        }
        const dx = e.x - k.x;
        const dz = e.z - k.z;
        const d = Math.hypot(dx, dz) || 1;
        if (d < e.r * 0.8) {
          k.dead = true;
          t.k = null;
          dropLine(lv, t.l);
          plate(lv, e, b);
          continue;
        }
        k.x += (dx / d) * v * DT;
        k.z += (dz / d) * v * DT;
        t.x = k.x;
        t.z = k.z;
      }
      b.tows = b.tows.filter((t) => t.k);
      towLines(lv, e, b);
      if (!b.tows.length || e.stateT > LIEN_T) {
        for (const t of b.tows) dropLine(lv, t.l);
        letGo(b);
        endMove(lv, e, b, 1.6);
      }
      break;
    }
    case 'ballast': {
      // out to the edge, and back: flat down its lane and home again, a little slower
      for (const w of b.thrown) {
        const s = w.s;
        if (s.dead) continue;
        if (!w.back) {
          const out = Math.abs(s.x) > HALF_W - BALLAST_R || s.z < lv.top + BALLAST_R || s.z > lv.bottom - BALLAST_R;
          if (!out) continue;
          w.back = true;
          s.vx = -s.vx * BALLAST_BACK;
          s.vz = -s.vz * BALLAST_BACK;
          lv.emit({ type: 'bossBeat', enemy: e.id, move: 'bounce', k: 0, x: s.x, z: s.z });
        } else if (Math.hypot(e.x - s.x, e.z - s.z) < e.r * 0.8) {
          s.dead = true;
          lv.emit({ type: 'bossBeat', enemy: e.id, move: 'catch', k: 0, x: s.x, z: s.z });
        }
      }
      b.thrown = b.thrown.filter((w) => !w.s.dead);
      if (!b.thrown.length || e.stateT > 5) {
        for (const w of b.thrown) w.s.dead = true;
        b.thrown.length = 0;
        endMove(lv, e, b, 1.8);
      }
      break;
    }
    case 'leap': {
      // in the air (out of reach), coming down in the ring
      const u = clamp(e.stateT / e.stateDur, 0, 1);
      b.sx = lerp(b.from.x, b.mx, smooth(u));
      b.ss = lerp(b.from.z, b.ms, smooth(u));
      e.y = FLIGHT_Y + 1.5 + Math.sin(u * Math.PI) * LEAP_UP - u * 1.5;
      if (over(e)) {
        e.y = FLIGHT_Y;
        const x = e.x;
        const z = lv.scroll + b.ss;
        strike(lv, 'slam', x, z, { r: LEAP_R, warn: 0, active: 0.3, air: true, owner: e.id, color: col });
        // the junk shaken off it as it lands, in a ring: no junk where its thrusters are (either side)
        const r = pattern(lv, e, 'ring', SHARE.boss);
        const n = Math.min(leapJunk(b), r.n);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          if (Math.abs(Math.cos(a)) < 0.2) continue;
          lv.shoot(x, z, a, r.speed * (k % 2 ? 1 : 0.82), { color: JUNK, kind: 'big', r: 0.55 });
        }
        e.tele = null;
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'land', k: 0, x, z });
        // down where you were: winded, close
        endMove(lv, e, b, 1.5);
      }
      break;
    }
    case 'glassing': {
      // the plan drawn circle by circle, each bursting into glass when its time comes
      b.fire -= DT;
      while (b.fire <= 0 && b.plan.length) {
        b.fire += CLOUD_DRAW;
        const c = b.plan.shift()!;
        strike(lv, 'puddle', c.x, lv.scroll + c.z, { r: CLOUD_R, warn: CLOUD_WARN * slow(b), active: cloudBurn(b), air: true, owner: e.id, color: LIGHT });
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'plot', k: b.k++, x: c.x, z: lv.scroll + c.z });
      }
      if (over(e)) endMove(lv, e, b, 2.2);
      break;
    }
    case 'kneel': {
      // the shield follows you, slower than you fly; and down its middle, the eye, every two beats
      kneelTurn(lv, e);
      b.fire -= DT;
      if (b.fire <= 0) {
        b.fire += 2 * beatOf(lv);
        const len = laneLen(e.x, e.z, e.aim, lv);
        lv.lasers.push({ x: e.x, z: e.z, x2: e.x + Math.sin(e.aim) * len, z2: e.z + Math.cos(e.aim) * len, warn: 2 * beatOf(lv) * 0.9, on: LANCE_ON, color: LIGHT, owner: e.id });
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'lance', k: b.k++, x: e.x, z: e.z });
      }
      if (over(e)) {
        e.guard = 0;
        for (let i = lv.lasers.length - 1; i >= 0; i--) if (lv.lasers[i].owner === e.id) lv.lasers.splice(i, 1);
        lv.emit({ type: 'bossBeat', enemy: e.id, move: 'rise', k: 0, x: e.x, z: e.z });
        endMove(lv, e, b, 1.8);
      }
      break;
    }
    case 'measure':
      // and the next lane, from where you went; by the book, three
      if (over(e)) {
        if (++b.k < measures(b) + (b.last ? 1 : 0)) startSig(lv, e, b, p?.x ?? 0, p?.z ?? 0);
        else endMove(lv, e, b, 1.7);
      }
      break;
    case 'breath': {
      // in: everything near is drawn to her intake (boost against it; a dash is free of it)
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
        // (a fan in rows, the last at the table's speed and the first ones slower; each row's
        // bubbles sit in the gaps of the one before: weave through)
        const f = pattern(lv, e, 'fan', SHARE.boss);
        for (let r = 0; r < rows; r++) {
          const n = Math.min(8, f.n);
          const step = 1.9 / n;
          for (let k = 0; k < n; k++) {
            const o = lv.shoot(e.x, e.z + 2, a + (k - (n - 1) / 2 + (r % 2) * 0.5) * step, (f.speed * (6 + r * 1.8)) / (6 + (rows - 1) * 1.8), { color: col, kind: 'big', r: 0.7 });
            // on the tide, the wall comes back to her, the far rows first
            if (tideOn(b)) onTide(lv, b, o, 2.6 - r * 0.2);
          }
        }
        lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
        endMove(lv, e, b, 2.3);
      }
      break;
    }
  }
}

/** A mine's ring: at most `n`, and the ring family's (a boss's) count and speed. */
function mineRing(lv: Level, e: Enemy, n: number) {
  const r = pattern(lv, e, 'ring', SHARE.boss);
  return { split: Math.min(n, r.n), splitV: r.speed };
}

/** Khet's junk, thrown off the head. */
const JUNK = 0xff7a2a;

/** The ram stopped by its thrusters: a fan of fire straight back up the line it came down. */
function retro(lv: Level, e: Enemy, b: BossState) {
  const a = e.aim + Math.PI;
  const f = pattern(lv, e, 'fan', SHARE.boss);
  const n = Math.max(2, Math.min(RETRO_N, f.n));
  // (it reaches as far as it did, however fast it flies)
  const reach = lv.fireSpeed(RETRO_V) * RETRO_LIFE;
  for (let k = 0; k < n; k++) {
    const off = (k / (n - 1) - 0.5) * 2 * RETRO_FAN;
    const v = f.speed * (k % 2 ? 1 : 0.85);
    lv.shoot(b.sx, lv.scroll + b.ss, a + off, v, { color: JUNK, kind: 'big', r: 0.6, life: reach / v });
  }
  lv.emit({ type: 'bossBeat', enemy: e.id, move: 'retro', k: 0, x: b.sx, z: lv.scroll + b.ss });
}

/** Kneeling, its shield (and its eye, down the shield's middle) turns after you, slower than you fly. */
function kneelTurn(lv: Level, e: Enemy) {
  const want = lv.aim(e.x, e.z);
  const da = Math.atan2(Math.sin(want - e.aim), Math.cos(want - e.aim));
  e.aim += clamp(da, -KNEEL_TURN * DT, KNEEL_TURN * DT);
}

/** Glass laid where the eye's beam is `d` out from it (just past you), spaced along the way it's gone. */
function layGlass(lv: Level, e: Enemy, b: BossState, d: number) {
  const x = e.x + Math.sin(e.aim) * d;
  const z = e.z + Math.cos(e.aim) * d;
  if (e.stateT < 0.25 || Math.hypot(x - b.glass.x, z - lv.scroll - b.glass.z) < GLASS_STEP || !lv.onScreen(x, z, -1)) return;
  b.glass = { x, z: z - lv.scroll };
  strike(lv, 'puddle', x, z, { r: GLASS_R, warn: 0.3, active: glassBurn(b), air: true, owner: e.id, color: GLASS });
}

/** On its line: you're reeled in (dash to break free, and it reels). */
function reel(lv: Level, e: Enemy, b: BossState) {
  const q = lv.players[e.grab];
  b.gone += DT;
  if (!q || q.down) {
    release(lv, e, false);
    endMove(lv, e, b, 1.2);
    return;
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
}

/**
 * Istra's tide: what she has thrown stalls, turns and comes home to her (bubbles to her intake, irons
 * reeled in). It comes back the way it went, so don't step back onto its line until it's home.
 */
function ebb(lv: Level, e: Enemy, b: BossState) {
  let turned = false;
  for (const w of b.tide) {
    const o = w.o;
    if (o.dead) continue;
    const iron = o.kind === 'harpoon';
    if (!w.back) {
      // stalling, then turning
      if (lv.time < w.at - EBB) continue;
      const k = Math.max(0, 1 - DT * (iron ? 12 : 6));
      o.vx *= k;
      o.vz *= k;
      if (lv.time < w.at) continue;
      w.back = true;
      turned = true;
      // (an iron on its way home is only a blade: it no longer catches)
      if (iron) {
        const s = o as Strike;
        s.effect = 'hurt';
        s.active = s.t + 3;
      }
    }
    const dx = e.x - o.x;
    const dz = e.z - o.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (dl < e.r * 0.6) {
      o.dead = true;
      continue;
    }
    const v = iron ? IRON_V * 0.8 : TIDE_V;
    o.vx = (dx / dl) * v;
    o.vz = (dz / dl) * v;
  }
  b.tide = b.tide.filter((w) => !w.o.dead);
  if (turned && lv.time - b.tideT > 0.4) {
    b.tideT = lv.time;
    lv.emit({ type: 'bossBeat', enemy: e.id, move: 'tide', k: 0, x: e.x, z: e.z });
  }
}

/** Throw it out on the tide: it comes back after `out` seconds. */
function onTide(lv: Level, b: BossState, o: Bullet | Strike, out: number) {
  b.tide.push({ o, at: lv.time + out, back: false });
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
  // (the filler fires a heavy foe's share of its family, and never quicker than that: `hard` speeds its clock)
  const k = <F extends Family>(f: F) => pattern(lv, e, f, SHARE.heavy);
  const every = (own: number, f: { every: number }) => Math.max(own, f.every * hard);
  switch (pat) {
    case 'fans': {
      const f = k('fan');
      const n = Math.min(4, f.n);
      for (const g of b.guns.filter((_, j) => j % 2 === b.shots % 2)) {
        const p = at(e, g);
        const a = lv.aim(p.x, p.z);
        for (let j = 0; j < n; j++) lv.shoot(p.x, p.z, a + (n === 1 ? 0 : (j / (n - 1) - 0.5) * 0.7), f.speed, { color: col });
      }
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = every(0.85, f);
      break;
    }
    case 'spiral': {
      const sp = k('spiral');
      b.fire = every(0.11, sp);
      b.angle += Math.min(0.27, sp.spin * b.fire);
      const arms = Math.min(3 + b.phase, sp.arms);
      for (let j = 0; j < arms; j++) lv.shoot(e.x, e.z, b.angle + (j / arms) * Math.PI * 2, sp.speed, { color: col });
      break;
    }
    case 'rain': {
      const g = b.guns[b.shots % b.guns.length];
      const p = at(e, g);
      const r = k('rain');
      lv.shoot(p.x, p.z, (lv.rand() - 0.5) * 0.7, r.speed * (0.75 + lv.rand() * 0.25), { color: col, kind: 'needle', r: 0.35 });
      b.fire = every(0.07, r);
      break;
    }
    case 'rings': {
      const r = k('ring');
      const n = Math.min(14 + b.phase * 3, r.n);
      const off = (b.shots % 2) * (Math.PI / n);
      for (let j = 0; j < n; j++) lv.shoot(e.x, e.z, off + (j / n) * Math.PI * 2, r.speed, { color: col });
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = every(0.9, r);
      break;
    }
    case 'walls': {
      // a row across the screen with two gaps to find (one in each half: it's a wide screen)
      const w = k('wall');
      const gaps = [lerp(-HALF_W + 5, -4, lv.rand()), lerp(4, HALF_W - 5, lv.rand())];
      const half = Math.max(3.4, w.hole / 2);
      for (let x = -HALF_W; x <= HALF_W; x += Math.max(1.8, w.spacing)) {
        if (gaps.some((g) => Math.abs(x - g) < half)) continue;
        lv.shoot(x, e.z + 2, 0, w.speed, { color: col, kind: 'needle', r: 0.35 });
      }
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = every(1.4, w);
      break;
    }
    case 'lasers': {
      const guns = [b.guns[0], b.guns[b.guns.length - 1]];
      for (const g of guns) {
        const p = at(e, g);
        const a = lv.aim(p.x, p.z) + (lv.rand() - 0.5) * 0.25;
        lv.lasers.push({ x: p.x, z: p.z, x2: p.x + Math.sin(a) * 70, z2: p.z + Math.cos(a) * 70, warn: 1.05, on: 0.6, color: col, owner: e.id });
      }
      const r = k('ring');
      const n = Math.min(6, r.n);
      for (let j = 0; j < n; j++) lv.shoot(e.x, e.z, (j / n) * Math.PI * 2 + b.shots, r.speed, { color: col });
      b.fire = every(2.1, r);
      break;
    }
    case 'splitters': {
      const g = b.guns[b.shots % b.guns.length];
      const p = at(e, g);
      const r = k('ring');
      lv.bullet(p.x, p.z, lv.aim(p.x, p.z) + (lv.rand() - 0.5) * 0.6, 7.5, { kind: 'big', r: 1, life: 1.3, split: Math.min(8 + b.phase * 2, r.n), splitV: r.speed, color: col });
      lv.emit({ type: 'enemyShot', x: p.x, z: p.z, color: col });
      b.fire = every(0.9, r);
      break;
    }
    case 'frost': {
      // half asleep: it breathes out a slow ring of frost, and breathes in
      // (slower than the table: it's breathing, not firing)
      const r = k('ring');
      const n = Math.min(12, r.n);
      const off = (b.shots % 2) * (Math.PI / n);
      for (let j = 0; j < n; j++) lv.shoot(e.x, e.z, off + (j / n) * Math.PI * 2, r.speed * 0.7, { color: ICE, kind: 'needle', r: 0.4 });
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'frost', k: b.shots, x: e.x, z: e.z });
      b.fire = every(1.6, r);
      break;
    }
    case 'tide': {
      // the sea breathed out in a ring that stalls and comes back to her: weave out, weave back
      // (it goes out as far as it did, however fast: the tide turns it sooner)
      const r = k('ring');
      const n = Math.min(12, r.n);
      const off = (b.shots % 2) * (Math.PI / n);
      const out = (1.8 * lv.fireSpeed(8)) / r.speed;
      for (let j = 0; j < n; j++) onTide(lv, b, lv.shoot(e.x, e.z, off + (j / n) * Math.PI * 2, r.speed, { color: col, kind: 'big', r: 0.6 }), out);
      lv.emit({ type: 'bossBeat', enemy: e.id, move: 'swell', k: b.shots, x: e.x, z: e.z });
      b.fire = every(2.2, r);
      break;
    }
    case 'ledger': {
      // ARU-0, silent: rows printed blind down the field, its back to you; the gap steps along
      // the row like a print head, and back
      const span = 2 * HALF_W - 14;
      const u = (b.shots * 4.5) % (span * 2);
      const gx = -HALF_W + 7 + (u < span ? u : span * 2 - u);
      // (slow, as printing is)
      const w = k('wall');
      const half = Math.max(5.2, w.hole / 2);
      for (let x = -HALF_W + 0.9; x <= HALF_W; x += Math.max(1.9, w.spacing)) {
        if (Math.abs(x - gx) < half) continue;
        lv.shoot(x, e.z + 2, 0, w.speed * 0.7, { color: col, kind: 'needle', r: 0.35 });
      }
      b.fire = every(1.5, w);
      break;
    }
    case 'salvo': {
      // *Unbending*'s guns, by the book: a file of rounds down one line at you, then a step
      // across and another (fire on a line, not a spray: step off it)
      const a = lv.aim(e.x, e.z) + ((b.shots % 3) - 1) * 0.18;
      // (a burst in one go: the file spread out by speed, its fastest the table's)
      const f = k('burst');
      const n = Math.min(5, f.burst);
      for (let j = 0; j < n; j++) lv.shoot(e.x, e.z + 2, a, (f.speed * (12 + j * 1.6)) / (12 + 4 * 1.6), { color: col, kind: 'needle', r: 0.4 });
      lv.emit({ type: 'enemyShot', x: e.x, z: e.z, color: col });
      b.fire = every(0.75, f);
      break;
    }
    case 'curves': {
      const f = k('fan');
      for (const side of [-1, 1]) {
        const g = side < 0 ? b.guns[0] : b.guns[b.guns.length - 1];
        const p = at(e, g);
        for (let j = 0; j < Math.min(3, f.n); j++) lv.shoot(p.x, p.z, side * (0.9 - j * 0.25), f.speed, { color: col, turn: -side * 0.9 });
      }
      b.fire = every(0.4, f);
      break;
    }
  }
}
