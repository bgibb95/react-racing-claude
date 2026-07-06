// Shared mutable input state for on-screen touch controls. React's TouchControls
// writes here; the Phaser scene reads it each frame and merges it with keyboard
// input. Kept as a plain module singleton to avoid per-frame event overhead.

export interface RawInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

export const touchInput: RawInput = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
};

export function setTouchInput(patch: Partial<RawInput>): void {
  Object.assign(touchInput, patch);
}

export function resetTouchInput(): void {
  touchInput.throttle = false;
  touchInput.brake = false;
  touchInput.left = false;
  touchInput.right = false;
}
