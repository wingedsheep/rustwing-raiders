import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import type { Planet } from '../world/planets';
import type { Faction } from '../sim/factions';
import { stats, type Stats } from '../sim/build';
import { BONDS, BOND_AT, FACTION_NAME, GRAFTS, VERBS, VERB_COLOR, VERB_NAME, boltOn, factionCount, hasVerb, salvageOffer, type GraftId, type GraftVerb, type Wreck } from '../game/grafts';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { CYAN, DARK, DIM, EDGE, GOLD, GREEN, INK, RED, W, frame, hex } from '../ui/hud';
import { backdrop, heading, hints } from '../ui/widgets';
import { FACTION_BODY, FACTION_COLOR, FACTION_DARK, graftIcon } from '../ui/graft-icon';
import { LIVERY } from '../view/ship-model';
import { WreckYard } from '../view/wreck-yard';
import { rng } from '../util';
import { waysOf } from '../game/core';

type Rect = { x: number; y: number; w: number; h: number };
type Bolt = ReturnType<typeof boltOn>;

interface Pick {
  wrecks: Wreck[];
  cards: { id: GraftId; from: number }[];
  /** Cursor: a card, or `cards.length` for leaving them. */
  at: number;
  done: boolean;
  doneT: number;
  /** What was taken: a card, `cards.length` the scrap, -1 nothing (no wrecks of their own). */
  took: number;
  stats: Stats;
  /** What each card would do bolted on, worked out once. */
  bolts: Bolt[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  /** Falls like grit, or floats like ash. */
  g: number;
}

const REVEAL_AT = 0.55;
const REVEAL_GAP = 0.22;
const FLIP = 0.26;
/** How long a taken card takes to fly to its socket. */
const FLY = 0.42;
/** When the bond's banner comes in, after the bolt. */
const BANNER = 0.3;

// the solo layout: the yard on the left, the cards beside it, the ship's six sockets underneath
const YARD: Rect = { x: 12, y: 52, w: 170, h: 218 };
const CARDS = { x: 192, w: 436, cw: 140, gap: 8, y: 52, h: 218 };

/** What a graft's verb needs fitted, if the ship hasn't got it. */
const NEED: Record<GraftVerb, string> = { trigger: 'A GUN', heavy: 'A HEAVY GUN', dash: 'A DASH', aux: 'AN AUX', special: 'A SPECIAL', boost: 'A BOOST' };

/**
 * After the results, if you took any wrecks: each pilot's wrecks lie in the yard and between them
 * lay out up to three grafts. Bolt one on (onto the verb it rides, over whatever was there), or
 * leave them for scrap. Three of a faction wake its bond.
 */
export class WreckScreen implements Screen {
  private picks: Pick[];
  private t = 0;
  private leaving = -1;
  private sparks: Spark[] = [];
  private shown = new Set<string>();
  /** The yard (solo only: co-op has no room for it). */
  private yard: WreckYard | null = null;
  /** Each rack socket's flash and kick, by player and verb. */
  private flash = new Map<string, number>();

  constructor(
    private game: Game,
    private run: Run,
    wrecks: Wreck[],
    private planet: Planet,
    seed: number,
    private onDone: () => void,
  ) {
    this.picks = run.crew.map((crew, i) => {
      const own = wrecks.filter((w) => w.owner === i);
      const cards = salvageOffer(rng(seed * 17 + i * 101 + run.levels), own, crew.grafts);
      const none = !cards.length;
      return { wrecks: own, cards, at: 0, done: none, doneT: none ? 9 : 0, took: -1, stats: stats(crew.build), bolts: cards.map((c) => boltOn(crew.grafts, c.id, waysOf(crew.core.held))) };
    });
    if (this.picks.length === 1) this.yard = new WreckYard(planet, this.picks[0].wrecks, YARD.w, YARD.h);
    audio.play('explode_small', { pitch: 0.6, vol: 0.5 });
  }

  dispose() {
    this.yard?.dispose();
  }

  private get solo() {
    return this.picks.length === 1;
  }

  private get boss() {
    return this.picks.some((p) => p.wrecks.some((w) => w.boss));
  }

  private revealT(k: number) {
    return REVEAL_AT + k * REVEAL_GAP;
  }

  private revealed(p: Pick) {
    return this.t > this.revealT(p.cards.length - 1) + FLIP;
  }

  private scrapValue(p: Pick) {
    return 6 + p.wrecks.reduce((s, w) => s + (w.boss ? 30 : 8), 0);
  }

  update(dt: number) {
    this.t += dt;
    this.yard?.update(dt);
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += s.g * dt;
      s.vx *= 1 - dt * 0.8;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const [k, v] of this.flash) this.flash.set(k, Math.max(0, v - dt * 2.5));
    // dealt off the wrecks: a clank for each, a swell for a Warden's
    this.picks.forEach((p, i) =>
      p.cards.forEach((c, k) => {
        const key = `${i}:${k}`;
        if (this.shown.has(key) || this.t < this.revealT(k) + FLIP / 2) return;
        this.shown.add(key);
        audio.play('graft_deal', { pitch: 1 + k * 0.08 });
        const r = this.cardRect(i, k);
        const col = FACTION_COLOR[GRAFTS[c.id].faction];
        if (GRAFTS[c.id].boss) {
          audio.play('loot_legendary', { pitch: 0.8 });
          this.burst(r, col, 50);
        } else this.burst(r, col, 12);
      }),
    );
    // a Warden's signature smoulders while it's on the table
    this.picks.forEach((p, i) =>
      p.cards.forEach((c, k) => {
        if (!GRAFTS[c.id].boss || !this.shown.has(`${i}:${k}`) || (p.done && p.took !== k) || Math.random() > dt * 10) return;
        const r = this.cardRect(i, k);
        this.sparks.push({ x: r.x + Math.random() * r.w, y: r.y + r.h - 3, vx: (Math.random() - 0.5) * 8, vy: -18 - Math.random() * 25, life: 1.3, max: 1.3, color: Math.random() < 0.5 ? GOLD : FACTION_COLOR[GRAFTS[c.id].faction], g: -4 });
      }),
    );
    // the taken card landing in its socket, and the bond waking after
    this.picks.forEach((p, i) => {
      if (!p.done || p.took < 0 || p.took >= p.cards.length) return;
      const was = p.doneT;
      const now = was + dt;
      const bolt = p.bolts[p.took];
      const verb = GRAFTS[p.cards[p.took].id].verb;
      if (was < FLY && now >= FLY) this.landed(p, i, verb);
      if (bolt.woke.length && was < FLY + BANNER && now >= FLY + BANNER) this.woke(i, bolt.woke[0]);
    });
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving > 0.35) this.onDone();
      return;
    }
    this.picks.forEach((p, i) => {
      const m = this.game.menuOf(this.game.devices[i] ?? 'keys');
      if (p.done) {
        p.doneT += dt;
        // (once it's landed, any button moves things on)
        if (m.confirm && p.doneT > FLY + 0.3) p.doneT = Math.max(p.doneT, this.hold(p));
        return;
      }
      if (!this.revealed(p)) {
        if (m.confirm && this.t > 0.3) this.t = this.revealT(p.cards.length - 1) + FLIP;
        return;
      }
      const n = p.cards.length;
      const before = p.at;
      if (p.at < n) {
        if (m.left) p.at = (p.at + n - 1) % n;
        if (m.right) p.at = (p.at + 1) % n;
        if (m.down || m.up) p.at = n;
      } else if (m.up || m.down || m.left || m.right) p.at = Math.min(n - 1, Math.floor((n - 1) / 2) + (m.right ? 1 : 0));
      if (m.prev) p.at = (p.at + n) % (n + 1);
      if (m.next) p.at = (p.at + 1) % (n + 1);
      if (p.at !== before) audio.play('ui_move');
      if (m.confirm) this.take(p, i);
    });
    this.yard?.setFocus(this.picks[0].at < this.picks[0].cards.length && !this.picks[0].done ? this.picks[0].cards[this.picks[0].at].from : -1);
    if (this.picks.every((p) => p.done && p.doneT > this.hold(p))) this.leaving = 0;
  }

  /** How long a choice stays on the screen: longer for a bond to be read. */
  private hold(p: Pick) {
    if (p.took < 0) return 0;
    if (p.took >= p.cards.length) return 0.9;
    return p.bolts[p.took].woke.length ? FLY + BANNER + 2.6 : FLY + 1.1;
  }

  private take(p: Pick, i: number) {
    p.took = p.at;
    p.done = true;
    p.doneT = 0;
    if (p.at >= p.cards.length) {
      this.run.crew[i].scrap += this.scrapValue(p);
      audio.play('pickup_scrap');
      return;
    }
    const c = p.cards[p.at];
    this.run.crew[i].grafts = p.bolts[p.at].next;
    audio.play('ui_select');
    audio.play('hook', { pitch: 1.3, vol: 0.6 });
    this.burst(this.cardRect(i, p.at), FACTION_COLOR[GRAFTS[c.id].faction], 26);
    if (this.solo) this.yard?.strip(c.from);
  }

  /** The graft home in its socket: a clamp, sparks, the socket lit. */
  private landed(p: Pick, i: number, verb: GraftVerb) {
    const c = p.cards[p.took];
    const s = this.slotRect(i, verb);
    const col = FACTION_COLOR[GRAFTS[c.id].faction];
    audio.play('graft_bolt');
    this.flash.set(`${i}:${verb}`, 1);
    for (let k = 0; k < 34; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
      const v = 40 + Math.random() * 90;
      const life = 0.4 + Math.random() * 0.6;
      this.sparks.push({ x: s.x + Math.random() * s.w, y: s.y + s.h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color: Math.random() < 0.35 ? '#ffffff' : Math.random() < 0.5 ? GOLD : col, g: 160 });
    }
  }

  /** A bond woken: its fanfare, and its colour thrown over the screen. */
  private woke(i: number, f: Faction) {
    audio.play('bond_wake');
    const b = this.bannerRect(i);
    for (let k = 0; k < 90; k++) {
      const life = 0.8 + Math.random() * 1.2;
      const up = Math.random() < 0.5;
      this.sparks.push({ x: b.x + Math.random() * b.w, y: up ? b.y : b.y + b.h, vx: (Math.random() - 0.5) * 50, vy: (up ? -1 : 1) * (20 + Math.random() * 60), life, max: life, color: Math.random() < 0.3 ? '#ffffff' : FACTION_COLOR[f], g: up ? 30 : 60 });
    }
  }

  private burst(r: Rect, color: string, n: number) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * 70;
      const life = 0.5 + Math.random() * 0.7;
      this.sparks.push({ x: cx + Math.cos(a) * r.w * 0.5, y: cy + Math.sin(a) * r.h * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life, max: life, color: Math.random() < 0.3 ? '#ffffff' : color, g: 30 });
    }
  }

  // --- where things go -----------------------------------------------------------------------

  private cardRect(i: number, k: number): Rect {
    const p = this.picks[i];
    if (this.solo) {
      // (one card alone, a Warden's, lies bigger)
      const n = p.cards.length;
      const cw = n === 1 ? 196 : CARDS.cw;
      const x0 = CARDS.x + Math.round((CARDS.w - (n * cw + (n - 1) * CARDS.gap)) / 2);
      return { x: x0 + k * (cw + CARDS.gap), y: CARDS.y, w: cw, h: CARDS.h };
    }
    return { x: 10 + i * 316, y: 86, w: 304, h: 150 };
  }

  /** A verb's socket on a player's rack. */
  private slotRect(i: number, verb: GraftVerb): Rect {
    const k = VERBS.indexOf(verb);
    if (this.solo) {
      const sw = 98;
      const gap = (616 - 6 * sw) / 5;
      return { x: Math.round(12 + k * (sw + gap)), y: 278, w: sw, h: 26 };
    }
    return { x: 10 + i * 316 + (k % 3) * 103, y: 242 + Math.floor(k / 3) * 27, w: 98, h: 24 };
  }

  private bannerRect(i: number): Rect {
    return this.solo ? { x: 0, y: 128, w: W, h: 58 } : { x: 10 + i * 316 - 4, y: 132, w: 312, h: 58 };
  }

  // --- drawing -------------------------------------------------------------------------------

  draw() {
    const g = this.game;
    g.clearGL();
    if (this.yard) this.yard.render(g, YARD.x, YARD.y);
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, 360);
    backdrop(ctx);
    const n = this.picks.reduce((s, p) => s + p.wrecks.length, 0);
    heading(ctx, this.boss ? 'THE WARDEN’S WRECK' : 'SALVAGE', this.boss ? `${this.planet.boss.name}: STRIP IT FOR ITS SIGNATURE` : `${n} WRECK${n === 1 ? '' : 'S'} TAKEN DOWN · BOLT ONE GRAFT ON`, this.boss ? GOLD : INK);
    if (this.solo) this.drawSolo(ctx, this.picks[0]);
    else this.picks.forEach((p, i) => this.drawColumn(ctx, p, i));
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.5);
      ctx.fillStyle = s.color;
      const sz = s.life > s.max * 0.5 ? 2 : 1;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  private drawSolo(ctx: CanvasRenderingContext2D, p: Pick) {
    // the yard: a window cut in the backdrop, framed, the wrecks named over them
    const y = YARD;
    ctx.clearRect(y.x, y.y, y.w, y.h);
    ctx.fillStyle = EDGE;
    ctx.fillRect(y.x - 1, y.y - 1, y.w + 2, 1);
    ctx.fillRect(y.x - 1, y.y + y.h, y.w + 2, 1);
    ctx.fillRect(y.x - 1, y.y, 1, y.h);
    ctx.fillRect(y.x + y.w, y.y, 1, y.h);
    const focus = !p.done && p.at < p.cards.length ? p.cards[p.at].from : -1;
    p.wrecks.forEach((w, k) => {
      const at = this.yard!.labelAt(k);
      const on = k === focus;
      const col = FACTION_COLOR[w.faction];
      const name = w.title;
      const tx = Math.max(y.x + 2 + textWidth(name) / 2, Math.min(y.x + y.w - 2 - textWidth(name) / 2, y.x + at.x));
      const ty = Math.max(y.y + 3, Math.min(y.y + y.h - 12, y.y + at.y - 10));
      drawText(ctx, name, tx, ty, on ? INK : col, { align: 'center', shadow: DARK });
      if (on) drawText(ctx, '▼', tx, ty + 9 + Math.round(Math.sin(this.t * 6)), col, { align: 'center' });
    });
    drawText(ctx, 'THE YARD', y.x + 3, y.y + y.h - 10, DIM, { shadow: DARK });
    p.cards.forEach((_, k) => this.card(ctx, p, 0, k));
    this.rack(ctx, p, 0);
    this.bondRow(ctx, p, 0, 12, 311, 616, 4);
    this.leaveButton(ctx, p, W / 2 - 120, 325, 240);
    const dev = this.game.devices[0] ?? 'keys';
    if (!p.done && this.revealed(p)) hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', p.at < p.cards.length ? 'BOLT IT ON' : 'LEAVE THEM']], W / 2, 346, 'center');
    else if (!p.done) hints(ctx, dev, [['confirm', 'SHOW ALL']], W / 2, 346, 'center');
    this.banner(ctx, p, 0);
  }

  /** Co-op: a pilot's half. Their wrecks named, a tab for each graft, the one in focus big. */
  private drawColumn(ctx: CanvasRenderingContext2D, p: Pick, i: number) {
    const x = 10 + i * 316;
    const w = 304;
    frame(ctx, x, 50, w, 16);
    drawText(ctx, `P${i + 1}`, x + 5, 54, hex(LIVERY[i][2]));
    if (!p.wrecks.length) {
      drawText(ctx, 'NO WRECKS', x + 24, 54, DIM);
      const cy = 150;
      drawText(ctx, 'NOTHING TO STRIP', x + w / 2, cy - 14, DIM, { scale: 2, align: 'center' });
      drawText(ctx, 'TAKE AN ELITE DOWN BEFORE IT DIES', x + w / 2, cy + 6, DIM, { align: 'center' });
      drawText(ctx, 'AND ITS WRECK IS YOURS', x + w / 2, cy + 16, DIM, { align: 'center' });
      this.rack(ctx, p, i);
      this.bondRow(ctx, p, i, x, 298, w, 2);
      return;
    }
    let tx = x + 24;
    for (const wk of p.wrecks) {
      const name = wk.title;
      if (tx + textWidth(name) > x + w - 6) {
        drawText(ctx, '...', tx, 54, DIM);
        break;
      }
      tx += drawText(ctx, name, tx, 54, FACTION_COLOR[wk.faction]) + 8;
    }
    // the tabs
    const n = p.cards.length;
    const tw = Math.floor((w - 4 * (n - 1)) / n);
    p.cards.forEach((c, k) => {
      const since = this.t - this.revealT(k);
      if (since < -0.3) return;
      const gx = x + k * (tw + 4);
      const on = !p.done && p.at === k;
      const ty = 68 + (on ? -2 : 0);
      const f = GRAFTS[c.id].faction;
      if (since < FLIP / 2) {
        this.cardBack(ctx, { x: gx, y: ty, w: tw, h: 14 }, f);
        return;
      }
      frame(ctx, gx, ty, tw, 14, on ? FACTION_DARK[f] : FACTION_BODY[f], on ? INK : FACTION_COLOR[f]);
      graftIcon(ctx, c.id, gx + 2, ty + 1, 1, p.done && p.took !== k);
      const name = GRAFTS[c.id].name;
      const max = Math.floor((tw - 18) / 6);
      drawText(ctx, name.length > max ? name.slice(0, max) : name, gx + 16, ty + 4, on ? INK : FACTION_COLOR[f]);
    });
    const k = p.done ? (p.took < n ? p.took : -1) : p.at < n ? p.at : -1;
    if (k >= 0) this.card(ctx, p, i, k);
    else {
      const r = this.cardRect(i, 0);
      frame(ctx, r.x, r.y, r.w, r.h, '#15101e', EDGE);
      drawText(ctx, 'LEAVE THEM', r.x + r.w / 2, r.y + r.h / 2 - 12, GOLD, { scale: 2, align: 'center' });
      drawText(ctx, `SOLD FOR SCRAP: +${this.scrapValue(p)}`, r.x + r.w / 2, r.y + r.h / 2 + 8, DIM, { align: 'center' });
    }
    this.rack(ctx, p, i);
    this.bondRow(ctx, p, i, x, 298, w, 2);
    this.leaveButton(ctx, p, x + 40, 320, w - 80);
    const dev = this.game.devices[i] ?? 'keys';
    if (!p.done && this.revealed(p)) hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', p.at < n ? 'BOLT IT ON' : 'LEAVE THEM']], x + w / 2, 342, 'center');
    if (p.done) drawText(ctx, 'DONE', x + w / 2, 342, CYAN, { align: 'center' });
    this.banner(ctx, p, i);
  }

  private cardBack(ctx: CanvasRenderingContext2D, r: Rect, f: Faction) {
    frame(ctx, r.x, r.y, r.w, r.h, FACTION_BODY[f], FACTION_COLOR[f]);
    ctx.fillStyle = FACTION_DARK[f];
    for (let d = -r.h; d < r.w; d += 7) for (let j = 0; j < r.h - 2; j++) {
      const xx = r.x + 1 + d + j;
      if (xx > r.x && xx < r.x + r.w - 1) ctx.fillRect(xx, r.y + 1 + j, 2, 1);
    }
    if (r.h > 30) {
      // a rivet in each corner, and the wreck's faction across the middle
      ctx.fillStyle = FACTION_COLOR[f];
      for (const [cx, cy] of [[4, 4], [r.w - 6, 4], [4, r.h - 6], [r.w - 6, r.h - 6]]) ctx.fillRect(r.x + cx, r.y + cy, 2, 2);
      drawText(ctx, FACTION_NAME[f], r.x + r.w / 2, r.y + r.h / 2 - 3, FACTION_COLOR[f], { align: 'center', shadow: DARK });
    }
  }

  /** A graft's card where it is in its turn: dealt face down, turning, face up, flying to its socket. */
  private card(ctx: CanvasRenderingContext2D, p: Pick, i: number, k: number) {
    const c = p.cards[k];
    const def = GRAFTS[c.id];
    const f = def.faction;
    const r = this.cardRect(i, k);
    const since = this.t - this.revealT(k);
    if (since < -0.3) return;
    // dealt off the yard: slid in from the left, face down
    if (since < FLIP / 2) {
      const slide = Math.max(0, Math.min(1, (since + 0.3) / 0.3));
      const ox = Math.round((1 - slide) * (1 - slide) * -60);
      const sq = since < 0 ? 1 : Math.cos((since / FLIP) * Math.PI);
      const w = Math.max(2, Math.round(r.w * sq));
      ctx.globalAlpha = slide;
      this.cardBack(ctx, { x: r.x + ox + Math.round((r.w - w) / 2), y: r.y, w, h: r.h }, f);
      ctx.globalAlpha = 1;
      return;
    }
    if (since < FLIP) {
      const w = Math.max(2, Math.round(r.w * -Math.cos((since / FLIP) * Math.PI)));
      ctx.fillStyle = FACTION_DARK[f];
      ctx.fillRect(r.x + Math.round((r.w - w) / 2), r.y, w, r.h);
      ctx.fillStyle = FACTION_COLOR[f];
      ctx.fillRect(r.x + Math.round((r.w - w) / 2), r.y, w, 1);
      return;
    }
    const taken = p.done && p.took === k;
    // flying home: the card drawn in to its socket, leaving a ghost
    if (taken && p.doneT < FLY) {
      this.face(ctx, p, i, k, r, { dim: true });
      const e = p.doneT / FLY;
      const ease = e * e * (3 - 2 * e);
      const s = this.slotRect(i, def.verb);
      const fx = r.x + (s.x - r.x) * ease;
      const fy = r.y + (s.y - r.y) * ease;
      const fw = r.w + (s.w - r.w) * ease;
      const fh = r.h + (s.h - r.h) * ease;
      ctx.globalAlpha = 0.9;
      frame(ctx, Math.round(fx), Math.round(fy), Math.round(fw), Math.round(fh), FACTION_DARK[f], INK);
      const sc = Math.max(1, Math.round(4 * (1 - ease)));
      graftIcon(ctx, c.id, Math.round(fx + fw / 2 - 6 * sc), Math.round(fy + fh / 2 - 6 * sc), sc);
      ctx.globalAlpha = 1;
      if (Math.random() < 0.8) this.sparks.push({ x: fx + Math.random() * fw, y: fy + Math.random() * fh, vx: 0, vy: 0, life: 0.3, max: 0.3, color: FACTION_COLOR[f], g: 0 });
      return;
    }
    const on = !p.done && p.at === k;
    // a Warden's signature has its faction's light behind it
    if (def.boss && !(p.done && !taken)) this.rays(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.7, FACTION_COLOR[f]);
    this.face(ctx, p, i, k, { ...r, y: r.y + (on ? -3 : 0) }, { on, dim: p.done && !taken, hollow: taken });
    if (on && this.solo) drawText(ctx, '▲', r.x + r.w / 2, r.y + r.h + 1 + Math.round(Math.sin(this.t * 6)), FACTION_COLOR[f], { align: 'center' });
  }

  /** A card's face: the graft's picture, its name, where it's from, what it does, what it would change. */
  private face(ctx: CanvasRenderingContext2D, p: Pick, i: number, k: number, r: Rect, o: { on?: boolean; dim?: boolean; hollow?: boolean }) {
    const c = p.cards[k];
    const def = GRAFTS[c.id];
    const f = def.faction;
    const col = FACTION_COLOR[f];
    const wide = r.w > 200;
    if (o.hollow) {
      // taken: only the empty slot in the plate it came out of
      frame(ctx, r.x, r.y, r.w, r.h, '#120d18', FACTION_DARK[f]);
      drawText(ctx, 'BOLTED ON', r.x + r.w / 2, r.y + r.h / 2 - 7, GREEN, { scale: 2, align: 'center' });
      drawText(ctx, `${def.name} · ${VERB_NAME[def.verb]}`, r.x + r.w / 2, r.y + r.h / 2 + 10, col, { align: 'center' });
      return;
    }
    if (o.on) {
      // a pulsing edge of the faction's light round it
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 6);
      ctx.fillStyle = col;
      ctx.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.globalAlpha = 1;
    }
    frame(ctx, r.x, r.y, r.w, r.h, FACTION_BODY[f], o.on ? INK : FACTION_DARK[f]);
    // the band: its faction, and a Warden's mark
    ctx.fillStyle = o.on ? col : FACTION_DARK[f];
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 10);
    drawText(ctx, FACTION_NAME[f], r.x + 4, r.y + 3, o.on ? DARK : col, { shadow: false });
    if (def.boss) drawText(ctx, '★ SIGNATURE', r.x + r.w - 4, r.y + 3, o.on ? DARK : GOLD, { align: 'right', shadow: false });
    const tool = hasVerb(p.stats, def.verb);
    const bolt = p.bolts[k];
    // the picture: in a little dark well, the faction's glow breathing behind it
    const sc = wide ? 5 : 4;
    const ix = wide ? r.x + 10 : Math.round(r.x + r.w / 2 - 6 * sc);
    const iy = r.y + 16;
    ctx.fillStyle = '#0c0910';
    ctx.fillRect(ix - 3, iy - 3, 12 * sc + 6, 12 * sc + 6);
    ctx.globalAlpha = 0.18 + 0.1 * Math.sin(this.t * 3 + k);
    ctx.fillStyle = col;
    ctx.fillRect(ix - 2, iy - 2, 12 * sc + 4, 12 * sc + 4);
    ctx.globalAlpha = 1;
    graftIcon(ctx, c.id, ix, iy, sc, o.dim);
    // the words: under the picture, or beside it on a wide card
    const tx = wide ? ix + 12 * sc + 12 : r.x + 6;
    const tw = wide ? r.x + r.w - 6 - tx : r.w - 12;
    const cx = wide ? tx : r.x + r.w / 2;
    const align = wide ? 'left' : 'center';
    let y = wide ? r.y + 16 : iy + 12 * sc + 7;
    const ink = o.dim ? DIM : INK;
    for (const line of wrap(def.name, tw, 2)) {
      drawText(ctx, line, cx, y, o.dim ? DIM : col, { scale: 2, align });
      y += 16;
    }
    for (const line of wrap(`FROM THE ${def.from.toUpperCase().replace(/^THE /, '')}`, tw)) {
      drawText(ctx, line, cx, y, DIM, { align });
      y += 9;
    }
    y += 2;
    // the verb it rides, as a chip
    const chip = tool ? `ON YOUR ${VERB_NAME[def.verb]}` : `NEEDS ${NEED[def.verb]}`;
    const cw = textWidth(chip) + 8;
    const chx = wide ? tx : Math.round(r.x + r.w / 2 - cw / 2);
    ctx.fillStyle = tool ? VERB_COLOR[def.verb] : '#3a2028';
    ctx.fillRect(chx, y - 1, cw, 9);
    drawText(ctx, chip, chx + 4, y, tool ? DARK : RED, { shadow: false });
    y += 13;
    // what it does, then (if there's room) how to use it, above the status lines
    const bottom = r.y + r.h - 24;
    const rule = wrap(def.text, tw);
    for (const line of rule) {
      if (y > bottom - 9) break;
      drawText(ctx, line, cx, y, ink, { align });
      y += 9;
    }
    const tip = wrap(def.tip, tw);
    if (y + 4 + tip.length * 9 <= bottom) {
      y += 4;
      for (const line of tip) {
        drawText(ctx, line, cx, y, DIM, { align });
        y += 9;
      }
    }
    // what it would change on the ship
    const sx = r.x + r.w / 2;
    ctx.fillStyle = FACTION_DARK[f];
    ctx.fillRect(r.x + 4, r.y + r.h - 24, r.w - 8, 1);
    const crew = this.run.crew[i];
    const lines: [string, string][] = [];
    if (crew.grafts[def.verb] === c.id) lines.push(['ALREADY BOLTED ON', DIM]);
    else if (bolt.replaced) lines.push([`REPLACES ${GRAFTS[bolt.replaced].name}`, GOLD]);
    else lines.push([`INTO THE EMPTY ${VERB_NAME[def.verb]} SOCKET`, GREEN]);
    if (!tool) lines[0] = [`SLEEPS: NO ${NEED[def.verb].replace(/^AN? /, '')}`, RED];
    const after = factionCount(bolt.next, waysOf(crew.core.held))[f];
    if (bolt.woke.length) lines.push([`WAKES ${BONDS[bolt.woke[0]].name}!`, this.t % 0.5 < 0.25 ? INK : col]);
    else if (bolt.broke.length) lines.push([`BREAKS ${BONDS[bolt.broke[0]].name}`, RED]);
    else lines.push([`${FACTION_NAME[f]} BOND ${Math.min(after, BOND_AT)}/${BOND_AT}`, col]);
    lines.forEach(([s, cl], n) => {
      const fit = textWidth(s) > r.w - 6 ? s.replace(' SOCKET', '').replace('REPLACES', 'OVER').replace('INTO THE ', '') : s;
      drawText(ctx, fit, sx, r.y + r.h - 20 + n * 9, o.dim ? DIM : cl, { align: 'center' });
    });
  }

  /** Slow rays of light fanned round a point. */
  private rays(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number, color: string) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.25);
    ctx.fillStyle = color;
    for (let k = 0; k < 10; k++) {
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(this.t * 2 + k);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const a = (k / 10) * Math.PI * 2;
      ctx.lineTo(Math.cos(a - 0.09) * len, Math.sin(a - 0.09) * len);
      ctx.lineTo(Math.cos(a + 0.09) * len, Math.sin(a + 0.09) * len);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** The ship's six sockets: what's on each verb, and where the card in focus would go. */
  private rack(ctx: CanvasRenderingContext2D, p: Pick, i: number) {
    const have = this.run.crew[i].grafts;
    const focus = !p.done && p.at < p.cards.length ? p.cards[p.at].id : undefined;
    const landing = p.done && p.took >= 0 && p.took < p.cards.length && p.doneT < FLY ? GRAFTS[p.cards[p.took].id].verb : undefined;
    for (const verb of VERBS) {
      const s = this.slotRect(i, verb);
      const fl = this.flash.get(`${i}:${verb}`) ?? 0;
      const kick = Math.round(fl * fl * 3);
      const target = focus && GRAFTS[focus].verb === verb;
      const tool = hasVerb(p.stats, verb);
      // (before it lands, the socket still shows what was there)
      const id = landing === verb ? p.bolts[p.took].replaced : have[verb];
      const f = id ? GRAFTS[id].faction : undefined;
      const y = s.y + kick;
      if (target) {
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(this.t * 8);
        ctx.fillStyle = VERB_COLOR[verb];
        ctx.fillRect(s.x - 2, y - 2, s.w + 4, s.h + 4);
        ctx.globalAlpha = 1;
      }
      frame(ctx, s.x, y, s.w, s.h, f ? FACTION_BODY[f] : '#15101e', target ? INK : f ? FACTION_COLOR[f] : EDGE);
      drawText(ctx, VERB_NAME[verb], s.x + 4, y + 3, tool ? VERB_COLOR[verb] : '#5a5068');
      // (a verb the ship hasn't got: its graft would sleep)
      if (!tool) drawText(ctx, '×', s.x + s.w - 4, y + 3, RED, { align: 'right' });
      const nameY = y + s.h - 10;
      if (target) {
        // the card in focus, ghosted in (over what it would push off)
        const pulse = this.t % 0.8 < 0.5;
        if (id && id !== focus) {
          const old = GRAFTS[id].name;
          drawText(ctx, old, s.x + 4, nameY, DIM);
          ctx.fillStyle = RED;
          ctx.fillRect(s.x + 3, nameY + 3, textWidth(old) + 2, 1);
        } else drawText(ctx, GRAFTS[focus].name, s.x + 4, nameY, pulse ? FACTION_COLOR[GRAFTS[focus].faction] : DIM);
        if (pulse && tool) graftIcon(ctx, focus, s.x + s.w - 15, y + 2, 1);
      } else if (id) {
        drawText(ctx, GRAFTS[id].name, s.x + 4, nameY, tool ? FACTION_COLOR[f!] : DIM);
        if (tool) graftIcon(ctx, id, s.x + s.w - 15, y + 2, 1);
      } else drawText(ctx, tool ? 'EMPTY' : 'NOT FITTED', s.x + 4, nameY, '#4a4058');
      if (fl > 0) {
        ctx.globalAlpha = fl;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(s.x, y, s.w, s.h);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** How far along each faction's bond is: pips to three, its name lit when it's awake. */
  private bondRow(ctx: CanvasRenderingContext2D, p: Pick, i: number, x: number, y: number, w: number, per: number) {
    const have = this.run.crew[i].grafts;
    const focus = !p.done && p.at < p.cards.length ? p.bolts[p.at] : undefined;
    const ways = waysOf(this.run.crew[i].core.held);
    const now = factionCount(have, ways);
    const then = focus ? factionCount(focus.next, ways) : now;
    const fs: Faction[] = ['scrap', 'lattice', 'wild', 'bloom'];
    const cw = Math.floor(w / per);
    fs.forEach((f, k) => {
      const cx = x + (k % per) * cw;
      const cy = y + Math.floor(k / per) * 10;
      const col = FACTION_COLOR[f];
      const awake = now[f] >= BOND_AT;
      for (let n = 0; n < BOND_AT; n++) {
        const lit = n < now[f];
        const coming = !lit && n < then[f];
        const going = lit && n >= then[f];
        const px = cx + n * 7;
        ctx.fillStyle = FACTION_DARK[f];
        ctx.fillRect(px, cy + 1, 5, 5);
        if ((lit && !going) || (coming && this.t % 0.5 < 0.3) || (going && this.t % 0.5 >= 0.3)) {
          ctx.fillStyle = col;
          ctx.fillRect(px, cy + 1, 5, 5);
        }
      }
      const wakes = then[f] >= BOND_AT && !awake;
      const name = BONDS[f].name;
      drawText(ctx, name, cx + 24, cy, awake || (wakes && this.t % 0.5 < 0.3) ? col : '#5a5068');
    });
  }

  private leaveButton(ctx: CanvasRenderingContext2D, p: Pick, x: number, y: number, w: number) {
    if (!p.cards.length) return;
    const on = !p.done && p.at === p.cards.length;
    const took = p.done && p.took === p.cards.length;
    frame(ctx, x, y, w, 14, on ? '#2c2240' : '#1c1526', on || took ? GOLD : EDGE);
    drawText(ctx, took ? `SOLD FOR SCRAP: +${this.scrapValue(p)}` : `LEAVE THEM: +${this.scrapValue(p)} SCRAP`, x + w / 2, y + 4, on || took ? GOLD : DIM, { align: 'center' });
    if (on) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - 5, y + 3, 2, 8);
      ctx.fillRect(x + w + 3, y + 3, 2, 8);
    }
  }

  /** A bond woken: its colour across the screen, its name and its rule. */
  private banner(ctx: CanvasRenderingContext2D, p: Pick, i: number) {
    if (!p.done || p.took < 0 || p.took >= p.cards.length) return;
    const f = p.bolts[p.took].woke[0];
    const since = p.doneT - FLY - BANNER;
    if (!f || since < 0) return;
    const b = this.bannerRect(i);
    const col = FACTION_COLOR[f];
    // wiped open from the middle
    const open = Math.min(1, since / 0.22);
    const w = Math.round(b.w * (1 - (1 - open) ** 3));
    const x = Math.round(b.x + (b.w - w) / 2);
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = FACTION_DARK[f];
    ctx.fillRect(x, b.y, w, b.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.fillRect(x, b.y, w, 2);
    ctx.fillRect(x, b.y + b.h - 2, w, 2);
    // a bright stripe sweeping along it
    const sweep = ((since * 1.3) % 1.6) - 0.3;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(b.x + sweep * b.w), b.y + 2, 24, b.h - 4);
    ctx.globalAlpha = 1;
    if (open < 1) return;
    const cx = b.x + b.w / 2;
    const pop = since < 0.35 ? 4 : 3;
    drawText(ctx, `${FACTION_NAME[f]} BOND WOKEN`, cx, b.y + 6, col, { align: 'center' });
    drawText(ctx, BONDS[f].name, cx, b.y + 17 - (pop - 3) * 3, INK, { scale: pop, align: 'center' });
    drawText(ctx, BONDS[f].text, cx, b.y + b.h - 13, col, { align: 'center' });
  }
}
