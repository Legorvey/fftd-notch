import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';

export type ActiveTab = 'lab' | 'camera' | 'experiment' | 'guide';
export type ThemeMode = 'dark' | 'light';
export type QuickSampleKind = 'camera_periodic' | 'boy_noisy';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onQuickSample: (sample: QuickSampleKind) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  keywords: string;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'lab', label: 'Restoration Lab', shortLabel: 'Lab', keywords: 'fft notch restorasi unggah pgm' },
  { id: 'camera', label: 'Kamera Web', shortLabel: 'Kamera', keywords: 'webcam foto simulasi' },
  { id: 'experiment', label: 'Eksperimen Sinusoid', shortLabel: 'Sinusoid', keywords: 'sinusoid sigma psnr ssim' },
  { id: 'guide', label: 'Petunjuk & Teori', shortLabel: 'Petunjuk', keywords: 'teori rumus bantuan panduan' },
];

function NavIcon({ id }: { id: ActiveTab }) {
  if (id === 'lab') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6.2" cy="6.2" r="1.2" fill="currentColor" />
        <circle cx="13.8" cy="13.8" r="1.2" fill="currentColor" />
      </svg>
    );
  }
  if (id === 'camera') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M3 7.5A2 2 0 0 1 5 5.5h1.7l1.2-1.8h4.2l1.2 1.8H15a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="11" r="2.8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  if (id === 'experiment') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M2.5 10c1.4-4.2 3.1-4.2 4.5 0s3.1 4.2 4.5 0 3.1-4.2 4.5 0 1.5 2 1.5 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line x1="2.5" y1="16" x2="17.5" y2="16" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="2.5" width="13" height="15" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="10.5" x2="13.5" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="6.5" y1="14" x2="10.5" y2="14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Sidebar({
  activeTab,
  onSelectTab,
  onQuickSample,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const [filterText, setFilterText] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchId = useId();

  // Keyboard shortcut: press 'f' outside inputs to focus sidebar filter.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (isTyping) return;
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!collapsed) {
          event.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed]);

  const query = filterText.trim().toLowerCase();
  const visibleNavItems = query
    ? NAV_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(query) || item.keywords.includes(query),
      )
    : NAV_ITEMS;

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = visibleNavItems.length;
    if (count === 0) return;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % count;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + count) % count;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = count - 1;
    }
    if (nextIndex !== null) {
      event.preventDefault();
      const target = visibleNavItems[nextIndex]!;
      onSelectTab(target.id);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <aside
      id="app-sidebar"
      className={`app-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
      aria-label="Navigasi ruang kerja"
    >
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10" y1="1.5" x2="10" y2="18.5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="1.5" y1="10" x2="18.5" y2="10" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="6" cy="6" r="1.5" fill="currentColor" />
              <circle cx="14" cy="14" r="1.5" fill="currentColor" />
            </svg>
          </div>
          {!collapsed ? (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">Mini Restoration Lab</span>
              <span className="sidebar-brand-meta">FFT 2D · Notch Filter</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="sidebar-collapse-btn desktop-only-btn"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Luaskan panel navigasi' : 'Ciutkan panel navigasi'}
          title={collapsed ? 'Luaskan sidebar' : 'Ciutkan sidebar'}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {collapsed ? (
              <path d="M8 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        {mobileOpen ? (
          <button
            type="button"
            className="sidebar-collapse-btn mobile-only-btn"
            onClick={onCloseMobile}
            aria-label="Tutup menu navigasi"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="sidebar-search-wrap">
          <label htmlFor={searchId} className="sr-only">
            Cari menu atau alat
          </label>
          <input
            ref={searchInputRef}
            id={searchId}
            type="search"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilterText('');
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="Cari menu..."
            className="sidebar-search-input"
          />
          <kbd className="sidebar-kbd" aria-hidden="true">
            F
          </kbd>
        </div>
      ) : null}

      <div className="sidebar-scroll">
        <div className="sidebar-group">
          {!collapsed ? <div className="sidebar-group-label">Ruang Kerja</div> : null}
          <nav aria-label="Menu utama laboratorium">
            <div className="sidebar-nav-list" role="tablist" aria-orientation="vertical" aria-label="Pilihan tampilan lab">
              {visibleNavItems.length === 0 ? (
                <p className="sidebar-empty-hint">Tidak ada menu yang cocok.</p>
              ) : (
                visibleNavItems.map((item, index) => {
                  const isActive = activeTab === item.id;
                  return (
                    <motion.button
                      key={item.id}
                      ref={(el) => {
                        tabRefs.current[index] = el;
                      }}
                      id={`tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`panel-${item.id}`}
                      tabIndex={isActive ? 0 : -1}
                      aria-label={item.label}
                      title={collapsed ? item.label : undefined}
                      className={`sidebar-nav-item${isActive ? ' is-active' : ''}`}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        onSelectTab(item.id);
                        onCloseMobile();
                      }}
                      onKeyDown={(e) => handleTabKeyDown(e, index)}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId="sidebar-active-pill"
                          className="sidebar-active-pill"
                          aria-hidden="true"
                          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                        />
                      ) : null}
                      <span className="sidebar-nav-icon">
                        <NavIcon id={item.id} />
                      </span>
                      {!collapsed ? <span className="sidebar-nav-label">{item.label}</span> : null}
                    </motion.button>
                  );
                })
              )}
            </div>
          </nav>
        </div>

        {!collapsed ? (
          <>
            <div className="sidebar-group">
              <div className="sidebar-group-label">Sampel Cepat</div>
              <div className="sidebar-nav-list">
                <button
                  type="button"
                  className="sidebar-nav-item"
                  onClick={() => {
                    onQuickSample('camera_periodic');
                    onCloseMobile();
                  }}
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M6 13l3-3 2.5 2.5L14 10l2 3H6z" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="sidebar-nav-label">Camera + Sinusoid</span>
                </button>
                <button
                  type="button"
                  className="sidebar-nav-item"
                  onClick={() => {
                    onQuickSample('boy_noisy');
                    onCloseMobile();
                  }}
                >
                  <span className="sidebar-nav-icon" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <rect x="3" y="3" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="5" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="5" y1="13" x2="15" y2="13" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </span>
                  <span className="sidebar-nav-label">Boy Noisy (.pgm)</span>
                </button>
              </div>
            </div>

            <div className="sidebar-group">
              <div className="sidebar-group-label">Spesifikasi Mesin</div>
              <div className="sidebar-spec-card">
                <div className="sidebar-spec-row">
                  <span>Transformasi</span>
                  <span className="mono-value">Float64 FFT</span>
                </div>
                <div className="sidebar-spec-row">
                  <span>Eksekusi</span>
                  <span className="mono-value">Web Worker</span>
                </div>
                <div className="sidebar-spec-row">
                  <span>Privasi</span>
                  <span className="mono-value">100% Lokal</span>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-nav-item"
          onClick={onToggleTheme}
          aria-pressed={theme === 'light'}
          aria-label={theme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
          title={collapsed ? (theme === 'dark' ? 'Mode Terang' : 'Mode Gelap') : undefined}
        >
          <span className="sidebar-nav-icon" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
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
          </span>
          {!collapsed ? (
            <span className="sidebar-nav-label">
              {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            </span>
          ) : null}
        </button>

        {!collapsed ? <div className="sidebar-credit">PSD Kelompok H</div> : null}
      </div>
    </aside>
  );
}
