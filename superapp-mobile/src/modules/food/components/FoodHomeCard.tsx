import React from 'react';
import { TouchableOpacity } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface FoodHomeCardProps {
  onPress: () => void;
}

const Card = styled(TouchableOpacity)`
  background-color: ${colors.food.primary}15;
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
`;

const IconContainer = styled.View`
  width: 56px;
  height: 56px;
  background-color: ${colors.food.primary};
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

const BadgeRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  margin-top: 6px;
  gap: 6px;
`;

const Badge = styled.Text`
  font-size: 10px;
  font-weight: 700;
  color: ${colors.food.primary};
  background-color: ${colors.food.primary}18;
  padding: 2px 8px;
  border-radius: 8px;
  overflow: hidden;
`;

const Arrow = styled.Text`
  font-size: 24px;
  color: ${colors.food.primary};
`;

/** Home module card — sealed bag + dedicated rider messaging (Swiggy/Zomato style). */
export const FoodHomeCard: React.FC<FoodHomeCardProps> = ({ onPress }) => {
  return (
    <Card onPress={onPress} activeOpacity={0.8}>
      <IconContainer>
        <IconText>🍽️</IconText>
      </IconContainer>
      <Content>
        <Title>Food Delivery</Title>
        <Subtitle>Restaurants near you · order in minutes</Subtitle>
        <BadgeRow>
          <Badge>Sealed bag</Badge>
          <Badge>Dedicated rider</Badge>
          <Badge>Veg marked</Badge>
        </BadgeRow>
      </Content>
      <Arrow>›</Arrow>
    </Card>
  );
};

export default FoodHomeCard;
