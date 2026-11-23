"""Fungsi inti FFT 2D dan notch filtering untuk proyek PSD Kelompok H."""
from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np
from scipy.ndimage import gaussian_filter, maximum_filter
from scipy.fft import fft2, fftshift, ifft2, ifftshift
from skimage.metrics import peak_signal_noise_ratio, structural_similarity


Array2D = np.ndarray


def normalize_grayscale(image: Array2D) -> Array2D:
    """Pastikan citra menjadi grayscale float64 dengan skala sekitar 0..1."""
    arr = np.asarray(image)
    if arr.ndim == 3:
        # Konversi RGB sederhana; input aplikasi umumnya sudah grayscale.
        arr = arr[..., :3].astype(np.float64)
        arr = 0.2989 * arr[..., 0] + 0.5870 * arr[..., 1] + 0.1140 * arr[..., 2]
    if arr.ndim != 2:
        raise ValueError("Citra harus berupa grayscale 2D atau RGB.")
    arr = arr.astype(np.float64)
    if np.issubdtype(np.asarray(image).dtype, np.integer):
        max_value = float(np.iinfo(np.asarray(image).dtype).max)
        if max_value > 0:
            arr /= max_value
    elif arr.size and (np.nanmax(arr) > 1.0 or np.nanmin(arr) < 0.0):
        lo, hi = float(np.nanmin(arr)), float(np.nanmax(arr))
        if hi > lo:
            arr = (arr - lo) / (hi - lo)
    return np.nan_to_num(arr, nan=0.0, posinf=1.0, neginf=0.0)


def fft_spectrum(image: Array2D) -> tuple[np.ndarray, Array2D]:
    """Hitung FFT 2D ter-shift dan spektrum log(1 + |F|)."""
    f_shift = fftshift(fft2(np.asarray(image, dtype=np.float64)))
    spectrum = np.log1p(np.abs(f_shift))
    return f_shift, spectrum


def _periodic_distance(a: np.ndarray, b: int, size: int) -> np.ndarray:
    """Jarak indeks pada spektrum dengan kondisi periodik."""
    delta = np.abs(a - b)
    return np.minimum(delta, size - delta)


def symmetric_center(shape: tuple[int, int], center: tuple[int, int]) -> tuple[int, int]:
    """Pasangan frekuensi simetris terhadap DC pada spektrum FFT-shift."""
    h, w = shape
    cy, cx = center
    dc_y, dc_x = h // 2, w // 2
    return ((2 * dc_y - int(cy)) % h, (2 * dc_x - int(cx)) % w)


def build_notch_mask(
    shape: tuple[int, int],
    centers: Iterable[tuple[int, int]],
    sigma: float = 1.0,
) -> Array2D:
    """Buat Gaussian notch-reject mask untuk setiap pusat dan pasangan simetris.

    Koordinat pusat menggunakan format (baris, kolom) pada spektrum FFT-shift.
    Nilai mask mendekati 0 di pusat gangguan dan 1 pada frekuensi yang dilewatkan.
    """
    h, w = shape
    if h < 1 or w < 1:
        raise ValueError("Ukuran citra tidak valid.")
    if sigma <= 0:
        raise ValueError("Sigma harus lebih besar dari 0.")

    yy, xx = np.mgrid[0:h, 0:w]
    mask = np.ones((h, w), dtype=np.float64)
    unique_centers: set[tuple[int, int]] = set()

    for center in centers:
        cy, cx = int(center[0]), int(center[1])
        if not (0 <= cy < h and 0 <= cx < w):
            raise ValueError(f"Koordinat notch {center} berada di luar spektrum.")
        pair = symmetric_center((h, w), (cy, cx))
        for py, px in ((cy, cx), pair):
            if (py, px) in unique_centers:
                continue
            unique_centers.add((py, px))
            dy = _periodic_distance(yy, py, h)
            dx = _periodic_distance(xx, px, w)
            distance_squared = dy**2 + dx**2
            one_notch = 1.0 - np.exp(-distance_squared / (2.0 * sigma**2))
            mask *= one_notch

    return np.clip(mask, 0.0, 1.0)


def restore_with_notch(
    image: Array2D,
    centers: Sequence[tuple[int, int]],
    sigma: float = 1.0,
) -> tuple[Array2D, Array2D, Array2D]:
    """Pulihkan citra menggunakan FFT2 -> notch mask -> IFFT2.

    Returns:
        restored: citra hasil rekonstruksi (belum di-clipping)
        spectrum: spektrum log sebelum filter
        mask: notch mask
    """
    arr = np.asarray(image, dtype=np.float64)
    f_shift, spectrum = fft_spectrum(arr)
    mask = build_notch_mask(arr.shape, centers, sigma)
    filtered = f_shift * mask
    restored = np.real(ifft2(ifftshift(filtered)))
    return restored, spectrum, mask


def gaussian_blur(image: Array2D, sigma: float = 1.0) -> Array2D:
    """Metode pembanding blur Gaussian."""
    if sigma < 0:
        raise ValueError("Sigma Gaussian tidak boleh negatif.")
    return gaussian_filter(np.asarray(image, dtype=np.float64), sigma=sigma)


def detect_peak_candidates(
    spectrum: Array2D,
    max_peaks: int = 12,
    min_distance: int = 6,
    exclude_radius: int = 10,
    percentile: float = 99.5,
) -> list[tuple[int, int, float]]:
    """Deteksi kandidat puncak spektrum secara semi-otomatis.

    Hasilnya hanya kandidat untuk diperiksa pengguna, bukan jaminan bahwa semua
    puncak berasal dari gangguan. Pasangan simetris tidak ditampilkan dua kali.
    """
    s = np.asarray(spectrum, dtype=np.float64)
    h, w = s.shape
    if h < 3 or w < 3:
        return []

    yy, xx = np.mgrid[0:h, 0:w]
    cy0, cx0 = h // 2, w // 2
    radius2 = (yy - cy0) ** 2 + (xx - cx0) ** 2
    valid = radius2 >= exclude_radius**2
    if not np.any(valid):
        return []

    threshold = float(np.percentile(s[valid], percentile))
    local_max = s == maximum_filter(s, size=3 * 2 + 1, mode="wrap")
    coords = np.argwhere(valid & local_max & (s >= threshold))
    coords = sorted(coords, key=lambda p: float(s[p[0], p[1]]), reverse=True)

    selected: list[tuple[int, int, float]] = []
    min_d2 = min_distance**2
    for y, x in coords:
        y, x = int(y), int(x)
        pair_y, pair_x = symmetric_center((h, w), (y, x))
        too_close = False
        for sy, sx, _ in selected:
            d1 = min((y - sy) % h, (sy - y) % h)
            d2 = min((x - sx) % w, (sx - x) % w)
            py_dist = min((pair_y - sy) % h, (sy - pair_y) % h)
            px_dist = min((pair_x - sx) % w, (sx - pair_x) % w)
            if d1**2 + d2**2 < min_d2 or py_dist**2 + px_dist**2 < min_d2:
                too_close = True
                break
        if not too_close:
            selected.append((y, x, float(s[y, x])))
        if len(selected) >= max_peaks:
            break
    return selected


def calculate_metrics(reference: Array2D, estimate: Array2D) -> dict[str, float]:
    """Hitung PSNR dan SSIM untuk dua citra grayscale dengan ukuran sama."""
    ref = np.clip(np.asarray(reference, dtype=np.float64), 0.0, 1.0)
    est = np.clip(np.asarray(estimate, dtype=np.float64), 0.0, 1.0)
    if ref.shape != est.shape:
        raise ValueError("Ukuran gambar referensi dan hasil harus sama.")
    psnr = float(peak_signal_noise_ratio(ref, est, data_range=1.0))
    min_side = min(ref.shape)
    win_size = min(7, min_side if min_side % 2 == 1 else min_side - 1)
    if win_size < 3:
        ssim = float("nan")
    else:
        ssim = float(structural_similarity(ref, est, data_range=1.0, win_size=win_size))
    return {"PSNR_dB": psnr, "SSIM": ssim}
