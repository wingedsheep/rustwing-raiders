import * as THREE from 'three';
import type { Level, LevelEvent, Player } from '../sim/level';
import { FLIGHT_Y, HALF_W } from '../sim/types';
import { ACID_R, ARMS_DRAW, ARMS_LEN, BIND_REACH, CRANE_R, DIVE_TELL, STOOP_R, STOOP_WARN } from '../sim/grafting';
import { BONDS, GRAFTS, type GraftId } from '../game/grafts';
import { PALETTE, type Faction } from '../sim/factions';
import { flat, GEO, part, toon } from '../render/toon';
import { audio } from '../audio';
import type { Fx } from './fx';
import type { TraitHost } from './traits';

/**
 * The wreck grafts in flight, drawn (see sim/grafting.ts for what they do). Each is drawn in its
 * faction's light, so you see whose move you're flying: a scrapper's red, the lattice's cyan, a
 * beast's pink, the bloom's green.
 *
 *  - Lanes and lines (a RAM LINE, a SQUARE TURN, a SKY DIVE's lane): drawn in light, then gone.
 *  - The TITAN EYE's beam, the SPINDLE's four arms and the CRANE's ball on its chain: meshes that
 *    live as long as the move does.
 *  - Acid, spore clouds, a STOOP's shadow, a HEART BIND's vines: drawn every frame from the sim.
 *  - A wreck taken: its name called, its faction's light thrown up. Not taken: a word on how.
 */

const ACCENT: Record<Faction, number> = { scrap: PALETTE.scrap[2], lattice: PALETTE.lattice[2], wild: PALETTE.wild[2], bloom: PALETTE.bloom[2] };
export const graftHex = (g: GraftId) => ACCENT[GRAFTS[g].faction];
const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const WHITE = new THREE.Color(0xffffff);
const ACID = new THREE.Color(0xb0ff4a);
const ACID_DARK = new THREE.Color(0x4a7a1a);
const SPORE = new THREE.Color(0xb88aff);
const SPORE_END = new THREE.Color(0x6a4a8a);
const SHADOW = new THREE.Color(0x0a0610);

interface Line {
  mesh: THREE.Mesh;
  t: number;
  life: number;
  /** Carried with the screen. */
  carried: boolean;
  /** Grows out from its start over this long (0: there at once). */
  grow: number;
  len: number;
  w: number;
}

interface ArmsView {
  root: THREE.Group;
  arms: THREE.Mesh[];
  tips: THREE.Mesh[];
}

interface CraneView {
  root: THREE.Group;
  ball: THREE.Group;
  links: THREE.Mesh[];
}

/** How many times each "how to" has been said this session. */
const told = new Map<string, number>();

export class GraftsView {
  readonly group = new THREE.Group();
  private lines: Line[] = [];
  private beams: THREE.Mesh[] = [];
  private arms = new Map<number, ArmsView>();
  private cranes = new Map<number, CraneView>();
  private vines: THREE.Mesh[] = [];
  private shadows: THREE.Mesh[] = [];
  private c = new THREE.Color();
  private time = 0;
  /** When each graft's name was last called (they're named now and then, not every time). */
  private said = new Map<string, number>();

  constructor(
    private readonly lv: Level,
    private readonly fx: Fx,
    private readonly host: TraitHost,
  ) {
    for (let i = 0; i < lv.players.length; i++) {
      const beam = part(GEO.box, flat(ACCENT.scrap, { additive: true, own: true }), [0, FLIGHT_Y + 0.5, 0], [1, 0.1, 1]);
      beam.visible = false;
      beam.renderOrder = 27;
      this.beams.push(beam);
      this.group.add(beam);
    }
  }

  /** Calls a graft's name over the ship, now and then. */
  private name(g: GraftId, x: number, z: number, big = false) {
    const t = this.said.get(g) ?? -9;
    if (this.lv.time - t < 12 && !big) return;
    this.said.set(g, this.lv.time);
    this.host.pop(GRAFTS[g].name, x, z - 4, css(graftHex(g)), big);
  }

  /** A line of light from (x, z) to (x2, z2). */
  private line(x: number, z: number, x2: number, z2: number, color: number, w: number, life: number, grow = 0, carried = true) {
    const len = Math.hypot(x2 - x, z2 - z);
    if (len < 0.1) return;
    const mesh = part(GEO.box, flat(color, { additive: true, own: true }), [x, FLIGHT_Y + 0.4, z], [w, 0.08, len]);
    mesh.rotation.y = Math.atan2(x2 - x, z2 - z);
    mesh.renderOrder = 26;
    mesh.userData.from = [x, z];
    this.group.add(mesh);
    this.lines.push({ mesh, t: 0, life, carried, grow, len, w });
  }

  /** The events that are this view's to make a fuss of. Returns true if it took it. */
  handle(e: LevelEvent): boolean {
    const lv = this.lv;
    if (e.type === 'wreck') return this.wreck(e);
    if (e.type === 'bond') {
      const t = this.said.get(`bond:${e.faction}`) ?? -9;
      this.fx.ring(e.x, FLIGHT_Y, e.z, e.faction === 'wild' ? 5 : 3, 0.22, true, ACCENT[e.faction]);
      if (lv.time - t > 8) {
        this.said.set(`bond:${e.faction}`, lv.time);
        this.host.pop(`✦ ${BONDS[e.faction].name}`, e.x, e.z - 5, css(ACCENT[e.faction]));
      }
      return true;
    }
    if (e.type !== 'graft') return false;
    const p = lv.players[e.id];
    const col = graftHex(e.graft);
    const pan = e.x / HALF_W;
    switch (e.graft) {
      case 'ramline':
        if (e.what === 'line') {
          // the line, drawn the length of the dash, white at its heart
          this.line(e.x, e.z, e.x2!, e.z2!, col, 2.4, 0.28, 0.06);
          this.line(e.x, e.z, e.x2!, e.z2!, 0xffffff, 0.7, 0.2, 0.06);
          this.fx.sparks(e.x, FLIGHT_Y + 0.4, e.z, 8, col, 16, 0.25, 0.2);
          audio.play('ram', { pan, pitch: 1.3, vol: 0.6 });
          this.name('ramline', e.x, e.z);
        } else {
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, col, 22, 0.3, 0.24);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.18, true, 0xffffff);
          this.debris(e.x, e.z, 6, col);
          this.host.juice({ trauma: 0.14, hitstop: 2, dx: p?.dashX, dz: p?.dashZ, shove: 0.3 });
          audio.play('ram', { pan, pitch: 0.85 });
        }
        return true;
      case 'broadside': {
        // both flanks flash and smoke
        const a = e.n ?? 0;
        for (const side of [-1, 1]) {
          const at = a + (side * Math.PI) / 2;
          const mx = e.x + Math.sin(at) * 1.1;
          const mz = e.z - Math.cos(at) * 1.1;
          this.fx.add({ x: mx, y: FLIGHT_Y + 0.6, z: mz, size: 2.4, grow: 0.3, life: 0.08, color: this.c.setHex(0xfff0c0), carried: true });
          for (let k = 0; k < 5; k++)
            this.fx.add({ x: mx, y: FLIGHT_Y + 0.5, z: mz, vx: Math.sin(at) * (8 + k * 3), vz: -Math.cos(at) * (8 + k * 3), vy: 1, size: 0.8, grow: 2.6, life: 0.5, drag: 5, color: this.c.setHex(0x8a8290), glow: false, carried: true });
        }
        this.host.juice({ trauma: e.what === 'perfect' ? 0.25 : 0.14, hitstop: e.what === 'perfect' ? 3 : 1 });
        audio.play('shot_flak', { pan, pitch: 0.75 });
        audio.play('shot_scatter', { pan, pitch: 0.7 });
        this.name('broadside', e.x, e.z, e.what === 'perfect');
        return true;
      }
      case 'torpedo':
        if (e.what === 'hit') {
          this.fx.explode(e.x, FLIGHT_Y, e.z, 1.6, col);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.25, true, col);
          this.host.juice({ trauma: 0.12, hitstop: 2 });
          audio.play('explode_small', { pan, pitch: 0.8 });
        } else {
          this.fx.add({ x: e.x, y: FLIGHT_Y + 0.4, z: e.z, vy: 1, size: 1.2, grow: 2.4, life: 0.5, color: this.c.setHex(0x9a9098), glow: false, carried: true });
          this.fx.sparks(e.x, FLIGHT_Y + 0.4, e.z, 5, col, 8, 0.2, 0.18);
          audio.play('torpedo_launch', { pan, pitch: 1.25, vol: 0.55 });
          this.name('torpedo', e.x, e.z);
        }
        return true;
      case 'eye':
        if (p) this.fx.add({ x: p.x, y: FLIGHT_Y + 0.8, z: p.z - 0.6, size: 3, grow: 0.4, life: 0.12, color: this.c.setHex(col), carried: true });
        audio.play('laser_fire', { pan, pitch: 1.4, vol: 0.55 });
        this.name('eye', e.x, e.z);
        return true;
      case 'squareturn':
        // it stops dead, draws the lane square to it, and goes
        this.line(e.x, e.z, e.x2!, e.z2!, col, 1.2, 0.22, 0.05);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 2.2, 0.15, true, col);
        this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 6, col, 12, 0.18, 0.18);
        audio.play('seeker_halt', { pan, pitch: 1.5, vol: 0.55 });
        this.name('squareturn', e.x, e.z);
        return true;
      case 'halo':
        this.fx.ring(e.x, FLIGHT_Y, e.z, 9, 0.3, true, col);
        this.fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.18, true, 0xffffff);
        this.host.juice({ trauma: 0.1, flash: 0.12, flashColor: col });
        audio.play('parry', { pan, pitch: 1.3, vol: 0.7 });
        this.name('halo', e.x, e.z);
        return true;
      case 'spindle':
        if (e.what === 'draw') {
          audio.play('laser_charge', { pan, pitch: 1.6, vol: 0.6 });
          this.name('spindle', e.x, e.z, true);
        } else if (e.what === 'spin') {
          this.fx.ring(e.x, FLIGHT_Y, e.z, ARMS_LEN * 2, 0.3, true, col);
          this.host.juice({ trauma: 0.18, flash: 0.15, flashColor: col });
          audio.play('special_emp', { pan, pitch: 1.3, vol: 0.7 });
        } else {
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 14, col, 18, 0.3, 0.2);
        }
        return true;
      case 'crane':
        if (e.what === 'go' || e.what === 'turn') audio.play('boomerang', { pan, pitch: 0.6, vol: 1 });
        if (e.what === 'go') this.name('crane', e.x, e.z);
        else if (e.what === 'bat') {
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 6 + (e.n ?? 1) * 2, 0xffe08a, 18, 0.22, 0.2);
          audio.play('parry', { pan, pitch: 0.8, vol: 0.6 });
        } else if (e.what === 'hit') {
          this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.2, true, 0xffe08a);
          this.debris(e.x, e.z, 8, 0xffd04a);
          this.host.juice({ trauma: 0.2, hitstop: 3 });
          audio.play('ram', { pan, pitch: 0.6 });
        }
        return true;
      case 'thorns':
        if (e.what === 'burst') {
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 8, col, 16, 0.2, 0.16);
          this.fx.ring(e.x, FLIGHT_Y, e.z, 3.5, 0.16, true, col);
          audio.play('mark_crack', { pan, pitch: 1.5, vol: 0.35 });
        }
        return true;
      case 'stoop':
        if (e.what === 'shadow') {
          audio.play('wingbeat', { pan, pitch: 1.4, vol: 0.6 });
          this.name('stoop', e.x, e.z);
        } else {
          // the talons come down: a slam of air and feathers
          this.fx.ring(e.x, FLIGHT_Y, e.z, STOOP_R * 2.2, 0.28, true, col);
          this.fx.ring(e.x, FLIGHT_Y, e.z, STOOP_R, 0.16, true, 0xffffff);
          this.fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: STOOP_R * 1.6, grow: 0.5, life: 0.1, color: this.c.setHex(0xfff0f4), carried: true });
          for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = 6 + Math.random() * 10;
            this.fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 2, size: 0.35, grow: 0.6, life: 0.6, drag: 3, gravity: 3, color: this.c.setHex(k % 2 ? col : 0xf0e8e0), carried: true });
          }
          this.host.juice({ trauma: 0.28, hitstop: 3, flash: 0.1, flashColor: col });
          audio.play('shriek', { pan, pitch: 1.6, vol: 0.4 });
          audio.play('explode_small', { pan, pitch: 0.7 });
        }
        return true;
      case 'acid':
        if (e.what === 'spit') audio.play('shot_mine', { pan, pitch: 1.6, vol: 0.5 });
        else {
          this.fx.sparks(e.x, FLIGHT_Y + 0.3, e.z, 14, 0xb0ff4a, 12, 0.35, 0.22);
          this.fx.ring(e.x, FLIGHT_Y - 0.2, e.z, ACID_R * 2, 0.2, true, 0xb0ff4a);
          audio.play('eat', { pan, pitch: 0.7 });
          this.name('acid', e.x, e.z);
        }
        return true;
      case 'skydive':
        if (e.what === 'lane') {
          // the lane drawn across the screen, the way she drew yours
          this.line(e.x, e.z, e.x2!, e.z2!, col, 7, DIVE_TELL + 0.3, DIVE_TELL * 0.7);
          this.line(e.x, e.z, e.x2!, e.z2!, 0xffffff, 0.6, DIVE_TELL + 0.2, DIVE_TELL * 0.7);
          audio.play('shriek', { pan, pitch: 1.2, vol: 0.55 });
          this.name('skydive', e.x, e.z, true);
        } else if (e.what === 'dive') {
          this.host.juice({ trauma: 0.2, shove: 0.5, dx: Math.sign((p?.gs.dive?.dir ?? 1)), dz: 0 });
          audio.play('wingbeat', { pan, pitch: 0.8 });
          audio.play('boost', { pan, pitch: 1.3 });
        } else if (e.what === 'ram') {
          this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 10, col, 18, 0.25, 0.2);
          this.host.juice({ hitstop: 2 });
        } else if (e.what === 'burst') {
          this.fx.explode(e.x, FLIGHT_Y, e.z, 1.1, col);
          audio.play('explode_small', { pan, pitch: 1.2, vol: 0.5 });
        } else if (e.what === 'end') this.fx.ring(e.x, FLIGHT_Y, e.z, 5, 0.2, true, col);
        return true;
      case 'bind':
        if (e.what === 'bind') {
          const at = lv.enemies.find((o) => o.id === e.n);
          this.fx.ring(e.x, FLIGHT_Y, e.z, (at?.r ?? 2) * 3, 0.3, true, col);
          this.fx.ring(e.x, FLIGHT_Y, e.z, BIND_REACH * 2, 0.45, true, col);
          if (p) this.line(p.x, p.z, e.x, e.z, col, 0.5, 0.25);
          audio.play('hook', { pan, pitch: 0.7 });
          this.name('bind', e.x, e.z, true);
        } else if (Math.random() < 0.35) audio.play('feed', { pan, pitch: 0.6, vol: 0.4 });
        return true;
      case 'spores':
        return true;
      case 'bloom':
        this.fx.ring(e.x, FLIGHT_Y, e.z, 8, 0.3, true, col);
        this.fx.sparks(e.x, FLIGHT_Y + 0.5, e.z, 16, col, 14, 0.4, 0.22);
        audio.play('eat', { pan, pitch: 0.55 });
        this.name('bloom', e.x, e.z);
        return true;
    }
    return false;
  }

  /** An elite down: its wreck taken (its name, the faction's light), or not (and how to). */
  private wreck(e: Extract<LevelEvent, { type: 'wreck' }>) {
    const col = ACCENT[e.faction];
    if (e.lost) {
      const n = told.get('wreck') ?? 0;
      if (n < 4) {
        told.set('wreck', n + 1);
        this.host.pop('NO WRECK: TAKE IT DOWN FIRST', e.x, e.z - 6, '#a898b8');
      }
      return true;
    }
    this.fx.ring(e.x, FLIGHT_Y, e.z, 14, 0.5, true, col);
    this.fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.3, true, 0xffffff);
    // a column of the faction's light off the wreck
    for (let k = 0; k < 18; k++) this.fx.add({ x: e.x + (Math.random() - 0.5) * 2, y: FLIGHT_Y, z: e.z + (Math.random() - 0.5) * 2, vy: 8 + Math.random() * 10, size: 0.5, grow: 0.2, life: 0.7, drag: 1, color: this.c.setHex(Math.random() < 0.3 ? 0xffffff : col), carried: true });
    this.host.pop(`WRECK TAKEN · ${e.title}`, e.x, e.z - 7, css(col), true);
    this.host.juice({ flash: 0.2, flashColor: col });
    audio.play('loot_epic', { pan: e.x / HALF_W, pitch: 0.8, vol: 0.7 });
    return true;
  }

  private debris(x: number, z: number, n: number, col: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 6 + Math.random() * 10;
      this.fx.add({ x, y: FLIGHT_Y + 0.6, z, vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.7, vy: 4 + Math.random() * 5, size: 0.16 + Math.random() * 0.16, life: 1, color: this.c.setHex(Math.random() < 0.5 ? col : 0xffffff), solid: true, gravity: 26, spin: 14 });
    }
  }

  update(dt: number, scrollDz: number) {
    this.time += dt;
    const lv = this.lv;
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.t += dt;
      // grows out from its start, then thins and fades
      const g = l.grow > 0 ? Math.min(1, l.t / l.grow) : 1;
      const [fx, fz] = l.mesh.userData.from as [number, number];
      const a = l.mesh.rotation.y;
      const len = l.len * g;
      l.mesh.userData.from = [fx, fz + (l.carried ? scrollDz : 0)];
      l.mesh.position.x = fx + Math.sin(a) * len * 0.5;
      l.mesh.position.z = fz + (l.carried ? scrollDz : 0) + Math.cos(a) * len * 0.5;
      const fade = 1 - Math.max(0, (l.t - l.life * 0.6) / (l.life * 0.4));
      l.mesh.scale.set(l.w * (0.4 + 0.6 * fade) * (1 + 0.15 * Math.sin(this.time * 50)), 0.08, Math.max(0.01, len));
      (l.mesh.material as THREE.MeshBasicMaterial).opacity = fade;
      if (l.t >= l.life) {
        this.group.remove(l.mesh);
        (l.mesh.material as THREE.Material).dispose();
        this.lines.splice(i, 1);
      }
    }
    lv.players.forEach((p, i) => {
      this.eyeBeam(p, this.beams[i]);
      this.spindle(p, i);
      this.crane(p, i);
      this.dive(p);
    });
    this.field();
  }

  /** The TITAN EYE's beam, from the ship to as far as it reaches. */
  private eyeBeam(p: Player, beam: THREE.Mesh) {
    const eye = p.gs.eye;
    beam.visible = eye.t > 0 && !p.down;
    if (!beam.visible) return;
    const len = eye.len;
    const open = Math.min(1, (0.9 - eye.t) / 0.08, eye.t / 0.12);
    const w = (0.5 + 0.9 * open) * (1 + 0.2 * Math.sin(this.time * 60));
    const dx = Math.sin(eye.a);
    const dz = -Math.cos(eye.a);
    beam.position.set(p.x + dx * len * 0.5, FLIGHT_Y + 0.6, p.z + dz * len * 0.5);
    beam.rotation.y = Math.atan2(dx, dz);
    beam.scale.set(w, 0.1, len);
    (beam.material as THREE.MeshBasicMaterial).color.setHex(graftHex('eye')).lerp(WHITE, 0.25);
    // its core, and where it burns
    this.fx.add({ x: p.x + dx * len, y: FLIGHT_Y + 0.6, z: p.z + dz * len, size: 1.6 + Math.random(), grow: 0.4, life: 0.08, color: this.c.setHex(0xd0ffd8), carried: true });
    if (Math.random() < 0.5) this.fx.add({ x: p.x + dx * len * Math.random(), y: FLIGHT_Y + 0.6, z: p.z + dz * len * Math.random(), vy: 2, size: 0.35, grow: 0.2, life: 0.2, color: this.c.setHex(graftHex('eye')), carried: true });
  }

  private spindle(p: Player, i: number) {
    const a = p.gs.arms;
    let v = this.arms.get(i);
    if (!a || p.down) {
      if (v) v.root.visible = false;
      return;
    }
    if (!v) {
      const root = new THREE.Group();
      const col = graftHex('spindle');
      const arms: THREE.Mesh[] = [];
      const tips: THREE.Mesh[] = [];
      for (let n = 0; n < 4; n++) {
        const arm = part(GEO.box, flat(col, { additive: true, own: true }), [0, 0, 0], [0.4, 0.1, 1]);
        arm.renderOrder = 27;
        const tip = part(GEO.oct, toon(0xe8ecf0), [0, 0, 0], 0.9);
        root.add(arm, tip);
        arms.push(arm);
        tips.push(tip);
      }
      this.group.add(root);
      v = { root, arms, tips };
      this.arms.set(i, v);
    }
    v.root.visible = true;
    v.root.position.set(p.x, FLIGHT_Y + 0.5, p.z);
    // drawn out first (thin, flickering, growing), then solid and turning
    const drawing = a.t < 0;
    const reach = drawing ? ARMS_LEN * Math.min(1, 1 + a.t / ARMS_DRAW) : ARMS_LEN;
    v.arms.forEach((m, n) => {
      const arm = a.a + (n * Math.PI) / 2;
      const dx = Math.sin(arm);
      const dz = -Math.cos(arm);
      m.position.set(dx * reach * 0.5, 0, dz * reach * 0.5);
      m.rotation.y = Math.atan2(dx, dz);
      const w = drawing ? 0.12 + (Math.floor(this.time * 30) % 2) * 0.1 : 0.5 + 0.12 * Math.sin(this.time * 40 + n);
      m.scale.set(w, 0.1, reach);
      const tip = v!.tips[n];
      tip.visible = !drawing;
      tip.position.set(dx * reach, 0, dz * reach);
      tip.rotation.y += 0.3;
      if (!drawing && Math.random() < 0.5) this.fx.add({ x: p.x + dx * reach, y: FLIGHT_Y + 0.5, z: p.z + dz * reach, size: 0.7, grow: 0.2, life: 0.14, color: this.c.setHex(graftHex('spindle')), carried: true });
    });
  }

  private crane(p: Player, i: number) {
    const c = p.gs.crane;
    let v = this.cranes.get(i);
    if (!c || p.down) {
      if (v) v.root.visible = false;
      return;
    }
    if (!v) {
      const root = new THREE.Group();
      const ball = new THREE.Group();
      ball.add(part(GEO.dodeca, toon(0x4a4652), [0, 0, 0], CRANE_R * 2));
      ball.add(part(GEO.torus, toon(0xffd04a), [0, 0, 0], CRANE_R * 2.1, [Math.PI / 2, 0, 0]));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        ball.add(part(GEO.cone4, toon(0x6a6470), [Math.cos(a) * CRANE_R, 0, Math.sin(a) * CRANE_R], [0.5, 0.7, 0.5], [0, -a, -Math.PI / 2]));
      }
      const links: THREE.Mesh[] = [];
      for (let k = 0; k < 7; k++) {
        const l = part(GEO.torus, toon(0x8a8490), [0, 0, 0], 0.55, [Math.PI / 2, k % 2 ? Math.PI / 2 : 0, 0]);
        links.push(l);
        root.add(l);
      }
      root.add(ball);
      root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      this.group.add(root);
      v = { root, ball, links };
      this.cranes.set(i, v);
    }
    v.root.visible = true;
    v.root.position.set(0, 0, 0);
    // the ball hangs below the ship and swings out under it
    v.ball.position.set(c.x, FLIGHT_Y - 0.6, c.z);
    v.ball.rotation.y += 0.25;
    v.links.forEach((l, k) => {
      const t = (k + 1) / (v!.links.length + 1);
      l.position.set(p.x + (c.x - p.x) * t, FLIGHT_Y - 0.2 - 0.6 * t, p.z + (c.z - p.z) * t);
      l.rotation.y = Math.atan2(c.x - p.x, c.z - p.z);
    });
    // a smear of light behind the ball as it goes
    this.fx.add({ x: c.x, y: FLIGHT_Y - 0.4, z: c.z, size: CRANE_R * 1.6, grow: 0.4, life: 0.12, color: this.c.setHex(0xffd04a).multiplyScalar(0.5), carried: true });
  }

  private dive(p: Player) {
    const d = p.gs.dive;
    if (!d || d.t < 0 || p.down) return;
    // the dive's wake: feathers of light off the ship
    const col = graftHex('skydive');
    for (let k = 0; k < 2; k++) this.fx.add({ x: p.x - d.dir * (0.5 + Math.random()), y: FLIGHT_Y + 0.5, z: p.z + (Math.random() - 0.5) * 1.4, vx: -d.dir * 6, size: 0.8, grow: 1.6, life: 0.3, color: this.c.setHex(k ? col : 0xfff0f4), carried: true });
  }

  /** What the grafts leave about: shadows, acid, spores, binds. */
  private field() {
    const lv = this.lv;
    const gr = lv.grafting;
    // a STOOP's shadow, falling and darkening, ringed in its faction's light
    let n = 0;
    for (const st of gr.stoops) {
      const m = this.pooled(this.shadows, n++, () => {
        const mesh = part(GEO.disc, new THREE.MeshBasicMaterial({ color: SHADOW, transparent: true, depthWrite: false }), [0, 0, 0], 1, [-Math.PI / 2, 0, 0]);
        mesh.renderOrder = 22;
        return mesh;
      });
      const k = Math.min(1, st.t / STOOP_WARN);
      m.position.set(st.x, FLIGHT_Y - 0.3, st.z);
      m.scale.setScalar(STOOP_R * 2 * (0.4 + 0.6 * k));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.45 * k;
      if (Math.random() < 0.4) this.fx.add({ x: st.x, y: FLIGHT_Y, z: st.z, size: STOOP_R * 2 * (1.2 - 0.6 * k), grow: 0.9, life: 0.1, color: this.c.setHex(graftHex('stoop')).multiplyScalar(0.25 + 0.3 * k), carried: true });
    }
    for (let k = n; k < this.shadows.length; k++) this.shadows[k].visible = false;
    // acid in flight: a glob arcing, dripping
    for (const g of gr.globs) {
      const t = Math.min(1, g.t / 0.42);
      const x = g.x0 + (g.x - g.x0) * t;
      const z = lv.scroll + g.z0 + (g.z - g.z0) * t;
      const y = FLIGHT_Y + 0.5 + Math.sin(t * Math.PI) * 4;
      this.fx.add({ x, y, z, size: 0.9, grow: 0.3, life: 0.08, color: ACID, carried: true });
      if (Math.random() < 0.5) this.fx.add({ x, y, z, vy: -3, size: 0.3, grow: 0.5, life: 0.3, color: ACID, to: ACID_DARK, carried: true });
    }
    for (const c of gr.patches) {
      const fade = Math.min(1, c.t / 0.15, (c.life - c.t) / 0.5);
      if (c.kind === 'acid') {
        // a hissing pool: bubbles that rise and pop
        if (Math.random() < 0.6 * fade) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * c.r;
          this.fx.add({ x: c.x + Math.cos(a) * r, y: FLIGHT_Y - 0.3, z: c.z + Math.sin(a) * r, vy: 2, size: 0.3 + Math.random() * 0.4, grow: 1.4, life: 0.3, color: this.c.copy(ACID).multiplyScalar(0.7 * fade), carried: true });
        }
        if (Math.random() < 0.5) this.fx.add({ x: c.x, y: FLIGHT_Y - 0.5, z: c.z, size: c.r * 2.2, grow: 1, life: 0.06, color: this.c.copy(ACID_DARK).multiplyScalar(0.6 * fade), carried: true });
      } else if (Math.random() < 0.7 * fade) {
        // a drifting cloud of spores, soft and slow
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * c.r * 0.8;
        this.fx.add({ x: c.x + Math.cos(a) * r, y: FLIGHT_Y + 0.2, z: c.z + Math.sin(a) * r, vx: (Math.random() - 0.5) * 1.5, vy: 0.5, size: 1.2 + Math.random() * 1.2, grow: 1.6, life: 0.7, color: this.c.copy(SPORE).multiplyScalar(0.5), to: SPORE_END, glow: false, carried: true });
      }
    }
    // HEART BIND: vines from the bound to what's round it, a heart that beats over it
    let v = 0;
    for (const b of gr.binds) {
      const e = lv.enemies.find((o) => o.id === b.enemy && !o.dead);
      if (!e) continue;
      const beat = 0.5 + 0.5 * Math.max(0, Math.sin(this.time * 7));
      if (Math.random() < 0.5) this.fx.add({ x: e.x, y: FLIGHT_Y + 1.5, z: e.z - e.r - 0.5, size: 1 + beat * 0.8, grow: 0.3, life: 0.1, color: this.c.setHex(graftHex('bind')), carried: true });
      for (const o of lv.enemies) {
        if (o === e || o.dead || (o.x - e.x) ** 2 + (o.z - e.z) ** 2 > BIND_REACH * BIND_REACH) continue;
        const m = this.pooled(this.vines, v++, () => {
          const mesh = part(GEO.box, flat(graftHex('bind'), { additive: true, own: true }), [0, 0, 0], 1);
          mesh.renderOrder = 26;
          return mesh;
        });
        const len = Math.hypot(o.x - e.x, o.z - e.z);
        m.position.set((o.x + e.x) / 2, FLIGHT_Y + 0.3, (o.z + e.z) / 2);
        m.rotation.y = Math.atan2(o.x - e.x, o.z - e.z);
        m.scale.set(0.18 + 0.2 * beat, 0.06, len);
        (m.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * beat * Math.min(1, b.t);
      }
    }
    for (let k = v; k < this.vines.length; k++) this.vines[k].visible = false;
  }

  /** The `k`th mesh of a pool, made if it's not there yet, and shown. */
  private pooled(pool: THREE.Mesh[], k: number, make: () => THREE.Mesh) {
    let m = pool[k];
    if (!m) {
      m = make();
      pool.push(m);
      this.group.add(m);
    }
    m.visible = true;
    return m;
  }

  dispose() {
    for (const l of this.lines) (l.mesh.material as THREE.Material).dispose();
    for (const m of [...this.beams, ...this.vines, ...this.shadows]) (m.material as THREE.Material).dispose();
  }
}

/** The colour a graft's shot burns (its faction's light), or null for a shot that isn't one. */
export const graftShotColor = (g: GraftId | undefined) => (g ? graftHex(g) : null);

