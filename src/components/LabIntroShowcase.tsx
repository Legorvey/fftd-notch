import { useRef, type DragEvent } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { MOTION_DURATION, MOTION_EASE } from '../motion/tokens';

interface LabIntroShowcaseProps {
  analyzing: boolean;
  onLoadCameraSample: () => void;
  onLoadBoySample: () => void;
  onTriggerUpload: () => void;
  onOpenGuide: () => void;
  onDropCorrupted: (event: DragEvent<HTMLDivElement>) => void;
  isDragOver: boolean;
  onDragOverChange: (over: boolean) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  reducedMotion: boolean;
}

export function LabIntroShowcase({
  analyzing,
  onLoadCameraSample,
  onLoadBoySample,
  onTriggerUpload,
  onOpenGuide,
  onDropCorrupted,
  isDragOver,
  onDragOverChange,
  scrollContainerRef,
  reducedMotion,
}: LabIntroShowcaseProps) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    container: scrollContainerRef,
    offset: ['start start', 'end start'],
  });

  const gridY = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [0, 14]);
  const spectrumY = useTransform(scrollYProgress, [0, 1], reducedMotion ? [0, 0] : [0, -24]);

  return (
    <div
      ref={sectionRef}
      className={`intro-showcase${isDragOver ? ' is-drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverChange(true);
      }}
      onDragLeave={() => onDragOverChange(false)}
      onDrop={onDropCorrupted}
    >
      <motion.div className="intro-grid-bg" style={{ y: gridY }} aria-hidden="true" />

      <div className="intro-layout">
        <motion.div
          className="intro-copy"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION_DURATION.hero, ease: MOTION_EASE.reveal }}
        >
          <p className="intro-eyebrow">LAB RESTORASI CITRA · FFT 2D</p>
          <h2 className="intro-headline">Pisahkan gangguan. Temukan kembali detail.</h2>
          <p className="intro-lead">
            Amati pola periodik pada spektrum frekuensi, pilih titik gangguannya, lalu bandingkan hasil pemulihan citra.
          </p>

          <div className="intro-actions">
            <button
              type="button"
              className="btn btn-primary intro-cta-primary"
              disabled={analyzing}
              onClick={onLoadCameraSample}
            >
              {analyzing ? 'Memuat contoh...' : 'Coba contoh interaktif'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={analyzing}
              onClick={onTriggerUpload}
            >
              Unggah gambar
            </button>
          </div>

          <div className="intro-meta-row">
            <button type="button" className="intro-link-btn" onClick={onOpenGuide}>
              Bagaimana cara kerjanya?
            </button>
            <span className="intro-trust">Gambar diproses di perangkat Anda.</span>
          </div>
        </motion.div>

        <motion.div
          className="intro-visual"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: MOTION_DURATION.hero,
            delay: 0.08,
            ease: MOTION_EASE.reveal,
          }}
        >
          <div className="intro-stage-pair">
            <figure className="intro-frame">
              <img
                src="/samples/camera_periodic.png"
                alt="Contoh citra Camera dengan gangguan sinusoid periodik"
                width={512}
                height={512}
                fetchPriority="high"
                className="intro-sample-img"
              />
              <figcaption className="intro-frame-tag">Contoh: Citra terganggu</figcaption>
            </figure>

            <figure className="intro-frame intro-frame-clean">
              <img
                src="/samples/camera.png"
                alt="Contoh citra Camera referensi bersih"
                width={512}
                height={512}
                className="intro-sample-img"
              />
              <figcaption className="intro-frame-tag intro-frame-tag-accent">
                Contoh: Referensi bersih
              </figcaption>
            </figure>
          </div>

          <motion.div
            className="intro-spectrum-diagram"
            style={{ y: spectrumY }}
            aria-hidden="true"
          >
            <div className="intro-diagram-head">
              <span className="mono-value">Spektrum FFT 2D (konjugat)</span>
              <span className="mono-value">DC (256, 256)</span>
            </div>
            <svg viewBox="0 0 320 112" className="intro-diagram-svg" fill="none">
              <line x1="0" y1="56" x2="320" y2="56" stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <line x1="160" y1="0" x2="160" y2="112" stroke="var(--border-subtle)" strokeDasharray="3 3" />
              {/* DC cyan crosshair */}
              <line x1="152" y1="56" x2="168" y2="56" stroke="var(--telemetry)" strokeWidth="1.8" />
              <line x1="160" y1="48" x2="160" y2="64" stroke="var(--telemetry)" strokeWidth="1.8" />
              {/* Conjugate peak pair 1 */}
              <circle cx="114" cy="56" r="10" stroke="var(--accent)" strokeWidth="1.8" />
              <circle cx="114" cy="56" r="2.5" fill="var(--accent)" />
              <circle cx="206" cy="56" r="10" stroke="var(--accent-text)" strokeWidth="1.6" strokeDasharray="3 2.5" />
              <circle cx="206" cy="56" r="2.5" fill="var(--accent-text)" />
              {/* Conjugate peak pair 2 */}
              <circle cx="160" cy="24" r="9" stroke="var(--accent)" strokeWidth="1.8" />
              <circle cx="160" cy="24" r="2.2" fill="var(--accent)" />
              <circle cx="160" cy="88" r="9" stroke="var(--accent-text)" strokeWidth="1.6" strokeDasharray="3 2.5" />
              <circle cx="160" cy="88" r="2.2" fill="var(--accent-text)" />
            </svg>
          </motion.div>
        </motion.div>
      </div>

      <div className="intro-samples-grid" aria-label="Pilih contoh siap pakai">
        <button
          type="button"
          className="sample-card"
          disabled={analyzing}
          onClick={onLoadCameraSample}
        >
          <img
            src="/samples/camera_periodic.png"
            alt=""
            width={64}
            height={64}
            className="sample-card-thumb"
          />
          <div className="sample-card-body">
            <span className="sample-card-title">Camera + gangguan periodik</span>
            <span className="sample-card-desc">
              Contoh terkontrol 512 × 512 dengan referensi bersih untuk menghitung PSNR dan SSIM.
            </span>
          </div>
        </button>

        <button
          type="button"
          className="sample-card"
          disabled={analyzing}
          onClick={onLoadBoySample}
        >
          <div className="sample-card-thumb sample-card-thumb-pgm" aria-hidden="true">
            <span className="mono-value">PGM</span>
          </div>
          <div className="sample-card-body">
            <span className="sample-card-title">Boy Noisy</span>
            <span className="sample-card-desc">
              Contoh PGM tanpa referensi bersih; cocok untuk evaluasi visual dan deteksi pola otomatis.
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
