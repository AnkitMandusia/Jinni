import React, { useEffect, useState } from 'react';
import { ScrollView, Image, View, ActivityIndicator } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { AppButton } from '@components/AppButton';
import { GroceryStackParamList } from '@navigation/stacks/GroceryStack';
import { useCartStore } from '@modules/cart/store/cartStore';
import { formatPrice } from '@utils/helpers';
import { api } from '@services/api';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.gray[50]};
`;

const ProductImage = styled.Image`
  width: 100%;
  height: 280px;
  background-color: ${colors.gray[100]};
`;

const ContentContainer = styled.View`
  padding: ${spacing.lg}px;
`;

const ProductName = styled.Text`
  font-size: 20px;
  font-weight: 600;
  color: ${colors.gray[900]};
  margin-bottom: ${spacing.sm}px;
`;

const ProductUnit = styled.Text`
  font-size: 14px;
  color: ${colors.gray[500]};
  margin-bottom: ${spacing.md}px;
`;

const PriceRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${spacing.lg}px;
`;

const CurrentPrice = styled.Text`
  font-size: 20px;
  font-weight: 700;
  color: ${colors.grocery.primary};
  margin-right: ${spacing.md}px;
`;

const MRP = styled.Text`
  font-size: 16px;
  color: ${colors.gray[400]};
  text-decoration-line: line-through;
`;

const Discount = styled.Text`
  font-size: 12px;
  font-weight: 600;
  color: ${colors.success[600]};
  margin-left: ${spacing.sm}px;
`;

const DescriptionCard = styled.View`
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.lg}px;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.05;
  shadow-radius: 2px;
  elevation: 2;
`;

const SectionTitle = styled.Text`
  font-size: 16px;
  font-weight: 600;
  color: ${colors.gray[900]};
  margin-bottom: ${spacing.sm}px;
`;

const Description = styled.Text`
  font-size: 16px;
  color: ${colors.gray[600]};
`;

const QuantitySelector = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background-color: ${colors.white};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.md}px ${spacing.lg}px;
  margin-bottom: ${spacing.lg}px;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.05;
  shadow-radius: 2px;
  elevation: 2;
`;

const QuantityLabel = styled.Text`
  font-size: 16px;
  color: ${colors.gray[700]};
`;

const QuantityButtons = styled.View`
  flex-direction: row;
  align-items: center;
`;

const QtyButton = styled.TouchableOpacity`
  width: 36px;
  height: 36px;
  background-color: ${colors.gray[100]};
  border-radius: ${borderRadius.md}px;
  align-items: center;
  justify-content: center;
`;

const QtyButtonText = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${colors.gray[900]};
`;

const QtyValue = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${colors.gray[900]};
  margin-horizontal: ${spacing.lg}px;
  min-width: 30px;
  text-align: center;
`;

export const ProductDetailScreen: React.FC = () => {
  const route = useRoute<RouteProp<GroceryStackParamList, 'ProductDetail'>>();
  const navigation = useNavigation();
  const { productId } = route.params;
  const { addItem } = useCartStore();
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        const data: any = await api.get(`/grocery/products/${productId}`);
        if (!isMounted) return;
        setProduct(data);
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load product');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchProduct();
    return () => {
      isMounted = false;
    };
  }, [productId]);

  // Calculate discount safely
  const priceNum = product ? (typeof product.price === 'string' ? parseFloat(product.price) : product.price || 0) : 0;
  const mrpNum = product ? (typeof product.mrp === 'string' ? parseFloat(product.mrp) : product.mrp || 0) : 0;
  const discount = product && mrpNum && mrpNum > priceNum ? Math.round(((mrpNum - priceNum) / mrpNum) * 100) : 0;

  const [addedToCart, setAddedToCart] = useState(false);

  const handleAddToCart = () => {
    if (!product) return;
    const price = typeof product.price === 'string' ? parseFloat(product.price) : (product.price || 0);
    addItem(
      {
        id: product.id,
        name: product.name,
        price: price,
        quantity,
        imageUrl: product.primary_image_url || product.imageUrl,
        unit: product.unit,
      },
      'grocery',
      { categoryId: product.category_id }
    );
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  return (
    <Container>
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.grocery.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg }}>
          <ProductName style={{ textAlign: 'center' }}>Failed to load product</ProductName>
          <ProductUnit style={{ textAlign: 'center' }}>{error}</ProductUnit>
        </View>
      ) : (
        <ScrollView>
          <ProductImage source={{ uri: (product?.primary_image_url || product?.imageUrl) ?? undefined }} resizeMode="cover" />
        
          <ContentContainer>
            <ProductName>{product?.name}</ProductName>
            <ProductUnit>{product?.unit}</ProductUnit>
          
            <PriceRow>
              <CurrentPrice>{formatPrice(priceNum)}</CurrentPrice>
              {mrpNum > 0 && <MRP>{formatPrice(mrpNum)}</MRP>}
              {discount > 0 && <Discount>{discount}% OFF</Discount>}
            </PriceRow>

            <QuantitySelector>
              <QuantityLabel>Quantity</QuantityLabel>
              <QuantityButtons>
                <QtyButton onPress={() => setQuantity(Math.max(1, quantity - 1))}>
                  <QtyButtonText>−</QtyButtonText>
                </QtyButton>
                <QtyValue>{quantity}</QtyValue>
                <QtyButton onPress={() => setQuantity(quantity + 1)}>
                  <QtyButtonText>+</QtyButtonText>
                </QtyButton>
              </QuantityButtons>
            </QuantitySelector>

            <DescriptionCard>
              <SectionTitle>Description</SectionTitle>
              <Description style={{ lineHeight: 24 }}>{product?.description || 'No description available.'}</Description>
            </DescriptionCard>
          </ContentContainer>
        </ScrollView>
      )}

      <View style={{ padding: spacing.md, backgroundColor: colors.white }}>
        <AppButton
          title={addedToCart ? '✓ Added to Cart' : `Add ${quantity} to Cart • ${formatPrice(priceNum * quantity)}`}
          onPress={handleAddToCart}
          size="large"
          disabled={!product || addedToCart}
        />
      </View>
    </Container>
  );
};

export default ProductDetailScreen;
