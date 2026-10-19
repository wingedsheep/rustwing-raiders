import type { Game, Screen } from '../game/game';
import { Level, type LevelSpec } from '../sim/level';
import { DT, type Intent } from '../sim/types';
import { LevelView } from '../view/level-view';
import { Hud } from '../ui/hud';
import { input } from '../input';
import { audio, type Track } from '../audio';
import { newPilot, pilot, type PilotState } from '../sim/pilot';
import type { Build } from '../sim/build';
import type { PodFate } from '../sim/heist';
import { rollItem, type Item } from '../game/loot';
import { EDGES, type Edge } from '../game/parts';

export interface FlightResult {
  cleared: boolean;
  scrap: number;
  score: number;
  /** Parts picked up, per player, as rolled when they dropped. */
  loot: Item[][];
  hull: number[];
  stats: { hits: number; grazes: number; kills: number; crashes: number }[];
  /** How it went, for the results: the rank and a line or two on what earned it. */
  report: { rank: string | null; lines: string[] };
  /** An escort: which haulers made it (each carried a crate: a card at the results), and their pay. */
  convoy?: { delivered: number; home: boolean[]; paid: number };
  /** A heist: what became of each strongbox (each caught one is a card at the results), and was the runner taken down. */
  heist?: { fate: PodFate[]; downed: boolean; paid: number };
}

/**
 * Flying a level: the sim at a steady 60 Hz (held still for hitstop, slowed for the big moments),
 * the view drawn every frame, the HUD over it. ?autopilot (and ?tour) hands the stick to the pilot.
 */
export class Flight implements Screen {
  readonly fullUI = true;
  readonly lv: Level;
  readonly view: LevelView;
  private hud = new Hud();
  private acc = 0;
  private paused = false;
  private pilots: PilotState[] | null;
  private done = false;

  constructor(
    private game: Game,
    spec: LevelSpec,
    builds: Build[],
    hull: number[] | undefined,
    private onDone: (r: FlightResult) => void,
  ) {
    this.lv = new Level(spec, builds, hull);
    // &tough=8: enemies take eight times the beating (for looking at hits and marks while testing)
    this.lv.tough = Number(game.params.get('tough') ?? 1) || 1;
    // &runner=0.1: a heist's runner that much as tough (to see it go down)
    const rk = Number(game.params.get('runner'));
    if (rk > 0 && this.lv.heist) for (const e of this.lv.enemies) if (e.d.qp) e.hp = e.max = e.max * rk;
    // &crates: a part crate of each tier ahead of you (to see their beacons and catch them)
    if (game.params.has('crates'))
      (['common', 'rare', 'epic', 'legendary'] as const).forEach((tier, k) => {
        this.lv.drop('part', -12 + k * 8, this.lv.scroll - 4, 0, 'rivet');
        const c = this.lv.pickups[this.lv.pickups.length - 1];
        c.part = rollItem(this.lv.rand, k === 3 ? 'scatter' : 'rivet', tier);
        c.vx = c.vz = 0;
      });
    this.view = new LevelView(this.lv);
    this.pilots = game.params.has('autopilot') || game.params.has('autorun') || game.params.has('tour') ? this.lv.players.map(() => newPilot()) : null;
    audio.music(spec.planet.id as Track);
    Object.assign(window, { level: this.lv, view: this.view });
  }

  update(dt: number) {
    const m = this.game.menu();
    if (m.start && this.lv.state !== 'clear' && this.lv.state !== 'failed') {
      this.paused = !this.paused;
      audio.play(this.paused ? 'ui_back' : 'ui_select');
    }
    if (this.paused) {
      if (m.back) {
        this.paused = false;
        this.finish(false);
      }
      return;
    }
    const v = this.view;
    this.acc += dt * v.slowmo;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      this.acc -= DT;
      steps++;
      if (v.hitstop > 0) {
        v.hitstop--;
        continue;
      }
      const intents: Intent[] = this.lv.players.map((p, i) => (this.pilots ? pilot(this.lv, p, this.pilots[i]) : input.intent(this.game.devices[i] ?? 'keys')));
      this.lv.step(intents);
      v.handle(this.lv.events);
      this.lv.events.length = 0;
    }
    v.update(dt * v.slowmo);
    const lv = this.lv;
    if (!this.done && ((lv.state === 'clear' && lv.ending > 4) || (lv.state === 'failed' && lv.ending > 3.5))) this.finish(lv.state === 'clear');
  }

  private finish(cleared: boolean) {
    if (this.done) return;
    this.done = true;
    const lv = this.lv;
    this.onDone({
      cleared,
      scrap: lv.scrap,
      score: lv.score,
      loot: lv.loot,
      hull: lv.players.map((p) => (p.down ? 1 : p.hp)),
      stats: lv.players.map((p) => ({ hits: p.hits, grazes: p.grazes, kills: p.kills, crashes: p.crashes })),
      report: { rank: lv.rank, lines: report(lv) },
      convoy: lv.convoy ? { delivered: lv.convoy.delivered, home: lv.convoy.haulers.map((h) => h.delivered), paid: lv.convoy.paid } : undefined,
      heist: lv.heist ? { fate: [...lv.heist.fate], downed: lv.heist.state === 'down', paid: lv.heist.paid } : undefined,
    });
  }

  draw() {
    const g = this.game;
    this.view.fit(g.dw / g.dh);
    this.view.grade(g.pixel);
    if (g.params.has('nopost')) {
      // the scene as rendered, no outlines or grade (for debugging the look)
      g.renderer.setRenderTarget(null);
      g.renderer.setViewport(0, 0, g.dw, g.dh);
      g.renderer.render(this.view.scene, this.view.eye);
    } else g.pixel.render(this.view.scene, this.view.eye, 0, 0, g.dw, g.dh, g.px, this.view.overlay);
    const names = g.devices.map((d) => input.padName(d));
    this.hud.dw = g.dw;
    this.hud.dh = g.dh;
    this.hud.scale = g.uiScale;
    this.hud.heavyKeys = g.devices.map((d) => input.heavyKey(d));
    this.hud.draw(g.ui, this.lv, this.view, names, this.paused);
  }

  dispose() {
    this.view.dispose();
  }
}

/** What the results screen says about a level: the fight's tally. */
function report(lv: Level): string[] {
  const out: string[] = [];
  if (lv.convoy) {
    const c = lv.convoy;
    out.push(c.delivered ? `HAULERS HOME ${c.delivered}/3  +${c.paid} SCRAP${c.delivered === 3 ? '  CONVOY WHOLE' : ''}` : 'NO HAULER MADE IT HOME');
    const lost = 3 - c.delivered;
    if (lost) out.push(`${lost} CRATE${lost > 1 ? 'S' : ''} LOST WITH ${lost > 1 ? 'THEM' : 'IT'}`);
    return out;
  }
  if (lv.heist) {
    const h = lv.heist;
    out.push(`STRONGBOXES CAUGHT ${h.caught}/3${h.state === 'down' ? `  RUNNER DOWN +${h.paid} SCRAP` : h.state === 'jumped' ? '  THE RUNNER GOT AWAY' : ''}`);
    const fell = h.fate.filter((f) => f === 'fell').length;
    const away = h.fate.filter((f) => f === 'jumped').length;
    if (fell || away) out.push([fell ? `${fell} DROPPED` : '', away ? `${away} JUMPED WITH IT` : ''].filter(Boolean).join('  '));
    return out;
  }
  const bonus = lv.parBonus ? `  +${lv.parBonus} SCRAP` : '';
  if (lv.spawned > 0) {
    const cleared = lv.waves.filter((w) => w.missed === 0 && w.killed === w.total).length;
    out.push(`KILLED ${lv.killed}/${lv.spawned}  WAVES WIPED ${cleared}/${lv.waves.length}${lv.fullClear ? '  FULL CLEAR' : ''}${bonus}`);
    if (lv.bounties || lv.bountiesLost) out.push(`BOUNTIES ${lv.bounties}/${lv.bounties + lv.bountiesLost}`);
  }
  // the edges that came off most: what the guns were flown for
  const edges = new Map<Edge, number>();
  for (const p of lv.players) for (const [e, n] of Object.entries(p.edges) as [Edge, number][]) edges.set(e, (edges.get(e) ?? 0) + n);
  const top = [...edges].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length) out.push(`EDGE CRITS  ${top.map(([e, n]) => `${EDGES[e].name} ${n}`).join('  ')}`);
  return out;
}
