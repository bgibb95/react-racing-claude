import { PhaserGame } from '../game/PhaserGame';
import { HUD } from './HUD';
import { TouchControls } from './TouchControls';

export function RaceScreen() {
  return (
    <div className="absolute inset-0 h-full w-full">
      <PhaserGame />
      <HUD />
      <TouchControls />
    </div>
  );
}
