/**
 * The owner sheet (sheet.html), for the readability pushes (docs/readability.md): every kind of
 * enemy fire, every player shot and every pickup, drawn by the game's own art through the game's
 * own renderer, on a flat ground, grouped by owner. One row per faction (each accent its planets'
 * foes fire in), the player's shots, then the pickups.
 *
 *   sheet.html                 on neutral grey
 *   sheet.html?ground=e8e0d0   on another ground (salt, snow, night…)
 *   sheet.html?ink             every shape black on white, at in-game size: the silhouettes
 *
 * `window.__sheet` is true once it's drawn (for tools/shot.ts).
 */

import * as THREE from 'three';
import { library } from '../render/assets';
import { PixelRenderer } from '../render/pixel';
import { BulletArt } from '../view/bullets';
import { ShotArt } from '../view/shots';
import { FLIGHT_Y, TILT, fromFlight } from '../sim/types';
import { PALETTE, type Faction } from '../sim/factions';
import type { Bullet, BulletKind, Shot } from '../sim/level';
import { PLANETS } from '../world/planets';
import { factionOf } from '../sim/factions';
import { toon } from '../render/toon';
import { outlined } from '../render/pixel';

const q = new URLSearchParams(location.search);
const INK = q.has('ink');
const GROUND = INK ? 0xffffff : parseInt(q.get('ground') ?? '808080', 16);
const W = 1280;
const H = 720;
const HALF = 36;

const canvas = document.createElement('canvas');
document.body.style.margin = '0';
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
const pixel = new PixelRenderer(renderer);
const scene = new THREE.Scene();
const overlay = new THREE.Scene();
scene.background = new THREE.Color(GROUND);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-30, 60, 20);
scene.add(sun, new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: GROUND }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const aspect = W / H;
const halfH = HALF / aspect;
const cam = new THREE.OrthographicCamera(-HALF, HALF, halfH, -halfH, 1, 400);
cam.position.set(0, FLIGHT_Y + Math.cos(TILT) * 120, Math.sin(TILT) * 120);
cam.lookAt(0, FLIGHT_Y, 0);
cam.updateMatrixWorld();

/** Rows down the screen (flight z), from the top. */
const ROW = (i: number) => -halfH / Math.cos(TILT) + 4 + i * 6.2;
const COL = (j: number) => -HALF + 4 + j * 3.4;

// ── enemy fire: per faction, every accent its foes fire in ────────────────────────────────────
const accents: Record<Faction, number[]> = { scrap: [], lattice: [], wild: [], bloom: [] };
for (const f of Object.keys(PALETTE) as Faction[]) accents[f].push(PALETTE[f][2]);
for (const p of PLANETS) {
  const f = factionOf(p);
  for (const e of [...p.enemies, p.boss]) if (!accents[f].includes(e.colors[2])) accents[f].push(e.colors[2]);
}
const bullets: Bullet[] = [];
const bullet = (x: number, z: number, kind: BulletKind, look: Faction, color: number, seed: number): Bullet => ({
  x, z, vx: 0, vz: 10, r: 0.45, kind, life: 9, t: 1.2, grazed: 0, color, turn: 0, accel: 0, split: 0, splitA: 0, look, seek: -1, hp: 0, seed, open: true, dead: false,
});
const FACTIONS: Faction[] = ['scrap', 'lattice', 'wild', 'bloom'];
FACTIONS.forEach((f, i) => {
  const kinds: BulletKind[] = ['orb', 'needle', 'big', 'mine'];
  kinds.forEach((k, j) => bullets.push(bullet(COL(j * 1.3), ROW(i), k, f, PALETTE[f][2], 0.1 + j * 0.2)));
  accents[f].forEach((c, j) => bullets.push(bullet(COL(6 + j), ROW(i), 'orb', f, c, 0.3 + j * 0.13)));
});
bullets.push(bullet(COL(0), ROW(4), 'torpedo', 'scrap', PALETTE.scrap[2], 0.4), bullet(COL(1.5), ROW(4), 'seeker', 'lattice', PALETTE.lattice[2], 0.6));
const torp = bullets[bullets.length - 2];
torp.t = 1;
const bulletArt = new BulletArt();
overlay.add(bulletArt.group);

// ── the player's shots ────────────────────────────────────────────────────────────────────────
const shot = (x: number, z: number, kind: string, owner = 0, extra: Partial<Shot> = {}): Shot =>
  ({ x, z, vx: 0, vz: -60, dmg: 1, kind, life: 1, t: 0.3, pierce: 0, owner, homing: 0, r: 0.4, hit: [], bounce: 0, marks: 0, markStr: 0, ox: x, oz: z, ...extra }) as Shot;
const shots: Shot[] = ['slug', 'pellet', 'rail', 'missile', 'flak', 'mine'].map((k, j) => shot(COL(4 + j * 1.3), ROW(4), k));
shots.push(shot(COL(12), ROW(4), 'slug', 1));
const shotArt = new ShotArt();
scene.add(shotArt.group);

// ── pickups ───────────────────────────────────────────────────────────────────────────────────
const pickups: THREE.Object3D[] = [];
async function lay() {
  await library.load();
  ['pickup_scrap', 'pickup_scrap_big', 'pickup_repair', 'pickup_part'].forEach((kind, j) => {
    const inst = library.clone(kind);
    const obj = new THREE.Group();
    obj.add(inst?.obj ?? new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), toon(0xff00ff)));
    obj.scale.setScalar(kind === 'pickup_part' ? 1 : kind === 'pickup_repair' ? 2.2 : kind === 'pickup_scrap_big' ? 2.3 : 2);
    // one flat, one turned over a little (as they bob and turn)
    for (const [k, tilt] of [[0, -0.5], [1, 0.6]] as const) {
      const o = k === 0 ? obj : obj.clone(true);
      o.rotation.set(tilt, 0.6 + k, 0);
      o.position.set(COL(j * 2.6 + k * 1.2), FLIGHT_Y + 0.5, fromFlight(ROW(5), FLIGHT_Y + 0.5));
      if (kind !== 'pickup_part') outlined(o);
      scene.add(o);
      pickups.push(o);
    }
  });
}

function draw() {
  const ups = new THREE.Quaternion().copy(cam.quaternion);
  bulletArt.update(1.2, bullets, ups);
  shotArt.update(0.3, shots, ups, [0xffc24a, 0x6affe0]);
  if (INK) {
    // silhouettes: everything black on white (the paint and the grade turned off)
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    scene.overrideMaterial = black;
    overlay.overrideMaterial = black;
    const u = pixel.uniforms;
    u.uBloom.value = 0;
    u.uTone.value = 0;
    u.uVignette.value = 0;
    u.uOutlineStrength.value = 0;
    u.uFoeEdgeStrength.value = 0;
    ground.visible = false;
    scene.background = new THREE.Color(0xffffff);
  }
  pixel.render(scene, cam, 0, 0, W, H, 2, overlay);
}

lay().then(() => {
  draw();
  Object.assign(window, { __sheet: true });
});
