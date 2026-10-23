/**
 * The UI's trim: what its plates are made of. Riveted brass round dark gunmetal, corners cut at
 * 45°, gauges slanted forward like a rustwing's fins. Drawn texel by texel, so it sits on the
 * same pixel grid as the font.
 */

export const BRASS = '#c89a48';
export const BRASS_HI = '#ffe2a0';
export const BRASS_LO = '#6a4a28';
export const GUNMETAL = '#1a1422';
const KEY = '#0a0610';

/** How deep each corner is cut: top-left, top-right, bottom-right, bottom-left. */
export type Cuts = [number, number, number, number];

const insets = (r: number, h: number, [tl, tr, br, bl]: Cuts) => {
  const up = r;
  const down = h - 1 - r;
  return [Math.max(0, tl - up, bl - down), Math.max(0, tr - up, br - down)];
};

/** A rectangle with its corners cut, filled with `style` (a colour or a gradient). */
export function cutRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cuts: Cuts, style: string | CanvasGradient) {
  ctx.fillStyle = style;
  for (let r = 0; r < h; r++) {
    const [l, rt] = insets(r, h, cuts);
    if (w - l - rt > 0) ctx.fillRect(x + l, y + r, w - l - rt, 1);
  }
}

/** The outline of a cut rectangle, one texel wide (its top in `top`, if given). */
export function cutEdge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cuts: Cuts, color: string, top?: string) {
  ctx.fillStyle = color;
  for (let r = 0; r < h; r++) {
    const [l, rt] = insets(r, h, cuts);
    if (r === 0 || r === h - 1) {
      ctx.fillStyle = r === 0 && top ? top : color;
      ctx.fillRect(x + l, y + r, w - l - rt, 1);
      ctx.fillStyle = color;
      continue;
    }
    ctx.fillRect(x + l, y + r, 1, 1);
    ctx.fillRect(x + w - 1 - rt, y + r, 1, 1);
  }
}

/** A brass rivet: lit at its top-left, a dark shadow under it. */
export function rivet(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = KEY;
  ctx.fillRect(x + 1, y + 1, 2, 2);
  ctx.fillStyle = BRASS;
  ctx.fillRect(x, y, 2, 2);
  ctx.fillStyle = BRASS_HI;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * A plate: a dark keyline, gunmetal shading down, a brass rim lit along its top, rivets in its
 * top corners if it's big enough. `alpha` lets the field show through a HUD plate.
 */
export function brassPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cuts: Cuts, alpha = 0.86, rivets = true) {
  const grow = cuts.map((c) => (c ? c + 1 : 0)) as Cuts;
  ctx.globalAlpha = alpha;
  cutRect(ctx, x - 1, y - 1, w + 2, h + 2, grow, KEY);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#2a2034');
  g.addColorStop(0.5, GUNMETAL);
  g.addColorStop(1, '#100b16');
  cutRect(ctx, x, y, w, h, cuts, g);
  ctx.globalAlpha = 1;
  cutEdge(ctx, x, y, w, h, cuts, BRASS_LO, BRASS);
  // the top catches the light
  const [l, rt] = insets(0, h, cuts);
  ctx.fillStyle = BRASS_HI;
  ctx.fillRect(x + l + 2, y, Math.max(0, Math.min(18, w - l - rt - 4)), 1);
  if (rivets && w >= 40 && h >= 16) {
    rivet(ctx, x + Math.max(3, cuts[0] + 2), y + 3);
    rivet(ctx, x + w - 5 - Math.max(0, cuts[1] - 1), y + 3);
  }
}

/** How far each row of a slanted shape `h` tall leans forward, from the top. */
const lean = (r: number, h: number) => Math.floor((h - 1 - r) / 2);
/** How much wider a slanted shape is than its `w`. */
export const slantOf = (h: number) => lean(0, h);

/**
 * A gauge slanted forward (or back, `dir` -1, for a plate at the right end): a dark keyline, the
 * track, the fill to `f` lit along its top and shaded at its foot, and a notch at each of `notches`
 * (fractions along it).
 */
export function slantBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string, o: { track?: string; dir?: 1 | -1; notches?: number[]; ghost?: number; ghostColor?: string; keyline?: boolean } = {}) {
  const dir = o.dir ?? 1;
  const at = (r: number, hh: number) => (dir > 0 ? lean(r, hh) : lean(hh - 1 - r, hh));
  const fw = Math.round(w * Math.max(0, Math.min(1, f)));
  if (o.keyline !== false) {
    ctx.fillStyle = KEY;
    for (let r = -1; r <= h; r++) {
      const off = at(Math.max(0, Math.min(h - 1, r)), h);
      ctx.fillRect(x + off - 1, y + r, w + 2, 1);
    }
  }
  for (let r = 0; r < h; r++) {
    const off = at(r, h);
    // filled from the outer end inward on a plate at the right (dir -1)
    const fx = dir > 0 ? x + off : x + off + w - fw;
    ctx.fillStyle = o.track ?? '#2a2036';
    ctx.fillRect(x + off, y + r, w, 1);
    if (o.ghost !== undefined && o.ghost > f) {
      const gw = Math.round(w * Math.min(1, o.ghost)) - fw;
      ctx.fillStyle = o.ghostColor ?? '#ffe0b0';
      ctx.fillRect(dir > 0 ? fx + fw : fx - gw, y + r, gw, 1);
    }
    ctx.fillStyle = color;
    ctx.fillRect(fx, y + r, fw, 1);
    if (h >= 3 && fw > 0) {
      ctx.fillStyle = r === 0 ? 'rgba(255,255,255,0.4)' : r >= h - 2 && h >= 5 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0)';
      ctx.fillRect(fx, y + r, fw, 1);
    }
    if (o.notches) {
      ctx.fillStyle = KEY;
      for (const n of o.notches) ctx.fillRect(x + off + Math.round(w * n), y + r, 1, 1);
    }
  }
}

/** A dash chevron, `h` tall, pointing forward (or back), filled to `f` from the bottom. */
export function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, f: number, color: string, track: string, dir: 1 | -1 = 1) {
  const half = Math.floor(h / 2);
  const lit = h - Math.round(h * Math.max(0, Math.min(1, f)));
  for (let r = 0; r < h; r++) {
    const d = half - Math.abs(r - half);
    const cx = dir > 0 ? x + d : x + half - d;
    ctx.fillStyle = KEY;
    ctx.fillRect(cx - 1, y + r - 1, 5, 3);
  }
  for (let r = 0; r < h; r++) {
    const d = half - Math.abs(r - half);
    const cx = dir > 0 ? x + d : x + half - d;
    ctx.fillStyle = r >= lit ? color : track;
    ctx.fillRect(cx, y + r, 3, 1);
    if (r >= lit && r === lit) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(cx, y + r, 3, 1);
    }
  }
}

/**
 * Part of a slanted shape, texels `a` to `b` along it (from its outer end: the left, or the right
 * for `dir` -1), in `color`; with `shade`, lit along its top and darker at its foot.
 */
export function slantSpan(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: number, b: number, color: string, dir: 1 | -1 = 1, shade = false) {
  a = Math.max(0, Math.round(a));
  b = Math.min(w, Math.round(b));
  if (b <= a) return;
  for (let r = 0; r < h; r++) {
    const off = dir > 0 ? lean(r, h) : lean(h - 1 - r, h);
    const sx = dir > 0 ? x + off + a : x + off + w - b;
    ctx.fillStyle = color;
    ctx.fillRect(sx, y + r, b - a, 1);
    if (!shade) continue;
    const tone = r === 0 ? 'rgba(255,255,255,0.45)' : r === 1 ? 'rgba(255,255,255,0.12)' : r >= h - 2 ? 'rgba(0,0,0,0.28)' : '';
    if (tone) {
      ctx.fillStyle = tone;
      ctx.fillRect(sx, y + r, b - a, 1);
    }
  }
}

/** The dark keyline round a slanted shape. */
export function slantKey(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dir: 1 | -1 = 1, color = KEY) {
  ctx.fillStyle = color;
  for (let r = -1; r <= h; r++) {
    const rr = Math.max(0, Math.min(h - 1, r));
    const off = dir > 0 ? lean(rr, h) : lean(h - 1 - rr, h);
    ctx.fillRect(x + off - 1, y + r, w + 2, 1);
  }
}
