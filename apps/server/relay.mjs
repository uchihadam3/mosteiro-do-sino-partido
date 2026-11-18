// Minimal WebSocket relay for online co-op (self-hosted alternative to PeerJS/WebRTC).
// Usage: node apps/server/relay.mjs [port]   — then join with  ws://<host>:<port>
// The relay is dumb: it only routes messages inside a room. All game rules run on the host player's device.
import { WebSocketServer } from 'ws';

const port = Number(process.argv[2] ?? process.env.PORT ?? 8787);
const rooms = new Map(); // room -> Map(id -> ws)
const wss = new WebSocketServer({ port });

wss.on('connection', (ws) => {
  let room = null;
  let id = null;
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (m.join) {
      room = String(m.join).toUpperCase().slice(0, 16);
      if (!rooms.has(room)) rooms.set(room, new Map());
      const peers = rooms.get(room);
      if (m.role === 'host' && peers.has('host')) return ws.send(JSON.stringify({ error: 'Este código de sala já está em uso.' }));
      if (m.role !== 'host' && !peers.has('host')) return ws.send(JSON.stringify({ error: 'Sala não encontrada.' }));
      id = m.role === 'host' ? 'host' : String(m.id || Math.random().toString(36).slice(2, 10));
      peers.set(id, ws);
      ws.send(JSON.stringify({ joined: true, id }));
      return;
    }
    if (!room || !id) return;
    const peers = rooms.get(room);
    const payload = JSON.stringify({ from: id, data: m.data });
    if (m.to === '*') {
      for (const [pid, p] of peers) if (pid !== id && p.readyState === 1) p.send(payload);
    } else {
      const p = peers.get(m.to);
      if (p && p.readyState === 1) p.send(payload);
    }
  });
  ws.on('close', () => {
    if (!room || !id) return;
    const peers = rooms.get(room);
    peers?.delete(id);
    if (peers) for (const p of peers.values()) p.readyState === 1 && p.send(JSON.stringify({ left: id }));
    if (peers && peers.size === 0) rooms.delete(room);
  });
});
console.log(`Mosteiro relay listening on ws://0.0.0.0:${port}`);
