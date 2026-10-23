import * as THREE from 'three';
import type { Terrain, Chunk, Placed, Wildlife } from '../sim/terrain';
import { CHUNK } from '../sim/terrain';
import type { Biome } from '../world/planets';
import { lookOf, PATTERNS } from '../world/looks';
import { library, type Instance } from '../render/assets';
import { toon, GEO, part, GRADIENT } from '../render/toon';
import { enliven, weather, NOISE_GLSL, WASH, SEE } from '../render/alive';
import { clamp, noise2 } from '../util';
import { metaOf, height as metaHeight } from '../sim/meta';
import type { Fx } from './fx';
import { FLIGHT_Y } from '../sim/types';

/**
 * The land as you see it, a chunk at a time: soft-shaded ground painted in the biome's colours,
 * grass that bends in the wind wherever it's green, water with waves rolling in and foam lapping
 * at the shore, and the props and wildlife the sim's terrain placed. Chunks are made as they come
 * up the screen and dropped once they've gone by.
 */

/** Across: wide enough for a wide screen and the tilted camera. */
const SPAN = 62;
const COARSE = 0.8;
/** A canyon's grid. */
const FINE = 0.5;
const WATER_STEP = 1;
/** Grass blades per square unit of grassy ground. */
const GRASS = 3.2;

interface ChunkView {
  index: number;
  group: THREE.Group;
  instances: Instance[];
  wildlife: { inst: Instance | null; obj: THREE.Object3D; w: Wildlife; x: number; z: number; y: number; t: number }[];
  geos: THREE.BufferGeometry[];
  emitters: Emitter[];
}

/** Something that breathes out into the air: steam, smoke, sparks, spores. */
interface Emitter {
  kind: EmitKind;
  x: number;
  y: number;
  z: number;
  s: number;
  t: number;
}
type EmitKind = 'steam' | 'lava' | 'fire' | 'spores' | 'stack' | 'smoulder' | 'glint';
const EMITS: Record<string, EmitKind> = {
  steam_vent: 'steam',
  lava_vent: 'lava',
  bonfire: 'fire',
  spore_vent: 'spores',
  smokestack: 'stack',
  mech_wreck: 'smoulder',
  scrap_pile: 'smoulder',
  glowcap: 'spores',
  glowcap_tall: 'spores',
  crystal_cluster: 'glint',
  crystal_spire: 'glint',
  ice_spire: 'glint',
};

/** Each segment's ground pattern (see world/looks.ts): kind (-1 none), size, strength, glow; and colour. */
const SEGS = 8;
const patterns = {
  uPat: { value: Array.from({ length: SEGS }, () => new THREE.Vector4(-1, 1, 0, 0)) },
  uPatCol: { value: Array.from({ length: SEGS }, () => new THREE.Color()) },
  /** patchiness, the height it keeps under */
  uPat2: { value: Array.from({ length: SEGS }, () => new THREE.Vector4(0, 999, 0, 0)) },
  /** each segment's rock (its cliff colour), for a canyon's faces */
  uCliff: { value: Array.from({ length: SEGS }, () => new THREE.Color()) },
};

const PATTERN_GLSL = /* glsl */ `
  uniform vec4 uPat[${SEGS}];
  uniform vec3 uPatCol[${SEGS}];
  uniform vec4 uPat2[${SEGS}];
  uniform vec3 uCliff[${SEGS}];
  uniform float uTime;
  varying vec4 vLook;
  // nearest and second-nearest of a scatter of points, and the nearest's own random number
  vec3 gVor(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = vec2(aHash(i + g), aHash(i + g + 17.3)) * 0.8 + 0.1;
        vec2 r = g + o - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; id = aHash(i + g + 5.1); }
        else if (d < f2) f2 = d;
      }
    return vec3(sqrt(f1), sqrt(f2), id);
  }
  // how much of the pattern's colour at w (0..1), and a shade to multiply the ground by
  float gPattern(vec2 w, int kind, float scale, out float shade) {
    vec2 p = w / scale;
    shade = 1.0;
    if (kind == 0) {
      // cells: polygons with dark joints, each its own shade
      vec3 v = gVor(p + (vec2(aNoise(p * 2.0), aNoise(p * 2.0 + 9.0)) - 0.5) * 0.25);
      shade = 0.92 + v.z * 0.16;
      return 1.0 - smoothstep(0.035, 0.08, v.y - v.x);
    }
    if (kind == 1) {
      // cracks: thin, wandering, broken off here and there
      vec2 q = p + (vec2(aNoise(p * 1.3), aNoise(p * 1.3 + 4.0)) - 0.5) * 0.7;
      vec3 v = gVor(q);
      float line = 1.0 - smoothstep(0.012, 0.035, v.y - v.x);
      vec3 v2 = gVor(q * 2.7 + 3.0);
      line = max(line, (1.0 - smoothstep(0.01, 0.03, v2.y - v2.x)) * 0.6 * step(0.55, aNoise(q * 1.7)));
      return line * smoothstep(0.35, 0.55, aNoise(p * 0.6 + 2.0));
    }
    if (kind == 2) {
      // veins: branching lines where the noise crosses its middle
      float n = aFbm(p);
      float m = 1.0 - smoothstep(0.0, 0.03, abs(n - 0.5));
      float n2 = aNoise(p * 3.1 + 7.0);
      m = max(m, (1.0 - smoothstep(0.0, 0.025, abs(n2 - 0.5))) * smoothstep(0.42, 0.5, n) * 0.7);
      return m;
    }
    if (kind == 3 || kind == 7) {
      // tiles in courses (or plates, square and riveted), each its own shade, a little worn
      vec2 q = p;
      if (kind == 3) q.x += 0.5 * mod(floor(q.y), 2.0);
      vec2 cell = floor(q);
      vec2 g = fract(q);
      shade = 0.9 + aHash(cell) * 0.2;
      float joint = min(min(g.x, g.y), min(1.0 - g.x, 1.0 - g.y));
      float m = 1.0 - smoothstep(0.025, 0.06, joint);
      if (kind == 7) {
        vec2 c = abs(g - 0.5);
        float rivet = 1.0 - smoothstep(0.025, 0.045, length(c - vec2(0.42)));
        m = max(m, rivet * 0.8);
      } else m *= smoothstep(0.2, 0.45, aNoise(p * 1.7));
      return m;
    }
    if (kind == 4) {
      // ripples, combed across, wavering
      float v = sin((p.y + p.x * 0.3 + aNoise(p * 0.35) * 2.6) * 6.2832);
      return smoothstep(0.55, 0.95, v) * (0.6 + 0.4 * aNoise(p * 0.5));
    }
    if (kind == 5) {
      // rings round scattered centres, stained inside
      vec3 v = gVor(p);
      float r = fract(v.x * 5.0 - v.z);
      float ring = (1.0 - smoothstep(0.08, 0.2, abs(r - 0.5) * 2.0 - 0.6)) * (1.0 - smoothstep(0.25, 0.5, v.x));
      shade = 1.0 - (1.0 - smoothstep(0.0, 0.3, v.x)) * 0.12;
      return max(ring * 0.7, 1.0 - smoothstep(0.06, 0.12, v.x)) * step(0.35, v.z);
    }
    if (kind == 6) {
      // streaks along the wind
      float n = aFbm(vec2(p.x * 0.35 + p.y * 0.15, p.y * 2.6 - p.x * 0.6));
      return smoothstep(0.58, 0.72, n);
    }
    return 0.0;
  }
`;

/** The lit lip along a canyon's tops. */
const LIP = 0xffe2b0;
/** How far round (in cells) a canyon's ground looks for the edge of its rock. */
const REACH = 8;
/** Where the rock turns solid: the flight line, less the ship's margin (see Terrain.solid). */
const SOLID = FLIGHT_Y - 0.6;

/**
 * A canyon's rock, per pixel (vLook.z: how much canyon; w: how far to the rock, see toRock). Where
 * it turns solid is drawn on the floor as a hard edge of light hugging the walls and pillars, so the
 * way through reads at a glance; near a ship it runs hot and pulses, and spills its light out over
 * the floor and up the rock. The walls' faces are the rock's own colour in columns, deeper towards
 * their feet; over the flight line they fall back into a cool shade, deeper the higher they go,
 * while the tops stay lit, a little hazed: the floor is the lit stage, the walls frame it.
 */
const CANYON_GLSL = /* glsl */ `
  if (vLook.z > 0.0) {
    float y = vAliveW.y;
    float sd = vLook.w;
    // (the face's own slope, from the pixel's neighbours: 1 flat, 0 sheer)
    vec3 fn = normalize(cross(dFdx(vAliveW), dFdy(vAliveW)));
    float flatness = smoothstep(0.5, 0.8, abs(fn.y));
    float face = (1.0 - flatness) * smoothstep(1.5, 4.0, y);
    // columns down the face, each its own shade, darker into the cleft at the foot
    float colm = aHash(vec2(floor((vAliveW.x + vAliveW.z) * 0.62), 3.0));
    vec3 rock = uCliff[int(vLook.x + 0.5)] * (1.0 + 0.3 * colm) * mix(0.8, 1.3, smoothstep(2.0, 22.0, y));
    diffuseColor.rgb = mix(diffuseColor.rgb, rock, face * vLook.z);
    float over = smoothstep(${SOLID.toFixed(2)}, ${(SOLID + 2.5).toFixed(2)}, y);
    float high = smoothstep(${(SOLID + 1).toFixed(2)}, ${(SOLID + 24).toFixed(2)}, y);
    vec3 shade = diffuseColor.rgb * vec3(0.42, 0.44, 0.58);
    shade = mix(shade, vec3(dot(shade, vec3(0.3, 0.55, 0.15))), 0.35);
    diffuseColor.rgb = mix(diffuseColor.rgb, shade, clamp(0.35 * over + 0.65 * high, 0.0, 1.0) * mix(1.0, 0.28, flatness) * vLook.z);
    // how near a ship (uSee's strength 1 is a ship, a foe's less)
    float near = 0.0;
    for (int i = 0; i < ${SEE}; i++) {
      vec4 k = uSee[i];
      if (k.w < 0.99) continue;
      near = max(near, 1.0 - smoothstep(3.0, 12.0, length(vAliveW.xz - k.xy)));
    }
    float pulse = 0.7 + 0.3 * sin(uTime * 9.0);
    float aa = max(fwidth(sd), 1e-3);
    // the edge: a band out from the rock over the floor (only out: drawn with depth, the rock over
    // the line stretches far over the ground it stands on), a dark rim just outside it so it holds
    // on any ground
    float wide = 0.5 + near * 0.3;
    float edge = smoothstep(-aa, 0.0, sd) * (1.0 - smoothstep(wide, wide + aa, sd));
    float rim = smoothstep(wide, wide + aa, sd) * (1.0 - smoothstep(wide + 0.25, wide + 0.25 + aa, sd));
    float spill = step(0.0, sd) * (1.0 - smoothstep(0.0, 2.5 + near * 1.5, sd));
    float halo = step(sd, 0.0) * step(${SOLID.toFixed(2)}, y) * (1.0 - smoothstep(0.0, 1.5 + near * 2.5, y - ${SOLID.toFixed(2)}));
    vec3 lit = mix(vec3(1.0, 0.84, 0.56), vec3(1.0, 0.28, 0.1), near);
    float k = vLook.z;
    diffuseColor.rgb *= 1.0 - rim * 0.4 * k;
    diffuseColor.rgb = mix(diffuseColor.rgb, lit, edge * 0.5 * k);
    totalEmissiveRadiance += lit * k * (edge * (0.32 + near * 0.8 * pulse) + spill * spill * near * 0.3 * pulse + halo * near * 0.5 * pulse);
  }
`;

/** The ground: its colours per vertex, its patterns per pixel. */
function groundMaterial() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRADIENT });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, patterns);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLook;\nvarying vec4 vLook;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLook = aLook;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${PATTERN_GLSL}`).replace(
      '#include <color_fragment>',
      /* glsl */ `#include <color_fragment>
      {
        int seg = int(vLook.x + 0.5);
        vec4 pat = uPat[seg];
        if (pat.x >= 0.0 && vLook.y > 0.0) {
          float sh;
          vec4 pat2 = uPat2[seg];
          float m = gPattern(vAliveW.xz, int(pat.x + 0.5), pat.y, sh) * vLook.y;
          m *= 1.0 - pat2.x * (1.0 - smoothstep(0.38, 0.62, aFbm(vAliveW.xz * 0.025 + float(seg) * 7.0)));
          m *= 1.0 - smoothstep(pat2.y, pat2.y + 1.0, vAliveW.y);
          // (and faded off a canyon's walls: the eye stays on the floor)
          m *= 1.0 - vLook.z * smoothstep(${FLIGHT_Y.toFixed(1)}, ${(FLIGHT_Y + 8).toFixed(1)}, vAliveW.y) * 0.85;
          diffuseColor.rgb *= mix(1.0, sh, vLook.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, uPatCol[seg], m * pat.z);
          totalEmissiveRadiance += uPatCol[seg] * m * pat.w;
        }
      }
      ${CANYON_GLSL}`,
    );
  };
  // (drawn with depth, so a canyon's walls tower over you; never thinned, as nothing of it hangs over the floor)
  return enliven(mat, { grain: 0.11, see: true, hole: false });
}
const groundMat = groundMaterial();

export class WorldView {
  readonly group = new THREE.Group();
  private chunks = new Map<number, ChunkView>();
  private water: THREE.ShaderMaterial;
  private grassMat: THREE.MeshToonMaterial;
  time = 0;

  constructor(readonly terrain: Terrain) {
    this.water = waterMaterial();
    this.grassMat = grassMaterial();
    patterns.uPat.value.forEach((u, i) => {
      const pat = terrain.segments[i] ? lookOf(terrain.segments[i].biome.id).pattern : undefined;
      if (!pat) return u.set(-1, 1, 0, 0);
      u.set(PATTERNS.indexOf(pat.kind), pat.scale, pat.amount, pat.glow ?? 0);
      patterns.uPat2.value[i].set(pat.patchy ?? 0, pat.below ?? 999, 0, 0);
      patterns.uPatCol.value[i].setHex(pat.color);
    });
    patterns.uCliff.value.forEach((c, i) => c.setHex(terrain.segments[i]?.biome.cliff ?? 0x6a5a5a));
  }

  /** The sun's direction (towards it), for the water's glints. */
  setSun(dir: THREE.Vector3) {
    this.water.uniforms.uSun.value.copy(dir).normalize();
  }

  /** Make the chunks from zFar (up the screen) to zNear; drop the rest. */
  update(zFar: number, zNear: number, dt: number) {
    this.time += dt;
    const want = new Set<number>();
    for (let i = Math.floor(-zNear / CHUNK); i <= Math.floor(-zFar / CHUNK); i++) want.add(i);
    for (const [i, c] of this.chunks)
      if (!want.has(i)) {
        this.group.remove(c.group);
        for (const g of c.geos) g.dispose();
        for (const inst of c.instances) inst.dispose();
        for (const w of c.wildlife) w.inst?.dispose();
        this.chunks.delete(i);
      }
    // one new chunk a frame (a chunk is a few milliseconds' work), nearest first; more at the start
    let made = 0;
    const most = this.chunks.size < 4 ? 8 : 1;
    for (const i of [...want].sort((a, b) => a - b)) {
      if (this.chunks.has(i) || made >= most) continue;
      const c = this.build(this.terrain.chunk(i));
      this.chunks.set(i, c);
      this.group.add(c.group);
      made++;
    }
    for (const c of this.chunks.values()) {
      for (const inst of c.instances) inst.update(dt);
      for (const w of c.wildlife) this.moveCreature(w, dt);
    }
  }

  private build(chunk: Chunk): ChunkView {
    const group = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    const z0 = -chunk.index * CHUNK;
    const { geo: ground, grass } = groundGeometry(this.terrain, z0);
    geos.push(ground);
    const gm = new THREE.Mesh(ground, groundMat);
    gm.receiveShadow = true;
    group.add(gm);
    if (grass) {
      geos.push(grass.geometry);
      grass.material = this.grassMat;
      group.add(grass);
    }
    const water = waterGeometry(this.terrain, z0);
    if (water) {
      geos.push(water);
      const wm = new THREE.Mesh(water, this.water);
      wm.renderOrder = 2;
      group.add(wm);
    }
    const instances: Instance[] = [];
    const emitters: Emitter[] = [];
    for (const p of chunk.props) {
      const inst = library.clone(p.kind, p.variant);
      const obj = inst ? inst.obj : placeholder(p);
      obj.position.set(p.x, p.y, p.z);
      obj.rotation.y = p.rot;
      obj.scale.setScalar(p.s);
      // what you fly under stands well clear of you: stretched up from the ground, so its legs
      // still stand where they hit
      if (p.role === 'span' || p.role === 'gate') obj.scale.y *= LIFT[p.role];
      // whatever reaches over the flight line thins away round a ship under it; but a span or a
      // gate stays solid, high over you, and you show through it as a silhouette (see xray.ts)
      if (p.role === 'span' || p.role === 'gate' || p.rim) seeThrough(obj, false);
      else if (p.obstacle || p.role || p.y + metaTop(p) > FLIGHT_Y + 1) seeThrough(obj);
      if (!p.obstacle && !p.role) {
        // no two alike: a lean, and a shade of their patch's colour (neighbours share a cast, as
        // a stand of trees does)
        obj.rotation.x = (hash(p.x * 3.7, p.z) - 0.5) * 0.12;
        obj.rotation.z = (hash(p.z * 1.9, p.x) - 0.5) * 0.12;
        const k = Math.round(clamp(noise2(p.x * 0.03, p.z * 0.03, 9) * 4.4 - 0.2 + (hash(p.x, p.z * 2.3) - 0.5) * 1.4, 0, TINTS - 1));
        if (k !== MID) tint(obj, k);
      }
      group.add(obj);
      if (inst?.mixer) instances.push(inst);
      const e = EMITS[p.kind];
      if (e) emitters.push({ kind: e, x: p.x, y: p.y + (e === 'stack' ? metaTop(p) : 0.4 * p.s), z: p.z, s: p.s, t: hash(p.x, p.z) * 3 });
    }
    const wildlife: ChunkView['wildlife'] = [];
    for (const w of chunk.wildlife) {
      const inst = library.clone(w.kind, 0);
      const obj = inst ? inst.obj : part(GEO.box, toon(0x8a6a4a), [0, 0.6, 0], [1, 1, 2]);
      obj.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o.castShadow = true), (o.receiveShadow = true)) : 0));
      group.add(obj);
      wildlife.push({ inst, obj, w, x: w.x, z: w.z, y: 0, t: Math.random() * 10 });
    }
    group.updateMatrixWorld(true);
    return { index: chunk.index, group, instances, wildlife, geos, emitters };
  }

  private moveCreature(c: ChunkView['wildlife'][number], dt: number) {
    const w = c.w;
    c.t += dt;
    const flyer = w.kind === 'pterosaur_flock' || w.kind === 'sky_whale' || w.kind === 'moth_swarm' || w.kind === 'jellyfish';
    const sp = w.speed * (flyer ? 2.2 : 1);
    // a wandering heading
    const h = w.heading + Math.sin(c.t * 0.3 + w.x) * 0.6;
    c.x += Math.sin(h) * sp * dt;
    c.z += Math.cos(h) * sp * dt;
    const ground = this.terrain.height(c.x, c.z);
    const water = this.terrain.water(c.z);
    let y = Math.max(ground, water);
    if (w.kind === 'jellyfish') y = water + 1 + ((c.t * 0.6) % 7);
    else if (w.kind === 'sky_whale') y = Math.max(y + 3, 5);
    else if (flyer) y = Math.max(y + 2.5, 5.5) + Math.sin(c.t) * 0.4;
    else if (w.kind === 'plesiosaur') y = water + Math.sin(c.t * 1.3) * 0.15;
    c.obj.position.set(c.x, y, c.z);
    // the models face -z
    c.obj.rotation.y = h + Math.PI;
    c.inst?.update(dt);
  }

  /** The land's breath: every vent, fire and wreck in view puts out its smoke, steam or sparks. */
  emit(fx: Fx, dt: number, zFar: number, zNear: number) {
    for (const c of this.chunks.values())
      for (const e of c.emitters) {
        if (e.z < zFar || e.z > zNear) continue;
        e.t += dt;
        const rate = RATE[e.kind];
        while (e.t > rate) {
          e.t -= rate * (0.6 + Math.random() * 0.8);
          puff(fx, e);
        }
      }
  }

  lerpWater(a: Biome, b: Biome, t: number) {
    const ca = new THREE.Color(a.waterColor);
    const cb = new THREE.Color(b.waterColor);
    if (a.water === null) ca.copy(cb);
    if (b.water === null) cb.copy(ca);
    const c = ca.lerp(cb, t);
    const glow = THREE.MathUtils.lerp(a.water === null ? (b.waterGlow ?? 0) : (a.waterGlow ?? 0), b.water === null ? (a.waterGlow ?? 0) : (b.waterGlow ?? 0), t);
    const u = this.water.uniforms;
    u.uShallow.value.copy(c).multiplyScalar(glow > 0 ? 1 : 1.15);
    u.uDeep.value.copy(c).multiplyScalar(glow > 0 ? 0.55 : 0.42);
    u.uGlow.value = glow;
  }

  dispose() {
    for (const c of this.chunks.values()) {
      for (const g of c.geos) g.dispose();
      for (const i of c.instances) i.dispose();
    }
    this.chunks.clear();
    this.group.clear();
  }
}

const RATE: Record<EmitKind, number> = { steam: 0.12, lava: 0.1, fire: 0.05, spores: 0.35, stack: 0.14, smoulder: 0.4, glint: 0.5 };
const wind = () => weather.uWindDir.value;
const C = {
  steam: new THREE.Color(0xf4f2ee),
  steamEnd: new THREE.Color(0xc8ccd4),
  smoke: new THREE.Color(0x5a5250),
  smokeEnd: new THREE.Color(0x3a3438),
  ember: new THREE.Color(0xffd070),
  emberEnd: new THREE.Color(0xc0381a),
  flame: new THREE.Color(0xfff0a0),
  spore: new THREE.Color(0xc8ffb0),
  glint: new THREE.Color(0xffffff),
};
function puff(fx: Fx, e: Emitter) {
  const w = wind();
  const j = () => (Math.random() - 0.5) * e.s;
  switch (e.kind) {
    case 'steam':
      fx.add({ x: e.x + j(), y: e.y, z: e.z + j(), vx: w.x * 2, vz: w.y * 2, vy: 4 + Math.random() * 2, size: 0.9 * e.s, grow: 3.5, life: 2, glow: false, color: C.steam, to: C.steamEnd });
      break;
    case 'lava':
      fx.add({ x: e.x + j(), y: e.y, z: e.z + j(), vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: 5 + Math.random() * 5, gravity: 4, size: 0.2, life: 1.4, color: C.ember, to: C.emberEnd });
      if (Math.random() < 0.4) fx.add({ x: e.x + j(), y: e.y, z: e.z + j(), vx: w.x * 2, vz: w.y * 2, vy: 3, size: 1 * e.s, grow: 3, life: 2.2, glow: false, color: C.smoke, to: C.smokeEnd });
      break;
    case 'fire':
      fx.add({ x: e.x + j() * 0.6, y: e.y, z: e.z + j() * 0.6, vy: 3 + Math.random() * 2, size: 0.6 * e.s, grow: 0.2, life: 0.45, color: C.flame, to: C.emberEnd });
      if (Math.random() < 0.12) fx.add({ x: e.x, y: e.y + 1, z: e.z, vx: w.x * 1.5, vz: w.y * 1.5, vy: 2.5, size: 0.6 * e.s, grow: 3, life: 2, glow: false, color: C.smoke, to: C.smokeEnd });
      if (Math.random() < 0.3) fx.add({ x: e.x, y: e.y, z: e.z, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 3, size: 0.12, life: 1.2, color: C.ember, to: C.emberEnd });
      break;
    case 'spores':
      fx.add({ x: e.x + j() * 2, y: e.y + Math.random() * 2 * e.s, z: e.z + j() * 2, vx: w.x * 0.8, vz: w.y * 0.8, vy: 0.8, size: 0.18, life: 3, color: C.spore });
      break;
    case 'stack':
      fx.add({ x: e.x + j() * 0.3, y: e.y, z: e.z + j() * 0.3, vx: w.x * 3, vz: w.y * 3, vy: 2.5, size: 1.2 * e.s, grow: 3.5, life: 2.6, glow: false, color: C.smoke, to: C.smokeEnd });
      break;
    case 'smoulder':
      fx.add({ x: e.x + j(), y: e.y + 0.5, z: e.z + j(), vx: w.x * 1.5, vz: w.y * 1.5, vy: 1.8, size: 0.6 * e.s, grow: 3, life: 2.4, glow: false, color: C.smoke, to: C.smokeEnd });
      break;
    case 'glint':
      fx.add({ x: e.x + j() * 1.5, y: e.y + Math.random() * 6 * e.s, z: e.z + j() * 1.5, size: 0.5, grow: 0.1, life: 0.25, color: C.glint });
      break;
  }
}

/** Height of a prop's top, placed. */
function metaTop(p: Placed) {
  return metaHeight(metaOf(p.kind, p.variant)) * p.s;
}

// ── shades: each lit material in a few casts either side of its own ─────────────────────────
const TINTS = 5;
const MID = 2;
const tints = new WeakMap<THREE.Material, THREE.Material[]>();
function shade(m: THREE.Material, k: number): THREE.Material {
  const t = m as THREE.MeshToonMaterial;
  if (!t.isMeshToonMaterial || t.userData.skin || (t.emissiveIntensity > 0 && t.emissive.getHex() !== 0)) return m;
  let list = tints.get(m);
  if (!list) {
    list = [];
    for (let i = 0; i < TINTS; i++) {
      if (i === MID) {
        list.push(m);
        continue;
      }
      const n = t.clone();
      n.userData = { ...t.userData };
      enliven(n, { sway: !!t.userData.sway });
      const d = i - MID;
      // warmer and lighter one way, cooler and deeper the other
      n.color.offsetHSL(d * 0.014, d * 0.04, d * 0.035);
      list.push(n);
    }
    tints.set(m, list);
  }
  return list[k];
}
function tint(obj: THREE.Object3D, k: number) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => shade(m, k)) : shade(mesh.material, k);
  });
}

/**
 * How much taller spans and gates are drawn than built (ART.md): a deck built at 13 shows at 21,
 * clearly over a ship at 10, and a gate's lintels with it.
 */
const LIFT = { span: 1.6, gate: 1.35 };

/** The see-through twin of a material (see weather.uSee), or with no `hole`, just drawn with depth. */
const seen = [new WeakMap<THREE.Material, THREE.Material>(), new WeakMap<THREE.Material, THREE.Material>()];
function seeThroughMat(m: THREE.Material, hole: boolean): THREE.Material {
  const t = m as THREE.MeshToonMaterial;
  if (!t.isMeshToonMaterial) return m;
  const cache = seen[hole ? 1 : 0];
  let n = cache.get(m);
  if (!n) {
    n = t.clone();
    n.userData = { ...t.userData };
    enliven(n, { sway: !!t.userData.sway, see: true, hole });
    cache.set(m, n);
  }
  return n;
}
export function seeThrough(obj: THREE.Object3D, hole = true) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => seeThroughMat(m, hole)) : seeThroughMat(mesh.material, hole);
  });
}

function placeholder(p: Placed) {
  const h = p.obstacle ? 15 : 1.5;
  return part(p.obstacle ? GEO.cyl6 : GEO.cone6, toon(p.obstacle ? 0x8a7a8a : 0x4a6a3a), [0, h / 2, 0], [p.obstacle ? 3 : 1.4, h, p.obstacle ? 3 : 1.4]);
}

const tmpB = new THREE.Color();
const tmpC = new THREE.Color();

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** The colour of the ground in a biome, at a height and steepness. */
function groundColor(b: Biome, h: number, steep: number, x: number, z: number, water: number, out: THREE.Color) {
  const g = b.ground;
  const top = b.shape === 'canyon' ? b.relief : Math.max(b.relief * 1.5, 2);
  // bands from shore to peak, blended where they meet, with a ragged edge
  const t = clamp(h / top + (noise2(x * 0.15, z * 0.15, 7) - 0.5) * 0.18, 0, 0.999);
  const f = b.shape === 'canyon' ? t * 3 : t * 2.2 + (h > water + 0.6 ? 1 : 0);
  const i = Math.min(2, Math.floor(f));
  out.setHex(g[i]).lerp(tmpC.setHex(g[Math.min(3, i + 1)]), clamp((f - i - 0.6) / 0.4, 0, 1));
  // wet sand at the waterline
  if (h < water + 0.5) out.setHex(g[0]).multiplyScalar(h < water + 0.15 ? 0.85 : 1);
  // steep faces are rock
  if (steep > 0.4) out.lerp(tmpC.setHex(b.cliff), clamp((steep - 0.4) / 0.2, 0, 1));
  // a canyon: the floor, a ledge a shade lighter, the tops lit (the faces are painted per pixel)
  if (b.shape === 'canyon') {
    const k = h > SOLID ? 3 : h > 3 ? 1 : 0;
    out.setHex(g[k]);
    // (ledges and shelves a step up: a shade lighter than the floor, not yet the tops)
    if (k === 1) out.lerp(tmpC.setHex(g[3]), 0.25);
    // (and their edges dark: a step you can see is a step)
    if (k === 1 && steep > 0.3) out.lerp(tmpC.setHex(b.cliff), clamp((steep - 0.3) / 0.25, 0, 1) * 0.8);
    // the floor in big soft patches of dust and darker grit, like a painter's underlayer
    if (k === 0) out.multiplyScalar(0.9 + noise2(x * 0.035, z * 0.035, 23) * 0.2);
    if (k === 3) out.lerp(tmpC.setHex(g[2]), clamp((h - 18) / 8, 0, 1) * 0.6);
  }
  switch (b.id) {
    case 'fernwood':
    case 'tundra':
    case 'whitewood':
    case 'glowcap': {
      // undergrowth: patches of a second green
      const k = noise2(x * 0.12, z * 0.12, 4);
      if (k > 0.55) out.lerp(tmpB.setHex(g[3]), Math.min(0.55, (k - 0.55) * 4));
      break;
    }
    case 'orchards': {
      // rows
      const r = Math.abs((((x % 4) + 4) % 4) - 2);
      if (r < 0.6) out.multiplyScalar(0.88);
      break;
    }
    case 'scavcamp':
    case 'refinery': {
      // tracks and concrete
      if (Math.abs(Math.sin(x * 0.15 + z * 0.03)) < 0.08) out.lerp(tmpB.setHex(0x3a3430), 0.8);
      break;
    }
  }
  // large soft patches of lighter and darker, like a painter's underlayer
  out.multiplyScalar(0.9 + noise2(x * 0.05, z * 0.05, 11) * 0.2 + (hash(x, z) - 0.5) * 0.04);
}

const FLOWERS = [0xffe070, 0xff8aa0, 0xf4f0ff, 0xc8a0ff, 0xff9a50].map((h) => new THREE.Color(h));
/** Where flowers grow thick (0 none … 1 a carpet). */
const smoothNoise = (x: number, z: number) => clamp((noise2(x * 0.08, z * 0.08, 17) - 0.45) * 4, 0, 1);

/** How green (so how likely to grow grass), 0..1: thins out towards the edge of a meadow. */
function grassy(c: THREE.Color) {
  if (c.g < c.b * 1.02) return 0;
  return clamp((c.g / Math.max(c.r, 0.01) - 1.06) * 6, 0, 1);
}

/**
 * One chunk of ground: a grid of shared vertices, smooth normals worked out from the heights
 * themselves (so neighbouring chunks agree at the seam), a colour per vertex. And its grass.
 */
function groundGeometry(t: Terrain, z0: number) {
  const X1 = SPAN;
  const X0 = -X1;
  // heights with a border all round, for the normals (and down a canyon, how far to its rock);
  // a canyon's on a finer grid, so its faces stand as faces
  const canyon = Math.max(t.canyonAt(z0), t.canyonAt(z0 - CHUNK)) > 0;
  const STEP = canyon ? FINE : COARSE;
  const nx = Math.round((X1 - X0) / STEP);
  const nz = Math.ceil(CHUNK / STEP);
  const B = canyon ? REACH : 1;
  const W = nx + 1 + 2 * B;
  const Hh = new Float32Array(W * (nz + 1 + 2 * B));
  for (let j = -B; j <= nz + B; j++)
    for (let i = -B; i <= nx + B; i++) Hh[(j + B) * W + i + B] = t.height(X0 + i * STEP, z0 - j * STEP);
  const at = (i: number, j: number) => Hh[(j + B) * W + i + B];
  const rock = canyon ? toRock(at, nx, nz, STEP) : null;
  const verts = (nx + 1) * (nz + 1);
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  // which segment's pattern, and how much of it: none right where two biomes meet, so the
  // switch from one to the next falls where neither shows
  const look = new Float32Array(verts * 4);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const n = new THREE.Vector3();
  const spots: number[] = [];
  let k = 0;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * STEP;
      const z = z0 - j * STEP;
      const h = at(i, j);
      // (z grows down the screen; j goes up it)
      n.set(-(at(i + 1, j) - at(i - 1, j)) / (2 * STEP), 1, (at(i, j + 1) - at(i, j - 1)) / (2 * STEP)).normalize();
      const steep = 1 - n.y;
      const bl = t.blend(z);
      const w = t.water(z);
      const water = w === -Infinity ? -99 : w;
      groundColor(t.segments[bl.a].biome, h, steep, x, z, water, c);
      // a canyon's tops lit along their edges, a lip you can follow down the gorge
      if (canyon && h > 2.5) {
        const nb = [at(i - 1, j), at(i + 1, j), at(i, j - 1), at(i, j + 1)];
        // (only the top-most row of the edge, so it's a line, not a band)
        if (h - Math.min(...nb) > 1.2 && h > Math.max(...nb) - 0.25) c.lerp(tmp.setHex(LIP), h > SOLID ? 0.75 : 0.45);
      }
      if (bl.a !== bl.b && bl.t > 0) {
        groundColor(t.segments[bl.b].biome, h, steep, x, z, water, tmp);
        c.lerp(tmp, bl.t);
      }
      // a dry wash or a worn track: its bed a shade deeper and cooler, its banks a little paler
      const bed = t.wash(x, z);
      if (bed > 0) c.multiplyScalar(1 - 0.14 * bed + 0.08 * bed * (1 - bed) * 4).lerp(tmp.setHex(0x8a5048), 0.22 * bed);
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      nor[k] = n.x;
      nor[k + 1] = n.y;
      nor[k + 2] = n.z;
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
      const v = (k / 3) * 4;
      look[v] = Math.min(SEGS - 1, bl.t < 0.5 ? bl.a : bl.b);
      look[v + 1] = bl.a === bl.b ? 1 : clamp(Math.abs(bl.t - 0.5) * 2.4 - 0.1, 0, 1);
      look[v + 2] = canyon ? t.canyonAt(z) : 0;
      look[v + 3] = rock ? rock(i, j, h) : REACH * STEP;
      k += 3;
      // grass, on the cells this vertex starts
      const green = i < nx && j < nz && steep < 0.12 && h > water + 0.45 ? grassy(c) : 0;
      if (green > 0) {
        const count = STEP * STEP * GRASS;
        const whole = Math.floor(count) + (hash(x * 3.1, z * 1.7) < count % 1 ? 1 : 0);
        for (let b = 0; b < whole; b++) {
          // thinning out at the edges, with a ragged line rather than the grid's
          if (hash(x * 1.9 + b, z * 2.7) > green * (0.75 + noise2(x * 0.4, z * 0.4, 3) * 0.5)) continue;
          const gx = x + hash(x + b * 1.3, z) * STEP;
          const gz = z - hash(x, z + b * 2.1) * STEP;
          // and here and there in a meadow, flowers: patches of one colour, not confetti
          const bloom = hash(gx * 5.1, gz * 3.3) < 0.06 * smoothNoise(gx, gz) ? FLOWERS[Math.floor(noise2(gx * 0.05, gz * 0.05, 13) * FLOWERS.length * 0.999)] : null;
          const fc = bloom ?? c;
          spots.push(gx, h + (at(i + 1, j) - h) * ((gx - x) / STEP) + (at(i, j + 1) - h) * ((z - gz) / STEP) - 0.05, gz, fc.r, fc.g, fc.b);
        }
      }
    }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const cc = a + nx + 1;
      const d = cc + 1;
      // alternate the diagonal for a less regular look (counter-clockwise from above)
      if ((i + j) % 2 === 0) idx.push(a, b, d, a, d, cc);
      else idx.push(a, b, cc, b, d, cc);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aLook', new THREE.BufferAttribute(look, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, grass: spots.length ? grassMesh(spots) : null };
}

/**
 * How far across the ground each cell is from where the rock turns solid, in world units: + out on
 * the open floor, - in the rock, REACH cells at most. The edge is found where the height crosses
 * the line between two neighbouring cells (to a fraction of a cell); each cell takes the nearest of
 * those, looked for only in the rows round it.
 */
function toRock(at: (i: number, j: number) => number, nx: number, nz: number, STEP: number) {
  const rows: number[][] = Array.from({ length: nz + 1 + 2 * REACH }, () => []);
  const add = (i: number, j: number) => rows[Math.round(j) + REACH]?.push(i, j);
  for (let j = -REACH; j <= nz + REACH; j++)
    for (let i = -REACH; i <= nx + REACH; i++) {
      const a = at(i, j);
      if (i < nx + REACH) {
        const r = at(i + 1, j);
        if (a > SOLID !== r > SOLID) add(i + (SOLID - a) / (r - a), j);
      }
      if (j < nz + REACH) {
        const d = at(i, j + 1);
        if (a > SOLID !== d > SOLID) add(i, j + (SOLID - a) / (d - a));
      }
    }
  return (i: number, j: number, h: number) => {
    let best = REACH * REACH;
    for (let r = j; r <= j + 2 * REACH; r++) {
      const row = rows[r];
      if (!row) continue;
      for (let k = 0; k < row.length; k += 2) {
        const dx = row[k] - i;
        const dz = row[k + 1] - j;
        best = Math.min(best, dx * dx + dz * dz);
      }
    }
    return (h > SOLID ? -STEP : STEP) * Math.sqrt(best);
  };
}

/** One blade: a slim triangle, darker at the root; swaying from the root up. */
const BLADE = (() => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.09, 0, 0, 0.09, 0, 0, 0, 0.7, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.86, 0.88, 0.86, 0.86, 0.88, 0.86, 1.2, 1.22, 1.06], 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute([0, 0, 1.4], 1));
  return g;
})();

function grassMaterial() {
  const mat = new THREE.MeshToonMaterial({ gradientMap: GRADIENT, vertexColors: true, side: THREE.DoubleSide });
  enliven(mat, { sway: true, grain: 0.05 });
  return mat;
}

function grassMesh(spots: number[]) {
  const n = spots.length / 6;
  const mesh = new THREE.InstancedMesh(BLADE, undefined as unknown as THREE.Material, n);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const turn = hash(spots[o] * 7.3, spots[o + 2] * 3.9) * Math.PI;
    const s = 0.7 + hash(spots[o + 2], spots[o]) * 0.8;
    const cs = Math.cos(turn);
    const sn = Math.sin(turn);
    m.set(cs * s, 0, sn * s, spots[o], 0, s, 0, spots[o + 1], -sn * s, 0, cs * s, spots[o + 2], 0, 0, 0, 1);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setRGB(spots[o + 3], spots[o + 4], spots[o + 5]).offsetHSL(0, 0, (hash(i, spots[o]) - 0.5) * 0.06));
  }
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

/** The water over a chunk (where there is any), with its depth at each corner for the shader. */
function waterGeometry(t: Terrain, z0: number): THREE.BufferGeometry | null {
  const step = WATER_STEP;
  const X1 = SPAN;
  const X0 = -X1;
  const nx = Math.round((X1 - X0) / step);
  const nz = Math.ceil(CHUNK / step);
  const pos: number[] = [];
  const depth: number[] = [];
  const idx: number[] = [];
  let any = false;
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      const x = X0 + i * step;
      const z = z0 - j * step;
      const w = t.water(z);
      const y = w === -Infinity ? -50 : w;
      if (w !== -Infinity) any = true;
      pos.push(x, y, z);
      depth.push(w === -Infinity ? -9 : y - t.height(x, z));
    }
  if (!any) return null;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d = c + 1;
      if (pos[a * 3 + 1] < -40 && pos[d * 3 + 1] < -40) continue;
      if (Math.max(depth[a], depth[b], depth[c], depth[d]) < -1.2) continue; // all dry land
      idx.push(a, d, c, a, b, d);
    }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('depth', new THREE.Float32BufferAttribute(depth, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      ...weather,
      uShallow: { value: new THREE.Color(0x3f8f7a) },
      uDeep: { value: new THREE.Color(0x1f4f4a) },
      uGlow: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.45, 0.8, 0.4).normalize() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWind;
      uniform float uGlow;
      attribute float depth;
      varying float vDepth;
      varying vec3 vWorld;
      varying vec3 vNormal2;
      uniform vec4 uWash[${WASH}];
      // swell rolling downwind, and a cross chop
      float waveH(vec2 p) {
        float a = dot(p, uWindDir);
        float b = dot(p, vec2(-uWindDir.y, uWindDir.x));
        return sin(a * 0.45 - uTime * 1.6) * 0.16 + sin(a * 0.9 + b * 0.5 - uTime * 2.3) * 0.08 + sin(b * 1.3 + uTime * 1.1) * 0.05;
      }
      void main() {
        vDepth = depth;
        vec4 w = modelMatrix * vec4(position, 1.0);
        float amp = (uGlow > 0.0 ? 0.35 : 1.0) * (0.6 + uWind) * smoothstep(-0.2, 1.5, depth);
        float h = waveH(w.xz) * amp;
        float e = 0.3;
        float hx = waveH(w.xz + vec2(e, 0.0)) * amp - h;
        float hz = waveH(w.xz + vec2(0.0, e)) * amp - h;
        vNormal2 = normalize(vec3(-hx / e, 1.0, -hz / e));
        // a ship's wash pushes the water down under it
        for (int i = 0; i < ${WASH}; i++) {
          vec4 k = uWash[i];
          if (k.z <= 0.0) continue;
          float l = length(w.xz - k.xy);
          h -= k.z * 0.35 * (1.0 - smoothstep(0.0, k.w * 0.7, l)) * amp;
        }
        w.y += h;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(w.xyz, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uWindDir;
      uniform float uWind;
      uniform vec3 uShallow;
      uniform vec3 uDeep;
      uniform float uGlow;
      uniform vec3 uSun;
      uniform float uCloud;
      uniform float uCloudDark;
      uniform vec2 uCloudOffset;
      uniform vec4 uWash[${WASH}];
      varying float vDepth;
      varying vec3 vWorld;
      varying vec3 vNormal2;
      ${NOISE_GLSL}
      float cloudShadow(vec3 w) {
        vec2 p = (w.xz + vec2(0.5, 0.42) * (40.0 - w.y) - uCloudOffset) * 0.022;
        return smoothstep(1.0 - uCloud * 0.62, 1.12 - uCloud * 0.62, aFbm(p)) * uCloudDark;
      }
      void main() {
        if (vDepth < -0.1) discard;
        vec2 p = vWorld.xz;
        vec2 flow = uWindDir * uTime * (0.6 + uWind);
        if (uGlow > 0.0) {
          // lava and chemicals: a bright flow with a dark crust breaking up and drifting on it
          // a dark crust, cracked into plates that drift and break up, the glow welling up between
          float crust = aFbm(p * 0.3 + flow * 0.12) * 0.7 + aFbm(p * 1.1 - flow * 0.08) * 0.45;
          float seam = 1.0 - smoothstep(0.0, 0.07, abs(crust - 0.62));
          float plate = smoothstep(0.48, 0.6, crust);
          vec3 hot = uShallow * (0.85 + 0.2 * sin(uTime * 2.0 + p.x * 0.4 + p.y * 0.3));
          vec3 col = mix(hot, uDeep * 0.5 * (0.8 + aNoise(p * 3.0) * 0.4), plate * 0.85);
          col = mix(col, uShallow * 1.6, seam * 0.7);
          float edge = 1.0 - smoothstep(0.0, 0.6, vDepth);
          col = mix(col, uDeep * 0.3, edge * 0.7);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
          return;
        }
        float d = clamp(vDepth / 3.5, 0.0, 1.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 1.0, d));
        // light on the waves: soft bands, and the sun glinting off the crests
        vec3 n = normalize(vNormal2 + vec3((aNoise(p * 1.7 + flow) - 0.5) * 0.25, 0.0, (aNoise(p * 1.9 - flow) - 0.5) * 0.25));
        float lit = dot(n, uSun);
        col *= 0.85 + 0.25 * smoothstep(0.55, 0.95, lit);
        vec3 view = normalize(vec3(0.0, 0.866, 0.5));
        float spec = pow(max(dot(reflect(-uSun, n), view), 0.0), 60.0);
        col += vec3(1.0, 0.97, 0.9) * step(0.5, spec) * 0.8;
        // shallow water: the ground shows through, with caustic light dancing on it
        float caustic = abs(aNoise(p * 1.2 + flow * 0.5) - aNoise(p * 1.25 - flow * 0.4 + 7.0));
        col += uShallow * smoothstep(0.08, 0.0, caustic) * 0.35 * (1.0 - d);
        // foam: at the waterline, a line of surf washing up and back, streaks out on the water
        // how far out from the shore (world units): the depth over how fast it deepens here
        vec2 gd = vec2(dFdx(vDepth) / max(abs(dFdx(vWorld.x)), 1e-3), dFdy(vDepth) / max(abs(dFdy(vWorld.z)), 1e-3));
        float shore = max(vDepth, 0.0) / max(length(gd), 0.12);
        float lap = 0.45 + 0.4 * sin(uTime * 1.4 + dot(p, uWindDir) * 0.25 + aNoise(p * 0.3) * 4.0);
        float foam = 1.0 - smoothstep(lap, lap + 0.35, shore);
        float roll = fract(uTime * 0.22 + aNoise(p * 0.15) * 0.6);
        float surf = (1.0 - smoothstep(0.1, 0.3, abs(shore - roll * 3.5))) * (1.0 - roll) * step(0.0, vDepth);
        float streak = smoothstep(0.8, 0.86, aFbm(p * vec2(0.5, 0.18) + flow * 0.4)) * (0.35 + uWind) * 0.55;
        foam = max(foam * 0.95, max(surf * 0.75, streak * smoothstep(0.5, 1.5, vDepth)));
        // broken up a little, in soft patches rather than speckle
        foam *= smoothstep(0.25, 0.55, aNoise(p * 1.6 + flow * 0.3));
        // under a ship: whipped up in a ring of spray rippling out from it
        for (int i = 0; i < ${WASH}; i++) {
          vec4 k = uWash[i];
          if (k.z <= 0.0) continue;
          float l = length(p - k.xy) / k.w;
          if (l > 1.0) continue;
          float ring = 0.5 + 0.5 * sin(l * 14.0 - uTime * 18.0);
          float churn = smoothstep(0.3, 0.75, aNoise(p * 2.4 + uTime * vec2(3.1, -2.7)));
          foam = max(foam, k.z * (1.0 - l) * mix(churn, ring, 0.5) * 1.3);
        }
        col = mix(col, vec3(0.93, 0.96, 0.97), clamp(foam, 0.0, 1.0));
        col *= 1.0 - cloudShadow(vWorld);
        float alpha = mix(0.45, 0.94, smoothstep(0.0, 2.2, vDepth));
        alpha = max(alpha, foam);
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}
