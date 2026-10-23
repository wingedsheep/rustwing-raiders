/**
 * The sounds of SHAKE THEM OFF, made for it: the wet clamp of a leech going on, the slurp of them
 * drinking, the squeeze of a grip digging in, the whoosh of a roll (rising with the chain, a groan
 * of the airframe on a hard one), the pop of one flung, the crackle of the zap and the sizzle of a
 * fried one, the chitter in the dark that says a wave is coming, and the engine straining,
 * coughing out and catching again.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, env, held, metal, crackle, drive, mtof } = synth;
/** The pentatonic steps the chains climb. */
const PENTA = [0, 2, 4, 7, 9];
const step = (n: number) => Math.floor(n / 5) * 12 + PENTA[((n % 5) + 5) % 5];

/** A leech going on: a wet, sucking thwuck, and a click of teeth on the plating. */
defineSfx('mini_shake_clamp', (t, p, o) => {
  tone(o, t, 'sine', 260 * p, 70 * p, 0.12, 0.2, 0.002);
  noise(o, t, 0.1, 'bandpass', 700 * p, 220 * p, 2.5, 0.2, 0.002);
  // the suck: a narrow band sliding down, like a plunger
  noise(o, t + 0.015, 0.14, 'bandpass', 2600 * p, 700 * p, 6, 0.16, 0.01);
  noise(o, t + 0.06, 0.02, 'highpass', 4000, 4000, 0.7, 0.08);
  return 0.18;
}, 0.05, 3, { rev: 0.08 });

/** Drinking: a gulping slurp, re-triggered while any are on (pitch: how many). */
defineSfx('mini_shake_slurp', (t, p, o) => {
  const lp = filt(o, 'lowpass', 1400);
  // two gulps, a wobbling band of wet noise and a throat-pop under it
  for (const [d, k] of [[0, 1], [0.13, 1.25]] as const) {
    noise(lp, t + d, 0.11, 'bandpass', 380 * p * k, 900 * p * k, 4, 0.12, 0.02);
    tone(lp, t + d, 'sine', 120 * p * k, 190 * p * k, 0.07, 0.1, 0.01);
  }
  return 0.26;
}, 0.3, 2, { low: true });

/** A grip digging in deeper: a rubbery squeeze, lower for the red one (pitch). */
defineSfx('mini_shake_dig', (t, p, o) => {
  const lp = filt(o, 'lowpass', 900 * p, 3);
  tone(lp, t, 'sawtooth', 150 * p, 95 * p, 0.16, 0.14, 0.01);
  noise(o, t, 0.05, 'bandpass', 1800 * p, 1200 * p, 3, 0.08, 0.004);
  return 0.18;
}, 0.06, 3, { low: true });

/** A roll: a whoosh of air over the wings; pitch rises with the chain. */
defineSfx('mini_shake_roll', (t, p, o) => {
  noise(o, t, 0.2, 'bandpass', 380 * p, 1700 * p, 1.6, 0.2, 0.05);
  noise(o, t + 0.05, 0.16, 'bandpass', 1700 * p, 600 * p, 1.2, 0.1, 0.02);
  tone(o, t, 'sine', 95 * p, 55, 0.14, 0.16, 0.01);
  return 0.24;
}, 0.05, 3);

/** A hard roll: the whoosh, and the whole airframe groaning with it. */
defineSfx('mini_shake_hard', (t, p, o) => {
  noise(o, t, 0.28, 'bandpass', 300 * p, 2400 * p, 1.4, 0.24, 0.04);
  metal(o, t + 0.02, 92 * p, 0.09, 0.5);
  const lp = filt(o, 'lowpass', 600);
  tone(lp, t, 'sawtooth', 70 * p, 58 * p, 0.35, 0.12, 0.03);
  tone(o, t, 'sine', 120, 45, 0.22, 0.25, 0.004);
  return 0.5;
}, 0.08, 2, { rev: 0.2 });

/** One flung off: a leathery flap and a pop, climbing a scale with the chain (pitch: semitones up as a ratio). */
defineSfx('mini_shake_fling', (t, p, o) => {
  noise(o, t, 0.07, 'bandpass', 900 * p, 2200 * p, 1.8, 0.16, 0.002);
  const f = mtof(67) * p;
  tone(o, t + 0.01, 'triangle', f, f * 1.02, 0.12, 0.12, 0.002);
  tone(o, t + 0.01, 'sine', f * 2, f * 2, 0.06, 0.04, 0.002);
  tone(o, t, 'sine', 300 * p, 90 * p, 0.06, 0.12, 0.001);
  return 0.14;
}, 0.025, 5, { tuned: true });

/** Several off at once: a quick run up the scale, one note for each (pitch carries the count). */
defineSfx('mini_shake_cluster', (t, p, o) => {
  const n = Math.max(2, Math.min(6, Math.round(p * 2)));
  for (let k = 0; k < n; k++) {
    const f = mtof(72 + step(k + 1));
    tone(o, t + k * 0.055, 'triangle', f, f, 0.22, 0.09, 0.002);
    tone(o, t + k * 0.055, 'sine', f * 2, f * 2, 0.12, 0.03, 0.002);
  }
  noise(o, t, 0.12, 'bandpass', 1200, 5000, 2, 0.1, 0.06);
  return 0.25 + n * 0.055;
}, 0.1, 2, { tuned: true, rev: 0.3 });

/** The zap: a dry electric crackle that snaps out along the arc. */
defineSfx('mini_shake_zap', (t, p, o) => {
  const ctx = synth.ctx;
  const bp = filt(o, 'bandpass', 2400 * p, 0.9);
  const sq = ctx.createOscillator();
  sq.type = 'square';
  for (let k = 0; k < 10; k++) sq.frequency.setValueAtTime((180 + Math.random() * 1300) * p, t + k * 0.012);
  const g = ctx.createGain();
  env(g.gain, t, 0.001, 0.13, 0.13);
  sq.connect(g).connect(bp);
  sq.start(t);
  sq.stop(t + 0.16);
  crackle(o, t, 0.14, 10, 0.14);
  tone(o, t, 'sine', 2400 * p, 700 * p, 0.09, 0.05, 0.001);
  noise(o, t, 0.03, 'highpass', 5000, 5000, 0.7, 0.12);
  return 0.17;
}, 0.05, 2);

/** A zap that finds nothing: a weak fizz, spent. */
defineSfx('mini_shake_miss', (t, p, o) => {
  crackle(o, t, 0.08, 4, 0.06);
  tone(o, t, 'square', 220 * p, 110 * p, 0.08, 0.03, 0.002);
  return 0.1;
}, 0.05, 2, { low: true });

/** Fried: a fat sizzle and a pop, bigger for a big one (pitch below 1). */
defineSfx('mini_shake_fry', (t, p, o) => {
  noise(o, t, 0.32 / p, 'highpass', 3200 * p, 1800 * p, 0.8, 0.09, 0.004);
  crackle(o, t + 0.02, 0.25 / p, 12, 0.09);
  tone(o, t, 'sine', 420 * p, 80 * p, 0.12, 0.16, 0.001);
  noise(o, t, 0.06, 'bandpass', 900 * p, 400 * p, 1.5, 0.15, 0.001);
  return 0.36 / p;
}, 0.03, 4, { rev: 0.1 });

/** A big one only stung: a meaty smack and an angry squeal. */
defineSfx('mini_shake_sting', (t, p, o) => {
  noise(o, t, 0.05, 'bandpass', 1200 * p, 600 * p, 1.5, 0.22, 0.001);
  tone(o, t, 'sine', 180 * p, 80 * p, 0.1, 0.22, 0.002);
  const bp = filt(o, 'bandpass', 1500, 4);
  tone(bp, t + 0.03, 'sawtooth', 900 * p, 1300 * p, 0.14, 0.06, 0.01);
  return 0.18;
}, 0.05, 2);

/** A skitter dodging: a chirp and a flick of wings. */
defineSfx('mini_shake_dodge', (t, p, o) => {
  tone(o, t, 'triangle', 1400 * p, 2600 * p, 0.06, 0.07, 0.002);
  tone(o, t + 0.05, 'triangle', 2200 * p, 1600 * p, 0.05, 0.05, 0.002);
  noise(o, t, 0.08, 'bandpass', 2000 * p, 4000 * p, 2, 0.1, 0.004);
  return 0.12;
}, 0.05, 2);

/** A wave coming: a dry chitter in the dark, many small mouths, over a low swell. */
defineSfx('mini_shake_tell', (t, p, o) => {
  const bp = filt(o, 'bandpass', 2200 * p, 5);
  for (let k = 0; k < 9; k++) {
    const tt = t + k * 0.045 + Math.random() * 0.02;
    noise(bp, tt, 0.018, 'bandpass', (1800 + Math.random() * 900) * p, 1600 * p, 6, 0.4 * (0.6 + 0.4 * Math.random()), 0.001);
  }
  held(o, t, 'triangle', 110 * p, 104 * p, 0.35, 0.08, 0.12, 0.12);
  return 0.55;
}, 0.2, 2, { rev: 0.25 });

/** The swarm: a low dread swelling up, and the chitter of a great many. */
defineSfx('mini_shake_swarm', (t, p, o) => {
  const lp = filt(o, 'lowpass', 700, 1.5);
  held(lp, t, 'sawtooth', 55 * p, 82 * p, 1.1, 0.07, 0.5, 0.3);
  held(lp, t, 'sawtooth', 55.6 * p, 83 * p, 1.1, 0.055, 0.5, 0.3);
  const bp = filt(o, 'bandpass', 2400, 4);
  for (let k = 0; k < 26; k++) {
    const tt = t + 0.2 + Math.random() * 1.1;
    noise(bp, tt, 0.02, 'bandpass', 1600 + Math.random() * 1400, 1500, 6, 0.1 * Math.random() + 0.04, 0.001);
  }
  return 1.5;
}, 1, 1, { rev: 0.4, duck: [1.2, 0.6] });

/** The engine under strain: a hot groan, rising with how close it is to stalling (pitch). */
defineSfx('mini_shake_strain', (t, p, o) => {
  const lp = filt(o, 'lowpass', 500 * p, 4);
  tone(lp, t, 'sawtooth', 62 * p, 70 * p, 0.3, 0.07, 0.06);
  tone(lp, t, 'square', 124 * p, 132 * p, 0.25, 0.02, 0.06);
  return 0.32;
}, 0.22, 1, { low: true });

/** The engine stalling: three coughs, each weaker, then nothing. */
defineSfx('mini_shake_stall', (t, p, o) => {
  const d = drive(o, 0.6);
  for (let k = 0; k < 3; k++) {
    const tt = t + k * 0.17;
    const v = 1 - k * 0.28;
    tone(d, tt, 'sawtooth', 90 * p * v, 40 * p, 0.12, 0.3 * v, 0.004);
    noise(o, tt, 0.09, 'lowpass', 1200, 200, 1, 0.2 * v, 0.003);
  }
  tone(o, t + 0.5, 'sine', 220 * p, 60 * p, 0.4, 0.06, 0.02);
  return 0.95;
}, 0.5, 1, { rev: 0.15 });

/** The engine catching again: a starter whine that spins up and lights. */
defineSfx('mini_shake_restart', (t, p, o) => {
  tone(o, t, 'sawtooth', 120 * p, 420 * p, 0.32, 0.05, 0.05, 0.3);
  noise(o, t + 0.28, 0.12, 'bandpass', 600, 2400, 1.2, 0.14, 0.004);
  tone(o, t + 0.28, 'sine', 90, 140, 0.25, 0.2, 0.01);
  return 0.55;
}, 0.5, 1);

/** Time up, one leech's last gulp: a big wet swallow. */
defineSfx('mini_shake_gulp', (t, p, o) => {
  const lp = filt(o, 'lowpass', 1100);
  noise(lp, t, 0.16, 'bandpass', 300 * p, 800 * p, 3.5, 0.24, 0.02);
  tone(lp, t + 0.03, 'sine', 160 * p, 70 * p, 0.18, 0.24, 0.006);
  tone(o, t + 0.12, 'sine', 600 * p, 300 * p, 0.05, 0.05, 0.002);
  return 0.24;
}, 0.1, 2);

/** The hull clear when the clock runs out: a bright, open chord. */
defineSfx('mini_shake_clear', (t, p, o) => {
  for (const [n, d] of [[0, 0], [4, 0.07], [7, 0.14], [12, 0.21], [16, 0.28]] as const) {
    const f = mtof(72 + n) * p;
    tone(o, t + d, 'triangle', f, f, 0.7, 0.07, 0.003);
    tone(o, t + d, 'sine', f * 2, f * 2, 0.4, 0.025, 0.003);
  }
  noise(o, t, 0.4, 'bandpass', 1500, 7000, 2, 0.06, 0.2);
  return 1;
}, 0.5, 1, { tuned: true, rev: 0.45, duck: [0.8, 0.7] });

/** The dynamo filling a cell: a rising electric whir that clicks home (pitch: which cell). */
defineSfx('mini_shake_charge', (t, p, o) => {
  tone(o, t, 'sawtooth', 300 * p, 900 * p, 0.12, 0.04, 0.01);
  tone(o, t, 'sine', 600 * p, 1800 * p, 0.12, 0.06, 0.01);
  const f = mtof(76) * p;
  tone(o, t + 0.1, 'triangle', f, f, 0.12, 0.1, 0.002);
  noise(o, t + 0.1, 0.02, 'highpass', 5000, 5000, 0.7, 0.08);
  return 0.24;
}, 0.05, 2, { tuned: true });

/** A brood's egg: laid, a soft wet plop (pitch low); smashed, a crisp shell crack and a splat. */
defineSfx('mini_shake_egg', (t, p, o) => {
  noise(o, t, 0.03, 'highpass', 3000 * p, 2000 * p, 1, 0.1, 0.001);
  noise(o, t + 0.01, 0.09, 'bandpass', 900 * p, 300 * p, 3, 0.14, 0.003);
  tone(o, t, 'sine', 500 * p, 160 * p, 0.08, 0.12, 0.001);
  return 0.14;
}, 0.03, 4);

/** A bloater bursting: a fat wet boom, and goo raining off the plating. */
defineSfx('mini_shake_burst', (t, p, o) => {
  const lp = filt(o, 'lowpass', 900);
  tone(lp, t, 'sine', 140 * p, 40 * p, 0.35, 0.32, 0.002);
  noise(lp, t, 0.3, 'bandpass', 500 * p, 150 * p, 1.2, 0.28, 0.002);
  for (let k = 0; k < 7; k++) noise(o, t + 0.08 + Math.random() * 0.3, 0.04, 'bandpass', 1200 + Math.random() * 1500, 600, 3, 0.07, 0.002);
  return 0.5;
}, 0.1, 2, { rev: 0.2 });
