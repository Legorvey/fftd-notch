import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { RestorationLabTab } from './components/RestorationLabTab';
import { Sidebar, type ActiveTab, type QuickSampleKind, type ThemeMode } from './components/Sidebar';

const CameraTab = lazy(() =>
  import('./components/CameraTab').then((m) => ({ default: m.CameraTab })),
);
const SyntheticExperimentTab = lazy(() =>
  import('./components/SyntheticExperimentTab').then((m) => ({
    default: m.SyntheticExperimentTab,
  })),
);
const GuideTab = lazy(() =>
  import('./components/GuideTab').then((m) => ({ default: m.GuideTab })),
);

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
    <MotionConfig reducedMotion="user">
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
            <motion.div
              key={activeTab === 'lab' ? 'lab-active' : 'lab-hidden'}
              hidden={activeTab !== 'lab'}
              initial={activeTab === 'lab' ? { opacity: 0, y: 10 } : false}
              animate={activeTab === 'lab' ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <ErrorBoundary inline>
                <RestorationLabTab quickSampleRequest={quickSampleRequest} />
              </ErrorBoundary>
            </motion.div>

            {visitedTabs.camera ? (
              <motion.div
                key={activeTab === 'camera' ? 'camera-active' : 'camera-hidden'}
                hidden={activeTab !== 'camera'}
                initial={activeTab === 'camera' ? { opacity: 0, y: 10 } : false}
                animate={activeTab === 'camera' ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary inline>
                  <Suspense
                    fallback={
                      <div className="panel loading-panel" role="status" aria-live="polite">
                        <span className="busy-pill">Memuat modul Kamera Web...</span>
                      </div>
                    }
                  >
                    <CameraTab />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            ) : null}

            {visitedTabs.experiment ? (
              <motion.div
                key={activeTab === 'experiment' ? 'experiment-active' : 'experiment-hidden'}
                hidden={activeTab !== 'experiment'}
                initial={activeTab === 'experiment' ? { opacity: 0, y: 10 } : false}
                animate={activeTab === 'experiment' ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary inline>
                  <Suspense
                    fallback={
                      <div className="panel loading-panel" role="status" aria-live="polite">
                        <span className="busy-pill">Memuat modul Eksperimen Sinusoid...</span>
                      </div>
                    }
                  >
                    <SyntheticExperimentTab />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
            ) : null}

            {visitedTabs.guide ? (
              <motion.div
                key={activeTab === 'guide' ? 'guide-active' : 'guide-hidden'}
                hidden={activeTab !== 'guide'}
                initial={activeTab === 'guide' ? { opacity: 0, y: 10 } : false}
                animate={activeTab === 'guide' ? { opacity: 1, y: 0 } : undefined}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <ErrorBoundary inline>
                  <Suspense
                    fallback={
                      <div className="panel loading-panel" role="status" aria-live="polite">
                        <span className="busy-pill">Memuat Petunjuk & Teori...</span>
                      </div>
                    }
                  >
                    <GuideTab />
                  </Suspense>
                </ErrorBoundary>
              </motion.div>
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
    </MotionConfig>
  );
}

export default App;
