"""Mini Image Restoration Lab - aplikasi Streamlit FFT 2D + Notch Filter."""
from __future__ import annotations

from io import BytesIO

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st
from PIL import Image
from skimage import data

from fft2d_notch import (
    calculate_metrics,
    detect_peak_candidates,
    fft_spectrum,
    gaussian_blur,
    restore_with_notch,
)
from experiments import run_synthetic_experiment, sigma_sensitivity


st.set_page_config(page_title="Mini Image Restoration Lab", page_icon="〰️", layout="wide")
st.title("Mini Image Restoration Lab")
st.caption("Reduksi gangguan periodik pada citra menggunakan FFT 2D dan notch filtering")


def uploaded_to_array(uploaded_file) -> np.ndarray:
    image = Image.open(uploaded_file).convert("L")
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
    st.pyplot(fig, use_container_width=True)
    plt.close(fig)


def make_metric_table(reference: np.ndarray, noisy: np.ndarray, blurred: np.ndarray, restored: np.ndarray) -> pd.DataFrame:
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


tab_lab, tab_experiment, tab_help = st.tabs(
    ["Restoration Lab", "Eksperimen Sinusoid", "Petunjuk Penggunaan"]
)

with tab_lab:
    st.subheader("1. Pemulihan gambar yang memiliki pola periodik")
    upload_col, reference_col = st.columns(2)
    with upload_col:
        corrupted_file = st.file_uploader(
            "Upload gambar terganggu (JPG/PNG)", type=["jpg", "jpeg", "png"], key="corrupted"
        )
    with reference_col:
        reference_file = st.file_uploader(
            "Upload referensi bersih (opsional, untuk PSNR/SSIM)",
            type=["jpg", "jpeg", "png"], key="reference"
        )

    if corrupted_file is None:
        st.info("Unggah gambar yang memiliki garis atau pola berulang untuk memulai.")
    else:
        corrupted = uploaded_to_array(corrupted_file)
        h, w = corrupted.shape
        f_shift, spectrum = fft_spectrum(corrupted)
        candidates = detect_peak_candidates(spectrum, max_peaks=16)

        left, right = st.columns([1, 1])
        with left:
            st.markdown("**Spektrum FFT 2D**")
            st.caption("Pilih koordinat (baris, kolom) dari puncak terang di luar bagian tengah.")
            fig, ax = plt.subplots(figsize=(6, 5))
            ax.imshow(spectrum, cmap="inferno")
            ax.plot(w // 2, h // 2, "c+", markersize=10, label="DC / frekuensi nol")
            ax.set_xlim(0, w - 1)
            ax.set_ylim(h - 1, 0)
            ax.set_xlabel("Kolom spektrum (x)")
            ax.set_ylabel("Baris spektrum (y)")
            ax.legend(loc="upper right")
            fig.tight_layout()
            st.pyplot(fig, use_container_width=True)
            plt.close(fig)
        with right:
            st.markdown("**Gambar input**")
            st.image(np.clip(corrupted, 0, 1), use_container_width=True)

        st.markdown("#### Pemilihan frekuensi gangguan")
        st.caption(
            "Koordinat menggunakan posisi piksel pada spektrum yang sudah di-FFT-shift. "
            "Satu titik otomatis dipasangkan dengan frekuensi simetrisnya."
        )
        if "manual_centers" not in st.session_state:
            st.session_state.manual_centers = []

        coord_col1, coord_col2, action_col = st.columns([1, 1, 1])
        with coord_col1:
            point_y = st.number_input("Baris / y", min_value=0, max_value=h - 1, value=min(h - 1, h // 2 + 20), step=1)
        with coord_col2:
            point_x = st.number_input("Kolom / x", min_value=0, max_value=w - 1, value=min(w - 1, w // 2 + 20), step=1)
        with action_col:
            st.write("")
            st.write("")
            if st.button("Tambah titik manual", use_container_width=True):
                point = (int(point_y), int(point_x))
                if point not in st.session_state.manual_centers:
                    st.session_state.manual_centers.append(point)

        if st.session_state.manual_centers:
            st.write("Titik manual aktif:", ", ".join([f"(y={y}, x={x})" for y, x in st.session_state.manual_centers]))
        clear_col, auto_col = st.columns([1, 3])
        with clear_col:
            if st.button("Hapus semua titik manual"):
                st.session_state.manual_centers = []
        with auto_col:
            st.caption("Deteksi otomatis bersifat semi-otomatis: periksa kandidat sebelum menggunakannya.")

        candidate_options = [f"y={y}, x={x} | intensitas={value:.2f}" for y, x, value in candidates]
        selected_candidate_labels = st.multiselect(
            "Pilih kandidat puncak otomatis", options=candidate_options, default=[]
        )
        selected_auto = []
        label_to_point = {
            f"y={y}, x={x} | intensitas={value:.2f}": (y, x)
            for y, x, value in candidates
        }
        for label in selected_candidate_labels:
            selected_auto.append(label_to_point[label])

        all_centers = list(dict.fromkeys(st.session_state.manual_centers + selected_auto))
        sigma = st.slider("Lebar notch (sigma)", min_value=0.3, max_value=10.0, value=1.0, step=0.1)
        blur_sigma = st.slider("Sigma Gaussian blur pembanding", min_value=0.1, max_value=5.0, value=1.2, step=0.1)

        if not all_centers:
            st.warning("Tambahkan titik manual atau pilih kandidat otomatis agar notch filter dapat dijalankan.")
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
                    st.dataframe(metric_df, use_container_width=True, hide_index=True)
                    st.download_button(
                        "Unduh CSV metrik",
                        data=metric_df.to_csv(index=False).encode("utf-8-sig"),
                        file_name="metrik_restoration.csv",
                        mime="text/csv",
                    )
            else:
                st.info("PSNR dan SSIM tidak ditampilkan karena gambar referensi bersih belum diunggah.")

            c1, c2, c3 = st.columns(3)
            with c1:
                st.download_button("Unduh hasil (PNG)", image_png_bytes(restored), "hasil_notch.png", "image/png", use_container_width=True)
            with c2:
                st.download_button("Unduh mask (PNG)", image_png_bytes(mask), "notch_mask.png", "image/png", use_container_width=True)
            with c3:
                st.download_button("Unduh spektrum (PNG)", figure_png_bytes(spectrum, "inferno"), "spektrum_fft.png", "image/png", use_container_width=True)

with tab_experiment:
    st.subheader("2. Eksperimen dua sinusoid spasial")
    st.write(
        "Eksperimen terkontrol menggunakan gambar referensi bersih. Dua sinusoid ditambahkan "
        "pada frekuensi bin yang diketahui, kemudian dibandingkan dengan Gaussian blur dan notch filter."
    )
    sample_or_upload = st.radio("Sumber gambar bersih", ["Contoh skimage.camera", "Upload gambar sendiri"], horizontal=True)
    clean = None
    if sample_or_upload == "Contoh skimage.camera":
        clean = sample_camera()
        st.image(clean, caption="Gambar referensi bersih: skimage.data.camera", width=350)
    else:
        clean_upload = st.file_uploader("Upload gambar referensi bersih", type=["jpg", "jpeg", "png"], key="clean_experiment")
        if clean_upload is not None:
            clean = uploaded_to_array(clean_upload)

    if clean is not None:
        h, w = clean.shape
        max_u = max(1, min(100, w // 2 - 1))
        max_v = max(1, min(100, h // 2 - 1))
        st.markdown("**Parameter gangguan** (u = siklus arah x, v = siklus arah y)")
        a, b, c, d = st.columns(4)
        with a:
            u1 = st.number_input("u₁", 1, max_u, min(24, max_u), key="u1")
            v1 = st.number_input("v₁", -max_v, max_v, 0, key="v1")
        with b:
            u2 = st.number_input("u₂", -max_u, max_u, 0, key="u2")
            v2 = st.number_input("v₂", 1, max_v, min(32, max_v), key="v2")
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
        st.dataframe(metric_df, use_container_width=True, hide_index=True)
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
        st.dataframe(sweep_df, use_container_width=True, hide_index=True)
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
        1. Upload citra yang memiliki garis atau pola berulang.
        2. Lihat spektrum FFT 2D. Puncak gangguan biasanya tampak sebagai titik terang di luar pusat.
        3. Masukkan koordinat baris (y) dan kolom (x), lalu tekan **Tambah titik manual**; atau pilih kandidat otomatis.
        4. Atur sigma notch dan bandingkan hasilnya dengan Gaussian blur.
        5. Upload referensi bersih untuk menghitung PSNR dan SSIM. Ukuran referensi harus sama.
        6. Unduh hasil gambar, mask, spektrum, dan CSV metrik.

        **Eksperimen Sinusoid**
        1. Gunakan gambar contoh atau upload gambar bersih.
        2. Atur dua pasangan frekuensi (u, v) dan amplitudonya.
        3. Program membuat gangguan periodik, menjalankan Gaussian blur serta notch filter.
        4. Bandingkan PSNR/SSIM dan unduh tabel sensitivitas sigma.

        **Catatan teknis:** notch filtering cocok untuk gangguan periodik yang menghasilkan puncak spektrum terlokalisasi. Metode ini bukan solusi umum untuk blur atau noise acak.
        """
    )
