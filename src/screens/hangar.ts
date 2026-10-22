import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { CARGO, Run, crewHull } from '../sim/run';
import { cellsOf, fits, gunDir, mountFree, mountsUsed, partAt, room, rotOf, socket, stats, type Build, type Placement, type Stats } from '../sim/build';
import { CELL, EDGES, frameById, hardpointOf, HARDPOINTS, linkedStr, LOAD_CLASS, partById, verbOf, type FrameDef, type Hardpoint, type PartDef } from '../game/parts';
import { bestFit } from '../sim/fit';
import { links, type Edge, type Links } from '../sim/links';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { clamp } from '../util';
import { CLASS_COLOR, DARK, DIM, EDGE, GOLD, GREEN, H, HARDPOINT_COLOR, INK, RED, W, frame, hex } from '../ui/hud';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { bayFloor } from '../view/bay-floor';
import { backdrop, hullGauge, hints, loadGauge, partStats, shapeIcon, TIER_COLOR } from '../ui/widgets';
import { AFFIX_COLOR, AFFIXES, itemDef, itemName, MODS, modValue, tierOf, toItem, TRAITS, type Item } from '../game/loot';
import { TIER_WORD, VERB_COLOR } from '../ui/loot-card';
import { portraits } from '../view/portraits';
import type { DeviceId } from '../input';
import { markKinds, reactionsOf } from '../sim/marks';
import { markIcon, REACTION_COLOR } from '../ui/mark-icons';
import { graftIcon, FACTION_COLOR } from '../ui/graft-icon';
import { BONDS, VERBS, VERB_COLOR as GRAFT_VERB_COLOR, bondsOf, hasVerb } from '../game/grafts';
import { waysOf } from '../game/core';

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
  /** The turntable it sits over. */
  pad: THREE.Group | null;
  /** Solo: the deck, the ship seen from straight above with the grid laid over it, and what it shows (a key). */
  deck: Stage | null;
  deckModel: ShipModel | null;
  deckKey: string;
  /** What the last part placed did, played out one step at a time on the grid (t: seconds in). */
  fx: { t: number; steps: Step[] } | null;
  /** Where this player's bit of the screen starts. */
  x: number;
}

const AREA_W = 312;
/** Solo: the deck's window (the grid's cells, in texels), and the column down the right. */
const DECK = { x: 14, y: 40, w: 312, h: 262, cell: 30 };
const RIGHT = 338;
const RULES = [
  'GUNS FIRE THE WAY THEY SIT: FRONT AND MIDDLE FORWARD, OUTER COLUMNS OUT AT AN ANGLE, THE BACK ROW BEHIND.',
  'HEAT GUNS BURN, ARC SHOCKS, EXPLOSIVE CRACKS. TWO MARKS ON ONE ENEMY REACT: MOUNT THEM APART, LAND THEM TOGETHER.',
  'HARDPOINTS SAY HOW MANY TOOLS EACH BUTTON TAKES. A TOOL GOES ON ANY SOCKET, IF ITS HARDPOINT IS FREE.',
  'EVERYTHING ELSE IS A FITTING. BOOSTERS HELP THE GUNS THEY TOUCH.',
  'LINKED PARTS RUN AT 150% (200% ON A LATTICE). BACK-ROW ENGINES PUSH HARDER.',
  'EVERY GUN HAS AN EDGE: HOW IT WANTS FLYING. FIRE OUT OF A DASH AND THE GUNS STRIKE 50% HARDER.',
  'HEAVY GUNS FIRE ON THEIR OWN BUTTON, A ROUND A PRESS. A PERFECT DASH RELOADS A ROUND.',
  'EVERY PART IS LOAD. LIGHT IS NIMBLE (+1 DASH, EASIER PERFECTS); PAST FULL IS OVERLOADED. ENGINES CARRY MORE.',
];

const EDGE_COLOR: Record<Edge['kind'], string> = { boost: '#d08aff', link: GREEN };

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
  return [b.damage && `${pc(b.damage)} DMG`, b.rounds && `+${b.rounds} ROUND`, b.rate && !b.rounds && `${pc(b.rate)} RATE`, b.cool && 'COOLER'].filter(Boolean).join(' ');
}

/**
 * What placing `p` did, step by step: each link it made (with its number), what it needs and
 * hasn't got, the load it tips, and the damage it adds up to.
 */
/** What a linked part runs at on this frame, as the hangar says it ('150%'). */
const linkedPct = (frame: string) => `${Math.round(linkedStr(frameById(frame)) * 100)}%`;

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
      e.kind === 'boost' ? boostText(by.def, by.str) : by.def.link?.need ? 'LINKED: ON' : `LINKED: ${linkedPct(b.frame)}`;
    out.push({ c, r, text: `${partById(q.id).name.split(' ')[0]} ${text}`, color: EDGE_COLOR[e.kind] });
  }
  const def = partById(p.id);
  if (pl.idle) out.push({ c: pc, r: pr, text: pl.idle, color: RED });
  else if (pl.link && !pl.link.ok && def.link) out.push({ c: pl.link.c, r: pl.link.r, text: `${def.link.need ? 'NEEDS' : 'WANTS'} ${def.link.text}`, color: def.link.need ? RED : GOLD });
  if (after.loadClass !== before.loadClass) {
    const lc = LOAD_CLASS[after.loadClass];
    const lost = before.loadClass === 'nimble' ? 'NIMBLE LOST: -1 DASH' : `${lc.name}: ${lc.text}`;
    out.push({ c: pc, r: pr, text: after.loadClass === 'overloaded' ? `OVERLOADED! ${lc.text}` : lost, color: after.loadClass === 'steady' ? GOLD : lc.color });
  }
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
      pad: null,
      deck: coop ? null : new Stage(DECK.w, DECK.h, DECK.cell / CELL, 0.01),
      deckModel: null,
      deckKey: '',
      fx: null,
      x: coop ? 6 + i * (AREA_W + 4) : 12,
    }));
    this.bays.forEach((bay, i) => {
      if (bay.deck) bayFloor(bay.deck.scene, LIVERY[i][2]).visible = false;
      else bay.pad = bayFloor(bay.stage.scene, LIVERY[i][2]);
      // start on a socket
      const f = frameById(run.crew[i].build.frame);
      bay.cur = this.nearest(f, Math.floor(f.grid[0].length / 2), 0) ?? bay.cur;
    });
    this.bays.forEach((_, i) => this.remodel(i));
    audio.music('hangar');
  }

  private dev(i: number): DeviceId {
    return this.game.devices[i] ?? 'keys';
  }

  private remodel(i: number) {
    const bay = this.bays[i];
    if (bay.deck) return;
    const stage = bay.stage;
    if (bay.model) {
      stage.scene.remove(bay.model.root);
      bay.model.dispose();
    }
    bay.model = new ShipModel(this.run.crew[i].build, LIVERY[i]);
    stage.scene.add(bay.model.root);
  }

  /** The deck shows the ship as it would be (the carried part where it would go): rebuilt when that changes. */
  private redeck(bay: Bay, i: number, build: Build) {
    if (!bay.deck) return;
    const key = JSON.stringify(build.parts);
    if (key === bay.deckKey && bay.deckModel) return;
    bay.deckKey = key;
    if (bay.deckModel) {
      bay.deck.scene.remove(bay.deckModel.root);
      bay.deckModel.dispose();
    }
    bay.deckModel = new ShipModel(build, LIVERY[i]);
    bay.deck.scene.add(bay.deckModel.root);
  }

  /** The socket nearest a cell (any), for the cursor to land on. */
  private nearest(f: FrameDef, c: number, r: number) {
    let best: { c: number; r: number } | null = null;
    let bd = Infinity;
    for (let rr = 0; rr < f.grid.length; rr++)
      for (let cc = 0; cc < f.grid[0].length; cc++) {
        const d = Math.abs(cc - c) * 1.1 + Math.abs(rr - r);
        if (socket(f, cc, rr) && d < bd) {
          bd = d;
          best = { c: cc, r: rr };
        }
      }
    return best;
  }

  /**
   * The cursor's next stop in a direction: the nearest socket that way (the straight line first),
   * wrapping round to the far side. Carrying a part it steps a cell at a time, as a long part's
   * corner can sit off the sockets.
   */
  private step(bay: Bay, f: FrameDef, dc: number, dr: number) {
    const cols = f.grid[0].length;
    const rows = f.grid.length;
    const { c, r } = bay.cur;
    if (bay.hand) {
      bay.cur = { c: (c + dc + cols) % cols, r: (r + dr + rows) % rows };
      return;
    }
    let best: { c: number; r: number } | null = null;
    let bd = Infinity;
    for (let rr = 0; rr < rows; rr++)
      for (let cc = 0; cc < cols; cc++) {
        if (!socket(f, cc, rr) || (cc === c && rr === r)) continue;
        // how far along the way it goes (wrapped round), and how far off the line
        const along = dc ? (((cc - c) * dc + cols) % cols) : (((rr - r) * dr + rows) % rows);
        const off = dc ? Math.abs(rr - r) : Math.abs(cc - c);
        if (along === 0) continue;
        const d = along + off * 1.5;
        if (d < bd) {
          bd = d;
          best = { c: cc, r: rr };
        }
      }
    if (best) bay.cur = best;
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
      bay.deckModel?.update(dt);
      if (bay.model) {
        bay.model.root.rotation.y += dt * 0.6;
        bay.pad?.rotation.set(0, bay.model.root.rotation.y, 0);
        bay.model.update(dt);
      }
      this.control(bay, i);
    });
    if (this.bays.every((b) => b.ready)) {
      for (let i = 0; i < this.run.crew.length; i++) {
        const c = this.run.crew[i];
        c.hull = Math.min(c.hull, crewHull(c));
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
    if (m.left) this.step(bay, f, -1, 0);
    if (m.right) this.step(bay, f, 1, 0);
    if (m.up) this.step(bay, f, 0, -1);
    if (m.down) this.step(bay, f, 0, 1);
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
          const was = stats(b).loadClass;
          b.parts.splice(b.parts.indexOf(at), 1);
          const now = stats(b).loadClass;
          if (now !== was) {
            // lighter: a class back
            audio.play('load_class', { pitch: 1.25 });
            bay.msg = `${LOAD_CLASS[now].name} AGAIN`;
            bay.msgT = 2;
          }
          bay.hand = { ...at };
          bay.from = at;
          // held by its corner, so it stays where it was until moved
          bay.cur = { c: at.c, r: at.r };
          audio.play('ui_select');
          this.remodel(i);
        } else if (crew.cargo.length) {
          // out of the hold into your hand, at the best place for it: one more press bolts it on
          const it = crew.cargo.splice(bay.sel, 1)[0];
          const best = bestFit(b, it).place;
          if (best && fits(b, best)) {
            bay.hand = { ...toItem(it), c: best.c, r: best.r, rot: rotOf(best) };
            bay.cur = { c: best.c, r: best.r };
          } else {
            bay.hand = { ...toItem(it), c: bay.cur.c, r: bay.cur.r };
            const why = this.blocked(b, bay.hand);
            if (why) this.say(bay, why);
          }
          bay.from = null;
          audio.play('ui_select');
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

  /** Why a part can't go on the ship at all, for want of a hardpoint ('' if it can). */
  private blocked(b: Build, p: Placement) {
    const h = hardpointOf(partById(p.id));
    if (!h || mountFree(b, p)) return '';
    const f = frameById(b.frame);
    const m = mountsUsed(b, h);
    const name = HARDPOINTS[h].name;
    if (!m.of) return `THE ${f.name.toUpperCase()} HAS NO ${name} HARDPOINT`;
    return m.of > 1 ? `ALL ${m.of} ${name} HARDPOINTS TAKEN: LIFT ONE` : `THE ${name} HARDPOINT IS TAKEN: LIFT IT`;
  }

  /** Bolts the carried part on at the cursor, if it fits. */
  private drop(bay: Bay, i: number) {
    const b = this.run.crew[i].build;
    const p: Placement = { ...toItem(bay.hand!), c: bay.cur.c, r: bay.cur.r, rot: rotOf(bay.hand!) };
    if (!fits(b, p)) return this.say(bay, this.blocked(b, p) || "NO ROOM THERE");
    const before = stats(b);
    b.parts.push(p);
    bay.fx = { t: 0, steps: explain(b, p, before) };
    bay.hand = null;
    bay.from = null;
    audio.play('ui_place');
    if (stats(b).loadClass !== before.loadClass) audio.play('load_class', { pitch: 0.8 });
    this.remodel(i);
  }

  /** Puts the carried part in the hold (or back where it was if the hold's full). */
  private stow(bay: Bay, i: number) {
    const crew = this.run.crew[i];
    if (crew.cargo.length < CARGO) {
      crew.cargo.push(toItem(bay.hand!));
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
    // the 3D goes under the UI canvas: each area cuts a window for it
    this.bays.forEach((bay, i) => this.area(ctx, bay, i));
    if (this.bays[0].deck) {
      // solo: what's linked, and the rules of the grid, down the right
      this.linksPanel(ctx, this.bays[0], 0, 338, 292, 288, 356);
    }
    this.bays.forEach((bay) => {
      if (bay.deck) bay.deck.render(g, DECK.x, DECK.y);
      else bay.stage.render(g, bay.x + 146, 41);
    });
  }

  /** The wreck grafts bolted on, along the bottom of the ship's window, and the bonds they wake. */
  private graftStrip(ctx: CanvasRenderingContext2D, i: number, x: number, y: number) {
    const crew = this.run.crew[i];
    const st = stats(crew.build);
    let cx = x;
    for (const v of VERBS) {
      const id = crew.grafts[v];
      if (!id) continue;
      ctx.fillStyle = 'rgba(12,10,20,0.7)';
      ctx.fillRect(cx - 1, y - 1, 14, 14);
      graftIcon(ctx, id, cx, y, 1, !hasVerb(st, v));
      ctx.fillStyle = GRAFT_VERB_COLOR[v];
      ctx.fillRect(cx, y + 13, 12, 1);
      cx += 16;
    }
    for (const f of bondsOf(crew.grafts, waysOf(crew.core.held))) cx += drawText(ctx, `✦ ${BONDS[f].name}`, cx + 2, y + 3, FACTION_COLOR[f], { shadow: DARK }) + 8;
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
    const solo = !!bay.deck;
    const view = this.viewed(bay, b);
    // header
    drawText(ctx, `P${i + 1}`, x, 26, col, { scale: 1 });
    const nw = drawText(ctx, f.name.toUpperCase(), x + 18, 26, INK);
    if (solo) drawText(ctx, f.perk.name, x + 24 + nw, 26, GOLD);
    hullGauge(ctx, crew.hull, crewHull(crew), solo ? DECK.x + DECK.w - 64 : x + 100, 26, 60);
    // the deck (solo: the ship itself from above, the grid laid over it), or the grid beside a turntable
    const after = view.build !== b ? stats(view.build) : null;
    const it: Item | undefined = bay.hand ?? view.focus ?? crew.cargo[bay.sel];
    if (solo) {
      this.redeck(bay, i, view.build);
      frame(ctx, DECK.x - 2, DECK.y - 2, DECK.w + 4, DECK.h + 4, '#0c0a14');
      ctx.clearRect(DECK.x, DECK.y, DECK.w, DECK.h);
      this.grid(ctx, bay, b, view, DECK.x + DECK.w / 2, DECK.y + DECK.h / 2, DECK.cell, true);
      this.deckLabels(ctx, bay, b, view.build);
      this.statsBox(ctx, s, after, RIGHT, 38, 290);
      if (it) this.focusCard(ctx, it, bay.hand || view.focus ? view : null, RIGHT, 128, 290, i);
      else this.emptyCard(ctx, RIGHT, 128, 290);
      this.hold(ctx, bay, i, RIGHT, 198, 290);
    } else {
      frame(ctx, x, 40, 140, 106);
      const cell = Math.min(22, Math.floor(98 / f.grid.length), Math.floor(132 / f.grid[0].length));
      this.grid(ctx, bay, b, view, x + 70, 93, cell, false);
      frame(ctx, x + 145, 40, 166, 106, '#0c0a14');
      ctx.clearRect(x + 146, 41, 164, 104);
      this.statsBox(ctx, s, after, x + 145, 152, 166);
      this.hold(ctx, bay, i, x, 152, 140);
      if (it) this.focusCard(ctx, it, bay.hand || view.focus ? view : null, x, 242, AREA_W - 2, i);
    }
    // message, ready, hints
    const hx = solo ? DECK.x + DECK.w / 2 : x + AREA_W / 2;
    const hy = solo ? DECK.y + DECK.h + 8 : 324;
    if (bay.msgT > 0) {
      const my = solo ? DECK.y + DECK.h - 36 : 310;
      const good = bay.msg.startsWith('HANDED') || bay.msg.endsWith('AGAIN');
      const w = textWidth(bay.msg);
      ctx.fillStyle = 'rgba(18,12,24,0.85)';
      ctx.fillRect(Math.round(hx - w / 2) - 3, my - 2, w + 6, 11);
      drawText(ctx, bay.msg, hx, my, good ? GREEN : RED, { align: 'center' });
    }
    const dev = this.dev(i);
    if (bay.ready) {
      frame(ctx, hx - 155, hy - 4, 310, 36, '#1a3020', '#3a6a40');
      drawText(ctx, solo ? 'READY' : 'READY - WAITING FOR PARTNER', hx, hy + 2, GREEN, { align: 'center' });
      hints(ctx, dev, [['back', 'NOT YET']], hx, hy + 16, 'center');
    } else if (bay.hand) {
      hints(ctx, dev, [['confirm', 'BOLT ON'], ['alt', 'TURN'], ['back', 'TO HOLD']], hx, hy, 'center');
    } else {
      const on = partAt(b, bay.cur.c, bay.cur.r);
      hints(ctx, dev, [['confirm', on ? 'LIFT' : crew.cargo.length ? 'TAKE FROM HOLD' : 'LIFT'], ['prev', ''], ['next', 'PICK IN HOLD']], hx, hy, 'center');
      hints(ctx, dev, solo ? [['back', 'DONE']] : [['alt', 'GIVE TO PARTNER'], ['back', 'DONE']], hx, hy + 16, 'center');
    }
  }

  /** The hold: what you carry and haven't bolted on, the one you'd take next lit. */
  private hold(ctx: CanvasRenderingContext2D, bay: Bay, i: number, x: number, y: number, w: number) {
    const crew = this.run.crew[i];
    frame(ctx, x, y, w, 84);
    drawText(ctx, `HOLD ${crew.cargo.length}/${CARGO}`, x + 6, y + 4, DIM);
    const room = Math.floor((w - 28) / 6);
    for (let k = 0; k < CARGO; k++) {
      const it = crew.cargo[k];
      const ry = y + 16 + k * 11;
      const on = it !== undefined && k === bay.sel && !bay.hand;
      if (on) {
        ctx.fillStyle = '#2c2240';
        ctx.fillRect(x + 2, ry - 2, w - 4, 11);
      }
      if (it === undefined) {
        drawText(ctx, '-', x + 8, ry, '#3a2e48');
        continue;
      }
      const def = partById(it.id);
      const tier = tierOf(it);
      shapeIcon(ctx, def, x + 6, ry, 3);
      // the name in its tier's colour (stock parts plain); a legendary's glints
      const name = itemName(it);
      const col = tier === 'common' ? '#d8cce8' : TIER_COLOR[tier];
      const glint = tier === 'legendary' && Math.floor(this.t * 3 + k) % 6 === 0;
      drawText(ctx, name.length > room ? name.slice(0, room - 1) + '.' : name, x + 18, ry, on ? (tier === 'common' ? GOLD : '#ffffff') : glint ? '#fff0c0' : col);
      // its verb, as a coloured pip (a word, with room)
      const v = verbOf(def);
      if (w > 200) drawText(ctx, v, x + w - 6, ry, VERB_COLOR[v], { align: 'right' });
      else {
        ctx.fillStyle = VERB_COLOR[v];
        ctx.fillRect(x + w - 7, ry + 2, 3, 3);
      }
    }
  }

  /** Nothing in focus and nothing in the hold: say what the deck is for. */
  private emptyCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
    frame(ctx, x, y, w, 64, '#1c1526');
    drawText(ctx, 'AN OPEN DECK', x + 6, y + 4, INK);
    let ty = y + 16;
    for (const l of wrap('PARTS FROM LOOT AND DEALERS LAND IN THE HOLD. BOLT THEM ON ANYWHERE: WHERE THEY SIT, AND WHAT THEY TOUCH, IS THE BUILD.', w - 12)) {
      drawText(ctx, l, x + 6, ty, '#b8acc8');
      ty += 9;
    }
  }

  /**
   * Over the deck: how many sockets are open, which way is forward, the wreck grafts, and a pip
   * for every hardpoint, filled when a tool is on it (the one a carried tool wants, lit).
   */
  private deckLabels(ctx: CanvasRenderingContext2D, bay: Bay, b: Build, shown: Build) {
    const f = frameById(b.frame);
    const all = f.grid.join('').split('').filter((ch) => ch === '#').length;
    const used = shown.parts.reduce((n, p) => n + cellsOf(p).length, 0);
    const x = DECK.x + 6;
    const y = DECK.y + 5;
    const w = drawText(ctx, `${all - used}`, x, y, all - used ? GREEN : GOLD, { shadow: DARK });
    drawText(ctx, ` OF ${all} SOCKETS OPEN`, x + w, y, DIM, { shadow: DARK });
    drawText(ctx, '↑ FRONT', DECK.x + DECK.w - 6, y, '#6a5e78', { align: 'right', shadow: DARK });
    this.graftStrip(ctx, this.bays.indexOf(bay), x, y + 12);
    // the hardpoints, along the bottom
    const want = bay.hand ? hardpointOf(partById(bay.hand.id)) : null;
    const blink = Math.floor(this.t * 4) % 2 === 0;
    const kinds = ['T', 'H', 'A', 'S'] as Hardpoint[];
    const sy = DECK.y + DECK.h - 16;
    ctx.fillStyle = 'rgba(12,10,20,0.78)';
    ctx.fillRect(DECK.x, sy - 4, DECK.w, 20);
    const slot = DECK.w / 4;
    kinds.forEach((k, n) => {
      const cx = DECK.x + n * slot + 6;
      const m = mountsUsed(shown, k);
      const lit = want === k;
      const full = lit && mountsUsed(b, k).used >= m.of;
      const color = m.of ? HARDPOINT_COLOR[k] : '#4a3e58';
      if (lit) {
        ctx.strokeStyle = full && blink ? RED : color;
        ctx.strokeRect(cx - 3.5, sy - 2.5, slot - 6, 15);
      }
      const tw = drawText(ctx, HARDPOINTS[k].name, cx, sy + 1, color);
      if (!m.of) {
        drawText(ctx, 'NONE', cx + tw + 4, sy + 1, '#4a3e58');
        return;
      }
      for (let q = 0; q < m.of; q++) {
        const px = cx + tw + 5 + q * 8;
        ctx.fillStyle = color;
        ctx.fillRect(px, sy, 6, 7);
        if (q >= m.used) {
          ctx.fillStyle = '#120e1a';
          ctx.fillRect(px + 1, sy + 1, 4, 5);
        }
      }
    });
  }

  /**
   * A part: name, verb, what it does, and (on the grid, or about to be) what it's linked to, what
   * it clashes with and how strong that leaves it.
   */
  private focusCard(ctx: CanvasRenderingContext2D, it: Item, view: { focus: Placement | null; lk: Links } | null, x: number, y: number, w: number, who: number) {
    const def = itemDef(it);
    const tier = tierOf(it);
    frame(ctx, x, y, w, 64, '#1c1526', tier === 'common' ? undefined : TIER_COLOR[tier]);
    if (tier !== 'common') {
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.globalAlpha = 0.12;
      ctx.fillRect(x + 1, y + 1, w - 2, 11);
      ctx.globalAlpha = 1;
    }
    shapeIcon(ctx, def, x + 6, y + 5, 4);
    drawText(ctx, itemName(it), x + 22, y + 4, tier === 'common' ? INK : TIER_COLOR[tier]);
    const verb = verbOf(def);
    const vw = drawText(ctx, verb, x + w - 6, y + 4, VERB_COLOR[verb], { align: 'right' });
    if (tier !== 'common') drawText(ctx, TIER_WORD[tier], x + w - 12 - vw, y + 4, TIER_COLOR[tier], { align: 'right' });
    // the part itself, turning, on the right; the words go round it
    const pw = 48;
    const shown = portraits.draw(ctx, it.id, x + w - pw - 3, y + 14, pw, this.t, who);
    if (shown) {
      ctx.fillStyle = tier === 'common' ? EDGE : TIER_COLOR[tier];
      ctx.fillRect(x + w - pw - 4, y + 13, 1, pw + 1);
    }
    const tw = shown ? w - pw - 14 : w - 12;
    const lines: [string, string][] = [];
    // what was rolled for it, then a legendary's rule, then what it is
    if (it.mods?.length) lines.push([it.mods.map((m) => MODS[m.k].short(modValue(m))).join('   '), '#e8e0f0']);
    if (it.affix) for (const l of wrap(`✦ ${AFFIXES[it.affix].name}: ${AFFIXES[it.affix].text}`, tw).slice(0, 2)) lines.push([l, AFFIX_COLOR]);
    if (it.trait) for (const l of wrap(`★ ${TRAITS[it.trait].name}: ${TRAITS[it.trait].text}`, tw).slice(0, 2)) lines.push([l, GOLD]);
    for (const l of wrap(def.text, tw).slice(0, it.trait || it.affix ? 1 : it.mods ? 1 : 2)) lines.push([l, '#b8acc8']);
    const hp = hardpointOf(def);
    lines.push([hp ? `TAKES A ${HARDPOINTS[hp].name} HARDPOINT. ANY SOCKET` : 'A FITTING: ANY SOCKET', hp ? HARDPOINT_COLOR[hp] : DIM]);
    const pl = view?.focus ? view.lk.of(view.focus) : undefined;
    const lp = linkedPct(this.run.crew[who].build.frame);
    if (pl) {
      // the links it has, or hasn't
      if (pl.idle) lines.push([`IDLE: ${pl.idle}`, RED]);
      if (def.link) {
        const ok = pl.link?.ok;
        const how = def.link.need ? (ok ? 'LINKED' : 'NEEDS') : ok ? `LINKED ${lp}:` : `LINK FOR ${lp}:`;
        const who = ok ? pl.partners.map((q) => partById(q.id).name).join(', ') || def.link.text : def.link.text;
        lines.push([`${how} ${who}`.slice(0, 50), ok ? GREEN : def.link.need ? RED : GOLD]);
      }
      // what it does for its neighbours, and they for it
      const mine = view!.lk.edges.filter((e) => e.kind === 'boost' && (e.a === pl.p || e.b === pl.p));
      if (mine.length) {
        const other = mine.map((e) => partById((e.a === pl.p ? e.b : e.a).id).name);
        const giving = mine.some((e) => e.a === pl.p);
        lines.push([`${giving ? 'BOOSTS' : 'BOOSTED BY'} ${[...new Set(other)].join(', ')}`.slice(0, 50), EDGE_COLOR.boost]);
      }
      if (pl.str !== 1 && !pl.idle) lines.push([`RUNNING AT ${Math.round(pl.str * 100)}%`, pl.str > 1 ? GREEN : pl.str > 0 ? GOLD : RED]);
    } else if (def.link) lines.push([`${def.link.need ? 'NEEDS' : `LINK FOR ${lp}:`} ${def.link.text}`, DIM]);
    // and its numbers, if there's room
    const st = partStats(def);
    let ty = y + 15;
    const fit = (l: string) => (l.length * 6 > tw ? l.slice(0, Math.floor(tw / 6) - 1) + '.' : l);
    for (const [l, c] of lines.slice(0, 5)) {
      drawText(ctx, fit(l), x + 6, ty, c);
      ty += 9;
    }
    if (lines.length < 5) drawText(ctx, fit(st[0]), x + 6, ty, DIM);
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
    const heavies = defs.filter((d) => d.gun?.heavy);
    lines.push([heavies.length ? `HEAVY ${heavies.map((d) => d.name).join(' + ')}` : 'HEAVY NONE: THE HEAVY BUTTON DOES NOTHING', heavies.length ? VERB_COLOR.HEAVY : DIM]);
    for (const pl of lk.parts) {
      if (pl.idle) lines.push([`${pl.def.name}: IDLE, ${pl.idle}`, RED]);
      else if (pl.def.link && !pl.link?.ok && pl.def.link.need) lines.push([`${pl.def.name}: NEEDS ${pl.def.link.text}`, RED]);
      else if (pl.def.link && pl.link?.ok && !pl.def.link.need) lines.push([`${pl.def.name}: LINKED, ${linkedPct(b.frame)}`, GREEN]);
    }
    let ty = y;
    // the marks the guns leave, as icons, and what they set off together
    const st = stats(build);
    if (st.marks) {
      let mx = x;
      for (const k of markKinds(st.marks)) {
        markIcon(ctx, k, mx, ty - 1);
        mx += 12;
      }
      const rs = reactionsOf(st.marks);
      drawText(ctx, rs.length ? `→ ${rs.map((r) => r.name).join(' ')}` : 'NO REACTION YET: A SECOND MARK', mx + 2, ty, rs.length ? REACTION_COLOR[rs[0].kind] : DIM);
      ty += 12;
    }
    // the guns' edges: how this ship wants to be flown (and whether they pull it two ways)
    const edges = [...new Set(st.guns.map((g) => g.spec.edge))];
    if (edges.length) {
      drawText(ctx, `EDGES ${edges.map((e) => EDGES[e].name).join(' + ')}`.slice(0, 48), x, ty, '#ffa8d8');
      ty += 9;
      if (edges.includes('close') && edges.includes('far')) {
        drawText(ctx, 'PULLS TWO WAYS: POINT-BLANK AND LONG SHOT', x, ty, GOLD);
        ty += 9;
      }
    }
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

  /**
   * The grid. `over`: laid over the deck's 3D, so sockets are brackets and parts outlines (the
   * models show through); else drawn flat, a block per part.
   */
  private grid(ctx: CanvasRenderingContext2D, bay: Bay, b: Build, view: { build: Build; focus: Placement | null; lk: Links }, cx: number, cy: number, cell: number, over: boolean) {
    const f = frameById(b.frame);
    const cols = f.grid[0].length;
    const rows = f.grid.length;
    const x0 = Math.round(cx - (cols * cell) / 2);
    const y0 = Math.round(cy - (rows * cell) / 2);
    const lk = view.lk;
    const blink = Math.floor(this.t * 4) % 2 === 0;
    if (!over) drawText(ctx, '↑', cx, y0 - 10, '#4a3e58', { align: 'center' });
    const taken = new Set(view.build.parts.flatMap((p) => cellsOf(p).map(([c, r]) => `${c},${r}`)));
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (!socket(f, c, r)) continue;
        const sx = x0 + c * cell;
        const sy = y0 + r * cell;
        if (over) {
          // an open socket: corner brackets over the deck plate (a taken one, nothing: its part shows)
          if (taken.has(`${c},${r}`)) continue;
          ctx.fillStyle = 'rgba(14,10,24,0.35)';
          ctx.fillRect(sx + 2, sy + 2, cell - 6, cell - 6);
          ctx.fillStyle = '#a898c0';
          const k = 5;
          for (const [ax, ay, dx, dy] of [[sx + 1, sy + 1, 1, 1], [sx + cell - 4, sy + 1, -1, 1], [sx + 1, sy + cell - 4, 1, -1], [sx + cell - 4, sy + cell - 4, -1, -1]]) {
            ctx.fillRect(dx > 0 ? ax : ax - k + 1, ay, k, 1);
            ctx.fillRect(ax, dy > 0 ? ay : ay - k + 1, 1, k);
          }
          continue;
        }
        ctx.fillStyle = '#2e2640';
        ctx.fillRect(sx, sy, cell - 2, cell - 2);
        ctx.fillStyle = '#241c34';
        ctx.fillRect(sx + 2, sy + 2, cell - 6, cell - 6);
      }
    // carrying a part: where it would go, at the way it's turned (a dot, or for a gun an arrow the way it would fire), and the best place of all
    if (bay.hand) {
      const best = bestFit(b, bay.hand).place;
      const bestHere = best && rotOf(best) === rotOf(bay.hand) ? best : null;
      const gun = !!partById(bay.hand.id).gun;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const p: Placement = { ...bay.hand, c, r };
          if (!fits(b, p)) continue;
          const cs = cellsOf(p);
          const mx = x0 + (cs.reduce((t, [cc]) => t + cc, 0) / cs.length) * cell + cell / 2 - 1;
          const my = y0 + (cs.reduce((t, [, rr]) => t + rr, 0) / cs.length) * cell + cell / 2 - 1;
          const top = bestHere && bestHere.c === c && bestHere.r === r;
          ctx.fillStyle = top ? GOLD : '#8affb0';
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 5 + c + r);
          if (gun) {
            const d = gunDir(f, p);
            for (let k = -3; k < 6; k++) ctx.fillRect(Math.round(mx + Math.sin(d) * k), Math.round(my - Math.cos(d) * k), 2, 2);
            ctx.fillRect(Math.round(mx + Math.sin(d) * 5 - Math.cos(d) * 2), Math.round(my - Math.cos(d) * 5 - Math.sin(d) * 2), 2, 2);
            ctx.fillRect(Math.round(mx + Math.sin(d) * 5 + Math.cos(d) * 2), Math.round(my - Math.cos(d) * 5 + Math.sin(d) * 2), 2, 2);
          } else ctx.fillRect(Math.round(mx) - 1, Math.round(my) - 1, 3, 3);
          ctx.globalAlpha = 1;
          if (top && over) drawText(ctx, 'BEST', mx, my + cell / 2 - 9, GOLD, { align: 'center', shadow: DARK });
        }
    }
    const mid = (c: number) => c * cell + cell / 2 - 1;
    const drawPart = (p: Placement, alpha: number, bad = false) => {
      const def = partById(p.id);
      const pl = lk.of(p);
      // idle parts (missing what they need) are drawn dim
      ctx.globalAlpha = alpha * (pl && pl.str === 0 && !bad ? 0.45 : 1);
      const cells = cellsOf(p);
      const [c, r] = cells[0];
      if (over && !bad) {
        // the model shows: rim its cells in its class colour, edges it shares with itself left open
        ctx.fillStyle = CLASS_COLOR[def.cls];
        const has = (cc: number, rr: number) => cells.some(([c2, r2]) => c2 === cc && r2 === rr);
        for (const [cc, rr] of cells) {
          const px = x0 + cc * cell;
          const py = y0 + rr * cell;
          if (!has(cc, rr - 1)) ctx.fillRect(px, py, cell - 2, 1);
          if (!has(cc, rr + 1)) ctx.fillRect(px, py + cell - 3, cell - 2, 1);
          if (!has(cc - 1, rr)) ctx.fillRect(px, py, 1, cell - 2);
          if (!has(cc + 1, rr)) ctx.fillRect(px + cell - 3, py, 1, cell - 2);
        }
        if (pl && pl.str === 0) {
          // idle: struck through
          ctx.fillStyle = RED;
          for (const [cc, rr] of cells) for (let k = 2; k < cell - 4; k++) ctx.fillRect(x0 + cc * cell + k, y0 + rr * cell + k, 1, 1);
        }
      } else {
        ctx.fillStyle = bad ? RED : CLASS_COLOR[def.cls];
        for (const [cc, rr] of cells) {
          ctx.fillRect(x0 + cc * cell + 1, y0 + rr * cell + 1, cell - 4, cell - 4);
          // join the cells of a long part
          if (cells.some(([c2, r2]) => c2 === cc + 1 && r2 === rr)) ctx.fillRect(x0 + cc * cell + cell - 4, y0 + rr * cell + 4, 4, cell - 10);
          if (cells.some(([c2, r2]) => c2 === cc && r2 === rr + 1)) ctx.fillRect(x0 + cc * cell + 4, y0 + rr * cell + cell - 4, cell - 10, 4);
        }
        drawText(ctx, def.name.slice(0, 2), x0 + c * cell + cell / 2 - 1, y0 + r * cell + 7, DARK, { align: 'center', shadow: false });
      }
      // its tier: a corner pip; a legendary is ringed in moving gold
      const tier = tierOf(p);
      if (tier !== 'common' && !bad) {
        ctx.fillStyle = DARK;
        ctx.fillRect(x0 + c * cell + cell - 7, y0 + r * cell + 1, 5, 5);
        ctx.fillStyle = TIER_COLOR[tier];
        ctx.fillRect(x0 + c * cell + cell - 6, y0 + r * cell + 2, 3, 3);
      }
      if (tier === 'legendary' && !bad) {
        ctx.fillStyle = GOLD;
        for (const [cc, rr] of cells) {
          const px = x0 + cc * cell;
          const py = y0 + rr * cell;
          const k = Math.floor(this.t * 12) % 16;
          for (let s = 0; s < 4; s++) {
            const d = ((k + s * 4) % 16) / 16;
            const e = d * 4;
            const side = Math.floor(e);
            const u = (e - side) * (cell - 3);
            const [gx, gy] = side === 0 ? [u, 0] : side === 1 ? [cell - 3, u] : side === 2 ? [cell - 3 - u, cell - 3] : [0, cell - 3 - u];
            ctx.fillRect(Math.round(px + gx), Math.round(py + gy), 2, 2);
          }
        }
      }
      if (def.gun && !bad) {
        // the way it fires
        const d = gunDir(f, p);
        const mx = cells.reduce((s, [cc]) => s + cc, 0) / cells.length;
        const my = cells.reduce((s, [, rr]) => s + rr, 0) / cells.length;
        const px = x0 + mx * cell + cell / 2 - 1;
        const py = y0 + my * cell + cell / 2 - 1;
        ctx.fillStyle = '#ffffff';
        if (def.gun.auto) ctx.strokeRect(px - 4.5, py - 4.5, 8, 8);
        else if (def.gun.heavy) {
          // a heavy: a fat barrel in its verb's colour, and its rounds as shells along the bottom
          ctx.fillStyle = VERB_COLOR.HEAVY;
          // out of the cell it fires from (the front one, or the back one for a gun facing back)
          const back = Math.abs(d) > Math.PI / 2;
          const end = cells.reduce((e, cc) => ((back ? cc[1] > e[1] : cc[1] < e[1]) ? cc : e), cells[0]);
          const bx = x0 + end[0] * cell + cell / 2 - 1;
          const by = y0 + end[1] * cell + cell / 2 - 1;
          for (let k = 8; k < 17; k++) ctx.fillRect(Math.round(bx + Math.sin(d) * k) - 1, Math.round(by - Math.cos(d) * k) - 1, 3, 3);
          const [lc, lr] = cells[cells.length - 1];
          const rounds = stats(view.build).guns.find((g) => g.at === p)?.heavy ?? def.gun.heavy;
          for (let n = 0; n < rounds; n++) {
            const sx = x0 + lc * cell + cell - 6 - n * 4;
            const sy = y0 + lr * cell + cell - 8;
            ctx.fillStyle = DARK;
            ctx.fillRect(sx - 1, sy - 1, 4, 7);
            ctx.fillStyle = '#c89a48';
            ctx.fillRect(sx, sy + 2, 2, 3);
            ctx.fillStyle = '#ffd88a';
            ctx.fillRect(sx, sy, 2, 2);
          }
        } else for (let k = 6; k < 15; k++) ctx.fillRect(Math.round(px + Math.sin(d) * k), Math.round(py - Math.cos(d) * k), 2, 2);
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
    // what works with what: a mark on the edge they share, or a dotted line for a wireless link
    const focus = view.focus;
    for (const e of lk.edges) {
      const on = !focus || e.a === focus || e.b === focus;
      ctx.globalAlpha = on ? 1 : 0.35;
      for (const [c, r, c2, r2] of e.edges) {
        const mx = Math.round(x0 + mid((c + c2) / 2));
        const my = Math.round(y0 + mid((r + r2) / 2));
        ctx.fillStyle = DARK;
        ctx.fillRect(mx - 3, my - 3, 6, 6);
        ctx.fillStyle = EDGE_COLOR[e.kind];
        ctx.fillRect(mx - 2, my - 2, 4, 4);
      }
      // a wireless link has no edge to show: a dotted line, part to part
      if (!e.edges.length) {
        const ca = cellsOf(e.a);
        const cb = cellsOf(e.b);
        const ax = x0 + mid(ca.reduce((s2, [c]) => s2 + c, 0) / ca.length);
        const ay = y0 + mid(ca.reduce((s2, [, r]) => s2 + r, 0) / ca.length);
        const bx = x0 + mid(cb.reduce((s2, [c]) => s2 + c, 0) / cb.length);
        const by = y0 + mid(cb.reduce((s2, [, r]) => s2 + r, 0) / cb.length);
        const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 4));
        const off = (this.t * 3) % 1;
        ctx.fillStyle = EDGE_COLOR[e.kind];
        for (let k = 0; k < n; k++) {
          const f = (k + off) / n;
          ctx.fillRect(Math.round(ax + (bx - ax) * f) - 1, Math.round(ay + (by - ay) * f) - 1, 2, 2);
        }
      }
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
    // the part in focus: outline what it works with
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
      if (ok && over) {
        // it's in the model already: a bright pulsing rim round it
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.t * 8);
        for (const [c, r] of cellsOf(p)) ctx.strokeRect(x0 + c * cell + 0.5, y0 + r * cell + 0.5, cell - 3, cell - 3);
        ctx.globalAlpha = 1;
      } else drawPart(focus && ok ? focus : p, 0.55 + 0.25 * Math.sin(this.t * 8), !ok);
      // held where it can't go for want of a hardpoint: say so
      const why = !ok && room(b, p) ? this.blocked(b, p) : '';
      if (why) drawText(ctx, why, cx, over ? y0 + rows * cell + 6 : y0 + rows * cell + 4, RED, { align: 'center', shadow: DARK });
    }
    if (!bay.ready) {
      // the cursor: gold corners that breathe (white while carrying)
      const o = Math.round(1 + Math.sin(this.t * 6));
      const px = x0 + bay.cur.c * cell - 2 - o;
      const py = y0 + bay.cur.r * cell - 2 - o;
      const sz = cell + 1 + o * 2;
      const k = Math.max(4, Math.round(cell / 4));
      ctx.fillStyle = bay.hand ? '#ffffff' : GOLD;
      for (const [ax, ay] of [[px, py], [px + sz - k, py], [px, py + sz - 2], [px + sz - k, py + sz - 2]]) ctx.fillRect(ax, ay, k, 2);
      for (const [ax, ay] of [[px, py], [px + sz - 2, py], [px, py + sz - k], [px + sz - 2, py + sz - k]]) ctx.fillRect(ax, ay, 2, k);
    }
  }

  private statsBox(ctx: CanvasRenderingContext2D, s: Stats, after: Stats | null, x: number, y: number, w: number) {
    frame(ctx, x, y, w, 84);
    // the load first: it says how the ship will fly, and what every part costs
    loadGauge(ctx, s, after, x + 6, y + 5, w - 12, this.t);
    // then the numbers, two to a row
    const cells: [string, number, number | undefined, (n: number) => string, boolean?][] = [
      ['HULL', s.hp, after?.hp, (n) => `${n}`],
      ['SHIELD', s.shield, after?.shield, (n) => `${n}`],
      ['ARMOUR', s.armor, after?.armor, (n) => `${n}`],
      ['DASHES', s.dashes, after?.dashes, (n) => `${n}`],
      ['GUNS', s.guns.length, after?.guns.length, (n) => `${n}`],
      ['DPS', dps(s), after ? dps(after) : undefined, (n) => `${Math.round(n)}`],
      ['SPEED', s.speed, after?.speed, (n) => `${Math.round(n)}`],
    ];
    const per = w > 200 ? 3 : 2;
    const cw = w > 200 ? 96 : 84;
    cells.forEach(([label, now, then, fmt, lowerBetter], k) => {
      const cx = x + 6 + (k % per) * cw;
      const ry = y + 38 + Math.floor(k / per) * 11;
      drawText(ctx, label, cx, ry, DIM);
      drawText(ctx, fmt(now), cx + 58, ry, INK, { align: 'right' });
      if (then !== undefined && fmt(then) !== fmt(now)) {
        const better = lowerBetter ? then < now : then > now;
        drawText(ctx, `→${fmt(then)}`, cx + 60, ry, better ? GREEN : RED);
      }
    });
  }

  dispose() {
    for (const b of this.bays) {
      b.model?.dispose();
      b.deckModel?.dispose();
    }
  }
}
