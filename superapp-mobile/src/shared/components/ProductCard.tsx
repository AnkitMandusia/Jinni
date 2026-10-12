import React from 'react';
import { ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { Card } from './Card';
import { AppIcon } from './AppIcon';

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  unit?: string;
  imageUrl?: string;
  badge?: string;
  rating?: number;
  reviewCount?: number;
  isAvailable?: boolean;
  quantity?: number;
  onPress?: () => void;
  onAddToCart?: () => void;
  onUpdateQuantity?: (quantity: number) => void;
  style?: ViewStyle;
}

const CardContainer = styled(Card)`
  width: 160px;
  margin-right: ${spacing.md}px;
`;

const ImageContainer = styled.View`
  width: 100%;
  height: 120px;
  background-color: ${colors.gray[100]};
  border-radius: ${borderRadius.md}px;
  overflow: hidden;
  margin-bottom: ${spacing.sm}px;
`;

const ProductImage = styled.Image`
  width: 100%;
  height: 100%;
`;

const PlaceholderContainer = styled.View`
  width: 100%;
  height: 100%;
  background-color: ${colors.gray[100]};
  align-items: center;
  justify-content: center;
`;

const Badge = styled.View`
  position: absolute;
  top: ${spacing.xs}px;
  left: ${spacing.xs}px;
  background-color: ${colors.food.primary};
  padding-horizontal: ${spacing.sm}px;
  padding-vertical: 2px;
  border-radius: ${borderRadius.xs}px;
`;

const BadgeText = styled.Text`
  ${typography.caption}
  font-size: 11px;
  color: ${colors.white};
`;

const ProductName = styled.Text`
  ${typography.label}
  color: ${colors.text.primary};
  margin-bottom: 2px;
`;

const UnitText = styled.Text`
  ${typography.caption}
  color: ${colors.text.muted};
  margin-bottom: ${spacing.xs}px;
`;

const PriceContainer = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${spacing.xs}px;
`;

const Price = styled.Text`
  ${typography.h6}
  color: ${colors.text.primary};
`;

const MRP = styled.Text`
  ${typography.caption}
  color: ${colors.text.muted};
  text-decoration-line: line-through;
  margin-left: ${spacing.sm}px;
`;

const Discount = styled.Text`
  ${typography.caption}
  color: ${colors.success.DEFAULT};
  margin-left: ${spacing.sm}px;
`;

const RatingContainer = styled.View`
  flex-direction: row;
  align-items: center;
`;

const RatingText = styled.Text`
  ${typography.caption}
  color: ${colors.text.secondary};
  margin-left: 3px;
`;

const QuantityContainer = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  margin-top: ${spacing.sm}px;
  padding-top: ${spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${colors.border.subtle};
`;

const QuantityButton = styled.TouchableOpacity`
  width: 28px;
  height: 28px;
  background-color: ${colors.primary[50]};
  border-radius: ${borderRadius.sm}px;
  align-items: center;
  justify-content: center;
`;

const QuantityText = styled.Text`
  ${typography.label}
  color: ${colors.text.primary};
  min-width: 24px;
  text-align: center;
`;

const AddButton = styled.TouchableOpacity`
  background-color: ${colors.primary[500]};
  padding-vertical: ${spacing.xs}px;
  padding-horizontal: ${spacing.md}px;
  border-radius: ${borderRadius.sm}px;
  align-items: center;
  justify-content: center;
`;

const AddButtonText = styled.Text`
  ${typography.caption}
  font-weight: 700;
  color: ${colors.white};
`;

const OutOfStockText = styled.Text`
  ${typography.caption}
  color: ${colors.error.DEFAULT};
`;

export const ProductCard: React.FC<ProductCardProps> = ({
  name,
  price,
  mrp,
  unit,
  imageUrl,
  badge,
  rating,
  reviewCount,
  isAvailable = true,
  quantity = 0,
  onPress,
  onAddToCart,
  onUpdateQuantity,
  style,
}) => {
  const discount = mrp && mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

  return (
    <CardContainer onPress={onPress} variant="elevated" padding="sm" style={style}>
      <ImageContainer>
        {imageUrl ? (
          <ProductImage source={{ uri: imageUrl }} resizeMode="cover" />
        ) : (
          <PlaceholderContainer>
            <AppIcon name="storefront" size={24} color={colors.gray[300]} />
          </PlaceholderContainer>
        )}
        {badge && (
          <Badge>
            <BadgeText>{badge}</BadgeText>
          </Badge>
        )}
      </ImageContainer>

      <ProductName numberOfLines={2}>{name}</ProductName>
      {unit && <UnitText>{unit}</UnitText>}

      <PriceContainer>
        <Price>₹{price}</Price>
        {mrp && mrp > price && <MRP>₹{mrp}</MRP>}
        {discount > 0 && <Discount>{discount}% OFF</Discount>}
      </PriceContainer>

      {rating && (
        <RatingContainer>
          <AppIcon name="star" size={11} color={colors.warning.DEFAULT} />
          <RatingText>
            {rating.toFixed(1)} {reviewCount && `(${reviewCount})`}
          </RatingText>
        </RatingContainer>
      )}

      {isAvailable ? (
        <QuantityContainer>
          {quantity > 0 ? (
            <>
              <QuantityButton onPress={() => onUpdateQuantity?.(quantity - 1)}>
                <AppIcon name="minus" size={13} color={colors.primary[500]} />
              </QuantityButton>
              <QuantityText>{quantity}</QuantityText>
              <QuantityButton onPress={() => onUpdateQuantity?.(quantity + 1)}>
                <AppIcon name="plus" size={13} color={colors.primary[500]} />
              </QuantityButton>
            </>
          ) : (
            <AddButton onPress={onAddToCart} style={{ flex: 1 }}>
              <AddButtonText>ADD</AddButtonText>
            </AddButton>
          )}
        </QuantityContainer>
      ) : (
        <QuantityContainer>
          <OutOfStockText>Out of Stock</OutOfStockText>
        </QuantityContainer>
      )}
    </CardContainer>
  );
};

export default ProductCard;
