import { useEffect } from 'react';
import { useGameStore } from '../state/store';
import { leaveRoom, startRace } from '../net/controller';
import { CAR_COLORS } from '../types';
import { getAudio } from '../game/audio/AudioManager';
import { getVibration } from '../game/vibration/VibrationManager';

function colorCss(colorId: string): string {
  return CAR_COLORS.find((c) => c.id === colorId)?.css ?? '#fff';
}

function formatTime(ms: number | null): string {
  if (ms === null) return 'DNF';
  const total = Math.floor(ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export function Results() {
  const { results, isHost, localId } = useGameStore();

  // Play the finish fanfare + celebratory haptic when the results screen
  // mounts. The Phaser scene (and its sound objects) is destroyed the moment
  // we navigate away from the race screen, so we trigger the sound from the
  // React side via an HTML5 Audio element.
  useEffect(() => {
    getAudio().playFinishHtml5();
    getVibration().vibrateFinish();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-1 text-center text-4xl font-black text-silver">
          Race <span className="text-race-red">Results</span>
        </h1>
        <p className="mb-6 text-center text-sm text-silver-dim">
          Chequered flag!
        </p>

        <ol className="space-y-2">
          {results.map((r) => (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 ${
                r.id === localId
                  ? 'bg-race-red/15 ring-1 ring-race-red/40'
                  : 'bg-asphalt-800'
              }`}
            >
              <span className="w-8 text-center text-xl font-black text-silver-dim">
                {MEDAL[r.position - 1] ?? r.position}
              </span>
              <span
                className="h-5 w-5 rounded-full"
                style={{ backgroundColor: colorCss(r.colorId) }}
              />
              <span className="flex-1 font-semibold text-silver">
                {r.name}
                {r.id === localId && (
                  <span className="ml-1 text-xs text-silver-dim">(you)</span>
                )}
              </span>
              <span className="font-mono text-sm text-silver-dim">
                {formatTime(r.finishMs)}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => leaveRoom()}
            className="rounded-lg border border-silver-dim px-5 py-3 font-bold text-silver transition hover:border-silver"
          >
            Leave
          </button>
          {isHost ? (
            <button
              onClick={() => startRace()}
              className="flex-1 rounded-lg bg-race-red px-4 py-3 font-bold text-white transition hover:bg-race-red-dark"
            >
              Race Again
            </button>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-lg bg-asphalt-800 px-4 py-3 text-sm text-silver-dim">
              Waiting for host…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
