/**
 * GameSession — the single place where commands enter the game.
 *  - local: this device applies commands (solo or hot-seat; every hero is controllable here).
 *  - host:  this device is authoritative; remote players send commands, the host validates seat ownership,
 *           applies them with the same pure reducer and broadcasts the new state + domain events.
 *  - client: commands are sent to the host; state arrives from the host. No local rule evaluation needed,
 *           so clients can never desync or cheat the dice.
 * Party decisions (route choice, leaving rewards, etc.) use a ready-check vote when several players are connected.
 */
import { permission } from './permissions';
export { permission };
import { campaignDispatch, type CampaignCommand, type CampaignState, type DomainEvent } from '@mosteiro/core';
import { finishDungeon } from '@mosteiro/content';
import { autosave } from './persistence';
import type { Transport } from '../net/transport';

export type Role = 'local' | 'host' | 'client';
export interface Seat {
  id: string;
  name: string;
  connected: boolean;
  isHost?: boolean;
}

export type NetMsg =
  | { t: 'hello'; name: string; version: string; seatId?: string }
  | { t: 'welcome'; seatId: string; seats: Seat[]; state: CampaignState | null; seq: number; votes: Votes }
  | { t: 'cmd'; cmd: CampaignCommand | LocalCmd; nonce: string }
  | { t: 'state'; state: CampaignState | null; events: DomainEvent[]; seq: number; votes: Votes; seats: Seat[] }
  | { t: 'reject'; nonce: string; error: string }
  | { t: 'seats'; seats: Seat[] }
  | { t: 'lobby'; lobby: LobbyState }
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number };

/** Session-level commands that are not part of the campaign reducer. */
export type LocalCmd = { t: 'finishDungeon' } | { t: 'vote'; key: string; payload: CampaignCommand } | { t: 'lobbyUpdate'; lobby: Partial<LobbyState> };

export interface LobbyState {
  started: boolean;
  heroes: { classId: string; name: string; seat: string }[];
  seed: string;
}

export type Votes = Record<string, { label: string; seats: string[] }>;

type Listener = () => void;
type EventListener = (events: DomainEvent[]) => void;

/** Commands that represent party-wide decisions and need everyone's agreement online. */
function isPartyDecision(cmd: CampaignCommand): string | null {
  if (cmd.t === 'explore') return `explore:${cmd.optionId}`;
  if (cmd.t === 'collectRewards') return 'collectRewards';
  if (cmd.t === 'beginDungeon') return 'beginDungeon';
  if (cmd.t === 'leaveBase') return 'leaveBase';
  return null;
}

export class GameSession {
  role: Role = 'local';
  state: CampaignState | null = null;
  seq = 0;
  seats: Seat[] = [{ id: 'local', name: 'Jogador', connected: true, isHost: true }];
  localSeat = 'local';
  votes: Votes = {};
  lobby: LobbyState = { started: false, heroes: [], seed: '' };
  transport: Transport | null = null;
  lastError: string | null = null;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private pendingNonces = new Map<string, (err: string | null) => void>();

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  onEvents(l: EventListener) {
    this.eventListeners.add(l);
    return () => {
      this.eventListeners.delete(l);
    };
  }
  private emit(events: DomainEvent[] = []) {
    this.seq++;
    if (events.length) this.eventListeners.forEach((l) => l(events));
    this.listeners.forEach((l) => l());
  }

  // ------------------------------------------------------------------ local
  startLocal(state: CampaignState) {
    this.role = 'local';
    this.state = state;
    this.seats = state.seats.map((s, i) => ({ id: s.id, name: s.name, connected: true, isHost: i === 0 }));
    this.localSeat = '*';
    this.emit();
    autosave(state);
  }
  close() {
    this.transport?.close();
    this.transport = null;
    this.state = null;
    this.role = 'local';
    this.votes = {};
    this.emit();
  }

  /** Can the local player act for this hero / answer this pending? */
  controls(heroId: string | null | undefined): boolean {
    if (!this.state || !heroId) return false;
    if (this.localSeat === '*') return true;
    return this.state.heroes.find((h) => h.id === heroId)?.seat === this.localSeat;
  }

  // ------------------------------------------------------------------ dispatch
  async dispatch(cmd: CampaignCommand | LocalCmd): Promise<string | null> {
    if (this.role === 'client') return this.sendToHost(cmd);
    return this.apply(cmd, this.localSeat === '*' ? null : this.localSeat);
  }

  /** Authoritative application (local or host). seat = null means trusted local device. */
  private apply(cmd: CampaignCommand | LocalCmd, seat: string | null): string | null {
    if (!this.state) return 'Sem partida ativa.';
    if (cmd.t === 'lobbyUpdate') return null;
    if (cmd.t === 'finishDungeon') {
      if (this.state.phase !== 'epilogue') return 'Ainda não terminou.';
      const s = structuredClone(this.state);
      finishDungeon(s);
      return this.commit(s, []);
    }
    if (cmd.t === 'vote') return this.castVote(cmd.key, cmd.payload, seat ?? this.localSeat);
    if (seat) {
      const why = permission(this.state, seat, cmd);
      if (why) return why;
      // multi-player party decisions → ready check
      const key = isPartyDecision(cmd);
      if (key && this.onlineSeats().length > 1) return this.castVote(key, cmd, seat);
    } else if (this.role === 'host') {
      const key = isPartyDecision(cmd);
      if (key && this.onlineSeats().length > 1) return this.castVote(key, cmd, this.localSeat);
    }
    const r = campaignDispatch(this.state, cmd);
    if (r.error) {
      this.lastError = r.error;
      return r.error;
    }
    return this.commit(r.state, r.events);
  }

  /** Local play only: put back a state captured just before a plain move (nothing random happened since). */
  undoTo(s: CampaignState): boolean {
    if (this.role !== 'local' || !this.state) return false;
    this.commit(structuredClone(s), []);
    return true;
  }

  private commit(s: CampaignState, events: DomainEvent[]): null {
    this.state = s;
    this.votes = {};
    autosave(s);
    this.emit(events);
    this.broadcast(events);
    return null;
  }

  onlineSeats() {
    return this.seats.filter((s) => s.connected);
  }

  private castVote(key: string, payload: CampaignCommand, seat: string): string | null {
    const label = voteLabel(this.state!, payload);
    const v = this.votes[key] ?? { label, seats: [] };
    // a player can back only one proposal at a time
    for (const k of Object.keys(this.votes)) this.votes[k].seats = this.votes[k].seats.filter((x) => x !== seat);
    if (!v.seats.includes(seat)) v.seats.push(seat);
    this.votes[key] = v;
    for (const k of Object.keys(this.votes)) if (!this.votes[k].seats.length) delete this.votes[k];
    const needed = this.onlineSeats().map((s) => s.id);
    if (needed.every((id) => v.seats.includes(id))) {
      const r = campaignDispatch(this.state!, payload);
      if (r.error) return r.error;
      return this.commit(r.state, r.events);
    }
    this.emit();
    this.broadcast([]);
    return null;
  }

  // ------------------------------------------------------------------ network (host)
  attachHost(t: Transport, hostName: string) {
    this.role = 'host';
    this.transport = t;
    this.localSeat = 'host';
    this.seats = [{ id: 'host', name: hostName, connected: true, isHost: true }];
    t.onMessage((peer, msg) => this.onHostMessage(peer, msg as NetMsg));
    t.onPeerLeft((peer) => {
      const s = this.seats.find((x) => x.id === peer);
      if (s) s.connected = false;
      this.emit();
      this.broadcastSeats();
    });
  }
  private onHostMessage(peer: string, msg: NetMsg) {
    switch (msg.t) {
      case 'hello': {
        let seat = this.seats.find((s) => s.id === (msg.seatId ?? peer));
        if (!seat) {
          seat = { id: peer, name: msg.name.slice(0, 20) || 'Jogador', connected: true };
          this.seats.push(seat);
        } else {
          seat.connected = true;
          seat.name = msg.name.slice(0, 20) || seat.name;
        }
        this.transport!.sendTo(peer, { t: 'welcome', seatId: seat.id, seats: this.seats, state: this.state, seq: this.seq, votes: this.votes } satisfies NetMsg);
        this.transport!.sendTo(peer, { t: 'lobby', lobby: this.lobby } satisfies NetMsg);
        this.emit();
        this.broadcastSeats();
        return;
      }
      case 'cmd': {
        const seat = this.seats.find((s) => s.id === peer)?.id ?? peer;
        if (msg.cmd.t === 'lobbyUpdate') {
          this.updateLobby(msg.cmd.lobby, seat);
          return;
        }
        const err = this.apply(msg.cmd, seat);
        if (err) this.transport!.sendTo(peer, { t: 'reject', nonce: msg.nonce, error: err } satisfies NetMsg);
        else this.transport!.sendTo(peer, { t: 'reject', nonce: msg.nonce, error: '' } satisfies NetMsg);
        return;
      }
      case 'ping':
        this.transport!.sendTo(peer, { t: 'pong', at: msg.at } satisfies NetMsg);
        return;
    }
  }
  updateLobby(patch: Partial<LobbyState>, seat: string) {
    // clients may only edit heroes assigned to their own seat
    if (patch.heroes && seat !== 'host') {
      const mine = patch.heroes.filter((h) => h.seat === seat);
      const others = this.lobby.heroes.filter((h) => h.seat !== seat);
      patch = { heroes: [...others, ...mine].slice(0, 5) };
    }
    this.lobby = { ...this.lobby, ...patch };
    this.transport?.broadcast({ t: 'lobby', lobby: this.lobby } satisfies NetMsg);
    this.emit();
  }
  private broadcast(events: DomainEvent[]) {
    if (this.role !== 'host' || !this.transport) return;
    this.transport.broadcast({ t: 'state', state: this.state, events, seq: this.seq, votes: this.votes, seats: this.seats } satisfies NetMsg);
  }
  private broadcastSeats() {
    this.transport?.broadcast({ t: 'seats', seats: this.seats } satisfies NetMsg);
  }
  startHostedGame(state: CampaignState) {
    this.state = state;
    this.lobby = { ...this.lobby, started: true };
    autosave(state);
    this.emit();
    this.broadcast([]);
    this.transport?.broadcast({ t: 'lobby', lobby: this.lobby } satisfies NetMsg);
  }

  // ------------------------------------------------------------------ network (client)
  attachClient(t: Transport, name: string, resumeSeat?: string) {
    this.role = 'client';
    this.transport = t;
    t.onMessage((_peer, msg) => this.onClientMessage(msg as NetMsg));
    t.onPeerLeft(() => {
      this.lastError = 'Conexão com o anfitrião perdida.';
      this.seats = this.seats.map((s) => (s.isHost ? { ...s, connected: false } : s));
      this.emit();
    });
    t.sendTo('host', { t: 'hello', name, version: __APP_VERSION__, seatId: resumeSeat } satisfies NetMsg);
  }
  private onClientMessage(msg: NetMsg) {
    switch (msg.t) {
      case 'welcome':
        this.localSeat = msg.seatId;
        this.seats = msg.seats;
        this.state = msg.state;
        this.votes = msg.votes;
        try {
          sessionStorage.setItem('mosteiro.seat', msg.seatId);
        } catch {
          /* ignore */
        }
        this.emit();
        return;
      case 'state':
        this.state = msg.state;
        this.votes = msg.votes;
        this.seats = msg.seats;
        this.emit(msg.events);
        return;
      case 'seats':
        this.seats = msg.seats;
        this.emit();
        return;
      case 'lobby':
        this.lobby = msg.lobby;
        this.emit();
        return;
      case 'reject': {
        const cb = this.pendingNonces.get(msg.nonce);
        this.pendingNonces.delete(msg.nonce);
        cb?.(msg.error || null);
        return;
      }
    }
  }
  private sendToHost(cmd: CampaignCommand | LocalCmd): Promise<string | null> {
    if (!this.transport) return Promise.resolve('Sem conexão.');
    const nonce = Math.random().toString(36).slice(2);
    return new Promise((resolve) => {
      this.pendingNonces.set(nonce, resolve);
      this.transport!.sendTo('host', { t: 'cmd', cmd, nonce } satisfies NetMsg);
      setTimeout(() => {
        if (this.pendingNonces.has(nonce)) {
          this.pendingNonces.delete(nonce);
          resolve('Sem resposta do anfitrião.');
        }
      }, 8000);
    });
  }
}

function voteLabel(s: CampaignState, cmd: CampaignCommand): string {
  if (cmd.t === 'explore') return cmd.optionId;
  if (cmd.t === 'collectRewards') return 'Seguir adiante';
  if (cmd.t === 'beginDungeon') return 'Iniciar a expedição';
  if (cmd.t === 'leaveBase') return 'Partir';
  return cmd.t;
}

export const session = new GameSession();
declare global {
  const __APP_VERSION__: string;
  const __BUILD_ID__: string;
}
