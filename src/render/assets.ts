import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toon } from './toon';
import { enliven } from './alive';

/**
 * How much each kind of plant gives in the wind (0 stiff … 1+ grass). Their geometry gets an
 * `aSway` weight per vertex, growing from the root to the tips, and swaying materials.
 */
const SWAY: Record<string, number> = {
  blue_palm: 1, cycad: 0.7, charred_cycad: 0.25, conifer: 0.45, copper_tree: 0.5, white_tree: 0.6, dead_tree: 0.15,
  giant_fern: 1, tree_fern: 0.9, mangrove: 0.45, dune_grass: 1.4, reed_clump: 1.3, kelp_tower: 0.6, coral_fan: 0.5,
  fungus_coral: 0.25, glow_bulb: 0.5, glowcap: 0.25, glowcap_tall: 0.2, vine_pillar: 0.25, lily_pad: 0.15,
  nomad_tent: 0.12, scav_tent: 0.12,
};

/**
 * The models (public/models/*.glb, built by tools/models/build.py). Every template is a root
 * tagged `kind` (and `variant`); its materials come in as Blender's and are swapped here for
 * banded toon ones: `c_<hex>` a plain colour, `glow_<hex>` lit from within, `skin_<slot>` and
 * `skinglow_<slot>` painted per wearer (an enemy in its planet's colours, a ship in its livery).
 */

export interface Template {
  kind: string;
  variant: number;
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Has skin slots (needs its own materials to be painted). */
  skinned: boolean;
}

export type Skin = [number, number, number];

const MODULES = ['props_a', 'props_b', 'creatures', 'enemies', 'ships', 'bosses'];

class Library {
  private templates = new Map<string, Template[]>();
  ready = false;

  async load(onProgress?: (f: number) => void) {
    const loader = new GLTFLoader();
    let done = 0;
    await Promise.all(
      MODULES.map(async (m) => {
        try {
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${m}.glb`);
          this.add(gltf.scene, gltf.animations);
        } catch (err) {
          console.warn(`models/${m}.glb didn't load`, err);
        }
        onProgress?.(++done / MODULES.length);
      }),
    );
    for (const list of this.templates.values()) list.sort((a, b) => a.variant - b.variant);
    this.ready = true;
  }

  private add(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
    const roots = scene.children.filter((o) => o.userData.kind !== undefined);
    for (const root of roots) {
      root.position.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const sway = SWAY[String(root.userData.kind)];
      if (sway) bakeSway(root, sway);
      let skinned = false;
      const names = new Set<string>();
      root.traverse((o) => {
        names.add(o.name);
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const conv = (m: THREE.Material) => (sway ? swaying(convert(m)) : convert(m));
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(conv) : conv(mesh.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.some((m) => m.userData.skin)) skinned = true;
      });
      const mine = clips.filter((c) => c.tracks.some((t) => names.has(t.name.split('.')[0])));
      const kind = String(root.userData.kind);
      const t: Template = { kind, variant: Number(root.userData.variant ?? 0), root, clips: mine, skinned };
      if (!this.templates.has(kind)) this.templates.set(kind, []);
      this.templates.get(kind)!.push(t);
    }
  }

  has(kind: string) {
    return this.templates.has(kind);
  }

  variants(kind: string) {
    return this.templates.get(kind)?.length ?? 0;
  }

  /**
   * A copy of a template, sharing geometry. With a skin, its painted materials are its own; with
   * `own`, every material is its own (so it can flash when hit).
   */
  clone(kind: string, variant = 0, skin?: Skin, own = false): Instance | null {
    const list = this.templates.get(kind);
    if (!list?.length) return null;
    const t = list[variant % list.length];
    const obj = t.root.clone(true);
    obj.position.set(0, 0, 0);
    const mats: THREE.MeshToonMaterial[] = [];
    if (skin || own) {
      const made = new Map<THREE.Material, THREE.Material>();
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const swap = (m: THREE.Material) => {
          let n = made.get(m);
          if (!n) {
            n = paint(m as THREE.MeshToonMaterial, skin, own);
            made.set(m, n);
            if (n !== m) mats.push(n as THREE.MeshToonMaterial);
          }
          return n;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      });
    }
    let mixer: THREE.AnimationMixer | null = null;
    const actions = new Map<string, THREE.AnimationAction>();
    if (t.clips.length) {
      mixer = new THREE.AnimationMixer(obj);
      for (const c of t.clips) {
        const a = mixer.clipAction(c);
        actions.set(c.name, a);
        if (c.name.endsWith('_idle')) {
          a.play();
          a.time = Math.random() * c.duration; // not all in step
        }
      }
    }
    return new Instance(obj, mixer, actions, mats);
  }
}

/** A placed copy of a template. */
export class Instance {
  constructor(
    readonly obj: THREE.Object3D,
    readonly mixer: THREE.AnimationMixer | null,
    readonly actions: Map<string, THREE.AnimationAction>,
    /** Its own materials (painted or for flashing). */
    readonly mats: THREE.MeshToonMaterial[],
  ) {}

  update(dt: number) {
    this.mixer?.update(dt);
  }

  /** Flash white (0..1). */
  flash(k: number) {
    for (const m of this.mats) {
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.getHex();
        m.userData.baseIntensity = m.emissiveIntensity;
      }
      if (k > 0) {
        m.emissive.setRGB(1, 1, 1);
        m.emissiveIntensity = k;
      } else {
        m.emissive.setHex(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseIntensity;
      }
    }
  }

  /** Play a named clip (by suffix, e.g. 'fire') once. */
  play(suffix: string) {
    for (const [name, a] of this.actions)
      if (name.endsWith(suffix)) {
        a.reset();
        a.setLoop(THREE.LoopOnce, 1);
        a.play();
      }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    this.mixer?.stopAllAction();
  }
}

function convert(m: THREE.Material): THREE.Material {
  const name = m.name;
  const std = m as THREE.MeshStandardMaterial;
  let out: THREE.MeshToonMaterial;
  const skin = /^skin(glow)?_([abc])(?:_s(\d+))?/.exec(name);
  if (skin) {
    out = toon(std.color ?? 0xffffff, { own: true, glow: skin[1] ? 0.9 : 0 });
    out.userData.skin = skin[2];
    out.userData.glow = !!skin[1];
    // a shaded slot: the wearer's colour, darker or lighter (worn plates)
    out.userData.shade = skin[3] ? Number(skin[3]) / 100 : 1;
    return out;
  }
  const glow = /^glow_([0-9a-f]{6})/.exec(name);
  if (glow) return toon(`#${glow[1]}`, { glow: 0.9 });
  const c = /^c_([0-9a-f]{6})/.exec(name);
  if (c) return toon(`#${c[1]}`);
  // something else: keep its colour
  return toon(std.color ?? 0xcccccc);
}

/** The swaying twin of a (shared) material. */
const swayed = new Map<THREE.Material, THREE.Material>();
function swaying(m: THREE.Material): THREE.Material {
  let s = swayed.get(m);
  if (!s) {
    s = m.clone();
    s.userData = { ...m.userData, sway: true };
    enliven(s, { sway: true });
    swayed.set(m, s);
  }
  return s;
}

/**
 * Writes each vertex's `aSway`: its height in the template over the template's height, eased so
 * the trunk stays put and the crown moves, times how much the kind gives.
 */
function bakeSway(root: THREE.Object3D, amount: number) {
  const box = new THREE.Box3().setFromObject(root);
  const top = Math.max(0.5, box.max.y);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry.clone();
    const pos = g.getAttribute('position');
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const h = THREE.MathUtils.clamp(v.y / top, 0, 1);
      w[i] = h * h * amount * Math.max(1, top * 0.25);
    }
    g.setAttribute('aSway', new THREE.BufferAttribute(w, 1));
    mesh.geometry = g;
  });
}

function paint(m: THREE.MeshToonMaterial, skin: Skin | undefined, own: boolean): THREE.Material {
  const slot = m.userData.skin as 'a' | 'b' | 'c' | undefined;
  if (!slot && !own) return m;
  const n = m.clone();
  n.userData = { ...m.userData };
  enliven(n, { sway: !!m.userData.sway });
  if (slot && skin) {
    const col = new THREE.Color(skin['abc'.indexOf(slot)]).multiplyScalar(m.userData.shade ?? 1);
    n.color.copy(col);
    if (m.userData.glow) {
      n.emissive.copy(col);
      n.emissiveIntensity = 0.9;
    }
  }
  return n;
}

export const library = new Library();
