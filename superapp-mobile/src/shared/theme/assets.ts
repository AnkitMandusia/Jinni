/**
 * Bundled image assets for Home / shared UI.
 * Jinni-specific images live in jinniAssets.ts — import from there for Chirag.
 */
import { jinniAssets } from './jinniAssets';

export const homeAssets = {
  heroFood: require('../../../assets/hero_food.jpg'),
  heroRide: require('../../../assets/hero_ride.jpg'),
  heroStores: require('../../../assets/hero_stores.jpg'),
  // Prefer carousel art; falls back to hero_jinni if only one file exists
  heroJinni: jinniAssets.heroJinniCarousel,

  catFood: require('../../../assets/food_catg.jpg'),
  catRide: require('../../../assets/ride_cat.png'),
  catLocalStore: require('../../../assets/local_shop.png'),
  catMart: require('../../../assets/mart.png'),

  appIcon: require('../../../assets/icon.png'),
  splashIcon: require('../../../assets/splash-icon.png'),
} as const;

export type HomeAssetKey = keyof typeof homeAssets;
export default homeAssets;
