import * as THREE from 'three';

/** How many ships can blow on the land at once. */
export const WASH = 6;
/** How many things can be seen through what's over them (see uSee): the ships, then the nearest foes. */
export const SEE = 12;

/**
 * The camera is orthographic: a thing high up would look no bigger, and slide by no faster, than
 * the land. So whatever stands over the flight line is drawn as a camera this far above the flight
 * plane would see it: the higher, the bigger and the further out from the middle of the screen,
 * sliding by faster. At the flight line and below, nothing moves, so what you hit is where it shows.
 */
export const DEPTH = 60;

/** How much bigger (and further out from the middle) a thing at height `y` shows. */
export function depthScale(y: number) {
  const d = y - 10;
  const e = d <= -2 ? 0 : d < 2 ? ((d + 2) * (d + 2)) / 8 : d;
  return DEPTH / (DEPTH - Math.min(e, DEPTH * 0.6));
}

/**
 * What makes a planet feel alive, shared by every shader that wants it: one clock, one wind (a
 * direction, a strength, gusts rolling through), and clouds drifting overhead whose shadows slide
 * over everything below. The level view sets these each frame from the biome; materials read them.
 */
export const weather = {
  uTime: { value: 0 },
  /** Which way it blows, on the ground (x, z), unit length. */
  uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  /** 0 still … 1 a gale. */
  uWind: { value: 0.4 },
  /** How much of the sky is cloud (0 clear … 1 overcast), for the shadows. */
  uCloud: { value: 0.45 },
  /** How dark a cloud's shadow is. */
  uCloudDark: { value: 0.3 },
  /** How far the clouds have drifted (world units, x z): they move with the wind. */
  uCloudOffset: { value: new THREE.Vector2() },
  /** Painterly grain on surfaces (0 off). */
  uGrain: { value: 1 },
  /**
   * Ships' wash on what's below them (x, z, strength 0..1, radius): grass and trees blown flat
   * and away, the water pushed down and whipped to foam. Strength 0 is a free slot.
   */
  uWash: { value: Array.from({ length: WASH }, () => new THREE.Vector4()) },
  /**
   * Where the ships are (x, z on the flight plane, radius, strength 0..1): anything over the flight
   * line between them and the camera thins away there in a dither, so a ship under a bridge or a
   * crown of rock is never lost. Strength 0 is a free slot.
   */
  uSee: { value: Array.from({ length: SEE }, () => new THREE.Vector4()) },
  /** The middle of the screen on the flight plane (x, z), for the depth (see DEPTH). */
  uView: { value: new THREE.Vector2() },
  /**
   * Where the ships are (x, z on the flight plane, strength 0..1 in w; 0 a free slot): what glows
   * below them brightens as they go over, and fades back slowly behind them, a wave of light
   * following each ship down the land (see uPassGlow).
   */
  uPass: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  /** How much the land's glows answer a ship going over (0 not at all: the biome says). */
  uPassGlow: { value: 0 },
  /** The clock again, for the fragment side (the pass's ripple). */
  uPassClock: { value: 0 },
};

/** Steps the clock and the clouds along. */
export function tickWeather(dt: number) {
  weather.uTime.value += dt;
  weather.uPassClock.value = weather.uTime.value;
  const w = weather.uWindDir.value;
  const s = 1.5 + weather.uWind.value * 4;
  weather.uCloudOffset.value.x += w.x * s * dt;
  weather.uCloudOffset.value.y += w.y * s * dt;
}

/** GLSL: value noise and fbm, and the cloud shadow at a world point. */
export const NOISE_GLSL = /* glsl */ `
  float aHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float aNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), u.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float aFbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * aNoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }
`;

const CLOUD_GLSL = /* glsl */ `
  uniform float uCloud;
  uniform float uCloudDark;
  uniform vec2 uCloudOffset;
  uniform float uGrain;
  // the cloud layer's shadow on a point: followed up the sun's ray to where it meets the clouds
  float cloudShadow(vec3 w) {
    vec2 p = (w.xz + vec2(0.5, 0.42) * (40.0 - w.y) - uCloudOffset) * 0.022;
    float c = aFbm(p);
    return smoothstep(1.0 - uCloud * 0.62, 1.12 - uCloud * 0.62, c) * uCloudDark;
  }
`;

// (the flight line's height and the camera's lean, as in sim/types.ts)
const PASS_GLSL = /* glsl */ `
  uniform vec4 uPass[2];
  uniform float uPassGlow;
  uniform float uPassClock;
  // 0 … 1: how lit up a glowing point on the land is by the ships going over it: a little ahead
  // of each, most just behind, fading back down the screen behind it, a ripple running back
  float passGlow(vec3 w) {
    if (uPassGlow <= 0.0 || w.y > 9.0) return 0.0;
    // slid along the camera's line of sight onto the flight plane: where it shows under the ship
    float zf = w.z + (10.0 - w.y) * 0.57735;
    float g = 0.0;
    for (int i = 0; i < 2; i++) {
      vec4 k = uPass[i];
      if (k.w <= 0.0) continue;
      float dx = w.x - k.x;
      float dz = zf - k.y;
      float side = exp(-dx * dx / 1800.0);
      float along = dz < 0.0 ? smoothstep(-10.0, 0.0, dz) : exp(-dz / 22.0);
      g = max(g, k.w * side * along);
    }
    return uPassGlow * g * (0.8 + 0.2 * sin(uPassClock * 5.0 - zf * 0.5));
  }
`;

const SEE_GLSL = /* glsl */ `
  uniform vec4 uSee[${SEE}];
  // 0 … 1: how far to thin out a point over the flight line, for whatever is under it on screen
  float seeThrough(vec3 w) {
    if (w.y < 11.0) return 0.0;
    // slid down the camera's line of sight onto the flight plane
    float zf = w.z + (10.0 - w.y) * 0.57735;
    float a = 0.0;
    for (int i = 0; i < ${SEE}; i++) {
      vec4 k = uSee[i];
      if (k.w <= 0.0) continue;
      float d = length(vec2(w.x - k.x, zf - k.y));
      a = max(a, k.w * (1.0 - smoothstep(k.z * 0.45, k.z, d)));
    }
    return a * smoothstep(11.0, 12.5, w.y);
  }
  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    // the 4×4 ordered-dither matrix, row by row
    return (i < 1.0 ? 0.0 : i < 2.0 ? 8.0 : i < 3.0 ? 2.0 : i < 4.0 ? 10.0 : i < 5.0 ? 12.0 : i < 6.0 ? 4.0 : i < 7.0 ? 14.0 : i < 8.0 ? 6.0
      : i < 9.0 ? 3.0 : i < 10.0 ? 11.0 : i < 11.0 ? 1.0 : i < 12.0 ? 9.0 : i < 13.0 ? 15.0 : i < 14.0 ? 7.0 : i < 15.0 ? 13.0 : 5.0) / 16.0 + 1.0 / 32.0;
  }
`;

// (the flight line's height and the camera's lean, as in sim/types.ts; DEPTH as above)
const DEPTH_GLSL = /* glsl */ `
  uniform vec2 uView;
  // where a world point over the flight line shows, as a camera DEPTH above the flight plane sees it
  vec3 depthOff(vec3 w) {
    float d = w.y - 10.0;
    float e = d <= -2.0 ? 0.0 : d < 2.0 ? (d + 2.0) * (d + 2.0) / 8.0 : d;
    float s = ${DEPTH.toFixed(1)} / (${DEPTH.toFixed(1)} - min(e, ${(DEPTH * 0.6).toFixed(1)})) - 1.0;
    float zf = w.z + (10.0 - w.y) * 0.57735;
    return vec3((w.x - uView.x) * s, 0.0, (zf - uView.y) * s);
  }
`;

const SWAY_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec2 uWindDir;
  uniform float uWind;
  uniform vec4 uWash[${WASH}];
  attribute float aSway;
  // a plant's top swings downwind and back, gusts rolling across the land, leaves shivering; and
  // under a ship going over, it's blown flat and away from it
  vec3 sway(vec3 w) {
    vec3 wash = vec3(0.0);
    for (int i = 0; i < ${WASH}; i++) {
      vec4 k = uWash[i];
      if (k.z <= 0.0) continue;
      vec2 d = w.xz - k.xy;
      float l = length(d);
      float f = k.z * (1.0 - smoothstep(k.w * 0.25, k.w, l));
      wash += vec3(d.x / max(l, 0.4) * 1.6, -0.5, d.y / max(l, 0.4) * 1.6) * f;
    }
    float phase = dot(w.xz, vec2(0.21, 0.17));
    float gust = 0.6 + 0.4 * sin(uTime * 0.7 - dot(w.xz, uWindDir) * 0.08);
    float swing = sin(uTime * 1.9 + phase) * 0.55 + sin(uTime * 3.3 + phase * 1.7) * 0.25;
    float lean = (0.35 + swing) * gust * (0.3 + uWind);
    float shiver = sin(uTime * 13.0 + w.x * 3.1 + w.y * 5.7 + w.z * 2.3) * 0.04 * (0.2 + uWind);
    vec2 d = uWindDir * lean * aSway;
    return vec3(d.x + shiver * aSway, -abs(lean) * aSway * aSway * 0.12, d.y + shiver * aSway) + wash * aSway;
  }
`;

/** Vertex: whatever's over the flight line pushed out as a camera would see it (see DEPTH). */
const DEPTH_VERT = (on?: boolean) =>
  on
    ? /* glsl */ `
  {
    #ifdef USE_INSTANCING
      mat4 dm = modelMatrix * instanceMatrix;
    #else
      mat4 dm = modelMatrix;
    #endif
    transformed += inverse(mat3(dm)) * depthOff((dm * vec4(transformed, 1.0)).xyz);
  }`
    : '';

/** How a material is enlivened (see enliven). */
export interface Alive {
  sway?: boolean;
  grain?: number;
  see?: boolean;
  hole?: boolean;
  /** It lights up as a ship goes over it (a glowcap: see uPass), in its own colour. */
  pass?: boolean;
}

/**
 * Patches a lit material (toon) so it takes the cloud shadows and a little painterly grain, and,
 * with `sway`, bends in the wind by its `aSway` vertex attribute (0 at the root, ~1 at the tips).
 * With `see`, it's something that stands over the flight line: drawn with depth (see DEPTH), and
 * (unless `hole` is false) thinned away round whatever's under it on screen (see uSee).
 */
export function enliven<T extends THREE.Material>(mat: T, opts: Alive = {}): T {
  const grain = opts.grain ?? 0.07;
  const hole = opts.see && opts.hole !== false;
  const prev = mat.onBeforeCompile;
  // what it was enlivened with, for merging meshes drawn alike (see batch.ts); patched twice over, it's its own
  mat.userData.alive = prev === THREE.Material.prototype.onBeforeCompile ? { sway: !!opts.sway, grain, see: !!opts.see, hole: !!hole, ...(opts.pass ? { pass: true } : {}) } : null;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, weather);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAliveW;\n${opts.sway ? SWAY_GLSL : ''}\n${opts.see ? DEPTH_GLSL : ''}`)
      .replace(
        '#include <project_vertex>',
        opts.sway
          ? /* glsl */ `
          {
            #ifdef USE_INSTANCING
              vec4 sw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            #else
              vec4 sw = modelMatrix * vec4(transformed, 1.0);
            #endif
            vec3 off = sway(sw.xyz);
            // back into the object's own frame (scale and turn both)
            #ifdef USE_INSTANCING
              mat3 toObj = inverse(mat3(modelMatrix) * mat3(instanceMatrix));
            #else
              mat3 toObj = inverse(mat3(modelMatrix));
            #endif
            transformed += toObj * off;
          }
          ${DEPTH_VERT(opts.see)}
          #include <project_vertex>`
          : `${DEPTH_VERT(opts.see)}
          #include <project_vertex>`,
      )
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vAliveW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vAliveW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAliveW;\n${NOISE_GLSL}\n${CLOUD_GLSL}\n${PASS_GLSL}\n${opts.see ? SEE_GLSL : ''}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        ${hole ? 'if (bayer4(gl_FragCoord.xy) < seeThrough(vAliveW) * 0.85) discard;' : ''}
        // brushwork: the colour wanders a little, in strokes longer one way than the other
        float stroke = aFbm(vAliveW.xz * vec2(0.9, 2.2) + vAliveW.y * 0.7) - 0.5;
        diffuseColor.rgb *= 1.0 + stroke * ${grain.toFixed(3)} * 2.0 * uGrain;`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        opts.pass
          ? /* glsl */ `{
            // lit from within as a ship goes over: its own colour, and its glowing bits brighter
            float pg = passGlow(vAliveW);
            totalEmissiveRadiance = totalEmissiveRadiance * (1.0 + 2.5 * pg) + diffuseColor.rgb * 1.15 * pg;
          }
          #include <lights_fragment_begin>`
          : '#include <lights_fragment_begin>',
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `outgoingLight *= 1.0 - cloudShadow(vAliveW);
        #include <opaque_fragment>`,
      );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|alive${opts.sway ? 's' : ''}${opts.see ? 'v' : ''}${hole ? 'h' : ''}${grain}`;
  return mat;
}
