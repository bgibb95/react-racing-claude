// Track scene: renders the circuit, runs the race loop, and bridges to the net
// layer. On the host it simulates every car authoritatively and publishes
// snapshots; on guests it predicts the local car and smooths remotes toward the
// latest snapshot. HUD scalars are pushed to the Zustand store at ~10Hz.

import Phaser from 'phaser';
import {
  Car,
  setBarriers,
  setCollisionCallback,
  setSkidGraphics,
  type Barrier,
} from '../entities/Car';
import { getSession } from '../../net/session';
import { touchInput } from '../input';
import { useGameStore } from '../../state/store';
import { CAR_COLORS, type CarState, type InputFrame } from '../../types';
import {
  CENTERLINE,
  CHECKPOINTS,
  isOnTrack,
  ROAD_WIDTH,
  START,
  START_ANGLE,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../track/circuit';
import { getAudio } from '../audio/AudioManager';
import { getVibration } from '../vibration/VibrationManager';

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
  private lastInput: InputFrame = {
    seq: 0,
    throttle: false,
    brake: false,
    left: false,
    right: false,
  };

  private latest = new Map<string, CarState>();

  // Visual state.
  private dashGraphics!: Phaser.GameObjects.Graphics;
  private dashOffset = 0;
  private clouds: Phaser.GameObjects.Image[] = [];
  private positionArrow!: Phaser.GameObjects.Image;
  private cameraShake = 0;
  private baseZoom = 1;

  // Audio state.
  private prevRaceStatus: 'lobby' | 'countdown' | 'racing' | 'finished' =
    'lobby';
  private prevLocalLap = 0;
  private grassVibrateAcc = 0;

  constructor() {
    super('Track');
  }

  create(): void {
    const session = getSession();
    const store = useGameStore.getState();
    this.isHost = session ? session.isHost : true;
    this.localId = session ? session.localId : (store.localId ?? 'solo');
    this.totalLaps = session ? session.totalLaps : store.totalLaps;

    this.drawSky();
    this.drawMountains();
    this.drawSun();
    this.drawClouds();
    this.drawTrack();
    this.drawScenery();
    this.buildCars();

    // Skid-mark graphics layer (shared by all cars).
    const skidLayer = this.add.graphics();
    skidLayer.setDepth(2);
    setSkidGraphics(skidLayer);

    // Audio & Vibration: instantiate sounds and wire collision callback.
    const audio = getAudio();
    audio.create(this);
    audio.setMuted(store.muted);

    const vibration = getVibration();
    vibration.setMuted(store.muted);

    setCollisionCallback((kind) => {
      audio.playCrash();
      // Vibrate slightly less for car-to-car bumps than barrier hits
      vibration.vibrateCollision(kind === 'car' ? 0.6 : 1.0);
    });

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as typeof this.wasd;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#14351f');
    if (this.localCar) {
      this.cameras.main.startFollow(this.localCar.sprite, true, 0.08, 0.08);
    }
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);

    // Position arrow for off-screen local car.
    this.positionArrow = this.add.image(0, 0, 'spark');
    this.positionArrow.setVisible(false);
    this.positionArrow.setDepth(30);
    this.positionArrow.setTint(0xd5001c);
    this.positionArrow.setScale(2);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.fitZoom, this);
    });
  }

  private fitZoom(): void {
    const zoom = Math.min(
      this.scale.width / 1000,
      this.scale.height / 640,
      1.1,
    );
    // Bump zoom slightly on small (mobile) screens so the car reads bigger.
    const isMobile = this.scale.width < 900;
    this.baseZoom = Math.max(0.5, zoom) * (isMobile ? 1.3 : 1);
    this.cameras.main.setZoom(this.baseZoom);
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
      const tint =
        CAR_COLORS.find((c) => c.id === p.colorId)?.value ?? 0xffffff;
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
    const store = useGameStore.getState();
    const racing = store.raceStatus === 'racing';
    const input = this.readLocalInput();
    this.lastInput = input;

    this.handleRaceStatusTransitions(store.raceStatus);

    if (this.isHost) {
      this.hostUpdate(dt, racing, input);
    } else {
      this.guestUpdate(dt, racing, input);
    }

    for (const car of this.cars) car.render(dt);
    this.updateAudio();
    this.updateGrassVibration(dt);
    this.updateVisuals(dt);
    this.pushHud(dt);
  }

  /** Detect race status transitions and trigger audio accordingly. */
  private handleRaceStatusTransitions(
    status: 'lobby' | 'countdown' | 'racing' | 'finished',
  ): void {
    const audio = getAudio();
    const vibration = getVibration();
    if (status === 'countdown' && this.prevRaceStatus !== 'countdown') {
      // Schedule 3 low beeps + 1 high "GO" beep across the countdown duration.
      audio.playCountdownSequence(3200);
    } else if (status === 'racing' && this.prevRaceStatus !== 'racing') {
      audio.playMusic();
    } else if (status === 'finished' && this.prevRaceStatus !== 'finished') {
      audio.stopMusic();
      audio.playFinish();
      vibration.vibrateFinish();
    }
    this.prevRaceStatus = status;

    // Local car lap completion chime.
    if (this.localCar) {
      if (this.localCar.lap > this.prevLocalLap) {
        audio.playLap();
        vibration.vibrateLap();
      }
      this.prevLocalLap = this.localCar.lap;
    }
  }

  // ---- host ----
  private hostUpdate(
    dt: number,
    racing: boolean,
    localInput: InputFrame,
  ): void {
    const session = getSession();
    const raceTime = session ? session.now() : 0;

    if (racing) {
      for (const car of this.cars) {
        const inp = car.isLocal
          ? localInput
          : (session?.getInput(car.id) ?? localInput);
        car.step(dt, inp);
        car.checkCollisions(this.cars);
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
  private guestUpdate(
    dt: number,
    racing: boolean,
    localInput: InputFrame,
  ): void {
    const session = getSession();
    if (!session) return;

    this.sendAcc += dt;
    if (this.sendAcc >= NET_INTERVAL) {
      this.sendAcc = 0;
      session.sendInput(localInput);
    }

    if (racing && this.localCar && !this.localCar.finished) {
      this.localCar.step(dt, localInput);
      this.localCar.checkCollisions(this.cars);
    }

    const snaps = session.drainSnapshots();
    let reconciled = false;
    for (const snap of snaps) {
      for (const cs of snap.cars) this.latest.set(cs.id, cs);
      reconciled = true;
    }

    for (const car of this.cars) {
      if (car.isLocal) continue;
      const target = this.latest.get(car.id);
      if (target) car.smoothToward(target, REMOTE_SMOOTH, dt);
    }

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

    const speed = Math.abs(this.localCar.speed);
    const rpm = Math.min(1, speed / 560);

    useGameStore.getState().setHud({
      lap: currentLap,
      totalLaps: this.totalLaps,
      position,
      playerCount: this.cars.length,
      speed: Math.round(speed * 0.2),
      rpm,
      throttle: this.lastInput.throttle,
      brake: this.lastInput.brake,
      carPositions: this.cars.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        colorId: c.colorId,
        isLocal: c.isLocal,
      })),
    });
  }

  // ---- per-frame audio updates ----
  private updateAudio(): void {
    const audio = getAudio();
    if (!this.localCar) return;
    const speedFrac = Math.min(1, Math.abs(this.localCar.speed) / 560);
    audio.updateEngine(speedFrac, this.lastInput.throttle);
    if (this.localCar.isSkidding) {
      audio.startScreech();
    } else {
      audio.stopScreech();
    }
  }

  // ---- per-frame grass vibration ----
  // Pulse a light haptic at a fixed cadence while the local car is off-track
  // and moving. The interval is short enough to feel like a continuous rumble
  // but long enough that the device's vibration motor can settle between
  // pulses.
  private updateGrassVibration(dt: number): void {
    if (!this.localCar) return;
    const car = this.localCar;
    const moving = Math.abs(car.speed) > 30;
    if (!moving || isOnTrack(car.x, car.y)) {
      this.grassVibrateAcc = 0;
      return;
    }
    this.grassVibrateAcc += dt;
    if (this.grassVibrateAcc >= 0.12) {
      this.grassVibrateAcc = 0;
      getVibration().vibrateGrass(0.25);
    }
  }

  // ---- per-frame visual updates ----
  private updateVisuals(dt: number): void {
    // Animate marching-ants center dashes.
    this.dashOffset = (this.dashOffset + dt * 80) % 32;
    this.redrawDashes();

    // Drift clouds slowly.
    for (const cloud of this.clouds) {
      cloud.x -= dt * 8;
      if (cloud.x < -120) cloud.x = WORLD_WIDTH + 120;
    }

    // Camera shake decay.
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 4);
      const s = this.cameraShake;
      this.cameras.main.setFollowOffset(
        (Math.random() - 0.5) * s * 6,
        (Math.random() - 0.5) * s * 6,
      );
    }

    // FOV zoom-out at speed.
    if (this.localCar) {
      const speedFrac = Math.min(1, Math.abs(this.localCar.speed) / 560);
      const zoom = this.baseZoom * (1 - speedFrac * 0.15);
      this.cameras.main.setZoom(zoom);
    }

    // Position arrow when local car is off-screen.
    this.updatePositionArrow();
  }

  private updatePositionArrow(): void {
    if (!this.localCar) return;
    const cam = this.cameras.main;
    const margin = 60;
    const carScreenX = this.localCar.x - cam.scrollX;
    const carScreenY = this.localCar.y - cam.scrollY;
    const onScreen =
      carScreenX >= margin &&
      carScreenX <= this.scale.width - margin &&
      carScreenY >= margin &&
      carScreenY <= this.scale.height - margin;

    if (onScreen) {
      this.positionArrow.setVisible(false);
      return;
    }

    // Clamp to screen edge.
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dx = carScreenX - cx;
    const dy = carScreenY - cy;
    const angle = Math.atan2(dy, dx);
    const edgeX = cx + Math.cos(angle) * (this.scale.width / 2 - margin);
    const edgeY = cy + Math.sin(angle) * (this.scale.height / 2 - margin);
    this.positionArrow.setPosition(edgeX, edgeY);
    this.positionArrow.setRotation(angle);
    this.positionArrow.setVisible(true);
  }

  // ---- track rendering ----
  private drawSky(): void {
    // Sky gradient drawn as a large rectangle behind everything.
    const g = this.add.graphics();
    g.setDepth(-10);
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Warm sunset-ish gradient: deep blue → orange near horizon.
      const r = Math.round(0x4a + (0xff - 0x4a) * t * 0.6);
      const gr = Math.round(0x6a + (0xb0 - 0x6a) * t * 0.5);
      const b = Math.round(0xa0 + (0x60 - 0xa0) * t * 0.4);
      const color = (r << 16) | (gr << 8) | b;
      g.fillStyle(color, 1);
      g.fillRect(
        0,
        (i / steps) * WORLD_HEIGHT,
        WORLD_WIDTH,
        WORLD_HEIGHT / steps + 1,
      );
    }
  }

  private drawMountains(): void {
    // Distant mountain silhouettes along the top of the world.
    const g = this.add.graphics();
    g.setDepth(-9);
    const mountainY = WORLD_HEIGHT * 0.15;
    // Draw several overlapping mountain sprites.
    for (let i = 0; i < 8; i++) {
      const m = this.add.image(
        i * 320 + 80,
        mountainY + (i % 2) * 20,
        'mountain',
      );
      m.setOrigin(0.5, 1);
      m.setDepth(-9);
      m.setAlpha(0.6 + (i % 3) * 0.1);
      m.setScale(1.2 + (i % 2) * 0.3);
    }
  }

  private drawSun(): void {
    const sun = this.add.image(WORLD_WIDTH * 0.75, WORLD_HEIGHT * 0.18, 'sun');
    sun.setDepth(-8);
    sun.setScale(1.5);
  }

  private drawClouds(): void {
    for (let i = 0; i < 6; i++) {
      const cloud = this.add.image(
        Math.random() * WORLD_WIDTH,
        80 + Math.random() * 200,
        'cloud',
      );
      cloud.setDepth(-7);
      cloud.setAlpha(0.7);
      cloud.setScale(0.8 + Math.random() * 0.6);
      this.clouds.push(cloud);
    }
  }

  private drawTrack(): void {
    // Grass tile background.
    const grass = this.add.tileSprite(
      0,
      0,
      WORLD_WIDTH,
      WORLD_HEIGHT,
      'grassTile',
    );
    grass.setOrigin(0, 0);
    grass.setDepth(-1);

    const pts = CENTERLINE.map((p) => new Phaser.Math.Vector2(p.x, p.y));

    // Road base: red kerb edge + asphalt.
    const road = this.add.graphics();
    road.setDepth(1);
    road.lineStyle(ROAD_WIDTH + 14, 0x9b0014, 0.9);
    road.strokePoints(pts, true, true);
    road.lineStyle(ROAD_WIDTH, 0x33333b, 1);
    road.strokePoints(pts, true, true);

    // White edge lines along the road.
    const edgeLines = this.add.graphics();
    edgeLines.setDepth(2);
    edgeLines.lineStyle(2, 0xd4d7dd, 0.5);
    const perp = (i: number) => {
      const a = CENTERLINE[i];
      const b = CENTERLINE[(i + 1) % CENTERLINE.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      return { nx: -dy / len, ny: dx / len };
    };
    for (let i = 0; i < CENTERLINE.length; i++) {
      const p = CENTERLINE[i];
      const { nx, ny } = perp(i);
      const off = ROAD_WIDTH / 2 - 4;
      edgeLines.lineBetween(
        p.x + nx * off,
        p.y + ny * off,
        CENTERLINE[(i + 1) % CENTERLINE.length].x + nx * off,
        CENTERLINE[(i + 1) % CENTERLINE.length].y + ny * off,
      );
      edgeLines.lineBetween(
        p.x - nx * off,
        p.y - ny * off,
        CENTERLINE[(i + 1) % CENTERLINE.length].x - nx * off,
        CENTERLINE[(i + 1) % CENTERLINE.length].y - ny * off,
      );
    }

    // Animated center dashes (marching ants).
    this.dashGraphics = this.add.graphics();
    this.dashGraphics.setDepth(3);
    this.redrawDashes();

    this.drawStartLine();
    this.drawCheckpointPips();
  }

  private redrawDashes(): void {
    const g = this.dashGraphics;
    g.clear();
    g.lineStyle(4, 0xd4d7dd, 0.5);
    const n = CENTERLINE.length;
    const dashLen = 16;
    const gapLen = 16;
    const period = dashLen + gapLen;
    // Marching offset along the centerline.
    const offset = this.dashOffset;
    for (let i = 0; i < n; i++) {
      const a = CENTERLINE[i];
      const b = CENTERLINE[(i + 1) % n];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      // Draw dashes along this segment, skipping by period.
      let d = -offset;
      while (d < segLen) {
        const t1 = Math.max(0, d) / segLen;
        const t2 = Math.min(segLen, d + dashLen) / segLen;
        if (t2 > t1) {
          const x1 = a.x + (b.x - a.x) * t1;
          const y1 = a.y + (b.y - a.y) * t1;
          const x2 = a.x + (b.x - a.x) * t2;
          const y2 = a.y + (b.y - a.y) * t2;
          g.lineBetween(x1, y1, x2, y2);
        }
        d += period;
      }
    }
  }

  private drawStartLine(): void {
    const g = this.add.graphics();
    g.setDepth(4);
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
    const g = this.add.graphics();
    g.setDepth(5);
    for (let i = 1; i < CHECKPOINTS.length; i++) {
      g.fillStyle(0xf0c419, 0.18);
      g.fillCircle(CHECKPOINTS[i].x, CHECKPOINTS[i].y, 12);
      g.lineStyle(2, 0xf0c419, 0.4);
      g.strokeCircle(CHECKPOINTS[i].x, CHECKPOINTS[i].y, 12);
    }
  }

  // ---- scenery ----
  private drawScenery(): void {
    const n = CENTERLINE.length;
    const treeLayer = this.add.graphics();
    treeLayer.setDepth(0);
    const barrierList: Barrier[] = [];

    for (let i = 0; i < n; i += 6) {
      const p = CENTERLINE[i];
      const next = CENTERLINE[(i + 1) % n];
      const dx = next.x - p.x;
      const dy = next.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      // Trees on alternating sides, varying distance.
      const side = i % 2 === 0 ? 1 : -1;
      const dist = ROAD_WIDTH / 2 + 30 + ((i * 37) % 80);
      const tx = p.x + nx * side * dist;
      const ty = p.y + ny * side * dist;
      const tree = this.add.image(tx, ty, 'tree');
      tree.setDepth(0);
      tree.setScale(0.8 + ((i * 13) % 5) * 0.15);

      // Occasional barrier on the other side.
      if (i % 18 === 0) {
        const bx = p.x - nx * (ROAD_WIDTH / 2 + 12);
        const by = p.y - ny * (ROAD_WIDTH / 2 + 12);
        const barrier = this.add.image(bx, by, 'barrier');
        barrier.setDepth(1);
        barrier.setRotation(Math.atan2(dy, dx));
        barrierList.push({ x: bx, y: by, angle: Math.atan2(dy, dx) });
      }

      // Occasional tire wall on sharp corners.
      if (i % 24 === 6) {
        const wx = p.x + nx * (ROAD_WIDTH / 2 + 18);
        const wy = p.y + ny * (ROAD_WIDTH / 2 + 18);
        const wall = this.add.image(wx, wy, 'tireWall');
        wall.setDepth(1);
        wall.setRotation(Math.atan2(dy, dx));
        barrierList.push({ x: wx, y: wy, angle: Math.atan2(dy, dx) });
      }

      // Occasional billboard further out.
      if (i % 36 === 12) {
        const bx = p.x + nx * side * (ROAD_WIDTH / 2 + 120);
        const by = p.y + ny * side * (ROAD_WIDTH / 2 + 120);
        const bb = this.add.image(bx, by, 'billboard');
        bb.setDepth(0);
        bb.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
      }

      // Grandstand at a few points.
      if (i % 48 === 24) {
        const gx = p.x - nx * (ROAD_WIDTH / 2 + 30);
        const gy = p.y - ny * (ROAD_WIDTH / 2 + 30);
        const gs = this.add.image(gx, gy, 'grandstand');
        gs.setDepth(0);
        gs.setRotation(Math.atan2(dy, dx));
      }
    }

    // Register barrier positions for collision detection.
    setBarriers(barrierList);
  }
}
