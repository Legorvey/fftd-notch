import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'motion/react';
import { MOTION_SPRING } from '../motion/tokens';

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
  mobileTriggerRef: RefObject<HTMLButtonElement | null>;
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

interface SidebarContentProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onQuickSample: (sample: QuickSampleKind) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  isDrawer: boolean;
  onCloseMobile: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  filterText: string;
  onFilterTextChange: (val: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

function SidebarContent({
  activeTab,
  onSelectTab,
  onQuickSample,
  collapsed,
  onToggleCollapse,
  isDrawer,
  onCloseMobile,
  theme,
  onToggleTheme,
  filterText,
  onFilterTextChange,
  searchInputRef,
}: SidebarContentProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const searchId = useId();
  const isCompact = !isDrawer && collapsed;

  const query = filterText.trim().toLowerCase();
  const visibleNavItems = query
    ? NAV_ITEMS.filter(
        (item) =>
          item.label.toLowerCase().includes(query) || item.keywords.includes(query),
      )
    : NAV_ITEMS;

  // Ensure at least one visible tab remains keyboard-focusable even if the active tab is filtered out.
  const activeIsVisible = visibleNavItems.some((item) => item.id === activeTab);
  const focusableTabId = activeIsVisible ? activeTab : visibleNavItems[0]?.id ?? null;

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
    <>
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
          {!isCompact ? (
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-title">FFTD Notch</span>
              <span className="sidebar-brand-meta">Image Restoration Lab</span>
            </div>
          ) : null}
        </div>

        {!isDrawer ? (
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
        ) : (
          <Dialog.Close asChild>
            <button
              type="button"
              className="sidebar-collapse-btn"
              aria-label="Tutup menu navigasi"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </Dialog.Close>
        )}
      </div>

      {!isCompact ? (
        <div className="sidebar-search-wrap">
          <label htmlFor={searchId} className="sr-only">
            Cari menu atau alat
          </label>
          <input
            ref={searchInputRef}
            id={searchId}
            type="search"
            value={filterText}
            onChange={(e) => onFilterTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onFilterTextChange('');
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
          {!isCompact ? <div className="sidebar-group-label">Ruang Kerja</div> : null}
          <nav aria-label={isDrawer ? 'Menu navigasi mobile' : 'Menu utama laboratorium'}>
            <div
              className="sidebar-nav-list"
              role="tablist"
              aria-orientation="vertical"
              aria-label="Pilihan tampilan lab"
            >
              {visibleNavItems.length === 0 ? (
                <p className="sidebar-empty-hint">Tidak ada menu yang cocok.</p>
              ) : (
                visibleNavItems.map((item, index) => {
                  const isActive = activeTab === item.id;
                  const isFocusable = focusableTabId === item.id;
                  return (
                    <motion.button
                      key={item.id}
                      ref={(el) => {
                        tabRefs.current[index] = el;
                      }}
                      id={isDrawer ? `drawer-tab-${item.id}` : `tab-${item.id}`}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`panel-${item.id}`}
                      tabIndex={isFocusable ? 0 : -1}
                      aria-label={item.label}
                      title={isCompact ? item.label : undefined}
                      className={`sidebar-nav-item${isActive ? ' is-active' : ''}`}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        onSelectTab(item.id);
                        if (isDrawer) onCloseMobile();
                      }}
                      onKeyDown={(e) => handleTabKeyDown(e, index)}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId={isDrawer ? 'drawer-active-pill' : 'sidebar-active-pill'}
                          className="sidebar-active-pill"
                          aria-hidden="true"
                          transition={MOTION_SPRING.indicator}
                        />
                      ) : null}
                      <span className="sidebar-nav-icon">
                        <NavIcon id={item.id} />
                      </span>
                      {!isCompact ? <span className="sidebar-nav-label">{item.label}</span> : null}
                    </motion.button>
                  );
                })
              )}
            </div>
          </nav>
        </div>

        {!isCompact ? (
          <>
            <div className="sidebar-group">
              <div className="sidebar-group-label">Sampel Cepat</div>
              <div className="sidebar-nav-list">
                <button
                  type="button"
                  className="sidebar-nav-item"
                  onClick={() => {
                    onQuickSample('camera_periodic');
                    if (isDrawer) onCloseMobile();
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
                    if (isDrawer) onCloseMobile();
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
          title={isCompact ? (theme === 'dark' ? 'Mode Terang' : 'Mode Gelap') : undefined}
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
          {!isCompact ? (
            <span className="sidebar-nav-label">
              {theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
            </span>
          ) : null}
        </button>

        {!isCompact ? <div className="sidebar-credit">PSD Kelompok H · Unpad</div> : null}
      </div>
    </>
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
  mobileTriggerRef,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const [filterText, setFilterText] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard shortcut: press 'f' outside inputs to focus desktop sidebar filter.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (isTyping) return;
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (!collapsed && searchInputRef.current && searchInputRef.current.offsetParent !== null) {
          event.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [collapsed]);

  return (
    <>
      <aside
        id="app-sidebar"
        className={`app-sidebar app-sidebar-desktop${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Navigasi ruang kerja"
      >
        <SidebarContent
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onQuickSample={onQuickSample}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          isDrawer={false}
          onCloseMobile={onCloseMobile}
          theme={theme}
          onToggleTheme={onToggleTheme}
          filterText={filterText}
          onFilterTextChange={setFilterText}
          searchInputRef={searchInputRef}
        />
      </aside>

      <Dialog.Root
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) onCloseMobile();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="sidebar-backdrop" />
          <Dialog.Content
            id="mobile-nav-drawer"
            className="app-sidebar app-sidebar-drawer"
            data-lenis-prevent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileTriggerRef.current?.focus();
            }}
          >
            <Dialog.Title className="sr-only">Navigasi ruang kerja FFTD Notch</Dialog.Title>
            <Dialog.Description className="sr-only">
              Pilih tab laboratorium, sampel cepat, atau ubah tema tampilan.
            </Dialog.Description>
            <SidebarContent
              activeTab={activeTab}
              onSelectTab={onSelectTab}
              onQuickSample={onQuickSample}
              collapsed={false}
              onToggleCollapse={onToggleCollapse}
              isDrawer
              onCloseMobile={onCloseMobile}
              theme={theme}
              onToggleTheme={onToggleTheme}
              filterText={filterText}
              onFilterTextChange={setFilterText}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
