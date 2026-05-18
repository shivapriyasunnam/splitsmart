import {StyleSheet, TextStyle, ViewStyle} from 'react-native';

export const Colors = {
  primary: '#83a8fd',
  primaryLight: '#818CF8',
  primaryDark: '#3730A3',
  secondary: '#06B6D4',
  success: '#17a223',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  text: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.5)',
  shadow: '#000',
  textOnPrimaryMuted: 'rgba(255,255,255,0.8)',
  textOnPrimarySubtle: 'rgba(255,255,255,0.6)',
  // RGB values for use in dynamic rgba() expressions (e.g. chart color functions)
  primaryRGB: '79, 70, 229',
  shadowRGB: '0, 0, 0',

  // Budget states
  budgetHealthy: '#10B981',
  budgetWarning: '#F59E0B',
  budgetOver: '#EF4444',

  // Category palette
  categoryColors: [
    '#71be91',
    '#06B6D4',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#F43F5E',
    '#0EA5E9',
    '#84CC16',
    '#F97316',
  ],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Typography = {
  h1: {
    fontSize: 28,
    fontWeight: '700' as TextStyle['fontWeight'],
    color: Colors.text,
    letterSpacing: -0.5,
  } as TextStyle,
  h2: {
    fontSize: 22,
    fontWeight: '700' as TextStyle['fontWeight'],
    color: Colors.text,
    letterSpacing: -0.3,
  } as TextStyle,
  h3: {
    fontSize: 18,
    fontWeight: '600' as TextStyle['fontWeight'],
    color: Colors.text,
  } as TextStyle,
  body: {
    fontSize: 15,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: Colors.text,
  } as TextStyle,
  bodyMedium: {
    fontSize: 15,
    fontWeight: '500' as TextStyle['fontWeight'],
    color: Colors.text,
  } as TextStyle,
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: Colors.textSecondary,
  } as TextStyle,
  caption: {
    fontSize: 12,
    fontWeight: '400' as TextStyle['fontWeight'],
    color: Colors.textMuted,
  } as TextStyle,
  label: {
    fontSize: 13,
    fontWeight: '600' as TextStyle['fontWeight'],
    color: Colors.textSecondary,
    textTransform: 'uppercase' as TextStyle['textTransform'],
    letterSpacing: 0.5,
  } as TextStyle,
  amount: {
    fontSize: 24,
    fontWeight: '700' as TextStyle['fontWeight'],
    color: Colors.text,
  } as TextStyle,
};

export const Shadows = {
  sm: {
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  } as ViewStyle,
  md: {
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  } as ViewStyle,
  lg: {
    shadowColor: Colors.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  } as ViewStyle,
};

/**
 * Resolves a stored category color value to an actual color string.
 * Default categories store a palette key like 'palette:0' so they
 * always reflect the current theme. User-created categories store
 * a plain hex/rgba string which is returned as-is.
 */
export function resolveCategoryColor(color: string): string {
  if (color.startsWith('palette:')) {
    const index = parseInt(color.slice(8), 10);
    return Colors.categoryColors[index] ?? color;
  }
  return color;
}

export const GlobalStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
});
