import * as THREE from 'three';
import type { Hazard, Level } from '../sim/level';
import { FLIGHT_Y, HALF_W, TILT, fromFlight } from '../sim/types';
import { GEO, part, toon } from '../render/toon';
import { audio } from '../audio';
import { clamp } from '../util';
import { depthScale } from '../render/alive';
import type { Fx } from './fx';

/** What a hazard asks of the level view: a bolt of lightning drawn, the screen shaken or flashed. */
export interface HazardHooks {
  bolt(points: number[], color: number): void;
  juice(o: { trauma?: number; flash?: number; flashColor?: number }): void;
}

/** How a hazard is dressed, by where it is. */
type Theme =
  | 'lava' | 'steam' | 'flare'
  | 'crystal' | 'sandstone' | 'glass' | 'plating' | 'stalactite' | 'rock'
  | 'storm' | 'spores'
  | 'frost' | 'rust' | 'chem';

const THEMES: Record<string, Theme> = {
  basalt: 'lava',
  springs: 'steam',
  refinery: 'flare',
  prism: 'crystal',
  mesarun: 'sandstone',
  glass: 'glass',
  titans: 'plating',
  tidecaves: 'stalactite',
  stormwall: 'storm',
  sporevents: 'spores',
  enginecity: 'frost',
  pipeline: 'rust',
  chemlake: 'chem',
};

/** One hazard, drawn: its meshes, its own materials (they fade, so they're its own), and how it moves. */
interface Look {
  g: THREE.Group;
  mats: THREE.Material[];
  tick(h: Hazard, dt: number): void;
  /** Once it's over: what it leaves behind. */
  gone?(): void;
}

/** What's left after: a scorch, an afterglow, steam drifting off. */
interface Remnant {
  g: THREE.Group;
  mats: THREE.Material[];
  t: number;
  life: number;
  tick(f: number, dt: number): void;
}

/**
 * The land's own dangers, drawn: geysers and flare stacks blowing, rocks falling, lightning
 * striking, spore clouds drifting, laser gates sweeping. A warning first, always, then the thing:
 * the warning a ring the size of what it'll hit, filling as it comes.
 */
export class HazardView {
  readonly group = new THREE.Group();
  private looks = new Map<Hazard, Look>();
  private remnants: Remnant[] = [];
  private time = 0;

  constructor(
    private readonly lv: Level,
    private readonly fx: Fx,
    private readonly hooks: HazardHooks,
  ) {}

  update(dt: number) {
    const lv = this.lv;
    this.time += dt;
    FLOW.offset.y = -this.time * 2.2;
    for (const h of lv.hazards) {
      let look = this.looks.get(h);
      if (!look) {
        look = this.make(h);
        this.group.add(look.g);
        this.looks.set(h, look);
      }
      look.tick(h, dt);
    }
    for (const [h, look] of this.looks)
      if (!lv.hazards.includes(h)) {
        this.group.remove(look.g);
        for (const m of look.mats) m.dispose();
        this.looks.delete(h);
        look.gone?.();
      }
    for (let i = this.remnants.length - 1; i >= 0; i--) {
      const r = this.remnants[i];
      r.t += dt;
      if (r.t >= r.life) {
        this.group.remove(r.g);
        for (const m of r.mats) m.dispose();
        this.remnants.splice(i, 1);
        continue;
      }
      r.tick(r.t / r.life, dt);
    }
  }

  private theme(h: Hazard): Theme {
    const b = this.lv.terrain.biome(fromFlight(h.z, 0));
    const t = THEMES[b.id];
    if (t) return t;
    switch (h.kind) {
      case 'geyser':
        return b.waterGlow ? 'lava' : 'steam';
      case 'flare':
        return 'flare';
      case 'falling_rocks':
        return 'rock';
      case 'lightning':
        return 'storm';
      case 'spore_cloud':
        return 'spores';
      default:
        return 'rust';
    }
  }

  private make(h: Hazard): Look {
    const theme = this.theme(h);
    switch (h.kind) {
      case 'geyser':
      case 'flare':
        return theme === 'steam' ? this.steam(h) : this.fire(h, theme === 'lava' ? 'lava' : 'flare');
      case 'falling_rocks':
        return this.rock(h, theme);
      case 'lightning':
        return this.lightning(h);
      case 'spore_cloud':
        return this.spores(h);
      default:
        return this.gate(h, theme);
    }
  }

  /** Where a ground hazard stands: on the land (or the lava), under its spot on the screen. */
  private ground(h: Hazard) {
    const lv = this.lv;
    const zg = fromFlight(h.z, 0);
    const gy = Math.max(lv.terrain.height(h.x, zg), lv.terrain.water(zg));
    return { gy, z: fromFlight(h.z, gy) };
  }

  /** A burnt patch on the ground where something blew, fading. */
  private scorch(x: number, y: number, z: number, r: number, soot: number, ember: number | null, life: number) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const dark = mat(soot, 0.4);
    const hot = ember === null ? null : mat(ember, 0.8, true);
    g.add(flatDisc(dark, r * 0.9, 0.12));
    if (hot) g.add(flatDisc(hot, r * 0.7, 0.16));
    this.group.add(g);
    this.remnants.push({
      g,
      mats: hot ? [dark, hot] : [dark],
      t: 0,
      life,
      tick: (f) => {
        dark.opacity = 0.4 * (1 - f * f);
        if (hot) hot.opacity = 0.8 * Math.max(0, 1 - f * 3);
      },
    });
  }

  // ----------------------------------------------------------------------------------------------
  // Lava fountains (basalt) and flare stacks (the refinery)
  // ----------------------------------------------------------------------------------------------

  private fire(h: Hazard, theme: 'lava' | 'flare'): Look {
    const { gy, z } = this.ground(h);
    const fx = this.fx;
    const r = h.r;
    const lava = theme === 'lava';
    const g = new THREE.Group();
    g.position.set(h.x, gy, z);
    const pal = lava
      ? { glow: 0xff4a10, crack: 0xffd060, rim: 0xffe070, outer: 0xe8400e, mid: 0xff8a20, core: 0xffe8a0 }
      : { glow: 0xff7a20, crack: 0xffc060, rim: 0xffc040, outer: 0xe04a10, mid: 0xff9a28, core: 0xfff0c0 };
    const glowM = mat(pal.glow, 0, true);
    const crackM = mat(pal.crack, 0, true);
    const rimM = mat(pal.rim, 0, false, true);
    const outerM = flow(pal.outer, lava ? 0.95 : 0.7, !lava);
    const midM = flow(pal.mid, 0.8, true);
    const coreM = flow(pal.core, 1, true);
    const baseM = mat(lava ? 0xff8a30 : 0x7a9aff, 0.6, true);
    const mats = [glowM, crackM, rimM, outerM, midM, coreM, baseM];
    const glowDisc = flatDisc(glowM, r, 0.2);
    const rim = flatRing(rimM, r, 0.35);
    g.add(glowDisc, rim);
    // lava: the crust cracks open, glowing; the flare: a grate of burners set in the ground
    const cracks: THREE.Mesh[] = [];
    if (lava) {
      for (let i = 0; i < 7; i++) {
        const c = part(GEO.box, crackM, [0, 0.25, 0], [1, 0.06, 0.22], [0, (i / 7) * Math.PI * 2 + Math.random() * 0.5, 0]);
        c.userData.len = r * (0.6 + Math.random() * 0.45);
        cracks.push(c);
        g.add(c);
      }
    } else {
      const steel = toon(0x3a3634);
      const rustT = toon(0x6a4a3a);
      g.add(part(GEO.torus, steel, [0, 0.3, 0], [r * 1.9, r * 1.9, 1.4], [-Math.PI / 2, 0, 0]));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(part(GEO.cyl6, i % 2 ? rustT : steel, [Math.cos(a) * r * 0.55, 0.5, Math.sin(a) * r * 0.55], [0.5, 1, 0.5]));
      }
      g.add(part(GEO.cyl, steel, [0, 0.8, 0], [r * 0.6, 1.6, r * 0.6]), part(GEO.cyl, toon(0x1a1614), [0, 1.62, 0], [r * 0.45, 0.05, r * 0.45]));
    }
    // the column: an outer sheath, a hotter middle, a white-hot core, a splash at its foot
    const H = lava ? 17 : 18;
    const col = new THREE.Group();
    const [wo, wm, wc] = lava ? [0.95, 0.62, 0.3] : [1.15, 0.8, 0.48];
    const outer = part(lava ? JET : FLAME, outerM, [0, 0, 0], [r * wo, H, r * wo]);
    const mid = part(lava ? JET : FLAME, midM, [0, 0, 0], [r * wm, H * 0.85, r * wm]);
    const core = part(lava ? JET : FLAME, coreM, [0, 0, 0], [r * wc, H * 0.6, r * wc]);
    const base = flatDisc(baseM, r * 0.85, 0.4);
    col.add(outer, mid, core, base);
    col.visible = false;
    g.add(col);
    const hot = new THREE.Color(pal.core);
    const flame = new THREE.Color(lava ? 0xff7a28 : 0xff9a30);
    const cool = new THREE.Color(lava ? 0x6a1006 : 0x8a2008);
    const smoke = new THREE.Color(lava ? 0x3a2a2a : 0x4a4444);
    const smokeEnd = new THREE.Color(lava ? 0x1a1418 : 0x2a2828);
    const glob = new THREE.Color(0xffd070);
    const globEnd = new THREE.Color(0x6a1408);
    const shimmer = new THREE.Color(0x2a1a0a);
    const pilot = new THREE.Color(0x7a9aff);
    const cinder = new THREE.Color(0x2a1a18);
    let blown = false;
    return {
      g,
      mats,
      gone: () => {
        if (blown) this.scorch(h.x, gy, z, r, lava ? 0x140c0c : 0x18161a, lava ? 0xff4a10 : 0xff7a2a, lava ? 4 : 3);
      },
      tick: (h, dt) => {
        const t = this.time;
        const warn = h.t < h.warn;
        const f = clamp(h.t / h.warn, 0, 1);
        if (warn) {
          // the ground glows and splits, the rim blinks faster as it comes
          glowM.opacity = (0.15 + f * 0.55) * (0.8 + Math.sin(t * (10 + f * 30)) * 0.2);
          glowDisc.scale.setScalar(r * (0.35 + f * 0.65));
          rimM.opacity = Math.floor(t * (5 + f * 16)) % 2 ? 0.95 : 0.35;
          crackM.opacity = 0.4 + f * 0.6;
          for (const c of cracks) {
            const L = c.userData.len * Math.min(1, f * 1.4);
            c.scale.x = L;
            c.position.set(Math.cos(-c.rotation.y) * L * 0.5, 0.25, Math.sin(-c.rotation.y) * L * 0.5);
          }
          if (lava) {
            for (let i = emit(4 + f * 30, dt); i > 0; i--) {
              const a = Math.random() * Math.PI * 2;
              const d = Math.random() * r;
              fx.add({ x: h.x + Math.cos(a) * d, y: gy + 0.3, z: z + Math.sin(a) * d, vy: 3 + Math.random() * 5, vx: (Math.random() - 0.5) * 2, life: 0.6 + Math.random() * 0.5, size: 0.22, grow: 0.4, color: glob, to: globEnd });
            }
            if (f > 0.5) for (let i = emit(6, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r, y: gy + 0.5, z: z + (Math.random() - 0.5) * r, vy: 2.5, life: 1, size: 0.8, grow: 2.5, color: smoke, to: smokeEnd, glow: false });
          } else {
            // the pilot flames lick at the burners, and the air over the grate wobbles
            for (let i = emit(10 + f * 25, dt); i > 0; i--) {
              const a = Math.random() * Math.PI * 2;
              fx.add({ x: h.x + Math.cos(a) * r * 0.55, y: gy + 1, z: z + Math.sin(a) * r * 0.55, vy: 4 + f * 6, life: 0.25, size: 0.4, grow: 0.3, color: Math.random() < 0.4 ? pilot : hot, to: cool });
            }
            for (let i = emit(6, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r, y: gy + 2, z, vy: 5, life: 0.9, size: 1.2, grow: 2, color: shimmer });
          }
          return;
        }
        // blow
        const a = clamp((h.t - h.warn) / h.active, 0, 1);
        if (!blown) {
          blown = true;
          col.visible = true;
          glowDisc.visible = false;
          for (const c of cracks) c.visible = false;
          fx.ring(h.x, gy + 0.4, z, r * 1.6, 0.4, false, pal.rim);
          fx.sparks(h.x, gy + 1, z, 16, pal.core, 18, 0.4, 0.3, false);
          this.hooks.juice({ trauma: 0.15 });
        }
        rimM.opacity = 0.55;
        // shoots up fast, holds roaring, sinks at the end
        const up = Math.min(1, (h.t - h.warn) / 0.15) * (a > 0.82 ? Math.max(0.05, (1 - a) / 0.18) : 1);
        const wob = 1 + Math.sin(t * 37) * 0.07 + Math.sin(t * 23) * 0.05;
        outer.scale.set(r * wo * wob, H * up * (1 + Math.sin(t * 29) * 0.06), r * wo * wob);
        mid.scale.set(r * wm / wob, H * 0.85 * up, r * wm / wob);
        core.scale.set(r * wc * wob, H * 0.6 * up * (1 + Math.sin(t * 41) * 0.08), r * wc * wob);
        outer.rotation.y += dt * 3;
        mid.rotation.y -= dt * 5;
        base.scale.setScalar(r * (0.8 + Math.sin(t * 31) * 0.15));
        const top = gy + H * up;
        for (let i = emit(lava ? 22 : 40, dt); i > 0; i--) {
          const s = Math.random();
          fx.add({ x: h.x + (Math.random() - 0.5) * r * 1.1, y: gy + s * H * up, z: z + (Math.random() - 0.5) * r * 0.6, vy: 14 + Math.random() * 12, vx: (Math.random() - 0.5) * 3, life: 0.3 + Math.random() * 0.2, size: 0.6 + (1 - s) * 0.4, grow: 1.6, color: flame, to: cool, drag: 1 });
        }
        for (let i = emit(lava ? 4 : 5, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r, y: top, z: z + (Math.random() - 0.5) * r, vy: 5 + Math.random() * 3, vx: (Math.random() - 0.5) * 3, life: 1.1, size: 1.1, grow: 2.2, color: smoke, to: smokeEnd, glow: false, drag: 0.5 });
        if (lava) {
          // molten globs thrown out of the top, arcing down
          for (let i = emit(16, dt); i > 0; i--) {
            const ang = Math.random() * Math.PI * 2;
            const v = 3 + Math.random() * 6;
            fx.add({ x: h.x, y: top - 1, z, vx: Math.cos(ang) * v, vz: Math.sin(ang) * v, vy: 8 + Math.random() * 10, gravity: 32, life: 1 + Math.random() * 0.4, size: 0.45 + Math.random() * 0.3, grow: 0.6, color: glob, to: globEnd });
          }
          for (let i = emit(18, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r * 1.4, y: top - Math.random() * 3, z: z + (Math.random() - 0.5) * r, vx: (Math.random() - 0.5) * 6, vz: (Math.random() - 0.5) * 4, vy: 4 + Math.random() * 6, life: 0.45, size: 1.4, grow: 1.6, color: flame, to: cool, drag: 2 });
          if (Math.random() < dt * 6) {
            const ang = Math.random() * Math.PI * 2;
            fx.add({ x: h.x, y: top - 2, z, vx: Math.cos(ang) * 6, vz: Math.sin(ang) * 6, vy: 10, gravity: 30, life: 3, size: 0.35, color: cinder, solid: true, spin: 6 });
          }
        } else {
          for (let i = emit(14, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r, y: top + 1, z: z + (Math.random() - 0.5) * r, vy: 8, life: 0.7, size: 2.4, grow: 2.2, color: shimmer });
        }
      },
    };
  }

  // ----------------------------------------------------------------------------------------------
  // Steam geysers (the hot springs)
  // ----------------------------------------------------------------------------------------------

  private steam(h: Hazard): Look {
    const { gy, z } = this.ground(h);
    const fx = this.fx;
    const r = h.r;
    const g = new THREE.Group();
    g.position.set(h.x, gy, z);
    const poolM = mat(0xffb0d0, 0, false, true);
    const rimM = mat(0x7a4aa0, 0, false, true);
    const jetM = flow(0xd8f0ff, 0.95, false);
    const mats = [poolM, rimM, jetM];
    const pool = flatDisc(poolM, r, 0.2);
    const rim = flatRing(rimM, r, 0.35);
    g.add(pool, rim);
    // the column: a glassy water jet inside billows of lit steam rolling up it
    const H = 16;
    const col = new THREE.Group();
    const jet = part(JET, jetM, [0, 0, 0], [r * 0.5, H, r * 0.5]);
    col.add(jet);
    const puffs: THREE.Mesh[] = [];
    const steamT = toon(0xf6f2fa);
    const steamS = toon(0xd8d8f0);
    for (let i = 0; i < 12; i++) {
      const p = part(GEO.sphere, i % 3 ? steamT : steamS, [0, 0, 0], 1);
      p.userData.a = Math.random() * Math.PI * 2;
      puffs.push(p);
      col.add(p);
    }
    col.visible = false;
    g.add(col);
    const vapour = new THREE.Color(0xffffff);
    const vapourEnd = new THREE.Color(0xf4ecf6);
    const drop = new THREE.Color(0xb8e0ff);
    const bubble = 0xd0609a;
    let blown = false;
    return {
      g,
      mats,
      gone: () => {
        if (blown) this.steamOff(h.x, gy, z, r);
      },
      tick: (h, dt) => {
        const t = this.time;
        const f = clamp(h.t / h.warn, 0, 1);
        if (h.t < h.warn) {
          // the pool heaves and bubbles, wisps rise, the rim blinks
          poolM.opacity = 0.25 + f * 0.4 + Math.sin(t * 20) * 0.08;
          pool.scale.setScalar(r * (0.5 + f * 0.5 + Math.sin(t * 14) * 0.04));
          rimM.opacity = Math.floor(t * (5 + f * 16)) % 2 ? 0.95 : 0.35;
          for (let i = emit(4 + f * 18, dt); i > 0; i--) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * r * 0.8;
            fx.ring(h.x + Math.cos(a) * d, gy + 0.3, z + Math.sin(a) * d, 0.3 + Math.random() * 0.5, 0.35, false, bubble);
          }
          for (let i = emit(2 + f * 5, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r * 1.4, y: gy + 0.5, z: z + (Math.random() - 0.5) * r, vy: 2 + f * 4, vx: (Math.random() - 0.5), life: 0.9, size: 0.6, grow: 2, color: vapour, to: vapourEnd, glow: false });
          return;
        }
        const a = clamp((h.t - h.warn) / h.active, 0, 1);
        if (!blown) {
          blown = true;
          col.visible = true;
          fx.ring(h.x, gy + 0.4, z, r * 1.8, 0.45, false, 0xffffff);
          this.hooks.juice({ trauma: 0.12 });
        }
        poolM.opacity = 0.7;
        pool.scale.setScalar(r);
        rimM.opacity = 0.6;
        const up = Math.min(1, (h.t - h.warn) / 0.12) * (a > 0.8 ? Math.max(0.05, (1 - a) / 0.2) : 1);
        jet.scale.set(r * 0.5 * (1 + Math.sin(t * 40) * 0.08), H * up, r * 0.5);
        // billows climb the column, swelling as they go, round and round
        for (let i = 0; i < puffs.length; i++) {
          const p = puffs[i];
          const k = (t * 0.9 + i / puffs.length) % 1;
          const y = k * H * up;
          const ang = p.userData.a + t * 2;
          const sw = r * (0.25 + k * 0.5);
          p.position.set(Math.cos(ang) * sw, y, Math.sin(ang) * sw * 0.6);
          p.scale.setScalar(r * (0.6 + k * 1.1) * (k > 0.9 ? (1 - k) * 10 : 1) * Math.min(1, up * 1.5));
        }
        // spray: droplets thrown out and falling, steam boiling off the top
        for (let i = emit(40, dt); i > 0; i--) {
          const ang = Math.random() * Math.PI * 2;
          const v = 2 + Math.random() * 5;
          fx.add({ x: h.x, y: gy + H * up * (0.6 + Math.random() * 0.4), z, vx: Math.cos(ang) * v, vz: Math.sin(ang) * v, vy: 4 + Math.random() * 6, gravity: 28, life: 0.8, size: 0.3, grow: 0.6, color: drop, glow: false });
        }
        for (let i = emit(5, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r, y: gy + H * up, z: z + (Math.random() - 0.5) * r, vy: 3 + Math.random() * 3, vx: (Math.random() - 0.5) * 4, life: 1.1, size: 1.4, grow: 2.2, color: vapour, to: vapourEnd, glow: false, drag: 0.6 });
      },
    };
  }

  /** Steam drifting off a pool once the geyser's done. */
  private steamOff(x: number, y: number, z: number, r: number) {
    const fx = this.fx;
    const vapour = new THREE.Color(0xffffff);
    const vapourEnd = new THREE.Color(0xf4ecf6);
    this.remnants.push({
      g: new THREE.Group(),
      mats: [],
      t: 0,
      life: 2,
      tick: (f, dt) => {
        for (let i = emit(4 * (1 - f), dt); i > 0; i--) fx.add({ x: x + (Math.random() - 0.5) * r * 1.6, y: y + 0.5, z: z + (Math.random() - 0.5) * r, vy: 2.5, vx: 1.2, life: 1.4, size: 0.9, grow: 2.2, color: vapour, to: vapourEnd, glow: false });
      },
    });
  }

  // ----------------------------------------------------------------------------------------------
  // Falling rocks: crystal, sandstone, glass, titan plating, stalactites
  // ----------------------------------------------------------------------------------------------

  private rock(h: Hazard, theme: Theme): Look {
    const fx = this.fx;
    const r = h.r;
    const g = new THREE.Group();
    const style = ROCKS[theme] ?? ROCKS.rock!;
    const shadowM = mat(style.shadow, 0, false, true);
    const rimM = mat(style.rim, 0, false, true);
    const closeM = mat(style.rim, 0, false, true);
    const flashM = mat(0xffffff, 0, true, true);
    const mats = [shadowM, rimM, closeM, flashM];
    const shadow = flatDisc(shadowM, r, -0.4);
    const rim = flatRing(rimM, r, -0.3);
    const close = flatRing(closeM, r, -0.3);
    const flash = flatDisc(flashM, r, 0.2);
    g.add(shadow, rim, close, flash);
    const body = new THREE.Group();
    style.build(body, r);
    body.scale.setScalar(1.35);
    g.add(body);
    const H = 24;
    // it comes in from past the top of the screen, a little to one side, slanting down onto its mark
    const drift = (Math.random() - 0.5) * 18;
    const trail = new THREE.Color(style.trail);
    const trailEnd = new THREE.Color(style.trailEnd);
    let hit = false;
    let spinX = (Math.random() - 0.5) * 6;
    const spinZ = (Math.random() - 0.5) * 6;
    return {
      g,
      mats,
      tick: (h, dt) => {
        const t = this.time;
        g.position.set(h.x, FLIGHT_Y, h.z);
        const f = clamp(h.t / h.warn, 0, 1);
        if (h.t < h.warn) {
          // the shadow darkens and grows; a ring closes in on where it'll land
          shadowM.opacity = 0.15 + f * 0.5;
          shadow.scale.setScalar(r * (0.35 + f * 0.65));
          rimM.opacity = Math.floor(t * (6 + f * 18)) % 2 ? 0.95 : 0.4;
          closeM.opacity = 0.35 + f * 0.6;
          close.scale.setScalar(r * (1 + (1 - f) * 1.6));
          // drops faster and faster, out of the sky (big, near the camera) onto its mark
          const e = Math.pow(f, 1.6);
          const y = H * (1 - e);
          const from = Math.min(h.z - 6, this.lv.top - 4 - 3 * depthScale(FLIGHT_Y + H));
          const px = h.x + drift * (1 - e);
          const pz = from + (h.z - from) * e;
          body.position.set(px - h.x, y, pz + y * Math.tan(TILT) - h.z);
          body.scale.setScalar(1.35 * depthScale(FLIGHT_Y + y));
          if (style.tumble) {
            body.rotation.x += dt * spinX;
            body.rotation.z += dt * spinZ;
          } else body.rotation.z = Math.sin(t * 6) * 0.08;
          // what it sheds on the way
          const by = FLIGHT_Y + y;
          const bz = pz + y * Math.tan(TILT);
          for (let i = emit(style.trailRate * (0.4 + f), dt); i > 0; i--)
            fx.add({ x: px + (Math.random() - 0.5) * r, y: by + (Math.random() - 0.2) * r, z: bz + (Math.random() - 0.5) * r, vy: style.drip ? -24 : 2, life: style.drip ? 0.5 : 0.6, size: style.drip ? 0.22 : 0.7, grow: style.drip ? 1 : 2.2, color: trail, to: trailEnd, glow: style.trailGlow, carried: true, gravity: style.drip ? 20 : 0 });
          return;
        }
        if (!hit) {
          hit = true;
          body.visible = false;
          shadow.visible = rim.visible = close.visible = false;
          flashM.color.set(style.flash);
          this.impact(h, style);
          spinX = 0;
        }
        // a flash where it struck, fading over the hit
        const a = clamp((h.t - h.warn) / Math.max(0.05, h.active), 0, 1);
        flashM.opacity = 0.55 * (1 - a);
        flash.scale.setScalar(r * (0.8 + a * 0.4));
      },
    };
  }

  private impact(h: Hazard, s: RockStyle) {
    const fx = this.fx;
    const r = h.r;
    const y = FLIGHT_Y;
    fx.ring(h.x, y, h.z, r * 1.8, 0.35, true, s.rim);
    this.hooks.juice({ trauma: 0.3 });
    audio.play('crash', { pan: h.x / HALF_W, vol: 0.6 });
    const puff = new THREE.Color(s.puff);
    const puffEnd = new THREE.Color(s.puffEnd);
    for (let i = 0; i < s.puffs; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 3 + Math.random() * 5;
      fx.add({ x: h.x, y: y + 0.5, z: h.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 1 + Math.random() * 3, life: 0.7 + Math.random() * 0.6, size: 1 + Math.random() * 0.8, grow: 2.4, color: puff, to: puffEnd, glow: s.puffGlow, drag: 3, carried: true });
    }
    if (s.splash) {
      // the sea's below: spray thrown up and out
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 2 + Math.random() * 6;
        fx.add({ x: h.x, y, z: h.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 8 + Math.random() * 8, gravity: 30, life: 0.8, size: 0.35, grow: 0.5, color: SPRAY, glow: false, carried: true });
      }
    }
    fx.sparks(h.x, y + 0.5, h.z, s.sparks, s.spark, 20, 0.4, 0.28);
    fx.sparks(h.x, y + 0.5, h.z, 6, 0xffffff, 26, 0.2, 0.2);
    const chip = new THREE.Color();
    for (let i = 0; i < s.chips; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 4 + Math.random() * 8;
      chip.set(s.chip[i % s.chip.length]);
      fx.add({ x: h.x, y, z: h.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 3 + Math.random() * 6, life: 2.5 + Math.random(), size: 0.25 + Math.random() * 0.4, color: chip, solid: true, gravity: 26, spin: 10 });
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Lightning (the Stormwall)
  // ----------------------------------------------------------------------------------------------

  private lightning(h: Hazard): Look {
    const lv = this.lv;
    const fx = this.fx;
    const r = h.r;
    const g = new THREE.Group();
    const glowM = mat(0x6a8aff, 0, true, true);
    const rimM = mat(0xc8d8ff, 0, false, true);
    const closeM = mat(0xc8d8ff, 0, false, true);
    const coreM = mat(0xffffff, 1, true);
    const haloM = mat(0x7a9aff, 0.6, true);
    const cloudM = new THREE.SpriteMaterial({ map: SOFT, color: 0x9ab0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const mats: THREE.Material[] = [glowM, rimM, closeM, coreM, haloM, cloudM];
    const glow = flatDisc(glowM, r, -0.2);
    const rim = flatRing(rimM, r, -0.1);
    const close = flatRing(closeM, r, -0.1);
    g.add(glow, rim, close);
    // a light in the cloud overhead, gathering
    const cloud = new THREE.Sprite(cloudM);
    cloud.position.set(0, 26, 0);
    cloud.scale.setScalar(14);
    g.add(cloud);
    // little arcs crawling round the rim, then the bolt: a main leg and two forks
    const arcs: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const m = part(GEO.box, coreM, [0, 0, 0], [0.12, 0.12, 1]);
      m.visible = false;
      arcs.push(m);
      g.add(m);
    }
    const SEGS = 22;
    const cores: THREE.Mesh[] = [];
    const halos: THREE.Mesh[] = [];
    for (let i = 0; i < SEGS; i++) {
      const c = part(GEO.box, coreM, [0, 0, 0], 1);
      const hl = part(GEO.box, haloM, [0, 0, 0], 1);
      c.renderOrder = 27;
      hl.renderOrder = 26;
      c.visible = hl.visible = false;
      cores.push(c);
      halos.push(hl);
      g.add(c, hl);
    }
    // the sea (or the land) under the spot on the screen, in the group's own terms
    const zg = fromFlight(h.z, 0);
    const wy = Math.max(lv.terrain.height(h.x, zg), lv.terrain.water(zg), 0);
    const endY = wy - FLIGHT_Y;
    const endZ = -(FLIGHT_Y - wy) * Math.tan(TILT);
    let struck = false;
    let jag = 0;
    const lay = () => {
      // jagged legs from high in the cloud down to the strike, each a thin box
      let n = 0;
      const leg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, steps: number, w: number) => {
        let px = ax;
        let py = ay;
        let pz = az;
        for (let k = 1; k <= steps && n < SEGS; k++) {
          const f = k / steps;
          const j = k === steps ? 0 : 1.6 * (1 - f * 0.5);
          const qx = ax + (bx - ax) * f + (Math.random() - 0.5) * j * 2;
          const qy = ay + (by - ay) * f;
          const qz = az + (bz - az) * f + (Math.random() - 0.5) * j;
          seg(cores[n], halos[n], px, py, pz, qx, qy, qz, w);
          n++;
          px = qx;
          py = qy;
          pz = qz;
        }
        return [px, py, pz];
      };
      const topX = (Math.random() - 0.5) * 8;
      const midY = endY + 14 + Math.random() * 6;
      leg(topX, 34, endZ, (Math.random() - 0.5) * 3, endY + 0.3, endZ, 12, 0.5);
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1;
        const sx = topX * 0.5 + (Math.random() - 0.5);
        leg(sx, midY, endZ, sx + s * (4 + Math.random() * 5), midY - 8 - Math.random() * 6, endZ + (Math.random() - 0.5) * 3, 4, 0.28);
      }
      for (let i = n; i < SEGS; i++) cores[i].visible = halos[i].visible = false;
    };
    return {
      g,
      mats,
      tick: (h, dt) => {
        const t = this.time;
        g.position.set(h.x, FLIGHT_Y, h.z);
        const f = clamp(h.t / h.warn, 0, 1);
        if (h.t < h.warn) {
          // charge: the spot glows, the air crackles, the cloud above flickers
          glowM.opacity = (0.1 + f * 0.45) * (0.7 + Math.random() * 0.3);
          glow.scale.setScalar(r * (0.4 + f * 0.6));
          rimM.opacity = Math.floor(t * (8 + f * 20)) % 2 ? 1 : 0.35;
          closeM.opacity = 0.2 + f * 0.6;
          close.scale.setScalar(r * (1 + (1 - f) * 1.4));
          cloudM.opacity = (0.15 + f * 0.5) * (Math.random() < 0.25 + f * 0.4 ? 1 : 0.3);
          for (const m of arcs) {
            if (Math.random() < dt * 20) {
              m.visible = Math.random() < 0.3 + f * 0.6;
              const a = Math.random() * Math.PI * 2;
              const d = r * (0.7 + Math.random() * 0.3);
              m.position.set(Math.cos(a) * d, 0.2, Math.sin(a) * d);
              m.rotation.set(0, -a + (Math.random() - 0.5), 0);
              m.scale.z = 0.5 + Math.random() * 1.2;
            }
          }
          for (let i = emit(4 + f * 16, dt); i > 0; i--) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.random() * r;
            fx.add({ x: h.x + Math.cos(a) * d, y: FLIGHT_Y, z: h.z + Math.sin(a) * d, vy: 4 + Math.random() * 4, life: 0.4, size: 0.18, grow: 0.5, color: STATIC, carried: true });
          }
          return;
        }
        if (!struck) {
          struck = true;
          for (const m of arcs) m.visible = false;
          close.visible = false;
          lay();
          jag = 0;
          this.hooks.juice({ trauma: 0.4, flash: 0.7, flashColor: 0xd0e0ff });
          audio.play('lightning', { pan: h.x / HALF_W });
          // a crackle out across the circle it hit
          for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 + Math.random();
            this.hooks.bolt([h.x, h.z, h.x + Math.cos(a) * r * 1.2, h.z + Math.sin(a) * r], 0xd0e0ff);
          }
          const sz = h.z + endZ;
          fx.ring(h.x, wy + 0.3, sz, r * 2.2, 0.4, false, 0xd0e0ff);
          fx.sparks(h.x, wy + 0.5, sz, 18, 0xa0c0ff, 20, 0.4, 0.28, false);
          fx.sparks(h.x, FLIGHT_Y, h.z, 10, 0xffffff, 16, 0.25, 0.22);
          this.afterglow(h.x, wy, sz, r);
        }
        const a = clamp((h.t - h.warn) / h.active, 0, 1);
        // it flickers and re-forks while it lasts
        jag += dt;
        if (jag > 0.06) {
          jag = 0;
          lay();
        }
        const on = Math.random() < 0.85 - a * 0.4;
        coreM.opacity = on ? 1 : 0.3;
        haloM.opacity = (on ? 0.65 : 0.2) * (1 - a * 0.5);
        cloudM.opacity = 0.9 * (1 - a);
        glowM.opacity = 0.7 * (1 - a);
        glow.scale.setScalar(r);
        rimM.opacity = 0.7 * (1 - a);
      },
    };
  }

  /** Where lightning struck: a glow that fades, steam off the water. */
  private afterglow(x: number, y: number, z: number, r: number) {
    const fx = this.fx;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const hot = mat(0x8aa8ff, 0.9, true);
    const white = mat(0xffffff, 1, true);
    g.add(flatDisc(hot, r * 0.9, 0.2), flatDisc(white, r * 0.35, 0.25));
    this.group.add(g);
    const vapour = new THREE.Color(0x8a96b0);
    const vapourEnd = new THREE.Color(0x3a4458);
    this.remnants.push({
      g,
      mats: [hot, white],
      t: 0,
      life: 1.6,
      tick: (f, dt) => {
        hot.opacity = 0.9 * (1 - f) * (1 - f);
        white.opacity = Math.max(0, 1 - f * 4);
        for (let i = emit(12 * (1 - f), dt); i > 0; i--) fx.add({ x: x + (Math.random() - 0.5) * r, y: y + 0.4, z: z + (Math.random() - 0.5) * r, vy: 3, life: 1.2, size: 0.9, grow: 2.4, color: vapour, to: vapourEnd, glow: false });
      },
    });
  }

  // ----------------------------------------------------------------------------------------------
  // Spore clouds (the vents)
  // ----------------------------------------------------------------------------------------------

  private spores(h: Hazard): Look {
    const fx = this.fx;
    const r = h.r;
    const g = new THREE.Group();
    const outerM = new THREE.SpriteMaterial({ map: SOFT, color: 0xc8e060, transparent: true, opacity: 0.5, depthWrite: false });
    const darkM = new THREE.SpriteMaterial({ map: SOFT, color: 0x3a4a22, transparent: true, opacity: 0.55, depthWrite: false });
    const glowM = new THREE.SpriteMaterial({ map: SOFT, color: 0xf0ff70, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    const rimM = mat(0xe8ff70, 0.3, true, true);
    const mats: THREE.Material[] = [outerM, darkM, glowM, rimM];
    const rim = flatRing(rimM, r, -0.5, false);
    g.add(rim);
    // billows round the edge, a dark heart, glowing pockets: each breathes on its own
    const puffs: { s: THREE.Sprite; a: number; d: number; size: number; ph: number; y: number }[] = [];
    const add = (m: THREE.SpriteMaterial, n: number, d: number, size: number, y: number) => {
      for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(m);
        const p = { s, a: (i / n) * Math.PI * 2 + Math.random() * 0.6, d: d * (0.8 + Math.random() * 0.4), size: size * (0.85 + Math.random() * 0.3), ph: Math.random() * 6, y: y + (Math.random() - 0.5) };
        puffs.push(p);
        g.add(s);
      }
    };
    add(outerM, 9, r * 0.7, r * 1.25, 0.5);
    add(darkM, 1, 0, r * 1.5, 1);
    add(outerM, 3, r * 0.3, r * 1.1, 1.8);
    add(glowM, 4, r * 0.55, r * 0.6, 2.2);
    const mote = new THREE.Color(0xf0ff90);
    const moteEnd = new THREE.Color(0x6a9a3a);
    const spore = new THREE.Color(0x5a6a3a);
    const sporeEnd = new THREE.Color(0x3a3a2a);
    return {
      g,
      mats,
      tick: (h, dt) => {
        const t = this.time;
        g.position.set(h.x, FLIGHT_Y, h.z);
        const end = h.warn + h.active;
        const grow = h.t < h.warn ? h.t / h.warn : h.t > end - 1.2 ? Math.max(0, (end - h.t) / 1.2) : 1;
        const pulse = 1 + Math.sin(t * 2.2 + h.x) * 0.06;
        for (const p of puffs) {
          const a = p.a + t * 0.25 + Math.sin(t * 0.7 + p.ph) * 0.2;
          const d = p.d * (1 + Math.sin(t * 1.3 + p.ph) * 0.12) * grow;
          p.s.position.set(Math.cos(a) * d, p.y, Math.sin(a) * d);
          p.s.scale.setScalar(p.size * (1 + Math.sin(t * 1.7 + p.ph) * 0.1) * pulse * Math.max(0.05, grow));
        }
        outerM.opacity = 0.34 * grow;
        darkM.opacity = 0.5 * grow;
        glowM.opacity = (0.35 + Math.sin(t * 3 + h.x) * 0.12) * grow;
        rimM.opacity = (0.45 + Math.sin(t * 3) * 0.15) * grow;
        rim.scale.setScalar(r * pulse);
        // glowing motes wander out of it, heavier spores sink away below
        for (let i = emit(14 * grow, dt); i > 0; i--) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r * 0.9;
          fx.add({ x: h.x + Math.cos(a) * d, y: FLIGHT_Y + Math.random() * 2, z: h.z + Math.sin(a) * d, vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5, vy: 0.5 + Math.random(), life: 1.4 + Math.random(), size: 0.18, grow: 0.5, color: mote, to: moteEnd });
        }
        for (let i = emit(5 * grow, dt); i > 0; i--) fx.add({ x: h.x + (Math.random() - 0.5) * r * 1.4, y: FLIGHT_Y, z: h.z + (Math.random() - 0.5) * r, vy: -2, life: 1.6, size: 0.6, grow: 2, color: spore, to: sporeEnd, glow: false });
      },
    };
  }

  // ----------------------------------------------------------------------------------------------
  // Laser gates: frozen pylons in Engine City, corroded posts in the canyons and the lake
  // ----------------------------------------------------------------------------------------------

  private gate(h: Hazard, theme: Theme): Look {
    const lv = this.lv;
    const fx = this.fx;
    const g = new THREE.Group();
    // a white-hot core in a dark edge, whatever the place; the theme's colour only in the haze
    // about it, the lamps and the charging line
    const pal = theme === 'frost'
      ? { beam: 0x8ad8ff, core: 0xffffff, lamp: 0xa0e0ff }
      : theme === 'chem'
        ? { beam: 0xc04aff, core: 0xffffff, lamp: 0xa0ff4a }
        : { beam: 0xffffff, core: 0xffffff, lamp: 0xfff0e0 };
    // (the beam draws over the land: it cuts the whole field, walls and all)
    const coreM = mat(pal.core, 1, false, true);
    const beamM = mat(0x0c0812, 0.85, false, true);
    const hazeM = mat(pal.beam, 0.25, true, true);
    const lineM = mat(pal.beam, 0, true, true);
    const lampM = new THREE.SpriteMaterial({ map: SOFT, color: pal.lamp, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const mats: THREE.Material[] = [coreM, beamM, hazeM, lineM, lampM];
    const X = HALF_W - 0.5;
    const W = X * 2 - 1.6;
    const beam = new THREE.Group();
    beam.add(part(GEO.box, hazeM, [0, 0.6, 0], [W, 0.1, 2.6]), part(GEO.box, beamM, [0, 0.6, 0], [W, 0.4, 1.2]), part(GEO.box, coreM, [0, 0.62, 0], [W, 0.3, 0.6]));
    beam.visible = false;
    beam.children.forEach((m, i) => (m.renderOrder = 8 + i));
    const line = part(GEO.box, lineM, [0, 0.6, 0], [W, 0.06, 0.14]);
    g.add(beam, line);
    const lamps: THREE.Sprite[] = [];
    for (const s of [-1, 1]) {
      // the emitter at the beam's height; where the land's higher than that (a canyon wall), up on
      // it instead, slid towards you so it still shows at the beam's end on the screen
      const land = Math.max(lv.terrain.height(s * X, h.z), lv.terrain.water(h.z), -8) - FLIGHT_Y;
      const head = Math.max(0.6, land + 1.6);
      const zOff = (head - 0.6) * Math.tan(TILT);
      const post = theme === 'frost' ? pylon(land - head) : stake(land - head, theme === 'chem');
      post.position.set(s * X, head, zOff);
      post.scale.x = s;
      g.add(post);
      const lamp = new THREE.Sprite(lampM);
      lamp.position.set(s * (X - 1), head, zOff);
      lamp.scale.setScalar(3);
      lamps.push(lamp);
      g.add(lamp);
    }
    const spark = new THREE.Color(pal.core);
    const ember = new THREE.Color(pal.beam);
    let was = false;
    let charging = false;
    return {
      g,
      mats,
      tick: (h, dt) => {
        const t = this.time;
        g.position.set(0, FLIGHT_Y, h.z);
        const on = lv.gateOn(h);
        const ph = h.t % h.period;
        const seen = h.z > lv.top - 4 && h.z < lv.bottom + 4;
        beam.visible = on;
        if (!on) {
          // charging: the emitters brighten, a thin line shimmers across, blinking hard at the end
          const f = clamp(ph / (h.period * 0.45), 0, 1);
          was = false;
          lineM.opacity = f < 0.6 ? f * 0.25 * (0.6 + Math.random() * 0.4) : Math.floor(t * 18) % 2 ? 0.95 : 0.25;
          line.scale.y = 1;
          lampM.opacity = 0.2 + f * 0.8;
          for (const l of lamps) l.scale.setScalar(2 + f * 3 + Math.random() * 0.4);
          if (f > 0.55 && !charging && seen) {
            charging = true;
            audio.play('laser_charge', { vol: 0.2 });
          }
          for (let i = emit(f * 30, dt); i > 0; i--) fx.add({ x: (Math.random() - 0.5) * W, y: FLIGHT_Y + 0.6, z: h.z + (Math.random() - 0.5) * 0.4, vy: 1.5, life: 0.35, size: 0.2, grow: 0.4, color: ember });
          for (const l of lamps) if (Math.random() < dt * f * 12) fx.sparks(l.position.x, FLIGHT_Y + l.position.y, h.z + l.position.z, 2, pal.core, 8, 0.2, 0.2, false);
          return;
        }
        charging = false;
        if (!was) {
          was = true;
          if (seen) audio.play('laser_fire', { vol: 0.3 });
          for (const l of lamps) fx.sparks(l.position.x, FLIGHT_Y + l.position.y, h.z + l.position.z, 10, pal.core, 16, 0.3, 0.25, false);
        }
        lineM.opacity = 0;
        // hot, humming, sparking where it meets the emitters
        const hum = 1 + Math.sin(t * 50) * 0.12 + (Math.random() - 0.5) * 0.1;
        beam.scale.set(1, hum, hum);
        lampM.opacity = 1;
        for (const l of lamps) l.scale.setScalar(5 + Math.random() * 1.2);
        for (const s of [-1, 1]) for (let i = emit(26, dt); i > 0; i--) {
          const a = (Math.random() - 0.5) * 2;
          fx.add({ x: s * (X - 1.2), y: FLIGHT_Y + 0.6, z: h.z, vx: -s * (4 + Math.random() * 8), vz: a * 6, vy: Math.random() * 4, life: 0.25, size: 0.2, grow: 0.3, color: spark, to: ember, drag: 4 });
        }
        for (let i = emit(24, dt); i > 0; i--) fx.add({ x: (Math.random() - 0.5) * W, y: FLIGHT_Y + 0.7, z: h.z + (Math.random() - 0.5) * 0.6, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.4, size: 0.3, grow: 0.3, color: spark, to: ember });
      },
    };
  }

  dispose() {
    for (const look of this.looks.values()) for (const m of look.mats) m.dispose();
    for (const r of this.remnants) for (const m of r.mats) m.dispose();
    this.looks.clear();
    this.remnants = [];
    this.group.clear();
  }
}

// ------------------------------------------------------------------------------------------------
// Rocks, by where they fall
// ------------------------------------------------------------------------------------------------

interface RockStyle {
  build(g: THREE.Group, r: number): void;
  tumble: boolean;
  shadow: number;
  rim: number;
  flash: number;
  trail: number;
  trailEnd: number;
  trailGlow: boolean;
  trailRate: number;
  /** Drips straight down (a stalactite), rather than shedding dust. */
  drip?: boolean;
  /** Lands with a splash. */
  splash?: boolean;
  puff: number;
  puffEnd: number;
  puffGlow: boolean;
  puffs: number;
  spark: number;
  sparks: number;
  chip: number[];
  chips: number;
}

const ROCKS: Partial<Record<Theme, RockStyle>> = {
  crystal: {
    build(g, r) {
      // a cluster of shards, lit from within
      const a = toon(0x3ad8f0, { glow: 0.25 });
      const b = toon(0xe83ac8, { glow: 0.25 });
      const c = toon(0x8a5ad8, { glow: 0.15 });
      g.add(part(GEO.oct, a, [0, 0, 0], [r * 0.7, r * 2.4, r * 0.7], [0.2, 0, 0.3]));
      g.add(part(GEO.oct, b, [r * 0.5, 0.2, 0.2], [r * 0.45, r * 1.6, r * 0.45], [0, 0, -0.7]));
      g.add(part(GEO.oct, c, [-r * 0.45, -0.3, -0.2], [r * 0.5, r * 1.8, r * 0.5], [0.4, 0, 0.8]));
      g.add(part(GEO.oct, a, [0.1, -0.2, r * 0.4], [r * 0.35, r * 1.2, r * 0.35], [1.2, 0, 0]));
    },
    tumble: true,
    shadow: 0x2a1a4a,
    rim: 0xe0c0ff,
    flash: 0xf0e0ff,
    trail: 0xf0e0ff,
    trailEnd: 0x8a6ac8,
    trailGlow: true,
    trailRate: 18,
    puff: 0xe8d0ff,
    puffEnd: 0x6a4a9a,
    puffGlow: true,
    puffs: 8,
    spark: 0x8af0ff,
    sparks: 26,
    chip: [0x3ad8f0, 0xe83ac8, 0x8a5ad8],
    chips: 12,
  },
  sandstone: {
    build(g, r) {
      // a slab of red rock, banded, with a couple of loose lumps
      const a = toon(0x9a4426);
      const b = toon(0xe8b088);
      const c = toon(0x6a2c1a);
      g.add(part(GEO.dodeca, a, [0, 0, 0], [r * 1.5, r * 1.1, r * 1.3]));
      g.add(part(GEO.box, b, [0, r * 0.15, 0], [r * 1.25, r * 0.18, r * 1.1], [0, 0.4, 0]));
      g.add(part(GEO.dodeca, c, [r * 0.7, -r * 0.2, r * 0.3], r * 0.6));
      g.add(part(GEO.dodeca, b, [-r * 0.6, r * 0.3, -r * 0.4], r * 0.45));
    },
    tumble: true,
    shadow: 0x3a1a10,
    rim: 0xffd08a,
    flash: 0xffe0b0,
    trail: 0xd8a070,
    trailEnd: 0xa06a48,
    trailGlow: false,
    trailRate: 20,
    puff: 0xe0a878,
    puffEnd: 0xb07a58,
    puffGlow: false,
    puffs: 16,
    spark: 0xffd08a,
    sparks: 10,
    chip: [0xc0683a, 0x8a4a2a, 0xe09a6a],
    chips: 14,
  },
  glass: {
    build(g, r) {
      // slag with green glass fused through it, still glowing
      const slag = toon(0x2a302c);
      const a = toon(0x5affa0, { glow: 0.7 });
      const b = toon(0x9affc8, { glow: 0.5 });
      g.add(part(GEO.dodeca, slag, [0, 0, 0], [r * 1.3, r * 1, r * 1.2]));
      g.add(part(GEO.oct, a, [r * 0.4, r * 0.3, 0], [r * 0.5, r * 1.6, r * 0.5], [0, 0, -0.6]));
      g.add(part(GEO.oct, b, [-r * 0.4, r * 0.2, r * 0.2], [r * 0.4, r * 1.3, r * 0.4], [0.3, 0, 0.7]));
      g.add(part(GEO.tet, a, [0, -r * 0.5, -r * 0.3], r * 0.7));
    },
    tumble: true,
    shadow: 0x0a1a10,
    rim: 0x8affb0,
    flash: 0xc0ffd8,
    trail: 0x6aff9a,
    trailEnd: 0x1a5a3a,
    trailGlow: true,
    trailRate: 16,
    puff: 0x4a5a4a,
    puffEnd: 0x2a302c,
    puffGlow: false,
    puffs: 10,
    spark: 0x6aff9a,
    sparks: 24,
    chip: [0x5affa0, 0x2a302c, 0x9affc8],
    chips: 12,
  },
  plating: {
    build(g, r) {
      // a torn sheet of a titan's armour: rusted plate, a rib, rivets, a hot edge
      const rust = toon(0x7a4a32);
      const dark = toon(0x4a3a34);
      const hot = toon(0xff8a3a, { glow: 1 });
      g.add(part(GEO.box, rust, [0, 0, 0], [r * 2.2, r * 0.3, r * 1.5], [0, 0.3, 0.15]));
      g.add(part(GEO.box, dark, [0, r * 0.25, 0], [r * 2, r * 0.35, r * 0.35], [0, 0.3, 0.15]));
      for (let i = 0; i < 4; i++) g.add(part(GEO.ball, dark, [(i - 1.5) * r * 0.5, r * 0.2, r * 0.55], r * 0.18));
      g.add(part(GEO.box, hot, [r * 1.05, 0, 0], [r * 0.15, r * 0.32, r * 1.4], [0, 0.3, 0.15]));
    },
    tumble: true,
    shadow: 0x1a1210,
    rim: 0xffa050,
    flash: 0xffe0a0,
    trail: 0x4a4040,
    trailEnd: 0x2a2428,
    trailGlow: false,
    trailRate: 18,
    puff: 0x4a4040,
    puffEnd: 0x2a2428,
    puffGlow: false,
    puffs: 10,
    spark: 0xffa040,
    sparks: 30,
    chip: [0x7a4a32, 0x4a3a34],
    chips: 14,
  },
  stalactite: {
    build(g, r) {
      // a fang of the cave roof, point down, banded like the reef
      const a = toon(0xe8b0b8);
      const b = toon(0xb87080);
      const c = toon(0x8a5068);
      // leant towards you a little, so the fang shows, not just its root
      g.rotation.x = 0.55;
      g.add(part(GEO.cone6, a, [0, 0, 0], [r * 1.1, r * 3.4, r * 1.1], [Math.PI, 0, 0]));
      g.add(part(GEO.cyl6, b, [0, r * 1.2, 0], [r * 1.05, r * 0.5, r * 1.05]));
      g.add(part(GEO.cyl6, c, [0, r * 1.7, 0], [r * 1.2, r * 0.5, r * 1.2]));
      g.add(part(GEO.cone6, b, [r * 0.55, r * 1, 0], [r * 0.4, r * 1.4, r * 0.4], [Math.PI, 0, 0.2]));
    },
    tumble: false,
    drip: true,
    splash: true,
    shadow: 0x0a2a3a,
    rim: 0x9af0ff,
    flash: 0xd0f8ff,
    trail: 0xa8e8ff,
    trailEnd: 0x4a9ab8,
    trailGlow: false,
    trailRate: 10,
    puff: 0xe8f8ff,
    puffEnd: 0x8ac8d8,
    puffGlow: false,
    puffs: 10,
    spark: 0x9af0ff,
    sparks: 8,
    chip: [0xe8c0c0, 0xc88a98],
    chips: 10,
  },
};
ROCKS.rock = {
  ...ROCKS.sandstone!,
  build(g, r) {
    g.add(part(GEO.dodeca, toon(0x8a7a6a), [0, 0, 0], r * 1.3), part(GEO.dodeca, toon(0x6a5a50), [r * 0.6, -r * 0.2, 0], r * 0.6));
  },
  rim: 0xffd04a,
  trail: 0xb0a090,
  trailEnd: 0x7a6a60,
  puff: 0xb0a090,
  puffEnd: 0x7a6a60,
  chip: [0x8a7a6a, 0x6a5a50],
};

// ------------------------------------------------------------------------------------------------
// Gate posts
// ------------------------------------------------------------------------------------------------

/** Engine City: a steel pylon iced over, banded in orange light, the emitter in a frosted head. */
function pylon(foot: number) {
  // (the emitter at 0, the land at `foot` below it)
  const g = new THREE.Group();
  const steel = toon(0x3a4a5a);
  const pale = toon(0x8a9aaa);
  const ice = toon(0xe8f4ff);
  const band = toon(0xff8a2a, { glow: 1 });
  const top = 1.6;
  const L = top - foot;
  g.add(part(GEO.cyl6, steel, [0, foot + L / 2, 0], [2, L, 2]));
  g.add(part(GEO.cyl6, pale, [0, foot + 0.5, 0], [3.2, 1, 3.2]));
  for (let y = -1.4; y > foot + 1; y -= 2.4) g.add(part(GEO.cyl6, band, [0, y, 0], [2.15, 0.35, 2.15]));
  // the emitter: a housing with a glowing slot facing in
  g.add(part(GEO.box, steel, [-0.7, 0, 0], [2, 2, 2.2]));
  g.add(part(GEO.box, band, [-1.72, 0, 0], [0.1, 1, 1]));
  // snow on top, icicles hanging off it
  g.add(part(GEO.box, ice, [-0.3, 1.1, 0], [2.8, 0.45, 2.6]));
  g.add(part(GEO.cyl6, ice, [0, top + 0.2, 0], [1.6, 0.5, 1.6]));
  for (let i = 0; i < 3; i++) g.add(part(GEO.cone4, ice, [-1.4 + i * 0.6, 0.4, 1.15], [0.3, 0.9 + i * 0.25, 0.3], [Math.PI, 0, 0]));
  return g;
}

/** The canyons and the lake: a corroded post, hazard-striped, with a caged emitter. */
function stake(foot: number, chem: boolean) {
  const g = new THREE.Group();
  const rust = toon(chem ? 0x5a4a5a : 0x7a4a32);
  const dark = toon(0x2a2626);
  const stripe = toon(0xe0b030);
  const lampT = chem ? toon(0xa0ff4a, { glow: 1 }) : toon(0xff4a3a, { glow: 1 });
  const top = 1.4;
  const L = top - foot;
  g.add(part(GEO.box, rust, [0, foot + L / 2, 0], [1.6, L, 1.6]));
  g.add(part(GEO.box, dark, [0, foot + 0.4, 0], [2.8, 0.8, 2.8]));
  for (let i = 0; i < 4; i++) g.add(part(GEO.box, i % 2 ? dark : stripe, [0, -1 - i * 0.6, 0], [1.7, 0.6, 1.7]));
  // a striped cap, and the warning lamp on it
  g.add(part(GEO.box, stripe, [0, top, 0], [1.9, 0.3, 1.9]));
  g.add(part(chem ? GEO.cyl : GEO.sphere, lampT, [0, top + 0.45, 0], chem ? [0.6, 0.6, 0.6] : 0.7));
  // the emitter in its cage
  g.add(part(GEO.box, dark, [-0.8, 0, 0], [1.4, 1.5, 1.6]));
  g.add(part(GEO.box, lampT, [-1.52, 0, 0], [0.08, 0.7, 0.7]));
  for (const z of [-0.7, 0.7]) g.add(part(GEO.box, rust, [-1.6, 0, z], [0.14, 1.6, 0.14]));
  g.add(part(GEO.box, rust, [-1.6, 0.8, 0], [0.14, 0.14, 1.5]));
  g.add(part(GEO.box, rust, [-1.6, -0.8, 0], [0.14, 0.14, 1.5]));
  return g;
}

// ------------------------------------------------------------------------------------------------
// Bits
// ------------------------------------------------------------------------------------------------

/** How many to emit this frame at `rate` a second (a fraction carried by chance). */
function emit(rate: number, dt: number) {
  const n = rate * dt;
  return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
}

/** A material of the hazard's own (it fades): unlit; `light` adds; `over` draws through the land. */
function mat(color: number, opacity: number, light = false, over = false) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: light ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    depthTest: !over,
    side: THREE.DoubleSide,
  });
}

function flatDisc(m: THREE.Material, r: number, y: number) {
  const d = part(DISC, m, [0, y, 0], r, [-Math.PI / 2, 0, 0]);
  d.renderOrder = 4;
  return d;
}

/** A ring the size of what it'll hit, edged in dark so it reads on any ground. */
function flatRing(m: THREE.Material, r: number, y: number, edged = true) {
  const d = part(RIM, m, [0, y, 0], r, [-Math.PI / 2, 0, 0]);
  d.renderOrder = 5;
  if (!edged) return d;
  const back = part(RIM_BACK, EDGE, [0, 0, -0.01], 1);
  back.renderOrder = 4;
  d.add(back);
  return d;
}

/** Lays a bolt's leg (a thin box and its halo) between two points. */
function seg(c: THREE.Mesh, hl: THREE.Mesh, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number) {
  V.set(bx - ax, by - ay, bz - az);
  const len = V.length();
  V.divideScalar(len || 1);
  c.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  c.quaternion.setFromUnitVectors(UP, V);
  c.scale.set(w, len + w, w);
  hl.position.copy(c.position);
  hl.quaternion.copy(c.quaternion);
  hl.scale.set(w * 3.5, len + w * 2, w * 3.5);
  c.visible = hl.visible = true;
}

const SPRAY = new THREE.Color(0xd8f4ff);
const STATIC = new THREE.Color(0xd0e0ff);
const V = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DISC = new THREE.CircleGeometry(1, 32);
const RIM = new THREE.RingGeometry(0.86, 1, 40);
const RIM_BACK = new THREE.RingGeometry(0.8, 1.07, 40);
const EDGE = new THREE.MeshBasicMaterial({ color: 0x0a0608, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });
/** A fountain: open at both ends, wider at the top, standing on its foot. */
const JET = shade(new THREE.CylinderGeometry(1.25, 0.7, 1, 12, 4, true).translate(0, 0.5, 0));
/** A flame: a cone from a wide foot to a point. */
const FLAME = shade(new THREE.ConeGeometry(1, 1, 12, 4, true).translate(0, 0.5, 0));
/** Hot at the foot, cooling to the top: a jet's colour by height (it's 0..1 tall). */
function shade(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - clamp(pos.getY(i), 0, 1) * 0.6;
    col.set([1, k, k * 0.9], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A jet's skin: streaks and blobs that scroll up it, so it pours (shared: they all flow as one). */
const FLOW = (() => {
  const w = 16;
  const h = 32;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(190,190,190,0.8)';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(Math.random() * w);
    const y = Math.floor(Math.random() * h);
    const v = Math.random() < 0.3 ? 80 : 235 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgba(${v},${v},${v},${v < 100 ? 0.6 : 1})`;
    const sh = 2 + Math.floor(Math.random() * 6);
    const sw = 1 + Math.floor(Math.random() * 3);
    // wrap so the tile has no seam
    for (const dx of [0, -w, w]) for (const dy of [0, -h, h]) ctx.fillRect(x + dx, y + dy, sw, sh);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.5);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
})();

/** A material for a jet (its own: it fades), streaked by FLOW. */
function flow(color: number, opacity: number, light: boolean) {
  return new THREE.MeshBasicMaterial({ color, map: FLOW, vertexColors: true, transparent: true, opacity, alphaTest: 0.05, blending: light ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide });
}

/** A soft disc, for clouds and glows. */
const SOFT = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
})();
