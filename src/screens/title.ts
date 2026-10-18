import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { FRAMES, partById, type FrameDef } from '../game/parts';
import { startBuild, stats, type Build } from '../sim/build';
import { input, type DeviceId } from '../input';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { DARK, DIM, EDGE, GOLD, H, INK, VIEW, W, frame, hex, schematic } from '../ui/hud';
import { hints } from '../ui/widgets';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { flat, GEO, part, toon } from '../render/toon';
import { newRun } from '../game/flow';
import { clamp, rng } from '../util';

interface Seat {
  dev: DeviceId;
  frame: number;
  locked: boolean;
  /** Every frame, built up front in this seat's livery, so flicking through them never stalls. */
  models: ShipModel[];
  /** The lit bay the ship turns in: a backdrop facing the camera and a glowing pad under it. */
  bay: THREE.Group;
  pad: THREE.Group;
  /** The frame going out, and how far the swap has got (0..1). */
  from: number;
  swap: number;
  dir: number;
  yaw: number;
  /** The arrows kick when pressed; the window flashes on lock; the card rises in on joining. */
  kick: [number, number];
  flash: number;
  appear: number;
  /** The stat bars as drawn, easing to the frame's. */
  bars: number[];
}

const SLOT_X = [34, 326];
const CARD_Y = 58;
const CARD_W = 280;
const CARD_H = 290;
/** The 3D window inside a card. */
const WIN = { x: 6, y: 20, w: 268, h: 116 };
const PPU = 9;
const SWAP_T = 0.24;
const LAUNCH_T = 1.15;

const sockets = (f: FrameDef) => f.grid.join('').split('#').length - 1;
const firepower = (b: Build) => b.parts.reduce((s, p) => {
  const g = partById(p.id).gun;
  return s + (g ? g.damage * g.count * g.rate : 0);
}, 0);

/** The rows of a frame card, and each one's spread over every frame (for the bars). */
const ROWS: { name: string; get: (f: FrameDef) => number; show?: (v: number) => string }[] = [
  { name: 'HULL', get: (f) => stats(startBuild(f.id)).hp },
  { name: 'SPEED', get: (f) => stats(startBuild(f.id)).speed, show: (v) => v.toFixed(0) },
  { name: 'HANDLING', get: (f) => stats(startBuild(f.id)).accel / 14, show: (v) => v.toFixed(0) },
  { name: 'FIREPOWER', get: (f) => firepower(startBuild(f.id)), show: (v) => v.toFixed(0) },
  { name: 'POWER', get: (f) => stats(startBuild(f.id)).powerOut },
  { name: 'SOCKETS', get: sockets },
];
let spread: { lo: number; hi: number }[] | null = null;
function barOf(row: number, f: FrameDef) {
  spread ??= ROWS.map((r) => {
    const vs = FRAMES.map(r.get);
    return { lo: Math.min(...vs), hi: Math.max(...vs) };
  });
  const { lo, hi } = spread[row];
  return 0.2 + (0.8 * (ROWS[row].get(f) - lo)) / Math.max(1e-6, hi - lo);
}

/** A thin flat hoop (radius 1), for the pad's glow. */
const RING = new THREE.RingGeometry(0.93, 1, 40);

const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const back = (t: number) => {
  const k = clamp(t, 0, 1) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
};

/** The bay's backdrop: dusk at the top, the livery glowing low behind the pad, faint scanlines. */
function bayTexture(tint: number) {
  const c = document.createElement('canvas');
  c.width = WIN.w / 2;
  c.height = WIN.h / 2;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#0d0916');
  g.addColorStop(1, '#1a1228');
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const col = new THREE.Color(tint);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  const r = x.createRadialGradient(c.width / 2, c.height * 0.72, 2, c.width / 2, c.height * 0.72, c.width * 0.42);
  r.addColorStop(0, `rgba(${rgb},0.32)`);
  r.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = r;
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(0,0,0,0.22)';
  for (let j = 0; j < c.height; j += 2) x.fillRect(0, j, c.width, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/**
 * The title, and crew select in the same place: press fire on any pad (or the keyboard) to climb
 * in, pick a frame, lock it. A second player joins the same way; two on one keyboard split it
 * left hand and right hand (the right hand joins with / or Num0).
 */
export class Title implements Screen {
  private stage = new Stage(W, H, 9, 52, new THREE.Vector3(), true);
  private seats: Seat[] = [];
  private t = 0;
  private planet: THREE.Group;
  private dust: THREE.Points;
  /** The painted key art behind it all, once it's loaded. */
  private art: THREE.Texture | null = null;

  constructor(private game: Game) {
    game.devices = [];
    this.planet = this.makePlanet();
    this.stage.scene.add(this.planet);
    const r = rng(7);
    const pts: number[] = [];
    for (let i = 0; i < 600; i++) pts.push((r() - 0.5) * 120, -20 - r() * 30, (r() - 0.5) * 120);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9a90c0, size: 1, sizeAttenuation: false }));
    this.stage.scene.add(this.dust);
    this.stage.scene.background = new THREE.Color(0x0a0812);
    this.stage.sun.position.set(-40, 30, -10);
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/title.png`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearFilter;
      this.art = tex;
      this.stage.scene.background = tex;
      this.planet.visible = false;
      this.dust.visible = false;
    });
    audio.music('title');
  }

  private makePlanet() {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(1, 40, 28);
    const pos = geo.getAttribute('position');
    const cols: number[] = [];
    const pal = [0x2a5a3a, 0x3d7a3a, 0x4fb89a, 0x2a2420, 0xd06cff, 0x4fb89a];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const lon = Math.atan2(pos.getZ(i), pos.getX(i));
      const n = Math.sin(lon * 3 + y * 4) * 0.4 + Math.sin(lon * 7 - y * 9) * 0.25 + y;
      c.setHex(pal[Math.max(0, Math.min(pal.length - 1, Math.floor((n + 1.4) * 2.2)))]);
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
    m.scale.setScalar(16);
    g.add(m);
    g.add(part(GEO.sphere, flat(0x6ad0ff, { additive: true, opacity: 0.12 }), [0, 0, 0], 17.2));
    g.position.set(10, -22, 6);
    return g;
  }

  /** A safe-area point (UI texels) on the plane through the stage's target, in world space. */
  private world(sx: number, sy: number) {
    const cam = this.stage.camera;
    cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    return this.stage.target.clone().addScaledVector(right, (sx - W / 2) / PPU).addScaledVector(up, (H / 2 - sy) / PPU);
  }

  /** Builds (or rebuilds, in a new livery) a seat's bay and every frame's ship. */
  private furnish(s: Pick<Seat, 'models' | 'bay' | 'pad'>, livery: number) {
    this.unfurnish(s);
    const skin = LIVERY[livery];
    s.models = FRAMES.map((f) => {
      const m = new ShipModel(startBuild(f.id), skin);
      for (const fl of m.flames) fl.userData.len = fl.scale.y;
      m.root.visible = false;
      this.stage.scene.add(m.root);
      return m;
    });
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry((WIN.w + 8) / PPU, (WIN.h + 8) / PPU),
      new THREE.MeshBasicMaterial({ map: bayTexture(skin[2]), depthWrite: false }),
    );
    back.position.z = -40;
    back.renderOrder = -10;
    s.bay = new THREE.Group();
    s.bay.add(back);
    s.bay.quaternion.copy(this.stage.camera.quaternion);
    s.pad = new THREE.Group();
    s.pad.add(part(GEO.cyl, flat(skin[2], { additive: true, opacity: 0.1 }), [0, 0, 0], [2, 0.02, 2]));
    s.pad.add(part(RING, flat(skin[2], { additive: true, opacity: 0.55 }), [0, 0, 0], 1, [-Math.PI / 2, 0, 0]));
    s.pad.add(part(RING, flat(skin[2], { additive: true, opacity: 0.25 }), [0, 0, 0], 0.7, [-Math.PI / 2, 0, 0]));
    this.stage.scene.add(s.bay, s.pad);
    // compile the shaders now, while it's all showing, rather than on the first flick through
    for (const m of s.models) m.root.visible = true;
    this.game.renderer.compile(this.stage.scene, this.stage.camera);
    for (const m of s.models) m.root.visible = false;
  }

  private unfurnish(s: Partial<Pick<Seat, 'models' | 'bay' | 'pad'>>) {
    for (const m of s.models ?? []) {
      this.stage.scene.remove(m.root);
      m.dispose();
    }
    const back = s.bay?.children[0] as THREE.Mesh | undefined;
    if (s.bay && back) {
      this.stage.scene.remove(s.bay);
      back.geometry.dispose();
      (back.material as THREE.MeshBasicMaterial).map?.dispose();
      (back.material as THREE.Material).dispose();
    }
    if (s.pad) this.stage.scene.remove(s.pad);
  }

  private seat(dev: DeviceId) {
    const i = this.seats.length;
    const s: Seat = {
      dev, frame: i, locked: false, models: [], bay: new THREE.Group(), pad: new THREE.Group(),
      from: i, swap: 1, dir: 1, yaw: -0.6, kick: [0, 0], flash: 0, appear: 0,
      bars: ROWS.map(() => 0),
    };
    this.furnish(s, i);
    this.seats.push(s);
    audio.play('ui_select');
  }

  update(dt: number) {
    this.t += dt;
    for (const s of this.seats) {
      s.appear = Math.min(1, s.appear + dt * 4);
      s.swap = Math.min(1, s.swap + dt / SWAP_T);
      s.flash = Math.max(0, s.flash - dt * 3.5);
      s.kick = [Math.max(0, s.kick[0] - dt * 7), Math.max(0, s.kick[1] - dt * 7)];
      const f = FRAMES[s.frame];
      s.bars = s.bars.map((b, k) => b + (barOf(k, f) - b) * Math.min(1, dt * 14));
    }
    if (this.launch >= 0) {
      // the ships are going: a back from anyone still stops it
      this.launch += dt;
      for (const s of this.seats) {
        if (this.game.menuOf(s.dev).back) {
          s.locked = false;
          this.launch = -1;
          audio.play('ui_back');
          return;
        }
      }
      if (this.launch >= LAUNCH_T && !this.gone) {
        this.gone = true;
        this.game.devices = this.seats.map((s) => s.dev);
        const seed = Number(this.game.params.get('run') ?? Math.floor(Math.random() * 1e6));
        newRun(this.game, this.seats.map((s) => FRAMES[s.frame].id), seed);
      }
      return;
    }
    // joining in
    if (this.seats.length < 2) {
      const taken = new Set(this.seats.map((s) => s.dev));
      // the right hand of a shared keyboard
      if ((input.keyPressed('Slash') || input.keyPressed('Numpad0')) && this.seats.some((s) => s.dev === 'keys')) {
        this.seats.find((s) => s.dev === 'keys')!.dev = 'keys-left';
        this.seat('keys-right');
        // that press was the join, not a choice
        this.game.menuOf('keys-right');
        return;
      } else
        for (const d of input.joining()) {
          if (taken.has(d) || (d === 'keys' && (taken.has('keys-left') || taken.has('keys-right')))) continue;
          if (this.seats.length >= 2) break;
          this.seat(d);
          // that press was the join, not a choice
          this.game.menuOf(d);
          return;
        }
    }
    for (let i = 0; i < this.seats.length; i++) {
      const s = this.seats[i];
      const m = this.game.menuOf(s.dev);
      if (s.locked) {
        if (m.back) {
          s.locked = false;
          audio.play('ui_back');
        }
        continue;
      }
      if (m.left || m.right) {
        s.from = s.frame;
        s.dir = m.left ? -1 : 1;
        s.frame = (s.frame + (m.left ? FRAMES.length - 1 : 1)) % FRAMES.length;
        // a quick flick lands mid-swap: start from where the last one had got to
        s.swap = s.swap < 1 ? Math.min(s.swap, 0.35) : 0;
        s.kick[m.left ? 0 : 1] = 1;
        audio.play('ui_move');
      }
      if (m.confirm) {
        s.locked = true;
        s.flash = 1;
        audio.play('ui_place');
      } else if (m.back) {
        this.unfurnish(s);
        this.seats.splice(i, 1);
        if (this.seats.length === 1 && this.seats[0].dev === 'keys-left') this.seats[0].dev = 'keys';
        // whoever's left is P1 now, in P1's colours
        this.seats.forEach((o, k) => this.furnish(o, k));
        audio.play('ui_back');
        return;
      }
    }
    if (this.seats.length && this.seats.every((s) => s.locked)) {
      this.launch = 0;
      audio.play('boost');
    }
  }

  private launch = -1;
  private gone = false;

  /** Where a seat's card sits, rising in as it appears. */
  private slot(s: Seat, i: number) {
    return { x: SLOT_X[i], y: CARD_Y + Math.round((1 - ease(s.appear)) * 24) };
  }

  /** Each ship in its bay: turning on the pad, swapping with a pop, flying off at launch. */
  private place(s: Seat, i: number, dt: number) {
    const { x, y } = this.slot(s, i);
    s.bay.position.copy(this.world(x + WIN.x + WIN.w / 2, y + WIN.y + WIN.h / 2));
    const mid = this.world(x + WIN.x + WIN.w / 2, y + WIN.y + WIN.h / 2 - 4);
    const cur = FRAMES[s.frame];
    s.pad.position.copy(mid).add(new THREE.Vector3(0, -2.2, 0));
    s.pad.scale.setScalar((2.4 + Math.max(cur.grid.length, cur.grid[0].length) * 0.35) * (1 + Math.sin(this.t * 2.2 + i) * 0.03 + s.flash * 0.3));
    s.pad.rotation.y = this.t * 0.4;
    const go = this.launch >= 0 ? this.launch / LAUNCH_T : 0;
    // turning slowly while you choose; swung round to face the run once locked
    if (s.locked) {
      const want = go > 0 ? 0 : 0.5;
      const d = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
      s.yaw += d * Math.min(1, dt * 8);
    } else s.yaw += dt * 0.7;
    const right = new THREE.Vector3().setFromMatrixColumn(this.stage.camera.matrixWorld, 0);
    const e = ease(s.swap);
    s.models.forEach((m, k) => {
      const now = k === s.frame;
      const out = k === s.from && k !== s.frame && s.swap < 1;
      m.root.visible = now || out;
      if (!m.root.visible) return;
      const f = FRAMES[k];
      const size = 2.6 * Math.sqrt(4 / Math.max(f.grid.length, f.grid[0].length));
      // the new one pops in from the side it was asked for, spinning to rest; the old one shrinks away the other way
      const k01 = now ? back(s.swap) : 1 - e;
      const shift = now ? s.dir * (1 - e) * 4 : -s.dir * e * 4;
      m.root.scale.setScalar(Math.max(0.001, size * k01));
      m.root.position.copy(mid).addScaledVector(right, shift);
      m.root.position.y += Math.sin(this.t * 1.6 + i * 2) * 0.18;
      m.root.position.z -= go * go * 70;
      m.root.rotation.y = s.yaw + (now ? s.dir * (1 - e) * 1.4 : -s.dir * e * 1.4);
      m.body.rotation.z = Math.sin(this.t * 0.9 + i * 2) * -0.12;
      m.body.rotation.x = go * 0.3;
      for (const fl of m.flames) fl.scale.y = (fl.userData.len as number) * ((s.locked ? 1.3 : 1) + Math.sin(this.t * 30 + k) * 0.08 + go * 4);
      m.update(dt);
    });
  }

  draw() {
    const g = this.game;
    const dt = 1 / 60;
    this.planet.rotation.y = this.t * 0.05;
    this.dust.position.z = (this.t * 4) % 40;
    this.seats.forEach((s, i) => this.place(s, i, dt));
    if (this.art) {
      // the art covers the window whatever its shape, drifting slowly across (a slow pan)
      const img = this.art.image as { width: number; height: number };
      const view = g.dw / g.dh;
      const pic = img.width / img.height;
      const zoom = 1.08;
      const rx = (view > pic ? 1 : view / pic) / zoom;
      const ry = (view > pic ? pic / view : 1) / zoom;
      this.art.repeat.set(rx, ry);
      this.art.offset.set((1 - rx) * (0.5 + Math.sin(this.t * 0.05) * 0.5), (1 - ry) * (0.5 + Math.cos(this.t * 0.04) * 0.3));
    }
    g.clearGL();
    this.stage.render(g, 0, 0);
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    const wob = Math.round(Math.sin(this.t * 2) * 1);
    if (!this.seats.length) {
      // the logo
      drawText(ctx, 'RUSTWING', W / 2 + 3, 26 + wob + 3, '#3a1408', { scale: 5, align: 'center', shadow: false });
      drawText(ctx, 'RUSTWING', W / 2, 26 + wob, '#ff8a3a', { scale: 5, align: 'center', shadow: '#7a2a10' });
      drawText(ctx, 'RAIDERS', W / 2, 66 + wob, '#ffd04a', { scale: 3, align: 'center', shadow: '#7a4a10' });
      // a dark band across the painting so the prompt reads
      const band = ctx.createLinearGradient(0, 238, 0, 302);
      band.addColorStop(0, 'rgba(14,8,22,0)');
      band.addColorStop(0.25, 'rgba(14,8,22,0.78)');
      band.addColorStop(0.75, 'rgba(14,8,22,0.78)');
      band.addColorStop(1, 'rgba(14,8,22,0)');
      ctx.fillStyle = band;
      ctx.fillRect(-VIEW.ox, 238, VIEW.w, 64);
      if (Math.floor(this.t * 2) % 2 === 0) drawText(ctx, 'PRESS FIRE TO CLIMB IN', W / 2, 250, INK, { scale: 2, align: 'center' });
      drawText(ctx, 'ANY PAD: A / CROSS      KEYBOARD: ENTER OR SPACE', W / 2, 276, INK, { align: 'center' });
      drawText(ctx, 'TWO ON ONE KEYBOARD: SPACE, THEN / FOR THE SECOND PLAYER', W / 2, 288, INK, { align: 'center' });
      return;
    }
    // the crew select: the logo tucked up top, a card per seat
    const top = ctx.createLinearGradient(0, 0, 0, 56);
    top.addColorStop(0, 'rgba(14,8,22,0.7)');
    top.addColorStop(1, 'rgba(14,8,22,0)');
    ctx.fillStyle = top;
    ctx.fillRect(-VIEW.ox, -VIEW.oy, VIEW.w, 56 + VIEW.oy);
    const lw = textWidth('RUSTWING RAIDERS', 3);
    const lx = Math.round(W / 2 - lw / 2);
    drawText(ctx, 'RUSTWING', lx, 10, '#ff8a3a', { scale: 3, shadow: '#7a2a10' });
    drawText(ctx, 'RAIDERS', lx + textWidth('RUSTWING ', 3), 10, '#ffd04a', { scale: 3, shadow: '#7a4a10' });
    const waiting = this.seats.find((s) => !s.locked && this.seats.some((o) => o.locked));
    const sub = this.launch >= 0 ? 'LAUNCHING' : waiting ? `WAITING FOR P${this.seats.indexOf(waiting) + 1}` : 'CHOOSE YOUR FRAME';
    drawText(ctx, sub, W / 2, 38, this.launch >= 0 ? GOLD : DIM, { align: 'center' });
    this.seats.forEach((s, i) => this.card(ctx, s, i));
    if (this.seats.length < 2) this.ghost(ctx);
    if (this.launch >= 0) {
      const k = clamp((this.launch - LAUNCH_T * 0.55) / (LAUNCH_T * 0.45), 0, 1);
      ctx.fillStyle = `rgba(10,8,18,${k})`;
      ctx.fillRect(-VIEW.ox, -VIEW.oy, VIEW.w, VIEW.h);
    }
  }

  private card(ctx: CanvasRenderingContext2D, s: Seat, i: number) {
    const f = FRAMES[s.frame];
    const { x, y } = this.slot(s, i);
    const col = hex(LIVERY[i][2]);
    ctx.globalAlpha = ease(s.appear);
    frame(ctx, x, y, CARD_W, CARD_H, 'rgba(18,12,24,0.95)', s.locked ? col : EDGE);
    if (s.locked) {
      // a lit rim all round once you're in
      ctx.fillStyle = col;
      ctx.fillRect(x - 1, y - 1, CARD_W + 2, 1);
      ctx.fillRect(x - 1, y + CARD_H, CARD_W + 2, 1);
      ctx.fillRect(x - 1, y - 1, 1, CARD_H + 2);
      ctx.fillRect(x + CARD_W, y - 1, 1, CARD_H + 2);
    }
    // who: a chip in their colour, and what they're holding
    ctx.fillStyle = col;
    ctx.fillRect(x + 6, y + 5, 19, 11);
    drawText(ctx, `P${i + 1}`, x + 9, y + 7, DARK, { shadow: false });
    const dev = input.padName(s.dev) + (s.dev === 'keys-left' ? ' · LEFT' : s.dev === 'keys-right' ? ' · RIGHT' : '');
    drawText(ctx, dev, x + CARD_W - 6, y + 7, DIM, { align: 'right' });
    // the window onto the bay, with corner brackets
    const wx = x + WIN.x;
    const wy = y + WIN.y;
    ctx.clearRect(wx, wy, WIN.w, WIN.h);
    if (s.flash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${s.flash * s.flash * 0.7})`;
      ctx.fillRect(wx, wy, WIN.w, WIN.h);
    }
    ctx.fillStyle = s.locked ? col : '#5a4a70';
    for (const [cx, cy, sx, sy] of [[wx, wy, 1, 1], [wx + WIN.w - 1, wy, -1, 1], [wx, wy + WIN.h - 1, 1, -1], [wx + WIN.w - 1, wy + WIN.h - 1, -1, -1]]) {
      ctx.fillRect(sx > 0 ? cx : cx - 7, cy, 8, 1);
      ctx.fillRect(cx, sy > 0 ? cy : cy - 7, 1, 8);
    }
    // the frame's number in the roster, up in the window's corner
    drawText(ctx, `${String(s.frame + 1).padStart(2, '0')}/${String(FRAMES.length).padStart(2, '0')}`, wx + WIN.w - 5, wy + 5, '#6a5a80', { align: 'right' });
    if (s.locked) {
      // READY wipes in across the foot of the window
      const k = ease(1 - s.flash);
      const bw = Math.round(WIN.w * k);
      ctx.fillStyle = col;
      ctx.fillRect(wx + Math.round((WIN.w - bw) / 2), wy + WIN.h - 17, bw, 13);
      if (k > 0.6) drawText(ctx, 'READY', wx + WIN.w / 2, wy + WIN.h - 14, DARK, { align: 'center', shadow: false });
    }
    // the name, between arrows that kick when pressed
    const ny = y + 144;
    drawText(ctx, f.name.toUpperCase(), x + CARD_W / 2, ny, s.locked ? GOLD : INK, { scale: 2, align: 'center' });
    if (!s.locked) {
      const pulse = Math.floor(this.t * 2) % 2 === 0;
      drawText(ctx, '<', x + 14 - Math.round(s.kick[0] * 4), ny, s.kick[0] > 0 ? col : pulse ? INK : DIM, { scale: 2 });
      drawText(ctx, '>', x + CARD_W - 23 + Math.round(s.kick[1] * 4), ny, s.kick[1] > 0 ? col : pulse ? INK : DIM, { scale: 2 });
    }
    // the roster: a pip per frame
    const pw = 10;
    const px0 = Math.round(x + CARD_W / 2 - (FRAMES.length * (pw + 3) - 3) / 2);
    FRAMES.forEach((_, k) => {
      ctx.fillStyle = k === s.frame ? col : '#3a2e48';
      ctx.fillRect(px0 + k * (pw + 3), y + 163, pw, k === s.frame ? 3 : 2);
    });
    wrap(f.text, CARD_W - 24).slice(0, 3).forEach((l, k) => drawText(ctx, l, x + CARD_W / 2, y + 172 + k * 9, '#c8bcd8', { align: 'center' }));
    ctx.fillStyle = EDGE;
    ctx.fillRect(x + 8, y + 203, CARD_W - 16, 1);
    // the numbers, as bars against the other frames
    ROWS.forEach((r, k) => {
      const ry = y + 210 + k * 10;
      drawText(ctx, r.name, x + 8, ry, DIM);
      const segs = 12;
      const bx = x + 70;
      const v = s.bars[k] * segs;
      for (let j = 0; j < segs; j++) {
        const fill = clamp(v - j, 0, 1);
        ctx.fillStyle = '#2a2236';
        ctx.fillRect(bx + j * 9, ry + 1, 8, 5);
        if (fill <= 0) continue;
        ctx.globalAlpha = ease(s.appear) * (0.35 + fill * 0.65);
        ctx.fillStyle = col;
        ctx.fillRect(bx + j * 9, ry + 1, 8, 5);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(bx + j * 9, ry + 1, 8, 1);
        ctx.globalAlpha = ease(s.appear);
      }
      const val = r.get(f);
      drawText(ctx, r.show ? r.show(val) : `${val}`, bx + segs * 9 + 18, ry, INK, { align: 'right' });
    });
    // the sockets, as the hangar shows them
    const sc = 11;
    const gw = f.grid[0].length * sc;
    const gh = f.grid.length * sc;
    schematic(ctx, startBuild(f.id), Math.round(x + 236 - gw / 2), Math.round(y + 240 - gh / 2), sc);
    hints(ctx, s.dev, s.locked ? [['back', 'CHANGE']] : [['move', 'FRAME'], ['confirm', 'READY'], ['back', 'LEAVE']], x + CARD_W / 2, y + CARD_H - 12, 'center');
    ctx.globalAlpha = 1;
  }

  /** The empty seat, asking for a second pilot. */
  private ghost(ctx: CanvasRenderingContext2D) {
    const x = SLOT_X[1];
    const y = CARD_Y;
    const col = hex(LIVERY[1][2]);
    ctx.fillStyle = 'rgba(14,10,22,0.7)';
    ctx.fillRect(x, y, CARD_W, CARD_H);
    // a dashed edge, marching slowly
    ctx.fillStyle = '#4a3c5c';
    const off = Math.floor(this.t * 8) % 8;
    for (let k = -8 + off; k < CARD_W; k += 8) {
      const a = Math.max(0, k);
      const b = Math.min(CARD_W, k + 4);
      if (b > a) {
        ctx.fillRect(x + a, y, b - a, 1);
        ctx.fillRect(x + CARD_W - b, y + CARD_H - 1, b - a, 1);
      }
    }
    for (let k = -8 + off; k < CARD_H; k += 8) {
      const a = Math.max(0, k);
      const b = Math.min(CARD_H, k + 4);
      if (b > a) {
        ctx.fillRect(x + CARD_W - 1, y + a, 1, b - a);
        ctx.fillRect(x, y + CARD_H - b, 1, b - a);
      }
    }
    const cy = y + CARD_H / 2;
    const on = Math.sin(this.t * 4) > -0.3;
    drawText(ctx, 'P2', x + CARD_W / 2, cy - 34, on ? col : DIM, { scale: 3, align: 'center' });
    drawText(ctx, 'PRESS FIRE TO JOIN', x + CARD_W / 2, cy, INK, { align: 'center' });
    const how = this.seats[0].dev === 'keys' ? 'SAME KEYBOARD? PRESS /' : 'ANOTHER PAD OR THE KEYBOARD';
    drawText(ctx, how, x + CARD_W / 2, cy + 14, DIM, { align: 'center' });
    drawText(ctx, 'OR FLY SOLO: JUST READY UP', x + CARD_W / 2, cy + 40, '#a898c0', { align: 'center' });
  }

  dispose() {
    for (const s of this.seats) this.unfurnish(s);
  }
}
