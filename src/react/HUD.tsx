import { useGameStore } from '../state/store';
import { leaveRoom } from '../net/controller';

export function HUD() {
  const { hud, raceStatus, countdownMs } = useGameStore();

  const countdownNumber = Math.ceil(countdownMs / 1000);

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top stat bar */}
      <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="rounded-xl bg-asphalt/70 px-4 py-2 backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-silver-dim">
            Lap
          </div>
          <div className="text-2xl font-black leading-none text-silver">
            {hud.lap}
            <span className="text-base text-silver-dim">/{hud.totalLaps}</span>
          </div>
        </div>

        <div className="rounded-xl bg-asphalt/70 px-4 py-2 text-center backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-silver-dim">
            Position
          </div>
          <div className="text-2xl font-black leading-none text-race-red">
            {hud.position}
            <span className="text-base text-silver-dim">/{hud.playerCount}</span>
          </div>
        </div>

        <div className="rounded-xl bg-asphalt/70 px-4 py-2 text-right backdrop-blur">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-silver-dim">
            Speed
          </div>
          <div className="text-2xl font-black leading-none text-silver">
            {hud.speed}
            <span className="text-base text-silver-dim"> mph</span>
          </div>
        </div>
      </div>

      {/* Countdown overlay */}
      {raceStatus === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="text-8xl font-black text-race-red drop-shadow-[0_0_24px_rgba(213,0,28,0.7)]">
              {countdownNumber > 0 ? countdownNumber : 'GO!'}
            </div>
            <p className="mt-2 text-sm uppercase tracking-widest text-silver-dim">
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
        className="pointer-events-auto absolute right-4 top-20 hidden rounded-lg border border-asphalt-700 bg-asphalt/70 px-3 py-1.5 text-xs text-silver-dim backdrop-blur transition hover:text-silver sm:block"
      >
        Leave race
      </button>
    </div>
  );
}
