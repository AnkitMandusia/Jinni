import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ParamListBase } from '@react-navigation/native';

// Import HomeCards statically
import FoodHomeCard from './food/components/FoodHomeCard';
import GroceryHomeCard from './grocery/components/GroceryHomeCard';
import CabHomeCard from './cab/components/CabHomeCard';
import SalonHomeCard from './salon/components/SalonHomeCard';

// Import navigators statically
import { FoodStack } from '../shared/navigation/stacks/FoodStack';
import { GroceryStack } from '../shared/navigation/stacks/GroceryStack';
import { CabStack } from '../shared/navigation/stacks/CabStack';
import { SalonStack } from '../shared/navigation/stacks/SalonStack';

export type ModuleType = 'food' | 'grocery' | 'cab' | 'salon';

export interface ModuleConfig {
  id: ModuleType;
  name: string;
  icon: string;
  color: string;
  description: string;
  HomeCard: React.FC<{ onPress: () => void }>;
  navigator: React.FC;
  enabled: boolean;
}

// Module registry - static imports for Metro compatibility
export const modules: ModuleConfig[] = [
  {
    id: 'food',
    name: 'Food Delivery',
    icon: 'restaurant',
    color: '#FF6B6B',
    description: 'Order from your favorite restaurants',
    HomeCard: FoodHomeCard,
    navigator: FoodStack,
    enabled: true,
  },
  {
    id: 'grocery',
    name: 'Grocery',
    icon: 'basket',
    color: '#1D9E75',
    description: 'Fresh groceries delivered to your door',
    HomeCard: GroceryHomeCard,
    navigator: GroceryStack,
    enabled: true,
  },
  {
    id: 'cab',
    name: 'Cab Booking',
    icon: 'car',
    color: '#378ADD',
    description: 'Book a ride anywhere',
    HomeCard: CabHomeCard,
    navigator: CabStack,
    enabled: true,
  },
  {
    id: 'salon',
    name: 'Salon & Spa',
    icon: 'cut',
    color: '#9A8FF9',
    description: 'Book salon services at home',
    HomeCard: SalonHomeCard,
    navigator: SalonStack,
    enabled: true,
  },
];

export const getEnabledModules = (): ModuleConfig[] => {
  return modules.filter(m => m.enabled);
};

export const getModuleById = (id: ModuleType): ModuleConfig | undefined => {
  return modules.find(m => m.id === id);
};

export default modules;
