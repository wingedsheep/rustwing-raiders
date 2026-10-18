import * as THREE from 'three';

/** How many ships can blow on the land at once. */
export const WASH = 6;

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
};

/** Steps the clock and the clouds along. */
export function tickWeather(dt: number) {
  weather.uTime.value += dt;
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

/**
 * Patches a lit material (toon) so it takes the cloud shadows and a little painterly grain, and,
 * with `sway`, bends in the wind by its `aSway` vertex attribute (0 at the root, ~1 at the tips).
 */
export function enliven<T extends THREE.Material>(mat: T, opts: { sway?: boolean; grain?: number } = {}): T {
  const grain = opts.grain ?? 0.07;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, weather);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vAliveW;\n${opts.sway ? SWAY_GLSL : ''}`)
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
          #include <project_vertex>`
          : '#include <project_vertex>',
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
      .replace('#include <common>', `#include <common>\nvarying vec3 vAliveW;\n${NOISE_GLSL}\n${CLOUD_GLSL}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        // brushwork: the colour wanders a little, in strokes longer one way than the other
        float stroke = aFbm(vAliveW.xz * vec2(0.9, 2.2) + vAliveW.y * 0.7) - 0.5;
        diffuseColor.rgb *= 1.0 + stroke * ${grain.toFixed(3)} * 2.0 * uGrain;`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `outgoingLight *= 1.0 - cloudShadow(vAliveW);
        #include <opaque_fragment>`,
      );
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `${key()}|alive${opts.sway ? 's' : ''}${grain}`;
  return mat;
}
