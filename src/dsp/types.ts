export interface GrayscaleImage {
  width: number;
  height: number;
  data: Float64Array;
}

export interface Point2D {
  y: number;
  x: number;
}

export interface PeakCandidate extends Point2D {
  value: number;
}

export interface SinusoidComponent {
  u: number;
  v: number;
  amplitude: number;
  phase: number;
}

export interface QualityMetrics {
  psnrDb: number;
  ssim: number;
}

export interface SigmaSweepPoint extends QualityMetrics {
  sigma: number;
}

export interface RestorationOutput {
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

export interface SyntheticExperimentResult {
  width: number;
  height: number;
  clean: Float64Array;
  noisy: Float64Array;
  noise: Float64Array;
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
