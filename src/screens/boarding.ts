import type { Game, Screen } from '../game/game';
import { ARMS, Boarding, CLOCK, HERO, MEDALS, type BoardResult, type BoardSpec, type Medal } from '../sim/boarding';
import { Cell } from '../sim/deck';
import { DT, type Intent } from '../sim/types';
import { BoardingView } from '../view/boarding-view';
import { BoardBot } from '../sim/board-bot';
import { LIVERY } from '../view/ship-model';
import type { Skin } from '../render/assets';
import { input, type DeviceId } from '../input';
import { audio } from '../audio';
import { drawText, textWidth } from '../ui/font';
import { CYAN, DARK, DIM, EDGE, GOLD, GREEN, HEIST, INK, RED, VIEW, frame, hex } from '../ui/hud';
import { flightButton, type FlightAction } from '../ui/widgets';
import { SoundPanel, SOUND_H, SOUND_W } from '../ui/sound';
import { Quit } from '../ui/accord';
import { icon, iconSize, type Icon } from '../ui/board-icons';
import { clamp } from '../util';

/** A word across the screen for a moment, with its picture: ALARM, LOCKDOWN, KELTERS. */
interface Banner {
  text: string;
  icon: Icon;
  color: string;
  t: number;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const MEDAL_ICON: Record<Medal, Icon> = { ghost: 'ghost', clean: 'clean', full: 'full', core: 'core', quick: 'quick' };
const MEDAL_WORD: Record<Medal, string> = { ghost: 'GHOST', clean: 'CLEAN', full: 'FULL', core: 'CORE', quick: 'QUICK' };
const RANK_COLOR: Record<string, string> = { S: GOLD, A: CYAN, B: INK, C: '#a08aa8' };

/** A button as printed, in a key cap. Returns its width. */
function cap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, align: 'left' | 'center' = 'center', color = INK) {
  const w = textWidth(label) + 6;
  const x0 = Math.round(align === 'center' ? x - w / 2 : x);
  const y0 = Math.round(y);
  ctx.fillStyle = DARK;
  ctx.fillRect(x0 - 1, y0 - 1, w + 2, 13);
  ctx.fillStyle = '#3a2e48';
  ctx.fillRect(x0, y0, w, 11);
  ctx.fillStyle = '#5a4a68';
  ctx.fillRect(x0, y0, w, 1);
  drawText(ctx, label, x0 + 3, y0 + 2, color, { shadow: false });
  return w;
}

/**
 * Boarding a ship on foot: the sim at a steady 60 Hz (feedback never touches the shared clock),
 * the cutaway deck drawn every frame, and a HUD that's mostly pictures: the kelters' clock, the
 * haul, your hide and shells, a map of the deck; and in the world, a button where it's the one
 * to press, a ? over anyone who's glimpsed you. At the end, the marks you earned and the rank.
 */
export class BoardingScreen implements Screen {
  readonly fullUI = true;
  readonly b: Boarding;
  readonly view: BoardingView;
  private acc = 0;
  private paused = false;
  /** Cutting and running, from the pause. */
  private quit: Quit;
  private sound = new SoundPanel();
  private done = false;
  private banners: Banner[] = [];
  private time = 0;
  /** Seconds the controls stay up at the start (gone sooner once you've used them). */
  private teach = 12;
  private fired = false;
  private slid = false;
  private blasted = false;
  /** Flashes of the haul as it's taken: the crates, then the strongbox, then the core. */
  private haulFlash: number[];
  /** Seconds since someone picked the core up (the drop button shows a moment). */
  private carryT = 99;
  /** ?bot: something else plays (for testing). */
  private bot: BoardBot | null;

  constructor(
    private game: Game,
    spec: BoardSpec,
    skin: Skin,
    private onDone: (r: BoardResult) => void,
    frame = 'kestrel',
  ) {
    this.b = new Boarding(spec);
    this.quit = new Quit(Math.max(1, game.devices.length));
    this.view = new BoardingView(this.b, skin, LIVERY, frame);
    this.bot = game.params.has('bot') ? new BoardBot(this.b) : null;
    this.haulFlash = new Array(this.b.crates.length + 2).fill(0);
    Object.assign(window, { board: this.b, boardView: this.view });
  }

  private dev(i: number): DeviceId {
    return this.game.devices[i] ?? 'keys';
  }

  private btn(i: number, a: FlightAction) {
    return flightButton(this.dev(i), a);
  }

  update(dt: number) {
    this.time += dt;
    const b = this.b;
    const ms = this.game.crewMenus();
    const m = this.game.menu();
    if (m.start && b.state !== 'out' && b.state !== 'failed') {
      this.paused = !this.paused;
      this.quit.reset();
      audio.play(this.paused ? 'ui_back' : 'ui_select');
      audio.muffle(this.paused);
      // (Esc is start and back both on the keyboard: the press that pauses isn't a give-up)
      return;
    }
    if (this.paused) {
      if (this.quit.update(ms, dt)) {
        // cut and run: back to your ship with what you're carrying (the kelters don't get you)
        this.paused = false;
        audio.muffle(false);
        b.outcome = 'escaped';
        this.finish();
      } else this.sound.update(m);
      return;
    }
    const v = this.view;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      this.acc -= DT;
      steps++;
      const devs = b.heroes.map((_, i) => this.dev(i));
      const intents: Intent[] = devs.map((d, i) => (this.bot ? this.bot.intent(b.heroes[i]) : input.intent(d)));
      const aims = devs.map((d, i) => {
        const a = input.aim(d);
        if (a) return a;
        // held: keep facing where you face (strafe, backpedal)
        if (intents[i].focus) {
          const h = b.heroes[i];
          return { x: Math.cos(h.face), z: Math.sin(h.face) };
        }
        return null;
      });
      if (intents.some((it) => it.fire)) this.fired = true;
      if (intents.some((it) => it.dash)) this.slid = true;
      if (intents.some((it) => it.heavy)) this.blasted = true;
      b.step(intents, aims);
      this.read(b.events);
      v.handle(b.events);
      b.events.length = 0;
    }
    v.update(dt);
    for (const x of this.banners) x.t += dt;
    this.banners = this.banners.filter((x) => x.t < 2.2);
    for (let i = 0; i < this.haulFlash.length; i++) this.haulFlash[i] = Math.max(0, this.haulFlash[i] - dt * 2);
    this.carryT += dt;
    if (b.state === 'play') this.teach -= dt * (this.fired && this.slid ? 3 : 1);
    // got out: a beat longer, for the marks and the rank
    if (!this.done && (b.state === 'out' || b.state === 'failed') && b.stateT > (b.state === 'out' ? 3.4 + b.medals().length * 0.35 : 3.2)) this.finish();
  }

  /** What in the step deserves the whole screen. */
  private read(events: Boarding['events']) {
    const n = this.b.crates.length;
    for (const e of events) {
      if (e.type === 'alarm') this.banner('ALARM', 'skull', RED);
      else if (e.type === 'core') {
        this.banner('LOCKDOWN', 'core', CYAN);
        this.haulFlash[n + 1] = 1;
      } else if (e.type === 'kelters') this.banner('KELTERS', 'hook', RED);
      else if (e.type === 'escape') this.banner('AWAY', 'lock', GREEN);
      else if (e.type === 'failed') this.banner(e.how === 'caught' ? 'COLLECTED' : 'DOWN', e.how === 'caught' ? 'hook' : 'down', RED);
      else if (e.type === 'crate') this.haulFlash[e.i] = 1;
      else if (e.type === 'strongbox') this.haulFlash[n] = 1;
      else if (e.type === 'carry') this.carryT = 0;
    }
  }

  private banner(text: string, ic: Icon, color: string) {
    this.banners = this.banners.filter((x) => x.text !== text);
    this.banners.push({ text, icon: ic, color, t: 0 });
  }

  private finish() {
    if (this.done) return;
    this.done = true;
    this.onDone(this.b.result());
  }

  draw() {
    const g = this.game;
    this.view.fit(g.dw / g.dh);
    this.view.grade(g.pixel);
    g.pixel.render(this.view.scene, this.view.camera, 0, 0, g.dw, g.dh, g.px, this.view.overlay);
    const ctx = g.ui;
    this.world(ctx);
    this.top(ctx);
    this.heroes(ctx);
    this.map(ctx);
    this.prompts(ctx);
    this.drawBanners(ctx);
    if (this.b.state === 'out') this.marks(ctx);
    if (this.paused) this.pause(ctx);
  }

  private at(x: number, y: number, z: number) {
    return this.view.project(x, y, z, VIEW.w, VIEW.h);
  }

  /** Things hung in the world: the mark you're aimed at, health over the hurt, what they've seen, work rings, words. */
  private world(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const t = this.time;
    // the mark: brackets round whoever your pistol's on
    b.heroes.forEach((h, i) => {
      if (h.down || h.out || h.mark < 0) return;
      const f = b.foes.find((x) => x.id === h.mark);
      if (!f || f.dead) return;
      const p = this.at(f.x, 1.1, f.z);
      const s = Math.round(7 + f.r * 8 + (h.firing ? 0 : Math.sin(t * 8) * 1.5));
      ctx.fillStyle = hex(LIVERY[i][2]);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = Math.round(p.x + sx * s);
        const cy = Math.round(p.y + sy * s);
        ctx.fillRect(sx < 0 ? cx : cx - 3, cy, 4, 1);
        ctx.fillRect(cx, sy < 0 ? cy : cy - 3, 1, 4);
      }
    });
    for (const f of b.foes) {
      if (f.dead || f.state === 'caged') continue;
      const tall = f.kind === 'bruiser' || f.kind === 'warden' || f.kind === 'nurse' ? 0.5 : 0;
      // the crew's hide and plate, once you've drawn blood
      if (f.hp < f.max || f.plate < f.plateMax) {
        const p = this.at(f.x, 2.3 + tall, f.z);
        const w = Math.round(10 + f.max * 1.2);
        const x = Math.round(p.x - w / 2);
        const y = Math.round(p.y);
        ctx.fillStyle = DARK;
        ctx.fillRect(x - 1, y - 1, w + 2, f.plateMax ? 6 : 4);
        ctx.fillStyle = RED;
        ctx.fillRect(x, y, Math.round((w * f.hp) / f.max), 2);
        if (f.plateMax) {
          ctx.fillStyle = f.plate > 0 ? '#c8c0b0' : f.open > 0 && Math.floor(t * 10) % 2 ? GOLD : '#3a3440';
          ctx.fillRect(x, y + 3, Math.round((w * f.plate) / f.plateMax), 2);
        }
      }
      // what it's glimpsed: a ? filling up; asleep, a z drifting up
      if (!f.aware && f.kind !== 'skulk') {
        const p = this.at(f.x, 2.5 + tall, f.z);
        if (f.asleep) {
          const k = (t * 0.6 + f.id * 0.37) % 1;
          ctx.globalAlpha = 1 - k;
          drawText(ctx, 'z', p.x + 3 + k * 5, p.y - k * 8, DIM, { align: 'center' });
          ctx.globalAlpha = 1;
        } else if (f.sus > 0.02) this.suspicion(ctx, p.x, p.y - 4, f.sus);
      }
      // OPEN: the slide button, over its head
      if (f.open > 0 && Math.floor(t * 6) % 3) {
        const p = this.at(f.x, 2.9 + tall, f.z);
        cap(ctx, this.btn(this.nearestHero(f.x, f.z), 'dash'), p.x, p.y - 6, 'center', GOLD);
      }
    }
    // work: a ring filling over the head, with the picture of what's being worked
    b.heroes.forEach((h) => {
      if (!h.work || h.down || h.out) return;
      const p = this.at(h.x, 2.6, h.z);
      const k = clamp(h.work.t, 0, 1);
      const kind = h.work.kind;
      const ic: Icon = kind === 'leave' ? 'lock' : kind === 'revive' ? 'clean' : kind === 'core' || kind === 'heart' ? 'core' : kind === 'strongbox' ? 'strongbox' : 'crate';
      const color = kind === 'core' || kind === 'heart' ? CYAN : kind === 'strongbox' ? GOLD : kind === 'leave' || kind === 'revive' ? GREEN : HEIST;
      this.ring(ctx, p.x, p.y - 4, 9, k, color);
      const sz = iconSize(ic);
      icon(ctx, ic, p.x - sz.w / 2, p.y - 4 - sz.h / 2);
    });
    // a partner down: how long they've got, and that you can haul them up
    b.heroes.forEach((h) => {
      if (!h.down || h.out || b.heroes.length < 2) return;
      const p = this.at(h.x, 1.6, h.z);
      const k = clamp(h.bleed / HERO.bleed, 0, 1);
      this.ring(ctx, p.x, p.y, 10, k, k < 0.3 && Math.floor(t * 6) % 2 ? '#ffffff' : RED);
      icon(ctx, 'down', p.x - 4, p.y - 3);
    });
    // a hook in you: slide to snap it; the core in your arms: blast to set it down (a moment)
    b.heroes.forEach((h, i) => {
      if (h.down || h.out) return;
      const p = this.at(h.x, 2.9, h.z);
      if (h.hook && Math.floor(t * 8) % 2) cap(ctx, this.btn(i, 'dash'), p.x, p.y - 6, 'center', RED);
      else if (h.carry && this.carryT < 3.5) cap(ctx, this.btn(i, 'heavy'), p.x + 10, p.y - 6, 'center', CYAN);
      if (h.jam > 0) icon(ctx, 'spores', p.x - 16, p.y - 6);
    });
    // arms on the deck: what it is, over it; with your hands full, the button to swap
    for (const a of b.arms) {
      let near = -1;
      let nd = 6;
      b.heroes.forEach((h, i) => {
        const dd = Math.hypot(h.x - a.x, h.z - a.z);
        if (!h.down && !h.out && dd < nd) {
          nd = dd;
          near = i;
        }
      });
      if (near < 0) continue;
      const p = this.at(a.x, 1.3, a.z);
      const bob = Math.round(Math.sin(t * 4 + a.id) * 1.5);
      const sz = iconSize(`arm_${a.kind}`);
      icon(ctx, `arm_${a.kind}`, p.x - sz.w / 2, p.y - 8 + bob);
      if (b.heroes[near].arm && nd < 1.6) cap(ctx, this.btn(near, 'special'), p.x, p.y - 22 + bob, 'center', GOLD);
    }
    // the words that pop
    for (const p of this.view.pops) {
      const k = p.t / p.life;
      const s = this.at(p.x, p.y + k * 0.8, p.z);
      const scale = p.big ? (k < 0.12 ? 3 : 2) : 1;
      if (k > 0.75 && Math.floor(p.t * 20) % 2) continue;
      drawText(ctx, p.text, s.x, s.y - 4 * scale, p.color, { scale, align: 'center' });
    }
    // off the screen: arrows to the lock (when it's time) and to loot not yet taken
    const going = b.kelters || b.crates.every((c) => c.open) || !!b.carrier;
    const d = b.deck;
    if (going && b.state === 'play') this.arrow(ctx, d.breach.x, d.breach.z, GREEN, 'lock', true);
    for (const c of b.crates) if (!c.open && b.visited.has(d.roomAt(c.prop.x, c.prop.z))) this.arrow(ctx, c.prop.x, c.prop.z, HEIST, null, false);
    if (b.strongbox && !b.strongbox.open && b.visited.has(d.roomAt(b.strongbox.prop.x, b.strongbox.prop.z))) this.arrow(ctx, b.strongbox.prop.x, b.strongbox.prop.z, GOLD, null, false);
    if (b.heart && b.heart.carrier < 0) this.arrow(ctx, b.heart.x, b.heart.z, CYAN, 'core', true);
  }

  private nearestHero(x: number, z: number) {
    let best = 0;
    let bd = Infinity;
    this.b.heroes.forEach((h, i) => {
      const dd = Math.hypot(h.x - x, h.z - z);
      if (!h.down && !h.out && dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  }

  /** A ? that fills from the bottom, amber, then red: what a crewman's glimpsed of you. */
  private suspicion(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
    const bmp = ['.###.', '#...#', '....#', '...#.', '..#..', '..#..', '.....', '..#..'];
    const x0 = Math.round(x - 2);
    const y0 = Math.round(y - 8);
    const fill = Math.round(k * bmp.length);
    const hot = k > 0.7 ? (Math.floor(this.time * 12) % 2 ? RED : GOLD) : GOLD;
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < 5; c++) {
        if (bmp[r][c] !== '#') continue;
        ctx.fillStyle = DARK;
        ctx.fillRect(x0 + c - 1, y0 + r, 3, 1);
      }
    for (let r = 0; r < bmp.length; r++)
      for (let c = 0; c < 5; c++) {
        if (bmp[r][c] !== '#') continue;
        ctx.fillStyle = bmp.length - r <= fill ? hot : '#6a5a78';
        ctx.fillRect(x0 + c, y0 + r, 1, 1);
      }
  }

  /** A ring of pips round (x, y), `k` of it lit. */
  private ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, color: string) {
    const n = 20;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * r);
      const py = Math.round(y + Math.sin(a) * r);
      ctx.fillStyle = DARK;
      ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.fillStyle = i / n < k ? color : '#3a3048';
      ctx.fillRect(px, py, 2, 2);
    }
  }

  private arrow(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, ic: Icon | null, always: boolean) {
    const p = this.at(x, 1, z);
    const m = 18;
    const inside = p.x > m && p.x < VIEW.w - m && p.y > 40 && p.y < VIEW.h - m;
    if (inside) {
      if (always && ic) {
        const bob = Math.round(Math.sin(this.time * 6) * 2);
        const sz = iconSize(ic);
        icon(ctx, ic, p.x - sz.w / 2, p.y - 30 + bob);
        ctx.fillStyle = color;
        for (let i = 0; i < 3; i++) ctx.fillRect(Math.round(p.x - 2 + i), p.y - 20 + bob + i, 5 - i * 2, 1);
      }
      return;
    }
    const cx = VIEW.w / 2;
    const cy = VIEW.h / 2;
    const a = Math.atan2(p.y - cy, p.x - cx);
    const ex = clamp(cx + Math.cos(a) * VIEW.w, m, VIEW.w - m);
    const ey = clamp(cy + Math.sin(a) * VIEW.h, 40, VIEW.h - m);
    ctx.fillStyle = color;
    for (let i = 0; i < 5; i++) {
      const r = 5 - i;
      ctx.fillRect(Math.round(ex + Math.cos(a) * i * 1.2), Math.round(ey + Math.sin(a) * i * 1.2), 1, 1);
      for (let k = -r; k <= r; k++) ctx.fillRect(Math.round(ex + Math.cos(a) * (i - 2) - Math.sin(a) * k * 0.6), Math.round(ey + Math.sin(a) * (i - 2) + Math.cos(a) * k * 0.6), 1, 1);
    }
    if (ic) {
      const sz = iconSize(ic);
      icon(ctx, ic, ex - Math.cos(a) * 16 - sz.w / 2, ey - Math.sin(a) * 14 - sz.h / 2);
    }
  }

  /** The clock across the top (the hook, then your lock), and the haul. */
  private top(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const t = this.time;
    const mid = VIEW.w / 2;
    const docked = b.dock >= 0;
    const left = b.timeLeft;
    const max = docked ? CLOCK.dock : b.clockMax;
    const urgent = left < 10;
    const w = 120;
    const x = Math.round(mid - w / 2 + 8);
    frame(ctx, x - 22, 4, w + 30, 22);
    const blink = Math.floor(t * 4) % 2 === 0;
    icon(ctx, docked ? 'lock' : 'hook', x - 16, 9, 1, false, docked && urgent && blink);
    const color = docked ? RED : urgent ? (blink ? RED : INK) : b.alarmed ? '#ff9a6a' : INK;
    drawText(ctx, mmss(left), x + w, 8, color, { align: 'right' });
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(x, 18, w, 4);
    ctx.fillStyle = docked ? RED : urgent ? RED : b.alarmed ? '#ff9a6a' : GOLD;
    ctx.fillRect(x, 18, Math.round((w * clamp(left / max, 0, 1)) || 0), 4);
    // the marks where the alarm and the core would bite
    if (!docked) {
      ctx.fillStyle = DARK;
      for (const cut of [CLOCK.alarm, CLOCK.lockdown]) {
        const k = (left - cut) / max;
        if (k > 0) ctx.fillRect(x + Math.round(w * k), 18, 1, 4);
      }
    }
    // the haul, at the right
    const n = b.crates.length;
    const hw = n * 13 + 13 + 13 + 44;
    const hx = VIEW.w - 8;
    frame(ctx, hx - hw, 4, hw, 22);
    let cx = hx - hw + 6;
    b.crates.forEach((c, i) => {
      icon(ctx, 'crate', cx, 11, 1, !c.open, this.haulFlash[i] > 0 && Math.floor(this.haulFlash[i] * 12) % 2 === 1);
      cx += 13;
    });
    if (b.strongbox) {
      icon(ctx, 'strongbox', cx, 11, 1, !b.strongbox.open, this.haulFlash[n] > 0 && Math.floor(this.haulFlash[n] * 12) % 2 === 1);
      cx += 13;
    }
    if (b.core) {
      const got = b.coreOut;
      icon(ctx, 'core', cx, 11, 1, !b.heart, (this.haulFlash[n + 1] > 0 && Math.floor(this.haulFlash[n + 1] * 12) % 2 === 1) || (!!b.heart && !got && blink && !b.carrier));
      cx += 13;
    }
    const tins = b.heroes.reduce((s, h) => s + h.tins, 0) + (b.strongbox?.open ? b.pay : 0);
    icon(ctx, 'tin', hx - 10, 12);
    drawText(ctx, `${tins}`, hx - 13, 11, GOLD, { align: 'right' });
  }

  /** Each of you: hide, shells, and what's on you (a hook, spores, the core). */
  private heroes(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    b.heroes.forEach((h, i) => {
      const x0 = 8;
      const y0 = 4 + i * 26;
      frame(ctx, x0, y0, 92, 22);
      const col = hex(LIVERY[i][2]);
      ctx.fillStyle = col;
      ctx.fillRect(x0 + 3, y0 + 3, 2, 16);
      if (h.out) {
        icon(ctx, 'lock', x0 + 10, y0 + 7, 1, true);
        drawText(ctx, 'ABOARD YOURS', x0 + 22, y0 + 8, DIM);
        return;
      }
      // hide: pips
      for (let k = 0; k < HERO.hp; k++) {
        const x = x0 + 9 + k * 9;
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y0 + 4, 8, 7);
        const lit = k < h.hp;
        ctx.fillStyle = h.down ? '#3a2e48' : lit ? (h.hp <= 1 && Math.floor(this.time * 6) % 2 ? '#ffffff' : RED) : '#3a2436';
        ctx.fillRect(x + 1, y0 + 5, 6, 5);
        if (lit) {
          ctx.fillStyle = '#ffa090';
          ctx.fillRect(x + 2, y0 + 6, 2, 1);
        }
      }
      // shells for the blast, coming back one at a time
      for (let k = 0; k < HERO.shells; k++) {
        const x = x0 + 9 + k * 7;
        const has = k < h.shells;
        ctx.fillStyle = has ? '#ff8a3a' : '#3a2e48';
        ctx.fillRect(x, y0 + 13, 5, 6);
        ctx.fillStyle = has ? '#ffd04a' : '#2a2236';
        ctx.fillRect(x, y0 + 13, 5, 2);
        if (!has && k === h.shells) {
          ctx.fillStyle = '#ff8a3a';
          ctx.fillRect(x, y0 + 19, Math.round(5 * clamp(1 - h.shellT / HERO.reload, 0, 1)), 1);
        }
      }
      // what's on you
      let sx = x0 + 9 + HERO.shells * 7 + 4;
      const blink = Math.floor(this.time * 8) % 2 === 0;
      if (h.down) {
        icon(ctx, 'down', sx, y0 + 12, 1, false, blink);
        sx += 11;
      }
      if (h.hook) {
        icon(ctx, 'hook', sx, y0 + 12, 1, false, blink);
        sx += 10;
      }
      if (h.jam > 0) {
        icon(ctx, 'spores', sx, y0 + 12);
        sx += 10;
      }
      if (h.carry) icon(ctx, 'core', sx, y0 + 12);
      // what's in your hand, and what's left in it
      if (h.arm) {
        const ax = x0 + 62;
        icon(ctx, `arm_${h.arm}`, ax, y0 + 4);
        const k = h.ammo / ARMS[h.arm].ammo;
        ctx.fillStyle = DARK;
        ctx.fillRect(ax - 1, y0 + 14, 27, 4);
        ctx.fillStyle = k < 0.25 && blink ? '#ffffff' : k < 0.25 ? RED : GOLD;
        ctx.fillRect(ax, y0 + 15, Math.max(1, Math.round(25 * k)), 2);
      }
    });
  }

  /** The deck from above, a texel a cell: where you've been, what's lit, the way out. */
  private map(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const d = b.deck;
    const s = 2;
    const w = d.w * s;
    const h = d.h * s;
    const x0 = VIEW.w - 8 - w;
    const y0 = VIEW.h - 8 - h;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = DARK;
    ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = EDGE;
    ctx.fillRect(x0 - 3, y0 - 3, w + 6, 1);
    for (let z = 0; z < d.h; z++)
      for (let x = 0; x < d.w; x++) {
        const c = d.cell(x, z);
        if (c === Cell.Space) continue;
        if (c === Cell.Wall) {
          ctx.fillStyle = '#3a3048';
        } else {
          const room = d.roomAt(x + 0.5, z + 0.5);
          const seen = b.visited.has(room);
          ctx.fillStyle = seen ? (b.alarmed ? '#5a3040' : '#4a4260') : '#241c30';
        }
        ctx.fillRect(x0 + x * s, y0 + z * s, s, s);
      }
    const dot = (x: number, z: number, color: string, big = false) => {
      ctx.fillStyle = color;
      const r = big ? 2 : 1;
      ctx.fillRect(Math.round(x0 + x * s - r), Math.round(y0 + z * s - r), r * 2, r * 2);
    };
    const blink = Math.floor(this.time * 4) % 2 === 0;
    // the loot (you know the manifest: you came for it)
    for (const c of b.crates) if (!c.open) dot(c.prop.x, c.prop.z, HEIST, true);
    if (b.strongbox && !b.strongbox.open) dot(b.strongbox.prop.x, b.strongbox.prop.z, GOLD, true);
    if (b.core && !b.core.open) dot(b.core.prop.x, b.core.prop.z, CYAN, true);
    if (b.heart && b.heart.carrier < 0 && blink) dot(b.heart.x, b.heart.z, CYAN, true);
    // the gates, the cages, the tear
    for (const g of b.gates) if (g.on) dot(g.gate.door.x, g.gate.door.z, '#4ae8ff');
    for (const c of b.cages) if (!c.open) dot(c.prop.x, c.prop.z, '#ff8a3a');
    if (d.rupture) dot(d.rupture.x, d.rupture.z, b.venting && blink ? '#ffffff' : '#ff7a3a', true);
    // the crew you've seen awake
    for (const f of b.foes) if (!f.dead && f.state !== 'caged' && (f.aware || f.kind === 'kelter') && b.visited.has(d.roomAt(f.x, f.z))) dot(f.x, f.z, f.kind === 'kelter' ? '#ff3a3a' : f.kind === 'skulk' ? '#ff6aa8' : '#ff8a6a');
    if (b.kelters && blink) dot(b.kelters.x, b.kelters.z, '#ff3a3a', true);
    // the lock
    dot(d.breach.x, d.breach.z, GREEN, true);
    b.heroes.forEach((hh, i) => {
      if (!hh.out && (blink || !hh.down)) dot(hh.x, hh.z, hex(LIVERY[i][2]), true);
    });
  }

  /** At the start: the three buttons. Then nothing: the world says the rest. */
  private prompts(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    if (b.state === 'intro') {
      const k = clamp(b.stateT / 0.4, 0, 1);
      drawText(ctx, 'BOARDING', VIEW.w / 2, VIEW.h / 2 - 40, INK, { scale: 3, align: 'center' });
      if (k >= 1) {
        // her state, as a picture under the word
        const cond = b.condition === 'none' ? null : (b.condition as Icon);
        const fam = b.family as Icon;
        const items: Icon[] = cond ? [fam, cond] : [fam];
        const tw = items.length * 22 - 4;
        items.forEach((ic, i) => {
          const sz = iconSize(ic, 2);
          icon(ctx, ic, VIEW.w / 2 - tw / 2 + i * 22 + (18 - sz.w) / 2, VIEW.h / 2 - 8, 2);
        });
      }
      return;
    }
    if (b.state !== 'play' || this.teach <= 0) return;
    ctx.globalAlpha = clamp(this.teach, 0, 1);
    const items: [FlightAction, string, boolean][] = [
      ['fire', 'SHOOT', this.fired],
      ['dash', 'SLIDE', this.slid],
      ['heavy', 'BLAST', this.blasted],
    ];
    const caps = items.map(([a]) => this.btn(0, a));
    const widths = items.map(([, w], i) => textWidth(caps[i]) + 6 + 4 + textWidth(w));
    const total = widths.reduce((a, x) => a + x, 0) + (items.length - 1) * 14;
    let x = VIEW.w / 2 - total / 2;
    const y = VIEW.h - 30;
    items.forEach(([, word, used], i) => {
      const cw = cap(ctx, caps[i], x, y, 'left', used ? DIM : INK);
      drawText(ctx, word, x + cw + 4, y + 2, used ? DIM : INK);
      x += widths[i] + 14;
    });
    ctx.globalAlpha = 1;
  }

  private drawBanners(ctx: CanvasRenderingContext2D) {
    for (const x of this.banners) {
      const k = x.t;
      // in with a slam, hold, out with a flicker
      const scale = k < 0.08 ? 4 : 3;
      if (k > 1.8 && Math.floor(k * 20) % 2) continue;
      const y = Math.round(VIEW.h * 0.3);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = DARK;
      ctx.fillRect(0, y - 6, VIEW.w, 32);
      ctx.globalAlpha = 1;
      ctx.fillStyle = x.color;
      ctx.fillRect(0, y - 6, VIEW.w, 1);
      ctx.fillRect(0, y + 25, VIEW.w, 1);
      const tw = textWidth(x.text, scale);
      const sz = iconSize(x.icon, 2);
      const total = sz.w + 8 + tw;
      icon(ctx, x.icon, VIEW.w / 2 - total / 2, y + 10 - sz.h / 2, 2);
      drawText(ctx, x.text, VIEW.w / 2 - total / 2 + sz.w + 8, y, x.color, { scale });
    }
  }

  /** Away: the marks you earned, one by one, then the rank, stamped. */
  private marks(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const t = b.stateT - 0.9;
    if (t < 0) return;
    const got = b.medals();
    const y = Math.round(VIEW.h * 0.52);
    const gap = 44;
    const x0 = VIEW.w / 2 - ((MEDALS.length - 1) * gap) / 2;
    ctx.globalAlpha = Math.min(1, t * 3) * 0.7;
    ctx.fillStyle = DARK;
    ctx.fillRect(0, y - 10, VIEW.w, 64);
    ctx.globalAlpha = 1;
    MEDALS.forEach((m, i) => {
      const at = got.indexOf(m);
      const shownAt = at >= 0 ? at * 0.35 : 99;
      const on = at >= 0 && t > shownAt;
      const pop = on ? clamp((t - shownAt) * 6, 0, 1) : 0;
      const scale = on && pop < 1 ? 3 : 2;
      const sz = iconSize(MEDAL_ICON[m], scale);
      const x = x0 + i * gap;
      icon(ctx, MEDAL_ICON[m], x - sz.w / 2, y + 8 - sz.h / 2, scale, !on);
      drawText(ctx, MEDAL_WORD[m], x, y + 24, on ? INK : '#4a3e58', { align: 'center' });
      if (on && Math.abs(t - shownAt) < 1 / 60 + 0.001) audio.play('risk_up', { vol: 0.5, pitch: 1 + at * 0.12 });
    });
    const rank = b.rank();
    const rt = t - got.length * 0.35 - 0.3;
    if (rank && rt > 0) {
      const s = rt < 0.08 ? 7 : 5;
      drawText(ctx, rank, VIEW.w / 2 + (MEDALS.length * gap) / 2 + 22, y - 2, RANK_COLOR[rank], { scale: s, align: 'center' });
    }
  }

  private pause(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(12,8,18,0.75)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    const mid = VIEW.w / 2;
    const y = Math.round(VIEW.h / 2 - 50 - SOUND_H / 2);
    drawText(ctx, 'PAUSED', mid, y, INK, { scale: 3, align: 'center' });
    const rows: [FlightAction, string][] = [
      ['fire', 'SHOOT'],
      ['dash', 'SLIDE'],
      ['heavy', 'BLAST / SET DOWN'],
      ['focus', 'HOLD AIM'],
    ];
    // (co-op: each player's key, side by side, where they differ)
    const players = this.b.heroes.map((_, i) => i);
    rows.forEach(([a, word], i) => {
      let x = mid - 40;
      for (const label of new Set(players.map((p) => this.btn(p, a)))) x += cap(ctx, label, x, y + 32 + i * 14, 'left') + 4;
      drawText(ctx, word, x + 2, y + 34 + i * 14, INK);
    });
    this.sound.draw(ctx, mid - SOUND_W / 2, y + 92);
    this.quit.draw(ctx, this.game.hintDevices(), mid, y + 104 + SOUND_H, 'CUT AND RUN', 'BACK TO YOUR SHIP WITH WHAT YOU CARRY');
  }

  dispose() {
    this.view.dispose();
  }
}
