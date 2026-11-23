import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { drawArrayToCanvas } from '../dsp/colormap';
import { symmetricCenter } from '../dsp/notch';
import type { PeakCandidate, Point2D } from '../dsp/types';

interface SpectrumCanvasProps {
  spectrum: Float64Array;
  filteredSpectrum: Float64Array | null;
  width: number;
  height: number;
  centers: readonly Point2D[];
  candidates?: readonly PeakCandidate[];
  sigma: number;
  interactive?: boolean;
  onTogglePoint?: (point: Point2D) => void;
}

function findLocalPeak(
  spectrum: Float64Array,
  width: number,
  height: number,
  pt: Point2D,
  radius = 6,
): Point2D {
  const dcX = Math.floor(width / 2);
  const dcY = Math.floor(height / 2);
  let best = pt;
  let bestVal = -Infinity;
  const y0 = Math.max(0, pt.y - radius);
  const y1 = Math.min(height - 1, pt.y + radius);
  const x0 = Math.max(0, pt.x - radius);
  const x1 = Math.min(width - 1, pt.x + radius);

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((y - pt.y) * (y - pt.y) + (x - pt.x) * (x - pt.x) > radius * radius) continue;
      if (Math.hypot(y - dcY, x - dcX) <= 4) continue;
      const val = spectrum[y * width + x] ?? -Infinity;
      if (val > bestVal) {
        bestVal = val;
        best = { y, x };
      }
    }
  }
  return best;
}

export const SpectrumCanvas = memo(function SpectrumCanvas({
  spectrum,
  filteredSpectrum,
  width,
  height,
  centers,
  candidates = [],
  sigma,
  interactive = true,
  onTogglePoint,
}: SpectrumCanvasProps) {
  const [viewMode, setViewMode] = useState<'original' | 'filtered'>('original');
  const [snapToPeak, setSnapToPeak] = useState(true);
  const [cursorActive, setCursorActive] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const cursorPointRef = useRef<Point2D | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const pulseRafRef = useRef<number | null>(null);
  const pulseStateRef = useRef<{ pt: Point2D; startMs: number } | null>(null);

  const hudCoordRef = useRef<HTMLSpanElement | null>(null);
  const hudOffsetRef = useRef<HTMLSpanElement | null>(null);
  const hudSymRef = useRef<HTMLSpanElement | null>(null);
  const hudMagRef = useRef<HTMLSpanElement | null>(null);

  const activeData =
    viewMode === 'filtered' && filteredSpectrum && filteredSpectrum.length === width * height
      ? filteredSpectrum
      : spectrum;

  const dcY = Math.floor(height / 2);
  const dcX = Math.floor(width / 2);

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (overlay.width !== width) overlay.width = width;
    if (overlay.height !== height) overlay.height = height;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const pt = cursorPointRef.current;
    const pulse = pulseStateRef.current;
    const minDim = Math.min(width, height);
    const strokeScale = Math.max(1, minDim / 260);

    if (pt && interactive) {
      const sym = symmetricCenter(width, height, pt);

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.52)';
      ctx.lineWidth = strokeScale;
      ctx.beginPath();
      ctx.moveTo(pt.x, 0);
      ctx.lineTo(pt.x, height);
      ctx.moveTo(0, pt.y);
      ctx.lineTo(width, pt.y);
      ctx.stroke();

      ctx.strokeStyle = '#F5B759';
      ctx.lineWidth = 1.6 * strokeScale;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(4, 4 * strokeScale), 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(253, 230, 138, 0.85)';
      ctx.setLineDash([3 * strokeScale, 2.5 * strokeScale]);
      ctx.beginPath();
      ctx.arc(sym.x, sym.y, Math.max(3, 3.5 * strokeScale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (pulse) {
      const elapsed = performance.now() - pulse.startMs;
      const duration = 380;
      if (elapsed < duration) {
        const t = elapsed / duration;
        const ease = 1 - Math.pow(1 - t, 3);
        const radius = (4 + ease * 24) * strokeScale;
        const alpha = (1 - t) * 0.9;
        const sym = symmetricCenter(width, height, pulse.pt);

        ctx.save();
        ctx.strokeStyle = `rgba(245, 183, 89, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2 * strokeScale * (1 - t * 0.5);
        ctx.beginPath();
        ctx.arc(pulse.pt.x, pulse.pt.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        if (sym.y !== pulse.pt.y || sym.x !== pulse.pt.x) {
          ctx.setLineDash([3 * strokeScale, 2.5 * strokeScale]);
          ctx.strokeStyle = `rgba(253, 230, 138, ${(alpha * 0.85).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(sym.x, sym.y, radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        pulseStateRef.current = null;
      }
    }
  }, [width, height, interactive]);

  const triggerConjugatePulse = useCallback(
    (pt: Point2D) => {
      if (
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      pulseStateRef.current = { pt, startMs: performance.now() };
      if (pulseRafRef.current !== null) {
        window.cancelAnimationFrame(pulseRafRef.current);
      }
      const tick = () => {
        drawOverlay();
        if (pulseStateRef.current) {
          pulseRafRef.current = window.requestAnimationFrame(tick);
        } else {
          pulseRafRef.current = null;
        }
      };
      pulseRafRef.current = window.requestAnimationFrame(tick);
    },
    [drawOverlay],
  );

  const updateHudDom = useCallback(
    (pt: Point2D | null) => {
      if (!pt) return;
      const sym = symmetricCenter(width, height, pt);
      const mag =
        pt.y >= 0 && pt.y < height && pt.x >= 0 && pt.x < width
          ? activeData[pt.y * width + pt.x]
          : undefined;
      if (hudCoordRef.current) hudCoordRef.current.textContent = `(y=${pt.y}, x=${pt.x})`;
      if (hudOffsetRef.current) {
        hudOffsetRef.current.textContent = `(u=${pt.x - dcX}, v=${pt.y - dcY})`;
      }
      if (hudSymRef.current) hudSymRef.current.textContent = `(y=${sym.y}, x=${sym.x})`;
      if (hudMagRef.current) {
        hudMagRef.current.textContent = mag !== undefined ? mag.toFixed(2) : '-';
      }
    },
    [activeData, width, height, dcX, dcY],
  );

  const scheduleOverlayUpdate = useCallback(
    (rawPt: Point2D | null) => {
      const resolved =
        rawPt && snapToPeak ? findLocalPeak(spectrum, width, height, rawPt) : rawPt;
      const prev = cursorPointRef.current;
      if (
        resolved &&
        prev &&
        resolved.x === prev.x &&
        resolved.y === prev.y
      ) {
        return;
      }
      cursorPointRef.current = resolved;
      setCursorActive(resolved !== null);
      if (resolved) updateHudDom(resolved);

      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        drawOverlay();
      });
    },
    [drawOverlay, snapToPeak, spectrum, width, height, updateHudDom],
  );

  // Reset cursor when image or dimensions change so indices stay in bounds.
  useEffect(() => {
    cursorPointRef.current = null;
    setCursorActive(false);
    drawOverlay();
  }, [spectrum, width, height, drawOverlay]);

  // Cancel pending rAF and release offscreen backing store on unmount.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      if (pulseRafRef.current !== null) {
        window.cancelAnimationFrame(pulseRafRef.current);
      }
      if (offscreenRef.current) {
        offscreenRef.current.width = 0;
        offscreenRef.current.height = 0;
        offscreenRef.current = null;
      }
    };
  }, []);

  // Render base spectrum to offscreen canvas (reusing cached ImageData).
  useEffect(() => {
    if (width < 1 || height < 1 || activeData.length !== width * height) return;
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    drawArrayToCanvas(offscreenRef.current, activeData, width, height, 'inferno', true);
  }, [activeData, width, height]);

  // Composite static layers: base spectrum + DC reticle + candidate diamonds + active notch rings.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = offscreenRef.current;
    if (!canvas || !base || base.width !== width || base.height !== height) return;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(base, 0, 0);

    const minDim = Math.min(width, height);
    const strokeScale = Math.max(1, minDim / 260);

    ctx.save();
    ctx.strokeStyle = '#67E8F9';
    ctx.lineWidth = 1.5 * strokeScale;
    const dcArm = Math.max(5, Math.round(minDim * 0.02));
    ctx.beginPath();
    ctx.moveTo(dcX - dcArm, dcY);
    ctx.lineTo(dcX + dcArm, dcY);
    ctx.moveTo(dcX, dcY - dcArm);
    ctx.lineTo(dcX, dcY + dcArm);
    ctx.stroke();
    ctx.restore();

    if (candidates.length > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(237, 241, 245, 0.82)';
      ctx.lineWidth = 1.2 * strokeScale;
      const r = Math.max(4, Math.round(minDim * 0.015));
      for (const cand of candidates) {
        ctx.beginPath();
        ctx.moveTo(cand.x, cand.y - r);
        ctx.lineTo(cand.x + r, cand.y);
        ctx.lineTo(cand.x, cand.y + r);
        ctx.lineTo(cand.x - r, cand.y);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    const visualRadius = Math.max(4 * strokeScale, sigma * 2.2);
    for (const pt of centers) {
      const sym = symmetricCenter(width, height, pt);
      ctx.save();
      ctx.strokeStyle = '#F5B759';
      ctx.lineWidth = 1.8 * strokeScale;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, visualRadius, 0, Math.PI * 2);
      ctx.stroke();

      if (sym.y !== pt.y || sym.x !== pt.x) {
        ctx.setLineDash([3 * strokeScale, 2.5 * strokeScale]);
        ctx.strokeStyle = '#FDE68A';
        ctx.beginPath();
        ctx.arc(sym.x, sym.y, visualRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [activeData, width, height, centers, candidates, sigma, dcX, dcY]);

  const toSpectrumCoord = (event: { clientX: number; clientY: number }): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * height)));
    return { y, x };
  };

  const handleCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    const step = event.shiftKey ? 10 : 1;
    const current = cursorPointRef.current ?? { y: dcY, x: dcX };

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      scheduleOverlayUpdate({ y: Math.max(0, current.y - step), x: current.x });
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      scheduleOverlayUpdate({ y: Math.min(height - 1, current.y + step), x: current.x });
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scheduleOverlayUpdate({ y: current.y, x: Math.max(0, current.x - step) });
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scheduleOverlayUpdate({ y: current.y, x: Math.min(width - 1, current.x + step) });
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (onTogglePoint && cursorPointRef.current) {
        triggerConjugatePulse(cursorPointRef.current);
        onTogglePoint(cursorPointRef.current);
      }
    } else if (event.key === 'Escape') {
      scheduleOverlayUpdate(null);
    }
  };

  return (
    <div className="figure-card">
      <div className="panel-header" style={{ marginBottom: '0.25rem' }}>
        <div>
          <h3 className="panel-title">Spektrum FFT 2D (log magnitude)</h3>
          <p className="panel-subtitle">
            {interactive
              ? 'Klik atau gunakan tombol panah + Enter pada spektrum untuk menambah atau menghapus pasangan notch.'
              : 'Puncak terang di luar pusat DC menunjukkan komponen frekuensi periodik.'}
          </p>
        </div>

        <div className="btn-segmented">
          {interactive ? (
            <button
              type="button"
              className="btn btn-compact btn-toggle"
              aria-pressed={snapToPeak}
              onClick={() => setSnapToPeak((s) => !s)}
              title="Kunci kursor ke piksel puncak lokal terdekat dalam radius 6 piksel"
            >
              Snap puncak
            </button>
          ) : null}

          {filteredSpectrum ? (
            <div className="btn-segmented" role="group" aria-label="Mode tampilan spektrum">
              <button
                type="button"
                className="btn btn-compact btn-toggle"
                aria-pressed={viewMode === 'original'}
                onClick={() => setViewMode('original')}
              >
                Sebelum filter
              </button>
              <button
                type="button"
                className="btn btn-compact btn-toggle"
                aria-pressed={viewMode === 'filtered'}
                onClick={() => setViewMode('filtered')}
              >
                Sesudah filter
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div>
        <div className="canvas-frame" style={{ aspectRatio: `${width} / ${height}` }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            tabIndex={interactive ? 0 : undefined}
            className={`display-canvas${interactive ? ' spectrum-canvas' : ''}`}
            role="img"
            aria-label={`Spektrum FFT 2D ukuran ${width} x ${height} piksel dengan ${centers.length} titik notch aktif${
              interactive ? '. Gunakan panah untuk menggeser kursor dan Enter untuk memilih.' : ''
            }`}
            onPointerMove={(e) => {
              if (!interactive) return;
              const next = toSpectrumCoord(e);
              scheduleOverlayUpdate(next);
            }}
            onPointerLeave={() => {
              if (!interactive) return;
              scheduleOverlayUpdate(null);
            }}
            onClick={(e) => {
              if (!interactive || !onTogglePoint) return;
              const raw = toSpectrumCoord(e);
              if (!raw) return;
              const pt = snapToPeak ? findLocalPeak(spectrum, width, height, raw) : raw;
              triggerConjugatePulse(pt);
              onTogglePoint(pt);
            }}
            onKeyDown={handleCanvasKeyDown}
          />
          <canvas
            ref={overlayRef}
            width={width}
            height={height}
            className="spectrum-overlay-canvas"
            aria-hidden="true"
          />
        </div>

        <div className="spectrum-hud">
          {cursorActive ? (
            <>
              <span>
                Kursor: <span ref={hudCoordRef} className="hud-strong" />
              </span>
              <span>
                Offset: <span ref={hudOffsetRef} className="hud-strong" />
              </span>
              <span>
                Simetris: <span ref={hudSymRef} className="hud-strong" />
              </span>
              <span>
                log(1+|F|): <span ref={hudMagRef} className="hud-strong" />
              </span>
            </>
          ) : (
            <>
              <span>
                Dimensi: <span className="hud-strong">{width} x {height}</span>
              </span>
              <span>
                Pusat DC: <span className="hud-strong">(y={dcY}, x={dcX})</span>
              </span>
              <span>
                Titik notch aktif: <span className="hud-strong">{centers.length} pasang</span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="legend-row" aria-label="Legenda penanda spektrum">
        <span className="legend-item">
          <span className="legend-swatch-frame" aria-hidden="true">
            <span className="legend-swatch" style={{ border: '2px solid #67E8F9' }} />
          </span>
          Tanda (+) pusat DC
        </span>
        <span className="legend-item">
          <span className="legend-swatch-frame" aria-hidden="true">
            <span className="legend-swatch" style={{ borderRadius: '50%', border: '2px solid #F5B759' }} />
          </span>
          Lingkaran utuh: titik notch
        </span>
        <span className="legend-item">
          <span className="legend-swatch-frame" aria-hidden="true">
            <span className="legend-swatch" style={{ borderRadius: '50%', border: '2px dashed #FDE68A' }} />
          </span>
          Lingkaran putus: pasangan simetris
        </span>
        {candidates.length > 0 ? (
          <span className="legend-item">
            <span className="legend-swatch-frame" aria-hidden="true">
              <span
                className="legend-swatch"
                style={{ width: '8px', height: '8px', border: '1.5px solid #EDF1F5', transform: 'rotate(45deg)' }}
              />
            </span>
            Belah ketupat: kandidat otomatis
          </span>
        ) : null}
      </div>
    </div>
  );
});
