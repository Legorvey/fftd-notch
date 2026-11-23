import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

const REDUCED_MOTION_STORAGE_KEY = 'mini-restoration-lab-reduced-motion';

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(REDUCED_MOTION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useMotionPreferences() {
  const systemReduced = Boolean(useReducedMotion());
  const [userReduced, setUserReduced] = useState<boolean>(readStoredPreference);
  const [isCoarsePointer, setIsCoarsePointer] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = (e: MediaQueryListEvent) => setIsCoarsePointer(e.matches);
    setIsCoarsePointer(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const toggleUserReduced = () => {
    setUserReduced((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage write errors in restricted browsing modes.
      }
      return next;
    });
  };

  // System reduced-motion always wins; user toggle can only add reduction, never force full motion.
  const reducedMotion = systemReduced || userReduced;

  return {
    reducedMotion,
    systemReduced,
    userReduced,
    isCoarsePointer,
    toggleUserReduced,
  };
}
