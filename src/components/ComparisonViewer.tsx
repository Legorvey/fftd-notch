import { memo, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { drawArrayToCanvas } from '../dsp/colormap';

interface ComparisonViewerProps {
  leftLabel: string;
  leftData: Float64Array;
  rightLabel: string;
  rightData: Float64Array;
  width: number;
  height: number;
}

export const ComparisonViewer = memo(function ComparisonViewer({
  leftLabel,
  leftData,
  rightLabel,
  rightData,
  width,
  height,
}: ComparisonViewerProps) {
  const [splitPercent, setSplitPercent] = useState(50);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageRectRef = useRef<DOMRect | null>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number | null>(null);
  const sliderId = useId();

  useEffect(() => {
    if (leftCanvasRef.current) {
      drawArrayToCanvas(leftCanvasRef.current, leftData, width, height, 'gray', false);
    }
  }, [leftData, width, height]);

  useEffect(() => {
    if (rightCanvasRef.current) {
      drawArrayToCanvas(rightCanvasRef.current, rightData, width, height, 'gray', false);
    }
  }, [rightData, width, height]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const commitClientX = (clientX: number) => {
    const rect = stageRectRef.current ?? stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
    setSplitPercent(pct);
  };

  const updateFromClientX = (clientX: number) => {
    pendingClientXRef.current = clientX;
    if (rafIdRef.current !== null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      if (pendingClientXRef.current !== null) {
        commitClientX(pendingClientXRef.current);
      }
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stageRectRef.current = stageRef.current?.getBoundingClientRect() ?? null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    commitClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const handlePointerUp = () => {
    setDragging(false);
    stageRectRef.current = null;
  };

  const handleStageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSplitPercent((p) => Math.max(0, p - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSplitPercent((p) => Math.min(100, p + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSplitPercent(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSplitPercent(100);
    }
  };

  return (
    <div>
      <div
        ref={stageRef}
        className={`split-stage${dragging ? ' is-dragging' : ''}`}
        tabIndex={0}
        role="group"
        aria-label={`Perbandingan ${leftLabel} dan ${rightLabel}. Gunakan panah kiri atau kanan untuk menggeser pemisah.`}
        style={{ aspectRatio: `${width} / ${height}`, maxHeight: 'min(70dvh, 640px)', cursor: 'ew-resize' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleStageKeyDown}
      >
        <canvas
          ref={rightCanvasRef}
          width={width}
          height={height}
          className="split-layer-base display-canvas"
          role="img"
          aria-label={`Sisi kanan: ${rightLabel}`}
        />
        <div
          className="split-layer-overlay"
          style={{ clipPath: `inset(0 ${100 - splitPercent}% 0 0)` }}
        >
          <canvas
            ref={leftCanvasRef}
            width={width}
            height={height}
            className="display-canvas"
            style={{ width: '100%', height: '100%' }}
            role="img"
            aria-label={`Sisi kiri: ${leftLabel}`}
          />
        </div>

        <span className="split-tag split-tag-left">{leftLabel}</span>
        <span className="split-tag split-tag-right">{rightLabel}</span>
        <div className="split-divider" style={{ left: `${splitPercent}%` }} aria-hidden="true">
          <div className="split-handle">&lt;|&gt;</div>
        </div>
      </div>

      <div className="split-slider-row">
        <label htmlFor={sliderId} className="field-label" style={{ flex: '0 0 auto' }}>
          Geser pemisah perbandingan
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          value={splitPercent}
          onChange={(e) => setSplitPercent(Number(e.target.value))}
          className="range-input"
          aria-valuetext={`${splitPercent}% ${leftLabel}, ${100 - splitPercent}% ${rightLabel}`}
        />
        <span className="mono-value">{splitPercent}%</span>
        <div className="btn-segmented" role="group" aria-label="Posisi cepat pemisah">
          <button
            type="button"
            className="btn btn-compact btn-toggle"
            aria-pressed={splitPercent === 0}
            onClick={() => setSplitPercent(0)}
          >
            100% Hasil
          </button>
          <button
            type="button"
            className="btn btn-compact btn-toggle"
            aria-pressed={splitPercent === 50}
            onClick={() => setSplitPercent(50)}
          >
            50/50
          </button>
          <button
            type="button"
            className="btn btn-compact btn-toggle"
            aria-pressed={splitPercent === 100}
            onClick={() => setSplitPercent(100)}
          >
            100% Asli
          </button>
        </div>
      </div>
    </div>
  );
});
