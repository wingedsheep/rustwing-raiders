import * as THREE from 'three';
import { uploadInstances } from '../render/instances';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Bullet } from '../sim/level';
import { TORPEDO } from '../sim/level';
import type { Faction } from '../sim/factions';
import { FLIGHT_Y, TILT, fromFlight } from '../sim/types';

/**
 * Enemy fire: small models drawn in the view's overlay, over the finished picture, so the paint,
 * the grade, the bloom and the black lift never flatten them (the world is painted; the danger
 * isn't). They carry their own light, the same in every biome, and their own sRGB encoding (the
 * overlay draws straight into the graded picture). What burns is white-hot; around it, soft light
 * that adds (a halo, a tracer, afterimages, an exhaust glow), and under it a near-black plate. Each faction's fire is made of its own stuff, so
 * a bullet still says who fired it:
 *
 *  - scrap:   hot metal. White-hot slugs trailing tracers, iron flak glowing through its plates,
 *             studded naval mines with a lamp.
 *  - lattice: light. Crystal shards that smear along their path, long lances, a turning ring of
 *             force, a crystal mine caged in rings, its heart blinking.
 *  - wild:    spit. Wet teardrops that wobble and drip, polished thorns, egg sacs lit from inside.
 *  - bloom:   spores. Lumpy pods glowing through their folds; seeds trailing down.
 *
 * Torpedoes are their own thing whoever fires them: a gunmetal hull, fins and a nose in the
 * faction's colour, a lamp, and a flame once they've lit. The rook's seekers are crystal darts,
 * square in section, that burn white while they stop to turn.
 *
 * Every shape is a list of parts; each part is one instanced mesh, placed in the bullet's own
 * frame (+z the way it flies, in units of the bullet's body radius).
 */

const MAX = 1500;
const MAX_GLOW = 4000;

/** Shape ids: [orb, needle, big, mine] per faction, then the torpedo and the seeker. */
const FAMILY: Record<Faction, number> = { scrap: 0, lattice: 4, wild: 8, bloom: 12 };
const TORP = 16;
const SEEK = 17;

/** What a part is made of. */
export type Stuff = 'metal' | 'matte' | 'wet' | 'glass' | 'light' | 'haze';

/** What a part needs to know to colour and size itself this frame. */
interface Ctx {
  col: THREE.Color;
  /** Seconds since it was fired. */
  age: number;
  /** 0..1 of its life. */
  life: number;
  seed: number;
  time: number;
  /** A torpedo whose motor has lit. */
  lit: boolean;
  /** A seeker stopped to turn: 0 → 1 through the stop (-1 under way). */
  hold: number;
}

interface PartDef {
  geo: THREE.BufferGeometry;
  stuff: Stuff;
  /** Into the bullet's frame. */
  at?: THREE.Matrix4;
  /** Its colour this frame (linear; past 1 it blooms). */
  color: (x: Ctx, out: THREE.Color) => THREE.Color;
  /** A scale on top of `at` this frame (0 hides it). */
  size?: (x: Ctx) => number;
}

interface ShapeDef {
  parts: PartDef[];
  /** Turns on its own (rad/s): about its length (roll), flat (yaw), or every way (tumble). */
  spin?: [number, 'roll' | 'yaw' | 'tumble'];
  /** Squash and stretch (wet things). */
  wobble?: number;
  /** A soft light about it: radius (in body radii) and strength. */
  halo?: [number, number];
  /** A streak of light behind it: length, width, strength. */
  trail?: [number, number, number];
  /** Afterimages behind it (light that smears). */
  ghosts?: number;
  /** Drawn this much bigger or smaller than its hitbox suggests. */
  scale?: number;
  /** Its shadow plate, bigger or smaller (long thin things, things with down). */
  plate?: number;
}

// ── colours (linear) ─────────────────────────────────────────────────────────────────────────
const WHITE = new THREE.Color(1, 1, 1);
const HOT = new THREE.Color(1, 0.86, 0.55);
const CREAM = new THREE.Color(0.95, 0.9, 0.78);
const SPORE = new THREE.Color(1, 1, 0.75);
const IRON = new THREE.Color(0.07, 0.065, 0.065);
const GUNMETAL = new THREE.Color(0.22, 0.22, 0.23);
const tint = (k: number, white = 0) => (x: Ctx, o: THREE.Color) => o.copy(x.col).lerp(WHITE, white).multiplyScalar(k);
/** Blinks faster as it ripens (mines). */
const blinkOn = (x: Ctx, slow = 2.5, fast = 14) => (x.age * (slow + (fast - slow) * x.life * x.life)) % 1 < 0.5;
/** The egg sac's heartbeat: 0..1, quickening as it ripens. */
const beat = (x: Ctx) => Math.pow(Math.abs(Math.sin(x.age * (3 + 9 * x.life))), 6);

// ── geometry, in body radii, +z forward ──────────────────────────────────────────────────────
export const place = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
/** Copies of a geometry turned to point (+y) along each direction, pushed out by `out`. */
const about = (dirs: THREE.Vector3[], make: () => THREE.BufferGeometry, out: number) =>
  mergeGeometries(
    dirs.map(d => {
      const g = make();
      g.translate(0, out, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
      return g;
    }),
  );
const UP = new THREE.Vector3(0, 1, 0);

export const SPHERE = new THREE.IcosahedronGeometry(1, 3);
export const ROUGH = new THREE.IcosahedronGeometry(1, 1);
export const OCTA = new THREE.OctahedronGeometry(1, 0);

/** A teardrop, round end forward, drawn out into a tail behind. */
const TEAR = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI;
    pts.push(new THREE.Vector2(Math.max(0.75 * Math.sin(a) * (1 - 0.55 * t * t), 0.001), 0.75 * Math.cos(a) - 0.68 * t * t));
  }
  return new THREE.LatheGeometry(pts, 20).rotateX(Math.PI / 2);
})();

/** The twelve corners of an icosahedron, for things that stick out all round. */
const CORNERS = (() => {
  const p = new THREE.IcosahedronGeometry(1, 0).getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    if (!out.some(o => o.distanceTo(v) < 1e-3)) out.push(v);
  }
  return out;
})();

/** Flak: a dodecahedron of iron plate with spikes; the glowing ball inside shows through each plate. */
const FLAK = mergeGeometries([
  new THREE.DodecahedronGeometry(0.8, 0).deleteAttribute('uv'),
  about(CORNERS, () => new THREE.ConeGeometry(0.16, 0.5, 5).deleteAttribute('uv').toNonIndexed(), 0.85),
]);
const STUDS = about(
  [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  () => new THREE.CylinderGeometry(0.1, 0.15, 0.35, 8),
  0.78,
);

/** A lattice mine's cage: two rings of force, crossed square. */
const GIMBAL = mergeGeometries([new THREE.TorusGeometry(0.92, 0.07, 6, 24), new THREE.TorusGeometry(0.92, 0.07, 6, 24).rotateY(Math.PI / 2)]);

/** A lumpy pod: deep folds between soft lumps, so a light inside shows through the folds. */
function pod(lumps: number, depth: number, sharp: number) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n =
      Math.sin(v.x * lumps + 1.3) * Math.sin(v.y * lumps + 0.4) * Math.sin(v.z * lumps + 2.1) * 0.6 +
      Math.sin(v.x * lumps * 2.3 + 0.7) * Math.sin(v.z * lumps * 2.1 + 1.9) * 0.4;
    const bump = Math.sign(n) * Math.pow(Math.abs(n), 1 / sharp);
    v.multiplyScalar(1 - depth + depth * (0.5 + 0.5 * bump));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A seed's down: three fine hairs fanning back from its tail, each with a tuft. */
const fan = (make: (k: number) => THREE.BufferGeometry) => mergeGeometries([-1, 0, 1].map(k => make(k).rotateY(Math.PI + k * 0.42).translate(0, 0, -0.6)));
const DOWN = fan(() => new THREE.CylinderGeometry(0.035, 0.035, 1.3, 4).rotateX(Math.PI / 2).translate(0, 0, 0.65));
const TUFTS = fan(() => new THREE.IcosahedronGeometry(0.22, 1).translate(0, 0, 1.3));

// a missile: slender, an ogive nose, swept fins at the tail, all along +z, the nozzle at -0.95
export const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg).rotateX(Math.PI / 2);
export const HULL = lathe(
  ([[0.001, -0.95], [0.15, -0.95], [0.19, -0.88], [0.2, -0.8], [0.2, 0.75]] as [number, number][]).concat(
    // the ogive: a tangent curve from the body's radius down to the tip
    Array.from({ length: 8 }, (_, i) => {
      const t = (i + 1) / 8;
      return [Math.max(0.2 * Math.sqrt(1 - t * t), 0.001), 0.75 + 0.6 * t] as [number, number];
    }),
  ),
);
// the warhead's paint: two thin rings rather than one broad stripe
const BAND = mergeGeometries([0.5, 0.66].map(z => new THREE.CylinderGeometry(0.205, 0.205, 0.05, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, z)));
// the seeker's eye in the nose
const SEEKER = lathe([[0.001, 1.12], [0.14, 1.12], [0.135, 1.22], [0.1, 1.32], [0.05, 1.38], [0.001, 1.4]]);
const fins = (shape: [number, number][], n = 4) => {
  const s = new THREE.Shape(shape.map(([z, y]) => new THREE.Vector2(z, y)));
  return mergeGeometries(
    Array.from({ length: n }, (_, i) =>
      new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false }).deleteAttribute('uv').translate(0, 0, -0.0125).rotateY(-Math.PI / 2).rotateZ((i * Math.PI * 2) / n + Math.PI / 4),
    ),
  );
};
export const FINS = mergeGeometries([
  fins([[-0.92, 0.18], [-0.92, 0.46], [-0.8, 0.46], [-0.5, 0.18]]),
  fins([[0.3, 0.18], [0.36, 0.3], [0.44, 0.3], [0.5, 0.18]]),
]);
export const NOZZLE = new THREE.CylinderGeometry(0.13, 0.16, 0.12, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1.0);
// the exhaust: a white-hot core in a longer, softer cone of flame
export const FLAME_CORE = new THREE.ConeGeometry(0.09, 0.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.36);
export const FLAME = new THREE.ConeGeometry(0.15, 1.5, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.8);

// ── the shapes, in the order of FAMILY ───────────────────────────────────────────────────────
// a scrap round's jacket: an iron sleeve, open at the front, a rim round its base
const JACKET = lathe([[0.001, -0.62], [0.36, -0.62], [0.42, -0.56], [0.42, -0.46], [0.39, -0.42], [0.39, 0.0], [0.36, 0.02]], 14);
const slug = (needle: boolean): ShapeDef => ({
  parts: [
    // a hot slug in an iron jacket: the faction's colour glowing out of the front, white at the tip
    // (fat enough to show over its jacket from above: the colour is what you see first)
    { geo: SPHERE, stuff: 'light', at: needle ? place(0, 0, 0.3, 0.4, 0.4, 0.85) : place(0, 0, 0.12, 0.54, 0.54, 0.7), color: (x, o) => o.copy(x.col).multiplyScalar(1.15) },
    { geo: SPHERE, stuff: 'light', at: needle ? place(0, 0, 0.75, 0.17, 0.17, 0.35) : place(0, 0, 0.5, 0.24, 0.24, 0.3), color: (_, o) => o.copy(HOT).lerp(WHITE, 0.6).multiplyScalar(3) },
    { geo: JACKET, stuff: 'metal', at: needle ? place(0, 0, 0, 0.7, 0.7, 1.3) : place(0, 0, -0.05, 1, 1, 0.9), color: (x, o) => o.copy(GUNMETAL).lerp(x.col, 0.08) },
  ],
  spin: [6, 'roll'],
  halo: needle ? [1.3, 0.3] : [1.4, 0.35],
  // small rounds, kept close to their hitbox, with short tracers
  trail: needle ? [2.6, 0.35, 0.7] : [2.6, 0.45, 0.75],
  scale: needle ? 0.62 : 0.6,
});
const shard = (lance: boolean): ShapeDef => ({
  parts: [
    // crystal, its heart white
    { geo: OCTA, stuff: 'light', at: lance ? place(0, 0, 0, 0.16, 0.14, 1.2) : place(0, 0, 0, 0.28, 0.22, 0.7), color: (_, o) => o.copy(WHITE).multiplyScalar(3) },
    { geo: OCTA, stuff: 'glass', at: lance ? place(0, 0, 0, 0.36, 0.3, 1.6) : place(0, 0, 0, 0.62, 0.45, 1.05), color: tint(1.4, 0.1) },
  ],
  spin: [4, 'roll'],
  halo: [1.7, 0.35],
  trail: lance ? [3.4, 0.35, 0.5] : [2.6, 0.5, 0.45],
  ghosts: 2,
});
const spores = (body: THREE.BufferGeometry, size: number, light: PartDef['color'], spin: ShapeDef['spin'], inner = 0.86): ShapeDef => ({
  parts: [
    { geo: ROUGH, stuff: 'light', at: place(0, 0, 0, size * inner), color: light },
    { geo: body, stuff: 'matte', at: place(0, 0, 0, size), color: tint(1.3, 0.1) },
  ],
  spin,
  halo: [2.0, 0.35],
});
/** The seeker's collar: a square ring (a torus of four sides), corners on the dart's own. */
const COLLAR = new THREE.TorusGeometry(0.62, 0.07, 4, 4);
const sporeLight = (k: number) => (x: Ctx, o: THREE.Color) => o.copy(x.col).lerp(SPORE, 0.4).multiplyScalar(k);

const SHAPES: ShapeDef[] = [
  // scrap
  slug(false),
  slug(true),
  {
    // flak: iron plate, red-hot inside
    parts: [
      { geo: FLAK, stuff: 'metal', color: (x, o) => o.copy(IRON).lerp(x.col, 0.3) },
      { geo: ROUGH, stuff: 'light', at: place(0, 0, 0, 0.68), color: (x, o) => o.copy(x.col).lerp(HOT, 0.4).multiplyScalar(2 + 0.5 * Math.sin(x.time * 20 + x.seed * 9)) },
    ],
    spin: [3, 'tumble'],
    halo: [1.9, 0.35],
  },
  {
    // a naval mine: studded iron, and a lamp that blinks faster as it ripens
    parts: [
      { geo: SPHERE, stuff: 'metal', at: place(0, 0, 0, 0.72), color: (x, o) => o.copy(IRON).lerp(x.col, 0.35) },
      { geo: STUDS, stuff: 'metal', color: (_, o) => o.copy(GUNMETAL) },
      { geo: SPHERE, stuff: 'light', at: place(0, 0.68, 0, 0.2), color: (x, o) => (blinkOn(x) ? o.copy(x.col).lerp(WHITE, 0.4).multiplyScalar(3) : o.copy(x.col).multiplyScalar(0.25)) },
    ],
    spin: [0.8, 'yaw'],
    halo: [1.8, 0.3],
  },
  // lattice
  shard(false),
  shard(true),
  {
    // a ring of force, turning flat, a spark at its heart
    parts: [
      { geo: new THREE.TorusGeometry(0.72, 0.12, 6, 6).rotateX(Math.PI / 2), stuff: 'light', color: tint(2.2, 0.15) },
      { geo: new THREE.CylinderGeometry(0.75, 0.75, 0.06, 6), stuff: 'haze', color: tint(0.5) },
      { geo: OCTA, stuff: 'light', at: place(0, 0, 0, 0.22), color: (_, o) => o.copy(WHITE).multiplyScalar(3) },
    ],
    spin: [1.6, 'yaw'],
    halo: [1.8, 0.4],
  },
  {
    // a mine of light: a long crystal, point to point, caged in two crossed rings of force, tumbling;
    // its heart blinking faster as it ripens
    parts: [
      { geo: OCTA, stuff: 'light', at: place(0, 0, 0, 0.3, 0.42, 0.3), color: (x, o) => (blinkOn(x) ? o.copy(WHITE).multiplyScalar(3) : o.copy(x.col).multiplyScalar(1.2)) },
      { geo: OCTA, stuff: 'glass', at: place(0, 0, 0, 0.62, 1.05, 0.62), color: tint(1.4, 0.15) },
      { geo: GIMBAL, stuff: 'light', color: tint(2, 0.2) },
    ],
    spin: [1.8, 'tumble'],
    halo: [1.8, 0.3],
  },
  // wild
  {
    // spit, dripping
    parts: [
      { geo: TEAR, stuff: 'wet', color: tint(1.3, 0.1) },
      { geo: SPHERE, stuff: 'wet', at: place(0.1, 0, -1.85, 0.22), color: tint(1.25, 0.1), size: x => 0.8 + 0.2 * Math.sin(x.time * 9 + x.seed * 5) },
      { geo: SPHERE, stuff: 'wet', at: place(-0.12, 0, -2.5, 0.14), color: tint(1.2, 0.1), size: x => 0.8 + 0.2 * Math.sin(x.time * 9 + x.seed * 5 + 2) },
    ],
    wobble: 0.08,
    halo: [1.6, 0.3],
  },
  {
    // a thorn, tip first, polished
    parts: [{ geo: new THREE.ConeGeometry(0.42, 1.95, 10).rotateX(Math.PI / 2), stuff: 'wet', color: (x, o) => o.copy(x.col).lerp(CREAM, 0.35).multiplyScalar(1.3) }],
    spin: [5, 'roll'],
    halo: [1.5, 0.3],
  },
  {
    // a big glob, breathing
    parts: [{ geo: SPHERE, stuff: 'wet', at: place(0, 0, 0, 0.86, 0.8, 0.9), color: tint(1.3, 0.1) }],
    wobble: 0.1,
    halo: [1.7, 0.3],
  },
  {
    // an egg sac: a membrane you can see into, something glowing inside, a heartbeat that quickens
    parts: [
      { geo: SPHERE, stuff: 'light', at: place(0, 0, 0, 0.35), color: (x, o) => o.copy(x.col).lerp(WHITE, 0.3).multiplyScalar(1.5 + 2 * beat(x)), size: x => 0.8 + 0.5 * beat(x) },
      { geo: SPHERE, stuff: 'glass', at: place(0, 0, 0, 0.74, 0.74, 0.86), color: tint(1.2, 0.1), size: x => 1 + 0.06 * beat(x) },
    ],
    halo: [1.5, 0.25],
  },
  // bloom
  spores(pod(3.2, 0.3, 1.2), 0.8, sporeLight(2), [1.6, 'tumble']),
  {
    // a seed, trailing its down
    parts: [
      { geo: SPHERE, stuff: 'matte', at: place(0, 0, 0, 0.42, 0.42, 0.8), color: tint(1.3, 0.15) },
      { geo: DOWN, stuff: 'matte', color: (_, o) => o.copy(CREAM) },
      { geo: TUFTS, stuff: 'haze', color: (_, o) => o.copy(CREAM).multiplyScalar(0.9) },
    ],
    halo: [1.3, 0.25],
  },
  spores(pod(4.2, 0.28, 1.2), 0.88, sporeLight(1.8), [0.8, 'tumble']),
  // a spore mine: spiky, its light blinking faster as it ripens
  spores(pod(3.5, 0.45, 0.45), 0.82, (x, o) => (blinkOn(x, 2, 12) ? sporeLight(3)(x, o) : o.copy(x.col).multiplyScalar(0.5)), [1, 'yaw'], 0.66),
  {
    // the torpedo
    parts: [
      { geo: HULL, stuff: 'metal', color: (_, o) => o.copy(GUNMETAL) },
      { geo: BAND, stuff: 'matte', color: tint(0.9) },
      { geo: FINS, stuff: 'metal', color: (_, o) => o.copy(GUNMETAL).multiplyScalar(0.7) },
      { geo: NOZZLE, stuff: 'metal', color: (_, o) => o.copy(IRON) },
      // the seeker, glowing harder once it has you
      { geo: SEEKER, stuff: 'light', color: (x, o) => o.copy(x.col).lerp(WHITE, 0.35).multiplyScalar(x.lit ? 2.6 + 0.8 * Math.sin(x.time * 18 + x.seed * 9) : 1.2) },
      // a nav light on the tail fin, blinking
      { geo: SPHERE, stuff: 'light', at: place(0.3, 0.3, -0.85, 0.035), color: (x, o) => ((x.age * (x.lit ? 3 : 6)) % 1 < 0.25 ? o.copy(x.col).lerp(WHITE, 0.5).multiplyScalar(4) : o.setRGB(0, 0, 0)) },
      { geo: FLAME_CORE, stuff: 'haze', color: (_, o) => o.copy(HOT).lerp(WHITE, 0.6).multiplyScalar(2.5), size: x => (x.lit ? 0.9 + 0.15 * Math.sin(x.time * 60 + x.seed * 11) : 0) },
      { geo: FLAME, stuff: 'haze', color: (x, o) => o.copy(HOT).lerp(x.col, 0.25).multiplyScalar(1.1), size: x => (x.lit ? 0.8 + 0.3 * Math.sin(x.time * 47 + x.seed * 7) : 0) },
    ],
  },
  {
    // the seeker: a crystal dart, square in section, a square collar of light at its waist. Stopped
    // to turn it burns white, its collar blinking quicker and opening out until it goes
    parts: [
      { geo: OCTA, stuff: 'light', at: place(0, 0, 0.15, 0.2, 0.2, 0.9), color: (x, o) => o.copy(WHITE).multiplyScalar(x.hold >= 0 ? 3 + 2 * x.hold : 2.6) },
      { geo: OCTA, stuff: 'glass', at: place(0, 0, 0.1, 0.5, 0.5, 1.45), color: (x, o) => o.copy(x.col).lerp(WHITE, x.hold >= 0 ? 0.3 + 0.5 * x.hold : 0.1).multiplyScalar(1.4) },
      {
        geo: COLLAR,
        stuff: 'light',
        at: place(0, 0, -0.35),
        color: (x, o) => (x.hold >= 0 && (x.age * (6 + 14 * x.hold)) % 1 < 0.5 ? o.copy(WHITE).multiplyScalar(3) : o.copy(x.col).lerp(WHITE, 0.2).multiplyScalar(2)),
        size: x => (x.hold >= 0 ? 1 + 0.45 * x.hold : 1),
      },
    ],
    halo: [1.8, 0.4],
    trail: [3, 0.4, 0.55],
    ghosts: 3,
    scale: 1.25,
  },
];

// ── materials ────────────────────────────────────────────────────────────────────────────────
export function material(stuff: Stuff): THREE.Material {
  switch (stuff) {
    case 'metal':
      return new THREE.MeshStandardMaterial({ metalness: 0.45, roughness: 0.35 });
    case 'matte':
      return new THREE.MeshStandardMaterial({ metalness: 0, roughness: 0.85 });
    case 'wet':
      return new THREE.MeshPhongMaterial({ specular: 0x777777, shininess: 70 });
    case 'glass':
      return new THREE.MeshPhongMaterial({ specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.6, depthWrite: false });
    case 'light':
      return new THREE.MeshBasicMaterial();
    case 'haze':
      return new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  }
}

/** A soft disc of light: bright in the middle, gone at the rim. */
export const SOFT = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
})();

/** A shadow plate: dark and solid out to most of its radius, then a quick soft edge. */
const PLATE = (() => {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(c);
})();

/** A tracer: a hot head at the top (the way it flies), thinning and fading down into a tail. */
export const STREAK = (() => {
  const w = 32;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    // a short soft rise at the very front, then a long fall to nothing
    const along = Math.min(1, t / 0.06) * Math.pow(1 - t, 1.6);
    // narrower towards the tail
    const half = 0.5 - 0.3 * t;
    for (let x = 0; x < w; x++) {
      const u = Math.abs((x + 0.5) / w - 0.5) / half;
      const a = along * Math.exp(-u * u * 3.2) * (u < 1 ? 1 : 0);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
})();

export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, order: number) {
  // shots are never lost under a bridge or a crown of leaves: whatever's over them, they show
  mat.depthTest = false;
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.count = 0;
  m.renderOrder = order;
  return m;
}

/**
 * Into the overlay: the material's colour encoded to sRGB, as the graded picture it draws over is.
 * Past white it's scaled back, not clipped, so a hot colour stays its hue instead of going pastel.
 */
function graded(mat: THREE.Material) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <colorspace_fragment>',
      '#include <colorspace_fragment>\n\tgl_FragColor.rgb /= max(1.0, max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b)));\n\tgl_FragColor = sRGBTransferOETF(gl_FragColor);',
    );
  };
  mat.customProgramCacheKey = () => 'graded';
  return mat;
}

export class BulletArt {
  readonly group = new THREE.Group();
  /** Per shape, per part: its mesh. */
  private meshes: THREE.InstancedMesh[][];
  /** Halos, afterimages: soft light facing the camera. */
  private glow: THREE.InstancedMesh;
  /** Tracers and exhaust: the same, but tapering to a tail. */
  private streaks: THREE.InstancedMesh;
  /** A dark shadow behind each bullet, so it stands off bright ground as well as dark. */
  private backing: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private base = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private c = new THREE.Color();
  private x: Ctx = { col: new THREE.Color(), age: 0, life: 0, seed: 0, time: 0, lit: false, hold: -1 };

  constructor() {
    const mats = new Map<Stuff, THREE.Material>();
    this.meshes = SHAPES.map(sh =>
      sh.parts.map(def => {
        if (!mats.has(def.stuff)) {
          // (all drawn in the transparent pass, so the order holds: the dark plate first, the
          // body over it; an opaque body would go down first and the plate would bury it)
          const m = graded(material(def.stuff));
          m.transparent = true;
          mats.set(def.stuff, m);
        }
        // see-through things after the solid ones
        const mesh = instanced(def.geo, mats.get(def.stuff)!, MAX, def.stuff === 'glass' || def.stuff === 'haze' ? 27 : 26);
        this.group.add(mesh);
        return mesh;
      }),
    );
    // their own light: a white key from the upper left and a fill, whatever the biome's sky
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(-0.6, 1, 0.5);
    this.group.add(key, new THREE.HemisphereLight(0xffffff, 0x50485a, 2.2));
    const soft = graded(new THREE.MeshBasicMaterial({ map: SOFT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    // halos go down first, the shadow plate over them and the bullet over that: a dark rim, light beyond
    this.glow = instanced(new THREE.PlaneGeometry(1, 1), soft, MAX_GLOW, 24);
    this.streaks = instanced(new THREE.PlaneGeometry(1, 1), graded(new THREE.MeshBasicMaterial({ map: STREAK, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), MAX_GLOW, 28);
    this.backing = instanced(new THREE.PlaneGeometry(1, 1), graded(new THREE.MeshBasicMaterial({ map: PLATE, transparent: true, depthWrite: false, opacity: 0.8 })), MAX, 25);
    this.group.add(this.glow, this.streaks, this.backing);
  }

  update(time: number, bullets: Bullet[], cam: THREE.Quaternion) {
    for (const ms of this.meshes) for (const m of ms) m.count = 0;
    this.glow.count = this.streaks.count = this.backing.count = 0;
    const x = this.x;
    x.time = time;
    for (let i = 0; i < Math.min(bullets.length, MAX); i++) {
      const b = bullets[i];
      const id = shapeOf(b);
      const sh = SHAPES[id];
      // (a torpedo is drawn slimmer than its hitbox: it's a long thing, not a round one)
      const big = b.kind === 'big' ? 2.2 : b.kind === 'mine' ? 1.6 : 1;
      // a seeker stopped to turn
      const hold = b.leg && b.leg.halt > 0 ? clamp01(1 - b.leg.halt / b.leg.hold) : -1;
      // fired: it swells out of the muzzle, white (and a seeker again as it stops)
      const punch = Math.max(0, 1 - b.t / 0.08, hold >= 0 ? 1 - hold / 0.2 : 0);
      // the body's radius: a little more than the hitbox, as it always was
      const r = b.r * 2 * big * (sh.scale ?? 1) * (1 + 0.4 * punch);
      vivid(x.col.setHex(b.color));
      x.age = b.t;
      x.life = Math.min(1, b.t / b.life);
      x.seed = b.seed;
      x.lit = b.kind === 'torpedo' && b.t >= TORPEDO.launch;
      x.hold = hold;

      // its frame: +z the way it flies (a stopped seeker: the way it'll go), then its own turning
      const heading = hold >= 0 ? Math.atan2(b.leg!.dx, b.leg!.dz) : Math.atan2(b.vx, b.vz);
      this.q.setFromAxisAngle(Y, heading);
      if (sh.spin) {
        const [rate, how] = sh.spin;
        const a = b.seed * 6.28 + b.t * rate;
        const axis = how === 'roll' ? Z : how === 'yaw' ? Y : this.axis.set(Math.sin(b.seed * 40), Math.cos(b.seed * 40), 0.6).normalize();
        this.q.multiply(this.q2.setFromAxisAngle(axis, a));
      }
      const w = sh.wobble ? Math.sin(time * 13 + b.seed * 6.28) * sh.wobble : 0;
      this.base.compose(this.v.set(b.x, BULLET_Y, fromFlight(b.z, BULLET_Y)), this.q, this.s.set(r * (1 + w), r * (1 - w), r * (1 - w * 0.5)));

      sh.parts.forEach((def, j) => {
        const sz = def.size ? def.size(x) : 1;
        if (sz <= 0) return;
        const mesh = this.meshes[id][j];
        this.m.copy(this.base);
        if (def.at) this.m.multiply(def.at);
        if (sz !== 1) this.m.scale(this.s.setScalar(sz));
        mesh.setMatrixAt(mesh.count, this.m);
        mesh.setColorAt(mesh.count, def.color(x, this.c).lerp(WHITE, punch * 0.7));
        mesh.count++;
      });

      // a dark shadow behind it first, then the light about it
      this.sprite(b.x, b.z, r * 3 * (sh.plate ?? 1), r * 3 * (sh.plate ?? 1), BACKING, cam, heading, this.backing);
      const dx = Math.sin(heading);
      const dz = Math.cos(heading);
      if (sh.halo) {
        // always reaching past the shadow plate, so there's a ring of colour outside the dark one
        const d = r * Math.max(sh.halo[0], 2.1) * 2;
        this.sprite(b.x, b.z, d, d, this.c.copy(x.col).multiplyScalar(Math.max(sh.halo[1], 0.4) + punch * 0.8), cam, heading);
      }
      if (sh.trail && hold < 0) {
        const [len, wid, str] = sh.trail;
        const f = str * (0.85 + 0.15 * Math.sin(time * 41 + b.seed * 17));
        const back = r * len * 0.5;
        this.sprite(b.x - dx * back, b.z - dz * back, r * wid * 2, r * len * 1.1, this.c.copy(x.col).lerp(HOT, 0.4).multiplyScalar(f * 1.3), cam, heading, this.streaks);
        this.sprite(b.x - dx * back * 0.6, b.z - dz * back * 0.6, r * wid * 0.8, r * len * 0.7, this.c.copy(HOT).lerp(WHITE, 0.5).multiplyScalar(f * 1.1), cam, heading, this.streaks);
      }
      for (let g = 1; g <= (hold < 0 ? sh.ghosts ?? 0 : 0); g++) {
        const back = r * 1.4 * g;
        const s = r * (1.3 - 0.2 * g);
        this.sprite(b.x - dx * back, b.z - dz * back, s, s * 2.4, this.c.copy(x.col).multiplyScalar(0.5 / g), cam, heading);
      }
      if (x.lit) {
        // the exhaust lights the air behind it
        const back = r * 2.3;
        this.sprite(b.x - dx * back, b.z - dz * back, r * 0.9, r * 3.4, this.c.copy(HOT).multiplyScalar(1.1), cam, heading, this.streaks);
      }
    }
    for (const ms of this.meshes)
      for (const m of ms) uploadInstances(m);
    for (const g of [this.glow, this.streaks, this.backing]) uploadInstances(g);
  }

  /** A soft light facing the camera, `len` long along the heading as the camera sees it, `wid` across. */
  private sprite(x: number, z: number, wid: number, len: number, color: THREE.Color, cam: THREE.Quaternion, heading: number, into = this.glow) {
    const n = into.count;
    if (n >= MAX_GLOW) return;
    this.q2.copy(cam).multiply(this.q.setFromAxisAngle(Z, Math.atan2(-Math.sin(heading), -Math.cos(heading) * COS_TILT)));
    this.m.compose(this.v.set(x, BULLET_Y, fromFlight(z, BULLET_Y)), this.q2, this.s.set(wid, len, 1));
    into.setMatrixAt(n, this.m);
    into.setColorAt(n, color);
    into.count++;
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const COS_TILT = Math.cos(TILT);
/** Bullets ride a little over the ships (drawn on top), pushed back so they show where they are on the flight plane. */
const BULLET_Y = FLIGHT_Y + 1;
const BACKING = new THREE.Color(0.02, 0.015, 0.035);
const hsl = { h: 0, s: 0, l: 0 };

/**
 * An enemy's accent can be dark or dull; its fire never is: lifted to a deep, saturated colour
 * (in linear light: lighter than this goes pastel once it's encoded for the screen).
 */
function vivid(c: THREE.Color) {
  // (the hue as the eye sees it, then the depth in linear light)
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(ownHue(hsl.h), hsl.s, hsl.l, THREE.SRGBColorSpace);
  c.getHSL(hsl);
  return c.setHSL(hsl.h, Math.max(hsl.s, 0.88), Math.min(Math.max(hsl.l, 0.45), 0.58));
}

/**
 * Rust, orange and gold are the player's (their ship, their slugs, their engine): an enemy's
 * accent in that band fires flare red below its middle and acid yellow above it. Every other hue
 * is the foe's own.
 */
function ownHue(h: number) {
  if (h < 12 / 360 || h > 52 / 360) return h;
  return h < 30 / 360 ? 355 / 360 : 60 / 360;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function shapeOf(b: Bullet) {
  if (b.kind === 'torpedo') return TORP;
  if (b.kind === 'seeker') return SEEK;
  if (b.kind === 'spore') return FAMILY.bloom;
  const k = b.kind === 'needle' ? 1 : b.kind === 'big' ? 2 : b.kind === 'mine' ? 3 : 0;
  return FAMILY[b.look] + k;
}
