import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { SalonStackParamList } from '@navigation/stacks/SalonStack';
import { api } from '@services/api';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const Section = styled.View`
  background-color: ${colors.white};
  margin-horizontal: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  padding: ${spacing.lg}px;
  border-radius: ${borderRadius.lg}px;
  ${colors.shadows.sm}
`;

const SectionTitle = styled.Text`
  ${typography.h6}
  color: ${colors.gray[900]};
  margin-bottom: ${spacing.md}px;
`;

const DateRow = styled.ScrollView`
  flex-direction: row;
`;

interface DateButtonProps { selected: boolean; }
const DateButton = styled.TouchableOpacity<DateButtonProps>`
  background-color: ${(props: DateButtonProps) => (props.selected ? colors.salon.primary : colors.gray[100])};
  padding-vertical: ${spacing.md}px;
  padding-horizontal: ${spacing.lg}px;
  border-radius: ${borderRadius.md}px;
  margin-right: ${spacing.sm}px;
  align-items: center;
  min-width: 70px;
`;

const DateDay = styled.Text<DateButtonProps>`
  ${typography.caption}
  color: ${(props: DateButtonProps) => (props.selected ? colors.white : colors.gray[500])};
`;

const DateNumber = styled.Text<DateButtonProps>`
  ${typography.h5}
  color: ${(props: DateButtonProps) => (props.selected ? colors.white : colors.gray[900])};
`;

const TimeGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${spacing.sm}px;
`;

interface TimeButtonProps { selected: boolean; disabled: boolean; }
const TimeButton = styled.TouchableOpacity<TimeButtonProps>`
  background-color: ${(props: TimeButtonProps) =>
    props.disabled ? colors.gray[200] : props.selected ? colors.salon.primary : colors.gray[100]};
  padding-vertical: ${spacing.sm}px;
  padding-horizontal: ${spacing.md}px;
  border-radius: ${borderRadius.md}px;
  opacity: ${(props: TimeButtonProps) => (props.disabled ? 0.5 : 1)};
`;

interface TimeTextProps { selected: boolean; }
const TimeText = styled.Text<TimeTextProps>`
  ${typography.body2}
  color: ${(props: TimeTextProps) => (props.selected ? colors.white : colors.gray[900])};
`;

const MOCK_DATES = [
  { day: 'Mon', date: '20', fullDate: '2024-01-20' },
  { day: 'Tue', date: '21', fullDate: '2024-01-21' },
  { day: 'Wed', date: '22', fullDate: '2024-01-22' },
  { day: 'Thu', date: '23', fullDate: '2024-01-23' },
  { day: 'Fri', date: '24', fullDate: '2024-01-24' },
];

const MOCK_SLOTS = [
  { time: '09:00 AM', available: true },
  { time: '10:00 AM', available: true },
  { time: '11:00 AM', available: false },
  { time: '12:00 PM', available: true },
  { time: '02:00 PM', available: true },
  { time: '03:00 PM', available: true },
  { time: '04:00 PM', available: false },
  { time: '05:00 PM', available: true },
];

export const SlotBookingScreen: React.FC = () => {
  const route = useRoute<RouteProp<SalonStackParamList, 'SlotBooking'>>();
  const navigation = useNavigation();
  const { salonId, serviceId } = route.params;
  const [selectedDate, setSelectedDate] = useState<string>(MOCK_DATES[0].fullDate);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleBook = async () => {
    if (!selectedTime) return;
    
    setIsLoading(true);
    try {
      // In real implementation, call API
      // const response = await api.post('/salon/bookings', {
      //   salon_id: salonId,
      //   service_id: serviceId,
      //   date: selectedDate,
      //   time: selectedTime,
      // });
      
      // Navigate to confirmation with mock booking ID
      navigation.navigate('BookingConfirm' as never, { bookingId: 'booking_123' } as never);
    } catch (error) {
      console.error('Booking failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container>
      <ScrollView>
        <Section>
          <SectionTitle>Select Date</SectionTitle>
          <DateRow horizontal showsHorizontalScrollIndicator={false}>
            {MOCK_DATES.map((date) => (
              <DateButton
                key={date.fullDate}
                selected={selectedDate === date.fullDate}
                onPress={() => setSelectedDate(date.fullDate)}
              >
                <DateDay selected={selectedDate === date.fullDate}>{date.day}</DateDay>
                <DateNumber selected={selectedDate === date.fullDate}>{date.date}</DateNumber>
              </DateButton>
            ))}
          </DateRow>
        </Section>

        <Section>
          <SectionTitle>Select Time</SectionTitle>
          <TimeGrid>
            {MOCK_SLOTS.map((slot) => (
              <TimeButton
                key={slot.time}
                selected={selectedTime === slot.time}
                disabled={!slot.available}
                onPress={() => slot.available && setSelectedTime(slot.time)}
              >
                <TimeText selected={selectedTime === slot.time}>{slot.time}</TimeText>
              </TimeButton>
            ))}
          </TimeGrid>
        </Section>
      </ScrollView>

      <AppButton
        title={isLoading ? 'Booking...' : 'Confirm Booking'}
        onPress={handleBook}
        disabled={!selectedTime || isLoading}
        loading={isLoading}
        style={{ margin: spacing.md }}
        size="large"
      />
    </Container>
  );
};

export default SlotBookingScreen;
