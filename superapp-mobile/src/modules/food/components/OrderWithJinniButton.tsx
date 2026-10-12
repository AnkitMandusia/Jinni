import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MagicLampIcon } from '@modules/jinni/components/MagicLampIcon';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { useJinniSession } from '@modules/jinni/hooks/useJinniSession';

interface OrderWithJinniButtonProps {
  restaurantId?: string;
  restaurantName?: string;
  compact?: boolean;
}

/**
 * "Order with Jinni" affordance for RestaurantListScreen / RestaurantDetailScreen
 * (spec section 4.4). Hands off to the Chirag overlay with food-ordering
 * context — functional food pre-load (search_food / add_items_to_cart
 * tools) is backend work tracked separately; this wires the UI entry point
 * and context hint only. Per the spec's restraint rule, this is the ONLY
 * new Jinni visual on food screens — menu/cart stay standard commerce UI.
 */
export const OrderWithJinniButton: React.FC<OrderWithJinniButtonProps> = ({
  restaurantId,
  restaurantName,
  compact,
}) => {
  const { open, wishes } = useJinniSession();

  return (
    <Pressable
      onPress={() => open('foodOrderWithJinni', { restaurantId, restaurantName })}
      style={[styles.pill, compact && styles.pillCompact]}
      accessibilityRole="button"
      accessibilityLabel="Order with Jinni"
    >
      <View style={styles.iconWrap}>
        <MagicLampIcon size={14} />
      </View>
      <Text style={styles.label} numberOfLines={1}>
        Order with Jinni
      </Text>
      {!wishes.isExhausted && <View style={styles.dot} />}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: jinniColors.purple[50],
    borderWidth: 1,
    borderColor: jinniColors.gold[200],
  },
  pillCompact: {
    paddingVertical: 5,
    paddingHorizontal: spacing.sm,
  },
  iconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: jinniColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: jinniColors.purple[700],
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: jinniColors.gold[400],
    marginLeft: 6,
  },
});

export default OrderWithJinniButton;
