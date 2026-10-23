/**
 * The kit tray, in a bottom corner: what a pilot can press, laid out as the pad's face buttons are
 * (special on top, heavy left, aux right, dash at the foot), the Weld up in the shoulder's corner.
 * No words: a socket each with its icon, the cooldown sweeping off it clockwise, its button under
 * it as the device draws it. A socket lights in its colour when it's ready, pops as it comes back,
 * flashes as it's used; an empty socket is plainly empty. The Weld glows and beats when there's
 * hull to mend and the charge to mend it.
 */

import { WELD as WELDING, type Player } from '../sim/level';
import type { DeviceId } from '../input';
import { BRASS, BRASS_LO, cutEdge, cutRect } from './trim';
import { faceGlyph, isFace } from './glyph';
import { drawText, textWidth } from './font';
import { flightButton, type FlightAction } from './widgets';
import { clamp } from '../util';

type SlotId = 'heavy' | 'dash' | 'special' | 'aux' | 'weld';

const KEY = '#0a0610';
const S = 18;

/** Each socket's colour (as the cards' verbs: ui/loot-card.ts), and its icon's light. */
const ACCENT: Record<SlotId, [string, string]> = {
  heavy: ['#ff5a78', '#ffd0d8'],
  dash: ['#6ad0ff', '#e0f6ff'],
  special: ['#8affb0', '#e8fff0'],
  aux: ['#ffd04a', '#fff4c8'],
  weld: ['#4ae08a', '#e0ffe8'],
};

/** 11 × 11: '#' the socket's colour, 'o' its light. An ink outline goes round it. */
const ART: Record<string, string[]> = {
  heavy: [
    '....ooo....',
    '...o###o...',
    '...#####...',
    '...##o##...',
    '...##o##...',
    '...#####...',
    '...ooooo...',
    '...#####...',
    '...#####...',
    '..#######..',
    '..ooooooo..',
  ],
  dash: [
    '.....o.....',
    '....ooo....',
    '...##.##...',
    '..##...##..',
    '.##.....##.',
    '.....o.....',
    '....ooo....',
    '...##.##...',
    '..##...##..',
    '.##.....##.',
    '...........',
  ],
  bomb: [
    '........o..',
    '.......#.o.',
    '......#....',
    '...#####...',
    '..##o####..',
    '.##oo#####.',
    '.##o######.',
    '.#########.',
    '.#########.',
    '..#######..',
    '...#####...',
  ],
  phase: [
    '.....#.....',
    '....#.#....',
    '...#...#...',
    '..#..o..#..',
    '.#..ooo..#.',
    '#..ooooo..#',
    '.#..ooo..#.',
    '..#..o..#..',
    '...#...#...',
    '....#.#....',
    '.....#.....',
  ],
  emp: [
    '...#####...',
    '..#.....#..',
    '.#....o..#.',
    '#....oo...#',
    '#...oo....#',
    '#..ooooo..#',
    '#....oo...#',
    '#...oo....#',
    '.#..o....#.',
    '..#.....#..',
    '...#####...',
  ],
  overdrive: [
    '.....#.....',
    '....##.....',
    '....###..#.',
    '...####.##.',
    '..########.',
    '..###o####.',
    '.###ooo###.',
    '.##ooooo##.',
    '.##ooooo##.',
    '..##ooo##..',
    '...#####...',
  ],
  carpet: [
    '...........',
    '.#...#...#.',
    '#o#.#o#.#o#',
    '###.###.###',
    '.#...#...#.',
    '...........',
    '...#...#...',
    '..#o#.#o#..',
    '..###.###..',
    '...#...#...',
    '...........',
  ],
  cryo: [
    '.....#.....',
    '..#..#..#..',
    '...#.#.#...',
    '....#o#....',
    '.#...o...#.',
    '#####o#####',
    '.#...o...#.',
    '....#o#....',
    '...#.#.#...',
    '..#..#..#..',
    '.....#.....',
  ],
  gravity: [
    '...#####...',
    '.##.....##.',
    '.#..###..#.',
    '#..#...#..#',
    '#.#..o..#.#',
    '#.#.ooo.#.#',
    '#.#..o..#.#',
    '#..#...#..#',
    '.#..###..#.',
    '.##.....##.',
    '...#####...',
  ],
  drones: [
    '.....#.....',
    '....#o#....',
    '...#####...',
    '...........',
    '.#.......#.',
    '#o#.....#o#',
    '###.....###',
    '...........',
    '...........',
    '...........',
    '...........',
  ],
  parry: [
    '.#########.',
    '.##ooooo##.',
    '.#o#####o#.',
    '.#o##o##o#.',
    '.#o#ooo#o#.',
    '.#o##o##o#.',
    '..#o###o#..',
    '..##o#o##..',
    '...##o##...',
    '....###....',
    '.....#.....',
  ],
  tether: [
    '.....##....',
    '....#..#...',
    '.....##....',
    '....#..#...',
    '.....##....',
    '.....#.....',
    '.....#.....',
    '.#...#...#.',
    '.##..#..##.',
    '..##ooo##..',
    '...#####...',
  ],
  flare: [
    '.....#.....',
    '.#...#...#.',
    '..#..#..#..',
    '...#ooo#...',
    '....ooo....',
    '#####o#####',
    '....ooo....',
    '...#ooo#...',
    '..#..#..#..',
    '.#...#...#.',
    '.....#.....',
  ],
  siphon: [
    '...........',
    '.ooo...ooo.',
    '.ooo...ooo.',
    '.###...###.',
    '.###...###.',
    '.###...###.',
    '.###...###.',
    '.####.####.',
    '..#######..',
    '...#####...',
    '...........',
  ],
  bulwark: [
    '...........',
    '###########',
    '#oo#ooo#oo#',
    '###########',
    '#o#ooo#ooo#',
    '###########',
    '#oo#ooo#oo#',
    '###########',
    '...........',
    '...........',
    '...........',
  ],
  beacon: [
    '.#.......#.',
    '#..#...#..#',
    '#.#..o..#.#',
    '#.#.ooo.#.#',
    '#..#.o.#..#',
    '.#..###..#.',
    '....#.#....',
    '...#...#...',
    '..#.....#..',
    '.#########.',
    '...........',
  ],
  weld: [
    '...........',
    '....###....',
    '....#o#....',
    '....#o#....',
    '.####o####.',
    '.#ooooooo#.',
    '.####o####.',
    '....#o#....',
    '....#o#....',
    '....###....',
    '...........',
  ],
};

/** Keys too long for a cap, as little pictures: 7 × 5, '#' lit. */
const KEY_ART: Record<string, string[]> = {
  SHIFT: ['...#...', '..#.#..', '.#...#.', '##...##', '.#####.'],
  ENTER: ['......#', '......#', '.#....#', '#######', '.#.....'],
  SPACE: ['.......', '.......', '#.....#', '#.....#', '#######'],
  CTRL: ['.......', '...#...', '..#.#..', '.#...#.', '.......'],
};

function icon(ctx: CanvasRenderingContext2D, art: string[], x: number, y: number, col: string, light: string) {
  ctx.fillStyle = KEY;
  for (let r = 0; r < 11; r++)
    for (let c = 0; c < 11; c++) {
      if (art[r][c] === '.') continue;
      ctx.fillRect(x + c - 1, y + r, 3, 1);
      ctx.fillRect(x + c, y + r - 1, 1, 3);
    }
  for (let r = 0; r < 11; r++)
    for (let c = 0; c < 11; c++) {
      const k = art[r][c];
      if (k === '.') continue;
      ctx.fillStyle = k === '#' ? col : light;
      ctx.fillRect(x + c, y + r, 1, 1);
    }
}

/**
 * A button as the device draws it, centred on `cx` from `y` down (9 tall): the PlayStation's
 * shapes, the Xbox's lettered discs (11 tall), the shoulders' tabs, a keyboard's caps.
 */
export function buttonGlyph(ctx: CanvasRenderingContext2D, dev: DeviceId, a: FlightAction, cx: number, y: number, lit: boolean) {
  const b = flightButton(dev, a);
  const cy = y + 5;
  if (isFace(b)) return faceGlyph(ctx, b, cx, cy, lit);
  // a cap: a shoulder's tab (L1, LB), a key's letter, or a long key's picture
  const art = KEY_ART[b.replace(/^[LR](?=SHIFT|CTRL)/, '')];
  const shoulder = /^[LR][B12]$/.test(b);
  const w = art ? 11 : Math.max(9, textWidth(b) + 3);
  const x = Math.round(cx - w / 2);
  const cuts: [number, number, number, number] = shoulder ? [3, 3, 1, 1] : [1, 1, 1, 1];
  cutRect(ctx, x - 1, y - 1, w + 2, 11, cuts, KEY);
  cutRect(ctx, x, y, w, 9, cuts, lit ? '#4a3c5c' : '#2a2036');
  ctx.fillStyle = lit ? '#6a5a80' : '#3a2e48';
  ctx.fillRect(x + cuts[0], y, w - cuts[0] - cuts[1], 1);
  ctx.fillStyle = '#1a1422';
  ctx.fillRect(x + 1, y + 8, w - 2, 1);
  const ink = lit ? '#f4ecd8' : '#7a6e8a';
  if (art) {
    ctx.fillStyle = ink;
    art.forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && ctx.fillRect(x + 2 + c, y + 2 + r, 1, 1)));
  } else drawText(ctx, b, x + Math.round((w - textWidth(b) + 1) / 2), y + 1, ink, { shadow: false });
}

/** What a socket shows: fitted, how far back (0 to 1), ready, its charges, and its moments. */
interface SlotNow {
  fitted: boolean;
  art: string;
  f: number;
  ready: boolean;
  count?: number;
  max?: number;
  /** Going off right now (the parry's window, a weld under way). */
  active?: boolean;
  /** Pressed with nothing there, or a whiff: it flashes red. */
  warn?: boolean;
  /** Ready and worth pressing: it glows and beats (the Weld, with hull to mend). */
  call?: boolean;
  /** Ready but nothing to do (the Weld at a full hull): lit, quietly. */
  idle?: boolean;
}

function slotsOf(p: Player, dryT: number, whiffT: number): Record<SlotId, SlotNow> {
  const s = p.stats;
  const heavies = s.guns.map((g, k) => ({ g, k })).filter(({ g }) => g.heavy);
  const rounds = heavies.reduce((t, { k }) => t + p.rounds[k], 0);
  const most = heavies.reduce((t, { g }) => t + g.heavy, 0);
  const next = heavies.filter(({ g, k }) => p.rounds[k] < g.heavy).reduce((t, { k }) => Math.max(t, clamp(p.reload[k], 0, 1)), 0);
  const auxReady = p.auxCd <= 0;
  const welding = p.weldT >= WELDING.hold;
  const mend = p.hp < s.hp && p.hp > 0;
  const spare = p.ch.knacks.has('sparetank');
  return {
    heavy: { fitted: heavies.length > 0, art: 'heavy', f: rounds >= most ? 1 : next, ready: rounds > 0, count: rounds, max: most },
    dash: {
      fitted: s.dashes > 0,
      art: 'dash',
      f: p.dashes >= s.dashes ? 1 : 1 - p.dashCd / Math.max(0.01, s.dashCooldown),
      ready: p.dashes > 0,
      count: p.dashes,
      max: s.dashes,
      warn: dryT < 0.35,
    },
    special: { fitted: !!s.special, art: s.special ?? 'bomb', f: p.charge, ready: p.charge >= 1, call: p.charge >= 1 },
    aux: {
      fitted: !!s.aux,
      art: s.aux ?? 'parry',
      f: auxReady ? 1 : 1 - p.auxCd / Math.max(0.01, p.auxMax),
      ready: auxReady,
      active: p.auxT > 0 || p.riposte > 0,
      warn: !auxReady && s.aux === 'parry' && whiffT < p.auxMax + 0.1,
    },
    weld: {
      fitted: true,
      art: 'weld',
      f: welding ? clamp((p.weldT - WELDING.hold) / WELDING.time, 0, 1) : p.weld,
      ready: p.weld >= 1,
      active: welding,
      call: p.weld >= 1 && mend && !welding,
      idle: p.weld >= 1 && !mend,
      ...(spare ? { count: (p.weld >= 1 ? 1 : 0) + (p.ch.weld2 >= 1 ? 1 : 0), max: 2 } : {}),
    },
  };
}

const ACTION: Record<SlotId, FlightAction> = { heavy: 'heavy', dash: 'dash', special: 'special', aux: 'aux', weld: 'focus' };

/** Where each socket sits from the tray's centre, and which side of it its button goes. */
const PLACE: Record<SlotId, { dx: number; dy: number; key: 'under' | 'left' }> = {
  special: { dx: 0, dy: -19, key: 'under' },
  heavy: { dx: -22, dy: 0, key: 'under' },
  aux: { dx: 22, dy: 0, key: 'under' },
  dash: { dx: 0, dy: 19, key: 'under' },
  weld: { dx: -22, dy: -21, key: 'left' },
};

/** The tray's reach from its centre: left, right, up, down. */
export const TRAY = { l: 48, r: 32, u: 31, d: 40 };

/** Each pilot's sockets as last drawn, for the pop as one comes back and the kick as one is used. */
export class KitTray {
  private was: Record<string, { ready: boolean; count: number; f: number }> = {};
  private popT: Record<string, number> = {};
  private useT: Record<string, number> = {};

  draw(ctx: CanvasRenderingContext2D, p: Player, dev: DeviceId, cx: number, cy: number, t: number, alpha: number, dryT: number, whiffT: number) {
    const now = slotsOf(p, dryT, whiffT);
    ctx.globalAlpha = alpha * (p.down || p.out ? 0.4 : 1);
    for (const id of ['special', 'heavy', 'aux', 'dash', 'weld'] as SlotId[]) {
      const sl = now[id];
      const key = `${p.id}:${id}`;
      const was = this.was[key];
      const count = sl.count ?? (sl.ready ? 1 : 0);
      if (was && sl.fitted) {
        if (sl.ready && !was.ready) this.popT[key] = 0;
        else if (sl.count !== undefined && count > was.count && sl.ready) this.popT[key] = 0;
        if ((was.ready && !sl.ready) || count < was.count || (!sl.count && sl.f < was.f - 0.2)) this.useT[key] = 0;
      }
      this.was[key] = { ready: sl.ready, count, f: sl.f };
      this.popT[key] = (this.popT[key] ?? 9) + 1 / 60;
      this.useT[key] = (this.useT[key] ?? 9) + 1 / 60;
      const at = PLACE[id];
      const x = Math.round(cx + at.dx - S / 2);
      const y = Math.round(cy + at.dy - S / 2);
      this.socket(ctx, id, sl, x, y, t, this.popT[key], this.useT[key]);
      if (at.key === 'under') buttonGlyph(ctx, dev, ACTION[id], x + S / 2, y + S - 1, sl.fitted);
      else buttonGlyph(ctx, dev, ACTION[id], x - 9, y + 4, sl.fitted);
    }
    ctx.globalAlpha = 1;
  }

  private socket(ctx: CanvasRenderingContext2D, id: SlotId, sl: SlotNow, x0: number, y0: number, t: number, pop: number, use: number) {
    const [col, light] = ACCENT[id];
    const blink = Math.floor(t * 14) % 2 === 0;
    const warn = sl.warn && blink;
    // a kick as it's used, a shake as it's pressed dry
    const x = x0 + (sl.warn ? Math.round(Math.sin(t * 90)) : 0);
    const y = y0 + (use < 0.09 ? 1 : 0);
    const base = ctx.globalAlpha;
    // called for: a soft glow beating round it
    if (sl.call && sl.fitted) {
      const beat = 0.5 + 0.5 * Math.sin(t * (id === 'weld' ? 6 : 4));
      ctx.globalAlpha = base * (0.25 + 0.45 * beat);
      cutRect(ctx, x - 3, y - 3, S + 6, S + 6, [5, 5, 5, 5], col);
      ctx.globalAlpha = base;
    }
    cutRect(ctx, x - 1, y - 1, S + 2, S + 2, [3, 3, 3, 3], KEY);
    const g = ctx.createLinearGradient(0, y, 0, y + S);
    g.addColorStop(0, '#2a2034');
    g.addColorStop(1, '#100b16');
    ctx.globalAlpha = base * 0.92;
    cutRect(ctx, x, y, S, S, [2, 2, 2, 2], g);
    ctx.globalAlpha = base;
    if (!sl.fitted) {
      // nothing on it: an empty well, a dim cross-slot where a part would bolt in
      cutEdge(ctx, x, y, S, S, [2, 2, 2, 2], '#2e2440');
      ctx.fillStyle = '#2e2440';
      ctx.fillRect(x + 7, y + 8, 4, 2);
      return;
    }
    const lit = sl.ready && !sl.idle;
    // a lit socket: its colour washed faintly in behind the icon
    if (sl.ready) {
      ctx.globalAlpha = base * (sl.idle ? 0.1 : 0.2);
      cutRect(ctx, x + 1, y + 1, S - 2, S - 2, [1, 1, 1, 1], col);
      ctx.globalAlpha = base;
    }
    const pips = sl.max !== undefined && sl.max > 1;
    const ix = x + 3;
    const iy = y + (pips ? 5 : 4);
    const white = pop < 0.1 || use < 0.06 || (sl.active && Math.floor(t * 20) % 2 === 0);
    ctx.globalAlpha = base * (sl.idle ? 0.55 : 1);
    icon(ctx, ART[sl.art], ix, iy, white ? '#ffffff' : sl.ready ? col : '#8a7e9a', white ? '#ffffff' : sl.ready ? light : '#b8aec8');
    ctx.globalAlpha = base;
    // cooling: the part still to come back shaded over, sweeping off clockwise from the top
    if (!sl.ready || (sl.count !== undefined && sl.max !== undefined && sl.count < sl.max)) {
      const f = clamp(sl.f, 0, 1);
      const shade = sl.ready ? 0.35 : 0.72;
      const mx = x + S / 2;
      const my = y + S / 2;
      for (let r = 1; r < S - 1; r++) {
        let run = -1;
        for (let c = 1; c <= S - 1; c++) {
          let on = false;
          if (c < S - 1) {
            const a = Math.atan2(x + c + 0.5 - mx, -(y + r + 0.5 - my));
            on = (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2) >= f;
          }
          if (on && run < 0) run = c;
          if (!on && run >= 0) {
            ctx.fillStyle = warn ? `rgba(120,20,20,${shade})` : `rgba(8,5,14,${shade})`;
            ctx.fillRect(x + run, y + r, c - run, 1);
            run = -1;
          }
        }
      }
      // the sweep's leading edge, lit on the rim
      const a = f * Math.PI * 2;
      const ex = Math.round(mx + Math.sin(a) * 12);
      const ey = Math.round(my - Math.cos(a) * 12);
      ctx.fillStyle = col;
      ctx.fillRect(clamp(ex, x, x + S - 1), clamp(ey, y, y + S - 1), 1, 1);
    }
    // the rim: brass while it's cooling, its colour once it's ready, red as it's pressed dry
    cutEdge(ctx, x, y, S, S, [2, 2, 2, 2], warn ? '#ff5a4a' : lit ? col : BRASS_LO, warn ? '#ffffff' : lit ? light : BRASS);
    // the charges: a pip each along the top
    if (pips) {
      const n = sl.max!;
      const pw = n > 5 ? 1 : 2;
      const w = n * (pw + 1) - 1;
      const px0 = Math.round(x + S / 2 - w / 2);
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = k < sl.count! ? (white ? '#ffffff' : light) : '#3a2e48';
        ctx.fillRect(px0 + k * (pw + 1), y + 2, pw, 2);
      }
    }
    // coming back: a ring off it
    if (pop < 0.35) {
      const k = pop / 0.35;
      const o = Math.round(1 + k * 5);
      ctx.globalAlpha = base * (1 - k);
      cutEdge(ctx, x - o, y - o, S + o * 2, S + o * 2, [2 + o, 2 + o, 2 + o, 2 + o], light);
      ctx.globalAlpha = base;
    }
    // the Weld called for: a spark off it now and then
    if (sl.call && id === 'weld') {
      const q = (t * 1.6) % 1;
      if (q < 0.45) {
        const k = Math.floor(t * 1.6) % 4;
        ctx.fillStyle = q < 0.2 ? '#ffffff' : col;
        ctx.fillRect(x + [S, -2, S, -2][k] + (k % 2 ? -1 : 1) * Math.round(q * 6), y + [2, 5, 13, 11][k] - Math.round(q * 5), 1, 1);
      }
    }
  }
}
