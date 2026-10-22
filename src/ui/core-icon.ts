/**
 * The core on the menus and the HUD: its knots' little pictures (nine texels square), an imprint's
 * seal (a disc in its colour with its maker's initial), and the core itself, a ball of white mould
 * in a dark shell that breathes asleep and burns awake.
 */

import { IMPRINTS, KNACKS, VEIN_COLOR, weightOf, type ImprintId, type KnackId, type Knot, type Vein } from '../game/core';
import type { MindState } from '../sim/mind';
import { drawText } from './font';
import { DARK } from './hud';

// '#' the colour, '+' a highlight
const GLYPH: Record<KnackId | 'room' | 'imprint', string[]> = {
  room: ['#########', '#.......#', '#.......#', '#...+...#', '#..+++..#', '#...+...#', '#.......#', '#.......#', '#########'],
  imprint: ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#.+.#.#', '#.#...#.#', '#..###..#', '.#.....#.', '..#####..'],
  // nerve
  coldblood: ['....#....', '...###...', '..#####..', '..##+##..', '.###+###.', '.##+++##.', '.#######.', '..#####..', '...###...'],
  slipknot: ['..###....', '.#...#...', '.#...#...', '..#.#....', '...#.....', '..#.#....', '.#...#...', '#.....++.', '.......++'],
  stillnerve: ['.........', '..#####..', '.#.....#.', '#..+++..#', '#..+.+..#', '#..+++..#', '.#.....#.', '..#####..', '.........'],
  longsecond: ['#########', '.#.....#.', '..#+++#..', '...#+#...', '....#....', '...#.#...', '..#.+.#..', '.#.+++.#.', '#########'],
  deadeye: ['....#....', '....#....', '..#####..', '.#..+..#.', '###+++###', '.#..+..#.', '..#####..', '....#....', '....#....'],
  // steel
  follow: ['.##..##..', '.##..##..', '.##..##..', '.##..##..', '.##..##..', '.##..##..', '.......+.', '..####++.', '.#####.+.'],
  splinter: ['#...#...#', '.#..#..#.', '..#.#.#..', '...+++...', '####+####', '...+++...', '..#.#.#..', '.#..#..#.', '#...#...#'],
  brace: ['.#######.', '#.......#', '#.##+##.#', '#.#...#.#', '#.#.+.#.#', '#.#...#.#', '#.##+##.#', '#.......#', '.#######.'],
  chain: ['##.......', '#.#......', '.#.#.....', '..#+#....', '...#+#...', '....#+#..', '.....#.#.', '......#.#', '.......##'],
  execution: ['.#######.', '##.....##', '#..+.+..#', '#.......#', '##..#..##', '.##...##.', '..#.#.#..', '..#.#.#..', '...###...'],
  // grease
  scavenger: ['...#.#...', '..#...#..', '.#.+.+.#.', '#.......#', '#..+++..#', '#.......#', '.#.....#.', '..#####..', '.........'],
  hotrivets: ['..#...#..', '.#.#.#.#.', '..#...#..', '.........', '.#######.', '##+###+##', '.#######.', '..#...#..', '..#...#..'],
  thickskin: ['...###...', '..#...#..', '.#.+.+.#.', '#...+...#', '#..+.+..#', '#.......#', '.#.....#.', '..#...#..', '...###...'],
  sparetank: ['.##...##.', '#..#.#..#', '#++#.#++#', '#++#.#++#', '#..#.#..#', '#..#.#..#', '#..#.#..#', '#..#.#..#', '.##...##.'],
  fieldweld: ['....#....', '...#+#...', '..#+++#..', '.#+++++#.', '#########', '...#.#...', '..#...#..', '.#.....#.', '#.......#'],
};

/** A knot's picture: its knack's, or ROOM's, IMPRINT's. */
export function knotIcon(ctx: CanvasRenderingContext2D, k: Knot, x: number, y: number, color: string, hi = '#ffffff', scale = 1) {
  const rows = GLYPH[k.knack ?? (k.kind === 'room' ? 'room' : 'imprint')];
  pixels(ctx, rows, x, y, color, hi, scale);
}

export function knackIcon(ctx: CanvasRenderingContext2D, id: KnackId, x: number, y: number, color: string, hi = '#ffffff', scale = 1) {
  pixels(ctx, GLYPH[id], x, y, color, hi, scale);
}

function pixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, hi: string, scale: number) {
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '+' ? hi : color;
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale);
    }
  });
}

/** A filled disc, texel by texel (so it stays crisp). */
export function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  const ri = Math.round(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(Math.round(cx) - w, Math.round(cy) + dy, w * 2 + 1, 1);
  }
}

/** A ring, texel by texel. */
export function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, from = 0, to = 1) {
  ctx.fillStyle = color;
  const n = Math.max(12, Math.round(r * 7));
  for (let k = 0; k < n * (to - from); k++) {
    const a = -Math.PI / 2 + (from + k / n) * Math.PI * 2;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
  }
}

/** An imprint's seal: a disc in its colour, its maker's initial pressed into it. `r` 5 or more. */
export function seal(ctx: CanvasRenderingContext2D, id: ImprintId, cx: number, cy: number, r = 6, dim = false) {
  const def = IMPRINTS[id];
  disc(ctx, cx, cy + 1, r, DARK);
  disc(ctx, cx, cy, r, dim ? '#4a4058' : def.color);
  if (r >= 5) {
    ring(ctx, cx, cy, r - 1.5, dim ? '#3a3048' : 'rgba(18,12,24,0.35)');
    drawText(ctx, def.name.replace(/^THE /, '')[0], cx + 1, cy - 3, dim ? '#2a2236' : DARK, { align: 'center', shadow: false });
  }
}

/**
 * The core: a dark shell round white mould, `r` across. Asleep it breathes, dim; awake it burns in
 * its temper's colour. `lean`: holding past its room, it hums (shakes); `quiet`: answering the
 * Engine, it's gone cold blue.
 */
export function coreBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, o: { woke?: Vein | null; lean?: boolean; quiet?: boolean; jolt?: number; look?: { x: number; y: number } } = {}) {
  const shake = (o.lean ? Math.sin(t * 60) * 0.8 : 0) + (o.jolt ? Math.sin(t * 90) * o.jolt * 2 : 0);
  const x = Math.round(cx + shake);
  const y = Math.round(cy);
  const breathe = 0.5 + 0.5 * Math.sin(t * (o.woke ? 3 : 1.4));
  const glow = o.quiet ? '#6a9aff' : o.woke ? VEIN_COLOR[o.woke] : '#e8e0d0';
  // the glow round it
  ctx.globalAlpha = (o.woke ? 0.22 : 0.1) + breathe * 0.1;
  disc(ctx, x, y, r * 1.55, glow);
  ctx.globalAlpha = 1;
  disc(ctx, x, y + 1, r + 1, DARK);
  disc(ctx, x, y, r + 1, '#3a2e48');
  disc(ctx, x, y, r, '#211a2c');
  // the mould: a pale heart, brighter as it breathes
  const heart = o.quiet ? '#30486a' : o.woke ? glow : '#8a8090';
  disc(ctx, x, y, r * 0.72, heart);
  ctx.globalAlpha = 0.4 + breathe * 0.5;
  disc(ctx, x, y, r * 0.5, o.quiet ? '#6a9aff' : '#f4ecd8');
  ctx.globalAlpha = 1;
  // threads of mould across it
  ctx.fillStyle = o.quiet ? '#1a2a44' : '#2a2236';
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + 0.4;
    for (let s = 0.25; s < 0.95; s += 0.12) ctx.fillRect(Math.round(x + Math.cos(a + s * 0.8) * r * s), Math.round(y + Math.sin(a + s * 0.8) * r * s), 1, 1);
  }
  // awake: it looks at you (or at what you're looking at)
  if (o.woke && !o.quiet) {
    const lx = o.look ? Math.max(-1, Math.min(1, (o.look.x - x) / 60)) : Math.sin(t * 0.7) * 0.5;
    const ly = o.look ? Math.max(-1, Math.min(1, (o.look.y - y) / 60)) : 0;
    const blink = t % 4.2 < 0.12;
    disc(ctx, x + lx * r * 0.3, y + ly * r * 0.3, Math.max(1.5, r * 0.26), DARK);
    if (!blink) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x + lx * r * 0.3) - 1, Math.round(y + ly * r * 0.3) - 1, 1, 1);
    } else {
      ctx.fillStyle = glow;
      ctx.fillRect(Math.round(x - r * 0.3), y, Math.round(r * 0.6), 1);
    }
  }
  // highlight on the shell
  ctx.fillStyle = 'rgba(255,240,220,0.35)';
  ctx.fillRect(x - Math.round(r * 0.6), y - Math.round(r * 0.75), Math.max(1, Math.round(r * 0.35)), 1);
}

/** What a knack is called, coloured by its vein. */
export const knackColor = (id: KnackId) => VEIN_COLOR[KNACKS[id].vein];

/**
 * The core on the HUD, beside a pilot's plate: it breathes, jolts when you're hit, hums when it's
 * leaning, goes cold blue while it answers the Engine; what it holds hangs under it as beads.
 */
export function coreBadge(ctx: CanvasRenderingContext2D, ch: MindState, cx: number, cy: number, t: number) {
  const jolt = Math.max(0, 1 - ch.jolt * 4);
  coreBall(ctx, cx, cy, 5, t, { woke: ch.woke?.temper, lean: weightOf(ch.held) > ch.room, quiet: ch.quiet > 0, jolt });
  const n = ch.held.length;
  ch.held.forEach((id, k) => {
    ctx.fillStyle = IMPRINTS[id].color;
    ctx.fillRect(Math.round(cx - (n * 3 - 1) / 2 + k * 3), cy + 8, 2, 2);
  });
  if (ch.quiet > 0) drawText(ctx, 'QUIET', cx, cy + 11, Math.floor(t * 3) % 2 ? '#6a9aff' : '#3a5a9a', { align: 'center', shadow: false });
}
