/**
 * A gun's firing loop, for the cards: a little ship at the foot of a dark well firing the gun's
 * real pattern (its rate, spread, speed, reach, kind of shot and quirks, from its GunSpec) at three
 * dummy plates, which flash and spark when hit. A card shows what a gun does, not just its numbers.
 *
 * It's a pure function of time: each gun's loop (a couple of seconds, seamless) is worked out once,
 * shot by shot, and kept by spec and size; drawing a frame only looks things up. Player shots are
 * rust and cream only (the colour contract, docs/backlog.md), drawn in whole pixels.
 */

import type { GunSpec, PartDef } from '../game/parts';

/** Rust and cream: what the players' fire is made of. */
const WHITE = '#fff8ec';
const CREAM = '#f0dcb0';
const HOT = '#ff9a52';
const RUST = '#c4562a';
const EMBER = '#6e3018';
/** The well, its drifting specks, the plates, the little ship. */
const INKWELL = '#16101f';
const SPECK = '#2e2442';
const PLATE = '#4a4258';
const PLATE_HI = '#6e6480';
const PLATE_LO = '#262030';
const HULL = '#8e86a0';
const HULL_LO = '#544c66';

/** How long a loop aims to be (s), and the step it's worked out in. */
const SPAN = 2.6;
const DT = 1 / 60;

/** A dummy plate: where it sits, or (a chaser, for mines) when it sets off from below and how fast. */
interface Plate {
  x: number;
  y: number;
  climb?: [number, number];
}
interface Burst {
  t: number;
  x: number;
  y: number;
  r: number;
}
interface Shot {
  t0: number;
  /** Where it is, every step, while it lives. */
  pts: number[];
  burst?: Burst;
}
interface Hit {
  t: number;
  p: number;
  x: number;
  y: number;
  /** Sparks: how hard it hit. */
  n: number;
}
/** An arc's jumps, or a rail's streak: points, struck at once. */
interface Bolt {
  t: number;
  pts: number[];
}

interface Plan {
  g: GunSpec;
  P: number;
  w: number;
  h: number;
  sy: number;
  pw: number;
  ph: number;
  big: boolean;
  /** Pale shots (a cool tint): cream bodies, not rust. */
  pale: boolean;
  x: (t: number) => number;
  plates: Plate[];
  shots: Shot[];
  hits: Hit[];
  bolts: Bolt[];
  streaks: Bolt[];
  fires: number[];
  beam?: [number, number];
  /** A heavy's taps, and how many rounds it holds. */
  taps?: number[];
}

const mod = (a: number, p: number) => ((a % p) + p) % p;
const hash = (i: number, j = 0) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** Where a plate is at `t` (a chaser below the well before it sets off). */
function plateAt(pl: Plan, j: number, t: number) {
  const p = pl.plates[j];
  if (!p.climb) return p;
  return { x: p.x, y: pl.h + pl.ph - Math.max(0, t - p.climb[0]) * p.climb[1] };
}

/** The first plate (not in `skip`) a point at `t` is inside, `r` round it; -1 if none. */
function struck(pl: Plan, x: number, y: number, t: number, r: number, skip: Set<number>) {
  for (let j = 0; j < pl.plates.length; j++) {
    if (skip.has(j)) continue;
    const q = plateAt(pl, j, t);
    if (Math.abs(x - q.x) <= pl.pw / 2 + r && Math.abs(y - q.y) <= pl.ph / 2 + r) return j;
  }
  return -1;
}

/** A blast: everything within `r` takes it. */
function blast(pl: Plan, t: number, x: number, y: number, r: number): Burst {
  for (let j = 0; j < pl.plates.length; j++) {
    const q = plateAt(pl, j, t);
    const dx = Math.max(0, Math.abs(x - q.x) - pl.pw / 2);
    const dy = Math.max(0, Math.abs(y - q.y) - pl.ph / 2);
    if (dx * dx + dy * dy <= r * r) pl.hits.push({ t, p: j, x: q.x, y: q.y + pl.ph / 2, n: 5 });
  }
  return { t, x, y, r };
}

/** One shot in flight, stepped until it lands, leaves or dies. */
function fly(pl: Plan, t0: number, x: number, y: number, ang: number, sp: number, life: number, n: number, aim = -1) {
  const g = pl.g;
  const pts: number[] = [];
  let vx = Math.sin(ang) * sp;
  let vy = -Math.cos(ang) * sp;
  const hit = new Set<number>();
  let bounces = g.bounce ?? 0;
  const turn = g.shot === 'missile' ? 5 : (g.homing ?? 0) * 2.5;
  const r = Math.max(0.5, (g.size ?? 1) * 0.8);
  let burst: Burst | undefined;
  for (let a = 0; a < life; a += DT) {
    pts.push(x, y);
    const t = t0 + a;
    if (turn) {
      // curve towards its plate (or the nearest it hasn't hit)
      let best = aim;
      if (best < 0 || hit.has(best)) {
        let d = Infinity;
        for (let j = 0; j < pl.plates.length; j++) {
          if (hit.has(j)) continue;
          const q = plateAt(pl, j, t);
          const dd = (q.x - x) ** 2 + (q.y - y) ** 2;
          if (dd < d) [d, best] = [dd, j];
        }
      }
      if (best >= 0 && a > 0.08) {
        const q = plateAt(pl, best, t);
        const want = Math.atan2(q.x - x, -(q.y - y));
        const now = Math.atan2(vx, -vy);
        let d = want - now;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const k = now + Math.max(-turn * DT, Math.min(turn * DT, d));
        vx = Math.sin(k) * sp;
        vy = -Math.cos(k) * sp;
      }
    }
    if (g.shot === 'mine') {
      // dropped behind, slowing to a drift
      sp = Math.max(4, sp * 0.95);
      vy = sp;
    }
    x += vx * DT;
    y += vy * DT;
    if (bounces > 0 && (x < 1 || x > pl.w - 2 || y < 1 || y > pl.h - 2)) {
      if (x < 1 || x > pl.w - 2) vx = -vx;
      if (y < 1 || y > pl.h - 2) vy = -vy;
      x = Math.max(1, Math.min(pl.w - 2, x));
      y = Math.max(1, Math.min(pl.h - 2, y));
      bounces--;
    } else if (x < -3 || x > pl.w + 3 || y < -3 || y > pl.h + 3) break;
    const j = struck(pl, x, y, t, g.shot === 'mine' ? 2 : r, hit);
    if (j < 0) continue;
    if (g.shot === 'flak' || g.shot === 'mine') {
      burst = blast(pl, t, x, y, (g.shot === 'flak' ? 9 : 6) * (pl.w / 36));
      break;
    }
    const q = plateAt(pl, j, t);
    pl.hits.push({ t, p: j, x, y: Math.min(y, q.y + pl.ph / 2), n });
    hit.add(j);
    if (g.shot === 'missile') burst = { t, x, y, r: 3 };
    if (hit.size > (g.pierce ?? 0)) break;
  }
  // a flak shell goes off at the end of its fuse
  if (!burst && g.shot === 'flak' && pts.length) burst = blast(pl, t0 + pts.length * DT, x, y, 9 * (pl.w / 36));
  pl.shots.push({ t0, pts, burst });
}

/** Works out a gun's loop at a size: where things sit, when it fires, every shot and hit. */
function plan(g: GunSpec, w: number, h: number): Plan {
  const pw = w >= 50 ? 9 : 7;
  const ph = w >= 50 ? 4 : 3;
  const mine = g.shot === 'mine';
  const sy = mine ? Math.round(h * 0.26) : h - 8;
  const moving = g.shot !== 'beam' && g.shot !== 'rail' && g.shot !== 'arc';
  const range = Math.max(1, g.speed * g.life);
  // px a world unit: the card's scale, zoomed in on a short-reach gun so its reach still shows
  const kk = moving ? Math.min(2.5, Math.max(w / 40, (h * 0.5) / range)) : w / 40;
  const D = moving ? Math.max(10, Math.min(range * kk * 0.8, sy - 6)) : sy - 6;
  const cx = w / 2;
  const u = w / 36;
  const tint = g.tint ?? 0;
  const lum = g.tint === undefined ? 0 : (0.3 * ((tint >> 16) & 255) + 0.59 * ((tint >> 8) & 255) + 0.11 * (tint & 255)) / 255;

  // when it fires: a steady stream, or HEAVY rounds tapped off and coming back one by one
  let P: number;
  let fires: number[];
  let taps: number[] | undefined;
  if (g.heavy) {
    let k = Math.min(g.heavy, 2);
    if (k / g.rate > 3) k = 1;
    const gap = mine ? 0.55 : 0.3;
    taps = Array.from({ length: k }, (_, j) => 0.2 + j * gap);
    fires = taps;
    P = Math.max(taps[k - 1] + 0.7, 0.2 + k / g.rate + 0.35);
  } else {
    const n = Math.max(1, Math.round(SPAN * g.rate));
    P = n / g.rate;
    fires = Array.from({ length: n }, (_, i) => i / g.rate);
  }

  // where the plates sit, and how the ship moves
  const plates: Plate[] = [];
  let x: (t: number) => number;
  if (mine) {
    // mines are for what chases you: it drops them, and the chasers climb into them
    const lane = [cx - Math.round(w * 0.2), cx + Math.round(w * 0.2)];
    const [a, b] = [taps![0], taps![taps!.length - 1]];
    x = (t) => (t < b ? lane[0] + (lane[1] - lane[0]) * smooth((t - a - 0.05) / Math.max(0.1, b - a - 0.1)) : lane[1] + (lane[0] - lane[1]) * smooth((t - b - 0.3) / Math.max(0.1, P - b - 0.4)));
    taps!.forEach((tp) => plates.push({ x: x(tp), y: h + ph, climb: [tp + 0.3, 22 * u] }));
  } else if (g.auto) {
    for (const [px, py] of [[0.24, 0.3], [0.74, 0.18], [0.6, 0.5]]) plates.push({ x: Math.round(w * px), y: Math.round(h * py) });
    x = (t) => cx + 3 * u * Math.sin((2 * Math.PI * t) / P);
  } else if (g.shot === 'arc' || g.shot === 'flak') {
    // a crowd: what jumps, and what bursts, wants them close together
    const cy = Math.max(Math.round(7 * u), Math.round(sy - (g.shot === 'arc' ? D * 0.65 : D)));
    for (const [dx, dy] of [[-6, 2], [6, 2], [0, -4]]) plates.push({ x: Math.round(cx + dx * u), y: Math.round(cy + dy * u) });
    x = () => cx;
  } else if (g.shot === 'beam' || g.shot === 'rail') {
    // a line: what it goes through shows
    for (let j = 0; j < 3; j++) plates.push({ x: Math.round(cx + (j % 2 ? 1 : -1) * (g.shot === 'beam' ? 1 : 0)), y: Math.round(sy - D * (0.35 + 0.3 * j)) });
    x = () => cx;
  } else {
    // a row, swept across (a heavy holds still)
    const sp = Math.max(pw + 3, Math.round(w * 0.28));
    for (let j = -1; j <= 1; j++) plates.push({ x: Math.round(cx + j * sp), y: Math.round(sy - D + (j ? 1 : 0)) });
    const sway = g.heavy ? 0 : sp;
    x = (t) => cx + sway * Math.sin((2 * Math.PI * t) / P);
  }

  const pl: Plan = { g, P, w, h, sy, pw, ph, big: !!g.heavy || g.damage >= 20, pale: lum > 0.72, x, plates, shots: [], hits: [], bolts: [], streaks: [], fires, taps };
  const n = Math.max(1, Math.min(5, Math.round(g.damage / 5)));

  if (g.shot === 'beam') {
    // a held beam: on most of the loop, ticking damage into all it crosses
    pl.beam = [0.1, P * 0.85];
    pl.fires = [];
    for (let t = pl.beam[0]; t < pl.beam[1]; t += 1 / g.rate)
      plates.forEach((q, j) => {
        if (Math.abs(x(t) - q.x) <= pw / 2 + 1) pl.hits.push({ t, p: j, x: x(t), y: q.y + ph / 2, n: 1 });
      });
    return pl;
  }

  fires.forEach((t, i) => {
    const mx = x(t);
    const my = sy - 1;
    if (g.shot === 'rail') {
      // there at once: through all in line it pierces, stopped by the first it doesn't
      const line = plates.map((q, j) => [q, j] as const).filter(([q]) => Math.abs(mx - q.x) <= pw / 2).sort((a, b) => b[0].y - a[0].y);
      const through = line.slice(0, (g.pierce ?? 0) + 1);
      for (const [q, j] of through) pl.hits.push({ t, p: j, x: mx, y: q.y + ph / 2, n });
      const stop = through.length < line.length || (g.pierce ?? 0) === 0 ? through[through.length - 1] : undefined;
      pl.streaks.push({ t, pts: [mx, my, mx, stop ? stop[0].y + ph / 2 : -2] });
    } else if (g.shot === 'arc') {
      // jumps to the nearest, then the next, then the next
      const pts = [mx, my];
      const seen = new Set<number>();
      let [ax, ay] = [mx, my];
      for (let k = 0; k < 3; k++) {
        let best = -1;
        let d = (h * 0.9) ** 2;
        plates.forEach((q, j) => {
          const dd = (q.x - ax) ** 2 + (q.y - ay) ** 2;
          if (!seen.has(j) && dd < d) [d, best] = [dd, j];
        });
        if (best < 0) break;
        seen.add(best);
        [ax, ay] = [plates[best].x, plates[best].y];
        pts.push(ax, ay);
        pl.hits.push({ t, p: best, x: ax, y: ay, n: 2 });
      }
      pl.bolts.push({ t, pts });
    } else {
      const sp = (g.shot === 'mine' ? 14 * u : g.speed * kk) * (g.shot === 'flame' ? 0.8 + 0.4 * hash(i, 3) : 1);
      const life = Math.min(g.life, P - 0.05);
      for (let c = 0; c < g.count; c++) {
        let ang = g.count > 1 ? (c / (g.count - 1) - 0.5) * g.spread : 0;
        if (g.shot === 'flame') ang = (hash(i, 1) - 0.5) * g.spread;
        if (g.shot === 'missile') ang *= 1.8;
        if (g.bounce) ang += 0.35 * Math.cos((2 * Math.PI * t) / P);
        let aim = g.shot === 'missile' ? (c + i) % plates.length : -1;
        if (g.auto) {
          aim = i % plates.length;
          const q = plates[aim];
          ang = Math.atan2(q.x - mx, -(q.y - my));
        }
        if (g.shot === 'mine') ang = Math.PI;
        fly(pl, t, mx, g.shot === 'mine' ? sy + 6 : my, ang, sp, life, g.shot === 'flame' ? 1 : n, aim);
      }
    }
  });
  return pl;
}

const plans = new Map<string, Plan>();
function planFor(g: GunSpec, w: number, h: number) {
  const key = `${w}x${h}:${JSON.stringify(g)}`;
  let p = plans.get(key);
  if (!p) {
    if (plans.size > 48) plans.clear();
    p = plan(g, w, h);
    plans.set(key, p);
  }
  return p;
}

/** A line in whole pixels. */
function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, dot = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  ctx.fillStyle = col;
  for (let k = 0; k <= n; k += dot) ctx.fillRect(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 1, 1);
}

/** The little ship, nose up at (x, y). */
const SHIP = ['...c...', '..hch..', '..hhh..', '.hhhhh.', 'hhlhlhh', 'h.l.l.h'];
function ship(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, long: boolean) {
  for (let r = 0; r < SHIP.length; r++)
    for (let c = 0; c < 7; c++) {
      const k = SHIP[r][c];
      if (k === '.') continue;
      ctx.fillStyle = k === 'c' ? CREAM : k === 'l' ? HULL_LO : HULL;
      ctx.fillRect(x - 3 + c, y + r, 1, 1);
    }
  // the engines
  const f = Math.floor(t * 30) % 2;
  ctx.fillStyle = HOT;
  ctx.fillRect(x - 1, y + 6, 1, 1 + f);
  ctx.fillRect(x + 1, y + 6, 1, 2 - f);
  if (long) {
    ctx.fillStyle = RUST;
    ctx.fillRect(x - 1, y + 7 + f, 1, 2);
    ctx.fillRect(x + 1, y + 8 - f, 1, 2);
  }
}

export interface LoopOpts {
  /** How much of the well it takes, from the foot up (a wipe in from the model); 1: all of it. */
  share?: number;
}

/**
 * Draws `def`'s gun firing, looping, into the `w`×`h` well at (x, y), at `t` seconds. Nothing if it
 * isn't a gun.
 */
export function gunLoop(ctx: CanvasRenderingContext2D, def: PartDef, x: number, y: number, w: number, h: number, t: number, o: LoopOpts = {}) {
  const g = def.gun;
  const share = o.share ?? 1;
  if (!g || share <= 0) return;
  const pl = planFor(g, w, h);
  const P = pl.P;
  const tm = mod(t, P);
  const age = (t0: number) => mod(tm - t0, P);
  const top = Math.round(h * (1 - Math.min(1, share)));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + top, w, h - top);
  ctx.clip();

  // the last shot: its flash, the kick it gives (a heavy round jolts the well)
  let last = Infinity;
  for (const f of pl.fires) last = Math.min(last, age(f));
  const kick = pl.big && last < 0.07;
  const ox = x + (kick ? (last < 0.035 ? 1 : -1) : 0);
  const oy = y;
  const px = (ax: number, ay: number, aw: number, ah: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(ox + ax), Math.round(oy + ay), aw, ah);
  };

  // the well, its specks drifting by (faster for a gun that wants speed)
  ctx.fillStyle = INKWELL;
  ctx.fillRect(x, y, w, h);
  for (let j = 0; j < 7; j++) {
    const v = g.speedy ? 46 : 12;
    px(Math.floor(hash(j, 5) * w), mod(hash(j, 6) * h + t * v * (0.6 + hash(j, 7) * 0.6), h), 1, g.speedy ? 3 : 1, SPECK);
  }

  // the plates: hit flash, frost, a shove, a pin
  const hitAge = pl.plates.map(() => Infinity);
  const frost = pl.plates.map(() => 0);
  const shove = pl.plates.map(() => 0);
  const pinned = pl.plates.map(() => Infinity);
  for (const hit of pl.hits) {
    const a = age(hit.t);
    hitAge[hit.p] = Math.min(hitAge[hit.p], a);
    if (g.chill && a < 1.6) frost[hit.p] += g.chill;
    if (g.shove && a < 0.4) shove[hit.p] = Math.min(7, shove[hit.p] + g.shove * 6 * (1 - a / 0.4));
    if (g.pin && a < Math.min(g.pin, P * 0.75)) pinned[hit.p] = Math.min(pinned[hit.p], a);
  }
  const { pw, ph } = pl;
  pl.plates.forEach((_, j) => {
    let q = plateAt(pl, j, tm);
    const ha = hitAge[j];
    // a chaser, after its mine: knocked tumbling back down
    if (pl.plates[j].climb) {
      const hitT = pl.hits.find((hh) => hh.p === j)?.t;
      if (hitT !== undefined && tm > hitT) {
        const a = tm - hitT;
        if (a > 0.5) return;
        q = { x: q.x, y: plateAt(pl, j, hitT).y + 50 * a * a + 8 * a };
      }
    }
    const bob = pl.plates[j].climb || pinned[j] < Infinity || g.shot === 'rail' ? 0 : Math.round(Math.sin(t * 2.3 + j * 2.1) * 0.6);
    const qx = Math.round(q.x - pw / 2);
    const qy = Math.round(q.y - ph / 2 + bob - shove[j]);
    if (qy > h) return;
    const frozen = frost[j] >= 4;
    px(qx, qy, pw, ph + 1, PLATE_LO);
    px(qx, qy, pw, ph, ha < 0.05 ? WHITE : ha < 0.1 ? '#d6c6ae' : frozen ? '#9a92a8' : PLATE);
    if (ha >= 0.05) px(qx, qy, pw, 1, ha < 0.1 ? WHITE : PLATE_HI);
    if (frozen) {
      px(qx - 1, qy - 1, pw + 2, 1, CREAM);
      px(qx - 1, qy + ph, pw + 2, 1, CREAM);
      px(qx - 1, qy, 1, ph, CREAM);
      px(qx + pw, qy, 1, ph, CREAM);
    } else for (let k = 0; k < Math.floor(frost[j]); k++) px(qx + 1 + ((k * 2) % pw), qy + (k % 2 ? ph - 1 : 0), 1, 1, CREAM);
    if (pinned[j] < Infinity) {
      // nailed where it is, the chain back to the ship
      px(qx - 1, qy + 1, 1, 1, CREAM);
      px(qx + pw, qy + 1, 1, 1, CREAM);
      if (pinned[j] < 0.9) line(ctx, ox + q.x, oy + qy + ph, ox + pl.x(tm), oy + pl.sy - 1, pinned[j] < 0.3 ? RUST : EMBER, 2);
    }
  });
  // the sentry's mark on what it's aiming at
  if (g.auto) {
    const k = Math.floor(tm * g.rate) % pl.plates.length;
    const q = pl.plates[k];
    if (Math.floor(t * 8) % 2) {
      const [ax, ay, bx, by] = [Math.round(q.x - pw / 2) - 2, Math.round(q.y - ph / 2) - 2, Math.round(q.x + pw / 2) + 1, Math.round(q.y + ph / 2) + 1];
      for (const [cx, cy] of [[ax, ay], [bx, ay], [ax, by], [bx, by]]) px(cx, cy, 1, 1, RUST);
    }
  }

  // the shots
  const body = pl.pale ? CREAM : RUST;
  const size = g.size ?? 1;
  for (const s of pl.shots) {
    const a = age(s.t0);
    const k = Math.floor(a / DT);
    const n = s.pts.length / 2;
    if (k < n) {
      const sx = s.pts[k * 2];
      const sy = s.pts[k * 2 + 1];
      const back = (m: number) => {
        const b = Math.max(0, k - m) * 2;
        return [s.pts[b], s.pts[b + 1]];
      };
      if (g.shot === 'flame') {
        // an ember: white-hot, then rust, then going out
        const f = a / g.life;
        const jx = hash(s.t0 * 97, k) > 0.5 ? 1 : 0;
        if (f < 0.25) px(sx, sy, 1, 1, WHITE);
        else if (f < 0.65) px(sx - jx, sy - 1, 2, 2, pl.pale ? (f < 0.45 ? CREAM : '#c8b898') : f < 0.45 ? HOT : RUST);
        else px(sx + jx, sy, 1, 1, pl.pale ? '#8a8090' : EMBER);
      } else if (g.shot === 'missile') {
        for (let m = 8; m >= 2; m -= 2) {
          const [tx, ty] = back(m);
          px(tx, ty, 1, 1, m > 5 ? EMBER : RUST);
        }
        px(sx, sy, 1, 1, WHITE);
        const [bx, by] = back(1);
        px(bx, by, 1, 1, HOT);
      } else if (g.shot === 'flak') {
        const [bx, by] = back(2);
        px(bx, by, 1, 1, EMBER);
        px(sx - 1, sy - 1, 2, 2, RUST);
        if (Math.floor(a * 16) % 2) px(sx - 1, sy - 1, 1, 1, CREAM);
      } else if (g.shot === 'mine') {
        px(sx - 1, sy - 1, 3, 3, '#3a2a26');
        px(sx - 1, sy - 1, 3, 1, RUST);
        // its lamp, blinking faster as it ripens
        if (Math.floor(a * (3 + 6 * a)) % 2 === 0) px(sx, sy, 1, 1, CREAM);
      } else if (g.shot === 'pellet' && size >= 2) {
        // a wave: a ripple, wide and slow
        const r = Math.round(size * 1.2);
        for (let d = -r; d <= r; d++) px(sx + d, sy + Math.round((d / r) ** 2 * 2), 1, 1, Math.abs(d) < r ? CREAM : body);
        for (let d = -r + 1; d < r; d++) px(sx + d, sy + 2 + Math.round((d / r) ** 2 * 2), 1, 1, EMBER);
      } else if (g.shot === 'pellet') {
        const [tx, ty] = back(1);
        px(tx, ty, 1, 1, body);
        px(sx, sy, size >= 1.5 ? 2 : 1, size >= 1.5 ? 2 : 1, g.homing ? CREAM : WHITE);
      } else {
        // a slug: a hot head, a tracer behind (a needle's long and thin, a fat round's fat)
        const big = Math.max(1, Math.round(size));
        const tail = size < 1 ? 4 : 2;
        for (let m = tail; m >= 1; m--) {
          const [tx, ty] = back(m);
          px(tx - (big > 2 ? 1 : 0), ty, big > 2 ? 3 : 1, 1, m > tail / 2 ? EMBER : body);
        }
        if (big > 1) {
          px(sx - Math.floor(big / 2), sy - Math.floor(big / 2), big, big, g.bounce ? CREAM : HOT);
          px(sx, sy, 1, 1, WHITE);
          // a saw spins
          if (g.bounce) px(sx + (Math.floor(a * 20) % 2 ? 1 : -1), sy + (Math.floor(a * 20 + 1) % 2 ? 1 : -1), 1, 1, RUST);
        } else {
          px(sx, sy - 1, 1, 2, WHITE);
        }
      }
    }
    // bursts: a flash, then a ring of shrapnel going out
    if (s.burst) {
      const ba = mod(tm - s.burst.t, P);
      const r = s.burst.r;
      if (ba < 0.05) {
        const q = Math.round(r * 0.5);
        px(s.burst.x - q, s.burst.y, q * 2 + 1, 1, WHITE);
        px(s.burst.x, s.burst.y - q, 1, q * 2 + 1, WHITE);
        px(s.burst.x - 1, s.burst.y - 1, 3, 3, CREAM);
      } else if (ba < 0.32) {
        const f = (ba - 0.05) / 0.27;
        const rr = r * (0.35 + f * 0.75);
        for (let k = 0; k < 8; k++) {
          const an = (k / 8) * Math.PI * 2 + s.t0;
          px(s.burst.x + Math.cos(an) * rr, s.burst.y + Math.sin(an) * rr, 1, 1, f < 0.3 ? CREAM : f < 0.65 ? HOT : EMBER);
        }
        if (f < 0.4) px(s.burst.x, s.burst.y, 1, 1, HOT);
      }
    }
  }

  const mx = pl.x(tm);
  const my = pl.sy - 1;
  // a held beam: three pixels wide, flickering, all the way up
  if (pl.beam && tm >= pl.beam[0] && tm < pl.beam[1]) {
    const f = Math.floor(t * 30) % 2;
    px(mx - 1, 0, 3, my + 1, f ? RUST : EMBER);
    px(mx, 0, 1, my + 1, CREAM);
    for (let k = 0; k < my; k += 4) px(mx + (((k >> 2) + f) % 2 ? 1 : -1), (k + Math.floor(t * 60)) % my, 1, 1, CREAM);
    px(mx - 1, my - 1, 3, 2, WHITE);
  }
  // rails: a streak of light there at once, then a twisting wake going out
  for (const s of pl.streaks) {
    const a = age(s.t);
    if (a > 0.22) continue;
    const [x0, y0, , y1] = s.pts;
    if (a < 0.03) {
      ctx.fillStyle = 'rgba(255,240,210,0.16)';
      ctx.fillRect(x, y + top, w, h - top);
    }
    if (a < 0.06) {
      px(x0 - 1, y1, 3, y0 - y1, HOT);
      px(x0, y1, 1, y0 - y1, WHITE);
    } else {
      const f = (a - 0.06) / 0.16;
      for (let yy = y1; yy < y0; yy += 2) {
        const side = Math.round(Math.sin(yy * 0.7 + a * 40) * (1 + f));
        px(x0 + side, yy, 1, 1, f < 0.5 ? CREAM : RUST);
      }
      if (f < 0.4) px(x0, y1, 1, y0 - y1, RUST);
    }
  }
  // arcs: jagged and gone in a blink
  for (const b of pl.bolts) {
    const a = age(b.t);
    if (a > 0.1) continue;
    const seed = Math.floor(a * 45);
    for (let k = 0; k + 3 < b.pts.length; k += 2) {
      const [ax, ay, bx, by] = [b.pts[k], b.pts[k + 1], b.pts[k + 2], b.pts[k + 3]];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const [nx, ny] = [-(by - ay) / len, (bx - ax) / len];
      let [lx, ly] = [ax, ay];
      for (let s = 1; s <= 3; s++) {
        const j = s < 3 ? (hash(b.t * 31 + k, seed * 7 + s) - 0.5) * 5 : 0;
        const [qx, qy] = [ax + ((bx - ax) * s) / 3 + nx * j, ay + ((by - ay) * s) / 3 + ny * j];
        line(ctx, ox + lx, oy + ly, ox + qx, oy + qy, a < 0.04 ? WHITE : CREAM);
        [lx, ly] = [qx, qy];
      }
      px(bx - 1, by, 3, 1, HOT);
      px(bx, by - 1, 1, 3, HOT);
    }
  }

  // sparks off what's hit, as many as it hurt
  pl.hits.forEach((hit, i) => {
    const a = age(hit.t);
    if (a > 0.22) return;
    for (let k = 0; k < hit.n; k++) {
      const an = Math.PI / 2 + (hash(i, k) - 0.5) * 3.4;
      const v = 28 + 30 * hash(k, i);
      px(hit.x + Math.cos(an) * v * a, hit.y + Math.sin(an) * v * a, 1, 1, a < 0.07 ? WHITE : a < 0.14 ? HOT : RUST);
    }
  });

  // the ship (kicked back a pixel by a heavy round), its sentry's barrel, the muzzle flash
  const sy = pl.sy + (kick ? 1 : 0);
  ship(ctx, Math.round(ox + mx), Math.round(oy + sy), t, !!g.speedy);
  if (g.auto) {
    const q = pl.plates[Math.floor(tm * g.rate) % pl.plates.length];
    const an = Math.atan2(q.x - mx, -(q.y - sy - 3));
    px(mx + Math.sin(an) * 3, sy + 3 - Math.cos(an) * 3, 1, 1, CREAM);
  }
  if (last < (pl.big ? 0.08 : 0.05) && !pl.beam && g.shot !== 'mine') {
    const r = pl.big ? 2 : 1;
    px(mx - r, my, r * 2 + 1, 1, pl.big ? HOT : CREAM);
    px(mx, my - r - (pl.big ? 1 : 0), 1, r * 2 + 1, pl.big ? HOT : CREAM);
    px(mx, my, 1, 1, WHITE);
  }
  // a round left in a ripening chamber: swelling at the muzzle
  if (g.ripen && pl.taps && tm > pl.P - 0.3) px(mx - 1, my - 1, 3, 2, Math.floor(t * 12) % 2 ? CREAM : HOT);

  // a heavy's rounds, coming back at its rate
  if (pl.taps && g.heavy) {
    const k = pl.taps.length;
    const shot = pl.taps.filter((tp) => tm >= tp).length;
    const back = tm >= pl.taps[0] ? Math.min(k, Math.floor((tm - pl.taps[0]) * g.rate)) : 0;
    const have = g.heavy - shot + back;
    const part = have < g.heavy ? mod((tm - pl.taps[0]) * g.rate, 1) : 0;
    for (let j = 0; j < g.heavy; j++) {
      const bx = x + 2 + j * 4;
      const by = y + h - 6;
      ctx.fillStyle = PLATE_LO;
      ctx.fillRect(bx - 1, by - 1, 5, 6);
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(bx, by, 3, 4);
      if (j < have) {
        const just = back > 0 && j === have - 1 && mod((tm - pl.taps[0]) * g.rate, 1) < 0.15 && have <= g.heavy - shot + back;
        ctx.fillStyle = just ? WHITE : CREAM;
        ctx.fillRect(bx, by, 3, 4);
      } else if (j === have) {
        const f = Math.round(part * 4);
        ctx.fillStyle = RUST;
        ctx.fillRect(bx, by + 4 - f, 3, f);
      }
    }
  }

  // the wipe's edge
  if (share < 1 && top > 0) {
    ctx.fillStyle = CREAM;
    ctx.fillRect(x, y + top, w, 1);
  }
  ctx.restore();
}

/** On a card on its own: this long of the part turning, then the loop, then round again (s). */
const MODEL = 2;
const CYCLE = 5;
const WIPE = 0.16;

/**
 * How much of a gun's well the loop takes at `t` (0..1), and the loop's own clock. In focus
 * (`on`) it's firing; in a row and not in focus, it's the model; a card on its own (`on` unset)
 * turns the model for 2 s, then fires for 3, from the first shot, with a quick wipe between.
 */
export function loopShare(t: number, on?: boolean): [number, number] {
  if (on === true) return [1, t];
  if (on === false) return [0, t];
  const k = mod(t, CYCLE);
  const lt = k - MODEL + WIPE;
  if (k < MODEL) return [0, lt];
  if (k < MODEL + WIPE) return [(k - MODEL) / WIPE, lt];
  if (k > CYCLE - WIPE) return [(CYCLE - k) / WIPE, lt];
  return [1, lt];
}
