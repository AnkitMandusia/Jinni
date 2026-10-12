import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { jinniColors } from '@theme/jinni';
import { fontFamily } from '@theme/typography';
import { spacing } from '@theme/spacing';
import { useJinniStore } from '../store/jinniStore';
import { useJinniSession } from '../hooks/useJinniSession';
import { useChiragAnimationState } from '../hooks/useChiragAnimationState';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChiragAnimationStage } from './ChiragAnimationStage';
import { ChiragWaveform } from './ChiragWaveform';
import { ProposedItemsPanel } from './ProposedItemsPanel';
import { MagicLampIcon } from './MagicLampIcon';
import { QUICK_CHIPS, wishLabel, getPhrase } from '../services/jinniPhrases';

/**
 * Full Jinni AI screen — poster style:
 * header + Chirag + chat + proposed items + mic/input
 */
export const ChiragOverlay: React.FC = () => {
  const scene = useJinniStore((s) => s.scene);
  const transcript = useJinniStore((s) => s.transcript);
  const pushTranscript = useJinniStore((s) => s.pushTranscript);
  const {
    dismiss,
    submitWish,
    speakGreeting,
    confirmAddToCart,
    updateItemQty,
    removeProposedItem,
    proposedItems,
    wishes,
  } = useJinniSession();
  useChiragAnimationState();

  const [textWish, setTextWish] = useState('');
  const greeted = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrim = useSharedValue(0);
  const sheetY = useSharedValue(60);

  const isOpen = scene !== 'idle' && scene !== 'exhausted';

  useEffect(() => {
    scrim.value = withTiming(isOpen ? 1 : 0, { duration: 320 });
    sheetY.value = isOpen
      ? withSpring(0, { damping: 18, stiffness: 140 })
      : withTiming(60, { duration: 260 });
    if (!isOpen) {
      setTextWish('');
      greeted.current = false;
    }
  }, [isOpen, scrim, sheetY]);

  // Greeting once when listening starts
  useEffect(() => {
    if (scene === 'listening' && !greeted.current) {
      greeted.current = true;
      speakGreeting();
    }
  }, [scene, speakGreeting]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [transcript, proposedItems, scene]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
    opacity: scrim.value,
  }));

  const onSend = (override?: string) => {
    if (scene !== 'listening' && scene !== 'results') return;
    const wish = (override ?? textWish).trim();
    if (!wish) {
      // Empty mic/send — do nothing (no mock burger)
      return;
    }
    setTextWish('');
    submitWish(wish);
  };

  const handleVoiceResult = (heard: string) => {
    setTextWish('');
    submitWish(heard);
  };

  const voice = useVoiceInput(handleVoiceResult);

  const onMicPress = () => {
    if (!canType) return;
    if (!voice.supported) {
      // No native STT module in this build (e.g. Expo Go) — tell the user
      // plainly instead of looking broken, and let them type instead.
      pushTranscript({
        id: `chirag_voice_note_${Date.now()}`,
        role: 'chirag',
        text:
          'Voice abhi is build me available nahi hai — niche type karke wish likho.',
      });
      return;
    }
    if (voice.state === 'listening') {
      voice.stop();
      if (textWish.trim()) onSend(textWish);
      return;
    }
    voice.start();
  };

  // Surface mic errors (permission denied, device has no recognizer, etc.)
  // as a Chirag line instead of the mic silently doing nothing.
  const lastVoiceErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (voice.state !== 'error' || !voice.error) return;
    if (lastVoiceErrorRef.current === voice.error) return;
    lastVoiceErrorRef.current = voice.error;
    const text =
      voice.error === 'permission_denied'
        ? 'Mic permission off hai — settings me se Jinni ko mic access do, ya type karo.'
        : 'Awaaz samajh nahi aayi, dobara try karo ya type karo.';
    pushTranscript({ id: `chirag_voice_err_${Date.now()}`, role: 'chirag', text });
  }, [voice.state, voice.error, pushTranscript]);

  // Mirror live partial speech into the input box so the user sees what
  // Jinni is hearing in real time, same as Google/WhatsApp mic UX.
  useEffect(() => {
    if (voice.state === 'listening' && voice.partialText) {
      setTextWish(voice.partialText);
    }
  }, [voice.partialText, voice.state]);

  const canType = scene === 'listening' || scene === 'results';

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Animated.View>

        <Animated.View style={[styles.sheetWrap, sheetStyle]}>
          <SafeAreaView edges={['top']} style={styles.safeTop}>
            <LinearGradient
              colors={['#F4F0FC', jinniColors.cream, '#FFFFFF']}
              style={styles.sheet}
            >
              {/* Header — poster: Jinni AI + wish pill */}
              <View style={styles.header}>
                <Pressable onPress={dismiss} hitSlop={12} style={styles.backBtn}>
                  <Ionicons name="chevron-back" size={24} color={jinniColors.purple[700]} />
                </Pressable>
                <View style={styles.headerCenter}>
                  <MagicLampIcon size={22} animated={scene === 'listening'} />
                  <Text style={styles.headerTitle}>Jinni AI</Text>
                  <View style={styles.betaPill}>
                    <Text style={styles.betaText}>Beta</Text>
                  </View>
                </View>
                <View style={styles.wishPill}>
                  <Text style={styles.wishPillText}>
                    {wishLabel(wishes.used, wishes.limit)}
                  </Text>
                </View>
              </View>

              <ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Chirag stage — compact once results show */}
                {(scene === 'summoning' ||
                  scene === 'arriving' ||
                  scene === 'listening' ||
                  scene === 'thinking' ||
                  scene === 'success' ||
                  scene === 'tap') && (
                  <ChiragAnimationStage scene={scene} />
                )}

                {scene === 'results' && (
                  <View style={styles.miniChirag}>
                    <MagicLampIcon size={28} animated />
                    <Text style={styles.miniLabel}>Chirag</Text>
                  </View>
                )}

                {/* Chat bubbles */}
                <View style={styles.chat}>
                  {transcript.map((t) => (
                    <View
                      key={t.id}
                      style={[
                        styles.bubble,
                        t.role === 'user' ? styles.bubbleUser : styles.bubbleChirag,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bubbleText,
                          t.role === 'user' && styles.bubbleTextUser,
                        ]}
                      >
                        {t.text}
                      </Text>
                    </View>
                  ))}
                </View>

                {scene === 'thinking' && (
                  <View style={styles.thinkingRow}>
                    <ActivityIndicator color={jinniColors.purple[500]} size="small" />
                    <Text style={styles.thinkingText}>{getPhrase('thinking')}</Text>
                  </View>
                )}

                {/* Quick chips — only early listening */}
                {scene === 'listening' && transcript.length <= 1 && (
                  <View style={styles.chips}>
                    {QUICK_CHIPS.map((c) => (
                      <Pressable
                        key={c.id}
                        style={styles.chip}
                        onPress={() => onSend(c.query)}
                      >
                        <Text style={styles.chipText}>{c.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Proposed items — poster "Yeh items mil gaye" */}
                {(scene === 'results' || proposedItems.length > 0) && (
                  <ProposedItemsPanel
                    items={proposedItems}
                    onQty={updateItemQty}
                    onRemove={removeProposedItem}
                    onAddToCart={confirmAddToCart}
                  />
                )}

                {scene === 'success' && (
                  <View style={styles.successBadge}>
                    <Text style={styles.successText}>✨ Wish complete</Text>
                  </View>
                )}
              </ScrollView>

              {/* Input bar */}
              {canType && (
                <View style={styles.inputBlock}>
                  {scene === 'listening' && (
                    <View style={styles.waveRow}>
                      <ChiragWaveform active={voice.state === 'listening'} />
                    </View>
                  )}
                  <View style={styles.inputRow}>
                    <TextInput
                      style={styles.input}
                      placeholder="Wish yahan type karo (mic = send if text)"
                      placeholderTextColor={jinniColors.purple[300]}
                      value={textWish}
                      onChangeText={setTextWish}
                      onSubmitEditing={() => onSend()}
                      returnKeyType="send"
                    />
                    <Pressable
                      style={[
                        styles.micBtn,
                        voice.state === 'listening' && styles.micBtnActive,
                      ]}
                      onPress={onMicPress}
                    >
                      <Ionicons
                        name={voice.state === 'listening' ? 'mic' : 'mic-outline'}
                        size={22}
                        color="#FFF"
                      />
                    </Pressable>
                    {textWish.trim().length > 0 && (
                      <Pressable style={styles.sendBtn} onPress={() => onSend()}>
                        <Ionicons name="send" size={18} color="#FFF" />
                      </Pressable>
                    )}
                  </View>
                </View>
              )}
            </LinearGradient>
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26,12,53,0.45)',
  },
  sheetWrap: {
    flex: 1,
    marginTop: 28,
  },
  safeTop: { flex: 1 },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: jinniColors.purple[100],
  },
  backBtn: { padding: 4, width: 36 },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: jinniColors.purple[800],
    letterSpacing: 0.4,
  },
  betaPill: {
    backgroundColor: jinniColors.purple[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  betaText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: jinniColors.purple[600],
  },
  wishPill: {
    backgroundColor: jinniColors.gold[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: jinniColors.gold[300],
  },
  wishPillText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: jinniColors.gold[700],
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: 16,
  },
  miniChirag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    marginVertical: 8,
  },
  miniLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: jinniColors.purple[600],
  },
  chat: { marginTop: 8, gap: 8 },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleChirag: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: jinniColors.gold[200],
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: jinniColors.purple[600],
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: jinniColors.purple[800],
    lineHeight: 20,
  },
  bubbleTextUser: {
    color: '#FFF',
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingLeft: 4,
  },
  thinkingText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: jinniColors.purple[500],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: jinniColors.purple[200],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: jinniColors.purple[700],
  },
  successBadge: {
    alignSelf: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: jinniColors.gold[100],
  },
  successText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: jinniColors.gold[700],
  },
  inputBlock: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 14,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: jinniColors.purple[100],
    backgroundColor: '#FFF',
  },
  waveRow: { alignItems: 'center', height: 28, marginBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: jinniColors.cream,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: jinniColors.gold[300],
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: jinniColors.purple[800],
    paddingVertical: 10,
  },
  micBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: jinniColors.purple[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: '#E0434A',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: jinniColors.gold[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ChiragOverlay;
