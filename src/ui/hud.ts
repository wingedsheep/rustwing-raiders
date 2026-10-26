import * as THREE from 'three';
import { HOT_BOLTS, HOT_CRACK, HULL_STEP, JUMP_TIME, JUMP_WAIT, RIPOSTE_TIME as RIPOSTE_SHOWN, SHIELD_STORE, WELD as WELDING, WELD_HEAL, jumpHelper, type Enemy, type Level, type Player } from '../sim/level';
import { poiseOf, sigName } from '../sim/boss';
import { ChainPips, brokenBar, glint, moveMark, readMark } from './tells';
import { FOES, PALETTE, type Foe } from '../sim/factions';
import { GRAFTS, VERBS, hasVerb } from '../game/grafts';
import { coreBadge, disc, ring } from './core-icon';
import { BRASS, BRASS_LO, brassPlate, cutEdge, cutRect, rivet, slantBar, slantKey, slantOf, slantSpan, type Cuts } from './trim';
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
import { SoundPanel, SOUND_H, SOUND_W } from './sound';
import { Quit } from './accord';
import type { Run } from '../sim/run';
import { KitTray, TRAY } from './kit-tray';

/** The runs whose pilots have been told, big, to fly to a down partner (after that it's said small). */
const TOLD_DOWN = new WeakSet<object>();

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

/**
 * A framed panel: corners cut at 45°, a dark keyline, the fill with a faint sheen down from the
 * top and a little shade at the foot, a hairline all round in the edge colour (full along the top,
 * softer down the sides), and, on a big enough panel, brass rivets in its top corners.
 */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = PANEL, edge = EDGE) {
  const c = h >= 10 && w >= 10 ? 2 : 0;
  const cuts: Cuts = [c, c, c, c];
  cutRect(ctx, x - 1, y - 1, w + 2, h + 2, [c + 1, c + 1, c + 1, c + 1], DARK);
  cutRect(ctx, x, y, w, h, cuts, fill);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,240,255,0.06)');
  g.addColorStop(Math.min(0.5, 12 / Math.max(1, h)), 'rgba(255,240,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  cutRect(ctx, x, y, w, h, cuts, g);
  ctx.globalAlpha = 0.55;
  cutEdge(ctx, x, y, w, h, cuts, edge);
  ctx.globalAlpha = 1;
  ctx.fillStyle = edge;
  ctx.fillRect(x + c, y, w - c * 2, 1);
  if (w >= 60 && h >= 28) {
    rivet(ctx, x + 2, y + 2);
    rivet(ctx, x + w - 5, y + 2);
  }
}

/** A bar, filled to `f`, in segments. */
/**
 * A ship's hull as a bar, notched every HULL_STEP so it reads at a glance. `ghost`: what it read a
 * moment ago, drawn pale over what's just been lost; `blink`: low, it flashes.
 */
export function hullBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, hull: number, max: number, ghost = hull, blink = false) {
  // as the flight HUD's: slanted armour plates, one a HULL_STEP, lit along their tops
  max = Math.max(1, max);
  const px = (v: number) => (w * clamp(v, 0, max)) / max;
  slantKey(ctx, x, y, w, h);
  const body = blink ? '#ffffff' : hull / max <= 0.25 ? '#ff4a3a' : RED;
  for (let v = 0; v < max; v += HULL_STEP) {
    const a = px(v);
    const b = px(Math.min(max, v + HULL_STEP)) - (v + HULL_STEP < max ? 1 : 0);
    slantSpan(ctx, x, y, w, h, a, b, '#3a2e48', 1);
    slantSpan(ctx, x, y, w, h, a, Math.min(b, px(hull)), body, 1, true);
    slantSpan(ctx, x, y, w, h, Math.max(a, px(hull)), Math.min(b, px(ghost)), '#ffe0b0', 1);
  }
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
  ctx.fillStyle = 'rgba(255,240,220,0.14)';
  ctx.fillRect(x + 1, y, w - 2, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
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
  /** The sound levels the pause shows (the flight turns them). */
  readonly sound = new SoundPanel();
  /** Giving up, from the pause (the flight asks it). */
  quit = new Quit(1);
  /** Whose buttons the pause's foot names. */
  hintDevs: DeviceId[] = [];
  /** Scrap on its way up to the tin, from where it was picked up (UI texels); it counts when it lands. */
  private motes: { x: number; y: number; t: number; v: number; bend: number; who: number }[] = [];
  /** Where the tin is, and how hard the count last jumped (1, falling away). */
  private tins: { x: number; y: number }[] = [];
  private bump: number[] = [];
  /** How many tins there are (a pilot's each in co-op). */
  private motesFor = 1;
  /** Each player's hull as the bar last showed it: it drains down after a hit, so you see the bite. */
  private hullShown: number[] = [];
  /** The run being flown (the flight sets it), for what's said once a run and the scrap already in the tins. */
  run: Run | null = null;
  /** Each ship: down last frame, when it went down, and whether its partner's call is the big one. */
  private wasDown: boolean[] = [];
  private downAt: number[] = [];
  private downBig: boolean[] = [];
  /** The kit tray, in a bottom corner (P2's in the other). */
  private tray = new KitTray();
  /** How far each tray has faded for a ship flying over it. */
  private trayFade: number[] = [];

  draw(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView, devices: string[], paused: boolean) {
    this.time += 1 / 60;
    for (const g of view.scrapGot) {
      const s = this.toScreen(view, g.x, FLIGHT_Y, g.z);
      this.motes.push({ x: s.x, y: s.y, t: 0, v: g.v, bend: (Math.random() - 0.5) * 140, who: lv.players.length > 1 ? g.id : 0 });
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
    // no boxes: a soft shade down from the top edge keeps it all readable over any ground
    const shade = ctx.createLinearGradient(0, 0, 0, 40);
    shade.addColorStop(0, 'rgba(8,5,14,0.62)');
    shade.addColorStop(0.55, 'rgba(8,5,14,0.25)');
    shade.addColorStop(1, 'rgba(8,5,14,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, 40);
    // a player's gauges at each end (P2 at the right in co-op; the right end is the takings solo)
    // (each returns its inner end, for a tin to hang off in co-op)
    const plates = [this.player(ctx, lv, ps[0], 12, 'left'), ps[1] ? this.player(ctx, lv, ps[1], w - 12, 'right') : 0];
    this.motesFor = ps.length;
    // the route in the middle: a rail between brass brackets, the biomes along it, the ship's place on it
    const rw = Math.min(240, Math.floor(w * 0.28));
    const rx = Math.floor(w / 2 - rw / 2);
    const segs = lv.spec.biomes;
    const here = lv.terrain.biomeIndex(lv.scroll);
    ctx.fillStyle = 'rgba(10,6,16,0.8)';
    ctx.fillRect(rx - 1, 13, rw + 2, 7);
    segs.forEach((b, i) => {
      const x0 = rx + Math.round((rw * i) / segs.length);
      const x1 = rx + Math.round((rw * (i + 1)) / segs.length) - 1;
      ctx.fillStyle = hex(b.ground[i === here ? 2 : 1]);
      ctx.globalAlpha = i < here ? 0.3 : i === here ? 1 : 0.55;
      ctx.fillRect(x0, 15, x1 - x0, 3);
      ctx.globalAlpha = 1;
      // a brass tick where one biome gives onto the next
      if (i) {
        ctx.fillStyle = BRASS_LO;
        ctx.fillRect(x0 - 1, 12, 1, 9);
        ctx.fillStyle = BRASS;
        ctx.fillRect(x0 - 1, 12, 1, 1);
      }
    });
    for (const bx of [rx - 5, rx + rw + 2]) {
      cutRect(ctx, bx - 1, 9, 5, 15, [1, 1, 1, 1], '#0a0610');
      cutRect(ctx, bx, 10, 3, 13, [1, 1, 1, 1], BRASS_LO);
      ctx.fillStyle = BRASS;
      ctx.fillRect(bx + 1, 10, 1, 12);
      rivet(ctx, bx + 1, 15);
    }
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
    // the distance flown, lit along the rail's foot; the ship an arrowhead riding over it
    ctx.fillStyle = 'rgba(255,226,160,0.5)';
    ctx.fillRect(rx, 18, fx - rx, 1);
    ctx.fillStyle = '#0a0610';
    for (let k = 0; k < 5; k++) ctx.fillRect(fx - 4 + k, 6 + k, 9 - k * 2, 1);
    ctx.fillRect(fx - 1, 11, 3, 10);
    ctx.fillStyle = INK;
    for (let k = 0; k < 4; k++) ctx.fillRect(fx - 3 + k, 7 + k, 7 - k * 2, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fx - 2, 7, 2, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(fx, 12, 1, 8);
    // where and what, under the rail while the level opens; after that the rail says enough
    const intro = clamp(Math.min(lv.time * 2, 7 - lv.time), 0, 1);
    if (intro > 0) {
      const mode = { raid: 'RAID', hunt: 'HUNT', escort: 'ESCORT', heist: 'HEIST', boss: 'WARDEN' }[lv.spec.mode];
      ctx.globalAlpha = intro;
      drawText(ctx, lv.spec.planet.name, rx, 24, INK, { outline: DARK });
      drawText(ctx, mode, rx + textWidth(lv.spec.planet.name) + 7, 24, BRASS, { outline: DARK });
      ctx.globalAlpha = 1;
    }
    if (lv.convoy) {
      // an escort: the three haulers, each with what's left of its hull
      lv.convoy.haulers.forEach((h, i) => {
        const hx = rx + rw - 3 * 20 + i * 20 + 4;
        const hit = h.hitT < 0.12 && !h.dead;
        haulerIcon(ctx, hx, 24, hit ? '#ffffff' : h.boarders && Math.floor(this.time * 8) % 2 ? RED : ROLES[h.role].color, h.dead);
        if (!h.dead) bar(ctx, hx + 7, 27, 8, 2, h.hp / h.max, hullColor(h.hp / h.max, this.time), 'rgba(60,48,80,0.8)');
      });
    } else if (lv.heist) {
      // a heist: the three strongboxes, aboard, falling, caught or lost
      lv.heist.fate.forEach((f, i) => {
        const hx = rx + rw - 3 * 12 + i * 12 + 4;
        const blink = Math.floor(this.time * 8) % 2;
        const col = f === 'caught' ? GOLD : f === 'loose' ? (blink ? '#ffffff' : GOLD) : HEIST;
        strongboxIcon(ctx, hx, 23, col, f === 'fell' || f === 'jumped');
        if (f === 'caught') {
          ctx.fillStyle = GOLD;
          ctx.fillRect(hx, 31, 5, 1);
        }
      });
    } else if (lv.spawned > 0) {
      // the hunt's tally: what's down, and what got past (a full clear pays)
      const clean = lv.missed === 0;
      drawText(ctx, `${lv.killed}/${lv.spawned}${lv.missed ? `  ${lv.missed} MISSED` : ''}`, rx + rw, 24, clean ? GOLD : '#c8bcd8', { align: 'right', outline: DARK });
    }
    // the takings: the scrap and its tin, nothing else (the score waits for the results). Alone, at
    // the right end; in co-op a tin each, hung off your own plate: what you scooped is yours, and
    // what the crew earned (a wave wiped) shows as each one's share of it. The tin shows the lot:
    // what's already in it from the run so far, and this level's takings on top
    const held = (i: number) => this.run?.crew[i]?.scrap ?? 0;
    if (!ps[1]) this.takings(ctx, 0, held(0) + lv.scrap, w - 12, 'right', [8, 3, 3, 3]);
    else {
      const own = ps.map((p) => lv.scrapBy[p.id] ?? 0);
      const crew = Math.floor((lv.scrap - own.reduce((a, v) => a + v, 0)) / ps.length);
      this.takings(ctx, 0, held(0) + own[0] + crew, plates[0] + 4, 'left', [3, 3, 8, 3]);
      this.takings(ctx, 1, held(1) + own[1] + crew, plates[1] - 4, 'right', [8, 3, 3, 3]);
    }
  }

  /** A tin on its brass plate, its outer end at `x`: pilot `i`'s scrap, less what's still flying up to it. */
  private takings(ctx: CanvasRenderingContext2D, i: number, scrap: number, x: number, side: 'left' | 'right', cuts: Cuts) {
    const shown = `${Math.max(0, scrap - this.motes.reduce((a, m) => a + (m.who === i ? m.v : 0), 0))}`;
    const b = this.bump[i] ?? 0;
    const ty = 13;
    const tw = Math.max(textWidth(shown), textWidth('000')) + 30;
    const tx = side === 'left' ? x : x - tw;
    brassPlate(ctx, tx, 5, tw, 17, cuts, 0.8, false);
    const ix = tx + tw - 11;
    disc(ctx, ix, ty, 6, '#0a0610');
    // (co-op: the socket's rim in the pilot's colour, so it's plain whose tin it is)
    ring(ctx, ix, ty, 6, this.motesFor > 1 ? hex(LIVERY[i][2]) : BRASS_LO);
    drawText(ctx, shown, ix - 10, ty - 4 - Math.round(b * 2), b > 0.55 ? '#ffffff' : GOLD, { align: 'right', shadow: BRASS_LO });
    this.tins[i] = { x: ix, y: ty };
    // the tin: a gold diamond with a dark keyline, swelling as a piece lands
    const r = 3 + Math.round(b * 1.5);
    const diamond = (rad: number, col: string) => {
      ctx.fillStyle = col;
      for (let k = -rad; k <= rad; k++) ctx.fillRect(ix - (rad - Math.abs(k)), ty + k, (rad - Math.abs(k)) * 2 + 1, 1);
    };
    diamond(r + 1, DARK);
    diamond(r, b > 0.55 ? '#ffffff' : GOLD);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(ix - 1, ty - r + 1, 1, 2);
    if (b > 0) {
      // a ring off the tin as a piece lands
      const o = Math.round(4 + (1 - b) * 7);
      ctx.globalAlpha = b;
      ctx.strokeStyle = GOLD;
      ctx.strokeRect(ix - o + 0.5, ty - o + 0.5, o * 2, o * 2);
      ctx.globalAlpha = 1;
    }
    this.bump[i] = Math.max(0, b - 4 / 60);
  }

  /** The scrap flying up to the tin: off to the side first, then drawn in hard, a short gold tail behind. */
  private flyMotes(ctx: CanvasRenderingContext2D) {
    const FLY = 0.42;
    // (a pilot's own tin in co-op; alone, the one)
    const tin = (m: (typeof this.motes)[number]) => this.tins[this.motesFor > 1 ? m.who : 0] ?? { x: 0, y: 0 };
    const at = (m: (typeof this.motes)[number], t: number) => {
      const f = clamp(t / FLY, 0, 1);
      const e = f * f;
      const cx = m.x + m.bend;
      const cy = m.y + 10;
      const u = 1 - e;
      return { x: u * u * m.x + 2 * u * e * cx + e * e * tin(m).x, y: u * u * m.y + 2 * u * e * cy + e * e * tin(m).y };
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
      if (m.t >= FLY) this.bump[m.who] = Math.min(1, (this.bump[m.who] ?? 0) + (big ? 0.8 : 0.5));
    }
    this.motes = this.motes.filter((m) => m.t < FLY);
  }

  /**
   * The Weld at the ship: a bar over it filling as the weld goes (pale while it's only held, then
   * green and committed). When it's ready to go, the tray's Weld says so.
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

  /**
   * A player's plate, at one end of the top: a riveted brass plate, its outer end in the
   * pilot's livery. The ship's core sits in a brass socket at the end, like a dial; beside it the
   * slanted gauges (hull and shield, the Burn under them). What the buttons do is in the kit
   * tray, in the bottom corner. At the right end, all of it mirrored. The tag only in co-op:
   * alone, it's plainly you.
   */
  private player(ctx: CanvasRenderingContext2D, lv: Level, p: Player, x: number, side: 'left' | 'right') {
    const s = p.stats;
    const col = hex(LIVERY[p.id][2]);
    const coop = lv.players.length > 1;
    const dir = side === 'left' ? 1 : -1;
    const top = 4;
    const ph = 25;
    const hw = Math.round(clamp(s.hp * 0.6, 36, 80));
    const sw = s.shield > 0 ? Math.round(clamp(s.shield * 0.5, 12, 44)) : 0;
    const gauges = hw + (sw ? sw + 2 : 0) + slantOf(7);
    const pw = 28 + gauges + 9;
    const x0 = side === 'left' ? x : x - pw;
    // an element `off` in from the plate's outer end, `w` wide (mirrored at the right)
    const at = (off: number, w: number) => (dir > 0 ? x0 + off : x0 + pw - off - w);
    brassPlate(ctx, x0, top, pw, ph, dir > 0 ? [3, 3, 9, 3] : [3, 3, 3, 9], 0.8);
    // the livery down the outer end
    ctx.fillStyle = col;
    ctx.fillRect(at(1, 2), top + 4, 2, ph - 8);
    // the core, in its socket
    const cx = at(14, 0);
    const cy = top + 12;
    disc(ctx, cx, cy, 9, '#0a0610');
    ring(ctx, cx, cy, 9, BRASS_LO);
    ring(ctx, cx, cy, 8, BRASS, 0.62, 1.12);
    ring(ctx, cx, cy, 8, BRASS_LO, 0.12, 0.62);
    coreBadge(ctx, p.ch, cx, cy, this.time);
    // the hull: as long as the hull is deep, notched every HULL_STEP, what a hit bit off draining away
    const shown = Math.max(p.hp, Math.min(s.hp, (this.hullShown[p.id] ?? p.hp) - s.hp / 150));
    this.hullShown[p.id] = shown;
    const low = p.hp <= s.hp * 0.25;
    const blink = p.hp > 0 && low && Math.floor(this.time * 4) % 2 === 1;
    const gy = top + 6;
    this.hull(ctx, p, at(28, hw + 3), gy, hw, dir, shown, low, blink);
    // the shield beside it, filling back after a lull; along its foot what's left to refill it from
    if (sw) {
      const sx = at(28 + hw + 2, sw + 3);
      slantBar(ctx, sx, gy, sw, 7, p.shield / s.shield, CYAN, { dir });
      slantBar(ctx, sx, gy + 9, sw, 1, Math.min(1, p.shieldStore / (s.shield * SHIELD_STORE)), '#4ab0a0', { dir, keyline: false });
    }
    // co-op: the pilot's tag on a tab hanging under the outer end
    if (coop) {
      const tx = at(4, 17);
      cutRect(ctx, tx - 1, top + ph, 19, 10, dir > 0 ? [0, 0, 3, 3] : [0, 0, 3, 3], '#0a0610');
      cutRect(ctx, tx, top + ph, 17, 9, [0, 0, 2, 2], col);
      drawText(ctx, `P${p.id + 1}`, tx + 3, top + ph + 1, '#1a1020', { shadow: false });
    }
    const edge = side === 'left' ? x0 + (coop ? 24 : 4) : x0 + pw - (coop ? 24 : 4);
    if (p.out) drawText(ctx, 'CRASHED: OUT THIS LEVEL', edge, top + ph + 3, DIM, { align: side, outline: DARK });
    else if (p.down && coop && jumpHelper(lv.players, p)) drawText(ctx, 'JUMPSTARTING...', edge, top + ph + 3, GREEN, { align: side, outline: DARK });
    else if (p.down && coop) {
      const left = Math.ceil(Math.max(0, JUMP_WAIT - p.downT));
      const blink = left <= 5 && Math.floor(this.time * 6) % 2 === 0;
      drawText(ctx, `DOWN! ${left}S  P${2 - p.id} FLY CLOSE`, edge, top + ph + 3, blink ? '#ffffff' : RED, { align: side, outline: DARK });
    } else if (p.down) drawText(ctx, 'DOWN!', edge, top + ph + 3, RED, { align: side, outline: DARK });
    else this.grafts(ctx, p, edge, side);
    return side === 'left' ? x0 + pw : x0;
  }

  /**
   * The hull: a slanted bar of armour plates, one a HULL_STEP, each lit along its top. What a hit
   * just bit off drains away in cream; low, the plates beat red. Past the hull, in the empty
   * plates, what the Weld would mend: dim green hatching filling in as it charges, solid and
   * shimmering once it's ready, burning in as the weld goes.
   */
  private hull(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, w: number, dir: 1 | -1, shown: number, low: boolean, blink: boolean) {
    const max = p.stats.hp;
    const h = 7;
    const px = (v: number) => (w * clamp(v, 0, max)) / max;
    slantKey(ctx, x, y, w, h, dir);
    if (low) {
      // a red glow round it while it's low, beating
      const beat = 0.35 + 0.35 * Math.max(0, Math.sin(this.time * 8));
      ctx.globalAlpha = beat;
      slantKey(ctx, x - 1, y - 1, w + 2, h + 2, dir, '#ff3a2a');
      ctx.globalAlpha = 1;
      slantKey(ctx, x, y, w, h, dir);
    }
    const body = blink ? '#ffffff' : low ? '#ff4a3a' : '#ff5a4a';
    // the mend: from the hull to what a weld would bring it to
    const mendTo = Math.min(max, p.hp + Math.round(max * WELD_HEAL));
    const welding = p.weldT >= WELDING.hold ? clamp((p.weldT - WELDING.hold) / WELDING.time, 0, 1) : -1;
    for (let v = 0; v < max; v += HULL_STEP) {
      const a = px(v);
      const b = px(Math.min(max, v + HULL_STEP)) - (v + HULL_STEP < max ? 1 : 0);
      slantSpan(ctx, x, y, w, h, a, b, '#2a2036', dir);
      // the hull in it
      slantSpan(ctx, x, y, w, h, a, Math.min(b, px(p.hp)), body, dir, true);
      // the bite, draining
      slantSpan(ctx, x, y, w, h, Math.max(a, px(p.hp)), Math.min(b, px(shown)), '#ffe0b0', dir);
      // the mend waiting in it
      if (p.hp < max && mendTo > p.hp) {
        const m0 = Math.max(a, px(shown));
        const m1 = Math.min(b, px(mendTo));
        if (m1 > m0) {
          if (welding >= 0) {
            slantSpan(ctx, x, y, w, h, m0, m1, '#2a5a40', dir);
            slantSpan(ctx, x, y, w, h, m0, Math.min(m1, px(p.hp) + (px(mendTo) - px(p.hp)) * welding), WELD, dir, true);
          } else if (p.weld >= 1) {
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 5);
            ctx.globalAlpha = pulse;
            slantSpan(ctx, x, y, w, h, m0, m1, '#4ae08a', dir, true);
            ctx.globalAlpha = 1;
          } else {
            // charging: dim, filling from the hull outward
            const fill = px(p.hp) + (px(mendTo) - px(p.hp)) * p.weld;
            slantSpan(ctx, x, y, w, h, m0, Math.min(m1, fill), '#2f6a4a', dir);
          }
        }
      }
    }
    // a glint sweeping the hull now and then
    const g = (this.time * 0.5) % 3;
    if (g < 1 && !low) {
      const gx = px(p.hp) * g;
      slantSpan(ctx, x, y, w, h, gx - 2, Math.min(px(p.hp), gx + 1), 'rgba(255,255,255,0.35)', dir);
    }
  }

  /**
   * Each pilot's kit tray, in a bottom corner (P1's at the left, P2's at the right), fading back
   * while a ship flies over it so it never hides one.
   */
  private trays(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const ships = lv.players.filter((q) => !q.out).map((q) => this.toScreen(view, q.x, FLIGHT_Y, q.z));
    lv.players.forEach((p, i) => {
      const cx = i === 0 ? 12 + TRAY.l : VIEW.w - 12 - TRAY.r;
      const cy = VIEW.h - 10 - TRAY.d;
      const over = ships.some((s) => s.x > cx - TRAY.l - 18 && s.x < cx + TRAY.r + 18 && s.y > cy - TRAY.u - 18 && s.y < cy + TRAY.d + 18);
      const f = (this.trayFade[i] = clamp((this.trayFade[i] ?? 0) + (over ? 0.1 : -0.06), 0, 1));
      this.tray.draw(ctx, p, this.devs[i] ?? 'keys', cx, cy, this.time, 1 - f * 0.7, this.view?.dryT[p.id] ?? 9, this.view?.whiffT[p.id] ?? 9);
    });
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
    plate(ctx, x0 - 2, 32, w + 3, 8, 0.5);
    VERBS.forEach((v, k) => {
      const id = p.grafts[v];
      const cx = x0 + k * 7;
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(cx, 34, 5, 4);
      if (!id) return;
      const col = hex(PALETTE[GRAFTS[id].faction][2]);
      const fired = p.gs.fired[v];
      ctx.fillStyle = fired !== undefined && fired < 0.18 ? '#ffffff' : hasVerb(p.stats, v) ? col : '#4a4058';
      ctx.fillRect(cx, 34, 5, 4);
    });
    p.bonds.forEach((f, k) => drawText(ctx, '✦', x0 + VERBS.length * 7 + 2 + k * 7, 33, hex(PALETTE[f][2]), { shadow: false }));
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
    brassPlate(ctx, bx, 28, bw, 24, [3, 3, 6, 6], 0.82, false);
    const name = b.name ?? lv.spec.planet.boss.name;
    drawText(ctx, name, bx + 5, 31, INK, { shadow: false });
    // plating its Liens have bolted on: a steel pip a plate (a blow breaks them all off)
    for (let k = 0; k < b.plates; k++) {
      ctx.fillStyle = boss.hitT < 0.07 ? '#ffffff' : '#c8d4e8';
      ctx.fillRect(bx + 11 + textWidth(name) + k * 6, 32, 4, 5);
      ctx.fillStyle = '#5a6478';
      ctx.fillRect(bx + 11 + textWidth(name) + k * 6, 36, 4, 1);
    }
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
      slantBar(ctx, sx, 41, Math.round(sw) - 2, 4, seg, col);
    }
    // poise: fills as it's hit, and breaks
    const pz = poiseOf(lv, boss);
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
    brassPlate(ctx, bx, 28, bw, 21, [3, 3, 6, 6], 0.82, false);
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
    brassPlate(ctx, x, y, cw, ch, [0, 3, 9, 0], 0.85, false);
    ctx.fillStyle = g.color;
    ctx.fillRect(x, y, 2, ch);
    drawText(ctx, 'NEW FOE', x + 7, y + 4, DIM, { shadow: false });
    drawText(ctx, def.name.toUpperCase(), x + 7, y + 13, g.color, { shadow: false });
    lines.forEach((l, i) => drawText(ctx, l, x + 7, y + 25 + i * 10, INK, { shadow: false }));
  }

  /** A world point (on the flight plane) in UI texels. */
  /**
   * A co-op down, over the field (its reach and the time draining round it are the view's, see
   * jump-view.ts): over the down ship, the seconds it has left or that it's being jumpstarted; by its partner, the call to fly over (big, with how, the
   * first time in a run) and an arrow pointing the way.
   */
  private jumpstarts(ctx: CanvasRenderingContext2D, lv: Level, view: LevelView) {
    const coop = lv.players.length > 1 && lv.state !== 'clear' && lv.state !== 'failed';
    for (const d of lv.players) {
      const down = coop && d.down && !d.out;
      if (down && !this.wasDown[d.id]) {
        this.downAt[d.id] = this.time;
        this.downBig[d.id] = !TOLD_DOWN.has(this.run ?? this);
        TOLD_DOWN.add(this.run ?? this);
      }
      this.wasDown[d.id] = down;
      if (!down) continue;
      const s = this.toScreen(view, d.x, FLIGHT_Y, d.z);
      const helper = jumpHelper(lv.players, d);
      const left = Math.max(0, JUMP_WAIT - d.downT);
      const k = clamp(d.jump / JUMP_TIME, 0, 1);
      const urgent = left < 5;
      const blink = Math.floor(this.time * (urgent ? 8 : 4)) % 2 === 0;
      // over the reach: the seconds left (big at the end), or the jumpstart going, with how far
      const top = s.y - 36;
      if (helper) {
        drawText(ctx, 'JUMPSTARTING', s.x, top - 6, k > 0.8 && blink ? '#ffffff' : GREEN, { align: 'center', outline: DARK });
        bar(ctx, Math.round(s.x - 20), Math.round(top + 4), 40, 2, k, GREEN, 'rgba(14,10,22,0.8)');
      } else drawText(ctx, `${Math.ceil(left)}`, s.x, top - (urgent ? 8 : 0), urgent && blink ? '#ffffff' : RED, { align: 'center', outline: DARK, scale: urgent ? 2 : 1 });
      // its partner: told where to go, until it's there
      for (const h of lv.players) {
        if (h === d || h.down || h.out || helper === h) continue;
        const hs = this.toScreen(view, h.x, FLIGHT_Y, h.z);
        const a = Math.atan2(s.y - hs.y, s.x - hs.x);
        const far = Math.hypot(s.x - hs.x, s.y - hs.y);
        if (far > 34) arrowhead(ctx, hs.x + Math.cos(a) * 22, hs.y + Math.sin(a) * 22, a, blink ? '#ffffff' : RED);
        const since = this.time - (this.downAt[d.id] ?? 0);
        const big = this.downBig[d.id] && since < 4;
        const call = `P${d.id + 1} DOWN: FLY TO THEM`;
        const sc = big ? 2 : 1;
        const tw = textWidth(call, sc);
        const cx = clamp(hs.x, tw / 2 + 6, VIEW.w - tw / 2 - 6);
        const cy = Math.max(hs.y - (big ? 70 : 40), 36);
        if (big) {
          // the first time: a dark band behind it, the call and how it's done
          const pop = since < 0.12 ? 1 : 0;
          ctx.fillStyle = 'rgba(10,6,16,0.72)';
          ctx.fillRect(Math.round(cx - tw / 2 - 6), Math.round(cy - 4), Math.round(tw + 12), 32);
          ctx.fillStyle = RED;
          ctx.fillRect(Math.round(cx - tw / 2 - 6), Math.round(cy - 4), Math.round(tw + 12), 1);
          ctx.fillRect(Math.round(cx - tw / 2 - 6), Math.round(cy + 27), Math.round(tw + 12), 1);
          drawText(ctx, call, cx, cy, pop || blink ? '#ffffff' : RED, { align: 'center', scale: sc, outline: DARK });
          drawText(ctx, 'HOLD CLOSE TO KICK THEIR ENGINES BACK ON', cx, cy + 18, INK, { align: 'center', outline: DARK });
        } else drawText(ctx, call, cx, cy, blink ? '#ffffff' : RED, { align: 'center', outline: DARK });
      }
    }
  }

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
    // (a volatile crate up for grabs says nothing: its look is the warning, its beacon the prize)
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
      if (lv.players.length > 1 && !p.out) drawText(ctx, `P${p.id + 1}`, s.x, s.y + 18, hex(LIVERY[p.id][2]), { align: 'center' });
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
    this.jumpstarts(ctx, lv, view);
    this.trays(ctx, lv, view);
    // an escort's or a heist's orders, as it starts (in place of the biome's name)
    const mb = view.missionBanner;
    if (mb && mb.t < 5 && lv.heist) {
      const fade = Math.min(1, mb.t * 2.5) * (mb.t > 4 ? Math.max(0, 1 - (mb.t - 4)) : 1);
      ctx.globalAlpha = fade;
      const by = Math.round(h * 0.34);
      drawText(ctx, 'HEIST', mid, by, HEIST, { scale: 3, align: 'center', outline: DARK });
      drawText(ctx, 'RUN DOWN THE RUNNER BEFORE IT JUMPS', mid, by + 28, INK, { align: 'center' });
      drawText(ctx, 'SHOOT ITS STRONGBOXES LOOSE, AND CATCH THEM AS THEY FALL', mid, by + 40, '#d8cce8', { align: 'center' });
      for (let i = 0; i < 3; i++) strongboxIcon(ctx, mid - 22 + i * 18, by + 54, HEIST);
      ctx.globalAlpha = 1;
    } else if (mb && mb.t < 5) {
      const fade = Math.min(1, mb.t * 2.5) * (mb.t > 4 ? Math.max(0, 1 - (mb.t - 4)) : 1);
      ctx.globalAlpha = fade;
      const by = Math.round(h * 0.2);
      drawText(ctx, 'ESCORT', mid, by, HAULER, { scale: 3, align: 'center', outline: DARK });
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
      drawText(ctx, b.name, mid, by, INK, { scale: 3, align: 'center', outline: DARK });
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
      drawText(ctx, bb.name, mid, Math.round(h * 0.36), GOLD, { scale: 2, align: 'center', outline: DARK });
      drawText(ctx, bb.title.toUpperCase(), mid, Math.round(h * 0.36) + 20, '#d8cce8', { align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (boss && boss.t > 0) {
      // (dropped clear of the rail and what sits under it)
      ctx.translate(0, 8);
      this.bossBar(ctx, lv, boss, mid, w);
      this.bossRead(ctx, view, mid);
      ctx.translate(0, -8);
    }
    ctx.translate(0, 8);
    const elite = !(boss && boss.t > 0) && this.elitePlate(ctx, lv, mid, w);
    ctx.translate(0, -8);
    // the chain under whatever plate is up
    this.chain.draw(ctx, lv.combo, mid, boss && boss.t > 0 ? 116 : elite ? 62 : 36, 1 / 60);
    this.journal(ctx, lv, h);
    if (lv.state === 'clear' && lv.ending > 0.4) {
      const t = lv.ending;
      const hs = lv.heist;
      const word = lv.spec.mode === 'boss' ? 'WARDEN DOWN' : lv.convoy ? (lv.convoy.delivered ? `${lv.convoy.delivered}/3 HOME` : 'CONVOY LOST') : hs ? (hs.state === 'down' ? 'RUNNER DOWN' : `${hs.caught}/3 CAUGHT`) : 'CLEAR';
      const bad = (lv.convoy && !lv.convoy.delivered) || (hs && hs.state !== 'down' && !hs.caught);
      if (t < 3.5 || Math.floor(t * 4) % 2) drawText(ctx, word, mid, h * 0.4, bad ? RED : GOLD, { scale: 4, align: 'center', outline: DARK });
    }
    if (lv.state === 'failed' && lv.ending > 0.8) drawText(ctx, 'SHOT DOWN', mid, h * 0.42, RED, { scale: 4, align: 'center', outline: DARK });
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
    const y = Math.round(VIEW.h / 2 - (CONTROLS_H + SOUND_H + 84) / 2);
    drawText(ctx, 'PAUSED', mid, y, INK, { scale: 3, align: 'center' });
    const gap = 12;
    const x0 = Math.round(mid - (n * CONTROLS_W + (n - 1) * gap) / 2);
    lv.players.forEach((p, i) => {
      controlsCard(ctx, this.devs[i] ?? 'keys', p, hex(LIVERY[i][2]), x0 + i * (CONTROLS_W + gap), y + 34);
    });
    this.sound.draw(ctx, mid - SOUND_W / 2, y + 44 + CONTROLS_H);
    this.quit.draw(ctx, this.hintDevs.length ? this.hintDevs : this.devs, mid, y + 56 + CONTROLS_H + SOUND_H);
  }
}

/** An arrowhead of dots pointing along `a`, its tip at (x, y). */
function arrowhead(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, color: string) {
  const dots: [number, number][] = [];
  for (let k = 0; k <= 6; k++)
    for (const side of [-1, 1]) {
      const b = a + Math.PI + side * 0.6;
      dots.push([x + Math.cos(b) * k * 1.5, y + Math.sin(b) * k * 1.5]);
    }
  ctx.fillStyle = DARK;
  for (const [px, py] of dots) ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
  ctx.fillStyle = color;
  for (const [px, py] of dots) ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
}
