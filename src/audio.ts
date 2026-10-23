/**
 * Rustwing Raiders audio: every sound synthesized at runtime with the Web Audio API.
 *
 * Graph (see docs/sound-design.md):
 *   sfx voices -> per-play gain/pan/air -> sfxBus -------------------------\
 *                                     \-> sfxVerb -> the place's reverb ----+-> world -> worldLP -\
 *   ambience -> ambLevel -> ambDuck -> ambVol --\                          |                    +-> master
 *   music players -> fade -> musicDuck -> musicVol -+-> bedLP --------------/                    |   -> compressor
 *                 \-> reverb send -> its own long convolver -> fade -> duck                       |   -> limiter -> out
 *   ui sounds -> uiBus -----------------------------------------------------------------------/
 *
 * The place (`audio.ambience`) sets a bed of air, surf, rumble or hum, one-shots scattered around
 * it at random distances, and the reverb every sound in the world goes through. Big sounds duck
 * the music and ambience on their own; low hull closes bedLP and brings in a heartbeat; pause
 * sinks worldLP.
 *
 * Music is sequenced step by step (16 steps a bar) by a lookahead scheduler running on
 * AudioContext time. Each track's song (32 bars: A B A' B') is generated once from a seed
 * derived from the track name, so the same track always sounds the same.
 */

export type Sfx =
  | 'shot_rivet' | 'shot_scatter' | 'shot_rail' | 'shot_arc' | 'shot_missile' | 'shot_flak' | 'shot_mine' | 'flak_burst'
  | 'hit' | 'hit_armor' | 'shot_land' | 'reflect' | 'enemy_shot' | 'lock_on' | 'torpedo_launch' | 'torpedo_down' | 'seeker_halt' | 'seeker_go' | 'seeker_down' | 'explode_small' | 'explode_big' | 'explode_boss'
  | 'player_hit' | 'player_down' | 'shield_break' | 'shield_up' | 'dash' | 'graze' | 'overheat'
  | 'pickup_scrap' | 'pickup_part' | 'heal'
  | 'special_bomb' | 'special_phase' | 'special_emp' | 'special_overdrive' | 'special_ready'
  | 'laser_charge' | 'laser_fire' | 'lightning' | 'geyser' | 'crash' | 'warp' | 'boss_warning' | 'level_clear'
  | 'ui_move' | 'ui_select' | 'ui_back' | 'ui_error' | 'ui_place' | 'ui_buy'
  | 'card_flip' | 'loot_epic' | 'loot_legendary'
  | 'graft_deal' | 'graft_bolt' | 'bond_wake'
  | 'core_hum' | 'core_feed' | 'core_grow' | 'core_wake' | 'imprint' | 'shaken' | 'engine_call' | 'core_refuse' | 'core_bark'
  | 'skid' | 'truck_rev'
  | 'kill' | 'perfect' | 'skim' | 'boost' | 'risk_up' | 'risk_lost' | 'point_blank'
  | 'parry' | 'block' | 'aux_ready' | 'guard_up' | 'guard_whiff' | 'dash_dry' | 'hook' | 'reel' | 'eat' | 'blink' | 'ram' | 'flare'
  | 'mark_burn' | 'mark_shock' | 'mark_crack' | 'react_overload' | 'react_cookoff' | 'react_shatter' | 'detonate'
  | 'hull_hit' | 'boarders' | 'boarded' | 'hauler_lost' | 'horn' | 'shriek' | 'wingbeat'
  | 'toll' | 'ice_crack' | 'frost_breath' | 'engine_wake'
  | 'istra_call' | 'crew_ho' | 'cannon' | 'whale_dive' | 'whale_breach' | 'tide_turn' | 'whale_breath'
  | 'notice' | 'printer' | 'claw' | 'winch' | 'plate_on' | 'plate_tear' | 'clang'
  // Warlord Khet and his titan: his shout, its thrusters and joints, the light's tone, its glass
  | 'khet_yell' | 'thruster' | 'titan_servo' | 'titan_land' | 'light_tone' | 'glass_fall' | 'glass_burst'
  | 'engine_out' | 'spool' | 'jump' | 'runner_down' | 'bay' | 'pod_loose' | 'pod_catch' | 'pod_fell'
  | 'sentinel' | 'sentinel_out' | 'boomerang' | 'frenzy' | 'frenzy_max' | 'frenzy_off' | 'thunder' | 'nova' | 'feed'
  | 'heavy' | 'heavy_dry' | 'reload' | 'reload_perfect' | 'load_class'
  // boarding: on foot aboard a freighter
  | 'foot_shot' | 'foot_blast' | 'foot_shell' | 'foot_dry' | 'step' | 'slide' | 'takedown' | 'punch' | 'body_fall' | 'swing'
  | 'foot_hurt' | 'crew_hit' | 'plate_hit' | 'plate_break' | 'aim_tell' | 'crew_shot' | 'ricochet' | 'door' | 'alarm' | 'lockdown'
  | 'foot_mark' | 'crew_kill'
  | 'breach' | 'kelter_clamp' | 'hook_fire' | 'hook_snap' | 'crack_tick' | 'crate_open' | 'strongbox_open' | 'core_pull' | 'airlock'
  | 'clock_tick' | 'turret_up' | 'charge' | 'slam' | 'canister' | 'pickup_tin' | 'heal_foot' | 'alert' | 'revive'
  // co-op downs: a down ship's distress ping, and its engines kicked back on
  | 'down_ping' | 'jolt'
  // the forge's guns, each its own voice (see view/gun-looks.ts), and the combos' cash-ins
  | 'shot_saw' | 'saw_ting' | 'saw_grind' | 'shot_needle' | 'needle_hit' | 'shot_hive' | 'hive_hit' | 'shot_wave' | 'wave_hit'
  | 'shot_charge' | 'charge_ready' | 'charge_hit' | 'shot_anchor' | 'anchor_pin' | 'chain_snap' | 'shot_bumper' | 'bonk' | 'frost_hit'
  | 'cash_smash' | 'cash_nailed' | 'cash_flare' | 'cash_ground' | 'cash_breach'
  // the new kit (see view/kit-view.ts): the Bulwark, the Swap Beacon, the skins, the bombs
  | 'wall_up' | 'wall_block' | 'wall_throw' | 'beacon_throw' | 'beacon_swap' | 'beacon_burst' | 'beacon_fizzle'
  | 'layer_break' | 'layer_grow' | 'static_charge' | 'static_zap'
  | 'special_carpet' | 'bomblet' | 'special_cryo' | 'snow' | 'special_gravity' | 'well_burst' | 'special_drones' | 'drones_gone';
/** A sound a minigame defines for itself, in its own file (see `defineSfx`). */
export type MiniSfx = `mini_${string}`;
export type AnySfx = Sfx | MiniSfx;
export type Loop = 'beam' | 'flame' | 'frost' | 'charge' | 'engine' | 'wind' | 'truck' | 'jumpstart';
export type Track = 'title' | 'map' | 'hangar' | 'boss' | 'boss_orutal' | 'boss_glacis' | 'boss_vesh' | 'boss_cinder' | 'boss_ashgrave' | 'orutal' | 'halcyon' | 'kessra' | 'mirefall' | 'glacis' | 'ashgrave' | 'vesh' | 'cinder' | 'board';

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
/** Stereo pink noise, the two sides unrelated: wide, soft beds of air. */
let pinkBuf!: AudioBuffer;
let uiBus!: GainNode;
let world!: GainNode;
let worldLP!: BiquadFilterNode;
let bedLP!: BiquadFilterNode;
let ambLevel!: GainNode;
let ambDuck!: GainNode;
let ambVol!: GainNode;
let ambWet!: GainNode;
let limiter!: DynamicsCompressorNode;
let meterNode: AnalyserNode | null = null;
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
  const saved = JSON.parse(localStorage.getItem('rr.volume') ?? 'null') as Partial<typeof settings> | null;
  for (const k of ['master', 'music', 'sfx'] as const) if (typeof saved?.[k] === 'number') settings[k] = Math.min(1, Math.max(0, saved[k]));
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
  limiter = lim;

  // the UI goes straight to master: never muffled, never ducked
  uiBus = ctx.createGain();
  uiBus.connect(master);
  // everything in the world goes through worldLP (pause, going down)
  world = ctx.createGain();
  worldLP = ctx.createBiquadFilter();
  worldLP.type = 'lowpass';
  worldLP.frequency.value = OPEN_HZ;
  worldLP.Q.value = 0.5;
  world.connect(worldLP).connect(master);
  sfxBus = ctx.createGain();
  sfxBus.connect(world);
  // music and ambience go through bedLP too (low hull closes it; the guns stay crisp)
  bedLP = ctx.createBiquadFilter();
  bedLP.type = 'lowpass';
  bedLP.frequency.value = OPEN_HZ;
  bedLP.Q.value = 0.6;
  bedLP.connect(world);
  musicVol = ctx.createGain();
  musicVol.connect(bedLP);
  musicDuck = ctx.createGain();
  musicDuck.connect(musicVol);
  ambVol = ctx.createGain();
  ambVol.connect(bedLP);
  ambDuck = ctx.createGain();
  ambDuck.connect(ambVol);
  ambLevel = ctx.createGain();
  ambLevel.connect(ambDuck);

  // shared buffers: 2 s of white noise, two reverb impulses, pulse waves, drive curve
  const sr = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, sr * 2, sr);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  pinkBuf = pinkNoise(5);

  musicVerbIR = impulse(2.6, 2.4);

  sfxVerb = ctx.createGain();
  setSpace('open');
  ambWet = ctx.createGain();
  ambWet.connect(sfxVerb);

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

/** Pink noise (Paul Kellet's filter), a different stream on each side, about 0.25 RMS, looping seamlessly. */
function pinkNoise(seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const xf = Math.floor(sr * 0.05);
  const b = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(n + xf);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let sq = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
      sq += d[i] * d[i];
    }
    const k = 0.25 / Math.sqrt(sq / d.length);
    // the start fades in from what would have come after the end, so the loop doesn't tick
    for (let i = 0; i < xf; i++) {
      const a = i / xf;
      d[i] = d[i] * a + d[n + i] * (1 - a);
    }
    for (let i = 0; i < n; i++) d[i] *= k;
    b.copyToChannel(d.subarray(0, n), ch);
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
  uiBus.gain.setTargetAtTime(settings.sfx * 0.9, now, tc);
  ambVol.gain.setTargetAtTime(settings.sfx * AMB_GAIN, now, tc);
}

// ================================================================================================
// Synthesis helpers
// ================================================================================================

export type Wave = OscillatorType | PeriodicWave;
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

export type SfxFn = (t: number, p: number, o: AudioNode) => number;
export interface SfxDef {
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
  /** Owns the moment: ducks the music and ambience for [seconds] down to [level]. */
  duck?: [number, number];
  /** Rattles you: the world dulls for a moment (0..1; 1 deafens, with a ring in the ears). */
  shock?: number;
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

  /** A shot into the land: a dull knock and a spit of grit. */
  shot_land: S((t, p, o) => {
    noise(o, t, 0.07, 'lowpass', 1400 * p, 300 * p, 0.8, 0.2, 0.001);
    tone(o, t, 'sine', 160 * p, 60 * p, 0.07, 0.16, 0.001);
    crackle(o, t + 0.01, 0.05, 3, 0.05);
    return 0.09;
  }, 0.05, 3, { low: true }),

  /** A truck sliding to a stop on dirt: a gravel scrape that slows, a short tyre squeal, the springs bottoming out. */
  skid: S((t, p, o) => {
    noise(o, t, 0.55, 'bandpass', 1100 * p, 380 * p, 0.9, 0.3, 0.02);
    noise(o, t, 0.5, 'lowpass', 700 * p, 200 * p, 0.7, 0.22, 0.01);
    const sq = filt(o, 'bandpass', 1500 * p, 9);
    noise(sq, t + 0.02, 0.32, 'bandpass', 1500 * p, 1150 * p, 6, 0.5, 0.03);
    noise(sq, t + 0.04, 0.26, 'bandpass', 2250 * p, 1800 * p, 6, 0.3, 0.03);
    crackle(o, t, 0.45, 14, 0.07);
    tone(o, t + 0.08, 'sine', 120 * p, 45 * p, 0.18, 0.22, 0.004);
    return 0.6;
  }, 0.15, 3, { rev: 0.08 }),

  /** A truck tearing away: the engine roaring up through its gears, the wheels spitting grit. */
  truck_rev: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 500, 2);
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.3);
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.6);
    const chop = ctx.createGain();
    chop.gain.value = 0.6;
    chop.connect(lp);
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(14, t);
    lfo.frequency.exponentialRampToValueAtTime(45, t + 0.32);
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(chop.gain);
    lfo.start(t);
    lfo.stop(t + 0.7);
    tone(chop, t, 'sawtooth', 48 * p, 150 * p, 0.62, 0.32, 0.02, 0.32);
    tone(chop, t, 'square', 24 * p, 75 * p, 0.62, 0.18, 0.02, 0.32);
    noise(o, t, 0.45, 'bandpass', 600 * p, 1400 * p, 0.8, 0.14, 0.03);
    crackle(o, t + 0.02, 0.4, 12, 0.06);
    return 0.7;
  }, 0.15, 3),

  /** Your shot thrown back: a hard metal ting that bends up and away. */
  reflect: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 3000 * p, 4);
    tone(bp, t, 'square', 1900 * p, 2600 * p, 0.12, 0.12, 0.001);
    tone(o, t, 'sine', 2600 * p, 4200 * p, 0.18, 0.06, 0.001);
    noise(o, t, 0.02, 'highpass', 5000, 5000, 0.7, 0.14);
    tone(o, t, 'sine', 220 * p, 90 * p, 0.08, 0.14, 0.001);
    return 0.2;
  }, 0.06, 3, { low: true }),

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

  // a seeker stopping dead to turn: a dry clock tick, a glassy ping over it
  seeker_halt: S((t, p, o) => {
    noise(o, t, 0.018, 'bandpass', 4200 * p, 4200 * p, 3, 0.16);
    tone(o, t, 'square', 1250 * p, 1250 * p, 0.03, 0.05, 0.001);
    tone(o, t + 0.01, 'sine', 2500 * p, 2450 * p, 0.16, 0.06, 0.002);
    return 0.2;
  }, 0.03, 4, { tuned: true }),

  // and off down its new leg: a short zip that climbs
  seeker_go: S((t, p, o) => {
    tone(o, t, 'sawtooth', 500 * p, 1900 * p, 0.09, 0.05, 0.002, 0.08);
    noise(o, t, 0.1, 'bandpass', 1500 * p, 6000 * p, 2, 0.08, 0.004);
    return 0.12;
  }, 0.03, 4),

  // a seeker shot down: a crystal going to pieces
  seeker_down: S((t, p, o) => {
    noise(o, t, 0.04, 'highpass', 3500, 3500, 0.7, 0.18);
    for (let i = 0; i < 6; i++) {
      const f = (2800 + Math.random() * 4200) * p;
      tone(o, t + Math.random() * 0.12, 'sine', f, f * 0.95, 0.05 + Math.random() * 0.08, 0.045, 0.001);
    }
    return 0.25;
  }, 0.04, 3, { rev: 0.2 }),

  explode_small: S((t, p, o) => {
    boom(o, t, p, 0.45, 0.26);
    return 0.5;
  }, 0.04, 6, { low: true }),

  explode_big: S((t, p, o) => {
    boom(o, t, p * 0.8, 1.2, 0.3);
    tone(o, t + 0.04, 'sine', 70 * p, 24 * p, 0.8, 0.26, 0.01);
    noise(o, t + 0.02, 0.5, 'bandpass', 500 * p, 250 * p, 0.9, 0.16, 0.01);
    return 1.1;
  }, 0.08, 3, { rev: 0.25, duck: [0.25, 0.6] }),

  explode_boss: S((t, p, o) => {
    boom(o, t, p, 1.5, 0.28);
    boom(o, t + 0.25, p * 1.15, 1, 0.22);
    boom(o, t + 0.6, p * 0.7, 1.9, 0.3);
    noise(o, t, 2.6, 'lowpass', 200 * p, 90, 0.8, 0.3, 0.2);
    return 2.8;
  }, 0.5, 1, { rev: 0.35, duck: [1.4, 0.3] }),

  player_hit: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2200);
    tone(lp, t, 'square', 320 * p, 70 * p, 0.26, 0.15, 0.001);
    tone(lp, t, 'sawtooth', 333 * p, 72 * p, 0.26, 0.1, 0.001);
    noise(o, t, 0.18, 'bandpass', 1200 * p, 400 * p, 0.8, 0.28);
    tone(o, t, 'sine', 110 * p, 40 * p, 0.2, 0.3, 0.002);
    return 0.3;
  }, 0.1, 2, { duck: [0.2, 0.7], shock: 0.3 }),

  player_down: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t, 'sawtooth', 700 * p, 45 * p, 1.1, 0.14, 0.005);
    tone(lp, t, 'square', 705 * p, 46 * p, 1.1, 0.07, 0.005);
    boom(o, t + 0.05, p * 0.8, 1.4, 0.3);
    return 1.3;
  }, 0.3, 2, { rev: 0.25, duck: [1.5, 0.3], shock: 1 }),

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

  /** The guard going up: a quick bright shimmer rising, so the ear has the window's start too. */
  guard_up: S((t, p, o) => {
    noise(o, t, 0.09, 'bandpass', 2500 * p, 7000 * p, 3, 0.12, 0.004);
    tone(o, t, 'sine', 880 * p, 1760 * p, 0.07, 0.06, 0.002);
    tone(o, t, 'triangle', 1320 * p, 2640 * p, 0.06, 0.025, 0.002);
    return 0.1;
  }, 0.05, 2),

  /** The guard fell with nothing in it: a dull sag, the long wait you bought. */
  guard_whiff: S((t, p, o) => {
    tone(filt(o, 'lowpass', 900), t, 'triangle', 420 * p, 150 * p, 0.22, 0.08, 0.004);
    noise(o, t, 0.16, 'lowpass', 1400, 300, 1, 0.05, 0.01);
    return 0.24;
  }, 0.1, 1, { low: true }),

  /** Dash pressed with none left: a dry click, so it's never a mystery why nothing went. */
  dash_dry: S((t, p, o) => {
    tone(o, t, 'square', 1200 * p, 900 * p, 0.02, 0.04, 0.001);
    noise(o, t, 0.03, 'bandpass', 2400 * p, 1800 * p, 2, 0.06);
    tone(o, t + 0.045, 'square', 900 * p, 700 * p, 0.02, 0.03, 0.001);
    return 0.08;
  }, 0.08, 1, { low: true }),

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
  }, 0.4, 1, { rev: 0.3, duck: [0.6, 0.5] }),

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

  // Vask's screech: a ragged cry falling away, two throats a little apart, and air tearing
  shriek: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 1700 * p, 1.6);
    tone(bp, t, 'sawtooth', 1450 * p, 640 * p, 0.42, 0.13, 0.015, 0.4);
    tone(bp, t, 'sawtooth', 1530 * p, 700 * p, 0.42, 0.1, 0.02, 0.38);
    tone(bp, t, 'square', 760 * p, 330 * p, 0.36, 0.05, 0.01, 0.34);
    noise(o, t, 0.34, 'bandpass', 3200 * p, 1500 * p, 1.4, 0.1, 0.01);
    return 0.45;
  }, 0.12, 3, { rev: 0.3 }),

  // a great wing coming down: a leathery snap and a whump of air
  wingbeat: S((t, p, o) => {
    noise(o, t, 0.08, 'bandpass', 900 * p, 500 * p, 1.2, 0.18, 0.004);
    noise(o, t + 0.02, 0.38, 'lowpass', 520 * p, 110 * p, 0.8, 0.5, 0.03);
    tone(o, t + 0.02, 'sine', 78 * p, 38 * p, 0.3, 0.32, 0.01);
    return 0.42;
  }, 0.15, 2, { rev: 0.15 }),

  // the Waking Engine counting: a click, then a clean struck tone (a bell's partials, no wobble)
  toll: S((t, p, o) => {
    tone(o, t, 'square', 3200 * p, 2400 * p, 0.012, 0.05, 0.001);
    tone(o, t + 0.01, 'sine', 494 * p, 494 * p, 1.3, 0.14, 0.003, 1.3);
    tone(o, t + 0.01, 'sine', 988 * p, 988 * p, 0.6, 0.05, 0.003);
    tone(o, t + 0.01, 'sine', 1363 * p, 1363 * p, 0.35, 0.035, 0.002);
    tone(o, t + 0.01, 'triangle', 247 * p, 247 * p, 0.9, 0.05, 0.01);
    return 1.35;
  }, 0.05, 6, { tuned: true, rev: 0.4 }),

  // ice breaking off it: sharp cracks over a deep groan
  ice_crack: S((t, p, o) => {
    for (const [at, f] of [[0, 4200], [0.05, 3100], [0.13, 5200]] as const) noise(o, t + at, 0.05, 'highpass', f * p, f * p, 0.8, 0.3, 0.001);
    noise(o, t + 0.02, 0.5, 'bandpass', 1300 * p, 400 * p, 1.2, 0.14, 0.01);
    tone(o, t, 'sine', 70 * p, 46 * p, 0.6, 0.26, 0.02);
    return 0.65;
  }, 0.12, 3, { rev: 0.35 }),

  // half asleep, it breathes out frost: a long cold hiss and a faint shimmer
  frost_breath: S((t, p, o) => {
    noise(o, t, 1.1, 'bandpass', 2600 * p, 900 * p, 0.9, 0.06, 0.35);
    tone(o, t + 0.1, 'sine', 2093 * p, 2217 * p, 0.9, 0.012, 0.3);
    tone(o, t, 'sine', 98 * p, 82 * p, 1.0, 0.05, 0.4);
    return 1.2;
  }, 0.5, 1, { rev: 0.4 }),

  // the Engine coming awake: a vast machine groan rising through a chord, and a toll on top
  engine_wake: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 900);
    for (const [f, v] of [[49, 0.12], [73.5, 0.08], [98, 0.06]] as const) tone(lp, t, 'sawtooth', f * 0.75 * p, f * p, 1.8, v, 0.4, 1.4);
    noise(o, t, 1.6, 'lowpass', 300 * p, 900 * p, 1, 0.16, 0.5);
    tone(o, t + 1.2, 'sine', 988 * p, 988 * p, 1.4, 0.08, 0.003);
    tone(o, t + 1.2, 'sine', 1481 * p, 1481 * p, 1.0, 0.04, 0.003);
    return 2.6;
  }, 1, 1, { rev: 0.5 }),

  // Istra's call to her crew, HEAVE: one voice, a long rising "hee" falling into "ave" (a buzz
  // through two formants, a breath of h before it)
  istra_call: S((t, p, o) => {
    noise(o, t, 0.08, 'bandpass', 1800 * p, 1400 * p, 1, 0.05, 0.01);
    for (const [at, f0, f1, d, a, b] of [[0.06, 230, 290, 0.3, [380, 340], [2200, 2350]], [0.34, 290, 205, 0.26, [560, 520], [1750, 1600]]] as const) {
      for (const [k, [g0, g1]] of [a, b].entries()) {
        const bp = filt(o, 'bandpass', g0 * p, 7);
        bp.frequency.linearRampToValueAtTime(g1 * p, t + at + d);
        tone(bp, t + at, 'sawtooth', f0 * p, f1 * p, d, k ? 0.16 : 0.3, 0.03);
      }
    }
    return 0.65;
  }, 0.3, 1, { rev: 0.3, tuned: true }),

  // her crew answers, HO: a deck of rough voices on one shout, a little apart
  crew_ho: S((t, p, o) => {
    const f1 = filt(o, 'bandpass', 520 * p, 5);
    const f2 = filt(o, 'bandpass', 880 * p, 6);
    for (let k = 0; k < 6; k++) {
      const f = (105 + k * 13 + Math.random() * 8) * p;
      const at = t + Math.random() * 0.04;
      tone(f1, at, 'sawtooth', f * 1.06, f * 0.94, 0.3, 0.09, 0.02);
      tone(f2, at, 'sawtooth', f * 1.06, f * 0.94, 0.3, 0.05, 0.02);
    }
    noise(o, t, 0.12, 'bandpass', 900 * p, 600 * p, 1.2, 0.08, 0.005);
    return 0.4;
  }, 0.1, 3, { rev: 0.25 }),

  // a broadside gun: a wooden carriage kicking back, a deep cough of powder
  cannon: S((t, p, o) => {
    boom(o, t, p * 0.75, 0.8, 0.3);
    tone(o, t, 'triangle', 190 * p, 80 * p, 0.12, 0.18, 0.001);
    noise(o, t + 0.01, 0.05, 'bandpass', 1400 * p, 900 * p, 2, 0.12, 0.001);
    return 0.7;
  }, 0.08, 4, { rev: 0.2 }),

  // the Throne-Shell sounding: a slap of water, a long groan of a dead hulk, bubbles going down
  whale_dive: S((t, p, o) => {
    noise(o, t, 0.5, 'bandpass', 1300 * p, 380 * p, 1.1, 0.22, 0.01);
    const lp = filt(o, 'lowpass', 420);
    tone(lp, t + 0.1, 'sawtooth', 72 * p, 44 * p, 1.2, 0.12, 0.15);
    tone(o, t + 0.05, 'sine', 58 * p, 34 * p, 1.0, 0.22, 0.05);
    for (let k = 0; k < 7; k++) tone(o, t + 0.25 + k * 0.09 + Math.random() * 0.04, 'sine', (500 + Math.random() * 400) * p, (900 + Math.random() * 500) * p, 0.06, 0.03, 0.003);
    return 1.3;
  }, 0.5, 1, { rev: 0.35 }),

  // and up through the surface: a burst of spray, a thump of a hull hitting air, her groan
  whale_breach: S((t, p, o) => {
    boom(o, t, p * 0.6, 1.4, 0.4);
    noise(o, t, 0.25, 'highpass', 2600 * p, 1800 * p, 0.7, 0.24, 0.002);
    noise(o, t + 0.05, 1.3, 'lowpass', 2400 * p, 260 * p, 0.8, 0.3, 0.02);
    const lp = filt(o, 'lowpass', 380);
    tone(lp, t + 0.08, 'sawtooth', 48 * p, 66 * p, 1.1, 0.14, 0.2);
    return 1.5;
  }, 0.3, 2, { rev: 0.3, duck: [0.3, 0.6] }),

  // the tide turning: surf drawn up a beach, a hush, and the swell of it coming back
  tide_turn: S((t, p, o) => {
    noise(o, t, 0.55, 'bandpass', 500 * p, 1900 * p, 0.9, 0.12, 0.35);
    noise(o, t + 0.5, 0.8, 'bandpass', 1900 * p, 420 * p, 0.9, 0.14, 0.05);
    tone(o, t, 'sine', 46 * p, 58 * p, 1.2, 0.14, 0.4);
    return 1.35;
  }, 0.4, 1, { rev: 0.45 }),

  // the Throne-Shell drawing breath: a vast slow inhale through its intake and chambers
  whale_breath: S((t, p, o) => {
    noise(o, t, 1.4, 'lowpass', 260 * p, 1500 * p, 1.4, 0.2, 0.9);
    noise(o, t + 0.2, 1.2, 'bandpass', 700 * p, 2400 * p, 1.2, 0.06, 0.8);
    tone(o, t, 'sine', 42 * p, 52 * p, 1.4, 0.16, 0.8);
    return 1.5;
  }, 0.6, 1, { rev: 0.4 }),

  // ARU-0's account notice: the company's two-note chime, pleasant as an airport's
  notice: S((t, p, o) => {
    for (const [at, f] of [[0, 784], [0.24, 622]] as const) {
      tone(o, t + at, 'sine', f * p, f * p, 0.95, 0.15, 0.004, 0.95);
      tone(o, t + at, 'sine', f * 2 * p, f * 2 * p, 0.32, 0.035, 0.003);
      tone(o, t + at, 'triangle', f * 0.5 * p, f * 0.5 * p, 0.6, 0.035, 0.01);
    }
    return 1.25;
  }, 0.4, 1, { rev: 0.35, tuned: true }),

  // its hold printing the lien: a dot-matrix head chattering across, the carriage motor, a paper feed
  printer: S((t, p, o) => {
    for (let k = 0; k < 22; k++) {
      const at = t + k * 0.028 + (k >= 11 ? 0.06 : 0);
      noise(o, at, 0.012, 'bandpass', (2600 + (k % 3) * 500) * p, 2400 * p, 4, 0.16, 0.001);
      tone(o, at, 'square', 1400 * p, 1300 * p, 0.008, 0.02, 0.001);
    }
    tone(filt(o, 'lowpass', 900), t, 'sawtooth', 110 * p, 130 * p, 0.75, 0.04, 0.02);
    noise(o, t + 0.74, 0.08, 'bandpass', 900 * p, 600 * p, 1.5, 0.12, 0.002);
    return 0.85;
  }, 0.3, 1, { rev: 0.15 }),

  // a claw thrown on its cable: the whip of it going, the jaws snapping shut
  claw: S((t, p, o) => {
    noise(o, t, 0.18, 'bandpass', 900 * p, 2400 * p, 1.2, 0.1, 0.01);
    for (const [at, f] of [[0.12, 2300], [0.15, 3100]] as const) {
      noise(o, t + at, 0.02, 'highpass', f * p, f * p, 1, 0.2, 0.001);
      tone(o, t + at, 'square', 700 * p, 480 * p, 0.03, 0.05, 0.001);
    }
    return 0.3;
  }, 0.06, 3, { rev: 0.15 }),

  // its winches taking up the lines: a motor winding up under a ratchet
  winch: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 1200);
    tone(lp, t, 'sawtooth', 70 * p, 150 * p, 1.6, 0.08, 0.1);
    tone(lp, t, 'square', 140 * p, 300 * p, 1.6, 0.025, 0.1);
    for (let k = 0; k < 14; k++) noise(o, t + k * 0.1, 0.01, 'bandpass', 3000 * p, 3000 * p, 3, 0.09, 0.001);
    return 1.6;
  }, 0.5, 1, { rev: 0.2 }),

  // scrap reeled home and bolted on as a plate: a clank, and the bolt gun
  plate_on: S((t, p, o) => {
    boom(o, t, p * 1.4, 0.3, 0.12);
    for (const f of [520, 830, 1290]) tone(o, t, 'triangle', f * p, f * p * 0.98, 0.35, 0.05, 0.001);
    for (let k = 0; k < 3; k++) noise(o, t + 0.12 + k * 0.05, 0.02, 'bandpass', 4200 * p, 4200 * p, 3, 0.11, 0.001);
    return 0.45;
  }, 0.06, 3, { rev: 0.2, tuned: true }),

  // a plate of company hull torn off: metal shrieking as it gives, and the crack as it goes
  plate_tear: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 600 * p, 9);
    bp.frequency.linearRampToValueAtTime(2600 * p, t + 0.55);
    tone(bp, t, 'sawtooth', 90 * p, 160 * p, 0.6, 0.35, 0.02);
    noise(o, t, 0.6, 'bandpass', 1500 * p, 3800 * p, 2, 0.1, 0.05);
    noise(o, t + 0.55, 0.06, 'highpass', 3000 * p, 3000 * p, 0.8, 0.28, 0.001);
    boom(o, t + 0.55, p * 0.9, 0.5, 0.15);
    return 0.9;
  }, 0.3, 2, { rev: 0.3 }),

  // ballast striking the edge of the field: a long clang, like a struck hull
  clang: S((t, p, o) => {
    noise(o, t, 0.02, 'highpass', 3000 * p, 3000 * p, 1, 0.28, 0.001);
    for (const [f, a, d] of [[310, 0.12, 0.9], [697, 0.08, 0.6], [1137, 0.05, 0.4], [1720, 0.03, 0.25]] as const) tone(o, t, 'sine', f * p, f * p * 0.995, d, a, 0.001);
    return 0.95;
  }, 0.08, 3, { rev: 0.35, tuned: true }),

  // Khet's shout from the brow: one rough voice, a bark of "HYAH" (a buzz through an open a)
  khet_yell: S((t, p, o) => {
    noise(o, t, 0.06, 'bandpass', 1500 * p, 1100 * p, 1, 0.08, 0.005);
    for (const [g0, g1, v] of [[680, 760, 0.3], [1150, 1250, 0.18], [2500, 2400, 0.06]] as const) {
      const bp = filt(o, 'bandpass', g0 * p, 6);
      bp.frequency.linearRampToValueAtTime(g1 * p, t + 0.3);
      tone(bp, t + 0.03, 'sawtooth', 170 * p, 128 * p, 0.32, v, 0.02);
      tone(bp, t + 0.03, 'sawtooth', 173 * p, 130 * p, 0.32, v * 0.6, 0.03);
    }
    return 0.4;
  }, 0.35, 1, { rev: 0.25 }),

  // a junk thruster bolted to the titan lighting: a cough, then a ragged roar with grit in it
  thruster: S((t, p, o) => {
    noise(o, t, 0.05, 'bandpass', 900 * p, 500 * p, 1.5, 0.2, 0.002);
    noise(o, t + 0.03, 0.8, 'lowpass', 600 * p, 2200 * p, 0.9, 0.26, 0.12);
    noise(o, t + 0.03, 0.7, 'bandpass', 2400 * p, 3600 * p, 1.4, 0.06, 0.2);
    tone(o, t, 'sine', 52 * p, 64 * p, 0.8, 0.2, 0.08);
    crackle(o, t + 0.1, 0.6, 14, 0.12);
    return 0.9;
  }, 0.25, 2, { rev: 0.15 }),

  // the titan's own joints: a slow hydraulic groan under a hiss, and the stop as it seats
  titan_servo: S((t, p, o) => {
    tone(o, t, 'sine', 46 * p, 62 * p, 0.7, 0.24, 0.15);
    tone(o, t, 'sine', 92 * p, 124 * p, 0.6, 0.06, 0.2);
    noise(o, t, 0.6, 'bandpass', 380 * p, 620 * p, 3, 0.1, 0.2);
    noise(o, t + 0.1, 0.5, 'highpass', 5200 * p, 4200 * p, 0.7, 0.03, 0.15);
    metal(o, t + 0.62, 140 * p, 0.07, 0.6);
    return 1.3;
  }, 0.3, 2, { rev: 0.3 }),

  // the titan coming down: the ground taking it, and the head ringing like a struck bell
  titan_land: S((t, p, o) => {
    boom(o, t, p * 0.55, 1.6, 0.42);
    metal(o, t + 0.02, 74 * p, 0.12, 1.6);
    metal(o, t + 0.04, 187 * p, 0.05, 0.9);
    noise(o, t + 0.05, 0.9, 'lowpass', 1200 * p, 140 * p, 0.8, 0.2, 0.01);
    return 1.7;
  }, 0.3, 1, { rev: 0.4, duck: [0.4, 0.6], shock: 0.25 }),

  // the Compact's light marking out what it will do: two clean tones a fifth apart, held, even
  light_tone: S((t, p, o) => {
    for (const [f, v] of [[587, 0.07], [880, 0.05], [1174, 0.02]] as const) tone(o, t, 'sine', f * p, f * p, 0.9, v, 0.08);
    noise(o, t, 0.5, 'highpass', 7000 * p, 7000 * p, 0.7, 0.012, 0.1);
    return 1;
  }, 0.12, 3, { tuned: true, rev: 0.45 }),

  // the light glassing the ground: a clear note as it touches, the sand going to glass in a ring
  glass_fall: S((t, p, o) => {
    tone(o, t, 'sine', 1760 * p, 1760 * p, 0.5, 0.05, 0.003);
    for (const [f, d] of [[3170, 0.3], [4620, 0.22], [6110, 0.15]] as const) tone(o, t + 0.02, 'sine', f * p, f * p * 0.996, d, 0.02, 0.001);
    noise(o, t, 0.25, 'highpass', 6000 * p, 4000 * p, 0.8, 0.05, 0.004);
    tone(o, t, 'sine', 90 * p, 60 * p, 0.25, 0.1, 0.004);
    return 0.55;
  }, 0.04, 6, { tuned: true, rev: 0.4 }),

  // glass breaking: a burst of tiny high pings and grit
  glass_burst: S((t, p, o) => {
    noise(o, t, 0.04, 'highpass', 4000 * p, 4000 * p, 0.8, 0.22, 0.001);
    for (let k = 0; k < 9; k++) {
      const f = (2600 + Math.random() * 4200) * p;
      tone(o, t + Math.random() * 0.12, 'sine', f, f * 0.99, 0.06 + Math.random() * 0.1, 0.03, 0.001);
    }
    noise(o, t + 0.02, 0.3, 'bandpass', 5200 * p, 2600 * p, 1, 0.07, 0.01);
    return 0.4;
  }, 0.05, 4, { rev: 0.25 }),

  // heists: an engine on the runner blows, and its turbine winds down
  engine_out: S((t, p, o) => {
    boom(o, t, p * 0.8, 1.3, 0.32);
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t + 0.05, 'sawtooth', 420 * p, 60 * p, 1.3, 0.07, 0.01, 1.2);
    tone(lp, t + 0.05, 'square', 210 * p, 40 * p, 1.3, 0.04, 0.01, 1.2);
    noise(o, t + 0.1, 1.1, 'bandpass', 900 * p, 200 * p, 2, 0.08, 0.05);
    return 1.4;
  }, 0.3, 2, { rev: 0.25, duck: [0.4, 0.55] }),

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
  }, 1, 1, { rev: 0.4, duck: [1, 0.4] }),

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
  }, 0.07, 3, { rev: 0.25, duck: [0.2, 0.7] }),

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
    // the clink of salvage landing in the hold, on the same rising step
    metal(o, t, f * 0.5, 0.05, 0.16);
    // and a bright bell over it: something nice
    tone(o, t + 0.02, 'sine', f * 2, f * 2, 0.22, 0.04, 0.002);
    tone(o, t + 0.05, 'sine', f * 3, f * 3, 0.16, 0.018, 0.002);
    noise(o, t, 0.025, 'highpass', 6000, 6000, 0.7, 0.05);
    return 0.26;
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
  }, 0.2, 2, { rev: 0.35, duck: [0.7, 0.45], shock: 0.2 }),

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

  // --- wreck grafts ---------------------------------------------------------------------------

  // a graft dealt off the wreck: a plate of hull dropped on the bench, and its ring
  graft_deal: S((t, p, o) => {
    noise(o, t, 0.05, 'bandpass', 1600 * p, 700 * p, 1.6, 0.12, 0.001);
    tone(o, t, 'square', 150 * p, 60 * p, 0.05, 0.08, 0.001);
    tone(filt(o, 'bandpass', 2400 * p, 8), t + 0.005, 'triangle', 1870 * p, 1840 * p, 0.3, 0.035, 0.001);
    tone(filt(o, 'bandpass', 3100 * p, 8), t + 0.005, 'triangle', 2950 * p, 2930 * p, 0.22, 0.02, 0.001);
    return 0.35;
  }, 0.04, 4, { tuned: true, rev: 0.2 }),

  // a graft bolted on: a heavy clamp, a ratchet going round, a hiss of steam off the weld
  graft_bolt: S((t, p, o) => {
    tone(o, t, 'sine', 120 * p, 40 * p, 0.22, 0.3, 0.001);
    noise(o, t, 0.08, 'lowpass', 2400, 600, 0.8, 0.22, 0.001);
    tone(filt(o, 'bandpass', 900 * p, 4), t, 'square', 220 * p, 110 * p, 0.08, 0.12, 0.001);
    for (let k = 0; k < 6; k++) noise(o, t + 0.1 + k * 0.035, 0.012, 'bandpass', 4200 * p, 3800 * p, 3, 0.07, 0.001);
    tone(filt(o, 'bandpass', 2600 * p, 10), t + 0.32, 'triangle', 2200 * p, 2160 * p, 0.4, 0.03, 0.001);
    noise(o, t + 0.3, 0.5, 'highpass', 5000, 9000, 0.6, 0.05, 0.02);
    return 0.85;
  }, 0.1, 2, { tuned: true, rev: 0.3 }),

  // a bond waking: three of a kind come to life together, a low swell under a rising chord
  bond_wake: S((t, p, o) => {
    tone(o, t, 'sine', 41 * p, 82 * p, 1.2, 0.22, 0.3, 0.9);
    noise(o, t, 0.7, 'bandpass', 300, 2400, 0.8, 0.05, 0.4);
    [0, 7, 12, 16, 19].forEach((n, i) => {
      const f = mtof(57 + n) * p;
      tone(o, t + 0.35 + i * 0.06, 'sawtooth', f, f, 1.2, 0.022, 0.05);
      tone(o, t + 0.35 + i * 0.06, 'triangle', f * 2, f * 2, 1.4, 0.04, 0.01);
    });
    tone(o, t + 0.35, 'square', 110 * p, 55 * p, 0.12, 0.12, 0.001);
    noise(o, t + 0.35, 0.12, 'lowpass', 3000, 400, 0.7, 0.2, 0.001);
    [31, 36, 40, 43].forEach((n, i) => tone(o, t + 0.9 + i * 0.08, 'sine', mtof(57 + n) * p, mtof(57 + n) * p, 0.6, 0.03, 0.002));
    noise(o, t + 0.6, 1.4, 'highpass', 6000, 12000, 0.6, 0.03, 0.2);
    return 2.2;
  }, 1, 1, { tuned: true, rev: 0.55 }),

  // --- the core -------------------------------------------------------------------------------

  // the core on its bench: a low, wet breath of mould and a far-off hum
  core_hum: S((t, p, o) => {
    tone(o, t, 'sine', 55 * p, 58 * p, 1.6, 0.12, 0.6);
    tone(filt(o, 'lowpass', 600), t, 'triangle', 110 * p, 112 * p, 1.6, 0.04, 0.6);
    noise(o, t, 1.4, 'bandpass', 300, 500, 1.2, 0.04, 0.5);
    return 1.8;
  }, 1, 1, { tuned: true, rev: 0.6 }),

  // a point of learning lands: a soft, glassy drip (pitched up as the meter fills)
  core_feed: S((t, p, o) => {
    tone(o, t, 'sine', 880 * p, 1320 * p, 0.12, 0.05, 0.002, 0.03);
    tone(o, t + 0.01, 'triangle', 1760 * p, 1760 * p, 0.18, 0.015, 0.002);
    return 0.2;
  }, 0.025, 6, { tuned: true, rev: 0.4 }),

  // a knot grows: a wet creak of something stretching, then a swell
  core_grow: S((t, p, o) => {
    tone(filt(o, 'bandpass', 700 * p, 3), t, 'sawtooth', 90 * p, 180 * p, 0.5, 0.06, 0.05);
    noise(o, t, 0.5, 'bandpass', 400 * p, 1600 * p, 2, 0.05, 0.1);
    [0, 4, 7].forEach((n, i) => tone(o, t + 0.25 + i * 0.05, 'triangle', mtof(64 + n) * p, mtof(64 + n) * p, 0.6, 0.03, 0.01));
    return 0.9;
  }, 0.1, 2, { tuned: true, rev: 0.5 }),

  // the core wakes: a breath in, a heartbeat, and a chord that opens all the way
  core_wake: S((t, p, o) => {
    noise(o, t, 0.8, 'bandpass', 200, 3000, 1, 0.08, 0.7);
    tone(o, t + 0.6, 'sine', 70 * p, 40 * p, 0.25, 0.4, 0.002);
    tone(o, t + 0.9, 'sine', 70 * p, 40 * p, 0.25, 0.3, 0.002);
    [0, 7, 12, 16, 19, 24].forEach((n, i) => {
      const f = mtof(50 + n) * p;
      tone(o, t + 1.2 + i * 0.07, 'triangle', f, f, 2.4, 0.05, 0.05);
      tone(o, t + 1.2 + i * 0.07, 'sawtooth', f, f * 1.003, 2.0, 0.012, 0.2);
    });
    noise(o, t + 1.2, 2.2, 'highpass', 6000, 12000, 0.6, 0.03, 0.4);
    return 3.6;
  }, 2, 1, { tuned: true, rev: 0.7, duck: [3, 0.35] }),

  // an imprint taken: a seal pressed into wax, and a little bell
  imprint: S((t, p, o) => {
    tone(o, t, 'sine', 160 * p, 70 * p, 0.12, 0.18, 0.001);
    noise(o, t, 0.06, 'lowpass', 1800, 400, 0.8, 0.12, 0.001);
    tone(o, t + 0.06, 'triangle', 1320 * p, 1320 * p, 0.5, 0.04, 0.002);
    tone(o, t + 0.1, 'triangle', 1980 * p, 1980 * p, 0.4, 0.025, 0.002);
    return 0.6;
  }, 0.06, 2, { tuned: true, rev: 0.4 }),

  // an imprint shaken loose: a seal cracking off, falling away
  shaken: S((t, p, o) => {
    noise(o, t, 0.08, 'bandpass', 3000 * p, 1200 * p, 2, 0.16, 0.001);
    tone(o, t, 'triangle', 1320 * p, 330 * p, 0.45, 0.06, 0.002);
    tone(o, t + 0.05, 'square', 220 * p, 110 * p, 0.1, 0.05, 0.001);
    return 0.5;
  }, 0.2, 1, { tuned: true, rev: 0.4 }),

  // the Waking Engine calls: a slow, enormous tone from everywhere at once
  engine_call: S((t, p, o) => {
    tone(o, t, 'sine', 36 * p, 36 * p, 2.4, 0.3, 0.6);
    tone(filt(o, 'lowpass', 900), t, 'sawtooth', 72 * p, 71 * p, 2.4, 0.06, 0.8);
    tone(o, t + 0.2, 'sine', 108 * p, 107 * p, 2.0, 0.04, 0.8);
    noise(o, t, 2.4, 'bandpass', 120, 260, 1.5, 0.08, 1);
    return 2.8;
  }, 2, 1, { tuned: true, rev: 0.8, duck: [2.4, 0.4] }),

  // a woken core says no: the call cut short, and a bright bark back
  core_refuse: S((t, p, o) => {
    noise(o, t, 0.12, 'lowpass', 4000, 300, 0.8, 0.2, 0.001);
    tone(o, t, 'square', 220 * p, 440 * p, 0.12, 0.08, 0.001);
    [0, 4, 7, 12].forEach((n, i) => tone(o, t + 0.08 + i * 0.04, 'triangle', mtof(69 + n) * p, mtof(69 + n) * p, 0.5, 0.05, 0.002));
    return 0.8;
  }, 0.5, 1, { tuned: true, rev: 0.5 }),

  // the core says something: a chirp of mould-voice
  core_bark: S((t, p, o) => {
    for (let k = 0; k < 4; k++) {
      const f = (500 + Math.random() * 500) * p;
      tone(filt(o, 'bandpass', f * 2, 4), t + k * 0.05, 'sawtooth', f, f * 1.2, 0.04, 0.03, 0.002);
    }
    return 0.25;
  }, 0.2, 1, { tuned: true, rev: 0.3 }),

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
  }, 0.08, 2, { rev: 0.35, duck: [0.3, 0.6] }),

  /** VENGEFUL: the hull lets go: a deep whump, a ring of shrapnel whistling out. */
  nova: S((t, p, o) => {
    boom(o, t, p * 0.7, 0.8, 0.36);
    tone(o, t, 'sine', 70 * p, 30 * p, 0.6, 0.3, 0.002);
    for (let i = 0; i < 6; i++) {
      const f = (1600 + Math.random() * 1800) * p;
      tone(o, t + 0.03 + i * 0.02, 'sine', f, f * 0.6, 0.2, 0.025, 0.002);
    }
    return 0.8;
  }, 0.2, 1, { rev: 0.3, duck: [0.3, 0.6] }),

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

  // boarding: on foot aboard a freighter --------------------------------------------------------

  // the rivet pistol, as a recorded gunshot is built: no tones but the sub, all shaped noise. A
  // split-second crack, a dense blast of air falling from bright to dark, a thump in the chest,
  // the slide's two metal clicks, and the steel room slapping it back (~7/s: the weight is early)
  foot_shot: S((t, p, o) => {
    // the crack: broadband, a few ms, driven so it's dense rather than thin
    noise(drive(filt(o, 'highpass', 1500), 0.6), t, 0.007, 'highpass', 2200, 2200, 0.5, 0.5, 0.0005);
    // the blast: wideband air, the lowpass closing fast
    noise(o, t, 0.09, 'lowpass', 7000 * p, 450 * p, 0.6, 0.34, 0.0008);
    noise(o, t, 0.05, 'bandpass', 1300 * p, 700 * p, 0.9, 0.18, 0.001);
    // the weight: a sine thump and a dark push of air under it
    tone(o, t, 'sine', 125 * p, 42 * p, 0.12, 0.24, 0.001, 0.08);
    noise(o, t, 0.13, 'lowpass', 320, 120, 0.7, 0.24, 0.002);
    // the slide back and home: two tight, resonant clicks of steel
    noise(o, t + 0.032, 0.008, 'bandpass', 3400 * p, 3400 * p, 9, 0.22, 0.0005);
    noise(o, t + 0.058, 0.01, 'bandpass', 2500 * p, 2500 * p, 9, 0.2, 0.0005);
    // the room: a short, dark slap off the bulkheads
    noise(o, t + 0.018, 0.2, 'bandpass', 900 * p, 500 * p, 0.8, 0.05, 0.01);
    return 0.24;
  }, 0.04, 4, { low: true, rev: 0.18 }),

  // the breacher: a chest-deep boom with a crack on top, and a short ring of the barrel after it
  foot_blast: S((t, p, o) => {
    tone(o, t, 'sine', 115 * p, 32 * p, 0.42, 0.46, 0.001, 0.22);
    tone(o, t, 'triangle', 190 * p, 52 * p, 0.22, 0.26, 0.001);
    noise(o, t, 0.32, 'lowpass', 3200 * p, 180 * p, 0.8, 0.34, 0.001);
    noise(o, t, 0.035, 'highpass', 2600, 2600, 0.7, 0.34);
    noise(o, t, 0.08, 'bandpass', 1900 * p, 900 * p, 1, 0.2);
    crackle(o, t + 0.02, 0.22, 9, 0.11);
    const bp = filt(o, 'bandpass', 1350 * p, 6);
    tone(bp, t + 0.01, 'square', 1120 * p, 1090 * p, 0.32, 0.05, 0.001);
    tone(o, t + 0.01, 'sine', 2380 * p, 2360 * p, 0.38, 0.018, 0.001);
    return 0.45;
  }, 0.1, 2, { rev: 0.22, duck: [0.15, 0.75] }),

  // a shell thumbed back into the breacher: chk-chk
  foot_shell: S((t, p, o) => {
    for (const [at, k] of [[0, 1], [0.085, 1.18]] as const) {
      noise(o, t + at, 0.03, 'bandpass', 2200 * p * k, 3600 * p * k, 1.6, 0.08, 0.004);
      tone(o, t + at + 0.01, 'square', 700 * p * k, 360 * p * k, 0.025, 0.07, 0.001);
      noise(o, t + at + 0.01, 0.015, 'highpass', 4200, 4200, 0.7, 0.08);
    }
    return 0.14;
  }, 0.06, 2, { low: true }),

  // out of shells: the hammer on nothing, hollow
  foot_dry: S((t, p, o) => {
    tone(o, t, 'square', 1700 * p, 1500 * p, 0.015, 0.05, 0.001);
    noise(o, t, 0.015, 'highpass', 4500, 4500, 0.9, 0.07);
    tone(o, t, 'triangle', 320 * p, 260 * p, 0.04, 0.06, 0.001);
    return 0.06;
  }, 0.12, 1, { low: true }),

  // a boot on deck plate: a soft thud and the faintest clank of loose plating
  step: S((t, p, o) => {
    noise(o, t, 0.05, 'lowpass', 900 * p, 280 * p, 0.8, 0.07, 0.002);
    tone(o, t, 'sine', 115 * p, 70 * p, 0.05, 0.08, 0.002);
    const f = (560 + Math.random() * 260) * p;
    tone(o, t + 0.004, 'sine', f, f, 0.07, 0.01, 0.001);
    tone(o, t + 0.004, 'sine', f * 2.76, f * 2.76, 0.035, 0.005, 0.001);
    return 0.08;
  }, 0.08, 2, { low: true, rev: 0.04 }),

  // the slide: a body scuffing fast across steel, a rattle of gear with it
  slide: S((t, p, o) => {
    tone(o, t, 'sine', 140 * p, 80 * p, 0.07, 0.12, 0.002);
    noise(o, t, 0.28, 'bandpass', 500 * p, 1900 * p, 1.2, 0.2, 0.02);
    noise(o, t + 0.02, 0.22, 'highpass', 3000, 5200, 0.7, 0.06, 0.03);
    for (let i = 0; i < 3; i++) {
      const tt = t + 0.04 + Math.random() * 0.2;
      const f = (900 + Math.random() * 1300) * p;
      tone(o, tt, 'square', f, f * 0.97, 0.018, 0.02, 0.001);
    }
    return 0.32;
  }, 0.1, 2),

  // the takedown: a body slammed down, a crunch, a deep thump, and the deck ringing like a bell
  takedown: S((t, p, o) => {
    tone(o, t, 'sine', 150 * p, 35 * p, 0.42, 0.48, 0.001, 0.2);
    noise(o, t, 0.25, 'lowpass', 1600 * p, 150 * p, 0.8, 0.34, 0.001);
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.3);
    noise(o, t + 0.01, 0.1, 'bandpass', 1300 * p, 500 * p, 1.3, 0.26);
    crackle(o, t + 0.01, 0.12, 12, 0.18);
    tone(filt(o, 'lowpass', 1200), t, 'square', 230 * p, 60 * p, 0.15, 0.13, 0.001);
    tone(o, t + 0.07, 'sine', 72 * p, 30 * p, 0.4, 0.28, 0.004);
    metal(o, t + 0.015, 1180 * p, 0.06, 0.9);
    return 1.0;
  }, 0.1, 2, { rev: 0.3, duck: [0.35, 0.55] }),

  // a shoulder into someone not open: a short knock
  punch: S((t, p, o) => {
    tone(o, t, 'sine', 165 * p, 60 * p, 0.12, 0.24, 0.001);
    noise(o, t, 0.06, 'bandpass', 1100 * p, 500 * p, 1.2, 0.16);
    noise(o, t, 0.015, 'highpass', 3000, 3000, 0.7, 0.1);
    return 0.14;
  }, 0.05, 3),

  // a body on the deck: a thud, a second bounce, and gear clattering after it
  body_fall: S((t, p, o) => {
    tone(o, t, 'sine', 110 * p, 45 * p, 0.22, 0.16, 0.002);
    noise(o, t, 0.15, 'lowpass', 750 * p, 150 * p, 0.8, 0.12, 0.002);
    tone(o, t + 0.09, 'sine', 95 * p, 40 * p, 0.15, 0.09, 0.002);
    for (let i = 0; i < 4; i++) {
      const tt = t + 0.05 + Math.random() * 0.3;
      const f = (900 + Math.random() * 1300) * p;
      tone(o, tt, 'sine', f, f, 0.06, 0.025, 0.001);
      tone(o, tt, 'sine', f * 2.76, f * 2.76, 0.03, 0.01, 0.001);
    }
    return 0.5;
  }, 0.06, 3, { low: true, rev: 0.15 }),

  // a heavy wrench through the air: a swelling whoosh
  swing: S((t, p, o) => {
    noise(o, t, 0.28, 'bandpass', 350 * p, 1600 * p, 2, 0.22, 0.17);
    tone(o, t, 'sine', 95 * p, 60 * p, 0.26, 0.06, 0.15);
    return 0.3;
  }, 0.08, 3),

  // hit on foot: a dull blow and a short, driven crunch over it
  foot_hurt: S((t, p, o) => {
    tone(o, t, 'sine', 130 * p, 45 * p, 0.25, 0.42, 0.001);
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t, 'square', 260 * p, 70 * p, 0.2, 0.13, 0.001);
    tone(lp, t, 'sawtooth', 272 * p, 72 * p, 0.2, 0.08, 0.001);
    const d = drive(filt(o, 'lowpass', 3000), 0.22);
    noise(d, t, 0.12, 'bandpass', 1500 * p, 500 * p, 1, 0.6);
    crackle(o, t, 0.1, 6, 0.14);
    return 0.28;
  }, 0.1, 2, { duck: [0.2, 0.7], shock: 0.25 }),

  // a crewman hit: a rivet going into padding and the body behind it, a meaty thwack with a crunch
  crew_hit: S((t, p, o) => {
    // the smack: a slap of noise through a little drive
    noise(drive(filt(o, 'lowpass', 4200), 0.45), t, 0.045, 'bandpass', 1700 * p, 600 * p, 1.2, 0.4);
    // the weight: a thud that drops
    tone(o, t, 'sine', 210 * p, 58 * p, 0.09, 0.22, 0.001, 0.07);
    noise(o, t, 0.06, 'lowpass', 900 * p, 200 * p, 0.8, 0.2, 0.001);
    // their kit: a tick of buckle and plate
    noise(o, t, 0.01, 'highpass', 5000, 5000, 0.7, 0.12);
    crackle(o, t + 0.006, 0.05, 4, 0.08);
    return 0.11;
  }, 0.025, 4, { low: true, rev: 0.05 }),

  // the hit confirmed: a bright, short tick that climbs the nearer they are to going down (pitch
  // carries it), sitting above the guns so it always cuts through
  foot_mark: S((t, p, o) => {
    const f = 1760 * p;
    noise(o, t, 0.006, 'bandpass', 5200, 5200, 3, 0.18, 0.0005);
    tone(o, t, 'sine', f, f * 0.995, 0.05, 0.22, 0.001);
    tone(o, t, 'sine', f * 2.76, f * 2.75, 0.025, 0.06, 0.001);
    return 0.05;
  }, 0.03, 3, { tuned: true }),

  // a crewman going down: a bone-deep crunch, a slam you feel, their kit clanking loose, and a
  // two-strike metal sting that rises with each one dropped in a row (pitch carries the streak)
  crew_kill: S((t, p, o) => {
    const v = 0.95 + Math.random() * 0.1;
    tone(o, t, 'sine', 160 * v, 38 * v, 0.3, 0.5, 0.001, 0.18);
    noise(o, t, 0.16, 'lowpass', 2400 * v, 160, 0.8, 0.36, 0.001);
    noise(drive(filt(o, 'lowpass', 3600), 0.6), t, 0.08, 'bandpass', 1300, 420, 1.2, 0.9);
    noise(o, t, 0.02, 'highpass', 3500, 3500, 0.7, 0.3);
    crackle(o, t + 0.01, 0.14, 10, 0.16);
    metal(o, t + 0.02, 920 + Math.random() * 160, 0.05, 0.4);
    // the sting: their kit ringing off the deck, struck twice, a fifth apart
    metal(o, t + 0.015, 1046 * p, 0.05, 0.3);
    metal(o, t + 0.07, 1568 * p, 0.045, 0.45);
    return 0.45;
  }, 0.05, 3, { tuned: true, rev: 0.22, duck: [0.18, 0.75] }),

  // a round glancing off plate: tink, and the whine of it going away
  plate_hit: S((t, p, o) => {
    tone(filt(o, 'bandpass', 3000 * p, 4), t, 'square', 2300 * p, 2250 * p, 0.08, 0.12, 0.001);
    tone(o, t, 'sine', 3450 * p, 3420 * p, 0.12, 0.035, 0.001);
    noise(o, t, 0.015, 'highpass', 5000, 5000, 0.7, 0.1);
    tone(o, t + 0.02, 'sine', 3800 * p, 1900 * p, 0.22, 0.03, 0.01, 0.2);
    return 0.25;
  }, 0.04, 3, { low: true, rev: 0.1 }),

  // plate giving way: a crunch, shards, and a rising chime that says now
  plate_break: S((t, p, o) => {
    tone(o, t, 'sine', 140 * p, 40 * p, 0.3, 0.38, 0.001);
    noise(o, t, 0.15, 'bandpass', 1500 * p, 500 * p, 1.1, 0.28);
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.24);
    crackle(o, t, 0.2, 10, 0.16);
    for (let i = 0; i < 10; i++) {
      const f = (2400 + Math.random() * 4600) * p;
      tone(o, t + 0.02 + Math.random() * 0.22, 'sine', f, f * 0.96, 0.05 + Math.random() * 0.12, 0.04, 0.001);
    }
    [79, 86, 91].forEach((n, i) => {
      const f = mtof(n) * p;
      tone(o, t + 0.1 + i * 0.07, 'triangle', f, f, 0.3, 0.07, 0.003);
      tone(o, t + 0.1 + i * 0.07, pulse25, f, f, 0.12, 0.02, 0.002);
    });
    return 0.7;
  }, 0.08, 2, { tuned: true, rev: 0.25 }),

  // a gunner sighting in: a whine climbing for 0.6 s, then the click of the trigger taking up
  aim_tell: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 1100 * p, 1.2);
    held(bp, t, 'sawtooth', 380 * p, 900 * p, 0.58, 0.07, 0.4, 0.02);
    held(o, t, 'triangle', 760 * p, 1800 * p, 0.58, 0.05, 0.45, 0.02);
    tone(o, t + 0.6, 'square', 1500 * p, 1300 * p, 0.02, 0.06, 0.001);
    noise(o, t + 0.6, 0.012, 'highpass', 4000, 4000, 0.7, 0.07);
    return 0.65;
  }, 0.1, 3),

  // a crew carbine: lower and duller than yours, a cough more than a crack
  crew_shot: S((t, p, o) => {
    tone(filt(o, 'lowpass', 1800), t, 'square', 520 * p, 180 * p, 0.09, 0.05, 0.001);
    tone(o, t, 'triangle', 260 * p, 80 * p, 0.1, 0.09, 0.001);
    noise(o, t, 0.06, 'bandpass', 1200 * p, 600 * p, 1, 0.07);
    tone(o, t, 'sine', 120 * p, 50 * p, 0.08, 0.07, 0.001);
    return 0.12;
  }, 0.05, 4, { low: true, rev: 0.05 }),

  // a round off a bulkhead: pting, and a spit of grit
  ricochet: S((t, p, o) => {
    noise(o, t, 0.015, 'highpass', 4500, 4500, 0.7, 0.11);
    tone(o, t, 'sine', 3000 * p, 1500 * p, 0.18, 0.04, 0.002, 0.18);
    tone(o, t, 'sine', 4600 * p, 4500 * p, 0.06, 0.018, 0.001);
    crackle(o, t + 0.01, 0.12, 4, 0.06);
    return 0.22;
  }, 0.05, 3, { low: true, rev: 0.12 }),

  // a bulkhead door: a pneumatic hiss as it runs, a clunk as it seats
  door: S((t, p, o) => {
    noise(o, t, 0.45, 'highpass', 2500 * p, 1800 * p, 0.7, 0.06, 0.04);
    noise(o, t, 0.4, 'bandpass', 900 * p, 600 * p, 1, 0.045, 0.05);
    noise(o, t, 0.4, 'lowpass', 300, 300, 0.7, 0.06, 0.1);
    tone(o, t + 0.42, 'sine', 130 * p, 60 * p, 0.15, 0.18, 0.002);
    tone(filt(o, 'lowpass', 900), t + 0.42, 'square', 180 * p, 90 * p, 0.08, 0.08, 0.001);
    noise(o, t + 0.42, 0.02, 'highpass', 3000, 3000, 0.7, 0.08);
    return 0.65;
  }, 0.12, 2, { rev: 0.2 }),

  // the ship's klaxon: two harsh whoops
  alarm: S((t, p, o) => {
    const lp = filt(o, 'lowpass', 2600);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.6;
      held(lp, tt, 'sawtooth', 500 * p, 760 * p, 0.5, 0.08, 0.03, 0.06);
      held(lp, tt, 'square', 250 * p, 380 * p, 0.5, 0.05, 0.03, 0.06);
    }
    return 1.25;
  }, 1, 1, { tuned: true, rev: 0.3, duck: [0.9, 0.75] }),

  // the core is out: every bulkhead slamming, the power groaning down, a siren climbing
  lockdown: S((t, p, o) => {
    boom(o, t, p * 0.7, 1.1, 0.28);
    for (const [at, k, v] of [[0, 1, 0.07], [0.18, 0.86, 0.05], [0.36, 1.12, 0.04]] as const) {
      metal(o, t + at, 210 * p * k, v, 0.8);
      tone(o, t + at, 'sine', 110 * p, 40 * p, 0.18, v * 3, 0.002);
    }
    const lp = filt(o, 'lowpass', 900);
    held(lp, t + 0.2, 'sawtooth', 110 * p, 34 * p, 1.4, 0.08, 0.05, 0.3);
    held(lp, t + 0.2, 'sawtooth', 114 * p, 35 * p, 1.4, 0.06, 0.05, 0.3);
    const lp2 = filt(o, 'lowpass', 2200);
    held(lp2, t + 0.7, 'sawtooth', 300 * p, 900 * p, 1.15, 0.06, 0.3, 0.2);
    held(lp2, t + 0.7, 'square', 150 * p, 450 * p, 1.15, 0.035, 0.3, 0.2);
    return 2.2;
  }, 1, 1, { rev: 0.35, duck: [1.6, 0.35], shock: 0.15 }),

  // the cutter through the hull: a sizzling burn that climbs, then a panel falls in with a clang
  breach: S((t, p, o) => {
    noise(o, t, 1.5, 'bandpass', 1800 * p, 5200 * p, 3, 0.2, 1.2);
    noise(o, t, 1.5, 'highpass', 5000, 7000, 0.7, 0.05, 1.0);
    crackle(o, t + 0.1, 1.4, 30, 0.06);
    tone(filt(o, 'bandpass', 600 * p, 2), t, 'sawtooth', 90 * p, 140 * p, 1.5, 0.05, 1.1);
    boom(o, t + 1.55, p * 0.9, 0.6, 0.24);
    metal(o, t + 1.55, 260 * p, 0.07, 1.2);
    return 2.9;
  }, 1, 1, { rev: 0.3, duck: [2.2, 0.65] }),

  // the kelters arrive: a hull-shaking clang, grinding as they bite in, then the hiss of the cut
  kelter_clamp: S((t, p, o) => {
    tone(o, t, 'sine', 72 * p, 28 * p, 1.0, 0.36, 0.002, 0.5);
    noise(o, t, 0.8, 'lowpass', 1200 * p, 100 * p, 0.8, 0.24, 0.002);
    noise(o, t, 0.03, 'highpass', 2500, 2500, 0.7, 0.22);
    metal(o, t, 140 * p, 0.09, 1.6);
    tone(filt(o, 'lowpass', 300), t, 'sawtooth', 50 * p, 42 * p, 1.2, 0.08, 0.01);
    noise(o, t + 0.5, 1.0, 'bandpass', 800 * p, 1300 * p, 4, 0.1, 0.2);
    const f = 70 * p;
    const s = tone(filt(o, 'bandpass', 700 * p, 5), t + 0.5, 'sawtooth', f, f, 1.0, 0.1, 0.2);
    for (let k = 1; k < 28; k++) s.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.25), t + 0.5 + k * 0.035);
    noise(o, t + 1.5, 0.7, 'highpass', 2500, 1800, 0.7, 0.08, 0.05);
    return 2.3;
  }, 1, 2, { rev: 0.4, duck: [1.4, 0.4], shock: 0.15 }),

  // a harpoon away: a pneumatic thunk and the cable whizzing out after it
  hook_fire: S((t, p, o) => {
    tone(o, t, 'sine', 140 * p, 60 * p, 0.1, 0.28, 0.001);
    tone(filt(o, 'lowpass', 1000), t, 'square', 200 * p, 100 * p, 0.06, 0.1, 0.001);
    noise(o, t, 0.02, 'highpass', 3000, 3000, 0.7, 0.1);
    noise(o, t + 0.02, 0.3, 'bandpass', 2500 * p, 5500 * p, 4, 0.1, 0.01);
    tone(filt(o, 'bandpass', 1300 * p, 3), t + 0.02, 'sawtooth', 900 * p, 1600 * p, 0.25, 0.03, 0.01);
    return 0.35;
  }, 0.08, 3),

  // a cable snapped: a taut twang and the whip of the loose end
  hook_snap: S((t, p, o) => {
    noise(o, t, 0.02, 'highpass', 3500, 3500, 0.7, 0.24);
    tone(filt(o, 'bandpass', 1200 * p, 5), t, 'sawtooth', 330 * p, 300 * p, 0.35, 0.09, 0.001);
    tone(o, t, 'sine', 660 * p, 600 * p, 0.3, 0.05, 0.001);
    noise(o, t + 0.01, 0.12, 'bandpass', 4000 * p, 800 * p, 1.5, 0.12);
    return 0.4;
  }, 0.06, 2, { rev: 0.15 }),

  // working a lock: a soft tick, then a tock, over and over (the caller climbs the pitch)
  crack_tick: S((t, p, o) => {
    tock = !tock;
    const f = (tock ? 1200 : 1600) * p;
    tone(filt(o, 'bandpass', f, 3), t, 'square', f, f, 0.018, 0.1, 0.001);
    tone(o, t, 'sine', f * 2, f * 2, 0.02, 0.024, 0.001);
    return 0.04;
  }, 0.05, 2, { low: true, tuned: true }),

  // a crate: two latches, the lid thumping back, a twinkle of what's inside
  crate_open: S((t, p, o) => {
    for (const at of [0, 0.045]) {
      tone(o, t + at, 'square', 900 * p, 500 * p, 0.02, 0.07, 0.001);
      noise(o, t + at, 0.015, 'highpass', 4000, 4000, 0.7, 0.07);
    }
    tone(o, t + 0.12, 'sine', 160 * p, 70 * p, 0.15, 0.24, 0.002);
    noise(o, t + 0.12, 0.1, 'lowpass', 800, 200, 0.8, 0.14);
    [84, 88, 91].forEach((n, i) => tone(o, t + 0.18 + i * 0.05, 'triangle', mtof(n) * p, mtof(n) * p, 0.2, 0.05, 0.002));
    noise(o, t + 0.2, 0.25, 'highpass', 7000, 9000, 0.7, 0.03, 0.02);
    return 0.6;
  }, 0.1, 2, { tuned: true, rev: 0.15 }),

  // the strongbox: vault bolts drawn back, the seal breathing, and a shower of coin
  strongbox_open: S((t, p, o) => {
    for (const at of [0, 0.12, 0.24]) {
      tone(filt(o, 'lowpass', 1100), t + at, 'square', 160 * p, 80 * p, 0.08, 0.13, 0.001);
      tone(o, t + at, 'sine', 95 * p, 45 * p, 0.12, 0.24, 0.002);
    }
    noise(o, t + 0.34, 0.25, 'highpass', 3000, 2000, 0.7, 0.06, 0.01);
    for (const n of [76, 79, 84, 88]) tone(o, t + 0.45, 'triangle', mtof(n) * p, mtof(n) * p, 0.9, 0.035, 0.01);
    for (let i = 0; i < 18; i++) {
      const tt = t + 0.45 + Math.pow(Math.random(), 1.3) * 0.8;
      const f = (2500 + Math.random() * 3500) * p;
      tone(o, tt, 'sine', f, f, 0.1, 0.028, 0.001);
      tone(o, tt, 'sine', f * 2.76, f * 2.76, 0.04, 0.008, 0.001);
    }
    return 1.5;
  }, 0.3, 1, { tuned: true, rev: 0.3, duck: [0.5, 0.7] }),

  // the core torn from its cradle: a wet tearing hum, a deep note, energy crackling off it
  core_pull: S((t, p, o) => {
    noise(o, t, 0.6, 'bandpass', 300 * p, 900 * p, 2, 0.18, 0.1);
    crackle(o, t, 0.6, 18, 0.08);
    const lp = filt(o, 'lowpass', 500);
    held(lp, t, 'sawtooth', 55 * p, 58 * p, 1.4, 0.09, 0.15, 0.4);
    held(lp, t, 'sawtooth', 55.4 * p, 58.4 * p, 1.4, 0.08, 0.15, 0.4);
    tone(o, t + 0.1, 'sine', mtof(33) * p, mtof(33) * p, 1.6, 0.3, 0.05);
    tone(o, t + 0.1, 'sine', 220 * p, 440 * p, 1.3, 0.04, 0.3, 1.2);
    crackle(o, t + 0.3, 1.2, 25, 0.07);
    boom(o, t + 0.6, p * 1.1, 0.4, 0.16);
    return 1.8;
  }, 0.5, 1, { tuned: true, rev: 0.4, duck: [1, 0.5] }),

  // home: the hatch slammed, the air rushing out, the clamps letting go
  airlock: S((t, p, o) => {
    tone(o, t, 'sine', 120 * p, 40 * p, 0.3, 0.38, 0.001);
    tone(filt(o, 'lowpass', 1000), t, 'square', 180 * p, 80 * p, 0.1, 0.13, 0.001);
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.14);
    metal(o, t, 300 * p, 0.04, 0.6);
    noise(o, t + 0.15, 0.9, 'bandpass', 3000 * p, 400 * p, 0.8, 0.22, 0.05);
    noise(o, t + 0.15, 1.0, 'lowpass', 1500, 100, 0.8, 0.14, 0.05);
    for (const at of [0.9, 1.0]) {
      tone(o, t + at, 'square', 600 * p, 300 * p, 0.03, 0.09, 0.001);
      noise(o, t + at, 0.015, 'highpass', 4000, 4000, 0.7, 0.07);
    }
    noise(o, t + 1.0, 0.3, 'highpass', 3000, 2000, 0.7, 0.05, 0.01);
    return 1.4;
  }, 0.5, 1, { rev: 0.25, duck: [0.8, 0.6] }),

  // the patrol's last ten seconds: a dry, hard tick over a low knock
  clock_tick: S((t, p, o) => {
    noise(o, t, 0.012, 'bandpass', 3500 * p, 3500 * p, 3, 0.22);
    tone(o, t, 'square', 1000 * p, 1000 * p, 0.015, 0.065, 0.001);
    tone(o, t, 'sine', 2000 * p, 2000 * p, 0.04, 0.02, 0.001);
    tone(o, t, 'sine', 180 * p, 120 * p, 0.05, 0.1, 0.001);
    return 0.07;
  }, 0.3, 1, { tuned: true }),

  // a turret: its hatch, the servos whirring up, two pips as it finds you
  turret_up: S((t, p, o) => {
    tone(o, t, 'sine', 140 * p, 70 * p, 0.1, 0.2, 0.002);
    tone(filt(o, 'bandpass', 700 * p, 3), t + 0.05, 'sawtooth', 200 * p, 900 * p, 0.5, 0.06, 0.05);
    tone(o, t + 0.05, 'square', 400 * p, 1800 * p, 0.45, 0.02, 0.05);
    noise(o, t + 0.05, 0.5, 'bandpass', 1000 * p, 4000 * p, 2, 0.05, 0.05);
    for (const at of [0.58, 0.68]) tone(o, t + at, 'square', 1760 * p, 1760 * p, 0.06, 0.045, 0.002);
    return 0.75;
  }, 0.15, 2, { rev: 0.1 }),

  // a bruiser setting off: a stomp, and a growl of engine revving up
  charge: S((t, p, o) => {
    tone(o, t, 'sine', 100 * p, 35 * p, 0.25, 0.3, 0.001);
    noise(o, t, 0.12, 'lowpass', 800, 150, 0.8, 0.16);
    const lp = filt(o, 'lowpass', 900);
    held(lp, t + 0.04, 'sawtooth', 55 * p, 115 * p, 0.6, 0.09, 0.05, 0.12);
    held(lp, t + 0.04, 'square', 58 * p, 118 * p, 0.6, 0.05, 0.05, 0.12);
    noise(o, t + 0.04, 0.6, 'bandpass', 400 * p, 900 * p, 1.5, 0.1, 0.15);
    return 0.75;
  }, 0.2, 2, { rev: 0.15, duck: [0.2, 0.8] }),

  // a bruiser into a wall: a huge crunch of metal, and the wall ringing
  slam: S((t, p, o) => {
    boom(o, t, p * 0.8, 0.8, 0.26);
    metal(o, t, 180 * p, 0.07, 1.0);
    crackle(o, t, 0.2, 14, 0.18);
    noise(o, t, 0.2, 'bandpass', 1200 * p, 400 * p, 1, 0.22);
    tone(filt(o, 'lowpass', 1200), t, 'square', 160 * p, 50 * p, 0.25, 0.13, 0.001);
    return 1.1;
  }, 0.12, 2, { rev: 0.35, duck: [0.4, 0.55], shock: 0.1 }),

  // a fuel canister about to go: a sharp hiss, sputtering, a whistle climbing
  canister: S((t, p, o) => {
    noise(o, t, 0.5, 'highpass', 3000, 6000, 0.7, 0.1, 0.02);
    for (let k = 0; k < 8; k++) noise(o, t + k * 0.06 + Math.random() * 0.02, 0.03, 'bandpass', 1500 * p, 1500 * p, 1.5, 0.08);
    tone(o, t, 'sine', 1200 * p, 2400 * p, 0.5, 0.025, 0.3);
    return 0.55;
  }, 0.1, 3),

  // a scrap tin: a bright clink (the caller climbs the pitch on a run)
  pickup_tin: S((t, p, o) => {
    const f = mtof(86) * p;
    tone(o, t, 'triangle', f, f, 0.1, 0.15, 0.001);
    tone(o, t, 'sine', f * 2.76, f * 2.76, 0.06, 0.045, 0.001);
    tone(o, t, pulse12, f, f, 0.05, 0.045, 0.001);
    return 0.12;
  }, 0.03, 4, { low: true, tuned: true }),

  // patched up: two soft notes rising, a shimmer over them
  heal_foot: S((t, p, o) => {
    for (const [at, n] of [[0, 76], [0.1, 83]] as const) {
      const f = mtof(n) * p;
      tone(o, t + at, 'sine', f, f, 0.45, 0.08, 0.03);
      tone(o, t + at, 'triangle', f * 2, f * 2, 0.3, 0.02, 0.03);
    }
    noise(o, t, 0.4, 'highpass', 6000, 8000, 0.7, 0.02, 0.1);
    return 0.65;
  }, 0.2, 2, { tuned: true, rev: 0.25 }),

  // spotted: a radio squawk and a sharp sting
  alert: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 1500 * p, 2);
    const sq = ctx.createOscillator();
    sq.type = 'square';
    for (let k = 0; k < 4; k++) sq.frequency.setValueAtTime((500 + Math.random() * 900) * p, t + k * 0.012);
    const g = ctx.createGain();
    env(g.gain, t, 0.001, 0.1, 0.05);
    sq.connect(g).connect(bp);
    sq.start(t);
    sq.stop(t + 0.07);
    for (const n of [81, 87]) tone(o, t + 0.04, 'triangle', mtof(n) * p, mtof(n) * p, 0.18, 0.09, 0.002);
    noise(o, t + 0.04, 0.04, 'bandpass', 2500 * p, 2500 * p, 1.5, 0.1);
    return 0.25;
  }, 0.12, 2),

  // a partner hauled back up: a hopeful run upward
  // ── the forge's guns ──────────────────────────────────────────────────────────────────────

  // a saw blade leaving the rack: a bright steel shing over the whir of it spinning up
  shot_saw: S((t, p, o) => {
    noise(o, t, 0.12, 'bandpass', 2200 * p, 7000 * p, 4, 0.16, 0.004);
    tone(o, t, 'sine', 2350 * p, 2420 * p, 0.22, 0.05, 0.002);
    tone(o, t, 'sine', 3530 * p, 3560 * p, 0.16, 0.035, 0.002);
    const lp = filt(o, 'lowpass', 1800);
    tone(lp, t, 'sawtooth', 90 * p, 240 * p, 0.14, 0.07, 0.004);
    return 0.24;
  }, 0.08, 3, { low: true }),

  // off the edge of the screen: a ricochet's ting
  saw_ting: S((t, p, o) => {
    noise(o, t, 0.015, 'highpass', 5000, 5000, 0.7, 0.2);
    tone(o, t, 'sine', 3100 * p, 2900 * p, 0.35, 0.07, 0.001);
    tone(o, t, 'sine', 4650 * p, 4600 * p, 0.2, 0.04, 0.001);
    tone(o, t, 'triangle', 1550 * p, 1500 * p, 0.12, 0.05, 0.001);
    return 0.36;
  }, 0.05, 3, { rev: 0.25 }),

  // teeth in a hull: a chattering grind
  saw_grind: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 3200 * p, 2.5);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const chop = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 70 * p;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(chop.gain);
    chop.gain.value = 0.5;
    const g = ctx.createGain();
    env(g.gain, t, 0.003, 0.26, 0.16);
    s.connect(chop).connect(g).connect(bp);
    s.start(t, Math.random() * 1.9);
    s.stop(t + 0.2);
    lfo.start(t);
    lfo.stop(t + 0.2);
    tone(o, t, 'square', 640 * p, 560 * p, 0.1, 0.03, 0.002);
    return 0.2;
  }, 0.07, 3, { low: true }),

  // a phase needle: a glassy, thin note with a sweep through it, and nothing of a bang
  shot_needle: S((t, p, o) => {
    tone(o, t, 'sine', 3400 * p, 5600 * p, 0.09, 0.07, 0.001, 0.05);
    tone(o, t, 'sine', 2600 * p, 2600 * p, 0.18, 0.035, 0.002);
    tone(o, t, 'sine', 2637 * p, 2637 * p, 0.18, 0.035, 0.002);
    noise(o, t, 0.012, 'highpass', 7000, 7000, 0.7, 0.08);
    return 0.2;
  }, 0.05, 3, { low: true, rev: 0.2 }),

  // and through a hull: a crystal tick, a breath of air out the far side
  needle_hit: S((t, p, o) => {
    tone(o, t, 'sine', 4100 * p, 4000 * p, 0.12, 0.06, 0.001);
    tone(o, t, 'sine', 6150 * p, 6100 * p, 0.07, 0.03, 0.001);
    noise(o, t + 0.01, 0.08, 'bandpass', 6000 * p, 2500 * p, 1.5, 0.08, 0.004);
    return 0.13;
  }, 0.04, 3, { low: true }),

  // hive darts: a buzz, like something let out of a box
  shot_hive: S((t, p, o) => {
    const bp = filt(o, 'bandpass', 1300 * p, 2);
    const s = ctx.createOscillator();
    s.type = 'sawtooth';
    s.frequency.setValueAtTime(170 * p, t);
    s.frequency.linearRampToValueAtTime(230 * p, t + 0.08);
    const fm = ctx.createOscillator();
    fm.frequency.value = 37;
    const fmg = ctx.createGain();
    fmg.gain.value = 40;
    fm.connect(fmg).connect(s.frequency);
    const g = ctx.createGain();
    env(g.gain, t, 0.006, 0.14, 0.09);
    s.connect(g).connect(bp);
    s.start(t);
    s.stop(t + 0.12);
    fm.start(t);
    fm.stop(t + 0.12);
    return 0.12;
  }, 0.06, 3, { low: true }),

  hive_hit: S((t, p, o) => {
    tone(o, t, 'triangle', 1900 * p, 900 * p, 0.035, 0.08, 0.001);
    noise(o, t, 0.02, 'highpass', 4000, 4000, 0.7, 0.05);
    return 0.05;
  }, 0.03, 3, { low: true }),

  // a wave: a deep push of air you feel more than hear, wobbling as it goes
  shot_wave: S((t, p, o) => {
    tone(o, t, 'sine', 95 * p, 42 * p, 0.55, 0.36, 0.01, 0.4);
    const lp = filt(o, 'lowpass', 500, 4);
    lp.frequency.setValueAtTime(260 * p, t);
    lp.frequency.exponentialRampToValueAtTime(1300 * p, t + 0.12);
    lp.frequency.exponentialRampToValueAtTime(200 * p, t + 0.5);
    tone(lp, t, 'sawtooth', 62 * p, 58 * p, 0.5, 0.12, 0.02);
    noise(o, t, 0.45, 'bandpass', 380 * p, 900 * p, 1.4, 0.08, 0.05);
    tone(o, t, 'sine', 740 * p, 520 * p, 0.25, 0.02, 0.03);
    return 0.6;
  }, 0.12, 2, { rev: 0.3 }),

  wave_hit: S((t, p, o) => {
    tone(o, t, 'sine', 160 * p, 70 * p, 0.14, 0.18, 0.003);
    noise(o, t, 0.1, 'lowpass', 900 * p, 300 * p, 0.8, 0.08, 0.004);
    return 0.16;
  }, 0.05, 3, { low: true }),

  // the charge cannon: the pitch says how ripe it was (p < 1: fuller, deeper); a crack, a boom and a long fall of energy
  shot_charge: S((t, p, o) => {
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.3);
    tone(o, t, 'sine', 140 * p, 30 * p, 0.7, 0.5, 0.002, 0.4);
    const lp = filt(o, 'lowpass', 2400);
    tone(lp, t, 'sawtooth', 300 * p, 50 * p, 0.6, 0.16, 0.002, 0.45);
    tone(o, t, 'square', 3000 * p, 160 * p, 0.35, 0.05, 0.001, 0.3);
    crackle(o, t + 0.02, 0.4, 14, 0.12);
    noise(o, t, 0.8, 'lowpass', 2600 * p, 120 * p, 0.8, 0.22, 0.003);
    return 0.9;
  }, 0.1, 2, { rev: 0.35, duck: [0.25, 0.7] }),

  // full: two rising notes, and it hums ready
  charge_ready: S((t, p, o) => {
    const f = mtof(81) * p;
    tone(o, t, 'triangle', f, f, 0.1, 0.07, 0.002);
    tone(o, t + 0.07, 'triangle', f * 1.5, f * 1.5, 0.3, 0.07, 0.002);
    tone(o, t + 0.07, 'sine', f * 3, f * 3, 0.35, 0.025, 0.002);
    return 0.4;
  }, 0.2, 2, { tuned: true }),

  // the round going in: the air sucked into it, and then it lets go
  charge_hit: S((t, p, o) => {
    noise(o, t, 0.09, 'highpass', 300 * p, 4500 * p, 0.9, 0.16, 0.08);
    boom(o, t + 0.08, p, 0.9, 0.45);
    tone(o, t + 0.08, 'sawtooth', 1400 * p, 120 * p, 0.3, 0.04, 0.002);
    return 0.8;
  }, 0.08, 2, { rev: 0.3 }),

  // an anchor spike: a heavy chunk off the rack, and the chain paying out after it
  shot_anchor: S((t, p, o) => {
    tone(o, t, 'sine', 120 * p, 50 * p, 0.2, 0.4, 0.002);
    noise(o, t, 0.08, 'bandpass', 900 * p, 500 * p, 1.2, 0.3, 0.002);
    for (let k = 0; k < 9; k++) {
      const at = t + 0.03 + k * 0.025 + Math.random() * 0.01;
      tone(o, at, 'sine', (2200 + Math.random() * 1600) * p, 2000 * p, 0.03, 0.035 * (1 - k / 11), 0.001);
    }
    return 0.32;
  }, 0.1, 2),

  // it bites: a ringing clank, iron on iron, and the chain snapping taut
  anchor_pin: S((t, p, o) => {
    tone(o, t, 'sine', 523 * p, 520 * p, 0.7, 0.12, 0.002);
    tone(o, t, 'sine', 1290 * p, 1285 * p, 0.45, 0.06, 0.002);
    tone(o, t, 'sine', 2170 * p, 2160 * p, 0.25, 0.04, 0.002);
    tone(o, t, 'sine', 90 * p, 45 * p, 0.25, 0.3, 0.003);
    noise(o, t, 0.04, 'highpass', 2500, 2500, 0.7, 0.2);
    noise(o, t + 0.06, 0.14, 'bandpass', 5000 * p, 2500 * p, 3, 0.1, 0.004);
    return 0.75;
  }, 0.08, 2, { rev: 0.35 }),

  // the chain goes: a crack, and links scattering
  chain_snap: S((t, p, o) => {
    noise(o, t, 0.03, 'highpass', 3500, 3500, 0.7, 0.22);
    for (let k = 0; k < 7; k++) {
      const at = t + 0.02 + Math.random() * 0.3;
      tone(o, at, 'sine', (1800 + Math.random() * 2400) * p, 1700 * p, 0.04, 0.03, 0.001);
    }
    return 0.4;
  }, 0.08, 2),

  // a bumper charge: a fat thoomp, with a rubbery give in it
  shot_bumper: S((t, p, o) => {
    tone(o, t, 'sine', 190 * p, 70 * p, 0.2, 0.42, 0.002, 0.12);
    tone(o, t, 'triangle', 300 * p, 520 * p, 0.12, 0.08, 0.004, 0.08);
    noise(o, t, 0.06, 'lowpass', 1200 * p, 300 * p, 0.7, 0.2, 0.002);
    return 0.22;
  }, 0.1, 2),

  // and what it hits goes: a bonk, a spring, a whoosh off
  bonk: S((t, p, o) => {
    tone(o, t, 'sine', 560 * p, 240 * p, 0.14, 0.2, 0.001, 0.1);
    tone(o, t, 'square', 140 * p, 70 * p, 0.08, 0.08, 0.001);
    noise(o, t, 0.02, 'highpass', 3000, 3000, 0.7, 0.15);
    noise(o, t + 0.04, 0.3, 'bandpass', 600 * p, 2600 * p, 1.4, 0.08, 0.05);
    return 0.35;
  }, 0.06, 3),

  // the spray soaking in: a soft crunch of frost
  frost_hit: S((t, p, o) => {
    noise(o, t, 0.05, 'highpass', 5500 * p, 7500 * p, 1, 0.07, 0.002);
    tone(o, t, 'sine', 3300 * p, 3500 * p, 0.05, 0.015, 0.002);
    return 0.06;
  }, 0.09, 2, { low: true }),

  // ── the new kit ───────────────────────────────────────────────────────────────────────────

  // the Bulwark going up: a heavy shutter of light slamming into place, humming
  wall_up: S((t, p, o) => {
    tone(o, t, 'sine', 70 * p, 55 * p, 0.35, 0.35, 0.004);
    const lp = filt(o, 'lowpass', 1400, 3);
    tone(lp, t, 'sawtooth', 110 * p, 220 * p, 0.25, 0.1, 0.01, 0.08);
    noise(o, t, 0.08, 'bandpass', 900 * p, 2400 * p, 1.5, 0.15, 0.003);
    tone(o, t + 0.05, 'sine', 880 * p, 880 * p, 0.3, 0.03, 0.01);
    return 0.4;
  }, 0.15, 1, { rev: 0.25 }),

  // a bullet into it: a dull thock, higher the fuller it is
  wall_block: S((t, p, o) => {
    tone(o, t, 'sine', 300 * p, 180 * p, 0.06, 0.12, 0.001);
    noise(o, t, 0.03, 'bandpass', 2200 * p, 1400 * p, 2, 0.08, 0.001);
    return 0.07;
  }, 0.035, 3, { low: true }),

  // let go: everything it took, thrown at once
  wall_throw: S((t, p, o) => {
    boom(o, t, p, 1.1, 0.5);
    noise(o, t, 0.5, 'bandpass', 600 * p, 3000 * p, 1.2, 0.2, 0.02);
    tone(o, t, 'sawtooth', 220 * p, 55 * p, 0.4, 0.08, 0.002);
    return 0.9;
  }, 0.2, 1, { rev: 0.35, duck: [0.3, 0.6] }),

  // a beacon thrown: a chirp going away
  beacon_throw: S((t, p, o) => {
    tone(o, t, 'triangle', 900 * p, 1800 * p, 0.12, 0.08, 0.002);
    tone(o, t + 0.1, 'sine', 2400 * p, 2400 * p, 0.2, 0.04, 0.002);
    return 0.3;
  }, 0.1, 2, { tuned: true }),

  // the swap: space folding, a reversed whoosh and a snap
  beacon_swap: S((t, p, o) => {
    noise(o, t, 0.14, 'bandpass', 5000 * p, 600 * p, 2, 0.2, 0.12);
    tone(o, t, 'sine', 1600 * p, 200 * p, 0.15, 0.08, 0.1, 0.14);
    noise(o, t + 0.14, 0.03, 'highpass', 3000, 3000, 0.7, 0.25);
    tone(o, t + 0.14, 'square', 1200 * p, 600 * p, 0.06, 0.05, 0.001);
    return 0.25;
  }, 0.1, 2, { rev: 0.3 }),

  beacon_burst: S((t, p, o) => {
    boom(o, t, p * 1.2, 0.6, 0.4);
    tone(o, t, 'triangle', 1800 * p, 600 * p, 0.2, 0.06, 0.002);
    return 0.6;
  }, 0.1, 2, { rev: 0.3 }),

  beacon_fizzle: S((t, p, o) => {
    tone(o, t, 'triangle', 1200 * p, 300 * p, 0.25, 0.05, 0.002);
    noise(o, t, 0.2, 'highpass', 4000, 1500, 0.7, 0.04, 0.01);
    return 0.3;
  }, 0.1, 2),

  // an ablative layer going: a plate cracking off, shrapnel ringing out
  layer_break: S((t, p, o) => {
    noise(o, t, 0.04, 'highpass', 2500, 2500, 0.7, 0.3);
    tone(o, t, 'sine', 180 * p, 70 * p, 0.2, 0.3, 0.002);
    crackle(o, t + 0.01, 0.25, 16, 0.2);
    for (const f of [1900, 2700, 3400]) tone(o, t + Math.random() * 0.05, 'sine', f * p, f * 0.96 * p, 0.25, 0.04, 0.001);
    return 0.4;
  }, 0.1, 2, { rev: 0.25 }),

  // and one growing back: plates sliding into place, a rising lock
  layer_grow: S((t, p, o) => {
    const f = mtof(74) * p;
    tone(o, t, 'triangle', f, f, 0.1, 0.06, 0.002);
    tone(o, t + 0.06, 'triangle', f * 1.25, f * 1.25, 0.1, 0.06, 0.002);
    tone(o, t + 0.12, 'triangle', f * 1.5, f * 1.5, 0.25, 0.07, 0.002);
    noise(o, t, 0.12, 'bandpass', 3000 * p, 3000 * p, 3, 0.05, 0.004);
    return 0.4;
  }, 0.15, 1, { tuned: true }),

  // a graze into the static skin: a tick of electricity, higher each charge
  static_charge: S((t, p, o) => {
    crackle(o, t, 0.05, 4, 0.12);
    tone(o, t, 'square', 1400 * p, 1500 * p, 0.04, 0.03, 0.001);
    return 0.07;
  }, 0.04, 3, { low: true }),

  // and let go: a snap of lightning
  static_zap: S((t, p, o) => {
    noise(o, t, 0.03, 'highpass', 3000, 3000, 0.7, 0.35);
    crackle(o, t, 0.3, 22, 0.25);
    const bp = filt(o, 'bandpass', 1800 * p, 0.9);
    const sq = ctx.createOscillator();
    sq.type = 'square';
    for (let k = 0; k < 14; k++) sq.frequency.setValueAtTime((200 + Math.random() * 1800) * p, t + k * 0.015);
    const g = ctx.createGain();
    env(g.gain, t, 0.002, 0.16, 0.22);
    sq.connect(g).connect(bp);
    sq.start(t);
    sq.stop(t + 0.25);
    tone(o, t, 'sine', 90 * p, 40 * p, 0.3, 0.25, 0.002);
    return 0.35;
  }, 0.08, 2, { rev: 0.3 }),

  // a carpet: the bay doors and a long whistle of things falling
  special_carpet: S((t, p, o) => {
    noise(o, t, 0.1, 'lowpass', 900, 300, 0.7, 0.3);
    tone(o, t, 'square', 140 * p, 120 * p, 0.12, 0.08, 0.002);
    tone(o, t + 0.1, 'sine', 2200 * p, 900 * p, 1.4, 0.04, 0.05, 1.4);
    return 1.5;
  }, 0.3, 1, { duck: [1.5, 0.5] }),

  bomblet: S((t, p, o) => {
    boom(o, t, p * (0.9 + Math.random() * 0.3), 0.35, 0.3);
    return 0.4;
  }, 0.045, 5, { low: true }),

  // cryo: the world stopping: a crack of ice all round, then a held, ringing cold
  special_cryo: S((t, p, o) => {
    crackle(o, t, 0.4, 50, 0.3);
    noise(o, t, 0.6, 'highpass', 6000, 2500, 0.7, 0.2, 0.004);
    tone(o, t, 'sine', 60 * p, 40 * p, 0.9, 0.4, 0.005);
    for (const [f, d] of [[2093, 2], [3136, 1.8], [4186, 1.4]] as const) tone(o, t + 0.05, 'sine', f * p, f * p, d, 0.035, 0.05);
    return 2.1;
  }, 0.5, 1, { rev: 0.6, duck: [2, 0.4], shock: 0.3 }),

  // and letting go: a soft hush of snow
  snow: S((t, p, o) => {
    noise(o, t, 0.6, 'bandpass', 5000 * p, 3000 * p, 0.8, 0.05, 0.1);
    return 0.65;
  }, 0.3, 1, { low: true }),

  // the gravity well: a deep suck, rising, the air pulled in
  special_gravity: S((t, p, o) => {
    tone(o, t, 'sine', 40 * p, 90 * p, 1.2, 0.45, 0.3, 1.1);
    const lp = filt(o, 'lowpass', 600, 6);
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(2400, t + 1.1);
    tone(lp, t, 'sawtooth', 55 * p, 110 * p, 1.2, 0.14, 0.3, 1.1);
    noise(o, t, 1.2, 'bandpass', 200 * p, 2400 * p, 1.5, 0.16, 0.6);
    return 1.3;
  }, 0.5, 1, { rev: 0.4, duck: [1.4, 0.5] }),

  // it lets go
  well_burst: S((t, p, o) => {
    boom(o, t, p * 0.8, 1.6, 0.6);
    noise(o, t, 0.05, 'highpass', 2000, 2000, 0.7, 0.3);
    return 1.4;
  }, 0.3, 1, { rev: 0.45, shock: 0.25 }),

  // the drone wing: four little engines spooling up and peeling off the rack
  special_drones: S((t, p, o) => {
    for (let k = 0; k < 4; k++) {
      const at = t + k * 0.09;
      tone(o, at, 'sawtooth', (300 + k * 60) * p, (900 + k * 120) * p, 0.25, 0.04, 0.01, 0.2);
      noise(o, at, 0.12, 'bandpass', 2000 * p, 5000 * p, 2, 0.05, 0.01);
    }
    const f = mtof(79) * p;
    tone(o, t + 0.4, 'triangle', f, f, 0.12, 0.06, 0.002);
    tone(o, t + 0.48, 'triangle', f * 1.5, f * 1.5, 0.3, 0.06, 0.002);
    return 0.8;
  }, 0.3, 1, { duck: [0.8, 0.6] }),

  drones_gone: S((t, p, o) => {
    for (let k = 0; k < 4; k++) tone(o, t + k * 0.06, 'sawtooth', (900 - k * 80) * p, 200 * p, 0.2, 0.03, 0.01);
    return 0.5;
  }, 0.3, 1),

  // ── cash-ins: each its own bang ───────────────────────────────────────────────────────────

  // SMASH: the ice goes like a window, over a deep hit
  cash_smash: S((t, p, o) => {
    boom(o, t, p * 0.8, 0.8, 0.5);
    crackle(o, t, 0.35, 40, 0.35);
    for (const [at, f] of [[0, 5200], [0.03, 3900], [0.07, 6100], [0.12, 4600]] as const) tone(o, t + at, 'sine', f * p, f * 0.97 * p, 0.3, 0.05, 0.001);
    noise(o, t, 0.6, 'highpass', 6000 * p, 3000 * p, 0.7, 0.18, 0.002);
    return 0.9;
  }, 0.1, 2, { rev: 0.45, duck: [0.35, 0.6] }),

  // NAILED: an iron bell struck hard
  cash_nailed: S((t, p, o) => {
    boom(o, t, p, 0.6, 0.4);
    for (const [f, v, d] of [[311, 0.14, 1.2], [747, 0.08, 0.8], [1180, 0.05, 0.5], [1890, 0.03, 0.35]] as const) tone(o, t, 'sine', f * p, f * p, d, v, 0.002);
    return 1.25;
  }, 0.1, 2, { rev: 0.5, tuned: true, duck: [0.35, 0.6] }),

  // FLARE-UP: a roar going up
  cash_flare: S((t, p, o) => {
    boom(o, t, p, 1.1, 0.55);
    noise(o, t, 0.7, 'bandpass', 250 * p, 2400 * p, 1.1, 0.3, 0.05);
    return 0.9;
  }, 0.1, 2, { rev: 0.35, duck: [0.35, 0.6] }),

  // GROUND-OUT: a thunderclap down the line
  cash_ground: S((t, p, o) => {
    noise(o, t, 0.05, 'highpass', 2500, 2500, 0.7, 0.4);
    crackle(o, t, 0.5, 30, 0.3);
    tone(o, t, 'sine', 70 * p, 35 * p, 0.9, 0.5, 0.003, 0.6);
    noise(o, t + 0.04, 1.0, 'lowpass', 1600 * p, 100 * p, 0.7, 0.3, 0.01);
    return 1.1;
  }, 0.1, 2, { rev: 0.5, duck: [0.35, 0.6] }),

  // BREACH: a hull cracked like a nut
  cash_breach: S((t, p, o) => {
    boom(o, t, p * 1.1, 0.7, 0.45);
    for (let k = 0; k < 5; k++) noise(o, t + k * 0.03 + Math.random() * 0.02, 0.03, 'bandpass', (1500 + Math.random() * 2500) * p, 1500 * p, 2, 0.2, 0.001);
    tone(o, t, 'square', 220 * p, 110 * p, 0.25, 0.06, 0.002);
    return 0.7;
  }, 0.1, 2, { rev: 0.35, duck: [0.35, 0.6] }),

  revive: S((t, p, o) => {
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => {
      const f = mtof(n) * p;
      const last = i === notes.length - 1;
      tone(o, t + i * 0.08, 'triangle', f, f, last ? 0.45 : 0.14, 0.1, 0.002);
      tone(o, t + i * 0.08, pulse25, f, f, last ? 0.3 : 0.1, 0.03, 0.002);
    });
    return 0.75;
  }, 0.3, 1, { tuned: true, rev: 0.25 }),

  // a down ship calling: a glassy ping off its hull with a dull knock under it (the view pitches
  // it up and quickens it as the time runs out)
  down_ping: S((t, p, o) => {
    tone(o, t, 'sine', 1320 * p, 1300 * p, 0.16, 0.12, 0.002);
    tone(o, t, 'sine', 2640 * p, 2600 * p, 0.07, 0.035, 0.002);
    metal(o, t, 660 * p, 0.05, 0.12);
    tone(o, t, 'sine', 150 * p, 90 * p, 0.06, 0.1, 0.001);
    return 0.18;
  }, 0.08, 1, { tuned: true, rev: 0.2 }),

  // a jumpstart landing: a heavy contact thump, the arc snapping, then the engines catching and
  // roaring up, a bright ring off the hull over it all
  jolt: S((t, p, o) => {
    tone(o, t, 'sine', 120 * p, 38 * p, 0.35, 0.5, 0.001);
    noise(o, t, 0.05, 'highpass', 4000 * p, 2500 * p, 0.8, 0.3, 0.001);
    crackle(o, t, 0.18, 22, 0.2);
    metal(o, t + 0.01, 210 * p, 0.12, 0.9);
    noise(o, t + 0.08, 0.9, 'bandpass', 300 * p, 2600 * p, 1.2, 0.3, 0.12);
    noise(o, t + 0.08, 0.7, 'lowpass', 200 * p, 900 * p, 0.8, 0.22, 0.08);
    tone(o, t + 0.08, 'sine', 70 * p, 140 * p, 0.7, 0.18, 0.1);
    tone(o, t + 0.12, 'sine', 880 * p, 1760 * p, 0.5, 0.05, 0.05);
    return 1;
  }, 0.3, 1, { rev: 0.35, duck: [0.5, 0.6] }),
};

// ---- boarding helpers ----------------------------------------------------------------------------

/** crack_tick alternates tick and tock. */
let tock = false;

/** A held note (a klaxon, a hum): flat level for `dur`, gliding f0 -> f1, then a release. */
function held(out: AudioNode, t: number, w: Wave, f0: number, f1: number, dur: number, peak: number, a = 0.02, r = 0.08): OscillatorNode {
  const o = ctx.createOscillator();
  setWave(o, w);
  o.frequency.setValueAtTime(nyq(f0), t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(nyq(f1), t + dur);
  const g = ctx.createGain();
  const end = adsr(g.gain, t, a, 0, 1, r, dur, peak);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(end + 0.02);
  return o;
}

/** Struck metal: inharmonic partials (x1, 2.76, 5.4, 8.9), the higher ones dying first. */
function metal(out: AudioNode, t: number, f: number, peak: number, dur: number) {
  for (const [k, v, d] of [[1, 1, 1], [2.76, 0.6, 0.7], [5.4, 0.35, 0.45], [8.9, 0.18, 0.3]] as const) {
    tone(out, t, 'sine', f * k, f * k * 0.998, dur * d, peak * v, 0.001);
  }
}

/** A soft-clipping stage for a crunch: input gain into the drive curve. */
function drive(out: AudioNode, gain: number): AudioNode {
  const g = ctx.createGain();
  g.gain.value = gain * 4;
  const sh = ctx.createWaveShaper();
  sh.curve = driveCurve;
  const post = ctx.createGain();
  post.gain.value = 0.25;
  g.connect(sh).connect(post).connect(out);
  return g;
}

const VOICE_CAP = 28;
const voices: { name: AnySfx; end: number }[] = [];
const lastPlay = new Map<AnySfx, number>();

/** Sounds the minigames define in their own files, played like any other. */
const EXTRA = new Map<MiniSfx, SfxDef>();

/**
 * A minigame's own sound: `fn` builds it at time `t`, pitch `p`, into `o` (with the `synth`
 * helpers) and returns how long it lasts. `gap`: least seconds between plays; `max`: voices.
 */
export function defineSfx(name: MiniSfx, fn: SfxFn, gap: number, max: number, extra: Partial<SfxDef> = {}) {
  EXTRA.set(name, S(fn, gap, max, extra));
}

/** The building blocks the sounds here are made of, for `defineSfx` sounds. */
export const synth = {
  get ctx() {
    return ctx;
  },
  get noiseBuf() {
    return noiseBuf;
  },
  get pulse12() {
    return pulse12;
  },
  get pulse25() {
    return pulse25;
  },
  env,
  adsr,
  tone,
  noise,
  filt,
  crackle,
  boom,
  held,
  metal,
  drive,
  mtof,
};
/** Nodes to disconnect once their sound is over. */
const trash: { at: number; nodes: AudioNode[] }[] = [];

/** Sounds of the interface: on their own bus, never muffled or ducked. */
const isUi = (name: AnySfx) => name.startsWith('ui_') || name === 'card_flip';

function playSfx(name: AnySfx, opts?: { pan?: number; pitch?: number; vol?: number; dist?: number }) {
  const def = name.startsWith('mini_') ? EXTRA.get(name as MiniSfx) : SFX[name as Sfx];
  if (!def) return;
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
  // a little level drift too, so a stream of the same shot doesn't sound like a loop
  out.gain.value = vol * (def.tuned ? 1 : 1 + (Math.random() * 2 - 1) * 0.1);
  const pan = ctx.createStereoPanner();
  pan.pan.value = clamp(opts?.pan ?? 0, -1, 1) * 0.8;
  out.connect(pan);
  const nodes: AudioNode[] = [out, pan];
  let tail: AudioNode = pan;
  const dist = clamp(opts?.dist ?? 0, 0, 1);
  if (dist > 0.01) {
    // far off: the air takes the top off it, and more of what's left is the room
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = OPEN_HZ * Math.pow(0.1, dist);
    pan.connect(air);
    out.gain.value *= 1 - 0.45 * dist;
    tail = air;
    nodes.push(air);
  }
  tail.connect(isUi(name) ? uiBus : sfxBus);
  const rev = (def.rev ?? 0) + dist * 0.5;
  if (rev > 0) {
    const s = ctx.createGain();
    s.gain.value = rev;
    tail.connect(s).connect(sfxVerb);
    nodes.push(s);
  }
  const t = now + 0.005;
  const dur = def.fn(t, pitch, out);
  voices.push({ name, end: t + dur });
  trash.push({ at: t + dur + 0.5, nodes });
  if (def.duck) duckTo(def.duck[0], 1 - (1 - def.duck[1]) * vol);
  if (def.shock) shellShock(t, def.shock * vol);
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
  } else if (name === 'frost') {
    // a frost sprayer: a cold hiss, glittering on top, with no roar in it at all
    const hp = bq('bandpass', 5200, 0.8, lvl);
    nz(hp, 0.7);
    const mid = bq('bandpass', 1800, 1.2, lvl);
    nz(mid, 0.25);
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.5;
    shimmer.connect(lvl);
    nodes.push(shimmer);
    osc('sine', 3136, shimmer, 0.03);
    osc('sine', 3322, shimmer, 0.025);
    osc('sine', 7, shimmer.gain, 0.4);
    set = (i) => {
      hp.frequency.setTargetAtTime(4200 + 1800 * i, ctx.currentTime, 0.05);
      lvl.gain.setTargetAtTime(0.13 * (0.5 + 0.5 * i), ctx.currentTime, 0.03);
    };
  } else if (name === 'charge') {
    // a charge cannon ripening: a hum climbing to a whine, with a tremble that quickens
    const lp = bq('lowpass', 300, 5, lvl);
    const o1 = osc('sawtooth', 55, lp, 0.4);
    const o2 = osc('sine', 110, lvl, 0.15);
    const trem = osc('sine', 4, o2.frequency, 6);
    set = (i) => {
      const n = ctx.currentTime;
      o1.frequency.setTargetAtTime(55 + 85 * i, n, 0.1);
      o2.frequency.setTargetAtTime(110 + 330 * i * i, n, 0.1);
      trem.frequency.setTargetAtTime(4 + 18 * i, n, 0.1);
      lp.frequency.setTargetAtTime(250 + 1600 * i, n, 0.1);
      lvl.gain.setTargetAtTime(0.02 + 0.07 * i, n, 0.08);
    };
  } else if (name === 'jumpstart') {
    // a jumpstart charging: current crackling across the gap, a hum under it climbing to a whine
    const lp = bq('lowpass', 400, 4, lvl);
    const o1 = osc('sine', 70, lvl, 0.35);
    const o2 = osc('sine', 140, lvl, 0.12, 9);
    const fizz = bq('bandpass', 2400, 2.5, lvl);
    nz(fizz, 0.5);
    nz(lp, 0.4);
    const buzz = ctx.createGain();
    buzz.gain.value = 0.5;
    buzz.connect(fizz);
    nodes.push(buzz);
    const flick = osc('sine', 23, buzz.gain, 0.5);
    set = (i) => {
      const n = ctx.currentTime;
      o1.frequency.setTargetAtTime(70 + 150 * i, n, 0.08);
      o2.frequency.setTargetAtTime(140 + 760 * i * i, n, 0.08);
      flick.frequency.setTargetAtTime(23 + 30 * i, n, 0.08);
      fizz.frequency.setTargetAtTime(2000 + 3500 * i, n, 0.08);
      lp.frequency.setTargetAtTime(300 + 1400 * i, n, 0.08);
      lvl.gain.setTargetAtTime(0.06 + 0.12 * i, n, 0.05);
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
  } else if (name === 'truck') {
    // a gun truck's motor: a lumpy chug at idle (the cylinders' beat chopping a growl), climbing
    // to a rasping roar flat out, the exhaust's rattle under it
    const lp = bq('lowpass', 300, 1.5, lvl);
    const chop = ctx.createGain();
    chop.gain.value = 0.6;
    chop.connect(lp);
    nodes.push(chop);
    const beat = osc('square', 11, chop.gain, 0.4);
    const o1 = osc('sawtooth', 40, chop, 0.5);
    const o2 = osc('square', 20, chop, 0.3, 8);
    const bp = bq('bandpass', 200, 1.2, chop);
    nz(bp, 0.5);
    set = (i) => {
      const n = ctx.currentTime;
      o1.frequency.setTargetAtTime(40 + 85 * i, n, 0.1);
      o2.frequency.setTargetAtTime(20 + 42 * i, n, 0.1);
      beat.frequency.setTargetAtTime(11 + 30 * i, n, 0.1);
      lp.frequency.setTargetAtTime(280 + 1100 * i, n, 0.1);
      bp.frequency.setTargetAtTime(200 + 600 * i, n, 0.1);
      lvl.gain.setTargetAtTime(0.022 + 0.036 * i, n, 0.08);
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
// The place: its reverb, its ambience, and the state of the mix
// ================================================================================================

const OPEN_HZ = 20000;
/** Paused: the world under water. */
const MUFFLE_HZ = 700;
/** The ambience bus against the sfx volume setting. */
const AMB_GAIN = 0.5;

type Space = 'open' | 'forest' | 'canyon' | 'cave' | 'metal' | 'ice' | 'room' | 'void';
/**
 * A reverb: tail length (s) and how fast it falls (power), brightness 0..1, early reflections
 * [how many, spread in s, how loud against the tail], pre-delay (s).
 */
interface SpaceDef { len: number; decay: number; bright: number; er: [number, number, number]; pre: number }
const SPACES: Record<Space, SpaceDef> = {
  // out in the air: little to bounce off, a soft dark tail
  open: { len: 1.4, decay: 3, bright: 0.45, er: [2, 0.04, 0.15], pre: 0.012 },
  // trees all round: lots of close, scattered reflections, a diffuse tail
  forest: { len: 1.8, decay: 3, bright: 0.5, er: [10, 0.05, 0.25], pre: 0.008 },
  // walls a long way apart: discrete slaps coming back
  canyon: { len: 2.6, decay: 2.4, bright: 0.55, er: [4, 0.22, 0.45], pre: 0.03 },
  // stone close round: dense, long, dark
  cave: { len: 3.2, decay: 2, bright: 0.4, er: [12, 0.06, 0.35], pre: 0.012 },
  // steel: bright, ringing
  metal: { len: 2.2, decay: 2.4, bright: 0.85, er: [8, 0.07, 0.3], pre: 0.01 },
  // ice: the brightest and longest
  ice: { len: 3.2, decay: 2.2, bright: 0.95, er: [4, 0.09, 0.25], pre: 0.02 },
  // the hangar: a small tin shed
  room: { len: 0.8, decay: 3, bright: 0.65, er: [8, 0.025, 0.4], pre: 0.003 },
  // the map: nothing near, a long, dim tail
  void: { len: 4.2, decay: 1.8, bright: 0.3, er: [0, 0, 0], pre: 0.04 },
};

/** A place's impulse: pre-delay, a few early reflections (different each side), then a tail that darkens as it fades. */
function spaceIR(sp: SpaceDef): AudioBuffer {
  const sr = ctx.sampleRate;
  const pre = Math.floor(sp.pre * sr);
  const tail = Math.floor(sp.len * sr);
  const b = ctx.createBuffer(2, pre + tail, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    let energy = 0;
    for (let i = 0; i < tail; i++) {
      const u = i / tail;
      lp += (0.12 + 0.83 * sp.bright) * (1 - 0.75 * u) * (Math.random() * 2 - 1 - lp);
      const x = lp * Math.pow(1 - u, sp.decay) * Math.min(1, i / (sr * 0.012));
      d[pre + i] = x;
      energy += x * x;
    }
    // the reflections are scaled against the tail's energy: the convolver normalizes the whole
    // impulse, so a lone tap would otherwise vanish under it
    const tap = Math.sqrt(energy) * sp.er[2];
    for (let k = 0; k < sp.er[0]; k++) {
      const at = pre + Math.floor((0.002 + Math.pow(Math.random(), 0.7) * sp.er[1]) * sr);
      const a = tap * (1 - (0.6 * k) / sp.er[0]) * (Math.random() < 0.5 ? -1 : 1);
      // a short smear, not a single sample: walls aren't perfect mirrors
      for (let j = 0; j < 24 && at + j < d.length; j++) d[at + j] += a * Math.exp(-j / 5) * (j % 2 ? -0.4 : 1);
    }
  }
  return b;
}

let space: Space | null = null;
let verb: { conv: ConvolverNode; g: GainNode } | null = null;

/** The place's reverb, crossfaded from the last (a fresh convolver, never a buffer swapped under a ringing tail). */
function setSpace(s: Space) {
  if (s === space) return;
  space = s;
  const now = ctx.currentTime;
  const conv = ctx.createConvolver();
  conv.buffer = spaceIR(SPACES[s]);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(1, now + 1.5);
  sfxVerb.connect(conv).connect(g).connect(world);
  if (verb) {
    const old = verb;
    old.g.gain.cancelScheduledValues(now);
    old.g.gain.setValueAtTime(old.g.gain.value, now);
    old.g.gain.linearRampToValueAtTime(0, now + 1.5);
    trash.push({ at: now + 1.5 + SPACES[s].len + 0.5, nodes: [old.conv, old.g] });
    window.setTimeout(() => sfxVerb.disconnect(old.conv), 1600);
  }
  verb = { conv, g };
}

// ---- ambience ------------------------------------------------------------------------------------

type AmbEvent =
  | 'bird' | 'insect' | 'frog' | 'call' | 'whale' | 'caw' | 'thunder' | 'gust' | 'creak' | 'clank'
  | 'drip' | 'bubble' | 'chime' | 'crack' | 'vent' | 'fire' | 'horn' | 'buzz' | 'machine';

interface AmbDef {
  space: Space;
  /** Air moving: level, centre (Hz), Q, gustiness 0..1. */
  wind?: [number, number, number, number];
  /** Ground and machinery under everything: level, lowpass (Hz). */
  rumble?: [number, number];
  /** A band of hiss (rain, surf, steam, sand): level, centre (Hz), Q, swell rate (Hz; 0 steady). */
  hiss?: [number, number, number, number];
  /** A drone on the music's root, so it's always in key: level, octaves up (semitones), timbre. */
  drone?: [number, number, 'warm' | 'glass' | 'hum'];
  /** One-shots around you, so many a minute. */
  events: Partial<Record<AmbEvent, number>>;
  /** Pitch of the one-shots (bigger, deeper things below 1). */
  pitch?: number;
  /** A menu: doesn't step back for the fight. */
  menu?: boolean;
}

const AMB: Record<string, AmbDef> = {
  // --- Oru-Tal: jungle, lava, crystal, a warm sea
  fernwood: { space: 'forest', wind: [0.5, 600, 0.6, 0.5], hiss: [0.1, 5200, 0.8, 0.06], events: { bird: 10, insect: 6, call: 1.5, caw: 1.5 } },
  basalt: { space: 'canyon', rumble: [0.9, 140], hiss: [0.2, 2600, 0.7, 0.15], wind: [0.25, 400, 0.8, 0.4], events: { bubble: 9, vent: 4, fire: 4, thunder: 1 }, pitch: 0.6 },
  prism: { space: 'ice', wind: [0.6, 1500, 2.5, 0.6], drone: [0.2, 24, 'glass'], events: { chime: 8, gust: 3 } },
  jade: { space: 'open', hiss: [0.35, 900, 0.5, 0.09], wind: [0.25, 500, 0.7, 0.3], events: { whale: 2, call: 2, bird: 4, bubble: 2 } },
  // --- Halcyon: kelp, a neon port, old arks, the storm
  kelp: { space: 'open', hiss: [0.3, 700, 0.5, 0.1], drone: [0.18, 12, 'warm'], events: { bubble: 8, whale: 2, chime: 2 } },
  stiltport: { space: 'metal', hiss: [0.28, 800, 0.5, 0.1], drone: [0.3, 0, 'hum'], events: { horn: 2, clank: 6, buzz: 4, machine: 2, caw: 2 } },
  arkbones: { space: 'metal', wind: [0.45, 500, 0.9, 0.6], events: { creak: 6, clank: 3, drip: 5, gust: 2 } },
  stormwall: { space: 'open', hiss: [0.5, 3600, 0.4, 0.05], wind: [0.6, 500, 0.6, 0.8], rumble: [0.4, 120], events: { thunder: 6, gust: 4 } },
  // --- Kessra: desert
  saltpans: { space: 'open', wind: [0.5, 900, 0.6, 0.6], hiss: [0.14, 6000, 0.7, 0.07], events: { gust: 4, caw: 1 } },
  mesarun: { space: 'canyon', wind: [0.55, 500, 0.8, 0.7], events: { gust: 5, caw: 2, call: 1 } },
  monoliths: { space: 'canyon', wind: [0.4, 400, 1, 0.5], drone: [0.3, 0, 'warm'], events: { gust: 3, chime: 1, buzz: 1 } },
  oasis: { space: 'open', hiss: [0.1, 1800, 0.6, 0.12], wind: [0.25, 600, 0.6, 0.3], events: { bird: 10, insect: 5, drip: 3, chime: 1.5 } },
  // --- Mirefall: swamp
  glowcap: { space: 'forest', drone: [0.25, 12, 'glass'], wind: [0.35, 400, 0.7, 0.3], events: { bubble: 4, insect: 6, drip: 4, chime: 2 } },
  peat: { space: 'forest', wind: [0.3, 350, 0.7, 0.4], events: { frog: 10, drip: 6, creak: 2, insect: 3, call: 1 } },
  temple: { space: 'cave', drone: [0.3, 0, 'warm'], wind: [0.3, 400, 0.8, 0.4], events: { drip: 8, call: 1.5, creak: 1, frog: 3 } },
  sporevents: { space: 'forest', rumble: [0.5, 120], hiss: [0.3, 900, 0.6, 0.12], events: { bubble: 6, vent: 5, insect: 2 }, pitch: 0.8 },
  // --- Glacis: ice
  shelf: { space: 'ice', wind: [0.6, 700, 0.8, 0.7], drone: [0.2, 24, 'glass'], events: { crack: 3, gust: 4, chime: 1 } },
  springs: { space: 'ice', wind: [0.35, 600, 0.7, 0.5], hiss: [0.12, 3000, 0.6, 0.06], events: { bubble: 8, vent: 4, drip: 4 } },
  tundra: { space: 'open', wind: [0.7, 500, 0.7, 0.8], events: { gust: 5, call: 2, crack: 1 }, pitch: 0.8 },
  enginecity: { space: 'metal', drone: [0.3, 0, 'hum'], rumble: [0.5, 100], wind: [0.3, 600, 0.8, 0.5], events: { machine: 4, clank: 5, buzz: 3, horn: 1, vent: 2 } },
  // --- Ashgrave: the battlefield
  titans: { space: 'metal', wind: [0.45, 450, 0.8, 0.6], rumble: [0.4, 100], events: { creak: 7, clank: 3, machine: 1, gust: 2 }, pitch: 0.75 },
  glass: { space: 'open', drone: [0.22, 12, 'glass'], wind: [0.35, 700, 0.7, 0.5], hiss: [0.06, 5000, 1, 0], events: { buzz: 3, fire: 3, chime: 2 } },
  scavcamp: { space: 'open', wind: [0.35, 500, 0.7, 0.5], events: { fire: 8, clank: 5, machine: 1, horn: 1, buzz: 1 } },
  whitewood: { space: 'forest', wind: [0.55, 450, 0.8, 0.7], events: { creak: 5, caw: 3, gust: 3 } },
  // --- Vesh: reef and sea
  coralflats: { space: 'open', hiss: [0.45, 900, 0.5, 0.08], events: { drip: 8, bird: 6, bubble: 3, caw: 1 } },
  whalelagoon: { space: 'open', hiss: [0.28, 700, 0.5, 0.07], wind: [0.25, 500, 0.6, 0.3], events: { whale: 5, bird: 3 } },
  bonearch: { space: 'canyon', wind: [0.5, 450, 0.9, 0.6], hiss: [0.18, 700, 0.5, 0.08], events: { creak: 4, caw: 3, gust: 3 } },
  tidecaves: { space: 'cave', hiss: [0.35, 600, 0.5, 0.1], rumble: [0.3, 110], events: { drip: 10, bubble: 3 } },
  // --- Cinder: the company's planet
  orchards: { space: 'open', drone: [0.25, 0, 'hum'], wind: [0.25, 600, 0.7, 0.3], events: { machine: 4, clank: 4, buzz: 2, chime: 2 } },
  refinery: { space: 'metal', rumble: [0.7, 110], hiss: [0.14, 2500, 0.6, 0], drone: [0.22, 0, 'hum'], events: { vent: 5, horn: 1.5, machine: 4, clank: 4, fire: 3 } },
  pipeline: { space: 'canyon', wind: [0.45, 500, 0.8, 0.6], drone: [0.22, 0, 'hum'], events: { clank: 4, vent: 2, buzz: 2, gust: 2 } },
  chemlake: { space: 'open', drone: [0.25, 12, 'warm'], hiss: [0.08, 1500, 0.6, 0.1], events: { bubble: 9, vent: 3, buzz: 1 } },
  // --- boarding: inside a working freighter (machine hum, the engines through the deck, pipes and plates)
  shipdeck: { space: 'metal', drone: [0.2, 0, 'hum'], rumble: [0.4, 110], hiss: [0.05, 1800, 0.6, 0], events: { clank: 5, vent: 2.5, buzz: 2, machine: 2, creak: 3 }, pitch: 0.9 },
  // --- menus
  hangar: { space: 'room', rumble: [0.35, 140], hiss: [0.06, 2000, 0.5, 0], drone: [0.2, 0, 'hum'], events: { clank: 5, vent: 2, machine: 1.5, drip: 2, buzz: 1 }, menu: true },
  map: { space: 'void', drone: [0.35, 0, 'warm'], wind: [0.1, 2500, 3, 0.4], events: { chime: 1, buzz: 0.5 }, menu: true },
  title: { space: 'open', wind: [0.45, 500, 0.8, 0.7], events: { gust: 3, thunder: 1 }, menu: true },
};

/** The one-shots. `o` is already placed (panned, filtered for distance); returns how long it rings. */
const AMB_EV: Record<AmbEvent, (t: number, o: AudioNode, p: number) => number> = {
  // a few quick tweets, each a sine flicking up or down
  bird: (t, o, p) => {
    const n = 2 + Math.floor(Math.random() * 4);
    const f = (2600 + Math.random() * 1800) * p;
    let at = 0;
    for (let i = 0; i < n; i++) {
      const up = Math.random() < 0.6;
      tone(o, t + at, 'sine', f * (up ? 0.8 : 1.25), f * (up ? 1.3 : 0.75), 0.05 + Math.random() * 0.05, 0.05, 0.004);
      at += 0.07 + Math.random() * 0.1;
    }
    return at + 0.12;
  },
  // a cicada: a high buzz chopped fast, swelling and dying away
  insect: (t, o, p) => {
    const dur = 0.8 + Math.random() * 1.4;
    const bp = filt(o, 'bandpass', 5200 * p, 5);
    const env = ctx.createGain();
    adsr(env.gain, t, dur * 0.3, 0.1, 1, dur * 0.3, dur * 0.6, 0.035);
    env.connect(bp);
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    chop.connect(env);
    const s = ctx.createOscillator();
    s.type = 'square';
    s.frequency.value = 4800 * p;
    const l = ctx.createOscillator();
    l.type = 'square';
    l.frequency.value = 30 + Math.random() * 25;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    s.connect(chop);
    l.connect(lg).connect(chop.gain);
    for (const x of [s, l]) {
      x.start(t);
      x.stop(t + dur + 0.1);
    }
    return dur + 0.1;
  },
  // a frog: two to four croaks, each a quick run of low reedy pulses
  frog: (t, o, p) => {
    const bp = filt(o, 'bandpass', 600 * p, 3);
    const f = (140 + Math.random() * 80) * p;
    const n = 2 + Math.floor(Math.random() * 3);
    let at = 0;
    for (let c = 0; c < n; c++) {
      for (let k = 0; k < 5; k++) tone(bp, t + at + k * 0.03, 'square', f, f * 0.9, 0.022, 0.12, 0.002);
      at += 0.25 + Math.random() * 0.2;
    }
    return at;
  },
  // something big, a long way off, calling: a reedy cry that rises and falls
  call: (t, o, p) => {
    const dur = 0.9 + Math.random() * 0.8;
    const f = (240 + Math.random() * 160) * p;
    const bp = filt(o, 'bandpass', f * 2.5, 2);
    const s = tone(bp, t, 'sawtooth', f, f, dur, 0.09, dur * 0.3);
    s.frequency.linearRampToValueAtTime(f * 1.12, t + dur * 0.3);
    s.frequency.exponentialRampToValueAtTime(f * 0.62, t + dur);
    const l = ctx.createOscillator();
    l.frequency.value = 5 + Math.random() * 2;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.02;
    l.connect(lg).connect(s.frequency);
    l.start(t);
    l.stop(t + dur + 0.05);
    return dur + 0.1;
  },
  // a deep, slow moan, gliding up and back down
  whale: (t, o, p) => {
    const dur = 2.5 + Math.random() * 1.5;
    const f = (100 + Math.random() * 50) * p;
    for (const [w, k, pk] of [['sine', 1, 0.14], ['triangle', 2, 0.04]] as const) {
      const s = tone(o, t, w, f * k, f * k, dur, pk, dur * 0.4);
      s.frequency.linearRampToValueAtTime(f * k * 1.4, t + dur * 0.45);
      s.frequency.linearRampToValueAtTime(f * k * 0.85, t + dur);
    }
    return dur + 0.1;
  },
  // a harsh bird, twice
  caw: (t, o, p) => {
    const bp = filt(o, 'bandpass', 1400 * p, 1.5);
    for (let i = 0; i < 2; i++) {
      const tt = t + i * (0.28 + Math.random() * 0.1);
      tone(bp, tt, 'sawtooth', 760 * p, 560 * p, 0.18, 0.1, 0.01);
      noise(bp, tt, 0.14, 'bandpass', 1800 * p, 1400 * p, 2, 0.05, 0.01);
    }
    return 0.7;
  },
  // thunder a long way off: a roll that comes and goes in waves
  thunder: (t, o, p) => {
    const dur = 2.8 + Math.random() * 1.6;
    noise(o, t, dur, 'lowpass', 700 * p, 90, 0.8, 0.3, 0.25);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      noise(o, t + 0.4 + Math.random() * 1.4, 1.2 + Math.random(), 'lowpass', 420 * p, 80, 0.8, 0.2, 0.15);
    }
    return dur + 1.5;
  },
  // a gust: air swelling past, with a thin whistle in it
  gust: (t, o, p) => {
    const dur = 1.8 + Math.random() * 1.6;
    noise(o, t, dur, 'bandpass', 380 * p, 1200 * p, 1.2, 0.14, dur * 0.45);
    noise(o, t + 0.2, dur * 0.8, 'bandpass', 1700 * p, 2300 * p, 9, 0.03, dur * 0.4);
    return dur + 0.2;
  },
  // metal under strain: a saw stepping at random through a narrow band
  creak: (t, o, p) => {
    const dur = 0.8 + Math.random() * 0.9;
    const f = (65 + Math.random() * 50) * p;
    const s = tone(filt(o, 'bandpass', (500 + Math.random() * 500) * p, 6), t, 'sawtooth', f, f, dur, 0.12, 0.2);
    for (let k = 1; k < dur / 0.035; k++) s.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.22 + k * 0.004), t + k * 0.035);
    return dur + 0.05;
  },
  // struck metal far off: a thud, a click, and partials that don't line up
  clank: (t, o, p) => {
    const f = (300 + Math.random() * 360) * p;
    const parts: [number, number, number][] = [[1, 0.06, 1.1], [2.76, 0.04, 0.8], [5.4, 0.025, 0.5], [8.9, 0.012, 0.3]];
    for (const [k, pk, d] of parts) tone(o, t, 'sine', f * k, f * k * 0.998, d, pk, 0.001);
    noise(o, t, 0.02, 'highpass', 3000, 3000, 0.7, 0.07);
    tone(o, t, 'sine', 120 * p, 70 * p, 0.12, 0.1, 0.002);
    return 1.2;
  },
  // a drip: a quick upward plip and the ring of it
  drip: (t, o, p) => {
    const n = 1 + (Math.random() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.15 + Math.random() * 0.3);
      const f = (700 + Math.random() * 500) * p;
      tone(o, tt, 'sine', f, f * 2.8, 0.06, 0.09, 0.001, 0.03);
      tone(o, tt + 0.02, 'sine', f * 2.2, f * 2.2, 0.15, 0.02, 0.002);
    }
    return 0.6;
  },
  // bubbles breaking the surface: a few bloops
  bubble: (t, o, p) => {
    const n = 1 + Math.floor(Math.random() * 4);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const f = (110 + Math.random() * 90) * p;
      tone(o, t + at, 'sine', f, f * 3.4, 0.09, 0.1, 0.003, 0.07);
      at += 0.08 + Math.random() * 0.25;
    }
    return at + 0.1;
  },
  // crystal or ice: a few high tinkles, ringing long
  chime: (t, o, p) => {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + Math.random() * 1.2;
      const f = (2400 + Math.random() * 3600) * p;
      const d = 0.6 + Math.random();
      tone(o, tt, 'sine', f, f, d, 0.03, 0.002);
      tone(o, tt, 'sine', f * 2.76, f * 2.76, d * 0.4, 0.008, 0.002);
    }
    return 2.4;
  },
  // ice giving way: a snap, ticks, a low boom, and the falling 'pew' a sheet of ice sings
  crack: (t, o, p) => {
    noise(o, t, 0.04, 'highpass', 2500, 2500, 0.7, 0.2);
    crackle(o, t, 0.25, 8, 0.07);
    tone(o, t + 0.02, 'sine', 90 * p, 45 * p, 0.6, 0.1, 0.004);
    tone(o, t + 0.03, 'sine', 3200 * p, 380 * p, 0.35, 0.04, 0.002, 0.3);
    return 0.8;
  },
  // a steam vent letting go
  vent: (t, o, p) => {
    const dur = 1.2 + Math.random() * 0.8;
    noise(o, t, dur, 'highpass', 2400 * p, 1800 * p, 0.7, 0.06, 0.15);
    noise(o, t, dur * 0.7, 'bandpass', 700 * p, 500 * p, 1, 0.04, 0.1);
    return dur + 0.1;
  },
  // a fire: pops and crackle over a soft roar
  fire: (t, o, p) => {
    crackle(o, t, 1.2, 14, 0.06);
    noise(o, t, 1.3, 'lowpass', 600 * p, 400 * p, 0.7, 0.05, 0.3);
    return 1.4;
  },
  // a foghorn or a klaxon a long way off: two notes a minor third apart
  horn: (t, o, p) => {
    const lp = filt(o, 'lowpass', 520);
    const f = 110 * p;
    for (const k of [1, 1.19]) tone(lp, t, 'sawtooth', f * k, f * k, 1.6, 0.06, 0.1);
    return 1.7;
  },
  // power: a buzz swelling and fading, with a spit or two of sparks
  buzz: (t, o, p) => {
    const dur = 1.3 + Math.random() * 0.6;
    const bp = filt(o, 'bandpass', 900 * p, 3);
    for (const k of [1, 2]) tone(bp, t, 'sawtooth', 120 * p * k, 120 * p * k, dur, 0.035 / k, dur * 0.4);
    crackle(o, t + dur * 0.3, dur * 0.5, 3, 0.04);
    return dur + 0.1;
  },
  // a press somewhere, thumping, and a clink as it stops
  machine: (t, o, p) => {
    const n = 4 + Math.floor(Math.random() * 4);
    const gap = 0.4 + Math.random() * 0.15;
    for (let i = 0; i < n; i++) {
      tone(o, t + i * gap, 'sine', 85 * p, 50 * p, 0.15, 0.12, 0.002);
      noise(o, t + i * gap, 0.06, 'lowpass', 400, 300, 0.7, 0.06);
    }
    tone(o, t + n * gap, 'sine', 1300 * p, 1290 * p, 0.25, 0.02, 0.002);
    return n * gap + 0.3;
  },
};

interface Amb {
  def: AmbDef;
  out: GainNode;
  wet: GainNode;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  next: Map<AmbEvent, number>;
  stopAt: number;
}
const ambs: Amb[] = [];
let amb: Amb | null = null;
let wantPlace: string | null = null;
let ambI = -1;

/** Seconds to the next of something that happens `perMin` times a minute, at random (a Poisson process). */
const nextIn = (perMin: number) => Math.max(0.4, (-Math.log(1 - Math.random()) * 60) / perMin);

function makeAmb(def: AmbDef): Amb {
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(1, now + 3);
  out.connect(ambLevel);
  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0, now);
  wet.gain.linearRampToValueAtTime(1, now + 3);
  wet.connect(ambWet);
  const srcs: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [out, wet];
  const gain = (v: number, to: AudioNode) => {
    const g = ctx.createGain();
    g.gain.value = v;
    g.connect(to);
    nodes.push(g);
    return g;
  };
  const bq = (type: BiquadFilterType, f: number, q: number, to: AudioNode) => {
    const b = filt(to, type, f, q);
    nodes.push(b);
    return b;
  };
  const bed = (buf: AudioBuffer, to: AudioNode) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(to);
    s.start(now, Math.random() * buf.duration);
    srcs.push(s);
  };
  /** A slow wobble added onto a param: rate (Hz), depth. */
  const lfo = (rate: number, depth: number, to: AudioParam) => {
    const l = ctx.createOscillator();
    l.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    l.connect(g).connect(to);
    l.start(now);
    srcs.push(l);
    nodes.push(g);
  };
  const r = () => Math.random();

  if (def.wind) {
    // two slow wobbles at unrelated rates push the level and the pitch of the air around: gusts
    const [lv, hz, q, gust] = def.wind;
    const g = gain(lv * (1 - 0.6 * gust), out);
    const bp = bq('bandpass', hz, q, g);
    bed(pinkBuf, bp);
    lfo(0.05 + r() * 0.04, lv * gust * 0.3, g.gain);
    lfo(0.11 + r() * 0.06, lv * gust * 0.3, g.gain);
    lfo(0.07 + r() * 0.05, hz * 0.35, bp.frequency);
  }
  if (def.rumble) {
    const [lv, hz] = def.rumble;
    // pink noise is mostly lows: a little of it under 150 Hz goes a long way
    const g = gain(lv * 0.35, out);
    bed(pinkBuf, bq('lowpass', hz, 0.7, g));
    lfo(0.03 + r() * 0.03, lv * 0.09, g.gain);
  }
  if (def.hiss) {
    // a swell on it makes surf, steady makes rain or steam
    const [lv, hz, q, swell] = def.hiss;
    const g = gain(swell ? lv * 0.55 : lv, out);
    bed(pinkBuf, bq('bandpass', hz, q, g));
    if (swell) {
      lfo(swell, lv * 0.4, g.gain);
      lfo(swell * 1.618, lv * 0.15, g.gain);
    }
  }
  if (def.drone) {
    const [lv, oct, kind] = def.drone;
    const f = mtof((current?.def.root ?? 38) + oct);
    const g = gain(lv * 0.7, out);
    lfo(0.09 + r() * 0.06, lv * 0.3, g.gain);
    const osc = (w: Wave, fr: number, v: number, to: AudioNode) => {
      const o = ctx.createOscillator();
      setWave(o, w);
      o.frequency.value = fr;
      o.connect(gain(v, to));
      o.start(now);
      srcs.push(o);
      return o;
    };
    if (kind === 'warm') {
      const lp = bq('lowpass', 600, 0.7, g);
      osc('triangle', f, 0.12, lp).detune.value = -6;
      osc('triangle', f, 0.12, lp).detune.value = 6;
      osc('sine', f * 1.5, 0.05, lp);
    } else if (kind === 'glass') {
      // pure partials a hair apart, so they beat slowly: the aurora's hum
      osc('sine', f, 0.06, g);
      osc('sine', f * 2.003, 0.035, g);
      osc('sine', f * 3.007, 0.018, g);
    } else {
      const lp = bq('lowpass', 260, 2, g);
      lfo(0.08 + r() * 0.04, 70, lp.frequency);
      osc('sawtooth', f, 0.08, lp);
      osc('sawtooth', f * 1.0035, 0.08, lp);
      osc('sine', f / 2, 0.08, g);
    }
  }
  const next = new Map<AmbEvent, number>();
  for (const [k, perMin] of Object.entries(def.events) as [AmbEvent, number][]) next.set(k, now + 1 + nextIn(perMin));
  return { def, out, wet, srcs, nodes, next, stopAt: Infinity };
}

/** One of the place's one-shots, somewhere around you: a random side, distance, pitch and level. */
function ambEvent(a: Amb, kind: AmbEvent, t: number) {
  const dist = 0.25 + Math.random() * 0.75;
  const o = ctx.createGain();
  o.gain.value = (1 - 0.55 * dist) * (0.7 + Math.random() * 0.3);
  const air = ctx.createBiquadFilter();
  air.type = 'lowpass';
  air.frequency.value = 14000 * Math.pow(0.1, dist);
  const pan = ctx.createStereoPanner();
  pan.pan.value = (Math.random() * 2 - 1) * 0.9;
  const send = ctx.createGain();
  send.gain.value = 0.25 + 0.7 * dist;
  o.connect(air).connect(pan).connect(a.out);
  pan.connect(send).connect(a.wet);
  const dur = AMB_EV[kind](t, o, (a.def.pitch ?? 1) * (0.88 + Math.random() * 0.24));
  trash.push({ at: t + dur + 0.5, nodes: [o, air, pan, send] });
}

function setPlace(place: string | null) {
  const def = place ? AMB[place] : undefined;
  if (amb && def === amb.def) return;
  const now = ctx.currentTime;
  if (amb) {
    for (const g of [amb.out.gain, amb.wet.gain]) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + 3);
    }
    amb.stopAt = now + 3.1;
  }
  amb = null;
  if (!def) return;
  setSpace(def.space);
  amb = makeAmb(def);
  ambs.push(amb);
}

// ---- the state of the mix ---------------------------------------------------------------------

let muffled = false;
let danger = 0;
let nextBeat = 0;
let duckUntil = 0;
let duckDepth = 1;

/** Ducks the music and the ambience to `depth` for `seconds`: quick down, gentle back (the deeper of two overlapping ducks wins). */
function duckTo(seconds: number, depth: number) {
  const now = ctx.currentTime;
  if (now < duckUntil) depth = Math.min(depth, duckDepth);
  duckDepth = depth;
  duckUntil = Math.max(duckUntil, now + Math.max(0, seconds));
  for (const g of [musicDuck.gain, ambDuck.gain]) {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(depth, now + 0.035);
    g.setValueAtTime(depth, duckUntil);
    g.linearRampToValueAtTime(1, duckUntil + 0.6);
  }
}

/** A blow you feel: the world dulls and comes back (hard enough, it deafens, and your ears ring). */
function shellShock(t: number, k: number) {
  const f = worldLP.frequency;
  f.cancelScheduledValues(t);
  f.setValueAtTime(f.value, t);
  f.exponentialRampToValueAtTime(Math.max(240, OPEN_HZ * Math.pow(0.012, k)), t + 0.03);
  f.setTargetAtTime(muffled ? MUFFLE_HZ : OPEN_HZ, t + 0.15 + 0.6 * k, 0.15 + 0.7 * k);
  if (k >= 0.8) tone(uiBus, t + 0.05, 'sine', 3900, 3860, 2.4, 0.014, 0.1);
}

/** Low hull: a heartbeat, quicker and louder the closer to nothing. */
function heartbeat(now: number) {
  if (danger < 0.05 || now < nextBeat) return;
  const t = Math.max(now, nextBeat) + 0.02;
  const v = 0.1 + 0.22 * danger;
  for (const [at, k] of [[0, 1], [0.17, 0.7]] as const) {
    tone(sfxBus, t + at, 'sine', 62, 42, 0.16, v * k, 0.006);
    noise(sfxBus, t + at, 0.07, 'lowpass', 220, 150, 0.8, v * k * 0.5, 0.004);
  }
  nextBeat = t + 1.05 - 0.4 * danger;
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
  /** Channels that sit out (a boss theme gone quiet in one of its parts). */
  mute?: Chan[];
  rev?: Partial<Record<Chan, number>>;
  dly?: Partial<Record<Chan, number>>;
  /**
   * A boss theme's band in each of its fights' parts (its phases, then its last stand): what
   * changes from the part before, taken up on the next bar (see `audio.part`). (The tune itself
   * is written once, from the track, so how busy it is can't change by part.)
   */
  parts?: Partial<Pick<TrackDef, 'lead' | 'leadOct' | 'dbl' | 'bass' | 'bassStyle' | 'pad' | 'padOct' | 'arp' | 'arpOct' | 'arpRate' | 'arpAt' | 'arpStyle' | 'drums' | 'fill' | 'kick' | 'crash' | 'mute'>>[];
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
  // Vask, Cage of Brass: G harmonic minor at 140, Oru-Tal's toms under a galloping distorted
  // bass. Caged, the Hesk are the band (clanking metal, a grinding saw lead); as the cage cracks
  // her flute takes over; free, the metal's gone and the war toms come up; in her last stand the
  // harness clanks again under everything.
  boss_orutal: {
    bpm: 140, root: 43, scale: SC.harmMinor, progA: [0, 5, 3, 4], progB: [5, 3, 0, 4, 5, 3, 6, 4],
    lead: 'saw', leadOct: 24, density: 0.55,
    bass: 'dist', bassStyle: 'gallop', pad: 'dark', padOct: 12,
    arp: 'pulse12', arpOct: 24, arpRate: 2, arpAt: 0.6, arpStyle: 'down',
    drums: {
      kick: '0...0...0...0.2.', metal: '..1...1...1...1.', tomLo: '0..1..0...0.1...', snare: '....0.......0...',
      hat: '2222222222222222',
    },
    fill: { metal: '..1.1.1.11111111', snare: '....0...0.0.0000' },
    crash: true, kick: [130, 40, 0.35], minI: 0.6, mix: { lead: 0.15 },
    parts: [
      {},
      {
        lead: 'flute', arp: 'marimba', arpAt: 0.5, arpStyle: 'broken',
        drums: {
          kick: '0...0...0...0.2.', metal: '......1.......1.', tomLo: '0..1..0...0.1...', tomHi: '........0.....1.',
          conga: '..1..1.....1..1.', snare: '....0.......0...', hat: '1313131313131313',
        },
        fill: { tomHi: '........0.0.0.00', tomLo: '0.0.0.0.0.0.....' },
      },
      {
        lead: 'flute', dbl: true, pad: 'warm', arp: 'marimba', arpRate: 1, arpAt: 0.5, arpStyle: 'broken',
        drums: {
          kick: '0...0...0...0...', tomLo: '0.10..0.0.10..0.', tomHi: '....0.....0.0.0.', conga: '.1.1..1..1.1..1.',
          clap: '....1.......1...', shaker: '2222222222222222',
        },
        fill: { tomHi: '........0.0.0.00', tomLo: '0.0.0.0.0.0.....' },
      },
      {
        lead: 'flute', dbl: true, pad: 'dark', arp: 'pulse12', arpRate: 1, arpAt: 0.4, arpStyle: 'up',
        drums: {
          kick: '0...0...0...0.0.', tomLo: '0.10..0.0.10..0.', tomHi: '....0.....0.0.0.', metal: '0.1.0.1.0.1.0.1.',
          clap: '....1.......1...', shaker: '2222222222222222',
        },
      },
    ],
  },
  // The Waking Engine, The Level-Keeper: B minor at 120, a beat every half second (its count and
  // its beams land on it). Half asleep, a clock in the ice: a ticking rim, a held thrum of sub, a
  // music-box bell now and then, a click of metal at the end of the bar. Stirring, a pulse bass
  // and hats come up and the bells count upward. Awake: four on the floor, a cold saw lead doubled
  // over the bells. Its last stand: the bells take the lead back and metal clicks every sixteenth,
  // a ledger being run.
  boss_glacis: {
    bpm: 120, root: 35, scale: SC.aeolian, progA: [0, 5, 3, 4], progB: [5, 6, 0, 4, 5, 6, 3, 4],
    lead: 'bell', leadOct: 36, density: 0.5,
    bass: 'sub', bassStyle: 'pulse8', pad: 'cold', padOct: 24,
    arp: null, arpOct: 36, arpRate: 2, arpAt: 0.5, arpStyle: 'up',
    drums: { rim: '0...0...0...0...', kick: '0...............', metal: '..............1.' },
    kick: [100, 36, 0.5], minI: 0.6, mix: { lead: 0.14, pad: 0.09 }, rev: { lead: 0.5, arp: 0.45, snr: 0.5 },
    parts: [
      {},
      {
        bass: 'bpulse', arp: 'bell', crash: true,
        drums: {
          kick: '0.....0...0.....', rim: '0...0...0...0...', snare: '....1.......1...',
          hat: '2.2.2.2.2.2.2.2.', metal: '...1.......1....',
        },
        fill: { snare: '....1.......1111' },
      },
      {
        bass: 'dist', lead: 'saw', leadOct: 24, dbl: true, arp: 'pulse12', arpRate: 1, arpStyle: 'up', pad: 'dark', padOct: 12,
        drums: {
          kick: '0...0...0...0...', snare: '....0.......0...', clap: '....1.......1...',
          hat: '1212121212121212', ohat: '..2...2...2...2.', rim: '0...0...0...0...',
        },
        fill: { snare: '....0...0.0.0000', tomLo: '..........0..0..' },
      },
      {
        bass: 'dist', lead: 'bell', leadOct: 36, dbl: true, arp: 'bell', arpRate: 1, arpStyle: 'updown', pad: 'dark', padOct: 12,
        drums: {
          kick: '0...0...0...0.0.', snare: '....0.......0...', clap: '....1.......1...',
          hat: '1212121212121212', metal: '1111111111111111', rim: '0...0...0...0...',
        },
        fill: { snare: '....0...00000000', tomLo: '..........0..0..' },
      },
    ],
  },
  // Queen Istra, The Tidecall: a harpooners' shanty in D dorian at 126 (her irons and her broadside
  // land on its beat) over Vesh's dembow. The hunt: her steel drum calls over marimba and the
  // crew stamping two and four. Broadsides: the brass comes in, a distorted bass, low toms going
  // off like guns. The tide comes back: the crew's gone, the band thins to the kick, a slow wash
  // of marimba up and down and the steel drum high and alone. Her last stand: everyone, once more.
  boss_vesh: {
    bpm: 126, root: 38, scale: SC.dorian, progA: [0, 6, 0, 4], progB: [3, 6, 0, 4, 3, 2, 6, 4],
    lead: 'steel', leadOct: 24, density: 0.6,
    bass: 'sub', bassStyle: 'offbeat', pad: 'warm', padOct: 12,
    arp: 'marimba', arpOct: 24, arpRate: 2, arpAt: 0.45, arpStyle: 'broken',
    drums: {
      kick: '0...0...0...0...', rim: '...0..0....0..0.', clap: '....1.......1...',
      conga: '..1.....1.1...1.', shaker: '2222222222222222',
    },
    fill: { conga: '........1.1.1111', clap: '....1...1.1.1111' },
    crash: true, kick: [120, 40, 0.35], minI: 0.6, mix: { lead: 0.16, pad: 0.05 },
    parts: [
      {},
      {
        lead: 'brass', bass: 'dist', arp: 'steel', arpOct: 36, arpStyle: 'up',
        drums: {
          kick: '0...0...0...0...', tomLo: '0.....0...0.....', rim: '...0..0....0..0.', snare: '....0.......0...',
          metal: '..1.......1.....', hat: '1212121212121212',
        },
        fill: { tomLo: '0.0.0.0.0.0.0000', snare: '....0...0.0.0000' },
      },
      {
        lead: 'steel', leadOct: 36, bass: 'sub', pad: 'warm', padOct: 24, arp: 'marimba', arpRate: 1, arpStyle: 'updown', crash: false,
        drums: { kick: '0.......0.......', rim: '...0..0....0..0.', tomLo: '........0.....0.', shaker: '2.2.2.2.2.2.2.2.' },
        fill: { tomLo: '........0.0.0.0.' },
      },
      {
        lead: 'brass', dbl: true, bass: 'dist', pad: 'dark', arp: 'steel', arpOct: 36, arpRate: 1, arpStyle: 'updown', crash: true,
        drums: {
          kick: '0...0...0...0.0.', tomLo: '0.....0...0.....', rim: '...0..0....0..0.', snare: '....0.......0...',
          clap: '....1.......1...', metal: '0.1.0.1.0.1.0.1.', shaker: '2222222222222222',
        },
        fill: { tomLo: '0.0.0.0.0.0.0000', snare: '....0...00000000' },
      },
    ],
  },
  // ARU-0, Final Notice: Vantorr's company march at 112, Cinder's tempo (its claws land on the
  // beat), in a bright C major for the account it's opening. Account open: hold music on the keys
  // over an oom-pah bass, a dot-matrix chatter in the hats. In arrears: the brass and a distorted
  // bass take over, snare rolls, the printer running hot. Its nineteen seconds: everything stops
  // but a hum. Called: the Engine's bells and its ticking clock, in Cinder's key. Its last stand:
  // the march and the bells at once.
  boss_cinder: {
    bpm: 112, root: 36, scale: SC.ionian, progA: [0, 3, 4, 0], progB: [5, 3, 1, 4, 5, 3, 4, 4],
    lead: 'keys', leadOct: 24, density: 0.55,
    bass: 'bsaw', bassStyle: 'march', pad: 'warm', padOct: 12,
    arp: 'pluck', arpOct: 36, arpRate: 2, arpAt: 0.45, arpStyle: 'up',
    drums: {
      kick: '0.......0.......', snare: '....0.......0...', tek: '1.11.1.1110.1.1.', hat: '2.2.2.2.2.2.2.2.',
      metal: '..............2.',
    },
    fill: { snare: '....0...0.0.0000', tek: '1111111111111111' },
    crash: true, kick: [130, 42, 0.3], minI: 0.6, mix: { lead: 0.15, pad: 0.06 },
    parts: [
      {},
      {
        lead: 'brass', bass: 'dist', arp: 'pulse12', arpRate: 1, arpStyle: 'broken',
        drums: {
          kick: '0.......0...0...', snare: '..1.0..1..1.0.11', tek: '1111.111.1111.11', hat: '1212121212121212',
          metal: '....2.......2...',
        },
        fill: { snare: '0.1.0.110.1.0000' },
      },
      {
        bass: 'sub', bassStyle: 'long', pad: 'cold', padOct: 12, crash: false, mute: ['lead', 'arp', 'drum'],
      },
      {
        lead: 'bell', leadOct: 36, arp: 'bell', arpRate: 2, arpStyle: 'up', bass: 'sub', bassStyle: 'pulse8', pad: 'cold', padOct: 24,
        crash: true, mute: [],
        drums: { rim: '0...0...0...0...', kick: '0.......0.......', metal: '..............1.' },
        fill: { rim: '0.0.0.0.0.0.0000' },
      },
      {
        lead: 'brass', dbl: true, arp: 'bell', arpRate: 1, arpStyle: 'updown', bass: 'dist', bassStyle: 'march', pad: 'dark', padOct: 12,
        drums: {
          kick: '0...0...0...0.0.', snare: '..1.0..1..1.0.11', rim: '0...0...0...0...', tek: '1111.111.1111.11',
          metal: '1.1.1.1.1.1.1.1.', hat: '1212121212121212',
        },
        fill: { snare: '0.1.0.110.1.0000' },
      },
    ],
  },
  // Warlord Khet, Nobody's Titan: 116, the titan's step (its leap lands on the beat), in
  // Ashgrave's D phrygian. Riding it: his scrap band, a grinding riff, stomps and a gang chanting
  // on the clap. It isn't listening: every other bar the riff drops out and a Compact march shows
  // through, snare in strict time, a cold pad under it. It has decided: the march alone, clean
  // brass and bells over a slow heavy kick. Its last stand: his riff and its march at once.
  boss_ashgrave: {
    bpm: 116, root: 38, scale: SC.phrygian, progA: [0, 0, 1, 0], progB: [5, 6, 1, 0, 5, 6, 1, 1],
    lead: 'saw', leadOct: 24, density: 0.5,
    bass: 'dist', bassStyle: 'grind', pad: 'dark', padOct: 12,
    arp: 'pulse12', arpOct: 24, arpRate: 1, arpAt: 0.55, arpStyle: 'down',
    drums: {
      kick: '0..0..0...0.0...', metal: '..1...1...1..11.', clap: '....1.......1..2', tomLo: '0.....0...0.....',
      hat: '2.2.2.2.2.2.2.2.',
    },
    fill: { metal: '..1.1.1.11111111', tomLo: '0.0.0.0.0.000000' },
    crash: true, kick: [110, 36, 0.42], minI: 0.6, mix: { lead: 0.15, pad: 0.06 },
    parts: [
      {},
      {
        lead: 'saw', pad: 'cold', padOct: 12,
        drums: {
          kick: ['0..0..0...0.0...', '0.......0.......'], metal: ['..1...1...1..11.', '................'],
          clap: ['....1.......1..2', '................'], tomLo: ['0.....0...0.....', '................'],
          snare: ['................', '0...0.0.0...0.0.'], rim: ['................', '..1...1...1...1.'], hat: '2.2.2.2.2.2.2.2.',
        },
        fill: { snare: '0...0.0.0.0.0000' },
      },
      {
        lead: 'brass', leadOct: 24, bass: 'sub', bassStyle: 'march', pad: 'cold', padOct: 24, arp: 'bell', arpOct: 36, arpRate: 2, arpStyle: 'up',
        crash: false, kick: [90, 32, 0.5],
        drums: { kick: '0.......0.......', snare: '0...0.0.0...0.0.', rim: '..1...1...1...1.' },
        fill: { snare: '0...0.0.0.0.0000' },
      },
      {
        lead: 'brass', dbl: true, bass: 'dist', bassStyle: 'grind', pad: 'dark', padOct: 12, arp: 'bell', arpOct: 36, arpRate: 1, arpStyle: 'updown',
        crash: true, kick: [110, 34, 0.45],
        drums: {
          kick: '0..0..0.0.0.0...', snare: '0...0.0.0...0.0.', metal: '..1...1...1..11.', clap: '....1.......1..1',
          tomLo: '0.....0...0.....', hat: '1212121212121212',
        },
        fill: { snare: '0.0.0.0.0.0.0000', metal: '..1.1.1.11111111' },
      },
    ],
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
  // Boarding: a break-in on a clock. C# minor at 146, a rim ticking every eighth like a stopwatch,
  // a pulsing saw bass, a clipped pluck lead; the fight brings up the hats, claps and metal.
  board: {
    bpm: 146, root: 37, scale: SC.aeolian, progA: [0, 0, 5, 6], progB: [3, 4, 0, 5, 3, 6, 4, 4],
    lead: 'pluck', leadOct: 24, density: 0.5, dbl: true,
    bass: 'bsaw', bassStyle: 'pulse8', pad: 'dark', padOct: 12,
    arp: 'pulse12', arpOct: 36, arpRate: 1, arpAt: 0.55, arpStyle: 'broken',
    drums: {
      rim: '0.0.0.0.0.0.0.0.', kick: '0.....0...0...2.', snare: '....1.......1...', clap: '....3.......3..3',
      hat: '.2.2.2.2.2.2.2.2', metal: '..............1.', tomLo: '..........3..3..',
    },
    fill: { snare: '....0...0.0.0000', tomHi: '........2.2.....', tomLo: '............2.2.' },
    crash: true, kick: [150, 44, 0.3], minI: 0.35, mix: { lead: 0.15 },
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
  /** Which of its parts it's playing (a boss theme's phase). */
  part: number;
}
const players: Player[] = [];
let current: Player | null = null;
let wantPart = 0;
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
  return { name, def, song: getSong(name), out, revOut, nodes, ch, step: 0, next: start, stopAt: Infinity, lastLead: 0, part: 0 };
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
  wantPart = 0;
  if (name) {
    current = makePlayer(name, now + fade + 0.05);
    players.push(current);
  }
}

const ARP: Record<TrackDef['arpStyle'], number[]> = { up: [0, 1, 2, 3], down: [3, 2, 1, 0], updown: [0, 1, 2, 3, 2, 1], broken: [0, 2, 1, 3] };

/** A track as it plays in part `n` (its parts up to n laid over it). */
function partOf(name: Track, n: number): TrackDef {
  const base = TRACKS[name];
  let d = base;
  for (const x of base.parts?.slice(0, n + 1) ?? []) d = { ...d, ...x };
  return d;
}

function scheduleStep(p: Player, step: number, t0: number) {
  // a new part comes in on the bar
  if (step % 16 === 0 && p.part !== wantPart && TRACKS[p.name].parts) {
    p.part = wantPart;
    p.def = partOf(p.name, wantPart);
  }
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

  const off = (c: Chan) => !!d.mute?.includes(c);
  // pad: chord held over its run of bars
  if (s === 0 && d.pad && bar.pad > 0 && !off('pad')) {
    const len = bar.pad * 16 * sd;
    for (const k of [0, 2, 4]) playInst(d.pad, t, note(d.root + d.padOct, bar.c + k), len * 0.97, 0.8, p.ch.pad);
  }
  // bass
  for (const e of bar.bass) {
    if (e.s === s && I >= e.lvl && I < e.hi && !off('bass')) playInst(d.bass, t, note(d.root, e.d), e.len * sd, e.v, p.ch.bass);
  }
  // lead (and its octave double at high intensity)
  for (const e of bar.lead) {
    if (e.s !== s || off('lead')) continue;
    const f = note(d.root + d.leadOct, e.d);
    playInst(d.lead, t, f, e.len * sd, e.v, p.ch.lead, p.lastLead);
    p.lastLead = f;
    if (d.dbl && I >= 0.8) playInst('pulse12', t, f * 2, e.len * sd, e.v * 0.3, p.ch.lead);
  }
  // arp: walks the chord tones; comes in a bit earlier in B sections
  if (d.arp && !off('arp') && I >= d.arpAt - (bar.b ? 0.15 : 0) && s % d.arpRate === 0) {
    const pat = ARP[d.arpStyle];
    const idx = pat[Math.floor(step / d.arpRate) % pat.length];
    const deg = bar.c + [0, 2, 4, L][idx];
    playInst(d.arp, t, note(d.root + d.arpOct, deg), d.arpRate * sd * 0.9, s % 4 === 0 ? 0.9 : 0.65, p.ch.arp);
  }
  // drums
  const fill = sec === 7 && I >= 0.5 && d.fill && !off('drum');
  const kick = d.kick ?? [150, 45, 0.32];
  for (const k of Object.keys(d.drums) as DrumVoice[]) {
    if (off('drum') || (fill && d.fill && d.fill[k] !== undefined)) continue;
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
  // the place: its one-shots, how far it steps back for the fight, the old one fading out
  if (amb) {
    for (const [k, at] of amb.next) {
      if (at > now + 0.1) continue;
      ambEvent(amb, k, Math.max(at, now + 0.01));
      amb.next.set(k, now + nextIn(amb.def.events[k] ?? 1));
    }
    const lvl = amb.def.menu ? 1 : 1 - 0.55 * wantI;
    if (Math.abs(lvl - ambI) > 0.02) {
      ambI = lvl;
      ambLevel.gain.setTargetAtTime(lvl, now, 0.8);
      ambWet.gain.setTargetAtTime(lvl, now, 0.8);
    }
  }
  for (let i = ambs.length - 1; i >= 0; i--) {
    const a = ambs[i];
    if (now < a.stopAt) continue;
    for (const s of a.srcs) s.stop();
    for (const n of a.nodes) n.disconnect();
    ambs.splice(i, 1);
  }
  heartbeat(now);
  // disconnect finished sfx chains
  for (let i = trash.length - 1; i >= 0; i--) {
    if (trash[i].at < now) {
      for (const n of trash[i].nodes) n.disconnect();
      trash.splice(i, 1);
    }
  }
}

/** A boss's own theme, if it has one (else the shared one). */
export const bossTrack = (planet: string): Track => (`boss_${planet}` in TRACKS ? (`boss_${planet}` as Track) : 'boss');

// ================================================================================================
// Public API
// ================================================================================================

export const audio = {
  unlock(): void {
    try {
      if (!ready) {
        if (!init()) return;
        if (wantTrack) switchTrack(wantTrack);
        setPlace(wantPlace);
        for (const key of [...loopWant.keys()]) applyLoop(key);
      }
      if (ctx.state !== 'running' && !document.hidden) void ctx.resume().catch(() => undefined);
    } catch {
      /* no audio available */
    }
  },

  /** Where baked voice barks go (voices.ts): the context and the UI bus, with the music ducked under them; null until audio's running. */
  voiceOut(seconds: number): { ctx: AudioContext; bus: AudioNode } | null {
    if (!ready || ctx.state !== 'running') return null;
    duckTo(seconds, 0.45);
    return { ctx, bus: uiBus };
  },

  /** `dist` 0 (right here) .. 1 (far off): duller, quieter, more of the room. */
  play(name: AnySfx, opts?: { pan?: number; pitch?: number; vol?: number; dist?: number }): void {
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

  /** The tune. The menu tunes (title, map, hangar) bring their own place with them. */
  music(track: Track | null): void {
    wantTrack = track;
    if (ready) switchTrack(track);
    if (track && AMB[track]?.menu) audio.ambience(track);
  },

  /** Where we are: a biome's id (or title / map / hangar). Sets its ambience and its reverb; null for silence. */
  ambience(place: string | null): void {
    wantPlace = place && AMB[place] ? place : null;
    if (ready) setPlace(wantPlace);
  },

  /** How close to going down (0 fine .. 1 one hit left): the music closes in, a heartbeat comes up. */
  danger(x: number): void {
    const d = clamp(x, 0, 1);
    if (!ready || Math.abs(d - danger) < 0.02) return;
    if (danger < 0.05 && d >= 0.05) nextBeat = ctx.currentTime;
    danger = d;
    bedLP.frequency.setTargetAtTime(OPEN_HZ * Math.pow(0.075, d), ctx.currentTime, 0.3);
  },

  /** Paused: everything but the menu sinks under water. */
  muffle(on: boolean): void {
    if (!ready || on === muffled) return;
    muffled = on;
    const now = ctx.currentTime;
    worldLP.frequency.cancelScheduledValues(now);
    worldLP.frequency.setTargetAtTime(on ? MUFFLE_HZ : OPEN_HZ, now, 0.08);
    world.gain.setTargetAtTime(on ? 0.55 : 1, now, 0.08);
  },

  intensity(x: number): void {
    wantI = clamp(x, 0, 1);
  },

  /** Which part of its theme a boss fight is in (0 its first phase … 3 its last stand). */
  part(n: number): void {
    wantPart = Math.max(0, Math.round(n));
  },

  duck(seconds: number): void {
    if (ready) duckTo(seconds, 0.35);
  },

  volume(masterVol: number, music: number, sfx: number): void {
    settings.master = clamp(masterVol, 0, 1);
    settings.music = clamp(music, 0, 1);
    settings.sfx = clamp(sfx, 0, 1);
    try {
      localStorage.setItem('rr.volume', JSON.stringify(settings));
    } catch {
      /* storage unavailable */
    }
    applyVolumes();
  },

  /** The volume settings (each 0 … 1), as the pause menu shows them. */
  get volumes(): { master: number; music: number; sfx: number } {
    return { ...settings };
  },

  /** For the audio bench: a tap on the final output, to read levels by. */
  meter(): AnalyserNode | null {
    if (!ready) return null;
    if (!meterNode) {
      meterNode = ctx.createAnalyser();
      meterNode.fftSize = 2048;
      limiter.connect(meterNode);
    }
    return meterNode;
  },

  /** For the audio bench: every place there is. */
  get places(): string[] {
    return Object.keys(AMB);
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
