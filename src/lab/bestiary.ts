/**
 * The bestiary: every enemy a planet can send, on a turntable in the game's own look, to check it's
 * modelled and moving: which model it really wears (its own, or its archetype's shared one), its
 * idle loop, and its hit circle against the size of the model. And a table of the lot, every
 * planet, to see what's still missing.
 */

import * as THREE from 'three';
import { library, type Instance } from '../render/assets';
import { PixelRenderer } from '../render/pixel';
import { toon } from '../render/toon';
import { FOES } from '../sim/factions';
import { PLANETS, type EnemySkin } from '../world/planets';
import { TILT } from '../sim/types';
import { hullGrowth } from '../sim/level';
import { GROUPS, groupOf, kindsFor, type Kind } from './catalog';
import { kinds, planetOf } from './composer';
import { store, waveId } from './state';
import { h, icon, kids, seg } from './ui';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

type Source = 'own' | 'shared' | 'missing';

interface Look {
  kind: string | null;
  source: Source;
  tried: string[];
}

/** Which model an enemy wears, as cloneEnemy (view/enemy-model.ts) finds it. */
function lookOf(skin: EnemySkin, model: string, seg?: string): Look {
  const own = `enemy_${slug(skin.name)}${seg ? `_${seg}` : ''}`;
  const arch = seg ? `enemy_${model}_${seg}` : `enemy_${model}`;
  const tried = [own, `${arch}_${skin.kind}`, `${arch}_mech`];
  for (const k of tried) if (library.has(k)) return { kind: k, source: k === own ? 'own' : 'shared', tried };
  return { kind: null, source: 'missing', tried };
}

/** Only the serpent archetype comes in segments (as level-view draws it); a foe on the serpent model, like the Burrower, is one piece. */
const seg0 = (k: Kind) => (k.id === 'serpent' ? 'head' : undefined);
const scaleOf = (k: Kind) => (FOES as Record<string, { scale: number } | undefined>)[k.id]?.scale ?? 1;

export function mountBestiary(root: HTMLElement, fly: () => void) {
  const list = h('nav', { class: 'b-list', 'aria-label': 'Enemies' });
  const canvas = h('canvas');
  const over = h('div', { class: 'over' });
  const stageEl = h('div', { class: 'b-stage' }, canvas, over);
  const controls = h('div', { class: 'deck' });
  const info = h('div', { class: 'b-info' });
  const cover = h('div', { class: 'card' });
  const main = h('div', { class: 'b-main' }, stageEl, controls, info, cover);
  root.replaceChildren(h('div', { class: 'bestiary' }, list, main));

  let current: Kind | null = null;
  let elite = false;
  let turn = true;
  let hitbox = true;
  let pixelLook = true;
  let animRate = 1;
  let yaw = 0;
  let zoom = 1;
  let ready = false;

  over.replaceChildren(h('h3', null, 'Loading the models…'));

  // --- the turntable --------------------------------------------------------------------

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x07050a, 1);
  const pixel = new PixelRenderer(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c18);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-30, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 150 });
  const hemi = new THREE.HemisphereLight(0xc8d0ff, 0x302838, 1.3);
  scene.add(sun, hemi);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), toon(0x1a1422));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const rings = new THREE.Group();
  for (let r = 2; r <= 8; r += 2) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.02, r + 0.02, 64), new THREE.MeshBasicMaterial({ color: 0x3a2e48 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.01;
    rings.add(m);
  }
  scene.add(rings);
  const hit = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd04a, transparent: true, opacity: 0.9, depthTest: false }));
  hit.rotation.x = -Math.PI / 2;
  hit.renderOrder = 10;
  scene.add(hit);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 300);
  let insts: Instance[] = [];
  let lift = 0;
  let size = { w: 1, d: 1, h: 1 };
  /** Half the widest span of the model (its head, for a serpent). */
  let head = 1;

  function show(k: Kind) {
    for (const i of insts) i.dispose();
    insts = [];
    pivot.clear();
    if (!ready) return;
    const sk = seg0(k);
    const s = scaleOf(k) * (elite ? 1.3 : 1);
    const add = (part: string | undefined, z: number) => {
      const look = lookOf(k.skin, k.model, part);
      const inst = look.kind ? library.clone(look.kind, 0, k.skin.colors, true) : null;
      let obj: THREE.Object3D;
      if (inst) {
        insts.push(inst);
        obj = inst.obj;
      } else {
        // what the game draws when there's no model: a stand-in
        obj = new THREE.Mesh(new THREE.OctahedronGeometry(k.r), toon(k.skin.colors[0]));
      }
      obj.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : 0));
      obj.position.z = z;
      obj.rotation.y = Math.PI;
      pivot.add(obj);
    };
    if (sk) {
      // a serpent: its head, a few of its body and its tail, in a line
      add('head', 0);
      for (let i = 1; i <= 3; i++) add('body', i * 1.7);
      add('tail', 4 * 1.7);
    } else add(undefined, 0);
    pivot.scale.setScalar(s);
    const box = new THREE.Box3().setFromObject(pivot);
    lift = Math.max(0, -box.min.y) + 0.4;
    pivot.position.y = lift;
    const b2 = new THREE.Box3().setFromObject(pivot);
    size = { w: b2.max.x - b2.min.x, d: b2.max.z - b2.min.z, h: b2.max.y - b2.min.y };
    // the hit circle is the head's (a serpent's body segments are hit on their own)
    const b3 = new THREE.Box3().setFromObject(pivot.children[0]);
    head = Math.max(b3.max.x - b3.min.x, b3.max.z - b3.min.z) / 2;
    const r = k.r * (elite ? 1.3 : 1);
    hit.scale.setScalar(r);
    hit.position.y = lift;
    hit.visible = hitbox;
    zoom = 1;
  }

  function frame() {
    const w = stageEl.clientWidth;
    const hh = stageEl.clientHeight;
    if (w && hh && root.offsetParent !== null) {
      const dpr = devicePixelRatio || 1;
      const dw = Math.round(w * dpr);
      const dh = Math.round(hh * dpr);
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
      }
      if (turn) yaw += 0.006;
      for (const i of insts) i.update((1 / 60) * animRate);
      // the game's camera: leaning back TILT from straight down, turned about the model
      const span = Math.max(2.6, Math.max(size.w, size.d, size.h * 1.4) * 0.62) / zoom;
      const aspect = dw / dh;
      cam.left = -span * aspect;
      cam.right = span * aspect;
      cam.top = span;
      cam.bottom = -span;
      cam.updateProjectionMatrix();
      const tilt = TILT + 0.15;
      const target = new THREE.Vector3(0, lift * 0.6, 0);
      cam.position.set(target.x + Math.sin(yaw) * Math.sin(tilt) * 100, target.y + Math.cos(tilt) * 100, target.z + Math.cos(yaw) * Math.sin(tilt) * 100);
      cam.lookAt(target);
      if (pixelLook) {
        const u = pixel.uniforms;
        u.uFlash.value.w = 0;
        u.uHurt.value = 0;
        u.uHeat.value = 0;
        u.uSpeed.value = 0;
        u.uImpact.value = 0;
        u.uAberr.value = 0;
        u.uDrain.value = 0;
        u.uFade.value = 0;
        u.uVignette.value = 0.3;
        u.uTone.value = 0.3;
        u.uShade.value.setRGB(0.55, 0.6, 0.85);
        u.uLight.value.setRGB(1, 0.95, 0.85);
        u.uGrade.value.set(1.1, 1.05, 1);
        u.uTime.value = performance.now() / 1000;
        pixel.render(scene, cam, 0, 0, dw, dh, Math.max(2, Math.round(dh / 300)));
      } else {
        renderer.setRenderTarget(null);
        renderer.setViewport(0, 0, dw, dh);
        renderer.render(scene, cam);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // drag to turn, wheel to zoom
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    let x = e.clientX;
    const move = (ev: PointerEvent) => {
      yaw -= (ev.clientX - x) * 0.01;
      x = ev.clientX;
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true });
    if (turn) {
      turn = false;
      renderControls();
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom = Math.max(0.4, Math.min(4, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    },
    { passive: false },
  );

  // --- the page ---------------------------------------------------------------------------

  function renderList() {
    const ks = kinds();
    list.replaceChildren();
    for (const g of GROUPS) {
      const of = ks.filter((k) => k.group === g.id);
      if (!of.length) continue;
      list.appendChild(h('h4', null, h('span', { class: 'who-dot', style: { background: g.color } }), g.name));
      for (const k of of) {
        const look = ready ? lookOf(k.skin, k.model, seg0(k)) : null;
        list.appendChild(
          h(
            'button',
            { class: 'b-item', type: 'button', 'aria-current': String(current?.id === k.id), onclick: () => pick(k) },
            h('span', null, h('b', null, k.name), h('small', null, look ? (look.source === 'own' ? 'Its own model' : look.source === 'shared' ? 'Shared model' : 'No model') : '…')),
            look ? badge(look.source) : null,
          ),
        );
      }
    }
  }

  const badge = (s: Source) =>
    s === 'own'
      ? h('span', { class: 'pill fair', title: 'Wears a model made for it' }, icon('check'), 'Own')
      : s === 'shared'
        ? h('span', { class: 'pill easy', title: "Wears its archetype's shared model, in its colours" }, 'Shared')
        : h('span', { class: 'pill fail', title: 'No model: the game draws a stand-in' }, icon('warn'), 'None');

  function pick(k: Kind) {
    current = k;
    show(k);
    renderList();
    renderInfo();
    renderControls();
  }

  function renderControls() {
    controls.replaceChildren(
      ...kids(
      h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: elite, onchange: (e: Event) => { elite = (e.target as HTMLInputElement).checked; if (current) show(current); renderInfo(); } }), 'As an elite'),
      h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: hitbox, onchange: (e: Event) => { hitbox = (e.target as HTMLInputElement).checked; hit.visible = hitbox; } }), 'Hit circle'),
      h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: turn, onchange: (e: Event) => { turn = (e.target as HTMLInputElement).checked; } }), 'Turn'),
      h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: pixelLook, onchange: (e: Event) => { pixelLook = (e.target as HTMLInputElement).checked; } }), 'Game look'),
      h('label', { class: 'field' }, 'Idle', seg([0, 0.25, 1, 2].map((v) => ({ value: v, label: v === 0 ? 'Still' : `${v}×` })), animRate, (v) => { animRate = v; renderControls(); }, 'Animation speed')),
      h('div', { class: 'grow', style: 'flex:1' }),
      h('span', { class: 'sub' }, 'Drag to turn, scroll to zoom'),
      current
        ? h(
            'button',
            {
              class: 'btn go',
              type: 'button',
              title: 'Send it on the range, alone and then as an elite, and fly it',
              onclick: () => {
                const k = current!;
                store.set({ source: 'script', waves: [{ id: waveId(), kind: k.id, elite: false, at: 30, n: 1 }, { id: waveId(), kind: k.id, elite: true, at: 120, n: 1 }], tab: 'range' });
                requestAnimationFrame(fly);
              },
            },
            icon('play'),
            'See it fly',
          )
        : null,
      ),
    );
  }

  function renderInfo() {
    const k = current;
    if (!k) {
      over.replaceChildren(h('h3', null, ready ? 'Pick an enemy' : 'Loading the models…'));
      info.replaceChildren();
      return;
    }
    const look = lookOf(k.skin, k.model, seg0(k));
    const inst = insts[0];
    const clips = inst ? [...inst.actions.keys()] : [];
    const idle = clips.find((c) => c.endsWith('_idle'));
    const others = clips.filter((c) => c !== idle);
    const g = groupOf(k.group);
    over.replaceChildren(h('h3', null, `${elite ? 'Elite ' : ''}${k.name}`), h('div', { class: 'sub', style: { color: g.color } }, g.name));
    const r = k.r * (elite ? 1.3 : 1);
    const span = head;
    const ratio = r / Math.max(0.01, span);
    const hull = Math.round(k.hp * hullGrowth(store.difficulty) * (elite ? 2.4 : 1));
    info.replaceChildren(
      h(
        'div',
        { class: 'card' },
        h('h3', null, 'Model'),
        h('div', { style: 'display:flex;gap:8px;align-items:center' }, badge(look.source), h('b', { style: 'font:600 13px var(--cond)' }, look.kind ?? 'none')),
        h('p', null, look.source === 'own' ? 'Made for it.' : look.source === 'shared' ? `No ${look.tried[0]}: it wears its archetype's model in its own colours.` : `None of ${look.tried.join(', ')}: the game draws a stand-in.`),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', null, 'Animation'),
        idle ? h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'pill fair' }, icon('check'), 'Idle loop'), h('b', { style: 'font:600 13px var(--cond)' }, idle)) : h('span', { class: 'pill fail' }, icon('warn'), 'No idle loop: it won’t move'),
        h('p', null, others.length ? `Also: ${others.join(', ')}.` : 'Its tells and attacks are the game’s own (flashes, poses, telegraphs): see it fly to check them.'),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', null, 'Hit circle'),
        h('div', { class: 'big num', style: { color: ratio < 0.45 || ratio > 1.15 ? 'var(--gold)' : 'var(--cream)' } }, `${Math.round(ratio * 100)}%`),
        h('p', null, `of the model's half-width (radius ${r.toFixed(1)} against ${span.toFixed(1)}). ${ratio < 0.45 ? 'Shots will pass through what looks like it.' : ratio > 1.15 ? 'It can be hit well off the model.' : 'About right.'}`),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', null, 'At this stage'),
        h('div', { class: 'big num' }, `${hull} hull`),
        h('p', null, `${k.role}. Base ${k.hp}${elite ? ', ×2.4 as an elite, with armour' : ''}.`),
      ),
    );
  }

  function renderCoverage() {
    if (!ready) return;
    const rows = PLANETS.map((p) => {
      const ks = kindsFor(p).filter((k) => k.group === 'guard');
      const boss = library.has(`boss_${p.id}`);
      return h(
        'tr',
        null,
        h('th', null, p.name),
        ...ks.map((k) => {
          const l = lookOf(k.skin, k.model, seg0(k));
          return h('td', { title: l.kind ?? 'no model' }, l.source === 'own' ? '' : h('span', { style: { color: l.source === 'missing' ? 'var(--red)' : 'var(--dim)' } }, l.source === 'missing' ? '✕ ' : '○ '), k.name);
        }),
        h('td', null, boss ? '' : h('span', { style: 'color:var(--red)' }, '✕ '), p.boss.name.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())),
      );
    });
    const foes = kindsFor(planetOf()).filter((k) => k.group !== 'guard');
    const shared = foes.filter((k) => lookOf(k.skin, k.model, seg0(k)).source !== 'own');
    const all = PLANETS.flatMap((p) => kindsFor(p).filter((k) => k.group === 'guard'));
    const own = all.filter((k) => lookOf(k.skin, k.model, seg0(k)).source === 'own').length;
    cover.replaceChildren(
      h('h3', null, 'Every planet'),
      h('p', { class: 'sub', style: 'margin:-4px 0 10px' }, `${own} of ${all.length} planet enemies wear their own model; the rest share their archetype's (○), and ✕ has none. Faction foes sharing a model: ${shared.length ? shared.map((k) => k.name).join(', ') : 'none'}.`),
      h('div', { style: 'overflow:auto' }, h('table', { class: 'coverage' }, h('thead', null, h('tr', null, h('th', null, 'Planet'), h('th', { colspan: '6' }, 'Its own enemies'), h('th', null, 'Boss'))), h('tbody', null, ...rows))),
    );
  }

  library.load().then(() => {
    ready = true;
    renderList();
    pick(current ?? kinds()[0]);
    renderCoverage();
  });

  renderList();
  renderControls();
  renderInfo();
  store.on((_, c) => {
    if (c.has('planet')) {
      current = null;
      renderList();
      if (ready) pick(kinds()[0]);
    }
    if (c.has('sector') || c.has('stop') || c.has('danger')) renderInfo();
  });
}
