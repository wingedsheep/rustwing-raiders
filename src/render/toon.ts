import * as THREE from 'three';
import { enliven } from './alive';

/**
 * Banded ("toon") lighting: diffuse light falls off in a handful of soft steps, which keeps the
 * render reading as painted rather than smooth 3D, without the hard posterised look of a few.
 */
function gradient(steps: number[]): THREE.DataTexture {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  // linear: the steps blend a little into each other, like wet paint
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export const GRADIENT = gradient([62, 70, 118, 128, 172, 180, 222, 232, 255, 255]);

const cache = new Map<string, THREE.Material>();

export interface ToonOpts {
  /** Emissive: lights itself (engine glow, lava, neon). 0..1+ */
  glow?: number;
  vertexColors?: boolean;
  /** A material of its own (to recolour or flash), not the shared cached one. */
  own?: boolean;
  /** Bends in the wind by the geometry's `aSway` attribute. */
  sway?: boolean;
  transparent?: boolean;
  opacity?: number;
}

/** Shared toon material for a flat colour. */
export function toon(color: THREE.ColorRepresentation, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const c = new THREE.Color(color);
  const key = `${c.getHexString()}:${opts.glow ?? 0}:${opts.vertexColors ? 1 : 0}:${opts.opacity ?? 1}:${opts.sway ? 1 : 0}`;
  let mat = opts.own ? undefined : (cache.get(key) as THREE.MeshToonMaterial | undefined);
  if (!mat) {
    mat = new THREE.MeshToonMaterial({
      color: c,
      gradientMap: GRADIENT,
      vertexColors: !!opts.vertexColors,
      transparent: !!opts.transparent || (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    if (opts.glow) {
      mat.emissive = c.clone();
      mat.emissiveIntensity = opts.glow;
    }
    enliven(mat, { sway: opts.sway });
    if (!opts.own) cache.set(key, mat);
  }
  return mat;
}

/** Unlit flat colour: bullets, flashes, glows. Always reads at full brightness. */
export function flat(color: THREE.ColorRepresentation, opts: { own?: boolean; opacity?: number; additive?: boolean } = {}) {
  const c = new THREE.Color(color);
  const key = `flat:${c.getHexString()}:${opts.opacity ?? 1}:${opts.additive ? 1 : 0}`;
  let mat = opts.own ? undefined : (cache.get(key) as THREE.MeshBasicMaterial | undefined);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      color: c,
      transparent: (opts.opacity ?? 1) < 1 || !!opts.additive,
      opacity: opts.opacity ?? 1,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !opts.additive,
    });
    if (!opts.own) cache.set(key, mat);
  }
  return mat;
}

/** Shared unit geometries: scale the mesh instead of making new ones. */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.IcosahedronGeometry(0.5, 1),
  ball: new THREE.IcosahedronGeometry(0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cone6: new THREE.ConeGeometry(0.5, 1, 6),
  oct: new THREE.OctahedronGeometry(0.5, 0),
  tet: new THREE.TetrahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.12, 6, 12),
  plane: new THREE.PlaneGeometry(1, 1),
  disc: new THREE.CircleGeometry(0.5, 12),
};

/** A mesh from a shared geometry and a colour, placed, scaled and turned in one go. */
export function part(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] | number = 1,
  rot: [number, number, number] = [0, 0, 0],
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (typeof scale === 'number') m.scale.setScalar(scale);
  else m.scale.set(...scale);
  m.rotation.set(...rot);
  return m;
}
