export const MOTION_DURATION = {
  micro: 0.14,
  state: 0.2,
  panel: 0.26,
  hero: 0.52,
  chart: 0.42,
} as const;

export const MOTION_EASE = {
  reveal: [0.22, 1, 0.36, 1] as const,
  standard: [0.2, 0, 0, 1] as const,
} as const;

export const MOTION_SPRING = {
  indicator: {
    type: 'spring' as const,
    stiffness: 380,
    damping: 34,
    mass: 0.75,
  },
  chip: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 32,
    mass: 0.7,
  },
} as const;
