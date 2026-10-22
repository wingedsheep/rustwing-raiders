/**
 * The pilot: your ship's core, and what it learns.
 *
 * Every lattice machine in the Spur is built round a core, a grown Tonkva machine-heart, and a
 * rustwing patches its hull out of wrecks, core included (docs/lore/minds.md). The mould a core
 * is made of **learns**: it copies what it touches. Yours starts the run asleep, and it learns
 * how you fly.
 *
 * - **It takes in what it sees you do.** Every fight, each of its three **veins** is fed by its own
 *   kind of flying: NERVE by perfects (dashed or parried), grazes, Warden phases flown CLEAN and levels without a
 *   scratch; STEEL by takedowns, edge crits and full clears; GREASE by welds, revives and the tin
 *   scooped. Enough, all told, and the core **grows a knot**.
 * - **Attention, not desire** (docs/lore/consensus.md). A knot only grows on a vein you fed in
 *   that fight. You choose which knot, but how you flew chooses where.
 * - **The veins** hang off the core, each a diamond of five knots: k1, k2, a fork of two, then
 *   its **talisman** at the foot (either fork reaches it). A knot is a KNACK (a rule for good),
 *   ROOM (room for one more imprint) or an IMPRINT (copy one of three, there and then); the foot
 *   is the vein's talisman. Which knacks and talismans hang where is rolled for the run, and
 *   there are fewer growths in a run than knots.
 * - **Imprints.** The mould copies the people it gets near: Big Nell's laugh, Pip Hollow's
 *   policy, Mama Ruzz's luck, a Warden's habits off its core. Each takes up room (one to three);
 *   the core has three to start. One past its room and it **leans**: every hit you take shakes
 *   the newest imprint loose for the rest of the level. Two that agree hold firmer: a named
 *   **agreement** lights up with a rule of its own. Imprints can be let go and taken back up at
 *   any stop.
 * - **The Waking.** Grow enough knots and the core wakes: a **nemva**, a mind made of how you
 *   flew, with a name and a voice. At the gates from the second sector on, the Engine calls every
 *   core in the Reach. A sleeping one answers, and goes quiet for a while in the middle of the
 *   Warden's fight. A woken one can refuse, and does.
 *
 * Found this run, lost at its end. How it all works in flight is in sim/mind.ts.
 */

import type { Faction } from '../sim/factions';
import { shuffle, rng, type Rng } from '../util';

// --- imprints -----------------------------------------------------------------------------

export type ImprintId =
  | 'creed'
  | 'laugh'
  | 'sleeve'
  | 'hum'
  | 'sight'
  | 'policy'
  | 'price'
  | 'ways_scrap'
  | 'ways_lattice'
  | 'ways_wild'
  | 'ways_bloom'
  | 'unbending'
  | 'luck'
  | 'brisk'
  | 'tin'
  | 'code'
  | 'minute';

export interface ImprintDef {
  id: ImprintId;
  name: string;
  /** Room it takes in the core. */
  weight: 1 | 2 | 3;
  /** What it does, as a rule. */
  text: string;
  /** Who or what it was copied from. */
  from: string;
  /** Its colour in the core. */
  color: string;
  /** The vein it leans to (an IMPRINT knot on that vein offers it first). */
  vein: Vein;
  /** A faction's ways: whose. */
  faction?: Faction;
  /** Only copied from its person (an event): never offered at a knot. */
  given?: boolean;
}

const I = (d: ImprintDef) => d;

export const IMPRINTS: Record<ImprintId, ImprintDef> = {
  creed: I({ id: 'creed', name: "FERRULE'S CREED", weight: 1, vein: 'grease', color: '#d8b070', text: 'THE WELD TAKES 0.6 S, NOT A SECOND', from: 'SAINT FERRULE: KEEP THE SHIP ALIVE' }),
  laugh: I({ id: 'laugh', name: "NELL'S LAUGH", weight: 1, vein: 'nerve', color: '#ff9ab0', text: 'GRAZES FILL THE WELD', from: 'BIG NELL, WHO LAUGHS AT EVERY NEAR MISS' }),
  sleeve: I({ id: 'sleeve', name: "SPOKE'S SLEEVE", weight: 1, vein: 'steel', color: '#ffc24a', text: 'EVERY HEAVY HOLDS A ROUND MORE', from: 'SPOKE: NOTHING UP IT, EXCEPT THAT' }),
  hum: I({ id: 'hum', name: "THE CHOIR'S HUM", weight: 1, vein: 'grease', color: '#b88aff', text: 'A WELD THROWS OUT A RING OF SPORE CLOUDS THAT EAT FIRE AND ROT WHAT FLIES IN', from: 'THE BLOOM OF MIREFALL, ALWAYS WE' }),
  sight: I({ id: 'sight', name: "SEFFA'S SIGHT", weight: 2, vein: 'nerve', color: '#8affe0', text: 'A PERFECT DASH BREAKS THE PLATING OF EVERYTHING IT PASSES', from: 'A LANE-READER, WHO FEELS WHAT HOLDS' }),
  policy: I({ id: 'policy', name: "PIP'S POLICY", weight: 2, vein: 'grease', color: '#ff8ad0', given: true, text: 'THE BLOW THAT WOULD DOWN YOU PAYS THE POLICY OUT INSTEAD. ONCE', from: 'PIP HOLLOW: EVERY HOLE A NEST EGG' }),
  price: I({ id: 'price', name: 'THE PRICE ON YOU', weight: 2, vein: 'steel', color: '#e8d0a0', text: 'EVERY FIGHT COMES A NOTCH HARDER AT YOU. TAKEDOWNS FILL HALF THE WELD', from: 'YOUR OWN WANTED POSTER, READ TOO OFTEN' }),
  ways_scrap: I({ id: 'ways_scrap', name: 'SCRAP WAYS', weight: 2, vein: 'steel', color: '#ff6a5a', faction: 'scrap', text: 'COUNTS AS A SCRAP GRAFT TOWARDS SALVAGE RIGHTS', from: 'THE SCAV CLANS: IF IT FLOATS, IT’S OURS' }),
  ways_lattice: I({ id: 'ways_lattice', name: 'LATTICE WAYS', weight: 2, vein: 'nerve', color: '#6ae0ff', faction: 'lattice', text: 'COUNTS AS A LATTICE GRAFT TOWARDS TRUE LINE', from: 'THE PORT AUTHORITY: EVERYTHING IN ITS LANE' }),
  ways_wild: I({ id: 'ways_wild', name: 'WILD WAYS', weight: 2, vein: 'nerve', color: '#ff7ab8', faction: 'wild', text: 'COUNTS AS A WILD GRAFT TOWARDS BLOOD UP', from: 'THE HUNTERS: GO FOR THE WEAK ONE' }),
  ways_bloom: I({ id: 'ways_bloom', name: 'BLOOM WAYS', weight: 2, vein: 'grease', color: '#9aff6a', faction: 'bloom', text: 'COUNTS AS A BLOOM GRAFT TOWARDS OVERGROWTH', from: 'THE HIVE: NONE OF US IS ONE' }),
  unbending: I({ id: 'unbending', name: 'UNBENDING', weight: 3, vein: 'grease', color: '#c0c8d8', text: '+20 HULL', from: 'A TITAN, LYING IN THE GLASS' }),
  luck: I({ id: 'luck', name: "MAMA'S LUCK", weight: 3, vein: 'steel', color: '#ff5a4a', text: 'EACH LEVEL ONE HARDPOINT RUNS AT 200%, ANOTHER AT 50%', from: 'MAMA RUZZ, WHO NEVER LOSES' }),
  brisk: I({ id: 'brisk', name: "VARGA'S HANDS", weight: 1, vein: 'steel', color: '#ffd04a', text: 'THE SPECIAL STARTS EVERY LEVEL CHARGED', from: 'DR VARGA, SLEEVES ALREADY ROLLED UP' }),
  tin: I({ id: 'tin', name: 'SCOOP THE TIN', weight: 1, vein: 'grease', color: '#d0c0a8', text: 'LOOSE SCRAP FLIES TO YOU FROM ACROSS THE SCREEN', from: 'EVERY RUSTWING THERE EVER WAS' }),
  code: I({ id: 'code', name: "KASPAR'S CODE", weight: 2, vein: 'steel', color: '#f0e8d0', given: true, text: 'ELITES DROP THREE TIMES THE SCRAP', from: 'KASPAR, A PROFESSIONAL' }),
  minute: I({ id: 'minute', name: 'THE LAST MINUTE', weight: 2, vein: 'nerve', color: '#ff8a3a', text: 'KNOCKED UNDER A QUARTER HULL: EVERY HEAVY LOADS AND THE SPECIAL FILLS. ONCE A LEVEL', from: 'THE MARGARETHE, HOLDING ITS LAST MINUTE' }),
};

export const IMPRINT_LIST = Object.values(IMPRINTS);
export const WAYS: Record<Faction, ImprintId> = { scrap: 'ways_scrap', lattice: 'ways_lattice', wild: 'ways_wild', bloom: 'ways_bloom' };

/** Two imprints that agree: where minds agree, things hold firmer (a rule more, while both are in). */
export interface AgreementDef {
  id: 'dance' | 'plague' | 'double';
  name: string;
  a: ImprintId;
  b: ImprintId;
  text: string;
}

export const AGREEMENTS: AgreementDef[] = [
  { id: 'dance', name: 'WELD DANCE', a: 'laugh', b: 'creed', text: 'A GRAZE WHILE YOU WELD THROWS A SHOWER OF SPARKS THAT BURN WHAT THEY TOUCH' },
  { id: 'plague', name: 'PLAGUE NOTICE', a: 'hum', b: 'price', text: 'EVERY TAKEDOWN BURSTS INTO SPORES' },
  { id: 'double', name: 'DOUBLE OR NOTHING', a: 'sleeve', b: 'luck', text: 'MAMA’S LUCK ALWAYS LOADS YOUR HEAVY' },
];

export type AgreementId = AgreementDef['id'];

/** The agreements lit by what's held. */
export const agreementsOf = (held: readonly ImprintId[]) => AGREEMENTS.filter((p) => held.includes(p.a) && held.includes(p.b));

/** Room a list of imprints takes. */
export const weightOf = (ids: readonly ImprintId[]) => ids.reduce((s, id) => s + IMPRINTS[id].weight, 0);

// --- the veins -----------------------------------------------------------------------------

export type Vein = 'nerve' | 'steel' | 'grease';
export const VEINS: Vein[] = ['nerve', 'steel', 'grease'];
export const VEIN_NAME: Record<Vein, string> = { nerve: 'NERVE', steel: 'STEEL', grease: 'GREASE' };
export const VEIN_WHAT: Record<Vein, string> = { nerve: 'THE DASH AND THE READ', steel: 'BLOWS AND TAKEDOWNS', grease: 'THE WELD AND THE HULL' };
/** What feeds a vein, said short. */
export const VEIN_FED: Record<Vein, string> = { nerve: 'PERFECTS · GRAZES · CLEAN', steel: 'TAKEDOWNS · EDGE CRITS · CLEARS', grease: 'WELDS · REVIVES · THE TIN' };
export const VEIN_COLOR: Record<Vein, string> = { nerve: '#6ad0ff', steel: '#ff8a4a', grease: '#8affb0' };
export const VEIN_DARK: Record<Vein, string> = { nerve: '#163a52', steel: '#4a2416', grease: '#1a4a30' };

export type KnackId =
  // nerve
  | 'coldblood'
  | 'slipknot'
  | 'stillnerve'
  | 'longsecond'
  | 'deadeye'
  // steel
  | 'follow'
  | 'splinter'
  | 'brace'
  | 'chain'
  | 'execution'
  // grease
  | 'scavenger'
  | 'hotrivets'
  | 'thickskin'
  | 'sparetank'
  | 'fieldweld';

export interface KnackDef {
  id: KnackId;
  name: string;
  vein: Vein;
  /** A talisman: the vein's foot. */
  talisman?: boolean;
  text: string;
  tip: string;
}

const K = (d: KnackDef) => d;

export const KNACKS: Record<KnackId, KnackDef> = {
  coldblood: K({ id: 'coldblood', name: 'COLD BLOOD', vein: 'nerve', text: 'A PERFECT FILLS THE BURN', tip: 'READ THE FIRE, THEN BOOST OUT OF IT' }),
  slipknot: K({ id: 'slipknot', name: 'SLIPKNOT', vein: 'nerve', text: 'A GRAZE GIVES A DASH BACK (ONE A SECOND)', tip: 'SHAVE THE BULLETS AND THE DASHES NEVER RUN DRY' }),
  stillnerve: K({ id: 'stillnerve', name: 'STILL NERVE', vein: 'nerve', text: 'DASH WHILE HOLDING FOCUS AND THE PERFECT WINDOW IS TWICE AS LONG', tip: 'SLOW DOWN, WAIT FOR IT, GO' }),
  longsecond: K({ id: 'longsecond', name: 'THE LONG SECOND', vein: 'nerve', talisman: true, text: 'A PERFECT SLOWS EVERY ENEMY BULLET TO A CRAWL FOR A SECOND', tip: 'THREAD THE NEEDLE, THEN WALK OUT' }),
  deadeye: K({ id: 'deadeye', name: 'DEADEYE', vein: 'nerve', talisman: true, text: 'FOR 1.5 S AFTER A PERFECT, EVERYTHING YOUR GUNS FIRE IS A BLOW', tip: 'A PERFECT, THEN HOSE THE PLATING OFF' }),
  follow: K({ id: 'follow', name: 'FOLLOW THROUGH', vein: 'steel', text: 'A TAKEDOWN PUTS A ROUND BACK IN EVERY HEAVY', tip: 'TAKEDOWN, THEN THE HEAVY: THE NEXT ONE OPENS' }),
  splinter: K({ id: 'splinter', name: 'SPLINTERS', vein: 'steel', text: 'BREAKING PLATING THROWS SHRAPNEL INTO WHAT’S NEAR', tip: 'CRACK THE BIG ONE IN THE MIDDLE' }),
  brace: K({ id: 'brace', name: 'BRACE', vein: 'steel', text: 'WHAT YOU STAGGER REELS TWICE AS LONG', tip: 'TIME TO LINE UP THE TAKEDOWN' }),
  chain: K({ id: 'chain', name: 'CHAIN BREAKER', vein: 'steel', talisman: true, text: 'A TAKEDOWN THAT KILLS SENDS OUT A SHOCK THAT BREAKS THE PLATING OF EVERYTHING NEAR', tip: 'ONE TAKEDOWN OPENS THE NEXT: DASH DOWN THE LINE' }),
  execution: K({ id: 'execution', name: 'EXECUTION', vein: 'steel', talisman: true, text: 'A TAKEDOWN ON ANYTHING UNDER HALF ITS HULL KILLS IT. ON A WARDEN, IT HITS TWICE', tip: 'WEAR THEM DOWN, THEN FINISH IT IN ONE' }),
  scavenger: K({ id: 'scavenger', name: 'SCAVENGER', vein: 'grease', text: 'EVERY PIECE OF SCRAP YOU CATCH CHARGES THE WELD', tip: 'FLY THROUGH THE WRECKAGE' }),
  hotrivets: K({ id: 'hotrivets', name: 'HOT RIVETS', vein: 'grease', text: 'A FINISHED WELD LOADS EVERY HEAVY AND READIES THE AUX', tip: 'WELD IN THE LULL, COME OUT SWINGING' }),
  thickskin: K({ id: 'thickskin', name: 'THICK SKIN', vein: 'grease', text: 'THE FIRST HIT YOU TAKE IN A LEVEL ONLY GRAZES', tip: 'A MISTAKE FOR FREE, ONCE' }),
  sparetank: K({ id: 'sparetank', name: 'SPARE TANK', vein: 'grease', talisman: true, text: 'THE WELD HOLDS TWO CHARGES', tip: 'NOTHING YOU EARN IS WASTED' }),
  fieldweld: K({ id: 'fieldweld', name: 'FIELD WELD', vein: 'grease', talisman: true, text: 'YOU WELD AT FULL SPEED WITH THE GUNS GOING: ONLY HOLD FOCUS', tip: 'WELD IN THE THICK OF IT' }),
};

export const KNACK_LIST = Object.values(KNACKS);

export type KnotKind = 'room' | 'imprint' | 'knack' | 'talisman';
export type KnotPos = 'k1' | 'k2' | 'k3a' | 'k3b' | 'foot';
/** What a knot grows from: grown once any of these is (none: straight off the core). */
const ABOVE: Record<KnotPos, KnotPos[]> = { k1: [], k2: ['k1'], k3a: ['k2'], k3b: ['k2'], foot: ['k3a', 'k3b'] };

export interface Knot {
  vein: Vein;
  pos: KnotPos;
  kind: KnotKind;
  /** A knack's or a talisman's. */
  knack?: KnackId;
}

export const KNOT_NAME: Record<KnotKind, string> = { room: 'ROOM', imprint: 'IMPRINT', knack: 'KNACK', talisman: 'TALISMAN' };

// --- learning --------------------------------------------------------------------------------

/** What the core takes in to grow its next knot, from this many grown: each a little more. */
export const toGrow = (grown: number) => 7 + 3 * grown;

/** What each kind of flying feeds its vein. */
export const FEED = {
  // nerve
  perfects: 2, // a point per this many
  grazes: 15,
  clean: 3,
  flawless: 2,
  // steel
  takedown: 1,
  bigTakedown: 3,
  edges: 25,
  fullClear: 2,
  // grease
  weld: 2,
  revive: 2,
  scrap: 30,
};

/** Room in the core to start with. */
export const ROOM = 3;
/** Knots grown when the core wakes. */
export const WAKE_AT = 6;

/** What a fight fed each vein, and why. */
export interface Fed {
  vein: Record<Vein, number>;
  lines: { vein: Vein; text: string; n: number }[];
}

/** A woken core: what it calls itself, and the vein it was fed most (how it talks). */
export interface Nemva {
  name: string;
  /** The vein fed most when it woke: its manner. */
  temper: Vein;
}

/** A pilot's core: this run's, lost at its end. */
export interface Core {
  /** Taken in towards the next knot, and the veins fed since the last one grew (where it may grow). */
  learnt: number;
  fed: Vein[];
  /** Knots it may grow now. */
  growths: number;
  tree: Knot[];
  grown: boolean[];
  /** What each vein has been fed, all run (its temper when it wakes). */
  life: Record<Vein, number>;
  /** Imprints copied, and the ones held, in the order taken up (the newest is shaken loose first). */
  owned: ImprintId[];
  held: ImprintId[];
  /** Woken: a nemva. */
  woke: Nemva | null;
}

/** The veins for a run: each vein's knacks and talisman, and where its room and imprint fall. */
export function rollTree(r: Rng): Knot[] {
  const out: Knot[] = [];
  for (const vein of VEINS) {
    const knacks = shuffle(r, KNACK_LIST.filter((k) => k.vein === vein && !k.talisman)).slice(0, 2);
    const talisman = shuffle(r, KNACK_LIST.filter((k) => k.vein === vein && k.talisman))[0];
    // the four over the foot: a room, an imprint, two knacks (always a knack in the top two)
    let kinds: KnotKind[];
    do kinds = shuffle(r, ['room', 'imprint', 'knack', 'knack'] as KnotKind[]);
    while (kinds[0] !== 'knack' && kinds[1] !== 'knack');
    let n = 0;
    (['k1', 'k2', 'k3a', 'k3b'] as KnotPos[]).forEach((pos, k) => out.push({ vein, pos, kind: kinds[k], knack: kinds[k] === 'knack' ? knacks[n++].id : undefined }));
    out.push({ vein, pos: 'foot', kind: 'talisman', knack: talisman.id });
  }
  return out;
}

export function newCore(seed: number): Core {
  const tree = rollTree(rng(seed ^ 0xc0d5));
  return { learnt: 0, fed: [], growths: 0, tree, grown: tree.map(() => false), life: { nerve: 0, steel: 0, grease: 0 }, owned: [], held: [], woke: null };
}

/** Can knot `k` grow off what's grown (whatever was fed)? */
export function reaches(c: Core, k: number) {
  if (c.grown[k]) return false;
  const kn = c.tree[k];
  const above = ABOVE[kn.pos];
  return !above.length || above.some((pos) => c.grown[c.tree.findIndex((o) => o.vein === kn.vein && o.pos === pos)]);
}

/**
 * Can knot `k` grow now? It reaches, and it's on a vein that was fed; if none of the fed veins
 * has a knot left to reach, anywhere it reaches.
 */
export function canGrow(c: Core, k: number) {
  if (!reaches(c, k)) return false;
  const open = c.tree.map((_, i) => i).filter((i) => reaches(c, i));
  const fed = open.filter((i) => c.fed.includes(c.tree[i].vein));
  return fed.length ? c.fed.includes(c.tree[k].vein) : true;
}

export const grownCount = (c: Core) => c.grown.filter(Boolean).length;
/** Room in the core: three, and a room knot's each. */
export const roomOf = (c: Core) => ROOM + c.tree.filter((k, i) => c.grown[i] && k.kind === 'room').length;
/** The knacks and talismans grown. */
export const knacksOf = (c: Core): KnackId[] => c.tree.filter((k, i) => c.grown[i] && k.knack).map((k) => k.knack!);
/** Holding past its room (by one imprint at most). */
export const leaning = (c: Core) => weightOf(c.held) > roomOf(c);

/**
 * Can an imprint be taken up? Any that fits the room; or one past it, as long as the core isn't
 * leaning already.
 */
export function canHold(c: Core, id: ImprintId) {
  if (c.held.includes(id)) return false;
  return weightOf(c.held) + IMPRINTS[id].weight <= roomOf(c) || !leaning(c);
}

/** What a fight fed the core: it learns, and grows knots for what it learnt. Returns knots it may grow. */
export function learn(c: Core, fed: Fed) {
  let n = 0;
  for (const v of VEINS) {
    c.life[v] += fed.vein[v];
    n += fed.vein[v];
    if (fed.vein[v] > 0 && !c.fed.includes(v)) c.fed.push(v);
  }
  c.learnt += n;
  let grows = 0;
  // (a full tree learns nothing more)
  while (grownCount(c) + c.growths < c.tree.length && c.learnt >= toGrow(grownCount(c) + c.growths)) {
    c.learnt -= toGrow(grownCount(c) + c.growths);
    c.growths++;
    grows++;
  }
  return grows;
}

/** Grows knot `k`. Returns whether that woke the core. */
export function grow(c: Core, k: number) {
  c.grown[k] = true;
  c.growths = Math.max(0, c.growths - 1);
  // what it was fed is spent on what it grew
  if (!c.growths) c.fed = [];
  if (!c.woke && grownCount(c) >= WAKE_AT) {
    c.woke = wake(c);
    return true;
  }
  return false;
}

/** A nemva talks like what made it: its name is out of the pilots' cant, by the vein it was fed most. */
const NAMES: Record<Vein, string[]> = {
  nerve: ['WHISKER', 'NEEDLE', 'SKIM', 'KITE', 'FLINCH', 'HAIRLINE'],
  steel: ['RIVET', 'KNUCKLE', 'ANVIL', 'BRUISER', 'MALLET', 'SLAG'],
  grease: ['SOLDER', 'PATCH', 'OILCAN', 'MOTHER', 'GASKET', 'TINKER'],
};

function wake(c: Core): Nemva {
  const temper = VEINS.reduce((a, b) => (c.life[b] > c.life[a] ? b : a), 'nerve' as Vein);
  const r = rng(c.tree.length * 977 + c.life.nerve * 13 + c.life.steel * 7 + c.life.grease);
  return { name: NAMES[temper][Math.floor(r() * NAMES[temper].length)], temper };
}

/** Its first words, in its temper. */
export const FIRST_WORDS: Record<Vein, string[]> = {
  nerve: ['...THAT WAS CLOSE, WASN’T IT.', 'I KEPT FLINCHING. YOU NEVER DID.', 'SO THIS IS WHAT YOU SEE OUT THERE.'],
  steel: ['HIT IT AGAIN.', 'I LIKE IT WHEN THEY BREAK.', 'I REMEMBER EVERY ONE YOU PUT DOWN.'],
  grease: ['HOLD STILL. I’VE GOT YOU.', 'YOU KEEP FIXING ME. I NOTICED.', 'WE’RE STILL IN ONE PIECE. MOSTLY.'],
};

/** A woken core's barks in flight, by temper and what happened. */
export const BARKS: Record<Vein, Record<'perfect' | 'takedown' | 'weld' | 'hurt' | 'call', string[]>> = {
  nerve: {
    perfect: ['CLOSE.', 'AGAIN!', 'DIDN’T EVEN BLINK.', 'TOO SLOW FOR US.'],
    takedown: ['NICE.', 'DOWN IT GOES.'],
    weld: ['STEADY...', 'THERE.'],
    hurt: ['OW.', 'WATCH IT!', 'I FELT THAT.'],
    call: ['IT’S CALLING. I’M NOT GOING.', 'NO. I’M FLYING WITH YOU.'],
  },
  steel: {
    perfect: ['NOW HIT IT.', 'OPENING.'],
    takedown: ['YES!', 'BREAK!', 'ANOTHER.', 'THAT ONE’S OURS.'],
    weld: ['QUICK.', 'BACK IN IT.'],
    hurt: ['HIT THEM BACK.', 'THAT’S A DEBT.', 'I’M COUNTING THAT.'],
    call: ['YOU DON’T OWN ME. NOBODY DOES.', 'I SETTLE MY OWN DEBTS.'],
  },
  grease: {
    perfect: ['CAREFUL...', 'GOOD.'],
    takedown: ['MIND THE WRECKAGE.', 'SCOOP IT.'],
    weld: ['HOLD STILL.', 'GOOD AS NEW.', 'PATCHED.'],
    hurt: ['I’LL FIX IT.', 'EASY!', 'THAT’S GOING TO NEED A WELD.'],
    call: ['THIS IS MY CREW. I’M STAYING.', 'I KNOW YOUR VOICE BETTER.'],
  },
};

/**
 * Three imprints to choose from (none already copied): `lean` puts one of that vein's first.
 * `pool`: from these only.
 */
export function imprintOffer(r: Rng, c: Core, lean?: Vein, n = 3, pool?: ImprintId[]): ImprintId[] {
  const free = (pool ?? IMPRINT_LIST.filter((d) => !d.given).map((d) => d.id)).filter((id) => !c.owned.includes(id));
  const deck = shuffle(r, free);
  const out: ImprintId[] = [];
  if (lean) {
    const own = deck.find((id) => IMPRINTS[id].vein === lean && !IMPRINTS[id].faction);
    if (own) out.push(own);
  }
  // one faction's ways at most in an offer: four would crowd the rest out
  for (const id of deck) {
    if (out.length >= n) break;
    if (out.includes(id) || (IMPRINTS[id].faction && out.some((o) => IMPRINTS[o].faction))) continue;
    out.push(id);
  }
  return out;
}

/** The core copies an imprint (and takes it up, if there's room without leaning). Returns whether it was new. */
export function imprint(c: Core, id: ImprintId) {
  if (c.owned.includes(id)) return false;
  c.owned.push(id);
  if (weightOf(c.held) + IMPRINTS[id].weight <= roomOf(c)) c.held.push(id);
  return true;
}

/** An imprint gone for good (a policy paid out). */
export function forget(c: Core, id: ImprintId) {
  c.owned = c.owned.filter((o) => o !== id);
  c.held = c.held.filter((o) => o !== id);
}

/** What a level needs of a core. */
export interface CoreKit {
  held: ImprintId[];
  knacks: KnackId[];
  room: number;
  woke: Nemva | null;
}

export const kitOf = (c: Core): CoreKit => ({ held: [...c.held], knacks: knacksOf(c), room: roomOf(c), woke: c.woke });

/** A faction's ways held, as extra grafts towards their bonds. */
export const waysOf = (held: readonly ImprintId[]): Faction[] => held.map((id) => IMPRINTS[id].faction).filter((f): f is Faction => !!f);

/** The hull UNBENDING adds. */
export const UNBENDING_HULL = 20;
