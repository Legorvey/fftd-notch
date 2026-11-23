"""Eksperimen gangguan sinusoid sintetis dan analisis sensitivitas sigma."""
from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np

from fft2d_notch import calculate_metrics, gaussian_blur, restore_with_notch


def add_periodic_noise(
    clean: np.ndarray,
    components: Sequence[dict],
) -> tuple[np.ndarray, np.ndarray]:
    """Tambahkan sinusoid spasial pada citra.

    Setiap komponen berisi u (siklus arah x), v (siklus arah y), amplitude,
    dan phase (radian). Nilai keluaran noisy tidak di-clipping agar komponen
    sinusoid tetap tepat pada bin FFT yang ditentukan.
    """
    image = np.asarray(clean, dtype=np.float64)
    if image.ndim != 2:
        raise ValueError("Citra harus grayscale 2D.")
    h, w = image.shape
    y, x = np.mgrid[0:h, 0:w]
    noise = np.zeros_like(image)

    for item in components:
        u = int(item["u"])
        v = int(item["v"])
        amplitude = float(item.get("amplitude", 0.08))
        phase = float(item.get("phase", 0.0))
        if abs(u) > w // 2 or abs(v) > h // 2:
            raise ValueError("Frekuensi sinusoid tidak boleh melewati batas Nyquist.")
        noise += amplitude * np.sin(2.0 * np.pi * (u * x / w + v * y / h) + phase)

    return image + noise, noise


def known_notch_centers(
    shape: tuple[int, int], components: Sequence[dict]
) -> list[tuple[int, int]]:
    """Konversi frekuensi sinusoid (u,v) ke koordinat spektrum FFT-shift."""
    h, w = shape
    cy, cx = h // 2, w // 2
    centers = []
    for item in components:
        u, v = int(item["u"]), int(item["v"])
        centers.append(((cy + v) % h, (cx + u) % w))
    return centers


def run_synthetic_experiment(
    clean: np.ndarray,
    components: Sequence[dict],
    notch_sigma: float = 1.0,
    blur_sigma: float = 1.2,
) -> dict:
    """Jalankan noisy, Gaussian blur, notch filter, dan pengukuran kualitas."""
    noisy, noise = add_periodic_noise(clean, components)
    centers = known_notch_centers(clean.shape, components)
    restored, spectrum, mask = restore_with_notch(noisy, centers, notch_sigma)
    blurred = gaussian_blur(noisy, blur_sigma)

    metrics = {
        "No correction": calculate_metrics(clean, noisy),
        "Gaussian blur": calculate_metrics(clean, blurred),
        "Notch filter": calculate_metrics(clean, restored),
    }
    return {
        "clean": np.asarray(clean, dtype=np.float64),
        "noisy": noisy,
        "noise": noise,
        "blurred": blurred,
        "restored": restored,
        "spectrum": spectrum,
        "mask": mask,
        "centers": centers,
        "metrics": metrics,
    }


def sigma_sensitivity(
    clean: np.ndarray,
    noisy: np.ndarray,
    centers: Sequence[tuple[int, int]],
    sigma_values: Iterable[float],
) -> list[dict[str, float]]:
    """Uji beberapa lebar notch dan kembalikan metrik tiap sigma."""
    rows = []
    for sigma in sigma_values:
        restored, _, _ = restore_with_notch(noisy, centers, float(sigma))
        row = {"sigma": float(sigma)}
        row.update(calculate_metrics(clean, restored))
        rows.append(row)
    return rows
