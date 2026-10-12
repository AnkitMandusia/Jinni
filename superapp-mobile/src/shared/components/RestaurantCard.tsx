import React from 'react';
import { ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { typography } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';
import { Card } from './Card';
import { AppIcon } from './AppIcon';

interface RestaurantCardProps {
  id: string;
  name: string;
  cuisine: string[];
  rating: number;
  deliveryTime: string;
  deliveryFee?: number;
  minOrder?: number;
  imageUrl?: string;
  isOpen?: boolean;
  isPureVeg?: boolean;
  discount?: string;
  distance?: string;
  isFavourite?: boolean;
  onPress?: () => void;
  onToggleFavourite?: () => void;
  style?: ViewStyle;
}

const StyledCard = styled(Card)`
  margin-bottom: ${spacing.lg}px;
`;

const ImageContainer = styled.View`
  width: 100%;
  height: 150px;
  background-color: ${colors.gray[100]};
  border-radius: ${borderRadius.md}px;
  overflow: hidden;
`;

const RestaurantImage = styled.Image`
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

const FavouriteButton = styled.TouchableOpacity`
  position: absolute;
  top: ${spacing.sm}px;
  right: ${spacing.sm}px;
  width: 30px;
  height: 30px;
  border-radius: ${borderRadius.full}px;
  background-color: rgba(255, 255, 255, 0.92);
  align-items: center;
  justify-content: center;
`;

const DiscountRibbon = styled.View`
  position: absolute;
  left: 0;
  bottom: 0;
  background-color: ${colors.secondary[500]};
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
  border-top-right-radius: ${borderRadius.sm}px;
`;

const DiscountText = styled.Text`
  ${typography.label}
  color: ${colors.white};
`;

const ClosedOverlay = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(250, 250, 249, 0.82);
  align-items: center;
  justify-content: center;
`;

const ClosedText = styled.Text`
  ${typography.label}
  color: ${colors.text.primary};
  background-color: ${colors.white};
  padding-horizontal: ${spacing.md}px;
  padding-vertical: ${spacing.xs}px;
  border-radius: ${borderRadius.sm}px;
  overflow: hidden;
`;

const InfoContainer = styled.View`
  margin-top: ${spacing.md}px;
`;

const NameRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const VegDot = styled.View<{ veg: boolean }>`
  width: 11px;
  height: 11px;
  border-radius: 2px;
  border-width: 1.3px;
  border-color: ${props => (props.veg ? colors.food.veg : colors.food.nonVeg)};
  align-items: center;
  justify-content: center;
  margin-right: ${spacing.sm}px;
`;

const VegDotInner = styled.View<{ veg: boolean }>`
  width: 5px;
  height: 5px;
  border-radius: 2.5px;
  background-color: ${props => (props.veg ? colors.food.veg : colors.food.nonVeg)};
`;

const RestaurantName = styled.Text`
  ${typography.h6}
  color: ${colors.text.primary};
  flex: 1;
`;

const MetaRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${spacing.xs}px;
`;

const RatingPill = styled.View`
  flex-direction: row;
  align-items: center;
  background-color: ${colors.success.DEFAULT};
  padding-horizontal: 6px;
  padding-vertical: 2px;
  border-radius: ${borderRadius.xs}px;
  margin-right: ${spacing.sm}px;
`;

const RatingText = styled.Text`
  ${typography.caption}
  color: ${colors.white};
  font-size: 12px;
  margin-left: 3px;
`;

const Dot = styled.Text`
  ${typography.caption}
  color: ${colors.text.muted};
  margin-horizontal: ${spacing.xs}px;
`;

const MetaText = styled.Text`
  ${typography.body2}
  color: ${colors.text.secondary};
`;

const CuisineText = styled.Text`
  ${typography.body2}
  color: ${colors.text.muted};
  margin-top: 2px;
`;

const DetailsRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: ${spacing.sm}px;
`;

const DetailItem = styled.View`
  flex-direction: row;
  align-items: center;
  margin-right: ${spacing.lg}px;
`;

const DetailText = styled.Text`
  ${typography.caption}
  color: ${colors.text.secondary};
  margin-left: 4px;
`;

export const RestaurantCard: React.FC<RestaurantCardProps> = ({
  name,
  cuisine,
  rating,
  deliveryTime,
  deliveryFee,
  distance,
  imageUrl,
  isOpen = true,
  isPureVeg,
  discount,
  isFavourite = false,
  onPress,
  onToggleFavourite,
  style,
}) => {
  return (
    <StyledCard onPress={isOpen ? onPress : undefined} variant="elevated" padding="md" style={style}>
      <ImageContainer>
        {imageUrl ? (
          <RestaurantImage source={{ uri: imageUrl }} resizeMode="cover" />
        ) : (
          <PlaceholderContainer>
            <AppIcon name="restaurant" size={32} color={colors.gray[300]} />
          </PlaceholderContainer>
        )}

        {onToggleFavourite && (
          <FavouriteButton onPress={onToggleFavourite} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <AppIcon
              name={isFavourite ? 'favourite' : 'favourite-outline'}
              size={16}
              color={isFavourite ? colors.secondary[500] : colors.text.secondary}
            />
          </FavouriteButton>
        )}

        {discount && (
          <DiscountRibbon>
            <DiscountText>{discount}</DiscountText>
          </DiscountRibbon>
        )}

        {!isOpen && (
          <ClosedOverlay>
            <ClosedText>Closed now</ClosedText>
          </ClosedOverlay>
        )}
      </ImageContainer>

      <InfoContainer>
        <NameRow>
          {isPureVeg !== undefined && (
            <VegDot veg={isPureVeg}>
              <VegDotInner veg={isPureVeg} />
            </VegDot>
          )}
          <RestaurantName numberOfLines={1}>{name}</RestaurantName>
        </NameRow>

        <MetaRow>
          <RatingPill>
            <AppIcon name="star" size={11} color={colors.white} />
            <RatingText>{rating.toFixed(1)}</RatingText>
          </RatingPill>
          <MetaText>{deliveryTime}</MetaText>
          {distance && (
            <>
              <Dot>•</Dot>
              <MetaText>{distance}</MetaText>
            </>
          )}
        </MetaRow>

        <CuisineText numberOfLines={1}>{cuisine.join(' • ')}</CuisineText>

        <DetailsRow>
          <DetailItem>
            <AppIcon name="bike" size={13} color={colors.text.secondary} />
            <DetailText>{deliveryFee === 0 ? 'Free delivery' : deliveryFee !== undefined ? `₹${deliveryFee} delivery` : ''}</DetailText>
          </DetailItem>
        </DetailsRow>
      </InfoContainer>
    </StyledCard>
  );
};

export default RestaurantCard;
