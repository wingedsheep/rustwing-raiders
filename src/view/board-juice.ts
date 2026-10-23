import * as THREE from 'three';
import { library } from '../render/assets';
import { GEO } from '../render/toon';
import { outlined } from '../render/pixel';
import type { Fx } from './fx';
import type { Rig } from './rig';
import { LANCE_DRAW, STEAM, type ArmKind, type Boarding, type BoardEvent } from '../sim/boarding';
import { clamp } from '../util';

/** What the boarding view lends the juice: its scene, its particles, its sounds and its shakes. */
export interface JuiceHost {
  scene: THREE.Scene;
  overlay: THREE.Scene;
  fx: Fx;
  /** The ship's crew colours (for the bits of kit that fly). */
  skin: readonly number[];
  play(name: string, x: number, vol?: number, pitch?: number): void;
  /** Camera trauma (shake), and a shove of the camera the way a shot went. */
  shake(k: number): void;
  kickCam(a: number, k: number): void;
  screenFlash(color: number, k: number): void;
  muzzle(x: number, y: number, z: number, a: number, color: number, k: number): void;
  casing(x: number, z: number, a: number, big: boolean): void;
  decal(x: number, z: number, size: number): void;
  light(x: number, y: number, z: number, color: number, power: number, life: number, dist: number): void;
  heroRig(i: number): Rig | undefined;
  foeRig(id: number): Rig | undefined;
}

/** Each arm's colour, for its glow on the deck, its flash and its tracers. */
export const ARM_COLOR: Record<ArmKind, number> = {
  nailer: 0xffd04a,
  scatter: 0xffa040,
  lance: 0x8affff,
  stamp: 0x4ae8ff,
  spore: 0xb0ff4a,
  hook: 0xff4a3a,
};

interface Tossed {
  obj: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  t: number;
}

const col = (hex: number) => new THREE.Color(hex);

const add = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

/**
 * The boarding's newer kinetic layer, kept out of the main view: arms lying on the deck (and in
 * your hand, and thrown away empty), burning fuel, the engine pipes' steam, a notary's seals, a
 * rooter under the plating, a torcher's fire, the hook's line, bodies bowling the crew over. All
 * of it light, smoke, sound and shake: none of it touches the shared clock.
 */
export class BoardJuice {
  private floor = new Map<number, { obj: THREE.Object3D; ring: THREE.Mesh; kind: ArmKind }>();
  private tossed: Tossed[] = [];
  private held: (ArmKind | null)[] = [];
  private fireDiscs: THREE.Mesh[] = [];
  private sealMarks: { ring: THREE.Mesh; fill: THREE.Mesh }[] = [];
  private jets: THREE.Mesh[] = [];
  private mounds = new Map<number, THREE.Mesh>();
  private cracks: { ring: THREE.Mesh; x: number; z: number; t: number; id: number }[] = [];
  private lines: { mesh: THREE.Mesh; hero: number; id: number; t: number }[] = [];
  private draws: THREE.Mesh[] = [];
  private t = 0;
  private lightT = 0;

  constructor(
    private b: Boarding,
    private host: JuiceHost,
  ) {
    const flatDisc = (r0: number, r1: number, color: number, opacity: number, overlay: boolean) => {
      const m = new THREE.Mesh(r0 > 0 ? new THREE.RingGeometry(r0, r1, 32) : new THREE.CircleGeometry(r1, 32), add(color, opacity));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 2;
      (overlay ? host.overlay : host.scene).add(m);
      return m;
    };
    for (let i = 0; i < 12; i++) this.fireDiscs.push(flatDisc(0, 1, 0xd83a10, 0.3, false));
    for (let i = 0; i < 12; i++) this.sealMarks.push({ ring: flatDisc(0.95, 1.15, 0x4ae8ff, 0.9, true), fill: flatDisc(0, 1, 0x4ae8ff, 0.3, true) });
    for (let i = 0; i < b.steams.length; i++) {
      const m = new THREE.Mesh(GEO.plane, add(0xe8f4ff, 0.3));
      m.visible = false;
      m.renderOrder = 2;
      host.overlay.add(m);
      this.jets.push(m);
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(GEO.plane, add(0x8affff, 0.5));
      m.visible = false;
      host.overlay.add(m);
      this.draws.push(m);
    }
    this.held = b.heroes.map(() => null);
  }

  /** The events the main view doesn't know about. */
  handle(events: BoardEvent[]) {
    const b = this.b;
    const h = this.host;
    const fx = h.fx;
    for (const e of events) {
      switch (e.type) {
        case 'armShot':
          this.shot(e.hero, e.kind, e.x, e.z, e.a);
          break;
        case 'armDraw':
          h.play('laser_charge', e.hero >= 0 ? b.heroes[e.hero].x : 0, 0.45, 1.5);
          break;
        case 'arm': {
          const he = b.heroes[e.hero];
          fx.ring(he.x, 0.2, he.z, 1.6, 0.3, false, ARM_COLOR[e.kind]);
          fx.sparks(he.x, 1.1, he.z, 12, ARM_COLOR[e.kind], 8, 0.3, 0.12, false);
          h.play('pickup_part', he.x, 0.6, 1.1);
          h.play('reload', he.x, 0.5, 1.0);
          break;
        }
        case 'armDrop':
          fx.sparks(e.x, 0.5, e.z, 5, ARM_COLOR[e.kind], 5, 0.3, 0.1, false);
          h.play('block', e.x, 0.35, 0.7);
          break;
        case 'toss':
          this.toss(e.kind, e.x, e.z, e.a);
          h.play('heavy_dry', e.x, 0.5, 0.9);
          break;
        case 'reel': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f) fx.sparks(f.x, 1.2, f.z, 10, 0xff4a3a, 10, 0.25, 0.12, false);
          this.line(e.hero, e.id);
          h.play('reel', b.heroes[e.hero].x, 0.8, e.zip ? 1.3 : 1);
          h.shake(0.12);
          break;
        }
        case 'bowl':
          fx.sparks(e.x, 1, e.z, 12, 0xfff0c0, 10, 0.25, 0.14, false);
          fx.ring(e.x, 0.2, e.z, 1.8, 0.25, false, 0xfff0c0);
          for (let i = 0; i < 5; i++) fx.add({ x: e.x, y: 0.2, z: e.z, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4, vy: 0.6, life: 0.5, size: 0.4, grow: 2, color: col(0x6a6070), to: col(0x2a2430), drag: 3, glow: false });
          h.shake(0.16);
          h.kickCam(e.a, 0.12);
          h.play('body_fall', e.x, 0.9, 0.8);
          h.play('punch', e.x, 0.7, 0.8);
          break;
        case 'fire':
          h.decal(e.x, e.z, e.r * 1.5);
          h.play('mark_burn', e.x, 0.8, 0.8);
          break;
        case 'flare':
          fx.explode(e.x, 1, e.z, e.r * 0.7, 0xb0ff4a, false);
          fx.ring(e.x, 0.3, e.z, e.r * 2.4, 0.35, false, 0xffd070);
          h.light(e.x, 1.2, e.z, 0xffc070, 14, 0.3, 10);
          h.screenFlash(0xffd090, 0.25);
          h.shake(0.3);
          h.play('flare', e.x, 0.9);
          h.play('explode_small', e.x, 0.6, 1.2);
          break;
        case 'steamWarm': {
          const s = b.steams[e.i];
          if (s) h.play('frost_breath', s.x, 0.25, 1.8);
          break;
        }
        case 'steam': {
          const s = b.steams[e.i];
          if (s && e.on) {
            h.play('geyser', s.x, 0.55, 1.4);
            h.shake(0.05);
          }
          break;
        }
        case 'scald':
          for (let i = 0; i < 4; i++) fx.add({ x: e.x, y: 1, z: e.z, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 1.5, life: 0.6, size: 0.4, grow: 2.5, color: col(0xffffff), to: col(0x8a90a0), drag: 2, glow: false });
          break;
        case 'ignite': {
          const r = h.foeRig(e.id);
          if (r) h.play('flare', r.muzzle.x, 0.35, 1.6);
          break;
        }
        case 'tank': {
          fx.sparks(e.x, 1.4, e.z, 6 + Math.round(e.k * 8), 0xff8a3a, 8 + e.k * 6, 0.25, 0.12, false);
          h.play('hit_armor', e.x, 0.5 + e.k * 0.3, 0.9 + e.k * 0.5);
          break;
        }
        case 'raise': {
          const r = h.foeRig(e.id);
          if (r) {
            fx.sparks(r.muzzle.x, r.muzzle.y, r.muzzle.z, 8, 0x4ae8ff, 4, 0.5, 0.14, false);
            h.play('laser_charge', r.muzzle.x, 0.35, 0.8);
          }
          break;
        }
        case 'seal':
          h.play('toll', e.x, 0.4, 1.7);
          break;
        case 'sealBurst':
          fx.ring(e.x, 0.2, e.z, 2.4, 0.3, false, 0x8affff);
          fx.sparks(e.x, 0.6, e.z, 14, 0x8affff, 10, 0.3, 0.12, false);
          h.light(e.x, 0.8, e.z, 0x4ae8ff, 6, 0.15, 6);
          h.shake(0.06);
          h.play('shield_break', e.x, 0.3, 1.6);
          break;
        case 'burrow':
          this.dirt(e.x, e.z, 10, 0.5);
          h.play('ice_crack', e.x, 0.45, 0.6);
          break;
        case 'rumble':
          this.cracks.push({ ring: this.crackRing(), x: e.x, z: e.z, t: 0, id: e.id });
          h.play('ice_crack', e.x, 0.6, 0.8);
          break;
        case 'erupt':
          this.dirt(e.x, e.z, 22, 1.4);
          fx.ring(e.x, 0.2, e.z, 3, 0.35, false, 0xb0ff4a);
          fx.sparks(e.x, 0.6, e.z, 12, 0xb0ff4a, 10, 0.4, 0.14, false);
          h.decal(e.x, e.z, 1.4);
          h.shake(0.32);
          h.play('crash', e.x, 0.75, 1.2);
          h.play('eat', e.x, 0.5, 0.7);
          break;
        case 'kill': {
          // bits of kit flying the way it went, a white ring, and the deck remembers: a stain where it fell
          for (let i = 0; i < 7; i++) {
            const a = e.a + (Math.random() - 0.5) * 1.4;
            const v = 3 + Math.random() * 6;
            fx.add({ x: e.x, y: 1.1, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 4, life: 1.4, size: 0.1 + Math.random() * 0.1, color: col(h.skin[i % 3]), solid: true, gravity: 20, spin: 12, glow: false });
          }
          fx.ring(e.x, 0.2, e.z, 1.6, 0.18, false, 0xffffff);
          h.decal(e.x + Math.cos(e.a) * 0.6, e.z + Math.sin(e.a) * 0.6, 0.7 + Math.random() * 0.4);
          break;
        }
      }
    }
  }

  /** A shot from what you picked up: each its own flash, kick and voice. */
  private shot(hero: number, kind: ArmKind, x: number, z: number, a: number) {
    const h = this.host;
    const rig = h.heroRig(hero);
    const m = rig?.muzzle ?? new THREE.Vector3(x, 1.2, z);
    const c = ARM_COLOR[kind];
    switch (kind) {
      case 'nailer':
        rig?.kick(0.7);
        h.muzzle(m.x, m.y, m.z, a, c, 0.8);
        h.kickCam(a, 0.04);
        if (Math.random() < 0.6) h.casing(x, z, a, false);
        h.play('shot_needle', x, 0.4, 0.85 + Math.random() * 0.3);
        break;
      case 'scatter':
        rig?.kick(3);
        h.muzzle(m.x, m.y, m.z, a, c, 2.8);
        for (let i = 0; i < 8; i++) {
          const aa = a + (Math.random() - 0.5) * 1.0;
          const v = 4 + Math.random() * 8;
          h.fx.add({ x: m.x, y: m.y, z: m.z, vx: Math.cos(aa) * v, vz: Math.sin(aa) * v, vy: Math.random() * 1.5, life: 0.5 + Math.random() * 0.4, size: 0.35, grow: 3, color: col(0x8a8090), to: col(0x2a2430), drag: 4, glow: false });
        }
        h.fx.sparks(m.x, m.y, m.z, 16, 0xffd070, 18, 0.18, 0.12, false);
        h.casing(x, z, a, true);
        h.shake(0.3);
        h.kickCam(a, 0.4);
        h.play('shot_scatter', x, 0.9, 0.9);
        h.play('foot_blast', x, 0.5, 1.2);
        break;
      case 'lance':
        rig?.kick(2.4);
        h.muzzle(m.x, m.y, m.z, a, c, 3);
        h.screenFlash(0x8affff, 0.22);
        h.shake(0.28);
        h.kickCam(a, 0.3);
        // sparks all down the beam
        for (const l of this.b.lances.filter((x) => x.hero && x.t === 0)) {
          for (let i = 0; i < l.len; i += 0.8) h.fx.sparks(l.x + Math.cos(l.a) * i, 1.15, l.z + Math.sin(l.a) * i, 2, 0x8affff, 6, 0.3, 0.12, false);
          h.light(l.x + Math.cos(l.a) * l.len * 0.5, 1.2, l.z + Math.sin(l.a) * l.len * 0.5, 0x8affff, 10, 0.2, l.len * 0.6);
        }
        h.play('shot_rail', x, 0.85, 1.1);
        break;
      case 'stamp':
        rig?.kick(2);
        h.muzzle(m.x, m.y, m.z, a, c, 1.8);
        h.shake(0.14);
        h.kickCam(a, 0.2);
        h.play('shot_anchor', x, 0.7, 1.2);
        break;
      case 'spore':
        rig?.kick(1.4);
        for (let i = 0; i < 6; i++) {
          const aa = a + (Math.random() - 0.5) * 0.8;
          h.fx.add({ x: m.x, y: m.y, z: m.z, vx: Math.cos(aa) * 3, vz: Math.sin(aa) * 3, vy: 0.8, life: 0.6, size: 0.3, grow: 2, color: col(0xb0ff4a), to: col(0x6a3a8a), drag: 3, glow: false });
        }
        h.play('shot_hive', x, 0.6, 0.8);
        break;
      case 'hook':
        rig?.kick(1.6);
        h.muzzle(m.x, m.y, m.z, a, c, 1.2);
        h.kickCam(a, 0.12);
        h.play('hook_fire', x, 0.7, 1.15);
        break;
    }
  }

  private toss(kind: ArmKind, x: number, z: number, a: number) {
    const inst = library.clone(`arm_${kind}`, 0);
    if (!inst) return;
    outlined(inst.obj);
    this.host.scene.add(inst.obj);
    const v = 4 + Math.random() * 2;
    this.tossed.push({ obj: inst.obj, x, y: 1.2, z, vx: Math.cos(a) * v, vy: 5, vz: Math.sin(a) * v, spin: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 6), t: 0 });
  }

  private line(hero: number, id: number) {
    const mesh = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x2a2a30 }));
    this.host.scene.add(mesh);
    this.lines.push({ mesh, hero, id, t: 0 });
  }

  private crackRing() {
    const m = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 24), add(0xb0ff4a, 0.9));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 2;
    this.host.overlay.add(m);
    return m;
  }

  private dirt(x: number, z: number, n: number, k: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1 + Math.random() * 4) * k;
      this.host.fx.add({ x, y: 0.2, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 5 * k, life: 1.2, size: 0.12 + Math.random() * 0.1, color: col(i % 3 ? 0x3a2a40 : 0x6a3a8a), drag: 1, gravity: 20, solid: true, spin: 10, glow: false });
    }
  }

  update(dt: number) {
    const b = this.b;
    const h = this.host;
    const fx = h.fx;
    this.t += dt;
    this.lightT -= dt;
    const t = this.t;
    // arms lying on the deck: bobbing, turning, a glow under them
    const seen = new Set<number>();
    for (const a of b.arms) {
      seen.add(a.id);
      let e = this.floor.get(a.id);
      if (!e) {
        const inst = library.clone(`arm_${a.kind}`, 0);
        const obj = inst?.obj ?? new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: ARM_COLOR[a.kind] }));
        outlined(obj);
        // built in the gun hand's frame (barrel down the model's -y): laid flat on the deck
        obj.rotation.order = 'YXZ';
        h.scene.add(obj);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 20), add(ARM_COLOR[a.kind], 0.7));
        ring.rotation.x = -Math.PI / 2;
        h.scene.add(ring);
        e = { obj, ring, kind: a.kind };
        this.floor.set(a.id, e);
      }
      const bob = Math.sin(t * 3 + a.id) * 0.06;
      e.obj.position.set(a.x, 0.35 + bob, a.z);
      e.obj.rotation.set(Math.PI / 2, t * 1.4 + a.id, 0);
      e.obj.scale.setScalar(1.7 + (a.t < 0.2 ? (0.2 - a.t) * 4 : 0));
      e.ring.position.set(a.x, 0.04, a.z);
      const pulse = 0.85 + Math.sin(t * 5 + a.id) * 0.15;
      e.ring.scale.setScalar(pulse);
      // a glint now and then
      if (Math.random() < dt * 1.2) fx.add({ x: a.x + (Math.random() - 0.5) * 0.5, y: 0.5, z: a.z + (Math.random() - 0.5) * 0.5, vy: 0.3, life: 0.25, size: 0.25, grow: 0.2, color: col(0xffffff), drag: 1 });
    }
    for (const [id, e] of this.floor) {
      if (seen.has(id)) continue;
      e.obj.removeFromParent();
      e.ring.removeFromParent();
      this.floor.delete(id);
    }
    // empties thrown away: tumbling, a bounce, then gone
    for (const x of this.tossed) {
      x.t += dt;
      x.vy -= 22 * dt;
      x.x += x.vx * dt;
      x.y += x.vy * dt;
      x.z += x.vz * dt;
      if (x.y < 0.15) {
        x.y = 0.15;
        x.vy = Math.abs(x.vy) * 0.35;
        x.vx *= 0.5;
        x.vz *= 0.5;
        x.spin *= 0.5;
      }
      x.obj.position.set(x.x, x.y, x.z);
      x.obj.rotation.set(x.t * x.spin * 0.4, x.t * x.spin, 0);
      x.obj.scale.setScalar(x.t > 1.2 ? Math.max(0.001, 1 - (x.t - 1.2) * 3) : 1);
    }
    this.tossed = this.tossed.filter((x) => {
      if (x.t < 1.6) return true;
      x.obj.removeFromParent();
      return false;
    });
    // in your hand
    b.heroes.forEach((he, i) => {
      const want = he.out ? null : he.arm;
      if (want !== this.held[i]) {
        this.held[i] = want;
        h.heroRig(i)?.hold(want ? `arm_${want}` : null);
      }
    });
    // a lance being drawn: a thin line out ahead, brightening, light gathering at the muzzle
    b.heroes.forEach((he, i) => {
      const m = this.draws[i];
      if (!m) return;
      const k = he.arm === 'lance' && he.draw > 0 ? clamp(he.draw / LANCE_DRAW, 0, 1) : 0;
      m.visible = k > 0;
      if (!k) return;
      const len = b.lanceLength(he.x, he.z, he.aim);
      m.position.set(he.x + Math.cos(he.aim) * len * 0.5, 1.15, he.z + Math.sin(he.aim) * len * 0.5);
      m.rotation.set(-Math.PI / 2, 0, -he.aim);
      m.scale.set(len, 0.03 + k * 0.05, 1);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + k * 0.6;
      const r = h.heroRig(i);
      if (r && Math.random() < 0.6) {
        const aa = Math.random() * Math.PI * 2;
        fx.add({ x: r.muzzle.x + Math.cos(aa) * 0.5, y: r.muzzle.y, z: r.muzzle.z + Math.sin(aa) * 0.5, vx: -Math.cos(aa) * 2.5, vz: -Math.sin(aa) * 2.5, life: 0.2, size: 0.12, color: col(0x8affff), drag: 0 });
      }
    });
    // fires: a glow on the deck, flames licking up, smoke, light
    b.fires.forEach((fi, i) => {
      const m = this.fireDiscs[i];
      const k = Math.min(1, (fi.life - fi.t) / 0.8) * Math.min(1, fi.t / 0.15);
      if (m) {
        m.visible = true;
        m.position.set(fi.x, 0.05, fi.z);
        m.scale.setScalar(fi.r * k * (0.95 + Math.sin(t * 13 + i) * 0.05));
        (m.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 17 + i * 3) * 0.05 + Math.sin(t * 7.3 + i) * 0.05;
      }
      // tongues of flame: small, quick, licking up and going out; embers spat high
      const n = Math.max(1, Math.round(fi.r * fi.r * 0.9 * k));
      for (let j = 0; j < n; j++) {
        const aa = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * fi.r * k * 0.85;
        const edge = rr / Math.max(0.1, fi.r);
        fx.add({ x: fi.x + Math.cos(aa) * rr, y: 0.1, z: fi.z + Math.sin(aa) * rr, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, vy: 2.5 + Math.random() * 3 * (1 - edge * 0.6), life: 0.18 + Math.random() * 0.22, size: 0.16 + Math.random() * 0.16, grow: 0.15, color: col(edge < 0.4 && Math.random() < 0.6 ? 0xfff0a0 : 0xff9a30), to: col(0xc02810), drag: 1.5 });
      }
      if (Math.random() < dt * 10 * fi.r) fx.add({ x: fi.x + (Math.random() - 0.5) * fi.r, y: 0.4, z: fi.z + (Math.random() - 0.5) * fi.r, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 3, life: 0.8, size: 0.06, grow: 0.5, color: col(0xffd070), drag: 1.2 });
      if (Math.random() < dt * 4 * fi.r) fx.add({ x: fi.x + (Math.random() - 0.5) * fi.r, y: 1.2, z: fi.z + (Math.random() - 0.5) * fi.r, vy: 1.5, life: 1.4, size: 0.5, grow: 3, color: col(0x3a3036), to: col(0x14101a), drag: 0.5, glow: false });
      if (this.lightT <= 0) h.light(fi.x, 1, fi.z, 0xff8a30, (2.5 + Math.random()) * fi.r * k, 0.14, 3 + fi.r * 1.5);
    });
    for (let i = b.fires.length; i < this.fireDiscs.length; i++) this.fireDiscs[i].visible = false;
    // a torcher's spray: the flame rounds are drawn as fire; its pilot light while it lights up
    for (const r of b.rounds) {
      if (r.kind !== 'flame') continue;
      fx.add({ x: r.x, y: 1.0 + Math.random() * 0.2, z: r.z, vx: r.vx * 0.4, vz: r.vz * 0.4, vy: 0.8, life: 0.14 + Math.random() * 0.1, size: 0.22 + Math.random() * 0.16, grow: 2.2, color: col(Math.random() < 0.4 ? 0xfff0a0 : 0xff8a30), to: col(0xb02010), drag: 2 });
    }
    for (const f of b.foes) {
      if (f.dead) continue;
      const rig = h.foeRig(f.id);
      if (f.kind === 'torcher' && rig && (f.state === 'ignite' || f.state === 'spray')) {
        const mz = rig.muzzle;
        fx.add({ x: mz.x, y: mz.y, z: mz.z, vy: 0.6, life: 0.12, size: f.state === 'ignite' ? 0.22 : 0.4, grow: 0.5, color: col(f.state === 'ignite' ? 0x6ab0ff : 0xffd070), drag: 1 });
        if (this.lightT <= 0 && f.state === 'spray') h.light(mz.x, mz.y, mz.z, 0xff8a30, 4, 0.14, 4.5);
      }
      // a rooter under the deck: its rig is hidden, a mound of plating ripples where it goes
      let mound = this.mounds.get(f.id);
      if (f.kind === 'rooter') {
        if (!mound) {
          mound = new THREE.Mesh(GEO.sphere, new THREE.MeshLambertMaterial({ color: 0x9a7ab0, emissive: 0x2a1a30 }));
          mound.visible = false;
          h.scene.add(mound);
          this.mounds.set(f.id, mound);
        }
        mound.visible = f.under;
        if (rig) rig.root.visible = !f.under;
        if (f.under) {
          const wob = Math.sin(t * 18 + f.id) * 0.04;
          mound.position.set(f.x, 0.02, f.z);
          mound.scale.set(1.05 + wob, f.state === 'rumble' ? 0.45 : 0.28, 1.05 - wob);
          mound.rotation.y = t * 3;
          if (Math.random() < dt * 20) {
            const aa = Math.random() * Math.PI * 2;
            fx.add({ x: f.x + Math.cos(aa) * 0.5, y: 0.1, z: f.z + Math.sin(aa) * 0.5, vx: Math.cos(aa) * 1.5, vz: Math.sin(aa) * 1.5, vy: 2 + Math.random() * 2, life: 0.6, size: 0.1, color: col(0x4a3a50), gravity: 18, solid: true, spin: 8, drag: 1, glow: false });
          }
        }
      }
    }
    // the cracks a rooter's about to come up through
    for (const c of this.cracks) {
      c.t += dt;
      const k = clamp(c.t / 0.7, 0, 1);
      c.ring.position.set(c.x, 0.06, c.z);
      c.ring.scale.setScalar(0.4 + k * 0.6);
      (c.ring.material as THREE.MeshBasicMaterial).opacity = Math.floor(t * (8 + k * 16)) % 2 ? 0.9 : 0.45;
      if (Math.random() < dt * 30) fx.add({ x: c.x + (Math.random() - 0.5) * 2 * k, y: 0.1, z: c.z + (Math.random() - 0.5) * 2 * k, vy: 2, life: 0.4, size: 0.08, color: col(0x6a4a70), gravity: 14, solid: true, spin: 6, drag: 1, glow: false });
    }
    this.cracks = this.cracks.filter((c) => {
      if (c.t < 0.75) return true;
      c.ring.removeFromParent();
      return false;
    });
    // steam: a faint streak on the deck as it hisses (the tell), then the jet
    b.steams.forEach((s, i) => {
      const m = this.jets[i];
      if (!m) return;
      const warmK = s.warm ? clamp(1 - (s.cycle - s.t) / STEAM.warm, 0, 1) : 0;
      m.visible = s.warm || s.on;
      if (m.visible) {
        m.position.set(s.x + Math.cos(s.a) * STEAM.len * 0.5, 0.06, s.z + Math.sin(s.a) * STEAM.len * 0.5);
        m.rotation.set(-Math.PI / 2, 0, -s.a);
        m.scale.set(STEAM.len, STEAM.w * 2, 1);
        (m.material as THREE.MeshBasicMaterial).opacity = s.on ? 0.1 : (Math.floor(t * 10) % 2 ? 0.05 : 0.14) * (0.5 + warmK);
      }
      if (s.warm && Math.random() < dt * 14) fx.add({ x: s.x, y: 1, z: s.z, vx: Math.cos(s.a) * 0.8, vz: Math.sin(s.a) * 0.8, vy: 0.6, life: 0.6, size: 0.18, grow: 2, color: col(0xe0e8f0), to: col(0x6a7080), drag: 1, glow: false });
      if (s.on) {
        for (let j = 0; j < 3; j++) {
          const aa = s.a + (Math.random() - 0.5) * 0.35;
          const v = 9 + Math.random() * 5;
          fx.add({ x: s.x, y: 0.8 + Math.random() * 0.4, z: s.z, vx: Math.cos(aa) * v, vz: Math.sin(aa) * v, vy: Math.random() * 0.6, life: 0.3 + Math.random() * 0.15, size: 0.3, grow: 4, color: col(0xffffff), to: col(0x8a90a0), drag: 3, glow: false });
        }
      }
    });
    // a notary's seals: a ring, filling as it arms, flickering hard at the end
    b.seals.forEach((s, i) => {
      const mk = this.sealMarks[i];
      if (!mk) return;
      const k = clamp(s.t / s.dur, 0, 1);
      mk.ring.visible = mk.fill.visible = true;
      mk.ring.position.set(s.x, 0.06, s.z);
      mk.fill.position.set(s.x, 0.05, s.z);
      mk.ring.scale.setScalar(1);
      mk.ring.rotation.z = t * 2;
      mk.fill.scale.setScalar(Math.max(0.01, k * 1.1));
      (mk.ring.material as THREE.MeshBasicMaterial).opacity = k > 0.75 && Math.floor(t * 20) % 2 ? 0.3 : 0.9;
      (mk.fill.material as THREE.MeshBasicMaterial).opacity = 0.15 + k * 0.3;
    });
    for (let i = b.seals.length; i < this.sealMarks.length; i++) this.sealMarks[i].ring.visible = this.sealMarks[i].fill.visible = false;
    // the hook's line, from your gun to what it caught, a moment
    for (const l of this.lines) {
      l.t += dt;
      const r = h.heroRig(l.hero);
      const f = b.foes.find((x) => x.id === l.id);
      if (!r || !f) continue;
      const dx = f.x - r.muzzle.x;
      const dz = f.z - r.muzzle.z;
      const len = Math.hypot(dx, dz);
      l.mesh.position.set(r.muzzle.x + dx / 2, 1.15, r.muzzle.z + dz / 2);
      l.mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
      l.mesh.scale.set(len, 0.05, 0.05);
    }
    this.lines = this.lines.filter((l) => {
      if (l.t < 0.3) return true;
      l.mesh.removeFromParent();
      return false;
    });
    if (this.lightT <= 0) this.lightT = 0.12;
  }

  dispose() {
    for (const e of this.floor.values()) {
      e.obj.removeFromParent();
      e.ring.removeFromParent();
    }
    for (const x of this.tossed) x.obj.removeFromParent();
  }
}
