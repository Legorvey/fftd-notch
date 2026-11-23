import { useRef, useState, type RefObject } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../motion/tokens';

interface GuideTabProps {
  onTrySample?: () => void;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  reducedMotion?: boolean;
}

interface GuideStep {
  id: number;
  title: string;
  summary: string;
  detail: string;
}

const GUIDE_STEPS: ReadonlyArray<GuideStep> = [
  {
    id: 1,
    title: 'Pola periodik di domain spasial',
    summary: 'Garis atau kisi berulang muncul merata di atas citra asli.',
    detail:
      'Gangguan seperti interferensi listrik, pola moire, atau garis pemindaian bersifat periodik dalam ruang (x, y).',
  },
  {
    id: 2,
    title: 'FFT 2D mengungkap pasangan puncak',
    summary: 'Transformasi Fourier mengubah pola berulang menjadi titik terang terlokalisasi.',
    detail:
      'Pada skala log(1 + |F|), setiap komponen sinusoid (u, v) tampak sebagai sepasang puncak simetris terhadap pusat DC (floor(H/2), floor(W/2)).',
  },
  {
    id: 3,
    title: 'Pemilihan notch menekan puncak target',
    summary: 'Mask Gaussian notch-reject melemahkan energi hanya di sekitar puncak gangguan.',
    detail:
      'Ketika Anda memilih satu titik (cy, cx), pasangan konjugatnya otomatis ikut ditekan agar hasil rekonstruksi tetap bernilai real.',
  },
  {
    id: 4,
    title: 'IFFT merekonstruksi citra',
    summary: 'Spektrum terfilter dikembalikan ke domain spasial.',
    detail:
      'Karena hanya bin frekuensi gangguan yang ditekan, tepi dan tekstur citra di luar puncak tetap jauh lebih tajam dibanding Gaussian blur.',
  },
  {
    id: 5,
    title: 'Sigma mengatur kompromi',
    summary: 'Lebar notch (sigma) menyeimbangkan penghapusan gangguan vs detail asli.',
    detail:
      'Sigma terlalu kecil meninggalkan sisa garis; sigma terlalu besar ikut meredam struktur citra dan dapat menimbulkan efek ringing.',
  },
  {
    id: 6,
    title: 'Referensi untuk metrik PSNR & SSIM',
    summary: 'Evaluasi kuantitatif memerlukan citra bersih berukuran identik.',
    detail:
      'Tanpa referensi bersih (seperti sampel Boy Noisy), aplikasi tetap menyediakan evaluasi visual before/after dan ekspor citra.',
  },
];

export function GuideTab({
  onTrySample,
  scrollContainerRef,
  reducedMotion = false,
}: GuideTabProps) {
  const [activeStep, setActiveStep] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    container: scrollContainerRef,
    offset: ['start start', 'end start'],
  });
  const diagramY = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [0, -18]);
  const current = GUIDE_STEPS[activeStep] ?? GUIDE_STEPS[0]!;

  return (
    <section
      id="panel-guide"
      role="tabpanel"
      aria-labelledby="tab-guide"
      className="section-stack"
    >
      <div ref={heroRef} className="workspace-hero">
        <div>
          <h2 className="page-heading">Petunjuk penggunaan dan dasar teori FFT 2D Notch</h2>
          <p className="page-lead">
            Alur visual bertahap, konvensi koordinat spektrum, persamaan Gaussian notch-reject mask, serta batasan metode untuk proyek Pemrosesan Sinyal Digital Kelompok H, Universitas Padjadjaran.
          </p>
        </div>
        {onTrySample ? (
          <button type="button" className="btn btn-primary" onClick={onTrySample}>
            Coba pada sampel
          </button>
        ) : (
          <div className="telemetry-pill">Dokumentasi Teknis</div>
        )}
      </div>

      <div className="panel section-stack stack-md">
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <div>
            <h3 className="panel-title">Alur kerja pemulihan dalam 6 tahap</h3>
            <p className="panel-subtitle">
              Pilih tahap untuk memahami bagaimana gangguan periodik dipisahkan dari detail citra.
            </p>
          </div>
          <span className="mono-value">
            Tahap {current.id} / {GUIDE_STEPS.length}
          </span>
        </div>

        <div className="guide-stepper" role="tablist" aria-label="Tahapan pemrosesan FFT 2D Notch">
          {GUIDE_STEPS.map((step, idx) => (
            <button
              key={step.id}
              type="button"
              role="tab"
              aria-selected={activeStep === idx}
              className={`guide-step-btn${activeStep === idx ? ' is-active' : ''}`}
              onClick={() => setActiveStep(idx)}
            >
              <span className="mono-value">0{step.id}</span>
              <span>{step.title}</span>
            </button>
          ))}
        </div>

        <motion.div
          key={current.id}
          className="guide-step-detail"
          style={{ y: diagramY }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION_DURATION.state, ease: MOTION_EASE.reveal }}
        >
          <div>
            <h4 className="guide-step-heading">
              {current.id}. {current.title}
            </h4>
            <p className="guide-step-summary">{current.summary}</p>
            <p className="guide-step-body">{current.detail}</p>
          </div>
          <div className="guide-step-nav">
            <button
              type="button"
              className="btn btn-compact"
              disabled={activeStep === 0}
              onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            >
              Sebelumnya
            </button>
            <button
              type="button"
              className="btn btn-compact btn-primary"
              disabled={activeStep === GUIDE_STEPS.length - 1}
              onClick={() => setActiveStep((s) => Math.min(GUIDE_STEPS.length - 1, s + 1))}
            >
              Berikutnya
            </button>
          </div>
        </motion.div>
      </div>

      <div className="guide-grid">
        <article className="panel">
          <h3 className="panel-title">Cocok untuk</h3>
          <ul className="guide-list">
            <li>
              <strong>Garis atau pola periodik</strong> (interferensi sinusoid, pola garis pemindaian, moire berulang).
            </li>
            <li>
              <strong>Citra grayscale / warna</strong> dalam format PNG, JPG, WebP, atau Netpbm PGM hingga batas proses 2048 px (default 1024 px, batas unggah 20 MiB).
            </li>
            <li>
              <strong>Eksperimen praktikum</strong> untuk membandingkan notch filter domain frekuensi terhadap Gaussian blur spasial.
            </li>
          </ul>
        </article>

        <article className="panel">
          <h3 className="panel-title">Bukan sasaran metode</h3>
          <ul className="guide-list">
            <li>
              <strong>Blur optik / motion blur</strong>: kekaburan lensa bukan puncak periodik terisolasi di spektrum.
            </li>
            <li>
              <strong>Noise acak (Gaussian / salt-and-pepper)</strong>: energinya menyebar luas di seluruh frekuensi, bukan pada pasangan puncak sempit.
            </li>
            <li>
              <strong>Bukan pemrosesan AI generatif</strong>: seluruh deteksi kandidat dan otomatis menggunakan algoritma deterministik berbasis jendela Hann dan MAD Z-score.
            </li>
          </ul>
        </article>

        <article className="panel">
          <h3 className="panel-title">Konvensi koordinat dan simetri konjugat</h3>
          <ul className="guide-list">
            <li>
              <strong>Sumbu horizontal (x)</strong> adalah kolom spektrum; <strong>sumbu vertikal (y)</strong> adalah baris spektrum setelah <code>fftshift</code>.
            </li>
            <li>
              <strong>Pusat DC (frekuensi nol)</strong> berada pada koordinat <code>(floor(H / 2), floor(W / 2))</code> yang ditandai simbol <code>+</code> berwarna sian. Hindari menaruh notch tepat di pusat DC.
            </li>
            <li>
              <strong>Simetri konjugat</strong>: setiap puncak pada <code>(cy, cx)</code> otomatis dipasangkan dengan <code>((2*dc_y - cy) mod H, (2*dc_x - cx) mod W)</code>.
            </li>
            <li>
              <strong>Hubungan frekuensi sinusoid (u, v)</strong>: muncul pada bin <code>(dc_y + v, dc_x + u)</code> dan pasangannya <code>(dc_y - v, dc_x - u)</code>.
            </li>
          </ul>
        </article>

        <article className="panel">
          <h3 className="panel-title">Formulasi Gaussian Notch-Reject Mask</h3>
          <p className="panel-subtitle">
            Untuk setiap titik notch <code>(p_y, p_x)</code> beserta pasangan simetrisnya dan lebar <code>sigma &gt; 0</code>:
          </p>
          <pre className="formula-block">
{`H(y, x) = Π [ 1 - exp(-(dy^2 + dx^2) / (2 * sigma^2)) ]
I_restored = Re(IFFT2(ifftshift(F_shift * H)))`}
          </pre>
          <p className="panel-subtitle">
            dengan <code>dy</code> dan <code>dx</code> adalah jarak periodik pada domain frekuensi. Seluruh komputasi berjalan lokal dalam presisi <code>Float64</code> di Web Worker.
          </p>
        </article>
      </div>
    </section>
  );
}
