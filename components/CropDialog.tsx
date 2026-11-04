'use client';

import { useRef, useState } from 'react';
import { cropPixels, cropTooSmall } from '@/lib/imageEdit';
import type { Rect } from '@/lib/printArea';

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const MIN_FRACTION = 0.05;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Moves or resizes the crop box by (dx, dy), measured as fractions of the picture, keeping it inside the picture. */
function drag(start: Rect, handle: Handle, dx: number, dy: number, square: number | null): Rect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.width), y: clamp(start.y + dy, 0, 1 - start.height) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;
  if (handle === 'nw' || handle === 'sw') left = clamp(left + dx, 0, right - MIN_FRACTION);
  if (handle === 'ne' || handle === 'se') right = clamp(right + dx, left + MIN_FRACTION, 1);
  if (handle === 'nw' || handle === 'ne') top = clamp(top + dy, 0, bottom - MIN_FRACTION);
  if (handle === 'sw' || handle === 'se') bottom = clamp(bottom + dy, top + MIN_FRACTION, 1);
  if (square !== null) {
    // keep the box square on the picture: its width in fractions times the picture's ratio equals its height
    const width = right - left;
    const height = Math.min(bottom - top, width * square);
    const w = Math.min(width, height / square);
    if (handle === 'nw' || handle === 'sw') left = right - w;
    else right = left + w;
    if (handle === 'nw' || handle === 'ne') top = bottom - w * square;
    else bottom = top + w * square;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** A full-screen cropper: drag the corners or the middle of the box, then press Crop. */
export function CropDialog({
  url,
  natural,
  onApply,
  onCancel,
}: {
  url: string;
  /** The picture's real size in pixels. */
  natural: { width: number; height: number };
  onApply: (crop: Rect) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState<Rect>({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 });
  const [squareLock, setSquareLock] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ handle: Handle; startX: number; startY: number; start: Rect } | null>(null);
  // a square box on the picture has width w and height w * (naturalWidth / naturalHeight) in fractions
  const squareRatio = natural.width / natural.height;

  const box = cropPixels(natural, crop);
  const tooSmall = cropTooSmall(box);

  function begin(handle: Handle, e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
  }

  function move(e: React.PointerEvent) {
    const g = gesture.current;
    const r = frame.current?.getBoundingClientRect();
    if (!g || !r) return;
    setCrop(drag(g.start, g.handle, (e.clientX - g.startX) / r.width, (e.clientY - g.startY) / r.height, squareLock ? squareRatio : null));
  }

  const end = () => (gesture.current = null);

  function toggleSquare(on: boolean) {
    setSquareLock(on);
    if (on) {
      // shrink the current box to a square about its top-left corner
      const w = Math.min(crop.width, crop.height / squareRatio);
      setCrop({ ...crop, width: w, height: w * squareRatio });
    }
  }

  const handleClass = 'absolute h-7 w-7 touch-none rounded-full border-2 border-ink bg-white';
  return (
    <div role="dialog" aria-modal="true" aria-label="Crop picture" className="fixed inset-0 z-50 flex flex-col gap-3 bg-ink/90 p-4">
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div ref={frame} data-testid="crop-frame" className="relative max-h-full max-w-full touch-none select-none" style={{ aspectRatio: `${natural.width} / ${natural.height}`, height: '100%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" crossOrigin="anonymous" draggable={false} className="h-full w-full object-fill" />
          <div
            data-testid="crop-box"
            onPointerDown={(e) => begin('move', e)}
            onPointerMove={move}
            onPointerUp={end}
            className="absolute cursor-move touch-none border-2 border-white"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            }}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <span
                key={h}
                data-testid={`crop-${h}`}
                onPointerDown={(e) => begin(h, e)}
                onPointerMove={move}
                onPointerUp={end}
                className={`${handleClass} ${h.includes('n') ? '-top-3.5' : '-bottom-3.5'} ${h.includes('w') ? '-left-3.5' : '-right-3.5'} ${h === 'nw' || h === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-col gap-2 text-paper">
        <p data-testid="crop-size" className={`text-center text-sm font-semibold ${tooSmall ? 'text-marigold' : ''}`}>
          {box.sw} &times; {box.sh} px{tooSmall ? ': too small to print, make the box bigger' : ''}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-quiet btn-sm flex-1 !text-paper" aria-pressed={!squareLock} onClick={() => toggleSquare(false)}>
            Free
          </button>
          <button className="btn btn-quiet btn-sm flex-1 !text-paper" aria-pressed={squareLock} onClick={() => toggleSquare(true)}>
            Square
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-quiet btn-sm flex-1 !text-paper" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-sm flex-1" disabled={tooSmall} onClick={() => onApply(crop)}>
            Crop
          </button>
        </div>
      </div>
    </div>
  );
}
