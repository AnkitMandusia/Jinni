import { create } from 'zustand';
import {
  ChiragScene,
  JinniContext,
  TranscriptTurn,
  WishStatus,
  ProposedItem,
} from '../types';

interface JinniStoreState {
  scene: ChiragScene;
  context: JinniContext | null;
  transcript: TranscriptTurn[];
  wishStatus: WishStatus;
  proposedItems: ProposedItem[];
  lastMessage: string;

  openSession: (context: JinniContext) => void;
  setScene: (scene: ChiragScene) => void;
  pushTranscript: (turn: TranscriptTurn) => void;
  setProposedItems: (items: ProposedItem[]) => void;
  updateItemQty: (id: string, quantity: number) => void;
  removeProposedItem: (id: string) => void;
  setLastMessage: (msg: string) => void;
  closeSession: () => void;
  setWishStatus: (status: Partial<WishStatus>) => void;
}

const DEFAULT_WISH_STATUS: WishStatus = { used: 0, limit: 3, resetsAt: null };

export const useJinniStore = create<JinniStoreState>((set) => ({
  scene: 'idle',
  context: null,
  transcript: [],
  wishStatus: DEFAULT_WISH_STATUS,
  proposedItems: [],
  lastMessage: '',

  openSession: (context) =>
    set({
      scene: 'tap',
      context,
      transcript: [],
      proposedItems: [],
      lastMessage: '',
    }),

  setScene: (scene) => set({ scene }),

  pushTranscript: (turn) =>
    set((state) => ({ transcript: [...state.transcript, turn] })),

  setProposedItems: (items) => set({ proposedItems: items }),

  updateItemQty: (id, quantity) =>
    set((state) => ({
      proposedItems: state.proposedItems.map((i) =>
        i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i
      ),
    })),

  removeProposedItem: (id) =>
    set((state) => ({
      proposedItems: state.proposedItems.filter((i) => i.id !== id),
    })),

  setLastMessage: (msg) => set({ lastMessage: msg }),

  closeSession: () =>
    set({
      scene: 'idle',
      context: null,
      proposedItems: [],
      lastMessage: '',
    }),

  setWishStatus: (status) =>
    set((state) => ({ wishStatus: { ...state.wishStatus, ...status } })),
}));

export default useJinniStore;
