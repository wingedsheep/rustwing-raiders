import * as THREE from 'three';

/**
 * The bent world: on a race the course turns, but the sim never knows it. It flies straight down
 * -z, with x across the course; here, as everything is drawn, each point is carried round the
 * course's curve instead: a point at (x, z) goes to the course's line at z, plus x along the way
 * that's "across" there. It's turned and moved so the course at a reference point (the leading
 * ship) runs straight down -z where the sim has it: the chase camera behind the ship looks down
 * the track, and the world swings round as the track turns.
 *
 * It's done in every shader at once: three's own vertex chunks are patched (the projection, and
 * the world position the shadows read), every material gets the uniforms, and the frustum test is
 * loosened to match. The CPU has the same sum (`bendPoint`) for whatever's laid over the screen by
 * hand (the HUD's name tags). Off a race it's switched off and costs a branch.
 *
 * This module has to be loaded before any material is made (main.ts imports it first).
 */

/** Samples in the table, and how far apart (world units along the course). */
const SAMPLES = 256;
const STEP = 1.25;
/** The table starts this far behind the reference point (the rest runs on ahead of it). */
const BEHIND = 50;
/** Loosen the frustum test this much: a thing may be drawn this far from where it is. */
const MARGIN = 48;

const data = new Float32Array(SAMPLES * 4);
const tex = new THREE.DataTexture(data, SAMPLES, 1, THREE.RGBAFormat, THREE.FloatType);
tex.magFilter = THREE.NearestFilter;
tex.minFilter = THREE.NearestFilter;
tex.needsUpdate = true;

/** The shared uniforms (the same objects in every program, so one write reaches them all). */
export const bendUniforms = {
  uBendTex: { value: tex },
  /** x: the table's first z, y: its step, z: its sample count, w: on (1) or off (0). */
  uBend: { value: new THREE.Vector4(0, STEP, SAMPLES, 0) },
};

/**
 * The bend as GLSL: `bendPos(world)` carries a world-space point round the course. Guarded, so a
 * shader that already has it (from three's `common` chunk) can include it again.
 */
export const BEND_GLSL = /* glsl */ `
#ifndef BEND_GLSL
#define BEND_GLSL
uniform sampler2D uBendTex;
uniform vec4 uBend;
vec3 bendPos(vec3 w) {
  if (uBend.w < 0.5) return w;
  float u = (uBend.x - w.z) / uBend.y;
  float n = uBend.z - 1.0;
  float uc = clamp(u, 0.0, n);
  int i0 = int(floor(uc));
  int i1 = min(i0 + 1, int(n));
  vec4 s = mix(texelFetch(uBendTex, ivec2(i0, 0), 0), texelFetch(uBendTex, ivec2(i1, 0), 0), uc - float(i0));
  vec2 f = vec2(sin(s.x), -cos(s.x));
  vec2 r = vec2(cos(s.x), sin(s.x));
  // (past the table's ends, straight on)
  vec2 p = s.yz + f * (u - uc) * uBend.y + r * w.x;
  return vec3(p.x, w.y, p.y);
}
#endif
`;

// three's chunks: the bend goes in `common` (shared by every built-in shader), and is applied
// where a vertex goes from the model to the view, and where the shadows take its world position
{
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.common = C.common + '\n' + BEND_GLSL;
  const pv = 'mvPosition = modelViewMatrix * mvPosition;';
  if (!C.project_vertex.includes(pv)) throw new Error('bend: three changed project_vertex');
  C.project_vertex = C.project_vertex.replace(pv, 'mvPosition = viewMatrix * vec4( bendPos( ( modelMatrix * mvPosition ).xyz ), 1.0 );');
  const wp = 'worldPosition = modelMatrix * worldPosition;';
  if (!C.worldpos_vertex.includes(wp)) throw new Error('bend: three changed worldpos_vertex');
  C.worldpos_vertex = C.worldpos_vertex.replace(wp, wp + '\n\tworldPosition.xyz = bendPos( worldPosition.xyz );');

  // every material gets the uniforms (by reference)
  const proto = THREE.Material.prototype as unknown as { onBeforeCompile: (s: { uniforms: Record<string, unknown> }, r: unknown) => void };
  const base = proto.onBeforeCompile;
  proto.onBeforeCompile = function (shader, renderer) {
    Object.assign(shader.uniforms, bendUniforms);
    base.call(this, shader, renderer);
  };

  // and what's culled allows for it
  const sphere = new THREE.Sphere();
  const inter = THREE.Frustum.prototype.intersectsSphere;
  THREE.Frustum.prototype.intersectsSphere = function (s: THREE.Sphere) {
    if (bendUniforms.uBend.value.w < 0.5) return inter.call(this, s);
    sphere.copy(s);
    sphere.radius += MARGIN;
    return inter.call(this, sphere);
  };
}

/** Hands a material's shader the uniforms (for one whose onBeforeCompile doesn't reach the default). */
export function withBend(shader: { uniforms: Record<string, unknown> }) {
  Object.assign(shader.uniforms, bendUniforms);
}

/** What the bend needs of a course: which way it heads at z, and where its line is (absolute). */
export interface Curve {
  /** Heading at z (radians, + turned right of straight up the screen). */
  heading(z: number): number;
  /** Where the course's line at z is in the bent world, absolute (before the reference frame). */
  at(z: number, out: { x: number; z: number }): { x: number; z: number };
}

const tmp = { x: 0, z: 0 };

/**
 * Turn it on round `curve`, with the frame at `refZ` left as the sim has it: moved so the course
 * there sits at (0, refZ), and (`relative`) turned so it heads straight down -z there too.
 */
export function setBend(curve: Curve, refZ: number, relative = false) {
  const o = curve.at(refZ, { x: 0, z: 0 });
  const h0 = relative ? curve.heading(refZ) : 0;
  const c = Math.cos(h0);
  const s = Math.sin(h0);
  const z0 = refZ + BEHIND;
  for (let i = 0; i < SAMPLES; i++) {
    const z = z0 - i * STEP;
    curve.at(z, tmp);
    const dx = tmp.x - o.x;
    const dz = tmp.z - o.z;
    // (turned by -h0: a heading of h0 becomes straight down -z)
    data[i * 4] = curve.heading(z) - h0;
    data[i * 4 + 1] = dx * c + dz * s;
    data[i * 4 + 2] = -dx * s + dz * c + refZ;
    data[i * 4 + 3] = 0;
  }
  tex.needsUpdate = true;
  bendUniforms.uBend.value.set(z0, STEP, SAMPLES, 1);
}

export function clearBend() {
  bendUniforms.uBend.value.w = 0;
}

export function bendOn() {
  return bendUniforms.uBend.value.w > 0.5;
}

/** The bend on the CPU: where (x, z) is drawn. (y is untouched.) */
export function bendPoint(x: number, z: number, out = { x: 0, z: 0 }) {
  const b = bendUniforms.uBend.value;
  if (b.w < 0.5) {
    out.x = x;
    out.z = z;
    return out;
  }
  const u = (b.x - z) / b.y;
  const n = b.z - 1;
  const uc = Math.min(Math.max(u, 0), n);
  const i0 = Math.floor(uc);
  const i1 = Math.min(i0 + 1, n);
  const t = uc - i0;
  const ph = data[i0 * 4] + (data[i1 * 4] - data[i0 * 4]) * t;
  const cx = data[i0 * 4 + 1] + (data[i1 * 4 + 1] - data[i0 * 4 + 1]) * t;
  const cz = data[i0 * 4 + 2] + (data[i1 * 4 + 2] - data[i0 * 4 + 2]) * t;
  const ex = (u - uc) * b.y;
  out.x = cx + Math.sin(ph) * ex + Math.cos(ph) * x;
  out.z = cz - Math.cos(ph) * ex + Math.sin(ph) * x;
  return out;
}

/** How far the drawn world is turned at z (radians, relative to the reference frame). */
export function bendAngle(z: number) {
  const b = bendUniforms.uBend.value;
  if (b.w < 0.5) return 0;
  const uc = Math.min(Math.max((b.x - z) / b.y, 0), b.z - 1);
  const i0 = Math.floor(uc);
  const i1 = Math.min(i0 + 1, b.z - 1);
  return data[i0 * 4] + (data[i1 * 4] - data[i0 * 4]) * (uc - i0);
}
