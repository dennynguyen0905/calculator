import { BOTTOM_ROWS, TOP_ROWS, type KeyDef } from 'fx580-engine';
import { useCallback, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';

export interface KeypadProps {
  onPress(id: string): void;
  /** key id currently highlighted by the physical keyboard */
  flash: string | null;
}

const REPEAT = new Set(['left', 'right', 'up', 'down', 'del']);

/** press on pointer-down for minimal latency, with auto-repeat for navigation keys */
function usePressable(id: string, onPress: (id: string) => void) {
  const timer = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => stop, [stop]);
  const down = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.classList.add('pressed');
    onPress(id);
    if (REPEAT.has(id)) {
      stop();
      timer.current = window.setTimeout(() => {
        timer.current = window.setInterval(() => onPress(id), 70);
      }, 420);
    }
  };
  const up = (e: RPointerEvent<HTMLButtonElement>) => {
    e.currentTarget.classList.remove('pressed');
    stop();
  };
  return { onPointerDown: down, onPointerUp: up, onPointerCancel: up, onPointerLeave: up, onContextMenu: (e: { preventDefault(): void }) => e.preventDefault() };
}

function Key({ def, onPress, flash, className = '' }: { def: KeyDef; onPress(id: string): void; flash: boolean; className?: string }) {
  const handlers = usePressable(def.id, onPress);
  return (
    <div className={`keycell ${className}`}>
      <div className="legend">
        <span className="lg-shift">{def.shift ?? ''}</span>
        <span className="lg-alpha">{def.alpha ?? ''}</span>
      </div>
      <button type="button" className={`key k-${def.style} ${flash ? 'pressed' : ''}`} aria-label={def.label} data-key={def.id} {...handlers}>
        <span className="lbl">{def.label}</span>
      </button>
    </div>
  );
}

function PadButton({ id, onPress, children, flash }: { id: string; onPress(id: string): void; children: string; flash: boolean }) {
  const handlers = usePressable(id, onPress);
  return (
    <button type="button" className={`padbtn pad-${id} ${flash ? 'pressed' : ''}`} aria-label={id} data-key={id} {...handlers}>
      {children}
    </button>
  );
}

export function Keypad({ onPress, flash }: KeypadProps) {
  return (
    <div className="keypad">
      <div className="top-grid">
        {TOP_ROWS.map((row, r) =>
          row.map((def, c) =>
            def ? (
              <div key={def.id} style={{ gridRow: r + 1, gridColumn: c + 1 }} className="cellwrap">
                <Key def={def} onPress={onPress} flash={flash === def.id} />
              </div>
            ) : null,
          ),
        )}
        <div className="replay" style={{ gridRow: '1 / 3', gridColumn: '3 / 5' }}>
          <PadButton id="up" onPress={onPress} flash={flash === 'up'}>
            ▲
          </PadButton>
          <PadButton id="left" onPress={onPress} flash={flash === 'left'}>
            ◀
          </PadButton>
          <PadButton id="right" onPress={onPress} flash={flash === 'right'}>
            ▶
          </PadButton>
          <PadButton id="down" onPress={onPress} flash={flash === 'down'}>
            ▼
          </PadButton>
          <span className="replay-label">REPLAY</span>
        </div>
      </div>
      <div className="bottom-grid">
        {BOTTOM_ROWS.map((row, r) =>
          row.map((def, c) => (
            <div key={def.id} style={{ gridRow: r + 1, gridColumn: c + 1 }} className="cellwrap">
              <Key def={def} onPress={onPress} flash={flash === def.id} />
            </div>
          )),
        )}
      </div>
    </div>
  );
}
