/**
 * Keywords: the words a card uses that are a rule of their own (CHILL, an EDGE, a LINK, the
 * SWEEP), each said once, plainly, in its colour. Any card or panel can ask which of them its
 * text uses (`termsIn`) and lay them out beside itself (`keywordPanel`), opened with the INFO
 * button. The first time a run meets one, a screen can say it unasked (`firstTime`, intro.ts).
 */

import { LOAD_CLASS } from '../game/parts';
import { IMPRINT_LIST } from '../game/core';
import { REACTIONS } from '../sim/marks';
import { HULL_STEP } from '../sim/level';
import { MARK_COLOR, REACTION_COLOR } from './mark-icons';
import { drawText, wrap } from './font';
import { DARK, frame } from './hud';

export interface Term {
  id: string;
  word: string;
  color: string;
  text: string;
  /** Where it's used, in a card's (upper-case) words. */
  re: RegExp;
}

const T = (id: string, word: string, color: string, re: RegExp, text: string): Term => ({ id, word, color, re, text });
const reaction = (k: 'overload' | 'cookoff' | 'shatter') => REACTIONS.find((r) => r.kind === k)!;

const MARK = '#e0b0ff';
const BUILD = '#c8bcd8';
const FLY = '#6ad0ff';
const RUN = '#ffd04a';
const CORE = '#8affe0';

export const TERMS: Term[] = [
  // what hits leave
  T('marks', 'MARKS', MARK, /\bMARK(S|ED)?\b/, 'WHAT A HIT LEAVES ON AN ENEMY: BURN, SHOCK OR CRACK. TWO DIFFERENT MARKS ON ONE ENEMY REACT.'),
  T('burn', 'BURN', MARK_COLOR.burn, /\bBURN(S|ING|T)?\b|CATCHES FIRE|\bHEAT GUNS\b/, 'ON FIRE: IT TAKES DAMAGE EVERY MOMENT, MORE THE LONGER IT STAYS LIT. HEAT GUNS LEAVE IT.'),
  T('shock', 'SHOCK', MARK_COLOR.shock, /\bSHOCK(S|ED)?\b|\bARC\b/, 'ITS WORKS JAM: IT RUNS SLOW AND SEIZES NOW AND THEN. ARC GUNS LEAVE IT.'),
  T('crack', 'CRACK', MARK_COLOR.crack, /\bCRACK(S|ED)?\b|\bEXPLOSIVE\b/, 'ITS ARMOUR SPLITS: IT TAKES MORE FROM EVERYTHING. EXPLOSIVE GUNS LEAVE IT.'),
  T('overload', 'OVERLOAD', REACTION_COLOR.overload, /\bOVERLOAD\b/, `BURN + SHOCK. ${reaction('overload').text.toUpperCase()}`),
  T('cookoff', 'COOK-OFF', REACTION_COLOR.cookoff, /\bCOOK-OFF\b/, `BURN + CRACK. ${reaction('cookoff').text.toUpperCase()}`),
  T('shatter', 'SHATTER', REACTION_COLOR.shatter, /\bSHATTER\b/, `SHOCK + CRACK. ${reaction('shatter').text.toUpperCase()}`),
  T('chill', 'CHILL', '#9ad8ff', /\bCHILL(S|ED)?\b|\bFROZEN\b|\bFROST\b/, 'EACH CHILL SLOWS IT MORE. FOUR AND IT IS FROZEN SOLID: IT CAN\'T MOVE OR ACT. FIRE AND ICE PUT EACH OTHER OUT.'),
  T('blow', 'BLOW', '#ffffff', /\bBLOWS?\b|\bCASH(ES)? (THEM |IT )?IN\b|\bA SETUP\b/, 'A HIT THAT BREAKS PLATING: A HEAVY ROUND, A RAM, A CAUGHT SHOT, A CRIT, A BLAST. ON A SET-UP ENEMY (BURNING, SHOCKED, CRACKED, FROZEN, PINNED) IT CASHES THE SETUP IN: FLARE-UP, GROUND-OUT, BREACH, SMASH, NAILED. A GUN NEVER CASHES IN ITS OWN.'),
  T('flyby', 'FLY-BY', '#8affe0', /\bFLY-BY\b|\bTAGGED\b/, 'THE KESTREL\'S DASH TAGS EVERY FOE IT PASSES CLOSE TO WITHOUT TOUCHING (UP TO EIGHT). AS THE DASH ENDS, THE GUNS LOOSE A VOLLEY AT EACH ONE: A BLOW THAT BREAKS PLATING AND CARRIES THE GUNS\' MARKS. WEAVE THROUGH A FORMATION, THEN PAY THEM ALL BACK.'),
  T('ram', 'BATTERING RAM', '#ff9a4a', /\bRAM(S|MED)?\b|\bBATTERING\b/, 'THE HAMMERHEAD\'S DASH HITS WITH THE WHOLE HEAD. IT\'S A BLOW: IT BREAKS PLATING, AND A SECOND RAM TAKES THE REELING DOWN. EVERY FOE RAMMED GIVES THE DASH BACK SOONER.'),
  T('catch', 'THE CATCH', '#ffd060', /\bCATCH(ES)?\b|\bCAUGHT\b/, 'THE MAGPIE\'S PARRY THROWS SMALL SHOTS BACK AS BLOWS, AND EVERY SHOT IT CATCHES LOADS A HEAVY ROUND. BEAMS, HEAVY ROUNDS, MINES AND BODIES CAN\'T BE CAUGHT.'),
  T('pin', 'PIN', '#d8c0a0', /\bPIN(S|NED)?\b|\bNAIL(S|ED)?\b/, 'NAILED IN PLACE FOR A FEW SECONDS: IT STILL SHOOTS, BUT IT CAN\'T MOVE.'),
  T('shove', 'KNOCKED FLYING', '#d8c0a0', /\bKNOCK(S|ED)? .*FLYING\b|\bSHOVE\b|\bAIRBORNE\b/, 'A HARD HIT SENDS IT FLYING. A FLUNG BODY THAT HITS ANOTHER IS A BLOW TO BOTH.'),
  // how a gun fires
  T('edge', 'EDGE', '#ffa8d8', /\bEDGES?\b|\bCRITS?\b/, 'EVERY GUN HAS AN EDGE: THE MOMENT IT CRITS, FOR DOUBLE DAMAGE. IT SAYS HOW THE GUN WANTS FLYING.'),
  T('heavy', 'HEAVY', '#ff5a78', /\bHEAV(Y|IES)\b|\bROUNDS?\b/, 'HEAVY GUNS FIRE ON THEIR OWN BUTTON, A ROUND A PRESS. ROUNDS COME BACK ONE BY ONE; A PERFECT RELOADS ONE AT ONCE.'),
  T('heat', 'HEAT', '#ff9a6a', /\bHEAT\b|\bJAMS?\b|\bCOOL(ER|S)?\b/, 'EVERY SHOT HEATS THE GUN. AT FULL HEAT IT JAMS UNTIL IT COOLS. HEAVIES DON\'T HEAT.'),
  T('pierce', 'PIERCE', BUILD, /\bPIERCE\b/, 'A SHOT GOES ON THROUGH THIS MANY ENEMIES.'),
  // the build
  T('link', 'LINK', '#8affb0', /\bLINK(S|ED)?\b|\bNEEDS\b/, 'A PART THAT LINKS WANTS SOMETHING BESIDE IT ON THE GRID. LINKED, IT RUNS AT 150%. ONE THAT NEEDS ITS LINK DOES NOTHING WITHOUT IT.'),
  T('booster', 'BOOSTER', '#d08aff', /\bBOOSTERS?\b|GUNS IT TOUCHES/, 'HELPS ONLY THE GUNS IT TOUCHES ON THE GRID, SIDE TO SIDE OR END TO END.'),
  T('hardpoint', 'HARDPOINT', BUILD, /\bHARDPOINTS?\b|\bFITTING\b/, 'HOW MANY TOOLS EACH BUTTON TAKES: TRIGGER, HEAVY, AUX, SPECIAL. A TOOL GOES ON ANY SOCKET, IF ITS HARDPOINT IS FREE. ANYTHING ELSE IS A FITTING.'),
  T('load', 'LOAD', LOAD_CLASS.nimble.color, /\bLOAD\b|\bNIMBLE\b|\bOVERLOADED\b|\bSTEADY\b|\bCARRIES\b/, `EVERY PART WEIGHS. LIGHT IS NIMBLE (${LOAD_CLASS.nimble.text}). PAST FULL IS OVERLOADED (${LOAD_CLASS.overloaded.text}). ENGINES CARRY MORE.`),
  T('armour', 'ARMOUR', BUILD, /\bARMOUR\b/, 'TAKEN OFF EVERY HIT ON THE HULL, SO IT SAVES THE MOST AGAINST SMALL HITS.'),
  T('shield', 'SHIELD', '#6ae0ff', /\bSHIELDS?\b|\bDEFLECTOR\b/, 'SOAKS HITS BEFORE THE HULL DOES, AND REFILLS FROM A STORE EACH LEVEL.'),
  // the buttons
  T('aux', 'AUX', '#ffd04a', /\bAUX\b|\bPARR(Y|IES|IED)\b|\bRIPOSTE\b/, 'THE MAGPIE\'S BUTTON: ITS PARRY. A PARRY ON TIME IS A PERFECT; LATE, IT ONLY BLOCKS.'),
  T('special', 'SPECIAL', '#8affb0', /\bSPECIAL\b/, 'A BIG MOVE ON ITS OWN BUTTON. IT CHARGES SLOWLY BY ITSELF, AND FASTER AS YOU DEAL DAMAGE.'),
  T('dash', 'DASH', FLY, /\bDASH(ES|ED)?\b/, 'A QUICK DART YOU CAN\'T BE HIT IN. GUNS FIRED OUT OF A DASH STRIKE 50% HARDER. DASH MODS CHANGE WHAT IT DOES.'),
  T('perfect', 'PERFECT', FLY, /\bPERFECTS?\b/, 'A DASH OUT OF FIRE AT THE LAST MOMENT, OR A PARRY ON TIME. IT RELOADS A HEAVY ROUND, TOPS UP YOUR BOOST AND FEEDS THE CORE.'),
  T('graze', 'GRAZE', FLY, /\bGRAZ(E|ES|ED)\b/, 'A BULLET THAT ONLY JUST MISSES YOU. RISKY, AND IT FEEDS THE CORE.'),
  T('weld', 'WELD', '#d8b070', /\bWELD(S|ING)?\b/, 'HITTING THINGS FILLS THE WELD. FULL, LET GO OF THE TRIGGER AND HOLD FOCUS: A MOMENT LATER A HULL POINT COMES BACK. A HIT WHILE WELDING LOSES IT.'),
  T('reeling', 'REELING', FLY, /\bREEL(S|ING)?\b|\bSTAGGER(ED)?\b/, 'STUNNED, OR OPEN AFTER ITS ATTACK. FLY INTO A REELING ELITE FOR A TAKEDOWN, AND ITS WRECK IS YOURS.'),
  T('graft', 'GRAFT', '#e0a0ff', /\bGRAFTS?\b|\bBOND\b/, 'A MOVE TAKEN OFF A WRECK YOU BEAT, BOLTED ONTO ONE BUTTON. ONE A BUTTON. THREE FROM ONE FACTION WAKE ITS BOND.'),
  // the run
  T('grades', 'GRADES', RUN, /\b(C|A)\+|\bGRADES?\b/, 'A GAME\'S SCORE AS A LETTER: F UNDER 25%, C 25%, A 55%, S 85%. A ROW MARKED C+ COMES ON A C OR BETTER.'),
  T('bounty', 'BOUNTY', '#ff7a6a', /\bBOUNTY\b|\bPRICE ON (YOU|YOUR)\b/, 'A PRICE ON YOU, 40 SCRAP A STEP. EVERY STEP MAKES A HUNTER LIKELIER TO FIND YOU WHEREVER YOU LAND.'),
  T('rep', 'REP', '#8affb0', /\b(PORT AUTH|VANTORR|SCAVS|REEF PIRATES|CARTEL|HESK|THE HIVE|TALKWA|SCAV CLANS)\b [+-]\d|LIKE YOU (MORE|LESS)/, 'HOW A FACTION FEELS ABOUT YOU. AT +2 ITS DEALERS SELL CHEAPER; AT -2 THEY CHARGE MORE AND ITS SITES COME HARDER.'),
  T('sweep', 'THE SWEEP', '#ff8a6a', /\bSWEEP\b|\bWATCH(ES)?\b/, 'THE SYNDICATE\'S NET, CROSSING THE CHART A WATCH AT A TIME (A JUMP OR A WAIT IS A WATCH). WHAT IT PASSES IS LOST. CAUGHT, YOU FIGHT YOUR WAY TO THE GATE.'),
  T('debt', 'DEBT', '#ff7a6a', /\bDEBT\b|\bOWE\b|\bLEND\b|\bINTEREST\b/, 'SCRAP YOU OWE, GROWING WITH EVERY JUMP. STILL UNPAID AT THE GATE, THEY COME TO COLLECT.'),
  T('hold', 'THE HOLD', RUN, /\bTHE HOLD\b|\bHOLD \d/, 'PARTS YOU PICK UP WAIT IN THE HOLD, DOING NOTHING, UNTIL YOU FIT THEM TO YOUR SHIP IN THE HANGAR. A FULL HOLD TURNS NEW PARTS TO SCRAP.'),
  T('fuel', 'FUEL', '#ffb04a', /\bFUEL\b|\bHOP\b|\bLONG JUMP\b/, `A HOP TAKES ONE, A LONG JUMP TWO. DOCKS AND DEALERS SELL MORE. OUT OF FUEL, A JUMP BURNS ${HULL_STEP} HULL A STEP.`),
  T('elite', 'ELITE', RUN, /\bELITES?\b/, 'A SITE LED BY AN ELITE: NAMED, ARMOURED, HARD. BREAK ITS ARMOUR AND IT REELS; TAKE IT DOWN AND ITS WRECK IS YOURS.'),
  T('dangerpay', 'DANGER PAY', RUN, /\bDANGER PAY\b/, 'THE MORE DANGER PIPS A SITE HAS, THE MORE ITS SCRAP IS WORTH.'),
  T('alert', 'ON ALERT', '#ff8a7a', /\bON ALERT\b/, 'ONE PLANET A SECTOR IS ON ALERT: EVERY SITE ON IT A DANGER PIP HARDER, AND RICHER FOR IT.'),
  T('crate', 'CRATE', RUN, /\bCRATE TO\b|\bDELIVER\b/, 'A DELIVERY. LAND ANYWHERE ON THAT PLANET AND IT PAYS.'),
  T('favour', 'FAVOUR', '#c8a0ff', /\bOWES YOU\b|\bFAVOUR\b/, 'SOMEONE OWES YOU. THEY PAY IT BACK LATER, BY THEMSELVES, WHEN IT COUNTS.'),
  // the core
  T('core', 'THE CORE', CORE, /\bCORE\b/, 'YOUR SHIP\'S HEART. IT LEARNS HOW YOU FLY: EVERY FIGHT FEEDS ITS VEINS, AND ENOUGH GROWS A KNOT. IT CAN COPY PEOPLE TOO: IMPRINTS.'),
  T('imprint', 'IMPRINT', CORE, /\bIMPRINTS?\b|\bCOPIES\b/, 'A HABIT THE CORE COPIED OFF SOMEONE, WITH A RULE OF ITS OWN. EACH TAKES ROOM; TWO THAT AGREE LIGHT AN AGREEMENT.'),
  T('vein', 'VEINS', CORE, /\bVEINS?\b|\bNERVE\b|\bSTEEL\b|\bGREASE\b|\bFED\b/, 'NERVE, STEEL AND GREASE: THREE WAYS OF FLYING. A FIGHT FEEDS THE VEINS YOU FLEW THAT WAY, AND A KNOT ONLY GROWS ON A VEIN YOU FED.'),
  T('knot', 'KNOTS', CORE, /\bKNOTS?\b|\bKNACKS?\b|\bTALISMAN\b/, 'WHAT GROWS ON A VEIN. A KNACK IS A RULE FOR GOOD; ROOM HOLDS ONE MORE IMPRINT; AN IMPRINT KNOT COPIES ONE OF THREE. THE TALISMAN AT THE FOOT IS THE BIG ONE.'),
  T('room', 'ROOM', CORE, /\bROOM\b|\bLEANS?\b/, 'HOW MUCH THE CORE CAN HOLD. ONE IMPRINT PAST ITS ROOM AND IT LEANS: EVERY HIT SHAKES THE NEWEST LOOSE FOR THE LEVEL.'),
];

const BY_ID = new Map(TERMS.map((t) => [t.id, t]));
export const term = (id: string) => BY_ID.get(id);

/** Every imprint by name, as a keyword: what the core would copy, and the rule it brings. */
const IMPRINT_TERMS: Term[] = IMPRINT_LIST.map((d) =>
  T(`imprint:${d.id}`, d.name, d.color, new RegExp(d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[’']/g, "['’]")), `${d.text}. TAKES ${d.weight} ROOM IN THE CORE.`),
);

/** The keywords some text uses, in the order the glossary lists them (a named imprint first). */
export function termsIn(...texts: string[]): Term[] {
  const s = texts.join(' \n ').toUpperCase();
  return [...IMPRINT_TERMS, ...TERMS].filter((t) => t.re.test(s));
}

const PAD = 6;

/** How tall the panel would be. */
export function keywordHeight(terms: Term[], w: number) {
  if (!terms.length) return 0;
  return PAD * 2 + 10 + terms.reduce((h, t) => h + 10 + wrap(t.text, w - PAD * 2 - 4).length * 9 + 4, -4);
}

/**
 * The keywords, stacked in a panel: each word in its colour on a tab, what it means under it.
 * Cut short (with how many more) if it won't fit `maxH`. Returns the height drawn.
 */
export function keywordPanel(ctx: CanvasRenderingContext2D, terms: Term[], x: number, y: number, w: number, maxH = 999, a = 1) {
  if (!terms.length) return 0;
  let shown = terms;
  while (shown.length > 1 && keywordHeight(shown, w) + (shown.length < terms.length ? 10 : 0) > maxH) shown = shown.slice(0, -1);
  const more = terms.length - shown.length;
  const h = keywordHeight(shown, w) + (more ? 10 : 0);
  ctx.globalAlpha = a;
  frame(ctx, x, y, w, h, 'rgba(14,10,22,0.97)', '#5a4e68');
  drawText(ctx, 'KEYWORDS', x + PAD, y + PAD, '#8a7e9a');
  let ty = y + PAD + 12;
  for (const t of shown) {
    // the word on a tab of its own colour
    const tw = t.word.length * 6 + 6;
    ctx.fillStyle = t.color;
    ctx.fillRect(x + PAD, ty - 1, 2, 9);
    ctx.globalAlpha = a * 0.16;
    ctx.fillRect(x + PAD, ty - 1, tw + 2, 9);
    ctx.globalAlpha = a;
    drawText(ctx, t.word, x + PAD + 5, ty, t.color, { shadow: DARK });
    ty += 10;
    for (const l of wrap(t.text, w - PAD * 2 - 4)) {
      drawText(ctx, l, x + PAD + 5, ty, '#cfc4dc');
      ty += 9;
    }
    ty += 4;
  }
  if (more) drawText(ctx, `+${more} MORE`, x + PAD, ty - 2, '#8a7e9a');
  ctx.globalAlpha = 1;
  return h;
}

// --- the first time ------------------------------------------------------------------------

const KEY = 'rustwing.firsts';
let seen: Set<string> | null = null;

function load() {
  if (seen) return seen;
  try {
    seen = new Set(JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]') as string[]);
  } catch {
    seen = new Set();
  }
  return seen;
}

/** Whether this is the first time the player meets a thing (and, from now on, it isn't). */
export function firstTime(id: string) {
  const s = load();
  if (s.has(id)) return false;
  s.add(id);
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify([...s]));
  } catch {
    // (no storage: it's said again next time, which is no harm)
  }
  return true;
}

/** Whether it's been met already, without counting this as meeting it. */
export const metBefore = (id: string) => load().has(id);
