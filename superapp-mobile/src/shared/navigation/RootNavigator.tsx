import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '@auth/store/authStore';
import { AuthStack } from './stacks/AuthStack';
import { MainNavigator } from './MainNavigator';
import { AdminNavigator } from './AdminNavigator';
import { StoreNavigator } from './StoreNavigator';
import { PartnerNavigator } from './PartnerNavigator';
import { PendingApprovalScreen } from '@auth/screens/PendingApprovalScreen';
import { linking } from './linking';

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  Admin: undefined;
  Store: undefined;
  Partner: undefined;
  PendingApproval: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();

  const isFullySetup =
    isAuthenticated && user && user.profile_complete && !!user.role;
  const isActive  = isFullySetup && user?.status === 'active';
  const isPending = isFullySetup && user?.status === 'pending_approval';
  const isAdmin   = isActive && user?.role === 'admin';
  const isStore   = isActive && user?.role === 'store';
  const isPartner = isActive && ['restaurant', 'delivery', 'cab_driver', 'salon'].includes(user?.role ?? '');

  const renderMain = () => {
    if (isAdmin)   return <Stack.Screen name="Admin"   component={AdminNavigator} />;
    if (isStore)   return <Stack.Screen name="Store"   component={StoreNavigator} />;
    if (isPartner) return <Stack.Screen name="Partner" component={PartnerNavigator} />;
    if (isActive)  return <Stack.Screen name="Main"    component={MainNavigator} />;
    if (isPending) return <Stack.Screen name="PendingApproval" component={PendingApprovalScreen} />;
    return <Stack.Screen name="Auth" component={AuthStack} />;
  };

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {renderMain()}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
