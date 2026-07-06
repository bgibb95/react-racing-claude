// Top-level networking entry points used by the React UI. Owns the single active
// GameSync instance and keeps the SceneSession registration in sync.

import { PeerConnection, generateRoomCode } from './PeerConnection';
import { GameSync } from './GameSync';
import { setSession } from './session';
import { useGameStore } from '../state/store';
import { DEFAULT_LAPS } from '../types';

let sync: GameSync | null = null;

export function getSync(): GameSync | null {
  return sync;
}

interface Profile {
  name: string;
  colorId: string;
}

export function hostRoom({ name, colorId }: Profile, totalLaps = DEFAULT_LAPS): string {
  teardown();
  const store = useGameStore.getState();
  store.setProfile(name, colorId);

  const code = generateRoomCode();
  store.setRoom({ isHost: true, roomCode: code });
  store.setConnectionStatus('connecting');
  store.setRaceStatus('lobby');

  const pc = PeerConnection.host(code);
  sync = new GameSync(pc, { totalLaps });
  setSession(sync);
  return code;
}

export function joinRoom({ name, colorId }: Profile, code: string): void {
  teardown();
  const store = useGameStore.getState();
  store.setProfile(name, colorId);

  const normalized = code.trim().toUpperCase();
  store.setRoom({ isHost: false, roomCode: normalized });
  store.setConnectionStatus('connecting');
  store.setRaceStatus('lobby');

  const pc = PeerConnection.join(normalized);
  sync = new GameSync(pc, { totalLaps: DEFAULT_LAPS });
  setSession(sync);
}

export function startRace(): void {
  sync?.startRace();
}

export function leaveRoom(): void {
  teardown();
  useGameStore.getState().leave();
}

function teardown(): void {
  if (sync) {
    sync.destroy();
    sync = null;
  }
  setSession(null);
}
