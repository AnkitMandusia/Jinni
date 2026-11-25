import React from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { jinniColors } from '@theme/jinni';

/** Small ⓘ next to any total / charge. Tap to see WHY the amount is what it is. */
export const InfoTip: React.FC<{ title: string; message: string; color?: string; size?: number }> = ({
  title, message, color = jinniColors.purple[400], size = 16,
}) => (
  <TouchableOpacity onPress={() => Alert.alert(title, message)} hitSlop={10} style={styles.btn} accessibilityLabel={`Why? ${title}`}>
    <Ionicons name="information-circle-outline" size={size} color={color} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({ btn: { marginLeft: 4, justifyContent: 'center' } });
export default InfoTip;
