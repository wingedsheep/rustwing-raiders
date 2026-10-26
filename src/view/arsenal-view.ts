/**
 * How the arsenal's states and combos look (see sim/arsenal.ts): ice that grows over a chilled
 * enemy and glints white when it's frozen, a taut chain on the pinned, dust behind the flung, and
 * each cash-in its own burst and name.
 */

import * as THREE from 'three';
import type { Enemy, LevelEvent } from '../sim/level';
import { CASH } from '../sim/arsenal';
import { FLIGHT_Y } from '../sim/types';
import { HALF_W } from '../sim/types';
import { audio } from '../audio';
import type { Fx } from './fx';
import type { Strokes } from './strokes';

/** What the level view lends us. */
export interface ArsenalHooks {
  fx: Fx;
  strokes: Strokes;
  pop(text: string, x: number, z: number, color: string, big?: boolean): void;
  punch(k: number): void;
  shake(k: number): void;
  impact(col: number, time: number): void;
  shards(x: number, z: number, n: number, col: number): void;
  zap(x: number, z: number, r: number, col: number): void;
  bolt(points: number[], col: number): void;
}

const ICE = new THREE.Color(0xd8f8ff);
const ICE_DEEP = new THREE.Color(0x5ab8e8);
const MIST = new THREE.Color(0xcfe8f4);
const MIST_END = new THREE.Color(0x6a8ca8);
const DUST = new THREE.Color(0xd8c8a8);
const DUST_END = new THREE.Color(0x6a5a4a);
const FIRE = new THREE.Color(0xfff0a0);
const FIRE_END = new THREE.Color(0xc0301a);
const HOT = new THREE.Color(0xfff4d0);
const IRON = new THREE.Color(0x3a3634);
const STEAM = new THREE.Color(0xe8e8f0);
const STEAM_END = new THREE.Color(0x8a8a9a);

/** Every frame, for an enemy carrying any of it (the ice and the chain themselves: gun-looks.ts). */
export function arsenalLook(fx: Fx, e: Enemy, lift: number, groundZ: number) {
  const a = e.ax;
  if (!a) return;
  const r = e.r;
  if (a.frozen > 0) {
    // frozen: a glint running over the ice, cold breath off it
    if (Math.random() < 0.25) fx.add({ x: e.x + (Math.random() - 0.5) * r * 1.8, y: lift + Math.random() * 0.8, z: groundZ + (Math.random() - 0.5) * r * 1.4, size: 0.35 + Math.random() * 0.3, grow: 0.2, life: 0.15, color: ICE, carried: !e.ground });
    if (Math.random() < 0.15) fx.add({ x: e.x, y: lift, z: groundZ + r * 0.5, vy: -0.5, vz: 1, size: r * 0.6, grow: 2, life: 0.8, color: MIST, to: MIST_END, glow: false, carried: !e.ground });
  } else if (a.chill > 0 && Math.random() < 0.12 * a.chill) {
    // chilled: frost settling on it, thicker each stack
    fx.add({ x: e.x + (Math.random() - 0.5) * r * 2, y: lift + 0.6, z: groundZ + (Math.random() - 0.5) * r, vy: -0.6, size: 0.3 + 0.08 * a.chill, grow: 0.4, life: 0.4, color: ICE, to: ICE_DEEP, carried: !e.ground });
  }
  if (a.flung > 0 && Math.random() < 0.7) fx.add({ x: e.x, y: lift, z: groundZ, size: 0.6, grow: 1.6, life: 0.35, color: DUST, to: DUST_END, glow: false, carried: !e.ground });
}

/** The arsenal's events. */
export function arsenalEvent(h: ArsenalHooks, e: LevelEvent) {
  const pan = 'x' in e ? e.x / HALF_W : 0;
  const { fx, strokes } = h;
  switch (e.type) {
    case 'freeze':
      // it seizes: a flash of white, a ring of frost, the ice cracking over it all at once
      fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: 4, grow: 0.5, life: 0.08, color: ICE, carried: true });
      fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.3, true, 0xbff4ff);
      strokes.burst(e.x, e.z, 8, 0xd8f8ff, 4, 0.18, 0.3);
      strokes.star(e.x, e.z, 2.4, 0xffffff, 0.2);
      h.shards(e.x, e.z, 6, 0xd8f8ff);
      h.pop('FROZEN', e.x, e.z - 3, '#bff4ff');
      h.punch(0.08);
      audio.play('ice_crack', { pan, pitch: 1.1 });
      break;
    case 'thaw':
      fx.sparks(e.x, FLIGHT_Y + 0.4, e.z, 6, 0xbff4ff, 6, 0.3, 0.2);
      audio.play('frost_hit', { pan, pitch: 0.7 });
      break;
    case 'douse':
      // fire and ice: a burst of steam, and the hull cracks (its CRACK mark shows the shards)
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        fx.add({ x: e.x, y: FLIGHT_Y + 0.8, z: e.z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 4, vy: 3, size: 1, grow: 2.8, life: 0.7, drag: 3, color: STEAM, to: STEAM_END, glow: false, carried: true });
      }
      h.pop('QUENCH', e.x, e.z - 3, '#e8f0ff');
      audio.play('frost_breath', { pan, vol: 0.5, pitch: 1.6 });
      break;
    case 'pin':
      h.pop('PINNED', e.x, e.z - 3, '#ffd08a');
      fx.ring(e.x, FLIGHT_Y, e.z, 2.6, 0.2, true, 0xc8b090);
      break;
    case 'thud':
      fx.explode(e.x, FLIGHT_Y, e.z, 0.8, 0xffc070, true);
      h.punch(0.15);
      audio.play('crash', { pan });
      break;
    case 'cash': {
      const c = CASH[e.kind];
      h.pop(`${c.name}!`, e.x, e.z - 4, c.color, true);
      // every cash-in: a white blink, a ring of its colour, a beat of impact frame
      fx.add({ x: e.x, y: FLIGHT_Y + 1.2, z: e.z, size: 6, grow: 1.4, life: 0.1, color: new THREE.Color(0xffffff), carried: true });
      fx.ring(e.x, FLIGHT_Y, e.z, 7, 0.35, true, c.hex);
      h.impact(c.hex, 0.05);
      cashLook(h, e);
      // a line to each it spilled onto: what the payoff passed on
      for (const t of e.to) {
        if (e.kind === 'groundout') h.bolt([e.x, e.z, (e.x + t.x) / 2 + (Math.random() - 0.5) * 3, (e.z + t.z) / 2 + (Math.random() - 0.5) * 3, t.x, t.z], c.hex);
        else strokes.slash(e.x, e.z, t.x, t.z, c.hex, 0.35, 0.25);
        fx.ring(t.x, FLIGHT_Y, t.z, 2.2, 0.2, true, c.hex);
      }
      break;
    }
  }
}

/** Each cash-in its own bang: what it looks like and sounds like when a setup is spent. */
function cashLook(h: ArsenalHooks, e: Extract<LevelEvent, { type: 'cash' }>) {
  const { fx, strokes } = h;
  const pan = e.x / HALF_W;
  const c = CASH[e.kind];
  switch (e.kind) {
    case 'smash':
      // the ice goes like a window: a storm of shards, a frost cloud, the view rocked
      h.shards(e.x, e.z, 28, 0xd8f8ff);
      for (let k = 0; k < 18; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 14 + Math.random() * 20;
        fx.add({ x: e.x, y: FLIGHT_Y + 0.8, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, size: 0.25, grow: 0.3, life: 0.25 + Math.random() * 0.15, drag: 4, color: ICE, carried: true });
      }
      for (let k = 0; k < 6; k++) {
        const a = Math.random() * Math.PI * 2;
        fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, size: 1.4, grow: 2.4, life: 0.9, drag: 2, color: MIST, to: MIST_END, glow: false, carried: true });
      }
      strokes.burst(e.x, e.z, 16, 0xe8fcff, 9, 0.24, 0.5);
      strokes.star(e.x, e.z, 5, 0xffffff, 0.24);
      h.punch(0.45);
      h.shake(0.3);
      audio.play('cash_smash', { pan });
      break;
    case 'nailed':
      // driven home: a gold star, a hammer-blow ring, iron flying
      strokes.star(e.x, e.z, 5, 0xffd08a, 0.26);
      strokes.burst(e.x, e.z, 12, 0xffc070, 8, 0.22, 0.45);
      fx.ring(e.x, FLIGHT_Y, e.z, 4, 0.18, true, 0xffffff);
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 6 + Math.random() * 8;
        fx.add({ x: e.x, y: FLIGHT_Y + 0.6, z: e.z, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + Math.random() * 5, size: 0.18, life: 1.3, color: IRON, solid: true, gravity: 24, spin: 14 });
      }
      fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 16, 0xffd08a, 22, 0.3, 0.2);
      h.punch(0.45);
      h.shake(0.25);
      audio.play('cash_nailed', { pan });
      break;
    case 'flareup':
      // the burn all at once: a fireball, and a column of fire going up off it
      fx.explode(e.x, FLIGHT_Y, e.z, 2.4, c.hex, true);
      for (let k = 0; k < 14; k++) fx.add({ x: e.x + (Math.random() - 0.5) * 2, y: FLIGHT_Y + 0.5 + k * 0.2, z: e.z, vy: 8 + Math.random() * 8, vz: -2 - Math.random() * 3, size: 1 + Math.random() * 0.6, grow: 1.8, life: 0.5 + Math.random() * 0.3, drag: 1.5, color: FIRE, to: FIRE_END, carried: true });
      strokes.burst(e.x, e.z, 10, 0xffb060, 7, 0.22, 0.45);
      h.punch(0.35);
      h.shake(0.25);
      audio.play('cash_flare', { pan });
      break;
    case 'groundout':
      // it runs to earth: bolts out of it every way, and the air crackling
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.random() * 0.5;
        const d = 4 + Math.random() * 3;
        h.bolt([e.x, e.z, e.x + Math.cos(a) * d * 0.5 + (Math.random() - 0.5), e.z + Math.sin(a) * d * 0.5 + (Math.random() - 0.5), e.x + Math.cos(a) * d, e.z + Math.sin(a) * d], c.hex);
      }
      for (let k = 0; k < 4; k++) h.zap(e.x, e.z, 2.5, 0xe0d8ff);
      fx.sparks(e.x, FLIGHT_Y + 0.6, e.z, 18, 0xd8d0ff, 24, 0.25, 0.2);
      fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: 8, grow: 0.6, life: 0.12, color: new THREE.Color(0xc8b8ff), carried: true });
      h.punch(0.35);
      h.shake(0.2);
      audio.play('cash_ground', { pan });
      break;
    case 'breach':
      // cracked open like a nut: plates flung off, a gold line through it
      h.shards(e.x, e.z, 16, c.hex);
      strokes.slash(e.x - 5, e.z + 2, e.x + 5, e.z - 2, 0xffe8a0, 0.7, 0.24);
      strokes.burst(e.x, e.z, 10, 0xfff0c0, 7, 0.2, 0.4);
      fx.add({ x: e.x, y: FLIGHT_Y + 1, z: e.z, size: 3, grow: 0.4, life: 0.08, color: HOT, carried: true });
      h.punch(0.35);
      h.shake(0.2);
      audio.play('cash_breach', { pan });
      break;
  }
}
