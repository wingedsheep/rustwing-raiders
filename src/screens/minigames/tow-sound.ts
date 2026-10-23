/**
 * KEEP IT TAUT's own sounds: a steel cable that creaks and sings as it tightens, a freighter that
 * groans before it bucks, rocks that thud into a taut line, and a ratchet that locks each quarter
 * of the tow in. Imported by tow.ts for its side effect.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, crackle, boom, held, metal, drive, mtof } = synth;

/** Pentatonic steps, for anything that climbs (the combo, the last haul's ticks). */
export const TOW_PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
/** A pitch multiplier for the k-th pentatonic step. */
export const towStep = (k: number) => Math.pow(2, TOW_PENTA[Math.max(0, Math.min(TOW_PENTA.length - 1, k))] / 12);

// the core loop: rope fibres rubbing under load, a run of tiny clicks through a woody resonance,
// with a low groan under it. Pitch rises with the tension.
defineSfx(
  'mini_tow_creak',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 520 * p, 6);
    let at = 0;
    const n = 7 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) {
      noise(bp, t + at, 0.006, 'bandpass', 900 * p, 900 * p, 2, 0.32 * (1 - k / (n + 2)), 0.001);
      at += 0.012 + k * 0.004 + Math.random() * 0.006;
    }
    tone(filt(o, 'lowpass', 400), t, 'sawtooth', 70 * p, 62 * p, at + 0.06, 0.07, 0.02);
    return at + 0.08;
  },
  0.16,
  2,
  { low: true },
);

// in the red: the fibres start to go, a sharp fraying crackle over a strained whine
defineSfx(
  'mini_tow_fray',
  (t, p, o) => {
    crackle(o, t, 0.16, 9, 0.1);
    noise(o, t, 0.12, 'bandpass', 2600 * p, 3400 * p, 5, 0.05, 0.01);
    tone(filt(o, 'bandpass', 1500, 3), t, 'sawtooth', 1150 * p, 1250 * p, 0.16, 0.025, 0.02);
    return 0.2;
  },
  0.22,
  1,
  { low: true },
);

// the needle comes into the green: a soft wooden knock
defineSfx(
  'mini_tow_band',
  (t, p, o) => {
    tone(o, t, 'triangle', 330 * p, 300 * p, 0.09, 0.08, 0.002);
    noise(o, t, 0.02, 'bandpass', 1200 * p, 900 * p, 3, 0.05);
    return 0.1;
  },
  0.12,
  1,
  { low: true, tuned: true },
);

// into the core: the cable sings, a plucked steel string ringing at its fifth
defineSfx(
  'mini_tow_sing',
  (t, p, o) => {
    const f = mtof(64) * p;
    tone(o, t, 'triangle', f * 1.01, f, 0.45, 0.06, 0.002, 0.05);
    tone(o, t, 'sine', f * 1.5, f * 1.5, 0.35, 0.03, 0.004);
    tone(o, t, 'sine', f * 2, f * 2, 0.2, 0.02, 0.002);
    noise(o, t, 0.015, 'highpass', 4000, 4000, 0.7, 0.03);
    return 0.45;
  },
  0.15,
  1,
  { tuned: true, rev: 0.25 },
);

// a combo step: a bright two-note chime over the string; the game climbs the pentatonic with it
defineSfx(
  'mini_tow_combo',
  (t, p, o) => {
    const f = mtof(76) * p;
    tone(o, t, 'triangle', f, f, 0.22, 0.09, 0.002);
    tone(o, t + 0.06, 'sine', f * 1.5, f * 1.5, 0.35, 0.07, 0.002);
    tone(o, t + 0.06, 'triangle', f * 3, f * 3, 0.12, 0.015, 0.002);
    tone(o, t, 'sine', f / 4, f / 4, 0.18, 0.06, 0.004);
    return 0.42;
  },
  0.1,
  1,
  { tuned: true, rev: 0.3 },
);

// out of the core too long: the combo goes, a sagging two-note fall
defineSfx(
  'mini_tow_combo_lost',
  (t, p, o) => {
    const f = mtof(67) * p;
    tone(o, t, 'triangle', f, f * 0.94, 0.12, 0.06, 0.003);
    tone(o, t + 0.09, 'triangle', f * 0.75, f * 0.68, 0.22, 0.06, 0.003);
    return 0.32;
  },
  0.3,
  1,
  { tuned: true },
);

// a quarter of the tow locks in: a ratchet's pawl clacking over three teeth, then a seated clunk
defineSfx(
  'mini_tow_lock',
  (t, p, o) => {
    for (let k = 0; k < 3; k++) {
      metal(o, t + k * 0.045, 1900 * p, 0.035, 0.05);
      noise(o, t + k * 0.045, 0.012, 'highpass', 3000, 3000, 0.7, 0.07);
    }
    tone(o, t + 0.14, 'sine', 140 * p, 60 * p, 0.16, 0.22, 0.002);
    metal(o, t + 0.14, 620 * p, 0.05, 0.35);
    const f = mtof(72) * p;
    tone(o, t + 0.16, 'triangle', f, f, 0.3, 0.06, 0.004);
    tone(o, t + 0.22, 'triangle', f * 1.5, f * 1.5, 0.4, 0.05, 0.004);
    return 0.62;
  },
  0.3,
  1,
  { tuned: true, rev: 0.25 },
);

// the load's lamp: the freighter groans and its hull alarm moans twice, low and slow
defineSfx(
  'mini_tow_lamp',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 700);
    for (let k = 0; k < 2; k++) {
      const at = t + k * 0.28;
      held(lp, at, 'square', 196 * p, 174 * p, 0.16, 0.05, 0.01, 0.06);
      held(lp, at, 'square', 98 * p, 87 * p, 0.16, 0.04, 0.01, 0.06);
    }
    tone(filt(o, 'bandpass', 300, 4), t, 'sawtooth', 60 * p, 90 * p, 0.55, 0.05, 0.1);
    return 0.65;
  },
  0.4,
  1,
  { rev: 0.25 },
);

// the lurch: the load bucks, a hull boom with the cable whipping up through it
defineSfx(
  'mini_tow_lurch',
  (t, p, o) => {
    boom(o, t, 0.8 * p, 0.45, 0.22);
    metal(o, t + 0.02, 180 * p, 0.06, 0.5);
    tone(filt(o, 'bandpass', 900, 2), t, 'sawtooth', 300 * p, 140 * p, 0.3, 0.05, 0.005);
    noise(o, t, 0.25, 'bandpass', 600 * p, 2200 * p, 2, 0.08, 0.02);
    return 0.6;
  },
  0.3,
  1,
  { rev: 0.2, duck: [0.3, 0.7] },
);

// a rock coming: a low tumbling rumble that swells, with a sonar ping marking it
defineSfx(
  'mini_tow_rock',
  (t, p, o) => {
    for (const [d, f] of [[0, 1], [0.32, 0.94]] as const) {
      tone(o, t + d, 'sine', 1180 * p * f, 1150 * p * f, 0.35, 0.06, 0.002);
      tone(o, t + d, 'sine', 2360 * p * f, 2300 * p * f, 0.12, 0.015, 0.002);
    }
    noise(o, t, 0.9, 'lowpass', 180 * p, 420 * p, 1.5, 0.12, 0.6);
    tone(o, t, 'triangle', 48 * p, 52 * p, 0.9, 0.08, 0.6);
    return 0.95;
  },
  0.5,
  1,
  { rev: 0.45 },
);

// the rock is almost on the line: it rushes in, a rising whoosh
defineSfx(
  'mini_tow_rock_near',
  (t, p, o) => {
    noise(o, t, 0.5, 'bandpass', 300 * p, 2400 * p, 2.5, 0.1, 0.42);
    tone(o, t, 'sine', 90 * p, 140 * p, 0.5, 0.06, 0.4);
    return 0.52;
  },
  0.3,
  1,
);

// it hits the taut cable: a stony thud and the steel ringing out of tune
defineSfx(
  'mini_tow_snag',
  (t, p, o) => {
    boom(o, t, 1.1 * p, 0.35, 0.2);
    const d = drive(o, 0.5);
    tone(d, t, 'sawtooth', 220 * p, 200 * p, 0.4, 0.08, 0.001);
    tone(o, t, 'triangle', 233 * p, 214 * p, 0.6, 0.07, 0.001);
    tone(o, t, 'triangle', 311 * p, 300 * p, 0.45, 0.04, 0.001);
    crackle(o, t, 0.2, 10, 0.12);
    return 0.65;
  },
  0.2,
  1,
  { rev: 0.25, shock: 0.15 },
);

// it passes over the slack cable: a near-miss whoosh and a relieved little pluck
defineSfx(
  'mini_tow_clear',
  (t, p, o) => {
    noise(o, t, 0.35, 'bandpass', 2400 * p, 500 * p, 2, 0.09, 0.03);
    const f = mtof(79) * p;
    tone(o, t + 0.08, 'triangle', f, f, 0.2, 0.06, 0.002);
    tone(o, t + 0.14, 'sine', f * 1.335, f * 1.335, 0.3, 0.05, 0.002);
    return 0.45;
  },
  0.2,
  1,
  { tuned: true, rev: 0.3 },
);

// strain is building: steel wire stretching, a rising groan with fibres popping
defineSfx(
  'mini_tow_strain',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 800, 5);
    tone(bp, t, 'sawtooth', 220 * p, 420 * p, 0.6, 0.07, 0.08);
    tone(o, t, 'sine', 55 * p, 70 * p, 0.6, 0.08, 0.1);
    crackle(o, t + 0.1, 0.5, 8, 0.08);
    return 0.65;
  },
  0.6,
  1,
  { rev: 0.2 },
);

// it snaps: a whip-crack, two cable ends lashing down, and the jolt through the hull
defineSfx(
  'mini_tow_snap',
  (t, p, o) => {
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.4, 0.0005);
    boom(o, t, 0.9 * p, 0.8, 0.32);
    for (const [d, f] of [[0.02, 1], [0.07, 0.8]] as const) {
      tone(filt(o, 'bandpass', 1400, 2), t + d, 'sawtooth', 1600 * p * f, 120 * p * f, 0.5, 0.08, 0.002, 0.4);
    }
    metal(o, t + 0.05, 340 * p, 0.06, 0.9);
    crackle(o, t + 0.05, 0.4, 16, 0.14);
    return 1.0;
  },
  0.5,
  1,
  { rev: 0.35, duck: [0.8, 0.4], shock: 0.35 },
);

// the last haul: the freighter's engines catch and roar up under a rising brass fifth
defineSfx(
  'mini_tow_haul',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 1200);
    held(lp, t, 'sawtooth', mtof(43) * p, mtof(43) * p, 0.7, 0.06, 0.12, 0.3);
    held(lp, t + 0.18, 'sawtooth', mtof(50) * p, mtof(50) * p, 0.6, 0.05, 0.08, 0.3);
    held(lp, t + 0.18, 'sawtooth', mtof(55) * p, mtof(55) * p, 0.6, 0.04, 0.08, 0.3);
    noise(o, t, 0.9, 'lowpass', 200, 1400, 1, 0.1, 0.4);
    tone(o, t, 'sine', 70, 40, 0.35, 0.25, 0.003);
    return 1.2;
  },
  1,
  1,
  { tuned: true, rev: 0.35, duck: [0.9, 0.6] },
);

// the last haul's countdown: a taut-string pluck that climbs with every step
defineSfx(
  'mini_tow_tick',
  (t, p, o) => {
    const f = mtof(69) * p;
    tone(o, t, 'triangle', f, f, 0.15, 0.07, 0.002);
    tone(o, t, 'sine', f * 2, f * 2, 0.08, 0.02, 0.002);
    noise(o, t, 0.01, 'highpass', 3500, 3500, 0.7, 0.04);
    return 0.16;
  },
  0.08,
  2,
  { tuned: true },
);

// towed clear: the cable slackens with a long ringing release and a major chord blooms
defineSfx(
  'mini_tow_done',
  (t, p, o) => {
    tone(o, t, 'sine', 110, 45, 0.4, 0.3, 0.003);
    noise(o, t, 0.3, 'bandpass', 600, 3000, 1.5, 0.08, 0.15);
    [0, 4, 7, 12].forEach((n, i) => {
      const f = mtof(60 + n) * p;
      tone(o, t + 0.05 + i * 0.07, 'triangle', f, f, 0.9, 0.06, 0.004);
      tone(o, t + 0.05 + i * 0.07, 'sine', f * 2, f * 2, 0.5, 0.025, 0.004);
    });
    return 1.1;
  },
  0.5,
  1,
  { tuned: true, rev: 0.45, duck: [0.9, 0.6] },
);

// on top for a perfect tow: a high bell run
defineSfx(
  'mini_tow_perfect',
  (t, p, o) => {
    [12, 16, 19, 24, 28].forEach((n, i) => {
      const f = mtof(72 + n) * p;
      tone(o, t + 0.3 + i * 0.06, 'sine', f, f, 0.5, 0.045, 0.002);
    });
    noise(o, t + 0.3, 0.9, 'highpass', 7000, 11000, 0.6, 0.03, 0.2);
    return 1.3;
  },
  0.5,
  1,
  { tuned: true, rev: 0.5 },
);

// out of time: the engines cough out and the slack line sighs down
defineSfx(
  'mini_tow_fail',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 800);
    held(lp, t, 'sawtooth', 110 * p, 55 * p, 0.6, 0.06, 0.02, 0.2);
    tone(o, t + 0.1, 'triangle', mtof(62) * p, mtof(57) * p, 0.5, 0.05, 0.01);
    return 0.85;
  },
  0.5,
  1,
  { rev: 0.3 },
);
