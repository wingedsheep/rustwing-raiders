import * as THREE from 'three';
import { library, type Instance, type Skin } from '../render/assets';
import { cellPos, cellsOf, centre, gunDir, rotOf, type Build } from '../sim/build';
import { CELL, frameById, partById, verbOf } from '../game/parts';
import { flat, GEO, part, toon } from '../render/toon';

/** The two liveries: rust and cream, teal and cream. */
export const LIVERY: Skin[] = [
  [0xc8642a, 0xecdcb8, 0xffc24a],
  [0x2a8a96, 0xe8e0c8, 0x6affe0],
];

export const DECK = 0.3;

/**
 * A ship as built: the frame's hull with every part bolted on where it sits in the grid, guns
 * turned the way they fire, all in the player's livery. Also the engine glows (scaled with thrust
 * by the view) and where the guns' muzzles are.
 */
export class ShipModel {
  readonly root = new THREE.Group();
  /** Leans and pitches with the flying, inside root. */
  readonly body = new THREE.Group();
  readonly instances: Instance[] = [];
  /** Glowing exhaust cones, scaled by the view. */
  readonly flames: THREE.Mesh[] = [];
  /** A little glowing dot at the ship's core (shown when focusing). */
  readonly core: THREE.Mesh;
  readonly shield: THREE.Mesh;

  constructor(build: Build, livery: Skin) {
    this.root.add(this.body);
    const f = frameById(build.frame);
    const frame = library.clone(`frame_${f.id}`, 0, livery, true);
    if (frame) {
      this.body.add(frame.obj);
      this.instances.push(frame);
    } else {
      // no models yet: a plain hull under the sockets
      const rows = f.grid.length;
      const cols = f.grid[0].length;
      this.body.add(part(GEO.box, toon(livery[0]), [0, 0, 0], [cols * 0.8, 0.4, rows * 0.8]));
      this.body.add(part(GEO.cone4, toon(livery[1]), [0, 0.1, -rows * 0.4 - 0.4], [0.8, 0.8, 0.4], [-Math.PI / 2, 0, Math.PI / 4]));
    }
    for (const p of build.parts) {
      const def = partById(p.id);
      // the model's origin is the shape's first cell, wherever turning put it
      const [c, r] = cellsOf(p)[0];
      const pos = cellPos(f, c, r);
      const turn = -rotOf(p) * (Math.PI / 2);
      const inst = library.clone(`part_${p.id}`, 0, livery, true);
      const obj = inst ? inst.obj : fallback(def.shape, def.gun ? 0x6a6a72 : (FALLBACK_TINT[verbOf(def)] ?? livery[1]));
      obj.position.set(pos.x, DECK, pos.z);
      obj.rotation.y = turn;
      const dir = def.gun ? gunDir(f, p) : 0;
      if (Math.abs(dir) > 0.01) {
        // turned round the middle of its cells (its origin is its first cell)
        const cc = centre(f, p);
        const off = new THREE.Vector3(pos.x - cc.x, 0, pos.z - cc.z).applyAxisAngle(UP, -dir);
        obj.position.set(cc.x + off.x, DECK, cc.z + off.z);
        // three turns +y counter-clockwise from above; dir is clockwise (to the right)
        obj.rotation.y = turn - dir;
      }
      this.body.add(obj);
      if (inst) this.instances.push(inst);
      if (def.cls === 'engine') {
        // exhaust glow behind it
        const cells = cellsOf(p);
        const back = Math.max(...cells.map(([, rr]) => rr));
        const bp = cellPos(f, c, back);
        const flame = part(GEO.cone, flat(livery[2], { additive: true }), [bp.x, DECK + 0.2, bp.z + 0.75], [0.45, 1, 0.45], [Math.PI / 2, 0, 0]);
        flame.geometry = FLAME;
        this.body.add(flame);
        this.flames.push(flame);
      }
    }
    if (!this.flames.length) {
      // every ship has a little main engine
      const rows = f.grid.length;
      const flame = part(FLAME, flat(livery[2], { additive: true }), [0, DECK, rows * 0.4 + 0.4], [0.4, 0.8, 0.4], [Math.PI / 2, 0, 0]);
      this.body.add(flame);
      this.flames.push(flame);
    }
    this.core = part(GEO.sphere, flat(0xffffff), [0, 1.2, 0], 0.55);
    this.core.renderOrder = 20;
    (this.core.material as THREE.Material).depthTest = false;
    this.core.visible = false;
    this.root.add(this.core);
    this.shield = part(GEO.sphere, flat(livery[2], { opacity: 0.25, additive: true }), [0, 0.3, 0], [3.6, 1.4, 3.6]);
    this.shield.visible = false;
    this.root.add(this.shield);
  }

  update(dt: number) {
    for (const i of this.instances) i.update(dt);
  }

  flash(k: number) {
    for (const i of this.instances) i.flash(k);
  }

  dispose() {
    for (const i of this.instances) i.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** No model yet (a new part): a block per cell, tinted by what it does. */
const FALLBACK_TINT: Record<string, number> = { 'DASH MOD': 0x4a9ad0, AUX: 0xd0a030, PASSIVE: 0x9a6ad0 };
function fallback(shape: [number, number][], color: number) {
  const g = new THREE.Group();
  for (const [dc, dr] of shape) g.add(part(GEO.box, toon(color), [dc * CELL, 0.25, dr * CELL], [0.6, 0.5, 0.6]));
  return g;
}
// a cone pointing back along +y (rotated to +z by the mesh), with its base at the origin
const FLAME = new THREE.ConeGeometry(0.5, 1, 6).translate(0, -0.5, 0).rotateZ(Math.PI);

