import { useGameStore } from '../state/store';
import { leaveRoom } from '../net/controller';
import { CAR_COLORS } from '../types';
import { CENTERLINE, WORLD_HEIGHT, WORLD_WIDTH } from '../game/track/circuit';

function colorCss(colorId: string): string {
  return CAR_COLORS.find((c) => c.id === colorId)?.css ?? '#fff';
}

export function HUD() {
  const { hud, raceStatus, countdownMs } = useGameStore();

  const countdownNumber = Math.ceil(countdownMs / 1000);
  const lightsLit = countdownNumber > 0 ? 4 - countdownNumber : 3;

  return (
    <div className="pointer-events-none absolute inset-0 font-display">
      {/* Top stat bar */}
      <div className="absolute left-0 right-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-4">
        {/* Lap */}
        <div className="rounded-xl border border-white/5 bg-asphalt/70 px-4 py-2 shadow-lg backdrop-blur-md">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-silver-dim">
            Lap
          </div>
          <div className="font-display text-3xl font-black leading-none text-silver">
            {hud.lap}
            <span className="text-base text-silver-dim">/{hud.totalLaps}</span>
          </div>
        </div>

        {/* Position */}
        <div className="rounded-xl border border-race-red/30 bg-asphalt/70 px-4 py-2 text-center shadow-lg shadow-race-red/20 backdrop-blur-md">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-silver-dim">
            Position
          </div>
          <div className="font-display text-3xl font-black leading-none text-race-red">
            {hud.position}
            <span className="text-base text-silver-dim">
              /{hud.playerCount}
            </span>
          </div>
        </div>

        {/* Speed + RPM */}
        <div className="rounded-xl border border-white/5 bg-asphalt/70 px-4 py-2 text-right shadow-lg backdrop-blur-md">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-silver-dim">
            Speed
          </div>
          <div className="font-display text-3xl font-black leading-none text-silver">
            {hud.speed}
            <span className="text-base text-silver-dim"> mph</span>
          </div>
          {/* RPM bar */}
          <div className="mt-1.5 h-1.5 w-24 overflow-hidden rounded-full bg-asphalt-700">
            <div
              className="h-full rounded-full transition-[width] duration-100"
              style={{
                width: `${Math.round(hud.rpm * 100)}%`,
                background:
                  hud.rpm > 0.85
                    ? 'linear-gradient(90deg, #f0c419 0%, #d5001c 100%)'
                    : 'linear-gradient(90deg, #4fd18b 0%, #f0c419 100%)',
                boxShadow:
                  hud.rpm > 0.85 ? '0 0 8px rgba(213,0,28,0.8)' : 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Throttle / brake input bars (bottom-left) */}
      <div className="absolute bottom-24 left-3 flex flex-col gap-1.5 sm:bottom-4 sm:left-4">
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] font-bold uppercase tracking-wider text-silver-dim">
            Gas
          </span>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-asphalt-700">
            <div
              className="h-full rounded-full bg-race-red transition-[width] duration-75"
              style={{
                width: hud.throttle ? '100%' : '0%',
                boxShadow: hud.throttle ? '0 0 8px rgba(213,0,28,0.7)' : 'none',
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-8 text-[10px] font-bold uppercase tracking-wider text-silver-dim">
            Brk
          </span>
          <div className="h-2 w-20 overflow-hidden rounded-full bg-asphalt-700">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-75"
              style={{
                width: hud.brake ? '100%' : '0%',
                boxShadow: hud.brake ? '0 0 8px rgba(240,196,25,0.7)' : 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Mini-map (bottom-right) */}
      <div className="pointer-events-none absolute bottom-24 right-3 hidden sm:bottom-4 sm:right-4 sm:block">
        <div className="rounded-xl border border-white/10 bg-asphalt/70 p-2 shadow-lg backdrop-blur-md">
          <svg
            viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
            className="h-28 w-44 rounded-lg"
            style={{ background: 'rgba(20, 53, 31, 0.6)' }}
          >
            {/* Track outline */}
            <polyline
              points={CENTERLINE.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#3a3a42"
              strokeWidth={WORLD_WIDTH * 0.04}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <polyline
              points={CENTERLINE.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#d4d7dd"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.4}
            />
            {/* Car dots */}
            {hud.carPositions.map((c) => (
              <circle
                key={c.id}
                cx={c.x}
                cy={c.y}
                r={c.isLocal ? WORLD_WIDTH * 0.012 : WORLD_WIDTH * 0.008}
                fill={colorCss(c.colorId)}
                stroke={c.isLocal ? '#ffffff' : 'none'}
                strokeWidth={c.isLocal ? WORLD_WIDTH * 0.004 : 0}
              />
            ))}
          </svg>
        </div>
      </div>

      {/* Countdown overlay — traffic lights */}
      {raceStatus === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="flex gap-3 rounded-2xl border border-white/10 bg-asphalt/80 p-4 shadow-2xl backdrop-blur-md">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`h-10 w-10 rounded-full transition-all duration-300 sm:h-14 sm:w-14 ${
                    i < lightsLit
                      ? 'bg-race-red shadow-[0_0_24px_8px_rgba(213,0,28,0.7)]'
                      : 'bg-asphalt-700'
                  }`}
                />
              ))}
            </div>
            {countdownNumber <= 0 && (
              <div className="animate-pulse text-6xl font-black text-race-red drop-shadow-[0_0_24px_rgba(213,0,28,0.8)] sm:text-7xl">
                GO!
              </div>
            )}
            <p className="text-xs uppercase tracking-[0.3em] text-silver-dim">
              Get ready
            </p>
          </div>
        </div>
      )}

      {/* Leave button */}
      <button
        onClick={() => leaveRoom()}
        className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-asphalt-700 bg-asphalt/70 px-4 py-1.5 text-xs text-silver-dim backdrop-blur transition hover:text-silver sm:hidden"
      >
        Leave
      </button>
      <button
        onClick={() => leaveRoom()}
        className="pointer-events-auto absolute right-4 top-24 hidden rounded-lg border border-asphalt-700 bg-asphalt/70 px-3 py-1.5 text-xs text-silver-dim backdrop-blur transition hover:text-silver sm:block"
      >
        Leave race
      </button>
    </div>
  );
}
