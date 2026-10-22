/**
 * Finding a partner online: host a game and pass on its code (or the link with it in), or type in
 * a partner's code. Once both are in, the host times the line between them, picks the input delay
 * and a seed, and both start in lockstep (see Netplay). A plain page over the game: there's typing.
 */

import type { Game } from '../game/game';
import { input } from '../input';
import { Netplay, TICK } from './netplay';

let open: HTMLElement | null = null;

/** Whether the lobby is up (the title leaves the keys alone while it is). */
export const lobbyOpen = () => !!open;

const CSS = `
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 10;
  background: rgba(10, 8, 18, 0.72); font: 14px/1.5 ui-monospace, Menlo, Consolas, monospace; color: #e8e0ff;
  text-transform: uppercase; letter-spacing: 0.06em;`;
const PANEL = 'background: #160f22; border: 2px solid #ffd04a; padding: 22px 26px; width: min(380px, calc(100vw - 32px)); box-sizing: border-box;';
const BUTTON = 'font: inherit; text-transform: inherit; letter-spacing: inherit; background: #2a2236; color: #ffd04a; border: 2px solid #ffd04a; padding: 6px 12px; cursor: pointer;';
const FIELD = 'font: inherit; font-size: 20px; letter-spacing: 0.3em; width: 7.5em; background: #0b0912; color: #ffd04a; border: 2px solid #6a5a8a; padding: 4px 8px; text-transform: uppercase;';

/** Opens the lobby; `start` runs once both players are in (game.net is set by then). */
export function openLobby(game: Game, start: () => void, code?: string) {
  if (open) return;
  const root = document.createElement('div');
  root.style.cssText = CSS;
  const panel = document.createElement('div');
  panel.style.cssText = PANEL;
  root.append(panel);
  document.body.append(root);
  open = root;

  let ws: WebSocket | null = null;
  let begun = false;
  const close = () => {
    if (!begun) ws?.close();
    root.remove();
    open = null;
    window.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') close();
    // typing here isn't playing
    e.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  const show = (html: string) => {
    panel.innerHTML = `<div style="color:#ff8a3a;font-size:18px;margin-bottom:12px">Online co-op</div>${html}`;
    const cancel = document.createElement('button');
    cancel.style.cssText = BUTTON + 'margin-top:16px;color:#a090c0;border-color:#6a5a8a';
    cancel.textContent = 'Cancel (Esc)';
    cancel.onclick = close;
    panel.append(cancel);
  };

  const choose = (error = '') => {
    ws?.close();
    ws = null;
    show(`
      ${error ? `<p style="color:#ff6a5a">${error}</p>` : ''}
      <p><button data-host style="${BUTTON}">Host a game</button></p>
      <p style="color:#a090c0;margin:14px 0 6px">Or join with your partner's code</p>
      <form data-join style="display:flex;gap:8px">
        <input data-code maxlength="5" autocomplete="off" spellcheck="false" style="${FIELD}">
        <button style="${BUTTON}">Join</button>
      </form>`);
    panel.querySelector<HTMLButtonElement>('[data-host]')!.onclick = host;
    const field = panel.querySelector<HTMLInputElement>('[data-code]')!;
    panel.querySelector<HTMLFormElement>('[data-join]')!.onsubmit = (e) => {
      e.preventDefault();
      if (field.value.trim()) join(field.value);
    };
    field.focus();
  };

  const connect = (first: unknown, onMsg: (msg: any) => void) => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/mp`;
    const s = new WebSocket(url);
    ws = s;
    s.onopen = () => s.send(JSON.stringify(first));
    s.onerror = () => ws === s && choose("COULDN'T REACH THE SERVER");
    s.onmessage = (e) => {
      if (ws !== s || begun) return;
      const msg = JSON.parse(String(e.data));
      if (msg.t === 'error') choose(msg.msg);
      else if (msg.t === 'left') choose('YOUR PARTNER LEFT');
      else onMsg(msg);
    };
    return s;
  };

  const begin = (s: WebSocket, me: number, seed: number, delay: number) => {
    begun = true;
    game.net = new Netplay(s, me, seed, delay);
    input.net = game.net;
    close();
    start();
  };

  const host = () => {
    show('<p>Opening a game...</p>');
    const pings: number[] = [];
    let sentAt = 0;
    const ping = (s: WebSocket) => {
      sentAt = performance.now();
      s.send(JSON.stringify({ t: 'ping' }));
    };
    const s = connect({ t: 'host' }, (msg) => {
      if (msg.t === 'room') {
        const link = `${location.origin}${location.pathname}?join=${msg.code}`;
        show(`
          <p style="color:#a090c0;margin:0">Your code</p>
          <p style="font-size:34px;color:#ffd04a;letter-spacing:0.25em;margin:4px 0 10px">${msg.code}</p>
          <p><button data-copy style="${BUTTON}">Copy invite link</button></p>
          <p style="color:#a090c0">Waiting for your partner...</p>`);
        const copy = panel.querySelector<HTMLButtonElement>('[data-copy]')!;
        copy.onclick = () => {
          void navigator.clipboard?.writeText(link).then(() => (copy.textContent = 'Copied'));
        };
      } else if (msg.t === 'peer') {
        show('<p>Your partner is in. Timing the line...</p>');
        ping(s);
      } else if (msg.t === 'pong') {
        pings.push(performance.now() - sentAt);
        if (pings.length < 5) return ping(s);
        // the input goes a little over half the round trip ahead, with a margin for jitter
        const rtt = Math.min(...pings);
        const delay = Math.max(3, Math.min(15, Math.ceil(rtt / 2 / (TICK * 1000)) + 2));
        const seed = Math.floor(Math.random() * 1e6);
        s.send(JSON.stringify({ t: 'go', seed, delay }));
        begin(s, 0, seed, delay);
      }
    });
  };

  const join = (raw: string) => {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    show(`<p>Joining ${c}...</p>`);
    const s = connect({ t: 'join', code: c }, (msg) => {
      if (msg.t === 'ping') s.send(JSON.stringify({ t: 'pong' }));
      else if (msg.t === 'joined') show('<p>In. Your partner is getting ready...</p>');
      else if (msg.t === 'go') begin(s, 1, msg.seed, msg.delay);
    });
  };

  if (code) join(code);
  else choose();
}
