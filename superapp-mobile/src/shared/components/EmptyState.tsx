import React from 'react';
import { ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

const Container = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const IconContainer = styled.View`
  width: 84px;
  height: 84px;
  background-color: ${colors.surface.sunken};
  border-radius: ${borderRadius.full}px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.lg}px;
`;

const Title = styled.Text`
  ${typography.h5}
  color: ${colors.text.primary};
  text-align: center;
  margin-bottom: ${spacing.sm}px;
`;

const Description = styled.Text`
  ${typography.body2}
  color: ${colors.text.secondary};
  text-align: center;
  margin-bottom: ${spacing.lg}px;
`;

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
}) => {
  return (
    <Container style={style}>
      <IconContainer>{icon || <AppIcon name="info" size={30} color={colors.gray[300]} />}</IconContainer>
      <Title>{title}</Title>
      {description && <Description>{description}</Description>}
      {actionLabel && onAction && (
        <AppButton title={actionLabel} onPress={onAction} variant="primary" />
      )}
    </Container>
  );
};

export default EmptyState;
