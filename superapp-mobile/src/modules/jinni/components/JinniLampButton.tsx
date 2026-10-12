import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { jinniColors } from '@theme/jinni';
import { colors } from '@theme/colors';
import { fontFamily } from '@theme/typography';

import { WishCounterBadge } from './WishCounterBadge';
import { MagicLampIcon } from './MagicLampIcon';

interface JinniLampButtonProps { onPress: () => void; used: number; limit: number; isExhausted: boolean; }
const AView = Animated.View;

/** Compact floating signature-lamp tab. No oversized mug/circle: the same
 * engraved Jinni mark used in the brand header gets a small smoke-and-orbit animation. */
export const JinniLampButton: React.FC<JinniLampButtonProps> = ({ onPress, used, limit, isExhausted }) => {
  const breathe = useSharedValue(0.3);
  const pressScale = useSharedValue(1);
  const orbit = useSharedValue(0);
  useEffect(() => {
    if (isExhausted) { breathe.value = withTiming(.06,{duration:250}); orbit.value = withTiming(0,{duration:250}); return; }
    breathe.value = withRepeat(withSequence(withTiming(.8,{duration:1700,easing:Easing.inOut(Easing.sin)}),withTiming(.24,{duration:1700,easing:Easing.inOut(Easing.sin)})),-1,true);
    orbit.value = withRepeat(withTiming(1,{duration:4200,easing:Easing.linear}),-1,false);
  }, [isExhausted,breathe,orbit]);
  const glowStyle = useAnimatedStyle(() => ({ opacity:breathe.value, transform:[{scale: .88 + breathe.value*.22}] }));
  const iconStyle = useAnimatedStyle(() => ({ transform:[{scale:pressScale.value}] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform:[{rotate:`${orbit.value*360}deg`}] }));
  const pressIn = () => { pressScale.value = withSpring(.88,{damping:8,stiffness:260}); };
  const pressOut = () => { pressScale.value = withSpring(1,{damping:7,stiffness:230}); };
  return <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} hitSlop={12} style={styles.wrapper}
    accessibilityRole="button" accessibilityLabel={isExhausted ? 'Jinni — wishes used up for today' : 'Open Jinni, tap the magic lamp'}>
    <AView pointerEvents="none" style={[styles.glow,glowStyle]} />
    <AView pointerEvents="none" style={[styles.orbit,orbitStyle]}><View style={styles.orbitSpark} /></AView>
    <AView style={[styles.iconWrap,iconStyle]}>
      <MagicLampIcon size={45} animated={!isExhausted} exhausted={isExhausted} />
      {isExhausted && <WishCounterBadge used={used} limit={limit} exhausted />}
    </AView>
    <Text style={[styles.label,{color:isExhausted ? colors.gray[400] : jinniColors.purple[700]}]}>Jinni</Text>
  </Pressable>;
};
const styles = StyleSheet.create({
  wrapper:{ alignItems:'center',justifyContent:'center',top:-10,minWidth:64,height:64 },
  glow:{ position:'absolute',top:2,width:48,height:48,borderRadius:24,backgroundColor:'#F6C96A' },
  orbit:{ position:'absolute',top:3,width:52,height:52,borderRadius:26,borderWidth:1,borderColor:'rgba(226,174,74,0.48)',borderStyle:'dashed' },
  orbitSpark:{ position:'absolute',top:2,right:7,width:4,height:4,borderRadius:2,backgroundColor:'#FFF0B1' },
  iconWrap:{ width:54,height:48,alignItems:'center',justifyContent:'center' },
  label:{ marginTop:-1,fontSize:10,fontFamily: fontFamily.bold,letterSpacing:.25 },
});
export default JinniLampButton;
