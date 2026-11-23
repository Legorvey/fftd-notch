# Mini Image Restoration Lab — FFT 2D dan Notch Filter

Paket program berdasarkan rancangan proyek PSD Kelompok H. Program terdiri dari:

- `app.py`: antarmuka Streamlit untuk upload gambar, melihat spektrum FFT 2D, memilih frekuensi gangguan secara manual atau dari kandidat otomatis, menjalankan notch filter, membandingkan Gaussian blur, menghitung PSNR/SSIM jika ada referensi bersih, dan mengunduh gambar/CSV.
- `fft2d_notch.py`: fungsi inti FFT 2D, pembuatan notch mask simetris, rekonstruksi IFFT, deteksi kandidat puncak, Gaussian blur, serta metrik PSNR dan SSIM.
- `experiments.py`: pembuatan dua sinusoid spasial, eksperimen sintetis terkontrol, dan analisis sensitivitas sigma.
- `run_experiment.py`: menjalankan eksperimen dari terminal dan menyimpan semua hasil ke folder.

## 1. Instalasi

Disarankan menggunakan Python 3.10 atau lebih baru.

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS/Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. Menjalankan aplikasi

Dari folder proyek:

```bash
streamlit run app.py
```

Streamlit akan membuka alamat lokal di browser. Upload gambar terganggu pada tab **Restoration Lab**. Puncak spektrum dapat dipilih secara manual dengan koordinat (baris, kolom), atau pilih kandidat dari daftar semi-otomatis. Jika ingin menghitung PSNR/SSIM, upload gambar referensi bersih dengan dimensi yang sama.

## 3. Menjalankan eksperimen sintetis melalui terminal

Tanpa input gambar (menggunakan contoh `skimage.data.camera`):

```bash
python run_experiment.py
```

Dengan gambar sendiri:

```bash
python run_experiment.py --input "gambar_bersih.png" --output "hasil_eksperimen"
```

Mengubah frekuensi dan parameter:

```bash
python run_experiment.py --u1 24 --v1 0 --u2 0 --v2 32 --amplitude 0.08 --sigma 1.0
```

Program menyimpan citra referensi, gambar terganggu, Gaussian blur, hasil notch, mask, spektrum FFT, `metrik_eksperimen.csv`, dan `sensitivitas_sigma.csv`.

## 4. Cara membaca koordinat spektrum

- Sumbu horizontal adalah kolom (x), sumbu vertikal adalah baris (y).
- Titik tengah spektrum adalah frekuensi nol / DC.
- Satu titik notch otomatis dipasangkan dengan titik frekuensi simetrisnya.
- `sigma` mengatur lebar daerah frekuensi yang ditekan. Sigma besar dapat ikut menghilangkan detail asli.
- Deteksi otomatis hanya memberikan kandidat. Pengguna tetap harus memeriksa apakah titik tersebut benar-benar puncak gangguan.

## 5. Batas penggunaan

Notch filtering ditujukan untuk gangguan periodik yang tampak sebagai puncak terlokalisasi pada spektrum. Metode ini tidak otomatis memperbaiki blur, noise acak, atau semua jenis kerusakan gambar. PSNR dan SSIM hanya valid ditampilkan bila gambar referensi bersih tersedia dan ukurannya sama dengan gambar yang diuji.
