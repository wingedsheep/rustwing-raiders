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
 *    winds up) and banks into the turn.
 *  - Shedding: a part tagged `shed` (a glTF extra) breaks off as that phase starts.
 */

/** Moves it turns to face. */
const TURNS = new Set(['charge', 'rake', 'skydive']);
/** Moves it turns its gaze along (part of the way: a fortress doesn't spin round). */
const LOOKS: Record<string, number> = { scan: 0.35 };
const FADE = 0.18;

/** What it says when it sheds, by planet and phase. */
const SHED_LINE: Record<string, string[]> = {
  orutal: ['', 'THE CAGE CRACKS', 'SHE BREAKS FREE'],
  glacis: ['', 'THE ICE BREAKS', 'IT IS AWAKE'],
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
  }

  update(e: Enemy, dt: number, obj: THREE.Object3D) {
    const b = e.boss!;
    const move = b.move;
    const state = e.state === 'windup' || e.state === 'attack' || e.state === 'recover' || e.state === 'stagger' ? e.state : null;
    let next = this.inst.actions.get(`${this.kind}_p${b.phase}`) ?? this.idle;
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
    if (move && TURNS.has(move) && (state === 'windup' || state === 'attack')) {
      const fast = Math.hypot(vx, vz) > 10;
      if (state === 'attack' && fast) want = Math.atan2(vx, vz);
      else if (move === 'skydive') want = b.dir * (Math.PI / 2);
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
    const line = pieces.length ? SHED_LINE[this.kind.replace('boss_', '')]?.[phase] ?? '' : '';
    return { line, pieces };
  }
}
