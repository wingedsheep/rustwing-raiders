/**
 * The sounds of the TUNE IN scope: an old valve set with a notched knob, a hiss under
 * everything, and voices that murmur up through it as you get close. The static thins as the
 * waves match, the knob clicks through its detents, and each voice locked rings a little bell.
 * Imported by tune.ts for its side effect.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, crackle, held, metal, mtof } = synth;

/** The set's hiss, one grain at a time: played back to back, louder the further off you are. */
defineSfx(
  'mini_tune_static',
  (t, p, o) => {
    noise(o, t, 0.3, 'bandpass', 2400 * p, 2000 * p, 0.8, 0.05, 0.03);
    noise(o, t, 0.3, 'highpass', 5000, 6000, 0.7, 0.025, 0.03);
    crackle(o, t, 0.28, 5, 0.06);
    return 0.34;
  },
  0.2,
  2,
  { low: true },
);

/** The knob clicking through one detent: a small dry notch, pitched by where on the dial you are. */
defineSfx(
  'mini_tune_detent',
  (t, p, o) => {
    noise(o, t, 0.008, 'bandpass', 3200 * p, 2600 * p, 4, 0.14, 0.0005);
    tone(filt(o, 'bandpass', 1400 * p, 5), t, 'triangle', 1400 * p, 1100 * p, 0.02, 0.045, 0.0005);
    return 0.03;
  },
  0.03,
  3,
  { low: true },
);

/** The phase slider moving one notch: softer and lower than the knob, a felt-lined slide. */
defineSfx(
  'mini_tune_slide',
  (t, p, o) => {
    noise(o, t, 0.02, 'bandpass', 1300 * p, 900 * p, 3, 0.07, 0.002);
    tone(o, t, 'sine', 420 * p, 360 * p, 0.03, 0.03, 0.002);
    return 0.04;
  },
  0.04,
  3,
  { low: true },
);

/** The formant pairs the murmuring voice moves between (a, e, i, o, u). */
const VOWELS = [
  [730, 1090],
  [530, 1840],
  [300, 2200],
  [570, 840],
  [330, 1000],
];

/** One syllable of the voice coming through: a buzzing throat through two vowel formants. */
defineSfx(
  'mini_tune_voice',
  (t, p, o) => {
    const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const f0 = (120 + Math.random() * 40) * p;
    const dur = 0.12 + Math.random() * 0.08;
    for (const [f, g] of [
      [v[0], 0.05],
      [v[1], 0.03],
    ]) {
      const bp = filt(o, 'bandpass', f, 6);
      held(bp, t, 'sawtooth', f0, f0 * (0.9 + Math.random() * 0.2), dur, g * 4, 0.02, 0.05);
    }
    return dur + 0.08;
  },
  0.12,
  2,
  { low: true, rev: 0.2 },
);

/** Squelch opening: the hiss cuts out and a clean carrier rises in. */
defineSfx(
  'mini_tune_in',
  (t, p, o) => {
    noise(o, t, 0.05, 'highpass', 3000, 6000, 0.7, 0.06, 0.001);
    tone(o, t + 0.03, 'sine', 660 * p, 990 * p, 0.12, 0.06, 0.005);
    tone(o, t + 0.03, 'triangle', 1320 * p, 1980 * p, 0.08, 0.02, 0.005);
    return 0.18;
  },
  0.15,
  1,
);

/** Squelch closing: the carrier sags and the hiss crashes back over it. */
defineSfx(
  'mini_tune_slip',
  (t, p, o) => {
    tone(o, t, 'sine', 900 * p, 380 * p, 0.2, 0.06, 0.003);
    noise(o, t + 0.05, 0.22, 'bandpass', 3000, 1500, 0.8, 0.06, 0.02);
    crackle(o, t + 0.04, 0.2, 4, 0.06);
    return 0.28;
  },
  0.2,
  1,
);

/** One beat held dead on: a small bell, climbing the pentatonic with the streak (pitch). */
defineSfx(
  'mini_tune_perfect',
  (t, p, o) => {
    metal(o, t, mtof(79) * p, 0.04, 0.35);
    tone(o, t, 'triangle', mtof(79) * p, mtof(79) * p, 0.2, 0.03, 0.002);
    return 0.4;
  },
  0.1,
  2,
  { tuned: true, rev: 0.3 },
);

/** The jammer winding up: a sour two-tone siren swelling through the hiss. */
defineSfx(
  'mini_tune_jam',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 2400, 1);
    held(lp, t, 'square', 300 * p, 620 * p, 0.55, 0.03, 0.25, 0.06);
    held(lp, t, 'square', 317 * p, 655 * p, 0.55, 0.025, 0.25, 0.06);
    noise(o, t, 0.6, 'bandpass', 1200, 3500, 1.5, 0.03, 0.4);
    return 0.65;
  },
  0.4,
  1,
);

/** The jammer's countdown pip. */
defineSfx(
  'mini_tune_jam_tick',
  (t, p, o) => {
    tone(filt(o, 'bandpass', 900, 3), t, 'square', 880 * p, 870 * p, 0.04, 0.035, 0.001);
    return 0.06;
  },
  0.06,
  2,
);

/** The burst hits and knocks you off: a crackling wall of static with a thump under it. */
defineSfx(
  'mini_tune_burst',
  (t, p, o) => {
    tone(o, t, 'sine', 110 * p, 45 * p, 0.2, 0.2, 0.002);
    noise(o, t, 0.5, 'bandpass', 4000, 1200, 0.6, 0.12, 0.003);
    crackle(o, t, 0.45, 14, 0.1);
    return 0.55;
  },
  0.3,
  1,
  { shock: 0.25 },
);

/** Riding the burst out: the static glances off and the carrier rings clean. */
defineSfx(
  'mini_tune_ride',
  (t, p, o) => {
    noise(o, t, 0.12, 'highpass', 6000, 3000, 0.7, 0.05, 0.001);
    for (const n of [0, 7, 12]) tone(o, t + 0.02, 'triangle', mtof(74 + n) * p, mtof(74 + n) * p, 0.3, 0.035, 0.003);
    tone(o, t, 'sine', 160 * p, 120 * p, 0.12, 0.1, 0.002);
    return 0.4;
  },
  0.3,
  1,
  { rev: 0.25 },
);

/** A voice locked: the carrier settles into a chord; brighter the clearer it came through (pitch). */
defineSfx(
  'mini_tune_lock',
  (t, p, o) => {
    noise(o, t, 0.08, 'highpass', 3000, 6000, 0.7, 0.04, 0.001);
    [0, 4, 7, 12].forEach((n, i) => tone(o, t + i * 0.05, 'triangle', mtof(72 + n) * p, mtof(72 + n) * p, 0.45 - i * 0.05, 0.045, 0.003));
    metal(o, t + 0.15, mtof(84) * p, 0.035, 0.5);
    tone(o, t, 'sine', 130 * p, 130 * p, 0.3, 0.08, 0.01);
    return 0.7;
  },
  0.3,
  1,
  { tuned: true, rev: 0.35 },
);

/** The last voice up next: two low alert pips with a rising tail. */
defineSfx(
  'mini_tune_last',
  (t, p, o) => {
    tone(o, t, 'triangle', mtof(62) * p, mtof(62) * p, 0.12, 0.09, 0.003);
    tone(o, t + 0.16, 'triangle', mtof(67) * p, mtof(69) * p, 0.25, 0.09, 0.003);
    return 0.45;
  },
  0.5,
  1,
  { tuned: true, rev: 0.2 },
);

/** Every voice in: the hiss lifts away and the set rings a full pentatonic run with a warm root. */
defineSfx(
  'mini_tune_decoded',
  (t, p, o) => {
    noise(o, t, 0.4, 'highpass', 2000, 9000, 0.7, 0.04, 0.01);
    [0, 2, 4, 7, 9, 12, 16, 19].forEach((n, i) => metal(o, t + 0.05 + i * 0.06, mtof(76 + n) * p, 0.035, 0.45));
    for (const n of [0, 4, 7, 12]) held(o, t + 0.5, 'triangle', mtof(64 + n) * p, mtof(64 + n) * p, 0.5, 0.03, 0.02, 0.5);
    tone(o, t + 0.5, 'sine', mtof(40) * p, mtof(40) * p, 0.9, 0.12, 0.02);
    return 1.5;
  },
  1,
  1,
  { tuned: true, rev: 0.4, duck: [0.8, 0.5] },
);

/** Time's up: the carrier sinks and the set fizzles out. */
defineSfx(
  'mini_tune_lost',
  (t, p, o) => {
    tone(o, t, 'triangle', mtof(64) * p, mtof(52) * p, 0.5, 0.06, 0.005);
    tone(o, t, 'sine', 140 * p, 60 * p, 0.5, 0.1, 0.005);
    noise(o, t + 0.2, 0.5, 'bandpass', 2500, 800, 0.8, 0.05, 0.05);
    crackle(o, t + 0.2, 0.5, 6, 0.06);
    return 0.75;
  },
  1,
  1,
  { rev: 0.2 },
);

/** The clock's last seconds: a dry valve-set pip. */
defineSfx(
  'mini_tune_tick',
  (t, p, o) => {
    tone(filt(o, 'bandpass', 1200, 3), t, 'sine', 1200 * p, 1180 * p, 0.05, 0.04, 0.002);
    return 0.06;
  },
  0.3,
  1,
);

export {};
