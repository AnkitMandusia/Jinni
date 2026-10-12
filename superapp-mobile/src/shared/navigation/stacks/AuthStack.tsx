import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SplashScreen } from '@auth/screens/SplashScreen';
import { LoginScreen } from '@auth/screens/LoginScreen';
import { PhoneEntryScreen } from '@auth/screens/PhoneEntryScreen';
import { OTPVerifyScreen } from '@auth/screens/OTPVerifyScreen';
import { RoleSelectScreen } from '@auth/screens/RoleSelectScreen';
import { SignupFormScreen } from '@auth/screens/SignupFormScreen';
import { UserRole } from '@auth/store/authStore';

export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  PhoneEntry: undefined;
  OTPVerify: { phone: string };
  RoleSelect: undefined;
  SignupForm: { role: UserRole };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="Splash"
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
      <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} />
      <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
      <Stack.Screen name="SignupForm" component={SignupFormScreen} />
    </Stack.Navigator>
  );
};

export default AuthStack;
