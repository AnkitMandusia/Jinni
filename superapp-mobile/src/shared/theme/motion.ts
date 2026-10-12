import { Easing } from 'react-native-reanimated';

// Centralized motion tokens so every screen animates with the same feel.
// Durations are in ms. Keep "fast" for micro-interactions (press, toggle),
// "normal" for section/card reveals, "slow" for full-screen transitions.
export const duration = {
  fast: 150,
  normal: 280,
  slow: 420,
} as const;

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.out(Easing.cubic),
  accelerate: Easing.in(Easing.cubic),
  spring: Easing.out(Easing.back(1.2)),
} as const;

// Shared spring config for Reanimated's withSpring (press feedback, sheets)
export const spring = {
  gentle: { damping: 18, stiffness: 180, mass: 0.6 },
  snappy: { damping: 16, stiffness: 260, mass: 0.5 },
} as const;

// Stagger delay (ms) between sibling items in a revealed list/grid.
export const stagger = {
  tight: 35,
  normal: 60,
} as const;

export const motion = { duration, easing, spring, stagger } as const;
export type Motion = typeof motion;
export default motion;
