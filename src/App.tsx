import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { RestorationLabTab } from './components/RestorationLabTab';
import { Sidebar, type ActiveTab, type QuickSampleKind, type ThemeMode } from './components/Sidebar';
import { useMotionPreferences } from './motion/useMotionPreferences';
import { useScopedSmoothScroll } from './motion/useScopedSmoothScroll';

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
  const [labHasImage, setLabHasImage] = useState(false);
  const [quickSampleRequest, setQuickSampleRequest] = useState<{
    id: number;
    kind: QuickSampleKind;
  } | null>(null);

  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement | null>(null);
  const scrollPositionsRef = useRef<Record<ActiveTab, number>>({
    lab: 0,
    camera: 0,
    experiment: 0,
    guide: 0,
  });

  const { reducedMotion, systemReduced, isCoarsePointer, toggleUserReduced } =
    useMotionPreferences();

  // Scoped Lenis smooth scroll on desktop presentation surfaces (empty intro & guide).
  // Native scrolling is preserved during precision workbench editing, mobile touch, and reduced motion.
  const smoothScrollEnabled =
    !reducedMotion &&
    !isCoarsePointer &&
    (activeTab === 'guide' || (activeTab === 'lab' && !labHasImage));

  useScopedSmoothScroll({
    wrapperRef: workspaceRef,
    contentRef: workspaceContentRef,
    enabled: smoothScrollEnabled,
    locked: mobileMenuOpen,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage write failures in restricted browsing modes.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', reducedMotion ? 'true' : 'false');
  }, [reducedMotion]);

  const handleSelectTab = useCallback(
    (nextTab: ActiveTab) => {
      if (workspaceRef.current) {
        scrollPositionsRef.current[activeTab] = workspaceRef.current.scrollTop;
      }
      setActiveTab(nextTab);
      setVisitedTabs((prev) => (prev[nextTab] ? prev : { ...prev, [nextTab]: true }));
      window.requestAnimationFrame(() => {
        if (workspaceRef.current) {
          workspaceRef.current.scrollTop = scrollPositionsRef.current[nextTab] ?? 0;
        }
      });
    },
    [activeTab],
  );

  const handleQuickSample = useCallback(
    (kind: QuickSampleKind) => {
      handleSelectTab('lab');
      setQuickSampleRequest((prev) => ({ id: (prev?.id ?? 0) + 1, kind }));
    },
    [handleSelectTab],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          Langsung ke konten utama
        </a>

        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onQuickSample={handleQuickSample}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
          mobileTriggerRef={mobileTriggerRef}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <div className="app-main-column">
          <Header
            activeTab={activeTab}
            theme={theme}
            onToggleTheme={toggleTheme}
            reducedMotion={reducedMotion}
            systemReduced={systemReduced}
            onToggleReducedMotion={toggleUserReduced}
            onOpenGuide={() => handleSelectTab('guide')}
            mobileOpen={mobileMenuOpen}
            onOpenMobile={() => setMobileMenuOpen(true)}
            mobileTriggerRef={mobileTriggerRef}
          />

          <main ref={workspaceRef} id="main-content" className="main-workspace">
            <div ref={workspaceContentRef} className="workspace-inner">
              <div className="tab-pane" hidden={activeTab !== 'lab'}>
                <ErrorBoundary inline>
                  <RestorationLabTab
                    isActive={activeTab === 'lab'}
                    quickSampleRequest={quickSampleRequest}
                    onOpenGuide={() => handleSelectTab('guide')}
                    onHasImageChange={setLabHasImage}
                    scrollContainerRef={workspaceRef}
                    reducedMotion={reducedMotion}
                  />
                </ErrorBoundary>
              </div>

              {visitedTabs.camera ? (
                <div className="tab-pane" hidden={activeTab !== 'camera'}>
                  <ErrorBoundary inline>
                    <Suspense
                      fallback={
                        <div className="panel loading-panel" role="status" aria-live="polite">
                          <span className="busy-pill">Memuat modul Kamera Web...</span>
                        </div>
                      }
                    >
                      <CameraTab isActive={activeTab === 'camera'} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              ) : null}

              {visitedTabs.experiment ? (
                <div className="tab-pane" hidden={activeTab !== 'experiment'}>
                  <ErrorBoundary inline>
                    <Suspense
                      fallback={
                        <div className="panel loading-panel" role="status" aria-live="polite">
                          <span className="busy-pill">Memuat modul Eksperimen Sinusoid...</span>
                        </div>
                      }
                    >
                      <SyntheticExperimentTab isActive={activeTab === 'experiment'} />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              ) : null}

              {visitedTabs.guide ? (
                <div className="tab-pane" hidden={activeTab !== 'guide'}>
                  <ErrorBoundary inline>
                    <Suspense
                      fallback={
                        <div className="panel loading-panel" role="status" aria-live="polite">
                          <span className="busy-pill">Memuat Petunjuk & Teori...</span>
                        </div>
                      }
                    >
                      <GuideTab
                        onTrySample={() => handleQuickSample('camera_periodic')}
                        scrollContainerRef={workspaceRef}
                        reducedMotion={reducedMotion}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              ) : null}

              <footer className="site-footer">
                <div className="footer-inner">
                  <span>Mini Image Restoration Lab · Proyek PSD Kelompok H, Universitas Padjadjaran</span>
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
