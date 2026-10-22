/**
 * The cast's barks: short clips in each character's own voice (an alien's own tongue, a droid's
 * English), baked offline with ElevenLabs (tools/voices/, docs/alien-voices.md) and played under the
 * subtitled text when an event opens and when its outcome lands. Everything else in the game's
 * sound is synthesized; these are files, fetched the first time a character speaks.
 *
 * A character's `fx` is applied here, live, so one clean recording serves: a droid's ring
 * modulation, a crackling intercom, a radio's narrow band, the Choir's three detuned selves.
 */

import { audio } from './audio';

export type Bark = 'hello' | 'pleased' | 'annoyed';
type Fx = 'none' | 'droid' | 'intercom' | 'choir' | 'radio';

interface Voice {
  fx: Fx;
  barks: Partial<Record<Bark, string[]>>;
}

const BASE = `${import.meta.env.BASE_URL}audio/voices/`;
let manifest: Promise<Record<string, Voice>> | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
/** The last take played per character and bark, so a repeat picks the other. */
const lastTake = new Map<string, number>();
let playing: AudioBufferSourceNode[] = [];

function index(): Promise<Record<string, Voice>> {
  return (manifest ??= fetch(`${BASE}index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, Voice>>) : {}))
    .catch(() => ({})));
}

function load(ctx: AudioContext, file: string) {
  let b = buffers.get(file);
  if (!b) {
    b = fetch(BASE + file)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
    buffers.set(file, b);
  }
  return b;
}

/** A curve that rounds off peaks a little, like a cheap speaker. */
function grit(ctx: AudioContext, k: number) {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  ws.curve = c;
  return ws;
}

function band(ctx: AudioContext, lo: number, hi: number) {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = lo;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = hi;
  hp.connect(lp);
  return { input: hp, output: lp };
}

/** Plays one buffer through the character's treatment into `out`. */
function voice(ctx: AudioContext, buf: AudioBuffer, fx: Fx, out: AudioNode, t: number) {
  const sources: AudioBufferSourceNode[] = [];
  const src = (rate = 1, delay = 0, gain = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    s.connect(g);
    s.start(t + delay);
    sources.push(s);
    return g;
  };
  const level = ctx.createGain();
  level.gain.value = 0.9;
  level.connect(out);
  switch (fx) {
    case 'droid': {
      // ring modulation, half wet, through a narrow speaker
      const dry = src();
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const osc = ctx.createOscillator();
      osc.frequency.value = 74;
      const depth = ctx.createGain();
      depth.gain.value = 0.55;
      osc.connect(depth).connect(ring.gain);
      osc.start(t);
      osc.stop(t + buf.duration + 0.2);
      const b = band(ctx, 260, 4200);
      dry.connect(b.input);
      dry.connect(ring);
      ring.connect(b.input);
      b.output.connect(level);
      break;
    }
    case 'intercom':
    case 'radio': {
      const b = band(ctx, fx === 'radio' ? 380 : 300, fx === 'radio' ? 3000 : 3600);
      const d = grit(ctx, fx === 'radio' ? 3 : 2);
      src().connect(d).connect(b.input);
      b.output.connect(level);
      level.gain.value = 1.15;
      // a squelch of static either side
      const n = ctx.createBufferSource();
      const len = Math.floor(ctx.sampleRate * 0.07);
      const nb = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = nb.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.25;
      n.buffer = nb;
      const nb2 = band(ctx, 900, 5000);
      n.connect(nb2.input);
      nb2.output.connect(level);
      n.start(t);
      break;
    }
    case 'choir': {
      // one voice saying "we": three of it, a few cents apart, a breath apart
      const b = band(ctx, 220, 5200);
      for (const [rate, delay, gain] of [
        [1, 0, 0.7],
        [0.985, 0.018, 0.5],
        [1.017, 0.031, 0.45],
      ] as const)
        src(rate, delay, gain).connect(b.input);
      const d = grit(ctx, 1.6);
      b.output.connect(d).connect(level);
      break;
    }
    default:
      src().connect(level);
  }
  return sources;
}

/** Fetches a character's barks ahead of time (call when an event opens). */
export function preloadVoice(who: string) {
  const out = audio.voiceOut(0);
  void index().then((m) => {
    const v = m[who];
    if (!v || !out) return;
    for (const files of Object.values(v.barks)) for (const f of files ?? []) void load(out.ctx, `${who}/${f}`);
  });
}

/** Says a bark in `who`'s voice (cutting off whatever was being said). Silent if there's none. */
export async function bark(who: string, kind: Bark) {
  const m = await index();
  const v = m[who];
  const takes = v?.barks[kind] ?? (kind !== 'hello' ? v?.barks.hello : undefined);
  if (!v || !takes?.length) return;
  const key = `${who}:${kind}`;
  const k = takes.length > 1 ? ((lastTake.get(key) ?? -1) + 1 + Math.floor(Math.random() * (takes.length - 1))) % takes.length : 0;
  lastTake.set(key, k);
  const probe = audio.voiceOut(0);
  if (!probe) return;
  const asked = probe.ctx.currentTime;
  const buf = await load(probe.ctx, `${who}/${takes[k]}`);
  // too late to be a reply to anything: stay quiet
  if (!buf || probe.ctx.currentTime - asked > 1.2) return;
  const out = audio.voiceOut(buf.duration + 0.1);
  if (!out) return;
  hush();
  playing = voice(out.ctx, buf, v.fx, out.bus, out.ctx.currentTime + 0.02);
}

/** Stops whatever's being said. */
export function hush() {
  for (const s of playing) {
    try {
      s.stop();
    } catch {
      // already done
    }
  }
  playing = [];
}
