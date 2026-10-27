/**
 * A still of a biome beside its painting, at a fixed seed and moment, for the readability pushes
 * (docs/readability.md). The autopilot flies the biome in fixed steps up to the moment, then the
 * game holds (?look, see src/look.ts), so the same seed and moment give the same pixels.
 *
 *   just look kessra mesarun              the painting and the game side by side, and the grey frame
 *   just look kessra mesarun --at 20 --seed 3
 *   just look --all                       a contact sheet of every biome that has a painting
 *   just look kessra mesarun --twice      renders it twice and counts the pixels that differ
 *   just look --all --stats               the numbers, the painting's beside the game's, with a pass or fail
 *   just look kessra mesarun --seeds      twelve seeds on one sheet
 *   just look kessra mesarun --query k=v  more of the game's URL query, for a look behind a switch
 *
 * Out in --out (default $TMPDIR/rustwing-look): <planet>-<biome>.png (the still), -side.png (the
 * painting | the game | the grey frame), -grey.png, and look-all.png for --all. The grey frame
 * keeps what must read at full colour (src/view/level-view.ts readers()) and greys the world.
 * --stats adds -found.png (each bullet's box and its gap to the ground, each look-alike), -value.png (grey, deuteranopia, protanopia), -squint.png (the painting's and the
 * game's at 160×90, blurred), -strip.png (the whole level from above, from the sim) and
 * stats.md; with --all, look-squint.png and look-strips.png too. The measures: tools/look-stats.ts.
 *
 * Starts its own vite (--url for a server already up). Needs Google Chrome and ImageMagick.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PLANETS } from '../src/world/planets';
import * as stat from './look-stats';

const argv = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name: string) => argv.includes(`--${name}`);
const valued = new Set(['at', 'seed', 'out', 'size', 'url', 'chrome', 'mode', 'query']);
const words = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && valued.has(argv[i - 1].slice(2))));
// (--stats looks a little later: by 20 s every biome's foes are firing)
const AT = Number(opt('at', flag('stats') ? '20' : '15'));
const SEED = Number(opt('seed', '1'));
const MODE = opt('mode', 'raid');
const OUT = opt('out', join(tmpdir(), 'rustwing-look'));
const [W, H] = opt('size', '1280x720').split('x').map(Number);
const CHROME = opt('chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const PAINTINGS = 'docs/art-direction/planets';
const STATS = flag('stats');
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
/** The lines --stats passes or fails on: rough, from one run of the paintings and today's game (docs/readability.md). */
const PASS = {
  /** Detail ratio: the outer thirds at least this much busier than the lane. */
  detail: 1.0,
  /** The worst bullet's gap to its ground (OKLab distance; the painting's tenth percentile, as some of what's found there isn't fire). */
  fire: 0.2,
  /** The median bullet's colour (OKLab chroma). */
  chroma: 0.15,
  lookalikes: 5,
  /** Clark–Evans, at most. */
  clumping: 0.7,
  /** The narrowest way through, in ship widths. */
  lane: 3,
  /** A screen's most colliders and landmarks (scenery is counted, not capped: how it looks decides). */
  colliders: 8,
  landmarks: 1,
};
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

// a run killed outright (no exit handler) leaves its Chrome and vite behind, orphaned: clear those first
for (const line of spawnSync('ps', ['-Ao', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout.split('\n')) {
  const [, pid, ppid, cmd] = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/) ?? [];
  if (ppid === '1' && (/--user-data-dir=\S*rustwing-chrome-/.test(cmd) || /vite\.js --port 5[6-8]\d\d --strictPort$/.test(cmd))) process.kill(Number(pid));
}

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
  // (node itself, not npx: one process, so killing it kills the server)
  const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
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

/**
 * Flies to the moment and saves the still, and the two frames the grey one's mask comes from (and
 * for --stats, the one without enemy fire). Gives the ambient count then.
 */
async function capture(s: Shot, file: string, seed = SEED, only = false): Promise<{ ambient: number; clouds: number }> {
  await send('Page.navigate', { url: `${URL_BASE}?planet=${s.planet}&biomes=${s.biome}&mode=${MODE}&seed=${seed}&look=${AT}${opt('query', '') && `&${opt('query', '')}`}` });
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
  if (!only) {
    await grab('keep', join(scratch, 'keep.png'));
    await grab('bare', join(scratch, 'bare.png'));
    if (STATS) await grab('nofire', join(scratch, 'nofire.png'));
  }
  return await evaluate('window.__look.air');
}

const scratch = mkdtempSync(join(tmpdir(), 'rustwing-look-'));
const rows: string[] = [];
const table: string[][] = [];
const squints: string[] = [];
const strips: string[] = [];
for (const s of shots) {
  const base = join(OUT, `${s.planet}-${s.biome}`);
  const still = `${base}.png`;
  const air = await capture(s, still);
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
  if (STATS) measure(s, base, still, air);
  if (flag('seeds')) {
    // twelve seeds, four across, at a quarter size
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const each: string[] = [];
    for (const seed of seeds) {
      const f = join(scratch, `seed-${seed}.png`);
      await capture(s, f, seed, true);
      magick(f, '-resize', '25%', '-gravity', 'northwest', '-fill', 'white', '-pointsize', '14', '-annotate', '+6+4', `seed ${seed}`, f);
      each.push(f);
    }
    const lines = [0, 4, 8].map((k, i) => {
      const f = join(scratch, `seeds-${i}.png`);
      magick(...each.slice(k, k + 4), '-background', '#0b0912', '-splice', '4x0', '+append', '-chop', '4x0', f);
      return f;
    });
    magick(...lines, '-background', '#0b0912', '-splice', '0x4', '-append', '-chop', '0x4', `${base}-seeds.png`);
    console.log(`${base}-seeds.png`);
  }
}
if (STATS) {
  const head = ['', 'detail', 'bullets', 'ΔE worst', 'ΔE median', 'fire C', 'world C99', 'look-alikes', 'clumping', 'lane', 'most on a screen', 'ambient'];
  const md = [
    `seed ${SEED}, ${AT} s into a ${MODE}. Pass at: detail ≥ ${PASS.detail}, ΔE worst ≥ ${PASS.fire} (a painting's: its tenth percentile), fire C ≥ ${PASS.chroma}, look-alikes ≤ ${PASS.lookalikes}, clumping ≤ ${PASS.clumping}, lane ≥ ${PASS.lane} ship widths (${stat.SHIP_W.toFixed(1)}), at most ${PASS.colliders} colliders / ${PASS.landmarks} landmark a screen (scenery counted, not capped). ✗ fails.`,
    '',
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...table.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
  writeFileSync(join(OUT, 'stats.md'), md + '\n');
  console.log(`\n${md}\n\n${join(OUT, 'stats.md')}`);
  if (flag('all')) {
    magick(...squints, '-background', '#0b0912', '-splice', '0x4', '-append', '-chop', '0x4', join(OUT, 'look-squint.png'));
    magick(...strips, '-background', '#0b0912', '-splice', '6x0', '+append', '-chop', '6x0', join(OUT, 'look-strips.png'));
    console.log(join(OUT, 'look-squint.png'));
    console.log(join(OUT, 'look-strips.png'));
  }
}
if (flag('all')) {
  const sheet = join(OUT, 'look-all.png');
  // at half size, ten rows of three stay one readable sheet
  magick(...rows, '-background', '#0b0912', '-splice', '0x8', '-append', '-chop', '0x8', '-resize', '50%', sheet);
  console.log(sheet);
}
ws.close();
process.exit(0);

/** --stats for one biome: its row of the table (and the painting's), and its sheets. */
function measure(s: Shot, base: string, still: string, air: { ambient: number; clouds: number }) {
  const mark = (v: number, ok: boolean, digits = 2) => (Number.isNaN(v) ? '–' : `${v.toFixed(digits)}${ok ? '' : ' ✗'}`);
  const img = stat.load(still, W, H);
  const bare = stat.load(join(scratch, 'bare.png'), W, H);
  const fire = stat.fire(img, stat.load(join(scratch, 'nofire.png'), W, H));
  const world = stat.topChroma(bare);
  const found = stat.lookalikes(bare);
  const alikes = found.length;
  // what was measured, on the still: each bullet and its gap (yellow), each look-alike (cyan)
  stat.boxes(still, W, H, [...fire.each.map((e) => ({ box: e.box, label: e.gap.toFixed(2), colour: 'yellow' })), ...found.map((b) => ({ box: b.box }))], `${base}-found.png`);
  const lv = stat.level(PLANETS.find((p) => p.id === s.planet)!, s.biome, MODE, SEED);
  const lane = Math.min(...stat.lanes(lv).map((l) => l.open)) / stat.SHIP_W;
  const screens = stat.budget(lv);
  const most = (k: 'scenery' | 'colliders' | 'landmarks') => Math.max(...screens.map((x) => x[k]));
  const over = screens.filter((x) => x.colliders > PASS.colliders || x.landmarks > PASS.landmarks).length;
  const clump = stat.clumping(lv);
  const detail = stat.detail(stat.oklab(img).L, W, H);
  const busy = `${most('scenery')} / ${most('colliders')} / ${most('landmarks')}${over ? ` ✗ (${over} of ${screens.length})` : ''}`;
  if (s.painting) {
    // a painting has its fire painted in: what the look-alike finder finds is its bullets (and a
    // few things that could be taken for them), measured as the game's are
    const p = stat.load(s.painting, W, H);
    const pd = stat.detail(stat.oklab(p).L, W, H);
    const shots = stat.lookalikes(p);
    const gaps = shots.map((b) => b.gap).sort((a, b) => a - b);
    // (the tenth percentile, not the worst: a few of the finds aren't shots)
    const pw = gaps[Math.floor(gaps.length * 0.1)] ?? NaN;
    const pc = shots.map((b) => b.chroma).sort((a, b) => a - b)[Math.floor(shots.length / 2)] ?? NaN;
    const pworld = stat.topChroma(p, shots);
    stat.boxes(s.painting, W, H, shots.map((b) => ({ box: b.box, label: b.gap.toFixed(2), colour: 'yellow' })), `${base}-painted-found.png`);
    table.push([`${s.name}, painted`, mark(pd, pd >= PASS.detail), `${shots.length}`, mark(pw, pw >= PASS.fire), mark(gaps[Math.floor(gaps.length / 2)] ?? NaN, true), mark(pc, pc >= PASS.chroma, 3), mark(pworld, true, 3), '', '', '', '', '']);
  }
  table.push([
    `${s.name}, game`,
    mark(detail, detail >= PASS.detail),
    String(fire.n),
    mark(fire.worst, fire.worst >= PASS.fire),
    mark(fire.each.map((e) => e.gap).sort((a, b) => a - b)[Math.floor(fire.n / 2)] ?? NaN, true),
    mark(fire.chroma, fire.chroma >= PASS.chroma, 3),
    mark(world, true, 3),
    `${alikes}${alikes > PASS.lookalikes ? ' ✗' : ''}`,
    mark(clump, clump <= PASS.clumping),
    mark(lane, lane >= PASS.lane, 1),
    busy,
    `${air.ambient} (+${air.clouds} clouds)`,
  ]);
  // value: the still, its lightness, deuteranopia, protanopia (2 × 2, half size)
  const v = stat.value(img);
  const parts = [still, ...(['grey', 'deutan', 'protan'] as const).map((k) => {
    const f = join(scratch, `value-${k}.png`);
    stat.save(v[k], f);
    return f;
  })];
  const half = parts.map((f, i) => {
    const o = join(scratch, `value-${i}.png`);
    magick(f, '-resize', '50%', '-gravity', 'northwest', '-fill', '#0008', '-draw', `rectangle 0,0 ${W / 2},28`, '-fill', 'white', '-pointsize', '18', '-annotate', '+8+4', ['the game', 'lightness', 'deuteranopia', 'protanopia'][i], o);
    return o;
  });
  const top = join(scratch, 'value-top.png');
  const bottom = join(scratch, 'value-bottom.png');
  magick(half[0], half[1], '+append', top);
  magick(half[2], half[3], '+append', bottom);
  magick(top, bottom, '-append', `${base}-value.png`);
  // squint: 160 × 90 and blurred, shown four times over, the painting's beside the game's
  const squint = (f: string, to: string) => (magick(f, '-resize', '160x90^', '-gravity', 'center', '-extent', '160x90', '-blur', '0x1.5', '-scale', '400%', to), to);
  const sq = [s.painting ? squint(s.painting, join(scratch, 'sq-a.png')) : null, squint(still, join(scratch, 'sq-b.png'))].filter((f): f is string => !!f);
  magick(...sq, '-background', '#0b0912', '-splice', '4x0', '+append', '-chop', '4x0', '-gravity', 'northwest', '-fill', 'white', '-pointsize', '18', '-annotate', '+8+4', s.name, `${base}-squint.png`);
  squints.push(`${base}-squint.png`);
  // strip: the level from above, from the sim, labelled
  stat.strip(lv, `${base}-strip.png`);
  magick(`${base}-strip.png`, '-gravity', 'north', '-background', '#0b0912', '-fill', 'white', '-pointsize', '16', '-splice', '0x24', '-annotate', '+0+4', s.name, `${base}-strip.png`);
  strips.push(`${base}-strip.png`);
}
