/**
 * The sounds of Spoke's reels: a brass cabinet with paper drums, a motor in its belly, a brake,
 * a coin tray, and Spoke's tin hand. Everything here is made for the machine: ratchets and
 * clunks for the reels, bells for the wins, tin for the hand. Imported by reels.ts for its side
 * effect.
 */

import { defineSfx, synth } from '../../audio';

const { tone, noise, filt, crackle, metal, held, mtof } = synth;
/** The pentatonic steps the cabinet's bells climb. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

/** A reel ticking past its pawl: a dry paper-and-tin click, one per symbol. */
defineSfx(
  'mini_reels_tick',
  (t, p, o) => {
    noise(o, t, 0.012, 'bandpass', 3800 * p, 3000 * p, 2.5, 0.12, 0.0005);
    tone(filt(o, 'highpass', 900), t, 'square', 1500 * p, 900 * p, 0.018, 0.025, 0.0005);
    return 0.03;
  },
  0.018,
  4,
  { low: true },
);

/** The motor in the cabinet's belly while anything spins: a whirr that climbs with speed (pitch). */
defineSfx(
  'mini_reels_hum',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 520 * p, 1.2);
    held(lp, t, 'sawtooth', 62 * p, 64 * p, 0.26, 0.05, 0.06, 0.12);
    held(lp, t, 'square', 124 * p, 125 * p, 0.26, 0.012, 0.06, 0.12);
    noise(o, t, 0.34, 'bandpass', 900 * p, 1000 * p, 1.5, 0.025, 0.08);
    return 0.42;
  },
  0.2,
  2,
  { low: true },
);

/** The lever coming down: ratchet clacks, a spring, and the motor kicking the drums into a spin. */
defineSfx(
  'mini_reels_lever',
  (t, p, o) => {
    for (let i = 0; i < 4; i++) noise(o, t + i * 0.035, 0.015, 'bandpass', (2600 - i * 300) * p, 2000 * p, 3, 0.16, 0.001);
    tone(filt(o, 'bandpass', 700, 3), t + 0.15, 'triangle', 380 * p, 220 * p, 0.25, 0.07, 0.002, 0.2);
    tone(o, t + 0.15, 'sine', 120 * p, 60 * p, 0.12, 0.22, 0.002);
    noise(o, t + 0.18, 0.5, 'bandpass', 400 * p, 1600 * p, 1.4, 0.07, 0.15);
    return 0.7;
  },
  0.3,
  1,
  { rev: 0.15 },
);

/** The button: the brake shoe slams on, a short friction squeal under a hard clack. */
defineSfx(
  'mini_reels_brake',
  (t, p, o) => {
    noise(o, t, 0.012, 'highpass', 3000, 3000, 0.7, 0.2, 0.0005);
    tone(filt(o, 'lowpass', 2000), t, 'square', 420 * p, 260 * p, 0.05, 0.1, 0.0005);
    noise(o, t + 0.01, 0.16, 'bandpass', 3400 * p, 1400 * p, 6, 0.06, 0.01);
    return 0.2;
  },
  0.05,
  2,
);

/** The drum swings home on its catch: a heavy wooden thunk with a brass ring (reel 1, 2, 3 climb). */
defineSfx(
  'mini_reels_clunk',
  (t, p, o) => {
    tone(o, t, 'sine', 150 * p, 62 * p, 0.18, 0.34, 0.001);
    noise(o, t, 0.08, 'lowpass', 1600 * p, 300 * p, 0.8, 0.28, 0.001);
    metal(o, t + 0.004, 520 * p, 0.035, 0.3);
    return 0.34;
  },
  0.04,
  3,
  { tuned: true, rev: 0.12 },
);

/** The drum's last little settle on its catch. */
defineSfx(
  'mini_reels_settle',
  (t, p, o) => {
    tone(o, t, 'triangle', 260 * p, 180 * p, 0.05, 0.08, 0.001);
    noise(o, t, 0.02, 'bandpass', 1800 * p, 1500 * p, 2, 0.06, 0.0005);
    return 0.07;
  },
  0.04,
  3,
  { low: true },
);

/** The slack spring of a teasing last reel: a creak each time a symbol rocks across the line. */
defineSfx(
  'mini_reels_creak',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 1100 * p, 5);
    tone(bp, t, 'sawtooth', 210 * p, 160 * p, 0.12, 0.09, 0.01);
    noise(o, t, 0.02, 'bandpass', 2600 * p, 2600 * p, 2, 0.07, 0.001);
    return 0.14;
  },
  0.05,
  2,
);

/** The hot reel's heartbeat: lub-dub, low, under everything while the last reel decides. */
defineSfx(
  'mini_reels_heart',
  (t, p, o) => {
    tone(o, t, 'sine', 72 * p, 48 * p, 0.12, 0.17, 0.004);
    tone(o, t + 0.14, 'sine', 64 * p, 44 * p, 0.14, 0.12, 0.004);
    return 0.32;
  },
  0.3,
  1,
  { tuned: true },
);

/** The first two match: the cabinet's bell rings twice and the bulbs start racing. */
defineSfx(
  'mini_reels_hot',
  (t, p, o) => {
    metal(o, t, mtof(81) * p, 0.06, 0.5);
    metal(o, t + 0.1, mtof(88) * p, 0.07, 0.7);
    noise(o, t + 0.1, 0.4, 'highpass', 7000, 9000, 0.7, 0.02, 0.05);
    return 0.8;
  },
  0.2,
  1,
  { tuned: true, rev: 0.3 },
);

/** A cog on the line: a bright gear-chime, one pentatonic step higher for each cog showing (pitch). */
defineSfx(
  'mini_reels_cog',
  (t, p, o) => {
    const f = mtof(84) * p;
    tone(o, t, 'triangle', f, f, 0.25, 0.08, 0.002);
    tone(o, t + 0.04, 'sine', f * 1.5, f * 1.5, 0.3, 0.05, 0.002);
    metal(o, t, f / 2, 0.025, 0.4);
    return 0.45;
  },
  0.06,
  3,
  { tuned: true, rev: 0.25 },
);

/** A greased cog slips out of the catch: a greasy squeak sliding off. */
defineSfx(
  'mini_reels_slip',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 1500 * p, 4);
    tone(bp, t, 'sawtooth', 700 * p, 1300 * p, 0.06, 0.14, 0.004);
    tone(bp, t + 0.06, 'sawtooth', 1300 * p, 500 * p, 0.12, 0.11, 0.002);
    noise(o, t, 0.15, 'bandpass', 2400 * p, 900 * p, 3, 0.07, 0.01);
    return 0.2;
  },
  0.1,
  1,
);

/** Spoke's hand coming down: a tin servo whining up, then fingers clinking on to the drum. */
defineSfx(
  'mini_reels_hand',
  (t, p, o) => {
    const bp = filt(o, 'bandpass', 1400 * p, 3);
    tone(bp, t, 'sawtooth', 300 * p, 900 * p, 0.2, 0.1, 0.03, 0.18);
    tone(bp, t, 'square', 450 * p, 1350 * p, 0.2, 0.025, 0.03, 0.18);
    for (let i = 0; i < 3; i++) metal(o, t + 0.17 + i * 0.03, (1900 + i * 230) * p, 0.045, 0.16);
    return 0.36;
  },
  0.2,
  1,
  { rev: 0.1 },
);

/** Slapped: a smack on tin and a thin ring as the hand snatches back up. */
defineSfx(
  'mini_reels_slap',
  (t, p, o) => {
    noise(o, t, 0.05, 'bandpass', 1600 * p, 900 * p, 1.2, 0.5, 0.0005);
    tone(o, t, 'sine', 180 * p, 70 * p, 0.09, 0.3, 0.001);
    metal(o, t + 0.005, 760 * p, 0.05, 0.45);
    tone(filt(o, 'bandpass', 1200, 3), t + 0.06, 'sawtooth', 1100 * p, 300 * p, 0.18, 0.05, 0.002);
    return 0.5;
  },
  0.08,
  2,
  { rev: 0.2 },
);

/** Too slow: the hand cranks the reel a notch, ka-chunk, and the bell goes flat. */
defineSfx(
  'mini_reels_nudge',
  (t, p, o) => {
    noise(o, t, 0.03, 'bandpass', 2200 * p, 1600 * p, 3, 0.2, 0.0005);
    tone(o, t + 0.07, 'sine', 130 * p, 60 * p, 0.14, 0.28, 0.001);
    noise(o, t + 0.07, 0.07, 'lowpass', 1200, 300, 0.8, 0.2, 0.001);
    metal(o, t + 0.12, mtof(76) * 0.94 * p, 0.04, 0.4);
    return 0.5;
  },
  0.15,
  1,
);

/** A slap at nothing: the whole cabinet rocks on its feet, a hollow boom and a rattle of coins. */
defineSfx(
  'mini_reels_jolt',
  (t, p, o) => {
    tone(o, t, 'sine', 95 * p, 50 * p, 0.2, 0.24, 0.003);
    noise(o, t, 0.18, 'lowpass', 700 * p, 200 * p, 1, 0.16, 0.003);
    crackle(o, t + 0.03, 0.2, 7, 0.04);
    return 0.3;
  },
  0.1,
  1,
);

/** From vicious up, a reel catching: a gritty grinding shudder, the warning before the stall. */
defineSfx(
  'mini_reels_catch',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 900, 2);
    for (let i = 0; i < 7; i++) tone(lp, t + i * 0.06, 'square', 95 * p, 80 * p, 0.045, 0.07, 0.002);
    noise(o, t, 0.45, 'bandpass', 600 * p, 350 * p, 2, 0.06, 0.03);
    return 0.5;
  },
  0.3,
  1,
);

/** The auto-stop fuse in its last moments: a dry clock tick. */
defineSfx(
  'mini_reels_fuse',
  (t, p, o) => {
    tone(filt(o, 'highpass', 1200), t, 'square', 2200 * p, 2000 * p, 0.015, 0.03, 0.0005);
    return 0.03;
  },
  0.2,
  1,
  { low: true },
);

/** Coins spilling into the tray: tings scattered over a short pour. Pitch = how big the pour (0.5..1.5). */
defineSfx(
  'mini_reels_coins',
  (t, p, o) => {
    const n = Math.round(8 + 22 * Math.max(0, p - 0.5));
    const len = 0.35 + 0.9 * Math.max(0, p - 0.5);
    const bp = filt(o, 'highpass', 1400);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.pow(Math.random(), 0.8) * len;
      const f = 2400 + Math.random() * 2600;
      metal(bp, tt, f, 0.038 * (0.5 + Math.random() * 0.5), 0.12 + Math.random() * 0.12);
    }
    noise(o, t, len, 'bandpass', 5000, 3500, 1, 0.035, 0.03);
    return len + 0.3;
  },
  0.15,
  2,
  { tuned: true, rev: 0.2 },
);

/** A pair on the line: two bells, a fourth apart. */
defineSfx(
  'mini_reels_pair',
  (t, p, o) => {
    metal(o, t, mtof(79) * p, 0.06, 0.5);
    metal(o, t + 0.08, mtof(84) * p, 0.07, 0.6);
    return 0.7;
  },
  0.2,
  1,
  { tuned: true, rev: 0.3 },
);

/** Three alike: the bells run up the scale and a bright chord rings out over the cabinet. */
defineSfx(
  'mini_reels_three',
  (t, p, o) => {
    PENTA.slice(0, 6).forEach((n, i) => metal(o, t + i * 0.055, mtof(76 + n) * p, 0.05, 0.4));
    for (const n of [0, 4, 7, 12]) tone(o, t + 0.33, 'triangle', mtof(76 + n) * p, mtof(76 + n) * p, 0.7, 0.04, 0.01);
    tone(o, t + 0.33, 'sine', 98 * p, 98 * p, 0.6, 0.12, 0.02);
    return 1.1;
  },
  0.3,
  1,
  { tuned: true, rev: 0.35, duck: [0.8, 0.5] },
);

/**
 * Three cogs: the machine goes off. A siren of bells trilling up, a brass chord over a deep swell,
 * and a long glitter of coins.
 */
defineSfx(
  'mini_reels_jackpot',
  (t, p, o) => {
    tone(o, t, 'sine', 49 * p, 98 * p, 1.4, 0.2, 0.2, 0.8);
    for (let i = 0; i < 12; i++) metal(o, t + i * 0.05, mtof(76 + PENTA[i % 8] + (i >= 8 ? 12 : 0)) * p, 0.045, 0.35);
    for (const [n, d] of [
      [0, 0.6],
      [4, 0.64],
      [7, 0.68],
      [12, 0.72],
      [16, 0.76],
    ] as const) {
      const f = mtof(64 + n) * p;
      tone(o, t + d, 'sawtooth', f, f, 1.3, 0.022, 0.05);
      tone(o, t + d, 'triangle', f * 2, f * 2, 1.5, 0.04, 0.01);
    }
    // the trill: two bells alternating fast, like an alarm that's on your side
    for (let i = 0; i < 10; i++) tone(o, t + 0.7 + i * 0.07, 'sine', mtof(i % 2 ? 100 : 96) * p, mtof(i % 2 ? 100 : 96) * p, 0.1, 0.03, 0.002);
    noise(o, t + 0.5, 1.6, 'highpass', 6000, 11000, 0.6, 0.03, 0.2);
    return 2.3;
  },
  1,
  1,
  { tuned: true, rev: 0.5, duck: [2, 0.35] },
);

/** Spoke's chuckle: two nasal, falling "heh"s through a tin throat. */
defineSfx(
  'mini_reels_heh',
  (t, p, o) => {
    for (const [d, f] of [
      [0, 1],
      [0.17, 0.86],
    ] as const) {
      const f1 = filt(o, 'bandpass', 900 * p, 5);
      const f2 = filt(o, 'bandpass', 2300 * p, 6);
      tone(f1, t + d, 'sawtooth', 170 * f * p, 150 * f * p, 0.11, 0.22, 0.01);
      tone(f2, t + d, 'sawtooth', 170 * f * p, 150 * f * p, 0.11, 0.1, 0.01);
      noise(o, t + d, 0.05, 'bandpass', 3000, 3000, 2, 0.04, 0.005);
    }
    return 0.35;
  },
  0.5,
  1,
);

/** Let it ride: a cheeky up-ratchet into two rising notes, money back on the table. */
defineSfx(
  'mini_reels_ride',
  (t, p, o) => {
    for (let i = 0; i < 5; i++) noise(o, t + i * 0.03, 0.012, 'bandpass', (1600 + i * 400) * p, 2000 * p, 3, 0.12, 0.001);
    tone(o, t + 0.16, 'square', mtof(72) * p, mtof(72) * p, 0.07, 0.07, 0.002);
    tone(o, t + 0.23, 'square', mtof(79) * p, mtof(79) * p, 0.12, 0.08, 0.002);
    tone(o, t + 0.16, 'sine', 110 * p, 110 * p, 0.2, 0.1, 0.004);
    return 0.4;
  },
  0.2,
  1,
  { tuned: true },
);

/** Take it: the till's ka-ching, a drawer and a bell. */
defineSfx(
  'mini_reels_take',
  (t, p, o) => {
    noise(o, t, 0.12, 'bandpass', 1200 * p, 2400 * p, 1.5, 0.12, 0.01);
    tone(o, t + 0.1, 'sine', 120 * p, 70 * p, 0.08, 0.2, 0.001);
    metal(o, t + 0.12, mtof(91) * p, 0.07, 0.7);
    metal(o, t + 0.12, mtof(96) * p, 0.04, 0.5);
    return 0.8;
  },
  0.3,
  1,
  { tuned: true, rev: 0.25 },
);

/** A line that pays nothing: a flat tin buzz as the bulbs go dark. */
defineSfx(
  'mini_reels_bust',
  (t, p, o) => {
    const lp = filt(o, 'lowpass', 1400);
    tone(lp, t, 'square', 196 * p, 185 * p, 0.3, 0.06, 0.01);
    tone(lp, t, 'square', 207 * p, 196 * p, 0.3, 0.05, 0.01);
    return 0.35;
  },
  0.3,
  1,
  { tuned: true },
);

export {};
