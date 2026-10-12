import React, { useEffect } from 'react';
import {
  FlatList,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import styled from 'styled-components/native';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { GroceryStackParamList } from '@navigation/stacks/GroceryStack';
import { useGroceryStore } from '../store/groceryStore';

const Container = styled(SafeAreaView)`
  flex: 1;
  background-color: ${colors.white};
`;

const Header = styled.View`
  padding-top: ${spacing.xl}px;
  padding-horizontal: ${spacing.lg}px;
  padding-bottom: ${spacing.lg}px;
  background-color: ${colors.grocery.primary};
`;

const Title = styled.Text`
  font-size: 24px;
  font-weight: 700;
  color: ${colors.white};
`;

const Subtitle = styled.Text`
  font-size: 14px;
  color: ${colors.white}CC;
  margin-top: ${spacing.xs}px;
`;

const SectionTitle = styled.Text`
  font-size: 18px;
  font-weight: 600;
  color: ${colors.gray[900]};
  padding: ${spacing.lg}px ${spacing.lg}px ${spacing.md}px;
`;

const GridContainer = styled.View`
  padding-horizontal: ${spacing.md}px;
`;

const CategoryCard = styled(TouchableOpacity)`
  background-color: ${colors.gray[50]};
  border-radius: ${borderRadius.lg}px;
  padding: ${spacing.lg}px;
  margin-bottom: ${spacing.md}px;
  margin-horizontal: ${spacing.xs}px;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  flex: 1;
  max-width: 48%;
  border-width: 1px;
  border-color: ${colors.gray[100]};
`;

const IconContainer = styled.View`
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background-color: ${colors.white};
  align-items: center;
  justify-content: center;
  margin-bottom: ${spacing.sm}px;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.05;
  shadow-radius: 2px;
  elevation: 2;
`;

const IconEmoji = styled(Text)`
  font-size: 28px;
`;

const CategoryName = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: ${colors.gray[900]};
  text-align: center;
`;

const ProductCount = styled.Text`
  font-size: 12px;
  color: ${colors.gray[500]};
  margin-top: 2px;
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

export const CategoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<GroceryStackParamList, 'StoreCategories'>>();
  const { storeId, storeName } = route.params;
  const { categories, isLoading, error, fetchCategories } = useGroceryStore();

  useEffect(() => {
    fetchCategories(storeId);
  }, [storeId]);

  const handleRetry = () => {
    fetchCategories(storeId);
  };

  const renderCategoryItem = ({ item }: { item: any }) => (
    <CategoryCard
      onPress={() =>
        navigation.navigate('ProductList', {
          categoryId: item.id,
          categoryName: item.name,
          storeId,
          storeName,
        })
      }
      activeOpacity={0.7}
    >
      <IconContainer>
        <IconEmoji>{item.icon || '🛒'}</IconEmoji>
      </IconContainer>
      <CategoryName numberOfLines={2}>{item.name}</CategoryName>
      <ProductCount>{item.product_count || 0} items</ProductCount>
    </CategoryCard>
  );

  if (isLoading && categories.length === 0) {
    return (
      <Container>
        <Header>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: spacing.md }}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Title>{storeName}</Title>
          <Subtitle>Choose a category</Subtitle>
        </Header>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.grocery.primary} />
        </View>
      </Container>
    );
  }

  if (error && categories.length === 0) {
    return (
      <Container>
        <Header>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: spacing.md }}>
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>
          <Title>{storeName}</Title>
          <Subtitle>Choose a category</Subtitle>
        </Header>
        <ErrorContainer>
          <IconEmoji style={{ fontSize: 48, marginBottom: 16 }}>⚠️</IconEmoji>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: spacing.md }}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <View>
          <Title>{storeName}</Title>
          <Subtitle>Choose a category</Subtitle>
        </View>
      </Header>

      <SectionTitle>Shop by Category</SectionTitle>

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderCategoryItem}
        numColumns={2}
        contentContainerStyle={{
          padding: spacing.md,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => fetchCategories(storeId)}
            colors={[colors.grocery.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </Container>
  );
};

export default CategoryScreen;
