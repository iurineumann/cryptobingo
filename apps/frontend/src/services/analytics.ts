import { API_BASE } from '@/config/env';

let adblockDetected = false;

export function setAdblockDetected(v: boolean): void {
  adblockDetected = v;
}

export function getClientId(): string {
  try {
    const match = document.cookie.match(/(?:^|; )_cb_cid=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    const id = (crypto.randomUUID && crypto.randomUUID()) || Date.now().toString(36);
    document.cookie = `_cb_cid=${id}; Path=/; Max-Age=34214400; SameSite=Lax`;
    return id;
  } catch {
    return 'cryptobingo-anon';
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  try {
    const enriched: Record<string, unknown> = { ...(params || {}) };
    const useProxy = adblockDetected && navigator.onLine;

    if (useProxy) {
      enriched.client_id = getClientId();
      fetch(`${API_BASE}/analytics/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, params: enriched }),
        keepalive: true,
      }).catch(() => {});
    } else if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
  } catch {
    // silencioso — nunca quebrar UX por analytics
  }
}
