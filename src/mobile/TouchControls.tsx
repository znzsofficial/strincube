import { useRef, useEffect } from 'react';

type TouchControlsProps = {
  onMove: (x: number, y: number) => void;
  onJump: () => void;
  onLook: (dx: number, dy: number) => void;
  onTap: (x: number, y: number) => void;
  onPlace: (x: number, y: number) => void;
  onPause: () => void;
};

export function TouchControls({ onMove, onJump, onLook, onTap, onPlace, onPause }: TouchControlsProps) {
  const joystickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const lookAreaRef = useRef<HTMLDivElement>(null);
  const joystickTouchId = useRef<number | null>(null);
  const joystickCenter = useRef({ x: 0, y: 0 });
  const lookTouchId = useRef<number | null>(null);
  const lookLastPos = useRef({ x: 0, y: 0 });
  const tapStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const JOYSTICK_RADIUS = 50;

  useEffect(() => {
    const joystick = joystickRef.current;
    const lookArea = lookAreaRef.current;
    if (!joystick || !lookArea) return;

    const onJoystickStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const touch = e.changedTouches[0];
      joystickTouchId.current = touch.identifier;
      const rect = joystick.getBoundingClientRect();
      joystickCenter.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const onJoystickMove = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === joystickTouchId.current) {
          e.preventDefault();
          const dx = touch.clientX - joystickCenter.current.x;
          const dy = touch.clientY - joystickCenter.current.y;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(dist, JOYSTICK_RADIUS);
          const angle = Math.atan2(dy, dx);
          const nx = (Math.cos(angle) * clamped) / JOYSTICK_RADIUS;
          const ny = (Math.sin(angle) * clamped) / JOYSTICK_RADIUS;
          onMove(nx, -ny);
          if (knobRef.current) {
            knobRef.current.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
          }
        }
      }
    };

    const onJoystickEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === joystickTouchId.current) {
          joystickTouchId.current = null;
          onMove(0, 0);
          if (knobRef.current) knobRef.current.style.transform = 'translate(0, 0)';
        }
      }
    };

    const onLookStart = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === joystickTouchId.current) continue;
        if (lookTouchId.current !== null) continue;
        lookTouchId.current = touch.identifier;
        lookLastPos.current = { x: touch.clientX, y: touch.clientY };
        tapStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      }
    };

    const onLookMove = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === lookTouchId.current) {
          e.preventDefault();
          const dx = touch.clientX - lookLastPos.current.x;
          const dy = touch.clientY - lookLastPos.current.y;
          lookLastPos.current = { x: touch.clientX, y: touch.clientY };
          onLook(dx, dy);
        }
      }
    };

    const onLookEnd = (e: TouchEvent) => {
      for (const touch of Array.from(e.changedTouches)) {
        if (touch.identifier === lookTouchId.current) {
          if (tapStart.current) {
            const dx = Math.abs(touch.clientX - tapStart.current.x);
            const dy = Math.abs(touch.clientY - tapStart.current.y);
            const dt = Date.now() - tapStart.current.time;
            if (dx < 15 && dy < 15 && dt < 300) {
              onTap(touch.clientX, touch.clientY);
            }
          }
          lookTouchId.current = null;
          tapStart.current = null;
        }
      }
    };

    joystick.addEventListener('touchstart', onJoystickStart, { passive: false });
    joystick.addEventListener('touchmove', onJoystickMove, { passive: false });
    joystick.addEventListener('touchend', onJoystickEnd, { passive: false });
    joystick.addEventListener('touchcancel', onJoystickEnd, { passive: false });

    lookArea.addEventListener('touchstart', onLookStart, { passive: false });
    lookArea.addEventListener('touchmove', onLookMove, { passive: false });
    lookArea.addEventListener('touchend', onLookEnd, { passive: false });
    lookArea.addEventListener('touchcancel', onLookEnd, { passive: false });

    return () => {
      joystick.removeEventListener('touchstart', onJoystickStart);
      joystick.removeEventListener('touchmove', onJoystickMove);
      joystick.removeEventListener('touchend', onJoystickEnd);
      joystick.removeEventListener('touchcancel', onJoystickEnd);
      lookArea.removeEventListener('touchstart', onLookStart);
      lookArea.removeEventListener('touchmove', onLookMove);
      lookArea.removeEventListener('touchend', onLookEnd);
      lookArea.removeEventListener('touchcancel', onLookEnd);
    };
  }, [onMove, onLook, onTap]);

  return (
    <div className="touch-controls">
      <div className="touch-look-area" ref={lookAreaRef} />

      <div className="touch-joystick" ref={joystickRef}>
        <div className="touch-joystick-bg">
          <div className="touch-joystick-knob" ref={knobRef} />
        </div>
      </div>

      <div className="touch-right">
        <button type="button" className="touch-jump" onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onJump(); }}>
          跳
        </button>
        <button type="button" className="touch-place" onTouchStart={(e) => {
          e.preventDefault(); e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          onPlace(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }}>
          放
        </button>
        <button type="button" className="touch-pause" onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); onPause(); }}>
          ❚❚
        </button>
      </div>
    </div>
  );
}
