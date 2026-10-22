import type { Game, Screen } from '../game/game';
import { CARGO, FUEL_MAX, FUEL_PRICE, REPAIR, Run, crewHull, type ShopItem, type Snapshot } from '../sim/run';
import { HULL_STEP } from '../sim/level';
import type { ChartNode } from '../sim/chart';
import { partById } from '../game/parts';
import { audio } from '../audio';
import { drawText, wrap } from '../ui/font';
import { CLASS_COLOR, CYAN, DIM, GOLD, GREEN, H, INK, RED, VIEW, W, frame, hex } from '../ui/hud';
import { LIVERY } from '../view/ship-model';
import { backdrop, heading, hullGauge, hints, TIER_COLOR } from '../ui/widgets';
import { itemName, tierOf, type Item } from '../game/loot';
import { bestFit, type Fit } from '../sim/fit';
import { lootCard, TIER_WORD } from '../ui/loot-card';
import { drawArt } from './art';
import { rng } from '../util';

const TONE = { good: GREEN, bad: RED, info: CYAN };

/** The crew's state, top right: scrap, fuel, hull, and what hangs over you. */
export function status(ctx: CanvasRenderingContext2D, run: Run, x: number, y: number) {
  const lines = 2 + run.crew.length + (run.bounty ? 1 : 0) + (run.debt ? 1 : 0) + (run.policy ? 1 : 0);
  frame(ctx, x - 132, y, 132, 6 + lines * 10, 'rgba(18,12,24,0.86)');
  let ty = y + 4;
  drawText(ctx, 'SCRAP', x - 126, ty, DIM);
  drawText(ctx, `${run.scrap}`, x - 6, ty, GOLD, { align: 'right' });
  ty += 10;
  drawText(ctx, 'FUEL', x - 126, ty, DIM);
  for (let k = 0; k < FUEL_MAX; k++) drawText(ctx, '◆', x - 96 + k * 10, ty, k < run.fuel ? '#ffb04a' : '#3a2e48');
  ty += 10;
  run.crew.forEach((c, i) => {
    drawText(ctx, `P${i + 1}`, x - 126, ty, hex(LIVERY[i][2]));
    hullGauge(ctx, c.hull, crewHull(c), x - 108, ty, 40);
    ty += 10;
  });
  if (run.bounty) {
    drawText(ctx, `BOUNTY ${run.bounty * 40}`, x - 126, ty, RED);
    ty += 10;
  }
  if (run.debt) {
    drawText(ctx, `OWE MAMA ${run.debt}`, x - 126, ty, '#ff8a7a');
    ty += 10;
  }
  if (run.policy) drawText(ctx, `INSURED ${run.policy}/${HULL_STEP} HULL`, x - 126, ty, GREEN);
}

/** Fills the whole window behind the safe area. */
export function surround(ctx: CanvasRenderingContext2D) {
  backdrop(ctx, -VIEW.ox, -VIEW.oy, VIEW.w, VIEW.h);
}

/** What a menu-ish stop offers: a row, whether it can be had, and what it does. */
interface Offer {
  label: string;
  note: string;
  price?: number;
  can: () => string | null;
  act: () => void;
}

/** A salvage dealer: buy parts, sell what's in the hold, patch the hull, fuel up. Scrap is shared. */
export class Shop implements Screen {
  private stock: ShopItem[];
  private at = 0;
  /** Who's buying (co-op: left/right swaps). */
  private who = 0;
  private msg = '';
  private msgT = 0;
  private t = 0;
  /** What each part would do on each buyer's ship, worked out when first looked at. */
  private fits: Map<Item, Fit>[] = [];

  constructor(
    private game: Game,
    private run: Run,
    private node: ChartNode,
    private onDone: () => void,
  ) {
    this.stock = run.shopStock(node);
    audio.music('hangar');
  }

  private rows() {
    type Row = { kind: 'buy'; item: ShopItem } | { kind: 'repair' } | { kind: 'fuel' } | { kind: 'debt' } | { kind: 'sell'; index: number } | { kind: 'leave' };
    const crew = this.run.crew[this.who];
    const rows: Row[] = [...this.stock.map((item) => ({ kind: 'buy', item }) as Row), { kind: 'repair' }, { kind: 'fuel' }];
    if (this.run.debt) rows.push({ kind: 'debt' });
    rows.push(...crew.cargo.map((_, index) => ({ kind: 'sell', index }) as Row), { kind: 'leave' });
    return rows;
  }

  private get fuelPrice() {
    return FUEL_PRICE + 2;
  }

  private fitFor(it: Item) {
    const byWho = (this.fits[this.who] ??= new Map());
    let f = byWho.get(it);
    if (!f) byWho.set(it, (f = bestFit(this.run.crew[this.who].build, it)));
    return f;
  }

  update(dt: number) {
    this.msgT -= dt;
    this.t += dt;
    const m = this.game.menu();
    if (this.game.params.has('autorun') && m.confirm) return this.onDone();
    const rows = this.rows();
    if (m.up) this.at = (this.at + rows.length - 1) % rows.length;
    if (m.down) this.at = (this.at + 1) % rows.length;
    if (m.up || m.down) audio.play('ui_move');
    if (this.run.crew.length > 1 && (m.left || m.right || m.prev || m.next)) {
      this.who = 1 - this.who;
      audio.play('ui_move');
    }
    this.at = Math.min(this.at, this.rows().length - 1);
    if (m.back) {
      audio.play('ui_back');
      this.onDone();
      return;
    }
    if (!m.confirm) return;
    const row = this.rows()[this.at];
    const run = this.run;
    const crew = run.crew[this.who];
    switch (row.kind) {
      case 'buy':
        if (row.item.sold) return this.say('SOLD OUT');
        if (run.scrap < row.item.price) return this.say('NOT ENOUGH SCRAP');
        if (crew.cargo.length >= CARGO) return this.say('THE HOLD IS FULL');
        run.scrap -= row.item.price;
        crew.cargo.push(row.item.part);
        row.item.sold = true;
        audio.play('ui_buy');
        break;
      case 'repair':
        if (crew.hull >= crewHull(crew)) return this.say('HULL IS SOUND');
        if (run.scrap < REPAIR) return this.say('NOT ENOUGH SCRAP');
        run.scrap -= REPAIR;
        crew.hull = Math.min(crewHull(crew), crew.hull + HULL_STEP);
        audio.play('heal');
        break;
      case 'fuel':
        if (run.fuel >= FUEL_MAX) return this.say('THE TANKS ARE FULL');
        if (run.scrap < this.fuelPrice) return this.say('NOT ENOUGH SCRAP');
        run.scrap -= this.fuelPrice;
        run.addFuel(1);
        audio.play('ui_buy');
        break;
      case 'debt': {
        const pay = Math.min(run.scrap, run.debt);
        if (!pay) return this.say('NOT ENOUGH SCRAP');
        run.scrap -= pay;
        run.debt -= pay;
        audio.play('ui_buy');
        break;
      }
      case 'sell': {
        const it = crew.cargo.splice(row.index, 1)[0];
        run.scrap += run.sellPrice(it, this.node);
        audio.play('pickup_scrap');
        break;
      }
      case 'leave':
        audio.play('ui_back');
        this.onDone();
    }
  }

  private say(msg: string) {
    this.msg = msg;
    this.msgT = 1.6;
    audio.play('ui_error');
  }

  /** A part on a row: its name in its tier's colour, a gem for anything better than stock. */
  private itemRow(ctx: CanvasRenderingContext2D, it: Item, x: number, y: number, ink: string, on: boolean) {
    const tier = tierOf(it);
    const name = itemName(it);
    const col = ink === '#4a3e58' ? ink : tier === 'common' ? ink : on ? '#ffffff' : TIER_COLOR[tier];
    if (tier !== 'common' && ink !== '#4a3e58') {
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fillRect(x - 1, y + 2, 3, 3);
    }
    drawText(ctx, name.length > 24 ? name.slice(0, 23) + '.' : name, x + (tier !== 'common' ? 5 : 0), y, col);
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    surround(ctx);
    drawArt(ctx, 'salvage', 0, 0, W, H, 0.72);
    const run = this.run;
    const mk = run.market(this.node);
    heading(ctx, this.node.name, this.node.planet ? `${this.node.planet.name}: ${this.node.planet.faction.toUpperCase()} COUNTRY` : 'SHE BUYS ANYTHING, AND PAYS A LITTLE OVER');
    // the market, in a line
    const bits: [string, string][] = [];
    if (mk.sells) bits.push([`CHEAP: ${mk.sells.toUpperCase()}S`, CLASS_COLOR[mk.sells]]);
    if (mk.wants) bits.push([`PAYS ×2: ${mk.wants.toUpperCase()}S`, CLASS_COLOR[mk.wants]]);
    if (mk.boom) bits.push([`NEWS! ×3: ${mk.boom.toUpperCase()}S`, GOLD]);
    if (mk.mark > 1) bits.push(['THEY HATE YOU: +25%', RED]);
    if (mk.mark < 1) bits.push(['FRIENDS: -20%', GREEN]);
    let bx = 40;
    for (const [t, c] of bits) bx += drawText(ctx, t, bx, 50, c) + 14;
    const rows = this.rows();
    const x = 40;
    let y = 64;
    let focus: Item | null = null;
    rows.forEach((row, k) => {
      const on = k === this.at;
      if (row.kind === 'repair' || row.kind === 'leave' || (row.kind === 'sell' && row.index === 0)) y += 5;
      if (row.kind === 'sell' && row.index === 0) {
        drawText(ctx, `SELL FROM P${this.who + 1}'S HOLD`, x, y, DIM);
        y += 11;
      }
      ctx.fillStyle = on ? 'rgba(44,34,64,0.95)' : 'rgba(18,12,24,0.7)';
      ctx.fillRect(x - 4, y - 2, 274, 11);
      if (on) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(x - 8, y - 1, 2, 9);
      }
      const ink = on ? INK : '#c8bcd8';
      if (row.kind === 'buy') {
        const it = row.item.part;
        const def = partById(it.id);
        if (on) focus = it;
        const cheap = def.cls === mk.sells;
        const tier = tierOf(it);
        this.itemRow(ctx, it, x, y, row.item.sold ? '#4a3e58' : ink, on);
        drawText(ctx, cheap ? 'CHEAP' : tier === 'common' ? '' : TIER_WORD[tier], x + 176, y, row.item.sold ? '#4a3e58' : cheap ? GREEN : TIER_COLOR[tier], { align: 'right' });
        drawText(ctx, row.item.sold ? 'SOLD' : `${row.item.price}`, x + 262, y, row.item.sold ? '#4a3e58' : run.scrap >= row.item.price ? GOLD : RED, { align: 'right' });
      } else if (row.kind === 'repair') {
        drawText(ctx, `REPAIR P${this.who + 1}: +${HULL_STEP} HULL`, x, y, ink);
        drawText(ctx, `${REPAIR}`, x + 262, y, run.scrap >= REPAIR ? GOLD : RED, { align: 'right' });
      } else if (row.kind === 'fuel') {
        drawText(ctx, `FUEL: +1 (${run.fuel}/${FUEL_MAX})`, x, y, ink);
        drawText(ctx, `${this.fuelPrice}`, x + 262, y, run.scrap >= this.fuelPrice ? GOLD : RED, { align: 'right' });
      } else if (row.kind === 'debt') {
        drawText(ctx, `PAY MAMA RUZZ (OWE ${run.debt})`, x, y, on ? INK : '#ff8a7a');
        drawText(ctx, `${Math.min(run.scrap, run.debt)}`, x + 262, y, GOLD, { align: 'right' });
      } else if (row.kind === 'sell') {
        const it = run.crew[this.who].cargo[row.index];
        const def = partById(it.id);
        if (on) focus = it;
        const price = run.sellPrice(it, this.node);
        this.itemRow(ctx, it, x, y, ink, on);
        if (def.cls === mk.wants || def.cls === mk.boom) drawText(ctx, def.cls === mk.boom ? 'BOOM' : 'WANTED', x + 176, y, GOLD, { align: 'right' });
        drawText(ctx, `+${price}`, x + 262, y, GREEN, { align: 'right' });
      } else drawText(ctx, 'LEAVE', x, y, ink);
      y += 12;
    });
    // the buyer, and the part in focus
    const rx = 340;
    run.crew.forEach((c, i) => {
      const cy = 64 + i * 34;
      frame(ctx, rx, cy, 260, 28, i === this.who ? '#2c2240' : '#1c1526', i === this.who ? hex(LIVERY[i][2]) : '#3a2e48');
      drawText(ctx, `P${i + 1}`, rx + 6, cy + 5, hex(LIVERY[i][2]));
      hullGauge(ctx, c.hull, crewHull(c), rx + 26, cy + 5, 60);
      drawText(ctx, `HOLD ${c.cargo.length}/${CARGO}`, rx + 254, cy + 16, c.cargo.length >= CARGO ? GOLD : DIM, { align: 'right' });
      if (i === 0) drawText(ctx, `SCRAP ${run.scrap}  FUEL ${run.fuel}`, rx + 6, cy + 16, GOLD);
    });
    if (focus) {
      const cy = 64 + run.crew.length * 34 + 8;
      const sold = this.stock.some((s) => s.part === focus && s.sold);
      lootCard(ctx, focus, run.crew[this.who].build, rx, cy, 260, 318 - cy, { t: this.t, fit: sold ? null : this.fitFor(focus), terse: run.crew.length > 1, dim: sold, livery: this.who });
    }
    if (this.msgT > 0) drawText(ctx, this.msg, W / 2, 322, RED, { align: 'center' });
    const dev = g.devices[0] ?? 'keys';
    hints(ctx, dev, run.crew.length > 1 ? [['confirm', 'DEAL'], ['next', 'SWAP BUYER'], ['back', 'LEAVE']] : [['confirm', 'DEAL'], ['back', 'LEAVE']], W / 2, 340, 'center');
  }
}

/** A friendly dock: they patch you up for free, sell fuel and a policy, and tell you what they've heard. */
export class Dock implements Screen {
  private line: string;
  private at = 0;
  private offers: Offer[];
  private before: Snapshot;
  private log: { text: string; tone: 'good' | 'bad' | 'info' }[] = [];
  private msg = '';
  private msgT = 0;
  private listened = false;

  constructor(
    private game: Game,
    private run: Run,
    private node: ChartNode,
    private onDone: () => void,
  ) {
    this.before = run.snapshot();
    run.crew.forEach((c) => (c.hull = crewHull(c)));
    const r = rng(run.chart.seed + run.chart.time);
    const c = run.chart;
    const lines = [
      `They say the Warden at the gate is ${c.bossPlanet.boss.name}, over ${c.bossPlanet.name}. Bring something that hits hard.`,
      c.alert >= 0 ? `${c.bodies[c.alert].planet!.name} is on alert this sector: everything there bites harder, and pays better.` : 'Quiet system, this. Nobody on alert. Enjoy it while it lasts.',
      'A trader comet goes round the wrong way. She buys anything, and pays a little over.',
      run.debt ? `Mama Ruzz's boys were in asking after you. You owe her ${run.debt}, and it grows every jump.` : 'Mama Ruzz lends to anyone. Paying her back is the expensive part.',
      run.bounty ? `There's a poster of you in the mess. Kaspar was asking. ${run.bounty * 40} scrap, it says.` : 'Kaspar the hunter came through last watch. Glad it wasn\'t you he wanted.',
    ];
    this.line = lines[Math.floor(r() * lines.length)];
    this.log = run.changes(this.before);
    this.offers = [
      {
        label: 'FUEL UP: +1',
        note: `${FUEL_PRICE} SCRAP A CELL`,
        price: FUEL_PRICE,
        can: () => (run.fuel >= FUEL_MAX ? 'THE TANKS ARE FULL' : run.scrap < FUEL_PRICE ? 'NOT ENOUGH SCRAP' : null),
        act: () => {
          run.scrap -= FUEL_PRICE;
          run.addFuel(1);
        },
      },
      {
        label: 'LANTERN MUTUAL POLICY',
        note: `15 SCRAP FOR EVERY ${HULL_STEP} HULL LOST, TILL THE GATE`,
        price: 35,
        can: () => (run.policy ? 'YOU HAVE ONE' : run.scrap < 35 ? 'NOT ENOUGH SCRAP' : null),
        act: () => {
          run.scrap -= 35;
          run.policy = 15;
        },
      },
      {
        label: 'LISTEN AROUND THE BAR',
        note: 'FREE: TWO HIDDEN SITES NAMED',
        can: () => (this.listened ? 'YOU HEARD IT ALL' : null),
        act: () => {
          this.listened = true;
          const named = run.chart.reveal(2);
          this.line = named.length ? `"Heard there's ${named.map((n) => n.name.toLowerCase()).join(', and ')} out there. Didn't hear it from me."` : '"Nothing out there we don\'t all know about."';
        },
      },
      {
        label: 'BACK TO THE CHART',
        note: '',
        can: () => null,
        act: () => this.onDone(),
      },
    ];
    audio.play('heal');
    audio.music('hangar');
  }

  update(dt: number) {
    this.msgT -= dt;
    const m = this.game.menu();
    if (this.game.params.has('autorun') && m.confirm) return this.onDone();
    const n = this.offers.length;
    if (m.up) this.at = (this.at + n - 1) % n;
    if (m.down) this.at = (this.at + 1) % n;
    if (m.up || m.down) audio.play('ui_move');
    if (m.back) {
      audio.play('ui_back');
      return this.onDone();
    }
    if (!m.confirm) return;
    const o = this.offers[this.at];
    const why = o.can();
    if (why) {
      this.msg = why;
      this.msgT = 1.6;
      audio.play('ui_error');
      return;
    }
    audio.play(o.price ? 'ui_buy' : 'ui_select');
    o.act();
    this.log = this.run.changes(this.before);
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    surround(ctx);
    drawArt(ctx, 'dock', 0, 0, W, H);
    titleBand(ctx, this.node.name, 'NO QUESTIONS, NO CHARGE FOR THE PATCHING');
    status(ctx, this.run, W - 8, 8);
    const py = 214;
    panel(ctx, py);
    // left: what they did and said
    let y = py + 10;
    drawText(ctx, 'HULLS PATCHED UP, GOOD AS NEW', 20, y, GREEN);
    y += 14;
    for (const l of wrap(this.line, 280)) {
      drawText(ctx, l, 20, y, '#d8cce8');
      y += 10;
    }
    y += 4;
    for (const c of this.log.slice(0, 5)) {
      drawText(ctx, c.text, 20, y, TONE[c.tone]);
      y += 10;
    }
    // right: what's on offer
    this.offers.forEach((o, k) => choiceRow(ctx, 322, py + 10 + k * 24, 300, o.label + (o.price ? `  ${o.price}` : ''), o.note, k === this.at, o.can() !== null && o.label !== 'BACK TO THE CHART'));
    if (this.msgT > 0) drawText(ctx, this.msg, 472, py + 112, RED, { align: 'center' });
    hints(ctx, g.devices[0] ?? 'keys', [['move', 'CHOOSE'], ['confirm', 'TAKE IT'], ['back', 'LEAVE']], W / 2, H - 14, 'center');
  }
}

/** The dark band across the top with a scene's title and who's in it. */
export function titleBand(ctx: CanvasRenderingContext2D, title: string, sub: string) {
  const g = ctx.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, 'rgba(10,7,16,0.92)');
  g.addColorStop(1, 'rgba(10,7,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 48);
  drawText(ctx, title, 14, 10, INK, { scale: 2 });
  if (sub) drawText(ctx, sub, 14, 30, GOLD);
}

/** The text panel across the bottom of a scene. */
function panel(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = 'rgba(12,9,18,0.9)';
  ctx.fillRect(6, y, W - 12, H - y - 22);
  ctx.fillStyle = '#3a2e48';
  ctx.fillRect(6, y, W - 12, 1);
  ctx.fillRect(310, y + 8, 1, H - y - 38);
  ctx.fillStyle = 'rgba(12,9,18,0.9)';
  ctx.fillRect(6, H - 22, W - 12, 20);
}

function choiceRow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, note: string, on: boolean, locked: boolean, extra?: string) {
  if (on) {
    ctx.fillStyle = '#2c2240';
    ctx.fillRect(x - 4, y - 3, w, note ? 22 : 13);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x - 8, y - 2, 2, note ? 20 : 11);
  }
  drawText(ctx, label, x, y, locked ? '#5a4e68' : on ? GOLD : INK);
  if (extra) drawText(ctx, extra, x + w - 10, y, on ? CYAN : DIM, { align: 'right' });
  if (note) drawText(ctx, note, x, y + 10, locked ? '#7a3a44' : on ? '#c8bcd8' : DIM);
}
