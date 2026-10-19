import * as THREE from 'three';
import type { Level } from '../sim/level';
import { RUNNER, WASH as WASH_ZONE, type Heist } from '../sim/heist';
import { FLIGHT_Y, fromFlight } from '../sim/types';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import type { Fx } from './fx';
import { clamp, damp } from '../util';

/** The runner flies a little under the fighters, as the haulers do (it shows where the sim has it). */
const RUN_Y = FLIGHT_Y - 1.4;
const HOT = new THREE.Color(2, 2, 2);
const FIRE = new THREE.Color(0xffd880);
const FIRE_DARK = new THREE.Color(0xb02a10);
const SMOKE = new THREE.Color(0x4a4040);
const SMOKE_END = new THREE.Color(0x2a2228);
const WASH = new THREE.Color(0xffe8a0);
const WASH_END = new THREE.Color(0xff6a2a);
const DRIVE = new THREE.Color(0x8af0ff);
const GOLD = new THREE.Color(0xffd060);
const TEAL = 0x5ae0c0;

interface Part {
  inst: Instance | null;
  obj: THREE.Object3D;
  /** Burnt out (engines, turrets): it stays on the hull, black and smoking. */
  dead: boolean;
}

interface Falling {
  id: number;
  inst: Instance | null;
  obj: THREE.Object3D;
  /** Its beacon: a ring under it in the heist's colour, so you can see where to go. */
  halo: THREE.Mesh;
  roll: number;
  gone: boolean;
}

/**
 * Draws a heist's runner: the freighter in its owner's colours, its three gold strongboxes in their
 * cradles, its turrets tracking you, its engines' wash a long cone of fire behind each. Parts shot
 * out burn black where they sit; a strongbox shot loose drops back down the screen on its drogue,
 * ringed in teal till it's caught. As it spools its jump drive its vanes light up cold blue; then
 * it stretches and is gone. Taken down, it goes up along its length and falls.
 */
export class HeistView {
  readonly group = new THREE.Group();
  private rig = new THREE.Group();
  private hull: Instance | null;
  private pods: Part[] = [];
  private engines: Part[] = [];
  private turrets: Part[] = [];
  /** The bridge's shield while it's up: a pale dome that ripples when it's hit. */
  private dome: THREE.Mesh;
  private domeHit = 0;
  /** The wash behind each engine: a long, flickering cone. */
  private plumes: THREE.Mesh[] = [];
  private falling: Falling[] = [];
  private time = 0;
  private bank = 0;
  /** Taken down: its fall (null while it flies). */
  private wreck: { y: number; vy: number; spin: number; t: number; booms: number; boomT: number } | null = null;
  private haloGeo = new THREE.RingGeometry(2.1, 2.6, 20);
  private c = new THREE.Color();

  constructor(
    private lv: Level,
    private h: Heist,
    private fx: Fx,
  ) {
    const skin = h.core.skin.colors;
    this.hull = library.clone('runner', 0, skin, true);
    const body = this.hull?.obj ?? part(GEO.box, toon(skin[0]), [0, 0, 0], [5.6, 1.4, 15]);
    this.rig.add(body);
    const add = (kind: string, at: { x: number; y: number; z: number }) => {
      const inst = library.clone(kind, 0, skin, true);
      const obj = inst?.obj ?? part(GEO.box, toon(kind === 'runner_pod' ? 0xd8a43a : skin[1]), [0, 0, 0], [1.6, 1.4, 2.6]);
      obj.position.set(at.x, at.y, at.z);
      this.rig.add(obj);
      return { inst, obj, dead: false };
    };
    RUNNER.pods.forEach((p) => {
      const pt = add('runner_pod', p);
      const chute = pt.obj.getObjectByName('runner_pod_chute');
      if (chute) chute.visible = false;
      this.pods.push(pt);
    });
    RUNNER.engines.forEach((p) => this.engines.push(add('runner_engine', { x: p.x, y: -0.1, z: p.z })));
    RUNNER.turrets.forEach((p) => this.turrets.push(add('runner_turret', { x: p.x, y: 0.6, z: p.z })));
    this.rig.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
    // the dome over the bridge
    this.dome = new THREE.Mesh(GEO.sphere, flat(0x9ae8ff, { own: true, opacity: 0.18, additive: true }));
    this.dome.scale.set(5.4, 2.6, 4.6);
    this.dome.position.set(RUNNER.core.x, 0.9, RUNNER.core.z);
    this.rig.add(this.dome);
    // the wash: cones pointing down the screen from each nozzle
    for (const p of RUNNER.engines) {
      const m = new THREE.Mesh(GEO.cone, flat(0xffb050, { own: true, opacity: 0.5, additive: true }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, -0.1, p.z + WASH_ZONE.from + WASH_ZONE.len / 2);
      m.scale.set(WASH_ZONE.half * 2.4, WASH_ZONE.len + 1, 1.2);
      this.rig.add(m);
      this.plumes.push(m);
    }
    this.group.add(this.rig);
    this.place(0);
  }

  /** Where the sim has it, on the screen. */
  private place(dt: number) {
    const h = this.h;
    this.bank = damp(this.bank, clamp(-h.vx / 18, -0.22, 0.22), 3, dt || 1);
    this.rig.position.set(h.x, RUN_Y, fromFlight(h.z, RUN_Y));
    this.rig.rotation.z = this.bank + Math.sin(this.time * 23) * 0.04 * h.lurch;
    this.rig.rotation.x = -0.08 * h.lurch;
  }

  /** A shot sparking off the bridge's shield. */
  armour(x: number, z: number) {
    this.fx.sparks(x, FLIGHT_Y + 0.4, z, 3, 0xffe0b0, 12, 0.14, 0.18);
    this.fx.add({ x, y: FLIGHT_Y + 0.6, z, size: 0.7, grow: 0.5, life: 0.05, color: HOT, carried: true });
    // on the bridge's dome: a ripple
    const c = this.h.core;
    if (c.shielded && (x - c.x) ** 2 + (z - c.z) ** 2 < 9) this.domeHit = 1;
  }

  /** A strongbox's clamps blown: its cradle empties and it's off on its drogue. */
  loose(id: number) {
    const p = this.pods[id];
    if (!p || p.dead) return;
    p.dead = true;
    p.obj.visible = false;
    const inst = library.clone('runner_pod', 0, undefined, true);
    const obj = inst?.obj ?? part(GEO.box, toon(0xd8a43a), [0, 0, 0], [1.6, 1.4, 2.6]);
    obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
    // (a touch bigger than in its cradle: it's what you're after, among everything else on screen)
    obj.scale.setScalar(1.25);
    const halo = new THREE.Mesh(this.haloGeo, flat(TEAL, { own: true, opacity: 0.5, additive: true }));
    halo.rotation.x = -Math.PI / 2;
    this.group.add(obj, halo);
    this.falling.push({ id, inst, obj, halo, roll: 0, gone: false });
    const at = this.worldOf(RUNNER.pods[id]);
    // the clamps going: a bang, bolts flying, and a puff of the drogue opening
    this.fx.ring(at.x, FLIGHT_Y, at.z, 6, 0.3, true, 0xffe08a);
    this.fx.sparks(at.x, FLIGHT_Y + 0.5, at.z, 18, 0xffd890, 16, 0.35, 0.22);
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2;
      this.fx.add({ x: at.x, y: FLIGHT_Y + 0.4, z: at.z, vx: Math.cos(a) * 9, vz: Math.sin(a) * 7, vy: 5 + Math.random() * 4, size: 0.18, life: 1.4, color: this.c.setHex(0x5c626c), solid: true, gravity: 24, spin: 14 });
    }
  }

  /** Caught: a burst of gold, and it's in the hold. */
  caught(id: number, x: number, z: number) {
    const f = this.falling.find((o) => o.id === id && !o.gone);
    if (f) this.drop(f);
    this.fx.ring(x, FLIGHT_Y, z, 8, 0.4, true, 0xffe08a);
    this.fx.ring(x, FLIGHT_Y, z, 4, 0.25, true, TEAL);
    this.fx.sparks(x, FLIGHT_Y + 0.6, z, 30, 0xffd060, 20, 0.6, 0.3);
    this.fx.add({ x, y: FLIGHT_Y + 1, z, size: 5, grow: 0.6, life: 0.08, color: GOLD, carried: true });
  }

  /** Dropped past you: it tumbles away under the screen's edge. */
  fell(id: number) {
    const f = this.falling.find((o) => o.id === id && !o.gone);
    if (f) this.drop(f);
  }

  private drop(f: Falling) {
    f.gone = true;
    this.group.remove(f.obj, f.halo);
    f.inst?.dispose();
    (f.halo.material as THREE.Material).dispose();
  }

  /** An engine shot out: it goes up, then burns black on its pylon; its wash dies. */
  engineOut(k: number) {
    const e = this.engines[k];
    if (!e || e.dead) return;
    e.dead = true;
    this.char(e);
    const flame = e.obj.getObjectByName('runner_engine_flame');
    if (flame) flame.visible = false;
    this.plumes[k].visible = false;
    const at = this.worldOf(RUNNER.engines[k]);
    this.fx.ring(at.x, FLIGHT_Y, at.z, 14, 0.5, true, 0xffe0a0);
  }

  turretOut(k: number) {
    const t = this.turrets[k];
    if (!t || t.dead) return;
    t.dead = true;
    this.char(t);
    t.obj.rotation.x = 0.35;
    t.obj.position.y -= 0.3;
  }

  /** The bridge's shield fails: the dome shatters into motes. */
  exposed() {
    this.dome.visible = false;
    const at = this.worldOf(RUNNER.core);
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 6 + Math.random() * 12;
      this.fx.add({ x: at.x + Math.cos(a) * 2.4, y: FLIGHT_Y + 1, z: at.z + Math.sin(a) * 2, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 4, size: 0.3, grow: 0.2, life: 0.5 + Math.random() * 0.4, drag: 3, color: DRIVE, carried: true });
    }
    this.fx.ring(at.x, FLIGHT_Y, at.z, 10, 0.4, true, 0x9ae8ff);
  }

  /** The jump: a flare of cold light, and it's gone. */
  jump() {
    const h = this.h;
    this.fx.ring(h.x, FLIGHT_Y, h.z, 26, 0.6, true, 0x8af0ff);
    this.fx.ring(h.x, FLIGHT_Y, h.z, 14, 0.4, true, 0xffffff);
    this.fx.add({ x: h.x, y: FLIGHT_Y + 2, z: h.z, size: 22, grow: 0.4, life: 0.15, color: HOT, carried: true });
    for (let k = 0; k < 40; k++)
      this.fx.add({ x: h.x + (Math.random() - 0.5) * 6, y: FLIGHT_Y + 0.5, z: h.z + (Math.random() - 0.5) * 14, vz: 30 + Math.random() * 30, size: 0.25, grow: 0.2, life: 0.4 + Math.random() * 0.3, drag: 2, color: DRIVE, carried: true });
  }

  /** Taken down: blasts along its length, then it drops out of the sky burning. */
  down() {
    this.dome.visible = false;
    for (const p of this.plumes) p.visible = false;
    for (const m of this.hull?.mats ?? []) {
      m.color.multiplyScalar(0.4);
      m.emissive.setHex(0xff5a1a);
      m.emissiveIntensity = 0.5;
    }
    for (const e of [...this.engines, ...this.turrets]) if (!e.dead) this.char(e);
    this.wreck = { y: RUN_Y, vy: 1, spin: (Math.random() < 0.5 ? -1 : 1) * 0.35, t: 0, booms: 9, boomT: 0 };
  }

  private char(p: Part) {
    for (const m of p.inst?.mats ?? []) {
      m.color.multiplyScalar(0.3);
      m.emissive.setHex(0xff4a10);
      m.emissiveIntensity = 0.35;
    }
  }

  /** A spot on the runner (its own x and z) on the flight plane. */
  private worldOf(p: { x: number; z: number }) {
    return { x: this.h.x + p.x, z: this.h.z + p.z };
  }

  update(dt: number, scrollDz: number) {
    this.time += dt;
    const h = this.h;
    const lv = this.lv;
    this.hull?.update(dt);
    for (const p of [...this.pods, ...this.engines, ...this.turrets]) p.inst?.update(dt);
    if (this.wreck) this.updateWreck(dt, scrollDz);
    else if (h.state === 'jumped') {
      // stretched thin and away
      const k = Math.min(1, h.stateT * 3);
      this.rig.scale.set(1 - k * 0.6, 1, 1 + k * 4);
      this.rig.position.set(h.x, RUN_Y, fromFlight(h.z, RUN_Y));
      if (h.stateT > 0.5) this.rig.visible = false;
    } else this.place(dt);
    this.updateParts();
    this.updateFalling(dt);
    if (h.gone) return;
    // the wash: flickering, and fire streaming back off it
    this.plumes.forEach((m, k) => {
      if (!m.visible) return;
      const f = 1 + Math.sin(this.time * 37 + k * 2) * 0.06 + Math.sin(this.time * 13 + k) * 0.05;
      m.scale.set(WASH_ZONE.half * 2.4 * f, (WASH_ZONE.len + 1) * f, 1.2);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.42 + 0.12 * Math.sin(this.time * 29 + k);
      const at = this.worldOf(RUNNER.engines[k]);
      if (Math.random() < 0.8)
        this.fx.add({ x: at.x + (Math.random() - 0.5) * 1.4, y: FLIGHT_Y - 1.2, z: at.z + 2.4, vz: 22 + Math.random() * 10, vx: (Math.random() - 0.5) * 2, size: 0.6 + Math.random() * 0.4, grow: 1.8, life: 0.3, color: WASH, to: WASH_END, carried: true });
    });
    // the dome over the bridge breathes, and ripples where it's hit
    if (this.dome.visible) {
      this.domeHit = Math.max(0, this.domeHit - dt * 4);
      const dm = this.dome.material as THREE.MeshBasicMaterial;
      dm.opacity = 0.12 + 0.05 * Math.sin(this.time * 3) + this.domeHit * 0.35;
      const s = 1 + this.domeHit * 0.06;
      this.dome.scale.set(5.4 * s, 2.6 * s, 4.6 * s);
    }
    // spooling: the vanes and drive light up, faster and brighter, and cold motes are drawn in
    const spool = h.state === 'spool' ? clamp(h.stateT / 9, 0, 1) : 0;
    if (this.hull) {
      // hit on the bridge: a flicker through the hull (the glow is put back over it, below)
      this.hull.flash(h.core.flash > 0 ? 0.2 : 0);
      // the bridge, open to fire: its windows and seams throb red; spooling, they burn cold blue
      const open = !h.core.shielded && !h.core.dead;
      for (const m of this.hull.mats) {
        if (m.userData.skin !== 'c') continue;
        if (spool > 0) {
          m.emissive.copy(DRIVE);
          m.emissiveIntensity = 0.6 + spool * 1.4 + 0.5 * Math.sin(this.time * (6 + spool * 30));
        } else if (open) {
          m.emissive.setHex(0xff3a2a);
          m.emissiveIntensity = 0.8 + 0.6 * Math.sin(this.time * 9);
        }
      }
    }
    if (spool > 0 && Math.random() < 0.3 + spool) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 6;
      this.fx.add({ x: h.x + Math.cos(a) * r, y: FLIGHT_Y, z: h.z + Math.sin(a) * r, vx: -Math.cos(a) * r * 1.6, vz: -Math.sin(a) * r * 1.6, size: 0.3, grow: 0.3, life: 0.6, color: DRIVE, carried: true });
    }
    // hurt: it smokes from the middle, and from wherever it's been opened up
    if (h.running < 2 && Math.random() < 0.4)
      this.fx.add({ x: h.x + (Math.random() - 0.5) * 3, y: FLIGHT_Y + 0.4, z: h.z + (Math.random() - 0.5) * 6, vy: 2, vz: 7, size: 0.9, grow: 2.6, life: 1, color: SMOKE, to: SMOKE_END, glow: false, carried: true });
    void lv;
  }

  /** Parts: flashing when hit, the turrets tracking, the burnt-out ones smoking. */
  private updateParts() {
    const h = this.h;
    const glow = (e: { flash: number; state: string; stateT: number; stateDur: number; taken: number }) => {
      if (e.flash > 0) return 1;
      if (e.state === 'windup' && e.stateDur > 0) {
        const k = clamp(e.stateT / e.stateDur, 0, 1);
        return k > 0.8 ? (Math.floor(this.time * 24) % 2 ? 0.9 : 0.3) : k * 0.5;
      }
      if (e.state === 'recover') return 0.25 + 0.2 * Math.sin(this.time * 14);
      return 0;
    };
    this.pods.forEach((p, k) => {
      if (!p.dead) p.inst?.flash(glow(h.pods[k]));
    });
    this.turrets.forEach((p, k) => {
      const e = h.turrets[k];
      if (p.dead) return this.smoke(RUNNER.turrets[k], 0.25);
      p.obj.rotation.y = e.aim + Math.PI;
      p.inst?.flash(glow(e));
    });
    this.engines.forEach((p, k) => {
      if (p.dead) return this.smoke(RUNNER.engines[k], 0.7, true);
      const e = h.engines[k];
      p.inst?.flash(glow(e));
      // worn down: it coughs smoke
      if (e.hp < e.max * 0.5 && Math.random() < 0.3) this.smoke(RUNNER.engines[k], 1);
    });
  }

  private smoke(p: { x: number; z: number }, rate: number, fire = false) {
    if (this.h.gone || Math.random() > rate) return;
    const at = this.worldOf(p);
    this.fx.add({ x: at.x + (Math.random() - 0.5), y: FLIGHT_Y + 0.4, z: at.z + (Math.random() - 0.5), vy: 2.5, vz: 7, size: 0.8, grow: 2.8, life: 1.1, color: SMOKE, to: SMOKE_END, glow: false, carried: true });
    if (fire && Math.random() < 0.6) this.fx.add({ x: at.x + (Math.random() - 0.5) * 1.4, y: FLIGHT_Y + 0.6, z: at.z + (Math.random() - 0.5) * 2, vy: 3, vz: 4, size: 0.7, grow: 1.4, life: 0.3, color: FIRE, to: FIRE_DARK, carried: true });
  }

  /** The loose strongboxes: tumbling on their drogues, ringed so you know to go for them. */
  private updateFalling(dt: number) {
    for (const f of this.falling) {
      if (f.gone) continue;
      const c = this.h.loose.find((o) => o.id === f.id && !o.dead);
      if (!c) continue;
      f.inst?.update(dt);
      f.roll += dt * c.spin * 2.4;
      const y = FLIGHT_Y - 0.6;
      f.obj.position.set(c.x, y, fromFlight(c.z, y));
      f.obj.rotation.set(Math.sin(this.time * 4 + f.id) * 0.25, Math.sin(this.time * 1.3 + f.id) * 0.4, f.roll * 0.3 + Math.sin(this.time * 3) * 0.3);
      // opening: the drogue grows out of it
      const chute = f.obj.getObjectByName('runner_pod_chute');
      if (chute) {
        chute.visible = true;
        chute.scale.setScalar(Math.min(1, c.t * 3));
      }
      f.halo.position.set(c.x, FLIGHT_Y - 1.2, fromFlight(c.z, FLIGHT_Y - 1.2));
      const pulse = 1 + 0.15 * Math.sin(this.time * 8);
      f.halo.scale.set(pulse, pulse, pulse);
      const low = c.z > this.lv.bottom - 12;
      (f.halo.material as THREE.MeshBasicMaterial).color.setHex(low && Math.floor(this.time * 8) % 2 ? 0xff6a4a : TEAL);
      // a beacon blinking on it, and a thread of smoke behind
      if (Math.random() < 0.5) this.fx.add({ x: c.x + (Math.random() - 0.5) * 0.6, y: FLIGHT_Y, z: c.z - 1.6, vz: -3, vy: 1, size: 0.4, grow: 2, life: 0.6, color: SMOKE, to: SMOKE_END, glow: false, carried: true });
      if (Math.floor(this.time * 3) % 2 === 0 && Math.random() < 0.4) this.fx.add({ x: c.x, y: FLIGHT_Y + 0.8, z: c.z, size: 1.1, grow: 0.4, life: 0.08, color: GOLD, carried: true });
    }
  }

  private updateWreck(dt: number, scrollDz: number) {
    const w = this.wreck!;
    w.t += dt;
    // (it was flying with the screen: it keeps on a while, then the sky lets go of it)
    const p = this.rig.position;
    p.z += scrollDz * Math.max(0, 1 - w.t * 0.5);
    if (w.t > 1.2) {
      w.vy -= 10 * dt;
      w.y += w.vy * dt;
      this.rig.rotation.z += w.spin * dt;
      this.rig.rotation.x += w.spin * 0.25 * dt;
    }
    p.y = w.y;
    // blasts down its length, the first lot quick
    if (w.booms > 0 && (w.boomT -= dt) <= 0) {
      w.booms--;
      w.boomT = w.booms > 5 ? 0.12 : 0.3 + Math.random() * 0.2;
      const bx = p.x + (Math.random() - 0.5) * 5;
      const bz = p.z + (Math.random() - 0.5) * 14;
      this.fx.explode(bx, w.y + 1, bz, 2 + Math.random() * 1.5, 0xffb040, false);
      this.fx.add({ x: bx, y: w.y + 2, z: bz, size: 7, grow: 1.3, life: 0.08, color: HOT, carried: false });
    }
    for (let k = 0; k < 3; k++) this.fx.add({ x: p.x + (Math.random() - 0.5) * 5, y: w.y + 0.5, z: p.z + (Math.random() - 0.5) * 12, vy: 1.5, size: 1.4, grow: 0.5, life: 0.3, color: FIRE, to: FIRE_DARK, carried: false });
    if (Math.random() < 0.8) this.fx.add({ x: p.x + (Math.random() - 0.5) * 3, y: w.y + 1, z: p.z + (Math.random() - 0.5) * 8, vy: 2, size: 1.6, grow: 3, life: 1.6, color: SMOKE, to: SMOKE_END, glow: false, carried: false });
    const g = this.fx.ground(p.x, p.z);
    if (w.y <= g + 0.5 || w.t > 7) {
      this.fx.explode(p.x, g, p.z, 5, 0xff8a3a, false);
      this.fx.ring(p.x, g + 0.1, p.z, 22, 0.8, false, 0xffe0a0);
      this.rig.visible = false;
      this.wreck = null;
      w.t = 0;
      this.group.remove(this.rig);
    }
  }

  dispose() {
    this.hull?.dispose();
    for (const p of [...this.pods, ...this.engines, ...this.turrets]) p.inst?.dispose();
    for (const f of this.falling) if (!f.gone) this.drop(f);
    this.haloGeo.dispose();
    (this.dome.material as THREE.Material).dispose();
    for (const p of this.plumes) (p.material as THREE.Material).dispose();
  }
}
