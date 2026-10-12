import React from 'react';
import { View } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { SalonStackParamList } from '@navigation/stacks/SalonStack';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const IconContainer = styled.View`
  width: 120px;
  height: 120px;
  background-color: ${colors.success.light};
  border-radius: 60px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.xl}px;
`;

const IconText = styled.Text`
  font-size: 60px;
`;

const Title = styled.Text`
  ${typography.h3}
  color: ${colors.gray[900]};
  text-align: center;
  margin-bottom: ${spacing.md}px;
`;

const Subtitle = styled.Text`
  ${typography.body1}
  color: ${colors.gray[500]};
  text-align: center;
  margin-bottom: ${spacing.xl}px;
`;

const Card = styled.View`
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.xl}px;
  width: 100%;
  ${colors.shadows.md}
`;

const DetailRow = styled.View`
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
  font-weight: 600;
`;

const BookingId = styled.Text`
  ${typography.caption}
  color: ${colors.salon.primary};
  text-align: center;
  margin-top: ${spacing.lg}px;
`;

export const BookingConfirmScreen: React.FC = () => {
  const route = useRoute<RouteProp<SalonStackParamList, 'BookingConfirm'>>();
  const navigation = useNavigation();
  const { bookingId } = route.params;

  const handleGoHome = () => {
    navigation.navigate('SalonList' as never);
  };

  const handleViewBookings = () => {
    // Navigate to orders tab
    navigation.navigate('MainTabs' as never, { screen: 'Orders' } as never);
  };

  return (
    <Container>
      <IconContainer>
        <IconText>✓</IconText>
      </IconContainer>

      <Title>Booking Confirmed!</Title>
      <Subtitle>
        Your appointment has been scheduled successfully
      </Subtitle>

      <Card>
        <DetailRow>
          <DetailLabel>Salon</DetailLabel>
          <DetailValue>Style Studio</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>Service</DetailLabel>
          <DetailValue>Haircut</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>Date</DetailLabel>
          <DetailValue>Mon, Jan 20</DetailValue>
        </DetailRow>
        <DetailRow>
          <DetailLabel>Time</DetailLabel>
          <DetailValue>10:00 AM</DetailValue>
        </DetailRow>
        <BookingId>Booking ID: #{bookingId}</BookingId>
      </Card>

      <View style={{ width: '100%', marginTop: spacing.xl }}>
        <AppButton
          title="View My Bookings"
          onPress={handleViewBookings}
          variant="primary"
          style={{ marginBottom: spacing.md }}
          size="large"
        />
        <AppButton
          title="Back to Home"
          onPress={handleGoHome}
          variant="outline"
          size="large"
        />
      </View>
    </Container>
  );
};

export default BookingConfirmScreen;
