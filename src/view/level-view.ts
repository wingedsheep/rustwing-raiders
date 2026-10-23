import * as THREE from 'three';
import type { Enemy, Level, LevelEvent, Player } from '../sim/level';
import { FLIGHT_Y, HALF_H, HALF_W, TILT, fromFlight, toFlight } from '../sim/types';
import { WorldView } from './world-view';
import { NearLayer, PUFF } from './near';
import { xray } from './xray';
import { HazardView } from './hazard-view';
import { Fx } from './fx';
import { Strokes } from './strokes';
import { Life, busy } from './life';
import { GLASSY, TELL_COLOR, Threats } from './threats';
import { BulletArt } from './bullets';
import { ShotArt } from './shots';
import { Guards, Shields } from './shields';
import { FOES, type Faction } from '../sim/factions';
import { HOT_BOLTS, JUMP_JOLT, TORPEDO, WELD } from '../sim/level';
import { ShipModel, LIVERY } from './ship-model';
import { cloneEnemy } from './enemy-model';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { audio, bossTrack } from '../audio';
import { arsenalEvent, arsenalLook, type ArsenalHooks } from './arsenal-view';
import { GunLooks } from './gun-looks';
import { KitArt } from './kit-view';
import type { Biome } from '../world/planets';
import type { Read } from '../sim/boss';
import { BossPose } from './boss-pose';
import { CarRig } from './car-rig';
import { WormRig } from './worm-rig';
import { clamp, damp, lerp } from '../util';
import { outlined, type PixelRenderer } from '../render/pixel';
import { weather, tickWeather } from '../render/alive';
import { MARK_HEX, REACTION_COLOR, REACTION_HEX } from '../ui/mark-icons';
import { BURN, CRACK, SHOCK, REACTIONS } from '../sim/marks';
import { ConvoyView } from './convoy-view';
import { HeistView } from './heist-view';
import { TraitsView, type TraitHost } from './traits';
import { GraftsView } from './grafts-view';
import { CoreView } from './core-view';
import { JumpView } from './jump-view';
import { VEIN_COLOR, FEED } from '../game/core';
import { AFFIXES, AFFIX_COLOR, TRAITS, itemName, tierOf, type AffixId, type Tier } from '../game/loot';
import { TIER_COLOR } from '../ui/widgets';
import { HOT as HOT_TEXT } from '../ui/hud';
import { EDGES, type Edge } from '../game/parts';

/** The warm glow under every piece of scrap, and the streak one leaves on its way to the magnet. */
/** A tug's tow line: a rod of hard light, stretched from the tug to its strongbox. */
const TOW = new THREE.CylinderGeometry(0.08, 0.08, 1, 5);
const TOW_D = new THREE.Vector3();
/** Hot crates (see Level.hotCrate). */
const HOT_HEX = 0xff6a2a;
/** The Weld (see hud.ts WELD): mending green. */
const WELD_COLOR = 0x8affb0;
/** Plating (see combat.ts): steel, where an elite's armour is gold. */
const PLATE_HEX = 0xc8d4e8;

/** A heist's colour (see hud.ts HEIST). */
const HEIST_HEX = '#5ae0c0';

/** The playfield as it shows on screen (world units): the camera always fits all of it. */
export const FIELD_W = HALF_W * 2;
export const FIELD_H = HALF_H * 2 * Math.cos(TILT);
/** For looking closely while testing: &zoom=0.5 shows half as much. */
const DEV_ZOOM = Number(new URLSearchParams(location.search).get('zoom') ?? 1) || 1;
/** Screen units of margin under the field. */
const MARGIN = 3;
const SHOT_COLORS: Record<string, number> = {
  slug: 0xffe08a,
  pellet: 0xffc070,
  // (the player's fire is rust and cream: the rail and the beam white-hot, not the lattice's cyan)
  rail: 0xfff0d4,
  missile: 0xffffff,
  flak: 0xffb050,
  flame: 0xff9a3a,
  mine: 0xff8a3a,
  beam: 0xffe8b8,
  arc: 0xc8b0ff,
};

interface Wreck {
  obj: THREE.Object3D;
  inst: Instance | null;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  axis: THREE.Vector3;
  spin: number;
  t: number;
  ground: boolean;
  size: number;
}

interface EnemyView {
  inst: Instance | null;
  obj: THREE.Object3D;
  head: THREE.Object3D | null;
  ring: THREE.Mesh | null;
  seen: boolean;
  boss: boolean;
  ground: boolean;
  skin: [number, number, number];
  /** Hit reaction: a squash that springs back, and a shove away from the guns. */
  punch: number;
  knock: number;
  /** A heist runner's part (drawn by the heist view; this is only a stand-in). */
  part?: boolean;
  /** A boss's poses, facing and shedding. */
  pose?: BossPose;
  /** Shaken locally after a blow lands, decaying. */
  shiver?: number;
  /** A model with a `_fold` pose: how far folded it is (0..1), blended over its idle. */
  fold?: { pose: THREE.AnimationAction; idle: THREE.AnimationAction | null; k: number };
  /** A wheeled foe: driven from how it moves rather than by its clip. */
  car?: CarRig;
  worm?: WormRig;
  /** A tug: the hard-light line it hauls its strongbox on. */
  tow?: THREE.Mesh;
  /** A strongbox: how many tugs held it last frame, and whether it's been cut loose. */
  held?: number;
  loose?: boolean;
}

/**
 * Draws a Level and makes a fuss about it: everything the sim says happened (hits, kills, grazes,
 * dashes) becomes sparks, shakes, flashes and sounds here.
 */
export class LevelView {
  readonly scene = new THREE.Scene();
  /** Drawn over the finished picture, past the paint and grade: enemy fire and the hitbox, which must always read. */
  readonly overlay = new THREE.Scene();
  private hitboxes: THREE.Group[] = [];
  /** A volatile crate in tow, under each ship that has one: its lid, its bolts, the light inside. */
  private safes: ({ root: THREE.Group; box: THREE.Group; lid: THREE.Group; bolts: THREE.Mesh[]; glow: THREE.Mesh; seam: THREE.Mesh } | undefined)[] = [];
  private threats = new Threats();
  /** Reactions seen this level: the first of each is called out big. */
  private reacted = new Set<string>();
  /** Enemies a shatter just staggered (their SHATTER! says it; no STAGGERED over it). */
  private shattered = new Set<number>();
  /** When each affix was last named over the ship (see 'affix'). */
  private affixT = new Map<AffixId, number>();
  readonly camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, FIELD_H / 2, -FIELD_H / 2, 1, 400);
  /** Half the view on screen (world units), from the window's shape. */
  halfW = HALF_W;
  halfH = FIELD_H / 2;
  readonly world: WorldView;
  /** High things drifting past the screen's edges, faster than the land. */
  private near: NearLayer;
  readonly fx = new Fx();

  private life: Life;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  private ships: (ShipModel | null)[] = [];
  private enemies = new Map<number, EnemyView>();
  private pickups = new Map<object, { obj: THREE.Object3D; inst: Instance | null; beacon?: THREE.Group }>();
  /** Geysers, rockfalls, lightning… as each planet has them. */
  private hazards: HazardView;
  private bullets = new BulletArt();
  private shotArt = new ShotArt();
  /** When each gun edge's name last popped. */
  private edgeSaid = new Map<Edge, number>();
  /** The legendary traits that play in flight: sentinels, frenzies, claps, novas (see traits.ts). */
  private traits: TraitsView;
  /** The wreck grafts in flight (see grafts-view.ts). */
  private grafts: GraftsView;
  /** The core in flight (see core-view.ts). */
  private core: CoreView;
  /** Co-op downs: the reach, the charge, the call (see jump-view.ts). */
  private jumps: JumpView;
  /** Each ship's engines catching after a jumpstart (1, burning down). */
  private relight = [0, 0];
  private shields: Shields;
  private guards: Guards;
  /** An escort's haulers. */
  private convoy: ConvoyView | null = null;
  /** A heist's runner. */
  private heist: HeistView | null = null;
  /** For the HUD: the runner spooling its jump drive (seconds since it started). */
  spoolWarn: { t: number } | null = null;
  /** For the HUD: the escort's orders, shown as it starts. */
  missionBanner: { t: number } | null = null;
  /** For the HUD: which side boarders are coming from, and how long ago they were called. */
  boardWarn: { side: number; t: number } | null = null;
  /** Bullet pops this frame: past a handful, a mass cancel just flashes. */
  private popped = 0;
  /** When a shot last pinged off armour (they'd drown everything out otherwise). */
  private pinged = 0;
  /** Where each smoking thing was last frame, so its smoke is laid evenly along the way it came. */
  private wakes = new WeakMap<object, { x: number; z: number }>();
  private shots: THREE.InstancedMesh;
  private beams: THREE.Mesh[] = [];
  private laserMeshes: THREE.Mesh[] = [];
  private balls: { ball: THREE.Group; links: THREE.Mesh[] }[] = [];
  /** ARU-0's ballast: plates of its company hull, thrown flat and spinning. */
  /** Each laser as last heard: charging, or burning (its sound plays as it changes). */
  private laserHeard = new WeakMap<object, 'warn' | 'on'>();
  private plates: THREE.Group[] = [];
  private bolts: { mesh: THREE.Mesh; t: number }[] = [];
  private clouds: { obj: THREE.Group; x: number; z: number; drift: number }[] = [];
  /** The shot down, on their way to the ground. */
  private wrecks: Wreck[] = [];
  /** Blasts still to go off (the second and third bangs of a kill). */
  private later: { t: number; x: number; y: number; z: number; size: number; carried: boolean }[] = [];
  /** Lights for blasts to light the land with: a few, always there (so the shaders never change). */
  private blasts: { light: THREE.PointLight; t: number; life: number; power: number; carried: boolean }[] = [];
  private lastScroll = 0;
  private time = 0;
  /** Juice. */
  trauma = 0;
  flash = 0;
  flashColor = new THREE.Color(1, 1, 1);
  hurt = 0;
  /** Strike lines, glints and slashes: the ink of a blow. */
  readonly strokes = new Strokes();
  private arsenalHooks: ArsenalHooks = {
    fx: this.fx,
    strokes: this.strokes,
    pop: (text, x, z, color, big) => this.pop(text, x, z, color, big),
    punch: (k) => this.punch(k),
    shake: (k) => (this.trauma = Math.min(1, this.trauma + k)),
    impact: (col, t) => this.impact(col, t),
    shards: (x, z, n, col) => this.shards(x, z, n, col),
    zap: (x, z, r, col) => this.zap(x, z, r, col),
    bolt: (pts, col) => this.bolt(pts, col),
  };
  /** The new kit: the Bulwark, the Swap Beacon, the skins and the bombs (see kit-view.ts). */
  private kitArt = new KitArt({
    fx: this.fx,
    strokes: this.strokes,
    zap: (x, z, r, col) => this.zap(x, z, r, col),
    bolt: (pts, col) => this.bolt(pts, col),
    punch: (k) => this.punch(k),
    shake: (k) => (this.trauma = Math.min(1, this.trauma + k)),
    flash: (k, col) => {
      this.flash = Math.max(this.flash, k);
      this.flashColor.set(col);
    },
    impact: (col, t) => this.impact(col, t),
    pop: (text, x, z, color, big) => this.pop(text, x, z, color, big),
  });
  /** The forge's guns, each in its own look and sound (see gun-looks.ts). */
  private looks = new GunLooks({
    fx: this.fx,
    strokes: this.strokes,
    zap: (x, z, r, col) => this.zap(x, z, r, col),
    bolt: (pts, col) => this.bolt(pts, col),
    punch: (k) => this.punch(k),
    shove: (dx, dz, k) => this.shove(dx, dz, k),
    shake: (k) => (this.trauma = Math.min(1, this.trauma + k)),
    shiver: (id, k) => this.shiver(id, k),
    impact: (col, t) => this.impact(col, t),
  });
  /** An impact frame: seconds left of the picture flipped to paper and ink, and the paper's colour. */
  private impactT = 0;
  private impactColor = new THREE.Color(1, 1, 1);
  /** When the last impact frame was (they're kept rare, or they'd stop meaning anything). */
  private impactAt = -9;
  /** The colours split at the edges (a blow to the ship), decaying. */
  private aberr = 0;
  /** Each ship drawn out along its dash (0..1). */
  private stretch: number[] = [];
  /** The view punched in a touch towards a blow, springing back. */
  private punchZ = 0;
  private punchV = 0;
  /** What's taught has been said once this level (after that the look of it says it). */
  private said = new Set<string>();
  /** A shove of the camera in a direction that springs back (unlike the shake, which jitters). */
  private kick = new THREE.Vector2();
  private kickV = new THREE.Vector2();
  /** Guns kick the ships back a touch. */
  private recoil = [0, 0];
  /** How fast it feels, 0..1: the screen smears and the view pulls back. */
  speedFx = 0;
  private zoom = 1;
  private lines: THREE.InstancedMesh;
  private lineData: { x: number; y: number; z: number; len: number; v: number }[] = [];
  /** Kills close together, for the chain's rising pitch and the multi-kill call. */
  private chain = 0;
  private chainT = 0;
  private multi = 0;
  private multiT = 0;
  private banks: number[] = [0, 0];
  private ambientT = 0;
  private air: number[] = [];
  private biomeIdx = -1;
  /** For the HUD: the biome that just came in and how long ago. */
  biomeBanner: { name: string; line: string; t: number } | null = null;
  bossBanner: { name: string; title: string; t: number } | null = null;
  /** What the boss last said it read in how you fly (see boss.ts READ_LINE), and how long ago. */
  bossRead: { read: Read; side: number; t: number } | null = null;
  /** Floating texts for the HUD (score pops, GRAZE, part names), in world coords; `big` ones are called out large. */
  pops: { text: string; x: number; z: number; t: number; color: string; big?: boolean }[] = [];
  /** Scrap picked up this frame, for the HUD to fly off to the tin (it takes them as it draws). */
  scrapGot: { x: number; z: number; v: number; id: number }[] = [];
  /** Per player, seconds since: a dash pressed with none left, a guard let fall on nothing, a perfect (for the HUD's flashes). */
  dryT = [9, 9];
  whiffT = [9, 9];
  perfectT = [9, 9];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(readonly lv: Level) {
    this.world = new WorldView(lv.terrain);
    this.near = new NearLayer(lv.terrain);
    this.hazards = new HazardView(lv, this.fx, {
      bolt: (pts, col) => this.bolt(pts, col),
      juice: (o) => {
        if (o.trauma) this.trauma = Math.max(this.trauma, o.trauma);
        if (o.flash && o.flash > this.flash) {
          this.flash = o.flash;
          this.flashColor.setHex(o.flashColor ?? 0xffffff);
        }
      },
    });
    this.scene.add(this.world.group, this.near.group, this.hazards.group, this.fx.group, this.strokes.group);
    this.life = new Life(this.scene, this.fx);
    this.shields = new Shields(this.fx);
    this.scene.add(this.shields.group);
    this.guards = new Guards(this.fx);
    this.scene.add(this.guards.group);
    this.fx.ground = (x, z) => Math.max(lv.terrain.height(x, z), lv.terrain.water(z));
    this.sun.position.set(-30, 60, 25);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    for (let k = 0; k < 4; k++) {
      const light = new THREE.PointLight(0xffa860, 0, 34, 1.2);
      this.scene.add(light);
      this.blasts.push({ light, t: 1, life: 1, power: 0, carried: false });
    }
    lv.players.forEach((p, i) => {
      const ship = new ShipModel(p.build, LIVERY[i]);
      ship.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      xray(ship.body, new THREE.Color(LIVERY[i][0]).lerp(WHITE, 0.35).getHex(), 0.65);
      this.scene.add(ship.root);
      this.ships.push(ship);
    });
    this.overlay.add(this.threats.group);
    this.traits = new TraitsView(lv, this.scene, this.fx, {
      pop: (text, x, z, color, big) => this.pop(text, x, z, color, big),
      unpop: (prefix) => (this.pops = this.pops.filter((p) => !p.text.startsWith(prefix))),
      bolt: (pts, col) => this.bolt(pts, col),
      juice: (o) => {
        if (o.trauma) this.trauma = Math.min(1, this.trauma + o.trauma);
        if (o.flash && o.flash > this.flash) {
          this.flash = o.flash;
          this.flashColor.setHex(o.flashColor ?? 0xffffff);
        }
        if (o.shove) this.shove(o.dx ?? 0, o.dz ?? 1, o.shove);
      },
    });
    const host: TraitHost = {
      pop: (text, x, z, color, big) => this.pop(text, x, z, color, big),
      unpop: (prefix) => (this.pops = this.pops.filter((p) => !p.text.startsWith(prefix))),
      bolt: (pts, col) => this.bolt(pts, col),
      juice: (o) => {
        if (o.trauma) this.trauma = Math.min(1, this.trauma + o.trauma);
        if (o.flash && o.flash > this.flash) {
          this.flash = o.flash;
          this.flashColor.setHex(o.flashColor ?? 0xffffff);
        }
        if (o.shove) this.shove(o.dx ?? 0, o.dz ?? 1, o.shove);
      },
    };
    this.grafts = new GraftsView(lv, this.fx, host);
    this.scene.add(this.grafts.group);
    this.core = new CoreView(lv, this.fx, host);
    this.jumps = new JumpView(lv, this.fx, host);
    this.overlay.add(this.jumps.group);
    const disc = new THREE.CircleGeometry(0.5, 10);
    // the hitbox while focusing: a white dot ringed dark, the size the sim really uses
    lv.players.forEach((p) => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x140c1c, depthTest: false }));
      const dot = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      ring.renderOrder = 50;
      dot.renderOrder = 51;
      ring.scale.setScalar(p.stats.core * 2 + 0.5);
      dot.scale.setScalar(p.stats.core * 2);
      g.add(ring, dot);
      g.visible = false;
      this.overlay.add(g);
      this.hitboxes.push(g);
    });
    this.overlay.add(this.bullets.group);
    this.scene.add(this.shotArt.group, this.looks.group, this.kitArt.group);
    this.shots = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500);
    this.shots.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500 * 3), 3);
    this.shots.frustumCulled = false;
    this.shots.count = 0;
    this.shots.renderOrder = 25;
    this.scene.add(this.shots);
    // speed lines: long thin streaks rushing past while boosting
    this.lines = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }), 48);
    this.lines.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3), 3);
    this.lines.frustumCulled = false;
    this.lines.count = 0;
    this.lines.renderOrder = 40;
    this.scene.add(this.lines);
    for (let k = 0; k < 48; k++) this.lineData.push({ x: 0, y: FLIGHT_Y + 4, z: 1e9, len: 0, v: 0 });
    if (lv.convoy) {
      this.convoy = new ConvoyView(lv, this.fx);
      this.scene.add(this.convoy.group);
      this.missionBanner = { t: 0 };
    }
    if (lv.heist) {
      this.heist = new HeistView(lv, lv.heist, this.fx);
      this.scene.add(this.heist.group);
      this.missionBanner = { t: 0 };
    }
    this.lastScroll = lv.scroll;
    this.placeCamera(0);
  }

  // --- events ------------------------------------------------------------------------------

  handle(events: LevelEvent[]) {
    this.shattered.clear();
    const lv = this.lv;
    for (const e of events) {
      this.feel(e);
      if (this.looks.event(e)) continue;
      if (this.traits.handle(e)) continue;
      if (this.grafts.handle(e)) continue;
      if (this.core.handle(e)) continue;
      switch (e.type) {
        case 'shot': {
          if (e.kind === 'beam') break;
          // a forge gun: its own muzzle and voice
          const kick = this.looks.shot(e);
          if (kick >= 0) {
            if (!e.turret) this.recoil[e.owner] = Math.min(0.5, (this.recoil[e.owner] ?? 0) + kick);
            break;
          }
          const col = SHOT_COLORS[e.kind];
          const heavy = e.heavy || e.kind === 'rail' || e.kind === 'flak' || e.kind === 'pellet';
          // the muzzle: a white-hot blink in a bloom of the gun's colour, a spit of sparks forward,
          // and from the heavy guns a puff of smoke
          const flash = e.kind === 'rail' ? 1.8 : heavy ? 1.2 : 0.8;
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.7, z: e.z - 0.3, size: flash * 0.6, grow: 0.3, life: 0.04, color: HOT, carried: true });
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z - 0.4, size: flash * 1.3, grow: 0.5, life: 0.07, color: this.c.setHex(col), carried: true });
          if (Math.random() < (heavy ? 1 : 0.35))
            for (let k = 0; k < (heavy ? 3 : 1); k++)
              this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z - 0.5, vx: (Math.random() - 0.5) * 8, vz: -18 - Math.random() * 14, size: 0.14, grow: 0.3, life: 0.08 + Math.random() * 0.06, drag: 8, color: SPARK, carried: true });
          if (heavy) this.fx.add({ x: e.x, y: FLIGHT_Y + 0.5, z: e.z - 0.6, vz: 2, vy: 1, size: 0.6, grow: 2.4, life: 0.35, color: TORP_SMOKE, to: TORP_SMOKE_END, glow: false, carried: true });
          if (!e.turret) this.recoil[e.owner] = Math.min(0.5, (this.recoil[e.owner] ?? 0) + (e.kind === 'rail' ? 0.45 : heavy ? 0.22 : 0.07));
          if (e.heavy) {
            // a heavy round: a ring of pushed air off the muzzle and a ship-sized flash
            this.fx.ring(e.x, FLIGHT_Y + 0.6, e.z - 1.4, 1.4, 0.12, true, 0xffe8b0);
            this.fx.add({ x: e.x, y: FLIGHT_Y + 0.8, z: e.z - 0.2, size: 2.4, grow: 0.6, life: 0.06, color: HOT, carried: true });
          }
          const pan = e.x / HALF_W;
          if (e.kind === 'slug') audio.play('shot_rivet', { pan, vol: 0.5 });
          else if (e.kind === 'pellet') audio.play('shot_scatter', { pan, vol: 0.6 });
          else if (e.kind === 'rail') {
            audio.play('shot_rail', { pan });
            this.shove(0, 1, 0.6);
          } else if (e.kind === 'arc') audio.play('shot_arc', { pan, vol: 0.6 });
          else if (e.kind === 'missile') audio.play('shot_missile', { pan, vol: 0.5 });
          else if (e.kind === 'flak') audio.play('shot_flak', { pan });
          else if (e.kind === 'mine') audio.play('shot_mine', { pan });
          break;
        }
        case 'hit': {
          if (e.armour) {
            // on an elite's armour: it rings and throws gold sparks, and gives nothing
            const ev = this.enemies.get(e.enemy);
            if (ev) ev.punch = Math.min(1, ev.punch + 0.25);
            if (!e.dot) {
              this.fx.sparks(e.x, FLIGHT_Y + 0.6, e.z + 0.6, e.blow ? 8 : 2, lv.enemies.find((o) => o.id === e.enemy)?.elite ? 0xffd04a : PLATE_HEX, e.blow ? 18 : 10, 0.15, 0.14);
              // the stream glancing off it ticks; a blow rings
              audio.play('hit_armor', { pan: e.x / HALF_W, vol: e.blow ? 0.55 : 0.18, pitch: (e.blow ? 0.9 : 1.3) + Math.random() * 0.2 });
            }
            break;
          }
          if (e.dot && !e.kill) {
            // a burn's tick: an ember off it, nothing more
            const en = lv.enemies.find((o) => o.id === e.enemy);
            if (en) this.fx.add({ x: en.x + (Math.random() - 0.5) * en.r, y: en.y + 0.8, z: en.z, vy: 4, vz: -2, size: 0.22, grow: 0.3, life: 0.4, color: EMBER, to: EMBER_END, carried: !en.ground });
            break;
          }
          const ev = this.enemies.get(e.enemy);
          const y = ev ? ev.obj.position.y : FLIGHT_Y;
          const en = lv.enemies.find((o) => o.id === e.enemy);
          // a forge gun's hit: drawn and sounded its own way (`own`), or the usual sparks in its voice (`quiet`)
          const look = this.looks.hit(e, en);
          if (e.edge) this.edgeHit(e.edge, e.x, e.z, y);
          const big = en ? en.r : 1;
          // a heavy hit (a rail, a shell, a crit) lands like one; a stream of rivets patters
          const heavy = e.dmg >= 10 || e.crit;
          if (ev) {
            ev.punch = Math.min(1, ev.punch + (heavy ? 0.9 : 0.4) / Math.sqrt(big));
            ev.knock = Math.min(1, ev.knock + (heavy ? 0.7 : 0.3) / big);
          }
          if (!e.kill && look === 'own') {
            // (its own look; the hit still shoves it)
          } else if (!e.kill) {
            const bite = clamp(0.8 + e.dmg * 0.05, 0.8, 2.6) * (e.crit ? 1.4 : 1);
            const hx = e.x + (Math.random() - 0.5) * big * 0.6;
            const hz = e.z + big * 0.35;
            // the bite: white-hot where it struck, a hot bloom round it
            this.fx.add({ x: hx, y: y + 0.9, z: hz, size: bite, grow: 0.5, life: 0.05, color: HOT, carried: true });
            this.fx.add({ x: hx, y: y + 0.8, z: hz, size: bite * 1.7, grow: 1.5, life: 0.13, color: BITE, to: EMBER_END, carried: true });
            // sparks thrown back the way the shot came, some bouncing off down to the ground
            const n = 4 + Math.min(10, Math.round(e.dmg * 0.4)) + (e.crit ? 5 : 0);
            for (let k = 0; k < n; k++) {
              const a = Math.PI / 2 + (Math.random() - 0.5) * 2.2;
              const v = 10 + Math.random() * (heavy ? 22 : 14);
              this.fx.add({ x: hx, y: y + 0.6, z: hz, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * 4, gravity: 12, size: 0.16 + Math.random() * 0.1, grow: 0.3, life: 0.16 + Math.random() * 0.16, drag: 4, color: e.crit ? HOT : SPARK, to: EMBER, carried: true });
            }
            // bits knocked off it: chips of its own hull tumbling down, a puff of smoke
            const skin = en?.skin.colors;
            if (skin && (heavy || Math.random() < 0.22)) {
              for (let k = 0; k < (heavy ? 3 + Math.round(Math.random() * 3) : 1); k++) {
                const a = Math.random() * Math.PI * 2;
                const v = 4 + Math.random() * 8;
                this.fx.add({ x: hx, y: y + 0.4, z: hz, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.6 + 4, vy: 3 + Math.random() * 5, size: 0.14 + Math.random() * 0.18, life: 1.6 + Math.random(), color: this.c.setHex(Math.random() < 0.6 ? skin[0] : skin[1]), solid: true, gravity: 24, spin: 10 + Math.random() * 10 });
              }
              this.fx.add({ x: hx, y: y + 0.7, z: hz, vy: 1.5, vz: 2, size: 0.7, grow: 2.4, life: 0.5, color: HIT_SMOKE, to: SMOKE_END, glow: false, carried: true });
            }
            if (heavy) {
              this.fx.ring(hx, y + 0.6, hz, 1.5 + bite, 0.16, true, e.crit ? 0xffffff : 0xffd8a0);
              this.trauma = Math.min(1, this.trauma + Math.min(0.14, e.dmg * 0.004));
            }
            if (!look) audio.play(e.crit ? 'hit_armor' : 'hit', { pan: e.x / HALF_W, vol: heavy ? 0.65 : 0.4, pitch: heavy ? 0.8 : 0.9 + Math.random() * 0.25 });
          } else this.kill(e.x, y, e.z, big);
          break;
        }
        case 'explode': {
          const ev = e.enemy !== undefined ? this.enemies.get(e.enemy) : undefined;
          const y = ev ? ev.obj.position.y : e.y;
          const air = y >= FLIGHT_Y - 1;
          const groundZ = ev && !air ? fromFlight(e.z, y) : e.z;
          this.fx.explode(e.x, y, groundZ, e.size, e.color, air);
          // a blink of light bigger than the fireball, and the land lit up under it
          this.fx.add({ x: e.x, y: y + 1.5, z: groundZ, size: 3 + e.size * 2.5, grow: 1.3, life: 0.09, color: HOT, carried: air });
          this.blast(e.x, y, groundZ, e.size);
          if (!air) this.fx.add({ x: e.x, y: y + 0.15, z: groundZ, size: 1.2 + e.size * 0.9, grow: 1.1, life: 4, color: SCORCH, to: SCORCH_END, glow: false });
          if (ev?.held !== undefined) {
            // a strongbox hits the ground and bursts: its lid off, and a fountain of what was in it
            this.fx.ring(e.x, y + 0.3, groundZ, 7, 0.35, !!air, 0xffe08a);
            for (let k = 0; k < 3; k++) this.fx.sparks(e.x, y + 0.6, groundZ, 14, k ? 0xffd04a : 0xffffff, 12 + k * 6, 0.6, 0.3, !!air);
            this.strokes.burst(e.x, e.z, 12, 0xffe08a, 8, 0.25, 0.45);
            this.punch(0.35);
            this.trauma = Math.min(1, this.trauma + 0.35);
            audio.play('strongbox_open', { pan: e.x / HALF_W });
          } else if (ev && e.enemy !== undefined && !ev.boss && !ev.part) {
            // shot down: what's left of it, and more of it going up as it goes
            this.wreck(e.enemy, ev, e.size);
            this.shotDown(e.x, y, groundZ, e.size, ev.skin, air);
          }
          this.trauma = Math.min(1, this.trauma + 0.1 * e.size);
          this.shove(Math.sign(e.x - lv.players[0].x) * 0.3, -1, 0.18 * e.size);
          if (e.size >= 3) {
            this.flash = Math.max(this.flash, 0.25);
            this.flashColor.set(0xfff0d0);
            audio.play('explode_big', { pan: e.x / HALF_W });
            audio.duck(0.4);
          } else audio.play('explode_small', { pan: e.x / HALF_W, pitch: 1.3 - e.size * 0.15 });
          break;
        }
        case 'enemyShot':
          this.muzzle(e.x, e.z, e.color, e.look);
          audio.play('enemy_shot', { pan: e.x / HALF_W, vol: 0.35, pitch: e.look === 'lattice' ? 1.3 : e.look === 'wild' ? 0.7 : e.look === 'bloom' ? 0.55 : 1 });
          break;
        case 'bulletPop':
          this.pop1(e.x, e.z, e.color, e.look);
          break;
        case 'torpedo':
          this.fx.explode(e.x, FLIGHT_Y, e.z, e.shot ? 0.55 : 0.4, e.color, false);
          this.fx.ring(e.x, FLIGHT_Y + 0.5, e.z, 2.6, 0.22, false, e.shot ? 0xffffff : e.color);
          if (e.shot) {
            this.strokes.burst(e.x, e.z, 8, 0xffe08a, 5, 0.18, 0.35);
          }
          audio.play('torpedo_down', { pan: e.x / HALF_W, vol: e.shot ? 0.8 : 0.5 });
          break;
        case 'seeker':
          if (e.how === 'halt') {
            // it stops dead with a tick, higher each turn
            this.fx.ring(e.x, FLIGHT_Y + 0.5, e.z, 1.7, 0.16, true, e.color);
            audio.play('seeker_halt', { pan: e.x / HALF_W, pitch: 1 + e.n * 0.15, vol: 0.55 });
          } else if (e.how === 'go') {
            this.fx.ring(e.x, FLIGHT_Y + 0.5, e.z, 2.6, 0.14, true, 0xffffff);
            audio.play('seeker_go', { pan: e.x / HALF_W, pitch: 1 + e.n * 0.1, vol: 0.5 });
          } else {
            // shot down (or broken on a hull): it goes like glass
            this.pop1(e.x, e.z, e.color, 'lattice');
            this.fx.ring(e.x, FLIGHT_Y + 0.5, e.z, 2.4, 0.2, true, e.how === 'shot' ? 0xffffff : e.color);
            if (e.how === 'shot') {
              this.strokes.burst(e.x, e.z, 6, 0x9af4ff, 4, 0.16, 0.3);
            }
            audio.play('seeker_down', { pan: e.x / HALF_W, vol: e.how === 'shot' ? 0.7 : 0.45 });
          }
          break;
        case 'playerHit': {
          const p = lv.players[e.id];
          // the hull's hits by tier: a graze stings, a heavy one rocks the whole screen
          const k = e.shield ? 0.5 : e.tier === 'graze' ? 0.6 : e.tier === 'heavy' ? 1.5 : 1;
          this.trauma = Math.min(1, this.trauma + 0.6 * k);
          this.shove(0, 1, 1.2 * k);
          if (!e.shield) this.hurt = Math.min(1, k);
          this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 16, e.shield ? LIVERY[e.id][2] : 0xff5a3a, 18, 0.4, 0.3);
          this.fx.ring(p.x, FLIGHT_Y + 0.5, p.z, 3, 0.25, true, e.shield ? LIVERY[e.id][2] : 0xff5a3a);
          audio.play(e.shield ? 'shield_break' : 'player_hit');
          break;
        }
        case 'crash': {
          const p = lv.players[e.id];
          this.fx.sparks(p.x, FLIGHT_Y, p.z, 20, 0xffd080, 14, 0.5, 0.28);
          audio.play('crash');
          break;
        }
        case 'down':
          this.trauma = 1;
          this.flash = 0.6;
          this.flashColor.set(0xff6040);
          audio.play('player_down');
          break;
        case 'crashed':
          this.trauma = 1;
          this.flash = 0.8;
          this.flashColor.set(0xff7030);
          audio.play('explode_big');
          audio.play('player_down', { vol: 0.6 });
          this.fx.sparks(e.x, FLIGHT_Y, e.z, 30, 0xffb060, 18, 0.6, 0.3);
          this.strokes.burst(e.x, e.z, 26, 0xff7030, 18, 0.4, 0.7);
          break;
        case 'jumpstart': {
          // the jolt: a flash and a shockwave that sweeps the fire off, one last arc between the
          // ships, the engines catching in a burst, and the name of it, with what it earned
          const p = lv.players[e.id];
          const by = lv.players[e.by];
          this.trauma = Math.min(1, this.trauma + 0.55);
          this.flash = Math.max(this.flash, 0.55);
          this.flashColor.set(0x8affb0);
          this.blast(p.x, FLIGHT_Y, p.z, 5);
          this.fx.ring(p.x, FLIGHT_Y, p.z, 2.5, 0.18, true, 0xffffff);
          this.fx.ring(p.x, FLIGHT_Y, p.z, JUMP_JOLT, 0.45, true, 0x8affb0);
          this.fx.ring(p.x, FLIGHT_Y, p.z, JUMP_JOLT * 0.6, 0.32, true, 0xd0ffe0);
          this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 26, 0x8affb0, 22, 0.45, 0.24);
          this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 12, 0xffffff, 30, 0.22, 0.2);
          this.strokes.burst(p.x, p.z, 22, 0x8affb0, 14, 0.35, 0.6);
          this.strokes.star(p.x, p.z - 1, 6, 0xffffff, 0.3);
          if (by) {
            this.bolt([by.x, by.z, p.x, p.z], 0xffffff);
            this.fx.ring(by.x, FLIGHT_Y, by.z, 3, 0.25, true, 0x8affb0);
          }
          this.relight[e.id] = 1;
          const ship = this.ships[e.id];
          for (const f of ship?.flames ?? []) {
            f.getWorldPosition(this.v);
            for (let k = 0; k < 7; k++)
              this.fx.add({ x: this.v.x + (Math.random() - 0.5) * 0.4, y: this.v.y, z: this.v.z + 0.4, vx: (Math.random() - 0.5) * 5, vz: 14 + Math.random() * 14, size: 0.7 + Math.random() * 0.5, grow: 1.4, life: 0.3 + Math.random() * 0.2, drag: 4, color: new THREE.Color(0xfff0c0), to: new THREE.Color(LIVERY[e.id][2]), carried: true });
          }
          this.warn('JUMPSTART!', p.x, p.z, '#8affb0');
          if (by) this.pops.push({ text: `+${FEED.jumpstart} GREASE`, x: by.x, z: by.z - 2, t: 0, color: VEIN_COLOR.grease, big: false });
          audio.play('jolt', { pan: p.x / HALF_W });
          audio.play('revive', { pan: p.x / HALF_W, vol: 0.8 });
          break;
        }
        case 'graze':
          this.fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 3, LIVERY[e.id][2], 8, 0.22, 0.18);
          audio.play('graze', { pan: e.x / HALF_W, vol: 0.5 });
          break;
        case 'dash': {
          const p = lv.players[e.id];
          for (let k = 0; k < 8; k++)
            this.fx.add({ x: p.x - e.dx * k * 0.5, y: FLIGHT_Y + 0.3, z: p.z - e.dz * k * 0.5, size: 1.6 - k * 0.12, grow: 0.2, life: 0.18, color: new THREE.Color(LIVERY[e.id][2]), carried: true });
          // afterimages of the ship along the line, and a puff of air where it left
          this.fx.ring(e.x, FLIGHT_Y, e.z, 2.5, 0.2, true, LIVERY[e.id][2]);
          for (let k = 0; k < 6; k++) this.fx.add({ x: e.x + (Math.random() - 0.5), y: FLIGHT_Y, z: e.z + (Math.random() - 0.5), vx: -e.dx * 8 + (Math.random() - 0.5) * 6, vz: -e.dz * 8 + (Math.random() - 0.5) * 6, size: 0.6, grow: 2.5, life: 0.3, drag: 5, color: AIR, glow: false, carried: true });
          this.shove(e.dx, e.dz, 0.35);
          audio.play('dash', { pan: p.x / HALF_W });
          break;
        }
        case 'boost':
          if (e.on) {
            const p = lv.players[e.id];
            audio.play('boost', { pan: p.x / HALF_W });
            this.fx.ring(p.x, FLIGHT_Y, p.z + 1, 3, 0.25, true, 0xfff0c0);
            this.shove(0, 1, 0.4);
          }
          break;
        case 'perfect': {
          // A bell and local rings reward the timing without interrupting the shared clock.
          const parry = e.how === 'parry';
          const col = LIVERY[e.id][2];
          if (!parry) {
            this.flash = Math.max(this.flash, 0.45);
            this.flashColor.set(col);
          }
          this.fx.ring(e.x, FLIGHT_Y, e.z, parry ? 9 : 7, 0.4, true, col);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0xffffff);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 12 + e.absorbed * 3, col, 20, 0.4, 0.25);
          this.perfectT[e.id] = 0;
          if (parry) {
            this.pop('PERFECT PARRY', e.x, e.z - 3, '#ffffff');
            this.pop('RIPOSTE', e.x, e.z - 5.5, RIPOSTE_HEX);
            // the counter coming up: gold off the guns
            this.fx.ring(e.x, FLIGHT_Y + 0.6, e.z, 5.5, 0.3, true, 0xffd060);
          } else this.pop(e.absorbed > 1 ? `PERFECT x${e.absorbed}` : 'PERFECT', e.x, e.z - 3, '#ffffff');
          // a chain says itself without words: a gold ring wider for every perfect run on
          if (e.chain > 1) this.fx.ring(e.x, FLIGHT_Y + 0.3, e.z, 6 + Math.min(6, e.chain) * 1.6, 0.45, true, 0xffd04a);
          audio.play('perfect', { pan: e.x / HALF_W, pitch: 2 ** (Math.min(7, e.chain - 1) / 12) });
          if (!parry) audio.duck(0.4);
          break;
        }
        case 'skim': {
          // sparks grinding off the land at the near point
          const g = this.fx.ground(e.x, e.z);
          const y = Math.max(g, FLIGHT_Y - 2);
          for (let k = 0; k < 2 + Math.round(e.close * 4); k++)
            this.fx.add({ x: e.x, y: y + 0.4, z: e.z, vx: (Math.random() - 0.5) * 14, vz: 8 + Math.random() * 10, vy: 2 + Math.random() * 5, gravity: 20, size: 0.18, grow: 0.3, life: 0.3, color: SKIM, drag: 2, carried: true });
          audio.play('skim', { pan: e.x / HALF_W, vol: 0.4 + e.close * 0.5 });
          break;
        }
        case 'pointBlank':
          this.pop('POINT BLANK', e.x, e.z - 2, '#ffd04a');
          this.fx.ring(e.x, FLIGHT_Y, e.z, 3.5, 0.2, true, 0xffd04a);
          audio.play('point_blank', { pan: e.x / HALF_W });
          break;
        case 'windup': {
          const en = lv.enemies.find((o) => o.id === e.enemy);
          // a boss's signature: a low horn, so the ear learns it too (once ARU-0 is called: a toll)
          if (en?.boss && en.boss.move === en.boss.sig && en.boss.k === 0) audio.play(en.boss.called ? 'toll' : 'horn', { pitch: 0.5, vol: 0.7 });
          // ARU-0's: a notice before its claws and its collectors, the printer as its hold opens
          // for a Lien, metal giving as it tears off ballast; called, a toll for every tell
          if (en?.boss && lv.spec.planet.id === 'cinder' && en.boss.move !== en.boss.sig) {
            const m = en.boss.move;
            if (en.boss.called) audio.play('toll', { pan: en.x / HALF_W, pitch: m === 'ballast' ? 0.62 : 0.84, vol: 0.8 });
            if (m === 'pursuit' || m === 'summon') audio.play('notice', { pitch: m === 'summon' ? 0.9 : 1, vol: 0.7 });
            else if (m === 'lien') audio.play('printer', { pan: en.x / HALF_W, pitch: en.boss.called ? 0.8 : 1 });
            else if (m === 'ballast') audio.play('plate_tear', { pan: en.x / HALF_W, pitch: 0.9 + en.boss.torn * 0.06 });
            break;
          }
          if (en?.boss && lv.spec.planet.id === 'ashgrave') {
            this.khetWindup(en);
            break;
          }
          // Vask's own: she draws breath for a screech, her wings creak up for a gust
          if (en?.boss?.move === 'screech') audio.play('shriek', { pan: en.x / HALF_W, pitch: 0.6, vol: 0.5 });
          else if (en?.boss?.move === 'gust') audio.play('wingbeat', { pan: en.x / HALF_W, pitch: 0.7, vol: 0.5 });
          // the Engine's: ice groaning as it shudders, a low toll as it's about to count
          else if (en?.boss?.move === 'calve') audio.play('ice_crack', { pan: en.x / HALF_W, pitch: 0.7, vol: 0.7 });
          else if (en?.boss?.move === 'count') audio.play('toll', { pan: en.x / HALF_W, pitch: 0.5, vol: 0.8 });
          // Istra's: she calls HEAVE before her irons and her broadside (the crew answers as each
          // goes), the Throne-Shell draws breath, sounds before a breach
          else if (en?.boss?.move === 'irons' || en?.boss?.move === 'broadside') {
            if (en.boss.k === 0) audio.play('istra_call', { pan: en.x / HALF_W, pitch: en.boss.move === 'broadside' ? 0.9 : 1 });
          } else if (en?.boss?.move === 'breath' && lv.spec.planet.id === 'vesh') audio.play('whale_breath', { pan: en.x / HALF_W });
          else if (en?.boss?.move === 'breach') audio.play('whale_dive', { pan: en.x / HALF_W, pitch: 1 + en.boss.k * 0.08 });
          else if (en && (e.kind === 'torpedo' || e.kind === 'seekers')) {
            // (the lattice's lock is higher and colder)
            audio.play('lock_on', { pan: en.x / HALF_W, vol: 0.5, pitch: e.kind === 'seekers' ? 1.25 : 1 });
            const prey = e.tele?.shape === 'lock' ? lv.players[e.tele.id] : undefined;
            if (prey) this.pop('LOCK ON', prey.x, prey.z + 4, e.kind === 'seekers' ? '#9af4ff' : '#ff8a4a');
          } else if (en) audio.play(e.style === 'draw' ? 'laser_charge' : e.style === 'rear' ? 'hook' : 'overheat', { pan: en.x / HALF_W, vol: 0.35, pitch: e.style === 'swell' ? 0.6 : 1 });
          break;
        }
        case 'release':
          if (e.kind === 'torpedo') audio.play('torpedo_launch', { pan: e.x / HALF_W, vol: 0.6 });
          else if (e.kind === 'seekers') audio.play('seeker_go', { pan: e.x / HALF_W, pitch: 0.8, vol: 0.6 });
          else if (e.kind === 'lunge' || e.kind === 'ram' || e.kind === 'charge' || e.kind === 'dive') {
            this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.18, true, 0xfff0d0);
            audio.play('dash', { pan: e.x / HALF_W, pitch: 0.7 });
          }
          break;
        case 'exposed':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, e.stagger ? 10 : 5, 0xffe08a, 10, 0.3, 0.2);
          if (e.stagger) {
            // (the first few a level say what to do about it)
            if (!this.shattered.has(e.enemy)) this.pop('STAGGERED · DASH IT!', e.x, e.z - 2, '#ffe08a');
            audio.play('hit_armor', { pan: e.x / HALF_W, pitch: 0.7 });
          }
          break;
        case 'crack':
          this.shields.shatter(e.enemy);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, 0xd8e0f0, 16, 0.35, 0.25);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.2, true, 0xd8e0f0);
          audio.play('shield_break', { pan: e.x / HALF_W, vol: 0.7 });
          break;
        case 'guard': {
          // the shot meets the shield: a ripple runs over it from there, and the shot glances off
          // in sparks along its face; the whole thing gives a little
          const en = lv.enemies.find((o) => o.id === e.enemy);
          const n = en ? this.shields.hit(en, e.x, e.z) : null;
          const out = n ? Math.atan2(n.nx, n.nz) : Math.PI;
          const col = en ? this.c.setHex(en.skin.colors[2]).lerp(GLINT, 0.5) : GLINT;
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.9, z: e.z, size: 1.3, grow: 0.4, life: 0.06, color: HOT, carried: true });
          for (let k = 0; k < 5; k++) {
            const a = out + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.9);
            const v = 14 + Math.random() * 14;
            this.fx.add({ x: e.x, y: FLIGHT_Y + 0.7, z: e.z, vx: Math.sin(a) * v, vz: Math.cos(a) * v, size: 0.17, grow: 0.3, life: 0.14 + Math.random() * 0.1, drag: 5, color: k < 2 ? HOT : col, carried: true });
          }
          const ev = this.enemies.get(e.enemy);
          if (ev) ev.knock = Math.min(1, ev.knock + 0.08);
          audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.3, pitch: 1.5 + Math.random() * 0.3 });
          break;
        }
        case 'reflect': {
          // your shot turned round: a white snap where it struck, a ring, and sparks flung down
          // the line it's coming back on
          const en = lv.enemies.find((o) => o.id === e.enemy);
          const col = en ? this.c.setHex(en.skin.colors[2]).lerp(GLINT, 0.4) : GLINT;
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.9, z: e.z, size: 1.8, grow: 0.5, life: 0.07, color: HOT, carried: true });
          this.fx.ring(e.x, FLIGHT_Y + 0.6, e.z, 2.2, 0.16, true, 0xffffff);
          for (let k = 0; k < 6; k++) {
            const a = e.a + (Math.random() - 0.5) * 0.7;
            const v = 18 + Math.random() * 16;
            this.fx.add({ x: e.x, y: FLIGHT_Y + 0.7, z: e.z, vx: Math.sin(a) * v, vz: Math.cos(a) * v, size: 0.18, grow: 0.3, life: 0.14 + Math.random() * 0.1, drag: 5, color: k < 2 ? HOT : col, carried: true });
          }
          audio.play('reflect', { pan: e.x / HALF_W, vol: 0.45 });
          break;
        }
        case 'shotLand': {
          // a shot into the land: a puff of its dust, grit kicked up, a few sparks back off the face
          const b = lv.terrain.biome(e.z);
          const y = FLIGHT_Y + 0.3;
          if (e.bounce) {
            this.fx.add({ x: e.x, y: y + 0.4, z: e.z, size: 0.9, grow: 0.4, life: 0.05, color: HOT, carried: true });
            this.fx.sparks(e.x, y, e.z, 3, SKIM, 12, 0.18, 0.16);
            audio.play('skim', { pan: e.x / HALF_W, vol: 0.35, pitch: 1.3 + Math.random() * 0.2 });
            break;
          }
          const n = e.heavy ? 3 : 1;
          for (let k = 0; k < n; k++)
            this.fx.add({ x: e.x + (Math.random() - 0.5) * 0.6, y, z: e.z + 0.3, vx: (Math.random() - 0.5) * 3, vz: 2 + Math.random() * 2, vy: 1.5, size: e.heavy ? 0.9 : 0.6, grow: e.heavy ? 2.4 : 1.6, life: 0.35 + Math.random() * 0.2, drag: 3, color: this.c.setHex(b.cliff), to: SMOKE_END, glow: false, carried: true });
          for (let k = 0; k < (e.heavy ? 5 : 2); k++) {
            const a = Math.PI / 2 + (Math.random() - 0.5) * 2;
            const v = 5 + Math.random() * 7;
            this.fx.add({ x: e.x, y, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 4, size: 0.1 + Math.random() * 0.12, life: 0.5 + Math.random() * 0.4, color: this.c.setHex(Math.random() < 0.5 ? b.cliff : b.ground[3]), solid: true, gravity: 24, spin: 10 + Math.random() * 10 });
          }
          this.fx.sparks(e.x, y + 0.2, e.z, e.heavy ? 4 : 2, SKIM, 10, 0.15, 0.14);
          if (e.heavy) {
            this.fx.ring(e.x, y, e.z, 2, 0.16, true, 0xffe0b0);
            this.trauma = Math.min(1, this.trauma + 0.04);
          }
          audio.play('shot_land', { pan: e.x / HALF_W, vol: e.heavy ? 0.4 : 0.18, pitch: (e.heavy ? 0.8 : 1) + Math.random() * 0.2 });
          break;
        }
        case 'weakHit':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 6, 0xffffff, 18, 0.2, 0.22);
          audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.5, pitch: 1.2 });
          break;
        case 'parried':
          this.strokes.star(e.x, e.z, 3, 0xffffff, 0.2);
          break;
        case 'kill':
          // (how it died shows in how it goes: see feel)
          break;
        case 'multiKill':
          break;
        case 'latch': {
          const p = lv.players[e.id];
          this.trauma = Math.min(1, this.trauma + 0.3);
          this.pop('HOOKED! DASH!', p.x, p.z + 3, '#ff8a4a');
          audio.play('hook', { pan: p.x / HALF_W, pitch: 0.7 });
          break;
        }
        case 'breakFree':
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0xffffff);
          this.strokes.burst(e.x, e.z, 8, 0xffffff, 5, 0.18, 0.35);
          audio.play('block', { pan: e.x / HALF_W });
          break;
        case 'strike':
          if (e.kind === 'gateDown') {
            audio.play('shield_break', { pan: e.x / HALF_W });
          } else if (e.kind === 'shell' || e.kind === 'slam') {
            this.fx.explode(e.x, FLIGHT_Y - 1, e.z, Math.max(0.6, e.r * 0.5), 0xffb02a, true);
            this.trauma = Math.min(1, this.trauma + 0.12);
            audio.play('explode_small', { pan: e.x / HALF_W, pitch: 0.8 });
          } else if (e.kind === 'puddle' && e.color !== undefined && GLASSY.has(e.color)) {
            // ground going to glass: a clear note, a flash of it, flakes kicked up
            this.fx.ring(e.x, FLIGHT_Y - 1, e.z, e.r, 0.18, true, 0xffffff);
            this.shards(e.x, e.z, e.r > 4 ? 10 : 3, e.color);
            audio.play(e.r > 4 ? 'glass_burst' : 'glass_fall', { pan: e.x / HALF_W, vol: e.r > 4 ? 0.7 : 0.35, pitch: 0.9 + Math.random() * 0.2 });
            if (e.r > 4) this.trauma = Math.min(1, this.trauma + 0.08);
          } else if (e.kind === 'acid' || e.kind === 'puddle') {
            this.fx.sparks(e.x, FLIGHT_Y - 1, e.z, 10, 0xb0ff4a, 10, 0.4, 0.3);
            audio.play('geyser', { pan: e.x / HALF_W, vol: 0.4 });
          } else if (e.kind === 'wave') audio.play('special_emp', { pan: e.x / HALF_W, vol: 0.4 });
          else if (e.kind === 'spore') this.fx.sparks(e.x, FLIGHT_Y, e.z, 12, 0xc8a0ff, 6, 0.8, 0.5);
          break;
        case 'outran':
          audio.play('risk_up', { pitch: 1.2 });
          break;
        case 'overtake': {
          this.shove(0, -1, 0.4);
          audio.play('risk_up', { pitch: 1.5 });
          break;
        }
        case 'link':
          break;
        case 'jam': {
          const p = lv.players[e.id];
          this.fx.sparks(p.x, FLIGHT_Y + 0.6, p.z - 0.6, 8, 0xc8a0ff, 8, 0.3, 0.18);
          audio.play('overheat', { pan: p.x / HALF_W });
          break;
        }
        case 'escaped':
          break;
        case 'tally':
          if (e.full) {
            this.fx.ring(lv.players[0].x, FLIGHT_Y, lv.players[0].z, 10, 0.5, true, 0x8affe0);
            audio.play('pickup_part', { pitch: 0.75 });
          }
          break;
        case 'waveClear':
          this.fx.ring(e.x, FLIGHT_Y, e.z, 8, 0.4, true, 0x8affe0);
          this.strokes.burst(e.x, e.z, 12, 0x8affe0, 8, 0.3, 0.35);
          audio.play('pickup_part', { pitch: 1.25 });
          break;
        case 'bounty': {
          if (e.state === 'appear') {
            this.pop('BOUNTY!', e.x, e.z, '#ffd04a');
            audio.play('special_ready', { pitch: 1.3 });
          } else if (e.state === 'claimed') {
            this.strokes.burst(e.x, e.z, 14, 0xffd04a, 9, 0.28, 0.45);
            this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.4, true, 0xffd04a);
            this.flash = Math.max(this.flash, 0.25);
            this.flashColor.set(0xffe08a);
            audio.play('pickup_part');
          } else {
            audio.play('risk_lost');
          }
          break;
        }
        case 'aux':
          if (e.kind === 'parry') {
            this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.12, true, 0xffffff);
            audio.play('guard_up', { pan: e.x / HALF_W });
          }
          else if (e.kind === 'siphon') this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.3, true, 0x9a6aff);
          break;
        case 'parry': {
          // Local rings, sparks and a ringing blade: a partner's view and movement stay steady.
          this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.25, true, 0xffffff);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.4, true, LIVERY[e.id][2]);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 10 + e.count * 4, 0xffffff, 26, 0.3, 0.22);
          this.guards.hit(e.id, e.x, e.z - 2);
          // (the first is a perfect, and says so; more in the same window count on)
          if (!e.first) this.pop(`PARRY +${e.count}`, e.x + 2, e.z - 1, '#ffffff');
          audio.play('parry', { pan: e.x / HALF_W, pitch: 1 + Math.min(4, e.count - 1) * 0.06 });
          break;
        }
        case 'block':
          this.guards.hit(e.id, e.x, e.z - 2);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z - 1, 4 + e.count * 2, 0xc8c0d8, 12, 0.2, 0.2);
          this.trauma = Math.min(1, this.trauma + 0.15);
          audio.play('block', { pan: e.x / HALF_W });
          break;
        case 'guardOut':
          if (e.how === 'broke') {
            this.guards.end(e.id, 'broke');
            this.trauma = Math.min(1, this.trauma + 0.3);
            this.pop('GUARD BROKEN', e.x, e.z - 3, '#c8c0d8');
            audio.play('shield_break', { pan: e.x / HALF_W, pitch: 1.3, vol: 0.6 });
          } else {
            this.guards.end(e.id, 'whiff');
            this.whiffT[e.id] = 0;
            audio.play('guard_whiff', { pan: e.x / HALF_W });
          }
          break;
        case 'dashDry':
          this.dryT[e.id] = 0;
          audio.play('dash_dry', { pan: lv.players[e.id].x / HALF_W });
          break;
        case 'auxReady':
          audio.play('aux_ready', { vol: 0.6 });
          break;
        case 'hook':
          this.bolt([e.x, e.z, e.x2, e.z2], e.enemy ? 0xffd890 : 0x8a8098);
          audio.play('hook', { pan: e.x / HALF_W });
          break;
        case 'reeled':
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0xffd890);
          audio.play('reel', { pan: e.x / HALF_W });
          break;
        case 'eat':
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, size: 0.8, grow: 0.1, life: 0.12, color: new THREE.Color(0xc8a0ff), carried: true });
          audio.play('eat', { pan: e.x / HALF_W, vol: 0.5, pitch: 0.9 + Math.random() * 0.3 });
          break;
        case 'shieldGain': {
          const p = lv.players[e.id];
          this.fx.ring(p.x, FLIGHT_Y, p.z, 3, 0.3, true, 0x8ae8ff);
          audio.play('shield_up', { vol: 0.6 });
          break;
        }
        case 'blink':
          // gone from here, there in a flash: an implosion where it was, a burst where it is
          this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.15, true, LIVERY[e.id][2]);
          this.fx.sparks(e.x2, FLIGHT_Y + 0.5, e.z2, 10, LIVERY[e.id][2], 16, 0.25, 0.22);
          this.bolt([e.x, e.z, e.x2, e.z2], LIVERY[e.id][2]);
          audio.play('blink', { pan: e.x2 / HALF_W });
          break;
        case 'ram':
          this.trauma = Math.min(1, this.trauma + 0.35);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z - 1, 14, 0xffd060, 20, 0.3, 0.25);
          this.shove(0, 1, 0.5);
          audio.play('ram', { pan: e.x / HALF_W });
          break;
        case 'decoy':
          if (e.kind === 'flare') audio.play('flare', { pan: e.x / HALF_W });
          break;
        case 'kit':
          this.kitArt.event(e, lv);
          break;
        case 'special': {
          if (this.kitArt.special(e, lv)) {
            this.trauma = Math.min(1, this.trauma + 0.4);
            audio.duck(1);
            break;
          }
          this.trauma = Math.min(1, this.trauma + 0.6);
          this.flash = e.kind === 'bomb' ? 0.9 : 0.4;
          this.flashColor.set(e.kind === 'emp' ? 0x9ad8ff : e.kind === 'phase' ? 0xc8a0ff : 0xfff0c0);
          this.fx.ring(e.x, FLIGHT_Y, e.z, e.kind === 'bomb' ? 40 : 16, 0.6, true, LIVERY[e.id][2]);
          if (e.kind === 'bomb') for (let k = 0; k < 8; k++) this.fx.explode((Math.random() - 0.5) * 30, FLIGHT_Y - 2, lv.scroll + (Math.random() - 0.5) * 40, 1.5, 0xffc060);
          audio.play(`special_${e.kind}`);
          audio.duck(1);
          break;
        }
        case 'specialReady':
          audio.play('special_ready');
          this.fx.ring(lv.players[e.id].x, FLIGHT_Y, lv.players[e.id].z, 4, 0.35, true, 0xffe08a);
          break;
        case 'pickup':
          if (e.kind === 'scrap') {
            audio.play('pickup_scrap', { pan: e.x / HALF_W, vol: e.value > 1 ? 0.85 : 0.6 });
            this.gotScrap(e.id, e.x, e.z, e.value);
          } else if (e.kind === 'ring') {
            audio.play('pickup_scrap', { pan: e.x / HALF_W, pitch: 1.5 });
            this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.3, true, 0xffe08a);
          } else if (e.kind === 'repair') {
            audio.play('heal');
            this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.4, true, 0x8affb0);
            for (let k = 0; k < 10; k++) this.fx.add({ x: e.x + (Math.random() - 0.5) * 2.5, y: FLIGHT_Y + 0.5, z: e.z + (Math.random() - 0.5) * 2, vz: -4 - Math.random() * 4, size: 0.3, grow: 0.2, life: 0.5, color: this.c.setHex(0x8affb0), carried: true });
          } else this.gotPart(e.part, e.x, e.z);
          if (e.kind !== 'scrap') this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, 0xffe08a, 8, 0.25, 0.18);
          break;
        case 'heavy': {
          if (e.fired) {
            audio.play('heavy', { pan: e.x / HALF_W, vol: 0.7 });
            this.shove(0, 1, 0.3);
          } else {
            audio.play('heavy_dry', { pan: e.x / HALF_W });
            this.pop('DRY', e.x, e.z + 2.5, '#8a8098');
          }
          break;
        }
        case 'reload': {
          const pl = lv.players[e.id];
          const g = pl.stats.guns[e.gun];
          audio.play(e.perfect ? 'reload_perfect' : 'reload', { pitch: 0.85 + 0.12 * e.rounds, vol: e.perfect ? 0.8 : 0.45 });
          const x = pl.x + g.x;
          const z = pl.z + g.z + 0.4;
          this.fx.sparks(x, FLIGHT_Y + 0.6, z, e.perfect ? 10 : 3, e.perfect ? 0xffe08a : 0xffd0a0, e.perfect ? 9 : 4, 0.2, 0.12);
          if (e.perfect) {
            this.fx.ring(x, FLIGHT_Y + 0.6, z, 1.6, 0.22, true, 0xffe08a);
            // one word for every gun that took a round
            if (pl.stats.guns.findIndex((q) => q.heavy) === e.gun) this.pop('RELOAD', pl.x, pl.z + 3.2, '#ffd04a');
          }
          break;
        }
        case 'overheat':
          audio.play('overheat');
          this.pop('OVERHEAT', lv.players[e.id].x, lv.players[e.id].z + 2, '#ff8a4a');
          break;
        case 'arc':
          this.bolt(e.points, 0xc8b0ff);
          break;
        case 'flak':
          audio.play('flak_burst', { pan: e.x / HALF_W, vol: 0.5 });
          break;
        case 'telegraph':
          // (a line comes with its laser, and that charges with its own sound)
          if (e.x2 === e.x && e.z2 === e.z) audio.play('laser_charge', { pan: e.x / HALF_W, vol: 0.6 });
          break;
        case 'bossWarning':
          this.bossBanner = { name: e.name, title: e.title, t: 0 };
          audio.play('boss_warning');
          audio.music(bossTrack(lv.spec.planet.id));
          // Khet arrives shouting to the clans
          if (lv.spec.planet.id === 'ashgrave') {
            this.pop('SANKVEN! WATCH THIS!', 0, lv.scroll - 6, '#ffb02a', true);
            audio.play('khet_yell', { pitch: 1.1 });
          }
          break;
        case 'armourBreak': {
          // the armour comes off in plates: it reels, wide open (an elite's gold is the big one;
          // plain plating is steel, and says OPEN: dash through it)
          const en = lv.enemies.find((o) => o.id === e.enemy);
          const elite = !!en?.elite;
          const col = elite ? 0xffd04a : PLATE_HEX;
          this.shards(e.x, e.z, elite ? 16 : 10, col);
          this.fx.ring(e.x, FLIGHT_Y, e.z, (en?.r ?? 2) * 2.4, 0.3, true, col);
          this.fx.add({ x: e.x, y: FLIGHT_Y + 1.2, z: e.z, size: 5, grow: 1.4, life: 0.1, color: HOT, carried: true });
          this.pop(elite ? 'ARMOUR BROKEN' : 'OPEN', e.x, e.z - 3, elite ? '#ffd04a' : '#e8eef8', elite);
          this.trauma = Math.min(1, this.trauma + (elite ? 0.35 : 0.2));
          audio.play('shield_break', { pan: e.x / HALF_W, pitch: 0.6 });
          audio.play('explode_small', { pan: e.x / HALF_W, pitch: 0.7, vol: 0.6 });
          break;
        }
        case 'bossStagger':
          // its poise broken: a white ring and a long moment to hit it
          this.trauma = Math.min(1, this.trauma + 0.5);
          this.flash = 0.35;
          this.flashColor.set(0xffe8a0);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 12, 0.35, true, 0xffffff);
          this.shards(e.x, e.z, 20, 0xffe8a0);
          audio.play('react_shatter', { pan: e.x / HALF_W, pitch: 0.7 });
          audio.play('explode_big', { pan: e.x / HALF_W, vol: 0.6 });
          break;
        case 'phaseClean':
          this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.4, true, 0x9af0b0);
          audio.play('level_clear', { pitch: 1.25, vol: 0.7 });
          break;
        case 'bossPhase': {
          this.trauma = 0.8;
          this.flash = 0.5;
          this.flashColor.set(0xffffff);
          audio.play('explode_big');
          // (ARU-0's theme has a part more: its silence, then called)
          audio.part(e.phase === 3 && lv.spec.planet.id === 'cinder' ? 4 : e.phase);
          if (lv.spec.planet.id === 'cinder' && e.phase === 1) {
            const en = lv.enemies.find((o) => o.boss && !o.dead);
            if (en) this.pop('IN ARREARS', en.x, en.z - 8, '#ffb04a', true);
            audio.play('notice', { pitch: 0.84 });
          }
          if (lv.spec.planet.id === 'glacis') audio.play('engine_wake', { pitch: e.phase >= 2 ? 1.12 : 1 });
          // Istra's crew: a shout as the guns run out; and the tide's hush as they leave her
          if (lv.spec.planet.id === 'vesh') audio.play(e.phase === 1 ? 'crew_ho' : 'tide_turn', { pitch: e.phase === 1 ? 0.9 : 0.8 });
          // what it sheds: the pieces burst off it (Vask's cage), and it says so
          const boss = lv.enemies.find((o) => o.boss && !o.dead);
          const v = boss && this.enemies.get(boss.id);
          const shed = v?.pose?.shedTo(e.phase);
          if (boss && shed?.pieces.length) {
            for (const q of shed.pieces) this.shards(q.x, q.z, 10, q.color);
            this.fx.ring(boss.x, FLIGHT_Y, boss.z, 14, 0.4, true, shed.pieces[0].color);
            if (shed.line) this.pop(shed.line, boss.x, boss.z - 8, '#ffd890', true);
            audio.play('shield_break', { pitch: 0.5 });
          }
          break;
        }
        case 'bossBeat':
          // a boss's move on the beat: a shriek with each ring, a whump with each wing beat
          if (e.move === 'screech') {
            audio.play('shriek', { pan: e.x / HALF_W, pitch: 1 + e.k * 0.06 });
            this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.2, true, 0xfff0d0);
          } else if (e.move === 'gust') {
            audio.play('wingbeat', { pan: e.x / HALF_W });
            this.trauma = Math.min(1, this.trauma + 0.15);
            this.fx.ring(e.x, FLIGHT_Y, e.z + 3, 10, 0.3, true, 0xfff0d0);
          } else if (e.move === 'count') {
            // the Engine's count climbs the scale, a tone a beat; and a low one as it's done
            const up = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17];
            audio.play('toll', { pan: e.x / HALF_W, pitch: e.k < 0 ? 0.5 : 2 ** (up[Math.min(e.k, up.length - 1)] / 12), vol: e.k < 0 ? 0.9 : 0.7 });
            this.fx.ring(e.x, FLIGHT_Y, e.z, e.k < 0 ? 8 : 3, 0.2, true, 0xffd8a0);
          } else if (e.move === 'scan' || e.move === 'cross') audio.play('toll', { pan: e.x / HALF_W, pitch: e.move === 'cross' ? 0.75 : 1.5, vol: 0.6 });
          else if (e.move === 'calve') {
            audio.play('ice_crack', { pan: e.x / HALF_W, pitch: 1 + e.k * 0.15 });
            this.shards(e.x, e.z, 10, 0xbfe8ff);
          } else if (e.move === 'frost') audio.play('frost_breath', { pan: e.x / HALF_W, vol: 0.6 });
          // Istra's: the crew's HO on every iron, a gun on every beat of a broadside, the shell
          // breaking the surface, and the tide turning (all she's thrown, coming home)
          else if (e.move === 'irons') audio.play('crew_ho', { pan: e.x / HALF_W, pitch: 1 + e.k * 0.05 });
          else if (e.move === 'broadside') {
            audio.play('cannon', { pan: e.x / HALF_W });
            this.fx.ring(e.x, FLIGHT_Y, e.z + 3, 4, 0.2, true, 0xfff0d0);
          } else if (e.move === 'breach') {
            audio.play('whale_breach', { pan: e.x / HALF_W });
            this.trauma = Math.min(1, this.trauma + 0.4);
            this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.35, true, 0xe8f8ff);
            this.shards(e.x, e.z, 24, 0xe8f8ff);
          } else if (e.move === 'tide') audio.play('tide_turn', { pan: e.x / HALF_W, vol: 0.8 });
          else if (lv.spec.planet.id === 'cinder') this.aruBeat(e);
          else if (lv.spec.planet.id === 'ashgrave') this.khetBeat(e);
          else if (e.move === 'swell') audio.play('whale_breath', { pan: e.x / HALF_W, pitch: 1.4, vol: 0.5 });
          break;
        case 'biome': {
          // named only as the level starts, not at every biome after
          const b = lv.terrain.segments[e.index]?.biome;
          if (b && !this.biomeBanner) this.biomeBanner = { name: b.name, line: b.line, t: 0 };
          break;
        }
        case 'hazard':
          if (e.kind === 'geyser' || e.kind === 'flare') audio.play('geyser', { pan: e.x / HALF_W, vol: 0.5 });
          break;
        case 'clear':
          audio.play('level_clear');
          if (lv.spec.mode === 'boss') {
            this.flash = 1;
            this.flashColor.set(0xffffff);
            audio.play('explode_boss');
            // and Unbending, through the head's old speaker, the one thing it ever says
            if (lv.spec.planet.id === 'ashgrave') {
              this.pop("NOBODY'S TITAN.", 0, lv.scroll - 6, '#9af4ff', true);
              audio.play('light_tone', { pitch: 0.5, vol: 1 });
            }
          }
          break;
        case 'failed':
          audio.music(null);
          break;
        case 'takedown': {
          // the dash through something reeling: a slash of light, and it's thrown
          this.trauma = Math.min(1, this.trauma + (e.boss ? 0.6 : 0.45));
          this.flash = Math.max(this.flash, 0.3);
          this.flashColor.set(0xfff4d0);
          const p = lv.players[e.id];
          this.bolt([p.x - p.dashX * 6, p.z - p.dashZ * 6, e.x + p.dashX * 4, e.z + p.dashZ * 4], 0xfff4d0);
          this.fx.ring(e.x, FLIGHT_Y, e.z, e.boss ? 12 : 6, 0.3, true, 0xffffff);
          this.shards(e.x, e.z, e.boss ? 22 : 14, 0xffe08a);
          audio.play('react_shatter', { pan: e.x / HALF_W, pitch: 0.8 });
          audio.play('ram', { pan: e.x / HALF_W, pitch: 0.7 });
          audio.duck(0.5);
          break;
        }
        case 'weld': {
          const p = lv.players[e.id];
          if (e.state === 'ready') {
            // full: a ring in the weld's colour and a ping, so you know it's there to spend
            this.fx.ring(p.x, FLIGHT_Y, p.z, 4, 0.3, true, WELD_COLOR);
            audio.play('aux_ready', { pan: p.x / HALF_W, pitch: 0.8 });
          } else if (e.state === 'start') {
            audio.play('hook', { pan: p.x / HALF_W, pitch: 1.4, vol: 0.6 });
          } else if (e.state === 'done') {
            this.fx.ring(p.x, FLIGHT_Y, p.z, 6, 0.35, true, WELD_COLOR);
            this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 24, WELD_COLOR, 18, 0.4, 0.2);
            this.flash = Math.max(this.flash, 0.25);
            this.flashColor.setHex(WELD_COLOR);
            audio.play('heal', { pan: p.x / HALF_W });
          } else {
            // hit in it: the torch sputters out, everything spent
            this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 14, 0x806040, 12, 0.3, 0.2);
            audio.play('overheat', { pan: p.x / HALF_W, pitch: 0.7 });
          }
          break;
        }
        case 'affix': {
          // named now and then, so you learn what it is that just happened (not every time)
          const t = this.affixT.get(e.affix) ?? -9;
          this.fx.ring(e.x, FLIGHT_Y, e.z, e.affix === 'secondwind' ? 10 : 4, 0.3, true, 0x5ef0c8);
          if (e.affix === 'secondwind') {
            this.flash = 0.6;
            this.flashColor.set(0x5ef0c8);
            audio.play('heal', { pitch: 0.7 });
          } else if (e.affix === 'reactive') audio.play('shield_break', { pan: e.x / HALF_W, pitch: 1.4, vol: 0.6 });
          else if (e.affix === 'deflecting') audio.play('parry', { pan: e.x / HALF_W, vol: 0.6 });
          if (lv.time - t > 6 || e.affix === 'secondwind') {
            this.affixT.set(e.affix, lv.time);
            this.pop(`✦ ${AFFIXES[e.affix].name}`, e.x, e.z - 4, AFFIX_COLOR);
          }
          break;
        }
        case 'hot': {
          const name = e.part ? itemName(e.part) : 'PART';
          if (e.state === 'appear') {
            // the danger and the prize, both said up front
            const tier = e.part ? tierOf(e.part) : 'epic';
            this.pop('! VOLATILE !', e.x, e.z + 4, HOT_TEXT, true);
            this.pop(`${tier.toUpperCase()} PART INSIDE`, e.x, e.z + 7, TIER_COLOR[tier]);
            audio.play('risk_up', { pan: e.x / HALF_W, pitch: 0.8 });
            audio.play('alarm', { pan: e.x / HALF_W, vol: 0.4 });
          } else if (e.state === 'on') {
            // taken: it's armed, and the rules are said once
            this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.35, true, HOT_HEX);
            this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 18, HOT_HEX, 14, 0.4, 0.2);
            this.pop('DON\'T GET HIT', e.x, e.z, '#ffd0a0', true);
            audio.play('risk_up', { pitch: 0.6 });
          } else if (e.state === 'bolt') {
            // a bolt gives: it shoots off the lid with a clank
            const z = e.z + 5;
            this.fx.sparks(e.x, FLIGHT_Y + 0.6, z, 14, 0xffd04a, 16, 0.35, 0.2);
            this.fx.ring(e.x, FLIGHT_Y, z, 3, 0.25, true, 0xffd04a);
            this.pop(`BOLT ${e.n}/${HOT_BOLTS}`, e.x, z + 2, '#ffd04a');
            audio.play('hit_armor', { pan: e.x / HALF_W, pitch: 1.2 + (e.n ?? 1) * 0.15 });
            if (e.n === HOT_BOLTS) this.pop('PRISING IT OPEN', e.x, e.z - 6, '#ffd04a', true);
          } else if (e.state === 'open') {
            // cracked open: the part
            this.gotPart(e.part, e.x, e.z);
            this.fx.ring(e.x, FLIGHT_Y, e.z, 10, 0.5, true, 0xffffff);
            // the lid flies off, and the light of what's inside goes up
            const lit = e.part ? TIER_HEX[tierOf(e.part)] : 0xffffff;
            this.fx.ring(e.x, FLIGHT_Y, e.z + 5, 14, 0.7, true, lit);
            this.fx.sparks(e.x, FLIGHT_Y + 1, e.z + 5, 40, lit, 22, 0.6, 0.3);
            this.shards(e.x, e.z + 5, 10, 0xd85020);
            this.flash = 0.35;
            this.flashColor.set(lit);
            audio.play('door', { pan: e.x / HALF_W });
            this.shards(e.x, e.z, 18, HOT_HEX);
          } else if (e.state === 'blown') {
            this.trauma = 1;
            this.flash = 0.7;
            this.flashColor.set(HOT_HEX);
            this.fx.explode(e.x, FLIGHT_Y, e.z, 3, HOT_HEX);
            this.pop(`BLOWN: ${name}`, e.x, e.z - 4, HOT_TEXT, true);
            audio.play('explode_big', { pan: e.x / HALF_W });
            audio.play('risk_lost');
          } else {
            this.pop(`LOST: ${name}`, e.x, e.z - 4, HOT_TEXT, true);
            audio.play('risk_lost');
          }
          break;
        }
        case 'bossRead':
          // it's noticed how you fly: a low note, and it says so under its bar
          this.bossRead = { read: e.read, side: e.side, t: 0 };
          audio.play('horn', { pitch: 0.75, vol: 0.4 });
          break;
        case 'mark':
          this.marked(e.enemy, e.kind, e.x, e.z);
          break;
        case 'jolt': {
          const en = lv.enemies.find((o) => o.id === e.enemy);
          if (en) {
            this.zap(en.x, en.z, en.r, MARK_HEX.shock);
            this.fx.sparks(en.x, en.y + 0.6, en.z, 4, 0xe0d0ff, 9, 0.18, 0.15, !en.ground);
          }
          break;
        }
        case 'reaction':
          if (e.kind === 'shatter') this.shattered.add(e.enemy);
          this.reaction(e.kind, e.x, e.z);
          break;
        case 'freeze':
        case 'thaw':
        case 'douse':
        case 'pin':
        case 'thud':
        case 'cash':
          arsenalEvent(this.arsenalHooks, e);
          break;
        case 'detonate': {
          // the Catalyst: the dasher's colour through it, then what it carried goes up
          const col = LIVERY[e.owner]?.[2] ?? 0xffffff;
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4.5, 0.22, true, col);
          this.fx.add({ x: e.x, y: FLIGHT_Y + 1.2, z: e.z, size: 4, grow: 1.3, life: 0.08, color: HOT, carried: true });
          if (e.bits & BURN) this.fx.explode(e.x, FLIGHT_Y, e.z, 1.2, MARK_HEX.burn, true);
          if (e.bits & CRACK) this.shards(e.x, e.z, 10, 0xffe8a0);
          if (e.bits & SHOCK) this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, MARK_HEX.shock, 20, 0.3, 0.22);
          this.pop('DETONATE', e.x, e.z - 3, '#ffffff');
          this.trauma = Math.min(1, this.trauma + 0.2);
          audio.play('detonate', { pan: e.x / HALF_W });
          break;
        }
        case 'spread': {
          // the marks leap from the kill to its neighbours
          const col = e.bits & BURN ? MARK_HEX.burn : e.bits & SHOCK ? MARK_HEX.shock : MARK_HEX.crack;
          this.bolt([e.x, e.z, e.x2, e.z2], col);
          this.fx.ring(e.x2, FLIGHT_Y, e.z2, 2.5, 0.2, true, col);
          break;
        }
        case 'split':
          this.fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 4, 0xffffff, 16, 0.12, 0.16);
          break;
        case 'haulerHit':
          this.convoy?.hit(e.id, e.x, e.z, e.dmg, e.cause);
          // (a glancing round off the plating is only a tick)
          audio.play('hull_hit', { pan: e.x / HALF_W, vol: e.dmg < 1 ? 0.12 : e.cause === 'boarder' ? 0.3 : 0.45, pitch: (e.dmg < 1 ? 1.4 : 0.9) + Math.random() * 0.2 });
          // nearly gone: say so where it's happening (the hull bar says the rest)
          if (e.hp > 0 && (e.hp + e.dmg > e.max * 0.2) !== (e.hp > e.max * 0.2)) this.warn('HAULER CRITICAL!', e.x, e.z - 4, '#ff6a4a');
          break;
        case 'haulerLost':
          this.convoy?.lose(e.id);
          this.warn(e.left ? 'HAULER LOST' : 'CONVOY LOST', e.x, e.z - 4, '#ff6a4a');
          this.trauma = Math.min(1, this.trauma + 0.7);
          this.flash = Math.max(this.flash, 0.4);
          this.flashColor.set(0xff8a4a);
          this.blast(e.x, FLIGHT_Y, e.z, 4);
          this.shove(0, -1, 1);
          audio.play('hauler_lost', { pan: e.x / HALF_W });
          audio.duck(0.6);
          break;
        case 'boarders':
          this.boardWarn = { side: e.side, t: 0 };
          audio.play('boarders', { pan: e.side * 0.8 });
          break;
        case 'boarded':
          this.convoy?.boarded(e.x, e.z);
          this.trauma = Math.min(1, this.trauma + 0.15);
          audio.play('boarded', { pan: e.x / HALF_W });
          break;
        case 'delivered':
          this.strokes.burst(e.x, e.z, 14, 0x8ad0ff, 10, 0.3, 0.4);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.5, true, 0x8ad0ff);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.3, true, 0xffffff);
          this.fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 24, 0xffe08a, 18, 0.6, 0.3);
          audio.play('horn', { pan: e.x / HALF_W, pitch: 1 + e.id * 0.06 });
          break;
        case 'shotOff':
          if (e.clinging) {
            this.strokes.burst(e.x, e.z, 8, 0x8ad0ff, 5, 0.18, 0.35);
            this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0x8ad0ff);
            audio.play('block', { pan: e.x / HALF_W, pitch: 1.3 });
          }
          break;
        case 'convoyLost':
          break;
        case 'runner':
          this.runner(e);
          break;
        case 'cargo':
          this.cargo(e);
          break;
        case 'armour':
          this.heist?.armour(e.x, e.z);
          if (this.time - this.pinged > 0.07) {
            this.pinged = this.time;
            audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.18, pitch: 1.6 + Math.random() * 0.4 });
          }
          break;
        case 'beam':
        case 'spawn':
          break;
      }
    }
  }

  /** A heist's runner: its parts going, its shield failing, its jump, its end. */
  private runner(e: Extract<LevelEvent, { type: 'runner' }>) {
    const hv = this.heist;
    switch (e.what) {
      case 'engine':
        hv?.engineOut(e.k ?? 0);
        this.pop(e.left ? 'ENGINE OUT! IT SLOWS' : 'BOTH ENGINES OUT!', e.x, e.z - 3, '#ffb04a', true);
        this.trauma = Math.min(1, this.trauma + 0.5);
        this.flash = Math.max(this.flash, 0.25);
        this.flashColor.set(0xffa040);
        audio.play('engine_out', { pan: e.x / HALF_W });
        break;
      case 'turret':
        hv?.turretOut(e.k ?? 0);
        this.strokes.burst(e.x, e.z, 8, 0xffe0b0, 5, 0.18, 0.35);
        break;
      case 'exposed':
        hv?.exposed();
        this.pop('SHIELD DOWN: HIT THE BRIDGE!', e.x, e.z - 6, HEIST_HEX, true);
        audio.play('shield_break', { pan: e.x / HALF_W, vol: 0.9, pitch: 0.8 });
        break;
      case 'spool':
        this.spoolWarn = { t: 0 };
        audio.play('spool', { pan: e.x / HALF_W });
        break;
      case 'jump':
        hv?.jump();
        this.pop(e.left ? `IT JUMPED WITH ${e.left} ABOARD` : 'IT JUMPED: EMPTY!', e.x, Math.max(e.z, this.lv.top + 10), e.left ? '#ff8a7a' : HEIST_HEX, true);
        this.flash = Math.max(this.flash, 0.5);
        this.flashColor.set(0x8af0ff);
        this.trauma = Math.min(1, this.trauma + 0.3);
        this.spoolWarn = null;
        audio.play('jump', { pan: e.x / HALF_W });
        break;
      case 'down':
        hv?.down();
        this.impact(0xffe8b0, 0.08);
        this.punch(1);
        this.strokes.burst(e.x, e.z, 22, 0xffd060, 16, 0.35, 0.6);
        this.trauma = 1;
        this.flash = Math.max(this.flash, 0.35);
        this.flashColor.set(0xffc060);
        this.blast(e.x, FLIGHT_Y, e.z, 8);
        this.spoolWarn = null;
        audio.play('runner_down', { pan: e.x / HALF_W });
        audio.duck(0.8);
        break;
      case 'mine':
        audio.play('bay', { pan: e.x / HALF_W, vol: 0.4 });
        break;
      case 'launch':
        audio.play('bay', { pan: e.x / HALF_W, vol: 0.7, pitch: 0.8 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0xff8a4a);
        break;
    }
  }

  /** A heist's strongboxes: shot loose, caught, or let go. */
  private cargo(e: Extract<LevelEvent, { type: 'cargo' }>) {
    switch (e.what) {
      case 'loose':
        this.heist?.loose(e.id);
        audio.play('pod_loose', { pan: e.x / HALF_W });
        break;
      case 'caught':
        this.heist?.caught(e.id, e.x, e.z);
        this.strokes.burst(e.x, e.z, 10, 0xffd060, 6, 0.22, 0.4);
        this.punch(0.25);
        this.trauma = Math.min(1, this.trauma + 0.15);
        audio.play('pod_catch', { pan: e.x / HALF_W });
        break;
      case 'fell':
        this.heist?.fell(e.id);
        audio.play('pod_fell', { pan: e.x / HALF_W });
        break;
    }
  }

  /** Shoves the camera along (dx, dz), screen-ish: +z is down the screen. */
  shove(dx: number, dz: number, amount: number) {
    const l = Math.hypot(dx, dz) || 1;
    this.kickV.x += (dx / l) * amount * 14;
    this.kickV.y += (dz / l) * amount * 14;
  }

  /** A kill: on top of the sim's explosion, the crunch, a beat of stillness for the bigger ones, and the chain. */
  private kill(x: number, y: number, z: number, r: number) {
    this.chain = this.chainT > 0 ? this.chain + 1 : 0;
    this.chainT = 0.6;
    this.multi = this.multiT > 0 ? this.multi + 1 : 1;
    this.multiT = 0.25;
    // kills piling up: the view leans in a touch more with each
    if (this.multi >= 3) this.punch(Math.min(0.4, 0.08 * this.multi));
    // a burst of hot shards that cools to embers
    for (let k = 0; k < 6 + r * 4; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 14 + Math.random() * 16;
      this.fx.add({ x, y: y + 0.6, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 6, size: 0.3, grow: 0.2, life: 0.25 + Math.random() * 0.25, drag: 4, color: HOT, to: EMBER, carried: true });
    }
    // the chain climbs a pentatonic scale
    const semi = Math.floor(Math.min(this.chain, 14) / 5) * 12 + [0, 2, 4, 7, 9][Math.min(this.chain, 14) % 5];
    audio.play('kill', { pan: x / HALF_W, pitch: Math.pow(2, semi / 12), vol: 0.7 });
  }

  /** A flare of light on the land from a blast, dying away. */
  private blast(x: number, y: number, z: number, size: number) {
    // the dimmest of the pool goes to the new blast
    let b = this.blasts[0];
    for (const o of this.blasts) if (o.power * (1 - o.t / o.life) < b.power * (1 - b.t / b.life)) b = o;
    b.light.position.set(x, y + 3, z);
    b.t = 0;
    b.life = 0.25 + Math.min(0.5, size * 0.12);
    b.power = 10 + size * 9;
    b.carried = y >= FLIGHT_Y - 1;
  }

  /**
   * The rest of a kill, past the sim's fireball: a ball of white heat, fire blooming outward in
   * petals, a second and third blast going off in it, chunks of its own hull flung off, and embers
   * left drifting up.
   */
  private shotDown(x: number, y: number, z: number, size: number, skin: [number, number, number], carried: boolean) {
    const k = Math.sqrt(size);
    this.fx.add({ x, y: y + 1, z, size: 1.2 + size * 1.1, grow: 1.5, life: 0.08, color: HOT, carried });
    for (let i = 0; i < 10 + size * 4; i++) {
      const a = (i / (10 + size * 4)) * Math.PI * 2 + Math.random() * 0.4;
      const v = (9 + Math.random() * 9) * k;
      this.fx.add({ x, y: y + 0.8, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 3, size: 0.9 * k, grow: 2.2, life: 0.3 + Math.random() * 0.2, drag: 6, color: FIRE_PETAL, to: FIRE_DARK, carried });
    }
    for (let i = 0; i < 2 + Math.round(size); i++)
      this.later.push({ t: 0.07 + i * 0.09 + Math.random() * 0.06, x: x + (Math.random() - 0.5) * 2.5 * k, y, z: z + (Math.random() - 0.5) * 2.5 * k, size: 0.35 + Math.random() * 0.3 * size, carried });
    for (let i = 0; i < 5 + size * 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (8 + Math.random() * 12) * k;
      this.fx.add({ x, y: y + 0.5, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 6 + Math.random() * 8, size: 0.25 + Math.random() * 0.35 * k, life: 2.5 + Math.random() * 1.5, color: this.c.setHex(skin[Math.floor(Math.random() * 2)]).multiplyScalar(0.7), solid: true, gravity: 24, spin: 8 + Math.random() * 12 });
    }
    for (let i = 0; i < 6 + size * 3; i++)
      this.fx.add({ x: x + (Math.random() - 0.5) * 3 * k, y: y + 1, z: z + (Math.random() - 0.5) * 3 * k, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, size: 0.14, life: 1 + Math.random(), color: EMBER, to: EMBER_END, carried });
    this.fx.ring(x, y + 0.4, z, size * 4.2, 0.45, carried, 0xffe0a0);
  }

  /** Its hull, charred, tumbling out of the sky (or slumped where it stood), on fire. */
  private wreck(id: number, ev: EnemyView, size: number) {
    this.enemies.delete(id);
    if (ev.ring) this.scene.remove(ev.ring);
    for (const m of ev.inst?.mats ?? []) {
      m.color.multiplyScalar(0.32);
      m.emissive.setHex(0xff5a1a);
      m.emissiveIntensity = 0.7;
    }
    const p = ev.obj.position;
    const a = Math.random() * Math.PI * 2;
    this.wrecks.push({
      obj: ev.obj,
      inst: ev.inst,
      x: p.x,
      y: p.y,
      z: p.z,
      vx: Math.cos(a) * 4,
      vy: ev.ground ? 0 : 3 + Math.random() * 3,
      vz: Math.sin(a) * 3 + 2,
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      spin: (4 + Math.random() * 6) / Math.sqrt(size),
      t: 0,
      ground: ev.ground,
      size,
    });
  }

  private updateWrecks(dt: number, scrollDz: number) {
    for (const b of this.blasts) {
      b.t += dt;
      if (b.carried) b.light.position.z += scrollDz;
      const f = Math.min(1, b.t / b.life);
      b.light.intensity = b.power * (1 - f) * (1 - f);
    }
    for (let i = this.later.length - 1; i >= 0; i--) {
      const l = this.later[i];
      l.t -= dt;
      if (l.carried) l.z += scrollDz;
      if (l.t > 0) continue;
      this.later.splice(i, 1);
      this.fx.explode(l.x, l.y, l.z, l.size, 0xffb040, l.carried);
      this.fx.add({ x: l.x, y: l.y + 1, z: l.z, size: 2 + l.size * 3, grow: 1.3, life: 0.07, color: HOT, carried: l.carried });
      this.blast(l.x, l.y, l.z, l.size);
      this.trauma = Math.min(1, this.trauma + 0.04);
      audio.play('explode_small', { pan: l.x / HALF_W, vol: 0.45, pitch: 1.2 + Math.random() * 0.3 });
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      const embers = Math.max(0, 0.7 - w.t * 0.3);
      for (const m of w.inst?.mats ?? []) m.emissiveIntensity = embers * (0.8 + Math.random() * 0.4);
      let gone = w.t > 5;
      if (!w.ground) {
        w.vy -= 24 * dt;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.z += w.vz * dt;
        w.obj.rotateOnWorldAxis(w.axis, w.spin * dt);
        // a trail of fire and black smoke behind it
        this.fx.add({ x: w.x + (Math.random() - 0.5) * 0.6, y: w.y, z: w.z, vy: 1, size: 0.7 + w.size * 0.3, grow: 0.3, life: 0.2, color: FIRE_PETAL, to: FIRE_DARK });
        if (Math.random() < 0.5) this.fx.add({ x: w.x, y: w.y + 0.3, z: w.z, vy: 1.5, size: 0.45 + w.size * 0.2, grow: 2.6, life: 0.9, color: WRECK_SMOKE, to: WRECK_SMOKE_END, glow: false });
        const g = this.fx.ground(w.x, w.z);
        if (w.y <= g + 0.3) {
          gone = true;
          const wet = this.lv.terrain.water(w.z) > this.lv.terrain.height(w.x, w.z);
          if (wet) {
            // into the water: a column of spray, rings, and steam
            for (let k = 0; k < 14; k++) {
              const a = Math.random() * Math.PI * 2;
              const v = 2 + Math.random() * 4;
              this.fx.add({ x: w.x, y: g + 0.2, z: w.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 8 + Math.random() * 8, gravity: 22, size: 0.35, grow: 1.5, life: 0.9, color: SPLASH, glow: false });
            }
            this.fx.ring(w.x, g + 0.1, w.z, 4 + w.size * 2, 0.7, false, 0xe8f4f8);
            this.fx.ring(w.x, g + 0.1, w.z, 2 + w.size, 0.5, false, 0xffffff);
            this.fx.add({ x: w.x, y: g + 0.5, z: w.z, vy: 2, size: 1.5 + w.size, grow: 3, life: 1.6, color: STEAM, glow: false });
            audio.play('crash', { pan: w.x / HALF_W, vol: 0.35, pitch: 0.7 });
          } else {
            // into the land: a second blast, a scorch, the wreck in bits
            this.fx.explode(w.x, g, w.z, 0.5 + w.size * 0.5, 0xff8a3a, false);
            this.fx.add({ x: w.x, y: g + 0.12, z: w.z, size: 1.8 + w.size, grow: 1.2, life: 6, color: SCORCH, to: SCORCH_END, glow: false });
            this.blast(w.x, g, w.z, w.size);
            this.trauma = Math.min(1, this.trauma + 0.06);
            audio.play('explode_small', { pan: w.x / HALF_W, vol: 0.4, pitch: 0.75 });
          }
        }
      } else if (Math.random() < 0.4) {
        // slumped where it stood, burning down
        this.fx.add({ x: w.x + (Math.random() - 0.5), y: w.y + 0.5, z: w.z, vy: 2, vx: weather.uWindDir.value.x, vz: weather.uWindDir.value.y, size: 0.8 + w.size * 0.3, grow: 3, life: 1.6, color: WRECK_SMOKE, to: SMOKE_END, glow: false });
        if (w.t > 3) w.y -= dt * 0.8;
      }
      w.obj.position.set(w.x, w.y, w.z);
      if (gone) {
        this.scene.remove(w.obj);
        w.inst?.dispose();
        this.wrecks.splice(i, 1);
      }
    }
  }

  /** A mark takes: a puff in its colour, and its sound. */
  private marked(id: number, kind: 'burn' | 'shock' | 'crack', x: number, z: number) {
    const en = this.lv.enemies.find((o) => o.id === id);
    const y = en ? en.y + 0.6 : FLIGHT_Y;
    const carried = !en?.ground;
    const col = MARK_HEX[kind];
    if (kind === 'burn') {
      for (let k = 0; k < 6; k++)
        this.fx.add({ x: x + (Math.random() - 0.5) * 1.5, y, z, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 4, vy: 4 + Math.random() * 3, size: 0.6, grow: 1.6, life: 0.35, color: FIRE_PETAL, to: FIRE_DARK, carried });
    } else if (kind === 'shock') this.zap(x, z, en?.r ?? 1, col);
    else this.shards(x, z, 5, col);
    this.fx.ring(x, y, z, 2.2, 0.16, carried, col);
    audio.play(`mark_${kind}`, { pan: x / HALF_W, vol: 0.5 });
  }

  /** Little bolts crawling over a shocked thing. */
  private zap(x: number, z: number, r: number, col: number) {
    for (let k = 0; k < 2; k++) {
      const a = Math.random() * Math.PI * 2;
      const b = a + 1 + Math.random() * 2;
      this.bolt([x + Math.cos(a) * r, z + Math.sin(a) * r * 0.8, x + Math.cos(b) * r * 0.8, z + Math.sin(b) * r * 0.7], col);
    }
  }

  /** Glassy flakes of armour flung off and tumbling down. */
  private shards(x: number, z: number, n: number, col: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 6 + Math.random() * 12;
      this.fx.add({ x, y: FLIGHT_Y + 0.6, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.7, vy: 4 + Math.random() * 6, size: 0.18 + Math.random() * 0.2, life: 1.2 + Math.random() * 0.6, color: this.c.setHex(Math.random() < 0.5 ? col : 0xffffff), solid: true, gravity: 26, spin: 12 + Math.random() * 10 });
    }
  }

  /** Two marks meet: each reaction its own spectacle, and its name called (big, the first time). */
  private reaction(kind: 'overload' | 'cookoff' | 'shatter', x: number, z: number) {
    const def = REACTIONS.find((r) => r.kind === kind)!;
    const col = REACTION_HEX[kind];
    const first = !this.reacted.has(kind);
    this.reacted.add(kind);
    this.pop(`${def.name}!`, x, z - 4, REACTION_COLOR[kind], first);
    if (kind === 'overload') {
      // a white-hot core, rings of both its colours, sparks of fire and lightning
      this.fx.add({ x, y: FLIGHT_Y + 1.2, z, size: 5, grow: 1.4, life: 0.1, color: HOT, carried: true });
      this.fx.ring(x, FLIGHT_Y, z, 7, 0.3, true, MARK_HEX.shock);
      this.fx.ring(x, FLIGHT_Y, z, 4.5, 0.22, true, MARK_HEX.burn);
      this.fx.sparks(x, FLIGHT_Y + 0.5, z, 16, MARK_HEX.shock, 24, 0.35, 0.24);
      this.fx.sparks(x, FLIGHT_Y + 0.5, z, 10, 0xffc070, 18, 0.3, 0.2);
      this.zap(x, z, 2.2, col);
      this.zap(x, z, 3, MARK_HEX.shock);
      this.flash = Math.max(this.flash, 0.18);
      this.flashColor.setHex(col);
      audio.play('react_overload', { pan: x / HALF_W });
    } else if (kind === 'cookoff') {
      // it goes up: a fireball, petals of fire out to where the blast reaches, the land lit
      this.fx.explode(x, FLIGHT_Y, z, 2.4, 0xff8a2a, true);
      this.fx.add({ x, y: FLIGHT_Y + 1.5, z, size: 9, grow: 1.3, life: 0.1, color: HOT, carried: true });
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * Math.PI * 2 + Math.random() * 0.3;
        const v = 16 + Math.random() * 8;
        this.fx.add({ x, y: FLIGHT_Y + 0.8, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 3, size: 1.1, grow: 2, life: 0.32, drag: 5, color: FIRE_PETAL, to: FIRE_DARK, carried: true });
      }
      this.fx.ring(x, FLIGHT_Y, z, 10, 0.35, true, col);
      this.blast(x, FLIGHT_Y, z, 3);
      this.trauma = Math.min(1, this.trauma + 0.35);
      this.shove(0, -1, 0.5);
      audio.play('react_cookoff', { pan: x / HALF_W });
    } else {
      // a crack of white: everything stops, glass flies, it reels
      this.fx.add({ x, y: FLIGHT_Y + 1.2, z, size: 6, grow: 0.6, life: 0.07, color: HOT, carried: true });
      this.fx.ring(x, FLIGHT_Y, z, 6, 0.18, true, 0xffffff);
      this.fx.ring(x, FLIGHT_Y, z, 3.5, 0.3, true, col);
      this.shards(x, z, 22, col);
      this.fx.sparks(x, FLIGHT_Y + 0.5, z, 12, 0xffffff, 26, 0.25, 0.2);
      this.flash = Math.max(this.flash, 0.3);
      this.flashColor.setHex(col);
      this.trauma = Math.min(1, this.trauma + 0.3);
      audio.play('react_shatter', { pan: x / HALF_W });
    }
    if (first) audio.duck(0.3);
  }

  /**
   * A gun's edge came off: a pink-white star where it struck, and now and then the edge's name,
   * so you learn what each gun wants (each name at most every so often, or they'd drown).
   */
  private edgeHit(edge: Edge, x: number, z: number, y: number) {
    this.fx.add({ x, y: y + 0.9, z, size: 2.4, grow: 0.25, life: 0.07, color: EDGE_HOT, carried: true });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      this.fx.add({ x, y: y + 0.9, z, vx: Math.cos(a) * 16, vz: Math.sin(a) * 16, size: 0.3, grow: 0.2, life: 0.12, drag: 10, color: EDGE_GLOW, carried: true });
    }
    const last = this.edgeSaid.get(edge) ?? -9;
    if (this.time - last > 1.6) {
      this.edgeSaid.set(edge, this.time);
      this.pop(EDGES[edge].pop, x, z + 2.2, EDGE_COLOR);
    }
  }

  /** Scrap in: a flash and a ring where it was, the ship's tally up, and a mote for the HUD to fly to the tin. */
  private gotScrap(id: number, x: number, z: number, v: number) {
    const big = v > 1;
    this.fx.sparks(x, FLIGHT_Y + 0.5, z, big ? 12 : 6, 0xffe08a, big ? 12 : 9, 0.28, 0.24);
    this.fx.sparks(x, FLIGHT_Y + 0.5, z, big ? 4 : 2, 0xffffff, 14, 0.15, 0.2);
    this.fx.ring(x, FLIGHT_Y, z, big ? 2.6 : 1.6, 0.2, true, 0xffe08a);
    if (this.scrapGot.length < 80) this.scrapGot.push({ x, z, v, id });
    // (no running count over the ship: the motes flying to the tin are the count)
  }

  /**
   * Words over the field, kept few: each kind of thing is named the first time it happens in a
   * level (so you learn what it was), and after that the look and sound of it have to say it.
   * (Counts and numbers don't make it a new kind: FRENZY 2 is FRENZY 1 again.)
   */
  pop(text: string, x: number, z: number, color: string, big = false) {
    const kind = text.replace(/[×x]?\d+/g, '#');
    if (this.said.has(kind)) return;
    this.said.add(kind);
    this.pops.push({ text, x, z, t: 0, color, big });
  }

  /** Something you must know right now (a hauler about to go): said every time. */
  private warn(text: string, x: number, z: number, color: string) {
    this.pops.push({ text, x, z, t: 0, color, big: true });
  }

  /**
   * An impact frame: for a blink the picture flips to paper and ink, the way a blow lands in a
   * painting. Only for the moments that matter (a takedown, your hull hit), and never
   * two close together.
   */
  private impact(color: THREE.ColorRepresentation = 0xffffff, time = 0.05) {
    if (this.time - this.impactAt < 0.45) return;
    this.impactAt = this.time;
    this.impactT = Math.max(this.impactT, time);
    this.impactColor.set(color);
  }

  /** The view punches in a touch (0..1 of a small amount), and springs back. */
  private punch(amount: number) {
    this.punchV -= amount * 2.2;
  }

  /** Something struck is shaken locally while the fight keeps moving. */
  private shiver(id: number, amount: number) {
    const ev = this.enemies.get(id);
    if (ev) ev.shiver = Math.max(ev.shiver ?? 0, amount);
  }

  /**
   * How a blow feels, on top of what each event already does: strike lines, the struck thing
   * shuddering locally, the view punching in, an impact frame for the few moments that
   * should stop your heart. No words: it has to look like what happened.
   */
  private feel(e: LevelEvent) {
    const lv = this.lv;
    switch (e.type) {
      case 'hit': {
        if (e.armour || e.dot) break;
        const en = lv.enemies.find((o) => o.id === e.enemy);
        const r = en?.r ?? 1;
        if (e.kill) {
          // the killing blow: ink splashed out all round it
          this.strokes.burst(e.x, e.z, 7 + Math.round(r * 2), 0xfff0d0, 3 + r * 2.6, 0.2, 0.4);
          this.shiver(e.enemy, 1);
          break;
        }
        const heavy = e.dmg >= 10 || e.crit;
        if (!heavy) break;
        this.shiver(e.enemy, e.crit ? 1 : 0.6);
        // thrown on the way the shot was going (up the screen), and a crit's star where it bit
        this.strokes.burst(e.x, e.z + r * 0.3, e.crit ? 6 : 3, e.crit ? 0xffffff : 0xffe0b0, 2 + r * 1.4, 0.12, 0.3, -Math.PI / 2);
        if (e.crit) {
          this.strokes.star(e.x, e.z + r * 0.3, 2.2 + r * 0.6, 0xffffff, 0.16);
          this.punch(0.12);
        }
        break;
      }
      case 'reflect':
        // it threw your shot back: it shudders, a star where it turned, the view punches
        this.shiver(e.enemy, 0.6);
        this.strokes.star(e.x, e.z, 2.6, 0xffffff, 0.18);
        this.strokes.burst(e.x, e.z, 4, 0xffffff, 3, 0.12, 0.25, Math.atan2(Math.cos(e.a), Math.sin(e.a)));
        this.punch(0.1);
        break;
      case 'shotLand':
        // a heavy round into the land throws a little ink
        if (e.heavy && !e.bounce) this.strokes.burst(e.x, e.z, 3, 0xffe0b0, 2.4, 0.12, 0.25, Math.PI / 2);
        break;
      case 'guard': {
        // a shot off a shield: two short glints skating off its face
        const en = lv.enemies.find((o) => o.id === e.enemy);
        const out = en ? Math.atan2(e.z - en.z, e.x - en.x) : -Math.PI / 2;
        if (Math.random() < 0.5) this.strokes.burst(e.x, e.z, 2, 0xd8f4ff, 2.2, 0.08, 0.16, out);
        break;
      }
      case 'crack':
        // a shield broken: it stops, shudders, and the cells go in a ring of light
        this.shiver(e.enemy, 1.2);
        this.punch(0.25);
        this.strokes.burst(e.x, e.z, 12, 0xd8f0ff, 7, 0.2, 0.4);
        this.flash = Math.max(this.flash, 0.15);
        this.flashColor.set(0xc8e8ff);
        break;
      case 'armourBreak': {
        const elite = !!lv.enemies.find((o) => o.id === e.enemy)?.elite;
        this.shiver(e.enemy, 1.4);
        this.punch(elite ? 0.45 : 0.25);
        this.strokes.burst(e.x, e.z, elite ? 14 : 9, elite ? 0xffd860 : 0xe8eef8, elite ? 9 : 6, 0.22, 0.45);
        if (elite) this.impact(0xfff0c0);
        break;
      }
      case 'exposed':
        if (e.stagger) {
          this.shiver(e.enemy, 1);
          this.strokes.star(e.x, e.z, 3.5, 0xffe08a, 0.3);
        }
        break;
      case 'bossStagger':
        this.impact(0xfff0c8, 0.07);
        this.punch(0.7);
        this.shiver(e.enemy, 2);
        this.strokes.burst(e.x, e.z, 20, 0xffe8a0, 16, 0.3, 0.6);
        this.strokes.star(e.x, e.z, 7, 0xffffff, 0.4);
        break;
      case 'bossPhase':
        this.impact(0xffffff, 0.07);
        this.punch(0.6);
        break;
      case 'takedown': {
        // the dash through it: a slash along the line it took, the frame in ink, the view in close
        const p = lv.players[e.id];
        this.impact(0xfff4d0, e.boss ? 0.08 : 0.06);
        this.punch(e.boss ? 1 : 0.75);
        this.shiver(e.enemy, 2);
        this.strokes.slash(e.x - p.dashX * 9, e.z - p.dashZ * 9, e.x + p.dashX * 7, e.z + p.dashZ * 7, 0xfff4d0, 1.1, 0.3);
        this.strokes.burst(e.x, e.z, e.boss ? 20 : 12, 0xffffff, e.boss ? 14 : 8, 0.22, 0.45, Math.atan2(p.dashZ, p.dashX));
        break;
      }
      case 'kill':
        // killed with a verb (through a dash, while it reeled, by its own fire): a gold splash
        if (e.dash || e.exposed || e.reflect) {
          this.strokes.burst(e.x, e.z, 10, 0xffe08a, 7, 0.24, 0.45);
          this.punch(0.2);
        }
        break;
      case 'explode':
        if (e.size >= 3) this.punch(0.3);
        break;
      case 'reaction':
        this.strokes.burst(e.x, e.z, 12, REACTION_HEX[e.kind], 8, 0.22, 0.45);
        this.punch(e.kind === 'shatter' ? 0.35 : 0.2);
        if (e.kind === 'shatter') this.shiver(e.enemy, 1.5);
        break;
      case 'playerHit': {
        const p = lv.players[e.id];
        if (e.shield) {
          // the shield takes it: hex light shatters off, the colours jar, the frame goes cold
          this.impact(0xc8f0ff, 0.04);
          this.aberr = Math.max(this.aberr, 0.6);
          this.punch(0.3);
          this.strokes.burst(p.x, p.z, 10, LIVERY[e.id][2], 6, 0.2, 0.35);
        } else if (e.tier === 'graze') {
          this.aberr = Math.max(this.aberr, 0.45);
          this.strokes.burst(p.x, p.z, 4, 0xff8a6a, 4, 0.14, 0.3);
        } else {
          // the hull hit: the frame to ink on blood, colours torn apart, the view in on you
          const heavy = e.tier === 'heavy';
          this.impact(0xffb0a0, heavy ? 0.07 : 0.05);
          this.aberr = 1;
          this.punch(heavy ? 0.8 : 0.5);
          this.strokes.burst(p.x, p.z, heavy ? 14 : 9, 0xff5a3a, heavy ? 9 : 6, 0.22, 0.45, Math.atan2(p.z - e.z, p.x - e.x));
        }
        break;
      }
      case 'down':
        this.impact(0xff9a80, 0.1);
        this.aberr = 1;
        this.punch(1);
        break;
      case 'crashed':
        this.impact(0xffb080, 0.14);
        this.aberr = 1;
        this.punch(1);
        break;
      case 'jumpstart':
        this.impact(0xd0ffe0, 0.08);
        this.aberr = Math.max(this.aberr, 0.5);
        this.punch(0.7);
        break;
      case 'parry':
        // Keep the clang around this ship, without a full-screen impact or camera punch.
        this.strokes.burst(e.x, e.z, 14 + Math.min(8, e.count * 2), 0xffffff, 9, 0.22, 0.4);
        this.strokes.star(e.x, e.z - 1, 4, 0xffffff, 0.25);
        break;
      case 'perfect':
        // through it by a hair: the view leans in on the ship, lines of its colour streaming off
        if (e.how !== 'parry') this.punch(0.4);
        this.strokes.burst(e.x, e.z, 10, LIVERY[e.id][2], 7, 0.3, 0.35);
        this.strokes.star(e.x, e.z, 3, 0xffffff, 0.3);
        break;
      case 'block':
        this.strokes.burst(e.x, e.z - 1, 3 + Math.min(4, e.count), 0xc8c0d8, 3.5, 0.12, 0.25, -Math.PI / 2);
        break;
      case 'dash':
        // the air it tore: streaks trailing back along the way it went
        this.strokes.burst(e.x, e.z, 4, LIVERY[e.id][2], 5, 0.16, 0.25, Math.atan2(-e.dz, -e.dx));
        break;
      case 'special':
        this.punch(0.6);
        this.aberr = Math.max(this.aberr, 0.5);
        break;
      case 'clear':
        if (lv.spec.mode === 'boss') {
          this.impact(0xffffff, 0.12);
          this.punch(1);
        }
        break;
    }
  }

  private bolt(points: number[], color: number) {
    // a jagged line through the points, each leg its own thin box
    for (let i = 0; i + 3 < points.length; i += 2) {
      const ax = points[i];
      const az = points[i + 1];
      const bx = points[i + 2];
      const bz = points[i + 3];
      const n = 4;
      let px = ax;
      let pz = az;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const jx = k === n ? 0 : (Math.random() - 0.5) * 1.6;
        const jz = k === n ? 0 : (Math.random() - 0.5) * 1.6;
        const qx = lerp(ax, bx, f) + jx;
        const qz = lerp(az, bz, f) + jz;
        const len = Math.hypot(qx - px, qz - pz);
        const mesh = part(GEO.box, flat(k % 2 ? color : 0xffffff), [(px + qx) / 2, FLIGHT_Y + 0.7, (pz + qz) / 2], [0.22, 0.1, len], [0, Math.atan2(qx - px, qz - pz), 0]);
        mesh.renderOrder = 26;
        this.scene.add(mesh);
        this.bolts.push({ mesh, t: 0 });
        px = qx;
        pz = qz;
      }
      this.fx.sparks(bx, FLIGHT_Y + 0.5, bz, 4, color, 10, 0.2, 0.2);
    }
  }

  // --- drawing -----------------------------------------------------------------------------

  /** Fits the camera to a window of this shape: all of the field shows, and more land round it if there's room. */
  fit(aspect: number) {
    // (a strip of margin below the field, so a ship hard against the bottom isn't cut by the screen's edge)
    if (aspect > FIELD_W / (FIELD_H + MARGIN)) {
      this.halfH = (FIELD_H + MARGIN) / 2;
      this.halfW = this.halfH * aspect;
    } else {
      this.halfW = FIELD_W / 2;
      this.halfH = this.halfW / aspect;
    }
    this.halfW *= this.zoom * (1 + this.punchZ);
    this.halfH *= this.zoom * (1 + this.punchZ);
    const c = this.camera;
    c.left = -this.halfW;
    c.right = this.halfW;
    c.top = this.halfH;
    c.bottom = -this.halfH;
    c.updateProjectionMatrix();
  }

  /**
   * What must still read with the world greyed out (the art direction's test, for `just look`):
   * the ships, the foes, their fire and tells, the hazards, the pickups, and the wall lips (anything
   * tagged `userData.lip`).
   */
  /** Enemy fire (for `just look --stats`: the frame without it, and so each bullet's ground). */
  fire(): THREE.Object3D {
    return this.bullets.group;
  }

  readers(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [this.fire(), this.threats.group, this.hazards.group, ...this.laserMeshes, ...this.plates, this.shots, this.shotArt.group];
    for (const s of this.ships) if (s) out.push(s.root);
    for (const b of this.balls) out.push(b.ball, ...b.links);
    for (const e of this.enemies.values()) out.push(e.obj, ...(e.ring ? [e.ring] : []), ...(e.tow ? [e.tow] : []));
    for (const p of this.pickups.values()) out.push(p.obj, ...(p.beacon ? [p.beacon] : []));
    this.scene.traverse((o) => void (o.userData.lip && out.push(o)));
    return out;
  }

  /** How many of the place's ambient specks (ash, spores, rain…) are up, and its low clouds. */
  airCount() {
    return { ambient: this.air.length, clouds: this.clouds.length };
  }

  update(dt: number) {
    const lv = this.lv;
    this.time += dt;
    tickWeather(dt);
    const scrollDz = lv.scroll - this.lastScroll;
    this.lastScroll = lv.scroll;
    // what the tilted camera sees of the ground, plus a margin to build ahead
    const reach = this.halfH / Math.cos(TILT);
    this.world.update(lv.scroll - reach - 30, lv.scroll + reach + 18, dt);
    this.world.emit(this.fx, dt, lv.scroll - reach - 6, lv.scroll + reach + 6);
    this.lighting(dt);
    this.updateShips(dt);
    // whatever is over a ship thins away round it, and round the foes nearest the ships
    const see = weather.uSee.value;
    let k = 0;
    for (const p of lv.players) if (k < see.length && !p.down) see[k++].set(p.x, p.z, 5.5, 1);
    const near = lv.enemies
      .filter((e) => !e.dead && e.z > lv.top - 4)
      .map((e) => ({ e, d: Math.min(...lv.players.map((p) => Math.hypot(p.x - e.x, p.z - e.z))) }))
      .sort((a, b) => a.d - b.d);
    for (const { e } of near) if (k < see.length) see[k++].set(e.x, toFlight(e.z, e.y), Math.max(3.5, e.r * 2.2), 0.85);
    for (; k < see.length; k++) see[k].w = 0;
    this.updateEnemies(dt);
    this.updateWrecks(dt, scrollDz);
    this.convoy?.update(dt, scrollDz);
    this.heist?.update(dt, scrollDz);
    if (this.spoolWarn) this.spoolWarn.t += dt;
    if (this.missionBanner) this.missionBanner.t += dt;
    if (this.boardWarn && (this.boardWarn.t += dt) > 3.2) this.boardWarn = null;
    this.updateBullets();
    this.updateShots();
    this.updateBeams();
    this.updateLasers();
    this.updateBalls();
    this.updatePlates(dt);
    this.updatePickups(dt);
    this.updateDecoys();
    this.traits.update(dt, scrollDz);
    this.grafts.update(dt, scrollDz);
    this.core.update(dt);
    this.jumps.update(dt);
    for (let k = 0; k < 2; k++) this.relight[k] = Math.max(0, this.relight[k] - dt * 1.4);
    this.threats.update(dt, lv, this.halfW, this.halfH);
    this.shields.update(dt, lv);
    this.guards.update(dt, lv, (id) => LIVERY[id][2]);
    for (let k = 0; k < 2; k++) {
      this.dryT[k] += dt;
      this.whiffT[k] += dt;
      this.perfectT[k] += dt;
    }
    this.hazards.update(dt);
    this.ambient(dt);
    this.updateClouds(dt);
    this.near.update(dt, this.halfW, lv.top, lv.bottom, lv.players);
    this.life.update(dt, lv, this.halfW);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t += dt;
      b.mesh.position.z += scrollDz;
      if (b.t > 0.09) {
        this.scene.remove(b.mesh);
        this.bolts.splice(i, 1);
      }
    }
    this.fx.update(dt, this.eye, scrollDz);
    this.strokes.update(dt, scrollDz);
    for (const p of this.pops) {
      p.t += dt;
      p.z += scrollDz - dt * 3;
    }
    this.pops = this.pops.filter((p) => p.t < (p.big ? 1.6 : 0.9));
    if (this.biomeBanner) this.biomeBanner.t += dt;
    if (this.bossBanner) this.bossBanner.t += dt;
    if (this.bossRead) this.bossRead.t += dt;
    // juice decays
    this.chainT -= dt;
    this.multiT -= dt;
    // the camera's shove: a stiff spring back to the middle
    this.kickV.x += (-this.kick.x * 220 - this.kickV.x * 22) * dt;
    this.kickV.y += (-this.kick.y * 220 - this.kickV.y * 22) * dt;
    this.kick.x += this.kickV.x * dt;
    this.kick.y += this.kickV.y * dt;
    for (let i = 0; i < this.recoil.length; i++) this.recoil[i] = Math.max(0, this.recoil[i] - dt * 4);
    this.speed(dt, scrollDz);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.impactT = Math.max(0, this.impactT - dt);
    this.aberr = Math.max(0, this.aberr - dt * 3.5);
    // the punch-in: a stiff spring, so it snaps in and settles back
    this.punchV += (-this.punchZ * 260 - this.punchV * 24) * dt;
    this.punchZ = clamp(this.punchZ + this.punchV * dt, -0.12, 0.05);
    this.placeCamera(dt);
    audio.intensity(clamp(0.35 + lv.enemies.length * 0.03 + lv.bullets.length * 0.004 + (lv.state === 'boss' ? 0.4 : 0), 0, 1));
    // the lowest hull still flying, under three tenths of full: the mix closes in
    const hull = Math.min(1, ...lv.players.filter((p) => !p.down).map((p) => p.hp / p.stats.hp));
    audio.danger(clamp(1 - hull / 0.3, 0, 1));
  }

  /** Boosting: the view pulls back, the edges smear, streaks rush past, the air roars. */
  private speed(dt: number, scrollDz: number) {
    const lv = this.lv;
    const boost = Math.max(0, ...lv.players.map((p) => (p.down ? 0 : p.boosting)));
    const fast = clamp((lv.speedNow / Math.max(1, lv.speed) - 1) / 1.2, 0, 1);
    this.speedFx = damp(this.speedFx, Math.max(boost * 0.7, fast), 6, dt);
    this.zoom = damp(this.zoom, (1 + this.speedFx * 0.06) * DEV_ZOOM, 3, dt);
    audio.loop('wind', 'all', this.speedFx > 0.05, this.speedFx);
    audio.loop('engine', 'p1', true, 0.3 + boost * 0.7);
    let n = 0;
    for (const l of this.lineData) {
      l.z += (l.v + scrollDz / Math.max(dt, 1e-4)) * dt;
      if (l.z > lv.scroll + this.halfH * 1.6) {
        if (this.speedFx < 0.1 || Math.random() > this.speedFx) {
          l.z = 1e9;
          continue;
        }
        l.x = (Math.random() * 2 - 1) * this.halfW;
        l.y = FLIGHT_Y + 4;
        l.z = lv.scroll - this.halfH * 1.6 - Math.random() * 20;
        l.v = 60 + Math.random() * 60;
        l.len = 4 + Math.random() * 10;
      }
      if (l.z > 1e8) continue;
      // brighter at the edges of the screen, where the smear is
      const edge = Math.min(1, Math.abs(l.x) / this.halfW);
      this.m.compose(this.v.set(l.x, l.y, l.z), this.q.identity(), this.s.set(0.12, 1, l.len * (0.5 + this.speedFx)));
      this.lines.setMatrixAt(n, this.m);
      this.lines.setColorAt(n, this.c.setHex(0xffffff).multiplyScalar(this.speedFx * (0.3 + edge * 0.7)));
      n++;
    }
    this.lines.count = n;
    this.lines.instanceMatrix.needsUpdate = true;
    if (this.lines.instanceColor) this.lines.instanceColor.needsUpdate = true;
  }

  /** The camera that shows the level: the tilted one over the field. */
  get eye(): THREE.OrthographicCamera {
    return this.camera;
  }

  private placeCamera(dt: number) {
    const lv = this.lv;
    // (the pixel renderer snaps the camera to whole art pixels and slides the picture by the rest)
    const t = this.time;
    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(t * 61) + Math.sin(t * 37) * 0.5) * shake * 0.9;
    const sz = (Math.cos(t * 53) + Math.sin(t * 29) * 0.5) * shake * 0.9;
    const target = this.v.set(sx + this.kick.x, FLIGHT_Y, lv.scroll + sz + this.kick.y + MARGIN / 2 / Math.cos(TILT));
    // (zoomed in to look closely: the view follows the first ship, looking ahead of it)
    if (DEV_ZOOM < 1 && lv.players[0]) target.set(lv.players[0].x + sx, FLIGHT_Y, lv.players[0].z - 22 * DEV_ZOOM + sz);
    this.camera.position.set(target.x, target.y + Math.cos(TILT) * 120, target.z + Math.sin(TILT) * 120);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    weather.uView.value.set(target.x, target.z);
    // the sun (and its shadows) follow the view
    this.sun.target.position.set(0, 0, lv.scroll);
    this.sun.position.set(-30, 60, lv.scroll + 25);
    this.sun.target.updateMatrixWorld();
  }

  private lighting(dt: number) {
    const t = this.lv.terrain;
    const bl = t.blend(this.lv.scroll);
    const a = t.segments[bl.a].biome;
    const b = t.segments[bl.b].biome;
    const k = bl.t;
    const mix = (x: number, y: number) => this.c.setHex(x).lerp(new THREE.Color(y), k);
    this.sun.color.copy(mix(a.sun, b.sun));
    this.hemi.color.copy(mix(a.sky, b.sky));
    this.hemi.groundColor.copy(mix(a.bounce, b.bounce));
    this.world.lerpWater(a, b, k);
    this.world.setSun(this.sun.position.clone().sub(this.sun.target.position));
    // the weather: windier where there's sand, snow or rain blowing; cloudier where there are clouds
    const windy = (bi: Biome) => (bi.particles === 'sand' || bi.particles === 'snow' || bi.particles === 'rain' ? 0.85 : bi.particles === 'ash' ? 0.55 : 0.35);
    const cloudy = (bi: Biome) => (bi.clouds !== null ? 0.6 : 0.3) + (bi.particles === 'rain' ? 0.3 : 0);
    weather.uWind.value = lerp(windy(a), windy(b), k);
    weather.uCloud.value = lerp(cloudy(a), cloudy(b), k);
    this.scene.background = mix(a.ground[0], b.ground[0]).clone().multiplyScalar(0.5);
    const idx = k < 0.5 ? bl.a : bl.b;
    if (idx !== this.biomeIdx) {
      this.biomeIdx = idx;
      audio.ambience(t.segments[idx].biome.id);
    }
    void dt;
  }

  /** Grade for the post pass, from the biome. */
  grade(pixel: PixelRenderer) {
    const t = this.lv.terrain;
    const bl = t.blend(this.lv.scroll);
    const a = t.segments[bl.a].biome;
    const b = t.segments[bl.b].biome;
    const u = pixel.uniforms;
    u.uShade.value.setHex(a.shade).lerp(new THREE.Color(b.shade), bl.t);
    u.uLight.value.setHex(a.light).lerp(new THREE.Color(b.light), bl.t);
    u.uFlash.value.set(this.flashColor.r, this.flashColor.g, this.flashColor.b, this.flash);
    // under a quarter of the hull: the edges beat red with the heart, faster the lower it goes
    const hull = Math.min(1, ...this.lv.players.filter((p) => !p.down).map((p) => p.hp / p.stats.hp));
    const low = clamp(1 - hull / 0.25, 0, 1);
    const beat = low > 0 ? Math.pow(Math.max(0, Math.sin(this.time * (5 + low * 3))), 6) * (0.15 + low * 0.25) : 0;
    u.uHurt.value = Math.max(this.hurt, beat);
    u.uSpeed.value = this.speedFx;
    u.uImpact.value = this.impactT > 0 ? 1 : 0;
    u.uImpactColor.value.copy(this.impactColor);
    u.uAberr.value = this.aberr * this.aberr;
    u.uTime.value = this.time;
    const hot = (bi: Biome) => (bi.waterGlow && bi.waterGlow >= 1 ? 0.6 : 0);
    u.uHeat.value = lerp(hot(a), hot(b), bl.t);
    // the ground under the lane calmed (the camera sits 120 off the flight plane, which is further
    // off up the picture than down it)
    u.uLane.value = 1;
    u.uPlane.value.set(120 + this.camera.bottom * Math.tan(TILT), 120 + this.camera.top * Math.tan(TILT));
  }

  /**
   * A volatile crate in tow: a hazard-orange safe hanging under the ship on a short cable. Its bolts
   * pop off one by one, the lid creeps up after the last, and the light of what's inside leaks out
   * of the seam, brighter as it goes.
   */
  private updateSafe(p: Player, i: number) {
    let sf = this.safes[i];
    if (!p.crate || p.down) {
      if (sf) {
        this.scene.remove(sf.root);
        this.safes[i] = undefined;
      }
      return;
    }
    const tier = tierOf(p.crate);
    if (!sf) {
      const root = new THREE.Group();
      const box = new THREE.Group();
      box.add(part(GEO.box, toon(HOT_HEX, { glow: 0.3 }), [0, 0, 0], [1.4, 0.9, 1.1]));
      box.add(part(GEO.box, toon(0x1a1014), [-0.45, 0, 0], [0.18, 0.95, 1.15]), part(GEO.box, toon(0x1a1014), [0.45, 0, 0], [0.18, 0.95, 1.15]));
      // the light inside: a line of it at the seam, the whole of it once the lid lifts
      const glow = part(GEO.box, flat(new THREE.Color(TIER_HEX[tier]).lerp(new THREE.Color(0xffffff), 0.35)), [0, 0.45, 0], [1.2, 0.04, 0.9]);
      const seam = part(GEO.box, flat(TIER_HEX[tier]), [0, 0.48, 0.57], [1.3, 0.05, 0.05]);
      box.add(glow, seam);
      // the lid, hinged at its far edge so it tips back towards the camera and shows what's
      // inside, its underside lit by it
      const lid = new THREE.Group();
      lid.position.set(0, 0.47, -0.55);
      lid.add(part(GEO.box, toon(0xd85020), [0, 0.07, 0.55], [1.45, 0.14, 1.15]), part(GEO.box, flat(TIER_HEX[tier]), [0, -0.01, 0.55], [1.2, 0.02, 0.95]));
      box.add(lid);
      // the bolts along its near edge
      const bolts: THREE.Mesh[] = [];
      for (let k = 0; k < HOT_BOLTS; k++) {
        const b = part(GEO.box, toon(0xffd04a, { glow: 0.5 }), [(k - (HOT_BOLTS - 1) / 2) * 0.42, 0.18, 0.95], [0.3, 0.2, 0.3]);
        bolts.push(b);
        lid.add(b);
      }
      // the cable up to the ship
      root.add(part(GEO.box, toon(0x2a2230), [0, 0.3, -1.3], [0.08, 0.08, 2.4]), box);
      root.scale.setScalar(1.9);
      this.scene.add(root);
      sf = this.safes[i] = { root, box, lid, bolts, glow, seam };
    }
    const c = clamp(p.crack, 0, 1);
    const last = HOT_BOLTS / (HOT_BOLTS + 1);
    sf.root.position.set(p.x, FLIGHT_Y, p.z + 5);
    // it swings behind the ship
    sf.box.position.y = Math.sin(this.time * 2.3 + i) * 0.1;
    sf.box.rotation.z = clamp(p.vx / 40, -0.4, 0.4);
    sf.bolts.forEach((b, n) => (b.visible = c < (n + 1) / (HOT_BOLTS + 1)));
    // the lid: it gives a little with each bolt, then once the last is gone it's prised wide
    const open = c < last ? 0 : (c - last) / (1 - last);
    const given = sf.bolts.filter((b) => !b.visible).length;
    sf.lid.rotation.x = -(given * 0.07 + open * 1.1 + (open > 0 ? Math.sin(this.time * 30) * 0.04 : 0));
    sf.seam.visible = c > 0.05 && (open > 0 || Math.sin(this.time * (3 + c * 10)) > -0.3);
    // what's inside spills out of the seam
    if (Math.random() < 0.05 + c * 0.25 + open * 0.5) this.fx.sparks(p.x + (Math.random() - 0.5) * 2.4, FLIGHT_Y + 0.4, p.z + 4, 1, TIER_HEX[tier], 3 + open * 6, 0.35, 0.2);
  }

  private updateShips(dt: number) {
    const lv = this.lv;
    lv.players.forEach((p, i) => {
      const ship = this.ships[i];
      if (!ship) return;
      ship.update(dt);
      const r = ship.root;
      const blink = p.inv > 0 && !p.down && p.dashT <= 0 && Math.floor(p.inv * 16) % 2 === 0;
      r.visible = !p.out && (!blink || p.phase > 0);
      r.position.set(p.x, FLIGHT_Y + (p.down ? -1.5 : 0), p.z);
      // dashing, it's drawn out along the way it's going, and snaps back
      this.stretch[i] = damp(this.stretch[i] ?? 0, p.dashT > 0 && !p.down ? 1 : 0, p.dashT > 0 ? 30 : 14, dt);
      const st = this.stretch[i];
      const ax = Math.abs(p.dashX);
      const az = Math.abs(p.dashZ);
      r.scale.set(1 + st * (0.4 * ax - 0.15 * az), 1 - st * 0.12, 1 + st * (0.4 * az - 0.15 * ax));
      // lean into turns, nose down when pushing forward
      this.banks[i] = damp(this.banks[i], clamp(-p.vx / 22, -0.6, 0.6), 12, dt);
      ship.body.rotation.z = this.banks[i] + (p.down ? Math.sin(this.time * 3) * 0.3 + 0.5 : 0);
      ship.body.rotation.x = clamp(-p.vz / 60, -0.25, 0.25) + (p.down ? 0.2 : 0);
      ship.body.position.y = Math.sin(this.time * 2.3 + i) * 0.12;
      ship.body.position.z = this.recoil[i] ?? 0;
      // engines burn hotter going forward
      // (and roar, a moment, as a jumpstart catches)
      const push = (clamp(1 - p.vz / p.stats.speed, 0.3, 2) + p.boosting * 1.6 + this.relight[i] * 2.5) * (p.down ? 0 : 1);
      for (const f of ship.flames) {
        const fl = 0.8 + Math.random() * 0.4;
        f.scale.set(0.45 * fl, (0.6 + push * 0.6) * fl, 0.45 * fl);
      }
      ship.core.visible = false;
      const hb = this.hitboxes[i];
      if (hb) {
        hb.visible = p.focus && !p.down;
        hb.position.set(p.x, FLIGHT_Y + 1.2, fromFlight(p.z, FLIGHT_Y + 1.2));
        hb.quaternion.copy(this.eye.quaternion);
      }
      this.updateSafe(p, i);
      ship.shield.visible = p.shield > 0 && !p.down;
      ship.flash(p.inv > 1.2 ? 1 : p.phase > 0 ? 0.5 : 0);
      if (p.phase > 0) r.visible = Math.floor(this.time * 20) % 3 !== 0;
      // a down ship smokes; a partner jumpstarting it gets a ring
      if (p.down && !p.out && Math.random() < 0.3) this.fx.add({ x: p.x, y: FLIGHT_Y, z: p.z, vy: 3, vz: 4, size: 0.8, grow: 2.5, life: 1, color: new THREE.Color(0x4a4040), to: new THREE.Color(0x2a2228), carried: true });
      if (p.down && p.jump > 0 && Math.random() < 0.5) this.fx.sparks(p.x, FLIGHT_Y, p.z, 2, 0x8affb0, 6, 0.3, 0.2);
      // welding: a torch's sparks spitting off the hull
      if (p.weldT >= WELD.hold && !p.down) {
        if (Math.random() < 0.7) this.fx.sparks(p.x + (Math.random() - 0.5) * 1.6, FLIGHT_Y + 0.6, p.z + (Math.random() - 0.5) * 1.6, 2, WELD_COLOR, 10, 0.25, 0.12);
        if (Math.random() < 0.15) audio.play('hit_armor', { pan: p.x / HALF_W, vol: 0.15, pitch: 1.6 + Math.random() * 0.4 });
      }
      // (the parry's window shows as the guard itself: see Guards)
      // the siphon: a purple whirl pulling in
      if (p.auxT > 0 && p.stats.aux === 'siphon' && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.fx.add({ x: p.x + Math.cos(a) * 7, y: FLIGHT_Y + 0.5, z: p.z + Math.sin(a) * 7, vx: -Math.cos(a) * 24 - Math.sin(a) * 10, vz: -Math.sin(a) * 24 + Math.cos(a) * 10, size: 0.3, grow: 0.2, life: 0.28, color: SIPHON, carried: true });
      }
      // a dash-strike: the guns flare white as they fire out of the dash
      if (p.strike > 0 && p.firing && !p.down)
        for (const g of p.stats.guns) if (Math.random() < 0.5) this.fx.add({ x: p.x + g.x, y: FLIGHT_Y + 0.8, z: p.z + g.z - 0.6, size: 1.1, grow: 0.3, life: 0.05, color: STRIKE_GLOW, carried: true });
      // the riposte: the guns flare gold as they fire, and gold motes come off the hull
      if (p.riposte > 0 && !p.down) {
        if (p.firing) for (const g of p.stats.guns) if (Math.random() < 0.6) this.fx.add({ x: p.x + g.x, y: FLIGHT_Y + 0.8, z: p.z + g.z - 0.6, size: 1.3, grow: 0.4, life: 0.06, color: RIPOSTE_GLOW, carried: true });
        if (Math.random() < 0.5) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x: p.x + Math.cos(a) * 1.6, y: FLIGHT_Y + 0.6, z: p.z + Math.sin(a) * 1.6, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3 + 4, size: 0.25, grow: 0.1, life: 0.3, color: RIPOSTE_GLOW, carried: true });
        }
      }
      // the dash's slip: a ghost left where it started, which is where fire has to land for a perfect
      if (p.slip > 0) this.fx.add({ x: p.slipX, y: FLIGHT_Y + 0.5, z: lv.scroll + p.slipZ, size: 2.2, grow: 0.6, life: 0.06, color: this.c.setHex(LIVERY[i][2]).multiplyScalar(0.8), carried: true });
      // trail
      if (!p.down && Math.random() < 0.6)
        for (const f of ship.flames) {
          f.getWorldPosition(this.v);
          this.fx.add({ x: this.v.x + (Math.random() - 0.5) * 0.2, y: this.v.y, z: this.v.z + 0.5, vz: 6, size: 0.35, grow: 0.2, life: 0.18, color: new THREE.Color(LIVERY[i][2]), to: new THREE.Color(0x6a3a2a) });
        }
      // beams and flame sounds
      const beaming = p.beam.some((b) => b > 0);
      audio.loop('beam', `p${i}`, beaming, 0.7);
      audio.loop('flame', `p${i}`, p.firing && p.stats.guns.some((g) => g.spec.shot === 'flame' && g.part.id !== 'frost') && !p.down, 0.6);
      audio.loop('frost', `p${i}`, p.firing && p.stats.guns.some((g) => g.part.id === 'frost') && !p.down, 0.7);
      // a flame gun throws fire (a frost sprayer, cold mist)
      if (p.firing && !p.down)
        p.stats.guns.forEach((g, k) => {
          if (g.spec.shot !== 'flame' || p.jam[k] > 0) return;
          if (g.part.id === 'frost') return this.looks.spray(p, g);
          for (let n = 0; n < 2; n++) {
            const a = g.dir + (Math.random() - 0.5) * 0.4;
            this.fx.add({ x: p.x + g.x, y: FLIGHT_Y + 0.4, z: p.z + g.z, vx: Math.sin(a) * 30, vz: -Math.cos(a) * 30, size: 0.4, grow: 3, life: 0.26, drag: 3, color: new THREE.Color(0xfff0a0), to: new THREE.Color(g.spec.tint ?? 0xd0301a), carried: true });
          }
        });
    });
  }

  private updateEnemies(dt: number) {
    const lv = this.lv;
    const alive = new Set<number>();
    // the loudest truck about sets the motor's note
    let rpm = -1;
    for (const e of lv.enemies) {
      if (e.t < 0) continue;
      alive.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        v = this.makeEnemy(e);
        this.enemies.set(e.id, v);
      }
      if (v.fold) this.fold(e, v.fold, dt);
      // frozen solid, it doesn't so much as twitch
      if (!(e.ax && e.ax.frozen > 0) && !v.car) v.inst?.update(dt);
      const groundZ = e.ground ? fromFlight(e.z, e.y) : e.z;
      const bob = e.ground || (e.ax && e.ax.frozen > 0) ? 0 : Math.sin(this.time * 3 + e.id) * 0.15;
      v.punch = Math.max(0, v.punch - dt * 7);
      v.knock = Math.max(0, v.knock - dt * 6);
      v.obj.position.set(e.x, e.y + bob, groundZ - v.knock * 1.3);
      if (v.shiver) {
        // A local shudder settles while the fight keeps moving.
        v.obj.position.x += (Math.floor(this.time * 60) % 2 ? 1 : -1) * v.shiver * 0.35;
        v.shiver = Math.max(0, v.shiver - dt * 4);
      }
      // reeling, open to a takedown: a glint keeps catching on it
      if (e.state === 'stagger' && Math.random() < dt * 6) this.strokes.star(e.x + (Math.random() - 0.5) * e.r, groundZ + (Math.random() - 0.5) * e.r * 0.6, 1.6 + e.r * 0.5, 0xffe08a, 0.22, e.y + 1.2);
      const foe = (FOES as Record<string, { scale: number } | undefined>)[e.arch];
      const base = (e.elite ? 1.3 : 1) * (foe?.scale ?? 1);
      v.obj.scale.set(base * (1 + v.punch * 0.22), base * (1 - v.punch * 0.15), base * (1 - v.punch * 0.12));
      const facing = e.boss ? 0 : e.heading + Math.PI;
      if (v.head && (e.arch === 'turret' || e.arch === 'spindle')) {
        v.head.rotation.y = e.heading + Math.PI;
        v.obj.rotation.y = 0;
      } else if (v.head) {
        // a gun on a hull (a truck's bed, a boat's foredeck): the hull faces its way, the gun yours
        v.obj.rotation.y = facing;
        v.head.rotation.y = e.aim - e.heading;
      } else v.obj.rotation.y = facing;
      if (!e.ground && !e.boss) v.obj.rotation.z = clamp(-e.vx / 30, -0.5, 0.5);
      if (e.boss) v.pose?.update(e, dt, v.obj);
      // the tell on the body: it heats up through the windup and flickers at the end; open to
      // punishment, it pulses; underground, it's gone; rolling, it spins
      v.obj.visible = e.state !== 'hidden' && !e.boss?.under;
      // (a boss under fire only glints: it's lit by hits all fight, and its tells must show)
      let glow = e.flash > 0 ? (e.boss ? 0.25 : 1) : e.stun > 0 ? 0.3 * (Math.floor(this.time * 10) % 2) : 0;
      if (e.state === 'windup' && e.stateDur > 0) {
        const k = clamp(e.stateT / e.stateDur, 0, 1);
        glow = Math.max(glow, k > 0.8 ? (Math.floor(this.time * 24) % 2 ? 0.9 : 0.3) : k * 0.5);
      } else if (e.taken > 1.05) glow = Math.max(glow, 0.25 + 0.2 * Math.sin(this.time * 14));
      v.inst?.flash(glow);
      if (e.ax) this.looks.body(v.inst, v.obj, e, dt, glow > 0);
      if (e.state === 'dodge') v.obj.rotation.z = e.stateT * 18;
      if (v.car) {
        // (it squats on its springs for the windup instead of shrinking)
        if (!(e.ax && e.ax.frozen > 0)) v.car.update(e, v.obj, groundZ, base, lv.terrain, this.fx, dt);
        if (Math.abs(e.x) < HALF_W + 4 && Math.abs(e.z - lv.scroll) < HALF_H + 4) rpm = Math.max(rpm, v.car.rpm);
      } else if (e.state === 'windup' && e.stateDur > 0) {
        // a wind-up crouch: it draws back before it goes
        const k = clamp(e.stateT / e.stateDur, 0, 1);
        v.obj.scale.multiplyScalar(1 - 0.08 * k);
      }
      // a burrower lays itself out along its arch out of the ground
      if (v.worm) v.obj.visible = v.worm.update(e, v.obj, base, v.punch, lv.nearest(e.x, e.z), this.fx, this.fx.ground, (k) => (this.trauma = Math.min(1, this.trauma + k)), dt);
      if (e.shielded && e.boss) v.inst?.flash(0.25 + 0.2 * Math.sin(this.time * 20));
      if (v.ring) {
        v.ring.position.set(e.x, e.y - 0.4, groundZ);
        v.ring.rotation.z += dt * 2;
      }
      if (v.held !== undefined) this.strongbox(e, v);
      if (v.tow) this.towLine(e, v);
      this.trail(e, groundZ);
      // marked: on fire, crawling with lightning, glinting through its cracks
      const mk = e.mk;
      const lift = e.y + 0.4;
      if (mk.burn > 0 && Math.random() < 0.25 + 0.25 * mk.stacks) {
        const r = e.r * 0.7;
        this.fx.add({ x: e.x + (Math.random() - 0.5) * r * 2, y: lift + Math.random() * 0.5, z: groundZ + (Math.random() - 0.5) * r, vy: 3 + Math.random() * 2, vz: -1.5, size: 0.45 + 0.15 * mk.stacks, grow: 1.4, life: 0.3 + Math.random() * 0.15, color: FIRE_PETAL, to: FIRE_DARK, carried: !e.ground });
        if (Math.random() < 0.2) this.fx.add({ x: e.x, y: lift + 0.8, z: groundZ, vy: 2.5, vz: 2, size: 0.5, grow: 2.4, life: 0.7, color: HIT_SMOKE, to: SMOKE_END, glow: false, carried: !e.ground });
      }
      if (mk.shock > 0 && Math.random() < 0.12) this.zap(e.x, e.z, e.r * 0.9, MARK_HEX.shock);
      if (mk.crack > 0 && Math.random() < 0.18)
        this.fx.add({ x: e.x + (Math.random() - 0.5) * e.r * 1.4, y: lift + 0.4, z: groundZ + (Math.random() - 0.5) * e.r, size: 0.35, grow: 0.2, life: 0.12, color: CRACK_GLINT, carried: !e.ground });
      if (e.ax) arsenalLook(this.fx, e, lift, groundZ);
      // the hurt crackle with sparks, and the badly hurt smoke
      if (e.hp < e.max * 0.6 && Math.random() < (e.boss ? 0.3 : 0.06)) this.fx.sparks(e.x + (Math.random() - 0.5) * e.r, e.y + 0.6, groundZ, 2, 0xffd890, 8, 0.2, 0.14, !e.ground);
      // smoke from the badly hurt
      if (e.hp < e.max * 0.35 && Math.random() < (e.boss ? 0.5 : 0.15))
        this.fx.add({ x: e.x + (Math.random() - 0.5) * e.r, y: e.y + 0.5, z: groundZ, vy: 2, vz: 3, size: 0.6, grow: 2, life: 0.8, color: new THREE.Color(0x3a3030), carried: !e.ground });
    }
    audio.loop('truck', 'foes', rpm >= 0, rpm);
    for (const [id, v] of this.enemies)
      if (!alive.has(id)) {
        if (v.worm && v.worm.u > 0.2) v.worm.burst(this.fx, v.skin[2]);
        this.scene.remove(v.obj);
        if (v.ring) this.scene.remove(v.ring);
        if (v.tow) this.scene.remove(v.tow);
        v.inst?.dispose();
        this.enemies.delete(id);
      }
  }

  /** A strongbox: a line snapping as each of its tugs goes down, and a tumble once it's cut loose. */
  private strongbox(e: Enemy, v: EnemyView) {
    const held = this.lv.enemies.filter((o) => o.arch === 'tug' && o.d.host === e.id && !o.dead).length;
    if (held < v.held!) {
      // a line snaps: a crack of light where it was hooked on, and the box jolts
      this.fx.sparks(e.x, e.y + 0.8, e.z, 12, e.skin.colors[2], 16, 0.3, 0.2);
      this.strokes.burst(e.x, e.z, 7, e.skin.colors[2], 4.5, 0.18, 0.3);
      v.punch = 1;
      audio.play('hook_snap', { pan: e.x / HALF_W });
      if (!held) this.pop('IT DROPS!', e.x, e.z - 3, '#8af0e0');
    }
    v.held = held;
    if (e.d.fall !== undefined) {
      v.loose = true;
      v.obj.rotation.z = e.d.fall * 5;
      v.obj.rotation.x = e.d.fall * 2;
    }
  }

  /** A tug's tow line, from it to its strongbox (gone when the box is). */
  private towLine(e: Enemy, v: EnemyView) {
    const tow = v.tow!;
    const bv = e.d.host !== undefined ? this.enemies.get(e.d.host) : undefined;
    tow.visible = !!bv && !bv.loose && this.lv.enemies.some((o) => o.id === e.d.host && !o.dead);
    if (!tow.visible || !bv) return;
    const a = v.obj.position;
    TOW_D.subVectors(bv.obj.position, a);
    const len = TOW_D.length();
    tow.position.copy(a).addScaledVector(TOW_D, 0.5);
    tow.quaternion.setFromUnitVectors(Y, TOW_D.normalize());
    // it hums: a flicker down its length
    const w = 1 + 0.35 * Math.sin(this.time * 31 + e.id);
    tow.scale.set(w, len, w);
  }

  /**
   * What a body leaves as it goes: a truck's dust, a boat's wake, an airship's smoke; and Istra
   * drawing her breath, the air streaming in to her intake.
   */
  private trail(e: Enemy, groundZ: number) {
    // (a truck's dust is its rig's)
    if (e.arch === 'gunboat' && Math.random() < 0.5) {
      const back = e.heading + Math.PI;
      for (const sd of [-1, 1]) {
        const a = back + sd * 0.5;
        this.fx.add({ x: e.x + Math.sin(back) * 2.6, y: e.y + 0.05, z: groundZ + Math.cos(back) * 2.6, vx: Math.sin(a) * 2.5, vz: Math.cos(a) * 2.5, size: 0.5, grow: 1.6, life: 1.1, color: FOAM, to: FOAM_END, glow: false });
      }
    } else if (e.arch === 'blimp' && Math.random() < 0.12) {
      this.fx.add({ x: e.x + (Math.random() - 0.5) * 3, y: e.y + 0.6, z: groundZ - 3.5, vy: 1, vz: -2, size: 0.7, grow: 2, life: 1.2, color: HIT_SMOKE, to: SMOKE_END, glow: false, carried: true });
    } else if (e.boss?.under) {
      // Istra under the sea: foam boiling up where she is
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 4;
        this.fx.add({ x: e.x + Math.sin(a) * r, y: FLIGHT_Y - 4, z: e.z + Math.cos(a) * r, vy: 3, size: 0.6, grow: 1.6, life: 0.7, color: FOAM, to: FOAM_END, glow: false, carried: true });
      }
    } else if (e.boss?.move === 'breath' && e.state === 'attack') {
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 18;
        this.fx.add({ x: e.x + Math.sin(a) * r, y: FLIGHT_Y + 0.6, z: e.z + Math.cos(a) * r, vx: -Math.sin(a) * r * 1.6, vz: -Math.cos(a) * r * 1.6, size: 0.18, grow: 1.5, life: 0.55, color: BREATH, carried: true });
      }
    }
  }

  /** A crane's wrecking ball: dark iron and spikes on a chain from the boss, a shadow under it. */
  private updateBalls() {
    let k = 0;
    for (const s of this.lv.strikes) {
      if (s.kind !== 'ball' || s.dead) continue;
      const o = this.lv.enemies.find((e) => e.id === s.owner);
      if (!o) continue;
      let b = this.balls[k];
      if (!b) {
        const ball = new THREE.Group();
        ball.add(part(GEO.dodeca, toon(0x3a3640), [0, 0, 0], 4.2));
        ball.add(part(GEO.sphere, toon(0x6a5a50), [0, 0.9, 0], 2.4));
        for (let n = 0; n < 12; n++) {
          const a = (n / 12) * Math.PI * 2;
          const up = n % 2 ? 0.6 : -0.4;
          ball.add(part(GEO.cone4, toon(0x9a8a7a), [Math.cos(a) * 2, up, Math.sin(a) * 2], [0.7, 1.4, 0.7], [Math.PI / 2, 0, -a + Math.PI / 2]));
        }
        ball.add(part(GEO.sphere, toon(0xff6a2a, { glow: 1 }), [0, 1.9, 0], 0.9));
        const links: THREE.Mesh[] = [];
        for (let n = 0; n < 14; n++) {
          const l = part(GEO.torus, toon(0x5a5258), [0, 0, 0], 1.3);
          links.push(l);
          this.scene.add(l);
        }
        ball.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
        this.scene.add(ball);
        b = { ball, links };
        this.balls.push(b);
      }
      b.ball.visible = true;
      b.ball.position.set(s.x, FLIGHT_Y, s.z);
      b.ball.rotation.y += 0.05;
      b.ball.rotation.z = s.vx * 0.01;
      // the chain sags a little between the boss and the ball
      b.links.forEach((l, n) => {
        const f = (n + 0.5) / b!.links.length;
        l.visible = true;
        l.position.set(o.x + (s.x - o.x) * f, FLIGHT_Y + 1.2 - Math.sin(f * Math.PI) * 0.8, o.z + (s.z - o.z) * f);
        l.rotation.set(n % 2 ? Math.PI / 2 : 0, Math.atan2(s.x - o.x, s.z - o.z), 0);
      });
      if (Math.abs(s.vx) > 8 && Math.random() < 0.5) this.fx.sparks(s.x, FLIGHT_Y, s.z, 1, 0xffd890, 6, 0.25, 0.15);
      k++;
    }
    for (; k < this.balls.length; k++) {
      this.balls[k].ball.visible = false;
      for (const l of this.balls[k].links) l.visible = false;
    }
  }

  /**
   * ARU-0's beats: claws on the beat as it chases, the overtake, its lines reeling and snapping,
   * plates bolted on and torn off, ballast at the edge and home; its nineteen seconds, and the toll
   * when it's called.
   */
  private aruBeat(e: { move: string; k: number; x: number; z: number }) {
    const lv = this.lv;
    const boss = lv.enemies.find((o) => o.boss && !o.dead);
    const v = boss && this.enemies.get(boss.id);
    const pan = e.x / HALF_W;
    switch (e.move) {
      case 'pursuit':
        audio.play('claw', { pan, pitch: 1 + e.k * 0.05 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.2, true, 0xffd8a0);
        break;
      case 'overtake':
        audio.play('notice');
        audio.play('dash', { pitch: 0.5, vol: 0.8 });
        if (boss) this.pop('ACCOUNT OPEN', 0, lv.scroll - 4, '#ffb04a', true);
        break;
      case 'reel':
        audio.play('winch', { pan });
        break;
      case 'lien':
        // a scrap home: bolted on as a plate
        audio.play('plate_on', { pan, pitch: 0.9 + e.k * 0.04 });
        this.fx.sparks(e.x, FLIGHT_Y + 1, e.z, 10, PLATE_HEX, 12, 0.3, 0.2);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.2, true, PLATE_HEX);
        if (v) v.punch = 0.6;
        if (e.k === 1 && boss) this.pop('PLATED', boss.x, boss.z - 7, '#c8d4e8');
        break;
      case 'snap':
        // taken from under its line: the line goes slack
        audio.play('hook_snap', { pan, pitch: 1.2 });
        this.strokes.burst(e.x, e.z, 6, 0xffb04a, 4, 0.16, 0.3);
        this.pop('RECLAIMED', e.x, e.z - 2, '#ffd890');
        break;
      case 'ballast':
        audio.play('dash', { pan, pitch: 0.45 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.2, true, 0xffffff);
        break;
      case 'bounce':
        audio.play('clang', { pan });
        this.trauma = Math.min(1, this.trauma + 0.25);
        this.fx.sparks(e.x, FLIGHT_Y, e.z, 14, 0xffd890, 14, 0.3, 0.2);
        break;
      case 'catch':
        audio.play('plate_on', { pan, pitch: 0.7 });
        break;
      case 'tear': {
        // a plate of company hull, torn away: it's lighter, and barer
        const torn = v?.pose?.plateTo(e.k);
        for (const q of torn ?? []) this.shards(q.x, q.z, 12, q.color);
        this.trauma = Math.min(1, this.trauma + 0.3);
        break;
      }
      case 'hush':
        // its nineteen seconds: only a clock
        audio.play('clock_tick', { pan, pitch: 0.7, vol: 0.5 });
        break;
      case 'called': {
        this.trauma = 0.7;
        this.flash = 0.45;
        this.flashColor.set(0x9af4ff);
        audio.play('toll', { pitch: 0.42, vol: 1 });
        audio.play('engine_wake', { pitch: 1.2 });
        audio.part(3);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 16, 0.5, true, 0x9af4ff);
        const shed = v?.pose?.shedTo(3);
        for (const q of shed?.pieces ?? []) this.shards(q.x, q.z, 10, q.color);
        this.pop('IT HAS BEEN CALLED', e.x, e.z - 8, '#9af4ff', true);
        break;
      }
    }
  }

  /**
   * Khet's tells: his own moves (his scrap: the ram, the leap, the eye, his gangs) he shouts for, and
   * a thruster lights or the titan's joints groan; the light's own (the Glassing, the Kneel, the
   * Measure) come with its even tone and nothing else.
   */
  private khetWindup(en: Enemy) {
    const b = en.boss!;
    const pan = en.x / HALF_W;
    if (b.look === 'lattice') {
      const pitch = b.move === 'kneel' ? 0.75 : b.move === 'measure' ? 1 + b.k * 0.12 : 1.12;
      audio.play('light_tone', { pan, pitch });
      if (b.move === 'kneel') audio.play('titan_servo', { pan, pitch: 0.8 });
      this.fx.ring(en.x, FLIGHT_Y, en.z, 5, 0.3, true, TELL_COLOR.lattice);
      return;
    }
    if (b.k === 0 && b.move !== 'eye') audio.play('khet_yell', { pan, pitch: b.move === 'leap' ? 1.12 : b.move === 'summon' ? 0.9 : 1 });
    if (b.move === 'ram' || b.move === 'leap') {
      // a junk thruster lights behind it, both sides
      audio.play('thruster', { pan, pitch: b.move === 'leap' ? 0.8 : 1 });
      for (const s of [-1, 1]) {
        this.fx.explode(en.x + s * 4, FLIGHT_Y, en.z + 3, 0.7, 0xff7a2a, true);
        this.fx.sparks(en.x + s * 4, FLIGHT_Y, en.z + 3, 8, 0xffb02a, 10, 0.4, 0.25);
      }
    } else audio.play('titan_servo', { pan, pitch: b.move === 'eye' ? 0.9 : 1.1 });
  }

  /**
   * Khet's beats: the retro-burn stopping a ram, the titan landing, the light drawing its plan and
   * its lances, the Measure; the light overruling him (and him shouting at it), and deciding.
   */
  private khetBeat(e: { move: string; k: number; x: number; z: number }) {
    const lv = this.lv;
    const boss = lv.enemies.find((o) => o.boss && !o.dead);
    const v = boss && this.enemies.get(boss.id);
    const pan = e.x / HALF_W;
    const light = TELL_COLOR.lattice;
    switch (e.move) {
      case 'retro':
        audio.play('thruster', { pan, pitch: 1.3, vol: 0.9 });
        this.fx.explode(e.x, FLIGHT_Y, e.z, 1.4, 0xff7a2a, true);
        this.fx.sparks(e.x, FLIGHT_Y, e.z, 16, 0xffb02a, 16, 0.4, 0.3);
        this.trauma = Math.min(1, this.trauma + 0.25);
        break;
      case 'land':
        audio.play('titan_land', { pan });
        this.trauma = Math.min(1, this.trauma + 0.55);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.3, true, 0xfff0d0);
        this.fx.explode(e.x, FLIGHT_Y - 1, e.z, 2.4, 0xff7a2a, true);
        this.shards(e.x, e.z, 22, 0x9a6a4a);
        if (v) v.punch = 1;
        break;
      case 'plot':
        // the plan drawn out, a circle at a time
        if (e.k % 2 === 0) audio.play('light_tone', { pan, pitch: 1.5 + (e.k % 6) * 0.06, vol: 0.5 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 2, 0.25, true, light);
        break;
      case 'lance':
        audio.play('laser_charge', { pan, pitch: 1.25, vol: 0.5 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.2, true, light);
        break;
      case 'rise':
        audio.play('titan_servo', { pan, pitch: 1.15 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.3, true, light);
        break;
      case 'measure':
        audio.play('laser_fire', { pan, pitch: 0.8, vol: 0.6 });
        this.trauma = Math.min(1, this.trauma + 0.1);
        break;
      case 'defy':
        // the light takes the move off him mid-shout; he's furious about it
        audio.play('light_tone', { pan, pitch: 0.5, vol: 1 });
        audio.play('khet_yell', { pan, pitch: 1.3 });
        this.flash = 0.25;
        this.flashColor.set(light);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 10, 0.3, true, light);
        this.pop("IT ISN'T LISTENING", 0, lv.scroll - 4, '#9af4ff', true);
        break;
      case 'decided': {
        // the light has had enough of him: the junk comes off, and it stands up straight
        this.trauma = 0.8;
        this.flash = 0.5;
        this.flashColor.set(light);
        audio.play('light_tone', { pitch: 0.5, vol: 1 });
        audio.play('toll', { pitch: 0.42, vol: 0.9 });
        audio.play('titan_servo', { pitch: 0.7 });
        this.fx.ring(e.x, FLIGHT_Y, e.z, 18, 0.5, true, light);
        this.shards(e.x, e.z, 30, 0x9a6a4a);
        this.pop('IT HAS DECIDED', 0, lv.scroll - 4, '#9af4ff', true);
        break;
      }
    }
  }

  /** ARU-0's ballast: a plate of white company hull with Vantorr's three steps on it, spinning flat down its lane. */
  private updatePlates(dt: number) {
    let k = 0;
    for (const s of this.lv.strikes) {
      if (s.kind !== 'plate' || s.dead) continue;
      let g = this.plates[k];
      if (!g) {
        g = new THREE.Group();
        g.add(part(GEO.box, toon(0xe8e8e0), [0, 0, 0], [3.4, 0.35, 2.4]));
        g.add(part(GEO.box, toon(0x8a8a84), [0, -0.12, 0], [3.6, 0.2, 2.6]));
        // the company's sign: a terrace in three steps, orange on white
        for (let n = 0; n < 3; n++) g.add(part(GEO.box, toon(0xd08a3a), [-0.9 + n * 0.6, 0.2, 0.55 - n * 0.45], [0.6 + (2 - n) * 0.6, 0.12, 0.38]));
        g.add(part(GEO.box, toon(0xff3a3a, { glow: 1 }), [1.4, 0.22, -0.95], [0.3, 0.12, 0.3]));
        g.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = true) : 0));
        this.scene.add(g);
        this.plates.push(g);
      }
      g.visible = true;
      g.position.set(s.x, FLIGHT_Y + 0.3, s.z);
      g.rotation.y += dt * 11;
      g.rotation.z = Math.sin(this.time * 7 + k) * 0.15;
      if (Math.random() < 0.35) this.fx.sparks(s.x, FLIGHT_Y, s.z, 1, 0xffd890, 8, 0.2, 0.12, true);
      k++;
    }
    for (; k < this.plates.length; k++) this.plates[k].visible = false;
  }

  private makeEnemy(e: Enemy): EnemyView {
    // a runner's part: the heist view draws it, on the runner
    if (e.d.qp !== undefined) return { inst: null, obj: new THREE.Group(), head: null, ring: null, seen: true, boss: false, ground: false, skin: e.skin.colors, punch: 0, knock: 0, part: true };
    const foe = (FOES as Record<string, { model: string; scale: number } | undefined>)[e.arch];
    let inst: Instance | null;
    if (e.boss) inst = library.clone(`boss_${this.lv.spec.planet.id}`, 0, e.skin.colors, true) ?? cloneEnemy(e.skin, e.arch);
    else if (e.arch === 'serpent') {
      const head = e.d.leader === undefined;
      const tail = !head && !this.lv.enemies.some((o) => o.d.leader === e.d.leader && (o.d.index ?? 0) > (e.d.index ?? 0));
      inst = cloneEnemy(e.skin, 'serpent', head ? 'head' : tail ? 'tail' : 'body');
    } else inst = cloneEnemy(e.skin, foe?.model ?? e.arch);
    let obj: THREE.Object3D;
    if (inst) obj = inst.obj;
    else {
      obj = new THREE.Group();
      obj.add(part(e.arch === 'swarm' ? GEO.tet : GEO.oct, toon(e.skin.colors[0]), [0, 0, 0], [e.r * 1.8, e.r * 0.8, e.r * 1.8]));
      obj.add(part(GEO.sphere, toon(e.skin.colors[2], { glow: 1 }), [0, 0.3, e.r * 0.4], e.r * 0.5));
    }
    let head: THREE.Object3D | null = null;
    obj.traverse((o) => {
      if (!head && o.userData.part === 'head' && o !== obj) head = o;
    });
    if (e.arch !== 'turret' && e.arch !== 'spindle' && e.arch !== 'technical' && e.arch !== 'gunboat') head = null;
    obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
    outlined(obj);
    xray(obj, new THREE.Color(e.skin.colors[0]).lerp(FOE_XRAY, 0.5).getHex(), 0.55);
    this.scene.add(obj);
    let tow: THREE.Mesh | undefined;
    if (e.arch === 'tug') {
      tow = part(TOW, flat(e.skin.colors[2]), [0, 0, 0], 1);
      tow.visible = false;
      this.scene.add(tow);
    }
    let ring: THREE.Mesh | null = null;
    if (e.elite) {
      ring = part(new THREE.RingGeometry(e.r * 1.4, e.r * 1.6, 6), flat(0xffd04a), [0, 0, 0], 1, [-Math.PI / 2, 0, 0]);
      this.scene.add(ring);
    }
    const pose = e.boss && inst ? new BossPose(inst, `boss_${this.lv.spec.planet.id}`) : undefined;
    // a fold pose is held at its end and weighed in against the idle
    let fold: EnemyView['fold'];
    const fa = inst && [...inst.actions].find(([n]) => n.endsWith('_fold'))?.[1];
    if (inst && fa) {
      fa.play();
      fa.paused = true;
      fa.time = fa.getClip().duration;
      fa.setEffectiveWeight(0);
      fold = { pose: fa, idle: [...inst.actions].find(([n]) => n.endsWith('_idle'))?.[1] ?? null, k: 0 };
    }
    const car = e.ground && inst ? (CarRig.of(obj, head) ?? undefined) : undefined;
    const worm = e.arch === 'burrower' && inst ? (WormRig.of(obj) ?? undefined) : undefined;
    return { inst, obj, head, ring, seen: true, boss: !!e.boss, ground: e.ground, skin: e.skin.colors, punch: 0, knock: 0, pose, fold, car, worm, tow, held: e.arch === 'vault' ? 2 : undefined };
  }

  /** It folds to dive (fast) and opens as it climbs away; its idle spins up through the windup and runs fast out of the dive. */
  private fold(e: Enemy, f: NonNullable<EnemyView['fold']>, dt: number) {
    const want = e.state === 'attack' ? 1 : 0;
    f.k += (want - f.k) * Math.min(1, dt * (want ? 16 : 6));
    f.pose.setEffectiveWeight(f.k);
    if (!f.idle) return;
    f.idle.setEffectiveWeight(1 - f.k);
    const u = e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0;
    f.idle.timeScale = e.state === 'windup' ? 1 + 2.5 * u : e.state === 'recover' ? 1 + 2 * (1 - u) : 1;
  }

  /** Flares burn and fizz; afterimages are the ship's ghost, flickering. */
  private updateDecoys() {
    for (const d of this.lv.decoys) {
      const col = LIVERY[d.owner]?.[2] ?? 0xffffff;
      if (d.kind === 'flare') {
        const end = d.t > d.life - 0.4 && Math.floor(this.time * 20) % 2 ? 1.6 : 1;
        this.fx.add({ x: d.x, y: FLIGHT_Y + 0.6, z: d.z, size: 1.4 * end, grow: 0.5, life: 0.05, color: FLARE, carried: true });
        if (Math.random() < 0.5) this.fx.add({ x: d.x, y: FLIGHT_Y + 0.4, z: d.z, vx: (Math.random() - 0.5) * 4, vz: 6, vy: 1, size: 0.5, grow: 2.5, life: 0.5, color: new THREE.Color(0x8a7a7a), glow: false, carried: true });
      } else this.fx.add({ x: d.x, y: FLIGHT_Y + 0.4, z: d.z, size: d.r * 2, grow: 1, life: 0.04, color: this.c.setHex(col).multiplyScalar(0.4 + 0.3 * Math.sin(this.time * 30)), carried: true });
    }
  }

  private updateBullets() {
    this.popped = 0;
    const bs = this.lv.bullets;
    this.bullets.update(this.time, bs, this.eye.quaternion);
    // torpedoes leave smoke once they've lit, and spit sparks off the motor
    for (const b of bs) {
      if (b.kind !== 'torpedo' || b.t < TORPEDO.launch) continue;
      const sp = Math.hypot(b.vx, b.vz) || 1;
      const bx = b.x - (b.vx / sp) * 1.1;
      const bz = b.z - (b.vz / sp) * 1.1;
      this.wake(b, bx, bz, 0.35, (x, z) =>
        this.fx.add({ x, y: FLIGHT_Y + 0.6, z, vx: (Math.random() - 0.5) * 1, vz: (Math.random() - 0.5) * 1, vy: 0.6, size: 0.3 + Math.random() * 0.12, grow: 3, life: 0.6 + Math.random() * 0.2, color: TORP_SMOKE, to: TORP_SMOKE_END, glow: false }),
      );
      if (Math.random() < 0.25) this.fx.add({ x: bx, y: FLIGHT_Y + 0.7, z: bz, vx: -b.vx * 0.2 + (Math.random() - 0.5) * 4, vz: -b.vz * 0.2 + (Math.random() - 0.5) * 4, size: 0.15, grow: 0.3, life: 0.18, drag: 3, color: HOT });
    }
  }

  /** Calls `puff` every `step` along the way `key` has come since last frame (smoke that stays a line, whatever the frame rate). */
  private wake(key: object, x: number, z: number, step: number, puff: (x: number, z: number) => void) {
    const was = this.wakes.get(key);
    if (!was) {
      this.wakes.set(key, { x, z });
      return;
    }
    const d = Math.hypot(x - was.x, z - was.z);
    const n = Math.min(8, Math.floor(d / step));
    for (let k = 1; k <= n; k++) {
      const f = 1 - (k * step) / Math.max(d, 1e-6);
      puff(x + (was.x - x) * f, z + (was.z - z) * f);
    }
    // (a jump too long to fill, like a wrap or a respawn, starts afresh)
    const f = d > step * 12 ? 0 : 1 - (n * step) / Math.max(d, 1e-6);
    was.x = x + (was.x - x) * f;
    was.z = z + (was.z - z) * f;
  }

  /** A muzzle: each faction fires in its own way (a flash and smoke, a crisp ring, a spatter, a puff). */
  private muzzle(x: number, z: number, color: number, look: Faction | undefined) {
    const y = FLIGHT_Y + 0.5;
    const col = new THREE.Color(color);
    switch (look) {
      case 'lattice':
        this.fx.ring(x, y, z, 1.8, 0.14, false, color);
        this.fx.add({ x, y, z, size: 1.0, grow: 0.2, life: 0.06, color: HOT });
        break;
      case 'wild':
        for (let k = 0; k < 4; k++) this.fx.add({ x, y, z, vx: (Math.random() - 0.5) * 8, vz: 2 + Math.random() * 5, vy: 3 + Math.random() * 3, gravity: 16, size: 0.3, grow: 0.6, life: 0.35, color: col, glow: false });
        this.fx.add({ x, y, z, size: 1.2, grow: 0.4, life: 0.07, color: col });
        break;
      case 'bloom':
        for (let k = 0; k < 4; k++) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x, y, z, vx: Math.cos(a) * 2.5, vz: Math.sin(a) * 2.5, vy: 0.5, size: 0.6, grow: 2.2, life: 0.6, drag: 2, color: col.clone().multiplyScalar(0.7), glow: false });
        }
        break;
      default:
        this.fx.add({ x, y, z, size: 1.4, grow: 0.3, life: 0.07, color: HOT });
        this.fx.add({ x, y, z, vz: 2, vy: 1, size: 0.6, grow: 2.2, life: 0.4, color: TORP_SMOKE, to: TORP_SMOKE_END, glow: false });
    }
  }

  /** A cancelled bullet pops in its faction's way, rather than winking out. */
  private pop1(x: number, z: number, color: number, look: Faction) {
    const y = FLIGHT_Y + 0.6;
    if (++this.popped > 28) {
      if (this.popped < 90) this.fx.add({ x, y, z, size: 0.9, grow: 0.2, life: 0.08, color: new THREE.Color(color), carried: true });
      return;
    }
    switch (look) {
      case 'lattice':
        // the shard breaks into light
        this.fx.ring(x, y, z, 1.3, 0.16, true, color);
        this.fx.sparks(x, y, z, 3, 0xffffff, 12, 0.14, 0.18);
        break;
      case 'wild':
        // a splash
        for (let k = 0; k < 4; k++) {
          const a = Math.random() * Math.PI * 2;
          this.fx.add({ x, y, z, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 3 + Math.random() * 2, gravity: 18, size: 0.32, grow: 0.5, life: 0.3, color: new THREE.Color(color), glow: false, carried: true });
        }
        break;
      case 'bloom':
        // a soft puff
        this.fx.add({ x, y, z, size: 1.2, grow: 1.8, life: 0.4, color: new THREE.Color(color).multiplyScalar(0.7), glow: false, carried: true });
        this.fx.sparks(x, y, z, 2, color, 5, 0.3, 0.2);
        break;
      default:
        // hot metal: sparks and a flash
        this.fx.add({ x, y, z, size: 1.1, grow: 0.3, life: 0.06, color: HOT, carried: true });
        this.fx.sparks(x, y, z, 4, 0xffb04a, 14, 0.2, 0.18);
    }
  }

  private updateShots() {
    const ss = this.lv.shots;
    let n = 0;
    this.shotArt.update(this.time, ss, this.eye.quaternion, LIVERY.map((l) => l[2]));
    this.looks.update(this.time, this.lv, this.eye.quaternion);
    this.kitArt.update(this.time, this.lv, this.eye.quaternion, LIVERY.map((l) => l[2]));
    for (const s of ss) {
      if (n >= 1500) break;
      if (GunLooks.owns(s)) continue;
      if (s.kind === 'missile') {
        // a thin wisp of smoke, laid evenly along the way it came
        this.wake(s, s.x, s.z, 0.3, (x, z) =>
          this.fx.add({ x: x + (Math.random() - 0.5) * 0.12, y: FLIGHT_Y + 0.5, z: z + (Math.random() - 0.5) * 0.12, vy: 0.4, size: 0.2 + Math.random() * 0.08, grow: 2.6, life: 0.3 + Math.random() * 0.15, color: MISSILE_SMOKE, to: MISSILE_SMOKE_END, glow: false }),
        );
      }
      if (s.kind === 'rail' && Math.random() < 0.8) this.fx.add({ x: s.x, y: FLIGHT_Y + 0.5, z: s.z, size: 0.5, grow: 0.1, life: 0.15, color: new THREE.Color(0x9af0ff), carried: true });
      if (s.kind === 'flame' || ShotArt.draws(s.kind)) continue; // fire particles, and the shot art
      // (anything else that flies: a plain bolt)
      this.q.setFromAxisAngle(Y, Math.atan2(s.vx, s.vz));
      this.m.compose(this.v.set(s.x, FLIGHT_Y + 0.6, s.z), this.q, this.s.set(0.3, 0.3, 0.6));
      this.shots.setMatrixAt(n, this.m);
      const col = SHOT_COLORS[s.kind];
      this.shots.setColorAt(n, this.c.setHex(col).multiplyScalar(1.7));
      n++;
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
  }

  private updateBeams() {
    let k = 0;
    this.lv.players.forEach((p, i) => {
      p.stats.guns.forEach((g, gi) => {
        const len = p.beam[gi];
        if (!len) return;
        let m = this.beams[k];
        if (!m) {
          m = new THREE.Mesh(BEAM_GEO, beamMaterial());
          m.renderOrder = 24;
          m.frustumCulled = false;
          this.beams.push(m);
          this.scene.add(m);
        }
        m.visible = true;
        const x = p.x + g.x;
        const z = p.z + g.z;
        m.position.set(x + (Math.sin(g.dir) * len) / 2, FLIGHT_Y + 0.7, z - (Math.cos(g.dir) * len) / 2);
        m.rotation.set(0, -g.dir, 0);
        m.scale.set(1.6 + Math.sin(this.time * 60) * 0.12, 1, len);
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = this.time;
        u.uLen.value = len;
        u.uColor.value.setHex(i === 0 ? SHOT_COLORS.beam : LIVERY[i][2]);
        // where it bites: a hot glow
        this.fx.add({ x: x + Math.sin(g.dir) * len, y: FLIGHT_Y + 0.8, z: z - Math.cos(g.dir) * len, size: 1.6 + Math.random() * 0.6, grow: 0.5, life: 0.05, color: this.c.setHex(0xfff4dc).multiplyScalar(1.2), carried: true });
        this.fx.add({ x, y: FLIGHT_Y + 0.8, z: z - 0.4, size: 1.2, grow: 0.4, life: 0.04, color: HOT, carried: true });
        if (Math.random() < 0.5) this.fx.sparks(x + Math.sin(g.dir) * len, FLIGHT_Y + 0.6, z - Math.cos(g.dir) * len, 1, 0xffe8b8, 10, 0.15, 0.25);
        k++;
      });
    });
    for (; k < this.beams.length; k++) this.beams[k].visible = false;
  }

  private updateLasers() {
    const ls = this.lv.lasers;
    let k = 0;
    for (const l of ls) {
      let m = this.laserMeshes[k];
      if (!m) {
        m = part(GEO.box, flat(0xffffff, { own: true }), [0, 0, 0], 1);
        m.renderOrder = 27;
        (m.material as THREE.Material).depthTest = false;
        // a dark edge either side of it while it burns, so the white reads on snow and salt too
        const edge = part(GEO.box, flat(0x0c0812, { own: true }), [0, -0.2, 0], [1.9, 0.8, 1]);
        edge.renderOrder = 26;
        (edge.material as THREE.Material).depthTest = false;
        m.add(edge);
        this.laserMeshes.push(m);
        this.scene.add(m);
      }
      // (a beam that starts further out: drawn from there)
      const len0 = Math.hypot(l.x2 - l.x, l.z2 - l.z) || 1;
      const x0 = l.x + ((l.x2 - l.x) * (l.r0 ?? 0)) / len0;
      const z0 = l.z + ((l.z2 - l.z) * (l.r0 ?? 0)) / len0;
      const dx = l.x2 - x0;
      const dz = l.z2 - z0;
      const len = Math.hypot(dx, dz);
      m.visible = true;
      m.position.set(x0 + dx / 2, FLIGHT_Y + 0.9, z0 + dz / 2);
      m.rotation.y = Math.atan2(dx, dz);
      const mat = m.material as THREE.MeshBasicMaterial;
      m.children[0].visible = l.warn <= 0 && !l.tow;
      if (l.warn > 0) {
      // its sound: a rising whine as it charges, the crack and roar as it fires (not a tow line,
      // and not a lane only drawn for a blink)
      const now = l.warn > 0 ? 'warn' : 'on';
      const heard = this.laserHeard.get(l);
      if (heard !== now && !l.tow) {
        this.laserHeard.set(l, now);
        const pan = Math.max(-1, Math.min(1, l.x / HALF_W));
        if (now === 'warn') audio.play('laser_charge', { pan, vol: 0.45 });
        else if (l.on > 0.05) audio.play('laser_fire', { pan, vol: 0.55 });
      }
        // the warning: a thin flickering line, faster as it's about to fire
        const on = Math.floor(this.time * (8 + (1 - l.warn) * 30)) % 2 === 0;
        m.visible = on;
        m.scale.set(0.18, 0.1, len);
        mat.color.setHex(l.color);
      } else if (l.tow) {
        // a tow line, taut: a steady cable of hard light humming as it hauls, a pulse running home
        // along it now and then, sparks where it holds
        const pulse = (this.time * 1.6 + k * 0.37) % 1;
        m.scale.set(0.55 + Math.sin(this.time * 40 + k) * 0.08, 0.2, len);
        mat.color.setHex(pulse > 0.9 ? 0xffffff : l.color);
        if (Math.random() < 0.08) this.fx.sparks(l.x2, FLIGHT_Y + 0.8, l.z2, 1, l.color, 6, 0.2, 0.12, true);
      } else {
        // white-hot, the firer's colour only flickering through it
        m.scale.set(1.6 + Math.sin(this.time * 70) * 0.25, 0.3, len);
        mat.color.setHex(Math.floor(this.time * 30) % 4 ? 0xffffff : l.color);
        this.trauma = Math.max(this.trauma, 0.2);
      }
      k++;
    }
    for (; k < this.laserMeshes.length; k++) this.laserMeshes[k].visible = false;
  }

  private updatePickups(dt: number) {
    const lv = this.lv;
    const seen = new Set<object>();
    for (const k of lv.pickups) {
      if (k.kind === 'ring' && (k.z < lv.top - 30 || k.z > lv.bottom + 6)) continue;
      seen.add(k);
      let v = this.pickups.get(k);
      if (!v) {
        let inst: Instance | null = null;
        let obj: THREE.Object3D;
        if (k.kind === 'scrap') {
          // a bent tin coin (a bundle of two for more), chalk-white and inked round like a foe, so
          // it reads on any ground; no glow (what glows is fire)
          inst = library.clone(k.value > 1 ? 'pickup_scrap_big' : 'pickup_scrap');
          obj = new THREE.Group();
          obj.add(inst?.obj ?? part(GEO.oct, toon(0xece6d8), [0, 0, 0], 0.3));
        } else if (k.kind === 'part') {
          inst = library.clone('pickup_part');
          obj = inst?.obj ?? part(GEO.box, toon(0x5a8a6a, { glow: 0.3 }), [0, 0, 0], [1.1, 0.8, 0.8]);
        } else if (k.kind === 'hot') {
          // a volatile strongbox: hazard orange, black bands, a warning light on top, and a chalk
          // ring pulsing round it on the ground (white like everything you can take: red is fire)
          obj = new THREE.Group();
          obj.add(part(GEO.box, toon(HOT_HEX, { glow: 0.4 }), [0, 0, 0], [1.4, 1, 1]));
          obj.add(part(GEO.box, toon(0x1a1014), [0, 0, 0], [1.5, 0.2, 1.1]));
          obj.add(part(GEO.oct, flat(0xfff4e0), [0, 0.8, 0], 0.38));
          obj.add(part(GEO.box, toon(0x1a1014), [-0.45, 0, 0], [0.18, 1.1, 1.1]), part(GEO.box, toon(0x1a1014), [0.45, 0, 0], [0.18, 1.1, 1.1]));
        } else if (k.kind === 'repair') {
          // a riveted repair patch: chalk tin, a stitched cross (green is the bloom's)
          inst = library.clone('pickup_repair');
          obj = new THREE.Group();
          obj.add(inst?.obj ?? part(GEO.box, toon(0xece6d8), [0, 0, 0], [0.7, 0.1, 0.7]));
          obj.scale.setScalar(2.2);
        } else {
          obj = part(new THREE.TorusGeometry(2.4, 0.22, 4, 18), toon(0xffd04a, { glow: 0.6 }), [0, 0, 0], 1);
        }
        if (k.kind === 'scrap' || k.kind === 'repair') outlined(obj);
        this.scene.add(obj);
        v = { obj, inst, beacon: (k.kind === 'part' || k.kind === 'hot') && k.part ? this.beacon(tierOf(k.part)) : undefined };
        if (v.beacon) this.scene.add(v.beacon);
        this.pickups.set(k, v);
        if (k.part?.tier === 'legendary') audio.play('loot_epic', { pan: k.x / HALF_W, pitch: 0.8, vol: 0.6 });
      }
      v.inst?.update(dt);
      const done = k.kind === 'ring' && (k.done ?? 0) > 0;
      v.obj.position.set(k.x, FLIGHT_Y + (k.kind === 'ring' ? 0 : 0.5 + Math.sin(this.time * 4 + k.x) * 0.2), k.z);
      if (k.kind === 'ring') {
        v.obj.rotation.set(0, 0, 0);
        v.obj.rotation.x = -TILT * 0.4;
        v.obj.visible = !done || Math.floor(this.time * 20) % 2 === 0;
        v.obj.scale.setScalar(done ? 1.3 : 1);
      } else if (k.kind === 'scrap' || k.kind === 'repair') {
        // a coin or a patch turns over as it bobs, showing its thin edge now and then: it drifts,
        // it never streaks
        v.obj.rotation.set(-0.5 + 0.9 * Math.sin(this.time * 2.2 + k.x), this.time * 1.3 + k.z, 0);
        if (k.kind === 'scrap') {
          const big = k.value > 1;
          // it pops out of the wreck
          const f = Math.min(1, k.t / 0.22);
          const pop = f * (1 + 0.5 * Math.sin(f * Math.PI));
          v.obj.scale.setScalar((big ? 2.3 : 2) * pop);
        }
      } else {
        v.obj.rotation.y += dt * 1.5;
        // the strongbox's light blinks: it's live
        if (k.kind === 'hot') {
          v.obj.children[2].visible = Math.floor(this.time * 5) % 2 === 0;
          if (k.t % 0.7 < dt) this.fx.ring(k.x, FLIGHT_Y, k.z, 7, 0.5, false, 0xfff4e0);
        }
        if (k.kind === 'part' || k.kind === 'hot') {
          const tier = k.part ? tierOf(k.part) : 'common';
          const col = k.kind === 'hot' && Math.random() < 0.5 ? HOT_HEX : tier === 'common' ? 0xfff4e0 : TIER_HEX[tier];
          v.obj.scale.setScalar((k.kind === 'hot' ? 2 : 1) * (1 + Math.sin(this.time * 6) * 0.08));
          if (Math.random() < (tier === 'legendary' ? 0.6 : tier === 'epic' ? 0.35 : 0.15)) this.fx.sparks(k.x, FLIGHT_Y + 0.5, k.z, 1, col, tier === 'legendary' ? 7 : 4, 0.4, 0.2);
          if (v.beacon) {
            // the beacon: a shaft of its tier's light standing on it, a ring turning at its foot
            v.beacon.position.set(k.x, FLIGHT_Y + 0.2, k.z);
            const beat = 1 + 0.12 * Math.sin(this.time * 5 + k.x);
            v.beacon.children[0].scale.set(beat, 1, beat);
            v.beacon.children[1].rotation.z += dt * 2.4;
            v.beacon.children[2].rotation.y = this.time * 0.8;
            v.beacon.children[2].visible = tier === 'legendary';
          }
        }
      }
    }
    for (const [k, v] of this.pickups)
      if (!seen.has(k)) {
        this.scene.remove(v.obj);
        if (v.beacon) this.scene.remove(v.beacon);
        v.inst?.dispose();
        this.pickups.delete(k);
      }
  }

  /** A part crate's beacon in its tier's colour: a shaft of light, a ring at its foot, and for a legendary, rays. */
  private beacon(tier: Tier): THREE.Group | undefined {
    if (tier === 'common') return undefined;
    const col = TIER_HEX[tier];
    const tall = tier === 'legendary' ? 9 : tier === 'epic' ? 6.5 : 4.5;
    const g = new THREE.Group();
    const shaft = part(new THREE.CylinderGeometry(0.28, 0.75, tall, 10, 1, true), flat(col, { additive: true, opacity: tier === 'rare' ? 0.35 : 0.5 }), [0, tall / 2, 0], 1);
    g.add(shaft);
    g.add(part(new THREE.RingGeometry(1.25, 1.5, 6), flat(col, { additive: true, opacity: 0.8 }), [0, -0.3, 0], 1, [-Math.PI / 2, 0, 0]));
    const rays = new THREE.Group();
    for (let i = 0; i < 6; i++) rays.add(part(GEO.box, flat(0xffe6a0, { additive: true, opacity: 0.45 }), [0, 0.2, 0], [0.12, 0.05, 6], [0, (i / 6) * Math.PI, 0]));
    g.add(rays);
    return g;
  }

  /** A part caught in flight: its name in its tier's colour, and a legendary makes the moment. */
  private gotPart(it: import('../game/loot').Item | undefined, x: number, z: number) {
    const tier = it ? tierOf(it) : 'common';
    const name = it ? itemName(it) : 'PART';
    this.flash = 0.25;
    this.flashColor.set(tier === 'common' ? 0xa0ffe0 : TIER_HEX[tier]);
    if (tier === 'legendary') {
      this.pop(name, x, z - 4, TIER_COLOR.legendary, true);
      this.pop(`★ ${TRAITS[it!.trait!]?.name ?? 'LEGENDARY'}`, x, z, '#ffe6a0');
      this.fx.ring(x, FLIGHT_Y, z, 9, 0.45, true, 0xffb03a);
      this.fx.sparks(x, FLIGHT_Y + 0.6, z, 30, 0xffd04a, 22, 0.5, 0.25);
      this.flash = 0.6;
      audio.play('loot_legendary');
    } else {
      this.pop(tier === 'common' ? name : `${tier.toUpperCase()} ${name}`, x, z, tier === 'common' ? '#8affe0' : TIER_COLOR[tier], tier === 'epic');
      if (tier !== 'common') this.fx.ring(x, FLIGHT_Y, z, tier === 'epic' ? 6 : 4, 0.3, true, TIER_HEX[tier]);
      audio.play(tier === 'epic' ? 'loot_epic' : 'pickup_part');
    }
    // what it does differently, under the name
    if (it?.affix) this.pop(`✦ ${AFFIXES[it.affix].name}`, x, z + (tier === 'legendary' ? 4 : 3.5), AFFIX_COLOR);
  }

  /**
   * The air of the place: ash, embers, spores, snow, rain… drifting through the view. None of it may
   * look like a shot: it stays well under the flight plane, bigger, softer and dimmer than any
   * bullet, mostly covering rather than glowing, and it thins out while a fight is on.
   */
  private ambient(dt: number) {
    const lv = this.lv;
    const b = lv.terrain.biome(lv.scroll);
    const kind = b.particles;
    // (each one's end, so `airCount` knows how many are up)
    this.air = this.air.filter((t) => t > this.time);
    if (kind === 'none') return;
    const add = (o: Parameters<Fx['add']>[0]) => void this.air.push(this.time + this.fx.add(o).life);
    // a fight on: enemy fire and foes about thin the air out to a third
    const fight = busy(lv);
    this.ambientT += dt * (kind === 'rain' ? 60 : kind === 'snow' || kind === 'ash' ? 22 : 12) * (1 - 0.65 * fight);
    const dim = (c: THREE.Color, k = 0.5) => this.c.copy(c).multiplyScalar(k);
    while (this.ambientT > 1) {
      this.ambientT--;
      const x = (Math.random() - 0.5) * HALF_W * 2.4;
      const z = lv.scroll + (Math.random() - 0.6) * HALF_H * 2.2;
      // (low: from just over the ground to a few units under the ships)
      const y = 1 + Math.random() * (FLIGHT_Y - 5);
      switch (kind) {
        case 'ash':
          add({ x, y, z, vx: 1.5, vy: -1, vz: 1, size: 0.45, life: 3, glow: false, color: dim(ASH, 0.7) });
          break;
        case 'snow':
          add({ x, y, z, vx: 2, vy: -1.5, vz: 1, size: 0.5, life: 3, glow: false, color: dim(SNOW, 0.75) });
          break;
        case 'embers':
          add({ x, y: Math.random() * 3, z, vx: (Math.random() - 0.5) * 2, vy: 1.5, size: 0.5, grow: 1.6, life: 2.2, color: dim(EMBER, 0.45), to: EMBER_END });
          break;
        case 'spores':
          add({ x, y, z, vx: Math.sin(z) * 0.8, vy: 0.3, size: 0.55, grow: 1.5, life: 3, glow: false, color: dim(Math.random() < 0.5 ? SPORE : SPORE2, 0.45) });
          break;
        case 'pollen':
          add({ x, y, z, vx: 1.2, vy: 0.2, size: 0.45, grow: 1.4, life: 3, glow: false, color: dim(POLLEN, 0.55) });
          break;
        case 'motes':
          add({ x, y, z, vy: 0.3, size: 0.5, grow: 1.5, life: 2.5, color: dim(new THREE.Color(b.light), 0.35) });
          break;
        case 'sand':
          add({ x: x - 10, y: Math.random() * 4, z, vx: 18, vz: 2, size: 0.4, life: 1.4, glow: false, color: new THREE.Color(b.ground[2]) });
          break;
        case 'rain':
          add({ x, y: FLIGHT_Y - 2, z: z - 4, vx: 3, vy: -40, vz: 6, size: 0.14, life: 0.2, glow: false, color: dim(RAIN, 0.7) });
          break;
        case 'steam':
          if (Math.random() < 0.4) add({ x, y: Math.max(lv.terrain.height(x, z), lv.terrain.water(z)), z, vy: 2.5, size: 1.4, grow: 2.5, life: 2, glow: false, color: STEAM, to: new THREE.Color(b.sky) });
          break;
      }
    }
  }

  /** Low clouds drifting under you, for depth: soft puffs, lit from above, blown along by the wind. */
  private updateClouds(dt: number) {
    const lv = this.lv;
    const b = lv.terrain.biome(lv.top);
    const wind = weather.uWindDir.value;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.x += wind.x * c.drift * dt;
      c.z += wind.y * c.drift * dt;
      c.obj.position.x = c.x;
      c.obj.position.z = c.z;
      if (c.z > lv.bottom + 40 || Math.abs(c.x) > this.halfW + 30) {
        this.scene.remove(c.obj);
        this.clouds.splice(i, 1);
      }
    }
    if (b.clouds !== null && this.clouds.length < (busy(lv) > 0.5 ? 3 : 7) && Math.random() < dt * 0.8) {
      const obj = new THREE.Group();
      const col = new THREE.Color(b.clouds);
      const n = 5 + Math.floor(Math.random() * 6);
      const w = 8 + Math.random() * 10;
      for (let k = 0; k < n; k++) {
        const sp = new THREE.Sprite(cloudMaterial(col, 0.5 + Math.random() * 0.25));
        const s = 4 + Math.random() * 5;
        sp.scale.set(s * 1.3, s, 1);
        sp.position.set((Math.random() - 0.5) * w, Math.random() * 0.6, (Math.random() - 0.5) * w * 0.45);
        sp.renderOrder = 3;
        obj.add(sp);
      }
      const x = (Math.random() - 0.5) * this.halfW * 2.4;
      const z = lv.top - 30 - Math.random() * 10;
      obj.position.set(x, 6 + Math.random() * 1.5, z);
      this.scene.add(obj);
      this.clouds.push({ obj, x, z, drift: 2 + Math.random() * 3 });
    }
  }

  dispose() {
    this.world.dispose();
    this.near.dispose();
    this.hazards.dispose();
    this.life.dispose();
    this.shields.dispose();
    this.guards.dispose();
    this.fx.clear();
    for (const s of this.ships) s?.dispose();
    for (const v of this.enemies.values()) v.inst?.dispose();
    for (const w of this.wrecks) w.inst?.dispose();
    this.convoy?.dispose();
    this.heist?.dispose();
    this.traits.dispose();
    this.grafts.dispose();
    this.jumps.dispose();
    for (const v of this.pickups.values()) v.inst?.dispose();
    audio.loop('beam', 'p0', false);
    audio.loop('beam', 'p1', false);
    audio.loop('flame', 'p0', false);
    audio.loop('flame', 'p1', false);
    audio.loop('engine', 'p1', false);
    audio.loop('wind', 'all', false);
    audio.loop('truck', 'foes', false);
    audio.danger(0);
  }
}

const Y = new THREE.Vector3(0, 1, 0);
/** A beam: a flat strip from the gun (z 0.5) up to where it ends (z -0.5), across x. */
const BEAM_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const FOAM = new THREE.Color(0xf0f8ff);
const FOAM_END = new THREE.Color(0x9ac8d8);
const BREATH = new THREE.Color(0xd8f0ff);
/** Light poured down a strip: a white-hot core, a coloured sheath, pulses running up it, and a ragged, crawling edge. */
function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLen: { value: 10 }, uColor: { value: new THREE.Color(0x8af8ff) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLen;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float along = vUv.y * uLen;
        float x = abs(vUv.x - 0.5) * 2.0;
        // the edge crawls
        float wob = 0.12 * sin(along * 2.3 - uTime * 40.0) + 0.08 * sin(along * 5.1 + uTime * 27.0);
        float sheath = 1.0 - smoothstep(0.35, 1.0, x + wob);
        float core = 1.0 - smoothstep(0.0, 0.22, x);
        // pulses running out from the gun
        float pulse = 0.6 + 0.4 * smoothstep(0.6, 1.0, sin(along * 0.9 - uTime * 50.0));
        // fading in from the muzzle and out at the tip
        float ends = smoothstep(0.0, 0.6, along) * smoothstep(0.0, 1.2, uLen - along);
        vec3 col = uColor * sheath * pulse * 1.4 + vec3(1.0, 0.98, 0.92) * core * 2.2;
        gl_FragColor = vec4(col * ends, 1.0);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
const ASH = new THREE.Color(0xb8b0b0);
const SNOW = new THREE.Color(0xf4f8ff);
const EMBER = new THREE.Color(0xffc040);
const EMBER_END = new THREE.Color(0xa02a10);
const SPORE = new THREE.Color(0x9aff9a);
const SPORE2 = new THREE.Color(0xd0a0ff);
const POLLEN = new THREE.Color(0xfff0a0);
const RAIN = new THREE.Color(0x9ab8e8);
const STEAM = new THREE.Color(0xf8f0f4);
const HOT = new THREE.Color(2, 2, 2);

const cloudMats = new Map<string, THREE.SpriteMaterial>();
function cloudMaterial(col: THREE.Color, opacity: number) {
  const key = `${col.getHexString()}:${opacity.toFixed(1)}`;
  let m = cloudMats.get(key);
  if (!m) {
    m = new THREE.SpriteMaterial({ map: PUFF, color: col.clone().multiplyScalar(0.92), transparent: true, opacity: Math.round(opacity * 10) / 10, depthWrite: false });
    cloudMats.set(key, m);
  }
  return m;
}


export type { Player };
const SCORCH = new THREE.Color(0x2e2620);
const WHITE = new THREE.Color(0xffffff);
/** What a foe under something shows as: its colour, gone hot. */
const FOE_XRAY = new THREE.Color(0xff4a3a);
const BITE = new THREE.Color(0xffb060);
const FIRE_PETAL = new THREE.Color(0xffd880);
const FIRE_DARK = new THREE.Color(0xb02a10);
const WRECK_SMOKE = new THREE.Color(0x5a5050);
const WRECK_SMOKE_END = new THREE.Color(0x8a8288);
const SPLASH = new THREE.Color(0xeaf4f8);
const SPARK = new THREE.Color(0xffe0a0);
const CRACK_GLINT = new THREE.Color(0xfff0b0).multiplyScalar(1.5);
const GLINT = new THREE.Color(0xd8f8ff);
const HIT_SMOKE = new THREE.Color(0x4a4040);
const SMOKE_END = new THREE.Color(0x2a2228);
const SCORCH_END = new THREE.Color(0x3a3430);
const AIR = new THREE.Color(0xe8f0f8);
const SKIM = new THREE.Color(0xffd890);
const SIPHON = new THREE.Color(0xb08aff);
const FLARE = new THREE.Color(0xffe0a0).multiplyScalar(1.6);
const TORP_SMOKE = new THREE.Color(0xeee6dc);
const TORP_SMOKE_END = new THREE.Color(0x9a9298);
const MISSILE_SMOKE = new THREE.Color(0xc8bcb0);
const MISSILE_SMOKE_END = new THREE.Color(0x6a6266);

const TIER_HEX: Record<Tier, number> = { common: 0xb8b0c8, rare: 0x5ab8ff, epic: 0xc27aff, legendary: 0xffb03a };
const EDGE_COLOR = '#ffa8d8';
const EDGE_HOT = new THREE.Color(0xfff0f8).multiplyScalar(1.6);
const EDGE_GLOW = new THREE.Color(0xff8ac8).multiplyScalar(1.3);
const STRIKE_GLOW = new THREE.Color(0xffffff).multiplyScalar(1.4);
/** The riposte's gold (the HUD's bar is the same). */
const RIPOSTE_HEX = '#ffd060';
const RIPOSTE_GLOW = new THREE.Color(RIPOSTE_HEX).multiplyScalar(1.5);
