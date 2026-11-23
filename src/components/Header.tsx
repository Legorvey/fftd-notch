import type { RefObject } from 'react';
import type { ActiveTab, ThemeMode } from './Sidebar';

interface HeaderProps {
  activeTab: ActiveTab;
  theme: ThemeMode;
  onToggleTheme: () => void;
  reducedMotion: boolean;
  systemReduced: boolean;
  onToggleReducedMotion: () => void;
  onOpenGuide: () => void;
  mobileOpen: boolean;
  onOpenMobile: () => void;
  mobileTriggerRef: RefObject<HTMLButtonElement | null>;
}

const TAB_TITLES: Record<ActiveTab, string> = {
  lab: 'Restoration Lab',
  camera: 'Kamera Web',
  experiment: 'Eksperimen Sinusoid',
  guide: 'Petunjuk & Teori',
};

export function Header({
  activeTab,
  theme,
  onToggleTheme,
  reducedMotion,
  systemReduced,
  onToggleReducedMotion,
  onOpenGuide,
  mobileOpen,
  onOpenMobile,
  mobileTriggerRef,
}: HeaderProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <button
          ref={mobileTriggerRef}
          type="button"
          className="btn btn-compact mobile-menu-trigger"
          onClick={onOpenMobile}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav-drawer"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Menu</span>
        </button>

        <div className="breadcrumb" aria-label="Lokasi halaman saat ini">
          <h1 className="top-bar-title">FFTD Notch</h1>
          <span className="breadcrumb-sep" aria-hidden="true">
            /
          </span>
          <span className="breadcrumb-current">{TAB_TITLES[activeTab]}</span>
        </div>
      </div>

      <div className="top-bar-right">
        {activeTab !== 'guide' ? (
          <button
            type="button"
            className="btn btn-compact header-help-btn"
            onClick={onOpenGuide}
            aria-label="Buka Petunjuk dan Teori"
          >
            <span>Panduan</span>
          </button>
        ) : null}

        <button
          type="button"
          className="btn btn-compact btn-toggle header-motion-btn"
          onClick={onToggleReducedMotion}
          disabled={systemReduced}
          aria-pressed={reducedMotion}
          title={
            systemReduced
              ? 'Animasi dikurangi mengikuti pengaturan sistem operasi Anda'
              : 'Kurangi animasi dan efek parallax'
          }
          aria-label="Animasi dikurangi"
        >
          <span>{reducedMotion ? 'Gerak minimal' : 'Animasi'}</span>
        </button>

        <button
          type="button"
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-pressed={theme === 'light'}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {theme === 'dark' ? (
              <>
                <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M10 2V4.2M10 15.8V18M2 10H4.2M15.8 10H18M4.3 4.3L5.9 5.9M14.1 14.1L15.7 15.7M15.7 4.3L14.1 5.9M5.9 14.1L4.3 15.7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <path
                d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            )}
          </svg>
          <span>{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
        </button>
      </div>
    </header>
  );
}
