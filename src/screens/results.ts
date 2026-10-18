import type { Game, Screen } from '../game/game';
import type { FlightResult } from './flight';
import type { LevelSpec } from '../sim/level';
import { CARGO, Run, SELL } from '../sim/run';
import { partById } from '../game/parts';
import { itemName, TIER_VALUE, tierOf, type Item, type Tier } from '../game/loot';
import { bestFit, type Fit } from '../sim/fit';
import { audio } from '../audio';
import { drawText, textWidth } from '../ui/font';
import { CYAN, DIM, EDGE, GOLD, GREEN, INK, W, frame, hex } from '../ui/hud';
import { LIVERY } from '../view/ship-model';
import { backdrop, heading, hints, shapeIcon, TIER_COLOR, TIER_DARK } from '../ui/widgets';
import { cardBack, lootCard } from '../ui/loot-card';

interface Pick {
  options: Item[];
  /** What each would do on this player's ship, worked out once. */
  fits: Fit[];
  /** Cursor: 0..2 the parts, 3 scrap it. */
  at: number;
  done: boolean;
  /** Seconds since the choice, for the stamp. */
  doneT: number;
  /** What was chosen: 0..2, or 3 for the scrap. */
  took: number;
  /** What was picked up flying, already in the hold. */
  salvaged: Item[];
  /** Parts that didn't fit in the hold and went for scrap. */
  scrapped: Item[];
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

/** When each card turns over, and how long it takes. */
const REVEAL_AT = 0.45;
const REVEAL_GAP = 0.24;
const FLIP = 0.26;

/**
 * After a level: what you salvaged on the way (straight into the hold), then each player picks
 * one of three parts, or takes the scrap instead. The cards come in face down, in their tier's
 * colours, and turn over one by one; each says what it would do on your ship.
 */
export class Results implements Screen {
  private picks: Pick[];
  private t = 0;
  private leaving = -1;
  private sparks: Spark[] = [];
  /** Card k of player i turned over yet (for its sound and sparks). */
  private shown = new Set<string>();

  constructor(
    private game: Game,
    private run: Run,
    private res: FlightResult,
    private spec: LevelSpec,
    private onDone: () => void,
  ) {
    const rich = spec.mode === 'hunt' || spec.mode === 'boss';
    this.picks = run.crew.map((crew, i) => {
      const salvaged: Item[] = [];
      const scrapped: Item[] = [];
      (res.loot[i] ?? []).forEach((id, k) => {
        const it = run.salvage(id, spec.seed * 13 + i * 101 + k * 7 + run.levels);
        (run.stow(i, it) ? salvaged : scrapped).push(it);
      });
      const options = run.lootChoice(spec.seed * 31 + i * 7 + run.levels, rich, spec.mode === 'boss');
      // ?legendary: for testing, the first card is one
      if (game.params.has('legendary')) options[0] = { ...options[0], tier: 'legendary', trait: partById(options[0].id).gun ? 'twin' : 'prismatic' };
      return { options, fits: options.map((it) => bestFit(crew.build, it)), at: 0, done: false, doneT: 0, took: -1, salvaged, scrapped };
    });
    audio.music('hangar');
  }

  private revealT(k: number) {
    return REVEAL_AT + k * REVEAL_GAP;
  }

  private get revealed() {
    return this.t > this.revealT(2) + FLIP;
  }

  update(dt: number) {
    this.t += dt;
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 30 * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    // cards turning over: a flick for each, a fanfare for a legendary
    this.picks.forEach((p, i) =>
      p.options.forEach((it, k) => {
        const key = `${i}:${k}`;
        if (this.shown.has(key) || this.t < this.revealT(k) + FLIP / 2) return;
        this.shown.add(key);
        const tier = tierOf(it);
        audio.play('card_flip', { pitch: 1 + TIERS_UP[tier] * 0.12 });
        if (tier === 'legendary') audio.play('loot_legendary');
        else if (tier === 'epic') audio.play('loot_epic');
        if (tier !== 'common') {
          const r = this.cardRect(i, k);
          this.burst(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, TIER_COLOR[tier], tier === 'legendary' ? 46 : tier === 'epic' ? 22 : 10);
        }
      }),
    );
    // a legendary card gives off the odd spark while it's on the table
    this.picks.forEach((p, i) =>
      p.options.forEach((it, k) => {
        if (tierOf(it) !== 'legendary' || !this.shown.has(`${i}:${k}`) || (p.done && p.took !== k) || Math.random() > dt * 9) return;
        const r = this.cardRect(i, k);
        this.sparks.push({ x: r.x + Math.random() * r.w, y: r.y + r.h - 4, vx: (Math.random() - 0.5) * 8, vy: -20 - Math.random() * 25, life: 1.2, max: 1.2, color: Math.random() < 0.5 ? GOLD : TIER_COLOR.legendary });
      }),
    );
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving > 0.35) this.onDone();
      return;
    }
    this.picks.forEach((p, i) => {
      if (p.done) {
        p.doneT += dt;
        return;
      }
      const m = this.game.menuOf(this.game.devices[i] ?? 'keys');
      // any button while they're coming in turns them all over
      if (!this.revealed) {
        if (m.confirm && this.t > 0.3) this.t = this.revealT(2) + FLIP;
        return;
      }
      if (p.at < 3) {
        if (m.left) p.at = (p.at + 2) % 3;
        if (m.right) p.at = (p.at + 1) % 3;
        if (m.down) p.at = 3;
        if (m.up && this.picks.length > 1) p.at = 3;
      } else if (m.up || m.down || m.left || m.right) p.at = 1;
      if (m.prev) p.at = (p.at + 3) % 4;
      if (m.next) p.at = (p.at + 1) % 4;
      if (m.up || m.down || m.left || m.right || m.prev || m.next) audio.play('ui_move');
      if (m.confirm) {
        p.took = p.at;
        if (p.at < 3) {
          const it = p.options[p.at];
          if (this.run.stow(i, it)) audio.play('pickup_part');
          else {
            p.scrapped.push(it);
            audio.play('pickup_scrap');
          }
          const r = this.cardRect(i, p.at);
          this.burst(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, TIER_COLOR[tierOf(it)], 30);
        } else {
          this.run.scrap += this.scrapValue(p);
          audio.play('pickup_scrap');
        }
        p.done = true;
      }
    });
    if (this.picks.every((p) => p.done && p.doneT > 1)) this.leaving = 0;
  }

  private burst(cx: number, cy: number, w: number, h: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      // from the card's edge, outwards
      const a = Math.random() * Math.PI * 2;
      const ex = cx + Math.cos(a) * w * 0.5;
      const ey = cy + Math.sin(a) * h * 0.5;
      const v = 30 + Math.random() * 70;
      const life = 0.5 + Math.random() * 0.7;
      this.sparks.push({ x: ex, y: ey, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life, max: life, color: Math.random() < 0.3 ? '#ffffff' : color });
    }
  }

  private scrapValue(p: Pick) {
    return Math.max(...p.options.map((it) => Math.round(SELL[partById(it.id).rarity] * TIER_VALUE[tierOf(it)]))) + 10;
  }

  /** Where the report lines end and the choosing starts. */
  private get top() {
    const n = this.res.report?.lines.length ?? 0;
    return 48 + n * 9 + (n ? 4 : 0);
  }

  /** Where a card sits: solo, three across; co-op, the one in focus under its tabs. */
  private cardRect(i: number, k: number) {
    const top = this.top;
    if (this.picks.length === 1) {
      const w = 196;
      const gap = 10;
      const x0 = Math.round((W - (3 * w + 2 * gap)) / 2);
      return { x: x0 + k * (w + gap), y: top + 14, w, h: 318 - top - 20 };
    }
    const x = 10 + i * 316;
    return { x, y: top + 52, w: 304, h: 314 - top - 56 };
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, 360);
    backdrop(ctx);
    const boss = this.spec.mode === 'boss';
    heading(ctx, boss ? 'WARDEN DOWN' : `${this.spec.planet.name.toUpperCase()} CLEAR`, `+${this.res.scrap} SCRAP   ${this.res.score} POINTS   ${this.run.scrap} SCRAP IN THE TIN`, boss ? GOLD : INK);
    // the rank, stamped in the corner, and what earned it
    const r = this.res.report;
    if (r?.rank) {
      const pop = Math.min(1, this.t * 4);
      drawText(ctx, r.rank, W - 34, 8, RANK_COLOR[r.rank] ?? INK, { scale: pop < 1 ? 6 : 5, align: 'center' });
      drawText(ctx, 'RANK', W - 34, 46, DIM, { align: 'center' });
    }
    r?.lines.forEach((l, k) => drawText(ctx, l, W / 2, 46 + k * 9, k ? DIM : INK, { align: 'center' }));
    if (this.picks.length === 1) this.solo(ctx, this.picks[0]);
    else this.picks.forEach((p, i) => this.column(ctx, p, i));
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.5);
      ctx.fillStyle = s.color;
      const sz = s.life > s.max * 0.5 ? 2 : 1;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    ctx.globalAlpha = 1;
  }

  /** A card where it is in its turn: face down, turning, or face up (lifted when in focus). */
  private card(ctx: CanvasRenderingContext2D, p: Pick, i: number, k: number) {
    const it = p.options[k];
    const tier = tierOf(it);
    const r = this.cardRect(i, k);
    const since = this.t - this.revealT(k);
    if (since < -0.3) return;
    // sliding in face down, then turning over: squeeze to a line, open on the face
    if (since < FLIP / 2) {
      const slide = Math.max(0, Math.min(1, (since + 0.3) / 0.3));
      const y = r.y + Math.round((1 - slide) * (1 - slide) * 30);
      const sq = since < 0 ? 1 : Math.cos((since / FLIP) * Math.PI);
      const w = Math.max(2, Math.round(r.w * sq));
      ctx.globalAlpha = slide;
      cardBack(ctx, tier, r.x + Math.round((r.w - w) / 2), y, w, r.h, this.t);
      ctx.globalAlpha = 1;
      return;
    }
    const on = !p.done && p.at === k;
    const opening = since < FLIP;
    if (opening) {
      const w = Math.max(2, Math.round(r.w * -Math.cos((since / FLIP) * Math.PI)));
      ctx.fillStyle = TIER_DARK[tier];
      ctx.fillRect(r.x + Math.round((r.w - w) / 2), r.y, w, r.h);
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(r.x + Math.round((r.w - w) / 2), r.y, w, 1);
      return;
    }
    // a legendary has rays behind it
    if (tier === 'legendary' && !(p.done && p.took !== k)) this.rays(ctx, r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) * 0.75);
    const lift = on ? -3 : 0;
    const crew = this.run.crew[i];
    lootCard(ctx, it, crew.build, r.x, r.y + lift, r.w, r.h, { on, t: this.t, fit: p.fits[k], terse: this.picks.length > 1, dim: p.done && p.took !== k });
    if (on && this.picks.length === 1) {
      const bob = Math.round(Math.sin(this.t * 6));
      drawText(ctx, '▲', r.x + r.w / 2, r.y + r.h + 3 + bob, GOLD, { align: 'center' });
    }
    if (p.done && p.took === k) this.stamp(ctx, r.x + r.w / 2, r.y + Math.round(r.h * 0.42), p.doneT, this.run.crew[i].cargo.includes(it) ? 'TAKEN' : 'SOLD: HOLD FULL');
  }

  /** Slow rays of light, fanned round a point. */
  private rays(ctx: CanvasRenderingContext2D, cx: number, cy: number, len: number) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.t * 0.25);
    ctx.fillStyle = TIER_COLOR.legendary;
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

  /** The stamp across a taken card. */
  private stamp(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, text: string) {
    const s = t < 0.12 ? 3 : 2;
    const w = textWidth(text, s) + 12;
    ctx.globalAlpha = Math.min(1, t * 8);
    ctx.fillStyle = 'rgba(18,12,24,0.85)';
    ctx.fillRect(Math.round(cx - w / 2), y - 4, w, 7 * s + 8);
    ctx.fillStyle = GREEN;
    ctx.fillRect(Math.round(cx - w / 2), y - 4, w, 1);
    ctx.fillRect(Math.round(cx - w / 2), y + 7 * s + 3, w, 1);
    drawText(ctx, text, cx, y, text === 'TAKEN' ? GREEN : GOLD, { scale: s, align: 'center' });
    ctx.globalAlpha = 1;
  }

  /** What came home in the hold, as tier-coloured names along a line. */
  private salvageLine(ctx: CanvasRenderingContext2D, p: Pick, x: number, y: number, w: number) {
    if (!p.salvaged.length && !p.scrapped.length) return;
    let cx = x + drawText(ctx, 'SALVAGED:', x, y, DIM) + 6;
    for (const it of p.salvaged) {
      const name = itemName(it);
      if (cx + textWidth(name) > x + w - 40) {
        drawText(ctx, '...', cx, y, DIM);
        break;
      }
      ctx.fillStyle = TIER_COLOR[tierOf(it)];
      ctx.fillRect(cx, y + 2, 3, 3);
      cx += drawText(ctx, name, cx + 5, y, TIER_COLOR[tierOf(it)]) + 12;
    }
    if (p.scrapped.length) drawText(ctx, `HOLD FULL: ${p.scrapped.length} SOLD`, x + w, y, GOLD, { align: 'right' });
  }

  private solo(ctx: CanvasRenderingContext2D, p: Pick) {
    const crew = this.run.crew[0];
    const top = this.top;
    const r0 = this.cardRect(0, 0);
    const x0 = r0.x;
    const right = this.cardRect(0, 2).x + r0.w;
    drawText(ctx, p.done ? 'DONE' : 'CHOOSE ONE', x0, top, p.done ? CYAN : INK);
    const hold = `HOLD ${crew.cargo.length}/${CARGO}`;
    drawText(ctx, hold, right, top, crew.cargo.length >= CARGO ? GOLD : DIM, { align: 'right' });
    this.salvageLine(ctx, p, x0 + 76, top, right - x0 - 76 - textWidth(hold) - 8);
    for (let k = 0; k < 3; k++) this.card(ctx, p, 0, k);
    this.scrapButton(ctx, p, W / 2 - 110, 324, 220);
    if (!p.done && this.revealed) hints(ctx, this.game.devices[0] ?? 'keys', [['move', 'CHOOSE'], ['confirm', 'TAKE']], W / 2, 346, 'center');
    else if (!this.revealed) hints(ctx, this.game.devices[0] ?? 'keys', [['confirm', 'SHOW ALL']], W / 2, 346, 'center');
  }

  private scrapButton(ctx: CanvasRenderingContext2D, p: Pick, x: number, y: number, w: number) {
    const on = !p.done && p.at === 3;
    const took = p.done && p.took === 3;
    frame(ctx, x, y, w, 14, on ? '#2c2240' : '#1c1526', on || took ? GOLD : EDGE);
    drawText(ctx, took ? `+${this.scrapValue(p)} SCRAP TAKEN` : `NONE OF THESE: +${this.scrapValue(p)} SCRAP`, x + w / 2, y + 4, on || took ? GOLD : DIM, { align: 'center' });
    if (on) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - 5, y + 3, 2, 8);
      ctx.fillRect(x + w + 3, y + 3, 2, 8);
    }
  }

  /** Co-op: a player's half. Their numbers, three tabs for the three parts, the one in focus big. */
  private column(ctx: CanvasRenderingContext2D, p: Pick, i: number) {
    const crew = this.run.crew[i];
    const st = this.res.stats[i];
    const col = hex(LIVERY[i][2]);
    const x = 10 + i * 316;
    const w = 304;
    let y = this.top - 2;
    frame(ctx, x, y, w, 18);
    drawText(ctx, `P${i + 1}`, x + 5, y + 5, col);
    drawText(ctx, `${st.kills} KILLS  ${st.grazes} GRAZES  ${st.hits} HITS`, x + 22, y + 5, INK);
    drawText(ctx, `HOLD ${crew.cargo.length}/${CARGO}`, x + w - 5, y + 5, crew.cargo.length >= CARGO ? GOLD : DIM, { align: 'right' });
    y += 21;
    this.salvageLine(ctx, p, x + 2, y, w - 4);
    y += 13;
    // the tabs
    const tw = Math.floor((w - 8) / 3);
    p.options.forEach((it, k) => {
      const tx = x + k * (tw + 4);
      const since = this.t - this.revealT(k);
      const tier = tierOf(it);
      const on = !p.done && p.at === k;
      const ty = y + (on ? -2 : 0);
      if (since < FLIP / 2) {
        if (since > -0.3) cardBack(ctx, tier, tx, ty, tw, 16, this.t);
        return;
      }
      frame(ctx, tx, ty, tw, 16, on ? TIER_DARK[tier] : '#1a1424', on ? INK : TIER_COLOR[tier]);
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(tx + 1, ty + 1, tw - 2, 1);
      shapeIcon(ctx, partById(it.id), tx + 4, ty + 4, 3);
      // the part's own name: the card under the tabs says the rest
      const name = partById(it.id).name.toUpperCase();
      const max = Math.floor((tw - 18) / 6);
      drawText(ctx, name.length > max ? name.slice(0, max) : name, tx + 15, ty + 5, on ? INK : TIER_COLOR[tier]);
      if (p.done && p.took !== k) {
        ctx.fillStyle = 'rgba(15,11,22,0.6)';
        ctx.fillRect(tx - 1, ty - 1, tw + 2, 18);
      }
    });
    // the card in focus (or the one taken)
    const k = p.done ? (p.took < 3 ? p.took : -1) : p.at < 3 ? p.at : -1;
    if (k >= 0) this.card(ctx, p, i, k);
    else {
      const r = this.cardRect(i, 0);
      frame(ctx, r.x, r.y, r.w, r.h, '#15101e', EDGE);
      drawText(ctx, 'SCRAP THEM ALL', r.x + r.w / 2, r.y + r.h / 2 - 12, GOLD, { scale: 2, align: 'center' });
      drawText(ctx, `+${this.scrapValue(p)} SCRAP, SHARED`, r.x + r.w / 2, r.y + r.h / 2 + 8, DIM, { align: 'center' });
    }
    this.scrapButton(ctx, p, x + 40, 318, w - 80);
    if (!p.done && this.revealed) hints(ctx, this.game.devices[i] ?? 'keys', [['move', 'CHOOSE'], ['confirm', 'TAKE']], x + w / 2, 340, 'center');
    if (p.done) drawText(ctx, 'DONE', x + w / 2, 340, CYAN, { align: 'center' });
  }
}

/** How far up the scale a tier is (the flip sound rises with it). */
const TIERS_UP: Record<Tier, number> = { common: 0, rare: 1, epic: 2, legendary: 4 };

const RANK_COLOR: Record<string, string> = { S: '#ffd04a', A: '#8affe0', B: '#e8e0f0', C: '#a08aa8' };
