import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  ImageSourcePropType,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { colors } from '@theme/colors';
import { spacing, borderRadius } from '@theme/spacing';
import { typography } from '@theme/typography';

export interface HeroSlide {
  id: string;
  image: ImageSourcePropType;
  eyebrow: string;
  title: string;
  subtitle: string;
  onPress?: () => void;
}

interface HeroCarouselProps {
  slides: HeroSlide[];
  /** ms between auto-advances. */
  intervalMs?: number;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDE_WIDTH = SCREEN_WIDTH - spacing.xl * 2;
const SLIDE_HEIGHT = 168;
const SLIDE_SPACING = spacing.xl; // ScrollView horizontal padding == snap width

/**
 * Self-contained auto-sliding carousel built on ScrollView + pagingEnabled —
 * no carousel package. Auto-advance pauses while the user is actively
 * dragging and resumes after release, so it never fights a manual swipe.
 */
export const HeroCarousel: React.FC<HeroCarouselProps> = ({ slides, intervalMs = 3500 }) => {
  const scrollRef = useRef<ScrollView>(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const isDraggingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      if (isDraggingRef.current) return;
      const next = (indexRef.current + 1) % slides.length;
      indexRef.current = next;
      setActiveIndex(next);
      scrollRef.current?.scrollTo({ x: next * SLIDE_WIDTH, animated: true });
    }, intervalMs);
  }, [slides.length, intervalMs, clearTimer]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SLIDE_WIDTH);
    indexRef.current = next;
    setActiveIndex(next);
  }, []);

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        snapToInterval={SLIDE_WIDTH}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => { isDraggingRef.current = true; }}
        onScrollEndDrag={() => { isDraggingRef.current = false; }}
        onMomentumScrollEnd={handleScrollEnd}
        accessibilityRole="adjustable"
        accessibilityLabel="Featured highlights"
      >
        {slides.map((slide) => (
          <TouchableOpacity
            key={slide.id}
            activeOpacity={slide.onPress ? 0.9 : 1}
            onPress={slide.onPress}
            style={styles.slide}
          >
            <Image source={slide.image} style={styles.image} resizeMode="cover" />
            <View style={styles.scrim} />
            <View style={styles.textBlock}>
              <Text style={styles.eyebrow} numberOfLines={1}>{slide.eyebrow}</Text>
              <Text style={styles.title} numberOfLines={2}>{slide.title}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>{slide.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <View style={styles.dots}>
          {slides.map((slide, i) => (
            <View key={slide.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  slide: {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    marginLeft: spacing.xl,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: colors.gray[100],
  },
  image: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 20, 15, 0.32)',
  },
  textBlock: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  eyebrow: {
    ...typography.overline,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  title: {
    ...typography.h5,
    color: colors.white,
    marginBottom: 2,
  },
  subtitle: {
    ...typography.body2,
    color: 'rgba(255,255,255,0.9)',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray[300],
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.primary[500],
  },
});

export default HeroCarousel;
