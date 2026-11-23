import { useEffect, useRef, useState } from 'react';
import { CameraTab } from './components/CameraTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GuideTab } from './components/GuideTab';
import { Header } from './components/Header';
import { RestorationLabTab } from './components/RestorationLabTab';
import { Sidebar, type ActiveTab, type QuickSampleKind, type ThemeMode } from './components/Sidebar';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSampleRequest, setQuickSampleRequest] = useState<{
    id: number;
    kind: QuickSampleKind;
  } | null>(null);

  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures in restricted browsing modes.
    }
  }, [theme]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const handleQuickSample = (kind: QuickSampleKind) => {
    handleSelectTab('lab');
    setQuickSampleRequest((prev) => ({ id: (prev?.id ?? 0) + 1, kind }));
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const closeMobile = () => {
    setMobileMenuOpen(false);
    mobileTriggerRef.current?.focus();
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Langsung ke konten utama
      </a>

      {mobileMenuOpen ? (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={closeMobile}
        />
      ) : null}

      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onQuickSample={handleQuickSample}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className="app-main-column">
        <Header
          activeTab={activeTab}
          theme={theme}
          onToggleTheme={toggleTheme}
          mobileOpen={mobileMenuOpen}
          onOpenMobile={() => setMobileMenuOpen(true)}
          mobileTriggerRef={mobileTriggerRef}
        />

        <main id="main-content" className="main-workspace">
          <div className="workspace-inner">
            <div hidden={activeTab !== 'lab'}>
              <ErrorBoundary inline>
                <RestorationLabTab quickSampleRequest={quickSampleRequest} />
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

            <footer className="site-footer">
              <div className="footer-inner">
                <span>Mini Image Restoration Lab (Proyek PSD Kelompok H, FFT 2D dan Notch Filter)</span>
                <span>Pemrosesan 100% lokal di browser (Web Worker, Float64 FFT)</span>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
