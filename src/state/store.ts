import { create } from 'zustand';
import type {
  Player,
  PlayerId,
  RaceResult,
  RaceStatus,
  Screen,
} from '../types';
import { CAR_COLORS, DEFAULT_LAPS } from '../types';

/** Low-frequency HUD data pushed from the Phaser scene (~10Hz), kept out of the
 *  per-frame render path so React only re-renders when these scalars change. */
export interface HudState {
  lap: number;
  totalLaps: number;
  position: number;
  playerCount: number;
  speed: number; // display units
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

interface GameStore {
  // ---- navigation ----
  screen: Screen;
  setScreen: (screen: Screen) => void;

  // ---- local player profile ----
  localId: PlayerId | null;
  localName: string;
  localColorId: string;
  setLocalId: (id: PlayerId) => void;
  setProfile: (name: string, colorId: string) => void;

  // ---- room / connection ----
  isHost: boolean;
  roomCode: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  setRoom: (opts: { isHost: boolean; roomCode: string }) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;

  // ---- lobby roster ----
  players: Player[];
  setPlayers: (players: Player[]) => void;

  // ---- race lifecycle ----
  raceStatus: RaceStatus;
  countdownMs: number;
  totalLaps: number;
  setRaceStatus: (status: RaceStatus) => void;
  setCountdownMs: (ms: number) => void;

  // ---- HUD (pushed from Phaser) ----
  hud: HudState;
  setHud: (hud: Partial<HudState>) => void;

  // ---- results ----
  results: RaceResult[];
  setResults: (results: RaceResult[]) => void;

  // ---- reset everything back to the landing screen ----
  leave: () => void;
}

function randomName(): string {
  const n = Math.floor(Math.random() * 90) + 10;
  return `Driver ${n}`;
}

const initialProfile = {
  localName: randomName(),
  localColorId: CAR_COLORS[0].id,
};

export const useGameStore = create<GameStore>((set) => ({
  screen: 'landing',
  setScreen: (screen) => set({ screen }),

  localId: null,
  localName: initialProfile.localName,
  localColorId: initialProfile.localColorId,
  setLocalId: (localId) => set({ localId }),
  setProfile: (localName, localColorId) => set({ localName, localColorId }),

  isHost: false,
  roomCode: null,
  connectionStatus: 'idle',
  connectionError: null,
  setRoom: ({ isHost, roomCode }) => set({ isHost, roomCode }),
  setConnectionStatus: (connectionStatus, connectionError = null) =>
    set({ connectionStatus, connectionError }),

  players: [],
  setPlayers: (players) => set({ players }),

  raceStatus: 'lobby',
  countdownMs: 0,
  totalLaps: DEFAULT_LAPS,
  setRaceStatus: (raceStatus) => set({ raceStatus }),
  setCountdownMs: (countdownMs) => set({ countdownMs }),

  hud: { lap: 0, totalLaps: DEFAULT_LAPS, position: 1, playerCount: 1, speed: 0 },
  setHud: (hud) => set((s) => ({ hud: { ...s.hud, ...hud } })),

  results: [],
  setResults: (results) => set({ results }),

  leave: () =>
    set({
      screen: 'landing',
      isHost: false,
      roomCode: null,
      connectionStatus: 'idle',
      connectionError: null,
      players: [],
      raceStatus: 'lobby',
      countdownMs: 0,
      results: [],
      hud: { lap: 0, totalLaps: DEFAULT_LAPS, position: 1, playerCount: 1, speed: 0 },
    }),
}));
