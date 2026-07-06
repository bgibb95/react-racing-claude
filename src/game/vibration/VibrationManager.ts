// VibrationManager: handles haptic feedback using the HTML5 Vibration API
// (for mobile devices) and the Gamepad API (for connected controllers).
//
// Methods:
//   - vibrateCollision(intensity): short strong rumble on impacts
//   - vibrateBeep(): tiny pulse on countdown beeps
//   - vibrateLap(): double pulse on lap completion
//   - vibrateFinish(): celebratory pattern on race finish

class VibrationManager {
  private muted = false;

  constructor() {
    // Initialize muted state from localStorage to match audio preferences
    this.muted = localStorage.getItem('apex-muted') === 'true';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** Trigger a haptic pulse across mobile and connected gamepads. */
  vibrate(pattern: number | number[], intensity: number = 1.0): void {
    if (this.muted) return;

    // 1. Mobile Vibration API
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Ignore security/permission errors
      }
    }

    // 2. Gamepad Rumble API
    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      try {
        const gamepads = navigator.getGamepads();
        const duration = Array.isArray(pattern)
          ? pattern.reduce((a, b) => a + b, 0)
          : pattern;

        for (const gp of gamepads) {
          if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
            gp.vibrationActuator
              .playEffect('dual-rumble', {
                startDelay: 0,
                duration: Math.min(duration, 1000), // cap at 1s
                strongMagnitude: intensity,
                weakMagnitude: intensity * 0.5,
              })
              .catch(() => {});
          }
        }
      } catch {
        // Ignore gamepad access errors
      }
    }
  }

  /** Trigger a short, sharp vibration on collisions. */
  vibrateCollision(intensity: number = 1.0): void {
    // 120ms strong pulse
    this.vibrate(120, intensity);
  }

  /** Trigger a tiny vibration on countdown beeps. */
  vibrateBeep(): void {
    // 40ms light pulse
    this.vibrate(40, 0.3);
  }

  /** Trigger a double pulse on lap completion. */
  vibrateLap(): void {
    // 100ms vibrate, 50ms pause, 100ms vibrate
    this.vibrate([100, 50, 100], 0.6);
  }

  /** Trigger a celebratory pattern on race finish. */
  vibrateFinish(): void {
    // Celebratory rhythm
    this.vibrate([150, 100, 150, 100, 300], 0.8);
  }

  /** Trigger a continuous or pulsed vibration when driving on grass. */
  vibrateGrass(intensity: number = 0.25): void {
    // A short, light pulse (e.g., 50ms) that can be triggered repeatedly or periodically
    this.vibrate(50, intensity);
  }
}

let instance: VibrationManager | null = null;

export function getVibration(): VibrationManager {
  if (!instance) instance = new VibrationManager();
  return instance;
}
