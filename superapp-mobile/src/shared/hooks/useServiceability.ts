import { useEffect, useRef, useState } from 'react';
import { api } from '@services/api';

export type ServiceabilityState =
  /** pincode incomplete — nothing to check yet */
  | 'idle'
  | 'checking'
  | 'ok'
  | 'unserviceable'
  /** check failed (offline / server error): never block the customer on it —
   *  the backend re-checks authoritatively when the order is placed. */
  | 'unknown';

type Response = { serviceable: boolean; message?: string };

const PINCODE_RE = /^\d{6}$/;

/**
 * Pre-checks whether anything can deliver to `pincode` (Jinni broadcasts to open
 * stores rather than pre-assigning one, so this asks "is any open store covering
 * this pincode"). Debounced, and stale responses are discarded so rapidly editing
 * the pincode can never leave the UI showing a previous pincode's verdict.
 */
export function useServiceability(pincode: string, orderType: 'grocery' | 'food' = 'grocery') {
  const [state, setState] = useState<ServiceabilityState>('idle');
  const [message, setMessage] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    if (!PINCODE_RE.test(pincode)) {
      seq.current += 1; // invalidate any in-flight request
      setState('idle');
      setMessage('');
      return;
    }
    const mine = ++seq.current;
    setState('checking');
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<Response>('/orders/serviceability', {
          params: { pincode, order_type: orderType },
        });
        if (mine !== seq.current) return;
        setState(res.serviceable ? 'ok' : 'unserviceable');
        setMessage(res.message || '');
      } catch {
        if (mine !== seq.current) return;
        setState('unknown');
        setMessage('');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [pincode, orderType]);

  return { state, message, blocked: state === 'unserviceable' };
}
