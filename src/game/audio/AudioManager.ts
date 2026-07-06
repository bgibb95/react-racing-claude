// AudioManager: singleton wrapper around Phaser's sound system. Loads 5 audio
// files (engine, screech, crash, finish, music) from /audio/ and exposes a
// simple API for the game to trigger sounds. The countdown beep is generated
// procedurally with the Web Audio API (no file needed).
//
// Usage:
//   - Boot scene:    audio.preload(this)  in preload()
//   - Track scene:   audio.create(this)   in create()
//   - Game logic:    audio.updateEngine(rpm, throttle)
//                    audio.startScreech() / audio.stopScreech()
//                    audio.playCrash() / audio.playLap() / audio.playFinish()
//                    audio.playMusic() / audio.stopMusic()
//                    audio.playCountdownSequence(durationMs)
//                    audio.setMuted(bool)

import Phaser from 'phaser';

class AudioManager {
  private scene: Phaser.Scene | null = null;
  private engineSound: Phaser.Sound.BaseSound | null = null;
  private screechSound: Phaser.Sound.BaseSound | null = null;
  private crashSound: Phaser.Sound.BaseSound | null = null;
  private finishSound: Phaser.Sound.BaseSound | null = null;
  private musicSound: Phaser.Sound.BaseSound | null = null;

  private enginePlaying = false;
  private screechPlaying = false;
  private musicPlaying = false;
  private muted = false;

  /** Called from Boot scene's preload() to register audio assets. */
  preload(scene: Phaser.Scene): void {
    scene.load.audio('engine', '/audio/engine.wav');
    scene.load.audio('screech', '/audio/screech.wav');
    scene.load.audio('crash', '/audio/crash.wav');
    scene.load.audio('finish', '/audio/finish.mp3');
    scene.load.audio('music', '/audio/music.ogg');
  }

  /** Called from Track scene's create() to instantiate sound objects. */
  create(scene: Phaser.Scene): void {
    this.scene = scene;
    this.engineSound = scene.sound.add('engine', { loop: true, volume: 0 });
    this.screechSound = scene.sound.add('screech', { loop: true, volume: 0 });
    this.crashSound = scene.sound.add('crash', { volume: 0.6 });
    this.finishSound = scene.sound.add('finish', { volume: 0.7 });
    this.musicSound = scene.sound.add('music', { loop: true, volume: 0.25 });

    // Unlock audio context on first user interaction (browser autoplay policy).
    scene.sound.unlock();
  }

  /** Update engine sound based on RPM (0..1) and throttle state. */
  updateEngine(rpm: number, throttle: boolean): void {
    if (!this.engineSound) return;

    const shouldPlay = rpm > 0.01;
    if (shouldPlay && !this.enginePlaying) {
      this.engineSound.play();
      this.enginePlaying = true;
    } else if (!shouldPlay && this.enginePlaying) {
      this.engineSound.stop();
      this.enginePlaying = false;
    }

    if (this.enginePlaying) {
      const engineVolume = 0.55;

      // Pitch rises with RPM: 0.6 at idle, 1.8 at max.
      (this.engineSound as any).setRate(0.6 + rpm * 3.2);
      // Volume: base idle + RPM contribution + throttle boost (increased for a louder engine).
      (this.engineSound as any).volume =
        engineVolume + rpm * engineVolume + (throttle ? engineVolume + 0.2 : 0);
    }
  }

  /** Start the continuous tire screech loop (call when skidding begins). */
  startScreech(): void {
    if (!this.screechSound || this.screechPlaying) return;
    this.screechSound.play();
    (this.screechSound as any).volume = 0.4;
    this.screechPlaying = true;
  }

  /** Stop the tire screech loop (call when skidding ends). */
  stopScreech(): void {
    if (!this.screechSound || !this.screechPlaying) return;
    this.screechSound.stop();
    this.screechPlaying = false;
  }

  /** Play a one-shot crash impact sound. */
  playCrash(): void {
    this.crashSound?.play();
  }

  /** Play the lap completion chime. */
  playLap(): void {
    this.finishSound?.play();
  }

  /** Play the race finish fanfare. */
  playFinish(): void {
    this.finishSound?.play();
  }

  /** Start the background music loop. */
  playMusic(): void {
    if (!this.musicSound || this.musicPlaying) return;
    this.musicSound.play();
    this.musicPlaying = true;
  }

  /** Stop the background music loop. */
  stopMusic(): void {
    if (!this.musicSound || !this.musicPlaying) return;
    this.musicSound.stop();
    this.musicPlaying = false;
  }

  /** Mute/unmute all audio. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.scene) {
      this.scene.sound.mute = muted;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Schedule a countdown beep sequence: 3 low beeps at 25%/50%/75% of the
   * duration, then a high "GO" beep at 100%. Used during the pre-race countdown.
   */
  playCountdownSequence(durationMs: number): void {
    setTimeout(() => this.playCountdownBeep(false), durationMs * 0.25);
    setTimeout(() => this.playCountdownBeep(false), durationMs * 0.5);
    setTimeout(() => this.playCountdownBeep(false), durationMs * 0.75);
    setTimeout(() => this.playCountdownBeep(true), durationMs);
  }

  /**
   * Play a short procedural beep using the Web Audio API. Low pitch (440Hz)
   * for countdown lights, high pitch (880Hz) for the GO signal.
   */
  private playCountdownBeep(highPitch: boolean): void {
    if (this.muted) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = highPitch ? 880 : 440;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
      // Close context after beep to avoid resource leak.
      setTimeout(() => ctx.close(), 200);
    } catch {
      // Audio not available — ignore silently.
    }
  }
}

let instance: AudioManager | null = null;

export function getAudio(): AudioManager {
  if (!instance) instance = new AudioManager();
  return instance;
}
