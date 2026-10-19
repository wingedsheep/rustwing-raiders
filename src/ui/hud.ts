import * as THREE from 'three';
import type { Level, Player } from '../sim/level';
import { FLIGHT_Y } from '../sim/types';
import { drawText, textWidth, wrap } from './font';
import { frameById, partById, type PartClass } from '../game/parts';
import { cellsOf } from '../sim/build';
import type { LevelView } from '../view/level-view';
import { LIVERY } from '../view/ship-model';
import { clamp } from '../util';
import { markIcon } from './mark-icons';
import { haulerIcon } from './widgets';
import type { MarkKind } from '../game/parts';

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

/** The convoy's colour (an escort's haulers), and what their hull bars go through as they're worn down. */
export const HAULER = '#8ad0ff';
export const hullColor = (f: number, t: number) => (f > 0.5 ? HAULER : f > 0.2 ? '#ffb04a' : Math.floor(t * 8) % 2 ? RED : '#ffffff');

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
    const mode = { raid: 'RAID', hunt: 'HUNT', escort: 'ESCORT', boss: 'WARDEN' }[lv.spec.mode];
    drawText(ctx, `${lv.spec.planet.name} · ${mode}`, rx, 6, DIM, { shadow: false });
    if (lv.convoy) {
      // an escort: the three haulers, each with what's left of its hull
      lv.convoy.haulers.forEach((h, i) => {
        const hx = rx + rw - 3 * 20 + i * 20 + 4;
        const hit = h.hitT < 0.12 && !h.dead;
        haulerIcon(ctx, hx, 6, hit ? '#ffffff' : h.boarders && Math.floor(this.time * 8) % 2 ? RED : HAULER, h.dead);
        if (!h.dead) bar(ctx, hx + 7, 9, 8, 2, h.hp / h.max, hullColor(h.hp / h.max, this.time), 'rgba(60,48,80,0.8)');
      });
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
    this.v.set(x, y, z).project(view.eye);
    return { x: (((this.v.x + 1) / 2) * this.dw) / this.scale, y: (((1 - this.v.y) / 2) * this.dh) / this.scale };
  }

  private field(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const w = VIEW.w;
    const h = VIEW.h;
    const mid = w / 2;
    this.marks(ctx, lv, view);
    if (lv.convoy) this.convoy(ctx, lv, view);
    // pops
    // the pops: big ones (a reaction's name) first, then the rest nudged down off them (numbers
    // may pile on numbers), and never up under the top bar
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    const pops = [...view.pops].sort((a, b) => Number(!!b.big) - Number(!!a.big));
    for (const p of pops) {
      const s = this.toScreen(view, p.x, FLIGHT_Y, p.z);
      const sc = p.big ? (p.t < 0.08 ? 3 : 2) : 1;
      const tw = textWidth(p.text, sc);
      const th = 8 * sc;
      let y = p.big ? s.y - 22 - Math.min(p.t, 0.3) * 20 : s.y - 14 - p.t * 10;
      y = Math.max(y, 34);
      const x0 = s.x - tw / 2;
      const x1 = s.x + tw / 2;
      for (let moved = true, n = 0; moved && n < 6; n++) {
        moved = false;
        for (const r of taken)
          if (x0 < r.x1 && x1 > r.x0 && y < r.y1 && y + th > r.y0) {
            y = r.y1 + 1;
            moved = true;
          }
      }
      if (p.big) taken.push({ x0, x1, y0: y, y1: y + th });
      const a = p.big ? p.t < 1.3 || Math.floor(p.t * 20) % 2 === 0 : p.t < 0.7 || Math.floor(p.t * 20) % 2 === 0;
      if (a) drawText(ctx, p.text, s.x, y, p.color, { scale: sc, align: 'center' });
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
    // an escort's orders, as it starts (in place of the biome's name)
    const mb = view.missionBanner;
    if (mb && mb.t < 5) {
      const fade = Math.min(1, mb.t * 2.5) * (mb.t > 4 ? Math.max(0, 1 - (mb.t - 4)) : 1);
      ctx.globalAlpha = fade;
      const by = Math.round(h * 0.2);
      drawText(ctx, 'ESCORT', mid, by, HAULER, { scale: 3, align: 'center' });
      drawText(ctx, 'BRING THE HAULERS HOME', mid, by + 28, INK, { align: 'center' });
      drawText(ctx, 'RAIDERS WILL TRY TO BOARD THEM: SHOOT THEM OFF', mid, by + 40, '#d8cce8', { align: 'center' });
      for (let i = 0; i < 3; i++) haulerIcon(ctx, mid - 26 + i * 20, by + 54, HAULER);
      ctx.globalAlpha = 1;
    }
    // the biome coming in: big, low, and gone again
    const b = mb && mb.t < 5 ? null : view.biomeBanner;
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
      const word = lv.spec.mode === 'boss' ? 'WARDEN DOWN' : lv.convoy ? (lv.convoy.delivered ? `${lv.convoy.delivered}/3 HOME` : 'CONVOY LOST') : 'CLEAR';
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, word, mid, h * 0.4, lv.convoy && !lv.convoy.delivered ? RED : GOLD, { scale: 4, align: 'center' });
    }
    if (lv.state === 'failed' && lv.ending > 0.8) drawText(ctx, 'SHOT DOWN', mid, h * 0.42, RED, { scale: 4, align: 'center' });
  }

  /**
   * An escort, on the field: under each hauler what's left of its hull (pale blue, then amber, then
   * red and blinking), BOARDED over it while raiders cling on, and an arrow at the screen's edge
   * where boarders are coming in.
   */
  private convoy(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const c = lv.convoy!;
    const over = lv.state === 'clear';
    for (const hl of c.haulers) {
      if (hl.dead || over) continue;
      const s = this.toScreen(view, hl.x, FLIGHT_Y, hl.z + 4.4);
      const bw = 30;
      const x = Math.round(s.x - bw / 2);
      const y = Math.round(s.y);
      const f = hl.hp / hl.max;
      ctx.fillStyle = 'rgba(14,10,22,0.7)';
      ctx.fillRect(x - 1, y - 1, bw + 2, 5);
      ctx.fillStyle = hl.hitT < 0.08 ? '#ffffff' : hullColor(f, this.time);
      ctx.fillRect(x, y, Math.max(1, Math.round(bw * f)), 3);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x, y, Math.round(bw * f), 1);
      // a notch every quarter
      ctx.fillStyle = 'rgba(14,10,22,0.8)';
      for (let k = 1; k < 4; k++) ctx.fillRect(x + Math.round((bw * k) / 4), y, 1, 3);
      if (hl.boarders && Math.floor(this.time * 6) % 2 === 0) {
        const top = this.toScreen(view, hl.x, FLIGHT_Y, hl.z - 4.6);
        drawText(ctx, hl.boarders > 1 ? `BOARDED ×${hl.boarders}` : 'BOARDED', top.x, top.y - 4, RED, { align: 'center' });
      }
    }
    // boarders on the way: a chevron at the edge they come from
    const bw = view.boardWarn;
    if (bw && Math.floor(bw.t * 6) % 2 === 0) {
      const y = Math.round(VIEW.h * 0.36);
      const right = bw.side > 0;
      const ex = right ? VIEW.w - 10 : 10;
      ctx.fillStyle = RED;
      for (let k = 0; k < 7; k++) {
        const dx = right ? k : -k;
        ctx.fillRect(ex - dx, y - 7 + k, 2, 1);
        ctx.fillRect(ex - dx, y + 7 - k, 2, 1);
      }
      drawText(ctx, 'BOARDERS', right ? ex - 12 : ex + 12, y - 3, RED, { align: right ? 'right' : 'left' });
    }
  }

  /** How long each enemy has carried each mark (for the pop-in). */
  private markAge = new Map<string, number>();

  /**
   * What each marked enemy carries, under it: a flame, a bolt, a cracked diamond. A new one pops in
   * at double size; one running out blinks; the flame doubles up as the burn stacks.
   */
  private marks(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const live = new Set<string>();
    for (const e of lv.enemies) {
      if (e.dead || e.t < 0 || e.state === 'hidden') continue;
      const m = e.mk;
      const on: [MarkKind, number][] = [];
      if (m.burn > 0) on.push(['burn', m.burn]);
      if (m.shock > 0) on.push(['shock', m.shock]);
      if (m.crack > 0) on.push(['crack', m.crack]);
      if (!on.length) continue;
      // under it, by its health bar: clear of the numbers rising off it
      const s = this.toScreen(view, e.x, FLIGHT_Y, e.z + e.r + 1.3);
      const step = 12;
      on.forEach(([kind, left], i) => {
        const key = `${e.id}:${kind}`;
        live.add(key);
        const age = (this.markAge.get(key) ?? 0) + 1 / 60;
        this.markAge.set(key, age);
        if (left < 0.6 && Math.floor(this.time * 12) % 2 === 0) return;
        const big = age < 0.12;
        const px = big ? 2 : 1;
        const cx = Math.round(s.x + (i - (on.length - 1) / 2) * step);
        const x = cx - Math.round((9 * px) / 2);
        const y = Math.round(s.y + 5 - (big ? 4 : 0));
        markIcon(ctx, kind, x, y, px);
        // the burn's stacks: a pip for each past the first
        if (kind === 'burn' && !big)
          for (let k = 1; k < m.stacks; k++) {
            ctx.fillStyle = '#120c18';
            ctx.fillRect(x + 1 + (k - 1) * 4, y + 10, 4, 3);
            ctx.fillStyle = '#ffd890';
            ctx.fillRect(x + 2 + (k - 1) * 4, y + 11, 2, 1);
          }
      });
    }
    for (const k of [...this.markAge.keys()]) if (!live.has(k)) this.markAge.delete(k);
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
