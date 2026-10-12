import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MagicLampIcon } from '@modules/jinni/components/MagicLampIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { spacing, borderRadius } from '@theme/spacing';

interface TryJinniNudgeCardProps {
  remaining: number;
  onPress: () => void;
  onDismiss: () => void;
}

/**
 * Slim, dismissible "3 wishes left today — try Jinni" nudge (spec
 * section 4.3). Purple/gold accent scoped to this card only, not the
 * rest of Home. Shown only the first few times a user opens Home —
 * dismiss persistence is handled by the caller (CustomerHomeScreen).
 */
export const TryJinniNudgeCard: React.FC<TryJinniNudgeCardProps> = ({
  remaining,
  onPress,
  onDismiss,
}) => (
  <Pressable onPress={onPress} style={styles.wrap}>
    <LinearGradient
      colors={[jinniColors.purple[100], jinniColors.cream]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.2 }}
      style={styles.gradient}
    >
      <View style={styles.lampBadge}>
        <MagicLampIcon size={18} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {remaining} wish{remaining === 1 ? '' : 'es'} left today — try Jinni
        </Text>
        <Text style={styles.subtitle}>Tap the lamp and just ask Chirag.</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={10} style={styles.dismiss}>
        <Ionicons name="close" size={16} color={jinniColors.purple[400]} />
      </Pressable>
    </LinearGradient>
  </Pressable>
);

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: jinniColors.gold[200],
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  lampBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: jinniColors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: jinniColors.gold[300],
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: jinniColors.purple[700],
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: jinniColors.purple[400],
    marginTop: 1,
  },
  dismiss: { padding: spacing.xs },
});

export default TryJinniNudgeCard;
