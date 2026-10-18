import * as THREE from 'three';
import { TORPEDO, type Enemy, type Level } from '../sim/level';
import type { Tele } from '../sim/combat';
import type { Strike } from '../sim/strikes';
import { FOES, type Faction } from '../sim/factions';
import { FLIGHT_Y } from '../sim/types';
import { clamp } from '../util';

/**
 * What's about to hurt you, drawn flat on the flight plane over the finished picture (in the
 * view's overlay, so the paint and grade never muddy it): the tells (lines, wedges, circles, rings,
 * gates), the strikes (shells on their markers, shockwaves, puddles, harpoons), shield arcs, and the
 * tethers between things. Each faction warns in its own colour; a tell brightens as it ripens and
 * turns white-hot once it has locked.
 *
 * Immediate mode: a pool of meshes per shape, handed out afresh each frame.
 */

/** The colour each faction warns in; anything older warns in plain danger red. */
export const TELL_COLOR: Record<Faction, number> = { scrap: 0xffb02a, lattice: 0x4ae8ff, wild: 0xff5a8a, bloom: 0xb0ff4a };
const DANGER = 0xff4a3a;
const INK = 0x140c18;

const Y = FLIGHT_Y + 1.5;
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const DISC = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
const RING = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
const CHEVRON = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 0, 0, 1, 1, 0, 0, -1, 0, -0.6, 0, 0, 0.4, 1, 0, -0.6], 3));
  g.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
  return g;
})();

class Pool {
  private meshes: THREE.Mesh[] = [];
  private used = 0;
  constructor(
    private group: THREE.Group,
    private geo: THREE.BufferGeometry,
    private order: number,
  ) {}
  take(color: number, opacity: number): THREE.Mesh {
    let m = this.meshes[this.used];
    if (!m) {
      m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
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
  /** Hides what wasn't handed out this frame. */
  end() {
    for (let i = this.used; i < this.meshes.length; i++) this.meshes[i].visible = false;
    this.used = 0;
  }
}

export class Threats {
  readonly group = new THREE.Group();
  private planes = new Pool(this.group, PLANE, 44);
  private discs = new Pool(this.group, DISC, 43);
  private rings = new Pool(this.group, RING, 45);
  private chevrons = new Pool(this.group, CHEVRON, 46);
  /** Wedges and arcs depend on their angles: built as needed and kept by key. */
  private arcs = new Map<string, THREE.Mesh>();
  private arcsUsed = new Set<string>();
  private time = 0;

  update(dt: number, lv: Level, halfW: number, halfH: number) {
    this.time += dt;
    for (const e of lv.enemies) {
      if (e.dead || e.t < 0) continue;
      const col = colorOf(e);
      if (e.tele && (e.state === 'windup' || e.state === 'attack')) this.tele(e, e.tele, col, lv, halfW, halfH);
      if (!e.boss && e.hitT < 1.4 && e.hp > 0 && e.state !== 'hidden') this.health(e);
      if (e.bounty) this.bounty(e);
      for (const id of e.links) {
        const o = lv.enemies.find((x) => x.id === id && !x.dead);
        if (o) this.line(e.x, e.z, o.x, o.z, 0.25, 0xb0ff4a, 0.45 + 0.2 * Math.sin(this.time * 8));
      }
      if (e.grab >= 0) {
        const p = lv.players[e.grab];
        if (p) this.line(e.x, e.z, p.x, p.z, 0.3, 0xffd890, 0.9);
      }
    }
    for (const s of lv.strikes) if (!s.dead) this.strike(s, lv, halfW);
    this.fire(lv);
    this.planes.end();
    this.discs.end();
    this.rings.end();
    this.chevrons.end();
    for (const [k, m] of this.arcs)
      if (!this.arcsUsed.has(k)) {
        this.group.remove(m);
        m.geometry.dispose();
        this.arcs.delete(k);
      }
    this.arcsUsed.clear();
  }

  /** How ripe a tell is (0 → 1 over the windup), and whether it has stopped tracking. */
  private ripe(e: Enemy, lock = 0) {
    const k = e.state === 'attack' ? 1 : e.stateDur > 0 ? clamp(e.stateT / e.stateDur, 0, 1) : 0.5;
    const locked = e.state === 'attack' || (lock > 0 && e.stateT >= lock);
    return { k, locked };
  }

  private tele(e: Enemy, t: Tele, col: number, lv: Level, halfW: number, halfH: number) {
    const { k, locked } = this.ripe(e, t.shape === 'line' ? t.lock : 0);
    // the last beat before it goes: a quick flicker, so the timing reads
    const flick = k > 0.8 && e.state === 'windup' ? (Math.floor(this.time * 24) % 2 ? 1 : 0.6) : 1;
    const c = locked ? 0xffffff : col;
    const a = (0.25 + 0.5 * k) * flick;
    switch (t.shape) {
      case 'line': {
        if (t.body) {
          this.charge(t, k, locked, col, flick);
          break;
        }
        this.line(t.x, t.z, t.x2, t.z2, t.w, col, a * 0.5);
        // the core fills in from the source as it ripens
        const fx = t.x + (t.x2 - t.x) * k;
        const fz = t.z + (t.z2 - t.z) * k;
        this.line(t.x, t.z, fx, fz, Math.max(0.25, t.w * 0.3), c, a + 0.2);
        break;
      }
      case 'sweep': {
        const m = this.arc(`s${e.id}`, 0, t.len, t.a0, t.a1, col, a * 0.45);
        m.position.set(t.x, Y, t.z);
        // the beam's leading edge, where it will start
        this.line(t.x, t.z, t.x + Math.sin(t.a0) * t.len, t.z + Math.cos(t.a0) * t.len, t.w, c, a + 0.2);
        break;
      }
      case 'circle': {
        const ring = this.rings.take(c, a + 0.3);
        ring.position.set(t.x, Y, t.z);
        ring.scale.setScalar(t.r);
        const fill = this.discs.take(col, 0.15 + 0.25 * k);
        fill.position.set(t.x, Y - 0.01, t.z);
        fill.scale.setScalar(Math.max(0.05, t.r * k));
        break;
      }
      case 'ring': {
        // where the shockwave will stop, and a thin preview of its thickness
        const ring = this.rings.take(c, a);
        ring.position.set(t.x, Y, t.z);
        ring.scale.setScalar(t.r);
        const inner = this.rings.take(col, a * 0.5);
        inner.position.set(t.x, Y, t.z);
        inner.scale.setScalar(Math.max(0.1, t.r - t.w));
        break;
      }
      case 'edge': {
        // a chevron pinned to the screen's edge, pointing in at where it'll come from
        const bottom = t.z > lv.scroll;
        const z = bottom ? lv.scroll + halfH * 1.1 - 2 : lv.scroll - halfH * 1.1 + 2;
        const x = clamp(t.x, -halfW + 3, halfW - 3);
        for (let n = 0; n < 2; n++) {
          const ch = this.chevrons.take(c, a + 0.3 - n * 0.25);
          ch.position.set(x, Y, z + (bottom ? -n * 1.6 : n * 1.6) + (bottom ? -1 : 1) * Math.sin(this.time * 10) * 0.4);
          ch.scale.setScalar(1.6);
          ch.rotation.y = bottom ? Math.PI : 0;
        }
        break;
      }
      case 'gate':
        this.gate(t.x, t.x2, t.z, t.gx, t.gap, col, a);
        break;
      case 'lock':
        this.lock(e, t.id, k, col, flick, lv);
        break;
    }
  }

  /**
   * A lock-on: four brackets close in on the ship from wide and turned, squaring up as the lock
   * ripens, with a dotted line back to who's locking. At the end they snap tight and go white.
   */
  private lock(e: Enemy, id: number, k: number, col: number, flick: number, lv: Level) {
    const p = lv.players[id];
    if (!p || p.down) return;
    const ease = 1 - (1 - k) ** 2;
    const r = 9 - 6.2 * ease;
    const turn = (1 - ease) * Math.PI * 0.75;
    const hot = k > 0.85 ? 0xffffff : col;
    const a = (0.55 + 0.45 * k) * flick;
    const arm = Math.min(r * 0.45, 1.6);
    // ink first, then the light on it, so the brackets read on any ground
    for (const [w, c, o] of [[0.62, INK, 0.7 * flick], [0.3, hot, a]] as const)
      for (let n = 0; n < 4; n++) {
        const ang = turn + Math.PI / 4 + (n * Math.PI) / 2;
        const cx = p.x + Math.sin(ang) * r;
        const cz = p.z + Math.cos(ang) * r;
        // the corner's two arms run back along the box's sides
        for (const side of [-1, 1]) {
          const ea = ang + Math.PI + (side * Math.PI) / 4;
          this.line(cx - Math.sin(ea) * w * 0.4, cz - Math.cos(ea) * w * 0.4, cx + Math.sin(ea) * arm, cz + Math.cos(ea) * arm, w, c, o);
        }
      }
    // the line back to the launcher, marching towards you
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const len = Math.hypot(dx, dz);
    if (len > 4) {
      const ux = dx / len;
      const uz = dz / len;
      const step = 2.4;
      for (let d = 2 + ((this.time * 8) % step); d < len - r; d += step) this.line(e.x + ux * d, e.z + uz * d, e.x + ux * (d + 1), e.z + uz * (d + 1), 0.16, col, 0.35 * flick);
    }
  }

  /**
   * What enemy fire is about to do: an arrow at your ship's edge for every torpedo still
   * chasing you (pointing where it's coming from, brighter the nearer it is), and the lanes a
   * mine's shrapnel will fly, drawn out from it as it ripens.
   */
  private fire(lv: Level) {
    for (const b of lv.bullets) {
      if (b.dead) continue;
      if (b.kind === 'torpedo' && b.t < TORPEDO.fuel) {
        const p = lv.players[b.seek];
        if (!p || p.down) continue;
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 3.5) continue;
        const near = clamp(1 - (dist - 4) / 30, 0.15, 1);
        const blink = near > 0.75 && Math.floor(this.time * 16) % 2 ? 0.55 : 1;
        const ch = this.chevrons.take(near > 0.75 ? 0xffffff : 0xff6a3a, (0.35 + 0.6 * near) * blink);
        ch.position.set(p.x + (dx / dist) * 3.6, Y, p.z + (dz / dist) * 3.6);
        ch.scale.setScalar(0.8 + 0.3 * near);
        ch.rotation.y = Math.atan2(-dx, -dz);
      } else if (b.split > 0) {
        const k = clamp(b.t / b.life, 0, 1);
        if (k < 0.25) continue;
        const ripe = (k - 0.25) / 0.75;
        const r0 = b.r * 2 * 1.6 * 1.5;
        const len = 1 + ripe * 3.5;
        const hot = ripe > 0.8 ? 0xffffff : b.color;
        for (let n = 0; n < b.split; n++) {
          const a = b.splitA + (n / b.split) * Math.PI * 2;
          const sx = Math.sin(a);
          const cz = Math.cos(a);
          this.line(b.x + sx * r0, b.z + cz * r0, b.x + sx * (r0 + len), b.z + cz * (r0 + len), 0.22, hot, 0.25 + 0.55 * ripe);
        }
      }
    }
  }

  /**
   * Where a charging enemy will run: a faint lane with rails along its edges, chevrons marching
   * down it towards where it ends, and a bar across the end. Reads as a path, not a beam: the
   * chevrons light up from the enemy outwards as it ripens, and go white once it's locked.
   */
  private charge(t: Extract<Tele, { shape: 'line' }>, k: number, locked: boolean, col: number, flick: number) {
    const dx = t.x2 - t.x;
    const dz = t.z2 - t.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const ux = dx / len;
    const uz = dz / len;
    const half = t.w / 2;
    const hot = locked ? 0xffffff : col;
    // the lane: a whisper of a fill, and its two edges
    this.line(t.x, t.z, t.x2, t.z2, t.w, col, (0.06 + 0.08 * k) * flick);
    for (const sd of [-1, 1]) {
      const ox = -uz * half * sd;
      const oz = ux * half * sd;
      this.line(t.x + ox, t.z + oz, t.x2 + ox, t.z2 + oz, 0.14, col, (0.3 + 0.35 * k) * flick);
    }
    // chevrons from just past the body to the end, lit up to how ripe it is, sliding forwards
    const step = Math.max(2.2, t.w * 0.9);
    const start = Math.min(len * 0.3, 2 + t.w * 0.5);
    const off = (this.time * (locked ? 14 : 5)) % step;
    const size = clamp(t.w * 0.35, 0.7, 1.8);
    const angle = Math.atan2(dx, dz);
    for (let d = start + off; d < len - size; d += step) {
      const f = d / len;
      const lit = f <= k;
      // fade in at the start of the lane and out at its end, so the march reads smoothly
      const edge = clamp(Math.min((d - start) / step, (len - size - d) / step), 0, 1);
      const ch = this.chevrons.take(lit ? hot : col, (lit ? 0.85 : 0.22) * edge * flick);
      ch.position.set(t.x + ux * d, Y + 0.02, t.z + uz * d);
      ch.scale.setScalar(size);
      ch.rotation.y = angle;
    }
    // where it stops
    const bx = t.x2 - ux * 0.3;
    const bz = t.z2 - uz * 0.3;
    this.line(bx + uz * half, bz - ux * half, bx - uz * half, bz + ux * half, 0.45, k >= 1 || locked ? hot : col, (0.4 + 0.5 * k) * flick);
  }

  private strike(s: Strike, lv: Level, halfW: number) {
    const warn = s.t < s.warn;
    const k = warn ? clamp(s.t / s.warn, 0, 1) : 1;
    const col = s.color || DANGER;
    switch (s.kind) {
      case 'shell':
      case 'acid': {
        if (warn) {
          // the marker where it lands, filling as it falls; the shell itself on its arc
          const ring = this.rings.take(k > 0.75 ? 0xffffff : col, 0.5 + 0.4 * k);
          ring.position.set(s.x, Y, s.z);
          ring.scale.setScalar(s.r);
          const fill = this.discs.take(col, 0.2 + 0.2 * k);
          fill.position.set(s.x, Y - 0.01, s.z);
          fill.scale.setScalar(Math.max(0.05, s.r * k));
          const bx = s.sx + (s.x - s.sx) * k;
          const bz = s.sz + (s.z - s.sz) * k;
          const shell = this.discs.take(s.kind === 'acid' ? 0xc8ff6a : 0xfff0c0, 1);
          shell.position.set(bx, Y + 0.5 + Math.sin(k * Math.PI) * 4, bz - Math.sin(k * Math.PI) * 4);
          shell.scale.setScalar(0.5 + Math.sin(k * Math.PI) * 0.4);
        } else this.blast(s, col);
        break;
      }
      case 'slam':
      case 'puddle':
      case 'spore': {
        if (warn) {
          const ring = this.rings.take(col, 0.4 + 0.4 * k);
          ring.position.set(s.x, Y, s.z);
          ring.scale.setScalar(s.r);
        } else this.blast(s, col);
        break;
      }
      case 'wave': {
        const ring = this.rings.take(s.effect === 'slow' ? 0xb0ff4a : warn ? col : 0xffffff, warn ? 0.3 + 0.3 * k : 0.85);
        ring.position.set(s.x, Y, s.z);
        ring.scale.setScalar(Math.max(0.2, s.r));
        if (!warn && s.w > 0) {
          const inner = this.rings.take(col, 0.6);
          inner.position.set(s.x, Y, s.z);
          inner.scale.setScalar(Math.max(0.1, s.r - s.w));
        }
        break;
      }
      case 'gate':
        this.gate(-halfW - 4, halfW + 4, s.z, s.gx, s.gap, warn ? col : 0xffffff, warn ? 0.3 + 0.4 * k : 0.9);
        break;
      case 'harpoon': {
        const head = this.discs.take(0xfff0c0, 1);
        head.position.set(s.x, Y + 0.1, s.z);
        head.scale.setScalar(0.5);
        const o = lv.enemies.find((e) => e.id === s.owner);
        if (o) this.line(o.x, o.z, s.x, s.z, 0.2, 0xffd890, 0.9);
        break;
      }
    }
  }

  /** A strike going off: a hot disc that fades over its active time. */
  private blast(s: Strike, col: number) {
    const f = s.active > 0 ? clamp((s.t - s.warn) / s.active, 0, 1) : 1;
    const hot = s.kind === 'puddle' ? 0.5 + 0.15 * Math.sin(this.time * 12 + s.x) : 0.85 * (1 - f);
    const d = this.discs.take(s.kind === 'puddle' ? 0x9aff4a : s.kind === 'spore' ? 0xc8a0ff : f < 0.3 ? 0xffffff : col, hot);
    d.position.set(s.x, Y - 0.02, s.z);
    d.scale.setScalar(s.r * (s.kind === 'puddle' ? 1 : 0.8 + 0.4 * f));
  }

  /** A beam across from x to x2 at z, with a gap at gx ± gap. */
  private gate(x: number, x2: number, z: number, gx: number, gap: number, col: number, a: number) {
    const l0 = gx - gap;
    const r0 = gx + gap;
    if (l0 > x) this.line(x, z, l0, z, 0.7, col, a);
    if (r0 < x2) this.line(r0, z, x2, z, 0.7, col, a);
    // the gap's posts, so the hole reads
    for (const px of [l0, r0]) {
      const post = this.discs.take(0xffffff, a + 0.2);
      post.position.set(px, Y + 0.05, z);
      post.scale.setScalar(0.7);
    }
  }

  /** A bounty: a gold ring round it that runs down like a clock, blinking when it's nearly away. */
  private bounty(e: Enemy) {
    const left = clamp(1 - e.t / Math.max(0.1, e.bounty!.life), 0, 1);
    const blink = left < 0.25 && Math.floor(this.time * 10) % 2 ? 0.35 : 1;
    const r = e.r * 1.6 + 1.2;
    const m = this.arc(`b${e.id}`, r - 0.3, r, -Math.PI * Math.round(left * 40) / 40, Math.PI * Math.round(left * 40) / 40, 0xffd04a, 0.9 * blink);
    m.position.set(e.x, Y, e.z);
    m.rotation.y = Math.PI;
  }

  /**
   * Hit, it shows how much it has left for a moment: a slim bar under it, what the last hits
   * took flashing white at its end. (Shields are drawn in the scene, see shields.ts.)
   */
  private health(e: Enemy) {
    const fade = clamp((1.4 - e.hitT) / 0.3, 0, 1);
    const w = clamp(e.r * 2.2, 2.4, 6);
    const z = e.z + e.r + 1.3;
    const f = clamp(e.hp / e.max, 0, 1);
    const ink = this.planes.take(INK, 0.75 * fade);
    ink.position.set(e.x, Y, z);
    ink.scale.set(w + 0.3, 1, 0.55);
    const fill = this.planes.take(e.hitT < 0.07 ? 0xffffff : f > 0.5 ? 0xfff0c0 : f > 0.25 ? 0xffb04a : 0xff5a3a, 0.95 * fade);
    fill.position.set(e.x - (w * (1 - f)) / 2, Y + 0.05, z);
    fill.scale.set(Math.max(0.05, w * f), 1, 0.3);
  }

  /** A flat band from (x, z) to (x2, z2), w wide. */
  private line(x: number, z: number, x2: number, z2: number, w: number, col: number, a: number) {
    const len = Math.hypot(x2 - x, z2 - z);
    if (len < 0.01) return;
    const m = this.planes.take(col, a);
    m.position.set((x + x2) / 2, Y, (z + z2) / 2);
    m.rotation.y = Math.atan2(x2 - x, z2 - z);
    m.scale.set(w, 1, len);
  }

  /**
   * A wedge (r0 = 0) or arc band from angle a0 to a1, in the sim's convention (0 = +z, as
   * atan2(dx, dz)). Kept by key, since its shape is baked into the geometry.
   */
  private arc(key: string, r0: number, r1: number, a0: number, a1: number, col: number, a: number) {
    const k = `${key}:${r0.toFixed(1)}:${r1.toFixed(1)}:${a0.toFixed(2)}:${a1.toFixed(2)}`;
    let m = this.arcs.get(k);
    if (!m) {
      const lo = Math.min(a0, a1);
      const span = Math.abs(a1 - a0);
      // RingGeometry sweeps from +x towards +y; flat on the ground that's +x towards -z, so turn
      // the sim's angle (from +z towards +x) into it
      const g = new THREE.RingGeometry(r0, r1, 24, 1, Math.PI / 2 - lo - span, span).rotateX(-Math.PI / 2);
      m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 44;
      m.frustumCulled = false;
      this.group.add(m);
      this.arcs.set(k, m);
    }
    this.arcsUsed.add(k);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.color.setHex(col);
    mat.opacity = clamp(a, 0, 1);
    m.rotation.set(0, 0, 0);
    return m;
  }
}

function colorOf(e: Enemy) {
  const def = (FOES as Record<string, { faction: Faction } | undefined>)[e.arch];
  return def ? TELL_COLOR[def.faction] : DANGER;
}
