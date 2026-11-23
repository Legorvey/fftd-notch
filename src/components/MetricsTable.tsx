import { formatDelta, formatPsnr, formatSsim } from '../dsp/format';
import type { QualityMetrics } from '../dsp/types';

interface MetricsTableProps {
  metrics: {
    noCorrection: QualityMetrics;
    gaussianBlur: QualityMetrics;
    notchFilter: QualityMetrics;
  };
}

export function MetricsTable({ metrics }: MetricsTableProps) {
  const base = metrics.noCorrection;
  const rows: ReadonlyArray<{
    label: string;
    data: QualityMetrics;
    highlight?: boolean;
    isBaseline?: boolean;
  }> = [
    { label: 'Tanpa perbaikan', data: metrics.noCorrection, isBaseline: true },
    { label: 'Gaussian blur', data: metrics.gaussianBlur },
    { label: 'Notch filter', data: metrics.notchFilter, highlight: true },
  ];

  return (
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
  );
}
