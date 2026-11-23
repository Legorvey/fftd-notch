export function GuideTab() {
  return (
    <section
      id="panel-guide"
      role="tabpanel"
      aria-labelledby="tab-guide"
      className="section-stack"
    >
      <div>
        <h2 className="page-heading">Petunjuk penggunaan dan dasar teori FFT 2D Notch</h2>
        <p className="page-lead">
          Ringkasan alur kerja, konvensi koordinat spektrum, persamaan Gaussian notch-reject mask, serta batasan metode untuk proyek Pemrosesan Sinyal Digital Kelompok H.
        </p>
      </div>

      <div className="guide-grid">
        <article className="panel">
          <h3 className="panel-title">1. Alur kerja Restoration Lab</h3>
          <ol className="guide-list">
            <li>
              <strong>Unggah gambar terganggu</strong> (PNG, JPG, atau WebP) yang memiliki garis atau pola berulang, atau klik <strong>Muat sampel Camera + gangguan</strong> untuk langsung menguji data contoh.
            </li>
            <li>
              <strong>Amati spektrum FFT 2D</strong> dalam skala logaritmik <code>log(1 + |F|)</code>. Gangguan periodik tampak sebagai sepasang titik terang yang simetris terhadap pusat DC.
            </li>
            <li>
              <strong>Pilih puncak gangguan</strong> dengan mengklik langsung pada spektrum, mengisi koordinat manual (baris y, kolom x), atau mengaktifkan kandidat puncak semi-otomatis.
            </li>
            <li>
              <strong>Atur lebar notch (sigma)</strong> lalu bandingkan hasilnya dengan metode pembanding Gaussian blur menggunakan pemisah geser atau tampilan grid 4 panel.
            </li>
            <li>
              <strong>Ukur metrik PSNR dan SSIM</strong> dengan mengunggah citra referensi bersih berukuran sama, kemudian unduh hasil citra (PNG) dan tabel metrik (CSV).
            </li>
          </ol>
        </article>

        <article className="panel">
          <h3 className="panel-title">2. Membaca koordinat spektrum dan simetri</h3>
          <ul className="guide-list">
            <li>
              <strong>Sumbu horizontal (x)</strong> adalah kolom spektrum; <strong>sumbu vertikal (y)</strong> adalah baris spektrum setelah <code>fftshift</code>.
            </li>
            <li>
              <strong>Pusat DC (frekuensi nol)</strong> berada pada koordinat <code>(floor(H / 2), floor(W / 2))</code> yang ditandai simbol <code>+</code> berwarna sian. Hindari menaruh notch tepat di pusat DC karena akan menghapus rata-rata kecerahan citra.
            </li>
            <li>
              <strong>Simetri konjugat</strong>: karena citra bernilai real, setiap puncak pada <code>(cy, cx)</code> otomatis dipasangkan dengan titik simetrisnya <code>((2*dc_y - cy) mod H, (2*dc_x - cx) mod W)</code>.
            </li>
            <li>
              <strong>Hubungan frekuensi sinusoid (u, v)</strong>: sinusoid dengan frekuensi <code>u</code> siklus arah x dan <code>v</code> siklus arah y muncul pada bin <code>(dc_y + v, dc_x + u)</code> dan pasangannya <code>(dc_y - v, dc_x - u)</code>.
            </li>
          </ul>
        </article>

        <article className="panel">
          <h3 className="panel-title">3. Formulasi Gaussian Notch-Reject Mask</h3>
          <p className="panel-subtitle" style={{ marginBottom: '0.5rem' }}>
            Untuk setiap pasangan puncak gangguan <code>(p_y, p_x)</code> dengan jarak periodik <code>d(y, x)</code> dan lebar <code>sigma</code>:
          </p>
          <pre className="formula-block">
            {`H(y, x) = Π [ 1 - exp( -(dy² + dx²) / (2 · sigma²) ) ]
Restored = Re( IFFT2( ifftshift( F_shift · H ) ) )`}
          </pre>
          <p className="panel-subtitle">
            Nilai <code>sigma</code> kecil (misalnya 0.5 sampai 1.2) menekan puncak sempit sambil menjaga detail citra asli. Nilai <code>sigma</code> yang terlalu besar ikut memotong spektrum citra alami sehingga menurunkan PSNR dan SSIM.
          </p>
        </article>

        <article className="panel">
          <h3 className="panel-title">4. Batas penggunaan dan arsitektur proyek</h3>
          <ul className="guide-list">
            <li>
              <strong>Batas metode</strong>: notch filtering ditujukan untuk gangguan periodik yang menghasilkan puncak terlokalisasi di domain frekuensi. Metode ini tidak memperbaiki blur optik atau derau acak (Gaussian/salt-and-pepper).
            </li>
            <li>
              <strong>Validitas metrik</strong>: PSNR dan SSIM hanya dihitung saat citra referensi bersih tersedia dan dimensinya sama persis dengan citra uji.
            </li>
            <li>
              <strong>Paritas Python dan Web</strong>: mesin FFT 2D, notch mask, Gaussian blur, deteksi puncak, PSNR, dan SSIM di aplikasi web ini berjalan lokal di Web Worker (mendukung ukuran gambar genap maupun ganjil lewat algoritma Cooley-Tukey dan Bluestein) dan diuji paritas numeriknya terhadap modul Python <code>fft2d_notch.py</code> dan <code>experiments.py</code>.
            </li>
          </ul>
        </article>
      </div>
    </section>
  );
}
