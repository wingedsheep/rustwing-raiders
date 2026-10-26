import type * as THREE from 'three';

/**
 * Sends an instanced mesh's matrices and colours to the GPU, only as far as it has instances in
 * use (`count`): the buffers are sized for the busiest moment, and sent whole they'd go up every
 * frame, a few hundred kilobytes at a time, mostly empty.
 */
export function uploadInstances(mesh: THREE.InstancedMesh) {
  const n = mesh.count;
  if (n === 0) return;
  const m = mesh.instanceMatrix;
  m.clearUpdateRanges();
  m.addUpdateRange(0, n * 16);
  m.needsUpdate = true;
  const c = mesh.instanceColor;
  if (c) {
    c.clearUpdateRanges();
    c.addUpdateRange(0, n * 3);
    c.needsUpdate = true;
  }
}
