/**
 * Screenshots of the game in headless Chrome, for looking at changes without a browser window:
 * opens the page, waits, and saves a picture every so often, printing what the console said.
 *
 *   just shot "?planet=orutal&mode=raid&autopilot" --every 4 --count 3 --out /tmp/shots
 *   just shot "" --keys "Enter,Enter"            (presses keys after loading, a second apart)
 *
 * Needs Google Chrome and the dev server running (just serve).
 */

import { spawn } from 'node:child_process';
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
const EVERY = Number(opt('every', '3'));
const COUNT = Number(opt('count', '3'));
const WAIT = Number(opt('wait', '4'));
const OUT = opt('out', join(tmpdir(), 'rustwing-shots'));
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const KEYS = opt('keys', '').split(',').filter(Boolean);
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
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--no-first-run',
  'about:blank',
]);
chrome.stderr.on('data', () => {});

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
await send('Page.navigate', { url: URL_BASE + query });
await sleep(WAIT);
for (const k of KEYS) {
  const code = k.length === 1 ? `Key${k.toUpperCase()}` : k;
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k });
  await sleep(0.08);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k });
  await sleep(1);
}
for (let i = 0; i < COUNT; i++) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `shot-${i}.png`);
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(file);
  if (i < COUNT - 1) await sleep(EVERY);
}
const EVAL = opt('eval', '');
if (EVAL) {
  const r = await send('Runtime.evaluate', { expression: EVAL, returnByValue: true });
  console.log('eval:', JSON.stringify(r?.result?.value ?? r?.result?.description ?? r));
}
const fps = await send('Runtime.evaluate', { expression: 'window.__fps ?? null', returnByValue: true });
if (fps?.result?.value) console.log(`fps ${fps.result.value}`);
ws.close();
chrome.kill();
process.exit(0);
