import { colors } from './colors';
import { typography, fontFamily } from './typography';
import { spacing, borderRadius, shadows } from './spacing';
import { motion, duration, easing, spring, stagger } from './motion';

export const theme = {
  colors,
  typography,
  fontFamily,
  spacing,
  borderRadius,
  shadows,
  motion,
} as const;

export type Theme = typeof theme;

// Styled-components theme type augmentation
declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}

export { colors } from './colors';
export { typography, fontFamily } from './typography';
export { spacing, borderRadius, shadows } from './spacing';
export { motion, duration, easing, spring, stagger } from './motion';
