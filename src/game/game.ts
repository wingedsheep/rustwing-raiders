import * as THREE from 'three';
import { PixelRenderer } from '../render/pixel';
import { input, type DeviceId, type MenuInput } from '../input';
import { audio } from '../audio';
import { W, H, VIEW } from '../ui/hud';
import { drawText } from '../ui/font';
import type { Run } from '../sim/run';

export interface Screen {
  update(dt: number): void;
  draw(): void;
  dispose?(): void;
  /** Draws its UI over the whole window, not into the 640 × 360 safe area. */
  readonly fullUI?: boolean;
}

/**
 * The game around the screens: the canvases (WebGL for the 3D at the window's full resolution,
 * drawn through the pixel renderer; a 2D one over it for text and panels, in UI texels blown up
 * in whole steps), the loop, who's playing on what, and the run in progress.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly pixel: PixelRenderer;
  readonly ui: CanvasRenderingContext2D;
  private screen: Screen | null = null;
  /** Each player's device, P1 first. */
  devices: DeviceId[] = [];
  run: Run | null = null;
  readonly params = new URLSearchParams(location.search);
  private last = performance.now();
  time = 0;
  private frameMs = 16;
  /** Device pixels: the canvas size, a UI texel, and an art pixel of the 3D. */
  dw = W;
  dh = H;
  uiScale = 1;
  px = 2;

  constructor() {
    const gl = document.getElementById('gl') as HTMLCanvasElement;
    const ui = document.getElementById('ui') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0x0b0912, 1);
    this.pixel = new PixelRenderer(this.renderer);
    this.ui = ui.getContext('2d')!;
    this.ui.imageSmoothingEnabled = false;
    window.addEventListener('resize', () => this.fit());
    this.fit();
    const unlock = () => audio.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('gamepadconnected', unlock);
  }

  /**
   * Both canvases fill the window. The UI in whole device pixels per texel (as big as lets the
   * safe area fit); the 3D with art pixels about a 540th of the height (?px=N to choose).
   */
  private fit() {
    const dpr = window.devicePixelRatio || 1;
    const dw = Math.round(window.innerWidth * dpr);
    const dh = Math.round(window.innerHeight * dpr);
    this.dw = dw;
    this.dh = dh;
    const s = Math.max(1, Math.floor(Math.min(dw / W, dh / H)));
    this.uiScale = s;
    VIEW.w = Math.ceil(dw / s);
    VIEW.h = Math.ceil(dh / s);
    VIEW.ox = Math.floor((VIEW.w - W) / 2);
    VIEW.oy = Math.floor((VIEW.h - H) / 2);
    const want = Number(this.params.get('px'));
    this.px = want > 0 ? want * dpr : Math.max(2, Math.round(dh / 540));
    const gl = this.renderer.domElement;
    const ui = this.ui.canvas;
    gl.width = dw;
    gl.height = dh;
    ui.width = VIEW.w;
    ui.height = VIEW.h;
    this.ui.imageSmoothingEnabled = false;
    gl.style.width = `${dw / dpr}px`;
    gl.style.height = `${dh / dpr}px`;
    ui.style.width = `${(VIEW.w * s) / dpr}px`;
    ui.style.height = `${(VIEW.h * s) / dpr}px`;
    this.renderer.setViewport(0, 0, dw, dh);
  }

  /** A rectangle of the safe area (UI texels, from the top-left) in device pixels from the bottom-left, for the 3D. */
  deviceRect(x: number, y: number, w: number, h: number) {
    const s = this.uiScale;
    const x0 = Math.round((VIEW.ox + x) * s);
    const y1 = Math.round((VIEW.oy + y + h) * s);
    return { x: x0, y: this.dh - y1, w: Math.round(w * s), h: Math.round(h * s) };
  }

  go(screen: Screen) {
    this.screen?.dispose?.();
    this.screen = screen;
  }

  start() {
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.time += dt;
      input.poll(dt);
      if (input.anyKey) audio.unlock();
      this.menus.clear();
      this.screen?.update(dt);
      const ctx = this.ui;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, VIEW.w, VIEW.h);
      if (this.screen && !this.screen.fullUI) ctx.setTransform(1, 0, 0, 1, VIEW.ox, VIEW.oy);
      this.screen?.draw();
      if (this.params.has('fps')) {
        // ?fps: frame time, smoothed, in the corner
        this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(VIEW.w - 70, VIEW.h - 14, 70, 14);
        drawText(ctx, `${this.frameMs.toFixed(1)}MS ${Math.round(1000 / this.frameMs)}`, VIEW.w - 4, VIEW.h - 11, '#8affb0', { align: 'right' });
      }
      input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Any device that's been given to a player can work the menus. */
  menuDevices(): DeviceId[] {
    if (this.devices.length) return this.devices;
    return ['keys', ...input.padIds()];
  }

  private menus = new Map<DeviceId, MenuInput>();
  private autoAt = 0;

  /** One device's menu presses this frame (read once a frame, so held directions repeat right). */
  menuOf(dev: DeviceId): MenuInput {
    let m = this.menus.get(dev);
    if (!m) {
      this.menus.set(dev, (m = input.menu(dev)));
      // ?autorun: someone keeps pressing fire, for testing the whole loop hands-off
      if (this.params.has('autorun') && this.time - this.autoAt > 1.5) {
        this.autoAt = this.time;
        m.confirm = true;
      }
    }
    return m;
  }

  /** Menu input merged over every player's device. */
  menu(): MenuInput {
    const out: MenuInput = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, alt: false, prev: false, next: false };
    for (const d of this.menuDevices()) {
      const m = this.menuOf(d);
      for (const k of Object.keys(out) as (keyof MenuInput)[]) out[k] ||= m[k];
    }
    return out;
  }

  /** Clears the whole WebGL canvas (screens draw their 3D into parts of it). */
  clearGL() {
    const r = this.renderer;
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.dw, this.dh);
    r.clear();
  }
}
