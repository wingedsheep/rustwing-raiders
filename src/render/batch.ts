import * as THREE from 'three';
import { enliven, type Alive } from './alive';
import { GRADIENT } from './toon';

/**
 * Still scenery, merged: every plain toon mesh under the given objects baked into one mesh per
 * look (its shader, its shadows), each vertex carrying its own mesh's colour and glow. A chunk of
 * land is a few hundred meshes, nearly all the same shader in different colours; drawn one at a
 * time, and again for the shadows, they were most of a frame. What can't be merged (animated,
 * see-through blending, textured) is left as it was.
 */
export function batchStatic(group: THREE.Object3D, objs: THREE.Object3D[]): THREE.BufferGeometry[] {
  group.updateMatrixWorld(true);
  const toGroup = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const bins = new Map<string, { look: Look; meshes: THREE.Mesh[] }>();
  for (const obj of objs)
    obj.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      const look = mesh.isMesh ? lookOf(mesh) : null;
      if (!look) return;
      const key = `${look.key}|${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}|${mesh.renderOrder}|${mesh.layers.mask}`;
      let bin = bins.get(key);
      if (!bin) bins.set(key, (bin = { look, meshes: [] }));
      bin.meshes.push(mesh);
    });
  const geos: THREE.BufferGeometry[] = [];
  for (const { look, meshes } of bins.values()) {
    if (meshes.length < 2) continue;
    const geo = merge(meshes, look, toGroup);
    const out = new THREE.Mesh(geo, batchMaterial(look));
    out.castShadow = meshes[0].castShadow;
    out.receiveShadow = meshes[0].receiveShadow;
    out.renderOrder = meshes[0].renderOrder;
    out.layers.mask = meshes[0].layers.mask;
    group.add(out);
    geos.push(geo);
    for (const m of meshes) m.removeFromParent();
  }
  // (props left with nothing to draw go too, so they aren't walked every frame)
  for (const obj of objs) if (!hasContent(obj)) obj.removeFromParent();
  return geos;
}

/**
 * Compiles every look's shader against the scene it'll be drawn in (its lights), into the target
 * it'll be drawn to, ahead of time: a look first seen mid-flight would hitch the frame it shows.
 */
export function warmBatches(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: THREE.WebGLRenderTarget) {
  const group = new THREE.Group();
  const seen: Alive[] = [{}, { see: true, hole: false }, { see: true }];
  for (const side of [THREE.FrontSide, THREE.DoubleSide] as THREE.Side[])
    for (const sway of [false, true])
      for (const see of seen)
        for (const glow of [false, true])
          for (const pass of [false, true]) {
            const alive: Alive = { sway, grain: 0.07, see: !!see.see, hole: !!see.see && see.hole !== false, ...(pass ? { pass: true } : {}) };
            const look: Look = { key: `${JSON.stringify(alive)}|${side}|${glow ? 1 : 0}`, alive, side, glow, sway };
            const geo = new THREE.BufferGeometry();
            for (const [name, n] of [['position', 3], ['normal', 3], ['color', 3], ...(glow ? [['aGlow', 3]] : []), ...(sway ? [['aSway', 1]] : [])] as [string, number][])
              geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * n), n));
            const mesh = new THREE.Mesh(geo, batchMaterial(look));
            mesh.castShadow = mesh.receiveShadow = true;
            group.add(mesh);
          }
  const was = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  void renderer.compileAsync(group, camera, scene).finally(() => group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
  renderer.setRenderTarget(was);
}

interface Look {
  key: string;
  alive: Alive;
  side: THREE.Side;
  glow: boolean;
  sway: boolean;
}

const PLAIN = THREE.Object3D.prototype.onBeforeRender;

/** How a mesh is drawn, if it can be merged with others drawn the same way. */
function lookOf(mesh: THREE.Mesh): Look | null {
  const m = mesh.material as THREE.MeshToonMaterial;
  if (Array.isArray(m) || !m.isMeshToonMaterial || (mesh as THREE.InstancedMesh).isInstancedMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return null;
  const alive = m.userData.alive as Alive | null | undefined;
  if (!alive || m.map || m.transparent || m.alphaTest > 0 || m.gradientMap !== GRADIENT || !m.depthWrite || !m.depthTest) return null;
  const g = mesh.geometry;
  if (!g.attributes.normal || g.morphAttributes.position || mesh.onBeforeRender !== PLAIN) return null;
  const glow = m.emissiveIntensity > 0 && m.emissive.getHex() !== 0;
  const sway = !!alive.sway;
  return { key: `${JSON.stringify(alive)}|${m.side}|${glow ? 1 : 0}`, alive, side: m.side, glow, sway };
}

const mats = new Map<string, THREE.MeshToonMaterial>();

/** The one material a look's merged meshes share: white, coloured by the vertices, glowing by them. */
function batchMaterial(look: Look) {
  let mat = mats.get(look.key);
  if (mat) return mat;
  mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: GRADIENT, vertexColors: true, side: look.side });
  if (look.glow) {
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
    };
    mat.customProgramCacheKey = () => 'batch-glow';
  }
  enliven(mat, look.alive);
  mats.set(look.key, mat);
  return mat;
}

const mw = new THREE.Matrix4();
const nm = new THREE.Matrix3();
const glow = new THREE.Color();

/** The meshes' geometry in the group's frame, as one indexed geometry with colours (and glow, sway). */
function merge(meshes: THREE.Mesh[], look: Look, toGroup: THREE.Matrix4) {
  let nv = 0;
  let ni = 0;
  for (const m of meshes) {
    nv += m.geometry.attributes.position.count;
    ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const rgb = new Float32Array(nv * 3);
  const emit = look.glow ? new Float32Array(nv * 3) : null;
  const sway = look.sway ? new Float32Array(nv) : null;
  const index = new Uint32Array(ni);
  let o = 0;
  let oi = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const mat = m.material as THREE.MeshToonMaterial;
    mw.multiplyMatrices(toGroup, m.matrixWorld);
    nm.getNormalMatrix(mw);
    const P = g.attributes.position;
    const pa = floats(P, 3);
    const na = floats(g.attributes.normal, 3);
    const ca = mat.vertexColors && g.attributes.color ? floats(g.attributes.color, 3) : null;
    const sa = sway && g.attributes.aSway ? floats(g.attributes.aSway, 1) : null;
    const e = mw.elements;
    const q = nm.elements;
    const { r, g: gr, b } = mat.color;
    glow.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity);
    for (let i = 0; i < P.count; i++) {
      const j = i * 3;
      const k = (o + i) * 3;
      const x = pa[j], y = pa[j + 1], z = pa[j + 2];
      pos[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = na[j], ny = na[j + 1], nz = na[j + 2];
      const ox = q[0] * nx + q[3] * ny + q[6] * nz;
      const oy = q[1] * nx + q[4] * ny + q[7] * nz;
      const oz = q[2] * nx + q[5] * ny + q[8] * nz;
      const l = 1 / (Math.hypot(ox, oy, oz) || 1);
      nor[k] = ox * l;
      nor[k + 1] = oy * l;
      nor[k + 2] = oz * l;
      rgb[k] = ca ? r * ca[j] : r;
      rgb[k + 1] = ca ? gr * ca[j + 1] : gr;
      rgb[k + 2] = ca ? b * ca[j + 2] : b;
      if (emit) {
        emit[k] = glow.r;
        emit[k + 1] = glow.g;
        emit[k + 2] = glow.b;
      }
      if (sway) sway[o + i] = sa ? sa[i] : 0;
    }
    // (a mirrored mesh's triangles turn the other way round)
    const flip = mw.determinant() < 0;
    const n = g.index ? g.index.count : P.count;
    for (let i = 0; i < n; i += 3) {
      const a = g.index ? g.index.getX(i) : i;
      const b = g.index ? g.index.getX(i + 1) : i + 1;
      const c = g.index ? g.index.getX(i + 2) : i + 2;
      index[oi + i] = o + a;
      index[oi + i + 1] = o + (flip ? c : b);
      index[oi + i + 2] = o + (flip ? b : c);
    }
    o += P.count;
    oi += n;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
  if (emit) geo.setAttribute('aGlow', new THREE.BufferAttribute(emit, 3));
  if (sway) geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/** An attribute's values as plain floats, `n` to a vertex (its own array when it's stored that way). */
function floats(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, n: number): ArrayLike<number> {
  if (!(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized && a.itemSize === n) return a.array;
  const out = new Float32Array(a.count * n);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) out[i * n + c] = a.getComponent(i, c);
  return out;
}

function hasContent(obj: THREE.Object3D) {
  let any = false;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.Light).isLight || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) any = true;
  });
  return any;
}
