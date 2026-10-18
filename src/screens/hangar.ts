import type { Game, Screen } from '../game/game';
import { CARGO, Run } from '../sim/run';
import { cellsOf, fits, gunDir, partAt, rotOf, stats, type Build, type Placement, type Stats } from '../sim/build';
import { frameById, partById, TAG_BONUS, verbOf, type PartDef, type Tag, type Verb } from '../game/parts';
import { links, type Edge, type Links } from '../sim/links';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { clamp } from '../util';
import { CLASS_COLOR, CYAN, DARK, DIM, GOLD, GREEN, H, INK, RED, W, frame, hex } from '../ui/hud';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { backdrop, hearts, hints, partStats, RARITY_COLOR, shapeIcon } from '../ui/widgets';
import type { DeviceId } from '../input';

interface Bay {
  cur: { c: number; r: number };
  /** The part being carried, and where it came from on the grid (to put it back). */
  hand: Placement | null;
  from: Placement | null;
  sel: number;
  ready: boolean;
  msg: string;
  msgT: number;
  stage: Stage;
  model: ShipModel | null;
  /** What the last part placed did, played out one step at a time on the grid (t: seconds in). */
  fx: { t: number; steps: Step[] } | null;
  /** Where this player's bit of the screen starts. */
  x: number;
}

const AREA_W = 312;
const RULES = [
  'GUNS FIRE THE WAY THEY SIT: FRONT AND MIDDLE FORWARD, OUTER COLUMNS OUT AT AN ANGLE, THE BACK ROW BEHIND.',
  'BOOSTERS HELP THE GUNS THEY TOUCH. CONDUIT RELAYS: WHAT TOUCHES ONE RUN OF IT TOUCHES.',
  'LINKED PARTS RUN AT 150%. ARC OR EXPLOSIVE TOUCHING HEAT CLASH: BOTH AT 50%.',
  'BACK-ROW ENGINES PUSH HARDER. 3 OF A TAG WAKE ITS SET BONUS, 5 MAKE IT STRONGER.',
];

export const VERB_COLOR: Record<Verb, string> = {
  GUN: '#ff8a4a',
  'DASH MOD': '#6ad0ff',
  AUX: '#ffd04a',
  SPECIAL: '#8affb0',
  PASSIVE: '#d08aff',
};

const EDGE_COLOR: Record<Edge['kind'], string> = { boost: '#d08aff', drone: CYAN, link: GREEN, clash: RED, fuse: GOLD };

/** Damage per second from every gun, roughly (for the stat preview). */
/** One beat of the placement replay: a cell to light, and what it means. */
interface Step {
  c: number;
  r: number;
  text: string;
  color: string;
}
const STEP_T = 0.45;

/** What a booster does, in a few words, at a strength. */
function boostText(d: PartDef, str: number) {
  const b = d.boost!;
  const pc = (n: number) => `+${Math.round(n * str * 100)}%`;
  return [b.damage && `${pc(b.damage)} DMG`, b.rate && `${pc(b.rate)} RATE`, b.cool && 'COOLER', b.homing && 'HOMING', b.burst && 'BURST'].filter(Boolean).join(' ');
}

/**
 * What placing `p` did, step by step: each link it made (with its number), what it needs and
 * hasn't got, clashes, set bonuses it woke, and the damage it adds up to.
 */
function explain(b: Build, p: Placement, before: Stats): Step[] {
  const lk = links(b);
  const after = stats(b);
  const pl = lk.of(p)!;
  const out: Step[] = [];
  const [pc, pr] = cellsOf(p)[0];
  for (const e of lk.edges) {
    if (e.a !== p && e.b !== p) continue;
    const q = e.a === p ? e.b : e.a;
    const [c, r] = cellsOf(q)[0];
    const by = lk.of(e.a)!;
    const text =
      e.kind === 'boost' ? boostText(by.def, by.str) : e.kind === 'drone' ? 'DRONE COPY' : e.kind === 'link' ? (by.def.link?.need ? 'LINKED: ON' : 'LINKED: 150%') : e.kind === 'fuse' ? 'FUSED: 125%' : 'CLASH: 50%';
    out.push({ c, r, text: `${partById(q.id).name.split(' ')[0]} ${text}`, color: EDGE_COLOR[e.kind] });
  }
  const def = partById(p.id);
  if (pl.idle) out.push({ c: pc, r: pr, text: pl.idle, color: RED });
  else if (pl.link && !pl.link.ok && def.link) out.push({ c: pl.link.c, r: pl.link.r, text: `${def.link.need ? 'NEEDS' : 'WANTS'} ${def.link.text}`, color: def.link.need ? RED : GOLD });
  for (const t of Object.keys(TAG_BONUS) as Tag[])
    if ((after.bonus[t] ?? 0) > (before.bonus[t] ?? 0)) out.push({ c: pc, r: pr, text: `${TAG_BONUS[t].name} ONLINE`, color: GOLD });
  const d0 = Math.round(dps(before));
  const d1 = Math.round(dps(after));
  if (d1 !== d0) out.push({ c: pc, r: pr, text: `DPS ${d0} → ${d1}`, color: d1 > d0 ? GREEN : RED });
  return out;
}

function dps(s: Stats) {
  return s.guns.reduce((t, g) => t + g.spec.damage * (g.spec.shot === 'beam' ? 1 : g.spec.count) * g.spec.rate, 0);
}

/**
 * The hangar: each player at their own ship, with their own pad. Lift parts off the grid, drop
 * parts from the hold onto it, turn long ones, hand them across to your partner. The numbers
 * show what a move would do before you make it.
 */
export class Hangar implements Screen {
  private bays: Bay[];
  private big: Stage | null = null;
  private t = 0;

  constructor(
    private game: Game,
    private run: Run,
    private onDone: () => void,
  ) {
    const coop = run.crew.length > 1;
    this.bays = run.crew.map((_, i) => ({
      cur: { c: 1, r: 1 },
      hand: null,
      from: null,
      sel: 0,
      ready: false,
      msg: '',
      msgT: 0,
      stage: new Stage(164, 104, 15, 50),
      model: null,
      fx: null,
      x: coop ? 6 + i * (AREA_W + 4) : 12,
    }));
    if (!coop) this.big = new Stage(292, 188, 26, 50);
    this.bays.forEach((_, i) => this.remodel(i));
    audio.music('hangar');
  }

  private dev(i: number): DeviceId {
    return this.game.devices[i] ?? 'keys';
  }

  private remodel(i: number) {
    const bay = this.bays[i];
    const stage = this.big ?? bay.stage;
    if (bay.model) {
      stage.scene.remove(bay.model.root);
      bay.model.dispose();
    }
    bay.model = new ShipModel(this.run.crew[i].build, LIVERY[i]);
    stage.scene.add(bay.model.root);
  }

  private say(bay: Bay, msg: string) {
    bay.msg = msg;
    bay.msgT = 2;
    audio.play('ui_error');
  }

  update(dt: number) {
    this.t += dt;
    this.bays.forEach((bay, i) => {
      bay.msgT -= dt;
      if (bay.fx) {
        const was = Math.floor(bay.fx.t / STEP_T);
        bay.fx.t += dt;
        const now = Math.floor(bay.fx.t / STEP_T);
        if (now !== was && now < bay.fx.steps.length) audio.play('ui_move', { vol: 0.4 + 0.1 * now });
        if (bay.fx.t > bay.fx.steps.length * STEP_T + 0.6) bay.fx = null;
      }
      if (bay.model) {
        bay.model.root.rotation.y += dt * 0.6;
        bay.model.update(dt);
      }
      this.control(bay, i);
    });
    if (this.bays.every((b) => b.ready)) {
      for (let i = 0; i < this.run.crew.length; i++) {
        const c = this.run.crew[i];
        c.hull = Math.min(c.hull, stats(c.build).hp);
      }
      audio.play('ui_select');
      this.onDone();
    }
  }

  private control(bay: Bay, i: number) {
    const m = this.game.menuOf(this.dev(i));
    const crew = this.run.crew[i];
    const b = crew.build;
    const f = frameById(b.frame);
    if (bay.ready) {
      if (m.back || m.confirm) {
        bay.ready = false;
        audio.play('ui_back');
      }
      return;
    }
    const cols = f.grid[0].length;
    const rows = f.grid.length;
    if (m.left) bay.cur.c = (bay.cur.c + cols - 1) % cols;
    if (m.right) bay.cur.c = (bay.cur.c + 1) % cols;
    if (m.up) bay.cur.r = (bay.cur.r + rows - 1) % rows;
    if (m.down) bay.cur.r = (bay.cur.r + 1) % rows;
    if (m.left || m.right || m.up || m.down) audio.play('ui_move', { vol: 0.5 });
    if (crew.cargo.length) {
      if (m.prev) bay.sel = (bay.sel + crew.cargo.length - 1) % crew.cargo.length;
      if (m.next) bay.sel = (bay.sel + 1) % crew.cargo.length;
      if (m.prev || m.next) audio.play('ui_move');
    }
    bay.sel = Math.min(bay.sel, Math.max(0, crew.cargo.length - 1));

    if (m.confirm) {
      if (bay.hand) this.drop(bay, i);
      else {
        const at = partAt(b, bay.cur.c, bay.cur.r);
        if (at) {
          b.parts.splice(b.parts.indexOf(at), 1);
          bay.hand = { ...at };
          bay.from = at;
          audio.play('ui_select');
          this.remodel(i);
        } else if (crew.cargo.length) {
          const id = crew.cargo.splice(bay.sel, 1)[0];
          bay.hand = { id, c: bay.cur.c, r: bay.cur.r };
          bay.from = null;
          this.drop(bay, i, true);
        } else this.say(bay, 'THE HOLD IS EMPTY');
      }
    } else if (m.alt) {
      if (bay.hand) {
        const shape = partById(bay.hand.id).shape;
        if (shape.length > 1) {
          // a line has two ways round, anything else four
          const line = shape.every(([c]) => c === shape[0][0]) || shape.every(([, r]) => r === shape[0][1]);
          bay.hand.rot = ((rotOf(bay.hand) + 1) & 3) % (line ? 2 : 4);
          bay.hand.turned = undefined;
          audio.play('ui_move');
        } else this.say(bay, 'NOTHING TO TURN');
      } else if (this.run.crew.length > 1 && crew.cargo.length) {
        const other = this.run.crew[1 - i];
        if (other.cargo.length >= CARGO) this.say(bay, 'THEIR HOLD IS FULL');
        else {
          other.cargo.push(crew.cargo.splice(bay.sel, 1)[0]);
          audio.play('ui_buy');
          bay.msg = `HANDED TO P${2 - i}`;
          bay.msgT = 1.5;
        }
      }
    } else if (m.back) {
      if (bay.hand) this.stow(bay, i);
      else if (!b.parts.some((p) => partById(p.id).gun)) this.say(bay, 'NO GUNS! BOLT ONE ON');
      else {
        bay.ready = true;
        audio.play('ui_select');
      }
    } else if (m.start && !bay.hand && b.parts.some((p) => partById(p.id).gun)) {
      bay.ready = true;
      audio.play('ui_select');
    }
  }

  /** Bolts the carried part on at the cursor, if it fits. */
  private drop(bay: Bay, i: number, quiet = false) {
    const b = this.run.crew[i].build;
    const p: Placement = { id: bay.hand!.id, c: bay.cur.c, r: bay.cur.r, rot: rotOf(bay.hand!) };
    if (!fits(b, p)) {
      if (!quiet) this.say(bay, "IT DOESN'T FIT THERE");
      else audio.play('ui_select');
      return;
    }
    const def = partById(p.id);
    if (def.aux && b.parts.some((q) => partById(q.id).aux)) return this.say(bay, 'ONE AUX PER SHIP: LIFT THE OTHER');
    if (def.special && b.parts.some((q) => partById(q.id).special)) return this.say(bay, 'ONE SPECIAL PER SHIP: LIFT THE OTHER');
    const before = stats(b);
    b.parts.push(p);
    bay.fx = { t: 0, steps: explain(b, p, before) };
    bay.hand = null;
    bay.from = null;
    audio.play('ui_place');
    this.remodel(i);
  }

  /** Puts the carried part in the hold (or back where it was if the hold's full). */
  private stow(bay: Bay, i: number) {
    const crew = this.run.crew[i];
    if (crew.cargo.length < CARGO) {
      crew.cargo.push(bay.hand!.id);
      bay.sel = crew.cargo.length - 1;
      audio.play('ui_back');
    } else if (bay.from && fits(crew.build, bay.from)) {
      crew.build.parts.push(bay.from);
      this.remodel(i);
      audio.play('ui_back');
    } else {
      this.say(bay, 'THE HOLD IS FULL');
      return;
    }
    bay.hand = null;
    bay.from = null;
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    backdrop(ctx);
    drawText(ctx, 'HANGAR', W / 2, 6, INK, { scale: 2, align: 'center' });
    drawText(ctx, `SCRAP ${this.run.scrap}`, W - 10, 10, GOLD, { align: 'right' });
    drawText(ctx, `SECTOR ${this.run.sector + 1}`, 10, 10, DIM);
    this.bays.forEach((bay, i) => this.area(ctx, bay, i));
    if (this.big) {
      // solo: the ship big on the right, what's linked under it, and the rules of the grid
      const x = 336;
      frame(ctx, x - 2, 30, 296, 192, '#0c0a14');
      ctx.clearRect(x, 32, 292, 188);
      const s = stats(this.run.crew[0].build);
      drawText(ctx, s.frame.name.toUpperCase(), x + 4, 36, INK);
      this.linksPanel(ctx, this.bays[0], 0, x, 228, 292, 316);
    }
    // the 3D goes under the UI canvas: cut windows for it
    this.bays.forEach((bay) => {
      if (!this.big) ctx.clearRect(bay.x + 146, 41, 164, 104);
    });
    if (this.big) this.big.render(g, 336, 32);
    else this.bays.forEach((bay) => bay.stage.render(g, bay.x + 146, 41));
  }

  /**
   * The ship as it would be: with the carried part dropped at the cursor (if it fits there), and
   * the placement in focus (that one, or whatever's under the cursor).
   */
  private viewed(bay: Bay, b: Build): { build: Build; focus: Placement | null; lk: Links } {
    let build = b;
    let focus: Placement | null = partAt(b, bay.cur.c, bay.cur.r) ?? null;
    if (bay.hand) {
      const p: Placement = { ...bay.hand, c: bay.cur.c, r: bay.cur.r };
      if (fits(b, p)) {
        build = { frame: b.frame, parts: [...b.parts, p] };
        focus = p;
      } else focus = null;
    }
    return { build, focus, lk: links(build) };
  }

  private area(ctx: CanvasRenderingContext2D, bay: Bay, i: number) {
    const crew = this.run.crew[i];
    const b = crew.build;
    const f = frameById(b.frame);
    const s = stats(b);
    const x = bay.x;
    const col = hex(LIVERY[i][2]);
    const coop = this.bays.length > 1;
    const view = this.viewed(bay, b);
    // header
    drawText(ctx, `P${i + 1}`, x, 26, col, { scale: 1 });
    drawText(ctx, f.name.toUpperCase(), x + 18, 26, INK);
    hearts(ctx, crew.hull, s.hp, x + 100, 26, 22);
    // grid
    frame(ctx, x, 40, 140, 106);
    this.grid(ctx, bay, b, view, x + 70, 93);
    // preview window frame (coop) or stats (solo)
    if (coop) frame(ctx, x + 145, 40, 166, 106, '#0c0a14');
    // what the move would do
    const after = view.build !== b ? stats(view.build) : null;
    if (coop) this.statsBox(ctx, s, after, x + 145, 152, 166);
    else this.statsBox(ctx, s, after, x + 145, 40, 166);
    // hold
    frame(ctx, x, 152, 140, 84);
    drawText(ctx, `HOLD ${crew.cargo.length}/${CARGO}`, x + 6, 156, DIM);
    for (let k = 0; k < CARGO; k++) {
      const id = crew.cargo[k];
      const y = 168 + k * 11;
      const on = id !== undefined && k === bay.sel && !bay.hand;
      if (on) {
        ctx.fillStyle = '#2c2240';
        ctx.fillRect(x + 2, y - 2, 136, 11);
      }
      if (id === undefined) {
        drawText(ctx, '-', x + 8, y, '#3a2e48');
        continue;
      }
      const def = partById(id);
      shapeIcon(ctx, def, x + 6, y, 3);
      drawText(ctx, def.name, x + 18, y, on ? GOLD : '#d8cce8');
      // its verb, as a coloured pip
      ctx.fillStyle = VERB_COLOR[verbOf(def)];
      ctx.fillRect(x + 133, y + 2, 3, 3);
    }
    if (!coop) this.tagsBox(ctx, s, after, x + 145, 152, 166, 84);
    // the part in focus: what it is, what it does, what it's linked to
    const id = bay.hand?.id ?? (view.focus ? view.focus.id : crew.cargo[bay.sel]);
    if (id) this.focusCard(ctx, partById(id), bay.hand || view.focus ? view : null, x, 242, AREA_W - 2);
    // message, ready, hints
    if (bay.msgT > 0) drawText(ctx, bay.msg, x + AREA_W / 2, 310, bay.msg.startsWith('HANDED') ? GREEN : RED, { align: 'center' });
    const dev = this.dev(i);
    if (bay.ready) {
      frame(ctx, x, 318, AREA_W - 2, 36, '#1a3020', '#3a6a40');
      drawText(ctx, coop ? 'READY - WAITING FOR PARTNER' : 'READY', x + AREA_W / 2, 324, GREEN, { align: 'center' });
      hints(ctx, dev, [['back', 'NOT YET']], x + AREA_W / 2, 338, 'center');
    } else if (bay.hand) {
      hints(ctx, dev, [['confirm', 'PLACE'], ['alt', 'TURN'], ['back', 'TO HOLD']], x + AREA_W / 2, 324, 'center');
    } else {
      hints(ctx, dev, [['confirm', 'LIFT / FIT'], ['prev', ''], ['next', 'PICK FROM HOLD']], x + AREA_W / 2, 324, 'center');
      hints(ctx, dev, coop ? [['alt', 'GIVE TO PARTNER'], ['back', 'DONE']] : [['back', 'DONE']], x + AREA_W / 2, 340, 'center');
    }
  }

  /**
   * A part: name, verb, what it does, and (on the grid, or about to be) what it's linked to, what
   * it clashes with and how strong that leaves it.
   */
  private focusCard(ctx: CanvasRenderingContext2D, def: PartDef, view: { focus: Placement | null; lk: Links } | null, x: number, y: number, w: number) {
    frame(ctx, x, y, w, 64);
    shapeIcon(ctx, def, x + 6, y + 5, 4);
    drawText(ctx, def.name, x + 22, y + 4, INK);
    const verb = verbOf(def);
    const vw = drawText(ctx, verb, x + w - 6, y + 4, VERB_COLOR[verb], { align: 'right' });
    drawText(ctx, def.rarity, x + w - 12 - vw, y + 4, RARITY_COLOR[def.rarity], { align: 'right' });
    const lines: [string, string][] = [];
    for (const l of wrap(def.text, w - 12).slice(0, 2)) lines.push([l, '#b8acc8']);
    if (def.duo) lines.push([`DUO PART: ${def.duo[0]} + ${def.duo[1]}`, CYAN]);
    const pl = view?.focus ? view.lk.of(view.focus) : undefined;
    if (pl) {
      // the links it has, or hasn't
      if (pl.idle) lines.push([`IDLE: ${pl.idle}`, RED]);
      if (def.link) {
        const ok = pl.link?.ok;
        const how = def.link.need ? (ok ? 'LINKED' : 'NEEDS') : ok ? 'LINKED 150%:' : 'LINK FOR 150%:';
        const who = ok ? pl.partners.map((q) => partById(q.id).name).join(', ') || def.link.text : def.link.text;
        lines.push([`${how} ${who}`.slice(0, 50), ok ? GREEN : def.link.need ? RED : GOLD]);
      }
      for (const c of pl.clashes) lines.push([`${c.fused ? 'FUSED' : `CLASH (${c.name})`} WITH ${partById(c.q.id).name}: ${c.fused ? '125%' : '50%'}`.slice(0, 50), c.fused ? GOLD : RED]);
      // what it does for its neighbours, and they for it
      const mine = view!.lk.edges.filter((e) => e.kind !== 'clash' && e.kind !== 'link' && (e.a === pl.p || e.b === pl.p));
      if (mine.length) {
        const other = mine.map((e) => partById((e.a === pl.p ? e.b : e.a).id).name);
        const giving = mine.some((e) => e.a === pl.p);
        lines.push([`${giving ? 'BOOSTS' : 'BOOSTED BY'} ${[...new Set(other)].join(', ')}`.slice(0, 50), EDGE_COLOR.boost]);
      }
      if (pl.str !== 1 && !pl.idle) lines.push([`RUNNING AT ${Math.round(pl.str * 100)}%`, pl.str > 1 ? GREEN : pl.str > 0 ? GOLD : RED]);
    } else if (def.link) lines.push([`${def.link.need ? 'NEEDS' : 'LINK FOR 150%:'} ${def.link.text}`, DIM]);
    // and its numbers, if there's room
    const st = partStats(def);
    let ty = y + 15;
    for (const [l, c] of lines.slice(0, 5)) {
      drawText(ctx, l, x + 6, ty, c);
      ty += 9;
    }
    if (lines.length < 5) drawText(ctx, st[0], x + 6, ty, DIM);
  }

  /** Solo, under the ship: the verbs it has, every link and clash on it, then the rules. */
  private linksPanel(ctx: CanvasRenderingContext2D, bay: Bay, i: number, x: number, y: number, w: number, bottom: number) {
    const b = this.run.crew[i].build;
    const { build, lk } = this.viewed(bay, b);
    const defs = build.parts.map((p) => partById(p.id));
    const name = (d: PartDef | undefined) => (d ? d.name.toUpperCase() : '-');
    const lines: [string, string][] = [];
    const mods = defs.filter((d) => d.mod);
    lines.push([`DASH ${mods.length ? mods.map((d) => d.name).join(' + ') : 'PLAIN'}`.slice(0, 48), VERB_COLOR['DASH MOD']]);
    lines.push([`AUX ${name(defs.find((d) => d.aux))}   SPECIAL ${name(defs.find((d) => d.special))}`.slice(0, 48), VERB_COLOR.AUX]);
    for (const pl of lk.parts) {
      if (pl.idle) lines.push([`${pl.def.name}: IDLE, ${pl.idle}`, RED]);
      else if (pl.def.link && !pl.link?.ok && pl.def.link.need) lines.push([`${pl.def.name}: NEEDS ${pl.def.link.text}`, RED]);
      else if (pl.def.link && pl.link?.ok && !pl.def.link.need) lines.push([`${pl.def.name}: LINKED, 150%`, GREEN]);
    }
    for (const e of lk.edges) if (e.kind === 'clash' || e.kind === 'fuse') lines.push([`${e.kind === 'fuse' ? 'FUSED' : 'CLASH'}: ${partById(e.a.id).name} + ${partById(e.b.id).name}`, e.kind === 'fuse' ? GOLD : RED]);
    const relays = lk.edges.filter((e) => e.via.length && e.kind !== 'clash').length;
    if (relays) lines.push([`CONDUIT RELAYS ${relays} LINK${relays > 1 ? 'S' : ''}`, CYAN]);
    let ty = y;
    for (const [l, c] of lines) {
      if (ty > bottom - 9) return;
      drawText(ctx, l.slice(0, 48), x, ty, c);
      ty += 9;
    }
    ty += 4;
    for (const rule of RULES)
      for (const l of wrap(rule, w)) {
        if (ty > bottom - 9) return;
        drawText(ctx, l, x, ty, '#7a6e88');
        ty += 9;
      }
  }

  private grid(ctx: CanvasRenderingContext2D, bay: Bay, b: Build, view: { build: Build; focus: Placement | null; lk: Links }, cx: number, cy: number) {
    const f = frameById(b.frame);
    const cols = f.grid[0].length;
    const rows = f.grid.length;
    const cell = 22;
    const x0 = Math.round(cx - (cols * cell) / 2);
    const y0 = Math.round(cy - (rows * cell) / 2);
    const lk = view.lk;
    const blink = Math.floor(this.t * 4) % 2 === 0;
    drawText(ctx, '↑', cx, y0 - 10, '#4a3e58', { align: 'center' });
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (f.grid[r][c] !== '#') continue;
        ctx.fillStyle = '#2e2640';
        ctx.fillRect(x0 + c * cell, y0 + r * cell, cell - 2, cell - 2);
        ctx.fillStyle = '#241c34';
        ctx.fillRect(x0 + c * cell + 2, y0 + r * cell + 2, cell - 6, cell - 6);
      }
    const mid = (c: number) => c * cell + cell / 2 - 1;
    const drawPart = (p: Placement, alpha: number, bad = false) => {
      const def = partById(p.id);
      const pl = lk.of(p);
      // idle parts (missing what they need) are drawn dim
      ctx.globalAlpha = alpha * (pl && pl.str === 0 && !bad ? 0.45 : 1);
      const cells = cellsOf(p);
      ctx.fillStyle = bad ? RED : def.conduit ? '#5a5070' : CLASS_COLOR[def.cls];
      for (const [c, r] of cells) {
        const inset = def.conduit ? 6 : 1;
        ctx.fillRect(x0 + c * cell + inset, y0 + r * cell + inset, cell - 2 - inset * 2, cell - 2 - inset * 2);
        // join the cells of a long part
        if (cells.some(([c2, r2]) => c2 === c + 1 && r2 === r)) ctx.fillRect(x0 + c * cell + cell - 4, y0 + r * cell + (def.conduit ? 8 : 4), 4, def.conduit ? 4 : cell - 10);
        if (cells.some(([c2, r2]) => c2 === c && r2 === r + 1)) ctx.fillRect(x0 + c * cell + (def.conduit ? 8 : 4), y0 + r * cell + cell - 4, def.conduit ? 4 : cell - 10, 4);
      }
      const [c, r] = cells[0];
      if (!def.conduit) drawText(ctx, def.name.slice(0, 2), x0 + c * cell + cell / 2 - 1, y0 + r * cell + 7, DARK, { align: 'center', shadow: false });
      if (def.gun && !bad) {
        // the way it fires
        const d = gunDir(f, p);
        const mx = cells.reduce((s, [cc]) => s + cc, 0) / cells.length;
        const my = cells.reduce((s, [, rr]) => s + rr, 0) / cells.length;
        const px = x0 + mx * cell + cell / 2 - 1;
        const py = y0 + my * cell + cell / 2 - 1;
        ctx.fillStyle = '#ffffff';
        if (def.gun.auto) ctx.strokeRect(px - 4.5, py - 4.5, 8, 8);
        else for (let k = 6; k < 15; k++) ctx.fillRect(Math.round(px + Math.sin(d) * k), Math.round(py - Math.cos(d) * k), 2, 2);
      }
      // the verb, as a pip in the corner (aux, special and dash mods: the ones with a button)
      const v = verbOf(def);
      if (v === 'AUX' || v === 'SPECIAL' || v === 'DASH MOD') {
        ctx.fillStyle = VERB_COLOR[v];
        ctx.fillRect(x0 + c * cell + 2, y0 + r * cell + cell - 7, 3, 3);
      }
      // its link: a tick on the side it looks across (or the corner, if anything touching will do)
      if (pl?.link && !bad) {
        const l = pl.link;
        ctx.fillStyle = l.ok ? GREEN : def.link!.need ? (blink ? RED : '#802a2a') : '#8a7030';
        const lx = x0 + l.c * cell;
        const ly = y0 + l.r * cell;
        if (l.side === 'n') ctx.fillRect(lx + 6, ly, cell - 14, 2);
        else if (l.side === 's') ctx.fillRect(lx + 6, ly + cell - 4, cell - 14, 2);
        else if (l.side === 'w') ctx.fillRect(lx, ly + 6, 2, cell - 14);
        else if (l.side === 'e') ctx.fillRect(lx + cell - 4, ly + 6, 2, cell - 14);
        else ctx.fillRect(lx + cell - 7, ly + 2, 3, 3);
      }
      ctx.globalAlpha = 1;
    };
    for (const p of b.parts) drawPart(p, 1);
    // what works with what: a mark on the edge they share, or lit dots along the conduit between
    const focus = view.focus;
    for (const e of lk.edges) {
      const on = !focus || e.a === focus || e.b === focus;
      if (e.kind === 'clash' && !blink && on) continue;
      ctx.globalAlpha = on ? 1 : 0.35;
      for (const [c, r, c2, r2] of e.edges) {
        const mx = Math.round(x0 + mid((c + c2) / 2));
        const my = Math.round(y0 + mid((r + r2) / 2));
        ctx.fillStyle = DARK;
        ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillStyle = EDGE_COLOR[e.kind];
        ctx.fillRect(mx - 2, my - 2, 4, 4);
      }
      ctx.fillStyle = EDGE_COLOR[e.kind];
      if (on && focus)
        for (const q of e.via)
          for (const [c, r] of cellsOf(q)) ctx.fillRect(x0 + mid(c) - 1, y0 + mid(r) - 1, 3, 3);
      ctx.globalAlpha = 1;
    }
    // the last placement, played out: one link at a time, its cell lit and its number over the grid
    if (bay.fx) {
      const k = Math.floor(bay.fx.t / STEP_T);
      const st = bay.fx.steps[Math.min(k, bay.fx.steps.length - 1)];
      if (st && k < bay.fx.steps.length + 1) {
        const f2 = (bay.fx.t % STEP_T) / STEP_T;
        ctx.strokeStyle = st.color;
        ctx.globalAlpha = 1 - f2 * 0.6;
        ctx.strokeRect(x0 + st.c * cell - 1.5, y0 + st.r * cell - 1.5, cell + 1, cell + 1);
        ctx.globalAlpha = 1;
        const w = textWidth(st.text);
        const tx = clamp(x0 + st.c * cell + cell / 2, cx - 68 + w / 2, cx + 68 - w / 2);
        const ty = y0 + st.r * cell - 9 - Math.round(f2 * 3);
        ctx.fillStyle = 'rgba(18,12,24,0.85)';
        ctx.fillRect(Math.round(tx - w / 2) - 2, ty - 2, w + 4, 11);
        drawText(ctx, st.text, tx, ty, st.color, { align: 'center' });
      }
    }
    // the part in focus: outline what it would work with (green), what it clashes with (red)
    if (focus) {
      for (const e of lk.edges) {
        if (e.a !== focus && e.b !== focus) continue;
        const q = e.a === focus ? e.b : e.a;
        ctx.strokeStyle = EDGE_COLOR[e.kind];
        for (const [c, r] of cellsOf(q)) ctx.strokeRect(x0 + c * cell + 0.5, y0 + r * cell + 0.5, cell - 3, cell - 3);
      }
    }
    if (bay.hand) {
      const p: Placement = { ...bay.hand, c: bay.cur.c, r: bay.cur.r };
      const ok = fits(b, p);
      drawPart(focus && ok ? focus : p, 0.55 + 0.25 * Math.sin(this.t * 8), !ok);
    }
    if (!bay.ready && Math.floor(this.t * 3) % 3 !== 0) {
      ctx.strokeStyle = bay.hand ? INK : GOLD;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + bay.cur.c * cell - 1.5, y0 + bay.cur.r * cell - 1.5, cell + 1, cell + 1);
    }
  }

  private statsBox(ctx: CanvasRenderingContext2D, s: Stats, after: Stats | null, x: number, y: number, w: number) {
    frame(ctx, x, y, w, 84);
    const rows: [string, number, number | undefined, (n: number) => string, boolean?][] = [
      ['HULL', s.hp, after?.hp, (n) => `${n}`],
      ['SHIELD', s.shield, after?.shield, (n) => `${n}`],
      ['SPEED', s.speed, after?.speed, (n) => n.toFixed(1)],
      ['MASS', s.mass, after?.mass, (n) => n.toFixed(1), true],
      ['POWER', s.powerOut - s.powerDraw, after ? after.powerOut - after.powerDraw : undefined, (n) => `${n >= 0 ? '+' : ''}${n}`],
      ['DASHES', s.dashes, after?.dashes, (n) => `${n}`],
      ['DPS', dps(s), after ? dps(after) : undefined, (n) => `${Math.round(n)}`],
    ];
    rows.forEach(([label, now, then, fmt, lowerBetter], k) => {
      const ry = y + 5 + k * 11;
      drawText(ctx, label, x + 6, ry, DIM);
      const warn = label === 'POWER' && now < 0;
      drawText(ctx, fmt(now), x + 92, ry, warn ? RED : INK, { align: 'right' });
      if (then !== undefined && Math.abs(then - now) > 1e-6) {
        const better = lowerBetter ? then < now : then > now;
        drawText(ctx, `→ ${fmt(then)}`, x + 100, ry, better ? GREEN : RED);
      }
    });
    if (s.brown < 1) drawText(ctx, 'BROWNOUT', x + w - 6, y + 5 + 4 * 11, RED, { align: 'right' });
  }

  private tagsBox(ctx: CanvasRenderingContext2D, s: Stats, after: Stats | null, x: number, y: number, w: number, h: number) {
    frame(ctx, x, y, w, h);
    drawText(ctx, 'TAGS', x + 6, y + 4, DIM);
    const tags = (Object.keys(s.tags) as Tag[]).filter((t) => s.tags[t] > 0 || (after?.tags[t] ?? 0) > 0);
    tags.slice(0, 6).forEach((t, k) => {
      const n = s.tags[t];
      const lvl = s.bonus[t];
      const ty = y + 16 + k * 11;
      drawText(ctx, `${t.toUpperCase()} ${n}`, x + 6, ty, lvl === 2 ? GOLD : lvl ? '#c8b0ff' : '#8a8098');
      if (after && after.tags[t] !== n) drawText(ctx, `→${after.tags[t]}`, x + 72, ty, after.tags[t] > n ? GREEN : RED);
      if (lvl) drawText(ctx, TAG_BONUS[t].name, x + w - 6, ty, lvl === 2 ? GOLD : CYAN, { align: 'right' });
    });
    if (!tags.length) drawText(ctx, 'NONE', x + 6, y + 16, '#4a3e58');
  }

  dispose() {
    for (const b of this.bays) b.model?.dispose();
  }
}
