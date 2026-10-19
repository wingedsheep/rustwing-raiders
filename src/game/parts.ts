/**
 * Ships are built, not bought. A frame is a hull with a grid of sockets; parts are bolted into the
 * grid, and where a part sits matters:
 *
 * - Guns fire the way they face: the front row fires forward, the outer columns fire out at an
 *   angle, the back row fires behind you. A gun in the middle fires forward.
 * - Boosters (amplifier, heat sink, targeting array, capacitor) only help the guns they touch.
 * - Engines in the back row push half as hard again.
 * - Everything has mass and most things draw power. Not enough power and the guns brown out.
 * - Mass is load, against what the frame can carry (engines carry more). A light ship is NIMBLE:
 *   an extra dash, a wider window for a perfect, a quicker recovery. Past what it can carry it is
 *   OVERLOADED: a dash fewer, slow to recover, sluggish. So an empty socket is worth something,
 *   and every part has to earn its weight.
 * - MAIN guns fire while fire is held. HEAVY guns (rail, flak, seekers, mines, the lance) fire on
 *   their own button, a round a press, from a few rounds that reload one by one; a perfect dash
 *   reloads a round. Two triggers: a stream to hold, and blows to time.
 * - Tags (KINETIC, ENERGY, EXPLOSIVE, ARC, HEAT) count across the whole ship: three of a tag wakes
 *   its set bonus, five makes it stronger.
 * - Conduits relay: two parts touching the same run of conduit count as touching each other.
 * - Some parts link: they need (or are better for) a certain part touching them, or a certain side
 *   facing something (a gun, or open air off the hull's edge). Linked, a part runs at 150%;
 *   missing something it needs, it does nothing.
 * - Some tags clash when they touch (arc with heat, explosive with heat): both run at half strength.
 *   Conduits don't pass a clash on.
 * - One SPECIAL and one AUX per ship. The dash is always there; DASH MOD parts change it.
 * - Guns leave marks on what they hit, by tag: HEAT burns, ARC shocks, EXPLOSIVE cracks (boosters
 *   can give any gun a mark). Two different marks on one enemy react (see sim/marks.ts): the tags
 *   that clash in your hull are the ones that combo in theirs, so mount them apart and land them
 *   together.
 *
 * Models: tools/models/ships.py builds `frame_<id>` and `part_<id>` templates.
 */

export type Tag = 'kinetic' | 'energy' | 'explosive' | 'arc' | 'heat' | 'drive' | 'armor' | 'tech';

/** What a hit can leave on an enemy (see sim/marks.ts). */
export type MarkKind = 'burn' | 'shock' | 'crack';

export type PartClass = 'gun' | 'engine' | 'power' | 'defense' | 'booster' | 'special';

export type Rarity = 'common' | 'rare' | 'epic';

/** A side of a cell: north is the front of the ship. */
export type Side = 'n' | 'e' | 's' | 'w';

/** What a link looks for in the part across it. Any one field that matches will do. */
export interface Want {
  gun?: boolean;
  /** An engine that pushes (has thrust). */
  thrust?: boolean;
  /** A part that gives a shield or uses one (Deflector, Parry Emitter, Void Siphon). */
  shield?: boolean;
  special?: boolean;
  cls?: PartClass[];
  ids?: string[];
  /** Nothing there: the side faces out off the hull. */
  open?: boolean;
}

export interface LinkSpec {
  want: Want;
  /** Only across this side of one of its cells (`cell`, an index into the shape); else anything touching it. */
  side?: Side;
  cell?: number;
  /** Does nothing without it (else it's a bonus: 150%). */
  need?: boolean;
  /** What it wants, in a few words: 'A GUN IN FRONT'. */
  text: string;
}

/** How a part changes the dash. */
export interface DashMod {
  /** Damage to each enemy dashed through (and they can't hurt you doing it). */
  ram?: number;
  /** The dash is a jump this far, instant. */
  blink?: number;
  /** Mines dropped along the dash. */
  mines?: number;
  /** A perfect dash gives back every charge and skips the recovery. */
  refill?: boolean;
  /** A perfect dash fires the guns it touches at once, this many times as hard. */
  volley?: number;
  /** An afterimage left where the dash began, burning (damage per second) and drawing fire. */
  ghost?: number;
  /** Marked enemies dashed past have their marks set off, this hard (1 = 100%). */
  detonate?: number;
  /** The dash-strike hits harder and lasts longer: +50% more punch and half as long again, per 1. */
  strike?: number;
}

/** The AUX verb: a defensive action on its own button. */
export type AuxKind = 'parry' | 'tether' | 'flare' | 'siphon';

/** Background effects: they trigger on their own. Numbers are at 100% strength. */
export interface Passive {
  /** Seconds of crits for guns it touches, after a perfect dash. */
  crit?: number;
  /** Skims and grazes recharge the shield this many times faster. */
  skin?: number;
  /** Fire rate for guns it touches, at full boost (+). */
  throttle?: number;
  /** Damage at a full Burn meter, every gun (+, scaled by how full). */
  gamble?: number;
  /** Damage of the mine a point-blank kill leaves. */
  salvage?: number;
  /** Touching guns overheating give a shield (shields they give, per overheat). */
  exchange?: number;
  /** The special goes off again, this much as strong. */
  echo?: number;
  /** Bullets the shield stops are thrown back as this many shots. */
  mirror?: number;
  /** Every this many shots, guns it touches also throw an arc. */
  storm?: number;
  /** Clashes it touches turn round: they run at this instead of half. */
  fuse?: number;
}

/** How a gun fires. */
export interface GunSpec {
  /** Shots per second. */
  rate: number;
  damage: number;
  speed: number;
  /** Projectiles per shot, and the spread between them (radians). */
  count: number;
  spread: number;
  /** Seconds a shot lives. */
  life: number;
  /** What the shot is and does. */
  shot: 'slug' | 'pellet' | 'beam' | 'rail' | 'arc' | 'missile' | 'flak' | 'flame' | 'mine';
  pierce?: number;
  /** Heat per shot; at 1 the gun jams until it cools. */
  heat: number;
  /** Aims itself at the nearest enemy and fires on its own, trigger or not. */
  auto?: boolean;
  /** Hits harder the faster you go (×1 + boost). */
  speedy?: boolean;
  /** Its edge: the moment it crits in (double damage). Every gun has one, and each wants you somewhere else. */
  edge: Edge;
  /**
   * A HEAVY gun: fired on the heavy button, one round a press, from this many rounds. It doesn't
   * heat up; `rate` is how fast a round comes back instead (rounds a second).
   */
  heavy?: number;
}

/**
 * A gun's edge: when it crits. Guns don't all want the same fight: a Rail Driver wants you far off,
 * a Scattergun in their face, Seekers on the enemy's tell, Mines on what chases you. What you mount
 * says how you should fly, and two guns whose edges pull apart are a choice to make.
 */
export type Edge = 'reeling' | 'close' | 'locked' | 'far' | 'shocked' | 'tell' | 'crowd' | 'burning' | 'behind' | 'hurt' | 'skim';

export const EDGES: Record<Edge, { name: string; text: string; pop: string }> = {
  reeling: { name: 'PUNISHER', text: 'CRITS THE REELING: STUNNED, OR OPEN AFTER ITS ATTACK', pop: 'PUNISHED' },
  close: { name: 'POINT-BLANK', text: 'CRITS POINT-BLANK', pop: 'POINT-BLANK' },
  locked: { name: 'LOCK-ON', text: 'CRITS AFTER 0.8 S HELD ON ONE TARGET', pop: 'LOCKED ON' },
  far: { name: 'LONG SHOT', text: 'CRITS FAR OFF: HALF A SCREEN AWAY', pop: 'LONG SHOT' },
  shocked: { name: 'GROUNDED', text: 'CRITS THE SHOCKED', pop: 'GROUNDED' },
  tell: { name: 'ON THE TELL', text: 'CRITS AN ENEMY WINDING UP AN ATTACK', pop: 'ON THE TELL' },
  crowd: { name: 'CROWD', text: 'CRITS AN ENEMY WITH TWO MORE CLOSE BY', pop: 'CROWD' },
  burning: { name: 'SEARING', text: 'CRITS THE BURNING', pop: 'SEARED' },
  behind: { name: 'TAILGATE', text: 'CRITS WHAT’S BEHIND YOU', pop: 'TAILGATER' },
  hurt: { name: 'FINISHER', text: 'CRITS ANYTHING BELOW HALF HULL', pop: 'FINISHER' },
  skim: { name: 'SKIMMER', text: 'CRITS WHILE YOU SKIM THE LAND', pop: 'SKIMMING' },
};

export interface PartDef {
  id: string;
  name: string;
  cls: PartClass;
  tags: Tag[];
  rarity: Rarity;
  /** Cells it takes, as [col, row] offsets: [[0,0]] for one, [[0,0],[0,1]] for a long one. */
  shape: [number, number][];
  mass: number;
  /** Power drawn (+) or made (-). */
  power: number;
  hp?: number;
  shield?: number;
  thrust?: number;
  /** Agility: how hard it turns and stops. */
  grip?: number;
  dash?: number;
  gun?: GunSpec;
  /** For the special ability parts. */
  special?: 'bomb' | 'phase' | 'emp' | 'overdrive';
  /** Booster effects on touching guns: `mark` gives their hits a mark, `flaw` makes them crit marked enemies. */
  boost?: { damage?: number; rate?: number; cool?: number; homing?: number; burst?: number; mark?: MarkKind; flaw?: boolean; hone?: boolean; rounds?: number };
  /** Load it lets the ship carry, besides its own mass (Grav Keel). */
  carry?: number;
  magnet?: number;
  graze?: number;
  drone?: boolean;
  /** Parts touching a run of conduit count as touching each other. */
  conduit?: boolean;
  mod?: DashMod;
  aux?: AuxKind;
  passive?: Passive;
  link?: LinkSpec;
  /** A duo part: only offered once the ship has two of each of these tags. */
  duo?: [Tag, Tag];
  text: string;
}

export const CELL = 0.8;

export const PARTS: PartDef[] = [
  // --- guns --------------------------------------------------------------------------------
  {
    id: 'rivet', name: 'Rivet Gun', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1, power: 1,
    gun: { rate: 9, damage: 4, speed: 70, count: 1, spread: 0, life: 0.7, shot: 'slug', heat: 0.02, edge: 'reeling' },
    text: 'Cheap, fast, reliable. Every scrapper starts with one.',
  },
  {
    id: 'scatter', name: 'Scattergun', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1.2, power: 1,
    gun: { rate: 3, damage: 3.2, speed: 55, count: 6, spread: 0.55, life: 0.33, shot: 'pellet', heat: 0.08, edge: 'close' },
    text: 'A fistful of pellets. Brutal up close, useless far off.',
  },
  {
    id: 'ion', name: 'Ion Lance', cls: 'gun', tags: ['energy'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 2, power: 3,
    gun: { rate: 20, damage: 2.2, speed: 0, count: 1, spread: 0, life: 0, shot: 'beam', heat: 0.012, edge: 'locked' },
    text: 'A held beam that melts through anything in a line. Thirsty.',
  },
  {
    id: 'rail', name: 'Rail Driver', cls: 'gun', tags: ['energy', 'kinetic'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 2.2, power: 2,
    gun: { rate: 0.9, damage: 52, speed: 160, count: 1, spread: 0, life: 0.5, shot: 'rail', pierce: 99, heat: 0, edge: 'far', heavy: 3 },
    text: 'One slug, very fast, through everything in its way.',
  },
  {
    id: 'arc', name: 'Arc Coil', cls: 'gun', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 1.2, power: 2,
    gun: { rate: 4, damage: 6, speed: 0, count: 1, spread: 0, life: 0, shot: 'arc', heat: 0.05, edge: 'shocked' },
    text: 'Lightning that jumps to the nearest enemy, then the next, then the next.',
  },
  {
    id: 'seeker', name: 'Seeker Pod', cls: 'gun', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.4, power: 1,
    gun: { rate: 0.8, damage: 8, speed: 28, count: 3, spread: 0.8, life: 1.5, shot: 'missile', heat: 0, edge: 'tell', heavy: 2 },
    text: 'A salvo of little missiles that find their own way. Slow to arrive.',
  },
  {
    id: 'flak', name: 'Flak Cannon', cls: 'gun', tags: ['explosive', 'kinetic'], rarity: 'rare', shape: [[0, 0], [1, 0]], mass: 2.5, power: 1,
    gun: { rate: 1.25, damage: 24, speed: 40, count: 1, spread: 0, life: 0.6, shot: 'flak', heat: 0, edge: 'crowd', heavy: 3 },
    text: 'Shells that burst into shrapnel. Clears a crowd.',
  },
  {
    id: 'torch', name: 'Plasma Torch', cls: 'gun', tags: ['heat', 'energy'], rarity: 'common', shape: [[0, 0]], mass: 1, power: 2,
    gun: { rate: 24, damage: 1.5, speed: 30, count: 1, spread: 0.25, life: 0.34, shot: 'flame', pierce: 2, heat: 0.018, edge: 'burning' },
    text: 'A short tongue of plasma. Melts bullets it touches.',
  },
  {
    id: 'mine', name: 'Mine Chute', cls: 'gun', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.2, power: 0,
    gun: { rate: 1, damage: 26, speed: 6, count: 1, spread: 0, life: 4, shot: 'mine', heat: 0, edge: 'behind', heavy: 3 },
    text: 'Drops proximity mines, for whatever is chasing you.',
  },
  {
    id: 'sentry', name: 'Sentry Pod', cls: 'gun', tags: ['kinetic', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 1.2, power: 2,
    gun: { rate: 3, damage: 5, speed: 60, count: 1, spread: 0, life: 0.6, shot: 'slug', heat: 0, auto: true, edge: 'hurt' },
    text: 'A little turret that picks its own targets and fires whether you do or not.',
  },
  {
    id: 'lance', name: 'Velocity Lance', cls: 'gun', tags: ['kinetic', 'drive'], rarity: 'epic', shape: [[0, 0], [0, 1], [0, 2]], mass: 2.4, power: 2,
    gun: { rate: 1.2, damage: 26, speed: 120, count: 1, spread: 0, life: 0.5, shot: 'rail', pierce: 3, heat: 0, speedy: true, edge: 'skim', heavy: 2 },
    text: 'A spike that hits harder the faster you go: double at full boost. Skim the land and it crits.',
  },
  // --- engines -----------------------------------------------------------------------------
  {
    id: 'thruster', name: 'Ion Thruster', cls: 'engine', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.8, power: 1, thrust: 10,
    text: 'A plain engine. Push it from the back.',
  },
  {
    id: 'burner', name: 'Blast Pipes', cls: 'engine', tags: ['drive', 'heat'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 1.6, power: 1, thrust: 18, dash: 1,
    text: 'Big thrust and a second dash charge.',
  },
  {
    id: 'vector', name: 'Vector Fins', cls: 'engine', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.5, power: 0, grip: 0.35, dash: 0.3,
    text: 'Swivelling vanes. Sharper turns, quicker dash.',
  },
  // --- power -------------------------------------------------------------------------------
  {
    id: 'reactor', name: 'Fusion Cell', cls: 'power', tags: ['tech'], rarity: 'common', shape: [[0, 0]], mass: 1.2, power: -5,
    text: 'Power. Everything wants some.',
  },
  {
    id: 'capacitor', name: 'Capacitor Bank', cls: 'booster', tags: ['tech', 'arc'], rarity: 'rare', shape: [[0, 0]], mass: 0.8, power: -2,
    boost: { burst: 1 },
    text: 'A little power, and touching guns fire an extra shot every few.',
  },
  // --- defence -----------------------------------------------------------------------------
  {
    id: 'plate', name: 'Armour Plate', cls: 'defense', tags: ['armor'], rarity: 'common', shape: [[0, 0]], mass: 2, power: 0, hp: 3,
    text: 'Thick and heavy. Three more hits before you go down.',
  },
  {
    id: 'shield', name: 'Deflector', cls: 'defense', tags: ['tech', 'energy'], rarity: 'rare', shape: [[0, 0]], mass: 1, power: 2, shield: 1,
    text: 'Soaks one hit, then recharges if you stop getting hit.',
  },
  // --- boosters ----------------------------------------------------------------------------
  {
    id: 'amp', name: 'Amplifier', cls: 'booster', tags: ['tech'], rarity: 'common', shape: [[0, 0]], mass: 0.6, power: 1, boost: { damage: 0.35 },
    text: 'Touching guns hit a third harder.',
  },
  {
    id: 'sink', name: 'Heat Sink', cls: 'booster', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.8, power: 0, boost: { cool: 1, rate: 0.15 },
    text: 'Touching guns cool twice as fast and fire a bit quicker.',
  },
  {
    id: 'targeter', name: 'Targeting Array', cls: 'booster', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, power: 1, boost: { homing: 1 },
    text: 'Touching guns’ shots curve towards enemies.',
  },
  {
    id: 'magnet', name: 'Scrap Magnet', cls: 'defense', tags: ['tech'], rarity: 'common', shape: [[0, 0]], mass: 0.8, power: 1, magnet: 1,
    text: 'Pulls in scrap from much further away.',
  },
  {
    id: 'drone', name: 'Drone Bay', cls: 'booster', tags: ['tech'], rarity: 'epic', shape: [[0, 0]], mass: 1, power: 2, drone: true,
    text: 'Launches a wing drone that copies the gun it touches.',
  },
  {
    id: 'grazer', name: 'Graze Coil', cls: 'defense', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 0.5, power: 0, graze: 1,
    text: 'Bullets that brush past you charge your special twice as fast.',
  },
  // --- markers (give touching guns a mark) and what cashes marks in --------------------------
  {
    id: 'incend', name: 'Incendiary Feed', cls: 'booster', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.7, power: 0, boost: { mark: 'burn' },
    text: 'Feeds touching guns burning slag: what they hit catches fire.',
  },
  {
    id: 'tesla', name: 'Tesla Coupler', cls: 'booster', tags: ['arc'], rarity: 'common', shape: [[0, 0]], mass: 0.6, power: 1, boost: { mark: 'shock' },
    text: 'Charges touching guns’ rounds: what they hit is shocked, and stalls.',
  },
  {
    id: 'breach', name: 'Breacher Rack', cls: 'booster', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 0.9, power: 0, boost: { mark: 'crack' },
    text: 'Shaped charges on touching guns’ rounds: what they hit cracks, and takes more.',
  },
  {
    id: 'flaw', name: 'Flaw Finder', cls: 'booster', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.5, power: 1, boost: { flaw: true },
    text: 'Touching guns crit whatever’s marked: burning, shocked or cracked.',
  },
  {
    id: 'hone', name: 'Edge Hone', cls: 'booster', tags: ['tech', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, power: 1, boost: { hone: true },
    text: 'A grinding wheel for touching guns: when their edge comes off, they hit three times as hard, not twice.',
  },
  // --- loadout: feeding the heavies, carrying the load ---------------------------------------
  {
    id: 'autoloader', name: 'Autoloader', cls: 'booster', tags: ['kinetic', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.9, power: 1, boost: { rounds: 1, rate: 0.3 },
    text: 'A drum that feeds the heavy guns it touches: a round more each, and they reload a third faster.',
  },
  {
    id: 'keel', name: 'Grav Keel', cls: 'engine', tags: ['drive', 'tech'], rarity: 'common', shape: [[0, 0]], mass: 0.4, power: 1, carry: 3,
    text: 'Lift rings under a keel blade. It pushes nothing, but the ship carries 3 more load: a socket for a lighter ship.',
  },
  // --- dash mods (change what B does) -----------------------------------------------------
  {
    id: 'ram', name: 'Ram Prow', cls: 'engine', tags: ['armor', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 1.6, power: 0,
    mod: { ram: 30 }, link: { want: { open: true }, side: 'n', need: true, text: 'THE FRONT EDGE' },
    text: 'Dash through enemies to hit them hard (half again on a perfect). Rammed things can’t hurt you mid-dash.',
  },
  {
    id: 'blink', name: 'Blink Coil', cls: 'engine', tags: ['tech', 'arc'], rarity: 'epic', shape: [[0, 0]], mass: 0.6, power: 3,
    mod: { blink: 9 }, link: { want: { cls: ['power'] }, text: 'A POWER CELL TOUCHING' },
    text: 'The dash is a blink: you are just there, past bullets and enemies. A perfect still counts where you left.',
  },
  {
    id: 'wake', name: 'Wake Charges', cls: 'engine', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1, power: 0,
    mod: { mines: 3 }, link: { want: { open: true }, side: 's', text: 'THE BACK EDGE' },
    text: 'Every dash drops a string of mines along its path.',
  },
  {
    id: 'spring', name: 'Kick Spring', cls: 'engine', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.4, power: 0,
    mod: { refill: true },
    text: 'A perfect dash gives every charge back and skips the recovery: chain perfects into perfects.',
  },
  {
    id: 'ghost', name: 'Ghost Lamp', cls: 'engine', tags: ['energy', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, power: 2,
    mod: { ghost: 40 }, link: { want: { thrust: true }, text: 'AN ENGINE TOUCHING' },
    text: 'Dashing leaves an afterimage that burns what touches it and draws aimed fire. Twice as hot after a perfect.',
  },
  {
    id: 'catalyst', name: 'Catalyst', cls: 'engine', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.7, power: 2,
    mod: { detonate: 1 }, link: { want: { gun: true }, text: 'A GUN TOUCHING' },
    text: 'Dash through marked enemies to set their marks off. Twice as hard on a perfect.',
  },
  {
    id: 'lunge', name: 'Lunge Jets', cls: 'engine', tags: ['drive', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 0.7, power: 1,
    mod: { strike: 1 }, link: { want: { gun: true }, text: 'A GUN TOUCHING' },
    text: 'Out of a dash the guns strike +100%, not +50%, and for longer. Dash in, open up.',
  },
  // --- aux (the defensive button) ---------------------------------------------------------
  {
    id: 'parry', name: 'Parry Emitter', cls: 'defense', tags: ['energy', 'tech'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 1.4, power: 2, shield: 1,
    aux: 'parry', link: { want: { gun: true }, side: 'n', cell: 0, text: 'A GUN IN FRONT' },
    text: 'AUX: a shield burst. Its first instant parries: bullets fly back as yours and it is ready again. Late, it only blocks.',
  },
  {
    id: 'tether', name: 'Grapple Tether', cls: 'defense', tags: ['kinetic', 'drive'], rarity: 'rare', shape: [[0, 0], [0, 1], [1, 1]], mass: 1.8, power: 1,
    aux: 'tether', link: { want: { open: true }, side: 'n', cell: 0, text: 'THE FRONT EDGE' },
    text: 'AUX: hook the nearest enemy ahead and reel yourself in, untouchable, to hit it hard. A kill gives the hook back.',
  },
  {
    id: 'flare', name: 'Decoy Flare', cls: 'defense', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.8, power: 0,
    aux: 'flare',
    text: 'AUX: throw a flare. Aimed fire goes for it instead of you, then it bursts.',
  },
  {
    id: 'siphon', name: 'Void Siphon', cls: 'defense', tags: ['tech', 'energy'], rarity: 'epic', shape: [[0, 0], [0, 1]], mass: 1.6, power: 3, shield: 1,
    aux: 'siphon', link: { want: { ids: ['shield', 'mirror'] }, text: 'A DEFLECTOR OR REFLECTOR' },
    text: 'AUX: a vacuum that drinks the bullets round you. Every few it drinks is a shield. You fly slower while it runs.',
  },
  // --- passives (they work on their own) ---------------------------------------------------
  {
    id: 'trigger', name: 'Hair Trigger', cls: 'booster', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.5, power: 1,
    passive: { crit: 1.5 }, link: { want: { gun: true }, need: true, text: 'A GUN TOUCHING' },
    text: 'After a perfect dash, the guns it touches crit for double damage for a moment.',
  },
  {
    id: 'skin', name: 'Static Skin', cls: 'defense', tags: ['arc'], rarity: 'common', shape: [[0, 0]], mass: 0.4, power: 0,
    passive: { skin: 4 }, link: { want: { shield: true }, need: true, text: 'A SHIELD PART TOUCHING' },
    text: 'Skimming the land and grazing bullets recharge your shield, fast.',
  },
  {
    id: 'throttle', name: 'Throttle Link', cls: 'booster', tags: ['drive', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.5, power: 0,
    passive: { throttle: 0.5 }, link: { want: { thrust: true }, need: true, text: 'AN ENGINE TOUCHING' },
    text: 'While you boost, the guns it touches fire faster and cooler.',
  },
  {
    id: 'gambler', name: 'Burn Engine', cls: 'power', tags: ['tech'], rarity: 'epic', shape: [[0, 0]], mass: 1.2, power: -2,
    passive: { gamble: 0.5 },
    text: 'Every gun hits harder the fuller your Burn: half again on a full meter. A hit empties it.',
  },
  {
    id: 'salvage', name: 'Salvage Charges', cls: 'defense', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 0.8, power: 0,
    passive: { salvage: 18 },
    text: 'Point-blank kills leave a mine behind, and it shakes loose more scrap.',
  },
  {
    id: 'exchanger', name: 'Heat Exchanger', cls: 'booster', tags: ['heat', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 1, power: 1,
    passive: { exchange: 1 }, link: { want: { gun: true }, need: true, text: 'A GUN TOUCHING' },
    text: 'Guns it touches run hotter, but every overheat is a shield (one over the top) and jams less.',
  },
  {
    id: 'echo', name: 'Echo Relay', cls: 'booster', tags: ['tech', 'arc'], rarity: 'epic', shape: [[0, 0]], mass: 0.8, power: 2,
    passive: { echo: 0.6 }, link: { want: { special: true }, need: true, text: 'THE SPECIAL TOUCHING' },
    text: 'Your special goes off a second time, a moment later, a bit weaker.',
  },
  {
    id: 'mirror', name: 'Reflector Plate', cls: 'defense', tags: ['armor', 'energy'], rarity: 'rare', shape: [[0, 0]], mass: 1.6, power: 0, hp: 1,
    passive: { mirror: 3 },
    text: 'A bullet your shield or a block stops is thrown back as three shots. Parries throw one more.',
  },
  {
    id: 'conduit', name: 'Conduit', cls: 'power', tags: [], rarity: 'common', shape: [[0, 0]], mass: 0.3, power: 0, conduit: true,
    text: 'Parts touching the same run of conduit count as touching. Boosters reach further; clashes don’t pass.',
  },
  {
    id: 'elbow', name: 'Conduit Elbow', cls: 'power', tags: [], rarity: 'common', shape: [[0, 0], [0, 1], [1, 1]], mass: 0.6, power: 0, conduit: true,
    text: 'Three cells of conduit round a corner.',
  },
  // --- duo parts (offered only once you carry two of each tag) -----------------------------
  {
    id: 'stormlens', name: 'Storm Lens', cls: 'booster', tags: ['arc', 'energy'], rarity: 'epic', shape: [[0, 0]], mass: 0.6, power: 2, duo: ['arc', 'energy'],
    passive: { storm: 4 }, link: { want: { gun: true }, need: true, text: 'A GUN TOUCHING' },
    text: 'Every fourth shot of the guns it touches also throws a chain of lightning.',
  },
  {
    id: 'slag', name: 'Slag Furnace', cls: 'power', tags: ['heat', 'explosive'], rarity: 'epic', shape: [[0, 0], [1, 0]], mass: 1.8, power: -2, duo: ['heat', 'explosive'],
    passive: { fuse: 1.25 },
    text: 'Clashes it touches turn round: both parts run at 125% instead of half. Pack it with trouble.',
  },
  {
    id: 'recoil', name: 'Recoil Battery', cls: 'engine', tags: ['kinetic', 'drive'], rarity: 'epic', shape: [[0, 0]], mass: 1, power: 1, duo: ['kinetic', 'drive'],
    mod: { volley: 2 }, link: { want: { gun: true }, need: true, text: 'A GUN TOUCHING' },
    text: 'A perfect dash fires every gun it touches at once, twice as hard.',
  },
  // --- specials (one ability button) ------------------------------------------------------
  {
    id: 'bombbay', name: 'Bomb Bay', cls: 'special', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.5, power: 0, special: 'bomb',
    text: 'SPECIAL: a bomb that wipes the bullets off the screen and hurts everything on it.',
  },
  {
    id: 'phasedrive', name: 'Phase Drive', cls: 'special', tags: ['tech', 'drive'], rarity: 'rare', shape: [[0, 0]], mass: 1, power: 2, special: 'phase',
    text: 'SPECIAL: slip out of phase for two seconds. Nothing touches you.',
  },
  {
    id: 'emp', name: 'EMP Spike', cls: 'special', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 1, power: 1, special: 'emp',
    text: 'SPECIAL: a pulse that stops machines and erases bullets near you.',
  },
  {
    id: 'overdrive', name: 'Overdrive', cls: 'special', tags: ['heat', 'drive'], rarity: 'epic', shape: [[0, 0]], mass: 1, power: 0, special: 'overdrive',
    text: 'SPECIAL: five seconds of double fire rate and no heat.',
  },
];

export interface FrameDef {
  id: string;
  name: string;
  text: string;
  /** The socket grid, row 0 at the front: '#' a socket, '.' none. */
  grid: string[];
  hp: number;
  mass: number;
  /** Base power, thrust and agility. */
  power: number;
  thrust: number;
  grip: number;
  dash: number;
  /** The load it carries before it counts as full (engines add to it: see LOAD). */
  load: number;
  /** Parts it comes with, as [part, col, row]. */
  start: [string, number, number][];
}

export const FRAMES: FrameDef[] = [
  {
    id: 'kestrel',
    name: 'Kestrel',
    text: 'A stripped-down racer. Quick and twitchy, made of tinfoil.',
    grid: ['.#.', '###', '###', '#.#'],
    hp: 4, mass: 4, power: 4, thrust: 14, grip: 1.15, dash: 1, load: 8,
    start: [['rivet', 1, 0], ['thruster', 0, 3], ['thruster', 2, 3], ['reactor', 1, 2]],
  },
  {
    id: 'mule',
    name: 'Mule',
    text: 'A hauler with guns bolted on. Room for everything, moves like a fridge.',
    grid: ['#####', '#####', '.###.'],
    hp: 7, mass: 7, power: 6, thrust: 14, grip: 0.8, dash: 1, load: 12,
    start: [['rivet', 1, 0], ['rivet', 3, 0], ['thruster', 2, 2], ['plate', 2, 1]],
  },
  {
    id: 'wasp',
    name: 'Wasp',
    text: 'Twin booms like a pod racer. Guns on the prongs, engines everywhere.',
    grid: ['#.#', '#.#', '###', '###'],
    hp: 5, mass: 4.5, power: 5, thrust: 16, grip: 1.05, dash: 1, load: 8.5,
    start: [['rivet', 0, 0], ['rivet', 2, 0], ['thruster', 1, 3], ['reactor', 1, 2]],
  },
  {
    id: 'hammer',
    name: 'Hammerhead',
    text: 'A wide armoured head for a front battery, and a slim tail.',
    grid: ['####', '####', '.##.', '.##.'],
    hp: 6, mass: 6, power: 5, thrust: 14, grip: 0.9, dash: 1, load: 10.5,
    start: [['scatter', 1, 0], ['scatter', 2, 0], ['thruster', 1, 3], ['thruster', 2, 3]],
  },
  {
    id: 'lattice',
    name: 'Lattice',
    text: 'An open truss: sockets everywhere, but few of them touch. Bridge them with conduit.',
    grid: ['#.#.#', '#.#.#', '#####', '.#.#.'],
    hp: 5, mass: 4.5, power: 6, thrust: 15, grip: 1, dash: 1, load: 10,
    start: [['rivet', 0, 0], ['rivet', 4, 0], ['reactor', 2, 2], ['thruster', 1, 3], ['thruster', 3, 3]],
  },
];

export const partById = (id: string) => PARTS.find((p) => p.id === id)!;

/**
 * Load: a part's mass against what the ship can carry, the frame's own load plus `engine` for
 * every point of thrust its engines push. Up to `nimble` of it the ship is NIMBLE, past all of it
 * OVERLOADED.
 */
export const LOAD = { nimble: 0.6, engine: 0.15 };
export type LoadClass = 'nimble' | 'steady' | 'overloaded';
export const LOAD_CLASS: Record<LoadClass, { name: string; color: string; text: string }> = {
  nimble: { name: 'NIMBLE', color: '#8affe0', text: '+1 DASH, EASIER PERFECTS' },
  steady: { name: 'STEADY', color: '#d8cce8', text: 'NO BONUS, NO PENALTY' },
  overloaded: { name: 'OVERLOADED', color: '#ff5a4a', text: '-1 DASH, SLOW TO RECOVER' },
};

/** Tags that clash when parts carrying them touch: both parts run at half strength. */
export const CLASHES: { a: Tag; b: Tag; name: string }[] = [
  { a: 'arc', b: 'heat', name: 'OVERLOAD' },
  { a: 'explosive', b: 'heat', name: 'COOK-OFF' },
];

/** How strong a part runs: missing what it needs, clashing, linked. They multiply. */
export const STRENGTH = { idle: 0, clash: 0.5, fused: 1.25, linked: 1.5 };

/** The verb a part gives you: what you do with it, or that it does it on its own. */
export type Verb = 'GUN' | 'HEAVY' | 'DASH MOD' | 'AUX' | 'SPECIAL' | 'PASSIVE';

export function verbOf(d: PartDef): Verb {
  if (d.gun) return d.gun.heavy ? 'HEAVY' : 'GUN';
  if (d.special) return 'SPECIAL';
  if (d.aux) return 'AUX';
  if (d.mod) return 'DASH MOD';
  return 'PASSIVE';
}
export const frameById = (id: string) => FRAMES.find((f) => f.id === id)!;

export const TAG_BONUS: Record<Tag, { name: string; at3: string; at5: string }> = {
  kinetic: { name: 'Hailstorm', at3: 'Kinetic shots fire 20% faster.', at5: 'Kinetic shots ricochet once.' },
  energy: { name: 'Overcharge', at3: 'Energy weapons +25% damage.', at5: 'Energy shots pierce one more.' },
  explosive: { name: 'Demolition', at3: 'Explosions 40% bigger.', at5: 'Kills explode.' },
  arc: { name: 'Stormcaller', at3: 'Arcs jump two more times.', at5: 'Getting hit discharges an arc nova.' },
  heat: { name: 'Furnace', at3: 'Guns run 30% cooler.', at5: 'Overheating erupts in a flame ring.' },
  drive: { name: 'Slipstream', at3: '+1 dash charge.', at5: 'Dashing leaves a damaging trail.' },
  armor: { name: 'Bulwark', at3: '+2 hull.', at5: 'Every 10 s, ignore one hit.' },
  tech: { name: 'Overclock', at3: '+3 power.', at5: 'Special charges 40% faster.' },
};
