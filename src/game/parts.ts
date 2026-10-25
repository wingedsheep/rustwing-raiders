/**
 * Ships are built, not bought. A frame is a hull with a grid of sockets; parts are bolted into the
 * grid, and where a part sits matters:
 *
 * - Guns fire the way they face: the front row fires forward, the outer columns fire out at an
 *   angle, the back row fires behind you. A gun in the middle fires forward.
 * - Boosters (amplifier, heat sink, targeting array, capacitor) only help the guns they touch.
 * - Engines in the back row push half as hard again.
 * - Mass is load, against what the frame can carry (engines carry more). A light ship is NIMBLE:
 *   a wider window for a perfect, a quicker dash recovery. Past what it can carry it is
 *   OVERLOADED: slow to recover the dash, sluggish. So an empty socket is worth something,
 *   and every part has to earn its weight.
 * - MAIN guns fire while fire is held. HEAVY guns (rail, flak, seekers, mines, the lance) fire on
 *   their own button, a round a press, from a few rounds that reload one by one; a perfect (a
 *   dash out of fire, or a parry) reloads a round. Two triggers: a stream to hold, and blows to time.
 * - HARDPOINTS: a frame has a few hardpoints for each button's tools (the Kestrel two TRIGGER, one
 *   HEAVY, one AUX, one SPECIAL). Guns take a TRIGGER hardpoint, heavy guns a HEAVY one, the aux
 *   and the special theirs. A hardpoint isn't a place: a tool goes on any socket, so long as the
 *   frame has a hardpoint of its kind free. Everything else is a FITTING. Frames differ in how many
 *   of each they have (see FRAMES). Every frame starts nearly empty: its own guns on an open deck.
 * - Some parts link: they need (or are better for) a certain part touching them, or a certain side
 *   facing something (a gun, or open air off the hull's edge). Linked, a part runs at 150%;
 *   missing something it needs, it does nothing.
 * - The dash is always there; DASH MOD parts change it.
 * - Guns leave marks on what they hit, by tag: HEAT burns, ARC shocks, EXPLOSIVE cracks (boosters
 *   can give any gun a mark). Two different marks on one enemy react (see sim/marks.ts).
 *
 * Models: tools/models/ships.py builds `frame_<id>` and `part_<id>` templates.
 */

export type Tag = 'kinetic' | 'energy' | 'explosive' | 'arc' | 'heat' | 'drive' | 'armor' | 'tech';

/** What a hit can leave on an enemy (see sim/marks.ts). */
export type MarkKind = 'burn' | 'shock' | 'crack';

export type PartClass = 'gun' | 'engine' | 'defense' | 'booster' | 'special';

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
  /** An afterimage left where the dash began, burning (damage per second) and drawing fire. */
  ghost?: number;
  /** Marked enemies dashed past have their marks set off, this hard (1 = 100%). */
  detonate?: number;
  /** The dash-strike hits harder and lasts longer: +50% more punch and half as long again, per 1. */
  strike?: number;
}

/** The AUX verb: a defensive action on its own button. */
export type AuxKind = 'parry' | 'tether' | 'flare' | 'siphon' | 'bulwark' | 'beacon';

/** Background effects: they trigger on their own. Numbers are at 100% strength. */
export interface Passive {
  /** Bullets the shield stops are thrown back as this many shots. */
  mirror?: number;
  /** A skin over the hull (see sim/kit.ts): ABLATIVE layers that break into shrapnel, or STATIC that grazes charge. */
  skin?: 'ablative' | 'static';
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
  // The arsenal's dials (see sim/arsenal.ts): what a shot does to what it hits, and how it flies.
  /** Chill stacks a hit leaves: four and it's FROZEN. */
  chill?: number;
  /** Knocks what it hits flying, this hard; a flung body that hits something is a blow. */
  shove?: number;
  /** Nails what it hits in place for this many seconds. */
  pin?: number;
  /** Times a shot bounces off the screen's edge (and the land). */
  bounce?: number;
  /** Curves towards enemies, this hard. */
  homing?: number;
  /** Through shields and plating: it hits the hull underneath. */
  phase?: boolean;
  /** Every this many shots, one CRACKS what it hits (the Rivet Gun's: a setup from the start). */
  crackEvery?: number;
  /** A heavy round left in the chamber grows: up to this much harder (×1 + ripen) after 3 s. */
  ripen?: number;
  /** How big its shots are drawn and hit (×), and their colour. */
  size?: number;
  tint?: number;
}

/**
 * A gun's edge: when it crits. Guns don't all want the same fight: a Rail Driver wants you far off,
 * a Scattergun in their face, Seekers on the enemy's tell, Mines on what chases you. What you mount
 * says how you should fly, and two guns whose edges pull apart are a choice to make.
 */
export type Edge = 'reeling' | 'close' | 'locked' | 'far' | 'shocked' | 'tell' | 'crowd' | 'burning' | 'behind' | 'hurt' | 'skim' | 'frozen' | 'pinned' | 'airborne';

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
  frozen: { name: 'ICEBREAKER', text: 'CRITS THE CHILLED AND THE FROZEN', pop: 'ICEBREAKER' },
  pinned: { name: 'NAILER', text: 'CRITS THE PINNED', pop: 'NAILED DOWN' },
  airborne: { name: 'AIRBORNE', text: 'CRITS WHAT’S BEEN KNOCKED FLYING', pop: 'AIRBORNE' },
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
  /** Hull points (a frame's 60 to 100), and hull as a share more (a PLATED roll). */
  hp?: number;
  hullPct?: number;
  /** Armour: taken off every hit on the hull (a graze most of all). */
  armor?: number;
  shield?: number;
  thrust?: number;
  /** Agility: how hard it turns and stops. */
  grip?: number;
  dash?: number;
  gun?: GunSpec;
  /** For the special ability parts. */
  special?: 'bomb' | 'phase' | 'emp' | 'overdrive' | 'carpet' | 'cryo' | 'gravity' | 'drones';
  /** Booster effects on touching guns: `mark` gives their hits a mark, `flaw` makes them crit marked enemies. */
  /**
   * What it does to the guns it touches. `share`: they carry each other's marks (Spark Gap).
   * `relay`: a verb of the ship's feeds them (see RELAYS): a perfect or a takedown fires them, grazes
   * load their rounds, a ram leaves their marks, a caught shot carries them.
   */
  boost?: { damage?: number; rate?: number; cool?: number; mark?: MarkKind; flaw?: boolean; hone?: boolean; rounds?: number; chill?: number; share?: boolean; relay?: Relay };
  /** Load it lets the ship carry, besides its own mass (Grav Keel). */
  carry?: number;
  mod?: DashMod;
  aux?: AuxKind;
  passive?: Passive;
  link?: LinkSpec;
  text: string;
}

/** The ship's verbs a fitting can hand on to the guns it touches (see `boost.relay`). */
export type Relay = 'echo' | 'graze' | 'ram' | 'catch';

export const CELL = 0.8;

export const PARTS: PartDef[] = [
  // --- guns --------------------------------------------------------------------------------
  {
    id: 'rivet', name: 'Rivet Gun', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1,
    gun: { rate: 9, damage: 4, speed: 70, count: 1, spread: 0, life: 0.7, shot: 'slug', heat: 0.02, edge: 'reeling', crackEvery: 4 },
    text: 'Cheap, fast, reliable. Every fourth rivet CRACKS what it hits: a heavy round on it breaches. Every scrapper starts with one.',
  },
  {
    id: 'scatter', name: 'Scattergun', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1.2,
    gun: { rate: 3, damage: 3.2, speed: 55, count: 6, spread: 0.55, life: 0.33, shot: 'pellet', heat: 0.08, edge: 'close' },
    text: 'A fistful of pellets. Brutal up close, useless far off.',
  },
  {
    id: 'ion', name: 'Ion Lance', cls: 'gun', tags: ['energy'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 2,
    gun: { rate: 20, damage: 2.2, speed: 0, count: 1, spread: 0, life: 0, shot: 'beam', heat: 0.012, edge: 'locked' },
    text: 'A held beam that melts through anything in a line. Thirsty.',
  },
  {
    id: 'rail', name: 'Rail Driver', cls: 'gun', tags: ['energy', 'kinetic'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 2.2,
    gun: { rate: 0.9, damage: 52, speed: 160, count: 1, spread: 0, life: 0.5, shot: 'rail', pierce: 99, heat: 0, edge: 'far', heavy: 3 },
    text: 'One slug, very fast, through everything in its way.',
  },
  {
    id: 'arc', name: 'Arc Coil', cls: 'gun', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 1.2,
    gun: { rate: 4, damage: 6, speed: 0, count: 1, spread: 0, life: 0, shot: 'arc', heat: 0.05, edge: 'shocked' },
    text: 'Lightning that jumps to the nearest enemy, then the next, then the next.',
  },
  {
    id: 'seeker', name: 'Seeker Pod', cls: 'gun', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.4,
    gun: { rate: 0.8, damage: 8, speed: 28, count: 3, spread: 0.8, life: 1.5, shot: 'missile', heat: 0, edge: 'tell', heavy: 2 },
    text: 'A salvo of little missiles that find their own way. Slow to arrive.',
  },
  {
    id: 'flak', name: 'Flak Cannon', cls: 'gun', tags: ['explosive', 'kinetic'], rarity: 'rare', shape: [[0, 0], [1, 0]], mass: 2.5,
    gun: { rate: 1.25, damage: 24, speed: 40, count: 1, spread: 0, life: 0.6, shot: 'flak', heat: 0, edge: 'crowd', heavy: 3 },
    text: 'Shells that burst into shrapnel. Clears a crowd.',
  },
  {
    id: 'torch', name: 'Plasma Torch', cls: 'gun', tags: ['heat', 'energy'], rarity: 'common', shape: [[0, 0]], mass: 1,
    gun: { rate: 24, damage: 1.8, speed: 30, count: 1, spread: 0.25, life: 0.34, shot: 'flame', pierce: 2, heat: 0.018, edge: 'burning' },
    text: 'A short tongue of plasma. Melts bullets it touches.',
  },
  {
    id: 'mine', name: 'Mine Chute', cls: 'gun', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.2,
    gun: { rate: 1, damage: 26, speed: 6, count: 1, spread: 0, life: 4, shot: 'mine', heat: 0, edge: 'behind', heavy: 3 },
    text: 'Drops proximity mines, for whatever is chasing you.',
  },
  {
    id: 'sentry', name: 'Sentry Pod', cls: 'gun', tags: ['kinetic', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 1.2,
    gun: { rate: 3, damage: 5, speed: 60, count: 1, spread: 0, life: 0.6, shot: 'slug', heat: 0, auto: true, edge: 'hurt' },
    text: 'A little turret that picks its own targets and fires whether you do or not.',
  },
  {
    id: 'lance', name: 'Velocity Lance', cls: 'gun', tags: ['kinetic', 'drive'], rarity: 'epic', shape: [[0, 0], [0, 1], [0, 2]], mass: 2.4,
    gun: { rate: 1.2, damage: 26, speed: 120, count: 1, spread: 0, life: 0.5, shot: 'rail', pierce: 3, heat: 0, speedy: true, edge: 'skim', heavy: 2 },
    text: 'A spike that hits harder the faster you go: double at full boost. Skim the land and it crits.',
  },
  // --- engines -----------------------------------------------------------------------------
  {
    id: 'thruster', name: 'Ion Thruster', cls: 'engine', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.8, thrust: 10,
    text: 'A plain engine. Push it from the back.',
  },
  {
    id: 'vector', name: 'Vector Fins', cls: 'engine', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.5, grip: 0.35, dash: 0.3,
    text: 'Swivelling vanes. Sharper turns, quicker dash.',
  },
  // --- defence -----------------------------------------------------------------------------
  {
    id: 'plate', name: 'Armour Plate', cls: 'defense', tags: ['armor'], rarity: 'common', shape: [[0, 0]], mass: 2, hp: 15, armor: 3,
    text: 'Thick and heavy. More hull, and every hit takes 3 less: grazes barely scratch you.',
  },
  {
    id: 'shield', name: 'Deflector', cls: 'defense', tags: ['tech', 'energy'], rarity: 'rare', shape: [[0, 0]], mass: 1, shield: 1,
    text: 'Soaks one hit, then recharges if you stop getting hit.',
  },
  // --- boosters ----------------------------------------------------------------------------
  {
    id: 'amp', name: 'Amplifier', cls: 'booster', tags: ['tech'], rarity: 'common', shape: [[0, 0]], mass: 0.6, boost: { damage: 0.35 },
    text: 'Touching guns hit a third harder.',
  },
  {
    id: 'sink', name: 'Heat Sink', cls: 'booster', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.8, boost: { cool: 1, rate: 0.15 },
    text: 'Touching guns cool twice as fast and fire a bit quicker.',
  },
  // --- markers (give touching guns a mark) and what cashes marks in --------------------------
  {
    id: 'incend', name: 'Incendiary Feed', cls: 'booster', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.7, boost: { mark: 'burn' },
    text: 'Feeds touching guns burning slag: what they hit catches fire.',
  },
  {
    id: 'tesla', name: 'Tesla Coupler', cls: 'booster', tags: ['arc'], rarity: 'common', shape: [[0, 0]], mass: 0.6, boost: { mark: 'shock' },
    text: 'Charges touching guns’ rounds: what they hit is shocked, and stalls.',
  },
  {
    id: 'breach', name: 'Breacher Rack', cls: 'booster', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 0.9, boost: { mark: 'crack' },
    text: 'Shaped charges on touching guns’ rounds: what they hit cracks, and takes more.',
  },
  {
    id: 'flaw', name: 'Flaw Finder', cls: 'booster', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.5, boost: { flaw: true },
    text: 'Touching guns crit whatever’s marked: burning, shocked or cracked.',
  },
  {
    id: 'hone', name: 'Edge Hone', cls: 'booster', tags: ['tech', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, boost: { hone: true },
    text: 'A grinding wheel for the guns it touches: their crits hit three times as hard, not twice.',
  },
  // --- loadout: feeding the heavies, carrying the load ---------------------------------------
  {
    id: 'autoloader', name: 'Autoloader', cls: 'booster', tags: ['kinetic', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.9, boost: { rounds: 1, rate: 0.3 },
    text: 'A drum that feeds the heavy guns it touches: a round more each, and they reload a third faster.',
  },
  // --- the arsenal (out of the forge): setups and the blows that cash them in --------------
  {
    id: 'frost', name: 'Frost Sprayer', cls: 'gun', tags: ['energy'], rarity: 'rare', shape: [[0, 0]], mass: 1.1,
    gun: { rate: 18, damage: 1.1, speed: 28, count: 1, spread: 0.32, life: 0.5, shot: 'flame', pierce: 2, heat: 0.016, edge: 'close', chill: 0.5, tint: 0x9ae8ff },
    text: 'A wide, slow mist. It barely hurts, but four chills FREEZE it solid: a blow on the ice SMASHES it. Puts out fires.',
  },
  {
    id: 'saw', name: 'Saw Launcher', cls: 'gun', tags: ['kinetic'], rarity: 'common', shape: [[0, 0]], mass: 1.3,
    gun: { rate: 3.5, damage: 5, speed: 34, count: 1, spread: 0, life: 1.6, shot: 'slug', pierce: 1, heat: 0.05, edge: 'behind', bounce: 3, size: 1.5, tint: 0xd8e0e8 },
    text: 'Spinning blades that bounce off the edges of the screen three times. The bounce comes at them from behind.',
  },
  {
    id: 'charge', name: 'Charge Cannon', cls: 'gun', tags: ['energy', 'explosive'], rarity: 'epic', shape: [[0, 0], [0, 1]], mass: 2.4,
    gun: { rate: 0.5, damage: 28, speed: 80, count: 1, spread: 0, life: 0.7, shot: 'rail', pierce: 2, heat: 0, edge: 'reeling', heavy: 2, ripen: 2, tint: 0xd0a0ff },
    text: 'HEAVY. A round left in the chamber charges: after 3 s it hits three times as hard. The smasher for frozen things.',
  },
  {
    id: 'anchor', name: 'Anchor Spike', cls: 'gun', tags: ['kinetic'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 2,
    gun: { rate: 0.7, damage: 18, speed: 110, count: 1, spread: 0, life: 0.5, shot: 'rail', heat: 0, edge: 'pinned', heavy: 3, pin: 3, tint: 0xb0a090 },
    text: 'HEAVY. A spike on a chain: what it hits is PINNED for 3 s. A blow on it is NAILED: all of it lands, and the plating goes.',
  },
  {
    id: 'cryofeed', name: 'Cryo Feed', cls: 'booster', tags: ['energy'], rarity: 'common', shape: [[0, 0]], mass: 0.7, boost: { chill: 0.35 },
    text: 'Coolant on touching guns’ rounds: what they hit is chilled, and four chills freeze it.',
  },
  // --- relays: a fitting that changes what the guns it touches do, not how hard ---------------
  {
    id: 'conduit', name: 'Spark Gap', cls: 'booster', tags: ['arc', 'tech'], rarity: 'epic', shape: [[0, 0]], mass: 0.6, boost: { share: true },
    text: 'The guns it touches carry each other’s marks, so two that mark differently make REACTIONS. Their reactions jump to the two nearest enemies, and set them off in turn.',
  },
  {
    id: 'echo', name: 'Echo Coil', cls: 'booster', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, boost: { relay: 'echo' },
    text: 'On a PERFECT or a TAKEDOWN, the guns it touches fire a free volley (a heavy, a free round).',
  },
  {
    id: 'grazer', name: 'Graze Fins', cls: 'booster', tags: ['drive'], rarity: 'common', shape: [[0, 0]], mass: 0.5, boost: { relay: 'graze' },
    text: 'Every three GRAZES load a round into the heavy guns it touches. Fly close.',
  },
  {
    id: 'recoil', name: 'Ram Spurs', cls: 'booster', tags: ['kinetic', 'armor'], rarity: 'rare', shape: [[0, 0]], mass: 1, boost: { relay: 'ram' },
    text: 'What you RAM takes the marks of the guns it touches. The ram is a blow: the next one cashes them in.',
  },
  {
    id: 'magnet', name: 'Catch Coil', cls: 'booster', tags: ['energy'], rarity: 'rare', shape: [[0, 0]], mass: 0.6, boost: { relay: 'catch' },
    text: 'Shots you CATCH go back carrying the marks of the guns it touches.',
  },
  {
    id: 'keel', name: 'Grav Keel', cls: 'engine', tags: ['drive', 'tech'], rarity: 'common', shape: [[0, 0]], mass: 0.4, carry: 3,
    text: 'Lift rings under a keel blade. It pushes nothing, but the ship carries 3 more load: a socket for a lighter ship.',
  },
  // --- dash mods (change what B does) -----------------------------------------------------
  {
    id: 'ram', name: 'Ram Prow', cls: 'engine', tags: ['armor', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 1.6,
    mod: { ram: 30 }, link: { want: { open: true }, side: 'n', need: true, text: 'THE FRONT EDGE' },
    text: 'Dash through enemies to hit them hard (half again on a perfect). Rammed things can’t hurt you mid-dash.',
  },
  {
    id: 'blink', name: 'Blink Coil', cls: 'engine', tags: ['tech', 'arc'], rarity: 'epic', shape: [[0, 0]], mass: 0.6,
    mod: { blink: 9 },
    text: 'The dash is a blink: you are just there, past bullets and enemies. A perfect still counts where you left.',
  },
  {
    id: 'wake', name: 'Wake Charges', cls: 'engine', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1,
    mod: { mines: 3 }, link: { want: { open: true }, side: 's', text: 'THE BACK EDGE' },
    text: 'Every dash drops a string of mines along its path.',
  },
  {
    id: 'ghost', name: 'Ghost Lamp', cls: 'engine', tags: ['energy', 'tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.6,
    mod: { ghost: 40 }, link: { want: { thrust: true }, text: 'AN ENGINE TOUCHING' },
    text: 'Dashing leaves an afterimage that burns what touches it and draws aimed fire. Twice as hot after a perfect.',
  },
  {
    id: 'catalyst', name: 'Catalyst', cls: 'engine', tags: ['tech'], rarity: 'rare', shape: [[0, 0]], mass: 0.7,
    mod: { detonate: 1 }, link: { want: { gun: true }, text: 'A GUN TOUCHING' },
    text: 'Dash through marked enemies to set their marks off. Twice as hard on a perfect.',
  },
  {
    id: 'lunge', name: 'Lunge Jets', cls: 'engine', tags: ['drive', 'kinetic'], rarity: 'rare', shape: [[0, 0]], mass: 0.7,
    mod: { strike: 1 }, link: { want: { gun: true }, text: 'A GUN TOUCHING' },
    text: 'Out of a dash the guns strike +100%, not +50%, and for longer. Dash in, open up.',
  },
  // --- aux (the defensive button) ---------------------------------------------------------
  {
    id: 'parry', name: 'Parry Emitter', cls: 'defense', tags: ['energy', 'tech'], rarity: 'rare', shape: [[0, 0], [0, 1]], mass: 1.4,
    aux: 'parry', link: { want: { gun: true }, side: 'n', cell: 0, text: 'A GUN IN FRONT' },
    text: 'AUX: parry small shots for a PERFECT and RIPOSTE. Late, block small shots only. Beams, heavy rounds, blasts and bodies bypass it. Up on nothing, a long wait.',
  },
  {
    id: 'tether', name: 'Grapple Tether', cls: 'defense', tags: ['kinetic', 'drive'], rarity: 'rare', shape: [[0, 0], [0, 1], [1, 1]], mass: 1.8,
    aux: 'tether', link: { want: { open: true }, side: 'n', cell: 0, text: 'THE FRONT EDGE' },
    text: 'AUX: hook the nearest enemy ahead and reel yourself in, untouchable, to hit it hard. A kill gives the hook back.',
  },
  {
    id: 'flare', name: 'Decoy Flare', cls: 'defense', tags: ['heat'], rarity: 'common', shape: [[0, 0]], mass: 0.8,
    aux: 'flare',
    text: 'AUX: throw a flare. Aimed fire goes for it instead of you, then it bursts.',
  },
  {
    id: 'siphon', name: 'Void Siphon', cls: 'defense', tags: ['tech', 'energy'], rarity: 'epic', shape: [[0, 0], [0, 1]], mass: 1.6, shield: 1,
    aux: 'siphon', link: { want: { ids: ['shield', 'mirror'] }, text: 'A DEFLECTOR OR REFLECTOR' },
    text: 'AUX: a vacuum that drinks the bullets round you. Every few it drinks fills a cell of shield, one cell over the top. You fly slower while it runs.',
  },
  // --- passives (they work on their own) ---------------------------------------------------
  {
    id: 'mirror', name: 'Reflector Plate', cls: 'defense', tags: ['armor', 'energy'], rarity: 'rare', shape: [[0, 0]], mass: 1.6, hp: 10,
    passive: { mirror: 3 },
    text: 'A bullet your shield soaks or a block stops is thrown back as three shots. Parries throw one more.',
  },
  // --- specials (one ability button) ------------------------------------------------------
  {
    id: 'bombbay', name: 'Bomb Bay', cls: 'special', tags: ['explosive'], rarity: 'common', shape: [[0, 0]], mass: 1.5, special: 'bomb',
    text: 'SPECIAL: a bomb that wipes the bullets off the screen and hurts everything on it.',
  },
  {
    id: 'phasedrive', name: 'Phase Drive', cls: 'special', tags: ['tech', 'drive'], rarity: 'rare', shape: [[0, 0]], mass: 1, special: 'phase',
    text: 'SPECIAL: slip out of phase for two seconds. Nothing touches you.',
  },
  {
    id: 'emp', name: 'EMP Spike', cls: 'special', tags: ['arc'], rarity: 'rare', shape: [[0, 0]], mass: 1, special: 'emp',
    text: 'SPECIAL: a pulse that stops machines and erases bullets near you.',
  },
  {
    id: 'overdrive', name: 'Overdrive', cls: 'special', tags: ['heat', 'drive'], rarity: 'epic', shape: [[0, 0]], mass: 1, special: 'overdrive',
    text: 'SPECIAL: five seconds of double fire rate and no heat.',
  },
];

export interface FrameDef {
  id: string;
  name: string;
  text: string;
  /** What only this frame does, and what its shape costs it (the frame card says both). */
  perk: { name: string; text: string };
  weak: string;
  /** The socket grid, row 0 at the front: '#' a socket, '.' none. */
  grid: string[];
  /** How many tools of each button it takes (see HARDPOINTS); a button it hasn't, it can't use. */
  mounts: Partial<Record<Hardpoint, number>>;
  hp: number;
  mass: number;
  /** Base thrust and agility. */
  thrust: number;
  grip: number;
  dash: number;
  /** Seconds to get a dash back: a racer is quick about it, a hauler takes its time. */
  dashCd: number;
  /** The load it carries before it counts as full (engines add to it: see LOAD). Its own engines are built in: thrust, mass and load. */
  load: number;
  /** Top speed against what its thrust alone would give (a racer is quicker than its engines say). */
  speed: number;
  /** Burn back a second once the boost is let go. */
  burn: number;
  /** Hit radius: a slim racer is hard to hit, a hauler isn't. */
  core: number;
  // the perks (see `perk`)
  /** Plating: shield cells it starts with (SHIELD_CELL points each), that grow back like any shield. */
  shield?: number;
  /** Its dash rams, this hard (as a Ram Prow). */
  ram?: number;
  /** A perfect dash gives the dash back at once, with no recovery. */
  refill?: boolean;
  /** Kestrel: the dash tags what it passes, and the guns pay them back as it ends (FLY-BY in sim/level.ts). */
  flyby?: boolean;
  /** Magpie: every shot the parry catches loads a heavy round. */
  catch?: boolean;
  /** Linked parts run at this (150% elsewhere); a part that needs its link runs at a third of the extra. */
  linked?: number;
  /** Parts it comes with, as [part, col, row]. */
  start: [string, number, number][];
}

export const FRAMES: FrameDef[] = [
  {
    id: 'kestrel',
    name: 'Kestrel',
    text: 'A stripped-down racer, made of tinfoil. It flies past them.',
    perk: { name: 'FLY-BY', text: 'Dash past foes, close but not into them: each one is tagged. As the dash ends, the guns loose a volley at every tagged foe, as blows that carry their marks.' },
    weak: '60 HULL. NO ARMOUR FOR A RAM.',
    grid: ['..#..', '.###.', '.###.', '#####', '.#.#.'],
    mounts: { T: 2, H: 1, S: 1 },
    hp: 60, mass: 4, thrust: 15, grip: 1.25, dash: 1, dashCd: 1.6, load: 8, speed: 1.15, burn: 0.2, core: 0.3, flyby: true, refill: true,
    start: [['rivet', 1, 1], ['rivet', 3, 1], ['thruster', 1, 4], ['thruster', 3, 4]],
  },
  {
    id: 'hammer',
    name: 'Hammerhead',
    text: 'A wide armoured head and a slim tail. It goes through them.',
    perk: { name: 'BATTERING RAM', text: 'The dash rams with the whole head: it breaks plating, and a second ram takes the reeling down. Every foe rammed gives the dash back sooner.' },
    weak: 'STIFF IN A TURN. BEAMS AND BLASTS GO THROUGH THE RAM.',
    grid: ['######', '######', '..##..', '..##..'],
    mounts: { T: 2, H: 1, S: 1 },
    hp: 85, mass: 6, thrust: 14, grip: 0.95, dash: 1, dashCd: 2.2, load: 10.5, speed: 1.05, burn: 0.1, core: 0.42, ram: 22,
    start: [['scatter', 2, 0], ['scatter', 3, 0], ['thruster', 2, 3], ['thruster', 3, 3]],
  },
  {
    id: 'magpie',
    name: 'Magpie',
    text: 'A catcher\'s crescent on a split tail. It throws their fire back.',
    perk: { name: 'THE CATCH', text: 'A parry emitter of its own. Every shot it catches loads a round into the heavy.' },
    weak: 'A SLOW DASH. BEAMS, HEAVY ROUNDS, MINES AND BODIES CAN\'T BE CAUGHT.',
    grid: ['#...#', '##.##', '#####', '.###.', '.#.#.'],
    mounts: { T: 2, H: 1, A: 1, S: 1 },
    hp: 72, mass: 5, thrust: 15, grip: 1.05, dash: 1, dashCd: 2.4, load: 10, speed: 1.02, burn: 0.12, core: 0.38, catch: true,
    start: [['rivet', 1, 1], ['rivet', 3, 1], ['parry', 2, 2], ['thruster', 1, 4], ['thruster', 3, 4]],
  },
];

/** A hardpoint: room for one of a button's tools, anywhere on the grid. */
export type Hardpoint = 'T' | 'H' | 'A' | 'S';
export const HARDPOINTS: Record<Hardpoint, { name: string; button: string }> = {
  T: { name: 'TRIGGER', button: 'FIRE' },
  H: { name: 'HEAVY', button: 'HEAVY' },
  A: { name: 'AUX', button: 'AUX' },
  S: { name: 'SPECIAL', button: 'SPECIAL' },
};

/** The hardpoint a part takes (a tool), or null: a fitting. */
export function hardpointOf(d: PartDef): Hardpoint | null {
  if (d.gun) return d.gun.heavy ? 'H' : 'T';
  if (d.aux) return 'A';
  if (d.special) return 'S';
  return null;
}

/** The hardpoints a frame has, in button order (one letter each, repeated if it has two). */
export const hardpointsOf = (f: FrameDef) => (['T', 'H', 'A', 'S'] as Hardpoint[]).flatMap((h) => Array<Hardpoint>(f.mounts[h] ?? 0).fill(h));

/** How strong a linked part runs on this frame (`need`: one that needs its link). */
export const linkedStr = (f: FrameDef, need = false) => (need ? 1 + ((f.linked ?? STRENGTH.linked) - STRENGTH.linked) / 1.5 : f.linked ?? STRENGTH.linked);

export const partById = (id: string) => PARTS.find((p) => p.id === id)!;

/**
 * Load: a part's mass against what the ship can carry, the frame's own load plus `engine` for
 * every point of thrust its engines push. Up to `nimble` of it the ship is NIMBLE, past all of it
 * OVERLOADED.
 */
export const LOAD = { nimble: 0.6, engine: 0.15 };
export type LoadClass = 'nimble' | 'steady' | 'overloaded';
export const LOAD_CLASS: Record<LoadClass, { name: string; color: string; text: string }> = {
  nimble: { name: 'NIMBLE', color: '#8affe0', text: 'QUICKER DASH, EASIER PERFECTS' },
  steady: { name: 'STEADY', color: '#d8cce8', text: 'NO BONUS, NO PENALTY' },
  overloaded: { name: 'OVERLOADED', color: '#ff5a4a', text: 'SLOW DASH RECOVERY, SLUGGISH' },
};

/** How strong a part runs: missing what it needs, linked. */
export const STRENGTH = { idle: 0, linked: 1.5 };

/** The verb a part gives you: what you do with it, or that it does it on its own. */
export type Verb = 'GUN' | 'HEAVY' | 'DASH MOD' | 'AUX' | 'SPECIAL' | 'PASSIVE';

export function verbOf(d: PartDef): Verb {
  if (d.gun) return d.gun.heavy ? 'HEAVY' : 'GUN';
  if (d.special) return 'SPECIAL';
  if (d.aux) return 'AUX';
  if (d.mod) return 'DASH MOD';
  return 'PASSIVE';
}
/** (a frame that's been cut, in an old save or recording, flies as the Kestrel) */
export const frameById = (id: string) => FRAMES.find((f) => f.id === id) ?? FRAMES[0];

/**
 * How a frame comes at fire, as the ship card says it: round it (the Kestrel's fly-by), through it
 * (the Hammerhead's ram), or back at them (the Magpie's catch).
 */
export const styleOf = (f: FrameDef) =>
  f.catch
    ? { name: 'GUARD', color: '#ffd060', text: 'THROWS IT BACK' }
    : f.ram
      ? { name: 'RAM', color: '#ff9a4a', text: 'GOES THROUGH' }
      : { name: 'FLY-BY', color: '#8affe0', text: 'FLIES PAST THEM' };
