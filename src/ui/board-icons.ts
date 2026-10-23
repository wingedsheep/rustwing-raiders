/**
 * Boarding's little pictures, so the HUD and the hull scan can say things without sentences: the
 * haul, the clock's hook, the lock, the medals, a ship's state, whose crew it is. Each is a
 * bitmap of letters (a palette key each, '.' clear), drawn a texel a cell at any whole scale.
 */

type Bitmap = readonly string[];

/** The keys: a few inks shared by every picture, and two the caller picks (`a` and `b`). */
const INK: Record<string, string> = {
  k: '#120c18',
  w: '#f4ecd8',
  d: '#5a4a68',
  g: '#ffd04a',
  t: '#5ae0c0',
  c: '#8affe0',
  r: '#ff5a4a',
  n: '#8affb0',
  o: '#ff8a3a',
  v: '#b490d8',
  l: '#b0ff4a',
  s: '#a8a0b8',
  p: '#ff6aa8',
};

export const ICONS = {
  crate: ['.tttttttt.', 'tTTTTTTTTt', 'tTTTTTTTTt', 'tttttttttt', 'tTTTkkTTTt', 'tTTTkkTTTt', 'tTTTTTTTTt', 'tttttttttt'],
  strongbox: ['.gggggggg.', 'gGGGGGGGGg', 'gggggggggg', 'gGGGkkGGGg', 'gGGkGGkGGg', 'gGGGkkGGGg', 'gGGGGGGGGg', 'gggggggggg'],
  core: ['...cccc...', '..cCCCCc..', '.cCwwCCCc.', 'cCwwCCCCCc', 'cCCCCCCCCc', '.cCCCCCCc.', '..cCCCCc..', '...cccc...'],
  tin: ['.gggg.', 'gGGGGg', 'gggggg', 'gGGGGg', '.gggg.'],
  hook: ['...r...', '..rRr..', '...r...', '.rrrrr.', '...r...', 'r..r..r', 'rr.r.rr', '.rrrrr.'],
  lock: ['..nnnn..', '.n....n.', '.n....n.', 'nnnnnnnn', 'nNNkkNNn', 'nNNkkNNn', 'nNNNNNNn', 'nnnnnnnn'],
  spores: ['..l..v..', '.vvv.ll.', 'vVVVv...', 'vVlVv.v.', '.vvv.vVv', '..l...v.', 'v...l...'],
  down: ['rr....rr', '.rr..rr.', '..rrrr..', '...rr...', '..rrrr..', '.rr..rr.', 'rr....rr'],
  skull: ['.wwwww.', 'wwwwwww', 'wkkwkkw', 'wkkwkkw', 'wwwkwww', '.wwwww.', '.w.w.w.'],
  // the medals
  ghost: ['..ssss..', '.ssssss.', 'ssksskss', 'ssssssss', 'ssssssss', 'ssssssss', 'ss.ss.ss', 's..s..s.'],
  clean: ['nnnnnnnn', 'nNNNNNNn', 'nNNNNNkn', 'nNNNNkNn', 'nkNNkNNn', '.nkkNNn.', '..nNNn..', '...nn...'],
  full: ['tttt.ttt', 'tTTt.tTt', 'tttt.ttt', '........', 'tttttttt', 'tTTTTTTt', 'tTTTTTTt', 'tttttttt'],
  quick: ['..wwww..', '.w....w.', 'w...w..w', 'w...w..w', 'w...www.', 'w......w', '.w....w.', '..wwww..'],
  // her state
  dark: ['..dddd..', '.d....d.', 'd.r..r.d', 'd..rr..d', 'd..rr..d', '.dr..rd.', '..dddd..', '..dddd..'],
  cages: ['oooooooo', 'o.o.o.oo', 'o.o.o.oo', 'opo.p.oo', 'o.o.o.oo', 'o.o.o.oo', 'oooooooo'],
  breach: ['o......o', '.o.oo.o.', '..okko..', '.okkkko.', '.okkkko.', '..okko..', '.o.oo.o.', 'o......o'],
  // whose crew
  scrap: ['..rr.rr..', '.rRRRRRr.', 'rRRkkkRRr', 'rRkk.kkRr', '.RRk.kRR.', 'rRkk.kkRr', 'rRRkkkRRr', '.rRRRRRr.', '..rr.rr..'],
  lattice: ['...ccc...', '..cCCCc..', '.cCC.CCc.', 'cCC...CCc', 'cC.....Cc', 'cCC...CCc', '.cCC.CCc.', '..cCCCc..', '...ccc...'],
  bloom: ['..vvvvv..', '.vVlVVlv.', 'vVVVVVVVv', 'vvvvvvvvv', '...www...', '...www...', '...www...', '..wwwww..'],
  // arms off the deck
  arm_nailer: ['...gg.....', '.ooGgGoowg', 'oooggoooo.', 'oo.gg.....', 'o.........'],
  arm_scatter: ['ooodddddd.', 'oOOdkdddddd', 'oo.oo.....', 'o.........'],
  arm_lance: ['wwwwcwcwcwc', 'dwwd.......', 'd..........'],
  arm_stamp: ['....ww.', 'ddddwwc', 'ddcdwwc', 'd...ww.'],
  arm_spore: ['.vv......', 'vVVvvvvvl', 'vlVv.....', '.vv......'],
  arm_hook: ['.......s..', 'ddddddrss.', 'dd.r...s..', 'd.........'],
} satisfies Record<string, Bitmap>;

export type Icon = keyof typeof ICONS;

/** Capital letters are the same ink a shade darker. */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.round(v * 0.6);
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}

/** Draws an icon with its top-left at (x, y). `dim`: drawn in shadow (not yours yet). */
export function icon(ctx: CanvasRenderingContext2D, name: Icon, x: number, y: number, scale = 1, dim = false, flash = false) {
  const bmp = ICONS[name];
  x = Math.round(x);
  y = Math.round(y);
  for (let r = 0; r < bmp.length; r++) {
    const row = bmp[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      const lower = ch.toLowerCase();
      let color = INK[lower] ?? '#ff00ff';
      if (ch !== lower) color = shade(color);
      if (dim) color = lower === 'k' ? '#120c18' : ch !== lower ? '#2a2236' : '#3a3048';
      if (flash) color = '#ffffff';
      ctx.fillStyle = color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  }
}

/** How big an icon is, in texels at a scale. */
export function iconSize(name: Icon, scale = 1) {
  const bmp = ICONS[name];
  return { w: Math.max(...bmp.map((r) => r.length)) * scale, h: bmp.length * scale };
}
