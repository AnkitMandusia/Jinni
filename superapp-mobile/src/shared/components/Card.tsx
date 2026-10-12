import React from 'react';
import { TouchableOpacity, ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: 'elevated' | 'outlined' | 'filled';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: ViewStyle;
  testID?: string;
}

const CardContainer = styled.View<{
  variant: string;
  padding: string;
}>`
  background-color: ${props =>
    props.variant === 'filled' ? colors.gray[50] : colors.white};
  border-radius: ${borderRadius.lg}px;
  overflow: hidden;
  padding: ${props => {
    switch (props.padding) {
      case 'none':
        return '0px';
      case 'sm':
        return `${spacing.sm}px`;
      case 'lg':
        return `${spacing.lg}px`;
      default:
        return `${spacing.md}px`;
    }
  }};
  border-width: ${props => (props.variant === 'outlined' ? '1px' : '0px')};
  border-color: ${props =>
    props.variant === 'outlined' ? colors.gray[200] : 'transparent'};
  shadow-color: ${props => (props.variant === 'elevated' ? colors.black : colors.transparent)};
  shadow-offset: ${props =>
    props.variant === 'elevated' ? '0px 2px' : '0px 0px'};
  shadow-opacity: ${props => (props.variant === 'elevated' ? '0.08' : '0')};
  shadow-radius: ${props => (props.variant === 'elevated' ? '4px' : '0px')};
  elevation: ${props => (props.variant === 'elevated' ? '4' : '0')};
`;

export const Card: React.FC<CardProps> = ({
  children,
  onPress,
  variant = 'elevated',
  padding = 'md',
  style,
  testID,
}) => {
  const content = (
    <CardContainer variant={variant} padding={padding} style={style} testID={testID}>
      {children}
    </CardContainer>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

// Card sub-components for consistent layout
const CardHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const CardTitle = styled.Text`
  ${typography.h6}
  color: ${colors.text.primary};
`;

const CardSubtitle = styled.Text`
  ${typography.body2}
  color: ${colors.text.secondary};
  margin-top: 2px;
`;

const CardContent = styled.View`
  flex: 1;
`;

const CardFooter = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  margin-top: ${spacing.md}px;
  padding-top: ${spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${colors.gray[100]};
`;

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Subtitle = CardSubtitle;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
