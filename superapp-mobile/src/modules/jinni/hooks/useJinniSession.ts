import { useCallback, useRef } from 'react';
import { useJinniStore } from '../store/jinniStore';
import { useWishStatus } from './useWishStatus';
import { JinniContext, TranscriptTurn } from '../types';
import { jinniService } from '../services/jinniService';
import { interpretWish } from '../services/interpretService';
import {
  getPhrase,
  greetingKey,
  successKey,
} from '../services/jinniPhrases';
import { useCartStore } from '@modules/cart/store/cartStore';
import { speakJinniPhrase } from '../services/speakPhrase';
import { nextId } from '../services/idGen';
import { buildCartLines } from '../services/cartMapping';

/**
 * End-to-end Jinni session:
 * open → entrance → listening (wait) → submitWish → thinking → results
 * → addToCart → complete wish → success phrase (pehli/dusri/aakhri)
 */
export const useJinniSession = () => {
  const scene = useJinniStore((s) => s.scene);
  const context = useJinniStore((s) => s.context);
  const transcript = useJinniStore((s) => s.transcript);
  const proposedItems = useJinniStore((s) => s.proposedItems);
  const lastMessage = useJinniStore((s) => s.lastMessage);
  const openSession = useJinniStore((s) => s.openSession);
  const setScene = useJinniStore((s) => s.setScene);
  const closeSession = useJinniStore((s) => s.closeSession);
  const pushTranscript = useJinniStore((s) => s.pushTranscript);
  const setProposedItems = useJinniStore((s) => s.setProposedItems);
  const updateItemQty = useJinniStore((s) => s.updateItemQty);
  const removeProposedItem = useJinniStore((s) => s.removeProposedItem);
  const setLastMessage = useJinniStore((s) => s.setLastMessage);
  const setWishStatus = useJinniStore((s) => s.setWishStatus);
  const { isExhausted, remaining, limit, used, refresh } = useWishStatus();
  const sessionIdRef = useRef<string | null>(null);
  const addItem = useCartStore((s) => s.addItem);
  const forceAddItem = useCartStore((s) => s.forceAddItem);

  const open = useCallback(
    async (source: JinniContext['source'], extra?: Partial<JinniContext>) => {
      if (isExhausted) {
        // Prompt.txt section E: "display the limit message and play the
        // existing mapped WAV if available. Never crash when the file
        // is missing." speakJinniPhrase already falls back to TTS (or
        // silently no-ops on failure) when no WAV is bundled yet.
        const text = getPhrase('exhausted');
        setLastMessage(text);
        setScene('exhausted');
        speakJinniPhrase('exhausted', text, { force: true });
        return;
      }

      try {
        const { sessionId } = await jinniService.startSession();
        sessionIdRef.current = sessionId;
      } catch (e: any) {
        if (e?.response?.status === 429) {
          // Server-side daily cap hit (race with another device/tab, or
          // local status was stale) — the backend is the source of truth.
          const text = getPhrase('exhausted');
          setLastMessage(text);
          setScene('exhausted');
          speakJinniPhrase('exhausted', text, { force: true });
          if (refresh) refresh();
          return;
        }
        sessionIdRef.current = `local_${Date.now()}`;
      }

      openSession({ source, ...extra });
      // Greeting after arrive — push when listening starts is handled in overlay effect
    },
    [isExhausted, openSession, setLastMessage, setScene, refresh]
  );

  const speakGreeting = useCallback(() => {
    const key = greetingKey(used);
    const text = getPhrase(key);
    setLastMessage(text);
    pushTranscript({ id: nextId('chirag_greet'), role: 'chirag', text });
    speakJinniPhrase(key, text, { force: true });
  }, [used, setLastMessage, pushTranscript]);

  const dismiss = useCallback(async () => {
    if (
      scene === 'listening' ||
      scene === 'summoning' ||
      scene === 'arriving' ||
      scene === 'tap' ||
      scene === 'results'
    ) {
      if (sessionIdRef.current) {
        try {
          await jinniService.cancelSession(sessionIdRef.current);
        } catch {
          /* */
        }
        sessionIdRef.current = null;
      }
      if (scene === 'listening' || scene === 'results') {
        pushTranscript({
          id: nextId('chirag_cancel'),
          role: 'chirag',
          text: getPhrase('cancel'),
        });
      }
      setScene('dismissing');
      return;
    }
    if (scene === 'thinking' || scene === 'speaking') {
      setScene('dismissing');
      return;
    }
    if (scene !== 'idle') closeSession();
  }, [scene, setScene, closeSession, pushTranscript]);

  const submitWish = useCallback(
    async (heardText: string) => {
      const text = heardText.trim();
      if (!text) return;
      if (scene !== 'listening' && scene !== 'results') return;

      pushTranscript({ id: nextId('user'), role: 'user', text });
      setScene('thinking');
      const think = getPhrase('thinking');
      setLastMessage(think);
      setProposedItems([]);
      speakJinniPhrase('thinking', think, { force: true });

      try {
        const result = await interpretWish(text, {
          restaurantName: context?.restaurantName,
          sessionId: sessionIdRef.current,
        });
        // The displayed message may legitimately contain a dynamic
        // restaurant/product name (text only, per Prompt.txt B — "Do not
        // speak product names, prices, dynamic answers or order
        // details"), so what's *spoken* is always a fixed phrase chosen
        // by outcome shape, never result.message itself.
        pushTranscript({
          id: nextId('chirag'),
          role: 'chirag',
          text: result.message,
        });
        setLastMessage(result.message);
        setProposedItems(result.items);
        const spokenKey =
          result.empty && result.items.length === 0
            ? 'empty_items'
            : result.partial
            ? 'partial_items'
            : 'found_items';
        speakJinniPhrase(spokenKey, getPhrase(spokenKey), { force: true });
        setScene(result.empty && result.items.length === 0 ? 'listening' : 'results');
      } catch {
        const err = getPhrase('error');
        pushTranscript({ id: nextId('chirag_err'), role: 'chirag', text: err });
        setLastMessage(err);
        speakJinniPhrase('error', err, { force: true });
        setScene('listening');
      }
    },
    [
      scene,
      pushTranscript,
      setScene,
      setLastMessage,
      setProposedItems,
      context,
    ]
  );

  const confirmAddToCart = useCallback(async () => {
    const built = buildCartLines(proposedItems);
    if (!built) return;
    const { moduleType, lines } = built;

    // If cart already has another source in this module, clear that
    // module first (addItem signals via {ok:false}; forceAddItem does
    // the actual override) — same cross-source-switch behavior as
    // before, just reading from the pre-built, testable line list.
    for (const { line, meta } of lines) {
      const result = addItem(line, moduleType, meta);
      if (!result.ok) {
        forceAddItem(line, moduleType, meta);
      }
    }

    if (sessionIdRef.current) {
      try {
        await jinniService.completeSession(sessionIdRef.current);
      } catch {
        /* */
      }
      sessionIdRef.current = null;
    }

    const newUsed = Math.min(used + 1, limit);
    setWishStatus({ used: newUsed });
    if (refresh) refresh();

    const key = successKey(newUsed);
    const phrase = getPhrase(key);
    pushTranscript({ id: nextId('chirag_ok'), role: 'chirag', text: phrase });
    setLastMessage(phrase);
    setProposedItems([]);
    setScene('success');
    speakJinniPhrase(key, phrase, { force: true });
  }, [
    proposedItems,
    addItem,
    forceAddItem,
    used,
    limit,
    setWishStatus,
    refresh,
    pushTranscript,
    setLastMessage,
    setProposedItems,
    setScene,
  ]);

  return {
    scene,
    context,
    transcript,
    proposedItems,
    lastMessage,
    wishes: { used, limit, remaining, isExhausted },
    open,
    dismiss,
    submitWish,
    speakGreeting,
    confirmAddToCart,
    updateItemQty,
    removeProposedItem,
    simulateUserFinishedSpeaking: submitWish,
  };
};

export default useJinniSession;
