/**
 * What a part makes and what it wants, in a few shared words, so a card can say which parts it
 * works with and the hangar can draw it (see docs/parts-variety.md, "Every part makes something
 * and wants something"):
 *
 * - SETUPS a blow cashes in: BURN, SHOCK, CRACK, CHILL (four freeze it), PIN.
 * - BLOW: what cashes them in (heavy rounds, the Hammerhead's ram, caught shots, bombs).
 * - The ship's own verbs, which relays hand on to guns: PERFECT, GRAZE, RAM, CATCH.
 *
 * Words only: the sim works from the parts' numbers (sim/build.ts, sim/level.ts, sim/arsenal.ts).
 */

import { partById, type FrameDef, type PartDef } from './parts';
import { tagMarks } from '../sim/marks';
import { BURN, CRACK, SHOCK } from '../sim/marks';
import type { Build } from '../sim/build';

export type Word = 'BURN' | 'SHOCK' | 'CRACK' | 'CHILL' | 'PIN' | 'BLOW' | 'SETUP' | 'PERFECT' | 'GRAZE' | 'RAM' | 'CATCH' | 'MARKS';

const SETUPS: Word[] = ['BURN', 'SHOCK', 'CRACK', 'CHILL', 'PIN'];
const MARK_WORDS: Word[] = ['BURN', 'SHOCK', 'CRACK'];

export const WORD_COLOR: Record<Word, string> = {
  BURN: '#ff8a3a',
  SHOCK: '#8ad8ff',
  CRACK: '#ffd060',
  CHILL: '#c8f0ff',
  PIN: '#c8b090',
  BLOW: '#ffffff',
  SETUP: '#e0c070',
  MARKS: '#e0c070',
  PERFECT: '#ffffff',
  GRAZE: '#8ad8ff',
  RAM: '#ffd060',
  CATCH: '#ffd060',
};

function bitWords(bits: number): Word[] {
  const out: Word[] = [];
  if (bits & BURN) out.push('BURN');
  if (bits & SHOCK) out.push('SHOCK');
  if (bits & CRACK) out.push('CRACK');
  return out;
}

/** What it puts out: the setups it leaves, a blow, or a verb it hands on. */
export function makes(d: PartDef): Word[] {
  const out = new Set<Word>();
  const g = d.gun;
  if (g) {
    for (const w of bitWords(tagMarks(d.tags))) out.add(w);
    if (g.crackEvery) out.add('CRACK');
    if (g.chill) out.add('CHILL');
    if (g.pin) out.add('PIN');
    if (g.heavy) out.add('BLOW');
  }
  if (d.boost?.mark) out.add(d.boost.mark.toUpperCase() as Word);
  if (d.boost?.chill) out.add('CHILL');
  if (d.mod?.ram) out.add('RAM').add('BLOW');
  if (d.aux === 'parry') out.add('CATCH').add('BLOW');
  if (d.special === 'bomb') out.add('BLOW');
  if (d.passive?.mirror) out.add('BLOW');
  return [...out];
}

/** What makes it work: a setup to cash, a blow to cash its setups, a verb to relay. */
export function wants(d: PartDef): Word[] {
  const out = new Set<Word>();
  const setup = makes(d).some((w) => SETUPS.includes(w));
  if (d.gun?.heavy) out.add('SETUP');
  else if (setup) out.add('BLOW');
  if (d.boost?.flaw || d.mod?.detonate) out.add('MARKS');
  if (d.boost?.mark || d.boost?.chill) out.add('BLOW');
  const relay = d.boost?.relay;
  if (relay === 'echo') out.add('PERFECT');
  if (relay === 'graze') out.add('GRAZE');
  if (relay === 'ram') out.add('RAM');
  if (relay === 'catch') out.add('CATCH');
  return [...out];
}

/** What a frame does on its own: the Kestrel's fly-by, the Hammerhead's ram, the Magpie's catch. */
export function frameMakes(f: FrameDef): Word[] {
  // (every ship perfects and grazes; the Kestrel's fly-by volley is a blow)
  const out: Word[] = ['PERFECT', 'GRAZE'];
  if (f.flyby) out.push('BLOW');
  if (f.ram) out.push('RAM', 'BLOW');
  if (f.catch) out.push('CATCH', 'BLOW');
  return out;
}

/** Whether something that makes `m` gives what `w` wants. */
function gives(m: Word[], w: Word[]) {
  return w.some((x) => m.includes(x) || (x === 'SETUP' && m.some((y) => SETUPS.includes(y))) || (x === 'MARKS' && m.some((y) => MARK_WORDS.includes(y))));
}

/** Whether two parts work together: one makes what the other wants (either way). */
export function connects(a: PartDef, b: PartDef) {
  if (a === b) return false;
  return gives(makes(a), wants(b)) || gives(makes(b), wants(a));
}

/** The parts on a ship (and its frame's own verbs) that a part would work with. */
export function worksWith(d: PartDef, b: Build, f: FrameDef): string[] {
  const out = new Set<string>();
  if (gives(frameMakes(f), wants(d))) out.add(f.name.toUpperCase());
  for (const p of b.parts) {
    const q = partById(p.id);
    if (q.id !== d.id && connects(d, q)) out.add(q.name.toUpperCase());
  }
  return [...out];
}

/** The card's line: "MAKES CRACK BLOW · WANTS A SETUP". */
export function wordLine(d: PartDef): [string, string][] {
  const m = makes(d);
  const w = wants(d);
  const out: [string, string][] = [];
  if (m.length) {
    out.push(['MAKES', '#8a7e98']);
    for (const x of m) out.push([x, WORD_COLOR[x]]);
  }
  if (w.length) {
    out.push([m.length ? '· WANTS' : 'WANTS', '#8a7e98']);
    for (const x of w) out.push([x === 'SETUP' ? 'A SETUP' : x === 'MARKS' ? 'MARKS' : x, WORD_COLOR[x]]);
  }
  return out;
}
