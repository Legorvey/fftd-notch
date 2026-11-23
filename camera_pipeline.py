"""Pipeline kamera untuk Mini Image Restoration Lab.

Modul ini tidak bergantung pada Streamlit sehingga mudah diuji secara terpisah.
Foto diubah menjadi grayscale, lalu diproses dalam mode foto asli atau simulasi
noise periodik terkontrol.
"""
from __future__ import annotations

from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from experiments import add_periodic_noise, known_notch_centers
from fft2d_notch import (
    calculate_metrics,
    fft_spectrum,
    gaussian_blur,
    recommend_peak_centers,
    restore_with_notch,
    symmetric_center,
)

MODE_REAL = "Foto asli (deteksi otomatis)"
MODE_SIMULATION = "Simulasi gangguan periodik"
DEFAULT_NOTCH_SIGMA = 1.2
DEFAULT_BLUR_SIGMA = 1.2
DEFAULT_MAX_DIMENSION = 1024


def decode_image_bytes(image_bytes: bytes, max_dimension: int = DEFAULT_MAX_DIMENSION) -> np.ndarray:
    """Baca gambar bytes, koreksi orientasi EXIF, resize, dan ubah ke grayscale 0..1."""
    if not image_bytes:
        raise ValueError("Data gambar kosong.")
    if max_dimension < 64:
        raise ValueError("max_dimension minimal 64 piksel.")

    try:
        with Image.open(BytesIO(image_bytes)) as source:
            image = ImageOps.exif_transpose(source).convert("L")
            width, height = image.size
            longest = max(width, height)
            if longest > max_dimension:
                scale = max_dimension / float(longest)
                new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
                resampling = getattr(Image, "Resampling", Image).LANCZOS
                image = image.resize(new_size, resampling)
            arr = np.asarray(image, dtype=np.float64) / 255.0
    except Exception as exc:
        raise ValueError(f"Gambar tidak dapat dibaca: {exc}") from exc

    if arr.ndim != 2 or min(arr.shape) < 16:
        raise ValueError("Ukuran gambar terlalu kecil untuk analisis FFT 2D.")
    return np.clip(arr, 0.0, 1.0)


def _simulation_components(shape: tuple[int, int], amplitude: float = 0.06) -> list[dict[str, float | int]]:
    """Buat dua komponen periodik: satu menghasilkan garis vertikal, satu horizontal."""
    height, width = shape
    # Frekuensi berada dalam batas Nyquist dan cukup jauh dari DC.
    u = min(24, max(4, width // 20), max(1, width // 2 - 1))
    v = min(30, max(4, height // 17), max(1, height // 2 - 1))
    return [
        {"u": int(u), "v": 0, "amplitude": float(amplitude), "phase": 0.0},
        {"u": 0, "v": int(v), "amplitude": float(amplitude), "phase": 0.0},
    ]


def process_camera_frame(
    image_bytes: bytes,
    mode: str = MODE_REAL,
    notch_sigma: float = DEFAULT_NOTCH_SIGMA,
    max_dimension: int = DEFAULT_MAX_DIMENSION,
) -> dict[str, Any]:
    """Jalankan pemrosesan otomatis setelah kamera menghasilkan foto.

    MODE_REAL:
        mencari kandidat puncak dominan dan menerapkan notch jika ditemukan.
        Tidak menghitung PSNR/SSIM karena foto asli bukan ground truth yang
        diketahui bebas gangguan.

    MODE_SIMULATION:
        menggunakan foto sebagai referensi bersih, menambahkan dua sinusoid
        terkontrol, kemudian memulihkannya pada koordinat frekuensi yang diketahui.
        PSNR/SSIM valid untuk eksperimen sintetis ini.
    """
    if notch_sigma <= 0:
        raise ValueError("Sigma notch harus lebih besar dari 0.")

    clean = decode_image_bytes(image_bytes, max_dimension=max_dimension)
    _, spectrum = fft_spectrum(clean)
    blurred: np.ndarray | None = None
    noise: np.ndarray | None = None
    metrics: dict[str, dict[str, float]] | None = None
    components: list[dict[str, float | int]] = []
    candidates: list[tuple[int, int, float]] = []

    if mode == MODE_SIMULATION:
        components = _simulation_components(clean.shape)
        working, noise = add_periodic_noise(clean, components)
        centers = known_notch_centers(clean.shape, components)
        restored, spectrum, mask = restore_with_notch(working, centers, notch_sigma)
        blurred = gaussian_blur(working, DEFAULT_BLUR_SIGMA)
        metrics = {
            "Tanpa perbaikan": calculate_metrics(clean, np.clip(working, 0.0, 1.0)),
            "Gaussian blur": calculate_metrics(clean, np.clip(blurred, 0.0, 1.0)),
            "Notch filter": calculate_metrics(clean, np.clip(restored, 0.0, 1.0)),
        }
        status = "simulated"
        message = "Dua sinusoid sintetis telah ditambahkan dan ditekan pada frekuensi yang diketahui."
    elif mode == MODE_REAL:
        working = clean.copy()
        candidates = recommend_peak_centers(spectrum, max_peaks=2, relative_threshold=0.90)
        centers = [(int(y), int(x)) for y, x, _ in candidates]
        if centers:
            restored, spectrum, mask = restore_with_notch(working, centers, notch_sigma)
            blurred = gaussian_blur(working, DEFAULT_BLUR_SIGMA)
            status = "filtered"
            message = (
                "Kandidat puncak dominan ditemukan dan Notch Filter diterapkan. "
                "Periksa spektrum untuk memastikan puncak tersebut benar-benar gangguan periodik."
            )
        else:
            restored = clean.copy()
            mask = np.ones_like(clean)
            status = "no_peak"
            message = (
                "Tidak ditemukan puncak periodik yang cukup menonjol. Foto ditampilkan tanpa "
                "filter agar detail asli tidak terhapus secara sembarang."
            )
    else:
        raise ValueError(f"Mode pemrosesan tidak dikenal: {mode}")

    return {
        "mode": mode,
        "status": status,
        "message": message,
        "clean": clean,
        "working": np.asarray(working, dtype=np.float64),
        "noise": noise,
        "restored": np.clip(restored, 0.0, 1.0),
        "blurred": None if blurred is None else np.clip(blurred, 0.0, 1.0),
        "spectrum": spectrum,
        "mask": mask,
        "centers": centers,
        "candidates": candidates,
        "components": components,
        "metrics": metrics,
        "notch_sigma": float(notch_sigma),
        "blur_sigma": DEFAULT_BLUR_SIGMA,
    }


def array_to_png_bytes(array: np.ndarray, clip: bool = True) -> bytes:
    """Encode grayscale array menjadi PNG bytes."""
    arr = np.asarray(array, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError("Ekspor hanya mendukung array grayscale 2D.")
    if clip:
        arr = np.clip(arr, 0.0, 1.0)
    else:
        lo, hi = float(np.nanmin(arr)), float(np.nanmax(arr))
        arr = np.zeros_like(arr) if hi <= lo else (arr - lo) / (hi - lo)
    image = Image.fromarray(np.uint8(np.round(arr * 255.0)))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def spectrum_png_bytes(spectrum: np.ndarray, centers: list[tuple[int, int]] | None = None) -> bytes:
    """Ekspor spektrum FFT dengan penanda pusat notch."""
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(spectrum, cmap="inferno")
    for y, x in centers or []:
        py, px = symmetric_center(spectrum.shape, (y, x))
        ax.scatter([x, px], [y, py], s=70, facecolors="none", edgecolors="cyan", linewidths=1.5)
    ax.set_title("Spektrum FFT 2D")
    ax.axis("off")
    fig.tight_layout(pad=0.2)
    buffer = BytesIO()
    fig.savefig(buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    return buffer.getvalue()
