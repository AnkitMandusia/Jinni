import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '@components/AppButton';
import { useNavigation } from '@react-navigation/native';

export const RideHomeScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Book a Ride</Text>
      <Text style={styles.subtitle}>Get where you need to go</Text>
      
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map View (Google Maps)</Text>
      </View>

      <AppButton
        title="Set Pickup Location"
        onPress={() => navigation.navigate('PickupDrop' as never)}
        size="large"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F9FAFB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    marginVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapText: {
    fontSize: 16,
    color: '#6B7280',
  },
});

export default RideHomeScreen;
