import * as THREE from 'three';
import type { Level } from '../sim/level';
import type { Biome } from '../world/planets';
import { FLIGHT_Y } from '../sim/types';
import { toon } from '../render/toon';
import { weather } from '../render/alive';
import type { Fx } from './fx';
import { library, type Instance } from '../render/assets';

/**
 * The small things that make a place look lived in, none of which the sim knows about: flocks of
 * birds crossing low over the land (with their shadows), fish jumping in the shallows, and the
 * spray your engines kick up when you skim low over water.
 */

interface Bird {
  obj: THREE.Group;
  wings: THREE.Mesh[];
  phase: number;
  ox: number;
  oz: number;
}

interface Flock {
  birds: Bird[];
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
}

/** A bird: a body and two wings that beat. Seen from above it's a little flickering V. */
const WING = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.22, 0.75, 0, 0.12], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  return g;
})();
const BODY = new THREE.BoxGeometry(0.16, 0.12, 0.55);

/** Biomes where birds would live: something grows or there's open water, and it's not burning. */
function birdy(b: Biome) {
  if (b.waterGlow && b.waterGlow >= 1) return false;
  if (b.particles === 'ash' || b.particles === 'embers') return false;
  return true;
}

/** Something huge, drifting by under you now and then: the planet's wonders. */
interface Giant {
  inst: Instance;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  t: number;
}

/** How much of a fight is on (0 calm, 1 hot): the air, the clouds and the flocks thin out with it. */
export const busy = (lv: Level) => Math.min(1, lv.bullets.length / 24 + lv.enemies.length / 10);

export class Life {
  private flocks: Flock[] = [];
  private giants: Giant[] = [];
  private giantT = 12 + Math.random() * 10;
  private flockT = 3;
  private fishT = 1;
  private sprayT = 0;
  /** The clock the placed effects turn on. */
  private placeT = 0;

  constructor(
    private scene: THREE.Scene,
    private fx: Fx,
  ) {}

  update(dt: number, lv: Level, halfW: number) {
    const b = lv.terrain.biome(lv.scroll);
    this.birds(dt, lv, b, halfW);
    this.wonders(dt, lv, b, halfW);
    this.fish(dt, lv, halfW);
    this.spray(dt, lv);
    this.placed(dt, lv);
  }

  /**
   * The place's own effects, where its layout put them (sim/layout.ts, Emitter): dust streaming
   * off a rim, a dust devil turning out in the open, smoke over a camp, stones trickling down a
   * face. Soft, dim and slow, never a bright speck that could be a shot, and thinner while a fight
   * is on.
   */
  private placed(dt: number, lv: Level) {
    const t = lv.terrain;
    const quiet = 1 - 0.6 * busy(lv);
    const wind = weather.uWindDir.value;
    this.placeT += dt;
    const roll = (rate: number) => Math.random() < rate * dt * quiet;
    for (const e of t.emitters(lv.bottom + 8, lv.top - 12)) {
      const b = t.biome(e.z);
      switch (e.kind) {
        case 'dust': {
          // a sheet of dust lifted off the lip, blown out over the drop and gone
          if (!roll(2.2)) break;
          const z = e.z + (Math.random() - 0.5) * 6;
          const h = t.height(e.x, z);
          this.fx.add({ x: e.x + e.side * 0.5, y: h + 0.4, z, vx: -e.side * (2.5 + Math.random() * 2) + wind.x * 0.5, vy: -0.4, vz: 0.8 + wind.y * 0.5, size: 0.8 + Math.random() * 0.4, grow: 2, life: 1.4, glow: false, color: tone(b.ground[3], 0.85), to: tone(b.ground[2]) });
          break;
        }
        case 'devil': {
          // a column of dust wandering slowly over the floor, turning, narrow at its foot
          const cx = e.x + Math.sin(this.placeT * 0.23 + e.z) * 5;
          const cz = e.z + Math.cos(this.placeT * 0.17 + e.z) * 4;
          for (let k = 0; k < 3; k++) {
            if (!roll(10)) continue;
            const a = this.placeT * 7 + Math.random() * Math.PI * 2;
            const rr = 0.4 + Math.random() * 0.5;
            const y = t.height(cx, cz) + 0.2;
            const up = 2.6 + Math.random() * 1.6;
            this.fx.add({ x: cx + Math.cos(a) * rr, y, z: cz + Math.sin(a) * rr, vx: -Math.sin(a) * 2.2 + Math.cos(a) * 0.6 + wind.x * 0.4, vy: up, vz: Math.cos(a) * 2.2 + Math.sin(a) * 0.6 + wind.y * 0.4, size: 0.7 + Math.random() * 0.4, grow: 3.2, life: 1.9, glow: false, color: tone(b.ground[2], 0.92), to: tone(b.ground[1]) });
          }
          break;
        }
        case 'smoke': {
          // a cook fire or a burning drum: a thin dark thread leaning with the wind
          if (!roll(4)) break;
          const y = t.height(e.x, e.z) + 2.5;
          this.fx.add({ x: e.x + (Math.random() - 0.5) * 0.6, y, z: e.z, vx: wind.x * 0.8, vy: 2.2, vz: wind.y * 0.8, size: 0.7, grow: 3.4, life: 2.6, glow: false, color: SMOKE, to: SMOKE_END });
          break;
        }
        case 'trickle': {
          // now and then a few stones come off the face, a puff where they leave it
          if (!roll(0.5)) break;
          const z = e.z + (Math.random() - 0.5) * 4;
          const top = Math.max(t.height(e.x + e.side * 3, z), 6);
          for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++)
            this.fx.add({ x: e.x + e.side * (2 + Math.random()), y: top - Math.random(), z: z + (Math.random() - 0.5), vx: -e.side * (0.8 + Math.random()), vy: -1, gravity: 22, size: 0.22 + Math.random() * 0.18, life: 1.1, solid: true, spin: 6, color: tone(b.cliff, 0.7) });
          this.fx.add({ x: e.x + e.side * 2, y: top, z, vx: -e.side, vy: -0.5, size: 0.9, grow: 2.2, life: 1.2, glow: false, color: tone(b.ground[3], 0.8), to: tone(b.ground[2]) });
          break;
        }
      }
    }
  }

  private birds(dt: number, lv: Level, b: Biome, halfW: number) {
    this.flockT -= dt;
    if (this.flockT <= 0 && birdy(b) && this.flocks.length < (busy(lv) > 0.5 ? 1 : 3)) {
      this.flockT = 5 + Math.random() * 9;
      // in from one side, crossing with the wind, low over the land
      const side = Math.random() < 0.5 ? -1 : 1;
      const n = 4 + Math.floor(Math.random() * 7);
      const col = new THREE.Color(b.cliff).lerp(new THREE.Color(0x2a2430), 0.5);
      const mat = toon(col);
      const birds: Bird[] = [];
      for (let k = 0; k < n; k++) {
        const obj = new THREE.Group();
        const body = new THREE.Mesh(BODY, mat);
        const l = new THREE.Mesh(WING, mat);
        const r = new THREE.Mesh(WING, mat);
        r.scale.x = -1;
        for (const m of [body, l, r]) m.castShadow = true;
        obj.add(body, l, r);
        obj.scale.setScalar(1.6 + Math.random() * 0.6);
        this.scene.add(obj);
        // a loose V
        const row = Math.ceil(k / 2);
        birds.push({ obj, wings: [l, r], phase: Math.random() * 6, ox: (k % 2 ? -1 : 1) * row * 1.6 + (Math.random() - 0.5), oz: row * 1.4 + (Math.random() - 0.5) });
      }
      const speed = 5 + Math.random() * 4;
      const ang = (side < 0 ? 0.35 : Math.PI - 0.35) + (Math.random() - 0.5) * 0.8;
      this.flocks.push({
        birds,
        x: side * (halfW + 10),
        y: 4.5 + Math.random() * 3,
        z: lv.scroll + (Math.random() - 0.7) * 40,
        vx: Math.cos(ang) * speed,
        vz: -Math.abs(Math.sin(ang)) * speed * 0.6 - 1,
        t: 0,
      });
    }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.t += dt;
      f.x += f.vx * dt;
      f.z += f.vz * dt;
      const heading = Math.atan2(f.vx, f.vz);
      const c = Math.cos(heading);
      const s = Math.sin(heading);
      for (const bd of f.birds) {
        bd.phase += dt * 9;
        // flap, then glide a beat
        const flap = Math.sin(bd.phase) * (Math.sin(bd.phase * 0.21) > -0.3 ? 0.9 : 0.15);
        bd.wings[0].rotation.z = flap;
        bd.wings[1].rotation.z = -flap;
        // the V trails behind the leader, turned with the heading
        const bx = f.x - (bd.ox * c + bd.oz * s);
        const bz = f.z - (-bd.ox * s + bd.oz * c);
        bd.obj.position.set(bx, f.y + Math.sin(bd.phase * 0.3) * 0.2, bz);
        bd.obj.rotation.y = heading;
      }
      if (Math.abs(f.x) > halfW + 30 || f.z < lv.top - 60 || f.z > lv.bottom + 30) {
        for (const bd of f.birds) this.scene.remove(bd.obj);
        this.flocks.splice(i, 1);
      }
    }
  }

  /** Every half a minute or so where there's life, a herd of drift-calves floats across, low and slow. */
  private wonders(dt: number, lv: Level, b: Biome, halfW: number) {
    this.giantT -= dt;
    if (this.giantT <= 0 && birdy(b) && !this.giants.length) {
      this.giantT = 25 + Math.random() * 25;
      const side = Math.random() < 0.5 ? -1 : 1;
      const n = 1 + Math.floor(Math.random() * 3);
      const speed = 3 + Math.random() * 2;
      for (let k = 0; k < n; k++) {
        const inst = library.clone('sky_whale');
        if (!inst) break;
        inst.obj.scale.setScalar(k === 0 ? 1.3 : 0.6 + Math.random() * 0.3);
        inst.obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
        this.scene.add(inst.obj);
        this.giants.push({ inst, x: side * (halfW + 16 + k * 7), y: 3.5 + k * 0.6, z: lv.scroll - 30 + k * 6 + Math.random() * 6, vx: -side * speed, vz: -speed * 0.35, t: Math.random() * 6 });
      }
    }
    for (let i = this.giants.length - 1; i >= 0; i--) {
      const g = this.giants[i];
      g.t += dt;
      g.x += g.vx * dt;
      g.z += g.vz * dt;
      g.inst.update(dt);
      g.inst.obj.position.set(g.x, g.y + Math.sin(g.t * 0.6) * 0.4, g.z);
      // (the models face -z)
      g.inst.obj.rotation.set(Math.sin(g.t * 0.6) * 0.05, Math.atan2(g.vx, g.vz) + Math.PI, Math.sin(g.t * 0.4) * 0.06);
      if (Math.abs(g.x) > halfW + 50 || g.z > lv.bottom + 40) {
        this.scene.remove(g.inst.obj);
        g.inst.dispose();
        this.giants.splice(i, 1);
      }
    }
  }

  /** Now and then something leaps out of the water and falls back in. */
  private fish(dt: number, lv: Level, halfW: number) {
    this.fishT -= dt;
    if (this.fishT > 0) return;
    this.fishT = 0.4 + Math.random() * 1.6;
    const x = (Math.random() * 2 - 1) * halfW;
    const z = lv.scroll + (Math.random() - 0.6) * 50;
    const w = lv.terrain.water(z);
    if (w === -Infinity) return;
    const b = lv.terrain.biome(z);
    if (b.waterGlow && b.waterGlow >= 1) return;
    if (lv.terrain.height(x, z) > w - 1) return; // not deep enough
    const dir = Math.random() * Math.PI * 2;
    const glint = new THREE.Color(0xd8e8f0);
    // the fish: a few bright sparks in an arc; the splash: a ring and droplets
    this.fx.add({ x, y: w + 0.2, z, vx: Math.cos(dir) * 3, vz: Math.sin(dir) * 3, vy: 6, gravity: 16, size: 0.35, life: 0.7, color: glint, glow: false });
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({ x, y: w + 0.1, z, vx: Math.cos(a) * 2, vz: Math.sin(a) * 2, vy: 3 + Math.random() * 2, gravity: 14, size: 0.18, life: 0.5, color: SPRAY, glow: false });
    }
    this.fx.ring(x, w + 0.05, z, 1.4, 0.6, false, 0xe8f4f8);
  }

  /** Engines low over water whip up a spray, more the faster you go. */
  private spray(dt: number, lv: Level) {
    this.sprayT += dt;
    if (this.sprayT < 0.03) return;
    this.sprayT = 0;
    for (const p of lv.players) {
      if (p.down) continue;
      // the water straight below the ship on the flight plane
      const w = lv.terrain.water(p.z);
      if (w === -Infinity || lv.terrain.height(p.x, p.z) > w) continue;
      const b = lv.terrain.biome(p.z);
      if (b.waterGlow && b.waterGlow >= 1) continue;
      const speed = Math.hypot(p.vx, p.vz) / Math.max(1, p.stats.speed);
      const n = 1 + Math.round(speed * 2);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.add({ x: p.x + Math.cos(a) * 1.2, y: w + 0.1, z: p.z + Math.sin(a) * 1.2 + 0.8, vx: Math.cos(a) * 3 + weather.uWindDir.value.x, vz: Math.sin(a) * 2 + 5, vy: 2 + Math.random() * 2, gravity: 8, size: 0.25, grow: 2.2, life: 0.45, color: SPRAY, to: FOAM, carried: true, glow: false });
      }
    }
    void FLIGHT_Y;
  }

  dispose() {
    for (const g of this.giants) {
      this.scene.remove(g.inst.obj);
      g.inst.dispose();
    }
    this.giants = [];
    for (const f of this.flocks) for (const b of f.birds) this.scene.remove(b.obj);
    this.flocks = [];
  }
}

const SPRAY = new THREE.Color(0xeaf4f8);
/** A colour of the place's, shaded, kept (fx.add holds on to a particle's `to`). */
const tones = new Map<number, THREE.Color>();
const tone = (hex: number, k = 1) => {
  const key = hex * 64 + Math.round(k * 32);
  let c = tones.get(key);
  if (!c) tones.set(key, (c = new THREE.Color(hex).multiplyScalar(k)));
  return c;
};
const SMOKE = new THREE.Color(0x4a3a34);
const SMOKE_END = new THREE.Color(0x8a7a70);
const FOAM = new THREE.Color(0xa8c8d0);
