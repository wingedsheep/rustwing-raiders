/**
 * Pre-rendered sprites for the minigames: low-poly models rendered in Blender in the game's toon
 * look (tools/sprites, `just sprites <sheet>`), packed one atlas a sheet into
 * public/art/minigames/<sheet>.png, with its frames in src/generated/sprites_<sheet>.json.
 *
 * Atlases load once, in the background. Until a sheet has loaded (or if it never does) drawing
 * from it draws nothing, or calls the fallback you give, so nothing waits on them.
 *
 *   drawSprite(ctx, 'demo', 'ship_side', x, y, { clip: 'fly', t });
 *   drawSprite(ctx, 'demo', 'ship_top', x, y, { angle: heading, fallback: () => sideShip(ctx, x, y, 0) });
 */

interface Clip {
  /** Frames a second (0 for a still). */
  fps: number;
  loop: boolean;
  /** Top-left corners in the atlas: every frame of angle 0, then of angle 1, and so on. */
  frames: [number, number][];
}

interface Sprite {
  /** Every frame's size. */
  w: number;
  h: number;
  /** Where the model's origin is in a frame, from its top-left. */
  px: number;
  py: number;
  /** How many headings it was rendered in (1, or e.g. 16 for a top-down ship). */
  angles: number;
  clips: Record<string, Clip>;
}

interface Sheet {
  image: string;
  sprites: Record<string, Sprite>;
}

// every sheet the renderer has written, found at build time
const SHEETS: Record<string, Sheet> = Object.fromEntries(
  Object.entries(import.meta.glob<Sheet>('../../generated/sprites_*.json', { eager: true, import: 'default' })).map(
    ([path, sheet]) => [path.replace(/^.*sprites_(.+)\.json$/, '$1'), sheet],
  ),
);

const images = new Map<string, HTMLImageElement>();

/** Starts loading a sheet's atlas, or every sheet's (cheap to call again). */
export function preloadSprites(sheet?: string) {
  for (const name of sheet ? [sheet] : Object.keys(SHEETS)) {
    if (images.has(name) || !SHEETS[name]) continue;
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}${SHEETS[name].image}`;
    images.set(name, img);
  }
}

/** True once a sheet's atlas has loaded and can be drawn. */
export function spriteReady(sheet: string): boolean {
  preloadSprites(sheet);
  const img = images.get(sheet);
  return !!img && img.complete && img.naturalWidth > 0;
}

/** A sprite's frame size and origin (null if the sheet or sprite doesn't exist). */
export function spriteInfo(sheet: string, name: string): { w: number; h: number; px: number; py: number; angles: number; clips: string[] } | null {
  const s = SHEETS[sheet]?.sprites[name];
  return s ? { w: s.w, h: s.h, px: s.px, py: s.py, angles: s.angles, clips: Object.keys(s.clips) } : null;
}

export interface SpriteOpts {
  /** Which clip (default 'rest', or the first one). */
  clip?: string;
  /** Seconds into the clip: picks the frame by its fps (loops wrap, one-shots stop at the end). */
  t?: number;
  /** A frame number instead of `t`. */
  frame?: number;
  /** Heading in radians, as on the canvas: 0 faces right, turning clockwise. Picks the nearest
   *  rendered heading; a sprite rendered in one heading ignores it. */
  angle?: number;
  /** Whole numbers keep the pixels square (default 1). */
  scale?: number;
  /** Mirrored left to right (about the anchor). */
  flipX?: boolean;
  alpha?: number;
  /** What sits at (x, y): the model's origin (default), the frame's centre, its bottom centre, or
   *  its top-left corner. */
  anchor?: 'origin' | 'center' | 'bottom' | 'topleft';
  /** Drawn instead while the atlas hasn't loaded. */
  fallback?: () => void;
}

/** Draws a sprite's frame at (x, y). Returns false (and calls the fallback) if it couldn't. */
export function drawSprite(ctx: CanvasRenderingContext2D, sheet: string, name: string, x: number, y: number, o: SpriteOpts = {}): boolean {
  const s = SHEETS[sheet]?.sprites[name];
  if (!s || !spriteReady(sheet)) {
    o.fallback?.();
    return false;
  }
  const clip = s.clips[o.clip ?? 'rest'] ?? Object.values(s.clips)[0];
  const n = clip.frames.length / s.angles;
  let f = o.frame ?? Math.floor((o.t ?? 0) * clip.fps);
  f = clip.loop ? ((f % n) + n) % n : Math.max(0, Math.min(n - 1, f));
  const step = (Math.PI * 2) / s.angles;
  const a = ((Math.round((o.angle ?? 0) / step) % s.angles) + s.angles) % s.angles;
  const [sx, sy] = clip.frames[a * n + f];

  const k = o.scale ?? 1;
  const anchor = o.anchor ?? 'origin';
  const ax = anchor === 'origin' ? s.px : anchor === 'topleft' ? 0 : s.w / 2;
  const ay = anchor === 'origin' ? s.py : anchor === 'topleft' ? 0 : anchor === 'bottom' ? s.h : s.h / 2;
  const dx = Math.round(x - Math.round(ax * k));
  const dy = Math.round(y - Math.round(ay * k));
  const dw = Math.round(s.w * k);
  const dh = Math.round(s.h * k);

  const img = images.get(sheet)!;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  if (o.flipX) {
    ctx.translate(Math.round(x) * 2, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(img, sx, sy, s.w, s.h, dx, dy, dw, dh);
  ctx.restore();
  return true;
}
