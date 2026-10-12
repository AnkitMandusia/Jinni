import React, { useEffect, useState } from 'react';
import { FlatList, TouchableOpacity } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { SalonStackParamList } from '@navigation/stacks/SalonStack';
import { formatPrice } from '@utils/helpers';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const ServiceCard = styled(TouchableOpacity)<{ selected: boolean }>`
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  border-width: 2px;
  border-color: ${(props) => (props.selected ? colors.salon.primary : colors.gray[200])};
  ${colors.shadows.sm}
`;

const ServiceName = styled.Text`
  ${typography.h6}
  color: ${colors.gray[900]};
`;

const ServiceDescription = styled.Text`
  ${typography.body2}
  color: ${colors.gray[500]};
  margin-top: ${spacing.xs}px;
`;

const ServiceDuration = styled.Text`
  ${typography.caption}
  color: ${colors.gray[400]};
  margin-top: ${spacing.xs}px;
`;

const ServicePrice = styled.Text`
  ${typography.h5}
  color: ${colors.salon.primary};
  margin-top: ${spacing.sm}px;
`;

const MOCK_SERVICES = [
  { id: '1', name: 'Haircut', description: 'Classic haircut with styling', duration: '30 min', price: 299 },
  { id: '2', name: 'Beard Trim', description: 'Precision beard shaping', duration: '15 min', price: 149 },
  { id: '3', name: 'Hair Color', description: 'Full hair coloring', duration: '60 min', price: 799 },
  { id: '4', name: 'Facial', description: 'Deep cleansing facial', duration: '45 min', price: 499 },
  { id: '5', name: 'Manicure', description: 'Nail care and polish', duration: '30 min', price: 349 },
];

export const ServiceSelectScreen: React.FC = () => {
  const route = useRoute<RouteProp<SalonStackParamList, 'ServiceSelect'>>();
  const navigation = useNavigation();
  const { salonId } = route.params;
  const [selectedService, setSelectedService] = useState<string | null>(null);

  const handleContinue = () => {
    if (selectedService) {
      navigation.navigate('SlotBooking' as never, { salonId, serviceId: selectedService } as never);
    }
  };

  return (
    <Container>
      <FlatList
        data={MOCK_SERVICES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ServiceCard
            selected={selectedService === item.id}
            onPress={() => setSelectedService(item.id)}
          >
            <ServiceName>{item.name}</ServiceName>
            <ServiceDescription>{item.description}</ServiceDescription>
            <ServiceDuration>⏱️ {item.duration}</ServiceDuration>
            <ServicePrice>{formatPrice(item.price)}</ServicePrice>
          </ServiceCard>
        )}
        contentContainerStyle={{ paddingVertical: spacing.md }}
      />
      <AppButton
        title="Continue"
        onPress={handleContinue}
        disabled={!selectedService}
        style={{ margin: spacing.md }}
        size="large"
      />
    </Container>
  );
};

export default ServiceSelectScreen;
