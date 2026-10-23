/**
 * The new kit: two aux verbs, two skins over the hull and four bombs (see docs/parts-variety.md).
 * Each does one thing nobody else does, and has a pilot who'll love it.
 *
 * AUX
 * - BULWARK (hold): a wall in front stops every bullet and beam that comes at it, but you crawl
 *   behind it and it fills. Let go (or it's full) and it throws what it took as one blast ahead.
 * - SWAP BEACON (press twice): throw a beacon; press again and you change places with it. The
 *   beacon is left where you were, and what was coming for you hits it instead: it bursts, and
 *   throws what it caught back at them.
 *
 * SKINS (fittings)
 * - ABLATIVE: three thin layers over the hull. Each soaks a hit and goes in a spray of shrapnel.
 *   They grow back one a takedown: a shield you earn by killing.
 * - STATIC: every graze charges it. The next thing that touches you, or that you touch, gets the
 *   charge as lightning.
 *
 * BOMBS (specials)
 * - CARPET: bomblets rain behind you for 2 s; you fly the line you want bombed.
 * - CRYO: everything on screen freezes, bullets too. Frozen bullets hang where they are (still
 *   deadly) and fall as snow when it lets go.
 * - GRAVITY WELL: drags everything near into a knot ahead of you, then lets go: they fly apart into
 *   each other (flung bodies are blows, see arsenal.ts).
 * - DRONE WING: four drones fly with you for 8 s, each copying your trigger gun.
 */

import type { Bullet, Level, Player } from './level';
import type { Intent } from './types';
import { DT, HALF_W } from './types';
import { armShot, chill, shove } from './arsenal';

// The numbers.
export const BULWARK = { hold: 4, full: 30, slow: 0.6, reach: 4, width: 4.2, dmg: 12, each: 2.5, cd: 6 };
export const BEACON = { throw: 11, life: 6, catch: 1.0, eat: 1.6, dmg: 10, each: 8, back: 12, r: 6, cd: 5, fizzle: 3 };
export const ABLATIVE = { layers: 3, shards: 10, dmg: 6 };
export const STATIC = { max: 8, dmg: 7, touch: 1.4 };
export const CARPET = { time: 2, every: 0.08, fuse: 0.45, r: 3.4, dmg: 18 };
export const CRYO = { time: 2 };
export const WELL = { ahead: 14, r: 15, pull: 1.2, eat: 3, dmg: 28, fling: 1.6 };
export const DRONES = { time: 8, dmg: 0.4, at: [[-3.2, 1.2], [3.2, 1.2], [-5.8, 2.8], [5.8, 2.8]] as const };

/** What the kit tells the view. */
export type KitWhat =
  | 'wallUp' | 'wallBlock' | 'wallThrow' | 'beacon' | 'swap' | 'beaconBurst' | 'beaconFizzle'
  | 'layerBreak' | 'layerGrow' | 'charge' | 'zap' | 'drop' | 'bomblet' | 'snow' | 'wellBurst' | 'dronesGone';

/** What a ship carries of the kit. */
export interface ShipKit {
  /** The Bulwark up: bullets it's taken. */
  wall: { n: number } | null;
  /** The Swap Beacon out (world position, seconds out). */
  beacon: { x: number; z: number; t: number } | null;
  /** The aux button last frame (for the beacon's second press). */
  held: boolean;
  layers: number;
  charge: number;
  carpet: number;
  drop: number;
  drones: { x: number; z: number; cd: number; fired: number }[];
  droneT: number;
}

/** What's out in the world: bomblets falling, the well, frozen bullets, beacons left behind. */
export interface WorldKit {
  bomblets: { x: number; z: number; t: number; owner: number; dmg: number }[];
  well: { x: number; z: number; t: number; owner: number; k: number } | null;
  frozen: Map<Bullet, { x: number; z: number }>;
  frozenT: number;
  /** A beacon left where you were: what comes for you hits it. */
  husks: { x: number; z: number; t: number; n: number; owner: number }[];
}

const ships = new WeakMap<Player, ShipKit>();
const worlds = new WeakMap<Level, WorldKit>();

export function shipKit(p: Player): ShipKit {
  let k = ships.get(p);
  if (!k) ships.set(p, (k = { wall: null, beacon: null, held: false, layers: p.stats.skin === 'ablative' ? ABLATIVE.layers : 0, charge: 0, carpet: 0, drop: 0, drones: [], droneT: 0 }));
  return k;
}

export function worldKit(lv: Level): WorldKit {
  let w = worlds.get(lv);
  if (!w) worlds.set(lv, (w = { bomblets: [], well: null, frozen: new Map(), frozenT: 0, husks: [] }));
  return w;
}

const setCd = (p: Player, t: number) => {
  p.auxCd = p.auxMax = t / Math.min(1, Math.max(0.5, p.stats.auxStr));
};

// ── the aux ──────────────────────────────────────────────────────────────────────────────────

/** The aux button pressed with a kit aux fitted (true: it was ours). */
export function kitAux(lv: Level, p: Player, i: Intent): boolean {
  const s = p.stats;
  const k = shipKit(p);
  if (s.aux === 'bulwark') {
    p.auxT = BULWARK.hold;
    k.wall = { n: 0 };
    lv.emit({ type: 'kit', id: p.id, what: 'wallUp', x: p.x, z: p.z });
    return true;
  }
  if (s.aux === 'beacon') {
    // thrown the way you're pushing (ahead if you're not)
    const dl = Math.hypot(i.x, i.y);
    const fx = dl > 0.2 ? i.x / dl : 0;
    const fz = dl > 0.2 ? -i.y / dl : -1;
    const x = Math.max(-HALF_W + 2, Math.min(HALF_W - 2, p.x + fx * BEACON.throw));
    const z = Math.max(lv.top + 3, Math.min(lv.bottom - 3, p.z + fz * BEACON.throw));
    k.beacon = { x, z, t: 0 };
    k.held = true;
    p.auxT = BEACON.life;
    lv.emit({ type: 'kit', id: p.id, what: 'beacon', x: p.x, z: p.z, x2: x, z2: z });
    return true;
  }
  return false;
}

/** Every frame, before the aux button's read: the wall, the beacon, the skins, the drones. */
export function kitShip(lv: Level, p: Player, i: Intent, dz: number) {
  const s = p.stats;
  const k = shipKit(p);
  if (p.down) {
    k.wall = null;
    k.beacon = null;
    k.drones = [];
    return;
  }
  // ── the Bulwark: crawl behind it, it takes what comes, let go and it throws it
  if (k.wall) {
    p.x -= p.vx * DT * BULWARK.slow;
    p.z -= p.vz * DT * BULWARK.slow;
    for (const b of lv.bullets) {
      if (b.dead) continue;
      const ax = b.x - p.x;
      const az = b.z - p.z;
      if (az < -BULWARK.reach - 1 || az > 0.6 || Math.abs(ax) > BULWARK.width) continue;
      lv.cancel(b);
      k.wall.n++;
      lv.emit({ type: 'kit', id: p.id, what: 'wallBlock', x: b.x, z: b.z, n: k.wall.n });
    }
    if (!i.aux || p.auxT <= DT || k.wall.n >= BULWARK.full) wallThrow(lv, p, k);
  }
  // ── the Swap Beacon: carried along with the screen; the second press swaps
  if (k.beacon) {
    k.beacon.t += DT;
    k.beacon.z -= dz;
    const press = i.aux && !k.held;
    if (press) swap(lv, p, k);
    else if (p.auxT <= DT) {
      lv.emit({ type: 'kit', id: p.id, what: 'beaconFizzle', x: k.beacon.x, z: k.beacon.z });
      k.beacon = null;
      p.auxT = 0;
      setCd(p, BEACON.fizzle);
    }
  }
  k.held = i.aux;
  // ── the Static Skin: whatever comes close enough to touch gets it
  if (s.skin === 'static' && k.charge > 0)
    for (const e of lv.enemies) {
      if (e.dead || e.t < 0 || e.state === 'hidden' || e.ground) continue;
      const r = e.r + s.core + STATIC.touch;
      if ((e.x - p.x) ** 2 + (e.z - p.z) ** 2 < r * r) {
        discharge(lv, p, k);
        break;
      }
    }
  // ── Carpet: bomblets dropped behind as you go
  if (k.carpet > 0) {
    k.carpet -= DT;
    k.drop -= DT;
    if (k.drop <= 0) {
      k.drop = CARPET.every;
      const w = worldKit(lv);
      const x = p.x + (Math.random() - 0.5) * 1.6;
      const z = p.z + 1.2;
      w.bomblets.push({ x, z, t: 0, owner: p.id, dmg: CARPET.dmg });
      lv.emit({ type: 'kit', id: p.id, what: 'drop', x, z });
    }
  }
  // ── the Drone Wing: in formation, each firing a copy of the trigger gun
  if (k.droneT > 0) {
    k.droneT -= DT;
    if (k.droneT <= 0) {
      lv.emit({ type: 'kit', id: p.id, what: 'dronesGone', x: p.x, z: p.z });
      k.drones = [];
    } else droneWing(lv, p, k);
  }
}

function wallThrow(lv: Level, p: Player, k: ShipKit) {
  const n = k.wall!.n;
  k.wall = null;
  p.auxT = 0;
  setCd(p, BULWARK.cd);
  // everything ahead in a widening cone takes what the wall took, as one blow
  const dmg = (BULWARK.dmg + BULWARK.each * n) * Math.max(0.5, p.stats.auxStr);
  lv.emit({ type: 'kit', id: p.id, what: 'wallThrow', x: p.x, z: p.z - 2, n });
  lv.credited('BULWARK', () =>
    lv.asBlow(() => {
      for (const e of lv.enemies) {
        if (e.dead || e.t < 0 || !lv.seen(e)) continue;
        const ax = e.x - p.x;
        const az = p.z - e.z;
        if (az < -1 || az > 40 || Math.abs(ax) > 4 + az * 0.35 + e.r) continue;
        lv.damage(e, dmg, p.id, false);
        if (!e.dead) shove(lv, e, ax / (Math.hypot(ax, az) || 1), -0.8, 0.4, p.id);
      }
    }),
  );
}

function swap(lv: Level, p: Player, k: ShipKit) {
  const b = k.beacon!;
  const ox = p.x;
  const oz = p.z;
  p.x = Math.max(-HALF_W + 1.2, Math.min(HALF_W - 1.2, b.x));
  p.z = Math.max(lv.top + 3, Math.min(lv.bottom - 2, b.z));
  p.inv = Math.max(p.inv, 0.3);
  k.beacon = null;
  p.auxT = 0;
  setCd(p, BEACON.cd);
  // the beacon's left where you were: what was coming for you is coming for it
  worldKit(lv).husks.push({ x: ox, z: oz, t: 0, n: 0, owner: p.id });
  lv.emit({ type: 'kit', id: p.id, what: 'swap', x: ox, z: oz, x2: p.x, z2: p.z });
}

/** Is the Bulwark up against a beam from up the screen at `z`? */
export function kitWalls(p: Player, z: number) {
  return !!ships.get(p)?.wall && z < p.z;
}

// ── the skins ────────────────────────────────────────────────────────────────────────────────

/** A hit about to land: an Ablative layer soaks it (true: it's taken care of), Static lets go. */
export function kitSoak(lv: Level, p: Player, x: number, z: number): boolean {
  const k = shipKit(p);
  if (p.stats.skin === 'static' && k.charge > 0) discharge(lv, p, k);
  if (p.stats.skin !== 'ablative' || k.layers <= 0) return false;
  k.layers--;
  p.inv = Math.max(p.inv, 0.8);
  p.shieldWait = 0;
  // the layer goes in a spray of shrapnel, all ways
  const a0 = Math.random() * Math.PI * 2;
  for (let j = 0; j < ABLATIVE.shards; j++) {
    const s = lv.addShot(p.id, 'pellet', p.x, p.z, a0 + (j / ABLATIVE.shards) * Math.PI * 2, 42, ABLATIVE.dmg, 0.35, 0, 0);
    s.src = 'ablative';
  }
  lv.emit({ type: 'kit', id: p.id, what: 'layerBreak', x, z, n: k.layers });
  return true;
}

/** A takedown: an Ablative layer grows back. */
export function kitTakedown(lv: Level, p: Player) {
  const k = shipKit(p);
  if (p.stats.skin !== 'ablative' || k.layers >= ABLATIVE.layers) return;
  k.layers++;
  lv.emit({ type: 'kit', id: p.id, what: 'layerGrow', x: p.x, z: p.z, n: k.layers });
}

/** A graze: the Static Skin takes a charge. */
export function kitGraze(lv: Level, p: Player) {
  if (p.stats.skin !== 'static') return;
  const k = shipKit(p);
  if (k.charge >= STATIC.max) return;
  k.charge++;
  lv.emit({ type: 'kit', id: p.id, what: 'charge', x: p.x, z: p.z, n: k.charge });
}

function discharge(lv: Level, p: Player, k: ShipKit) {
  const n = k.charge;
  k.charge = 0;
  lv.emit({ type: 'kit', id: p.id, what: 'zap', x: p.x, z: p.z, n });
  lv.credited('STATIC', () => lv.arc(p.id, p.x, p.z, STATIC.dmg * n, 1 + Math.floor(n / 2), { reach: 14 }));
}

// ── the bombs ────────────────────────────────────────────────────────────────────────────────

/** The special pressed with a kit bomb fitted. */
export function kitSpecial(lv: Level, p: Player, kind: string, k: number) {
  const s = shipKit(p);
  const w = worldKit(lv);
  if (kind === 'carpet') {
    s.carpet = CARPET.time * k;
    s.drop = 0;
    p.inv = Math.max(p.inv, 0.5);
  } else if (kind === 'cryo') {
    // everything on screen stops dead
    for (const e of lv.enemies) if (!e.dead && e.t >= 0 && lv.seen(e)) chill(lv, e, 99, p.id);
    w.frozen.clear();
    for (const b of lv.bullets) if (!b.dead && lv.onScreen(b.x, b.z)) w.frozen.set(b, { x: b.x, z: b.z });
    w.frozenT = CRYO.time * k;
    p.inv = Math.max(p.inv, 1);
  } else if (kind === 'gravity') {
    w.well = { x: p.x, z: p.z - WELL.ahead, t: 0, owner: p.id, k };
    p.inv = Math.max(p.inv, 0.5);
  } else if (kind === 'drones') {
    s.droneT = DRONES.time * k;
    s.drones = DRONES.at.map(([x, z]) => ({ x: p.x + x * 0.3, z: p.z + z * 0.3, cd: Math.random() * 0.1, fired: -1 }));
  }
}

function droneWing(lv: Level, p: Player, k: ShipKit) {
  const g = p.stats.guns.find((o) => !o.heavy && !o.spec.auto) ?? p.stats.guns[0];
  k.drones.forEach((d, j) => {
    const [ox, oz] = DRONES.at[j];
    // they hang off the wings, a beat behind every turn
    const tx = p.x + ox;
    const tz = p.z + oz;
    d.x += (tx - d.x) * Math.min(1, 9 * DT);
    d.z += (tz - d.z) * Math.min(1, 9 * DT);
    if (!g || !p.firing) return;
    d.cd -= DT;
    if (d.cd > 0) return;
    const sp = g.spec;
    d.cd = 1 / Math.max(0.5, sp.rate);
    d.fired = lv.time;
    const dmg = sp.damage * DRONES.dmg;
    lv.credited('DRONES', () => {
      if (sp.shot === 'arc') return lv.arc(p.id, d.x, d.z - 0.6, dmg, 2);
      const kind = sp.shot === 'beam' ? 'slug' : sp.shot;
      const n = sp.count;
      for (let m = 0; m < n; m++) {
        const off = n === 1 ? 0 : (m / (n - 1) - 0.5) * sp.spread;
        const s = lv.addShot(p.id, kind, d.x, d.z - 0.6, off, kind === 'slug' && sp.shot === 'beam' ? 80 : sp.speed, dmg, sp.life, sp.pierce ?? 0, sp.homing ?? 0);
        s.src = g.part.id;
        s.marks = g.marks;
        s.markStr = g.markStr;
        s.edge = sp.edge;
        s.edgeMul = g.edgeMul;
        armShot(s, sp);
      }
    });
  });
}

/** Every frame, once the bullets have moved: bomblets, the well, the frozen, beacons left behind. */
export function kitWorld(lv: Level, dz: number) {
  const w = worlds.get(lv);
  if (!w) return;
  // bomblets: they fall a moment, then go
  for (let j = w.bomblets.length - 1; j >= 0; j--) {
    const b = w.bomblets[j];
    if ((b.t += DT) < CARPET.fuse) continue;
    w.bomblets.splice(j, 1);
    lv.emit({ type: 'kit', id: b.owner, what: 'bomblet', x: b.x, z: b.z });
    lv.credited('CARPET', () => lv.asBlow(() => lv.blast(b.x, b.z, CARPET.r, b.dmg, b.owner, { quiet: true })));
    // and it knocks bullets out of the air
    for (const u of lv.bullets) if (!u.dead && (u.x - b.x) ** 2 + (u.z - b.z) ** 2 < CARPET.r * CARPET.r) lv.cancel(u);
  }
  // the frozen: held where they hung (with the screen), till they fall as snow
  if (w.frozenT > 0) {
    w.frozenT -= DT;
    for (const [b, at] of w.frozen) {
      if (b.dead) {
        w.frozen.delete(b);
        continue;
      }
      at.z -= dz;
      b.x = at.x;
      b.z = at.z;
    }
    if (w.frozenT <= 0) {
      for (const b of w.frozen.keys()) {
        lv.emit({ type: 'kit', id: 0, what: 'snow', x: b.x, z: b.z });
        lv.cancel(b);
      }
      w.frozen.clear();
    }
  }
  // the well: everything near dragged into a knot, then thrown apart
  const g = w.well;
  if (g) {
    g.t += DT;
    g.z -= dz;
    if (g.t < WELL.pull * g.k) {
      const pull = Math.min(1, 5 * DT);
      for (const e of lv.enemies) {
        if (e.dead || e.t < 0 || e.ground || e.state === 'hidden') continue;
        const d2 = (e.x - g.x) ** 2 + (e.z - g.z) ** 2;
        if (d2 > WELL.r * WELL.r) continue;
        const k = e.boss ? 0.08 : e.elite ? 0.5 : 1;
        e.x += (g.x - e.x) * pull * k;
        e.z += (g.z - e.z) * pull * k;
        // caught in it, it can't aim: no shots, no tells piling up in the knot
        if (!e.boss) e.stun = Math.max(e.stun, DT * 2);
      }
      for (const b of lv.bullets) {
        if (b.dead) continue;
        const dx = g.x - b.x;
        const dzb = g.z - b.z;
        const d = Math.hypot(dx, dzb) || 1;
        // swallowed quietly: a pop each would light the knot up white
        if (d < WELL.eat) b.dead = true;
        else if (d < WELL.r) {
          // drawn in at a steady drift, so they read as caught, not as streaks
          b.vx += ((dx / d) * 32 - b.vx) * pull;
          b.vz += ((dzb / d) * 32 - b.vz) * pull;
        }
      }
    } else {
      w.well = null;
      lv.emit({ type: 'kit', id: g.owner, what: 'wellBurst', x: g.x, z: g.z });
      lv.credited('GRAVITY', () =>
        lv.asBlow(() => {
          for (const e of lv.enemies) {
            if (e.dead || e.t < 0) continue;
            const dx = e.x - g.x;
            const dzw = e.z - g.z;
            const d = Math.hypot(dx, dzw);
            if (d > WELL.r * 0.6 + e.r) continue;
            lv.damage(e, WELL.dmg * g.k, g.owner, false);
            // flung apart, into each other (a random way out of the dead middle)
            const a = d > 0.3 ? Math.atan2(dzw, dx) : Math.random() * Math.PI * 2;
            if (!e.dead) shove(lv, e, Math.cos(a), Math.sin(a), WELL.fling, g.owner);
          }
        }),
      );
    }
  }
  // beacons left behind: they catch what was meant for you, then burst with it
  for (let j = w.husks.length - 1; j >= 0; j--) {
    const h = w.husks[j];
    h.t += DT;
    h.z -= dz;
    for (const b of lv.bullets)
      if (!b.dead && (b.x - h.x) ** 2 + (b.z - h.z) ** 2 < BEACON.eat * BEACON.eat) {
        lv.cancel(b);
        h.n++;
      }
    if (h.t < BEACON.catch) continue;
    w.husks.splice(j, 1);
    lv.emit({ type: 'kit', id: h.owner, what: 'beaconBurst', x: h.x, z: h.z, n: h.n });
    lv.credited('BEACON', () => lv.asBlow(() => lv.blast(h.x, h.z, BEACON.r, BEACON.dmg, h.owner, { quiet: true })));
    // and what it caught goes back, each at the nearest thing that can take it
    const near = lv.enemies.filter((e) => !e.dead && e.t >= 0 && lv.seen(e)).sort((a, b) => (a.x - h.x) ** 2 + (a.z - h.z) ** 2 - ((b.x - h.x) ** 2 + (b.z - h.z) ** 2));
    for (let m = 0; m < Math.min(h.n, BEACON.back) && near.length; m++) {
      const e = near[m % Math.min(3, near.length)];
      const s = lv.addShot(h.owner, 'slug', h.x, h.z, Math.atan2(e.x - h.x, -(e.z - h.z)) + (Math.random() - 0.5) * 0.15, 55, BEACON.each, 1, 0, 1);
      s.src = 'BEACON';
      s.tag = 'mirror';
    }
  }
}

/** For the autopilot: whether to hold or press the aux, if it's one of ours (undefined if not). */
export function kitPilot(lv: Level, p: Player): boolean | undefined {
  const s = p.stats;
  if (s.aux !== 'bulwark' && s.aux !== 'beacon') return undefined;
  const k = shipKit(p);
  const ahead = lv.bullets.filter((b) => !b.dead && b.z < p.z + 1 && p.z - b.z < 18 && Math.abs(b.x - p.x) < 7).length;
  const near = lv.bullets.filter((b) => !b.dead && (b.x - p.x) ** 2 + (b.z - p.z) ** 2 < 6 * 6).length;
  if (s.aux === 'bulwark') {
    if (k.wall) return ahead > 0 || k.wall.n < 6;
    return p.auxCd <= 0 && ahead >= 5;
  }
  // the beacon: thrown when it's quiet, swapped to when it gets hot
  if (k.beacon) return k.held ? false : near >= 3 || k.beacon.t > BEACON.life - 0.5;
  return p.auxCd <= 0 && p.auxT <= 0 && near <= 1 && ahead >= 2;
}
