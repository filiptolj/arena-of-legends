import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ClientMessage, MAX_NAME_LENGTH, type ServerMessage, sanitizeCommand } from '@lol/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { Room, type RoomClient } from './room.js';

const PORT = Number(process.env.PORT ?? 3001);
const DIST = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../client/dist');
const MAX_MESSAGE_BYTES = 4096;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

/** Serves the built client (if present) so one process hosts the whole game. */
const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (!existsSync(DIST)) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Arena of Legends server is running. Build the client (npm run build) to serve it from here, or use the Vite dev server.');
    return;
  }
  const safe = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });
const rooms = new Map<string, Room>();

function newRoomCode(): string {
  for (;;) {
    const code = randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
    if (!rooms.has(code)) return code;
  }
}

const cleanName = (name: unknown): string =>
  (typeof name === 'string' ? name : '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, MAX_NAME_LENGTH) || 'Summoner';

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  const id = randomUUID();
  let room: Room | null = null;
  const client: RoomClient = {
    id,
    name: 'Summoner',
    send(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  const fail = (message: string) => client.send({ t: 'error', message });
  const leaveRoom = () => {
    if (!room) return;
    room.leave(id);
    if (room.empty) rooms.delete(room.code);
    room = null;
  };

  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));
  client.send({ t: 'welcome', clientId: id });

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return fail('Bad message');
    }
    switch (msg?.t) {
      case 'create': {
        leaveRoom();
        client.name = cleanName(msg.name);
        room = new Room(newRoomCode(), client);
        rooms.set(room.code, room);
        break;
      }
      case 'join': {
        leaveRoom();
        client.name = cleanName(msg.name);
        const target = rooms.get(String(msg.code ?? '').toUpperCase().trim());
        if (!target) return fail('No room with that code');
        const err = target.join(client);
        if (err) return fail(err);
        room = target;
        break;
      }
      case 'pick': {
        const err = room?.pick(id, msg.team, msg.lane, msg.champion);
        if (err) fail(err);
        break;
      }
      case 'ready':
        room?.setReady(id, !!msg.ready);
        break;
      case 'start': {
        const err = room?.start(id);
        if (err) fail(err);
        break;
      }
      case 'cmd': {
        const cmd = sanitizeCommand(msg.cmd);
        if (cmd) room?.command(id, cmd);
        break;
      }
      case 'leave':
        leaveRoom();
        break;
      case 'ping':
        client.send({ t: 'pong', at: Number(msg.at) || 0 });
        break;
      default:
        fail('Unknown message');
    }
  });

  ws.on('close', leaveRoom);
});

// Drop connections that stop answering pings.
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (ws.alive === false) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 10_000);

http.listen(PORT, () => {
  console.log(`Arena of Legends server on http://localhost:${PORT} (WebSocket at /ws)`);
});
