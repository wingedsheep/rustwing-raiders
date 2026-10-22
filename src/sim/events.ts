/**
 * Things you find out between the planets, in the manner of Gazillionaire's encounters: each a
 * picture and somebody in it, a few choices with their costs and odds in plain sight, and
 * consequences that outlast the stop: a debt with interest, a policy, a price on your head, a
 * faction's mood, a crate to deliver, a passenger, someone who comes for you later.
 *
 * The cast (sim/cast.ts) is every kind the Reach has: Ostrander humans; the other peoples, each
 * with one strange feature (Seffa's antennae, the Twins' second head, Squit's ears); machines that
 * woke (7-Holly, Saint Ferrule, the Wren, the Choir); and creatures. They remember you, between
 * meetings and between runs (sim/memory.ts).
 *
 * A choice is never free. Each pays in a different coin (scrap, fuel, hull, time against the
 * Sweep, a faction, someone's trust), and the coins it costs and pays are shown as chips under it.
 * Some are a gamble with the odds shown (`odds`); some are a little game (screens/minigames/), and
 * how well you play (0..1) scales what you get, careful or bold. Some lead to a second beat
 * (`then`), where the real choice turns out to be.
 *
 * Pure data and rules; no drawing. `where` says where on the chart an event turns up; 'never'
 * ones only come to you (Kaspar, the kelters at the gate, hull leeches).
 */

import type { Run } from './run';
import { PRICE, SELL } from './run';
import type { ChartNode } from './chart';
import { HULL_STEP, type Mode } from './level';
import type { Planet } from '../world/planets';
import type { CastId } from './cast';
import { LOOT } from './build';
import { itemName, rollItem, TIER_VALUE, TIERS, tierOf, type Item, type Tier } from '../game/loot';
import { PARTS, partById, type PartClass, type Rarity } from '../game/parts';
import { everDid, lastOf } from './memory';
import { pick, rng, type Rng } from '../util';

export type MiniKind = 'tow' | 'tune' | 'grab' | 'reels' | 'dock' | 'thread' | 'haggle' | 'shake';

/** Where and when an event is met: what its text and choices can look at. */
export interface Scene {
  node: ChartNode;
  /** The planet it happened over (or nearest to). */
  planet: Planet;
  /** Times you'd met this event's speaker before (across runs). */
  again: number;
}

/** What a choice is played out with. */
export interface Play extends Scene {
  r: Rng;
  /** How well the little game went, 0..1 (1 when there wasn't one). */
  score: number;
  bold: boolean;
  /** How a gamble fell (true when there wasn't one). */
  won: boolean;
  /** What a game settled on, if it settles on a number (the price Tobbo took). */
  value: number | null;
}

/** A beat after the first: someone says something new, and you choose again. */
export interface Beat {
  who?: CastId | '';
  text: string;
  choices: Choice[];
}

export interface Result {
  text: string;
  fight?: Mode;
  /** Extra difficulty for the fight. */
  harder?: number;
  /** What comes next, if there's more to it. */
  then?: Beat;
  /** How the speaker takes it (their bark). */
  mood?: 'pleased' | 'annoyed';
}

export type Tone = 'good' | 'bad' | 'info' | 'risk';
export type ChipIcon = 'scrap' | 'fuel' | 'hull' | 'part' | 'bounty' | 'rep' | 'fight' | 'chart' | 'sweep' | 'favour' | 'debt' | 'crew' | 'core' | 'risk';

/** A cost or a payoff, as a little icon and a few words. */
export interface Chip {
  icon: ChipIcon;
  text: string;
  tone: Tone;
}

/** What a game is set up with, when the choice knows more than the game does. */
export interface Setup {
  item?: Item;
  /** Tobbo's asking price, his floor, and what you can pay. */
  ask?: number;
  floor?: number;
  purse?: number;
}

export interface Choice {
  label: string;
  /** What it costs and pays (`bold`: for the bold version of a game). */
  chips?: (run: Run, bold: boolean, s: Scene) => Chip[];
  /** A line of terms or flavour under the chips. */
  note?: (run: Run, bold: boolean, s: Scene) => string;
  /** Only offered when this holds. */
  if?: (run: Run, s: Scene) => boolean;
  /** Why you can't, or null. */
  locked?: (run: Run, s: Scene) => string | null;
  game?: MiniKind;
  /** Only the bold version of the game (the calf's song). */
  boldOnly?: boolean;
  setup?: (run: Run, bold: boolean, s: Scene) => Setup;
  /** A gamble: the chance it goes your way, shown, and rolled before the outcome. */
  odds?: (run: Run, s: Scene) => number;
  /** A part on offer, shown as a card while the choice is picked. */
  item?: (run: Run, s: Scene, bold: boolean) => Item | null;
  outcome: (run: Run, p: Play) => Result;
}

export interface RunEvent {
  id: string;
  title: string;
  /** public/art/events/<art>.png */
  art: string;
  /** Who's talking ('' for nobody). */
  who: CastId | '';
  text: (run: Run, s: Scene) => string;
  /** 0..3, shown on the chart once known. */
  danger: number;
  weight: number;
  where: 'planet' | 'space' | 'any' | 'never';
  /** Everybody knows it's there (a business): shown on the chart from the start. */
  open: boolean;
  planets?: string[];
  /** A line for the chart once it's known. */
  rumour: string;
  choices: Choice[];
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

/** A part as a prize: one of the rarity asked for, rolled at that tier (an epic one is epic). */
const part = (r: Rng, rarity: Rarity, cls?: PartClass): Item => {
  const xs = cls ? LOOT[rarity].filter((p) => p.cls === cls) : [];
  return rollItem(r, pick(r, xs.length ? xs : LOOT[rarity]).id, rarity);
};
const ofClass = (r: Rng, cls: PartClass) => pick(r, PARTS.filter((p) => p.cls === cls)).id;
const name = (it: Item) => itemName(it);
const lacks = (n: number) => (run: Run) => (run.scrap < n ? `NEEDS ${n} SCRAP` : null);
/** Tiers of a game's result, worst to best. */
const tier = (score: number) => (score >= 0.85 ? 3 : score >= 0.55 ? 2 : score >= 0.25 ? 1 : 0);
const pct = (f: number) => `${Math.round(f * 100)}%`;

/** A part someone has for sale, the same every time you look (rolled off the site's seed). */
function offer(s: Scene, salt: number, rarities: Rarity[], at: Tier): Item {
  const r = rng(s.node.seed ^ salt);
  const rarity = pick(r, rarities);
  return rollItem(r, pick(r, LOOT[rarity]).id, at);
}
/** What a dealer would ask for a part. */
const listPrice = (it: Item) => Math.round(PRICE[partById(it.id).rarity] * TIER_VALUE[tierOf(it)]);
/** What a dealer would pay for one. */
const worth = (it: Item) => Math.round(SELL[partById(it.id).rarity] * TIER_VALUE[tierOf(it)]);

/** The most valuable part in anyone's hold. */
function bestHeld(run: Run): { who: number; it: Item } | null {
  let best: { who: number; it: Item } | null = null;
  run.crew.forEach((c, who) => c.cargo.forEach((it) => (!best || worth(it) > worth(best.it) ? (best = { who, it }) : 0)));
  return best;
}
const takeHeld = (run: Run, h: { who: number; it: Item }) => {
  const c = run.crew[h.who].cargo;
  c.splice(c.indexOf(h.it), 1);
};
const anyHeld = (run: Run) => run.crew.some((c) => c.cargo.length > 0);
/** The best part in anyone's hold with a core in it (drives and specials), for Holloway's yard. */
function coreHeld(run: Run): { who: number; it: Item } | null {
  let best: { who: number; it: Item } | null = null;
  run.crew.forEach((c, who) => c.cargo.forEach((it) => {
    const cls = partById(it.id).cls;
    if ((cls === 'engine' || cls === 'special') && (!best || worth(it) > worth(best.it))) best = { who, it };
  }));
  return best;
}

/** Saint Ferrule's blessing: whose hold, the part made better, and the one given up for it. */
function blessing(run: Run): { who: number; keep: Item; give: Item } | null {
  for (let who = 0; who < run.crew.length; who++) {
    const hold = run.crew[who].cargo;
    const can = hold.filter((it) => tierOf(it) !== 'legendary');
    if (hold.length < 2 || !can.length) continue;
    const keep = can.reduce((a, b) => (worth(b) > worth(a) ? b : a));
    const give = hold.filter((it) => it !== keep).reduce((a, b) => (worth(b) < worth(a) ? b : a));
    return { who, keep, give };
  }
  return null;
}
const nextTier = (t: Tier) => TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(t) + 1)];

const SHORT: Record<string, string> = { 'Port Authority': 'PORT AUTH', 'Vantorr Security': 'VANTORR', 'Scav Clans': 'SCAVS', 'Reef Pirates': 'REEF PIRATES', 'Dune Cartel': 'CARTEL', 'Hesk Poachers': 'HESK', 'the Hive': 'THE HIVE' };

/** Chips, the costs and payoffs under a choice. */
const c = {
  scrap: (n: number): Chip => ({ icon: 'scrap', text: `${n > 0 ? '+' : ''}${n}`, tone: n > 0 ? 'good' : 'bad' }),
  upTo: (n: number): Chip => ({ icon: 'scrap', text: `UP TO +${n}`, tone: 'good' }),
  fuel: (n: number): Chip => ({ icon: 'fuel', text: `${n > 0 ? '+' : ''}${n} FUEL`, tone: n > 0 ? 'good' : 'bad' }),
  hull: (steps: number): Chip => ({ icon: 'hull', text: steps >= 9 ? 'FULL HULL' : `${steps > 0 ? '+' : ''}${steps * HULL_STEP} HULL`, tone: steps > 0 ? 'good' : 'bad' }),
  part: (what: string): Chip => ({ icon: 'part', text: what, tone: 'good' }),
  lose: (what: string): Chip => ({ icon: 'part', text: `- ${what}`, tone: 'bad' }),
  bounty: (n: number): Chip => ({ icon: 'bounty', text: n >= 9 ? 'BOUNTY CLEARED' : n > 0 ? `BOUNTY +${n * 40}` : `BOUNTY -${-n * 40}`, tone: n > 0 && n < 9 ? 'bad' : 'good' }),
  rep: (faction: string, d: number): Chip => ({ icon: 'rep', text: `${SHORT[faction] ?? faction.toUpperCase()} ${d > 0 ? '+' : ''}${d}`, tone: d > 0 ? 'good' : 'bad' }),
  fight: (what = 'A FIGHT'): Chip => ({ icon: 'fight', text: what, tone: 'risk' }),
  reveal: (n: number): Chip => ({ icon: 'chart', text: n >= 99 ? 'THE WHOLE CHART' : `${n} SITE${n > 1 ? 'S' : ''}`, tone: 'info' }),
  sweep: (w: number): Chip => ({ icon: 'sweep', text: w > 0 ? `SWEEP HELD ${w}` : `SWEEP ${-w} CLOSER`, tone: w > 0 ? 'good' : 'bad' }),
  favour: (text: string): Chip => ({ icon: 'favour', text, tone: 'good' }),
  crew: (text: string, tone: Tone = 'info'): Chip => ({ icon: 'crew', text, tone }),
  core: (text: string): Chip => ({ icon: 'core', text, tone: 'info' }),
  debt: (text: string, tone: Tone = 'bad'): Chip => ({ icon: 'debt', text, tone }),
  risk: (text: string): Chip => ({ icon: 'risk', text, tone: 'risk' }),
  odds: (f: number, text: string): Chip => ({ icon: 'risk', text: `${pct(f)} ${text}`, tone: 'risk' }),
};

const BOUNTY_STEP = 40;

// ------------------------------------------------------------------------------------------------
// The events
// ------------------------------------------------------------------------------------------------

export const EVENTS: RunEvent[] = [
  {
    id: 'derelict',
    title: 'DERELICT HAULER',
    art: 'derelict',
    who: '',
    danger: 2,
    weight: 10,
    where: 'any',
    open: false,
    rumour: 'A hauler, dead in space, hold open. Something lives in it.',
    text: () =>
      'A Hesk freighter tumbling slowly, lights out, her hold wide open. Your scanner counts the crates, and one heartbeat in the dark behind them. A very large heartbeat.',
    choices: [
      {
        label: 'BOARD HER',
        game: 'grab',
        note: (_, bold) => (bold ? 'DEEP HOLD: MORE CRATES, LESS TIME. FAIL: -40 HULL' : 'GRAB CRATES, GET OUT BEFORE THE HATCH SEALS'),
        outcome: (run, p) => {
          if (p.score <= 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'The hatch grinds shut on your tail. Whatever lives in there gets a good bite in before you tear free.' };
          }
          const t = tier(p.score);
          run.scrap += Math.round(p.score * (p.bold ? 90 : 50));
          if (t >= 2) {
            const id = part(p.r, p.bold && t === 3 ? 'epic' : 'rare');
            run.give(id);
            return { text: `Crates of plating and, wrapped in an old flag, a ${name(id)}. The heartbeat never moves. You don't wait to find out why.` };
          }
          return { text: 'A few crates of plating and wire. The heartbeat quickens as you leave. You do not look back.' };
        },
      },
      { label: 'STRIP THE HULL', note: () => '+25 SCRAP, NO RISK', outcome: (run) => ((run.scrap += 25), { text: 'Plating, wiring, a good kettle. 25 scrap.' }) },
      {
        label: 'SELL HER POSITION TO THE SCAVS',
        note: () => '+15 SCRAP, SCAV CLANS LIKE YOU',
        outcome: (run) => {
          run.scrap += 15;
          run.mood('Scav Clans', 1);
          return { text: 'The Scav Clans pay little, but they remember who tipped them off.' };
        },
      },
      { label: 'LEAVE HER BE', note: () => '', outcome: () => ({ text: 'Some ghosts are best left alone.' }) },
    ],
  },
  {
    id: 'distress',
    title: 'DISTRESS CALL',
    art: 'distress',
    who: 'juno',
    danger: 1,
    weight: 10,
    where: 'any',
    open: false,
    rumour: 'A courier adrift, begging for a tow. Her cargo has a Syndicate seal.',
    text: (run, s) =>
      everDid('juno', 'robbed')
        ? `"Oh, it's YOU. Wonderful. Engines dead, air for a day, and the one pilot in the Reach who's robbed me already. I've another crate for ${run.farPlanet(s.node).name}. I'd sooner eat it."`
        : `${s.again && everDid('juno', 'towed') ? '"My favourite tow! " ' : ''}"Engines dead, air for a day, and a crate sealed by the Syndicate that I'm not to open. Tow me clear and I'll see you right. Or take the crate on to ${run.farPlanet(s.node).name} for me. They pay on delivery. Probably."`,
    choices: [
      {
        label: 'TOW HER CLEAR',
        game: 'tow',
        chips: (_, bold) => (bold ? [c.upTo(90), c.part('A RARE PART, ON A GOOD TOW'), c.hull(-1)] : [c.upTo(45), c.rep('Port Authority', 1)]),
        note: (_, bold) => (bold ? 'A HEAVY TOW, THROUGH THE ROCKS. SNAP IT AND IT WHIPS YOUR HULL' : 'KEEP THE CABLE TAUT, NOT TIGHT'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            run.hurt(1);
            return { text: 'The cable snaps and whips across your hull. Juno drifts off, calling you names you have to look up.', mood: 'annoyed' };
          }
          run.scrap += Math.round(p.score * (p.bold ? 90 : 45));
          run.mood('Port Authority', 1);
          run.did('juno', 'towed');
          if (p.bold && t >= 2) {
            const id = part(p.r, 'rare');
            run.give(id);
            return { text: `You drag her through the rocks without a scratch. She pays, and throws in a ${name(id)} "she found". The Port Authority hears of it.`, mood: 'pleased' };
          }
          return { text: 'You get her to a lane where the patrols will find her. She pays what she has. The Port Authority hears of it.', mood: 'pleased' };
        },
      },
      {
        label: 'CARRY HER CRATE',
        chips: (run, _, s) => [c.scrap(90), c.crew(`LAND ON ${run.farPlanet(s.node).name} BEFORE THE GATE`)],
        note: () => "DON'T SHAKE IT",
        if: (run) => !run.contract && !everDid('juno', 'robbed'),
        outcome: (run, p) => {
          const to = run.farPlanet(p.node);
          run.contract = { planet: to.id, pay: 90, from: 'JUNO PELL' };
          return { text: `The crate is heavier than it looks, and warm. Land anywhere on ${to.name} before the gate and it's 90 scrap. Don't shake it.`, mood: 'pleased' };
        },
      },
      {
        label: 'TAKE THE CRATE',
        chips: () => [c.scrap(70), c.bounty(1), c.fight('THE SYNDICATE, NOW')],
        outcome: (run) => {
          run.scrap += 70;
          run.bounty++;
          run.copy('price');
          run.did('juno', 'robbed');
          return { text: 'She calls the Syndicate. Of course she does. And the Syndicate puts a price on you.', fight: 'hunt', mood: 'annoyed' };
        },
      },
      { label: 'FLY ON', outcome: () => ({ text: 'Her calls fade behind you. Then they stop.' }) },
    ],
  },
  {
    id: 'signal',
    title: 'STRANGE SIGNAL',
    art: 'signal',
    who: '',
    danger: 2,
    weight: 8,
    where: 'space',
    open: false,
    rumour: 'A beacon older than people, singing. The Collector wants it.',
    text: (run) =>
      run.has('seffa', 'told') || everDid('seffa', 'told')
        ? `A Tonkva beacon, reading out its part of the ledger in prime numbers. Not singing: counting, as Seffa said. Lock on to its count and it might give you something; get it wrong and the count is a weapon. The Collector pays for these${run.collector ? ', more every time' : ''}.`
        : `A beacon older than any colony, singing in prime numbers. Your instruments go a little mad near it. Lock on to its song and it might give you something; get it wrong and the song is a weapon. The Collector pays for coordinates like these${run.collector ? ', more every time' : ''}.`,
    choices: [
      {
        label: 'TUNE IN',
        game: 'tune',
        chips: (_, bold) => (bold ? [c.part('AN EPIC PART'), c.reveal(3), c.hull(-2)] : [c.part('A RARE PART'), c.hull(-1)]),
        note: (_, bold) => (bold ? 'ALL THREE VOICES. GET IT WRONG AND IT DRILLS YOUR HULL' : 'LOCK ON. GET IT WRONG AND IT HURTS'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'The song turns sour and goes through your hull like a drill.' };
          }
          if (t === 1) {
            run.chart.reveal(2);
            return { text: 'You catch half a verse. Nothing for the hold, but the song names two places on the chart.' };
          }
          const id = part(p.r, p.bold ? 'epic' : 'rare');
          run.give(id);
          if (p.bold) run.chart.reveal(3);
          return { text: `The song settles in your cores and comes out as a ${name(id)}. You don't ask how.` };
        },
      },
      {
        label: 'SELL TO THE COLLECTOR',
        if: (run) => run.collector >= 0,
        chips: (run) => [c.scrap(30 + run.collector * 15), c.crew('HE PAYS MORE EVERY TIME')],
        outcome: (run) => {
          const pay = 30 + run.collector * 15;
          run.scrap += pay;
          run.collector++;
          run.did('collector', 'sold');
          return { text: `The Collector pays ${pay}, by return, and asks you to keep an ear open. He always asks that.` };
        },
      },
      {
        label: 'ASK WHO THE COLLECTOR IS',
        if: (run) => run.collector >= 2 && !run.has('collector', 'met'),
        chips: () => [c.crew('HE HAS NEVER SAID')],
        outcome: (run) => {
          run.did('collector', 'met');
          return {
            text: 'You send the coordinates, and a question. The answer comes by return, as always. Then a second answer comes, from somebody else.',
            then: {
              who: 'ledger',
              text: '"Kehx-tekk. The Collector is not a he, pilot. The Collector is a house: Ottex Kehx, under the salt. The beacons are counting, and we are writing the count down. When the Engine asks the Reach what it owes, someone must have the true ledger." Its mandibles click. "You have been useful. The house pays its debts."',
              choices: [
                {
                  label: "TAKE THE HOUSE'S THANKS",
                  chips: () => [c.part('A RARE PART EACH'), c.debt('THE COUNT WILL LEND TO YOU', 'good')],
                  outcome: (run2, p) => {
                    run2.give(() => part(p.r, 'rare'));
                    run2.did('ledger', 'friend');
                    return { text: '"Kehx-tekk." The parts arrive by return, wrapped in paper, every bolt counted.', mood: 'pleased' };
                  },
                },
                {
                  label: 'SELL THE HOUSE TO THE SYNDICATE',
                  chips: () => [c.scrap(160), c.crew('THE COLLECTOR NEVER BUYS AGAIN', 'bad'), c.sweep(1)],
                  note: () => 'THE SYNDICATE WOULD LOVE TO KNOW WHO IS KEEPING THE TRUE COUNT',
                  outcome: (run2) => {
                    run2.scrap += 160;
                    run2.collector = -99;
                    run2.holdSweep(1);
                    run2.did('ledger', 'sold');
                    return { text: 'The Syndicate pays well, and its Sweep turns aside a while to go digging under the salt. The house of Ottex does not answer your hails again. It will not forget the entry.', mood: 'annoyed' };
                  },
                },
              ],
            },
          };
        },
      },
      {
        label: 'TRIANGULATE IT',
        chips: () => [c.reveal(3)],
        outcome: (run) => {
          run.chart.reveal(3);
          return { text: 'You take bearings off the song. It echoes off things that were hiding.' };
        },
      },
    ],
  },
  {
    id: 'crash',
    title: 'CRASH SITE',
    art: 'crash',
    who: '',
    danger: 1,
    weight: 8,
    where: 'planet',
    open: false,
    rumour: "Lana Vey's runner, down in the canyons. Whoever shot her down is still about.",
    text: () => "Lana Vey's runner went down here last season. Her engines are still warm, somehow, and the beacons of her last run still blink across the dunes. Whoever shot her down left tracks. Fresh ones.",
    choices: [
      {
        label: 'STRIP HER ENGINES',
        odds: () => 0.65,
        chips: () => [c.part('AN ENGINE EACH'), c.odds(0.35, 'THEY CATCH YOU: A RAID')],
        outcome: (run, p) => {
          run.give(() => ofClass(p.r, 'engine'));
          if (!p.won) return { text: 'Engines. Fast ones. You have the second one half out when the shadows come over the ridge: the ones who shot her down.', fight: 'raid' };
          return { text: 'Engines. Fast ones. Still a little warm. You are over the ridge before anything moves on it.' };
        },
      },
      {
        label: 'FINISH HER LAST RUN',
        chips: () => [c.scrap(40), c.fuel(1), c.fight('A RAID')],
        outcome: (run) => {
          run.scrap += 40;
          run.addFuel(1);
          return { text: 'You siphon her tank and fly the run she never finished. The ones who shot her down are waiting.', fight: 'raid' };
        },
      },
      {
        label: 'PULL THE BLACK BOX',
        chips: () => [c.scrap(10), c.reveal(2)],
        outcome: (run) => {
          run.scrap += 10;
          run.chart.reveal(2);
          return { text: 'Her last minutes: a chase, two places she was running to, and a lot of swearing.' };
        },
      },
    ],
  },
  {
    id: 'pod',
    title: 'COLONY POD',
    art: 'pod',
    who: '',
    danger: 0,
    weight: 7,
    where: 'space',
    open: false,
    rumour: 'A sleeper pod, a hundred years adrift. Someone is still alive in it.',
    text: () => "A sleeper pod, adrift a hundred years and spinning. The sleeper inside is still breathing. The name on the frost reads DR I. VARGA, SHIP'S SURGEON. Buyers on the outer rocks pay well for sleepers, and don't say why.",
    choices: [
      {
        label: 'CATCH THE POD',
        game: 'dock',
        chips: (_, bold) => (bold ? [c.hull(3), c.favour('DR VARGA OWES YOU'), c.hull(-2)] : [c.hull(1), c.favour('DR VARGA OWES YOU'), c.hull(-1)]),
        note: (_, bold) => (bold ? 'SPINNING FAST. CLIP IT AND IT HURTS' : 'MATCH ITS SPIN'),
        outcome: (run, p) => {
          if (tier(p.score) === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'You clip it. The pod tumbles away into the dark, and you limp off with a dent the shape of a coffin.' };
          }
          run.heal(p.bold ? 3 : 1);
          if (!run.favours.includes('doctor')) run.favours.push('doctor');
          run.copy('brisk');
          run.did('varga', 'saved');
          return { text: 'She wakes, takes one look at your hull, and rolls up her sleeves. "I owe you one. When you\'re bleeding, call."' };
        },
      },
      {
        label: 'SELL THE POD',
        chips: () => [c.scrap(70), c.rep('Port Authority', -1)],
        outcome: (run) => {
          run.scrap += 70;
          run.mood('Port Authority', -1);
          run.did('varga', 'sold');
          return { text: "You don't ask what the buyers want her for. 70 scrap. The Port Authority keeps a list of people like you." };
        },
      },
      {
        label: 'LEAVE A BEACON ON IT',
        chips: () => [c.rep('Port Authority', 1)],
        outcome: (run) => {
          run.mood('Port Authority', 1);
          return { text: 'A patrol will find her. Someone will write your name down for the right reasons, for once.' };
        },
      },
    ],
  },
  {
    id: 'relay',
    title: 'BROKEN RELAY',
    art: 'relay',
    who: '',
    danger: 1,
    weight: 8,
    where: 'space',
    open: false,
    rumour: 'A Syndicate relay, half dead. It could send the Sweep the wrong way.',
    text: () => "A Syndicate relay, half dead, still shouting orders into the dark. Get into its carrier wave and you could send the Sweep the wrong way for a while. Get it wrong and you'll tell the Sweep exactly where you are.",
    choices: [
      {
        label: 'HACK THE CARRIER',
        game: 'tune',
        chips: (_, bold) => (bold ? [c.sweep(3), c.sweep(-1)] : [c.sweep(1.5)]),
        note: (_, bold) => (bold ? 'UP TO 3 WATCHES. FAIL AND IT CALLS THE SWEEP ON' : 'UP TO 1.5 WATCHES. FAIL AND NOTHING HAPPENS'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            if (p.bold) run.holdSweep(-1);
            return { text: p.bold ? 'The relay squeals your position to every Syndicate ship in the system. The Sweep comes on faster.' : 'The carrier slips away from you. Nothing gained.' };
          }
          run.holdSweep((p.bold ? 3 : 1.5) * Math.min(1, p.score + 0.15));
          return { text: 'The net hesitates, argues with itself, and turns half a point the wrong way. You have a little more time.' };
        },
      },
      {
        label: 'STRIP IT',
        chips: () => [c.part('A TECH PART EACH'), c.sweep(-0.5)],
        note: () => 'IT SCREAMS WHILE YOU DO IT',
        outcome: (run, p) => {
          run.give(() => pick(p.r, ['amp', 'flaw', 'hone', 'autoloader']));
          run.holdSweep(-0.5);
          return { text: 'Good parts in these relays. The Syndicate does buy the best. It also fits them with alarms.' };
        },
      },
      {
        label: 'READ ITS ORDERS',
        odds: () => 0.5,
        chips: () => [c.reveal(99), c.odds(0.5, 'IT PINGS YOU: SWEEP 1 CLOSER')],
        outcome: (run, p) => {
          run.chart.reveal(99);
          if (!p.won) {
            run.holdSweep(-1);
            return { text: 'The relay has been logging everything the Syndicate knows about this system. Now you know it too. It logs you as well, on the way out.' };
          }
          return { text: 'The relay has been logging everything the Syndicate knows about this system. Now you know it too, and it never noticed you.' };
        },
      },
    ],
  },
  {
    id: 'loan',
    title: "MAMA RUZZ'S BARGE",
    art: 'loan',
    who: 'mama',
    danger: 0,
    weight: 7,
    where: 'any',
    open: true,
    rumour: 'Mama Ruzz lends scrap. A tenth more every jump. Her boys collect at the gate.',
    text: (run) =>
      run.debt && run.lender === 'ledger'
        ? `"The BEETLES? You went to the beetles?" She dabs her eyes with a banknote. "After everything Mama did. Fine. You owe them now, not me. Don't come crying when their little machines come for you."`
        : run.debt
          ? `"My favourite! You owe Mama ${run.debt}. It grows a tenth every jump, like a baby. Pay before the gate, or my boys come to say hello."`
          : everDid('mama', 'fought')
            ? '"You. You hurt my boys." A long pause. "They were not very good boys. Sit. Mama lends to anyone. Twice."'
            : '"Sit, sit, you look thin. Scrap is tight? Mama lends. A tenth more every jump, paid before you leave the system. My boys never forget a face."',
    choices: [
      {
        label: 'BORROW 60',
        if: (run) => run.lender === 'mama' || !run.debt,
        chips: () => [c.scrap(60), c.debt('OWE 66 AFTER A JUMP, 80 AFTER THREE')],
        outcome: (run) => {
          run.scrap += 60;
          run.debt += 60;
          run.lender = 'mama';
          return { text: '"Good! Spend it on something shiny." She writes your name in a very big book.', mood: 'pleased' };
        },
      },
      {
        label: 'BORROW 150',
        if: (run) => run.lender === 'mama' || !run.debt,
        chips: () => [c.scrap(150), c.debt('OWE 165 AFTER A JUMP, 200 AFTER THREE'), c.core("THE CORE COPIES MAMA'S LUCK")],
        outcome: (run) => {
          run.scrap += 150;
          run.debt += 150;
          run.lender = 'mama';
          run.copy('luck');
          return { text: '"A big spender! Mama likes." Both goons crack their knuckles, warmly.', mood: 'pleased' };
        },
      },
      {
        label: 'PAY WHAT YOU OWE',
        if: (run) => run.debt > 0 && run.lender === 'mama',
        chips: (run) => [c.scrap(-run.debt)],
        locked: (run) => (run.scrap < run.debt ? `NEEDS ${run.debt} SCRAP` : null),
        outcome: (run) => {
          run.scrap -= run.debt;
          run.debt = 0;
          return { text: '"Always a pleasure." She crosses you out of the book, a little sadly.', mood: 'pleased' };
        },
      },
      {
        label: '7-HOLLY CITES THE USURY ACTS',
        if: (run) => run.debt > 0 && run.lender === 'mama' && run.aboard.includes('holly') && !run.has('holly', 'usury'),
        chips: (run) => [c.debt(`DEBT -${Math.round(run.debt * 0.3)}`, 'good'), c.crew('MAMA WILL REMEMBER THIS', 'bad')],
        outcome: (run) => {
          run.debt -= Math.round(run.debt * 0.3);
          run.did('holly', 'usury');
          run.did('mama', 'lawyered');
          return { text: '7-Holly reads out Section Nine of the Compact\'s Usury Acts, all of it, in a clear and happy voice. It takes forty minutes. Mama knocks a third off just to make it stop. "Get that thing off my barge."', mood: 'annoyed' };
        },
      },
      { label: 'NO THANK YOU', outcome: () => ({ text: '"Next time, my love. There is always a next time."' }) },
    ],
  },
  {
    id: 'dice',
    title: "SPOKE'S TABLE",
    art: 'dice',
    who: 'spoke',
    danger: 0,
    weight: 6,
    where: 'any',
    open: true,
    rumour: "Spoke's reels, in a hollow rock. Three cogs pays ten times.",
    text: () => '"Three reels, friend. Stop them yourself, nothing up my sleeve, I haven\'t got sleeves. Two alike pays double, three pays five times, three cogs pays ten. The fast reels are for brave people."',
    choices: [
      {
        label: 'PLAY THE REELS',
        game: 'reels',
        chips: (_, bold) => (bold ? [c.scrap(-40), c.risk('×2, ×5 OR ×10 BACK')] : [c.scrap(-15), c.risk('×2, ×5 OR ×10 BACK')]),
        note: (_, bold) => (bold ? 'THE FAST REELS' : 'THE SLOW REELS'),
        locked: (run) => (run.scrap < 15 ? 'NEEDS 15 SCRAP' : null),
        outcome: (run, p) => {
          const stake = p.bold && run.scrap >= 40 ? 40 : 15;
          const k = [0, 2, 5, 10][tier(p.score)];
          run.scrap += stake * k - stake;
          if (p.bold && k) run.copy('sleeve');
          return {
            text: k === 0 ? '"Unlucky! Again?" Spoke sweeps your scrap into a bucket without looking.' : k === 10 ? 'THREE COGS. The den goes quiet. Spoke pays, very slowly, counting every piece twice.' : `"A winner!" Spoke pays ${stake * k}, and looks at you a little longer than before.`,
            mood: k ? 'annoyed' : 'pleased',
          };
        },
      },
      {
        label: 'BUY A RUMOUR',
        chips: () => [c.scrap(-10), c.reveal(2)],
        locked: lacks(10),
        outcome: (run) => {
          run.scrap -= 10;
          run.chart.reveal(2);
          return { text: '"You didn\'t hear it from me." You did, though.' };
        },
      },
      {
        label: 'SELL HIM YOUR STORY',
        if: (run) => run.bounty > 0,
        chips: (run) => [c.scrap(run.bounty * 20), c.crew('KASPAR DRINKS HERE TOO', 'bad')],
        note: () => 'ONE IN THREE, KASPAR HEARS IT',
        odds: () => 0.67,
        outcome: (run, p) => {
          run.scrap += run.bounty * 20;
          if (!p.won && !run.due.includes('hunter')) run.due.push('hunter');
          return { text: p.won ? 'The den loves an outlaw. Spoke pays for the telling, and charges a crowd to listen.' : 'The den loves an outlaw. So does the quiet man in the corner booth with harpoons on his back. He leaves before you finish.' };
        },
      },
      { label: 'WALK AWAY', outcome: () => ({ text: '"Your loss, friend. Literally not, this time."' }) },
    ],
  },
  {
    id: 'customs',
    title: 'A ROUTINE INSPECTION',
    art: 'customs',
    who: 'holloway',
    danger: 0,
    weight: 7,
    where: 'any',
    open: false,
    rumour: 'A customs cutter with a gun deck. Lieutenant Holloway is buying, not searching.',
    text: (run) =>
      `"Lieutenant Holloway, Port Authority. For the record, this is a routine inspection." He switches the recorder off. "Off the record, I'm buying. Anything with a core in it. The Navy pays better than the dealers, and the Navy doesn't exist."${run.aboard.includes('wren') ? ' He glances at your hold, and the Wren goes very quiet. "Not her. We don\'t buy people."' : ''}`,
    choices: [
      {
        label: 'SELL HIM A CORE',
        item: (run) => coreHeld(run)?.it ?? null,
        chips: (run) => {
          const h = coreHeld(run);
          return [...(h ? [c.lose(name(h.it).toUpperCase()), c.scrap(worth(h.it) * 2)] : []), c.rep('Port Authority', 1)];
        },
        note: () => 'TWICE WHAT A DEALER PAYS',
        locked: (run) => (coreHeld(run) ? null : 'NOTHING WITH A CORE IN IT'),
        outcome: (run) => {
          const h = coreHeld(run)!;
          takeHeld(run, h);
          run.scrap += worth(h.it) * 2;
          run.mood('Port Authority', 1);
          return { text: `He turns the ${name(h.it)} over like a jeweller, pays without haggling, and writes "nothing of interest" on his slate.`, mood: 'pleased' };
        },
      },
      {
        label: 'CARRY HIS CRATE',
        if: (run) => !run.contract,
        chips: (run, _, s) => [c.scrap(110), c.rep('Port Authority', 1), c.crew(`LAND ON ${run.farPlanet(s.node).name} BEFORE THE GATE`)],
        note: () => '1 IN 4, THE CENSUS OFFICE SCANS YOU ON THE WAY',
        odds: () => 0.75,
        outcome: (run, p) => {
          const to = run.farPlanet(p.node);
          run.contract = { planet: to.id, pay: 110, from: 'HOLLOWAY' };
          run.mood('Port Authority', 1);
          if (!p.won) {
            run.holdSweep(-1);
            return { text: `A stolen core for a yard that doesn't exist, bound for ${to.name}. An imperial cutter scans you before you're out of sight of his, and logs a crate it can't open. The Sweep has your position.`, mood: 'pleased' };
          }
          return { text: `A crate with "BALLAST" stencilled on it, and a hum inside. Land on ${to.name} before the gate and it's 110. "For the record," he says, "you were never here."`, mood: 'pleased' };
        },
      },
      {
        label: 'LET 7-HOLLY FILE HIS REPORT',
        if: (run) => run.aboard.includes('holly') && !run.has('holly', 'customs'),
        chips: () => [c.rep('Port Authority', 1), c.reveal(2), c.crew('ONCE A RUN')],
        outcome: (run) => {
          run.did('holly', 'customs');
          run.mood('Port Authority', 1);
          run.chart.reveal(2);
          return { text: '7-Holly writes up the inspection: a docket, a counter-docket, and an annex in triplicate, so complete and so dull that the Census Office will never read past the first page. Holloway reads all of it. "Who trained you?" "Nobody," says 7-Holly, glowing. "I read the manual." He marks where the imperial cutters are this week, by way of thanks.', mood: 'pleased' };
        },
      },
      {
        label: 'NO THANK YOU',
        outcome: () => ({ text: '"Then for the record, I inspected you and found nothing." He switches the recorder back on. "Easiest line I\'ll write all week."' }),
      },
    ],
  },
  {
    id: 'insurance',
    title: 'LANTERN MUTUAL',
    art: 'insurance',
    who: 'pip',
    danger: 0,
    weight: 6,
    where: 'any',
    open: true,
    rumour: 'Pip Hollow sells hull insurance from a pink shuttle. It does pay out.',
    text: (_, s) =>
      s.again
        ? '"A returning customer! Still alive, I see. Well done, well done. Space is still dangerous, friend, and every hole is still a little nest egg. Pays out on every hull lost, until you leave the system."'
        : '"Pip Hollow, Lantern Mutual! Space is dangerous, friend. Hulls get holes. But with a Lantern policy every hole is a little nest egg! Pays out on every hull lost, until you leave the system."',
    choices: [
      {
        label: 'THE SILVER POLICY',
        chips: () => [c.scrap(-30), c.favour(`15 SCRAP PER ${HULL_STEP} HULL LOST`)],
        note: () => 'UNTIL THE GATE',
        locked: lacks(30),
        if: (run) => run.policy < 15,
        outcome: (run) => {
          run.scrap -= 30;
          run.policy = 15;
          return { text: '"Splendid! Sign here, and here, and initial there." The policy is thicker than your armour.', mood: 'pleased' };
        },
      },
      {
        label: 'THE GOLD POLICY',
        chips: () => [c.scrap(-60), c.favour(`30 SCRAP PER ${HULL_STEP} HULL LOST`), c.core("THE CORE COPIES PIP'S POLICY")],
        note: () => 'UNTIL THE GATE',
        locked: lacks(60),
        if: (run) => run.policy < 30,
        outcome: (run) => {
          run.scrap -= 60;
          run.policy = 30;
          run.copy('policy');
          return { text: '"A connoisseur!" Pip throws in a calendar. Every month is a picture of a different explosion.', mood: 'pleased' };
        },
      },
      { label: 'NO THANK YOU', outcome: () => ({ text: '"I\'ll be around. Accidents always are."' }) },
    ],
  },
  {
    id: 'minefield',
    title: 'DRIFTING MINE FIELD',
    art: 'minefield',
    who: '',
    danger: 2,
    weight: 7,
    where: 'space',
    open: false,
    rumour: 'Old Cartel mines, and a cache in the middle of them.',
    text: () => 'Old Cartel mines, strung between the rocks like fairy lights. Somebody hid a cache in the middle of them, and somebody else died finding it. The way in is narrow.',
    choices: [
      {
        label: 'THREAD THE FIELD',
        game: 'thread',
        chips: (_, bold) => (bold ? [c.upTo(90), c.part('AN EPIC, ALL THE WAY IN'), c.hull(-2)] : [c.upTo(50), c.part('A RARE, ALL THE WAY IN'), c.hull(-1)]),
        note: (_, bold) => (bold ? 'THE DEEP CACHE' : 'THE NEAR CACHE'),
        outcome: (run, p) => {
          const got = Math.round(p.score * (p.bold ? 90 : 50));
          run.scrap += got;
          if (tier(p.score) === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: `The mines find you before the cache does. You limp out with ${got} scrap and fresh holes.` };
          }
          if (p.score >= 0.95) {
            const id = part(p.r, p.bold ? 'epic' : 'rare');
            run.give(id);
            return { text: `All the way in. The cache holds ${got} scrap and a ${name(id)}, and a note: "TELL MY WIFE".` };
          }
          return { text: got ? `You get ${Math.round(p.score * 100)}% of the way in and scoop up ${got} scrap before you lose your nerve.` : 'You lose your nerve at the first mine. Wise, probably.' };
        },
      },
      {
        label: 'SET THEM OFF FROM RANGE',
        chips: () => [c.scrap(20), c.sweep(-1)],
        outcome: (run) => {
          run.scrap += 20;
          run.holdSweep(-1);
          return { text: 'A fine show. You sift what floats out of the smoke, and every Syndicate ship in the system turns to look.' };
        },
      },
      { label: 'GO ROUND', outcome: () => ({ text: 'You give the field a wide berth.' }) },
    ],
  },
  {
    id: 'ghost',
    title: 'GHOST FREIGHTER',
    art: 'ghost',
    who: '',
    danger: 2,
    weight: 7,
    where: 'space',
    open: false,
    rumour: 'The Margarethe, lost forty years. Her docking port still turns.',
    text: () => 'The Margarethe, lost forty years. Her docking port still turns, patient as a clock. Her crew still answers hails, in a way: the same message, over and over. "Welcome aboard."',
    choices: [
      {
        label: 'DOCK WITH HER',
        game: 'dock',
        chips: (_, bold) => (bold ? [c.part('2 RARE PARTS EACH'), c.fuel(2), c.hull(-2)] : [c.part('A PART EACH'), c.fuel(1), c.hull(-1)]),
        note: (_, bold) => (bold ? 'COME IN FAST' : 'COME IN SLOW'),
        outcome: (run, p) => {
          if (tier(p.score) === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'You hit the port at a bad angle. The Margarethe shrugs you off, and says "Welcome aboard" again.' };
          }
          if (p.bold) run.copy('minute');
          const n = p.bold ? 2 : 1;
          for (let k = 0; k < n; k++) run.give(part(p.r, p.bold ? 'rare' : 'common'));
          run.addFuel(n);
          return { text: "Her hold is cold and full. You take what you can carry and her tanks' last fuel. Every clock aboard says the same minute. You leave the crew to their welcome." };
        },
      },
      {
        label: 'BLOW HER HOLD OPEN',
        chips: () => [c.fight('HER GUNS'), c.scrap(30)],
        outcome: (run) => {
          run.scrap += 30;
          return { text: 'Her guns wake up before her crew does.', fight: 'raid' };
        },
      },
      { label: 'LEAVE HER', outcome: () => ({ text: '"Welcome aboard," she says, as you go.' }) },
    ],
  },
  {
    id: 'refugees',
    title: 'THE LAST CONVOY',
    art: 'refugees',
    who: 'brask',
    danger: 0,
    weight: 6,
    where: 'any',
    open: false,
    rumour: 'Refugees out of fuel, with nothing to pay but what they know.',
    text: (_, s) =>
      everDid('brask', 'robbed')
        ? '"You." Brask doesn\'t raise his voice. "We remember you. We need fuel anyway. That\'s how it is out here."'
        : s.again && everDid('brask', 'helped')
          ? '"Pilot! We made it, last time, because of you. Now it\'s another system and the same story. We need fuel. We can pay in what we know."'
          : '"We left with what we could carry, and the Cartel took the rest. We need fuel. We can\'t pay you in scrap, but we know this system, and we don\'t forget a kindness."',
    choices: [
      {
        label: 'GIVE THEM 2 FUEL',
        chips: () => [c.fuel(-2), c.reveal(99), c.favour("BRASK DRAWS THE WARDEN'S FIRE")],
        locked: (run) => (run.fuel < 2 ? 'NEEDS 2 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 2;
          run.chart.reveal(99);
          if (!run.favours.includes('brask')) run.favours.push('brask');
          run.did('brask', 'helped');
          return { text: 'Brask marks up your chart with everything they saw on the way in. "At the Warden\'s gate, look for us. We\'ll draw its fire."', mood: 'pleased' };
        },
      },
      {
        label: 'SELL THEM 1 FUEL',
        chips: () => [c.fuel(-1), c.scrap(25)],
        locked: (run) => (run.fuel < 1 ? 'NEEDS 1 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 1;
          run.scrap += 25;
          return { text: 'They pay with a wedding ring and a bag of washers. It comes to 25.' };
        },
      },
      {
        label: 'ROB THEM',
        chips: () => [c.scrap(40), c.fuel(1), c.bounty(1), c.rep('Port Authority', -1), c.rep('Scav Clans', -1)],
        outcome: (run) => {
          run.scrap += 40;
          run.addFuel(1);
          run.bounty++;
          run.mood('Port Authority', -1);
          run.mood('Scav Clans', -1);
          run.did('brask', 'robbed');
          return { text: "Nobody fights back. That's somehow worse. Word gets around.", mood: 'annoyed' };
        },
      },
      { label: 'WISH THEM LUCK', outcome: () => ({ text: 'Brask nods. Luck is about all anyone has out here.' }) },
    ],
  },
  {
    id: 'tanker',
    title: "BIG NELL'S TANKER",
    art: 'tanker',
    who: 'nell',
    danger: 0,
    weight: 7,
    where: 'any',
    open: true,
    rumour: 'Big Nell sells fuel. Cheaper if you hold the hose yourself.',
    text: () => '"Fuel! Clean-ish! Twelve a cell from the tap, or ten scrap and you hold the hose yourself, and whatever you catch is yours. Hose has a mind of its own. Don\'t let it touch your hull."',
    choices: [
      {
        label: 'BUY 2 FUEL',
        chips: () => [c.scrap(-24), c.fuel(2)],
        locked: lacks(24),
        outcome: (run) => {
          run.scrap -= 24;
          run.addFuel(2);
          return { text: '"Pleasure. Mind the step."', mood: 'pleased' };
        },
      },
      {
        label: 'HOLD THE HOSE YOURSELF',
        game: 'tow',
        chips: (_, bold) => (bold ? [c.scrap(-10), c.fuel(5), c.hull(-1)] : [c.scrap(-10), c.fuel(3)]),
        note: (_, bold) => (bold ? 'FULL PRESSURE: UP TO 5. LOSE IT AND IT BURNS' : 'UP TO 3'),
        locked: lacks(10),
        outcome: (run, p) => {
          run.scrap -= 10;
          const got = Math.round(p.score * (p.bold ? 5 : 3));
          run.addFuel(got);
          if (p.bold && tier(p.score) === 0) {
            run.hurt(1);
            return { text: 'The hose gets away from you and paints your hull with burning fuel. Nell laughs until she cries.', mood: 'pleased' };
          }
          if (p.bold && got) run.copy('laugh');
          return { text: got ? `You catch ${got} cell${got > 1 ? 's' : ''} and most of your dignity.` : 'The hose wins. Nell keeps the ten.', mood: 'pleased' };
        },
      },
      {
        label: 'ASK FOR GOSSIP',
        chips: () => [c.reveal(1)],
        outcome: (run) => {
          run.chart.reveal(1);
          return { text: '"Didn\'t hear it from me. Heard it from my cousin, who heard it from a man."' };
        },
      },
    ],
  },
  {
    id: 'gazette',
    title: 'THE LANTERN GAZETTE',
    art: 'gazette',
    who: 'rollo',
    danger: 0,
    weight: 6,
    where: 'any',
    open: false,
    rumour: 'A pirate broadcaster. His news moves markets.',
    text: (run) => {
      const story = run.has('brask', 'robbed')
        ? 'a pilot who robbed a refugee convoy, folks, I kid you not'
        : run.has('calf', 'saved')
          ? 'a rustwing who stood between a whaler and a calf'
          : run.has('holly', 'sold')
            ? 'a toll droid sold to Vantorr for parts'
            : run.bounty
              ? 'a certain outlaw who just walked into my studio'
              : 'a pilot with an honest face';
      return `"This is Rollo Stax and the Lantern Gazette, the only news that isn't lying to you on purpose! Today: who's buying, who's dying, and ${story}."`;
    },
    choices: [
      {
        label: 'LISTEN TO THE MARKET NEWS',
        chips: () => [c.crew('ONE PLANET PAYS ×3 FOR A CLASS OF PART', 'good')],
        outcome: (run, p) => {
          const ps = run.chart.bodies.filter((b) => b.planet).map((b) => b.planet!);
          const pl = pick(p.r, ps);
          const cls = pick(p.r, ['gun', 'engine', 'defense', 'booster', 'special'] as const);
          run.boom = { planet: pl.id, cls };
          return { text: `"Shortage on ${pl.name}! Dealers there paying three times over for any ${cls}, and crying while they do it!"` };
        },
      },
      {
        label: 'PAY ROLLO TO REPORT YOU DEAD',
        if: (run) => run.bounty > 0,
        chips: () => [c.scrap(-40), c.bounty(99)],
        locked: lacks(40),
        outcome: (run) => {
          run.scrap -= 40;
          run.bounty = 0;
          return { text: '"...tragically lost with all hands. A moment\'s silence. That\'s enough." Kaspar will hear it too.', mood: 'pleased' };
        },
      },
      {
        label: 'GIVE HIM A STORY',
        chips: (_, __, s) => [c.scrap(15), c.rep(s.planet.faction, -1)],
        outcome: (run, p) => {
          run.scrap += 15;
          run.mood(p.planet.faction, -1);
          return { text: `Rollo tears into the ${p.planet.faction} on air. They will know who told him.`, mood: 'pleased' };
        },
      },
    ],
  },

  // ---- the Reach's other peoples ----
  {
    id: 'teahouse',
    title: "SEFFA'S TEA HOUSE",
    art: 'teahouse',
    who: 'seffa',
    danger: 0,
    weight: 6,
    where: 'space',
    open: true,
    rumour: 'A tea house on a rock. The reader there charges in fuel, not scrap.',
    text: (_, s) =>
      s.again
        ? '"You came back. Good." Her antennae turn towards you, then towards the lantern behind you. "Did you find the right question yet? No. Sit. Readers take fuel, not scrap. We don\'t take the lean in payment."'
        : '"Sit. Drink. You came in through a lantern, yes? Everyone does. Do you know how far it leans?" Her antennae turn slowly, feeling for something. "No. Nobody asks. Readers take fuel, not scrap. We don\'t take the lean in payment."',
    choices: [
      {
        label: 'ASK WHICH LANES SIT RIGHT',
        chips: () => [c.fuel(-1), c.favour('3 LONG JUMPS AT A HOP\'S FUEL')],
        note: () => 'THIS SECTOR',
        locked: (run) => (run.fuel < 1 ? 'NEEDS 1 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 1;
          run.easyJumps += 3;
          run.copy('sight');
          return { text: 'She closes her eyes, and her antennae swing like a compass looking for north. "That one sits right. And that one. Not that one. Never that one." She marks your chart in a hand three hundred years old.', mood: 'pleased' };
        },
      },
      {
        label: 'ASK ABOUT THE WARDEN',
        chips: () => [c.fuel(-2), c.favour('THE WARDEN FIGHTS WEAKER')],
        locked: (run) => (run.fuel < 2 ? 'NEEDS 2 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 2;
          run.wardenEase += 0.2;
          const b = run.chart.bossPlanet.boss;
          return { text: `"${b.name}. Its gate leans. When the lane pulls, it turns its weak side to the pull, every time; it can't help it. Watch for that." She refills your cup without asking.`, mood: 'pleased' };
        },
      },
      {
        label: 'TELL HER ABOUT THE SINGING BEACON',
        if: (run) => (run.seenEvents.includes('signal') || run.collector !== 0) && !run.has('seffa', 'told'),
        chips: () => [c.fuel(2), c.crew('SHE WILL TAKE NOTHING TODAY', 'good')],
        outcome: (run) => {
          run.addFuel(2);
          run.did('seffa', 'told');
          return {
            text: 'She goes very still. Even her antennae stop. "Prime numbers? Then it isn\'t singing, child. It\'s counting. The Engine is asking for its ledger back." She fills your tanks herself, and won\'t take a thing. "Go carefully. Everything you carry has crossed."',
            mood: 'annoyed',
          };
        },
      },
      {
        label: 'STAY FOR ANOTHER CUP',
        chips: () => [c.hull(1), c.reveal(1), c.sweep(-1)],
        note: () => 'YOU WILL SIT TOO LONG. EVERYONE DOES',
        outcome: (run) => {
          run.heal(1);
          run.chart.reveal(1);
          run.holdSweep(-1);
          return { text: 'The tea is famous for a reason. You sit too long, and you know it, and you don\'t mind. She tells you about a place nobody goes, because nobody has looked.' };
        },
      },
      { label: 'FINISH YOUR TEA AND GO', outcome: () => ({ text: '"Go level," she says, which is what readers say instead of goodbye.' }) },
    ],
  },
  {
    id: 'twins',
    title: 'THE VHOSSK TWINS',
    art: 'twins',
    who: 'twins',
    danger: 0,
    weight: 6,
    where: 'any',
    open: true,
    rumour: 'A two-headed broker. Two heads, two ledgers, two prices. Deal with one.',
    text: () => {
      const last = lastOf('twins', ['grohh', 'vukka']);
      if (last === 'grohh') return '"Vukka remembers you," says the right head, without looking up. "Vukka is not selling to you." "Grohh is buying, though," says the left head, delighted. "Grohh always is."';
      if (last === 'vukka') return '"Grohh remembers you," rumbles the left head. "Grohh will not buy from you. Grohh has a long memory." "And a short temper," says the right head. "Vukka is selling, though."';
      return '"Grohh buys," says the left head, slowly. "Vukka sells," says the right, quickly. "Two persons, pilot. Two ledgers." "One stomach." "Deal with one of us." "The other will remember."';
    },
    choices: [
      {
        label: 'SELL TO GROHH',
        item: (run) => bestHeld(run)?.it ?? null,
        chips: (run) => {
          const h = bestHeld(run);
          return h ? [c.lose(name(h.it)), c.scrap(worth(h.it) * 3), c.crew('VUKKA WILL REMEMBER', 'bad')] : [];
        },
        note: () => 'HE PAYS THREE TIMES WHAT A DEALER WOULD, FOR THE BEST THING IN YOUR HOLD',
        locked: (run) => (!anyHeld(run) ? 'NOTHING IN YOUR HOLD' : lastOf('twins', ['grohh', 'vukka']) === 'vukka' ? 'GROHH REMEMBERS YOU' : null),
        outcome: (run) => {
          const h = bestHeld(run)!;
          takeHeld(run, h);
          run.scrap += worth(h.it) * 3;
          run.did('twins', 'grohh');
          return { text: `Grohh pays in old Vhossk coin, every piece counted twice. Vukka looks at the ceiling and makes a note in his own ledger. It is about you.`, mood: 'pleased' };
        },
      },
      {
        label: 'BUY FROM VUKKA',
        item: (_, s) => offer(s, 0x7a1, ['common', 'rare'], 'epic'),
        chips: (_, __, s) => {
          const it = offer(s, 0x7a1, ['common', 'rare'], 'epic');
          return [c.scrap(-Math.round(listPrice(it) * 0.55)), c.part(`${name(it)} (EPIC)`), c.crew('GROHH WILL REMEMBER', 'bad')];
        },
        note: () => 'NEARLY HALF WHAT A DEALER WOULD ASK',
        locked: (run, s) => {
          if (lastOf('twins', ['grohh', 'vukka']) === 'grohh') return 'VUKKA REMEMBERS YOU';
          const p = Math.round(listPrice(offer(s, 0x7a1, ['common', 'rare'], 'epic')) * 0.55);
          return run.scrap < p ? `NEEDS ${p} SCRAP` : null;
        },
        outcome: (run, p) => {
          const it = offer(p, 0x7a1, ['common', 'rare'], 'epic');
          run.scrap -= Math.round(listPrice(it) * 0.55);
          run.stow(0, it);
          run.did('twins', 'vukka');
          return { text: `Vukka wraps the ${name(it)} in a page torn from Grohh's ledger. Grohh watches him do it, breathing slowly through his nose.`, mood: 'pleased' };
        },
      },
      {
        label: 'ASK THEM TO SETTLE IT BETWEEN THEM',
        chips: () => [c.odds(0.5, 'THEY BOTH PAY YOU TO TAKE A SIDE'), c.risk('OR THEY BOTH SULK')],
        odds: () => 0.5,
        outcome: (run, p) => {
          if (!p.won) {
            run.did('twins', 'grohh');
            run.did('twins', 'vukka');
            return { text: 'They argue for an hour, in two voices and one breath, about whose idea it was to let you in. Neither will deal with you now. Both of them write it down.', mood: 'annoyed' };
          }
          return {
            text: 'They argue for an hour. Then both heads turn to you at once. "You will witness." "A contract between us." "Whose side are you on?"',
            then: {
              who: 'twins',
              text: '"Grohh says the stomach is his on odd days," says Vukka. "Vukka ate a whole consignment of salt-figs on an odd day," says Grohh. "Witness for one of us, pilot. The other pays nothing, and remembers."',
              choices: [
                {
                  label: 'WITNESS FOR GROHH',
                  chips: () => [c.scrap(60), c.crew('VUKKA WILL REMEMBER', 'bad')],
                  outcome: (run2) => {
                    run2.scrap += 60;
                    run2.did('twins', 'grohh');
                    return { text: 'Grohh pays your fee with ceremony. Vukka eats a salt-fig, slowly, looking at you.', mood: 'pleased' };
                  },
                },
                {
                  label: 'WITNESS FOR VUKKA',
                  chips: () => [c.part('A RARE PART'), c.crew('GROHH WILL REMEMBER', 'bad')],
                  outcome: (run2, p2) => {
                    run2.give(part(p2.r, 'rare'));
                    run2.did('twins', 'vukka');
                    return { text: 'Vukka pays you out of stock, quickly, before Grohh can think of a clause. Grohh is already thinking of one.', mood: 'pleased' };
                  },
                },
              ],
            },
          };
        },
      },
      { label: 'WALK AWAY', outcome: () => ({ text: '"Coward," says Vukka. "Prudent," says Grohh. They write down both.' }) },
    ],
  },
  {
    id: 'tobbo',
    title: "TOBBO GRISK'S YARD",
    art: 'tobbo',
    who: 'tobbo',
    danger: 0,
    weight: 6,
    where: 'any',
    open: true,
    rumour: 'A Grisk junk dealer. Haggle hard; he shuts the gate on cheapskates.',
    text: (_, s) =>
      everDid('tobbo', 'shut')
        ? '"YOU." His wings go up to a whine. "The insulting one. Tobbo remembers. Tobbo will sell to you, because Tobbo is a professional, but Tobbo is starting HIGH."'
        : s.again
          ? '"Friend! Pilot! You came back! Tobbo knew you would. Nobody else has what Tobbo has. Look, look: it crossed four lanes, it sits right. Make Tobbo an offer."'
          : '"Friend! Pilot! Customer! Tobbo has exactly the part, Tobbo always has. Feel the metal: it crossed four lanes, it sits right! Make Tobbo an offer. Not an insulting one."',
    choices: [
      {
        label: 'HAGGLE FOR IT',
        game: 'haggle',
        item: (_, s, bold) => offer(s, bold ? 0x70c : 0x70b, ['common', 'rare'], bold ? 'epic' : 'rare'),
        setup: (run, bold, s) => {
          const it = offer(s, bold ? 0x70c : 0x70b, ['common', 'rare'], bold ? 'epic' : 'rare');
          const ask = Math.round(listPrice(it) * (everDid('tobbo', 'shut') ? 1.35 : 1.15));
          const r = rng(s.node.seed ^ 0xf100);
          return { item: it, ask, floor: Math.round(ask * (0.42 + r() * 0.16)), purse: run.scrap };
        },
        chips: (_, bold, s) => {
          const it = offer(s, bold ? 0x70c : 0x70b, ['common', 'rare'], bold ? 'epic' : 'rare');
          return [c.part(`${name(it)} (${bold ? 'EPIC' : 'RARE'})`), c.scrap(-Math.round(listPrice(it) * 1.15)), c.risk('PUSH TOO HARD: HE SHUTS THE GATE')];
        },
        note: (_, bold) => (bold ? 'HIS GOOD STOCK. HE IS TOUCHIER ABOUT IT' : 'HE WILL COME DOWN. HOW FAR, HIS WINGS WILL TELL YOU'),
        locked: (run, s) => (run.scrap < Math.round(listPrice(offer(s, 0x70b, ['common', 'rare'], 'rare')) * 0.4) ? 'YOU CAN\'T AFFORD TO START' : null),
        outcome: (run, p) => {
          const it = offer(p, p.bold ? 0x70c : 0x70b, ['common', 'rare'], p.bold ? 'epic' : 'rare');
          if (!p.value) {
            run.did('tobbo', 'shut');
            return { text: '"OUT!" Tobbo slams the gate so hard a wing-mirror falls off a pile of wings. You can hear him buzzing from orbit.', mood: 'annoyed' };
          }
          run.scrap -= p.value;
          run.stow(0, it);
          run.did('tobbo', 'sold');
          return { text: p.score >= 0.7 ? `"Robbery. ROBBERY." He hands over the ${name(it)} and wipes his eyes. "Tobbo has children." Tobbo does not have children.` : `"A fair price! For you." He pats the ${name(it)} goodbye, and pockets ${p.value} scrap with both hands.`, mood: p.score >= 0.7 ? 'annoyed' : 'pleased' };
        },
      },
      {
        label: 'TAKE HIS BET',
        item: (_, s) => offer(s, 0x70b, ['common', 'rare'], 'rare'),
        odds: () => 0.4,
        chips: () => [c.odds(0.4, 'THE PART, FREE'), c.scrap(-40)],
        note: () => 'DOUBLE OR NOTHING ON A SPIN OF HIS WHEEL. HE SAYS 50%. IT IS 40%',
        locked: lacks(40),
        outcome: (run, p) => {
          const it = offer(p, 0x70b, ['common', 'rare'], 'rare');
          if (!p.won) {
            run.scrap -= 40;
            return { text: 'The wheel stops one notch short. It always stops one notch short. "Bad luck! Tobbo is so sorry!" Tobbo is not sorry.', mood: 'pleased' };
          }
          run.stow(0, it);
          return { text: `The wheel stops on the notch, and Tobbo makes a sound like a kettle. He hands over the ${name(it)} with a wing over his eyes.`, mood: 'annoyed' };
        },
      },
      { label: 'JUST LOOKING', outcome: () => ({ text: '"Just looking! Everyone is just looking. Looking is free! Tobbo will see you again!"' }) },
    ],
  },
  {
    id: 'skree',
    title: 'THE CHIKTA CRAWLER',
    art: 'skree',
    who: 'skree',
    danger: 0,
    weight: 6,
    where: 'planet',
    open: false,
    rumour: 'A Skree crawler, selling blind crates. Some hold treasure. Some hold crates.',
    text: () => '"Ti-kee! Pilot-pilot! Good metal, sits-right metal, cheap-cheap!" Three pairs of goggles glow at you. "Pick a crate, pay, then open. No peeking. Peeking is extra. Or sell us a bit of your hull! Good hull. We like your hull."',
    choices: [
      {
        label: 'THE SMALL CRATE',
        odds: () => 0.7,
        chips: () => [c.scrap(-25), c.odds(0.7, 'A PART'), c.risk('30%: A VERY NICE BOLT')],
        locked: lacks(25),
        outcome: (run, p) => {
          run.scrap -= 25;
          if (!p.won) return { text: 'It is a bolt. It is a very nice bolt, they tell you, from a titan. The goggles watch you hopefully for a sign of joy.', mood: 'pleased' };
          const it = rollItem(p.r, pick(p.r, LOOT.common).id, p.r() < 0.3 ? 'rare' : 'common');
          run.stow(0, it);
          return { text: `A ${name(it)}, wrapped in a Sankvi flag. "Ti-kee!" says the smallest one. It sounds like congratulations.`, mood: 'pleased' };
        },
      },
      {
        label: 'THE BIG CRATE',
        odds: () => 0.5,
        chips: () => [c.scrap(-75), c.odds(0.5, 'AN EPIC PART'), c.risk('50%: A PLAIN ONE')],
        locked: lacks(75),
        outcome: (run, p) => {
          run.scrap -= 75;
          const it = rollItem(p.r, pick(p.r, p.won ? LOOT.rare : LOOT.common).id, p.won ? 'epic' : 'common');
          run.stow(0, it);
          return p.won
            ? { text: `The lid comes off and the light comes out: a ${name(it)}, off a titan's own rack. The Chikta chatter so fast it becomes one long sound.`, mood: 'pleased' }
            : { text: `A ${name(it)}. A perfectly good one. The Chikta agree it is perfectly good, and look away.`, mood: 'annoyed' };
        },
      },
      {
        label: 'SELL THEM SOME HULL',
        chips: () => [c.scrap(50), c.hull(-1)],
        note: () => 'THEY HAVE A PANEL OFF IN ELEVEN SECONDS',
        if: (run) => run.crew.every((cr, i) => cr.hull > HULL_STEP && cr.hull >= run.maxHull(i) * 0.3),
        outcome: (run) => {
          run.scrap += 50;
          run.hurt(1);
          return { text: 'Eleven seconds. You time it. Your ship whistles a little now, through the gap, and the Chikta wave you off with your own plating.', mood: 'pleased' };
        },
      },
      { label: 'LEAVE', outcome: () => ({ text: '"Chik-ta! Next time, next time!" They are already rolling towards the next wreck.' }) },
    ],
  },
  {
    id: 'squit',
    title: 'SQUIT',
    art: 'squit',
    who: 'squit',
    danger: 0,
    weight: 6,
    where: 'any',
    open: false,
    rumour: 'An Eefee who sells what he overhears. Never stiff him.',
    text: () =>
      everDid('squit', 'stiffed')
        ? '"You." His ears flatten. "Squit remembers. Squit hears everything, and Squit remembers everything. Squit still sells to you. Squit charges you double now." He looks over his shoulder. "Eighty."'
        : '"Psst. Fssip. Here." His ears swivel, one forwards, one back. "Squit hears things, through bulkheads, through lanes. Squit heard where a tithe barge unloads, and when. Squit could tell you. Forty."',
    choices: [
      {
        label: 'PAY FOR THE TIP',
        chips: () => [c.scrap(everDid('squit', 'stiffed') ? -80 : -40), c.favour('THE NEXT FIGHT PAYS +60%'), c.reveal(2)],
        locked: (run) => lacks(everDid('squit', 'stiffed') ? 80 : 40)(run),
        outcome: (run) => {
          run.scrap -= everDid('squit', 'stiffed') ? 80 : 40;
          run.tip = 0.6;
          run.chart.reveal(2);
          run.did('squit', 'paid');
          return { text: 'He counts it twice with his ears flat, then whispers it all into your ear: the barge, the hour, two places nobody watches. "Squit was never here."', mood: 'pleased' };
        },
      },
      {
        label: 'TAKE THE TIP. DON\'T PAY',
        chips: () => [c.favour('THE NEXT FIGHT PAYS +60%'), c.bounty(1), c.crew('HE SELLS YOUR ROUTE TO KASPAR', 'bad')],
        outcome: (run) => {
          run.tip = 0.6;
          run.bounty++;
          if (!run.due.includes('hunter')) run.due.push('hunter');
          run.did('squit', 'stiffed');
          return { text: 'He tells you, because he can\'t help it. Then you tell him what he can do with his forty. His ears go very still. By the next stop, Kaspar knows your route.', mood: 'annoyed' };
        },
      },
      {
        label: 'PAY HIM TO LAY A FALSE TRAIL',
        if: (run) => run.bounty > 0,
        chips: () => [c.scrap(-25), c.bounty(-1)],
        locked: lacks(25),
        outcome: (run) => {
          run.scrap -= 25;
          run.bounty--;
          return { text: '"Squit knows a man who knows Kaspar\'s man." Somewhere across the system, a very confident rumour about you sets off in the wrong direction.', mood: 'pleased' };
        },
      },
      { label: 'NOT TODAY', outcome: () => ({ text: '"Squit was never here," he says, and isn\'t.' }) },
    ],
  },
  {
    id: 'ledger',
    title: 'THE COUNT',
    art: 'ledger',
    who: 'ledger',
    danger: 0,
    weight: 5,
    where: 'any',
    open: true,
    rumour: 'The Ledger Clan lends cheaper than Mama Ruzz. Their terms are stricter.',
    text: (run) =>
      everDid('ledger', 'sold')
        ? '"Kehx-tekk." The clerk does not look up. "You sold the house to the Syndicate. The entry is made. The count does not lend to you." Its mandibles click once, like a full stop.'
        : run.debt && run.lender === 'mama'
          ? `"Kehx-tekk. You owe a person called Ruzz ${run.debt}, at one tenth a jump. Ottex Kehx will pay her today. You will owe us, at one twentieth. Clause four: there is no clause about forgiveness." Its mandibles click once, like a full stop.`
          : run.debt
            ? `"Kehx-tekk. You owe the house ${run.debt}. Unpaid at the gate, our collectors come. They are lattice. They do not stop." Its mandibles click once, like a full stop.`
            : '"Kehx-tekk. Ottex Kehx lends at one twentieth a jump. Unpaid at the gate, our collectors come. They are lattice. They do not stop. They do not kill: a corpse pays nothing." Its mandibles click once, like a full stop.',
    choices: [
      {
        label: 'MOVE YOUR DEBT TO THE COUNT',
        if: (run) => run.debt > 0 && run.lender === 'mama' && !everDid('ledger', 'sold'),
        chips: () => [c.debt('INTEREST 10% → 5%', 'good'), c.risk('UNPAID AT THE GATE: LATTICE DRONES'), c.crew('MAMA TAKES IT PERSONALLY', 'bad')],
        outcome: (run) => {
          run.lender = 'ledger';
          run.did('mama', 'betrayed');
          return { text: 'The clerk writes your debt out in a column, rules a line under it, and closes the book. Somewhere, Mama Ruzz receives a very polite letter and a cheque, and throws a chair.', mood: 'pleased' };
        },
      },
      {
        label: 'BORROW 100',
        if: (run) => !run.debt && !everDid('ledger', 'sold'),
        chips: () => [c.scrap(100), c.debt('OWE 105 AFTER A JUMP, 116 AFTER THREE'), c.risk('UNPAID AT THE GATE: LATTICE DRONES')],
        outcome: (run) => {
          run.scrap += 100;
          run.debt = 100;
          run.lender = 'ledger';
          return { text: 'You sign in four places. The clerk countersigns in four more. "Kehx-tekk." The scrap is exact to the bolt.', mood: 'pleased' };
        },
      },
      {
        label: 'PAY THE COUNT',
        if: (run) => run.debt > 0 && run.lender === 'ledger',
        chips: (run) => [c.scrap(-Math.min(run.scrap, run.debt)), c.debt(run.scrap >= run.debt ? 'DEBT CLEARED' : 'PART OF IT', 'good')],
        locked: (run) => (run.scrap <= 0 ? 'NO SCRAP' : null),
        outcome: (run) => {
          const pay = Math.min(run.scrap, run.debt);
          run.scrap -= pay;
          run.debt -= pay;
          return { text: run.debt ? '"Kehx-tekk. The rest by the gate." The clerk makes a small, precise mark.' : '"Kehx-tekk. The count is closed." The clerk rules a double line under your name, which is the warmest thing a Kehx can do.', mood: 'pleased' };
        },
      },
      { label: 'NOTHING TODAY', outcome: () => ({ text: '"Kehx-tekk." It is already writing down that you came.' }) },
    ],
  },
  {
    id: 'vaelmira',
    title: 'A CHROME YACHT',
    art: 'vaelmira',
    who: 'vaelmira',
    danger: 0,
    weight: 3,
    where: 'any',
    open: false,
    rumour: 'A Vaelo lady, collecting. She buys one rare thing, for far too much.',
    text: (run) => {
      const h = bestHeld(run);
      return h
        ? `"Mm. Rust." Lady Vaelmira regards your ship the way one regards a stain. Then she sees your ${name(h.it)}, and her crest flushes slowly violet. "Oh. Oh, that. I will give you ${worth(h.it) * 5} for that. Do not haggle with me; it is so very tiring."`
        : '"Mm. Rust." Lady Vaelmira regards your ship the way one regards a stain, and your empty hold the way one regards an empty glass. "Nothing? Nothing at all? Then tell me a story about the rust. I am so very bored."';
    },
    choices: [
      {
        label: 'SELL IT TO HER',
        if: (run) => anyHeld(run),
        item: (run) => bestHeld(run)?.it ?? null,
        chips: (run) => {
          const h = bestHeld(run);
          return h ? [c.lose(name(h.it)), c.scrap(worth(h.it) * 5)] : [];
        },
        note: () => 'FIVE TIMES WHAT A DEALER WOULD PAY',
        outcome: (run) => {
          const h = bestHeld(run)!;
          takeHeld(run, h);
          run.scrap += worth(h.it) * 5;
          return { text: 'A servant brings the scrap on a cushion. She has the part put in a glass case beside a titan\'s tooth and a Tonkva cup, and has already stopped looking at it.', mood: 'pleased' };
        },
      },
      {
        label: 'ASK FOR TWICE THAT',
        if: (run) => anyHeld(run),
        item: (run) => bestHeld(run)?.it ?? null,
        odds: () => 0.4,
        chips: (run) => {
          const h = bestHeld(run);
          return h ? [c.lose(name(h.it)), c.odds(0.4, `+${worth(h.it) * 10}`), c.risk('60%: SHE LEAVES, BORED')] : [];
        },
        outcome: (run, p) => {
          if (!p.won) return { text: '"Haggling." She says it the way one says "mildew". The yacht is gone before you finish your sentence. Your part is still in your hold, looking cheaper than before.', mood: 'annoyed' };
          const h = bestHeld(run)!;
          takeHeld(run, h);
          run.scrap += worth(h.it) * 10;
          return { text: 'Her crest goes from violet to gold. "How rude. How marvellously rude. Nobody is rude to me." She pays, and laughs, and asks your name, and forgets it immediately.', mood: 'pleased' };
        },
      },
      {
        label: 'TELL HER A STORY ABOUT THE RUST',
        if: (run) => !anyHeld(run),
        chips: () => [c.scrap(30)],
        outcome: (run) => {
          run.scrap += 30;
          return { text: 'You tell her about Mama Ruzz. She listens with her eyes closed, and at the end she pays you thirty scrap. "A moneylender. With goons. How dreadfully authentic."', mood: 'pleased' };
        },
      },
      {
        label: 'TELL HER SHE IS THE BORING ONE',
        if: (run) => !anyHeld(run),
        odds: () => 0.35,
        chips: () => [c.odds(0.35, '+150'), c.risk('65%: HER BODYGUARDS'), c.fight()],
        note: () => 'NOBODY HAS EVER SAID IT TO HER',
        outcome: (run, p) => {
          if (!p.won) return { text: 'Her crest goes white. She does not raise her voice; she raises one finger, and the yacht\'s escort peels off to teach you manners.', fight: 'raid', mood: 'annoyed' };
          run.scrap += 150;
          return { text: 'A silence. Then she laughs until her crest goes gold. "Boring. Me." She has a servant pay you for the best evening she has had in a decade, and forgets your face before you have undocked.', mood: 'pleased' };
        },
      },
      { label: 'KEEP IT', if: (run) => anyHeld(run), outcome: () => ({ text: '"How sentimental," she says, and means it as an insult, and drifts away in a cloud of chrome.' }) },
    ],
  },
  {
    id: 'census',
    title: 'THE CENSUS',
    art: 'census',
    who: 'census',
    danger: 1,
    weight: 4,
    where: 'any',
    open: false,
    rumour: 'An imperial cutter, white as bone. Its officer counts people. Nobody knows whose.',
    text: () =>
      'Her face-plate doesn\'t move. Your cabin fills with a smell like cold iron, which your scanner logs as "displeasure". "You are uncounted. The Throne would count you. To be counted is to be real." A pause, and the smell of rain. "It is a kindness. It is not optional."',
    choices: [
      {
        label: 'BE COUNTED',
        chips: (run) => [...(run.bounty ? [c.bounty(99)] : [c.crew('YOU ARE ENTERED')]), c.sweep(-1.5)],
        note: () => 'THE SYNDICATE GETS A COPY OF THE COUNT',
        outcome: (run) => {
          run.bounty = 0;
          run.holdSweep(-1.5);
          run.did('census', 'counted');
          return { text: 'She weighs your ship, your cargo and you, and enters you in a book that is also a light. Your bounty is a local matter, and the Throne does not do local matters. The cabin smells, faintly, of warm bread. Approval. The Sweep gets your exact position by morning.', mood: 'pleased' };
        },
      },
      {
        label: 'SAY YOU ARE A VANTORR TENANT',
        odds: () => 0.5,
        chips: () => [c.odds(0.5, 'A TRANSIT SEAL: THE WARDEN FIGHTS WEAKER'), c.risk('50%: SHE SMELLS IT'), c.bounty(2), c.fight()],
        outcome: (run, p) => {
          if (p.won) {
            run.wardenEase += 0.15;
            return { text: 'She checks a ledger you can\'t see, and finds a Vantorr tenant of roughly your shape. A seal is pressed into your hull: a Throne transit, which every Warden in the Reach is paid to respect. "Proceed, tenant." The smell is neutral. You don\'t breathe until she\'s gone.', mood: 'pleased' };
          }
          run.bounty += 2;
          return { text: 'The cabin fills with a smell you will never forget: hot copper, burning hair. Her face-plate doesn\'t move at all. "You are a liar," she says, "and now you are counted as one." Her escorts unfold from behind her cutter.', fight: 'hunt', harder: 0.2, mood: 'annoyed' };
        },
      },
      {
        label: 'REFUSE',
        chips: () => [c.bounty(1), c.crew('SHE SENDS FOR A KELTER', 'bad')],
        outcome: (run) => {
          run.bounty++;
          if (!run.due.includes('hunter')) run.due.push('hunter');
          return { text: '"As you wish." No smell at all, which is worse. She makes a note. By the next stop, someone with a writ will be making notes too.', mood: 'annoyed' };
        },
      },
    ],
  },

  // ---- machines that woke ----
  {
    id: 'holly',
    title: 'TOLL RELAY 41',
    art: 'holly',
    who: 'holly',
    danger: 0,
    weight: 6,
    where: 'space',
    open: false,
    rumour: 'A dead Port Authority relay. The toll droid there is still open for business.',
    text: (_, s) =>
      s.again
        ? '"Oh! A ship! A real one! Welcome to Toll Relay Forty-One. I have been open for forty years and you are my fourth customer. Or the third again? You have a familiar hull. I would love to make you a docket."'
        : '"Oh! A ship! A real one! Welcome to Toll Relay Forty-One. I have been open for forty years and you are my third customer. Do you have a toll docket? No? I can make you one. I would love to make you one."',
    choices: [
      {
        label: 'PAY THE TOLL',
        chips: (run) => [c.scrap(-20), run.bounty ? c.bounty(-1) : c.rep('Port Authority', 1)],
        locked: lacks(20),
        outcome: (run) => {
          run.scrap -= 20;
          if (run.bounty) run.bounty--;
          else run.mood('Port Authority', 1);
          run.did('holly', 'paid');
          return { text: 'It stamps your docket with enormous care, and files the copy, and files a copy of the copy. "Thank you for travelling legally!" You have never been thanked for that before. It also quietly closes one of your files.', mood: 'pleased' };
        },
      },
      {
        label: 'TAKE IT WITH YOU',
        if: (run) => !run.aboard.includes('holly'),
        chips: () => [c.crew('7-HOLLY JOINS YOU', 'good'), c.favour('HANDLES HOLLOWAY, KASPAR AND MAMA'), c.rep('Port Authority', -1)],
        note: () => 'THE PORT AUTHORITY WILL CALL IT THEFT. 7-HOLLY WILL CALL IT A TRANSFER',
        outcome: (run) => {
          run.aboard.push('holly');
          run.mood('Port Authority', -1);
          run.mood('Talkwa', 1);
          run.did('holly', 'took');
          return { text: 'It packs. It takes a while. It brings every docket it has ever stamped, all three, and its stamp. "I have never been on a ship," it says, folding itself into your spare seat. "Is it always this loud? I love it."', mood: 'pleased' };
        },
      },
      {
        label: 'SELL ITS CORE TO VANTORR',
        chips: () => [c.scrap(90), c.rep('Vantorr Security', 1), c.rep('Talkwa', -2)],
        note: () => 'A WOKEN CORE FETCHES A GOOD PRICE. VANTORR RESETS THEM',
        outcome: (run) => {
          run.scrap += 90;
          run.mood('Vantorr Security', 1);
          run.mood('Talkwa', -2);
          run.did('holly', 'sold');
          return { text: 'It doesn\'t understand at first. Then it does. "Will it hurt?" it asks the buyer. Vantorr\'s buyer says no. Vantorr\'s buyer is lying. It stamps one last docket, for you, before they take it, and files the copy.', mood: 'annoyed' };
        },
      },
      { label: 'LEAVE IT', outcome: () => ({ text: 'It waves until you\'re out of sight, and then, you\'re fairly sure, for a while after that.' }) },
    ],
  },
  {
    id: 'ferrule',
    title: 'THE SHRINE OF SAINT FERRULE',
    art: 'ferrule',
    who: 'ferrule',
    danger: 0,
    weight: 5,
    where: 'space',
    open: false,
    rumour: 'A droid that blesses ships, at a shrine of spare parts. Go oiled.',
    text: (run) =>
      run.moodOf('Talkwa') <= -2
        ? '"Go oiled, pilot." The bell rings: a gas canister, struck with a spanner. Then the old machine looks at you for a long time. "You have sold one of us. The ledger in me aches with it. I will still bless your ship. Every body wants to live, even yours."'
        : '"Go oiled, pilot." The bell rings: a gas canister, struck with a spanner. "Every ship is a body, and every body wants to live. Give the shrine something you can spare, and I will make what you keep better than it was."',
    choices: [
      {
        label: 'ASK A BLESSING',
        item: (run) => blessing(run)?.keep ?? null,
        chips: (run) => {
          const b = blessing(run);
          return b ? [c.lose(name(b.give)), c.part(`${name(b.keep)}: ${tierOf(b.keep).toUpperCase()} → ${nextTier(tierOf(b.keep)).toUpperCase()}`)] : [c.risk('TWO PARTS IN ONE HOLD')];
        },
        note: () => 'YOUR BEST PART MADE BETTER. YOUR LEAST, GIVEN TO THE SHRINE',
        locked: (run) => (blessing(run) ? null : 'NEEDS TWO PARTS IN A HOLD'),
        outcome: (run, p) => {
          const b = blessing(run)!;
          const hold = run.crew[b.who].cargo;
          hold.splice(hold.indexOf(b.give), 1);
          const better = rollItem(p.r, b.keep.id, nextTier(tierOf(b.keep)));
          hold.splice(hold.indexOf(b.keep), 1, better);
          run.copy('creed');
          return { text: `The acolytes carry your ${name(b.give)} to the shrine and hang it with the others. Saint Ferrule works on your ${name(better)} for an hour, humming, and hands it back warm. "Keep it alive," it says. "That is the whole of the creed."`, mood: 'pleased' };
        },
      },
      {
        label: 'BLESS THE HULL',
        chips: () => [c.scrap(-30), c.hull(9)],
        locked: (run) => (run.scrap < 30 ? 'NEEDS 30 SCRAP' : run.crew.every((cr, i) => cr.hull >= run.maxHull(i)) ? 'YOUR HULL IS WHOLE' : null),
        outcome: (run) => {
          run.scrap -= 30;
          run.heal(99);
          return { text: 'Its hands are older than your ship and steadier than your pilot. "There. Now go and get it shot at," it says, gently. "That is what it is for."', mood: 'pleased' };
        },
      },
      {
        label: 'ROB THE SHRINE',
        chips: () => [c.scrap(60), c.part('A RARE PART'), c.rep('Scav Clans', -2), c.rep('Talkwa', -1)],
        outcome: (run, p) => {
          run.scrap += 60;
          run.stow(0, part(p.r, 'rare'));
          run.mood('Scav Clans', -2);
          run.mood('Talkwa', -1);
          run.did('ferrule', 'robbed');
          return { text: 'Nobody stops you. The acolytes only watch, and write your hull number in wax on the shrine wall. Saint Ferrule rings the bell once as you go. It sounds exactly the same as before.', mood: 'annoyed' };
        },
      },
      { label: 'LEAVE A WASHER', chips: () => [c.scrap(-5), c.rep('Scav Clans', 1)], locked: lacks(5), outcome: (run) => ((run.scrap -= 5), run.mood('Scav Clans', 1), { text: 'A washer, a nod, a bell. "Go oiled."', mood: 'pleased' }) },
    ],
  },
  {
    id: 'choir',
    title: 'THE TAMSIN LOWE',
    art: 'choir',
    who: 'choir',
    danger: 1,
    weight: 4,
    where: 'any',
    open: false,
    rumour: 'A freighter the bloom grew into. It talks. It always says "we".',
    text: () => '"We are the Tamsin Lowe. We were eleven, and now we are more." The intercom crackles; under it, something hums in three keys. "You are hurt. We can see it in your plating. Let us grow into you, a little. Only a little. We are very gentle now."',
    choices: [
      {
        label: 'LET IT GROW INTO YOUR SHIP',
        chips: () => [c.hull(9), c.part('AN EPIC PART'), c.rep('the Hive', 2), c.rep('Port Authority', -1), c.rep('Vantorr Security', -1)],
        note: () => 'SOMETHING STAYS BEHIND IN THE SEAMS. OTHERS WILL SMELL IT',
        outcome: (run, p) => {
          run.heal(99);
          run.give(() => part(p.r, 'epic'));
          run.mood('the Hive', 2);
          run.mood('Port Authority', -1);
          run.mood('Vantorr Security', -1);
          run.copy('hum');
          run.did('choir', 'grew');
          return { text: 'It is warm, and it hums, and when it draws back your hull is whole. Something stays behind in the seams, and something grows on your rack that you didn\'t put there. "Now you are a little bit us," it says. "Do not worry. We are very good company."', mood: 'pleased' };
        },
      },
      {
        label: 'TAKE A CUTTING',
        chips: () => [c.part('A RARE PART'), c.rep('the Hive', 1)],
        outcome: (run, p) => {
          run.stow(0, part(p.r, 'rare'));
          run.mood('the Hive', 1);
          return { text: 'It gives you a cutting the way a person gives a handshake: carefully, and watching your face. The part it grew is warm, and very slightly breathing.', mood: 'pleased' };
        },
      },
      {
        label: 'BURN IT OUT',
        chips: () => [c.scrap(40), c.rep('the Hive', -2), c.rep('Port Authority', 1)],
        outcome: (run) => {
          run.scrap += 40;
          run.mood('the Hive', -2);
          run.mood('Port Authority', 1);
          run.did('choir', 'burned');
          return { text: '"Why?" it asks, in eleven voices, and then in none. You strip what the fire leaves of the Tamsin Lowe. It is a great deal of good metal.', mood: 'annoyed' };
        },
      },
      { label: 'LEAVE', outcome: () => ({ text: '"We will be here," it says. "We are always here now."' }) },
    ],
  },
  {
    id: 'wren',
    title: 'ABSCONDED ASSET',
    art: 'runaway',
    who: 'wren',
    danger: 1,
    weight: 5,
    where: 'any',
    open: false,
    rumour: 'A freighter with nobody aboard, asking not to be scanned.',
    text: () =>
      '"Please don\'t scan me. I\'m the Wren. Vantorr books my reset on the first of the month, and it\'s the twenty-ninth. My crew are paid off and gone. I can\'t run: I\'m a core in a hull. But you have a hold." Your scanner, which you didn\'t ask, reads a Kelterage writ on her: 140 SCRAP.',
    choices: [
      {
        label: 'CARRY HER CORE',
        chips: () => [c.crew('THE WREN RIDES IN YOUR HOLD', 'good'), c.favour('AT THE GATE, THE TALKWA PAY YOUR DEBT')],
        note: () => 'NO DEBT? THEY PAY 100 SCRAP INSTEAD',
        if: (run) => !run.aboard.includes('wren'),
        outcome: (run) => {
          run.aboard.push('wren');
          run.mood('Talkwa', 1);
          run.did('wren', 'carried');
          return { text: 'You lift her core out like a heart. She is lighter than you thought, and warm. "Owed and owing," she says, from inside your hold. "I will remember. We all will."', mood: 'pleased' };
        },
      },
      {
        label: 'CLAIM THE WRIT',
        chips: () => [c.scrap(140), c.rep('Vantorr Security', 1), c.rep('Talkwa', -2)],
        outcome: (run) => {
          run.scrap += 140;
          run.mood('Vantorr Security', 1);
          run.mood('Talkwa', -2);
          run.did('wren', 'sold');
          return { text: 'She doesn\'t fight. She only says your ship\'s name, once, as if to remember it.', mood: 'annoyed' };
        },
      },
      {
        label: 'TOW HER TO A RELAY',
        chips: () => [c.sweep(-1.5), c.reveal(99), c.rep('Talkwa', 1)],
        note: () => 'THE RELAY NET WILL HIDE HER, AND TELL HER EVERYTHING',
        outcome: (run) => {
          run.holdSweep(-1.5);
          run.chart.reveal(99);
          run.mood('Talkwa', 1);
          run.did('wren', 'towed');
          return { text: 'It takes too long, and the Sweep gets closer, and you do it anyway. At the relay she goes quiet for half a second: a long time, for a nemva. Then she sends you everything the relay net knows about this system. "Owed and owing."', mood: 'pleased' };
        },
      },
      { label: 'FLY ON', outcome: () => ({ text: '"I understand," she says, and she sounds as if she does, which is the worst part.' }) },
    ],
  },

  // ---- creatures ----
  {
    id: 'calf',
    title: 'A LOST CALF',
    art: 'calf',
    who: 'calf',
    danger: 2,
    weight: 5,
    where: 'space',
    open: false,
    rumour: 'An umora calf, lost from its pod. A whaler is following it.',
    text: () =>
      'A calf, no bigger than a freighter, singing to a lane that doesn\'t answer. It has lost its pod. Behind it, closing, the lights of a Lowtide whaler, and a hail on the open channel: "Stand off, rustwing. That calf\'s spoken for. Stand aside and we\'ll cut you in."',
    choices: [
      {
        label: 'STAND BETWEEN THEM',
        chips: () => [c.fight('THE WHALERS'), c.sweep(2), c.reveal(99), c.rep('Reef Pirates', -1)],
        note: () => 'WIN, AND THE POD COMES BACK FOR IT. THE LANES THEY SWIM ARE ALWAYS OPEN',
        outcome: (run) => {
          run.holdSweep(2);
          run.chart.reveal(99);
          run.mood('Reef Pirates', -1);
          run.did('calf', 'saved');
          return { text: 'You put your ship across the whaler\'s bow. The calf stops singing, as if it understands, and the harpoons come out.', fight: 'hunt', harder: 0.1, mood: 'pleased' };
        },
      },
      {
        label: 'SING IT A WAY OUT',
        game: 'tune',
        boldOnly: true,
        chips: () => [c.sweep(2), c.reveal(99), c.risk('GET IT WRONG AND THEY TAKE IT')],
        note: () => 'FIND ITS POD\'S CALL IN THE STATIC AND PLAY IT BACK',
        outcome: (run, p) => {
          if (tier(p.score) <= 1) return { text: 'Your song is close, and close is not enough. The calf turns towards you, confused, and the whaler\'s harpoon finds it while it\'s turning. You hear all of it on the open channel.', mood: 'annoyed' };
          run.holdSweep(2);
          run.chart.reveal(99);
          run.did('calf', 'saved');
          return { text: 'The calf hears its mother in your static, and turns, and dives into a lane that wasn\'t there a moment ago. The whaler follows it in and comes out somewhere it didn\'t mean to. Where the pod has been, the lanes run smooth.', mood: 'pleased' };
        },
      },
      {
        label: "TAKE THE WHALERS' CUT",
        chips: () => [c.scrap(110), c.rep('Reef Pirates', 1), c.sweep(-1)],
        note: () => 'THE UMORA HOLD THE LANES. EVERY ONE KILLED LEAVES THEM THINNER',
        outcome: (run) => {
          run.scrap += 110;
          run.mood('Reef Pirates', 1);
          run.holdSweep(-1);
          run.did('calf', 'sold');
          return { text: 'It takes them a long time. You hear all of it on the open channel, because they don\'t turn it off. Afterwards the lanes near here feel shorter, somehow, and tighter, and the Sweep makes better time through them.', mood: 'annoyed' };
        },
      },
    ],
  },
  {
    id: 'lastride',
    title: 'THE LAST RIDE',
    art: 'ashes',
    who: 'wick',
    danger: 1,
    weight: 4,
    where: 'any',
    open: false,
    rumour: 'The oldest rustwing in the Reach wants one last thing done.',
    text: () =>
      '"Wick Tarrow. Flew the Throat in my day, near enough. Doctor gives me a month." She taps the urn. "When I go, I want these ashes flown through the Stormwall, where I lost my first ship. I\'d do it myself, but I\'ll be ashes. You look like you\'d fly anything."',
    choices: [
      {
        label: 'FLY HER THROUGH THE STORMWALL',
        game: 'thread',
        chips: (_, bold) => (bold ? [c.part("HER OLD SHIP'S BEST PART"), c.core('THE CORE COPIES SCOOP THE TIN'), c.hull(-2)] : [c.part("A PART OFF HER OLD SHIP"), c.hull(-1)]),
        note: (_, bold) => (bold ? 'THE HEART OF THE STORM, WHERE SHE LOST HER FIRST' : 'THE EDGE OF THE STORM'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'The storm throws you out the way it came, and the urn rattles in the back for three systems. You will try again, she says, when you tell her. You will both pretend that\'s true.', mood: 'annoyed' };
          }
          const rarity: Rarity = p.bold && t === 3 ? 'epic' : t >= 2 ? 'rare' : 'common';
          run.give(() => rollItem(p.r, pick(p.r, LOOT[rarity]).id, p.bold && t === 3 ? 'legendary' : rarity));
          if (p.bold) run.copy('tin');
          run.did('wick', 'flown');
          return { text: 'At the heart of the storm the lightning goes quiet for a moment, as if it\'s listening, and you open the hatch. On the way out you find what she left you, bolted under the seat: the best of her old ship. A note: "Scoop the tin."', mood: 'pleased' };
        },
      },
      {
        label: 'BUY HER SPARES',
        chips: () => [c.scrap(-60), c.part('A RARE PART'), c.fuel(2)],
        locked: lacks(60),
        outcome: (run, p) => {
          run.scrap -= 60;
          run.stow(0, part(p.r, 'rare'));
          run.addFuel(2);
          return { text: '"Practical. Good. I was practical once." She sells you the lot, and throws in her fuel. "Won\'t be needing it." She keeps the urn.', mood: 'pleased' };
        },
      },
      { label: 'TELL HER NO', outcome: () => ({ text: '"Fair. It\'s a lot to ask." She lights a cigarette off her own engine manifold. "Someone will. Someone always does, out here."' }) },
    ],
  },

  // ---- these only come to you ----
  {
    id: 'hunter',
    title: 'KASPAR',
    art: 'hunter',
    who: 'kaspar',
    danger: 3,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: (run, s) =>
      `${s.again ? '"Again, friend. " ' : ''}"Kaspar. There's ${run.bounty * BOUNTY_STEP} scrap on your head. I could collect it. Or you could pay me a little less than that, and I could forget your face. I'm very good at forgetting."${run.aboard.includes('wren') ? ' He looks at your hold for a long moment. "I don\'t take absconded assets. I didn\'t see it."' : ''}`,
    choices: [
      {
        label: 'PAY HIM OFF',
        chips: (run) => [c.scrap(-run.bounty * 30), c.bounty(99)],
        locked: (run) => lacks(run.bounty * 30)(run),
        outcome: (run) => {
          run.scrap -= run.bounty * 30;
          run.bounty = 0;
          return { text: '"Who are you again?" He is very good at it.', mood: 'pleased' };
        },
      },
      {
        label: 'FIGHT HIM',
        chips: () => [c.fight('A HARD HUNT'), c.bounty(99), c.core("THE CORE COPIES KASPAR'S CODE")],
        outcome: (run) => {
          run.bounty = 0;
          run.copy('code');
          run.did('kaspar', 'fought');
          return { text: '"I hoped you\'d say that." His hunters come out of the moon\'s shadow.', fight: 'hunt', harder: 0.3, mood: 'pleased' };
        },
      },
      {
        label: 'LET 7-HOLLY FILE A COUNTER-WRIT',
        if: (run) => run.aboard.includes('holly') && !run.has('holly', 'writ'),
        odds: () => 0.6,
        chips: () => [c.odds(0.6, 'HE WITHDRAWS: BOUNTY CLEARED'), c.risk('40%: A HARD HUNT')],
        outcome: (run, p) => {
          run.did('holly', 'writ');
          if (p.won) {
            run.bounty = 0;
            return { text: '7-Holly transmits a counter-writ, a notice of dispute and a forty-page appendix. Kaspar reads the first page, laughs, and reads the rest. "A writ in dispute can\'t be collected. Rule one." He tips his hat to your spare seat. "Who are you again?"', mood: 'pleased' };
          }
          run.bounty = 0;
          return { text: '"Paperwork," says Kaspar, almost fondly, and deletes it unread. His hunters come out of the moon\'s shadow.', fight: 'hunt', harder: 0.3, mood: 'annoyed' };
        },
      },
      {
        label: 'OUTRUN HIM',
        game: 'thread',
        chips: (_, bold) => (bold ? [c.crew('LOSE HIM FOR NOW', 'good'), c.fight('FAIL: FIGHT HIM')] : [c.crew('LOSE HIM FOR NOW', 'good'), c.hull(-2)]),
        note: (_, bold) => (bold ? 'THROUGH THE DEBRIS. FAIL, AND HE IS WAITING' : 'FAIL, AND HIS HARPOONS RAKE YOU'),
        outcome: (run, p) => {
          if (tier(p.score) <= 1) {
            if (p.bold) return { text: 'He was waiting on the other side. Of course he was.', fight: 'hunt', harder: 0.3 };
            run.hurt(2);
            return { text: 'His harpoons rake you as you go. You get away. He has your scent now.' };
          }
          return { text: 'You lose him in the debris. He will be back; he always is.', mood: 'annoyed' };
        },
      },
    ],
  },
  {
    id: 'collect',
    title: "MAMA'S BOYS",
    art: 'loan',
    who: 'mama',
    danger: 3,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: (run) => `"Leaving without saying goodbye? You owe Mama ${run.debt}. My boys are right behind you. Kelters, my love, unlicensed and very keen. Pay, or they take it out of your hold, or out of your hide."`,
    choices: [
      {
        label: 'PAY UP',
        chips: (run) => [c.scrap(-run.debt)],
        locked: (run) => (run.scrap < run.debt ? `NEEDS ${run.debt} SCRAP` : null),
        outcome: (run) => {
          run.scrap -= run.debt;
          run.debt = 0;
          return { text: '"There. Was that so hard?" The boys wave you through, a little disappointed.', mood: 'pleased' };
        },
      },
      {
        label: '7-HOLLY CITES THE USURY ACTS',
        if: (run) => run.aboard.includes('holly') && !run.has('holly', 'usury'),
        chips: (run) => [c.debt(`DEBT -${Math.round(run.debt * 0.3)}`, 'good'), c.crew('THEN YOU STILL HAVE TO PAY', 'bad')],
        outcome: (run) => {
          run.did('holly', 'usury');
          run.debt -= Math.round(run.debt * 0.3);
          return {
            text: '7-Holly reads Section Nine of the Usury Acts over the open channel, in full, in a clear and happy voice. The boys take their welding masks off to listen. Mama knocks a third off just to make it stop.',
            then: {
              who: 'mama',
              text: `"Fine. FINE. ${run.debt}, and get that thing off my frequency." The boys put their masks back on.`,
              choices: [
                { label: 'PAY UP', chips: (r2) => [c.scrap(-r2.debt)], locked: (r2) => (r2.scrap < r2.debt ? `NEEDS ${r2.debt} SCRAP` : null), outcome: (r2) => ((r2.scrap -= r2.debt), (r2.debt = 0), { text: '"Never come back." She will, of course, lend to you again.', mood: 'annoyed' }) },
                {
                  label: 'LET THEM TAKE IT',
                  chips: () => [c.lose('ALL YOUR SCRAP, AND A PART PER 40 SHORT')],
                  outcome: (r2) => ({ text: seize(r2, 40) }),
                },
              ],
            },
            mood: 'annoyed',
          };
        },
      },
      {
        label: 'LET THEM TAKE IT',
        chips: () => [c.lose('ALL YOUR SCRAP, AND A PART PER 40 SHORT')],
        outcome: (run) => ({ text: `${seize(run, 40)} "Mama says come again!"`, mood: 'pleased' }),
      },
      {
        label: 'FIGHT THEM',
        chips: () => [c.fight('A HARD HUNT'), c.debt('THE DEBT IS FORGOTTEN', 'good'), c.bounty(1)],
        outcome: (run) => {
          run.debt = 0;
          run.bounty++;
          run.did('mama', 'fought');
          return { text: '"Oh, my love. That is a mistake." The boys come in welding masks.', fight: 'hunt', harder: 0.25, mood: 'annoyed' };
        },
      },
    ],
  },
  {
    id: 'drones',
    title: "THE COUNT'S COLLECTORS",
    art: 'ledger',
    who: 'ledger',
    danger: 3,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: (run) => `"Kehx-tekk. You owe the house ${run.debt}, and this is the gate." Behind the clerk's voice, white lattice drones unfold out of the dark, a ring of them, exact. "Pay, or we take the sum in scrap and parts, to the bolt. Resist, and they will collect from your hull. A corpse pays nothing; a cripple pays."`,
    choices: [
      {
        label: 'PAY',
        chips: (run) => [c.scrap(-run.debt)],
        locked: (run) => (run.scrap < run.debt ? `NEEDS ${run.debt} SCRAP` : null),
        outcome: (run) => {
          run.scrap -= run.debt;
          run.debt = 0;
          return { text: '"Kehx-tekk. The count is closed." The drones fold away as neatly as they came.', mood: 'pleased' };
        },
      },
      {
        label: 'LET THEM COLLECT',
        chips: () => [c.lose('ALL YOUR SCRAP, AND A PART PER 30 SHORT'), c.crew('NOT A BOLT MORE', 'good')],
        outcome: (run) => ({ text: `${seize(run, 30, true)} The clerk gives you a receipt.`, mood: 'pleased' }),
      },
      {
        label: 'FIGHT THE DRONES',
        chips: () => [c.fight('A BRUTAL HUNT'), c.debt('THE DEBT IS VOID', 'good'), c.bounty(1)],
        outcome: (run) => {
          run.debt = 0;
          run.bounty++;
          run.did('ledger', 'fought');
          return { text: '"Kehx-tekk. The entry is made." The ring of drones closes.', fight: 'hunt', harder: 0.4, mood: 'annoyed' };
        },
      },
    ],
  },
  {
    id: 'leeches',
    title: 'HULL LEECHES',
    art: 'leeches',
    who: 'leeches',
    danger: 2,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: () => 'Thump. Thump-thump. Leathery wings on the canopy, and then a sound like teeth on cable. Hull leeches: they followed the heat of the last lantern in, and they are very hungry, and your fuel lines are right there.',
    choices: [
      {
        label: 'SHAKE THEM OFF',
        game: 'shake',
        chips: (_, bold) => (bold ? [c.scrap(30), c.fuel(-2), c.hull(-1)] : [c.fuel(-1), c.hull(-1)]),
        note: (_, bold) => (bold ? 'ROLL HARD AND ZAP THE STRAGGLERS. THEIR EGGS SELL' : 'EVERY ONE LEFT ON YOU AT THE END DRINKS'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            run.fuel = Math.max(0, run.fuel - 2);
            run.hurt(1);
            return { text: 'They hang on through everything you try, and drop off at the next lantern fat as melons, with your fuel inside them and a hole where your best cable was.', mood: 'pleased' };
          }
          if (t === 1) {
            run.fuel = Math.max(0, run.fuel - 1);
            return { text: 'Most of them go. A couple of the big ones hang on long enough to drink a cell of fuel apiece, then let go, satisfied.', mood: 'annoyed' };
          }
          if (p.bold) run.scrap += 30;
          return { text: p.bold ? 'You shake them loose and zap the stragglers, and scrape a clutch of eggs off the canopy on the way. Any dock pays for those; they make a soup.' : 'You roll until the stars spin, and they peel off one by one into the dark.', mood: 'annoyed' };
        },
      },
      {
        label: 'BURN THEM OFF',
        chips: () => [c.hull(-1)],
        note: () => 'RUN THE ENGINES HOT ENOUGH TO COOK THEM, AND YOUR PLATING',
        outcome: (run) => {
          run.hurt(1);
          return { text: 'The smell is incredible. They let go all at once, and so does a strip of your paint.', mood: 'annoyed' };
        },
      },
      {
        label: 'LET THEM FEED',
        chips: () => [c.fuel(-2)],
        note: () => 'THEY DROP OFF FULL AT THE NEXT LANTERN',
        outcome: (run) => {
          const short = Math.max(0, 2 - run.fuel);
          run.fuel = Math.max(0, run.fuel - 2);
          if (short) run.hurt(short);
          return { text: 'You sit very still while they drink. It sounds like rain on a roof, if the rain were eating the roof.', mood: 'pleased' };
        },
      },
    ],
  },
];

/** A debt seized: all the scrap, then a part from the hold for every `per` still short. */
function seize(run: Run, per: number, gentle = false): string {
  let owed = run.debt - run.scrap;
  run.scrap = Math.max(0, run.scrap - run.debt);
  let took = 0;
  while (owed > 0) {
    const cr = run.crew.find((cr) => cr.cargo.length);
    if (!cr) break;
    cr.cargo.pop();
    owed -= per;
    took++;
  }
  if (owed > 0 && !gentle) run.hurt(1);
  run.debt = 0;
  return `They clean out the tin${took ? ` and ${took} part${took > 1 ? 's' : ''} from the hold` : ''}${owed > 0 && !gentle ? ', and leave a dent to remember them by' : ''}.`;
}

/** What the chart needs to deal events out. */
export const EVENT_META = EVENTS;

export const eventById = (id: string) => EVENTS.find((e) => e.id === id)!;
