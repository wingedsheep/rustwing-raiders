import type { Game, Screen } from '../game/game';
import type { Rating } from '../sim/recording';
import { audio } from '../audio';
import { input } from '../input';
import { drawText } from '../ui/font';
import { DIM, EDGE, GOLD, GREEN, H, INK, PANEL, RED, W } from '../ui/hud';
import { backdrop } from '../ui/widgets';

const CHOICES: { r: Rating; name: string; color: string; key: string }[] = [
  { r: 'fun', name: 'FUN', color: GREEN, key: 'Digit1' },
  { r: 'meh', name: 'MEH', color: GOLD, key: 'Digit2' },
  { r: 'unfair', name: 'UNFAIR', color: RED, key: 'Digit3' },
];

/**
 * The flight recorder's question after a stage or a Warden (see game/recorder.ts): fun, meh or
 * unfair (click, 1 2 3, or left/right and confirm), then a note about it in a big box, if they want
 * one. At the run's end, a second box for the run as a whole. A form over the game: Enter sends,
 * Shift+Enter starts a new line, Esc skips. On a pad, confirm sends and back skips.
 */
export class Rate implements Screen {
  private at = -1;
  private t = 0;
  private done = false;
  private root: HTMLDivElement;
  private buttons: HTMLButtonElement[] = [];
  private note: HTMLTextAreaElement;
  private line: HTMLTextAreaElement | null = null;
  private help: HTMLDivElement;

  constructor(
    private game: Game,
    private what: string,
    askLine: boolean,
    private then: (r: Rating | null, note?: string, line?: string) => void,
  ) {
    const root = (this.root = el('div', {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'min(760px, 94vw)', maxHeight: '94vh', overflowY: 'auto',
      boxSizing: 'border-box', padding: '22px 24px', font: '16px monospace', color: INK, background: PANEL, border: `2px solid ${EDGE}`, zIndex: '10',
      display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
    }));
    root.append(el('div', { font: 'bold 28px monospace', textAlign: 'center', letterSpacing: '2px' }, 'HOW WAS THAT?'));
    root.append(el('div', { color: DIM, textAlign: 'center', marginTop: '-8px' }, this.what));

    const row = el('div', { display: 'flex', gap: '12px', justifyContent: 'center' });
    CHOICES.forEach((c, k) => {
      const b = el('button', {
        flex: '1', maxWidth: '200px', padding: '14px 0 10px', font: 'bold 22px monospace', color: DIM, background: '#140f1c',
        border: `2px solid ${EDGE}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      }) as unknown as HTMLButtonElement;
      b.append(el('span', {}, c.name), el('span', { font: '12px monospace', color: DIM }, `${k + 1}`));
      b.addEventListener('click', () => this.pick(k));
      this.buttons.push(b);
      row.append(b);
    });
    root.append(row);

    this.note = box('What stood out? What felt good, what felt off, what killed you, what you wanted more of…', 6);
    root.append(label('THIS STAGE'), this.note);
    if (askLine) {
      this.line = box('And the run as a whole? Builds, pacing, difficulty curve, what you\'d change first…', 5);
      root.append(label('THE RUN'), this.line);
    }

    const foot = el('div', { display: 'flex', alignItems: 'center', gap: '12px' });
    this.help = el('div', { flex: '1', color: DIM, fontSize: '13px', lineHeight: '1.5' }) as HTMLDivElement;
    const skip = button('SKIP', EDGE, () => this.send(true));
    const send = button('SEND', GREEN, () => this.send(false));
    foot.append(this.help, skip, send);
    root.append(foot, el('div', { color: '#4a3e58', fontSize: '12px', textAlign: 'center' }, 'FOR THE FLIGHT RECORDER'));

    // typing here mustn't steer the game: keys stop at the form
    root.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLTextAreaElement;
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        return this.send(true);
      }
      if (e.target instanceof HTMLButtonElement && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        return this.send(false);
      }
      if (!typing && /^[123]$/.test(e.key)) this.pick(+e.key - 1);
    });
    root.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(root);
    this.refresh();
  }

  update(dt: number) {
    this.t += dt;
    if (this.done || this.t < 0.4) return;
    // keys typed into the form never reach the game's input, so this is a pad, or the keyboard
    // while nothing in the form has focus
    const m = this.game.menu();
    if (m.left || m.right) {
      this.at = this.at < 0 ? 1 : Math.max(0, Math.min(2, this.at + (m.left ? -1 : 1)));
      audio.play('ui_move');
      this.refresh();
    }
    const key = CHOICES.findIndex((c) => input.keyPressed(c.key));
    if (key >= 0) this.pick(key);
    else if (m.confirm) this.at < 0 ? this.pick(1) : this.send(false);
    else if (m.back) this.send(true);
  }

  private pick(k: number) {
    if (this.done) return;
    this.at = k;
    audio.play('ui_select');
    this.refresh();
    this.note.focus();
  }

  /** Sends what's there; a skip still keeps the rating, if one was picked, but not the notes. */
  private send(skip: boolean) {
    if (this.done) return;
    this.done = true;
    audio.play(skip ? 'ui_back' : 'ui_select');
    const r = this.at >= 0 ? CHOICES[this.at].r : null;
    const note = skip ? '' : this.note.value.trim();
    const line = skip ? '' : (this.line?.value.trim() ?? '');
    this.root.remove();
    this.then(r, note || undefined, line || undefined);
  }

  private refresh() {
    this.buttons.forEach((b, k) => {
      const c = CHOICES[k];
      const on = k === this.at;
      Object.assign(b.style, { color: on ? c.color : DIM, borderColor: on ? c.color : EDGE, background: on ? `${c.color}22` : '#140f1c' });
    });
    this.help.innerHTML =
      this.at < 0
        ? 'Pick one: click, <b>1 2 3</b>, or ←→ and confirm.<br><b>Esc</b> skips.'
        : '<b>Enter</b> sends &nbsp; <b>Shift+Enter</b> new line' + (this.line ? ' &nbsp; <b>Tab</b> next box' : '') + '<br><b>Esc</b> skips the notes';
  }

  draw() {
    const g = this.game;
    g.clearGL();
    const ctx = g.ui;
    ctx.clearRect(0, 0, W, H);
    backdrop(ctx);
    drawText(ctx, 'FLIGHT RECORDER', W / 2, H - 20, '#4a3e58', { align: 'center' });
  }

  dispose() {
    this.root.remove();
  }
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string) {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text) e.textContent = text;
  return e as HTMLDivElement;
}

const label = (text: string) => el('div', { color: DIM, fontSize: '13px', letterSpacing: '1px', marginBottom: '-8px' }, text);

function box(placeholder: string, rows: number) {
  const t = document.createElement('textarea');
  t.placeholder = placeholder;
  t.rows = rows;
  t.spellcheck = true;
  Object.assign(t.style, {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px', font: '16px/1.45 monospace', color: INK, background: '#140f1c',
    border: `2px solid ${EDGE}`, outline: 'none', resize: 'vertical', minHeight: '90px',
  });
  t.addEventListener('focus', () => (t.style.borderColor = GOLD));
  t.addEventListener('blur', () => (t.style.borderColor = EDGE));
  return t;
}

function button(text: string, color: string, onClick: () => void) {
  const b = el('button', { padding: '10px 22px', font: 'bold 16px monospace', color: color === EDGE ? DIM : color, background: 'transparent', border: `2px solid ${color}`, cursor: 'pointer' }, text);
  b.addEventListener('click', onClick);
  return b;
}
