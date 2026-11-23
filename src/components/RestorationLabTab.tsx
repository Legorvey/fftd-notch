import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { downloadArrayAsPng, downloadCsv } from '../dsp/colormap';
import { periodicDistance, symmetricCenter } from '../dsp/notch';
import type { PeakCandidate, Point2D, RestorationOutput } from '../dsp/types';
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
import { SpectrumCanvas } from './SpectrumCanvas';

function sameOrSymmetric(
  a: Point2D,
  b: Point2D,
  width: number,
  height: number,
  tolerance = 0,
): boolean {
  const sym = symmetricCenter(width, height, b);
  const d1 = Math.hypot(
    periodicDistance(a.y, b.y, height),
    periodicDistance(a.x, b.x, width),
  );
  const d2 = Math.hypot(
    periodicDistance(a.y, sym.y, height),
    periodicDistance(a.x, sym.x, width),
  );
  return d1 <= tolerance || d2 <= tolerance;
}

export function RestorationLabTab() {
  const [corrupted, setCorrupted] = useState<LoadedImageResult | null>(null);
  const [reference, setReference] = useState<LoadedImageResult | null>(null);
  const [limitResolution, setLimitResolution] = useState(true);

  const [spectrum, setSpectrum] = useState<Float64Array | null>(null);
  const [candidates, setCandidates] = useState<PeakCandidate[]>([]);
  const [centers, setCenters] = useState<Point2D[]>([]);

  const [manualYText, setManualYText] = useState('0');
  const [manualXText, setManualXText] = useState('0');
  const [notchSigma, setNotchSigma] = useState(1.0);
  const [blurSigma, setBlurSigma] = useState(1.2);

  const [output, setOutput] = useState<RestorationOutput | null>(null);
  const [displayMode, setDisplayMode] = useState<'split' | 'grid'>('split');
  const [compareBaseline, setCompareBaseline] = useState<'noisy' | 'blurred'>('noisy');

  const [analyzing, setAnalyzing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const sourceSeqRef = useRef(0);
  const analyzeSeqRef = useRef(0);
  const restoreSeqRef = useRef(0);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  const corruptedInputId = useId();
  const referenceInputId = useId();
  const limitCheckboxId = useId();
  const manualYId = useId();
  const manualXId = useId();
  const sigmaId = useId();
  const blurSigmaId = useId();

  const analyzeImage = useCallback(async (img: LoadedImageResult, initialCenters: Point2D[] = []) => {
    const seq = ++analyzeSeqRef.current;
    // Invalidate any pending restore immediately when switching images.
    restoreSeqRef.current++;
    setAnalyzing(true);
    setRestoring(false);
    setErrorMessage(null);
    setOutput(null);
    setSpectrum(null);
    setCandidates([]);
    setCenters(initialCenters);
    setManualYText(String(Math.min(img.height - 1, Math.floor(img.height / 2) + 20)));
    setManualXText(String(Math.min(img.width - 1, Math.floor(img.width / 2) + 20)));

    try {
      const res = await dspClient.analyzeLabImage(img.width, img.height, img.data, 12);
      if (seq !== analyzeSeqRef.current) return;
      setSpectrum(res.spectrum);
      setCandidates(res.candidates);
    } catch (err) {
      if (seq !== analyzeSeqRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menghitung spektrum FFT 2D.');
    } finally {
      if (seq === analyzeSeqRef.current) setAnalyzing(false);
    }
  }, []);

  const handleLoadSample = async () => {
    const loadSeq = ++sourceSeqRef.current;
    setErrorMessage(null);
    setReferenceError(null);
    setAnalyzing(true);
    try {
      const [noisySample, cleanSample] = await Promise.all([
        loadImageFromUrl('/samples/camera_periodic.png', 'camera_periodic.png', null),
        loadImageFromUrl('/samples/camera.png', 'camera.png', null),
      ]);
      if (loadSeq !== sourceSeqRef.current) return;
      setCorrupted(noisySample);
      setReference(cleanSample);
      if (referenceInputRef.current) referenceInputRef.current.value = '';
      await analyzeImage(noisySample, [
        { y: 256, x: 280 },
        { y: 288, x: 256 },
      ]);
    } catch (err) {
      if (loadSeq !== sourceSeqRef.current) return;
      setAnalyzing(false);
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat sampel gambar bawaan.');
    }
  };

  const handleCorruptedUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const loadSeq = ++sourceSeqRef.current;
    setErrorMessage(null);
    try {
      const loaded = await loadImageFromFile(file, limitResolution ? DEFAULT_MAX_DIMENSION : null);
      if (loadSeq !== sourceSeqRef.current) return;
      setCorrupted(loaded);
      if (reference && (reference.width !== loaded.width || reference.height !== loaded.height)) {
        setReferenceError(
          `Ukuran referensi (${reference.width} x ${reference.height}) berbeda dari gambar input (${loaded.width} x ${loaded.height}). Unggah referensi berukuran sama untuk menghitung PSNR dan SSIM.`,
        );
      } else {
        setReferenceError(null);
      }
      await analyzeImage(loaded, []);
    } catch (err) {
      if (loadSeq !== sourceSeqRef.current) return;
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membaca berkas input.');
    }
  };

  const handleReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setReferenceError(null);
    try {
      const maxDim = limitResolution ? DEFAULT_MAX_DIMENSION : null;
      const loaded = await loadImageFromFile(file, maxDim);
      setReference(loaded);
      if (corrupted && (loaded.width !== corrupted.width || loaded.height !== corrupted.height)) {
        setReferenceError(
          `Ukuran referensi (${loaded.width} x ${loaded.height}) berbeda dari input (${corrupted.width} x ${corrupted.height}). Samakan ukuran kedua gambar agar PSNR dan SSIM valid.`,
        );
      }
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : 'Gagal membaca gambar referensi.');
    }
  };

  // Run notch filter restoration in Web Worker with unconditional sequence invalidation.
  useEffect(() => {
    const seq = ++restoreSeqRef.current;

    if (!corrupted || !spectrum || centers.length === 0) {
      setOutput(null);
      setRestoring(false);
      return () => {
        restoreSeqRef.current++;
      };
    }

    const matchingReference =
      reference &&
      reference.width === corrupted.width &&
      reference.height === corrupted.height
        ? reference.data
        : null;

    setRestoring(true);
    setErrorMessage(null);

    const timer = window.setTimeout(async () => {
      try {
        const res = await dspClient.restoreLab({
          width: corrupted.width,
          height: corrupted.height,
          corrupted: corrupted.data,
          reference: matchingReference,
          centers,
          notchSigma,
          blurSigma,
        });
        if (seq !== restoreSeqRef.current) return;
        setOutput(res);
      } catch (err) {
        if (seq !== restoreSeqRef.current || err instanceof SupersededRequestError) return;
        setErrorMessage(err instanceof Error ? err.message : 'Gagal menjalankan notch filter.');
      } finally {
        if (seq === restoreSeqRef.current) setRestoring(false);
      }
    }, 30);

    return () => {
      restoreSeqRef.current++;
      window.clearTimeout(timer);
    };
  }, [corrupted, reference, spectrum, centers, notchSigma, blurSigma]);

  const togglePointOnSpectrum = (pt: Point2D) => {
    if (!corrupted) return;
    const hitTolerance = Math.max(5, Math.round(Math.min(corrupted.width, corrupted.height) * 0.015));
    setCenters((prev) => {
      const idx = prev.findIndex((existing) =>
        sameOrSymmetric(existing, pt, corrupted.width, corrupted.height, hitTolerance),
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, pt];
    });
  };

  const toggleCandidatePoint = (cand: PeakCandidate) => {
    if (!corrupted) return;
    setCenters((prev) => {
      const idx = prev.findIndex((existing) =>
        sameOrSymmetric(existing, cand, corrupted.width, corrupted.height, 0),
      );
      if (idx >= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      return [...prev, { y: cand.y, x: cand.x }];
    });
  };

  const handleAddManualPoint = (event: FormEvent) => {
    event.preventDefault();
    if (!corrupted) return;
    const parsedY = Number.parseInt(manualYText, 10);
    const parsedX = Number.parseInt(manualXText, 10);
    if (!Number.isFinite(parsedY) || !Number.isFinite(parsedX)) {
      setErrorMessage('Koordinat baris (y) dan kolom (x) harus berupa angka bulat yang valid.');
      return;
    }
    setErrorMessage(null);
    const clampedY = Math.min(corrupted.height - 1, Math.max(0, parsedY));
    const clampedX = Math.min(corrupted.width - 1, Math.max(0, parsedX));
    setManualYText(String(clampedY));
    setManualXText(String(clampedX));
    const pt = { y: clampedY, x: clampedX };
    setCenters((prev) => {
      if (prev.some((existing) => sameOrSymmetric(existing, pt, corrupted.width, corrupted.height, 0))) {
        return prev;
      }
      return [...prev, pt];
    });
  };

  const hasNearDcCenter =
    corrupted !== null &&
    centers.some((pt) => {
      const dcY = Math.floor(corrupted.height / 2);
      const dcX = Math.floor(corrupted.width / 2);
      return Math.hypot(pt.y - dcY, pt.x - dcX) <= 3;
    });

  const handleDownloadMetricsCsv = () => {
    if (!output?.metrics) return;
    downloadCsv(
      ['Metode', 'PSNR_dB', 'SSIM'],
      [
        ['Tanpa perbaikan', output.metrics.noCorrection.psnrDb, output.metrics.noCorrection.ssim],
        ['Gaussian blur', output.metrics.gaussianBlur.psnrDb, output.metrics.gaussianBlur.ssim],
        ['Notch filter', output.metrics.notchFilter.psnrDb, output.metrics.notchFilter.ssim],
      ],
      'metrik_restoration.csv',
    );
  };

  return (
    <section
      id="panel-lab"
      role="tabpanel"
      aria-labelledby="tab-lab"
      className="section-stack"
    >
      <div>
        <h2 className="page-heading">Pemulihan citra dengan pola gangguan periodik</h2>
        <p className="page-lead">
          Unggah gambar yang memiliki garis atau pola berulang, lalu klik puncak terang pada spektrum FFT 2D atau pilih kandidat semi-otomatis untuk menerapkan Gaussian notch filter.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Sumber citra</h3>
            <p className="panel-subtitle">
              Seluruh pemrosesan FFT 2D berjalan lokal di browser Anda tanpa mengirim gambar ke server.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {analyzing ? (
              <span className="busy-pill" role="status" aria-live="polite">
                Menghitung FFT 2D...
              </span>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={handleLoadSample}>
              Muat sampel Camera + gangguan
            </button>
          </div>
        </div>

        <div className="upload-grid">
          <div className="file-dropzone">
            <label htmlFor={corruptedInputId} className="file-dropzone-label">
              Gambar terganggu (PNG, JPG, WebP)
            </label>
            <input
              id={corruptedInputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="file-input"
              onChange={handleCorruptedUpload}
            />
            <span className="file-dropzone-hint">
              {corrupted
                ? `Aktif: ${corrupted.name} (${corrupted.width} x ${corrupted.height} px${corrupted.wasResized ? `, diubah dari ${corrupted.originalWidth} x ${corrupted.originalHeight}` : ''})`
                : 'Belum ada berkas dipilih.'}
            </span>
          </div>

          <div className="file-dropzone">
            <label htmlFor={referenceInputId} className="file-dropzone-label">
              Referensi bersih (opsional, untuk PSNR dan SSIM)
            </label>
            <input
              ref={referenceInputRef}
              id={referenceInputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="file-input"
              onChange={handleReferenceUpload}
            />
            <span className="file-dropzone-hint">
              {reference
                ? `Referensi: ${reference.name} (${reference.width} x ${reference.height} px)`
                : 'Unggah gambar bersih berukuran sama bila ingin mengukur PSNR dan SSIM.'}
            </span>
            {reference ? (
              <button
                type="button"
                className="btn btn-compact"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => {
                  setReference(null);
                  setReferenceError(null);
                  if (referenceInputRef.current) referenceInputRef.current.value = '';
                }}
              >
                Hapus referensi
              </button>
            ) : null}
          </div>
        </div>

        <div className="checkbox-row">
          <input
            id={limitCheckboxId}
            type="checkbox"
            checked={limitResolution}
            onChange={(e) => setLimitResolution(e.target.checked)}
          />
          <label htmlFor={limitCheckboxId}>
            Batasi sisi maksimum unggahan baru hingga {DEFAULT_MAX_DIMENSION} px agar komputasi FFT 2D tetap responsif di browser (batas mutlak 2048 px)
          </label>
        </div>
      </div>

      {errorMessage ? (
        <div className="status-banner status-banner-error" role="alert">
          <span className="status-prefix">GALAT</span>
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {referenceError ? (
        <div className="status-banner status-banner-warning" role="alert">
          <span className="status-prefix">PERINGATAN</span>
          <span>{referenceError}</span>
        </div>
      ) : null}

      {!corrupted && !analyzing ? (
        <div className="empty-state">
          <h2>Belum ada gambar yang dimuat</h2>
          <p>
            Pilih gambar dengan gangguan garis periodik dari perangkat Anda, atau klik tombol di bawah untuk langsung menguji sampel citra Camera 512 x 512 beserta referensi bersihnya.
          </p>
          <button type="button" className="btn btn-primary" onClick={handleLoadSample}>
            Muat sampel Camera + gangguan
          </button>
        </div>
      ) : null}

      {corrupted && spectrum ? (
        <>
          <div className="workbench-split">
            <div className="panel">
              <SpectrumCanvas
                spectrum={spectrum}
                filteredSpectrum={output?.filteredSpectrum ?? null}
                width={corrupted.width}
                height={corrupted.height}
                centers={centers}
                candidates={candidates}
                sigma={notchSigma}
                interactive
                onTogglePoint={togglePointOnSpectrum}
              />
            </div>

            <div className="panel section-stack" style={{ gap: '1.15rem' }}>
              <div>
                <h3 className="panel-title">Kontrol titik notch dan lebar filter</h3>
                <p className="panel-subtitle">
                  Satu titik (baris y, kolom x) otomatis dipasangkan dengan koordinat simetrisnya terhadap pusat DC.
                </p>
              </div>

              <form onSubmit={handleAddManualPoint} className="control-grid">
                <div className="field">
                  <label htmlFor={manualYId} className="field-label">
                    <span>Baris (y)</span>
                    <span className="mono-value">0..{corrupted.height - 1}</span>
                  </label>
                  <input
                    id={manualYId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={manualYText}
                    onChange={(e) => setManualYText(e.target.value)}
                    className="number-input"
                  />
                </div>
                <div className="field">
                  <label htmlFor={manualXId} className="field-label">
                    <span>Kolom (x)</span>
                    <span className="mono-value">0..{corrupted.width - 1}</span>
                  </label>
                  <input
                    id={manualXId}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={manualXText}
                    onChange={(e) => setManualXText(e.target.value)}
                    className="number-input"
                  />
                </div>
                <button type="submit" className="btn btn-primary">
                  Tambah titik manual
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={centers.length === 0}
                  onClick={() => setCenters([])}
                >
                  Hapus semua titik ({centers.length})
                </button>
              </form>

              {hasNearDcCenter ? (
                <div className="status-banner status-banner-warning" role="status">
                  <span className="status-prefix">PERINGATAN</span>
                  <span>
                    Salah satu titik notch berada sangat dekat dengan pusat DC. Menekan komponen DC akan menurunkan kecerahan rata-rata seluruh citra.
                  </span>
                </div>
              ) : null}

              <div>
                <div className="field-label" style={{ marginBottom: '0.45rem' }}>
                  <span>Titik notch aktif</span>
                  <span className="mono-value">{centers.length} pasang</span>
                </div>
                {centers.length === 0 ? (
                  <p className="panel-subtitle" style={{ marginTop: 0 }}>
                    Belum ada titik aktif. Klik puncak pada spektrum, tambahkan koordinat manual, atau pilih kandidat di bawah.
                  </p>
                ) : (
                  <div className="chip-list">
                    {centers.map((pt) => (
                      <button
                        key={`${pt.y}-${pt.x}`}
                        type="button"
                        className="notch-chip notch-chip-active"
                        aria-label={`Hapus titik notch y=${pt.y}, x=${pt.x}`}
                        onClick={() =>
                          setCenters((prev) =>
                            prev.filter((item) => item.y !== pt.y || item.x !== pt.x),
                          )
                        }
                      >
                        <span>
                          (y={pt.y}, x={pt.x})
                        </span>
                        <span aria-hidden="true">x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="field-label" style={{ marginBottom: '0.35rem' }}>
                  <span>Kandidat puncak semi-otomatis</span>
                  <span className="mono-value">{candidates.length} ditemukan</span>
                </div>
                <p className="panel-subtitle" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                  Periksa lokasi kandidat pada spektrum sebelum mengaktifkannya; tidak semua puncak berasal dari gangguan.
                </p>
                {candidates.length === 0 ? (
                  <p className="panel-subtitle" style={{ marginTop: 0 }}>
                    Tidak ada kandidat puncak di atas persentil 99.5 di luar radius DC.
                  </p>
                ) : (
                  <div className="chip-list">
                    {candidates.map((cand) => {
                      const active = centers.some((pt) =>
                        sameOrSymmetric(pt, cand, corrupted.width, corrupted.height, 0),
                      );
                      return (
                        <button
                          key={`${cand.y}-${cand.x}`}
                          type="button"
                          className={`notch-chip${active ? ' notch-chip-active' : ''}`}
                          aria-pressed={active}
                          onClick={() => toggleCandidatePoint(cand)}
                        >
                          <span>
                            y={cand.y}, x={cand.x}
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {cand.value.toFixed(1)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="control-grid">
                <div className="field">
                  <label htmlFor={sigmaId} className="field-label">
                    <span>Lebar notch (sigma)</span>
                    <span className="mono-value">{notchSigma.toFixed(1)}</span>
                  </label>
                  <input
                    id={sigmaId}
                    type="range"
                    min={0.3}
                    max={10.0}
                    step={0.1}
                    value={notchSigma}
                    onChange={(e) => setNotchSigma(Number(e.target.value))}
                    className="range-input"
                  />
                </div>
                <div className="field">
                  <label htmlFor={blurSigmaId} className="field-label">
                    <span>Sigma Gaussian blur pembanding</span>
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
          </div>

          {centers.length === 0 ? (
            <div className="status-banner status-banner-warning" role="status">
              <span className="status-prefix">INFO</span>
              <span>
                Pilih minimal satu titik notch pada spektrum, koordinat manual, atau daftar kandidat untuk melihat hasil restorasi.
              </span>
            </div>
          ) : null}

          {output ? (
            <div className="panel section-stack" style={{ gap: '1.25rem' }}>
              <div className="panel-header" style={{ marginBottom: 0 }}>
                <div>
                  <h3 className="panel-title">Hasil pemulihan dan perbandingan</h3>
                  <p className="panel-subtitle">
                    Bandingkan langsung hasil Gaussian notch filter terhadap input terganggu dan metode pembanding Gaussian blur.
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {restoring ? (
                    <span className="busy-pill" role="status" aria-live="polite">
                      Memperbarui IFFT 2D...
                    </span>
                  ) : null}
                  <div className="btn-segmented" role="group" aria-label="Mode tampilan hasil">
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={displayMode === 'split'}
                      onClick={() => setDisplayMode('split')}
                    >
                      Pemisah geser
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={displayMode === 'grid'}
                      onClick={() => setDisplayMode('grid')}
                    >
                      Grid 4 panel
                    </button>
                  </div>
                </div>
              </div>

              {displayMode === 'split' ? (
                <div className="section-stack" style={{ gap: '0.75rem' }}>
                  <div className="btn-segmented" role="group" aria-label="Citra pembanding sisi kiri">
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={compareBaseline === 'noisy'}
                      onClick={() => setCompareBaseline('noisy')}
                    >
                      Kiri: Input terganggu
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-toggle"
                      aria-pressed={compareBaseline === 'blurred'}
                      onClick={() => setCompareBaseline('blurred')}
                    >
                      Kiri: Gaussian blur
                    </button>
                  </div>
                  <div style={{ maxWidth: '680px', width: '100%' }}>
                    <ComparisonViewer
                      leftLabel={compareBaseline === 'noisy' ? 'Input terganggu' : 'Gaussian blur'}
                      leftData={compareBaseline === 'noisy' ? corrupted.data : output.blurred}
                      rightLabel="Hasil notch filter"
                      rightData={output.restored}
                      width={corrupted.width}
                      height={corrupted.height}
                    />
                  </div>
                </div>
              ) : (
                <div className="image-grid-2">
                  <CanvasFigure
                    title="Input terganggu"
                    data={corrupted.data}
                    width={corrupted.width}
                    height={corrupted.height}
                  />
                  <CanvasFigure
                    title="Gaussian blur"
                    note={`sigma=${blurSigma.toFixed(1)}`}
                    data={output.blurred}
                    width={corrupted.width}
                    height={corrupted.height}
                  />
                  <CanvasFigure
                    title="Notch mask"
                    note={`${centers.length} pasang, sigma=${notchSigma.toFixed(1)}`}
                    data={output.mask}
                    width={corrupted.width}
                    height={corrupted.height}
                  />
                  <CanvasFigure
                    title="Hasil notch filter"
                    data={output.restored}
                    width={corrupted.width}
                    height={corrupted.height}
                  />
                </div>
              )}

              <div>
                <h3 className="panel-title" style={{ marginBottom: '0.6rem' }}>
                  Metrik kualitas citra
                </h3>
                {output.metrics ? (
                  <MetricsTable metrics={output.metrics} />
                ) : (
                  <div className="status-banner status-banner-info">
                    <span className="status-prefix">INFO</span>
                    <span>
                      PSNR dan SSIM belum ditampilkan karena gambar referensi bersih berukuran sama belum diunggah.
                    </span>
                  </div>
                )}
              </div>

              <div className="export-bar" aria-label="Unduh hasil restorasi">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    downloadArrayAsPng(
                      output.restored,
                      corrupted.width,
                      corrupted.height,
                      'hasil_notch.png',
                      'gray',
                    )
                  }
                >
                  Unduh hasil notch (PNG)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    downloadArrayAsPng(
                      output.mask,
                      corrupted.width,
                      corrupted.height,
                      'notch_mask.png',
                      'gray',
                    )
                  }
                >
                  Unduh mask (PNG)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    downloadArrayAsPng(
                      spectrum,
                      corrupted.width,
                      corrupted.height,
                      'spektrum_fft.png',
                      'inferno',
                      true,
                    )
                  }
                >
                  Unduh spektrum (PNG)
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    downloadArrayAsPng(
                      output.blurred,
                      corrupted.width,
                      corrupted.height,
                      'gaussian_blur.png',
                      'gray',
                    )
                  }
                >
                  Unduh Gaussian blur (PNG)
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!output.metrics}
                  onClick={handleDownloadMetricsCsv}
                >
                  Unduh CSV metrik
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
