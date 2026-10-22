/**
 * The painted scenes for events and stops (public/art/events/*.png, 640 × 360): loaded once, in
 * the background, as plain images, and drawn onto the UI canvas texel for texel. Until one has
 * loaded (or if it never does) a scene falls back to a dark wash, so nothing waits on them.
 */

const NAMES = [
  'derelict', 'distress', 'signal', 'crash', 'pod', 'relay', 'dock', 'salvage',
  'loan', 'dice', 'customs', 'insurance', 'minefield', 'ghost', 'refugees', 'tanker', 'gazette', 'hunter',
  'teahouse', 'twins', 'tobbo', 'skree', 'squit', 'holly', 'ferrule', 'choir', 'runaway', 'leeches', 'calf',
  'census', 'ledger', 'vaelmira', 'ashes',
];

const images = new Map<string, HTMLImageElement>();

/** Starts loading every scene (cheap to call again). */
export function preloadArt() {
  for (const n of NAMES) {
    if (images.has(n)) continue;
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}art/events/${n}.png`;
    images.set(n, img);
  }
}

/** A scene's image, once it has loaded (for drawing a part of it). */
export function artImage(name: string): HTMLImageElement | null {
  preloadArt();
  const img = images.get(name);
  return img && img.complete && img.naturalWidth ? img : null;
}

/** Draws a scene to cover a rectangle (cropping, not stretching), dimmed by `dim` (0..1). */
export function drawArt(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, w: number, h: number, dim = 0) {
  preloadArt();
  const img = images.get(name);
  if (img && img.complete && img.naturalWidth) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / s;
    const sh = h / s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  } else {
    ctx.fillStyle = '#16101f';
    ctx.fillRect(x, y, w, h);
  }
  if (dim > 0) {
    ctx.fillStyle = `rgba(10,7,16,${dim})`;
    ctx.fillRect(x, y, w, h);
  }
}

preloadArt();
