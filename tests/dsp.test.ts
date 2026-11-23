import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

import { fft1d, fft2d, fftShift2D, ifftShift2D } from '../src/dsp/fft';
import {
  autoDetectNotchCenters,
  buildNotchMask,
  calculateMetrics,
  detectPeakCandidates,
  fftSpectrum,
  gaussianBlur,
  normalizeGrayscaleFromRGBA,
  recommendPeakCandidates,
  restoreWithNotch,
  symmetricCenter,
} from '../src/dsp/notch';
import { buildZipArchive } from '../src/dsp/zip';
import {
  addPeriodicNoise,
  knownNotchCenters,
  runSyntheticExperiment,
} from '../src/dsp/experiments';
import { inspectImageHeader } from '../src/utils/imageLoader';
import type { SinusoidComponent } from '../src/dsp/types';

interface GoldenCase {
  shape: [number, number];
  components: SinusoidComponent[];
  notch_sigma: number;
  blur_sigma: number;
  clean: number[];
  centers: [number, number][];
  symmetric_pairs: [number, number][];
  spectrum_sample: number[];
  spectrum_stats: [number, number, number];
  mask_stats: [number, number, number];
  restored_stats: [number, number, number];
  blurred_stats: [number, number, number];
  metrics: Record<string, { PSNR_dB: number; SSIM: number }>;
  candidates: [number, number, number][];
  sweep: { sigma: number; PSNR_dB: number; SSIM: number }[];
}

interface GoldenFixture {
  even_64x64: GoldenCase;
  odd_45x53: GoldenCase;
  camera_512x512_summary: {
    shape: [number, number];
    components: SinusoidComponent[];
    centers: [number, number][];
    metrics: Record<string, { PSNR_dB: number; SSIM: number }>;
    sweep: { sigma: number; PSNR_dB: number; SSIM: number }[];
    top_candidates: [number, number, number][];
  };
  boy_noisy_512x512: {
    shape: [number, number];
    auto_centers: [number, number][];
    recommended: [number, number, number][];
    restored_mean: number;
    restored_std: number;
  };
}

const golden: GoldenFixture = JSON.parse(
  readFileSync(resolve(process.cwd(), 'tests/fixtures/python_golden.json'), 'utf-8'),
);

function canonicalPointKey(width: number, height: number, y: number, x: number): string {
  const sym = symmetricCenter(width, height, { y, x });
  if (y < sym.y || (y === sym.y && x <= sym.x)) {
    return `${y},${x}`;
  }
  return `${sym.y},${sym.x}`;
}

function stats(arr: Float64Array): [number, number, number] {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return [min, max, sum / arr.length];
}

describe('FFT 1D/2D & Shift exactness', () => {
  it('round-trips arbitrary even, odd, and prime 1D lengths', () => {
    for (const n of [1, 2, 7, 15, 16, 37, 45, 53, 64, 100]) {
      const origRe = new Float64Array(n);
      const origIm = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        origRe[i] = Math.sin(i * 0.7) + 0.3 * Math.cos(i * 1.9);
        origIm[i] = Math.cos(i * 0.4) * 0.5;
      }
      const re = new Float64Array(origRe);
      const im = new Float64Array(origIm);
      fft1d(re, im, false);
      fft1d(re, im, true);
      for (let i = 0; i < n; i++) {
        expect(re[i]).toBeCloseTo(origRe[i]!, 10);
        expect(im[i]).toBeCloseTo(origIm[i]!, 10);
      }
    }
  });

  it('round-trips 2D FFT and fftShift2D/ifftShift2D on odd non-square shapes', () => {
    const width = 19;
    const height = 13;
    const orig = new Float64Array(width * height);
    for (let i = 0; i < orig.length; i++) {
      orig[i] = ((i * 37) % 101) / 100;
    }
    const re = new Float64Array(orig);
    const im = new Float64Array(width * height);
    fft2d(re, im, width, height, false);
    const sRe = fftShift2D(re, width, height);
    const sIm = fftShift2D(im, width, height);
    const uRe = ifftShift2D(sRe, width, height);
    const uIm = ifftShift2D(sIm, width, height);
    fft2d(uRe, uIm, width, height, true);

    for (let i = 0; i < orig.length; i++) {
      expect(uRe[i]).toBeCloseTo(orig[i]!, 10);
      expect(uIm[i]).toBeCloseTo(0, 10);
    }
  });
});

describe('Numerical parity against Python fft2d_notch.py & experiments.py', () => {
  it.each([
    ['even_64x64', golden.even_64x64],
    ['odd_45x53', golden.odd_45x53],
  ] as const)('matches Python reference outputs for %s', (_label, fixture) => {
    const [height, width] = fixture.shape;
    const clean = Float64Array.from(fixture.clean);

    const res = runSyntheticExperiment(
      clean,
      width,
      height,
      fixture.components,
      fixture.notch_sigma,
      fixture.blur_sigma,
      fixture.sweep.map((s) => s.sigma),
    );

    expect(res.centers.map((c) => [c.y, c.x])).toEqual(fixture.centers);
    expect(
      res.centers.map((c) => {
        const sym = symmetricCenter(width, height, c);
        return [sym.y, sym.x];
      }),
    ).toEqual(fixture.symmetric_pairs);

    for (let i = 0; i < fixture.spectrum_sample.length; i++) {
      expect(res.spectrum[i]).toBeCloseTo(fixture.spectrum_sample[i]!, 8);
    }

    const specStats = stats(res.spectrum);
    const maskStats = stats(res.mask);
    const restStats = stats(res.restored);
    const blurStats = stats(res.blurred);

    for (let i = 0; i < 3; i++) {
      expect(specStats[i]).toBeCloseTo(fixture.spectrum_stats[i]!, 8);
      expect(maskStats[i]).toBeCloseTo(fixture.mask_stats[i]!, 10);
      expect(restStats[i]).toBeCloseTo(fixture.restored_stats[i]!, 8);
      expect(blurStats[i]).toBeCloseTo(fixture.blurred_stats[i]!, 6);
    }

    expect(res.metrics.noCorrection.psnrDb).toBeCloseTo(fixture.metrics['No correction']!.PSNR_dB, 5);
    expect(res.metrics.noCorrection.ssim).toBeCloseTo(fixture.metrics['No correction']!.SSIM, 5);
    expect(res.metrics.gaussianBlur.psnrDb).toBeCloseTo(fixture.metrics['Gaussian blur']!.PSNR_dB, 4);
    expect(res.metrics.gaussianBlur.ssim).toBeCloseTo(fixture.metrics['Gaussian blur']!.SSIM, 4);
    expect(res.metrics.notchFilter.psnrDb).toBeCloseTo(fixture.metrics['Notch filter']!.PSNR_dB, 5);
    expect(res.metrics.notchFilter.ssim).toBeCloseTo(fixture.metrics['Notch filter']!.SSIM, 5);

    const cands = detectPeakCandidates(res.spectrum, width, height, { maxPeaks: 8 });
    expect(cands.map((c) => canonicalPointKey(width, height, c.y, c.x))).toEqual(
      fixture.candidates.map(([y, x]) => canonicalPointKey(width, height, y, x)),
    );

    for (let i = 0; i < fixture.sweep.length; i++) {
      expect(res.sweep[i]!.psnrDb).toBeCloseTo(fixture.sweep[i]!.PSNR_dB, 5);
      expect(res.sweep[i]!.ssim).toBeCloseTo(fixture.sweep[i]!.SSIM, 5);
    }
  });

  it('matches Python 512x512 skimage.data.camera experiment metrics and top peaks', () => {
    const pngBuffer = readFileSync(resolve(process.cwd(), 'public/samples/camera.png'));
    const decoded = PNG.sync.read(pngBuffer);
    const gray = normalizeGrayscaleFromRGBA(
      new Uint8ClampedArray(decoded.data),
      decoded.width,
      decoded.height,
    );

    const summary = golden.camera_512x512_summary;
    const res = runSyntheticExperiment(
      gray.data,
      gray.width,
      gray.height,
      summary.components,
      1.0,
      1.2,
      summary.sweep.map((s) => s.sigma),
    );

    expect(res.metrics.noCorrection.psnrDb).toBeCloseTo(summary.metrics['No correction']!.PSNR_dB, 4);
    expect(res.metrics.noCorrection.ssim).toBeCloseTo(summary.metrics['No correction']!.SSIM, 4);
    expect(res.metrics.gaussianBlur.psnrDb).toBeCloseTo(summary.metrics['Gaussian blur']!.PSNR_dB, 3);
    expect(res.metrics.gaussianBlur.ssim).toBeCloseTo(summary.metrics['Gaussian blur']!.SSIM, 3);
    expect(res.metrics.notchFilter.psnrDb).toBeCloseTo(summary.metrics['Notch filter']!.PSNR_dB, 4);
    expect(res.metrics.notchFilter.ssim).toBeCloseTo(summary.metrics['Notch filter']!.SSIM, 4);

    const cands = detectPeakCandidates(res.spectrum, gray.width, gray.height, { maxPeaks: 6 });
    expect(
      cands.slice(0, 2).map((c) => canonicalPointKey(gray.width, gray.height, c.y, c.x)),
    ).toEqual(
      summary.top_candidates
        .slice(0, 2)
        .map(([y, x]) => canonicalPointKey(gray.width, gray.height, y, x)),
    );
  });
});

describe('Boundary validation and edge cases', () => {
  it('validates invalid sigma, NaN inputs, and out-of-bounds notch coordinates', () => {
    expect(() => buildNotchMask(16, 16, [{ y: 4, x: 4 }], 0)).toThrow();
    expect(() => buildNotchMask(16, 16, [{ y: 4, x: 4 }], -1)).toThrow();
    expect(() => buildNotchMask(16, 16, [{ y: 16, x: 4 }], 1)).toThrow();
    expect(() => buildNotchMask(16, 16, [{ y: -1, x: 4 }], 1)).toThrow();
    expect(() => buildNotchMask(16, 16, [{ y: Number.NaN, x: 4 }], 1)).toThrow();
    expect(() => buildNotchMask(16, 16, [{ y: 4, x: Number.POSITIVE_INFINITY }], 1)).toThrow();
  });

  it('rejects Nyquist-violating, NaN frequencies, and negative blur sigma', () => {
    const clean = new Float64Array(16 * 16);
    expect(() =>
      addPeriodicNoise(clean, 16, 16, [{ u: 9, v: 0, amplitude: 0.1, phase: 0 }]),
    ).toThrow();
    expect(() =>
      addPeriodicNoise(clean, 16, 16, [{ u: Number.NaN, v: 0, amplitude: 0.1, phase: 0 }]),
    ).toThrow();
    expect(() =>
      addPeriodicNoise(clean, 16, 16, [{ u: 2, v: 0, amplitude: Number.NaN, phase: 0 }]),
    ).toThrow();
    expect(() => gaussianBlur(clean, 16, 16, -0.5)).toThrow();
  });

  it('inspects PNG headers accurately and rejects SVG/text spoofing', () => {
    const pngBytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/samples/camera.png')));
    expect(inspectImageHeader(pngBytes)).toEqual({ format: 'png', width: 512, height: 512 });

    const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(() => inspectImageHeader(svgBytes)).toThrow(/Format tidak didukung/i);
  });

  it('parses PGM headers and matches Python auto_detect_notch_centers on boy_noisy.pgm', () => {
    const pgmBytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'public/samples/boy_noisy.pgm')));
    expect(inspectImageHeader(pgmBytes)).toEqual({ format: 'pgm', width: 512, height: 512 });

    const marker = new TextEncoder().encode('255\n');
    let dataOffset = -1;
    for (let i = 0; i < 64; i++) {
      if (
        pgmBytes[i] === marker[0] &&
        pgmBytes[i + 1] === marker[1] &&
        pgmBytes[i + 2] === marker[2] &&
        pgmBytes[i + 3] === marker[3]
      ) {
        dataOffset = i + 4;
        break;
      }
    }
    expect(dataOffset).toBeGreaterThan(0);

    const boy = new Float64Array(512 * 512);
    for (let i = 0; i < boy.length; i++) {
      boy[i] = pgmBytes[dataOffset + i]! / 255.0;
    }

    const detected = autoDetectNotchCenters(boy, 512, 512, { zThresh: 6.0, maxPeaks: 8 });
    expect(detected.map((c) => [c.y, c.x])).toEqual(golden.boy_noisy_512x512.auto_centers);

    const { spectrum } = fftSpectrum(boy, 512, 512);
    const rec = recommendPeakCandidates(spectrum, 512, 512, 4, 0.82);
    expect(rec.map((c) => canonicalPointKey(512, 512, c.y, c.x))).toEqual(
      golden.boy_noisy_512x512.recommended.map(([y, x]) => canonicalPointKey(512, 512, y, x)),
    );

    const { restored } = restoreWithNotch(
      boy,
      512,
      512,
      detected.map((c) => ({ y: c.y, x: c.x })),
      1.2,
    );
    const [, , mean] = stats(restored);
    expect(mean).toBeCloseTo(golden.boy_noisy_512x512.restored_mean, 5);
  });

  it('builds a valid PKZIP archive with local, central directory, and EOCD headers', () => {
    const zip = buildZipArchive([
      { name: 'hello.txt', data: new TextEncoder().encode('halo') },
      { name: 'empty.bin', data: new Uint8Array(0) },
    ]);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    const eocdOffset = zip.length - 22;
    expect(zip[eocdOffset]).toBe(0x50);
    expect(zip[eocdOffset + 1]).toBe(0x4b);
    expect(zip[eocdOffset + 2]).toBe(0x05);
    expect(zip[eocdOffset + 3]).toBe(0x06);
  });

  it('handles zero-error PSNR and small images gracefully', () => {
    const a = Float64Array.from([0.2, 0.4, 0.6, 0.8]);
    const m = calculateMetrics(a, a, 2, 2);
    expect(m.psnrDb).toBe(Infinity);
    expect(Number.isNaN(m.ssim)).toBe(true);

    const { spectrum } = fftSpectrum(a, 2, 2);
    expect(detectPeakCandidates(spectrum, 2, 2)).toEqual([]);

    const known = knownNotchCenters(16, 16, [{ u: 3, v: -2, amplitude: 0.1, phase: 0 }]);
    expect(known).toEqual([{ y: 6, x: 11 }]);

    const clean = new Float64Array(16 * 16).fill(0.5);
    const { restored } = restoreWithNotch(clean, 16, 16, [{ y: 4, x: 4 }], 1.0);
    // Two symmetric Gaussian tails at distance sqrt(32) attenuate DC by (1 - exp(-16))^2.
    expect(restored[0]).toBeCloseTo(0.5 * Math.pow(1 - Math.exp(-16), 2), 10);
  });
});
