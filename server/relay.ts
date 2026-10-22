// Online co-op: a room for two, found by a five-letter code, and a relay between them. Attached to
// Vite's own HTTP server as a plugin, so `npm run dev` and `vite preview` (production) both have it.
// The server knows nothing of the game: both browsers run the whole of it in lockstep (src/net),
// and all that crosses is each player's input, a tick at a time.
//
// JSON over a WebSocket at /mp:
//   client → server:  host | join {code}  (anything else goes on to the other player as is)
//   server → client:  room {code, you: 0} | joined {code, you: 1} | peer | left | error {msg}

import type { Plugin } from 'vite';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// no 0/O/1/I: codes get read out over voice chat
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

interface Room {
  code: string;
  /** Host first, then the guest. */
  seats: WebSocket[];
}

const rooms = new Map<string, Room>();

function makeCode() {
  let code: string;
  do code = Array.from({ length: CODE_LENGTH }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  while (rooms.has(code));
  return code;
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function attach(server: Server | null | undefined) {
  if (!server) return;
  const wss = new WebSocketServer({ noServer: true });
  // only /mp: Vite's own hot reload shares the server
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/mp') return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    let room: Room | null = null;
    // a dropped connection that never closed cleanly still frees the room
    let alive = true;
    ws.on('pong', () => (alive = true));
    const beat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15000);

    ws.on('message', (data, binary) => {
      if (room) {
        // in a room: everything goes to the other player
        const other = room.seats.find((s) => s !== ws);
        if (other?.readyState === WebSocket.OPEN) other.send(data, { binary });
        return;
      }
      let msg: { t?: string; code?: string };
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg.t === 'host') {
        room = { code: makeCode(), seats: [ws] };
        rooms.set(room.code, room);
        send(ws, { t: 'room', code: room.code, you: 0 });
      } else if (msg.t === 'join') {
        const code = String(msg.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const r = rooms.get(code);
        if (!r) return send(ws, { t: 'error', msg: 'NO GAME WITH THAT CODE' });
        if (r.seats.length >= 2) return send(ws, { t: 'error', msg: 'THAT GAME IS FULL' });
        r.seats.push(ws);
        room = r;
        send(ws, { t: 'joined', code, you: 1 });
        send(r.seats[0], { t: 'peer' });
      }
    });

    ws.on('close', () => {
      clearInterval(beat);
      if (!room) return;
      for (const s of room.seats) if (s !== ws) send(s, { t: 'left' });
      // a lockstep game can't go on with one player, so the room goes with them
      rooms.delete(room.code);
    });
  });
}

export function coopRelay(): Plugin {
  return {
    name: 'coop-relay',
    configureServer(server) {
      attach(server.httpServer as Server | null);
    },
    configurePreviewServer(server) {
      attach(server.httpServer as Server);
    },
  };
}
