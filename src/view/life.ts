import * as THREE from 'three';
import type { Level } from '../sim/level';
import type { Biome } from '../world/planets';
import { FLIGHT_Y } from '../sim/types';
import { toon } from '../render/toon';
import { weather } from '../render/alive';
import type { Fx } from './fx';

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

export class Life {
  private flocks: Flock[] = [];
  private flockT = 3;
  private fishT = 1;
  private sprayT = 0;

  constructor(
    private scene: THREE.Scene,
    private fx: Fx,
  ) {}

  update(dt: number, lv: Level, halfW: number) {
    const b = lv.terrain.biome(lv.scroll);
    this.birds(dt, lv, b, halfW);
    this.fish(dt, lv, halfW);
    this.spray(dt, lv);
  }

  private birds(dt: number, lv: Level, b: Biome, halfW: number) {
    this.flockT -= dt;
    if (this.flockT <= 0 && birdy(b) && this.flocks.length < 3) {
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
    for (const f of this.flocks) for (const b of f.birds) this.scene.remove(b.obj);
    this.flocks = [];
  }
}

const SPRAY = new THREE.Color(0xeaf4f8);
const FOAM = new THREE.Color(0xa8c8d0);
