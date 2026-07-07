// GameSync: orchestrates the room + race lifecycle over a PeerConnection and
// exposes a SceneSession to the Phaser scene. One class serves both roles; the
// `isHost` branch decides behaviour.
//
//  Host   : authoritative roster, countdown, race clock, end detection, results.
//           Relays snapshots produced by its own Phaser scene to all guests.
//  Guest  : mirrors host state into the store, buffers snapshots for the scene,
//           and forwards local input upstream.

import type { PeerConnection } from './PeerConnection';
import type { GridPlayer, SceneSession } from './session';
import type { GuestMessage, HostMessage } from './protocol';
import { useGameStore } from '../state/store';
import {
  EMPTY_INPUT,
  MAX_PLAYERS,
  type CarState,
  type InputFrame,
  type Player,
  type RaceResult,
  type WorldSnapshot,
} from '../types';

const COUNTDOWN_MS = 3200;
const FINISH_GRACE_MS = 25000; // race ends this long after the first finisher

export class GameSync implements SceneSession {
  readonly isHost: boolean;
  localId = '';
  totalLaps: number;

  private pc: PeerConnection;
  private players: Player[] = [];
  private inputs = new Map<string, InputFrame>();
  private snapshotQueue: WorldSnapshot[] = [];

  // host race state
  private raceStartWall = 0;
  private lastCars: CarState[] = [];
  private finishOrder: string[] = [];
  private finishDeadline: number | null = null;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;
  private status: 'lobby' | 'countdown' | 'racing' | 'finished' = 'lobby';

  constructor(pc: PeerConnection, opts: { totalLaps: number }) {
    this.pc = pc;
    this.isHost = pc.isHost;
    this.totalLaps = opts.totalLaps;
    this.wire();
  }

  // ------------------------------------------------------------------
  // SceneSession
  // ------------------------------------------------------------------
  gridPlayers(): GridPlayer[] {
    return this.players.map((p) => ({
      id: p.id,
      name: p.name,
      colorId: p.colorId,
      isLocal: p.id === this.localId,
    }));
  }

  sendInput(frame: InputFrame): void {
    if (this.isHost) {
      this.inputs.set(this.localId, frame);
    } else {
      this.pc.sendToHost({ t: 'input', input: frame });
    }
  }

  getInput(id: string): InputFrame {
    return this.inputs.get(id) ?? EMPTY_INPUT;
  }

  hostPublish(cars: CarState[], tick: number): void {
    if (!this.isHost) return;
    this.lastCars = cars;

    // Record finish order as cars complete their final lap.
    for (const c of cars) {
      if (c.finished && !this.finishOrder.includes(c.id)) {
        this.finishOrder.push(c.id);
        if (this.finishDeadline === null) {
          this.finishDeadline = this.now() + FINISH_GRACE_MS;
        }
      }
    }

    const snapshot: WorldSnapshot = {
      tick,
      status: this.status,
      countdownMs: 0,
      totalLaps: this.totalLaps,
      cars,
    };
    this.pc.broadcast({ t: 'snap', snapshot });

    // End condition: everyone still connected has finished, or grace expired.
    const activeIds = new Set(this.players.map((p) => p.id));
    const activeCars = cars.filter((c) => activeIds.has(c.id));
    const allDone =
      activeCars.length > 0 && activeCars.every((c) => c.finished);
    if (
      this.status === 'racing' &&
      (allDone ||
        (this.finishDeadline !== null && this.now() >= this.finishDeadline))
    ) {
      this.endRace();
    }
  }

  drainSnapshots(): WorldSnapshot[] {
    if (this.snapshotQueue.length === 0) return [];
    const out = this.snapshotQueue;
    this.snapshotQueue = [];
    return out;
  }

  now(): number {
    return this.raceStartWall ? performance.now() - this.raceStartWall : 0;
  }

  // ------------------------------------------------------------------
  // Host: lobby + race control
  // ------------------------------------------------------------------
  startRace(): void {
    if (!this.isHost) return;
    this.inputs.clear();
    this.finishOrder = [];
    this.finishDeadline = null;
    this.lastCars = [];
    this.raceStartWall = 0;

    this.setStatus('countdown');
    useGameStore.getState().setScreen('racing');
    this.broadcast({
      t: 'race',
      status: 'countdown',
      totalLaps: this.totalLaps,
    });
    this.runCountdownDisplay(() => this.beginRacing());
  }

  /** Host: adjust lap count while in the lobby. */
  setTotalLaps(n: number): void {
    if (!this.isHost || this.status !== 'lobby') return;
    this.totalLaps = n;
    useGameStore.getState().setHud({ totalLaps: n });
    useGameStore.setState({ totalLaps: n });
  }

  /** Guest: flip the ready flag (host is always ready). */
  toggleReady(ready: boolean): void {
    if (this.isHost) return;
    this.pc.sendToHost({ t: 'ready', ready });
  }

  private beginRacing(): void {
    this.raceStartWall = performance.now();
    this.setStatus('racing');
    this.broadcast({ t: 'race', status: 'racing', totalLaps: this.totalLaps });
  }

  private endRace(): void {
    this.setStatus('finished');
    const results = this.buildResults();
    useGameStore.getState().setResults(results);
    useGameStore.getState().setScreen('results');
    this.broadcast({ t: 'results', results });
  }

  private buildResults(): RaceResult[] {
    const byId = new Map(this.lastCars.map((c) => [c.id, c]));
    const ranked = [...this.players].sort((a, b) => {
      const ca = byId.get(a.id);
      const cb = byId.get(b.id);
      const fa = ca?.finished ? (ca.finishMs ?? Infinity) : Infinity;
      const fb = cb?.finished ? (cb.finishMs ?? Infinity) : Infinity;
      if (fa !== fb) return fa - fb;
      // Both unfinished: rank by progress (laps then checkpoint).
      const pa = (ca?.lap ?? 0) * 1000 + (ca?.checkpoint ?? 0);
      const pb = (cb?.lap ?? 0) * 1000 + (cb?.checkpoint ?? 0);
      return pb - pa;
    });
    return ranked.map((p, i) => {
      const c = byId.get(p.id);
      return {
        id: p.id,
        name: p.name,
        colorId: p.colorId,
        position: i + 1,
        finishMs: c?.finished ? c.finishMs : null,
      };
    });
  }

  // ------------------------------------------------------------------
  // Shared helpers
  // ------------------------------------------------------------------
  private setStatus(status: typeof this.status): void {
    this.status = status;
    useGameStore.getState().setRaceStatus(status);
  }

  private runCountdownDisplay(onDone: () => void): void {
    const store = useGameStore.getState();
    let remaining = COUNTDOWN_MS;
    store.setCountdownMs(remaining);
    this.clearCountdown();
    this.countdownTimer = setInterval(() => {
      remaining -= 100;
      useGameStore.getState().setCountdownMs(Math.max(0, remaining));
      if (remaining <= 0) {
        this.clearCountdown();
        onDone();
      }
    }, 100);
  }

  private clearCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private syncRoster(): void {
    useGameStore.getState().setPlayers([...this.players]);
    useGameStore.getState().setHud({ playerCount: this.players.length });
  }

  private broadcast(msg: HostMessage): void {
    this.pc.broadcast(msg);
  }

  // ------------------------------------------------------------------
  // Wiring
  // ------------------------------------------------------------------
  private wire(): void {
    const store = useGameStore.getState();

    this.pc.events.on('open', (id) => {
      this.localId = id;
      store.setLocalId(id);
      if (this.isHost) {
        // Register self as player #1 and open the lobby.
        this.players = [
          {
            id,
            name: store.localName,
            colorId: store.localColorId,
            isHost: true,
            ready: true,
            connected: true,
          },
        ];
        this.inputs.set(id, { ...EMPTY_INPUT });
        this.syncRoster();
        useGameStore.getState().setConnectionStatus('connected');
        useGameStore.getState().setScreen('lobby');
      }
    });

    this.pc.events.on('error', (reason) => {
      useGameStore.getState().setConnectionStatus('error', reason);
    });

    if (this.isHost) this.wireHost();
    else this.wireGuest();
  }

  private wireHost(): void {
    this.pc.events.on('guest-left', (peerId) => {
      this.players = this.players.filter((p) => p.id !== peerId);
      this.inputs.delete(peerId);
      this.syncRoster();
      if (this.status === 'lobby') {
        this.broadcast({ t: 'roster', players: [...this.players] });
      }
    });

    this.pc.events.on('message', ({ from, msg }) => {
      const m = msg as GuestMessage;
      switch (m.t) {
        case 'hello': {
          if (this.status !== 'lobby') {
            this.pc.sendTo(from, { t: 'reject', reason: 'in-progress' });
            return;
          }
          if (this.players.some((p) => p.id === from)) return; // duplicate
          if (this.players.length >= MAX_PLAYERS) {
            this.pc.sendTo(from, { t: 'reject', reason: 'full' });
            return;
          }
          this.players.push({
            id: from,
            name: m.name?.slice(0, 16) || 'Driver',
            colorId: m.colorId,
            isHost: false,
            ready: false,
            connected: true,
          });
          this.inputs.set(from, { ...EMPTY_INPUT });
          this.syncRoster();
          this.pc.sendTo(from, {
            t: 'welcome',
            yourId: from,
            hostId: this.localId,
            totalLaps: this.totalLaps,
            players: [...this.players],
          });
          this.broadcast({ t: 'roster', players: [...this.players] });
          break;
        }
        case 'ready': {
          const p = this.players.find((pl) => pl.id === from);
          if (p) {
            p.ready = m.ready;
            this.syncRoster();
            this.broadcast({ t: 'roster', players: [...this.players] });
          }
          break;
        }
        case 'input':
          this.inputs.set(from, m.input);
          break;
        case 'rematch':
          // Host controls rematch; ignore guest votes in v1.
          break;
      }
    });
  }

  private wireGuest(): void {
    this.pc.events.on('host-connected', () => {
      const store = useGameStore.getState();
      this.pc.sendToHost({
        t: 'hello',
        name: store.localName,
        colorId: store.localColorId,
      });
    });

    this.pc.events.on('host-left', () => {
      useGameStore
        .getState()
        .setConnectionStatus('error', 'Host closed the room.');
    });

    this.pc.events.on('message', ({ msg }) => {
      const m = msg as HostMessage;
      const store = useGameStore.getState();
      switch (m.t) {
        case 'welcome':
          this.localId = m.yourId;
          this.totalLaps = m.totalLaps;
          this.players = m.players;
          store.setLocalId(m.yourId);
          store.setPlayers([...this.players]);
          store.setConnectionStatus('connected');
          store.setScreen('lobby');
          store.setHud({
            totalLaps: m.totalLaps,
            playerCount: this.players.length,
          });
          break;
        case 'roster':
          this.players = m.players;
          store.setPlayers([...this.players]);
          store.setHud({ playerCount: this.players.length });
          break;
        case 'race':
          this.totalLaps = m.totalLaps;
          if (m.status === 'countdown') {
            this.setStatus('countdown');
            store.setScreen('racing');
            this.runCountdownDisplay(() => {
              /* GO is authoritative via the 'racing' message */
            });
          } else if (m.status === 'racing') {
            this.clearCountdown();
            store.setCountdownMs(0);
            this.setStatus('racing');
          } else if (m.status === 'lobby') {
            this.setStatus('lobby');
            store.setScreen('lobby');
          }
          break;
        case 'snap':
          this.snapshotQueue.push(m.snapshot);
          if (this.snapshotQueue.length > 8) this.snapshotQueue.shift();
          if (m.snapshot.status !== this.status)
            this.setStatus(m.snapshot.status);
          break;
        case 'results':
          this.clearCountdown();
          this.setStatus('finished');
          store.setResults(m.results);
          store.setScreen('results');
          break;
        case 'reject':
          store.setConnectionStatus('error', rejectReason(m.reason));
          break;
      }
    });
  }

  destroy(): void {
    this.clearCountdown();
    this.pc.destroy();
  }
}

function rejectReason(reason: 'full' | 'in-progress' | 'duplicate'): string {
  switch (reason) {
    case 'full':
      return 'That room is full (max 4 players).';
    case 'in-progress':
      return 'That race has already started.';
    case 'duplicate':
      return 'You are already in that room.';
  }
}
