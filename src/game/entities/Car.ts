// Car: arcade top-down kinematics + its Phaser visuals. The same integration runs
// on the host (authoritative for every car) and on guests (prediction for the
// local car), so simulated results match. Remote cars on guests are driven by
// smoothing toward snapshot targets rather than by step().

import Phaser from 'phaser';
import type { CarState, InputFrame } from '../../types';
import {
  CHECKPOINTS,
  CHECKPOINT_COUNT,
  CHECKPOINT_RADIUS,
  gridSlot,
  isOnTrack,
} from '../track/circuit';

const ENGINE = 640; // forward acceleration (px/s^2)
const BRAKE = 900; // braking / reverse acceleration
const MAX_SPEED = 560;
const MAX_REVERSE = 160;
const ROLL_DRAG = 1.1; // passive speed decay coefficient
const OFFTRACK_SPEED = 0.42; // fraction of max speed allowed off track
const OFFTRACK_DRAG = 5.5;
const TURN_RATE = 3.1; // rad/s at full steering & speed

export class Car {
  readonly id: string;
  readonly colorId: string;
  readonly isLocal: boolean;

  x: number;
  y: number;
  angle: number;
  speed = 0;

  lap = 0;
  nextCheckpoint = 1; // index 0 is start/finish; must be crossed last to score a lap
  finished = false;
  finishMs: number | null = null;
  ackSeq = 0;

  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    opts: { id: string; colorId: string; isLocal: boolean; slot: number; name: string; tint: number },
  ) {
    this.id = opts.id;
    this.colorId = opts.colorId;
    this.isLocal = opts.isLocal;

    const g = gridSlot(opts.slot);
    this.x = g.x;
    this.y = g.y;
    this.angle = g.angle;

    this.sprite = scene.add.sprite(this.x, this.y, 'car');
    this.sprite.setTint(opts.tint);
    this.sprite.setDepth(10);
    this.sprite.setRotation(this.angle);

    this.label = scene.add
      .text(this.x, this.y - 34, opts.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: opts.isLocal ? '#ffffff' : '#c7ccd3',
        stroke: '#0a0a0b',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  /** Progress metric for ranking (higher = further around the race). */
  get progress(): number {
    const passed = this.nextCheckpoint === 0 ? CHECKPOINT_COUNT : this.nextCheckpoint;
    return this.lap * CHECKPOINT_COUNT + passed;
  }

  /** Advance physics by dt seconds under the given input. */
  step(dt: number, input: InputFrame): void {
    if (this.finished) {
      // Coast to a stop after finishing.
      this.speed *= Math.max(0, 1 - 3 * dt);
    } else {
      const onTrack = isOnTrack(this.x, this.y);
      const maxSpeed = onTrack ? MAX_SPEED : MAX_SPEED * OFFTRACK_SPEED;

      if (input.throttle) this.speed += ENGINE * dt;
      if (input.brake) this.speed -= BRAKE * dt;

      // Passive drag (stronger off track).
      const drag = onTrack ? ROLL_DRAG : OFFTRACK_DRAG;
      this.speed -= this.speed * drag * dt;

      this.speed = Phaser.Math.Clamp(this.speed, -MAX_REVERSE, maxSpeed);

      // Steering scales with speed; reverse flips steering direction.
      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const speedFactor = Phaser.Math.Clamp(Math.abs(this.speed) / 140, 0, 1);
      this.angle += steer * TURN_RATE * dt * speedFactor * Math.sign(this.speed || 1);
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  /** Checkpoint / lap bookkeeping (host + local prediction). Returns true when a
   *  lap is completed. Marks finished when totalLaps is reached. */
  updateProgress(totalLaps: number, raceTimeMs: number): boolean {
    if (this.finished) return false;
    const target = CHECKPOINTS[this.nextCheckpoint];
    const dx = this.x - target.x;
    const dy = this.y - target.y;
    if (dx * dx + dy * dy > CHECKPOINT_RADIUS * CHECKPOINT_RADIUS) return false;

    if (this.nextCheckpoint === 0) {
      this.lap += 1;
      this.nextCheckpoint = 1;
      if (this.lap >= totalLaps) {
        this.finished = true;
        this.finishMs = raceTimeMs;
      }
      return true;
    }
    this.nextCheckpoint = this.nextCheckpoint + 1 >= CHECKPOINT_COUNT ? 0 : this.nextCheckpoint + 1;
    return false;
  }

  toState(): CarState {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      angle: this.angle,
      vx: Math.cos(this.angle) * this.speed,
      vy: Math.sin(this.angle) * this.speed,
      lap: this.lap,
      checkpoint: this.nextCheckpoint,
      finished: this.finished,
      finishMs: this.finishMs,
      ackSeq: this.ackSeq,
    };
  }

  /** Guest: hard-set authoritative state (used for the local car on big errors). */
  applyState(s: CarState): void {
    this.x = s.x;
    this.y = s.y;
    this.angle = s.angle;
    this.speed = Math.hypot(s.vx, s.vy) * Math.sign(s.vx * Math.cos(s.angle) + s.vy * Math.sin(s.angle) || 1);
    this.lap = s.lap;
    this.nextCheckpoint = s.checkpoint;
    this.finished = s.finished;
    this.finishMs = s.finishMs;
  }

  /** Guest: ease visuals toward an authoritative target (remote cars). */
  smoothToward(s: CarState, rate: number, dt: number): void {
    const k = Math.min(1, rate * dt);
    this.x += (s.x - this.x) * k;
    this.y += (s.y - this.y) * k;
    this.angle = angleLerp(this.angle, s.angle, k);
    this.lap = s.lap;
    this.nextCheckpoint = s.checkpoint;
    this.finished = s.finished;
    this.finishMs = s.finishMs;
  }

  render(): void {
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(this.angle);
    this.label.setPosition(this.x, this.y - 34);
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}

function angleLerp(a: number, b: number, t: number): number {
  let diff = Phaser.Math.Angle.Wrap(b - a);
  return a + diff * t;
}
