export function formatPsnr(value: number): string {
  if (Number.isNaN(value)) return 'Tidak tersedia';
  if (!Number.isFinite(value)) return value > 0 ? 'Tak hingga' : '-Tak hingga';
  return `${value.toFixed(2)} dB`;
}

export function formatSsim(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return 'Tidak tersedia';
  return value.toFixed(digits);
}

export function formatDelta(
  value: number,
  baseline: number,
  suffix: string,
  digits: number,
): { text: string; className: string } {
  if (Number.isNaN(value) || Number.isNaN(baseline)) {
    return { text: 'Tidak tersedia', className: '' };
  }
  if (!Number.isFinite(value) && !Number.isFinite(baseline)) {
    return { text: '0', className: '' };
  }
  if (!Number.isFinite(value)) {
    return value > 0
      ? { text: `+Tak hingga`, className: 'metric-delta-pos' }
      : { text: `-Tak hingga`, className: 'metric-delta-neg' };
  }
  if (!Number.isFinite(baseline)) {
    return baseline > 0
      ? { text: `-Tak hingga`, className: 'metric-delta-neg' }
      : { text: `+Tak hingga`, className: 'metric-delta-pos' };
  }

  const rawDelta = value - baseline;
  const threshold = Math.pow(10, -digits) * 0.5;
  if (Math.abs(rawDelta) < threshold) {
    return { text: `0.${'0'.repeat(digits)}${suffix}`, className: '' };
  }
  const sign = rawDelta > 0 ? '+' : '';
  return {
    text: `${sign}${rawDelta.toFixed(digits)}${suffix}`,
    className: rawDelta > 0 ? 'metric-delta-pos' : 'metric-delta-neg',
  };
}
