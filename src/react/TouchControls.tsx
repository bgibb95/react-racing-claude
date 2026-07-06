import { useEffect, useState } from 'react';
import { resetTouchInput, setTouchInput, type RawInput } from '../game/input';

type Key = keyof RawInput;

function usePedal(key: Key) {
  // Returns handlers that hold the input while pressed and release reliably.
  const press = () => setTouchInput({ [key]: true } as Partial<RawInput>);
  const release = () => setTouchInput({ [key]: false } as Partial<RawInput>);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      press();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
  };
}

const base =
  'pointer-events-auto flex select-none touch-none items-center justify-center rounded-2xl border border-white/10 text-lg font-black uppercase text-white/90 backdrop-blur active:brightness-125';

export function TouchControls() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const coarse =
      window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
    setShow(coarse);
    return () => resetTouchInput();
  }, []);

  const left = usePedal('left');
  const right = usePedal('right');
  const gas = usePedal('throttle');
  const brake = usePedal('brake');

  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-4 pb-6">
      {/* Steering */}
      <div className="flex gap-3">
        <button {...left} className={`${base} h-20 w-20 bg-asphalt-700/70`}>
          ◀
        </button>
        <button {...right} className={`${base} h-20 w-20 bg-asphalt-700/70`}>
          ▶
        </button>
      </div>

      {/* Pedals */}
      <div className="flex gap-3">
        <button {...brake} className={`${base} h-20 w-20 bg-asphalt-700/70`}>
          Brk
        </button>
        <button {...gas} className={`${base} h-24 w-24 bg-race-red/80`}>
          Gas
        </button>
      </div>
    </div>
  );
}
