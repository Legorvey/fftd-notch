# Design System — Spectral Instrument Studio

Disusun: 23 November 2026.

## 1. Identitas & Arah Visual

- **Produk**: Mini Image Restoration Lab (`FFTD Notch · Image Restoration Lab`), Proyek Pemrosesan Sinyal Digital Kelompok H, Universitas Padjadjaran.
- **Konsep**: **Spectral Instrument Studio** — instrumen laboratorium sinyal digital yang tenang, presisi, editorial di area pengenalan/panduan, dan stabil di area workbench.

## 2. Token Warna (`src/styles/tokens.css`)

| Token | Dark Mode | Light Mode | Peran |
|---|---|---|---|
| `--bg-base` | `#090b0e` | `#f4f1ea` | Latar utama shell |
| `--bg-panel` | `#11151b` | `#ffffff` | Permukaan panel & sidebar |
| `--bg-recessed` | `#0c0f14` | `#ebe7de` | Area sekunder & disclosure |
| `--bg-elevated` | `#181e27` | `#f8f6f1` | Kartu interaktif & tombol sekunder |
| `--bg-canvas` | `#06080a` | `#12151a` | Bingkai citra/spektrum |
| `--text-primary` | `#f3f5f8` | `#14171c` | Teks utama |
| `--text-secondary` | `#9eaab8` | `#4b5563` | Deskripsi & label |
| `--accent` / `--accent-text` | `#f5a623` / `#fbbf24` | `#b45309` / `#92400e` | Aksi primer & titik notch |
| `--telemetry` | `#22d3ee` | `#0e7490` | Pusat DC, koordinat, label instrumen |

## 3. Tipografi & Skala Ruang

- **Display**: `Bricolage Grotesque` (600, 700, 800) — headline intro `clamp(2rem, 4.2vw, 3.25rem)`, `line-height: 1.07`.
- **Body & UI**: `Plus Jakarta Sans` (400, 500, 600, 700).
- **Monospace Data**: `JetBrains Mono` (400, 500, 600) dengan `font-variant-numeric: tabular-nums` pada koordinat, parameter, dan metrik PSNR/SSIM.
- **Skala Ruang**: `4, 8, 12, 16, 24, 32, 48 px` (`--space-1` s.d. `--space-7`).
- **Radius**: `--radius-display: 4px`, `--radius-control: 8px`, `--radius-panel: 12px`, `--radius-showcase: 16px`.
- **Z-Index**: `--z-content: 1`, `--z-sticky: 20`, `--z-popover: 30`, `--z-drawer: 40`, `--z-toast: 50`.
- **Touch Target**: `--tap-min: 44px` diterapkan pada tombol, kontrol segmen, chip notch, stepper panduan, input pencarian, dan tombol file.

## 4. Hierarki & Aturan Mode Gelap/Terang

- **Mode Gelap** (bawaan): menonjolkan citra grayscale dan peta warna *inferno* spektrum FFT 2D di atas permukaan graphite rendah pantulan.
- **Mode Terang**: lembar kerja ilmiah bernuansa hangat (`#f4f1ea` / `#ffffff`) dengan `--bg-canvas` tetap gelap (`#12151a`) agar pembingkaian spektrum tidak silau.
- Seluruh banner status, delta metrik, dan penanda spektrum memakai kombinasi warna + teks/prefix/bentuk (`GALAT`, `PERINGATAN`, `INFO`, lingkaran utuh vs putus-putus, tanda `+` DC).
