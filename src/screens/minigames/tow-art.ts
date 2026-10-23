import { fbm } from '../../util';

/**
 * KEEP IT TAUT's painted backdrop and its shaped particles. The sky matches the distress event's
 * art: deep navy space, a big banded blue-violet planet curving across the bottom, a small ringed
 * one far off, and faint wisps. It's made once per seed into a canvas and kept.
 */

const skies = new Map<string, HTMLCanvasElement>();

/** Ordered 4x4 dither, for banding the planet's shading in pixel-art steps. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// the big planet's bands, pale to deep, and its shadow side
const BANDS = ['#a8b8f0', '#7a8ae0', '#5a6ad0', '#4a54b8', '#6a7ad8', '#3a4aa8', '#8a9ae8', '#4a5ac0'].map(hex);
const NIGHT = hex('#141a48');
const RIM = hex('#c8e0ff');

/** The sky: drawn at an x offset (a slow drift as she's towed along). */
export function towSky(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, drift: number) {
  const key = `${w}x${h}:${seed}`;
  let c = skies.get(key);
  if (!c) {
    c = paint(w + 80, h, seed);
    skies.set(key, c);
  }
  ctx.drawImage(c, Math.round(-40 + Math.max(-40, Math.min(40, drift))), 0);
}

function paint(w: number, h: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const s = seed % 997;
  // the planet: a big disc low on the left, its top limb arcing through the lower third
  const pcx = w * 0.36;
  const pcy = h + 250;
  const pr = 340;
  // light from the upper right
  const L = [0.45, -0.75, 0.48];
  const ll = Math.hypot(L[0], L[1], L[2]);
  // a small ringed planet, far off at the upper middle
  const qx = w * 0.62;
  const qy = 34;
  const qr = 11;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dith = BAYER[(y & 3) * 4 + (x & 3)];
      // space: navy, a touch lighter low down, with wisps
      const v = y / h;
      let r = 8 + v * 8;
      let gg = 12 + v * 12;
      let b = 34 + v * 26;
      const n = fbm(x * 0.012, y * 0.02, s);
      const wisp = Math.max(0, n - 0.5) * 2.4;
      r += wisp * 40;
      gg += wisp * 34;
      b += wisp * 90;
      const n2 = Math.max(0, fbm(x * 0.02 + 30, y * 0.03, s + 5) - 0.58) * 2.4;
      r += n2 * 70;
      gg += n2 * 24;
      b += n2 * 70;
      // the big planet
      const dx = (x - pcx) / pr;
      const dy = (y - pcy) / pr;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        const nz = Math.sqrt(1 - d2);
        // bands follow latitude, tilted a little, wobbling with turbulence
        const tilt = dy * 0.96 + dx * 0.28;
        const lat = Math.asin(Math.max(-1, Math.min(1, tilt)));
        const turb = (fbm(x * 0.03, y * 0.09, s + 11) - 0.5) * 0.05;
        const bi = Math.floor(((lat + turb) * 22 + 100) % BANDS.length);
        const band = BANDS[(bi + BANDS.length) % BANDS.length];
        const lit = Math.max(0, (dx * L[0] + dy * L[1] + nz * L[2]) / ll);
        // quantised to three steps, dithered between them
        const q = Math.min(1, Math.floor(lit * 3 + dith) / 3 + 0.12);
        r = NIGHT[0] + (band[0] - NIGHT[0]) * q;
        gg = NIGHT[1] + (band[1] - NIGHT[1]) * q;
        b = NIGHT[2] + (band[2] - NIGHT[2]) * q;
        // the atmosphere's bright rim on the lit side
        const edge = Math.sqrt(d2);
        if (edge > 0.985 && lit > 0.2 + dith * 0.3) {
          r = RIM[0];
          gg = RIM[1];
          b = RIM[2];
        }
      } else {
        // a haze just off the limb
        const off = Math.sqrt(d2) - 1;
        if (off < 0.05) {
          const k = (1 - off / 0.05) * 0.35;
          r += (90 - r) * k;
          gg += (120 - gg) * k;
          b += (220 - b) * k;
        }
      }
      // the far ringed planet
      const ex = x - qx;
      const ey = y - qy;
      const ringR = Math.hypot(ex, (ey + ex * 0.25) * 3.6);
      const ring = ringR > qr * 1.45 && ringR < qr * 2.1 && ((ringR * 1.3) | 0) % 3 !== 0;
      const inBall = ex * ex + ey * ey < qr * qr;
      const front = ey + ex * 0.25 > 0;
      if (ring && (!inBall || front)) {
        r = 120;
        gg = 112;
        b = 160;
      } else if (inBall) {
        const lit = Math.max(0, (ex * 0.6 - ey * 0.6) / qr + 0.3);
        const q = Math.min(1, Math.floor(lit * 3 + dith) / 3);
        const band = Math.floor((ey + 20) / 3) % 2 ? [150, 120, 190] : [120, 96, 170];
        r = 30 + (band[0] - 30) * q;
        gg = 26 + (band[1] - 26) * q;
        b = 60 + (band[2] - 60) * q;
      }
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

interface Bit {
  kind: 'smoke' | 'shard' | 'streak' | 'ember';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  spin: number;
  col: string;
}

/** Shaped particles: smoke that billows, plates that tumble, sparks drawn along their flight. */
export class Bits {
  private list: Bit[] = [];

  private add(b: Omit<Bit, 'max'>) {
    if (this.list.length > 260) this.list.shift();
    this.list.push({ ...b, max: b.life });
  }
  smoke(x: number, y: number, vx: number, vy: number, life: number, size: number, col = '#3a3448') {
    this.add({ kind: 'smoke', x, y, vx, vy, life, size, spin: 0, col });
  }
  shard(x: number, y: number, vx: number, vy: number, life: number, col = '#8a8098') {
    this.add({ kind: 'shard', x, y, vx, vy, life, size: 2 + Math.random() * 2, spin: Math.random() * 6, col });
  }
  streak(x: number, y: number, vx: number, vy: number, life: number, col = '#ffd04a') {
    this.add({ kind: 'streak', x, y, vx, vy, life, size: 1, spin: 0, col });
  }
  ember(x: number, y: number, vx: number, vy: number, life: number, col = '#ff8a3a') {
    this.add({ kind: 'ember', x, y, vx, vy, life, size: 1, spin: 0, col });
  }

  update(dt: number) {
    for (const b of this.list) {
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind === 'smoke') {
        b.vx *= Math.exp(-dt * 1.5);
        b.vy *= Math.exp(-dt * 1.5);
      } else if (b.kind === 'shard') b.spin += dt * 9;
      else if (b.kind === 'ember') b.vy -= dt * 10;
    }
    this.list = this.list.filter((b) => b.life > 0);
  }

  /** Smoke first (behind), the rest over it. */
  draw(ctx: CanvasRenderingContext2D, layer: 'back' | 'front') {
    for (const b of this.list) {
      const f = b.life / b.max;
      if ((b.kind === 'smoke') !== (layer === 'back')) continue;
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      if (b.kind === 'smoke') {
        const r = Math.round(b.size * (1.6 - f));
        ctx.globalAlpha = Math.min(1, f * 1.4) * 0.55;
        ctx.fillStyle = b.col;
        ctx.fillRect(x - r, y - r + 1, r * 2, r * 2 - 2);
        ctx.fillRect(x - r + 1, y - r, r * 2 - 2, r * 2);
        ctx.globalAlpha *= 0.6;
        ctx.fillStyle = '#5a5470';
        ctx.fillRect(x - r + 1, y - r, Math.max(1, r), 1);
      } else if (b.kind === 'shard') {
        ctx.globalAlpha = Math.min(1, f * 2);
        const a = Math.sin(b.spin);
        const lw = Math.max(1, Math.round(Math.abs(a) * b.size));
        ctx.fillStyle = '#1a1424';
        ctx.fillRect(x - 1, y - 1, lw + 2, 3);
        ctx.fillStyle = a > 0 ? b.col : '#5e5870';
        ctx.fillRect(x, y, lw, 1 + (b.size > 3 ? 1 : 0));
      } else if (b.kind === 'streak') {
        ctx.globalAlpha = Math.min(1, f * 2);
        ctx.strokeStyle = b.col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y + 0.5);
        ctx.lineTo(x + 0.5 - b.vx * 0.03, y + 0.5 - b.vy * 0.03);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.globalAlpha = f;
        ctx.fillStyle = Math.floor(b.life * 20) % 2 ? b.col : '#ffd04a';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
}
