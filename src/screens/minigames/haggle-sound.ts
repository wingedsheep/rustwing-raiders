/**
 * The sounds of the HAGGLE in Tobbo's yard, made for it. Under everything, his wings: a slow warm
 * hum when he's soft, an even whirr, a hard angry buzz when he's prickly, so you can hear his mood
 * as well as see it. Over that, the click of the offer dial, the slap of an offer on the counter,
 * a bell for a soft spot hit (climbing with the streak), his wings roaring at an insult, the iron
 * clank when he won't move, footsteps on gravel when you walk, the shop bell of the other buyer,
 * the coins of a deal and the gate slamming shut. His voice barks are his own (src/voices.ts).
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, metal, crackle, boom, drive, mtof } = synth;

/**
 * One grain of wing sound: a voice whose level beats at the wing rate (the flutter), faded in
 * and out so grains played back to back blend into one continuous sound.
 */
function wing(o: AudioNode, t: number, w: OscillatorType, f: number, beat: number, depth: number, peak: number, dur: number, lpHz: number) {
  const ctx = synth.ctx;
  const osc = ctx.createOscillator();
  osc.type = w;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.linearRampToValueAtTime(f * (0.98 + Math.random() * 0.04), t + dur);
  const level = ctx.createGain();
  level.gain.setValueAtTime(0, t);
  level.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
  level.gain.setValueAtTime(peak, t + dur * 0.7);
  level.gain.linearRampToValueAtTime(0, t + dur);
  const flutter = ctx.createGain();
  flutter.gain.value = 1 - depth / 2;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = beat;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = depth / 2;
  lfo.connect(lfoAmt).connect(flutter.gain);
  const lp = filt(o, 'lowpass', lpHz, 1.2);
  osc.connect(level).connect(flutter).connect(lp);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
}

/** His wings when he's soft: a slow, warm hum. */
defineSfx('mini_haggle_hum', (t, p, o) => {
  wing(o, t, 'triangle', 98 * p, 7, 0.5, 0.035, 0.42, 700);
  wing(o, t, 'sine', 196 * p, 7, 0.4, 0.012, 0.42, 900);
  return 0.42;
}, 0.12, 3, { low: true, tuned: true });

/** His wings between moods: an even whirr. */
defineSfx('mini_haggle_whirr', (t, p, o) => {
  wing(o, t, 'sawtooth', 130 * p, 19, 0.6, 0.035, 0.42, 900);
  return 0.42;
}, 0.12, 3, { low: true });

/** His wings when he's prickly: a hard, angry buzz, like a hornet in a tin. */
defineSfx('mini_haggle_buzz', (t, p, o) => {
  const bp = filt(o, 'bandpass', 1100 * p, 1.4);
  wing(bp, t, 'sawtooth', 176 * p, 42, 0.85, 0.13, 0.42, 3000);
  wing(bp, t, 'square', 353 * p, 42, 0.8, 0.035, 0.42, 3000);
  return 0.42;
}, 0.12, 3, { low: true });

/** A note he hums, soft: a warm "mm" off his snout (pitch picks the note). */
defineSfx('mini_haggle_note', (t, p, o) => {
  const ctx = synth.ctx;
  const f = mtof(64) * p;
  const lp = filt(o, 'lowpass', 1200);
  const osc = tone(lp, t, 'triangle', f, f, 0.32, 0.05, 0.05);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5.5;
  const amt = ctx.createGain();
  amt.gain.value = f * 0.012;
  vib.connect(amt).connect(osc.frequency);
  vib.start(t);
  vib.stop(t + 0.36);
  tone(lp, t, 'sine', f * 2, f * 2, 0.25, 0.015, 0.05);
  return 0.34;
}, 0.2, 2, { tuned: true, rev: 0.2 });

/** The offer dial: a bead clicking along an abacus wire (pitch follows the offer). */
defineSfx('mini_haggle_dial', (t, p, o) => {
  tone(o, t, 'sine', 1500 * p, 1300 * p, 0.03, 0.06, 0.001);
  noise(o, t, 0.012, 'bandpass', 3200 * p, 3200 * p, 3, 0.07);
  return 0.04;
}, 0.025, 2, { low: true });

/** An offer made: scrap slapped down on his counter. */
defineSfx('mini_haggle_offer', (t, p, o) => {
  metal(o, t, 1180 * p, 0.04, 0.25);
  metal(o, t + 0.03, 1530 * p, 0.025, 0.18);
  noise(o, t, 0.05, 'lowpass', 900, 300, 1, 0.16, 0.001);
  tone(o, t, 'sine', 140, 70, 0.08, 0.15, 0.002);
  return 0.28;
}, 0.05, 2);

/** He gives way in a soft spot: a warm bell; the streak climbs the scale (pitch). */
defineSfx('mini_haggle_soft', (t, p, o) => {
  const f = mtof(76) * p;
  tone(o, t, 'sine', f, f, 0.6, 0.12, 0.003);
  tone(o, t, 'triangle', f * 2, f * 2, 0.25, 0.04, 0.003);
  tone(o, t + 0.08, 'sine', f * 1.5, f * 1.5, 0.5, 0.08, 0.003);
  noise(o, t, 0.1, 'bandpass', 2000, 6000, 2, 0.05, 0.03);
  return 0.65;
}, 0.1, 2, { tuned: true, rev: 0.35 });

/** An offer while he's prickly: a sour sting of wing and a grunt. */
defineSfx('mini_haggle_pushed', (t, p, o) => {
  const bp = filt(o, 'bandpass', 900, 2);
  tone(bp, t, 'sawtooth', 220 * p, 160 * p, 0.2, 0.1, 0.005);
  tone(bp, t, 'sawtooth', 233 * p, 170 * p, 0.2, 0.08, 0.005);
  tone(o, t, 'sine', 120, 70, 0.12, 0.16, 0.003);
  return 0.24;
}, 0.1, 2);

/** An insult: his wings roar up, furious, and something gets kicked. */
defineSfx('mini_haggle_insult', (t, p, o) => {
  const d = drive(filt(o, 'lowpass', 2600), 0.7);
  wing(d, t, 'sawtooth', 120 * p, 48, 0.9, 0.14, 0.55, 3000);
  tone(d, t, 'sawtooth', 110 * p, 190 * p, 0.45, 0.06, 0.02, 0.3);
  noise(o, t, 0.25, 'bandpass', 600, 1800, 1, 0.12, 0.02);
  boom(o, t, 1.2, 0.3, 0.15);
  return 0.6;
}, 0.2, 1, { rev: 0.2 });

/** Too low, but he's soft: a wheezy little laugh, heh-heh. */
defineSfx('mini_haggle_cheeky', (t, p, o) => {
  for (const [d, f] of [[0, 520], [0.12, 470]] as const) {
    const bp = filt(o, 'bandpass', 900, 3);
    tone(bp, t + d, 'sawtooth', f * p, f * 0.82 * p, 0.08, 0.2, 0.004);
    noise(o, t + d, 0.06, 'bandpass', 1800, 1400, 2, 0.1, 0.004);
  }
  return 0.22;
}, 0.2, 1);

/** He won't move: an iron weight set down on the counter. */
defineSfx('mini_haggle_firm', (t, p, o) => {
  metal(o, t, 170 * p, 0.08, 0.6);
  tone(o, t, 'sine', 90, 45, 0.25, 0.18, 0.002);
  noise(o, t, 0.04, 'lowpass', 1200, 400, 1, 0.12, 0.001);
  return 0.6;
}, 0.2, 1, { rev: 0.25 });

/** A footstep on the yard's gravel. */
defineSfx('mini_haggle_step', (t, p, o) => {
  noise(o, t, 0.07, 'lowpass', 1800 * p, 500 * p, 1, 0.2, 0.003);
  crackle(o, t, 0.05, 4, 0.05);
  tone(o, t, 'sine', 110 * p, 60 * p, 0.05, 0.14, 0.002);
  return 0.08;
}, 0.1, 2, { low: true });

/** He chases you: wings roaring up behind you, and a rising "wait!". */
defineSfx('mini_haggle_chase', (t, p, o) => {
  wing(o, t, 'sawtooth', 150 * p, 30, 0.7, 0.06, 0.45, 1500);
  noise(o, t, 0.3, 'bandpass', 500, 2200, 1.2, 0.12, 0.08);
  const bp = filt(o, 'bandpass', 1000, 2.5);
  tone(bp, t + 0.12, 'sawtooth', 300 * p, 700 * p, 0.3, 0.12, 0.01, 0.25);
  for (const [n, d] of [[0, 0.3], [7, 0.4]] as const) tone(o, t + d, 'sine', mtof(79 + n), mtof(79 + n), 0.4, 0.06, 0.003);
  return 0.8;
}, 0.5, 1, { rev: 0.3 });

/** He lets you go: a sour fall, a flat second. */
defineSfx('mini_haggle_letgo', (t, p, o) => {
  for (const [n, d] of [[0, 0], [-1, 0.16], [-6, 0.32]] as const) {
    const f = mtof(64 + n) * p;
    tone(o, t + d, 'triangle', f, f * 0.98, 0.3, 0.08, 0.004);
  }
  return 0.65;
}, 0.5, 1, { tuned: true, rev: 0.2 });

/** The other buyer: the little bell over the yard gate. */
defineSfx('mini_haggle_buyer', (t, p, o) => {
  for (const d of [0, 0.2]) {
    metal(o, t + d, 1320 * p, 0.05, 0.7);
    tone(o, t + d, 'sine', 2640 * p, 2640 * p, 0.3, 0.015, 0.002);
  }
  return 0.9;
}, 0.5, 1, { tuned: true, rev: 0.4 });

/** Last call: the bell rung hard, twice, and a thump on the counter. */
defineSfx('mini_haggle_lastcall', (t, p, o) => {
  for (const d of [0, 0.14]) metal(o, t + d, 990 * p, 0.055, 0.6);
  tone(o, t, 'sine', 110, 50, 0.25, 0.2, 0.003);
  return 0.75;
}, 0.5, 1, { tuned: true, rev: 0.35, duck: [0.6, 0.7] });

/** A tick of the last call's count. */
defineSfx('mini_haggle_tick', (t, p, o) => {
  tone(o, t, 'triangle', 820 * p, 780 * p, 0.05, 0.1, 0.001);
  noise(o, t, 0.015, 'bandpass', 2500, 2500, 2, 0.06);
  return 0.06;
}, 0.2, 1, { tuned: true });

/** A deal: scrap counted into his paws, coin on coin, and a bright chord (pitch > 1: a steal). */
defineSfx('mini_haggle_deal', (t, p, o) => {
  for (let k = 0; k < 7; k++) metal(o, t + k * 0.045 + Math.random() * 0.02, (1400 + Math.random() * 900) * p, 0.035, 0.2);
  for (const [n, d] of [[0, 0.3], [4, 0.36], [7, 0.42], [12, 0.5]] as const) {
    const f = mtof(72 + n) * p;
    tone(o, t + d, 'triangle', f, f, 0.6, 0.1, 0.003);
    tone(o, t + d, 'sine', f * 2, f * 2, 0.3, 0.03, 0.003);
  }
  return 1.1;
}, 0.5, 1, { tuned: true, rev: 0.4, duck: [0.9, 0.7] });

/** The gate slammed shut: a crash of iron, and the rattle of the chain. */
defineSfx('mini_haggle_slam', (t, p, o) => {
  boom(o, t, 0.8 * p, 0.7, 0.28);
  metal(o, t, 72 * p, 0.12, 1.1);
  metal(o, t + 0.01, 131 * p, 0.08, 0.8);
  crackle(o, t + 0.1, 0.5, 16, 0.08);
  return 1.2;
}, 0.5, 1, { rev: 0.35, duck: [1, 0.5], shock: 0.25 });

/** Sold to the other one: a sliding fall, and coins going into someone else's pocket. */
defineSfx('mini_haggle_sold', (t, p, o) => {
  tone(o, t, 'triangle', 660 * p, 220 * p, 0.6, 0.08, 0.01, 0.55);
  for (let k = 0; k < 3; k++) metal(o, t + 0.5 + k * 0.08, 1200 - k * 150, 0.025, 0.2);
  return 0.9;
}, 0.5, 1, { rev: 0.3 });
