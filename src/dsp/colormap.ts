// Perceptually uniform inferno colormap LUT (11 anchor stops interpolated to 256 RGB entries)
// and PNG/CSV export helpers.

const INFERNO_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 4],
  [22, 11, 57],
  [66, 10, 104],
  [106, 23, 110],
  [147, 38, 103],
  [188, 55, 84],
  [221, 81, 58],
  [243, 118, 27],
  [252, 165, 10],
  [246, 215, 70],
  [252, 255, 164],
];

const INFERNO_LUT = new Uint8ClampedArray(256 * 3);
for (let i = 0; i < 256; i++) {
  const t = (i / 255) * (INFERNO_STOPS.length - 1);
  const idx = Math.min(INFERNO_STOPS.length - 2, Math.floor(t));
  const frac = t - idx;
  const a = INFERNO_STOPS[idx]!;
  const b = INFERNO_STOPS[idx + 1]!;
  INFERNO_LUT[i * 3] = Math.round(a[0] + (b[0] - a[0]) * frac);
  INFERNO_LUT[i * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * frac);
  INFERNO_LUT[i * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * frac);
}

const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]|^[\t\r]/;
const BLOB_REVOKE_MS = 60_000;

export type ColorMapMode = 'gray' | 'inferno';

export function renderArrayToRGBA(
  data: Float64Array,
  mode: ColorMapMode,
  autoScale = false,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(data.length * 4));
  let lo = 0;
  let hi = 1;

  if (autoScale && data.length > 0) {
    lo = Infinity;
    hi = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi <= lo || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
  }

  const invSpan = 1 / (hi - lo);

  if (mode === 'gray') {
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i]! - lo) * invSpan;
      const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm;
      const byte = Math.round(clamped * 255);
      const o = i * 4;
      out[o] = byte;
      out[o + 1] = byte;
      out[o + 2] = byte;
      out[o + 3] = 255;
    }
  } else {
    for (let i = 0; i < data.length; i++) {
      const norm = (data[i]! - lo) * invSpan;
      const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm;
      const lutIdx = Math.round(clamped * 255) * 3;
      const o = i * 4;
      out[o] = INFERNO_LUT[lutIdx]!;
      out[o + 1] = INFERNO_LUT[lutIdx + 1]!;
      out[o + 2] = INFERNO_LUT[lutIdx + 2]!;
      out[o + 3] = 255;
    }
  }

  return out;
}

export function drawArrayToCanvas(
  canvas: HTMLCanvasElement,
  data: Float64Array,
  width: number,
  height: number,
  mode: ColorMapMode,
  autoScale = false,
): void {
  if (width < 1 || height < 1 || data.length !== width * height) return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rgba = renderArrayToRGBA(data, mode, autoScale);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
}

function sanitizeFilename(name: string, fallback: string): string {
  const cleaned = name.replace(/[/\\?%*:|"<>\u0000-\u001f\u007f]/g, '_').trim();
  return cleaned.slice(0, 120) || fallback;
}

export function downloadArrayAsPng(
  data: Float64Array,
  width: number,
  height: number,
  filename: string,
  mode: ColorMapMode = 'gray',
  autoScale = false,
): void {
  if (width < 1 || height < 1 || data.length !== width * height) return;
  const canvas = document.createElement('canvas');
  drawArrayToCanvas(canvas, data, width, height, mode, autoScale);
  const safeName = sanitizeFilename(filename, 'export.png');
  canvas.toBlob((blob) => {
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
  }, 'image/png');
}

export function downloadCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number>>,
  filename: string,
): void {
  const escape = (cell: string | number): string => {
    if (typeof cell === 'number') {
      return Number.isFinite(cell) ? String(cell) : '';
    }
    const safe = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeFilename(filename, 'export.csv');
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), BLOB_REVOKE_MS);
}
