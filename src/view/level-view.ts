import * as THREE from 'three';
import type { Bullet, Enemy, Level, LevelEvent, Player } from '../sim/level';
import { FLIGHT_Y, HALF_H, HALF_W, TILT, fromFlight } from '../sim/types';
import { WorldView } from './world-view';
import { Fx } from './fx';
import { Life } from './life';
import { Threats } from './threats';
import { FOES } from '../sim/factions';
import { ShipModel, LIVERY } from './ship-model';
import { library, type Instance } from '../render/assets';
import { flat, GEO, part, toon } from '../render/toon';
import { audio } from '../audio';
import type { Biome } from '../world/planets';
import { clamp, damp, lerp } from '../util';
import type { PixelRenderer } from '../render/pixel';
import { weather, tickWeather } from '../render/alive';

/** The playfield as it shows on screen (world units): the camera always fits all of it. */
export const FIELD_W = HALF_W * 2;
export const FIELD_H = HALF_H * 2 * Math.cos(TILT);
/** Screen units of margin under the field. */
const MARGIN = 3;

const SHOT_COLORS: Record<string, number> = {
  slug: 0xffe08a,
  pellet: 0xffc070,
  rail: 0x9af0ff,
  missile: 0xffffff,
  flak: 0xffb050,
  flame: 0xff9a3a,
  mine: 0xff5a3a,
  beam: 0x8af8ff,
  arc: 0xc8b0ff,
};

interface EnemyView {
  inst: Instance | null;
  obj: THREE.Object3D;
  head: THREE.Object3D | null;
  ring: THREE.Mesh | null;
  seen: boolean;
  /** Hit reaction: a squash that springs back, and a shove away from the guns. */
  punch: number;
  knock: number;
}

/**
 * Draws a Level and makes a fuss about it: everything the sim says happened (hits, kills, grazes,
 * dashes) becomes sparks, shakes, flashes, freezes and sounds here.
 */
export class LevelView {
  readonly scene = new THREE.Scene();
  /** Drawn over the finished picture, past the paint and grade: enemy fire and the hitbox, which must always read. */
  readonly overlay = new THREE.Scene();
  private hitboxes: THREE.Group[] = [];
  private threats = new Threats();
  readonly camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, FIELD_H / 2, -FIELD_H / 2, 1, 400);
  /** Half the view on screen (world units), from the window's shape. */
  halfW = HALF_W;
  halfH = FIELD_H / 2;
  readonly world: WorldView;
  readonly fx = new Fx();
  private life: Life;
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
  private ships: (ShipModel | null)[] = [];
  private enemies = new Map<number, EnemyView>();
  private pickups = new Map<object, { obj: THREE.Object3D; inst: Instance | null }>();
  private hazards = new Map<object, THREE.Group>();
  private bulletRim: THREE.InstancedMesh;
  private bulletBody: THREE.InstancedMesh;
  private bulletCore: THREE.InstancedMesh;
  private shots: THREE.InstancedMesh;
  private beams: THREE.Mesh[] = [];
  private laserMeshes: THREE.Mesh[] = [];
  private bolts: { mesh: THREE.Mesh; t: number }[] = [];
  private clouds: { obj: THREE.Group; x: number; z: number; drift: number }[] = [];
  private lastScroll = 0;
  private time = 0;
  /** Juice. */
  trauma = 0;
  flash = 0;
  flashColor = new THREE.Color(1, 1, 1);
  hurt = 0;
  /** Frames the sim should hold still for (a hit landing, a big kill). */
  hitstop = 0;
  /** Slow motion: sim speed multiplier (boss kills, perfect dashes). */
  slowmo = 1;
  slowmoT = 0;
  /** A shove of the camera in a direction that springs back (unlike the shake, which jitters). */
  private kick = new THREE.Vector2();
  private kickV = new THREE.Vector2();
  /** Guns kick the ships back a touch. */
  private recoil = [0, 0];
  /** How fast it feels, 0..1: the screen smears and the view pulls back. */
  speedFx = 0;
  private zoom = 1;
  private lines: THREE.InstancedMesh;
  private lineData: { x: number; z: number; len: number; v: number }[] = [];
  /** Kills close together, for the chain's rising pitch and the multi-kill call. */
  private chain = 0;
  private chainT = 0;
  private multi = 0;
  private multiT = 0;
  private banks: number[] = [0, 0];
  private ambientT = 0;
  private biomeIdx = -1;
  /** For the HUD: the biome that just came in and how long ago. */
  biomeBanner: { name: string; line: string; t: number } | null = null;
  bossBanner: { name: string; t: number } | null = null;
  /** Floating texts for the HUD (score pops, GRAZE, part names), in world coords. */
  pops: { text: string; x: number; z: number; t: number; color: string }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  constructor(readonly lv: Level) {
    this.world = new WorldView(lv.terrain);
    this.scene.add(this.world.group, this.fx.group);
    this.life = new Life(this.scene, this.fx);
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
    lv.players.forEach((p, i) => {
      const ship = new ShipModel(p.build, LIVERY[i]);
      ship.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      this.scene.add(ship.root);
      this.ships.push(ship);
    });
    this.overlay.add(this.threats.group);
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
    const mk = (mat: THREE.Material, n: number, order: number) => {
      const im = new THREE.InstancedMesh(disc, mat, n);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      im.frustumCulled = false;
      im.count = 0;
      im.renderOrder = order;
      (mat as THREE.MeshBasicMaterial).depthTest = false;
      this.overlay.add(im);
      return im;
    };
    this.bulletRim = mk(new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500, 30);
    this.bulletBody = mk(new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500, 31);
    this.bulletCore = mk(new THREE.MeshBasicMaterial({ color: 0xffffff }), 1500, 32);
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
    for (let k = 0; k < 48; k++) this.lineData.push({ x: 0, z: 1e9, len: 0, v: 0 });
    this.lastScroll = lv.scroll;
    this.placeCamera(0);
  }

  // --- events ------------------------------------------------------------------------------

  handle(events: LevelEvent[]) {
    const lv = this.lv;
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (e.kind === 'beam') break;
          const col = SHOT_COLORS[e.kind];
          const heavy = e.kind === 'rail' || e.kind === 'flak' || e.kind === 'pellet';
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z - 0.3, size: e.kind === 'rail' ? 1.8 : heavy ? 1.2 : 0.8, grow: 0.2, life: 0.06, color: new THREE.Color(col), carried: true });
          this.recoil[e.owner] = Math.min(0.5, (this.recoil[e.owner] ?? 0) + (e.kind === 'rail' ? 0.45 : heavy ? 0.22 : 0.07));
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
          const ev = this.enemies.get(e.enemy);
          const y = ev ? ev.obj.position.y : FLIGHT_Y;
          const en = lv.enemies.find((o) => o.id === e.enemy);
          const big = en ? en.r : 1;
          if (ev) {
            ev.punch = Math.min(1, ev.punch + (e.crit ? 0.8 : 0.35) / Math.sqrt(big));
            ev.knock = Math.min(1, ev.knock + 0.25 / big);
          }
          if (!e.kill) {
            // sparks thrown back the way the shot came, and a white star where it bit
            for (let k = 0; k < (e.crit ? 7 : 3); k++) {
              const a = Math.PI / 2 + (Math.random() - 0.5) * 1.6;
              const v = 10 + Math.random() * 12;
              this.fx.add({ x: e.x + (Math.random() - 0.5), y: y + 0.6, z: e.z + 0.3, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: Math.random() * 3, size: 0.2, grow: 0.3, life: 0.16 + Math.random() * 0.1, drag: 5, color: new THREE.Color(e.crit ? 0xffffff : 0xffe0a0), carried: true });
            }
            this.fx.add({ x: e.x, y: y + 0.8, z: e.z + 0.2, size: e.crit ? 1.6 : 0.9, grow: 0.4, life: 0.05, color: HOT, carried: true });
            if (e.crit) this.pop('CRIT', e.x, e.z - 1, '#ffffff');
            audio.play(e.crit ? 'hit_armor' : 'hit', { pan: e.x / HALF_W, vol: 0.4 });
          } else this.kill(e.x, y, e.z, big);
          break;
        }
        case 'explode': {
          const ev = e.enemy !== undefined ? this.enemies.get(e.enemy) : undefined;
          const y = ev ? ev.obj.position.y : e.y;
          const groundZ = ev && y < FLIGHT_Y - 1 ? fromFlight(e.z, y) : e.z;
          this.fx.explode(e.x, y, groundZ, e.size, e.color, y >= FLIGHT_Y - 1);
          // a blink of light bigger than the fireball, and a scorch left on the ground
          this.fx.add({ x: e.x, y: y + 1.5, z: groundZ, size: 3 + e.size * 2.5, grow: 1.3, life: 0.09, color: HOT, carried: y >= FLIGHT_Y - 1 });
          if (y < FLIGHT_Y - 1) this.fx.add({ x: e.x, y: y + 0.15, z: groundZ, size: 1.2 + e.size * 0.9, grow: 1.1, life: 4, color: SCORCH, to: SCORCH_END, glow: false });
          this.trauma = Math.min(1, this.trauma + 0.08 * e.size);
          this.shove(Math.sign(e.x - lv.players[0].x) * 0.3, -1, 0.15 * e.size);
          if (e.size >= 3) {
            this.hitstop = Math.max(this.hitstop, Math.min(8, Math.round(e.size)));
            this.flash = Math.max(this.flash, 0.25);
            this.flashColor.set(0xfff0d0);
            audio.play('explode_big', { pan: e.x / HALF_W });
            audio.duck(0.4);
          } else audio.play('explode_small', { pan: e.x / HALF_W, pitch: 1.3 - e.size * 0.15 });
          break;
        }
        case 'enemyShot':
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.5, z: e.z, size: 1.2, grow: 0.3, life: 0.08, color: new THREE.Color(e.color), carried: true });
          audio.play('enemy_shot', { pan: e.x / HALF_W, vol: 0.35 });
          break;
        case 'playerHit': {
          const p = lv.players[e.id];
          this.trauma = Math.min(1, this.trauma + (e.shield ? 0.3 : 0.6));
          this.hitstop = Math.max(this.hitstop, e.shield ? 3 : 7);
          this.shove(0, 1, e.shield ? 0.6 : 1.2);
          if (!e.shield) this.hurt = 1;
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
          this.hitstop = 14;
          audio.play('player_down');
          this.pop(`P${e.id + 1} DOWN`, e.x, e.z, '#ff6a4a');
          break;
        case 'revive':
          audio.play('shield_up');
          this.pop(`P${e.id + 1} BACK!`, lv.players[e.id].x, lv.players[e.id].z, '#8affb0');
          break;
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
          // the moment to savour: time slows, the colour drains to the player's, a bell rings
          this.slowmo = 0.2;
          this.slowmoT = 0.35;
          this.flash = Math.max(this.flash, 0.45);
          this.flashColor.set(LIVERY[e.id][2]);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.4, true, LIVERY[e.id][2]);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.25, true, 0xffffff);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 12 + e.absorbed * 3, LIVERY[e.id][2], 20, 0.4, 0.25);
          this.pop(e.absorbed > 1 ? `PERFECT x${e.absorbed}` : 'PERFECT', e.x, e.z - 3, '#ffffff');
          audio.play('perfect', { pan: e.x / HALF_W });
          audio.duck(0.4);
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
          this.hitstop = Math.max(this.hitstop, 3);
          audio.play('point_blank', { pan: e.x / HALF_W });
          break;
        case 'par':
          break;
        case 'windup': {
          const en = lv.enemies.find((o) => o.id === e.enemy);
          if (en) audio.play(e.style === 'draw' ? 'laser_charge' : e.style === 'rear' ? 'hook' : 'overheat', { pan: en.x / HALF_W, vol: 0.35, pitch: e.style === 'swell' ? 0.6 : 1 });
          break;
        }
        case 'release':
          if (e.kind === 'lunge' || e.kind === 'ram' || e.kind === 'charge' || e.kind === 'dive') {
            this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.18, true, 0xfff0d0);
            audio.play('dash', { pan: e.x / HALF_W, pitch: 0.7 });
          }
          break;
        case 'exposed':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, e.stagger ? 10 : 5, 0xffe08a, 10, 0.3, 0.2);
          if (e.stagger) {
            this.pop('STAGGERED', e.x, e.z - 2, '#ffe08a');
            this.hitstop = Math.max(this.hitstop, 3);
            audio.play('hit_armor', { pan: e.x / HALF_W, pitch: 0.7 });
          }
          break;
        case 'crack':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, 0xd8e0f0, 16, 0.35, 0.25);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.2, true, 0xd8e0f0);
          this.pop('CRACKED', e.x, e.z - 2, '#d8e0f0');
          audio.play('shield_break', { pan: e.x / HALF_W, vol: 0.7 });
          break;
        case 'guard':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 3, 0x9af0ff, 10, 0.15, 0.18);
          audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.3, pitch: 1.4 });
          break;
        case 'reflect':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 4, 0xffffff, 12, 0.15, 0.2);
          audio.play('graze', { pan: e.x / HALF_W, pitch: 0.7 });
          break;
        case 'weakHit':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 6, 0xffffff, 18, 0.2, 0.22);
          audio.play('hit_armor', { pan: e.x / HALF_W, vol: 0.5, pitch: 1.2 });
          break;
        case 'parried':
          this.pop('BROKEN', e.x, e.z - 2, '#ffffff');
          break;
        case 'kill': {
          // how it died, called out when it's worth saying
          const how = e.reflect ? 'OWN MEDICINE' : e.dash ? 'DASH KILL' : e.exposed ? 'PUNISHED' : e.overkill ? 'OVERKILL' : '';
          if (how) this.pop(how, e.x, e.z - 4, '#ffe08a');
          break;
        }
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
          this.pop('FREE', e.x, e.z - 2, '#ffffff');
          audio.play('block', { pan: e.x / HALF_W });
          break;
        case 'strike':
          if (e.kind === 'gateDown') {
            this.pop('GATE DOWN', e.x, e.z, '#9af0ff');
            audio.play('shield_break', { pan: e.x / HALF_W });
          } else if (e.kind === 'shell' || e.kind === 'slam') {
            this.fx.explode(e.x, FLIGHT_Y - 1, e.z, Math.max(0.6, e.r * 0.5), 0xffb02a, true);
            this.trauma = Math.min(1, this.trauma + 0.12);
            audio.play('explode_small', { pan: e.x / HALF_W, pitch: 0.8 });
          } else if (e.kind === 'acid' || e.kind === 'puddle') {
            this.fx.sparks(e.x, FLIGHT_Y - 1, e.z, 10, 0xb0ff4a, 10, 0.4, 0.3);
            audio.play('geyser', { pan: e.x / HALF_W, vol: 0.4 });
          } else if (e.kind === 'wave') audio.play('special_emp', { pan: e.x / HALF_W, vol: 0.4 });
          else if (e.kind === 'spore') this.fx.sparks(e.x, FLIGHT_Y, e.z, 12, 0xc8a0ff, 6, 0.8, 0.5);
          break;
        case 'outran': {
          const p = lv.players[e.id];
          this.pop('OUTRAN', p.x, p.z - 3, '#ffd04a');
          audio.play('risk_up', { pitch: 1.2 });
          break;
        }
        case 'overtake': {
          const p = lv.players[e.by];
          this.pop('OVERTAKE!', p.x, p.z - 3, '#ffd04a');
          this.shove(0, -1, 0.4);
          audio.play('risk_up', { pitch: 1.5 });
          break;
        }
        case 'link':
          break;
        case 'jam': {
          const p = lv.players[e.id];
          this.pop('JAMMED', p.x, p.z + 3, '#c8a0ff');
          audio.play('overheat', { pan: p.x / HALF_W });
          break;
        }
        case 'escaped':
          this.pop('MISSED', e.x, Math.min(e.z, lv.scroll + this.halfH - 3), '#8a7a98');
          break;
        case 'redline': {
          this.trauma = Math.min(1, this.trauma + 0.5);
          this.fx.explode(e.x, FLIGHT_Y, e.z + 1.5, 0.8, 0xff6a2a);
          this.pop('ENGINE BURST', e.x, e.z + 3, '#ff6a4a');
          audio.play('explode_small', { pan: e.x / HALF_W });
          break;
        }
        case 'tally':
          if (e.full) {
            this.pop('FULL CLEAR', lv.players[0].x, lv.players[0].z - 6, '#8affe0');
            audio.play('pickup_part', { pitch: 0.75 });
          }
          break;
        case 'waveClear':
          this.pop(`WAVE CLEAR +${e.bonus}`, e.x, e.z, '#8affe0');
          this.fx.ring(e.x, FLIGHT_Y, e.z, 8, 0.4, true, 0x8affe0);
          audio.play('pickup_part', { pitch: 1.25 });
          break;
        case 'bounty': {
          if (e.state === 'appear') {
            this.pop('BOUNTY!', e.x, e.z, '#ffd04a');
            audio.play('special_ready', { pitch: 1.3 });
          } else if (e.state === 'claimed') {
            this.pop(`BOUNTY +${e.reward}`, e.x, e.z - 2, '#ffd04a');
            this.flash = Math.max(this.flash, 0.25);
            this.flashColor.set(0xffe08a);
            this.hitstop = Math.max(this.hitstop, 4);
            audio.play('pickup_part');
          } else {
            this.pop('GOT AWAY', e.x, e.z, '#a08aa8');
            audio.play('risk_lost');
          }
          break;
        }
        case 'shortcut':
          if (e.state === 'enter') {
            this.pop('SHORTCUT', lv.players[e.id].x, lv.players[e.id].z - 3, '#8affe0');
            audio.play('risk_up', { pitch: 0.9 });
          } else if (e.state === 'exit' && e.saved > 0) {
            this.pop(`-${e.saved.toFixed(1)}s`, lv.players[e.id].x, lv.players[e.id].z - 3, '#8affe0');
            audio.play('perfect', { vol: 0.5, pitch: 1.2 });
          }
          break;
        case 'aux':
          if (e.kind === 'parry') this.fx.ring(e.x, FLIGHT_Y, e.z, 3, 0.12, true, 0xffffff);
          else if (e.kind === 'siphon') this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.3, true, 0x9a6aff);
          break;
        case 'parry': {
          // the moment: everything stops, a white ring, sparks of the player's colour, a ringing blade
          this.hitstop = Math.max(this.hitstop, 5 + Math.min(4, e.count));
          this.flash = Math.max(this.flash, 0.35);
          this.flashColor.set(0xffffff);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 6, 0.25, true, 0xffffff);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.4, true, LIVERY[e.id][2]);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 10 + e.count * 4, 0xffffff, 26, 0.3, 0.22);
          this.shove(0, -1, 0.5);
          this.pop(e.count > 1 ? `PARRY x${e.count}` : 'PARRY', e.x, e.z - 3, '#ffffff');
          audio.play('parry', { pan: e.x / HALF_W, pitch: 1 + Math.min(4, e.count - 1) * 0.06 });
          audio.duck(0.3);
          break;
        }
        case 'block':
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z - 1, 4 + e.count * 2, 0xc8c0d8, 12, 0.2, 0.2);
          this.trauma = Math.min(1, this.trauma + 0.15);
          audio.play('block', { pan: e.x / HALF_W });
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
          if (e.kill) this.hitstop = Math.max(this.hitstop, 3);
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
          this.hitstop = Math.max(this.hitstop, 4);
          this.trauma = Math.min(1, this.trauma + 0.35);
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z - 1, 14, 0xffd060, 20, 0.3, 0.25);
          this.shove(0, 1, 0.5);
          audio.play('ram', { pan: e.x / HALF_W });
          break;
        case 'crit':
          if (e.on) {
            const p = lv.players[e.id];
            this.fx.ring(p.x, FLIGHT_Y, p.z, 3.5, 0.25, true, 0xff6a8a);
            this.pop('CRITS!', p.x, p.z - 3, '#ff8aa8');
          }
          break;
        case 'decoy':
          if (e.kind === 'flare') audio.play('flare', { pan: e.x / HALF_W });
          break;
        case 'special': {
          this.trauma = Math.min(1, this.trauma + 0.6);
          this.flash = e.kind === 'bomb' ? 0.9 : 0.4;
          this.flashColor.set(e.kind === 'emp' ? 0x9ad8ff : e.kind === 'phase' ? 0xc8a0ff : 0xfff0c0);
          this.fx.ring(e.x, FLIGHT_Y, e.z, e.kind === 'bomb' ? 40 : 16, 0.6, true, LIVERY[e.id][2]);
          if (e.kind === 'bomb') for (let k = 0; k < 8; k++) this.fx.explode((Math.random() - 0.5) * 30, FLIGHT_Y - 2, lv.scroll + (Math.random() - 0.5) * 40, 1.5, 0xffc060);
          audio.play(`special_${e.kind}`);
          audio.duck(1);
          this.hitstop = Math.max(this.hitstop, 6);
          break;
        }
        case 'specialReady':
          audio.play('special_ready');
          this.pop('SPECIAL READY', lv.players[e.id].x, lv.players[e.id].z - 3, '#ffe08a');
          break;
        case 'pickup':
          if (e.kind === 'scrap') audio.play('pickup_scrap', { pan: e.x / HALF_W, vol: 0.6 });
          else if (e.kind === 'ring') {
            audio.play('pickup_scrap', { pan: e.x / HALF_W, pitch: 1.5 });
            this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.3, true, 0xffe08a);
            this.pop(`+${e.value}`, e.x, e.z, '#ffe08a');
          } else if (e.kind === 'repair') {
            audio.play('heal');
            this.pop('+1 HULL', e.x, e.z, '#8affb0');
          } else {
            audio.play('pickup_part');
            this.flash = 0.25;
            this.flashColor.set(0xa0ffe0);
            this.pop(e.part ? PART_NAMES(e.part) : 'PART', e.x, e.z, '#8affe0');
          }
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, e.kind === 'scrap' ? 3 : 14, 0xffe08a, 8, 0.25, 0.18);
          break;
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
          audio.play('laser_charge', { pan: e.x / HALF_W, vol: 0.6 });
          break;
        case 'bossWarning':
          this.bossBanner = { name: e.name, t: 0 };
          audio.play('boss_warning');
          audio.music('boss');
          break;
        case 'bossPhase':
          this.trauma = 0.8;
          this.flash = 0.5;
          this.flashColor.set(0xffffff);
          this.hitstop = 10;
          audio.play('explode_big');
          break;
        case 'biome': {
          const b = lv.terrain.segments[e.index]?.biome;
          if (b) this.biomeBanner = { name: b.name, line: b.line, t: 0 };
          break;
        }
        case 'hazard':
          if (e.kind === 'geyser' || e.kind === 'flare') audio.play('geyser', { pan: e.x / HALF_W, vol: 0.5 });
          break;
        case 'clear':
          audio.play('level_clear');
          if (lv.spec.mode === 'boss') {
            this.slowmo = 0.25;
            this.slowmoT = 1.6;
            this.flash = 1;
            this.flashColor.set(0xffffff);
            audio.play('explode_boss');
          }
          break;
        case 'failed':
          audio.music(null);
          break;
        case 'beam':
        case 'spawn':
          break;
      }
    }
  }

  /** Shoves the camera along (dx, dz), screen-ish: +z is down the screen. */
  private shove(dx: number, dz: number, amount: number) {
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
    if (this.multi === 3) this.pop('TRIPLE!', x, z - 3, '#8affe0');
    else if (this.multi >= 4 && this.multi % 2 === 0) this.pop(`MULTI x${this.multi}`, x, z - 3, '#8affe0');
    if (r >= 1.4) this.hitstop = Math.max(this.hitstop, 2 + Math.round(r));
    else if (this.multi >= 3) this.hitstop = Math.max(this.hitstop, 2);
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

  pop(text: string, x: number, z: number, color: string) {
    this.pops.push({ text, x, z, t: 0, color });
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
    this.halfW *= this.zoom;
    this.halfH *= this.zoom;
    const c = this.camera;
    c.left = -this.halfW;
    c.right = this.halfW;
    c.top = this.halfH;
    c.bottom = -this.halfH;
    c.updateProjectionMatrix();
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
    this.lighting(dt);
    this.updateShips(dt);
    this.updateEnemies(dt);
    this.updateBullets();
    this.updateShots();
    this.updateBeams();
    this.updateLasers();
    this.updatePickups(dt);
    this.updateDecoys();
    this.threats.update(dt, lv, this.halfW, this.halfH);
    this.updateHazards(dt);
    this.ambient(dt);
    this.updateClouds(dt);
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
    this.fx.update(dt, this.camera, scrollDz);
    for (const p of this.pops) {
      p.t += dt;
      p.z += scrollDz - dt * 3;
    }
    this.pops = this.pops.filter((p) => p.t < 0.9);
    if (this.biomeBanner) this.biomeBanner.t += dt;
    if (this.bossBanner) this.bossBanner.t += dt;
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
    if (this.slowmoT > 0) {
      this.slowmoT -= dt / Math.max(this.slowmo, 0.1);
      if (this.slowmoT <= 0) this.slowmo = 1;
    }
    this.placeCamera(dt);
    audio.intensity(clamp(0.35 + lv.enemies.length * 0.03 + lv.bullets.length * 0.004 + (lv.state === 'boss' ? 0.4 : 0), 0, 1));
  }

  /** Boosting: the view pulls back, the edges smear, streaks rush past, the air roars. */
  private speed(dt: number, scrollDz: number) {
    const lv = this.lv;
    const boost = Math.max(0, ...lv.players.map((p) => (p.down ? 0 : p.boosting)));
    const fast = clamp((lv.speedNow / Math.max(1, lv.speed) - 1) / 1.2, 0, 1);
    this.speedFx = damp(this.speedFx, Math.max(boost * 0.7, fast), 6, dt);
    this.zoom = damp(this.zoom, 1 + this.speedFx * 0.06, 3, dt);
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
        l.z = lv.scroll - this.halfH * 1.6 - Math.random() * 20;
        l.len = 4 + Math.random() * 10;
        l.v = 60 + Math.random() * 60;
      }
      if (l.z > 1e8) continue;
      // brighter at the edges of the screen, where the smear is
      const edge = Math.abs(l.x) / this.halfW;
      this.m.compose(this.v.set(l.x, FLIGHT_Y + 4, l.z), this.q.identity(), this.s.set(0.12, 1, l.len * (0.5 + this.speedFx)));
      this.lines.setMatrixAt(n, this.m);
      this.lines.setColorAt(n, this.c.setScalar(this.speedFx * (0.3 + edge * 0.7)));
      n++;
    }
    this.lines.count = n;
    this.lines.instanceMatrix.needsUpdate = true;
    if (this.lines.instanceColor) this.lines.instanceColor.needsUpdate = true;
  }

  private placeCamera(_dt: number) {
    const lv = this.lv;
    // (the pixel renderer snaps the camera to whole art pixels and slides the picture by the rest)
    const t = this.time;
    const shake = this.trauma * this.trauma;
    const sx = (Math.sin(t * 61) + Math.sin(t * 37) * 0.5) * shake * 0.9;
    const sz = (Math.cos(t * 53) + Math.sin(t * 29) * 0.5) * shake * 0.9;
    const target = this.v.set(sx + this.kick.x, FLIGHT_Y, lv.scroll + sz + this.kick.y + MARGIN / 2 / Math.cos(TILT));
    this.camera.position.set(target.x, target.y + Math.cos(TILT) * 120, target.z + Math.sin(TILT) * 120);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
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
    u.uHurt.value = this.hurt;
    u.uSpeed.value = this.speedFx;
    u.uTime.value = this.time;
    const hot = (bi: Biome) => (bi.waterGlow && bi.waterGlow >= 1 ? 0.6 : 0);
    u.uHeat.value = lerp(hot(a), hot(b), bl.t);
  }

  private updateShips(dt: number) {
    const lv = this.lv;
    lv.players.forEach((p, i) => {
      const ship = this.ships[i];
      if (!ship) return;
      ship.update(dt);
      const r = ship.root;
      const blink = p.inv > 0 && !p.down && p.dashT <= 0 && Math.floor(p.inv * 16) % 2 === 0;
      r.visible = !blink || p.phase > 0;
      r.position.set(p.x, FLIGHT_Y + (p.down ? -1.5 : 0), p.z);
      // lean into turns, nose down when pushing forward
      this.banks[i] = damp(this.banks[i], clamp(-p.vx / 22, -0.6, 0.6), 12, dt);
      ship.body.rotation.z = this.banks[i] + (p.down ? Math.sin(this.time * 3) * 0.3 + 0.5 : 0);
      ship.body.rotation.x = clamp(-p.vz / 60, -0.25, 0.25) + (p.down ? 0.2 : 0);
      ship.body.position.y = Math.sin(this.time * 2.3 + i) * 0.12;
      ship.body.position.z = this.recoil[i] ?? 0;
      // engines burn hotter going forward
      const push = (clamp(1 - p.vz / p.stats.speed, 0.3, 2) + p.boosting * 1.6) * (p.down ? 0 : 1);
      for (const f of ship.flames) {
        const fl = 0.8 + Math.random() * 0.4;
        f.scale.set(0.45 * fl, (0.6 + push * 0.6) * fl, 0.45 * fl);
      }
      ship.core.visible = false;
      const hb = this.hitboxes[i];
      if (hb) {
        hb.visible = p.focus && !p.down;
        hb.position.set(p.x, FLIGHT_Y + 1.2, p.z);
        hb.quaternion.copy(this.camera.quaternion);
      }
      ship.shield.visible = p.shield > 0 && !p.down;
      ship.flash(p.inv > 1.2 ? 1 : p.phase > 0 ? 0.5 : 0);
      if (p.phase > 0) r.visible = Math.floor(this.time * 20) % 3 !== 0;
      // a down ship smokes; a partner reviving it gets a ring
      if (p.down && Math.random() < 0.3) this.fx.add({ x: p.x, y: FLIGHT_Y, z: p.z, vy: 3, vz: 4, size: 0.8, grow: 2.5, life: 1, color: new THREE.Color(0x4a4040), to: new THREE.Color(0x2a2228), carried: true });
      if (p.down && p.revive > 0 && Math.random() < 0.5) this.fx.sparks(p.x, FLIGHT_Y, p.z, 2, 0x8affb0, 6, 0.3, 0.2);
      // redlining: the engines run red and smoke, more the hotter they get
      if (p.redline > 0.05 && Math.random() < p.redline)
        this.fx.add({ x: p.x + (Math.random() - 0.5), y: FLIGHT_Y, z: p.z + 1.8, vz: 8, vy: 2, size: 0.5, grow: 2.5, life: 0.5, color: new THREE.Color(0xff5a2a), to: new THREE.Color(0x3a2a2a), carried: true });
      // the parry's window: a bright rim round the ship while it's open
      if (p.parryT > 0) this.fx.add({ x: p.x, y: FLIGHT_Y + 0.8, z: p.z, size: 5, grow: 1.1, life: 0.04, color: this.c.setHex(0xffffff).multiplyScalar(0.5), carried: true });
      // the siphon: a purple whirl pulling in
      if (p.auxT > 0 && p.stats.aux === 'siphon' && Math.random() < 0.8) {
        const a = Math.random() * Math.PI * 2;
        this.fx.add({ x: p.x + Math.cos(a) * 7, y: FLIGHT_Y + 0.5, z: p.z + Math.sin(a) * 7, vx: -Math.cos(a) * 24 - Math.sin(a) * 10, vz: -Math.sin(a) * 24 + Math.cos(a) * 10, size: 0.3, grow: 0.2, life: 0.28, color: SIPHON, carried: true });
      }
      // a crit window: the guns run hot pink
      if (p.crit > 0 && Math.random() < 0.4) this.fx.sparks(p.x, FLIGHT_Y + 0.5, p.z, 1, 0xff6a8a, 6, 0.2, 0.2);
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
      audio.loop('flame', `p${i}`, p.firing && p.stats.guns.some((g) => g.spec.shot === 'flame') && !p.down, 0.6);
      // a flame gun throws fire
      if (p.firing && !p.down)
        p.stats.guns.forEach((g, k) => {
          if (g.spec.shot !== 'flame' || p.jam[k] > 0) return;
          for (let n = 0; n < 2; n++) {
            const a = g.dir + (Math.random() - 0.5) * 0.4;
            this.fx.add({ x: p.x + g.x, y: FLIGHT_Y + 0.4, z: p.z + g.z, vx: Math.sin(a) * 30, vz: -Math.cos(a) * 30, size: 0.4, grow: 3, life: 0.26, drag: 3, color: new THREE.Color(0xfff0a0), to: new THREE.Color(0xd0301a), carried: true });
          }
        });
    });
  }

  private updateEnemies(dt: number) {
    const lv = this.lv;
    const alive = new Set<number>();
    for (const e of lv.enemies) {
      if (e.t < 0) continue;
      alive.add(e.id);
      let v = this.enemies.get(e.id);
      if (!v) {
        v = this.makeEnemy(e);
        this.enemies.set(e.id, v);
      }
      v.inst?.update(dt);
      const groundZ = e.ground ? fromFlight(e.z, e.y) : e.z;
      const bob = e.ground ? 0 : Math.sin(this.time * 3 + e.id) * 0.15;
      v.punch = Math.max(0, v.punch - dt * 7);
      v.knock = Math.max(0, v.knock - dt * 6);
      v.obj.position.set(e.x, e.y + bob, groundZ - v.knock * 0.8);
      const foe = (FOES as Record<string, { scale: number } | undefined>)[e.arch];
      const base = (e.elite ? 1.3 : 1) * (foe?.scale ?? 1);
      v.obj.scale.set(base * (1 + v.punch * 0.22), base * (1 - v.punch * 0.15), base * (1 - v.punch * 0.12));
      const facing = e.boss ? 0 : e.heading + Math.PI;
      if (v.head) {
        v.head.rotation.y = e.heading + Math.PI;
        v.obj.rotation.y = 0;
      } else v.obj.rotation.y = facing;
      if (!e.ground && !e.boss) v.obj.rotation.z = clamp(-e.vx / 30, -0.5, 0.5);
      // the tell on the body: it heats up through the windup and flickers at the end; open to
      // punishment, it pulses; underground, it's gone; rolling, it spins
      v.obj.visible = e.state !== 'hidden';
      let glow = e.flash > 0 ? 1 : e.stun > 0 ? 0.3 * (Math.floor(this.time * 10) % 2) : 0;
      if (e.state === 'windup' && e.stateDur > 0) {
        const k = clamp(e.stateT / e.stateDur, 0, 1);
        glow = Math.max(glow, k > 0.8 ? (Math.floor(this.time * 24) % 2 ? 0.9 : 0.3) : k * 0.5);
      } else if (e.taken > 1.05) glow = Math.max(glow, 0.25 + 0.2 * Math.sin(this.time * 14));
      v.inst?.flash(glow);
      if (e.state === 'dodge') v.obj.rotation.z = e.stateT * 18;
      if (e.state === 'windup' && e.stateDur > 0) {
        // a wind-up crouch: it draws back before it goes
        const k = clamp(e.stateT / e.stateDur, 0, 1);
        v.obj.scale.multiplyScalar(1 - 0.08 * k);
      }
      if (e.shielded && e.boss) v.inst?.flash(0.25 + 0.2 * Math.sin(this.time * 20));
      if (v.ring) {
        v.ring.position.set(e.x, e.y - 0.4, groundZ);
        v.ring.rotation.z += dt * 2;
      }
      // smoke from the badly hurt
      if (e.hp < e.max * 0.35 && Math.random() < (e.boss ? 0.5 : 0.15))
        this.fx.add({ x: e.x + (Math.random() - 0.5) * e.r, y: e.y + 0.5, z: groundZ, vy: 2, vz: 3, size: 0.6, grow: 2, life: 0.8, color: new THREE.Color(0x3a3030), carried: !e.ground });
    }
    for (const [id, v] of this.enemies)
      if (!alive.has(id)) {
        this.scene.remove(v.obj);
        if (v.ring) this.scene.remove(v.ring);
        v.inst?.dispose();
        this.enemies.delete(id);
      }
  }

  private makeEnemy(e: Enemy): EnemyView {
    const fam = e.skin.kind;
    const foe = (FOES as Record<string, { model: string; scale: number } | undefined>)[e.arch];
    let kind = foe ? `enemy_${foe.model}_${fam}` : `enemy_${e.arch}_${fam}`;
    if (e.arch === 'serpent') {
      const head = e.d.leader === undefined;
      const tail = !head && !this.lv.enemies.some((o) => o.d.leader === e.d.leader && (o.d.index ?? 0) > (e.d.index ?? 0));
      kind = `enemy_serpent_${head ? 'head' : tail ? 'tail' : 'body'}_${fam}`;
    }
    if (e.boss) kind = `boss_${this.lv.spec.planet.id}`;
    const inst = library.clone(kind, 0, e.skin.colors, true) ?? library.clone(`enemy_${e.arch}_mech`, 0, e.skin.colors, true);
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
    if (e.arch !== 'turret') head = null;
    obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
    this.scene.add(obj);
    let ring: THREE.Mesh | null = null;
    if (e.elite) {
      ring = part(new THREE.RingGeometry(e.r * 1.4, e.r * 1.6, 6), flat(0xffd04a), [0, 0, 0], 1, [-Math.PI / 2, 0, 0]);
      this.scene.add(ring);
    }
    return { inst, obj, head, ring, seen: true, punch: 0, knock: 0 };
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
    const bs = this.lv.bullets;
    const n = Math.min(bs.length, 1500);
    const cam = this.camera.quaternion;
    const flick = Math.floor(this.time * 15) % 2;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      const big = b.kind === 'big' ? 2.2 : b.kind === 'mine' ? 1.6 : 1;
      const r = b.r * 2 * big;
      const stretch = b.kind === 'needle' ? 1.9 : 1;
      // turned to point along its motion, on the screen
      const ang = Math.atan2(b.vx, b.vz * Math.cos(TILT));
      this.q.copy(cam).multiply(ROT.setFromAxisAngle(Z, -ang));
      const pos = this.v.set(b.x, FLIGHT_Y + 1, b.z);
      const mineBlink = b.kind === 'mine' && b.t > b.life - 0.6 && flick ? 1 : 0;
      this.m.compose(pos, this.q, this.s.set(r * 1.35, r * 1.35 * stretch, 1));
      this.bulletRim.setMatrixAt(i, this.m);
      this.bulletRim.setColorAt(i, RIM);
      this.m.compose(pos, this.q, this.s.set(r, r * stretch, 1));
      this.bulletBody.setMatrixAt(i, this.m);
      this.bulletBody.setColorAt(i, mineBlink ? HOT : this.c.setHex(b.color).multiplyScalar(1.5));
      this.m.compose(pos, this.q, this.s.set(r * 0.5, r * 0.5 * stretch, 1));
      this.bulletCore.setMatrixAt(i, this.m);
      this.bulletCore.setColorAt(i, bulletCoreColor(b));
    }
    for (const im of [this.bulletRim, this.bulletBody, this.bulletCore]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  private updateShots() {
    const ss = this.lv.shots;
    let n = 0;
    for (const s of ss) {
      if (n >= 1500) break;
      if (s.kind === 'flame') continue; // drawn as fire particles
      const ang = Math.atan2(s.vx, s.vz);
      const len = s.kind === 'rail' ? 5 : s.kind === 'slug' ? 1.3 : s.kind === 'missile' ? 0.9 : s.kind === 'mine' || s.kind === 'flak' ? 0.7 : 0.6;
      const w = s.kind === 'rail' ? 0.45 : s.kind === 'flak' || s.kind === 'mine' ? 0.7 : s.kind === 'pellet' ? 0.35 : 0.3;
      this.q.setFromAxisAngle(Y, ang);
      this.m.compose(this.v.set(s.x, FLIGHT_Y + 0.6, s.z), this.q, this.s.set(w, 0.3, len));
      this.shots.setMatrixAt(n, this.m);
      const col = s.owner === 1 && s.kind === 'slug' ? 0xb0ffe8 : SHOT_COLORS[s.kind];
      this.shots.setColorAt(n, this.c.setHex(col).multiplyScalar(1.7));
      n++;
      if (s.kind === 'missile' && Math.random() < 0.7) this.fx.add({ x: s.x, y: FLIGHT_Y + 0.5, z: s.z, size: 0.4, grow: 2, life: 0.3, color: new THREE.Color(0xd0c0b0), to: new THREE.Color(0x5a5050) });
      if (s.kind === 'rail' && Math.random() < 0.8) this.fx.add({ x: s.x, y: FLIGHT_Y + 0.5, z: s.z, size: 0.5, grow: 0.1, life: 0.15, color: new THREE.Color(0x9af0ff), carried: true });
    }
    this.shots.count = n;
    this.shots.instanceMatrix.needsUpdate = true;
    if (this.shots.instanceColor) this.shots.instanceColor.needsUpdate = true;
  }

  private updateBeams() {
    let k = 0;
    for (const p of this.lv.players) {
      p.stats.guns.forEach((g, gi) => {
        const len = p.beam[gi];
        if (!len) return;
        let m = this.beams[k];
        if (!m) {
          m = part(GEO.box, flat(0xffffff), [0, 0, 0], 1);
          m.renderOrder = 24;
          const glow = part(GEO.box, flat(SHOT_COLORS.beam, { additive: true }), [0, 0, 0], [3, 0.5, 1]);
          m.add(glow);
          this.beams.push(m);
          this.scene.add(m);
        }
        m.visible = true;
        const w = 0.35 + Math.sin(this.time * 60) * 0.08;
        const x = p.x + g.x;
        const z = p.z + g.z;
        m.position.set(x + (Math.sin(g.dir) * len) / 2, FLIGHT_Y + 0.7, z - (Math.cos(g.dir) * len) / 2);
        m.rotation.y = -g.dir;
        m.scale.set(w, 0.2, len);
        if (Math.random() < 0.5) this.fx.sparks(x + Math.sin(g.dir) * len, FLIGHT_Y + 0.6, z - Math.cos(g.dir) * len, 1, 0x8af8ff, 10, 0.15, 0.25);
        k++;
      });
    }
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
        this.laserMeshes.push(m);
        this.scene.add(m);
      }
      const dx = l.x2 - l.x;
      const dz = l.z2 - l.z;
      const len = Math.hypot(dx, dz);
      m.visible = true;
      m.position.set(l.x + dx / 2, FLIGHT_Y + 0.9, l.z + dz / 2);
      m.rotation.y = Math.atan2(dx, dz);
      const mat = m.material as THREE.MeshBasicMaterial;
      if (l.warn > 0) {
        // the warning: a thin flickering line, faster as it's about to fire
        const on = Math.floor(this.time * (8 + (1 - l.warn) * 30)) % 2 === 0;
        m.visible = on;
        m.scale.set(0.18, 0.1, len);
        mat.color.setHex(l.color);
      } else {
        m.scale.set(1.6 + Math.sin(this.time * 70) * 0.25, 0.3, len);
        mat.color.setHex(Math.floor(this.time * 30) % 2 ? 0xffffff : l.color);
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
          inst = library.clone('pickup_scrap');
          obj = inst?.obj ?? part(GEO.oct, toon(0xc8b080), [0, 0, 0], 0.5);
        } else if (k.kind === 'part') {
          inst = library.clone('pickup_part');
          obj = inst?.obj ?? part(GEO.box, toon(0x5a8a6a, { glow: 0.3 }), [0, 0, 0], [1.1, 0.8, 0.8]);
        } else if (k.kind === 'repair') {
          obj = new THREE.Group();
          obj.add(part(GEO.box, flat(0x8affb0), [0, 0, 0], [1, 0.3, 0.35]), part(GEO.box, flat(0x8affb0), [0, 0, 0], [0.35, 0.3, 1]));
        } else {
          obj = part(new THREE.TorusGeometry(2.4, 0.22, 4, 18), toon(0xffd04a, { glow: 0.6 }), [0, 0, 0], 1);
        }
        this.scene.add(obj);
        v = { obj, inst };
        this.pickups.set(k, v);
      }
      v.inst?.update(dt);
      const done = k.kind === 'ring' && (k.done ?? 0) > 0;
      v.obj.position.set(k.x, FLIGHT_Y + (k.kind === 'ring' ? 0 : 0.5 + Math.sin(this.time * 4 + k.x) * 0.2), k.z);
      if (k.kind === 'ring') {
        v.obj.rotation.set(0, 0, 0);
        v.obj.rotation.x = -TILT * 0.4;
        v.obj.visible = !done || Math.floor(this.time * 20) % 2 === 0;
        v.obj.scale.setScalar(done ? 1.3 : 1);
      } else {
        v.obj.rotation.y += dt * (k.kind === 'part' ? 1.5 : 5);
        if (k.kind === 'part') {
          v.obj.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
          if (Math.random() < 0.15) this.fx.sparks(k.x, FLIGHT_Y + 0.5, k.z, 1, 0x8affe0, 4, 0.4, 0.2);
        }
      }
    }
    for (const [k, v] of this.pickups)
      if (!seen.has(k)) {
        this.scene.remove(v.obj);
        v.inst?.dispose();
        this.pickups.delete(k);
      }
  }

  private updateHazards(dt: number) {
    const lv = this.lv;
    const seen = new Set<object>();
    for (const h of lv.hazards) {
      seen.add(h);
      let g = this.hazards.get(h);
      if (!g) {
        g = this.makeHazard(h.kind, h.r);
        this.scene.add(g);
        this.hazards.set(h, g);
      }
      const warn = h.t < h.warn;
      const ground = h.kind === 'geyser' || h.kind === 'flare';
      const gy = ground ? Math.max(lv.terrain.height(h.x, fromFlight(h.z, 0)), lv.terrain.water(fromFlight(h.z, 0))) : 0;
      const z = ground ? fromFlight(h.z, gy) : h.z;
      g.position.set(h.x, ground ? gy : FLIGHT_Y, z);
      const [marker, body] = g.children;
      if (h.kind === 'laser_gate') {
        const on = lv.gateOn(h);
        g.position.set(0, FLIGHT_Y, h.z);
        body.visible = on;
        marker.visible = !on && Math.floor(this.time * 12) % 2 === 0;
        continue;
      }
      if (h.kind === 'spore_cloud') {
        g.rotation.y += dt * 0.5;
        g.scale.setScalar(h.t < h.warn ? h.t / h.warn : 1);
        continue;
      }
      marker.visible = warn ? Math.floor(this.time * (6 + (h.t / h.warn) * 20)) % 2 === 0 : false;
      body.visible = !warn;
      if (h.kind === 'falling_rocks') {
        // falls from above, shadow first
        const f = clamp(h.t / h.warn, 0, 1);
        marker.visible = true;
        marker.scale.setScalar(0.4 + f * 0.6);
        body.visible = true;
        body.position.y = (1 - f) * 30;
        body.rotation.x += dt * 5;
        if (!warn && h.t - h.warn < dt * 1.5) {
          this.fx.explode(h.x, FLIGHT_Y, h.z, 1, 0xb0a090);
          this.trauma = Math.max(this.trauma, 0.3);
          audio.play('crash', { pan: h.x / HALF_W, vol: 0.6 });
        }
      } else if (h.kind === 'lightning') {
        if (!warn && h.t - h.warn < dt * 1.5) {
          this.flash = Math.max(this.flash, 0.7);
          this.flashColor.set(0xd0e0ff);
          this.trauma = Math.max(this.trauma, 0.4);
          audio.play('lightning', { pan: h.x / HALF_W });
          this.bolt([h.x + (Math.random() - 0.5) * 6, h.z - 30, h.x, h.z], 0xd0e0ff);
        }
      } else if (!warn) {
        body.scale.set(1, 1 + Math.sin(this.time * 30) * 0.08, 1);
        if (Math.random() < 0.8) {
          const fire = h.kind === 'flare' || lv.terrain.biome(h.z).waterGlow;
          this.fx.add({ x: h.x + (Math.random() - 0.5) * h.r, y: gy + Math.random() * 14, z, vy: 12, size: 1, grow: 2.2, life: 0.5, color: new THREE.Color(fire ? 0xffd080 : 0xf0f4ff), to: new THREE.Color(fire ? 0x8a2a1a : 0x9aa8b8) });
        }
      }
    }
    for (const [h, g] of this.hazards)
      if (!seen.has(h)) {
        this.scene.remove(g);
        this.hazards.delete(h);
      }
  }

  private makeHazard(kind: string, r: number) {
    const g = new THREE.Group();
    const warnMat = flat(kind === 'lightning' ? 0xd0e0ff : kind === 'laser_gate' ? 0xff4a4a : 0xffd04a, { opacity: 0.7 });
    if (kind === 'laser_gate') {
      const marker = part(GEO.box, warnMat, [0, 0.8, 0], [HALF_W * 2, 0.1, 0.15]);
      const beam = part(GEO.box, flat(0xff4a5a), [0, 0.8, 0], [HALF_W * 2, 0.3, 0.6]);
      g.add(marker, beam);
      for (const s of [-1, 1]) g.add(part(GEO.cyl6, toon(0x4a4a5a), [s * (HALF_W - 0.5), -6, 0], [1.2, 16, 1.2]), part(GEO.sphere, toon(0xff4a4a, { glow: 1 }), [s * (HALF_W - 0.5), 1.6, 0], 1));
      return g;
    }
    if (kind === 'spore_cloud') {
      g.add(new THREE.Group(), new THREE.Group());
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const d = i === 0 ? 0 : r * 0.55;
        g.add(part(GEO.sphere, toon(0x8aff8a, { glow: 0.3, opacity: 0.55 }), [Math.cos(a) * d, (Math.random() - 0.5) * 2, Math.sin(a) * d], r * (0.6 + Math.random() * 0.4)));
      }
      return g;
    }
    const marker = part(new THREE.RingGeometry(r * 0.7, r, 12), warnMat, [0, 0.2, 0], 1, [-Math.PI / 2, 0, 0]);
    let body: THREE.Object3D;
    if (kind === 'falling_rocks') body = part(GEO.dodeca, toon(0x8a7a6a), [0, 30, 0], r * 1.3);
    else if (kind === 'lightning') body = new THREE.Group();
    else body = part(GEO.cyl6, flat(kind === 'flare' ? 0xffb040 : 0xe8f0ff, { opacity: 0.85 }), [0, 9, 0], [r * 1.6, 18, r * 1.6]);
    g.add(marker, body);
    return g;
  }

  /** The air of the place: ash, embers, spores, snow, rain… drifting through the view. */
  private ambient(dt: number) {
    const lv = this.lv;
    const b = lv.terrain.biome(lv.scroll);
    const kind = b.particles;
    if (kind === 'none') return;
    this.ambientT += dt * (kind === 'rain' ? 60 : kind === 'snow' || kind === 'ash' ? 22 : 12);
    while (this.ambientT > 1) {
      this.ambientT--;
      const x = (Math.random() - 0.5) * HALF_W * 2.4;
      const z = lv.scroll + (Math.random() - 0.6) * HALF_H * 2.2;
      const y = 2 + Math.random() * 14;
      switch (kind) {
        case 'ash':
          this.fx.add({ x, y: y + 6, z, vx: 1.5, vy: -2, vz: 1, size: 0.18, life: 3, glow: false, color: ASH });
          break;
        case 'snow':
          this.fx.add({ x, y: y + 6, z, vx: 2, vy: -3, vz: 1, size: 0.2, life: 3, glow: false, color: SNOW });
          break;
        case 'embers':
          this.fx.add({ x, y: Math.random() * 4, z, vx: (Math.random() - 0.5) * 2, vy: 4, size: 0.16, life: 2.2, color: EMBER, to: EMBER_END });
          break;
        case 'spores':
          this.fx.add({ x, y, z, vx: Math.sin(z) * 0.8, vy: 0.6, size: 0.18, life: 3, color: Math.random() < 0.5 ? SPORE : SPORE2 });
          break;
        case 'pollen':
          this.fx.add({ x, y, z, vx: 1.2, vy: 0.3, size: 0.14, life: 3, color: POLLEN });
          break;
        case 'motes':
          this.fx.add({ x, y, z, vy: 0.4, size: 0.16, grow: 0.2, life: 2.5, color: new THREE.Color(b.light) });
          break;
        case 'sand':
          this.fx.add({ x: x - 10, y: Math.random() * 6, z, vx: 18, vz: 2, size: 0.15, life: 1.4, glow: false, color: new THREE.Color(b.ground[2]) });
          break;
        case 'rain':
          this.fx.add({ x, y: 18, z: z - 4, vx: 3, vy: -40, vz: 6, size: 0.14, life: 0.45, glow: false, color: RAIN });
          break;
        case 'steam':
          if (Math.random() < 0.4) this.fx.add({ x, y: Math.max(lv.terrain.height(x, z), lv.terrain.water(z)), z, vy: 2.5, size: 1.4, grow: 2.5, life: 2, glow: false, color: STEAM, to: new THREE.Color(b.sky) });
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
    if (b.clouds !== null && this.clouds.length < 7 && Math.random() < dt * 0.8) {
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
    this.life.dispose();
    this.fx.clear();
    for (const s of this.ships) s?.dispose();
    for (const v of this.enemies.values()) v.inst?.dispose();
    audio.loop('beam', 'p0', false);
    audio.loop('beam', 'p1', false);
    audio.loop('flame', 'p0', false);
    audio.loop('flame', 'p1', false);
    audio.loop('engine', 'p1', false);
  }
}

const ROT = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);
const Y = new THREE.Vector3(0, 1, 0);
const RIM = new THREE.Color(0x1a1020);
const ASH = new THREE.Color(0xb8b0b0);
const SNOW = new THREE.Color(0xf4f8ff);
const EMBER = new THREE.Color(0xffc040);
const EMBER_END = new THREE.Color(0xa02a10);
const SPORE = new THREE.Color(0x9aff9a);
const SPORE2 = new THREE.Color(0xd0a0ff);
const POLLEN = new THREE.Color(0xfff0a0);
const RAIN = new THREE.Color(0x9ab8e8);
const STEAM = new THREE.Color(0xf8f0f4);
const CORE = new THREE.Color(0xfffff0).multiplyScalar(1.8);
const HOT = new THREE.Color(2, 2, 2);

/** A soft round puff, lighter on top: one texture for every cloud. */
const PUFF = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  for (const [x, y, r, a] of [[32, 34, 26, 1], [22, 36, 16, 0.8], [42, 35, 16, 0.8], [32, 26, 18, 0.9]] as const) {
    const g = ctx.createRadialGradient(x, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(236,236,244,${a * 0.75})`);
    g.addColorStop(1, 'rgba(200,204,222,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, n, n);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
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

function bulletCoreColor(b: Bullet) {
  return b.kind === 'big' ? HOT : CORE;
}

import { partById } from '../game/parts';
function PART_NAMES(id: string) {
  return partById(id)?.name.toUpperCase() ?? 'PART';
}

export type { Player };
const SCORCH = new THREE.Color(0x2e2620);
const SCORCH_END = new THREE.Color(0x3a3430);
const AIR = new THREE.Color(0xe8f0f8);
const SKIM = new THREE.Color(0xffd890);
const SIPHON = new THREE.Color(0xb08aff);
const FLARE = new THREE.Color(0xffe0a0).multiplyScalar(1.6);
