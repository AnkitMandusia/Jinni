import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  Ellipse,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import { jinniColors } from '@theme/jinni';

interface ChiragGenieFigureProps {
  size?: number;
  /** listening | thinking | speaking | success | default */
  mood?: 'listening' | 'thinking' | 'speaking' | 'success' | 'default';
}

/**
 * Vector stand-in for Chirag (the genie) — code-drawn so the app ships
 * a premium silhouette without waiting on Lottie/Rive assets.
 * When real character art is ready, swap this component inside
 * ChiragAnimationStage without changing the scene state machine.
 */
export const ChiragGenieFigure: React.FC<ChiragGenieFigureProps> = ({
  size = 100,
  mood = 'default',
}) => {
  const skin = '#C4A8E8';
  const skinDark = '#9B7BC8';
  const skinLight = '#E2D4F5';
  const gold = jinniColors.gold[500];
  const goldLight = jinniColors.gold[200];

  // Eye openness by mood
  const eyeOpen = mood === 'thinking' ? 0.55 : mood === 'success' ? 1.15 : 1;

  return (
    <View style={{ width: size, height: size * 1.15 }}>
      <Svg width={size} height={size * 1.15} viewBox="0 0 100 115">
        <Defs>
          <LinearGradient id="skinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={skinLight} />
            <Stop offset="50%" stopColor={skin} />
            <Stop offset="100%" stopColor={skinDark} />
          </LinearGradient>
          <LinearGradient id="turbanGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={jinniColors.purple[400]} />
            <Stop offset="100%" stopColor={jinniColors.purple[700]} />
          </LinearGradient>
          <LinearGradient id="sashGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor={goldLight} />
            <Stop offset="100%" stopColor={gold} />
          </LinearGradient>
        </Defs>

        {/* Smoke trail under torso (genie lower half dissolves into smoke) */}
        <Ellipse cx={50} cy={105} rx={28} ry={8} fill={jinniColors.gold[100]} opacity={0.5} />
        <Path
          d="M30 88 Q40 100 50 95 Q60 100 70 88 Q55 98 50 102 Q45 98 30 88 Z"
          fill={skin}
          opacity={0.35}
        />

        {/* Torso / vest */}
        <Path
          d="M28 55
             C22 62, 24 78, 32 88
             Q50 98 68 88
             C76 78, 78 62, 72 55
             Q50 62 28 55 Z"
          fill="url(#skinGrad)"
        />
        {/* Vest / open chest */}
        <Path
          d="M38 58 Q50 68 62 58 L60 82 Q50 88 40 82 Z"
          fill={jinniColors.purple[600]}
          opacity={0.85}
        />
        {/* Gold sash */}
        <Path
          d="M32 72 Q50 68 68 72"
          stroke="url(#sashGrad)"
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
        />

        {/* Arms — slightly raised in welcoming pose */}
        <Path
          d="M28 58 C12 48, 8 38, 14 32 C18 28, 24 32, 26 38 C22 42, 24 52, 30 58"
          fill="url(#skinGrad)"
        />
        <Path
          d="M72 58 C88 48, 92 38, 86 32 C82 28, 76 32, 74 38 C78 42, 76 52, 70 58"
          fill="url(#skinGrad)"
        />
        {/* Hands */}
        <Circle cx={14} cy={31} r={5.5} fill={skin} />
        <Circle cx={86} cy={31} r={5.5} fill={skin} />

        {/* Neck */}
        <Path d="M42 48 Q50 52 58 48 L56 56 Q50 58 44 56 Z" fill={skin} />

        {/* Head */}
        <Ellipse cx={50} cy={36} rx={20} ry={22} fill="url(#skinGrad)" />

        {/* Turban */}
        <Path
          d="M30 30
             C28 18, 36 8, 50 8
             C64 8, 72 18, 70 30
             Q50 26 30 30 Z"
          fill="url(#turbanGrad)"
        />
        {/* Turban fold */}
        <Path
          d="M32 28 Q50 22 68 28"
          stroke={jinniColors.purple[800]}
          strokeWidth={1.5}
          fill="none"
          opacity={0.4}
        />
        {/* Turban jewel */}
        <Circle cx={50} cy={14} r={4} fill={gold} />
        <Circle cx={50} cy={14} r={2.2} fill={goldLight} />
        {/* Feather / plume */}
        <Path
          d="M50 10 Q54 2 58 6 Q54 8 50 10"
          fill={gold}
          opacity={0.9}
        />

        {/* Ears */}
        <Ellipse cx={30} cy={38} rx={4} ry={5.5} fill={skin} />
        <Ellipse cx={70} cy={38} rx={4} ry={5.5} fill={skin} />

        {/* Eyes */}
        <G>
          <Ellipse cx={42} cy={38} rx={5} ry={4.2 * eyeOpen} fill="#1A0C35" />
          <Ellipse cx={58} cy={38} rx={5} ry={4.2 * eyeOpen} fill="#1A0C35" />
          {/* Eye highlights */}
          <Circle cx={43.5} cy={36.5} r={1.6} fill="#FFF" opacity={0.9} />
          <Circle cx={59.5} cy={36.5} r={1.6} fill="#FFF" opacity={0.9} />
        </G>

        {/* Brows */}
        <Path
          d="M36 32 Q42 29 48 32"
          stroke={jinniColors.purple[800]}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d="M52 32 Q58 29 64 32"
          stroke={jinniColors.purple[800]}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
        />

        {/* Nose */}
        <Path
          d="M50 40 Q48 44 50 46 Q52 44 50 40"
          fill={skinDark}
          opacity={0.5}
        />

        {/* Smile — warmer on success / speaking */}
        <Path
          d={
            mood === 'success' || mood === 'speaking'
              ? 'M42 50 Q50 58 58 50'
              : mood === 'thinking'
                ? 'M44 52 Q50 50 56 52'
                : 'M43 51 Q50 56 57 51'
          }
          stroke={jinniColors.purple[800]}
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />

        {/* Earrings */}
        <Circle cx={30} cy={44} r={2} fill={gold} />
        <Circle cx={70} cy={44} r={2} fill={gold} />
      </Svg>
    </View>
  );
};

export default ChiragGenieFigure;
