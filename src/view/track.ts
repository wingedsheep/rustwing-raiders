import * as THREE from 'three';
import type { Level, LevelEvent, Player } from '../sim/level';
import type { LevelView } from './level-view';
import { LIVERY } from './ship-model';
import { audio } from '../audio';
import type { Rival } from '../sim/rivals';
import { FLIGHT_Y, HALF_W } from '../sim/types';
import { BARRIER_H, GRID_Z, MOUTH, PAD_L, PAD_W, RAMP_H, RAMP_L, type Course } from '../sim/course';
import { startBuild } from '../sim/build';
import { ShipModel } from './ship-model';
import type { Fx } from './fx';
import { flat, GEO, toon } from '../render/toon';
import { weather, WASH } from '../render/alive';
import { clamp, damp } from '../util';

/**
 * A race's track, drawn so it reads at speed from behind the ship: both edges lined with pylons
 * from the ground up past the flight height, red and white by turns (the track's own walls) or
 * mint (a shortcut's lane), a rail of light running between their tops at the height you fly; the
 * ground between them washed darker with a bright line along each edge, so the way on shows from
 * far off; an arch of light over each shortcut's mouth; amber boards on the outside wall before
 * each turn; boost pads as hoops to fly through; and a ring of light round any rock standing on the
 * track. The pylons are close set on purpose: they rush past, and that's most of the speed.
 *
 * And the planet answers you: grass and trees blown flat as you pass (render/alive.ts), the water
 * pushed down and whipped to foam under you, spray thrown up in a rooster tail behind, dust off the
 * dry ground; a drift throws sparks off the ship, in the colour of the turbo it's charged.
 */

const GOLD = 0xffd04a;
const AMBER = 0xffb02a;
const PAD = 0x5affe8;
const DANGER = 0xff5a2a;
const KERB = [0xe8302a, 0xf4ecd8];
const LANE = [0x5affc0, 0xe8fff4];
/** The turbo's tiers: charging, then blue, orange, purple. */
const TURBO = [0xfff0d8, 0x6ab8ff, 0xffa040, 0xd070ff];
const OY = FLIGHT_Y + 1.4;
/** Pylons along the walls this far apart (units of z), and as many as can show at once. */
const STEP = 3;
const MAX_POSTS = 1000;
/** The rail of light along the pylons' tops: this far over the flight height. */
const RAIL_Y = FLIGHT_Y + 0.9;
/** The ribbon on the ground: rows this far apart, lifted this far off it. */
const ROW = 3;
const LIFT = 0.35;

const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
/** A ramp's wedge: a slope from the ground at its foot (z +0.5) up to its lip (z -0.5, y 1), a sheer drop behind. */
const WEDGE = (() => {
  const g = new THREE.BufferGeometry();
  // prettier-ignore
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, -0.5, -0.5, 1, -0.5, // the slope
    -0.5, 0, -0.5, -0.5, 1, -0.5, 0.5, 1, -0.5, 0.5, 0, -0.5, // the back
    -0.5, 0, 0.5, -0.5, 1, -0.5, -0.5, 0, -0.5, // the left side
    0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, -0.5, // the right side
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  g.computeVertexNormals();
  return g;
})();
/** How far out in front of its foot a ramp's slope starts up out of the ground. */
const RUN_IN = 16;
const RING = new THREE.RingGeometry(0.82, 1, 36).rotateX(-Math.PI / 2);
const HOOP = new THREE.TorusGeometry(1, 0.09, 6, 28);
const CHEVRON = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, 1, 1, 0, 0, -1, 0, -0.6, 0, 0, 0.4, 1, 0, -0.6], 3));
  g.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
  return g;
})();

const MINT = new THREE.Color(LANE[0]);
const DARK = new THREE.Color(0x0a0810);

/** Meshes from a shared geometry, handed out afresh each frame. */
class Pool {
  private meshes: THREE.Mesh[] = [];
  private used = 0;
  constructor(
    private group: THREE.Group,
    private geo: THREE.BufferGeometry,
    private order: number,
    private make: () => THREE.Material = () => new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
  ) {}
  take(color: number, opacity: number): THREE.Mesh {
    let m = this.meshes[this.used];
    if (!m) {
      m = new THREE.Mesh(this.geo, this.make());
      m.renderOrder = this.order;
      m.frustumCulled = false;
      this.group.add(m);
      this.meshes.push(m);
    }
    this.used++;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);
    mat.opacity = clamp(opacity, 0, 1);
    m.visible = true;
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    return m;
  }
  end() {
    for (let i = this.used; i < this.meshes.length; i++) this.meshes[i].visible = false;
    this.used = 0;
  }
}

interface RivalView {
  ship: ShipModel;
  bank: number;
  spin: number;
  yaw: number;
}

export class TrackView {
  /** In the world: pylons, rails, the ribbon, pads, the start and finish, the rivals. */
  readonly group = new THREE.Group();
  /** Over the finished picture: turn boards, danger rings. */
  readonly overlay = new THREE.Group();
  private posts: THREE.InstancedMesh;
  private caps: THREE.InstancedMesh;
  private rails: THREE.InstancedMesh;
  private wedges: THREE.InstancedMesh;
  private ribbon: THREE.Mesh;
  private chevrons = new Pool(this.overlay, CHEVRON, 42);
  private rings = new Pool(this.overlay, RING, 43);
  private padPanels: Pool;
  private hoops: Pool;
  private rivals: RivalView[] = [];
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  /** The dust's colour here (the biome's ground), and its rock (the same, darker). */
  private dust = new THREE.Color();
  private rock = new THREE.Color();
  /** A punch of the zoom (out), decaying: pads, launches, turbos, sonic booms. */
  zoomKick = 0;
  /** Big words in the middle of the screen for a moment (PERFECT START, FINAL STRETCH). */
  banner: { text: string; sub: string; color: string; t: number } | null = null;
  /** Seconds since the place changed, and whether for the better (the HUD's number jumps). */
  placeT = 9;
  placeUp = true;
  /** When each speed tier last boomed. */
  private boomed: number[] = [];

  constructor(
    readonly lv: Level,
    private fx: Fx,
  ) {
    const course = lv.terrain.course!;
    this.posts = new THREE.InstancedMesh(GEO.box, toon(0xffffff), MAX_POSTS);
    this.posts.castShadow = true;
    this.caps = new THREE.InstancedMesh(GEO.box, flat(0xffffff), MAX_POSTS);
    this.rails = new THREE.InstancedMesh(GEO.box, flat(0xffffff), MAX_POSTS);
    this.wedges = new THREE.InstancedMesh(WEDGE, toon(0xffffff), 64);
    this.wedges.castShadow = true;
    this.wedges.receiveShadow = true;
    this.wedges.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
    this.wedges.frustumCulled = false;
    this.wedges.count = 0;
    this.group.add(this.wedges);
    for (const im of [this.posts, this.caps, this.rails]) {
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_POSTS * 3), 3);
      im.frustumCulled = false;
      im.count = 0;
      this.group.add(im);
    }
    const rg = new THREE.BufferGeometry();
    this.ribbon = new THREE.Mesh(
      rg,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 1;
    this.group.add(this.ribbon);
    const glow = () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.padPanels = new Pool(this.group, PLANE, 12, glow);
    this.hoops = new Pool(this.group, HOOP, 13, glow);
    this.lines(course);
    for (const r of lv.rivals) {
      const ship = new ShipModel(startBuild(r.frame), r.livery);
      ship.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      this.group.add(ship.root);
      this.rivals.push({ ship, bank: 0, spin: 0, yaw: 0 });
    }
  }

  /** The start and the finish: a checkered line of light across the course, a gantry over each. */
  private lines(course: Course) {
    const checker = (() => {
      const cv = document.createElement('canvas');
      cv.width = 16;
      cv.height = 2;
      const g = cv.getContext('2d')!;
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (i + j) % 2 ? '#141018' : '#f4ecd8';
          g.fillRect(i, j, 1, 1);
        }
      const t = new THREE.CanvasTexture(cv);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    for (const [z, banner] of [
      [GRID_Z + 22, 0xc8302a],
      [course.finish, GOLD],
    ] as const) {
      const cx = course.x(z);
      const half = course.half(z) + 1;
      // the line, hovering just under the flight height, so it reads over any ground
      const band = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: checker, transparent: true, opacity: 0.85, depthWrite: false }));
      band.position.set(cx, FLIGHT_Y - 1.2, z);
      band.scale.set(half * 2, 1, 1.6);
      band.renderOrder = 2;
      this.group.add(band);
      const mat = toon(0x2a2232);
      for (const side of [-1, 1]) {
        const g = this.ground(cx + side * (half + 0.8), z);
        const post = new THREE.Mesh(GEO.box, mat);
        post.position.set(cx + side * (half + 0.8), (FLIGHT_Y + 7 + g) / 2, z);
        post.scale.set(1.3, FLIGHT_Y + 7 - g, 1.3);
        post.castShadow = true;
        this.group.add(post);
      }
      const bar = new THREE.Mesh(GEO.box, toon(banner, { glow: 0.5 }));
      bar.position.set(cx, FLIGHT_Y + 6.5, z);
      bar.scale.set(half * 2 + 2.6, 1.8, 0.6);
      this.group.add(bar);
      const strip = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ map: checker }));
      strip.position.set(cx, FLIGHT_Y + 5.4, z + 0.05);
      strip.scale.set(half * 2 + 2.6, 0.5, 0.62);
      this.group.add(strip);
    }
  }

  /** The ground (or the water over it) at (x, z). */
  private ground(x: number, z: number) {
    const t = this.lv.terrain;
    return Math.max(t.height(x, z), t.water(z));
  }

  /** `top` and `bottom`: the z range the camera sees (world, top < bottom). */
  update(dt: number, top: number, bottom: number) {
    this.time += dt;
    const lv = this.lv;
    const c = lv.terrain.course!;
    this.dust.setHex(lv.terrain.biome(lv.scroll).ground[0]);
    this.rock.copy(this.dust).multiplyScalar(0.55).lerp(DARK, 0.25);
    this.drawWalls(c, top, bottom);
    this.drawRibbon(c, top, bottom);
    this.boards(c, top, bottom);
    this.danger(c, top, bottom);
    this.pads(c, top, bottom);
    this.updateRivals(dt, top, bottom);
    this.wash(dt);
    // riding a wake: streaks of air wrapping round the ship, rushing back past it
    for (const p of lv.players)
      if (p.draft > 0 && !p.down && Math.random() < 0.8)
        for (const side of [-1, 1]) this.fx.add({ x: p.x + side * (1.2 + Math.random() * 0.8), y: FLIGHT_Y + 0.6, z: p.z - 2 - Math.random() * 2, vx: side * 3, vz: 40 + Math.random() * 20, size: 0.14, grow: 0.1, life: 0.16, color: new THREE.Color(0xc8f0ff) });
    this.chevrons.end();
    this.rings.end();
    this.padPanels.end();
    this.hoops.end();
  }

  /**
   * The hard walls (the soft edges are the land's own: the terrain lines them): a tunnel's rock
   * either side, its roof over, a light every few steps on the roof and the walls rushing past; a
   * slot's cliffs, higher, open to the sky; a rock face round each mouth. Buoys mark the edges on
   * the water, loosely. Over each shortcut's mouth, an arch of light; and the jumps (see `jumps`).
   */
  private drawWalls(c: Course, top: number, bottom: number) {
    let n = 0;
    let nr = 0;
    const rock = this.rock;
    const block = (x: number, y0: number, y1: number, z: number, w: number, d: number, shade: number) => {
      if (n >= MAX_POSTS) return;
      this.m.compose(this.v.set(x, (y0 + y1) / 2, z), this.q.identity(), this.s.set(w, Math.max(0.1, y1 - y0), d));
      this.posts.setMatrixAt(n, this.m);
      this.posts.setColorAt(n++, this.c.copy(rock).multiplyScalar(shade));
    };
    const light = (x: number, y: number, z: number, w: number, h: number, d: number, col: number, k = 1) => {
      if (nr >= MAX_POSTS) return;
      this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.set(w, h, d));
      this.rails.setMatrixAt(nr, this.m);
      this.rails.setColorAt(nr++, this.c.setHex(col).multiplyScalar(k));
    };
    const z0 = Math.floor(bottom / STEP) * STEP;
    for (let z = z0; z > top && n < MAX_POSTS - 8; z -= STEP) {
      const k = Math.round(z / STEP);
      const m = c.x(z);
      const h = c.half(z);
      const t = c.tunnelAt(z);
      const jag = (side: number) => 0.85 + 0.3 * hash(k * 7 + side * 3);
      if (t) {
        const ceil = FLIGHT_Y + 5.5;
        for (const side of [-1, 1]) {
          const x = m + side * (h + 1.4);
          const tall = t.roof ? ceil + 1.2 : FLIGHT_Y + 9 + hash(k * 3 + side) * 7;
          block(x + side * hash(k + side) * 0.6, this.ground(x, z) - 1, tall, z, 2.8 + hash(k * 5 + side) * 1.4, STEP + 0.2, jag(side));
          // (a slot's cliffs lean in: a second block stepped back and higher)
          if (!t.roof) block(x + side * 3, this.ground(x, z) - 1, tall + 4 + hash(k * 11 + side) * 6, z, 3.6, STEP + 0.2, jag(side) * 0.8);
          // the lights along the walls, by turns either side
          if (t.roof && (k & 3) === (side > 0 ? 0 : 2)) light(m + side * (h + 0.05), FLIGHT_Y + 0.4, z, 0.15, 0.5, 1.4, AMBER, 1.6);
        }
        if (t.roof) {
          block(m, ceil, ceil + 2.4, z, h * 2 + 5.6, STEP + 0.2, 0.55);
          if ((k & 1) === 0) light(m, ceil - 0.05, z, Math.min(h, 6), 0.12, 0.7, 0xfff0d0, 1.5);
        }
        continue;
      }
      // on the water, buoys along the edges
      for (const side of [-1, 1]) {
        if (hash(k * 13 + side) > 0.32 || c.open(side, z)) continue;
        const x = m + side * (h + hash(k * 17 + side) * 2.5);
        const wy = this.lv.terrain.water(z);
        if (wy < this.lv.terrain.height(x, z) + 0.3) continue;
        this.m.compose(this.v.set(x, wy + 0.5, z), this.q.identity(), this.s.set(0.7, 1.4, 0.7));
        this.posts.setMatrixAt(n, this.m);
        this.posts.setColorAt(n++, this.c.setHex(KERB[(k >> 1) & 1]));
        light(x, wy + 1.35, z, 0.45, 0.3, 0.45, (k >> 1) & 1 ? 0xffffff : 0xff6a3a, 1.5);
      }
    }
    // the rock face round each mouth (and each way out): you go in through the hole or not at all
    for (const t of c.tunnels)
      for (const z of [t.z0, t.z1]) {
        if (z < top - 10 || z > bottom + 10) continue;
        const m = c.x(z);
        const h = c.half(z);
        const up = t.roof ? FLIGHT_Y + 15 : FLIGHT_Y + 18;
        for (const side of [-1, 1]) {
          const x = m + side * (h + 2.8 + 14);
          block(x, this.ground(x, z) - 1, up, z, 28, 5, 0.75);
          block(m + side * (h + 2.8 + 34), this.ground(x, z) - 1, up - 5, z + 3, 16, 9, 0.65);
        }
        if (t.roof) block(m, FLIGHT_Y + 5.5, up, z, h * 2 + 6, 5, 0.7);
      }
    // the arches over the shortcuts' mouths: two posts and a bar of light, pulsing
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
    for (const sc of c.shortcuts) {
      const z = sc.z0 - MOUTH - 3;
      if (z < top || z > bottom || n > MAX_POSTS - 4 || nr >= MAX_POSTS - 3) continue;
      const [o, i] = c.laneWalls(sc, z);
      if (Number.isNaN(i)) continue;
      for (const x of [o, i]) {
        const gy = this.ground(x, z);
        block(x, gy, FLIGHT_Y + 5, z, 0.9, 0.9, 0.5);
        light(x, FLIGHT_Y + 5.2, z, 1.2, 0.6, 1.2, LANE[0], 1 + pulse);
      }
      light((o + i) / 2, FLIGHT_Y + 4.6, z, Math.abs(o - i) + 1, 0.7, 0.5, LANE[0], 0.8 + pulse);
    }
    const jn = this.jumps(c, top, bottom, n, nr);
    n = jn[0];
    nr = jn[1];
    this.posts.count = n;
    this.caps.count = 0;
    this.rails.count = nr;
    for (const im of [this.posts, this.caps, this.rails]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /**
   * The jumps: each ramp a slab of the land's own ground tilted up to a lip of light, a heap of
   * rock under it, chevrons on it; each barrier a ridge of rock across the track, standing higher
   * than you fly, an ember glow along its crest so it reads from far off. Returns the counts used.
   */
  private jumps(c: Course, top: number, bottom: number, n: number, nr: number): [number, number] {
    const tilt = Math.atan2(RAMP_H, RAMP_L);
    const base = FLIGHT_Y - 0.8;
    let nw = 0;
    for (const rp of c.ramps) {
      if (rp.z - RAMP_L > bottom + 6 || rp.z + RUN_IN < top - 6 || nw >= 64) continue;
      const lip = rp.z - RAMP_L;
      const x = c.x(lip) + rp.dx;
      // the slope: out of the ground well before the foot, up to the lip
      const g = Math.min(this.ground(x, rp.z + RUN_IN), this.ground(x, lip)) - 0.5;
      const len = RAMP_L + RUN_IN;
      this.m.compose(this.v.set(x, g, lip + len / 2), this.q.identity(), this.s.set(rp.half * 2, base + RAMP_H - g, len));
      this.wedges.setMatrixAt(nw, this.m);
      this.wedges.setColorAt(nw++, this.c.copy(this.dust).multiplyScalar(1.1));
      if (nr < MAX_POSTS) {
        this.m.compose(this.v.set(x, base + RAMP_H + 0.15, rp.z - RAMP_L), this.q.identity(), this.s.set(rp.half * 2, 0.25, 0.5));
        this.rails.setMatrixAt(nr, this.m);
        this.rails.setColorAt(nr++, this.c.setHex(GOLD).multiplyScalar(1.4 + 0.4 * Math.sin(this.time * 10)));
      }
      for (let j = 0; j < 2; j++) {
        const ch = this.chevrons.take(GOLD, 0.75);
        ch.position.set(x, base + RAMP_H * (0.3 + j * 0.4) + 0.4, rp.z - RAMP_L * (0.3 + j * 0.4));
        ch.rotation.set(tilt, Math.PI, 0);
        ch.scale.setScalar(Math.min(2.4, rp.half * 0.5));
      }
    }
    for (const b of c.barriers) {
      if (b.z < top - 6 || b.z > bottom + 6) continue;
      const m = c.x(b.z);
      for (const [lo, hi] of b.spans)
        for (let a = lo; a < hi && n < MAX_POSTS; a += 2.6) {
          const w = Math.min(2.8, hi - a);
          const x = m + a + w / 2;
          const k = Math.round(a * 3 + b.z);
          const crest = FLIGHT_Y + BARRIER_H + hash(k) * 0.9;
          this.m.compose(this.v.set(x, (this.ground(x, b.z) - 1 + crest) / 2, b.z + (hash(k + 1) - 0.5) * 0.8), this.q.identity(), this.s.set(w + 0.4, crest - this.ground(x, b.z) + 1, 2 + hash(k + 2)));
          this.posts.setMatrixAt(n, this.m);
          this.posts.setColorAt(n++, this.c.copy(this.rock).multiplyScalar(0.7 + hash(k + 3) * 0.3));
          if (nr < MAX_POSTS) {
            this.m.compose(this.v.set(x, crest + 0.05, b.z), this.q.identity(), this.s.set(w + 0.3, 0.18, 0.9));
            this.rails.setMatrixAt(nr, this.m);
            this.rails.setColorAt(nr++, this.c.setHex(DANGER).multiplyScalar(1.2 + 0.3 * Math.sin(this.time * 7 + a)));
          }
        }
    }
    this.wedges.count = nw;
    this.wedges.instanceMatrix.needsUpdate = true;
    if (this.wedges.instanceColor) this.wedges.instanceColor.needsUpdate = true;
    return [n, nr];
  }

  /**
   * The ground between the walls, washed darker, a bright line just inside each wall: the way on,
   * readable far ahead over any land or water. Rebuilt each frame over what the camera sees.
   */
  private drawRibbon(c: Course, top: number, bottom: number) {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    // across a strip from a to b: worn darker towards the middle, fading out to nothing at its edges
    const across = [0, 0.03, 0.1, 0.5, 0.9, 0.97, 1];
    const worn = [0, 0.12, 0.24, 0.28, 0.24, 0.12, 0];
    const lane = [0, 0.2, 0.14, 0.12, 0.14, 0.2, 0];
    const strip = (rows: { z: number; a: number; b: number }[], edge: THREE.Color, wash: THREE.Color, shade = worn) => {
      if (rows.length < 2) return;
      const base = pos.length / 3;
      for (const r of rows)
        across.forEach((f, j) => {
          const x = r.a + (r.b - r.a) * f;
          pos.push(x, this.ground(x, r.z) + LIFT, r.z);
          const e = j <= 1 || j >= across.length - 2;
          const cc = e ? edge : wash;
          col.push(cc.r, cc.g, cc.b, shade[j]);
        });
      const w = across.length;
      for (let r = 0; r < rows.length - 1; r++)
        for (let j = 0; j < w - 1; j++) {
          const a = base + r * w + j;
          idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w);
        }
    };
    const z0 = Math.floor(bottom / ROW) * ROW;
    const main: { z: number; a: number; b: number }[] = [];
    for (let z = z0; z > top; z -= ROW) main.push({ z, a: c.x(z) - c.half(z), b: c.x(z) + c.half(z) });
    strip(main, DARK, DARK);
    for (const sc of c.shortcuts) {
      if (sc.z1 > bottom || sc.z0 < top) continue;
      const rows: { z: number; a: number; b: number }[] = [];
      for (let z = Math.min(z0, Math.floor(sc.z0 / ROW) * ROW); z > Math.max(top, sc.z1); z -= ROW) {
        const [o, i] = c.laneWalls(sc, z);
        const near = Number.isNaN(i) ? c.x(z) + sc.side * c.half(z) : i;
        rows.push({ z, a: Math.min(o, near), b: Math.max(o, near) });
      }
      strip(rows, MINT, DARK, lane);
    }
    const g = this.ribbon.geometry;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
  }

  /** The turns: amber boards on the outside wall before each one, chevrons chasing the way it goes. */
  private boards(c: Course, top: number, bottom: number) {
    // a shortcut's mouth coming up: mint boards on its wall, beckoning in
    for (const sc of c.shortcuts) {
      if (sc.z0 < top - 10 || sc.z0 - 40 > bottom) continue;
      for (let b = 0; b < 4; b++) {
        const z = sc.z0 + 30 - b * 10;
        if (z < top || z > bottom) continue;
        const x = c.x(z) + sc.side * (c.half(z) + 0.2);
        for (let j = 0; j < 2; j++) {
          const lit = ((j + b - Math.floor(this.time * 10)) % 3 + 3) % 3 === 0;
          const ch = this.chevrons.take(lit ? 0xffffff : LANE[0], lit ? 0.95 : 0.75);
          ch.position.set(x + sc.side * j * 1.4, RAIL_Y + 2.2, z);
          ch.rotation.set(Math.PI / 2, sc.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
          ch.scale.setScalar(1.2);
        }
      }
    }
    for (const t of c.turns) {
      if (t.z0 + 30 < top - 20 || t.z0 > bottom + 40) continue;
      const sharp = clamp((t.k - 1 / 220) / (1 / 95 - 1 / 220), 0.3, 1);
      // a few boards, from just before the turn into it, standing up off the outside wall
      for (let b = 0; b < 4; b++) {
        const z = t.z0 + 12 - b * 14;
        if (z < top - 10 || z > bottom + 6) continue;
        const x = c.x(z) - t.dir * (c.half(z) - 0.6);
        for (let j = 0; j < (sharp > 0.7 ? 3 : 2); j++) {
          const lit = ((j - Math.floor(this.time * 8)) % 3 + 3) % 3 === 0;
          const ch = this.chevrons.take(lit ? 0xffffff : AMBER, (lit ? 0.95 : 0.7) * (0.6 + sharp * 0.4));
          ch.position.set(x + t.dir * j * 1.5, RAIL_Y + 2.2, z);
          ch.rotation.set(Math.PI / 2, t.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
          ch.scale.setScalar(1 + sharp * 0.4);
        }
      }
    }
  }

  /**
   * A ring at flight height round any rock standing in the way (on the track or a lane: not the
   * edges' line, which is the edge), bright near you, pulsing white close up.
   */
  private danger(c: Course, top: number, bottom: number) {
    const lv = this.lv;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    const seen = new Set<string>();
    for (const ch of lv.terrain.chunksBetween(top - 14, bottom + 4))
      for (const pr of ch.props) {
        if (!pr.obstacle) continue;
        for (const col of pr.cols) {
          if (col.z < top - 14 || col.z > bottom + 4) continue;
          // (only what stands out on the track or in a lane: not the edges' own line)
          if (!c.inside(col.x, col.z) || Math.abs(col.x - c.x(col.z)) > c.half(col.z) - 0.8 && !c.shortcutAt(col.z)) continue;
          // (an island's own rock: its walls say keep off)
          const il = c.islandAt(col.z);
          if (il && Math.abs(col.x - c.x(col.z) - il.off) < c.islandHalf(il, col.z) + 0.5) continue;
          const key = `${col.x.toFixed(1)}:${col.z.toFixed(1)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          let close = 0;
          for (const p of lv.players) {
            if (p.down) continue;
            const ahead = p.z - col.z;
            close = Math.max(close, 1 - Math.hypot(p.x - col.x, (p.z - col.z) * (ahead > 0 ? 0.4 : 1.5)) / 30);
          }
          close = clamp(close, 0, 1);
          const a = 0.55 + close * 0.4;
          const hot = close > 0.55 && pulse > 0.5;
          const ring = this.rings.take(hot ? 0xffffff : DANGER, a);
          ring.position.set(col.x, OY, col.z);
          ring.scale.setScalar(col.r + 0.7 + pulse * 0.2);
          const rim = this.rings.take(0x140c18, a * 0.8);
          rim.position.set(col.x, OY - 0.01, col.z);
          rim.scale.setScalar(col.r + 1.05 + pulse * 0.2);
        }
      }
  }

  /** Pads: a hoop of light to fly through, a panel under it with chevrons streaming; spent ones dim. */
  private pads(c: Course, top: number, bottom: number) {
    const lv = this.lv;
    for (const pd of c.pads) {
      if (pd.z < top - 10 || pd.z > bottom + 6) continue;
      const done = (lv.padDone.get(pd) ?? 0) !== 0;
      const a = done ? 0.2 : 0.7 + 0.25 * Math.sin(this.time * 10);
      for (let k = 0; k < 3; k++) {
        const hoop = this.hoops.take(k === 1 && !done ? 0xffffff : PAD, a * (k === 1 ? 0.9 : 0.6));
        hoop.position.set(pd.x, FLIGHT_Y, pd.z + PAD_L - k * PAD_L);
        hoop.scale.setScalar(PAD_W + 0.6 - k * 0.15);
      }
      const panel = this.padPanels.take(PAD, a * 0.35);
      panel.position.set(pd.x, FLIGHT_Y - 1.6, pd.z);
      panel.scale.set(PAD_W * 2, 1, PAD_L * 2);
    }
  }

  /**
   * The land under every ship answers it: grass and trees blown about, the water pushed down and
   * foaming (both in their shaders, from `uWash`); spray or dust thrown up here; and a drift's
   * sparks, its turbo's colour.
   */
  private wash(dt: number) {
    const lv = this.lv;
    const t = lv.terrain;
    const slots = weather.uWash.value;
    let n = 0;
    const blow = (x: number, z: number, speed: number, drift: number, livery: number) => {
      if (n < WASH) slots[n++].set(x, z, clamp(0.35 + speed / 60, 0.35, 1), 6 + speed * 0.06 + drift * 2);
      const g = t.height(x, z);
      const wy = t.water(z);
      const k = clamp(speed / 50, 0.2, 1.4);
      if (wy > g) {
        // a rooster tail of spray behind, thrown wide in a drift
        if (Math.random() < 0.9 * k)
          this.fx.add({ x: x + (Math.random() - 0.5) * 1.6, y: wy + 0.2, z: z + 2.2, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 5 * k, vz: 6 + speed * 0.25, gravity: 16, size: 0.35, grow: 1.6, life: 0.55, drag: 1.2, color: new THREE.Color(0xf4fbff), to: new THREE.Color(0x9ad0d8), glow: false, carried: false });
        if (drift && Math.random() < 0.8)
          this.fx.add({ x, y: wy + 0.2, z: z + 0.5, vx: drift * (10 + Math.random() * 8), vy: 4 + Math.random() * 4, vz: 4, gravity: 18, size: 0.4, grow: 1.4, life: 0.6, drag: 1.5, color: new THREE.Color(0xffffff), to: new THREE.Color(0x8ac8d0), glow: false, carried: false });
      } else if (Math.random() < 0.35 * k) {
        // dust off the ground, its own colour, drifting back
        this.fx.add({ x: x + (Math.random() - 0.5) * 3, y: g + 0.4, z: z + 1.5, vx: (Math.random() - 0.5) * 6 + drift * 8, vy: 1 + Math.random() * 1.5, vz: 4 + speed * 0.15, size: 0.9, grow: 3, life: 0.7, drag: 2, color: this.dust.clone().multiplyScalar(1.15), to: this.dust.clone().multiplyScalar(0.7), glow: false, carried: false });
      }
      void livery;
      void dt;
    };
    for (const p of lv.players) {
      if (p.down) continue;
      const drift = p.driftT > 0 ? -Math.sign(p.slide || 1) : 0;
      blow(p.x, p.z, p.fwd, drift, LIVERY[p.id][2]);
      this.driftFx(p);
    }
    for (const r of lv.rivals) if (Math.abs(r.z - lv.scroll) < 60) blow(r.x, r.z, r.v, 0, r.livery[2]);
    for (let i = n; i < WASH; i++) slots[i].z = 0;
  }

  /** Sparks off a drifting ship's tail, the turbo's colour; sparks off a wall it's grinding. */
  private driftFx(p: Player) {
    const hd = p.hd;
    const back = { x: -Math.sin(hd) * 1.6, z: Math.cos(hd) * 1.6 };
    if (p.driftT > 0) {
      const col = TURBO[p.driftTier];
      const out = -Math.sign(p.slide || 1);
      for (let k = 0; k < 1 + p.driftTier; k++)
        this.fx.add({ x: p.x + back.x + (Math.random() - 0.5), y: FLIGHT_Y + 0.2, z: p.z + back.z, vx: out * (6 + Math.random() * 10), vy: 1 + Math.random() * 3, vz: 8 + Math.random() * 10, gravity: 14, size: 0.18 + p.driftTier * 0.05, grow: 0.2, life: 0.25, drag: 2, color: new THREE.Color(col), to: new THREE.Color(0xff5a2a), carried: false });
    }
    // out of it after a wreck: smoking
    if (p.out && Math.random() < 0.5)
      this.fx.add({ x: p.x + (Math.random() - 0.5), y: FLIGHT_Y + 0.4, z: p.z, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: 2, size: 0.6, grow: 2.2, life: 1, drag: 1, color: new THREE.Color(0x4a4040), to: new THREE.Color(0x1a1418), glow: false, carried: false });
    if (p.wallT > 0) {
      const side = this.lv.terrain.course!.hold(p.x, p.z, p.x, p.z, 1.6).side;
      for (let k = 0; k < 3; k++)
        this.fx.add({ x: p.x - side * 0.9, y: FLIGHT_Y + (Math.random() - 0.5) * 0.6, z: p.z, vx: side * (2 + Math.random() * 6), vy: 1 + Math.random() * 4, vz: 10 + Math.random() * 16, gravity: 16, size: 0.16, grow: 0.1, life: 0.3, drag: 1.5, color: new THREE.Color(0xfff0b0), to: new THREE.Color(0xff6a2a), carried: false });
    }
  }

  private updateRivals(dt: number, top: number, bottom: number) {
    const lv = this.lv;
    lv.rivals.forEach((r: Rival, i) => {
      const v = this.rivals[i];
      if (!v) return;
      const seen = r.z > top - 12 && r.z < bottom + 8;
      v.ship.root.visible = seen;
      if (!seen) return;
      v.ship.update(dt);
      v.ship.root.position.set(r.x, FLIGHT_Y + r.alt, r.z);
      v.yaw = damp(v.yaw, r.hd, 10, dt);
      v.bank = damp(v.bank, clamp(-r.vx / 22 - lv.terrain.course!.k(r.z) * r.v * 0.6, -0.7, 0.7), 10, dt);
      v.spin = r.spin > 0 ? v.spin + dt * 16 : damp(v.spin, Math.round(v.spin / (Math.PI * 2)) * Math.PI * 2, 8, dt);
      v.ship.root.rotation.y = -v.yaw;
      v.ship.body.rotation.set(-clamp(r.vy * 0.025, -0.35, 0.35), v.spin, v.bank);
      v.ship.body.position.y = Math.sin(this.time * 2.1 + i * 1.7) * 0.12;
      v.ship.flash(r.flash > 0 ? 1 : 0);
      v.ship.shield.visible = false;
      v.ship.core.visible = false;
      const push = r.spin > 0 ? 0.2 : 0.8 + (r.surge > 0 ? 1.6 : 0) + r.v / 60;
      for (const f of v.ship.flames) {
        const fl = 0.8 + Math.random() * 0.4;
        f.scale.set(0.45 * fl, (0.6 + push * 0.6) * fl, 0.45 * fl);
      }
      // their wake: a trail in their glow, and smoke when they've spun out
      if (Math.random() < 0.7)
        for (const f of v.ship.flames) {
          f.getWorldPosition(this.v);
          this.fx.add({ x: this.v.x + (Math.random() - 0.5) * 0.2, y: this.v.y, z: this.v.z + 0.5, vz: 4, size: 0.35, grow: 0.2, life: 0.22, color: new THREE.Color(r.livery[2]), to: new THREE.Color(0x6a3a2a), carried: false });
        }
      if (r.spin > 0 && Math.random() < 0.6) this.fx.add({ x: r.x, y: FLIGHT_Y, z: r.z, vy: 3, vz: 2, size: 0.9, grow: 2.5, life: 0.8, color: new THREE.Color(0x4a4040), to: new THREE.Color(0x2a2228), carried: false });
    });
  }

  private say(text: string, sub: string, color: string) {
    this.banner = { text, sub, color, t: 0 };
  }

  /** What a race's events look and sound like. */
  handle(e: LevelEvent, view: LevelView) {
    const lv = this.lv;
    const fx = this.fx;
    const Y = FLIGHT_Y + 0.5;
    switch (e.type) {
      case 'count':
        audio.play('count', { pitch: 1 });
        break;
      case 'go':
        audio.play('count', { pitch: 2 });
        view.trauma = Math.max(view.trauma, 0.25);
        view.flash = Math.max(view.flash, 0.2);
        view.flashColor.set(0x8affb0);
        break;
      case 'launch': {
        const col = LIVERY[e.id][2];
        if (e.perfect) {
          this.say('PERFECT START', 'OFF THE LINE LIKE A SHOT', '#8affe0');
          audio.play('boost', { pitch: 1.2 });
          audio.play('sonic', { pitch: 1.1 });
          view.flash = Math.max(view.flash, 0.4);
          view.flashColor.set(0x8affe0);
          this.zoomKick = 0.1;
          view.shove(0, 1, 0.9);
          fx.ring(e.x, Y, e.z, 7, 0.4, true, 0xffffff);
          fx.ring(e.x, Y, e.z, 4, 0.3, true, col);
          for (let k = 0; k < 24; k++) fx.add({ x: e.x + (Math.random() - 0.5) * 3, y: Y, z: e.z + 1, vx: (Math.random() - 0.5) * 20, vz: 25 + Math.random() * 30, size: 0.3, grow: 0.3, life: 0.4, drag: 2, color: new THREE.Color(0x8affe0) });
        } else {
          this.say('FLOODED', 'TOO EARLY ON THE THROTTLE', '#ff8a4a');
          audio.play('risk_lost');
          for (let k = 0; k < 14; k++) fx.add({ x: e.x + (Math.random() - 0.5) * 2, y: Y, z: e.z + 1.5, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 3, vz: 3 + Math.random() * 4, size: 0.8, grow: 2.5, life: 0.9, color: new THREE.Color(0x5a5050), to: new THREE.Color(0x2a2228), glow: false });
        }
        break;
      }
      case 'pad': {
        const p = lv.players[e.id];
        audio.play('pad', { pan: e.x / HALF_W });
        view.flash = Math.max(view.flash, 0.18);
        view.flashColor.set(0x5affe8);
        this.zoomKick = Math.max(this.zoomKick, 0.07);
        view.shove(0, 1, 0.6);
        fx.ring(p.x, Y, p.z, 5, 0.3, true, 0x5affe8);
        for (let k = 0; k < 18; k++) fx.add({ x: p.x + (Math.random() - 0.5) * 4, y: Y, z: p.z, vx: (Math.random() - 0.5) * 6, vz: 30 + Math.random() * 40, size: 0.22, grow: 0.2, life: 0.35, color: new THREE.Color(k % 3 ? 0x5affe8 : 0xffffff) });
        view.pop('BOOST', p.x, p.z - 3, '#5affe8');
        break;
      }
      case 'wall': {
        // grinding a wall: sparks, a scrape; slammed into it, a crunch and a shake
        if (e.hard > 0.25 || Math.random() < 0.4) audio.play('scrape', { pan: e.x / HALF_W, vol: 0.4 + e.hard * 0.6 });
        fx.sparks(e.x, Y, e.z, 4 + Math.round(e.hard * 16), 0xffd890, 12 + e.hard * 10, 0.3, 0.2, false);
        if (e.hard > 0.3) {
          audio.play('hit_armor', { pan: e.x / HALF_W, vol: e.hard });
          view.trauma = Math.max(view.trauma, 0.15 + e.hard * 0.3);
          view.shove(e.side, 0, 0.3 + e.hard * 0.4);
        }
        break;
      }
      case 'shave': {
        const p = lv.players[e.id];
        audio.play('risk_up', { pitch: 1.3, vol: 0.5 });
        view.pop('CLOSE!', p.x, p.z - 3, '#ffb04a');
        break;
      }
      case 'back': {
        audio.play('risk_up', { pitch: 0.9, vol: 0.6 });
        fx.ring(e.x, Y, e.z, 5, 0.35, true, 0x8affe0);
        view.pop('BACK IN', e.x, e.z - 3, '#8affe0');
        break;
      }
      case 'thread': {
        const p = lv.players[e.id];
        audio.play('risk_up', { pitch: 1.5, vol: 0.5 });
        view.pop('THREADED', p.x, p.z - 3, '#ffd04a');
        break;
      }
      case 'driftTier': {
        audio.play('drift_tier', { pitch: 1 + (e.tier - 1) * 0.25 });
        fx.ring(e.x, Y, e.z, 2.5 + e.tier, 0.2, false, TURBO[e.tier]);
        break;
      }
      case 'driftBoost': {
        const p = lv.players[e.id];
        const col = TURBO[e.tier];
        audio.play('turbo', { pitch: 0.9 + e.tier * 0.12 });
        view.flash = Math.max(view.flash, 0.1 + e.tier * 0.06);
        view.flashColor.set(col);
        this.zoomKick = Math.max(this.zoomKick, 0.03 + e.tier * 0.02);
        view.shove(0, 1, 0.3 + e.tier * 0.2);
        fx.ring(p.x, Y, p.z, 3 + e.tier * 2, 0.3, false, col);
        for (let k = 0; k < 8 + e.tier * 6; k++) fx.add({ x: p.x + (Math.random() - 0.5) * 2, y: Y, z: p.z + 1, vx: (Math.random() - 0.5) * 10, vz: 24 + Math.random() * 30, size: 0.25, grow: 0.3, life: 0.35, drag: 2, color: new THREE.Color(k % 3 ? col : 0xffffff), carried: false });
        view.pop(['TURBO', 'SUPER TURBO', 'ULTRA TURBO'][e.tier - 1], p.x, p.z - 3.5, '#' + col.toString(16).padStart(6, '0'));
        break;
      }
      case 'wreck': {
        audio.play('wreck', { pan: e.x / HALF_W, vol: clamp(e.speed / 40, 0.5, 1) });
        const hard = clamp(e.speed / 45, 0.3, 1);
        view.trauma = Math.max(view.trauma, 0.35 + hard * 0.4);
        view.hitstop = Math.max(view.hitstop, Math.round(2 + hard * 4));
        view.flash = Math.max(view.flash, 0.3);
        view.flashColor.set(0xff4a3a);
        view.shove(e.nx, -e.nz, 0.9 * hard);
        fx.ring(e.x, Y, e.z, 4 + hard * 3, 0.25, false, 0xffffff);
        fx.sparks(e.x - e.nx, Y, e.z - e.nz, Math.round(14 + hard * 20), 0xffb04a, 22, 0.45, 0.28, false);
        fx.explode(e.x - e.nx, Y, e.z - e.nz, 0.6 + hard * 0.6, LIVERY[e.id][2], false);
        view.pop('WRECKED', e.x, e.z - 3.5, '#ff5a4a');
        break;
      }
      case 'tier': {
        // (a boom for each new tier; back up to one already boomed lately, just a whoosh)
        if (!e.up) break;
        const lead = lv.leader();
        if (!lead) break;
        const fresh = this.time - (this.boomed[e.tier] ?? -99) > 6;
        this.boomed[e.tier] = this.time;
        if (!fresh) {
          fx.ring(lead.x, Y, lead.z, 4, 0.25, true, 0xffffff);
          break;
        }
        // a sonic boom: a ring of air off the ship, a crack, the view kicked back
        fx.ring(lead.x, Y, lead.z, 5 + e.tier * 3, 0.45, true, 0xffffff);
        fx.ring(lead.x, Y, lead.z + 2, 3 + e.tier * 2, 0.3, true, e.tier >= 3 ? 0xffd04a : 0x9ae8ff);
        audio.play('sonic', { pitch: 0.8 + e.tier * 0.15, vol: 0.4 + e.tier * 0.2 });
        this.zoomKick = Math.max(this.zoomKick, 0.03 * e.tier);
        view.trauma = Math.max(view.trauma, 0.1 * e.tier);
        if (e.tier >= 2) view.pop(e.tier >= 3 ? 'HYPERSONIC' : 'SONIC', lead.x, lead.z - 4, e.tier >= 3 ? '#ffd04a' : '#9ae8ff');
        break;
      }
      case 'draft':
        if (e.on) {
          const p = lv.players[e.id];
          view.pop('SLIPSTREAM', p.x, p.z - 3, '#9ae8ff');
          audio.play('risk_up', { pitch: 0.8, vol: 0.6 });
        }
        break;
      case 'pass': {
        const r = lv.rivals[e.rival];
        audio.play('pass', { pan: e.x / HALF_W });
        this.placeT = 0;
        this.placeUp = true;
        view.pop(e.place === 1 ? 'IN THE LEAD!' : `${ordinal(e.place)}!`, e.x, e.z - 4, e.place === 1 ? '#ffd04a' : '#ffffff');
        if (r) for (let k = 0; k < 8; k++) fx.add({ x: (r.x + e.x) / 2, y: Y, z: (r.z + e.z) / 2, vx: Math.sign(e.x - r.x || 1) * (4 + Math.random() * 6), vz: 10 + Math.random() * 10, size: 0.5, grow: 2, life: 0.3, color: new THREE.Color(0xffffff), glow: false });
        if (e.place === 1) {
          view.flash = Math.max(view.flash, 0.15);
          view.flashColor.set(0xffd04a);
        }
        break;
      }
      case 'passed':
        this.placeT = 0;
        this.placeUp = false;
        audio.play('pass', { pitch: 0.75, vol: 0.5 });
        break;
      case 'bump':
        audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.4 + e.hard * 0.5 });
        fx.sparks(e.x, Y, e.z, 4 + Math.round(e.hard * 10), 0xffd890, 14, 0.25, 0.2);
        view.trauma = Math.max(view.trauma, 0.1 + e.hard * 0.2);
        break;
      case 'takedown': {
        // the takedown: a beat of slow motion (short: never long enough to lose your line)
        view.slowmo = 0.3;
        view.slowmoT = 0.22;
        view.flash = Math.max(view.flash, 0.35);
        view.flashColor.set(0xffffff);
        view.trauma = Math.max(view.trauma, 0.45);
        fx.explode(e.x, Y, e.z, 1.4, lv.rivals[e.rival]?.livery[2] ?? 0xffb04a, false);
        fx.ring(e.x, Y, e.z, 9, 0.4, false, 0xffd04a);
        audio.play('takedown', { pan: e.x / HALF_W });
        view.pop('TAKEDOWN!', e.x, e.z - 4, '#ffd04a');
        break;
      }
      case 'finalStretch':
        this.say('FINAL STRETCH', 'GIVE IT EVERYTHING', '#ffd04a');
        audio.play('risk_up', { pitch: 1.2 });
        break;
      case 'finish': {
        view.slowmo = 0.25;
        view.slowmoT = 0.5;
        view.flash = Math.max(view.flash, 0.5);
        view.flashColor.set(e.place === 1 ? 0xffd04a : 0xffffff);
        view.trauma = Math.max(view.trauma, 0.3);
        fx.ring(e.x, Y, e.z, 12, 0.6, true, 0xffffff);
        fx.ring(e.x, Y, e.z, 7, 0.45, true, 0xffd04a);
        const cols = [0xffd04a, 0xff5a4a, 0x8affe0, 0xffffff, 0xd08aff];
        for (let k = 0; k < (e.place === 1 ? 70 : 30); k++) {
          const a = Math.random() * Math.PI * 2;
          const v = 10 + Math.random() * 26;
          fx.add({ x: e.x, y: Y + 1, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 6 + Math.random() * 10, gravity: 14, size: 0.3, grow: 0.1, life: 1 + Math.random() * 0.6, drag: 1.5, color: new THREE.Color(cols[k % cols.length]) });
        }
        audio.play('perfect', { pitch: e.place === 1 ? 1 : 0.8 });
        break;
      }
    }
  }

  /** Decays what the events set going; the drift's scream. */
  tick(dt: number) {
    this.zoomKick = Math.max(0, this.zoomKick - dt * 0.35);
    this.placeT += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 2.2) this.banner = null;
    }
    for (const p of this.lv.players) audio.loop('drift', `p${p.id}`, p.driftT > 0 && !p.down && this.lv.state !== 'clear', 0.25 + p.driftTier * 0.25);
  }

  dispose() {
    for (const v of this.rivals) v.ship.root.removeFromParent();
    for (const p of this.lv.players) audio.loop('drift', `p${p.id}`, false);
    for (const s of weather.uWash.value) s.z = 0;
  }
}

/** 1ST, 2ND, 3RD, 4TH. */
export function ordinal(n: number) {
  return `${n}${n === 1 ? 'ST' : n === 2 ? 'ND' : n === 3 ? 'RD' : 'TH'}`;
}

/** A steady 0..1 from a whole number (for the rock's jags: the same each frame). */
function hash(k: number) {
  const x = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
