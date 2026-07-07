// PeerJS wrapper implementing the star topology.
//
// - Host: owns a peer whose id encodes the room code; accepts guest DataConnections,
//   can broadcast to all and send to one.
// - Guest: opens a single DataConnection to the host by room code.
//
// Signalling is handled by the free PeerJS cloud broker; media/data traverses
// STUN/TURN (see ice.ts). No backend required. ICE servers are resolved
// asynchronously before the peer is created, and connection attempts are guarded
// by a timeout + ICE-failure detection so a failed cross-network connect surfaces
// an actionable error instead of hanging forever.

import Peer, { type DataConnection } from 'peerjs';
import { Emitter } from './emitter';
import { hasConfiguredTurn, loadIceServers } from './ice';
import type { GuestMessage, HostMessage, NetMessage } from './protocol';
import { ROOM_CODE_LENGTH } from '../types';

// Namespace the peer id to avoid collisions with other apps on the public broker.
const NS = 'apexrivals';
// Ambiguity-free alphabet (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// How long to wait for the broker to register us / the p2p link to open.
const REGISTER_TIMEOUT_MS = 15000;
const CONNECT_TIMEOUT_MS = 22000;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function peerIdForRoom(code: string): string {
  return `${NS}-${code.toUpperCase()}`;
}

interface PeerEvents extends Record<string, unknown> {
  open: string;
  'guest-connected': string;
  'guest-left': string;
  'host-connected': void;
  'host-left': void;
  message: { from: string; msg: NetMessage };
  error: string;
}

export class PeerConnection {
  readonly isHost: boolean;
  readonly events = new Emitter<PeerEvents>();

  private peer: Peer | null = null;
  private ownId = '';
  private connections = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private destroyed = false;

  private registerTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private opened = false; // broker registration
  private linked = false; // p2p link established

  private constructor(isHost: boolean) {
    this.isHost = isHost;
  }

  get id(): string {
    return this.ownId;
  }

  get peerIds(): string[] {
    return [...this.connections.keys()];
  }

  // ---- factory: host ----
  static async host(roomCode: string): Promise<PeerConnection> {
    const pc = new PeerConnection(true);
    const iceServers = await loadIceServers();
    if (pc.destroyed) return pc;
    pc.ownId = peerIdForRoom(roomCode);
    pc.peer = new Peer(pc.ownId, { config: { iceServers } });
    pc.wireCommonPeerEvents();
    pc.peer.on('connection', (conn) => pc.acceptGuest(conn));
    return pc;
  }

  // ---- factory: guest ----
  static async join(roomCode: string): Promise<PeerConnection> {
    const pc = new PeerConnection(false);
    const iceServers = await loadIceServers();
    if (pc.destroyed) return pc;
    pc.peer = new Peer({ config: { iceServers } });
    pc.wireCommonPeerEvents();
    // Guard: if the p2p link never opens, surface an actionable error.
    pc.connectTimer = setTimeout(() => {
      if (!pc.linked && !pc.destroyed)
        pc.events.emit('error', connectFailureMessage());
    }, CONNECT_TIMEOUT_MS);
    pc.peer.on('open', () => pc.connectToHost(peerIdForRoom(roomCode)));
    return pc;
  }

  private wireCommonPeerEvents(): void {
    const peer = this.peer!;
    // Guard: broker registration must complete.
    this.registerTimer = setTimeout(() => {
      if (!this.opened && !this.destroyed) {
        this.events.emit(
          'error',
          'Could not reach the signalling server. Check your connection and try again.',
        );
      }
    }, REGISTER_TIMEOUT_MS);

    peer.on('open', (id) => {
      this.opened = true;
      if (this.registerTimer) clearTimeout(this.registerTimer);
      this.ownId = id;
      this.events.emit('open', id);
    });
    peer.on('error', (err) => {
      const type = (err as unknown as { type?: string }).type ?? 'unknown';
      this.events.emit('error', mapPeerError(type, this.isHost));
    });
    peer.on('disconnected', () => {
      if (!this.destroyed) {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
  }

  // ---- host side ----
  private acceptGuest(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.watchIce(conn, conn.peer);
      this.events.emit('guest-connected', conn.peer);
    });
    conn.on('data', (data) => {
      this.events.emit('message', { from: conn.peer, msg: data as NetMessage });
    });
    const drop = () => {
      if (this.connections.delete(conn.peer)) {
        this.events.emit('guest-left', conn.peer);
      }
    };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  // ---- guest side ----
  private connectToHost(hostId: string): void {
    const conn = this.peer!.connect(hostId, {
      reliable: true,
      serialization: 'json',
    });
    this.hostConn = conn;
    this.watchIce(conn, 'host');
    conn.on('open', () => {
      this.linked = true;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.connections.set('host', conn);
      this.events.emit('host-connected', undefined);
    });
    conn.on('data', (data) => {
      this.events.emit('message', { from: hostId, msg: data as NetMessage });
    });
    const drop = () => {
      if (this.connections.delete('host')) {
        this.events.emit('host-left', undefined);
      }
    };
    conn.on('close', drop);
    conn.on('error', () =>
      this.events.emit('error', 'Lost connection to host.'),
    );
  }

  /** Attach ICE diagnostics + fast-fail on ICE 'failed' to the underlying
   *  RTCPeerConnection (available shortly after connect()/accept()). */
  private watchIce(conn: DataConnection, label: string): void {
    let tries = 0;
    const attach = () => {
      const rtc = (conn as unknown as { peerConnection?: RTCPeerConnection })
        .peerConnection;
      if (!rtc) {
        if (tries++ < 40 && !this.destroyed) setTimeout(attach, 250);
        return;
      }
      rtc.oniceconnectionstatechange = () => {
        const state = rtc.iceConnectionState;
        console.debug(`[ice:${label}] ${state}`);
        if (state === 'failed') {
          this.events.emit('error', connectFailureMessage());
        }
      };
    };
    attach();
  }

  // ---- sending ----
  sendTo(peerId: string, msg: HostMessage): void {
    this.connections.get(peerId)?.send(msg);
  }

  broadcast(msg: HostMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  sendToHost(msg: GuestMessage): void {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.registerTimer) clearTimeout(this.registerTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.events.clear();
    for (const conn of this.connections.values()) {
      try {
        conn.close();
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
    this.hostConn = null;
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.peer = null;
  }
}

function connectFailureMessage(): string {
  return hasConfiguredTurn()
    ? 'Could not connect to the other player. The TURN relay may be unreachable — check your TURN settings.'
    : 'Could not connect across networks. This needs a TURN relay — the free public one is unreliable. See the README to add free TURN credentials.';
}

function mapPeerError(type: string, isHost: boolean): string {
  switch (type) {
    case 'unavailable-id':
      return 'Room code is already in use. Try creating a new room.';
    case 'peer-unavailable':
      return isHost
        ? 'A peer became unavailable.'
        : 'No room found with that code. Check it and try again.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Network problem reaching the signalling server. Retrying…';
    case 'browser-incompatible':
      return 'This browser does not support WebRTC.';
    case 'ssl-unavailable':
      return 'Secure connection required (use https).';
    default:
      return `Connection error (${type}).`;
  }
}
