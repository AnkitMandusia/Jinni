import React from 'react';
import {
  ActivityIndicator,
  TouchableOpacity,
  TouchableOpacityProps,
  Text,
  View,
  StyleSheet,
} from 'react-native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface AppButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'subtle' | 'danger';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const getBackgroundColor = (variant: string): string => {
  switch (variant) {
    case 'primary':
      return colors.primary[500];
    case 'secondary':
      return colors.secondary[500];
    case 'subtle':
      return colors.primary[50];
    case 'outline':
    case 'ghost':
      return 'transparent';
    case 'danger':
      return colors.error.DEFAULT;
    default:
      return colors.primary[500];
  }
};

const getTextColor = (variant: string): string => {
  switch (variant) {
    case 'outline':
    case 'ghost':
    case 'subtle':
      return colors.primary[600];
    case 'danger':
    default:
      return colors.white;
  }
};

const getPadding = (size: string) => {
  switch (size) {
    case 'small':
      return { paddingVertical: spacing.sm, paddingHorizontal: spacing.md };
    case 'large':
      return { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl };
    default:
      return { paddingVertical: spacing.md, paddingHorizontal: spacing.lg };
  }
};

const getTypography = (size: string) => {
  switch (size) {
    case 'small':
      return { ...typography.label, letterSpacing: 0.2 };
    case 'large':
      return { ...typography.button, fontSize: 16, lineHeight: 22 };
    default:
      return typography.button;
  }
};

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  ...props
}) => {
  const backgroundColor = getBackgroundColor(variant);
  const textColor = getTextColor(variant);
  const padding = getPadding(size);
  const textStyle = getTypography(size);
  const isOutline = variant === 'outline';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor,
          ...padding,
          width: fullWidth ? '100%' : undefined,
          opacity: disabled || loading ? 0.45 : 1,
          borderWidth: isOutline ? 1.5 : 0,
          borderColor: isOutline ? colors.primary[400] : undefined,
        },
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.85}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' || variant === 'ghost' || variant === 'subtle' ? colors.primary[500] : colors.white}
        />
      ) : (
        <>
          {leftIcon && <View style={{ marginRight: spacing.sm }}>{leftIcon}</View>}
          <Text style={[textStyle, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {rightIcon && <View style={{ marginLeft: spacing.sm }}>{rightIcon}</View>}
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
});

export default AppButton;
