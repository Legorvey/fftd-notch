# Mini Image Restoration Lab: FFT 2D dan Gaussian Notch Filter

Aplikasi laboratorium pengolahan sinyal digital (proyek PSD Kelompok H, Universitas Padjadjaran) untuk menganalisis spektrum frekuensi citra 2D dan menghilangkan gangguan periodik menggunakan Gaussian notch-reject filter.

Proyek ini menyediakan dua lingkungan yang terverifikasi paritas numeriknya:
1. **Aplikasi Web Statis (React + TypeScript + Vite + Web Worker)** yang siap di-deploy langsung ke **Vercel** dan berjalan 100% di sisi browser tanpa backend.
2. **Paket Referensi Python (`fft2d_notch.py`, `experiments.py`, `run_experiment.py`, `app.py`)** untuk eksperimen terminal dan antarmuka Streamlit lokal.

---

## Cara Kerja Sistem

### 1. Transformasi Fourier 2D (FFT 2D)
Setiap citra grayscale dikonversi ke rentang float64 `[0, 1]` menggunakan bobot luminansi ITU-R 601 (`0.2989 R + 0.5870 G + 0.1140 B` untuk citra RGB, dan nilai piksel langsung `v / 255` untuk citra grayscale). Selanjutnya dihitung:

```text
F_shift = fftshift(FFT2(I))
Spectrum = log(1 + |F_shift|)
```

Di aplikasi web (`src/dsp/fft.ts`), FFT 2D berjalan di dalam Web Worker menggunakan:
- **Radix-2 Cooley-Tukey FFT** untuk dimensi pangkat dua (misalnya `512 x 512`), dan
- **Bluestein Chirp-Z FFT** untuk dimensi sembarang (genap, ganjil, maupun bilangan prima) dengan hasil numerik identik terhadap `scipy.fft.fft2`.

### 2. Pusat DC dan Simetri Konjugat
- Sumbu horizontal (`x`) adalah kolom spektrum; sumbu vertikal (`y`) adalah baris spektrum setelah `fftshift`.
- Pusat DC (frekuensi nol) terletak pada `(floor(H / 2), floor(W / 2))`.
- Karena citra bernilai real, gangguan sinusoid dengan frekuensi `(u, v)` menghasilkan sepasang puncak terang simetris pada:
  - `(cy, cx) = ((dc_y + v) mod H, (dc_x + u) mod W)`
  - Pasangan konjugat: `((2 * dc_y - cy) mod H, (2 * dc_x - cx) mod W)`
- Saat pengguna memilih satu titik notch, aplikasi otomatis memasangkannya dengan titik simetris tersebut.

### 3. Gaussian Notch-Reject Mask dan Rekonstruksi IFFT
Untuk setiap titik notch `(p_y, p_x)` beserta pasangan simetrisnya dan lebar `sigma > 0`:

```text
H(y, x) = Π [ 1 - exp(-(dy^2 + dx^2) / (2 * sigma^2)) ]
I_restored = Re(IFFT2(ifftshift(F_shift * H)))
```

dengan `dy` dan `dx` adalah jarak periodik pada spektrum. Nilai `sigma` kecil menekan puncak sempit sambil menjaga detail citra asli, sedangkan `sigma` besar memperlebar daerah yang ditekan sehingga berisiko mengurangi detail struktur citra.

### 4. Metode Pembanding dan Metrik Evaluasi
- **Pembanding:** Gaussian blur spasial (`gaussian_filter` separable dengan padding `reflect`).
- **Deteksi kandidat semi-otomatis:** mencari maksimum lokal 7x7 di luar radius pusat DC di atas persentil 99.5, lalu menyaring pasangan simetris agar tidak tampil ganda. Pengguna tetap memverifikasi kandidat sebelum mengaktifkannya.
- **Metrik kuantitatif:** PSNR (dB) dan SSIM (`win_size = 7`, `data_range = 1.0`, kovarians sampel) hanya dihitung jika citra referensi bersih dengan dimensi sama tersedia.

### 5. Batas Penggunaan
Notch filtering dirancang khusus untuk **gangguan periodik** yang muncul sebagai puncak terlokalisasi pada spektrum FFT 2D. Metode ini bukan solusi umum untuk blur optik atau derau acak (Gaussian/salt-and-pepper).

---

## Fitur Utama Aplikasi Web

- **Restoration Lab:** unggah gambar terganggu (PNG, JPG, WebP, dan Netpbm PGM) + referensi bersih opsional, atau muat langsung sampel bawaan `camera_periodic.png` (`512 x 512`) dan `boy_noisy.pgm` (`512 x 512`). Klik langsung pada spektrum FFT 2D untuk menambah/menghapus pasangan notch, aktifkan deteksi otomatis berbasis jendela Hann + MAD Z-score, pakai input koordinat manual, atau pilih kandidat semi-otomatis. Tersedia tampilan spektrum sebelum/sesudah filter, pemisah geser (before/after), grid 4 panel, metrik PSNR/SSIM, serta ekspor PNG, CSV, dan arsip ZIP.
- **Kamera:** tangkap foto langsung dari kamera web (atau unggah foto perangkat) dalam dua mode: **Foto asli (deteksi otomatis)** dan **Simulasi gangguan periodik** lengkap dengan perbandingan dan ekspor ZIP.
- **Eksperimen Sinusoid:** uji terkontrol menggunakan `skimage.data.camera` (`512 x 512`) atau citra bersih pilihan Anda dengan dua komponen sinusoid `(u1, v1)` dan `(u2, v2)`, preset pola frekuensi, perbandingan terhadap Gaussian blur, grafik interaktif sensitivitas `sigma` (`0.5` sampai `4.0`), dan ekspor PNG/CSV.
- **Petunjuk:** ringkasan alur kerja, konvensi koordinat, rumus notch mask, dan batasan metode.
- **Tema Gelap dan Terang:** bawaan mode gelap ala instrumen spektral dengan tombol ganti mode terang yang teruji kontras WCAG AA, ramah keyboard, dan responsif dari layar ponsel (`320px`) hingga desktop.

---

## Menjalankan Secara Lokal

### Opsi A: Aplikasi Web (Vite + React + TypeScript)

Prasyarat: **Node.js >= 20** dan **npm**.

```bash
npm install
npm run dev
```

Buka alamat lokal yang ditampilkan Vite (umumnya `http://localhost:5173`).

Perintah pengembangan dan verifikasi lainnya:

```bash
# Jalankan seluruh unit test (paritas numerik terhadap Python, worker, dan komponen UI)
npm test

# Pemeriksaan tipe TypeScript
npm run typecheck

# Build produksi untuk Vercel (menghasilkan folder dist/)
npm run build

# Pratinjau lokal hasil build produksi
npm run preview
```

### Opsi B: Skrip Terminal & Streamlit Python (Referensi Asli)

Prasyarat: **Python >= 3.10**.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS / Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Menjalankan eksperimen sintetis dari terminal (menyimpan 6 PNG dan 2 CSV ke folder output):

```bash
python run_experiment.py
python run_experiment.py --input "gambar_bersih.png" --output "hasil_eksperimen"
python run_experiment.py --u1 24 --v1 0 --u2 0 --v2 32 --amplitude 0.08 --sigma 1.0
```

Menjalankan antarmuka Streamlit lokal:

```bash
streamlit run app.py
```

---

## Deploy ke Vercel

Repositori ini sudah dikonfigurasi dengan `vercel.json` (build statis Vite, `npm ci`, header keamanan HTTP & CSP, dan aturan cache untuk `/assets/*` dan `/samples/*`).

### Melalui Dashboard Vercel (Disarankan)
1. Push repositori ini ke GitHub.
2. Masuk ke [vercel.com/new](https://vercel.com/new) dan pilih repositori `fftd-notch`.
3. Biarkan pengaturan bawaan (otomatis terbaca dari `vercel.json`):
   - **Framework Preset:** `Vite`
   - **Install Command:** `npm ci`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
4. Klik **Deploy**. Tidak ada environment variable atau backend Python yang perlu diatur.

### Melalui Vercel CLI
```bash
npx vercel --prod
```

---

## Struktur Proyek

```text
.
├── index.html                  # Dokumen HTML utama dan font IBM Plex
├── vercel.json                 # Konfigurasi build, rewrite, cache, dan header keamanan Vercel
├── package.json                # Dependensi React 19, Vite 6, TypeScript 5, Vitest
├── public/
│   ├── favicon.svg             # Ikon situs SVG
│   └── samples/
│       ├── camera.png          # Referensi bersih skimage.data.camera (512x512 lossless)
│       └── camera_periodic.png # Sampel uji dengan gangguan dua sinusoid periodik
├── src/
│   ├── App.tsx                 # Shell aplikasi, tab persisten, dan pengatur tema gelap/terang
│   ├── dsp/
│   │   ├── fft.ts              # FFT 1D/2D presisi Float64 (Cooley-Tukey + Bluestein) & fftshift
│   │   ├── notch.ts            # Notch mask, rekonstruksi IFFT, Gaussian blur, peak detector, PSNR/SSIM
│   │   ├── experiments.ts      # Generator sinusoid, eksperimen sintetis, sapuan sigma
│   │   ├── colormap.ts         # LUT colormap inferno, render kanvas, ekspor PNG & CSV
│   │   ├── format.ts           # Pemformat PSNR/SSIM/delta aman untuk Infinity dan NaN
│   │   └── types.ts            # Definisi tipe data DSP
│   ├── workers/
│   │   ├── dspProcessor.ts     # Logika pemrosesan + cache FFT & tahap eksperimen
│   │   ├── dsp.worker.ts       # Entry Web Worker dengan Transferable ArrayBuffer
│   │   └── dspClient.ts        # Klien Promise dengan coalescing latest-wins & timeout
│   ├── utils/
│   │   └── imageLoader.ts      # Validasi magic-byte/dimensi pra-dekode dan konversi grayscale
│   ├── components/             # Header, SpectrumCanvas, ComparisonViewer, SigmaChart, MetricsTable, tab lab/eksperimen/petunjuk
│   └── styles/                 # Token warna WCAG AA (gelap & terang) dan tata letak responsif
├── tests/
│   ├── fixtures/python_golden.json  # Output referensi dari Python untuk uji paritas numerik
│   ├── dsp.test.ts             # Uji FFT, paritas Python (genap, ganjil, 512x512 camera), batas input
│   ├── worker.test.ts          # Uji cache worker, eksperimen, dan penanganan galat
│   └── app.test.tsx            # Uji tab keyboard, tema, form angka negatif, metrik, grafik, ErrorBoundary
├── fft2d_notch.py              # Modul referensi Python inti FFT 2D + Notch
├── experiments.py              # Modul referensi Python eksperimen sintetis
├── run_experiment.py           # CLI eksperimen Python
├── app.py                      # Antarmuka Streamlit lokal (Python)
└── requirements.txt            # Dependensi Python
```
