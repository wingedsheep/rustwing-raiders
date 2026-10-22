import * as THREE from 'three';
import { FLIGHT_Y } from '../sim/types';

/**
 * Strokes of light laid flat on the flight plane: the ink of a hit. A burst of strike lines
 * shooting out from where something landed, a four-point glint on what's open to you, a slash
 * left along a dash. Each is a thin streak that shoots out and thins to nothing, drawn over
 * everything and adding light (so it blooms, and goes to ink in an impact frame).
 */

interface Stroke {
  x: number;
  y: number;
  z: number;
  /** Its heading on the plane (radians; 0 is +x, π/2 is +z). */
  a: number;
  /** From the centre: where it starts, and where its far end is at the start and the end. */
  r0: number;
  r1: number;
  len: number;
  width: number;
  /** Spin (radians a second): glints turn. */
  spin: number;
  t: number;
  life: number;
  color: THREE.Color;
  carried: boolean;
}

const MAX = 384;

/**
 * A streak: a long thin spike, its tail drawn out to a point behind and its head sharp. Solid
 * (a soft-edged one is thinner than an art pixel, and vanishes).
 */
const SPIKE = (() => {
  const g = new THREE.BufferGeometry();
  // in the plane's x (along) and y (across): tail, the widest point near the head, the tip
  const v = [-0.5, 0, 0, 0.28, 0.5, 0, 0.5, 0, 0, 0.28, -0.5, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
})();

export class Strokes {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private list: Stroke[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      SPIKE,
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      MAX,
    );
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 41;
    this.group.add(this.mesh);
  }

  private add(o: Omit<Stroke, 't' | 'color' | 'y' | 'spin' | 'carried'> & { color: THREE.ColorRepresentation; y?: number; spin?: number; carried?: boolean }) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ ...o, y: o.y ?? FLIGHT_Y + 1, spin: o.spin ?? 0, carried: o.carried ?? true, t: 0, color: new THREE.Color(o.color) });
  }

  /**
   * Strike lines: `n` streaks shooting out from (x, z) to about `reach`, unevenly, the way ink
   * splashes. `dir` (radians), if given, throws most of them that way (the way the blow went).
   */
  burst(x: number, z: number, n: number, color: THREE.ColorRepresentation, reach: number, life = 0.16, width = 0.3, dir?: number) {
    for (let k = 0; k < n; k++) {
      const even = (k / n) * Math.PI * 2 + Math.random() * 0.5;
      const a = dir === undefined ? even : dir + (Math.random() - 0.5) * (k % 3 === 0 ? 2.6 : 1.1);
      const r = reach * (0.55 + Math.random() * 0.6);
      this.add({ x, z, a, r0: reach * 0.12, r1: r, len: r * (0.35 + Math.random() * 0.25), width: width * (0.6 + Math.random() * 0.8), life: life * (0.7 + Math.random() * 0.6), color });
    }
  }

  /** A four-point glint at (x, z), turning: what's open to a blow. */
  star(x: number, z: number, size: number, color: THREE.ColorRepresentation, life = 0.22, y?: number) {
    const a0 = Math.random() * Math.PI;
    for (let k = 0; k < 4; k++) {
      const long = k % 2 === 0;
      this.add({ x, y, z, a: a0 + (k * Math.PI) / 2, r0: 0, r1: size * (long ? 1 : 0.6), len: size * (long ? 1 : 0.6), width: size * 0.16, life, spin: 2.5, color });
    }
  }

  /** A slash from (x0, z0) to (x1, z1): drawn on at once, it thins away from the tail. */
  slash(x0: number, z0: number, x1: number, z1: number, color: THREE.ColorRepresentation, width = 0.8, life = 0.22) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) return;
    const a = Math.atan2(z1 - z0, x1 - x0);
    this.add({ x: x0, z: z0, a, r0: 0, r1: len, len, width, life, color });
    // a thin hot core down the middle of it
    this.add({ x: x0, z: z0, a, r0: 0, r1: len, len: len * 0.9, width: width * 0.35, life: life * 0.8, color: 0xffffff });
  }

  update(dt: number, scrollDz: number) {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      if (s.carried) s.z += scrollDz;
      if (s.t >= s.life) this.list.splice(i, 1);
    }
    for (const s of this.list) {
      const f = s.t / s.life;
      // shoots out fast and settles, thinning to nothing
      const go = 1 - (1 - f) * (1 - f) * (1 - f);
      const head = s.r0 + (s.r1 - s.r0) * (0.55 + 0.45 * go);
      const len = s.len * (1 - f * 0.6);
      const mid = head - len / 2;
      const a = s.a + s.spin * s.t;
      this.p.set(s.x + Math.cos(a) * mid, s.y, s.z + Math.sin(a) * mid);
      this.e.set(-Math.PI / 2, -a, 0);
      this.q.setFromEuler(this.e);
      // (a hair past a texel at its thinnest, or it vanishes in the pixel art)
      const w = s.width * 1.6 * (1 - f * 0.8) * (f < 0.12 ? 1.4 - f * 3.3 : 1);
      this.m.compose(this.p, this.q, this.s.set(len, Math.max(0.001, w), 1));
      this.mesh.setMatrixAt(n, this.m);
      // (past white, so it blooms; dimming as it goes)
      this.mesh.setColorAt(n, this.c.copy(s.color).multiplyScalar(1.8 * (1 - f * f)));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.list = [];
    this.mesh.count = 0;
  }
}
