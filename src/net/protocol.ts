// Wire protocol for the host-authoritative star topology.
//
// Guests send `hello`/`ready`/`input`; the host sends `welcome`/`roster`/
// `race`/`snapshot`/`results`/`reject`. Every message carries a short `t`
// discriminator to keep the JSON compact over the data channel.

import type {
  InputFrame,
  Player,
  RaceResult,
  RaceStatus,
  WorldSnapshot,
} from '../types';

// ---- Guest -> Host ----

export interface HelloMsg {
  t: 'hello';
  name: string;
  colorId: string;
}

export interface ReadyMsg {
  t: 'ready';
  ready: boolean;
}

export interface InputMsg {
  t: 'input';
  input: InputFrame;
}

export interface RematchMsg {
  t: 'rematch';
}

export type GuestMessage = HelloMsg | ReadyMsg | InputMsg | RematchMsg;

// ---- Host -> Guest ----

export interface WelcomeMsg {
  t: 'welcome';
  /** the guest's own id (echoed for clarity) */
  yourId: string;
  hostId: string;
  totalLaps: number;
  players: Player[];
}

export interface RosterMsg {
  t: 'roster';
  players: Player[];
}

export interface RaceControlMsg {
  t: 'race';
  status: RaceStatus;
  totalLaps: number;
}

export interface SnapshotMsg {
  t: 'snap';
  snapshot: WorldSnapshot;
}

export interface ResultsMsg {
  t: 'results';
  results: RaceResult[];
}

export interface RejectMsg {
  t: 'reject';
  reason: 'full' | 'in-progress' | 'duplicate';
}

export type HostMessage =
  | WelcomeMsg
  | RosterMsg
  | RaceControlMsg
  | SnapshotMsg
  | ResultsMsg
  | RejectMsg;

export type NetMessage = GuestMessage | HostMessage;
