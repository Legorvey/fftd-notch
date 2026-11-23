import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CameraTab } from './components/CameraTab';
import { GuideTab } from './components/GuideTab';
import { Header, type ActiveTab, type ThemeMode } from './components/Header';
import { RestorationLabTab } from './components/RestorationLabTab';
import { SyntheticExperimentTab } from './components/SyntheticExperimentTab';

const THEME_STORAGE_KEY = 'mini-restoration-lab-theme';

function readInitialTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Fallback to dark-first instrument default when storage is unavailable.
  }
  return 'dark';
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('lab');
  const [visitedTabs, setVisitedTabs] = useState<Record<ActiveTab, boolean>>({
    lab: true,
    camera: false,
    experiment: false,
    guide: false,
  });
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures in restricted browsing modes.
    }
  }, [theme]);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Langsung ke konten utama
      </a>

      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main id="main-content" className="main-container">
        <div hidden={activeTab !== 'lab'}>
          <ErrorBoundary inline>
            <RestorationLabTab />
          </ErrorBoundary>
        </div>

        {visitedTabs.camera ? (
          <div hidden={activeTab !== 'camera'}>
            <ErrorBoundary inline>
              <CameraTab />
            </ErrorBoundary>
          </div>
        ) : null}

        {visitedTabs.experiment ? (
          <div hidden={activeTab !== 'experiment'}>
            <ErrorBoundary inline>
              <SyntheticExperimentTab />
            </ErrorBoundary>
          </div>
        ) : null}

        {visitedTabs.guide ? (
          <div hidden={activeTab !== 'guide'}>
            <ErrorBoundary inline>
              <GuideTab />
            </ErrorBoundary>
          </div>
        ) : null}
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>Mini Image Restoration Lab (Proyek PSD Kelompok H, FFT 2D dan Notch Filter)</span>
          <span>Pemrosesan 100% lokal di browser (Web Worker, Float64 FFT)</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
