/**
 * Things you find out between the planets, in the manner of Gazillionaire's encounters: each a
 * picture and somebody in it (Mama Ruzz the moneylender, Spoke at his reels, Inspector Holloway of
 * the Port Authority, Pip Hollow of Lantern Mutual, Kaspar who hunts for bounties), a few choices
 * with their costs and odds in plain sight, and consequences that outlast the stop: a debt with
 * interest, a policy, a price on your head, a faction's mood, a crate to deliver across the
 * system, news that moves a market, rumours that name what's hidden on the chart.
 *
 * Some choices are a little game (screens/minigames.ts): you play it, careful or bold, and how
 * well you did (0..1) scales what you get. Bold pays about double and punishes harder.
 *
 * Pure data and rules; no drawing. `where` says where on the chart an event turns up; 'never'
 * ones only come to you (Kaspar, Mama's boys).
 */

import type { Run } from './run';
import type { ChartNode } from './chart';
import type { Mode } from './level';
import type { Planet } from '../world/planets';
import { LOOT } from './build';
import { itemName, rollItem, type Item } from '../game/loot';
import { PARTS, type PartClass, type Rarity } from '../game/parts';
import { pick, type Rng } from '../util';

export type MiniKind = 'tow' | 'tune' | 'grab' | 'reels' | 'dock' | 'thread';

/** What a choice is played out with. */
export interface Play {
  r: Rng;
  /** How well the little game went, 0..1 (1 when there wasn't one). */
  score: number;
  bold: boolean;
  node: ChartNode;
  /** The planet it happened over (or nearest to). */
  planet: Planet;
}

export interface Result {
  text: string;
  fight?: Mode;
  /** Extra difficulty for the fight. */
  harder?: number;
}

export interface Choice {
  label: string;
  /** Costs, odds and pay, shown under it (`bold`: for the bold version of a game). */
  note: (run: Run, bold: boolean) => string;
  /** Only offered when this holds. */
  if?: (run: Run) => boolean;
  /** Why you can't, or null. */
  locked?: (run: Run) => string | null;
  game?: MiniKind;
  outcome: (run: Run, p: Play) => Result;
}

export interface RunEvent {
  id: string;
  title: string;
  /** public/art/events/<art>.png */
  art: string;
  /** Who's talking ('' for none). */
  who: string;
  text: (run: Run, p: Omit<Play, 'score' | 'bold'>) => string;
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

/** A part as a prize: one of the rarity asked for, rolled at that tier (an epic one is epic). */
const part = (r: Rng, rarity: Rarity, cls?: PartClass): Item => {
  const xs = cls ? LOOT[rarity].filter((p) => p.cls === cls) : [];
  return rollItem(r, pick(r, xs.length ? xs : LOOT[rarity]).id, rarity);
};
const ofClass = (r: Rng, cls: PartClass) => pick(r, PARTS.filter((p) => p.cls === cls && !p.duo)).id;
const name = (it: Item) => itemName(it);
const lacks = (n: number) => (run: Run) => (run.scrap < n ? `NEEDS ${n} SCRAP` : null);
/** Tiers of a game's result, worst to best. */
const tier = (score: number) => (score >= 0.85 ? 3 : score >= 0.55 ? 2 : score >= 0.25 ? 1 : 0);

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
        note: (_, bold) => (bold ? 'DEEP HOLD: MORE CRATES, LESS TIME. FAIL: -2 HULL' : 'GRAB CRATES, GET OUT BEFORE THE HATCH SEALS'),
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
    who: 'CAPTAIN JUNO PELL, COURIER',
    danger: 1,
    weight: 10,
    where: 'any',
    open: false,
    rumour: 'A courier adrift, begging for a tow. Her cargo has a Syndicate seal.',
    text: (run, p) =>
      `"Engines dead, air for a day, and a crate sealed by the Syndicate that I'm not to open. Tow me clear and I'll see you right. Or take the crate on to ${run.farPlanet(p.node).name} for me. They pay on delivery. Probably."`,
    choices: [
      {
        label: 'TOW HER CLEAR',
        game: 'tow',
        note: (_, bold) => (bold ? 'A HEAVY TOW, THROUGH THE ROCKS: UP TO 90 + A PART' : 'KEEP THE CABLE TAUT, NOT TIGHT: UP TO 45 SCRAP'),
        outcome: (run, p) => {
          const t = tier(p.score);
          if (t === 0) {
            run.hurt(1);
            return { text: 'The cable snaps and whips across your hull. Juno drifts off, calling you names you have to look up.' };
          }
          run.scrap += Math.round(p.score * (p.bold ? 90 : 45));
          run.mood('Port Authority', 1);
          if (p.bold && t >= 2) {
            const id = part(p.r, 'rare');
            run.give(id);
            return { text: `You drag her through the rocks without a scratch. She pays, and throws in a ${name(id)} "she found". The Port Authority hears of it.` };
          }
          return { text: 'You get her to a lane where the patrols will find her. She pays what she has. The Port Authority hears of it.' };
        },
      },
      {
        label: 'CARRY HER CRATE',
        note: (run) => `A CONTRACT: LAND ON ${run.landing ? run.farPlanet(run.landing).name : 'ITS PLANET'} BEFORE THE GATE FOR +90`,
        if: (run) => !run.contract,
        outcome: (run, p) => {
          const to = run.farPlanet(p.node);
          run.contract = { planet: to.id, pay: 90, from: 'JUNO PELL' };
          return { text: `The crate is heavier than it looks, and warm. Land anywhere on ${to.name} before the gate and it's 90 scrap. Don't shake it.` };
        },
      },
      {
        label: 'TAKE THE CRATE',
        note: () => '+70 SCRAP NOW. A FIGHT, AND A PRICE ON YOUR HEAD',
        outcome: (run) => {
          run.scrap += 70;
          run.bounty++;
          return { text: 'She calls the Syndicate. Of course she does. And the Syndicate puts a price on you.', fight: 'hunt' };
        },
      },
      { label: 'FLY ON', note: () => '', outcome: () => ({ text: 'Her calls fade behind you.' }) },
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
      `A beacon older than any colony, singing in prime numbers. Your instruments go a little mad near it. Lock on to its song and it might give you something; get it wrong and the song is a weapon. The Collector pays for coordinates like these${run.collector ? ', more every time' : ''}.`,
    choices: [
      {
        label: 'TUNE IN',
        game: 'tune',
        note: (_, bold) => (bold ? 'ALL THREE VOICES: AN EPIC PART. FAIL: -2 HULL' : 'LOCK ON: A RARE PART. FAIL: -1 HULL'),
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
        note: (run) => `+${30 + run.collector * 15} SCRAP (HE PAYS MORE EVERY TIME)`,
        outcome: (run) => {
          const pay = 30 + run.collector * 15;
          run.scrap += pay;
          run.collector++;
          return { text: `The Collector pays ${pay}, by return, and asks you to keep an ear open. He always asks that.` };
        },
      },
      {
        label: 'TRIANGULATE IT',
        note: () => 'REVEALS 3 HIDDEN SITES',
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
    text: () => "Lana Vey's runner went down here last season. Her engines are still warm, somehow, and the beacons of her last run still blink across the dunes.",
    choices: [
      {
        label: 'STRIP HER ENGINES',
        note: () => 'AN ENGINE PART FOR EACH OF YOU',
        outcome: (run, p) => {
          run.give(() => ofClass(p.r, 'engine'));
          return { text: 'Engines. Fast ones. Still a little warm.' };
        },
      },
      {
        label: 'FINISH HER LAST RUN',
        note: () => 'A RAID: +40 SCRAP AND +1 FUEL UP FRONT',
        outcome: (run) => {
          run.scrap += 40;
          run.addFuel(1);
          return { text: 'You siphon her tank and fly the run she never finished. The ones who shot her down are waiting.', fight: 'raid' };
        },
      },
      {
        label: 'PULL THE BLACK BOX',
        note: () => '+10 SCRAP, REVEALS 2 SITES',
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
    text: () => 'A sleeper pod, adrift a hundred years and spinning. The sleeper inside is still breathing. The name on the frost reads DR I. VARGA, SHIP\'S SURGEON.',
    choices: [
      {
        label: 'CATCH THE POD',
        game: 'dock',
        note: (_, bold) => (bold ? 'SPINNING FAST: SHE OWES YOU, +3 HULL. FAIL: -2' : 'MATCH ITS SPIN: SHE OWES YOU ONE. FAIL: -1 HULL'),
        outcome: (run, p) => {
          if (tier(p.score) === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'You clip it. The pod tumbles away into the dark, and you limp off with a dent the shape of a coffin.' };
          }
          run.heal(p.bold ? 3 : 1);
          if (!run.favours.includes('doctor')) run.favours.push('doctor');
          return { text: 'She wakes, takes one look at your hull, and rolls up her sleeves. "I owe you one. When you\'re bleeding, call."' };
        },
      },
      {
        label: 'SELL THE POD',
        note: () => '+70 SCRAP. THE PORT AUTHORITY WILL HEAR',
        outcome: (run) => {
          run.scrap += 70;
          run.mood('Port Authority', -1);
          return { text: "You don't ask what the buyers want her for. 70 scrap. The Port Authority keeps a list of people like you." };
        },
      },
      {
        label: 'LEAVE A BEACON ON IT',
        note: () => 'THE PORT AUTHORITY LIKES YOU',
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
        note: (_, bold) => (bold ? 'HOLD THE SWEEP UP TO 3 WATCHES. FAIL: IT COMES ON' : 'HOLD THE SWEEP UP TO 1.5 WATCHES'),
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
        note: () => 'A TECH PART EACH',
        outcome: (run, p) => {
          run.give(() => pick(p.r, ['reactor', 'capacitor', 'targeter', 'amp']));
          return { text: 'Good parts in these relays. The Syndicate does buy the best.' };
        },
      },
      {
        label: 'READ ITS ORDERS',
        note: () => 'REVEALS EVERY HIDDEN SITE',
        outcome: (run) => {
          run.chart.reveal(99);
          return { text: 'The relay has been logging what the Syndicate knows about this system. Now you know it too.' };
        },
      },
    ],
  },
  {
    id: 'loan',
    title: "MAMA RUZZ'S BARGE",
    art: 'loan',
    who: 'MAMA RUZZ, MONEYLENDER',
    danger: 0,
    weight: 7,
    where: 'any',
    open: true,
    rumour: 'Mama Ruzz lends scrap. A tenth more every jump. Her boys collect at the gate.',
    text: (run) =>
      run.debt
        ? `"My favourite! You owe Mama ${run.debt}. It grows a tenth every jump, like a baby. Pay before the gate, or my boys come to say hello."`
        : '"Sit, sit, you look thin. Scrap is tight? Mama lends. A tenth more every jump, paid before you leave the system. My boys never forget a face."',
    choices: [
      {
        label: 'BORROW 60',
        note: () => 'OWE 66 AFTER ONE JUMP, 80 AFTER THREE',
        outcome: (run) => {
          run.scrap += 60;
          run.debt += 60;
          return { text: '"Good! Spend it on something shiny." She writes your name in a very big book.' };
        },
      },
      {
        label: 'BORROW 150',
        note: () => 'OWE 165 AFTER ONE JUMP, 200 AFTER THREE',
        outcome: (run) => {
          run.scrap += 150;
          run.debt += 150;
          return { text: '"A big spender! Mama likes." Both goons crack their knuckles, warmly.' };
        },
      },
      {
        label: 'PAY WHAT YOU OWE',
        if: (run) => run.debt > 0,
        note: (run) => `-${run.debt} SCRAP`,
        locked: (run) => (run.scrap < run.debt ? `NEEDS ${run.debt} SCRAP` : null),
        outcome: (run) => {
          run.scrap -= run.debt;
          run.debt = 0;
          return { text: '"Always a pleasure." She crosses you out of the book, a little sadly.' };
        },
      },
      { label: 'NO THANK YOU', note: () => '', outcome: () => ({ text: '"Next time, my love. There is always a next time."' }) },
    ],
  },
  {
    id: 'dice',
    title: "SPOKE'S TABLE",
    art: 'dice',
    who: 'SPOKE, WHO RUNS THE REELS',
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
        note: (_, bold) => (bold ? 'STAKE 40 ON THE FAST REELS' : 'STAKE 15 ON THE SLOW REELS'),
        locked: (run) => (run.scrap < 15 ? 'NEEDS 15 SCRAP' : null),
        outcome: (run, p) => {
          const stake = p.bold && run.scrap >= 40 ? 40 : 15;
          const k = [0, 2, 5, 10][tier(p.score)];
          run.scrap += stake * k - stake;
          return {
            text: k === 0 ? '"Unlucky! Again?" Spoke sweeps your scrap into a bucket without looking.' : k === 10 ? 'THREE COGS. The den goes quiet. Spoke pays, very slowly, counting every piece twice.' : `"A winner!" Spoke pays ${stake * k}, and looks at you a little longer than before.`,
          };
        },
      },
      {
        label: 'BUY A RUMOUR',
        note: () => '-10 SCRAP, REVEALS 2 SITES',
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
        note: (run) => `+${run.bounty * 20} SCRAP (YOUR NOTORIETY)`,
        outcome: (run) => {
          run.scrap += run.bounty * 20;
          return { text: 'The den loves an outlaw. Spoke pays for the telling, and charges a crowd to listen.' };
        },
      },
      { label: 'WALK AWAY', note: () => '', outcome: () => ({ text: '"Your loss, friend. Literally not, this time."' }) },
    ],
  },
  {
    id: 'customs',
    title: 'CUSTOMS CUTTER',
    art: 'customs',
    who: 'INSPECTOR HOLLOWAY, PORT AUTHORITY',
    danger: 1,
    weight: 7,
    where: 'any',
    open: false,
    rumour: 'A Port Authority cutter. Inspector Holloway does love a hold full of parts.',
    text: (run) =>
      `"Cut your engines and open your hold. Anything undeclared will be confiscated, and anything confiscated will be declared. Paperwork."${run.bounty ? ' He looks at your face, then at a poster, then at your face.' : ''}`,
    choices: [
      {
        label: 'OPEN THE HOLD',
        note: (run) => (run.bounty ? 'HE TAKES A PART PER BOUNTY. PORT AUTHORITY +1' : 'NOTHING TO HIDE. PORT AUTHORITY +1'),
        outcome: (run, p) => {
          run.mood('Port Authority', 1);
          let took = 0;
          for (let k = 0; k < run.bounty; k++) {
            const c = run.crew.find((c) => c.cargo.length);
            if (!c) break;
            c.cargo.splice(Math.floor(p.r() * c.cargo.length), 1);
            took++;
          }
          return { text: took ? `Holloway confiscates ${took} part${took > 1 ? 's' : ''} "pending enquiries". There will be no enquiries.` : 'Clean. Holloway is almost disappointed. He stamps something.' };
        },
      },
      {
        label: 'BRIBE HIM',
        note: () => '-25 SCRAP. HE MIGHT LET SOMETHING SLIP',
        locked: lacks(25),
        outcome: (run) => {
          run.scrap -= 25;
          if (run.bounty) run.bounty--;
          run.chart.reveal(1);
          return { text: 'He pockets it without looking up, loses a page of his file on you, and mentions where his colleagues are not.' };
        },
      },
      {
        label: 'RUN FOR IT',
        game: 'thread',
        note: (_, bold) => (bold ? 'THROUGH THE MINES: LOSE HIM AND +40. FAIL: -2 HULL' : 'LOSE HIM IN THE ROCKS. BOUNTY +1. FAIL: -1 HULL'),
        outcome: (run, p) => {
          run.bounty++;
          run.mood('Port Authority', -1);
          if (tier(p.score) <= 1) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'His guns find you twice before the rocks do. You get away, just, and now there is a poster.' };
          }
          if (p.bold) run.scrap += 40;
          return { text: p.bold ? 'He follows you into the mines, and the mines get him. You pick through his cargo pods on the way out.' : 'You leave him reading the rocks. There will be a poster.' };
        },
      },
    ],
  },
  {
    id: 'insurance',
    title: 'LANTERN MUTUAL',
    art: 'insurance',
    who: 'PIP HOLLOW, LANTERN MUTUAL',
    danger: 0,
    weight: 6,
    where: 'any',
    open: true,
    rumour: 'Pip Hollow sells hull insurance from a pink shuttle. It does pay out.',
    text: () => '"Pip Hollow, Lantern Mutual! Space is dangerous, friend. Hulls get holes. But with a Lantern policy every hole is a little nest egg! Pays out on every hull lost, until you leave the system."',
    choices: [
      {
        label: 'THE SILVER POLICY',
        note: () => '-30 SCRAP: 15 FOR EVERY HULL LOST THIS SECTOR',
        locked: lacks(30),
        if: (run) => run.policy < 15,
        outcome: (run) => {
          run.scrap -= 30;
          run.policy = 15;
          return { text: '"Splendid! Sign here, and here, and initial there." The policy is thicker than your armour.' };
        },
      },
      {
        label: 'THE GOLD POLICY',
        note: () => '-60 SCRAP: 30 FOR EVERY HULL LOST THIS SECTOR',
        locked: lacks(60),
        if: (run) => run.policy < 30,
        outcome: (run) => {
          run.scrap -= 60;
          run.policy = 30;
          return { text: '"A connoisseur!" Pip throws in a calendar. Every month is a picture of a different explosion.' };
        },
      },
      { label: 'NO THANK YOU', note: () => '', outcome: () => ({ text: '"I\'ll be around. Accidents always are."' }) },
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
        note: (_, bold) => (bold ? 'THE DEEP CACHE: UP TO 90 + AN EPIC. BADLY: -2 HULL' : 'THE NEAR CACHE: UP TO 50 + A PART. BADLY: -1 HULL'),
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
        note: () => '+20 SCRAP. THE SWEEP HEARS IT: 1 WATCH CLOSER',
        outcome: (run) => {
          run.scrap += 20;
          run.holdSweep(-1);
          return { text: 'A fine show. You sift what floats out of the smoke, and every Syndicate ship in the system turns to look.' };
        },
      },
      { label: 'GO ROUND', note: () => 'NOTHING GAINED, NOTHING LOST', outcome: () => ({ text: 'You give the field a wide berth.' }) },
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
        note: (_, bold) => (bold ? 'COME IN FAST: 2 RARE PARTS + 2 FUEL. FAIL: -2 HULL' : 'COME IN SLOW: A PART + 1 FUEL. FAIL: -1 HULL'),
        outcome: (run, p) => {
          if (tier(p.score) === 0) {
            run.hurt(p.bold ? 2 : 1);
            return { text: 'You hit the port at a bad angle. The Margarethe shrugs you off, and says "Welcome aboard" again.' };
          }
          const n = p.bold ? 2 : 1;
          for (let k = 0; k < n; k++) run.give(part(p.r, p.bold ? 'rare' : 'common'));
          run.addFuel(n);
          return { text: "Her hold is cold and full. You take what you can carry and her tanks' last fuel, and leave the crew to their welcome." };
        },
      },
      {
        label: 'BLOW HER HOLD OPEN',
        note: () => 'A FIGHT WITH HER GUNS, THEN +30 SCRAP',
        outcome: (run) => {
          run.scrap += 30;
          return { text: 'Her guns wake up before her crew does.', fight: 'raid' };
        },
      },
      { label: 'LEAVE HER', note: () => '', outcome: () => ({ text: '"Welcome aboard," she says, as you go.' }) },
    ],
  },
  {
    id: 'refugees',
    title: 'THE LAST CONVOY',
    art: 'refugees',
    who: 'CAPTAIN ODO BRASK',
    danger: 0,
    weight: 6,
    where: 'any',
    open: false,
    rumour: 'Refugees out of fuel, with nothing to pay but what they know.',
    text: () => '"We left with what we could carry, and the Cartel took the rest. We need fuel. We can\'t pay you in scrap, but we know this system, and we don\'t forget a kindness."',
    choices: [
      {
        label: 'GIVE THEM 2 FUEL',
        note: () => 'REVEALS THE WHOLE CHART. BRASK OWES YOU ONE',
        locked: (run) => (run.fuel < 2 ? 'NEEDS 2 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 2;
          run.chart.reveal(99);
          if (!run.favours.includes('brask')) run.favours.push('brask');
          return { text: 'Brask marks up your chart with everything they saw on the way in. "At the Warden\'s gate, look for us. We\'ll draw its fire."' };
        },
      },
      {
        label: 'SELL THEM 1 FUEL',
        note: () => '-1 FUEL, +25 SCRAP',
        locked: (run) => (run.fuel < 1 ? 'NEEDS 1 FUEL' : null),
        outcome: (run) => {
          run.fuel -= 1;
          run.scrap += 25;
          return { text: 'They pay with a wedding ring and a bag of washers. It comes to 25.' };
        },
      },
      {
        label: 'ROB THEM',
        note: () => '+40 SCRAP +1 FUEL. BOUNTY, AND EVERYONE HEARS',
        outcome: (run) => {
          run.scrap += 40;
          run.addFuel(1);
          run.bounty++;
          run.mood('Port Authority', -1);
          run.mood('Scav Clans', -1);
          return { text: "Nobody fights back. That's somehow worse. Word gets around." };
        },
      },
      { label: 'WISH THEM LUCK', note: () => '', outcome: () => ({ text: 'Brask nods. Luck is about all anyone has out here.' }) },
    ],
  },
  {
    id: 'tanker',
    title: "BIG NELL'S TANKER",
    art: 'tanker',
    who: 'BIG NELL, FUEL MERCHANT',
    danger: 0,
    weight: 7,
    where: 'any',
    open: true,
    rumour: 'Big Nell sells fuel. Cheaper if you hold the hose yourself.',
    text: () => '"Fuel! Clean-ish! Twelve a cell from the tap, or ten scrap and you hold the hose yourself, and whatever you catch is yours. Hose has a mind of its own. Don\'t let it touch your hull."',
    choices: [
      {
        label: 'BUY 2 FUEL',
        note: () => '-24 SCRAP, +2 FUEL',
        locked: lacks(24),
        outcome: (run) => {
          run.scrap -= 24;
          run.addFuel(2);
          return { text: '"Pleasure. Mind the step."' };
        },
      },
      {
        label: 'HOLD THE HOSE YOURSELF',
        game: 'tow',
        note: (_, bold) => (bold ? '-10 SCRAP, FULL PRESSURE: UP TO +5 FUEL. FAIL: -1 HULL' : '-10 SCRAP: UP TO +3 FUEL'),
        locked: lacks(10),
        outcome: (run, p) => {
          run.scrap -= 10;
          const got = Math.round(p.score * (p.bold ? 5 : 3));
          run.addFuel(got);
          if (p.bold && tier(p.score) === 0) {
            run.hurt(1);
            return { text: 'The hose gets away from you and paints your hull with burning fuel. Nell laughs until she cries.' };
          }
          return { text: got ? `You catch ${got} cell${got > 1 ? 's' : ''} and most of your dignity.` : 'The hose wins. Nell keeps the ten.' };
        },
      },
      {
        label: 'ASK FOR GOSSIP',
        note: () => 'FREE: REVEALS A SITE',
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
    who: 'ROLLO STAX, THE VOICE OF THE LANES',
    danger: 0,
    weight: 6,
    where: 'any',
    open: false,
    rumour: 'A pirate broadcaster. His news moves markets.',
    text: (run) =>
      `"This is Rollo Stax and the Lantern Gazette, the only news that isn't lying to you on purpose! Today: who's buying, who's dying, and ${run.bounty ? 'a certain outlaw who just walked into my studio' : 'a pilot with an honest face'}."`,
    choices: [
      {
        label: 'LISTEN TO THE MARKET NEWS',
        note: () => 'A DEALER PAYS ×3 FOR ONE CLASS OF PART, THIS SECTOR',
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
        note: () => '-40 SCRAP: THE BOUNTY IS GONE',
        locked: lacks(40),
        outcome: (run) => {
          run.scrap -= 40;
          run.bounty = 0;
          return { text: '"...tragically lost with all hands. A moment\'s silence. That\'s enough." Kaspar will hear it too.' };
        },
      },
      {
        label: 'GIVE HIM A STORY',
        note: () => '+15 SCRAP, A FACTION GETS A BAD PRESS',
        outcome: (run, p) => {
          run.scrap += 15;
          run.mood(p.planet.faction, -1);
          return { text: `Rollo tears into the ${p.planet.faction} on air. They will know who told him.` };
        },
      },
    ],
  },
  // ---- these only come to you ----
  {
    id: 'hunter',
    title: 'KASPAR',
    art: 'hunter',
    who: 'KASPAR, WHO HUNTS FOR BOUNTIES',
    danger: 3,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: (run) => `"Kaspar. There's ${run.bounty * 40} scrap on your head, friend. I could collect it. Or you could pay me a little less than that, and I could forget your face. I'm very good at forgetting."`,
    choices: [
      {
        label: 'PAY HIM OFF',
        note: (run) => `-${run.bounty * 30} SCRAP: THE BOUNTY IS GONE`,
        locked: (run) => lacks(run.bounty * 30)(run),
        outcome: (run) => {
          run.scrap -= run.bounty * 30;
          run.bounty = 0;
          return { text: '"Who are you again?" He is very good at it.' };
        },
      },
      {
        label: 'FIGHT HIM',
        note: () => 'A HARD HUNT. WIN AND THE BOUNTY IS GONE',
        outcome: (run) => {
          run.bounty = 0;
          return { text: '"I hoped you\'d say that." His hunters come out of the moon\'s shadow.', fight: 'hunt', harder: 0.3 };
        },
      },
      {
        label: 'OUTRUN HIM',
        game: 'thread',
        note: (_, bold) => (bold ? 'THROUGH THE DEBRIS: LOSE HIM. FAIL: FIGHT HIM' : 'LOSE HIM. FAIL: -2 HULL'),
        outcome: (run, p) => {
          if (tier(p.score) <= 1) {
            if (p.bold) return { text: 'He was waiting on the other side. Of course he was.', fight: 'hunt', harder: 0.3 };
            run.hurt(2);
            return { text: 'His harpoons rake you as you go. You get away. He has your scent now.' };
          }
          return { text: 'You lose him in the debris. He will be back; he always is.' };
        },
      },
    ],
  },
  {
    id: 'collect',
    title: "MAMA'S BOYS",
    art: 'loan',
    who: 'MAMA RUZZ, BY RADIO',
    danger: 3,
    weight: 0,
    where: 'never',
    open: false,
    rumour: '',
    text: (run) => `"Leaving without saying goodbye? You owe Mama ${run.debt}. My boys are right behind you. Pay, or they take it out of your hold, or out of your hide."`,
    choices: [
      {
        label: 'PAY UP',
        note: (run) => `-${run.debt} SCRAP`,
        locked: (run) => (run.scrap < run.debt ? `NEEDS ${run.debt} SCRAP` : null),
        outcome: (run) => {
          run.scrap -= run.debt;
          run.debt = 0;
          return { text: '"There. Was that so hard?" The boys wave you through, a little disappointed.' };
        },
      },
      {
        label: 'LET THEM TAKE IT',
        note: () => 'ALL YOUR SCRAP, AND A PART FOR EVERY 40 SHORT',
        outcome: (run) => {
          let owed = run.debt - run.scrap;
          run.scrap = Math.max(0, run.scrap - run.debt);
          let took = 0;
          while (owed > 0) {
            const c = run.crew.find((c) => c.cargo.length);
            if (!c) break;
            c.cargo.pop();
            owed -= 40;
            took++;
          }
          if (owed > 0) run.hurt(1);
          run.debt = 0;
          return { text: `They clean out the tin${took ? ` and ${took} part${took > 1 ? 's' : ''} from the hold` : ''}${owed > 0 ? ', and leave a dent to remember them by' : ''}. "Mama says come again!"` };
        },
      },
      {
        label: 'FIGHT THEM',
        note: () => 'A HARD HUNT. WIN AND THE DEBT IS FORGOTTEN. BOUNTY +1',
        outcome: (run) => {
          run.debt = 0;
          run.bounty++;
          return { text: '"Oh, my love. That is a mistake." The boys come in welding masks.', fight: 'hunt', harder: 0.25 };
        },
      },
    ],
  },
];

/** What the chart needs to deal events out. */
export const EVENT_META = EVENTS;

export const eventById = (id: string) => EVENTS.find((e) => e.id === id)!;
