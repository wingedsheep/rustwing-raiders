import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { library, type Instance, type Skin } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { weather } from '../render/alive';
import type { PixelRenderer } from '../render/pixel';
import { Fx } from './fx';
import { BoardJuice } from './board-juice';
import { Rig, POSE, type Pose } from './rig';
import { LIVERY } from './ship-model';
import { audio, type Sfx } from '../audio';
import { Cell, WALL_MOUNT, type Prop, type RoomKind } from '../sim/deck';
import { FOES, GATE, HERO, SIGHT_CONE, VENT, WORK, type Boarding, type BoardEvent, type Foe, type FoeKind, type Hero } from '../sim/boarding';
import { clamp, damp, lerp } from '../util';

/** The camera leans back this far from straight down (a little more than in flight: walls have faces). */
const TILT = (36 * Math.PI) / 180;
/** Half the view's height in world units, zoomed in: how close the fight is. */
const HALF_H = 7.6;
const WALL_H = 2.7;
/** Walls between you and the camera are cut down to this (so a room is never hidden behind its own wall). */
const LOW_H = 0.5;
/** How many lamps can be lit at once. */
const LAMPS = 12;

/** Each kind of room's deck plating, and its lamps. */
const FLOOR: Record<RoomKind, { a: number; b: number; lamp: number }> = {
  lock: { a: 0x4a3c34, b: 0x3a2e28, lamp: 0xffb070 },
  corridor: { a: 0x3c3a48, b: 0x34323e, lamp: 0xffd8a0 },
  engine: { a: 0x3c302c, b: 0x2e2522, lamp: 0xff9850 },
  bunks: { a: 0x4c4036, b: 0x40362e, lamp: 0xffc890 },
  mess: { a: 0x4a4644, b: 0x3c3836, lamp: 0xffe0b0 },
  hold: { a: 0x403e44, b: 0x36343a, lamp: 0xfff0d0 },
  vault: { a: 0x2c3c40, b: 0x243236, lamp: 0x8af0e0 },
  bridge: { a: 0x384052, b: 0x2e3546, lamp: 0xb0d0ff },
};

/** A lamp on a wall: where, how bright, and whether its room is lit yet. */
interface Lamp {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  power: number;
  room: number;
  /** 0 dark … 1 lit; flickers on the first time you walk in. */
  on: number;
  flick: number;
  /** A lamp that's always lit (the breach's glow, the drive, the core). */
  always: boolean;
}

/** The kill sting's steps, in semitones: a streak climbs a pentatonic scale. */
const PENTA_STEP = [0, 2, 4, 7, 9, 12, 14, 16];

/** A light that's there for a moment: a muzzle flash, a blast. */
interface Flash {
  x: number;
  y: number;
  z: number;
  color: THREE.Color;
  power: number;
  t: number;
  life: number;
  dist: number;
}

/** A word that pops up in the world (TAKEDOWN, OPEN, +4). */
export interface Pop {
  text: string;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  color: string;
  big: boolean;
}

interface Ghost {
  rig: Rig;
  t: number;
  mat: THREE.MeshBasicMaterial;
}

interface Casing {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  rx: number;
  ry: number;
  t: number;
  big: boolean;
}

const KELTER_SKIN: Skin = [0x5a5a62, 0x8a2a2a, 0xff4a3a];
/** The families' own colours (docs/factions): a lattice ship is white ceramic and cyan, a Hive ship violet and acid. */
const FAMILY_SKIN: Record<'lattice' | 'bloom' | 'wild', Skin> = {
  lattice: [0xe8ecf0, 0x2a3448, 0x4ae8ff],
  bloom: [0x6a3a8a, 0xd8c0ff, 0xb0ff4a],
  wild: [0x5a7a3a, 0xd8ccb0, 0xff6aa8],
};
/** A family's floor leans this way. */
const FAMILY_FLOOR: Record<string, number> = { lattice: 0xb8c8e0, bloom: 0x5a3a70 };
/** Rays in a crewman's cone of sight. */
const CONE_RAYS = 22;
const CONES = 26;

/** Leans skin `a` towards `b` by k. */
function mixSkin(a: Skin, b: Skin, k: number): Skin {
  const c = new THREE.Color();
  return a.map((x, i) => c.setHex(x).lerp(new THREE.Color(b[i]), k).getHex()) as Skin;
}

export class BoardingView {
  readonly scene = new THREE.Scene();
  /** Drawn over the grade: the danger (enemy rounds, aim lines) always reads. */
  readonly overlay = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-16, 16, HALF_H, -HALF_H, 1, 300);
  readonly fx = new Fx();
  private hemi = new THREE.HemisphereLight(0x8a90c0, 0x2a2030, 1.0);
  private sun = new THREE.DirectionalLight(0xc8d0ff, 0.55);
  private lights: THREE.PointLight[] = [];
  private lamps: Lamp[] = [];
  private flashes: Flash[] = [];
  private heroRigs: Rig[] = [];
  private foeRigs = new Map<number, Rig>();
  private poses = new Map<Rig, Pose>();
  private props = new Map<number, Instance>();
  private doorInst: (Instance | null)[] = [];
  private crateLids: (THREE.Object3D | undefined)[] = [];
  private turretInst: (Instance | null)[] = [];
  private canisterInst: (Instance | null)[] = [];
  private alarmLamps: (THREE.Object3D | undefined)[] = [];
  private heart: THREE.Object3D | undefined;
  private strongLid: THREE.Object3D | undefined;
  private ghosts: Ghost[] = [];
  private casings: Casing[] = [];
  private casingMesh: THREE.InstancedMesh;
  private decals: THREE.InstancedMesh;
  private decalAt = 0;
  private roundMesh: THREE.InstancedMesh;
  private roundRim: THREE.InstancedMesh;
  private tracerMesh: THREE.InstancedMesh;
  private tinMesh: THREE.InstancedMesh;
  private lasers: THREE.Mesh[] = [];
  private cables: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  readonly pops: Pop[] = [];
  /** The skin the ship's crew and fittings wear (its owners' colours). */
  readonly skin: Skin;
  /** The tells drawn on the deck: cones of sight, arcs about to swing, where things will land. */
  private cones: THREE.Mesh[] = [];
  private sectors: THREE.Mesh[] = [];
  private marks: { fill: THREE.Mesh; rim: THREE.Mesh }[] = [];
  private beams: THREE.Mesh[] = [];
  private tethers: THREE.Mesh[] = [];
  private walls = new Map<number, THREE.Mesh>();
  private sacMeshes: THREE.Mesh[] = [];
  private puffs: THREE.Mesh[] = [];
  private gateFields: { field: THREE.Mesh; lines: THREE.Mesh[] }[] = [];
  private heartObj: THREE.Object3D | null = null;
  private heartGlow: THREE.Object3D | undefined;
  private cageDoors: (THREE.Object3D | undefined)[] = [];
  private torch: THREE.Mesh[] = [];
  private halos = new Map<number, THREE.Mesh>();
  private dark: boolean;
  time = 0;
  /** Shared camera shake; combat feedback never changes simulation speed. */
  trauma = 0;
  private kick = new THREE.Vector2();
  private flash = 0;
  private flashColor = new THREE.Color(1, 1, 1);
  hurt = 0;
  private zoom = 1;
  private punch = 0;
  private cam = new THREE.Vector3();
  private camVel = new THREE.Vector2();
  /** 0 normal, rising to 1 when the alarm's been raised; the core out: lockdown. */
  private alarmK = 0;
  private lockK = 0;
  private kelterK = 0;
  /** Seconds into the breach (the intro) and out (the end). */
  private introT = 0;
  private tickSfx = 0;
  private ricochetT = 0;
  private tinCombo = 0;
  /** Crew dropped in a quick run (the kill's sting climbs with it), and the seconds left to add one. */
  private killStreak = 0;
  private killT = 0;
  private tinT = 0;
  private aspect = 16 / 9;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private e = new THREE.Euler();
  private savedCloud = 0;
  private wasWork: number[] = [];
  /** Arms, fire, steam, seals, the rooter, bodies bowling: the kinetic layer (view/board-juice.ts). */
  private juice: BoardJuice;

  constructor(
    readonly b: Boarding,
    skin: Skin,
    private liveries: Skin[] = LIVERY,
    /** Your ship's frame (the one clamped on outside). */
    private frame = 'kestrel',
  ) {
    this.skin = b.family === 'scrap' ? skin : mixSkin(FAMILY_SKIN[b.family], skin, 0.12);
    this.dark = b.condition === 'dark';
    const scene = this.scene;
    scene.background = new THREE.Color(0x06050b);
    scene.add(this.hemi, this.sun, this.sun.target, this.fx.group);
    this.sun.position.set(-8, 30, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26;
    sc.right = 26;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 80;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.03;
    for (let i = 0; i < LAMPS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      this.lights.push(l);
      scene.add(l);
    }
    // cloud shadows are for planets: inside a hull there's no sky
    this.savedCloud = weather.uCloudDark.value;
    weather.uCloudDark.value = 0;
    this.fx.ground = () => 0;

    this.space();
    this.buildDeck();
    this.buildProps();
    this.buildHull();

    // characters: you, then the crew at their posts
    b.heroes.forEach((h, i) => {
      const rig = new Rig('pilot', liveries[i % liveries.length]);
      this.heroRigs.push(rig);
      this.poses.set(rig, POSE());
      scene.add(rig.root);
      this.wasWork.push(0);
      for (let g = 0; g < 4; g++) {
        const ghost = new Rig('pilot', liveries[i % liveries.length]);
        const mat = new THREE.MeshBasicMaterial({ color: i ? 0x6affe0 : 0xffb04a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
        ghost.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            (o as THREE.Mesh).material = mat;
            o.castShadow = false;
            o.layers.disable(3);
          }
        });
        ghost.root.visible = false;
        scene.add(ghost.root);
        this.ghosts.push({ rig: ghost, t: 9, mat });
      }
    });
    for (const f of b.foes) this.addFoe(f);

    // rounds: a glowing core (and a dark rim on theirs, so they read on anything), tracers for yours
    const roundGeo = new THREE.IcosahedronGeometry(0.5, 1);
    this.roundMesh = new THREE.InstancedMesh(roundGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 300);
    this.roundMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
    this.roundRim = new THREE.InstancedMesh(roundGeo, new THREE.MeshBasicMaterial({ color: 0x14060c, side: THREE.BackSide }), 300);
    this.tracerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 300);
    this.tracerMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
    for (const m of [this.roundMesh, this.roundRim, this.tracerMesh]) {
      m.count = 0;
      m.frustumCulled = false;
    }
    this.overlay.add(this.roundRim, this.roundMesh);
    scene.add(this.tracerMesh);
    // brass on the deck
    this.casingMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), toon(0xd8a040, { glow: 0.15 }), 160);
    this.casingMesh.count = 0;
    this.casingMesh.frustumCulled = false;
    scene.add(this.casingMesh);
    // scorch and bullet marks
    this.decals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 8), new THREE.MeshBasicMaterial({ color: 0x0a080c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 260);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    scene.add(this.decals);
    // the tins
    const tinInst = library.clone('deck_tin', 0);
    const tinGeo = (tinInst?.obj.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined)?.geometry ?? new THREE.CylinderGeometry(0.16, 0.16, 0.12, 7);
    this.tinMesh = new THREE.InstancedMesh(tinGeo, toon(0xffc24a, { glow: 0.55 }), 200);
    this.tinMesh.count = 0;
    this.tinMesh.frustumCulled = false;
    scene.add(this.tinMesh);
    for (let i = 0; i < 12; i++) {
      const laser = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: 0xff3a4a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      laser.visible = false;
      this.lasers.push(laser);
      this.overlay.add(laser);
      const cable = new THREE.Mesh(GEO.box, flat(0x2a2a30));
      cable.visible = false;
      this.cables.push(cable);
      scene.add(cable);
    }
    // a ring on the deck under whatever's open, and under work being done
    for (let i = 0; i < 16; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.rings.push(ring);
      scene.add(ring);
    }
    this.buildTells();
    this.juice = new BoardJuice(b, {
      scene: this.scene,
      overlay: this.overlay,
      fx: this.fx,
      skin: this.skin,
      play: (name, x, vol, pitch) => this.play(name, x, vol, pitch),
      shake: (k) => (this.trauma = Math.min(1, this.trauma + k)),
      kickCam: (a, k) => {
        this.kick.x -= Math.cos(a) * k;
        this.kick.y -= Math.sin(a) * k;
      },
      screenFlash: (color, k) => {
        this.flashColor.setHex(color);
        this.flash = Math.max(this.flash, k);
      },
      muzzle: (x, y, z, a, color, k) => this.muzzle(x, y, z, a, color, k),
      casing: (x, z, a, big) => this.casing(x, z, a, big),
      decal: (x, z, size) => this.decal(x, 0.03, z, 0, size, true),
      light: (x, y, z, color, power, life, dist) => this.flashes.push({ x, y, z, color: new THREE.Color(color), power, t: 0, life, dist }),
      heroRig: (i) => this.heroRigs[i],
      foeRig: (id) => this.foeRigs.get(id),
    });
    // the camera starts pulled right out, over the whole ship (the intro swoops in)
    const d = b.deck;
    this.cam.set(d.w / 2, 0, d.h / 2);
    this.zoom = 2.6;
    audio.ambience('shipdeck');
    audio.music('board');
  }

  /** What a kind aboard wears: the planet's colours on a scrap crew, the family's on the rest. */
  private skinOf(kind: FoeKind): Skin {
    const fam = FOES[kind].family;
    if (fam === 'guild') return KELTER_SKIN;
    if (fam === 'scrap') return this.skin;
    return mixSkin(FAMILY_SKIN[fam], this.skin, fam === 'wild' ? 0 : 0.12);
  }

  private addFoe(f: Foe) {
    const rig = new Rig(f.kind, this.skinOf(f.kind), 1);
    this.foeRigs.set(f.id, rig);
    this.poses.set(rig, POSE());
    this.scene.add(rig.root);
    return rig;
  }

  // --- building the ship ------------------------------------------------------------------------

  /** The stars under the deck (it's a cutaway: you look down past the hull into space). */
  private space() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        varying vec2 vW;
        uniform float uTime;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec2 p = vW * 0.9;
          vec2 c = floor(p);
          float s = h(c);
          float star = step(0.99, s) * smoothstep(0.18, 0.0, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + s * 4.0) + s * 40.0));
          vec2 q = vW * 0.35;
          float s2 = step(0.985, h(floor(q))) * smoothstep(0.08, 0.0, length(fract(q) - 0.5)) * 0.6;
          // a nebula wash, faint
          float n = sin(vW.x * 0.03 + 1.3) * sin(vW.y * 0.05 - 0.4) * 0.5 + 0.5;
          vec3 col = mix(vec3(0.006, 0.005, 0.014), vec3(0.03, 0.012, 0.045), n * 0.8) + vec3(0.9, 0.85, 1.0) * (star + s2);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, -30, 0);
    this.scene.add(plane);
    this.spaceMat = mat;
  }
  private spaceMat!: THREE.ShaderMaterial;

  /** The deck plates and the walls: two merged meshes, coloured cell by cell. */
  private buildDeck() {
    const d = this.b.deck;
    const floorGeos: THREE.BufferGeometry[] = [];
    const glowGeos: THREE.BufferGeometry[] = [];
    const wallGeos: THREE.BufferGeometry[] = [];
    const col = new THREE.Color();
    const paint = (g: THREE.BufferGeometry, c: THREE.Color, top?: THREE.Color) => {
      const n = g.getAttribute('position').count;
      const arr = new Float32Array(n * 3);
      const norm = g.getAttribute('normal');
      for (let i = 0; i < n; i++) {
        const cc = top && norm.getY(i) > 0.5 ? top : c;
        arr.set([cc.r, cc.g, cc.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      return g;
    };
    const hash = (x: number, z: number) => {
      const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    // the dark under the plates shows as seams between them
    const under = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h), toon(0x14111a));
    under.rotation.x = -Math.PI / 2;
    under.position.set(d.w / 2, -0.02, d.h / 2);
    under.receiveShadow = true;
    this.scene.add(under);
    const skinA = new THREE.Color(this.skin[0]);
    const skinB = new THREE.Color(this.skin[1]);
    for (let z = 0; z < d.h; z++)
      for (let x = 0; x < d.w; x++) {
        const cell = d.cell(x, z);
        if (cell === Cell.Floor) {
          const room = d.rooms[d.roomOf[d.idx(x, z)]] ?? d.rooms[d.roomAt(x + 0.5, z + 0.5)];
          const kind: RoomKind = room?.kind ?? 'corridor';
          const fl = FLOOR[kind];
          // plates two cells square, each a little different
          const px = Math.floor(x / 2);
          const pz = Math.floor(z / 2);
          const k = 0.9 + hash(px, pz) * 0.18;
          col.setHex((px + pz) % 2 ? fl.a : fl.b).multiplyScalar(k);
          const tint = FAMILY_FLOOR[this.b.family];
          if (tint !== undefined && kind !== 'lock') col.lerp(this.c.setHex(tint).multiplyScalar(0.42), 0.35);
          const door = d.doorIn(x, z);
          // the doorways: hazard stripes
          if (door) col.setHex((x + z) % 2 ? 0x6a5a22 : 0x2a2420);
          const g = new THREE.PlaneGeometry(x % 2 ? 0.97 : 0.97, 0.97);
          g.rotateX(-Math.PI / 2);
          g.translate(x + 0.5 + (x % 2 ? -0.015 : 0.015), 0, z + 0.5 + (z % 2 ? -0.015 : 0.015));
          floorGeos.push(paint(g, col.clone()));
          // the corridor's guide lights, and loading lines in the holds
          if (kind === 'corridor' && room && (z === room.z0 || z === room.z1) && x % 3 === 0) {
            const s = new THREE.PlaneGeometry(0.5, 0.08);
            s.rotateX(-Math.PI / 2);
            s.translate(x + 0.5, 0.01, z === room.z0 ? z + 0.12 : z + 0.88);
            glowGeos.push(paint(s, new THREE.Color(0xffb04a)));
          }
          if (kind === 'vault' && room) {
            const cx = (room.x0 + room.x1 + 1) / 2;
            const cz = (room.z0 + room.z1 + 1) / 2;
            const r = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
            if (Math.abs(r - 3) < 0.5 && (x + z) % 2 === 0) {
              const s = new THREE.PlaneGeometry(0.3, 0.3);
              s.rotateX(-Math.PI / 2);
              s.translate(x + 0.5, 0.01, z + 0.5);
              glowGeos.push(paint(s, new THREE.Color(0x5ae0c0)));
            }
          }
          if (kind === 'lock' && room && (x === room.x0 || x === room.x1 || z === room.z0 || z === room.z1)) {
            const s = new THREE.PlaneGeometry(0.45, 0.45);
            s.rotateX(-Math.PI / 2);
            s.translate(x + 0.5, 0.01, z + 0.5);
            floorGeos.push(paint(s, new THREE.Color((x + z) % 2 ? 0xd8a020 : 0x221c18)));
          }
          continue;
        }
        if (cell !== Cell.Wall) continue;
        // a wall: tall, unless there's deck just behind it (up the screen), which it would hide
        const floorBehind = d.cell(x, z - 1) === Cell.Floor;
        const nearFloor = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dz]) => d.cell(x + dx, z + dz) === Cell.Floor);
        const h = floorBehind ? LOW_H : WALL_H;
        const edge = x === 0 || z === 0 || x === d.w - 1 || z === d.h - 1;
        const g = new THREE.BoxGeometry(1, h, 1);
        g.translate(x + 0.5, h / 2, z + 0.5);
        // inside: painted bulkheads in the owners' colours, dark caps; outside: the hull's plating
        const k = 0.85 + hash(x, z) * 0.15;
        const side = edge ? skinA.clone().multiplyScalar(0.55 * k) : nearFloor ? new THREE.Color(0x5a5462).lerp(skinA, 0.32).multiplyScalar(k) : new THREE.Color(0x2a2632);
        const top = floorBehind ? new THREE.Color(0x4a4452).lerp(skinB, 0.2) : new THREE.Color(0x1e1a26);
        wallGeos.push(paint(g, side, top));
        // a band of the second colour at waist height on the walls you look at
        if (!floorBehind && nearFloor && d.cell(x, z + 1) === Cell.Floor) {
          const band = new THREE.BoxGeometry(1.001, 0.22, 0.04);
          band.translate(x + 0.5, 1.15, z + 1.005);
          wallGeos.push(paint(band, skinB.clone().multiplyScalar(0.75 * k)));
          const kick = new THREE.BoxGeometry(1.001, 0.35, 0.05);
          kick.translate(x + 0.5, 0.175, z + 1.01);
          wallGeos.push(paint(kick, new THREE.Color(0x2a2430)));
        }
        // the cut-down walls show their cut: a bright rim
        if (floorBehind) {
          const rim = new THREE.BoxGeometry(1.001, 0.06, 1.001);
          rim.translate(x + 0.5, h + 0.03, z + 0.5);
          wallGeos.push(paint(rim, skinB.clone().multiplyScalar(0.6)));
        }
      }
    const floor = new THREE.Mesh(mergeGeometries(floorGeos), toon(0xffffff, { vertexColors: true }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    if (glowGeos.length) this.scene.add(new THREE.Mesh(mergeGeometries(glowGeos), new THREE.MeshBasicMaterial({ vertexColors: true })));
    const walls = new THREE.Mesh(mergeGeometries(wallGeos), toon(0xffffff, { vertexColors: true }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    this.scene.add(walls);
  }

  /** The hull round the deck: plating out to a bow, and the drives at the stern; and your ship, clamped on. */
  private buildHull() {
    const d = this.b.deck;
    // dark plating outside (the inside is what's lit), the owners' colour in a stripe
    const a = toon(new THREE.Color(0x2c2834).lerp(new THREE.Color(this.skin[0]), 0.15));
    const dark = toon(0x1c1822);
    const g = new THREE.Group();
    // the bow: a wedge past the bridge
    const bow = new THREE.Shape();
    bow.moveTo(0, 0);
    bow.lineTo(7, d.h * 0.3);
    bow.lineTo(7, d.h * 0.7);
    bow.lineTo(0, d.h);
    bow.lineTo(0, 0);
    const bowGeo = new THREE.ExtrudeGeometry(bow, { depth: WALL_H * 0.9, bevelEnabled: false });
    bowGeo.rotateX(Math.PI / 2);
    bowGeo.translate(d.w, WALL_H * 0.9, 0);
    const bowMesh = new THREE.Mesh(bowGeo, a);
    bowMesh.castShadow = true;
    g.add(bowMesh);
    // a glowing window strip along the bow
    g.add(part(GEO.box, toon(this.skin[0]), [d.w + 1.2, WALL_H * 0.9 + 0.02, d.h / 2], [0.35, 0.05, d.h * 0.7]));
    for (const k of [-1, 1]) g.add(part(GEO.box, flat(0x8ad0ff), [d.w + 3.2, WALL_H * 0.9 + 0.02, d.h / 2 + k * 2], [0.4, 0.05, 1.2]));
    // the drives aft: big bells, glowing
    for (const k of [-1, 1]) {
      const z = d.h / 2 + k * (d.h / 2 - 4);
      g.add(part(GEO.box, dark, [-2.5, 1.2, z], [5, 2.4, 5]));
      const bell = part(GEO.cyl, dark, [-6, 1.2, z], [3.6, 3, 3.6], [0, 0, Math.PI / 2]);
      g.add(bell);
      g.add(part(GEO.cyl, flat(0xffa040), [-7.6, 1.2, z], [2.6, 0.3, 2.6], [0, 0, Math.PI / 2]));
      this.lamps.push({ x: -8.5, y: 1.5, z, color: new THREE.Color(0xff8a3a), power: 6, room: -1, on: 1, flick: 0, always: true });
    }
    // fins along the sides
    for (let x = 6; x < d.w - 4; x += 9) {
      g.add(part(GEO.box, dark, [x, 0.8, -0.8], [3, 1.4, 1.6]));
      g.add(part(GEO.box, dark, [x + 4, 0.8, d.h + 0.8], [3, 1.4, 1.6]));
    }
    this.scene.add(g);
    // your ship, clamped nose-on to the lock
    const lock = d.rooms.find((r) => r.kind === 'lock')!;
    const mid = (lock.z0 + lock.z1 + 1) / 2;
    const ship = library.clone(`frame_${this.frame}`, 0, this.liveries[0], true);
    const obj = ship?.obj ?? part(GEO.box, toon(this.liveries[0][0]), [0, 0, 0], [3, 1, 4]);
    obj.scale.setScalar(1.5);
    obj.position.set(-5.2, 0.4, mid);
    obj.rotation.y = -Math.PI / 2;
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(obj);
    // the clamp collar from its nose to the hull
    this.scene.add(part(GEO.cyl, toon(0x4a3a30), [-1.4, 0.9, mid], [1.6, 2.6, 1.6], [0, 0, Math.PI / 2]));
    this.scene.add(part(GEO.cyl, flat(0xffa040), [-1.4, 0.9, mid], [1.75, 0.25, 1.75], [0, 0, Math.PI / 2]));
  }

  private buildProps() {
    const b = this.b;
    const d = b.deck;
    const statics: THREE.Object3D[] = [];
    for (const p of d.props) {
      const inst = library.clone(`deck_${p.kind}`, p.variant, this.skin, true);
      const obj = inst?.obj ?? stand(p);
      obj.position.set(p.x, 0, p.z);
      obj.rotation.y = p.rot + Math.PI;
      // things on walls sit against the wall behind them
      const back = WALL_MOUNT[p.kind];
      if (back) {
        obj.position.x -= Math.sin(p.rot) * back;
        obj.position.z -= Math.cos(p.rot) * back;
      }
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = p.kind !== 'sconce';
          o.receiveShadow = true;
        }
      });
      this.scene.add(obj);
      if (inst) this.props.set(p.id, inst);
      if (p.kind === 'sconce') {
        const room = d.rooms[p.room];
        const fl = FLOOR[room?.kind ?? 'corridor'];
        this.lamps.push({
          x: p.x + Math.sin(p.rot) * 0.4, y: 2.1, z: p.z + Math.cos(p.rot) * 0.4, color: new THREE.Color(fl.lamp), power: room?.kind === 'corridor' ? 3.2 : 4.2,
          room: p.room, on: b.visited.has(p.room) ? 1 : 0, flick: 0, always: false,
        });
      } else if (p.kind === 'engine') this.lamps.push({ x: p.x, y: 2.6, z: p.z, color: new THREE.Color(0xff7a2a), power: 5, room: p.room, on: 1, flick: 0, always: true });
      else if (p.kind === 'core') {
        this.heart = named(inst?.obj, 'deck_core__heart');
        this.lamps.push({ x: p.x, y: 1.8, z: p.z, color: new THREE.Color(0x6affe0), power: 5, room: p.room, on: 1, flick: 0, always: true });
      } else if (p.kind === 'strongbox') this.strongLid = named(inst?.obj, 'deck_strongbox__lid');
      else if (!inst || ANIMATED.has(p.kind)) continue;
      else statics.push(obj);
    }
    // the crates, turrets, canisters and alarms the sim knows by index
    for (const c of b.crates) this.crateLids.push(named(this.props.get(c.prop.id)?.obj, 'deck_crate__lid'));
    for (const t of b.turrets) {
      const inst = this.props.get(t.prop.id) ?? null;
      this.turretInst.push(inst);
      if (inst) inst.obj.position.y = -1.2;
    }
    for (const c of b.canisters) this.canisterInst.push(this.props.get(c.prop.id) ?? null);
    for (const a of b.alarms) this.alarmLamps.push(named(this.props.get(a.prop.id)?.obj, 'deck_alarm__lamp'));
    // the doors
    for (const door of d.doors) {
      const inst = library.clone('deck_door', 0, this.skin, true);
      const obj = inst?.obj ?? doorStand();
      obj.position.set(door.x, 0, door.z);
      obj.rotation.y = door.axis === 'x' ? 0 : Math.PI / 2;
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      this.scene.add(obj);
      this.doorInst.push(inst ?? { obj } as unknown as Instance);
    }
    // the breach you came in by
    const br = library.clone('deck_breach', 0, this.liveries[0], true);
    if (br) {
      br.obj.position.set(d.breach.x, 0.01, d.breach.z);
      this.scene.add(br.obj);
    }
    this.lamps.push({ x: d.breach.x, y: 1.2, z: d.breach.z, color: new THREE.Color(0xff7a30), power: 3, room: -1, on: 1, flick: 0, always: true });
    void statics;
  }

  // --- each frame -----------------------------------------------------------------------------------

  fit(aspect: number) {
    this.aspect = aspect;
  }

  /** The sim's events this step: sounds, sparks and shakes, without changing the shared clock. */
  handle(events: BoardEvent[]) {
    const b = this.b;
    for (const e of events) {
      switch (e.type) {
        case 'breach':
          this.play('breach', b.deck.breach.x, 0.9);
          break;
        case 'shot': {
          const rig = this.heroRigs[e.hero];
          rig?.kick(1.4);
          this.muzzle(e.x, 1.25, e.z, e.a, 0xffc070, 1.3);
          this.kick.x -= Math.cos(e.a) * 0.1;
          this.kick.y -= Math.sin(e.a) * 0.1;
          this.trauma = Math.min(1, this.trauma + 0.035);
          this.casing(e.x, e.z, e.a, false);
          this.play('foot_shot', e.x, 0.55, 0.92 + Math.random() * 0.16);
          break;
        }
        case 'blast': {
          this.heroRigs[e.hero]?.kick(2.6);
          this.muzzle(e.x, 1.2, e.z, e.a, 0xffa040, 2.6);
          for (let i = 0; i < 10; i++) {
            const a = e.a + (Math.random() - 0.5) * 0.9;
            const v = 4 + Math.random() * 7;
            this.fx.add({ x: e.x, y: 1.1, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 1.5, life: 0.5 + Math.random() * 0.4, size: 0.35, grow: 3, color: new THREE.Color(0x8a8090), to: new THREE.Color(0x2a2430), drag: 4, glow: false });
          }
          this.fx.sparks(e.x, 1.2, e.z, 14, 0xffd070, 16, 0.18, 0.12, false);
          this.casing(e.x, e.z, e.a, true);
          this.trauma = Math.min(1, this.trauma + 0.32);
          this.kick.x -= Math.cos(e.a) * 0.35;
          this.kick.y -= Math.sin(e.a) * 0.35;
          this.play('foot_blast', e.x, 0.95);
          break;
        }
        case 'dry':
          this.play('foot_dry', b.heroes[e.hero].x, 0.5);
          break;
        case 'shell':
          this.play('foot_shell', b.heroes[e.hero].x, 0.5);
          break;
        case 'foeShot': {
          const rig = e.id >= 0 ? this.foeRigs.get(e.id) : null;
          const at = rig ? rig.muzzle : this.v.set(e.x + Math.cos(e.a) * 0.6, 1.1, e.z + Math.sin(e.a) * 0.6);
          rig?.kick(1);
          this.muzzle(at.x, at.y, at.z, e.a, 0xff5a6a, 0.8);
          this.play('crew_shot', e.x, 0.72, 0.95 + Math.random() * 0.1);
          break;
        }
        case 'hit': {
          const rig = this.foeRigs.get(e.id);
          const f = b.foes.find((x) => x.id === e.id);
          rig?.hit(e.a, e.heavy ? 1.4 : 0.8);
          // where the round went in: a white pop, a blink of light, the camera nudged the way it went
          const hx = e.x - Math.cos(e.a) * 0.35;
          const hz = e.z - Math.sin(e.a) * 0.35;
          this.fx.add({ x: hx, y: 1.15, z: hz, life: 0.06, size: e.heavy ? 1.3 : 0.9, grow: 1.2, color: new THREE.Color(0xffffff) });
          this.flashes.push({ x: hx, y: 1.2, z: hz, color: new THREE.Color(e.plate ? 0xfff0c0 : 0xffd0a0), power: e.heavy ? 7 : 4, t: 0, life: 0.07, dist: 4 });
          this.kick.x += Math.cos(e.a) * 0.03;
          this.kick.y += Math.sin(e.a) * 0.03;
          this.trauma = Math.min(1, this.trauma + (e.heavy ? 0.06 : 0.025));
          // the tick that says it landed, climbing as they get nearer to going down
          if (f && !f.dead) this.play('foot_mark', e.x, 0.5, 1 + clamp(1 - f.hp / Math.max(1, f.max), 0, 1) * 0.5);
          if (e.plate) {
            this.fx.sparks(e.x - Math.cos(e.a) * 0.3, 1.1, e.z - Math.sin(e.a) * 0.3, e.heavy ? 6 : 3, 0xfff0c0, 10, 0.18, 0.12, false);
            this.play('plate_hit', e.x, 0.4, 0.9 + Math.random() * 0.25);
          } else {
            // a puff of whatever they're wearing blown out the far side, bits of their kit, sparks
            for (let i = 0; i < (e.heavy ? 4 : 3); i++) {
              const a = e.a + (Math.random() - 0.5) * 1.0;
              this.fx.add({ x: e.x, y: 1.1, z: e.z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, vy: 1 + Math.random() * 2, life: 0.4, size: 0.24, grow: 1.8, color: new THREE.Color(this.skin[1]).multiplyScalar(0.8), drag: 6, glow: false });
            }
            for (let i = 0; i < (e.heavy ? 3 : 2); i++) {
              const a = e.a + (Math.random() - 0.5) * 1.3;
              const v = 3 + Math.random() * 4;
              this.fx.add({ x: e.x, y: 1.1, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2 + Math.random() * 3, life: 0.9, size: 0.07 + Math.random() * 0.06, color: new THREE.Color(this.skin[i % 3]), solid: true, gravity: 20, spin: 12, glow: false });
            }
            this.fx.sparks(e.x, 1.1, e.z, e.heavy ? 8 : 5, 0xffe0a0, 11, 0.14, 0.11, false);
            if (Math.random() < 0.3) this.decal(e.x + Math.cos(e.a) * 0.7, 0.03, e.z + Math.sin(e.a) * 0.7, 0, 0.25 + Math.random() * 0.2, true);
            this.play('crew_hit', e.x, 0.6, 0.9 + Math.random() * 0.25);
          }
          break;
        }
        case 'block':
          this.fx.sparks(e.x, 1.1, e.z, 7, 0xfff4d0, 12, 0.2, 0.14, false);
          this.foeRigs.get(e.id)?.hit(e.a, 0.3);
          this.play('block', e.x, 0.45);
          break;
        case 'plateBreak': {
          const f = b.foes.find((x) => x.id === e.id);
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 4 + Math.random() * 6;
            this.fx.add({ x: e.x, y: 1.2, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 4, life: 1.6, size: 0.14 + Math.random() * 0.12, color: new THREE.Color(this.skin[0]), solid: true, gravity: 20, spin: 10 });
          }
          this.fx.sparks(e.x, 1.2, e.z, 14, 0xffd04a, 14, 0.3, 0.16, false);
          this.fx.ring(e.x, 0.1, e.z, 2.2, 0.3, false, 0xffd04a);
          this.pop('OPEN!', e.x, 2.4, e.z, '#ffd04a', true);
          this.trauma = Math.min(1, this.trauma + 0.15);
          this.play('plate_break', e.x, 0.8);
          void f;
          break;
        }
        case 'kill': {
          const f = b.foes.find((x) => x.id === e.id);
          // dropped: a burst of white where they stood, light thrown round the room, the camera
          // shoved the way they went, and a sting that climbs with each one dropped in a row
          this.killStreak = this.killT > 0 ? this.killStreak + 1 : 0;
          this.killT = 1.4;
          const heavyFoe = !!f && FOES[f.kind].role === 'heavy';
          this.fx.add({ x: e.x, y: 1.1, z: e.z, life: 0.09, size: heavyFoe ? 3.2 : 2.4, grow: 1.6, color: new THREE.Color(0xffffff) });
          this.fx.sparks(e.x, 1, e.z, 16, 0xffe0a0, 14, 0.3, 0.14, false);
          this.fx.ring(e.x, 0.15, e.z, heavyFoe ? 3 : 2.2, 0.22, false, 0xfff0d0);
          this.flashes.push({ x: e.x, y: 1.4, z: e.z, color: new THREE.Color(0xffe0b0), power: 16, t: 0, life: 0.16, dist: 9 });
          this.kick.x += Math.cos(e.a) * 0.18;
          this.kick.y += Math.sin(e.a) * 0.18;
          this.play('crew_kill', e.x, e.takedown ? 0.6 : 0.85, Math.pow(2, PENTA_STEP[Math.min(this.killStreak, PENTA_STEP.length - 1)] / 12));
          if (e.takedown) {
            this.trauma = Math.min(1, this.trauma + 0.5);
            this.punch = 1;
            this.flashColor.set(1, 0.95, 0.85);
            this.flash = 0.35;
            this.fx.ring(e.x, 0.15, e.z, 3.4, 0.35, false, 0xfff0d0);
            for (let i = 0; i < 8; i++) {
              const a = e.a + (Math.random() - 0.5) * 1.6;
              this.fx.add({ x: e.x, y: 0.3, z: e.z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, vy: 1, life: 0.6, size: 0.5, grow: 2.5, color: new THREE.Color(0x6a6070), to: new THREE.Color(0x2a2430), drag: 4, glow: false });
            }
            this.pop('TAKEDOWN', e.x, 2.6, e.z, '#fff0d0', true);
            this.play('takedown', e.x, 1);
          } else {
            this.trauma = Math.min(1, this.trauma + (heavyFoe ? 0.4 : 0.26) + Math.min(3, this.killStreak) * 0.05);
            this.flashColor.set(1, 0.95, 0.85);
            this.flash = Math.max(this.flash, 0.1);
          }
          // the body hits the deck a beat later
          const x = e.x;
          window.setTimeout(() => this.play('body_fall', x, f?.kind === 'bruiser' ? 0.8 : 0.5, f?.kind === 'bruiser' ? 0.8 : 1), 300);
          break;
        }
        case 'takedown':
          break;
        case 'bump':
          this.foeRigs.get(e.id)?.hit(Math.atan2(e.z - b.heroes[e.hero].z, e.x - b.heroes[e.hero].x), 1.2);
          this.fx.sparks(e.x, 1, e.z, 6, 0xffffff, 8, 0.2, 0.14, false);
          this.trauma = Math.min(1, this.trauma + 0.2);
          this.play('punch', e.x, 0.7);
          break;
        case 'heroHit': {
          this.heroRigs[e.hero]?.hit(e.a, 1.3);
          this.hurt = 1;
          this.trauma = Math.min(1, this.trauma + 0.45);
          this.fx.sparks(e.x, 1.1, e.z, 10, 0xff6a4a, 10, 0.25, 0.16, false);
          this.flashColor.set(1, 0.25, 0.2);
          this.flash = 0.18;
          this.play('foot_hurt', e.x, 0.9);
          break;
        }
        case 'heroDown':
          this.trauma = 1;
          this.play('player_down', b.heroes[e.hero].x, 1);
          break;
        case 'revive':
          this.fx.sparks(b.heroes[e.hero].x, 1, b.heroes[e.hero].z, 16, 0x8affb0, 8, 0.6, 0.2, false);
          this.play('revive', b.heroes[e.hero].x, 0.8);
          break;
        case 'perfect': {
          this.flashColor.set(0.55, 1, 0.9);
          this.flash = 0.3;
          this.fx.ring(e.x, 0.2, e.z, 2.6, 0.35, false, 0x8affe0);
          this.pop('PERFECT', e.x, 2.5, e.z, '#8affe0', true);
          this.play('perfect', e.x, 0.9);
          break;
        }
        case 'dash': {
          const h = b.heroes[e.hero];
          for (let i = 0; i < 6; i++) this.fx.add({ x: h.x, y: 0.15, z: h.z, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 0.6, life: 0.5, size: 0.35, grow: 2.2, color: new THREE.Color(0x6a6070), to: new THREE.Color(0x2a2430), drag: 3, glow: false });
          this.play('slide', h.x, 0.6);
          break;
        }
        case 'step':
          if (e.heavy) {
            this.trauma = Math.min(1, this.trauma + 0.04);
            this.play('step', e.x, 0.6, 0.55);
          } else if (e.hero) this.play('step', e.x, 0.22, 0.85 + Math.random() * 0.3);
          if (Math.random() < 0.5) this.fx.add({ x: e.x, y: 0.08, z: e.z, vx: 0, vz: 0, vy: 0.4, life: 0.4, size: 0.18, grow: 2, color: new THREE.Color(0x5a5060), to: new THREE.Color(0x2a2430), glow: false });
          break;
        case 'wall': {
          this.fx.sparks(e.x, 1.1, e.z, e.heavy ? 3 : 4, 0xffe0a0, 9, 0.16, 0.11, false);
          this.decal(e.x, 1 + Math.random() * 0.4, e.z, e.a, 0.12);
          if (this.ricochetT <= 0) {
            this.play('ricochet', e.x, 0.3, 0.85 + Math.random() * 0.3);
            this.ricochetT = 0.07;
          }
          break;
        }
        case 'alert': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f) this.pop('!', f.x, 2.5, f.z, '#ffd04a', true);
          if (this.tickSfx <= 0) {
            this.play('alert', f?.x ?? 0, 0.5);
            this.tickSfx = 0.25;
          }
          break;
        }
        case 'runner':
          break;
        case 'alarm':
          this.trauma = Math.min(1, this.trauma + 0.3);
          this.flashColor.set(1, 0.2, 0.15);
          this.flash = 0.25;
          this.play('alarm', e.x, 1);
          break;
        case 'alarmBroken':
          this.fx.explode(e.x, 1.2, e.z, 0.5, 0xff4a3a, false);
          this.pop('SMASHED', e.x, 2.4, e.z, '#8affb0', false);
          this.play('explode_small', e.x, 0.6);
          break;
        case 'door': {
          const door = b.deck.doors[e.id];
          this.play('door', door.x, 0.35, e.open ? 1 : 0.85);
          break;
        }
        case 'windup': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f) this.fx.sparks(f.x, 2.2, f.z, 4, 0xffffff, 3, 0.25, 0.18, false);
          break;
        }
        case 'swing': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('swing', f?.x ?? 0, 0.6);
          break;
        }
        case 'aim': {
          const x = e.id >= 0 ? b.foes.find((f) => f.id === e.id)?.x : b.turrets[-1 - e.id]?.prop.x;
          this.play('aim_tell', x ?? 0, 0.35);
          break;
        }
        case 'charge': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('charge', f?.x ?? 0, 0.9);
          break;
        }
        case 'slam':
          this.trauma = Math.min(1, this.trauma + 0.5);
          this.fx.sparks(e.x, 1.2, e.z, 16, 0xfff0c0, 14, 0.3, 0.16, false);
          for (let i = 0; i < 8; i++) this.fx.add({ x: e.x, y: 1, z: e.z, vx: (Math.random() - 0.5) * 5, vz: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 2, life: 0.8, size: 0.5, grow: 2, color: new THREE.Color(0x6a6070), to: new THREE.Color(0x2a2430), drag: 3, glow: false });
          this.pop('STUNNED', e.x, 2.8, e.z, '#ffd04a', true);
          this.play('slam', e.x, 1);
          break;
        case 'crate': {
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            this.fx.add({ x: e.x, y: 1, z: e.z, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 3 + Math.random() * 4, life: 0.9, size: 0.18, grow: 0.5, color: new THREE.Color(0x5ae0c0), gravity: 6, drag: 1 });
          }
          this.fx.ring(e.x, 0.2, e.z, 3, 0.4, false, 0x5ae0c0);
          const n = b.crates.filter((c) => c.open).length;
          this.pop(`${n}/${b.crates.length}`, e.x, 2.4, e.z, '#5ae0c0', true);
          this.play('crate_open', e.x, 0.9);
          break;
        }
        case 'strongbox':
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 2 + Math.random() * 5;
            this.fx.add({ x: e.x, y: 1, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + Math.random() * 6, life: 1.4, size: 0.14, color: new THREE.Color(0xffd04a), solid: true, gravity: 18, spin: 12 });
          }
          this.fx.ring(e.x, 0.2, e.z, 3.4, 0.45, false, 0xffd04a);
          this.pop(`+${e.pay}`, e.x, 2.6, e.z, '#ffd04a', true);
          this.flashColor.set(1, 0.85, 0.4);
          this.flash = 0.2;
          this.play('strongbox_open', e.x, 1);
          break;
        case 'core':
          this.trauma = 0.8;
          this.flashColor.set(0.6, 1, 0.95);
          this.flash = 0.6;
          this.fx.ring(e.x, 0.3, e.z, 6, 0.6, false, 0x8affe0);
          this.fx.sparks(e.x, 1.4, e.z, 40, 0x8affe0, 16, 0.6, 0.2, false);
          this.pop('CORE', e.x, 3, e.z, '#8affe0', true);
          this.play('core_pull', e.x, 1);
          window.setTimeout(() => this.play('lockdown', e.x, 1), 450);
          break;
        case 'tin': {
          this.tinCombo = this.tinT > 0 ? this.tinCombo + 1 : 0;
          this.tinT = 0.6;
          this.fx.sparks(e.x, 0.5, e.z, 3, 0xffd04a, 4, 0.2, 0.1, false);
          this.play('pickup_tin', e.x, 0.5, 1 + Math.min(12, this.tinCombo) * 0.06);
          break;
        }
        case 'heal': {
          const h = b.heroes[e.hero];
          this.fx.sparks(h.x, 1.2, h.z, 14, 0x8affb0, 6, 0.6, 0.16, false);
          this.pop(`+${e.n}`, h.x, 2.4, h.z, '#8affb0', false);
          this.play('heal_foot', h.x, 0.7);
          break;
        }
        case 'fuse': {
          const c = b.canisters[e.i];
          this.play('canister', c.prop.x, 0.7);
          break;
        }
        case 'boom': {
          this.fx.explode(e.x, 0.6, e.z, e.r * 0.8, 0xffa040, false);
          this.decal(e.x, 0.02, e.z, 0, e.r * 0.8, true);
          this.flashes.push({ x: e.x, y: 1.5, z: e.z, color: new THREE.Color(0xffa050), power: 30, t: 0, life: 0.4, dist: e.r * 5 });
          this.trauma = Math.min(1, this.trauma + 0.2 + e.r * 0.15);
          this.play('explode_big', e.x, Math.min(1, 0.5 + e.r * 0.15));
          break;
        }
        case 'kelters': {
          const pod = library.clone('deck_hookpod', 0, undefined, true);
          const obj = pod?.obj ?? part(GEO.cone6, toon(0x5a5a62), [0, 1, 0], [2.4, 2, 2.4]);
          obj.position.set(e.x, 0, e.z);
          this.scene.add(obj);
          this.lamps.push({ x: e.x, y: 2.2, z: e.z, color: new THREE.Color(0xff2a2a), power: 7, room: -1, on: 1, flick: 0, always: true });
          this.fx.explode(e.x, 0.8, e.z, 1.6, 0xff5a3a, false);
          this.trauma = 1;
          this.flashColor.set(1, 0.2, 0.15);
          this.flash = 0.4;
          this.play('kelter_clamp', e.x, 1);
          break;
        }
        case 'kelterIn': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f && !this.foeRigs.has(f.id)) this.addFoe(f);
          if (f) this.fx.sparks(f.x, 1, f.z, 8, 0xff6a4a, 8, 0.3, 0.14, false);
          break;
        }
        case 'hookShot': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('hook_fire', f?.x ?? 0, 0.8);
          break;
        }
        case 'hooked': {
          const h = b.heroes[e.hero];
          this.trauma = Math.min(1, this.trauma + 0.3);
          this.pop('HOOKED', h.x, 2.6, h.z, '#ff6a5a', true);
          this.play('hook', h.x, 0.9);
          break;
        }
        case 'snap':
          this.fx.sparks(e.x, 1.1, e.z, 10, 0xffffff, 10, 0.25, 0.12, false);
          this.play('hook_snap', e.x, 0.9);
          break;
        case 'collected':
          this.trauma = 1;
          this.play('slam', b.heroes[e.hero].x, 0.9);
          break;
        case 'turretUp': {
          const t = b.turrets[e.i];
          this.play('turret_up', t.prop.x, 0.7);
          break;
        }
        case 'turretDown':
          break;
        case 'room':
          for (const l of this.lamps) if (l.room === e.room && l.on === 0) l.flick = 0.6 + Math.random() * 0.3;
          break;
        case 'tick':
          this.play('clock_tick', this.cam.x, 0.7, e.s <= 3 ? 1.25 : 1);
          break;
        case 'work': {
          const prev = this.wasWork[e.hero] ?? 0;
          // a tick every tenth of the way
          if (Math.floor(e.t * 10) !== Math.floor(prev * 10)) this.play('crack_tick', b.heroes[e.hero].x, 0.4, 0.9 + e.t * 0.6);
          this.wasWork[e.hero] = e.t;
          break;
        }
        case 'escape':
          this.play('airlock', b.deck.breach.x, 1);
          break;
        case 'failed':
          break;
        case 'thrownOut':
          this.play('airlock', b.deck.breach.x, 0.7, 0.8);
          break;
        case 'suspect': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('blink', f?.x ?? 0, 0.35, 0.7);
          break;
        }
        case 'listen': {
          const f = b.foes.find((x) => x.id === e.id);
          if (f) this.fx.ring(f.x, 2.5, f.z, 1.4, 0.6, false, 0x8af4ff);
          this.play('toll', f?.x ?? 0, 0.55, 1.2);
          break;
        }
        case 'lance': {
          const end = { x: e.x + Math.cos(e.a) * e.len, z: e.z + Math.sin(e.a) * e.len };
          this.fx.sparks(end.x, 1.1, end.z, 12, 0x9af4ff, 10, 0.3, 0.14, false);
          this.fx.ring(e.x + Math.cos(e.a) * 0.7, 1.1, e.z + Math.sin(e.a) * 0.7, 1.2, 0.25, false, 0x9af4ff);
          this.flashes.push({ x: e.x, y: 1.4, z: e.z, color: new THREE.Color(0x6af0ff), power: 14, t: 0, life: 0.18, dist: 9 });
          this.decal(end.x, 1.1, end.z, e.a, 0.2);
          this.trauma = Math.min(1, this.trauma + 0.12);
          this.play('laser_fire', e.x, 0.55, 1.35);
          break;
        }
        case 'reflect':
          this.fx.sparks(e.x, 1.1, e.z, 4, 0x9af4ff, 8, 0.15, 0.1, false);
          this.play('reflect', e.x, 0.3, 1.1 + Math.random() * 0.2);
          break;
        case 'wallHit':
          this.fx.sparks(e.x, 1.1, e.z, 6, 0x9af4ff, 9, 0.2, 0.12, false);
          this.play('hit_armor', e.x, 0.45, 1.3);
          break;
        case 'wallBreak':
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            this.fx.add({ x: e.x, y: 1 + Math.random(), z: e.z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, vy: 2 + Math.random() * 3, life: 0.7, size: 0.16, color: new THREE.Color(0x9af4ff), gravity: 12, drag: 1 });
          }
          this.pop('OPEN!', e.x, 2.6, e.z, '#ffd04a', true);
          this.trauma = Math.min(1, this.trauma + 0.2);
          this.play('shield_break', e.x, 0.8);
          break;
        case 'wallUp': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('shield_up', f?.x ?? 0, 0.4);
          break;
        }
        case 'shove': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('laser_charge', f?.x ?? 0, 0.35, 1.4);
          break;
        }
        case 'swell': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('feed', f?.x ?? 0, 0.45, 0.7);
          break;
        }
        case 'lob':
          this.play('shot_mine', e.x, 0.4, 1.3);
          break;
        case 'spores':
          for (let i = 0; i < 16; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = 2 + Math.random() * 3;
            this.fx.add({ x: e.x, y: 0.6, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * 2, life: 0.8, size: 0.4, grow: 2.5, color: new THREE.Color(0xb490d8), to: new THREE.Color(0x3a2a48), drag: 3, glow: false });
          }
          this.play('flak_burst', e.x, 0.5, 0.6);
          break;
        case 'jam':
          this.pop('JAMMED', b.heroes[e.hero].x, 2.4, b.heroes[e.hero].z, '#b0ff4a', false);
          this.play('heavy_dry', b.heroes[e.hero].x, 0.5);
          break;
        case 'gate':
          if (e.on) this.play('blink', b.gates[e.i].gate.door.x, 0.3, 1.6);
          break;
        case 'gateHit':
          this.fx.sparks(e.x, 1, e.z, 12, 0x9af4ff, 10, 0.3, 0.14, false);
          break;
        case 'cage':
          this.fx.sparks(e.x, 1.2, e.z, 18, 0xffd070, 12, 0.3, 0.14, false);
          this.play('block', e.x, 0.8, 0.7);
          window.setTimeout(() => this.play('shriek', e.x, 0.8), 250);
          break;
        case 'rear': {
          const f = b.foes.find((x) => x.id === e.id);
          this.play('wingbeat', f?.x ?? 0, 0.5, 1.4);
          break;
        }
        case 'pounce':
          this.fx.sparks(e.x, 0.4, e.z, 8, 0xd8ccb0, 8, 0.3, 0.14, false);
          for (let i = 0; i < 6; i++) this.fx.add({ x: e.x, y: 0.15, z: e.z, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4, vy: 0.5, life: 0.5, size: 0.4, grow: 2, color: new THREE.Color(0x6a6070), to: new THREE.Color(0x2a2430), drag: 3, glow: false });
          this.trauma = Math.min(1, this.trauma + 0.15);
          this.play('eat', e.x, 0.7);
          break;
        case 'spaced':
          this.pop('SPACED', e.x, 2.6, e.z, '#ff9a6a', true);
          this.play('airlock', e.x, 0.5, 1.4);
          break;
        case 'vent':
          if (e.on) this.play('frost_breath', b.deck.rupture?.x ?? 0, 0.9, 0.6);
          break;
        case 'carry':
          this.play('core_feed', b.heroes[e.hero].x, 0.7);
          break;
        case 'drop':
          this.fx.ring(e.x, 0.2, e.z, 2, 0.3, false, 0x8affe0);
          this.play('block', e.x, 0.6, 0.6);
          break;
      }
    }
    this.juice.handle(events);
  }

  private play(name: string, x: number, vol = 1, pitch = 1) {
    const pan = clamp((x - this.cam.x) / 16, -1, 1) * 0.8;
    audio.play(name as Sfx, { pan, vol, pitch });
  }

  pop(text: string, x: number, y: number, z: number, color: string, big: boolean) {
    this.pops.push({ text, x, y, z, t: 0, life: big ? 1.1 : 0.8, color, big });
  }

  private muzzle(x: number, y: number, z: number, a: number, color: number, k: number) {
    this.flashes.push({ x: x + Math.cos(a) * 0.3, y, z: z + Math.sin(a) * 0.3, color: new THREE.Color(color), power: 7 * k, t: 0, life: 0.06 * Math.sqrt(k), dist: 6 + k * 2 });
    for (let i = 0; i < 2 + k * 2; i++) {
      const aa = a + (Math.random() - 0.5) * 0.6;
      const v = 6 + Math.random() * 8 * k;
      this.fx.add({ x, y, z, vx: Math.cos(aa) * v, vz: Math.sin(aa) * v, vy: (Math.random() - 0.5) * 2, life: 0.06 + Math.random() * 0.05, size: 0.22 * k, grow: 0.3, color: new THREE.Color(color), drag: 8 });
    }
    this.fx.add({ x: x + Math.cos(a) * 0.2, y, z: z + Math.sin(a) * 0.2, life: 0.05, size: 0.5 * Math.sqrt(k), grow: 1.5, color: new THREE.Color(0xffffff) });
  }

  private casing(x: number, z: number, a: number, big: boolean) {
    if (this.casings.length >= 150) this.casings.shift();
    const side = a - Math.PI / 2;
    this.casings.push({ x, y: 1.2, z, vx: Math.cos(side) * (2 + Math.random() * 2) - Math.cos(a), vy: 3 + Math.random() * 2, vz: Math.sin(side) * (2 + Math.random() * 2) - Math.sin(a), spin: 20, rx: 0, ry: 0, t: 0, big });
  }

  private decal(x: number, y: number, z: number, a: number, size: number, floor = false) {
    const i = this.decalAt++ % 260;
    if (floor) this.q.setFromEuler(this.e.set(-Math.PI / 2, 0, Math.random() * 6));
    else this.q.setFromEuler(this.e.set(0, -a - Math.PI / 2 + Math.PI, 0));
    this.m4.compose(this.v.set(x, y, z), this.q, this.s.set(size, size, size));
    this.decals.setMatrixAt(i, this.m4);
    this.decals.count = Math.min(260, Math.max(this.decals.count, i + 1));
    this.decals.instanceMatrix.needsUpdate = true;
  }

  update(dt: number) {
    const b = this.b;
    this.time += dt;
    this.introT += dt;
    this.spaceMat.uniforms.uTime.value = this.time;
    this.ricochetT -= dt;
    this.tickSfx -= dt;
    this.tinT -= dt;
    this.killT -= dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    this.punch = Math.max(0, this.punch - dt * 5);
    this.kick.multiplyScalar(Math.exp(-dt * 14));
    this.alarmK = damp(this.alarmK, b.alarmed || b.lockdown ? 1 : 0, 2, dt);
    this.lockK = damp(this.lockK, b.lockdown ? 1 : 0, 3, dt);
    this.kelterK = damp(this.kelterK, b.kelters ? 1 : 0, 2, dt);

    // the heroes
    b.heroes.forEach((h, i) => {
      const rig = this.heroRigs[i];
      const s = this.poses.get(rig)!;
      s.x = h.x;
      s.z = h.z;
      s.face = h.face;
      s.vx = h.vx;
      s.vz = h.vz;
      s.aim = h.firing || h.sinceShot < 0.6 ? 1 : h.mark >= 0 ? 0.35 : 0;
      s.work = (!!h.work && h.work.kind !== 'leave' && !h.down) || h.carry;
      s.slide = h.dashT > 0;
      s.dead = false;
      s.floored = h.down || h.stun > 0.5;
      rig.update(dt, s);
      // blink while it can't be touched; gone once thrown out
      rig.root.visible = !h.out && !(h.inv > 0 && !h.down && Math.floor(h.inv * 14) % 2 === 0 && h.dashT <= 0);
      rig.flash(h.inv > HERO.inv - 0.1 ? 1 : 0);
      // a ghost left behind every few frames of a slide
      if (h.dashT > 0 && Math.random() < 0.5) {
        const g = this.ghosts.find((x) => x.t > 0.3 && this.ghosts.indexOf(x) >= i * 4 && this.ghosts.indexOf(x) < i * 4 + 4);
        if (g) {
          g.t = 0;
          g.rig.update(0, { ...s, slide: true });
          g.rig.root.visible = true;
        }
      }
    });
    for (const g of this.ghosts) {
      g.t += dt;
      g.mat.opacity = Math.max(0, 0.45 - g.t * 1.6);
      if (g.mat.opacity <= 0) g.rig.root.visible = false;
    }
    // the crew
    for (const f of b.foes) {
      let rig = this.foeRigs.get(f.id);
      if (!rig) rig = this.addFoe(f);
      const s = this.poses.get(rig)!;
      s.x = f.x;
      s.z = f.z;
      s.face = f.state === 'aim' || f.state === 'burst' ? f.aimA : f.face;
      s.vx = f.vx + f.kx;
      s.vz = f.vz + f.kz;
      const gun = f.kind === 'gunner' || f.kind === 'kelter' || f.kind === 'auditor' || f.kind === 'puffer' || f.kind === 'torcher';
      s.aim = gun && f.aware ? (f.state === 'aim' || f.state === 'burst' || f.state === 'swell' || f.state === 'ignite' || f.state === 'spray' ? 1 : 0.4) : 0;
      s.work = f.state === 'pull';
      s.kneel = f.state === 'stagger' || f.state === 'stun' || (f.kind === 'skulk' && f.state === 'recover');
      s.slide = f.state === 'lunge' || f.state === 'pounce';
      s.asleep = f.asleep && !f.aware;
      s.dead = f.dead;
      s.deathT = f.deathT;
      s.fallA = f.fallA;
      s.haul = f.state === 'reel';
      // a swing: the wind-up and the blow
      const prog = clamp(1 - f.t / Math.max(0.01, f.dur), 0, 1);
      const melee = f.kind === 'deckhand' || f.kind === 'clerk' || f.kind === 'thrall' || f.kind === 'skulk';
      const wind = (f.state === 'windup' && melee) || (f.kind === 'thrall' && f.state === 'swell') || f.state === 'rear' ? prog : 0;
      s.windup = f.kind === 'bruiser' && f.state === 'swing' ? prog : (f.kind === 'nurse' && f.state === 'swell') || (f.kind === 'notary' && f.state === 'stamp') ? prog : wind;
      s.strike = f.state === 'swing' && f.kind !== 'bruiser' ? 1 : f.state === 'lunge' ? 1 : f.state === 'recover' && melee ? clamp(f.t / Math.max(0.01, f.dur), 0, 1) * 0.6 : 0;
      s.brace = (f.kind === 'bruiser' && (f.state === 'windup' || f.state === 'charge')) || (f.kind === 'warden' && (f.wall > 0 || f.state === 'shove')) ? 1 : 0;
      rig.update(dt, s);
      // flashes white when hit; a charging bruiser glows red; an open one gold
      rig.flash(f.dead ? Math.max(0, 1 - f.deathT * 8) : f.flash);
      // the long dead go
      rig.root.visible = !f.dead || f.deathT < 22;
    }

    this.juice.update(dt);
    this.updateDoors(dt);
    this.updateProps(dt);
    this.updateRounds();
    this.updateTins();
    this.updateCasings(dt);
    this.updateLasers();
    this.updateRings();
    this.updateTells(dt);
    for (const p of this.pops) p.t += dt;
    for (let i = this.pops.length - 1; i >= 0; i--) if (this.pops[i].t > this.pops[i].life) this.pops.splice(i, 1);
    this.fx.update(dt, this.camera, 0);
    this.placeCamera(dt);
    this.updateLights(dt);
    // the mix: busier the more that's after you, and closing in when you're nearly done for
    const aware = b.foes.filter((f) => !f.dead && f.aware).length;
    audio.intensity(clamp(0.3 + aware * 0.06 + this.kelterK * 0.3 + this.lockK * 0.2, 0, 1));
    const low = Math.min(...b.heroes.filter((h) => !h.down).map((h) => h.hp / HERO.hp), 1);
    audio.danger(clamp(1 - low / 0.4, 0, 1));
  }

  private updateDoors(dt: number) {
    const d = this.b.deck;
    d.doors.forEach((door, i) => {
      const inst = this.doorInst[i];
      if (!inst) return;
      const l = named(inst?.obj, 'deck_door__leaf_l');
      const r = named(inst?.obj, 'deck_door__leaf_r');
      const k = smoothDoor(door.open);
      if (l) {
        l.userData.x0 ??= l.position.x;
        l.position.x = l.userData.x0 - k * 0.95;
      }
      if (r) {
        r.userData.x0 ??= r.position.x;
        r.position.x = r.userData.x0 + k * 0.95;
      }
    });
    void dt;
  }

  private updateProps(dt: number) {
    const b = this.b;
    b.crates.forEach((c, i) => {
      const lid = this.crateLids[i];
      if (!lid) return;
      lid.userData.rx ??= lid.rotation.x;
      const want = c.open ? -1.9 : c.t > 0 ? -0.08 * Math.sin(this.time * 40) * c.t : 0;
      lid.rotation.x = damp(lid.rotation.x, lid.userData.rx + want, c.open ? 10 : 30, dt);
    });
    if (this.strongLid && b.strongbox) {
      this.strongLid.userData.rx ??= this.strongLid.rotation.x;
      this.strongLid.rotation.x = damp(this.strongLid.rotation.x, this.strongLid.userData.rx + (b.strongbox.open ? -1.7 : 0), 8, dt);
    }
    if (this.heart && b.core) {
      this.heart.userData.y0 ??= this.heart.position.y;
      const c = b.core;
      // it beats; worked at, it shudders; taken, it's gone (into your pack)
      const beat = 1 + Math.pow(Math.max(0, Math.sin(this.time * 3.4)), 8) * 0.08;
      this.heart.scale.setScalar(c.open ? Math.max(0.001, this.heart.scale.x - dt * 3) : beat * (1 + c.t * 0.1));
      this.heart.position.y = this.heart.userData.y0 + c.t * 0.5 + (c.t > 0 ? Math.sin(this.time * 50) * 0.02 * c.t : 0);
      this.heart.visible = this.heart.scale.x > 0.01;
    }
    b.turrets.forEach((t, i) => {
      const inst = this.turretInst[i];
      if (!inst) return;
      inst.obj.position.y = -1.2 + t.up * 1.2;
      const head = named(inst?.obj, 'deck_turret__head');
      if (head) head.rotation.y = -t.aimA - Math.PI / 2 - inst.obj.rotation.y;
      inst.flash(t.flash);
      inst.obj.visible = t.state !== 'dead';
    });
    b.canisters.forEach((c, i) => {
      const inst = this.canisterInst[i];
      if (!inst) return;
      inst.obj.visible = !c.gone;
      if (c.fuse >= 0 && !c.gone) {
        inst.flash(Math.floor(this.time * 20) % 2 ? 1 : 0);
        inst.obj.position.x = c.prop.x + (Math.random() - 0.5) * 0.06;
        if (Math.random() < 0.6) this.fx.add({ x: c.prop.x, y: 1.2, z: c.prop.z, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 3, life: 0.3, size: 0.25, color: new THREE.Color(0xffd070), drag: 2 });
      }
    });
    b.alarms.forEach((a, i) => {
      const lamp = this.alarmLamps[i];
      if (lamp) {
        lamp.visible = !a.broken;
        const on = a.used || a.pull > 0 ? Math.floor(this.time * (a.used ? 4 : 10)) % 2 === 0 : true;
        lamp.scale.setScalar(on ? 1 + a.pull * 0.4 : 0.6);
      }
      if (a.pull > 0 && !a.used && Math.random() < 0.3) this.fx.sparks(a.prop.x, 1.4, a.prop.z, 1, 0xff4a3a, 3, 0.3, 0.12, false);
    });
    for (const inst of this.props.values()) inst.update(dt);
  }

  private updateRounds() {
    const b = this.b;
    let n = 0;
    let t = 0;
    for (const r of b.rounds) {
      const a = Math.atan2(r.vz, r.vx);
      // a torcher's fire is drawn as flame (view/board-juice.ts)
      if (r.kind === 'flame') continue;
      if (r.from === 'hero') {
        // a tracer: a streak behind the round, hot at the head (a nail thin, a stamp a fat cyan slug, a harpoon red)
        const len = r.kind === 'pellet' ? 0.6 : r.kind === 'nail' ? 0.8 : r.kind === 'stamp' ? 0.7 : 1.3;
        const w = r.kind === 'stamp' ? 0.45 : r.kind === 'harpoon' ? 0.14 : r.kind === 'pellet' ? 0.1 : r.kind === 'nail' ? 0.05 : 0.08;
        this.q.setFromEuler(this.e.set(0, -a, 0));
        this.m4.compose(this.v.set(r.x - Math.cos(a) * len * 0.5, 1.15, r.z - Math.sin(a) * len * 0.5), this.q, this.s.set(len, r.kind === 'stamp' ? 0.3 : 0.07, w));
        this.tracerMesh.setMatrixAt(t, this.m4);
        const hue = r.kind === 'pellet' ? 0xffa050 : r.kind === 'stamp' ? 0x4ae8ff : r.kind === 'harpoon' ? 0xff4a3a : r.kind === 'nail' ? 0xffd04a : 0xffe0a0;
        this.tracerMesh.setColorAt(t, this.c.setHex(hue).multiplyScalar(2));
        t++;
        continue;
      }
      // theirs: fat, bright, ringed in dark; the hook bigger
      const size = r.kind === 'hook' ? 0.6 : r.r * 2.2;
      const pulse = 1 + Math.sin(this.time * 30 + r.x) * 0.1;
      this.m4.compose(this.v.set(r.x, 1.1, r.z), this.q.identity(), this.s.setScalar(size * pulse));
      this.roundMesh.setMatrixAt(n, this.m4);
      this.roundMesh.setColorAt(n, this.c.setHex(r.kind === 'hook' ? 0xffb04a : r.kind === 'turret' ? 0xff4a8a : 0xff4a5a));
      this.m4.compose(this.v.set(r.x, 1.1, r.z), this.q.identity(), this.s.setScalar(size * pulse * 1.45));
      this.roundRim.setMatrixAt(n, this.m4);
      n++;
    }
    this.roundMesh.count = n;
    this.roundRim.count = n;
    this.tracerMesh.count = t;
    this.roundMesh.instanceMatrix.needsUpdate = true;
    this.roundRim.instanceMatrix.needsUpdate = true;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.roundMesh.instanceColor) this.roundMesh.instanceColor.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;
  }

  private updateTins() {
    let n = 0;
    for (const t of this.b.tins) {
      this.q.setFromEuler(this.e.set(0.3, this.time * 4 + t.x, 0));
      this.m4.compose(this.v.set(t.x, t.y + Math.sin(this.time * 6 + t.z) * 0.05, t.z), this.q, this.s.setScalar(1.3));
      this.tinMesh.setMatrixAt(n++, this.m4);
    }
    this.tinMesh.count = n;
    this.tinMesh.instanceMatrix.needsUpdate = true;
  }

  private updateCasings(dt: number) {
    let n = 0;
    for (const c of this.casings) {
      c.t += dt;
      c.vy -= 24 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      if (c.y < 0.04) {
        c.y = 0.04;
        if (Math.abs(c.vy) > 1.5 && c.t < 1.5) c.vy = Math.abs(c.vy) * 0.4;
        else c.vy = 0;
        c.vx *= 0.55;
        c.vz *= 0.55;
        c.spin *= 0.5;
      }
      c.rx += c.spin * dt;
      c.ry += c.spin * 0.6 * dt;
      this.q.setFromEuler(this.e.set(c.y > 0.05 ? c.rx : Math.PI / 2, c.ry, 0));
      this.m4.compose(this.v.set(c.x, c.y, c.z), this.q, this.s.setScalar(c.big ? 2.2 : 1));
      this.casingMesh.setMatrixAt(n++, this.m4);
    }
    this.casingMesh.count = n;
    this.casingMesh.instanceMatrix.needsUpdate = true;
  }

  /** The pools the tells are drawn with, and the fittings that come with the ship's state. */
  private buildTells() {
    const b = this.b;
    const add = (color: number, opacity = 0.5) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    // cones of sight: a fan on the deck, rebuilt each frame as far as the walls let it reach
    for (let i = 0; i < CONES; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((CONE_RAYS + 2) * 3), 3));
      const idx: number[] = [];
      for (let k = 0; k < CONE_RAYS; k++) idx.push(0, k + 1, k + 2);
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 2;
      this.cones.push(m);
      this.scene.add(m);
    }
    // a hero's torch, on a dark ship
    if (this.dark) {
      for (let i = 0; i < b.heroes.length; i++) {
        const g = this.cones[0].geometry.clone();
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.frustumCulled = false;
        m.renderOrder = 2;
        this.torch.push(m);
        this.scene.add(m);
      }
    }
    // the arc a blow is about to sweep
    const sector = new THREE.RingGeometry(0.2, 1, 24, 1, -1.1, 2.2);
    sector.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(sector, add(0xffffff, 0.3));
      m.visible = false;
      m.renderOrder = 2;
      this.sectors.push(m);
      this.overlay.add(m);
    }
    // marks on the deck: where a sac or a beast will land, the reach of a burst
    const disc = new THREE.CircleGeometry(1, 28);
    disc.rotateX(-Math.PI / 2);
    const rim = new THREE.RingGeometry(0.9, 1, 28);
    rim.rotateX(-Math.PI / 2);
    for (let i = 0; i < 20; i++) {
      const fill = new THREE.Mesh(disc, add(0xffffff, 0.15));
      const r = new THREE.Mesh(rim, add(0xffffff, 0.8));
      fill.visible = r.visible = false;
      fill.renderOrder = r.renderOrder = 2;
      this.marks.push({ fill, rim: r });
      this.overlay.add(fill, r);
    }
    // lances: the beam, and its afterglow
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(GEO.plane, add(0x9af4ff, 1));
      m.visible = false;
      this.beams.push(m);
      this.overlay.add(m);
    }
    // a nurse's lines into its crew
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(GEO.box, add(0xb0ff4a, 0.7));
      m.visible = false;
      this.tethers.push(m);
      this.scene.add(m);
    }
    // spore sacs in the air, and the clouds they burst into
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(GEO.sphere, toon(0xd8c0ff, { glow: 0.6 }));
      m.visible = false;
      this.sacMeshes.push(m);
      this.scene.add(m);
    }
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: i % 3 ? 0x8a5aa8 : 0xb0ff4a, transparent: true, opacity: 0.3, depthWrite: false }));
      m.visible = false;
      this.puffs.push(m);
      this.scene.add(m);
    }
    // the gates: two posts each side of the doorway, a sheet of light between
    for (const g of b.gates) {
      const door = g.gate.door;
      const along = door.axis === 'x';
      for (const k of [-1, 1]) {
        const inst = library.clone('deck_gate', 0, this.skin, true);
        const obj = inst?.obj ?? part(GEO.box, toon(0xe8ecf0), [0, 1.1, 0], [0.36, 2.2, 0.36]);
        obj.position.set(door.x + (along ? k * 1.18 : 0), 0, door.z + (along ? 0 : k * 1.18));
        // their emitters (+x) face each other across the doorway
        obj.rotation.y = along ? (k < 0 ? 0 : Math.PI) : k < 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(obj);
      }
      const field = new THREE.Mesh(GEO.plane, add(0x4ae8ff, 0.5));
      field.position.set(door.x, 1.0, door.z);
      field.scale.set(2.2, 1.9, 1);
      field.rotation.y = along ? 0 : Math.PI / 2;
      field.visible = false;
      this.overlay.add(field);
      const lines: THREE.Mesh[] = [];
      for (let k = 0; k < 4; k++) {
        const l = new THREE.Mesh(GEO.box, add(0x9af4ff, 0.9));
        l.position.set(door.x, 0.3 + k * 0.45, door.z);
        l.scale.set(along ? 2.2 : 0.04, 0.05, along ? 0.04 : 2.2);
        l.visible = false;
        lines.push(l);
        this.overlay.add(l);
      }
      this.gateFields.push({ field, lines });
    }
    // the cages' doors
    for (const c of b.cages) this.cageDoors.push(named(this.props.get(c.prop.id)?.obj, 'deck_cage__door'));
    // with her power out you carry your own light
    if (this.dark) b.heroes.forEach((_, i) => this.lamps.push({ x: 0, y: 1.6, z: 0, color: new THREE.Color(0xffe0b0), power: 4, room: -10 - i, on: 1, flick: 0, always: true }));
    // the tear in her hull glows
    const rp = b.deck.rupture;
    if (rp) this.lamps.push({ x: rp.x, y: 1.2, z: rp.z + (rp.rot === 0 ? 0.6 : -0.6), color: new THREE.Color(0xff7a3a), power: 4, room: -1, on: 1, flick: 0, always: true });
  }

  /** A wall of light for each warden, made the first time it's seen. */
  private wallOf(f: Foe) {
    let m = this.walls.get(f.id);
    if (!m) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, -1.05, 2.1);
      m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x4ae8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.walls.set(f.id, m);
      this.overlay.add(m);
    }
    return m;
  }

  /** The halo over a lattice crewman who's stopped to listen. */
  private haloOf(f: Foe) {
    let m = this.halos.get(f.id);
    if (!m) {
      m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 4, 18), new THREE.MeshBasicMaterial({ color: 0x8af4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2;
      this.halos.set(f.id, m);
      this.overlay.add(m);
    }
    return m;
  }

  /** A fan on the deck from (x, z) facing `a`, `half` either side, out to `reach` or the first wall; coloured `col` fading out. */
  private fan(m: THREE.Mesh, x: number, z: number, a: number, half: number, reach: number, col: THREE.Color, k: number) {
    const d = this.b.deck;
    const pos = m.geometry.getAttribute('position') as THREE.BufferAttribute;
    const cl = m.geometry.getAttribute('color') as THREE.BufferAttribute;
    pos.setXYZ(0, x, 0.05, z);
    cl.setXYZ(0, col.r * k, col.g * k, col.b * k);
    for (let i = 0; i <= CONE_RAYS; i++) {
      const ra = a - half + (i / CONE_RAYS) * half * 2;
      const ca = Math.cos(ra);
      const sa = Math.sin(ra);
      let l = 0.4;
      while (l < reach && !d.stops(Math.floor(x + ca * l), Math.floor(z + sa * l))) l += 0.35;
      l = Math.min(l, reach);
      pos.setXYZ(i + 1, x + ca * l, 0.05, z + sa * l);
      const fade = k * 0.15 * (1 - l / (reach + 0.01)) + k * 0.05;
      cl.setXYZ(i + 1, col.r * fade, col.g * fade, col.b * fade);
    }
    pos.needsUpdate = true;
    cl.needsUpdate = true;
    m.visible = true;
  }

  /**
   * The tells: who can see you and how much they've seen; the arc of a blow winding up (drawn in
   * the family's light); where a sac or a beast will land; a warden's wall, a nurse's lines, a
   * lance going; the gates' cycle; spores; the core in your arms; the breach breathing.
   */
  private updateTells(dt: number) {
    const b = this.b;
    const t = this.time;
    const col = this.c;
    // cones: crew who haven't seen you, near enough to matter; white, warming as they glimpse you
    let n = 0;
    const cx = this.cam.x;
    const cz = this.cam.z;
    for (const f of b.foes) {
      if (n >= CONES) break;
      if (f.dead || f.aware || f.asleep || f.state === 'caged' || f.kind === 'skulk' || Math.abs(f.x - cx) > 24 || Math.abs(f.z - cz) > 14) continue;
      const sus = clamp(f.sus, 0, 1);
      col.setRGB(1, 1 - sus * 0.45, 1 - sus * 0.85);
      if (this.dark) col.setRGB(1, 0.85 - sus * 0.3, 0.55 - sus * 0.4);
      this.fan(this.cones[n++], f.x, f.z, f.face, SIGHT_CONE, b.sight(f), col, (this.dark ? 1.6 : 0.85) + sus * 1.2);
    }
    for (let i = n; i < CONES; i++) this.cones[i].visible = false;
    // torches
    b.heroes.forEach((h, i) => {
      const lamp = this.lamps.find((l) => l.room === -10 - i);
      if (lamp) {
        lamp.x = h.x + Math.cos(h.aim) * 1.2;
        lamp.z = h.z + Math.sin(h.aim) * 1.2;
        lamp.power = h.out ? 0 : 4;
      }
      const m = this.torch[i];
      if (!m) return;
      if (h.down || h.out) {
        m.visible = false;
        return;
      }
      this.fan(m, h.x, h.z, h.aim, 0.5, 11, col.setRGB(1, 0.92, 0.7), 2.2);
    });
    // arcs, landing marks, bursts
    let sn = 0;
    let mn = 0;
    const sector = (x: number, z: number, a: number, reach: number, color: number, k: number) => {
      if (sn >= this.sectors.length) return;
      const m = this.sectors[sn++];
      m.visible = true;
      m.position.set(x, 0.06, z);
      m.rotation.y = -a;
      m.scale.setScalar(reach);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setHex(color);
      mat.opacity = 0.12 + k * 0.5 + (k > 0.8 ? Math.sin(t * 50) * 0.15 : 0);
    };
    const mark = (x: number, z: number, r: number, color: number, k: number) => {
      if (mn >= this.marks.length) return;
      const m = this.marks[mn++];
      m.fill.visible = m.rim.visible = true;
      m.fill.position.set(x, 0.05, z);
      m.rim.position.set(x, 0.06, z);
      m.fill.scale.setScalar(r * k);
      m.rim.scale.setScalar(r);
      (m.fill.material as THREE.MeshBasicMaterial).color.setHex(color);
      (m.fill.material as THREE.MeshBasicMaterial).opacity = 0.22 + k * 0.2;
      (m.rim.material as THREE.MeshBasicMaterial).color.setHex(color);
      (m.rim.material as THREE.MeshBasicMaterial).opacity = 0.5 + k * 0.5;
    };
    for (const f of b.foes) {
      if (f.dead) continue;
      const k = clamp(1 - f.t / Math.max(0.01, f.dur), 0, 1);
      const fam = FOES[f.kind].family;
      if (f.state === 'windup' && (f.kind === 'deckhand' || f.kind === 'clerk')) sector(f.x, f.z, f.face, f.kind === 'clerk' ? 2.2 : 1.95, fam === 'lattice' ? 0x4ae8ff : 0xff3a3a, k);
      else if (f.state === 'swing' && f.kind === 'bruiser' && f.t > 0) sector(f.x, f.z, f.face, 2.1, 0xff3a3a, k);
      else if (f.state === 'shove') sector(f.x, f.z, f.face, 2.6, 0x4ae8ff, k);
      else if (f.state === 'swell' && f.kind === 'thrall') sector(f.x, f.z, f.face, 2.6, 0xb0ff4a, k);
      else if (f.state === 'swell' && f.kind === 'nurse') mark(f.x, f.z, 2.8, 0xb0ff4a, k);
      else if (f.state === 'rear') mark(f.tx, f.tz, 1.25, 0xff6aa8, k);
      else if (f.state === 'windup' && f.kind === 'bruiser') sector(f.x, f.z, f.face, 3.2, 0xff3a3a, 0.4 + k * 0.4);
      // a warden's wall
      if (f.kind === 'warden') {
        const w = this.wallOf(f);
        const up = f.wall > 0 && f.open <= 0;
        w.visible = up;
        if (up) {
          const shove = f.state === 'shove' ? k : 0;
          const r = f.r + 0.7 + shove * 0.4;
          w.position.set(f.x, 1.0, f.z);
          w.scale.set(r, 1.9, r);
          w.rotation.y = -f.face + Math.PI / 2;
          const mat = w.material as THREE.MeshBasicMaterial;
          mat.opacity = (0.22 + (f.wall / f.wallMax) * 0.35 + shove * 0.4) * (0.85 + Math.sin(t * 20 + f.id) * 0.15);
        }
      }
      // listening: a ring of light over its head, and its face to the north
      if (FOES[f.kind].family === 'lattice') {
        const listening = f.state === 'listen';
        const halo = this.halos.get(f.id) ?? (listening ? this.haloOf(f) : null);
        if (halo) {
          halo.visible = listening;
          halo.position.set(f.x, 2.5 + Math.sin(t * 3) * 0.05, f.z);
          halo.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
        }
      }
      // the Hive swells before it bursts
      const rig = this.foeRigs.get(f.id);
      if (rig) rig.root.scale.setScalar(f.state === 'swell' ? 1 + k * 0.18 + Math.sin(t * 30) * 0.03 * k : 1);
    }
    for (const s of b.sacs) if (s.ours === undefined) mark(s.x1, s.z1, 1.9, 0xb0ff4a, clamp(s.t / s.dur, 0, 1));
    // a dropped core: a ring round it, pulsing
    if (b.heart && b.heart.carrier < 0) mark(b.heart.x, b.heart.z, 1.2 + Math.sin(t * 5) * 0.08, 0x8affe0, 0.6);
    // a breach about to gust: its reach, warming
    const rp = b.deck.rupture;
    if (rp && (b.venting || b.ventT > VENT.calm - VENT.warm)) mark(rp.x, rp.z, VENT.reach * 0.8, 0xff7a3a, b.venting ? 1 : clamp((b.ventT - (VENT.calm - VENT.warm)) / VENT.warm, 0, 1) * 0.6);
    for (let i = sn; i < this.sectors.length; i++) this.sectors[i].visible = false;
    for (let i = mn; i < this.marks.length; i++) this.marks[i].fill.visible = this.marks[i].rim.visible = false;
    for (const [id, w] of this.walls) if (b.foes.find((f) => f.id === id)?.dead) w.visible = false;
    // lances
    b.lances.forEach((l, i) => {
      const m = this.beams[i];
      if (!m) return;
      const k = 1 - l.t / 0.5;
      m.visible = true;
      m.position.set(l.x + Math.cos(l.a) * l.len * 0.5, 1.15, l.z + Math.sin(l.a) * l.len * 0.5);
      m.rotation.set(-Math.PI / 2, 0, -l.a);
      m.scale.set(l.len, (l.hero ? 0.16 + k * 0.9 : 0.08 + k * 0.5), 1);
      (m.material as THREE.MeshBasicMaterial).opacity = k;
    });
    for (let i = b.lances.length; i < this.beams.length; i++) this.beams[i].visible = false;
    // tethers
    let tn = 0;
    for (const f of b.foes) {
      if (f.dead || f.kind !== 'nurse') continue;
      for (const id of f.links) {
        const g = b.foes.find((x) => x.id === id);
        if (!g || g.dead || tn >= this.tethers.length) continue;
        const m = this.tethers[tn++];
        const dx = g.x - f.x;
        const dz = g.z - f.z;
        const len = Math.hypot(dx, dz);
        m.visible = true;
        m.position.set(f.x + dx / 2, 1.5 + Math.sin(t * 8) * 0.05, f.z + dz / 2);
        m.rotation.set(0, -Math.atan2(dz, dx), 0);
        m.scale.set(len, 0.06 + Math.sin(t * 12 + id) * 0.02, 0.06);
        if (Math.random() < dt * 8) this.fx.add({ x: f.x + dx * Math.random(), y: 1.5, z: f.z + dz * Math.random(), vy: 0.6, life: 0.5, size: 0.14, color: new THREE.Color(0xb0ff4a), drag: 2 });
      }
    }
    for (let i = tn; i < this.tethers.length; i++) this.tethers[i].visible = false;
    // sacs in flight: an arc
    b.sacs.forEach((s, i) => {
      const m = this.sacMeshes[i];
      if (!m) return;
      const k = clamp(s.t / s.dur, 0, 1);
      m.visible = true;
      m.position.set(lerp(s.x0, s.x1, k), 1.3 + Math.sin(k * Math.PI) * 2.6, lerp(s.z0, s.z1, k));
      m.scale.setScalar(0.45 + Math.sin(t * 20) * 0.04);
    });
    for (let i = b.sacs.length; i < this.sacMeshes.length; i++) this.sacMeshes[i].visible = false;
    // clouds: slow puffs that thin out at the end
    let pn = 0;
    for (const c of b.clouds) {
      const life = 1 - c.t / c.life;
      const grow = Math.min(1, c.t / 0.25);
      for (let k = 0; k < 9 && pn < this.puffs.length; k++) {
        const m = this.puffs[pn++];
        const a = k * 2.4 + c.x;
        const rr = c.r * (k ? 0.62 : 0) * grow;
        m.visible = true;
        m.position.set(c.x + Math.cos(a + t * 0.4) * rr, 0.5 + (k % 3) * 0.35 + Math.sin(t * 1.5 + k) * 0.1, c.z + Math.sin(a + t * 0.4) * rr);
        m.scale.set(c.r * 0.9 * grow, c.r * 0.45 * grow, c.r * 0.9 * grow);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.32 * Math.min(1, life * 3);
        // yours (a sporecaster's) in acid and gold, so you know whose it is
        mat.color.setHex(c.ours !== undefined ? (k % 3 ? 0x9ac83a : 0xffd04a) : k % 3 ? 0x8a5aa8 : 0xb0ff4a);
      }
      if (Math.random() < dt * 10) this.fx.add({ x: c.x + (Math.random() - 0.5) * c.r * 1.4, y: 0.4, z: c.z + (Math.random() - 0.5) * c.r * 1.4, vy: 0.5, life: 0.9, size: 0.12, color: new THREE.Color(0xb0ff4a), drag: 1 });
    }
    for (let i = pn; i < this.puffs.length; i++) this.puffs[i].visible = false;
    // gates
    b.gates.forEach((g, i) => {
      const gf = this.gateFields[i];
      if (!gf) return;
      const p = b.gatePhase(g);
      gf.field.visible = g.on;
      const mat = gf.field.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.32 + Math.sin(t * 40) * 0.08;
      const warm = g.warm ? (p - (GATE.off - GATE.warm)) / GATE.warm : 0;
      gf.lines.forEach((l, k) => {
        l.visible = g.on || (g.warm && Math.random() < 0.4 + warm * 0.6);
        l.position.y = 0.3 + ((k * 0.45 + (g.on ? t * 0.8 : 0)) % 1.8);
        (l.material as THREE.MeshBasicMaterial).opacity = g.on ? 0.9 : 0.25 + warm * 0.5;
      });
    });
    // cage doors swing open
    b.cages.forEach((c, i) => {
      const door = this.cageDoors[i];
      if (!door) return;
      door.userData.ry ??= door.rotation.y;
      door.rotation.y = damp(door.rotation.y, door.userData.ry + (c.open ? -1.9 : 0), 8, dt);
    });
    // the core: in someone's arms, or on the deck where it fell
    if (b.heart) {
      if (!this.heartObj) {
        const inst = library.clone('deck_heart', 0, undefined, true);
        this.heartObj = inst?.obj ?? part(GEO.sphere, toon(0x8affe0, { glow: 1 }), [0, 0.4, 0], [0.6, 0.6, 0.6]);
        this.heartGlow = named(this.heartObj, 'deck_heart__heart');
        this.scene.add(this.heartObj);
        this.lamps.push({ x: 0, y: 1.4, z: 0, color: new THREE.Color(0x6affe0), power: 4.5, room: -2, on: 1, flick: 0, always: true });
      }
      const c = b.carrier;
      const o = this.heartObj;
      if (c) {
        const rig = this.heroRigs[c.id];
        void rig;
        o.position.set(c.x + Math.cos(c.face) * 0.45, 0.55 + Math.sin(t * 9) * 0.03, c.z + Math.sin(c.face) * 0.45);
        o.rotation.y = -c.face + Math.PI / 2;
        if (Math.random() < dt * 14) this.fx.add({ x: o.position.x, y: 1, z: o.position.z, vy: 0.4, life: 0.6, size: 0.15, color: new THREE.Color(0x8affe0), drag: 2 });
      } else {
        o.position.set(b.heart.x, 0, b.heart.z);
      }
      if (this.heartGlow) this.heartGlow.scale.setScalar(1 + Math.pow(Math.max(0, Math.sin(t * 3.4)), 8) * 0.12);
      const lamp = this.lamps.find((l) => l.room === -2);
      if (lamp) {
        lamp.x = o.position.x;
        lamp.z = o.position.z;
      }
    }
    // the breach: everything loose streams to it while it gusts; a rattle of grit before
    if (rp) {
      const mx = rp.x;
      const mz = rp.z + (rp.rot === 0 ? 0.3 : -0.3);
      const warming = !b.venting && b.ventT > VENT.calm - VENT.warm;
      const n2 = b.venting ? 14 : warming ? 3 : 0;
      for (let i = 0; i < n2; i++) {
        if (Math.random() > dt * 30) continue;
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.random() * (VENT.reach - 2);
        const x = mx + Math.cos(a) * r;
        const z = mz + Math.sin(a) * r * 0.7;
        const v = b.venting ? 9 : 1.5;
        this.fx.add({ x, y: 0.3 + Math.random() * 1.5, z, vx: ((mx - x) / r) * v, vz: ((mz - z) / r) * v, life: 0.5 + Math.random() * 0.4, size: 0.1 + Math.random() * 0.1, color: new THREE.Color(b.venting ? 0xd8d0e0 : 0x8a8090), drag: 0.2 });
      }
      if (b.venting) this.trauma = Math.max(this.trauma, 0.08);
    }
  }

  /** Aim lines: from every gun about to fire, thickening as it locks; and the kelters' cables. */
  private updateLasers() {
    const b = this.b;
    let n = 0;
    const line = (x: number, z: number, a: number, k: number, color: number, through = false) => {
      if (n >= this.lasers.length) return;
      // as far as the first wall (a lance: through cover, to the first bulkhead)
      let len = 0.5;
      if (through) len = b.lanceLength(x, z, a);
      else while (len < 18 && !b.deck.stops(Math.floor(x + Math.cos(a) * len), Math.floor(z + Math.sin(a) * len))) len += 0.25;
      const m = this.lasers[n++];
      m.visible = true;
      m.position.set(x + Math.cos(a) * len * 0.5, 1.15, z + Math.sin(a) * len * 0.5);
      m.rotation.set(-Math.PI / 2, 0, -a);
      const locked = k > 0.75;
      m.scale.set(len, 0.03 + k * 0.09 + (locked ? Math.sin(this.time * 60) * 0.03 : 0), 1);
      (m.material as THREE.MeshBasicMaterial).color.setHex(color).multiplyScalar(locked ? 1.6 : 0.5 + k);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + k * 0.6;
    };
    for (const f of b.foes) {
      if (f.dead || f.state !== 'aim') continue;
      const k = clamp(1 - f.t / Math.max(0.01, f.dur), 0, 1);
      line(f.x, f.z, f.aimA, k, f.kind === 'auditor' ? 0x4ae8ff : f.kind === 'kelter' && f.shots === -1 ? 0xffb04a : 0xff3a4a, f.kind === 'auditor');
    }
    b.turrets.forEach((t) => {
      if (t.state === 'aim') line(t.prop.x, t.prop.z, t.aimA, clamp(1 - t.t / 0.7, 0, 1), 0xff4a8a);
    });
    for (let i = n; i < this.lasers.length; i++) this.lasers[i].visible = false;
    // hook cables
    let c = 0;
    for (const h of b.heroes) {
      if (!h.hook) continue;
      const f = b.foes.find((x) => x.id === h.hook!.by);
      const rig = f && this.foeRigs.get(f.id);
      if (!f || !rig || c >= this.cables.length) continue;
      const m = this.cables[c++];
      const ax = rig.muzzle.x;
      const az = rig.muzzle.z;
      const dx = h.x - ax;
      const dz = h.z - az;
      const len = Math.hypot(dx, dz);
      m.visible = true;
      m.position.set(ax + dx / 2, 1.1, az + dz / 2);
      m.rotation.set(0, -Math.atan2(dz, dx), 0);
      m.scale.set(len, 0.06, 0.06);
    }
    for (let i = c; i < this.cables.length; i++) this.cables[i].visible = false;
  }

  /** Rings on the deck: gold under the open (slide in!), teal round what's being worked. */
  private updateRings() {
    const b = this.b;
    let n = 0;
    const ring = (x: number, z: number, size: number, color: number, k: number) => {
      if (n >= this.rings.length) return;
      const r = this.rings[n++];
      r.visible = true;
      r.position.set(x, 0.05, z);
      r.scale.setScalar(size);
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.setHex(color);
      m.opacity = k;
    };
    for (const f of b.foes) {
      if (f.dead) continue;
      if (f.open > 0) ring(f.x, f.z, (f.r + 0.6) * (1 + Math.sin(this.time * 14) * 0.08), 0xffd04a, 0.9);
      else if (!f.aware && !f.asleep) continue;
    }
    for (const c of b.crates) if (!c.open && c.t > 0) ring(c.prop.x, c.prop.z, 1.4, 0x5ae0c0, 0.4 + c.t * 0.6);
    for (const h of b.heroes) if (h.down) ring(h.x, h.z, 1.3 + Math.sin(this.time * 6) * 0.1, 0x8affb0, 0.8);
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
  }

  /**
   * The camera: over the heroes, leaning the way they aim, pulled out over the whole ship at the
   * start and swooping in to the breach; shaken by trauma, kicked by the guns, punched in on a takedown.
   */
  private placeCamera(dt: number) {
    const b = this.b;
    const d = b.deck;
    const up = b.heroes.filter((h) => !h.down);
    const list = up.length ? up : b.heroes;
    let tx = list.reduce((a, h) => a + h.x, 0) / list.length;
    let tz = list.reduce((a, h) => a + h.z, 0) / list.length;
    // lead: towards where you aim, a little
    const h0 = list[0];
    if (h0) {
      const lead = h0.firing ? 2.2 : 1.2;
      tx += Math.cos(h0.aim) * lead;
      tz += Math.sin(h0.aim) * lead * 0.8;
    }
    // two players far apart: pull out to keep both
    let spread = 0;
    if (list.length > 1) spread = Math.max(Math.abs(list[0].x - list[1].x) / (this.aspect * 2), Math.abs(list[0].z - list[1].z) / 2);
    const intro = b.state === 'intro' ? clamp(1 - b.stateT / 2.2, 0, 1) : 0;
    const want = 1 + Math.max(0, spread - HALF_H * 0.7) / HALF_H + intro * intro * 1.9 + this.kelterK * 0.04 - this.punch * 0.08;
    this.zoom = damp(this.zoom, want, b.state === 'intro' ? 4 : 3, dt);
    if (b.state === 'intro') {
      tx = lerp(tx, d.w / 2, intro * intro);
      tz = lerp(tz, d.h / 2, intro * intro);
    }
    const k = 1 - Math.exp(-dt * (b.state === 'intro' ? 5 : 7));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.z += (tz - this.cam.z) * k;
    void this.camVel;
    const hh = HALF_H * this.zoom;
    const hw = hh * this.aspect;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.updateProjectionMatrix();
    const shake = this.trauma * this.trauma;
    const t = this.time;
    const sx = (Math.sin(t * 61) + Math.sin(t * 37) * 0.5) * shake * 0.45;
    const sz = (Math.cos(t * 53) + Math.sin(t * 29) * 0.5) * shake * 0.45;
    const target = this.v.set(this.cam.x + sx + this.kick.x, 0.8, this.cam.z + sz + this.kick.y);
    this.camera.position.set(target.x, target.y + Math.cos(TILT) * 100, target.z + Math.sin(TILT) * 100);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.sun.target.position.set(target.x, 0, target.z);
    this.sun.position.set(target.x - 8, 30, target.z + 14);
    this.sun.target.updateMatrixWorld();
  }

  /** The lamps nearest the view get the lights; the moment's flashes come first. */
  private updateLights(dt: number) {
    const b = this.b;
    for (const l of this.lamps) {
      if (l.always) continue;
      if (this.dark) {
        // her power's out: the tubes are dead, a red emergency glow where there's any at all
        l.on = 0.12;
        continue;
      }
      if (b.visited.has(l.room)) {
        if (l.flick > 0) {
          l.flick -= dt;
          // the stutter of a tube catching
          l.on = l.flick > 0 ? (Math.random() < 0.45 ? 1 : 0.1) : 1;
        } else l.on = 1;
      } else l.on = 0.3;
    }
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    const cx = this.cam.x;
    const cz = this.cam.z;
    const flashes = [...this.flashes].sort((a, c) => c.power - a.power).slice(0, 4);
    const lamps = this.lamps
      .map((l) => ({ l, d: Math.hypot(l.x - cx, (l.z - cz) * 1.4) }))
      .sort((a, c) => a.d - c.d)
      .slice(0, LAMPS - flashes.length);
    let i = 0;
    const alarm = this.alarmK;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (this.lockK > 0.5 ? 9 : 4));
    for (const { l } of lamps) {
      const light = this.lights[i++];
      light.position.set(l.x, l.y, l.z);
      light.color.copy(l.color);
      let p = l.power * l.on;
      if (!l.always && alarm > 0.01) {
        // alarm: every lamp throbs red
        light.color.lerp(this.c.setHex(0xff2a2a), alarm * 0.75);
        p *= 1 - alarm * 0.35 + alarm * pulse * 0.5;
      }
      light.intensity = p;
      light.distance = 10;
    }
    for (const f of flashes) {
      const light = this.lights[i++];
      light.position.set(f.x, f.y, f.z);
      light.color.copy(f.color);
      light.intensity = f.power * (1 - f.t / f.life);
      light.distance = f.dist;
    }
    for (; i < LAMPS; i++) this.lights[i].intensity = 0;
    // the ambient: cool and dim; redder in an alarm; nearly black with the power out
    this.hemi.color.setHex(0x7a80b0).lerp(this.c.setHex(0xc04050), alarm * 0.4);
    this.hemi.intensity = (this.dark ? 0.42 : 1.35) + (b.state === 'intro' ? 0.4 : 0);
    this.sun.intensity = this.dark ? 0.12 : 0.55;
  }

  grade(pixel: PixelRenderer) {
    const u = pixel.uniforms;
    u.uShade.value.setRGB(0.45, 0.5, 0.85).lerp(this.c.setRGB(0.7, 0.3, 0.4), this.alarmK * 0.4);
    u.uLight.value.setRGB(1, 0.92, 0.8);
    u.uFlash.value.set(this.flashColor.r, this.flashColor.g, this.flashColor.b, this.flash);
    u.uHurt.value = Math.max(this.hurt, this.lowHull() * (0.25 + 0.15 * Math.sin(this.time * 6)));
    u.uSpeed.value = 0;
    u.uImpact.value = 0;
    u.uAberr.value = 0;
    u.uHeat.value = 0;
    u.uFade.value = 0;
    u.uVignette.value = 0.6 + this.kelterK * 0.15;
    u.uTone.value = 0.32;
    u.uGrade.value.set(1.12, 1.08, 1.04);
    u.uTime.value = this.time;
  }

  private lowHull() {
    const up = this.b.heroes.filter((h) => !h.down);
    if (!up.length) return 0;
    return Math.min(...up.map((h) => h.hp)) <= 1 ? 1 : 0;
  }

  /** Where a world point shows, in UI texels of the whole window. */
  project(x: number, y: number, z: number, vw: number, vh: number) {
    const p = this.v.set(x, y, z).project(this.camera);
    return { x: ((p.x + 1) / 2) * vw, y: ((1 - p.y) / 2) * vh, on: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
  }

  /** The rig of a hero (for the HUD to hang things off). */
  heroRig(i: number) {
    return this.heroRigs[i];
  }

  dispose() {
    weather.uCloudDark.value = this.savedCloud;
    this.juice.dispose();
    for (const r of this.heroRigs) r.dispose();
    for (const r of this.foeRigs.values()) r.dispose();
    for (const g of this.ghosts) g.rig.dispose();
    for (const i of this.props.values()) i.dispose();
    audio.intensity(0.3);
    audio.danger(0);
  }
}

/** Kinds that move or change, so stay their own meshes. */
const ANIMATED = new Set<Prop['kind']>(['crate', 'strongbox', 'core', 'turret', 'canister', 'alarm', 'medkit', 'cage', 'rupture']);

/** A model's part by name; a second variant's parts carry a number on the end (lid001). */
function named(obj: THREE.Object3D | undefined, name: string) {
  let found: THREE.Object3D | undefined;
  obj?.traverse((o) => {
    if (!found && (o.name === name || o.name.replace(/\d+$/, '') === name || o.userData.part === name)) found = o;
  });
  return found;
}

const smoothDoor = (x: number) => x * x * (3 - 2 * x);

/** A stand-in for a prop with no model: a box its size. */
function stand(p: Prop) {
  const colors: Partial<Record<Prop['kind'], number>> = { crate: 0x5ae0c0, strongbox: 0xffd04a, core: 0x8affe0, canister: 0xd04030, alarm: 0xff3a3a, engine: 0x7a5040 };
  const h = p.kind === 'engine' ? 2 : p.kind === 'sconce' ? 0.3 : 1;
  return part(GEO.box, toon(colors[p.kind] ?? 0x6a6470), [0, h / 2, 0], [p.hw * 2 * 0.9, h, p.hd * 2 * 0.9]);
}

function doorStand() {
  const g = new THREE.Group();
  const l = part(GEO.box, toon(0x8a8070), [-0.5, 1.15, 0], [1, 2.3, 0.25]);
  l.name = 'deck_door__leaf_l';
  const r = part(GEO.box, toon(0x8a8070), [0.5, 1.15, 0], [1, 2.3, 0.25]);
  r.name = 'deck_door__leaf_r';
  g.add(l, r);
  return g;
}

export type { Hero };
export { WORK };
