import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import { MOODS, STOPS, isPartReward, type ChartNode, type NodeKind, type Reward } from '../sim/chart';
import { SECTORS, fights, threatTier } from '../sim/run';
import { eventById } from '../sim/events';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { CLASS_COLOR, CYAN, DARK, DIM, GOLD, GREEN, H, HEIST, INK, RED, W, frame, hex } from '../ui/hud';
import { backdrop, haulerIcon, hintRows, hints, hullGauge, shapeIcon, strongboxIcon, type Hint } from '../ui/widgets';
import { Intro } from '../ui/intro';
import { firstTime } from '../ui/glossary';
import { newParts } from './hangar';
import { partById } from '../game/parts';
import { Accord } from '../ui/accord';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { EncounterPreview } from '../view/encounter-preview';
import { flat, GEO, part, toon } from '../render/toon';
import { drawArt } from './art';
import { land, toChart, toHangar } from '../game/flow';
import { CARGO, crewHull } from '../sim/run';
import { convoyRoles, ROLES } from '../sim/convoy';
import { clamp, hashStr, lerp, noise2, rng, smoothstep } from '../util';

const MAP_W = 440;
const PANEL_X = MAP_W;
/** The encounter card's picture, in the panel. */
const VIG_W = 178;
const VIG_H = 74;

const FUEL = '#ffb04a';
const VIOLET = '#c8a0ff';
const MUTED = '#a89cb8';
const ESCORT = '#7ab8ff';

export const KIND: Record<NodeKind, { label: string; icon: string; color: string; text: string }> = {
  start: { label: 'JUMP POINT', icon: 'start', color: '#8a8098', text: 'Where you came in.' },
  raid: { label: 'STAGE', icon: 'raid', color: GOLD, text: 'Fly in low and shoot your way through. Its reward is waiting at the end.' },
  hunt: { label: 'ELITE STAGE', icon: 'hunt', color: '#ff8a4a', text: 'Elites, and a harder fight. It pays better: a rare part or better, or a graft.' },
  escort: { label: 'ESCORT', icon: 'escort', color: ESCORT, text: 'Fly cover for three haulers. Raiders will try to board them: shoot them off. Every hauler that gets home pays, and brings you a crate.' },
  heist: { label: 'HEIST', icon: 'heist', color: HEIST, text: 'A loaded freighter running for a jump point. Shoot its strongboxes loose and catch them as they fall, or clamp on and board her on foot.' },
  salvage: { label: 'DEALER', icon: 'salvage', color: GREEN, text: 'Buy parts, refit one, patch the hull, sell what you have no use for.' },
  dock: { label: 'DOCK', icon: 'dock', color: '#f4ecd8', text: 'Friends. Free repairs, fuel and gossip.' },
  event: { label: 'UNKNOWN', icon: 'unknown', color: VIOLET, text: 'Something out in the dark. Could be anything. A rumour would tell you.' },
  gate: { label: 'WARDEN GATE', icon: 'gate', color: RED, text: 'The way out of the system, and the thing that guards it. Win, and the next sector opens.' },
};

/** Little pictures for the kinds of site, seven texels square. */
const ICONS: Record<string, string[]> = {
  start: ['0000000', '0000000', '0011100', '0011100', '0011100', '0000000', '0000000'],
  raid: ['1000001', '0100010', '0010100', '0001000', '0010100', '0110110', '1100011'],
  hunt: ['0111110', '1111111', '1001001', '1111111', '0110110', '0101010', '0000000'],
  escort: ['0111110', '1111111', '1100011', '1101011', '0110110', '0011100', '0001000'],
  heist: ['0011100', '0111110', '1000001', '0100010', '0011100', '0111110', '0111110'],
  salvage: ['1111111', '1000001', '1111111', '1010101', '1001001', '1010101', '1111111'],
  dock: ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000', '0000000'],
  unknown: ['0111110', '1100011', '0000011', '0001110', '0001100', '0000000', '0001100'],
  port: ['0100000', '0111110', '0111100', '0111110', '0100000', '0100000', '0100000'],
  known: ['0001000', '0011100', '0011100', '0001000', '0001000', '0000000', '0001000'],
  gate: ['0011100', '0100010', '1001001', '1011101', '1001001', '0100010', '0011100'],
};

function icon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, color: string) {
  const rows = ICONS[name] ?? ICONS.unknown;
  ctx.fillStyle = color;
  rows.forEach((row, r) => {
    for (let c = 0; c < 7; c++) if (row[c] === '1') ctx.fillRect(x + c, y + r, 1, 1);
  });
}

/** A square with its corners nicked off, `s` texels out from the middle each way. */
function chamfer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - s, y - s + 1, s * 2 + 1, s * 2 - 1);
  ctx.fillRect(x - s + 1, y - s, s * 2 - 1, s * 2 + 1);
}

/** Just the edge of one. */
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x - s + 1, y - s, s * 2 - 1, 1);
  ctx.fillRect(x - s + 1, y + s, s * 2 - 1, 1);
  ctx.fillRect(x - s, y - s + 1, 1, s * 2 - 1);
  ctx.fillRect(x + s, y - s + 1, 1, s * 2 - 1);
}

/** A dotted line, every `gap`th texel left out (shifted by `phase`, to march). */
function dots(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, color: string, gap: number, phase = 0, trim0 = 0, trim1 = 0) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d);
  ctx.fillStyle = color;
  for (let k = Math.ceil(trim0); k < n - trim1; k++) {
    if ((k + phase) % gap === 0) continue;
    const f = k / n;
    ctx.fillRect(Math.round(lerp(a.x, b.x, f)), Math.round(lerp(a.y, b.y, f)), 1, 1);
  }
}

/** What a site pays, as a word and a colour. */
const REWARD: Record<Reward, [string, string]> = {
  gun: ['A GUN', CLASS_COLOR.gun],
  engine: ['AN ENGINE', CLASS_COLOR.engine],
  defense: ['DEFENCE', CLASS_COLOR.defense],
  booster: ['A BOOSTER', CLASS_COLOR.booster],
  special: ['A SPECIAL', CLASS_COLOR.special],
  graft: ['A GRAFT', '#ff7ad0'],
  // (their own colours, not a part class's: on the map a site's colour is what it pays)
  refit: ['A REFIT', '#c8e050'],
  repair: ['A REPAIR', '#f4ecd8'],
  scrap: ['SCRAP', GOLD],
  fuel: ['FUEL', FUEL],
  hull: ['REPAIRS', '#f4ecd8'],
  intel: ['INTEL', VIOLET],
  trade: ['A MARKET', GREEN],
  none: ['', DIM],
};

/** What a site pays, in a word, for its tag on the map. */
const SHORT: Partial<Record<Reward, string>> = { gun: 'GUN', engine: 'ENGINE', defense: 'DEFENCE', booster: 'BOOSTER', special: 'SPECIAL', graft: 'GRAFT', refit: 'REFIT', repair: 'REPAIR', scrap: 'SCRAP' };

/** A fight on a dark planet: what it pays is a secret till it's won. */
const hidden = (n: ChartNode) => (n.kind === 'raid' || n.kind === 'hunt') && !n.known && !n.done;

/** A fight's reward in a few words: the part it names, or what it pays. */
function payWord(n: ChartNode, short = false) {
  if (hidden(n)) return '???';
  if (n.part) return partById(n.part).name.toUpperCase();
  return (short ? SHORT[n.reward] : REWARD[n.reward][0]) ?? '';
}

/** The five steps of threat, easy to brutal. */
/** A reward in a line, under its name on the card. */
const REWARD_TEXT: Partial<Record<Reward | 'part', string>> = {
  part: 'ONE OF THREE PARTS',
  graft: 'ONE OF THREE GRAFTS',
  refit: 'A PART YOU CARRY, A TIER UP',
  repair: 'HULL BACK',
  scrap: 'FOR THE DEALER',
};

/** A rectangle on the map, for keeping labels off each other. */
type Box = { x: number; y: number; w: number; h: number };

const THREAT_COLOR = ['#8affb0', '#d8e060', '#ffb04a', '#ff7a4a', '#ff4a5a'];

/** Charts whose name has been up (it shows once a sector, not again after the hangar). */
const named = new WeakSet<object>();

const SYSTEMS = ['KAPTEYN DRIFT', 'OLD LANTERN', 'THE ANVIL', 'MERIDIAN REACH', 'SALT NEBULA', 'HOLLOW CROWN', 'NINE WELLS', 'THE ORCHARD'];

/**
 * The star chart: the sector's little solar system, held still, its sites in a column for each
 * stop from the jump point on the left to the gate on the right, linked on to the next.
 *
 * What you can jump to now shines, with what it pays on a tag; what a route can still reach sits
 * back, its colour what it pays; what you've cut yourself off from fades. The route can be
 * planned ahead stop by stop to the gate (numbered on the map, and filled into the strip along the
 * top). The card on the right shows the picked site: a picture of what's there, how hard it is,
 * what it pays, and where it leads.
 */
export class ChartScreen implements Screen {
  private stage = new Stage(MAP_W, H, 7, 38);
  private bodies: THREE.Object3D[] = [];
  private ship: ShipModel;
  private ships: ShipModel[];
  /** The watch being shown (eases towards the one being planned for). */
  private shown: number;
  /**
   * The route being planned: the next jump first, then the ones after it, as far as the pilot's
   * looked (up to the gate). `depth` is the stop being chosen now; what's in `options` is in reach
   * then, and `sel` is the one of them picked (the plan's stop there).
   */
  private plan: ChartNode[] = [];
  private depth = 0;
  private sel = 0;
  private options: ChartNode[] = [];
  private anim: { kind: 'jump'; t: number; to: ChartNode; from: { x: number; y: number }; shown: number } | null = null;
  /** Co-op: who wants to go where (a site's id). */
  private accord: Accord<number | 'drift' | 'fight'>;
  private t = 0;
  private note = '';
  private noteT = 0;
  private v = new THREE.Vector3();
  /** Pictures of the sites, made as they're first picked. */
  private previews = new Map<number, EncounterPreview>();
  private shownPreview: EncounterPreview | null = null;
  /** How the chart works, open (seconds since), or -1: unasked the first time, then on INFO. */
  private guide = -1;
  /** Seconds the chart's been up with the guide shut (the sector's name shows first). */
  private seen = 0;
  /** A thing said the first time it's met: the hold, fuel, an elite. */
  private intro = new Intro();
  /** The first time on this chart: its name comes up. */
  private firstLook: boolean;

  constructor(
    private game: Game,
    private run: Run,
  ) {
    const c = run.chart;
    this.shown = c.time;
    this.accord = new Accord(run.crew.length);
    this.firstLook = c.time === 0 && !named.has(c);
    named.add(c);
    this.build();
    // the crew's ships: the lead, and in co-op a wingman off its quarter
    this.ships = run.crew.map((cr, i) => new ShipModel(cr.build, LIVERY[i]));
    this.ship = this.ships[0];
    for (const sh of this.ships) {
      sh.root.scale.setScalar(0.55);
      this.stage.scene.add(sh.root);
    }
    this.refresh();
    audio.music('map');
  }

  private get chart() {
    return this.run.chart;
  }

  /** Chart coordinates to the world, turned so the way in is on the left and the gate on the right. */
  private world(p: { x: number; y: number }, y = 0, out = new THREE.Vector3()) {
    const a = this.chart.axis;
    const along = p.x * Math.cos(a) + p.y * Math.sin(a);
    const across = -p.x * Math.sin(a) + p.y * Math.cos(a);
    return out.set(along, y, -across);
  }

  private screen(p: { x: number; y: number }, y = 0) {
    return this.stage.project(this.world(p, y, this.v));
  }

  private build() {
    const s = this.stage;
    const c = this.chart;
    s.scene.background = new THREE.Color(0x07060c);
    s.sun.intensity = 0.5;
    s.hemi.intensity = 0.6;
    const star = new THREE.PointLight(0xfff0d0, 900, 0, 1.6);
    star.position.set(0, 1, 0);
    s.scene.add(star);
    // the star
    s.scene.add(part(GEO.sphere, flat(0xfff2c0), [0, 0, 0], 2.4));
    s.scene.add(part(GEO.sphere, flat(0xffb040, { additive: true, opacity: 0.35 }), [0, 0, 0], 3.6));
    s.scene.add(part(GEO.sphere, flat(0xff8030, { additive: true, opacity: 0.15 }), [0, 0, 0], 5.2));
    // stars far below
    const r = rng(c.seed);
    const pts: number[] = [];
    for (let i = 0; i < 500; i++) pts.push((r() - 0.5) * 140, -30 - r() * 20, (r() - 0.5) * 140);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    s.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x8a80a8, size: 1, sizeAttenuation: false })));
    // orbits, dashed
    for (const b of c.bodies) {
      const seg: number[] = [];
      const n = Math.round(b.radius * 7);
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        seg.push(Math.cos(a0) * b.radius, 0, Math.sin(a0) * b.radius, Math.cos(a1) * b.radius, 0, Math.sin(a1) * b.radius);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      // (kept faint: the routes are what you read, the orbits only say which way things are going)
      const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: b.kind === 'trader' ? 0x22382e : 0x262036, depthWrite: false }));
      s.scene.add(line);
    }
    // the bodies
    c.bodies.forEach((b) => {
      const g = new THREE.Group();
      if (b.planet) {
        const geo = new THREE.SphereGeometry(1, 20, 14);
        const pos = geo.getAttribute('position');
        const cols: number[] = [];
        const orbit = b.planet.orbit;
        const pr = hashStr(b.planet.id);
        const col = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const lon = Math.atan2(pos.getZ(i), pos.getX(i));
          // bands by latitude, broken up with noise so they read as land, not stripes
          const n = noise2(lon * 1.6 + pr, y * 2.2) * 0.9 + y * 1.3;
          const k = clamp(Math.floor(((n + 1.6) / 3.2) * orbit.length), 0, orbit.length - 1);
          col.setHex(orbit[k]);
          cols.push(col.r, col.g, col.b);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true }));
        m.scale.setScalar(b.size);
        g.add(m);
        if (b.planet.id === 'mirefall' || b.planet.id === 'glacis') {
          const ring = part(GEO.torus, toon(b.planet.orbit[2]), [0, 0, 0], [b.size * 1.9, b.size * 1.9, 0.25], [Math.PI / 2 - 0.35, 0, 0.2]);
          g.add(ring);
        }
      } else {
        // the trader: a comet with a hold full of other people's parts
        g.add(part(GEO.oct, toon(0x8affb0, { glow: 0.4 }), [0, 0, 0], 0.9));
        g.add(part(GEO.cone, flat(0x6affc0, { additive: true, opacity: 0.4 }), [0, 0, 1.6], [0.6, 2.6, 0.6], [Math.PI / 2, 0, 0]));
      }
      s.scene.add(g);
      this.bodies.push(g);
    });
    // fixed points: the gate (a ring on its side), wrecks
    for (const n of c.nodes) {
      if (n.body >= 0) continue;
      const p = this.world(c.pos(n));
      if (n.kind === 'gate') {
        const gate = new THREE.Group();
        gate.add(part(GEO.torus, toon(0x5a4a6a), [0, 1, 0], [2.2, 2.2, 1.2], [0, Math.PI / 2, 0]));
        gate.add(part(GEO.disc, flat(0xff4a5a, { additive: true, opacity: 0.45 }), [0, 1, 0], 1.6, [0, Math.PI / 2, 0]));
        gate.position.copy(p);
        s.scene.add(gate);
      } else if (n.kind !== 'start') {
        s.scene.add(part(GEO.tet, toon(0x6a6070), [p.x, 0.4, p.z], 0.8, [0.5, r() * 6, 0.3]));
      }
    }
  }

  /** What's in reach at the plan's `k`th stop, in order along the way to the gate. */
  private optionsAt(k: number, plan = this.plan) {
    const c = this.chart;
    return c.optionsAt(plan, k).sort((a, b) => c.along(c.pos(a, c.time + k + 1)) - c.along(c.pos(b, c.time + k + 1)));
  }

  /** The obvious pick among some options: the furthest-on stage, so it's forward and a fight (not the dealer). */
  private defaultPick(opts: ChartNode[]) {
    const stage = opts.filter((o) => o.kind === 'raid' || o.kind === 'hunt').pop();
    return stage ?? opts[opts.length - 1];
  }

  /** Picks up the route planned last time, as far as it still goes; or starts one. */
  private refresh() {
    const c = this.chart;
    this.plan = [];
    for (const id of c.plan) {
      if (!this.optionsAt(this.plan.length).includes(c.nodes[id])) break;
      this.plan.push(c.nodes[id]);
    }
    const opts = this.optionsAt(0);
    // (&site=escort, for testing: that kind of site picked to begin with)
    const site = this.game.params.get('site');
    const want = site ? opts.find((o) => o.kind === site) : undefined;
    if (want) this.plan = [want];
    if (!this.plan.length && opts.length) this.plan = [this.defaultPick(opts)];
    this.depth = 0;
    this.sync();
  }

  /** Puts `n` in the plan at the stop being chosen, keeping the stops after it that still follow. */
  private pick(n: ChartNode) {
    const plan = [...this.plan.slice(0, this.depth), n];
    for (const later of this.plan.slice(this.depth + 1)) {
      if (!this.optionsAt(plan.length, plan).includes(later)) break;
      plan.push(later);
    }
    this.plan = plan;
    this.sync();
  }

  /** Looks a stop further along the route (or back): the planets turn to where they'll be. */
  private ahead(dir: 1 | -1) {
    if (dir < 0) {
      if (this.depth === 0) return false;
      this.depth--;
    } else {
      const opts = this.optionsAt(this.depth + 1);
      if (!opts.length) return false;
      this.depth++;
      if (!this.plan[this.depth]) this.plan.push(this.defaultPick(opts));
    }
    this.sync();
    return true;
  }

  /** The options at the stop being chosen, and which is picked; the plan's kept on the chart. */
  private sync() {
    this.options = this.optionsAt(this.depth);
    this.sel = Math.max(0, this.options.indexOf(this.plan[this.depth]));
    this.chart.plan = this.plan.map((n) => n.id);
  }

  /** Can the plan go a stop further than the one being chosen? */
  private get further() {
    return this.optionsAt(this.depth + 1).length > 0;
  }

  update(dt: number) {
    this.t += dt;
    // news from the last stop, one at a time
    this.noteT -= dt;
    if (this.noteT <= 0 && this.run.notes.length) {
      this.note = this.run.notes.shift()!;
      this.noteT = 2.6;
    }
    const c = this.chart;
    if (this.anim) {
      const a = this.anim;
      a.t += dt / 1.1;
      this.shown = lerp(a.shown, c.time + 1, smoothstep(0, 1, a.t));
      if (a.t >= 1) {
        this.anim = null;
        c.jump(a.to);
        // (the rest of the route stays planned, for when you're back on the chart)
        c.plan = this.plan.slice(1).map((n) => n.id);
        this.shown = c.time;
        land(this.game, a.to);
        return;
      }
      for (const sh of this.ships) sh.update(dt);
      this.shownPreview?.update(dt);
      return;
    }
    // (the planets turn on to where they'll be at the stop being planned, and back)
    this.shown = lerp(this.shown, c.time + this.depth, Math.min(1, dt * 7));
    if (Math.abs(this.shown - c.time - this.depth) < 0.002) this.shown = c.time + this.depth;
    for (const sh of this.ships) sh.update(dt);
    this.shownPreview?.update(dt);
    // the first look at a chart: how it works, unasked (not for the hands-off test runs)
    const quiet = this.game.params.has('autorun');
    if (this.guide < 0 && !quiet && firstTime('guide:chart')) this.openGuide();
    if (this.guide >= 0) {
      this.guide += dt;
      const gm = this.game.menu();
      if (this.guide > 0.3 && (gm.info || gm.confirm || gm.back || gm.start || gm.alt)) {
        this.guide = -1;
        audio.play('ui_back');
      }
      return;
    }
    this.seen += dt;
    if (!quiet && !this.banner) this.meet();
    this.intro.update(dt);
    // (co-op: a jump is the crew's, so it waits for everyone; see Accord)
    const ms = this.game.crewMenus();
    this.accord.withdraw(ms);
    const m = this.game.menu();
    // the sector's name goes as soon as you start looking round (it's over the top of the map)
    if (this.banner && (m.left || m.right || m.up || m.down || m.next || m.prev || m.confirm)) this.seen = Math.max(this.seen, 4.6);
    if (m.info) return this.openGuide();
    if (this.options.length) {
      let dir: [number, number] | null = null;
      if (m.left) dir = [-1, 0];
      if (m.right) dir = [1, 0];
      if (m.up) dir = [0, -1];
      if (m.down) dir = [0, 1];
      if (dir) this.steer(dir);
      if (dir) audio.play('ui_move');
      // planning ahead: a stop further along the route, or back
      if (m.next) audio.play(this.ahead(1) ? 'ui_select' : 'ui_back');
      if (m.prev && this.ahead(-1)) audio.play('ui_back');
      if (m.confirm) {
        // a jump is always to the route's first stop
        const to = this.plan[0];
        if (this.accord.confirm(ms, to.id) === null) return;
        this.depth = 0;
        this.sync();
        this.anim = { kind: 'jump', t: 0, to, from: c.pos(c.nodes[c.here]), shown: this.shown };
        audio.play('warp');
        return;
      }
    }
    if (m.alt) {
      audio.play('ui_select');
      toHangar(this.game, () => toChart(this.game));
    }
  }

  private openGuide() {
    this.guide = 0;
    this.intro.dismiss();
    audio.play('ui_select');
  }

  /** Is the sector's name up (the first watch, just come in)? */
  private get banner() {
    return this.firstLook && this.chart.time === 0 && this.seen < 5;
  }

  /** Says what's new on the chart, the first time each is met. */
  private meet() {
    const run = this.run;
    if (run.crew.some((_, i) => newParts(run, i) > 0)) this.intro.meet('hold');
    const n = this.picked;
    if (n?.elite) this.intro.meet('elite');
  }

  /** Parts waiting in the holds that nobody's looked at in the hangar yet. */
  private get fresh() {
    return this.run.crew.reduce((s, _, i) => s + newParts(this.run, i), 0);
  }

  /** The panel's buttons, in rows that fit it (new parts get a callout of their own, over them). */
  private controls(): Hint[][] {
    const dev = this.game.hintDevices();
    if (this.stuck) return [[['confirm', 'FIGHT OUT']]];
    const items: Hint[] = [['confirm', this.chart.open ? 'TO THE GATE' : this.depth ? `JUMP TO STOP ${this.chart.stops + 1}` : 'JUMP'], ...(this.accord.open ? [['back', 'TAKE BACK'] as Hint] : []), ...(this.fresh ? [] : [['alt', 'FIT PARTS'] as Hint])];
    // (planning: on its own row, so it reads as one thing)
    const plan: Hint[] = [...(this.depth ? [['prev', 'BACK'] as Hint] : []), ...(this.further ? [['next', 'PLAN AHEAD', VIOLET] as Hint] : [])];
    return [...(plan.length ? hintRows(dev, plan, W - PANEL_X - 20) : []), ...hintRows(dev, items, W - PANEL_X - 20)];
  }

  /** Where the card has to stop, for the buttons under it. */
  private cardBottom() {
    return H - 8 - this.controls().length * 15 - (this.fresh && !this.stuck ? 21 : 0);
  }

  /** Picks the nearest option in a direction on screen from the one selected. */
  private steer([dx, dy]: [number, number]) {
    const c = this.chart;
    const cur = this.screen(c.pos(this.options[this.sel], this.shown));
    const from = { x: cur.x, y: cur.y };
    let best = -1;
    let bs = Infinity;
    this.options.forEach((n, i) => {
      if (i === this.sel) return;
      const p = this.screen(c.pos(n, this.shown));
      const vx = p.x - from.x;
      const vy = p.y - from.y;
      const d = Math.hypot(vx, vy) || 1;
      const dot = (vx * dx + vy * dy) / d;
      if (dot < 0.25) return;
      const score = d * (2.2 - dot * 1.2);
      if (score < bs) {
        bs = score;
        best = i;
      }
    });
    if (best >= 0) this.pick(this.options[best]);
  }

  /** Where the ship is drawn now. */
  private shipPos() {
    const c = this.chart;
    const a = this.anim;
    if (a?.kind === 'jump') {
      const e = smoothstep(0, 1, a.t);
      const to = c.pos(a.to!, this.shown);
      const from = c.pos(c.nodes[c.here], this.shown);
      return { x: lerp(from.x, to.x, e), y: lerp(from.y, to.y, e) };
    }
    return c.pos(c.nodes[c.here], this.shown);
  }


  /** (The Sweep is unhooked: never stuck.) */
  private get stuck() {
    return false;
  }

  /** The site on the card: where you're going, or what's picked. */
  private get picked(): ChartNode | null {
    return this.anim?.to ?? (this.anim ? null : (this.plan[this.depth] ?? null));
  }

  /** Sites with a fight get a 3D picture; the rest are painted. */
  private previewOf(n: ChartNode): EncounterPreview | null {
    if (!fights(n)) return null;
    let p = this.previews.get(n.id);
    if (!p) {
      p = new EncounterPreview(this.run, n, VIG_W, VIG_H);
      this.previews.set(n.id, p);
    }
    return p;
  }

  draw() {
    const g = this.game;
    const c = this.chart;
    const ctx = g.ui;
    // place the 3D
    c.bodies.forEach((b, i) => {
      this.world(c.bodyPos(i, this.shown), 0, this.bodies[i].position);
      this.bodies[i].rotation.y = this.t * 0.12 + i;
    });
    const sp = this.shipPos();
    this.world(sp, 1.4, this.ship.root.position);
    if (this.anim?.kind === 'jump') {
      const to = this.world(c.pos(this.anim.to!, c.time + 1));
      const from = this.world(this.anim.from);
      this.ship.root.rotation.y = Math.atan2(-(to.x - from.x), -(to.z - from.z));
    } else this.ship.root.rotation.y += 0.01;
    // (the wingman holds station behind and to the lead's right, turning with it)
    this.ships.slice(1).forEach((w, k) => {
      const yaw = this.ship.root.rotation.y;
      const ox = 1.3 * (k + 1);
      const oz = 1.1 * (k + 1);
      w.root.position.set(this.ship.root.position.x + Math.cos(yaw) * ox + Math.sin(yaw) * oz, 1.4, this.ship.root.position.z - Math.sin(yaw) * ox + Math.cos(yaw) * oz);
      w.root.rotation.y = yaw;
    });
    g.clearGL();
    this.stage.render(g, 0, 0);
    // the card's picture, under the panel (which leaves a hole for it)
    const n = this.stuck ? null : this.picked;
    this.shownPreview = n ? this.previewOf(n) : null;
    if (this.shownPreview) this.shownPreview.render(g, PANEL_X + 11, this.cardY() + 3);

    ctx.clearRect(0, 0, W, H);
    this.overlay(ctx);
    this.strip(ctx);
    this.legend(ctx);
    this.toasts(ctx);
    this.accord.banner(ctx, MAP_W / 2, this.noteT > 0 && this.note ? H - 60 : H - 34, (k) => this.wish(k), this.t);
    this.panel(ctx);
    if (!this.anim && this.guide < 0 && !this.banner) {
      this.intro.draw(ctx, 12, 30, 300);
      if (this.depth) this.lookingAhead(ctx);
      else if (!this.intro.showing) hints(ctx, this.game.hintDevices(), [['info', 'HOW IT WORKS']], MAP_W - 12, 31, 'right');
    }
    if (this.guide >= 0) this.drawGuide(ctx);
  }

  /** Planning ahead: which stop's being chosen. */
  private lookingAhead(ctx: CanvasRenderingContext2D) {
    const head = this.plan[this.depth]?.kind === 'gate' ? 'PLANNING THE GATE' : `PLANNING STOP ${this.chart.stops + this.depth + 1}`;
    const tail = this.plan[this.depth]?.kind === 'gate' ? '' : ` OF ${STOPS}`;
    const w = textWidth(head + tail) + 12;
    const x = Math.round(MAP_W / 2 - w / 2);
    frame(ctx, x, 27, w, 13, 'rgba(18,12,24,0.94)', VIOLET);
    const hx = x + 6 + drawText(ctx, head, x + 6, 30, INK);
    drawText(ctx, tail, hx, 30, VIOLET);
  }

  /** What a co-op vote is for, in a few words. */
  private wish(k: number | 'drift' | 'fight') {
    if (k === 'drift') return 'DRIFT A WATCH';
    if (k === 'fight') return 'FIGHT OUT';
    const n = this.chart.nodes[k];
    return `JUMP TO ${n.kind === 'event' && !n.known ? 'SOMETHING IN THE DARK' : n.name}`;
  }

  private overlay(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    const at = (n: ChartNode) => this.screen(c.pos(n), 0.5);
    const taken: Box[] = [];
    // planet names, on a plate under each planet; or over it, or beside it, if a site's in the way
    // (or it'd be down in the key)
    const sites = c.nodes.filter((n) => n.kind !== 'start').map((n) => {
      const p = at(n);
      return { x: p.x - 9, y: p.y - 9, w: 19, h: 19 };
    });
    c.bodies.forEach((b, i) => {
      if (!b.planet) return;
      const p = this.screen(c.bodyPos(i));
      // (its mood, if it has one, on a line under its name)
      const mood = c.moods[b.planet.id] ? MOODS[c.moods[b.planet.id]] : null;
      const w = Math.max(textWidth(b.planet.name), mood ? textWidth(mood.name) : 0) + 6;
      const h = mood ? 20 : 11;
      const r = b.size * 6;
      const spots: Box[] = [
        { x: Math.round(p.x - w / 2), y: Math.round(p.y + r + 6), w, h },
        { x: Math.round(p.x - w / 2), y: Math.round(p.y - r - 6 - h), w, h },
        { x: Math.round(p.x + r + 6), y: Math.round(p.y - 5), w, h },
        { x: Math.round(p.x - r - 6 - w), y: Math.round(p.y - 5), w, h },
      ];
      const ok = (q: Box) => q.y > 26 && q.y + q.h < H - 18 && q.x > 2 && q.x + q.w < MAP_W - 2;
      const free = (q: Box) => !sites.some((o) => q.x < o.x + o.w && o.x < q.x + q.w && q.y < o.y + o.h && o.y < q.y + q.h);
      const box = spots.find((q) => ok(q) && free(q)) ?? spots.find(ok) ?? spots[0];
      ctx.fillStyle = 'rgba(7,6,12,0.72)';
      ctx.fillRect(box.x, box.y, w, h);
      drawText(ctx, b.planet.name, box.x + w / 2, box.y + 2, '#8a7ea0', { align: 'center', shadow: false });
      if (mood) drawText(ctx, mood.name, box.x + w / 2, box.y + 11, mood.color, { align: 'center', shadow: false });
      taken.push(box);
      if (this.run.contract?.planet === b.planet.id) drawText(ctx, `CRATE: +${this.run.contract.pay}`, box.x + w / 2, box.y + 12, GOLD, { align: 'center' });
    });

    const sp = this.screen(this.shipPos(), 0.5);
    const here = c.nodes[c.here];
    const plan = this.anim ? [this.anim.to] : this.plan;
    const sel = this.anim ? null : (plan[this.depth] ?? null);
    // every site some route from here can still reach; the rest are behind you, or cut off
    const ahead = c.ahead();
    // the way you've come, dim gold
    const flown = [c.nodes[0], ...c.path.map((id) => c.nodes[id])];
    for (let i = 1; i < flown.length; i++) dots(ctx, at(flown[i - 1]), at(flown[i]), 'rgba(160,120,50,0.6)', 99, 0, 4, 4);
    // every way on that's still open, faint: the whole map of what's possible
    for (const n of [here, ...ahead]) for (const m of c.reachable(n)) if (ahead.has(m)) dots(ctx, at(n), at(m), 'rgba(150,130,190,0.32)', 3, 0, 7, 8);
    // the ways on from the picked site, brighter: what it leads to
    const next = sel ? this.optionsAt(this.depth + 1) : [];
    if (sel) for (const m of next) dots(ctx, at(sel), at(m), 'rgba(200,160,255,0.75)', 3, Math.floor(-this.t * 10) % 3, 9, 8);
    // the route planned: the stops before this one gold, this leg cyan, the ones after it faint gold
    plan.forEach((n, i) => {
      const from = i ? at(plan[i - 1]) : sp;
      if (i === this.depth) dots(ctx, from, at(n), CYAN, 4, Math.floor(-this.t * 14) & 3, 9, 10);
      else dots(ctx, from, at(n), i < this.depth ? 'rgba(255,208,74,0.95)' : 'rgba(255,208,74,0.5)', i < this.depth ? 99 : 2, 0, 8, 8);
    });

    // the sites: cut off, then what's ahead, the route, and last what's in reach now (on top)
    const state = (n: ChartNode) => (n.done ? 'done' : !this.anim && this.options.includes(n) ? 'reach' : plan.includes(n) ? 'plan' : ahead.has(n) || n.kind === 'gate' ? 'ahead' : 'gone');
    const layer = { done: 0, gone: 1, ahead: 2, plan: 3, reach: 4 };
    const order = c.nodes.filter((n) => n.kind !== 'start' && n !== here).sort((a, b) => layer[state(a)] - layer[state(b)]);
    const tags: { n: ChartNode; px: number; py: number; off: number }[] = [];
    const badges: { k: number; x: number; y: number }[] = [];
    for (const n of order) {
      const p = at(n);
      const st = state(n);
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      this.token(ctx, px, py, n, st, n === sel);
      if (st === 'done' || st === 'gone') continue;
      const s = n.kind === 'gate' ? 9 : st === 'reach' ? 7 : 5;
      taken.push({ x: px - s - 1, y: py - s - 1, w: s * 2 + 3, h: s * 2 + 3 });
      if (n.kind === 'gate' && st !== 'reach') {
        const gx = Math.min(p.x, MAP_W - 4 - textWidth('WARDEN GATE') / 2);
        drawText(ctx, 'WARDEN GATE', gx, p.y + 13, '#a83a4a', { align: 'center' });
        taken.push({ x: gx - textWidth('WARDEN GATE') / 2, y: p.y + 12, w: textWidth('WARDEN GATE'), h: 10 });
      }
      // a planned stop wears its number, on its corner
      const k = plan.indexOf(n);
      if (k >= 0 && n.kind !== 'gate') {
        badges.push({ k: c.stops + k + 1, x: px - 4, y: py - s - 13 });
        taken.push({ x: px - 5, y: py - s - 14, w: 11, h: 12 });
      }
      if (st !== 'reach') continue;
      // who wants to go there, over it
      this.accord.tags(ctx, n.id, p.x - s - 4, p.y - 3, 'right');
      tags.push({ n, px, py, off: s + 3 });
    }
    // what's in reach says what it pays in words (the rest say it in colour), over everything
    const placed = tags.map((g) => ({ g, box: this.placeTag(g.n, g.px, g.py, g.off, taken) }));
    for (const { g, box } of placed) if (box) this.rewardTag(ctx, g.n, box);

    // the picked one: brackets round it
    if (sel) {
      const now = at(sel);
      const b = (sel.kind === 'gate' ? 13 : 11) + Math.round(Math.sin(this.t * 6));
      ctx.fillStyle = GOLD;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        const cx = Math.round(now.x + sx * b);
        const cy = Math.round(now.y + sy * b);
        ctx.fillRect(cx - (sx > 0 ? 3 : 0), cy, 4, 1);
        ctx.fillRect(cx, cy - (sy > 0 ? 3 : 0), 1, 4);
      }
    }
    // (the route's numbers go over everything, the brackets too)
    for (const b of badges) this.badge(ctx, b.x, b.y, b.k);
    // where you are
    if (!this.anim) {
      const k = Math.round(9 + Math.sin(this.t * 3));
      ring(ctx, Math.round(sp.x), Math.round(sp.y), k, 'rgba(255,194,74,0.35)');
    }
  }

  /**
   * How a site shows on the map, its colour what it pays: big and bright if you can jump there
   * now; mid-sized if a route can still get there (or it's on yours); faint once it's cut off, and
   * a dark dot once it's done.
   */
  private token(ctx: CanvasRenderingContext2D, px: number, py: number, n: ChartNode, state: 'reach' | 'plan' | 'ahead' | 'gone' | 'done', sel: boolean) {
    const look = this.look(n);
    const col = this.payColor(n);
    if (state === 'done') {
      chamfer(ctx, px, py, 3, DARK);
      chamfer(ctx, px, py, 2, '#8a6a2a');
      return;
    }
    if (state === 'gone') {
      chamfer(ctx, px, py, 3, DARK);
      chamfer(ctx, px, py, 2, '#2e2640');
      return;
    }
    const gate = n.kind === 'gate';
    // (a dealer's a shop, not a reward: outlined, so it's never mistaken for a site paying in green)
    const shop = n.kind === 'salvage';
    if (state !== 'reach' && !gate) {
      chamfer(ctx, px, py, 6, shop ? col : DARK);
      chamfer(ctx, px, py, 5, shop ? '#14261e' : col);
      icon(ctx, look.icon, px - 3, py - 3, shop ? col : DARK);
      // (what's only on the way, not on your route, sits back a little)
      if (state === 'ahead') {
        ctx.globalAlpha = 0.3;
        chamfer(ctx, px, py, 5, DARK);
        ctx.globalAlpha = 1;
      }
      return;
    }
    // the gate always shows (it's where you're going), dimmer while it's out of reach
    const s = gate ? 9 : 7;
    if (state === 'reach') {
      // a dark halo, so it stands off a bright planet, and a ring that breathes
      chamfer(ctx, px, py, s + 2, 'rgba(7,6,12,0.55)');
      ctx.globalAlpha = sel ? 0.7 : 0.25 + (0.5 + 0.5 * Math.sin(this.t * 3 + n.id)) * 0.25;
      ring(ctx, px, py, s + 3, col);
      ctx.globalAlpha = 1;
    } else ctx.globalAlpha = 0.65;
    chamfer(ctx, px, py, s + 1, shop ? col : DARK);
    chamfer(ctx, px, py, s, shop ? '#14261e' : col);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(px - s + 1, py - s, s * 2 - 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px - s + 1, py + s, s * 2 - 1, 1);
    icon(ctx, look.icon, px - 3, py - 3, shop ? col : DARK);
    ctx.globalAlpha = 1;
    if (n.elite && state === 'reach') {
      // a crown of spikes
      ctx.fillStyle = DARK;
      ctx.fillRect(px - 4, py - s - 5, 9, 4);
      ctx.fillStyle = GOLD;
      ctx.fillRect(px - 3, py - s - 3, 7, 1);
      for (const k of [-3, 0, 3]) ctx.fillRect(px + k, py - s - 4, 1, 1);
    }
  }

  /** A planned stop's number, on a gold tag. */
  private badge(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
    ctx.fillStyle = DARK;
    ctx.fillRect(x - 1, y - 1, 11, 12);
    ctx.fillStyle = GOLD;
    ctx.fillRect(x, y, 9, 10);
    drawText(ctx, `${k}`, x + 5, y + 2, DARK, { align: 'center', shadow: false });
  }

  /** The colour of what a site pays: its reward for a fight, else its kind's. */
  private payColor(n: ChartNode) {
    if (hidden(n)) return MOODS.dark.color;
    return (n.kind === 'raid' || n.kind === 'hunt') && n.reward !== 'none' ? REWARD[n.reward][1] : this.look(n).color;
  }

  /**
   * The sector's route along the top: a slot for each of its stops, filled with the site you made
   * (its kind and what it paid) as you go; the next one shows the picked site, ghosted; then the gate.
   */
  private strip(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    const x0 = 10;
    const x1 = MAP_W - 10;
    const y = 6;
    frame(ctx, x0, y, x1 - x0, 17, 'rgba(18,12,24,0.88)');
    const gateW = 50;
    const tx0 = x0 + 4;
    const tx1 = x1 - gateW;
    const ty = y + 8;
    const gap = (tx1 - tx0) / STOPS;
    // (the route planned on from here; while jumping, just where you're going)
    const plan = this.anim ? [this.anim.to] : this.plan;
    const choosing = this.anim ? 0 : this.depth;
    const slot = (k: number, n: ChartNode, mode: 'made' | 'plan' | 'choosing') => {
      const sx = Math.round(tx0 + gap * k + 7);
      const look = this.look(n);
      // made: dimmed, behind you; planned: lit; the one being chosen: underlined in gold, breathing
      if (mode === 'made') ctx.globalAlpha = 0.5;
      if (mode === 'choosing') {
        ctx.fillStyle = GOLD;
        ctx.fillRect(sx - 6, ty + 8, Math.min(gap - 6, 13 + textWidth(this.slotWord(n))), 1);
        ctx.globalAlpha = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this.t * 5));
      }
      const shop = n.kind === 'salvage';
      chamfer(ctx, sx, ty, 6, shop ? look.color : DARK);
      chamfer(ctx, sx, ty, 5, shop ? '#14261e' : this.payColor(n));
      icon(ctx, look.icon, sx - 3, ty - 3, shop ? look.color : DARK);
      const word = this.slotWord(n);
      const col = n.kind === 'salvage' ? look.color : this.payColor(n);
      if (word && textWidth(word) <= gap - 18) drawText(ctx, word, sx + 9, ty - 3, col);
      ctx.globalAlpha = 1;
    };
    for (let k = 0; k < STOPS; k++) {
      const made = c.path[k] !== undefined ? c.nodes[c.path[k]] : null;
      const planned = plan[k - c.stops];
      if (made) slot(k, made, 'made');
      else if (planned && planned.kind !== 'gate') slot(k, planned, k - c.stops === choosing ? 'choosing' : 'plan');
      else {
        const sx = Math.round(tx0 + gap * k + 7);
        chamfer(ctx, sx, ty, 4, DARK);
        chamfer(ctx, sx, ty, 3, k === c.stops + plan.length && !this.anim ? (Math.floor(this.t * 3) % 2 ? INK : '#5a4e68') : '#3a3048');
        drawText(ctx, `${k + 1}`, sx + 7, ty - 3, '#4a3e5a');
      }
      // a rule between the slots: lit behind you, gold along the route planned
      if (k < STOPS - 1) {
        ctx.fillStyle = k < c.stops - 1 ? '#8a6a2a' : k < c.stops + plan.length - 1 ? '#ffd04a' : '#2a2236';
        ctx.fillRect(Math.round(tx0 + gap * (k + 1)) - 2, ty, 3, 1);
      }
    }
    const sel = plan[choosing];
    // the gate
    const gx = tx1 + 4;
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(gx - 4, y + 3, 1, 11);
    // (lit once it's open, or once the route planned reaches it; picked, it pulses)
    const lit = c.open || plan.some((n) => n.kind === 'gate');
    if (sel?.kind === 'gate') ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 6);
    icon(ctx, 'gate', gx + 2, ty - 3, lit ? RED : '#5a3a48');
    drawText(ctx, 'GATE', gx + 12, ty - 3, lit ? '#ff8a8a' : '#6a4a58');
    ctx.globalAlpha = 1;
  }

  /** What a site's slot on the route says: what it pays, or that it's the dealer. */
  private slotWord(n: ChartNode) {
    return n.kind === 'salvage' ? 'DEALER' : hidden(n) ? '???' : (SHORT[n.reward] ?? '');
  }

  /** A site's reward tag: the word, and its colour. */
  private tagWord(n: ChartNode) {
    const word = n.kind === 'raid' || n.kind === 'hunt' ? payWord(n, true) : n.kind === 'salvage' ? 'DEALER' : undefined;
    return word ? { word, col: this.payColor(n) } : null;
  }

  /**
   * Where a site's tag goes: beside it, on the side away from its planet (so not over the planet
   * or its other sites); if that's taken or off the map, the other side, then under, then over.
   * It takes its spot in `taken`.
   */
  private placeTag(n: ChartNode, px: number, py: number, off: number, taken: Box[]): Box | null {
    const tw = this.tagWord(n);
    if (!tw) return null;
    const w = textWidth(tw.word) + 9;
    const h = 9;
    const away = n.body >= 0 && px < this.screen(this.chart.bodyPos(n.body, this.shown)).x - 1 ? -1 : 1;
    const spots: Box[] = [
      { x: away > 0 ? px + off : px - off - w, y: py - 4, w, h },
      { x: away > 0 ? px - off - w : px + off, y: py - 4, w, h },
      { x: px - Math.round(w / 2), y: py + off + 1, w, h },
      { x: px - Math.round(w / 2), y: py - off - h - 1, w, h },
    ];
    const fits = (b: Box) => b.x >= 4 && b.x + b.w <= MAP_W - 4 && b.y >= 26 && b.y + b.h <= H - 18;
    const free = (b: Box) => !taken.some((o) => b.x - 1 < o.x + o.w && o.x < b.x + b.w + 1 && b.y - 1 < o.y + o.h && o.y < b.y + b.h + 1);
    const box = spots.find((b) => fits(b) && free(b)) ?? spots.find(fits) ?? spots[0];
    taken.push(box);
    return box;
  }

  /** What a site pays, on its tag. */
  private rewardTag(ctx: CanvasRenderingContext2D, n: ChartNode, { x: tx, y, w }: Box, faint = false) {
    const tw = this.tagWord(n);
    if (!tw) return;
    if (faint) ctx.globalAlpha = 0.75;
    ctx.fillStyle = DARK;
    ctx.fillRect(tx - 1, y - 1, w + 2, 11);
    ctx.fillStyle = 'rgba(18,12,24,0.95)';
    ctx.fillRect(tx, y, w, 9);
    ctx.fillStyle = tw.col;
    ctx.fillRect(tx + 2, y + 2, 4, 5);
    drawText(ctx, tw.word, tx + 7, y + 1, tw.col, { shadow: false });
    ctx.globalAlpha = 1;
  }

  /** A key to the marks, along the bottom. */
  private legend(ctx: CanvasRenderingContext2D) {
    if (this.anim) return;
    const y = H - 9;
    let x = 12;
    const key = '#8a7ea0';
    // the kinds by their icons (their colours are what they pay)
    for (const k of ['raid', 'hunt', 'salvage'] as NodeKind[]) {
      const look = KIND[k];
      const shop = k === 'salvage';
      chamfer(ctx, x + 5, y, 6, shop ? look.color : DARK);
      chamfer(ctx, x + 5, y, 5, shop ? '#14261e' : '#b8acc8');
      icon(ctx, look.icon, x + 2, y - 3, shop ? look.color : DARK);
      x += 13;
      x += drawText(ctx, look.label, x, y - 3, key) + 9;
    }
    // the colours
    for (const r of ['gun', 'graft', 'refit'] as Reward[]) {
      chamfer(ctx, x + 2, y, 3, DARK);
      chamfer(ctx, x + 2, y, 2, REWARD[r][1]);
      x += 6;
    }
    x += drawText(ctx, 'WHAT IT PAYS', x + 2, y - 3, key) + 13;
    // the route's numbers
    this.badge(ctx, x, y - 5, 1);
    x += 13;
    drawText(ctx, 'YOUR ROUTE', x, y - 3, key);
  }

  /** News from the last stop, and the name of a new system. */
  private toasts(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    if (this.noteT > 0 && this.note) {
      ctx.globalAlpha = Math.min(1, this.noteT * 3);
      const w = Math.min(MAP_W - 20, textWidth(this.note) + 20);
      frame(ctx, MAP_W / 2 - w / 2, H - 38, w, 17, 'rgba(18,12,24,0.94)', GOLD);
      drawText(ctx, this.note, MAP_W / 2, H - 33, GOLD, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (this.guide < 0 && this.banner) {
      const a = Math.min(1, this.seen * 2) * Math.min(1, (5 - this.seen) * 2);
      ctx.globalAlpha = a;
      const w = 262;
      const x = Math.round(MAP_W / 2 - w / 2);
      const y = 34;
      frame(ctx, x, y, w, 60, 'rgba(18,12,24,0.92)', GOLD);
      drawText(ctx, `SECTOR ${this.run.sector + 1} OF ${SECTORS}`, MAP_W / 2, y + 6, DIM, { align: 'center' });
      drawText(ctx, SYSTEMS[(c.seed >>> 3) % SYSTEMS.length], MAP_W / 2, y + 17, INK, { scale: 2, align: 'center' });
      drawText(ctx, `${STOPS} STOPS, THEN THE GATE`, MAP_W / 2, y + 37, GOLD, { align: 'center' });
      drawText(ctx, `THE WARDEN: ${c.bossPlanet.boss.name}`, MAP_W / 2, y + 47, '#ff8a8a', { align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  /** How a site shows: hidden events are a question, known ones what they are. */
  private look(n: ChartNode) {
    const k = KIND[n.kind];
    if (n.kind !== 'event' || !n.known) return k;
    const ev = eventById(n.event ?? 'derelict');
    return { ...k, label: ev.open ? 'PORT OF CALL' : 'EVENT', icon: ev.open ? 'port' : 'known', color: ev.open ? '#ffd0a0' : ev.danger >= 2 ? '#ff8ac8' : VIOLET, text: ev.rumour };
  }

  /** Height of the status block (the crew and the scrap). */
  private statusH() {
    return 16 + this.run.crew.length * 10;
  }

  /** Where the card starts. */
  private cardY() {
    return 6 + 30 + 5 + this.statusH() + 5;
  }

  private panel(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    const run = this.run;
    const x = PANEL_X;
    backdrop(ctx, x, 0, W - x, H);
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(x, 0, 1, H);
    const px = x + 8;
    const pw = W - x - 16;
    let y = 6;
    // the sector, how far through the run, and the Sweep
    frame(ctx, px, y, pw, 30);
    drawText(ctx, `SECTOR ${run.sector + 1}`, px + 6, y + 5, INK);
    for (let k = 0; k < SECTORS; k++) {
      const sx = px + 66 + k * 14;
      if (k) {
        ctx.fillStyle = k <= run.sector ? '#6a5a40' : '#2a2236';
        ctx.fillRect(sx - 10, y + 8, 7, 1);
      }
      if (k < run.sector) chamfer(ctx, sx, y + 8, 3, GREEN);
      else if (k === run.sector) {
        chamfer(ctx, sx, y + 8, 4, DARK);
        chamfer(ctx, sx, y + 8, 3, GOLD);
      } else ring(ctx, sx, y + 8, 3, '#4a3e5a');
    }
    drawText(ctx, `STOP ${Math.min(c.stops + 1, STOPS)}/${STOPS}`, px + pw - 6, y + 5, DIM, { align: 'right' });
    const left = STOPS - c.stops;
    drawText(ctx, c.open ? 'THE GATE IS OPEN' : `${left} STOP${left > 1 ? 'S' : ''} TO THE GATE`, px + 6, y + 17, c.open ? (Math.floor(this.t * 4) % 2 ? RED : INK) : DIM);
    // what the Warden's lost to the stages won on its ground
    if (run.wardenEase > 0) drawText(ctx, `WARDEN -${Math.round(run.wardenEase * 100)}%`, px + pw - 6, y + 17, MOODS.warden.color, { align: 'right' });
    y += 35;
    // the crew and the scrap
    const fh = this.statusH();
    frame(ctx, px, y, pw, fh);
    let ty = y + 4;
    run.crew.forEach((cr, i) => {
      drawText(ctx, `P${i + 1}`, px + 6, ty, hex(LIVERY[i][2]));
      hullGauge(ctx, cr.hull, crewHull(cr), px + 24, ty, 40);
      // (parts nobody's fitted or looked at yet: lit, with a blinking pip)
      const nu = newParts(run, i);
      const hw = drawText(ctx, `HOLD ${cr.cargo.length}/${CARGO}`, px + pw - 6, ty, nu ? GOLD : DIM, { align: 'right' });
      if (nu && Math.floor(this.t * 3) % 2) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(px + pw - 6 - hw - 6, ty + 2, 3, 3);
      }
      ty += 10;
    });
    drawText(ctx, `SCRAP ${run.purses()}`, px + 6, ty, GOLD);
    y = this.cardY();
    const bottom = this.cardBottom();
    const n = this.picked;
    if (this.stuck) {
      frame(ctx, px, y, pw, 70, '#3a1420', '#6a2430');
      drawText(ctx, 'CAUGHT', px + 6, y + 6, RED, { scale: 2 });
      wrap('The Sweep has you, and there is nowhere you can reach. Fight your way through it: they will chase you all the way to the gate.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 26 + k * 9, INK));
    } else if (n) this.card(ctx, n, px, y, pw, bottom - y);
    else if (!this.anim) {
      frame(ctx, px, y, pw, 40);
      wrap('Nowhere left to land in this sector.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 6 + k * 9, INK));
    }
    // controls
    const dev = this.game.hintDevices();
    if (this.anim) return;
    // (moving the cursor goes without saying; the rest fits the panel in rows, as many as the keys need)
    const rows = this.controls();
    rows.forEach((r, k) => hints(ctx, dev, r, px + pw / 2, H - 15 - (rows.length - 1 - k) * 15, 'center'));
    const fresh = this.fresh;
    if (fresh && !this.stuck) {
      // new parts in the hold: the one thing worth doing before the next jump, so it's said loudly
      const cy = H - 8 - rows.length * 15 - 19;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
      frame(ctx, px, cy, pw, 17, 'rgba(40,30,14,0.96)', pulse > 0.5 ? GOLD : '#8a6a2a');
      const label = `FIT ${fresh} NEW PART${fresh > 1 ? 'S' : ''}`;
      hints(ctx, dev, [['alt', label, GOLD]], px + pw / 2, cy + 5, 'center');
    }
  }

  /**
   * How the chart works, in five: pick a site, a jump costs fuel, the Sweep behind you, build
   * your ship on the way (with the real buttons), and the gate. Each with a little picture.
   */
  private drawGuide(ctx: CanvasRenderingContext2D) {
    const a = smoothstep(0, 1, Math.min(1, this.guide / 0.2));
    const t = this.t;
    const dev = this.game.hintDevices();
    ctx.fillStyle = `rgba(8,5,12,${0.72 * a})`;
    ctx.fillRect(0, 0, W, H);
    const pw = 540;
    const ph = 304;
    const px = (W - pw) / 2;
    const py = Math.round(24 + (1 - a) * 12);
    ctx.globalAlpha = a;
    frame(ctx, px, py, pw, ph, 'rgba(16,11,24,0.98)', GOLD);
    drawText(ctx, 'HOW THE STAR MAP WORKS', W / 2, py + 10, INK, { scale: 2, align: 'center' });
    const tx = px + 92;
    const tw = pw - 92 - 16;
    let y = py + 36;
    const step = (n: number, head: string, body: string, pic: (cx: number, cy: number) => void, extra = 0) => {
      const lines = wrap(body, tw);
      const h = Math.max(46, 12 + lines.length * 9 + extra);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(px + 8, y - 4, pw - 16, h - 2);
      drawText(ctx, `${n}`, px + 16, y, '#5a4e68', { scale: 2 });
      pic(px + 56, y + Math.min(h, 46) / 2 - 4);
      drawText(ctx, head, tx, y, GOLD);
      lines.forEach((l, k) => drawText(ctx, l, tx, y + 11 + k * 9, '#d8cce8'));
      const top = y;
      y += h + 2;
      return top + 12 + lines.length * 9;
    };
    const site = (kind: NodeKind, x: number, y0: number, dim = false) => {
      const look = KIND[kind];
      chamfer(ctx, x, y0, 6, DARK);
      chamfer(ctx, x, y0, 5, dim ? '#3a3048' : look.color);
      icon(ctx, look.icon, x - 3, y0 - 3, dim ? '#1c1526' : DARK);
    };
    // 1: sites in reach, one picked
    step(1, 'PICK WHERE TO GO', 'THE SITES YOU CAN JUMP TO NOW SHINE. MOVE TO CHOOSE ONE: THE CARD ON THE RIGHT SAYS WHAT IT IS, HOW HARD IT IS AND WHAT IT PAYS. THEN JUMP THERE.', (cx, cy) => {
      const kinds: NodeKind[] = ['raid', 'salvage', 'hunt'];
      const at = Math.floor(t * 0.8) % 3;
      kinds.forEach((k, i) => {
        const sx = cx - 20 + i * 20;
        const sy = cy + (i === 1 ? -6 : 4);
        site(k, sx, sy);
        if (i !== at) return;
        const b = 9 + Math.round(Math.sin(t * 6));
        ctx.fillStyle = GOLD;
        for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const bx = Math.round(sx + ox * b);
          const by = Math.round(sy + oy * b);
          ctx.fillRect(bx - (ox > 0 ? 2 : 0), by, 3, 1);
          ctx.fillRect(bx, by - (oy > 0 ? 2 : 0), 1, 3);
        }
      });
    });
    // 2: what each site pays, on its tag
    step(2, 'EVERY SITE SHOWS ITS REWARD', 'A SITE\'S COLOUR IS WHAT IT PAYS: THE PART IT NAMES (ONE OF THREE), A GRAFT FROM ITS FACTION, A REFIT, SCRAP OR A REPAIR. ELITES ARE HARDER, AND PAY BETTER. EACH PLANET HAS A MOOD: WIN ON THE WARDEN\'S GROUND TO WEAKEN IT.', (cx, cy) => {
      const ks: Reward[] = ['gun', 'graft', 'refit'];
      ks.forEach((k, i) => {
        const [, col] = REWARD[k];
        ctx.fillStyle = col;
        ctx.fillRect(cx - 26 + i * 20, cy - 2 + (i === 1 ? -5 : 3), 5, 5);
      });
    });
    // 3: five stops, the planets turning
    const y3 = step(3, `${STOPS} STOPS, THEN THE GATE: PLAN YOUR ROUTE`, 'THE LINES ARE THE WAYS ON: EACH SITE LEADS TO ONE OR TWO IN THE NEXT COLUMN, SO WHERE YOU GO NOW DECIDES WHAT YOU CAN STILL REACH. PLAN AHEAD TO PICK EVERY STOP ON THE WAY TO THE GATE.', (cx, cy) => {
      for (let k = 0; k < STOPS; k++) {
        chamfer(ctx, cx - 24 + k * 10, cy, 3, DARK);
        chamfer(ctx, cx - 24 + k * 10, cy, 2, k < Math.floor(t * 1.5) % (STOPS + 1) ? GOLD : '#3a3048');
      }
    }, 16);
    hints(ctx, dev, [['next', 'PLAN AHEAD', VIOLET], ['prev', 'BACK']], tx + 3, y3 + 3);
    // 4: a part into the grid, and the buttons for it
    const y4 = step(4, 'BUILD YOUR SHIP AS YOU GO', 'PARTS WAIT IN YOUR HOLD, DOING NOTHING, UNTIL YOU FIT THEM TO YOUR SHIP IN THE HANGAR. GRAFTS GO ON AT ONCE, AND CHANGE HOW A BUTTON WORKS.', (cx, cy) => {
      ctx.fillStyle = '#2a2236';
      for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 3; gy++) ctx.fillRect(cx - 4 + gx * 8, cy - 8 + gy * 8, 7, 7);
      // (the ship's biggest part, sliding in from the hold, at the grid's own cell size)
      const f = smoothstep(0, 1, Math.min(1, ((t * 0.5) % 1) * 1.6));
      const def = this.run.crew[0].build.parts.map((p) => partById(p.id)).filter((d) => d.shape.length <= 3).sort((p, q) => q.shape.length - p.shape.length)[0];
      if (def) shapeIcon(ctx, def, Math.round(lerp(cx - 34, cx - 4, f)), cy - 8, 8);
    }, 16);
    hints(ctx, dev, [['alt', 'FIT PARTS']], tx + 3, y4 + 3);
    // 5: the gate
    step(5, 'THEN TAKE THE GATE', `ITS WARDEN GUARDS THE WAY OUT OF THE SECTOR. BEAT IT FOR ITS GRAFT, THE PICK OF ITS PARTS AND A BIG REPAIR, AND THE NEXT SECTOR OPENS: ${SECTORS} IN ALL.`, (cx, cy) => {
      const k = Math.round(9 + Math.sin(t * 3));
      ring(ctx, cx, cy, k, 'rgba(255,74,90,0.5)');
      chamfer(ctx, cx, cy, 7, DARK);
      chamfer(ctx, cx, cy, 6, RED);
      icon(ctx, 'gate', cx - 3, cy - 3, DARK);
    });
    hints(ctx, dev, [['confirm', 'GOT IT']], W / 2, py + ph - 14, 'center');
    ctx.globalAlpha = 1;
  }


  /** A painted picture for a site without a fight (or one you can't see yet). */
  private art(ctx: CanvasRenderingContext2D, n: ChartNode, x: number, y: number, w: number, h: number) {
    if (n.kind === 'salvage') return drawArt(ctx, 'salvage', x, y, w, h, 0.05);
    if (n.kind === 'dock') return drawArt(ctx, 'dock', x, y, w, h, 0.05);
    if (n.kind === 'event' && n.known && n.event) return drawArt(ctx, eventById(n.event).art, x, y, w, h, 0.05);
    // something in the dark: a scene you can't make out, through static
    drawArt(ctx, 'signal', x, y, w, h, 0.84);
    const r = rng(Math.floor(this.t * 14));
    for (let k = 0; k < 90; k++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(200,160,255,0.35)' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + Math.floor(r() * w), y + Math.floor(r() * h), 1 + Math.floor(r() * 3), 1);
    }
    const band = (Math.floor(this.t * 30) % (h + 20)) - 10;
    ctx.fillStyle = 'rgba(200,160,255,0.08)';
    ctx.fillRect(x, y + band, w, 6);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 3);
    drawText(ctx, '?', x + w / 2, y + h / 2 - 14, VIOLET, { scale: 4, align: 'center' });
    ctx.globalAlpha = 1;
  }

  /** The card for a site: its picture, what it is, how hard, what it pays, what the jump costs. */
  private card(ctx: CanvasRenderingContext2D, n: ChartNode, x: number, y: number, w: number, room: number) {
    const c = this.chart;
    const run = this.run;
    const k = this.look(n);
    const unknown = n.kind === 'event' && !n.known;
    const planet = n.kind === 'gate' ? c.bossPlanet : n.planet;
    frame(ctx, x, y, w, room);
    // the picture: a hole for the 3D, or a painting
    const vx = x + 3;
    const vy = y + 3;
    if (this.previews.has(n.id) && this.shownPreview === this.previews.get(n.id)) ctx.clearRect(vx, vy, VIG_W, VIG_H);
    else this.art(ctx, n, vx, vy, VIG_W, VIG_H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(vx, vy + VIG_H - 1, VIG_W, 1);
    // its kind, on a tag over the corner
    const label = unknown ? 'UNKNOWN' : k.label;
    const tw = textWidth(label) + 17;
    ctx.fillStyle = DARK;
    ctx.fillRect(vx, vy + VIG_H - 13, tw + 1, 13);
    ctx.fillStyle = k.color;
    ctx.fillRect(vx, vy + VIG_H - 12, tw, 12);
    icon(ctx, k.icon, vx + 3, vy + VIG_H - 10, DARK);
    drawText(ctx, label, vx + 12, vy + VIG_H - 10, DARK, { shadow: false });
    if (n.elite) {
      const ew = textWidth('ELITE') + 8;
      ctx.fillStyle = DARK;
      ctx.fillRect(vx + VIG_W - ew - 1, vy, ew + 1, 12);
      ctx.fillStyle = GOLD;
      ctx.fillRect(vx + VIG_W - ew, vy, ew, 11);
      drawText(ctx, 'ELITE', vx + VIG_W - ew + 4, vy + 2, DARK, { shadow: false });
    }

    let ty = vy + VIG_H + 5;
    const tx = x + 6;
    const iw = w - 12;
    const name = unknown ? 'SOMETHING IN THE DARK' : n.name;
    for (const l of wrap(name, iw).slice(0, 2)) {
      drawText(ctx, l, tx, ty, INK);
      ty += 9;
    }
    if (n.kind === 'gate') {
      drawText(ctx, planet!.boss.name, tx, ty, '#ff8a8a');
      ty += 9;
    } else if (planet) {
      // the planet, and who you'd meet there (just them, if both won't fit)
      const both = `${planet.name} · `;
      const fits = textWidth(both + planet.faction) <= iw;
      if (fits) drawText(ctx, both, tx, ty, DIM);
      drawText(ctx, planet.faction.toUpperCase(), fits ? tx + textWidth(both) + 1 : tx, ty, '#c8bcd8');
      ty += 9;
    }
    ty += 3;
    // how hard it'll be
    const row = (label: string, draw: (x: number) => void) => {
      drawText(ctx, label, tx, ty, '#6a6080');
      draw(tx + 42);
      ty += 10;
    };
    const threat = run.threat(n);
    if (threat !== null) {
      const tier = threatTier(threat);
      row('THREAT', (x0) => {
        for (let s = 0; s < 5; s++) {
          ctx.fillStyle = DARK;
          ctx.fillRect(x0 + s * 10, ty + 1, 10, 6);
          ctx.fillStyle = s <= tier.step ? THREAT_COLOR[tier.step] : '#2a2236';
          ctx.fillRect(x0 + s * 10, ty + 1, 9, 5);
        }
        drawText(ctx, tier.word, x0 + 54, ty, THREAT_COLOR[tier.step]);
      });
    } else if (unknown) row('THREAT', (x0) => drawText(ctx, '???', x0, ty, VIOLET));
    else if (n.kind === 'event' && eventById(n.event!).danger >= 2) row('THREAT', (x0) => drawText(ctx, 'COULD COME TO A FIGHT', x0, ty, '#ff8ac8'));
    else row('THREAT', (x0) => drawText(ctx, 'NONE', x0, ty, GREEN));
    // what it pays
    const rw = REWARD[n.reward];
    if (n.kind === 'raid' || n.kind === 'hunt') {
      const col = this.payColor(n);
      const rich = n.elite || hidden(n);
      row('REWARD', (x0) => {
        ctx.fillStyle = DARK;
        ctx.fillRect(x0, ty, 6, 6);
        ctx.fillStyle = col;
        ctx.fillRect(x0, ty, 5, 5);
        const lx = x0 + 8 + drawText(ctx, payWord(n), x0 + 8, ty, col) + 6;
        if (rich && (hidden(n) || isPartReward(n.reward) || n.reward === 'graft')) drawText(ctx, 'RARE+', lx, ty, '#6ad0ff');
      });
      const what = hidden(n) ? 'PART, GRAFT OR REFIT' : n.part ? 'OR ONE OF TWO MORE' : REWARD_TEXT[isPartReward(n.reward) ? 'part' : n.reward];
      const says = !hidden(n) && n.reward === 'graft' && planet ? `FROM THE ${planet.faction.toUpperCase().replace(/^THE /, '')}` : what;
      // (wrapped: it mustn't run off the card)
      if (says) for (const l of wrap(says, iw - 42)) row('', (x0) => drawText(ctx, l, x0, ty, DIM));
    }
    const mood = c.mood(n);
    if (mood) {
      const m = MOODS[mood];
      row('PLANET', (x0) => drawText(ctx, m.name, x0, ty, m.color));
      for (const l of wrap(m.text, iw - 42)) row('', (x0) => drawText(ctx, l, x0, ty, MUTED));
    }
    if (n.kind === 'gate') {
      row('REWARD', (x0) => drawText(ctx, 'EPIC+ PARTS, ITS GRAFT', x0, ty, '#ffb03a'));
      row('', (x0) => drawText(ctx, 'AND A BIG REPAIR', x0, ty, GREEN));
      if (run.wardenEase > 0) row('WEAKENED', (x0) => drawText(ctx, `-${Math.round(run.wardenEase * 100)}% HULL`, x0, ty, MOODS.warden.color));
    }
    if (n.kind === 'escort') {
      row('LOOT', (x0) => {
        let lx = x0;
        if (rw[0]) {
          ctx.fillStyle = DARK;
          ctx.fillRect(lx, ty, 6, 6);
          ctx.fillStyle = rw[1];
          ctx.fillRect(lx, ty, 5, 5);
          lx += 8;
          drawText(ctx, rw[0], lx, ty, rw[1]);
        } else drawText(ctx, 'PARTS', lx, ty, INK);
      });
      // the three haulers, each in its role's colour: a crate (and pay) for each that gets home
      const roles = convoyRoles(n.seed);
      row('CARGO', (x0) => {
        roles.forEach((role, h) => haulerIcon(ctx, x0 + h * 9, ty, ROLES[role].color));
        drawText(ctx, 'A CRATE EACH', x0 + 30, ty, GOLD);
      });
      for (const role of roles) if (role !== 'freighter') row('', (x0) => drawText(ctx, `${ROLES[role].name}: ${ROLES[role].text}`, x0, ty, ROLES[role].color));
    }
    if (n.kind === 'heist') {
      row('LOOT', (x0) => {
        let lx = x0;
        if (rw[0]) {
          ctx.fillStyle = DARK;
          ctx.fillRect(lx, ty, 6, 6);
          ctx.fillStyle = rw[1];
          ctx.fillRect(lx, ty, 5, 5);
          lx += 8;
          lx += drawText(ctx, rw[0], lx, ty, rw[1]) + 6;
        } else drawText(ctx, 'PARTS', lx, ty, INK);
      });
      // the three strongboxes: a crate for each one caught
      row('CARGO', (x0) => {
        for (let h = 0; h < 3; h++) strongboxIcon(ctx, x0 + h * 9, ty, HEIST);
        drawText(ctx, 'CATCH THEM', x0 + 30, ty, GOLD);
      });
      // taking it down: a richer pick, and its owners' grudge
      row('DOWNED', (x0) => drawText(ctx, 'RARE+ PICK, +SCRAP', x0, ty, '#6ad0ff'));
      if (planet) row('', (x0) => drawText(ctx, `ANGERS ${planet.faction.toUpperCase().replace(/^THE /, '')}`, x0, ty, '#ff8a7a'));
    }
    if (n.kind === 'salvage') {
      const mk = run.market(n);
      if (mk.sells) row('CHEAP', (x0) => drawText(ctx, `${mk.sells!.toUpperCase()}S`, x0, ty, CLASS_COLOR[mk.sells!]));
      if (mk.wants) row('PAYS ×2', (x0) => drawText(ctx, `${mk.wants!.toUpperCase()}S`, x0, ty, CLASS_COLOR[mk.wants!]));
      if (mk.boom) row('NEWS', (x0) => drawText(ctx, `×3 FOR ${mk.boom!.toUpperCase()}S`, x0, ty, GOLD));
      if (!n.planet) row('BUYS', (x0) => drawText(ctx, 'ANYTHING AT ×1.25', x0, ty, GREEN));
    }
    if (n.kind === 'dock') row('GETS', (x0) => drawText(ctx, 'FULL HULL, GOSSIP', x0, ty, INK));
    if (n.planet && run.moodOf(n.planet.faction) <= -2) row('', (x0) => drawText(ctx, 'THEY HATE YOU: +1 DANGER', x0, ty, RED));
    if (run.contract && n.planet?.id === run.contract.planet) row('CRATE', (x0) => drawText(ctx, `DELIVER: +${run.contract!.pay}`, x0, ty, GOLD));

    // what going there opens up next, at the foot of the card
    const then = n.kind === 'gate' ? [] : this.optionsAt(this.depth + 1);
    const jumpRows = then.length ? then.length + 1 : 0;
    const jy = y + room - 6 - jumpRows * 10;
    // what it's like, in the room that's left
    const desc = wrap(unknown ? KIND.event.text : k.text, iw);
    if (n.kind === 'gate') desc.push(...wrap(`${planet!.boss.name}: ${planet!.boss.title}.`, iw));
    else if (planet && n.kind === 'escort') desc.push(...wrap(`BOARDERS FROM ${planet.faction.toUpperCase()}, AND ${planet.enemies[0].name}.`, iw));
    else if (planet && (n.kind === 'raid' || n.kind === 'hunt')) {
      const names = planet.enemies.slice(0, 3).map((e) => e.name);
      desc.push(...wrap(`EXPECT: ${names.join(', ')}.`, iw));
    }
    const fit = Math.max(0, Math.floor((jy - 4 - ty) / 9));
    desc.slice(0, fit).forEach((l, i) => drawText(ctx, l, tx, ty + 1 + i * 9, MUTED));
    ctx.fillStyle = '#3a2e48';
    ctx.fillRect(tx, jy - 4, iw, 1);
    ty = jy;
    if (then.length) {
      // what it opens up next: a line each, its reward (a crown on an elite) and where
      drawText(ctx, then[0].kind === 'gate' ? 'AND THEN' : 'LEADS ON TO', tx, ty, VIOLET);
      ty += 10;
      for (const o of then) {
        const fight = o.kind === 'raid' || o.kind === 'hunt';
        const word = o.kind === 'gate' ? 'THE WARDEN GATE' : o.kind === 'salvage' ? 'DEALER' : payWord(o);
        const col = fight ? this.payColor(o) : this.look(o).color;
        ctx.fillStyle = DARK;
        ctx.fillRect(tx + 2, ty, 6, 6);
        ctx.fillStyle = col;
        ctx.fillRect(tx + 2, ty, 5, 5);
        let lx = tx + 11 + drawText(ctx, word, tx + 11, ty, col) + 5;
        if (o.elite) lx += drawText(ctx, 'ELITE', lx, ty, '#ff8a4a') + 5;
        const where = o.planet?.name ?? (o.kind === 'salvage' ? 'COMET' : '');
        if (where && lx + textWidth(where) <= x + w - 6) drawText(ctx, where, x + w - 6, ty, '#5a5070', { align: 'right' });
        ty += 10;
      }
    }
  }

  dispose() {
    for (const sh of this.ships) sh.dispose();
    for (const p of this.previews.values()) p.dispose();
  }
}
