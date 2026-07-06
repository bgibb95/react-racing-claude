// Bridge between the framework-agnostic net layer and the Phaser scene.
//
// The Phaser Track scene is instantiated by Phaser (not React), so it reaches the
// active networking controller through this module-level singleton instead of via
// props. GameSync implements SceneSession; the scene depends only on this interface
// to avoid an import cycle.

import type { CarState, InputFrame, WorldSnapshot } from '../types';

export interface GridPlayer {
  id: string;
  name: string;
  colorId: string;
  isLocal: boolean;
}

export interface SceneSession {
  readonly isHost: boolean;
  readonly localId: string;
  readonly totalLaps: number;

  /** Players in grid order (host first, then guests by join order). */
  gridPlayers(): GridPlayer[];

  /** Guest -> host: publish this frame's local input (throttled by the scene). */
  sendInput(frame: InputFrame): void;

  /** Host: latest input received for a given car id (EMPTY if none yet). */
  getInput(id: string): InputFrame;

  /** Host: publish the authoritative snapshot for this tick. */
  hostPublish(cars: CarState[], tick: number): void;

  /** Guest: pull snapshots received since the last call (chronological). */
  drainSnapshots(): WorldSnapshot[];

  /** Race clock in ms since GO (host-authoritative). */
  now(): number;
}

let current: SceneSession | null = null;

export function setSession(session: SceneSession | null): void {
  current = session;
}

export function getSession(): SceneSession | null {
  return current;
}
