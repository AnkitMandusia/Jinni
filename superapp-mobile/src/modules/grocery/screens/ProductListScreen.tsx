import React, { useEffect, useCallback } from 'react';
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { GroceryStackParamList } from '@navigation/stacks/GroceryStack';
import { useGroceryStore, Product } from '../store/groceryStore';
import { useCartStore } from '@modules/cart/store/cartStore';
import { formatPrice } from '@utils/helpers';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const Header = styled.View`
  background-color: ${colors.white};
  padding-top: ${spacing.xl}px;
  padding-horizontal: ${spacing.lg}px;
  padding-bottom: ${spacing.md}px;
  border-bottom-width: 1px;
  border-bottom-color: ${colors.gray[200]};
  flex-direction: row;
  align-items: center;
`;

const BackButton = styled(TouchableOpacity)`
  padding: ${spacing.sm}px;
  margin-right: ${spacing.md}px;
`;

const HeaderTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${colors.gray[900]};
`;

const ProductCount = styled.Text`
  font-size: 14px;
  color: ${colors.gray[500]};
  margin-left: auto;
`;

const ListContent = styled.View`
  padding: ${spacing.md}px;
`;

// Product Card with Blinkit-style
const ProductCardContainer = styled(TouchableOpacity)`
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.md}px;
  margin-bottom: ${spacing.md}px;
  width: 48%;
  border-width: 1px;
  border-color: ${colors.gray[200]};
`;

const ProductImageContainer = styled.View`
  width: 100%;
  height: 120px;
  background-color: ${colors.gray[100]};
  border-radius: ${borderRadius.md}px;
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.md}px;
`;

const ProductImage = styled(Image)`
  width: 100%;
  height: 100%;
  border-radius: ${borderRadius.md}px;
`;

const PlaceholderIcon = styled(Text)`
  font-size: 48px;
`;

const ProductName = styled.Text`
  font-size: 14px;
  font-weight: 500;
  color: ${colors.gray[900]};
  margin-bottom: ${spacing.xs}px;
`;

const UnitText = styled.Text`
  font-size: 12px;
  color: ${colors.gray[500]};
  margin-bottom: ${spacing.sm}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${spacing.sm}px;
`;

const Price = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: ${colors.gray[900]};
`;

const MRP = styled.Text`
  font-size: 12px;
  color: ${colors.gray[400]};
  text-decoration-line: line-through;
  margin-left: ${spacing.sm}px;
`;

const DiscountBadge = styled.View`
  background-color: ${colors.grocery.primary}15;
  padding-horizontal: ${spacing.xs}px;
  padding-vertical: 2px;
  border-radius: 4px;
  margin-left: auto;
`;

const DiscountText = styled.Text`
  font-size: 10px;
  color: ${colors.grocery.primary};
  font-weight: 600;
`;

// Quantity Selector (Blinkit style)
const AddButton = styled(TouchableOpacity)`
  background-color: ${colors.grocery.primary}15;
  border-width: 1px;
  border-color: ${colors.grocery.primary};
  border-radius: ${borderRadius.md}px;
  padding-vertical: ${spacing.sm}px;
  align-items: center;
  justify-content: center;
  flex-direction: row;
`;

const AddButtonText = styled.Text`
  font-size: 14px;
  color: ${colors.grocery.primary};
  font-weight: 600;
`;

const QuantityContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${colors.grocery.primary}15;
  border-width: 1px;
  border-color: ${colors.grocery.primary};
  border-radius: ${borderRadius.md}px;
  padding-horizontal: ${spacing.sm}px;
  height: 36px;
`;

const QuantityButton = styled(TouchableOpacity)`
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
`;

const QuantityText = styled.Text`
  font-size: 14px;
  color: ${colors.grocery.primary};
  font-weight: 700;
  min-width: 24px;
  text-align: center;
`;

const OutOfStockText = styled.Text`
  font-size: 12px;
  color: ${colors.error.DEFAULT};
  text-align: center;
`;

const EmptyContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const EmptyText = styled.Text`
  font-size: 16px;
  color: ${colors.gray[500]};
  text-align: center;
  margin-top: ${spacing.md}px;
`;

const ErrorContainer = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: ${spacing.xl}px;
`;

const ErrorText = styled.Text`
  font-size: 16px;
  color: ${colors.error.DEFAULT};
  text-align: center;
  margin-bottom: ${spacing.md}px;
`;

const RetryButton = styled(TouchableOpacity)`
  background-color: ${colors.primary[500]};
  padding-horizontal: ${spacing.lg}px;
  padding-vertical: ${spacing.md}px;
  border-radius: ${borderRadius.md}px;
`;

const RetryText = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.white};
`;

// Floating Cart Button
const CartButton = styled(TouchableOpacity)`
  position: absolute;
  bottom: ${spacing.xl}px;
  right: ${spacing.lg}px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background-color: ${colors.grocery.primary};
  align-items: center;
  justify-content: center;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4px;
  elevation: 6;
`;

const CartBadge = styled.View`
  position: absolute;
  top: -4px;
  right: -4px;
  background-color: ${colors.error.DEFAULT};
  border-radius: 12px;
  min-width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  padding-horizontal: 4px;
`;

const CartBadgeText = styled.Text`
  color: ${colors.white};
  font-size: 12px;
  font-weight: 700;
`;

interface ProductItemProps {
  product: Product;
  cartQuantity: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onPress: () => void;
}

const ProductItem: React.FC<ProductItemProps> = ({
  product,
  cartQuantity,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
}) => {
  // Parse prices (API returns them as strings/numbers)
  const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
  const mrp = typeof product.mrp === 'string' ? parseFloat(product.mrp) : (product.mrp || 0);
  const hasDiscount = mrp > 0 && mrp > price;
  const discountPercent = hasDiscount
    ? Math.round(((mrp - price) / mrp) * 100)
    : 0;

  return (
    <ProductCardContainer onPress={onPress} activeOpacity={0.8}>
      <ProductImageContainer>
        {product.primary_image_url ? (
          <ProductImage source={{ uri: product.primary_image_url }} resizeMode="cover" />
        ) : (
          <PlaceholderIcon>📦</PlaceholderIcon>
        )}
      </ProductImageContainer>

      <ProductName numberOfLines={2}>{product.name}</ProductName>
      <UnitText>{product.unit}</UnitText>

      <PriceRow>
        <Price>{formatPrice(price)}</Price>
        {hasDiscount && <MRP>{formatPrice(mrp)}</MRP>}
        {discountPercent > 0 && (
          <DiscountBadge>
            <DiscountText>{discountPercent}% OFF</DiscountText>
          </DiscountBadge>
        )}
      </PriceRow>

      {!product.is_in_stock ? (
        <OutOfStockText>Out of Stock</OutOfStockText>
      ) : cartQuantity === 0 ? (
        <AddButton onPress={onAdd} activeOpacity={0.7}>
          <AddButtonText>ADD</AddButtonText>
        </AddButton>
      ) : (
        <QuantityContainer>
          <QuantityButton onPress={onDecrement}>
            <Ionicons name="remove" size={18} color={colors.grocery.primary} />
          </QuantityButton>
          <QuantityText>{cartQuantity}</QuantityText>
          <QuantityButton onPress={onIncrement}>
            <Ionicons name="add" size={18} color={colors.grocery.primary} />
          </QuantityButton>
        </QuantityContainer>
      )}
    </ProductCardContainer>
  );
};

export const ProductListScreen: React.FC = () => {
  const route = useRoute<RouteProp<GroceryStackParamList, 'ProductList'>>();
  const navigation = useNavigation();
  const { categoryId, categoryName, storeId, storeName } = route.params;
  const { products, isLoading, error, fetchProducts } = useGroceryStore();
  const { items, moduleType: cartModuleType, addItem, updateQuantity, removeItem } = useCartStore();

  useEffect(() => {
    fetchProducts({ categoryId, storeId });
  }, [categoryId, storeId]);

  // Get cart quantity for a product
  const getCartQuantity = useCallback(
    (productId: string) => {
      const cartItem = items.find((item) => item.id === productId);
      return cartItem ? cartItem.quantity : 0;
    },
    [items]
  );

  // Get total grocery items in cart for badge
  const getTotalCartItems = useCallback(() => {
    if (cartModuleType !== 'grocery') return 0;
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items, cartModuleType]);

  const handleAddToCart = (product: Product) => {
    // Ensure price is a number (API returns as string)
    const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
    addItem(
      {
        id: product.id,
        name: product.name,
        price: price,
        quantity: 1,
        imageUrl: product.primary_image_url,
        unit: product.unit,
      },
      'grocery',
      { categoryId }
    );
  };

  const handleIncrement = (productId: string) => {
    const cartItem = items.find((item) => item.id === productId);
    if (cartItem) {
      updateQuantity(productId, cartItem.quantity + 1);
    }
  };

  const handleDecrement = (productId: string) => {
    const cartItem = items.find((item) => item.id === productId);
    if (cartItem) {
      if (cartItem.quantity <= 1) {
        removeItem(productId);
      } else {
        updateQuantity(productId, cartItem.quantity - 1);
      }
    }
  };

  const handleRetry = () => {
    fetchProducts({ categoryId, storeId });
  };

  const renderProductItem = ({ item }: { item: Product }) => (
    <ProductItem
      product={item}
      cartQuantity={getCartQuantity(item.id)}
      onAdd={() => handleAddToCart(item)}
      onIncrement={() => handleIncrement(item.id)}
      onDecrement={() => handleDecrement(item.id)}
      onPress={() =>
        (navigation as any).navigate('ProductDetail', { productId: item.id, storeId })
      }
    />
  );

  if (isLoading && products.length === 0) {
    return (
      <Container>
        <Header>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.gray[900]} />
          </BackButton>
          <HeaderTitle>{categoryName || 'Products'}</HeaderTitle>
        </Header>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.grocery.primary} />
        </View>
      </Container>
    );
  }

  if (error && products.length === 0) {
    return (
      <Container>
        <Header>
          <BackButton onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.gray[900]} />
          </BackButton>
          <HeaderTitle>{categoryName || 'Products'}</HeaderTitle>
        </Header>
        <ErrorContainer>
          <PlaceholderIcon style={{ fontSize: 48 }}>⚠️</PlaceholderIcon>
          <ErrorText>{error}</ErrorText>
          <RetryButton onPress={handleRetry}>
            <RetryText>Try Again</RetryText>
          </RetryButton>
        </ErrorContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <BackButton onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.gray[900]} />
        </BackButton>
        <HeaderTitle numberOfLines={1}>{categoryName || 'Products'}</HeaderTitle>
        <ProductCount>{products.length} items</ProductCount>
      </Header>

      {products.length === 0 ? (
        <EmptyContainer>
          <PlaceholderIcon style={{ fontSize: 64 }}>📭</PlaceholderIcon>
          <EmptyText>No products available in this category</EmptyText>
        </EmptyContainer>
      ) : (
        <FlatList
          data={products}
          numColumns={2}
          contentContainerStyle={{ padding: spacing.md }}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          keyExtractor={(item) => item.id}
          renderItem={renderProductItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => fetchProducts({ categoryId })}
              colors={[colors.grocery.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating Cart Button */}
      {getTotalCartItems() > 0 && (
        <CartButton
          onPress={() => navigation.navigate('GroceryCart' as never)}
          activeOpacity={0.8}
        >
          <Ionicons name="cart" size={24} color={colors.white} />
          <CartBadge>
            <CartBadgeText>{getTotalCartItems()}</CartBadgeText>
          </CartBadge>
        </CartButton>
      )}
    </Container>
  );
};

export default ProductListScreen;
