import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  TextStyle,
  ViewStyle,
  TouchableOpacityProps,
  TextInputProps,
} from 'react-native';
import {Colors, Spacing, BorderRadius, Typography, Shadows} from '../app/theme';

// ─── Button ─────────────────────────────────────────────────────────────────

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  style,
  disabled,
  ...rest
}) => {
  const bgColor =
    variant === 'primary'
      ? Colors.primary
      : variant === 'secondary'
        ? Colors.surfaceAlt
        : variant === 'danger'
          ? Colors.danger
          : 'transparent';

  const textColor =
    variant === 'primary' || variant === 'danger'
      ? Colors.textOnPrimary
      : variant === 'ghost'
        ? Colors.primary
        : Colors.text;

  const padV = size === 'sm' ? Spacing.xs : size === 'lg' ? Spacing.md : 10;
  const padH = size === 'sm' ? Spacing.sm : size === 'lg' ? Spacing.xl : Spacing.md;
  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {backgroundColor: bgColor, paddingVertical: padV, paddingHorizontal: padH},
        variant === 'secondary' && styles.buttonBorder,
        (disabled || loading) && styles.buttonDisabled,
        style as ViewStyle,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.75}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.buttonContent}>
          {icon && <View style={styles.buttonIcon}>{icon}</View>}
          <Text style={[styles.buttonText, {color: textColor, fontSize}]}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerStyle?: ViewStyle;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  containerStyle,
  style,
  ...rest
}) => (
  <View style={[styles.inputContainer, containerStyle]}>
    {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
    <TextInput
      style={[styles.input, error ? styles.inputError : null, style as TextStyle]}
      placeholderTextColor={Colors.textMuted}
      {...rest}
    />
    {error ? <Text style={styles.errorText}>{error}</Text> : null}
  </View>
);

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export const Card: React.FC<CardProps> = ({children, style, padded = true, onPress, onLongPress}) => {
  const content = (
    <View style={[styles.card, padded && {padding: Spacing.md}, Shadows.sm, style]}>
      {children}
    </View>
  );
  if (onPress || onLongPress) {
    return (
      <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
};

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({title, action}) => (
  <View style={styles.sectionHeader}>
    <Text style={Typography.label}>{title}</Text>
    {action}
  </View>
);

// ─── EmptyState ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({title, subtitle, action}) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>{title}</Text>
    {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    {action ? <View style={{marginTop: Spacing.md}}>{action}</View> : null}
  </View>
);

// ─── LoadingState ────────────────────────────────────────────────────────────

export const LoadingState: React.FC<{message?: string}> = ({message}) => (
  <View style={styles.loadingState}>
    <ActivityIndicator size="large" color={Colors.primary} />
    {message ? <Text style={styles.loadingText}>{message}</Text> : null}
  </View>
);

// ─── Chip ────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export const Chip: React.FC<ChipProps> = ({
  label,
  selected = false,
  onPress,
  color = Colors.primary,
}) => (
  <TouchableOpacity
    style={[
      styles.chip,
      selected && {backgroundColor: color, borderColor: color},
    ]}
    onPress={onPress}
    activeOpacity={0.7}>
    <Text
      style={[
        styles.chipText,
        selected && {color: Colors.textOnPrimary},
      ]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ─── Badge ───────────────────────────────────────────────────────────────────

export const Badge: React.FC<{
  label: string;
  color?: string;
  textColor?: string;
}> = ({label, color = Colors.primary, textColor = Colors.textOnPrimary}) => (
  <View style={[styles.badge, {backgroundColor: color}]}>
    <Text style={[styles.badgeText, {color: textColor}]}>{label}</Text>
  </View>
);

// ─── Divider ─────────────────────────────────────────────────────────────────

export const Divider: React.FC<{style?: ViewStyle}> = ({style}) => (
  <View style={[styles.divider, style]} />
);

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export const ProgressBar: React.FC<{
  percent: number;
  color?: string;
  trackColor?: string;
  height?: number;
}> = ({percent, color = Colors.primary, trackColor = Colors.border, height = 8}) => {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const barColor =
    percent > 100
      ? Colors.budgetOver
      : percent > 80
        ? Colors.budgetWarning
        : Colors.budgetHealthy;
  return (
    <View style={[styles.progressTrack, {backgroundColor: trackColor, height}]}>
      <View
        style={[
          styles.progressBar,
          {
            width: `${clamped}%`,
            backgroundColor: color === Colors.primary ? barColor : color,
            height,
          },
        ]}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: Spacing.xs,
  },
  buttonText: {
    fontWeight: '600',
  },
  buttonBorder: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  inputContainer: {
    marginBottom: Spacing.md,
  },
  inputLabel: {
    ...Typography.label,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.danger,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  emptySubtitle: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodySmall,
    marginTop: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: Spacing.xs,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  progressTrack: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    flex: 1,
  },
  progressBar: {
    borderRadius: BorderRadius.full,
  },
});
