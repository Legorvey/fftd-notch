import { fft2d, fftShift2D, ifftShift2D } from './fft';
import type { GrayscaleImage, PeakCandidate, Point2D, QualityMetrics } from './types';

function reflectIndex(idx: number, size: number): number {
  if (size <= 1) return 0;
  let i = idx;
  while (i < 0 || i >= size) {
    if (i < 0) i = -i - 1;
    if (i >= size) i = 2 * size - 1 - i;
  }
  return i;
}

export function normalizeGrayscaleFromRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): GrayscaleImage {
  const total = width * height;
  if (width < 1 || height < 1 || rgba.length < total * 4) {
    throw new Error('Data citra RGBA tidak valid.');
  }
  const data = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const r = rgba[offset]!;
    const g = rgba[offset + 1]!;
    const b = rgba[offset + 2]!;
    // Preserve exact byte luminance for grayscale PNGs without 0.9999 weight drift.
    if (r === g && g === b) {
      data[i] = r / 255.0;
    } else {
      data[i] = (0.2989 * r + 0.5870 * g + 0.1140 * b) / 255.0;
    }
  }
  return { width, height, data };
}

export function fftSpectrum(
  data: Float64Array,
  width: number,
  height: number,
): { fShiftRe: Float64Array; fShiftIm: Float64Array; spectrum: Float64Array } {
  const re = new Float64Array(data);
  const im = new Float64Array(width * height);
  fft2d(re, im, width, height, false);
  const fShiftRe = fftShift2D(re, width, height);
  const fShiftIm = fftShift2D(im, width, height);
  const spectrum = new Float64Array(width * height);

  for (let i = 0; i < spectrum.length; i++) {
    spectrum[i] = Math.log1p(Math.hypot(fShiftRe[i]!, fShiftIm[i]!));
  }
  return { fShiftRe, fShiftIm, spectrum };
}

export function periodicDistance(a: number, b: number, size: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, size - delta);
}

export function symmetricCenter(
  width: number,
  height: number,
  center: Point2D,
): Point2D {
  const dcY = Math.floor(height / 2);
  const dcX = Math.floor(width / 2);
  const symY = (((2 * dcY - Math.trunc(center.y)) % height) + height) % height;
  const symX = (((2 * dcX - Math.trunc(center.x)) % width) + width) % width;
  return { y: symY, x: symX };
}

export function buildNotchMask(
  width: number,
  height: number,
  centers: readonly Point2D[],
  sigma = 1.0,
): Float64Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Ukuran citra tidak valid.');
  }
  if (!(sigma > 0) || !Number.isFinite(sigma)) {
    throw new Error('Sigma harus lebih besar dari 0.');
  }

  const mask = new Float64Array(width * height);
  mask.fill(1.0);
  const uniqueCenters = new Set<string>();
  const twoSigmaSq = 2.0 * sigma * sigma;
  const expY = new Float64Array(height);
  const expX = new Float64Array(width);

  for (const center of centers) {
    if (!Number.isFinite(center.y) || !Number.isFinite(center.x)) {
      throw new Error('Koordinat notch harus berupa bilangan valid.');
    }
    const cy = Math.trunc(center.y);
    const cx = Math.trunc(center.x);
    if (cy < 0 || cy >= height || cx < 0 || cx >= width) {
      throw new Error(`Koordinat notch (${cy}, ${cx}) berada di luar spektrum.`);
    }
    const pair = symmetricCenter(width, height, { y: cy, x: cx });
    const points: [Point2D, Point2D] = [{ y: cy, x: cx }, pair];

    for (const pt of points) {
      const key = `${pt.y},${pt.x}`;
      if (uniqueCenters.has(key)) continue;
      uniqueCenters.add(key);

      // Exploit Gaussian separability: exp(-(dy^2 + dx^2) / 2s^2) = exp(-dy^2/2s^2) * exp(-dx^2/2s^2).
      for (let y = 0; y < height; y++) {
        const d = periodicDistance(y, pt.y, height);
        expY[y] = Math.exp(-(d * d) / twoSigmaSq);
      }
      for (let x = 0; x < width; x++) {
        const d = periodicDistance(x, pt.x, width);
        expX[x] = Math.exp(-(d * d) / twoSigmaSq);
      }

      for (let y = 0; y < height; y++) {
        const ey = expY[y]!;
        if (ey === 0) continue;
        const rowOffset = y * width;
        for (let x = 0; x < width; x++) {
          const prod = ey * expX[x]!;
          if (prod > 0) {
            mask[rowOffset + x] = mask[rowOffset + x]! * (1.0 - prod);
          }
        }
      }
    }
  }

  for (let i = 0; i < mask.length; i++) {
    const v = mask[i]!;
    mask[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return mask;
}

export function applyNotchToSpectrum(
  fShiftRe: Float64Array,
  fShiftIm: Float64Array,
  width: number,
  height: number,
  centers: readonly Point2D[],
  sigma = 1.0,
  includeFilteredSpectrum = true,
): { restored: Float64Array; mask: Float64Array; filteredSpectrum: Float64Array } {
  const mask = buildNotchMask(width, height, centers, sigma);
  const total = width * height;
  const filtRe = new Float64Array(total);
  const filtIm = new Float64Array(total);
  const filteredSpectrum = includeFilteredSpectrum ? new Float64Array(total) : new Float64Array(0);

  if (includeFilteredSpectrum) {
    for (let i = 0; i < total; i++) {
      const m = mask[i]!;
      const r = fShiftRe[i]! * m;
      const im = fShiftIm[i]! * m;
      filtRe[i] = r;
      filtIm[i] = im;
      filteredSpectrum[i] = Math.log1p(Math.hypot(r, im));
    }
  } else {
    for (let i = 0; i < total; i++) {
      const m = mask[i]!;
      filtRe[i] = fShiftRe[i]! * m;
      filtIm[i] = fShiftIm[i]! * m;
    }
  }

  const unshiftedRe = ifftShift2D(filtRe, width, height);
  const unshiftedIm = ifftShift2D(filtIm, width, height);
  fft2d(unshiftedRe, unshiftedIm, width, height, true);

  return {
    restored: unshiftedRe,
    mask,
    filteredSpectrum,
  };
}

export function restoreWithNotch(
  data: Float64Array,
  width: number,
  height: number,
  centers: readonly Point2D[],
  sigma = 1.0,
): {
  restored: Float64Array;
  spectrum: Float64Array;
  filteredSpectrum: Float64Array;
  mask: Float64Array;
} {
  const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(data, width, height);
  const { restored, mask, filteredSpectrum } = applyNotchToSpectrum(
    fShiftRe,
    fShiftIm,
    width,
    height,
    centers,
    sigma,
    true,
  );
  return { restored, spectrum, filteredSpectrum, mask };
}

export function gaussianBlur(
  data: Float64Array,
  width: number,
  height: number,
  sigma = 1.0,
): Float64Array {
  if (sigma < 0 || !Number.isFinite(sigma)) {
    throw new Error('Sigma Gaussian tidak boleh negatif.');
  }
  if (sigma === 0) {
    return new Float64Array(data);
  }

  const radius = Math.trunc(4.0 * sigma + 0.5);
  if (radius <= 0) {
    return new Float64Array(data);
  }

  const kernelSize = 2 * radius + 1;
  const kernel = new Float64Array(kernelSize);
  const twoSigmaSq = 2.0 * sigma * sigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const val = Math.exp(-(i * i) / twoSigmaSq);
    kernel[i + radius] = val;
    sum += val;
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] = kernel[i]! / sum;
  }

  const temp = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = reflectIndex(x + k, width);
        acc += data[row + sx]! * kernel[k + radius]!;
      }
      temp[row + x] = acc;
    }
  }

  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = reflectIndex(y + k, height);
        acc += temp[sy * width + x]! * kernel[k + radius]!;
      }
      out[row + x] = acc;
    }
  }

  return out;
}

function percentileLinearTyped(values: Float64Array, count: number, p: number): number {
  if (count === 0) return 0;
  const sorted = values.subarray(0, count).slice();
  sorted.sort();
  if (count === 1) return sorted[0]!;
  const pos = (p / 100) * (count - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

function maxFilterWrap2D(
  src: Float64Array,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const horiz = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let maxVal = -Infinity;
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = ((x + dx) % width + width) % width;
        const v = src[row + sx]!;
        if (v > maxVal) maxVal = v;
      }
      horiz[row + x] = maxVal;
    }
  }

  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let maxVal = -Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = ((y + dy) % height + height) % height;
        const v = horiz[sy * width + x]!;
        if (v > maxVal) maxVal = v;
      }
      out[row + x] = maxVal;
    }
  }
  return out;
}

export interface PeakDetectionOptions {
  maxPeaks?: number;
  minDistance?: number;
  excludeRadius?: number;
  percentile?: number;
}

export function detectPeakCandidates(
  spectrum: Float64Array,
  width: number,
  height: number,
  options: PeakDetectionOptions = {},
): PeakCandidate[] {
  const maxPeaks = options.maxPeaks ?? 12;
  const minDistance = options.minDistance ?? 6;
  const excludeRadius = options.excludeRadius ?? 10;
  const percentile = options.percentile ?? 99.5;

  if (height < 3 || width < 3) return [];

  const cy0 = Math.floor(height / 2);
  const cx0 = Math.floor(width / 2);
  const excludeR2 = excludeRadius * excludeRadius;
  const validValues = new Float64Array(width * height);
  let validCount = 0;

  for (let y = 0; y < height; y++) {
    const dy2 = (y - cy0) * (y - cy0);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx0;
      if (dy2 + dx * dx >= excludeR2) {
        validValues[validCount++] = spectrum[row + x]!;
      }
    }
  }

  if (validCount === 0) return [];

  const threshold = percentileLinearTyped(validValues, validCount, percentile);
  const localMax = maxFilterWrap2D(spectrum, width, height, 3);
  const coords: PeakCandidate[] = [];

  for (let y = 0; y < height; y++) {
    const dy2 = (y - cy0) * (y - cy0);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const dx = x - cx0;
      if (dy2 + dx * dx < excludeR2) continue;
      const v = spectrum[row + x]!;
      if (v >= threshold && v === localMax[row + x]!) {
        coords.push({ y, x, value: v });
      }
    }
  }

  coords.sort((a, b) => b.value - a.value || a.y - b.y || a.x - b.x);

  const selected: PeakCandidate[] = [];
  const minD2 = minDistance * minDistance;

  for (const pt of coords) {
    const pair = symmetricCenter(width, height, pt);
    let tooClose = false;
    for (const s of selected) {
      const d1 = periodicDistance(pt.y, s.y, height);
      const d2 = periodicDistance(pt.x, s.x, width);
      const pyDist = periodicDistance(pair.y, s.y, height);
      const pxDist = periodicDistance(pair.x, s.x, width);
      if (d1 * d1 + d2 * d2 < minD2 || pyDist * pyDist + pxDist * pxDist < minD2) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      selected.push(pt);
      if (selected.length >= maxPeaks) break;
    }
  }

  return selected;
}

function uniformFilterReflect2D(
  src: Float64Array,
  width: number,
  height: number,
  winSize: number,
): Float64Array {
  const half = Math.floor(winSize / 2);
  const invWin = 1.0 / winSize;
  const horiz = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) {
        acc += src[row + reflectIndex(x + k, width)]!;
      }
      horiz[row + x] = acc * invWin;
    }
  }

  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) {
        acc += horiz[reflectIndex(y + k, height) * width + x]!;
      }
      out[row + x] = acc * invWin;
    }
  }
  return out;
}

export function calculateMetrics(
  reference: Float64Array,
  estimate: Float64Array,
  width: number,
  height: number,
): QualityMetrics {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Ukuran citra tidak valid.');
  }
  const total = width * height;
  if (reference.length !== total || estimate.length !== total) {
    throw new Error('Ukuran gambar referensi dan hasil harus sama.');
  }

  const ref = new Float64Array(total);
  const est = new Float64Array(total);
  let mseAcc = 0;

  for (let i = 0; i < total; i++) {
    const rRaw = reference[i]!;
    const eRaw = estimate[i]!;
    const r = rRaw < 0 ? 0 : rRaw > 1 ? 1 : rRaw;
    const e = eRaw < 0 ? 0 : eRaw > 1 ? 1 : eRaw;
    ref[i] = r;
    est[i] = e;
    const diff = r - e;
    mseAcc += diff * diff;
  }

  const mse = mseAcc / total;
  const psnrDb = mse === 0 ? Infinity : 10 * Math.log10(1.0 / mse);

  const minSide = Math.min(width, height);
  const winSize = Math.min(7, minSide % 2 === 1 ? minSide : minSide - 1);
  if (winSize < 3) {
    return { psnrDb, ssim: Number.NaN };
  }

  const refSq = new Float64Array(total);
  const estSq = new Float64Array(total);
  const refEst = new Float64Array(total);
  for (let i = 0; i < total; i++) {
    const r = ref[i]!;
    const e = est[i]!;
    refSq[i] = r * r;
    estSq[i] = e * e;
    refEst[i] = r * e;
  }

  const ux = uniformFilterReflect2D(ref, width, height, winSize);
  const uy = uniformFilterReflect2D(est, width, height, winSize);
  const uxx = uniformFilterReflect2D(refSq, width, height, winSize);
  const uyy = uniformFilterReflect2D(estSq, width, height, winSize);
  const uxy = uniformFilterReflect2D(refEst, width, height, winSize);

  const np = winSize * winSize;
  const covNorm = np / (np - 1);
  const c1 = 0.01 * 0.01;
  const c2 = 0.03 * 0.03;

  const pad = Math.floor((winSize - 1) / 2);
  let ssimSum = 0;
  let count = 0;

  for (let y = pad; y < height - pad; y++) {
    const row = y * width;
    for (let x = pad; x < width - pad; x++) {
      const i = row + x;
      const mx = ux[i]!;
      const my = uy[i]!;
      const vx = covNorm * (uxx[i]! - mx * mx);
      const vy = covNorm * (uyy[i]! - my * my);
      const vxy = covNorm * (uxy[i]! - mx * my);

      const num = (2 * mx * my + c1) * (2 * vxy + c2);
      const den = (mx * mx + my * my + c1) * (vx + vy + c2);
      ssimSum += num / den;
      count++;
    }
  }

  return { psnrDb, ssim: count > 0 ? ssimSum / count : Number.NaN };
}
