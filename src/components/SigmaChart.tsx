import { useEffect, useState } from 'react';
import { formatPsnr, formatSsim } from '../dsp/format';
import type { SigmaSweepPoint } from '../dsp/types';

interface SigmaChartProps {
  sweep: readonly SigmaSweepPoint[];
  activeSigma: number;
  onSelectSigma?: (sigma: number) => void;
}

export function SigmaChart({ sweep, activeSigma, onSelectSigma }: SigmaChartProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const matchIdx = sweep.findIndex((pt) => Math.abs(pt.sigma - activeSigma) < 0.05);
    setSelectedIndex(matchIdx >= 0 ? matchIdx : null);
  }, [activeSigma, sweep]);

  if (sweep.length === 0) return null;

  const bestPoint = sweep.reduce((best, cur) => (cur.psnrDb > best.psnrDb ? cur : best), sweep[0]!);
  const inspected = selectedIndex !== null ? sweep[selectedIndex] ?? bestPoint : bestPoint;

  const svgWidth = 680;
  const svgHeight = 250;
  const padLeft = 58;
  const padRight = 56;
  const padTop = 22;
  const padBottom = 42;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const finitePsnrs = sweep.map((s) => (Number.isFinite(s.psnrDb) ? s.psnrDb : 60));
  const minPsnr = Math.floor(Math.min(...finitePsnrs) - 2);
  const maxPsnr = Math.ceil(Math.max(...finitePsnrs) + 2);
  const psnrSpan = Math.max(1, maxPsnr - minPsnr);

  const finiteSsims = sweep.map((s) => (Number.isFinite(s.ssim) ? s.ssim : 0));
  const minSsim = Math.max(0, Math.floor((Math.min(...finiteSsims) - 0.02) * 20) / 20);
  const maxSsim = 1.0;
  const ssimSpan = Math.max(0.05, maxSsim - minSsim);

  const minSigma = sweep[0]!.sigma;
  const maxSigma = sweep[sweep.length - 1]!.sigma;
  const sigmaSpan = Math.max(0.1, maxSigma - minSigma);

  const xPos = (sigma: number) => padLeft + ((sigma - minSigma) / sigmaSpan) * plotW;
  const yPsnr = (val: number) => {
    const safe = Number.isFinite(val) ? val : maxPsnr;
    return padTop + (1 - (safe - minPsnr) / psnrSpan) * plotH;
  };
  const ySsim = (val: number) => {
    const safe = Number.isFinite(val) ? val : minSsim;
    return padTop + (1 - (safe - minSsim) / ssimSpan) * plotH;
  };

  const psnrPath = sweep
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xPos(pt.sigma).toFixed(1)} ${yPsnr(pt.psnrDb).toFixed(1)}`)
    .join(' ');

  const ssimPath = sweep
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xPos(pt.sigma).toFixed(1)} ${ySsim(pt.ssim).toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="figure-card">
      <div className="panel-header" style={{ marginBottom: '0.25rem' }}>
        <div>
          <h3 className="panel-title">Bagaimana lebar notch (sigma) memengaruhi PSNR dan SSIM?</h3>
          <p className="panel-subtitle">
            Sigma optimal pada kurva ini: <span className="mono-value">{bestPoint.sigma.toFixed(1)}</span>{' '}
            (PSNR <span className="mono-value">{formatPsnr(bestPoint.psnrDb)}</span>, SSIM{' '}
            <span className="mono-value">{formatSsim(bestPoint.ssim)}</span>). Pilih titik sigma di bawah untuk menerapkan nilainya.
          </p>
        </div>
      </div>

      <div className="chart-scroll-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="chart-svg"
          role="img"
          aria-label="Grafik sensitivitas PSNR dan SSIM terhadap lebar notch sigma"
        >
          {yTicks.map((t) => {
            const y = padTop + (1 - t) * plotH;
            const psnrTick = minPsnr + t * psnrSpan;
            const ssimTick = minSsim + t * ssimSpan;
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={padLeft + plotW}
                  y2={y}
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--accent-text)"
                  fontSize="12"
                  fontFamily="var(--font-mono)"
                >
                  {psnrTick.toFixed(0)}
                </text>
                <text
                  x={padLeft + plotW + 8}
                  y={y + 4}
                  textAnchor="start"
                  fill="var(--status-success)"
                  fontSize="12"
                  fontFamily="var(--font-mono)"
                >
                  {ssimTick.toFixed(2)}
                </text>
              </g>
            );
          })}

          <text
            x={padLeft}
            y={14}
            fill="var(--accent-text)"
            fontSize="12"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            PSNR (dB)
          </text>
          <text
            x={padLeft + plotW}
            y={14}
            textAnchor="end"
            fill="var(--status-success)"
            fontSize="12"
            fontWeight="600"
            fontFamily="var(--font-sans)"
          >
            SSIM
          </text>
          <text
            x={padLeft + plotW / 2}
            y={svgHeight - 6}
            textAnchor="middle"
            fill="var(--text-secondary)"
            fontSize="12"
            fontFamily="var(--font-sans)"
          >
            Lebar notch (sigma)
          </text>

          {sweep.map((pt) => {
            const x = xPos(pt.sigma);
            return (
              <text
                key={pt.sigma}
                x={x}
                y={padTop + plotH + 18}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="12"
                fontFamily="var(--font-mono)"
              >
                {pt.sigma.toFixed(1)}
              </text>
            );
          })}

          {activeSigma >= minSigma && activeSigma <= maxSigma ? (
            <line
              x1={xPos(activeSigma)}
              y1={padTop}
              x2={xPos(activeSigma)}
              y2={padTop + plotH}
              stroke="var(--border-control)"
              strokeDasharray="4 3"
              strokeWidth="1.2"
            />
          ) : null}

          <path d={psnrPath} fill="none" stroke="var(--accent-text)" strokeWidth="2.4" />
          <path
            d={ssimPath}
            fill="none"
            stroke="var(--status-success)"
            strokeWidth="2.2"
            strokeDasharray="6 3"
          />

          {sweep.map((pt, idx) => {
            const x = xPos(pt.sigma);
            const isCurrent = Math.abs(pt.sigma - activeSigma) < 0.05;
            return (
              <g key={pt.sigma}>
                <circle
                  cx={x}
                  cy={yPsnr(pt.psnrDb)}
                  r={isCurrent ? 5.5 : 4}
                  fill="var(--accent-text)"
                  stroke="var(--bg-panel)"
                  strokeWidth="1.5"
                />
                <rect
                  x={x - 3.5}
                  y={ySsim(pt.ssim) - 3.5}
                  width="7"
                  height="7"
                  fill="var(--status-success)"
                  stroke="var(--bg-panel)"
                  strokeWidth="1.2"
                />
                {selectedIndex === idx ? (
                  <circle
                    cx={x}
                    cy={yPsnr(pt.psnrDb)}
                    r="9"
                    fill="none"
                    stroke="var(--text-primary)"
                    strokeWidth="1.5"
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="legend-row" style={{ marginTop: 0 }}>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--accent-text)', height: '3px' }} aria-hidden="true" />
          Garis utuh + bulat: PSNR (dB)
        </span>
        <span className="legend-item">
          <span
            className="legend-swatch"
            style={{ borderTop: '2px dashed var(--status-success)', height: '2px' }}
            aria-hidden="true"
          />
          Garis putus + kotak: SSIM
        </span>
        <span className="mono-value" style={{ marginLeft: 'auto', color: 'var(--text-primary)' }}>
          Titik dipilih: sigma={inspected.sigma.toFixed(1)} | PSNR {formatPsnr(inspected.psnrDb)} | SSIM{' '}
          {formatSsim(inspected.ssim)}
        </span>
      </div>

      {onSelectSigma ? (
        <div className="chip-list" aria-label="Pilih titik sigma dari kurva">
          {sweep.map((pt, idx) => {
            const isSelected = Math.abs(pt.sigma - activeSigma) < 0.05;
            return (
              <button
                key={pt.sigma}
                type="button"
                className="btn btn-compact btn-toggle"
                aria-pressed={isSelected}
                onMouseEnter={() => setSelectedIndex(idx)}
                onFocus={() => setSelectedIndex(idx)}
                onClick={() => {
                  setSelectedIndex(idx);
                  onSelectSigma(pt.sigma);
                }}
              >
                <span className="mono-value">sigma {pt.sigma.toFixed(1)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
