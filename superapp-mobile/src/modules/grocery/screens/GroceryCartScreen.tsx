import React from 'react';
import { FlatList, View, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { ProductCard } from '@components/ProductCard';
import { EmptyState } from '@components/EmptyState';
import { useCartStore } from '@modules/cart/store/cartStore';
import { formatPrice } from '@utils/helpers';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const Header = styled.View`
  padding: ${spacing.lg}px;
  border-bottom-width: 1px;
  border-bottom-color: ${colors.gray[200]};
`;

const Title = styled.Text`
  font-size: 20px;
  font-weight: 600;
  color: ${colors.gray[900]};
`;

const Subtitle = styled.Text`
  font-size: 14px;
  color: ${colors.gray[500]};
  margin-top: ${spacing.xs}px;
`;

const ListContent = styled.View`
  padding: ${spacing.md}px;
`;

const SummaryCard = styled.View`
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin: ${spacing.md}px;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.05;
  shadow-radius: 2px;
  elevation: 2;
`;

const SummaryRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: ${spacing.sm}px;
`;

const SummaryLabel = styled.Text`
  font-size: 14px;
  color: ${colors.gray[500]};
`;

const SummaryValue = styled.Text`
  font-size: 16px;
  color: ${colors.gray[900]};
`;

const TotalRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: ${spacing.md}px;
  padding-top: ${spacing.md}px;
  border-top-width: 1px;
  border-top-color: ${colors.gray[200]};
`;

const TotalLabel = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${colors.gray[900]};
`;

const TotalValue = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: ${colors.grocery.primary};
`;

const ButtonContainer = styled.View`
  padding: ${spacing.md}px;
  background-color: ${colors.white};
  border-top-width: 1px;
  border-top-color: ${colors.gray[200]};
`;

export const GroceryCartScreen: React.FC = () => {
  const navigation = useNavigation();
  const { items: allItems, updateQuantity, removeItem } = useCartStore();
  // The cart store is shared across modules (unified cart) — only show/checkout
  // this module's lines here, same as FoodCartScreen does for 'food'.
  const items = allItems.filter((i) => i.moduleType === 'grocery');

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = items.length > 0 ? (subtotal >= 500 ? 0 : 40) : 0;
  const total = subtotal + deliveryFee;

  const handleCheckout = () => {
    navigation.navigate('GroceryCheckout' as never, { items } as never);
  };

  if (items.length === 0) {
    return (
      <Container>
        <EmptyState
          icon={<Text style={{ fontSize: 48 }}>🛒</Text>}
          title="Your cart is empty"
          description="Add some fresh groceries to your cart"
          actionLabel="Browse Categories"
          onAction={() => navigation.navigate('Categories' as never)}
        />
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>Grocery Cart</Title>
        <Subtitle>{items.length} items</Subtitle>
      </Header>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.md }}
        renderItem={({ item }) => (
          <ProductCard
            id={item.id}
            name={item.name}
            price={item.price}
            unit={item.unit}
            quantity={item.quantity}
            onAddToCart={() => {}}
            onUpdateQuantity={(qty) => {
              if (qty === 0) {
                removeItem(item.id);
              } else {
                updateQuantity(item.id, qty);
              }
            }}
          />
        )}
      />

      <SummaryCard>
        <SummaryRow>
          <SummaryLabel>Subtotal</SummaryLabel>
          <SummaryValue>{formatPrice(subtotal)}</SummaryValue>
        </SummaryRow>
        <SummaryRow>
          <SummaryLabel>Delivery Fee</SummaryLabel>
          <SummaryValue>{formatPrice(deliveryFee)}</SummaryValue>
        </SummaryRow>
        <TotalRow>
          <TotalLabel>Total</TotalLabel>
          <TotalValue>{formatPrice(total)}</TotalValue>
        </TotalRow>
      </SummaryCard>

      <ButtonContainer>
        <AppButton
          title={`Checkout • ${formatPrice(total)}`}
          onPress={handleCheckout}
          size="large"
        />
      </ButtonContainer>
    </Container>
  );
};

export default GroceryCartScreen;
