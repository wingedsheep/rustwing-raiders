import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import { EDGE, type ChartNode, type NodeKind, type Reward } from '../sim/chart';
import { DANGER_PAY, FUEL_MAX, SECTORS, fights, threatTier, type Run as RunT } from '../sim/run';
import { eventById } from '../sim/events';
import { stats } from '../sim/build';
import { audio } from '../audio';
import { drawText, textWidth, wrap } from '../ui/font';
import { CLASS_COLOR, CYAN, DARK, DIM, GOLD, GREEN, H, INK, RED, W, frame, hex } from '../ui/hud';
import { backdrop, haulerIcon, hearts, hints } from '../ui/widgets';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { EncounterPreview } from '../view/encounter-preview';
import { flat, GEO, part, toon } from '../render/toon';
import { drawArt } from './art';
import { land, toChart, toHangar, caught } from '../game/flow';
import { CARGO } from '../sim/run';
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
  raid: { label: 'RAID', icon: 'raid', color: GOLD, text: 'Fly in low and shoot your way through. Pick a part at the end.' },
  hunt: { label: 'HUNT', icon: 'hunt', color: '#ff8a4a', text: 'Elites carrying parts. A hard fight, and rich pickings.' },
  escort: { label: 'ESCORT', icon: 'escort', color: ESCORT, text: 'Fly cover for three haulers. Raiders will try to board them: shoot them off. Every hauler that gets home pays, and brings you a crate.' },
  salvage: { label: 'SALVAGE', icon: 'salvage', color: GREEN, text: 'A dealer: buy parts, sell parts, patch the hull, take on fuel.' },
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

/** What a site pays in, as a word and a colour. */
const REWARD: Record<Reward, [string, string]> = {
  gun: ['GUNS', CLASS_COLOR.gun],
  engine: ['ENGINES', CLASS_COLOR.engine],
  power: ['POWER', CLASS_COLOR.power],
  defense: ['DEFENCE', CLASS_COLOR.defense],
  booster: ['BOOSTERS', CLASS_COLOR.booster],
  special: ['SPECIALS', CLASS_COLOR.special],
  scrap: ['SCRAP', GOLD],
  fuel: ['FUEL', FUEL],
  hull: ['REPAIRS', '#f4ecd8'],
  intel: ['INTEL', VIOLET],
  trade: ['A MARKET', GREEN],
  none: ['', DIM],
};

/** The five steps of threat, easy to brutal. */
const THREAT_COLOR = ['#8affb0', '#d8e060', '#ffb04a', '#ff7a4a', '#ff4a5a'];

const SYSTEMS = ['KAPTEYN DRIFT', 'OLD LANTERN', 'THE ANVIL', 'MERIDIAN REACH', 'SALT NEBULA', 'HOLLOW CROWN', 'NINE WELLS', 'THE ORCHARD'];

/**
 * The star chart: the sector's little solar system turning under you. Jump to anything in range;
 * every jump (or a wait) is a watch, the planets move on, and the Sweep comes across from where
 * you came in. Make the gate before it has you.
 *
 * What you can reach shines and is joined to you by a route (cyan a hop, amber a long jump); the
 * rest sits dim. A strip along the top shows the crossing: you, the Sweep behind, the gate ahead.
 * The card on the right shows the picked site: a picture of what's there, how hard it is, what it
 * pays, and what the jump costs.
 */
export class ChartScreen implements Screen {
  private stage = new Stage(MAP_W, H, 7, 38);
  private bodies: THREE.Object3D[] = [];
  private ship: ShipModel;
  /** The watch being shown (eases towards the chart's). */
  private shown: number;
  private sel = 0;
  private options: ChartNode[] = [];
  private anim: { kind: 'jump' | 'drift'; t: number; to: ChartNode | null; from: { x: number; y: number } } | null = null;
  private driftAsk = 0;
  private t = 0;
  private msg = '';
  private msgT = 0;
  private note = '';
  private noteT = 0;
  private v = new THREE.Vector3();
  /** Pictures of the sites, made as they're first picked. */
  private previews = new Map<number, EncounterPreview>();
  private shownPreview: EncounterPreview | null = null;

  constructor(
    private game: Game,
    private run: Run,
  ) {
    const c = run.chart;
    this.shown = c.time;
    this.build();
    this.ship = new ShipModel(run.crew[0].build, LIVERY[0]);
    this.ship.root.scale.setScalar(0.55);
    this.stage.scene.add(this.ship.root);
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
      const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: b.kind === 'trader' ? 0x3a5a48 : 0x3a3050, depthWrite: false }));
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

  /** Recomputes where you can go. */
  private refresh() {
    const c = this.chart;
    const prev = this.options[this.sel];
    this.options = c.reachable().sort((a, b) => c.along(c.pos(a, c.time + 1)) - c.along(c.pos(b, c.time + 1)));
    // (&site=escort, for testing: that kind of site picked to begin with)
    const site = this.game.params.get('site');
    const keep = prev ? this.options.indexOf(prev) : site ? this.options.findIndex((o) => o.kind === site) : -1;
    // default to the furthest-on thing that isn't the gate, so the obvious move is forward
    this.sel = keep >= 0 ? keep : Math.max(0, this.options.length - 1 - (this.options.length > 1 && this.options[this.options.length - 1].kind === 'gate' ? 1 : 0));
  }

  private say(msg: string) {
    this.msg = msg;
    this.msgT = 2.2;
    audio.play('ui_error');
  }

  update(dt: number) {
    this.t += dt;
    this.msgT -= dt;
    // news from the last stop, one at a time
    this.noteT -= dt;
    if (this.noteT <= 0 && this.run.notes.length) {
      this.note = this.run.notes.shift()!;
      this.noteT = 2.6;
    }
    this.driftAsk -= dt;
    const c = this.chart;
    if (this.anim) {
      const a = this.anim;
      a.t += dt / (a.kind === 'jump' ? 1.1 : 0.7);
      this.shown = c.time + smoothstep(0, 1, a.t);
      if (a.t >= 1) {
        this.anim = null;
        if (a.kind === 'jump') {
          this.run.payJump(c.cost(a.to!));
          c.jump(a.to!);
          this.shown = c.time;
          land(this.game, a.to!);
          return;
        }
        c.drift();
        this.shown = c.time;
        this.refresh();
      }
      this.ship.update(dt);
      this.shownPreview?.update(dt);
      return;
    }
    this.shown = c.time;
    this.ship.update(dt);
    this.shownPreview?.update(dt);
    const m = this.game.menu();
    const stuck = !this.options.some((o) => this.run.canJump(c.cost(o))) && c.swept(c.nodes[c.here], c.time + 1);
    if (stuck) {
      if (m.confirm) {
        audio.play('boss_warning');
        caught(this.game);
      }
      return;
    }
    if (this.options.length) {
      let dir: [number, number] | null = null;
      if (m.left) dir = [-1, 0];
      if (m.right) dir = [1, 0];
      if (m.up) dir = [0, -1];
      if (m.down) dir = [0, 1];
      if (dir) this.steer(dir);
      if (m.prev) this.sel = (this.sel + this.options.length - 1) % this.options.length;
      if (m.next) this.sel = (this.sel + 1) % this.options.length;
      if (dir || m.prev || m.next) audio.play('ui_move');
      if (m.confirm) {
        const to = this.options[this.sel];
        if (!this.run.canJump(c.cost(to))) {
          this.say('NO FUEL, AND TOO LITTLE HULL TO BURN');
          if (this.game.params.has('autorun') && !c.swept(c.nodes[c.here], c.time + 1)) this.anim = { kind: 'drift', t: 0, to: null, from: c.pos(c.nodes[c.here]) };
          return;
        }
        this.anim = { kind: 'jump', t: 0, to, from: c.pos(c.nodes[c.here]) };
        audio.play('warp');
        return;
      }
    } else if (m.confirm) {
      if (this.game.params.has('autorun')) m.back = true;
      this.say('NOTHING IN RANGE: DRIFT AND WAIT');
    }
    if (m.alt) {
      audio.play('ui_select');
      toHangar(this.game, () => toChart(this.game));
      return;
    }
    if (m.back) {
      if (c.swept(c.nodes[c.here], c.time + 1)) this.say('NO TIME TO WAIT: THE SWEEP IS HERE');
      else if (this.driftAsk > 0 || this.game.params.has('autorun')) {
        this.driftAsk = 0;
        this.anim = { kind: 'drift', t: 0, to: null, from: c.pos(c.nodes[c.here]) };
        audio.play('ui_select');
      } else {
        this.driftAsk = 2;
        audio.play('ui_move');
      }
    }
  }

  /** Picks the nearest option in a direction on screen from the one selected. */
  private steer([dx, dy]: [number, number]) {
    const c = this.chart;
    const cur = this.screen(c.pos(this.options[this.sel], c.time + 1));
    const from = { x: cur.x, y: cur.y };
    let best = -1;
    let bs = Infinity;
    this.options.forEach((n, i) => {
      if (i === this.sel) return;
      const p = this.screen(c.pos(n, c.time + 1));
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
    if (best >= 0) this.sel = best;
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


  /** Is it stuck: nowhere it can reach, and the Sweep about to be on it? */
  private get stuck() {
    const c = this.chart;
    return !this.options.some((o) => this.run.canJump(c.cost(o))) && c.swept(c.nodes[c.here], c.time + 1);
  }

  /** The site on the card: where you're going, or what's picked. */
  private get picked(): ChartNode | null {
    return this.anim?.to ?? (this.anim ? null : (this.options[this.sel] ?? null));
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
      this.bodies[i].rotation.y = this.shown * 0.4 + i;
    });
    const sp = this.shipPos();
    this.world(sp, 1.4, this.ship.root.position);
    if (this.anim?.kind === 'jump') {
      const to = this.world(c.pos(this.anim.to!, c.time + 1));
      const from = this.world(this.anim.from);
      this.ship.root.rotation.y = Math.atan2(-(to.x - from.x), -(to.z - from.z));
    } else this.ship.root.rotation.y += 0.01;
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
    this.panel(ctx);
  }

  private overlay(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    const t = this.shown;
    // the Sweep: everything behind its front is lost
    const front = c.front(t);
    const corners = [
      [-60, -60],
      [front, -60],
      [front, 60],
      [-60, 60],
    ].map(([x, z]) => this.stage.project(new THREE.Vector3(x, 0, z)));
    ctx.save();
    ctx.beginPath();
    corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(150,16,36,0.26)';
    ctx.fillRect(0, 0, MAP_W, H);
    // scanlines drifting across it
    ctx.fillStyle = 'rgba(255,60,80,0.1)';
    const off = Math.floor(this.t * 12) % 6;
    for (let y = off; y < H; y += 6) ctx.fillRect(0, y, MAP_W, 1);
    ctx.restore();
    const line = (x: number, color: string, gap: number, width = 1) => {
      const a = this.stage.project(new THREE.Vector3(x, 0, -60));
      const b = this.stage.project(new THREE.Vector3(x, 0, 60));
      for (let w = 0; w < width; w++) dots(ctx, { x: a.x - w, y: a.y }, { x: b.x - w, y: b.y }, w ? 'rgba(255,74,90,0.35)' : color, gap, 0);
    };
    line(front, '#ff4a5a', 9999, 3);
    if (!this.anim) line(c.front(t + 1), 'rgba(255,90,100,0.55)', 3);
    const fl = this.stage.project(new THREE.Vector3(Math.max(front, -EDGE - 2), 0, 22));
    if (fl.x > 64) drawText(ctx, 'THE SWEEP', fl.x - 6, fl.y, '#ff6a7a', { align: 'right' });

    // planet names (the one on alert in red), and a flag where a crate is going
    c.bodies.forEach((b, i) => {
      if (!b.planet) return;
      const p = this.screen(c.bodyPos(i, t));
      const ny = p.y + b.size * 6 + 10;
      drawText(ctx, b.planet.name, p.x, ny, i === c.alert ? '#c85a6a' : '#5a5070', { align: 'center' });
      if (i === c.alert) drawText(ctx, 'ON ALERT', p.x, ny + 9, '#8a3a4a', { align: 'center' });
      if (this.run.contract?.planet === b.planet.id) drawText(ctx, `CRATE: +${this.run.contract.pay}`, p.x, ny + (i === c.alert ? 18 : 9), GOLD, { align: 'center' });
    });

    const sp = this.screen(this.shipPos(), 0.5);
    const sel = this.anim ? null : this.options[this.sel];
    // routes to everything in reach: cyan a hop, amber a long jump
    if (!this.anim)
      for (const o of this.options) {
        if (o === sel) continue;
        const q = this.screen(c.pos(o, t), 0.5);
        dots(ctx, sp, q, c.cost(o) > 1 ? 'rgba(255,176,74,0.32)' : 'rgba(138,255,224,0.38)', 3, 0, 7, 9);
      }

    // the sites: what's out of reach first, dim; then what's in reach, bright
    const lost = sel ? new Set(c.closes(sel)) : new Set<ChartNode>();
    const order = [...c.nodes].sort((a, b) => Number(this.options.includes(a)) - Number(this.options.includes(b)));
    for (const n of order) {
      if (n.kind === 'start' && n.id !== c.here) continue;
      if (n.id === c.here && !this.anim) continue;
      const p = this.screen(c.pos(n, t), 0.5);
      const reach = !this.anim && this.options.includes(n);
      const gone = c.swept(n, Math.floor(t));
      this.token(ctx, p.x, p.y, n, n.done ? 'done' : gone ? 'gone' : reach ? 'reach' : 'far', n === sel);
      if (n.done || gone) continue;
      if (n.kind === 'gate' && !reach) drawText(ctx, 'WARDEN GATE', Math.min(p.x, MAP_W - 4 - textWidth('WARDEN GATE') / 2), p.y + 13, '#a83a4a', { align: 'center' });
      if (!reach) continue;
      // danger pips under it, what it pays in to its right
      const d = this.run.danger(n);
      const unknown = n.kind === 'event' && !n.known;
      const s = n.kind === 'gate' ? 9 : 7;
      for (let k = 0; k < (unknown ? 0 : d); k++) {
        const x = Math.round(p.x) - d * 2 + k * 4 + 1;
        ctx.fillStyle = DARK;
        ctx.fillRect(x - 1, Math.round(p.y) + s + 2, 5, 5);
        ctx.fillStyle = d >= 3 ? RED : d === 2 ? '#ff8a4a' : '#c8a060';
        ctx.fillRect(x, Math.round(p.y) + s + 3, 3, 3);
      }
      const rw = REWARD[n.reward];
      if (rw[0] && n.kind !== 'gate' && n.kind !== 'dock' && n.kind !== 'salvage') {
        ctx.fillStyle = DARK;
        ctx.fillRect(Math.round(p.x) + s + 2, Math.round(p.y) - 3, 6, 6);
        ctx.fillStyle = rw[1];
        ctx.fillRect(Math.round(p.x) + s + 3, Math.round(p.y) - 2, 4, 4);
      }
      if (lost.has(n)) {
        ctx.fillStyle = RED;
        for (let k = -4; k <= 4; k++) {
          ctx.fillRect(Math.round(p.x) + k, Math.round(p.y) + k, 1, 1);
          ctx.fillRect(Math.round(p.x) + k, Math.round(p.y) - k, 1, 1);
        }
      }
    }

    // the selected one: the route, where it'll be when you get there, and its name
    if (sel) {
      const now = this.screen(c.pos(sel, t), 0.5);
      const then = this.screen(c.pos(sel, t + 1), 0.5);
      const cost = c.cost(sel);
      const col = cost > 1 ? FUEL : CYAN;
      dots(ctx, sp, then, col, 4, Math.floor(-this.t * 14) & 3, 7, 6);
      if (Math.hypot(then.x - now.x, then.y - now.y) > 4) {
        dots(ctx, now, then, 'rgba(255,208,74,0.6)', 2, 0, 9, 5);
        ring(ctx, Math.round(then.x), Math.round(then.y), 4, 'rgba(255,208,74,0.8)');
      }
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
      // a name plate, kept on the map
      const look = this.look(sel);
      const label = sel.kind === 'event' && !sel.known ? '???' : sel.name;
      const fuel = '◆'.repeat(cost);
      const w = textWidth(label) + textWidth(fuel) + 16;
      const px = clamp(Math.round(now.x - w / 2), 4, MAP_W - w - 4);
      const py = Math.round(now.y) - b - 18;
      frame(ctx, px, py, w, 13, 'rgba(18,12,24,0.92)', look.color);
      drawText(ctx, label, px + 5, py + 3, INK);
      drawText(ctx, fuel, px + w - 5, py + 3, cost > this.run.fuel ? RED : col, { align: 'right' });
    }
    // where you are
    if (!this.anim) {
      const k = Math.round(9 + Math.sin(this.t * 3));
      ring(ctx, Math.round(sp.x), Math.round(sp.y), k, 'rgba(255,194,74,0.35)');
    }
  }

  /** How a site shows on the map: bright in reach, dim out of it, a dot once it's done or lost. */
  private token(ctx: CanvasRenderingContext2D, x: number, y: number, n: ChartNode, state: 'reach' | 'far' | 'done' | 'gone', sel: boolean) {
    const look = this.look(n);
    const px = Math.round(x);
    const py = Math.round(y);
    if (state === 'done' || state === 'gone') {
      chamfer(ctx, px, py, 3, DARK);
      chamfer(ctx, px, py, 2, state === 'done' ? '#4a4258' : '#6a2a38');
      return;
    }
    const gate = n.kind === 'gate';
    if (state === 'far' && !gate) {
      chamfer(ctx, px, py, 6, DARK);
      chamfer(ctx, px, py, 5, '#3a3048');
      chamfer(ctx, px, py, 4, '#1c1526');
      ctx.globalAlpha = 0.7;
      icon(ctx, look.icon, px - 3, py - 3, look.color);
      ctx.globalAlpha = 1;
      return;
    }
    // the gate always shows (it's where you're going), dimmer while it's out of reach
    const s = gate ? 9 : 7;
    if (state === 'reach') {
      ctx.globalAlpha = sel ? 0.6 : 0.2 + (0.5 + 0.5 * Math.sin(this.t * 3 + n.id)) * 0.2;
      ring(ctx, px, py, s + 3, look.color);
      ctx.globalAlpha = 1;
    }
    if (state === 'far') ctx.globalAlpha = 0.65;
    chamfer(ctx, px, py, s + 1, DARK);
    chamfer(ctx, px, py, s, look.color);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(px - s + 1, py - s, s * 2 - 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px - s + 1, py + s, s * 2 - 1, 1);
    icon(ctx, look.icon, px - 3, py - 3, DARK);
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

  /** The crossing along the top: where you came in, the Sweep behind you, you, the gate. */
  private strip(ctx: CanvasRenderingContext2D) {
    const c = this.chart;
    const t = this.shown;
    const x0 = 10;
    const x1 = MAP_W - 10;
    const y = 6;
    frame(ctx, x0, y, x1 - x0, 17, 'rgba(18,12,24,0.88)');
    drawText(ctx, 'IN', x0 + 6, y + 5, DIM);
    const tx0 = x0 + 24;
    const tx1 = x1 - 52;
    const ty = y + 8;
    const at = (along: number) => Math.round(lerp(tx0, tx1, clamp((along + EDGE) / (EDGE * 2), 0, 1)));
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(tx0, ty - 1, tx1 - tx0, 3);
    // the Sweep, and where it'll be after another watch
    const f = at(c.front(t));
    ctx.fillStyle = '#c8304a';
    ctx.fillRect(tx0, ty - 1, f - tx0, 3);
    ctx.fillStyle = '#ff6a7a';
    ctx.fillRect(tx0, ty - 1, f - tx0, 1);
    if (!this.anim) {
      const f1 = at(c.front(t + 1));
      ctx.fillStyle = 'rgba(255,74,90,0.45)';
      for (let x = f; x < f1; x += 2) ctx.fillRect(x, ty - 1, 1, 3);
    }
    // everything in reach, a tick each, where it'll be when you get there
    const sel = this.anim ? null : this.options[this.sel];
    for (const o of this.anim ? [] : this.options) {
      const x = at(c.along(c.pos(o, t + 1)));
      const col = this.look(o).color;
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 1, ty - 4, 3, 9);
      ctx.fillStyle = col;
      ctx.fillRect(x, ty - 3, 1, 7);
      if (o === sel) {
        ctx.fillStyle = GOLD;
        ctx.fillRect(x - 1, ty - 5, 3, 1);
        ctx.fillRect(x - 1, ty + 5, 3, 1);
      }
    }
    // you
    const sx = at(c.along(this.shipPos()));
    ctx.fillStyle = DARK;
    ctx.fillRect(sx - 3, ty - 4, 7, 9);
    ctx.fillStyle = hex(LIVERY[0][2]);
    for (let k = 0; k < 4; k++) ctx.fillRect(sx - 2 + k, ty - 3 + k, 1, 7 - k * 2);
    // the gate
    const gx = tx1 + 8;
    icon(ctx, 'gate', gx, ty - 3, RED);
    drawText(ctx, 'GATE', gx + 10, y + 5, '#ff8a8a');
  }

  /** A key to the marks, along the bottom. */
  private legend(ctx: CanvasRenderingContext2D) {
    if (this.anim) return;
    const y = H - 9;
    let x = 12;
    for (const k of ['raid', 'hunt', 'escort', 'salvage', 'dock', 'event'] as NodeKind[]) {
      const look = KIND[k];
      chamfer(ctx, x + 5, y, 6, DARK);
      chamfer(ctx, x + 5, y, 5, look.color);
      icon(ctx, look.icon, x + 2, y - 3, DARK);
      x += 13;
      x += drawText(ctx, k === 'event' ? '???' : look.label, x, y - 3, '#8a7ea0') + 9;
    }
    x += 4;
    for (const [cost, col] of [
      [1, CYAN],
      [2, FUEL],
    ] as const) {
      dots(ctx, { x, y }, { x: x + 10, y }, col, 3);
      x += 13;
      x += drawText(ctx, '◆'.repeat(cost), x, y - 3, col) + 9;
    }
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
    if (c.time === 0 && this.t < 5) {
      const a = Math.min(1, this.t * 2) * Math.min(1, (5 - this.t) * 2);
      ctx.globalAlpha = a;
      const w = 262;
      const x = Math.round(MAP_W / 2 - w / 2);
      const y = 34;
      frame(ctx, x, y, w, 60, 'rgba(18,12,24,0.92)', GOLD);
      drawText(ctx, `SECTOR ${this.run.sector + 1} OF ${SECTORS}`, MAP_W / 2, y + 6, DIM, { align: 'center' });
      drawText(ctx, SYSTEMS[(c.seed >>> 3) % SYSTEMS.length], MAP_W / 2, y + 17, INK, { scale: 2, align: 'center' });
      drawText(ctx, 'REACH THE GATE BEFORE THE SWEEP', MAP_W / 2, y + 37, GOLD, { align: 'center' });
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

  /** Height of the status block (the crew, fuel, scrap and your affairs). */
  private statusH() {
    return 26 + this.run.crew.length * 10 + this.affairs(this.run).length * 9;
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
    drawText(ctx, `WATCH ${c.time + 1}`, px + pw - 6, y + 5, DIM, { align: 'right' });
    const left = c.watchesLeft(c.nodes[c.here]);
    const sweepText = left <= 1 ? 'THE SWEEP IS ON YOU' : left > 20 ? 'THE SWEEP IS FAR OFF' : `SWEEP HERE IN ${left} WATCHES`;
    drawText(ctx, sweepText, px + 6, y + 17, left <= 1 ? (Math.floor(this.t * 4) % 2 ? RED : INK) : left <= 3 ? '#ff8a7a' : DIM);
    y += 35;
    // the crew, fuel, scrap, and your affairs
    const affairs = this.affairs(run);
    const fh = this.statusH();
    frame(ctx, px, y, pw, fh);
    let ty = y + 4;
    run.crew.forEach((cr, i) => {
      drawText(ctx, `P${i + 1}`, px + 6, ty, hex(LIVERY[i][2]));
      hearts(ctx, cr.hull, stats(cr.build).hp, px + 24, ty, 11);
      drawText(ctx, `${cr.cargo.length}/${CARGO}`, px + pw - 6, ty, DIM, { align: 'right' });
      ty += 10;
    });
    drawText(ctx, 'FUEL', px + 6, ty, DIM);
    for (let k = 0; k < FUEL_MAX; k++) drawText(ctx, '◆', px + 34 + k * 9, ty, k < run.fuel ? FUEL : '#3a2e48');
    ty += 10;
    drawText(ctx, `SCRAP ${run.scrap}`, px + 6, ty, GOLD);
    drawText(ctx, `${run.score}`, px + pw - 6, ty, DIM, { align: 'right' });
    ty += 10;
    for (const [t, col] of affairs) {
      drawText(ctx, t, px + 6, ty, col);
      ty += 9;
    }
    y = this.cardY();
    const bottom = H - 38;
    const n = this.picked;
    if (this.stuck) {
      frame(ctx, px, y, pw, 70, '#3a1420', '#6a2430');
      drawText(ctx, 'CAUGHT', px + 6, y + 6, RED, { scale: 2 });
      wrap('The Sweep has you, and there is nowhere you can reach. Fight your way through it: they will chase you all the way to the gate.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 26 + k * 9, INK));
    } else if (n) this.card(ctx, n, px, y, pw, bottom - y);
    else if (!this.anim) {
      frame(ctx, px, y, pw, 40);
      wrap('Nothing in range. Drift a watch and let the planets come round.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 6 + k * 9, INK));
    }
    // controls
    const dev = this.game.devices[0] ?? 'keys';
    if (this.msgT > 0) {
      frame(ctx, px, bottom - 14, pw, 13, '#3a1420', '#6a2430');
      drawText(ctx, this.msg, px + pw / 2, bottom - 11, RED, { align: 'center' });
    }
    if (this.stuck) hints(ctx, dev, [['confirm', 'FIGHT OUT']], px + pw / 2, H - 20, 'center');
    else if (!this.anim) {
      hints(ctx, dev, [['move', 'CHOOSE'], ['confirm', 'JUMP']], px + pw / 2, H - 30, 'center');
      hints(ctx, dev, [['alt', 'HANGAR'], ['back', this.driftAsk > 0 ? 'AGAIN TO DRIFT' : 'DRIFT A WATCH']], px + pw / 2, H - 15, 'center');
    }
  }

  /** The things hanging over you, a line each. */
  private affairs(run: RunT): [string, string][] {
    const out: [string, string][] = [];
    if (run.bounty) out.push([`BOUNTY ${run.bounty * 40}: KASPAR HUNTS`, RED]);
    if (run.debt) out.push([`OWE MAMA ${run.debt} (+10%/JUMP)`, '#ff8a7a']);
    if (run.contract) out.push([`CRATE TO ${run.planetName(run.contract.planet)}: ${run.contract.pay}`, GOLD]);
    if (run.policy) out.push([`INSURED: ${run.policy} A HULL`, GREEN]);
    if (run.boom) out.push([`NEWS: ${run.boom.cls.toUpperCase()}S ×3 ON ${run.planetName(run.boom.planet)}`, CYAN]);
    for (const f of run.favours) out.push([f === 'doctor' ? 'DR VARGA OWES YOU' : 'BRASK OWES YOU', VIOLET]);
    return out;
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
    const d = run.danger(n);
    const rw = REWARD[n.reward];
    if (n.kind === 'raid' || n.kind === 'hunt' || n.kind === 'gate') {
      const rich = d >= 3 || n.kind === 'hunt' || n.kind === 'gate';
      row('LOOT', (x0) => {
        let lx = x0;
        if (rw[0] && n.kind !== 'gate') {
          ctx.fillStyle = DARK;
          ctx.fillRect(lx, ty, 6, 6);
          ctx.fillStyle = rw[1];
          ctx.fillRect(lx, ty, 5, 5);
          lx += 8;
          lx += drawText(ctx, rw[0], lx, ty, rw[1]) + 6;
        } else lx += drawText(ctx, 'PARTS', lx, ty, INK) + 6;
        if (n.kind === 'gate') drawText(ctx, 'ONE LEGENDARY', lx, ty, '#ffb03a');
        else if (rich) drawText(ctx, 'RARE+', lx, ty, '#6ad0ff');
      });
      if (DANGER_PAY[d] > 1) row('', (x0) => drawText(ctx, `SCRAP ×${DANGER_PAY[d]}: DANGER PAY`, x0, ty, GOLD));
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
      // the three haulers: a crate (and pay) for each that gets home
      row('CARGO', (x0) => {
        for (let h = 0; h < 3; h++) haulerIcon(ctx, x0 + h * 9, ty, ESCORT);
        drawText(ctx, 'A CRATE EACH', x0 + 30, ty, GOLD);
      });
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

    // the jump, at the foot of the card
    const cost = c.cost(n);
    const short = cost - run.fuel;
    const after = (() => {
      for (let k2 = 1; k2 < 20; k2++) if (c.swept(n, c.time + 1 + k2)) return k2;
      return 99;
    })();
    const closes = c.closes(n).length;
    const jumpRows = 1 + (n.kind !== 'gate' ? 1 : 0) + (closes ? 1 : 0);
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
    row('JUMP', (x0) => {
      const fw = drawText(ctx, '◆'.repeat(cost), x0, ty, cost > 1 ? FUEL : CYAN);
      drawText(ctx, cost > 1 ? 'LONG JUMP' : 'HOP', x0 + fw + 6, ty, DIM);
      if (short > 0) drawText(ctx, `BURNS ${short} HULL`, tx + iw, ty, RED, { align: 'right' });
    });
    if (n.kind !== 'gate') row('SWEEP', (x0) => drawText(ctx, after > 20 ? 'SAFE THERE' : `${after} WATCH${after === 1 ? '' : 'ES'} AHEAD OF IT`, x0, ty, after <= 1 ? RED : after <= 3 ? '#ff8a7a' : GREEN));
    if (closes) row('LOSE', (x0) => drawText(ctx, `${closes} SITE${closes > 1 ? 'S' : ''} OUT OF REACH`, x0, ty, '#ff8a7a'));
  }

  dispose() {
    this.ship.dispose();
    for (const p of this.previews.values()) p.dispose();
  }
}
