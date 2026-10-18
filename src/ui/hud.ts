import * as THREE from 'three';
import type { Level, Player } from '../sim/level';
import { FLIGHT_Y } from '../sim/types';
import { drawText, textWidth, wrap } from './font';
import { frameById, partById, type PartClass } from '../game/parts';
import { cellsOf } from '../sim/build';
import type { LevelView } from '../view/level-view';
import { LIVERY } from '../view/ship-model';
import { clamp } from '../util';

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
    if (lv.combo > 1) {
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
    this.v.set(x, y, z).project(view.camera);
    return { x: (((this.v.x + 1) / 2) * this.dw) / this.scale, y: (((1 - this.v.y) / 2) * this.dh) / this.scale };
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
      // boosting with the tank nearly dry: say so where the eyes are; past empty, the redline heat
      if (p.redline > 0.02) {
        const gw = 22;
        ctx.fillStyle = 'rgba(14,10,22,0.6)';
        ctx.fillRect(Math.round(s.x - gw / 2) - 1, Math.round(s.y + 18), gw + 2, 4);
        ctx.fillStyle = p.redline > 0.7 && Math.floor(this.time * 12) % 2 ? '#ffffff' : RED;
        ctx.fillRect(Math.round(s.x - gw / 2), Math.round(s.y + 19), Math.round(gw * p.redline), 2);
        drawText(ctx, 'REDLINE', s.x, s.y + 24, RED, { align: 'center' });
      } else if (p.boosting > 0 && p.burn < 0.2 && Math.floor(this.time * 8) % 2) drawText(ctx, 'BURN LOW', s.x, s.y + 20, '#ff8a3a', { align: 'center' });
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
    if (b && b.t < 4.5) {
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
    if (lv.state === 'clear' && lv.ending > 0.4) {
      const t = lv.ending;
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, lv.spec.mode === 'boss' ? 'WARDEN DOWN' : 'CLEAR', mid, h * 0.4, GOLD, { scale: 4, align: 'center' });
    }
    if (lv.state === 'failed' && lv.ending > 0.8) drawText(ctx, 'SHOT DOWN', mid, h * 0.42, RED, { scale: 4, align: 'center' });
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
