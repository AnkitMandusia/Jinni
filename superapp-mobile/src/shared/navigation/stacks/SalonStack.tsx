import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SalonListScreen } from '@modules/salon/screens/SalonListScreen';
import { ServiceSelectScreen } from '@modules/salon/screens/ServiceSelectScreen';
import { SlotBookingScreen } from '@modules/salon/screens/SlotBookingScreen';
import { BookingConfirmScreen } from '@modules/salon/screens/BookingConfirmScreen';

export type SalonStackParamList = {
  SalonList: undefined;
  ServiceSelect: { salonId: string };
  SlotBooking: { salonId: string; serviceId: string };
  BookingConfirm: { bookingId: string };
};

const Stack = createNativeStackNavigator<SalonStackParamList>();

export const SalonStack: React.FC = () => {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: true,
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="SalonList" 
        component={SalonListScreen}
        options={{ title: 'Salons & Barbers' }}
      />
      <Stack.Screen 
        name="ServiceSelect" 
        component={ServiceSelectScreen}
        options={{ title: 'Select Service' }}
      />
      <Stack.Screen 
        name="SlotBooking" 
        component={SlotBookingScreen}
        options={{ title: 'Book Slot' }}
      />
      <Stack.Screen 
        name="BookingConfirm" 
        component={BookingConfirmScreen}
        options={{ title: 'Booking Confirmed', headerLeft: () => null }}
      />
    </Stack.Navigator>
  );
};

export default SalonStack;
