// Top-level networking entry points used by the React UI. Owns the single active
// GameSync instance and keeps the SceneSession registration in sync. Peer creation
// is async (ICE servers are resolved first); a generation counter guards against a
// user leaving before the async setup resolves.

import { PeerConnection, generateRoomCode } from './PeerConnection';
import { GameSync } from './GameSync';
import { setSession } from './session';
import { useGameStore } from '../state/store';
import { DEFAULT_LAPS } from '../types';

let sync: GameSync | null = null;
let generation = 0;

export function getSync(): GameSync | null {
  return sync;
}

interface Profile {
  name: string;
  colorId: string;
}

export function hostRoom(
  { name, colorId }: Profile,
  totalLaps = DEFAULT_LAPS,
): string {
  const gen = beginSession();
  const store = useGameStore.getState();
  store.setProfile(name, colorId);

  const code = generateRoomCode();
  store.setRoom({ isHost: true, roomCode: code });
  store.setConnectionStatus('connecting');
  store.setRaceStatus('lobby');

  PeerConnection.host(code)
    .then((pc) => attach(pc, gen, { totalLaps }))
    .catch(onSetupError);
  return code;
}

export function joinRoom({ name, colorId }: Profile, code: string): void {
  const gen = beginSession();
  const store = useGameStore.getState();
  store.setProfile(name, colorId);

  const normalized = code.trim().toUpperCase();
  store.setRoom({ isHost: false, roomCode: normalized });
  store.setConnectionStatus('connecting');
  store.setRaceStatus('lobby');

  PeerConnection.join(normalized)
    .then((pc) => attach(pc, gen, { totalLaps: DEFAULT_LAPS }))
    .catch(onSetupError);
}

export function startRace(): void {
  sync?.startRace();
}

export function leaveRoom(): void {
  teardown();
  useGameStore.getState().leave();
}

function beginSession(): number {
  teardown();
  return ++generation;
}

function attach(
  pc: PeerConnection,
  gen: number,
  opts: { totalLaps: number },
): void {
  // The user left (or started another session) before this resolved.
  if (gen !== generation) {
    pc.destroy();
    return;
  }
  sync = new GameSync(pc, opts);
  setSession(sync);
}

function onSetupError(err: unknown): void {
  useGameStore
    .getState()
    .setConnectionStatus(
      'error',
      err instanceof Error ? err.message : 'Failed to start networking.',
    );
}

function teardown(): void {
  generation++;
  if (sync) {
    sync.destroy();
    sync = null;
  }
  setSession(null);
}
