"""Uji pipeline kamera tanpa menjalankan antarmuka Streamlit."""
import unittest
from io import BytesIO

import numpy as np
from PIL import Image
from skimage import data

from camera_pipeline import (
    MODE_REAL,
    MODE_SIMULATION,
    decode_image_bytes,
    process_camera_frame,
)


def make_jpeg_bytes(array: np.ndarray) -> bytes:
    image = Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=95)
    return buffer.getvalue()


class TestCameraPipeline(unittest.TestCase):
    def setUp(self):
        self.clean = data.camera().astype(np.float64) / 255.0
        self.image_bytes = make_jpeg_bytes(self.clean)

    def test_camera_bytes_decode_to_grayscale(self):
        image = decode_image_bytes(self.image_bytes, max_dimension=256)
        self.assertEqual(image.ndim, 2)
        self.assertEqual(max(image.shape), 256)
        self.assertGreaterEqual(float(image.min()), 0.0)
        self.assertLessEqual(float(image.max()), 1.0)

    def test_simulation_mode_returns_metrics_and_restoration(self):
        result = process_camera_frame(self.image_bytes, mode=MODE_SIMULATION, notch_sigma=1.2)
        self.assertEqual(result["status"], "simulated")
        self.assertEqual(len(result["centers"]), 2)
        self.assertIsNotNone(result["metrics"])
        before = result["metrics"]["Tanpa perbaikan"]["PSNR_dB"]
        after = result["metrics"]["Notch filter"]["PSNR_dB"]
        self.assertGreater(after, before + 10.0)
        self.assertEqual(result["clean"].shape, result["restored"].shape)

    def test_real_photo_mode_does_not_claim_reference_metrics(self):
        result = process_camera_frame(self.image_bytes, mode=MODE_REAL, notch_sigma=1.2)
        self.assertIn(result["status"], {"filtered", "no_peak"})
        self.assertIsNone(result["metrics"])
        self.assertEqual(result["clean"].shape, result["restored"].shape)

    def test_invalid_sigma_rejected(self):
        with self.assertRaises(ValueError):
            process_camera_frame(self.image_bytes, mode=MODE_SIMULATION, notch_sigma=0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
