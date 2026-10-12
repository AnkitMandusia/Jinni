import { useEffect, useRef } from 'react';
import { API_BASE_URL, getApiToken } from '@services/api';

export interface OrderRealtimeEvent {
  event: string; // "order.delivery_status_updated" | "order.status_updated"
  eventId: string;
  orderId: string;
  status?: string;
  completionMethod?: 'otp' | 'admin_manual';
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Subscribes to the backend's order-events WebSocket for as long as the
 * calling screen is mounted, and calls `onEvent` for every message
 * concerning `orderId` (or, if orderId is omitted, every event this user
 * is authorized to receive — e.g. for an admin list screen).
 *
 * This is a push CHANNEL, not a source of truth: per requirement 8, callers
 * must still treat `onEvent` as a cue to re-fetch the authoritative order
 * state (or apply the event's own status field optimistically but keep
 * their existing polling as a safety net), never as proof by itself that
 * a delivery completed. Reconnects with simple backoff; silently gives up
 * reconnecting if the screen unmounts.
 */
export function useOrderRealtime(
  onEvent: (evt: OrderRealtimeEvent) => void,
  orderId?: string,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByCleanup = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const token = getApiToken();
      if (!token) return; // not logged in yet; screen will retry on next mount/token

      const wsBase = API_BASE_URL.replace(/^http/, 'ws');
      ws = new WebSocket(`${wsBase}/api/v1/realtime/ws?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        retryDelay = 1000; // reset backoff on a healthy connection
      };

      ws.onmessage = (msg) => {
        try {
          const data: OrderRealtimeEvent = JSON.parse(msg.data);
          if (!orderId || data.orderId === orderId) {
            onEventRef.current(data);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // onclose will fire right after; reconnect handled there.
      };

      ws.onclose = () => {
        if (closedByCleanup) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000); // cap at 30s
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [orderId]);
}
