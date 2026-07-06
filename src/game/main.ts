// Phaser game factory. Called by the React PhaserGame component with the parent
// container id. Uses RESIZE scaling so the canvas fills its container on any
// device; the camera controls how much of the world is visible.

import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Track } from './scenes/Track';

export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#0a0a0b',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: '100%',
      height: '100%',
    },
    render: {
      antialias: true,
      powerPreference: 'high-performance',
    },
    scene: [Boot, Track],
  });
}
