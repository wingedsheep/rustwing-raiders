import * as THREE from 'three';

/**
 * The look: the scene is rendered small (one texel = one art pixel) into a target, then graded
 * there: soft outlines where the depth jumps, a painterly smoothing that turns flat facets into
 * brushwork, bloom so everything that glows lights the air around it, a painter's split tone, a
 * soft vignette, and the game's flashes. The finished texels are blown up onto the canvas with
 * nearest-neighbour sampling, so it's still pixel art, just finer and better lit.
 *
 * The camera moves in whole texels and the blow-up shifts by the remainder (the target has a
 * texel of margin all round), so the land scrolls smoothly without crawling.
 *
 * After wingedsheep's PixelRenderer (src/island/scene/pixel-renderer.ts).
 */
/**
 * Meshes on this layer (foes) get a crisp texel of dark round their silhouette wherever they stand
 * in front of something, so they read on any ground: a mask pass draws their depth alone, and the
 * post pass rings it.
 */
export const OUTLINE_LAYER = 3;

/** Puts everything under `obj` on the outline layer (and keeps it on the others). */
export function outlined(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.xray) o.layers.enable(OUTLINE_LAYER);
  });
}

export class PixelRenderer {
  readonly target: THREE.WebGLRenderTarget;
  private readonly graded: THREE.WebGLRenderTarget;
  private readonly mask: THREE.WebGLRenderTarget;
  private readonly maskMat: THREE.ShaderMaterial;
  private readonly clear = new THREE.Color();
  private litScene: THREE.Scene | null = null;
  private litAge = 0;
  private readonly bloomA: THREE.WebGLRenderTarget;
  private readonly bloomB: THREE.WebGLRenderTarget;
  private readonly post: THREE.ShaderMaterial;
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly blit: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly saved = new THREE.Vector3();
  private readonly frustum = [0, 0, 0, 0];

  constructor(readonly renderer: THREE.WebGLRenderer) {
    const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType };
    this.target = new THREE.WebGLRenderTarget(1, 1, { ...opts, depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
    this.graded = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    // (depth wants all the bits it can get: a full float where the GPU can draw one)
    const float = renderer.extensions.has('EXT_color_buffer_float');
    this.mask = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: float ? THREE.FloatType : THREE.HalfFloatType });
    this.maskMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`,
    });
    const lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType };
    this.bloomA = new THREE.WebGLRenderTarget(1, 1, lin);
    this.bloomB = new THREE.WebGLRenderTarget(1, 1, lin);
    const vertexShader = /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;
    this.bright = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.target.texture }, uThreshold: { value: 0.85 } },
      vertexShader,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor;
        uniform float uThreshold;
        varying vec2 vUv;
        void main() {
          // four taps: the bright target is half size
          vec2 t = 0.5 / vec2(textureSize(tColor, 0));
          vec3 c = (texture2D(tColor, vUv + vec2(-t.x, -t.y)).rgb + texture2D(tColor, vUv + vec2(t.x, -t.y)).rgb
                  + texture2D(tColor, vUv + vec2(-t.x, t.y)).rgb + texture2D(tColor, vUv + vec2(t.x, t.y)).rgb) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.35, l), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tSrc;
        uniform vec2 uDir;
        varying vec2 vUv;
        void main() {
          vec2 d = uDir / vec2(textureSize(tSrc, 0));
          vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
          c += (texture2D(tSrc, vUv + d * 1.385).rgb + texture2D(tSrc, vUv - d * 1.385).rgb) * 0.316;
          c += (texture2D(tSrc, vUv + d * 3.231).rgb + texture2D(tSrc, vUv - d * 3.231).rgb) * 0.070;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        tBloom: { value: this.bloomA.texture },
        tMask: { value: this.mask.texture },
        uNear: { value: 1 },
        uFar: { value: 400 },
        uOutline: { value: new THREE.Color(0x1a1424) },
        uOutlineStrength: { value: 0.55 },
        uFoeEdge: { value: new THREE.Color(0x0c0812) },
        uFoeEdgeStrength: { value: 0.85 },
        uFoeRim: { value: new THREE.Color(1.0, 0.92, 0.8) }, // the light a foe's edge catches
        uGrade: { value: new THREE.Vector3(1.1, 1.05, 1.0) }, // saturation, contrast, brightness
        uShade: { value: new THREE.Color(0.55, 0.6, 0.85) },
        uLight: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uTone: { value: 0.3 },
        uVignette: { value: 0.5 },
        uBloom: { value: 0.5 },
        uLane: { value: 0 }, // the ground under the lane calmed this much: less bloom and colour there, the richest at the edges
        uPlane: { value: new THREE.Vector2(120, 120) }, // how far off the flight plane is at the picture's bottom and top
        uPaint: { value: 1 },
        uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, // rgb + amount: a whole-screen flash
        uHurt: { value: 0 }, // red at the edges when you're hit
        uHeat: { value: 0 }, // shimmer (lava, flares)
        uSpeed: { value: 0 }, // boosting: the edges smear back
        uRadial: { value: 0 }, // 1: the smear runs out from the middle (for a perspective view), not down the screen
        uPersp: { value: 0 }, // 1: a perspective camera (its depth isn't linear)
        uTime: { value: 0 },
        uFade: { value: 0 },
        uFadeColor: { value: new THREE.Color(0x0b0912) },
        uImpact: { value: 0 }, // an impact frame: the picture flipped to two tones, paper and ink
        uImpactColor: { value: new THREE.Color(1, 1, 1) }, // the paper's colour
        uAberr: { value: 0 }, // the colours split apart at the edges (a blow to the ship)
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform sampler2D tBloom;
        uniform sampler2D tMask;
        uniform float uNear;
        uniform float uFar;
        uniform vec3 uOutline;
        uniform float uOutlineStrength;
        uniform vec3 uFoeEdge;
        uniform float uFoeEdgeStrength;
        uniform vec3 uFoeRim;
        uniform vec3 uGrade;
        uniform vec3 uShade;
        uniform vec3 uLight;
        uniform float uTone;
        uniform float uVignette;
        uniform float uBloom;
        uniform float uLane;
        uniform vec2 uPlane;
        uniform float uPaint;
        uniform vec4 uFlash;
        uniform float uHurt;
        uniform float uHeat;
        uniform float uSpeed;
        uniform float uRadial;
        uniform float uPersp;
        uniform float uTime;
        uniform float uFade;
        uniform vec3 uFadeColor;
        uniform float uImpact;
        uniform vec3 uImpactColor;
        uniform float uAberr;
        varying vec2 vUv;

        ivec2 size;

        float linear(float d) {
          if (uPersp > 0.5) return uNear * uFar / (uFar - d * (uFar - uNear));
          return uNear + d * (uFar - uNear);
        }
        float viewZ(ivec2 p) { return linear(texelFetch(tDepth, clamp(p, ivec2(0), size - 1), 0).r); }
        // how far off the nearest foe at p is (1: none there)
        float foeZ(ivec2 p) { return texelFetch(tMask, clamp(p, ivec2(0), size - 1), 0).r; }

        // a texel of dark round each foe, where a neighbour shows the foe and this texel shows
        // something well behind it (not where the foe is hidden, or stands on what's beside it)
        float foeEdge(ivec2 p, float z) {
          float m = foeZ(p);
          if (m < 1.0 && linear(m) <= z + 0.3) return 0.0;
          float ring = 0.0;
          for (int k = 0; k < 4; k++) {
            ivec2 q = p + ivec2(k == 0 ? 1 : k == 1 ? -1 : 0, k == 2 ? 1 : k == 3 ? -1 : 0);
            float mq = foeZ(q);
            if (mq >= 1.0) continue;
            float fz = linear(mq);
            if (fz <= viewZ(q) + 0.3 && z - fz > 0.6) ring = 1.0;
          }
          return ring;
        }
        // the foe's own outermost texels, where a neighbour shows something well behind it: the
        // way out of the foe (xy), and 1 in z when p is one
        vec3 foeRim(ivec2 p, float z) {
          float m = foeZ(p);
          if (m >= 1.0 || linear(m) > z + 0.3) return vec3(0.0);
          vec2 n = vec2(0.0);
          for (int k = 0; k < 4; k++) {
            ivec2 o = ivec2(k == 0 ? 1 : k == 1 ? -1 : 0, k == 2 ? 1 : k == 3 ? -1 : 0);
            if (viewZ(p + o) - z > 0.6) n += vec2(o);
          }
          return vec3(n, dot(n, n) > 0.0 ? 1.0 : 0.0);
        }
        vec3 at(ivec2 p) { return texelFetch(tColor, clamp(p, ivec2(0), size - 1), 0).rgb; }

        // a small Kuwahara: of the four 2x2-texel quadrants around a texel, take the mean of the
        // calmest one. Flat facets melt into strokes and edges stay put, like paint.
        vec3 paint(ivec2 p, vec3 c0) {
          vec3 best = c0;
          float bv = 1e9;
          for (int q = 0; q < 4; q++) {
            ivec2 o = ivec2(q & 1, q >> 1) * 2 - 1;
            vec3 m = vec3(0.0);
            vec3 s = vec3(0.0);
            for (int j = 0; j < 2; j++)
              for (int i = 0; i < 2; i++) {
                vec3 c = at(p + ivec2(i, j) * o);
                m += c;
                s += c * c;
              }
            m *= 0.25;
            vec3 v = s * 0.25 - m * m;
            float vv = v.r + v.g + v.b;
            if (vv < bv) { bv = vv; best = m; }
          }
          return best;
        }

        void main() {
          size = textureSize(tColor, 0);
          ivec2 p = ivec2(gl_FragCoord.xy);
          if (uHeat > 0.0) {
            float w = sin(float(p.y) * 0.8 + uTime * 6.0) * sin(float(p.y) * 0.17 - uTime * 1.7 + float(p.x) * 0.02);
            p.x += int(step(1.0 - uHeat * 0.3, abs(w)) * sign(w));
          }
          vec3 col = at(p);
          vec2 q = (vec2(p) / vec2(size) - 0.5) * vec2(float(size.x) / float(size.y), 1.0);
          if (uAberr > 0.0) {
            // red out, blue in, more the further from the middle (whole texels: still pixel art)
            ivec2 o = ivec2(round(q * uAberr * 14.0));
            col = vec3(at(p + o).r, col.g, at(p - o).b);
          }
          if (uSpeed > 0.0) {
            // speed: the edges of the picture smear back down the screen
            float e = smoothstep(0.35, 0.95, length(q)) * uSpeed;
            vec3 acc = col;
            vec2 dir = uRadial > 0.5 ? normalize(q + 1e-4) : vec2(0.0, 1.0);
            for (int k = 1; k <= 4; k++) acc += at(p + ivec2(dir * float(k * 2)));
            col = mix(col, acc / 5.0, e);
          }
          float z = viewZ(p);
          bool sky = texelFetch(tDepth, p, 0).r > 0.9999;
          if (uPaint > 0.0 && !sky) col = mix(col, paint(p, col), uPaint);

          // a neighbour much further away: we're on the silhouette of something in front
          float dz = 0.0;
          dz = max(dz, viewZ(p + ivec2(1, 0)) - z);
          dz = max(dz, viewZ(p + ivec2(-1, 0)) - z);
          dz = max(dz, viewZ(p + ivec2(0, 1)) - z);
          dz = max(dz, viewZ(p + ivec2(0, -1)) - z);
          // (in perspective the gaps grow with distance: judged against how far off it is)
          float edge = (uPersp > 0.5 ? smoothstep(0.9, 2.2, dz / max(1.0, z * 0.06)) : smoothstep(0.9, 2.2, dz)) * (sky ? 0.0 : 1.0);
          col = mix(col, col * uOutline * 2.4, edge * uOutlineStrength);
          if (uFoeEdgeStrength > 0.0) {
            // ink round the outside; and inside, the foe's own edge catches the light in its own
            // colour, most on the side the sun comes from and most against dark ground, where the
            // ink alone wouldn't read (a lit edge, never a halo round it)
            col = mix(col, uFoeEdge, foeEdge(p, z) * uFoeEdgeStrength);
            vec3 r = foeRim(p, z);
            if (r.z > 0.0) {
              vec2 out2 = normalize(r.xy);
              float lit = 0.5 + 0.5 * dot(out2, vec2(-0.96, 0.27));
              float gl = dot(at(p + ivec2(round(out2))), vec3(0.299, 0.587, 0.114));
              float k = mix(0.35, 1.0, smoothstep(0.2, 0.05, gl)) * mix(0.4, 1.0, lit);
              col = mix(col, col * 2.2 + uFoeRim * 0.24, k * uFoeEdgeStrength);
            }
          }

          // the lane: the ground well under the flight plane, in the middle, goes quieter (what
          // flies and what stands up to it is left alone); the edges keep the richest colour
          float ground = 0.0, mid = 0.0;
          if (uLane > 0.0 && !sky) {
            ground = smoothstep(2.0, 6.0, z - mix(uPlane.x, uPlane.y, vUv.y)) * uLane;
            mid = 1.0 - smoothstep(0.2, 0.62, abs(q.x));
          }

          // bloom: what glows lights the air around it
          col += texture2D(tBloom, vUv).rgb * uBloom * (1.0 - 0.6 * ground * mid);

          // lift the blacks towards the shadow colour: dark places stay readable, like a painting's ground
          if (!sky) col = col * 0.9 + uShade * 0.07;
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(l), col, uGrade.x * (1.0 - ground * (0.3 * mid - 0.12 * (1.0 - mid))));
          col = (col - 0.5) * uGrade.y + 0.5;
          col *= uGrade.z;

          // split tone, as a painter would: shadows go cool, light goes warm
          float lt = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, col * mix(uShade, uLight, smoothstep(0.1, 0.75, lt)), uTone);

          float v = smoothstep(0.5, 1.15, length(q)) * uVignette;
          col = mix(col, col * uShade * 0.5, v * 0.6);

          if (uHurt > 0.0) {
            float e = smoothstep(0.3, 0.9, length(q)) * uHurt;
            col = mix(col, vec3(0.9, 0.1, 0.15), e * 0.6);
          }
          if (uFlash.a > 0.0) col = mix(col, uFlash.rgb, uFlash.a * 0.75);
          if (uImpact > 0.0) {
            // an impact frame: the world goes to paper, and what matters to ink (the foes, what
            // burns bright, and the silhouettes of everything, so the land shows as a sketch)
            float li = dot(col, vec3(0.299, 0.587, 0.114));
            float ink = max(step(0.7, li), max(step(0.5, edge), foeZ(p) < 1.0 ? 1.0 : 0.0));
            col = mix(col, mix(uImpactColor, vec3(0.05, 0.035, 0.07), ink), uImpact);
          }
          if (uFade > 0.0) {
            // an iris: the edges close first, in chunky steps so it stays pixel art
            float d = length(q) / 0.9;
            col = mix(col, uFadeColor, step(1.0 - uFade * 1.4, d - (1.0 - uFade)) );
          }
          gl_FragColor = sRGBTransferOETF(vec4(clamp(col, 0.0, 1.0), 1.0));
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.blit = new THREE.ShaderMaterial({
      uniforms: {
        tGraded: { value: this.graded.texture },
        uStart: { value: new THREE.Vector2() },
        uOrigin: { value: new THREE.Vector2() },
        uPixel: { value: 2 },
      },
      vertexShader,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tGraded;
        uniform vec2 uStart;
        uniform vec2 uOrigin;
        uniform float uPixel;
        void main() {
          vec2 t = uStart + (gl_FragCoord.xy - uOrigin) / uPixel;
          gl_FragColor = texelFetch(tGraded, ivec2(floor(t)), 0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
  }

  get uniforms() {
    return this.post.uniforms;
  }

  private pass(mat: THREE.Material, to: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(to);
    this.renderer.render(this.postScene, this.postCamera);
  }

  /**
   * Renders `scene` into a rectangle of the canvas (x, y from the bottom-left, w × h, all in
   * device pixels), `px` device pixels to an art pixel. The camera's frustum is what shows in
   * the rectangle; it's widened by a texel of margin and snapped to the texel grid here.
   * `overlay` is drawn on top after the post pass, untouched by paint, grade and bloom: for what
   * must always read (the tells of what's about to hurt you).
   */
  render(scene: THREE.Scene, cam: THREE.OrthographicCamera | THREE.PerspectiveCamera, x: number, y: number, w: number, h: number, px: number, overlay?: THREE.Scene) {
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) return this.renderPerspective(scene, cam as THREE.PerspectiveCamera, x, y, w, h, px, overlay);
    const camera = cam as THREE.OrthographicCamera;
    const fw = w / px; // texels across, exactly (the picture)
    const fh = h / px;
    const [tw, th] = this.size(fw, fh); // with a texel of margin each side
    // world units per texel, and the camera snapped to whole texels along its own axes
    const f = this.frustum;
    f[0] = camera.left;
    f[1] = camera.right;
    f[2] = camera.top;
    f[3] = camera.bottom;
    const cx = (camera.left + camera.right) / 2;
    const cy = (camera.top + camera.bottom) / 2;
    const u = (camera.top - camera.bottom) / fh;
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const ux = e[4], uy = e[5], uz = e[6];
    const pos = camera.position;
    this.saved.copy(pos);
    const a = pos.x * rx + pos.y * ry + pos.z * rz + cx;
    const b = pos.x * ux + pos.y * uy + pos.z * uz + cy;
    const da = Math.round(a / u) * u - a;
    const db = Math.round(b / u) * u - b;
    pos.set(pos.x + rx * da + ux * db, pos.y + ry * da + uy * db, pos.z + rz * da + uz * db);
    camera.left = cx - (tw / 2) * u;
    camera.right = cx + (tw / 2) * u;
    camera.top = cy + (th / 2) * u;
    camera.bottom = cy - (th / 2) * u;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    this.post.uniforms.uPersp.value = 0;
    this.draw(scene, camera, overlay);

    // the camera back as it was
    pos.copy(this.saved);
    camera.left = f[0];
    camera.right = f[1];
    camera.top = f[2];
    camera.bottom = f[3];
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // blow it up: the picture's middle is the (unsnapped) camera's middle, which sits -da, -db
    // world units off the target's middle
    this.blowUp(tw / 2 - da / u - fw / 2, th / 2 - db / u - fh / 2, x, y, w, h, px);
  }

  /** The scene into the target, bloom, the post pass, and the overlay over it. */
  private draw(scene: THREE.Scene, camera: THREE.Camera & { near: number; far: number }, overlay?: THREE.Scene) {
    const r = this.renderer;
    this.post.uniforms.uNear.value = camera.near;
    this.post.uniforms.uFar.value = camera.far;
    r.setScissorTest(false);
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, camera);
    this.drawMask(scene, camera);
    // bloom: the bright bits, halved and blurred twice each way
    this.pass(this.bright, this.bloomA);
    const blur = this.blur.uniforms;
    for (let k = 0; k < 2; k++) {
      blur.tSrc.value = this.bloomA.texture;
      blur.uDir.value.set(1 + k, 0);
      this.pass(this.blur, this.bloomB);
      blur.tSrc.value = this.bloomB.texture;
      blur.uDir.value.set(0, 1 + k);
      this.pass(this.blur, this.bloomA);
    }
    this.pass(this.post, this.graded);
    // (the lane is set fresh each frame by the flight that wants it; other views don't)
    this.post.uniforms.uLane.value = 0;
    if (overlay) {
      const auto = r.autoClear;
      r.autoClear = false;
      r.setRenderTarget(this.graded);
      r.render(overlay, camera);
      r.autoClear = auto;
    }
  }

  /** The foes' depth alone (cleared to 1 where there are none), for their outline. */
  private drawMask(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    const layers = camera.layers.mask;
    const bg = scene.background;
    const shadows = r.shadowMap.autoUpdate;
    const alpha = r.getClearAlpha();
    r.getClearColor(this.clear);
    // the lights go on the layer too: a pass that saw none would change the lights' state, and
    // every lit material in the scene would look its shader up again on the next pass, each frame
    // (looked for in a new scene, then now and then: they're nearly all made with it)
    if (scene !== this.litScene || ++this.litAge > 30) {
      this.litScene = scene;
      this.litAge = 0;
      scene.traverse((o) => {
        if ((o as THREE.Light).isLight) o.layers.enable(OUTLINE_LAYER);
      });
    }
    camera.layers.set(OUTLINE_LAYER);
    scene.background = null;
    scene.overrideMaterial = this.maskMat;
    r.shadowMap.autoUpdate = false; // (the shadows were drawn for this frame already)
    r.setClearColor(0xffffff, 1);
    r.setRenderTarget(this.mask);
    r.clear();
    // (nothing's moved since the scene was drawn: no need to walk it all for its matrices again)
    const auto = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    r.render(scene, camera);
    scene.matrixWorldAutoUpdate = auto;
    r.setClearColor(this.clear, alpha);
    r.shadowMap.autoUpdate = shadows;
    scene.overrideMaterial = null;
    scene.background = bg;
    camera.layers.mask = layers;
  }

  /** Sizes the targets for a picture fw × fh texels (with a texel of margin all round); returns the target's size. */
  private size(fw: number, fh: number) {
    const tw = Math.ceil(fw) + 2;
    const th = Math.ceil(fh) + 2;
    if (this.target.width !== tw || this.target.height !== th) {
      this.target.setSize(tw, th);
      this.graded.setSize(tw, th);
      this.mask.setSize(tw, th);
      const bw = Math.max(1, Math.ceil(tw / 2));
      const bh = Math.max(1, Math.ceil(th / 2));
      this.bloomA.setSize(bw, bh);
      this.bloomB.setSize(bw, bh);
    }
    return [tw, th];
  }

  /**
   * A perspective camera: nothing to snap, it moves every frame anyway. The
   * view is widened by the margin texels so the picture is exactly what the camera framed.
   */
  private renderPerspective(scene: THREE.Scene, camera: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number, px: number, overlay?: THREE.Scene) {
    const fw = w / px;
    const fh = h / px;
    const [tw, th] = this.size(fw, fh);
    const fov = camera.fov;
    const aspect = camera.aspect;
    camera.fov = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (th / fh)) * 180) / Math.PI;
    camera.aspect = tw / th;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.post.uniforms.uPersp.value = 1;
    this.draw(scene, camera, overlay);
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    this.blowUp((tw - fw) / 2, (th - fh) / 2, x, y, w, h, px);
  }

  /** The graded target onto the canvas rectangle, nearest-neighbour, from texel (sx, sy). */
  private blowUp(sx: number, sy: number, x: number, y: number, w: number, h: number, px: number) {
    const r = this.renderer;
    const bu = this.blit.uniforms;
    bu.uStart.value.set(sx, sy);
    bu.uOrigin.value.set(x, y);
    bu.uPixel.value = px;
    r.setRenderTarget(null);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    this.pass(this.blit, null);
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.width, r.domElement.height);
  }
}
