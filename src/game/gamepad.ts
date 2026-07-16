// Gamepad / controller support. Listens for connect/disconnect events and
// polls the active gamepad each frame (the standard pattern — the Gamepad API
// only fires events on connect/disconnect, not for button state). Writes into
// a singleton that the Phaser scene reads alongside keyboard + touch input.
//
// Standard mapping (W3C):
//   buttons[0]=A, [1]=B, [2]=X, [3]=Y, [4]=LB, [5]=RB, [6]=LT, [7]=RT
//   buttons[12..15] = d-pad up/down/left/right
//   axes[0] = left stick X, axes[1] = left stick Y

import type { RawInput } from './input';
import { useGameStore } from '../state/store';

const STEER_DEADZONE = 0.25; // |x| below this is treated as centered
const TRIGGER_THRESHOLD = 0.3; // |value| above this counts as pressed

export const gamepadInput: RawInput = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
};

let connected = false;
let rafId: number | null = null;

export function isGamepadConnected(): boolean {
  return connected;
}

function setConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  useGameStore.getState().setGamepadConnected(value);
}

function onConnect(e: GamepadEvent): void {
  console.info('[gamepad] connected:', e.gamepad.id);
  setConnected(true);
}

function onDisconnect(_e: GamepadEvent): void {
  // Check if any pad remains connected (the disconnected one may not be the
  // one we were tracking — the API doesn't expose a stable index).
  const pads = navigator.getGamepads?.() ?? [];
  const anyConnected = Array.from(pads).some((p) => p !== null);
  setConnected(anyConnected);
  if (!anyConnected) {
    gamepadInput.throttle = false;
    gamepadInput.brake = false;
    gamepadInput.left = false;
    gamepadInput.right = false;
  }
}

function poll(): void {
  const pads = navigator.getGamepads?.() ?? [];
  let throttle = false;
  let brake = false;
  let left = false;
  let right = false;

  for (const pad of pads) {
    if (!pad) continue;

    // Triggers (analog — use .value for a responsive threshold).
    if ((pad.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD) throttle = true; // RT
    if ((pad.buttons[6]?.value ?? 0) > TRIGGER_THRESHOLD) brake = true; // LT

    // Face buttons as throttle/brake alternates (A/B on Xbox, Cross/Circle on PS).
    if (pad.buttons[0]?.pressed) throttle = true;
    if (pad.buttons[1]?.pressed) brake = true;

    // D-pad steering.
    if (pad.buttons[14]?.pressed) left = true;
    if (pad.buttons[15]?.pressed) right = true;

    // Analog steering via left stick X.
    const steerAxis = pad.axes[0] ?? 0;
    if (Math.abs(steerAxis) > STEER_DEADZONE) {
      if (steerAxis < 0) left = true;
      if (steerAxis > 0) right = true;
    }
  }

  gamepadInput.throttle = throttle;
  gamepadInput.brake = brake;
  gamepadInput.left = left;
  gamepadInput.right = right;

  rafId = requestAnimationFrame(poll);
}

export function initGamepad(): void {
  if (typeof window === 'undefined') return;
  if (rafId !== null) return; // already initialized

  window.addEventListener('gamepadconnected', onConnect);
  window.addEventListener('gamepaddisconnected', onDisconnect);

  // Some browsers don't fire gamepadconnected for pads already attached at
  // page load — seed the connected state from the current snapshot.
  const pads = navigator.getGamepads?.() ?? [];
  setConnected(Array.from(pads).some((p) => p !== null));

  rafId = requestAnimationFrame(poll);
}

export function disposeGamepad(): void {
  if (typeof window === 'undefined') return;
  window.removeEventListener('gamepadconnected', onConnect);
  window.removeEventListener('gamepaddisconnected', onDisconnect);
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  setConnected(false);
  gamepadInput.throttle = false;
  gamepadInput.brake = false;
  gamepadInput.left = false;
  gamepadInput.right = false;
}
