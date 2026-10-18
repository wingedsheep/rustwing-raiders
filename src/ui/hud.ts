import * as THREE from 'three';
import type { Level, Player } from '../sim/level';
import { FLIGHT_Y, HALF_H } from '../sim/types';
import { drawText, textWidth, wrap } from './font';
import { frameById, partById, type PartClass } from '../game/parts';
import { cellsOf } from '../sim/build';
import type { LevelView } from '../view/level-view';
import { LIVERY } from '../view/ship-model';
import { clamp } from '../util';
import { DRIFT_TIERS, TIERS } from '../sim/level';
import { bendPoint } from '../render/bend';
import { ordinal } from '../view/track';

/**
 * The menus are laid out on 640 × 360 UI texels: the safe area, in the middle of the window. The
 * UI canvas covers the whole window (VIEW: its size in UI texels, and where the safe area sits
 * on it), so backdrops and the flight HUD reach the edges.
 */
export const W = 640;
export const H = 360;
export const VIEW = { w: W, h: H, ox: 0, oy: 0 };

export const INK = '#f4ecd8';
export const DIM = '#8a8098';
export const DARK = '#120c18';
export const PANEL = '#1c1526';
export const EDGE = '#3a2e48';
export const GOLD = '#ffd04a';
export const RED = '#ff5a4a';
export const GREEN = '#8affb0';
export const CYAN = '#8affe0';

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export const CLASS_COLOR: Record<PartClass, string> = {
  gun: '#ff8a4a',
  engine: '#6ad0ff',
  power: '#ffe04a',
  defense: '#a0a8b8',
  booster: '#d08aff',
  special: '#8affb0',
};

/** A framed panel, pixel-art style: dark fill, a light top-left edge and a dark bottom-right. */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = PANEL, edge = EDGE) {
  ctx.fillStyle = DARK;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = edge;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x + w - 1, y, 1, h);
}

/** A bar, filled to `f`, in segments. */
export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string, back = '#2a2236') {
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, Math.round(w * clamp(f, 0, 1)), 1);
}

/** The ship's grid, drawn small: every socket, every part in its class colour. */
export function schematic(ctx: CanvasRenderingContext2D, build: Player['build'], x: number, y: number, cell: number, cursor?: { c: number; r: number }) {
  const f = frameById(build.frame);
  const rows = f.grid.length;
  const cols = f.grid[0].length;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (f.grid[r][c] !== '#') continue;
      ctx.fillStyle = '#2e2640';
      ctx.fillRect(x + c * cell, y + r * cell, cell - 1, cell - 1);
    }
  for (const p of build.parts) {
    const def = partById(p.id);
    ctx.fillStyle = CLASS_COLOR[def.cls];
    for (const [c, r] of cellsOf(p)) ctx.fillRect(x + c * cell + 1, y + r * cell + 1, cell - 3, cell - 3);
  }
  if (cursor) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + cursor.c * cell - 0.5, y + cursor.r * cell - 0.5, cell, cell);
  }
  void cols;
}

/** A translucent plate for the HUD: dark glass with a lit top edge. */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.62) {
  ctx.fillStyle = `rgba(14,10,22,${alpha})`;
  ctx.fillRect(x + 1, y, w - 2, h);
  ctx.fillRect(x, y + 1, 1, h - 2);
  ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = 'rgba(255,240,220,0.12)';
  ctx.fillRect(x + 1, y, w - 2, 1);
}

/**
 * The flight HUD: as little as possible, round the edges, so the land gets the screen. One slim
 * bar along the top (each player's ship at their end, the route and the takings in the middle);
 * everything else turns up over the ships or in the middle when it matters, and goes again.
 */
export class Hud {
  private v = new THREE.Vector3();
  private bp = { x: 0, z: 0 };
  time = 0;
  /** Device pixels, and device pixels per UI texel (to put world points on the UI). */
  dw = 1;
  dh = 1;
  scale = 1;

  draw(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView, devices: string[], paused: boolean) {
    this.time += 1 / 60;
    this.topBar(ctx, lv);
    this.field(ctx, lv, view);
    if (paused) this.pause(ctx);
  }

  private topBar(ctx: CanvasRenderingContext2D, lv: Level) {
    const w = VIEW.w;
    const ps = lv.players;
    // a player's plate at each end (P2 at the right in co-op; the right end is the takings solo)
    this.player(ctx, lv, ps[0], 6, 'left');
    if (ps[1]) this.player(ctx, lv, ps[1], w - 6, 'right');
    // the route in the middle
    const rw = Math.min(260, Math.floor(w * 0.3));
    const rx = Math.floor(w / 2 - rw / 2);
    plate(ctx, rx - 8, 4, rw + 16, 20);
    const segs = lv.spec.biomes;
    const here = lv.terrain.biomeIndex(lv.scroll);
    segs.forEach((b, i) => {
      const x0 = rx + Math.round((rw * i) / segs.length);
      const x1 = rx + Math.round((rw * (i + 1)) / segs.length) - 2;
      ctx.fillStyle = hex(b.ground[i === here ? 2 : 1]);
      ctx.globalAlpha = i < here ? 0.45 : i === here ? 1 : 0.7;
      ctx.fillRect(x0, 16, x1 - x0, 3);
      ctx.globalAlpha = 1;
    });
    // a race: where the rivals are along it, a tick in each one's colour
    const c = lv.terrain.course;
    if (c)
      for (const r of lv.rivals) {
        const f = clamp((HALF_H - 8 - r.z) / (HALF_H - 8 - c.finish), 0, 1);
        ctx.fillStyle = hex(r.livery[2]);
        ctx.fillRect(rx + Math.round(rw * f) - 1, 13, 2, 3);
      }
    const fx = rx + Math.round(rw * clamp(lv.progress, 0, 1));
    ctx.fillStyle = INK;
    ctx.fillRect(fx - 1, 14, 3, 7);
    const mode = { raid: 'RAID', run: 'RACE', hunt: 'HUNT', boss: 'WARDEN' }[lv.spec.mode];
    drawText(ctx, `${lv.spec.planet.name} · ${mode}`, rx, 6, DIM, { shadow: false });
    if (lv.race) {
      // the clock against par: gold while you're ahead of it
      const t = lv.time + lv.penalty;
      const ahead = t <= lv.parTime * clamp(lv.progress, 0.05, 1);
      drawText(ctx, `${clock(t)} / ${clock(lv.parTime)}`, rx + rw, 6, t > lv.parTime ? RED : ahead ? GOLD : DIM, { align: 'right', shadow: false });
    } else if (lv.spawned > 0) {
      // the hunt's tally: what's down, and what got past (a full clear pays)
      const clean = lv.missed === 0;
      drawText(ctx, `${lv.killed}/${lv.spawned}${lv.missed ? `  ${lv.missed} MISSED` : ''}`, rx + rw, 6, clean ? GOLD : DIM, { align: 'right', shadow: false });
    }
    // the takings
    const tx = ps[1] ? Math.floor(w / 2 + rw / 2 + 16) : w - 6;
    const align = ps[1] ? 'left' : 'right';
    plate(ctx, ps[1] ? tx - 4 : tx - 104, 4, 108, 20);
    const sx = ps[1] ? tx + 2 : tx - 98;
    drawText(ctx, `${lv.scrap}`, sx, 7, GOLD, { shadow: false });
    ctx.fillStyle = GOLD;
    ctx.fillRect(sx - 0 + textWidth(`${lv.scrap}`) + 3, 9, 3, 3);
    drawText(ctx, String(lv.score).padStart(7, '0'), ps[1] ? tx + 98 : tx - 4, 7, INK, { align: 'right', shadow: false });
    void align;
    if (lv.combo > 1 && !lv.race) {
      const big = lv.combo > 20;
      drawText(ctx, `${lv.combo}× CHAIN`, w / 2, 30, big ? GOLD : CYAN, { align: 'center' });
    }
  }

  /** A player's plate: hull, shield, dashes, special, at one end of the top bar. */
  private player(ctx: CanvasRenderingContext2D, lv: Level, p: Player, x: number, side: 'left' | 'right') {
    const s = p.stats;
    const col = hex(LIVERY[p.id][2]);
    const pw = 150;
    const x0 = side === 'left' ? x : x - pw;
    plate(ctx, x0, 4, pw, 20);
    let cx = x0 + 6;
    drawText(ctx, `P${p.id + 1}`, cx, 7, col, { shadow: false });
    cx += 16;
    for (let i = 0; i < s.hp; i++) {
      const on = i < p.hp;
      const blink = on && p.hp <= 1 && Math.floor(this.time * 4) % 2;
      drawText(ctx, '♥', cx, 7, on ? (blink ? '#ffffff' : RED) : '#3a2e48', { shadow: false });
      cx += 7;
    }
    for (let i = 0; i < s.shield; i++) {
      drawText(ctx, '◆', cx, 7, i < p.shield ? CYAN : '#3a2e48', { shadow: false });
      cx += 7;
    }
    // dashes: pips, the next one filling
    cx += 3;
    for (let i = 0; i < s.dashes; i++) {
      ctx.fillStyle = i < p.dashes ? col : '#3a2e48';
      ctx.fillRect(cx, 9, 5, 4);
      if (i === p.dashes && p.dashes < s.dashes) {
        ctx.fillStyle = col;
        ctx.fillRect(cx, 9, Math.round(5 * (1 - p.dashCd / s.dashCooldown)), 4);
      }
      cx += 7;
    }
    // the special charging along the bottom of the plate
    // the aux: a letter for what it is, filling back up after use
    if (s.aux) {
      cx += 3;
      const ready = p.auxCd <= 0;
      const k = ready ? 1 : 1 - p.auxCd / Math.max(0.01, p.auxMax);
      ctx.fillStyle = '#3a2e48';
      ctx.fillRect(cx, 7, 9, 8);
      ctx.fillStyle = ready ? (p.auxT > 0 ? '#ffffff' : '#ffc860') : '#806838';
      ctx.fillRect(cx, 7 + Math.round(8 * (1 - k)), 9, Math.round(8 * k));
      drawText(ctx, { parry: 'P', tether: 'T', flare: 'F', siphon: 'S' }[s.aux], cx + 2, 7, ready ? '#1a1020' : '#c8b8d8', { shadow: false });
      cx += 11;
    }
    // the Burn: what boosting spends, earned back by flying close; brighter while it's being spent
    const burnCol = p.boosting > 0 ? (Math.floor(this.time * 12) % 2 ? '#ffffff' : '#ffb04a') : p.burn < 0.15 ? '#a04a3a' : '#ff8a3a';
    bar(ctx, x0 + 4, 16, pw - 8, 2, p.burn, burnCol, 'rgba(60,48,80,0.6)');
    if (s.special) {
      const ready = p.charge >= 1;
      bar(ctx, x0 + 4, 19, pw - 8, 2, p.charge, ready ? (Math.floor(this.time * 6) % 2 ? GOLD : '#ffffff') : '#c0a040', 'rgba(60,48,80,0.6)');
    }
    if (p.down) drawText(ctx, lv.players.length > 1 ? 'DOWN! PARTNER: FLY CLOSE' : 'DOWN!', side === 'left' ? x0 : x0 + pw, 28, RED, { align: side });
  }

  /** A world point (on the flight plane) in UI texels. */
  private toScreen(view: LevelView, x: number, y: number, z: number) {
    // (a race's world is drawn bent round its course: so is this)
    const b = bendPoint(x, z, this.bp);
    this.v.set(b.x, y, b.z).project(view.eye);
    // (behind a chase camera it projects mirrored: flagged, so it's never drawn as if in view)
    return { x: (((this.v.x + 1) / 2) * this.dw) / this.scale, y: (((1 - this.v.y) / 2) * this.dh) / this.scale, behind: Math.abs(this.v.z) > 1 };
  }

  private field(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const w = VIEW.w;
    const h = VIEW.h;
    const mid = w / 2;
    // pops
    for (const p of view.pops) {
      const s = this.toScreen(view, p.x, FLIGHT_Y, p.z);
      const a = p.t < 0.7 || Math.floor(p.t * 20) % 2 === 0;
      if (a) drawText(ctx, p.text, s.x, s.y - 14 - p.t * 10, p.color, { align: 'center' });
    }
    for (const p of lv.players) {
      const s = this.toScreen(view, p.x, FLIGHT_Y, p.z);
      // P1/P2 tags over the ships in co-op
      if (lv.players.length > 1) drawText(ctx, `P${p.id + 1}`, s.x, s.y + 18, hex(LIVERY[p.id][2]), { align: 'center' });
      if (p.down) continue;
      // boosting with the tank nearly dry: say so where the eyes are
      if (p.boosting > 0 && p.burn < 0.2 && Math.floor(this.time * 8) % 2) drawText(ctx, 'BURN LOW', s.x, s.y + 20, '#ff8a3a', { align: 'center' });
      // guns running hot: a little gauge under the ship, only while it matters
      const heat = Math.max(...p.heat, 0);
      const jam = p.jam.some((j) => j > 0);
      if (heat > 0.45 || jam) {
        const gw = 22;
        ctx.fillStyle = 'rgba(14,10,22,0.6)';
        ctx.fillRect(Math.round(s.x - gw / 2) - 1, Math.round(s.y + 13), gw + 2, 4);
        ctx.fillStyle = jam ? (Math.floor(this.time * 10) % 2 ? RED : '#ffffff') : heat > 0.75 ? '#ff9a3a' : '#c8a060';
        ctx.fillRect(Math.round(s.x - gw / 2), Math.round(s.y + 14), Math.round(gw * (jam ? 1 : heat)), 2);
      }
    }
    // the biome coming in: big, low, and gone again
    const b = view.biomeBanner;
    // (not over a race's lights)
    if (b && b.t < 4.5 && !(lv.race && lv.time < 1 && b.t > lv.time)) {
      const fade = Math.min(1, b.t * 2.5) * (b.t > 3.6 ? Math.max(0, 1 - (b.t - 3.6) * 1.2) : 1);
      ctx.globalAlpha = fade;
      const by = Math.round(h * 0.2);
      drawText(ctx, b.name, mid, by, INK, { scale: 3, align: 'center' });
      const lines = wrap(b.line, 360);
      lines.slice(0, 2).forEach((l, i) => drawText(ctx, l, mid, by + 28 + i * 11, '#d8cce8', { align: 'center' }));
      ctx.globalAlpha = 1;
    }
    // the boss
    const boss = lv.enemies.find((e) => e.boss && !e.dead);
    const bb = view.bossBanner;
    if (bb && bb.t < 3.5 && Math.floor(bb.t * 5) % 2 === 0) {
      ctx.fillStyle = 'rgba(180,20,30,0.5)';
      ctx.fillRect(0, Math.round(h * 0.38), w, 44);
      drawText(ctx, 'WARNING', mid, Math.round(h * 0.38) + 6, '#ffffff', { scale: 2, align: 'center' });
      drawText(ctx, bb.name, mid, Math.round(h * 0.38) + 28, GOLD, { align: 'center' });
    }
    if (boss && boss.t > 0) {
      const bw = Math.min(420, w - 80);
      const bx = Math.round(mid - bw / 2);
      plate(ctx, bx, 30, bw, 16);
      drawText(ctx, lv.spec.planet.boss.name, bx + 4, 32, INK, { shadow: false });
      bar(ctx, bx + 4, 41, bw - 8, 3, boss.hp / boss.max, boss.shielded ? '#8a8098' : RED);
      ctx.fillStyle = DARK;
      for (const f of [1 / 3, 2 / 3]) ctx.fillRect(bx + 4 + Math.round((bw - 8) * f), 41, 1, 3);
    }
    if (lv.race && view.track) this.race(ctx, lv, view);
    if (lv.state === 'clear' && lv.ending > 0.4 && lv.race) {
      // over the line: the place, big, and what it means
      const t = lv.ending;
      const col = lv.place === 1 ? GOLD : lv.place <= 3 ? INK : DIM;
      const pop = t < 0.9 ? 1 + Math.max(0, 0.25 - (t - 0.4)) * 2 : 1;
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, ordinal(lv.place), mid, h * 0.32, col, { scale: Math.round(5 * pop), align: 'center' });
      if (t > 0.9) drawText(ctx, lv.place === 1 ? 'VICTORY' : lv.place <= 3 ? 'ON THE PODIUM' : 'OFF THE PACE', mid, h * 0.32 + 46, col, { scale: 2, align: 'center' });
    } else if (lv.state === 'clear' && lv.ending > 0.4) {
      const t = lv.ending;
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, lv.spec.mode === 'boss' ? 'WARDEN DOWN' : 'CLEAR', mid, h * 0.4, GOLD, { scale: 4, align: 'center' });
    }
    if (lv.state === 'failed' && lv.ending > 0.8) drawText(ctx, lv.race ? 'WRECKED' : 'SHOT DOWN', mid, h * 0.42, RED, { scale: 4, align: 'center' });
  }

  /**
   * A race's HUD: the lights, your place (big, jumping when it changes), a speedometer, the
   * rivals named over their ships and pointed to when they're off the screen, and the big words.
   */
  private race(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const tv = view.track!;
    const w = VIEW.w;
    const h = VIEW.h;
    const mid = w / 2;
    // the lights: three reds, then all green on GO
    if (lv.countdown > 0 || lv.time < 0.8) {
      const n = lv.countdown > 0 ? 3 - Math.ceil(lv.countdown) + 1 : 4;
      const go = lv.countdown <= 0;
      const y = Math.round(h * 0.2);
      plate(ctx, mid - 52, y - 6, 104, 30, 0.75);
      for (let i = 0; i < 3; i++) {
        const lit = go || i < n;
        ctx.fillStyle = lit ? (go ? GREEN : RED) : '#2a2236';
        ctx.fillRect(mid - 40 + i * 30, y, 20, 18);
        if (lit) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(mid - 40 + i * 30, y, 20, 3);
        }
      }
      const word = go ? 'GO!' : String(Math.ceil(lv.countdown));
      const k = go ? lv.time : 1 - (lv.countdown % 1);
      drawText(ctx, word, mid, y + 36, go ? GREEN : INK, { scale: k < 0.15 ? 5 : 4, align: 'center' });
      if (!go) {
        drawText(ctx, 'BOOST ON GO FOR A PERFECT START', mid, y + 76, DIM, { align: 'center' });
        drawText(ctx, 'STEER LEFT AND RIGHT  -  UP: THROTTLE  -  DOWN: BRAKE', mid, y + 92, DIM, { align: 'center' });
        drawText(ctx, 'HOLD FIRE AND STEER INTO A BEND TO DRIFT IT TIGHT: LET GO FOR A TURBO', mid, y + 104, DIM, { align: 'center' });
        drawText(ctx, 'BOOST REFILLS ON ITS OWN, FASTER FLYING CLOSE: ROCKS, GAPS, WAKES', mid, y + 116, DIM, { align: 'center' });
      }
    }
    // your place
    const best = lv.living().reduce<Player | undefined>((a, p) => (!a || p.z < a.z ? p : a), undefined);
    if (best && lv.state !== 'clear') {
      const place = 1 + lv.rivals.filter((r) => r.done !== null || r.z < best.z).length;
      const jump = tv.placeT < 0.35 ? 1 : 0;
      const col = tv.placeT < 0.6 ? (tv.placeUp ? GOLD : RED) : place === 1 ? GOLD : INK;
      const x = lv.players.length > 1 ? mid - 150 : 8;
      plate(ctx, x - 2, 28, 64, 30);
      drawText(ctx, ordinal(place), x + 2, 31 - jump * 2, col, { scale: 2 + jump, shadow: false });
      drawText(ctx, `/${lv.rivals.length + 1}`, x + 50, 44, DIM, { shadow: false });
      this.paceNote(ctx, lv, best);
    }
    // a drift charging: three pips under the ship, filling in the turbo's colour
    for (const p of lv.players) {
      if (p.down || p.driftT <= 0) continue;
      const s = this.toScreen(view, p.x, FLIGHT_Y, p.z);
      const cols = ['#6ab8ff', '#ffa040', '#d070ff'];
      for (let k = 0; k < 3; k++) {
        const from = k === 0 ? 0 : DRIFT_TIERS[k - 1];
        const fill = clamp((p.driftT - from) / (DRIFT_TIERS[k] - from), 0, 1);
        const x = Math.round(s.x - 17 + k * 12);
        const y = Math.round(s.y + 14);
        ctx.fillStyle = 'rgba(14,10,22,0.7)';
        ctx.fillRect(x - 1, y - 1, 12, 5);
        ctx.fillStyle = fill >= 1 ? (Math.floor(this.time * 14) % 2 ? '#ffffff' : cols[k]) : cols[k];
        ctx.fillRect(x, y, Math.round(10 * fill), 3);
      }
    }
    // the speedometer: km/h and a bar that runs through the tiers' colours
    const fwd = best?.fwd ?? 0;
    const kmh = Math.round(fwd * 18);
    const sw = 110;
    const sx = w - sw - 8;
    const sy = h - 30;
    plate(ctx, sx - 4, sy - 4, sw + 8, 28);
    const tierCol = lv.tier >= 3 ? GOLD : lv.tier >= 2 ? '#9ae8ff' : lv.tier >= 1 ? INK : DIM;
    drawText(ctx, String(kmh).padStart(4, ' '), sx + 2, sy - 1, tierCol, { scale: 2, shadow: false });
    drawText(ctx, 'KM/H', sx + 70, sy + 4, DIM, { shadow: false });
    // the boost tank over it: what boosting spends, refilling on its own and quicker for flying close
    if (best) {
      const by = sy - 17;
      const low = best.burn < 0.15;
      plate(ctx, sx - 4, by - 3, sw + 8, 12);
      drawText(ctx, 'BOOST', sx, by - 1, low ? '#a04a3a' : '#ffb04a', { shadow: false });
      const col = best.boosting > 0 ? (Math.floor(this.time * 12) % 2 ? '#ffffff' : '#ffb04a') : best.dry || low ? '#a04a3a' : '#ff8a3a';
      bar(ctx, sx + 40, by + 1, sw - 40, 4, best.burn, col, 'rgba(60,48,80,0.6)');
    }
    const segs = 22;
    const max = TIERS[2] + 14;
    for (let i = 0; i < segs; i++) {
      const v = ((i + 1) / segs) * max;
      const on = fwd >= v - max / segs / 2;
      ctx.fillStyle = !on ? '#2a2236' : v >= TIERS[2] ? GOLD : v >= TIERS[1] ? '#9ae8ff' : v >= TIERS[0] ? INK : '#8a8098';
      ctx.fillRect(sx + i * 5, sy + 16, 4, 3);
    }
    // the rivals: names over the ones in view, arrows at the edge for the ones ahead or close behind
    // (labels at the edges kept from piling on top of each other)
    const used: number[] = [];
    const ahead: [number, number][] = [];
    const room = (x: number) => {
      let ax = clamp(x, 20, w - 20);
      for (let k = 0; k < 4 && used.some((u) => Math.abs(u - ax) < 34); k++) ax += ax > w / 2 ? -34 : 34;
      used.push(ax);
      return ax;
    };
    for (const r of lv.rivals) {
      const s = this.toScreen(view, r.x, FLIGHT_Y, r.z);
      const col = hex(r.livery[2]);
      const gap = best ? best.z - r.z : 0;
      // (the course runs off sideways too: off any edge, it's ahead or behind)
      if (!s.behind && s.y > 14 && s.y < h - 4 && s.x > 8 && s.x < w - 8) {
        drawText(ctx, r.spin > 0 ? `${r.name} !` : r.name, s.x, s.y - 22, col, { align: 'center' });
      } else if (gap > 0 && r.done === null) {
        // ahead, off the top: a marker in a row under the pace note, kept clear of each other
        const label = gap < 150 ? `${r.name} ${Math.round(gap)}M` : `${Math.round(gap)}M`;
        const tw = textWidth(label);
        let ax = clamp(s.x, 96 + tw / 2, w - 96 - tw / 2);
        for (let k = 0; k < 6 && ahead.some(([u, uw]) => Math.abs(u - ax) < (uw + tw) / 2 + 6); k++) ax += ax > mid ? -(tw / 2 + 10) : tw / 2 + 10;
        ahead.push([ax, tw]);
        const ay = 62;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(ax) - 3, ay, 7, 2);
        ctx.fillRect(Math.round(ax) - 2, ay - 1, 5, 1);
        ctx.fillRect(Math.round(ax) - 1, ay - 2, 3, 1);
        drawText(ctx, label, ax, ay + 4, col, { align: 'center' });
      } else if (gap <= 0 && gap > -60) {
        // (behind the camera: which side of you it's on, roughly)
        const ax = room(s.behind && best ? mid + clamp((r.x - best.x) * 12, -mid + 30, mid - 30) : s.x);
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(ax) - 3, h - 6, 7, 2);
        drawText(ctx, `${Math.round(-gap)}M`, ax, h - 16, col, { align: 'center' });
      }
    }
    // the big words
    const b = tv.banner;
    if (b) {
      const a = b.t < 1.6 || Math.floor(b.t * 12) % 2 === 0;
      if (a) {
        const y = Math.round(h * 0.36);
        drawText(ctx, b.text, mid, y, b.color, { scale: b.t < 0.12 ? 4 : 3, align: 'center' });
        drawText(ctx, b.sub, mid, y + 30, '#d8cce8', { align: 'center' });
      }
    }
  }

  /**
   * The co-driver's call: the next turn, which way and how sharp, and how far off, in a box at the
   * top; flashing as it closes. (A hairpin is the tightest; a fast one barely needs a lift.)
   */
  private paceNote(ctx: CanvasRenderingContext2D, lv: Level, p: Player) {
    const c = lv.terrain.course;
    if (!c || lv.countdown > 0) return;
    const t = c.turns.find((u) => u.z1 < p.z - 4 && u.z0 < p.z + 30 && p.z - u.z0 < 170);
    if (!t) return;
    const dist = Math.max(0, Math.round(p.z - t.z0));
    const word = t.kind === 'hairpin' ? 'HAIRPIN' : t.k >= 1 / 105 ? 'SHARP' : t.k >= 1 / 125 ? 'MEDIUM' : 'FAST';
    const text = t.kind === 'chicane' ? `CHICANE ${t.dir > 0 ? 'RIGHT' : 'LEFT'}` : `${word} ${t.dir > 0 ? 'RIGHT' : 'LEFT'}`;
    const col = word === 'HAIRPIN' || word === 'SHARP' ? RED : word === 'MEDIUM' ? GOLD : INK;
    const mid = VIEW.w / 2;
    const flash = dist < 50 && dist > 0 && Math.floor(this.time * 8) % 2 === 0;
    plate(ctx, mid - 70, 26, 140, 26, 0.7);
    // the arrow: a bent stem and a head, the way it goes
    const ax = mid - 56;
    const d = t.dir;
    ctx.fillStyle = flash ? '#ffffff' : col;
    ctx.fillRect(ax + 6, 36, 3, 12);
    ctx.fillRect(d > 0 ? ax + 6 : ax, 34, 9, 3);
    ctx.fillRect(d > 0 ? ax + 14 : ax - 3, 32, 2, 7);
    ctx.fillRect(d > 0 ? ax + 16 : ax - 5, 34, 2, 3);
    drawText(ctx, text, mid + 6, 30, flash ? '#ffffff' : col, { align: 'center', shadow: false });
    drawText(ctx, dist > 0 ? `${dist}M` : 'NOW', mid + 6, 41, DIM, { align: 'center', shadow: false });
    // a shortcut opening off this turn: say which side, in its colour
    const sc = c.shortcuts.find((s) => s.z0 < p.z + 2 && p.z - s.z0 < 140);
    if (sc) {
      const on = Math.floor(this.time * 6) % 2 === 0 || p.z - sc.z0 > 40;
      plate(ctx, mid - 70, 54, 140, 13, 0.6);
      drawText(ctx, `SHORTCUT ${sc.side > 0 ? 'RIGHT' : 'LEFT'} ${sc.side > 0 ? '>>' : '<<'}`, mid, 56, on ? '#8affe0' : '#ffffff', { align: 'center', shadow: false });
    }
  }

  private pause(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(12,8,18,0.65)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    const mid = VIEW.w / 2;
    const y = VIEW.h / 2 - 40;
    drawText(ctx, 'PAUSED', mid, y, INK, { scale: 3, align: 'center' });
    drawText(ctx, 'START / ESC: RESUME', mid, y + 40, DIM, { align: 'center' });
    drawText(ctx, 'BACK / Q: ABANDON RUN', mid, y + 54, DIM, { align: 'center' });
  }
}

/** m:ss */
function clock(t: number) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
