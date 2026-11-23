import { memo } from 'react';
import { formatDelta, formatPsnr, formatSsim } from '../dsp/format';
import type { QualityMetrics } from '../dsp/types';

interface MetricsTableProps {
  metrics: {
    noCorrection: QualityMetrics;
    gaussianBlur: QualityMetrics;
    notchFilter: QualityMetrics;
  };
}

export const MetricsTable = memo(function MetricsTable({ metrics }: MetricsTableProps) {
  const base = metrics.noCorrection;
  const blur = metrics.gaussianBlur;
  const notch = metrics.notchFilter;

  const psnrVsBase = formatDelta(notch.psnrDb, base.psnrDb, ' dB', 2);
  const ssimVsBase = formatDelta(notch.ssim, base.ssim, '', 4);
  const psnrVsBlur = formatDelta(notch.psnrDb, blur.psnrDb, ' dB', 2);

  const rows: ReadonlyArray<{
    label: string;
    data: QualityMetrics;
    highlight?: boolean;
    isBaseline?: boolean;
  }> = [
    { label: 'Tanpa perbaikan', data: base, isBaseline: true },
    { label: 'Gaussian blur', data: blur },
    { label: 'Notch filter', data: notch, highlight: true },
  ];

  return (
    <div className="section-stack stack-md">
      <div className="kpi-grid" aria-label="Ringkasan metrik restorasi">
        <div className="kpi-card kpi-card-primary">
          <span className="kpi-label">PSNR Notch Filter</span>
          <span className="kpi-value">{formatPsnr(notch.psnrDb)}</span>
          <span className={`kpi-delta ${psnrVsBase.className}`}>
            {psnrVsBase.text} dibanding tanpa perbaikan
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">SSIM Struktural</span>
          <span className="kpi-value">{formatSsim(notch.ssim)}</span>
          <span className={`kpi-delta ${ssimVsBase.className}`}>
            {ssimVsBase.text} dibanding tanpa perbaikan
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Keunggulan atas Gaussian Blur</span>
          <span className="kpi-value">{psnrVsBlur.text}</span>
          <span className="kpi-delta">
            Blur hanya mencapai {formatPsnr(blur.psnrDb)}
          </span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Metode</th>
              <th scope="col">PSNR (dB)</th>
              <th scope="col">Selisih PSNR</th>
              <th scope="col">SSIM</th>
              <th scope="col">Selisih SSIM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const dPsnr = row.isBaseline
                ? { text: 'Acuan', className: '' }
                : formatDelta(row.data.psnrDb, base.psnrDb, ' dB', 2);
              const dSsim = row.isBaseline
                ? { text: 'Acuan', className: '' }
                : formatDelta(row.data.ssim, base.ssim, '', 4);

              return (
                <tr key={row.label} className={row.highlight ? 'row-highlight' : undefined}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td className="num">{formatPsnr(row.data.psnrDb)}</td>
                  <td className={`num ${dPsnr.className}`}>{dPsnr.text}</td>
                  <td className="num">{formatSsim(row.data.ssim)}</td>
                  <td className={`num ${dSsim.className}`}>{dSsim.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
