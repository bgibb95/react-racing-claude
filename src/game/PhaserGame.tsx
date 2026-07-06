// React wrapper that mounts a Phaser.Game into a container div and tears it down
// on unmount. Mounted only while the race screen is active, so each race gets a
// fresh scene (simple, reset-bug-free).

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from './main';

const CONTAINER_ID = 'game-root';

export function PhaserGame() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const game = createGame(CONTAINER_ID);
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id={CONTAINER_ID} className="absolute inset-0 h-full w-full" />;
}
