/**
 * Online co-op in lockstep. Both browsers run the whole game (title, flights, hangar, chart, all of
 * it) from the same seed, and all that crosses the wire is each player's input: a tick of it, sent
 * a few ticks ahead (the delay), so it's there by the time it's needed. The game only steps a tick
 * once it has both players' input for it, at a fixed 60 a second, and with the same input and the
 * same seed the two come out the same. Every second each side hashes what matters and compares.
 *
 * The players are the devices `net0` (the host) and `net1`; input.ts answers for them from here.
 * Everything a player does goes through those: the local keyboard and pads only feed the frame sent.
 */

import type { Intent } from '../sim/types';
import type { DeviceId, MenuInput } from '../input';

export const TICK = 1 / 60;

export interface Frame {
  i: Intent;
  m: MenuInput;
  a: { x: number; z: number } | null;
}

const INTENT_BITS = ['fire', 'heavy', 'dash', 'special', 'aux', 'focus'] as const;
const MENU_BITS = ['up', 'down', 'left', 'right', 'confirm', 'back', 'start', 'alt', 'prev', 'next'] as const;

/** A frame as it goes over the wire: [x, y, boost, intent bits, menu bits, aim x, aim z]. */
type Packed = [number, number, number, number, number, number?, number?];

function pack(f: Frame): Packed {
  let ib = 0;
  INTENT_BITS.forEach((k, n) => f.i[k] && (ib |= 1 << n));
  let mb = 0;
  MENU_BITS.forEach((k, n) => f.m[k] && (mb |= 1 << n));
  const p: Packed = [f.i.x, f.i.y, f.i.boost, ib, mb];
  if (f.a) p.push(f.a.x, f.a.z);
  return p;
}

function unpack(p: Packed): Frame {
  const i = { x: p[0], y: p[1], boost: p[2] } as Intent;
  INTENT_BITS.forEach((k, n) => (i[k] = !!(p[3] & (1 << n))));
  const m = {} as MenuInput;
  MENU_BITS.forEach((k, n) => (m[k] = !!(p[4] & (1 << n))));
  return { i, m, a: p.length > 5 ? { x: p[5]!, z: p[6]! } : null };
}

const IDLE: Frame = unpack([0, 0, 0, 0, 0]);

/** How often (ticks) the two compare hashes. */
const CHECK = 60;

export class Netplay {
  /** The next tick to step. */
  tick = 0;
  /** Real time owed to the steps. */
  acc = 0;
  /** Seconds spent waiting on the partner's input. */
  waiting = 0;
  gone = false;
  desync = false;
  /** Each player's input, by tick. */
  private frames: Map<number, Frame>[] = [new Map(), new Map()];
  private hashes = new Map<number, number>();
  private theirHashes = new Map<number, number>();

  constructor(
    private ws: WebSocket,
    /** 0 the host, 1 the guest. */
    readonly me: number,
    readonly seed: number,
    /** Ticks between sampling input and stepping with it. */
    readonly delay: number,
  ) {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data));
      if (msg.t === 'f') this.frames[1 - me].set(msg.k, unpack(msg.f));
      else if (msg.t === 'h') {
        this.theirHashes.set(msg.k, msg.h);
        this.compare(msg.k);
      } else if (msg.t === 'left') this.gone = true;
    });
    ws.addEventListener('close', () => (this.gone = true));
  }

  /** This player's device, and the partner's. */
  get mine(): DeviceId {
    return `net${this.me}`;
  }

  isMine(dev: DeviceId) {
    return dev === this.mine;
  }

  /** The input a player's device gives in the tick being stepped. */
  frame(dev: DeviceId): Frame {
    const who = Number(dev.slice(3));
    return this.frames[who]?.get(this.tick) ?? IDLE;
  }

  /** Whether this player's input for the tick `delay` ahead is in already. */
  get sampled() {
    return this.frames[this.me].has(this.tick + this.delay);
  }

  /** Whether both players' input for the next tick is in (the first few ticks are idle for both). */
  get ready() {
    return this.tick < this.delay || (this.frames[0].has(this.tick) && this.frames[1].has(this.tick));
  }

  /** Records what this player is doing now, for the tick `delay` ahead, and sends it. */
  sample(f: Frame) {
    const k = this.tick + this.delay;
    const p = pack(f);
    // the same rounding both sides see
    this.frames[this.me].set(k, unpack(p));
    this.send({ t: 'f', k, f: p });
  }

  /** After a tick is stepped: drop its input, and now and then compare hashes. */
  stepped(hash: () => number) {
    for (const f of this.frames) f.delete(this.tick);
    if (this.tick % CHECK === 0) {
      const h = hash();
      this.hashes.set(this.tick, h);
      this.send({ t: 'h', k: this.tick, h });
      this.compare(this.tick);
    }
    this.tick++;
  }

  private compare(k: number) {
    const a = this.hashes.get(k);
    const b = this.theirHashes.get(k);
    if (a === undefined || b === undefined) return;
    if (a !== b && !this.desync) {
      this.desync = true;
      console.warn(`[net] out of sync at tick ${k}: ${a} here, ${b} there`);
    }
    this.hashes.delete(k);
    this.theirHashes.delete(k);
  }

  private send(msg: unknown) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.ws.close();
  }
}

/** A running hash over numbers (FNV-1a over their bits). */
export function hashNums(nums: number[]): number {
  const f = new Float64Array(nums);
  const b = new Uint8Array(f.buffer);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 0x01000193);
  return h >>> 0;
}
