# Verifikasi & Hasil Pengujian Aktual

Disusun: 23 November 2026.

## 1. Automated Checks

Seluruh perintah berikut dijalankan setelah edit kode terakhir:

| Perintah | Hasil | Cakupan |
|---|---|---|
| `npm test` | **PASS** (3 file, **35/35 tes lulus**) | `tests/dsp.test.ts` (11 tes paritas numerik Python & PGM), `tests/worker.test.ts` (8 tes cache & coalescing worker), `tests/app.test.tsx` (16 tes navigasi, persistensi tab P0, Radix Dialog drawer, filter sidebar roving tabindex, metrik netral, `SigmaChart`, `ErrorBoundary`, toggle reduced-motion, dan lifecycle `CameraTab` dengan mock media) |
| `npm run typecheck` | **PASS** (exit code 0) | `tsc --noEmit` |
| `npm run build` | **PASS** (exit code 0, 2.50s) | Build produksi Vite `dist/` |

## 2. Ukuran Bundle Produksi (`dist/`)

- `dist/index.html`: `0.69 kB` (`0.41 kB` gzip)
- `dist/assets/index-BojbIF5h.css`: `90.90 kB` (`36.36 kB` gzip)
- `dist/assets/index-BHoGfNLT.js`: `527.60 kB` (`168.61 kB` gzip — di bawah guardrail 250 kB gzip)
- Lazy chunks:
  - `GuideTab`: `7.55 kB` (`2.83 kB` gzip)
  - `CameraTab`: `9.14 kB` (`3.20 kB` gzip)
  - `SyntheticExperimentTab`: `20.07 kB` (`6.01 kB` gzip)
  - `dspProcessor` fallback: `8.91 kB` (`2.87 kB` gzip)
  - `dsp.worker`: `20.24 kB`
- **Actual initial HTTP requests** (diukur di Chromium terhadap `vite preview` empty state): **13 request** (HTML, 1 CSS, 1 JS utama, 2 gambar sampel demo, 7 file `.woff2` subset Latin ~123 kB total, 1 `favicon.svg`).

## 3. Browser Visual & Behavioral QA (`vite preview` + Chromium Headless)

- **Browser diuji**: Google Chrome (Chromium headless via `playwright-core`) pada `http://localhost:4173/`.
- **Error konsol & halaman**: `0` console errors, `0` uncaught page errors.
- **Persistensi tab (P0)**: Memuat sampel `camera_periodic.png`, berpindah ke tab `Petunjuk & Teori`, `Eksperimen Sinusoid`, dan kembali ke `Restoration Lab` mempertahankan citra, spektrum, dan hasil tanpa reset.
- **Drawer mobile (`390×844`)**: Terbuka sebagai `role="dialog"` dan tertutup bersih dengan tombol `Escape`.
- **Overflow check**:
  - `320×640`: `scrollWidth=320`, `innerWidth=320` (**no overflow**)
  - `390×844`: `scrollWidth=390`, `innerWidth=390` (**no overflow**)
  - `768×1024`: `scrollWidth=768`, `innerWidth=768` (**no overflow**)
  - `1024×768`: `scrollWidth=1024`, `innerWidth=1024` (**no overflow**)
  - `1440×900`: `scrollWidth=1440`, `innerWidth=1440` (**no overflow**)
- **Screenshot ditinjau secara visual**: Intro desktop dark, Lab loaded dark (spektrum + kontrol + hasil + metrik + ekspor), Lab loaded light, Kamera idle dark, Eksperimen Sinusoid dark, Petunjuk & Teori dark, Intro mobile `390×844`, dan Drawer mobile `390×844`.

## 4. Keterbatasan yang Belum Dapat Diverifikasi

- **Browser WebKit / Safari dan Firefox**: Belum tersedia dan belum dijalankan pada mesin Windows ini.
- **Perangkat kamera fisik nyata**: `CameraTab` diuji pada UI browser dalam state idle/kontrol dan melalui mock `navigator.mediaDevices.getUserMedia` di `tests/app.test.tsx`; tangkapan live dari perangkat webcam fisik serta uji coba sentuh jari di perangkat seluler fisik belum dilakukan.
- **Lighthouse / Web Vitals lapangan (LCP, INP, CLS p75)**: Tidak diukur atau dilaporkan dalam angka skor tanpa pengukuran Lighthouse langsung.
