// Shared domain types used across networking, the Phaser game, and React UI.

export type PlayerId = string;

/** Which screen the React shell is showing. */
export type Screen = 'landing' | 'lobby' | 'racing' | 'results';

/** High-level race lifecycle, authoritative on the host and mirrored to guests. */
export type RaceStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

/** Selectable car colors (Porsche-inspired, no trademarks). value = tint hex. */
export interface CarColor {
  id: string;
  name: string;
  value: number; // Phaser tint / numeric hex, e.g. 0xd5001c
  css: string; // matching CSS color for the UI
}

export const CAR_COLORS: CarColor[] = [
  { id: 'guards-red', name: 'Guards Red', value: 0xd5001c, css: '#d5001c' },
  { id: 'gt-silver', name: 'GT Silver', value: 0xc7ccd3, css: '#c7ccd3' },
  {
    id: 'racing-yellow',
    name: 'Racing Yellow',
    value: 0xf5c518,
    css: '#f5c518',
  },
  { id: 'gulf-blue', name: 'Gulf Blue', value: 0x3fa9d6, css: '#3fa9d6' },
  { id: 'jet-black', name: 'Jet Black', value: 0x2b2b30, css: '#2b2b30' },
  { id: 'mint-green', name: 'Mint Green', value: 0x4fd18b, css: '#4fd18b' },
];

/** A connected participant. */
export interface Player {
  id: PlayerId;
  name: string;
  colorId: string;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
}

/** Per-frame input from a player (compact booleans + a monotonic sequence). */
export interface InputFrame {
  seq: number;
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

export const EMPTY_INPUT: InputFrame = {
  seq: 0,
  throttle: false,
  brake: false,
  left: false,
  right: false,
};

/** Authoritative state for a single car within a world snapshot. */
export interface CarState {
  id: PlayerId;
  x: number;
  y: number;
  angle: number; // radians
  vx: number;
  vy: number;
  lap: number;
  checkpoint: number; // index of next checkpoint expected
  finished: boolean;
  finishMs: number | null; // race-relative finish time in ms
  /** ack of the last input seq the host processed for this car (for reconciliation). */
  ackSeq: number;
}

/** Broadcast by the host each network tick. */
export interface WorldSnapshot {
  tick: number;
  status: RaceStatus;
  /** ms remaining in the pre-race countdown when status === 'countdown'. */
  countdownMs: number;
  totalLaps: number;
  cars: CarState[];
}

/** A single finisher, for the results screen. */
export interface RaceResult {
  id: PlayerId;
  name: string;
  colorId: string;
  position: number; // 1-based
  finishMs: number | null; // null = did not finish
}

export const MAX_PLAYERS = 4;
export const DEFAULT_LAPS = 3;
export const ROOM_CODE_LENGTH = 5;
