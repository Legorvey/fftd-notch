import {
  applyNotchToSpectrum,
  calculateMetrics,
  fftSpectrum,
  gaussianBlur,
} from './notch';
import type {
  Point2D,
  SigmaSweepPoint,
  SinusoidComponent,
  SyntheticExperimentResult,
} from './types';

export const DEFAULT_SIGMA_SWEEP = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 4.0] as const;

export function addPeriodicNoise(
  clean: Float64Array,
  width: number,
  height: number,
  components: readonly SinusoidComponent[],
): { noisy: Float64Array; noise: Float64Array } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || clean.length !== width * height) {
    throw new Error('Citra harus grayscale 2D.');
  }
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const noise = new Float64Array(width * height);

  for (const item of components) {
    if (
      !Number.isFinite(item.u) ||
      !Number.isFinite(item.v) ||
      !Number.isFinite(item.amplitude) ||
      !Number.isFinite(item.phase)
    ) {
      throw new Error('Parameter sinusoid harus berupa bilangan valid.');
    }
    const u = Math.trunc(item.u);
    const v = Math.trunc(item.v);
    if (Math.abs(u) > halfW || Math.abs(v) > halfH) {
      throw new Error('Frekuensi sinusoid tidak boleh melewati batas Nyquist.');
    }
    const amp = item.amplitude;
    const phase = item.phase;
    const twoPiUOverW = (2.0 * Math.PI * u) / width;
    const twoPiVOverH = (2.0 * Math.PI * v) / height;

    for (let y = 0; y < height; y++) {
      const row = y * width;
      const vy = twoPiVOverH * y + phase;
      for (let x = 0; x < width; x++) {
        noise[row + x] = noise[row + x]! + amp * Math.sin(twoPiUOverW * x + vy);
      }
    }
  }

  const noisy = new Float64Array(width * height);
  for (let i = 0; i < noisy.length; i++) {
    noisy[i] = clean[i]! + noise[i]!;
  }
  return { noisy, noise };
}

export function knownNotchCenters(
  width: number,
  height: number,
  components: readonly SinusoidComponent[],
): Point2D[] {
  const cy = Math.floor(height / 2);
  const cx = Math.floor(width / 2);
  return components.map((item) => {
    const u = Math.trunc(item.u);
    const v = Math.trunc(item.v);
    return {
      y: (((cy + v) % height) + height) % height,
      x: (((cx + u) % width) + width) % width,
    };
  });
}

export function sigmaSensitivity(
  clean: Float64Array,
  noisy: Float64Array,
  width: number,
  height: number,
  centers: readonly Point2D[],
  sigmaValues: readonly number[],
): SigmaSweepPoint[] {
  const { fShiftRe, fShiftIm } = fftSpectrum(noisy, width, height);
  return sigmaValues.map((sigma) => {
    const { restored } = applyNotchToSpectrum(
      fShiftRe,
      fShiftIm,
      width,
      height,
      centers,
      sigma,
      false,
    );
    const metrics = calculateMetrics(clean, restored, width, height);
    return { sigma, ...metrics };
  });
}

export function runSyntheticExperiment(
  clean: Float64Array,
  width: number,
  height: number,
  components: readonly SinusoidComponent[],
  notchSigma = 1.0,
  blurSigma = 1.2,
  sigmaValues: readonly number[] = DEFAULT_SIGMA_SWEEP,
): SyntheticExperimentResult {
  const { noisy, noise } = addPeriodicNoise(clean, width, height, components);
  const centers = knownNotchCenters(width, height, components);
  const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(noisy, width, height);
  const { restored, mask, filteredSpectrum } = applyNotchToSpectrum(
    fShiftRe,
    fShiftIm,
    width,
    height,
    centers,
    notchSigma,
    true,
  );
  const blurred = gaussianBlur(noisy, width, height, blurSigma);

  const metrics = {
    noCorrection: calculateMetrics(clean, noisy, width, height),
    gaussianBlur: calculateMetrics(clean, blurred, width, height),
    notchFilter: calculateMetrics(clean, restored, width, height),
  };

  const sweep: SigmaSweepPoint[] = sigmaValues.map((sigma) => {
    const { restored: sweepRestored } = applyNotchToSpectrum(
      fShiftRe,
      fShiftIm,
      width,
      height,
      centers,
      sigma,
      false,
    );
    const m = calculateMetrics(clean, sweepRestored, width, height);
    return { sigma, ...m };
  });

  return {
    width,
    height,
    clean: new Float64Array(clean),
    noisy,
    noise,
    blurred,
    restored,
    spectrum,
    filteredSpectrum,
    mask,
    centers,
    metrics,
    sweep,
  };
}
