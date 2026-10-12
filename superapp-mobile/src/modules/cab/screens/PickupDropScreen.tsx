import React, { useState } from 'react';
import { View, TextInput, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { api } from '@services/api';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const MapPlaceholder = styled.View`
  height: 300px;
  background-color: ${colors.gray[200]};
  align-items: center;
  justify-content: center;
`;

const MapText = styled.Text`
  ${typography.body1}
  color: ${colors.gray[500]};
`;

const FormContainer = styled.View`
  padding: ${spacing.lg}px;
`;

const InputLabel = styled.Text`
  ${typography.body2}
  color: ${colors.gray[700]};
  margin-bottom: ${spacing.xs}px;
`;

const LocationInput = styled.TextInput`
  background-color: ${colors.white};
  border-radius: ${borderRadius.md}px;
  padding: ${spacing.md}px;
  ${typography.body1}
  color: ${colors.gray[900]};
  border-width: 1px;
  border-color: ${colors.gray[200]};
  margin-bottom: ${spacing.md}px;
`;

const RideTypeContainer = styled.View`
  flex-direction: row;
  margin-bottom: ${spacing.lg}px;
`;

interface RideTypeProps { selected: boolean; }
const RideTypeButton = styled.TouchableOpacity<RideTypeProps>`
  flex: 1;
  background-color: ${(props: RideTypeProps) => (props.selected ? colors.cab.primary : colors.gray[100])};
  padding: ${spacing.md}px;
  border-radius: ${borderRadius.md}px;
  margin-right: ${spacing.sm}px;
  align-items: center;
`;

const RideTypeText = styled.Text<RideTypeProps>`
  ${typography.body2}
  color: ${(props: RideTypeProps) => (props.selected ? colors.white : colors.gray[700])};
  font-weight: 600;
`;

const RideTypePrice = styled.Text<RideTypeProps>`
  ${typography.caption}
  color: ${(props: RideTypeProps) => (props.selected ? colors.white : colors.gray[500])};
  margin-top: ${spacing.xs}px;
`;

const RIDE_TYPES = [
  { id: 'economy', name: 'Economy', price: '₹120' },
  { id: 'premium', name: 'Premium', price: '₹180' },
  { id: 'xl', name: 'XL', price: '₹250' },
];

export const PickupDropScreen: React.FC = () => {
  const navigation = useNavigation();
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [selectedRideType, setSelectedRideType] = useState('economy');
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirmRide = async () => {
    if (!pickup || !dropoff) {
      Alert.alert('Error', 'Please enter both pickup and drop-off locations');
      return;
    }

    setIsLoading(true);
    try {
      // In real implementation, call API
      // const response = await api.post('/cab/rides', {
      //   pickup_location: pickup,
      //   drop_location: dropoff,
      //   ride_type: selectedRideType,
      // });
      
      // Navigate to active ride with mock ride ID
      navigation.navigate('ActiveRide' as never, { rideId: 'ride_123' } as never);
    } catch (error) {
      Alert.alert('Error', 'Failed to book ride. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <MapPlaceholder>
        <MapText>📍 Map View</MapText>
        <MapText>(Google Maps Integration)</MapText>
      </MapPlaceholder>

      <FormContainer>
        <InputLabel>Pickup Location</InputLabel>
        <LocationInput
          placeholder="Enter pickup location"
          value={pickup}
          onChangeText={setPickup}
        />

        <InputLabel>Drop-off Location</InputLabel>
        <LocationInput
          placeholder="Enter drop-off location"
          value={dropoff}
          onChangeText={setDropoff}
        />

        <InputLabel>Select Ride Type</InputLabel>
        <RideTypeContainer>
          {RIDE_TYPES.map((type) => (
            <RideTypeButton
              key={type.id}
              selected={selectedRideType === type.id}
              onPress={() => setSelectedRideType(type.id)}
            >
              <RideTypeText selected={selectedRideType === type.id}>
                {type.name}
              </RideTypeText>
              <RideTypePrice selected={selectedRideType === type.id}>
                {type.price}
              </RideTypePrice>
            </RideTypeButton>
          ))}
        </RideTypeContainer>

        <AppButton
          title={isLoading ? 'Booking...' : 'Confirm Ride'}
          onPress={handleConfirmRide}
          loading={isLoading}
          size="large"
        />
      </FormContainer>
    </Container>
  );
};

export default PickupDropScreen;
