/**
 * Transport abstraction for online co-op. Two implementations:
 *  - PeerTransport: WebRTC data channels via PeerJS (works from a static host; uses the public PeerJS broker only for signalling).
 *  - RelayTransport: plain WebSocket relay (apps/server) for self-hosting / LAN / tests.
 * Messages are JSON. The host is always addressed as 'host'.
 */
import Peer, { type DataConnection } from 'peerjs';

export interface Transport {
  kind: 'peer' | 'relay';
  room: string;
  sendTo(peer: string, msg: unknown): void;
  broadcast(msg: unknown): void;
  onMessage(cb: (peer: string, msg: unknown) => void): void;
  onPeerLeft(cb: (peer: string) => void): void;
  close(): void;
}

const PREFIX = 'mosteiro-sino-';
export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (const n of buf) s += alphabet[n % alphabet.length];
  return s;
}

// ------------------------------------------------------------------ PeerJS
export function hostPeer(room: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PREFIX + room, { debug: 0 });
    const conns = new Map<string, DataConnection>();
    let onMsg: (p: string, m: unknown) => void = () => {};
    let onLeft: (p: string) => void = () => {};
    const t: Transport = {
      kind: 'peer',
      room,
      sendTo: (p, m) => conns.get(p)?.send(JSON.stringify(m)),
      broadcast: (m) => {
        const s = JSON.stringify(m);
        conns.forEach((c) => c.open && c.send(s));
      },
      onMessage: (cb) => (onMsg = cb),
      onPeerLeft: (cb) => (onLeft = cb),
      close: () => peer.destroy(),
    };
    peer.on('open', () => resolve(t));
    peer.on('error', (e) => reject(new Error(peerError(e))));
    peer.on('connection', (conn) => {
      const id = conn.metadata?.seat || conn.peer;
      conn.on('open', () => conns.set(id, conn));
      conn.on('data', (d) => {
        try {
          onMsg(id, JSON.parse(String(d)));
        } catch {
          /* ignore malformed */
        }
      });
      conn.on('close', () => {
        conns.delete(id);
        onLeft(id);
      });
    });
  });
}

export function joinPeer(room: string, seatHint?: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const peer = new Peer({ debug: 0 });
    peer.on('error', (e) => reject(new Error(peerError(e))));
    peer.on('open', (myId) => {
      const conn = peer.connect(PREFIX + room.toUpperCase(), { reliable: true, metadata: { seat: seatHint || myId } });
      let onMsg: (p: string, m: unknown) => void = () => {};
      let onLeft: (p: string) => void = () => {};
      const t: Transport = {
        kind: 'peer',
        room,
        sendTo: (_p, m) => conn.open && conn.send(JSON.stringify(m)),
        broadcast: (m) => conn.open && conn.send(JSON.stringify(m)),
        onMessage: (cb) => (onMsg = cb),
        onPeerLeft: (cb) => (onLeft = cb),
        close: () => peer.destroy(),
      };
      conn.on('open', () => resolve(t));
      conn.on('data', (d) => {
        try {
          onMsg('host', JSON.parse(String(d)));
        } catch {
          /* ignore */
        }
      });
      conn.on('close', () => onLeft('host'));
      setTimeout(() => !conn.open && reject(new Error('Sala não encontrada ou anfitrião offline.')), 12000);
    });
  });
}

function peerError(e: unknown): string {
  const type = (e as { type?: string })?.type;
  if (type === 'unavailable-id') return 'Este código de sala já está em uso.';
  if (type === 'peer-unavailable') return 'Sala não encontrada.';
  if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'Não foi possível alcançar o servidor de sinalização.';
  if (type === 'browser-incompatible') return 'Este navegador não suporta WebRTC.';
  return 'Falha de conexão.';
}

// ------------------------------------------------------------------ WebSocket relay
export function relay(url: string, room: string, role: 'host' | 'client', seatHint?: string): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let onMsg: (p: string, m: unknown) => void = () => {};
    let onLeft: (p: string) => void = () => {};
    let myId = seatHint || Math.random().toString(36).slice(2, 10);
    const t: Transport = {
      kind: 'relay',
      room,
      sendTo: (to, m) => ws.readyState === 1 && ws.send(JSON.stringify({ to, data: m })),
      broadcast: (m) => ws.readyState === 1 && ws.send(JSON.stringify({ to: '*', data: m })),
      onMessage: (cb) => (onMsg = cb),
      onPeerLeft: (cb) => (onLeft = cb),
      close: () => ws.close(),
    };
    ws.onopen = () => ws.send(JSON.stringify({ join: room, role, id: role === 'host' ? 'host' : myId }));
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(String(ev.data));
        if (m.joined) {
          myId = m.id;
          resolve(t);
        } else if (m.error) reject(new Error(m.error));
        else if (m.left) onLeft(m.left);
        else if (m.from) onMsg(m.from, m.data);
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => reject(new Error('Servidor de retransmissão indisponível.'));
    ws.onclose = () => onLeft('host');
  });
}
