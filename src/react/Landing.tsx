import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../state/store';
import { hostRoom, joinRoom, leaveRoom } from '../net/controller';
import { hasConfiguredTurn } from '../net/ice';
import { CAR_COLORS, ROOM_CODE_LENGTH } from '../types';

export function Landing() {
  const { localName, localColorId, connectionStatus, connectionError } = useGameStore();
  const setProfile = useGameStore((s) => s.setProfile);

  const [name, setName] = useState(localName);
  const [colorId, setColorId] = useState(localColorId);
  const [mode, setMode] = useState<'idle' | 'join'>('idle');
  const [code, setCode] = useState('');

  // Deep-link support: ?room=CODE prefills the join flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setMode('join');
      setCode(room.toUpperCase().slice(0, ROOM_CODE_LENGTH));
    }
  }, []);

  const connecting = connectionStatus === 'connecting';
  const trimmedName = name.trim() || 'Driver';

  const canJoin = useMemo(
    () => code.trim().length === ROOM_CODE_LENGTH,
    [code],
  );

  function persist() {
    setProfile(trimmedName, colorId);
  }

  function onHost() {
    persist();
    hostRoom({ name: trimmedName, colorId });
  }

  function onJoin() {
    if (!canJoin) return;
    persist();
    joinRoom({ name: trimmedName, colorId }, code);
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-5xl font-black tracking-tight text-silver sm:text-6xl">
            APEX <span className="text-race-red">RIVALS</span>
          </h1>
          <p className="mt-2 text-sm text-silver-dim">
            Porsche-inspired real-time racing · play with friends anywhere
          </p>
        </header>

        <div className="rounded-2xl border border-asphalt-700 bg-asphalt-800/80 p-6 shadow-glow-red backdrop-blur">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-silver-dim">
            Driver name
          </label>
          <input
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Driver"
            className="mb-5 w-full rounded-lg border border-asphalt-700 bg-asphalt px-4 py-3 text-silver outline-none focus:border-race-red"
          />

          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-silver-dim">
            Car colour
          </label>
          <div className="mb-6 flex flex-wrap gap-3">
            {CAR_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.name}
                title={c.name}
                onClick={() => setColorId(c.id)}
                style={{ backgroundColor: c.css }}
                className={`h-10 w-10 rounded-full transition ${
                  colorId === c.id
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-asphalt-800'
                    : 'opacity-70 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          {mode === 'idle' ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onHost}
                disabled={connecting}
                className="rounded-lg bg-race-red px-4 py-3 font-bold text-white transition hover:bg-race-red-dark disabled:opacity-50"
              >
                Host Race
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={connecting}
                className="rounded-lg border border-silver-dim px-4 py-3 font-bold text-silver transition hover:border-silver disabled:opacity-50"
              >
                Join Race
              </button>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-silver-dim">
                Room code
              </label>
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH))
                }
                placeholder="ABCDE"
                autoFocus
                className="mb-4 w-full rounded-lg border border-asphalt-700 bg-asphalt px-4 py-3 text-center text-2xl font-black tracking-[0.4em] text-silver outline-none focus:border-race-red"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setMode('idle')}
                  disabled={connecting}
                  className="rounded-lg border border-silver-dim px-4 py-3 font-bold text-silver transition hover:border-silver disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={onJoin}
                  disabled={!canJoin || connecting}
                  className="rounded-lg bg-race-red px-4 py-3 font-bold text-white transition hover:bg-race-red-dark disabled:opacity-50"
                >
                  Join
                </button>
              </div>
            </div>
          )}

          {connecting && (
            <p className="mt-4 animate-pulse text-center text-sm text-silver-dim">
              Connecting…
            </p>
          )}
          {connectionStatus === 'error' && connectionError && (
            <div className="mt-4 text-center">
              <p className="text-sm text-race-red">{connectionError}</p>
              <button
                onClick={() => leaveRoom()}
                className="mt-2 text-xs text-silver-dim underline hover:text-silver"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-silver-dim">
          Peer-to-peer over WebRTC · no downloads · no accounts
        </p>

        {!hasConfiguredTurn() && (
          <p className="mx-auto mt-3 max-w-sm text-center text-xs text-gold/80">
            Tip: to race friends on a different network, add a free TURN server
            (see the README) — direct connections often fail across networks.
          </p>
        )}
      </div>
    </div>
  );
}
