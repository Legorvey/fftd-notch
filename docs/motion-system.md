# Motion System & Scoped Lenis

Disusun: 23 November 2026.

## 1. Token & Kebijakan Motion (`src/motion/tokens.ts`, `src/styles/tokens.css`)

- **Durasi**: `micro` (`130–140 ms`), `state` (`200 ms`), `panel` (`260 ms`), `hero` (`520 ms`), `chart` (`420 ms`).
- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` untuk reveal dan perpindahan elemen UI.
- **Spring**:
  - Indikator navigasi aktif (`layoutId`): `stiffness: 380, damping: 34, mass: 0.75`.
  - Chip titik notch (`AnimatePresence`): `stiffness: 420, damping: 32, mass: 0.7`.

## 2. Daftar Efek Motion & Lokasi

| Efek | Lokasi | Trigger | Batas / Fallback |
|---|---|---|---|
| Shared active indicator (`layoutId`) | `src/components/Sidebar.tsx` | Pergantian tab aktif | Key panel tab tetap stabil; tidak memindahkan fokus |
| Intro headline & visual reveal | `src/components/LabIntroShowcase.tsx` | Mount awal empty state | Satu kali saat mount, tidak memblokir CTA |
| Parallax grid & diagram konjugat | `src/components/LabIntroShowcase.tsx`, `src/components/GuideTab.tsx` | `useScroll` pada container `.main-workspace` | Pergeseran dibatasi (`14–24 px`), nonaktif (`0 px`) pada `reducedMotion` |
| Pulsa cincin simetri konjugat | `src/components/SpectrumCanvas.tsx` | Klik / `Enter` / `Space` pada spektrum | Overlay canvas `requestAnimationFrame` satu kali `380 ms`; nonaktif pada `prefers-reduced-motion` |
| Animasi chip notch (`AnimatePresence`) | `src/components/RestorationLabTab.tsx` | Tambah / hapus titik notch | Scale/opacity ringan tanpa menggoyang kanvas |
| Curve draw-on (`pathLength`) | `src/components/SigmaChart.tsx` | Mount pertama kurva sweep | Hanya saat kurva awal muncul; slider tidak memicu redraw animasi panjang |
| Drawer modal & backdrop | `src/components/Sidebar.tsx`, `src/styles/app.css` | Buka / tutup menu mobile | Radix Dialog focus trap, Escape, dan fokus kembali ke tombol `Menu` |
| Micro-interactions & drag-over | `src/styles/app.css`, `src/components/ComparisonViewer.tsx` | Hover, active press, drag-over file, drag divider | Transform/opacity berbasis GPU; tidak ada loop tak terbatas |

## 3. Arsitektur Lenis Scoped & RAF Ownership (`src/motion/useScopedSmoothScroll.ts`)

- **Scroller target**: `.main-workspace` (`wrapperRef`) dan `.workspace-inner` (`contentRef`) yang menjadi scroller utama pada desktop (`>= 960px`).
- **Kapan Lenis aktif**: Hanya pada permukaan presentasi desktop yang dapat di-scroll (`activeTab === 'guide'` atau `activeTab === 'lab' && !labHasImage`), ketika `!reducedMotion` dan `!isCoarsePointer`.
- **Kapan scroll native dipakai**:
  - Ketika workbench sedang memuat gambar untuk input presisi (`RestorationLabTab` terisi, `CameraTab`, `SyntheticExperimentTab`).
  - Pada perangkat sentuh (`pointer: coarse`) atau lebar layar `< 960px`.
  - Ketika `prefers-reduced-motion: reduce` aktif atau tombol header `Animasi dikurangi` diaktifkan.
- **RAF Ownership**: Lenis menggunakan `autoRaf: true` sebagai satu-satunya pemilik RAF loop untuk smooth scroll, dengan `ResizeObserver` pada `.workspace-inner` dan cleanup penuh (`resizeObserver.disconnect()`, `lenis.destroy()`) pada unmount/StrictMode.
- **Prevent zones**: Elemen `[data-lenis-prevent]`, `canvas`, `input`, `textarea`, `select`, `[role="dialog"]`, `.table-wrap`, dan `.formula-block` dikecualikan dari wheel interception. Saat modal drawer terbuka (`locked: mobileMenuOpen`), `lenis.stop()` dipanggil.

## 4. Kontrol Reduced Motion (`src/motion/useMotionPreferences.ts`)

- `<MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>` membungkus seluruh `App.tsx`.
- Tombol header **Animasi / Gerak minimal** (`aria-pressed`) memungkinkan pengguna mengurangi animasi dan parallax secara manual (disimpan di `localStorage`), dan otomatis terkunci saat pengaturan OS `prefers-reduced-motion: reduce` aktif.
