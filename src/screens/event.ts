import type { Game, Screen } from '../game/game';
import type { Run, Snapshot } from '../sim/run';
import type { ChartNode } from '../sim/chart';
import { isBold, rollLevel, type Beat, type Choice, type Result, type RunEvent, type Scene } from '../sim/events';
import type { Planet } from '../world/planets';
import type { Item } from '../game/loot';
import { castOf, type CastMember } from '../sim/cast';
import { meet, timesMet } from '../sim/memory';
import { audio } from '../audio';
import { bark, hush, preloadVoice, type Bark } from '../voices';
import { input } from '../input';
import { drawText, textWidth, wrap } from '../ui/font';
import { CYAN, DARK, DIM, GOLD, GREEN, H, INK, RED, W, frame, hex } from '../ui/hud';
import { LIVERY } from '../view/ship-model';
import { button, hints, type Action } from '../ui/widgets';
import { Accord, tag } from '../ui/accord';
import { chipRows, TONE_INK } from '../ui/chips';
import { lootCard } from '../ui/loot-card';
import { bestFit } from '../sim/fit';
import { drawArt } from './art';
import { status, surround } from './stops';
import { minigame, type Minigame, type Pad } from './minigames';
import { glow, levelInfo } from './minigames/common';
import { hashStr, rng, smooth } from '../util';

type Phase = 'talk' | 'choose' | 'brief' | 'roll' | 'ready' | 'play' | 'scored' | 'outcome';

const TONE = { good: GREEN, bad: RED, info: CYAN };
/** The narrator's ink, when nobody's talking. */
const NARRATOR = '#e8dcf0';
/** Letters a second for the narrator. */
const NARRATOR_PACE = 85;
const COL_X = 334;
const COL_W = 294;
const ROLL_TIME = 2.1;
/** The countdown before a game: three beats, then GO. */
const COUNT_BEAT = 0.55;
const COUNT_TIME = COUNT_BEAT * 3;
/** The results card: the score counts up, then the grade stamps down, then what made it. */
const COUNT_UP = 0.7;
const STAMP_AT = 0.85;
/** Seconds a game's finish plays before the results card. */
const FINISH_HOLD = 0.9;

/** A score as a grade, in the same steps the events pay out in. */
function grade(s: number) {
  return s >= 0.85
    ? { letter: 'S', word: 'SUPERB!', color: GOLD }
    : s >= 0.55
      ? { letter: 'A', word: 'WELL DONE', color: GREEN }
      : s >= 0.25
        ? { letter: 'C', word: 'SCRAPED BY', color: '#ffb04a' }
        : { letter: 'F', word: 'FAILED', color: RED };
}

/**
 * Something out in the dark, Gazillionaire fashion. The scene is painted big; who's in it gets a
 * name plate in their colour and says their piece in their own voice (a bark, voices.ts), the
 * words arriving at their own pace. Then the choices come in, each with what it costs and pays as
 * chips, a part shown as a card where one's on offer. A gamble is rolled in front of you, the
 * needle sweeping over the odds. A little game comes at a level the event rolls (harder further
 * in), shown up front, with how to play it, before you take it on. Then what came of it:
 * their answer, and every change to your affairs, tallied in a line at a time. Some answers lead
 * to a second beat, and you choose again.
 */
export class EventScreen implements Screen {
  private at = 0;
  /** The level each game choice was rolled at. */
  private levels = new Map<Choice, number>();
  /** Time since the game's result came in. */
  private overT = 0;
  private phase: Phase = 'talk';
  private choices: Choice[] = [];
  private result: Result | null = null;
  private readonly before: Snapshot;
  private changes: { text: string; tone: 'good' | 'bad' | 'info' }[] = [];
  private mini: Minigame | null = null;
  private t = 0;
  /** Time in this phase. */
  private pt = 0;
  private msg = '';
  private msgT = 0;
  private shakeT = 0;
  /** Who's talking now, and what they're saying. */
  private who: string;
  private text: string;
  private lines: string[] = [];
  private readonly scene: Scene;
  private beats = 0;
  private roll = { odds: 0.5, won: true, final: 0.5, last: 0 };
  /** Changes shown so far in the outcome's tally. */
  private shown = 0;
  private fits = new Map<Item, Map<number, ReturnType<typeof bestFit>>>();
  /** Co-op: who wants which answer (a choice's place in the list), or to go on. */
  private accord: Accord<number | 'on'>;
  /** Co-op: who plays the game (whoever took it on). */
  private player = 0;

  constructor(
    private game: Game,
    private run: Run,
    private ev: RunEvent,
    private node: ChartNode,
    private planet: Planet,
    private onDone: (result: Result) => void,
  ) {
    this.before = run.snapshot();
    this.accord = new Accord(run.crew.length);
    this.who = ev.who;
    const again = ev.who ? timesMet(ev.who) : 0;
    this.scene = { node, planet, again };
    this.text = ev.text(run, this.scene);
    if (ev.who) meet(ev.who);
    this.setChoices(ev.choices);
    if (!run.seenEvents.includes(ev.id)) run.seenEvents.push(ev.id);
    this.say(this.text);
    audio.music('map');
    if (this.cast?.voice) {
      preloadVoice(this.cast.voice);
      if (ev.who === 'twins') preloadVoice('vukka');
    }
    this.speak('hello');
    // ?mini: straight into this event's game (&level=1..5 to pick how hard), for testing
    const p = game.params;
    if (p.has('mini')) {
      const k = this.choices.findIndex((c) => c.game && (!p.get('mini') || c.game === p.get('mini')));
      if (k >= 0) {
        this.at = k;
        this.accept();
      }
    }
  }

  /** The level the choice under the cursor's game is at (0 if it isn't a game). */
  private get level() {
    return this.levels.get(this.choices[this.at]) ?? 0;
  }

  private get bold() {
    return isBold(this.level);
  }

  private get cast(): CastMember | null {
    return castOf(this.who);
  }

  private setChoices(cs: Choice[]) {
    this.choices = cs.filter((c) => !c.if || c.if(this.run, this.scene));
    // start on the first one you can take
    this.at = Math.max(0, this.choices.findIndex((c) => !c.locked?.(this.run, this.scene)));
    const want = Number(this.game.params.get('level'));
    this.levels.clear();
    for (const c of this.choices) {
      if (!c.game) continue;
      const level = want >= 1 && want <= 5 ? Math.round(want) : rollLevel(this.run, this.ev, c, this.node.seed ^ hashStr(c.label) ^ (this.beats * 0x3b1));
      this.levels.set(c, level);
    }
  }

  private say(text: string) {
    this.text = text;
    this.lines = wrap(text, 294);
    this.pt = 0;
  }

  private speak(kind: Bark) {
    const v = this.cast?.voice;
    if (!v) return;
    void bark(v, kind);
    // the Twins are two people: the other head always has something to add
    if (this.who === 'twins' && kind === 'hello') setTimeout(() => void bark('vukka', 'hello'), 1500);
  }

  /** Letters of the current text shown so far. */
  private get typed() {
    const pace = this.cast?.pace ?? NARRATOR_PACE;
    return Math.floor(this.pt * pace);
  }

  private get doneTyping() {
    return this.typed >= this.text.length;
  }

  /** The game's controls: the one player who took it on (alone, any device). */
  private pad(): Pad {
    const out: Pad = { x: 0, y: 0, hold: false, press: false };
    const coop = this.game.devices.length > 1;
    const devs = coop ? [this.game.devices[this.player]] : this.game.menuDevices();
    for (const d of devs) {
      const i = input.intent(d);
      if (Math.abs(i.x) > Math.abs(out.x)) out.x = i.x;
      if (Math.abs(i.y) > Math.abs(out.y)) out.y = -i.y;
      out.hold ||= i.fire;
      out.press ||= this.game.menuOf(d).confirm;
    }
    // (alone on the keyboard, Enter holds too; on a shared one it's the other player's)
    if (!coop) out.hold ||= input.keyHeld('Enter');
    return out;
  }

  private choose() {
    const c = this.choices[this.at];
    const why = c.locked?.(this.run, this.scene);
    if (why) {
      this.msg = why;
      this.msgT = 1.6;
      this.shakeT = 0.3;
      audio.play('ui_error');
      if (this.game.params.has('autorun')) this.at = (this.at + 1) % this.choices.length;
      return;
    }
    hush();
    if (c.game) {
      // what it is and how hard, before you commit
      const setup = c.setup?.(this.run, this.bold, this.scene);
      this.mini = minigame(c.game, this.level, this.node.seed ^ (this.level * 0x51) ^ (this.beats * 0x101), setup);
      this.phase = 'brief';
      this.pt = 0;
      audio.play(this.level >= 4 ? 'risk_up' : 'ui_select');
      return;
    }
    if (c.odds) {
      const odds = c.odds(this.run, this.scene);
      const r = rng(this.node.seed ^ 0x0dd5 ^ hashStr(c.label) ^ (this.beats * 977));
      const won = r() < odds;
      // where the needle comes to rest: inside the green if it went your way, the red if not
      const final = won ? r() * odds * 0.9 + odds * 0.05 : odds + (1 - odds) * (0.05 + r() * 0.9);
      this.roll = { odds, won, final, last: 0.5 };
      this.phase = 'roll';
      this.pt = 0;
      audio.play('ui_select');
      return;
    }
    this.finish(1, true);
  }

  /** Take the game on: the countdown, then play. */
  private accept() {
    if (!this.mini) {
      const c = this.choices[this.at];
      const setup = c.setup?.(this.run, this.bold, this.scene);
      this.mini = minigame(c.game!, this.level, this.node.seed ^ (this.level * 0x51) ^ (this.beats * 0x101), setup);
    }
    this.phase = 'ready';
    this.pt = 0;
    audio.play('ui_select');
  }

  private finish(score: number, won: boolean) {
    const c = this.choices[this.at];
    this.result = c.outcome(this.run, {
      ...this.scene,
      r: rng(this.node.seed ^ 0xe7e7 ^ (this.beats * 31)),
      score,
      bold: this.mini ? this.bold : false,
      level: this.mini ? this.level : 0,
      won,
      value: this.mini?.value ?? null,
    });
    this.changes = this.run.changes(this.before);
    this.shown = 0;
    this.phase = 'outcome';
    this.say(this.result.text);
    if (this.result.mood) this.speak(this.result.mood);
    audio.play(this.result.fight ? 'boss_warning' : 'ui_select');
  }

  private next(beat: Beat) {
    this.beats++;
    if (beat.who !== undefined && beat.who !== this.who) {
      this.who = beat.who;
      if (this.cast?.voice) preloadVoice(this.cast.voice);
      this.speak('hello');
    }
    this.result = null;
    this.mini = null;
    this.setChoices(beat.choices);
    this.say(beat.text);
    this.phase = 'talk';
  }

  update(dt: number) {
    this.t += dt;
    this.pt += dt;
    this.msgT -= dt;
    this.shakeT -= dt;
    if (this.phase === 'ready') {
      this.game.menu();
      // a tick on each beat of the countdown, and a kick on GO
      const beat = Math.floor(this.pt / COUNT_BEAT);
      if (beat !== Math.floor((this.pt - dt) / COUNT_BEAT) || this.pt === dt) audio.play(beat >= 3 ? 'ui_select' : 'ui_move', { pitch: beat >= 3 ? 1.3 : 0.9 + beat * 0.1 });
      if (this.pt > COUNT_TIME) {
        this.phase = 'play';
        this.pt = 0;
      }
      return;
    }
    if (this.phase === 'play') {
      const m = this.mini!;
      // once it's over, the game's own finish plays out a moment before the card comes down
      if (m.result === null) this.overT = 0;
      m.update(dt, m.result === null ? this.pad() : { x: 0, y: 0, hold: false, press: false });
      if (m.result !== null && (this.overT += dt) > FINISH_HOLD) {
        this.phase = 'scored';
        this.pt = 0;
      }
      return;
    }
    const ms = this.game.crewMenus();
    this.accord.withdraw(ms);
    const m = this.game.menu();
    if (this.phase === 'scored') {
      // the game goes on ticking, idle, so its sparks settle
      this.mini!.update(dt, { x: 0, y: 0, hold: false, press: false });
      const s = this.mini!.result!;
      // the score ticks up, then the grade stamps down
      if (this.pt < COUNT_UP && Math.floor(this.pt * 20) !== Math.floor((this.pt - dt) * 20)) audio.play('ui_move', { pitch: 0.8 + (this.pt / COUNT_UP) * s * 0.9, vol: 0.5 });
      if (this.pt >= STAMP_AT && this.pt - dt < STAMP_AT) {
        this.shakeT = 0.3;
        audio.play(s >= 0.85 ? 'perfect' : s >= 0.55 ? 'level_clear' : s >= 0.25 ? 'pickup_scrap' : 'player_hit');
      }
      if (m.confirm && this.pt < STAMP_AT) this.pt = STAMP_AT;
      else if (this.pt > 4 || (this.pt > STAMP_AT + 0.3 && m.confirm)) this.finish(s, true);
      return;
    }
    if (this.phase === 'brief') {
      // back to the event's other choices, or into the game
      if (m.back) {
        this.mini = null;
        this.phase = 'choose';
        this.pt = 1;
        audio.play('ui_back');
      } else if (m.confirm && this.pt > 0.25) {
        // whoever takes it on plays it
        this.player = Math.max(0, ms.findIndex((pm) => pm.confirm));
        this.accept();
      }
      return;
    }
    if (this.phase === 'roll') {
      const pos = this.needle();
      // a tick each time the needle crosses from one side of the odds to the other
      if (pos < this.roll.odds !== this.roll.last < this.roll.odds) audio.play('ui_move', { pitch: 0.8 + pos * 0.6 });
      this.roll.last = pos;
      if (this.pt >= ROLL_TIME + 0.7 || (this.pt > ROLL_TIME && m.confirm)) this.finish(1, this.roll.won);
      else if (this.pt >= ROLL_TIME && this.pt - dt < ROLL_TIME) audio.play(this.roll.won ? 'level_clear' : 'player_hit');
      return;
    }
    if (this.phase === 'talk') {
      if (m.confirm || this.doneTyping) {
        this.phase = 'choose';
        this.pt = 0;
      }
      return;
    }
    if (this.phase === 'outcome') {
      // the tally, a line at a time
      const due = Math.min(this.changes.length, Math.floor(Math.max(0, this.pt - 0.35) / 0.16));
      while (this.shown < due) {
        const c = this.changes[this.shown++];
        audio.play(c.tone === 'good' ? 'pickup_scrap' : c.tone === 'bad' ? 'ui_back' : 'ui_move', { vol: 0.7 });
      }
      if (m.confirm) {
        if (!this.doneTyping || this.shown < this.changes.length) {
          this.pt = 99;
          this.shown = this.changes.length;
          return;
        }
        // (co-op: everyone's read it before it moves on)
        if (this.accord.confirm(ms, 'on') === null) return;
        audio.play('ui_select');
        hush();
        const r = this.result!;
        if (r.then && !r.fight) return this.next(r.then);
        this.onDone(r);
      }
      return;
    }
    // choosing
    const n = this.choices.length;
    if (m.up) this.at = (this.at + n - 1) % n;
    if (m.down) this.at = (this.at + 1) % n;
    if (m.up || m.down) audio.play('ui_move');
    if (!m.confirm) return;
    // (an answer you can't give says why at once; one you can is the crew's to agree on)
    if (this.choices[this.at].locked?.(this.run, this.scene) || this.accord.confirm(ms, this.at) !== null) this.choose();
  }

  /** Where the roll's needle is, 0..1 along the bar. */
  private needle() {
    const u = Math.min(1, this.pt / ROLL_TIME);
    const amp = (1 - smooth(u)) * 0.62;
    const p = this.roll.final + amp * Math.sin(this.pt * 13 + 1.3) + amp * 0.4 * Math.sin(this.pt * 29);
    return Math.max(0.005, Math.min(0.995, p));
  }

  // ----------------------------------------------------------------------------------------------
  // Drawing
  // ----------------------------------------------------------------------------------------------

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    surround(ctx);
    const playing = this.phase === 'ready' || this.phase === 'play' || this.phase === 'scored' || this.phase === 'brief';
    this.backdrop(ctx, playing);
    if (this.phase === 'brief') return this.drawBrief(ctx);
    if (playing) return this.drawGame(ctx);
    this.heading(ctx);
    status(ctx, this.run, W - 8, 8);
    this.dialogue(ctx);
    if (this.phase === 'talk') {
      this.foot(ctx, [['confirm', 'GO ON']]);
    } else if (this.phase === 'choose') {
      this.drawChoices(ctx);
      const c = this.choices[this.at];
      this.foot(ctx, [['move', 'CHOOSE'], ['confirm', c.game ? 'SIZE IT UP' : 'DECIDE']]);
    } else if (this.phase === 'roll') {
      this.drawRoll(ctx);
    } else if (this.phase === 'outcome') {
      this.drawOutcome(ctx);
      const r = this.result!;
      this.foot(ctx, [['confirm', r.fight ? 'FIGHT' : r.then ? 'GO ON' : 'ON YOU GO']]);
    }
  }

  /** The hints along the foot; in co-op, once someone's voted, who wants what beside them. */
  private foot(ctx: CanvasRenderingContext2D, items: [Action, string][]) {
    const dev = this.game.hintDevices();
    if (!this.accord.open) {
      hints(ctx, dev, items, W / 2, H - 12, 'center');
      return;
    }
    this.accord.banner(ctx, 8, H - 12, (k) => (k === 'on' ? 'READY TO GO ON' : this.choices[k]?.label ?? ''), this.t, 'left');
    hints(ctx, dev, [...items.filter(([a]) => a !== 'move'), ['back', 'TAKE BACK']], W - 12, H - 12, 'right');
  }

  /** The painting, settling in as the scene opens; darker at the foot, where the words go. */
  private backdrop(ctx: CanvasRenderingContext2D, playing: boolean) {
    const k = smooth(Math.min(1, this.t / 1.1));
    if (k < 1) {
      const s = 1.05 - 0.05 * k;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      drawArt(ctx, this.ev.art, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
      ctx.restore();
    } else drawArt(ctx, this.ev.art, 0, 0, W, H);
    if (playing) {
      ctx.fillStyle = 'rgba(10,7,16,0.78)';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const gr = ctx.createLinearGradient(0, 150, 0, H);
    gr.addColorStop(0, 'rgba(10,7,16,0)');
    gr.addColorStop(0.45, 'rgba(10,7,16,0.72)');
    gr.addColorStop(1, 'rgba(10,7,16,0.94)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 150, W, H - 150);
    const top = ctx.createLinearGradient(0, 0, 0, 56);
    top.addColorStop(0, 'rgba(10,7,16,0.85)');
    top.addColorStop(1, 'rgba(10,7,16,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 56);
    // the first moment: out of black
    if (this.t < 0.6) {
      ctx.fillStyle = `rgba(6,4,10,${1 - this.t / 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** Where it is, what it is, how dangerous. */
  private heading(ctx: CanvasRenderingContext2D) {
    const where = this.node.planet ? `ON ${this.planet.name}` : `DEEP SPACE, NEAR ${this.planet.name}`;
    const x = 14;
    drawText(ctx, where, x, 9, DIM);
    const dx = x + where.length * 6 + 8;
    for (let k = 0; k < 3; k++) drawText(ctx, '◆', dx + k * 7, 9, k < this.ev.danger ? (this.ev.danger >= 2 ? RED : GOLD) : '#3a2e48');
    drawText(ctx, this.ev.title, x, 20, INK, { scale: 2 });
  }

  /** The speaker's plate and their words; returns the top of the box. */
  private dialogue(ctx: CanvasRenderingContext2D) {
    const cast = this.cast;
    const ink = cast?.color ?? NARRATOR;
    const x = 12;
    const w = 314;
    const textH = Math.max(3, this.lines.length) * 10;
    const bottom = H - 26;
    const top = bottom - textH - 16;
    // the box
    ctx.fillStyle = 'rgba(14,10,22,0.88)';
    ctx.fillRect(x, top, w, bottom - top);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, top, w, 1);
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, top, 2, bottom - top);
    ctx.globalAlpha = 1;
    // the plate
    if (cast) {
      const nw = cast.name.length * 6 + 14;
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 1, top - 14, nw + 2, 15);
      ctx.fillStyle = ink;
      ctx.fillRect(x, top - 13, nw, 13);
      drawText(ctx, cast.name, x + 7, top - 10, DARK, { shadow: false });
      drawText(ctx, cast.role, x + nw + 6, top - 10, ink);
      if (this.scene.again && this.beats === 0) {
        // beside the role if there's room, else just above the plate
        const fits = x + nw + 6 + cast.role.length * 6 + 8 + 60 <= x + w;
        if (fits) drawText(ctx, 'MET BEFORE', x + w - 4, top - 10, DIM, { align: 'right' });
        else drawText(ctx, 'MET BEFORE', x + 1, top - 24, DIM);
      }
      // a pulse on the plate while they speak
      if ((this.phase === 'talk' || this.phase === 'outcome') && !this.doneTyping) glow(ctx, x + nw - 4, top - 7, 10, ink, 0.25 + 0.15 * Math.sin(this.t * 20));
    }
    // the words, arriving
    const typing = this.phase === 'talk' || this.phase === 'outcome';
    let left = typing ? this.typed : 1e9;
    let y = top + 8;
    const col = this.phase === 'outcome' && this.result?.fight ? '#ffb0a0' : cast ? INK : NARRATOR;
    for (const l of this.lines) {
      if (left <= 0) break;
      const s = l.slice(0, left);
      drawText(ctx, s, x + 10, y, col);
      left -= l.length + 1;
      y += 10;
    }
    // a caret while there's more coming
    if (typing && !this.doneTyping && Math.floor(this.t * 4) % 2) {
      ctx.fillStyle = ink;
      ctx.fillRect(x + w - 10, bottom - 8, 4, 4);
    }
    return top;
  }

  private cardHeight(c: Choice, on: boolean) {
    let h = 13;
    const chips = c.chips?.(this.run, this.bold && on, this.scene) ?? [];
    const locked = c.locked?.(this.run, this.scene);
    if (chips.length || locked) h += chipRows(null, locked ? [{ icon: 'risk', text: locked, tone: 'bad' }] : chips, 0, 0, COL_W - 16) + 3;
    if (on) {
      const note = c.note?.(this.run, this.bold, this.scene);
      if (note) h += wrap(note, COL_W - 16).slice(0, 2).length * 9 + 2;
      if (c.game) h += 14;
      if (c.odds) h += 7;
    }
    return h + 4;
  }

  private drawChoices(ctx: CanvasRenderingContext2D) {
    const hs = this.choices.map((c, k) => this.cardHeight(c, k === this.at));
    const total = hs.reduce((a, b) => a + b + 3, -3);
    const bottom = H - 26;
    let y = Math.max(70, bottom - total);
    const sel = this.choices[this.at];
    // a part on offer, as a card above the choices
    const it = sel.item?.(this.run, this.scene, this.bold) ?? null;
    if (it && y - 82 > 72) {
      const ch = Math.min(124, y - 82);
      const cy = y - ch - 8;
      // (co-op: what it'd do on each ship in turn, whose it is tagged on the corner)
      const crew = this.run.crew;
      const who = crew.length > 1 ? Math.floor(this.t / 2.5) % crew.length : 0;
      let byWho = this.fits.get(it);
      if (!byWho) this.fits.set(it, (byWho = new Map()));
      let fit = byWho.get(who);
      if (!fit) byWho.set(who, (fit = bestFit(crew[who].build, it)));
      const cx = W - 8 - 184;
      lootCard(ctx, it, crew[who].build, cx, cy, 184, ch, { t: this.t, fit, terse: true, livery: who });
      if (crew.length > 1) {
        tag(ctx, who, cx + 184 - 17, cy + ch - 12);
        crew.forEach((_, i) => {
          ctx.fillStyle = i === who ? hex(LIVERY[i][2]) : '#3a2e48';
          ctx.fillRect(cx + 184 - 26 - (crew.length - 1 - i) * 5, cy + ch - 8, 3, 3);
        });
      }
    }
    this.choices.forEach((c, k) => {
      const on = k === this.at;
      // in from the right, one after another
      const a = smooth(Math.min(1, Math.max(0, (this.pt - k * 0.06) / 0.22)));
      const x = COL_X + Math.round((1 - a) * 24) + (on && this.shakeT > 0 ? Math.round(Math.sin(this.shakeT * 60) * 2) : 0);
      ctx.globalAlpha = a;
      this.card(ctx, c, x, y, hs[k], on);
      ctx.globalAlpha = 1;
      y += hs[k] + 3;
    });
    if (this.msgT > 0) drawText(ctx, this.msg, COL_X + COL_W / 2, 62, RED, { align: 'center' });
  }

  private card(ctx: CanvasRenderingContext2D, c: Choice, x: number, y: number, h: number, on: boolean) {
    const locked = c.locked?.(this.run, this.scene) ?? null;
    const bold = this.bold && on && !!c.game;
    const accent = bold ? '#ff6a5a' : GOLD;
    ctx.fillStyle = on ? (bold ? 'rgba(58,22,34,0.94)' : 'rgba(40,30,58,0.94)') : 'rgba(16,12,24,0.82)';
    ctx.fillRect(x, y, COL_W, h);
    if (on) {
      ctx.fillStyle = accent;
      ctx.fillRect(x, y, 2, h);
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x, y, COL_W, 1);
      ctx.globalAlpha = 1;
      glow(ctx, x, y + h / 2, 22, accent, 0.18);
    }
    const lx = x + 8;
    let ly = y + 4;
    const lw = drawText(ctx, c.label, lx, ly, locked ? '#6a5e78' : on ? accent : INK);
    // co-op: who's picked it
    this.accord.tags(ctx, this.choices.indexOf(c), lx + lw + 6, ly);
    // what kind of choice it is, on the right: a game's level, a gamble's odds
    const lv = this.levels.get(c) ?? 0;
    if (c.game) {
      const info = levelInfo(lv);
      drawText(ctx, info.name, x + COL_W - 6, ly, locked ? '#6a5e78' : info.color, { align: 'right' });
    } else if (c.odds) drawText(ctx, `${Math.round(c.odds(this.run, this.scene) * 100)}%`, x + COL_W - 6, ly, TONE_INK.risk, { align: 'right' });
    ly += 12;
    const chips = c.chips?.(this.run, bold, this.scene) ?? [];
    if (locked || chips.length) ly += chipRows(ctx, locked ? [{ icon: 'risk', text: locked, tone: 'bad' }] : chips, lx, ly, COL_W - 16, !on && !locked) + 3;
    if (!on) return;
    if (c.odds) {
      // the odds as a bar: green for yours, red for theirs
      const odds = c.odds(this.run, this.scene);
      const bw = COL_W - 16;
      ctx.fillStyle = '#3a1a22';
      ctx.fillRect(lx, ly, bw, 3);
      ctx.fillStyle = GREEN;
      ctx.fillRect(lx, ly, Math.round(bw * odds), 3);
      ly += 7;
    }
    const note = c.note?.(this.run, this.bold, this.scene);
    if (note) {
      for (const l of wrap(note, COL_W - 16).slice(0, 2)) {
        drawText(ctx, l, lx, ly, '#a898b8');
        ly += 9;
      }
      ly += 2;
    }
    if (c.game) {
      // how hard it's come: five pips
      drawText(ctx, 'GAME', lx, ly + 2, DIM);
      this.pips(ctx, lx + 30, ly + 1, lv, 9);
      drawText(ctx, this.bold ? 'PAYS THE BIG REWARD' : 'PAYS THE SMALL REWARD', lx + 30 + 5 * 11 + 6, ly + 2, this.bold ? '#ff9a8a' : DIM);
    }
  }

  /** A level as five pips, lit up to it in its colour; the top ones throb. */
  private pips(ctx: CanvasRenderingContext2D, x: number, y: number, level: number, size: number) {
    const info = levelInfo(level);
    for (let k = 0; k < 5; k++) {
      const lit = k < level;
      const px = x + k * (size + 2);
      ctx.fillStyle = DARK;
      ctx.fillRect(px - 1, y - 1, size + 2, size + 2);
      ctx.fillStyle = lit ? info.color : '#2a2236';
      ctx.fillRect(px, y, size, size);
      if (lit) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(px, y, size, 1);
        if (level >= 4 && k === level - 1) glow(ctx, px + size / 2, y + size / 2, size * 1.6, info.color, 0.3 + 0.2 * Math.sin(this.t * 8));
      }
    }
  }

  /** The gamble, in front of you: the odds as a bar, a needle sweeping over it, settling. */
  private drawRoll(ctx: CanvasRenderingContext2D) {
    const c = this.choices[this.at];
    const pw = 340;
    const ph = 84;
    const px = (W - pw) / 2;
    const py = 118;
    const settled = this.pt >= ROLL_TIME;
    ctx.fillStyle = 'rgba(10,7,16,0.55)';
    ctx.fillRect(0, 0, W, H);
    frame(ctx, px, py, pw, ph, 'rgba(18,12,26,0.96)', settled ? (this.roll.won ? GREEN : RED) : '#5a4e68');
    drawText(ctx, c.label, W / 2, py + 8, GOLD, { align: 'center' });
    const bx = px + 20;
    const bw = pw - 40;
    const by = py + 30;
    const gw = Math.round(bw * this.roll.odds);
    ctx.fillStyle = '#1c4a30';
    ctx.fillRect(bx, by, gw, 14);
    ctx.fillStyle = '#4a1a24';
    ctx.fillRect(bx + gw, by, bw - gw, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, bw, 1);
    drawText(ctx, `${Math.round(this.roll.odds * 100)}%`, bx + 4, by + 4, GREEN, { shadow: false });
    drawText(ctx, `${Math.round((1 - this.roll.odds) * 100)}%`, bx + bw - 4, by + 4, '#ff8a7a', { align: 'right', shadow: false });
    // the needle
    const nx = Math.round(bx + this.needle() * bw);
    const ncol = settled ? (this.roll.won ? GREEN : RED) : INK;
    glow(ctx, nx, by + 7, settled ? 26 : 14, ncol, settled ? 0.6 : 0.35);
    ctx.fillStyle = DARK;
    ctx.fillRect(nx - 2, by - 5, 5, 24);
    ctx.fillStyle = ncol;
    ctx.fillRect(nx - 1, by - 4, 3, 22);
    if (settled) {
      const word = this.roll.won ? 'IT GOES YOUR WAY' : "IT DOESN'T";
      const pop = 1 + Math.max(0, 0.25 - (this.pt - ROLL_TIME)) * 2;
      drawText(ctx, word, W / 2, by + 26, this.roll.won ? GREEN : RED, { align: 'center', scale: pop > 1.2 ? 2 : 2 });
    } else drawText(ctx, '...', W / 2, by + 26, DIM, { align: 'center', scale: 2 });
  }

  /** What changed, tallied in a line at a time; and a warning if it's come to a fight. */
  private drawOutcome(ctx: CanvasRenderingContext2D) {
    const r = this.result!;
    const lines = this.changes.slice(0, this.shown);
    const h = 22 + Math.max(1, this.changes.length) * 11 + (r.fight ? 30 : 0);
    const x = COL_X;
    const y = Math.max(70, H - 26 - h);
    ctx.fillStyle = 'rgba(14,10,22,0.9)';
    ctx.fillRect(x, y, COL_W, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x, y, COL_W, 1);
    let ty = y + 7;
    if (this.mini) {
      const info = levelInfo(this.level);
      const head = `${this.mini.title}: ${Math.round(this.mini.result! * 100)}%  `;
      drawText(ctx, head, x + 8, ty, GOLD);
      drawText(ctx, info.name, x + 8 + head.length * 6, ty, info.color);
    } else drawText(ctx, this.changes.length ? 'WHAT CHANGED' : 'NOTHING CHANGED', x + 8, ty, DIM);
    ty += 14;
    lines.forEach((c, k) => {
      const fresh = this.shown === k + 1 && this.pt - 0.35 - k * 0.16 < 0.25;
      const col = TONE[c.tone];
      ctx.fillStyle = col;
      ctx.fillRect(x + 8, ty + 2, 3, 3);
      if (fresh) glow(ctx, x + 10, ty + 3, 16, col, 0.4);
      drawText(ctx, c.text, x + 16 + (fresh ? 2 : 0), ty, col);
      ty += 11;
    });
    if (r.fight) {
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 8);
      ctx.globalAlpha = pulse;
      drawText(ctx, 'INCOMING!', x + COL_W / 2, y + h - 24, RED, { scale: 2, align: 'center' });
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Sizing up a game before you take it on: what it is, how to play, how hard it's come, what's at
   * stake. Take it on, or go back to the event's other choices.
   */
  private drawBrief(ctx: CanvasRenderingContext2D) {
    const m = this.mini!;
    const c = this.choices[this.at];
    const info = levelInfo(this.level);
    const a = smooth(Math.min(1, this.pt / 0.25));
    const pw = 420;
    const how = wrap(m.how, pw - 40);
    const chips = c.chips?.(this.run, this.bold, this.scene) ?? [];
    const chipH = chips.length ? chipRows(null, chips, 0, 0, pw - 40) : 0;
    const note = c.note?.(this.run, this.bold, this.scene);
    const noteL = note ? wrap(note, pw - 40).slice(0, 2) : [];
    const ph = 132 + how.length * 10 + chipH + noteL.length * 9 + (this.run.crew.length > 1 ? 12 : 0);
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2 + (1 - a) * 16);
    ctx.globalAlpha = a;
    const danger = this.level >= 4;
    frame(ctx, px, py, pw, ph, 'rgba(16,11,24,0.97)', info.color);
    if (danger) glow(ctx, px + pw / 2, py, 120, info.color, 0.12 + 0.06 * Math.sin(this.t * 6));
    let y = py + 10;
    drawText(ctx, c.label, W / 2, y, DIM, { align: 'center' });
    y += 12;
    drawText(ctx, m.title, W / 2, y, INK, { scale: 2, align: 'center' });
    y += 22;
    // the level, big, with its pips
    const lw = info.name.length * 12;
    const pipsW = 5 * 13 - 2;
    const rowW = lw + 12 + pipsW;
    const rx = Math.round(W / 2 - rowW / 2);
    const jolt = danger && this.pt < 0.35 ? Math.round(Math.sin(this.pt * 90) * 2 * (1 - this.pt / 0.35)) : 0;
    drawText(ctx, info.name, rx + jolt, y, info.color, { scale: 2 });
    this.pips(ctx, rx + lw + 12, y + 1, this.level, 11);
    y += 20;
    drawText(ctx, `LEVEL ${this.level} OF 5  ·  ${this.bold ? 'PAYS THE BIG REWARD' : 'PAYS THE SMALL REWARD'}`, W / 2, y, this.bold ? '#ff9a8a' : DIM, { align: 'center' });
    y += 14;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(px + 20, y, pw - 40, 1);
    y += 7;
    for (const l of how) {
      drawText(ctx, l, px + 20, y, INK);
      y += 10;
    }
    y += 4;
    if (chips.length) y += chipRows(ctx, chips, px + 20, y, pw - 40) + 3;
    for (const l of noteL) {
      drawText(ctx, l, px + 20, y, '#a898b8');
      y += 9;
    }
    // the one way in
    const bw = 170;
    const bx = Math.round(W / 2 - bw / 2);
    const by = py + ph - 24;
    ctx.fillStyle = DARK;
    ctx.fillRect(bx - 1, by - 1, bw + 2, 17);
    ctx.fillStyle = GREEN;
    ctx.fillRect(bx, by, bw, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(bx, by, bw, 1);
    glow(ctx, bx + bw / 2, by + 7, 50, GREEN, 0.2 + 0.08 * Math.sin(this.t * 7));
    const coop = this.run.crew.length > 1;
    drawText(ctx, coop ? '→ TAKE THE STICK' : '→ TAKE IT ON', bx + bw / 2, by + 4, DARK, { align: 'center', shadow: false });
    // co-op: one of you plays it, the one who takes it on
    if (coop) drawText(ctx, 'ONE OF YOU FLIES IT: WHOEVER TAKES IT ON', W / 2, by - 12, GOLD, { align: 'center' });
    ctx.globalAlpha = 1;
    hints(ctx, this.game.hintDevices(), [['confirm', coop ? "I'LL FLY IT" : 'TAKE IT ON'], ['back', 'BACK TO THE CHOICES']], W / 2, H - 12, 'center');
  }

  private drawGame(ctx: CanvasRenderingContext2D) {
    const m = this.mini!;
    const gx = 80;
    const gy = 64;
    const gw = 480;
    const gh = 240;
    const info = levelInfo(this.level);
    drawText(ctx, m.title, W / 2, 10, GOLD, { scale: 2, align: 'center' });
    const sub = `${this.ev.title}  ·  `;
    const subW = (sub.length + info.name.length) * 6;
    drawText(ctx, sub, W / 2 - subW / 2, 28, DIM);
    drawText(ctx, info.name, W / 2 - subW / 2 + sub.length * 6, 28, info.color);
    wrap(m.how, 470).forEach((l, k) => drawText(ctx, l, W / 2, 40 + k * 10, INK, { align: 'center' }));
    frame(ctx, gx - 2, gy - 2, gw + 4, gh + 4, DARK, this.phase === 'scored' ? grade(m.result!).color : '#5a4e68');
    ctx.save();
    ctx.translate(gx, gy);
    ctx.beginPath();
    ctx.rect(0, 0, gw, gh);
    ctx.clip();
    m.draw(ctx, gw, gh, this.t);
    ctx.restore();
    drawText(ctx, m.status(), W / 2, gy + gh + 8, CYAN, { align: 'center' });
    const coop = this.game.devices.length > 1;
    const dev = this.game.devices[coop ? this.player : 0] ?? 'keys';
    const btn = dev === 'keys' ? 'SPACE' : button(dev, 'confirm');
    if (coop) {
      // who's at the stick, their own keys
      const line = `AT THE STICK  ·  ${button(dev, 'move')} TO MOVE.  ${btn}: THE BUTTON`;
      const x = Math.round(W / 2 - (textWidth(line) + 20) / 2);
      tag(ctx, this.player, x, H - 14);
      drawText(ctx, line, x + 20, H - 14, DIM);
      drawText(ctx, 'AT THE STICK', x + 20, H - 14, hex(LIVERY[this.player][2]));
    } else drawText(ctx, `STICK, D-PAD OR ARROWS TO MOVE.  ${btn}: THE BUTTON`, W / 2, H - 14, DIM, { align: 'center' });
    if (this.phase === 'ready') this.drawCount(ctx, gx, gy, gw, gh);
    // GO lingers a moment into the game, shrinking away
    if (this.phase === 'play' && this.pt < 0.35) {
      ctx.globalAlpha = 1 - this.pt / 0.35;
      drawText(ctx, 'GO!', W / 2, gy + gh / 2 - 16 - Math.round(this.pt * 30), GREEN, { scale: 4, align: 'center' });
      ctx.globalAlpha = 1;
    }
    if (this.phase === 'scored') this.drawScore(ctx, gx, gy, gw, gh);
  }

  /** 3, 2, 1 over the frozen first frame, each beat punching in big and settling. */
  private drawCount(ctx: CanvasRenderingContext2D, gx: number, gy: number, gw: number, gh: number) {
    const beat = Math.floor(this.pt / COUNT_BEAT);
    const f = (this.pt % COUNT_BEAT) / COUNT_BEAT;
    ctx.fillStyle = `rgba(10,7,16,${0.62 - beat * 0.12})`;
    ctx.fillRect(gx, gy, gw, gh);
    drawText(ctx, 'GET READY', W / 2, gy + gh / 2 - 40, INK, { scale: 2, align: 'center' });
    const n = 3 - beat;
    if (n < 1) return;
    const scale = f < 0.12 ? 6 : 4;
    const col = n === 1 ? GREEN : n === 2 ? GOLD : '#ff8a3a';
    glow(ctx, W / 2, gy + gh / 2 + 4, 40 + (1 - f) * 30, col, 0.35 * (1 - f));
    ctx.globalAlpha = f > 0.8 ? (1 - f) * 5 : 1;
    drawText(ctx, `${n}`, W / 2, gy + gh / 2 - (scale === 6 ? 14 : 10), col, { scale, align: 'center' });
    ctx.globalAlpha = 1;
  }

  /**
   * The results card: the score counting up, then the grade stamping down with a jolt, then a
   * line for each thing that made it.
   */
  private drawScore(ctx: CanvasRenderingContext2D, gx: number, gy: number, gw: number, gh: number) {
    const m = this.mini!;
    const s = m.result!;
    const g = grade(s);
    const rows = m.breakdown?.() ?? [];
    const cw = 260;
    const ch = 84 + rows.length * 11;
    const cx = Math.round(gx + (gw - cw) / 2);
    const cy = Math.round(gy + (gh - ch) / 2);
    const a = smooth(Math.min(1, this.pt / 0.2));
    ctx.fillStyle = `rgba(10,7,16,${0.55 * a})`;
    ctx.fillRect(gx, gy, gw, gh);
    ctx.globalAlpha = a;
    const jolt = this.shakeT > 0 ? Math.round(Math.sin(this.shakeT * 80) * 3) : 0;
    frame(ctx, cx + jolt, cy, cw, ch, 'rgba(16,11,24,0.96)', this.pt >= STAMP_AT ? g.color : '#5a4e68');
    // the score, counting up
    const shown = Math.round(s * 100 * smooth(Math.min(1, this.pt / COUNT_UP)));
    drawText(ctx, `${shown}%`, cx + 70 + jolt, cy + 14, INK, { scale: 3, align: 'center' });
    drawText(ctx, 'SCORE', cx + 70 + jolt, cy + 40, DIM, { align: 'center' });
    // the grade, stamped
    if (this.pt >= STAMP_AT) {
      const k = Math.min(1, (this.pt - STAMP_AT) / 0.12);
      const scale = k < 1 ? 7 : 5;
      const lx = cx + cw - 64 + jolt;
      glow(ctx, lx, cy + 28, 44, g.color, 0.4 * (1 - k * 0.5) + (g.letter === 'S' ? 0.1 * Math.sin(this.t * 6) : 0));
      drawText(ctx, g.letter, lx, cy + 28 - (scale * 7) / 2, g.color, { scale, align: 'center' });
      drawText(ctx, g.word, cx + cw / 2 + jolt, cy + 56, g.color, { scale: 1, align: 'center' });
    }
    // what made it
    rows.forEach(([label, value], k) => {
      const at = STAMP_AT + 0.2 + k * 0.12;
      if (this.pt < at) return;
      const ry = cy + 72 + k * 11;
      drawText(ctx, label, cx + 16, ry, DIM);
      drawText(ctx, value, cx + cw - 16, ry, INK, { align: 'right' });
    });
    ctx.globalAlpha = 1;
    if (this.pt > STAMP_AT + 0.3) {
      hints(ctx, this.game.hintDevices(), [['confirm', 'GO ON']], W / 2, gy + gh + 22, 'center');
    }
  }
}
