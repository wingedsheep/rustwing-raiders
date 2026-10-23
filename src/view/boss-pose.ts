import * as THREE from 'three';
import type { Enemy } from '../sim/level';
import type { Instance } from '../render/assets';
import { clamp, damp } from '../util';

/**
 * A boss's body language: the pose clips from its model (tools/models/bosses.py) played as it
 * moves, its facing and bank, and the pieces it sheds between phases.
 *
 *  - Poses: `boss_<planet>_<move>_<state>`, else `boss_<planet>_<move>` (for its windup and
 *    attack), else `boss_<planet>_<state>`, else its idle. A windup goes into its pose and holds
 *    there; the rest loop. Cross-faded, so a boss without them just idles. A boss can idle
 *    differently in each phase (`boss_<planet>_p<phase>`: the Engine stirring, awake; else its idle).
 *  - Facing: on a charge, a rake or a sky dive it turns to face where it's going (its aim while it
 *    winds up) and banks into the turn; on a sky dive or a broadside it goes side-on.
 *  - Shedding: a part tagged `shed` (a glTF extra) breaks off as that phase starts; one tagged
 *    `plate` breaks off when the boss has torn that many away (ARU-0's ballast). One tagged
 *    `appear` is hidden until that phase (Khet in his titan's jaw, the Compact's light on it).
 *  - Looking up the screen: a pursuer on its chase (behind you), ARU-0 in its silence (facing
 *    Glacis, in its `silence` clip).
 */

/** Moves it turns to face (a sky dive and a broadside: side-on, along the way it'll go). */
const TURNS = new Set(['charge', 'rake', 'skydive', 'broadside', 'ram']);
const SIDE_ON = new Set(['skydive', 'broadside']);
/** Moves it turns its gaze along (part of the way: a fortress doesn't spin round; Istra brings her bow round on you; Khet's titan its eye, and its brow over its shield). */
const LOOKS: Record<string, number> = { scan: 0.35, irons: 0.6, eye: 0.45, measure: 0.5, kneel: 0.7 };
const FADE = 0.18;

/** What it says when it sheds, by planet and phase. */
const SHED_LINE: Record<string, string[]> = {
  orutal: ['', 'THE CAGE CRACKS', 'SHE BREAKS FREE'],
  glacis: ['', 'THE ICE BREAKS', 'IT IS AWAKE'],
  vesh: ['', 'RUN OUT THE GUNS', 'THE CREW ABANDONS HER'],
  // (3: called)
  cinder: ['', '', '', 'IT THROWS OFF THE COMPANY'],
};

export interface Shed {
  x: number;
  y: number;
  z: number;
  color: number;
}

export class BossPose {
  private cur: THREE.AnimationAction | null;
  private readonly idle: THREE.AnimationAction | null;
  private yaw = 0;
  private bank = 0;
  private lx = NaN;
  private lz = NaN;
  private shed = 0;

  constructor(
    private readonly inst: Instance,
    private readonly kind: string,
  ) {
    this.idle = [...inst.actions].find(([n]) => n.endsWith('_idle'))?.[1] ?? null;
    this.cur = this.idle;
    inst.obj.traverse((o) => {
      if (o.userData.appear) o.visible = false;
    });
  }

  update(e: Enemy, dt: number, obj: THREE.Object3D) {
    const b = e.boss!;
    const move = b.move;
    const state = e.state === 'windup' || e.state === 'attack' || e.state === 'recover' || e.state === 'stagger' ? e.state : null;
    let next = (b.hush > 0 ? this.inst.actions.get(`${this.kind}_silence`) : undefined) ?? this.inst.actions.get(`${this.kind}_p${b.phase}`) ?? this.idle;
    const rest = next;
    if (move && state) {
      const a = this.inst.actions;
      next =
        a.get(`${this.kind}_${move}_${state}`) ??
        (state === 'windup' || state === 'attack' ? a.get(`${this.kind}_${move}`) : undefined) ??
        a.get(`${this.kind}_${state}`) ??
        rest;
    }
    // (the same windup again, as a sky dive lines up its next pass: from the top)
    if (next !== this.cur || (state === 'windup' && e.stateT < dt * 1.5 && next !== rest)) this.play(next, state === 'windup');

    // facing: down the line it's taking, banked into its turn
    const vx = Number.isNaN(this.lx) ? 0 : (e.x - this.lx) / Math.max(dt, 1e-3);
    const vz = Number.isNaN(this.lz) ? 0 : (e.z - this.lz) / Math.max(dt, 1e-3);
    this.lx = e.x;
    this.lz = e.z;
    let want = 0;
    if (b.faceUp) want = Math.PI;
    else if (move && TURNS.has(move) && (state === 'windup' || state === 'attack')) {
      const fast = Math.hypot(vx, vz) > 10;
      if (state === 'attack' && fast && !SIDE_ON.has(move)) want = Math.atan2(vx, vz);
      else if (SIDE_ON.has(move)) want = b.dir * (Math.PI / 2);
      else want = e.aim;
    } else if (move && LOOKS[move] && (state === 'windup' || state === 'attack')) want = e.aim * LOOKS[move];
    const da = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += da * clamp(dt * 7, 0, 1);
    // across its heading: lean into it (the sideways part of how it's moving)
    const side = vx * Math.cos(this.yaw) - vz * Math.sin(this.yaw);
    this.bank = damp(this.bank, clamp(-side / 70, -0.6, 0.6) - da * 0.4, 8, dt);
    obj.rotation.y = this.yaw;
    obj.rotation.z = this.bank;
  }

  private play(next: THREE.AnimationAction | null, hold: boolean) {
    if (!next) return;
    next.reset();
    next.setLoop(hold ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = hold;
    next.play();
    if (this.cur && this.cur !== next) this.cur.crossFadeTo(next, FADE, false);
    else next.fadeIn(FADE);
    this.cur = next;
  }

  /** It has torn `n` plates away: those tagged up to `n` break off. Where they were, for the shards. */
  plateTo(n: number): Shed[] {
    const pieces: Shed[] = [];
    const p = new THREE.Vector3();
    this.inst.obj.updateMatrixWorld(true);
    this.inst.obj.traverse((o) => {
      const at = o.userData.plate as number | undefined;
      if (at === undefined || at > n || !o.visible) return;
      o.getWorldPosition(p);
      const mesh = o as THREE.Mesh;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshToonMaterial | undefined;
      pieces.push({ x: p.x, y: p.y, z: p.z, color: mat?.color?.getHex() ?? 0xe8e8e0 });
      o.visible = false;
    });
    return pieces;
  }

  /** It starts phase `phase`: the parts it sheds by then break off. Where they were, for the shards. */
  shedTo(phase: number): { line: string; pieces: Shed[] } {
    const pieces: Shed[] = [];
    if (phase <= this.shed) return { line: '', pieces };
    this.shed = phase;
    const p = new THREE.Vector3();
    this.inst.obj.updateMatrixWorld(true);
    this.inst.obj.traverse((o) => {
      const at = o.userData.shed as number | undefined;
      if (at === undefined || at > phase || !o.visible) return;
      o.getWorldPosition(p);
      const mesh = o as THREE.Mesh;
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshToonMaterial | undefined;
      pieces.push({ x: p.x, y: p.y, z: p.z, color: mat?.color?.getHex() ?? 0xc8a040 });
      o.visible = false;
    });
    this.inst.obj.traverse((o) => {
      const at = o.userData.appear as number | undefined;
      if (at !== undefined && at <= phase) o.visible = true;
    });
    const line = pieces.length ? SHED_LINE[this.kind.replace('boss_', '')]?.[phase] ?? '' : '';
    return { line, pieces };
  }
}
