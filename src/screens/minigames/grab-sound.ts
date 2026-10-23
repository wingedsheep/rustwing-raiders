/**
 * Grab and go's own sounds: the hold's metal, the line's rattle, and the thing in the dark. The
 * beast is mostly breath and clicks, low and close, so you hear where it is before you see it;
 * its crouch is a rising rattle of claws that the ear learns to dread. Imported for its side
 * effect by grab.ts.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, held, metal, crackle, boom, drive, mtof } = synth;

/** A gain stage in front of `o`, to sit a sound at the right level among the others. */
const level = (o: AudioNode, k: number) => {
  const g = synth.ctx.createGain();
  g.gain.value = k;
  g.connect(o);
  return g;
};

/** Pentatonic steps, for things that climb as they repeat (each crate banked in a trip). */
const PENTA = [0, 2, 4, 7, 9];
/** The pitch of step `k` up a pentatonic scale (for passing as `pitch`). */
export const penta = (k: number) => Math.pow(2, (Math.floor(k / 5) * 12 + PENTA[k % 5]) / 12);

// ---- the beast -------------------------------------------------------------------------------

/** Its breath: a slow wet rasp in, a longer rasp out, with a throat under it. Played over and over. */
defineSfx('mini_grab_breath', (t, p, o) => {
  const lp = filt(o, 'lowpass', 1400 * p);
  noise(lp, t, 0.5, 'bandpass', 500 * p, 900 * p, 2.2, 0.16, 0.25);
  noise(lp, t + 0.55, 0.75, 'bandpass', 800 * p, 320 * p, 1.8, 0.2, 0.08);
  tone(lp, t + 0.55, 'sawtooth', 62 * p, 48 * p, 0.7, 0.05, 0.1);
  // a catch in the throat
  crackle(lp, t + 0.6, 0.4, 4, 0.05);
  return 1.35;
}, 0.5, 3, { rev: 0.35, low: true });

/** It wakes: a long groan that falls away into the dark. */
defineSfx('mini_grab_wake', (t, p, o) => {
  o = level(o, 0.45);
  const d = drive(filt(o, 'lowpass', 900), 0.8);
  tone(d, t, 'sawtooth', 70 * p, 46 * p, 1.4, 0.16, 0.25, 1.3);
  tone(d, t, 'sawtooth', 73 * p, 44 * p, 1.4, 0.12, 0.3, 1.3);
  noise(o, t, 1.3, 'bandpass', 380 * p, 220 * p, 2, 0.12, 0.3);
  return 1.5;
}, 0.8, 2, { rev: 0.5 });

/** It heard you: a snarl that rises, throat and teeth. */
defineSfx('mini_grab_growl', (t, p, o) => {
  o = level(o, 0.5);
  const d = drive(filt(o, 'lowpass', 2200 * p), 1.2);
  tone(d, t, 'sawtooth', 90 * p, 150 * p, 0.55, 0.14, 0.04, 0.4);
  tone(d, t, 'square', 93 * p, 140 * p, 0.55, 0.06, 0.05, 0.4);
  noise(o, t, 0.5, 'bandpass', 900 * p, 2200 * p, 2.5, 0.12, 0.05);
  // a wet click of the jaw at the end
  noise(o, t + 0.48, 0.03, 'bandpass', 2600 * p, 2600 * p, 3, 0.12);
  return 0.6;
}, 0.4, 2, { rev: 0.3 });

/**
 * The crouch, before it springs: claws ticking faster and faster on the deck over a swelling hiss
 * and a low note sliding up. It lasts ~0.55 s; `pitch` above 1 makes it shorter and tighter.
 */
defineSfx('mini_grab_crouch', (t, p, o) => {
  o = level(o, 1.4);
  const len = 0.55 / p;
  let at = 0;
  for (let k = 0; k < 9 && at < len; k++) {
    const gap = 0.11 * Math.pow(0.78, k) / p;
    noise(o, t + at, 0.015, 'bandpass', 3000 + k * 250, 3000 + k * 250, 6, 0.1 + k * 0.012);
    tone(o, t + at, 'square', 1500 + k * 120, 1300, 0.012, 0.025, 0.001);
    at += gap;
  }
  noise(o, t, len, 'highpass', 1500, 4500, 0.8, 0.08, len * 0.9);
  tone(filt(o, 'lowpass', 600), t, 'sawtooth', 55, 110, len, 0.12, len * 0.8);
  return len + 0.05;
}, 0.2, 2, { rev: 0.2 });

/** The lunge: air torn, and the snap of jaws closing at the end. */
defineSfx('mini_grab_lunge', (t, p, o) => {
  noise(o, t, 0.28, 'bandpass', 600 * p, 2600 * p, 1.4, 0.26, 0.02);
  tone(o, t, 'sine', 120 * p, 60 * p, 0.2, 0.18, 0.005);
  // the jaws
  noise(o, t + 0.26, 0.04, 'bandpass', 1800 * p, 1200 * p, 2, 0.3);
  tone(o, t + 0.26, 'square', 260 * p, 120 * p, 0.05, 0.08, 0.001);
  return 0.34;
}, 0.1, 2);

/** It got you: a heavy wet thump, crunch of plating and a squeal from the drone. */
defineSfx('mini_grab_maul', (t, p, o) => {
  boom(o, t, 0.8 * p, 0.35, 0.3);
  noise(drive(o, 1.5), t, 0.14, 'bandpass', 700 * p, 300 * p, 1.5, 0.3, 0.002);
  metal(o, t + 0.01, 380 * p, 0.06, 0.3);
  tone(o, t + 0.05, 'square', 1700 * p, 900 * p, 0.18, 0.03, 0.002);
  return 0.45;
}, 0.1, 2, { shock: 0.25 });

/** Flashed: a yelp that folds into a whimper. */
defineSfx('mini_grab_stun', (t, p, o) => {
  o = level(o, 1.6);
  const bp = filt(o, 'bandpass', 1400 * p, 1.5);
  tone(bp, t, 'sawtooth', 900 * p, 1500 * p, 0.08, 0.1, 0.005);
  tone(bp, t + 0.08, 'sawtooth', 1400 * p, 500 * p, 0.4, 0.08, 0.01, 0.38);
  return 0.5;
}, 0.1, 2, { rev: 0.25 });

// ---- you and the hold ------------------------------------------------------------------------

/** The flash: a capacitor whining up for a blink, then a bright pop and a cold ring. */
defineSfx('mini_grab_flash', (t, p, o) => {
  tone(o, t, 'sine', 1800 * p, 5200 * p, 0.09, 0.05, 0.06);
  noise(o, t + 0.08, 0.06, 'highpass', 3500, 3500, 0.7, 0.32);
  tone(o, t + 0.08, 'sine', 160 * p, 60 * p, 0.18, 0.28, 0.002);
  tone(o, t + 0.08, 'triangle', 2637 * p, 2620 * p, 0.6, 0.04, 0.002);
  noise(o, t + 0.1, 0.5, 'bandpass', 6000, 3000, 2, 0.05, 0.01);
  return 0.7;
}, 0.2, 1, { rev: 0.4 });

/** The flash isn't ready: a dry click and a flat buzz. */
defineSfx('mini_grab_dry', (t, p, o) => {
  o = level(o, 1.4);
  tone(o, t, 'square', 1100 * p, 900 * p, 0.02, 0.04, 0.001);
  tone(filt(o, 'lowpass', 1200), t + 0.03, 'sawtooth', 140 * p, 140 * p, 0.09, 0.05, 0.003);
  return 0.13;
}, 0.12, 1, { low: true });

/** A crate hooked: a clank, the line's catch, and (with `pitch` up) a brighter ring the longer the line. */
defineSfx('mini_grab_hook', (t, p, o) => {
  noise(o, t, 0.04, 'bandpass', 1300, 900, 2, 0.22);
  metal(o, t, 520 * p, 0.07, 0.25);
  tone(o, t + 0.03, 'triangle', mtof(76) * p, mtof(76) * p, 0.1, 0.07, 0.002);
  return 0.28;
}, 0.04, 3, { tuned: true });

/** A gold crate hooked: a heavier clank and a shimmer of coin. */
defineSfx('mini_grab_gold', (t, p, o) => {
  noise(o, t, 0.05, 'bandpass', 900, 600, 2, 0.26);
  metal(o, t, 330 * p, 0.09, 0.4);
  for (const [n, d] of [[0, 0.03], [4, 0.07], [7, 0.11], [12, 0.15]] as const) {
    const f = mtof(83 + n) * p;
    tone(o, t + d, 'sine', f, f, 0.35, 0.06, 0.002);
    tone(o, t + d, 'triangle', f * 2, f * 2, 0.12, 0.018, 0.002);
  }
  noise(o, t + 0.05, 0.3, 'highpass', 7000, 9000, 0.7, 0.03, 0.02);
  return 0.55;
}, 0.05, 2, { tuned: true, rev: 0.3 });

/** The line rattling as you move: a few loose chain clinks. Re-triggered by the game as you fly. */
defineSfx('mini_grab_rattle', (t, p, o) => {
  const hp = filt(o, 'highpass', 1500);
  for (let k = 0; k < 3; k++) {
    const at = Math.random() * 0.07;
    tone(hp, t + at, 'triangle', (2400 + Math.random() * 1400) * p, 2200 * p, 0.03, 0.03, 0.001);
  }
  noise(hp, t, 0.06, 'bandpass', 4200 * p, 3000 * p, 3, 0.03);
  return 0.1;
}, 0.05, 2, { low: true });

/** Bumped a stack gently: a soft hollow knock. */
defineSfx('mini_grab_bump', (t, p, o) => {
  tone(filt(o, 'lowpass', 900), t, 'triangle', 190 * p, 120 * p, 0.09, 0.12, 0.001);
  noise(o, t, 0.04, 'bandpass', 700 * p, 500 * p, 1.5, 0.08);
  return 0.12;
}, 0.07, 2, { low: true });

/** Slammed a stack at speed: a screech of metal on metal and a crate's clatter coming loose. */
defineSfx('mini_grab_scrape', (t, p, o) => {
  const bp = filt(o, 'bandpass', 2600 * p, 6);
  tone(bp, t, 'sawtooth', 1900 * p, 1500 * p, 0.3, 0.12, 0.004);
  tone(bp, t, 'sawtooth', 2010 * p, 1580 * p, 0.3, 0.09, 0.004);
  noise(o, t, 0.25, 'bandpass', 3400 * p, 1800 * p, 2, 0.12, 0.003);
  metal(o, t + 0.02, 430 * p, 0.08, 0.35);
  // the crate hitting the deck
  tone(filt(o, 'lowpass', 700), t + 0.12, 'triangle', 150, 80, 0.12, 0.16, 0.001);
  return 0.4;
}, 0.12, 2);

/** The line cut by a lunge: a cable twanging free, then crates thudding down. */
defineSfx('mini_grab_snap', (t, p, o) => {
  tone(o, t, 'sawtooth', 900 * p, 140 * p, 0.25, 0.1, 0.001, 0.18);
  noise(o, t, 0.05, 'highpass', 3000, 3000, 0.7, 0.22);
  for (let k = 0; k < 3; k++) tone(filt(o, 'lowpass', 600), t + 0.1 + k * 0.07, 'triangle', 140 - k * 15, 70, 0.1, 0.13, 0.001);
  return 0.4;
}, 0.1, 1);

/** A crate banked through the hatch: a solid clunk and a note, one step up the scale each (`pitch`). */
defineSfx('mini_grab_bank', (t, p, o) => {
  tone(filt(o, 'lowpass', 800), t, 'triangle', 120, 70, 0.08, 0.16, 0.001);
  const f = mtof(72) * p;
  tone(o, t + 0.01, 'triangle', f, f, 0.16, 0.12, 0.002);
  tone(o, t + 0.01, synth.pulse12, f, f, 0.07, 0.03, 0.002);
  tone(o, t + 0.04, 'sine', f * 1.5, f * 1.5, 0.12, 0.05, 0.002);
  return 0.2;
}, 0.03, 4, { tuned: true });

/** A trip all banked: a chord; with `pitch` above 1 (a big haul) it's fuller and climbs higher. */
defineSfx('mini_grab_haul', (t, p, o) => {
  const big = p > 1.01;
  const notes = big ? [0, 4, 7, 12, 16, 19] : [0, 4, 7, 12];
  notes.forEach((n, i) => {
    const f = mtof(67 + n);
    tone(o, t + i * 0.045, 'triangle', f, f, big ? 0.5 : 0.3, 0.09, 0.002);
    tone(o, t + i * 0.045, synth.pulse25, f, f, 0.12, 0.025, 0.002);
  });
  tone(o, t, 'sine', 110, 55, 0.25, 0.2, 0.002);
  if (big) noise(o, t, 0.4, 'bandpass', 2000, 8000, 2, 0.06, 0.3);
  return big ? 0.85 : 0.5;
}, 0.2, 1, { tuned: true, rev: 0.35 });

/** The doors grinding: a heavy ratchet clank, played each second at the end (faster as they close). */
defineSfx('mini_grab_door', (t, p, o) => {
  const lp = filt(o, 'lowpass', 1600);
  tone(lp, t, 'square', 95 * p, 70 * p, 0.1, 0.1, 0.002);
  noise(lp, t, 0.12, 'bandpass', 600 * p, 300 * p, 1.5, 0.2, 0.002);
  metal(o, t + 0.005, 210 * p, 0.05, 0.3);
  // the hydraulic sigh after
  noise(o, t + 0.08, 0.25, 'highpass', 3000, 1800, 0.7, 0.03, 0.04);
  return 0.35;
}, 0.2, 2, { rev: 0.3 });

/** Sealed in: the doors slam, a boom through the whole hull, the lamp's hum dying. */
defineSfx('mini_grab_seal', (t, p, o) => {
  boom(o, t, 0.6 * p, 1.1, 0.42);
  metal(o, t + 0.01, 140 * p, 0.12, 1.2);
  held(filt(o, 'lowpass', 900), t + 0.1, 'sawtooth', 120, 40, 0.8, 0.04, 0.01, 0.3);
  return 1.4;
}, 0.5, 1, { rev: 0.5, duck: [1, 0.4], shock: 0.4 });

/** Out through the hatch: the drone's rotors whining up into the open, and the line reeled in. */
defineSfx('mini_grab_out', (t, p, o) => {
  o = level(o, 1.4);
  noise(o, t, 0.6, 'bandpass', 500 * p, 3500 * p, 1.4, 0.18, 0.1);
  tone(o, t, 'sawtooth', 220 * p, 660 * p, 0.5, 0.05, 0.05);
  tone(o, t, 'triangle', 440 * p, 1320 * p, 0.5, 0.05, 0.05);
  return 0.65;
}, 0.3, 1, { rev: 0.3 });

/** The frenzy: both throats at once, lower and longer, and the deck shaking under it. */
defineSfx('mini_grab_frenzy', (t, p, o) => {
  o = level(o, 0.55);
  const d = drive(filt(o, 'lowpass', 1800), 1.6);
  tone(d, t, 'sawtooth', 80 * p, 160 * p, 0.8, 0.13, 0.05, 0.5);
  tone(d, t + 0.05, 'sawtooth', 105 * p, 190 * p, 0.75, 0.1, 0.05, 0.5);
  noise(o, t, 0.8, 'bandpass', 700, 1800, 2, 0.12, 0.1);
  tone(o, t, 'sine', 45, 38, 0.9, 0.22, 0.05);
  return 1;
}, 1, 1, { rev: 0.45 });
