import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/dsp/notch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/dsp/notch')>();
  return {
    ...actual,
    fftSpectrum: vi.fn(actual.fftSpectrum),
  };
});

import { addPeriodicNoise, DEFAULT_SIGMA_SWEEP } from '../src/dsp/experiments';
import { fftSpectrum, symmetricCenter } from '../src/dsp/notch';
import type { Point2D, SinusoidComponent } from '../src/dsp/types';
import { processWorkerRequest, type WorkerRequest } from '../src/workers/dsp.worker';
import { dspClient } from '../src/workers/dspClient';

const fftSpectrumMock = vi.mocked(fftSpectrum);

function createSmoothImage(width: number, height: number, offset = 0): Float64Array {
  const img = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lowFreq =
        0.5 +
        0.15 *
          Math.sin((2 * Math.PI * x) / width + offset) *
          Math.cos((2 * Math.PI * y) / height);
      img[y * width + x] = lowFreq;
    }
  }
  return img;
}

function sameOrSymmetric(width: number, height: number, a: Point2D, b: Point2D): boolean {
  const sym = symmetricCenter(width, height, b);
  return (a.y === b.y && a.x === b.x) || (a.y === sym.y && a.x === sym.x);
}

beforeEach(() => {
  fftSpectrumMock.mockClear();
});

describe('processWorkerRequest', () => {
  it('analyzes a lab image, returns log-magnitude spectrum and detects periodic peaks', () => {
    const width = 32;
    const height = 32;
    const clean = createSmoothImage(width, height, 0.1);
    const components: SinusoidComponent[] = [{ u: 12, v: 0, amplitude: 0.2, phase: 0 }];
    const { noisy } = addPeriodicNoise(clean, width, height, components);

    const res = processWorkerRequest({
      id: 1,
      type: 'analyzeLabImage',
      width,
      height,
      data: noisy,
      maxPeaks: 6,
    });

    expect(res.type).toBe('analyzeLabImageResult');
    if (res.type !== 'analyzeLabImageResult') return;

    expect(res.id).toBe(1);
    expect(res.spectrum).toHaveLength(width * height);
    expect(res.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.candidates.length).toBeLessThanOrEqual(6);
    expect(sameOrSymmetric(width, height, res.candidates[0]!, { y: 16, x: 28 })).toBe(true);
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);
  });

  it('reuses cached FFT on restoreLab hit and recomputes on cache miss when image changes', () => {
    const width = 32;
    const height = 32;
    const clean = createSmoothImage(width, height, 0.25);
    const components: SinusoidComponent[] = [{ u: 12, v: 0, amplitude: 0.2, phase: 0 }];
    const { noisy } = addPeriodicNoise(clean, width, height, components);
    const centers: Point2D[] = [{ y: 16, x: 28 }];

    const analyzeRes = processWorkerRequest({
      id: 10,
      type: 'analyzeLabImage',
      width,
      height,
      data: noisy,
      maxPeaks: 8,
    });
    expect(analyzeRes.type).toBe('analyzeLabImageResult');
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);

    // Cache hit with a fresh Float64Array clone and no reference.
    const restoreNoRef = processWorkerRequest({
      id: 11,
      type: 'restoreLab',
      width,
      height,
      corrupted: new Float64Array(noisy),
      reference: null,
      centers,
      notchSigma: 1.0,
      blurSigma: 1.2,
    });
    expect(restoreNoRef.type).toBe('restoreLabResult');
    if (restoreNoRef.type !== 'restoreLabResult') return;
    expect(restoreNoRef.id).toBe(11);
    expect(restoreNoRef.metrics).toBeNull();
    expect(restoreNoRef.restored).toHaveLength(width * height);
    expect(restoreNoRef.filteredSpectrum).toHaveLength(width * height);
    expect(restoreNoRef.mask).toHaveLength(width * height);
    expect(restoreNoRef.blurred).toHaveLength(width * height);
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);

    // Cache hit again with matching reference computes metrics without recomputing FFT.
    const restoreWithRef = processWorkerRequest({
      id: 12,
      type: 'restoreLab',
      width,
      height,
      corrupted: new Float64Array(noisy),
      reference: clean,
      centers,
      notchSigma: 1.0,
      blurSigma: 1.2,
    });
    expect(restoreWithRef.type).toBe('restoreLabResult');
    if (restoreWithRef.type !== 'restoreLabResult') return;
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);
    expect(restoreWithRef.metrics).not.toBeNull();
    expect(restoreWithRef.metrics!.notchFilter.psnrDb).toBeGreaterThan(
      restoreWithRef.metrics!.noCorrection.psnrDb,
    );
    expect(restoreWithRef.metrics!.notchFilter.ssim).toBeGreaterThan(
      restoreWithRef.metrics!.noCorrection.ssim,
    );

    // Mutate an interior pixel (not first/middle/last) to prove full cache verification misses.
    const changed = new Float64Array(noisy);
    changed[7] = changed[7]! + 0.15;

    const restoreAfterChange = processWorkerRequest({
      id: 13,
      type: 'restoreLab',
      width,
      height,
      corrupted: changed,
      reference: clean,
      centers,
      notchSigma: 1.0,
      blurSigma: 1.2,
    });
    expect(restoreAfterChange.type).toBe('restoreLabResult');
    if (restoreAfterChange.type !== 'restoreLabResult') return;
    expect(fftSpectrumMock).toHaveBeenCalledTimes(2);
    expect(restoreAfterChange.restored[7]).not.toBeCloseTo(restoreWithRef.restored[7]!, 4);

    // Follow-up restore on the mutated image hits the updated cache.
    const restoreAfterChangeHit = processWorkerRequest({
      id: 14,
      type: 'restoreLab',
      width,
      height,
      corrupted: new Float64Array(changed),
      reference: null,
      centers,
      notchSigma: 1.5,
      blurSigma: 1.0,
    });
    expect(restoreAfterChangeHit.type).toBe('restoreLabResult');
    expect(fftSpectrumMock).toHaveBeenCalledTimes(2);
  });

  it('omits metrics when restoreLab receives a reference with mismatched length', () => {
    const width = 16;
    const height = 16;
    const img = createSmoothImage(width, height, 0.4);

    const res = processWorkerRequest({
      id: 20,
      type: 'restoreLab',
      width,
      height,
      corrupted: img,
      reference: new Float64Array(width * height - 4),
      centers: [{ y: 4, x: 4 }],
      notchSigma: 1.0,
      blurSigma: 1.0,
    });

    expect(res.type).toBe('restoreLabResult');
    if (res.type !== 'restoreLabResult') return;
    expect(res.metrics).toBeNull();
  });

  it('runs a synthetic experiment and returns buffers, centers, metrics, and default sigma sweep', () => {
    const width = 32;
    const height = 32;
    const clean = createSmoothImage(width, height, 0.6);
    const components: SinusoidComponent[] = [
      { u: 10, v: 0, amplitude: 0.1, phase: 0 },
      { u: 0, v: 12, amplitude: 0.1, phase: 0 },
    ];

    const res = processWorkerRequest({
      id: 30,
      type: 'runExperiment',
      width,
      height,
      clean,
      components,
      notchSigma: 1.0,
      blurSigma: 1.2,
    });

    expect(res.type).toBe('runExperimentResult');
    if (res.type !== 'runExperimentResult') return;

    expect(res.id).toBe(30);
    expect(res.noisy).toHaveLength(width * height);
    expect(res.blurred).toHaveLength(width * height);
    expect(res.restored).toHaveLength(width * height);
    expect(res.spectrum).toHaveLength(width * height);
    expect(res.filteredSpectrum).toHaveLength(width * height);
    expect(res.mask).toHaveLength(width * height);
    expect(res.centers).toEqual([
      { y: 16, x: 26 },
      { y: 28, x: 16 },
    ]);
    expect(res.sweep.map((pt) => pt.sigma)).toEqual([...DEFAULT_SIGMA_SWEEP]);
    expect(res.metrics.notchFilter.psnrDb).toBeGreaterThan(res.metrics.noCorrection.psnrDb);
    expect(res.metrics.notchFilter.ssim).toBeGreaterThan(res.metrics.noCorrection.ssim);
  });

  it('returns structured error responses for invalid sigmas, out-of-bounds centers, mismatched dimensions, and unknown requests', () => {
    const width = 16;
    const height = 16;
    const img = createSmoothImage(width, height, 0.9);

    const invalidNotchSigma = processWorkerRequest({
      id: 40,
      type: 'restoreLab',
      width,
      height,
      corrupted: img,
      reference: null,
      centers: [{ y: 4, x: 4 }],
      notchSigma: 0,
      blurSigma: 1.0,
    });
    expect(invalidNotchSigma).toEqual({
      id: 40,
      type: 'error',
      message: expect.stringMatching(/sigma/i),
    });

    const invalidBlurSigma = processWorkerRequest({
      id: 41,
      type: 'restoreLab',
      width,
      height,
      corrupted: img,
      reference: null,
      centers: [{ y: 4, x: 4 }],
      notchSigma: 1.0,
      blurSigma: -0.5,
    });
    expect(invalidBlurSigma).toEqual({
      id: 41,
      type: 'error',
      message: expect.stringMatching(/negatif/i),
    });

    const outOfBoundsCenter = processWorkerRequest({
      id: 42,
      type: 'restoreLab',
      width,
      height,
      corrupted: img,
      reference: null,
      centers: [{ y: height, x: 4 }],
      notchSigma: 1.0,
      blurSigma: 1.0,
    });
    expect(outOfBoundsCenter).toEqual({
      id: 42,
      type: 'error',
      message: expect.stringMatching(/di luar spektrum/i),
    });

    const mismatchedAnalyze = processWorkerRequest({
      id: 43,
      type: 'analyzeLabImage',
      width,
      height,
      data: new Float64Array(width * height - 1),
      maxPeaks: 8,
    });
    expect(mismatchedAnalyze).toEqual({
      id: 43,
      type: 'error',
      message: expect.stringMatching(/dimensi/i),
    });

    const mismatchedRestore = processWorkerRequest({
      id: 44,
      type: 'restoreLab',
      width,
      height,
      corrupted: new Float64Array(width * height + 2),
      reference: null,
      centers: [{ y: 4, x: 4 }],
      notchSigma: 1.0,
      blurSigma: 1.0,
    });
    expect(mismatchedRestore).toEqual({
      id: 44,
      type: 'error',
      message: expect.stringMatching(/dimensi/i),
    });

    const mismatchedExperiment = processWorkerRequest({
      id: 45,
      type: 'runExperiment',
      width,
      height,
      clean: new Float64Array(10),
      components: [{ u: 2, v: 0, amplitude: 0.1, phase: 0 }],
      notchSigma: 1.0,
      blurSigma: 1.0,
    });
    expect(mismatchedExperiment).toEqual({
      id: 45,
      type: 'error',
      message: expect.stringMatching(/grayscale 2D/i),
    });

    const unknownRequest = processWorkerRequest({
      id: 46,
      type: 'unsupportedOp',
    } as unknown as WorkerRequest);
    expect(unknownRequest).toEqual({
      id: 46,
      type: 'error',
      message: 'Permintaan worker tidak dikenal.',
    });
  });

  it('reuses cached experiment FFT and sweep when only notchSigma or blurSigma changes', () => {
    const width = 32;
    const height = 32;
    const clean = createSmoothImage(width, height, 0.77);
    const components: SinusoidComponent[] = [{ u: 10, v: 0, amplitude: 0.1, phase: 0 }];

    const first = processWorkerRequest({
      id: 60,
      type: 'runExperiment',
      width,
      height,
      clean,
      components,
      notchSigma: 1.0,
      blurSigma: 1.2,
    });
    expect(first.type).toBe('runExperimentResult');
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);

    const second = processWorkerRequest({
      id: 61,
      type: 'runExperiment',
      width,
      height,
      clean: new Float64Array(clean),
      components,
      notchSigma: 2.0,
      blurSigma: 1.2,
    });
    expect(second.type).toBe('runExperimentResult');
    // Forward FFT is reused across sigma changes.
    expect(fftSpectrumMock).toHaveBeenCalledTimes(1);
  });

  it('propagates worker errors as rejected promises via dspClient fallback when Worker is unavailable', async () => {
    vi.stubGlobal('Worker', undefined);
    try {
      const img = createSmoothImage(16, 16, 1.2);
      await expect(
        dspClient.restoreLab({
          width: 16,
          height: 16,
          corrupted: img,
          reference: null,
          centers: [{ y: -1, x: 4 }],
          notchSigma: 1.0,
          blurSigma: 1.0,
        }),
      ).rejects.toThrow(/di luar spektrum/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
