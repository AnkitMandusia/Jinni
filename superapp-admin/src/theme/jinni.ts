/** Jinni palette — same purple + champagne-gold as the mobile app (superapp-mobile/src/shared/theme/jinni.ts). */
export const J = {
  p50: '#F4F0FC', p100: '#E6DBF8', p200: '#CBB4F0', p300: '#A77EE3', p400: '#7E4FD1', p500: '#5E2FB8', p600: '#4A2294', p700: '#391A73', p800: '#2A1354', p900: '#1A0C35',
  g50: '#FDF8EC', g100: '#FAEEC9', g200: '#F3DD96', g300: '#E9C45E', g400: '#DDA935', g500: '#C9971A', g600: '#A87A12',
  ok: '#12805C', warn: '#B54708', bad: '#B42318', ink: '#1D1433', mute: '#6B6482',
};
export const inr = (n: number | string | null | undefined) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
export const when = (d?: string | null) => (d ? new Date(d.endsWith('Z') || d.includes('+') ? d : d + 'Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const STATUS_COLOR: Record<string, string> = {
  pending_dispatch: 'gold', store_accepted: 'blue', preparing: 'blue', ready_for_pickup: 'cyan', delivery_assigned: 'purple', picked_up: 'purple',
  in_transit: 'purple', delivered: 'green', completed: 'green', cancelled: 'red', rejected: 'red', no_store_available: 'volcano',
};
export const PAY_COLOR: Record<string, string> = { paid: 'green', pending: 'gold', refund_pending: 'orange', refunded: 'blue', failed: 'red' };
