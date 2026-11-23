import { useEffect, useRef, useState } from 'react';
import { renderArrayToRGBA } from '../dsp/colormap';
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

export function SpectrumCanvas({
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
  const [hoverPoint, setHoverPoint] = useState<Point2D | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const hoverPointRef = useRef<Point2D | null>(null);

  const activeData =
    viewMode === 'filtered' && filteredSpectrum && filteredSpectrum.length === width * height
      ? filteredSpectrum
      : spectrum;

  // Reset hover coordinate when image or dimensions change so indices stay in bounds.
  useEffect(() => {
    hoverPointRef.current = null;
    setHoverPoint(null);
  }, [spectrum, width, height]);

  // Reuse a single persistent offscreen canvas to avoid bitmap allocation churn.
  useEffect(() => {
    if (width < 1 || height < 1 || activeData.length !== width * height) return;
    if (!offscreenRef.current) {
      offscreenRef.current = document.createElement('canvas');
    }
    const offscreen = offscreenRef.current;
    if (offscreen.width !== width) offscreen.width = width;
    if (offscreen.height !== height) offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    const rgba = renderArrayToRGBA(activeData, 'inferno', true);
    ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  }, [activeData, width, height]);

  // Release offscreen backing store on unmount.
  useEffect(() => {
    return () => {
      if (offscreenRef.current) {
        offscreenRef.current.width = 0;
        offscreenRef.current.height = 0;
        offscreenRef.current = null;
      }
    };
  }, []);

  // Composite the base spectrum plus DC reticle, candidate diamonds, notch rings, and cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    const base = offscreenRef.current;
    if (!canvas || !base || base.width !== width || base.height !== height) return;

    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(base, 0, 0);

    const dcX = Math.floor(width / 2);
    const dcY = Math.floor(height / 2);
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

    if (hoverPoint && interactive) {
      const sym = symmetricCenter(width, height, hoverPoint);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = strokeScale;
      ctx.beginPath();
      ctx.moveTo(hoverPoint.x, 0);
      ctx.lineTo(hoverPoint.x, height);
      ctx.moveTo(0, hoverPoint.y);
      ctx.lineTo(width, hoverPoint.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(245, 183, 89, 0.85)';
      ctx.beginPath();
      ctx.arc(sym.x, sym.y, Math.max(3, 3 * strokeScale), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [activeData, width, height, centers, candidates, sigma, hoverPoint, interactive]);

  const toSpectrumCoord = (event: { clientX: number; clientY: number }): Point2D | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * height)));
    return { y, x };
  };

  const dcY = Math.floor(height / 2);
  const dcX = Math.floor(width / 2);
  const hoverSym = hoverPoint ? symmetricCenter(width, height, hoverPoint) : null;
  const hoverMagnitude =
    hoverPoint && hoverPoint.y < height && hoverPoint.x < width
      ? activeData[hoverPoint.y * width + hoverPoint.x]
      : null;

  return (
    <div className="figure-card">
      <div className="panel-header" style={{ marginBottom: '0.25rem' }}>
        <div>
          <h3 className="panel-title">Spektrum FFT 2D (log magnitude)</h3>
          <p className="panel-subtitle">
            {interactive
              ? 'Klik langsung pada puncak terang di luar pusat DC untuk menambah atau menghapus pasangan notch.'
              : 'Puncak terang di luar pusat DC menunjukkan komponen frekuensi periodik.'}
          </p>
        </div>

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

      <div>
        <div className="canvas-frame" style={{ aspectRatio: `${width} / ${height}` }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`display-canvas${interactive ? ' spectrum-canvas' : ''}`}
            role="img"
            aria-label={`Spektrum FFT 2D ukuran ${width} x ${height} piksel dengan ${centers.length} titik notch aktif`}
            onPointerMove={(e) => {
              if (!interactive) return;
              const next = toSpectrumCoord(e);
              const prev = hoverPointRef.current;
              if (next && prev && next.x === prev.x && next.y === prev.y) return;
              hoverPointRef.current = next;
              setHoverPoint(next);
            }}
            onPointerLeave={() => {
              hoverPointRef.current = null;
              setHoverPoint(null);
            }}
            onClick={(e) => {
              if (!interactive || !onTogglePoint) return;
              const pt = toSpectrumCoord(e);
              if (pt) onTogglePoint(pt);
            }}
          />
        </div>

        <div className="spectrum-hud">
          {hoverPoint && hoverSym ? (
            <>
              <span>
                Kursor: <span className="hud-strong">(y={hoverPoint.y}, x={hoverPoint.x})</span>
              </span>
              <span>
                Offset: <span className="hud-strong">(u={hoverPoint.x - dcX}, v={hoverPoint.y - dcY})</span>
              </span>
              <span>
                Simetris: <span className="hud-strong">(y={hoverSym.y}, x={hoverSym.x})</span>
              </span>
              <span>
                log(1+|F|): <span className="hud-strong">{hoverMagnitude !== null && hoverMagnitude !== undefined ? hoverMagnitude.toFixed(2) : '-'}</span>
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
}
