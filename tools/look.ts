/**
 * A still of a biome beside its painting, at a fixed seed and moment, for the readability pushes
 * (docs/readability.md). The autopilot flies the biome in fixed steps up to the moment, then the
 * game holds (?look, see src/look.ts), so the same seed and moment give the same pixels.
 *
 *   just look kessra mesarun              the painting and the game side by side, and the grey frame
 *   just look kessra mesarun --at 20 --seed 3
 *   just look --all                       a contact sheet of every biome that has a painting
 *   just look kessra mesarun --twice      renders it twice and counts the pixels that differ
 *
 * Out in --out (default $TMPDIR/rustwing-look): <planet>-<biome>.png (the still), -side.png (the
 * painting | the game | the grey frame), -grey.png, and look-all.png for --all. The grey frame
 * keeps what must read at full colour (src/view/level-view.ts readers()) and greys the world.
 *
 * Starts its own vite (--url for a server already up). Needs Google Chrome and ImageMagick.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLANETS } from '../src/world/planets';

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name: string) => argv.includes(`--${name}`);
const valued = new Set(['at', 'seed', 'out', 'size', 'url', 'chrome', 'mode']);
const words = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(argv[i - 1].slice(2))));
const AT = Number(opt('at', '15'));
const SEED = Number(opt('seed', '1'));
const MODE = opt('mode', 'raid');
const OUT = opt('out', join(tmpdir(), 'rustwing-look'));
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PAINTINGS = 'docs/art-direction/planets';
mkdirSync(OUT, { recursive: true });

/** A biome's painting: <planet>-<its name, slugged, without "the">.png. */
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const painting = (planet: string, name: string) => {
  const f = join(PAINTINGS, `${planet}-${slug(name)}.png`);
  return existsSync(f) ? f : null;
};

type Shot = { planet: string; biome: string; name: string; painting: string | null };
const all: Shot[] = PLANETS.flatMap((p) => p.biomes.map((b) => ({ planet: p.id, biome: b.id, name: b.name, painting: painting(p.id, b.name) })));
let shots: Shot[];
if (flag('all')) {
  shots = all.filter((s) => s.painting);
  const named = new Set(shots.map((s) => s.painting));
  for (const f of readdirSync(PAINTINGS).filter((f) => f.endsWith('.png') && !f.endsWith('-game.png')))
    if (!named.has(join(PAINTINGS, f))) console.log(`(no biome for ${f})`);
} else {
  const [planet, biome] = words;
  const s = all.find((s) => s.planet === planet && s.biome === biome);
  if (!s) {
    console.error(`just look <planet> <biome>, or --all. The biomes:\n${PLANETS.map((p) => `  ${p.id}: ${p.biomes.map((b) => b.id).join(' ')}`).join('\n')}`);
    process.exit(1);
  }
  shots = [s];
}

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));
const magick = (...args: string[]) => {
  const r = spawnSync('magick', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`magick ${args.join(' ')}\n${r.stderr}`);
  return r.stdout + r.stderr;
};

const kids: ReturnType<typeof spawn>[] = [];
// never leave a headless Chrome or a vite behind, however the script ends
process.on('exit', () => kids.forEach((k) => k.kill()));
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(sig, () => process.exit(1));
process.on('uncaughtException', (e) => {
  console.error(e);
  process.exit(1);
});

let URL_BASE = opt('url', '');
if (!URL_BASE) {
  const port = 5600 + Math.floor(Math.random() * 300);
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  kids.push(vite);
  URL_BASE = `http://localhost:${port}/`;
  for (let i = 0; ; i++) {
    if (await fetch(URL_BASE).then(() => true, () => false)) break;
    if (i > 100) throw new Error('vite did not start');
    await sleep(0.2);
  }
}

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'rustwing-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  '--mute-audio',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--no-first-run',
  'about:blank',
]);
chrome.stderr.on('data', () => {});
kids.push(chrome);

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
const waiting = new Map<number, (v: any) => void>();
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
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    console.log(`[exception] ${d.exception?.description ?? d.text}`);
  }
});
const evaluate = async (expression: string) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/** Flies to the moment and saves the still, and the two frames the grey one's mask comes from. */
async function capture(s: Shot, file: string) {
  await send('Page.navigate', { url: `${URL_BASE}?planet=${s.planet}&biomes=${s.biome}&mode=${MODE}&seed=${SEED}&look=${AT}` });
  for (let i = 0; !(await evaluate('window.__look?.ready === true')); i++) {
    if (i > 600) throw new Error(`${s.planet} ${s.biome}: the look never got ready`);
    await sleep(0.1);
  }
  const grab = async (mode: string, to: string) => {
    // two frames in the mode, so the canvas holds it
    await evaluate(`(window.__look.mode = '${mode}', new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`);
    writeFileSync(to, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  };
  await grab('still', file);
  await grab('keep', join(scratch, 'keep.png'));
  await grab('bare', join(scratch, 'bare.png'));
}

const scratch = mkdtempSync(join(tmpdir(), 'rustwing-look-'));
const rows: string[] = [];
for (const s of shots) {
  const base = join(OUT, `${s.planet}-${s.biome}`);
  const still = `${base}.png`;
  await capture(s, still);
  if (flag('twice')) {
    const again = join(scratch, 'again.png');
    await capture(s, again);
    const diff = magick('compare', '-metric', 'AE', still, again, 'null:').trim();
    console.log(`${s.planet} ${s.biome}: ${diff} pixels differ between two runs`);
  }
  // the mask: wherever hiding what must read changes the picture (its outline grown a pixel)
  const mask = join(scratch, 'mask.png');
  magick(join(scratch, 'keep.png'), join(scratch, 'bare.png'), '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', '4%', '-morphology', 'Dilate', 'Disk:1', mask);
  // the world flat grey and pale, what must read as it was
  const flat = join(scratch, 'flat.png');
  magick(still, '-colorspace', 'gray', '-fill', 'gray55', '-colorize', '55%', '-colorspace', 'sRGB', flat);
  // (laid over the still, so the result stays in colour)
  magick(still, flat, '(', mask, '-negate', ')', '-composite', `${base}-grey.png`);
  // the painting, the game, the grey frame, each at the game's size, labelled
  const tile = (f: string | null, label: string, to: string) => {
    const src = f ? [f, '-resize', `${W}x${H}^`, '-gravity', 'center', '-extent', `${W}x${H}`] : ['-size', `${W}x${H}`, 'xc:#1a1622'];
    magick(...src, '-gravity', 'northwest', '-fill', '#0008', '-draw', `rectangle 0,0 ${W},40`, '-fill', 'white', '-pointsize', '24', '-annotate', '+12+8', label, to);
    return to;
  };
  const tiles = [
    tile(s.painting, s.painting ? `${s.name}, painted` : `${s.name}: no painting yet`, join(scratch, 'a.png')),
    tile(still, `the game (seed ${SEED}, ${AT} s)`, join(scratch, 'b.png')),
    tile(`${base}-grey.png`, 'grey: what must read', join(scratch, 'c.png')),
  ];
  magick(...tiles, '-background', '#0b0912', '-splice', '8x0', '+append', '-chop', '8x0', `${base}-side.png`);
  rows.push(`${base}-side.png`);
  console.log(`${base}-side.png`);
}
if (flag('all')) {
  const sheet = join(OUT, 'look-all.png');
  // at half size, ten rows of three stay one readable sheet
  magick(...rows, '-background', '#0b0912', '-splice', '0x8', '-append', '-chop', '0x8', '-resize', '50%', sheet);
  console.log(sheet);
}
ws.close();
process.exit(0);
