import { useEffect, useRef, useState } from 'react';
import { moveClipHandle } from './clip';
import { ACCENT_THEMES } from './theme';

// A draggable dual-handle range scrubber for picking a start/end clip range
// out of a video's full duration. Pointer Events cover mouse and touch with
// one set of handlers, so no drag library is needed for two handles on one
// axis. Window-level listeners (attached only while actually dragging) mean
// a fast drag off the small handle itself doesn't lose the drag.
export default function ClipScrubber({ duration, start, end, onChange, accent }) {
  const theme = accent || ACCENT_THEMES.emerald;
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'start' | 'end' | null

  function percentFor(time) {
    return duration > 0 ? (time / duration) * 100 : 0;
  }

  function timeForClientX(clientX) {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return Math.min(1, Math.max(0, ratio)) * duration;
  }

  useEffect(() => {
    if (!dragging) return undefined;

    function handleMove(e) {
      const time = timeForClientX(e.clientX);
      onChange(moveClipHandle({ which: dragging, time, start, end, duration }));
    }
    function handleUp() {
      setDragging(null);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragging, start, end, duration]);

  return (
    <div ref={trackRef} className="relative h-2 rounded-full bg-neutral-800 mt-3 mb-4 select-none">
      <div
        className={`absolute h-full ${theme.fill} rounded-full pointer-events-none`}
        style={{
          left: `${percentFor(start)}%`,
          width: `${Math.max(0, percentFor(end) - percentFor(start))}%`,
        }}
      />
      <div
        onPointerDown={() => setDragging('start')}
        className={`absolute top-1/2 w-4 h-4 rounded-full bg-neutral-100 border-2 ${theme.border} cursor-grab active:cursor-grabbing`}
        style={{ left: `${percentFor(start)}%`, transform: 'translate(-50%, -50%)' }}
      />
      <div
        onPointerDown={() => setDragging('end')}
        className={`absolute top-1/2 w-4 h-4 rounded-full bg-neutral-100 border-2 ${theme.border} cursor-grab active:cursor-grabbing`}
        style={{ left: `${percentFor(end)}%`, transform: 'translate(-50%, -50%)' }}
      />
    </div>
  );
}
