/**
 * Jinni — scoped theme tokens.
 *
 * Per the UI rebrand spec (section 3), these colors are reserved for Jinni
 * moments ONLY: the lamp tab icon, the Chirag overlay, the splash wordmark,
 * and the small "Try Jinni" / "Order with Jinni" touchpoints called out in
 * section 7. They are NOT merged into the global `colors` palette and must
 * never be used to restyle Home/Food/commerce screens at large — importing
 * from here anywhere outside `/modules/jinni` (and the few explicitly listed
 * touchpoints) is a spec violation.
 */
export const jinniColors = {
  // Deep purple / royal violet — the "mystical" half of the palette.
  purple: {
    50: '#F4F0FC',
    100: '#E6DBF8',
    200: '#CBB4F0',
    300: '#A77EE3',
    400: '#7E4FD1',
    500: '#5E2FB8',
    600: '#4A2294',
    700: '#391A73',
    800: '#2A1354',
    900: '#1A0C35',
  },

  // Metallic / champagne gold — the "magic" half of the palette.
  gold: {
    50: '#FDF8EC',
    100: '#FAEEC9',
    200: '#F3DD96',
    300: '#E9C45E',
    400: '#DDA935',
    500: '#C9971A', // champagne gold — primary Jinni accent
    600: '#A87A12',
    700: '#825C0E',
    800: '#5C400A',
    900: '#3A2706',
  },

  // Three visually-distinguishable Chirag states (section 6.1, scenes 5-7).
  glow: {
    listening: '#E9C45E', // warm gold
    thinking: '#A77EE3', // cooler violet shimmer
    speaking: '#DDA935', // steady warm gold
  },

  smoke: ['rgba(255,251,240,0.85)', 'rgba(243,221,150,0.35)', 'rgba(94,47,184,0.08)'],

  // Warm low-opacity scrim behind the overlay (section 6.1, scene 3) —
  // deliberately not a hard black modal backdrop.
  scrim: 'rgba(42,19,84,0.38)',

  cream: '#FFFCF5',

  success: '#E9C45E', // sparkle-burst accent, distinct from the app's green `success`
} as const;

export type JinniColors = typeof jinniColors;
export default jinniColors;
