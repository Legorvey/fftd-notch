import { processWorkerRequest, type WorkerRequest, type WorkerResponse } from './dspProcessor';

export { processWorkerRequest, type WorkerRequest, type WorkerResponse };

if (
  typeof self !== 'undefined' &&
  typeof (self as DedicatedWorkerGlobalScope).postMessage === 'function' &&
  typeof window === 'undefined'
) {
  const scope = self as DedicatedWorkerGlobalScope;
  scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const response = processWorkerRequest(event.data);
    const transferables: Transferable[] = [];
    if (response.type === 'analyzeLabImageResult') {
      transferables.push(response.spectrum.buffer);
    } else if (response.type === 'restoreLabResult') {
      transferables.push(
        response.restored.buffer,
        response.filteredSpectrum.buffer,
        response.mask.buffer,
        response.blurred.buffer,
      );
    } else if (response.type === 'runExperimentResult') {
      transferables.push(
        response.noisy.buffer,
        response.blurred.buffer,
        response.restored.buffer,
        response.spectrum.buffer,
        response.filteredSpectrum.buffer,
        response.mask.buffer,
      );
    } else if (response.type === 'processCameraFrameResult') {
      transferables.push(
        response.working.buffer,
        response.restored.buffer,
        response.spectrum.buffer,
        response.filteredSpectrum.buffer,
        response.mask.buffer,
      );
      if (response.blurred) transferables.push(response.blurred.buffer);
    }
    scope.postMessage(response, transferables);
  };
}
