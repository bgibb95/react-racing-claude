// Boot scene: draws all textures at runtime with Graphics (no external assets, no
// trademarked art, nothing to fetch from a CDN — ideal for static hosting). Then
// hands off to the Track scene.

import Phaser from 'phaser';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.makeCarTexture();
    this.makeParticleTexture();
    this.makeShadowTexture();
    this.makeWheelTexture();
    this.makeBrakeLightTexture();
    this.makeHeadlightConeTexture();
    this.makeSmokeTexture();
    this.makeExhaustTexture();
    this.makeSkidTexture();
    this.makeTreeTexture();
    this.makeBarrierTexture();
    this.makeBillboardTexture();
    this.makeGrandstandTexture();
    this.makeTireWallTexture();
    this.makeSunTexture();
    this.makeCloudTexture();
    this.makeMountainTexture();
    this.makeGrassTileTexture();
    this.makeAsphaltTileTexture();
    this.makeSparkTexture();
    this.makeConfettiTexture();
    this.scene.start('Track');
  }

  /** Top-down sports-car silhouette (Porsche-inspired, original art). Drawn in
   *  white so per-car tinting produces the chosen colour; cabin/details stay dark. */
  private makeCarTexture(): void {
    const w = 48;
    const h = 26;
    const g = this.add.graphics();

    // Body (points along +x so rotation matches cos/sin heading).
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 2, w, h - 4, 8);

    // Slightly tapered nose highlight.
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(w - 2, 4, w - 2, h - 4, w + 4, h / 2);

    // Cabin / windshield (stays dark regardless of tint).
    g.fillStyle(0x1c1c22, 1);
    g.fillRoundedRect(14, 5, 20, h - 10, 4);
    g.fillStyle(0x3a3a44, 1);
    g.fillRoundedRect(16, 6, 8, h - 12, 3); // windshield

    // Rear wing.
    g.fillStyle(0x141419, 1);
    g.fillRect(0, 1, 5, h - 2);

    // Headlights.
    g.fillStyle(0xf3f0d0, 1);
    g.fillRect(w - 4, 4, 3, 4);
    g.fillRect(w - 4, h - 8, 3, 4);

    g.generateTexture('car', w + 4, h);
    g.destroy();
  }

  /** Soft white circle for generic particles. */
  private makeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }

  /** Soft elliptical shadow under each car. */
  private makeShadowTexture(): void {
    const w = 56;
    const h = 30;
    const g = this.add.graphics();
    for (let i = 6; i > 0; i--) {
      const a = 0.08 * i;
      g.fillStyle(0x000000, a);
      g.fillEllipse(w / 2, h / 2, w * (i / 6), h * (i / 6));
    }
    g.generateTexture('shadow', w, h);
    g.destroy();
  }

  /** Small dark wheel that rotates with speed. */
  private makeWheelTexture(): void {
    const s = 8;
    const g = this.add.graphics();
    g.fillStyle(0x0a0a0b, 1);
    g.fillCircle(s / 2, s / 2, s / 2);
    g.fillStyle(0x2a2a30, 1);
    g.fillCircle(s / 2, s / 2, s / 4);
    g.fillStyle(0x4a4a52, 1);
    g.fillRect(s / 2 - 0.5, 1, 1, s - 2);
    g.generateTexture('wheel', s, s);
    g.destroy();
  }

  /** Red glowing brake-light sprite. */
  private makeBrakeLightTexture(): void {
    const s = 10;
    const g = this.add.graphics();
    for (let i = 4; i > 0; i--) {
      g.fillStyle(0xff2030, 0.15 * i);
      g.fillCircle(s / 2, s / 2, (s / 2) * (i / 4));
    }
    g.fillStyle(0xff4040, 1);
    g.fillCircle(s / 2, s / 2, s / 4);
    g.fillStyle(0xffd0d0, 1);
    g.fillCircle(s / 2, s / 2, s / 8);
    g.generateTexture('brakeLight', s, s);
    g.destroy();
  }

  /** Forward-projecting headlight cone (symmetric isoceles triangle, apex at
   *  the left edge so origin (0, 0.5) places the narrow point at the car). */
  private makeHeadlightConeTexture(): void {
    const w = 80;
    const h = 40;
    const g = this.add.graphics();
    for (let i = 8; i > 0; i--) {
      const a = 0.04 * i;
      g.fillStyle(0xfff4c0, a);
      const coneH = (h * i) / 8;
      // Symmetric cone: apex at (0, h/2), base at x=w.
      g.fillTriangle(0, h / 2, w, h / 2 - coneH / 2, w, h / 2 + coneH / 2);
    }
    g.generateTexture('headlightCone', w, h);
    g.destroy();
  }

  /** Soft white puff for tire smoke. */
  private makeSmokeTexture(): void {
    const s = 24;
    const g = this.add.graphics();
    for (let i = 5; i > 0; i--) {
      g.fillStyle(0xffffff, 0.06 * i);
      g.fillCircle(s / 2, s / 2, (s / 2) * (i / 5));
    }
    g.generateTexture('smoke', s, s);
    g.destroy();
  }

  /** Dark puff for exhaust. */
  private makeExhaustTexture(): void {
    const s = 16;
    const g = this.add.graphics();
    for (let i = 4; i > 0; i--) {
      g.fillStyle(0x1a1a1f, 0.12 * i);
      g.fillCircle(s / 2, s / 2, (s / 2) * (i / 4));
    }
    g.generateTexture('exhaust', s, s);
    g.destroy();
  }

  /** Thin dark line for skid marks. */
  private makeSkidTexture(): void {
    const w = 12;
    const h = 4;
    const g = this.add.graphics();
    g.fillStyle(0x0a0a0b, 0.6);
    g.fillRect(0, 0, w, h);
    g.generateTexture('skid', w, h);
    g.destroy();
  }

  /** Stylised top-down tree (round canopy + trunk shadow). */
  private makeTreeTexture(): void {
    const s = 40;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(s / 2 + 2, s / 2 + 3, s * 0.7, s * 0.5);
    g.fillStyle(0x1a4a1f, 1);
    g.fillCircle(s / 2, s / 2, s * 0.42);
    g.fillStyle(0x2a6a2f, 1);
    g.fillCircle(s / 2 - 3, s / 2 - 3, s * 0.32);
    g.fillStyle(0x3a8a3f, 1);
    g.fillCircle(s / 2 - 6, s / 2 - 6, s * 0.18);
    g.fillStyle(0x5aaa5f, 0.6);
    g.fillCircle(s / 2 - 8, s / 2 - 8, s * 0.08);
    g.generateTexture('tree', s, s);
    g.destroy();
  }

  /** Armco barrier segment (red/white striped). */
  private makeBarrierTexture(): void {
    const w = 60;
    const h = 8;
    const g = this.add.graphics();
    g.fillStyle(0xeeeeee, 1);
    g.fillRect(0, 0, w, h);
    g.fillStyle(0xd5001c, 1);
    for (let x = 0; x < w; x += 16) {
      g.fillRect(x, 0, 8, h);
    }
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(0, 0, w, 2);
    g.generateTexture('barrier', w, h);
    g.destroy();
  }

  /** Billboard with a simple racing ad. */
  private makeBillboardTexture(): void {
    const w = 80;
    const h = 36;
    const g = this.add.graphics();
    g.fillStyle(0x222228, 1);
    g.fillRect(8, h - 8, 4, 8);
    g.fillRect(w - 12, h - 8, 4, 8);
    g.fillStyle(0x16161a, 1);
    g.fillRect(0, 0, w, h - 8);
    g.lineStyle(2, 0xd5001c, 1);
    g.strokeRect(1, 1, w - 2, h - 10);
    g.fillStyle(0xd5001c, 1);
    g.fillRect(8, 6, 24, 6);
    g.fillStyle(0xd4d7dd, 1);
    g.fillRect(8, 16, 40, 3);
    g.fillRect(8, 21, 32, 3);
    g.generateTexture('billboard', w, h);
    g.destroy();
  }

  /** Grandstand with crowd dots. */
  private makeGrandstandTexture(): void {
    const w = 120;
    const h = 30;
    const g = this.add.graphics();
    g.fillStyle(0x2a2a30, 1);
    g.fillRect(0, h - 8, w, 8);
    g.fillStyle(0x3a3a42, 1);
    g.fillRect(0, h - 12, w, 4);
    const colors = [0xd5001c, 0xd4d7dd, 0xf0c419, 0x3fa9d6, 0x4fd18b, 0xffffff];
    for (let x = 4; x < w - 4; x += 5) {
      for (let y = 2; y < h - 14; y += 5) {
        const c = colors[Math.floor(Math.random() * colors.length)];
        g.fillStyle(c, 0.85);
        g.fillRect(x, y, 3, 3);
      }
    }
    g.generateTexture('grandstand', w, h);
    g.destroy();
  }

  /** Stack of black tires forming a wall. */
  private makeTireWallTexture(): void {
    const w = 40;
    const h = 20;
    const g = this.add.graphics();
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 5; col++) {
        const cx = col * 8 + 4;
        const cy = row * 10 + 5;
        g.fillStyle(0x0a0a0b, 1);
        g.fillCircle(cx, cy, 4);
        g.fillStyle(0x1a1a1f, 1);
        g.fillCircle(cx, cy, 2);
      }
    }
    g.generateTexture('tireWall', w, h);
    g.destroy();
  }

  /** Bright sun with glow. */
  private makeSunTexture(): void {
    const s = 80;
    const g = this.add.graphics();
    for (let i = 8; i > 0; i--) {
      g.fillStyle(0xfff4c0, 0.04 * i);
      g.fillCircle(s / 2, s / 2, (s / 2) * (i / 8));
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s / 2, s / 2, s * 0.18);
    g.fillStyle(0xfff8d0, 1);
    g.fillCircle(s / 2, s / 2, s * 0.12);
    g.generateTexture('sun', s, s);
    g.destroy();
  }

  /** Soft cloud blob. */
  private makeCloudTexture(): void {
    const w = 120;
    const h = 50;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(w * 0.3, h * 0.6, w * 0.4, h * 0.7);
    g.fillEllipse(w * 0.55, h * 0.5, w * 0.5, h * 0.8);
    g.fillEllipse(w * 0.8, h * 0.65, w * 0.35, h * 0.6);
    g.fillStyle(0xffffff, 0.5);
    g.fillEllipse(w * 0.5, h * 0.4, w * 0.6, h * 0.4);
    g.generateTexture('cloud', w, h);
    g.destroy();
  }

  /** Distant mountain silhouette. */
  private makeMountainTexture(): void {
    const w = 200;
    const h = 80;
    const g = this.add.graphics();
    g.fillStyle(0x3a4a5a, 1);
    g.fillTriangle(0, h, w * 0.3, h * 0.2, w * 0.6, h);
    g.fillTriangle(w * 0.4, h, w * 0.7, h * 0.35, w, h);
    g.fillStyle(0xeef0f4, 1);
    g.fillTriangle(w * 0.25, h * 0.35, w * 0.3, h * 0.2, w * 0.35, h * 0.35);
    g.fillTriangle(w * 0.65, h * 0.5, w * 0.7, h * 0.35, w * 0.75, h * 0.5);
    g.fillStyle(0x2a3a4a, 0.5);
    g.fillTriangle(w * 0.3, h * 0.2, w * 0.45, h * 0.6, w * 0.6, h);
    g.generateTexture('mountain', w, h);
    g.destroy();
  }

  /** Tileable grass texture with mowed stripes and noise. */
  private makeGrassTileTexture(): void {
    const s = 128;
    const g = this.add.graphics();
    g.fillStyle(0x1a4a1f, 1);
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      const shade = (y / 16) % 2 === 0 ? 0x1f5424 : 0x163d1a;
      g.fillStyle(shade, 0.6);
      g.fillRect(0, y, s, 8);
    }
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const shade = Math.random() > 0.5 ? 0x2a6a2f : 0x0f2f12;
      g.fillStyle(shade, 0.5);
      g.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      g.fillStyle(0x3a8a3f, 0.3);
      g.fillRect(x, y, 1, 1);
    }
    g.generateTexture('grassTile', s, s);
    g.destroy();
  }

  /** Tileable asphalt texture with grain. */
  private makeAsphaltTileTexture(): void {
    const s = 128;
    const g = this.add.graphics();
    g.fillStyle(0x33333b, 1);
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const v = Math.random();
      if (v < 0.5) {
        g.fillStyle(0x2a2a32, 0.6);
      } else if (v < 0.8) {
        g.fillStyle(0x3e3e46, 0.5);
      } else {
        g.fillStyle(0x4a4a52, 0.4);
      }
      g.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      g.fillStyle(0x5a5a62, 0.7);
      g.fillRect(x, y, 2, 2);
    }
    g.generateTexture('asphaltTile', s, s);
    g.destroy();
  }

  /** Bright spark for collisions. */
  private makeSparkTexture(): void {
    const s = 12;
    const g = this.add.graphics();
    for (let i = 3; i > 0; i--) {
      g.fillStyle(0xfff4c0, 0.3 * i);
      g.fillCircle(s / 2, s / 2, (s / 2) * (i / 3));
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(s / 2, s / 2, 2);
    g.generateTexture('sparkBright', s, s);
    g.destroy();
  }

  /** Small coloured square for confetti. */
  private makeConfettiTexture(): void {
    const s = 8;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, s, s);
    g.generateTexture('confetti', s, s);
    g.destroy();
  }
}
