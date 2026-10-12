import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

const SALONS = [
  { id: '1', name: 'Style Studio', rating: 4.8, services: ['Haircut', 'Facial', 'Spa'] },
  { id: '2', name: 'Glamour Bar', rating: 4.5, services: ['Hair Color', 'Makeup', 'Nails'] },
];

export const SalonListScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Salons & Barbers</Text>
      <FlatList
        data={SALONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.salonCard}
            onPress={() => navigation.navigate('ServiceSelect' as never, { salonId: item.id } as never)}
          >
            <Text style={styles.salonName}>{item.name}</Text>
            <Text style={styles.rating}>★ {item.rating}</Text>
            <Text style={styles.services}>{item.services.join(' • ')}</Text>
          </TouchableOpacity>
        )}
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
    marginBottom: 16,
  },
  salonCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  salonName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  rating: {
    fontSize: 14,
    color: '#1D9E75',
    marginTop: 4,
  },
  services: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
});

export default SalonListScreen;
