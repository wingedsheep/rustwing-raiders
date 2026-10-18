import * as THREE from 'three';
import type { Game } from '../game/game';
import { VIEW } from '../ui/hud';

/**
 * A little 3D set for the menu screens: a scene, an orthographic camera looking down at a tilt, a
 * sun and sky light, drawn through the pixel renderer into a rectangle of the safe area (UI
 * texels). With `bleed`, sides of the rectangle that touch the safe area's edge run on to the
 * window's edge, showing more of the set rather than stretching it.
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  readonly hemi = new THREE.HemisphereLight(0xc8d0ff, 0x302838, 1.2);
  /** World units per UI texel. */
  private readonly unit: number;

  /** `ppu`: UI texels per world unit; `tilt`: degrees from looking straight down. */
  constructor(
    readonly w: number,
    readonly h: number,
    ppu: number,
    tilt = 35,
    readonly target = new THREE.Vector3(),
    readonly bleed = false,
  ) {
    this.unit = 1 / ppu;
    const hw = w / 2 / ppu;
    const hh = h / 2 / ppu;
    this.camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 300);
    const t = THREE.MathUtils.degToRad(tilt);
    this.camera.position.set(target.x, target.y + Math.cos(t) * 100, target.z + Math.sin(t) * 100);
    this.camera.lookAt(target);
    this.sun.position.set(-30, 60, 20);
    this.scene.add(this.sun, this.hemi);
  }

  /** Draws it with its top-left at (x, y) in safe-area texels. */
  render(game: Game, x: number, y: number) {
    const u = game.pixel.uniforms;
    u.uFlash.value.w = 0;
    u.uHurt.value = 0;
    u.uHeat.value = 0;
    u.uSpeed.value = 0;
    u.uFade.value = 0;
    u.uVignette.value = 0.35;
    u.uTone.value = 0.3;
    u.uShade.value.setRGB(0.55, 0.6, 0.85);
    u.uLight.value.setRGB(1, 0.95, 0.85);
    u.uGrade.value.set(1.1, 1.05, 1);
    u.uTime.value = game.time;
    // the rectangle, run on to the window's edges where it touches the safe area's
    let x0 = x;
    let y0 = y;
    let x1 = x + this.w;
    let y1 = y + this.h;
    if (this.bleed) {
      if (x0 <= 0) x0 = -VIEW.ox;
      if (y0 <= 0) y0 = -VIEW.oy;
      if (x1 >= 640) x1 = VIEW.w - VIEW.ox;
      if (y1 >= 360) y1 = VIEW.h - VIEW.oy;
    }
    const cam = this.camera;
    const k = this.unit;
    const mx = x + this.w / 2;
    const my = y + this.h / 2;
    const saved = [cam.left, cam.right, cam.top, cam.bottom];
    cam.left = (x0 - mx) * k;
    cam.right = (x1 - mx) * k;
    cam.top = (my - y0) * k;
    cam.bottom = (my - y1) * k;
    cam.updateProjectionMatrix();
    const r = game.deviceRect(x0, y0, x1 - x0, y1 - y0);
    // as fine as the flight's art pixels, but never coarser than a UI texel
    game.pixel.render(this.scene, cam, r.x, r.y, r.w, r.h, Math.min(game.px, game.uiScale));
    [cam.left, cam.right, cam.top, cam.bottom] = saved;
    cam.updateProjectionMatrix();
  }

  /** Safe-area texel position of a world point, relative to this stage's top-left. */
  project(p: THREE.Vector3, out = { x: 0, y: 0 }) {
    const v = p.clone().project(this.camera);
    out.x = ((v.x + 1) / 2) * this.w;
    out.y = ((1 - v.y) / 2) * this.h;
    return out;
  }
}
