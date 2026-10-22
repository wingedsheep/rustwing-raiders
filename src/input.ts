/**
 * Keyboards and pads. Each player has a device: a gamepad (Xbox or PlayStation, through the
 * browser's standard mapping), or the keyboard. One player on the keyboard gets all of it; two
 * share it, left hand and right hand.
 *
 *   keyboard (solo)   move WASD / arrows   fire J Z Space   heavy O N    dash K X        boost L C (held)   special I V        aux U B        focus Shift
 *   keyboard left     move WASD            fire Space        heavy G      dash LShift     boost F            special E          aux R          focus Q
 *   keyboard right    move arrows          fire / Num0       heavy ; Num5 dash RShift Num.  boost . Num3     special Enter      aux ' Num2     focus RCtrl Num1
 *   pad               move stick / d-pad   fire RT (R2)      heavy X RB (□ R1)  dash A (✕)      boost LT analog (L2)   special Y (△)   aux LB (L1)   focus B (○) or L3
 *
 * On a pad, fire is held on the right trigger, so the thumb is free: dash on A, the heavies on X
 * next to it (dash, then the heavy, is the dash-strike, one roll of the thumb). With fire on a
 * face button, every dash let go of the guns. RB fires the heavies too, for a finger.
 *
 * Aux is on a shoulder so it can be pressed (a parry is all timing) with fire held.
 *
 * Boost is analog on the left trigger (how far it's pulled), all or nothing on a key.
 *
 * Fire is held; heavy is pressed, a round at a time (see GunSpec.heavy).
 */

import type { Intent } from './sim/types';
import type { Frame, Netplay } from './net/netplay';

export type DeviceId = 'keys' | 'keys-left' | 'keys-right' | `pad${number}` | `net${number}`;

export interface MenuInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  start: boolean;
  /** A second action (turn a part, sell, swap). */
  alt: boolean;
  /** Shoulders: cycle tabs, hand parts over. */
  prev: boolean;
  next: boolean;
}

const held = new Set<string>();
const pressed = new Set<string>();

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  held.add(e.code);
  pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  anyKey = true;
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

let anyKey = false;

interface Scheme {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  fire: string[];
  heavy: string[];
  dash: string[];
  boost: string[];
  special: string[];
  aux: string[];
  focus: string[];
  confirm: string[];
  back: string[];
  start: string[];
  alt: string[];
  prev: string[];
  next: string[];
}

const SCHEMES: Record<'keys' | 'keys-left' | 'keys-right', Scheme> = {
  keys: {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    fire: ['KeyJ', 'KeyZ', 'Space'],
    heavy: ['KeyO', 'KeyN'],
    dash: ['KeyK', 'KeyX'],
    boost: ['KeyL', 'KeyC'],
    special: ['KeyI', 'KeyV'],
    aux: ['KeyU', 'KeyB'],
    focus: ['ShiftLeft', 'ShiftRight'],
    confirm: ['Enter', 'Space', 'KeyJ', 'KeyZ'],
    back: ['Escape', 'Backspace', 'KeyK', 'KeyX'],
    start: ['Escape', 'KeyP'],
    alt: ['KeyR', 'KeyI', 'KeyV'],
    prev: ['KeyQ'],
    next: ['KeyE', 'Tab'],
  },
  'keys-left': {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    fire: ['Space'],
    heavy: ['KeyG'],
    dash: ['ShiftLeft'],
    boost: ['KeyF'],
    special: ['KeyE'],
    aux: ['KeyR'],
    focus: ['KeyQ'],
    confirm: ['Space'],
    back: ['ShiftLeft', 'Escape'],
    start: ['Escape'],
    alt: ['KeyE', 'KeyR'],
    prev: ['KeyZ'],
    next: ['KeyX'],
  },
  'keys-right': {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    fire: ['Slash', 'Numpad0'],
    heavy: ['Semicolon', 'Numpad5'],
    dash: ['ShiftRight', 'NumpadDecimal'],
    boost: ['Period', 'Numpad3'],
    special: ['Enter', 'NumpadEnter'],
    aux: ['Quote', 'Numpad2'],
    focus: ['ControlRight', 'Numpad1'],
    confirm: ['Slash', 'Numpad0', 'Enter'],
    back: ['ShiftRight', 'Backspace'],
    start: ['KeyP'],
    alt: ['Period', 'NumpadEnter'],
    prev: ['Comma', 'Numpad4'],
    next: ['Quote', 'Numpad6'],
  },
};

const NO_INTENT: Intent = { x: 0, y: 0, fire: false, heavy: false, boost: 0, dash: false, special: false, aux: false, focus: false };
const NO_MENU: MenuInput = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, alt: false, prev: false, next: false };

const any = (codes: string[], set: Set<string>) => codes.some((c) => set.has(c));

/**
 * Presses are held for a moment (seconds), so one made a touch early (in the dash's recovery, a
 * frame before the special fills) still goes off on the first frame it can. The parry is kept
 * strict: a long buffer would catch bullets you didn't time.
 */
const BUFFER = { dash: 0.1, heavy: 0.1, special: 0.1, aux: 0.05 };
type Buffered = keyof typeof BUFFER;
const buffered = new Map<string, number>();
/** A press now, or one still buffered. */
function buffer(dev: DeviceId, a: Buffered, now: boolean) {
  const k = `${dev}:${a}`;
  if (now) buffered.set(k, BUFFER[a]);
  return (buffered.get(k) ?? 0) > 0;
}

interface PadState {
  buttons: boolean[];
  /** Stick pushed past the menu threshold, per direction, last frame. */
  dirs: boolean[];
}
const padPrev = new Map<number, PadState>();
const padNow = new Map<number, Gamepad>();
/** Seconds a menu direction has been held, for auto-repeat. */
const repeat = new Map<string, number>();

function pads(): Gamepad[] {
  return (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g && g.connected);
}

const btn = (g: Gamepad, i: number) => !!g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5);
/** How far an analog button (a trigger) is pulled, 0..1, with a little dead zone. */
const pull = (g: Gamepad, i: number) => {
  const b = g.buttons[i];
  if (!b) return 0;
  const v = b.value || (b.pressed ? 1 : 0);
  return v < 0.08 ? 0 : Math.min(1, (v - 0.08) / 0.85);
};

function stick(g: Gamepad) {
  let x = g.axes[0] ?? 0;
  let y = g.axes[1] ?? 0;
  const l = Math.hypot(x, y);
  // a radial dead zone, rescaled so the edge of it is zero
  const k = l < 0.22 ? 0 : Math.min(1, (l - 0.22) / 0.7) / l;
  x *= k;
  y *= k;
  // the d-pad wins over the stick (and works without it)
  if (btn(g, 14)) x = -1;
  if (btn(g, 15)) x = 1;
  if (btn(g, 12)) y = -1;
  if (btn(g, 13)) y = 1;
  // pads without the standard mapping: the d-pad as a hat switch on axis 9 (or axes 6/7)
  if (g.mapping !== 'standard') {
    const hat = g.axes[9];
    if (hat !== undefined && hat >= -1.05 && hat <= 1.05) {
      // eight positions, clockwise from up at -1, in steps of 2/7
      const i = Math.round((hat + 1) / (2 / 7));
      if (i >= 0 && i <= 7) {
        x = [0, 1, 1, 1, 0, -1, -1, -1][i];
        y = [-1, -1, 0, 1, 1, 1, 0, -1][i];
      }
    } else if (g.axes.length >= 8 && (Math.abs(g.axes[6]) > 0.5 || Math.abs(g.axes[7]) > 0.5)) {
      x = Math.round(g.axes[6]);
      y = Math.round(g.axes[7]);
    }
  }
  return { x, y };
}

class Input {
  /** Set by the game at the start of each frame. */
  dt = 1 / 60;
  /** Online co-op: the players are `net0` and `net1`, and the local keyboard and pads only feed the input sent. */
  net: Netplay | null = null;

  /** Online: what this player is doing now, over the keyboard and every pad at once. */
  sampleLocal(): Frame {
    const devs: DeviceId[] = ['keys', ...this.padIds()];
    const ints = devs.map((d) => this.intent(d));
    const menus = devs.map((d) => this.menu(d));
    const i = { ...ints[0] };
    for (const o of ints.slice(1)) {
      if (Math.hypot(o.x, o.y) > Math.hypot(i.x, i.y)) [i.x, i.y] = [o.x, o.y];
      i.boost = Math.max(i.boost, o.boost);
      for (const k of ['fire', 'heavy', 'dash', 'special', 'aux', 'focus'] as const) i[k] ||= o[k];
    }
    const m = { ...menus[0] };
    for (const o of menus.slice(1)) for (const k of Object.keys(m) as (keyof MenuInput)[]) m[k] ||= o[k];
    return { i, m, a: devs.map((d) => this.aim(d)).find((a) => a) ?? null };
  }

  /** The device a player actually has in hand, for the names of its buttons (online, a partner's is taken as keys). */
  shown(dev: DeviceId): DeviceId {
    if (!dev.startsWith('net')) return dev;
    return this.net?.isMine(dev) ? (this.padIds()[0] ?? 'keys') : 'keys';
  }

  /** Call once at the start of each frame, before reading. */
  poll(dt: number) {
    this.dt = dt;
    padNow.clear();
    for (const g of pads()) padNow.set(g.index, g);
  }

  /** Call once at the end of each frame. */
  endFrame() {
    pressed.clear();
    for (const [k, t] of buffered) {
      if (t - this.dt <= 0) buffered.delete(k);
      else buffered.set(k, t - this.dt);
    }
    anyKey = false;
    for (const [i, g] of padNow) {
      const s = stick(g);
      padPrev.set(i, { buttons: g.buttons.map((_, k) => btn(g, k)), dirs: [s.y < -0.5, s.y > 0.5, s.x < -0.5, s.x > 0.5] });
    }
  }

  padIds(): DeviceId[] {
    return [...padNow.keys()].map((i) => `pad${i}` as DeviceId);
  }

  padName(id: DeviceId) {
    if (id.startsWith('net') && !this.net?.isMine(id)) return 'ONLINE';
    id = this.shown(id);
    if (!id.startsWith('pad')) return 'KEYBOARD';
    const g = padNow.get(Number(id.slice(3)));
    if (!g) return 'PAD';
    const n = g.id.toLowerCase();
    if (n.includes('dualsense') || n.includes('054c') || n.includes('playstation') || n.includes('wireless controller')) return 'PS PAD';
    if (n.includes('xbox') || n.includes('045e') || n.includes('xinput')) return 'XBOX PAD';
    return 'PAD';
  }

  /** The heavy button on a player's device, as a prompt names it. */
  heavyKey(dev: DeviceId) {
    dev = this.shown(dev);
    if (dev === 'keys') return 'O';
    if (dev === 'keys-left') return 'G';
    if (dev === 'keys-right') return ';';
    return this.padName(dev) === 'PS PAD' ? 'SQUARE' : 'X';
  }

  /** What a player's device asks of their ship. */
  intent(dev: DeviceId): Intent {
    if (dev.startsWith('net')) return { ...(this.net?.frame(dev).i ?? NO_INTENT) };
    if (dev.startsWith('pad')) {
      const g = padNow.get(Number(dev.slice(3)));
      if (!g) return { ...NO_INTENT };
      const s = stick(g);
      const prev = padPrev.get(g.index)?.buttons ?? [];
      const edge = (...is: number[]) => is.some((i) => btn(g, i) && !prev[i]);
      return {
        x: s.x,
        y: -s.y,
        fire: pull(g, 7) > 0.2,
        heavy: buffer(dev, 'heavy', edge(2, 5)),
        boost: pull(g, 6),
        dash: buffer(dev, 'dash', edge(0)),
        special: buffer(dev, 'special', edge(3)),
        aux: buffer(dev, 'aux', edge(4)),
        focus: btn(g, 1) || btn(g, 10),
      };
    }
    const k = SCHEMES[dev as keyof typeof SCHEMES];
    return {
      x: (any(k.right, held) ? 1 : 0) - (any(k.left, held) ? 1 : 0),
      y: (any(k.up, held) ? 1 : 0) - (any(k.down, held) ? 1 : 0),
      fire: any(k.fire, held),
      heavy: buffer(dev, 'heavy', any(k.heavy, pressed)),
      boost: any(k.boost, held) ? 1 : 0,
      dash: buffer(dev, 'dash', any(k.dash, pressed)),
      special: buffer(dev, 'special', any(k.special, pressed)),
      aux: buffer(dev, 'aux', any(k.aux, pressed)),
      focus: any(k.focus, held),
    };
  }

  /** A pad's right stick, as a direction on the deck (+z down the screen); null off a pad or centred. */
  aim(dev: DeviceId): { x: number; z: number } | null {
    if (dev.startsWith('net')) return this.net?.frame(dev).a ?? null;
    if (!dev.startsWith('pad')) return null;
    const g = padNow.get(Number(dev.slice(3)));
    const x = g?.axes[2] ?? 0;
    const z = g?.axes[3] ?? 0;
    return Math.hypot(x, z) > 0.35 ? { x, z } : null;
  }

  /** Menu presses this frame from a device (directions repeat when held). */
  menu(dev: DeviceId): MenuInput {
    if (dev.startsWith('net')) return { ...(this.net?.frame(dev).m ?? NO_MENU) };
    const out: MenuInput = { up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, alt: false, prev: false, next: false };
    let dirs: boolean[];
    if (dev.startsWith('pad')) {
      const g = padNow.get(Number(dev.slice(3)));
      if (!g) return out;
      const s = stick(g);
      const prev = padPrev.get(g.index);
      const pb = prev?.buttons ?? [];
      const edge = (i: number) => btn(g, i) && !pb[i];
      dirs = [s.y < -0.5, s.y > 0.5, s.x < -0.5, s.x > 0.5];
      out.confirm = edge(0);
      out.back = edge(1);
      out.start = edge(9);
      out.alt = edge(3) || edge(2);
      out.prev = edge(4);
      out.next = edge(5);
    } else {
      const k = SCHEMES[dev as keyof typeof SCHEMES];
      // a tap shorter than a frame is still a press
      const tapped = [k.up, k.down, k.left, k.right].map((c) => any(c, pressed));
      tapped.forEach((t, i) => t && repeat.delete(`${dev}:${['up', 'down', 'left', 'right'][i]}`));
      dirs = [k.up, k.down, k.left, k.right].map((c, i) => tapped[i] || any(c, held));
      out.confirm = any(k.confirm, pressed);
      out.back = any(k.back, pressed) && !out.confirm;
      out.start = any(k.start, pressed);
      out.alt = any(k.alt, pressed) && !out.confirm;
      out.prev = any(k.prev, pressed);
      out.next = any(k.next, pressed);
    }
    const names = ['up', 'down', 'left', 'right'] as const;
    names.forEach((n, i) => {
      const key = `${dev}:${n}`;
      if (!dirs[i]) {
        repeat.delete(key);
        return;
      }
      const t = repeat.get(key);
      if (t === undefined) {
        out[n] = true;
        repeat.set(key, 0);
      } else {
        const nt = t + this.dt;
        repeat.set(key, nt);
        // after a pause, it repeats
        if (nt > 0.35 && Math.floor((nt - 0.35) / 0.09) !== Math.floor((t - 0.35) / 0.09)) out[n] = true;
      }
    });
    return out;
  }

  /** Every device that pressed its confirm/fire this frame (for joining in). */
  joining(): DeviceId[] {
    const out: DeviceId[] = [];
    if (this.net) return out;
    // only the buttons: running menu() here would eat the first press of a direction
    for (const [i, g] of padNow) {
      const pb = padPrev.get(i)?.buttons ?? [];
      if ([0, 9].some((k) => btn(g, k) && !pb[k])) out.push(`pad${i}` as DeviceId);
    }
    if (any(SCHEMES.keys.confirm, pressed)) out.push('keys');
    return out;
  }

  get anyKey() {
    return anyKey || [...padNow.values()].some((g) => g.buttons.some((_, i) => btn(g, i) && !padPrev.get(g.index)?.buttons[i]));
  }

  /** Whether a key went down this frame. */
  keyPressed(code: string) {
    return !this.net && pressed.has(code);
  }

  /** Whether a key-based device has its fire key held (for keyboard pairs). */
  keyHeld(code: string) {
    return !this.net && held.has(code);
  }
}

export const input = new Input();
export { SCHEMES };
