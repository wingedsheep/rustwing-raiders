import * as THREE from 'three';
import { HOT_BOLTS, HOT_CRACK, HULL_STEP, RIPOSTE_TIME as RIPOSTE_SHOWN, SHIELD_STORE, WELD as WELDING, type Enemy, type Level, type Player } from '../sim/level';
import { poiseOf, sigName } from '../sim/boss';
import { ChainPips, brokenBar, glint, moveMark, readMark } from './tells';
import { FOES, PALETTE, type Foe } from '../sim/factions';
import { GRAFTS, VERBS, hasVerb } from '../game/grafts';
import { coreBadge } from './core-icon';
import { FLIGHT_Y } from '../sim/types';
import { drawText, textWidth, wrap } from './font';
import { tierOf } from '../game/loot';
import { frameById, LOAD_CLASS, partById, type Hardpoint, type PartClass } from '../game/parts';
import { cellsOf, socket } from '../sim/build';
import type { LevelView } from '../view/level-view';
import { LIVERY } from '../view/ship-model';
import { clamp } from '../util';
import { markIcon } from './mark-icons';
import { TIER_COLOR, haulerIcon, strongboxIcon } from './widgets';
import { RUNNER } from '../sim/heist';
import { ROLES } from '../sim/convoy';
import type { MarkKind } from '../game/parts';
import type { DeviceId } from '../input';
import { controlsCard, CONTROLS_H, CONTROLS_W } from './controls';

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
/** Volatile crates: the hazard paint, the rattle. */
export const HOT = '#ff6a2a';
export const RED = '#ff5a4a';
/** The Weld: mending green. */
export const WELD = '#8affb0';
export const GREEN = '#8affb0';
export const CYAN = '#8affe0';
/** The riposte's gold (as the view's). */
const RIPOSTE = '#ffd060';

/** The convoy's colour (an escort's haulers), and what their hull bars go through as they're worn down. */
export const HAULER = '#8ad0ff';
/** A heist's colour (its site, its orders, the strongboxes' drogues). */
export const HEIST = '#5ae0c0';
export const hullColor = (f: number, t: number) => (f > 0.5 ? HAULER : f > 0.2 ? '#ffb04a' : Math.floor(t * 8) % 2 ? RED : '#ffffff');

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Each button's hardpoints in its colour (the colours are VERB_COLOR's in ui/loot-card.ts). */
export const HARDPOINT_COLOR: Record<Hardpoint, string> = { T: '#ff8a4a', H: '#ff5a78', A: '#ffd04a', S: '#8affb0' };

export const CLASS_COLOR: Record<PartClass, string> = {
  gun: '#ff8a4a',
  engine: '#6ad0ff',
  defense: '#a0a8b8',
  booster: '#d08aff',
  special: '#8affb0',
};

/** The kinds met so far, in any run (the field guide shows each once). */
const JOURNAL = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem('rustwing.journal') ?? '[]'));
  } catch {
    return new Set<string>();
  }
})();
const saveJournal = () => {
  try {
    localStorage.setItem('rustwing.journal', JSON.stringify([...JOURNAL]));
  } catch {
    // (no storage: it shows again next time)
  }
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
/**
 * A ship's hull as a bar, notched every HULL_STEP so it reads at a glance. `ghost`: what it read a
 * moment ago, drawn pale over what's just been lost; `blink`: low, it flashes.
 */
export function hullBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hull: number, max: number, ghost = hull, blink = false) {
  const px = (v: number) => Math.round(w * clamp(v / Math.max(1, max), 0, 1));
  ctx.fillStyle = '#3a2e48';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffe0b0';
  ctx.fillRect(x + px(hull), y, px(ghost) - px(hull), h);
  ctx.fillStyle = blink ? '#ffffff' : hull / max <= 0.25 ? '#ff4a3a' : RED;
  ctx.fillRect(x, y, px(hull), h);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x, y, px(hull), 1);
  ctx.fillStyle = '#1a1020';
  for (let v = HULL_STEP; v < max; v += HULL_STEP) ctx.fillRect(x + px(v), y, 1, h);
}

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
      if (!socket(f, c, r)) continue;
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
  /** The chain of kills, as pips. */
  private chain = new ChainPips();
  /** The field-guide card showing (see journal). */
  private guide: { kind: Foe; t: number; color: string } | null = null;
  /** Device pixels, and device pixels per UI texel (to put world points on the UI). */
  dw = 1;
  dh = 1;
  scale = 1;
  /** Each player's heavy button, as a prompt names it ('X', 'O'). */
  heavyKeys: string[] = [];
  /** And each player's aux button (the guard's hint names it). */
  auxKeys: string[] = [];
  /** The view, as last drawn (the plates read its flashes). */
  private view: LevelView | null = null;
  /** Each player's device (the pause shows their controls). */
  devs: DeviceId[] = [];
  /** Scrap on its way up to the tin, from where it was picked up (UI texels); it counts when it lands. */
  private motes: { x: number; y: number; t: number; v: number; bend: number }[] = [];
  /** Where the tin is, and how hard the count last jumped (1, falling away). */
  private tin = { x: 0, y: 0 };
  private bump = 0;
  /** Each player's hull as the bar last showed it: it drains down after a hit, so you see the bite. */
  private hullShown: number[] = [];

  draw(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView, devices: string[], paused: boolean) {
    this.time += 1 / 60;
    for (const g of view.scrapGot) {
      const s = this.toScreen(view, g.x, FLIGHT_Y, g.z);
      this.motes.push({ x: s.x, y: s.y, t: 0, v: g.v, bend: (Math.random() - 0.5) * 140 });
    }
    view.scrapGot.length = 0;
    this.view = view;
    this.topBar(ctx, lv);
    this.field(ctx, lv, view);
    this.flyMotes(ctx);
    if (paused) this.pause(ctx, lv);
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
    if (lv.heist && !lv.heist.gone) {
      // a heist: where along the route it spools, and where it jumps
      const sx0 = rx + Math.round(rw * lv.heist.spoolAt);
      const jx = rx + Math.round(rw * lv.heist.jumpAt);
      const spooling = lv.heist.state === 'spool';
      ctx.fillStyle = spooling && Math.floor(this.time * 6) % 2 ? '#ffffff' : '#8af0ff';
      ctx.globalAlpha = spooling ? 0.9 : 0.5;
      ctx.fillRect(sx0, 15, jx - sx0, 1);
      ctx.fillRect(sx0, 19, jx - sx0, 1);
      ctx.globalAlpha = 1;
      ctx.fillRect(jx, 12, 1, 9);
      ctx.fillRect(jx - 1, 12, 3, 1);
    }
    const fx = rx + Math.round(rw * clamp(lv.progress, 0, 1));
    ctx.fillStyle = INK;
    ctx.fillRect(fx - 1, 14, 3, 7);
    const mode = { raid: 'RAID', hunt: 'HUNT', escort: 'ESCORT', heist: 'HEIST', boss: 'WARDEN' }[lv.spec.mode];
    drawText(ctx, `${lv.spec.planet.name} · ${mode}`, rx, 6, DIM, { shadow: false });
    if (lv.convoy) {
      // an escort: the three haulers, each with what's left of its hull
      lv.convoy.haulers.forEach((h, i) => {
        const hx = rx + rw - 3 * 20 + i * 20 + 4;
        const hit = h.hitT < 0.12 && !h.dead;
        haulerIcon(ctx, hx, 6, hit ? '#ffffff' : h.boarders && Math.floor(this.time * 8) % 2 ? RED : ROLES[h.role].color, h.dead);
        if (!h.dead) bar(ctx, hx + 7, 9, 8, 2, h.hp / h.max, hullColor(h.hp / h.max, this.time), 'rgba(60,48,80,0.8)');
      });
    } else if (lv.heist) {
      // a heist: the three strongboxes, aboard, falling, caught or lost
      lv.heist.fate.forEach((f, i) => {
        const hx = rx + rw - 3 * 12 + i * 12 + 4;
        const blink = Math.floor(this.time * 8) % 2;
        const col = f === 'caught' ? GOLD : f === 'loose' ? (blink ? '#ffffff' : GOLD) : HEIST;
        strongboxIcon(ctx, hx, 5, col, f === 'fell' || f === 'jumped');
        if (f === 'caught') {
          ctx.fillStyle = GOLD;
          ctx.fillRect(hx, 13, 5, 1);
        }
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
    // (what's still flying up doesn't count yet)
    const shown = `${Math.max(0, lv.scrap - this.motes.reduce((a, m) => a + m.v, 0))}`;
    const b = this.bump;
    drawText(ctx, shown, sx, 7 - Math.round(b * 2), b > 0.55 ? '#ffffff' : GOLD, { shadow: false });
    const ix = sx + textWidth(shown) + 4;
    this.tin = { x: ix, y: 10 };
    const r = 1 + Math.round(b * 2);
    ctx.fillStyle = b > 0.55 ? '#ffffff' : GOLD;
    ctx.fillRect(ix - r, 10 - r, r * 2 + 1, r * 2 + 1);
    if (b > 0) {
      // a ring off the tin as a piece lands
      const o = Math.round(3 + (1 - b) * 6);
      ctx.globalAlpha = b;
      ctx.strokeStyle = GOLD;
      ctx.strokeRect(ix - o + 0.5, 10 - o + 0.5, o * 2, o * 2);
      ctx.globalAlpha = 1;
    }
    this.bump = Math.max(0, b - 4 / 60);
    drawText(ctx, String(lv.score).padStart(7, '0'), ps[1] ? tx + 98 : tx - 4, 7, INK, { align: 'right', shadow: false });
    void align;
  }

  /** The scrap flying up to the tin: off to the side first, then drawn in hard, a short gold tail behind. */
  private flyMotes(ctx: CanvasRenderingContext2D) {
    const FLY = 0.42;
    const at = (m: (typeof this.motes)[number], t: number) => {
      const f = clamp(t / FLY, 0, 1);
      const e = f * f;
      const cx = m.x + m.bend;
      const cy = m.y + 10;
      const u = 1 - e;
      return { x: u * u * m.x + 2 * u * e * cx + e * e * this.tin.x, y: u * u * m.y + 2 * u * e * cy + e * e * this.tin.y };
    };
    for (const m of this.motes) {
      m.t += 1 / 60;
      const big = m.v > 1;
      for (let k = 2; k >= 0; k--) {
        const p = at(m, m.t - k * 0.025);
        const s = (big ? 2 : 1) + (k === 0 ? 1 : 0);
        ctx.globalAlpha = k === 0 ? 1 : 0.5 / k;
        ctx.fillStyle = k === 0 && big ? '#ffffff' : GOLD;
        ctx.fillRect(Math.round(p.x) - s, Math.round(p.y) - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      if (m.t >= FLY) this.bump = Math.min(1, this.bump + (big ? 0.8 : 0.5));
    }
    this.motes = this.motes.filter((m) => m.t < FLY);
  }

  /**
   * The Weld at the ship: a bar over it filling as the weld goes (pale while it's only held, then
   * green and committed); full with the hull short, a quiet WELD READY under it now and then.
   */
  private welding(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number) {
    if (p.weldT > 0) {
      const gw = 26;
      const k = clamp((p.weldT - WELDING.hold) / WELDING.time, 0, 1);
      ctx.fillStyle = 'rgba(14,10,22,0.7)';
      ctx.fillRect(Math.round(x - gw / 2) - 1, Math.round(y - 20), gw + 2, 5);
      ctx.fillStyle = p.weldT < WELDING.hold ? '#4a8a68' : WELD;
      ctx.fillRect(Math.round(x - gw / 2), Math.round(y - 19), Math.max(1, Math.round(gw * (p.weldT < WELDING.hold ? p.weldT / WELDING.hold : k))), 3);
      if (p.weldT >= WELDING.hold) drawText(ctx, 'WELDING', x, y - 30, WELD, { align: 'center' });
    } else if (p.weld >= 1 && p.hp < p.stats.hp && this.time % 4 < 1.2) {
      drawText(ctx, 'WELD READY: GUNS OFF, HOLD FOCUS', x, y + 30, WELD, { align: 'center' });
    }
  }

  /**
   * At the ship, only when they matter: the riposte draining away in gold over it; the dashes,
   * flashed red under it when one was pressed with none left; and, early in a run on a ship with a
   * guard, how to parry, until the first one lands.
   */
  private counters(ctx: CanvasRenderingContext2D, lv: Level, p: Player, x: number, y: number) {
    if (p.riposte > 0) {
      const gw = 26;
      const k = p.riposte / RIPOSTE_SHOWN;
      ctx.fillStyle = 'rgba(14,10,22,0.7)';
      ctx.fillRect(Math.round(x - gw / 2) - 1, Math.round(y - 19), gw + 2, 4);
      ctx.fillStyle = k > 0.25 || Math.floor(this.time * 12) % 2 ? RIPOSTE : '#ffffff';
      ctx.fillRect(Math.round(x - (gw * k) / 2), Math.round(y - 18), Math.max(1, Math.round(gw * k)), 2);
    }
    const dry = this.view?.dryT[p.id] ?? 9;
    if (dry < 0.45) {
      const n = p.stats.dashes;
      const x0 = Math.round(x - (n * 6 - 1) / 2);
      const jolt = dry < 0.1 ? Math.round(Math.sin(dry * 120) * 2) : 0;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = 'rgba(14,10,22,0.7)';
        ctx.fillRect(x0 + i * 6 - 1 + jolt, Math.round(y + 29), 6, 5);
        ctx.fillStyle = i < p.dashes ? hex(LIVERY[p.id][2]) : Math.floor(dry * 16) % 2 ? RED : '#5a2a2a';
        ctx.fillRect(x0 + i * 6 + jolt, Math.round(y + 30), 4, 3);
      }
    }
    if (p.stats.aux === 'parry' && p.parries === 0 && lv.spec.difficulty < 0.35 && lv.time > 5 && lv.time < 40 && this.time % 6 < 2.4) {
      drawText(ctx, `${this.auxKeys[p.id] ?? 'AUX'} AS SMALL SHOTS LAND: PARRY`, x, y + 38, '#ffffff', { align: 'center' });
      drawText(ctx, 'A PERFECT, AND THE GUNS RIPOSTE', x, y + 47, RIPOSTE, { align: 'center' });
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
    // the hull: a bar as long as the hull is deep, what a hit bit off draining away after it
    const hw = Math.round(clamp(s.hp * 0.45, 24, 56));
    const shown = Math.max(p.hp, Math.min(s.hp, (this.hullShown[p.id] ?? p.hp) - s.hp / 150));
    this.hullShown[p.id] = shown;
    hullBar(ctx, cx, 8, hw, 6, p.hp, s.hp, shown, p.hp > 0 && p.hp <= s.hp * 0.25 && Math.floor(this.time * 4) % 2 === 1);
    cx += hw + 3;
    // the shield: a bar beside it, as long as the shield is deep, filling back after a lull
    if (s.shield > 0) {
      const sw = Math.round(clamp(s.shield * 0.45, 8, 40));
      ctx.fillStyle = '#3a2e48';
      ctx.fillRect(cx, 8, sw, 6);
      ctx.fillStyle = CYAN;
      ctx.fillRect(cx, 8, Math.round((sw * p.shield) / s.shield), 6);
      // under it, a thin line: what's left this level to refill it from
      ctx.fillStyle = '#3a2e48';
      ctx.fillRect(cx, 15, sw, 1);
      ctx.fillStyle = CYAN;
      ctx.fillRect(cx, 15, Math.round(sw * Math.min(1, p.shieldStore / (s.shield * SHIELD_STORE))), 1);
      cx += sw + 3;
    }
    // the Weld: a cell filling as you hit things; full, a cross that pulses while the hull is short
    cx += 2;
    const full = p.weld >= 1;
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(cx, 7, 7, 8);
    ctx.fillStyle = full ? (p.hp < s.hp && Math.floor(this.time * 3) % 2 ? '#ffffff' : WELD) : '#4a8a68';
    ctx.fillRect(cx, 7 + Math.round(8 * (1 - p.weld)), 7, Math.round(8 * p.weld));
    if (full) {
      ctx.fillStyle = '#1a1020';
      ctx.fillRect(cx + 3, 8, 1, 6);
      ctx.fillRect(cx + 1, 10, 5, 2);
    }
    // SPARE TANK: a second, thinner cell beside it
    if (p.ch.knacks.has('sparetank')) {
      ctx.fillStyle = '#3a2e48';
      ctx.fillRect(cx + 8, 7, 3, 8);
      ctx.fillStyle = p.ch.weld2 >= 1 ? WELD : '#4a8a68';
      ctx.fillRect(cx + 8, 7 + Math.round(8 * (1 - p.ch.weld2)), 3, Math.round(8 * p.ch.weld2));
      cx += 4;
    }
    cx += 9;
    // dashes: pips, the next one filling
    cx += 3;
    const dry = (this.view?.dryT[p.id] ?? 9) < 0.35 && Math.floor(this.time * 16) % 2 === 0;
    for (let i = 0; i < s.dashes; i++) {
      ctx.fillStyle = dry ? RED : i < p.dashes ? col : '#3a2e48';
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
      // a guard let fall on nothing refills red: the long wait a whiff costs
      const whiffed = !ready && s.aux === 'parry' && (this.view?.whiffT[p.id] ?? 9) < p.auxMax + 0.1;
      ctx.fillStyle = ready ? (p.auxT > 0 || p.riposte > 0 ? '#ffffff' : '#ffc860') : whiffed ? '#a04a3a' : '#806838';
      ctx.fillRect(cx, 7 + Math.round(8 * (1 - k)), 9, Math.round(8 * k));
      drawText(ctx, { parry: 'P', tether: 'T', flare: 'F', siphon: 'S', bulwark: 'W', beacon: 'B' }[s.aux], cx + 2, 7, ready ? '#1a1020' : '#c8b8d8', { shadow: false });
      cx += 11;
    }
    // the Burn: what boosting spends, earned back by flying close; brighter while it's being spent
    const burnCol = p.boosting > 0 ? (Math.floor(this.time * 12) % 2 ? '#ffffff' : '#ffb04a') : p.burn < 0.15 ? '#a04a3a' : '#ff8a3a';
    bar(ctx, x0 + 4, 16, pw - 8, 2, p.burn, burnCol, 'rgba(60,48,80,0.6)');
    if (s.special) {
      const ready = p.charge >= 1;
      bar(ctx, x0 + 4, 19, pw - 8, 2, p.charge, ready ? (Math.floor(this.time * 6) % 2 ? GOLD : '#ffffff') : '#c0a040', 'rgba(60,48,80,0.6)');
    }
    coreBadge(ctx, p.ch, side === 'left' ? x0 + pw + 8 : x0 - 8, 13, this.time);
    if (p.down) drawText(ctx, lv.players.length > 1 ? 'DOWN! PARTNER: FLY CLOSE' : 'DOWN!', side === 'left' ? x0 : x0 + pw, 28, RED, { align: side });
    else this.grafts(ctx, p, side === 'left' ? x0 : x0 + pw, side);
  }

  /**
   * The wreck grafts on a ship, in a strip under its plate: a socket a verb, in its graft's
   * faction's colour (dark if the ship can't use it), lit white as it goes off; a star for each
   * bond awake.
   */
  private grafts(ctx: CanvasRenderingContext2D, p: Player, x: number, side: 'left' | 'right') {
    if (!Object.keys(p.grafts).length) return;
    const w = VERBS.length * 7 + 3 + p.bonds.length * 7;
    const x0 = side === 'left' ? x + 2 : x - 2 - w;
    plate(ctx, x0 - 2, 25, w + 3, 8, 0.5);
    VERBS.forEach((v, k) => {
      const id = p.grafts[v];
      const cx = x0 + k * 7;
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(cx, 27, 5, 4);
      if (!id) return;
      const col = hex(PALETTE[GRAFTS[id].faction][2]);
      const fired = p.gs.fired[v];
      ctx.fillStyle = fired !== undefined && fired < 0.18 ? '#ffffff' : hasVerb(p.stats, v) ? col : '#4a4058';
      ctx.fillRect(cx, 27, 5, 4);
    });
    p.bonds.forEach((f, k) => drawText(ctx, '✦', x0 + VERBS.length * 7 + 2 + k * 7, 26, hex(PALETTE[f][2]), { shadow: false }));
  }

  /**
   * A volatile crate, over the ship: the crate, a bar of its lock cracking with a notch for each
   * bolt (gold till it gives), and the seconds till it's open.
   */
  private volatile(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number) {
    const w = 40;
    const x0 = Math.round(x - w / 2 + 6);
    const c = clamp(p.crack, 0, 1);
    ctx.fillStyle = 'rgba(14,10,22,0.7)';
    ctx.fillRect(x0 - 12, y - 3, w + 15, 18);
    // the crate, hazard-striped, its warning light blinking
    ctx.fillStyle = HOT;
    ctx.fillRect(x0 - 10, y - 1, 8, 8);
    ctx.fillStyle = '#1a1020';
    for (let s = 0; s < 3; s++) ctx.fillRect(x0 - 10 + s * 3, y + s * 2, 2, 2);
    if (Math.floor(this.time * 5) % 2) {
      ctx.fillStyle = RED;
      ctx.fillRect(x0 - 7, y - 3, 2, 2);
    }
    // the lock: it only fills
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x0, y + 1, w, 3);
    ctx.fillStyle = TIER_COLOR[tierOf(p.crate!)];
    ctx.fillRect(x0, y + 1, Math.round(w * c), 3);
    // a bolt at each step: gold while it holds, dark once it's given
    for (let k = 1; k <= HOT_BOLTS; k++) {
      const bx = x0 + Math.round((w * k) / (HOT_BOLTS + 1));
      ctx.fillStyle = c >= k / (HOT_BOLTS + 1) ? '#3a2e48' : GOLD;
      ctx.fillRect(bx - 1, y, 3, 5);
    }
    const left = Math.ceil((1 - c) * HOT_CRACK[tierOf(p.crate!)]);
    drawText(ctx, `${left}S`, x0 + w / 2, y + 6, '#ffd0a0', { align: 'center', shadow: false });
    if (c > 0.85) glint(ctx, x0 + w + 2, y + 2, 4, this.time, GOLD);
  }

  /**
   * The heavies' rounds, under the ship where the eyes are: a brass shell for each round ready,
   * an empty slot filling up for the one coming back, a gap between guns. Quiet while they're all
   * ready and unused; until the heavy button's first press, its name blinks beside them.
   */
  private rounds(ctx: CanvasRenderingContext2D, lv: Level, p: Player, x: number, y: number) {
    const guns = p.stats.guns.map((g, k) => ({ g, k })).filter(({ g }) => g.heavy);
    if (!guns.length) return;
    const total = guns.reduce((t, { g }) => t + g.heavy, 0);
    const width = total * 4 + (guns.length - 1) * 3 - 1;
    let cx = Math.round(x - width / 2);
    const full = guns.every(({ g, k }) => p.rounds[k] >= g.heavy);
    ctx.globalAlpha = full && p.heavyT > 1.5 ? 0.55 : 1;
    ctx.fillStyle = 'rgba(14,10,22,0.6)';
    ctx.fillRect(cx - 2, y - 1, width + 4, 7);
    for (const { g, k } of guns) {
      for (let n = 0; n < g.heavy; n++) {
        const ready = n < p.rounds[k];
        if (ready) {
          // a shell: brass case, a bright tip (white for a moment after it came back)
          ctx.fillStyle = '#c89a48';
          ctx.fillRect(cx, y + 2, 3, 3);
          ctx.fillStyle = p.heavyT < 0.08 && n === p.rounds[k] - 1 ? '#ffffff' : '#ffd88a';
          ctx.fillRect(cx, y, 3, 2);
        } else {
          ctx.fillStyle = '#3a2e48';
          ctx.fillRect(cx, y, 3, 5);
          if (n === p.rounds[k]) {
            const f = clamp(p.reload[k], 0, 1);
            ctx.fillStyle = '#806838';
            ctx.fillRect(cx, y + 5 - Math.round(5 * f), 3, Math.round(5 * f));
          }
        }
        cx += 4;
      }
      cx += 3;
    }
    ctx.globalAlpha = 1;
    const fired = guns.some(({ k }) => p.shotCount[k] > 0);
    if (!fired && lv.time < 20 && Math.floor(this.time * 3) % 3) {
      const key = this.heavyKeys[p.id] ?? 'X';
      drawText(ctx, `HEAVY ${key}`, x, y + 8, '#ffd88a', { align: 'center' });
    }
  }

  /**
   * The boss's bar: its hull in three segments, one a phase (the one it's in bright, the ones
   * gone dark), its poise under it (full: it breaks into shards, a glint on it), and the name of
   * its signature move in a ribbon under the plate while it makes it. At its last stand the three
   * pips are one, beating red.
   */
  private bossBar(ctx: CanvasRenderingContext2D, lv: Level, boss: Enemy, mid: number, w: number) {
    const b = boss.boss!;
    const bw = Math.min(440, w - 80);
    const bx = Math.round(mid - bw / 2);
    plate(ctx, bx, 28, bw, 24);
    drawText(ctx, lv.spec.planet.boss.name, bx + 5, 31, INK, { shadow: false });
    // which phase: three pips, or the last stand
    if (b.last) {
      // one pip the width of all three, beating like a heart
      const beat = Math.pow(Math.max(0, Math.sin(this.time * 9)), 4);
      ctx.fillStyle = beat > 0.5 ? '#ffffff' : RED;
      ctx.fillRect(bx + bw - 30 - Math.round(beat), 33 - Math.round(beat), 24 + Math.round(beat) * 2, 4 + Math.round(beat) * 2);
    } else
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < b.phase ? '#4a3e58' : k === b.phase ? RED : '#8a8098';
        ctx.fillRect(bx + bw - 30 + k * 9, 33, 6, 4);
      }
    // stringing moves together: a pip for each still to come
    if (b.combo > 0 || b.comboed) drawText(ctx, '>'.repeat(b.combo + 1), bx + bw - 36, 31, '#ffe0b0', { shadow: false, align: 'right' });
    // the hull in three segments, with a gap between
    const x0 = bx + 5;
    const sw = (bw - 10 - 4) / 3;
    const f = boss.hp / boss.max;
    for (let k = 0; k < 3; k++) {
      const sx = Math.round(x0 + k * (sw + 2));
      const lo = k / 3;
      const seg = clamp((f - lo) * 3, 0, 1);
      const col = boss.shielded ? DIM : boss.flash > 0 ? '#ffffff' : 2 - k === b.phase ? RED : '#c83a3a';
      bar(ctx, sx, 41, Math.round(sw), 4, seg, col, 'rgba(42,34,54,0.9)');
    }
    // poise: fills as it's hit, and breaks
    const pz = poiseOf(boss);
    const stag = boss.state === 'stagger';
    if (stag) brokenBar(ctx, x0, 47, bw - 10, 2, this.time, GOLD);
    else bar(ctx, x0, 47, bw - 10, 2, pz, '#e8d8a0', 'rgba(42,34,54,0.7)');
    // its signature, pictured as it comes
    if (sigName(boss) && !stag && b.move) {
      const k = boss.state === 'windup' && boss.stateDur > 0 ? clamp(boss.stateT / boss.stateDur, 0, 1) : 1;
      moveMark(ctx, mid, 56, b.move, k, boss.state === 'attack', this.time, hex(boss.skin.colors[2]));
    }
  }

  /** What the boss has read in how you fly, under its bar: an eye opens on what it saw, holds, and shuts. */
  private bossRead(ctx: CanvasRenderingContext2D, view: LevelView, mid: number) {
    const r = view.bossRead;
    if (!r || r.t > 3.2) return;
    const k = clamp(Math.min(r.t * 5, (3.2 - r.t) * 4), 0, 1);
    readMark(ctx, mid, 88, r.read, r.side, this.time, k, '#ffb0a0');
  }

  /**
   * An elite on the field: its plate at the top, as a boss's (its name, what it is, its armour in
   * gold over its hull, and how many attacks it chains).
   */
  private elitePlate(ctx: CanvasRenderingContext2D, lv: Level, mid: number, w: number) {
    const e = lv.enemies.find((o) => o.elite && !o.dead && o.t > 0.5 && o.title && lv.onScreen(o.x, o.z, 2));
    if (!e) return false;
    const bw = Math.min(260, w - 80);
    const bx = Math.round(mid - bw / 2);
    plate(ctx, bx, 28, bw, 21);
    const what = (FOES as Record<string, { name: string }>)[e.arch]?.name ?? e.skin.name ?? e.arch;
    drawText(ctx, e.title!, bx + 5, 31, GOLD, { shadow: false });
    drawText(ctx, `· ${what.toUpperCase()}`, bx + 9 + textWidth(e.title!), 31, DIM, { shadow: false });
    const of = e.d.chain ?? 0;
    // taken down once: its wreck is that pilot's when it dies
    let right = bx + bw - 5;
    if (e.downBy !== undefined && !e.bounty) right -= drawText(ctx, '✦', right, 31, hex(LIVERY[e.downBy]?.[2] ?? 0xffd04a), { shadow: false, align: 'right' }) + 6;
    // how many attacks it strings together: a chevron each, as the boss's
    if (of > 1) drawText(ctx, '>'.repeat(of), right, 31, '#ffe0b0', { shadow: false, align: 'right' });
    const x0 = bx + 5;
    if (e.armour > 0) bar(ctx, x0, 40, bw - 10, 3, e.armour / e.armourMax, e.hitT < 0.07 ? '#ffffff' : GOLD, 'rgba(42,34,54,0.9)');
    else if (e.state === 'stagger') brokenBar(ctx, x0, 40, bw - 10, 3, this.time, GOLD);
    bar(ctx, x0, 44, bw - 10, 2, e.hp / e.max, e.flash > 0 ? '#ffffff' : RED, 'rgba(42,34,54,0.9)');
    return true;
  }

  /**
   * The field guide (Hollow Knight's Hunter's Journal, cut down): the first time a kind is met,
   * a card slides in at the side with its name and how it fights. Remembered between runs.
   */
  private journal(ctx: CanvasRenderingContext2D, lv: Level, h: number) {
    if (!this.guide) {
      const e = lv.enemies.find((o) => !o.dead && o.t > 0.6 && !o.bounty && FOES[o.arch as Foe]?.tip && !JOURNAL.has(o.arch) && lv.onScreen(o.x, o.z, -2));
      if (e) {
        JOURNAL.add(e.arch);
        saveJournal();
        this.guide = { kind: e.arch as Foe, t: 0, color: hex(e.skin.colors[2]) };
      }
    }
    const g = this.guide;
    if (!g) return;
    g.t += 1 / 60;
    if (g.t > 6.5) {
      this.guide = null;
      return;
    }
    const def = FOES[g.kind];
    const cw = 150;
    const slide = Math.min(1, g.t * 4) * (g.t > 6 ? Math.max(0, 1 - (g.t - 6) * 2) : 1);
    const x = Math.round(-cw + (cw + 8) * (1 - (1 - slide) ** 3));
    const lines = wrap(def.tip ?? '', cw - 12);
    const ch = 30 + lines.length * 10;
    const y = Math.round(h * 0.5 - ch / 2);
    plate(ctx, x, y, cw, ch, 0.8);
    ctx.fillStyle = g.color;
    ctx.fillRect(x, y, 2, ch);
    drawText(ctx, 'NEW FOE', x + 7, y + 4, DIM, { shadow: false });
    drawText(ctx, def.name.toUpperCase(), x + 7, y + 13, g.color, { shadow: false });
    lines.forEach((l, i) => drawText(ctx, l, x + 7, y + 25 + i * 10, INK, { shadow: false }));
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
    if (lv.heist) this.heist(ctx, lv, view);
    // a volatile crate up for grabs: what it is, and what's in it, for as long as it's there
    for (const k of lv.pickups) {
      if (k.kind !== 'hot' || k.dead || !k.part) continue;
      const s = this.toScreen(view, k.x, FLIGHT_Y, k.z);
      const tier = tierOf(k.part);
      drawText(ctx, 'VOLATILE', s.x, s.y - 34, Math.floor(this.time * 5) % 2 ? HOT : '#ffffff', { align: 'center' });
      drawText(ctx, `${tier.toUpperCase()} PART`, s.x, s.y - 25, TIER_COLOR[tier], { align: 'center' });
      drawText(ctx, `HOLD ${HOT_CRACK[tier]}S UNHIT`, s.x, s.y + 16, '#ffd0a0', { align: 'center' });
    }
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
      // (kept on the screen, however near the edge it happened)
      const cx = clamp(s.x, tw / 2 + 4, w - tw / 2 - 4);
      const x0 = cx - tw / 2;
      const x1 = cx + tw / 2;
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
      if (a) drawText(ctx, p.text, cx, y, p.color, { scale: sc, align: 'center' });
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
      this.rounds(ctx, lv, p, s.x, s.y + 22);
      this.welding(ctx, p, s.x, s.y);
      this.counters(ctx, lv, p, s.x, s.y);
      if (p.crate) this.volatile(ctx, p, s.x, s.y - 26);
      // how it's loaded, said once as the level starts (steady goes without saying)
      if (lv.time > 1.2 && lv.time < 4.5 && p.stats.loadClass !== 'steady' && (lv.time < 3.6 || Math.floor(this.time * 8) % 2)) {
        const lc = LOAD_CLASS[p.stats.loadClass];
        drawText(ctx, lc.name, s.x, s.y - 30, lc.color, { align: 'center' });
        drawText(ctx, lc.text, s.x, s.y - 21, '#d8cce8', { align: 'center' });
      }
    }
    // an escort's or a heist's orders, as it starts (in place of the biome's name)
    const mb = view.missionBanner;
    if (mb && mb.t < 5 && lv.heist) {
      const fade = Math.min(1, mb.t * 2.5) * (mb.t > 4 ? Math.max(0, 1 - (mb.t - 4)) : 1);
      ctx.globalAlpha = fade;
      const by = Math.round(h * 0.34);
      drawText(ctx, 'HEIST', mid, by, HEIST, { scale: 3, align: 'center' });
      drawText(ctx, 'RUN DOWN THE RUNNER BEFORE IT JUMPS', mid, by + 28, INK, { align: 'center' });
      drawText(ctx, 'SHOOT ITS STRONGBOXES LOOSE, AND CATCH THEM AS THEY FALL', mid, by + 40, '#d8cce8', { align: 'center' });
      for (let i = 0; i < 3; i++) strongboxIcon(ctx, mid - 22 + i * 18, by + 54, HEIST);
      ctx.globalAlpha = 1;
    } else if (mb && mb.t < 5) {
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
    // and who it is, once the warning's done
    if (bb && bb.t > 3.5 && bb.t < 7.5) {
      const a = clamp(Math.min(bb.t - 3.5, 7.5 - bb.t) * 2, 0, 1);
      ctx.globalAlpha = a;
      drawText(ctx, bb.name, mid, Math.round(h * 0.36), GOLD, { scale: 2, align: 'center' });
      drawText(ctx, bb.title.toUpperCase(), mid, Math.round(h * 0.36) + 20, '#d8cce8', { align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (boss && boss.t > 0) {
      this.bossBar(ctx, lv, boss, mid, w);
      this.bossRead(ctx, view, mid);
    }
    const elite = !(boss && boss.t > 0) && this.elitePlate(ctx, lv, mid, w);
    // the chain under whatever plate is up
    this.chain.draw(ctx, lv.combo, mid, boss && boss.t > 0 ? 108 : elite ? 54 : 30, 1 / 60);
    this.journal(ctx, lv, h);
    if (lv.state === 'clear' && lv.ending > 0.4) {
      const t = lv.ending;
      const hs = lv.heist;
      const word = lv.spec.mode === 'boss' ? 'WARDEN DOWN' : lv.convoy ? (lv.convoy.delivered ? `${lv.convoy.delivered}/3 HOME` : 'CONVOY LOST') : hs ? (hs.state === 'down' ? 'RUNNER DOWN' : `${hs.caught}/3 CAUGHT`) : 'CLEAR';
      const bad = (lv.convoy && !lv.convoy.delivered) || (hs && hs.state !== 'down' && !hs.caught);
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, word, mid, h * 0.4, bad ? RED : GOLD, { scale: 4, align: 'center' });
    }
    if (lv.state === 'failed' && lv.ending > 0.8) drawText(ctx, 'SHOT DOWN', mid, h * 0.42, RED, { scale: 4, align: 'center' });
  }

  /**
   * A heist, on the field: a gold pip of hull under each strongbox still aboard and each engine
   * running (what to shoot), CATCH! bobbing over a loose strongbox (red as it nears the bottom),
   * the bridge's hull once its shield is down, and the jump coming.
   */
  private heist(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const hs = lv.heist!;
    const blink = Math.floor(this.time * 6) % 2 === 0;
    const pip = (e: { x: number; z: number; hp: number; max: number; dead: boolean }, w: number, col: string) => {
      if (e.dead) return;
      const s = this.toScreen(view, e.x, FLIGHT_Y, e.z + 2.2);
      const x = Math.round(s.x - w / 2);
      const y = Math.round(s.y);
      ctx.fillStyle = 'rgba(14,10,22,0.75)';
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, Math.max(1, Math.round(w * (e.hp / e.max))), 2);
    };
    if (!hs.gone && lv.state === 'flying') {
      hs.pods.forEach((e) => pip(e, 14, GOLD));
      hs.engines.forEach((e) => pip({ ...e, z: e.z + 1.2, x: e.x, hp: e.hp, max: e.max, dead: e.dead }, 18, '#ffb04a'));
      const c = hs.core;
      if (!c.shielded && !c.dead) {
        const s = this.toScreen(view, c.x, FLIGHT_Y, c.z - 5);
        const bw = 44;
        const x = Math.round(s.x - bw / 2);
        drawText(ctx, 'BRIDGE', s.x, s.y - 12, blink ? HEIST : INK, { align: 'center' });
        ctx.fillStyle = 'rgba(14,10,22,0.8)';
        ctx.fillRect(x - 1, s.y - 2, bw + 2, 5);
        ctx.fillStyle = c.flash > 0 ? '#ffffff' : HEIST;
        ctx.fillRect(x, s.y - 1, Math.max(1, Math.round(bw * (c.hp / c.max))), 3);
      }
      if (hs.state === 'spool') {
        // the jump coming: a countdown over it
        const left = hs.jumpIn;
        const s = this.toScreen(view, hs.x, FLIGHT_Y, hs.z + RUNNER.back + 2.5);
        drawText(ctx, `JUMP IN ${left.toFixed(1)}`, s.x, s.y, left < 3 && blink ? '#ffffff' : '#8af0ff', { align: 'center' });
      }
    }
    for (const c of hs.loose) {
      if (c.dead) continue;
      const s = this.toScreen(view, c.x, FLIGHT_Y, c.z);
      const low = c.z > lv.bottom - 12;
      const col = low ? (blink ? RED : '#ffffff') : GOLD;
      const bob = Math.round(Math.sin(this.time * 9) * 2);
      const y = Math.round(s.y - 30 + bob);
      drawText(ctx, 'CATCH!', s.x, y, col, { align: 'center' });
      ctx.fillStyle = col;
      for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(s.x) - 3 + k, y + 10 + k, 7 - k * 2, 1);
    }
    // the spool's warning, once, as it starts
    const sw = view.spoolWarn;
    if (sw && sw.t < 2.6 && Math.floor(sw.t * 5) % 2 === 0) {
      const y = Math.round(VIEW.h * 0.3);
      ctx.fillStyle = 'rgba(20,80,110,0.55)';
      ctx.fillRect(0, y, VIEW.w, 30);
      drawText(ctx, 'JUMP DRIVE SPOOLING', VIEW.w / 2, y + 4, '#ffffff', { scale: 2, align: 'center' });
      const aboard = hs.fate.filter((f) => f === 'aboard').length;
      drawText(ctx, aboard ? `${aboard} STRONGBOX${aboard > 1 ? 'ES' : ''} STILL ABOARD` : 'NOTHING LEFT ABOARD', VIEW.w / 2, y + 21, aboard ? GOLD : '#8af0ff', { align: 'center' });
    }
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
      // the bar is as long as the hull is deep: an armoured barge's is longer, a courier's short
      const bw = Math.round(30 * Math.sqrt(hl.max / c.baseHull));
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
      // what it is, under the bar: spelled out as the level opens, then just the prize's tag
      const role = ROLES[hl.role];
      const intro = clamp(1 - (lv.time - 9) / 1.5, 0, 1);
      if (hl.role !== 'freighter' && (intro > 0 || hl.role === 'prize')) {
        ctx.globalAlpha = Math.max(intro, hl.role === 'prize' ? 0.8 : 0);
        drawText(ctx, role.name, x + bw / 2, y + 6, role.color, { align: 'center' });
        ctx.globalAlpha = intro;
        if (intro > 0) drawText(ctx, role.text, x + bw / 2, y + 16, INK, { align: 'center' });
        ctx.globalAlpha = 1;
      }
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

  /** Paused: the controls of every pilot, as their device and their ship have them. */
  private pause(ctx: CanvasRenderingContext2D, lv: Level) {
    ctx.fillStyle = 'rgba(12,8,18,0.72)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    const mid = VIEW.w / 2;
    const n = lv.players.length;
    const y = Math.round(VIEW.h / 2 - (CONTROLS_H + 74) / 2);
    drawText(ctx, 'PAUSED', mid, y, INK, { scale: 3, align: 'center' });
    const gap = 12;
    const x0 = Math.round(mid - (n * CONTROLS_W + (n - 1) * gap) / 2);
    lv.players.forEach((p, i) => {
      controlsCard(ctx, this.devs[i] ?? 'keys', p, hex(LIVERY[i][2]), x0 + i * (CONTROLS_W + gap), y + 34);
    });
    drawText(ctx, 'START / ESC: RESUME      BACK / Q: ABANDON RUN', mid, y + 46 + CONTROLS_H, DIM, { align: 'center' });
  }
}
