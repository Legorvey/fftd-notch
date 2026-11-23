"""Mini Image Restoration Lab - aplikasi Streamlit FFT 2D + Notch Filter."""
from __future__ import annotations

from io import BytesIO
import zipfile

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st
from PIL import Image, ImageOps
from skimage import data

from camera_pipeline import (
    DEFAULT_NOTCH_SIGMA,
    MODE_REAL,
    MODE_SIMULATION,
    process_camera_frame,
)
from fft2d_notch import (
    auto_detect_notch_centers,
    calculate_metrics,
    detect_peak_candidates,
    fft_spectrum,
    gaussian_blur,
    restore_with_notch,
    symmetric_center,
)
from experiments import run_synthetic_experiment, sigma_sensitivity


st.set_page_config(page_title="Mini Image Restoration Lab", layout="wide")
st.title("Mini Image Restoration Lab")
st.caption("Reduksi gangguan periodik pada citra menggunakan FFT 2D dan notch filtering")


def uploaded_to_array(uploaded_file) -> np.ndarray:
    image = ImageOps.exif_transpose(Image.open(uploaded_file)).convert("L")
    return np.asarray(image, dtype=np.float64) / 255.0


def sample_camera() -> np.ndarray:
    return data.camera().astype(np.float64) / 255.0


def image_png_bytes(array: np.ndarray) -> bytes:
    arr = np.clip(array, 0.0, 1.0)
    img = Image.fromarray(np.uint8(np.round(arr * 255.0)), mode="L")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def figure_png_bytes(array: np.ndarray, cmap: str = "gray") -> bytes:
    fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(array, cmap=cmap)
    ax.axis("off")
    fig.tight_layout(pad=0)
    buffer = BytesIO()
    fig.savefig(buffer, format="png", bbox_inches="tight", pad_inches=0.05, dpi=160)
    plt.close(fig)
    return buffer.getvalue()


def show_image_grid(items: list[tuple[str, np.ndarray, str]], columns: int = 2) -> None:
    rows = int(np.ceil(len(items) / columns))
    fig, axes = plt.subplots(rows, columns, figsize=(6 * columns, 4.6 * rows))
    axes = np.atleast_1d(axes).ravel()
    for ax, (title, arr, cmap) in zip(axes, items):
        ax.imshow(arr, cmap=cmap)
        ax.set_title(title)
        ax.axis("off")
    for ax in axes[len(items):]:
        ax.axis("off")
    fig.tight_layout()
    st.pyplot(fig, width="stretch")
    plt.close(fig)


def make_metric_table(
    reference: np.ndarray, noisy: np.ndarray, blurred: np.ndarray, restored: np.ndarray
) -> pd.DataFrame:
    rows = []
    for name, image in [
        ("Tanpa perbaikan", noisy),
        ("Gaussian blur", blurred),
        ("Notch filter", restored),
    ]:
        row = {"Metode": name}
        row.update(calculate_metrics(reference, image))
        rows.append(row)
    return pd.DataFrame(rows)


def make_results_zip(
    restored: np.ndarray,
    mask: np.ndarray,
    spectrum: np.ndarray,
    blurred: np.ndarray,
    metric_df: pd.DataFrame | None,
) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("hasil_notch.png", image_png_bytes(restored))
        archive.writestr("notch_mask.png", image_png_bytes(mask))
        archive.writestr("spektrum_fft.png", figure_png_bytes(spectrum, "inferno"))
        archive.writestr("gaussian_blur.png", image_png_bytes(blurred))
        if metric_df is not None:
            archive.writestr("metrik_restoration.csv", metric_df.to_csv(index=False).encode("utf-8-sig"))
    return buffer.getvalue()


def make_camera_results_zip(captured_bytes: bytes, result: dict) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("01_foto_kamera_asli.jpg", captured_bytes)
        archive.writestr("02_citra_uji.png", image_png_bytes(result["working"]))
        archive.writestr("03_spektrum_fft.png", figure_png_bytes(result["spectrum"], "inferno"))
        archive.writestr("04_notch_mask.png", image_png_bytes(result["mask"]))
        archive.writestr("05_hasil_notch.png", image_png_bytes(result["restored"]))
        if result["blurred"] is not None:
            archive.writestr("06_gaussian_blur.png", image_png_bytes(result["blurred"]))
        if result["metrics"] is not None:
            rows = [{"Metode": name, **vals} for name, vals in result["metrics"].items()]
            archive.writestr(
                "metrik_kamera.csv", pd.DataFrame(rows).to_csv(index=False).encode("utf-8-sig")
            )
    return buffer.getvalue()


@st.cache_data(ttl=600, max_entries=8, show_spinner=False)
def cached_camera_process(image_bytes: bytes, mode: str, sigma: float) -> dict:
    return process_camera_frame(image_bytes, mode=mode, notch_sigma=sigma)


tab_lab, tab_camera, tab_experiment, tab_help = st.tabs(
    ["Restoration Lab", "Kamera", "Eksperimen Sinusoid", "Petunjuk Penggunaan"]
)

with tab_lab:
    st.subheader("1. Pemulihan gambar yang memiliki pola periodik")
    upload_col, reference_col = st.columns(2)
    with upload_col:
        corrupted_file = st.file_uploader(
            "Upload gambar terganggu (JPG/PNG/PGM)",
            type=["jpg", "jpeg", "png", "pgm"],
            key="corrupted",
        )
    with reference_col:
        reference_file = st.file_uploader(
            "Upload referensi bersih (opsional, untuk PSNR/SSIM)",
            type=["jpg", "jpeg", "png", "pgm"],
            key="reference",
        )

    if corrupted_file is None:
        st.session_state.pop("corrupted_file_id", None)
        st.info("Unggah gambar yang memiliki garis atau pola berulang untuk memulai.")
    else:
        file_id = (corrupted_file.name, corrupted_file.size)
        if st.session_state.get("corrupted_file_id") != file_id:
            st.session_state.corrupted_file_id = file_id
            st.session_state.manual_centers = []

        corrupted = uploaded_to_array(corrupted_file)
        h, w = corrupted.shape
        if h < 4 or w < 4:
            st.error("Ukuran gambar terlalu kecil (minimal 4x4 piksel).")
        else:
            f_shift, spectrum = fft_spectrum(corrupted)
            candidates = detect_peak_candidates(spectrum, max_peaks=16)

            auto_mode = st.checkbox("Deteksi otomatis titik gangguan (Hann + MAD Z-score)", value=False)
            auto_centers: list[tuple[int, int]] = []
            if auto_mode:
                a1, a2 = st.columns(2)
                with a1:
                    z_thresh = st.slider(
                        "Sensitivitas (ambang z, makin kecil makin banyak titik)",
                        3.0,
                        15.0,
                        6.0,
                        0.5,
                    )
                with a2:
                    max_auto = st.slider("Maksimum jumlah titik otomatis", 1, 20, 8)
                auto_centers = auto_detect_notch_centers(corrupted, z_thresh=z_thresh, max_peaks=max_auto)
                st.caption(
                    f"Titik otomatis terdeteksi: {len(auto_centers)} (pasangan simetrisnya ikut ditekan)."
                )

            left, right = st.columns([1, 1])
            with left:
                st.markdown("**Spektrum FFT 2D**")
                st.caption("Pilih koordinat (baris, kolom) dari puncak terang di luar bagian tengah.")
                fig, ax = plt.subplots(figsize=(6, 5))
                ax.imshow(spectrum, cmap="inferno")
                ax.plot(w // 2, h // 2, "c+", markersize=10, label="DC / frekuensi nol")
                for py, px in auto_centers:
                    sy, sx = symmetric_center((h, w), (py, px))
                    ax.plot(px, py, "o", mfc="none", mec="cyan", ms=12)
                    ax.plot(sx, sy, "o", mfc="none", mec="cyan", ms=12)
                ax.set_xlim(0, w - 1)
                ax.set_ylim(h - 1, 0)
                ax.set_xlabel("Kolom spektrum (x)")
                ax.set_ylabel("Baris spektrum (y)")
                ax.legend(loc="upper right")
                fig.tight_layout()
                st.pyplot(fig, width="stretch")
                plt.close(fig)
            with right:
                st.markdown("**Gambar input**")
                st.image(np.clip(corrupted, 0, 1), width="stretch")

            st.markdown("#### Pemilihan frekuensi gangguan")
            st.caption(
                "Koordinat menggunakan posisi piksel pada spektrum yang sudah di-FFT-shift. "
                "Satu titik otomatis dipasangkan dengan frekuensi simetrisnya."
            )
            if "manual_centers" not in st.session_state:
                st.session_state.manual_centers = []
            st.session_state.manual_centers = [
                (y, x) for y, x in st.session_state.manual_centers if 0 <= y < h and 0 <= x < w
            ]

            coord_col1, coord_col2, action_col = st.columns([1, 1, 1])
            with coord_col1:
                point_y = st.number_input(
                    "Baris / y", min_value=0, max_value=h - 1, value=min(h - 1, h // 2 + 20), step=1
                )
            with coord_col2:
                point_x = st.number_input(
                    "Kolom / x", min_value=0, max_value=w - 1, value=min(w - 1, w // 2 + 20), step=1
                )
            with action_col:
                st.write("")
                st.write("")
                if st.button("Tambah titik manual", width="stretch"):
                    point = (int(point_y), int(point_x))
                    if point not in st.session_state.manual_centers:
                        st.session_state.manual_centers.append(point)

            if st.session_state.manual_centers:
                st.write(
                    "Titik manual aktif:",
                    ", ".join([f"(y={y}, x={x})" for y, x in st.session_state.manual_centers]),
                )
            clear_col, auto_col = st.columns([1, 3])
            with clear_col:
                if st.button("Hapus semua titik manual"):
                    st.session_state.manual_centers = []
            with auto_col:
                st.caption("Deteksi kandidat bersifat semi-otomatis: periksa kandidat sebelum menggunakannya.")

            candidate_options = [f"y={y}, x={x} | intensitas={value:.2f}" for y, x, value in candidates]
            selected_candidate_labels = st.multiselect(
                "Pilih kandidat puncak semi-otomatis", options=candidate_options, default=[]
            )
            selected_auto = []
            label_to_point = {
                f"y={y}, x={x} | intensitas={value:.2f}": (y, x)
                for y, x, value in candidates
            }
            for label in selected_candidate_labels:
                selected_auto.append(label_to_point[label])

            all_centers = list(dict.fromkeys(auto_centers + st.session_state.manual_centers + selected_auto))
            sigma = st.slider("Lebar notch (sigma)", min_value=0.3, max_value=10.0, value=1.0, step=0.1)
            blur_sigma = st.slider("Sigma Gaussian blur pembanding", min_value=0.1, max_value=5.0, value=1.2, step=0.1)

            if not all_centers:
                st.warning("Tambahkan titik manual, pilih kandidat, atau aktifkan deteksi otomatis untuk menjalankan notch filter.")
            else:
                restored, _, mask = restore_with_notch(corrupted, all_centers, sigma)
                blurred = gaussian_blur(corrupted, blur_sigma)
                show_image_grid(
                    [
                        ("Input terganggu", corrupted, "gray"),
                        ("Gaussian blur", blurred, "gray"),
                        ("Notch mask", mask, "gray"),
                        ("Hasil notch filter", restored, "gray"),
                    ],
                    columns=2,
                )

                metric_df: pd.DataFrame | None = None
                st.markdown("#### Metrik kualitas")
                if reference_file is not None:
                    reference = uploaded_to_array(reference_file)
                    if reference.shape != corrupted.shape:
                        st.error(
                            f"Ukuran referensi {reference.shape} berbeda dari input {corrupted.shape}. "
                            "Samakan ukuran kedua gambar terlebih dahulu."
                        )
                    else:
                        metric_df = make_metric_table(reference, corrupted, blurred, restored)
                        st.dataframe(metric_df, width="stretch", hide_index=True)
                        st.download_button(
                            "Unduh CSV metrik",
                            data=metric_df.to_csv(index=False).encode("utf-8-sig"),
                            file_name="metrik_restoration.csv",
                            mime="text/csv",
                        )
                else:
                    st.info("PSNR dan SSIM tidak ditampilkan karena gambar referensi bersih belum diunggah.")

                c1, c2, c3, c4 = st.columns(4)
                with c1:
                    st.download_button(
                        "Unduh hasil (PNG)",
                        image_png_bytes(restored),
                        "hasil_notch.png",
                        "image/png",
                        width="stretch",
                    )
                with c2:
                    st.download_button(
                        "Unduh mask (PNG)",
                        image_png_bytes(mask),
                        "notch_mask.png",
                        "image/png",
                        width="stretch",
                    )
                with c3:
                    st.download_button(
                        "Unduh spektrum (PNG)",
                        figure_png_bytes(spectrum, "inferno"),
                        "spektrum_fft.png",
                        "image/png",
                        width="stretch",
                    )
                with c4:
                    st.download_button(
                        "Unduh semua (ZIP)",
                        make_results_zip(restored, mask, spectrum, blurred, metric_df),
                        "hasil_restoration_fft2d.zip",
                        "application/zip",
                        width="stretch",
                    )

with tab_camera:
    st.subheader("2. Kamera web (foto asli & simulasi periodik)")
    cam_left, cam_right = st.columns([1, 2])
    with cam_left:
        cam_mode = st.radio("Mode pemrosesan", [MODE_REAL, MODE_SIMULATION], key="cam_mode")
        cam_sigma = st.slider(
            "Lebar notch kamera (sigma)",
            min_value=0.3,
            max_value=5.0,
            value=DEFAULT_NOTCH_SIGMA,
            step=0.1,
            key="cam_sigma",
        )
    with cam_right:
        camera_photo = st.camera_input("Ambil foto dari kamera web", key="camera_input")

    if camera_photo is not None:
        cam_bytes = camera_photo.getvalue()
        cam_result = cached_camera_process(cam_bytes, cam_mode, cam_sigma)
        st.info(cam_result["message"])
        panels = [
            ("Citra uji", cam_result["working"], "gray"),
            ("Spektrum FFT 2D", cam_result["spectrum"], "inferno"),
            ("Notch mask", cam_result["mask"], "gray"),
            ("Hasil notch", cam_result["restored"], "gray"),
        ]
        show_image_grid(panels, columns=2)
        if cam_result["metrics"] is not None:
            cam_df = pd.DataFrame(
                [{"Metode": name, **vals} for name, vals in cam_result["metrics"].items()]
            )
            st.dataframe(cam_df, width="stretch", hide_index=True)
        st.download_button(
            "Unduh hasil kamera (ZIP)",
            data=make_camera_results_zip(cam_bytes, cam_result),
            file_name="hasil_kamera_fft2d.zip",
            mime="application/zip",
        )

with tab_experiment:
    st.subheader("3. Eksperimen dua sinusoid spasial")
    st.write(
        "Eksperimen terkontrol menggunakan gambar referensi bersih. Dua sinusoid ditambahkan "
        "pada frekuensi bin yang diketahui, kemudian dibandingkan dengan Gaussian blur dan notch filter."
    )
    sample_or_upload = st.radio(
        "Sumber gambar bersih", ["Contoh skimage.camera", "Upload gambar sendiri"], horizontal=True
    )
    clean = None
    if sample_or_upload == "Contoh skimage.camera":
        clean = sample_camera()
        st.image(clean, caption="Gambar referensi bersih: skimage.data.camera", width=350)
    else:
        clean_upload = st.file_uploader(
            "Upload gambar referensi bersih", type=["jpg", "jpeg", "png", "pgm"], key="clean_experiment"
        )
        if clean_upload is not None:
            clean = uploaded_to_array(clean_upload)

    if clean is not None:
        h, w = clean.shape
        if h < 8 or w < 8:
            st.error("Ukuran gambar terlalu kecil untuk eksperimen sinusoid (minimal 8x8 piksel).")
        else:
            max_u = min(100, w // 2 - 1)
            max_v = min(100, h // 2 - 1)
            st.markdown("**Parameter gangguan** (u = siklus arah x, v = siklus arah y)")
            a, b, c, d = st.columns(4)
            with a:
                u1 = st.number_input("u1", 1, max_u, min(24, max_u), key="u1")
                v1 = st.number_input("v1", -max_v, max_v, 0, key="v1")
            with b:
                u2 = st.number_input("u2", -max_u, max_u, 0, key="u2")
                v2 = st.number_input("v2", 1, max_v, min(32, max_v), key="v2")
            with c:
                amp1 = st.slider("Amplitudo 1", 0.01, 0.25, 0.08, 0.01)
                amp2 = st.slider("Amplitudo 2", 0.01, 0.25, 0.08, 0.01)
            with d:
                notch_sigma = st.slider("Sigma notch eksperimen", 0.3, 5.0, 1.0, 0.1, key="experiment_sigma")
                blur_sigma_exp = st.slider("Sigma Gaussian", 0.1, 5.0, 1.2, 0.1)

            components = [
                {"u": int(u1), "v": int(v1), "amplitude": amp1, "phase": 0.0},
                {"u": int(u2), "v": int(v2), "amplitude": amp2, "phase": 0.0},
            ]
            result = run_synthetic_experiment(clean, components, notch_sigma, blur_sigma_exp)
            show_image_grid(
                [
                    ("Referensi bersih", result["clean"], "gray"),
                    ("Setelah diberi gangguan", result["noisy"], "gray"),
                    ("Spektrum FFT 2D", result["spectrum"], "inferno"),
                    ("Mask notch", result["mask"], "gray"),
                    ("Gaussian blur", result["blurred"], "gray"),
                    ("Hasil notch filter", result["restored"], "gray"),
                ],
                columns=3,
            )

            metric_rows = []
            for method, values in result["metrics"].items():
                metric_rows.append({"Metode": method, **values})
            metric_df = pd.DataFrame(metric_rows)
            st.markdown("#### Hasil pengukuran")
            st.dataframe(metric_df, width="stretch", hide_index=True)
            st.download_button(
                "Unduh CSV hasil eksperimen",
                data=metric_df.to_csv(index=False).encode("utf-8-sig"),
                file_name="hasil_eksperimen_fft_notch.csv",
                mime="text/csv",
            )

            st.markdown("#### Analisis sensitivitas sigma")
            sigma_values = [0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 3.0, 4.0]
            sweep_rows = sigma_sensitivity(
                clean, result["noisy"], result["centers"], sigma_values
            )
            sweep_df = pd.DataFrame(sweep_rows)
            st.dataframe(sweep_df, width="stretch", hide_index=True)
            st.download_button(
                "Unduh CSV sensitivitas sigma",
                data=sweep_df.to_csv(index=False).encode("utf-8-sig"),
                file_name="analisis_sensitivitas_sigma.csv",
                mime="text/csv",
            )
            st.caption(
                "Catatan: hasil eksperimen sintetis memakai koordinat frekuensi yang sudah diketahui. "
                "Performa ini tidak otomatis mewakili foto nyata dengan puncak gangguan yang belum diketahui."
            )

with tab_help:
    st.subheader("Petunjuk singkat")
    st.markdown(
        """
        **Restoration Lab**
        1. Upload citra yang memiliki garis atau pola berulang (JPG/PNG/PGM).
        2. Lihat spektrum FFT 2D. Puncak gangguan biasanya tampak sebagai titik terang di luar pusat.
        3. Aktifkan deteksi otomatis (Hann + MAD z-score), pilih kandidat semi-otomatis, atau masukkan koordinat baris (y) dan kolom (x) secara manual.
        4. Atur sigma notch dan bandingkan hasilnya dengan Gaussian blur.
        5. Upload referensi bersih untuk menghitung PSNR dan SSIM. Ukuran referensi harus sama.
        6. Unduh hasil gambar, mask, spektrum, CSV metrik, atau arsip ZIP lengkap.

        **Kamera**
        1. Ambil foto langsung dari kamera web.
        2. Pilih mode foto asli (deteksi otomatis) atau simulasi gangguan periodik.

        **Eksperimen Sinusoid**
        1. Gunakan gambar contoh atau upload gambar bersih.
        2. Atur dua pasangan frekuensi (u, v) dan amplitudonya.
        3. Program membuat gangguan periodik, menjalankan Gaussian blur serta notch filter.
        4. Bandingkan PSNR/SSIM dan unduh tabel sensitivitas sigma.

        **Catatan teknis:** notch filtering cocok untuk gangguan periodik yang menghasilkan puncak spektrum terlokalisasi. Metode ini bukan solusi umum untuk blur atau noise acak.
        """
    )
