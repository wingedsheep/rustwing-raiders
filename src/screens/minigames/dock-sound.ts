/**
 * MATCH AND DOCK's own sounds: hissing roll jets, approach gates that whoosh past with a chime
 * (or buzz you off), a station klaxon that whoops before the spin changes and machinery that
 * grinds when it does, proximity blips on the final approach, and clamps that slam home one by
 * one before the seal sighs shut. Imported by dock.ts for its side effect.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, crackle, boom, held, metal, drive, mtof } = synth;

/** A pitch multiplier for the k-th pentatonic step (the gate streak, the clamps). */
export const dockStep = (k: number) => Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16][Math.max(0, Math.min(7, k))] / 12);

// the core loop: a roll jet's puff of cold gas, re-fired while the stick is held
defineSfx(
  'mini_dock_jet',
  (t, p, o) => {
    noise(o, t, 0.08, 'bandpass', 3800 * p, 2600 * p, 1.4, 0.1, 0.004);
    noise(o, t, 0.05, 'lowpass', 900 * p, 500 * p, 0.8, 0.06, 0.002);
    return 0.09;
  },
  0.07,
  2,
  { low: true },
);

// the brake: retro jets firing forward, a broader, lower hiss
defineSfx(
  'mini_dock_brake',
  (t, p, o) => {
    noise(o, t, 0.14, 'bandpass', 1400 * p, 1000 * p, 1, 0.07, 0.01);
    tone(filt(o, 'lowpass', 300), t, 'sawtooth', 80 * p, 70 * p, 0.14, 0.03, 0.01);
    return 0.15;
  },
  0.11,
  1,
  { low: true },
);

// locked on: the collar computer agrees, a rising two-note chirp
defineSfx(
  'mini_dock_lock',
  (t, p, o) => {
    const f = mtof(79) * p;
    tone(o, t, 'square', f, f, 0.05, 0.03, 0.002);
    tone(o, t + 0.07, 'square', f * 1.5, f * 1.5, 0.09, 0.03, 0.002);
    tone(o, t + 0.07, 'sine', f * 3, f * 3, 0.12, 0.02, 0.002);
    return 0.2;
  },
  0.25,
  1,
  { tuned: true },
);

// a gate ahead: a proximity blip, the game fires three as it closes in
defineSfx(
  'mini_dock_blip',
  (t, p, o) => {
    const f = 1320 * p;
    tone(o, t, 'sine', f, f, 0.07, 0.05, 0.002);
    tone(o, t, 'triangle', f / 2, f / 2, 0.05, 0.02, 0.002);
    return 0.08;
  },
  0.06,
  2,
  { tuned: true, low: true },
);

// through a gate clean: the ring rushes past and a chime rings out, higher with the streak
defineSfx(
  'mini_dock_gate',
  (t, p, o) => {
    noise(o, t, 0.3, 'bandpass', 500, 3200, 2, 0.1, 0.12);
    const f = mtof(76) * p;
    tone(o, t + 0.1, 'triangle', f, f, 0.3, 0.08, 0.002);
    tone(o, t + 0.16, 'sine', f * 1.5, f * 1.5, 0.45, 0.06, 0.002);
    tone(o, t + 0.16, 'sine', f * 3, f * 3, 0.2, 0.015, 0.002);
    return 0.62;
  },
  0.2,
  1,
  { tuned: true, rev: 0.35 },
);

// a gate missed: the ring rushes past and a flat buzzer calls it
defineSfx(
  'mini_dock_gate_miss',
  (t, p, o) => {
    noise(o, t, 0.25, 'bandpass', 500, 2400, 2, 0.08, 0.1);
    const lp = filt(o, 'lowpass', 1400);
    for (let k = 0; k < 2; k++) {
      tone(lp, t + 0.08 + k * 0.12, 'square', 150 * p, 146 * p, 0.09, 0.06, 0.002);
      tone(lp, t + 0.08 + k * 0.12, 'square', 159 * p, 155 * p, 0.09, 0.05, 0.002);
    }
    return 0.35;
  },
  0.2,
  1,
);

// the spin is about to change: the station's klaxon whoops, rising and rising
defineSfx(
  'mini_dock_klaxon',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 900, 1.5);
    for (let k = 0; k < 2; k++) {
      const at = t + k * 0.36;
      held(bp, at, 'sawtooth', 420 * p, 820 * p, 0.28, 0.12, 0.01, 0.05);
      held(bp, at, 'square', 210 * p, 410 * p, 0.28, 0.045, 0.01, 0.05);
    }
    return 0.8;
  },
  0.5,
  1,
  { rev: 0.35 },
);

// the spin changes: the station's drive clunks over and its gears grind up (or down) to speed
defineSfx(
  'mini_dock_shift',
  (t, p, o) => {
    boom(o, t, 0.7, 0.4, 0.26);
    metal(o, t, 240, 0.06, 0.6);
    const d = drive(filt(o, 'lowpass', 1800), 0.5);
    held(d, t + 0.04, 'sawtooth', 90 * p, 90 * p * p * p, 0.45, 0.07, 0.02, 0.15);
    noise(o, t + 0.04, 0.45, 'bandpass', 700 * p, 1400 * p * p, 3, 0.05, 0.05);
    return 0.7;
  },
  0.3,
  1,
  { rev: 0.25, duck: [0.4, 0.7] },
);

// through the last gate: the final approach, a low swell under a rising fifth
defineSfx(
  'mini_dock_final',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 1600);
    held(lp, t, 'sawtooth', mtof(45) * p, mtof(45) * p, 0.8, 0.045, 0.3, 0.3);
    held(lp, t, 'sawtooth', mtof(52) * p, mtof(52) * p, 0.8, 0.035, 0.3, 0.3);
    tone(o, t + 0.2, 'triangle', mtof(76) * p, mtof(76) * p, 0.5, 0.05, 0.004);
    tone(o, t + 0.32, 'triangle', mtof(83) * p, mtof(83) * p, 0.6, 0.05, 0.004);
    return 1.1;
  },
  1,
  1,
  { tuned: true, rev: 0.4, duck: [1, 0.65] },
);

// the range ticking down on the final approach: a sonar blip, climbing as you close
defineSfx(
  'mini_dock_range',
  (t, p, o) => {
    const f = 880 * p;
    tone(o, t, 'sine', f, f, 0.12, 0.05, 0.002);
    tone(o, t + 0.005, 'sine', f * 2.01, f * 2, 0.06, 0.012, 0.002);
    return 0.13;
  },
  0.08,
  1,
  { tuned: true, rev: 0.3 },
);

// coming in too fast on the final approach: a terse two-beep warning, repeated
defineSfx(
  'mini_dock_warn',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 2600);
    tone(lp, t, 'square', 990 * p, 990 * p, 0.06, 0.035, 0.002);
    tone(lp, t + 0.09, 'square', 990 * p, 990 * p, 0.06, 0.035, 0.002);
    return 0.16;
  },
  0.5,
  1,
);

// contact: the collars kiss, a magnetic thunk and a breath of gas
defineSfx(
  'mini_dock_contact',
  (t, p, o) => {
    tone(o, t, 'sine', 130 * p, 55 * p, 0.25, 0.32, 0.002, 0.12);
    metal(o, t, 410 * p, 0.05, 0.4);
    noise(o, t + 0.02, 0.25, 'bandpass', 2400, 1200, 1, 0.06, 0.02);
    return 0.45;
  },
  0.3,
  1,
  { rev: 0.25 },
);

// a clamp slams home: a hydraulic hiss, then a heavy latch; the game steps them up
defineSfx(
  'mini_dock_clamp',
  (t, p, o) => {
    noise(o, t, 0.06, 'highpass', 3000, 5000, 0.7, 0.06, 0.004);
    tone(o, t + 0.05, 'sine', 120 * p, 42 * p, 0.25, 0.36, 0.002, 0.12);
    noise(o, t + 0.05, 0.08, 'lowpass', 1200 * p, 260 * p, 0.9, 0.22, 0.002);
    metal(o, t + 0.05, 520 * p, 0.05, 0.35);
    return 0.4;
  },
  0.05,
  2,
  { tuned: true, rev: 0.15 },
);

// a clamp misses: a dry clack and a spring that rattles loose
defineSfx(
  'mini_dock_clamp_miss',
  (t, p, o) => {
    noise(o, t, 0.02, 'highpass', 2500, 2500, 0.7, 0.12);
    tone(o, t, 'square', 600 * p, 420 * p, 0.04, 0.05, 0.001);
    tone(filt(o, 'bandpass', 700, 6), t + 0.03, 'sawtooth', 340 * p, 290 * p, 0.3, 0.05, 0.002);
    return 0.35;
  },
  0.05,
  2,
);

// sealed: the pressure equalises with a long sigh and a warm chord settles
defineSfx(
  'mini_dock_seal',
  (t, p, o) => {
    noise(o, t, 0.6, 'bandpass', 3200, 900, 1, 0.08, 0.05);
    [0, 7, 12, 16].forEach((n, i) => {
      const f = mtof(62 + n) * p;
      tone(o, t + 0.1 + i * 0.06, 'triangle', f, f, 1, 0.05, 0.01);
      tone(o, t + 0.1 + i * 0.06, 'sine', f * 2, f * 2, 0.6, 0.02, 0.01);
    });
    tone(o, t, 'sine', 80, 50, 0.4, 0.2, 0.01);
    return 1.2;
  },
  0.5,
  1,
  { tuned: true, rev: 0.45, duck: [1, 0.6] },
);

// on top for a perfect seal: station lights chime all the way round
defineSfx(
  'mini_dock_perfect',
  (t, p, o) => {
    [14, 19, 21, 26, 31].forEach((n, i) => {
      const f = mtof(74 + n) * p;
      tone(o, t + 0.35 + i * 0.07, 'sine', f, f, 0.5, 0.045, 0.002);
    });
    noise(o, t + 0.35, 0.8, 'highpass', 7000, 11000, 0.6, 0.03, 0.2);
    return 1.3;
  },
  0.5,
  1,
  { tuned: true, rev: 0.5 },
);

// a rough or failed seal: the clamps hold loose, a sour falling pair
defineSfx(
  'mini_dock_rough',
  (t, p, o) => {
    tone(o, t, 'triangle', mtof(62) * p, mtof(61) * p, 0.25, 0.07, 0.004);
    tone(o, t + 0.16, 'triangle', mtof(56) * p, mtof(55) * p, 0.4, 0.07, 0.004);
    noise(o, t, 0.3, 'bandpass', 1500, 700, 1, 0.04, 0.03);
    return 0.6;
  },
  0.5,
  1,
  { rev: 0.3 },
);

// too fast: you ram the port, a crunch of hull with metal scraping and debris
defineSfx(
  'mini_dock_crash',
  (t, p, o) => {
    boom(o, t, 0.8 * p, 0.9, 0.32);
    const d = drive(filt(o, 'bandpass', 1100, 1.5), 0.8);
    noise(d, t + 0.02, 0.5, 'bandpass', 1800, 600, 2, 0.3, 0.005);
    metal(o, t, 290 * p, 0.07, 0.8);
    metal(o, t + 0.06, 410 * p, 0.05, 0.6);
    crackle(o, t + 0.04, 0.5, 16, 0.14);
    return 1.0;
  },
  0.5,
  1,
  { rev: 0.3, duck: [0.9, 0.4], shock: 0.4 },
);

// out of time: the station waves you off, a slow falling two-tone
defineSfx(
  'mini_dock_fail',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 1200);
    held(lp, t, 'square', 330 * p, 330 * p, 0.25, 0.04, 0.01, 0.06);
    held(lp, t + 0.32, 'square', 247 * p, 220 * p, 0.45, 0.04, 0.01, 0.12);
    return 0.95;
  },
  0.5,
  1,
  { rev: 0.3 },
);
