"""Jalankan eksperimen sintetis dari terminal tanpa membuka Streamlit."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image
from skimage import data

from experiments import run_synthetic_experiment, sigma_sensitivity


def load_grayscale(path: str | None) -> np.ndarray:
    if path:
        return np.asarray(Image.open(path).convert("L"), dtype=np.float64) / 255.0
    return data.camera().astype(np.float64) / 255.0


def save_image(array: np.ndarray, path: Path) -> None:
    arr = np.clip(array, 0.0, 1.0)
    Image.fromarray(np.uint8(np.round(arr * 255.0)), mode="L").save(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Eksperimen FFT 2D dan notch filter")
    parser.add_argument("--input", type=str, default=None, help="Path gambar referensi bersih (opsional)")
    parser.add_argument("--output", type=str, default="hasil_eksperimen", help="Folder output")
    parser.add_argument("--u1", type=int, default=24)
    parser.add_argument("--v1", type=int, default=0)
    parser.add_argument("--u2", type=int, default=0)
    parser.add_argument("--v2", type=int, default=32)
    parser.add_argument("--amplitude", type=float, default=0.08)
    parser.add_argument("--sigma", type=float, default=1.0)
    args = parser.parse_args()

    clean = load_grayscale(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    components = [
        {"u": args.u1, "v": args.v1, "amplitude": args.amplitude, "phase": 0.0},
        {"u": args.u2, "v": args.v2, "amplitude": args.amplitude, "phase": 0.0},
    ]
    result = run_synthetic_experiment(clean, components, notch_sigma=args.sigma)

    save_image(result["clean"], output_dir / "01_referensi_bersih.png")
    save_image(result["noisy"], output_dir / "02_gambar_terganggu.png")
    save_image(result["blurred"], output_dir / "03_gaussian_blur.png")
    save_image(result["restored"], output_dir / "04_hasil_notch.png")
    save_image(result["mask"], output_dir / "05_notch_mask.png")

    # Simpan spektrum sebagai citra normalisasi untuk inspeksi.
    spectrum = result["spectrum"]
    spectrum_norm = (spectrum - spectrum.min()) / (spectrum.max() - spectrum.min() + 1e-12)
    save_image(spectrum_norm, output_dir / "06_spektrum_fft.png")

    metrics = pd.DataFrame(
        [{"Metode": name, **values} for name, values in result["metrics"].items()]
    )
    metrics.to_csv(output_dir / "metrik_eksperimen.csv", index=False)

    sigmas = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 4.0]
    sweep = pd.DataFrame(
        sigma_sensitivity(clean, result["noisy"], result["centers"], sigmas)
    )
    sweep.to_csv(output_dir / "sensitivitas_sigma.csv", index=False)

    print("Eksperimen selesai.")
    print(f"Folder hasil: {output_dir.resolve()}")
    print(metrics.to_string(index=False))
    print("\nSensitivitas sigma:")
    print(sweep.to_string(index=False))


if __name__ == "__main__":
    main()
