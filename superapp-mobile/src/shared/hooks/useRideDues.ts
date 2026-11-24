import { useEffect, useState } from 'react';
import { api } from '@services/api';

export type RideDue = { ride_number: string; fee: number; route: string; date: string | null };

/** Outstanding ride-cancellation charges. The server adds them to the next ride/order total; this is only for display. */
export function useRideDues() {
  const [state, setState] = useState<{ total: number; items: RideDue[]; info: string }>({ total: 0, items: [], info: '' });
  useEffect(() => {
    let alive = true;
    api.get<any>('/rides/dues')
      .then((d) => alive && setState({ total: Number(d.total) || 0, items: d.items || [], info: d.info || '' }))
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return state;
}
