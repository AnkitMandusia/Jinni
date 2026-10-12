import React from 'react';
import { TouchableOpacity } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface GroceryHomeCardProps {
  onPress: () => void;
}

const Card = styled(TouchableOpacity)`
  background-color: ${colors.grocery.primary}15;
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
`;

const IconContainer = styled.View`
  width: 56px;
  height: 56px;
  background-color: ${colors.grocery.primary};
  border-radius: ${borderRadius.md}px;
  align-items: center;
  justify-content: center;
  margin-right: ${spacing.md}px;
`;

const IconText = styled.Text`
  font-size: 28px;
`;

const Content = styled.View`
  flex: 1;
`;

const Title = styled.Text`
  ${typography.h5}
  color: ${colors.gray[900]};
  margin-bottom: 2px;
`;

const Subtitle = styled.Text`
  ${typography.body2}
  color: ${colors.gray[600]};
`;

const Arrow = styled.Text`
  font-size: 24px;
  color: ${colors.grocery.primary};
`;

export const GroceryHomeCard: React.FC<GroceryHomeCardProps> = ({ onPress }) => {
  return (
    <Card onPress={onPress} activeOpacity={0.8}>
      <IconContainer>
        <IconText>🥬</IconText>
      </IconContainer>
      <Content>
        <Title>Grocery</Title>
        <Subtitle>Fresh groceries delivered to your door</Subtitle>
      </Content>
      <Arrow>›</Arrow>
    </Card>
  );
};

export default GroceryHomeCard;
