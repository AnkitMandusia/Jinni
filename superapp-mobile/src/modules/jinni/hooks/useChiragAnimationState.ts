import { useEffect, useRef } from 'react';
import { useJinniStore } from '../store/jinniStore';
import { ChiragScene } from '../types';

/** Entrance only — listening/results wait for user. */
const ENTRANCE: Partial<Record<ChiragScene, { next: ChiragScene; ms: number }>> = {
  tap: { next: 'summoning', ms: 150 },
  summoning: { next: 'arriving', ms: 500 },
  arriving: { next: 'listening', ms: 700 },
};

const EXIT: Partial<Record<ChiragScene, { next: ChiragScene; ms: number }>> = {
  success: { next: 'dismissing', ms: 2200 },
  dismissing: { next: 'idle', ms: 550 },
};

export const useChiragAnimationState = () => {
  const scene = useJinniStore((s) => s.scene);
  const setScene = useJinniStore((s) => s.setScene);
  const closeSession = useJinniStore((s) => s.closeSession);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const entrance = ENTRANCE[scene];
    if (entrance) {
      timer.current = setTimeout(() => setScene(entrance.next), entrance.ms);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }

    const exit = EXIT[scene];
    if (exit) {
      timer.current = setTimeout(() => {
        if (exit.next === 'idle') closeSession();
        else setScene(exit.next);
      }, exit.ms);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [scene, setScene, closeSession]);

  return { scene };
};

export default useChiragAnimationState;
