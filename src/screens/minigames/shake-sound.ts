/**
 * The sounds of SHOOT THEM OFF (the shake game), made for it: the twin guns' crack, the crunch of a
 * louse burst in the dark (a bright note on top, climbing with the streak), the clang off a shut
 * shell and the whine of a bolt off a rock, the thump of one landing on the glass, the slurp of them
 * drinking, the shatter of a lantern shot out, the guns venting, your fuel won back, the chitter in
 * the dark that says a wave is coming.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, held, metal, crackle, mtof } = synth;

/** A shot from one of the twin guns: a sharp crack, a blast of air, a thump, the breech clacking. */
defineSfx('mini_shake_shot', (t, p, o) => {
  noise(o, t, 0.045, 'highpass', 3200 * p, 1800 * p, 0.8, 0.2, 0.001);
  noise(o, t, 0.12, 'bandpass', 1100 * p, 260 * p, 1.1, 0.16, 0.002);
  tone(o, t, 'sine', 150 * p, 48 * p, 0.11, 0.22, 0.001);
  metal(o, t + 0.04, 1700 * p, 0.025, 0.05);
  return 0.14;
}, 0.03, 4, { rev: 0.08 });

/** One burst in the dark: a wet crunch of shell, and a bright sine note that climbs with the streak (pitch). */
defineSfx('mini_shake_kill', (t, p, o) => {
  noise(o, t, 0.05, 'bandpass', 2200, 700, 1.6, 0.2, 0.001);
  noise(o, t + 0.01, 0.16, 'lowpass', 1400, 180, 1.2, 0.18, 0.004);
  tone(o, t, 'sine', 240, 70, 0.11, 0.2, 0.001);
  crackle(o, t, 0.06, 4, 0.06);
  const f = mtof(76) * p;
  tone(o, t + 0.015, 'sine', f, f, 0.28, 0.07, 0.002);
  tone(o, t + 0.015, 'sine', f * 2, f * 2, 0.12, 0.025, 0.002);
  return 0.3;
}, 0.02, 5, { tuned: true, rev: 0.15 });

/** A bolt off a shut shell: struck iron, a ring, a dull knock. */
defineSfx('mini_shake_clang', (t, p, o) => {
  metal(o, t, 380 * p, 0.14, 0.45);
  noise(o, t, 0.03, 'highpass', 3500, 3000, 0.8, 0.14, 0.001);
  tone(o, t, 'sine', 170 * p, 120 * p, 0.09, 0.12, 0.001);
  return 0.45;
}, 0.04, 3, { rev: 0.2 });

/** A bolt off a rock: a chip of stone and a ricochet whining off. */
defineSfx('mini_shake_tink', (t, p, o) => {
  noise(o, t, 0.04, 'bandpass', 3000 * p, 1800 * p, 3, 0.12, 0.001);
  tone(o, t + 0.01, 'sine', 2600 * p, 1300 * p, 0.16, 0.035, 0.004);
  crackle(o, t, 0.05, 3, 0.05);
  return 0.18;
}, 0.04, 3, { low: true, rev: 0.2 });

/** One lands on the glass: a heavy thump through the canopy, a tick of the glass, legs scrabbling. */
defineSfx('mini_shake_land', (t, p, o) => {
  tone(o, t, 'sine', 95 * p, 42 * p, 0.24, 0.34, 0.002);
  noise(o, t, 0.14, 'lowpass', 700 * p, 140, 1, 0.24, 0.002);
  metal(o, t + 0.008, 2400 * p, 0.045, 0.16);
  const bp = filt(o, 'bandpass', 3000 * p, 4);
  for (let k = 0; k < 6; k++) noise(bp, t + 0.06 + k * 0.035 + Math.random() * 0.015, 0.015, 'bandpass', 2600 + Math.random() * 1200, 2400, 5, 0.2, 0.001);
  return 0.32;
}, 0.05, 3, { rev: 0.1 });

/** A lantern shot out: glass bursting, a white whoosh of light going, the cage ringing. */
defineSfx('mini_shake_lantern', (t, p, o) => {
  for (let k = 0; k < 14; k++) noise(o, t + Math.pow(Math.random(), 1.6) * 0.3, 0.025 + Math.random() * 0.03, 'highpass', 3500 + Math.random() * 5000, 4000, 1, 0.12 * (0.5 + Math.random() * 0.5), 0.001);
  metal(o, t, 1900 * p, 0.07, 0.6);
  noise(o, t, 0.5, 'bandpass', 500, 5000, 1.4, 0.12, 0.04);
  tone(o, t, 'sine', 70 * p, 30 * p, 0.3, 0.22, 0.002);
  return 0.7;
}, 0.2, 1, { rev: 0.45, duck: [0.5, 0.7] });

/** The guns too hot: a long hiss of venting, and a clank as the breeches lock. */
defineSfx('mini_shake_vent', (t, p, o) => {
  metal(o, t, 820 * p, 0.06, 0.25);
  tone(o, t, 'sine', 80 * p, 42 * p, 0.2, 0.18, 0.002);
  noise(o, t + 0.04, 1.1, 'highpass', 3600, 1400, 0.7, 0.13, 0.05);
  noise(o, t + 0.04, 0.9, 'bandpass', 1600, 700, 1.2, 0.06, 0.08);
  return 1.2;
}, 0.5, 1);

/** Your fuel won back out of a full one: a wet glug, and two bright sine notes up. */
defineSfx('mini_shake_refund', (t, p, o) => {
  for (const d of [0, 0.09]) noise(o, t + d, 0.09, 'bandpass', 380 * p, 900 * p, 4, 0.16, 0.01);
  for (const [n, d] of [[79, 0.05], [86, 0.13]] as const) {
    const f = mtof(n) * p;
    tone(o, t + d, 'sine', f, f, 0.3, 0.07, 0.003);
  }
  return 0.45;
}, 0.1, 2, { tuned: true, rev: 0.25 });

/** A hot streak: the guns catching light, a rising roar of air and a bright ring. */
defineSfx('mini_shake_hot', (t, p, o) => {
  noise(o, t, 0.4, 'bandpass', 260 * p, 3200 * p, 1.2, 0.2, 0.06);
  tone(o, t, 'sine', 110 * p, 220 * p, 0.35, 0.14, 0.03);
  metal(o, t + 0.12, 1250 * p, 0.05, 0.5);
  return 0.6;
}, 0.5, 1, { rev: 0.35 });

/** A shellback's shell coming open: a dry creak of plates (narrow noise sweeping), a soft wet pop. */
defineSfx('mini_shake_open', (t, p, o) => {
  noise(o, t, 0.24, 'bandpass', 500 * p, 1500 * p, 9, 0.16, 0.03);
  noise(o, t + 0.2, 0.06, 'bandpass', 700 * p, 300 * p, 3, 0.1, 0.004);
  tone(o, t + 0.2, 'sine', 300 * p, 140 * p, 0.07, 0.06, 0.002);
  return 0.3;
}, 0.15, 2, { low: true });

/** A skipper hopping (or one leaping off a rock): a flick of legs, a dry chirp. */
defineSfx('mini_shake_hop', (t, p, o) => {
  noise(o, t, 0.06, 'bandpass', 2000 * p, 4200 * p, 2, 0.1, 0.003);
  tone(o, t, 'sine', 1300 * p, 2300 * p, 0.05, 0.035, 0.002);
  return 0.08;
}, 0.05, 3, { low: true });

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
