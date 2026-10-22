import type { Game, Screen } from '../game/game';
import { crewHull, type Run } from '../sim/run';
import {
  IMPRINTS, KNACKS, KNOT_NAME, VEINS, VEIN_COLOR, VEIN_DARK, VEIN_FED, VEIN_NAME, VEIN_WHAT, WAKE_AT, AGREEMENTS, FIRST_WORDS,
  agreementsOf, canGrow, canHold, grow, grownCount, imprint, imprintOffer, leaning, reaches, roomOf, toGrow, weightOf,
  type Core, type Fed, type ImprintId, type Knot, type Vein,
} from '../game/core';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { CYAN, DARK, DIM, EDGE, GOLD, INK, RED, W, frame, hex } from '../ui/hud';
import { backdrop, heading, hints } from '../ui/widgets';
import { coreBall, disc, knotIcon, ring, seal } from '../ui/core-icon';
import { LIVERY } from '../view/ship-model';
import { rng } from '../util';

type Rect = { x: number; y: number; w: number; h: number };

/** Where things are: the core at the top of the tree, the veins hanging below it, the panel on the right. */
const CORE = { x: 206, y: 82, r: 15 };
const VEIN_X: Record<Vein, number> = { nerve: 78, steel: 206, grease: 334 };
const ROW_Y = { k1: 120, k2: 160, k3: 200, foot: 242 };
const FORK = 34;
const PANEL: Rect = { x: 418, y: 52, w: 212, h: 266 };

/** How long a mote takes to fly from the tally to the core; the gap between tally lines; a knot growing. */
const MOTE = 0.55;
const LINE_GAP = 0.32;
const GROW_T = 0.6;

interface Mote {
  vein: Vein;
  x: number;
  y: number;
  t: number;
  /** Arrives at the core (counts) at MOTE. */
  bend: number;
  done: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  g: number;
}

type Phase = 'feed' | 'grow' | 'imprint' | 'wake' | 'room' | 'done';

/** A pilot's turn at the core. */
interface Turn {
  i: number;
  core: Core;
  fed: Fed | null;
  /** What the meter showed before the fight, and shows now (it fills as the motes land). */
  shown: number;
  shownGrows: number;
  /** Knots grown before the fight (so the meter's next mark is right). */
  base: number;
  /** The tally lines that have come in. */
  lines: number;
  phase: Phase;
  t: number;
  /** Cursor on the tree (a knot), or the room panel. */
  at: number;
  panel: 'tree' | 'room';
  roomAt: number;
  /** A knot growing: which, and since when. */
  growing: { k: number; t: number } | null;
  /** The imprints laid out by an IMPRINT knot, and the cursor (its length: leave them). */
  offer: ImprintId[];
  offerAt: number;
  /** The waking: since when. */
  wakeT: number;
  msg: string;
  msgT: number;
  /** Each vein's pulse as motes land (0..1, falling). */
  pulse: Record<Vein, number>;
}

/**
 * The core after a fight: what it took in from how you flew (each line flying into its vein), the
 * meter round it filling, and, when it's full, a knot to grow, on a vein you fed. An IMPRINT knot
 * lays out three imprints to copy; the sixth knot wakes it. Between fights (from the chart), the
 * same screen without the learning: look at the veins, take imprints up or let them go.
 *
 * Co-op: each pilot's core in turn, on their own device.
 */
export class CoreScreen implements Screen {
  private turns: Turn[];
  private k = 0;
  private time = 0;
  private motes: Mote[] = [];
  private sparks: Spark[] = [];
  private leaving = -1;

  constructor(
    private game: Game,
    private run: Run,
    /** What each pilot's fight fed (null: a look between fights). */
    fed: Fed[] | null,
    /** Each core as it was before the fight. */
    was: Core[] | null,
    private onDone: () => void,
  ) {
    const look = !fed;
    this.turns = run.crew
      .map((c, i) => {
        const core = c.core;
        const before = was?.[i];
        const t: Turn = {
          i,
          core,
          fed: fed?.[i] ?? null,
          shown: before ? before.learnt : core.learnt,
          shownGrows: before ? before.growths : core.growths,
          base: grownCount(core),
          lines: 0,
          phase: look ? (core.growths ? 'grow' : 'room') : 'feed',
          t: 0,
          at: 0,
          panel: look && !core.growths ? 'room' : 'tree',
          roomAt: 0,
          growing: null,
          offer: [],
          offerAt: 0,
          wakeT: 0,
          msg: '',
          msgT: 0,
          pulse: { nerve: 0, steel: 0, grease: 0 },
        };
        t.at = this.bestKnot(t);
        return t;
      })
      // after a fight, only the cores that grew (or have a knot owed) take a turn
      .filter((t) => look || t.core.growths > 0);
    if (!this.turns.length) this.leaving = 0;
    audio.music('hangar');
    audio.play('core_hum', { vol: 0.6 });
  }

  /** (For testing: lay out an IMPRINT knot's three straight away.) */
  devOffer() {
    const t = this.turn;
    t.lines = t.fed?.lines.length ?? 0;
    this.motes = [];
    t.offer = imprintOffer(rng(this.run.seed), t.core, 'nerve');
    t.offerAt = 0;
    t.phase = 'imprint';
    t.t = 0;
  }

  private get turn() {
    return this.turns[this.k];
  }

  private dev(t: Turn) {
    return this.game.devices[t.i] ?? 'keys';
  }

  /** Where the cursor should start: a knot that can grow now, on the vein fed most. */
  private bestKnot(t: Turn) {
    const c = t.core;
    const order = [...VEINS].sort((a, b) => (t.fed?.vein[b] ?? 0) - (t.fed?.vein[a] ?? 0));
    for (const v of order) {
      const k = c.tree.findIndex((kn, i) => kn.vein === v && canGrow(c, i));
      if (k >= 0) return k;
    }
    const r = c.tree.findIndex((_, i) => reaches(c, i));
    return r >= 0 ? r : 0;
  }

  // --- where things go -----------------------------------------------------------------------

  private knotAt(kn: Knot) {
    const x = VEIN_X[kn.vein];
    switch (kn.pos) {
      case 'k1':
        return { x, y: ROW_Y.k1 };
      case 'k2':
        return { x, y: ROW_Y.k2 };
      case 'k3a':
        return { x: x - FORK, y: ROW_Y.k3 };
      case 'k3b':
        return { x: x + FORK, y: ROW_Y.k3 };
      default:
        return { x, y: ROW_Y.foot };
    }
  }

  /** The knot a strand to `k` grows from (the core itself, for a vein's first). */
  private parentOf(c: Core, k: number): { x: number; y: number } {
    const kn = c.tree[k];
    const at = (pos: string) => c.tree.findIndex((o) => o.vein === kn.vein && o.pos === pos);
    if (kn.pos === 'k1') return { x: CORE.x, y: CORE.y + CORE.r };
    if (kn.pos === 'k2') return this.knotAt(c.tree[at('k1')]);
    if (kn.pos === 'k3a' || kn.pos === 'k3b') return this.knotAt(c.tree[at('k2')]);
    // the foot: from whichever fork has grown (the left, if neither)
    const b = at('k3b');
    return this.knotAt(c.tree[c.grown[b] && !c.grown[at('k3a')] ? b : at('k3a')]);
  }

  // --- update --------------------------------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += s.g * dt;
      s.vx *= 1 - dt * 0.8;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.leaving >= 0) {
      this.leaving += dt;
      if (this.leaving > 0.3) this.onDone();
      return;
    }
    const t = this.turn;
    t.t += dt;
    t.msgT = Math.max(0, t.msgT - dt);
    for (const v of VEINS) t.pulse[v] = Math.max(0, t.pulse[v] - dt * 2.2);
    this.updateMotes(t, dt);
    const m = this.game.menuOf(this.dev(t));
    switch (t.phase) {
      case 'feed':
        this.feed(t, m.confirm);
        break;
      case 'grow':
      case 'room':
        this.choose(t, m);
        break;
      case 'imprint':
        this.pickImprint(t, m);
        break;
      case 'wake':
        t.wakeT += dt;
        if (m.confirm && t.wakeT > 2.2) {
          audio.play('ui_select');
          this.afterGrow(t);
        }
        break;
      case 'done':
        break;
    }
  }

  /** The tally coming in, a line at a time, each throwing its motes at the core. */
  private feed(t: Turn, skip: boolean) {
    const lines = t.fed?.lines ?? [];
    const due = Math.min(lines.length, Math.floor((t.t - 0.5) / LINE_GAP) + 1);
    while (t.lines < due) {
      const l = lines[t.lines];
      const ly = this.lineY(t.lines);
      // a mote a point, a few at most for a big line (they each count more)
      const n = Math.min(l.n, 6);
      for (let k = 0; k < n; k++) this.motes.push({ vein: l.vein, x: PANEL.x + 8, y: ly + 3, t: -k * 0.07, bend: (Math.random() - 0.5) * 80, done: false });
      // (what the motes don't carry lands with the last of them)
      if (l.n > n) for (let k = n; k < l.n; k++) this.motes.push({ vein: l.vein, x: PANEL.x + 8, y: ly + 3, t: -(n - 1) * 0.07, bend: 0, done: false });
      audio.play('ui_move', { pitch: 1.2 + t.lines * 0.06, vol: 0.6 });
      t.lines++;
    }
    if (skip && t.t > 0.3) {
      // everything in at once
      t.lines = lines.length;
      for (const mo of this.motes) if (!mo.done) this.land(t, mo, true);
      this.motes = [];
      t.shown = t.core.learnt;
      t.shownGrows = t.core.growths;
    }
    if (t.lines >= lines.length && !this.motes.length && t.t > 0.6) {
      t.phase = t.core.growths ? 'grow' : 'done';
      t.at = this.bestKnot(t);
      if (t.phase === 'done') this.next();
    }
  }

  private lineY(n: number) {
    return PANEL.y + 40 + n * 11;
  }

  private updateMotes(t: Turn, dt: number) {
    for (const mo of this.motes) {
      mo.t += dt;
      if (mo.t >= MOTE && !mo.done) this.land(t, mo);
    }
    this.motes = this.motes.filter((mo) => !mo.done);
  }

  /** A point of learning lands in the core: the meter ticks, and full, it grows. */
  private land(t: Turn, mo: Mote, quiet = false) {
    mo.done = true;
    t.pulse[mo.vein] = 1;
    t.shown++;
    const need = toGrow(t.base + t.shownGrows);
    if (!quiet) audio.play('core_feed', { pitch: 0.9 + (t.shown / need) * 0.6 });
    if (t.shown >= need) {
      t.shown -= need;
      t.shownGrows++;
      if (!quiet) {
        audio.play('core_grow', { pitch: 1.2 });
        this.burst(CORE.x, CORE.y, 40, '#f4ecd8', 60);
      }
    }
  }

  /** On the tree or in the room: look, grow, take imprints up and let them go. */
  private choose(t: Turn, m: ReturnType<Game['menuOf']>) {
    const c = t.core;
    if (t.growing) {
      t.growing.t += 1 / 60;
      if (t.growing.t >= GROW_T) this.grown(t);
      return;
    }
    if (m.next || m.prev) {
      t.panel = t.panel === 'tree' ? 'room' : 'tree';
      audio.play('ui_move');
      return;
    }
    if (t.panel === 'room') return this.room(t, m);
    // move to the nearest knot that way
    const dir = m.left ? [-1, 0] : m.right ? [1, 0] : m.up ? [0, -1] : m.down ? [0, 1] : null;
    if (dir) {
      const from = this.knotAt(c.tree[t.at]);
      let best = -1;
      let bd = Infinity;
      c.tree.forEach((kn, k) => {
        if (k === t.at) return;
        const p = this.knotAt(kn);
        const dx = p.x - from.x;
        const dy = p.y - from.y;
        const along = dx * dir[0] + dy * dir[1];
        if (along <= 2) return;
        const side = Math.abs(dx * dir[1] - dy * dir[0]);
        const d = along + side * 2.2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      if (best >= 0) {
        t.at = best;
        audio.play('ui_move');
      } else if (m.right && !m.left) {
        t.panel = 'room';
        audio.play('ui_move');
      }
    }
    if (m.confirm) {
      if (t.phase === 'grow' && canGrow(c, t.at)) {
        t.growing = { k: t.at, t: 0 };
        audio.play('core_grow');
      } else if (t.phase === 'grow') {
        audio.play('ui_error');
        this.say(t, this.why(t, t.at));
      } else this.next();
    }
    if (m.back || m.start) {
      if (t.phase === 'grow') {
        audio.play('ui_error');
        this.say(t, 'GROW A KNOT FIRST');
      } else this.next();
    }
  }

  /** The room: what the core holds, and what it could. */
  private room(t: Turn, m: ReturnType<Game['menuOf']>) {
    const c = t.core;
    const n = c.owned.length;
    if (m.left) {
      t.panel = 'tree';
      audio.play('ui_move');
      return;
    }
    if (n) {
      if (m.up) t.roomAt = (t.roomAt + n - 1) % n;
      if (m.down) t.roomAt = (t.roomAt + 1) % n;
      if (m.up || m.down) audio.play('ui_move');
      t.roomAt = Math.min(t.roomAt, n - 1);
    }
    if (m.confirm && n) {
      const id = c.owned[t.roomAt];
      if (c.held.includes(id)) {
        c.held = c.held.filter((o) => o !== id);
        audio.play('ui_back');
        if (id === 'unbending') {
          const crew = this.run.crew[t.i];
          crew.hull = Math.min(crew.hull, crewHull(crew));
        }
        this.say(t, `LET ${IMPRINTS[id].name} GO`);
      } else if (canHold(c, id)) {
        c.held.push(id);
        audio.play('imprint');
        const s = this.roomRow(t.roomAt);
        this.burst(s.x + 8, s.y + 5, 6, IMPRINTS[id].color, 16);
        const pair = agreementsOf(c.held).find((p) => (p.a === id || p.b === id));
        if (pair) {
          audio.play('bond_wake', { vol: 0.6, pitch: 1.2 });
          this.say(t, `THEY AGREE: ${pair.name}`);
        } else if (leaning(c)) {
          audio.play('ui_error', { pitch: 0.7 });
          this.say(t, 'IT LEANS: EVERY HIT SHAKES THE NEWEST LOOSE');
        }
      } else {
        audio.play('ui_error');
        this.say(t, leaning(c) ? 'IT’S LEANING ALREADY: LET ONE GO' : 'NO ROOM');
      }
    }
    if (m.back || m.start) {
      if (t.phase === 'grow') {
        t.panel = 'tree';
        audio.play('ui_back');
      } else this.next();
    }
  }

  private say(t: Turn, msg: string) {
    if (!msg) return;
    t.msg = msg;
    t.msgT = 2.4;
  }

  /** Why a knot can't grow now. */
  private why(t: Turn, k: number) {
    const c = t.core;
    const kn = c.tree[k];
    if (c.grown[k]) return 'ALREADY GROWN';
    if (!reaches(c, k)) return kn.pos === 'foot' ? 'GROW ONE OF THE TWO ABOVE IT FIRST' : 'GROW THE KNOT ABOVE IT FIRST';
    return `YOU DIDN’T FEED ${VEIN_NAME[kn.vein]}: ${VEIN_FED[kn.vein]}`;
  }

  /** A knot's strand has reached it: it swells, and does what it does. */
  private grown(t: Turn) {
    const c = t.core;
    const k = t.growing!.k;
    t.growing = null;
    const woke = grow(c, k);
    const kn = c.tree[k];
    const p = this.knotAt(kn);
    const col = VEIN_COLOR[kn.vein];
    audio.play('graft_bolt', { pitch: 1.4, vol: 0.6 });
    this.burst(p.x, p.y, kn.pos === 'foot' ? 14 : 9, col, kn.pos === 'foot' ? 70 : 34);
    if (kn.kind === 'talisman') audio.play('loot_legendary', { pitch: 0.9, vol: 0.8 });
    if (kn.kind === 'room') this.say(t, 'MORE ROOM: IT CAN HOLD ANOTHER IMPRINT');
    t.shownGrows = c.growths;
    if (kn.kind === 'imprint') {
      t.offer = imprintOffer(rng(this.run.seed * 31 + t.i * 7 + this.run.levels * 13 + k), c, kn.vein);
      t.offerAt = 0;
      t.phase = 'imprint';
      t.t = 0;
      audio.play('graft_deal');
      if (woke) t.wakeT = -1;
      return;
    }
    if (woke) return this.wake(t);
    this.afterGrow(t);
  }

  private wake(t: Turn) {
    t.phase = 'wake';
    t.wakeT = 0;
    audio.play('core_wake');
    this.burst(CORE.x, CORE.y, 30, '#ffffff', 140);
  }

  /** On from a grown knot: another to grow, or done. */
  private afterGrow(t: Turn) {
    if (t.core.growths > 0) {
      t.phase = 'grow';
      t.at = this.bestKnot(t);
    } else {
      t.phase = 'room';
      t.panel = 'tree';
      t.t = 0;
    }
  }

  /** Three imprints to copy, or leave them. */
  private pickImprint(t: Turn, m: ReturnType<Game['menuOf']>) {
    const n = t.offer.length;
    if (t.t < 0.5) return;
    if (m.left) t.offerAt = (t.offerAt + n) % (n + 1);
    if (m.right) t.offerAt = (t.offerAt + 1) % (n + 1);
    if (m.down) t.offerAt = n;
    if (m.up && t.offerAt === n) t.offerAt = Math.floor((n - 1) / 2);
    if (m.left || m.right || m.up || m.down) audio.play('ui_move');
    if (m.confirm) {
      if (t.offerAt < n) {
        const id = t.offer[t.offerAt];
        imprint(t.core, id);
        audio.play('imprint');
        const r = this.offerRect(t, t.offerAt);
        this.burst(r.x + r.w / 2, r.y + 30, 20, IMPRINTS[id].color, 40);
        this.say(t, t.core.held.includes(id) ? `IT COPIED ${IMPRINTS[id].name}` : `COPIED, BUT NO ROOM: HOLD IT FROM THE ROOM`);
      } else audio.play('ui_back');
      t.offer = [];
      if (t.wakeT < 0) return this.wake(t);
      this.afterGrow(t);
    }
  }

  private next() {
    audio.play('ui_select');
    if (this.k + 1 < this.turns.length) this.k++;
    else this.leaving = 0;
  }

  private burst(cx: number, cy: number, r: number, color: string, n: number) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = 25 + Math.random() * 80;
      const life = 0.4 + Math.random() * 0.8;
      this.sparks.push({ x: cx + Math.cos(a) * r * 0.5, y: cy + Math.sin(a) * r * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15, life, max: life, color: Math.random() < 0.3 ? '#ffffff' : color, g: 40 });
    }
  }

  // --- drawing -------------------------------------------------------------------------------

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, 360);
    backdrop(ctx);
    const t = this.turn;
    if (!t) return;
    const c = t.core;
    const coop = this.run.crew.length > 1;
    const sub =
      t.phase === 'feed' ? 'IT LEARNS FROM HOW YOU FLY'
      : t.phase === 'grow' ? `GROW ${c.growths > 1 ? `${c.growths} KNOTS` : 'A KNOT'} · ON A VEIN YOU FED`
      : t.phase === 'imprint' ? 'IT COPIES WHAT IT TOUCHES'
      : t.phase === 'wake' ? 'A NEMVA: ONE WHO LISTENS'
      : c.woke ? `${c.woke.name} · AWAKE` : 'ASLEEP · IT LEARNS AS YOU FLY';
    heading(ctx, c.woke && t.phase !== 'wake' ? c.woke.name : coop ? `P${t.i + 1}'S CORE` : 'THE CORE', sub, c.woke ? VEIN_COLOR[c.woke.temper] : INK);
    if (coop) drawText(ctx, `P${t.i + 1}`, 14, 14, hex(LIVERY[t.i][2]), { scale: 2 });
    this.tree(ctx, t);
    this.panel(ctx, t);
    if (t.phase === 'imprint') this.offerCards(ctx, t);
    for (const mo of this.motes) this.mote(ctx, mo);
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, (s.life / s.max) * 1.5);
      ctx.fillStyle = s.color;
      const sz = s.life > s.max * 0.5 ? 2 : 1;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
    }
    ctx.globalAlpha = 1;
    if (t.phase === 'wake') this.waking(ctx, t);
    this.footer(ctx, t);
  }

  private mote(ctx: CanvasRenderingContext2D, mo: Mote) {
    if (mo.t < 0) return;
    const f = Math.min(1, mo.t / MOTE);
    const e = f * f * (3 - 2 * f);
    const tx = CORE.x;
    const ty = CORE.y;
    const cx = (mo.x + tx) / 2 + mo.bend;
    const cy = Math.min(mo.y, ty) - 40;
    for (let k = 3; k >= 0; k--) {
      const ee = Math.max(0, e - k * 0.04);
      const uu = 1 - ee;
      const x = uu * uu * mo.x + 2 * uu * ee * cx + ee * ee * tx;
      const y = uu * uu * mo.y + 2 * uu * ee * cy + ee * ee * ty;
      ctx.globalAlpha = k ? 0.5 / k : 1;
      ctx.fillStyle = k ? VEIN_COLOR[mo.vein] : '#ffffff';
      const s = k ? 1 : 2;
      ctx.fillRect(Math.round(x) - (s >> 1), Math.round(y) - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** The tree: the core at the top, each vein's strands and knots hanging off it. */
  private tree(ctx: CanvasRenderingContext2D, t: Turn) {
    const c = t.core;
    const time = this.time;
    // the veins' names at their feet, lit if they were fed
    for (const v of VEINS) {
      const x = VEIN_X[v];
      const fed = c.fed.includes(v) && (t.phase === 'grow' || t.phase === 'feed');
      const col = VEIN_COLOR[v];
      const y = ROW_Y.foot + 19;
      drawText(ctx, VEIN_NAME[v], x, y, fed || t.pulse[v] > 0 ? col : DIM, { align: 'center', scale: 1 });
      wrap(VEIN_WHAT[v], 104).forEach((line, n) => drawText(ctx, line, x, y + 10 + n * 8, '#5a5068', { align: 'center' }));
      if (t.phase === 'grow') {
        if (fed) {
          const w = textWidth('FED') + 6;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(x - w / 2), y + 28, w, 9);
          drawText(ctx, 'FED', x, y + 29, DARK, { align: 'center', shadow: false });
        } else drawText(ctx, 'NOT FED', x, y + 29, '#4a4058', { align: 'center' });
      }
    }
    // strands first, knots over them
    c.tree.forEach((kn, k) => {
      const to = this.knotAt(kn);
      const from = this.parentOf(c, k);
      const growing = t.growing?.k === k ? Math.min(1, t.growing.t / GROW_T) : null;
      const col = VEIN_COLOR[kn.vein];
      if (kn.pos === 'foot') {
        // both forks lead to the foot
        const at = (pos: string) => c.tree.findIndex((o) => o.vein === kn.vein && o.pos === pos);
        for (const pos of ['k3a', 'k3b']) {
          const fk = at(pos);
          const f = this.knotAt(c.tree[fk]);
          const lit = c.grown[k] && c.grown[fk];
          this.strand(ctx, f.x, f.y, to.x, to.y, lit ? col : c.grown[fk] ? VEIN_DARK[kn.vein] : '#2a2236', lit, growing !== null && c.grown[fk] ? growing : lit ? 1 : null, k * 3 + (pos === 'k3a' ? 0 : 1));
        }
        return;
      }
      this.strand(ctx, from.x, from.y, to.x, to.y, c.grown[k] ? col : reaches(c, k) ? VEIN_DARK[kn.vein] : '#2a2236', c.grown[k], growing ?? (c.grown[k] ? 1 : null), k * 3);
    });
    // the core, its meter round it, its held imprints circling
    const need = toGrow(t.base + t.shownGrows);
    const f = t.phase === 'feed' ? t.shown / need : c.learnt / toGrow(grownCount(c) + c.growths);
    ring(ctx, CORE.x, CORE.y, CORE.r + 6, '#2a2236');
    ring(ctx, CORE.x, CORE.y, CORE.r + 7, '#2a2236');
    const litCol = t.phase === 'feed' && t.shown > 0 ? '#f4ecd8' : '#c8b8a0';
    ring(ctx, CORE.x, CORE.y, CORE.r + 6, litCol, 0, Math.min(1, f));
    ring(ctx, CORE.x, CORE.y, CORE.r + 7, litCol, 0, Math.min(1, f));
    const look = t.panel === 'tree' && t.phase !== 'feed' ? this.knotAt(c.tree[t.at]) : t.panel === 'room' ? { x: PANEL.x, y: PANEL.y + 100 } : undefined;
    const fedPulse = Math.max(...VEINS.map((v) => t.pulse[v]));
    coreBall(ctx, CORE.x, CORE.y, CORE.r, time, { woke: t.phase === 'wake' && t.wakeT < 0.6 ? null : c.woke?.temper, lean: leaning(c), jolt: fedPulse * 0.3, look });
    c.held.forEach((id, n) => {
      const a = time * 0.5 + (n / Math.max(1, c.held.length)) * Math.PI * 2;
      seal(ctx, id, Math.round(CORE.x + Math.cos(a) * (CORE.r + 15)), Math.round(CORE.y + Math.sin(a) * (CORE.r + 11)), 4);
    });
    // growths owed: a pip each, over the core
    if (c.growths > 0 && (t.phase === 'grow' || t.phase === 'room')) {
      const label = c.growths > 1 ? `${c.growths} TO GROW` : 'A KNOT TO GROW';
      drawText(ctx, label, CORE.x, CORE.y - CORE.r - 22, time % 0.8 < 0.5 ? INK : GOLD, { align: 'center' });
    }
    // the wake mark: knots grown, out of WAKE_AT
    const wx = CORE.x + 44;
    if (!c.woke) {
      drawText(ctx, 'WAKES', wx, CORE.y - 8, '#5a5068');
      for (let n = 0; n < WAKE_AT; n++) {
        ctx.fillStyle = n < grownCount(c) ? '#f4ecd8' : '#2a2236';
        ctx.fillRect(wx + n * 6, CORE.y + 2, 4, 4);
      }
    } else {
      drawText(ctx, 'AWAKE', wx, CORE.y - 8, VEIN_COLOR[c.woke.temper]);
      drawText(ctx, 'IT REFUSES THE ENGINE', wx, CORE.y + 2, '#5a5068');
    }
    // the knots
    c.tree.forEach((kn, k) => this.knot(ctx, t, k));
    // the cursor
    if (t.panel === 'tree' && t.phase !== 'feed' && t.phase !== 'imprint' && t.phase !== 'wake') {
      const kn = c.tree[t.at];
      const p = this.knotAt(kn);
      const r = (kn.pos === 'foot' ? 13 : 10) + 3 + Math.round(Math.sin(time * 6));
      const col = canGrow(c, t.at) && t.phase === 'grow' ? VEIN_COLOR[kn.vein] : INK;
      ctx.fillStyle = col;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(p.x + sx * r - (sx > 0 ? 3 : 0), p.y + sy * r, 4, 1);
        ctx.fillRect(p.x + sx * r, p.y + sy * r - (sy > 0 ? 3 : 0), 1, 4);
      }
    }
  }

  /** A strand of mould from (x0, y0) to (x1, y1): a living thread when grown, a faint dotted one when not. `grow`: how far it's reached. */
  private strand(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, lit: boolean, grow: number | null, seed: number) {
    const n = Math.max(8, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.5));
    const reach = grow ?? 1;
    const wob = (s: number) => Math.sin(s * Math.PI) * (Math.sin(seed * 1.7 + s * 5 + this.time * 0.8) * 3);
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const nl = Math.hypot(nx, ny) || 1;
    for (let k = 0; k <= n; k++) {
      const s = k / n;
      if (grow === null && k % 3) continue;
      if (s > reach) break;
      const x = x0 + (x1 - x0) * s + (nx / nl) * wob(s);
      const y = y0 + (y1 - y0) * s + (ny / nl) * wob(s);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), lit ? 2 : 1, lit ? 2 : 1);
    }
    if (lit) {
      // sap running down it, now and then
      const s = (this.time * 0.6 + seed * 0.37) % 1.6;
      if (s <= 1 && s <= reach) {
        const x = x0 + (x1 - x0) * s + (nx / nl) * wob(s);
        const y = y0 + (y1 - y0) * s + (ny / nl) * wob(s);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
    if (grow !== null && grow < 1) {
      const s = grow;
      const x = x0 + (x1 - x0) * s + (nx / nl) * wob(s);
      const y = y0 + (y1 - y0) * s + (ny / nl) * wob(s);
      disc(ctx, x, y, 2, '#ffffff');
      if (Math.random() < 0.7) this.sparks.push({ x, y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.35, max: 0.35, color, g: 0 });
    }
  }

  private knot(ctx: CanvasRenderingContext2D, t: Turn, k: number) {
    const c = t.core;
    const kn = c.tree[k];
    const p = this.knotAt(kn);
    const foot = kn.pos === 'foot';
    const r = foot ? 12 : 9;
    const col = VEIN_COLOR[kn.vein];
    const grown = c.grown[k];
    const can = t.phase === 'grow' && canGrow(c, k);
    const near = reaches(c, k);
    const on = t.panel === 'tree' && t.at === k && t.phase !== 'feed';
    const growing = t.growing?.k === k;
    if (can) {
      // it wants to grow: a slow light round it
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.time * 5 + k);
      disc(ctx, p.x, p.y, r + 4, col);
      ctx.globalAlpha = 1;
    }
    if (grown && foot) {
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(this.time * 2);
      disc(ctx, p.x, p.y, r + 8, col);
      ctx.globalAlpha = 1;
    }
    disc(ctx, p.x, p.y + 1, r + 1, DARK);
    disc(ctx, p.x, p.y, r + 1, grown ? col : can ? col : near ? VEIN_DARK[kn.vein] : '#2a2236');
    disc(ctx, p.x, p.y, r, grown ? VEIN_DARK[kn.vein] : '#160f1e');
    if (grown) {
      disc(ctx, p.x, p.y, r - 2, col);
      knotIcon(ctx, kn, p.x - 4, p.y - 4, DARK, '#ffffff');
    } else knotIcon(ctx, kn, p.x - 4, p.y - 4, can ? col : near ? VEIN_DARK[kn.vein] === '#163a52' ? '#3a6a8a' : near ? '#6a5a68' : '#3a3048' : '#3a3048', can ? '#ffffff' : '#5a5068');
    if (growing) {
      ctx.globalAlpha = Math.min(1, t.growing!.t / GROW_T);
      disc(ctx, p.x, p.y, r, '#ffffff');
      ctx.globalAlpha = 1;
    }
    // a talisman wears a crown of points
    if (foot) {
      ctx.fillStyle = grown ? col : '#3a3048';
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2 + this.time * (grown ? 0.4 : 0);
        ctx.fillRect(Math.round(p.x + Math.cos(a) * (r + 3)), Math.round(p.y + Math.sin(a) * (r + 3)), 1, 1);
      }
    }
    if (on) {
      const name = kn.knack ? KNACKS[kn.knack].name : KNOT_NAME[kn.kind];
      const nx = Math.max(16 + textWidth(name) / 2, Math.min(404 - textWidth(name) / 2, p.x));
      const ny = p.y - r - 13;
      ctx.fillStyle = 'rgba(14,10,22,0.85)';
      ctx.fillRect(Math.round(nx - textWidth(name) / 2) - 3, ny - 2, textWidth(name) + 6, 11);
      drawText(ctx, name, nx, ny, grown ? col : INK, { align: 'center', shadow: false });
    }
  }

  /** The right: the tally coming in, the knot in focus, or the room. */
  private panel(ctx: CanvasRenderingContext2D, t: Turn) {
    const P = PANEL;
    const c = t.core;
    frame(ctx, P.x, P.y, P.w, P.h, '#140f1c', t.panel === 'room' && t.phase !== 'feed' ? INK : EDGE);
    if (t.phase === 'feed') return this.tally(ctx, t);
    const tab = (label: string, x: number, on: boolean) => {
      const w = textWidth(label) + 10;
      frame(ctx, x, P.y - 9, w, 11, on ? '#2c2240' : '#160f1e', on ? INK : EDGE);
      drawText(ctx, label, x + 5, P.y - 7, on ? INK : DIM, { shadow: false });
      return w;
    };
    const roomOn = t.panel === 'room' || t.phase === 'imprint';
    const w1 = tab('THE KNOT', P.x + 4, !roomOn);
    tab(`ROOM ${weightOf(c.held)}/${roomOf(c)}`, P.x + 8 + w1, roomOn);
    if (t.panel === 'room' || t.phase === 'imprint') return this.roomPanel(ctx, t);
    const kn = c.tree[t.at];
    const col = VEIN_COLOR[kn.vein];
    let y = P.y + 8;
    const x = P.x + 8;
    const tw = P.w - 16;
    // the chip: its vein and kind
    const chip = `${VEIN_NAME[kn.vein]} · ${KNOT_NAME[kn.kind]}`;
    ctx.fillStyle = col;
    ctx.fillRect(x, y - 1, textWidth(chip) + 8, 9);
    drawText(ctx, chip, x + 4, y, DARK, { shadow: false });
    y += 14;
    const name = kn.knack ? KNACKS[kn.knack].name : kn.kind === 'room' ? 'MORE ROOM' : 'AN IMPRINT';
    for (const line of wrap(name, tw, 2)) {
      drawText(ctx, line, x, y, col, { scale: 2 });
      y += 16;
    }
    y += 2;
    const text = kn.knack ? KNACKS[kn.knack].text : kn.kind === 'room' ? 'THE CORE CAN HOLD ONE MORE IMPRINT' : 'IT COPIES ONE OF THREE IMPRINTS, THERE AND THEN: HABITS OFF THE PEOPLE AND THINGS YOU MEET';
    for (const line of wrap(text, tw)) {
      drawText(ctx, line, x, y, INK);
      y += 9;
    }
    const tip = kn.knack ? KNACKS[kn.knack].tip : kn.kind === 'room' ? 'ROOM TO HOLD MORE, OR TO LEAN LESS' : 'ONE LEANS TO THIS VEIN';
    y += 4;
    for (const line of wrap(tip, tw)) {
      drawText(ctx, line, x, y, DIM);
      y += 9;
    }
    // where it stands
    const sy = P.y + P.h - 44;
    ctx.fillStyle = EDGE;
    ctx.fillRect(P.x + 6, sy - 6, P.w - 12, 1);
    const k = t.at;
    const [status, sc] = c.grown[k]
      ? ['GROWN', col]
      : t.phase === 'grow' && canGrow(c, k)
        ? ['IT CAN GROW HERE NOW', this.time % 0.6 < 0.4 ? col : INK]
        : !reaches(c, k)
          ? [kn.pos === 'foot' ? 'GROW ONE OF THE TWO ABOVE IT' : 'GROW THE KNOT ABOVE IT FIRST', DIM]
          : t.phase === 'grow'
            ? [`FEED ${VEIN_NAME[kn.vein]} TO GROW HERE`, RED]
            : ['IT CAN GROW HERE NEXT', DIM];
    for (const [n, line] of wrap(status, tw).entries()) drawText(ctx, line, x, sy + n * 9, sc);
    drawText(ctx, `FED BY ${VEIN_FED[kn.vein]}`, x, sy + 22, '#5a5068');
  }

  /** The fight's tally: each line, the vein it fed and by how much. */
  private tally(ctx: CanvasRenderingContext2D, t: Turn) {
    const P = PANEL;
    const lines = t.fed?.lines ?? [];
    drawText(ctx, 'IT WATCHED YOU FLY', P.x + 8, P.y + 8, INK);
    drawText(ctx, 'AND TOOK IN', P.x + 8, P.y + 18, DIM);
    lines.slice(0, t.lines).forEach((l, n) => {
      const y = this.lineY(n);
      ctx.fillStyle = VEIN_COLOR[l.vein];
      ctx.fillRect(P.x + 8, y + 1, 3, 5);
      drawText(ctx, l.text, P.x + 15, y, INK);
      drawText(ctx, `+${l.n}`, P.x + P.w - 8, y, VEIN_COLOR[l.vein], { align: 'right' });
    });
    if (!lines.length) drawText(ctx, 'NOTHING NEW', P.x + 8, this.lineY(0), DIM);
    // the totals by vein, as they stand
    const y = P.y + P.h - 40;
    ctx.fillStyle = EDGE;
    ctx.fillRect(P.x + 6, y - 6, P.w - 12, 1);
    VEINS.forEach((v, n) => {
      const got = lines.slice(0, t.lines).filter((l) => l.vein === v).reduce((a, l) => a + l.n, 0);
      const x = P.x + 8 + n * 68;
      drawText(ctx, VEIN_NAME[v], x, y, got ? VEIN_COLOR[v] : '#4a4058');
      drawText(ctx, `+${got}`, x, y + 11, got ? INK : '#4a4058', { scale: 2 });
    });
  }

  private roomRow(n: number): Rect {
    return { x: PANEL.x + 6, y: PANEL.y + 34 + n * 22, w: PANEL.w - 12, h: 20 };
  }

  /** The room: its slots filled by what's held, then every imprint copied, held or not. */
  private roomPanel(ctx: CanvasRenderingContext2D, t: Turn) {
    const P = PANEL;
    const c = t.core;
    const room = roomOf(c);
    const used = weightOf(c.held);
    // the room as cells: filled by weight, one past it hatched red (leaning)
    const cells = Math.max(room, used);
    const cw = Math.min(16, Math.floor((P.w - 16 - (cells - 1) * 2) / cells));
    let cx = P.x + 8;
    let filled = 0;
    for (const id of c.held) {
      for (let w = 0; w < IMPRINTS[id].weight; w++) {
        const over = filled >= room;
        ctx.fillStyle = over ? (this.time % 0.4 < 0.2 ? RED : '#6a2028') : IMPRINTS[id].color;
        ctx.fillRect(cx, P.y + 8, cw, 8);
        cx += cw + 2;
        filled++;
      }
    }
    for (; filled < room; filled++) {
      ctx.fillStyle = '#2a2236';
      ctx.fillRect(cx, P.y + 8, cw, 8);
      cx += cw + 2;
    }
    drawText(ctx, leaning(c) ? 'LEANING: HITS SHAKE THE NEWEST LOOSE' : `ROOM ${used}/${room}`, P.x + 8, P.y + 20, leaning(c) ? RED : DIM);
    if (!c.owned.length) {
      const lines = ['NO IMPRINTS YET.', '', 'IMPRINT KNOTS, AND THE', 'PEOPLE YOU MEET OUT', 'THERE, LEAVE THEM.'];
      lines.forEach((l, n) => drawText(ctx, l, P.x + P.w / 2, P.y + 60 + n * 10, DIM, { align: 'center' }));
      return;
    }
    const max = Math.floor((P.h - 124) / 22);
    const first = Math.max(0, Math.min(t.roomAt - max + 1, c.owned.length - max));
    c.owned.slice(first, first + max).forEach((id, n) => {
      const k = first + n;
      const r = this.roomRow(n);
      const def = IMPRINTS[id];
      const held = c.held.includes(id);
      const on = t.panel === 'room' && t.roomAt === k;
      frame(ctx, r.x, r.y, r.w, r.h, on ? '#2c2240' : held ? '#1c1526' : '#120d18', on ? INK : held ? def.color : EDGE);
      seal(ctx, id, r.x + 10, r.y + 10, 6, !held);
      drawText(ctx, def.name, r.x + 20, r.y + 3, held ? def.color : DIM);
      for (let w = 0; w < def.weight; w++) {
        ctx.fillStyle = held ? def.color : '#4a4058';
        ctx.fillRect(r.x + r.w - 6 - w * 5, r.y + 4, 3, 3);
      }
      drawText(ctx, held ? 'HELD' : canHold(c, id) ? 'NOT HELD · ROOM FOR IT' : 'NOT HELD · NO ROOM', r.x + 20, r.y + 11, held ? CYAN : '#5a5068');
    });
    // the one in focus, in full
    const id = c.owned[t.roomAt];
    if (id && t.panel === 'room') {
      const def = IMPRINTS[id];
      let y = P.y + P.h - 84;
      ctx.fillStyle = EDGE;
      ctx.fillRect(P.x + 6, y - 5, P.w - 12, 1);
      for (const line of wrap(def.text, P.w - 16).slice(0, 3)) {
        drawText(ctx, line, P.x + 8, y, INK);
        y += 9;
      }
      for (const line of wrap(def.from, P.w - 16).slice(0, 2)) {
        drawText(ctx, line, P.x + 8, y + 2, DIM);
        y += 9;
      }
      const pair = AGREEMENTS.find((p) => p.a === id || p.b === id);
      if (pair) {
        const other = IMPRINTS[pair.a === id ? pair.b : pair.a];
        const lit = c.held.includes(pair.a) && c.held.includes(pair.b);
        drawText(ctx, lit ? `AGREES: ${pair.name}` : `AGREES WITH ${other.name}`, P.x + 8, y + 6, lit ? GOLD : '#5a5068');
        wrap(pair.text, P.w - 16).slice(0, 2).forEach((line, n) => drawText(ctx, line, P.x + 8, y + 16 + n * 9, lit ? INK : '#4a4058'));
      }
    }
  }

  /** An IMPRINT knot's three, laid over the tree. */
  private offerRect(t: Turn, k: number): Rect {
    const n = t.offer.length;
    const w = 122;
    const gap = 8;
    const x0 = Math.round(206 - (n * w + (n - 1) * gap) / 2);
    return { x: x0 + k * (w + gap), y: 96, w, h: 170 };
  }

  private offerCards(ctx: CanvasRenderingContext2D, t: Turn) {
    const c = t.core;
    ctx.fillStyle = 'rgba(10,7,16,0.93)';
    ctx.fillRect(10, 46, 402, 276);
    drawText(ctx, 'IT COPIES ONE', 206, 62, INK, { align: 'center', scale: 2 });
    drawText(ctx, 'WHAT IT HAS TOUCHED', 206, 80, DIM, { align: 'center' });
    t.offer.forEach((id, k) => {
      const r = this.offerRect(t, k);
      const since = t.t - 0.15 - k * 0.12;
      if (since < 0) return;
      const a = Math.min(1, since / 0.2);
      const def = IMPRINTS[id];
      const on = t.offerAt === k;
      const y = r.y + Math.round((1 - a) * 14) + (on ? -3 : 0);
      ctx.globalAlpha = a;
      if (on) {
        ctx.globalAlpha = a * (0.35 + 0.25 * Math.sin(this.time * 6));
        ctx.fillStyle = def.color;
        ctx.fillRect(r.x - 3, y - 3, r.w + 6, r.h + 6);
        ctx.globalAlpha = a;
      }
      frame(ctx, r.x, y, r.w, r.h, '#1a1322', on ? INK : def.color);
      ctx.fillStyle = on ? def.color : '#2a2236';
      ctx.fillRect(r.x + 1, y + 1, r.w - 2, 10);
      drawText(ctx, def.faction ? 'WAYS' : 'IMPRINT', r.x + 4, y + 3, on ? DARK : DIM, { shadow: false });
      for (let w = 0; w < def.weight; w++) {
        ctx.fillStyle = on ? DARK : def.color;
        ctx.fillRect(r.x + r.w - 7 - w * 5, y + 4, 3, 3);
      }
      seal(ctx, id, r.x + r.w / 2, y + 30, 13);
      let ty = y + 50;
      for (const line of wrap(def.name, r.w - 10)) {
        drawText(ctx, line, r.x + r.w / 2, ty, def.color, { align: 'center' });
        ty += 9;
      }
      ty += 3;
      for (const line of wrap(def.text, r.w - 10).slice(0, 6)) {
        drawText(ctx, line, r.x + r.w / 2, ty, INK, { align: 'center' });
        ty += 9;
      }
      ty += 3;
      for (const line of wrap(def.from, r.w - 10).slice(0, 3)) {
        drawText(ctx, line, r.x + r.w / 2, ty, DIM, { align: 'center' });
        ty += 9;
      }
      const fits = weightOf(c.held) + def.weight <= roomOf(c);
      const pair = AGREEMENTS.find((p) => (p.a === id && c.held.includes(p.b)) || (p.b === id && c.held.includes(p.a)));
      const status = pair ? `AGREES: ${pair.name}` : fits ? `TAKES ${def.weight} ROOM` : 'NO ROOM: IT WAITS';
      drawText(ctx, status, r.x + r.w / 2, y + r.h - 12, pair ? GOLD : fits ? CYAN : '#a07a58', { align: 'center' });
      ctx.globalAlpha = 1;
    });
    const n = t.offer.length;
    const on = t.offerAt === n;
    frame(ctx, 136, 276, 140, 14, on ? '#2c2240' : '#1c1526', on ? GOLD : EDGE);
    drawText(ctx, 'LEAVE THEM', 206, 280, on ? GOLD : DIM, { align: 'center' });
  }

  /** The core waking: the light, the first words, the name. */
  private waking(ctx: CanvasRenderingContext2D, t: Turn) {
    const c = t.core;
    const nemva = c.woke!;
    const col = VEIN_COLOR[nemva.temper];
    const s = t.wakeT;
    // the screen goes dark round it, then the light floods out
    ctx.globalAlpha = Math.min(0.95, s * 2);
    ctx.fillStyle = '#06040a';
    ctx.fillRect(0, 0, W, 360);
    ctx.globalAlpha = 1;
    const cx = W / 2;
    const cy = 128;
    for (let k = 0; k < 4; k++) {
      const f = (s * 0.7 + k * 0.25) % 1;
      ctx.globalAlpha = (1 - f) * 0.7;
      ring(ctx, cx, cy, 20 + f * 120, k % 2 ? col : '#ffffff');
    }
    ctx.globalAlpha = 1;
    coreBall(ctx, cx, cy, 26 + Math.round(Math.max(0, 1 - s) * 8), this.time, { woke: s > 0.6 ? nemva.temper : null });
    if (s > 0.6 && s < 0.7) for (let k = 0; k < 4; k++) this.burst(cx, cy, 30, col, 10);
    if (s > 0.9) {
      drawText(ctx, 'THE CORE IS AWAKE', cx, 172, DIM, { align: 'center' });
    }
    if (s > 1.3) {
      const words = FIRST_WORDS[nemva.temper][grownCount(c) % FIRST_WORDS[nemva.temper].length];
      const shown = words.slice(0, Math.floor((s - 1.3) * 28));
      drawText(ctx, `"${shown}${shown.length < words.length ? (this.time % 0.3 < 0.15 ? '_' : ' ') : '"'}`, cx, 192, INK, { align: 'center' });
    }
    if (s > 2.4) {
      const pop = s < 2.55 ? 4 : 3;
      drawText(ctx, 'IT CALLS ITSELF', cx, 214, DIM, { align: 'center' });
      drawText(ctx, nemva.name, cx, 226 - (pop - 3) * 3, col, { scale: pop, align: 'center' });
    }
    if (s > 3) {
      const lines = ['A NEMVA: A MIND MADE OF HOW YOU FLEW.', 'IT WILL TALK. IT REMEMBERS EVERY DEBT.', 'WHEN THE ENGINE CALLS, IT CAN SAY NO.'];
      lines.forEach((l, n) => drawText(ctx, l, cx, 262 + n * 10, n === 2 ? col : DIM, { align: 'center' }));
    }
    if (s > 2.2) hints(ctx, this.dev(t), [['confirm', 'ON']], cx, 330, 'center');
  }

  private footer(ctx: CanvasRenderingContext2D, t: Turn) {
    const dev = this.dev(t);
    if (t.msgT > 0 && t.msg) {
      const a = Math.min(1, t.msgT * 3);
      ctx.globalAlpha = a;
      const w = textWidth(t.msg) + 16;
      frame(ctx, Math.round(206 - w / 2), 300, w, 13, '#1c1526', GOLD);
      drawText(ctx, t.msg, 206, 303, GOLD, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (t.phase === 'wake') return;
    const y = 340;
    if (t.phase === 'feed') hints(ctx, dev, [['confirm', 'ALL AT ONCE']], W / 2, y, 'center');
    else if (t.phase === 'imprint') hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', t.offerAt < t.offer.length ? 'COPY IT' : 'LEAVE THEM']], W / 2, y, 'center');
    else if (t.panel === 'room') hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', 'HOLD / LET GO'], ['next', 'THE KNOTS'], ['back', t.phase === 'grow' ? 'BACK' : 'DONE']], W / 2, y, 'center');
    else if (t.phase === 'grow') hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', 'GROW IT'], ['next', 'THE ROOM']], W / 2, y, 'center');
    else hints(ctx, dev, [['move', 'LOOK'], ['next', 'THE ROOM'], ['confirm', 'DONE']], W / 2, y, 'center');
  }
}
