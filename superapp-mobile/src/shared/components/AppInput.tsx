import React, { forwardRef } from 'react';
import { TextInput, TextInputProps, ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface AppInputProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  variant?: 'outlined' | 'filled';
}

const Container = styled.View<{ style?: ViewStyle }>`
  margin-bottom: ${spacing.md}px;
  ${props => props.style}
`;

const Label = styled.Text`
  ${typography.label}
  color: ${colors.gray[700]};
  margin-bottom: ${spacing.xs}px;
`;

const InputContainer = styled.View<{
  focused: boolean;
  error?: boolean;
  variant: string;
}>`
  flex-direction: row;
  align-items: center;
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.md}px;
  min-height: 48px;

  ${props => {
    if (props.variant === 'filled') {
      return `
        background-color: ${colors.gray[100]};
        border-width: 1px;
        border-color: ${props.error ? colors.error.DEFAULT : props.focused ? colors.primary[500] : colors.gray[200]};
      `;
    }
    return `
      background-color: ${colors.white};
      border-width: 1.5px;
      border-color: ${props.error ? colors.error.DEFAULT : props.focused ? colors.primary[500] : colors.gray[300]};
    `;
  }}
`;

const StyledInput = styled.TextInput`
  flex: 1;
  ${typography.body1}
  color: ${colors.gray[900]};
  padding-vertical: ${spacing.sm}px;
`;

const IconContainer = styled.View<{ position: 'left' | 'right' }>`
  margin-${props => (props.position === 'left' ? 'right' : 'left')}: ${spacing.sm}px;
`;

const HelperText = styled.Text<{ error?: boolean }>`
  ${typography.caption}
  color: ${props => (props.error ? colors.error.DEFAULT : colors.gray[500])};
  margin-top: ${spacing.xs}px;
`;

export const AppInput = forwardRef<TextInput, AppInputProps>(
  (
    {
      label,
      error,
      helper,
      leftIcon,
      rightIcon,
      containerStyle,
      variant = 'outlined',
      onFocus,
      onBlur,
      ...textInputProps
    },
    ref
  ) => {
    const [focused, setFocused] = React.useState(false);

    const handleFocus = (e: any) => {
      setFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: any) => {
      setFocused(false);
      onBlur?.(e);
    };

    return (
      <Container style={containerStyle}>
        {label && <Label>{label}</Label>}
        <InputContainer focused={focused} error={!!error} variant={variant}>
          {leftIcon && <IconContainer position="left">{leftIcon}</IconContainer>}
          <StyledInput
            ref={ref}
            placeholderTextColor={colors.gray[400]}
            onFocus={handleFocus}
            onBlur={handleBlur}
            {...textInputProps}
          />
          {rightIcon && <IconContainer position="right">{rightIcon}</IconContainer>}
        </InputContainer>
        {(error || helper) && (
          <HelperText error={!!error}>{error || helper}</HelperText>
        )}
      </Container>
    );
  }
);

AppInput.displayName = 'AppInput';

export default AppInput;
