/**
 * Thread it's own sounds: the minefield talks to you. The nearest mine ahead pings, faster as it
 * comes (its lamp's blink, heard); magnets hum as they reach for you; fuse mines tick down; a skim
 * is a whoosh of air past the canopy that climbs with the chain. Imported for its side effect by
 * thread.ts.
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

const PENTA = [0, 2, 4, 7, 9];
/** The pitch of step `k` up a pentatonic scale (for passing as `pitch`). */
export const penta = (k: number) => Math.pow(2, (Math.floor(k / 5) * 12 + PENTA[k % 5]) / 12);

/** A mine's proximity ping: a soft sonar blip. `pitch` sets the kind (magnets low, fuses high). */
defineSfx('mini_thread_ping', (t, p, o) => {
  const f = 1320 * p;
  tone(o, t, 'sine', f, f * 0.98, 0.07, 0.05, 0.002);
  tone(o, t, 'triangle', f * 2, f * 2, 0.025, 0.012, 0.001);
  return 0.08;
}, 0.05, 2, { low: true, tuned: true, rev: 0.15 });

/** A skim: air torn past the canopy, a quick doppler whoosh. `pitch` climbs with the chain. */
defineSfx('mini_thread_skim', (t, p, o) => {
  o = level(o, 1.2);
  noise(o, t, 0.16, 'bandpass', 1400 * p, 5200 * p, 2.2, 0.16, 0.03);
  noise(o, t + 0.05, 0.1, 'bandpass', 5200 * p, 2200 * p, 3, 0.06, 0.005);
  const f = mtof(84) * p;
  tone(o, t + 0.04, 'sine', f, f, 0.1, 0.035, 0.002);
  return 0.2;
}, 0.04, 3, { tuned: true });

/** A close skim: a sharper, nearer rip with a glint of metal on metal. */
defineSfx('mini_thread_close', (t, p, o) => {
  noise(o, t, 0.12, 'bandpass', 2200 * p, 8000 * p, 3, 0.2, 0.01);
  crackle(o, t + 0.02, 0.06, 4, 0.08);
  const f = mtof(91) * p;
  tone(o, t + 0.03, 'sine', f, f, 0.18, 0.05, 0.002);
  tone(o, t + 0.03, 'triangle', f * 1.5, f * 1.5, 0.08, 0.02, 0.002);
  return 0.22;
}, 0.04, 3, { tuned: true, rev: 0.2 });

/** The multiplier going up: a rising two-note fanfare; `pitch` is the new step up the scale. */
defineSfx('mini_thread_mult', (t, p, o) => {
  o = level(o, 1.8);
  const f = mtof(76) * p;
  tone(o, t, synth.pulse25, f, f, 0.08, 0.06, 0.002);
  tone(o, t + 0.07, synth.pulse25, f * 1.5, f * 1.5, 0.22, 0.07, 0.002);
  tone(o, t + 0.07, 'triangle', f * 3, f * 3, 0.26, 0.035, 0.002);
  noise(o, t + 0.07, 0.25, 'highpass', 6000, 9000, 0.7, 0.03, 0.02);
  return 0.35;
}, 0.1, 2, { tuned: true, rev: 0.3 });

/** The chain gone: a falling, sagging pair of notes. */
defineSfx('mini_thread_lost', (t, p, o) => {
  const f = mtof(67) * p;
  tone(o, t, 'square', f, f * 0.7, 0.25, 0.045, 0.002, 0.25);
  tone(o, t + 0.06, 'triangle', f * 0.75, f * 0.5, 0.3, 0.07, 0.002, 0.3);
  return 0.38;
}, 0.2, 1, { tuned: true });

/** A magnet waking as you come: an electric hum that wobbles up, like something reaching. */
defineSfx('mini_thread_magnet', (t, p, o) => {
  const lp = filt(o, 'lowpass', 1200);
  const a = held(lp, t, 'sawtooth', 70 * p, 105 * p, 0.45, 0.07, 0.05, 0.15);
  const lfo = synth.ctx.createOscillator();
  const lg = synth.ctx.createGain();
  lfo.frequency.value = 13;
  lg.gain.value = 9 * p;
  lfo.connect(lg).connect(a.frequency);
  lfo.start(t);
  lfo.stop(t + 0.7);
  tone(o, t, 'sine', 140 * p, 210 * p, 0.5, 0.05, 0.08);
  return 0.65;
}, 0.25, 2, { rev: 0.2 });

/** A fuse mine arming: a hard relay click and a rising whine. */
defineSfx('mini_thread_arm', (t, p, o) => {
  noise(o, t, 0.02, 'bandpass', 3000, 3000, 2, 0.16);
  tone(o, t, 'square', 700 * p, 700 * p, 0.015, 0.05, 0.001);
  tone(o, t + 0.01, 'sine', 900 * p, 2400 * p, 0.3, 0.035, 0.02);
  return 0.32;
}, 0.08, 2);

/** The fuse ticking down: a tight, dry tick (the game plays it faster as the fuse runs out). */
defineSfx('mini_thread_tick', (t, p, o) => {
  tone(o, t, 'square', 2200 * p, 2000 * p, 0.012, 0.04, 0.001);
  noise(o, t, 0.012, 'highpass', 5000, 5000, 0.7, 0.05);
  return 0.03;
}, 0.04, 2, { low: true });

/** A fuse mine blowing: a sharp crack and a short, hot boom. */
defineSfx('mini_thread_blast', (t, p, o) => {
  o = level(o, 0.6);
  boom(o, t, 1.1 * p, 0.45, 0.3);
  noise(o, t, 0.05, 'highpass', 3000, 3000, 0.7, 0.2);
  return 0.6;
}, 0.06, 3, { rev: 0.3 });

/** A blast dodged: a whoosh past and a bright ding of relief. */
defineSfx('mini_thread_dodged', (t, p, o) => {
  o = level(o, 1.5);
  noise(o, t, 0.2, 'bandpass', 800 * p, 4000 * p, 1.6, 0.12, 0.04);
  const f = mtof(88) * p;
  tone(o, t + 0.08, 'sine', f, f, 0.35, 0.06, 0.002);
  tone(o, t + 0.12, 'sine', f * 1.5, f * 1.5, 0.3, 0.04, 0.002);
  return 0.45;
}, 0.08, 2, { tuned: true, rev: 0.3 });

/** Hit a mine: the blast, the hull ringing, and the ship's alarm chirping once. */
defineSfx('mini_thread_hit', (t, p, o) => {
  o = level(o, 0.8);
  boom(o, t, 0.9 * p, 0.7, 0.4);
  metal(o, t + 0.01, 300 * p, 0.09, 0.6);
  noise(drive(o, 1.4), t, 0.12, 'bandpass', 900, 400, 1.2, 0.2);
  tone(o, t + 0.18, 'square', 1200, 1200, 0.06, 0.035, 0.002);
  tone(o, t + 0.27, 'square', 900, 900, 0.08, 0.035, 0.002);
  return 0.8;
}, 0.1, 2, { shock: 0.3, rev: 0.25 });

/** The girder sweeping by: a deep whoom of a great arm moving through the dark. */
defineSfx('mini_thread_sweep', (t, p, o) => {
  noise(o, t, 0.5, 'lowpass', 220 * p, 700 * p, 1.5, 0.16, 0.2);
  tone(o, t, 'sine', 55 * p, 75 * p, 0.5, 0.1, 0.2);
  // its bearing groaning
  tone(filt(o, 'bandpass', 500, 4), t + 0.1, 'sawtooth', 240 * p, 200 * p, 0.3, 0.04, 0.05);
  return 0.55;
}, 0.2, 2, { rev: 0.3, low: true });

/** Shaved past a girder: a heavy rush of air and a ringing clang of near-metal. */
defineSfx('mini_thread_shave', (t, p, o) => {
  o = level(o, 1.3);
  noise(o, t, 0.3, 'bandpass', 400 * p, 3000 * p, 1.2, 0.2, 0.03);
  metal(o, t + 0.05, 620 * p, 0.05, 0.5);
  const f = mtof(86) * p;
  tone(o, t + 0.08, 'triangle', f, f, 0.3, 0.05, 0.002);
  return 0.55;
}, 0.1, 1, { tuned: true, rev: 0.3 });

/** The burn lit: a thump and a roar opening up. */
defineSfx('mini_thread_burn', (t, p, o) => {
  tone(o, t, 'sine', 80 * p, 40 * p, 0.18, 0.22, 0.002);
  noise(o, t, 0.45, 'bandpass', 300 * p, 2200 * p, 1, 0.2, 0.02);
  tone(filt(o, 'lowpass', 900), t, 'sawtooth', 60 * p, 120 * p, 0.35, 0.07, 0.02);
  return 0.45;
}, 0.15, 1);

/** Wrecked: a big blast, the hull breaking up, debris tinkling after. */
defineSfx('mini_thread_wreck', (t, p, o) => {
  boom(o, t, 0.7 * p, 1.6, 0.48);
  metal(o, t + 0.05, 180 * p, 0.1, 1);
  crackle(o, t + 0.3, 0.9, 14, 0.06);
  return 1.5;
}, 0.5, 1, { rev: 0.45, duck: [1.2, 0.4], shock: 0.5 });

/** Through: a sweeping rise into a bright major arpeggio; `pitch` above 1 (flawless) adds the octave. */
defineSfx('mini_thread_clear', (t, p, o) => {
  const flawless = p > 1.01;
  noise(o, t, 0.35, 'bandpass', 500, 6000, 1.5, 0.12, 0.3);
  const notes = flawless ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12];
  notes.forEach((n, i) => {
    const f = mtof(72 + n);
    const last = i === notes.length - 1;
    tone(o, t + 0.3 + i * 0.06, 'triangle', f, f, last ? 0.7 : 0.2, 0.1, 0.002);
    tone(o, t + 0.3 + i * 0.06, synth.pulse25, f, f, last ? 0.4 : 0.12, 0.03, 0.002);
  });
  tone(o, t + 0.3, 'sine', 110, 55, 0.35, 0.25, 0.002);
  return 0.3 + notes.length * 0.06 + 0.7;
}, 0.5, 1, { tuned: true, rev: 0.45 });

/** A wall scraped: grit and a rasp of hull on rock. */
defineSfx('mini_thread_scrape', (t, p, o) => {
  noise(o, t, 0.18, 'bandpass', 1800 * p, 900 * p, 2.5, 0.16, 0.005);
  crackle(o, t, 0.15, 6, 0.06);
  metal(o, t, 410 * p, 0.03, 0.2);
  return 0.22;
}, 0.1, 1);

/** A tripwire caught: the cable twangs, then a fizz runs off along it. */
defineSfx('mini_thread_trip', (t, p, o) => {
  o = level(o, 1.2);
  tone(o, t, 'sine', 330 * p, 300 * p, 0.25, 0.08, 0.001);
  tone(o, t, 'triangle', 660 * p, 590 * p, 0.12, 0.03, 0.001);
  noise(o, t + 0.04, 0.35, 'bandpass', 3000 * p, 6000 * p, 4, 0.08, 0.02);
  crackle(o, t + 0.05, 0.3, 10, 0.05);
  return 0.4;
}, 0.1, 2, { rev: 0.2 });

/** Salvage picked up: a bright clink, a step up the scale with each one. */
defineSfx('mini_thread_salvage', (t, p, o) => {
  metal(o, t, 1500 * p, 0.05, 0.25);
  const f = mtof(84) * p;
  tone(o, t + 0.02, 'sine', f, f, 0.18, 0.05, 0.002);
  return 0.25;
}, 0.04, 3, { tuned: true, rev: 0.2 });

/** The cache taken: a heavy clamp shutting, and a chord swelling under it. */
defineSfx('mini_thread_grab', (t, p, o) => {
  metal(o, t, 220 * p, 0.12, 0.6);
  noise(o, t, 0.06, 'lowpass', 900, 400, 1, 0.25);
  for (const [i, n] of [0, 4, 7, 12].entries()) tone(o, t + 0.08 + i * 0.05, 'triangle', mtof(64 + n), mtof(64 + n), 0.6, 0.05, 0.01);
  return 0.9;
}, 0.5, 1, { tuned: true, rev: 0.4 });

/** The field wakes: a deep struck bell, and a siren of air rising under it. */
defineSfx('mini_thread_alarm', (t, p, o) => {
  metal(o, t, 160 * p, 0.14, 1.4);
  for (let k = 0; k < 3; k++) noise(o, t + k * 0.35, 0.32, 'bandpass', 500, 1600, 6, 0.12, 0.1);
  tone(o, t, 'sine', 55, 45, 1.2, 0.2, 0.01);
  return 1.4;
}, 1, 1, { rev: 0.45, duck: [0.8, 0.5] });

/** The fire rolling on behind you: a low, uneven rumble. */
defineSfx('mini_thread_rumble', (t, p, o) => {
  noise(o, t, 0.6, 'lowpass', 160 * p, 260 * p, 1, 0.14, 0.15);
  boom(level(o, 0.35), t + Math.random() * 0.2, 0.8 * p, 0.3, 0.2);
  return 0.6;
}, 0.3, 2, { low: true });

/** A hunter coming loose from the wall: a crack of rock and a rocket's hiss lighting. */
defineSfx('mini_thread_hunter', (t, p, o) => {
  crackle(o, t, 0.08, 6, 0.07);
  noise(o, t + 0.04, 0.4, 'bandpass', 900 * p, 3200 * p, 1.5, 0.12, 0.03);
  tone(o, t + 0.04, 'sine', 300 * p, 600 * p, 0.35, 0.04, 0.02);
  return 0.45;
}, 0.15, 2, { rev: 0.2 });
