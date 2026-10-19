/**
 * Rustwing Raiders audio: every sound synthesized at runtime with the Web Audio API.
 *
 * Graph:
 *   sfx voices -> per-play gain/pan -> sfxBus ----------------------\
 *                                   \-> sfxVerb (short convolver) ---+-> master (mute/volume)
 *   music players -> fade -> duck -> musicVol ------------------------/     -> compressor -> limiter -> out
 *                 \-> reverb send -> its own long convolver -> fade -> duck
 *
 * Music is sequenced step by step (16 steps a bar) by a lookahead scheduler running on
 * AudioContext time. Each track's song (32 bars: A B A' B') is generated once from a seed
 * derived from the track name, so the same track always sounds the same.
 */

export type Sfx =
  | 'shot_rivet' | 'shot_scatter' | 'shot_rail' | 'shot_arc' | 'shot_missile' | 'shot_flak' | 'shot_mine' | 'flak_burst'
  | 'hit' | 'hit_armor' | 'enemy_shot' | 'lock_on' | 'torpedo_launch' | 'torpedo_down' | 'explode_small' | 'explode_big' | 'explode_boss'
  | 'player_hit' | 'player_down' | 'shield_break' | 'shield_up' | 'dash' | 'graze' | 'overheat'
  | 'pickup_scrap' | 'pickup_part' | 'heal'
  | 'special_bomb' | 'special_phase' | 'special_emp' | 'special_overdrive' | 'special_ready'
  | 'laser_charge' | 'laser_fire' | 'lightning' | 'geyser' | 'crash' | 'warp' | 'boss_warning' | 'level_clear'
  | 'ui_move' | 'ui_select' | 'ui_back' | 'ui_error' | 'ui_place' | 'ui_buy'
  | 'card_flip' | 'loot_epic' | 'loot_legendary'
  | 'kill' | 'perfect' | 'skim' | 'boost' | 'risk_up' | 'risk_lost' | 'point_blank'
  | 'parry' | 'block' | 'aux_ready' | 'hook' | 'reel' | 'eat' | 'blink' | 'ram' | 'flare'
  | 'mark_burn' | 'mark_shock' | 'mark_crack' | 'react_overload' | 'react_cookoff' | 'react_shatter' | 'detonate'
  | 'hull_hit' | 'boarders' | 'boarded' | 'hauler_lost' | 'horn'
  | 'engine_out' | 'spool' | 'jump' | 'runner_down' | 'bay' | 'pod_loose' | 'pod_catch' | 'pod_fell'
  | 'sentinel' | 'sentinel_out' | 'boomerang' | 'frenzy' | 'frenzy_max' | 'frenzy_off' | 'thunder' | 'nova' | 'feed'
  | 'heavy' | 'heavy_dry' | 'reload' | 'reload_perfect' | 'load_class';
export type Loop = 'beam' | 'flame' | 'engine' | 'wind';
export type Track = 'title' | 'map' | 'hangar' | 'boss' | 'orutal' | 'halcyon' | 'kessra' | 'mirefall' | 'glacis' | 'ashgrave' | 'vesh' | 'cinder';

// ================================================================================================
// Engine state
// ================================================================================================

let ctx!: AudioContext;
let ready = false;
let master!: GainNode;
let sfxBus!: GainNode;
let sfxVerb!: GainNode;
let musicDuck!: GainNode;
let musicVol!: GainNode;
let musicVerbIR!: AudioBuffer;
let noiseBuf!: AudioBuffer;
let pulse12!: PeriodicWave;
let pulse25!: PeriodicWave;
const makeCurve = (k: number) => {
  const c = new Float32Array(2048);
  const n = Math.tanh(k);
  for (let i = 0; i < c.length; i++) c[i] = Math.tanh(k * ((i / (c.length - 1)) * 2 - 1)) / n;
  return c;
};
let driveCurve: ReturnType<typeof makeCurve> | null = null;

const settings = { master: 1, music: 0.8, sfx: 1 };
let isMuted = false;
try {
  isMuted = localStorage.getItem('rr.muted') === '1';
} catch {
  /* storage unavailable */
}

let wantTrack: Track | null = null;
let wantI = 0;
let timer = 0;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function init(): boolean {
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return false;
  ctx = new AC({ latencyHint: 'interactive' });

  // master chain: gentle glue compressor, then a brick-ish limiter
  master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.08;
  master.connect(comp).connect(lim).connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  musicVol = ctx.createGain();
  musicVol.connect(master);
  musicDuck = ctx.createGain();
  musicDuck.connect(musicVol);

  // shared buffers: 2 s of white noise, two reverb impulses, pulse waves, drive curve
  const sr = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, sr * 2, sr);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  musicVerbIR = impulse(2.6, 2.4);

  const sv = ctx.createConvolver();
  sv.buffer = impulse(1.4, 3);
  sfxVerb = ctx.createGain();
  sfxVerb.connect(sv).connect(master);

  pulse12 = pulseWave(0.125);
  pulse25 = pulseWave(0.25);
  driveCurve = makeCurve(5);

  applyVolumes(true);
  ready = true;
  timer = window.setInterval(tick, 25);
  document.addEventListener('visibilitychange', onVisibility);
  return true;
}

/** A tab in the background goes quiet (another tab with the game open would play over it). */
function onVisibility() {
  if (document.hidden) void ctx.suspend().catch(() => undefined);
  else void ctx.resume().catch(() => undefined);
}

function impulse(seconds: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // darker as it decays: one-pole lowpass with falling coefficient
      const a = 0.9 - 0.75 * x;
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
  }
  return b;
}

function pulseWave(duty: number): PeriodicWave {
  const n = 64;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

function applyVolumes(instant = false) {
  if (!ready && !instant) return;
  const now = ctx.currentTime;
  const tc = instant ? 0.001 : 0.05;
  master.gain.setTargetAtTime(isMuted ? 0 : settings.master, now, tc);
  musicVol.gain.setTargetAtTime(settings.music * 0.7, now, tc);
  sfxBus.gain.setTargetAtTime(settings.sfx * 0.9, now, tc);
  sfxVerb.gain.setTargetAtTime(settings.sfx * 0.9, now, tc);
}

// ================================================================================================
// Synthesis helpers
// ================================================================================================

type Wave = OscillatorType | PeriodicWave;
const setWave = (o: OscillatorNode, w: Wave) => {
  if (w instanceof PeriodicWave) o.setPeriodicWave(w);
  else o.type = w;
};
const nyq = (f: number) => clamp(f, 10, 20000);

/** Percussive envelope: ramp up, exponential fall, then a tiny linear tail to true zero (no clicks). */
function env(p: AudioParam, t: number, a: number, peak: number, dur: number) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-6), t + Math.max(dur, a + 0.004));
  p.linearRampToValueAtTime(0, t + Math.max(dur, a + 0.004) + 0.01);
}

/** Sustained envelope; returns when the voice can stop. */
function adsr(p: AudioParam, t: number, a: number, d: number, s: number, r: number, hold: number, peak: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (s < 1) p.setTargetAtTime(peak * s, t + a, Math.max(0.005, d / 3));
  const rel = t + Math.max(hold, a + 0.01);
  p.setTargetAtTime(0, rel, Math.max(0.005, r / 4));
  return rel + r * 1.7;
}

function tone(out: AudioNode, t: number, w: Wave, f0: number, f1: number, dur: number, peak: number, a = 0.002, glide = dur): OscillatorNode {
  const o = ctx.createOscillator();
  setWave(o, w);
  o.frequency.setValueAtTime(nyq(f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(nyq(f1), t + glide);
  const g = ctx.createGain();
  env(g.gain, t, a, peak, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
  return o;
}

function noise(out: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, a = 0.002) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(nyq(f0), t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(nyq(f1), t + dur);
  const g = ctx.createGain();
  env(g.gain, t, a, peak, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 1.9);
  s.stop(t + dur + 0.03);
}

function filt(out: AudioNode, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = nyq(f);
  n.Q.value = q;
  n.connect(out);
  return n;
}

/** Random short grains of bright noise: the crackle in explosions and zaps. */
function crackle(out: AudioNode, t: number, dur: number, n: number, peak: number) {
  const hp = filt(out, 'highpass', 1800);
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(Math.random(), 1.5) * dur;
    const fade = 1 - ((tt - t) / dur) * 0.7;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const g = ctx.createGain();
    const len = 0.005 + Math.random() * 0.02;
    env(g.gain, tt, 0.001, peak * (0.35 + 0.65 * Math.random()) * fade, len);
    s.connect(g).connect(hp);
    s.start(tt, Math.random() * 1.9);
    s.stop(tt + len + 0.02);
  }
}

/** Low thump + filtered noise body + crack + crackle. size ~0.3 (pop) .. 2 (huge). */
function boom(out: AudioNode, t: number, p: number, size: number, peak: number) {
  const len = 0.22 + 0.5 * size;
  tone(out, t, 'sine', 150 * p, 32 * p, len * 0.9, peak * 0.95, 0.003, len * 0.45);
  tone(out, t, 'triangle', 95 * p, 30 * p, len * 0.6, peak * 0.4, 0.002);
  noise(out, t, len * 1.25, 'lowpass', 4200 * p, 160 * p, 0.8, peak * 0.75, 0.003);
  noise(out, t, 0.06, 'bandpass', 2600 * p, 1200 * p, 1, peak * 0.45);
  crackle(out, t + 0.03, len, Math.round(5 + size * 9), peak * 0.35);
}

// ================================================================================================
// Sound effects
// ================================================================================================

type SfxFn = (t: number, p: number, o: AudioNode) => number;
interface SfxDef {
  fn: SfxFn;
  /** Minimum seconds between two plays. */
  gap: number;
  /** Max simultaneous voices of this sfx. */
  max: number;
  /** Low priority: dropped first when the global voice cap is hit. */
  low?: boolean;
  /** Reverb send. */
  rev?: number;
  /** Musical: no random pitch drift. */
  tuned?: boolean;
}

let combo = 0;
let lastScrap = -9;
const PENTA = [0, 2, 4, 7, 9];

const S = (fn: SfxFn, gap: number, max: number, extra: Partial<SfxDef> = {}): SfxDef => ({ fn, gap, max, ...extra });

const SFX: Record<Sfx, SfxDef> = {
  shot_rivet: S((t, p, o) => {
    tone(o, t, 'square', 1100 * p, 380 * p, 0.07, 0.07, 0.001);
    tone(o, t, 'triangle', 520 * p, 150 * p, 0.065, 0.15, 0.001);
    noise(o, t, 0.025, 'highpass', 3500, 3500, 0.7, 0.09);
    return 0.09;
  }, 0.045, 4, { low: true }),

  shot_scatter: S((t, p, o) => {
    noise(o, t, 0.15, 'bandpass', 2400 * p, 450 * p, 0.9, 0.32, 0.001);
    tone(o, t, 'sine', 190 * p, 55 * p, 0.13, 0.3, 0.002);
    noise(o, t, 0.02, 'highpass', 5000, 5000, 0.7, 0.12);
    return 0.16;
  }, 0.07, 3, { low: true }),

  shot_rail: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 3500);
    tone(lp, t, 'sawtooth', 2600 * p, 90 * p, 0.32, 0.12, 0.001, 0.22);
    tone(o, t, 'sine', 150 * p, 40 * p, 0.3, 0.34, 0.002);
    noise(o, t, 0.05, 'highpass', 3000, 3000, 0.7, 0.22);
    tone(o, t, 'sine', 3300 * p, 3000 * p, 0.45, 0.035, 0.002);
    return 0.48;
  }, 0.1, 2, { low: true, rev: 0.15 }),

  shot_arc: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 2000 * p, 0.8);
    const sq = ctx.createOscillator();
    sq.type = 'square';
    for (let k = 0; k < 9; k++) sq.frequency.setValueAtTime((280 + Math.random() * 1500) * p, t + k * 0.015);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, 0.12, 0.14);
    sq.connect(g).connect(bp);
    sq.start(t);
    sq.stop(t + 0.17);
    crackle(o, t, 0.12, 7, 0.1);
    tone(o, t, 'sine', 1800 * p, 500 * p, 0.1, 0.05, 0.002);
    return 0.16;
  }, 0.06, 3, { low: true }),

  shot_missile: S((t, p, o) => {
    noise(o, t, 0.3, 'bandpass', 500 * p, 2600 * p, 1.8, 0.22, 0.02);
    tone(o, t, 'triangle', 260 * p, 520 * p, 0.08, 0.12, 0.002);
    noise(o, t, 0.03, 'lowpass', 1500, 1500, 0.7, 0.15);
    return 0.32;
  }, 0.06, 3, { low: true }),

  shot_flak: S((t, p, o) => {
    tone(o, t, 'sine', 240 * p, 60 * p, 0.16, 0.36, 0.001, 0.1);
    noise(o, t, 0.1, 'lowpass', 2200 * p, 400, 0.8, 0.25);
    noise(o, t, 0.02, 'highpass', 4000, 4000, 0.7, 0.14);
    return 0.18;
  }, 0.08, 3, { low: true }),

  shot_mine: S((t, p, o) => {
    tone(o, t, 'triangle', 170 * p, 85 * p, 0.1, 0.26, 0.002);
    noise(o, t, 0.04, 'bandpass', 900 * p, 900 * p, 2, 0.2);
    tone(o, t + 0.07, 'square', 1250 * p, 1250 * p, 0.05, 0.035, 0.003);
    tone(o, t + 0.13, 'square', 1250 * p, 1250 * p, 0.05, 0.03, 0.003);
    return 0.2;
  }, 0.1, 2, { low: true }),

  flak_burst: S((t, p, o) => {
    boom(o, t, p * 1.4, 0.3, 0.2);
    crackle(o, t, 0.2, 8, 0.12);
    return 0.45;
  }, 0.05, 4, { low: true }),

  hit: S((t, p, o) => {
    noise(o, t, 0.035, 'bandpass', 3000 * p, 1500 * p, 1.2, 0.16);
    tone(o, t, 'square', 700 * p, 300 * p, 0.04, 0.045, 0.001);
    return 0.05;
  }, 0.03, 5, { low: true }),

  hit_armor: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 2800 * p, 3);
    tone(bp, t, 'square', 1420 * p, 1380 * p, 0.14, 0.16, 0.001);
    tone(bp, t, 'square', 2130 * p, 2100 * p, 0.1, 0.12, 0.001);
    noise(o, t, 0.02, 'highpass', 5000, 5000, 0.7, 0.12);
    return 0.15;
  }, 0.04, 4, { low: true }),

  enemy_shot: S((t, p, o) => {
    tone(o, t, 'triangle', 620 * p, 300 * p, 0.09, 0.08, 0.002);
    tone(o, t, 'sine', 1240 * p, 600 * p, 0.05, 0.03, 0.002);
    return 0.1;
  }, 0.05, 4, { low: true }),

  // a lock-on: pips that come quicker and higher as the brackets close
  lock_on: S((t, p, o) => {
    let at = 0;
    for (let k = 0; k < 7; k++) {
      tone(o, t + at, 'square', (900 + k * 90) * p, (900 + k * 90) * p, 0.045, 0.04, 0.002);
      at += 0.2 - k * 0.025;
    }
    tone(o, t + at, 'square', 1800 * p, 1800 * p, 0.14, 0.05, 0.002);
    return at + 0.15;
  }, 0.3, 2),

  // a torpedo let go: a clunk off the rack, then the motor catching
  torpedo_launch: S((t, p, o) => {
    tone(o, t, 'triangle', 200 * p, 90 * p, 0.08, 0.18, 0.002);
    noise(o, t + 0.4, 0.5, 'bandpass', 700 * p, 2400 * p, 1.5, 0.14, 0.05);
    tone(o, t + 0.4, 'sawtooth', 110 * p, 160 * p, 0.4, 0.04, 0.03);
    return 0.9;
  }, 0.1, 3),

  torpedo_down: S((t, p, o) => {
    boom(o, t, p * 1.3, 0.2, 0.2);
    tone(o, t, 'square', 1500 * p, 600 * p, 0.08, 0.05, 0.001);
    return 0.4;
  }, 0.04, 4),

  explode_small: S((t, p, o) => {
    boom(o, t, p, 0.45, 0.26);
    return 0.5;
  }, 0.04, 6, { low: true }),

  explode_big: S((t, p, o) => {
    boom(o, t, p * 0.8, 1.2, 0.3);
    tone(o, t + 0.04, 'sine', 70 * p, 24 * p, 0.8, 0.26, 0.01);
    noise(o, t + 0.02, 0.5, 'bandpass', 500 * p, 250 * p, 0.9, 0.16, 0.01);
    return 1.1;
  }, 0.08, 3, { rev: 0.25 }),

  explode_boss: S((t, p, o) => {
    boom(o, t, p, 1.5, 0.28);
    boom(o, t + 0.25, p * 1.15, 1, 0.22);
    boom(o, t + 0.6, p * 0.7, 1.9, 0.3);
    noise(o, t, 2.6, 'lowpass', 200 * p, 90, 0.8, 0.3, 0.2);
    return 2.8;
  }, 0.5, 1, { rev: 0.35 }),

  player_hit: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2200);
    tone(lp, t, 'square', 320 * p, 70 * p, 0.26, 0.15, 0.001);
    tone(lp, t, 'sawtooth', 333 * p, 72 * p, 0.26, 0.1, 0.001);
    noise(o, t, 0.18, 'bandpass', 1200 * p, 400 * p, 0.8, 0.28);
    tone(o, t, 'sine', 110 * p, 40 * p, 0.2, 0.3, 0.002);
    return 0.3;
  }, 0.1, 2),

  player_down: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t, 'sawtooth', 700 * p, 45 * p, 1.1, 0.14, 0.005);
    tone(lp, t, 'square', 705 * p, 46 * p, 1.1, 0.07, 0.005);
    boom(o, t + 0.05, p * 0.8, 1.4, 0.3);
    return 1.3;
  }, 0.3, 2, { rev: 0.25 }),

  shield_break: S((t, p, o) => {
    for (let i = 0; i < 9; i++) {
      const f = (2200 + Math.random() * 4200) * p;
      tone(o, t + Math.random() * 0.18, 'sine', f, f * 0.97, 0.08 + Math.random() * 0.12, 0.05, 0.001);
    }
    noise(o, t, 0.35, 'highpass', 5000, 3000, 0.7, 0.16);
    tone(filt(o, 'lowpass', 3000), t, 'square', 1300 * p, 180 * p, 0.3, 0.07, 0.002);
    return 0.42;
  }, 0.15, 2, { rev: 0.2 }),

  shield_up: S((t, p, o) => {
    tone(o, t, 'sine', 320 * p, 1280 * p, 0.35, 0.16, 0.02, 0.3);
    tone(o, t + 0.04, 'triangle', 640 * p, 2560 * p, 0.3, 0.06, 0.02, 0.26);
    noise(o, t, 0.3, 'bandpass', 2000 * p, 6000 * p, 4, 0.06, 0.05);
    return 0.4;
  }, 0.15, 2),

  dash: S((t, p, o) => {
    noise(o, t, 0.24, 'bandpass', 700 * p, 3200 * p, 1.6, 0.26, 0.03);
    tone(o, t, 'sine', 180 * p, 380 * p, 0.14, 0.12, 0.01);
    return 0.26;
  }, 0.08, 2),

  graze: S((t, p, o) => {
    tone(o, t, 'sine', 3400 * p, 4200 * p, 0.05, 0.05, 0.002);
    tone(o, t, 'triangle', 5100 * p, 5600 * p, 0.035, 0.02, 0.002);
    return 0.06;
  }, 0.04, 3, { low: true }),

  /** The parry: a blade's ring, bright and long, over a thump. The best sound in the game. */
  parry: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 3200 * p, 4);
    tone(bp, t, 'sawtooth', 2400 * p, 2350 * p, 0.6, 0.12, 0.001);
    tone(o, t, 'sine', 1760 * p, 1750 * p, 0.9, 0.09, 0.001);
    tone(o, t, 'sine', 2637 * p, 2630 * p, 0.7, 0.05, 0.001);
    noise(o, t, 0.04, 'highpass', 4000, 4000, 0.7, 0.35);
    tone(o, t, 'sine', 140 * p, 45 * p, 0.25, 0.4, 0.001);
    return 0.95;
  }, 0.06, 3, { tuned: true, rev: 0.35 }),

  block: S((t, p, o) => {
    tone(filt(o, 'lowpass', 1400), t, 'square', 300 * p, 180 * p, 0.12, 0.12, 0.001);
    noise(o, t, 0.08, 'bandpass', 900 * p, 600 * p, 1.2, 0.22);
    return 0.14;
  }, 0.06, 2),

  aux_ready: S((t, p, o) => {
    const f = mtof(88) * p;
    tone(o, t, 'triangle', f, f, 0.08, 0.05, 0.002);
    tone(o, t + 0.05, 'triangle', f * 1.335, f * 1.335, 0.12, 0.05, 0.002);
    return 0.18;
  }, 0.2, 2, { tuned: true }),

  hook: S((t, p, o) => {
    noise(o, t, 0.14, 'bandpass', 1500 * p, 5000 * p, 3, 0.18, 0.005);
    tone(o, t, 'square', 600 * p, 1800 * p, 0.1, 0.04, 0.002);
    tone(o, t + 0.12, 'square', 900 * p, 900 * p, 0.03, 0.06, 0.001);
    return 0.16;
  }, 0.08, 2),

  reel: S((t, p, o) => {
    noise(o, t, 0.3, 'bandpass', 4000 * p, 800 * p, 2, 0.16, 0.01);
    tone(o, t, 'sawtooth', 220 * p, 80 * p, 0.3, 0.08, 0.01);
    return 0.32;
  }, 0.1, 2),

  // escorts: fire on a hauler's hull, a dull clank with a ring to it
  hull_hit: S((t, p, o) => {
    tone(o, t, 'triangle', 240 * p, 190 * p, 0.14, 0.12, 0.001);
    tone(o, t, 'square', 1420 * p, 1380 * p, 0.09, 0.025, 0.001);
    noise(o, t, 0.05, 'bandpass', 1800 * p, 900 * p, 1.2, 0.12);
    return 0.16;
  }, 0.06, 3, { low: true }),

  // raiders coming to board: the convoy's klaxon, two falls
  boarders: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2400);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.32;
      tone(lp, tt, 'sawtooth', 740 * p, 520 * p, 0.26, 0.09, 0.01);
      tone(lp, tt, 'square', 370 * p, 260 * p, 0.26, 0.05, 0.01);
    }
    return 0.62;
  }, 0.6, 1, { tuned: true }),

  // a boarder clamps on, and its cutter bites into the hull
  boarded: S((t, p, o) => {
    tone(o, t, 'square', 180 * p, 90 * p, 0.06, 0.16, 0.001);
    noise(o, t, 0.04, 'highpass', 3000, 3000, 0.7, 0.18);
    noise(o, t + 0.05, 0.45, 'bandpass', 3800 * p, 5200 * p, 6, 0.12, 0.02);
    tone(o, t + 0.05, 'sawtooth', 95 * p, 110 * p, 0.45, 0.05, 0.02);
    return 0.52;
  }, 0.15, 2),

  // a hauler goes down: its tanks go up, and its horn sags as it falls
  hauler_lost: S((t, p, o) => {
    boom(o, t, p * 0.9, 1.4, 0.3);
    boom(o, t + 0.3, p * 0.7, 1.1, 0.24);
    const lp = filt(o, 'lowpass', 1400);
    tone(lp, t + 0.1, 'sawtooth', 220 * p, 110 * p, 1.4, 0.08, 0.05, 1.3);
    tone(lp, t + 0.1, 'sawtooth', 277 * p, 138 * p, 1.4, 0.06, 0.05, 1.3);
    return 1.6;
  }, 0.4, 1, { rev: 0.3 }),

  // a hauler home: its horn, two notes, and a chime for the pay
  horn: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1600);
    for (const [at, n] of [[0, 50], [0.28, 55]] as const) {
      const f = mtof(n) * p;
      tone(lp, t + at, 'sawtooth', f, f, 0.24, 0.1, 0.02);
      tone(lp, t + at, 'sawtooth', f * 1.26, f * 1.26, 0.24, 0.06, 0.02);
    }
    tone(o, t + 0.55, 'triangle', mtof(84) * p, mtof(84) * p, 0.3, 0.06, 0.002);
    return 0.9;
  }, 0.2, 2, { tuned: true, rev: 0.2 }),

  // heists: an engine on the runner blows, and its turbine winds down
  engine_out: S((t, p, o) => {
    boom(o, t, p * 0.8, 1.3, 0.32);
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t + 0.05, 'sawtooth', 420 * p, 60 * p, 1.3, 0.07, 0.01, 1.2);
    tone(lp, t + 0.05, 'square', 210 * p, 40 * p, 1.3, 0.04, 0.01, 1.2);
    noise(o, t + 0.1, 1.1, 'bandpass', 900 * p, 200 * p, 2, 0.08, 0.05);
    return 1.4;
  }, 0.3, 2, { rev: 0.25 }),

  // its jump drive spooling: a cold whine climbing for the last stretch of the level
  spool: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 5200);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 2.8;
      tone(lp, tt, 'sine', 220 * p * (1 + i * 0.5), 880 * p * (1 + i * 0.5), 2.8, 0.05 + i * 0.015, 0.4, 2.8);
      tone(lp, tt, 'triangle', 330 * p * (1 + i * 0.5), 1320 * p * (1 + i * 0.5), 2.8, 0.025, 0.4, 2.8);
    }
    noise(o, t, 8.4, 'bandpass', 600, 4200, 3, 0.03, 3);
    return 8.5;
  }, 1, 1, { rev: 0.3 }),

  // and the jump: a rip of air, a thump, a ring falling away
  jump: S((t, p, o) => {
    noise(o, t, 0.5, 'bandpass', 900 * p, 7000 * p, 1.5, 0.22, 0.01);
    tone(o, t, 'sine', 90 * p, 30 * p, 0.6, 0.35, 0.002);
    tone(o, t + 0.02, 'triangle', 1760 * p, 220 * p, 0.9, 0.08, 0.002, 0.9);
    tone(o, t + 0.02, 'sine', 2640 * p, 330 * p, 0.9, 0.05, 0.002, 0.9);
    return 1.0;
  }, 0.5, 1, { rev: 0.5 }),

  // the runner taken down: blast on blast, and a long groan of metal
  runner_down: S((t, p, o) => {
    boom(o, t, p * 0.7, 2, 0.4);
    boom(o, t + 0.35, p * 0.85, 1.5, 0.3);
    boom(o, t + 0.8, p * 0.6, 2, 0.32);
    const lp = filt(o, 'lowpass', 900);
    tone(lp, t + 0.2, 'sawtooth', 110 * p, 48 * p, 2.2, 0.08, 0.1, 2.2);
    tone(lp, t + 0.2, 'sawtooth', 116 * p, 50 * p, 2.2, 0.06, 0.1, 2.2);
    return 2.6;
  }, 1, 1, { rev: 0.4 }),

  // the heavy button: a sub thump under whatever the heavies fire, so a press always lands
  heavy: S((t, p, o) => {
    tone(o, t, 'sine', 120 * p, 38 * p, 0.28, 0.42, 0.002, 0.16);
    noise(o, t, 0.09, 'lowpass', 900 * p, 200 * p, 0.9, 0.28, 0.002);
    tone(o, t + 0.01, 'square', 70 * p, 45 * p, 0.08, 0.08, 0.001);
    return 0.3;
  }, 0.06, 2, { rev: 0.12 }),

  // pressed with every heavy dry: the firing pin on an empty chamber
  heavy_dry: S((t, p, o) => {
    tone(o, t, 'square', 1900 * p, 1700 * p, 0.018, 0.05, 0.001);
    noise(o, t, 0.02, 'highpass', 4500, 4500, 0.9, 0.07);
    tone(o, t + 0.05, 'square', 1500 * p, 1400 * p, 0.015, 0.03, 0.001);
    return 0.08;
  }, 0.08, 1, { low: true }),

  // a round back in a heavy: a slide and a clack, pitched up with every round it holds
  reload: S((t, p, o) => {
    noise(o, t, 0.05, 'bandpass', 1800 * p, 3200 * p, 1.6, 0.06, 0.01);
    tone(o, t + 0.05, 'square', 520 * p, 300 * p, 0.03, 0.09, 0.001);
    noise(o, t + 0.05, 0.02, 'highpass', 4000, 4000, 0.7, 0.08);
    return 0.1;
  }, 0.05, 2, { low: true, tuned: true }),

  // a perfect dash chambers a round: the clack, and a bright ring on top
  reload_perfect: S((t, p, o) => {
    tone(o, t, 'square', 600 * p, 340 * p, 0.03, 0.1, 0.001);
    noise(o, t, 0.02, 'highpass', 4000, 4000, 0.7, 0.1);
    tone(o, t + 0.03, 'triangle', 1320 * p, 1320 * p, 0.25, 0.08, 0.003);
    tone(o, t + 0.07, 'triangle', 1980 * p, 1980 * p, 0.3, 0.06, 0.003);
    return 0.35;
  }, 0.08, 1, { tuned: true, rev: 0.3 }),

  // the hangar: the ship's load class changing (up a fourth: lighter; down: heavier)
  load_class: S((t, p, o) => {
    tone(o, t, 'triangle', 440 * p, 440 * p, 0.12, 0.09, 0.003);
    tone(o, t + 0.09, 'triangle', 587 * p, 587 * p, 0.22, 0.09, 0.003);
    noise(o, t, 0.12, 'bandpass', 900 * p, 1800 * p, 1.2, 0.04, 0.01);
    return 0.35;
  }, 0.1, 1, { tuned: true }),

  // the runner's bay doors: a clank and a hiss (a mine dropped, fighters launched)
  bay: S((t, p, o) => {
    tone(o, t, 'square', 140 * p, 90 * p, 0.08, 0.1, 0.001);
    noise(o, t + 0.04, 0.25, 'highpass', 2200 * p, 3800 * p, 0.8, 0.06, 0.02);
    return 0.3;
  }, 0.2, 2, { low: true }),

  // a strongbox's clamps blown: two bangs, and its drogue cracking open
  pod_loose: S((t, p, o) => {
    tone(o, t, 'square', 260 * p, 120 * p, 0.06, 0.12, 0.001);
    tone(o, t + 0.07, 'square', 300 * p, 140 * p, 0.06, 0.1, 0.001);
    noise(o, t + 0.16, 0.18, 'bandpass', 1400 * p, 600 * p, 1.4, 0.16, 0.005);
    tone(o, t + 0.16, 'triangle', 660 * p, 990 * p, 0.2, 0.05, 0.005);
    return 0.4;
  }, 0.15, 2, { tuned: true }),

  // caught: a heavy clunk into the hold, and a bright run up the scale
  pod_catch: S((t, p, o) => {
    tone(o, t, 'triangle', 150 * p, 80 * p, 0.12, 0.22, 0.001);
    noise(o, t, 0.05, 'lowpass', 2000, 400, 0.7, 0.14);
    [72, 76, 79, 84].forEach((n, i) => tone(o, t + 0.06 + i * 0.06, 'square', mtof(n) * p, mtof(n) * p, 0.14, 0.05, 0.002));
    tone(o, t + 0.3, 'triangle', mtof(91) * p, mtof(91) * p, 0.4, 0.05, 0.002);
    return 0.7;
  }, 0.1, 2, { tuned: true, rev: 0.25 }),

  // dropped past you: a whistle falling away
  pod_fell: S((t, p, o) => {
    tone(o, t, 'sine', 1200 * p, 260 * p, 0.8, 0.08, 0.01, 0.8);
    tone(o, t, 'triangle', 600 * p, 130 * p, 0.8, 0.04, 0.01, 0.8);
    tone(o, t + 0.85, 'square', 110 * p, 80 * p, 0.12, 0.06, 0.002);
    return 1.0;
  }, 0.3, 1, { tuned: true }),

  eat: S((t, p, o) => {
    tone(o, t, 'sine', 900 * p, 200 * p, 0.07, 0.08, 0.002);
    return 0.08;
  }, 0.03, 4, { low: true }),

  blink: S((t, p, o) => {
    tone(o, t, 'sine', 2400 * p, 300 * p, 0.12, 0.1, 0.001);
    tone(o, t + 0.05, 'sine', 300 * p, 2400 * p, 0.12, 0.08, 0.001);
    noise(o, t, 0.15, 'highpass', 6000, 2000, 0.7, 0.08);
    return 0.2;
  }, 0.08, 2),

  ram: S((t, p, o) => {
    boom(o, t, p * 1.2, 0.4, 0.3);
    tone(filt(o, 'bandpass', 1800 * p, 2), t, 'square', 900 * p, 400 * p, 0.12, 0.2, 0.001);
    return 0.5;
  }, 0.06, 3),

  flare: S((t, p, o) => {
    noise(o, t, 0.6, 'bandpass', 3000 * p, 1200 * p, 0.8, 0.2, 0.01);
    tone(o, t, 'sine', 500 * p, 1500 * p, 0.2, 0.06, 0.01);
    return 0.62;
  }, 0.1, 2),

  /** The crunch on top of a kill's explosion; `p` climbs with a chain of kills. */
  /** A mark taking: a lick of flame catching, a snap of static, a brittle tick of armour giving. */
  mark_burn: S((t, p, o) => {
    noise(o, t, 0.28, 'bandpass', 380 * p, 1900 * p, 1.4, 0.16, 0.02);
    tone(o, t, 'sine', 160 * p, 90 * p, 0.12, 0.08, 0.005);
    return 0.3;
  }, 0.06, 3, { low: true }),

  mark_shock: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 2600 * p, 1.2);
    const sq = ctx.createOscillator();
    sq.type = 'square';
    for (let k = 0; k < 5; k++) sq.frequency.setValueAtTime((600 + Math.random() * 2200) * p, t + k * 0.012);
    const g = ctx.createGain();
    env(g.gain, t, 0.001, 0.07, 0.07);
    sq.connect(g).connect(bp);
    sq.start(t);
    sq.stop(t + 0.09);
    crackle(o, t, 0.08, 4, 0.06);
    return 0.1;
  }, 0.06, 3, { low: true }),

  mark_crack: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 3400 * p, 5);
    tone(bp, t, 'square', 2900 * p, 2700 * p, 0.05, 0.1, 0.001);
    tone(bp, t + 0.03, 'square', 3700 * p, 3500 * p, 0.04, 0.07, 0.001);
    noise(o, t, 0.02, 'highpass', 5500, 5500, 0.7, 0.08);
    return 0.09;
  }, 0.06, 3, { low: true }),

  /** OVERLOAD: lightning tearing out of a fire: a crackling zap that climbs, over a thump. */
  react_overload: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 2200 * p, 0.9);
    const sq = ctx.createOscillator();
    sq.type = 'square';
    for (let k = 0; k < 14; k++) sq.frequency.setValueAtTime((300 + Math.random() * 2400) * p * (1 + k * 0.05), t + k * 0.016);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, 0.16, 0.26);
    sq.connect(g).connect(bp);
    sq.start(t);
    sq.stop(t + 0.3);
    crackle(o, t, 0.35, 16, 0.16);
    tone(o, t, 'sine', 300 * p, 2400 * p, 0.22, 0.06, 0.004, 0.2);
    boom(o, t, p * 1.3, 0.4, 0.2);
    return 0.5;
  }, 0.07, 3, { rev: 0.2 }),

  /** COOK-OFF: a deep blast with the roar of fire after it. */
  react_cookoff: S((t, p, o) => {
    boom(o, t, p * 0.9, 0.9, 0.3);
    noise(o, t + 0.04, 0.7, 'bandpass', 300 * p, 1200 * p, 0.9, 0.18, 0.06);
    tone(o, t, 'sine', 90 * p, 30 * p, 0.5, 0.28, 0.004);
    return 0.9;
  }, 0.07, 3, { rev: 0.25 }),

  /** SHATTER: a heavy blow and armour going like glass. */
  react_shatter: S((t, p, o) => {
    tone(o, t, 'sine', 130 * p, 40 * p, 0.3, 0.42, 0.001);
    noise(o, t, 0.05, 'highpass', 3000, 3000, 0.7, 0.3);
    for (let i = 0; i < 12; i++) {
      const f = (2400 + Math.random() * 5200) * p;
      tone(o, t + 0.02 + Math.random() * 0.25, 'sine', f, f * 0.96, 0.06 + Math.random() * 0.14, 0.05, 0.001);
    }
    noise(o, t + 0.02, 0.4, 'highpass', 6000, 3500, 0.7, 0.14);
    return 0.55;
  }, 0.08, 2, { rev: 0.3 }),

  /** The Catalyst setting marks off: a rushing whoosh into a bright crack. */
  detonate: S((t, p, o) => {
    noise(o, t, 0.12, 'bandpass', 900 * p, 4200 * p, 1.4, 0.2, 0.01);
    tone(o, t + 0.05, 'triangle', 1800 * p, 600 * p, 0.12, 0.08, 0.002);
    boom(o, t + 0.05, p * 1.2, 0.45, 0.2);
    return 0.5;
  }, 0.06, 3, { rev: 0.2 }),

  kill: S((t, p, o) => {
    noise(o, t, 0.05, 'bandpass', 1800 * p, 600 * p, 1.4, 0.3, 0.001);
    tone(o, t, 'square', 260 * p, 60 * p, 0.09, 0.14, 0.001);
    tone(o, t + 0.01, 'triangle', 1320 * p, 1320 * p, 0.12, 0.06, 0.002);
    return 0.14;
  }, 0.03, 4, { tuned: true }),

  perfect: S((t, p, o) => {
    // a reversed swell, then a bright bell
    noise(o, t, 0.16, 'bandpass', 900, 6000, 3, 0.2, 0.14);
    for (const [n, d] of [[0, 0.16], [7, 0.2], [12, 0.24], [19, 0.3]] as const) {
      const f = mtof(84 + n) * p;
      tone(o, t + d, 'sine', f, f, 0.5, 0.09, 0.002);
      tone(o, t + d, 'triangle', f * 2, f * 2, 0.2, 0.025, 0.002);
    }
    tone(o, t + 0.16, 'sine', 90, 40, 0.3, 0.3, 0.002);
    return 0.8;
  }, 0.1, 2, { tuned: true, rev: 0.4 }),

  skim: S((t, p, o) => {
    noise(o, t, 0.08, 'bandpass', 4200 * p, 2200 * p, 3, 0.1, 0.002);
    crackle(o, t, 0.06, 3, 0.06);
    return 0.09;
  }, 0.06, 2, { low: true }),

  boost: S((t, p, o) => {
    noise(o, t, 0.5, 'bandpass', 300 * p, 2400 * p, 1.2, 0.3, 0.02);
    tone(o, t, 'sawtooth', 70 * p, 160 * p, 0.4, 0.12, 0.01);
    tone(o, t, 'sine', 60 * p, 30 * p, 0.25, 0.3, 0.002);
    return 0.5;
  }, 0.15, 2),

  risk_up: S((t, p, o) => {
    const f = mtof(76) * p;
    tone(o, t, pulse25, f, f, 0.08, 0.06, 0.002);
    tone(o, t + 0.06, pulse25, f * 1.5, f * 1.5, 0.16, 0.07, 0.002);
    tone(o, t + 0.06, 'triangle', f * 3, f * 3, 0.2, 0.04, 0.002);
    return 0.25;
  }, 0.1, 2, { tuned: true }),

  risk_lost: S((t, p, o) => {
    const f = mtof(64) * p;
    tone(o, t, 'square', f, f * 0.5, 0.35, 0.06, 0.002, 0.3);
    tone(o, t + 0.05, 'triangle', f * 0.75, f * 0.37, 0.35, 0.08, 0.002, 0.3);
    return 0.4;
  }, 0.2, 1, { tuned: true }),

  point_blank: S((t, p, o) => {
    tone(o, t, 'sine', 180 * p, 40 * p, 0.18, 0.4, 0.001, 0.1);
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.3);
    tone(o, t, 'square', 2600 * p, 2400 * p, 0.06, 0.04, 0.001);
    return 0.2;
  }, 0.05, 3),

  overheat: S((t, p, o) => {
    noise(o, t, 0.6, 'highpass', 2500, 1800, 0.7, 0.12, 0.04);
    tone(o, t, 'square', 880 * p, 880 * p, 0.08, 0.055, 0.003);
    tone(o, t + 0.12, 'square', 660 * p, 660 * p, 0.12, 0.055, 0.003);
    return 0.62;
  }, 0.4, 2),

  pickup_scrap: S((t, p, o) => {
    combo = t - lastScrap < 0.55 ? Math.min(combo + 1, 14) : 0;
    lastScrap = t;
    const semi = Math.floor(combo / 5) * 12 + PENTA[combo % 5];
    const f = mtof(79 + semi) * p;
    tone(o, t, 'triangle', f, f, 0.12, 0.15, 0.002);
    tone(o, t, pulse12, f, f, 0.07, 0.045, 0.002);
    tone(o, t + 0.035, 'sine', f * 1.5, f * 1.5, 0.09, 0.055, 0.002);
    return 0.14;
  }, 0.035, 5, { low: true, tuned: true }),

  pickup_part: S((t, p, o) => {
    const notes = [0, 4, 7, 12, 16];
    notes.forEach((n, i) => {
      const f = mtof(72 + n) * p;
      const last = i === notes.length - 1;
      tone(o, t + i * 0.05, 'triangle', f, f, last ? 0.4 : 0.13, 0.13, 0.002);
      tone(o, t + i * 0.05, pulse25, f, f, last ? 0.3 : 0.1, 0.04, 0.002);
    });
    noise(o, t + 0.2, 0.3, 'highpass', 7000, 9000, 0.7, 0.04, 0.02);
    return 0.62;
  }, 0.1, 2, { tuned: true, rev: 0.15 }),

  heal: S((t, p, o) => {
    for (const n of [0, 4, 7]) {
      const f = mtof(72 + n) * p;
      tone(o, t, 'sine', f * 0.5, f, 0.55, 0.09, 0.08, 0.2);
      tone(o, t + 0.1, 'triangle', f * 2, f * 2, 0.4, 0.025, 0.05);
    }
    return 0.6;
  }, 0.2, 2, { tuned: true, rev: 0.2 }),

  special_bomb: S((t, p, o) => {
    tone(o, t, 'sine', 130 * p, 24 * p, 1.4, 0.42, 0.005, 0.9);
    noise(o, t, 1.6, 'lowpass', 5000 * p, 120, 0.9, 0.36, 0.005);
    noise(o, t, 0.08, 'highpass', 2000, 2000, 0.7, 0.28);
    crackle(o, t + 0.05, 1.0, 22, 0.14);
    return 1.7;
  }, 0.2, 2, { rev: 0.35 }),

  special_phase: S((t, p, o) => {
    tone(o, t, 'sine', 200 * p, 1600 * p, 0.32, 0.11, 0.02);
    tone(o, t, 'sine', 203 * p, 1615 * p, 0.32, 0.11, 0.02);
    tone(o, t + 0.22, 'triangle', 1600 * p, 300 * p, 0.35, 0.07, 0.02);
    noise(o, t, 0.5, 'bandpass', 3000, 8000, 6, 0.07, 0.05);
    return 0.6;
  }, 0.2, 2, { rev: 0.25 }),

  special_emp: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2500);
    tone(lp, t, 'square', 82 * p, 60 * p, 0.6, 0.13, 0.003);
    tone(lp, t, 'sawtooth', 123 * p, 90 * p, 0.6, 0.08, 0.003);
    tone(o, t, 'sine', 400 * p, 4000 * p, 0.22, 0.08, 0.005);
    noise(o, t, 0.06, 'highpass', 3000, 3000, 0.7, 0.24);
    crackle(o, t, 0.5, 18, 0.15);
    return 0.65;
  }, 0.2, 2, { rev: 0.2 }),

  special_overdrive: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2600);
    tone(lp, t, 'sawtooth', 70 * p, 280 * p, 0.7, 0.15, 0.02, 0.6);
    tone(lp, t, 'sawtooth', 71 * p, 283 * p, 0.7, 0.11, 0.02, 0.6);
    noise(o, t, 0.6, 'bandpass', 400 * p, 2400 * p, 1.2, 0.14, 0.05);
    tone(o, t + 0.45, 'square', 880 * p, 1760 * p, 0.18, 0.045, 0.005);
    return 0.75;
  }, 0.2, 2),

  special_ready: S((t, p, o) => {
    tone(o, t, 'sine', 1318 * p, 1318 * p, 0.14, 0.12, 0.003);
    tone(o, t, 'triangle', 2636 * p, 2636 * p, 0.08, 0.03, 0.003);
    tone(o, t + 0.09, 'sine', 1760 * p, 1760 * p, 0.28, 0.12, 0.003);
    tone(o, t + 0.09, 'triangle', 3520 * p, 3520 * p, 0.12, 0.025, 0.003);
    return 0.4;
  }, 0.2, 2, { tuned: true }),

  laser_charge: S((t, p, o) => {
    const osc = tone(o, t, 'sine', 180 * p, 1500 * p, 0.9, 0.1, 0.3, 0.85);
    const l = ctx.createOscillator();
    l.frequency.value = 18;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(60 * p, t + 0.85);
    l.connect(lg).connect(osc.frequency);
    l.start(t);
    l.stop(t + 0.95);
    noise(o, t, 0.9, 'bandpass', 800 * p, 5000 * p, 5, 0.07, 0.6);
    return 0.95;
  }, 0.1, 3),

  laser_fire: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2400);
    tone(lp, t, 'sawtooth', 110 * p, 95 * p, 0.75, 0.16, 0.004);
    tone(lp, t, 'sawtooth', 165 * p, 140 * p, 0.75, 0.11, 0.004);
    noise(o, t, 0.6, 'bandpass', 1400 * p, 700 * p, 1, 0.18, 0.004);
    tone(o, t, 'sine', 90 * p, 40 * p, 0.4, 0.3, 0.003);
    return 0.8;
  }, 0.1, 3, { rev: 0.15 }),

  lightning: S((t, p, o) => {
    noise(o, t, 0.09, 'highpass', 1800, 1200, 0.7, 0.42, 0.001);
    crackle(o, t, 0.25, 12, 0.2);
    noise(o, t + 0.05, 1.8, 'lowpass', 380 * p, 110, 0.8, 0.32, 0.15);
    return 1.9;
  }, 0.2, 2, { rev: 0.4 }),

  geyser: S((t, p, o) => {
    noise(o, t, 0.9, 'bandpass', 300 * p, 1600 * p, 1.2, 0.24, 0.15);
    noise(o, t, 1.1, 'lowpass', 220 * p, 150, 0.8, 0.22, 0.05);
    return 1.15;
  }, 0.2, 3),

  crash: S((t, p, o) => {
    noise(o, t, 0.45, 'lowpass', 1800 * p, 250, 0.8, 0.34, 0.002);
    tone(o, t, 'sine', 100 * p, 30 * p, 0.4, 0.34, 0.002);
    const bp = filt(o, 'bandpass', 1800, 4);
    tone(bp, t, 'square', 620 * p, 600 * p, 0.3, 0.14, 0.001);
    tone(bp, t, 'square', 910 * p, 890 * p, 0.25, 0.1, 0.001);
    crackle(o, t, 0.3, 10, 0.14);
    return 0.5;
  }, 0.1, 3),

  warp: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 3000);
    tone(lp, t, 'sawtooth', 90 * p, 1800 * p, 1.2, 0.12, 0.2, 1.1);
    tone(o, t, 'sine', 180 * p, 3600 * p, 1.2, 0.07, 0.2, 1.1);
    noise(o, t, 1.3, 'bandpass', 300 * p, 7000 * p, 2, 0.16, 0.4);
    tone(o, t + 1.0, 'sine', 60 * p, 30 * p, 0.5, 0.3, 0.005);
    return 1.55;
  }, 0.5, 1, { rev: 0.3 }),

  boss_warning: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1800);
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.55;
      tone(lp, tt, 'sawtooth', 560 * p, 420 * p, 0.45, 0.13, 0.02);
      tone(lp, tt, 'square', 280 * p, 210 * p, 0.45, 0.07, 0.02);
    }
    tone(o, t, 'sine', 55 * p, 50 * p, 1.8, 0.22, 0.3);
    return 1.9;
  }, 1, 1, { rev: 0.3, tuned: true }),

  level_clear: S((t, p, o) => {
    [0, 4, 7, 12].forEach((n, i) => {
      const f = mtof(72 + n) * p;
      tone(o, t + i * 0.09, pulse25, f, f, 0.12, 0.06, 0.002);
      tone(o, t + i * 0.09, 'triangle', f, f, 0.14, 0.12, 0.002);
    });
    for (const n of [12, 16, 19]) {
      const f = mtof(72 + n) * p;
      tone(o, t + 0.36, pulse25, f, f, 0.8, 0.035, 0.005);
      tone(o, t + 0.36, 'triangle', f, f, 0.9, 0.07, 0.005);
    }
    noise(o, t + 0.36, 0.6, 'highpass', 7000, 9000, 0.7, 0.04, 0.02);
    return 1.3;
  }, 1, 1, { tuned: true, rev: 0.25 }),

  ui_move: S((t, p, o) => {
    tone(o, t, pulse25, 1200 * p, 1200 * p, 0.03, 0.05, 0.001);
    return 0.04;
  }, 0.03, 3, { tuned: true }),

  ui_select: S((t, p, o) => {
    tone(o, t, 'square', 880 * p, 880 * p, 0.05, 0.05, 0.001);
    tone(o, t + 0.05, 'square', 1320 * p, 1320 * p, 0.08, 0.05, 0.001);
    return 0.14;
  }, 0.03, 3, { tuned: true }),

  ui_back: S((t, p, o) => {
    tone(o, t, 'square', 1100 * p, 1100 * p, 0.05, 0.045, 0.001);
    tone(o, t + 0.05, 'square', 740 * p, 740 * p, 0.08, 0.045, 0.001);
    return 0.14;
  }, 0.03, 3, { tuned: true }),

  ui_error: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1200);
    tone(lp, t, 'square', 150 * p, 150 * p, 0.18, 0.1, 0.003);
    tone(lp, t, 'square', 156 * p, 156 * p, 0.18, 0.1, 0.003);
    return 0.2;
  }, 0.08, 2, { tuned: true }),

  ui_place: S((t, p, o) => {
    tone(o, t, 'triangle', 320 * p, 140 * p, 0.07, 0.2, 0.001);
    noise(o, t, 0.02, 'bandpass', 2500, 2500, 1, 0.12);
    return 0.08;
  }, 0.03, 3),

  // a card turning over: a papery flick and a little rising blip
  card_flip: S((t, p, o) => {
    noise(o, t, 0.06, 'bandpass', 3800 * p, 1800 * p, 1.2, 0.09, 0.002);
    tone(o, t + 0.02, 'triangle', 520 * p, 780 * p, 0.07, 0.07, 0.002, 0.05);
    return 0.1;
  }, 0.05, 4, { tuned: true }),

  // an epic part: a bright shimmer up an arpeggio
  loot_epic: S((t, p, o) => {
    [0, 7, 12, 19].forEach((n, i) => {
      const f = mtof(76 + n) * p;
      tone(o, t + i * 0.04, 'sine', f, f, 0.35, 0.06, 0.003);
      tone(o, t + i * 0.04, pulse25, f * 2, f * 2, 0.12, 0.015, 0.002);
    });
    noise(o, t + 0.1, 0.5, 'highpass', 8000, 11000, 0.7, 0.03, 0.05);
    return 0.6;
  }, 0.2, 1, { tuned: true, rev: 0.35 }),

  // a legendary: a low swell, a brass-ish chord, a long glittering tail
  loot_legendary: S((t, p, o) => {
    tone(o, t, 'sine', 55 * p, 110 * p, 0.9, 0.18, 0.25, 0.6);
    const chord = [0, 4, 7, 11, 14];
    chord.forEach((n, i) => {
      const f = mtof(64 + n) * p;
      tone(o, t + 0.12 + i * 0.05, 'sawtooth', f, f, 1.1, 0.025, 0.04);
      tone(o, t + 0.12 + i * 0.05, 'triangle', f * 2, f * 2, 1.3, 0.05, 0.01);
    });
    [24, 28, 31, 36].forEach((n, i) => {
      const f = mtof(64 + n) * p;
      tone(o, t + 0.5 + i * 0.09, 'sine', f, f, 0.5, 0.035, 0.002);
    });
    noise(o, t + 0.3, 1.4, 'highpass', 6000, 12000, 0.6, 0.035, 0.2);
    return 1.8;
  }, 1, 1, { tuned: true, rev: 0.5 }),

  // --- legendary traits in flight -----------------------------------------------------------

  /** A SENTINEL dropped: a heavy clamp, servos, and a rising ready-beep. */
  sentinel: S((t, p, o) => {
    tone(o, t, 'square', 180 * p, 70 * p, 0.06, 0.14, 0.001);
    noise(o, t, 0.05, 'bandpass', 2200 * p, 900 * p, 2, 0.12);
    tone(filt(o, 'bandpass', 1400 * p, 3), t + 0.04, 'sawtooth', 300 * p, 900 * p, 0.14, 0.05, 0.01);
    tone(o, t + 0.16, pulse25, 1320 * p, 1320 * p, 0.05, 0.04, 0.001);
    tone(o, t + 0.22, pulse25, 1760 * p, 1760 * p, 0.08, 0.04, 0.001);
    return 0.32;
  }, 0.06, 3, { tuned: true }),

  /** A sentinel winks out: a falling servo and a puff. */
  sentinel_out: S((t, p, o) => {
    tone(filt(o, 'bandpass', 1200 * p, 2), t, 'sawtooth', 700 * p, 160 * p, 0.16, 0.04, 0.005);
    noise(o, t + 0.04, 0.12, 'lowpass', 1800 * p, 400 * p, 0.8, 0.06);
    return 0.2;
  }, 0.08, 2, { low: true }),

  /** A BOOMERANG shot turning: a short swish. */
  boomerang: S((t, p, o) => {
    noise(o, t, 0.12, 'bandpass', 1400 * p, 3800 * p, 3, 0.05, 0.03);
    return 0.13;
  }, 0.07, 2, { low: true }),

  /** FRENZIED, one more: a click up the scale (pitched by the stack). */
  frenzy: S((t, p, o) => {
    tone(o, t, 'square', 660 * p, 990 * p, 0.05, 0.05, 0.001);
    tone(o, t, 'triangle', 1320 * p, 1320 * p, 0.08, 0.04, 0.001);
    return 0.1;
  }, 0.04, 2, { tuned: true }),

  /** FRENZIED, all six: a snarling rise. */
  frenzy_max: S((t, p, o) => {
    tone(filt(o, 'lowpass', 2400 * p, 4), t, 'sawtooth', 110 * p, 440 * p, 0.3, 0.12, 0.01);
    tone(o, t + 0.05, 'square', 880 * p, 1760 * p, 0.2, 0.05, 0.002);
    noise(o, t, 0.3, 'bandpass', 600 * p, 3000 * p, 1.5, 0.08, 0.04);
    return 0.4;
  }, 0.3, 1),

  /** The frenzy cools off: a hiss down. */
  frenzy_off: S((t, p, o) => {
    noise(o, t, 0.35, 'highpass', 5000 * p, 1200 * p, 0.7, 0.05, 0.01);
    tone(o, t, 'triangle', 700 * p, 300 * p, 0.2, 0.03, 0.002);
    return 0.36;
  }, 0.3, 1, { low: true }),

  /** THUNDEROUS: a crack of thunder, a thump and a crackling tail. */
  thunder: S((t, p, o) => {
    noise(o, t, 0.05, 'highpass', 2600, 1800, 0.7, 0.4, 0.001);
    boom(o, t, p * 0.8, 0.6, 0.32);
    crackle(o, t + 0.02, 0.3, 14, 0.18);
    noise(o, t + 0.06, 0.9, 'lowpass', 500 * p, 90, 0.8, 0.22, 0.05);
    return 1;
  }, 0.08, 2, { rev: 0.35 }),

  /** VENGEFUL: the hull lets go: a deep whump, a ring of shrapnel whistling out. */
  nova: S((t, p, o) => {
    boom(o, t, p * 0.7, 0.8, 0.36);
    tone(o, t, 'sine', 70 * p, 30 * p, 0.6, 0.3, 0.002);
    for (let i = 0; i < 6; i++) {
      const f = (1600 + Math.random() * 1800) * p;
      tone(o, t + 0.03 + i * 0.02, 'sine', f, f * 0.6, 0.2, 0.025, 0.002);
    }
    return 0.8;
  }, 0.2, 1, { rev: 0.3 }),

  /** RAVENOUS: a kill's spark drunk by the special: a soft rising chime. */
  feed: S((t, p, o) => {
    const f = mtof(88) * p;
    tone(o, t, 'sine', f * 0.75, f, 0.14, 0.04, 0.004);
    tone(o, t + 0.03, 'triangle', f * 1.5, f * 1.5, 0.1, 0.015, 0.002);
    return 0.17;
  }, 0.05, 3, { tuned: true, low: true }),

  ui_buy: S((t, p, o) => {
    tone(o, t, 'square', 988 * p, 988 * p, 0.07, 0.06, 0.001);
    tone(o, t + 0.07, 'square', 1319 * p, 1319 * p, 0.25, 0.06, 0.001);
    return 0.33;
  }, 0.05, 2, { tuned: true }),
};

const VOICE_CAP = 28;
const voices: { name: Sfx; end: number }[] = [];
const lastPlay = new Map<Sfx, number>();
/** Nodes to disconnect once their sound is over. */
const trash: { at: number; nodes: AudioNode[] }[] = [];

function playSfx(name: Sfx, opts?: { pan?: number; pitch?: number; vol?: number }) {
  const def = SFX[name];
  const now = ctx.currentTime;
  if (now - (lastPlay.get(name) ?? -9) < def.gap) return;
  let n = 0;
  for (let i = voices.length - 1; i >= 0; i--) {
    if (voices[i].end <= now) voices.splice(i, 1);
    else if (voices[i].name === name) n++;
  }
  if (n >= def.max) return;
  if (voices.length >= VOICE_CAP && def.low) return;
  const vol = clamp(opts?.vol ?? 1, 0, 1);
  if (vol <= 0.001) return;
  lastPlay.set(name, now);

  const pitch = clamp(opts?.pitch ?? 1, 0.1, 4) * (def.tuned ? 1 : 1 + (Math.random() * 2 - 1) * 0.045);
  const out = ctx.createGain();
  out.gain.value = vol;
  const pan = ctx.createStereoPanner();
  pan.pan.value = clamp(opts?.pan ?? 0, -1, 1) * 0.8;
  out.connect(pan).connect(sfxBus);
  const nodes: AudioNode[] = [out, pan];
  if (def.rev) {
    const s = ctx.createGain();
    s.gain.value = def.rev;
    pan.connect(s).connect(sfxVerb);
    nodes.push(s);
  }
  const t = now + 0.005;
  const dur = def.fn(t, pitch, out);
  voices.push({ name, end: t + dur });
  trash.push({ at: t + dur + 0.5, nodes });
}

// ================================================================================================
// Loops
// ================================================================================================

interface LoopVoice {
  out: GainNode;
  lvl: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  set: (i: number) => void;
  on: boolean;
  offAt: number;
  lastI: number;
}
const loops = new Map<string, LoopVoice>();
const loopWant = new Map<string, { name: Loop; on: boolean; i: number }>();

function makeLoop(name: Loop): LoopVoice {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(sfxBus);
  const lvl = ctx.createGain();
  lvl.gain.value = 0;
  lvl.connect(out);
  const srcs: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [out, lvl];
  const osc = (w: Wave, f: number, to: AudioNode | AudioParam, gain: number, detune = 0) => {
    const o = ctx.createOscillator();
    setWave(o, w);
    o.frequency.value = f;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    if (to instanceof AudioParam) g.connect(to);
    else g.connect(to);
    srcs.push(o);
    nodes.push(g);
    return o;
  };
  const nz = (to: AudioNode, gain: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(to);
    srcs.push(s);
    nodes.push(g);
    return s;
  };
  const bq = (type: BiquadFilterType, f: number, q: number, to: AudioNode) => {
    const b = filt(to, type, f, q);
    nodes.push(b);
    return b;
  };
  let set: (i: number) => void;

  if (name === 'beam') {
    // ion lance: buzzing detuned saws through a wobbling resonant lowpass, plus sizzle
    const lp = bq('lowpass', 900, 6, lvl);
    const o1 = osc('sawtooth', 110, lp, 0.35);
    const o2 = osc('sawtooth', 110, lp, 0.35, 12);
    osc('square', 55, lp, 0.25);
    const wob = osc('sine', 13, lp.frequency, 350);
    nz(bq('bandpass', 2600, 1.5, lvl), 0.12);
    set = (i) => {
      lp.frequency.setTargetAtTime(700 + 1800 * i, ctx.currentTime, 0.05);
      o1.frequency.setTargetAtTime(105 + 20 * i, ctx.currentTime, 0.05);
      o2.frequency.setTargetAtTime(105 + 20 * i, ctx.currentTime, 0.05);
      wob.frequency.setTargetAtTime(10 + 8 * i, ctx.currentTime, 0.05);
      lvl.gain.setTargetAtTime(0.12 * (0.6 + 0.4 * i), ctx.currentTime, 0.03);
    };
  } else if (name === 'flame') {
    // plasma torch: roaring band of noise with a fast flutter, plus a low rumble
    const flutter = ctx.createGain();
    flutter.gain.value = 0.7;
    flutter.connect(lvl);
    nodes.push(flutter);
    osc('sine', 17, flutter.gain, 0.3);
    const bp = bq('bandpass', 900, 0.7, flutter);
    nz(bp, 0.9);
    nz(bq('lowpass', 260, 0.7, lvl), 0.8);
    set = (i) => {
      bp.frequency.setTargetAtTime(700 + 900 * i, ctx.currentTime, 0.05);
      lvl.gain.setTargetAtTime(0.16 * (0.5 + 0.5 * i), ctx.currentTime, 0.03);
    };
  } else if (name === 'wind') {
    // boosting: air tearing past, a band of noise that opens up the harder you push
    const bp = bq('bandpass', 500, 0.8, lvl);
    nz(bp, 1);
    const hp = bq('highpass', 3000, 0.7, lvl);
    nz(hp, 0.25);
    osc('sine', 5.3, bp.frequency, 120);
    set = (i) => {
      const n = ctx.currentTime;
      bp.frequency.setTargetAtTime(400 + 1600 * i, n, 0.08);
      lvl.gain.setTargetAtTime(0.18 * i, n, 0.06);
    };
  } else {
    // engine: soft low hum that rises with thrust
    const lp = bq('lowpass', 400, 1, lvl);
    const o1 = osc('triangle', 52, lp, 0.6);
    const o2 = osc('sawtooth', 78, lp, 0.25, 5);
    osc('sine', 0.4, o1.frequency, 1.5);
    const nlp = bq('lowpass', 600, 0.7, lvl);
    nz(nlp, 0.12);
    set = (i) => {
      const n = ctx.currentTime;
      o1.frequency.setTargetAtTime(52 * (1 + 0.6 * i), n, 0.12);
      o2.frequency.setTargetAtTime(78 * (1 + 0.6 * i), n, 0.12);
      lp.frequency.setTargetAtTime(300 + 700 * i, n, 0.12);
      nlp.frequency.setTargetAtTime(500 + 1200 * i, n, 0.12);
      lvl.gain.setTargetAtTime(0.05 + 0.06 * i, n, 0.1);
    };
  }
  for (const s of srcs) s.start(now);
  return { out, lvl, srcs, nodes, set, on: false, offAt: 0, lastI: -1 };
}

function applyLoop(key: string) {
  const w = loopWant.get(key);
  if (!w) return;
  const now = ctx.currentTime;
  let v = loops.get(key);
  if (w.on) {
    if (!v) {
      v = makeLoop(w.name);
      loops.set(key, v);
    }
    if (!v.on) {
      v.on = true;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(1, now, 0.03);
    }
    if (Math.abs(w.i - v.lastI) > 0.02) {
      v.lastI = w.i;
      v.set(w.i);
    }
  } else {
    loopWant.delete(key);
    if (v && v.on) {
      v.on = false;
      v.offAt = now;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(0, now, 0.04);
    }
  }
}

// ================================================================================================
// Music: data
// ================================================================================================

type Inst =
  // leads / arps
  | 'pulse' | 'pulse12' | 'saw' | 'flute' | 'bell' | 'steel' | 'marimba' | 'oud' | 'brass' | 'theremin' | 'keys' | 'pluck'
  // basses
  | 'sub' | 'bsaw' | 'dist' | 'bpulse'
  // pads
  | 'warm' | 'sawpad' | 'eerie' | 'cold' | 'dark';
type BassStyle = 'pulse8' | 'long' | 'oct' | 'tribal' | 'riff' | 'march' | 'offbeat' | 'grind' | 'funk' | 'gallop';
type DrumVoice = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'tomLo' | 'tomHi' | 'shaker' | 'rim' | 'metal' | 'doum' | 'tek' | 'conga';
/** 16 chars a bar: '.' rest, digit d = plays when intensity >= d/4. An array alternates per bar. */
type Drums = Partial<Record<DrumVoice, string | string[]>>;
type Chan = 'lead' | 'bass' | 'pad' | 'arp' | 'drum' | 'snr';

interface TrackDef {
  bpm: number;
  /** Bass root (MIDI). */
  root: number;
  scale: number[];
  swing?: number;
  /** Chord roots as scale degrees, 4 or 8 bars. */
  progA: number[];
  progB: number[];
  lead: Inst;
  leadOct: number;
  /** 0..1: how busy the melody is. */
  density: number;
  /** Double the lead an octave up at high intensity. */
  dbl?: boolean;
  bass: Inst;
  bassStyle: BassStyle;
  /** Below this intensity the bass holds long notes instead of its pattern. */
  bassLong?: number;
  pad: Inst | null;
  padOct: number;
  arp: Inst | null;
  arpOct: number;
  /** Steps per arp note. */
  arpRate: number;
  arpAt: number;
  arpStyle: 'up' | 'down' | 'updown' | 'broken';
  drums: Drums;
  fill?: Drums;
  crash?: boolean;
  kick?: [number, number, number];
  minI: number;
  mix?: Partial<Record<Chan, number>>;
  rev?: Partial<Record<Chan, number>>;
  dly?: Partial<Record<Chan, number>>;
}

const SC = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixo: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygDom: [0, 1, 4, 5, 7, 8, 10],
  harmMinor: [0, 2, 3, 5, 7, 8, 11],
  whole: [0, 2, 4, 6, 8, 10],
};

const MIX: Record<Chan, number> = { lead: 0.16, bass: 0.26, pad: 0.07, arp: 0.065, drum: 0.42, snr: 0.3 };
const REV: Record<Chan, number> = { lead: 0.25, bass: 0, pad: 0.35, arp: 0.25, drum: 0.04, snr: 0.3 };
const DLY: Record<Chan, number> = { lead: 0.18, bass: 0, pad: 0, arp: 0.15, drum: 0, snr: 0 };

const TRACKS: Record<Track, TrackDef> = {
  // Heroic synthwave: A minor, driving octave bass, saw lead.
  title: {
    bpm: 112, root: 45, scale: SC.aeolian, progA: [0, 5, 2, 6], progB: [3, 4, 0, 5, 3, 4, 6, 6],
    lead: 'saw', leadOct: 24, density: 0.55, dbl: true,
    bass: 'bsaw', bassStyle: 'oct', pad: 'sawpad', padOct: 12,
    arp: 'pulse12', arpOct: 24, arpRate: 1, arpAt: 0.5, arpStyle: 'updown',
    drums: {
      kick: '0...1...0...1.2.', snare: '....0.......0...', clap: '....2.......2...',
      hat: '1313131313131313', ohat: '..............2.',
    },
    fill: { snare: '....0...0.0.0000', tomHi: '........2.2.....', tomLo: '............2.2.' },
    crash: true, kick: [140, 42, 0.35], minI: 0.3,
    rev: { snr: 0.45 },
  },
  // Star map: calm D dorian, plucked arps, soft pulse lead.
  map: {
    bpm: 88, root: 38, scale: SC.dorian, progA: [0, 3, 0, 3], progB: [2, 6, 3, 0],
    lead: 'pulse', leadOct: 24, density: 0.35,
    bass: 'sub', bassStyle: 'pulse8', bassLong: 0.3, pad: 'warm', padOct: 12,
    arp: 'pluck', arpOct: 24, arpRate: 2, arpAt: 0, arpStyle: 'up',
    drums: { kick: '0.........0.....', rim: '....1.......1...', shaker: '2.2.2.2.2.2.2.2.' },
    minI: 0, mix: { lead: 0.12 }, dly: { lead: 0.25, arp: 0.25 },
  },
  // Hangar: lazy swung workshop groove, F mixolydian, EP keys and funky pulse bass.
  hangar: {
    bpm: 98, root: 41, scale: SC.mixo, swing: 0.14, progA: [0, 6, 3, 0], progB: [1, 4, 2, 5],
    lead: 'keys', leadOct: 24, density: 0.45,
    bass: 'bpulse', bassStyle: 'funk', pad: 'warm', padOct: 12,
    arp: 'marimba', arpOct: 24, arpRate: 2, arpAt: 0.45, arpStyle: 'broken',
    drums: {
      kick: ['0......0..0.....', '0......0..0..1..'], snare: '....0.......0...',
      hat: '1.1.1.1.1.1.1.1.', rim: '.......1........', ohat: '..............2.',
    },
    minI: 0.25, mix: { lead: 0.17 },
  },
  // Boss: E harmonic minor at 150, galloping distorted bass, everything on.
  boss: {
    bpm: 150, root: 40, scale: SC.harmMinor, progA: [0, 0, 5, 4], progB: [3, 4, 0, 5, 3, 4, 5, 4],
    lead: 'saw', leadOct: 24, density: 0.7, dbl: true,
    bass: 'dist', bassStyle: 'gallop', pad: 'dark', padOct: 12,
    arp: 'pulse12', arpOct: 36, arpRate: 1, arpAt: 0.6, arpStyle: 'up',
    drums: {
      kick: '0..20...0..20.2.', snare: '....0.......0...', clap: '....1.......1...',
      hat: '1212121212121212', ohat: '..3...3...3...3.',
    },
    fill: { snare: '....0...00000000', tomLo: '..........0..0..' },
    crash: true, kick: [160, 45, 0.3], minI: 0.6,
  },
  // Oru-Tal: tribal toms, warm G lydian flute over marimba.
  orutal: {
    bpm: 104, root: 43, scale: SC.lydian, progA: [0, 1, 0, 1], progB: [5, 4, 1, 0],
    lead: 'flute', leadOct: 24, density: 0.45,
    bass: 'sub', bassStyle: 'tribal', pad: 'warm', padOct: 12,
    arp: 'marimba', arpOct: 24, arpRate: 2, arpAt: 0.45, arpStyle: 'broken',
    drums: {
      tomLo: '0..1..0...0.1...', tomHi: '........0.....1.', kick: '1.......1.......',
      shaker: '2.22.22.2.22.22.', conga: '..1..1.....1..1.', clap: '....3.......3...',
    },
    fill: { tomHi: '........0.0.0.00', tomLo: '0.0.0.0.0.0.....' },
    minI: 0.1, mix: { lead: 0.17 },
  },
  // Halcyon: slow sunset synthwave, D major, half-time drums drenched in reverb.
  halcyon: {
    bpm: 84, root: 38, scale: SC.ionian, progA: [5, 3, 0, 4], progB: [1, 4, 0, 5, 3, 4, 5, 4],
    lead: 'saw', leadOct: 24, density: 0.35,
    bass: 'bsaw', bassStyle: 'oct', bassLong: 0.25, pad: 'sawpad', padOct: 12,
    arp: 'pulse', arpOct: 24, arpRate: 2, arpAt: 0.4, arpStyle: 'up',
    drums: {
      kick: '0.........1.....', snare: '........0.......', clap: '........2.......',
      hat: '1313131313131313', ohat: '......2.......2.',
    },
    fill: { snare: '........0...0.00' },
    crash: true, minI: 0.1,
    rev: { lead: 0.4, snr: 0.6, pad: 0.45 }, dly: { lead: 0.3 },
  },
  // Kessra: E phrygian dominant desert riff, oud pluck, darbuka.
  kessra: {
    bpm: 124, root: 40, scale: SC.phrygDom, progA: [0, 0, 1, 0], progB: [5, 1, 6, 0],
    lead: 'oud', leadOct: 24, density: 0.65,
    bass: 'bsaw', bassStyle: 'riff', pad: 'warm', padOct: 12,
    arp: 'pluck', arpOct: 24, arpRate: 1, arpAt: 0.65, arpStyle: 'broken',
    drums: {
      doum: '0.......0.......', tek: '..0...0.....0...', conga: '.....1.....1..1.',
      kick: '2.......2.....2.', hat: '3.3.3.3.3.3.3.3.', shaker: '..1...1...1...1.',
    },
    fill: { tek: '..0.0.0.00000000' },
    minI: 0.1, mix: { lead: 0.18, pad: 0.05 },
  },
  // Mirefall: eerie whole-tone pads, theremin, a heartbeat.
  mirefall: {
    bpm: 72, root: 39, scale: SC.whole, progA: [0, 1, 0, 5], progB: [2, 3, 4, 3],
    lead: 'theremin', leadOct: 24, density: 0.25,
    bass: 'sub', bassStyle: 'long', pad: 'eerie', padOct: 12,
    arp: 'bell', arpOct: 36, arpRate: 2, arpAt: 0.4, arpStyle: 'updown',
    drums: {
      kick: '0..0............', rim: '........1.......', shaker: '..2...2...2...2.',
      hat: '3.3.3.3.3.3.3.3.', tomLo: '..........2.....',
    },
    minI: 0, mix: { lead: 0.13, pad: 0.08, arp: 0.05 }, rev: { lead: 0.45, arp: 0.5 }, dly: { lead: 0.3 },
  },
  // Glacis: crystalline bells over a dark B minor pulse.
  glacis: {
    bpm: 100, root: 35, scale: SC.aeolian, progA: [0, 5, 3, 4], progB: [2, 6, 5, 4],
    lead: 'bell', leadOct: 36, density: 0.3,
    bass: 'bpulse', bassStyle: 'pulse8', pad: 'cold', padOct: 24,
    arp: 'bell', arpOct: 36, arpRate: 2, arpAt: 0, arpStyle: 'updown',
    drums: {
      kick: '0.....1...0.....', rim: '....0.......0...', snare: '....1.......1...',
      hat: '2323232323232323', ohat: '..............3.',
    },
    fill: { snare: '....1.......1111' },
    crash: true, minI: 0.1, mix: { arp: 0.045, lead: 0.15 }, rev: { lead: 0.45, arp: 0.4, snr: 0.5 },
  },
  // Ashgrave: industrial grind, D phrygian, clanging metal.
  ashgrave: {
    bpm: 132, root: 38, scale: SC.phrygian, progA: [0, 0, 1, 0], progB: [5, 6, 0, 1],
    lead: 'saw', leadOct: 24, density: 0.4,
    bass: 'dist', bassStyle: 'grind', pad: 'dark', padOct: 12,
    arp: 'pulse12', arpOct: 24, arpRate: 1, arpAt: 0.7, arpStyle: 'down',
    drums: {
      kick: '0..30...0..30...', metal: '..1...1...1...1.', snare: '....1.......1...',
      clap: '....3.......3..3', hat: '2222222222222222',
    },
    fill: { metal: '..1.1.1.11111111', snare: '....1...1.1.1111' },
    crash: true, kick: [120, 38, 0.4], minI: 0.2,
  },
  // Vesh: bright tropical D major, steel drum, marimba, dembow.
  vesh: {
    bpm: 116, root: 38, scale: SC.ionian, progA: [0, 4, 5, 3], progB: [3, 4, 2, 5, 3, 4, 0, 0],
    lead: 'steel', leadOct: 24, density: 0.55,
    bass: 'sub', bassStyle: 'offbeat', pad: 'warm', padOct: 12,
    arp: 'marimba', arpOct: 24, arpRate: 2, arpAt: 0, arpStyle: 'broken',
    drums: {
      kick: '0...0...0...0...', rim: '...0..0....0..0.', clap: '...2..2....2..2.',
      shaker: '1212121212121212', conga: '..1.....1.1...1.',
    },
    fill: { conga: '........1.1.1111' },
    minI: 0.15, mix: { pad: 0.045, lead: 0.17 },
  },
  // Cinder: corporate march, C harmonic minor, distorted oom-pah bass, brass.
  cinder: {
    bpm: 112, root: 36, scale: SC.harmMinor, progA: [0, 3, 4, 0], progB: [5, 1, 4, 4],
    lead: 'brass', leadOct: 24, density: 0.45,
    bass: 'dist', bassStyle: 'march', pad: 'sawpad', padOct: 12,
    arp: 'pulse', arpOct: 24, arpRate: 2, arpAt: 0.55, arpStyle: 'up',
    drums: {
      kick: '0.......0.......', snare: '..1.0..1..1.0.11', hat: '2.2.2.2.2.2.2.2.', metal: '....3.......3...',
    },
    fill: { snare: '0.1.0.110.1.0000' },
    crash: true, minI: 0.2,
  },
};

// ================================================================================================
// Music: generation (seeded, deterministic)
// ================================================================================================

type Rng = () => number;
function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)];

/** A note: step in bar, length in steps, scale degree, velocity, intensity window [lvl, hi). */
interface Ev { s: number; len: number; d: number; v: number; lvl: number; hi: number }
const E = (s: number, len: number, d: number, v = 1, lvl = 0, hi = 9): Ev => ({ s, len, d, v, lvl, hi });

interface SongBar { c: number; lead: Ev[]; bass: Ev[]; pad: number; b: boolean }
interface Song { bars: SongBar[] }

const degToSemi = (scale: number[], d: number) => {
  const L = scale.length;
  return Math.floor(d / L) * 12 + scale[((d % L) + L) % L];
};

function genRhythm(r: Rng, density: number, cadence: boolean): [number, number][] {
  const pool = cadence ? [4, 6, 8, 8] : density > 0.6 ? [1, 2, 2, 2, 3, 4] : density > 0.33 ? [2, 2, 3, 4, 4, 6] : [4, 4, 6, 8, 8];
  const out: [number, number][] = [];
  let s = 0;
  while (s < 16) {
    let d = pick(r, pool);
    if (cadence && out.length >= 1 && s >= 8) d = 16 - s;
    if (s + d > 16) d = 16 - s;
    if (s > 0 && !cadence && r() < 0.12) {
      s += d;
      continue;
    }
    out.push([s, d]);
    s += d;
  }
  return out;
}

function chordTone(c: number, target: number, L: number, lo: number, hi: number, set: number[]): number {
  let best = c;
  let bd = 1e9;
  for (let k = -3; k <= 3; k++) {
    for (const x of set) {
      const d = c + x + k * L;
      if (d < lo || d > hi) continue;
      const dist = Math.abs(d - target);
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
  }
  return best;
}

function genPitches(r: Rng, rh: [number, number][], c: number, prev: number, lo: number, hi: number, L: number, end?: number[]): Ev[] {
  const evs: Ev[] = [];
  let d = prev;
  rh.forEach(([s, len], i) => {
    const last = i === rh.length - 1;
    if (last && end) d = chordTone(c, d, L, lo, hi, end);
    else if (i === 0 || s % 4 === 0) {
      // land on a chord tone, but keep the line moving: mostly avoid repeating the last note
      const dir = d > (lo + hi) / 2 + 2 ? -1 : d < (lo + hi) / 2 - 2 ? 1 : r() < 0.5 ? -1 : 1;
      let n = chordTone(c, d + dir * (1 + Math.floor(r() * 2)), L, lo, hi, [0, 2, 4]);
      if (n === d && i > 0 && r() < 0.8) n = chordTone(c, d + dir * 3, L, lo, hi, [0, 2, 4]);
      d = n;
    } else {
      let st = pick(r, [-1, 1, -1, 1, -2, 2, 0, 3, -3, 1, -1]);
      if (d + st < lo || d + st > hi) st = -st;
      d = clamp(d + st, lo, hi);
    }
    evs.push(E(s, len * 0.92, d, (s % 4 === 0 ? 1 : 0.8) * (0.9 + r() * 0.1)));
  });
  return evs;
}

function transpose(bar: Ev[], delta: number, lo: number, hi: number, L: number): Ev[] {
  if (bar.length === 0) return [];
  let mn = 1e9;
  let mx = -1e9;
  for (const e of bar) {
    mn = Math.min(mn, e.d + delta);
    mx = Math.max(mx, e.d + delta);
  }
  if (mx > hi + 1) delta -= L;
  else if (mn < lo - 1) delta += L;
  return bar.map((e) => ({ ...e, d: e.d + delta }));
}

const lastD = (bar: Ev[], fallback: number) => (bar.length ? bar[bar.length - 1].d : fallback);

/** An 8-bar phrase: motif, answer, sequence, half cadence; motif, answer, new line, full cadence. */
function genSection(def: TrackDef, prog: number[], seedM: number, seedV: number, lift: number): Ev[][] {
  const rM = mulberry(seedM);
  const rV = mulberry(seedV);
  const L = def.scale.length;
  const lo = lift;
  const hi = lift + L + 4;
  const dens = def.density;
  const R1 = genRhythm(rM, dens, false);
  const R2 = genRhythm(rM, dens * 0.8, false);
  const bars: Ev[][] = [];
  bars[0] = genPitches(rM, R1, prog[0], lo + 4 + Math.floor(rM() * 3), lo, hi, L);
  bars[1] = genPitches(rM, R2, prog[1], lastD(bars[0], lo + 4), lo, hi, L);
  bars[2] = transpose(bars[0], prog[2] - prog[0], lo, hi, L);
  bars[3] = genPitches(rV, genRhythm(rV, dens * 0.6, true), prog[3], lastD(bars[2], lo + 4), lo, hi, L, [2, 4]);
  bars[4] = transpose(bars[0], prog[4] - prog[0], lo, hi, L);
  bars[5] = transpose(bars[1], prog[5] - prog[1], lo, hi, L);
  bars[6] = genPitches(rV, genRhythm(rV, dens, false), prog[6], lastD(bars[5], lo + 4), lo, hi, L);
  bars[7] = genPitches(rV, genRhythm(rV, dens * 0.5, true), prog[7], lastD(bars[6], lo + 4), lo, hi, L, [0]);
  return bars;
}

type Riff = [number, number, number, number][];
function genRiff(r: Rng, L: number): Riff {
  const out: Riff = [[0, 1.6, 0, 0]];
  const rels = [0, 0, 1, 0, -1, 2, L, 0, 3, 1];
  for (const s of [3, 4, 6, 7, 8, 10, 11, 12, 14]) {
    if (r() < 0.55) out.push([s, s === 14 ? 2 : 1.4, pick(r, rels), s % 4 === 0 || r() < 0.5 ? 0 : 0.4]);
  }
  return out;
}

function bassBar(def: TrackDef, c: number, L: number, riff: Riff, bi: number): Ev[] {
  const b = c >= Math.ceil(L * 0.6) ? c - L : c;
  const f = b + (L === 7 ? 4 : 3); // fifth-ish
  const o = b + L;
  const ev: Ev[] = [];
  switch (def.bassStyle) {
    case 'pulse8':
      for (let s = 0; s < 16; s += 2) ev.push(E(s, 1.8, b, s % 4 === 0 ? 1 : 0.75));
      for (let s = 1; s < 16; s += 2) ev.push(E(s, 0.9, s % 4 === 3 ? o : b, 0.5, 0.75));
      break;
    case 'oct':
      for (let s = 0; s < 16; s += 2) ev.push(E(s, 1.7, (s / 2) % 2 ? o : b, s % 4 === 0 ? 1 : 0.8));
      break;
    case 'long':
      ev.push(E(0, 7.6, b, 0.9), E(8, 7.6, bi % 2 ? f - L : b, 0.8));
      ev.push(E(6, 1.8, o, 0.5, 0.5), E(14, 1.8, o, 0.5, 0.5));
      break;
    case 'tribal':
      ev.push(E(0, 2.8, b), E(3, 2.8, b, 0.8), E(6, 1.8, f, 0.85), E(10, 1.8, b, 0.8, 0.25), E(12, 1.8, o, 0.7, 0.5), E(14, 1.8, f, 0.7, 0.5));
      break;
    case 'riff':
      for (const [s, len, rel, lvl] of riff) {
        const vary = (bi === 3 || bi === 7) && s >= 8 ? 1 : 0;
        ev.push(E(s, len, b + rel + vary, s === 0 ? 1 : 0.8, lvl));
      }
      break;
    case 'march':
      ev.push(E(0, 3, b), E(4, 3, f - L, 0.85), E(8, 3, b, 0.95), E(12, 3, f - L, 0.85));
      ev.push(E(10, 1.5, b + 2, 0.6, 0.5), E(14, 1.5, b - 1, 0.6, 0.5));
      break;
    case 'offbeat':
      ev.push(E(0, 2.6, b), E(3, 1.6, b, 0.7, 0.25), E(6, 1.8, f, 0.85), E(8, 1.8, b, 0.9), E(11, 1.6, o, 0.7), E(14, 1.8, f, 0.8, 0.5));
      break;
    case 'grind':
      for (let s = 0; s < 16; s++) {
        if (s % 2 === 0) ev.push(E(s, 1.8, s === 6 || s === 14 ? o : b, s % 4 === 0 ? 1 : 0.8));
        else ev.push(E(s, 0.9, b, 0.55, 0.5));
      }
      break;
    case 'funk':
      ev.push(E(0, 2, b), E(3, 1, o, 0.7), E(6, 2, b, 0.8, 0.25), E(8, 2, f, 0.9), E(10, 1, o, 0.6, 0.5), E(11, 1, b, 0.7, 0.5), E(14, 2, b - 1, 0.7, 0.25));
      break;
    case 'gallop':
      for (let k = 0; k < 4; k++) {
        const d = bi === 7 && k === 3 ? o : b;
        ev.push(E(k * 4, 0.9, d), E(k * 4 + 2, 0.9, d, 0.75), E(k * 4 + 3, 0.9, d, 0.8), E(k * 4 + 1, 0.9, d, 0.55, 0.75));
      }
      break;
  }
  if (def.bassLong) {
    for (const e of ev) e.lvl = Math.max(e.lvl, def.bassLong);
    ev.push(E(0, 15.5, b, 0.9, 0, def.bassLong));
  }
  return ev;
}

const songs = new Map<Track, Song>();
function getSong(name: Track): Song {
  const cached = songs.get(name);
  if (cached) return cached;
  const def = TRACKS[name];
  const seed = hash('rustwing:' + name);
  const L = def.scale.length;
  const x8 = (p: number[]) => (p.length >= 8 ? p.slice(0, 8) : [...p, ...p, ...p, ...p].slice(0, 8));
  const pa = x8(def.progA);
  const pb = x8(def.progB);
  const A = genSection(def, pa, seed ^ 0x1111, seed ^ 0xa1a1, 0);
  const A2 = genSection(def, pa, seed ^ 0x1111, seed ^ 0xa2a2, 0);
  const B = genSection(def, pb, seed ^ 0x2222, seed ^ 0xb1b1, 2);
  const B2 = genSection(def, pb, seed ^ 0x2222, seed ^ 0xb2b2, 2);
  const riff = genRiff(mulberry(seed ^ 0x3333), L);
  const bars: SongBar[] = [];
  const secs: [Ev[][], number[], boolean][] = [[A, pa, false], [B, pb, true], [A2, pa, false], [B2, pb, true]];
  for (const [lead, prog, isB] of secs) {
    for (let i = 0; i < 8; i++) {
      const c = prog[i];
      bars.push({ c, lead: lead[i], bass: bassBar(def, c, L, riff, i), pad: 0, b: isB });
    }
  }
  // pads hold through repeated chords (restart at each section)
  for (let i = 0; i < bars.length; i++) {
    if (i % 8 !== 0 && bars[i - 1].c === bars[i].c) continue;
    let n = 1;
    while (n < 4 && (i + n) % 8 !== 0 && i + n < bars.length && bars[i + n].c === bars[i].c) n++;
    bars[i].pad = n;
  }
  const song = { bars };
  songs.set(name, song);
  return song;
}

// ================================================================================================
// Music: instruments
// ================================================================================================

function playInst(kind: Inst, t: number, f: number, dur: number, v: number, out: AudioNode, glideFrom = 0): void {
  const g = ctx.createGain();
  g.connect(out);
  const srcs: OscillatorNode[] = [];
  const osc = (w: Wave, freq: number, gain: number, to: AudioNode = g, detune = 0) => {
    const n = ctx.createOscillator();
    setWave(n, w);
    n.frequency.value = nyq(freq);
    n.detune.value = detune;
    if (gain !== 1) {
      const gg = ctx.createGain();
      gg.gain.value = gain;
      n.connect(gg).connect(to);
    } else n.connect(to);
    srcs.push(n);
    return n;
  };
  const vib = (params: AudioParam[], rate: number, depth: number, delay: number) => {
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(depth, t + delay + 0.15);
    l.connect(lg);
    for (const p of params) lg.connect(p);
    srcs.push(l);
  };
  const fm = (car: OscillatorNode, ratio: number, i0: number, i1: number, dec: number) => {
    const m = ctx.createOscillator();
    m.frequency.value = nyq(f * ratio);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * i0, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(f * i1, 0.01), t + dec);
    m.connect(mg).connect(car.frequency);
    srcs.push(m);
  };
  const lpf = (f0: number, q = 0.7) => filt(g, 'lowpass', f0, q);
  let end: number;

  switch (kind) {
    case 'pulse':
    case 'pulse12': {
      const n = osc(kind === 'pulse' ? pulse25 : pulse12, f, 1, lpf(Math.min(6000, f * 10)));
      if (dur > 0.25) vib([n.frequency], 5.5, f * 0.006, 0.18);
      end = adsr(g.gain, t, 0.004, 0.12, 0.65, 0.07, dur, v * 0.45);
      break;
    }
    case 'saw': {
      const lp = lpf(900, 2);
      lp.frequency.setValueAtTime(nyq(f * 2), t);
      lp.frequency.linearRampToValueAtTime(nyq(Math.min(f * 9, 5000)), t + 0.02);
      lp.frequency.setTargetAtTime(nyq(Math.min(f * 4, 3500)), t + 0.02, 0.12);
      const a = osc('sawtooth', f, 0.4, lp, -7);
      const b = osc('sawtooth', f, 0.4, lp, 7);
      if (dur > 0.25) vib([a.frequency, b.frequency], 5.2, f * 0.006, 0.2);
      end = adsr(g.gain, t, 0.012, 0.25, 0.7, 0.18, dur, v);
      break;
    }
    case 'flute': {
      const n = osc('triangle', f, 0.75);
      const n2 = osc('sine', f * 2, 0.12);
      noise(g, t, 0.1, 'bandpass', f * 2, f * 2, 3, v * 0.12, 0.03);
      vib([n.frequency, n2.frequency], 5, f * 0.007, 0.15);
      end = adsr(g.gain, t, 0.05, 0.2, 0.8, 0.15, dur, v);
      break;
    }
    case 'bell': {
      const c = osc('sine', f, 0.6);
      fm(c, 3.5, 1.5, 0.15, 0.5);
      end = adsr(g.gain, t, 0.002, 1.4, 0, 0.3, 1.1, v);
      break;
    }
    case 'steel': {
      const c = osc('sine', f, 0.6);
      fm(c, 2, 0.9, 0.05, 0.18);
      osc('sine', f * 3.01, 0.08);
      end = adsr(g.gain, t, 0.002, 0.5, 0, 0.1, 0.5, v);
      break;
    }
    case 'marimba': {
      osc('sine', f, 0.75);
      const hi = ctx.createGain();
      env(hi.gain, t, 0.001, 0.25, 0.06);
      hi.connect(g);
      osc('sine', f * 4, 1, hi);
      end = adsr(g.gain, t, 0.002, 0.35, 0, 0.08, 0.35, v);
      break;
    }
    case 'oud': {
      const lp = lpf(3500, 3);
      lp.frequency.setValueAtTime(nyq(Math.min(f * 12, 4500)), t);
      lp.frequency.exponentialRampToValueAtTime(nyq(f * 2), t + 0.25);
      const n = osc('sawtooth', f, 0.5, lp);
      n.frequency.setValueAtTime(f * 0.985, t);
      n.frequency.linearRampToValueAtTime(f, t + 0.03);
      end = adsr(g.gain, t, 0.003, 0.6, 0, 0.1, Math.max(dur, 0.5), v);
      break;
    }
    case 'brass': {
      const lp = lpf(f * 2, 1.5);
      lp.frequency.setValueAtTime(nyq(f * 1.5), t);
      lp.frequency.linearRampToValueAtTime(nyq(Math.min(f * 6, 4000)), t + 0.08);
      lp.frequency.setTargetAtTime(nyq(Math.min(f * 3, 2500)), t + 0.08, 0.15);
      const a = osc('sawtooth', f, 0.5, lp);
      const b = osc('square', f, 0.15, lp, 5);
      if (dur > 0.3) vib([a.frequency, b.frequency], 5.5, f * 0.006, 0.25);
      end = adsr(g.gain, t, 0.03, 0.2, 0.8, 0.12, dur, v);
      break;
    }
    case 'theremin': {
      const a = osc('sine', f, 0.8);
      const b = osc('triangle', f / 2, 0.2);
      if (glideFrom > 0 && glideFrom / f < 3 && f / glideFrom < 3) {
        a.frequency.setValueAtTime(glideFrom, t);
        a.frequency.linearRampToValueAtTime(f, t + 0.09);
        b.frequency.setValueAtTime(glideFrom / 2, t);
        b.frequency.linearRampToValueAtTime(f / 2, t + 0.09);
      }
      vib([a.frequency], 5.5, f * 0.012, 0.1);
      end = adsr(g.gain, t, 0.06, 0.2, 1, 0.35, dur, v);
      break;
    }
    case 'keys': {
      const c = osc('sine', f, 0.6);
      fm(c, 1, 1.2, 0.1, 0.5);
      const tine = ctx.createGain();
      env(tine.gain, t, 0.001, 0.12, 0.15);
      tine.connect(g);
      osc('sine', f * 4, 1, tine);
      end = adsr(g.gain, t, 0.003, 1.2, 0.3, 0.25, dur, v);
      break;
    }
    case 'pluck': {
      const lp = lpf(4000, 4);
      lp.frequency.setValueAtTime(nyq(Math.min(f * 10, 7000)), t);
      lp.frequency.exponentialRampToValueAtTime(nyq(f * 1.2), t + 0.18);
      osc('sawtooth', f, 0.5, lp);
      end = adsr(g.gain, t, 0.002, 0.3, 0, 0.08, 0.3, v);
      break;
    }
    // ---- bass
    case 'sub':
      osc('sine', f, 0.9);
      osc('triangle', f, 0.25);
      end = adsr(g.gain, t, 0.006, 0.2, 0.85, 0.07, dur, v);
      break;
    case 'bsaw': {
      const lp = lpf(400, 5);
      lp.frequency.setValueAtTime(nyq(f * 2 + 1400 * v), t);
      lp.frequency.exponentialRampToValueAtTime(nyq(f * 2 + 120), t + 0.15);
      osc('sawtooth', f, 0.5, lp);
      osc('sine', f, 0.4);
      end = adsr(g.gain, t, 0.004, 0.15, 0.75, 0.06, dur, v);
      break;
    }
    case 'dist': {
      const lv = ctx.createGain();
      lv.gain.value = 0.35;
      lv.connect(g);
      const lp = filt(lv, 'lowpass', 900, 2);
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      const sh = ctx.createWaveShaper();
      sh.curve = driveCurve;
      sh.oversample = '2x';
      sh.connect(lp);
      const pre = ctx.createGain();
      pre.gain.value = 0.7;
      pre.connect(sh);
      osc('sawtooth', f, 1, pre);
      osc('square', f * 1.003, 0.6, pre);
      osc('sine', f, 0.5);
      end = adsr(g.gain, t, 0.004, 0.15, 0.8, 0.06, dur, v);
      break;
    }
    case 'bpulse':
      osc(pulse25, f, 0.45, lpf(1500));
      osc('sine', f, 0.3);
      end = adsr(g.gain, t, 0.004, 0.15, 0.8, 0.06, dur, v);
      break;
    // ---- pads
    case 'warm': {
      const lp = lpf(900, 0.5);
      osc('sawtooth', f, 0.5, lp, -6);
      osc('sawtooth', f, 0.5, lp, 6);
      end = adsr(g.gain, t, 0.5, 0.5, 1, 0.9, dur, v * 0.5);
      break;
    }
    case 'sawpad': {
      const lp = lpf(1600, 0.7);
      osc('sawtooth', f, 0.33, lp, -10);
      osc('sawtooth', f, 0.33, lp, 0);
      osc('sawtooth', f, 0.33, lp, 10);
      end = adsr(g.gain, t, 0.15, 0.4, 1, 0.5, dur, v * 0.6);
      break;
    }
    case 'eerie': {
      const a = osc('sine', f, 0.6);
      const b = osc('triangle', f * 1.003, 0.4);
      const c = osc('sine', f * 1.997, 0.2);
      vib([a.frequency, b.frequency, c.frequency], 0.25, f * 0.012, 0.3);
      end = adsr(g.gain, t, 1.2, 0.5, 1, 1.6, dur, v * 0.9);
      break;
    }
    case 'cold': {
      const lp = lpf(3000);
      osc('triangle', f, 0.6, lp);
      osc('sine', f * 2, 0.25, lp);
      end = adsr(g.gain, t, 0.6, 0.5, 1, 1.2, dur, v * 0.8);
      break;
    }
    case 'dark':
    default: {
      osc('sawtooth', f, 0.6, lpf(420, 3));
      end = adsr(g.gain, t, 0.8, 0.5, 1, 1, dur, v * 0.8);
      break;
    }
  }
  for (const s of srcs) {
    s.start(t);
    s.stop(end);
  }
}

function playDrum(dv: DrumVoice, t: number, v: number, out: AudioNode, kick: [number, number, number]) {
  switch (dv) {
    case 'kick':
      tone(out, t, 'sine', kick[0], kick[1], kick[2], v, 0.002, 0.09);
      noise(out, t, 0.012, 'highpass', 3000, 3000, 0.7, v * 0.25, 0.001);
      break;
    case 'snare':
      noise(out, t, 0.2, 'bandpass', 2500, 1800, 0.6, v * 0.65);
      tone(out, t, 'triangle', 200, 165, 0.1, v * 0.5);
      break;
    case 'clap':
      for (let i = 0; i < 3; i++) noise(out, t + i * 0.011, 0.02, 'bandpass', 1100, 1100, 1.5, v * 0.45, 0.001);
      noise(out, t + 0.033, 0.18, 'bandpass', 1100, 1000, 1.5, v * 0.45, 0.001);
      break;
    case 'hat':
      noise(out, t, 0.04, 'highpass', 7500, 7500, 0.7, v * 0.32, 0.001);
      break;
    case 'ohat':
      noise(out, t, 0.28, 'highpass', 7000, 7000, 0.7, v * 0.26, 0.002);
      break;
    case 'tomLo':
      tone(out, t, 'sine', 120, 70, 0.35, v * 0.8, 0.002);
      noise(out, t, 0.04, 'lowpass', 600, 600, 0.7, v * 0.2);
      break;
    case 'tomHi':
      tone(out, t, 'sine', 190, 120, 0.25, v * 0.7, 0.002);
      noise(out, t, 0.03, 'lowpass', 900, 900, 0.7, v * 0.2);
      break;
    case 'shaker':
      noise(out, t, 0.07, 'bandpass', 6000, 6000, 1, v * 0.25, 0.012);
      break;
    case 'rim':
      tone(out, t, 'triangle', 1800, 1700, 0.03, v * 0.35, 0.001);
      noise(out, t, 0.015, 'bandpass', 4000, 4000, 1, v * 0.3, 0.001);
      break;
    case 'metal': {
      const bp = filt(out, 'bandpass', 2600, 2);
      for (const fr of [540, 845, 1180]) tone(bp, t, 'square', fr, fr * 0.98, 0.25, v * 0.22, 0.001);
      noise(out, t, 0.1, 'highpass', 6000, 6000, 0.7, v * 0.2);
      break;
    }
    case 'doum':
      tone(out, t, 'sine', 105, 75, 0.4, v * 0.8, 0.002);
      noise(out, t, 0.03, 'lowpass', 500, 500, 0.7, v * 0.2);
      break;
    case 'tek':
      noise(out, t, 0.05, 'bandpass', 4500, 4500, 2, v * 0.5, 0.001);
      tone(out, t, 'sine', 820, 800, 0.03, v * 0.3, 0.001);
      break;
    case 'conga':
      tone(out, t, 'sine', 330, 280, 0.18, v * 0.55, 0.002);
      break;
  }
}

// ================================================================================================
// Music: players & scheduler
// ================================================================================================

interface Player {
  name: Track;
  def: TrackDef;
  song: Song;
  out: GainNode;
  revOut: GainNode;
  nodes: AudioNode[];
  ch: Record<Chan, GainNode>;
  step: number;
  next: number;
  stopAt: number;
  lastLead: number;
}
const players: Player[] = [];
let current: Player | null = null;
const LOOKAHEAD = 0.2;

function makePlayer(name: Track, start: number): Player {
  const def = TRACKS[name];
  const sd = 60 / def.bpm / 4;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, ctx.currentTime);
  out.gain.linearRampToValueAtTime(1, start + 0.8);
  out.connect(musicDuck);
  // each player has its own reverb, faded after the convolver, so a retired song's tail
  // doesn't keep ringing under the next one
  const verb = ctx.createConvolver();
  verb.buffer = musicVerbIR;
  const revIn = ctx.createGain();
  const revOut = ctx.createGain();
  revOut.gain.setValueAtTime(0, ctx.currentTime);
  revOut.gain.linearRampToValueAtTime(0.8, start + 0.8);
  revIn.connect(verb).connect(revOut).connect(musicDuck);
  const dly = ctx.createDelay(2);
  dly.delayTime.value = Math.min(1.9, sd * 3);
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const dlp = ctx.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 2600;
  dly.connect(dlp).connect(fb).connect(dly);
  dlp.connect(out);
  const nodes: AudioNode[] = [out, revIn, verb, revOut, dly, fb, dlp];
  const ch = {} as Record<Chan, GainNode>;
  for (const c of Object.keys(MIX) as Chan[]) {
    const g = ctx.createGain();
    g.gain.value = def.mix?.[c] ?? MIX[c];
    g.connect(out);
    const rv = def.rev?.[c] ?? REV[c];
    if (rv > 0) {
      const s = ctx.createGain();
      s.gain.value = rv;
      g.connect(s).connect(revIn);
      nodes.push(s);
    }
    const dl = def.dly?.[c] ?? DLY[c];
    if (dl > 0) {
      const s = ctx.createGain();
      s.gain.value = dl;
      g.connect(s).connect(dly);
      nodes.push(s);
    }
    nodes.push(g);
    ch[c] = g;
  }
  return { name, def, song: getSong(name), out, revOut, nodes, ch, step: 0, next: start, stopAt: Infinity, lastLead: 0 };
}

/** Fades a player out over `fade` seconds and stops scheduling it after. */
function retire(p: Player, now: number, fade: number) {
  for (const g of [p.out.gain, p.revOut.gain]) {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
  }
  p.stopAt = Math.min(p.stopAt, now + fade + 0.05);
}

function switchTrack(name: Track | null) {
  if (current && current.name === name) return;
  const now = ctx.currentTime;
  const running = ctx.state === 'running';
  // only one tune at a time: anything still fading out from an earlier switch goes now, and the
  // one playing is silent before the next one comes in (a song that never got to play, because
  // the context wasn't running yet, is dropped outright)
  const fade = running && current ? 0.6 : 0;
  for (const p of players) if (p !== current) retire(p, now, running ? 0.12 : 0);
  if (current) retire(current, now, fade);
  current = null;
  if (name) {
    current = makePlayer(name, now + fade + 0.05);
    players.push(current);
  }
}

const ARP: Record<TrackDef['arpStyle'], number[]> = { up: [0, 1, 2, 3], down: [3, 2, 1, 0], updown: [0, 1, 2, 3, 2, 1], broken: [0, 2, 1, 3] };

function scheduleStep(p: Player, step: number, t0: number) {
  const d = p.def;
  const sd = 60 / d.bpm / 4;
  const s = step % 16;
  const bi = Math.floor(step / 16) % p.song.bars.length;
  const bar = p.song.bars[bi];
  const sec = bi % 8;
  const I = Math.max(d.minI, wantI);
  const t = t0 + (s % 2 === 1 ? (d.swing ?? 0) * sd : 0);
  const L = d.scale.length;
  const note = (base: number, deg: number) => mtof(base + degToSemi(d.scale, deg));

  // pad: chord held over its run of bars
  if (s === 0 && d.pad && bar.pad > 0) {
    const len = bar.pad * 16 * sd;
    for (const k of [0, 2, 4]) playInst(d.pad, t, note(d.root + d.padOct, bar.c + k), len * 0.97, 0.8, p.ch.pad);
  }
  // bass
  for (const e of bar.bass) {
    if (e.s === s && I >= e.lvl && I < e.hi) playInst(d.bass, t, note(d.root, e.d), e.len * sd, e.v, p.ch.bass);
  }
  // lead (and its octave double at high intensity)
  for (const e of bar.lead) {
    if (e.s !== s) continue;
    const f = note(d.root + d.leadOct, e.d);
    playInst(d.lead, t, f, e.len * sd, e.v, p.ch.lead, p.lastLead);
    p.lastLead = f;
    if (d.dbl && I >= 0.8) playInst('pulse12', t, f * 2, e.len * sd, e.v * 0.3, p.ch.lead);
  }
  // arp: walks the chord tones; comes in a bit earlier in B sections
  if (d.arp && I >= d.arpAt - (bar.b ? 0.15 : 0) && s % d.arpRate === 0) {
    const pat = ARP[d.arpStyle];
    const idx = pat[Math.floor(step / d.arpRate) % pat.length];
    const deg = bar.c + [0, 2, 4, L][idx];
    playInst(d.arp, t, note(d.root + d.arpOct, deg), d.arpRate * sd * 0.9, s % 4 === 0 ? 0.9 : 0.65, p.ch.arp);
  }
  // drums
  const fill = sec === 7 && I >= 0.5 && d.fill;
  const kick = d.kick ?? [150, 45, 0.32];
  for (const k of Object.keys(d.drums) as DrumVoice[]) {
    if (fill && d.fill && d.fill[k] !== undefined) continue;
    hitDrum(k, d.drums[k], bi, s, I, t, p, kick);
  }
  if (fill && d.fill) for (const k of Object.keys(d.fill) as DrumVoice[]) hitDrum(k, d.fill[k], bi, s, I, t, p, kick);
  if (d.crash && sec === 0 && s === 0 && I >= 0.5) noise(p.ch.drum, t, 1.4, 'highpass', 3500, 3000, 0.7, 0.22, 0.002);
}

function hitDrum(k: DrumVoice, pat: string | string[] | undefined, bi: number, s: number, I: number, t: number, p: Player, kick: [number, number, number]) {
  if (!pat) return;
  const str = typeof pat === 'string' ? pat : pat[bi % pat.length];
  const c = str.charCodeAt(s) - 48;
  if (!(c >= 0 && c <= 3) || I < c * 0.25) return;
  const v = s % 4 === 0 ? 1 : 0.75;
  playDrum(k, t, v, k === 'snare' || k === 'clap' ? p.ch.snr : p.ch.drum, kick);
}

function tick() {
  if (!ready || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (let i = players.length - 1; i >= 0; i--) {
    const p = players[i];
    if (p.next < now - 0.1) {
      // fell behind (tab was in the background): skip ahead instead of bursting
      const sd = 60 / p.def.bpm / 4;
      const skip = Math.ceil((now - p.next) / sd);
      p.step += skip;
      p.next += skip * sd;
    }
    while (p.next < now + LOOKAHEAD && p.next < p.stopAt) {
      scheduleStep(p, p.step, p.next);
      p.next += 60 / p.def.bpm / 4;
      p.step++;
    }
    if (now > p.stopAt + 3) {
      for (const n of p.nodes) n.disconnect();
      players.splice(i, 1);
    }
  }
  // retire silent loops
  for (const [key, v] of loops) {
    if (!v.on && now - v.offAt > 0.6) {
      for (const s of v.srcs) s.stop();
      for (const n of v.nodes) n.disconnect();
      loops.delete(key);
    }
  }
  // disconnect finished sfx chains
  for (let i = trash.length - 1; i >= 0; i--) {
    if (trash[i].at < now) {
      for (const n of trash[i].nodes) n.disconnect();
      trash.splice(i, 1);
    }
  }
}

// ================================================================================================
// Public API
// ================================================================================================

let duckUntil = 0;

export const audio = {
  unlock(): void {
    try {
      if (!ready) {
        if (!init()) return;
        if (wantTrack) switchTrack(wantTrack);
        for (const key of [...loopWant.keys()]) applyLoop(key);
      }
      if (ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => undefined);
    } catch {
      /* no audio available */
    }
  },

  play(name: Sfx, opts?: { pan?: number; pitch?: number; vol?: number }): void {
    if (!ready || ctx.state !== 'running') return;
    playSfx(name, opts);
  },

  loop(name: Loop, owner: string, on: boolean, intensity = 1): void {
    const key = name + ':' + owner;
    if (!on && !loopWant.has(key) && !loops.has(key)) return;
    loopWant.set(key, { name, on, i: clamp(intensity, 0, 1) });
    if (ready) applyLoop(key);
    else if (!on) loopWant.delete(key);
  },

  music(track: Track | null): void {
    wantTrack = track;
    if (ready) switchTrack(track);
  },

  intensity(x: number): void {
    wantI = clamp(x, 0, 1);
  },

  duck(seconds: number): void {
    if (!ready) return;
    const now = ctx.currentTime;
    duckUntil = Math.max(duckUntil, now + Math.max(0, seconds));
    const g = musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.35, now + 0.04);
    g.setValueAtTime(0.35, duckUntil);
    g.linearRampToValueAtTime(1, duckUntil + 0.6);
  },

  volume(masterVol: number, music: number, sfx: number): void {
    settings.master = clamp(masterVol, 0, 1);
    settings.music = clamp(music, 0, 1);
    settings.sfx = clamp(sfx, 0, 1);
    applyVolumes();
  },

  get muted(): boolean {
    return isMuted;
  },

  toggleMute(): void {
    isMuted = !isMuted;
    try {
      localStorage.setItem('rr.muted', isMuted ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    applyVolumes();
  },
};

// keep the timer id referenced (also lets HMR stop the old scheduler)
const hot = (import.meta as unknown as { hot?: { dispose(cb: () => void): void } }).hot;
hot?.dispose(() => {
  window.clearInterval(timer);
  document.removeEventListener('visibilitychange', onVisibility);
  if (ready) void ctx.close();
});
