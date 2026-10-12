import React from 'react';
import { TouchableOpacity } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface CabHomeCardProps {
  onPress: () => void;
}

const Card = styled(TouchableOpacity)`
  background-color: ${colors.cab.primary}15;
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
`;

const IconContainer = styled.View`
  width: 56px;
  height: 56px;
  background-color: ${colors.cab.primary};
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
  color: ${colors.cab.primary};
`;

export const CabHomeCard: React.FC<CabHomeCardProps> = ({ onPress }) => {
  return (
    <Card onPress={onPress} activeOpacity={0.8}>
      <IconContainer>
        <IconText>🚗</IconText>
      </IconContainer>
      <Content>
        <Title>Cab Booking</Title>
        <Subtitle>Book a ride anywhere</Subtitle>
      </Content>
      <Arrow>›</Arrow>
    </Card>
  );
};

export default CabHomeCard;
