import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RideHomeScreen } from '@modules/cab/screens/RideHomeScreen';
import { PlacePickerScreen } from '@modules/cab/screens/PlacePickerScreen';
import { ActiveRideScreen } from '@modules/cab/screens/ActiveRideScreen';
import { RideHistoryScreen } from '@modules/cab/screens/RideHistoryScreen';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';

export type CabStackParamList = {
  RideHome: undefined;
  PlacePicker: { mode: 'pickup' | 'drop' };
  ActiveRide: { rideId: string };
  RideHistory: undefined;
};

const Stack = createNativeStackNavigator<CabStackParamList>();

export const CabStack: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerBackTitleVisible: false,
      headerTintColor: jinniColors.purple[800],
      headerTitleStyle: { fontFamily: fontFamily.bold },
      headerShadowVisible: false,
    }}
  >
    {/* RideHome and ActiveRide draw their own gradient headers */}
    <Stack.Screen name="RideHome" component={RideHomeScreen} options={{ headerShown: false }} />
    <Stack.Screen name="PlacePicker" component={PlacePickerScreen} options={({ route }) => ({ title: route.params?.mode === 'pickup' ? 'Pickup' : 'Drop' })} />
    <Stack.Screen name="ActiveRide" component={ActiveRideScreen} options={{ headerShown: false, gestureEnabled: false }} />
    <Stack.Screen name="RideHistory" component={RideHistoryScreen} options={{ title: 'Your rides' }} />
  </Stack.Navigator>
);

export default CabStack;
