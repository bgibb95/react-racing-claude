// PeerJS wrapper implementing the star topology.
//
// - Host: owns a peer whose id encodes the room code; accepts guest DataConnections,
//   can broadcast to all and send to one.
// - Guest: opens a single DataConnection to the host by room code.
//
// Signalling is handled by the free PeerJS cloud broker; media/data traverses
// STUN/TURN (see ice.ts). No backend required.

import Peer, { type DataConnection } from 'peerjs';
import { Emitter } from './emitter';
import { buildIceServers } from './ice';
import type { GuestMessage, HostMessage, NetMessage } from './protocol';
import { ROOM_CODE_LENGTH } from '../types';

// Namespace the peer id to avoid collisions with other apps on the public broker.
const NS = 'apexrivals';
// Ambiguity-free alphabet (no 0/O, 1/I/L).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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
  /** local peer registered with broker; payload = own peer id */
  open: string;
  /** host: a guest's data connection opened; payload = guest peer id */
  'guest-connected': string;
  /** host: a guest disconnected; payload = guest peer id */
  'guest-left': string;
  /** guest: connection to host established */
  'host-connected': void;
  /** guest: lost connection to host */
  'host-left': void;
  /** any inbound message; payload = { from, msg } */
  message: { from: string; msg: NetMessage };
  /** fatal or notable error; payload = human-readable reason */
  error: string;
}

export class PeerConnection {
  readonly isHost: boolean;
  readonly events = new Emitter<PeerEvents>();

  private peer: Peer | null = null;
  private ownId = '';
  /** host: guestId -> connection. guest: single 'host' entry. */
  private connections = new Map<string, DataConnection>();
  private hostConn: DataConnection | null = null;
  private destroyed = false;

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
  static host(roomCode: string): PeerConnection {
    const pc = new PeerConnection(true);
    pc.ownId = peerIdForRoom(roomCode);
    pc.peer = new Peer(pc.ownId, { config: { iceServers: buildIceServers() } });
    pc.wireCommonPeerEvents();
    pc.peer.on('connection', (conn) => pc.acceptGuest(conn));
    return pc;
  }

  // ---- factory: guest ----
  static join(roomCode: string): PeerConnection {
    const pc = new PeerConnection(false);
    // Random guest id assigned by broker.
    pc.peer = new Peer({ config: { iceServers: buildIceServers() } });
    pc.wireCommonPeerEvents();
    pc.peer.on('open', () => pc.connectToHost(peerIdForRoom(roomCode)));
    return pc;
  }

  private wireCommonPeerEvents(): void {
    const peer = this.peer!;
    peer.on('open', (id) => {
      this.ownId = id;
      this.events.emit('open', id);
    });
    peer.on('error', (err) => {
      const type = (err as unknown as { type?: string }).type ?? 'unknown';
      this.events.emit('error', mapPeerError(type, this.isHost));
    });
    peer.on('disconnected', () => {
      // Lost the broker socket (not the p2p link). Try to re-register.
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
    conn.on('open', () => {
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
    conn.on('error', () => this.events.emit('error', 'Lost connection to host.'));
  }

  // ---- sending ----

  /** Host: send to a specific guest. */
  sendTo(peerId: string, msg: HostMessage): void {
    this.connections.get(peerId)?.send(msg);
  }

  /** Host: send to every connected guest. */
  broadcast(msg: HostMessage): void {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send(msg);
    }
  }

  /** Guest: send to the host. */
  sendToHost(msg: GuestMessage): void {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  destroy(): void {
    this.destroyed = true;
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
