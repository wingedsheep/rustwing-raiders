import type { Read } from '../sim/boss';

/**
 * The HUD's marks where words used to be: the chain as a row of pips, the glint on whatever's
 * open to a blow (the same one the field shows on it), and the eye a boss opens when it's read
 * how you fly, with a picture of what it saw. All drawn in whole pixels, as the font is.
 */

/** A four-point glint, turning between its long and its diagonal arms: something is open. */
export function glint(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, color: string) {
  x = Math.round(x);
  y = Math.round(y);
  const beat = 0.6 + 0.4 * Math.abs(Math.sin(t * 7));
  const l = Math.max(1, Math.round(r * beat));
  const d = Math.max(1, Math.round(l * 0.45));
  ctx.fillStyle = color;
  ctx.fillRect(x - l, y, l * 2 + 1, 1);
  ctx.fillRect(x, y - l, 1, l * 2 + 1);
  ctx.fillStyle = '#ffffff';
  for (let k = 1; k <= d; k++) {
    ctx.fillRect(x - k, y - k, 1, 1);
    ctx.fillRect(x + k, y - k, 1, 1);
    ctx.fillRect(x - k, y + k, 1, 1);
    ctx.fillRect(x + k, y + k, 1, 1);
  }
  ctx.fillRect(x - 1, y - 1, 3, 3);
}

/**
 * A bar broken open: what's left of it in shards with gaps knocked out, blinking, and a glint
 * in the middle of it (a boss's poise when it staggers, an elite's armour when it comes off).
 */
export function brokenBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, color: string) {
  const on = Math.floor(t * 8) % 2 === 0;
  const seed = Math.floor(x * 7 + w);
  for (let sx = 0, k = 0; sx < w; k++) {
    // shards of uneven width, each knocked a pixel up or down
    const sw = 3 + ((seed + k * 37) % 7);
    const dy = (k * 5 + seed) % 3 === 0 ? -1 : (k * 3) % 4 === 0 ? 1 : 0;
    ctx.fillStyle = on ? color : '#ffffff';
    ctx.fillRect(x + sx, y + dy, Math.min(sw, w - sx), h);
    sx += sw + 2;
  }
  glint(ctx, x + w / 2, y + h / 2, 5, t, color);
}

/** The chain of kills: a pip a kill, ten a row; each ten fills over the last in a hotter colour. */
export class ChainPips {
  private was = 0;
  /** Seconds since the last pip came on. */
  private got = 9;
  /** A chain that broke: its pips falling away. */
  private falling: { x: number; y: number; vx: number; vy: number; t: number; color: string }[] = [];

  draw(ctx: CanvasRenderingContext2D, combo: number, cx: number, y: number, dt: number) {
    const TIERS = ['#5ae0f0', '#ffd04a', '#ff8a4a', '#ffffff'];
    const n = 10;
    const pw = 4;
    const gap = 2;
    const width = n * (pw + gap) - gap;
    const x0 = Math.round(cx - width / 2);
    if (combo > this.was) this.got = 0;
    else this.got += dt;
    if (combo < this.was && this.was >= 3) {
      // broken: what it had lit drops off the bar
      const tier = Math.min(TIERS.length - 1, Math.floor((this.was - 1) / n));
      const lit = this.was - Math.floor((this.was - 1) / n) * n;
      for (let i = 0; i < (tier > 0 ? n : lit); i++)
        this.falling.push({ x: x0 + i * (pw + gap), y, vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, t: 0, color: TIERS[tier] });
    }
    this.was = combo;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vy += 220 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.t > 0.6) {
        this.falling.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - f.t / 0.6;
      ctx.fillStyle = f.color;
      ctx.fillRect(Math.round(f.x), Math.round(f.y), 3, 3);
    }
    ctx.globalAlpha = 1;
    if (combo <= 1) return;
    const tier = Math.floor((combo - 1) / n);
    const lit = combo - tier * n;
    const col = TIERS[Math.min(TIERS.length - 1, tier)];
    const under = tier > 0 ? TIERS[Math.min(TIERS.length - 1, tier - 1)] : '#2a2236';
    // (a long chain shivers on its newest pip)
    const shake = this.got < 0.1 ? Math.round(Math.sin(this.got * 90)) : 0;
    ctx.fillStyle = 'rgba(14,10,22,0.6)';
    ctx.fillRect(x0 - 2, y - 2, width + 4, pw + 4);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (pw + gap);
      const on = i < lit;
      const fresh = on && i === lit - 1 && this.got < 0.12;
      ctx.fillStyle = fresh ? '#ffffff' : on ? col : under;
      const g = fresh ? 1 : 0;
      ctx.fillRect(x - g + (fresh ? shake : 0), y - g, pw + g * 2, pw + g * 2);
    }
    // the tens already filled, as notches under the row
    for (let k = 0; k < Math.min(tier, 8); k++) {
      ctx.fillStyle = TIERS[Math.min(TIERS.length - 1, k)];
      ctx.fillRect(Math.round(cx - (Math.min(tier, 8) * 4 - 2) / 2) + k * 4, y + pw + 2, 2, 1);
    }
  }
}

/**
 * A boss's read: an eye opening under its bar, looking where you are, and beside it the field in
 * small (the boss a dot at the top, you an arrow) showing what it's seen you doing.
 * `k` is 0 shut … 1 open.
 */
export function readMark(ctx: CanvasRenderingContext2D, cx: number, y: number, read: Read, side: number, t: number, k: number, color: string) {
  const ex = Math.round(cx - 14);
  const ey = Math.round(y + 6);
  // the eye: a lens shape, its lids parting
  const open = Math.round(3 * k);
  ctx.fillStyle = 'rgba(14,10,22,0.75)';
  ctx.fillRect(ex - 10, y - 2, 40, 16);
  ctx.fillStyle = color;
  for (let dx = -7; dx <= 7; dx++) {
    const h = Math.round(open * Math.sqrt(1 - (dx / 8) ** 2));
    ctx.fillRect(ex + dx, ey - h - 1, 1, 1);
    ctx.fillRect(ex + dx, ey + h, 1, 1);
  }
  if (open > 0) {
    // the pupil, turned towards what it read
    const look = read === 'side' ? side * 3 : 0;
    const down = read === 'back' ? 1 : read === 'close' ? -1 : 0;
    const big = read === 'close' ? 2 : 1;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ex + look - big, ey - 1 + down, big * 2 + 1, Math.min(open * 2, 3));
    ctx.fillStyle = '#1a1020';
    ctx.fillRect(ex + look, ey + down, 1, 1);
  }
  if (k < 0.6) return;
  // the field in small: a frame, the boss at its head, you where it caught you
  const fx = ex + 12;
  const fy = y;
  ctx.fillStyle = '#3a2e48';
  ctx.fillRect(fx, fy, 15, 12);
  ctx.fillStyle = '#1a1020';
  ctx.fillRect(fx + 1, fy + 1, 13, 10);
  ctx.fillStyle = color;
  ctx.fillRect(fx + 6, fy + 2, 3, 2);
  const blink = Math.floor(t * 6) % 2 === 0;
  let sx = fx + 7;
  let sy = fy + 7;
  if (read === 'back') sy = fy + 9;
  else if (read === 'close') sy = fy + 5;
  else if (read === 'side') sx = side < 0 ? fx + 2 : fx + 12;
  ctx.fillStyle = '#ffffff';
  if (read === 'boost') {
    // pushing up the field, a flame behind
    sy = fy + 6 - (Math.floor(t * 8) % 2);
    ctx.fillStyle = '#ff8a3a';
    ctx.fillRect(sx, sy + 2, 1, 3);
    ctx.fillStyle = '#ffffff';
  } else if (read === 'dash') {
    // a ghost left behind it: the dash it's waiting on
    ctx.fillStyle = '#6a5a88';
    ctx.fillRect(sx - 4, sy, 1, 2);
    ctx.fillRect(sx - 3, sy - 1, 1, 1);
    ctx.fillStyle = '#ffffff';
  } else if (read === 'still' && !blink) return;
  // you: a pixel arrowhead
  ctx.fillRect(sx, sy - 1, 1, 1);
  ctx.fillRect(sx - 1, sy, 3, 1);
  ctx.fillRect(sx - 1, sy + 1, 1, 1);
  ctx.fillRect(sx + 1, sy + 1, 1, 1);
}

/**
 * Each signature move as a picture (13 × 9: `#` in the boss's colour, `+` white-hot): what it
 * is at a glance, the way the ribbon used to name it.
 */
const MOVES: Record<string, string[]> = {
  // Vask folds and drops out of the sky on you
  skydive: ['......#......', '.#....#....#.', '..#...#...#..', '......#......', '......#......', '....#####....', '.....###.....', '......#......', '...+++++++...'],
  // the wrecking ball on its chain
  crane: ['######.......', '.....#.......', '......#......', '.......#.....', '........#....', '.......###...', '......##+##..', '......#####..', '.......###...'],
  // the herd, coming down the field
  stampede: ['#...........#', '.##.......##.', '...##...##...', '.....#+#.....', '#...........#', '.##.......##.', '...##...##...', '.....#+#.....', '.............'],
  // spores bursting out all round
  bloom: ['......#......', '..#...#...#..', '...#..#..#...', '....#####....', '.####+++####.', '....#####....', '...#..#..#...', '..#...#...#..', '......#......'],
  // ice, along both diagonals and both axes
  cross: ['#.....#.....#', '.#....#....#.', '..#..###..#..', '...#..#..#...', '######+######', '...#..#..#...', '..#..###..#..', '.#....#....#.', '#.....#.....#'],
  // the titan's eye, opening on you
  eye: ['.............', '....#####....', '..##.....##..', '.#...###...#.', '#...##+##...#', '.#...###...#.', '..##.....##..', '....#####....', '.............'],
  // the air drawn in to its maw
  breath: ['#...........#', '..#.......#..', '....#...#....', '.............', '###...+...###', '.............', '....#...#....', '..#.......#..', '#...........#'],
  // the hook that takes back what's owed
  repossess: ['.....###.....', '....#...#....', '........#....', '........#....', '.#......#....', '.#.....#.....', '..#...#......', '...###.......', '.............'],
  // the dial, ticking round
  count: ['....#####....', '..##..#..##..', '.#....#....#.', '#.....#.....#', '#.....+##...#', '#...........#', '.#.........#.', '..##.....##..', '....#####....'],
  // ARU-0's claws, thrown over you from behind: a row with its gap
  pursuit: ['#.#.#...#.#.#', '.............', '......+......', '.............', '..#.......#..', '...#.....#...', '....#...#....', '.....#.#.....', '......#......'],
  // its lines, out from the hold to the scrap it's taking
  lien: ['....#####....', '....#+++#....', '.....###.....', '....#.#.#....', '...#..#..#...', '..#...#...#..', '.#....#....#.', '+.....+.....+', '.............'],
  // a plate down the lane, and back
  ballast: ['......#......', '.....###.....', '....#####....', '......#......', '...+++++++...', '...+++++++...', '......#......', '....#####....', '.....###.....'],
  // her guns run out along the rail
  broadside: ['.............', '.##...##...##', '#++#.#++#.#++', '#++#.#++#.#++', '.##...##...##', '.............', '#.#.#.#.#.#.#', '#############', '.............'],
};

/**
 * A boss's signature as it comes: its picture in a ribbon under the bar, shuddering harder as
 * the windup builds, with the windup filling under it and blinking white just before it lands;
 * once it's going, the picture burns white and settles. `k`: 0 … 1 through the windup.
 */
export function moveMark(ctx: CanvasRenderingContext2D, cx: number, y: number, move: string, k: number, going: boolean, t: number, color: string) {
  const art = MOVES[move];
  if (!art) return;
  const s = 2;
  const pw = art[0].length * s;
  const ph = art.length * s;
  const bw = pw + 16;
  const x0 = Math.round(cx - bw / 2);
  ctx.fillStyle = 'rgba(14,10,22,0.78)';
  ctx.fillRect(x0, y - 2, bw, ph + 10);
  ctx.fillStyle = color;
  ctx.fillRect(x0, y - 2, bw, 1);
  ctx.fillRect(x0, y + ph + 7, bw, 1);
  const late = !going && k > 0.8;
  const blink = Math.floor(t * 24) % 2 === 0;
  const jx = going ? 0 : k > 0.5 ? Math.round((Math.random() - 0.5) * 2 * (k - 0.4) * 2.5) : 0;
  const jy = going ? 0 : k > 0.7 ? Math.round((Math.random() - 0.5) * 2) : 0;
  const main = going ? (Math.floor(t * 12) % 2 ? '#ffffff' : color) : late && blink ? '#ffffff' : color;
  const px = Math.round(cx - pw / 2) + jx;
  const py = y + 1 + jy;
  for (let r = 0; r < art.length; r++)
    for (let c = 0; c < art[r].length; c++) {
      const ch = art[r][c];
      if (ch === '.') continue;
      ctx.fillStyle = ch === '+' ? '#ffffff' : main;
      ctx.fillRect(px + c * s, py + r * s, s, s);
    }
  // the windup, filling; full and white once it's loose
  const fw = bw - 8;
  ctx.fillStyle = '#2a2236';
  ctx.fillRect(x0 + 4, y + ph + 3, fw, 2);
  ctx.fillStyle = going || (late && blink) ? '#ffffff' : color;
  ctx.fillRect(x0 + 4, y + ph + 3, Math.round(fw * (going ? 1 : k)), 2);
}
