import type { PeakCandidate, Point2D, QualityMetrics, SigmaSweepPoint, SinusoidComponent } from '../dsp/types';
import type { WorkerRequest, WorkerResponse } from './dspProcessor';

interface PendingTask {
  resolve: (value: WorkerResponse) => void;
  reject: (err: Error) => void;
  timerId: number;
}

interface QueuedChannelSlot {
  req: WorkerRequest;
  resolve: (value: WorkerResponse) => void;
  reject: (err: Error) => void;
}

type CoalesceChannel = 'restore' | 'experiment';

const WORKER_TIMEOUT_MS = 30_000;

export class SupersededRequestError extends Error {
  constructor() {
    super('Permintaan digantikan oleh pembaruan terbaru.');
    this.name = 'SupersededRequestError';
  }
}

class DspClient {
  private worker: Worker | null = null;
  private workerUnavailable = false;
  private nextId = 1;
  private pending = new Map<number, PendingTask>();
  private inFlightByChannel = new Set<CoalesceChannel>();
  private latestSlotByChannel = new Map<CoalesceChannel, QueuedChannelSlot>();

  private failAllPending(err: Error): void {
    for (const task of this.pending.values()) {
      window.clearTimeout(task.timerId);
      task.reject(err);
    }
    this.pending.clear();
    for (const slot of this.latestSlotByChannel.values()) {
      slot.reject(err);
    }
    this.latestSlotByChannel.clear();
    this.inFlightByChannel.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private getWorker(): Worker | null {
    if (this.workerUnavailable || typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./dsp.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        this.workerUnavailable = true;
        return null;
      }

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const res = event.data;
        const task = this.pending.get(res.id);
        if (!task) return;
        window.clearTimeout(task.timerId);
        this.pending.delete(res.id);
        if (res.type === 'error') {
          task.reject(new Error(res.message));
        } else {
          task.resolve(res);
        }
      };

      this.worker.onerror = (event) => {
        this.failAllPending(new Error(event.message || 'Worker DSP mengalami gangguan.'));
      };

      this.worker.onmessageerror = () => {
        this.failAllPending(new Error('Gagal membaca respons data dari worker DSP.'));
      };
    }
    return this.worker;
  }

  private async dispatchImmediate(req: WorkerRequest): Promise<WorkerResponse> {
    const worker = this.getWorker();
    if (!worker) {
      // Dynamic import keeps DSP engine out of the main production JS chunk when Worker is supported.
      const { processWorkerRequest } = await import('./dspProcessor');
      const res = processWorkerRequest(req);
      if (res.type === 'error') {
        throw new Error(res.message);
      }
      return res;
    }

    return new Promise<WorkerResponse>((resolve, reject) => {
      const timerId = window.setTimeout(() => {
        if (!this.pending.has(req.id)) return;
        this.failAllPending(new Error('Pemrosesan DSP melebihi batas waktu 30 detik.'));
      }, WORKER_TIMEOUT_MS);

      this.pending.set(req.id, { resolve, reject, timerId });
      try {
        worker.postMessage(req);
      } catch {
        window.clearTimeout(timerId);
        this.pending.delete(req.id);
        reject(new Error('Gagal mengirim data citra ke worker DSP.'));
      }
    });
  }

  // Keep at most one in-flight request plus one latest queued request per slider channel.
  private dispatchCoalesced(channel: CoalesceChannel, req: WorkerRequest): Promise<WorkerResponse> {
    if (this.inFlightByChannel.has(channel)) {
      const prev = this.latestSlotByChannel.get(channel);
      if (prev) {
        prev.reject(new SupersededRequestError());
      }
      return new Promise<WorkerResponse>((resolve, reject) => {
        this.latestSlotByChannel.set(channel, { req, resolve, reject });
      });
    }

    this.inFlightByChannel.add(channel);
    return this.dispatchImmediate(req).finally(() => {
      this.inFlightByChannel.delete(channel);
      const next = this.latestSlotByChannel.get(channel);
      if (next) {
        this.latestSlotByChannel.delete(channel);
        this.dispatchCoalesced(channel, next.req).then(next.resolve, next.reject);
      }
    });
  }

  async analyzeLabImage(
    width: number,
    height: number,
    data: Float64Array,
    maxPeaks = 12,
  ): Promise<{ spectrum: Float64Array; candidates: PeakCandidate[] }> {
    const id = this.nextId++;
    const res = await this.dispatchImmediate({
      id,
      type: 'analyzeLabImage',
      width,
      height,
      data,
      maxPeaks,
    });
    if (res.type !== 'analyzeLabImageResult') {
      throw new Error('Respons worker tidak sesuai untuk analisis spektrum.');
    }
    return { spectrum: res.spectrum, candidates: res.candidates };
  }

  async restoreLab(params: {
    width: number;
    height: number;
    corrupted: Float64Array;
    reference: Float64Array | null;
    centers: Point2D[];
    notchSigma: number;
    blurSigma: number;
  }): Promise<{
    restored: Float64Array;
    filteredSpectrum: Float64Array;
    mask: Float64Array;
    blurred: Float64Array;
    metrics: {
      noCorrection: QualityMetrics;
      gaussianBlur: QualityMetrics;
      notchFilter: QualityMetrics;
    } | null;
  }> {
    const id = this.nextId++;
    const res = await this.dispatchCoalesced('restore', {
      id,
      type: 'restoreLab',
      ...params,
    });
    if (res.type !== 'restoreLabResult') {
      throw new Error('Respons worker tidak sesuai untuk restorasi notch.');
    }
    return {
      restored: res.restored,
      filteredSpectrum: res.filteredSpectrum,
      mask: res.mask,
      blurred: res.blurred,
      metrics: res.metrics,
    };
  }

  async runExperiment(params: {
    width: number;
    height: number;
    clean: Float64Array;
    components: SinusoidComponent[];
    notchSigma: number;
    blurSigma: number;
  }): Promise<{
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
  }> {
    const id = this.nextId++;
    const res = await this.dispatchCoalesced('experiment', {
      id,
      type: 'runExperiment',
      ...params,
    });
    if (res.type !== 'runExperimentResult') {
      throw new Error('Respons worker tidak sesuai untuk eksperimen sintetis.');
    }
    return {
      noisy: res.noisy,
      blurred: res.blurred,
      restored: res.restored,
      spectrum: res.spectrum,
      filteredSpectrum: res.filteredSpectrum,
      mask: res.mask,
      centers: res.centers,
      metrics: res.metrics,
      sweep: res.sweep,
    };
  }
}

export const dspClient = new DspClient();
