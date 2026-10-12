import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { CabStackParamList } from '@navigation/stacks/CabStack';
import { api } from '@services/api';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const MapContainer = styled.View`
  flex: 1;
  background-color: ${colors.gray[200]};
  align-items: center;
  justify-content: center;
`;

const MapText = styled.Text`
  ${typography.h5}
  color: ${colors.gray[500]};
`;

const BottomSheet = styled.View`
  background-color: ${colors.white};
  border-top-left-radius: ${borderRadius.xl}px;
  border-top-right-radius: ${borderRadius.xl}px;
  padding: ${spacing.xl}px;
  ${colors.shadows.lg}
`;

interface StatusProps { status: string; }
const StatusBadge = styled.View<StatusProps>`
  background-color: ${(props: StatusProps) =>
    props.status === 'arrived'
      ? colors.success.light
      : props.status === 'ongoing'
      ? colors.cab.primary + '20'
      : colors.warning.light};
  padding-vertical: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  border-radius: ${borderRadius.full}px;
  align-self: flex-start;
  margin-bottom: ${spacing.md}px;
`;

const StatusText = styled.Text<StatusProps>`
  ${typography.caption}
  color: ${(props: StatusProps) =>
    props.status === 'arrived'
      ? colors.success.dark
      : props.status === 'ongoing'
      ? colors.cab.primary
      : colors.warning.dark};
  font-weight: 600;
  text-transform: uppercase;
`;

const DriverInfo = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${spacing.lg}px;
`;

const Avatar = styled.View`
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background-color: ${colors.gray[200]};
  align-items: center;
  justify-content: center;
  margin-right: ${spacing.md}px;
`;

const AvatarText = styled.Text`
  font-size: 28px;
`;

const DriverDetails = styled.View`
  flex: 1;
`;

const DriverName = styled.Text`
  ${typography.h6}
  color: ${colors.gray[900]};
`;

const VehicleInfo = styled.Text`
  ${typography.body2}
  color: ${colors.gray[500]};
  margin-top: ${spacing.xs}px;
`;

const Rating = styled.Text`
  ${typography.body2}
  color: ${colors.warning.DEFAULT};
`;

const RideDetail = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: ${spacing.md}px;
`;

const DetailLabel = styled.Text`
  ${typography.body2}
  color: ${colors.gray[500]};
`;

const DetailValue = styled.Text`
  ${typography.body1}
  color: ${colors.gray[900]};
  font-weight: 500;
`;

const MOCK_RIDE_STATUS = ['finding', 'assigned', 'arrived', 'ongoing'];

export const ActiveRideScreen: React.FC = () => {
  const route = useRoute<RouteProp<CabStackParamList, 'ActiveRide'>>();
  const navigation = useNavigation();
  const { rideId } = route.params;
  const [status, setStatus] = useState('assigned');
  const [eta, setEta] = useState('5 mins');

  useEffect(() => {
    // In real implementation, poll for ride status updates
    const interval = setInterval(() => {
      setEta((prev) => {
        const mins = parseInt(prev);
        if (mins > 0) return `${mins - 1} mins`;
        return 'Arriving';
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const handleCancel = async () => {
    try {
      // await api.post(`/cab/rides/${rideId}/cancel`);
      navigation.navigate('RideHome' as never);
    } catch (error) {
      console.error('Cancel failed:', error);
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'assigned':
        return 'Driver Assigned';
      case 'arrived':
        return 'Driver Arrived';
      case 'ongoing':
        return 'Ride in Progress';
      default:
        return 'Finding Driver';
    }
  };

  return (
    <Container>
      <MapContainer>
        <MapText>🗺️ Live Tracking</MapText>
        <MapText>(Google Maps)</MapText>
      </MapContainer>

      <BottomSheet>
        <StatusBadge status={status}>
          <StatusText status={status}>{getStatusText()}</StatusText>
        </StatusBadge>

        <DriverInfo>
          <Avatar>
            <AvatarText>👤</AvatarText>
          </Avatar>
          <DriverDetails>
            <DriverName>Rahul Kumar</DriverName>
            <VehicleInfo>Maruti Swift • UP32 AB 1234</VehicleInfo>
          </DriverDetails>
          <Rating>★ 4.8</Rating>
        </DriverInfo>

        <RideDetail>
          <DetailLabel>Estimated Arrival</DetailLabel>
          <DetailValue>{eta}</DetailValue>
        </RideDetail>

        <RideDetail>
          <DetailLabel>Ride ID</DetailLabel>
          <DetailValue>#{rideId}</DetailValue>
        </RideDetail>

        <AppButton
          title="Cancel Ride"
          variant="outline"
          onPress={handleCancel}
          style={{ marginTop: spacing.md }}
        />
      </BottomSheet>
    </Container>
  );
};

export default ActiveRideScreen;
