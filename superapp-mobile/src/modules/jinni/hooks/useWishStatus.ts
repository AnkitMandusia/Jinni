import { useCallback, useEffect } from 'react';
import { useJinniStore } from '../store/jinniStore';
import { jinniService } from '../services/jinniService';

/**
 * Wish-counter status, per spec section 4.2 ("3/3" exhausted indicator).
 * Backed by a mock service until `/jinni/status` exists — the polling
 * shape is kept so swapping in the real endpoint is a one-line change.
 */
export const useWishStatus = () => {
  const wishStatus = useJinniStore((s) => s.wishStatus);
  const setWishStatus = useJinniStore((s) => s.setWishStatus);

  const refresh = useCallback(() => {
    jinniService.getStatus().then(setWishStatus);
  }, [setWishStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isExhausted = wishStatus.used >= wishStatus.limit;
  const remaining = Math.max(wishStatus.limit - wishStatus.used, 0);

  return { ...wishStatus, isExhausted, remaining, refresh };
};

export default useWishStatus;
