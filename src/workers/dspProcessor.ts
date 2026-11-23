import {
  applyNotchToSpectrum,
  autoDetectNotchCenters,
  calculateMetrics,
  detectPeakCandidates,
  fftSpectrum,
  gaussianBlur,
  recommendPeakCandidates,
} from '../dsp/notch';
import {
  addPeriodicNoise,
  DEFAULT_SIGMA_SWEEP,
  knownNotchCenters,
} from '../dsp/experiments';
import type {
  PeakCandidate,
  Point2D,
  QualityMetrics,
  SigmaSweepPoint,
  SinusoidComponent,
} from '../dsp/types';

export const MAX_WORKER_DIMENSION = 2048;
export const MAX_WORKER_PIXELS = 4_194_304;
export const MAX_NOTCH_CENTERS = 64;
export const MAX_COMPONENTS = 16;

export type WorkerRequest =
  | {
      id: number;
      type: 'analyzeLabImage';
      width: number;
      height: number;
      data: Float64Array;
      maxPeaks: number;
    }
  | {
      id: number;
      type: 'restoreLab';
      width: number;
      height: number;
      corrupted: Float64Array;
      reference: Float64Array | null;
      centers: Point2D[];
      notchSigma: number;
      blurSigma: number;
    }
  | {
      id: number;
      type: 'runExperiment';
      width: number;
      height: number;
      clean: Float64Array;
      components: SinusoidComponent[];
      notchSigma: number;
      blurSigma: number;
    }
  | {
      id: number;
      type: 'autoDetectLab';
      width: number;
      height: number;
      data: Float64Array;
      zThresh: number;
      maxPeaks: number;
    }
  | {
      id: number;
      type: 'processCameraFrame';
      width: number;
      height: number;
      clean: Float64Array;
      mode: 'real' | 'simulation';
      notchSigma: number;
    }
  | {
      id: number;
      type: 'clearCache';
    };

export type WorkerResponse =
  | {
      id: number;
      type: 'analyzeLabImageResult';
      spectrum: Float64Array;
      candidates: PeakCandidate[];
    }
  | {
      id: number;
      type: 'restoreLabResult';
      restored: Float64Array;
      filteredSpectrum: Float64Array;
      mask: Float64Array;
      blurred: Float64Array;
      metrics: {
        noCorrection: QualityMetrics;
        gaussianBlur: QualityMetrics;
        notchFilter: QualityMetrics;
      } | null;
    }
  | {
      id: number;
      type: 'runExperimentResult';
      noisy: Float64Array;
      blurred: Float64Array;
      restored: Float64Array;
      spectrum: Float64Array;
      filteredSpectrum: Float64Array;
      mask: Float64Array;
      centers: Point2D[];
      metrics: {
        noCorrection: QualityMetrics;
        gaussianBlur: QualityMetrics;
        notchFilter: QualityMetrics;
      };
      sweep: SigmaSweepPoint[];
    }
  | {
      id: number;
      type: 'autoDetectLabResult';
      candidates: PeakCandidate[];
    }
  | {
      id: number;
      type: 'processCameraFrameResult';
      status: 'simulated' | 'filtered' | 'no_peak';
      message: string;
      working: Float64Array;
      restored: Float64Array;
      blurred: Float64Array | null;
      spectrum: Float64Array;
      filteredSpectrum: Float64Array;
      mask: Float64Array;
      centers: Point2D[];
      metrics: {
        noCorrection: QualityMetrics;
        gaussianBlur: QualityMetrics;
        notchFilter: QualityMetrics;
      } | null;
    }
  | {
      id: number;
      type: 'cacheCleared';
    }
  | {
      id: number;
      type: 'error';
      message: string;
    };

interface CachedLabState {
  width: number;
  height: number;
  sourceRef: Float64Array;
  fShiftRe: Float64Array;
  fShiftIm: Float64Array;
  lastBlurSigma: number | null;
  lastBlurred: Float64Array | null;
  lastNotchKey: string | null;
  lastRestored: Float64Array | null;
  lastMask: Float64Array | null;
  lastFilteredSpectrum: Float64Array | null;
}

interface CachedExperimentState {
  width: number;
  height: number;
  cleanRef: Float64Array;
  componentsKey: string;
  noisy: Float64Array;
  fShiftRe: Float64Array;
  fShiftIm: Float64Array;
  spectrum: Float64Array;
  centers: Point2D[];
  noCorrectionMetric: QualityMetrics;
  sweep: SigmaSweepPoint[];
  lastBlurSigma: number | null;
  lastBlurred: Float64Array | null;
  lastBlurMetric: QualityMetrics | null;
  lastNotchSigma: number | null;
  lastRestored: Float64Array | null;
  lastMask: Float64Array | null;
  lastFilteredSpectrum: Float64Array | null;
  lastNotchMetric: QualityMetrics | null;
}

let cachedLab: CachedLabState | null = null;
let cachedExperiment: CachedExperimentState | null = null;

function arraysMatch(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  if (a.length > 0 && (a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1])) {
    return false;
  }
  const mid = a.length >> 1;
  if (a.length > 2 && a[mid] !== b[mid]) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_WORKER_DIMENSION ||
    height > MAX_WORKER_DIMENSION ||
    width * height > MAX_WORKER_PIXELS
  ) {
    throw new Error('Dimensi citra melebihi batas aman pemrosesan.');
  }
}

function serializeComponents(components: readonly SinusoidComponent[]): string {
  return components
    .map((c) => `${Math.trunc(c.u)},${Math.trunc(c.v)},${c.amplitude},${c.phase}`)
    .join(';');
}

function serializeNotchKey(centers: readonly Point2D[], sigma: number): string {
  return `${sigma}|${centers.map((c) => `${Math.trunc(c.y)},${Math.trunc(c.x)}`).join(';')}`;
}

export function processWorkerRequest(req: WorkerRequest): WorkerResponse {
  if (!req || typeof req !== 'object') {
    return { id: 0, type: 'error', message: 'Permintaan worker tidak valid.' };
  }
  const reqId = typeof req.id === 'number' ? req.id : 0;

  try {
    if (req.type === 'clearCache') {
      cachedLab = null;
      cachedExperiment = null;
      return { id: reqId, type: 'cacheCleared' };
    }

    if (req.type === 'analyzeLabImage') {
      validateDimensions(req.width, req.height);
      const maxPeaks = Math.min(64, Math.max(1, Math.trunc(req.maxPeaks)));
      const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(req.data, req.width, req.height);
      cachedLab = {
        width: req.width,
        height: req.height,
        sourceRef: new Float64Array(req.data),
        fShiftRe,
        fShiftIm,
        lastBlurSigma: null,
        lastBlurred: null,
        lastNotchKey: null,
        lastRestored: null,
        lastMask: null,
        lastFilteredSpectrum: null,
      };
      const candidates = detectPeakCandidates(spectrum, req.width, req.height, { maxPeaks });
      return {
        id: reqId,
        type: 'analyzeLabImageResult',
        spectrum,
        candidates,
      };
    }

    if (req.type === 'restoreLab') {
      validateDimensions(req.width, req.height);
      if (req.centers.length > MAX_NOTCH_CENTERS) {
        throw new Error(`Jumlah titik notch melebihi batas maksimum (${MAX_NOTCH_CENTERS}).`);
      }
      if (!Number.isFinite(req.notchSigma) || req.notchSigma <= 0 || req.notchSigma > 50) {
        throw new Error('Sigma harus lebih besar dari 0 dan tidak melebihi 50.');
      }
      if (!Number.isFinite(req.blurSigma) || req.blurSigma < 0 || req.blurSigma > 20) {
        throw new Error('Sigma Gaussian tidak boleh negatif dan tidak melebihi 20.');
      }

      if (
        !cachedLab ||
        cachedLab.width !== req.width ||
        cachedLab.height !== req.height ||
        !arraysMatch(cachedLab.sourceRef, req.corrupted)
      ) {
        const computed = fftSpectrum(req.corrupted, req.width, req.height);
        cachedLab = {
          width: req.width,
          height: req.height,
          sourceRef: new Float64Array(req.corrupted),
          fShiftRe: computed.fShiftRe,
          fShiftIm: computed.fShiftIm,
          lastBlurSigma: null,
          lastBlurred: null,
          lastNotchKey: null,
          lastRestored: null,
          lastMask: null,
          lastFilteredSpectrum: null,
        };
      }

      const notchKey = serializeNotchKey(req.centers, req.notchSigma);
      let restored: Float64Array;
      let mask: Float64Array;
      let filteredSpectrum: Float64Array;

      if (
        cachedLab.lastNotchKey === notchKey &&
        cachedLab.lastRestored &&
        cachedLab.lastMask &&
        cachedLab.lastFilteredSpectrum
      ) {
        restored = cachedLab.lastRestored;
        mask = cachedLab.lastMask;
        filteredSpectrum = cachedLab.lastFilteredSpectrum;
      } else {
        const applied = applyNotchToSpectrum(
          cachedLab.fShiftRe,
          cachedLab.fShiftIm,
          req.width,
          req.height,
          req.centers,
          req.notchSigma,
          true,
        );
        cachedLab.lastNotchKey = notchKey;
        cachedLab.lastRestored = applied.restored;
        cachedLab.lastMask = applied.mask;
        cachedLab.lastFilteredSpectrum = applied.filteredSpectrum;
        restored = applied.restored;
        mask = applied.mask;
        filteredSpectrum = applied.filteredSpectrum;
      }

      let blurred: Float64Array;
      if (cachedLab.lastBlurSigma === req.blurSigma && cachedLab.lastBlurred) {
        blurred = cachedLab.lastBlurred;
      } else {
        blurred = gaussianBlur(req.corrupted, req.width, req.height, req.blurSigma);
        cachedLab.lastBlurSigma = req.blurSigma;
        cachedLab.lastBlurred = blurred;
      }

      let metrics: {
        noCorrection: QualityMetrics;
        gaussianBlur: QualityMetrics;
        notchFilter: QualityMetrics;
      } | null = null;

      if (req.reference && req.reference.length === req.corrupted.length) {
        metrics = {
          noCorrection: calculateMetrics(req.reference, req.corrupted, req.width, req.height),
          gaussianBlur: calculateMetrics(req.reference, blurred, req.width, req.height),
          notchFilter: calculateMetrics(req.reference, restored, req.width, req.height),
        };
      }

      // Return copies of cached arrays so outbound worker postMessage transferables never detach cache.
      return {
        id: reqId,
        type: 'restoreLabResult',
        restored: new Float64Array(restored),
        filteredSpectrum: new Float64Array(filteredSpectrum),
        mask: new Float64Array(mask),
        blurred: new Float64Array(blurred),
        metrics,
      };
    }

    if (req.type === 'runExperiment') {
      validateDimensions(req.width, req.height);
      if (req.components.length > MAX_COMPONENTS) {
        throw new Error(`Jumlah komponen sinusoid melebihi batas (${MAX_COMPONENTS}).`);
      }
      if (!Number.isFinite(req.notchSigma) || req.notchSigma <= 0 || req.notchSigma > 50) {
        throw new Error('Sigma harus lebih besar dari 0 dan tidak melebihi 50.');
      }
      if (!Number.isFinite(req.blurSigma) || req.blurSigma < 0 || req.blurSigma > 20) {
        throw new Error('Sigma Gaussian tidak boleh negatif dan tidak melebihi 20.');
      }

      const compKey = serializeComponents(req.components);
      const cacheHit =
        cachedExperiment &&
        cachedExperiment.width === req.width &&
        cachedExperiment.height === req.height &&
        cachedExperiment.componentsKey === compKey &&
        arraysMatch(cachedExperiment.cleanRef, req.clean);

      if (!cacheHit) {
        const { noisy } = addPeriodicNoise(req.clean, req.width, req.height, req.components);
        const centers = knownNotchCenters(req.width, req.height, req.components);
        const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(noisy, req.width, req.height);
        const noCorrectionMetric = calculateMetrics(req.clean, noisy, req.width, req.height);
        const sweep: SigmaSweepPoint[] = DEFAULT_SIGMA_SWEEP.map((sigma) => {
          const { restored: sRestored } = applyNotchToSpectrum(
            fShiftRe,
            fShiftIm,
            req.width,
            req.height,
            centers,
            sigma,
            false,
          );
          return { sigma, ...calculateMetrics(req.clean, sRestored, req.width, req.height) };
        });

        cachedExperiment = {
          width: req.width,
          height: req.height,
          cleanRef: new Float64Array(req.clean),
          componentsKey: compKey,
          noisy,
          fShiftRe,
          fShiftIm,
          spectrum,
          centers,
          noCorrectionMetric,
          sweep,
          lastBlurSigma: null,
          lastBlurred: null,
          lastBlurMetric: null,
          lastNotchSigma: null,
          lastRestored: null,
          lastMask: null,
          lastFilteredSpectrum: null,
          lastNotchMetric: null,
        };
      }

      const exp = cachedExperiment!;

      if (exp.lastNotchSigma !== req.notchSigma || !exp.lastRestored || !exp.lastMask || !exp.lastFilteredSpectrum || !exp.lastNotchMetric) {
        const applied = applyNotchToSpectrum(
          exp.fShiftRe,
          exp.fShiftIm,
          req.width,
          req.height,
          exp.centers,
          req.notchSigma,
          true,
        );
        exp.lastNotchSigma = req.notchSigma;
        exp.lastRestored = applied.restored;
        exp.lastMask = applied.mask;
        exp.lastFilteredSpectrum = applied.filteredSpectrum;
        exp.lastNotchMetric = calculateMetrics(exp.cleanRef, applied.restored, req.width, req.height);
      }

      if (exp.lastBlurSigma !== req.blurSigma || !exp.lastBlurred || !exp.lastBlurMetric) {
        const blurred = gaussianBlur(exp.noisy, req.width, req.height, req.blurSigma);
        exp.lastBlurSigma = req.blurSigma;
        exp.lastBlurred = blurred;
        exp.lastBlurMetric = calculateMetrics(exp.cleanRef, blurred, req.width, req.height);
      }

      return {
        id: reqId,
        type: 'runExperimentResult',
        noisy: new Float64Array(exp.noisy),
        blurred: new Float64Array(exp.lastBlurred),
        restored: new Float64Array(exp.lastRestored),
        spectrum: new Float64Array(exp.spectrum),
        filteredSpectrum: new Float64Array(exp.lastFilteredSpectrum),
        mask: new Float64Array(exp.lastMask),
        centers: exp.centers.map((c) => ({ ...c })),
        metrics: {
          noCorrection: exp.noCorrectionMetric,
          gaussianBlur: exp.lastBlurMetric,
          notchFilter: exp.lastNotchMetric,
        },
        sweep: exp.sweep.map((s) => ({ ...s })),
      };
    }

    if (req.type === 'autoDetectLab') {
      validateDimensions(req.width, req.height);
      const candidates = autoDetectNotchCenters(req.data, req.width, req.height, {
        zThresh: req.zThresh,
        maxPeaks: Math.min(20, Math.max(1, Math.trunc(req.maxPeaks))),
      });
      return { id: reqId, type: 'autoDetectLabResult', candidates };
    }

    if (req.type === 'processCameraFrame') {
      validateDimensions(req.width, req.height);
      if (!Number.isFinite(req.notchSigma) || req.notchSigma <= 0 || req.notchSigma > 50) {
        throw new Error('Sigma notch harus lebih besar dari 0 dan tidak melebihi 50.');
      }
      if (req.mode === 'simulation') {
        const u = Math.min(24, Math.max(4, Math.floor(req.width / 20)), Math.max(1, Math.floor(req.width / 2) - 1));
        const v = Math.min(30, Math.max(4, Math.floor(req.height / 17)), Math.max(1, Math.floor(req.height / 2) - 1));
        const components: SinusoidComponent[] = [
          { u, v: 0, amplitude: 0.06, phase: 0 },
          { u: 0, v, amplitude: 0.06, phase: 0 },
        ];
        const { noisy } = addPeriodicNoise(req.clean, req.width, req.height, components);
        const centers = knownNotchCenters(req.width, req.height, components);
        const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(noisy, req.width, req.height);
        const { restored, mask, filteredSpectrum } = applyNotchToSpectrum(
          fShiftRe,
          fShiftIm,
          req.width,
          req.height,
          centers,
          req.notchSigma,
          true,
        );
        const blurred = gaussianBlur(noisy, req.width, req.height, 1.2);
        const metrics = {
          noCorrection: calculateMetrics(req.clean, noisy, req.width, req.height),
          gaussianBlur: calculateMetrics(req.clean, blurred, req.width, req.height),
          notchFilter: calculateMetrics(req.clean, restored, req.width, req.height),
        };
        return {
          id: reqId,
          type: 'processCameraFrameResult',
          status: 'simulated',
          message: 'Dua sinusoid sintetis telah ditambahkan dan ditekan pada frekuensi yang diketahui.',
          working: noisy,
          restored,
          blurred,
          spectrum,
          filteredSpectrum,
          mask,
          centers,
          metrics,
        };
      }

      const { fShiftRe, fShiftIm, spectrum } = fftSpectrum(req.clean, req.width, req.height);
      const recommended = recommendPeakCandidates(spectrum, req.width, req.height, 2, 0.9);
      const centers = recommended.map((c) => ({ y: c.y, x: c.x }));
      if (centers.length > 0) {
        const { restored, mask, filteredSpectrum } = applyNotchToSpectrum(
          fShiftRe,
          fShiftIm,
          req.width,
          req.height,
          centers,
          req.notchSigma,
          true,
        );
        const blurred = gaussianBlur(req.clean, req.width, req.height, 1.2);
        return {
          id: reqId,
          type: 'processCameraFrameResult',
          status: 'filtered',
          message:
            'Kandidat puncak dominan ditemukan dan Notch Filter diterapkan. Periksa spektrum untuk memastikan puncak tersebut benar-benar gangguan periodik.',
          working: new Float64Array(req.clean),
          restored,
          blurred,
          spectrum,
          filteredSpectrum,
          mask,
          centers,
          metrics: null,
        };
      }

      const ones = new Float64Array(req.width * req.height);
      ones.fill(1.0);
      return {
        id: reqId,
        type: 'processCameraFrameResult',
        status: 'no_peak',
        message:
          'Tidak ditemukan puncak periodik yang cukup menonjol. Foto ditampilkan tanpa filter agar detail asli tidak terhapus secara sembarang.',
        working: new Float64Array(req.clean),
        restored: new Float64Array(req.clean),
        blurred: null,
        spectrum,
        filteredSpectrum: new Float64Array(spectrum),
        mask: ones,
        centers: [],
        metrics: null,
      };
    }

    return { id: reqId, type: 'error', message: 'Permintaan worker tidak dikenal.' };
  } catch (err) {
    return {
      id: reqId,
      type: 'error',
      message: err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses citra.',
    };
  }
}
