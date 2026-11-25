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
  background-color: #5E2FB815;
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  flex-direction: row;
  align-items: center;
`;

const IconContainer = styled.View`
  width: 56px;
  height: 56px;
  background-color: #5E2FB8;
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
  color: #5E2FB8;
`;

export const CabHomeCard: React.FC<CabHomeCardProps> = ({ onPress }) => {
  return (
    <Card onPress={onPress} activeOpacity={0.8}>
      <IconContainer>
        <IconText>🧞</IconText>
      </IconContainer>
      <Content>
        <Title>Jinni Carpet</Title>
        <Subtitle>Quick bike rides across town</Subtitle>
      </Content>
      <Arrow>›</Arrow>
    </Card>
  );
};

export default CabHomeCard;
