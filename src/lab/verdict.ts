/**
 * How a fight sits against the bands the bench is set to: how long a wave should take to clear,
 * and how much of the hull a fight should cost. Under both is too easy; over either is too hard;
 * ships going down is not doable.
 */

import type { BenchSettings } from './state';
import { h, icon } from './ui';

export type Level = -2 | -1 | 0 | 1 | 2 | 3;

export interface Verdict {
  level: Level;
  word: string;
  why: string;
}

export interface Measure {
  /** Median seconds to clear a wave. */
  ttk: number;
  /** Share of the hull lost, 0..1. */
  hullLost: number;
  /** Share of the flights where every ship went down. */
  failed: number;
  /** Share of the enemies that got away (optional). */
  leaks?: number;
}

export const WORDS: Record<Level, string> = { [-2]: 'Too easy', [-1]: 'Easy', 0: 'On target', 1: 'Hard', 2: 'Too hard', 3: 'Not doable' };
export const FILL: Record<Level, string> = { [-2]: 'var(--easy-2)', [-1]: 'var(--easy-1)', 0: 'var(--fair)', 1: 'var(--hard-1)', 2: 'var(--hard-2)', 3: 'var(--hard-2)' };
/** Ink on each fill. */
export const INKS: Record<Level, string> = { [-2]: '#0b1626', [-1]: 'var(--cream)', 0: 'var(--cream)', 1: 'var(--cream)', 2: '#1b0808', 3: '#1b0808' };

export function verdict(m: Measure, b: Pick<BenchSettings, 'ttk' | 'hull'> & { leak?: number }): Verdict {
  const t = isFinite(m.ttk) ? (m.ttk - b.ttk[0]) / (b.ttk[1] - b.ttk[0]) : NaN;
  const u = isFinite(m.hullLost) ? (m.hullLost - b.hull[0]) / (b.hull[1] - b.hull[0]) : NaN;
  const why: string[] = [];
  if (m.failed > 0) return { level: m.failed >= 0.5 ? 3 : 2, word: m.failed >= 0.5 ? WORDS[3] : WORDS[2], why: `Every ship went down in ${Math.round(m.failed * 100)}% of the flights` };
  const g = m.leaks !== undefined && b.leak ? m.leaks / b.leak : NaN;
  const hard = Math.max(isNaN(t) ? -Infinity : t, isNaN(u) ? -Infinity : u, isNaN(g) ? -Infinity : g);
  if (g > 1) why.push(`${Math.round(m.leaks! * 100)}% of the enemies get away (at most ${Math.round(b.leak! * 100)}%)`);
  if (t > 1) why.push(`waves take ${m.ttk.toFixed(1)} s to clear (the band ends at ${b.ttk[1]} s)`);
  if (u > 1) why.push(`it costs ${Math.round(m.hullLost * 100)}% of the hull (the band ends at ${Math.round(b.hull[1] * 100)}%)`);
  if (hard > 1) return { level: hard > 1.6 ? 2 : 1, word: WORDS[hard > 1.6 ? 2 : 1], why: cap(why.join(', and ')) };
  const easyT = isNaN(t) || t < 0;
  const easyU = isNaN(u) || u < 0;
  if (easyT && easyU && !(isNaN(t) && isNaN(u))) {
    const deep = (isNaN(t) || t < -0.6) && (isNaN(u) || m.hullLost <= 0.02);
    return { level: deep ? -2 : -1, word: WORDS[deep ? -2 : -1], why: cap(`waves clear in ${isFinite(m.ttk) ? m.ttk.toFixed(1) : '–'} s and it costs ${Math.round((m.hullLost || 0) * 100)}% of the hull: under both bands`) };
  }
  return { level: 0, word: WORDS[0], why: 'Inside the bands' };
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function verdictPill(v: Verdict) {
  const cls = v.level === 3 ? 'fail' : v.level > 0 ? 'hard' : v.level < 0 ? 'easy' : 'fair';
  return h('span', { class: `pill ${cls}`, title: v.why }, v.level === 3 ? icon('skull') : v.level === 2 ? icon('warn') : null, v.word);
}
