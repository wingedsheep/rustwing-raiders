import * as THREE from 'three';
import type { Level } from '../sim/level';
import { ROLES, type Hauler } from '../sim/convoy';
import { FLIGHT_Y, fromFlight } from '../sim/types';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { HAULER_SKINS } from './ship-model';
import type { Fx } from './fx';
import { clamp, damp } from '../util';

/** The haulers fly a little under the fighters (they show where the sim has them on the screen). */
const HAUL_Y = FLIGHT_Y - 1.4;
const BLUE = new THREE.Color(0x8ad0ff);
const WAKE = new THREE.Color(0xc8ecff);
const HOT = new THREE.Color(2, 2, 2);
const FIRE = new THREE.Color(0xffd880);
const FIRE_DARK = new THREE.Color(0xb02a10);
const SMOKE = new THREE.Color(0x4a4040);
const SMOKE_END = new THREE.Color(0x2a2228);
const WELD = new THREE.Color(0xfff0c0);
const WELD_END = new THREE.Color(0xff7a2a);
const GLANCE = new THREE.Color(1.4, 1.6, 1.8);

interface Ship {
  h: Hauler;
  inst: Instance | null;
  obj: THREE.Object3D;
  /** Underneath: a soft ring in the convoy's colour, so you know it's yours. */
  halo: THREE.Mesh;
  bank: number;
  /** Hit reaction: a shove that springs back. */
  knock: number;
  gone: boolean;
}

interface Wreck {
  obj: THREE.Object3D;
  inst: Instance | null;
  x: number;
  y: number;
  z: number;
  vy: number;
  vx: number;
  spin: number;
  t: number;
  /** Blasts still to go off along it. */
  booms: number;
  boomT: number;
}

/**
 * Draws an escort's haulers: the freighters in their civilian paint, rolling on the air, engines
 * trailing pale blue; sparks and chips off them as they're hit, smoke and then fire as they're
 * worn down, a boarder's cutter throwing sparks where it clings. A lost one burns, breaks and
 * falls; a delivered one opens up its engines and leaves at the top of the screen.
 */
export class ConvoyView {
  readonly group = new THREE.Group();
  private ships: Ship[] = [];
  private wrecks: Wreck[] = [];
  private time = 0;
  private ringGeo = new THREE.RingGeometry(3.3, 3.8, 24);
  private c = new THREE.Color();
  private v = new THREE.Vector3();

  constructor(
    private lv: Level,
    private fx: Fx,
  ) {
    for (const h of lv.convoy?.haulers ?? []) {
      const inst = library.clone('hauler', h.variant, HAULER_SKINS[h.id], true);
      let obj: THREE.Object3D;
      if (inst) obj = inst.obj;
      else {
        obj = new THREE.Group();
        obj.add(part(GEO.box, toon(HAULER_SKINS[h.id][0]), [0, 0, 0], [3, 1, 7]));
      }
      obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      const halo = new THREE.Mesh(this.ringGeo, flat(new THREE.Color(ROLES[h.role].color).getHex(), { opacity: 0.22, own: true }));
      halo.rotation.x = -Math.PI / 2;
      halo.scale.set(0.8, 1.35, 1);
      halo.renderOrder = 2;
      this.group.add(obj, halo);
      this.ships.push({ h, inst, obj, halo, bank: 0, knock: 0, gone: false });
    }
  }

  /** Fire on a hull: sparks off it, a chip of its paint, and a jolt. Stray fire only glances off. */
  hit(id: number, x: number, z: number, dmg: number, cause: string) {
    const s = this.ships[id];
    if (!s) return;
    if (dmg < 1) {
      // a ricochet off the plating: a pale spark, no chips, no jolt
      this.fx.add({ x, y: FLIGHT_Y + 0.6, z, size: 0.7, grow: 0.6, life: 0.05, color: GLANCE, carried: true });
      this.fx.sparks(x, FLIGHT_Y + 0.4, z, 3, 0xd8ecff, 14, 0.14, 0.15);
      return;
    }
    s.knock = Math.min(1, s.knock + 0.25 * dmg);
    const y = FLIGHT_Y;
    this.fx.add({ x, y: y + 0.6, z, size: 1 + dmg * 0.4, grow: 0.5, life: 0.05, color: HOT, carried: true });
    this.fx.sparks(x, y + 0.4, z, 5 + dmg * 3, cause === 'laser' ? 0xffb0a0 : 0xffe0a0, 12, 0.22, 0.2);
    if (cause !== 'boarder' || Math.random() < 0.4) {
      const skin = HAULER_SKINS[id];
      for (let k = 0; k < 1 + dmg; k++) {
        const a = Math.random() * Math.PI * 2;
        this.fx.add({ x, y: y + 0.3, z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 4 + 3, vy: 4 + Math.random() * 4, size: 0.16 + Math.random() * 0.14, life: 1.4, color: this.c.setHex(Math.random() < 0.6 ? skin[0] : skin[1]), solid: true, gravity: 24, spin: 12 });
      }
    }
  }

  /** A boarder lands on the hull: a clang of sparks where it bit. */
  boarded(x: number, z: number) {
    this.fx.ring(x, FLIGHT_Y, z, 2.6, 0.2, true, 0xff6a4a);
    this.fx.sparks(x, FLIGHT_Y + 0.5, z, 12, 0xffc080, 16, 0.3, 0.2);
  }

  /** Lost: it goes up from the inside, breaks its back and falls burning. */
  lose(id: number) {
    const s = this.ships[id];
    if (!s || s.gone) return;
    s.gone = true;
    this.group.remove(s.halo);
    for (const m of s.inst?.mats ?? []) {
      m.color.multiplyScalar(0.35);
      m.emissive.setHex(0xff5a1a);
      m.emissiveIntensity = 0.6;
    }
    const p = s.obj.position;
    this.fx.explode(p.x, FLIGHT_Y, s.h.z, 3.2, 0xffa040, true);
    this.fx.ring(p.x, FLIGHT_Y, s.h.z, 16, 0.6, true, 0xffe0a0);
    this.fx.ring(p.x, FLIGHT_Y, s.h.z, 9, 0.4, true, 0x8ad0ff);
    // what it carried, flung out
    const skin = HAULER_SKINS[id];
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 6 + Math.random() * 14;
      this.fx.add({ x: p.x, y: FLIGHT_Y + 0.5, z: s.h.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 6 + Math.random() * 8, size: 0.3 + Math.random() * 0.45, life: 2.5 + Math.random(), color: this.c.setHex([skin[0], skin[1], 0xb8502e, 0xd8a43a, 0x2f8a8a][k % 5]).multiplyScalar(0.8), solid: true, gravity: 22, spin: 6 + Math.random() * 8 });
    }
    this.wrecks.push({ obj: s.obj, inst: s.inst, x: p.x, y: p.y, z: p.z, vy: 2, vx: (Math.random() - 0.5) * 3, spin: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.6), t: 0, booms: 4, boomT: 0.15 });
  }

  update(dt: number, scrollDz: number) {
    this.time += dt;
    const lv = this.lv;
    const over = lv.state === 'clear';
    for (const s of this.ships) {
      if (s.gone) continue;
      const h = s.h;
      s.inst?.update(dt);
      s.knock = Math.max(0, s.knock - dt * 4);
      const gz = fromFlight(h.z, HAUL_Y);
      s.obj.position.set(h.x, HAUL_Y, gz - s.knock * 0.6);
      s.bank = damp(s.bank, clamp(-h.vx / 14, -0.35, 0.35), 4, dt);
      s.obj.rotation.z = s.bank + (h.boarders ? Math.sin(this.time * 31) * 0.03 : 0);
      s.obj.rotation.x = over ? -0.12 : 0;
      s.halo.position.set(h.x, HAUL_Y - 0.9, gz);
      const hm = s.halo.material as THREE.MeshBasicMaterial;
      // its role's colour (the prize's gold breathes), red while it's boarded
      const prize = h.role === 'prize';
      hm.opacity = over ? 0 : h.boarders ? 0.3 + 0.2 * Math.sin(this.time * 14) : prize ? 0.24 + 0.1 * Math.sin(this.time * 3) : 0.18;
      if (h.boarders) hm.color.setHex(0xff6a4a);
      else hm.color.set(ROLES[h.role].color);
      // hit: a flash; worn down: it smokes, then burns
      const flash = h.hitT < 0.06 ? 0.8 : h.boarders ? 0.15 + 0.15 * Math.sin(this.time * 20) : 0;
      s.inst?.flash(flash);
      const worn = 1 - h.hp / h.max;
      if (worn > 0.4 && Math.random() < worn * 0.5)
        this.fx.add({ x: h.x + (Math.random() - 0.5) * 2, y: FLIGHT_Y + 0.4, z: h.z + (Math.random() - 0.2) * 3, vy: 2, vz: 6, size: 0.7, grow: 2.6, life: 0.9, color: SMOKE, to: SMOKE_END, glow: false, carried: true });
      if (worn > 0.7 && Math.random() < 0.5)
        this.fx.add({ x: h.x + (Math.random() - 0.5) * 2, y: FLIGHT_Y + 0.6, z: h.z + (Math.random() - 0.5) * 3, vy: 3, vz: 3, size: 0.6, grow: 1.4, life: 0.3, color: FIRE, to: FIRE_DARK, carried: true });
      // the engines' wake, pale blue; wide open on the way home
      const burn = over ? 1 : 0;
      for (const sx of [-1.55, 1.55])
        if (Math.random() < 0.3 + burn * 0.7)
          this.fx.add({ x: h.x + sx + (Math.random() - 0.5) * 0.3, y: HAUL_Y - 0.1, z: h.z + 3.4, vz: 5 + burn * 24, size: 0.3 + burn * 0.6, grow: 1.2, life: 0.14 + burn * 0.3, color: this.c.copy(Math.random() < 0.3 ? WAKE : BLUE).multiplyScalar(0.55 + burn * 0.45), carried: true });
    }
    // boarders cutting in: a fountain of sparks off each one on a hull
    for (const e of lv.enemies) {
      if (e.dead || e.d.board === undefined || e.d.ph !== 3) continue;
      if (Math.random() < 0.7)
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.3, z: e.z, vx: Math.cos(a) * 8, vz: Math.sin(a) * 6, vy: 3 + Math.random() * 4, gravity: 22, size: 0.14, grow: 0.3, life: 0.3, drag: 3, color: WELD, to: WELD_END, carried: true });
        }
    }
    this.updateWrecks(dt, scrollDz);
  }

  private updateWrecks(dt: number, scrollDz: number) {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      // (it was flying with the screen: it keeps that way a while, then the sky lets go of it)
      w.z += scrollDz * Math.max(0, 1 - w.t * 0.8);
      w.vy -= 14 * dt;
      w.y += w.vy * dt;
      w.x += w.vx * dt;
      w.obj.rotation.z += w.spin * dt;
      w.obj.rotation.x += w.spin * 0.3 * dt;
      w.obj.position.set(w.x, w.y, w.z);
      for (const m of w.inst?.mats ?? []) m.emissiveIntensity = Math.max(0, 0.6 - w.t * 0.2) * (0.8 + Math.random() * 0.4);
      // blasts down its length, then a trail of fire and black smoke
      if (w.booms > 0 && (w.boomT -= dt) <= 0) {
        w.booms--;
        w.boomT = 0.18 + Math.random() * 0.15;
        this.v.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 6);
        this.fx.explode(w.x + this.v.x, w.y + this.v.y, w.z + this.v.z, 1.4, 0xffb040, false);
        this.fx.add({ x: w.x + this.v.x, y: w.y + 1, z: w.z + this.v.z, size: 5, grow: 1.3, life: 0.07, color: HOT, carried: false });
      }
      this.fx.add({ x: w.x + (Math.random() - 0.5) * 2, y: w.y, z: w.z + (Math.random() - 0.5) * 4, vy: 1, size: 1.1, grow: 0.4, life: 0.25, color: FIRE, to: FIRE_DARK, carried: false });
      if (Math.random() < 0.6) this.fx.add({ x: w.x, y: w.y + 0.5, z: w.z, vy: 1.5, size: 0.9, grow: 3, life: 1.2, color: SMOKE, to: SMOKE_END, glow: false, carried: false });
      const g = this.fx.ground(w.x, w.z);
      if (w.y <= g + 0.4 || w.t > 6) {
        this.fx.explode(w.x, g, w.z, 2.6, 0xff8a3a, false);
        this.fx.ring(w.x, g + 0.1, w.z, 10, 0.6, false, 0xffe0a0);
        this.group.remove(w.obj);
        w.inst?.dispose();
        this.wrecks.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const s of this.ships) s.inst?.dispose();
    for (const w of this.wrecks) w.inst?.dispose();
    this.ringGeo.dispose();
  }
}
