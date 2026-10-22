import type { Game, Screen } from '../game/game';
import { Boarding, CLOCK, HERO, WORK, type BoardResult, type BoardSpec } from '../sim/boarding';
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
import { clamp } from '../util';

/** A line across the middle of the screen for a moment: ALARM, LOCKDOWN, KELTERS. */
interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
}

/** The buttons, as printed on each kind of device. */
function keys(dev: DeviceId) {
  if (dev === 'keys') return { fire: 'J', slide: 'K', blast: 'O', hold: 'SHIFT' };
  if (dev === 'keys-left') return { fire: 'SPACE', slide: 'L-SHIFT', blast: 'G', hold: 'Q' };
  if (dev === 'keys-right') return { fire: '/', slide: 'R-SHIFT', blast: ';', hold: 'R-CTRL' };
  const ps = input.padName(dev) === 'PS PAD';
  return { fire: 'R2', slide: ps ? 'CROSS' : 'A', blast: ps ? 'SQUARE' : 'X', hold: 'R-STICK' };
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Boarding a freighter on foot: the sim at a steady 60 Hz (held for hitstop, slowed for the big
 * moments), the cutaway deck drawn every frame, and the HUD: the kelters' clock, what you've
 * cracked, your hide and shells, a map of the deck.
 */
export class BoardingScreen implements Screen {
  readonly fullUI = true;
  readonly b: Boarding;
  readonly view: BoardingView;
  private acc = 0;
  private paused = false;
  private done = false;
  private banners: Banner[] = [];
  private time = 0;
  /** Seconds the controls stay up at the start (gone sooner once you've used them). */
  private teach = 14;
  private fired = false;
  private slid = false;
  /** Ticking UI: the clock's last whole second, flashes of the haul. */
  private haulFlash = [0, 0, 0, 0, 0];
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
    this.view = new BoardingView(this.b, skin, LIVERY, frame);
    this.bot = game.params.has('bot') ? new BoardBot(this.b) : null;
    Object.assign(window, { board: this.b, boardView: this.view });
  }

  update(dt: number) {
    this.time += dt;
    const b = this.b;
    const m = this.game.menu();
    if (m.start && b.state !== 'out' && b.state !== 'failed') {
      this.paused = !this.paused;
      audio.play(this.paused ? 'ui_back' : 'ui_select');
      audio.muffle(this.paused);
    }
    if (this.paused) {
      if (m.back) {
        // cut and run: back to your ship with what you're carrying (the kelters don't get you)
        this.paused = false;
        audio.muffle(false);
        b.outcome = 'escaped';
        this.finish();
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
      const devs = b.heroes.map((_, i) => this.game.devices[i] ?? 'keys');
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
      b.step(intents, aims);
      this.read(b.events);
      v.handle(b.events);
      b.events.length = 0;
    }
    v.update(dt * v.slowmo);
    for (const x of this.banners) x.t += dt;
    this.banners = this.banners.filter((x) => x.t < 2.6);
    for (let i = 0; i < this.haulFlash.length; i++) this.haulFlash[i] = Math.max(0, this.haulFlash[i] - dt * 2);
    if (b.state === 'play') this.teach -= dt * (this.fired && this.slid ? 3 : 1);
    if (!this.done && (b.state === 'out' || b.state === 'failed') && b.stateT > (b.state === 'out' ? 2.4 : 3.2)) this.finish();
  }

  /** What in the step deserves the whole screen. */
  private read(events: Boarding['events']) {
    for (const e of events) {
      if (e.type === 'alarm') this.banner('ALARM RAISED', `THE KELTERS ARE ${CLOCK.alarm}S CLOSER`, RED);
      else if (e.type === 'core') {
        this.banner('LOCKDOWN', `THE SHIP KNOWS. TURRETS UP, ${CLOCK.lockdown}S OFF THE CLOCK`, CYAN);
        this.haulFlash[4] = 1;
      }
      else if (e.type === 'kelters') this.banner('KELTERS CLAMPED ON', 'GET BACK TO THE LOCK BEFORE THEY CUT YOUR SHIP LOOSE', RED);
      else if (e.type === 'escape') this.banner('AWAY CLEAN', '', GREEN);
      else if (e.type === 'failed') this.banner(e.how === 'caught' ? 'COLLECTED' : 'DOWNED', e.how === 'caught' ? 'THE KELTERS HAVE YOUR SHIP' : 'THE CREW THROW YOU OUT THE LOCK', RED);
      else if (e.type === 'crate') this.haulFlash[e.i] = 1;
      else if (e.type === 'strongbox') this.haulFlash[3] = 1;
    }
  }

  private banner(text: string, sub: string, color: string) {
    this.banners = this.banners.filter((x) => x.text !== text);
    this.banners.push({ text, sub, color, t: 0 });
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
    if (this.paused) this.pause(ctx);
  }

  private at(x: number, y: number, z: number) {
    return this.view.project(x, y, z, VIEW.w, VIEW.h);
  }

  /** Things hung in the world: the mark you're aimed at, health over the hurt, work rings, words. */
  private world(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const t = this.time;
    // the mark: brackets round whoever your pistol's on
    b.heroes.forEach((h, i) => {
      if (h.down || h.mark < 0) return;
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
    // the crew's hide and plate, once you've drawn blood
    for (const f of b.foes) {
      if (f.dead || (f.hp >= f.max && f.plate >= f.plateMax)) continue;
      const p = this.at(f.x, 2.3 + (f.kind === 'bruiser' ? 0.5 : 0), f.z);
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
    // OPEN: slide in
    for (const f of b.foes) {
      if (f.dead || f.open <= 0) continue;
      const p = this.at(f.x, 2.9, f.z);
      if (Math.floor(t * 6) % 3) drawText(ctx, 'SLIDE IN', p.x, p.y, GOLD, { align: 'center' });
    }
    // work: a ring filling over the head
    b.heroes.forEach((h) => {
      if (!h.work || h.down) return;
      const p = this.at(h.x, 2.6, h.z);
      const k = clamp(h.work.t, 0, 1);
      const label = h.work.kind === 'leave' ? 'CASTING OFF' : h.work.kind === 'revive' ? 'HAULING UP' : h.work.kind === 'core' ? 'PULLING THE CORE' : h.work.kind === 'strongbox' ? 'CRACKING' : 'PRYING';
      const w = 34;
      const x = Math.round(p.x - w / 2);
      const y = Math.round(p.y);
      ctx.fillStyle = DARK;
      ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = h.work.kind === 'core' ? CYAN : h.work.kind === 'strongbox' ? GOLD : h.work.kind === 'leave' ? GREEN : HEIST;
      ctx.fillRect(x, y, Math.round(w * k), 3);
      drawText(ctx, label, p.x, y - 10, INK, { align: 'center' });
    });
    // the words that pop
    for (const p of this.view.pops) {
      const k = p.t / p.life;
      const s = this.at(p.x, p.y + k * 0.8, p.z);
      const scale = p.big ? (k < 0.12 ? 3 : 2) : 1;
      if (k > 0.75 && Math.floor(p.t * 20) % 2) continue;
      drawText(ctx, p.text, s.x, s.y - 4 * scale, p.color, { scale, align: 'center' });
    }
    // off the screen: arrows to the lock (when it's time) and to loot not yet taken
    const going = b.kelters || b.crates.every((c) => c.open);
    const d = b.deck;
    if (going && b.state === 'play') this.arrow(ctx, d.breach.x, d.breach.z, GREEN, 'LOCK', true);
    for (const c of b.crates) if (!c.open && b.visited.has(d.roomAt(c.prop.x, c.prop.z))) this.arrow(ctx, c.prop.x, c.prop.z, HEIST, '', false);
    if (b.strongbox && !b.strongbox.open && b.visited.has(d.roomAt(b.strongbox.prop.x, b.strongbox.prop.z))) this.arrow(ctx, b.strongbox.prop.x, b.strongbox.prop.z, GOLD, '', false);
  }

  private arrow(ctx: CanvasRenderingContext2D, x: number, z: number, color: string, label: string, always: boolean) {
    const p = this.at(x, 1, z);
    const m = 18;
    const inside = p.x > m && p.x < VIEW.w - m && p.y > 40 && p.y < VIEW.h - m;
    if (inside) {
      if (always) {
        const bob = Math.round(Math.sin(this.time * 6) * 2);
        drawText(ctx, `${label} v`, p.x, p.y - 26 + bob, color, { align: 'center' });
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
      ctx.fillRect(Math.round(ex + Math.cos(a) * i * 1.2 - Math.sin(a) * 0), Math.round(ey + Math.sin(a) * i * 1.2), 1, 1);
      for (let k = -r; k <= r; k++) ctx.fillRect(Math.round(ex + Math.cos(a) * (i - 2) - Math.sin(a) * k * 0.6), Math.round(ey + Math.sin(a) * (i - 2) + Math.cos(a) * k * 0.6), 1, 1);
    }
    if (label) drawText(ctx, label, ex - Math.cos(a) * 16, ey - Math.sin(a) * 12 - 3, color, { align: 'center' });
  }

  /** The clock across the top, and the haul. */
  private top(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    const t = this.time;
    const mid = VIEW.w / 2;
    const docked = b.dock >= 0;
    const left = b.timeLeft;
    const max = docked ? CLOCK.dock : b.clockMax;
    const urgent = left < 10;
    const w = 150;
    const x = Math.round(mid - w / 2);
    frame(ctx, x - 6, 4, w + 12, 28);
    const color = docked ? RED : urgent ? (Math.floor(t * 4) % 2 ? RED : INK) : b.alarmed ? '#ff9a6a' : INK;
    drawText(ctx, docked ? 'YOUR LOCK HOLDS' : 'KELTERS IN', x, 8, docked ? RED : DIM);
    drawText(ctx, mmss(left), x + w, 8, color, { align: 'right' });
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(x, 20, w, 5);
    ctx.fillStyle = docked ? RED : urgent ? RED : b.alarmed ? '#ff9a6a' : GOLD;
    ctx.fillRect(x, 20, Math.round((w * clamp(left / max, 0, 1)) || 0), 5);
    // the marks where the alarm and the core would bite
    if (!docked) {
      ctx.fillStyle = DARK;
      for (const cut of [CLOCK.alarm, CLOCK.lockdown]) {
        const k = (left - cut) / max;
        if (k > 0) ctx.fillRect(x + Math.round(w * k), 20, 1, 5);
      }
    }
    // the haul, at the right
    const hx = VIEW.w - 8;
    frame(ctx, hx - 132, 4, 132, 28);
    let cx = hx - 126;
    b.crates.forEach((c, i) => {
      icon(ctx, 'crate', cx, 9, c.open, this.haulFlash[i]);
      cx += 17;
    });
    if (b.strongbox) {
      icon(ctx, 'strongbox', cx + 2, 9, b.strongbox.open, this.haulFlash[3]);
      cx += 19;
    }
    if (b.core) {
      icon(ctx, 'core', cx + 2, 9, b.core.open, this.haulFlash[4]);
      cx += 19;
    }
    const tins = b.heroes.reduce((s, h) => s + h.tins, 0) + (b.strongbox?.open ? b.pay : 0);
    drawText(ctx, `${tins}`, hx - 8, 9, GOLD, { align: 'right' });
    drawText(ctx, 'SCRAP', hx - 8, 19, DIM, { align: 'right' });
  }

  /** Each of you: hide, shells. */
  private heroes(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    b.heroes.forEach((h, i) => {
      const right = i === 1;
      const x0 = right ? VIEW.w - 8 - 132 : 8;
      const y0 = right ? 36 : 4;
      frame(ctx, x0, y0, 132, 28);
      const col = hex(LIVERY[i][2]);
      drawText(ctx, `P${i + 1}`, x0 + 6, y0 + 5, col);
      // hide: pips
      for (let k = 0; k < HERO.hp; k++) {
        const x = x0 + 24 + k * 11;
        ctx.fillStyle = DARK;
        ctx.fillRect(x, y0 + 4, 9, 9);
        const lit = k < h.hp;
        ctx.fillStyle = h.down ? '#3a2e48' : lit ? (h.hp <= 1 && Math.floor(this.time * 6) % 2 ? '#ffffff' : RED) : '#3a2436';
        ctx.fillRect(x + 1, y0 + 5, 7, 7);
        if (lit) {
          ctx.fillStyle = '#ffa090';
          ctx.fillRect(x + 2, y0 + 6, 2, 2);
        }
      }
      // shells for the blast, reloading one at a time
      for (let k = 0; k < HERO.shells; k++) {
        const x = x0 + 24 + k * 9;
        const has = k < h.shells;
        ctx.fillStyle = has ? '#ff8a3a' : '#3a2e48';
        ctx.fillRect(x, y0 + 17, 6, 6);
        ctx.fillStyle = has ? '#ffd04a' : '#2a2236';
        ctx.fillRect(x, y0 + 17, 6, 2);
        if (!has && k === h.shells) {
          ctx.fillStyle = '#ff8a3a';
          ctx.fillRect(x, y0 + 23, Math.round(6 * clamp(1 - h.shellT / HERO.reload, 0, 1)), 1);
        }
      }
      drawText(ctx, 'BLAST', x0 + 24 + HERO.shells * 9 + 2, y0 + 17, DIM);
      if (h.down) drawText(ctx, b.heroes.length > 1 ? 'DOWN: GET TO THEM' : 'DOWN', x0 + 80, y0 + 17, RED, { align: 'center' });
      else if (h.hook) drawText(ctx, 'HOOKED', x0 + 100, y0 + 17, Math.floor(this.time * 8) % 2 ? RED : INK, { align: 'center' });
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
    // the crew you've seen awake
    for (const f of b.foes) if (!f.dead && (f.aware || f.kind === 'kelter') && b.visited.has(d.roomAt(f.x, f.z))) dot(f.x, f.z, f.kind === 'kelter' ? '#ff3a3a' : '#ff8a6a');
    if (b.kelters && blink) dot(b.kelters.x, b.kelters.z, '#ff3a3a', true);
    // the lock
    dot(d.breach.x, d.breach.z, GREEN, true);
    b.heroes.forEach((hh, i) => {
      if (blink || !hh.down) dot(hh.x, hh.z, hex(LIVERY[i][2]), true);
    });
  }

  /** At the start: what the buttons do here. Later: what to do now. */
  private prompts(ctx: CanvasRenderingContext2D) {
    const b = this.b;
    if (b.state === 'intro') {
      const k = clamp(b.stateT / 0.4, 0, 1);
      drawText(ctx, 'BOARDING', VIEW.w / 2, VIEW.h / 2 - 40, INK, { scale: 3, align: 'center' });
      if (k >= 1) drawText(ctx, 'CUTTING THROUGH THE HULL...', VIEW.w / 2, VIEW.h / 2 - 8, DIM, { align: 'center' });
      return;
    }
    if (b.state !== 'play') return;
    const dev = this.game.devices[0] ?? 'keys';
    const k = keys(dev);
    const y = VIEW.h - 76;
    if (this.teach > 0) {
      const a = clamp(this.teach, 0, 1);
      ctx.globalAlpha = a;
      const lines = [
        `${k.fire} SHOOT    ${k.slide} SLIDE    ${k.blast} BLAST`,
        `SLIDE INTO ANYONE OPEN OR UNAWARE: A TAKEDOWN.  SLIDE THROUGH A SHOT: PERFECT.`,
        `STAND AT A CRATE TO CRACK IT. THREE CRATES, THEN BACK TO THE LOCK.`,
      ];
      const w = Math.max(...lines.map((l) => textWidth(l))) + 16;
      frame(ctx, Math.round(VIEW.w / 2 - w / 2), y - 22, w, 34);
      lines.forEach((l, i) => drawText(ctx, l, VIEW.w / 2, y - 18 + i * 10, i ? DIM : INK, { align: 'center' }));
      ctx.globalAlpha = 1;
      return;
    }
    // what now
    const open = b.crates.filter((c) => c.open).length;
    let goal = '';
    let col = DIM;
    if (b.dock >= 0) {
      goal = 'TO THE LOCK. NOW.';
      col = Math.floor(this.time * 4) % 2 ? RED : INK;
    } else if (open === 3 && b.core && !b.core.open) {
      goal = 'THE CORE IS AT THE BOW. OR GO HOME RICH.';
      col = CYAN;
    } else if (open === 3) {
      goal = 'BACK TO THE LOCK';
      col = GREEN;
    } else goal = `CRACK THE CRATES  ${open}/3`;
    if (b.heroes.some((h) => h.work?.kind === 'leave')) {
      goal = 'CASTING OFF...';
      col = GREEN;
    }
    drawText(ctx, goal, VIEW.w / 2, 36, col, { align: 'center' });
  }

  private drawBanners(ctx: CanvasRenderingContext2D) {
    for (const x of this.banners) {
      const k = x.t;
      // in with a slam, hold, out with a flicker
      const scale = k < 0.08 ? 4 : 3;
      if (k > 2.1 && Math.floor(k * 20) % 2) continue;
      const y = Math.round(VIEW.h * 0.3);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = DARK;
      ctx.fillRect(0, y - 6, VIEW.w, x.sub ? 40 : 30);
      ctx.globalAlpha = 1;
      ctx.fillStyle = x.color;
      ctx.fillRect(0, y - 6, VIEW.w, 1);
      ctx.fillRect(0, y + (x.sub ? 33 : 23), VIEW.w, 1);
      drawText(ctx, x.text, VIEW.w / 2, y, x.color, { scale, align: 'center' });
      if (x.sub) drawText(ctx, x.sub, VIEW.w / 2, y + 23, INK, { align: 'center' });
    }
  }

  private pause(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(12,8,18,0.75)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    const mid = VIEW.w / 2;
    const y = Math.round(VIEW.h / 2 - 50);
    drawText(ctx, 'PAUSED', mid, y, INK, { scale: 3, align: 'center' });
    const k = keys(this.game.devices[0] ?? 'keys');
    const lines = [
      `${k.fire}  SHOOT (IT FINDS ITS MARK)`,
      `${k.slide}  SLIDE: THROUGH SHOTS, INTO THE OPEN FOR A TAKEDOWN`,
      `${k.blast}  BLAST: TWO SHELLS, BREAKS PLATE, KNOCKS THEM DOWN`,
      `${k.hold}  HOLD TO KEEP YOUR AIM`,
      `STAND AT LOOT TO CRACK IT; IN THE LOCK TO CAST OFF`,
    ];
    lines.forEach((l, i) => drawText(ctx, l, mid, y + 34 + i * 11, i < 4 ? INK : DIM, { align: 'center' }));
    drawText(ctx, 'START / ESC: RESUME      BACK / Q: CUT AND RUN (KEEP WHAT YOU HAVE)', mid, y + 104, DIM, { align: 'center' });
  }

  dispose() {
    this.view.dispose();
  }
}

/** The haul's little pictures: a crate, a strongbox, the core; dim till they're yours. */
function icon(ctx: CanvasRenderingContext2D, kind: 'crate' | 'strongbox' | 'core', x: number, y: number, got: boolean, flash: number) {
  const on = (c: string) => (flash > 0 && Math.floor(flash * 12) % 2 ? '#ffffff' : got ? c : '#3a3048');
  if (kind === 'crate') {
    ctx.fillStyle = on('#3a8a7a');
    ctx.fillRect(x, y + 2, 14, 10);
    ctx.fillStyle = on(HEIST);
    ctx.fillRect(x, y + 2, 14, 2);
    ctx.fillRect(x + 6, y + 5, 2, 3);
  } else if (kind === 'strongbox') {
    ctx.fillStyle = on('#8a6a20');
    ctx.fillRect(x, y + 1, 14, 12);
    ctx.fillStyle = on(GOLD);
    ctx.fillRect(x + 1, y + 2, 12, 2);
    ctx.fillRect(x + 5, y + 6, 4, 4);
  } else {
    ctx.fillStyle = on('#2a7a6a');
    ctx.fillRect(x + 3, y, 8, 14);
    ctx.fillRect(x, y + 3, 14, 8);
    ctx.fillStyle = on(CYAN);
    ctx.fillRect(x + 4, y + 4, 6, 6);
  }
  if (!got) {
    ctx.fillStyle = '#5a4a68';
    ctx.fillRect(x, y + 13, 14, 1);
  }
}

export { WORK };
