import * as THREE from 'three';
import { PixelRenderer } from '../render/pixel';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { CELL, partById } from '../game/parts';
import { CLASS_COLOR } from '../ui/hud';
import { LIVERY } from './ship-model';

/** Pictures in a turn, and how long a turn takes (s). */
const FRAMES = 60;
const TURN = 6;
/** Pictures baked per portrait per draw, so a new card never stalls a frame. */
const PER_DRAW = 12;
/** The backdrop: the card well's ink, lifted a little so the vignette has somewhere to go. */
const BACKDROP = 0x1e1630;

interface Portrait {
  /** FRAMES pictures side by side, `size` square each. */
  strip: HTMLCanvasElement;
  size: number;
  done: number;
  /** The set while it's being baked (dropped once it's done). */
  set: { pivot: THREE.Group; inst: Instance; half: number; lift: number } | null;
}

/**
 * Part portraits for the cards: each part's model on its socket tiles, turning slowly, in the
 * game's own look (toon light, ink outlines, bloom). They're baked once, a turn's worth of
 * pictures into a strip, by a little renderer of their own off screen, so they can be drawn on
 * the 2D UI like any sprite: under a card's dimming, inside its flip, at any size the card asks.
 */
class Portraits {
  private renderer: THREE.WebGLRenderer | null = null;
  private pixel: PixelRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
  private readonly cache = new Map<string, Portrait>();

  constructor() {
    this.scene.background = new THREE.Color(BACKDROP);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-30, 60, 30);
    this.scene.add(sun, new THREE.HemisphereLight(0xc8d0ff, 0x302838, 1.3));
    const tilt = THREE.MathUtils.degToRad(38);
    this.camera.position.set(0, Math.cos(tilt) * 100, Math.sin(tilt) * 100);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Draws part `id` turning (at `t` seconds) into a `size`-texel square at (x, y), painted in
   * player `livery`'s colours. False if there's no model for it (draw something else).
   */
  draw(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, t: number, livery = 0) {
    const key = `${id}@${size}:${livery}`;
    let p = this.cache.get(key);
    if (!p) {
      const made = this.make(id, size, livery);
      if (!made) return false;
      p = made;
      this.cache.set(key, p);
    }
    if (p.done < FRAMES) this.bake(p, PER_DRAW);
    const want = Math.floor(((t % TURN) / TURN) * FRAMES);
    const k = Math.min(want, p.done - 1);
    ctx.drawImage(p.strip, k * size, 0, size, size, x, y, size, size);
    return true;
  }

  private make(id: string, size: number, livery: number): Portrait | null {
    const inst = library.clone(`part_${id}`, 0, LIVERY[livery % LIVERY.length], true);
    if (!inst) return null;
    const def = partById(id);
    const pivot = new THREE.Group();
    const body = new THREE.Group();
    pivot.add(body);
    // its socket tiles, rimmed in its class colour, and the part on them
    const rim = flat(CLASS_COLOR[def.cls]);
    const deck = toon(0x3a3446);
    for (const [c, r] of def.shape) {
      const x = c * CELL;
      const z = r * CELL;
      body.add(part(GEO.box, deck, [x, -0.06, z], [CELL - 0.06, 0.12, CELL - 0.06]));
      for (const [dx, dz, w, d] of [[0, -0.36, 0.74, 0.05], [0, 0.36, 0.74, 0.05], [-0.36, 0, 0.05, 0.74], [0.36, 0, 0.05, 0.74]])
        body.add(part(GEO.box, rim, [x + dx, -0.01, z + dz], [w, 0.03, d]));
    }
    body.add(inst.obj);
    // turn about the middle of its cells
    const cols = def.shape.map(([c]) => c * CELL);
    const rows = def.shape.map(([, r]) => r * CELL);
    body.position.set(-(Math.min(...cols) + Math.max(...cols)) / 2, 0, -(Math.min(...rows) + Math.max(...rows)) / 2);
    pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pivot);
    let reach = 0;
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) reach = Math.max(reach, Math.hypot(x, z));
    const strip = document.createElement('canvas');
    strip.width = size * FRAMES;
    strip.height = size;
    return { strip, size, done: 0, set: { pivot, inst, half: reach * 0.9 + 0.1, lift: box.max.y * 0.32 } };
  }

  private bake(p: Portrait, n: number) {
    const set = p.set!;
    const r = this.ensure(p.size);
    const pixel = this.pixel!;
    const u = pixel.uniforms;
    u.uFlash.value.w = 0;
    u.uHurt.value = 0;
    u.uHeat.value = 0;
    u.uSpeed.value = 0;
    u.uFade.value = 0;
    u.uVignette.value = 0.7;
    u.uTone.value = 0.3;
    u.uShade.value.setRGB(0.55, 0.6, 0.85);
    u.uLight.value.setRGB(1, 0.95, 0.85);
    u.uGrade.value.set(1.1, 1.05, 1);
    u.uTime.value = 0;
    // crisper than the flight: at this size the brushwork smears and the ink is what reads
    u.uPaint.value = 0.3;
    u.uBloom.value = 0.45;
    u.uOutlineStrength.value = 0.85;
    const cam = this.camera;
    cam.left = -set.half;
    cam.right = set.half;
    cam.top = set.half;
    cam.bottom = -set.half;
    cam.position.y = Math.cos(THREE.MathUtils.degToRad(38)) * 100 + set.lift;
    cam.updateProjectionMatrix();
    this.scene.add(set.pivot);
    const ctx = p.strip.getContext('2d')!;
    for (let k = 0; k < n && p.done < FRAMES; k++, p.done++) {
      set.pivot.rotation.y = -(p.done / FRAMES) * Math.PI * 2;
      set.inst.update(p.done ? TURN / FRAMES : 0);
      pixel.render(this.scene, cam, 0, 0, p.size, p.size, 1);
      ctx.drawImage(r.domElement, 0, 0, p.size, p.size, p.done * p.size, 0, p.size, p.size);
    }
    this.scene.remove(set.pivot);
    if (p.done >= FRAMES) {
      set.inst.dispose();
      p.set = null;
    }
  }

  /** The renderer, made the first time it's wanted, its canvas `size` square. */
  private ensure(size: number) {
    if (!this.renderer) {
      const canvas = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(BACKDROP, 1);
      this.pixel = new PixelRenderer(this.renderer);
    }
    const c = this.renderer.domElement;
    if (c.width !== size || c.height !== size) this.renderer.setSize(size, size, false);
    return this.renderer;
  }
}

export const portraits = new Portraits();
