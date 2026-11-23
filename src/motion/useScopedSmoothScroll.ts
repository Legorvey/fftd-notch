import { useEffect, type RefObject } from 'react';
import Lenis from 'lenis';

interface ScopedSmoothScrollOptions {
  wrapperRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  locked: boolean;
}

/**
 * Scoped Lenis smooth scroll attached to the desktop workspace scroll container.
 * - Single RAF owner via Lenis `autoRaf: true`.
 * - Automatically disabled on mobile/coarse pointer, reduced motion, or workbench editing.
 * - Restores native scrolling cleanly when disabled or unmounted (StrictMode safe).
 */
export function useScopedSmoothScroll({
  wrapperRef,
  contentRef,
  enabled,
  locked,
}: ScopedSmoothScrollOptions) {
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;
    if (!enabled || !wrapper || !content) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (window.matchMedia('(max-width: 959px)').matches) return;

    const lenis = new Lenis({
      wrapper,
      content,
      lerp: 0.12,
      smoothWheel: true,
      autoRaf: true,
      prevent: (node) => {
        if (!(node instanceof Element)) return false;
        return Boolean(
          node.closest(
            '[data-lenis-prevent], canvas, input, textarea, select, [role="dialog"], .table-wrap, .formula-block',
          ),
        );
      },
    });

    if (locked) {
      lenis.stop();
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        lenis.resize();
      });
      resizeObserver.observe(content);
    }

    return () => {
      resizeObserver?.disconnect();
      lenis.destroy();
    };
  }, [wrapperRef, contentRef, enabled, locked]);
}
