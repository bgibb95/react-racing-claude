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

  private makeParticleTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('spark', 8, 8);
    g.destroy();
  }
}
