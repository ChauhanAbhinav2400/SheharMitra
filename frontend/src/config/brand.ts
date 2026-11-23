/** Shared brand values. Keep component colours and brand copy out of individual screens. */
export const colors = {
  primary: '#1F6B4F',
  'primary-dark': '#15503A',
  'primary-soft': '#E3F1EA',
  accent: '#F4A300',
  'accent-soft': '#FFF1CC',
  background: '#FFF8EC',
  surface: '#FFFFFF',
  ink: '#2B2118',
  'ink-muted': '#6B5E50',
  border: '#E6D9C3',
  success: '#1E7A3C',
  'warning-bg': '#FFE7B3',
  'warning-text': '#6B4500',
  danger: '#B3261E',
  info: '#1E5AA8',
} as const;

export const brand = {
  prefix: 'sheharmitra',
  names: { hi: 'शहर मित्र', en: 'SheharMitra' },
  taglines: { hi: 'शहर की दुकान, अब आपके गाँव।', en: 'Town shops, now accessible from your village.' },
  services: {
    bazaar: { hi: 'शहर मित्र बाज़ार', en: 'SheharMitra Bazaar' },
    lift: { hi: 'शहर मित्र लिफ्ट', en: 'SheharMitra Lift' },
    // Reserved brand only; passenger bookings are deliberately not implemented.
    safar: { hi: 'शहर मित्र सफर', en: 'SheharMitra Safar' },
  },
  colors,
  fonts: {
    heading: '"Baloo 2","Noto Sans Devanagari","Nirmala UI",system-ui,sans-serif',
    body: '"Mukta","Noto Sans Devanagari","Nirmala UI",system-ui,sans-serif',
  },
  spacing: [4, 8, 12, 16, 24, 32, 48],
  radii: { card: 16, button: 14, input: 12, chip: 999 },
  sizes: { content: 1120, tap: 48, button: 52, deliveryButton: 56, bottomNav: 64 },
  shadow: '0 2px 8px rgba(43,33,24,.08)',
  timezone: 'Asia/Kolkata',
  logoIsFallback: false,
} as const;

export type Language = keyof typeof brand.names;
