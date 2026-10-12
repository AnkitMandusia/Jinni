import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';

import { ProfileScreen } from '@modules/profile/screens/ProfileScreen';
import { EditProfileScreen } from '@modules/profile/screens/EditProfileScreen';
import { SavedAddressesScreen } from '@modules/profile/screens/SavedAddressesScreen';
import { HelpSupportScreen } from '@modules/profile/screens/HelpSupportScreen';
import { SettingsScreen } from '@modules/profile/screens/SettingsScreen';
import { LegalScreen } from '@modules/profile/screens/LegalScreen';

export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  SavedAddresses: undefined;
  HelpSupport: { reportOrderId?: string } | undefined;
  Settings: undefined;
  Legal: { doc: 'privacy' | 'terms' | 'refund' };
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export const ProfileStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        headerBackTitleVisible: false,
        headerTintColor: colors.gray[900],
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.gray[900] },
        headerStyle: { backgroundColor: colors.white },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} options={{ title: 'Saved Addresses' }} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} options={{ title: 'Help & Support' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: 'Legal' }} />
    </Stack.Navigator>
  );
};

export default ProfileStack;
