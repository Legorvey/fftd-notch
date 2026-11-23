import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { arrayToPngBytes, csvToBytes, downloadZip, type ZipEntry } from '../dsp/zip';
import type { Point2D, QualityMetrics } from '../dsp/types';
import {
  DEFAULT_MAX_DIMENSION,
  loadImageFromFile,
  rasterizeCanvasSource,
  type LoadedImageResult,
} from '../utils/imageLoader';
import { dspClient } from '../workers/dspClient';
import { CanvasFigure } from './CanvasFigure';
import { ComparisonViewer } from './ComparisonViewer';
import { MetricsTable } from './MetricsTable';
import { SpectrumCanvas } from './SpectrumCanvas';

interface CameraResult {
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

export function CameraTab() {
  const [mode, setMode] = useState<'real' | 'simulation'>('real');
  const [notchSigma, setNotchSigma] = useState(1.2);
  const [captured, setCaptured] = useState<LoadedImageResult | null>(null);
  const [result, setResult] = useState<CameraResult | null>(null);

  const [streamActive, setStreamActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef(0);
  const sigmaId = useId();
  const fallbackUploadId = useId();

  const stopStream = () => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini tidak mendukung akses kamera web. Gunakan unggah foto di bawah sebagai pengganti.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1024 }, height: { ideal: 768 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStreamActive(true);
    } catch {
      setCameraError(
        'Izin kamera ditolak atau perangkat kamera tidak ditemukan. Anda tetap dapat mengunggah foto dari perangkat di bawah.',
      );
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 16 || video.videoHeight < 16) {
      setCameraError('Aliran video kamera belum siap untuk diambil.');
      return;
    }
    try {
      const frame = rasterizeCanvasSource(
        video,
        video.videoWidth,
        video.videoHeight,
        'kamera_web.png',
        DEFAULT_MAX_DIMENSION,
      );
      setCaptured(frame);
      setCameraError(null);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Gagal menangkap frame dari kamera.');
    }
  };

  const handleFallbackUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setCameraError(null);
    try {
      const loaded = await loadImageFromFile(file, DEFAULT_MAX_DIMENSION);
      setCaptured(loaded);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'Gagal membaca foto.');
    }
  };

  useEffect(() => {
    const seq = ++seqRef.current;
    if (!captured) {
      setResult(null);
      setProcessing(false);
      return () => {
        seqRef.current++;
      };
    }

    setProcessing(true);
    setCameraError(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await dspClient.processCameraFrame({
          width: captured.width,
          height: captured.height,
          clean: captured.data,
          mode,
          notchSigma,
        });
        if (seq !== seqRef.current) return;
        setResult(res);
      } catch (err) {
        if (seq !== seqRef.current) return;
        setCameraError(err instanceof Error ? err.message : 'Gagal memproses foto kamera.');
      } finally {
        if (seq === seqRef.current) setProcessing(false);
      }
    }, 30);

    return () => {
      seqRef.current++;
      window.clearTimeout(timer);
    };
  }, [captured, mode, notchSigma]);

  const handleDownloadCameraZip = async () => {
    if (!captured || !result) return;
    const entries: ZipEntry[] = [
      {
        name: '01_foto_asli.png',
        data: await arrayToPngBytes(captured.data, captured.width, captured.height, 'gray'),
      },
      {
        name: '02_citra_uji.png',
        data: await arrayToPngBytes(result.working, captured.width, captured.height, 'gray'),
      },
      {
        name: '03_spektrum_fft.png',
        data: await arrayToPngBytes(result.spectrum, captured.width, captured.height, 'inferno', true),
      },
      {
        name: '04_notch_mask.png',
        data: await arrayToPngBytes(result.mask, captured.width, captured.height, 'gray'),
      },
      {
        name: '05_hasil_notch.png',
        data: await arrayToPngBytes(result.restored, captured.width, captured.height, 'gray'),
      },
    ];
    if (result.blurred) {
      entries.push({
        name: '06_gaussian_blur.png',
        data: await arrayToPngBytes(result.blurred, captured.width, captured.height, 'gray'),
      });
    }
    if (result.metrics) {
      entries.push({
        name: 'metrik_kamera.csv',
        data: csvToBytes(
          ['Metode', 'PSNR_dB', 'SSIM'],
          [
            ['Tanpa perbaikan', result.metrics.noCorrection.psnrDb, result.metrics.noCorrection.ssim],
            ['Gaussian blur', result.metrics.gaussianBlur.psnrDb, result.metrics.gaussianBlur.ssim],
            ['Notch filter', result.metrics.notchFilter.psnrDb, result.metrics.notchFilter.ssim],
          ],
        ),
      });
    }
    downloadZip(entries, 'hasil_kamera_fft2d.zip');
  };

  return (
    <section
      id="panel-camera"
      role="tabpanel"
      aria-labelledby="tab-camera"
      className="section-stack"
    >
      <div className="workspace-hero">
        <div>
          <h2 className="page-heading">Kamera web: deteksi foto asli dan simulasi periodik</h2>
          <p className="page-lead">
            Ambil foto langsung dari kamera web atau unggah foto perangkat. Mode foto asli mencari puncak periodik dominan secara otomatis; mode simulasi menambahkan dua sinusoid terkontrol untuk menguji PSNR dan SSIM.
          </p>
        </div>
        <div className="telemetry-pill" aria-live="polite">
          {captured
            ? `${captured.width} x ${captured.height} px · ${mode === 'simulation' ? 'Simulasi' : 'Foto asli'}`
            : streamActive
              ? 'Kamera aktif'
              : 'Kamera siaga'}
        </div>
      </div>

      <div className="workbench-split">
        <div className="panel section-stack" style={{ gap: '1rem' }}>
          <div className="panel-header" style={{ marginBottom: 0 }}>
            <div>
              <h3 className="panel-title">Pengaturan kamera</h3>
              <p className="panel-subtitle">Pilih mode pemrosesan dan lebar notch sebelum atau sesudah mengambil foto.</p>
            </div>
            {processing ? (
              <span className="busy-pill" role="status" aria-live="polite">
                Memproses frame...
              </span>
            ) : null}
          </div>

          <div className="btn-segmented" role="group" aria-label="Mode pemrosesan kamera">
            <button
              type="button"
              className="btn btn-compact btn-toggle"
              aria-pressed={mode === 'real'}
              onClick={() => setMode('real')}
            >
              Foto asli (deteksi otomatis)
            </button>
            <button
              type="button"
              className="btn btn-compact btn-toggle"
              aria-pressed={mode === 'simulation'}
              onClick={() => setMode('simulation')}
            >
              Simulasi gangguan periodik
            </button>
          </div>

          <div className="field">
            <label htmlFor={sigmaId} className="field-label">
              <span>Lebar notch kamera (sigma)</span>
              <span className="mono-value">{notchSigma.toFixed(1)}</span>
            </label>
            <input
              id={sigmaId}
              type="range"
              min={0.3}
              max={5.0}
              step={0.1}
              value={notchSigma}
              onChange={(e) => setNotchSigma(Number(e.target.value))}
              className="range-input"
            />
          </div>

          <div className="file-dropzone">
            <label htmlFor={fallbackUploadId} className="file-dropzone-label">
              Atau unggah foto perangkat (PNG, JPG, WebP, PGM)
            </label>
            <input
              id={fallbackUploadId}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pgm,image/png,image/jpeg,image/webp"
              className="file-input"
              onChange={handleFallbackUpload}
            />
            <span className="file-dropzone-hint">
              {captured ? `Frame aktif: ${captured.name} (${captured.width} x ${captured.height} px)` : 'Belum ada foto ditangkap.'}
            </span>
          </div>
        </div>

        <div className="panel section-stack" style={{ gap: '0.85rem' }}>
          <div className="panel-header" style={{ marginBottom: 0 }}>
            <h3 className="panel-title">Pratinjau kamera web</h3>
            <div className="btn-segmented">
              {!streamActive ? (
                <button type="button" className="btn btn-primary" onClick={startCamera}>
                  Aktifkan kamera
                </button>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" onClick={captureFrame}>
                    Ambil foto
                  </button>
                  <button type="button" className="btn" onClick={stopStream}>
                    Matikan kamera
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="canvas-frame" style={{ aspectRatio: '4 / 3' }}>
            <video
              ref={videoRef}
              playsInline
              muted
              className="display-canvas"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              aria-label="Pratinjau kamera web"
            />
          </div>
        </div>
      </div>

      {cameraError ? (
        <div className="status-banner status-banner-warning" role="alert">
          <span className="status-prefix">PERINGATAN</span>
          <span>{cameraError}</span>
        </div>
      ) : null}

      {captured && result ? (
        <div className="panel section-stack" style={{ gap: '1.25rem' }}>
          <div className="status-banner status-banner-info" role="status">
            <span className="status-prefix">{result.status === 'no_peak' ? 'INFO' : 'OK'}</span>
            <span>{result.message}</span>
          </div>

          <div className="workbench-split">
            <ComparisonViewer
              leftLabel={mode === 'simulation' ? 'Foto + sinusoid' : 'Foto asli'}
              leftData={result.working}
              rightLabel="Hasil notch filter"
              rightData={result.restored}
              width={captured.width}
              height={captured.height}
            />
            <SpectrumCanvas
              spectrum={result.spectrum}
              filteredSpectrum={result.filteredSpectrum}
              width={captured.width}
              height={captured.height}
              centers={result.centers}
              sigma={notchSigma}
              interactive={false}
            />
          </div>

          <div className="image-grid-3">
            <CanvasFigure title="Citra uji" data={result.working} width={captured.width} height={captured.height} />
            <CanvasFigure title="Notch mask" data={result.mask} width={captured.width} height={captured.height} />
            <CanvasFigure title="Hasil notch filter" data={result.restored} width={captured.width} height={captured.height} />
          </div>

          {result.metrics ? <MetricsTable metrics={result.metrics} /> : null}

          <div className="export-bar">
            <button type="button" className="btn btn-primary" onClick={handleDownloadCameraZip}>
              Unduh semua hasil kamera (ZIP)
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
