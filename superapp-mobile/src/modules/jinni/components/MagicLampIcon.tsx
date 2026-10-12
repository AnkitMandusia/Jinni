import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Path, Ellipse, Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
export type MagicLampSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
interface MagicLampIconProps { size?: MagicLampSize | number; animated?: boolean; exhausted?: boolean; color?: string; }
const SIZE_MAP: Record<MagicLampSize, number> = { xs: 18, sm: 24, md: 32, lg: 48, xl: 72 };

/** Jinni signature mark: a low, elongated engraved brass lamp with a long spout,
 * curled handle, fine metal highlights and a rising ribbon of magical smoke.
 * Designed as vector geometry so it stays crisp at tab-bar and header sizes. */
export const MagicLampIcon: React.FC<MagicLampIconProps> = ({ size='md', animated=false, exhausted=false, color }) => {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const pulse = useSharedValue(0.55);
  const smoke = useSharedValue(0.58);
  useEffect(() => {
    if (!animated || exhausted) { pulse.value = exhausted ? 0 : 0.55; smoke.value = exhausted ? 0.12 : 0.58; return; }
    pulse.value = withRepeat(withSequence(withTiming(1,{duration:900,easing:Easing.inOut(Easing.sin)}),withTiming(.42,{duration:900,easing:Easing.inOut(Easing.sin)})),-1,true);
    smoke.value = withRepeat(withSequence(withTiming(1,{duration:1500,easing:Easing.inOut(Easing.sin)}),withTiming(.35,{duration:1500,easing:Easing.inOut(Easing.sin)})),-1,true);
  }, [animated, exhausted, pulse, smoke]);
  const glowProps = useAnimatedProps(() => ({ opacity: pulse.value * .42 }));
  const smokeProps = useAnimatedProps(() => ({ opacity: smoke.value }));
  const main = exhausted ? '#aaa39a' : color || '#DDA83D';
  const light = exhausted ? '#d2cdc4' : '#FFF0B1';
  const dark = exhausted ? '#807a72' : '#754313';
  return <View style={{width:px,height:px}}>
    <Svg width={px} height={px} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="jinniMetal" x1="0%" y1="0%" x2="85%" y2="100%">
          <Stop offset="0%" stopColor={light}/><Stop offset="18%" stopColor="#B87522"/><Stop offset="34%" stopColor="#FFE6A0"/>
          <Stop offset="53%" stopColor={main}/><Stop offset="72%" stopColor={dark}/><Stop offset="88%" stopColor="#F6CE70"/><Stop offset="100%" stopColor="#8A4E16"/>
        </LinearGradient>
        <LinearGradient id="jinniSmoke" x1="0%" y1="100%" x2="90%" y2="0%">
          <Stop offset="0%" stopColor="#F4B848" stopOpacity=".05"/><Stop offset="48%" stopColor="#FFD56E"/><Stop offset="75%" stopColor="#FFF8D6"/><Stop offset="100%" stopColor="#F3B944" stopOpacity=".12"/>
        </LinearGradient>
        <LinearGradient id="jinniFire" x1="0%" y1="100%" x2="0%" y2="0%">
          <Stop offset="0%" stopColor="#F29A24"/><Stop offset="65%" stopColor="#FFE18A"/><Stop offset="100%" stopColor="#FFFFFF"/>
        </LinearGradient>
      </Defs>
      {!exhausted && <AnimatedEllipse cx="48" cy="86" rx="31" ry="4" fill={main} animatedProps={glowProps}/>}
      {/* smoke ribbon rising from the spout */}
      {!exhausted && <G>
        <AnimatedPath d="M77 43 C91 34 91 26 82 23 C72 20 67 29 73 33 C81 38 91 28 87 19 C84 12 91 9 94 5" fill="none" stroke="#B87627" strokeWidth="8" strokeLinecap="round" opacity=".28" animatedProps={smokeProps}/>
        <AnimatedPath d="M77 43 C91 34 91 26 82 23 C72 20 67 29 73 33 C81 38 91 28 87 19 C84 12 91 9 94 5" fill="none" stroke="url(#jinniSmoke)" strokeWidth="4.2" strokeLinecap="round" animatedProps={smokeProps}/>
        <AnimatedPath d="M78 41 C87 34 87 28 81 25 C76 23 73 29 77 32 C83 35 89 28 86 20" fill="none" stroke="#FFF6D0" strokeWidth=".9" strokeLinecap="round" animatedProps={smokeProps}/>
        <AnimatedCircle cx="91" cy="13" r="1.7" fill="#FFF0A5" animatedProps={glowProps}/>
        <Path d="M78 11 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5Z" fill="#FFF0B0" opacity={exhausted ? 0 : .9}/>
      </G>}
      {/* curled handle at left */}
      <Path d="M31 57 C20 57 14 51 15 43 C16 34 27 32 32 38 C36 43 32 49 27 48 C23 47 24 42 27 42" fill="none" stroke={dark} strokeWidth="8" strokeLinecap="round"/>
      <Path d="M31 57 C20 57 14 51 15 43 C16 34 27 32 32 38 C36 43 32 49 27 48 C23 47 24 42 27 42" fill="none" stroke="url(#jinniMetal)" strokeWidth="5.3" strokeLinecap="round"/>
      <Path d="M28 55 C19 52 17 45 20 40" fill="none" stroke={light} strokeWidth=".8" opacity=".85"/>
      {/* lamp bowl and long upturned spout */}
      <Path d="M28 53 C33 47 43 45 53 48 C60 50 65 48 72 44 L84 36 C87 34 91 35 95 32 C91 39 84 45 77 49 C68 55 64 62 53 65 C41 68 30 63 28 53Z" fill="url(#jinniMetal)" stroke={light} strokeWidth=".8"/>
      <Path d="M32 54 C42 60 54 60 64 54 C72 50 81 42 91 35" fill="none" stroke={light} strokeWidth="1.25" strokeLinecap="round" opacity=".92"/>
      <Path d="M34 58 Q48 65 62 57" fill="none" stroke={dark} strokeWidth="1.1"/>
      {/* engraved band */}
      <Path d="M32 52 Q49 57 68 50" fill="none" stroke={dark} strokeWidth="1.3"/>
      <Path d="M35 52 q2 -3 4 0 t4 0 t4 0 t4 0 t4 0 t4 0 t4 0" fill="none" stroke={light} strokeWidth=".85"/>
      {/* domed lid, collar and finial */}
      <Path d="M39 48 Q49 42 60 48 L57 51 Q49 54 42 51Z" fill="url(#jinniMetal)" stroke={light} strokeWidth=".7"/>
      <Path d="M42 46 C42 40 46 37 49 37 C53 37 57 40 57 46Z" fill="url(#jinniMetal)" stroke={light} strokeWidth=".8"/>
      <Path d="M49 37 C43 32 47 27 49 24 C53 29 56 33 49 37Z" fill="url(#jinniFire)" stroke={light} strokeWidth=".7"/>
      <Path d="M49 27 Q47 32 49 34" fill="none" stroke="#FFFCE8" strokeWidth=".9"/>
      {/* foot */}
      <Path d="M43 65 L42 70 Q49 73 57 70 L56 64Z" fill="url(#jinniMetal)" stroke={light} strokeWidth=".7"/>
      <Path d="M36 70 Q49 74 63 70 L67 76 Q49 81 32 76Z" fill="url(#jinniMetal)" stroke={light} strokeWidth=".8"/>
      <Ellipse cx="49" cy="77" rx="17" ry="3" fill="url(#jinniMetal)" stroke={light} strokeWidth=".7"/>
      <Ellipse cx="49" cy="76.5" rx="12" ry="1.1" fill="none" stroke={light} strokeWidth=".6" opacity=".8"/>
      <Path d="M33 63 Q49 70 65 63" fill="none" stroke={light} strokeWidth=".65" opacity=".65"/>
    </Svg>
  </View>;
};
export default MagicLampIcon;
