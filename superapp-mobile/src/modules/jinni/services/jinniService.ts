/**
 * Jinni API client — Developer Spec section 10.
 * Uses shared api client when available; falls back to local mock offline.
 */
import { WishStatus } from '../types';
import type { InterpretResult } from '../types';

const MOCK_LIMIT = 3;

export interface BackendInterpretResponse {
  intent: string;
  items: Array<{
    id: string;
    product_id?: string;
    name: string;
    price: number;
    unit?: string;
    image_url?: string | null;
    available: boolean;
    unavailable_reason?: string | null;
    module_type: 'food' | 'grocery';
    restaurant_id?: string;
    restaurant_name?: string | null;
  }>;
  message: string;
  partial: boolean;
  empty: boolean;
  used_gemini: boolean;
  confidence: number;
  quantity: number;
}

type ApiModule = { api: { get: Function; post: Function } };

async function getApi(): Promise<ApiModule['api'] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@services/api');
    return mod.api || mod.default || null;
  } catch {
    return null;
  }
}

export const jinniService = {
  async getStatus(): Promise<WishStatus> {
    const api = await getApi();
    if (api) {
      try {
        const res = await api.get('/jinni/status');
        const d = res.data || res;
        return {
          used: d.used ?? 0,
          limit: d.limit ?? MOCK_LIMIT,
          resetsAt: d.resets_at ?? null,
        };
      } catch {
        /* fall through */
      }
    }
    return { used: 0, limit: MOCK_LIMIT, resetsAt: null };
  },

  async startSession(): Promise<{ sessionId: string }> {
    const api = await getApi();
    if (api) {
      try {
        const res = await api.post('/jinni/session/start', {});
        const d = res.data || res;
        return { sessionId: d.session_id || d.sessionId };
      } catch (e: any) {
        if (e?.response?.status === 429) throw e;
      }
    }
    return { sessionId: `mock_${Date.now()}` };
  },

  async completeSession(sessionId: string): Promise<void> {
    const api = await getApi();
    if (api) {
      try {
        await api.post('/jinni/session/complete', { session_id: sessionId });
      } catch {
        /* ignore offline */
      }
    }
  },

  async cancelSession(sessionId: string): Promise<void> {
    const api = await getApi();
    if (api) {
      try {
        await api.post('/jinni/session/cancel', { session_id: sessionId });
      } catch {
        /* ignore */
      }
    }
  },

  /**
   * Prompt.txt section C/D — always goes through the backend, which
   * re-validates confidence server-side, only spends Gemini budget
   * when genuinely needed, and returns items straight from the real
   * grocery/food database. `clientConfidence` is a hint only.
   */
  async interpret(
    text: string,
    opts: {
      restaurantName?: string;
      sessionId?: string | null;
      clientConfidence?: number;
    } = {}
  ): Promise<BackendInterpretResponse> {
    const api = await getApi();
    if (!api) {
      throw new Error('jinni_api_unavailable');
    }
    const res = await api.post('/jinni/interpret', {
      text,
      restaurant_name: opts.restaurantName,
      session_id: opts.sessionId ?? null,
      client_confidence: opts.clientConfidence,
    });
    return (res.data || res) as BackendInterpretResponse;
  },
};

export default jinniService;
