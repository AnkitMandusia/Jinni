import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@theme/colors';

/**
 * Single source of truth for icons across the app. Do not import
 * @expo/vector-icons directly in screens/components — add a name here
 * instead, so stroke weight / set stays consistent and swapping the
 * underlying icon library later only touches this file.
 */
const FEATHER_MAP = {
  search: 'search',
  filter: 'sliders',
  sort: 'bar-chart-2',
  location: 'map-pin',
  cart: 'shopping-cart',
  back: 'arrow-left',
  share: 'share-2',
  'favourite-outline': 'heart',
  clock: 'clock',
  payment: 'credit-card',
  address: 'home',
  phone: 'phone',
  edit: 'edit-2',
  delete: 'trash-2',
  plus: 'plus',
  minus: 'minus',
  check: 'check',
  close: 'x',
  chevronRight: 'chevron-right',
  chevronDown: 'chevron-down',
  info: 'info',
  tag: 'tag',
  navigation: 'navigation',
  calendar: 'calendar',
  messageCircle: 'message-circle',
} as const;

const IONICON_MAP = {
  favourite: 'heart',
  star: 'star',
  restaurant: 'restaurant-outline',
  bike: 'bicycle-outline',
  storefront: 'storefront-outline',
  rider: 'bicycle',
  checkmarkCircle: 'checkmark-circle',
  alertCircle: 'alert-circle',
  timeOutline: 'time-outline',
} as const;

const MCI_MAP = {
  veg: 'square-rounded',
  leaf: 'leaf',
  spicy: 'chili-mild',
  receipt: 'receipt-text-outline',
  coupon: 'ticket-percent-outline',
  bestseller: 'crown-outline',
} as const;

type FeatherName = keyof typeof FEATHER_MAP;
type IoniconName = keyof typeof IONICON_MAP;
type MciName = keyof typeof MCI_MAP;

export type AppIconName = FeatherName | IoniconName | MciName;

interface AppIconProps {
  name: AppIconName;
  size?: number;
  color?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ name, size = 18, color = colors.text.secondary }) => {
  if (name in FEATHER_MAP) {
    return <Feather name={FEATHER_MAP[name as FeatherName] as any} size={size} color={color} />;
  }
  if (name in IONICON_MAP) {
    return <Ionicons name={IONICON_MAP[name as IoniconName] as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={MCI_MAP[name as MciName] as any} size={size} color={color} />;
};

export default AppIcon;
