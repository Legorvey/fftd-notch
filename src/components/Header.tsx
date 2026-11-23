import { useRef, type KeyboardEvent } from 'react';

export type ActiveTab = 'lab' | 'experiment' | 'guide';
export type ThemeMode = 'dark' | 'light';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

const TABS: ReadonlyArray<{ id: ActiveTab; label: string }> = [
  { id: 'lab', label: 'Restoration Lab' },
  { id: 'experiment', label: 'Eksperimen Sinusoid' },
  { id: 'guide', label: 'Petunjuk' },
];

export function Header({ activeTab, onSelectTab, theme, onToggleTheme }: HeaderProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const targetTab = TABS[nextIndex]!;
      onSelectTab(targetTab.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="1.5" x2="10" y2="18.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="1.5" y1="10" x2="18.5" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="6" cy="6" r="1.5" fill="currentColor" />
              <circle cx="14" cy="14" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <div className="brand-text">
            <h1 className="brand-title">Mini Image Restoration Lab</h1>
            <p className="brand-subtitle">Reduksi gangguan periodik dengan FFT 2D dan Gaussian notch filter</p>
          </div>
        </div>

        <nav className="header-nav-wrap" aria-label="Navigasi utama lab">
          <div className="header-nav" role="tablist" aria-label="Pilihan tampilan lab">
            {TABS.map((tab, index) => (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className="tab-button"
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, index)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

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
