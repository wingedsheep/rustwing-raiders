import type { Game, Screen } from '../game/game';
import { Level, type LevelSpec } from '../sim/level';
import { DT, type Intent } from '../sim/types';
import { LevelView } from '../view/level-view';
import { Hud } from '../ui/hud';
import { input } from '../input';
import { audio, type Track } from '../audio';
import { newPilot, pilot, type PilotState } from '../sim/pilot';
import type { Build } from '../sim/build';

export interface FlightResult {
  cleared: boolean;
  scrap: number;
  score: number;
  loot: string[][];
  hull: number[];
  stats: { hits: number; grazes: number; kills: number; crashes: number }[];
  /** How it went, for the results: the rank and a line or two on what earned it. */
  report: { rank: string | null; lines: string[] };
}

/**
 * Flying a level: the sim at a steady 60 Hz (held still for hitstop, slowed for the big moments),
 * the view drawn every frame, the HUD over it. ?autopilot hands the stick to the pilot.
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
    this.view = new LevelView(this.lv);
    this.pilots = game.params.has('autopilot') || game.params.has('autorun') ? this.lv.players.map(() => newPilot()) : null;
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
      g.renderer.render(this.view.scene, this.view.camera);
    } else g.pixel.render(this.view.scene, this.view.camera, 0, 0, g.dw, g.dh, g.px, this.view.overlay);
    const names = g.devices.map((d) => input.padName(d));
    this.hud.dw = g.dw;
    this.hud.dh = g.dh;
    this.hud.scale = g.uiScale;
    this.hud.draw(g.ui, this.lv, this.view, names, this.paused);
  }

  dispose() {
    this.view.dispose();
  }
}

/** m:ss */
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** What the results screen says about a level: the race against par, or the fight's tally. */
function report(lv: Level): string[] {
  const out: string[] = [];
  const bonus = lv.parBonus ? `  +${lv.parBonus} SCRAP` : '';
  if (lv.race) {
    const cuts = lv.players.reduce((n, p) => n + p.shortcuts, 0);
    out.push(`TIME ${clock(lv.time + lv.penalty)}  PAR ${clock(lv.parTime)}${bonus}`);
    out.push(`${cuts} SHORTCUT${cuts === 1 ? '' : 'S'} TAKEN${lv.penalty > 0 ? `  +${lv.penalty.toFixed(1)}s TOWED` : ''}`);
  } else if (lv.spawned > 0) {
    const cleared = lv.waves.filter((w) => w.missed === 0 && w.killed === w.total).length;
    out.push(`KILLED ${lv.killed}/${lv.spawned}  WAVES WIPED ${cleared}/${lv.waves.length}${lv.fullClear ? '  FULL CLEAR' : ''}${bonus}`);
    if (lv.bounties || lv.bountiesLost) out.push(`BOUNTIES ${lv.bounties}/${lv.bounties + lv.bountiesLost}`);
  }
  return out;
}
