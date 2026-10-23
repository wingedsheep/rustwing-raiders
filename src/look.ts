import type * as THREE from 'three';

/**
 * ?look=15: a still for `just look` (tools/look.ts). The autopilot flies 15 s of the level in fixed
 * steps, the view stepped with it, then everything holds; no HUD. Math.random is seeded from &seed
 * (this module is imported first, before anything rolls), so the same seed and moment give the same
 * pixels. The tool reads `window.__look` to know when it's ready, and sets `mode` for the grey frame:
 * 'keep' drops the shadows of what must read, 'bare' hides it, and the difference is its mask.
 */
const q = new URLSearchParams(location.search);

export const look = q.has('look') ? { at: Number(q.get('look')) || 15, ready: false, mode: 'still' as 'still' | 'keep' | 'bare' } : null;

if (look) {
  // mulberry32
  let s = (Number(q.get('seed') ?? 1) * 0x9e3779b9) >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Object.assign(window, { __look: look });
}

/** Draws with the look's mode applied to what must read, then puts it back. */
export function posed(readers: () => THREE.Object3D[], draw: () => void) {
  if (!look || look.mode === 'still') return draw();
  const was: [THREE.Object3D, boolean, boolean][] = [];
  for (const r of readers()) r.traverse((o) => void was.push([o, o.visible, o.castShadow]));
  for (const [o] of was) {
    o.castShadow = false;
    if (look.mode === 'bare') o.visible = false;
  }
  draw();
  for (const [o, visible, cast] of was) {
    o.visible = visible;
    o.castShadow = cast;
  }
}
