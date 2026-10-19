import * as THREE from 'three';
import { flat, GEO, part, toon } from '../render/toon';

/**
 * The hangar floor under a ship being built: deck plates with seams, worn hazard paint, and a
 * turntable the ship sits over, its rim lit in the player's colour. Returns the turntable (turn
 * it with the ship).
 */
export function bayFloor(scene: THREE.Scene, accent: number): THREE.Group {
  const floor = new THREE.Group();
  const y = -1.1;
  floor.add(part(GEO.box, toon(0x221c2c), [0, y - 0.3, 0], [60, 0.6, 60]));
  // plate seams
  const seam = toon(0x161220);
  for (let k = -7; k <= 7; k++) {
    floor.add(part(GEO.box, seam, [k * 4, y + 0.01, 0], [0.12, 0.02, 60]));
    floor.add(part(GEO.box, seam, [0, y + 0.01, k * 4], [60, 0.02, 0.12]));
  }
  // bolt heads at the seams' crossings, and a few lighter, newer plates
  const bolt = toon(0x3a3246);
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) floor.add(part(GEO.cyl6, bolt, [i * 4, y + 0.03, j * 4], [0.3, 0.06, 0.3]));
  const patch = toon(0x2a2236);
  for (const [i, j] of [[-2, -1], [1, 1], [2, -2], [-1, 2]]) floor.add(part(GEO.box, patch, [i * 4 + 2, y + 0.005, j * 4 + 2], [3.8, 0.01, 3.8]));
  // hazard stripes round the pad
  const amber = toon(0x5e4a26);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    if (k % 2) continue;
    floor.add(part(GEO.box, amber, [Math.cos(a) * 4.5, y + 0.02, Math.sin(a) * 4.5], [0.4, 0.02, 0.9], [0, -a, 0]));
  }
  // a pool of light under the ship
  floor.add(part(GEO.disc, flat(0xffe0b0, { opacity: 0.07, additive: true }), [0, y + 0.03, 0], [9, 9, 1], [-Math.PI / 2, 0, 0]));
  scene.add(floor);

  const pad = new THREE.Group();
  pad.position.y = y;
  pad.add(part(GEO.cyl, toon(0x2e2838), [0, 0.12, 0], [7.4, 0.24, 7.4]));
  pad.add(part(GEO.cyl, toon(0x3a3448), [0, 0.26, 0], [6.4, 0.06, 6.4]));
  // a glowing rim, broken into segments so the turning shows
  const glow = flat(new THREE.Color(accent).multiplyScalar(0.75));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    pad.add(part(GEO.box, glow, [Math.cos(a) * 3.55, 0.26, Math.sin(a) * 3.55], [0.1, 0.05, 0.8], [0, -a, 0]));
  }
  // clamps the ship sits in
  const clamp = toon(0x4a4456);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    pad.add(part(GEO.box, clamp, [Math.cos(a) * 2.9, 0.34, Math.sin(a) * 2.9], [0.7, 0.16, 0.4], [0, -a, 0]));
  }
  scene.add(pad);
  return pad;
}
