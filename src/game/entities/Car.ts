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

// Visual tuning.
const SMOKE_SPEED_THRESHOLD = 180; // px/s above which hard steering puffs smoke
const SKID_SPEED_THRESHOLD = 220;
const SKID_STEER_THRESHOLD = 0.5;
const SKID_DEPOSIT_INTERVAL = 0.05; // seconds between skid deposits

// Collision tuning.
const BARRIER_RADIUS = 20; // px — collision distance to a barrier
const CAR_COLLISION_RADIUS = 28; // px — collision distance between two cars
const BARRIER_BOUNCE = -0.3; // velocity multiplier on barrier hit
const CAR_BOUNCE_SPEED = 0.5; // speed multiplier on car-to-car hit
const COLLISION_COOLDOWN_MS = 200; // dedupe window per car pair

/** Shared scene-level graphics for persistent skid marks. */
let skidGraphics: Phaser.GameObjects.Graphics | null = null;

export function setSkidGraphics(g: Phaser.GameObjects.Graphics): void {
  skidGraphics = g;
}

/** Barrier positions collected from the track scenery for collision detection. */
export interface Barrier {
  x: number;
  y: number;
  angle: number;
}

let barriers: Barrier[] = [];

export function setBarriers(b: Barrier[]): void {
  barriers = b;
}

/** Callback fired when this car collides with a barrier or another car. */
export type CollisionCallback = (kind: 'barrier' | 'car') => void;
let collisionCallback: CollisionCallback | null = null;

export function setCollisionCallback(cb: CollisionCallback | null): void {
  collisionCallback = cb;
}

export class Car {
  readonly id: string;
  readonly colorId: string;
  readonly isLocal: boolean;

  x: number;
  y: number;
  angle: number;
  speed = 0;

  lap = 0;
  nextCheckpoint = 1;
  finished = false;
  finishMs: number | null = null;
  ackSeq = 0;
  /** True while the car is skidding (hard brake or hard steer at speed). */
  isSkidding = false;

  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly wheels: Phaser.GameObjects.Image[] = [];
  private readonly brakeLights: Phaser.GameObjects.Image[] = [];
  private readonly headlightCones: Phaser.GameObjects.Image[] = [];
  private readonly smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly exhaustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly scene: Phaser.Scene;
  private wheelRotation = 0;
  private lastInput: InputFrame = {
    seq: 0,
    throttle: false,
    brake: false,
    left: false,
    right: false,
  };
  private skidAcc = 0;
  /** Per-car-id timestamp of last collision (for dedupe). */
  private collisionCooldown = new Map<string, number>();

  constructor(
    scene: Phaser.Scene,
    opts: {
      id: string;
      colorId: string;
      isLocal: boolean;
      slot: number;
      name: string;
      tint: number;
    },
  ) {
    this.id = opts.id;
    this.colorId = opts.colorId;
    this.isLocal = opts.isLocal;
    this.scene = scene;

    const g = gridSlot(opts.slot);
    this.x = g.x;
    this.y = g.y;
    this.angle = g.angle;

    // Shadow (drawn first, below everything).
    this.shadow = scene.add.image(this.x, this.y + 2, 'shadow');
    this.shadow.setDepth(5);
    this.shadow.setAlpha(0.5);

    // Car body.
    this.sprite = scene.add.sprite(this.x, this.y, 'car');
    this.sprite.setTint(opts.tint);
    this.sprite.setDepth(10);
    this.sprite.setRotation(this.angle);

    // Wheels (4 corners).
    const wheelPositions = [
      { x: 8, y: 4 },
      { x: 8, y: 22 },
      { x: 40, y: 4 },
      { x: 40, y: 22 },
    ];
    for (const wp of wheelPositions) {
      const wheel = scene.add.image(
        this.x + wp.x - 24,
        this.y + wp.y - 13,
        'wheel',
      );
      wheel.setDepth(11);
      this.wheels.push(wheel);
    }

    // Brake lights (rear of car).
    for (let i = 0; i < 2; i++) {
      const bl = scene.add.image(this.x, this.y, 'brakeLight');
      bl.setDepth(12);
      bl.setVisible(false);
      this.brakeLights.push(bl);
    }

    // Headlight cones (forward of car). Origin (0, 0.5) places the apex at
    // the headlight position so the beam projects forward, not backward.
    for (let i = 0; i < 2; i++) {
      const hl = scene.add.image(this.x, this.y, 'headlightCone');
      hl.setOrigin(0, 0.5);
      hl.setDepth(8);
      hl.setAlpha(0.35);
      hl.setBlendMode(Phaser.BlendModes.ADD);
      hl.setScale(0.5, 0.6);
      this.headlightCones.push(hl);
    }

    // Tire smoke emitter.
    this.smokeEmitter = scene.add.particles(0, 0, 'smoke', {
      lifespan: 800,
      speed: { min: 20, max: 50 },
      scale: { start: 0.6, end: 1.4 },
      alpha: { start: 0.5, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: 50,
      quantity: 1,
      emitting: false,
    });
    this.smokeEmitter.setDepth(9);

    // Exhaust emitter.
    this.exhaustEmitter = scene.add.particles(0, 0, 'exhaust', {
      lifespan: 600,
      speed: { min: 30, max: 70 },
      scale: { start: 0.4, end: 1.0 },
      alpha: { start: 0.6, end: 0 },
      frequency: 40,
      quantity: 1,
      emitting: false,
    });
    this.exhaustEmitter.setDepth(9);

    // Label.
    this.label = scene.add
      .text(this.x, this.y - 34, opts.name, {
        fontFamily: 'Rajdhani, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: opts.isLocal ? '#ffffff' : '#c7ccd3',
        stroke: '#0a0a0b',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);
  }

  get progress(): number {
    const passed =
      this.nextCheckpoint === 0 ? CHECKPOINT_COUNT : this.nextCheckpoint;
    return this.lap * CHECKPOINT_COUNT + passed;
  }

  step(dt: number, input: InputFrame): void {
    this.lastInput = input;
    if (this.finished) {
      this.speed *= Math.max(0, 1 - 3 * dt);
    } else {
      const onTrack = isOnTrack(this.x, this.y);
      const maxSpeed = onTrack ? MAX_SPEED : MAX_SPEED * OFFTRACK_SPEED;

      if (input.throttle) this.speed += ENGINE * dt;
      if (input.brake) this.speed -= BRAKE * dt;

      const drag = onTrack ? ROLL_DRAG : OFFTRACK_DRAG;
      this.speed -= this.speed * drag * dt;

      this.speed = Phaser.Math.Clamp(this.speed, -MAX_REVERSE, maxSpeed);

      const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const speedFactor = Phaser.Math.Clamp(Math.abs(this.speed) / 140, 0, 1);
      this.angle +=
        steer * TURN_RATE * dt * speedFactor * Math.sign(this.speed || 1);
    }

    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  /**
   * Check and resolve collisions with barriers and other cars. Called after
   * step() in the host/guest update loops. Emits a sound via collisionCallback
   * when a new collision occurs (deduped per pair within COLLISION_COOLDOWN_MS).
   */
  checkCollisions(otherCars: Car[]): void {
    const now = performance.now();

    // Barrier collisions.
    for (const b of barriers) {
      const dx = this.x - b.x;
      const dy = this.y - b.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < BARRIER_RADIUS * BARRIER_RADIUS) {
        const key = `barrier:${b.x},${b.y}`;
        const last = this.collisionCooldown.get(key) ?? 0;
        if (now - last < COLLISION_COOLDOWN_MS) continue;
        this.collisionCooldown.set(key, now);

        // Push car out of barrier along the collision normal.
        const dist = Math.sqrt(distSq) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        this.x = b.x + nx * BARRIER_RADIUS;
        this.y = b.y + ny * BARRIER_RADIUS;

        // Reflect velocity: reverse speed component along the normal.
        const vDotN = Math.cos(this.angle) * nx + Math.sin(this.angle) * ny;
        if (vDotN < 0) {
          this.speed *= BARRIER_BOUNCE;
        }
        collisionCallback?.('barrier');
      }
    }

    // Car-to-car collisions.
    for (const other of otherCars) {
      if (other === this) continue;
      const dx = other.x - this.x;
      const dy = other.y - this.y;
      const distSq = dx * dx + dy * dy;
      const minDist = CAR_COLLISION_RADIUS;
      if (distSq < minDist * minDist) {
        // Use sorted id pair as dedupe key so both cars don't double-trigger.
        const key =
          this.id < other.id
            ? `car:${this.id}:${other.id}`
            : `car:${other.id}:${this.id}`;
        const last = this.collisionCooldown.get(key) ?? 0;
        if (now - last < COLLISION_COOLDOWN_MS) continue;
        this.collisionCooldown.set(key, now);

        const dist = Math.sqrt(distSq) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        // Push both cars apart equally.
        this.x -= nx * overlap * 0.5;
        this.y -= ny * overlap * 0.5;
        other.x += nx * overlap * 0.5;
        other.y += ny * overlap * 0.5;

        // Dampen speeds on impact.
        this.speed *= CAR_BOUNCE_SPEED;
        other.speed *= CAR_BOUNCE_SPEED;

        collisionCallback?.('car');
      }
    }
  }

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
    this.nextCheckpoint =
      this.nextCheckpoint + 1 >= CHECKPOINT_COUNT ? 0 : this.nextCheckpoint + 1;
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

  applyState(s: CarState): void {
    this.x = s.x;
    this.y = s.y;
    this.angle = s.angle;
    this.speed =
      Math.hypot(s.vx, s.vy) *
      Math.sign(s.vx * Math.cos(s.angle) + s.vy * Math.sin(s.angle) || 1);
    this.lap = s.lap;
    this.nextCheckpoint = s.checkpoint;
    this.finished = s.finished;
    this.finishMs = s.finishMs;
  }

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

  render(dt: number = 1 / 60): void {
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);

    // Shadow.
    this.shadow.setPosition(this.x + sin * 3, this.y - cos * 3);
    this.shadow.setRotation(this.angle);
    const speedFrac = Math.min(1, Math.abs(this.speed) / MAX_SPEED);
    this.shadow.setScale(1 + speedFrac * 0.2, 1 - speedFrac * 0.1);

    // Car body.
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(this.angle);

    // Wheels rotate with speed.
    this.wheelRotation += this.speed * 0.02;
    const wheelLocal = [
      { x: -16, y: -9 },
      { x: -16, y: 9 },
      { x: 16, y: -9 },
      { x: 16, y: 9 },
    ];
    for (let i = 0; i < this.wheels.length; i++) {
      const wl = wheelLocal[i];
      const wx = this.x + cos * wl.x - sin * wl.y;
      const wy = this.y + sin * wl.x + cos * wl.y;
      this.wheels[i].setPosition(wx, wy);
      this.wheels[i].setRotation(this.wheelRotation);
    }

    // Brake lights (rear of car, glow when braking).
    const braking = this.lastInput.brake && this.speed > 50;
    const brakeLocal = [
      { x: -20, y: -8 },
      { x: -20, y: 8 },
    ];
    for (let i = 0; i < this.brakeLights.length; i++) {
      const bl = brakeLocal[i];
      const bx = this.x + cos * bl.x - sin * bl.y;
      const by = this.y + sin * bl.x + cos * bl.y;
      this.brakeLights[i].setPosition(bx, by);
      this.brakeLights[i].setVisible(braking);
      this.brakeLights[i].setScale(braking ? 1.2 : 1);
    }

    // Headlight cones (forward of car). Positions match the headlight pixels
    // drawn on the car texture (~x=20, y=±7 in centered local coords).
    const headlightLocal = [
      { x: 20, y: -7 },
      { x: 20, y: 7 },
    ];
    for (let i = 0; i < this.headlightCones.length; i++) {
      const hl = headlightLocal[i];
      const hx = this.x + cos * hl.x - sin * hl.y;
      const hy = this.y + sin * hl.x + cos * hl.y;
      this.headlightCones[i].setPosition(hx, hy);
      this.headlightCones[i].setRotation(this.angle);
      this.headlightCones[i].setAlpha(0.25 + speedFrac * 0.15);
    }

    // Label.
    this.label.setPosition(this.x, this.y - 34);

    // Tire smoke when steering hard at speed.
    const steerMag =
      (this.lastInput.left ? 1 : 0) + (this.lastInput.right ? 1 : 0);
    const hardSteer =
      steerMag > 0 && Math.abs(this.speed) > SMOKE_SPEED_THRESHOLD;
    this.smokeEmitter.emitting = hardSteer;
    if (hardSteer) {
      // Emit from rear wheels.
      const rearX = this.x + cos * -16;
      const rearY = this.y + sin * -16;
      this.smokeEmitter.setPosition(rearX, rearY);
    }

    // Exhaust when throttling hard.
    const throttling = this.lastInput.throttle && this.speed > 100;
    this.exhaustEmitter.emitting = throttling;
    if (throttling) {
      const exX = this.x + cos * -22;
      const exY = this.y + sin * -22;
      this.exhaustEmitter.setPosition(exX, exY);
    }

    // Skid marks: deposit when braking hard or turning hard at speed.
    const skidding =
      (this.lastInput.brake && Math.abs(this.speed) > SKID_SPEED_THRESHOLD) ||
      (steerMag > 0 &&
        Math.abs(this.speed) > SKID_SPEED_THRESHOLD &&
        Math.abs(this.speed) > SKID_STEER_THRESHOLD * MAX_SPEED);
    this.isSkidding = skidding;
    if (skidding && skidGraphics && isOnTrack(this.x, this.y)) {
      this.skidAcc += dt;
      if (this.skidAcc >= SKID_DEPOSIT_INTERVAL) {
        this.skidAcc = 0;
        this.depositSkid(cos, sin);
      }
    } else {
      this.skidAcc = 0;
    }
  }

  private depositSkid(cos: number, sin: number): void {
    if (!skidGraphics) return;
    // Two short marks at the rear wheel positions.
    const rearOffsets = [
      { x: -16, y: -9 },
      { x: -16, y: 9 },
    ];
    for (const ro of rearOffsets) {
      const rx = this.x + cos * ro.x - sin * ro.y;
      const ry = this.y + sin * ro.x + cos * ro.y;
      const mark = this.scene.add.image(rx, ry, 'skid');
      mark.setDepth(2);
      mark.setRotation(this.angle);
      mark.setAlpha(0.6);
      mark.setScale(1 + Math.random() * 0.3, 0.8 + Math.random() * 0.4);
      // Fade out over time.
      this.scene.tweens.add({
        targets: mark,
        alpha: 0,
        duration: 8000,
        ease: 'Linear',
        onComplete: () => mark.destroy(),
      });
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
    this.shadow.destroy();
    for (const w of this.wheels) w.destroy();
    for (const bl of this.brakeLights) bl.destroy();
    for (const hl of this.headlightCones) hl.destroy();
    this.smokeEmitter.destroy();
    this.exhaustEmitter.destroy();
  }
}

function angleLerp(a: number, b: number, t: number): number {
  let diff = Phaser.Math.Angle.Wrap(b - a);
  return a + diff * t;
}
