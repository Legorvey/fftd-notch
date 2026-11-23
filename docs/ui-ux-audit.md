# UI/UX Audit — FFTD Notch (Mini Image Restoration Lab)

Disusun: 23 November 2026.

## 1. Baseline Checkout saat Audit

- **Stack**: React `19.1.0`, TypeScript `5.8.3`, Vite `6.4.6`, Vitest `3.2.7`, Web Worker Float64 FFT (`src/dsp/*`, `src/workers/*`).
- **Baseline suite**: 30/30 tes awal lulus, `tsc --noEmit` bersih, build produksi selesai.
- **Font lokal**: `@fontsource/bricolage-grotesque`, `@fontsource/plus-jakarta-sans`, `@fontsource/jetbrains-mono` sudah diimpor secara lokal tanpa request Google Fonts eksternal.

## 2. Temuan Terverifikasi & Status Perbaikan

| Prioritas | Temuan | Bukti Lokasi | Status |
|---|---|---|---|
| **P0** | Identitas wrapper tab berubah (`key={activeTab === '...' ? 'active' : 'hidden'}`), menyebabkan subtree tab ter-remount dan state lokal hilang saat berpindah tab | `src/App.tsx` | **Diperbaiki**: wrapper tab memakai elemen `<div className="tab-pane" hidden={activeTab !== '...'}>` dengan identitas stabil + regression test di `tests/app.test.tsx` |
| **P1** | Drawer navigasi mobile belum memakai modal dialog semantics, focus trap, maupun inert background | `src/App.tsx`, `src/components/Sidebar.tsx` | **Diperbaiki**: drawer mobile memakai `@radix-ui/react-dialog` (`Dialog.Root`, `Dialog.Overlay`, `Dialog.Content`, `Dialog.Title`, `Dialog.Close`, focus restoration ke `mobileTriggerRef`) |
| **P1** | Scroll container desktop berada di `.main-workspace` (`100dvh` shell), membutuhkan konfigurasi explicit container untuk Lenis dan Motion `useScroll` | `src/styles/app.css`, `src/App.tsx` | **Diperbaiki**: `useScopedSmoothScroll` dan `useScroll` mengikat `wrapperRef`/`container` ke `.main-workspace` dan `.workspace-inner` |
| **P1** | Saat filter pencarian sidebar menyembunyikan tab aktif, seluruh tab tersisa memiliki `tabIndex={-1}` | `src/components/Sidebar.tsx` | **Diperbaiki**: `focusableTabId` memastikan tab pertama yang terlihat tetap memiliki `tabIndex={0}` saat tab aktif terfilter |
| **P1** | Copy kartu metrik mengasumsikan notch selalu unggul (`Keunggulan atas Gaussian Blur`, `Blur hanya mencapai ...`) | `src/components/MetricsTable.tsx` | **Diperbaiki**: diubah menjadi `Selisih terhadap Gaussian blur` dan kalimat dinamis netral (`Lebih tinggi ...`, `Lebih rendah ...`, `Setara dengan ...`) |
| **P1** | Empty state Restoration Lab langsung menampilkan pesan kosong teknis dan banyak opsi awal | `src/components/RestorationLabTab.tsx`, `src/components/LabIntroShowcase.tsx` | **Diperbaiki**: diganti intro *Spectral Instrument Studio* (headline, CTA contoh interaktif, CTA unggah, demonstrasi konjugat, dan 2 kartu sampel); saat terisi memakai `source-summary-bar` ringkas dan `<details>` untuk pengaturan lanjutan |
| **P1** | Persistensi tab membuat efek global/kamera di tab tersembunyi berpotensi tetap aktif | `src/components/RestorationLabTab.tsx`, `src/components/CameraTab.tsx` | **Diperbaiki**: prop `isActive` membatasi shortcut `Ctrl/Cmd+Z` hanya di tab lab aktif, `lastConsumedRequestIdRef` mencegah sampel diulang, dan `CameraTab` menghentikan `MediaStream` track (termasuk izin yang terlambat selesai) saat tab tidak aktif atau `document.hidden` |
| **P2** | Komponen intro dan logika motion bercampur dengan komponen utama | `src/components/LabIntroShowcase.tsx`, `src/motion/*` | **Diperbaiki**: diekstrak ke `src/motion/tokens.ts`, `src/motion/useMotionPreferences.ts`, `src/motion/useScopedSmoothScroll.ts`, dan `src/components/LabIntroShowcase.tsx` |
| **P2** | Breadcrumb header & meta row intro terpotong/meninggalkan titik yatim di layar `390px` | `src/styles/app.css`, `src/components/LabIntroShowcase.tsx` | **Diperbaiki**: diverifikasi lewat screenshot `390x844`, separator/breadcrumb sekunder disembunyikan di `<480px`, `.sidebar-brand-meta` diberi ellipsis satu baris |
| **P2** | Beberapa weight font diimpor sekaligus di `src/main.tsx` | `src/main.tsx`, `dist/assets/` | **Terukur**: dari 60+ subset di `dist/assets`, browser hanya mengunduh 7 file `.woff2` Latin yang aktif (~123 KB total) pada load awal |
