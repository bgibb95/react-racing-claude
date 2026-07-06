// Track scene: renders the circuit, runs the race loop, and bridges to the net
// layer. On the host it simulates every car authoritatively and publishes
// snapshots; on guests it predicts the local car and smooths remotes toward the
// latest snapshot. HUD scalars are pushed to the Zustand store at ~10Hz.

import Phaser from 'phaser';
import { Car } from '../entities/Car';
import { getSession } from '../../net/session';
import { touchInput } from '../input';
import { useGameStore } from '../../state/store';
import { CAR_COLORS, type CarState, type InputFrame } from '../../types';
import {
  CENTERLINE,
  CHECKPOINTS,
  ROAD_WIDTH,
  START,
  START_ANGLE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../track/circuit';

const NET_HZ = 30;
const NET_INTERVAL = 1 / NET_HZ;
const HUD_INTERVAL = 0.1;
const RECONCILE_SNAP = 140; // px error above which the local car hard-corrects
const REMOTE_SMOOTH = 14; // smoothing rate for remote cars

export class Track extends Phaser.Scene {
  private cars: Car[] = [];
  private carById = new Map<string, Car>();
  private localCar: Car | null = null;

  private isHost = true;
  private localId = 'solo';
  private totalLaps = 3;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  private inputSeq = 0;
  private netAcc = 0;
  private sendAcc = 0;
  private hudAcc = 0;
  private tick = 0;

  private latest = new Map<string, CarState>();

  constructor() {
    super('Track');
  }

  create(): void {
    const session = getSession();
    const store = useGameStore.getState();
    this.isHost = session ? session.isHost : true;
    this.localId = session ? session.localId : store.localId ?? 'solo';
    this.totalLaps = session ? session.totalLaps : store.totalLaps;

    this.drawTrack();
    this.buildCars();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#14351f');
    if (this.localCar) {
      this.cameras.main.startFollow(this.localCar.sprite, true, 0.08, 0.08);
    }
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.fitZoom, this);
    });
  }

  private fitZoom(): void {
    // Show a consistent slice of the world regardless of viewport size.
    const zoom = Math.min(this.scale.width / 1000, this.scale.height / 640, 1.1);
    this.cameras.main.setZoom(Math.max(0.5, zoom));
  }

  private buildCars(): void {
    const session = getSession();
    const store = useGameStore.getState();
    const players = session
      ? session.gridPlayers()
      : [
          {
            id: this.localId,
            name: store.localName,
            colorId: store.localColorId,
            isLocal: true,
          },
        ];

    players.forEach((p, i) => {
      const tint = CAR_COLORS.find((c) => c.id === p.colorId)?.value ?? 0xffffff;
      const car = new Car(this, {
        id: p.id,
        colorId: p.colorId,
        isLocal: p.isLocal,
        slot: i,
        name: p.name,
        tint,
      });
      this.cars.push(car);
      this.carById.set(p.id, car);
      if (p.isLocal) this.localCar = car;
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const racing = useGameStore.getState().raceStatus === 'racing';
    const input = this.readLocalInput();

    if (this.isHost) {
      this.hostUpdate(dt, racing, input);
    } else {
      this.guestUpdate(dt, racing, input);
    }

    for (const car of this.cars) car.render();
    this.pushHud(dt);
  }

  // ---- host ----
  private hostUpdate(dt: number, racing: boolean, localInput: InputFrame): void {
    const session = getSession();
    const raceTime = session ? session.now() : 0;

    if (racing) {
      for (const car of this.cars) {
        const inp = car.isLocal ? localInput : session?.getInput(car.id) ?? localInput;
        car.step(dt, inp);
        car.updateProgress(this.totalLaps, raceTime);
        if (!car.isLocal && session) car.ackSeq = session.getInput(car.id).seq;
      }
    }

    if (session) {
      this.netAcc += dt;
      if (this.netAcc >= NET_INTERVAL) {
        this.netAcc = 0;
        session.hostPublish(
          this.cars.map((c) => c.toState()),
          this.tick++,
        );
      }
    }
  }

  // ---- guest ----
  private guestUpdate(dt: number, racing: boolean, localInput: InputFrame): void {
    const session = getSession();
    if (!session) return;

    // Forward local input at a fixed rate.
    this.sendAcc += dt;
    if (this.sendAcc >= NET_INTERVAL) {
      this.sendAcc = 0;
      session.sendInput(localInput);
    }

    // Predict the local car for responsiveness.
    if (racing && this.localCar && !this.localCar.finished) {
      this.localCar.step(dt, localInput);
    }

    // Ingest authoritative snapshots.
    const snaps = session.drainSnapshots();
    let reconciled = false;
    for (const snap of snaps) {
      for (const cs of snap.cars) this.latest.set(cs.id, cs);
      reconciled = true;
    }

    // Remote cars: smooth toward the latest authoritative state.
    for (const car of this.cars) {
      if (car.isLocal) continue;
      const target = this.latest.get(car.id);
      if (target) car.smoothToward(target, REMOTE_SMOOTH, dt);
    }

    // Local car: reconcile against authority when a new snapshot arrived.
    if (reconciled && this.localCar) {
      const auth = this.latest.get(this.localId);
      if (auth) this.reconcileLocal(auth);
    }
  }

  private reconcileLocal(auth: CarState): void {
    const car = this.localCar!;
    const err = Math.hypot(auth.x - car.x, auth.y - car.y);
    if (err > RECONCILE_SNAP || auth.finished) {
      car.applyState(auth);
    } else {
      // Gentle correction so small divergences don't jitter the view.
      car.x += (auth.x - car.x) * 0.2;
      car.y += (auth.y - car.y) * 0.2;
      car.angle = Phaser.Math.Angle.RotateTo(car.angle, auth.angle, 0.2);
      car.lap = auth.lap;
      car.nextCheckpoint = auth.checkpoint;
      car.finished = auth.finished;
      car.finishMs = auth.finishMs;
    }
  }

  // ---- input ----
  private readLocalInput(): InputFrame {
    const c = this.cursors;
    const k = this.wasd;
    return {
      seq: ++this.inputSeq,
      throttle: c.up.isDown || k.W.isDown || touchInput.throttle,
      brake: c.down.isDown || k.S.isDown || touchInput.brake,
      left: c.left.isDown || k.A.isDown || touchInput.left,
      right: c.right.isDown || k.D.isDown || touchInput.right,
    };
  }

  // ---- HUD ----
  private pushHud(dt: number): void {
    this.hudAcc += dt;
    if (this.hudAcc < HUD_INTERVAL) return;
    this.hudAcc = 0;
    if (!this.localCar) return;

    const ranked = [...this.cars].sort((a, b) => b.progress - a.progress);
    const position = ranked.indexOf(this.localCar) + 1;
    const currentLap = this.localCar.finished
      ? this.totalLaps
      : Math.min(this.totalLaps, this.localCar.lap + 1);

    useGameStore.getState().setHud({
      lap: currentLap,
      totalLaps: this.totalLaps,
      position,
      playerCount: this.cars.length,
      speed: Math.round(Math.abs(this.localCar.speed) * 0.2),
    });
  }

  // ---- track rendering ----
  private drawTrack(): void {
    const g = this.add.graphics();
    g.setDepth(0);

    // Grass background.
    g.fillStyle(0x14351f, 1);
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const pts = CENTERLINE.map((p) => new Phaser.Math.Vector2(p.x, p.y));

    // Road base (dark asphalt) with a subtle kerb outline.
    g.lineStyle(ROAD_WIDTH + 14, 0x9b0014, 0.9); // red kerb edge
    g.strokePoints(pts, true, true);
    g.lineStyle(ROAD_WIDTH, 0x33333b, 1); // asphalt
    g.strokePoints(pts, true, true);

    // Dashed centre lane marking.
    const dash = this.add.graphics();
    dash.setDepth(1);
    dash.lineStyle(4, 0xd4d7dd, 0.35);
    for (let i = 0; i < CENTERLINE.length; i += 2) {
      const a = CENTERLINE[i];
      const b = CENTERLINE[(i + 1) % CENTERLINE.length];
      dash.lineBetween(a.x, a.y, b.x, b.y);
    }

    this.drawStartLine();
    this.drawCheckpointPips();
  }

  private drawStartLine(): void {
    const g = this.add.graphics();
    g.setDepth(2);
    const perp = START_ANGLE + Math.PI / 2;
    const cols = 8;
    const rows = 2;
    const cell = ROAD_WIDTH / cols;
    const px = Math.cos(perp);
    const py = Math.sin(perp);
    const fx = Math.cos(START_ANGLE);
    const fy = Math.sin(START_ANGLE);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dark = (r + c) % 2 === 0;
        g.fillStyle(dark ? 0x0a0a0b : 0xffffff, 1);
        const offAcross = (c - cols / 2 + 0.5) * cell;
        const offAlong = (r - rows / 2 + 0.5) * cell;
        const cx = START.x + px * offAcross + fx * offAlong;
        const cy = START.y + py * offAcross + fy * offAlong;
        g.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
      }
    }
  }

  private drawCheckpointPips(): void {
    // Faint markers so the racing line reads clearly (skip index 0 = start line).
    const g = this.add.graphics();
    g.setDepth(1);
    for (let i = 1; i < CHECKPOINTS.length; i++) {
      g.fillStyle(0xf0c419, 0.12);
      g.fillCircle(CHECKPOINTS[i].x, CHECKPOINTS[i].y, 10);
    }
  }
}
