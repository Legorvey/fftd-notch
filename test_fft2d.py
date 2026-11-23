"""Uji fungsi inti tanpa perlu menjalankan antarmuka Streamlit."""
import unittest

import numpy as np
from skimage import data

from experiments import add_periodic_noise, known_notch_centers
from fft2d_notch import (
    calculate_metrics,
    fft_spectrum,
    recommend_peak_centers,
    restore_with_notch,
    symmetric_center,
)


class TestFFT2DNotch(unittest.TestCase):
    def setUp(self):
        self.clean = data.camera().astype(np.float64) / 255.0
        self.components = [
            {"u": 24, "v": 0, "amplitude": 0.08, "phase": 0.0},
            {"u": 0, "v": 32, "amplitude": 0.08, "phase": 0.0},
        ]
        self.noisy, _ = add_periodic_noise(self.clean, self.components)

    def test_auto_detection_finds_two_periodic_components(self):
        _, spectrum = fft_spectrum(self.noisy)
        candidates = recommend_peak_centers(spectrum)
        detected = {(y, x) for y, x, _ in candidates}
        shape = self.clean.shape
        for expected in known_notch_centers(shape, self.components):
            expected_pair = {expected, symmetric_center(shape, expected)}
            self.assertTrue(
                any({point, symmetric_center(shape, point)} == expected_pair for point in detected),
                msg=f"Puncak {expected_pair} tidak terdeteksi; hasil={detected}",
            )

    def test_notch_improves_synthetic_image_metrics(self):
        _, spectrum = fft_spectrum(self.noisy)
        centers = [(y, x) for y, x, _ in recommend_peak_centers(spectrum)]
        restored, _, mask = restore_with_notch(self.noisy, centers, sigma=1.2)
        before = calculate_metrics(self.clean, self.noisy)
        after = calculate_metrics(self.clean, restored)
        self.assertGreater(after["PSNR_dB"], before["PSNR_dB"] + 10.0)
        self.assertGreater(after["SSIM"], before["SSIM"])
        self.assertEqual(restored.shape, self.clean.shape)
        self.assertEqual(mask.shape, self.clean.shape)

    def test_invalid_sigma_is_rejected(self):
        with self.assertRaises(ValueError):
            restore_with_notch(self.noisy, [(256, 280)], sigma=0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
