import * as THREE from 'three';
import type { Game, Screen } from '../game/game';
import type { Run } from '../sim/run';
import { EDGE, HOP, RANGE, type ChartNode, type NodeKind, type Reward } from '../sim/chart';
import { DANGER_PAY, FUEL_MAX, type Run as RunT } from '../sim/run';
import { eventById } from '../sim/events';
import { stats } from '../sim/build';
import { audio } from '../audio';
import { drawText, wrap } from '../ui/font';
import { CLASS_COLOR, CYAN, DARK, DIM, GOLD, GREEN, H, INK, RED, W, frame, hex } from '../ui/hud';
import { backdrop, hearts, hints } from '../ui/widgets';
import { LIVERY, ShipModel } from '../view/ship-model';
import { Stage } from '../view/stage';
import { flat, GEO, part, toon } from '../render/toon';
import { land, toChart, toHangar, caught } from '../game/flow';
import { CARGO } from '../sim/run';
import { clamp, hashStr, lerp, noise2, rng, smoothstep } from '../util';

const MAP_W = 440;
const PANEL_X = MAP_W;

export const KIND: Record<NodeKind, { label: string; glyph: string; color: string; text: string }> = {
  start: { label: 'JUMP POINT', glyph: '·', color: '#8a8098', text: 'Where you came in.' },
  raid: { label: 'RAID', glyph: '×', color: GOLD, text: 'Fly in low and shoot your way through. A part at the end.' },
  run: { label: 'RACE', glyph: '>', color: CYAN, text: 'A fast run through rough country. Fly the rings for scrap.' },
  hunt: { label: 'HUNT', glyph: '★', color: '#ff8a4a', text: 'Elites carrying parts. A hard fight and rich pickings.' },
  salvage: { label: 'SALVAGE', glyph: '+', color: GREEN, text: 'A dealer: buy parts, sell parts, patch the hull, fuel.' },
  dock: { label: 'DOCK', glyph: '♥', color: '#f4ecd8', text: 'Friends. Free repairs, fuel, gossip.' },
  event: { label: 'UNKNOWN', glyph: '?', color: '#c8a0ff', text: 'Something out in the dark. Could be anything. A rumour would tell you.' },
  gate: { label: 'WARDEN GATE', glyph: '▲', color: RED, text: 'The way out of the system, and the thing that guards it.' },
};

/** What a site pays in, as a word and a colour. */
const REWARD: Record<Reward, [string, string]> = {
  gun: ['GUNS', CLASS_COLOR.gun],
  engine: ['ENGINES', CLASS_COLOR.engine],
  power: ['POWER', CLASS_COLOR.power],
  defense: ['DEFENCE', CLASS_COLOR.defense],
  booster: ['BOOSTERS', CLASS_COLOR.booster],
  special: ['SPECIALS', CLASS_COLOR.special],
  scrap: ['SCRAP', GOLD],
  fuel: ['FUEL', '#ffb04a'],
  hull: ['REPAIRS', '#f4ecd8'],
  intel: ['INTEL', '#c8a0ff'],
  trade: ['A MARKET', GREEN],
  none: ['', DIM],
};

const SYSTEMS = ['KAPTEYN DRIFT', 'OLD LANTERN', 'THE ANVIL', 'MERIDIAN REACH', 'SALT NEBULA', 'HOLLOW CROWN', 'NINE WELLS', 'THE ORCHARD'];

/**
 * The star chart: the sector's little solar system turning under you. Jump to anything in range;
 * every jump (or a wait) is a watch, the planets move on, and the Sweep comes across from where
 * you came in. Make the gate before it has you.
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
    const keep = prev ? this.options.indexOf(prev) : -1;
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
      return;
    }
    this.shown = c.time;
    this.ship.update(dt);
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

    ctx.clearRect(0, 0, W, H);
    this.overlay(ctx);
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
    ctx.fillStyle = 'rgba(160,20,40,0.22)';
    ctx.fillRect(0, 0, MAP_W, H);
    // scanlines drifting across it
    ctx.fillStyle = 'rgba(255,60,80,0.12)';
    const off = Math.floor(this.t * 12) % 6;
    for (let y = off; y < H; y += 6) ctx.fillRect(0, y, MAP_W, 1);
    ctx.restore();
    const line = (x: number, color: string, dash: boolean) => {
      const a = this.stage.project(new THREE.Vector3(x, 0, -60));
      const b = this.stage.project(new THREE.Vector3(x, 0, 60));
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
      ctx.fillStyle = color;
      for (let k = 0; k < n; k++) {
        if (dash && k % 4 > 1) continue;
        const f = k / n;
        ctx.fillRect(Math.round(lerp(a.x, b.x, f)), Math.round(lerp(a.y, b.y, f)), 1, 1);
      }
    };
    line(front, '#ff4a5a', false);
    if (!this.anim) line(c.front(t + 1), 'rgba(255,90,100,0.6)', true);
    const fl = this.stage.project(new THREE.Vector3(Math.max(front, -EDGE - 2), 0, -26));
    if (fl.x > 64) drawText(ctx, 'THE SWEEP', fl.x - 4, fl.y, '#ff6a7a', { align: 'right' });

    // range, around the ship: a hop (one fuel) and a long jump (two)
    const sp = this.shipPos();
    if (!this.anim) {
      for (const [rad, col, gap] of [
        [HOP, 'rgba(138,255,224,0.6)', 3],
        [RANGE, 'rgba(255,176,74,0.45)', 2],
      ] as const) {
        ctx.fillStyle = col;
        for (let k = 0; k < 160; k++) {
          if (k % gap === gap - 1) continue;
          const a = (k / 160) * Math.PI * 2;
          const p = this.screen({ x: sp.x + Math.cos(a) * rad, y: sp.y + Math.sin(a) * rad });
          ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
        }
      }
    }
    // planet names (the one on alert in red), and a flag where a crate is going
    c.bodies.forEach((b, i) => {
      if (!b.planet) return;
      const p = this.screen(c.bodyPos(i, t));
      const ny = p.y + b.size * 6 + 10;
      drawText(ctx, b.planet.name, p.x, ny, i === c.alert ? '#c85a6a' : '#6a6080', { align: 'center' });
      if (i === c.alert) drawText(ctx, 'ON ALERT', p.x, ny + 9, '#8a3a4a', { align: 'center' });
      if (this.run.contract?.planet === b.planet.id) drawText(ctx, `CRATE: +${this.run.contract.pay}`, p.x, ny + (i === c.alert ? 18 : 9), GOLD, { align: 'center' });
    });
    // what going to the selected one would cost you: what you couldn't reach afterwards
    const sel = this.anim ? null : this.options[this.sel];
    const lost = sel ? new Set(c.closes(sel)) : new Set<ChartNode>();
    // the nodes
    for (const n of c.nodes) {
      if (n.kind === 'start' && n.id !== c.here) continue;
      const p = this.screen(c.pos(n, t), 0.5);
      const reach = !this.anim && this.options.includes(n);
      const gone = c.swept(n, Math.floor(t));
      const look = this.look(n);
      const col = n.done ? '#3a3448' : gone ? '#5a2a34' : reach ? look.color : '#7a7090';
      this.badge(ctx, p.x, p.y, n.kind === 'gate' ? '▲' : n.done ? '·' : look.glyph, col, reach, n.kind === 'gate' || n.elite);
      if (n.done || gone) continue;
      // danger pips under it, what it pays in to its right
      const d = this.run.danger(n);
      const unknown = n.kind === 'event' && !n.known;
      for (let k = 0; k < (unknown ? 0 : d); k++) {
        ctx.fillStyle = DARK;
        ctx.fillRect(Math.round(p.x) - 5 + k * 4, Math.round(p.y) + 8, 4, 4);
        ctx.fillStyle = d >= 3 ? RED : d === 2 ? '#ff8a4a' : '#c8a060';
        ctx.fillRect(Math.round(p.x) - 5 + k * 4, Math.round(p.y) + 8, 3, 3);
      }
      const rw = REWARD[n.reward];
      if (rw[0] && n.kind !== 'gate' && n.kind !== 'dock' && reach) {
        ctx.fillStyle = DARK;
        ctx.fillRect(Math.round(p.x) + 8, Math.round(p.y) - 3, 5, 5);
        ctx.fillStyle = rw[1];
        ctx.fillRect(Math.round(p.x) + 8, Math.round(p.y) - 3, 4, 4);
      }
      if (lost.has(n)) {
        ctx.fillStyle = RED;
        for (let k = -4; k <= 4; k++) {
          ctx.fillRect(Math.round(p.x) + k, Math.round(p.y) + k, 1, 1);
          ctx.fillRect(Math.round(p.x) + k, Math.round(p.y) - k, 1, 1);
        }
      }
    }
    // the selected one: where it'll be when you get there
    if (sel) {
      const now = this.screen(c.pos(sel, t), 0.5);
      const then = this.screen(c.pos(sel, t + 1), 0.5);
      const s0 = this.screen(sp, 0.5);
      const cost = c.cost(sel);
      ctx.fillStyle = cost > 1 ? '#ffb04a' : GOLD;
      const n = Math.ceil(Math.hypot(then.x - s0.x, then.y - s0.y) / 3);
      for (let k = 1; k < n; k++) {
        const f = k / n;
        if ((k + Math.floor(this.t * 10)) % 3 === 0) continue;
        ctx.fillRect(Math.round(lerp(s0.x, then.x, f)), Math.round(lerp(s0.y, then.y, f)), 1, 1);
      }
      if (Math.hypot(then.x - now.x, then.y - now.y) > 3) {
        ctx.strokeStyle = 'rgba(255,208,74,0.7)';
        ctx.strokeRect(Math.round(then.x) - 4.5, Math.round(then.y) - 4.5, 9, 9);
      }
      const b = 9 + Math.round(Math.sin(this.t * 6));
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
      const label = sel.kind === 'event' && !sel.known ? '???' : sel.name;
      drawText(ctx, label, now.x, now.y - 22, INK, { align: 'center' });
      drawText(ctx, `${'◆'.repeat(cost)}`, now.x, now.y - 31, cost > this.run.fuel ? RED : '#ffb04a', { align: 'center' });
    }
    // a key to the marks
    if (!this.anim) {
      let lx = 8;
      const ly = H - 11;
      lx += drawText(ctx, '◆', lx, ly, '#ffb04a') + 3;
      lx += drawText(ctx, 'FUEL', lx, ly, '#6a6080') + 9;
      ctx.fillStyle = '#ff8a4a';
      ctx.fillRect(lx, ly + 2, 3, 3);
      ctx.fillRect(lx + 4, ly + 2, 3, 3);
      lx += 10;
      lx += drawText(ctx, 'DANGER', lx, ly, '#6a6080') + 9;
      ctx.fillStyle = CLASS_COLOR.gun;
      ctx.fillRect(lx, ly + 1, 4, 4);
      lx += 7;
      lx += drawText(ctx, 'PAYS IN', lx, ly, '#6a6080') + 9;
      lx += drawText(ctx, '?', lx, ly, '#c8a0ff') + 3;
      lx += drawText(ctx, 'UNKNOWN', lx, ly, '#6a6080') + 9;
      lx += drawText(ctx, '=', lx, ly, '#ffd0a0') + 3;
      lx += drawText(ctx, 'PORT OF CALL', lx, ly, '#6a6080') + 9;
      ctx.fillStyle = RED;
      for (let k = -2; k <= 2; k++) {
        ctx.fillRect(lx + 2 + k, ly + 3 + k, 1, 1);
        ctx.fillRect(lx + 2 + k, ly + 3 - k, 1, 1);
      }
      drawText(ctx, 'OUT OF REACH AFTER', lx + 8, ly, '#6a6080');
    }
    // news from the last stop
    if (this.noteT > 0 && this.note) {
      const a = Math.min(1, this.noteT * 3);
      ctx.globalAlpha = a;
      const w = Math.min(MAP_W - 20, this.note.length * 6 + 20);
      frame(ctx, MAP_W / 2 - w / 2, H - 30, w, 18, 'rgba(18,12,24,0.92)', GOLD);
      drawText(ctx, this.note, MAP_W / 2, H - 25, GOLD, { align: 'center' });
      ctx.globalAlpha = 1;
    }
    // a new sector
    if (c.time === 0 && this.t < 4) {
      const a = Math.min(1, this.t * 2) * Math.min(1, (4 - this.t) * 2);
      ctx.globalAlpha = a;
      frame(ctx, MAP_W / 2 - 110, 14, 220, 36, 'rgba(18,12,24,0.85)');
      drawText(ctx, `SECTOR ${this.run.sector + 1}`, MAP_W / 2, 19, DIM, { align: 'center' });
      drawText(ctx, SYSTEMS[(c.seed >>> 3) % SYSTEMS.length], MAP_W / 2, 30, INK, { scale: 2, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  private badge(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: string, color: string, bright: boolean, big: boolean) {
    const r = big ? 7 : 5;
    const px = Math.round(x);
    const py = Math.round(y);
    ctx.fillStyle = DARK;
    ctx.fillRect(px - r - 1, py - r - 1, r * 2 + 3, r * 2 + 3);
    ctx.fillStyle = color;
    ctx.fillRect(px - r, py - r, r * 2 + 1, r * 2 + 1);
    if (bright) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(px - r, py - r, r * 2 + 1, 1);
    }
    drawText(ctx, glyph, px - 2, py - 3, DARK, { shadow: false });
  }

  /** How a node shows on the map: hidden events are a question, known ones what they are. */
  private look(n: ChartNode) {
    const k = KIND[n.kind];
    if (n.kind !== 'event' || !n.known) return k;
    const ev = eventById(n.event ?? 'derelict');
    return { ...k, label: ev.open ? 'PORT OF CALL' : 'KNOWN', glyph: ev.open ? '=' : '!', color: ev.open ? '#ffd0a0' : ev.danger >= 2 ? '#ff8ac8' : '#c8a0ff', text: ev.rumour };
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
    frame(ctx, px, y, pw, 26);
    drawText(ctx, `SECTOR ${run.sector + 1}`, px + 6, y + 4, INK);
    drawText(ctx, `WATCH ${c.time + 1}`, px + pw - 6, y + 4, DIM, { align: 'right' });
    const left = c.watchesLeft(c.nodes[c.here]);
    const sweepText = left <= 1 ? 'THE SWEEP IS ON YOU' : left > 20 ? 'THE SWEEP IS FAR OFF' : `SWEEP HERE IN ${left} WATCHES`;
    drawText(ctx, sweepText, px + 6, y + 14, left <= 1 ? (Math.floor(this.t * 4) % 2 ? RED : INK) : left <= 3 ? '#ff8a7a' : DIM);
    y += 31;
    // the crew, fuel, scrap, and your affairs
    const affairs = this.affairs(run);
    const fh = 26 + run.crew.length * 10 + affairs.length * 9;
    frame(ctx, px, y, pw, fh);
    let ty = y + 4;
    run.crew.forEach((cr, i) => {
      drawText(ctx, `P${i + 1}`, px + 6, ty, hex(LIVERY[i][2]));
      hearts(ctx, cr.hull, stats(cr.build).hp, px + 24, ty, 11);
      drawText(ctx, `${cr.cargo.length}/${CARGO}`, px + pw - 6, ty, DIM, { align: 'right' });
      ty += 10;
    });
    drawText(ctx, 'FUEL', px + 6, ty, DIM);
    for (let k = 0; k < FUEL_MAX; k++) drawText(ctx, '◆', px + 34 + k * 9, ty, k < run.fuel ? '#ffb04a' : '#3a2e48');
    ty += 10;
    drawText(ctx, `SCRAP ${run.scrap}`, px + 6, ty, GOLD);
    drawText(ctx, `${run.score}`, px + pw - 6, ty, DIM, { align: 'right' });
    ty += 10;
    for (const [t, col] of affairs) {
      drawText(ctx, t, px + 6, ty, col);
      ty += 9;
    }
    y += fh + 5;
    // what's selected
    const stuck = !this.options.some((o) => this.run.canJump(c.cost(o))) && c.swept(c.nodes[c.here], c.time + 1);
    const n = this.anim?.to ?? (this.anim ? null : this.options[this.sel]);
    if (stuck) {
      frame(ctx, px, y, pw, 70, '#3a1420', '#6a2430');
      drawText(ctx, 'CAUGHT', px + 6, y + 6, RED, { scale: 2 });
      wrap('The Sweep has you, and there is nowhere you can reach. Fight your way through it: they will chase you all the way to the gate.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 26 + k * 9, INK));
    } else if (n) this.info(ctx, n, px, y, pw, H - 58 - y);
    else if (!this.anim) {
      frame(ctx, px, y, pw, 40);
      wrap('Nothing in range. Drift a watch and let the planets come round.', pw - 12).forEach((l, k) => drawText(ctx, l, px + 6, y + 6 + k * 9, INK));
    }
    // controls
    const dev = this.game.devices[0] ?? 'keys';
    if (this.msgT > 0) drawText(ctx, this.msg, px + pw / 2, H - 62, RED, { align: 'center' });
    if (stuck) hints(ctx, dev, [['confirm', 'FIGHT OUT']], px + pw / 2, H - 20, 'center');
    else if (!this.anim) {
      hints(ctx, dev, [['move', 'AIM'], ['confirm', 'JUMP']], px + pw / 2, H - 48, 'center');
      hints(ctx, dev, [['alt', 'HANGAR']], px + pw / 2, H - 34, 'center');
      hints(ctx, dev, [['back', this.driftAsk > 0 ? 'AGAIN TO DRIFT' : 'DRIFT A WATCH']], px + pw / 2, H - 20, 'center');
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
    for (const f of run.favours) out.push([f === 'doctor' ? 'DR VARGA OWES YOU' : 'BRASK OWES YOU', '#c8a0ff']);
    return out;
  }

  private info(ctx: CanvasRenderingContext2D, n: ChartNode, x: number, y: number, w: number, room: number) {
    const c = this.chart;
    const run = this.run;
    const k = this.look(n);
    const unknown = n.kind === 'event' && !n.known;
    const planet = n.kind === 'gate' ? c.bossPlanet : n.planet;
    const lines: [string, string][] = [];
    const add = (t: string, col: string) => wrap(t, w - 12).forEach((l) => lines.push([l, col]));
    if (planet) lines.push([`${planet.name}: ${planet.faction}`.slice(0, 31), '#c8bcd8']);
    if (n.kind === 'gate') lines.push([planet!.boss.name, RED]);
    // danger and what it pays
    const d = run.danger(n);
    if (!unknown && d > 0) {
      const dw = ['', 'LOW', 'HIGH', 'ELITE'][d];
      lines.push([`DANGER ${dw}${DANGER_PAY[d] > 1 ? `: SCRAP ×${DANGER_PAY[d]}` : ''}`, d >= 3 ? RED : d === 2 ? '#ff8a4a' : '#c8a060']);
      if (n.planet && run.moodOf(n.planet.faction) <= -2) lines.push(['THEY HATE YOU HERE: +1 DANGER', RED]);
    }
    const rw = REWARD[n.reward];
    if (n.kind === 'raid' || n.kind === 'hunt' || n.kind === 'run') lines.push([`PAYS IN: ${rw[0]}${d >= 3 || n.kind === 'hunt' ? ', RARE+' : ''}`, rw[1]]);
    if (n.kind === 'salvage') {
      const mk = run.market(n);
      if (mk.sells) lines.push([`CHEAP: ${mk.sells.toUpperCase()}S`, CLASS_COLOR[mk.sells]]);
      if (mk.wants) lines.push([`PAYS ×2: ${mk.wants.toUpperCase()}S`, CLASS_COLOR[mk.wants]]);
      if (mk.boom) lines.push([`NEWS: ×3 FOR ${mk.boom.toUpperCase()}S`, GOLD]);
      if (!n.planet) lines.push(['BUYS ANYTHING AT ×1.25', GREEN]);
    }
    if (run.contract && n.planet?.id === run.contract.planet) lines.push([`DELIVER THE CRATE: +${run.contract.pay}`, GOLD]);
    add(unknown ? KIND.event.text : k.text, '#a89cb8');
    // the jump: fuel, the Sweep, what it closes off
    const cost = c.cost(n);
    const short = cost - run.fuel;
    lines.push([`JUMP: ${cost} FUEL${short > 0 ? `, BURNS ${short} HULL` : ''}`, short > 0 ? RED : '#ffb04a']);
    const after = (() => {
      for (let k2 = 1; k2 < 20; k2++) if (c.swept(n, c.time + 1 + k2)) return k2;
      return 99;
    })();
    if (n.kind !== 'gate') lines.push([after > 20 ? 'SAFE FROM THE SWEEP' : `${after} WATCH${after === 1 ? '' : 'ES'} AHEAD OF THE SWEEP`, after <= 1 ? RED : after <= 3 ? '#ff8a7a' : GREEN]);
    const lost = c.closes(n).length;
    if (lost) lines.push([`PUTS ${lost} SITE${lost > 1 ? 'S' : ''} OUT OF REACH`, '#ff8a7a']);
    const shown = lines.slice(0, Math.floor((room - 30) / 9));
    frame(ctx, x, y, w, 28 + shown.length * 9);
    drawText(ctx, unknown ? 'UNKNOWN' : k.label, x + 6, y + 5, k.color);
    drawText(ctx, (unknown ? 'SOMETHING IN THE DARK' : n.name).slice(0, 31), x + 6, y + 15, INK);
    shown.forEach(([t, col], i) => drawText(ctx, t, x + 6, y + 27 + i * 9, col));
  }

  dispose() {
    this.ship.dispose();
  }
}
