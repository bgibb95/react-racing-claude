import { useState } from 'react';
import { useGameStore } from '../state/store';
import { getSync, leaveRoom, startRace } from '../net/controller';
import { CAR_COLORS, MAX_PLAYERS } from '../types';

const LAP_OPTIONS = [2, 3, 5];

function colorCss(colorId: string): string {
  return CAR_COLORS.find((c) => c.id === colorId)?.css ?? '#fff';
}

export function Lobby() {
  const { players, roomCode, isHost, localId, totalLaps } = useGameStore();
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode ?? ''}`;
  const localReady = players.find((p) => p.id === localId)?.ready ?? false;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-lg">
        <header className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-silver-dim">
            Room code
          </p>
          <button
            onClick={() => copy(roomCode ?? '')}
            title="Copy code"
            className="text-6xl font-black tracking-[0.3em] text-race-red transition hover:text-race-red-dark"
          >
            {roomCode}
          </button>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              onClick={() => copy(shareUrl)}
              className="rounded-md border border-asphalt-700 bg-asphalt-800 px-3 py-1.5 text-xs text-silver transition hover:border-silver"
            >
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
          </div>
        </header>

        <div className="rounded-2xl border border-asphalt-700 bg-asphalt-800/80 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-silver">Drivers</h2>
            <span className="text-xs text-silver-dim">
              {players.length}/{MAX_PLAYERS}
            </span>
          </div>

          <ul className="space-y-2">
            {players.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg bg-asphalt px-3 py-2.5"
              >
                <span
                  className="h-5 w-5 rounded-full"
                  style={{ backgroundColor: colorCss(p.colorId) }}
                />
                <span className="flex-1 font-medium text-silver">
                  {p.name}
                  {p.id === localId && (
                    <span className="ml-1 text-xs text-silver-dim">(you)</span>
                  )}
                </span>
                {p.isHost ? (
                  <span className="rounded bg-race-red/20 px-2 py-0.5 text-xs font-semibold text-race-red">
                    HOST
                  </span>
                ) : (
                  <span
                    className={`text-xs font-semibold ${
                      p.ready ? 'text-mint-green' : 'text-silver-dim'
                    }`}
                    style={p.ready ? { color: '#4fd18b' } : undefined}
                  >
                    {p.ready ? 'READY' : 'not ready'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {isHost && (
          <div className="mt-5 flex items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-wider text-silver-dim">Laps</span>
            {LAP_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => getSync()?.setTotalLaps(n)}
                className={`h-9 w-9 rounded-md text-sm font-bold transition ${
                  totalLaps === n
                    ? 'bg-race-red text-white'
                    : 'bg-asphalt-800 text-silver-dim hover:text-silver'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex gap-3">
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
              Start Race
            </button>
          ) : (
            <button
              onClick={() => getSync()?.toggleReady(!localReady)}
              className={`flex-1 rounded-lg px-4 py-3 font-bold transition ${
                localReady
                  ? 'bg-asphalt-700 text-silver'
                  : 'bg-race-red text-white hover:bg-race-red-dark'
              }`}
            >
              {localReady ? "Ready — waiting for host" : "I'm Ready"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
