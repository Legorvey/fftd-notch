import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { downloadArrayAsPng, downloadCsv } from '../dsp/colormap';
import { formatPsnr, formatSsim } from '../dsp/format';
import type { Point2D, QualityMetrics, SigmaSweepPoint, SinusoidComponent } from '../dsp/types';
import {
  DEFAULT_MAX_DIMENSION,
  loadImageFromFile,
  loadImageFromUrl,
  type LoadedImageResult,
} from '../utils/imageLoader';
import { dspClient, SupersededRequestError } from '../workers/dspClient';
import { CanvasFigure } from './CanvasFigure';
import { ComparisonViewer } from './ComparisonViewer';
import { MetricsTable } from './MetricsTable';
import { SigmaChart } from './SigmaChart';
import { SpectrumCanvas } from './SpectrumCanvas';

interface ExperimentState {
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

interface FrequencyPreset {
  id: string;
  label: string;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
  amp1: number;
  amp2: number;
}

const PRESETS: readonly FrequencyPreset[] = [
  { id: 'default', label: 'Default (u1=24, v2=32)', u1: 24, v1: 0, u2: 0, v2: 32, amp1: 0.08, amp2: 0.08 },
  { id: 'diagonal', label: 'Pola diagonal', u1: 18, v1: 18, u2: -14, v2: 22, amp1: 0.08, amp2: 0.08 },
  { id: 'highfreq', label: 'Frekuensi tinggi', u1: 64, v1: 0, u2: 0, v2: 72, amp1: 0.1, amp2: 0.1 },
];

function clampInt(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(val)));
}

export function SyntheticExperimentTab() {
  const [sourceMode, setSourceMode] = useState<'camera' | 'upload'>('camera');
  const [clean, setClean] = useState<LoadedImageResult | null>(null);
  const [loadingSource, setLoadingSource] = useState(false);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [u1, setU1] = useState(24);
  const [v1, setV1] = useState(0);
  const [u2, setU2] = useState(0);
  const [v2, setV2] = useState(32);

  const [u1Text, setU1Text] = useState('24');
  const [v1Text, setV1Text] = useState('0');
  const [u2Text, setU2Text] = useState('0');
  const [v2Text, setV2Text] = useState('32');

  const [amp1, setAmp1] = useState(0.08);
  const [amp2, setAmp2] = useState(0.08);
  const [notchSigma, setNotchSigma] = useState(1.0);
  const [blurSigma, setBlurSigma] = useState(1.2);

  const [result, setResult] = useState<ExperimentState | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'split'>('grid');
  const [splitLeft, setSplitLeft] = useState<'noisy' | 'blurred'>('noisy');

  const sourceSeqRef = useRef(0);
  const runSeqRef = useRef(0);
  const uploadId = useId();
  const u1Id = useId();
  const v1Id = useId();
  const u2Id = useId();
  const v2Id = useId();
  const amp1Id = useId();
  const amp2Id = useId();
  const notchSigmaId = useId();
  const blurSigmaId = useId();

  const loadCameraSample = useCallback(() => {
    const seq = ++sourceSeqRef.current;
    setLoadingSource(true);
    setErrorMessage(null);
    loadImageFromUrl('/samples/camera.png', 'skimage.data.camera', null)
      .then((img) => {
        if (seq === sourceSeqRef.current) setClean(img);
      })
      .catch((err) => {
        if (seq === sourceSeqRef.current) {
          setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat citra contoh camera.');
        }
      })
      .finally(() => {
        if (seq === sourceSeqRef.current) setLoadingSource(false);
      });
  }, []);

  useEffect(() => {
    if (sourceMode !== 'camera') return;
    loadCameraSample();
    return () => {
      sourceSeqRef.current++;
    };
  }, [sourceMode, loadCameraSample]);

  const maxU = clean ? Math.max(1, Math.min(100, Math.floor(clean.width / 2) - 1)) : 100;
  const maxV = clean ? Math.max(1, Math.min(100, Math.floor(clean.height / 2) - 1)) : 100;

  const safeU1 = clampInt(u1, 1, maxU);
  const safeV1 = clampInt(v1, -maxV, maxV);
  const safeU2 = clampInt(u2, -maxU, maxU);
  const safeV2 = clampInt(v2, 1, maxV);

  // Run synthetic experiment in worker with unconditional sequence invalidation.
  useEffect(() => {
    const seq = ++runSeqRef.current;

    if (!clean) {
      setResult(null);
      setRunning(false);
      return () => {
        runSeqRef.current++;
      };
    }
    if (clean.width < 8 || clean.height < 8) {
      setErrorMessage('Ukuran gambar terlalu kecil untuk eksperimen sinusoid (minimal 8 x 8 piksel).');
      setResult(null);
      setRunning(false);
      return () => {
        runSeqRef.current++;
      };
    }

    const components: SinusoidComponent[] = [
      { u: safeU1, v: safeV1, amplitude: amp1, phase: 0.0 },
      { u: safeU2, v: safeV2, amplitude: amp2, phase: 0.0 },
    ];

    setRunning(true);
    setErrorMessage(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await dspClient.runExperiment({
          width: clean.width,
          height: clean.height,
          clean: clean.data,
          components,
          notchSigma,
          blurSigma,
        });
        if (seq !== runSeqRef.current) return;
        setResult(res);
      } catch (err) {
        if (seq !== runSeqRef.current || err instanceof SupersededRequestError) return;
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menjalankan eksperimen sintetis.');
      } finally {
        if (seq === runSeqRef.current) setRunning(false);
      }
    }, 35);

    return () => {
      runSeqRef.current++;
      window.clearTimeout(timer);
    };
  }, [clean, safeU1, safeV1, safeU2, safeV2, amp1, amp2, notchSigma, blurSigma]);

  const handleUploadClean = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const seq = ++sourceSeqRef.current;
    setErrorMessage(null);
    setLoadingSource(true);
    try {
      const loaded = await loadImageFromFile(file, DEFAULT_MAX_DIMENSION);
      if (seq !== sourceSeqRef.current) return;
      if (loaded.width < 8 || loaded.height < 8) {
        setErrorMessage('Ukuran gambar terlalu kecil untuk eksperimen sinusoid (minimal 8 x 8 piksel).');
        setClean(null);
        return;
      }
      setClean(loaded);
    } catch (err) {
      if (seq !== sourceSeqRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membaca gambar referensi bersih.');
    } finally {
      if (seq === sourceSeqRef.current) setLoadingSource(false);
    }
  };

  const applyPreset = (preset: FrequencyPreset) => {
    const nextU1 = clampInt(preset.u1, 1, maxU);
    const nextV1 = clampInt(preset.v1, -maxV, maxV);
    const nextU2 = clampInt(preset.u2, -maxU, maxU);
    const nextV2 = clampInt(preset.v2, 1, maxV);
    setU1(nextU1);
    setV1(nextV1);
    setU2(nextU2);
    setV2(nextV2);
    setU1Text(String(nextU1));
    setV1Text(String(nextV1));
    setU2Text(String(nextU2));
    setV2Text(String(nextV2));
    setAmp1(preset.amp1);
    setAmp2(preset.amp2);
  };

  const handleIntDraftChange = (
    raw: string,
    min: number,
    max: number,
    setText: (s: string) => void,
    setNum: (n: number) => void,
  ) => {
    setText(raw);
    if (raw.trim() === '' || raw.trim() === '-') return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setNum(clampInt(parsed, min, max));
    }
  };

  const handleDownloadExperimentCsv = () => {
    if (!result) return;
    downloadCsv(
      ['Metode', 'PSNR_dB', 'SSIM'],
      [
        ['No correction', result.metrics.noCorrection.psnrDb, result.metrics.noCorrection.ssim],
        ['Gaussian blur', result.metrics.gaussianBlur.psnrDb, result.metrics.gaussianBlur.ssim],
        ['Notch filter', result.metrics.notchFilter.psnrDb, result.metrics.notchFilter.ssim],
      ],
      'hasil_eksperimen_fft_notch.csv',
    );
  };

  const handleDownloadSweepCsv = () => {
    if (!result) return;
    downloadCsv(
      ['sigma', 'PSNR_dB', 'SSIM'],
      result.sweep.map((row) => [row.sigma, row.psnrDb, row.ssim]),
      'analisis_sensitivitas_sigma.csv',
    );
  };

  return (
    <section
      id="panel-experiment"
      role="tabpanel"
      aria-labelledby="tab-experiment"
      className="section-stack"
    >
      <div className="workspace-hero">
        <div>
          <h2 className="page-heading">Eksperimen dua sinusoid spasial terkontrol</h2>
          <p className="page-lead">
            Tambahkan dua gangguan sinusoid pada bin frekuensi yang diketahui, lalu ukur secara kuantitatif performa Gaussian notch filter dibandingkan Gaussian blur serta sensitivitas terhadap lebar sigma.
          </p>
        </div>
        <div className="telemetry-pill" aria-live="polite">
          {clean
            ? `${clean.width} x ${clean.height} px · (u1=${safeU1}, v1=${safeV1}) · (u2=${safeU2}, v2=${safeV2})`
            : 'Menunggu citra referensi'}
        </div>
      </div>

      <div className="panel section-stack" style={{ gap: '1rem' }}>
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <div>
            <h3 className="panel-title">Sumber citra bersih dan parameter gangguan</h3>
            <p className="panel-subtitle">
              u adalah jumlah siklus arah horizontal (x), v adalah jumlah siklus arah vertikal (y).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {loadingSource || running ? (
              <span className="busy-pill" role="status" aria-live="polite">
                {loadingSource ? 'Memuat citra...' : 'Menghitung eksperimen...'}
              </span>
            ) : null}
            <div className="btn-segmented" role="group" aria-label="Pilih sumber gambar referensi">
              <button
                type="button"
                className="btn btn-compact btn-toggle"
                aria-pressed={sourceMode === 'camera'}
                onClick={() => {
                  if (sourceMode === 'camera') return;
                  setErrorMessage(null);
                  setSourceMode('camera');
                }}
              >
                Contoh skimage.camera
              </button>
              <button
                type="button"
                className="btn btn-compact btn-toggle"
                aria-pressed={sourceMode === 'upload'}
                onClick={() => {
                  if (sourceMode === 'upload') return;
                  sourceSeqRef.current++;
                  setLoadingSource(false);
                  setErrorMessage(null);
                  setSourceMode('upload');
                  setClean(null);
                  setResult(null);
                }}
              >
                Upload gambar sendiri
              </button>
            </div>
          </div>
        </div>

        {sourceMode === 'upload' ? (
          <div className="file-dropzone">
            <label htmlFor={uploadId} className="file-dropzone-label">
              Upload gambar referensi bersih (PNG, JPG, WebP)
            </label>
            <input
              id={uploadId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="file-input"
              onChange={handleUploadClean}
            />
            <span className="file-dropzone-hint">
              {clean
                ? `Aktif: ${clean.name} (${clean.width} x ${clean.height} px${clean.wasResized ? `, diubah dari ${clean.originalWidth} x ${clean.originalHeight}` : ''})`
                : 'Belum ada gambar referensi diunggah.'}
            </span>
          </div>
        ) : null}

        <div className="chip-list" aria-label="Preset pasangan frekuensi sinusoid">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="btn btn-compact"
              onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="control-grid control-grid-4">
          <div className="field">
            <label htmlFor={u1Id} className="field-label">
              <span>Frekuensi u1 (x)</span>
              <span className="mono-value">1..{maxU}</span>
            </label>
            <input
              id={u1Id}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={u1Text}
              onChange={(e) => handleIntDraftChange(e.target.value, 1, maxU, setU1Text, setU1)}
              onBlur={() => setU1Text(String(safeU1))}
              className="number-input"
            />
          </div>

          <div className="field">
            <label htmlFor={v1Id} className="field-label">
              <span>Frekuensi v1 (y)</span>
              <span className="mono-value">-{maxV}..{maxV}</span>
            </label>
            <input
              id={v1Id}
              type="text"
              inputMode="numeric"
              pattern="-?[0-9]*"
              value={v1Text}
              onChange={(e) => handleIntDraftChange(e.target.value, -maxV, maxV, setV1Text, setV1)}
              onBlur={() => setV1Text(String(safeV1))}
              className="number-input"
            />
          </div>

          <div className="field">
            <label htmlFor={u2Id} className="field-label">
              <span>Frekuensi u2 (x)</span>
              <span className="mono-value">-{maxU}..{maxU}</span>
            </label>
            <input
              id={u2Id}
              type="text"
              inputMode="numeric"
              pattern="-?[0-9]*"
              value={u2Text}
              onChange={(e) => handleIntDraftChange(e.target.value, -maxU, maxU, setU2Text, setU2)}
              onBlur={() => setU2Text(String(safeU2))}
              className="number-input"
            />
          </div>

          <div className="field">
            <label htmlFor={v2Id} className="field-label">
              <span>Frekuensi v2 (y)</span>
              <span className="mono-value">1..{maxV}</span>
            </label>
            <input
              id={v2Id}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={v2Text}
              onChange={(e) => handleIntDraftChange(e.target.value, 1, maxV, setV2Text, setV2)}
              onBlur={() => setV2Text(String(safeV2))}
              className="number-input"
            />
          </div>

          <div className="field">
            <label htmlFor={amp1Id} className="field-label">
              <span>Amplitudo 1</span>
              <span className="mono-value">{amp1.toFixed(2)}</span>
            </label>
            <input
              id={amp1Id}
              type="range"
              min={0.01}
              max={0.25}
              step={0.01}
              value={amp1}
              onChange={(e) => setAmp1(Number(e.target.value))}
              className="range-input"
            />
          </div>

          <div className="field">
            <label htmlFor={amp2Id} className="field-label">
              <span>Amplitudo 2</span>
              <span className="mono-value">{amp2.toFixed(2)}</span>
            </label>
            <input
              id={amp2Id}
              type="range"
              min={0.01}
              max={0.25}
              step={0.01}
              value={amp2}
              onChange={(e) => setAmp2(Number(e.target.value))}
              className="range-input"
            />
          </div>

          <div className="field">
            <label htmlFor={notchSigmaId} className="field-label">
              <span>Sigma notch eksperimen</span>
              <span className="mono-value">{notchSigma.toFixed(1)}</span>
            </label>
            <input
              id={notchSigmaId}
              type="range"
              min={0.3}
              max={5.0}
              step={0.1}
              value={notchSigma}
              onChange={(e) => setNotchSigma(Number(e.target.value))}
              className="range-input"
            />
          </div>

          <div className="field">
            <label htmlFor={blurSigmaId} className="field-label">
              <span>Sigma Gaussian blur</span>
              <span className="mono-value">{blurSigma.toFixed(1)}</span>
            </label>
            <input
              id={blurSigmaId}
              type="range"
              min={0.1}
              max={5.0}
              step={0.1}
              value={blurSigma}
              onChange={(e) => setBlurSigma(Number(e.target.value))}
              className="range-input"
            />
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="status-banner status-banner-error" role="alert">
          <span className="status-prefix">GALAT</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span>{errorMessage}</span>
            {sourceMode === 'camera' && !clean ? (
              <button
                type="button"
                className="btn btn-compact"
                style={{ alignSelf: 'flex-start' }}
                onClick={loadCameraSample}
              >
                Coba muat ulang contoh camera
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {sourceMode === 'upload' && !clean && !loadingSource ? (
        <div className="empty-state">
          <h2>Menunggu gambar referensi bersih</h2>
          <p>
            Unggah gambar bersih (minimal 8 x 8 piksel) pada kotak di atas untuk menjalankan simulasi gangguan sinusoid, atau kembali ke sampel bawaan skimage.camera.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setErrorMessage(null);
              setSourceMode('camera');
            }}
          >
            Gunakan sampel skimage.camera
          </button>
        </div>
      ) : null}

      {clean && result ? (
        <>
          <div className="panel section-stack" style={{ gap: '1.25rem' }}>
            <div className="panel-header" style={{ marginBottom: 0 }}>
              <div>
                <h3 className="panel-title">Visualisasi hasil eksperimen ({clean.width} x {clean.height} px)</h3>
                <p className="panel-subtitle">
                  Pusat notch terhitung: {result.centers.map((c) => `(y=${c.y}, x=${c.x})`).join(', ')} beserta pasangan simetrisnya.
                </p>
              </div>
              <div className="btn-segmented" role="group" aria-label="Mode tampilan eksperimen">
                <button
                  type="button"
                  className="btn btn-compact btn-toggle"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                >
                  Grid 6 panel
                </button>
                <button
                  type="button"
                  className="btn btn-compact btn-toggle"
                  aria-pressed={viewMode === 'split'}
                  onClick={() => setViewMode('split')}
                >
                  Pemisah geser + spektrum
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              <div className="image-grid-3">
                <CanvasFigure title="1. Referensi bersih" data={clean.data} width={clean.width} height={clean.height} />
                <CanvasFigure
                  title="2. Setelah diberi gangguan"
                  note={`u1=${safeU1}, v1=${safeV1}; u2=${safeU2}, v2=${safeV2}`}
                  data={result.noisy}
                  width={clean.width}
                  height={clean.height}
                />
                <CanvasFigure
                  title="3. Spektrum FFT 2D"
                  note="log(1 + |F|)"
                  data={result.spectrum}
                  width={clean.width}
                  height={clean.height}
                  mode="inferno"
                  autoScale
                />
                <CanvasFigure
                  title="4. Mask notch"
                  note={`sigma=${notchSigma.toFixed(1)}`}
                  data={result.mask}
                  width={clean.width}
                  height={clean.height}
                />
                <CanvasFigure
                  title="5. Gaussian blur"
                  note={`sigma=${blurSigma.toFixed(1)}`}
                  data={result.blurred}
                  width={clean.width}
                  height={clean.height}
                />
                <CanvasFigure
                  title="6. Hasil notch filter"
                  note={`PSNR ${formatPsnr(result.metrics.notchFilter.psnrDb)}`}
                  data={result.restored}
                  width={clean.width}
                  height={clean.height}
                />
              </div>
            ) : (
              <div className="workbench-split">
                <div className="section-stack" style={{ gap: '0.75rem' }}>
                  <div className="btn-segmented" role="group" aria-label="Pembanding sisi kiri">
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={splitLeft === 'noisy'}
                      onClick={() => setSplitLeft('noisy')}
                    >
                      Kiri: Setelah gangguan
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={splitLeft === 'blurred'}
                      onClick={() => setSplitLeft('blurred')}
                    >
                      Kiri: Gaussian blur
                    </button>
                  </div>
                  <ComparisonViewer
                    leftLabel={splitLeft === 'noisy' ? 'Setelah gangguan' : 'Gaussian blur'}
                    leftData={splitLeft === 'noisy' ? result.noisy : result.blurred}
                    rightLabel="Hasil notch filter"
                    rightData={result.restored}
                    width={clean.width}
                    height={clean.height}
                  />
                </div>
                <SpectrumCanvas
                  spectrum={result.spectrum}
                  filteredSpectrum={result.filteredSpectrum}
                  width={clean.width}
                  height={clean.height}
                  centers={result.centers}
                  sigma={notchSigma}
                  interactive={false}
                />
              </div>
            )}

            <div>
              <h3 className="panel-title" style={{ marginBottom: '0.6rem' }}>
                Hasil pengukuran PSNR dan SSIM
              </h3>
              <MetricsTable metrics={result.metrics} />
            </div>

            <div className="export-bar">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDownloadExperimentCsv}
              >
                Unduh CSV hasil eksperimen
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadArrayAsPng(result.noisy, clean.width, clean.height, '02_gambar_terganggu.png', 'gray')
                }
              >
                Unduh gambar terganggu (PNG)
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadArrayAsPng(result.restored, clean.width, clean.height, '04_hasil_notch.png', 'gray')
                }
              >
                Unduh hasil notch (PNG)
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  downloadArrayAsPng(result.mask, clean.width, clean.height, '05_notch_mask.png', 'gray')
                }
              >
                Unduh mask (PNG)
              </button>
            </div>
          </div>

          <div className="panel section-stack" style={{ gap: '1rem' }}>
            <SigmaChart
              sweep={result.sweep}
              activeSigma={notchSigma}
              onSelectSigma={(val) => setNotchSigma(val)}
            />

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Sigma</th>
                    <th scope="col">PSNR (dB)</th>
                    <th scope="col">SSIM</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sweep.map((row) => {
                    const isCurrent = Math.abs(row.sigma - notchSigma) < 0.05;
                    return (
                      <tr key={row.sigma} className={isCurrent ? 'row-highlight' : undefined}>
                        <td className="num">{row.sigma.toFixed(1)}</td>
                        <td className="num">{formatPsnr(row.psnrDb)}</td>
                        <td className="num">{formatSsim(row.ssim, 6)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="export-bar" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={handleDownloadSweepCsv}>
                Unduh CSV sensitivitas sigma
              </button>
              <p className="panel-subtitle" style={{ margin: 0, maxWidth: '64ch' }}>
                Catatan: eksperimen sintetis memakai koordinat frekuensi yang sudah diketahui. Performa ini tidak otomatis mewakili foto nyata dengan puncak gangguan yang belum diketahui.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
