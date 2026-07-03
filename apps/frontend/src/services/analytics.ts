let adblockDetected = false;

export function setAdblockDetected(v: boolean): void {
  adblockDetected = v;
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  try {
    if (adblockDetected && navigator.onLine) {
      fetch('/api/v1/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, params }),
        keepalive: true,
      }).catch(() => {});
    } else if (typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', name, params);
    }
  } catch {
    // silencioso — nunca quebrar UX por analytics
  }
}
