import React from 'react';
import { View, ViewStyle } from 'react-native';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const SkeletonContainer = styled(View)<{ borderRadius: number }>`
  background-color: ${colors.gray[200]};
  overflow: hidden;
  border-radius: ${props => props.borderRadius}px;
`;

const Shimmer = styled(Animated.View)`
  width: 40%;
  height: 100%;
  background-color: ${colors.gray[100]};
  opacity: 0.5;
`;

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius = 8,
  style,
}) => {
  const translateX = useSharedValue(-100);

  React.useEffect(() => {
    translateX.value = withRepeat(
      withTiming(250, {
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <SkeletonContainer
      style={[{ width, height }, style]}
      borderRadius={borderRadius}
    >
      <Shimmer style={animatedStyle} />
    </SkeletonContainer>
  );
};

// Pre-built skeleton patterns
export const RestaurantCardSkeleton: React.FC = () => (
  <View style={{ padding: spacing.md, marginBottom: spacing.md }}>
    <View style={{ flexDirection: 'row' }}>
      <Skeleton width={80} height={80} borderRadius={12} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Skeleton width="70%" height={20} style={{ marginBottom: spacing.sm }} />
        <Skeleton width="50%" height={16} style={{ marginBottom: spacing.sm }} />
        <Skeleton width="40%" height={16} />
      </View>
    </View>
  </View>
);

export const ProductCardSkeleton: React.FC = () => (
  <View style={{ width: 160, padding: spacing.sm, marginRight: spacing.md }}>
    <Skeleton width="100%" height={120} borderRadius={12} style={{ marginBottom: spacing.sm }} />
    <Skeleton width="90%" height={16} style={{ marginBottom: spacing.xs }} />
    <Skeleton width="60%" height={14} style={{ marginBottom: spacing.xs }} />
    <Skeleton width="50%" height={18} />
  </View>
);

export const ListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <View>
    {Array.from({ length: count }).map((_, index) => (
      <RestaurantCardSkeleton key={index} />
    ))}
  </View>
);

export default Skeleton;
