import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import { CARGO, Run } from '../sim/run';
import { cellsOf, fits, gunDir, hardpointAt, partAt, rotOf, socket, stats, suits, type Build, type Placement, type Stats } from '../sim/build';
import { EDGES, frameById, hardpointOf, HARDPOINTS, hardpointsOf, linkedStr, LOAD_CLASS, partById, verbOf, type Hardpoint, type PartDef } from '../game/parts';
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
  /** What the last part placed did, played out one step at a time on the grid (t: seconds in). */
  fx: { t: number; steps: Step[] } | null;
  /** Where this player's bit of the screen starts. */
  x: number;
}

const AREA_W = 312;
const RULES = [
  'GUNS FIRE THE WAY THEY SIT: FRONT AND MIDDLE FORWARD, OUTER COLUMNS OUT AT AN ANGLE, THE BACK ROW BEHIND.',
  'HEAT GUNS BURN, ARC SHOCKS, EXPLOSIVE CRACKS. TWO MARKS ON ONE ENEMY REACT: MOUNT THEM APART, LAND THEM TOGETHER.',
  'HARDPOINTS: GUNS ON TRIGGER, HEAVY GUNS ON HEAVY, THE AUX AND SPECIAL ON THEIRS. ONE CELL ON IT IS ENOUGH.',
  'EVERYTHING ELSE IS A FITTING, ON THE PLAIN SOCKETS. BOOSTERS HELP THE GUNS THEY TOUCH.',
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
      pad: null,
      fx: null,
      x: coop ? 6 + i * (AREA_W + 4) : 12,
    }));
    if (!coop) this.big = new Stage(292, 188, 26, 50);
    this.bays.forEach((bay, i) => (bay.pad = bayFloor((this.big ?? bay.stage).scene, LIVERY[i][2])));
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
        bay.pad?.rotation.set(0, bay.model.root.rotation.y, 0);
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
          audio.play('ui_select');
          this.remodel(i);
        } else if (crew.cargo.length) {
          const it = crew.cargo.splice(bay.sel, 1)[0];
          bay.hand = { ...it, c: bay.cur.c, r: bay.cur.r };
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
    const p: Placement = { ...toItem(bay.hand!), c: bay.cur.c, r: bay.cur.r, rot: rotOf(bay.hand!) };
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
    this.bays.forEach((bay, i) => this.area(ctx, bay, i));
    if (this.big) {
      // solo: the ship big on the right, what's linked under it, and the rules of the grid
      const x = 336;
      frame(ctx, x - 2, 30, 296, 192, '#0c0a14');
      ctx.clearRect(x, 32, 292, 188);
      const s = stats(this.run.crew[0].build);
      drawText(ctx, s.frame.name.toUpperCase(), x + 4, 36, INK);
      drawText(ctx, s.frame.perk.name, x + 4 + textWidth(s.frame.name.toUpperCase() + ' '), 36, GOLD);
      this.linksPanel(ctx, this.bays[0], 0, x, 228, 292, 316);
      this.graftStrip(ctx, 0, x + 4, 206);
    }
    // the 3D goes under the UI canvas: cut windows for it
    this.bays.forEach((bay) => {
      if (!this.big) ctx.clearRect(bay.x + 146, 41, 164, 104);
    });
    if (this.big) this.big.render(g, 336, 32);
    else this.bays.forEach((bay) => bay.stage.render(g, bay.x + 146, 41));
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
    for (const f of bondsOf(crew.grafts)) cx += drawText(ctx, `✦ ${BONDS[f].name}`, cx + 2, y + 3, FACTION_COLOR[f], { shadow: DARK }) + 8;
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
    hullGauge(ctx, crew.hull, s.hp, x + 100, 26, 60);
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
      const it = crew.cargo[k];
      const y = 168 + k * 11;
      const on = it !== undefined && k === bay.sel && !bay.hand;
      if (on) {
        ctx.fillStyle = '#2c2240';
        ctx.fillRect(x + 2, y - 2, 136, 11);
      }
      if (it === undefined) {
        drawText(ctx, '-', x + 8, y, '#3a2e48');
        continue;
      }
      const def = partById(it.id);
      const tier = tierOf(it);
      shapeIcon(ctx, def, x + 6, y, 3);
      // the name in its tier's colour (stock parts plain); a legendary's glints
      const name = itemName(it);
      const col = tier === 'common' ? '#d8cce8' : TIER_COLOR[tier];
      const glint = tier === 'legendary' && Math.floor(this.t * 3 + k) % 6 === 0;
      drawText(ctx, name.length > 19 ? name.slice(0, 18) + '.' : name, x + 18, y, on ? (tier === 'common' ? GOLD : '#ffffff') : glint ? '#fff0c0' : col);
      // its verb, as a coloured pip
      ctx.fillStyle = VERB_COLOR[verbOf(def)];
      ctx.fillRect(x + 133, y + 2, 3, 3);
    }
    if (!coop) this.hardpointsBox(ctx, b, x + 145, 152, 166, 84);
    // the part in focus: what it is, what it does, what it's linked to
    const it: Item | undefined = bay.hand ?? view.focus ?? crew.cargo[bay.sel];
    if (it) this.focusCard(ctx, it, bay.hand || view.focus ? view : null, x, 242, AREA_W - 2, i);
    // message, ready, hints
    if (bay.msgT > 0) drawText(ctx, bay.msg, x + AREA_W / 2, 310, bay.msg.startsWith('HANDED') || bay.msg.endsWith('AGAIN') ? GREEN : RED, { align: 'center' });
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
    lines.push([hp ? `ON THE ${HARDPOINTS[hp].name} HARDPOINT` : 'A FITTING: PLAIN SOCKETS', hp ? HARDPOINT_COLOR[hp] : DIM]);
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
        if (!socket(f, c, r)) continue;
        // a hardpoint is rimmed in its button's colour, its letter in the well
        const hp = hardpointAt(f, c, r);
        ctx.fillStyle = hp ? HARDPOINT_COLOR[hp] : '#2e2640';
        ctx.globalAlpha = hp ? 0.55 : 1;
        ctx.fillRect(x0 + c * cell, y0 + r * cell, cell - 2, cell - 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#241c34';
        ctx.fillRect(x0 + c * cell + 2, y0 + r * cell + 2, cell - 6, cell - 6);
        if (hp) drawText(ctx, hp, x0 + c * cell + cell / 2 - 1, y0 + r * cell + 7, HARDPOINT_COLOR[hp], { align: 'center', shadow: false });
      }
    const mid = (c: number) => c * cell + cell / 2 - 1;
    const drawPart = (p: Placement, alpha: number, bad = false) => {
      const def = partById(p.id);
      const pl = lk.of(p);
      // idle parts (missing what they need) are drawn dim
      ctx.globalAlpha = alpha * (pl && pl.str === 0 && !bad ? 0.45 : 1);
      const cells = cellsOf(p);
      ctx.fillStyle = bad ? RED : CLASS_COLOR[def.cls];
      for (const [c, r] of cells) {
        ctx.fillRect(x0 + c * cell + 1, y0 + r * cell + 1, cell - 4, cell - 4);
        // join the cells of a long part
        if (cells.some(([c2, r2]) => c2 === c + 1 && r2 === r)) ctx.fillRect(x0 + c * cell + cell - 4, y0 + r * cell + 4, 4, cell - 10);
        if (cells.some(([c2, r2]) => c2 === c && r2 === r + 1)) ctx.fillRect(x0 + c * cell + 4, y0 + r * cell + cell - 4, cell - 10, 4);
      }
      const [c, r] = cells[0];
      drawText(ctx, def.name.slice(0, 2), x0 + c * cell + cell / 2 - 1, y0 + r * cell + 7, DARK, { align: 'center', shadow: false });
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
      drawPart(focus && ok ? focus : p, 0.55 + 0.25 * Math.sin(this.t * 8), !ok);
      // held where it can't go: say where it can
      if (!ok && !suits(f, p)) {
        const want = hardpointOf(partById(p.id));
        const say = want ? `GOES ON A ${HARDPOINTS[want].name} HARDPOINT` : 'A FITTING: NOT ON A HARDPOINT';
        drawText(ctx, say, cx, y0 + rows * cell + 4, want ? HARDPOINT_COLOR[want] : GOLD, { align: 'center' });
      }
    }
    if (!bay.ready && Math.floor(this.t * 3) % 3 !== 0) {
      ctx.strokeStyle = bay.hand ? INK : GOLD;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + bay.cur.c * cell - 1.5, y0 + bay.cur.r * cell - 1.5, cell + 1, cell + 1);
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
    cells.forEach(([label, now, then, fmt, lowerBetter], k) => {
      const cx = x + 6 + (k % 2) * 84;
      const ry = y + 38 + Math.floor(k / 2) * 11;
      drawText(ctx, label, cx, ry, DIM);
      drawText(ctx, fmt(now), cx + 58, ry, INK, { align: 'right' });
      if (then !== undefined && fmt(then) !== fmt(now)) {
        const better = lowerBetter ? then < now : then > now;
        drawText(ctx, `→${fmt(then)}`, cx + 60, ry, better ? GREEN : RED);
      }
    });
  }

  /** Each hardpoint the frame has, and the tool on it (or that it's empty: a button that does nothing). */
  private hardpointsBox(ctx: CanvasRenderingContext2D, b: Build, x: number, y: number, w: number, h: number) {
    frame(ctx, x, y, w, h);
    drawText(ctx, 'HARDPOINTS', x + 6, y + 4, DIM);
    const f = frameById(b.frame);
    const kinds = [...new Set(hardpointsOf(f))];
    kinds.forEach((k: Hardpoint, n) => {
      const tools = b.parts.map((p) => partById(p.id)).filter((d) => hardpointOf(d) === k);
      const ty = y + 16 + n * 11;
      drawText(ctx, HARDPOINTS[k].name, x + 6, ty, HARDPOINT_COLOR[k]);
      // two of a gun read as one line, ×2
      const names = tools.map((d) => d.name.toUpperCase());
      const say = tools.length ? [...new Set(names)].map((n) => { const k = names.filter((m) => m === n).length; return k > 1 ? `${n} ×${k}` : n; }).join(' + ') : 'EMPTY';
      const room = Math.floor((w - 70) / 6);
      drawText(ctx, say.length > room ? say.slice(0, room - 1) + '.' : say, x + w - 6, ty, tools.length ? INK : '#4a3e58', { align: 'right' });
    });
    const missing = (['T', 'H', 'A', 'S'] as Hardpoint[]).filter((k) => !kinds.includes(k));
    if (missing.length) drawText(ctx, `NO ${missing.map((k) => HARDPOINTS[k].name).join(', ')}`, x + 6, y + 16 + kinds.length * 11, '#4a3e58');
  }

  dispose() {
    for (const b of this.bays) b.model?.dispose();
  }
}
