/**
 * Checks that every event choice says what it does: plays each choice out on a fresh run, every
 * way it can go (each grade of a game, bold and not; a gamble won and lost), and compares what
 * changed with the chips that choice shows for that result. Prints what happened but wasn't shown,
 * and what was shown but didn't happen.
 *
 *   just event-audit            (every event)
 *   just event-audit derelict   (one)
 */

import { EVENTS, GRADE_AT, type Chip, type Choice, type RunEvent, type Scene, type When } from '../src/sim/events';
import { Run } from '../src/sim/run';
import { rng } from '../src/util';

const only = process.argv[2];

/** A game's result at each grade, and which `on` chips come true there. */
const GRADES: { name: string; score: number; when: When[] }[] = [
  { name: 'F', score: 0.1, when: ['fail'] },
  { name: 'C', score: (GRADE_AT.pass + GRADE_AT.a) / 2, when: ['pass'] },
  { name: 'A', score: (GRADE_AT.a + GRADE_AT.s) / 2, when: ['pass', 'a'] },
  { name: 'S', score: 0.97, when: ['pass', 'a', 's'] },
];

/** A change line from Run.changes, as the kind of chip that should have shown it. */
function kindOf(text: string, tone: string): string {
  if (/CORE COPIES/.test(text)) return 'core';
  if (/^(P\d )?[+-]\d+ SCRAP$/.test(text)) return `scrap${text.includes('-') ? '-' : '+'}`;
  if (/^[+-]\d+ FUEL$/.test(text)) return `fuel${text.startsWith('-') ? '-' : '+'}`;
  if (/^[+-]\d+ HULL$/.test(text)) return `hull${text.startsWith('-') ? '-' : '+'}`;
  if (/^(P\d )?\+ /.test(text)) return 'part+';
  if (/^(P\d )?- /.test(text)) return 'part-';
  if (/BOUNTY/.test(text)) return 'bounty';
  // (a favour someone owes you, not a debt: run.ts FAVOURS)
  if (/OWES YOU ONE/.test(text)) return tone === 'bad' ? 'other-' : 'other+';
  if (/OWE|IS PAID/.test(text)) return 'debt';
  if (/LIKE YOU/.test(text)) return 'rep';
  if (/SWEEP/.test(text)) return 'sweep';
  if (/REVEALED/.test(text)) return 'chart';
  return tone === 'bad' ? 'other-' : 'other+';
}

/** Which change kinds a chip stands for. */
function covers(c: Chip): string[] {
  // (a promise that something doesn't happen: NO FUEL LOST)
  if (/^NO /.test(c.text)) return [];
  const sign = /^\+|FULL HULL/.test(c.text) ? '+' : /^-/.test(c.text) ? '-' : c.tone === 'bad' ? '-' : '+';
  switch (c.icon) {
    case 'scrap':
    case 'fuel':
    case 'hull':
      return [`${c.icon}${sign}`];
    case 'part':
      return [c.tone === 'bad' ? 'part-' : 'part+'];
    case 'bounty':
    case 'rep':
    case 'core':
    case 'sweep':
    case 'chart':
    case 'debt':
      return [c.icon, 'other+', 'other-'];
    case 'favour':
    case 'crew':
    case 'risk':
      return ['other+', 'other-'];
    default:
      return [];
  }
}

/** Chip kinds worth saying out loud when they never happen (a promise the choice breaks). */
const PROMISES = new Set(['scrap+', 'scrap-', 'fuel+', 'fuel-', 'hull+', 'hull-', 'part+', 'part-', 'bounty', 'rep', 'core', 'sweep', 'chart']);

function fresh(seed: number) {
  const run = new Run(['kestrel'], seed);
  run.scrap = 400;
  run.crew[0].scrap = 400;
  // (room to heal and to hurt)
  run.crew[0].hull = Math.round(run.crew[0].hull / 2);
  run.crew[0].cargo.push({ id: 'rail', tier: 'rare' }, { id: 'amp' }, { id: 'thruster' });
  // (someone to owe, and a price on you, as the events that need them find you)
  run.debt = 120;
  run.bounty = 2;
  return run;
}

let problems = 0;
let checked = 0;

function audit(ev: RunEvent, cs: Choice[], path: string, setup: (run: Run) => void, depth: number) {
  for (const ch of cs) {
    const ways: { name: string; score: number; won: boolean; bold: boolean; when: When[] }[] = [];
    if (ch.game) for (const bold of ch.boldOnly ? [true] : [false, true]) for (const g of GRADES) ways.push({ name: `${g.name}${bold ? ' BOLD' : ''}`, score: g.score, won: true, bold, when: g.when });
    else if (ch.odds) ways.push({ name: 'WIN', score: 1, won: true, bold: false, when: ['win'] }, { name: 'LOSE', score: 1, won: false, bold: false, when: ['lose'] });
    else ways.push({ name: '', score: 1, won: true, bold: false, when: [] });
    const label = `${path}${ch.label}`;
    for (const w of ways) {
      const run = fresh(7);
      setup(run);
      const node = run.chart.nodes[1];
      const scene: Scene = { node, planet: run.chart.bossPlanet, again: 0 };
      if (ch.if && !ch.if(run, scene)) continue;
      if (ch.locked?.(run, scene)) continue;
      // a better grade's chip with the same icon says what that grade gets instead (EPIC, NOT RARE)
      const rank: Partial<Record<When, number>> = { pass: 1, a: 2, s: 3 };
      const shown = (ch.chips?.(run, w.bold, scene) ?? [])
        .filter((c) => !c.on || w.when.includes(c.on))
        .filter((c, _, xs) => !(c.on && rank[c.on] && xs.some((d) => d.on && (rank[d.on] ?? 0) > rank[c.on]! && d.icon === c.icon)));
      // a haggle settles on a price: a deal at the price that grade stands for (a shut gate changes nothing)
      let value: number | null = null;
      if (ch.game === 'haggle') {
        const st = ch.setup?.(run, w.bold, scene);
        if (st?.ask != null && st.floor != null) value = Math.round(st.ask - ((w.score - 0.05) / 0.95) * Math.max(1, st.ask - st.floor));
      }
      const before = run.snapshot();
      const res = ch.outcome(run, { ...scene, r: rng(99), score: w.score, bold: w.bold, level: w.bold ? 4 : ch.game ? 2 : 0, won: w.won, value });
      checked++;
      const happened = run.changes(before).map((c) => ({ ...c, kind: kindOf(c.text, c.tone) }));
      const said = new Set(shown.flatMap(covers));
      const missing = happened.filter((h) => !said.has(h.kind)).map((h) => h.text);
      if (res.fight && !shown.some((c) => c.icon === 'fight')) missing.push(`A FIGHT (${res.fight})`);
      const kinds = new Set(happened.map((h) => h.kind));
      const broken = shown.filter((c) => covers(c).some((k) => PROMISES.has(k)) && !covers(c).some((k) => kinds.has(k)) && !(c.icon === 'core' && kinds.has('core')));
      if (missing.length || broken.length) {
        problems++;
        console.log(`${ev.id.padEnd(10)} ${label}${w.name ? ` [${w.name}]` : ''}`);
        for (const m of missing) console.log(`    NOT SHOWN  ${m}`);
        for (const b of broken) console.log(`    NEVER HAPPENED  ${b.icon}: ${b.text}${b.on ? ` (on ${b.on})` : ''}`);
      }
      // a second beat: its choices, from where this one left things
      if (res.then && depth < 3 && w === ways[ways.length - 1]) {
        const thenSetup = (r2: Run) => {
          setup(r2);
          ch.outcome(r2, { ...scene, r: rng(99), score: w.score, bold: w.bold, level: 0, won: w.won, value: null });
        };
        audit(ev, res.then.choices, `${label} > `, thenSetup, depth + 1);
      }
    }
  }
}

for (const ev of EVENTS) {
  if (only && ev.id !== only) continue;
  audit(ev, ev.choices, '', () => {}, 0);
}
console.log(`\n${checked} outcomes played, ${problems} with something unsaid.`);
