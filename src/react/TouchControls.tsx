import { useEffect, useRef, useState } from 'react';
import { resetTouchInput, setTouchInput, type RawInput } from '../game/input';
import { useGameStore } from '../state/store';

type Key = keyof RawInput;

/**
 * Mirrors a single field of the `touchInput` singleton into local React state
 * so the button can re-render with a visible pressed state. The singleton is
 * still the source of truth for the Phaser scene — we just keep a copy here
 * for UI feedback.
 */
function useTouchKey(key: Key) {
  const [pressed, setPressed] = useState(false);
  const press = () => {
    setTouchInput({ [key]: true } as Partial<RawInput>);
    setPressed(true);
  };
  const release = () => {
    setTouchInput({ [key]: false } as Partial<RawInput>);
    setPressed(false);
  };
  return {
    pressed,
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gamepadConnected = useGameStore((s) => s.gamepadConnected);

  useEffect(() => {
    const coarse =
      window.matchMedia?.('(pointer: coarse)').matches ||
      'ontouchstart' in window;
    setShow(coarse);
    return () => resetTouchInput();
  }, []);

  // Hide touch controls while a gamepad is connected, and clear any stuck
  // touch state so the car doesn't keep accelerating after the buttons
  // disappear.
  useEffect(() => {
    if (gamepadConnected) resetTouchInput();
  }, [gamepadConnected]);

  // Prevent the page from scrolling/zooming when a finger drags across a
  // button. Non-passive listener is required to call preventDefault.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-key]')) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
  }, []);

  const left = useTouchKey('left');
  const right = useTouchKey('right');
  const gas = useTouchKey('throttle');
  const brake = useTouchKey('brake');

  if (!show || gamepadConnected) return null;

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-x-4 px-[max(1rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
    >
      {/* Steering */}
      <div className="flex gap-2 sm:gap-3">
        <button
          {...left}
          data-key="left"
          data-pressed={left.pressed}
          aria-label="Steer left"
          aria-pressed={left.pressed}
          className={`${base} h-[min(5rem,14vw)] w-[min(5rem,14vw)] bg-asphalt-700/70`}
        >
          ◀
        </button>
        <button
          {...right}
          data-key="right"
          data-pressed={right.pressed}
          aria-label="Steer right"
          aria-pressed={right.pressed}
          className={`${base} h-[min(5rem,14vw)] w-[min(5rem,14vw)] bg-asphalt-700/70`}
        >
          ▶
        </button>
      </div>

      {/* Pedals */}
      <div className="flex gap-2 sm:gap-3">
        <button
          {...brake}
          data-key="brake"
          data-pressed={brake.pressed}
          aria-label="Brake"
          aria-pressed={brake.pressed}
          className={`${base} h-[min(5rem,14vw)] w-[min(5rem,14vw)] bg-asphalt-700/70`}
        >
          Brk
        </button>
        <button
          {...gas}
          data-key="throttle"
          data-pressed={gas.pressed}
          aria-label="Accelerate"
          aria-pressed={gas.pressed}
          className={`${base} h-[min(6rem,17vw)] w-[min(6rem,17vw)] bg-race-red/80`}
        >
          Gas
        </button>
      </div>
    </div>
  );
}
