/**
 * A video of the game with its sound, from headless Chrome: frames from the screencast, and the
 * sound tapped off the page's Web Audio (everything bound for the speakers also goes to a
 * MediaRecorder), muxed with ffmpeg into <out>/recording.mp4.
 *
 *   npx esbuild tools/record.ts --bundle --platform=node --format=esm --outfile=/tmp/rec.mjs
 *   node /tmp/rec.mjs "?planet=orutal&mode=boss&autopilot&length=30&seed=2" --secs 100 --out /tmp/vask
 *
 * --size 800x450 keeps up on a laptop: much bigger and the headless audio falls behind (gaps).
 * Needs Google Chrome, ffmpeg and a dev server (just serve; --url for another port).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const query = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const URL_BASE = opt('url', 'http://localhost:5190/');
const WAIT = Number(opt('wait', '4'));
const OUT = opt('out', join(tmpdir(), 'rustwing-rec'));
const SECS = Number(opt('secs', '90'));
/** How far the tapped sound trails the frames (measured: a flash and a beep, together). */
const LAG = 0.1;
const [W, H] = opt('size', '800x450').split('x').map(Number);
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
mkdirSync(OUT, { recursive: true });

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'rustwing-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  '--autoplay-policy=no-user-gesture-required',
  '--mute-audio',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--no-first-run',
  'about:blank',
]);
chrome.stderr.on('data', () => {});
// never leave a headless Chrome behind, however the script ends
process.on('exit', () => chrome.kill());
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(1));
process.on('uncaughtException', (e) => {
  console.error(e);
  process.exit(1);
});

const frames: number[] = [];
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(0.2);
  }
  throw new Error('chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map<number, (v: unknown) => void>();
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(String(ev.data));
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)!(msg.result);
    waiting.delete(msg.id);
  } else if (msg.method === 'Page.screencastFrame') {
    const p = msg.params;
    frames.push(p.metadata.timestamp);
    writeFileSync(join(OUT, `f${String(frames.length).padStart(5, '0')}.jpg`), Buffer.from(p.data, 'base64'));
    ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: p.sessionId } }));
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ');
    console.log(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log(`[exception] ${d.exception?.description ?? d.text}`);
  }
});
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

// the sound: everything the page sends to its speakers also goes to a recorder
const TAP = `(() => {
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...rest) {
    if (dst instanceof AudioDestinationNode) {
      const ctx = this.context;
      if (!ctx.__tap) {
        ctx.__tap = ctx.createMediaStreamDestination();
        window.__chunks = [];
        window.__mr = new MediaRecorder(ctx.__tap.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000 });
        window.__mr.ondataavailable = (e) => window.__chunks.push(e.data);
        window.__ctx = ctx;
      }
      connect.call(this, ctx.__tap);
    }
    return connect.call(this, dst, ...rest);
  };
})();`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: TAP });
await send('Page.navigate', { url: URL_BASE + query });
await sleep(WAIT);
// a key unlocks the game's sound (any key; the autopilot flies)
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'F13', key: 'F13' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'F13', key: 'F13' });
await sleep(0.5);
const st = await send('Runtime.evaluate', { expression: 'window.__ctx ? (window.__mr.start(500), [window.__ctx.state, Date.now() / 1000]) : null', returnByValue: true });
console.log('audio', JSON.stringify(st?.result?.value));
await send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: Number(opt('nth', '1')), maxWidth: W, maxHeight: H });
await sleep(SECS);
await send('Page.stopScreencast');
const au = await send('Runtime.evaluate', {
  expression: `new Promise((res) => { if (!window.__mr) return res(null); window.__mr.onstop = async () => { const b = new Blob(window.__chunks, { type: 'audio/webm' }); const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); res(btoa(s)); }; window.__mr.stop(); })`,
  awaitPromise: true,
  returnByValue: true,
});
if (au?.result?.value) {
  writeFileSync(join(OUT, 'audio.webm'), Buffer.from(au.result.value, 'base64'));
  // where the sound starts against the first frame (seconds)
  writeFileSync(join(OUT, 'audio-offset.txt'), String((st.result.value[1] - frames[0]).toFixed(3)));
}
// ffmpeg concat list: each frame held until the next
let list = '';
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1] - frames[i] : 0.05;
  list += `file 'f${String(i + 1).padStart(5, '0')}.jpg'
duration ${d.toFixed(4)}
`;
}
writeFileSync(join(OUT, 'list.txt'), list);
console.log(`frames ${frames.length} in ${SECS}s`);
ws.close();
chrome.kill();
// the frames, each held till the next, and the sound where it began
const sound = au?.result?.value ? ['-itsoffset', String(st.result.value[1] - frames[0] - LAG), '-i', 'audio.webm', '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '128k'] : [];
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', ...sound, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', 'recording.mp4'], { cwd: OUT, stdio: 'inherit' });
console.log(ff.status === 0 ? join(OUT, 'recording.mp4') : 'ffmpeg failed: the frames and audio.webm are in ' + OUT);
process.exit(0);
