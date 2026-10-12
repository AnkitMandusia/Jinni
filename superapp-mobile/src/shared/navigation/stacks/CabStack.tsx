import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RideHomeScreen } from '@modules/cab/screens/RideHomeScreen';
import { PickupDropScreen } from '@modules/cab/screens/PickupDropScreen';
import { ActiveRideScreen } from '@modules/cab/screens/ActiveRideScreen';

export type CabStackParamList = {
  RideHome: undefined;
  PickupDrop: undefined;
  ActiveRide: { rideId: string };
};

const Stack = createNativeStackNavigator<CabStackParamList>();

export const CabStack: React.FC = () => {
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: true,
        headerBackTitleVisible: false,
      }}
    >
      <Stack.Screen 
        name="RideHome" 
        component={RideHomeScreen}
        options={{ title: 'Book a Ride', headerLeft: () => null }}
      />
      <Stack.Screen 
        name="PickupDrop" 
        component={PickupDropScreen}
        options={{ title: 'Set Location' }}
      />
      <Stack.Screen 
        name="ActiveRide" 
        component={ActiveRideScreen}
        options={{ title: 'Your Ride', headerLeft: () => null }}
      />
    </Stack.Navigator>
  );
};

export default CabStack;
