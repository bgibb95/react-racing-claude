import { useGameStore } from './state/store';
import { Landing } from './react/Landing';
import { Lobby } from './react/Lobby';
import { RaceScreen } from './react/RaceScreen';
import { Results } from './react/Results';

export function App() {
  const screen = useGameStore((s) => s.screen);

  return (
    <div className="relative h-full w-full overflow-hidden bg-asphalt text-silver">
      {screen === 'landing' && <Landing />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'racing' && <RaceScreen />}
      {screen === 'results' && <Results />}
    </div>
  );
}
