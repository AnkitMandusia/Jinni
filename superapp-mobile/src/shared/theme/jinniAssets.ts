/**
 * SINGLE SOURCE OF TRUTH for all Jinni / Chirag image assets.
 *
 * Place these files under:  superapp-mobile/assets/
 * (same folder as hero_food.jpg, icon.png, etc.)
 *
 * | File                      | Used in                          |
 * |---------------------------|----------------------------------|
 * | chirag_idle.png           | Overlay — calm / arriving        |
 * | chirag_listening.png      | Overlay — listening              |
 * | chirag_thinking.png       | Overlay — thinking               |
 * | chirag_success.png        | Overlay — success                |
 * | hero_jinni.png            | Home hero carousel (alias)       |
 * | hero_jinni_carousel.png   | Home hero carousel preferred     |
 * | order_wish_banner_bg.png  | My Orders banner background      |
 * | splash_lamp_glow.png      | Splash lamp art (optional)       |
 *
 * Import ONLY from here — never scatter require() paths across screens.
 */
export const jinniAssets = {
  chiragIdle: require('../../../assets/chirag_idle.png'),
  chiragListening: require('../../../assets/chirag_listening.png'),
  chiragThinking: require('../../../assets/chirag_thinking.png'),
  chiragSuccess: require('../../../assets/chirag_success.png'),
  heroJinni: require('../../../assets/hero_jinni.png'),
  heroJinniCarousel: require('../../../assets/hero_jinni_carousel.png'),
  orderWishBannerBg: require('../../../assets/order_wish_banner_bg.png'),
  splashLampGlow: require('../../../assets/splash_lamp_glow.png'),
} as const;

export type JinniAssetKey = keyof typeof jinniAssets;

/** Map Chirag scene → character image */
export function chiragImageForScene(
  scene: string
): (typeof jinniAssets)[JinniAssetKey] {
  switch (scene) {
    case 'listening':
      return jinniAssets.chiragListening;
    case 'thinking':
      return jinniAssets.chiragThinking;
    case 'speaking':
      return jinniAssets.chiragListening;
    case 'success':
      return jinniAssets.chiragSuccess;
    case 'arriving':
    case 'summoning':
    case 'dismissing':
    default:
      return jinniAssets.chiragIdle;
  }
}

export default jinniAssets;
