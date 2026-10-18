import * as THREE from 'three';
import type { Enemy, Level } from '../sim/level';
import type { Fx } from './fx';
import { FLIGHT_Y, fromFlight } from '../sim/types';

/**
 * Enemy shields as things of light: a dome of hex cells (a wedge of one in front, for a shield
 * that faces you; a whole bubble round a boss that's closed up). It shimmers while it holds;
 * every shot it stops sends a ripple across it from where it struck and lights the cells there,
 * so you see your fire land even when it does nothing. It shatters when it drops.
 */

const HITS = 6;
const WHITE = new THREE.Color(1, 1, 1);

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec2 vUv;
  void main() {
    vLocal = position;
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLit;
  uniform float uBreak;
  uniform float uRadius;
  uniform float uEdge;
  uniform vec4 uHits[${HITS}];
  varying vec3 vLocal;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  varying vec2 vUv;

  // distance to the nearest hex cell's edge (0 on the edge), and the cell's id
  vec3 hex(vec2 p) {
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 c = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - c.xy * s, p - (c.zw + 0.5) * s);
    vec4 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, c.xy) : vec4(h.zw, c.zw + 0.5);
    vec2 a = abs(g.xy);
    float d = 0.5 - max(dot(a, s * 0.5), a.x);
    return vec3(d, g.zw);
  }
  float rnd(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }

  void main() {
    float rim = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir)));
    vec3 h = hex(vec2(vUv.x * uEdge, vUv.y * 7.0));
    float line = 1.0 - smoothstep(0.0, 0.07, h.x);
    float id = rnd(h.yz);
    // cells breathing in and out of sight, and a band of light sweeping up
    float twinkle = 0.5 + 0.5 * sin(uTime * (1.5 + id * 2.5) + id * 40.0);
    float sweep = smoothstep(0.85, 1.0, sin(vUv.y * 9.0 - uTime * 3.0 + vUv.x * 2.0));
    float a = 0.08 + rim * rim * 0.85 + line * (0.24 + 0.24 * twinkle) + sweep * 0.15;
    // where shots struck: a ring running out from the spot, and the cells there lit
    float struck = 0.0;
    for (int i = 0; i < ${HITS}; i++) {
      vec4 k = uHits[i];
      if (k.w > 1.0) continue;
      float d = distance(vLocal, k.xyz) / uRadius;
      float ring = 1.0 - smoothstep(0.0, 0.18, abs(d - k.w * 2.2));
      float spot = (1.0 - smoothstep(0.0, 0.5, d)) * (1.0 - k.w);
      struck += (ring * (1.0 - k.w) * 1.4 + spot * (0.6 + line * 1.4)) ;
    }
    a += struck + uLit * (0.4 + line * 0.6);
    // shattering: cells drop out one by one
    if (id < uBreak * 1.2) discard;
    vec3 col = mix(uColor, vec3(1.0), clamp(struck * 0.6 + uLit * 0.5 + line * 0.25, 0.0, 1.0));
    gl_FragColor = vec4(col * a * (1.0 - uBreak * 0.6), 1.0);
    #include <colorspace_fragment>
  }
`;

interface View {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  hits: THREE.Vector4[];
  next: number;
  /** A fresh hit's flare, decaying. */
  lit: number;
  /** Shattering: 0 holding … 1 gone. */
  breakT: number;
  bubble: boolean;
  seen: boolean;
  /** Pushed by the hit: springs back. */
  bump: number;
}

/** What shape a shield takes on an enemy right now, if it has one up. */
function shieldOf(e: Enemy): 'wedge' | 'bubble' | null {
  if (e.dead || e.t < 0 || e.state === 'hidden') return null;
  if (e.guard > 0) return 'wedge';
  if (e.boss && e.shielded && e.t >= 3.5) return 'bubble';
  return null;
}

export class Shields {
  readonly group = new THREE.Group();
  private views = new Map<number, View>();
  private dying: View[] = [];
  private time = 0;
  private v = new THREE.Vector3();

  constructor(private fx: Fx) {}

  private make(e: Enemy, bubble: boolean): View {
    const r = bubble ? e.r * 1.35 + 1 : e.r + 1.3;
    // a wedge: the front of a dome, as wide as the shield's arc; a bubble: the whole of one
    const geo = bubble
      ? new THREE.SphereGeometry(r, 36, 18)
      : new THREE.SphereGeometry(r, 24, 12, Math.PI / 2 - e.guard, e.guard * 2, Math.PI * 0.18, Math.PI * 0.64);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(e.skin.colors[2]).lerp(new THREE.Color(0x9af0ff), 0.5) },
        uTime: { value: 0 },
        uLit: { value: 0 },
        uBreak: { value: 0 },
        uRadius: { value: r },
        uEdge: { value: bubble ? 22 : Math.max(4, Math.round(e.guard * 7)) },
        uHits: { value: Array.from({ length: HITS }, () => new THREE.Vector4(0, 0, 0, 9)) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 23;
    this.group.add(mesh);
    return { mesh, mat, hits: mat.uniforms.uHits.value, next: 0, lit: 0, breakT: 0, bubble, seen: true, bump: 0 };
  }

  /** A shot stopped at (x, z): a ripple from there. Returns the shield's outward normal there (for sparks), if there is a shield. */
  hit(e: Enemy, x: number, z: number): { nx: number; nz: number } | null {
    const view = this.views.get(e.id);
    if (!view) return null;
    const m = view.mesh;
    m.updateMatrixWorld();
    const p = m.worldToLocal(this.v.set(x, FLIGHT_Y + 0.5, z));
    p.setLength((m.geometry as THREE.SphereGeometry).parameters.radius);
    view.hits[view.next].set(p.x, p.y, p.z, 0);
    view.next = (view.next + 1) % HITS;
    view.lit = 1;
    view.bump = 1;
    const dx = x - e.x;
    const dz = z - e.z;
    const l = Math.hypot(dx, dz) || 1;
    return { nx: dx / l, nz: dz / l };
  }

  /** It dropped its shield: shatter it. Returns whether there was one to shatter. */
  shatter(id: number) {
    const view = this.views.get(id);
    if (!view) return false;
    this.views.delete(id);
    view.lit = 1;
    this.dying.push(view);
    // its cells fly apart: motes of light, and glassy flakes that fall to the ground
    const geo = view.mesh.geometry as THREE.SphereGeometry;
    const { radius, phiStart, phiLength } = geo.parameters;
    const col = view.mat.uniforms.uColor.value as THREE.Color;
    const p = view.mesh.position;
    for (let k = 0; k < (view.bubble ? 26 : 14); k++) {
      // (a sphere's phi runs from -x towards +z; turned by the mesh's yaw)
      const phi = phiStart + Math.random() * phiLength;
      const a = Math.atan2(-Math.cos(phi), Math.sin(phi)) + view.mesh.rotation.y;
      const x = p.x + Math.sin(a) * radius;
      const z = p.z + Math.cos(a) * radius;
      const v = 6 + Math.random() * 10;
      this.fx.add({ x, y: p.y + 0.5, z, vx: Math.sin(a) * v, vz: Math.cos(a) * v, vy: Math.random() * 4, size: 0.3, grow: 0.2, life: 0.35 + Math.random() * 0.2, drag: 3, color: col.clone().lerp(WHITE, 0.4).multiplyScalar(1.4), carried: true });
      if (k % 2) this.fx.add({ x, y: p.y, z, vx: Math.sin(a) * v * 0.5, vz: Math.cos(a) * v * 0.5, vy: 3 + Math.random() * 4, size: 0.25, life: 1.4, color: col, solid: true, gravity: 22, spin: 12 });
    }
    this.fx.ring(p.x, p.y + 0.5, p.z, radius * 1.4, 0.25, true, col.getHex());
    return true;
  }

  update(dt: number, lv: Level) {
    this.time += dt;
    for (const v of this.views.values()) v.seen = false;
    for (const e of lv.enemies) {
      const kind = shieldOf(e);
      if (!kind) continue;
      let view = this.views.get(e.id);
      if (view && view.bubble !== (kind === 'bubble')) {
        this.shatter(e.id);
        view = undefined;
      }
      if (!view) {
        view = this.make(e, kind === 'bubble');
        this.views.set(e.id, view);
        view.lit = 0.8; // switching on
      }
      view.seen = true;
      const groundZ = e.ground ? fromFlight(e.z, e.y) : e.z;
      view.mesh.position.set(e.x, e.y + (view.bubble ? 0 : 0.2), groundZ);
      // (the dome's front is its +z: turned to face the shield's aim)
      if (!view.bubble) view.mesh.rotation.y = e.aim;
    }
    // gone without a word (killed, or it put the shield down): shatter it anyway
    for (const [id, view] of this.views) if (!view.seen) this.shatter(id);
    const tick = (view: View) => {
      const u = view.mat.uniforms;
      u.uTime.value = this.time;
      view.lit = Math.max(0, view.lit - dt * 5);
      view.bump = Math.max(0, view.bump - dt * 9);
      for (const h of view.hits) if (h.w <= 1) h.w += dt * 2.6;
      u.uLit.value = view.lit;
      u.uBreak.value = view.breakT;
      view.mesh.scale.setScalar(1 + view.bump * 0.06 + view.breakT * 0.25);
    };
    for (const view of this.views.values()) tick(view);
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const view = this.dying[i];
      view.breakT = Math.min(1, view.breakT + dt * 4);
      tick(view);
      if (view.breakT >= 1) {
        this.disposeView(view);
        this.dying.splice(i, 1);
      }
    }
  }

  private disposeView(view: View) {
    this.group.remove(view.mesh);
    view.mesh.geometry.dispose();
    view.mat.dispose();
  }

  dispose() {
    for (const v of this.views.values()) this.disposeView(v);
    for (const v of this.dying) this.disposeView(v);
    this.views.clear();
    this.dying = [];
  }
}
