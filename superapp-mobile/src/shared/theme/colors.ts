export const colors = {
  // Primary brand colors — deep indigo. Confident, trustworthy, distinct
  // from the green/orange clone look. Used for primary CTAs, selected
  // states, active nav, links.
  primary: {
    50: '#EEF1FD',
    100: '#D6DDFA',
    200: '#AEBBF5',
    300: '#7E94EE',
    400: '#5570E6',
    500: '#3A50D9',
    600: '#2D3EC2',
    700: '#242F99',
    800: '#1C2575',
    900: '#141A52',
  },

  // Secondary accent — warm coral, reserved for food-specific highlights
  // (bestseller tags, offers, spice/veg markers), never the dominant color.
  secondary: {
    50: '#FFF1EC',
    100: '#FFDACB',
    200: '#FFB49C',
    300: '#FF8D6E',
    400: '#FF6B47',
    500: '#F2522C',
    600: '#D43F1E',
    700: '#A9311A',
    800: '#7D2615',
    900: '#541A0F',
  },

  // Semantic colors — kept distinct from brand so status always reads
  // unambiguously regardless of primary/secondary usage nearby.
  success: {
    light: '#E3F6EC',
    DEFAULT: '#1C9A5B',
    dark: '#0E5C37',
  },
  warning: {
    light: '#FFF4DE',
    DEFAULT: '#E08A1E',
    dark: '#7A4A0A',
  },
  error: {
    light: '#FDECEC',
    DEFAULT: '#D6413A',
    dark: '#7D1F1B',
  },
  info: {
    light: '#E8EFFD',
    DEFAULT: '#3A6FD9',
    dark: '#1D3C80',
  },

  // Grayscale — slightly warm-neutral so it sits well against the coral
  // accent, with a true near-black for primary text (not pure gray-900
  // navy-tinted, for legibility and a premium, inky feel).
  gray: {
    50: '#FAFAF9',
    100: '#F3F2F0',
    200: '#E6E4E1',
    300: '#D2CFCA',
    400: '#A3A09A',
    500: '#78746D',
    600: '#56524C',
    700: '#3D3A35',
    800: '#262420',
    900: '#17160F',
  },

  // Order / delivery status colors — distinct hues per stage so a status
  // pill or tracking timeline never has to double up with success/error.
  status: {
    placed: '#78746D',
    confirmed: '#3A6FD9',
    preparing: '#E08A1E',
    readyForPickup: '#8A5CF6',
    pickedUp: '#8A5CF6',
    outForDelivery: '#3A50D9',
    delivered: '#1C9A5B',
    cancelled: '#D6413A',
  },

  // Food module colors — bestseller/veg-indicator accents, independent of
  // the brand primary so they stay legible layered on food photography.
  food: {
    primary: '#F2522C',
    secondary: '#FF8D6E',
    accent: '#A9311A',
    veg: '#1C9A5B',
    nonVeg: '#D6413A',
    bestseller: '#C9971A',
  },

  // Grocery module colors
  grocery: {
    primary: '#1C9A5B',
    secondary: '#5CBF8E',
    accent: '#0E5C37',
  },

  // Cab module colors
  cab: {
    primary: '#3A6FD9',
    secondary: '#6B9AF0',
    accent: '#1D3C80',
  },

  // Salon module colors
  salon: {
    primary: '#8A5CF6',
    secondary: '#B29BFA',
    accent: '#5A35A8',
  },

  // Surface hierarchy — distinct background vs. card vs. raised-card tones
  // so elevation reads without relying on shadow alone.
  surface: {
    background: '#FAFAF9',
    base: '#FFFFFF',
    elevated: '#FFFFFF',
    sunken: '#F3F2F0',
    overlay: 'rgba(23, 22, 15, 0.55)',
  },

  // Text hierarchy, aliasing the gray scale for semantic clarity at
  // call sites (primary / secondary / muted / inverse / disabled).
  text: {
    primary: '#17160F',
    secondary: '#56524C',
    muted: '#A3A09A',
    inverse: '#FFFFFF',
    disabled: '#D2CFCA',
  },

  border: {
    DEFAULT: '#E6E4E1',
    subtle: '#F3F2F0',
    strong: '#D2CFCA',
  },

  // Common
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Shadows (re-exported for convenience)
  shadows: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 4,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 8,
    },
    xl: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 16,
    },
  },
} as const;

export type Colors = typeof colors;
