import * as THREE from 'three';

/**
 * Particles: soft round camera-facing sprites, in two instanced meshes, one that adds light
 * (sparks, fire, trails: they bloom) and one that covers (smoke, snow, ash, spores); one of
 * tumbling cubes (debris that falls to the ground and bounces); and a handful of rings
 * (shockwaves). All unlit: they're light, or they're in the way of it.
 */

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  t: number;
  size: number;
  /** Size at the end, as a multiple. */
  grow: number;
  color: THREE.Color;
  /** Fades to this colour over its life. */
  to: THREE.Color | null;
  drag: number;
  gravity: number;
  /** Debris: a cube that bounces on the ground. */
  solid: boolean;
  spin: number;
  rx: number;
  ry: number;
  /** Stays on the flight plane with the screen (moves with the scroll). */
  carried: boolean;
  /** Adds light (sparks, fire) rather than covering (smoke, snow). */
  glow: boolean;
}

const MAX = 4000;
const MAX_SOLID = 600;

export class Fx {
  readonly group = new THREE.Group();
  private quads: THREE.InstancedMesh;
  private glows: THREE.InstancedMesh;
  private cubes: THREE.InstancedMesh;
  private list: Particle[] = [];
  private pool: Particle[] = [];
  private rings: { mesh: THREE.Mesh; t: number; life: number; size: number; carried: boolean }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private c = new THREE.Color();
  private e = new THREE.Euler();
  /** How to find the ground under a point (for debris to land on). */
  ground: (x: number, z: number) => number = () => 0;

  constructor() {
    const sprite = (blending: THREE.Blending, order: number) => {
      const m = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, blending }),
        MAX,
      );
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      m.frustumCulled = false;
      m.count = 0;
      m.renderOrder = order;
      return m;
    };
    this.quads = sprite(THREE.NormalBlending, 5);
    this.glows = sprite(THREE.AdditiveBlending, 6);
    this.cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX_SOLID);
    this.cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SOLID * 3), 3);
    this.cubes.frustumCulled = false;
    this.cubes.count = 0;
    this.group.add(this.quads, this.glows, this.cubes);
  }

  add(o: Partial<Particle> & { x: number; y: number; z: number }): Particle {
    if (this.list.length >= MAX) return this.list[0];
    const p = this.pool.pop() ?? ({ color: new THREE.Color() } as Particle);
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.life = o.life ?? 0.5;
    p.t = 0;
    p.size = o.size ?? 0.3;
    p.grow = o.grow ?? 1;
    p.color.copy(o.color ?? WHITE);
    p.to = o.to ?? null;
    p.drag = o.drag ?? 0;
    p.gravity = o.gravity ?? 0;
    p.solid = o.solid ?? false;
    p.spin = o.spin ?? 0;
    p.rx = Math.random() * 6;
    p.ry = Math.random() * 6;
    p.carried = o.carried ?? false;
    // bright things glow unless told otherwise
    p.glow = o.glow ?? (!p.solid && p.color.r * 0.3 + p.color.g * 0.59 + p.color.b * 0.11 > 0.5);
    this.list.push(p);
    return p;
  }

  /** A burst of sparks flying out from a point. */
  sparks(x: number, y: number, z: number, n: number, color: THREE.ColorRepresentation, speed = 14, life = 0.3, size = 0.25, carried = true) {
    const col = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.add({ x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: (Math.random() - 0.3) * v * 0.4, life: life * (0.6 + Math.random() * 0.8), size, grow: 0.3, color: col, drag: 4, carried });
    }
  }

  /** The works: a fireball, smoke, sparks, debris and a shockwave. `size` ~1 for a fighter. */
  explode(x: number, y: number, z: number, size: number, accent: THREE.ColorRepresentation, carried = true) {
    const acc = new THREE.Color(accent);
    for (let i = 0; i < 8 * size + 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (3 + Math.random() * 6) * Math.sqrt(size);
      this.add({ x, y: y + 0.5, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 3, life: 0.35 + Math.random() * 0.35, size: 0.7 * Math.sqrt(size) + Math.random() * 0.5, grow: 1.8, color: FIRE_HOT, to: FIRE_COOL, drag: 5, carried });
    }
    for (let i = 0; i < 5 * size + 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (1 + Math.random() * 3) * Math.sqrt(size);
      this.add({ x, y: y + 1, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 2, life: 0.8 + Math.random() * 0.8, size: 0.8 * Math.sqrt(size), grow: 2.4, color: SMOKE, to: SMOKE_END, drag: 2, carried });
    }
    this.sparks(x, y + 0.5, z, Math.round(10 * size + 6), acc, 18 * Math.sqrt(size), 0.35, 0.22, carried);
    this.sparks(x, y + 0.5, z, Math.round(6 * size), 0xffffff, 24 * Math.sqrt(size), 0.18, 0.18, carried);
    for (let i = 0; i < 4 * size + 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (4 + Math.random() * 8) * Math.sqrt(size);
      this.add({ x, y, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + Math.random() * 6, life: 3 + Math.random() * 2, size: 0.18 + Math.random() * 0.3 * Math.sqrt(size), color: Math.random() < 0.5 ? DEBRIS : acc, solid: true, gravity: 22, spin: 8 + Math.random() * 10, carried: false });
    }
    this.ring(x, y, z, size * 2.6, 0.32, carried);
  }

  /** An expanding ring on the flight plane. */
  ring(x: number, y: number, z: number, size: number, life = 0.3, carried = true, color: THREE.ColorRepresentation = 0xfff4d0) {
    const mesh = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    mesh.position.set(x, y, z);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 6;
    this.group.add(mesh);
    this.rings.push({ mesh, t: 0, life, size, carried });
  }

  /** Advances everything by dt. `scrollDz` is how far the screen moved (carried particles go with it). */
  update(dt: number, camera: THREE.Camera, scrollDz: number) {
    let n = 0;
    let ng = 0;
    let ns = 0;
    const keep: Particle[] = [];
    for (const p of this.list) {
      p.t += dt;
      if (p.t >= p.life) {
        this.pool.push(p);
        continue;
      }
      keep.push(p);
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt + (p.carried ? scrollDz : 0);
      const f = p.t / p.life;
      if (p.solid) {
        const g = this.ground(p.x, p.z);
        if (p.y < g + p.size * 0.5) {
          p.y = g + p.size * 0.5;
          p.vy = Math.abs(p.vy) * 0.35;
          p.vx *= 0.6;
          p.vz *= 0.6;
          p.spin *= 0.5;
        }
        p.rx += p.spin * dt;
        p.ry += p.spin * 0.7 * dt;
        if (ns < MAX_SOLID) {
          const sz = p.size * (f > 0.8 ? (1 - f) * 5 : 1);
          this.e.set(p.rx, p.ry, 0);
          this.q.setFromEuler(this.e);
          this.m.compose(this.p.set(p.x, p.y, p.z), this.q, this.s.set(sz, sz, sz));
          this.cubes.setMatrixAt(ns, this.m);
          this.cubes.setColorAt(ns, p.color);
          ns++;
        }
        continue;
      }
      // (a little bigger than before: the sprite is soft at the rim)
      const size = p.size * (1 + (p.grow - 1) * f) * 1.5;
      this.m.compose(this.p.set(p.x, p.y, p.z), camera.quaternion, this.s.set(size, size, size));
      if (p.to) this.c.copy(p.color).lerp(p.to, f);
      else this.c.copy(p.color);
      if (p.glow) {
        // light fades out as it goes, and is a bit brighter than white so it blooms
        this.c.multiplyScalar(1.6 * (1 - f * f));
        this.glows.setMatrixAt(ng, this.m);
        this.glows.setColorAt(ng, this.c);
        ng++;
      } else {
        this.quads.setMatrixAt(n, this.m);
        this.quads.setColorAt(n, this.c);
        n++;
      }
    }
    this.list = keep;
    this.quads.count = n;
    this.glows.count = ng;
    this.cubes.count = ns;
    this.quads.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    this.cubes.instanceMatrix.needsUpdate = true;
    if (this.quads.instanceColor) this.quads.instanceColor.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      if (r.carried) r.mesh.position.z += scrollDz;
      const f = r.t / r.life;
      if (f >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(0.3 + r.size * Math.sqrt(f));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - f;
    }
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list = [];
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings = [];
  }
}

const RING = new THREE.RingGeometry(0.8, 1, 24);
/** A soft disc: solid in the middle, feathered at the rim. */
const SOFT = (() => {
  const n = 32;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
})();
const WHITE = new THREE.Color(0xffffff);
const FIRE_HOT = new THREE.Color(0xfff2a0);
const FIRE_COOL = new THREE.Color(0xc0301a);
const SMOKE = new THREE.Color(0x5a4a4a);
const SMOKE_END = new THREE.Color(0x2a2228);
const DEBRIS = new THREE.Color(0x3a3438);
