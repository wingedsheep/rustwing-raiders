import * as THREE from 'three';

/**
 * A ship or a foe gone under something (a bridge, a canopy) shows through it as a silhouette, the
 * way the eye fills in what it knows is there: the thing over it stays solid, so it reads as over.
 *
 * Each mesh gets a twin sharing its geometry, drawn after the world only where something is nearer
 * the camera than it. It's nudged a little towards the camera first, so a wing over the hull
 * doesn't silhouette the hull: only what's well above (a deck at 20, a crown of leaves) does.
 */

const mats = new Map<string, THREE.MeshBasicMaterial>();

function xrayMat(color: number, opacity: number) {
  const key = `${color}:${opacity}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `#include <project_vertex>
        gl_Position = projectionMatrix * (mvPosition + vec4(0.0, 0.0, 3.0, 0.0));`,
      );
    };
    m.customProgramCacheKey = () => 'xray';
    mats.set(key, m);
  }
  return m;
}

/** Gives every mesh under `obj` its silhouette twin, in `color`. */
export function xray(obj: THREE.Object3D, color: number, opacity = 0.75) {
  const mat = xrayMat(color, opacity);
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // (not glows, rings and other see-through bits: only what's solid)
    if (!mesh.isMesh || mesh.userData.xray) return;
    const m = mesh.material as THREE.Material;
    if (Array.isArray(mesh.material) || m.transparent || !m.depthTest) return;
    meshes.push(mesh);
  });
  for (const mesh of meshes) {
    const twin = new THREE.Mesh(mesh.geometry, mat);
    twin.userData.xray = true;
    twin.renderOrder = 30;
    twin.castShadow = twin.receiveShadow = false;
    twin.frustumCulled = mesh.frustumCulled;
    mesh.add(twin);
  }
}
