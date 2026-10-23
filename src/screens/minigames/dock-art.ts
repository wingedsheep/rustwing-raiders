import { fbm } from '../../util';

/**
 * MATCH AND DOCK's painted backdrop, matched to the pod and ghost events' art: deep blue space
 * with teal and violet nebula, the limb of a blue world low on the left; then the station's dark
 * frosted hull behind its turning docking ring; and the cracks a crash leaves on your canopy.
 */

const skies = new Map<string, HTMLCanvasElement>();
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export function dockSky(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const key = `${w}x${h}:${seed}`;
  let c = skies.get(key);
  if (!c) {
    c = paint(w, h, seed);
    skies.set(key, c);
  }
  ctx.drawImage(c, 0, 0);
}

function paint(w: number, h: number, seed: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const s = seed % 991;
  // the world: a big disc off the lower left
  const pcx = -60;
  const pcy = h + 170;
  const pr = 300;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dith = BAYER[(y & 3) * 4 + (x & 3)];
      let r = 6;
      let gg = 10 + (y / h) * 6;
      let b = 26 + (y / h) * 12;
      const n1 = Math.max(0, fbm(x * 0.011, y * 0.018, s) - 0.48) * 2.4;
      const n2 = Math.max(0, fbm(x * 0.02 + 50, y * 0.024, s + 3) - 0.55) * 2.6;
      r += n1 * 10 + n2 * 70;
      gg += n1 * 70 + n2 * 20;
      b += n1 * 80 + n2 * 90;
      const dx = (x - pcx) / pr;
      const dy = (y - pcy) / pr;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        const nz = Math.sqrt(1 - d2);
        const lit = Math.max(0, dx * 0.7 - dy * 0.5 + nz * 0.3);
        const cloud = fbm(x * 0.05, y * 0.12, s + 9) > 0.56;
        const sea = fbm(x * 0.02, y * 0.05, s + 13) > 0.5;
        const base = cloud ? [220, 232, 248] : sea ? [40, 90, 190] : [60, 120, 170];
        const q = Math.min(1, Math.floor(lit * 3 + dith) / 3 + 0.15);
        r = 8 + (base[0] - 8) * q;
        gg = 14 + (base[1] - 14) * q;
        b = 40 + (base[2] - 40) * q;
        if (Math.sqrt(d2) > 0.985 && lit > 0.3) {
          r = 180;
          gg = 220;
          b = 255;
        }
      } else if (Math.sqrt(d2) < 1.06) {
        const k = (1 - (Math.sqrt(d2) - 1) / 0.06) * 0.4;
        r += (60 - r) * k;
        gg += (140 - gg) * k;
        b += (230 - b) * k;
      }
      img.data[i] = r;
      img.data[i + 1] = gg;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

function hash(i: number, j: number) {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** The station's hull behind the ring, as on the pod: a great frosted cylinder of rusted plate,
 *  ribbed with heavy frames, lit portholes and amber running lights, icicles off its belly, spires
 *  on its back. Scaled by S (the ring's outer radius on screen); `power` 0..1 lights it up. */
export function hullBand(ctx: CanvasRenderingContext2D, w: number, cx: number, cy: number, S: number, power: number, t: number) {
  const top = Math.round(cy - S * 0.62);
  const bot = Math.round(cy + S * 0.7);
  const H = bot - top;
  // spires on its back, as on the ghost station, behind the hull
  const sp = Math.max(8, S * 0.5);
  for (let i = -6; i <= 6; i++) {
    const x = Math.round(cx + i * sp + (hash(i, 3) - 0.5) * sp * 0.5);
    const hh = Math.round(S * (0.15 + hash(i, 7) * 0.4));
    const ww = Math.max(2, Math.round(S * (0.05 + hash(i, 5) * 0.08)));
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(x - ww / 2 - 1, top - hh - 1, ww + 2, hh + 2);
    ctx.fillStyle = '#1e2032';
    ctx.fillRect(x - ww / 2, top - hh, ww, hh);
    ctx.fillStyle = '#2c3048';
    ctx.fillRect(x - ww / 2, top - hh, Math.max(1, Math.round(ww / 3)), hh);
    if (hash(i, 9) < 0.5 && power > 0.5) {
      ctx.fillStyle = Math.floor(t * 1.5 + i) % 3 ? '#ff6a5a' : '#5a2a2a';
      ctx.fillRect(x, top - hh - 1, 1, 1);
    }
  }
  // the cylinder: banded light, bright along its upper flank, dark along its belly
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, top - 2, w, H + 4);
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, '#4a4a5e');
  g.addColorStop(0.18, '#5e5a6a');
  g.addColorStop(0.32, '#3e3c4e');
  g.addColorStop(0.7, '#24243a');
  g.addColorStop(1, '#14142a');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, w, H);
  // plate seams along it
  for (const f of [0.22, 0.45, 0.68, 0.86]) {
    ctx.fillStyle = 'rgba(10,10,20,0.55)';
    ctx.fillRect(0, Math.round(top + H * f), w, 1);
  }
  // heavy frames round it, rusted, each with an amber running light; portholes between
  const fs = Math.max(14, S * 0.55);
  const fw = Math.max(2, Math.round(S * 0.07));
  const off = ((cx % fs) + fs) % fs;
  for (let i = -1, x = off - fs; x < w + fs; x += fs, i++) {
    const X = Math.round(x);
    const k = Math.floor((x - cx) / fs);
    // rust streaks running down from the frame
    ctx.fillStyle = 'rgba(150,80,40,0.35)';
    ctx.fillRect(X + fw, top + Math.round(H * 0.2), Math.max(1, Math.round(fw * 0.6)), Math.round(H * (0.3 + hash(k, 11) * 0.4)));
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(X - 1, top, fw + 2, H);
    ctx.fillStyle = '#7a5038';
    ctx.fillRect(X, top, fw, H);
    ctx.fillStyle = '#a8704a';
    ctx.fillRect(X, top, Math.max(1, Math.round(fw / 3)), Math.round(H * 0.4));
    ctx.fillStyle = '#4a3028';
    ctx.fillRect(X, top + Math.round(H * 0.6), fw, Math.round(H * 0.4));
    // the running light, chasing along the frames
    const on = power > (k + 8) / 16 && (Math.floor(t * 3) + k) % 4 === 0;
    ctx.fillStyle = on ? '#ffb04a' : '#5a4030';
    const ls = Math.max(1, Math.round(fw * 0.6));
    ctx.fillRect(X + Math.round((fw - ls) / 2), top + Math.round(H * 0.5), ls, ls);
    // a row of portholes between this frame and the next
    const n = 3;
    const pr = Math.max(1, Math.round(S * 0.035));
    for (let j = 1; j <= n; j++) {
      const px = Math.round(x + fw + ((fs - fw) * j) / (n + 1));
      const py = Math.round(top + H * 0.36);
      const lit = hash(k, j) < 0.55 * power;
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(px - pr - 1, py - pr - 1, pr * 2 + 2, pr * 2 + 2);
      ctx.fillStyle = lit ? (hash(j, k) < 0.2 ? '#8affd0' : '#ffd27a') : '#1a1c2c';
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      if (lit && pr > 1) {
        ctx.fillStyle = '#fff4d0';
        ctx.fillRect(px - pr, py - pr, pr, 1);
      }
    }
    // now and then a big lit window, a hatch, or a vent
    const kind = hash(k, 21);
    if (kind < 0.25) {
      const ww = Math.round(fs * 0.4);
      const wh = Math.round(H * 0.14);
      const wx = Math.round(x + fw + (fs - fw - ww) / 2);
      const wy = Math.round(top + H * 0.55);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
      ctx.fillStyle = power > 0.6 ? '#6ad0ff' : '#1a2a3a';
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = 'rgba(220,240,255,0.5)';
      ctx.fillRect(wx, wy, ww, 1);
    } else if (kind < 0.5) {
      const hw = Math.round(fs * 0.22);
      const hx = Math.round(x + fw + (fs - fw) * 0.6);
      const hy = Math.round(top + H * 0.58);
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(hx - 1, hy - 1, hw + 2, hw + 2);
      ctx.fillStyle = '#3a3a50';
      ctx.fillRect(hx, hy, hw, hw);
      ctx.fillStyle = '#ffb04a';
      ctx.fillRect(hx, hy, hw, 1);
    }
  }
  // frost crusted along the top, in lumps, and on the frames' shoulders
  const lump = Math.max(3, S * 0.05);
  for (let i = 0, x = (cx % lump) - lump; x < w; x += lump, i++) {
    const k = Math.floor((x - cx) / lump);
    const hh = Math.round(S * (0.015 + hash(k, 31) * 0.05));
    ctx.fillStyle = hash(k, 32) < 0.5 ? '#dce8f4' : '#a8c0dc';
    ctx.fillRect(Math.round(x), top - Math.round(hh / 2), Math.ceil(lump), hh);
  }
  // icicles hanging off the belly, long and short
  const ic = Math.max(3, S * 0.07);
  for (let x = (cx % ic) - ic; x < w; x += ic) {
    const i = Math.floor((x - cx) / ic);
    if (hash(i, 4) < 0.35) continue;
    const len = Math.round(S * 0.04 + hash(i, 1) * S * 0.16);
    const iw = Math.max(1, Math.round(ic * 0.35));
    ctx.fillStyle = '#a8c0dc';
    ctx.fillRect(Math.round(x), bot, iw, len);
    ctx.fillStyle = '#dce8f4';
    ctx.fillRect(Math.round(x), bot, Math.max(1, Math.round(iw / 2)), Math.round(len * 0.7));
  }
}

/** Cracks spreading from a point on the canopy: seeded, grown to `f` (0..1). */
export function cracks(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, seed: number) {
  if (f <= 0) return;
  ctx.save();
  ctx.lineWidth = 1;
  for (let k = 0; k < 9; k++) {
    let a = (k / 9) * Math.PI * 2 + hash(k, seed) * 0.6;
    let px = x;
    let py = y;
    const len = (50 + hash(seed, k) * 110) * f;
    ctx.strokeStyle = k % 2 ? 'rgba(220,240,255,0.75)' : 'rgba(160,200,230,0.55)';
    ctx.beginPath();
    ctx.moveTo(px + 0.5, py + 0.5);
    for (let d = 0; d < len; d += 12) {
      a += (hash(k, d) - 0.5) * 0.7;
      px += Math.cos(a) * 12;
      py += Math.sin(a) * 12;
      ctx.lineTo(Math.round(px) + 0.5, Math.round(py) + 0.5);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(220,240,255,0.5)';
  ctx.beginPath();
  ctx.arc(x, y, 6 + f * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
