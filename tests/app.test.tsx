import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../src/App';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { MetricsTable } from '../src/components/MetricsTable';
import { RestorationLabTab } from '../src/components/RestorationLabTab';
import { SigmaChart } from '../src/components/SigmaChart';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('App navigation and theme controls', () => {
  it('switches tabs via click between Restoration Lab, Kamera Web, Eksperimen Sinusoid, and Petunjuk & Teori', () => {
    render(<App />);

    const labTab = screen.getByRole('tab', { name: 'Restoration Lab' });
    const cameraTab = screen.getByRole('tab', { name: 'Kamera Web' });
    const experimentTab = screen.getByRole('tab', { name: 'Eksperimen Sinusoid' });
    const guideTab = screen.getByRole('tab', { name: 'Petunjuk & Teori' });

    expect(labTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Pemulihan citra dengan pola gangguan periodik' }),
    ).toBeInTheDocument();

    fireEvent.click(cameraTab);
    expect(cameraTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Kamera web: deteksi foto asli dan simulasi periodik' }),
    ).toBeInTheDocument();

    fireEvent.click(experimentTab);
    expect(experimentTab).toHaveAttribute('aria-selected', 'true');
    expect(labTab).toHaveAttribute('aria-selected', 'false');
    expect(
      screen.getByRole('heading', { name: 'Eksperimen dua sinusoid spasial terkontrol' }),
    ).toBeInTheDocument();

    fireEvent.click(guideTab);
    expect(guideTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', {
        name: 'Petunjuk penggunaan dan dasar teori FFT 2D Notch',
      }),
    ).toBeInTheDocument();

    fireEvent.click(labTab);
    expect(labTab).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('heading', { name: 'Pemulihan citra dengan pola gangguan periodik' }),
    ).toBeInTheDocument();
  });

  it('switches tabs and moves focus with ArrowDown, ArrowUp, Home, and End keys', () => {
    render(<App />);

    const labTab = screen.getByRole('tab', { name: 'Restoration Lab' });
    const cameraTab = screen.getByRole('tab', { name: 'Kamera Web' });
    const experimentTab = screen.getByRole('tab', { name: 'Eksperimen Sinusoid' });
    const guideTab = screen.getByRole('tab', { name: 'Petunjuk & Teori' });

    labTab.focus();
    expect(labTab).toHaveFocus();

    fireEvent.keyDown(labTab, { key: 'ArrowDown' });
    expect(cameraTab).toHaveAttribute('aria-selected', 'true');
    expect(cameraTab).toHaveFocus();

    fireEvent.keyDown(cameraTab, { key: 'ArrowDown' });
    expect(experimentTab).toHaveAttribute('aria-selected', 'true');
    expect(experimentTab).toHaveFocus();

    fireEvent.keyDown(experimentTab, { key: 'ArrowDown' });
    expect(guideTab).toHaveAttribute('aria-selected', 'true');
    expect(guideTab).toHaveFocus();

    fireEvent.keyDown(guideTab, { key: 'ArrowDown' });
    expect(labTab).toHaveAttribute('aria-selected', 'true');
    expect(labTab).toHaveFocus();

    fireEvent.keyDown(labTab, { key: 'ArrowUp' });
    expect(guideTab).toHaveAttribute('aria-selected', 'true');
    expect(guideTab).toHaveFocus();

    fireEvent.keyDown(guideTab, { key: 'Home' });
    expect(labTab).toHaveAttribute('aria-selected', 'true');
    expect(labTab).toHaveFocus();

    fireEvent.keyDown(labTab, { key: 'End' });
    expect(guideTab).toHaveAttribute('aria-selected', 'true');
    expect(guideTab).toHaveFocus();

    fireEvent.keyDown(guideTab, { key: 'ArrowUp' });
    expect(experimentTab).toHaveAttribute('aria-selected', 'true');
    expect(experimentTab).toHaveFocus();
  });

  it('toggles theme between dark and light, updating documentElement.dataset.theme and aria-pressed', () => {
    render(<App />);

    const toggleButtons = screen.getAllByRole('button', { name: 'Aktifkan mode terang' });
    const topToggle = toggleButtons[0]!;
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(topToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(topToggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(topToggle).toHaveAttribute('aria-pressed', 'true');
    expect(topToggle).toHaveAttribute('aria-label', 'Aktifkan mode gelap');
    expect(window.localStorage.getItem('mini-restoration-lab-theme')).toBe('light');

    fireEvent.click(topToggle);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(topToggle).toHaveAttribute('aria-pressed', 'false');
    expect(topToggle).toHaveAttribute('aria-label', 'Aktifkan mode terang');
    expect(window.localStorage.getItem('mini-restoration-lab-theme')).toBe('dark');
  });

  it('filters sidebar menu items and collapses/expands desktop sidebar rail', () => {
    render(<App />);

    const searchInput = screen.getByPlaceholderText('Cari menu...');
    fireEvent.change(searchInput, { target: { value: 'sinusoid' } });
    expect(screen.getByRole('tab', { name: 'Eksperimen Sinusoid' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Restoration Lab' })).not.toBeInTheDocument();

    fireEvent.keyDown(searchInput, { key: 'Escape' });
    expect(screen.getByRole('tab', { name: 'Restoration Lab' })).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: 'Ciutkan panel navigasi' });
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapseBtn);
    expect(screen.getByRole('button', { name: 'Luaskan panel navigasi' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});

describe('RestorationLabTab empty state', () => {
  it('displays instructions and an actionable sample-loading button when no image is loaded', () => {
    render(<RestorationLabTab />);

    const emptyHeading = screen.getByRole('heading', { name: 'Belum ada gambar yang dimuat' });
    const emptyState = emptyHeading.closest('.empty-state') as HTMLElement | null;
    expect(emptyState).not.toBeNull();

    const scoped = within(emptyState!);
    expect(
      scoped.getByText(/Pilih gambar dengan gangguan garis periodik dari perangkat Anda/i),
    ).toBeInTheDocument();

    const loadSampleBtn = scoped.getByRole('button', { name: 'Muat sampel Camera + gangguan' });
    expect(loadSampleBtn).toBeEnabled();
  });
});

describe('MetricsTable', () => {
  it('renders PSNR, SSIM, baseline markers, and positive/negative deltas with styling classes', () => {
    render(
      <MetricsTable
        metrics={{
          noCorrection: { psnrDb: 20.0, ssim: 0.5 },
          gaussianBlur: { psnrDb: 18.5, ssim: 0.45 },
          notchFilter: { psnrDb: 36.25, ssim: 0.9612 },
        }}
      />,
    );

    const baselineRow = screen.getByText('Tanpa perbaikan').closest('tr');
    const blurRow = screen.getByText('Gaussian blur').closest('tr');
    const notchRow = screen.getByText('Notch filter').closest('tr');
    expect(baselineRow).not.toBeNull();
    expect(blurRow).not.toBeNull();
    expect(notchRow).not.toBeNull();

    const baselineCells = within(baselineRow!).getAllByRole('cell');
    expect(baselineCells[1]).toHaveTextContent('20.00 dB');
    expect(baselineCells[2]).toHaveTextContent('Acuan');
    expect(baselineCells[3]).toHaveTextContent('0.5000');
    expect(baselineCells[4]).toHaveTextContent('Acuan');

    const blurCells = within(blurRow!).getAllByRole('cell');
    expect(blurCells[1]).toHaveTextContent('18.50 dB');
    expect(blurCells[2]).toHaveTextContent('-1.50 dB');
    expect(blurCells[2]).toHaveClass('metric-delta-neg');
    expect(blurCells[3]).toHaveTextContent('0.4500');
    expect(blurCells[4]).toHaveTextContent('-0.0500');
    expect(blurCells[4]).toHaveClass('metric-delta-neg');

    expect(notchRow).toHaveClass('row-highlight');
    const notchCells = within(notchRow!).getAllByRole('cell');
    expect(notchCells[1]).toHaveTextContent('36.25 dB');
    expect(notchCells[2]).toHaveTextContent('+16.25 dB');
    expect(notchCells[2]).toHaveClass('metric-delta-pos');
    expect(notchCells[3]).toHaveTextContent('0.9612');
    expect(notchCells[4]).toHaveTextContent('+0.4612');
    expect(notchCells[4]).toHaveClass('metric-delta-pos');
  });

  it('formats Infinity PSNR and NaN SSIM values safely without invalid delta classes', () => {
    render(
      <MetricsTable
        metrics={{
          noCorrection: { psnrDb: 20.0, ssim: Number.NaN },
          gaussianBlur: { psnrDb: 20.0, ssim: Number.NaN },
          notchFilter: { psnrDb: Number.POSITIVE_INFINITY, ssim: Number.NaN },
        }}
      />,
    );

    const notchRow = screen.getByText('Notch filter').closest('tr');
    expect(notchRow).not.toBeNull();

    const notchCells = within(notchRow!).getAllByRole('cell');
    expect(notchCells[1]).toHaveTextContent('Tak hingga');
    expect(notchCells[2]).toHaveTextContent('+Tak hingga');
    expect(notchCells[2]).toHaveClass('metric-delta-pos');
    expect(notchCells[3]).toHaveTextContent('Tidak tersedia');
    expect(notchCells[4]).toHaveTextContent('Tidak tersedia');
  });
});

describe('SyntheticExperimentTab numeric input drafting', () => {
  it('allows typing a negative sign and clearing frequency inputs without snapping prematurely', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Eksperimen Sinusoid' }));

    const v1Input = screen.getByLabelText(/Frekuensi v1/i) as HTMLInputElement;
    fireEvent.change(v1Input, { target: { value: '-' } });
    expect(v1Input.value).toBe('-');
    fireEvent.change(v1Input, { target: { value: '-14' } });
    expect(v1Input.value).toBe('-14');

    const u1Input = screen.getByLabelText(/Frekuensi u1/i) as HTMLInputElement;
    fireEvent.change(u1Input, { target: { value: '' } });
    expect(u1Input.value).toBe('');
    fireEvent.change(u1Input, { target: { value: '30' } });
    expect(u1Input.value).toBe('30');
  });
});

describe('SigmaChart', () => {
  const sweep = [
    { sigma: 0.5, psnrDb: 34.12, ssim: 0.9412 },
    { sigma: 1.0, psnrDb: 41.85, ssim: 0.9854 },
    { sigma: 2.0, psnrDb: 37.4, ssim: 0.9601 },
  ];

  it('displays the optimal sigma summary and calls onSelectSigma when clicking a sigma button', () => {
    const onSelectSigma = vi.fn();
    render(<SigmaChart sweep={sweep} activeSigma={0.5} onSelectSigma={onSelectSigma} />);

    expect(
      screen.getByText(/Sigma optimal pada kurva ini:/i),
    ).toHaveTextContent(/Sigma optimal pada kurva ini:\s*1\.0\s*\(PSNR 41\.85 dB, SSIM 0\.9854\)/);

    const activeBtn = screen.getByRole('button', { name: 'sigma 0.5' });
    const targetBtn = screen.getByRole('button', { name: 'sigma 2.0' });
    expect(activeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(targetBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(targetBtn);
    expect(onSelectSigma).toHaveBeenCalledTimes(1);
    expect(onSelectSigma).toHaveBeenCalledWith(2.0);
    expect(
      screen.getByText(/Titik dipilih: sigma=2\.0 \| PSNR 37\.40 dB \| SSIM 0\.9601/),
    ).toBeInTheDocument();
  });

  it('renders nothing when sweep data is empty', () => {
    const { container } = render(<SigmaChart sweep={[]} activeSigma={1.0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ErrorBoundary', () => {
  function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
      throw new Error('Simulasi galat render');
    }
    return <p>Konten pulih normal</p>;
  }

  it('catches a child render error and recovers when clicking Muat ulang tampilan', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole('alert');
      expect(within(alert).getByText('Aplikasi mengalami kesalahan tampilan.')).toBeInTheDocument();
      expect(within(alert).getByText('Simulasi galat render')).toBeInTheDocument();

      rerender(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={false} />
        </ErrorBoundary>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Muat ulang tampilan' }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Konten pulih normal')).toBeInTheDocument();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
