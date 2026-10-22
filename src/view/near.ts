import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import type { Player } from '../sim/level';
import { FLIGHT_Y, TILT } from '../sim/types';
import { lookOf } from '../world/looks';
import { depthScale, weather } from '../render/alive';
import { rng } from '../util';

/**
 * The near layer: banks of cloud, smoke or spores high up between you and the camera, drifting in
 * past the screen's edges. Drawn with depth (see DEPTH), so they're bigger than they'd be down at
 * the flight line and slide by faster than the land: the land falls away beneath them. Never
 * many, mostly off to the sides, and thinned round a ship that strays under one.
 */

interface Bank {
  obj: THREE.Group;
  mats: THREE.SpriteMaterial[];
  /** Where it is, as if down on the flight plane (x, z): it stays put there while the land scrolls. */
  x: number;
  zf: number;
  y: number;
  /** Its half size, across and along, at the flight line. */
  hw: number;
  hd: number;
  alpha: number;
  see: number;
}

const TAN = Math.tan(TILT);

export class NearLayer {
  readonly group = new THREE.Group();
  private banks: Bank[] = [];
  private wait = 2;
  private r = rng(7);

  constructor(private readonly terrain: Terrain) {
    this.r = rng(terrain.seed * 3 + 11);
  }

  /** `top`/`bottom` of the view on the flight plane. */
  update(dt: number, halfW: number, top: number, bottom: number, players: Player[]) {
    const view = weather.uView.value;
    for (let i = this.banks.length - 1; i >= 0; i--) {
      const b = this.banks[i];
      const s = depthScale(b.y);
      const x = view.x + (b.x - view.x) * s;
      const zf = view.y + (b.zf - view.y) * s;
      if (zf - b.hd * s > bottom + 4) {
        this.group.remove(b.obj);
        for (const m of b.mats) m.dispose();
        this.banks.splice(i, 1);
        continue;
      }
      b.obj.position.set(x, b.y, zf + (b.y - FLIGHT_Y) * TAN);
      b.obj.scale.setScalar(s);
      // thinned over a ship
      let under = 0;
      for (const p of players) {
        if (p.down) continue;
        const dx = Math.max(0, Math.abs(p.x - x) - b.hw * s * 0.6);
        const dz = Math.max(0, Math.abs(p.z - zf) - b.hd * s * 0.6);
        under = Math.max(under, 1 - Math.min(1, Math.hypot(dx, dz) / 8));
      }
      b.see += (under - b.see) * Math.min(1, dt * 4);
      const a = b.alpha * (1 - b.see * 0.75);
      for (const m of b.mats) m.opacity = a * (m.userData.k as number);
    }
    const look = lookOf(this.terrain.biome(top - 10).id);
    const haze = look.haze;
    if (!haze) return;
    this.wait -= dt;
    if (this.wait > 0 || this.banks.length >= 3) return;
    const r = this.r;
    this.wait = (0.6 + r() * 0.8) / (haze.rate ?? 0.25);
    const y = FLIGHT_Y + 16 + r() * 8;
    const s = depthScale(y);
    const col = new THREE.Color(haze.color);
    const obj = new THREE.Group();
    const mats: THREE.SpriteMaterial[] = [];
    // a long bank of puffs, thicker in the middle, ragged at the ends
    const hw = 8 + r() * 8;
    const hd = 4 + r() * 4;
    const n = 7 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const u = (k / (n - 1)) * 2 - 1;
      const m = new THREE.SpriteMaterial({ map: PUFF, color: col.clone().multiplyScalar(0.85 + r() * 0.2), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
      if (haze.glow) m.blending = THREE.AdditiveBlending;
      m.userData.k = 0.6 + r() * 0.4;
      mats.push(m);
      const sp = new THREE.Sprite(m);
      const big = (1 - Math.abs(u) * 0.55) * (5 + r() * 5);
      sp.scale.set(big * 1.5, big, 1);
      sp.position.set(u * hw + (r() - 0.5) * 3, r() * 1.5, (r() - 0.5) * hd);
      sp.renderOrder = 40;
      obj.add(sp);
    }
    // off to a side, reaching a little way in (and not both sides at once, close together)
    const last = this.banks[this.banks.length - 1];
    const side = last && r() < 0.7 ? -Math.sign(last.x - view.x) || 1 : r() < 0.5 ? -1 : 1;
    const reach = 6 + r() * 12;
    // where it shows: just past the top of the screen, its inner end `reach` in from the side
    const sx = view.x + side * (halfW - reach + hw * s);
    const szf = top - hd * s - 2;
    this.group.add(obj);
    this.banks.push({ obj, mats, x: view.x + (sx - view.x) / s, zf: view.y + (szf - view.y) / s, y, hw, hd, alpha: haze.alpha ?? 0.4, see: 0 });
  }

  dispose() {
    for (const b of this.banks) for (const m of b.mats) m.dispose();
    this.banks = [];
    this.group.clear();
  }
}

/** A soft round puff, lighter on top: one texture for every cloud. */
export const PUFF = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  for (const [x, y, r, a] of [[32, 34, 26, 1], [22, 36, 16, 0.8], [42, 35, 16, 0.8], [32, 26, 18, 0.9]] as const) {
    const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(236,236,244,${a * 0.75})`);
    g.addColorStop(1, 'rgba(200,204,222,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
